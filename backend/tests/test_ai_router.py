import asyncio

import httpx
import pytest
from pydantic import BaseModel

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
from app.ai.errors import AIProviderError, AIUnavailableError
from app.ai.providers import HttpAIProvider
from app.ai.router import AIProviderRouter
from app.main import create_app


@pytest.fixture(autouse=True)
def reset_ai_env(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER_MODE", raising=False)
    monkeypatch.delenv("AI_PRIMARY_PROVIDER", raising=False)
    monkeypatch.delenv("AI_PRIMARY_MODEL", raising=False)
    monkeypatch.delenv("AI_FALLBACK_MODEL", raising=False)


def run(coroutine):
    return asyncio.run(coroutine)


def get_response(app, path: str, headers: dict[str, str] | None = None):
    async def request():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            return await client.get(path, headers=headers)

    return run(request())


class AnswerPayload(BaseModel):
    answer: str


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


class UnconfiguredFakeProvider(FakeProvider):
    def missing_configuration(self) -> tuple[str, ...]:
        return ("base_url", "api_key", "model")


def make_request(response_model: type[BaseModel] | None = None) -> AIRequest:
    return AIRequest(
        task_type=AITaskType.CHAT,
        messages=(AIMessage(MessageRole.USER, "Help me plan."),),
        response_model=response_model,
    )


def test_primary_success_does_not_call_fallback() -> None:
    primary = FakeProvider(ProviderId.OMNIROUTE, ['{"answer":"ready"}'])
    fallback = FakeProvider(ProviderId.GROQ, ['{"answer":"backup"}'])
    router = AIProviderRouter(AISettings(), {primary.provider_id: primary, fallback.provider_id: fallback})

    result = run(router.generate(make_request(AnswerPayload)))

    assert result.provider is ProviderId.OMNIROUTE
    assert result.fallback_used is False
    assert result.structured == AnswerPayload(answer="ready")
    assert len(primary.calls) == 1
    assert fallback.calls == []


@pytest.mark.parametrize("error_type", [AIErrorType.TIMEOUT, AIErrorType.NETWORK_ERROR])
def test_primary_failure_falls_back_once_with_same_request(error_type: AIErrorType) -> None:
    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, error_type, "unavailable", fallback_eligible=True)],
    )
    fallback = FakeProvider(ProviderId.GROQ, ['{"answer":"backup"}'])
    router = AIProviderRouter(AISettings(), {primary.provider_id: primary, fallback.provider_id: fallback})
    request = make_request(AnswerPayload)

    result = run(router.generate(request))

    assert result.provider is ProviderId.GROQ
    assert result.fallback_used is True
    assert primary.calls[0][0] == fallback.calls[0][0]
    assert len(primary.calls) == len(fallback.calls) == 1


def test_groq_can_be_selected_without_calling_primary() -> None:
    primary = FakeProvider(ProviderId.OMNIROUTE, ['should not run'])
    groq = FakeProvider(ProviderId.GROQ, ['groq response'])
    settings = AISettings(ai_provider_mode=ProviderMode.GROQ)
    router = AIProviderRouter(settings, {primary.provider_id: primary, groq.provider_id: groq})

    result = run(router.generate(make_request()))

    assert result.provider is ProviderId.GROQ
    assert primary.calls == []
    assert len(groq.calls) == 1


def test_forced_primary_mode_does_not_fallback() -> None:
    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, AIErrorType.TIMEOUT, "timeout", fallback_eligible=True)],
    )
    fallback = FakeProvider(ProviderId.GROQ, ["unused"])
    settings = AISettings(ai_provider_mode=ProviderMode.OMNIROUTE)
    router = AIProviderRouter(settings, {primary.provider_id: primary, fallback.provider_id: fallback})

    with pytest.raises(AIUnavailableError):
        run(router.generate(make_request()))

    assert len(primary.calls) == 1
    assert fallback.calls == []


def test_both_providers_unavailable_stop_after_two_attempts() -> None:
    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, AIErrorType.NETWORK_ERROR, "offline", fallback_eligible=True)],
    )
    fallback = FakeProvider(
        ProviderId.GROQ,
        [AIProviderError(ProviderId.GROQ, AIErrorType.NETWORK_ERROR, "offline", fallback_eligible=True)],
    )
    router = AIProviderRouter(AISettings(), {primary.provider_id: primary, fallback.provider_id: fallback})

    with pytest.raises(AIUnavailableError) as raised:
        run(router.generate(make_request()))

    assert len(raised.value.errors) == 2
    assert len(primary.calls) == len(fallback.calls) == 1
    assert str(raised.value) == "AI is temporarily unavailable."


def test_unconfigured_providers_return_controlled_error_without_calls() -> None:
    primary = UnconfiguredFakeProvider(ProviderId.OMNIROUTE, ["must not be returned"])
    fallback = UnconfiguredFakeProvider(ProviderId.GROQ, ["must not be returned"])
    router = AIProviderRouter(AISettings(), {primary.provider_id: primary, fallback.provider_id: fallback})

    with pytest.raises(AIUnavailableError) as raised:
        run(router.generate(make_request()))

    assert str(raised.value) == "AI is temporarily unavailable."
    assert [error.error_type for error in raised.value.errors] == [
        AIErrorType.NOT_CONFIGURED,
        AIErrorType.NOT_CONFIGURED,
    ]
    assert primary.calls == fallback.calls == []


def test_invalid_structured_primary_uses_fallback_and_validates() -> None:
    primary = FakeProvider(ProviderId.OMNIROUTE, ['{"answer":4}'])
    fallback = FakeProvider(ProviderId.GROQ, ['{"answer":"valid"}'])
    router = AIProviderRouter(AISettings(), {primary.provider_id: primary, fallback.provider_id: fallback})

    result = run(router.generate(make_request(AnswerPayload)))

    assert result.fallback_used is True
    assert result.structured == AnswerPayload(answer="valid")


