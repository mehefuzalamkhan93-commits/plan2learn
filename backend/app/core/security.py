import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

import jwt
from fastapi import Request
from passlib.context import CryptContext

from app.ai.config import get_ai_settings
from app.models.user import User, UserSession
from sqlalchemy.orm import joinedload

MAX_ACTIVE_DEVICES = 2


def get_secret_key() -> str:
    key = get_ai_settings().jwt_secret_key
    if not key:
        if get_ai_settings().app_env.lower() != "development":
            raise RuntimeError("JWT_SECRET_KEY must be configured outside development.")
        return "plan2learn_dev_stable_jwt_key_2026_xyz"
    return key


ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, get_secret_key(), algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


def extract_device_info(request: Request) -> dict[str, Any]:
    """Extracts device metadata from request headers with intelligent heuristics."""
    device_id = request.headers.get("x-device-id")
    device_name = request.headers.get("x-device-name")
    device_type = request.headers.get("x-device-type")
    user_agent = request.headers.get("user-agent", "")

    if not device_type:
        ua_lower = user_agent.lower()
        if "ipad" in ua_lower or "tablet" in ua_lower:
            device_type = "tablet"
        elif "mobile" in ua_lower or "android" in ua_lower or "iphone" in ua_lower:
            device_type = "mobile"
        else:
            device_type = "desktop"

    if not device_name:
        ua_lower = user_agent.lower()
        browser = "Browser"
        if "edg" in ua_lower:
            browser = "Edge"
        elif "brave" in ua_lower:
            browser = "Brave"
        elif "chrome" in ua_lower:
            browser = "Chrome"
        elif "safari" in ua_lower and "chrome" not in ua_lower:
            browser = "Safari"
        elif "firefox" in ua_lower:
            browser = "Firefox"

        os_name = "Device"
        if "windows" in ua_lower:
            os_name = "Windows PC"
        elif "macintosh" in ua_lower or "mac os" in ua_lower:
            os_name = "Mac"
        elif "iphone" in ua_lower:
            os_name = "iPhone"
        elif "ipad" in ua_lower:
            os_name = "iPad"
        elif "android" in ua_lower:
            os_name = "Android"
        elif "linux" in ua_lower:
            os_name = "Linux"

        device_name = f"{browser} on {os_name}"

    client_ip = request.client.host if request.client else None

    if not device_id:
        fallback_seed = f"{user_agent}:{client_ip or 'local'}"
        device_id = hashlib.sha256(fallback_seed.encode()).hexdigest()[:24]

    return {
        "device_id": device_id,
        "device_name": device_name,
        "device_type": device_type,
        "ip_address": client_ip,
    }


def register_or_rotate_session(
    db,
    user_id: str,
    device_id: str,
    device_name: str,
    device_type: str = "desktop",
    ip_address: str | None = None,
) -> UserSession:
    """Registers an active session for the device while enforcing maximum 2 active
    devices. If a 3rd device attempts login, the oldest active device session is
    evicted (FIFO), maintaining exactly the 2 most recent devices in sync.
    """
    now = datetime.now(timezone.utc)

    # 1. Look up existing session for this specific device
    session = (
        db.query(UserSession)
        .filter(UserSession.user_id == user_id, UserSession.device_id == device_id)
        .first()
    )

    if session:
        session.device_name = device_name
        session.device_type = device_type
        if ip_address:
            session.ip_address = ip_address
        session.is_active = True
        session.last_active_at = now
    else:
        session = UserSession(
            user_id=user_id,
            device_id=device_id,
            device_name=device_name,
            device_type=device_type,
            ip_address=ip_address,
            is_active=True,
            last_active_at=now,
            created_at=now,
        )
        db.add(session)

    session.is_active = True
    session.last_active_at = now
    db.flush()

    # 2. Enforce FIFO limit: Keep max MAX_ACTIVE_DEVICES active sessions for this user.
    # The session currently being registered/rotated MUST remain active.
    other_active = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == user_id,
            UserSession.is_active.is_(True),
            UserSession.id != session.id,
        )
        .order_by(UserSession.last_active_at.asc())
        .all()
    )

    max_others = max(0, MAX_ACTIVE_DEVICES - 1)
    if len(other_active) > max_others:
        excess_count = len(other_active) - max_others
        for old_session in other_active[:excess_count]:
            old_session.is_active = False

    db.commit()
    db.refresh(session)
    return session


def get_current_user_from_token(token: str, db) -> User | None:
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    user_id = payload["sub"]
    user = (
        db.query(User)
        .options(joinedload(User.profile))
        .filter(User.id == user_id, User.is_active.is_(True))
        .first()
    )
    if not user:
        return None

    # Enforce multi-device session validity
    sid = payload.get("sid")
    if sid:
        session = (
            db.query(UserSession)
            .filter(
                UserSession.id == sid,
                UserSession.user_id == user_id,
            )
            .first()
        )
        # If session was terminated because revoked or a 3rd device logged in
        if not session or not session.is_active:
            return None

        now_utc = datetime.now(timezone.utc)
        cutoff = now_utc - timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
        last_active = session.last_active_at
        if last_active and isinstance(last_active, str):
            try:
                last_active = datetime.fromisoformat(last_active)
            except Exception:
                last_active = None
        if last_active and last_active.tzinfo is None:
            last_active = last_active.replace(tzinfo=timezone.utc)
        if last_active and last_active < cutoff:
            session.is_active = False
            try:
                db.commit()
            except Exception:
                db.rollback()
            return None

        # Touch last_active_at periodically (e.g. at most once every 5 minutes)
        # to prevent slow synchronous remote DB write locks on every GET request
        should_update = False
        if not last_active:
            should_update = True
        elif (now_utc - last_active).total_seconds() > 300:
            should_update = True

        if should_update:
            session.last_active_at = now_utc
            try:
                db.commit()
            except Exception:
                db.rollback()

    return user
