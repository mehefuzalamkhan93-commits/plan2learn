import asyncio
from datetime import date, timedelta
from typing import Any
import httpx
import pytest
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.config import AISettings
from app.ai.contracts import (
    AIErrorType,
    AIMessage,
    AIRequest,
    AITaskType,
    MessageRole,
    PreparedAIRequest,
    ProviderHealth,
    ProviderId,
    ProviderMode,
    ProviderOutput,
)
from app.ai.errors import AIProviderError
from app.ai.router import AIProviderRouter
from app.core.database import Base, get_db
from app.main import create_app
from app.models.plan import StudyPlan, StudyPlanVersion, StudyTask
from app.models.user import User, StudentProfile
from app.services.planner_service import (
    PLANNING_DAYS,
    MAX_DAILY_STUDY_MINUTES,
    MAX_TOTAL_WORKLOAD_MINUTES,
    DAILY_BREAK_MINUTES,
    validate_study_plan_proposal,
    build_deterministic_study_plan_proposal,
)


def run(coroutine):
    return asyncio.run(coroutine)


class SyncASGITestClient:
    def __init__(self, app) -> None:
        self.app = app
        self.cookies: dict[str, str] = {}

    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        async def send_request() -> httpx.Response:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=self.app),
                base_url="http://testserver",
                cookies=self.cookies,
            ) as client:
                response = await client.request(method, path, **kwargs)
                self.cookies.update(dict(response.cookies))
                return response

        return run(send_request())

    def get(self, path: str, **kwargs) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> httpx.Response:
        return self.request("POST", path, **kwargs)


class FakeProvider:
    def __init__(self, provider_id: ProviderId, outcomes: list[object]) -> None:
        self.provider_id = provider_id
        self.outcomes = outcomes
        self.calls: list[tuple[PreparedAIRequest, str]] = []
        self.configured_model = f"{provider_id.value}-test-model"

    def missing_configuration(self) -> tuple[str, ...]:
        return ()

    def get_capabilities(self) -> tuple[str, ...]:
        return ("text_generation", "runtime_schema_validation", "health_check")

    async def generate(self, request: PreparedAIRequest, model: str) -> ProviderOutput:
        self.calls.append((request, model))
        if not self.outcomes:
            raise AIProviderError(self.provider_id, AIErrorType.PROVIDER_ERROR, "No mock outcomes", fallback_eligible=True)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return ProviderOutput(str(outcome), input_tokens=12, output_tokens=4)

    async def health_check(self, model: str | None) -> ProviderHealth:
        return ProviderHealth(self.provider_id, "healthy", model, None)


@pytest.fixture
def planner_client() -> SyncASGITestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override_get_db():
        session = testing_session()
        try:
            yield session
        finally:
            session.close()

    app = create_app(AISettings(_env_file=None))
    app.dependency_overrides[get_db] = override_get_db
    app.state.testing_engine = engine
    app.state.testing_session = testing_session
    return SyncASGITestClient(app)


def signup(client: SyncASGITestClient, email: str) -> None:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Planner Student",
            "email": email,
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert response.status_code == 201
    with client.app.state.testing_session() as db:
        user = db.query(User).filter(User.email == email).first()
        from app.core.security import create_access_token, register_or_rotate_session
        session = register_or_rotate_session(db, user.id, device_id="test-device", device_name="Test Device", device_type="desktop")
        token = create_access_token({"sub": user.id, "sid": session.id})
        client.cookies["access_token"] = token


def complete_onboarding(client: SyncASGITestClient) -> None:
    response = client.post(
        "/api/v1/onboarding",
        json={
            "education_level": "High School",
            "board_curriculum": "CBSE",
            "grade_class": "Class 12",
            "target_subjects": ["Calculus", "Physics"],
        },
    )
    assert response.status_code == 200


def create_test_router(primary: FakeProvider, fallback: FakeProvider) -> AIProviderRouter:
    settings = AISettings(
        _env_file=None,
        ai_provider_mode=ProviderMode.AUTO,
        ai_primary_provider=primary.provider_id,
        ai_fallback_provider=fallback.provider_id,
    )
    return AIProviderRouter(settings, {primary.provider_id: primary, fallback.provider_id: fallback})


