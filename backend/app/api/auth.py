from typing import Any
import logging
import secrets
import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.ai.config import AISettings, get_ai_settings
from app.core.security import (
    MAX_ACTIVE_DEVICES,
    create_access_token,
    decode_access_token,
    extract_device_info,
    get_current_user_from_token,
    hash_password,
    register_or_rotate_session,
    verify_password,
)
from app.models.user import OTPChallenge, StudentProfile, User, UserSession
from app.schemas.auth import (
    AuthData,
    AuthResponse,
    DeviceSessionOut,
    DevicesResponse,
    FullProfileData,
    FullProfileResponse,
    GoogleAuthRequest,
    LoginRequest,
    OTPChallengeData,
    ProfileUpdateRequest,
    ResendOTPRequest,
    SignupRequest,
    UserOut,
    VerifyOTPRequest,
)
from app.services.email import EmailDeliveryError, send_otp_email
from app.services.otp import (
    OTPVerificationError,
    create_otp_challenge,
    mask_email,
    resend_otp_challenge,
    verify_otp_challenge,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def get_current_user(
    request: Request,
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
    elif request.query_params.get("token"):
        token = request.query_params.get("token", "").strip()
    else:
        token = access_token

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    user = get_current_user_from_token(token, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token or inactive user",
        )
    if user.profile is None:
        default_profile = StudentProfile(
            user_id=user.id,
            education_level="High School",
            board_curriculum="General",
            grade_class="Grade 12",
            target_subjects=["Physics", "Mathematics", "Chemistry"],
            weak_topics=[],
            strong_topics=[],
            daily_time_minutes=180,
            score_goal=85,
        )
        db.add(default_profile)
        db.commit()
        db.refresh(user)
    return user


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: AISettings = Depends(get_ai_settings),
) -> AuthResponse:
    if payload.password != payload.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match",
        )

    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create an account with the provided details.",
        )

    hashed = hash_password(payload.password)
    user = User(
        email=payload.email.lower(),
        hashed_password=hashed,
        full_name=payload.full_name,
        is_active=True,
        is_onboarded=False,
    )
    db.add(user)
    db.flush()

    default_profile = StudentProfile(
        user_id=user.id,
        education_level="High School",
        board_curriculum="General",
        grade_class="Grade 12",
        target_subjects=["Physics", "Mathematics", "Chemistry"],
        weak_topics=[],
        strong_topics=[],
        daily_time_minutes=180,
        score_goal=85,
    )
    db.add(default_profile)
    db.flush()

    device_info = extract_device_info(request)
    challenge, plain_otp = create_otp_challenge(
        db,
        user=user,
        purpose="signup",
        device_info=device_info,
        settings=settings,
    )

    try:
        await send_otp_email(
            to_email=user.email,
            otp_code=plain_otp,
            user_name=user.full_name,
            settings=settings,
        )
    except EmailDeliveryError as exc:
        db.rollback()
        logger.error("Failed to send signup OTP email to %s: %s", user.email, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to send verification email: {exc.message}",
        )

    db.commit()
    db.refresh(user)

    expires_in_seconds = settings.otp_expire_minutes * 60
    cooldown_seconds = settings.otp_resend_cooldown_seconds
    masked = mask_email(user.email)

    return AuthResponse(
        success=True,
        requires_otp=True,
        challenge_id=challenge.id,
        masked_email=masked,
        expires_in_seconds=expires_in_seconds,
        resend_cooldown_seconds=cooldown_seconds,
        data=OTPChallengeData(
            challenge_id=challenge.id,
            masked_email=masked,
            expires_in_seconds=expires_in_seconds,
            resend_cooldown_seconds=cooldown_seconds,
        ),
        message=f"Account created. A 6-digit verification code was sent to {masked}.",
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: AISettings = Depends(get_ai_settings),
) -> AuthResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Please contact support.",
        )

    device_info = extract_device_info(request)
    challenge, plain_otp = create_otp_challenge(
        db,
        user=user,
        purpose="login",
        device_info=device_info,
        settings=settings,
    )

    try:
        await send_otp_email(
            to_email=user.email,
            otp_code=plain_otp,
            user_name=user.full_name,
            settings=settings,
        )
    except EmailDeliveryError as exc:
        logger.error("Failed to send login OTP email to %s: %s", user.email, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to send verification email: {exc.message}",
        )

    expires_in_seconds = settings.otp_expire_minutes * 60
    cooldown_seconds = settings.otp_resend_cooldown_seconds
    masked = mask_email(user.email)

    return AuthResponse(
        success=True,
        requires_otp=True,
        challenge_id=challenge.id,
        masked_email=masked,
        expires_in_seconds=expires_in_seconds,
        resend_cooldown_seconds=cooldown_seconds,
        data=OTPChallengeData(
            challenge_id=challenge.id,
            masked_email=masked,
            expires_in_seconds=expires_in_seconds,
            resend_cooldown_seconds=cooldown_seconds,
        ),
        message=f"A 6-digit verification code was sent to {masked}.",
    )


