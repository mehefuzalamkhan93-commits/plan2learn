import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.user import User, StudentProfile
from app.models.catalog import Subject, Topic
from app.models.ai import AIConversation, AIMessage
from app.models.plan import StudyPlan, StudyPlanVersion, StudyTask
from app.models.progress import ProgressLog, Streak, ReadinessScore


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


def test_user_and_student_profile_relationship(db_session):
    user = User(
        email="student@example.com",
        hashed_password="hashed_secret_123",
        full_name="Test Student",
    )
    profile = StudentProfile(
        user=user,
        education_level="High School",
        board_curriculum="CBSE",
        grade_class="Class 12",
        target_subjects=["Calculus", "Physics"],
    )
    db_session.add(user)
    db_session.commit()

    saved_user = db_session.query(User).filter_by(email="student@example.com").first()
    assert saved_user is not None
    assert saved_user.full_name == "Test Student"
    assert saved_user.profile.board_curriculum == "CBSE"
    assert saved_user.profile.target_subjects == ["Calculus", "Physics"]


def test_ai_conversation_and_messages(db_session):
    user = User(
        email="ai@example.com",
        hashed_password="hashed_secret_123",
        full_name="AI Student",
    )
    db_session.add(user)
    db_session.commit()

    conversation = AIConversation(user_id=user.id)
    msg1 = AIMessage(conversation=conversation, role="user", content="Hello AI")
    msg2 = AIMessage(
        conversation=conversation,
        role="assistant",
        content="Hello Student",
        provider_used="omniroute",
        model_used="auto/smart",
    )
    db_session.add_all([conversation, msg1, msg2])
    db_session.commit()

    saved_conv = db_session.query(AIConversation).filter_by(user_id=user.id).first()
    assert saved_conv is not None
    assert len(saved_conv.messages) == 2
    assert saved_conv.messages[1].provider_used == "omniroute"


def test_study_plan_versioning(db_session):
    user = User(
        email="plan@example.com",
        hashed_password="hashed_secret_123",
        full_name="Plan Student",
    )
    subject = Subject(id="calculus", name="Calculus")
    topic = Topic(id="topic-1", subject=subject, name="Limits", difficulty=3)
    db_session.add_all([user, subject, topic])
    db_session.commit()

    plan = StudyPlan(user_id=user.id)
    db_session.add(plan)
    db_session.commit()

    version1 = StudyPlanVersion(
        plan_id=plan.id, version_number=1, source="AI_PROPOSAL_INITIAL", summary="Initial Plan"
    )
    db_session.add(version1)
    db_session.commit()

    plan.active_version_id = version1.id
    db_session.commit()

    saved_plan = db_session.query(StudyPlan).filter_by(user_id=user.id).first()
    assert saved_plan.active_version_id == version1.id
    assert saved_plan.versions[0].summary == "Initial Plan"