def make_valid_14_day_proposal(
    start_date: date | None = None,
    subjects: list[str] | None = None,
    daily_duration_minutes: int = 160,
) -> dict[str, Any]:
    base = start_date or date(2026, 10, 10)
    end = base + timedelta(days=13)
    subjects_list = subjects or ["Calculus", "Physics"]
    tasks = []
    task_dur = daily_duration_minutes // 2
    for i in range(14):
        d = base + timedelta(days=i)
        tasks.append({
            "topic_id": f"calc-{i}-1",
            "topic_name": f"Calculus Topic {i+1} A",
            "subject": subjects_list[0],
            "scheduled_date": d.isoformat(),
            "scheduled_time": "19:00",
            "duration_minutes": task_dur,
            "priority_tag": "Weak Area",
            "rationale": "Daily study session 1",
        })
        tasks.append({
            "topic_id": f"calc-{i}-2",
            "topic_name": f"Calculus Topic {i+1} B",
            "subject": subjects_list[1] if len(subjects_list) > 1 else subjects_list[0],
            "scheduled_date": d.isoformat(),
            "scheduled_time": "20:40",
            "duration_minutes": task_dur,
            "priority_tag": "Spaced Revision",
            "rationale": "Daily study session 2",
        })
    total_minutes = len(tasks) * task_dur
    return {
        "planning_period_start": base.isoformat(),
        "planning_period_end": end.isoformat(),
        "subjects": subjects_list,
        "tasks": tasks,
        "total_planned_hours": round(total_minutes / 60, 2),
        "summary": "14-Day Strategic Study Plan: 37.33 total study hours across 14 calendar dates.",
    }


def test_generate_proposal_returns_structured_plan(
    planner_client: SyncASGITestClient,
) -> None:
    signup(planner_client, "proposal@example.com")
    complete_onboarding(planner_client)

    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            '{"tasks": [{"topic_id": "calc-1", "topic_name": "Limits and Continuity", "subject": "Calculus", "scheduled_date": "2026-10-10", "scheduled_time": "19:00", "duration_minutes": 80, "priority_tag": "Weak Area", "rationale": "Foundational concept"}], "summary": "14-day calculus focus"}'
        ],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = create_test_router(primary, fallback)
    import app.api.planner as planner_module
    planner_client.app.dependency_overrides[planner_module.get_ai_router] = lambda: test_router

    response = planner_client.post("/api/v1/planner/generate-proposal")

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "proposal" in data
    assert data["proposal"]["subjects"] == ["Calculus", "Physics"]
    assert len(data["proposal"]["tasks"]) == 28
    assert data["proposal"]["planning_period_start"] == "2026-10-10"
    assert data["proposal"]["planning_period_end"] == "2026-10-23"
    assert not any(t["scheduled_date"] == "2026-10-24" for t in data["proposal"]["tasks"])
    assert any(t["topic_name"] == "Limits and Continuity" for t in data["proposal"]["tasks"])
    assert data["proposal"]["total_planned_hours"] == 37.33
    assert (date.fromisoformat(data["proposal"]["planning_period_end"]) - date.fromisoformat(data["proposal"]["planning_period_start"])).days + 1 == 14


def test_confirm_plan_creates_database_records_and_marks_onboarded(
    planner_client: SyncASGITestClient,
) -> None:
    signup(planner_client, "confirm@example.com")
    complete_onboarding(planner_client)

    proposal_payload = make_valid_14_day_proposal()

    response = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": proposal_payload, "confirmed": True},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["next_route"] == "/dashboard"
    assert "plan_version" in data["data"]
    assert "tasks" in data["data"]
    assert len(data["data"]["tasks"]) == 28

    # Verify user is marked as onboarded
    me_response = planner_client.get("/api/v1/auth/me")
    assert me_response.json()["data"]["is_onboarded"] is True


def test_confirm_plan_requires_confirmation_flag(
    planner_client: SyncASGITestClient,
) -> None:
    signup(planner_client, "confirm_no@example.com")
    complete_onboarding(planner_client)

    proposal_payload = make_valid_14_day_proposal()

    response = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": proposal_payload, "confirmed": False},
    )

    assert response.status_code == 400


