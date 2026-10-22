"""Wipe all user data from both Turso Cloud and local development databases,
as well as backend uploaded assets, ensuring a completely clean slate.
"""

import os
import shutil
import sys

# Ensure backend root is on Python path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import app.models  # load all declarative models
from app.core.database import Base, engine, IS_TURSO, DEFAULT_DB_PATH

TABLES_TO_WIPE = [
    "ai_messages",
    "conversation_sources",
    "ai_conversations",
    "source_chunks",
    "sources",
    "notebook_notes",
    "notebooks",
    "study_tasks",
    "study_plan_versions",
    "study_plans",
    "progress_logs",
    "streaks",
    "readiness_scores",
    "topics",
    "subjects",
    "exams",
    "student_profiles",
    "google_drive_accounts",
    "google_oauth_states",
    "users",
]


def wipe_database(db_engine, name: str):
    print(f"\n--- Wiping Database: {name} ({db_engine.url}) ---")
    Session = sessionmaker(bind=db_engine)
    session = Session()
    try:
        session.execute(text("PRAGMA foreign_keys = OFF;"))
        for table_name in TABLES_TO_WIPE:
            try:
                result = session.execute(text(f"DELETE FROM {table_name};"))
                print(f"  [CLEARED] Table '{table_name}'")
            except Exception as exc:
                print(f"  [SKIPPED] Table '{table_name}': {exc}")
        session.execute(text("PRAGMA foreign_keys = ON;"))
        session.commit()
        print(f"Database {name} wiped successfully.")
    except Exception as exc:
        session.rollback()
        print(f"Error wiping {name}: {exc}")
        raise
    finally:
        session.close()


def wipe_uploads():
    uploads_dir = os.path.join(BACKEND_DIR, "uploads")
    if os.path.exists(uploads_dir):
        print(f"\n--- Cleaning uploads directory: {uploads_dir} ---")
        items = os.listdir(uploads_dir)
        count = 0
        for item in items:
            item_path = os.path.join(uploads_dir, item)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path)
                    count += 1
                elif os.path.isfile(item_path):
                    os.remove(item_path)
                    count += 1
            except Exception as e:
                print(f"  Failed to remove {item_path}: {e}")
        print(f"Removed {count} uploaded files/directories.")
    else:
        print("Uploads directory does not exist, nothing to clean.")


def main():
    print("====================================================")
    print("PLAN2LEARN: COMPLETE USER DATA RESET")
    print("====================================================")

    # 1. Wipe active engine (Turso in production / current .env)
    wipe_database(engine, "Active Target (Turso/Configured)")

    # 2. Also wipe local SQLite database if it exists
    if os.path.exists(DEFAULT_DB_PATH):
        sqlite_engine = create_engine(
            f"sqlite:///{DEFAULT_DB_PATH}",
            connect_args={"check_same_thread": False},
        )
        wipe_database(sqlite_engine, "Local SQLite (smart_planner.db)")

    # 3. Clean uploaded files
    wipe_uploads()

    # 4. Verify user counts
    Session = sessionmaker(bind=engine)
    session = Session()
    user_count = session.execute(text("SELECT count(*) FROM users;")).scalar()
    print("\n----------------------------------------------------")
    print(f"Verification: Total users remaining in active DB = {user_count}")
    print("----------------------------------------------------")
    session.close()


if __name__ == "__main__":
    main()
