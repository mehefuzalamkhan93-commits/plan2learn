# Backend

The backend is being added incrementally. It currently has a versioned FastAPI health endpoint and a provider-neutral OmniRoute/Groq router. PostgreSQL persistence, authentication, planner APIs, and the student AI chat flow are not implemented yet. See [the implementation plan](../BACKEND_IMPLEMENTATION_PLAN.md) for the audit and delivery gates.

## Run locally

From this directory, create a virtual environment and install the dependencies:

```powershell
py -V:Astral/CPython3.14.4 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

The health endpoint is `http://localhost:8000/api/v1/health`; interactive API docs are at `http://localhost:8000/docs`.

## AI provider configuration

Copy `.env.example` to `.env` in this directory and configure server-side values. Never use `NEXT_PUBLIC_` for provider secrets.

- `AI_PROVIDER_MODE=auto` tries the configured primary once, then the fallback at most once. `omniroute` and `groq` modes call only that provider.
- Set `AI_PRIMARY_PROVIDER` / `AI_FALLBACK_PROVIDER` and their model values independently. `AI_TASK_MODELS` may override models by task and provider using JSON, for example `{"CHAT":{"omniroute":"<catalog-id>","groq":"<catalog-id>"}}`.
- Set `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`, and `OMNIROUTE_MODEL` for OmniRoute's OpenAI-compatible API.
- Set `GROQ_BASE_URL`, `GROQ_API_KEY`, `GROQ_MODEL`, and `GROQ_FALLBACK_MODEL` for Groq's OpenAI-compatible API (free tier). Default base URL is `https://api.groq.com/openai/v1`. Default models are `openai/gpt-oss-20b` (primary) and `openai/gpt-oss-120b` (fallback for quota-exhaustion scenarios; not automatically selected on 429).
- Provider-specific timeout values are `OMNIROUTE_TIMEOUT_SECONDS` and `GROQ_TIMEOUT_SECONDS`.

The development-only `GET /api/v1/ai/providers` checks configured providers through their model catalog endpoint and returns status, configured model, missing setting names, and capabilities. It never returns keys and is hidden unless `APP_ENV=development`. Protect or replace this diagnostic route when authentication is implemented. If no providers are configured, it reports `not_configured`; generation returns a controlled unavailable error rather than fabricated content.

Run the smoke tests from the same directory:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

The health and provider-router tests intentionally require no database or live provider credentials. PostgreSQL and Alembic will be introduced with the schema phase, after a migration-capable database environment is available. Provider protocol tests use mocked HTTP responses; a successful live provider call still requires locally configured credentials.