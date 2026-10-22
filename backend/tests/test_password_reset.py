import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.config import AISettings
from app.core.database import Base, get_db
from app.core.security import hash_password, verify_password
from app.main import create_app
from app.models.user import StudentProfile, User, UserSession


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
def test_setup():
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

    app = create_app(AISettings(_env_file=None, resend_api_key="re_test_key_123"))
    app.dependency_overrides[get_db] = override_get_db
    client = SyncASGITestClient(app)

    db = TestingSession()
    user = User(
        email="reset.user@example.com",
        hashed_password=hash_password("OldPassword123!"),
        full_name="Reset User",
        is_active=True,
        is_onboarded=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    profile = StudentProfile(
        user_id=user.id,
        education_level="College",
        board_curriculum="General",
        grade_class="Year 2",
    )
    db.add(profile)
    db.commit()
    db.close()

    yield client, TestingSession


def test_login_unknown_account_returns_404(test_setup):
    client, _ = test_setup
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@example.com", "password": "Password123!"},
    )
    assert res.status_code == 404
    assert "No account found" in res.json()["detail"]


def test_login_incorrect_password_returns_401(test_setup):
    client, _ = test_setup
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "reset.user@example.com", "password": "WrongPassword!"},
    )
    assert res.status_code == 401
    assert "Incorrect password" in res.json()["detail"]


def test_forgot_password_unknown_email_returns_generic_message(test_setup):
    client, _ = test_setup
    res = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "unknown@example.com"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["challenge_id"] is None
    assert "If an account exists" in data["message"]


def test_full_password_reset_flow(test_setup):
    client, TestingSession = test_setup
    captured = {}

    async def fake_send(to_email, otp_code, **kwargs):
        captured["otp"] = otp_code
        return {"id": "resend_1"}

    # 1. Request password reset
    with patch("app.api.auth.send_password_reset_email", side_effect=fake_send):
        res = client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "reset.user@example.com"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        challenge_id = data["challenge_id"]
        assert challenge_id is not None
        assert captured.get("otp") is not None

    # 2. Verify invalid reset code
    fail_res = client.post(
        "/api/v1/auth/verify-reset-otp",
        json={"challenge_id": challenge_id, "otp": "000000"},
    )
    assert fail_res.status_code == 400
    assert "Invalid verification code" in fail_res.json()["detail"]

    # 3. Verify valid reset code -> get reset token
    verify_res = client.post(
        "/api/v1/auth/verify-reset-otp",
        json={"challenge_id": challenge_id, "otp": captured["otp"]},
    )
    assert verify_res.status_code == 200
    reset_token = verify_res.json()["reset_token"]
    assert reset_token is not None

    # 4. Attempt reset with mismatched passwords
    mismatch_res = client.post(
        "/api/v1/auth/reset-password",
        json={
            "reset_token": reset_token,
            "new_password": "NewSecretPassword123!",
            "confirm_password": "DifferentPassword123!",
        },
    )
    assert mismatch_res.status_code == 400
    assert "Passwords do not match" in mismatch_res.json()["detail"]

    # 5. Successfully reset password
    success_res = client.post(
        "/api/v1/auth/reset-password",
        json={
            "reset_token": reset_token,
            "new_password": "NewSecretPassword123!",
            "confirm_password": "NewSecretPassword123!",
        },
    )
    assert success_res.status_code == 200
    assert "reset successfully" in success_res.json()["message"]

    # 6. Replay attack: attempt to use the same reset token again
    replay_res = client.post(
        "/api/v1/auth/reset-password",
        json={
            "reset_token": reset_token,
            "new_password": "AnotherPassword123!",
            "confirm_password": "AnotherPassword123!",
        },
    )
    assert replay_res.status_code == 400
    assert "already been used" in replay_res.json()["detail"]

    # 7. Old password no longer works
    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "reset.user@example.com", "password": "OldPassword123!"},
    )
    assert old_login.status_code == 401

    # 8. New password works and initiates login OTP
    with patch("app.api.auth.send_otp_email", side_effect=fake_send):
        new_login = client.post(
            "/api/v1/auth/login",
            json={"email": "reset.user@example.com", "password": "NewSecretPassword123!"},
        )
        assert new_login.status_code == 200
        assert new_login.json()["requires_otp"] is True


def test_cross_purpose_otp_rejection(test_setup):
    client, _ = test_setup
    captured = {}

    async def fake_send(to_email, otp_code, **kwargs):
        captured["otp"] = otp_code
        return {"id": "resend_1"}

    # Request password reset OTP
    with patch("app.api.auth.send_password_reset_email", side_effect=fake_send):
        res = client.post("/api/v1/auth/forgot-password", json={"email": "reset.user@example.com"})
        pwd_challenge_id = res.json()["challenge_id"]

    # Attempt to use password reset OTP to log in (must be rejected!)
    login_attempt = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": pwd_challenge_id, "otp": captured["otp"]},
    )
    assert login_attempt.status_code == 400
    assert "different purpose" in login_attempt.json()["detail"]
