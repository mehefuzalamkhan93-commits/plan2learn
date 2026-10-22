from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.ai.config import get_ai_settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    get_current_user_from_token,
    hash_password,
    verify_password,
)
from app.models.user import StudentProfile, User
from app.schemas.auth import (
    AuthData,
    AuthResponse,
    FullProfileData,
    FullProfileResponse,
    LoginRequest,
    ProfileUpdateRequest,
    SignupRequest,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def get_current_user(
    request: Request,
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = access_token
    if not token and "Authorization" in request.headers:
        auth_header = request.headers["Authorization"]
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

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
def signup(
    payload: SignupRequest,
    response: Response,
    db: Session = Depends(get_db),
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

    token = create_access_token(data={"sub": user.id})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=get_ai_settings().app_env.lower() != "development",
        max_age=7 * 24 * 3600,
    )

    user_out = UserOut.model_validate(user)
    return AuthResponse(
        success=True,
        data=AuthData(user=user_out, access_token=token),
        message="Account created successfully.",
    )


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(data={"sub": user.id})
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=get_ai_settings().app_env.lower() != "development",
        max_age=7 * 24 * 3600,
    )

    user_out = UserOut.model_validate(user)
    return AuthResponse(
        success=True,
        data=AuthData(user=user_out, access_token=token),
        message="Login successful.",
    )


@router.post("/logout", response_model=AuthResponse)
def logout(response: Response) -> AuthResponse:
    response.delete_cookie(key="access_token")
    return AuthResponse(success=True, data=None, message="Logged out successfully.")


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
