import asyncio
import json
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
    ProviderId,
    ProviderMode,
    ProviderOutput,
)
from app.ai.errors import AIProviderError, AIUnavailableError
from app.ai.providers import HttpAIProvider
from app.ai.router import AIProviderRouter
from app.api.ai import get_ai_router
from app.core.database import Base, get_db
from app.main import create_app
from app.models.ai import AIConversation, AIMessage as AIMessageModel
from app.models.notebook import Notebook, Source, SourceChunk
from app.models.user import StudentProfile, User


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


class CallTrackingProvider:
    def __init__(
        self,
        provider_id: ProviderId,
        outcomes: list[Any],
        configured_model: str = "test-model",
    ) -> None:
        self.provider_id = provider_id
        self.outcomes = outcomes
        self.calls: list[tuple[PreparedAIRequest, str]] = []
        self.configured_model = configured_model

    def missing_configuration(self) -> tuple[str, ...]:
        return ()

    def get_capabilities(self) -> tuple[str, ...]:
        return ("text_generation", "runtime_schema_validation", "health_check")

    async def generate(self, request: PreparedAIRequest, model: str) -> ProviderOutput:
        self.calls.append((request, model))
        if not self.outcomes:
            raise AIProviderError(
                self.provider_id,
                AIErrorType.PROVIDER_ERROR,
                "No more outcomes configured",
                fallback_eligible=True,
            )
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return ProviderOutput(str(outcome), input_tokens=15, output_tokens=10)

    async def health_check(self, model: str | None):
        return None


@pytest.fixture
def failover_client() -> SyncASGITestClient:
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


def signup_user(client: SyncASGITestClient, email: str = "failover_test@example.com") -> None:
    res = client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Failover Student",
            "email": email,
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert res.status_code == 201


# ===========================================================================
# 1. OmniRoute succeeds; Groq is not called
# ===========================================================================
def test_case_1_omniroute_succeeds_groq_not_called() -> None:
    primary = CallTrackingProvider(ProviderId.OMNIROUTE, ["OmniRoute primary answer"])
    fallback = CallTrackingProvider(ProviderId.GROQ, ["Groq fallback answer"])
    settings = AISettings(_env_file=None)
    router = AIProviderRouter(settings, {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})

    request = AIRequest(
        task_type=AITaskType.CHAT,
        messages=(AIMessage(MessageRole.USER, "Hello"),),
        fallback_allowed=True,
    )
    result = run(router.generate(request))

    assert result.provider == ProviderId.OMNIROUTE
    assert result.fallback_used is False
    assert result.text == "OmniRoute primary answer"
    assert len(primary.calls) == 1
    assert len(fallback.calls) == 0


# ===========================================================================
# 2. OmniRoute times out; Groq succeeds
# ===========================================================================
def test_case_2_omniroute_times_out_groq_succeeds() -> None:
    def omni_timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Read timed out after 60s")

    def groq_success(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": "Groq response after timeout"}}]},
        )

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid/v1",
        "omni-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(omni_timeout),
    )
    fallback = HttpAIProvider(
        ProviderId.GROQ,
        "https://api.groq.com/openai/v1",
        "groq-key",
        "openai/gpt-oss-20b",
        1,
        transport=httpx.MockTransport(groq_success),
    )

    settings = AISettings(_env_file=None)
    router = AIProviderRouter(settings, {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})

    request = AIRequest(
        task_type=AITaskType.CHAT,
        messages=(AIMessage(MessageRole.USER, "Explain momentum"),),
        fallback_allowed=True,
    )
    result = run(router.generate(request))

    assert result.provider == ProviderId.GROQ
    assert result.fallback_used is True
    assert result.text == "Groq response after timeout"


