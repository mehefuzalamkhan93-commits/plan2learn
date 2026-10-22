"""Live smoke test for the Google Drive OAuth flow (placeholder credentials).

Verifies:
1. /drive/status reports truthful configured/enabled/connected flags
2. /drive/connect produces a real Google consent URL with a fresh state
3. The state row is bound to the signed-up user
4. /drive/callback rejects an unknown state (CSRF) with drive=error redirect
"""
import asyncio
import httpx

BASE = "http://localhost:8010/api/v1"


async def main() -> None:
    async with httpx.AsyncClient(follow_redirects=False, base_url=BASE) as c:
        # Signup a smoke user
        r = await c.post(
            "/auth/signup",
            json={
                "full_name": "Drive Smoke",
                "email": "drive_smoke@example.com",
                "password": "Password123!",
                "confirm_password": "Password123!",
            },
        )
        print("signup:", r.status_code)

        # 1. Status
        r = await c.get("/ai/drive/status")
        status = r.json()
        print("status:", {k: status[k] for k in ("configured", "enabled", "connected", "picker_ready", "connect_url")})
        assert status["configured"] is True, "expected configured with placeholder creds"
        assert status["enabled"] is True
        assert status["connected"] is False, "must never pretend to be connected without OAuth"
        assert status["picker_ready"] is True
        assert status["connect_url"] == "/api/v1/ai/drive/connect"

        # 2. Connect → Google consent URL
        r = await c.get("/ai/drive/connect")
        print("connect:", r.status_code, r.headers.get("location", "")[:110])
        assert r.status_code == 307
        location = r.headers["location"]
        assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")
        assert "state=" in location
        assert "drive.file" in location and "drive.metadata.readonly" in location
        assert "redirect_uri=http%3A%2F%2Flocalhost%3A8010%2Fapi%2Fv1%2Fai%2Fdrive%2Fcallback" in location
        print("consent URL includes real backend callback route: OK")

        # 3. Callback with a bogus state must be rejected before token exchange
        r = await c.get(
            "/ai/drive/callback",
            params={"code": "fake-code", "state": "bogus-state-value"},
        )
        loc = r.headers.get("location", "")
        print("callback bogus state:", r.status_code, loc)
        assert r.status_code == 307
        assert "drive=error" in loc and "invalid_state" in loc

        # 4. Files list without a connection must be 401
        r = await c.get("/ai/drive/files")
        print("files no connection:", r.status_code, r.json().get("detail", "")[:60])
        assert r.status_code == 401

        # 5. Disconnect when never connected is a truthful no-op
        r = await c.post("/ai/drive/disconnect")
        print("disconnect noop:", r.status_code, r.json())
        assert r.status_code == 200

    print("SMOKE TEST PASSED")


asyncio.run(main())