def test_invalid_structured_response_from_both_providers_is_rejected() -> None:
    primary = FakeProvider(ProviderId.OMNIROUTE, ['{"answer":4}'])
    fallback = FakeProvider(ProviderId.GROQ, ["not json"])
    router = AIProviderRouter(AISettings(), {primary.provider_id: primary, fallback.provider_id: fallback})

    with pytest.raises(AIUnavailableError) as raised:
        run(router.generate(make_request(AnswerPayload)))

    assert [error.error_type for error in raised.value.errors] == [
        AIErrorType.INVALID_RESPONSE,
        AIErrorType.INVALID_RESPONSE,
    ]


def test_authentication_failure_is_normalized_and_does_not_leak_secret() -> None:
    secret = "private-test-key"

    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/v1/chat/completions")
        return httpx.Response(401, json={"error": "invalid_key", "echo": secret})

    provider = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://gateway.invalid",
        secret,
        "test-model",
        1,
        transport=httpx.MockTransport(respond),
    )

    with pytest.raises(AIProviderError) as raised:
        run(provider.generate(AIProviderRouter._prepare(make_request()), "test-model"))

    assert raised.value.error_type is AIErrorType.AUTH_ERROR
    assert secret not in str(raised.value)


def test_omniroute_adapter_posts_openai_compatible_request() -> None:
    captured: dict[str, object] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["authorization"] = request.headers.get("Authorization")
        captured["body"] = httpx.Response(200, content=request.content).json()
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "primary response"}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 3},
            },
        )

    provider = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid",
        "private-test-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(respond),
    )

    output = run(provider.generate(AIProviderRouter._prepare(make_request()), "omni-model"))

    assert captured["path"] == "/v1/chat/completions"
    assert captured["authorization"] == "Bearer private-test-key"
    assert captured["body"]["model"] == "omni-model"
    assert output.text == "primary response"
    assert output.input_tokens == 10
    assert output.output_tokens == 3


def test_groq_adapter_posts_openai_compatible_request() -> None:
    captured: dict[str, object] = {}

    def respond(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["authorization"] = request.headers.get("Authorization")
        captured["body"] = httpx.Response(200, content=request.content).json()
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "groq response"}}],
                "usage": {"prompt_tokens": 15, "completion_tokens": 5},
            },
        )

    provider = HttpAIProvider(
        ProviderId.GROQ,
        "https://api.groq.com/openai/v1",
        "private-test-key",
        "openai/gpt-oss-20b",
        1,
        transport=httpx.MockTransport(respond),
    )

    output = run(provider.generate(AIProviderRouter._prepare(make_request()), "openai/gpt-oss-20b"))

    # Groq's OpenAI-compatible API is at /openai/v1/...
    assert captured["path"] == "/openai/v1/chat/completions"
    assert captured["authorization"] == "Bearer private-test-key"
    assert captured["body"]["model"] == "openai/gpt-oss-20b"
    assert output.text == "groq response"
    assert output.input_tokens == 15
    assert output.output_tokens == 5


def test_invalid_provider_base_url_is_rejected_at_configuration() -> None:
    with pytest.raises(ValueError, match=r"absolute HTTP\(S\) URL"):
        AISettings(omniroute_base_url="not-a-url")
    with pytest.raises(ValueError, match=r"absolute HTTP\(S\) URL"):
        AISettings(groq_base_url="not-a-url")


def test_primary_auth_failure_uses_fallback_provider() -> None:
    def unauthorized(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/chat/completions"
        return httpx.Response(401, json={"error": "invalid_key"})

    primary = HttpAIProvider(
        ProviderId.OMNIROUTE,
        "https://omni.invalid",
        "private-test-key",
        "omni-model",
        1,
        transport=httpx.MockTransport(unauthorized),
    )
    fallback = FakeProvider(ProviderId.GROQ, ["fallback response"])
    settings = AISettings()
    router = AIProviderRouter(settings, {ProviderId.OMNIROUTE: primary, ProviderId.GROQ: fallback})

    result = run(router.generate(make_request()))

    assert result.provider is ProviderId.GROQ
    assert result.fallback_used is True
    assert len(fallback.calls) == 1


def test_task_model_override_is_selected_without_hardcoding_ids() -> None:
    primary = FakeProvider(ProviderId.OMNIROUTE, ["ok"])
    primary.configured_model = None
    fallback = FakeProvider(ProviderId.GROQ, ["unused"])
    settings = AISettings(ai_task_models={"CHAT": {"omniroute": "configured-chat-model"}})
    router = AIProviderRouter(settings, {primary.provider_id: primary, fallback.provider_id: fallback})

    result = run(router.generate(make_request()))

    assert result.model == "configured-chat-model"


def test_provider_diagnostics_report_missing_configuration_without_secrets() -> None:
    secret = "private-test-key"
    response = get_response(
        create_app(AISettings(_env_file=None, omniroute_api_key=secret, groq_api_key="")),

        "/api/v1/ai/providers",
    )

    assert response.status_code == 200
    assert secret not in response.text
    assert '"api_key":' not in response.text
    assert "not_configured" in response.text


def test_provider_diagnostics_are_hidden_outside_development() -> None:
    response = get_response(
        create_app(AISettings(_env_file=None, app_env="production")),
        "/api/v1/ai/providers",
    )

    assert response.status_code == 404


def test_development_frontend_origin_can_read_provider_status() -> None:
    response = get_response(
        create_app(AISettings(_env_file=None)),
        "/api/v1/ai/providers",
        headers={"Origin": "http://localhost:3001"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3001"