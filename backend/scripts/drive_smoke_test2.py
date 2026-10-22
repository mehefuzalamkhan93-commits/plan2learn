"""Extended smoke: callback with the REAL state — token exchange fails
honestly at Google with placeholder credentials (never a fake success)."""
import asyncio
from urllib.parse import parse_qs, urlsplit

import httpx

BASE = "http://localhost:8010/api/v1"


async def main() -> None:
    async with httpx.AsyncClient(follow_redirects=False, base_url=BASE) as c:
        r = await c.post(
            "/auth/login",
            json={"email": "drive_smoke@example.com", "password": "Password123!"},
        )
        print("login:", r.status_code)

        r = await c.get("/ai/drive/connect")
        assert r.status_code == 307
        state = parse_qs(urlsplit(r.headers["location"]).query)["state"][0]
        print("state obtained:", state[:10], "…")

        r = await c.get("/ai/drive/callback", params={"code": "real-attempt-code", "state": state})
        loc = r.headers.get("location", "")
        print("callback with real state:", r.status_code, loc)
        assert r.status_code == 307
        assert "drive=error" in loc and "token_exchange" in loc, (
            "expected honest token_exchange failure with placeholder credentials, "
            f"got {loc}"
        )

        r = await c.get("/ai/drive/status")
        data = r.json()
        assert data["connected"] is False, "must not be connected after failed exchange"
        print("status after failed exchange: connected =", data["connected"])

    print("TOKEN-EXCHANGE FAILURE PATH VERIFIED (honest error, no fake connection)")


asyncio.run(main())
