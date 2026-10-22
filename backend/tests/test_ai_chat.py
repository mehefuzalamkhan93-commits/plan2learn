import asyncio
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
    ProviderOutput,
)
from app.ai.errors import AIProviderError, AIUnavailableError
from app.ai.providers import HttpAIProvider
from app.ai.router import AIProviderRouter
from app.api.ai import get_ai_router
from app.core.database import Base, get_db
from app.main import create_app
from app.models.ai import AIConversation, AIMessage as AIMessageModel
from app.models.user import Exam, StudentProfile, User


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
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return ProviderOutput(str(outcome), input_tokens=12, output_tokens=4)

    async def health_check(self, model: str | None) -> ProviderHealth:
        return ProviderHealth(self.provider_id, "healthy", model, None)


@pytest.fixture
def ai_chat_client() -> SyncASGITestClient:
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
    client = SyncASGITestClient(app)
    client.session_factory = testing_session
    return client


def create_test_router(primary: FakeProvider, fallback: FakeProvider) -> AIProviderRouter:
    settings = AISettings(_env_file=None)
    return AIProviderRouter(settings, {primary.provider_id: primary, fallback.provider_id: fallback})


def signup(client: SyncASGITestClient, email: str) -> None:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "AI Chat Student",
            "email": email,
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert response.status_code == 201


def test_ai_chat_creates_conversation_and_returns_structured_response(
    ai_chat_client: SyncASGITestClient,
) -> None:
    signup(ai_chat_client, "ai_chat@example.com")

    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            '{"profile_updates": {"goals": ["Improve calculus"]}, "missing_information": {"fields": ["exam_date"], "questions": ["When is your exam?"]}, "next_question": "When is your exam?", "confidence": 0.8}'
        ],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = create_test_router(primary, fallback)
    ai_chat_client.app.dependency_overrides[get_ai_router] = lambda: test_router

    response = ai_chat_client.post(
        "/api/v1/ai/chat",
        json={"message": "I want to improve my calculus skills", "conversation_id": None},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["conversation_id"] is not None
    assert "When is your exam?" in data["ai_response"]
    assert data["profile_updates"] is not None
    assert data["profile_updates"]["goals"] == ["Improve calculus"]
    assert data["missing_information"] is not None
    assert data["missing_information"]["fields"] == ["exam_date"]
    assert data["confidence"] == 0.8
    assert data["provider_used"] == "omniroute"
    assert data["model_used"] == "omniroute-test-model"


def test_ai_chat_continues_existing_conversation(
    ai_chat_client: SyncASGITestClient,
) -> None:
    signup(ai_chat_client, "ai_chat2@example.com")

    # First message
    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            '{"profile_updates": {"current_topics": ["derivatives"]}, "missing_information": {"fields": ["daily_time_minutes"], "questions": ["How much time can you study daily?"]}, "next_question": "How much time can you study daily?", "confidence": 0.7}'
        ],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = create_test_router(primary, fallback)
    ai_chat_client.app.dependency_overrides[get_ai_router] = lambda: test_router

    response1 = ai_chat_client.post(
        "/api/v1/ai/chat",
        json={"message": "I'm studying derivatives", "conversation_id": None},
    )
    assert response1.status_code == 200
    conv_id = response1.json()["conversation_id"]

    # Second message in same conversation
    primary2 = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            '{"profile_updates": {"daily_time_minutes": 120}, "missing_information": null, "next_question": "Great! I have enough info to help you plan.", "confidence": 0.9}'
        ],
    )
    fallback2 = FakeProvider(ProviderId.GROQ, [])
    test_router2 = create_test_router(primary2, fallback2)
    ai_chat_client.app.dependency_overrides[get_ai_router] = lambda: test_router2

    response2 = ai_chat_client.post(
        "/api/v1/ai/chat",
        json={"message": "I can study 2 hours a day", "conversation_id": conv_id},
    )
    assert response2.status_code == 200
    data = response2.json()
    assert data["conversation_id"] == conv_id
    assert data["profile_updates"] is not None
    assert data["profile_updates"]["daily_time_minutes"] == 120


def test_ai_chat_requires_authentication(ai_chat_client: SyncASGITestClient) -> None:
    response = ai_chat_client.post(
        "/api/v1/ai/chat",
        json={"message": "Hello", "conversation_id": None},
    )
    assert response.status_code == 401


