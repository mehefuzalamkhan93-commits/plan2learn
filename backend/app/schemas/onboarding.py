from pydantic import BaseModel, Field


class OnboardingRequest(BaseModel):
    education_level: str = Field(min_length=2, max_length=50)
    board_curriculum: str = Field(min_length=2, max_length=50)
    grade_class: str = Field(min_length=2, max_length=50)
    target_subjects: list[str] = Field(min_length=1, max_length=20)


class StudentProfileOut(BaseModel):
    id: str
    user_id: str
    education_level: str
    board_curriculum: str
    grade_class: str
    target_subjects: list[str]
    daily_time_minutes: int
    weak_topics: list[str]
    strong_topics: list[str]
    completed_topics: list[str]
    current_topics: list[str]
    goals: list[str]
    constraints: list[str]
    preferences: dict[str, str]
    planning_preferences: dict[str, str]

    model_config = {"from_attributes": True}


class OnboardingResponse(BaseModel):
    success: bool = True
    data: dict
    message: str