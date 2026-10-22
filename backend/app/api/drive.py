"""Google Drive integration endpoints (/api/v1/ai/drive/*).

Backend-managed OAuth 2.0 authorization-code flow:
- GET  /connect    → 302 to Google's consent screen (state-bound, CSRF-safe)
- GET  /callback   → the redirect_uri target registered in Google Cloud Console;
                     validates state, exchanges the code, binds the account
                     to the application user, then redirects to the frontend
- GET  /status     → configured / enabled / connected / picker_ready flags
- GET  /files      → metadata-only listing of the user's supported documents
- POST /import     → download/export + extraction into an existing notebook
- POST /picker     → browser Picker config (client_id, api_key, app_id)
- POST /picker/token → short-lived in-memory access token for the Picker
- POST /disconnect → revoke at Google and delete stored credentials

Errors during import are always explicit: the Source row is marked 'failed'
and the API responds 4xx — an import is never reported as successful when
content extraction failed.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status as http_status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.config import AISettings, get_ai_settings
from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.ai import AIConversation, ConversationSource
from app.models.notebook import Notebook, Source, SourceChunk
from app.models.user import User
from app.services import google_drive as gd
from app.services.document_extractor import detect_source_type, extract_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drive", tags=["ai-drive"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class DriveStatusResponse(BaseModel):
    configured: bool
    enabled: bool
    connected: bool
    message: str
    account_email: str | None = None
    scopes: list[str] = Field(default_factory=list)
    picker_ready: bool = False
    connect_url: str | None = None


class DriveImportRequest(BaseModel):
    file_id: str = Field(..., min_length=1)
    notebook_id: str | None = Field(default=None)
    conversation_id: str | None = Field(default=None)
    file_name: str | None = Field(default=None, description="Optional pre-fill; real name comes from Drive metadata.")


class DriveFileOut(BaseModel):
    id: str
    name: str
    mime_type: str
    size: int | None = None
    modified_time: str | None = None


class DriveFilesResponse(BaseModel):
    files: list[DriveFileOut]
    next_page_token: str | None = None


class PickerConfigResponse(BaseModel):
    client_id: str
    api_key: str
    app_id: str


class PickerTokenResponse(BaseModel):
    access_token: str
    expires_in: int
    client_id: str


def drive_settings_dep(request: Request) -> AISettings:
    """Resolve the Google Drive settings for the current app instance.

    create_app(settings) stores the settings on app.state, so tests can pass
    a fully-controlled configuration; production falls back to environment.
    """
    settings = getattr(request.app.state, "google_drive_settings", None)
    if settings is not None:
        return settings
    return get_ai_settings()


def _drive_error(exc: Exception) -> HTTPException:
    """Map service-layer errors to honest HTTP responses."""
    if isinstance(exc, gd.DriveNotConnectedError):
        return HTTPException(status_code=401, detail=str(exc))
    if isinstance(exc, gd.DriveReauthRequiredError):
        return HTTPException(status_code=401, detail=str(exc))
    if isinstance(exc, gd.DriveUnsupportedTypeError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, gd.DriveFileTooLargeError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, gd.GoogleAPIError):
        return HTTPException(status_code=502, detail=str(exc))
    logger.exception("Unexpected Google Drive error")
    return HTTPException(status_code=502, detail="Google Drive request failed unexpectedly.")


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

@router.get("/status", response_model=DriveStatusResponse)
async def drive_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: AISettings = Depends(drive_settings_dep),
) -> DriveStatusResponse:
    configured = gd.is_configured(settings)
    enabled = settings.google_drive_enabled

    if not enabled:
        message = (
            "Google Drive integration is disabled on this server. "
            "Set GOOGLE_DRIVE_ENABLED=true in the backend .env file to enable it."
        )
    elif not configured:
        message = (
            "Google Drive OAuth is not configured. Set GOOGLE_DRIVE_CLIENT_ID, "
            "GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REDIRECT_URI "
            "(the backend callback route /api/v1/ai/drive/callback) in the backend .env."
        )
    else:
        account = gd.get_account(db, current_user.id)
        if account is not None and account.status == "active":
            message = (
                f"Google Drive is connected as {account.google_email or 'your Google account'}."
            )
        elif account is not None and account.status == "needs_reauth":
            message = "Google Drive authorization expired. Please reconnect your account."
        else:
            message = "Google Drive is configured. Authorize your account to browse files."

    connected = False
    account_email: str | None = None
    if configured and enabled:
        account = gd.get_account(db, current_user.id)
        if account is not None and account.status == "active":
            connected = True
            account_email = account.google_email

    return DriveStatusResponse(
        configured=configured,
        enabled=enabled,
        connected=connected,
        message=message,
        account_email=account_email,
        scopes=list(gd.DRIVE_SCOPES),
        picker_ready=gd.is_picker_available(settings),
        connect_url="/api/v1/ai/drive/connect" if configured and enabled else None,
    )


# ---------------------------------------------------------------------------
# OAuth flow start
# ---------------------------------------------------------------------------

@router.get("/connect-url")
async def drive_connect_url(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: AISettings = Depends(drive_settings_dep),
) -> dict[str, str]:
    """Return Google consent URL in JSON for client-side navigation."""
    if not settings.google_drive_enabled:
        raise HTTPException(status_code=403, detail="Google Drive integration is disabled (GOOGLE_DRIVE_ENABLED).")
    if not gd.is_configured(settings):
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Drive OAuth is not configured on the server. Set GOOGLE_DRIVE_CLIENT_ID, "
                "GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REDIRECT_URI in the backend .env."
            ),
        )
    state = gd.create_oauth_state(db, current_user.id, settings)
    auth_url = gd.build_auth_url(settings, state)
    return {"url": auth_url}


@router.get("/connect")
async def drive_connect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: AISettings = Depends(drive_settings_dep),
) -> RedirectResponse:
    """Start the OAuth flow: create a single-use state bound to this user and
    redirect the browser to Google's consent screen."""
    if not settings.google_drive_enabled:
        raise HTTPException(status_code=403, detail="Google Drive integration is disabled (GOOGLE_DRIVE_ENABLED).")
    if not gd.is_configured(settings):
        raise HTTPException(
            status_code=503,
            detail=(
                "Google Drive OAuth is not configured on the server. Set GOOGLE_DRIVE_CLIENT_ID, "
                "GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REDIRECT_URI in the backend .env."
            ),
        )
    state = gd.create_oauth_state(db, current_user.id, settings)
    auth_url = gd.build_auth_url(settings, state)
    return RedirectResponse(auth_url, status_code=307)


