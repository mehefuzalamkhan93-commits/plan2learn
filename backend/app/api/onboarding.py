from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.user import StudentProfile, User
from app.schemas.onboarding import OnboardingRequest, OnboardingResponse, StudentProfileOut

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("", response_model=OnboardingResponse)
def save_baseline_profile(
    payload: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OnboardingResponse:
    profile = current_user.profile
    if profile is None:
        profile = StudentProfile(
            user_id=current_user.id,
            education_level=payload.education_level.strip(),
            board_curriculum=payload.board_curriculum.strip(),
            grade_class=payload.grade_class.strip(),
            target_subjects=[subject.strip() for subject in payload.target_subjects],
        )
        db.add(profile)
    else:
        profile.education_level = payload.education_level.strip()
        profile.board_curriculum = payload.board_curriculum.strip()
        profile.grade_class = payload.grade_class.strip()
        profile.target_subjects = [subject.strip() for subject in payload.target_subjects]

    current_user.is_onboarded = False
    db.commit()
    db.refresh(profile)
    return OnboardingResponse(
        data={"profile": StudentProfileOut.model_validate(profile).model_dump(), "next_route": "/ai"},
        message="Baseline student profile saved.",
    )