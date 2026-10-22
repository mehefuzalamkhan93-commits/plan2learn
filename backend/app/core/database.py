import os
import sys
from collections.abc import Generator
from typing import Any

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text
from sqlalchemy.dialects import registry
from sqlalchemy.dialects.sqlite.pysqlite import SQLiteDialect_pysqlite
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Ensure Turso libSQL dialect is registered for SQLAlchemy
import app.core.turso_dialect  # noqa: F401



# ---------------------------------------------------------------------------
# Database Configuration & Selection
# ---------------------------------------------------------------------------
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_DB_PATH = os.path.join(BACKEND_DIR, "smart_planner.db").replace("\\", "/")

DATABASE_BACKEND = os.getenv("DATABASE_BACKEND", "").lower().strip()
TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()

# Explicit selection mechanism:
# 1. If DATABASE_BACKEND == "sqlite" -> Force local SQLite regardless of Turso env vars.
# 2. If TURSO_DATABASE_URL is set (and not forced to sqlite) -> Connect to Turso Cloud.
# 3. Otherwise -> Use local SQLite development database.
if DATABASE_BACKEND == "sqlite":
    IS_TURSO = False
    DATABASE_URL = os.getenv("LOCAL_DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")
    connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True,
    )
elif TURSO_DATABASE_URL:
    if not TURSO_AUTH_TOKEN:
        raise RuntimeError(
            "TURSO_DATABASE_URL is configured, but TURSO_AUTH_TOKEN is missing. "
            "Please provide a valid Turso authentication token in your environment."
        )
    IS_TURSO = True
    clean_host = TURSO_DATABASE_URL.replace("libsql://", "").replace("https://", "").rstrip("/")
    DATABASE_URL = f"sqlite+libsql://{clean_host}"
    engine = create_engine(
        DATABASE_URL,
        connect_args={
            "auth_token": TURSO_AUTH_TOKEN,
        },
        pool_pre_ping=True,
    )
else:
    IS_TURSO = False
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")
    connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
    engine = create_engine(
        DATABASE_URL,
        connect_args=connect_args,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_database_backend_name() -> str:
    """Return 'turso' if connected to Turso Cloud, else 'sqlite'."""
    return "turso" if IS_TURSO else "sqlite"


def check_database_connection() -> dict[str, Any]:
    """Test connectivity and return database status info."""
    try:
        with engine.connect() as conn:
            res = conn.execute(text("SELECT 1")).scalar()
            return {
                "status": "healthy" if res == 1 else "unexpected_result",
                "backend": get_database_backend_name(),
                "database_url": DATABASE_URL.split("?")[0] if not IS_TURSO else f"sqlite+libsql://{clean_host}",
            }
    except Exception as e:
        return {
            "status": "unhealthy",
            "backend": get_database_backend_name(),
            "error": str(e),
        }