def test_confirm_plan_requires_onboarding(
    planner_client: SyncASGITestClient,
) -> None:
    signup(planner_client, "no_onboard@example.com")

    proposal_payload = make_valid_14_day_proposal()

    response = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": proposal_payload, "confirmed": True},
    )

    assert response.status_code == 400


def test_confirm_plan_creates_new_version_for_existing_plan(
    planner_client: SyncASGITestClient,
) -> None:
    signup(planner_client, "version@example.com")
    complete_onboarding(planner_client)

    proposal_payload = make_valid_14_day_proposal()

    # First confirmation
    response1 = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": proposal_payload, "confirmed": True},
    )
    assert response1.status_code == 201
    version1 = response1.json()["data"]["plan_version"]["version_number"]
    assert version1 == 1

    # Second confirmation (should create version 2)
    proposal_payload_v2 = {
        **proposal_payload,
        "summary": "Second version",
    }

    response2 = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": proposal_payload_v2, "confirmed": True},
    )
    assert response2.status_code == 201
    version2 = response2.json()["data"]["plan_version"]["version_number"]
    assert version2 == 2


def test_generate_proposal_requires_authentication(
    planner_client: SyncASGITestClient,
) -> None:
    response = planner_client.post("/api/v1/planner/generate-proposal")
    assert response.status_code == 401


def test_generate_proposal_provider_unavailable_returns_503_and_no_plan_persisted(
    planner_client: SyncASGITestClient,
) -> None:
    signup(planner_client, "planner_outage@example.com")
    complete_onboarding(planner_client)

    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            AIProviderError(
                ProviderId.OMNIROUTE,
                AIErrorType.NETWORK_ERROR,
                "OmniRoute endpoint unreachable",
                fallback_eligible=True,
            )
        ],
    )
    fallback = FakeProvider(
        ProviderId.GROQ,
        [
            AIProviderError(
                ProviderId.GROQ,
                AIErrorType.AUTH_ERROR,
                "Groq 403 FreeTierError",
                fallback_eligible=False,
            )
        ],
    )
    test_router = create_test_router(primary, fallback)
    import app.api.planner as planner_module
    planner_client.app.dependency_overrides[planner_module.get_ai_router] = lambda: test_router

    response = planner_client.post("/api/v1/planner/generate-proposal")

    assert response.status_code == 503
    data = response.json()
    assert "AI service temporarily unavailable" in data["detail"]

    dashboard_resp = planner_client.get("/api/v1/dashboard/summary")
    assert dashboard_resp.status_code == 200
    assert dashboard_resp.json()["active_plan_version_id"] is None
    assert len(dashboard_resp.json()["today_tasks"]) == 0


# =====================================================================
# Targeted Regression Tests for 14-Day Scheduling Constraints & Validation
# =====================================================================

def test_regression_exactly_14_inclusive_calendar_dates_and_correct_bounds() -> None:
    """Requirement 1 & 2: Plan must span exactly 14 calendar days, with start and end included."""
    start_d = date(2026, 10, 10)
    end_d = date(2026, 10, 23)
    assert (end_d - start_d).days + 1 == 14

    profile = StudentProfile(
        education_level="High School",
        board_curriculum="CBSE",
        grade_class="Class 12",
        target_subjects=["Mathematics", "Physics", "Chemistry", "Computer Science"],
        weak_topics=["Calculus", "Magnetism"],
    )

    proposal = build_deterministic_study_plan_proposal(
        profile=profile,
        generation_tasks=[],
        start_date=start_d,
    )

    assert proposal.planning_period_start == start_d
    assert proposal.planning_period_end == end_d
    dates = {t.scheduled_date for t in proposal.tasks}
    assert len(dates) == 14
    assert min(dates) == start_d
    assert max(dates) == end_d

    errors = validate_study_plan_proposal(proposal)
    assert len(errors) == 0


