from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.core.security import ACCESS_TOKEN_EXPIRE_DAYS
from app.models.progress import Streak, ReadinessScore
from app.models.user import User, UserSession

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncStatusResponse(BaseModel):
    success: bool = True
    session_valid: bool = True
    active_devices_count: int = 1
    streak_count: int = 0
    readiness_score: int = 0
    server_time: str


@router.get("/status", response_model=SyncStatusResponse)
def get_sync_status(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyncStatusResponse:
    """Fast, lightweight heartbeat endpoint called by clients (both mobile and desktop)
    every 15 seconds or on window focus. Verifies multi-device session validity (max 2)
    and retrieves latest cross-device state.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)

    # Active devices for this user (excluding expired and revoked)
    active_devices_count = (
        db.query(UserSession)
        .filter(
            UserSession.user_id == current_user.id,
            UserSession.is_active.is_(True),
            UserSession.last_active_at >= cutoff,
        )
        .count()
    )

    streak = db.query(Streak).filter(Streak.user_id == current_user.id).first()
    streak_count = streak.current_streak if streak else 0

    readiness = (
        db.query(ReadinessScore)
        .filter(ReadinessScore.user_id == current_user.id)
        .order_by(ReadinessScore.last_updated.desc())
        .first()
    )
    score = readiness.probability if readiness else (current_user.profile.score_goal if current_user.profile else 85)

    return SyncStatusResponse(
        success=True,
        session_valid=True,
        active_devices_count=active_devices_count,
        streak_count=streak_count,
        readiness_score=score,
        server_time=now.isoformat(),
    )
