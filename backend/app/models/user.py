import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_onboarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    profile: Mapped["StudentProfile"] = relationship(
        "StudentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def has_student_profile(self) -> bool:
        return self.profile is not None


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    education_level: Mapped[str] = mapped_column(String(50), nullable=False)
    board_curriculum: Mapped[str] = mapped_column(String(50), nullable=False)
    grade_class: Mapped[str] = mapped_column(String(50), nullable=False)
    target_subjects: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    weak_topics: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    strong_topics: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    completed_topics: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    current_topics: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    daily_time_minutes: Mapped[int] = mapped_column(Integer, default=180, nullable=False)
    exam_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    score_goal: Mapped[int] = mapped_column(Integer, default=85, nullable=False)
    study_routine: Mapped[str | None] = mapped_column(Text, nullable=True)
    goals: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    constraints: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    preferences: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    planning_preferences: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user: Mapped["User"] = relationship("User", back_populates="profile")


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    subject_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    exam_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
