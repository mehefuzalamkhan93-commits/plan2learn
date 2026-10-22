"""Google Drive OAuth 2.0 + Drive API service.

Backend-managed authorization-code flow with:
- single-use, expiring, user-bound state tokens (CSRF protection)
- minimal scopes: drive.file + drive.metadata.readonly (no unrestricted access)
- encrypted token storage (Fernet, key derived from the app's JWT secret)
- automatic access-token refresh on expiry
- token revocation on disconnect
- metadata listing and (export | binary download) content fetching for import

All functions never log token material. Secrets stay on the backend — the
frontend only ever receives a short-lived Picker access token when the
Google Picker feature is explicitly enabled (standard Google Picker pattern,
kept in browser memory only, never persisted).
"""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.ai.config import AISettings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration constants
# ---------------------------------------------------------------------------

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"

# Minimum necessary scopes: files opened via the Google Picker (drive.file)
# plus metadata-only listing. Never request the unrestricted drive scope.
DRIVE_SCOPE_DRIVE_FILE = "https://www.googleapis.com/auth/drive.file"
DRIVE_SCOPE_METADATA_READONLY = "https://www.googleapis.com/auth/drive.metadata.readonly"
DRIVE_SCOPES = (DRIVE_SCOPE_DRIVE_FILE, DRIVE_SCOPE_METADATA_READONLY)
DRIVE_SCOPES_STRING = " ".join(DRIVE_SCOPES)

# Matches the document extractor's own upload limit.
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB

STATE_TTL_SECONDS = 600  # 10 minutes

# Well-known MIME types and their import handling.
GOOGLE_MIME = {
    "document": "application/vnd.google-apps.document",
    "spreadsheet": "application/vnd.google-apps.spreadsheet",
    "presentation": "application/vnd.google-apps.presentation",
}
EXPORT_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
EXPORT_PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

_DOWNLOADABLE_MIME_TO_EXT = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "text/x-markdown": ".md",
    EXPORT_DOCX_MIME: ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
}

# Query filter for the metadata listing (supported study-document types).
_LIST_MIME_FILTER = (
    "trashed = false and ("
    "mimeType = 'application/pdf' or "
    "mimeType = 'text/plain' or "
    "mimeType = 'text/markdown' or "
    "mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or "
    "mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation' or "
    "mimeType = 'application/vnd.google-apps.document' or "
    "mimeType = 'application/vnd.google-apps.presentation'"
    ")"
)

REQUIRED_SETTINGS = ("google_drive_client_id", "google_drive_client_secret", "google_drive_redirect_uri")


class DriveNotConnectedError(Exception):
    """Raised when the user has no active Drive connection."""


class DriveReauthRequiredError(Exception):
    """Raised when the stored grant is invalid and the user must reconnect."""


class DriveUnsupportedTypeError(Exception):
    """Raised for file types the extraction pipeline cannot process."""


class DriveFileTooLargeError(Exception):
    """Raised when a Drive file exceeds the importable size limit."""


class GoogleAPIError(Exception):
    """Raised when Google token/Drive endpoints return unexpected errors."""


# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------

def _fernet(settings: AISettings) -> Fernet:
    from app.core.security import get_secret_key

    digest = hashlib.sha256(get_secret_key().encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_token(settings: AISettings, token: str) -> str:
    return _fernet(settings).encrypt(token.encode()).decode()


def decrypt_token(settings: AISettings, encrypted: str) -> str:
    try:
        return _fernet(settings).decrypt(encrypted.encode()).decode()
    except InvalidToken as exc:  # key rotated / foreign ciphertext
        raise DriveReauthRequiredError("Stored Google Drive credentials are unreadable; reconnect required.") from exc


# ---------------------------------------------------------------------------
# Feature flags / configuration checks
# ---------------------------------------------------------------------------

def is_configured(settings: AISettings) -> bool:
    return all(getattr(settings, name) for name in REQUIRED_SETTINGS)


def is_picker_available(settings: AISettings) -> bool:
    return bool(
        is_configured(settings) and settings.google_drive_api_key and settings.google_drive_app_id
    )


def _async_client() -> httpx.AsyncClient:
    """Factory indirection so tests can inject a MockTransport-based client."""
    return httpx.AsyncClient(timeout=30.0, follow_redirects=False)


# ---------------------------------------------------------------------------
# OAuth state management (single-use, expiring, user-bound)
# ---------------------------------------------------------------------------

def create_oauth_state(db: Session, user_id: str, settings: AISettings) -> str:
    from app.models.integrations import OAuthState

    # Opportunistically clean up expired states.
    db.query(OAuthState).filter(OAuthState.expires_at < datetime.now(timezone.utc)).delete()

    state = secrets.token_urlsafe(32)
    db.add(
        OAuthState(
            state=state,
            user_id=user_id,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=STATE_TTL_SECONDS),
            used=False,
        )
    )
    db.commit()
    return state


