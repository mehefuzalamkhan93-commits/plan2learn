import json
import logging
from time import perf_counter

from pydantic import ValidationError

from app.ai.config import AISettings
from app.ai.contracts import (
    AIErrorType,
    AIMessage,
    AIRequest,
    AIResult,
    MessageRole,
    PreparedAIRequest,
    ProviderHealth,
    ProviderId,
    ProviderMode,
)
from app.ai.errors import AIProviderError, AIUnavailableError
from app.ai.providers import AIProvider, create_providers, GroqProvider


logger = logging.getLogger(__name__)


class AIProviderRouter:
    def __init__(
        self,
        settings: AISettings,
        providers: dict[ProviderId, AIProvider] | None = None,
    ) -> None:
        self.settings = settings
        self.providers = providers or create_providers(settings)

    def _provider_order(self, request: AIRequest) -> tuple[ProviderId, ...]:
        if request.provider_preference is not None:
            return (request.provider_preference,)
        if self.settings.ai_provider_mode is not ProviderMode.AUTO:
            return (ProviderId(self.settings.ai_provider_mode.value),)

        order = [self.settings.ai_primary_provider]
        if request.fallback_allowed and self.settings.ai_fallback_provider not in order:
            order.append(self.settings.ai_fallback_provider)
        return tuple(order)

    def _model_for(self, provider: ProviderId, request: AIRequest) -> str | None:
        if request.model_preference:
            return request.model_preference

        by_task = self.settings.ai_task_models.get(request.task_type.value, {})
        task_model = by_task.get(provider.value)
        if task_model:
            return task_model

        if provider == self.settings.ai_primary_provider and self.settings.ai_primary_model and self.settings.ai_primary_model.strip():
            return self.settings.ai_primary_model.strip()
        if provider == self.settings.ai_fallback_provider and self.settings.ai_fallback_model and self.settings.ai_fallback_model.strip():
            return self.settings.ai_fallback_model.strip()

        selected = self.providers.get(provider)
        return getattr(selected, "configured_model", None)

    @staticmethod
    def _prepare(request: AIRequest) -> PreparedAIRequest:
        messages = request.messages
        if request.response_model is not None:
            schema = json.dumps(request.response_model.model_json_schema(), separators=(",", ":"))
            instruction = (
                "Return only one valid JSON object matching this JSON Schema. "
                "Do not include markdown fences or additional text.\n"
                f"JSON Schema: {schema}"
            )
            messages = (AIMessage(MessageRole.SYSTEM, instruction), *messages)
        return PreparedAIRequest(
            task_type=request.task_type,
            messages=messages,
            response_model=request.response_model,
            max_output_tokens=request.max_output_tokens,
        )

    async def generate(self, request: AIRequest) -> AIResult:
        prepared = self._prepare(request)
        errors: list[AIProviderError] = []
        provider_order = self._provider_order(request)

        for index, provider_id in enumerate(provider_order):
            provider = self.providers.get(provider_id)
            if provider is None:
                errors.append(
                    AIProviderError(
                        provider_id,
                        AIErrorType.NOT_CONFIGURED,
                        "Provider is not available.",
                        fallback_eligible=True,
                    )
                )
                continue

            model = self._model_for(provider_id, request)
            if provider.missing_configuration():
                errors.append(
                    AIProviderError(
                        provider_id,
                        AIErrorType.NOT_CONFIGURED,
                        "Provider is not configured.",
                        fallback_eligible=True,
                    )
                )
                continue
            if not model:
                errors.append(
                    AIProviderError(
                        provider_id,
                        AIErrorType.MODEL_UNAVAILABLE,
                        "No model is configured for this provider and task.",
                        fallback_eligible=True,
                    )
                )
                continue

            started = perf_counter()
            try:
                output = await provider.generate(prepared, model)
                structured = None
                if request.response_model is not None:
                    raw_text = output.text.strip()
                    if "{" in raw_text and "}" in raw_text:
                        start_idx = raw_text.find("{")
                        end_idx = raw_text.rfind("}") + 1
                        raw_text = raw_text[start_idx:end_idx].strip()
                    elif raw_text.startswith("```"):
                        lines = raw_text.splitlines()
                        if lines and lines[0].startswith("```"):
                            lines = lines[1:]
                        if lines and lines[-1].strip().startswith("```"):
                            lines = lines[:-1]
                        raw_text = "\n".join(lines).strip()
                    try:
                        structured = request.response_model.model_validate_json(raw_text)
                    except (ValidationError, ValueError) as err:
                        logger.warning(
                            "Provider %s response validation error: %s raw_sample=%s",
                            provider_id.value,
                            err,
                            raw_text[:200],
                        )
                        raise AIProviderError(
                            provider_id,
                            AIErrorType.INVALID_RESPONSE,
                            "Provider response did not match the required schema.",
                            retryable=True,
                            fallback_eligible=True,
                        ) from None

                latency_ms = round((perf_counter() - started) * 1000)
                fallback_used = index > 0
                logger.info(
                    "AI request succeeded task_type=%s provider=%s model=%s latency_ms=%d fallback_used=%s input_tokens=%s output_tokens=%s",
                    request.task_type.value,
                    provider_id.value,
                    model,
                    latency_ms,
                    fallback_used,
                    output.input_tokens,
                    output.output_tokens,
                )
                return AIResult(
                    text=output.text,
                    structured=structured,
                    provider=provider_id,
                    model=model,
                    latency_ms=latency_ms,
                    fallback_used=fallback_used,
                    input_tokens=output.input_tokens,
                    output_tokens=output.output_tokens,
                )
            except AIProviderError as error:
                errors.append(error)
                logger.warning(
                    "AI request failed task_type=%s provider=%s model=%s error_type=%s",
                    request.task_type.value,
                    provider_id.value,
                    model,
                    error.error_type.value,
                )
                if not error.fallback_eligible:
                    break
            except Exception as unhandled_err:
                logger.exception(
                    "Unexpected error calling provider %s: %s",
                    provider_id.value,
                    unhandled_err,
                )
                errors.append(
                    AIProviderError(
                        provider_id,
                        AIErrorType.PROVIDER_ERROR,
                        f"Unexpected error from provider: {type(unhandled_err).__name__}",
                        retryable=True,
                        fallback_eligible=True,
                    )
                )

        raise AIUnavailableError(tuple(errors))

    async def provider_health(self) -> tuple[ProviderHealth, ...]:
        health: list[ProviderHealth] = []
        for provider_id, provider in self.providers.items():
            if provider_id is self.settings.ai_primary_provider:
                model = self.settings.ai_primary_model or getattr(provider, "configured_model", None)
            elif provider_id is self.settings.ai_fallback_provider:
                model = self.settings.ai_fallback_model or getattr(provider, "configured_model", None)
            else:
                model = getattr(provider, "configured_model", None)
            health.append(await provider.health_check(model))
        return tuple(health)