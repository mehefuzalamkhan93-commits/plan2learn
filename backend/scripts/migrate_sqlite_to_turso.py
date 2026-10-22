"""Safe, idempotent data migration script from local SQLite to Turso libSQL database.

Features:
- Preserves primary keys and foreign key relationships.
- Idempotent: checks for existing IDs before insertion, safe to run multiple times.
- Non-destructive: never deletes, drops, or clears destination tables.
- Transactional per table.
"""

import os
import sys
import sqlite3
from typing import Any

from dotenv import load_dotenv
load_dotenv()

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import libsql

LOCAL_DB_PATH = os.path.join(backend_dir, "smart_planner.db")
TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()

# Tables in strict dependency order
TABLES_ORDER = [
    ("users", "id"),
    ("student_profiles", "id"),
    ("subjects", "id"),
    ("topics", "id"),
    ("study_plans", "id"),
    ("study_plan_versions", "id"),
    ("study_tasks", "id"),
    ("streaks", "id"),
    ("progress_logs", "id"),
    ("readiness_scores", "id"),
    ("notebooks", "id"),
    ("sources", "id"),
    ("source_chunks", "id"),
    ("notebook_notes", "id"),
    ("ai_conversations", "id"),
    ("ai_messages", "id"),
    ("conversation_sources", "id"),
    ("google_oauth_states", "state"),
    ("google_drive_accounts", "id"),
]

def migrate():
    print("=== SQLITE TO TURSO DATA MIGRATION ===")
    if not os.path.exists(LOCAL_DB_PATH):
        print(f"Local database file not found at: {LOCAL_DB_PATH}")
        return

    if not TURSO_URL or not TURSO_TOKEN:
        print("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not set in environment.")
        return

    print(f"Source: {LOCAL_DB_PATH}")
    print(f"Destination: {TURSO_URL}")

    local_conn = sqlite3.connect(LOCAL_DB_PATH)
    local_conn.row_factory = sqlite3.Row
    local_cur = local_conn.cursor()

    turso_conn = libsql.connect(database=TURSO_URL, auth_token=TURSO_TOKEN)
    turso_cur = turso_conn.cursor()

    # Disable foreign key checks during migration batch insert
    try:
        turso_cur.execute("PRAGMA foreign_keys = OFF;")
    except Exception:
        pass

    total_migrated = 0
    total_skipped = 0

    print("\nMigrating tables...")
    for table_name, pk_col in TABLES_ORDER:
        # Check if table exists in local DB
        local_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (table_name,))
        if not local_cur.fetchone():
            continue

        # Check destination table existence
        try:
            turso_cur.execute(f"SELECT COUNT(*) FROM {table_name};")
        except Exception as e:
            print(f"  [!] Destination table '{table_name}' does not exist or inaccessible: {e}")
            continue

        # Get local records
        local_cur.execute(f"SELECT * FROM {table_name};")
        rows = local_cur.fetchall()
        if not rows:
            continue

        col_names = [d[0] for d in local_cur.description]
        placeholders = ", ".join(["?"] * len(col_names))
        cols_str = ", ".join([f'"{c}"' for c in col_names])

        # Fetch existing primary keys in destination
        turso_cur.execute(f'SELECT "{pk_col}" FROM {table_name};')
        existing_pks = set(r[0] for r in turso_cur.fetchall())

        inserted_count = 0
        skipped_count = 0

        insert_sql = f'INSERT OR IGNORE INTO {table_name} ({cols_str}) VALUES ({placeholders})'

        for row in rows:
            pk_val = row[pk_col]
            if pk_val in existing_pks:
                skipped_count += 1
                continue

            values = tuple(row[c] for c in col_names)
            try:
                turso_cur.execute(insert_sql, values)
                inserted_count += 1
                existing_pks.add(pk_val)
            except Exception as row_err:
                print(f"    Error inserting row in {table_name} (pk={pk_val}): {row_err}")

        turso_conn.commit()
        total_migrated += inserted_count
        total_skipped += skipped_count
        status = f"{inserted_count} copied, {skipped_count} already existed" if skipped_count else f"{inserted_count} copied"
        print(f"  -> {table_name:<25}: {len(rows):>4} local rows ({status})")

    try:
        turso_cur.execute("PRAGMA foreign_keys = ON;")
    except Exception:
        pass

    local_conn.close()
    turso_conn.close()

    print(f"\nMigration complete! Total newly copied: {total_migrated}, Preserved existing: {total_skipped}")

if __name__ == "__main__":
    migrate()
