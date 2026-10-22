# Implementation Plan: Authentication → Student Onboarding → AI-First Learning Setup

**Branch**: `001-ai-first-onboarding` | **Date**: 2026-10-03 | **Spec**: [specs/001-ai-first-onboarding/spec.md](spec.md)

**Input**: Feature specification from `/specs/001-ai-first-onboarding/spec.md`

## Summary

Implement the complete first-time student onboarding journey across FastAPI, PostgreSQL, and Next.js 14 App Router: Signup → Login → Baseline Onboarding → Conversational AI Profiling (`/ai`) → Plan Preview → Explicit Confirmation → PostgreSQL Database Persistence → Real Operational Dashboard (`/dashboard`). The AI Assistant is established as the primary post-onboarding workspace, and the Main Dashboard is populated exclusively from verified database records with zero synthetic/hardcoded demo arrays.

---

## Technical Context

**Language/Version**: Python 3.14 (Backend), TypeScript 5.9 (Frontend)

**Primary Dependencies**:
- **Backend**: FastAPI, Pydantic v2, Pydantic Settings, SQLAlchemy 2.0, Alembic, Passlib/bcrypt, PyJWT, HTTPX, Pytest
- **Frontend**: Next.js 14 App Router, TypeScript, Tailwind CSS, Zustand, Framer Motion, Lucide React, Axios

**Storage**: PostgreSQL (Relational schema with Alembic migrations)

**Testing**: Pytest (Backend unit & API contracts), `npx tsc --noEmit`, `npm run lint`, `npm run build` (Frontend)

**Target Platform**: Web Application (Desktop + Mobile responsive)

**Project Type**: Full-stack Web Application (FastAPI backend + Next.js App Router frontend)

**Performance Goals**:
- API authentication & session endpoints: <100ms
- AI plan preview modal render: <50ms
- AI provider routing & response: <15s total (including fallback)
- Client route transitions: <100ms

**Constraints**:
- **Constitution Rule I**: Database is the canonical source of truth. No fake dashboard mock arrays or client-calculated core metrics.
- **Constitution Rule II**: AI plan proposals MUST NOT automatically write to database schedules. Explicit user approval ("Build My Plan") is required before PostgreSQL persistence.
- **Constitution Rule III**: Dual-provider AI execution (`AIProviderRouter`) with OmniRoute primary (`auto/smart`) and OpenCode Zen fallback (`big-pickle`), max 1 fallback attempt.
- **Build Output Isolation**: Development build artifacts (`.next-dev`) strictly separated from production build artifacts (`.next`).

**Scale/Scope**: 12 new API endpoints, 8 PostgreSQL tables, 2 new frontend routes (`/signup`, `/login`), complete overhaul of `/onboarding`, `/ai`, and `/dashboard` data flow.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Compliance Status | Implementation Detail |
| --- | --- | --- |
| **I. Database as Source of Truth** | PASS | All dashboard metrics, tasks, streaks, and scores fetch strictly from PostgreSQL. Dummy arrays in `usePlannerStore` replaced by backend API queries. |
| **II. Explicit Plan Confirmation** | PASS | AI outputs a `StudyPlanProposal` preview modal on `/ai`. Schedule tables written ONLY when user clicks "Build My Plan", creating an immutable `StudyPlanVersion`. |
| **III. Dual-Provider AI Resilience** | PASS | Uses existing `AIProviderRouter` with OmniRoute (`auto/smart`) -> OpenCode Zen (`big-pickle`) fallback. Provider keys kept server-side in `backend/.env`. |
| **IV. Controlled Video Attachment** | PASS | Video resources attach to topics only after candidate retrieval from official YouTube API + AI ranking over real metadata. |
| **V. Test-Grounded Evolution** | PASS | Verified with Pytest backend suite and frontend `tsc`/`lint`/`build` gates. Isolated `.next-dev` build directory prevents webpack cache corruption. |

---

## Project Structure

### Documentation (`specs/001-ai-first-onboarding/`)

