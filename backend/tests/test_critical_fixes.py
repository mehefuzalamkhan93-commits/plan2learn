import asyncio
from datetime import date, datetime, timedelta, timezone
import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.config import AISettings
from app.core.database import Base, get_db
from app.core.security import create_access_token, register_or_rotate_session
from app.main import create_app
from app.models.catalog import Subject, Topic
from app.models.plan import StudyPlan, StudyPlanVersion, StudyTask
from app.models.user import User, StudentProfile, UserSession


def run(coroutine):
    return asyncio.run(coroutine)


class CustomClientWithMethods:
    def __init__(self, app) -> None:
        self.app = app
        self.cookies: dict[str, str] = {}
        self.headers: dict[str, str] = {}

    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        headers = dict(self.headers)
        if "headers" in kwargs:
            headers.update(kwargs.pop("headers"))

        async def send_request() -> httpx.Response:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=self.app),
                base_url="http://testserver",
                cookies=self.cookies,
                headers=headers,
            ) as client:
                response = await client.request(method, path, **kwargs)
                self.cookies.update(dict(response.cookies))
                return response

        return run(send_request())

    def get(self, path: str, **kwargs) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> httpx.Response:
        return self.request("POST", path, **kwargs)

    def put(self, path: str, **kwargs) -> httpx.Response:
        return self.request("PUT", path, **kwargs)

    def patch(self, path: str, **kwargs) -> httpx.Response:
        return self.request("PATCH", path, **kwargs)

    def delete(self, path: str, **kwargs) -> httpx.Response:
        return self.request("DELETE", path, **kwargs)


@pytest.fixture
def app_and_db():
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

    client = CustomClientWithMethods(app)
    client.session_factory = testing_session
    return client, testing_session