def consume_oauth_state(
    db: Session, state: str, session_user_id: str | None
) -> str | None:
    """Validate and burn a state token; return the bound user id or None.

    Rejects: unknown states, already-used states, expired states, and
    attempts to finalize the flow while logged in as a different user.
    """
    from app.models.integrations import OAuthState

    row = db.query(OAuthState).filter(OAuthState.state == state).first()
    if row is None:
        return None
    # Single use: use (or discard) then delete to prevent replay.
    db.delete(row)
    db.commit()

    if row.used:
        return None
    now = datetime.now(timezone.utc)
    expires_at = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        return None
    if session_user_id and session_user_id != row.user_id:
        # Session/CSRF mismatch: the browser identity changed mid-flow.
        return None
    return row.user_id


# ---------------------------------------------------------------------------
# OAuth URL + token exchange / refresh / revocation
# ---------------------------------------------------------------------------

def build_auth_url(settings: AISettings, state: str) -> str:
    params = {
        "client_id": settings.google_drive_client_id,
        "redirect_uri": settings.google_drive_redirect_uri,
        "response_type": "code",
        "scope": DRIVE_SCOPES_STRING,
        "access_type": "offline",          # request a refresh token
        "prompt": "consent",               # force refresh token issuance
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{AUTH_ENDPOINT}?{urlencode(params)}"


def frontend_redirect_url(settings: AISettings, drive_result: str, reason: str = "") -> str:
    """Browser redirect target after the OAuth callback (backend route)."""
    from urllib.parse import quote

    base = settings.frontend_base_url.rstrip("/")
    url = f"{base}/ai?drive={drive_result}"
    if reason:
        url += f"&drive_reason={quote(reason)}"
    return url


async def exchange_code(settings: AISettings, code: str) -> dict:
    """Exchange an authorization code for tokens (access, refresh, expiry)."""
    async with _async_client() as client:
        resp = await client.post(
            TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": settings.google_drive_client_id,
                "client_secret": settings.google_drive_client_secret,
                "redirect_uri": settings.google_drive_redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        detail = _sanitize_detail(resp.text)
        logger.warning("Google token exchange failed: HTTP %s %s", resp.status_code, detail)
        raise GoogleAPIError(f"Google OAuth token exchange failed (HTTP {resp.status_code}).")
    tokens = resp.json()
    if not tokens.get("access_token"):
        raise GoogleAPIError("Google OAuth token exchange returned no access token.")
    return tokens


async def refresh_access_token(settings: AISettings, refresh_token: str) -> dict:
    async with _async_client() as client:
        resp = await client.post(
            TOKEN_ENDPOINT,
            data={
                "client_id": settings.google_drive_client_id,
                "client_secret": settings.google_drive_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        detail = _sanitize_detail(resp.text)
        logger.warning("Google token refresh failed: HTTP %s %s", resp.status_code, detail)
        if resp.status_code == 400 or "invalid_grant" in resp.text:
            raise DriveReauthRequiredError("Google Drive authorization expired. Please reconnect.")
        raise GoogleAPIError(f"Google token refresh failed (HTTP {resp.status_code}).")
    return resp.json()


async def revoke_token(token: str) -> bool:
    """Best-effort revocation at Google. Never logs the token itself."""
    try:
        async with _async_client() as client:
            resp = await client.post(REVOKE_ENDPOINT, params={"token": token})
        if resp.status_code == 200:
            return True
        logger.warning("Google token revocation returned HTTP %s", resp.status_code)
        return False
    except httpx.RequestError as exc:
        logger.warning("Google token revocation request failed: %s", exc)
        return False


async def fetch_google_email(access_token: str) -> str | None:
    try:
        async with _async_client() as client:
            resp = await client.get(
                USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code == 200:
            return resp.json().get("email")
    except httpx.RequestError as exc:
        logger.warning("Google userinfo request failed: %s", exc)
    return None


# ---------------------------------------------------------------------------
# Account persistence
# ---------------------------------------------------------------------------

def _auth_expiry(tokens: dict) -> datetime:
    expires_in = int(tokens.get("expires_in") or 3600)
    return datetime.now(timezone.utc) + timedelta(seconds=expires_in)


def upsert_account(db: Session, settings: AISettings, user_id: str, tokens: dict) -> "GoogleDriveAccount":
    from app.models.integrations import GoogleDriveAccount

    account = db.query(GoogleDriveAccount).filter(GoogleDriveAccount.user_id == user_id).first()
    if account is None:
        account = GoogleDriveAccount(user_id=user_id)
        db.add(account)

    account.access_token_encrypted = encrypt_token(settings, tokens["access_token"])
    refresh_token = tokens.get("refresh_token")
    if refresh_token:
        # Google refresh tokens persist unless revoked; keep the old one if
        # consent returns none.
        account.refresh_token_encrypted = encrypt_token(settings, refresh_token)
    account.token_expiry = _auth_expiry(tokens)
    granted_scope = tokens.get("scope") or DRIVE_SCOPES_STRING
    account.scopes = granted_scope
    account.status = "active"
    db.commit()
    db.refresh(account)
    return account


def get_account(db: Session, user_id: str) -> "GoogleDriveAccount | None":
    from app.models.integrations import GoogleDriveAccount

    return (
        db.query(GoogleDriveAccount)
        .filter(GoogleDriveAccount.user_id == user_id)
        .first()
    )


async def get_access_token(db: Session, settings: AISettings, user_id: str) -> str:
    """Return a valid access token for the user, refreshing if needed."""
    account = get_account(db, user_id)
    if account is None or account.status == "needs_reauth":
        raise DriveNotConnectedError("Google Drive is not connected for this account.")
    if not account.access_token_encrypted:
        raise DriveNotConnectedError("Google Drive is not connected for this account.")

    access_token = decrypt_token(settings, account.access_token_encrypted)

    expiry = account.token_expiry
    if expiry is not None:
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        # Refresh proactively 60s before expiry.
        if expiry - timedelta(seconds=60) <= datetime.now(timezone.utc):
            refresh_token = account.refresh_token_encrypted
            if not refresh_token:
                account.status = "needs_reauth"
                db.commit()
                raise DriveReauthRequiredError("Google Drive authorization expired. Please reconnect.")
            try:
                refreshed = await refresh_access_token(
                    settings, decrypt_token(settings, refresh_token)
                )
            except DriveReauthRequiredError:
                account.status = "needs_reauth"
                db.commit()
                raise
            access_token = refreshed.get("access_token") or access_token
            account.access_token_encrypted = encrypt_token(settings, access_token)
            account.token_expiry = _auth_expiry(refreshed)
            db.commit()
    return access_token


async def disconnect_account(db: Session, settings: AISettings, user_id: str) -> bool:
    """Revoke tokens at Google (best-effort) and delete the local account row."""
    from app.models.integrations import GoogleDriveAccount

    account = get_account(db, user_id)
    if account is None:
        return False

    revoked = False
    if account.access_token_encrypted:
        try:
            revoked = await revoke_token(decrypt_token(settings, account.access_token_encrypted))
        except DriveReauthRequiredError:
            revoked = False
    if not revoked and account.refresh_token_encrypted:
        await revoke_token(decrypt_token(settings, account.refresh_token_encrypted))

    db.delete(account)
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Drive API: metadata listing
# ---------------------------------------------------------------------------

@dataclass
class DriveFile:
    id: str
    name: str
    mime_type: str
    size: int | None
    modified_time: str | None


async def list_drive_files(
    db: Session, settings: AISettings, user_id: str, page_size: int = 25, page_token: str | None = None
) -> dict:
    """List metadata for the user's supported Drive documents (metadata-only)."""
    access_token = await get_access_token(db, settings, user_id)
    params = {
        "pageSize": min(max(page_size, 1), 100),
        "q": _LIST_MIME_FILTER,
        "fields": "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
        "orderBy": "modifiedTime desc",
        "supportsAllDrives": "false",
    }
    if page_token:
        params["pageToken"] = page_token

    async with _async_client() as client:
        resp = await client.get(
            DRIVE_API_BASE + "/files",
            params=params,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code == 401 or resp.status_code == 403:
        _mark_needs_reauth_if_401(db, user_id, resp.status_code)
        raise DriveReauthRequiredError("Google Drive authorization expired. Please reconnect.")
    if resp.status_code != 200:
        detail = _sanitize_detail(resp.text)
        logger.warning("Drive files.list failed: HTTP %s %s", resp.status_code, detail)
        raise GoogleAPIError(f"Google Drive file listing failed (HTTP {resp.status_code}).")

    data = resp.json()
    files = [
        DriveFile(
            id=f.get("id", ""),
            name=f.get("name", "Untitled"),
            mime_type=f.get("mimeType", ""),
            size=int(f["size"]) if f.get("size") not in (None, "") else None,
            modified_time=f.get("modifiedTime"),
        )
        for f in data.get("files", [])
    ]
    return {"files": files, "next_page_token": data.get("nextPageToken")}


# ---------------------------------------------------------------------------
# Drive API: metadata + content download / export
# ---------------------------------------------------------------------------

async def get_file_metadata(db: Session, settings: AISettings, user_id: str, file_id: str) -> DriveFile:
    access_token = await get_access_token(db, settings, user_id)
    async with _async_client() as client:
        resp = await client.get(
            DRIVE_API_BASE + f"/files/{file_id}",
            params={"fields": "id, name, mimeType, size, modifiedTime"},
            headers={"Authorization": f"Bearer {access_token}"},
        )
    return _handle_file_response(db, user_id, resp, file_id)


def _handle_file_response(db: Session, user_id: str, resp, file_id: str) -> DriveFile:
    if resp.status_code == 404:
        raise GoogleAPIError("File not found in Google Drive (or not accessible with the granted scopes).")
    if resp.status_code in (401, 403):
        _mark_needs_reauth_if_401(db, user_id, resp.status_code)
        raise DriveReauthRequiredError("Google Drive authorization expired. Please reconnect.")
    if resp.status_code != 200:
        detail = _sanitize_detail(resp.text)
        logger.warning("Drive files.get failed (HTTP %s) file=%s %s", resp.status_code, file_id[:6], detail)
        raise GoogleAPIError(f"Google Drive metadata lookup failed (HTTP {resp.status_code}).")
    data = resp.json()
    return DriveFile(
        id=data["id"],
        name=data.get("name", "Untitled"),
        mime_type=data.get("mimeType", ""),
        size=int(data["size"]) if data.get("size") not in (None, "") else None,
        modified_time=data.get("modifiedTime"),
    )


async def fetch_file_content(
    db: Session, settings: AISettings, user_id: str, meta: DriveFile
) -> tuple[bytes, str]:
    """Download (binary) or export (Google Docs/Slides) file content.

    Returns (content_bytes, filename_with_extension). Raises explicit errors
    for unsupported types and oversized files.
    """
    # Size gate before downloading anything.
    if meta.size is not None and meta.size > MAX_FILE_SIZE_BYTES:
        mb = MAX_FILE_SIZE_BYTES // (1024 * 1024)
        raise DriveFileTooLargeError(
            f"File is {(meta.size / (1024 * 1024)):.1f} MB; the import limit is {mb} MB."
        )

    mime = meta.mime_type
    ext_from_name = meta.name.rsplit(".", 1)[-1].lower() if "." in meta.name else ""

    if mime == GOOGLE_MIME["document"]:
        access_token, download_url, ext = await _export_url(
            db, settings, user_id, meta.id, EXPORT_DOCX_MIME
        )
        if ext_from_name not in ("docx", "doc"):
            ext = ".docx"
    elif mime == GOOGLE_MIME["presentation"]:
        access_token, download_url, ext = await _export_url(
            db, settings, user_id, meta.id, EXPORT_PPTX_MIME
        )
        if ext_from_name not in ("pptx", "ppt"):
            ext = ".pptx"
    elif mime == GOOGLE_MIME["spreadsheet"]:
        raise DriveUnsupportedTypeError(
            "Google Sheets files are not supported. Export the data as .txt or .docx first."
        )
    elif mime in _DOWNLOADABLE_MIME_TO_EXT:
        ext = _DOWNLOADABLE_MIME_TO_EXT[mime]
        if ext_from_name in ("pdf", "txt", "md", "markdown", "docx", "pptx"):
            ext = f".{ext_from_name}"
        access_token = await get_access_token(db, settings, user_id)
        download_url = f"{DRIVE_API_BASE}/files/{meta.id}?alt=media"
    elif mime == "application/msword":
        raise DriveUnsupportedTypeError(
            "Legacy .doc files are not supported. Save the file as .docx or upload from Drive as a Google Doc."
        )
    else:
        raise DriveUnsupportedTypeError(
            f"Unsupported Google Drive file type '{mime or 'unknown'}'. Supported: PDF, DOCX, TXT, Markdown, PPTX, Google Docs & Slides."
        )

    async with _async_client() as client:
        resp = await client.get(
            download_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code in (401, 403):
        if resp.status_code == 403 and _is_scope_or_picker_403(resp):
            raise GoogleAPIError(
                "Google Drive denied access to this file (HTTP 403). With the minimal "
                "drive.file scope, only files opened through the Google Picker (or files "
                "created by the app) can be downloaded. Retry via the Picker, or reconnect "
                "and select the file again."
            )
        _mark_needs_reauth_if_401(db, user_id, resp.status_code)
        raise DriveReauthRequiredError("Google Drive authorization expired. Please reconnect.")
    if resp.status_code != 200:
        detail = _sanitize_detail(resp.text)
        logger.warning("Drive content fetch failed (HTTP %s) file=%s %s", resp.status_code, meta.id[:6], detail)
        raise GoogleAPIError(f"Google Drive file download failed (HTTP {resp.status_code}).")

    content = resp.content
    if len(content) > MAX_FILE_SIZE_BYTES:
        mb = MAX_FILE_SIZE_BYTES // (1024 * 1024)
        raise DriveFileTooLargeError(f"Downloaded file exceeds the {mb} MB import limit.")

    if not ext_from_name or ext_from_name not in ("pdf", "txt", "md", "markdown", "docx", "pptx"):
        filename = f"{meta.name}{ext}"
    else:
        filename = meta.name
    return content, filename


def _is_scope_or_picker_403(resp) -> bool:
    body = resp.text or ""
    return "insufficient_permissions" in body or "insufficientPermissions" in body or "appNotAuthorizedToFile" in body


async def _export_url(
    db: Session, settings: AISettings, user_id: str, file_id: str, export_mime: str
) -> tuple[str, str, str]:
    access_token = await get_access_token(db, settings, user_id)
    ext_map = {
        EXPORT_DOCX_MIME: ".docx",
        EXPORT_PPTX_MIME: ".pptx",
    }
    return (
        access_token,
        f"{DRIVE_API_BASE}/files/{file_id}/export?mimeType={export_mime}",
        ext_map.get(export_mime, ".txt"),
    )


# ---------------------------------------------------------------------------
# Google Picker support
# ---------------------------------------------------------------------------

def _mark_needs_reauth_if_401(db: Session, user_id: str, status_code: int) -> None:
    if status_code == 401:
        account = get_account(db, user_id)
        if account is not None:
            account.status = "needs_reauth"
            db.commit()


def build_picker_config(settings: AISettings) -> dict:
    """Static config for the browser Google Picker (client_id, api_key, app_id).

    The short-lived access token for the Picker session is minted separately
    (async, via get_access_token) so it can go through the refresh path.
    The token is never persisted client-side — used in memory only, per the
    standard Google Picker pattern.
    """
    if not is_picker_available(settings):
        raise GoogleAPIError(
            "Google Picker is not configured (set GOOGLE_DRIVE_API_KEY and GOOGLE_DRIVE_APP_ID)."
        )
    return {
        "client_id": settings.google_drive_client_id,
        "api_key": settings.google_drive_api_key,
        "app_id": settings.google_drive_app_id,
    }


def _sanitize_detail(body: str, limit: int = 300) -> str:
    """Trim response bodies; they must never contain token material anyway."""
    text = (body or "").replace("\n", " ")[:limit]
    return text