def test_regression_daily_study_workload_limit_and_break_accounting() -> None:
    """Requirement 3 & 6: Max 160 study minutes daily + 20 min break within 180 min window."""
    start_d = date(2026, 10, 10)
    profile = StudentProfile(
        education_level="High School",
        board_curriculum="CBSE",
        grade_class="Class 12",
        target_subjects=["Mathematics", "Physics"],
        weak_topics=["Calculus"],
    )

    # Simulate AI returning 250 minutes for a day
    overloaded_tasks = [
        {
            "topic_id": "math_over",
            "topic_name": "Overloaded Math",
            "subject": "Mathematics",
            "scheduled_date": "2026-10-10",
            "duration_minutes": 150,
        },
        {
            "topic_id": "phys_over",
            "topic_name": "Overloaded Physics",
            "subject": "Physics",
            "scheduled_date": "2026-10-10",
            "duration_minutes": 100,
        },
    ]

    proposal = build_deterministic_study_plan_proposal(
        profile=profile,
        generation_tasks=overloaded_tasks,
        start_date=start_d,
    )

    # Check that day 1 was capped to <= 160 minutes
    day_1_tasks = [t for t in proposal.tasks if t.scheduled_date == start_d]
    day_1_minutes = sum(t.duration_minutes for t in day_1_tasks)
    assert day_1_minutes <= 160
    assert day_1_minutes + DAILY_BREAK_MINUTES <= 180

    for t in day_1_tasks:
        h, m = map(int, t.scheduled_time.split(":"))
        assert h * 60 + m >= 19 * 60
        assert h * 60 + m + t.duration_minutes <= 22 * 60


def test_regression_total_workload_limit_and_summation_consistency() -> None:
    """Requirement 4 & 5: Total workload <= 2,240 min, and hours field equals actual task sum."""
    proposal_dict = make_valid_14_day_proposal(daily_duration_minutes=160)
    # Total minutes = 14 * 160 = 2240 minutes = 37.33 hours
    assert proposal_dict["total_planned_hours"] == round(2240 / 60, 2)

    from app.schemas.planner import StudyPlanProposal
    proposal = StudyPlanProposal(**proposal_dict)
    errors = validate_study_plan_proposal(proposal)
    assert len(errors) == 0

    # Alter total_planned_hours to be dishonest
    dishonest_proposal_dict = {
        **proposal_dict,
        "total_planned_hours": 15.0,  # claimed 15h when tasks sum to 37.33h
    }
    dishonest_proposal = StudyPlanProposal(**dishonest_proposal_dict)
    dishonest_errors = validate_study_plan_proposal(dishonest_proposal)
    assert any("does not match the sum of actual task durations" in e for e in dishonest_errors)


def test_regression_confirmation_rejects_altered_or_invalid_proposals(
    planner_client: SyncASGITestClient,
) -> None:
    """Requirement 8 & 9: Confirm API rejects proposals violating limits."""
    signup(planner_client, "reject_test@example.com")
    complete_onboarding(planner_client)

    # Case A: 15 days instead of 14 days
    invalid_15_days = make_valid_14_day_proposal()
    invalid_15_days["planning_period_end"] = (date.today() + timedelta(days=14)).isoformat()
    resp_a = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": invalid_15_days, "confirmed": True},
    )
    assert resp_a.status_code == 400
    assert "Invalid study plan proposal" in resp_a.json()["detail"]
    assert "14 calendar days" in resp_a.json()["detail"]

    # Case B: Exceeding daily limit (e.g. 180 min study on day 1)
    invalid_daily = make_valid_14_day_proposal()
    invalid_daily["tasks"][0]["duration_minutes"] = 180
    invalid_daily["total_planned_hours"] = round(sum(t["duration_minutes"] for t in invalid_daily["tasks"]) / 60, 2)
    resp_b = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": invalid_daily, "confirmed": True},
    )
    assert resp_b.status_code == 400
    assert "exceeds maximum daily limit of 160 minutes" in resp_b.json()["detail"]

    # Case C: Task scheduled outside 19:00-22:00 window (e.g. 09:00)
    invalid_time = make_valid_14_day_proposal()
    invalid_time["tasks"][0]["scheduled_time"] = "09:00"
    resp_c = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": invalid_time, "confirmed": True},
    )
    assert resp_c.status_code == 400
    assert "evening window" in resp_c.json()["detail"]