@router.post("/verify-otp", response_model=AuthResponse)
def verify_otp(
    payload: VerifyOTPRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: AISettings = Depends(get_ai_settings),
) -> AuthResponse:
    try:
        challenge = verify_otp_challenge(db, payload.challenge_id, payload.otp)
    except OTPVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=exc.message,
        )

    user = db.query(User).filter(User.id == challenge.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive or not found.",
        )

    device_info = {
        "device_id": challenge.device_id or "unknown",
        "device_name": challenge.device_name or "Unknown Device",
        "device_type": challenge.device_type or "desktop",
        "ip_address": challenge.ip_address or (request.client.host if request.client else None),
    }

    session = register_or_rotate_session(db, user.id, **device_info)
    token = create_access_token(data={"sub": user.id, "sid": session.id})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="none" if settings.app_env.lower() != "development" else "lax",
        secure=settings.app_env.lower() != "development",
        max_age=7 * 24 * 3600,
    )

    user_out = UserOut.model_validate(user)
    return AuthResponse(
        success=True,
        data=AuthData(user=user_out, access_token=token),
        message="Verification successful. Welcome to Plan2Learn!",
    )


@router.post("/resend-otp", response_model=AuthResponse)
async def resend_otp(
    payload: ResendOTPRequest,
    db: Session = Depends(get_db),
    settings: AISettings = Depends(get_ai_settings),
) -> AuthResponse:
    try:
        new_challenge, plain_otp = resend_otp_challenge(db, payload.challenge_id, settings=settings)
    except OTPVerificationError as exc:
        status_code = (
            status.HTTP_429_TOO_MANY_REQUESTS
            if exc.code == "resend_cooldown"
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(
            status_code=status_code,
            detail=exc.message,
        )

    user = db.query(User).filter(User.id == new_challenge.user_id).first()
    try:
        await send_otp_email(
            to_email=new_challenge.email,
            otp_code=plain_otp,
            user_name=user.full_name if user else None,
            settings=settings,
        )
    except EmailDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to resend verification email: {exc.message}",
        )

    expires_in_seconds = settings.otp_expire_minutes * 60
    cooldown_seconds = settings.otp_resend_cooldown_seconds
    masked = mask_email(new_challenge.email)

    return AuthResponse(
        success=True,
        requires_otp=True,
        challenge_id=new_challenge.id,
        masked_email=masked,
        expires_in_seconds=expires_in_seconds,
        resend_cooldown_seconds=cooldown_seconds,
        data=OTPChallengeData(
            challenge_id=new_challenge.id,
            masked_email=masked,
            expires_in_seconds=expires_in_seconds,
            resend_cooldown_seconds=cooldown_seconds,
        ),
        message=f"A fresh 6-digit verification code was sent to {masked}.",
    )


async def verify_google_credential(credential: str, expected_client_id: str | None = None) -> dict:
    """Verifies a Google ID token with Google's tokeninfo API.
    Returns dict with email, name, sub, picture.
    """
    tokeninfo_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={credential}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(tokeninfo_url)
            if resp.status_code != 200:
                logger.warning("Google tokeninfo rejected token: %s", resp.text)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired Google authentication credential.",
                )
            data = resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to connect to Google tokeninfo: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to verify Google credential with Google authentication servers.",
        ) from exc

    token_aud = data.get("aud")
    if expected_client_id and token_aud != expected_client_id:
        logger.warning("Google token aud mismatch: token aud %s != expected %s", token_aud, expected_client_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google authentication token was issued for an unauthorized client ID.",
        )

    email = data.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account did not provide an email address.",
        )

    email_verified = str(data.get("email_verified", "")).lower() == "true"
    if not email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account email is not verified.",
        )

    return {
        "email": email.lower(),
        "name": data.get("name") or email.split("@")[0],
        "sub": data.get("sub"),
        "picture": data.get("picture"),
    }


