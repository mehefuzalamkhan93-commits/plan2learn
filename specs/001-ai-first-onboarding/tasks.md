# Tasks: Authentication → Student Onboarding → AI-First Learning Setup

**Input**: Design documents from `/specs/001-ai-first-onboarding/`

**Prerequisites**: spec.md, plan.md, research.md, data-model.md, contracts/

## Format: `- [ ] [ID] [P?] [Story?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story identifier (US1, US2, US3, US4, US5)
- All descriptions include exact file paths and quoted schema constraints.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database configuration, security helper initialization, and Alembic setup.

- [X] T001 Configure database connection pool and engine settings in `backend/app/core/database.py`
- [X] T002 [P] Implement password hashing (bcrypt/passlib) and JWT helper functions in `backend/app/core/security.py`
- [X] T003 [P] Initialize Alembic database migration environment in `backend/alembic/env.py`

---

## Phase 2: Foundational (Blocking Prerequisites & Migrations)

**Purpose**: Database models, schemas, and initial Alembic migration required by all user stories.

- [X] T004 Create User and StudentProfile SQLAlchemy models in `backend/app/models/user.py` quoting constraints: `users.email` (String(255), Unique, Not Null), `users.hashed_password` (String(255), Not Null), `users.full_name` (String(100), Not Null), `student_profiles.education_level` (String(50), Not Null), `student_profiles.board_curriculum` (String(50), Not Null), `student_profiles.grade_class` (String(50), Not Null), `student_profiles.target_subjects` (JSONB, Not Null)
- [X] T005 [P] Create Subject and Topic catalog SQLAlchemy models in `backend/app/models/catalog.py`
- [X] T006 [P] Create AIConversation and AIMessage SQLAlchemy models in `backend/app/models/ai.py`
- [X] T007 [P] Create StudyPlan, StudyPlanVersion, and StudyTask SQLAlchemy models in `backend/app/models/plan.py`
- [X] T008 [P] Create ProgressLog, Streak, and ReadinessScore SQLAlchemy models in `backend/app/models/progress.py`
- [X] T009 Generate and apply initial Alembic migration script in `backend/alembic/versions/001_initial_schema.py` + **Fixed migration 66ec0367ee70 for existing rows with server defaults**
- [X] T010 Write automated tests for database models and relationships in `backend/tests/test_models.py`

---

## Phase 3: User Story 1 - Secure Student Registration & Authentication [US1] (Priority: P1)

**Goal**: Enable secure student signup, login, logout, and authenticated route protection with HttpOnly session cookies.

**Independent Test**: Register a new student at `/signup`, verify successful login at `/login`, confirm HttpOnly token cookie is issued, verify unauthenticated access to protected routes redirects to `/login`, and test logout.

- [X] T011 [US1] Create Auth Pydantic request and response schemas in `backend/app/schemas/auth.py`
- [X] T012 [P] [US1] Implement Auth API endpoints (`/signup`, `/login`, `/logout`, `/me`) setting HttpOnly `access_token` cookie in `backend/app/api/auth.py`
- [X] T013 [US1] Implement FastAPI `get_current_user` dependency in `backend/app/core/security.py`
- [X] T014 [P] [US1] Add auth API methods (`signup`, `login`, `logout`, `getCurrentUser`) in `frontend/src/services/api.ts`
- [X] T015 [P] [US1] Create authentication state hook `useAuth` in `frontend/src/hooks/useAuth.ts`
- [X] T016 [P] [US1] Build Signup page and form component in `frontend/src/app/(auth)/signup/page.tsx` and `frontend/src/components/auth/SignupForm.tsx`
- [X] T017 [P] [US1] Build Login page and form component in `frontend/src/app/(auth)/login/page.tsx` and `frontend/src/components/auth/LoginForm.tsx`
- [X] T018 [US1] Implement route authentication guard in `frontend/src/app/(dashboard)/layout.tsx`
- [X] T019 [US1] Write automated authentication integration tests in `backend/tests/test_auth.py`

