from datetime import date, datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.plan import StudyPlan, StudyPlanVersion, StudyTask
from app.models.user import StudentProfile, User, Exam
from app.models.catalog import Topic
from app.models.progress import ProgressLog, Streak, ReadinessScore
from app.schemas.dashboard import DashboardSummary


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DashboardSummary:
    today = date.today()

    # Get active study plan
    study_plan = db.query(StudyPlan).filter(StudyPlan.user_id == current_user.id).first()
    active_plan_version_id = study_plan.active_version_id if study_plan else None

    # Get today's tasks
    today_tasks_query = (
        db.query(StudyTask)
        .filter(
            StudyTask.user_id == current_user.id,
            StudyTask.scheduled_date == today,
        )
        .order_by(StudyTask.scheduled_time)
    )
    today_tasks = today_tasks_query.all()

    # Get upcoming tasks (next 7 days, excluding today)
    upcoming_end = today + timedelta(days=7)
    upcoming_tasks_query = (
        db.query(StudyTask)
        .filter(
            StudyTask.user_id == current_user.id,
            StudyTask.scheduled_date > today,
            StudyTask.scheduled_date <= upcoming_end,
        )
        .order_by(StudyTask.scheduled_date, StudyTask.scheduled_time)
        .limit(20)
    )
    upcoming_tasks = upcoming_tasks_query.all()

    # Get streak
    streak = db.query(Streak).filter(Streak.user_id == current_user.id).first()

    # Get readiness
    readiness = db.query(ReadinessScore).filter(ReadinessScore.user_id == current_user.id).first()

    # Get review queue (topics due for review)
    review_query = (
        db.query(Topic)
        .join(StudyTask, Topic.id == StudyTask.topic_id)
        .filter(
            StudyTask.user_id == current_user.id,
            StudyTask.completed.is_(True),
        )
        .distinct()
        .limit(10)
    )
    review_topics = review_query.all()

    # Get exams
    exams = (
        db.query(Exam)
        .filter(
            Exam.user_id == current_user.id,
            Exam.exam_date >= today,
        )
        .order_by(Exam.exam_date)
        .limit(5)
        .all()
    )

    # Build topic info for tasks
    def build_task_out(task: StudyTask) -> dict[str, Any]:
        topic_info = None
        if task.topic:
            topic_info = {
                "id": task.topic.id,
                "name": task.topic.name,
                "subject": task.topic.subject.name if task.topic.subject else "Unknown",
                "difficulty": task.topic.difficulty,
            }
        return {
            "id": task.id,
            "plan_version_id": task.plan_version_id,
            "user_id": task.user_id,
            "topic_id": task.topic_id,
            "scheduled_date": task.scheduled_date,
            "scheduled_time": task.scheduled_time,
            "duration_minutes": task.duration_minutes,
            "completed": task.completed,
            "priority_tag": task.priority_tag,
            "created_at": task.created_at,
            "topic": topic_info,
        }

    today_tasks_out = [build_task_out(t) for t in today_tasks]
    upcoming_tasks_out = [build_task_out(t) for t in upcoming_tasks]

    # Build review queue
    review_queue_out = []
    for topic in review_topics:
        # Get latest progress log for this topic
        latest_progress = (
            db.query(ProgressLog)
            .filter(
                ProgressLog.user_id == current_user.id,
                ProgressLog.topic_id == topic.id,
            )
            .order_by(ProgressLog.completed_at.desc())
            .first()
        )

        review_queue_out.append(
            {
                "id": f"review-{topic.id}",
                "user_id": current_user.id,
                "topic_id": topic.id,
                "topic_name": topic.name,
                "subject": topic.subject.name if topic.subject else "Unknown",
                "last_studied": latest_progress.completed_at.date() if latest_progress else None,
                "next_review_date": None,  # Could implement spaced repetition logic
                "confidence_score": latest_progress.confidence_rating if latest_progress else None,
                "difficulty": topic.difficulty,
                "priority": "High" if (latest_progress and latest_progress.confidence_rating and latest_progress.confidence_rating < 3) else "Medium",
            }
        )

    # Calculate today's planned vs completed minutes
    total_planned = sum(t.duration_minutes for t in today_tasks)
    completed_minutes = sum(t.duration_minutes for t in today_tasks if t.completed)

    return DashboardSummary(
        today_tasks=today_tasks_out,
        upcoming_tasks=upcoming_tasks_out,
        streak=streak,
        readiness=readiness,
        review_queue=review_queue_out,
        exams=exams,
        active_plan_version_id=active_plan_version_id,
        total_planned_today_minutes=total_planned,
        completed_today_minutes=completed_minutes,
    )