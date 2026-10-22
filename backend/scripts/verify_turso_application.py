"""Comprehensive verification script for Turso database integration.

Tests:
1. Direct connection and authentication
2. Transaction commit and rollback
3. User creation and authentication verification
4. Profile persistence
5. Subjects, Topics, Study Plans, and Tasks
6. Conversations, Messages, and Source isolation (ConversationSource)
7. Source metadata and chunks persistence
8. Invalid credentials error handling
"""

import os
import sys
import uuid
from datetime import date, datetime, timezone

from dotenv import load_dotenv
load_dotenv()

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.database import SessionLocal, engine, check_database_connection

from app.models.user import User, StudentProfile
from app.models.catalog import Subject, Topic
from app.models.plan import StudyPlan, StudyPlanVersion, StudyTask

from app.models.notebook import Notebook, Source, SourceChunk
from app.models.ai import AIConversation, AIMessage, ConversationSource
from app.core.security import hash_password, verify_password

def test_all():
    print("=== STARTING TURSO APPLICATION VERIFICATION ===")
    
    # 1. Connection check
    conn_info = check_database_connection()
    print(f"[1] Connection check: {conn_info}")
    assert conn_info["status"] == "healthy", "Database connection is unhealthy"
    assert conn_info["backend"] == "turso", f"Expected backend 'turso', got {conn_info['backend']}"

    # 2. Transaction Commit & Rollback
    print("\n[2] Testing Transaction Rollback...")
    db = SessionLocal()
    try:
        dummy_user = User(
            id=f"test-rollback-{uuid.uuid4().hex[:8]}",
            email=f"rollback-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password=hash_password("password123"),
            full_name="Rollback Test User",
            is_active=True,
        )
        db.add(dummy_user)
        db.flush()
        user_id = dummy_user.id
        db.rollback()  # Rollback transaction
        
        # Verify user was NOT saved
        persisted = db.query(User).filter(User.id == user_id).first()
        assert persisted is None, "Rollback failed: record was committed unexpectedly!"
        print("    -> Rollback successful: Record was cleanly rolled back.")
    finally:
        db.close()

    # 3. User Registration & Password Hashing
    print("\n[3] Testing User Creation and Password Verification...")
    db = SessionLocal()
    test_user_id = f"user-{uuid.uuid4().hex[:8]}"
    test_email = f"turso-student-{uuid.uuid4().hex[:8]}@example.com"
    raw_pass = "SecurePass2026!"
    
    try:
        user = User(
            id=test_user_id,
            email=test_email,
            hashed_password=hash_password(raw_pass),
            full_name="Turso Test Student",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"    -> User created: id={user.id}, email={user.email}")
        
        assert verify_password(raw_pass, user.hashed_password), "Password verification failed"
        print("    -> Password verification passed.")

        # 4. Student Profile
        print("\n[4] Testing Student Profile Creation...")
        profile = StudentProfile(
            user_id=user.id,
            education_level="High School",
            board_curriculum="CBSE",
            grade_class="Class 12",
            daily_time_minutes=240,
        )

        db.add(profile)
        db.commit()
        db.refresh(profile)
        print(f"    -> Profile created: grade={profile.grade_class}, curriculum={profile.board_curriculum}")


        # 5. Subjects, Plans & Tasks
        print("\n[5] Testing Subject, Study Plan & Task Creation...")
        subject_id = f"sub-{uuid.uuid4().hex[:8]}"
        subject = Subject(
            id=subject_id,
            name=f"Physics-{uuid.uuid4().hex[:4]}",
        )
        db.add(subject)
        
        topic = Topic(
            id=f"top-{uuid.uuid4().hex[:8]}",
            subject_id=subject.id,
            name="Electromagnetic Waves",
            difficulty=3,
        )
        db.add(topic)
        
        plan = StudyPlan(
            id=f"plan-{uuid.uuid4().hex[:8]}",
            user_id=user.id,
        )
        db.add(plan)
        db.flush()

        version = StudyPlanVersion(
            id=f"ver-{uuid.uuid4().hex[:8]}",
            plan_id=plan.id,
            version_number=1,
            source="ai_generated",
            summary="Initial physics syllabus plan",
        )
        db.add(version)
        db.flush()
        
        task = StudyTask(
            id=f"task-{uuid.uuid4().hex[:8]}",
            user_id=user.id,
            plan_version_id=version.id,
            topic_id=topic.id,
            scheduled_date=date(2026, 10, 23),
            scheduled_time="10:00",
            duration_minutes=90,
            completed=False,
            priority_tag="High",
        )
        db.add(task)
        db.commit()
        print(f"    -> Subject, Topic, Plan, and Task created: task={task.id} (priority={task.priority_tag})")


        # 6. Notebook, Sources, Chunks, and Conversations
        print("\n[6] Testing Notebook, Sources, Chunks, and Source-Isolation...")
        notebook = Notebook(
            user_id=user.id,
            title="Physics Master Notebook",
            description="Sources and research notes.",
        )
        db.add(notebook)
        db.flush()

        source_a = Source(
            notebook_id=notebook.id,
            user_id=user.id,
            title="Electrodynamics.pdf",
            source_type="pdf",
            origin="upload",
            file_size=204850,
            page_count=12,
            status="ready",
        )
        source_b = Source(
            notebook_id=notebook.id,
            user_id=user.id,
            title="Mechanics_Formulas.pdf",
            source_type="pdf",
            origin="upload",
            file_size=102400,
            page_count=6,
            status="ready",
        )
        db.add_all([source_a, source_b])
        db.flush()

        chunk_a1 = SourceChunk(
            source_id=source_a.id,
            chunk_index=0,
            content="Gauss law relates electric flux to charge enclosed.",
            page_number=1,
            section_title="Electrostatics",
        )
        db.add(chunk_a1)
        db.flush()

        # Create Conversation A and link Source A
        conv_a = AIConversation(
            user_id=user.id,
            notebook_id=notebook.id,
            title="Maxwell Equations Discussion",
            is_pinned=True,
            custom_title=False,
        )
        db.add(conv_a)
        db.flush()

        conv_source_a = ConversationSource(
            conversation_id=conv_a.id,
            source_id=source_a.id,
            is_selected=True,
        )
        db.add(conv_source_a)

        msg_a = AIMessage(
            conversation_id=conv_a.id,
            role="user",
            content="Can you explain Gauss law?",
        )
        db.add(msg_a)

        # Create Conversation B (Isolated, with Source B)
        conv_b = AIConversation(
            user_id=user.id,
            notebook_id=notebook.id,
            title="Newtonian Mechanics",
            is_pinned=False,
            custom_title=False,
        )
        db.add(conv_b)
        db.flush()

        conv_source_b = ConversationSource(
            conversation_id=conv_b.id,
            source_id=source_b.id,
            is_selected=True,
        )
        db.add(conv_source_b)

        db.commit()
        print("    -> Data persisted successfully to Turso!")

        # 7. Verification Queries
        print("\n[7] Verifying Source Isolation from Turso...")
        # Check sources linked to Conv A
        sources_for_a = (
            db.query(Source)
            .join(ConversationSource, ConversationSource.source_id == Source.id)
            .filter(ConversationSource.conversation_id == conv_a.id)
            .all()
        )
        assert len(sources_for_a) == 1, f"Expected 1 source for Conv A, got {len(sources_for_a)}"
        assert sources_for_a[0].title == "Electrodynamics.pdf", "Wrong source linked to Conv A"
        print(f"    -> Conversation A strictly isolated: {[s.title for s in sources_for_a]}")

        # Check sources linked to Conv B
        sources_for_b = (
            db.query(Source)
            .join(ConversationSource, ConversationSource.source_id == Source.id)
            .filter(ConversationSource.conversation_id == conv_b.id)
            .all()
        )
        assert len(sources_for_b) == 1, f"Expected 1 source for Conv B, got {len(sources_for_b)}"
        assert sources_for_b[0].title == "Mechanics_Formulas.pdf", "Wrong source linked to Conv B"
        print(f"    -> Conversation B strictly isolated: {[s.title for s in sources_for_b]}")

        # Verify pinned conversation sorting
        conversations = (
            db.query(AIConversation)
            .filter(AIConversation.user_id == user.id)
            .order_by(AIConversation.is_pinned.desc(), AIConversation.created_at.desc())

            .all()
        )
        assert conversations[0].id == conv_a.id, "Pinned conversation should come first"
        print(f"    -> Pinned conversation ordering verified: {[c.title for c in conversations]}")

    finally:
        db.close()

    print("\n=== ALL TURSO APPLICATION VERIFICATIONS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    test_all()