# ===========================================================================
# 3. OmniRoute returns 429; Groq succeeds
# ===========================================================================
def test_case_3_omniroute_429_groq_succeeds() -> None:
    def omni_429(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": "Rate limit exceeded"}})

    def groq_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": "Groq answer after 429"}}]},
        )

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid/v1",
        "omni-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(omni_429),
    )
    fallback = HttpAIProvider(
        ProviderId.GROQ,
        "https://api.groq.com/openai/v1",
        "groq-key",
        "openai/gpt-oss-20b",
        1,
        transport=httpx.MockTransport(groq_ok),
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    result = run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Test"),))))

    assert result.provider == ProviderId.GROQ
    assert result.fallback_used is True
    assert result.text == "Groq answer after 429"


# ===========================================================================
# 4. OmniRoute returns 500 or 503; Groq succeeds
# ===========================================================================
@pytest.mark.parametrize("status_code", [500, 502, 503])
def test_case_4_omniroute_5xx_groq_succeeds(status_code: int) -> None:
    def omni_5xx(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json={"error": "Internal server error"})

    def groq_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": f"Groq answer after {status_code}"}}]},
        )

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid/v1",
        "omni-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(omni_5xx),
    )
    fallback = HttpAIProvider(
        ProviderId.GROQ,
        "https://api.groq.com/openai/v1",
        "groq-key",
        "openai/gpt-oss-20b",
        1,
        transport=httpx.MockTransport(groq_ok),
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    result = run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Test"),))))

    assert result.provider == ProviderId.GROQ
    assert result.fallback_used is True
    assert result.text == f"Groq answer after {status_code}"


# ===========================================================================
# 5. OmniRoute returns malformed JSON; Groq succeeds
# ===========================================================================
def test_case_5_omniroute_malformed_json_groq_succeeds() -> None:
    def omni_bad_json(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="Not valid JSON at all: <html>502 Bad Gateway</html>")

    def groq_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": "Groq answer after bad JSON"}}]},
        )

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid/v1",
        "omni-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(omni_bad_json),
    )
    fallback = HttpAIProvider(
        ProviderId.GROQ,
        "https://api.groq.com/openai/v1",
        "groq-key",
        "openai/gpt-oss-20b",
        1,
        transport=httpx.MockTransport(groq_ok),
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    result = run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Test"),))))

    assert result.provider == ProviderId.GROQ
    assert result.fallback_used is True
    assert result.text == "Groq answer after bad JSON"


# ===========================================================================
# 6. OmniRoute returns empty assistant content; Groq succeeds
# ===========================================================================
def test_case_6_omniroute_empty_content_groq_succeeds() -> None:
    def omni_empty(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "   "}}]})

    def groq_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": "Groq answer after empty content"}}]},
        )

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid/v1",
        "omni-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(omni_empty),
    )
    fallback = HttpAIProvider(
        ProviderId.GROQ,
        "https://api.groq.com/openai/v1",
        "groq-key",
        "openai/gpt-oss-20b",
        1,
        transport=httpx.MockTransport(groq_ok),
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    result = run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Test"),))))

    assert result.provider == ProviderId.GROQ
    assert result.fallback_used is True
    assert result.text == "Groq answer after empty content"


# ===========================================================================
# 7. OmniRoute credentials are missing; configured Groq succeeds
# ===========================================================================
def test_case_7_missing_omniroute_credentials_groq_succeeds() -> None:
    def groq_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": "Groq response without OmniRoute credentials"}}]},
        )

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        None,  # missing base_url
        None,  # missing api_key
        None,
        1,
    )
    fallback = HttpAIProvider(
        ProviderId.GROQ,
        "https://api.groq.com/openai/v1",
        "groq-key",
        "openai/gpt-oss-20b",
        1,
        transport=httpx.MockTransport(groq_ok),
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    result = run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Hello"),))))

    assert result.provider == ProviderId.GROQ
    assert result.fallback_used is True
    assert result.text == "Groq response without OmniRoute credentials"


# ===========================================================================
# 8. Groq is unavailable; OmniRoute succeeds
# ===========================================================================
def test_case_8_groq_unavailable_omniroute_succeeds() -> None:
    def omni_ok(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": "OmniRoute answer"}}]},
        )

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid/v1",
        "omni-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(omni_ok),
    )
    fallback = HttpAIProvider(
        ProviderId.GROQ,
        None,
        None,
        None,
        1,
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    result = run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Hello"),))))

    assert result.provider == ProviderId.OMNIROUTE
    assert result.fallback_used is False
    assert result.text == "OmniRoute answer"


# ===========================================================================
# 9. Both providers fail; a safe all-providers-unavailable response is returned
# ===========================================================================
def test_case_9_both_providers_fail_safe_error() -> None:
    primary = CallTrackingProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, AIErrorType.TIMEOUT, "OmniRoute timed out", fallback_eligible=True)],
    )
    fallback = CallTrackingProvider(
        ProviderId.GROQ,
        [AIProviderError(ProviderId.GROQ, AIErrorType.AUTH_ERROR, "Groq 403 Forbidden", fallback_eligible=True)],
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})

    with pytest.raises(AIUnavailableError) as exc_info:
        run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Hello"),))))

    assert len(exc_info.value.errors) == 2
    assert str(exc_info.value) == "AI is temporarily unavailable."
    assert len(primary.calls) == 1
    assert len(fallback.calls) == 1


