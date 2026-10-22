import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.ai.config import AISettings, get_ai_settings
from app.models.user import OTPChallenge, User

logger = logging.getLogger(__name__)


class OTPVerificationError(Exception):
    """Raised when OTP validation fails."""

    def __init__(self, message: str, code: str = "invalid_otp", attempts_remaining: int | None = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.attempts_remaining = attempts_remaining


def generate_secure_otp(length: int = 6) -> str:
    """Generate a cryptographically random numeric string."""
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def generate_salt() -> str:
    """Generate a random cryptographic salt."""
    return secrets.token_hex(16)


def hash_otp(otp: str, salt: str) -> str:
    """Hash an OTP code with a salt using SHA-256."""
    return hashlib.sha256(f"{salt}:{otp}".encode("utf-8")).hexdigest()


def verify_otp_hash(otp: str, salt: str, expected_hash: str) -> bool:
    """Constant-time comparison of an OTP candidate against its expected hash."""
    candidate_hash = hash_otp(otp.strip(), salt)
    return hmac.compare_digest(candidate_hash, expected_hash)


def mask_email(email: str) -> str:
    """Mask email for display, e.g. 'john.doe@example.com' -> 'j***e@example.com'."""
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "***"
    else:
        masked_local = local[0] + "***" + local[-1]
    return f"{masked_local}@{domain}"


def create_otp_challenge(
    db: Session,
    user: User,
    purpose: str = "login",
    device_info: dict[str, Any] | None = None,
    settings: AISettings | None = None,
) -> tuple[OTPChallenge, str]:
    """Create a new OTP challenge, invalidate superseded ones, and return (challenge, plain_otp)."""
    cfg = settings or get_ai_settings()
    expire_minutes = getattr(cfg, "otp_expire_minutes", 5)
    cooldown_seconds = getattr(cfg, "otp_resend_cooldown_seconds", 60)
    max_attempts = getattr(cfg, "otp_max_attempts", 5)

    now = datetime.now(timezone.utc)

    # Invalidate previous unverified challenges for this user/purpose
    superseded = (
        db.query(OTPChallenge)
        .filter(
            OTPChallenge.user_id == user.id,
            OTPChallenge.purpose == purpose,
            OTPChallenge.is_used.is_(False),
        )
        .all()
    )
    for old_challenge in superseded:
        old_challenge.is_used = True

    plain_otp = generate_secure_otp(6)
    salt = generate_salt()
    otp_hashed = hash_otp(plain_otp, salt)

    d_info = device_info or {}
    challenge = OTPChallenge(
        user_id=user.id,
        email=user.email.lower(),
        otp_hash=otp_hashed,
        salt=salt,
        purpose=purpose,
        attempts=0,
        max_attempts=max_attempts,
        is_used=False,
        expires_at=now + timedelta(minutes=expire_minutes),
        resend_available_at=now + timedelta(seconds=cooldown_seconds),
        device_id=d_info.get("device_id"),
        device_name=d_info.get("device_name"),
        device_type=d_info.get("device_type"),
        ip_address=d_info.get("ip_address"),
    )

    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    return challenge, plain_otp


def _ensure_utc(dt: datetime | None) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def verify_otp_challenge(
    db: Session,
    challenge_id: str,
    otp_code: str,
    expected_purpose: str | list[str] | tuple[str, ...] | None = None,
) -> OTPChallenge:
    """Verify an OTP code against a challenge.
    Enforces expiry, max attempts, single-use, purpose binding, and constant-time hash check.
    """
    challenge = db.query(OTPChallenge).filter(OTPChallenge.id == challenge_id).first()
    if not challenge or challenge.is_used:
        raise OTPVerificationError(
            "This verification request is invalid or has already been completed.",
            code="challenge_invalid",
        )

    if expected_purpose:
        allowed = (expected_purpose,) if isinstance(expected_purpose, str) else tuple(expected_purpose)
        if challenge.purpose not in allowed:
            raise OTPVerificationError(
                "This verification request is invalid or intended for a different purpose.",
                code="purpose_mismatch",
            )

    now = datetime.now(timezone.utc)
    if now > _ensure_utc(challenge.expires_at):
        challenge.is_used = True
        db.commit()
        raise OTPVerificationError(
            "This verification code has expired. Please request a new code.",
            code="code_expired",
        )

    if challenge.attempts >= challenge.max_attempts:
        challenge.is_used = True
        db.commit()
        raise OTPVerificationError(
            "Maximum verification attempts exceeded. Please request a new code.",
            code="max_attempts_exceeded",
        )

    is_valid = verify_otp_hash(otp_code, challenge.salt, challenge.otp_hash)
    if not is_valid:
        challenge.attempts += 1
        remaining = max(0, challenge.max_attempts - challenge.attempts)
        if remaining == 0:
            challenge.is_used = True
        db.commit()
        if remaining == 0:
            raise OTPVerificationError(
                "Maximum verification attempts exceeded. Please request a new code.",
                code="max_attempts_exceeded",
                attempts_remaining=0,
            )
        raise OTPVerificationError(
            f"Invalid verification code. {remaining} attempt{'s' if remaining != 1 else ''} remaining.",
            code="incorrect_code",
            attempts_remaining=remaining,
        )

    # Success: mark used immediately
    challenge.is_used = True
    db.commit()
    db.refresh(challenge)
    return challenge


def resend_otp_challenge(
    db: Session,
    challenge_id: str,
    settings: AISettings | None = None,
) -> tuple[OTPChallenge, str]:
    """Resend a new OTP for an existing challenge, enforcing cooldown."""
    challenge = db.query(OTPChallenge).filter(OTPChallenge.id == challenge_id).first()
    if not challenge:
        raise OTPVerificationError("Challenge not found.", code="challenge_not_found")

    now = datetime.now(timezone.utc)
    resend_at = _ensure_utc(challenge.resend_available_at)
    if now < resend_at:
        wait_seconds = max(1, int((resend_at - now).total_seconds()))
        raise OTPVerificationError(
            f"Please wait {wait_seconds} second{'s' if wait_seconds != 1 else ''} before requesting another code.",
            code="resend_cooldown",
        )

    user = db.query(User).filter(User.id == challenge.user_id).first()
    if not user or not user.is_active:
        raise OTPVerificationError("Account not found or inactive.", code="user_inactive")

    device_info = {
        "device_id": challenge.device_id,
        "device_name": challenge.device_name,
        "device_type": challenge.device_type,
        "ip_address": challenge.ip_address,
    }

    # create_otp_challenge automatically invalidates the old challenge
    return create_otp_challenge(
        db,
        user=user,
        purpose=challenge.purpose,
        device_info=device_info,
        settings=settings,
    )
