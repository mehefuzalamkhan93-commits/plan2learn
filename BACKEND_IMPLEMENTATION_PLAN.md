# Backend Implementation Plan

## Audit Findings

This is a frontend-only prototype today. The root has no `backend/` directory or Git metadata. The backend stack described in `README.md` is a target, not a running implementation.

| Area | Current state | Reusable foundation |
| --- | --- | --- |
| Backend runtime | No API server or Next.js API route handlers | README documents FastAPI and Python 3.11+; Python 3.14.4 is available through the Windows `py` launcher |
| Database | No database, ORM, migrations, or database configuration | README specifies PostgreSQL, SQLAlchemy, and Alembic; no local PostgreSQL service or Docker command is available |
| Authentication | No real authentication or user ownership; onboarding state is client-side Zustand state | `authAPI` already describes signup/login response shapes, but has no server or token handling |
| APIs | `frontend/src/services/api.ts` is an Axios client only; no matching implementation exists | Existing `/api/v1` client base URL and TypeScript request/response types can guide compatibility adapters |
| AI | No model provider, prompt service, structured extraction, or AI routes | README mentions LangChain as future work; keep provider integration behind a server-side interface |
| Data models | Frontend interfaces in `frontend/src/types/index.ts`; planner records are hardcoded in `frontend/src/store/usePlannerStore.ts` | `UserProfile`, `Topic`, `PlanItem`, `ProgressLog`, and review-related types are useful initial API DTO references, not database schemas |
| Resources | Recommendation UI and sample records exist; no YouTube API integration or validation | Existing video display fields can be adapted to a canonical `videoId`-based resource model |
| Runtime configuration | Only frontend API/WS URL examples exist; no backend secrets/configuration | `frontend/.env.example` points to `http://localhost:8000/api/v1` |
| Routes | Dashboard is currently at `/`; `/focus` and `/onboarding` exist; `/ai` does not | Preserve the current dashboard and Focus UX; add `/dashboard` as a non-breaking route/alias when integrating real data |

The existing frontend API contract includes user IDs in paths for some operations. New backend authorization must derive the owner from the authenticated principal, not trust a client-supplied user ID. The demo Zustand state is in-memory and contains no production records to migrate.

## Target Architecture

- **Backend:** FastAPI with Pydantic request/response schemas and domain services.
- **Canonical storage:** PostgreSQL, SQLAlchemy 2, Alembic migrations. Database rows are the source of truth.
- **Authentication:** Start with email/password and signed access tokens in secure, HttpOnly cookies; all student-owned queries scope through the authenticated user. Add OAuth only when a provider is selected.
- **Planning:** Deterministic validation and schedule/business rules run server-side. AI produces schema-validated proposals only; applying a proposal requires explicit user approval and a transaction that creates a new plan version.
- **AI:** Provider-neutral interface, server-only secrets, structured outputs, targeted context retrieval, recent-message window, and durable conversation/message records. Never persist hidden chain-of-thought.
- **Events:** Persist meaningful domain events with state changes. Start with an outbox and a lightweight worker only when asynchronous AI work is introduced; do not add Redis/WebSockets for ordinary dashboard refreshes.
- **YouTube:** Search and verify candidates through the official YouTube Data API, rank only returned metadata, store canonical video IDs and verification timestamps, and never accept model-invented URLs.
- **Frontend:** Keep `/` compatible while adding `/dashboard` and a separate `/ai` workspace. Replace demo sources incrementally through typed API adapters; do not put provider credentials or business truth in the browser.

## Data Model Outline

All records are owned by a user directly or through a user-owned plan/topic. IDs should be opaque UUIDs at the API boundary. Core entities:

- Identity/profile: `User`, `StudentProfile`, `UserPreference`, `RecommendationPreference`.
- Curriculum: `Subject`, `Topic`, `Exam`, syllabus/topic relationships, `MasteryRecord`.
- Planning: `StudyPlan`, immutable `StudyPlanVersion`, `StudyTask`, `TaskDependency`.
- Activity: `StudySession`, `ReviewItem`, review submissions, `DomainEvent`/outbox.
- Resources: `Resource` with canonical `videoId`, metadata, language, relevance, verification and availability state.
- AI: `AIConversation`, `AIMessage`, `AIInsight`, `AIRecommendation` with lifecycle state, provenance, reason codes, and dismissal/cooldown metadata.

Keep completed historical tasks and sessions immutable. A replan changes only future work and creates a new plan version with traceable source/reason metadata.

## Delivery Order and Gates