def test_ai_chat_history_endpoint_returns_conversations(
    ai_chat_client: SyncASGITestClient,
) -> None:
    signup(ai_chat_client, "history@example.com")

    # Create a conversation via chat
    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        ['{"profile_updates": {}, "missing_information": null, "next_question": "OK", "confidence": 0.5}'],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = create_test_router(primary, fallback)
    ai_chat_client.app.dependency_overrides[get_ai_router] = lambda: test_router

    ai_chat_client.post(
        "/api/v1/ai/chat",
        json={"message": "Hello", "conversation_id": None},
    )

    # Now fetch history
    response = ai_chat_client.get("/api/v1/ai/history")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert isinstance(data["conversations"], list)
    assert len(data["conversations"]) >= 1


def test_ai_chat_history_detail_returns_messages(
    ai_chat_client: SyncASGITestClient,
) -> None:
    signup(ai_chat_client, "history_detail@example.com")

    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        ['{"profile_updates": {}, "missing_information": null, "next_question": "OK", "confidence": 0.5}'],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = create_test_router(primary, fallback)
    ai_chat_client.app.dependency_overrides[get_ai_router] = lambda: test_router

    chat_resp = ai_chat_client.post(
        "/api/v1/ai/chat",
        json={"message": "Hello", "conversation_id": None},
    )
    conv_id = chat_resp.json()["conversation_id"]

    response = ai_chat_client.get(f"/api/v1/ai/history/{conv_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["conversation_id"] == conv_id
    assert isinstance(data["messages"], list)
    assert len(data["messages"]) >= 2  # user + assistant
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][1]["role"] == "assistant"


def test_ai_chat_provider_unavailable_returns_503_and_rolls_back(
    ai_chat_client: SyncASGITestClient,
) -> None:
    signup(ai_chat_client, "outage@example.com")

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
                "Groq authentication failed",
                fallback_eligible=False,
            )
        ],
    )
    test_router = create_test_router(primary, fallback)
    ai_chat_client.app.dependency_overrides[get_ai_router] = lambda: test_router

    response = ai_chat_client.post(
        "/api/v1/ai/chat",
        json={"message": "Can you build my schedule?", "conversation_id": None},
    )

    assert response.status_code == 503
    data = response.json()
    assert "AI service temporarily unavailable" in data["detail"]

    # Verify no fake messages were saved in history
    history_resp = ai_chat_client.get("/api/v1/ai/history")
    assert history_resp.status_code == 200
    assert len(history_resp.json()["conversations"]) == 0


def test_ai_chat_persists_academic_context_and_exams(
    ai_chat_client: SyncASGITestClient,
) -> None:
    signup(ai_chat_client, "exams@example.com")

    # Complete initial onboarding
    onboard_resp = ai_chat_client.post(
        "/api/v1/onboarding",
        json={
            "education_level": "High School",
            "board_curriculum": "CBSE",
            "grade_class": "Class 12",
            "target_subjects": ["Physics", "Chemistry"],
        },
    )
    assert onboard_resp.status_code == 200

    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            '{"profile_updates": {"weak_topics": ["Electromagnetism"]}, "academic_context_updates": {"exams": [{"name": "CBSE Midterm", "subject_name": "Physics", "exam_date": "2026-11-20", "target_score": 90}]}, "missing_information": null, "next_question": "I have updated your exam and weak topics.", "confidence": 0.95}'
        ],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = create_test_router(primary, fallback)
    ai_chat_client.app.dependency_overrides[get_ai_router] = lambda: test_router

    response = ai_chat_client.post(
        "/api/v1/ai/chat",
        json={"message": "My CBSE Midterm is on Nov 20 and I struggle with Electromagnetism", "conversation_id": None},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["provider_used"] == "omniroute"
    assert data["model_used"] == "omniroute-test-model"
    assert data["academic_context_updates"] is not None
    assert len(data["academic_context_updates"]["exams"]) == 1

    # Verify profile was updated in DB
    with ai_chat_client.session_factory() as session:
        prof = session.query(StudentProfile).first()
        assert prof is not None
        assert "Electromagnetism" in prof.weak_topics

        exam = session.query(Exam).first()
        assert exam is not None
        assert exam.name == "CBSE Midterm"
        assert exam.subject_name == "Physics"

    # Verify exam was persisted in DB and returned in dashboard
    dashboard_resp = ai_chat_client.get("/api/v1/dashboard/summary")
    assert dashboard_resp.status_code == 200
    assert len(dashboard_resp.json()["exams"]) == 1
    assert dashboard_resp.json()["exams"][0]["name"] == "CBSE Midterm"
    assert dashboard_resp.json()["exams"][0]["subject_name"] == "Physics"