# ---------------------------------------------------------------------------
# OAuth callback (the redirect_uri configured in Google Cloud Console)
# ---------------------------------------------------------------------------

@router.get("/callback")
async def drive_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: Session = Depends(get_db),
    settings: AISettings = Depends(drive_settings_dep),
) -> RedirectResponse:
    """Google redirects the browser here. Validates CSRF state, binds the
    exchanged tokens to the user who started the flow, then redirects to the
    frontend with a drive=connected|error marker."""
    from app.core.security import get_current_user_from_token

    session_user_id: str | None = None
    token = request.cookies.get("access_token")
    if token:
        user = get_current_user_from_token(token, db)
        if user is not None:
            session_user_id = user.id

    def _fail(reason: str) -> RedirectResponse:
        logger.warning("Drive OAuth callback failure: %s", reason)
        return RedirectResponse(gd.frontend_redirect_url(settings, "error", reason), status_code=307)

    if not settings.google_drive_enabled:
        return _fail("drive_disabled")
    if not gd.is_configured(settings):
        return _fail("not_configured")
    if error:
        return _fail(f"google_{error or 'consent'}")
    if not state or not code:
        return _fail("missing_parameters")

    bound_user_id = gd.consume_oauth_state(db, state, session_user_id)
    if bound_user_id is None:
        return _fail("invalid_state")

    try:
        tokens = await gd.exchange_code(settings, code)
    except gd.GoogleAPIError as exc:
        db.rollback()
        return _fail("token_exchange")

    google_email = await gd.fetch_google_email(tokens["access_token"])
    gd.upsert_account(db, settings, bound_user_id, tokens)
    if google_email:
        account = gd.get_account(db, bound_user_id)
        if account is not None:
            account.google_email = google_email
            db.commit()

    logger.info("Google Drive connected for user %s", bound_user_id)
    return RedirectResponse(gd.frontend_redirect_url(settings, "connected"), status_code=307)


