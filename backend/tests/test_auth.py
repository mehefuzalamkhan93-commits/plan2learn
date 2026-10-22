import asyncio

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.config import AISettings
from app.core.database import Base, get_db
from app.main import create_app


class SyncASGITestClient:
    def __init__(self, app) -> None:
        self.app = app
        self.cookies: dict[str, str] = {}

    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        async def send_request() -> httpx.Response:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=self.app),
                base_url="http://testserver",
                cookies=self.cookies,
            ) as client:
                response = await client.request(method, path, **kwargs)
                self.cookies.update(dict(response.cookies))
                return response

        return asyncio.run(send_request())

    def get(self, path: str, **kwargs) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def put(self, path: str, **kwargs) -> httpx.Response:
        return self.request("PUT", path, **kwargs)

    def post(self, path: str, **kwargs) -> httpx.Response:
        return self.request("POST", path, **kwargs)


@pytest.fixture
def client_and_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app = create_app(AISettings(_env_file=None))
    app.dependency_overrides[get_db] = override_get_db
    client = SyncASGITestClient(app)
    yield client, TestingSession


def test_signup_creates_account_and_sets_cookie(client_and_db):
    client, _ = client_and_db
    payload = {
        "full_name": "Test Student",
        "email": "student@example.com",
        "password": "Password123!",
        "confirm_password": "Password123!",
    }
    response = client.post("/api/v1/auth/signup", json=payload)
    assert response.status_code == 201
    res_data = response.json()
    assert res_data["success"] is True
    assert res_data["data"]["user"]["email"] == "student@example.com"
    assert res_data["data"]["user"]["is_onboarded"] is False
    assert "access_token" in response.cookies


def test_signup_duplicate_email_does_not_reveal_account_existence(client_and_db):
    client, _ = client_and_db
    payload = {
        "full_name": "Test Student",
        "email": "student@example.com",
        "password": "Password123!",
        "confirm_password": "Password123!",
    }
    client.post("/api/v1/auth/signup", json=payload)
    response = client.post("/api/v1/auth/signup", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Unable to create an account with the provided details."


def test_login_success_and_me_endpoint(client_and_db):
    client, _ = client_and_db
    signup_payload = {
        "full_name": "Login Student",
        "email": "login@example.com",
        "password": "Password123!",
        "confirm_password": "Password123!",
    }
    client.post("/api/v1/auth/signup", json=signup_payload)

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "Password123!"},
    )
    assert login_response.status_code == 200
    me_response = client.get("/api/v1/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["data"]["email"] == "login@example.com"


def test_unauthenticated_me_returns_401(client_and_db):
    client, _ = client_and_db
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_update_profile_persists_subjects_and_exam_date(client_and_db):
    """Settings-modal saves must round-trip through PUT/GET /auth/profile.

    This is the backend half of the shared profile sync: whatever the Settings
    modal saves must be the single source of truth that Dashboard, Intel and
    the AI prompt builder read back.
    """
    client, _ = client_and_db
    signup_payload = {
        "full_name": "Persistence Student",
        "email": "persist@example.com",
        "password": "Password123!",
        "confirm_password": "Password123!",
    }
    signup = client.post("/api/v1/auth/signup", json=signup_payload)
    assert signup.status_code == 201, signup.text

    update = client.put(
        "/api/v1/auth/profile",
        json={
            "target_subjects": ["Mathematics", "  Physics  ", "", "Bengali"],
            "weak_topics": ["Thermodynamics", "", "Rotational Motion"],
            "strong_topics": ["Kinematics"],
            "daily_time_minutes": 150,
            "exam_date": "2026-12-13",
        },
    )
    assert update.status_code == 200, update.text
    saved = update.json()["data"]
    assert saved["target_subjects"] == ["Mathematics", "Physics", "Bengali"]
    assert saved["weak_topics"] == ["Thermodynamics", "Rotational Motion"]
    assert saved["exam_date"] == "2026-12-13"
    assert saved["daily_time_minutes"] == 150

    # Re-read in a fresh request (no state shared with the PUT): values must
    # come back from the database exactly as saved.
    fetched = client.get("/api/v1/auth/profile")
    assert fetched.status_code == 200
    profile = fetched.json()["data"]
    assert profile["target_subjects"] == ["Mathematics", "Physics", "Bengali"]
    assert profile["weak_topics"] == ["Thermodynamics", "Rotational Motion"]
    assert profile["exam_date"] == "2026-12-13"

    # Removing a subject in Settings must actually remove it (not append).
    second_update = client.put(
        "/api/v1/auth/profile",
        json={"target_subjects": ["Mathematics", "Bengali"]},
    )
    assert second_update.status_code == 200
    refreshed = client.get("/api/v1/auth/profile")
    assert refreshed.json()["data"]["target_subjects"] == ["Mathematics", "Bengali"]