1. **Audit and runnable baseline:** document current state; add a versioned health endpoint and automated test. No database dependency required to boot.
2. **Database and migrations:** add settings, SQLAlchemy session management, Alembic, PostgreSQL configuration, and initial User/StudentProfile/Curriculum/Plan tables. Verify fresh and upgrade migrations against PostgreSQL in CI or a provisioned service.
3. **Authentication/ownership:** registration/login, password hashing, secure token handling, current-user dependency, and cross-user authorization tests.
4. **Canonical tasks and schedule:** topic/task CRUD and schedule reads; validate date, duration, capacity, and overlaps. Seed demo data through an explicit development seed path, not frontend constants.
5. **Study history:** deterministic session start/complete/skip events and persisted duration; Pomodoro remains application logic.
6. **Reviews and spaced repetition:** persist confidence and deterministic review intervals; test calculations independently of AI.
7. **Mastery/readiness:** deterministic aggregation from owned history, with freshness and provenance.
8. **Dashboard integration:** replace Zustand demo reads with typed API queries/mutations; preserve existing dashboard layout, Focus flow, and `/` while adding `/dashboard` compatibility.
9. **AI conversation infrastructure:** separate `/ai` route and backend conversation/message APIs, ownership checks, context retrieval interfaces, and bounded history.
10. **Structured profile extraction:** conversational onboarding writes validated structured facts separately from messages; user corrections update explicit profile fields.
11. **Plan generation/preview:** AI returns a versioned schema-validated proposal with reason codes; preview includes date, topic, duration, priority, reason, review timing, and optional validated resource.
12. **Approval/versioning:** validate ownership, topic existence, dates, availability, conflicts, and capacity; require explicit approval; commit a new `StudyPlanVersion` transactionally.
13. **Adaptive synchronization:** classify event impact; update deterministic canonical state immediately; enqueue only meaningful reevaluations; never revise completed history.
14. **Recommendations:** add optional lifecycle and user dismissal/cooldown preferences; suppress repeated dismissed recommendations.
15. **YouTube search/ranking:** official API candidate retrieval, metadata/accessibility validation, topic-specific ranking, language/duration preferences, quota/error handling.
16. **Resource attachment:** attach validated resources to topics/tasks only after any required user confirmation.
17. **End-to-end integration:** verify dashboard and AI share the same owner-scoped backend state and approvals update the dashboard without reload where practical.
18. **Hardening:** authorization, migration, conflict, provider-failure, cost/context, responsive UI, and end-to-end tests; document operations and backup/recovery.

Each phase must leave the app bootable and its tests passing. Do not start the next persistence-dependent phase until its database/test environment is available.

## Risks and Decisions

- **No Git repository detected:** there is no local commit history or diff baseline; keep changes narrow and retain existing files.
- **No local PostgreSQL/Docker:** migrations and ownership behavior cannot be proven locally until a database is provisioned. SQLite may be used for isolated unit tests but is not a substitute for PostgreSQL migration/integration tests.
- **Python command selection:** the Windows `python` alias is unavailable and the default `py` target points to a missing install; use the verified `py -V:Astral/CPython3.14.4` interpreter or a configured project virtual environment.
- **Legacy demo/API mismatch:** frontend paths and response wrappers are prototypes; define a canonical `/api/v1` contract and adapt the client instead of preserving insecure user-ID path semantics.
- **Data migration:** demo data has no persistence, so seed it as development fixtures rather than migrating hardcoded arrays into production.
- **External services:** authentication deployment, LLM provider/model, YouTube API key/quota, and worker hosting are undecided. Keep interfaces/configuration provider-neutral and require secrets only in server environments.
- **Scope/cost:** defer Redis, WebSockets, vector search, and always-on AI reevaluation until measured requirements justify them. Use targeted relational retrieval first.

## First Increment

Add a small FastAPI application exposing `GET /api/v1/health`, with a test and local run instructions. This proves the backend entry point and API version convention without implying that authentication, persistence, or AI is already implemented. The next increment is the PostgreSQL/Alembic schema after the database test environment is agreed and available.

## Dual-Provider Increment

The health baseline is implemented. The current AI infrastructure increment adds a provider-neutral request/result/error contract, OmniRoute as the default primary, OpenCode Zen as the default fallback, `auto`/forced-provider modes, per-provider runtime configuration/timeouts, task/provider model overrides, structured Pydantic validation, one-fallback maximum, safe request metadata logging, and development-only provider diagnostics. Zen's protocol is explicitly configured per selected model; text-generation adapters currently cover OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages. Other catalog protocols are recognized and rejected as unsupported rather than receiving a malformed request.

Official protocol references used: [OpenCode Zen endpoint/model catalog](https://opencode.ai/docs/zen/) and [OpenCode provider protocol guidance](https://opencode.ai/docs/providers/). The installed OmniRoute CLI documents its generated OpenCode integration as OpenAI-compatible and advertises a default local server port of 20128; the application does not hardcode that host or port.

This is provider infrastructure, not the student AI product flow. No provider environment variables are configured in the current backend process, so live calls/failover cannot be claimed. The chat API/UI, authentication, ownership-scoped context, persistence, plan proposal/approval, recommendations, and YouTube workflow remain later phases. In particular, do not expose a public chat endpoint until authentication and user ownership are in place.