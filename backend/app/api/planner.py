from datetime import date, datetime, timedelta, timezone
from typing import Any
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.plan import StudyPlan, StudyPlanVersion, StudyTask
from app.models.user import StudentProfile, User
from app.models.catalog import Topic, Subject
from app.schemas.planner import (
    PlanProposalGenerateRequest,
    PlanConfirmRequest,
    PlanConfirmResponse,
    StudyPlanProposal,
    StudyTaskProposal,
    StudyPlanVersionOut,
    StudyTaskOut,
    CreateTaskRequest,
    UpdateTaskRequest,
    StudyTaskDetailOut,
)
from app.ai.config import get_ai_settings
from app.ai.contracts import (
    AIMessage,
    AIRequest,
    AITaskType,
    MessageRole,
    ProviderId,
)
from app.ai.errors import AIUnavailableError
from app.ai.router import AIProviderRouter
from app.services.planner_service import (
    PLANNING_DAYS,
    SCENARIO_START_DATE,
    SCENARIO_END_DATE,
    MAX_DAILY_STUDY_MINUTES,
    MAX_TOTAL_WORKLOAD_MINUTES,
    DAILY_BREAK_MINUTES,
    WINDOW_START_TIME,
    WINDOW_END_TIME,
    build_deterministic_study_plan_proposal,
    validate_study_plan_proposal,
)


router = APIRouter(prefix="/planner", tags=["planner"])


async def get_ai_router() -> AIProviderRouter:
    settings = get_ai_settings()
    return AIProviderRouter(settings)


class PlanGenerationResponse(BaseModel):
    tasks: list[dict[str, Any]]
    summary: str | None = None