```text
specs/001-ai-first-onboarding/
├── spec.md              # Feature specification
├── plan.md              # This technical implementation plan
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── auth-api.md
│   ├── onboarding-api.md
│   ├── ai-api.md
│   ├── planner-api.md
│   └── dashboard-api.md
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code Layout

```text
backend/
├── app/
│   ├── api/
│   │   ├── auth.py          # Signup, Login, Logout, Session endpoints
│   │   ├── onboarding.py    # Baseline student profile endpoint
│   │   ├── ai.py            # AI conversational profiling & proposal endpoint
│   │   ├── planner.py       # Plan proposal confirmation & transaction endpoint
│   │   └── dashboard.py     # Real database dashboard summary endpoint
│   ├── ai/
│   │   ├── config.py        # AI settings & environment loader
│   │   ├── contracts.py     # AI types & task definitions
│   │   ├── errors.py        # Normalized AI errors
│   │   ├── providers.py     # OmniRoute & OpenCode Zen HTTP adapters
│   │   └── router.py        # Dual-provider router
│   ├── core/
│   │   ├── security.py      # Password hashing & JWT helper functions
│   │   └── database.py      # SQLAlchemy engine & session dependency
│   ├── models/
│   │   ├── user.py          # User & StudentProfile SQLAlchemy models
│   │   ├── ai.py            # AIConversation & AIMessage models
│   │   ├── plan.py          # StudyPlan, StudyPlanVersion, StudyTask models
│   │   └── progress.py      # ProgressLog, Streak, ReadinessScore models
│   ├── schemas/
│   │   ├── auth.py          # Auth Pydantic schemas
│   │   ├── onboarding.py    # Onboarding Pydantic schemas
│   │   ├── ai.py            # Chat & Proposal Pydantic schemas
│   │   └── dashboard.py     # Dashboard hydration Pydantic schemas
│   └── main.py              # FastAPI app definition & CORS
├── alembic/
│   └── versions/            # PostgreSQL migration scripts
└── tests/
    ├── test_auth.py         # Authentication & security tests
    ├── test_onboarding.py   # Baseline onboarding tests
    ├── test_ai_router.py    # Dual-provider AI router tests
    ├── test_planner.py      # Transactional plan confirmation tests
    └── test_dashboard.py    # Real database dashboard hydration tests

frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   │   └── page.tsx # Login screen
│   │   │   └── signup/
│   │   │       └── page.tsx # Signup screen
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx   # Dashboard layout & Auth guard
│   │   │   └── page.tsx     # Operational dashboard page
│   │   ├── ai/
│   │   │   └── page.tsx     # Conversational AI Assistant & Plan Preview
│   │   ├── onboarding/
│   │   │   └── page.tsx     # Baseline student profile onboarding
│   │   ├── focus/
│   │   │   └── page.tsx     # Immersive lofi study environment
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ai/
│   │   │   ├── PlanPreviewModal.tsx  # Interactive Plan Proposal preview modal
│   │   │   └── ChatWindow.tsx        # Conversational AI chat component
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   └── SignupForm.tsx
│   │   └── dashboard/                # Sourced strictly from DB backend
│   ├── hooks/
│   │   ├── useAuth.ts       # Authentication hook
│   │   └── usePomodoro.ts   # Pomodoro hook
│   ├── services/
│   │   └── api.ts           # Axios client for FastAPI backend
│   ├── store/
│   │   └── usePlannerStore.ts # Global UI & cached user session store
│   └── types/
│       └── index.ts         # TypeScript API interfaces
├── next.config.js           # Isolated output: .next-dev for dev, .next for prod
└── tsconfig.json
```

**Structure Decision**: Web application layout (`backend/` + `frontend/`) maintaining clear separation between FastAPI database services and Next.js App Router interfaces.

---

## Detailed Architectural Breakdown

### 1. Authentication Architecture
- **Password Security**: Passwords hashed using `passlib` with `bcrypt`. Raw passwords never stored or logged.
- **Session Tokens**: JWT tokens signed with `HS256` secret key stored in `backend/.env`.
- **Transmission**: Token transmitted via HttpOnly, SameSite=Lax cookie (`access_token`).
- **Route Guards**:
  - Backend: FastAPI dependency `get_current_user(request)` decodes JWT from cookie and queries `User` table.
  - Frontend: `useAuth` hook & Next.js layout guards redirect unauthenticated users to `/login`.
- **Data Ownership**: All backend entity endpoints (`/tasks`, `/profile`, `/plan`) filter queries strictly by `user_id == current_user.id`.

### 2. Student Profile Architecture
- **Baseline Onboarding (`/onboarding`)**: Collects 4 fields: `education_level`, `board_curriculum`, `grade_class`, `target_subjects`.
- **Persistence**: Saved to `student_profiles` table linked via `user_id`.
- **Routing**: Upon completion, sets `user.is_onboarded = False` (remains false until plan approval) and immediately redirects to `/ai`.

### 3. AI Conversation Architecture
- **Workspace**: `/ai` acts as the primary first-use experience after onboarding.
- **Persistence**: Messages stored in `ai_messages` linked to `ai_conversations` for each user.
- **Provider Router**: Requests execute via `AIProviderRouter` (`OmniRoute` -> `OpenCode Zen` fallback). Provider credentials remain server-side.
- **Error Handling**: Outages return a clean `AIUnavailableError` alert on `/ai` without crashing the application.

### 4. Structured Profile Extraction
- **Extraction Protocol**: AI parses chat messages against `StudentProfileExtraction` Pydantic schema (extracting `exam_date`, `daily_time_minutes`, `weak_topics`, `strong_topics`, `completed_topics`).
- **Persistence**: Extracted fields update the user's `StudentProfile` record in PostgreSQL.
- **Clarifications**: If input is ambiguous, AI asks targeted questions (max 3) instead of inventing facts.

### 5. Study Plan Proposal
- **Proposal Generation**: AI generates an ephemeral `StudyPlanProposal` payload (planning period, subject allocations, task list with durations, priority tags, and rationale).
- **Validation**: Server validates total task durations against daily time budget (`daily_time_minutes`) and checks topic existence.
- **Preview UI**: Renders `PlanPreviewModal` on `/ai` displaying daily schedule breakdown and priority tags.

### 6. Plan Confirmation ("Build My Plan")
- **Action**: User clicks **"Build My Plan"** on the proposal preview modal.
- **Backend Transaction**:
  1. Opens PostgreSQL database transaction.
  2. Sets `user.is_onboarded = True`.
  3. Inserts `StudyPlan` and `StudyPlanVersion` (v1).
  4. Inserts `StudyTask` rows for the schedule.
  5. Commits transaction.
- **Redirect**: Navigates user to `/dashboard`.
- **Rollback**: Failure at any step rolls back transaction completely; user remains on `/ai` with error alert.

### 7. Real Dashboard Data Hydration
- **Endpoints**: `/api/v1/dashboard/summary` returns JSON sourced strictly from PostgreSQL.
- **Empty States**:
  - 0 study sessions -> Streak renders `0 days`
  - 0 due reviews -> Review Queue renders "No reviews due today"
  - No dummy arrays or hardcoded mock tasks allowed.

### 8. Frontend Route & State Architecture
- `/signup`: Registration screen
- `/login`: Sign-in screen
- `/onboarding`: Baseline setup
- `/ai`: AI Assistant & Plan Preview
- `/dashboard`: Real operational command center
- `/focus`: Immersive timer environment

### 9. UI Implementation System
- **Palette**: Deep charcoal `#09090b`, zinc `#18181b`, slate panels, dark navy, subtle violet/indigo accents (`#7c8cff`).
- **Atmosphere**: Warm ambient spotlight (`AmbientSpotlight.tsx`), cinematic dark mode, selective glassmorphism.
- **Strict Avoidance**: No cyberpunk, no neon borders, no dense admin tables.

