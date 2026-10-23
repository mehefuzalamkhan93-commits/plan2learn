from datetime import date, datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class StudyTaskProposal(BaseModel):
    topic_id: str
    topic_name: str
    subject: str
    scheduled_date: date
    scheduled_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    duration_minutes: int = Field(gt=0, le=480)
    priority_tag: str
    rationale: str | None = None


class StudyPlanProposal(BaseModel):
    planning_period_start: date
    planning_period_end: date
    subjects: list[str]
    tasks: list[StudyTaskProposal]
    revision_schedule: list[dict[str, Any]] | None = None
    practice_schedule: list[dict[str, Any]] | None = None
    exam_preparation: list[dict[str, Any]] | None = None
    weak_area_focus: list[dict[str, Any]] | None = None
    total_planned_hours: float
    summary: str | None = None
    daily_study_minutes: int | None = 160
    daily_break_minutes: int | None = 20
    total_planned_minutes: int | None = None


class PlanProposalGenerateRequest(BaseModel):
    start_date: date | None = None
    subject: str | None = None
    understanding_level: str | None = None
    weakness_details: str | None = None
    daily_hours: float | None = None
    exam_date: str | None = None


class PlanPreviewResponse(BaseModel):
    success: bool = True
    proposal: StudyPlanProposal
    message: str = "Study plan proposal generated. Review and confirm to build your plan."


class PlanConfirmRequest(BaseModel):
    proposal: StudyPlanProposal
    confirmed: bool = True


class PlanConfirmResponse(BaseModel):
    success: bool = True
    data: dict
    message: str


class StudyPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    active_version_id: str | None
    created_at: datetime


class StudyPlanVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    plan_id: str
    version_number: int
    source: str
    summary: str | None
    created_at: datetime


class StudyTaskOut(BaseModel):
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


class CreateTaskRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    subject: str = Field(min_length=1, max_length=100)
    scheduled_date: date
    scheduled_time: str = Field(default="09:00", pattern=r"^\d{2}:\d{2}$")
    duration_minutes: int = Field(default=45, gt=0, le=480)
    priority_tag: str = Field(default="Regular")


class UpdateTaskRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    subject: str | None = Field(default=None, min_length=1, max_length=100)
    scheduled_date: date | None = None
    scheduled_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    duration_minutes: int | None = Field(default=None, gt=0, le=480)
    completed: bool | None = None
    priority_tag: str | None = None


class StudyTaskDetailOut(BaseModel):
    id: str
    plan_version_id: str
    user_id: str
    topic_id: str
    topic_name: str
    subject: str
    scheduled_date: date
    scheduled_time: str
    duration_minutes: int
    completed: bool
    priority_tag: str
    created_at: datetime