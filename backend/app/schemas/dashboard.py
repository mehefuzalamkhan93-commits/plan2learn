from datetime import date, datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class TodayTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    plan_version_id: str
    user_id: str
    topic_id: str
    scheduled_date: date
    scheduled_time: str
    duration_minutes: int
    completed: bool
    priority_tag: str
    created_at: datetime
    topic: dict[str, Any] | None = None


class UpcomingTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    plan_version_id: str
    user_id: str
    topic_id: str
    scheduled_date: date
    scheduled_time: str
    duration_minutes: int
    completed: bool
    priority_tag: str
    created_at: datetime
    topic: dict[str, Any] | None = None


class StreakOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    current_streak: int
    longest_streak: int
    last_study_date: date | None
    is_active: bool


class ReadinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    probability: int
    avg_confidence: float
    completion_rate: float
    last_updated: datetime


class ReviewItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    topic_id: str
    topic_name: str
    subject: str
    last_studied: date | None
    next_review_date: date | None
    confidence_score: int | None
    difficulty: int | None
    priority: str | None


class ExamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    name: str
    subject_name: str | None
    exam_date: date
    target_score: int | None
    created_at: datetime


class DashboardSummary(BaseModel):
    today_tasks: list[TodayTaskOut]
    upcoming_tasks: list[UpcomingTaskOut]
    streak: StreakOut | None
    readiness: ReadinessOut | None
    review_queue: list[ReviewItemOut]
    exams: list[ExamOut]
    active_plan_version_id: str | None
    total_planned_today_minutes: int
    completed_today_minutes: int