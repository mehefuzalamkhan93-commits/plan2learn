import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.config import AISettings
from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import create_app
from app.models.user import OTPChallenge, StudentProfile, User
from app.services.email import EmailDeliveryError
from app.services.otp import (
    create_otp_challenge,
    generate_secure_otp,
    mask_email,
    verify_otp_challenge,
    verify_otp_hash,
)


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

    settings = AISettings(
        _env_file=None,
        resend_api_key="re_test_mock_key",
        email_from="Plan2Learn <noreply@plan2learn.online>",
        otp_expire_minutes=5,
        otp_max_attempts=5,
        otp_resend_cooldown_seconds=60,
    )
    app = create_app(settings)
    app.dependency_overrides[get_db] = override_get_db

    # Create a pre-seeded test user
    db = TestingSession()
    user = User(
        email="student@plan2learn.online",
        hashed_password=hash_password("SecurePassword123!"),
        full_name="Alice Student",
        is_active=True,
        is_onboarded=True,
    )
    db.add(user)
    db.flush()
    profile = StudentProfile(
        user_id=user.id,
        education_level="High School",
        board_curriculum="General",
        grade_class="Grade 12",
        target_subjects=["Physics"],
        weak_topics=[],
        strong_topics=[],
        daily_time_minutes=120,
        score_goal=90,
    )
    db.add(profile)
    db.commit()
    db.close()

    client = SyncASGITestClient(app)
    return client, TestingSession, settings


# ---------------------------------------------------------------------------
# Phase 7 Automated Tests: Scenarios 1 - 16
# ---------------------------------------------------------------------------


# 1. Successful password validation followed by OTP issuance
def test_password_validation_issues_otp_challenge(test_setup):
    client, Session, _ = test_setup
    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = {"id": "msg_123"}
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["requires_otp"] is True
        assert "challenge_id" in data
        assert data["masked_email"] == "s***t@plan2learn.online"
        assert mock_send.await_count == 1


# 2. OTP email delivery success and provider failure
def test_otp_email_provider_failure_returns_503(test_setup):
    client, _, _ = test_setup
    with patch("app.api.auth.send_otp_email", side_effect=EmailDeliveryError("Resend down", 500)):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        assert response.status_code == 503
        assert "Unable to send verification email" in response.json()["detail"]


# 3. Correct OTP verification
def test_correct_otp_verification_issues_jwt_token(test_setup):
    client, Session, _ = test_setup
    captured_otp = None

    async def fake_send(to_email, otp_code, **kwargs):
        nonlocal captured_otp
        captured_otp = otp_code
        return {"id": "1"}

    with patch("app.api.auth.send_otp_email", side_effect=fake_send):
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        challenge_id = login_res.json()["challenge_id"]

    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": captured_otp},
    )
    assert verify_res.status_code == 200
    res_data = verify_res.json()
    assert res_data["success"] is True
    assert res_data["data"]["user"]["email"] == "student@plan2learn.online"
    assert "access_token" in res_data["data"]
    assert "access_token" in client.cookies


# 4. Incorrect OTP rejection
def test_incorrect_otp_rejection(test_setup):
    client, Session, _ = test_setup
    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        challenge_id = login_res.json()["challenge_id"]

    bad_verify = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": "000000"},
    )
    assert bad_verify.status_code == 400
    assert "Invalid verification code" in bad_verify.json()["detail"]


# 5. OTP expiration
def test_otp_expiration_rejects_verification(test_setup):
    client, Session, _ = test_setup
    captured_otp = None

    async def fake_send(to_email, otp_code, **kwargs):
        nonlocal captured_otp
        captured_otp = otp_code
        return {"id": "1"}

    with patch("app.api.auth.send_otp_email", side_effect=fake_send):
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        challenge_id = login_res.json()["challenge_id"]

    # Manually expire the challenge in database
    db = Session()
    challenge = db.query(OTPChallenge).filter(OTPChallenge.id == challenge_id).first()
    challenge.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    db.close()

    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": captured_otp},
    )
    assert verify_res.status_code == 400
    assert "expired" in verify_res.json()["detail"].lower()


# 6. Maximum verification attempts
def test_maximum_verification_attempts_invalidates_challenge(test_setup):
    client, Session, _ = test_setup
    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        challenge_id = login_res.json()["challenge_id"]

    for _ in range(5):
        resp = client.post(
            "/api/v1/auth/verify-otp",
            json={"challenge_id": challenge_id, "otp": "999999"},
        )
        assert resp.status_code == 400

    # 6th attempt should return max attempts exceeded
    over_limit = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": "999999"},
    )
    assert over_limit.status_code == 400
    assert "invalid" in over_limit.json()["detail"].lower() or "maximum" in over_limit.json()["detail"].lower()


# 7. Resend cooldown
def test_resend_cooldown_enforced(test_setup):
    client, Session, _ = test_setup
    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        challenge_id = login_res.json()["challenge_id"]

    # Immediate resend attempt should hit 429
    resend_res = client.post("/api/v1/auth/resend-otp", json={"challenge_id": challenge_id})
    assert resend_res.status_code == 429
    assert "wait" in resend_res.json()["detail"].lower()