def test_regression_no_database_changes_after_rejected_confirmation(
    planner_client: SyncASGITestClient,
) -> None:
    """Requirement 10: No DB records created and user is_onboarded remains False after rejection."""
    test_email = "no_db_pollute@example.com"
    signup(planner_client, test_email)

    # Submit an invalid proposal (missing days)
    invalid_proposal = {
        "planning_period_start": date.today().isoformat(),
        "planning_period_end": (date.today() + timedelta(days=13)).isoformat(),
        "subjects": ["Calculus"],
        "tasks": [
            {
                "topic_id": "calc-single",
                "topic_name": "Single Task",
                "subject": "Calculus",
                "scheduled_date": date.today().isoformat(),
                "scheduled_time": "19:00",
                "duration_minutes": 60,
                "priority_tag": "Weak Area",
            }
        ],
        "total_planned_hours": 1.0,
        "summary": "Incomplete plan",
    }

    response = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": invalid_proposal, "confirmed": True},
    )
    assert response.status_code == 400

    # Query database directly to verify zero records were persisted
    session_factory = planner_client.app.state.testing_session
    db = session_factory()
    try:
        user = db.query(User).filter(User.email == test_email).first()
        assert user is not None
        assert user.is_onboarded is False  # Must not mark user as onboarded

        plans = db.query(StudyPlan).filter(StudyPlan.user_id == user.id).all()
        assert len(plans) == 0  # No study plan created

        tasks = db.query(StudyTask).filter(StudyTask.user_id == user.id).all()
        assert len(tasks) == 0  # No tasks created
    finally:
        db.close()


def test_regression_valid_proposal_generated_and_confirmed_successfully(
    planner_client: SyncASGITestClient,
) -> None:
    """Requirement 11: Valid proposal generated and confirmed end-to-end."""
    test_email = "valid_flow@example.com"
    signup(planner_client, test_email)
    complete_onboarding(planner_client)

    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            '{"tasks": [{"topic_id": "math_diff", "topic_name": "Differential Calculus", "subject": "Calculus", "scheduled_date": "2026-10-10", "scheduled_time": "19:00", "duration_minutes": 80, "priority_tag": "Weak Area"}], "summary": "Full 14-day schedule"}'
        ],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = create_test_router(primary, fallback)
    import app.api.planner as planner_module
    planner_client.app.dependency_overrides[planner_module.get_ai_router] = lambda: test_router

    # Generate proposal
    gen_resp = planner_client.post("/api/v1/planner/generate-proposal")
    assert gen_resp.status_code == 200
    prop_data = gen_resp.json()["proposal"]

    # Verify generated constraints
    assert len(prop_data["tasks"]) >= 14
    dates = {t["scheduled_date"] for t in prop_data["tasks"]}
    assert len(dates) == 14
    for d_str in dates:
        d_tasks = [t for t in prop_data["tasks"] if t["scheduled_date"] == d_str]
        assert sum(t["duration_minutes"] for t in d_tasks) <= 160

    # Confirm the generated proposal
    confirm_resp = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": prop_data, "confirmed": True},
    )
    assert confirm_resp.status_code == 201

    # Verify DB records
    session_factory = planner_client.app.state.testing_session
    db = session_factory()
    try:
        user = db.query(User).filter(User.email == test_email).first()
        assert user.is_onboarded is True
        plan = db.query(StudyPlan).filter(StudyPlan.user_id == user.id).first()
        assert plan is not None
        assert plan.active_version_id is not None
        persisted_tasks = db.query(StudyTask).filter(StudyTask.user_id == user.id).count()
        assert persisted_tasks == len(prop_data["tasks"])
    finally:
        db.close()


