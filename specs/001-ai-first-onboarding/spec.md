# Feature Specification: Authentication → Student Onboarding → AI-First Learning Setup

**Feature Branch**: `001-ai-first-onboarding`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Create the first major feature specification for Plan2Learn. Feature name: Authentication → Student Onboarding → AI-First Learning Setup. Defines the first-time user journey from Signup to Dashboard via AI-First Learning Setup."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure Student Registration & Authentication (Priority: P1)

As a new student, I want to create an account with minimal effort and securely log in so that my academic data and study progress remain private and protected.

**Why this priority**: Authentication and data isolation are mandatory foundations for student privacy, user-owned database records, and server-side authorization.

**Independent Test**: Can be fully tested by registering a new account with valid credentials, verifying successful session issuance, attempting to access protected routes (`/onboarding`, `/ai`, `/dashboard`) without credentials (redirected to login), and logging out cleanly.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor on the signup page, **When** they submit a valid Full Name, Email, Password, and matching Confirm Password, **Then** an account is created, a secure session/token is issued, and the user is redirected to the initial Onboarding setup screen.
2. **Given** a registered student on the login page, **When** they enter their correct email and password, **Then** they are authenticated and redirected to their appropriate current setup stage (`/onboarding`, `/ai`, or `/dashboard`).
3. **Given** an unauthenticated user attempting to directly access `/ai` or `/dashboard`, **When** the page loads, **Then** the application redirects them to the login page.
4. **Given** an authenticated student, **When** they click "Log out", **Then** their session is invalidated and protected routes become inaccessible.

---

### User Story 2 - Minimal Baseline Onboarding (Priority: P1)

As a newly registered student, I want to quickly specify my general academic baseline (education level, curriculum board, class/grade, enrolled subjects) without filling out massive forms so that I can immediately enter the AI Assistant workspace.

**Why this priority**: Minimizes onboarding friction by asking only essential high-level attributes up front, deferring detailed topic-level analysis to the conversational AI Assistant.

**Independent Test**: Can be tested by completing the 4-field baseline form and verifying that submitting it persists the baseline academic tags and immediately navigates the user to the `/ai` Assistant workspace instead of an empty dashboard.

**Acceptance Scenarios**:

1. **Given** a newly registered student on `/onboarding`, **When** they select their Education Level, Curriculum Board, Class/Grade, and Target Subjects, **Then** the baseline attributes are saved to their profile and they are automatically routed to `/ai`.
2. **Given** a student who has already completed baseline onboarding but has no approved study plan, **When** they log in, **Then** they are routed directly to `/ai` rather than the Main Dashboard.

---

### User Story 3 - Conversational Academic Profiling via AI Assistant (Priority: P1)

As a student on the AI Assistant workspace, I want to naturally describe my current study status, completed chapters, weak areas, upcoming exams, daily time budget, and study style in a conversation so that the system builds a structured academic profile without imposing rigid forms.

**Why this priority**: The AI Assistant is the primary first-use experience after onboarding. It transforms natural dialogue into structured student attributes while preserving human conversation history.

**Independent Test**: Can be tested by conversing with the AI Assistant on `/ai`, discussing topics and exam dates, and inspecting backend state to verify that conversation messages and extracted `StudentProfile` attributes (weak topics, exam dates, daily minutes) are saved independently without model hallucination.

**Acceptance Scenarios**:

1. **Given** a student on the `/ai` page, **When** they state their exam date, weak topics, and available daily study hours in chat, **Then** the AI acknowledges the details, records conversation messages, and extracts validated structured profile fields.
2. **Given** ambiguous or incomplete student input in chat, **When** the AI processes the message, **Then** the AI asks a targeted clarification question instead of inventing or assuming missing academic details.
3. **Given** an active AI chat session, **When** the primary AI provider (OmniRoute `auto/smart`) experiences a timeout or error, **Then** the system automatically fails over to the secondary provider (OpenCode Zen `big-pickle`) without dropping conversation context or throwing an unhandled UI error.

---

### User Story 4 - AI Study Plan Proposal Preview & Explicit Approval (Priority: P1)