# 8. Old OTP invalidation after resend
def test_old_otp_invalidated_after_resend(test_setup):
    client, Session, _ = test_setup
    otps = []

    async def fake_send(to_email, otp_code, **kwargs):
        otps.append(otp_code)
        return {"id": "1"}

    with patch("app.api.auth.send_otp_email", side_effect=fake_send):
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        challenge_id = login_res.json()["challenge_id"]

        # Fast forward cooldown in DB
        db = Session()
        c = db.query(OTPChallenge).filter(OTPChallenge.id == challenge_id).first()
        c.resend_available_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
        db.close()

        resend_res = client.post("/api/v1/auth/resend-otp", json={"challenge_id": challenge_id})
        assert resend_res.status_code == 200
        new_challenge_id = resend_res.json()["challenge_id"]

    # Trying old OTP with old challenge_id must fail
    old_verify = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": otps[0]},
    )
    assert old_verify.status_code == 400

    # New OTP with new challenge_id succeeds
    new_verify = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": new_challenge_id, "otp": otps[1]},
    )
    assert new_verify.status_code == 200


# 9. OTP replay prevention
def test_otp_replay_prevention(test_setup):
    client, Session, _ = test_setup
    captured_otp = None

    async def fake_send(to_email, otp_code, **kwargs):
        nonlocal captured_otp
        captured_otp = otp_code
        return {"id": "1"}

    with patch("app.api.auth.send_otp_email", side_effect=fake_send):
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        challenge_id = login_res.json()["challenge_id"]

    first_use = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": captured_otp},
    )
    assert first_use.status_code == 200

    # Replay attempt
    replay = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": captured_otp},
    )
    assert replay.status_code == 400
    assert "invalid" in replay.json()["detail"].lower()


# 10. No authenticated session before successful verification
def test_no_authenticated_session_before_verification(test_setup):
    client, Session, _ = test_setup
    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
        client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        # Verify no token cookie was set on login
        assert "access_token" not in client.cookies


# 11. No access to protected routes while verification is pending
def test_protected_route_returns_401_when_verification_pending(test_setup):
    client, Session, _ = test_setup
    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
        client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )

    # Protected me endpoint
    protected_res = client.get("/api/v1/auth/me")
    assert protected_res.status_code == 401


# 12. Successful login after verification
def test_successful_access_to_protected_routes_after_verification(test_setup):
    client, Session, _ = test_setup
    captured_otp = None

    async def fake_send(to_email, otp_code, **kwargs):
        nonlocal captured_otp
        captured_otp = otp_code
        return {"id": "1"}

    with patch("app.api.auth.send_otp_email", side_effect=fake_send):
        login_res = client.post(
            "/api/v1/auth/login",
            json={"email": "student@plan2learn.online", "password": "SecurePassword123!"},
        )
        challenge_id = login_res.json()["challenge_id"]

    client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": captured_otp},
    )

    # Now protected route must succeed
    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["data"]["email"] == "student@plan2learn.online"


# 13. Existing signup flow with OTP
def test_signup_flow_issues_otp_and_authenticates(test_setup):
    client, Session, _ = test_setup
    captured_otp = None

    async def fake_send(to_email, otp_code, **kwargs):
        nonlocal captured_otp
        captured_otp = otp_code
        return {"id": "1"}

    signup_payload = {
        "full_name": "Bob Newbie",
        "email": "bob@plan2learn.online",
        "password": "BrandNewPassword123!",
        "confirm_password": "BrandNewPassword123!",
    }

    with patch("app.api.auth.send_otp_email", side_effect=fake_send):
        signup_res = client.post("/api/v1/auth/signup", json=signup_payload)
        assert signup_res.status_code == 201
        data = signup_res.json()
        assert data["requires_otp"] is True
        challenge_id = data["challenge_id"]

    # Verify OTP
    verify_res = client.post(
        "/api/v1/auth/verify-otp",
        json={"challenge_id": challenge_id, "otp": captured_otp},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["data"]["user"]["email"] == "bob@plan2learn.online"


# 14. Database persistence across application restarts
def test_otp_database_persistence_across_app_restarts():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    db = TestingSession()
    user = User(
        email="persist@plan2learn.online",
        hashed_password=hash_password("Pass123456!"),
        full_name="Persist User",
    )
    db.add(user)
    db.commit()

    challenge, plain_otp = create_otp_challenge(db, user, purpose="login")
    challenge_id = challenge.id
    db.close()

    # Simulate app restart with a fresh DB session
    new_db = TestingSession()
    verified = verify_otp_challenge(new_db, challenge_id, plain_otp)
    assert verified.id == challenge_id
    assert verified.is_used is True
    new_db.close()


# 15. Safe behavior when Resend configuration is missing in development
def test_safe_behavior_missing_resend_dev_mode():
    dev_settings = AISettings(_env_file=None, app_env="development", resend_api_key=None)
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

    app = create_app(dev_settings)
    app.dependency_overrides[get_db] = override_get_db

    db = TestingSession()
    user = User(
        email="devtest@plan2learn.online",
        hashed_password=hash_password("Pass123456!"),
        full_name="Dev User",
    )
    db.add(user)
    db.commit()
    db.close()

    client = SyncASGITestClient(app)
    # In development with missing key, login still creates challenge and logs safely
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "devtest@plan2learn.online", "password": "Pass123456!"},
    )
    assert response.status_code == 200
    assert response.json()["requires_otp"] is True


# 16. Utility functions: mask_email and hash verification
def test_otp_utility_functions():
    assert mask_email("a@b.com") == "a***@b.com"
    assert mask_email("student@plan2learn.online") == "s***t@plan2learn.online"
    otp = generate_secure_otp(6)
    assert len(otp) == 6
    assert otp.isdigit()
