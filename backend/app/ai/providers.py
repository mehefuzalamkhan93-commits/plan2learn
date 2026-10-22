import json
from collections.abc import Mapping
from typing import Protocol

import httpx

from app.ai.config import AISettings
from app.ai.contracts import (
    AIErrorType,
    PreparedAIRequest,
    ProviderHealth,
    ProviderId,
    ProviderOutput,
)
from app.ai.errors import AIProviderError


class AIProvider(Protocol):
    provider_id: ProviderId

    def missing_configuration(self) -> tuple[str, ...]: ...

    def get_capabilities(self) -> tuple[str, ...]: ...

    async def generate(self, request: PreparedAIRequest, model: str) -> ProviderOutput: ...

    async def health_check(self, model: str | None) -> ProviderHealth: ...


class HttpAIProvider:
    """Base HTTP provider for OpenAI-compatible APIs (OmniRoute, Groq)."""

    def __init__(
        self,
        provider_id: ProviderId,
        base_url: str | None,
        api_key: str | None,
        configured_model: str | None,
        timeout_seconds: float,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.provider_id = provider_id
        self.base_url = base_url.rstrip("/") if base_url else None
        self.api_key = api_key
        self.configured_model = configured_model
        self.timeout_seconds = timeout_seconds
        self.transport = transport

    def missing_configuration(self) -> tuple[str, ...]:
        required = [
            ("base_url", self.base_url),
            ("api_key", self.api_key),
        ]
        missing = [name for name, value in required if not value]
        return tuple(missing)

    def get_capabilities(self) -> tuple[str, ...]:
        return ("text_generation", "runtime_schema_validation", "health_check")

    def _supports_text_generation(self) -> bool:
        return "text_generation" in self.get_capabilities()

    def _url(self, path: str) -> str:
        if self.base_url is None:
            raise AIProviderError(
                self.provider_id,
                AIErrorType.NOT_CONFIGURED,
                "Provider base URL is not configured.",
            )
        suffix = path.lstrip("/")
        base = self.base_url
        if base.endswith("/v1") and suffix.startswith("v1/"):
            suffix = suffix[3:]
        return f"{base}/{suffix}"

    def _headers(self) -> dict[str, str]:
        if self.api_key is None:
            raise AIProviderError(
                self.provider_id,
                AIErrorType.NOT_CONFIGURED,
                "Provider API key is not configured.",
            )
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def _endpoint(self) -> str:
        return "/v1/chat/completions"

    def _payload(self, request: PreparedAIRequest, model: str) -> dict[str, object]:
        systems = [
            message.content for message in request.messages if message.role.value == "system"
        ]
        non_systems = [
            {"role": message.role.value, "content": message.content}
            for message in request.messages
            if message.role.value != "system"
        ]
        messages: list[dict[str, str]] = []
        if systems:
            messages.append({"role": "system", "content": "\n\n".join(systems)})
        for msg in non_systems:
            if messages and messages[-1]["role"] == msg["role"] and msg["role"] != "system":
                messages[-1]["content"] = f"{messages[-1]['content']}\n\n{msg['content']}"
            else:
                messages.append(dict(msg))
        return {
            "model": model,
            "messages": messages,
            "max_tokens": request.max_output_tokens,
            "stream": False,
        }

    @staticmethod
    def _usage(data: Mapping[str, object]) -> tuple[int | None, int | None]:
        usage = data.get("usage")
        if not isinstance(usage, Mapping):
            return None, None
        input_tokens = usage.get("prompt_tokens", usage.get("input_tokens"))
        output_tokens = usage.get("completion_tokens", usage.get("output_tokens"))
        return (
            input_tokens if isinstance(input_tokens, int) else None,
            output_tokens if isinstance(output_tokens, int) else None,
        )

    def _extract_text(self, data: Mapping[str, object]) -> str:
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            first = choices[0]
            if isinstance(first, Mapping):
                message = first.get("message")
                if isinstance(message, Mapping):
                    content = message.get("content")
                    if isinstance(content, str) and content.strip():
                        return content
                    if isinstance(content, list):
                        parts = [
                            part.get("text")
                            for part in content
                            if isinstance(part, Mapping) and isinstance(part.get("text"), str)
                        ]
                        extracted = "".join(parts)
                        if extracted.strip():
                            return extracted

        raise AIProviderError(
            self.provider_id,
            AIErrorType.INVALID_RESPONSE,
            "Provider response did not contain generated text.",
            retryable=True,
            fallback_eligible=True,
        )

    @staticmethod
    def _error_for_status(provider_id: ProviderId, status_code: int) -> AIProviderError:
        if status_code in (401, 403):
            return AIProviderError(
                provider_id,
                AIErrorType.AUTH_ERROR,
                "Provider authentication failed.",
                status_code=status_code,
                fallback_eligible=True,
            )
        if status_code in (408, 504):
            return AIProviderError(
                provider_id,
                AIErrorType.TIMEOUT,
                "Provider request timed out.",
                status_code=status_code,
                retryable=True,
                fallback_eligible=True,
            )
        if status_code == 429:
            return AIProviderError(
                provider_id,
                AIErrorType.RATE_LIMIT,
                "Provider rate limit was reached.",
                status_code=status_code,
                retryable=True,
                fallback_eligible=True,
            )
        if status_code == 404:
            return AIProviderError(
                provider_id,
                AIErrorType.MODEL_UNAVAILABLE,
                "Provider endpoint or model is unavailable.",
                status_code=status_code,
                fallback_eligible=True,
            )
        retryable = status_code >= 500
        return AIProviderError(
            provider_id,
            AIErrorType.PROVIDER_ERROR,
            "Provider request failed.",
            status_code=status_code,
            retryable=retryable,
            fallback_eligible=True,
        )

    async def generate(self, request: PreparedAIRequest, model: str) -> ProviderOutput:
        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds,
                transport=self.transport,
            ) as client:
                response = await client.post(
                    self._url(self._endpoint()),
                    headers=self._headers(),
                    json=self._payload(request, model),
                )
        except httpx.TimeoutException as error:
            raise AIProviderError(
                self.provider_id,
                AIErrorType.TIMEOUT,
                "Provider request timed out.",
                retryable=True,
                fallback_eligible=True,
            ) from error
        except httpx.RequestError as error:
            raise AIProviderError(
                self.provider_id,
                AIErrorType.NETWORK_ERROR,
                "Provider could not be reached.",
                retryable=True,
                fallback_eligible=True,
            ) from error

        if response.is_error:
            raise self._error_for_status(self.provider_id, response.status_code)

        try:
            data = response.json()
        except json.JSONDecodeError as error:
            raise AIProviderError(
                self.provider_id,
                AIErrorType.INVALID_RESPONSE,
                "Provider returned invalid JSON.",
                retryable=True,
                fallback_eligible=True,
            ) from error
        if not isinstance(data, Mapping):
            raise AIProviderError(
                self.provider_id,
                AIErrorType.INVALID_RESPONSE,
                "Provider returned an invalid response shape.",
                retryable=True,
                fallback_eligible=True,
            )

        text = self._extract_text(data)
        if not text.strip():
            raise AIProviderError(
                self.provider_id,
                AIErrorType.INVALID_RESPONSE,
                "Provider returned empty generated text.",
                retryable=True,
                fallback_eligible=True,
            )
        input_tokens, output_tokens = self._usage(data)
        return ProviderOutput(text, input_tokens, output_tokens)

    async def health_check(self, model: str | None) -> ProviderHealth:
        missing = self.missing_configuration()
        selected_model = model or self.configured_model
        if selected_model is None:
            missing = (*missing, "model")
        if missing:
            return ProviderHealth(
                provider=self.provider_id,
                status="not_configured",
                model=selected_model,
                protocol=None,
                missing_configuration=missing,
                capabilities=self.get_capabilities(),
            )
        if not self._supports_text_generation():
            return ProviderHealth(
                self.provider_id,
                "unsupported_capability",
                selected_model,
                None,
                error_type=AIErrorType.UNSUPPORTED_CAPABILITY,
                capabilities=self.get_capabilities(),
            )

        try:
            async with httpx.AsyncClient(
                timeout=self.timeout_seconds,
                transport=self.transport,
            ) as client:
                response = await client.get(
                    self._url("/v1/models"),
                    headers=self._headers(),
                )
        except httpx.TimeoutException:
            return ProviderHealth(
                self.provider_id,
                "unavailable",
                model or self.configured_model,
                None,
                error_type=AIErrorType.TIMEOUT,
            )
        except httpx.RequestError:
            return ProviderHealth(
                self.provider_id,
                "unavailable",
                model or self.configured_model,
                None,
                error_type=AIErrorType.NETWORK_ERROR,
            )

        if response.is_error:
            error = self._error_for_status(self.provider_id, response.status_code)
            return ProviderHealth(
                self.provider_id,
                "unavailable",
                model or self.configured_model,
                None,
                error_type=error.error_type,
            )

        try:
            data = response.json()
        except json.JSONDecodeError:
            return ProviderHealth(
                self.provider_id,
                "unavailable",
                model or self.configured_model,
                None,
                error_type=AIErrorType.INVALID_RESPONSE,
            )

        models = data.get("data") if isinstance(data, Mapping) else None
        ids = {
            item.get("id")
            for item in models
            if isinstance(item, Mapping) and isinstance(item.get("id"), str)
        } if isinstance(models, list) else set()
        model_available = selected_model in ids if ids else None
        status = "model_unavailable" if model_available is False else "healthy"
        return ProviderHealth(
            self.provider_id,
            status,
            selected_model,
            None,
            error_type=AIErrorType.MODEL_UNAVAILABLE if model_available is False else None,
        )