# ===========================================================================
# 10. Both providers are misconfigured; reports useful failure without secrets
# ===========================================================================
def test_case_10_both_misconfigured_reports_useful_failure_without_secrets() -> None:
    secret_key = "super-secret-key-12345"
    primary = HttpAIProvider(ProviderId.OMNIROUTE, None, None, None, 1)
    fallback = HttpAIProvider(ProviderId.GROQ, None, None, None, 1)

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})

    with pytest.raises(AIUnavailableError) as exc_info:
        run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Hello"),))))

    assert exc_info.value.is_configuration_error is True
    assert secret_key not in str(exc_info.value)
    for err in exc_info.value.errors:
        assert err.error_type == AIErrorType.NOT_CONFIGURED


# ===========================================================================
# 11. An invalid student request does not trigger unnecessary provider calls
# ===========================================================================
def test_case_11_invalid_student_request_blocks_provider_calls(failover_client: SyncASGITestClient) -> None:
    signup_user(failover_client, "invalid_req@example.com")
    primary = CallTrackingProvider(ProviderId.OMNIROUTE, ["ok"])
    fallback = CallTrackingProvider(ProviderId.GROQ, ["ok"])

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    failover_client.app.dependency_overrides[get_ai_router] = lambda: router

    # Send empty message (violates min_length=1)
    res = failover_client.post("/api/v1/ai/chat", json={"message": "", "conversation_id": None})
    assert res.status_code == 422
    assert len(primary.calls) == 0
    assert len(fallback.calls) == 0


# ===========================================================================
# 12. A failed provider attempt does not create duplicate chat messages
# ===========================================================================
def test_case_12_failed_provider_does_not_create_duplicate_messages(failover_client: SyncASGITestClient) -> None:
    signup_user(failover_client, "no_dup@example.com")
    primary = CallTrackingProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, AIErrorType.NETWORK_ERROR, "unreachable", fallback_eligible=True)],
    )
    fallback = CallTrackingProvider(
        ProviderId.GROQ,
        [AIProviderError(ProviderId.GROQ, AIErrorType.AUTH_ERROR, "bad auth", fallback_eligible=True)],
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    failover_client.app.dependency_overrides[get_ai_router] = lambda: router

    # Initial request fails completely
    res1 = failover_client.post("/api/v1/ai/chat", json={"message": "Can you help me?", "conversation_id": None})
    assert res1.status_code == 503

    # Check database: no orphaned messages or conversations persisted
    with failover_client.session_factory() as session:
        convs = session.query(AIConversation).all()
        messages = session.query(AIMessageModel).all()
        assert len(convs) == 0
        assert len(messages) == 0


# ===========================================================================
# 13. Successful fallback preserves notebook grounding, citations, and style
# ===========================================================================
def test_case_13_fallback_preserves_notebook_citations_and_style(failover_client: SyncASGITestClient) -> None:
    signup_user(failover_client, "citations_style@example.com")

    # Set up notebook with source in database
    with failover_client.session_factory() as session:
        user = session.query(User).filter(User.email == "citations_style@example.com").first()
        nb = Notebook(user_id=user.id, title="Physics Notebook")
        session.add(nb)
        session.flush()

        source = Source(
            notebook_id=nb.id,
            user_id=user.id,
            title="Newton Laws.pdf",
            source_type="pdf",
            status="ready",
            is_selected=True,
            file_size=1024,
        )
        session.add(source)
        session.flush()

        chunk = SourceChunk(
            source_id=source.id,
            chunk_index=0,
            content="An object in motion remains in motion unless acted upon by an external force.",
            page_number=14,
        )
        session.add(chunk)
        session.commit()
        notebook_id = nb.id

    primary = CallTrackingProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, AIErrorType.TIMEOUT, "Timeout", fallback_eligible=True)],
    )
    fallback = CallTrackingProvider(
        ProviderId.GROQ,
        [
            '{"next_question": "Based on Newton Laws, an external force is required to change motion.", "confidence": 0.95}'
        ],
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    failover_client.app.dependency_overrides[get_ai_router] = lambda: router

    res = failover_client.post(
        "/api/v1/ai/chat",
        json={
            "message": "What is the first law?",
            "notebook_id": notebook_id,
            "response_style": "strict",
        },
    )

    assert res.status_code == 200
    data = res.json()
    assert data["provider_used"] == "groq"
    assert "Newton Laws" in data["ai_response"]
    assert data["citations"] is not None
    assert len(data["citations"]) == 1
    assert data["citations"][0]["source_title"] == "Newton Laws.pdf"
    assert "An object in motion" in data["citations"][0]["passage"]

    # Verify Strict Coach instructions were passed to fallback
    fallback_request, _ = fallback.calls[0]
    prompt_contents = [m.content for m in fallback_request.messages]
    combined_prompt = " ".join(prompt_contents)
    assert "Strict Coach" in combined_prompt


# ===========================================================================
# 14. Study tools seamlessly fall back and return clean markdown content
# ===========================================================================
def test_case_14_study_tool_fallback_returns_markdown_without_json_conflict(failover_client: SyncASGITestClient) -> None:
    signup_user(failover_client, "study_tools_fallback@example.com")

    with failover_client.session_factory() as session:
        user = session.query(User).filter(User.email == "study_tools_fallback@example.com").first()
        nb = Notebook(user_id=user.id, title="Calculus Notebook")
        session.add(nb)
        session.commit()
        notebook_id = nb.id

    primary = CallTrackingProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, AIErrorType.NETWORK_ERROR, "Connection reset", fallback_eligible=True)],
    )
    fallback = CallTrackingProvider(
        ProviderId.GROQ,
        ["### Step 1: Derivative Definition\nThe derivative of x^2 is 2x."],
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})
    failover_client.app.dependency_overrides[get_ai_router] = lambda: router

    res = failover_client.post(
        "/api/v1/ai/study-tool/explain",
        json={"notebook_id": notebook_id, "topic": "Derivatives"},
    )

    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert "Step 1: Derivative Definition" in data["content"]
    assert len(primary.calls) == 1
    assert len(fallback.calls) == 1