def build_plan_generation_prompt(
    profile: StudentProfile,
    proposal: StudyPlanProposal | None = None,
    start_date: date | None = None,
    calibration: dict[str, Any] | None = None,
) -> str:
    today_val = start_date or date.today()
    end_val = today_val + timedelta(days=PLANNING_DAYS - 1)
    base_prompt = (
        "You are an expert academic planner. Generate a detailed study plan as a JSON object "
        "matching the PlanGenerationResponse schema. Create specific, actionable study tasks "
        "with dates, times, durations, and priority tags. Focus on the student's weak areas, "
        "upcoming exams, and available study time.\n\n"
        "STRICT SCHEDULING CONSTRAINTS:\n"
        f"1. Planning period: Exactly {PLANNING_DAYS} calendar days from {today_val.isoformat()} to {end_val.isoformat()} inclusive.\n"
        f"2. Daily study time limit: Maximum {MAX_DAILY_STUDY_MINUTES} minutes of study tasks per day.\n"
        f"3. Daily break allowance: Exactly {DAILY_BREAK_MINUTES} minutes of daily break allowance scheduled within a 180-minute evening window.\n"
        f"4. Time window: All study tasks must be scheduled between {WINDOW_START_TIME} (7:00 PM) and {WINDOW_END_TIME} (10:00 PM).\n"
        f"5. Total workload limit: Maximum {MAX_TOTAL_WORKLOAD_MINUTES} minutes across the {PLANNING_DAYS} days (37 hours 20 minutes).\n"
        "6. Subject priority: Prioritize weak topics in Mathematics, Physics, and Chemistry first with MCQs, numerical practice, and revision drills. "
        "Include Computer Science as a secondary priority.\n"
        f"7. Every single calendar day of the {PLANNING_DAYS} days must have study tasks."
    )

    if profile:
        context_parts = [
            f"Education Level: {profile.education_level}",
            f"Board/Curriculum: {profile.board_curriculum}",
            f"Grade/Class: {profile.grade_class}",
            f"Target Subjects: {', '.join(profile.target_subjects)}",
        ]
        if profile.weak_topics:
            context_parts.append(f"Weak Topics: {', '.join(profile.weak_topics)}")
        if profile.strong_topics:
            context_parts.append(f"Strong Topics: {', '.join(profile.strong_topics)}")
        if profile.completed_topics:
            context_parts.append(f"Completed Topics: {', '.join(profile.completed_topics)}")
        if profile.current_topics:
            context_parts.append(f"Current Topics: {', '.join(profile.current_topics)}")
        if profile.goals:
            context_parts.append(f"Goals: {', '.join(profile.goals)}")
        if profile.constraints:
            context_parts.append(f"Constraints: {', '.join(profile.constraints)}")
        if profile.daily_time_minutes:
            context_parts.append(f"Daily Study Time: {profile.daily_time_minutes} minutes")
        if profile.exam_date:
            context_parts.append(f"Exam Date: {profile.exam_date}")
        if profile.score_goal:
            context_parts.append(f"Score Goal: {profile.score_goal}%")
        if profile.study_routine:
            context_parts.append(f"Study Routine: {profile.study_routine}")

        base_prompt += "\n\nStudent Profile:\n" + "\n".join(context_parts)

    if calibration:
        calib_lines = []
        if calibration.get("subject"):
            calib_lines.append(f"Target Focus Subject / Exam Topic: {calibration['subject']}")
        if calibration.get("understanding_level"):
            calib_lines.append(f"Student Current Understanding Level: {calibration['understanding_level']}")
        if calibration.get("weakness_details"):
            calib_lines.append(f"Student's Specific Weak Areas & Struggles: {calibration['weakness_details']}")
        if calibration.get("daily_hours"):
            calib_lines.append(f"Target Daily Commitment: {calibration['daily_hours']} hours/day")
        if calibration.get("exam_date"):
            calib_lines.append(f"Target Exam Date: {calibration['exam_date']}")
        if calib_lines:
            base_prompt += "\n\nStudent Live Calibration Input:\n" + "\n".join(calib_lines)

    if proposal:
        base_prompt += f"\n\nPrevious Proposal Summary: {proposal.summary}"
        base_prompt += "\nRefine and improve this proposal based on the student's profile."

    base_prompt += (
        f"\n\nToday's date is {today_val.isoformat()}. Generate a study plan for the next {PLANNING_DAYS} days (from {today_val.isoformat()} to {end_val.isoformat()}). "
        "Each task should have: topic_id, topic_name, subject, "
        f"scheduled_date (YYYY-MM-DD, between {today_val.isoformat()} and {end_val.isoformat()}), "
        f"scheduled_time (HH:MM, between {WINDOW_START_TIME} and {WINDOW_END_TIME}), duration_minutes (summing to <= {MAX_DAILY_STUDY_MINUTES} per day), "
        "priority_tag (one of: 'Weak Area', 'Spaced Revision', 'Exam Prep', 'Regular'), "
        "rationale (brief explanation). Return ONLY the JSON object."
    )

    return base_prompt


