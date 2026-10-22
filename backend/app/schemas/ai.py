from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    role: str
    content: str
    provider_used: str | None = None
    model_used: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: str | None = None
    notebook_id: str | None = None
    response_style: str | None = None
    selected_source_ids: list[str] | None = None


class StructuredProfileUpdate(BaseModel):
    education_level: str | None = None
    board_curriculum: str | None = None
    grade_class: str | None = None
    target_subjects: list[str] | None = None
    weak_topics: list[str] | None = None
    strong_topics: list[str] | None = None
    completed_topics: list[str] | None = None
    current_topics: list[str] | None = None
    daily_time_minutes: int | None = None
    exam_date: str | None = None
    score_goal: int | None = None
    study_routine: str | None = None
    goals: list[str] | None = None
    constraints: list[str] | None = None
    preferences: dict[str, str] | None = None
    planning_preferences: dict[str, str] | None = None


class StructuredAcademicContextUpdate(BaseModel):
    exams: list[dict[str, Any]] | None = None


class MissingInformation(BaseModel):
    fields: list[str]
    questions: list[str]


class AIChatResponse(BaseModel):
    success: bool = True
    message: str
    conversation_id: str
    ai_response: str
    title: str | None = None
    profile_updates: StructuredProfileUpdate | None = None
    academic_context_updates: StructuredAcademicContextUpdate | None = None
    missing_information: MissingInformation | None = None
    next_question: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    provider_used: str | None = None
    model_used: str | None = None
    citations: list[dict[str, Any]] | None = None


class AIHistoryResponse(BaseModel):
    success: bool = True
    data: dict
    message: str = "Conversation history retrieved."


class ConversationOut(BaseModel):
    id: str
    user_id: str
    title: str | None = None
    is_pinned: bool = False
    custom_title: bool = False
    notebook_id: str | None = None
    response_style: str = "friendly"
    created_at: datetime
    last_active_at: datetime
    message_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ConversationCreateRequest(BaseModel):
    title: str | None = None
    notebook_id: str | None = None
    response_style: str | None = None


class ConversationUpdateRequest(BaseModel):
    title: str | None = None
    is_pinned: bool | None = None
    response_style: str | None = None


class AIConversationListResponse(BaseModel):
    success: bool = True
    conversations: list[ConversationOut]
    message: str = "Conversations retrieved."


class AIConversationHistoryResponse(BaseModel):
    success: bool = True
    conversation_id: str
    title: str | None = None
    is_pinned: bool = False
    response_style: str = "friendly"
    messages: list[ChatMessage]
    message: str = "Conversation history retrieved."