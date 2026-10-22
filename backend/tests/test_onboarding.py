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

    def post(self, path: str, **kwargs) -> httpx.Response:
        return self.request("POST", path, **kwargs)


@pytest.fixture
def onboarding_client() -> SyncASGITestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override_get_db():
        session = testing_session()
        try:
            yield session
        finally:
            session.close()

    app = create_app(AISettings(_env_file=None))
    app.dependency_overrides[get_db] = override_get_db
    return SyncASGITestClient(app)


def signup(client: SyncASGITestClient, email: str) -> None:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Onboarding Student",
            "email": email,
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert response.status_code == 201


def test_baseline_onboarding_creates_profile_and_preserves_unapproved_state(
    onboarding_client: SyncASGITestClient,
) -> None:
    signup(onboarding_client, "baseline@example.com")

    response = onboarding_client.post(
        "/api/v1/onboarding",
        json={
            "education_level": "High School",
            "board_curriculum": "CBSE",
            "grade_class": "Class 12",
            "target_subjects": ["Calculus", "Physics"],
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["next_route"] == "/dashboard"
    assert data["profile"]["target_subjects"] == ["Calculus", "Physics"]
    assert data["profile"]["daily_time_minutes"] == 180
    assert onboarding_client.get("/api/v1/auth/me").json()["data"]["is_onboarded"] is True


def test_baseline_onboarding_requires_authentication(onboarding_client: SyncASGITestClient) -> None:
    response = onboarding_client.post(
        "/api/v1/onboarding",
        json={
            "education_level": "High School",
            "board_curriculum": "CBSE",
            "grade_class": "Class 12",
            "target_subjects": ["Calculus"],
        },
    )

    assert response.status_code == 401


def test_baseline_onboarding_rejects_empty_subject_list(
    onboarding_client: SyncASGITestClient,
) -> None:
    signup(onboarding_client, "empty-subjects@example.com")
    response = onboarding_client.post(
        "/api/v1/onboarding",
        json={
            "education_level": "High School",
            "board_curriculum": "CBSE",
            "grade_class": "Class 12",
            "target_subjects": [],
        },
    )

    assert response.status_code == 422