As a student, I want to review an AI-generated Study Plan Proposal with a clear preview of tasks, priorities, and schedules before any database changes occur so that I have complete control over my study commitments.

**Why this priority**: Fulfills the non-negotiable project constitution directive: AI proposals MUST NOT automatically overwrite student schedules; explicit student confirmation is required before database persistence.

**Independent Test**: Can be tested by triggering plan generation on `/ai`, confirming that a structured Plan Proposal modal/sheet opens with task previews, clicking "Build My Plan", and verifying that a database transaction creates an immutable `StudyPlanVersion` and populates real database task records.

**Acceptance Scenarios**:

1. **Given** sufficient structured academic profile data in `/ai`, **When** the AI generates a Study Plan Proposal, **Then** a prominent Plan Review interface displays the proposed tasks, topics, time allocations, review intervals, and priorities without altering main database schedules.
2. **Given** a Study Plan Proposal preview, **When** the student clicks "Build My Plan", **Then** the backend validates the proposal, executes a database transaction committing a new `StudyPlanVersion`, generates canonical task records, and redirects the student to their populated Main Dashboard.
3. **Given** a Study Plan Proposal preview, **When** the student clicks "Revise Plan" or provides feedback in chat, **Then** the system adjusts the proposal preview without committing any data to the main schedule tables.

---

### User Story 5 - Populated Database-Driven Main Dashboard (Priority: P2)

As a student who has approved a study plan, I want to view my Main Dashboard populated exclusively with real operational data from the database so that I can execute my daily study routine with complete accuracy.

**Why this priority**: The Main Dashboard is the operational destination after plan approval. It displays canonical database records with zero synthetic/hardcoded dummy arrays.

**Independent Test**: Can be tested by navigating to `/dashboard` after plan approval, verifying that today's tasks, streak, readiness score, review queue, and subject mastery derive 100% from PostgreSQL records, and confirming that unpopulated sections render clean empty states rather than fake data.

**Acceptance Scenarios**:

1. **Given** a student with an approved `StudyPlanVersion`, **When** they view `/dashboard`, **Then** the schedule grid displays their real database tasks scheduled for today with correct priorities, topics, and durations.
2. **Given** a new student with no completed study sessions or review items, **When** they view the Review Queue or Streak widget on `/dashboard`, **Then** the components render explicit empty states (e.g., "No reviews due today") instead of hardcoded demo numbers.

---

### Edge Cases

- **Duplicate Account Registration**: When a user attempts to sign up with an existing email address, the system displays a clear inline validation error without revealing account existence to unauthorized parties.
- **Session Expiration During AI Conversation**: If an authenticated session expires while the student is conversing on `/ai`, the client saves local input text draft state and prompts the user to log in again without losing conversation history.
- **AI Primary & Secondary Outage**: If both OmniRoute and OpenCode Zen are unreachable, the `/ai` page displays a respectful "AI Provider Unavailable" alert with a retry button; core dashboard operations and existing tasks remain fully accessible.
- **Plan Proposal Rejection**: If the user explicitly rejects a proposed plan, the proposal is discarded, no database schedule transaction occurs, and the user remains on `/ai` with their current state preserved.
- **Overlapping Task Allocations**: If an AI proposal attempts to schedule tasks exceeding the user's specified daily time budget, backend schema validation flags the capacity conflict and requests AI adjustment before displaying the preview.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide user account registration collecting Full Name, Email, Password, and Confirm Password with client-side and server-side validation.
- **FR-002**: System MUST enforce secure password hashing (argon2 or bcrypt) and session/JWT issuance, storing credentials strictly server-side.
- **FR-003**: System MUST protect application routes (`/onboarding`, `/ai`, `/focus`, `/dashboard`) by redirecting unauthenticated requests to the login page.
- **FR-004**: Baseline onboarding (`/onboarding`) MUST collect only high-level attributes (Education Level, Curriculum Board, Grade/Class, Enrolled Subjects) and immediately navigate new users to `/ai`.
- **FR-005**: AI Assistant workspace (`/ai`) MUST be established as the primary first-time post-onboarding destination before any study plan is committed.
- **FR-006**: AI Assistant MUST process natural language dialogue to extract structured student profile attributes (completed topics, weak areas, exam dates, daily study budget, constraints).
- **FR-007**: System MUST store AI conversation history (`AIMessage`) and structured student profile data (`StudentProfile`) as separate database entities.
- **FR-008**: System MUST execute AI requests through the dual-provider router (`AIProviderRouter`) with OmniRoute (`auto/smart`) as primary and OpenCode Zen (`big-pickle`) as fallback.
- **FR-009**: AI Assistant MUST generate a structured Study Plan Proposal containing proposed tasks, topics, durations, priorities, and spaced repetition intervals when sufficient profile context exists.
- **FR-010**: System MUST render an interactive Plan Preview UI displaying the proposed schedule, workload breakdown, and explicit confirmation/revision actions.
- **FR-011**: AI system MUST NOT directly persist, update, or overwrite main database study schedules without explicit student confirmation.
- **FR-012**: Upon explicit user approval ("Build My Plan"), backend MUST execute a database transaction committing a new `StudyPlanVersion` and generating canonical `StudyTask` and `PlanItem` records.
- **FR-013**: Main Dashboard (`/dashboard`) MUST fetch and display operational data sourced exclusively from PostgreSQL database records.
- **FR-014**: System MUST render clean, intentional empty states for any dashboard card or widget that has no real underlying database records, prohibiting synthetic dummy arrays.
- **FR-015**: System MUST isolate student data so all API queries and database operations strictly scope to the authenticated user principal.