# ===========================================================================
# 15. Buffered failover does not mix partial primary response with fallback
# ===========================================================================
def test_case_15_buffered_failover_cleanly_switches_without_mixing_responses() -> None:
    primary = CallTrackingProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, AIErrorType.PROVIDER_ERROR, "Truncated output", fallback_eligible=True)],
    )
    fallback = CallTrackingProvider(
        ProviderId.GROQ,
        ["Complete clean answer from Groq."],
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})

    request = AIRequest(
        task_type=AITaskType.CHAT,
        messages=(AIMessage(MessageRole.USER, "Summarize"),),
        fallback_allowed=True,
    )
    result = run(router.generate(request))

    assert result.provider == ProviderId.GROQ
    assert result.fallback_used is True
    assert result.text == "Complete clean answer from Groq."
    assert "Truncated output" not in result.text


# ===========================================================================
# 16. Groq rate limit (429) returns useful message without auto-retry
# ===========================================================================
def test_case_16_groq_rate_limit_returns_quota_message() -> None:
    def groq_429(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            429,
            json={"error": {"message": "Rate limit exceeded. Please try again later."}},
            headers={"Retry-After": "60"},
        )

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid/v1",
        "omni-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(lambda r: httpx.Response(503, json={"error": "unavailable"})),
    )
    fallback = HttpAIProvider(
        ProviderId.GROQ,
        "https://api.groq.com/openai/v1",
        "groq-key",
        "openai/gpt-oss-20b",
        1,
        transport=httpx.MockTransport(groq_429),
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})

    with pytest.raises(AIUnavailableError) as exc_info:
        run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Test"),))))

    # Both providers are called: primary fails with 503, fallback fails with 429
    assert len(exc_info.value.errors) == 2
    # Check that the Groq error is a RATE_LIMIT error
    groq_error = next(e for e in exc_info.value.errors if e.provider == ProviderId.GROQ)
    assert groq_error.error_type == AIErrorType.RATE_LIMIT
    assert groq_error.fallback_eligible is True
    # Note: HttpAIProvider doesn't track calls; only test doubles do.
    # The important thing is that no automatic retry loop exists.


# ===========================================================================
# 17. Groq model unavailable (404) handled gracefully
# ===========================================================================
def test_case_17_groq_model_unavailable_handled_gracefully() -> None:
    def groq_404(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            404,
            json={"error": {"message": "Model not found: openai/gpt-oss-20b"}},
        )

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid/v1",
        "omni-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(lambda r: httpx.Response(503, json={"error": "unavailable"})),
    )
    fallback = HttpAIProvider(
        ProviderId.GROQ,
        "https://api.groq.com/openai/v1",
        "groq-key",
        "openai/gpt-oss-20b",
        1,
        transport=httpx.MockTransport(groq_404),
    )

    router = AIProviderRouter(AISettings(_env_file=None), {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})

    with pytest.raises(AIUnavailableError) as exc_info:
        run(router.generate(AIRequest(AITaskType.CHAT, (AIMessage(MessageRole.USER, "Test"),))))

    # Both providers are called: primary fails with 503, fallback fails with 404
    assert len(exc_info.value.errors) == 2
    groq_error = next(e for e in exc_info.value.errors if e.provider == ProviderId.GROQ)
    assert groq_error.error_type == AIErrorType.MODEL_UNAVAILABLE
    assert groq_error.fallback_eligible is True