---

## Phase 4: User Story 2 - Minimal Baseline Onboarding [US2] (Priority: P1)

**Goal**: Collect baseline student academic attributes and immediately route the student to the AI Assistant workspace.

**Independent Test**: Complete the 4-field baseline form on `/onboarding` and verify baseline data is saved to `student_profiles` and user is navigated directly to `/ai`.

- [X] T020 [US2] Create Onboarding Pydantic schemas in `backend/app/schemas/onboarding.py`
- [X] T021 [US2] Implement Baseline Onboarding API endpoint (`POST /api/v1/onboarding`) in `backend/app/api/onboarding.py`
- [X] T022 [P] [US2] Add onboarding API client method `saveOnboarding` in `frontend/src/services/api.ts`
- [X] T023 [US2] Overhaul `frontend/src/app/onboarding/page.tsx` to collect baseline attributes (`education_level`, `board_curriculum`, `grade_class`, `target_subjects`) and navigate to `/ai` upon completion
- [X] T024 [US2] Write automated onboarding API integration tests in `backend/tests/test_onboarding.py`

---

## Phase 5: User Story 3 - Conversational Academic Profiling via AI Assistant [US3] (Priority: P1)

**Goal**: Enable natural language student dialogue on `/ai`, parsing structured profile attributes and executing dual-provider failover.

**Independent Test**: Send conversational messages on `/ai`, confirm message history is saved, verify structured profile attributes are extracted to `StudentProfile`, and verify fallback from OmniRoute to OpenCode Zen on timeout.

- [X] T025 [US3] Create AI Chat & Structured Profile Extraction Pydantic schemas in `backend/app/schemas/ai.py`
- [X] T026 [US3] Implement AI Chat API (`POST /api/v1/ai/chat`, `GET /api/v1/ai/history`) in `backend/app/api/ai.py` using `AIProviderRouter`
- [X] T027 [P] [US3] Add AI Chat API methods in `frontend/src/services/api.ts`
- [X] T028 [US3] Build ChatWindow component with message stream, loading state, and fallback alerts in `frontend/src/components/ai/ChatWindow.tsx`
- [X] T029 [US3] Wire `/ai` Assistant workspace page in `frontend/src/app/ai/page.tsx` as the central first-use experience after onboarding
- [X] T030 [US3] Write automated AI Chat and failover tests in `backend/tests/test_ai_chat.py`

---

## Phase 6: User Story 4 - AI Study Plan Proposal Preview & Explicit Approval [US4] (Priority: P1)

**Goal**: Present AI-generated Study Plan Proposal preview and execute transactional PostgreSQL database persistence upon explicit user confirmation.

**Independent Test**: Trigger plan generation on `/ai`, review the Plan Preview modal, click "Build My Plan", and verify that a database transaction creates `StudyPlan`, `StudyPlanVersion` (v1), and `StudyTask` rows, then redirects to `/dashboard`.

- [X] T031 [US4] Create Study Plan Proposal & Confirmation Pydantic schemas in `backend/app/schemas/planner.py` with deterministic 14-day duration and break fields
- [X] T032 [US4] Implement Plan Confirmation API (`POST /api/v1/planner/confirm-plan`) with independent deterministic validation (14 days, max 160m daily, max 2240m total, 19:00–22:00 window) and transactional rollback in `backend/app/api/planner.py`
- [X] T033 [P] [US4] Add plan confirmation API client method `confirmPlan` in `frontend/src/services/api.ts`
- [X] T034 [US4] Build interactive PlanPreviewModal component displaying exact 14-day dates, calculated study durations, break allowances, and "Build My Plan" action in `frontend/src/components/ai/PlanPreviewModal.tsx`
- [X] T035 [US4] Integrate PlanPreviewModal into `frontend/src/app/ai/page.tsx` handling proposal preview, confirmation errors, and dashboard redirect
- [X] T036 [US4] Write automated transactional plan confirmation and regression tests in `backend/tests/test_planner.py` verifying 14 calendar dates, workload limits, rejection of altered proposals, and zero DB pollution on failure

