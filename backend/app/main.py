from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.ai.config import AISettings, get_ai_settings
from app.ai.contracts import ProviderHealth
from app.ai.router import AIProviderRouter
from app.api.auth import router as auth_router
from app.api.onboarding import router as onboarding_router
from app.api.ai import router as ai_router
from app.api.planner import router as planner_router
from app.api.dashboard import router as dashboard_router


class HealthResponse(BaseModel):
    status: Literal["ok"]


class ProviderHealthResponse(BaseModel):
    mode: str
    primary_provider: str
    fallback_provider: str
    fallback_enabled: bool
    providers: tuple[ProviderHealth, ...]


def create_app(settings: AISettings | None = None) -> FastAPI:
    ai_settings = settings or get_ai_settings()
    provider_router = AIProviderRouter(ai_settings)
    application = FastAPI(
        title="Plan2Learn API",
        version="0.1.0",
    )

    development_origins = (
        [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ]
        if ai_settings.app_env.lower() == "development"
        else []
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=ai_settings.cors_allowed_origins or development_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(auth_router, prefix="/api/v1")
    application.include_router(onboarding_router, prefix="/api/v1")
    application.include_router(ai_router, prefix="/api/v1")
    application.include_router(planner_router, prefix="/api/v1")
    application.include_router(dashboard_router, prefix="/api/v1")

    # Drive endpoints resolve configuration from app.state (dependency
    # injection friendly) with the global env config as the production default.
    application.state.google_drive_settings = ai_settings

    @application.get("/", tags=["system"])
    async def root() -> dict[str, Any]:
        return {
            "name": "Plan2Learn API",
            "status": "online",
            "docs": "/docs",
            "health": "/api/v1/health",
            "version": "0.1.0",
        }

    @application.get("/health", response_model=HealthResponse, tags=["system"])
    @application.get("/api/v1/health", response_model=HealthResponse, tags=["system"])
    async def health_check() -> HealthResponse:
        return HealthResponse(status="ok")

    @application.get("/v1/models", tags=["system"])
    @application.get("/api/v1/models", tags=["system"])
    async def list_models() -> dict[str, Any]:
        cfg = settings or get_ai_settings()
        seen = set()
        models = []
        for model_id, owner in [
            (cfg.omniroute_model, "omniroute"),
            (cfg.groq_model, "groq"),
            (cfg.groq_fallback_model, "groq"),
        ]:
            if model_id and model_id not in seen:
                seen.add(model_id)
                models.append({
                    "id": model_id,
                    "object": "model",
                    "created": 1700000000,
                    "owned_by": owner,
                })
        return {"object": "list", "data": models}

    @application.get("/api/v1/ai/providers", response_model=ProviderHealthResponse, tags=["ai"])
    async def provider_health() -> ProviderHealthResponse:
        current_settings = settings or get_ai_settings()
        current_router = AIProviderRouter(current_settings)
        if current_settings.app_env.lower() != "development":
            raise HTTPException(status_code=404, detail="Not found")
        return ProviderHealthResponse(
            mode=current_settings.ai_provider_mode.value,
            primary_provider=current_settings.ai_primary_provider.value,
            fallback_provider=current_settings.ai_fallback_provider.value,
            fallback_enabled=(
                current_settings.ai_provider_mode.value == "auto"
                and current_settings.ai_primary_provider != current_settings.ai_fallback_provider
            ),
            providers=await current_router.provider_health(),
        )

    return application


app = create_app()