### Key Entities *(include if feature involves data)*

- **User**: Represents student identity (ID, Email, Hashed Password, Full Name, Created Timestamp).
- **StudentProfile**: Represents academic baseline and extracted conversational attributes (User ID, Education Level, Board, Grade, Subjects, Weak Topics, Strong Topics, Exam Dates, Daily Budget Minutes, Preferences).
- **AIConversation**: Represents an AI dialogue session (ID, User ID, Created At, Last Active At).
- **AIMessage**: Represents an individual message in a conversation (ID, Conversation ID, Role [user/assistant/system], Content, Provider Used, Model Used, Created At).
- **StudyPlanProposal**: Ephemeral structured AI output containing proposed schedule items, priorities, and rationale.
- **StudyPlan**: Represents the master plan metadata for a student (ID, User ID, Active Version ID, Created At).
- **StudyPlanVersion**: Immutable version record of a committed plan (ID, Plan ID, Version Number, Created At, Reason/Source).
- **StudyTask**: Canonical scheduled study task (ID, Plan Version ID, Topic ID, Scheduled Date, Scheduled Time, Duration Minutes, Priority Tag, Completed Status).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of new student signups complete registration in under 60 seconds with 4 or fewer required form fields.
- **SC-002**: 90%+ of new onboarded users successfully generate and preview an AI Study Plan Proposal within their first 10 minutes on `/ai`.
- **SC-003**: 0% of unconfirmed AI plan proposals leak into the canonical database schedule tables.
- **SC-004**: 100% of dashboard widgets (`/dashboard`) render verified backend database data or explicit empty states, with zero hardcoded demo arrays.
- **SC-005**: Dual-provider AI routing maintains 99.9% availability by executing failover from OmniRoute to OpenCode Zen within 20 seconds during primary outages.

## Assumptions

- Users access the application using modern desktop or mobile web browsers with JavaScript enabled.
- Database persistence uses PostgreSQL with SQLAlchemy 2 ORM and Alembic migrations as specified in project architecture.
- Server-side environment variables for OmniRoute (`OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY`, `OMNIROUTE_MODEL`) and OpenCode Zen (`OPENCODE_ZEN_BASE_URL`, `OPENCODE_ZEN_API_KEY`, `OPENCODE_ZEN_MODEL`, `OPENCODE_ZEN_PROTOCOL`) will be provided in production deployment environments.
- Mobile and tablet responsive layouts will adhere to the project's zinc/dark design system with proper touch targets and zero horizontal overflow.