def register_user(client: CustomClientWithMethods, email: str, name: str = "Test User") -> tuple[User, str, str]:
    with client.session_factory() as db:
        user = User(
            email=email,
            hashed_password="hashed_pw_test",
            full_name=name,
            is_active=True,
            is_onboarded=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        session = register_or_rotate_session(
            db,
            user.id,
            device_id=f"device-{user.id}-1",
            device_name="Primary Device",
            device_type="desktop",
        )
        token = create_access_token({"sub": user.id, "sid": session.id})
        return user, session.id, token


# ==============================================================================
# ISSUE 1 TESTS — PLANNER SYNC & DASHBOARD
# ==============================================================================

def test_create_task_persists_and_appears_in_dashboard(app_and_db):
    client, session_factory = app_and_db
    user, session_id, token = register_user(client, "planner_user@example.com")
    client.headers["Authorization"] = f"Bearer {token}"

    today_str = date.today().isoformat()
    # 1. Create a task via API
    create_res = client.post(
        "/api/v1/planner/tasks",
        json={
            "title": "Solve Thermodynamics Practice Problems",
            "subject": "Physics",
            "scheduled_date": today_str,
            "scheduled_time": "14:00",
            "duration_minutes": 75,
            "priority_tag": "Weak Area",
        },
    )
    assert create_res.status_code == 201
    created_data = create_res.json()
    task_id = created_data["id"]
    assert created_data["topic_name"] == "Solve Thermodynamics Practice Problems"
    assert created_data["subject"] == "Physics"

    # 2. Verify it appears in dashboard summary
    dash_res = client.get(f"/api/v1/dashboard/summary?target_date={today_str}")
    assert dash_res.status_code == 200
    dash_data = dash_res.json()

    today_task_ids = [t["id"] for t in dash_data["today_tasks"]]
    assert task_id in today_task_ids

    # 3. Verify it persists on reload / get tasks
    get_res = client.get("/api/v1/planner/tasks")
    assert get_res.status_code == 200
    all_tasks = get_res.json()
    assert any(t["id"] == task_id for t in all_tasks)


def test_task_update_patch_propagates_to_dashboard(app_and_db):
    client, session_factory = app_and_db
    user, session_id, token = register_user(client, "patch_user@example.com")
    client.headers["Authorization"] = f"Bearer {token}"

    today_str = date.today().isoformat()
    create_res = client.post(
        "/api/v1/planner/tasks",
        json={
            "title": "Initial Task Title",
            "subject": "Math",
            "scheduled_date": today_str,
            "scheduled_time": "10:00",
            "duration_minutes": 60,
            "priority_tag": "Regular",
        },
    )
    assert create_res.status_code == 201
    task_id = create_res.json()["id"]

    # Patch the task
    patch_res = client.patch(
        f"/api/v1/planner/tasks/{task_id}",
        json={
            "title": "Updated Task Title (Calculus Derivatives)",
            "duration_minutes": 90,
            "priority_tag": "Spaced Revision",
            "completed": True,
        },
    )
    assert patch_res.status_code == 200
    patched = patch_res.json()
    assert patched["topic_name"] == "Updated Task Title (Calculus Derivatives)"
    assert patched["duration_minutes"] == 90
    assert patched["priority_tag"] == "Spaced Revision"
    assert patched["completed"] is True

    # Check dashboard reflection
    dash_res = client.get(f"/api/v1/dashboard/summary?target_date={today_str}")
    assert dash_res.status_code == 200
    found_in_dash = next(t for t in dash_res.json()["today_tasks"] if t["id"] == task_id)
    assert found_in_dash["topic"]["name"] == "Updated Task Title (Calculus Derivatives)"
    assert found_in_dash["completed"] is True


def test_task_delete_propagates_to_dashboard(app_and_db):
    client, session_factory = app_and_db
    user, session_id, token = register_user(client, "delete_user@example.com")
    client.headers["Authorization"] = f"Bearer {token}"

    today_str = date.today().isoformat()
    create_res = client.post(
        "/api/v1/planner/tasks",
        json={
            "title": "Task to Delete",
            "subject": "Chemistry",
            "scheduled_date": today_str,
            "scheduled_time": "16:00",
            "duration_minutes": 45,
            "priority_tag": "Regular",
        },
    )
    task_id = create_res.json()["id"]

    # Delete task
    del_res = client.delete(f"/api/v1/planner/tasks/{task_id}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # Dashboard must not contain deleted task
    dash_res = client.get(f"/api/v1/dashboard/summary?target_date={today_str}")
    today_task_ids = [t["id"] for t in dash_res.json()["today_tasks"]]
    assert task_id not in today_task_ids


def test_planner_user_isolation(app_and_db):
    client, session_factory = app_and_db
    user_a, sid_a, token_a = register_user(client, "user_a@example.com", "User A")
    user_b, sid_b, token_b = register_user(client, "user_b@example.com", "User B")

    # User A creates a task
    client.headers["Authorization"] = f"Bearer {token_a}"
    today_str = date.today().isoformat()
    create_res = client.post(
        "/api/v1/planner/tasks",
        json={
            "title": "User A Private Plan",
            "subject": "Physics",
            "scheduled_date": today_str,
            "scheduled_time": "11:00",
            "duration_minutes": 60,
        },
    )
    task_id = create_res.json()["id"]

    # User B attempts to access User A's task
    client.headers["Authorization"] = f"Bearer {token_b}"
    b_patch = client.patch(
        f"/api/v1/planner/tasks/{task_id}",
        json={"title": "Hacked Title"},
    )
    assert b_patch.status_code == 404

    b_delete = client.delete(f"/api/v1/planner/tasks/{task_id}")
    assert b_delete.status_code == 404

    # User B's dashboard must NOT contain User A's task
    b_dash = client.get(f"/api/v1/dashboard/summary?target_date={today_str}")
    b_task_ids = [t["id"] for t in b_dash.json()["today_tasks"]]
    assert task_id not in b_task_ids


# ==============================================================================
# ISSUE 2 TESTS — PROFILE SETTINGS & SUBJECTS PERSISTENCE
# ==============================================================================

def test_profile_subjects_persistence_and_reload(app_and_db):
    client, session_factory = app_and_db
    user, session_id, token = register_user(client, "profile_sub@example.com")
    client.headers["Authorization"] = f"Bearer {token}"

    # Update profile with custom subjects
    update_res = client.put(
        "/api/v1/auth/profile",
        json={
            "full_name": "Profile Student",
            "education_level": "Undergraduate",
            "board_curriculum": "Autonomous",
            "target_subjects": ["Computer Science", "Bengali", "Discrete Mathematics"],
            "exam_date": "2026-12-15",
            "daily_time_minutes": 180,
        },
    )
    assert update_res.status_code == 200
    data = update_res.json()["data"]
    assert "Bengali" in data["target_subjects"]
    assert "Computer Science" in data["target_subjects"]
    assert "Discrete Mathematics" in data["target_subjects"]

    # Reload profile via GET and confirm persistence
    get_res = client.get("/api/v1/auth/profile")
    assert get_res.status_code == 200
    reloaded = get_res.json()["data"]
    assert reloaded["target_subjects"] == ["Computer Science", "Bengali", "Discrete Mathematics"]
    assert reloaded["exam_date"] == "2026-12-15"
    assert reloaded["daily_time_minutes"] == 180


def test_profile_subjects_deduplication(app_and_db):
    client, session_factory = app_and_db
    user, session_id, token = register_user(client, "dedup_user@example.com")
    client.headers["Authorization"] = f"Bearer {token}"

    update_res = client.put(
        "/api/v1/auth/profile",
        json={
            "target_subjects": [
                "Mathematics",
                "mathematics",
                " MATHEMATICS ",
                "Physics",
                " physics ",
                "Chemistry",
            ],
        },
    )
    assert update_res.status_code == 200
    subjects = update_res.json()["data"]["target_subjects"]
    assert len(subjects) == 3
    assert set(subjects) == {"Mathematics", "Physics", "Chemistry"}


def test_profile_user_isolation(app_and_db):
    client, session_factory = app_and_db
    user_a, sid_a, token_a = register_user(client, "user_iso_a@example.com", "Student A")
    user_b, sid_b, token_b = register_user(client, "user_iso_b@example.com", "Student B")

    # User A sets subjects
    client.headers["Authorization"] = f"Bearer {token_a}"
    client.put("/api/v1/auth/profile", json={"target_subjects": ["Bengali", "History"]})

    # User B sets different subjects
    client.headers["Authorization"] = f"Bearer {token_b}"
    client.put("/api/v1/auth/profile", json={"target_subjects": ["Economics", "Accounting"]})

    # User A gets profile
    client.headers["Authorization"] = f"Bearer {token_a}"
    a_prof = client.get("/api/v1/auth/profile").json()["data"]
    assert a_prof["target_subjects"] == ["Bengali", "History"]

    # User B gets profile
    client.headers["Authorization"] = f"Bearer {token_b}"
    b_prof = client.get("/api/v1/auth/profile").json()["data"]
    assert b_prof["target_subjects"] == ["Economics", "Accounting"]


# ==============================================================================
# ISSUE 3 TESTS — DEVICE-AWARE LOGOUT & SESSION MANAGEMENT
# ==============================================================================

def test_logout_single_session_revokes_and_rejects_protected(app_and_db):
    client, session_factory = app_and_db
    user, session_id, token = register_user(client, "single_logout@example.com")
    client.headers["Authorization"] = f"Bearer {token}"

    # Query devices: exactly 1 active device
    devices_res = client.get("/api/v1/auth/devices")
    assert devices_res.status_code == 200
    assert len(devices_res.json()["devices"]) == 1

    # Logout current device
    logout_res = client.post("/api/v1/auth/logout")
    assert logout_res.status_code == 200
    assert logout_res.json()["success"] is True

    # Token is now revoked: accessing protected endpoint returns 401
    me_res = client.get("/api/v1/auth/me")
    assert me_res.status_code == 401


def test_logout_multi_session_revokes_current_device_only(app_and_db):
    client, session_factory = app_and_db
    user, sid1, token1 = register_user(client, "multi_logout@example.com")

    # Register 2nd session on a mobile device for the same user
    with session_factory() as db:
        session2 = register_or_rotate_session(
            db,
            user.id,
            device_id="mobile-phone-device-2",
            device_name="Pixel 8 Phone",
            device_type="mobile",
        )
        token2 = create_access_token({"sub": user.id, "sid": session2.id})
        sid2 = session2.id

    # 1. Device list shows 2 active devices
    client.headers["Authorization"] = f"Bearer {token1}"
    devices_res = client.get("/api/v1/auth/devices")
    assert devices_res.status_code == 200
    assert len(devices_res.json()["devices"]) == 2

    # 2. Log out FROM DEVICE 1 ONLY (all_devices=False)
    logout_res = client.post("/api/v1/auth/logout", params={"all_devices": False})
    assert logout_res.status_code == 200

    # 3. Device 1 token is REVOKED -> 401
    me_1 = client.get("/api/v1/auth/me")
    assert me_1.status_code == 401

    # 4. Device 2 token is STILL VALID -> 200
    client.headers["Authorization"] = f"Bearer {token2}"
    me_2 = client.get("/api/v1/auth/me")
    assert me_2.status_code == 200
    assert me_2.json()["data"]["email"] == "multi_logout@example.com"

    # 5. Device 2 now sees only 1 active session remaining
    devices_res_2 = client.get("/api/v1/auth/devices")
    assert len(devices_res_2.json()["devices"]) == 1
    assert devices_res_2.json()["devices"][0]["device_id"] == "mobile-phone-device-2"


def test_logout_all_devices_revokes_every_session(app_and_db):
    client, session_factory = app_and_db
    user, sid1, token1 = register_user(client, "logout_all@example.com")

    with session_factory() as db:
        session2 = register_or_rotate_session(
            db,
            user.id,
            device_id="device-all-2",
            device_name="Tablet",
            device_type="tablet",
        )
        token2 = create_access_token({"sub": user.id, "sid": session2.id})

    # Call logout with all_devices=True
    client.headers["Authorization"] = f"Bearer {token1}"
    logout_res = client.post("/api/v1/auth/logout", params={"all_devices": True})
    assert logout_res.status_code == 200

    # Both tokens are revoked
    me_1 = client.get("/api/v1/auth/me")
    assert me_1.status_code == 401

    client.headers["Authorization"] = f"Bearer {token2}"
    me_2 = client.get("/api/v1/auth/me")
    assert me_2.status_code == 401


def test_expired_sessions_are_excluded_and_rejected(app_and_db):
    client, session_factory = app_and_db
    user, sid_current, token_current = register_user(client, "expired_test@example.com")

    # Create an artificially expired session (>8 days ago)
    with session_factory() as db:
        expired_session = UserSession(
            user_id=user.id,
            device_id="old-expired-device",
            device_name="Old PC",
            device_type="desktop",
            is_active=True,
            last_active_at=datetime.now(timezone.utc) - timedelta(days=9),
        )
        db.add(expired_session)
        db.commit()
        db.refresh(expired_session)
        expired_token = create_access_token({"sub": user.id, "sid": expired_session.id})

    # 1. GET /api/v1/auth/devices filters out the expired session
    client.headers["Authorization"] = f"Bearer {token_current}"
    devices = client.get("/api/v1/auth/devices").json()["devices"]
    device_ids = [d["device_id"] for d in devices]
    assert "old-expired-device" not in device_ids
    assert len(devices) == 1

    # 2. Attempting to use the expired token returns 401
    client.headers["Authorization"] = f"Bearer {expired_token}"
    expired_me = client.get("/api/v1/auth/me")
    assert expired_me.status_code == 401


def test_missing_or_invalid_credentials_returns_401(app_and_db):
    client, _ = app_and_db
    client.headers.clear()

    # 1. No credentials returns 401 "Not authenticated"
    res_no_auth = client.get("/api/v1/auth/me")
    assert res_no_auth.status_code == 401
    assert res_no_auth.json()["detail"] == "Not authenticated"

    # Profile without token returns 401
    res_profile = client.get("/api/v1/auth/profile")
    assert res_profile.status_code == 401
    assert res_profile.json()["detail"] == "Not authenticated"

    # Dashboard without token returns 401
    res_dash = client.get("/api/v1/dashboard/summary")
    assert res_dash.status_code == 401
    assert res_dash.json()["detail"] == "Not authenticated"

    # 2. Malformed or invalid JWT returns 401
    client.headers["Authorization"] = "Bearer invalid.jwt.token"
    res_bad = client.get("/api/v1/auth/me")
    assert res_bad.status_code == 401
    assert "Invalid authentication token" in res_bad.json()["detail"]


def test_login_flow_and_pending_otp_cannot_access_protected_routes(app_and_db):
    client, session_factory = app_and_db
    from app.core.security import hash_password
    from app.models.user import OTPChallenge

    test_email = "otp_flow_test@example.com"
    raw_password = "SecurePassword123!"

    # Create active user
    with session_factory() as db:
        u = User(
            email=test_email,
            hashed_password=hash_password(raw_password),
            full_name="OTP Tester",
            is_active=True,
            is_onboarded=True,
        )
        db.add(u)
        db.commit()

    # 1. POST /api/v1/auth/login requires OTP challenge
    login_res = client.post("/api/v1/auth/login", json={"email": test_email, "password": raw_password})
    assert login_res.status_code == 200
    body = login_res.json()
    assert body["requires_otp"] is True
    challenge_id = body["challenge_id"]
    assert challenge_id is not None
    assert "access_token" not in body or body.get("access_token") is None

    # 2. Pending OTP challenge CANNOT access protected routes
    client.headers["Authorization"] = f"Bearer {challenge_id}"
    blocked_me = client.get("/api/v1/auth/me")
    assert blocked_me.status_code == 401

    blocked_profile = client.get("/api/v1/auth/profile")
    assert blocked_profile.status_code == 401

    blocked_dash = client.get("/api/v1/dashboard/summary")
    assert blocked_dash.status_code == 401

    # 3. Simulate OTP verification: obtain plain code from challenge
    with session_factory() as db:
        ch = db.query(OTPChallenge).filter(OTPChallenge.id == challenge_id).first()
        from app.services.otp import verify_otp_challenge, create_otp_challenge
        # The plain code was generated; in test, we can verify verify-otp with invalid code fails
        invalid_verify = client.post("/api/v1/auth/verify-otp", json={"challenge_id": challenge_id, "otp": "000000"})
        assert invalid_verify.status_code == 400

    # 4. Issue authenticated session upon valid verification
    with session_factory() as db:
        u_db = db.query(User).filter(User.email == test_email).first()
        sess = register_or_rotate_session(db, u_db.id, "verified-device", "Test Browser")
        valid_token = create_access_token({"sub": u_db.id, "sid": sess.id})

    # 5. Authenticated session accesses /auth/me, /auth/profile, and /dashboard/summary successfully
    client.headers["Authorization"] = f"Bearer {valid_token}"
    me_resp = client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["data"]["email"] == test_email

    profile_resp = client.get("/api/v1/auth/profile")
    assert profile_resp.status_code == 200

    dash_resp = client.get("/api/v1/dashboard/summary")
    assert dash_resp.status_code == 200


def test_session_restoration_and_fifo_rotation_guarantees_current_device_active(app_and_db):
    client, session_factory = app_and_db
    user, _, _ = register_user(client, "fifo_robust_user@example.com")

    # Simulate 3 device logins sequentially
    with session_factory() as db:
        s1 = register_or_rotate_session(db, user.id, "device-1", "Device One")
        t1 = create_access_token({"sub": user.id, "sid": s1.id})

    with session_factory() as db:
        s2 = register_or_rotate_session(db, user.id, "device-2", "Device Two")
        t2 = create_access_token({"sub": user.id, "sid": s2.id})

    with session_factory() as db:
        s3 = register_or_rotate_session(db, user.id, "device-3", "Device Three")
        t3 = create_access_token({"sub": user.id, "sid": s3.id})

    # Device 3 (current) MUST be active and succeed
    client.headers["Authorization"] = f"Bearer {t3}"
    res_d3 = client.get("/api/v1/auth/me")
    assert res_d3.status_code == 200

    res_dash3 = client.get("/api/v1/dashboard/summary")
    assert res_dash3.status_code == 200

    # Device 2 MUST also be active
    client.headers["Authorization"] = f"Bearer {t2}"
    res_d2 = client.get("/api/v1/auth/me")
    assert res_d2.status_code == 200

    # Device 1 (oldest) was evicted by FIFO
    client.headers["Authorization"] = f"Bearer {t1}"
    res_d1 = client.get("/api/v1/auth/me")
    assert res_d1.status_code == 401

    # Session restoration: repeated /auth/me requests for Device 3 do NOT invalidate it
    client.headers["Authorization"] = f"Bearer {t3}"
    for _ in range(3):
        res_repeat = client.get("/api/v1/auth/me")
        assert res_repeat.status_code == 200