@router.get("/google/config")
def google_auth_config(settings: AISettings = Depends(get_ai_settings)) -> dict[str, str | None]:
    return {"client_id": settings.google_drive_client_id}


@router.post("/google", response_model=AuthResponse)
async def google_auth(
    payload: GoogleAuthRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: AISettings = Depends(get_ai_settings),
) -> AuthResponse:
    google_user = await verify_google_credential(
        payload.credential,
        expected_client_id=settings.google_drive_client_id,
    )
    email = google_user["email"]
    name = google_user["name"]

    user = db.query(User).filter(User.email == email).first()
    is_new_user = False

    if not user:
        is_new_user = True
        dummy_password = secrets.token_urlsafe(32)
        hashed = hash_password(dummy_password)
        user = User(
            email=email,
            hashed_password=hashed,
            full_name=name,
            is_active=True,
            is_onboarded=False,
        )
        db.add(user)
        db.flush()

        default_profile = StudentProfile(
            user_id=user.id,
            education_level="High School",
            board_curriculum="General",
            grade_class="Grade 12",
            target_subjects=["Physics", "Mathematics", "Chemistry"],
            weak_topics=[],
            strong_topics=[],
            daily_time_minutes=180,
            score_goal=85,
        )
        db.add(default_profile)
        db.commit()
        db.refresh(user)
    else:
        if not user.is_active:
            user.is_active = True
            db.commit()
            db.refresh(user)
        if user.profile is None:
            default_profile = StudentProfile(
                user_id=user.id,
                education_level="High School",
                board_curriculum="General",
                grade_class="Grade 12",
                target_subjects=["Physics", "Mathematics", "Chemistry"],
                weak_topics=[],
                strong_topics=[],
                daily_time_minutes=180,
                score_goal=85,
            )
            db.add(default_profile)
            db.commit()
            db.refresh(user)

    device_info = extract_device_info(request)
    session = register_or_rotate_session(db, user.id, **device_info)
    token = create_access_token(data={"sub": user.id, "sid": session.id})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="none" if settings.app_env.lower() != "development" else "lax",
        secure=settings.app_env.lower() != "development",
        max_age=7 * 24 * 3600,
    )

    user_out = UserOut.model_validate(user)
    return AuthResponse(
        success=True,
        data=AuthData(user=user_out, access_token=token),
        message="Google account created successfully." if is_new_user else "Google sign-in successful.",
    )


