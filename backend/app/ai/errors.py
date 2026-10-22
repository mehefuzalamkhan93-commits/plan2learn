from app.ai.contracts import AIErrorType, ProviderId


class AIProviderError(Exception):
    def __init__(
        self,
        provider: ProviderId | None,
        error_type: AIErrorType,
        message: str,
        *,
        status_code: int | None = None,
        retryable: bool = False,
        fallback_eligible: bool = True,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.error_type = error_type
        self.status_code = status_code
        self.retryable = retryable
        self.fallback_eligible = fallback_eligible


class AIUnavailableError(Exception):
    def __init__(self, errors: tuple[AIProviderError, ...]) -> None:
        super().__init__("AI is temporarily unavailable.")
        self.errors = errors

    @property
    def is_configuration_error(self) -> bool:
        return bool(self.errors) and all(
            err.error_type in (AIErrorType.NOT_CONFIGURED, AIErrorType.MODEL_UNAVAILABLE)
            for err in self.errors
        )