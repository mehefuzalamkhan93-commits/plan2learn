<!--
Sync Impact Report:
- Version change: Initial Scaffold -> 1.0.0
- Added Principles:
  1. I. Database as Source of Truth (NON-NEGOTIABLE)
  2. II. Explicit User Approval for Plan Commitments (NON-NEGOTIABLE)
  3. III. Dual-Provider AI Resilience (OmniRoute + OpenCode Zen)
  4. IV. Controlled AI-Generated Video & Resource Attachment
  5. V. Test-Grounded & Non-Disruptive Evolution
- Added Sections: System Architecture & Data Governance, Development Workflow & Quality Gates
- Deferred items: None
-->

# Smart Learning Planner Constitution

## Core Principles

### I. Database as Source of Truth (NON-NEGOTIABLE)
Canonical state resides strictly in PostgreSQL. Deterministic backend business logic controls task completion, schedule dates, Pomodoro timers, mastery scores, streak tracking, and exam countdowns. AI models, frontend Zustand stores, and client code MUST NOT invent, calculate, or override core metrics or historical facts.

### II. Explicit User Approval for Plan Commitments (NON-NEGOTIABLE)
AI-generated study plans, schedule revisions, or recommendation changes MUST NOT automatically overwrite student schedules. All AI-proposed plans require explicit student preview and confirmation before database persistence. Every committed plan creates an immutable `StudyPlanVersion` transactionally to preserve historical progress.

### III. Dual-Provider AI Resilience (OmniRoute + OpenCode Zen)
AI interactions execute through a provider-neutral abstraction (`AIProviderRouter`). Default execution order is OmniRoute (Primary) with single fallback to OpenCode Zen (Secondary). Automated fallback triggers only on timeouts, outages, auth errors, or model unavailability (max 1 fallback attempt per request). Provider credentials remain strictly server-side (`.env`).

### IV. Controlled AI-Generated Video & Resource Attachment
LLMs MUST NOT fabricate YouTube URLs or resource links. Recommendations use candidate retrieval from official APIs, followed by AI ranking over retrieved metadata. Video resources attach to specific topics/tasks only after metadata validation and explicit user confirmation.

### V. Test-Grounded & Non-Disruptive Evolution
Frontend UX (`/dashboard`, `/focus`, `/ai`) and responsive design contracts MUST remain stable and warning-free. Every database/API increment must be accompanied by automated validation (`pytest` for backend, `tsc`/`lint`/`build` for frontend). The application must remain bootable and healthy after every major phase.

## System Architecture & Data Governance

### Stack Alignment
- **Backend**: FastAPI, PostgreSQL, SQLAlchemy 2, Alembic migrations, Pydantic settings.
- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Zustand, Lucide React, Framer Motion.
- **Build Isolation**: Development build artifacts (`.next-dev`) are strictly separated from production build artifacts (`.next`) to prevent cache contamination and webpack module loading race conditions.

### Security & Privacy
- User data is strictly owner-isolated; server endpoints derive ownership from authenticated credentials rather than unverified request parameters.
- Provider keys and secrets remain isolated in `backend/.env` and MUST NEVER be exposed to frontend code, browser diagnostic endpoints, or public version control.

## Development Workflow & Quality Gates

### Execution Quality Gates
- **Plan First**: Architectural changes require explicit implementation plans before generating code.
- **Schema Management**: Database changes MUST use Alembic migrations.
- **Validation Standard**: All changes must pass `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `pytest` with zero warnings or errors.

## Governance

This Constitution governs all architectural decisions, code changes, and AI integrations for the Smart Learning Planner project. Amendments require explicit documentation, version incrementation, and full test validation.

**Version**: 1.0.0 | **Ratified**: 2026-10-03 | **Last Amended**: 2026-10-03
