import pytest
from unittest.mock import AsyncMock, patch
from starlette.testclient import TestClient

from app.main import create_app
from app.core.database import Base, get_db
from app.models.user import User, StudentProfile
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.ai.config import AISettings, get_ai_settings


@pytest.fixture
def test_app():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    settings = AISettings(
        _env_file=None,
        jwt_secret_key="test_jwt_secret_key_google_auth",
        google_drive_client_id="test-client-id.apps.googleusercontent.com",
    )
    app = create_app(settings)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_ai_settings] = lambda: settings
    client = TestClient(app)
    client.session_factory = TestingSessionLocal
    return client


def test_google_auth_config(test_app):
    resp = test_app.get("/api/v1/auth/google/config")
    assert resp.status_code == 200
    assert resp.json()["client_id"] == "test-client-id.apps.googleusercontent.com"


@patch("app.api.auth.verify_google_credential")
def test_google_auth_creates_new_user(mock_verify, test_app):
    mock_verify.return_value = {
        "email": "newstudent@gmail.com",
        "name": "New Student",
        "sub": "123456789",
        "picture": "https://example.com/avatar.jpg",
    }

    resp = test_app.post("/api/v1/auth/google", json={"credential": "mock_jwt_credential"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["data"]["user"]["email"] == "newstudent@gmail.com"
    assert data["data"]["user"]["full_name"] == "New Student"
    assert data["data"]["access_token"] is not None
    assert "access_token" in resp.cookies

    # Verify DB has user and student profile
    with test_app.session_factory() as db:
        user = db.query(User).filter(User.email == "newstudent@gmail.com").first()
        assert user is not None
        assert user.profile is not None
        assert user.profile.daily_time_minutes == 180


@patch("app.api.auth.verify_google_credential")
def test_google_auth_logs_in_existing_user(mock_verify, test_app):
    # First sign in
    mock_verify.return_value = {
        "email": "existingstudent@gmail.com",
        "name": "Existing Student",
        "sub": "987654321",
        "picture": "https://example.com/avatar.jpg",
    }

    resp1 = test_app.post("/api/v1/auth/google", json={"credential": "mock_token_1"})
    assert resp1.status_code == 200

    # Second sign in (same email)
    resp2 = test_app.post("/api/v1/auth/google", json={"credential": "mock_token_2"})
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["success"] is True
    assert data2["data"]["user"]["email"] == "existingstudent@gmail.com"