def test_regression_no_task_on_october_24_and_exactly_14_dates_28_tasks(
    planner_client: SyncASGITestClient,
) -> None:
    """
    CRITICAL REGRESSION TEST:
    Strictly enforce for the test scenario:
    - Start date: 2026-10-10
    - End date: 2026-10-23, inclusive
    - Exactly 14 calendar dates
    - Exactly 28 tasks (2 tasks per day at 80 mins each)
    - Max study duration: 160 minutes per day
    - Break allowance: 20 minutes per day
    - Total study duration: 2240 minutes (37.33 hours)
    - Rejection if any task is scheduled on 2026-10-24
    - Rejection if 15 date groups are rendered/present
    """
    test_email = "regression_oct24@example.com"
    signup(planner_client, test_email)
    complete_onboarding(planner_client)

    # 1. Proposal with a task on 24 October MUST be rejected by confirm-plan
    proposal_with_24th = make_valid_14_day_proposal()
    proposal_with_24th["tasks"].append({
        "topic_id": "rogue-24",
        "topic_name": "Rogue Task on 24 October",
        "subject": "Calculus",
        "scheduled_date": "2026-10-24",
        "scheduled_time": "19:00",
        "duration_minutes": 80,
        "priority_tag": "Weak Area",
    })
    resp_24th = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": proposal_with_24th, "confirmed": True},
    )
    assert resp_24th.status_code == 400
    assert "2026-10-24" in resp_24th.json()["detail"] or "24 October" in resp_24th.json()["detail"] or "28 tasks" in resp_24th.json()["detail"]

    # 2. Proposal with 15 date groups (10-24 October) MUST be rejected by confirm-plan
    proposal_15_dates = make_valid_14_day_proposal()
    proposal_15_dates["planning_period_end"] = "2026-10-24"
    tasks_15_dates = []
    for day_i in range(15):
        d = date(2026, 10, 10) + timedelta(days=day_i)
        for k in range(2):
            tasks_15_dates.append({
                "topic_id": f"day-{day_i}-task-{k}",
                "topic_name": f"Task {day_i}-{k}",
                "subject": "Calculus",
                "scheduled_date": d.isoformat(),
                "scheduled_time": "19:00" if k == 0 else "20:40",
                "duration_minutes": 80,
                "priority_tag": "Weak Area",
            })
    proposal_15_dates["tasks"] = tasks_15_dates
    proposal_15_dates["total_planned_hours"] = round(len(tasks_15_dates) * 80 / 60, 2)
    resp_15 = planner_client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": proposal_15_dates, "confirmed": True},
    )
    assert resp_15.status_code == 400
    assert "14 calendar days" in resp_15.json()["detail"] or "28 tasks" in resp_15.json()["detail"]

    # 3. Fresh generated proposal from /planner/generate-proposal
    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            '{"tasks": [{"topic_id": "math_diff", "topic_name": "Differential Calculus", "subject": "Calculus", "scheduled_date": "2026-10-10", "scheduled_time": "19:00", "duration_minutes": 80, "priority_tag": "Weak Area"}], "summary": "Full 14-day schedule"}'
        ],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = create_test_router(primary, fallback)
    import app.api.planner as planner_module
    planner_client.app.dependency_overrides[planner_module.get_ai_router] = lambda: test_router

    gen_resp = planner_client.post("/api/v1/planner/generate-proposal")
    assert gen_resp.status_code == 200
    prop = gen_resp.json()["proposal"]

    # Strict bounds verification
    assert prop["planning_period_start"] == "2026-10-10"
    assert prop["planning_period_end"] == "2026-10-23"
    assert len(prop["tasks"]) == 28

    distinct_dates = sorted(list({t["scheduled_date"] for t in prop["tasks"]}))
    assert len(distinct_dates) == 14
    assert distinct_dates[0] == "2026-10-10"
    assert distinct_dates[-1] == "2026-10-23"
    assert "2026-10-24" not in distinct_dates

    # Daily counts & timing
    for d_str in distinct_dates:
        d_tasks = [t for t in prop["tasks"] if t["scheduled_date"] == d_str]
        assert len(d_tasks) == 2, f"Date {d_str} must have exactly 2 tasks"
        assert sum(t["duration_minutes"] for t in d_tasks) == 160
        assert d_tasks[0]["scheduled_time"] == "19:00"
        assert d_tasks[1]["scheduled_time"] == "20:40"

    # Workload totals verification
    total_minutes = sum(t["duration_minutes"] for t in prop["tasks"])
    assert total_minutes == 2240
    assert prop["total_planned_hours"] == 37.33
    assert prop["daily_study_minutes"] == 160
    assert prop["daily_break_minutes"] == 20
    assert "24 October" not in prop["summary"]
    assert "10 Oct – 23 Oct 2026" in prop["summary"]