@router.post("/generate-proposal", status_code=status.HTTP_200_OK)
async def generate_plan_proposal(
    payload: PlanProposalGenerateRequest = Body(default_factory=PlanProposalGenerateRequest),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> dict:
    profile = current_user.profile
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete onboarding first.",
        )

    # Persist calibration inputs to student profile if provided
    if payload.subject and payload.subject.strip():
        s = payload.subject.strip()
        current_subjs = list(profile.target_subjects or [])
        if s not in current_subjs:
            profile.target_subjects = [s] + current_subjs
    if payload.weakness_details and payload.weakness_details.strip():
        w = payload.weakness_details.strip()
        current_weaks = list(profile.weak_topics or [])
        if w not in current_weaks:
            profile.weak_topics = [w] + current_weaks
    if payload.daily_hours and payload.daily_hours > 0:
        profile.daily_time_minutes = int(payload.daily_hours * 60)
    if payload.exam_date and payload.exam_date.strip():
        profile.exam_date = payload.exam_date.strip()
    db.commit()
    db.refresh(profile)

    chosen_start_date = payload.start_date or SCENARIO_START_DATE
    calibration = {
        "subject": payload.subject,
        "understanding_level": payload.understanding_level,
        "weakness_details": payload.weakness_details,
        "daily_hours": payload.daily_hours,
        "exam_date": payload.exam_date,
    }
    system_prompt = build_plan_generation_prompt(profile, start_date=chosen_start_date, calibration=calibration)

    request = AIRequest(
        task_type=AITaskType.PLAN_GENERATION,
        messages=(
            AIMessage(MessageRole.SYSTEM, system_prompt),
            AIMessage(MessageRole.USER, "Generate my study plan proposal."),
        ),
        response_model=PlanGenerationResponse,
        fallback_allowed=True,
        # A full 14-day proposal is a large JSON payload, and the Groq gpt-oss
        # reasoning models can exhaust the 2048 token default with reasoning
        # alone before emitting any content (-> empty text -> INVALID_RESPONSE
        # on every provider). Give plan generation room.
        max_output_tokens=12000,
    )

    try:
        result = await ai_router.generate(request)
    except AIUnavailableError as e:
        detail = (
            "AI service is not configured. Please verify provider settings."
            if e.is_configuration_error
            else "AI service temporarily unavailable. Please try again in a few moments."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service temporarily unavailable. Please try again in a few moments.",
        )

    generation = result.structured
    if not generation:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI failed to return structured plan.",
        )

    # Deterministically construct and schedule the 14-day study plan proposal
    proposal = build_deterministic_study_plan_proposal(
        profile=profile,
        generation_tasks=generation.tasks,
        start_date=chosen_start_date,
        summary=None,
    )

    validation_errors = validate_study_plan_proposal(proposal)
    if validation_errors:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generated plan proposal failed validation: {'; '.join(validation_errors)}",
        )

    return {
        "success": True,
        "proposal": proposal.model_dump(mode="json"),
        "message": "Study plan proposal generated. Review and confirm to build your plan.",
    }


@router.post("/confirm-plan", response_model=PlanConfirmResponse, status_code=status.HTTP_201_CREATED)
async def confirm_plan(
    payload: PlanConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PlanConfirmResponse:
    if not payload.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan confirmation required.",
        )

    proposal = payload.proposal
    profile = current_user.profile
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student profile not found. Complete onboarding first.",
        )

    # Check if baseline onboarding was completed (profile differs from signup defaults)
    if profile.board_curriculum == "General" and profile.grade_class == "Grade 12" and set(profile.target_subjects or []) == {"Physics", "Mathematics", "Chemistry"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete onboarding first to personalize your study profile.",
        )

    # Independent deterministic validation before touching database
    validation_errors = validate_study_plan_proposal(proposal)
    if validation_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid study plan proposal: {'; '.join(validation_errors)}",
        )

    try:
        # Create or get study plan
        study_plan = db.query(StudyPlan).filter(StudyPlan.user_id == current_user.id).first()
        if not study_plan:
            study_plan = StudyPlan(user_id=current_user.id)
            db.add(study_plan)
            db.flush()

        # Create study plan version
        version_number = 1
        existing_versions = db.query(StudyPlanVersion).filter(StudyPlanVersion.plan_id == study_plan.id).count()
        version_number = existing_versions + 1

        plan_version = StudyPlanVersion(
            plan_id=study_plan.id,
            version_number=version_number,
            source="ai_generated",
            summary=proposal.summary,
        )
        db.add(plan_version)
        db.flush()

        # Create study tasks
        task_records = []
        for task_proposal in proposal.tasks:
            # Try to find or create topic
            topic = db.query(Topic).filter(Topic.id == task_proposal.topic_id).first()
            if not topic:
                # Ensure subject exists
                subject_id = task_proposal.subject.lower().replace(" ", "_")
                subject = db.query(Subject).filter(Subject.id == subject_id).first()
                if not subject:
                    subject = Subject(id=subject_id, name=task_proposal.subject)
                    db.add(subject)
                    db.flush()

                # Create a basic topic record
                topic = Topic(
                    id=task_proposal.topic_id,
                    subject_id=subject_id,
                    name=task_proposal.topic_name,
                    difficulty=3,
                )
                db.add(topic)
                db.flush()

            study_task = StudyTask(
                plan_version_id=plan_version.id,
                user_id=current_user.id,
                topic_id=topic.id,
                scheduled_date=task_proposal.scheduled_date,
                scheduled_time=task_proposal.scheduled_time,
                duration_minutes=task_proposal.duration_minutes,
                completed=False,
                priority_tag=task_proposal.priority_tag,
            )
            db.add(study_task)
            task_records.append(study_task)

        # Update study plan active version
        study_plan.active_version_id = plan_version.id

        # Mark user as onboarded
        current_user.is_onboarded = True

        db.commit()

        # Refresh to get IDs
        db.refresh(plan_version)
        for task in task_records:
            db.refresh(task)

        return PlanConfirmResponse(
            data={
                "plan_version": StudyPlanVersionOut.model_validate(plan_version).model_dump(),
                "tasks": [StudyTaskOut.model_validate(t).model_dump() for t in task_records],
                "next_route": "/dashboard",
            },
            message="Study plan built successfully. Welcome to your dashboard!",
        )

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build study plan: {str(e)}",
        )


