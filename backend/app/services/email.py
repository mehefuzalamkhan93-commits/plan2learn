import html
import logging
from typing import Any

import httpx

from app.ai.config import AISettings, get_ai_settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


class EmailDeliveryError(Exception):
    """Raised when email delivery via Resend fails."""

    def __init__(self, message: str, status_code: int | None = None, details: Any = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


def build_otp_html(otp_code: str, user_name: str | None = None, expire_minutes: int = 5) -> str:
    """Generate a clean, high-conversion HTML email template for Plan2Learn OTP."""
    safe_name = html.escape(user_name or "Student")
    safe_code = html.escape(otp_code)
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Plan2Learn Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #080B14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E4E4E7;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #080B14; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #0F1424; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background: linear-gradient(180deg, rgba(99, 102, 241, 0.12) 0%, rgba(15, 20, 36, 0) 100%);">
              <div style="display: inline-block; font-size: 22px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">
                Plan<span style="color: #6366F1;">2</span>Learn
              </div>
              <div style="margin-top: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #818CF8; font-weight: 600;">
                Smart Learning Planner
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 28px;">
              <h1 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #FFFFFF; text-align: center;">
                Verification Code
              </h1>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #A1A1AA; text-align: center;">
                Hello <strong style="color: #FFFFFF;">{safe_name}</strong>, use the single-use authentication code below to verify your session:
              </p>

              <!-- OTP Code Display Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 24px;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; padding: 16px 36px; background-color: #171E36; border: 1px solid #6366F1; border-radius: 12px; text-align: center;">
                      <span style="font-family: 'SF Mono', Consolas, Monaco, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #FFFFFF; text-indent: 8px; display: inline-block;">
                        {safe_code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Notice -->
              <div style="background-color: rgba(99, 102, 241, 0.08); border-left: 3px solid #6366F1; border-radius: 6px; padding: 12px 16px; margin: 0 0 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #C7D2FE;">
                  <strong>Expires in {expire_minutes} minutes.</strong> If you did not request this login or signup, someone may have mistyped their email. You can safely ignore this message.
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #71717A; text-align: center;">
                For your security, never forward or share this code with anyone. Plan2Learn staff will never ask for your verification code.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0B0E1B; border-top: 1px solid rgba(255, 255, 255, 0.05); text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #52525B;">
                &copy; Plan2Learn &bull; plan2learn.online &bull; All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


async def send_otp_email(
    to_email: str,
    otp_code: str,
    user_name: str | None = None,
    settings: AISettings | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Send an OTP email using Resend HTTP API.
    Raises EmailDeliveryError if sending fails or credentials are unverified.
    """
    cfg = settings or get_ai_settings()
    api_key = cfg.resend_api_key
    from_address = cfg.email_from or "Plan2Learn <noreply@plan2learn.online>"
    expire_minutes = getattr(cfg, "otp_expire_minutes", 5)

    if not api_key:
        # In development without an API key, log to console for dev workflow
        if cfg.app_env.lower() == "development":
            logger.warning("[DEV-EMAIL] RESEND_API_KEY is not set. OTP for %s is %s", to_email, otp_code)
            return {"id": "dev_mock_id", "status": "dev_logged"}
        raise EmailDeliveryError("RESEND_API_KEY is not configured on this server.")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": from_address,
        "to": [to_email],
        "subject": f"Your Plan2Learn Verification Code: {otp_code}",
        "html": build_otp_html(otp_code, user_name, expire_minutes),
        "text": f"Your Plan2Learn verification code is: {otp_code}. It will expire in {expire_minutes} minutes. Never share this code.",
    }

    async def _perform_send(c: httpx.AsyncClient) -> dict[str, Any]:
        resp = await c.post(RESEND_API_URL, headers=headers, json=payload, timeout=15.0)
        if resp.status_code in (200, 201):
            data = resp.json()
            logger.info("OTP email successfully dispatched to %s (id=%s)", to_email, data.get("id"))
            return data

        # Parse detailed error from Resend
        try:
            err_data = resp.json()
            message = err_data.get("message") or resp.text
        except Exception:
            message = resp.text

        logger.error("Resend API rejected email sending: %d - %s", resp.status_code, message)
        raise EmailDeliveryError(
            f"Email provider error ({resp.status_code}): {message}",
            status_code=resp.status_code,
            details=message,
        )

    if client is not None:
        return await _perform_send(client)

    async with httpx.AsyncClient() as default_client:
        return await _perform_send(default_client)
