import asyncio
import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.config import AISettings
from app.core.database import Base, get_db
from app.main import create_app
from app.models.plan import StudyPlan, StudyPlanVersion, StudyTask
from app.models.user import User, StudentProfile, Exam
from app.models.catalog import Subject, Topic
from app.models.progress import Streak, ReadinessScore, ProgressLog


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


@pytest.fixture
def dashboard_client() -> SyncASGITestClient:
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
    return SyncASGITestClient(app)


def signup(client: SyncASGITestClient, email: str) -> None:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Dashboard Student",
            "email": email,
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert response.status_code == 201


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


from datetime import date, timedelta


def confirm_plan(client: SyncASGITestClient) -> None:
    today = date(2026, 10, 10)
    end_date = today + timedelta(days=13)

    tasks = []
    for i in range(14):
        d = today + timedelta(days=i)
        tasks.append({
            "topic_id": f"topic-{i}-1",
            "topic_name": f"Study Topic {i+1} A",
            "subject": "Calculus" if i % 2 == 0 else "Physics",
            "scheduled_date": d.isoformat(),
            "scheduled_time": "19:00",
            "duration_minutes": 80,
            "priority_tag": "Weak Area" if i % 2 == 0 else "Regular",
        })
        tasks.append({
            "topic_id": f"topic-{i}-2",
            "topic_name": f"Study Topic {i+1} B",
            "subject": "Physics" if i % 2 == 0 else "Calculus",
            "scheduled_date": d.isoformat(),
            "scheduled_time": "20:40",
            "duration_minutes": 80,
            "priority_tag": "Spaced Revision",
        })

    proposal_payload = {
        "planning_period_start": today.isoformat(),
        "planning_period_end": end_date.isoformat(),
        "subjects": ["Calculus", "Physics"],
        "tasks": tasks,
        "total_planned_hours": round(len(tasks) * 80 / 60, 2),
        "summary": "14-day test plan",
    }

    response = client.post(
        "/api/v1/planner/confirm-plan",
        json={"proposal": proposal_payload, "confirmed": True},
    )
    assert response.status_code == 201


def test_dashboard_summary_requires_authentication(
    dashboard_client: SyncASGITestClient,
) -> None:
    response = dashboard_client.get("/api/v1/dashboard/summary")
    assert response.status_code == 401


def test_dashboard_summary_returns_empty_state_for_new_user(
    dashboard_client: SyncASGITestClient,
) -> None:
    signup(dashboard_client, "empty_dashboard@example.com")
    complete_onboarding(dashboard_client)
    confirm_plan(dashboard_client)

    response = dashboard_client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    data = response.json()

    # Should have all expected fields
    assert "today_tasks" in data
    assert "upcoming_tasks" in data
    assert "streak" in data
    assert "readiness" in data
    assert "review_queue" in data
    assert "exams" in data
    assert "active_plan_version_id" in data
    assert "total_planned_today_minutes" in data
    assert "completed_today_minutes" in data

    # New user with no progress should have empty/zero values
    assert isinstance(data["today_tasks"], list)
    assert isinstance(data["upcoming_tasks"], list)
    assert isinstance(data["review_queue"], list)
    assert isinstance(data["exams"], list)
    assert data["total_planned_today_minutes"] >= 0
    assert data["completed_today_minutes"] >= 0


def test_dashboard_summary_returns_tasks_after_plan_confirmation(
    dashboard_client: SyncASGITestClient,
) -> None:
    signup(dashboard_client, "tasks_dashboard@example.com")
    complete_onboarding(dashboard_client)
    confirm_plan(dashboard_client)

    response = dashboard_client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    data = response.json()

    # Should have upcoming tasks from the confirmed plan
    assert "upcoming_tasks" in data
    assert isinstance(data["upcoming_tasks"], list)
    assert len(data["upcoming_tasks"]) >= 2


def test_dashboard_summary_includes_streak_and_readiness(
    dashboard_client: SyncASGITestClient,
) -> None:
    signup(dashboard_client, "streak_readiness@example.com")
    complete_onboarding(dashboard_client)
    confirm_plan(dashboard_client)

    response = dashboard_client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    data = response.json()

    # Streak and readiness can be null for new users
    assert "streak" in data
    assert "readiness" in data


def test_dashboard_summary_includes_exams(
    dashboard_client: SyncASGITestClient,
) -> None:
    signup(dashboard_client, "exams_dashboard@example.com")
    complete_onboarding(dashboard_client)
    confirm_plan(dashboard_client)

    # Add an exam directly to the database
    # (In real usage, exams would be added via AI chat or exam API)
    # For now, just verify the field exists
    response = dashboard_client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    data = response.json()
    assert "exams" in data
    assert isinstance(data["exams"], list)


def test_dashboard_summary_includes_active_plan_version(
    dashboard_client: SyncASGITestClient,
) -> None:
    signup(dashboard_client, "plan_version@example.com")
    complete_onboarding(dashboard_client)
    confirm_plan(dashboard_client)

    response = dashboard_client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    data = response.json()

    assert data["active_plan_version_id"] is not None
    assert isinstance(data["active_plan_version_id"], str)


def test_dashboard_summary_calculates_planned_minutes(
    dashboard_client: SyncASGITestClient,
) -> None:
    signup(dashboard_client, "planned_minutes@example.com")
    complete_onboarding(dashboard_client)
    confirm_plan(dashboard_client)

    response = dashboard_client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    data = response.json()

    assert data["total_planned_today_minutes"] >= 0
    assert data["completed_today_minutes"] >= 0
    assert data["completed_today_minutes"] <= data["total_planned_today_minutes"]