---

## Phase 7: User Story 5 - Populated Database-Driven Main Dashboard [US5] (Priority: P2)

**Goal**: Hydrate the Main Dashboard exclusively from PostgreSQL database queries with zero hardcoded dummy arrays and clean empty states.

**Independent Test**: Load `/dashboard` after plan approval and verify today's tasks, streak, readiness, review queue, and mastery derive 100% from PostgreSQL database records.

- [X] T037 [US5] Create Dashboard Summary Pydantic schemas in `backend/app/schemas/dashboard.py`
- [X] T038 [US5] Implement Dashboard API endpoint (`GET /api/v1/dashboard/summary`) in `backend/app/api/dashboard.py` querying PostgreSQL records
- [X] T039 [P] [US5] Add dashboard API methods in `frontend/src/services/api.ts`
- [X] T040 [US5] Refactor `frontend/src/store/usePlannerStore.ts` to remove hardcoded initial demo arrays and manage API-fetched state
- [X] T041 [US5] Update `frontend/src/app/(dashboard)/page.tsx` to hydrate dashboard cards and schedule grid strictly from backend API queries
- [X] T042 [US5] Implement clean, non-mocked empty state components for tasks, review queue, and streak in `frontend/src/components/dashboard/`
- [X] T043 [US5] Write automated real database dashboard hydration tests in `backend/tests/test_dashboard.py`

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Design system consistency, responsive verification, and end-to-end quality validation.

- [X] T044 Verify deep charcoal/zinc/amber/indigo visual palette and warm ambient spotlight consistency across `/signup`, `/login`, `/onboarding`, `/ai`, and `/dashboard`
- [X] T045 [P] Perform responsive design and touch target verification across mobile (390px), tablet (768px), and desktop viewports
- [X] T046 Run full backend and frontend validation suite (`pytest`, `npx tsc --noEmit`, `npm run lint`, `npm run build`)

---

## Dependencies & Execution Graph

```text
Phase 1: Setup Infrastructure (T001-T003)
  └─► Phase 2: Foundational Models & Migrations (T004-T010)
        └─► Phase 3: User Story 1 - Auth (T011-T019)
              └─► Phase 4: User Story 2 - Onboarding (T020-T024)
                    └─► Phase 5: User Story 3 - AI Conversational Setup (T025-T030)
                          └─► Phase 6: User Story 4 - Plan Confirmation (T031-T036)
                                └─► Phase 7: User Story 5 - Real Dashboard (T037-T043)
                                      └─► Phase 8: Polish & Validation (T044-T046)
```

---

## Parallel Execution Opportunities

- **Phase 1**: T002 (Security helpers) and T003 (Alembic setup) can run in parallel.
- **Phase 2**: T005 (Catalog models), T006 (AI models), T007 (Plan models), and T008 (Progress models) can run in parallel after T004.
- **Phase 3 [US1]**: T014 (API client), T015 (useAuth hook), T016 (Signup UI), and T017 (Login UI) can run in parallel after T012 (Auth API).
- **Phase 4 [US2]**: T022 (API client method) can run in parallel with T021 (Backend API).
- **Phase 5 [US3]**: T027 (API client method) can run in parallel with T026 (AI Chat API).
- **Phase 6 [US4]**: T033 (API client method) can run in parallel with T032 (Confirmation API).
- **Phase 7 [US5]**: T039 (API client method) can run in parallel with T038 (Dashboard API).

---

## Implementation Strategy & MVP Scope

- **MVP Scope**: Phases 1 through 6 deliver a fully functional, end-to-end, testable MVP slice:
  Student Signup -> Login -> Baseline Onboarding -> AI Chat Profiling -> Plan Preview -> Explicit Confirmation ("Build My Plan") -> PostgreSQL Commitment -> Redirect to Dashboard.
- **Incremental Delivery**: Each User Story Phase produces an independently testable, non-breaking increment.