@router.patch("/tasks/{task_id}/toggle")
async def toggle_task_completed(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    task = (
        db.query(StudyTask)
        .filter(StudyTask.id == task_id, StudyTask.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )
    task.completed = not task.completed
    db.commit()
    db.refresh(task)
    return {
        "success": True,
        "data": {
            "id": task.id,
            "completed": task.completed,
        },
        "message": f"Task marked {'completed' if task.completed else 'incomplete'}.",
    }


@router.get("/tasks", response_model=list[StudyTaskDetailOut])
async def get_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[StudyTaskDetailOut]:
    tasks = (
        db.query(StudyTask)
        .options(joinedload(StudyTask.topic).joinedload(Topic.subject))
        .filter(StudyTask.user_id == current_user.id)
        .order_by(StudyTask.scheduled_date, StudyTask.scheduled_time)
        .all()
    )
    result = []
    for t in tasks:
        subj_name = t.topic.subject.name if (t.topic and t.topic.subject) else "General"
        topic_name = t.topic.name if t.topic else "Study Session"
        result.append(
            StudyTaskDetailOut(
                id=t.id,
                plan_version_id=t.plan_version_id,
                user_id=t.user_id,
                topic_id=t.topic_id,
                topic_name=topic_name,
                subject=subj_name,
                scheduled_date=t.scheduled_date,
                scheduled_time=t.scheduled_time,
                duration_minutes=t.duration_minutes,
                completed=t.completed,
                priority_tag=t.priority_tag,
                created_at=t.created_at,
            )
        )
    return result


@router.post("/tasks", response_model=StudyTaskDetailOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: CreateTaskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudyTaskDetailOut:
    title = payload.title.strip()
    subject_raw = payload.subject.strip()
    if not title or not subject_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task title and subject are required.",
        )

    # 1. Ensure Subject exists
    subject_id = subject_raw.lower().replace(" ", "_")
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        subject = Subject(id=subject_id, name=subject_raw)
        db.add(subject)
        db.flush()

    # 2. Ensure Topic exists
    topic_id = f"task_{uuid.uuid4().hex[:12]}"
    topic = Topic(
        id=topic_id,
        subject_id=subject.id,
        name=title,
        difficulty=3,
    )
    db.add(topic)
    db.flush()

    # 3. Ensure StudyPlan and StudyPlanVersion exist
    study_plan = db.query(StudyPlan).filter(StudyPlan.user_id == current_user.id).first()
    if not study_plan:
        study_plan = StudyPlan(user_id=current_user.id)
        db.add(study_plan)
        db.flush()

    plan_version_id = study_plan.active_version_id
    if not plan_version_id:
        existing_version = (
            db.query(StudyPlanVersion)
            .filter(StudyPlanVersion.plan_id == study_plan.id)
            .order_by(StudyPlanVersion.version_number.desc())
            .first()
        )
        if existing_version:
            plan_version_id = existing_version.id
            study_plan.active_version_id = plan_version_id
        else:
            new_version = StudyPlanVersion(
                plan_id=study_plan.id,
                version_number=1,
                source="custom",
                summary="Personalized Study Plan",
            )
            db.add(new_version)
            db.flush()
            plan_version_id = new_version.id
            study_plan.active_version_id = plan_version_id

    # 4. Create StudyTask
    task = StudyTask(
        plan_version_id=plan_version_id,
        user_id=current_user.id,
        topic_id=topic.id,
        scheduled_date=payload.scheduled_date,
        scheduled_time=payload.scheduled_time,
        duration_minutes=payload.duration_minutes,
        completed=False,
        priority_tag=payload.priority_tag,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    db.refresh(topic)

    return StudyTaskDetailOut(
        id=task.id,
        plan_version_id=task.plan_version_id,
        user_id=task.user_id,
        topic_id=task.topic_id,
        topic_name=topic.name,
        subject=subject.name,
        scheduled_date=task.scheduled_date,
        scheduled_time=task.scheduled_time,
        duration_minutes=task.duration_minutes,
        completed=task.completed,
        priority_tag=task.priority_tag,
        created_at=task.created_at,
    )


@router.patch("/tasks/{task_id}", response_model=StudyTaskDetailOut)
async def update_task(
    task_id: str,
    payload: UpdateTaskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StudyTaskDetailOut:
    task = (
        db.query(StudyTask)
        .options(joinedload(StudyTask.topic).joinedload(Topic.subject))
        .filter(StudyTask.id == task_id, StudyTask.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )

    if payload.subject is not None and payload.subject.strip():
        subject_raw = payload.subject.strip()
        subject_id = subject_raw.lower().replace(" ", "_")
        subject = db.query(Subject).filter(Subject.id == subject_id).first()
        if not subject:
            subject = Subject(id=subject_id, name=subject_raw)
            db.add(subject)
            db.flush()
        if task.topic:
            task.topic.subject_id = subject.id
            task.topic.subject = subject

    if payload.title is not None and payload.title.strip():
        if task.topic:
            task.topic.name = payload.title.strip()

    if payload.scheduled_date is not None:
        task.scheduled_date = payload.scheduled_date

    if payload.scheduled_time is not None:
        task.scheduled_time = payload.scheduled_time

    if payload.duration_minutes is not None:
        task.duration_minutes = payload.duration_minutes

    if payload.completed is not None:
        task.completed = payload.completed

    if payload.priority_tag is not None:
        task.priority_tag = payload.priority_tag

    db.commit()
    db.refresh(task)

    subj_name = task.topic.subject.name if (task.topic and task.topic.subject) else "General"
    topic_name = task.topic.name if task.topic else "Study Session"

    return StudyTaskDetailOut(
        id=task.id,
        plan_version_id=task.plan_version_id,
        user_id=task.user_id,
        topic_id=task.topic_id,
        topic_name=topic_name,
        subject=subj_name,
        scheduled_date=task.scheduled_date,
        scheduled_time=task.scheduled_time,
        duration_minutes=task.duration_minutes,
        completed=task.completed,
        priority_tag=task.priority_tag,
        created_at=task.created_at,
    )


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    task = (
        db.query(StudyTask)
        .filter(StudyTask.id == task_id, StudyTask.user_id == current_user.id)
        .first()
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )
    db.delete(task)
    db.commit()
    return {"success": True, "message": "Task deleted successfully."}