@router.post("/logout", response_model=AuthResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
    if token:
        payload = decode_access_token(token)
        if payload and "sid" in payload:
            session = db.query(UserSession).filter(UserSession.id == payload["sid"]).first()
            if session:
                session.is_active = False
                db.commit()

    response.delete_cookie(
        key="access_token",
        samesite="none" if get_ai_settings().app_env.lower() != "development" else "lax",
        secure=get_ai_settings().app_env.lower() != "development",
    )
    return AuthResponse(success=True, data=None, message="Logged out successfully.")


@router.get("/devices", response_model=DevicesResponse)
def get_user_devices(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DevicesResponse:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()

    current_sid = None
    if token:
        payload = decode_access_token(token)
        if payload:
            current_sid = payload.get("sid")

    sessions = (
        db.query(UserSession)
        .filter(UserSession.user_id == current_user.id, UserSession.is_active.is_(True))
        .order_by(UserSession.last_active_at.desc())
        .limit(MAX_ACTIVE_DEVICES)
        .all()
    )

    out = []
    for s in sessions:
        out.append(
            DeviceSessionOut(
                id=s.id,
                device_id=s.device_id,
                device_name=s.device_name,
                device_type=s.device_type,
                is_current=(s.id == current_sid),
                last_active_at=s.last_active_at.isoformat(),
                created_at=s.created_at.isoformat(),
            )
        )
    return DevicesResponse(success=True, max_devices=MAX_ACTIVE_DEVICES, devices=out)


@router.post("/devices/{session_id}/revoke")
def revoke_device_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    session = (
        db.query(UserSession)
        .filter(UserSession.id == session_id, UserSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Device session not found.")

    session.is_active = False
    db.commit()
    return {"success": True, "message": f"Device {session.device_name} has been disconnected."}



@router.get("/me", response_model=AuthResponse)
def me(current_user: User = Depends(get_current_user)) -> AuthResponse:
    user_out = UserOut.model_validate(current_user)
    return AuthResponse(success=True, data=user_out, message="Current user context")


@router.get("/profile", response_model=FullProfileResponse)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FullProfileResponse:
    profile = current_user.profile
    return FullProfileResponse(
        success=True,
        data=FullProfileData(
            id=current_user.id,
            email=current_user.email,
            full_name=current_user.full_name,
            is_onboarded=current_user.is_onboarded,
            has_student_profile=current_user.has_student_profile,
            education_level=profile.education_level if profile else "",
            board_curriculum=profile.board_curriculum if profile else "",
            grade_class=profile.grade_class if profile else "",
            target_subjects=list(profile.target_subjects or []) if profile else [],
            weak_topics=list(profile.weak_topics or []) if profile else [],
            strong_topics=list(profile.strong_topics or []) if profile else [],
            daily_time_minutes=profile.daily_time_minutes if profile else 180,
            exam_date=profile.exam_date if profile else None,
            score_goal=profile.score_goal if profile else 85,
            study_routine=profile.study_routine if profile else None,
            goals=list(profile.goals or []) if profile else [],
            preferences=dict(profile.preferences or {}) if profile else {},
        ),
        message="Profile retrieved successfully.",
    )


@router.put("/profile", response_model=FullProfileResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FullProfileResponse:
    if payload.full_name is not None and payload.full_name.strip():
        current_user.full_name = payload.full_name.strip()

    profile = current_user.profile
    if profile is None:
        profile = StudentProfile(
            user_id=current_user.id,
            education_level=payload.education_level.strip() if payload.education_level else "High School",
            board_curriculum=payload.board_curriculum.strip() if payload.board_curriculum else "General",
            grade_class=payload.grade_class.strip() if payload.grade_class else "Class 12",
            target_subjects=[s.strip() for s in payload.target_subjects] if payload.target_subjects else ["General"],
        )
        db.add(profile)
        db.flush()

    if payload.education_level is not None:
        profile.education_level = payload.education_level.strip()
    if payload.board_curriculum is not None:
        profile.board_curriculum = payload.board_curriculum.strip()
    if payload.grade_class is not None:
        profile.grade_class = payload.grade_class.strip()
    if payload.target_subjects is not None:
        profile.target_subjects = [s.strip() for s in payload.target_subjects if s.strip()]
    if payload.weak_topics is not None:
        profile.weak_topics = [w.strip() for w in payload.weak_topics if w.strip()]
    if payload.strong_topics is not None:
        profile.strong_topics = [s.strip() for s in payload.strong_topics if s.strip()]
    if payload.daily_time_minutes is not None:
        profile.daily_time_minutes = max(30, min(1440, payload.daily_time_minutes))
    if payload.exam_date is not None:
        profile.exam_date = payload.exam_date.strip() if payload.exam_date else None
    if payload.score_goal is not None:
        profile.score_goal = max(1, min(100, payload.score_goal))
    if payload.study_routine is not None:
        profile.study_routine = payload.study_routine.strip() if payload.study_routine else None
    if payload.goals is not None:
        profile.goals = [g.strip() for g in payload.goals if g.strip()]
    if payload.preferences is not None:
        profile.preferences = payload.preferences

    db.commit()
    db.refresh(current_user)
    db.refresh(profile)

    return FullProfileResponse(
        success=True,
        data=FullProfileData(
            id=current_user.id,
            email=current_user.email,
            full_name=current_user.full_name,
            is_onboarded=current_user.is_onboarded,
            has_student_profile=current_user.has_student_profile,
            education_level=profile.education_level,
            board_curriculum=profile.board_curriculum,
            grade_class=profile.grade_class,
            target_subjects=list(profile.target_subjects or []),
            weak_topics=list(profile.weak_topics or []),
            strong_topics=list(profile.strong_topics or []),
            daily_time_minutes=profile.daily_time_minutes,
            exam_date=profile.exam_date,
            score_goal=profile.score_goal,
            study_routine=profile.study_routine,
            goals=list(profile.goals or []),
            preferences=dict(profile.preferences or {}),
        ),
        message="Profile updated successfully.",
    )
