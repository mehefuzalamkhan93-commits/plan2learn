from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.ai.contracts import ProviderId, ProviderMode


class AISettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "development"
    cors_allowed_origins: list[str] = Field(default_factory=list)
    jwt_secret_key: str | None = Field(default=None, repr=False)
    ai_provider_mode: ProviderMode = ProviderMode.AUTO
    ai_primary_provider: ProviderId = ProviderId.OMNIROUTE
    ai_fallback_provider: ProviderId = ProviderId.GROQ
    ai_primary_model: str | None = None
    ai_fallback_model: str | None = None
    ai_task_models: dict[str, dict[str, str]] = Field(default_factory=dict)

    omniroute_base_url: str | None = None
    omniroute_api_key: str | None = Field(default=None, repr=False)
    omniroute_model: str | None = "auto/best-fast"
    omniroute_timeout_seconds: float = Field(default=120, gt=0, le=180)

    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_api_key: str | None = Field(default=None, repr=False)
    groq_model: str | None = "openai/gpt-oss-20b"
    groq_fallback_model: str | None = "openai/gpt-oss-120b"
    groq_timeout_seconds: float = Field(default=30, gt=0, le=180)

    # YouTube Data API v3
    youtube_api_key: str | None = Field(default=None, repr=False)

    # Google Drive / OAuth 2.0 (backend-managed authorization-code flow)
    google_drive_enabled: bool = True
    google_drive_client_id: str | None = None
    google_drive_client_secret: str | None = Field(default=None, repr=False)
    google_drive_redirect_uri: str = "https://plan2learn.onrender.com/api/v1/ai/drive/callback"
    # Optional Google Picker support (browser API key is public by design; it is
    # NOT a client secret). app_id is the OAuth client's project number.
    google_drive_api_key: str | None = None
    google_drive_app_id: str | None = None
    # Where the OAuth callback redirects the browser afterwards.
    frontend_base_url: str = "https://plan2learn-ashen.vercel.app"

    @field_validator("ai_task_models", mode="before")
    @classmethod
    def normalize_task_model_keys(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        return {
            str(task).upper(): {
                str(provider).lower(): model
                for provider, model in models.items()
            }
            for task, models in value.items()
            if isinstance(models, dict)
        }

    @field_validator("omniroute_base_url", "groq_base_url")
    @classmethod
    def validate_provider_base_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return value
        value = value.strip().rstrip("/")
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("Provider base URL must be an absolute HTTP(S) URL.")
        if parsed.query or parsed.fragment:
            raise ValueError("Provider base URL must not include a query or fragment.")
        return value


def get_ai_settings() -> AISettings:
    return AISettings()