### 10. Real-Data Migration Strategy
- Remove initial hardcoded `schedule` and `userProfile` values from `usePlannerStore.ts`.
- Replace store actions with Axios calls in `src/services/api.ts`.
- Retain `usePomodoro` timer logic for frontend execution while logging completed sessions to backend `/api/v1/progress/log`.

### 11. Security Guardrails
- Hashed passwords only (`bcrypt`).
- Server-side JWT validation on all private routes.
- API keys kept strictly in `backend/.env`.
- Database ownership checks on all entity operations.

### 12. Testing Strategy
- **Backend**: Pytest suite covering auth, onboarding, AI router failover, plan confirmation transaction, and dashboard queries (`28+ tests`).
- **Frontend**: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

### 13. Phased Rollout Sequence
1. **Phase 1**: Database Models & Migrations (`users`, `student_profiles`, `study_plans`, `study_tasks`, `ai_messages`).
2. **Phase 2**: Auth APIs & Passlib/JWT Security (`/api/v1/auth/*`).
3. **Phase 3**: Onboarding API (`/api/v1/onboarding`).
4. **Phase 4**: AI Chat & Profile Extraction (`/api/v1/ai/chat`).
5. **Phase 5**: Transactional Plan Confirmation (`/api/v1/planner/confirm-plan`).
6. **Phase 6**: Real Dashboard Hydration (`/api/v1/dashboard/summary`).
7. **Phase 7**: Frontend UI Integration & Navigation Guard Wiring.

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Versioned Plan Schema (`StudyPlanVersion`) | Immutable history tracking for completed study logs and adaptive replanning audit trails | Single mutable schedule table overwrites historical completion data and destroys student audit trails. |
| Dual-Provider AI Router | High-availability AI execution without relying on a single upstream vendor | Single AI API key risks downtime when primary vendor experiences rate limits or timeouts. |

