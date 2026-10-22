# Feature Validation & Quickstart Guide: Authentication → Student Onboarding → AI-First Learning Setup

## 1. Environment & Prerequisites

### Backend Environment Setup
```powershell
# Navigate to backend directory
cd D:\smart-learning-planner\backend

# Activate virtual environment
$venvPath = "C:\Users\USER\AppData\Local\smart-learning-planner\backend-venv"
& "$venvPath\Scripts\python.exe" -m pip install -r requirements.txt

# Execute database migrations
& "$venvPath\Scripts\python.exe" -m alembic upgrade head

# Start FastAPI server (Port 8000)
& "$venvPath\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Environment Setup
```powershell
# Navigate to frontend directory
cd D:\smart-learning-planner\frontend

# Ensure clean build artifacts and dependencies
npm install

# Start Next.js dev server on port 3001 (.next-dev output)
npm run dev -- --hostname 0.0.0.0 --port 3001
```

---

## 2. Validation Scenarios

### Scenario A: New Student Registration & Baseline Onboarding
1. Open browser to `http://localhost:3001/signup`.
2. Fill in:
   - Full Name: `Alex Johnson`
   - Email: `alex.test@example.com`
   - Password: `Password123!`
   - Confirm Password: `Password123!`
3. Click **"Create Account"**.
4. **Expected Outcome**: Account created in database, session cookie set, auto-redirected to `/onboarding`.
5. On `/onboarding`, select:
   - Education Level: `High School`
   - Board: `CBSE`
   - Class: `Class 12`
   - Subjects: `Calculus`, `Physics`, `Organic Chemistry`
6. Click **"Continue to AI Assistant"**.
7. **Expected Outcome**: Baseline profile saved to `student_profiles`, auto-redirected to `/ai`.

### Scenario B: AI Conversational Profiling & Proposal Generation
1. On `http://localhost:3001/ai`:
2. Type in chat:
   > "My exam is on December 15. I study 3 hours daily. I am weak at Organic Chemistry SN1/SN2 pathways."
3. Click **"Send"**.
4. **Expected Outcome**:
   - OmniRoute primary (or OpenCode Zen fallback) processes request.
   - Message saved to `ai_messages`.
   - `StudentProfile` updated with `exam_date="2026-12-15"`, `daily_time_minutes=180`, `weak_topics=["Reaction Mechanisms: SN1 vs SN2 Pathways"]`.
   - AI generates a `StudyPlanProposal` and presents the **Plan Preview** modal.

### Scenario C: Plan Preview & Explicit Database Commitment
1. Inspect the **Plan Preview** modal on `/ai`.
2. Verify:
   - Schedule summary displays daily 180 min time budget.
   - Organic Chemistry SN1/SN2 is tagged as `Weak Area` (High priority).
3. Click **"Build My Plan"**.
4. **Expected Outcome**:
   - `POST /api/v1/planner/confirm-plan` executes a PostgreSQL transaction.
   - `StudyPlan` and `StudyPlanVersion` (v1) created.
   - `StudyTask` rows created in database.
   - User `is_onboarded` updated to `True`.
   - Auto-redirected to `http://localhost:3001/dashboard`.

### Scenario D: Real Database Dashboard Hydration
1. On `http://localhost:3001/dashboard`:
2. Verify:
   - Today's schedule renders real database task: `Reaction Mechanisms: SN1 vs SN2 Pathways` (Organic Chemistry, 50m, Weak Area).
   - Streak shows `0 days` (real fresh user state).
   - Review Queue displays clean empty state ("No reviews due today").
   - Zero synthetic dummy arrays rendered.

---

## 3. Automated Validation Suite

```powershell
# Run backend pytest suite
cd D:\smart-learning-planner\backend
& "$venvPath\Scripts\python.exe" -m pytest

# Run frontend TypeScript & ESLint validation
cd D:\smart-learning-planner\frontend
npx tsc --noEmit
npm run lint
npm run build
```