class GroqProvider(HttpAIProvider):
    """Groq provider using OpenAI-compatible API.

    Free tier limits (as of 2024):
    - 30 requests per minute (RPM)
    - 6,000 tokens per minute (TPM)
    - 14,400 requests per day
    - Models: openai/gpt-oss-20b, openai/gpt-oss-120b (free tier)

    This provider handles rate limiting gracefully without automatic retries
    that could exhaust the free quota.
    """

    def __init__(
        self,
        base_url: str | None,
        api_key: str | None,
        configured_model: str | None,
        fallback_model: str | None,
        timeout_seconds: float,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        super().__init__(
            ProviderId.GROQ,
            base_url,
            api_key,
            configured_model,
            timeout_seconds,
            transport=transport,
        )
        self.fallback_model = fallback_model

    def get_fallback_model(self) -> str | None:
        """Return the fallback model for quota-exhaustion scenarios.

        Note: This is informational only. The router does NOT automatically
        switch to the fallback model on 429 errors to avoid consuming
        additional quota. The caller must explicitly request the fallback model.
        """
        return self.fallback_model


def create_providers(settings: AISettings) -> dict[ProviderId, HttpAIProvider]:
    return {
        ProviderId.OMNIROUTE: HttpAIProvider(
            ProviderId.OMNIROUTE,
            settings.omniroute_base_url,
            settings.omniroute_api_key,
            settings.omniroute_model,
            settings.omniroute_timeout_seconds,
        ),
        ProviderId.GROQ: GroqProvider(
            settings.groq_base_url,
            settings.groq_api_key,
            settings.groq_model,
            settings.groq_fallback_model,
            settings.groq_timeout_seconds,
        ),
    }