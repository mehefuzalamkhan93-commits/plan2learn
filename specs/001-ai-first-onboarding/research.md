# Technical Research & Decision Log: Authentication → Student Onboarding → AI-First Learning Setup

## 1. Authentication & Session Management Architecture

### Decision
Use JWT (JSON Web Tokens) with `HS256` signing issued via HttpOnly, SameSite=Lax cookies for browser security, backed by server-side `User` records and `passlib` with `bcrypt`/`argon2` for password hashing.

### Rationale
- **Security**: HttpOnly cookies prevent XSS token theft, while SameSite=Lax protects against CSRF for standard navigation.
- **Stateless Verification**: FastAPI dependency (`get_current_user`) decodes and validates JWT claims without hitting the database on every micro-check, while DB lookup ensures active user state.
- **Client Simplicity**: Next.js App Router middleware and client services inherit automatic credential transmission via Axios (`withCredentials: true`).

### Alternatives Considered
- **Raw Bearer Tokens in localStorage**: Rejected because localStorage is vulnerable to XSS script access and requires manual header injection on every request.
- **Session DB Storage (Redis)**: Rejected for MVP scope to avoid adding Redis infrastructure before scale demands it. Relational user lookup via JWT is lightweight and sufficient.

---

## 2. Database Schema & Migration Strategy

### Decision
Use PostgreSQL with SQLAlchemy 2.0 declarative models and Alembic for versioned schema migrations. All IDs use UUIDv4 strings.

### Rationale
- **Constitution Mandate**: Database is the canonical source of truth.
- **Versioning**: `StudyPlan` metadata links to an active `StudyPlanVersion`. When a student approves a new or revised plan, a new `StudyPlanVersion` row is created transactionally along with its constituent `StudyTask` rows, preserving historical study logs.
- **Alembic**: Explicit, version-controlled SQL migration scripts ensure reproducible database state across development and production environments.

### Alternatives Considered
- **Single Mutable `StudyPlan` Table**: Rejected because overwriting schedule rows destroys historical compliance logs and prevents auditability or rollback.

---

## 3. Dual-Provider AI Routing Integration

### Decision
Reuse the existing backend `AIProviderRouter` (`backend/app/ai/router.py`) without modifying its contracts or creating duplicate AI abstractions.

### Rationale
- Primary route: OmniRoute (`auto/smart`).
- Secondary fallback: OpenCode Zen (`big-pickle`).
- Single fallback maximum per request enforced by `AIProviderRouter`.
- Structured output enforced via Pydantic model JSON schemas passed into `AIRequest(response_model=...)`.

### Alternatives Considered
- **Direct Provider Calls in API Handlers**: Rejected because scattered provider logic violates the dual-provider architecture and bypasses standard fallback and diagnostic monitoring.

---

## 4. AI Study Plan Proposal & Transactional Commitment Flow

### Decision
Implement a 2-step Proposal → Confirmation lifecycle:
1. **Proposal Generation**: The AI processes `StudentProfile` and conversation history, producing a validated `StudyPlanProposal` Pydantic payload (ephemeral, not saved to schedule tables).
2. **Preview & Confirmation**: The frontend displays an interactive Plan Preview modal (`/ai`). Clicking "Build My Plan" sends a POST request to `/api/v1/planner/confirm-plan` containing the proposal payload.
3. **Database Transaction**: The backend validates capacity/constraints and executes a single PostgreSQL transaction that creates `StudyPlanVersion` + `StudyTask` rows, sets `isOnboarded=true`, and redirects the user to `/dashboard`.

### Rationale
- Fulfills the Constitution Rule: AI proposals MUST NOT automatically overwrite student schedules without explicit student review and approval.
- Transactional integrity ensures zero partial or corrupt schedule commits.

### Alternatives Considered
- **Instant Background Persistence**: Rejected because auto-committing AI proposals violates user control and constitution directives.

---

## 5. Dashboard Data Hydration & Empty States

### Decision
Replace hardcoded Zustand demo data in `frontend/src/store/usePlannerStore.ts` with API-backed queries fetched from backend endpoints (`/api/v1/dashboard/summary`, `/api/v1/tasks/today`, `/api/v1/reviews/queue`, etc.).

### Rationale
- Real database state ensures dashboard reflects actual committed tasks, streak, readiness score, and mastery levels.
- Empty states (e.g., "No tasks scheduled for today", "0 reviews due") are rendered explicitly when data is absent, eliminating fake dummy arrays.