# ---------------------------------------------------------------------------
# File listing / Picker / disconnect
# ---------------------------------------------------------------------------

@router.get("/files", response_model=DriveFilesResponse)
async def list_drive_files(
    page_size: int = Query(default=25, ge=1, le=100),
    page_token: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: AISettings = Depends(drive_settings_dep),
) -> DriveFilesResponse:
    if not settings.google_drive_enabled:
        raise HTTPException(status_code=403, detail="Google Drive integration is disabled (GOOGLE_DRIVE_ENABLED).")
    if not gd.is_configured(settings):
        raise HTTPException(status_code=503, detail="Google Drive OAuth is not configured on this server.")
    try:
        result = await gd.list_drive_files(db, settings, current_user.id, page_size, page_token)
    except Exception as exc:
        raise _drive_error(exc)
    return DriveFilesResponse(
        files=[
            DriveFileOut(
                id=f.id,
                name=f.name,
                mime_type=f.mime_type,
                size=f.size,
                modified_time=f.modified_time,
            )
            for f in result["files"]
        ],
        next_page_token=result.get("next_page_token"),
    )


@router.post("/picker", response_model=PickerConfigResponse)
async def drive_picker_config(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: AISettings = Depends(drive_settings_dep),
) -> PickerConfigResponse:
    """Browser Picker configuration (client_id + browser api_key + app_id)."""
    if not settings.google_drive_enabled:
        raise HTTPException(status_code=403, detail="Google Drive integration is disabled (GOOGLE_DRIVE_ENABLED).")
    try:
        config = gd.build_picker_config(settings)
    except Exception as exc:
        raise _drive_error(exc)
    return PickerConfigResponse(**config)


@router.post("/picker/token", response_model=PickerTokenResponse)
async def drive_picker_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: AISettings = Depends(drive_settings_dep),
) -> PickerTokenResponse:
    """Short-lived access token for the Google Picker session.

    Kept in browser memory only (never localStorage) — the standard pattern
    for the Picker. Refresh semantics remain server-side.
    """
    if not gd.is_picker_available(settings):
        raise HTTPException(status_code=400, detail="Google Picker is not configured on this server.")
    try:
        access_token = await gd.get_access_token(db, settings, current_user.id)
    except Exception as exc:
        raise _drive_error(exc)
    return PickerTokenResponse(
        access_token=access_token,
        expires_in=3600,
        client_id=settings.google_drive_client_id or "",
    )


@router.post("/disconnect")
async def drive_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: AISettings = Depends(drive_settings_dep),
) -> dict[str, Any]:
    deleted = await gd.disconnect_account(db, settings, current_user.id)
    if deleted:
        return {"success": True, "message": "Google Drive disconnected and authorization revoked."}
    return {"success": True, "message": "Google Drive was not connected."}


# ---------------------------------------------------------------------------
# Import into a notebook
# ---------------------------------------------------------------------------

