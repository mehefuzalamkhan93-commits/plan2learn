"""One-off migration for the live smoke-test database."""
import sys

from app.core.database import Base, engine
import app.models  # noqa: F401 — registers all models

Base.metadata.create_all(engine)
print("smoke db tables created")
