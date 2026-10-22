import pytest
from starlette.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import create_app
from app.core.database import Base, get_db
from app.core.security import MAX_ACTIVE_DEVICES
from app.models.user import User, UserSession
from app.ai.config import AISettings, get_ai_settings


@pytest.fixture
def sync_app():
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
        jwt_secret_key="test_jwt_secret_key_sync_devices",
    )
    app = create_app(settings)
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_ai_settings] = lambda: settings
    client = TestClient(app)
    client.session_factory = TestingSessionLocal
    return client


def test_max_two_devices_fifo_eviction(sync_app):
    # 1. Sign up user on Device A (e.g. PC)
    headers_device_a = {
        "x-device-id": "pc-device-1234",
        "x-device-name": "Chrome on Windows",
        "x-device-type": "desktop",
    }
    signup_resp = sync_app.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Multi Device Tester",
            "email": "multidevice@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
        headers=headers_device_a,
    )
    assert signup_resp.status_code == 201
    token_a = signup_resp.json()["data"]["access_token"]

    # Device A can access /sync/status
    resp_a = sync_app.get("/api/v1/sync/status", headers={"Authorization": f"Bearer {token_a}"})
    assert resp_a.status_code == 200
    assert resp_a.json()["active_devices_count"] == 1

    # 2. Login on Device B (e.g. Mobile Phone)
    headers_device_b = {
        "x-device-id": "phone-device-5678",
        "x-device-name": "Safari on iPhone",
        "x-device-type": "mobile",
    }
    login_b = sync_app.post(
        "/api/v1/auth/login",
        json={
            "email": "multidevice@example.com",
            "password": "Password123!",
        },
        headers=headers_device_b,
    )
    assert login_b.status_code == 200
    token_b = login_b.json()["data"]["access_token"]

    # Both Device A and Device B are valid (count = 2)
    resp_b = sync_app.get("/api/v1/sync/status", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_b.status_code == 200
    assert resp_b.json()["active_devices_count"] == 2

    devices_list_b = sync_app.get("/api/v1/auth/devices", headers={"Authorization": f"Bearer {token_b}"})
    assert devices_list_b.status_code == 200
    assert len(devices_list_b.json()["devices"]) == 2

    # 3. Login on Device C (e.g. Tablet) -> Should evict Device A (FIFO oldest)
    headers_device_c = {
        "x-device-id": "tablet-device-9999",
        "x-device-name": "Chrome on iPad",
        "x-device-type": "tablet",
    }
    login_c = sync_app.post(
        "/api/v1/auth/login",
        json={
            "email": "multidevice@example.com",
            "password": "Password123!",
        },
        headers=headers_device_c,
    )
    assert login_c.status_code == 200
    token_c = login_c.json()["data"]["access_token"]

    # Device C is active (count = 2)
    resp_c = sync_app.get("/api/v1/sync/status", headers={"Authorization": f"Bearer {token_c}"})
    assert resp_c.status_code == 200
    assert resp_c.json()["active_devices_count"] == 2

    # Device B is still active
    resp_b_after = sync_app.get("/api/v1/sync/status", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_b_after.status_code == 200

    # Device A was evicted and receives 401 Unauthorized!
    resp_a_after = sync_app.get("/api/v1/sync/status", headers={"Authorization": f"Bearer {token_a}"})
    assert resp_a_after.status_code == 401


def test_device_manual_revocation(sync_app):
    headers = {
        "x-device-id": "pc-revoke-test",
        "x-device-name": "Firefox on Linux",
        "x-device-type": "desktop",
    }
    signup_resp = sync_app.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Revoke Tester",
            "email": "revoke@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
        headers=headers,
    )
    token = signup_resp.json()["data"]["access_token"]

    devices_resp = sync_app.get("/api/v1/auth/devices", headers={"Authorization": f"Bearer {token}"})
    assert devices_resp.status_code == 200
    session_id = devices_resp.json()["devices"][0]["id"]

    # Revoke session
    revoke_resp = sync_app.post(
        f"/api/v1/auth/devices/{session_id}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert revoke_resp.status_code == 200

    # Token is now revoked
    check_resp = sync_app.get("/api/v1/sync/status", headers={"Authorization": f"Bearer {token}"})
    assert check_resp.status_code == 401