@router.post("/import", status_code=http_status.HTTP_200_OK)
async def import_drive_file(
    payload: DriveImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: AISettings = Depends(drive_settings_dep),
) -> dict[str, Any]:
    """Download/export a supported Drive file and index it into a notebook.

    Mirrors the upload pipeline: ownership checks, duplicate detection,
    extraction through the existing extractor, explicit failures.
    """
    if not settings.google_drive_enabled:
        raise HTTPException(status_code=403, detail="Google Drive integration is disabled (GOOGLE_DRIVE_ENABLED).")
    if not gd.is_configured(settings):
        raise HTTPException(status_code=503, detail="Google Drive OAuth is not configured on this server.")

    conversation = None
    if payload.conversation_id:
        conversation = (
            db.query(AIConversation)
            .filter(AIConversation.id == payload.conversation_id, AIConversation.user_id == current_user.id)
            .first()
        )
    notebook_id = payload.notebook_id
    if not notebook_id and conversation and conversation.notebook_id:
        notebook_id = conversation.notebook_id
    if notebook_id:
        notebook = (
            db.query(Notebook)
            .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
            .first()
        )
        if not notebook:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Notebook not found.")
    else:
        notebook = (
            db.query(Notebook)
            .filter(Notebook.user_id == current_user.id)
            .order_by(Notebook.created_at.asc())
            .first()
        )
        if not notebook:
            notebook = Notebook(
                user_id=current_user.id,
                title="Personal Study Notebook",
                description="Default notebook for study notes and sources.",
            )
            db.add(notebook)
            db.flush()
        notebook_id = notebook.id

    try:
        meta = await gd.get_file_metadata(db, settings, current_user.id, payload.file_id)
        content, filename = await gd.fetch_file_content(db, settings, current_user.id, meta)
    except Exception as exc:
        raise _drive_error(exc)

    source_type = detect_source_type(filename)

    # Duplicate detection (same notebook + user + title, ready).
    existing = (
        db.query(Source)
        .filter(
            Source.notebook_id == notebook_id,
            Source.user_id == current_user.id,
            Source.title == filename,
            Source.status == "ready",
        )
        .first()
    )
    if existing:
        if conversation:
            existing_cs = (
                db.query(ConversationSource)
                .filter(
                    ConversationSource.conversation_id == conversation.id,
                    ConversationSource.source_id == existing.id,
                )
                .first()
            )
            if not existing_cs:
                db.add(ConversationSource(conversation_id=conversation.id, source_id=existing.id, is_selected=True))
                db.commit()
        return {
            "success": True,
            "source": {
                "id": existing.id,
                "notebook_id": existing.notebook_id,
                "title": existing.title,
                "source_type": existing.source_type,
                "origin": existing.origin,
                "file_size": existing.file_size,
                "page_count": existing.page_count,
                "status": existing.status,
                "is_selected": existing.is_selected,
                "meta_info": existing.meta_info,
                "created_at": existing.created_at.isoformat() if existing.created_at else "",
            },
            "message": f"Source '{filename}' already exists and is ready.",
            "duplicate": True,
        }

    if not content:
        raise HTTPException(status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Google Drive returned no content for this file.")

    source = Source(
        notebook_id=notebook_id,
        user_id=current_user.id,
        title=filename,
        source_type=source_type,
        origin="google_drive",
        file_size=len(content),
        file_path=filename,
        status="processing",
        meta_info={
            "original_filename": filename,
            "drive_file_id": meta.id,
            "drive_mime_type": meta.mime_type,
            "drive_modified_time": meta.modified_time,
        },
    )
    db.add(source)
    db.flush()

    if conversation:
        db.add(
            ConversationSource(
                conversation_id=conversation.id,
                source_id=source.id,
                is_selected=True,
            )
        )

    result = extract_text(filename, content)
    if not result.success:
        source.status = "failed"
        source.error_message = result.error or "No readable text could be extracted from the Google Drive document."
        db.commit()
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=source.error_message,
        )

    db.add_all(
        SourceChunk(
            source_id=source.id,
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            page_number=chunk.page_number,
            section_title=chunk.section_title,
        )
        for chunk in result.chunks
    )
    source.status = "ready"
    source.page_count = result.page_count
    meta_info = dict(source.meta_info or {})
    meta_info["chunk_count"] = len(result.chunks)
    source.meta_info = meta_info
    db.commit()
    db.refresh(source)

    return {
        "success": True,
        "source": {
            "id": source.id,
            "notebook_id": source.notebook_id,
            "title": source.title,
            "source_type": source.source_type,
            "origin": source.origin,
            "file_size": source.file_size,
            "page_count": source.page_count,
            "status": source.status,
            "is_selected": source.is_selected,
            "meta_info": source.meta_info,
            "created_at": source.created_at.isoformat() if source.created_at else "",
        },
        "message": f"Imported '{source.title}' from Google Drive ({len(result.chunks)} chunks indexed).",
        "chunks_indexed": len(result.chunks),
        "duplicate": False,
    }
