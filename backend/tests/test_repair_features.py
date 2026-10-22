import asyncio
import io
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.config import AISettings
from app.ai.contracts import (
    AIErrorType,
    PreparedAIRequest,
    ProviderHealth,
    ProviderId,
    ProviderOutput,
)
from app.ai.errors import AIProviderError
from app.ai.router import AIProviderRouter
from app.api.ai import get_ai_router
from app.core.database import Base, get_db
from app.main import create_app
from app.models.ai import AIConversation, AIMessage
from app.models.notebook import Notebook, Source, SourceChunk
from app.models.user import User


def run(coroutine):
    return asyncio.run(coroutine)


class SyncASGITestClient:
    def __init__(self, app) -> None:
        self.app = app
        self.cookies: dict[str, str] = {}
        self.headers: dict[str, str] = {}

    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        merged_headers = dict(self.headers)
        if "headers" in kwargs:
            merged_headers.update(kwargs.pop("headers"))

        async def send_request() -> httpx.Response:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=self.app),
                base_url="http://testserver",
                cookies=self.cookies,
                headers=merged_headers,
            ) as client:
                response = await client.request(method, path, **kwargs)
                self.cookies.update(dict(response.cookies))
                return response

        return run(send_request())

    def get(self, path: str, **kwargs) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> httpx.Response:
        return self.request("POST", path, **kwargs)

    def patch(self, path: str, **kwargs) -> httpx.Response:
        return self.request("PATCH", path, **kwargs)

    def delete(self, path: str, **kwargs) -> httpx.Response:
        return self.request("DELETE", path, **kwargs)


class MockProvider:
    def __init__(self, provider_id: ProviderId, outcomes: list[object]) -> None:
        self.provider_id = provider_id
        self.outcomes = outcomes
        self.calls: list[tuple[PreparedAIRequest, str]] = []
        self.configured_model = f"{provider_id.value}-model"

    def missing_configuration(self) -> tuple[str, ...]:
        return ()

    def get_capabilities(self) -> tuple[str, ...]:
        return ("text_generation", "runtime_schema_validation", "health_check")

    async def generate(self, request: PreparedAIRequest, model: str) -> ProviderOutput:
        self.calls.append((request, model))
        if not self.outcomes:
            return ProviderOutput("Default study answer from provider.", input_tokens=10, output_tokens=10)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return ProviderOutput(str(outcome), input_tokens=10, output_tokens=10)

    async def health_check(self, model: str | None) -> ProviderHealth:
        return ProviderHealth(self.provider_id, "healthy", model, None)


@pytest.fixture
def test_client() -> SyncASGITestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override_get_db():
        session = testing_session()
        try:
            yield session
        finally:
            session.close()

    app = create_app(AISettings(_env_file=None))
    app.dependency_overrides[get_db] = override_get_db
    client = SyncASGITestClient(app)
    client.session_factory = testing_session
    return client


def test_auth_token_header_and_session_restoration(test_client: SyncASGITestClient) -> None:
    # 1. Signup user
    signup_resp = test_client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Auth Tester",
            "email": "auth_tester@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert signup_resp.status_code == 201
    auth_data = signup_resp.json()
    assert "access_token" in auth_data["data"]
    token = auth_data["data"]["access_token"]

    # 2. Clear cookies to simulate pure Bearer token from localStorage
    test_client.cookies.clear()

    # Without token or cookie -> 401
    unauth_resp = test_client.get("/api/v1/auth/me")
    assert unauth_resp.status_code == 401

    # With Authorization header -> 200
    test_client.headers["Authorization"] = f"Bearer {token}"
    me_resp = test_client.get("/api/v1/auth/me")
    assert me_resp.status_code == 200
    assert me_resp.json()["data"]["email"] == "auth_tester@example.com"

    # With invalid Bearer token -> 401
    test_client.headers["Authorization"] = "Bearer invalid.token.value"
    invalid_resp = test_client.get("/api/v1/auth/me")
    assert invalid_resp.status_code == 401


def test_source_upload_validation_and_persistence(test_client: SyncASGITestClient) -> None:
    # Signup
    signup_resp = test_client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Uploader User",
            "email": "uploader@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert signup_resp.status_code == 201

    # Create notebook
    nb_resp = test_client.post("/api/v1/ai/notebooks", json={"title": "Physics 101"})
    nb_id = nb_resp.json()["id"]

    # 1. Empty file validation
    empty_file = {"file": ("empty.txt", io.BytesIO(b""), "text/plain")}
    resp_empty = test_client.post(
        "/api/v1/ai/sources/upload",
        files=empty_file,
        data={"notebook_id": nb_id},
    )
    assert resp_empty.status_code in (400, 422)
    assert "empty" in resp_empty.json()["detail"].lower()

    # 2. Unsupported file extension
    bad_file = {"file": ("script.exe", io.BytesIO(b"binary payload"), "application/octet-stream")}
    resp_bad = test_client.post(
        "/api/v1/ai/sources/upload",
        files=bad_file,
        data={"notebook_id": nb_id},
    )
    assert resp_bad.status_code in (400, 422)
    assert "unsupported" in resp_bad.json()["detail"].lower()

    # 3. Successful TXT file upload
    valid_content = b"Newton's third law states that for every action, there is an equal and opposite reaction."
    valid_file = {"file": ("newton3.txt", io.BytesIO(valid_content), "text/plain")}
    resp_ok = test_client.post(
        "/api/v1/ai/sources/upload",
        files=valid_file,
        data={"notebook_id": nb_id},
    )
    assert resp_ok.status_code == 200
    data = resp_ok.json()
    assert data["success"] is True
    assert data["source"]["status"] == "ready"
    assert data["source"]["title"] == "newton3.txt"

    # Verify source persisted in list
    list_resp = test_client.get(f"/api/v1/ai/sources/list/{nb_id}")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


def test_url_import_and_ssrf_protection(test_client: SyncASGITestClient) -> None:
    # Signup & notebook
    test_client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Web User",
            "email": "web_user@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    nb_resp = test_client.post("/api/v1/ai/notebooks", json={"title": "Web Sources"})
    nb_id = nb_resp.json()["id"]

    # 1. SSRF blocks: localhost, 127.0.0.1, 169.254.169.254, private IP, non-http
    for blocked_url in [
        "http://localhost:8000/api/v1/admin",
        "http://127.0.0.1:20128/v1",
        "http://169.254.169.254/latest/meta-data",
        "http://192.168.1.1/admin",
        "http://10.0.0.1/",
        "ftp://example.com/file.txt",
    ]:
        resp = test_client.post(
            "/api/v1/ai/sources/import-url",
            json={"url": blocked_url, "notebook_id": nb_id},
        )
        assert resp.status_code in (400, 422)

    # 2. Valid URL import with mocked async safe_fetch_url in app.api.ai
    html_sample = (
        b"<!DOCTYPE html><html><head><title>Cellular Respiration Overview</title></head>"
        b"<body><article><h1>Cellular Respiration</h1><p>Cellular respiration is a set of metabolic reactions "
        b"that take place in the cells of organisms to convert biochemical energy from nutrients into ATP.</p>"
        b"<p>The catabolic reactions involved in respiration include glycolysis, the citric acid cycle, "
        b"and oxidative phosphorylation.</p></article></body></html>"
    )

    with patch("app.api.ai.safe_fetch_url", new=AsyncMock(return_value=(html_sample, "text/html", "https://en.wikipedia.org/wiki/Cellular_respiration"))):
        import_resp = test_client.post(
            "/api/v1/ai/sources/import-url",
            json={"url": "https://en.wikipedia.org/wiki/Cellular_respiration", "notebook_id": nb_id},
        )
        assert import_resp.status_code == 200
        data = import_resp.json()
        assert data["success"] is True
        assert data["source"]["status"] == "ready"
        assert "Cellular Respiration" in data["source"]["title"]
        assert data["chunks_indexed"] >= 1


def test_youtube_video_save_transcript_and_paste(test_client: SyncASGITestClient) -> None:
    # Signup & notebook
    test_client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Video Student",
            "email": "video_student@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    nb_resp = test_client.post("/api/v1/ai/notebooks", json={"title": "Organic Chem Video Deck"})
    nb_id = nb_resp.json()["id"]

    # 1. Save video with transcript available
    mock_transcript_data = [
        {"text": "Welcome to our lecture on SN2 reaction mechanisms.", "start": 0.0, "duration": 4.5},
        {"text": "The SN2 mechanism is bimolecular and involves a backside attack.", "start": 4.5, "duration": 5.0},
        {"text": "This leads to complete inversion of stereochemical configuration.", "start": 9.5, "duration": 6.0},
    ]

    mock_fetched = MagicMock()
    mock_fetched.to_raw_data.return_value = mock_transcript_data
    mock_mod = MagicMock()
    mock_api = MagicMock()
    mock_api.fetch.return_value = mock_fetched
    mock_mod.YouTubeTranscriptApi.return_value = mock_api

    with patch.dict("sys.modules", {"youtube_transcript_api": mock_mod}):
        save_resp = test_client.post(
            "/api/v1/ai/youtube/save",
            json={
                "video_id": "dQw4w9WgXcQ",
                "notebook_id": nb_id,
                "title": "SN2 Reaction Mechanism Explained",
                "channel": "Chemistry Academy",
                "thumbnail": "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            },
        )
        assert save_resp.status_code == 200
        save_data = save_resp.json()
        assert save_data["success"] is True
        assert save_data["transcript_status"] == "ready"
        assert save_data["source"]["status"] == "ready"

    # 2. Duplicate prevention: saving the same video to the same notebook is rejected
    dup_resp = test_client.post(
        "/api/v1/ai/youtube/save",
        json={
            "video_id": "dQw4w9WgXcQ",
            "notebook_id": nb_id,
            "title": "SN2 Reaction Mechanism Explained",
            "channel": "Chemistry Academy",
        },
    )
    assert dup_resp.status_code == 200
    assert "already saved" in dup_resp.json()["message"].lower()

    # 3. Save video when transcript is unavailable
    mock_failing_api = MagicMock()
    mock_failing_api.fetch.side_effect = Exception("TranscriptsDisabled")
    mock_failing_api.list.side_effect = Exception("TranscriptsDisabled")
    mock_failing_mod = MagicMock()
    mock_failing_mod.YouTubeTranscriptApi.return_value = mock_failing_api

    with patch.dict("sys.modules", {"youtube_transcript_api": mock_failing_mod}):
        no_trans_resp = test_client.post(
            "/api/v1/ai/youtube/save",
            json={
                "video_id": "noTrans12345",
                "notebook_id": nb_id,
                "title": "Lab Demonstration - No Subtitles",
                "channel": "Science Lab",
                "url": "https://www.youtube.com/watch?v=noTrans12345",
            },
        )
        assert no_trans_resp.status_code == 200
        no_trans_data = no_trans_resp.json()
        assert no_trans_data["success"] is True
        assert no_trans_data["transcript_status"] == "no_transcript"
        assert no_trans_data["source"]["status"] == "no_transcript"
        source_id = no_trans_data["source"]["id"]

    # 4. Paste transcript workflow
    paste_text = (
        "[00:00] In this lab demonstration, we will observe the titration of hydrochloric acid with sodium hydroxide.\n"
        "[01:30] Notice the indicator turns light pink at the equivalence point indicating neutralization."
    )
    paste_resp = test_client.post(
        f"/api/v1/ai/sources/{source_id}/paste-transcript",
        json={"transcript_text": paste_text},
    )
    assert paste_resp.status_code == 200
    paste_data = paste_resp.json()
    assert paste_data["success"] is True
    assert paste_data["source"]["status"] == "ready"
    assert paste_data["chunks_indexed"] >= 1


def test_cross_user_isolation(test_client: SyncASGITestClient) -> None:
    # 1. User A creates notebook and source
    test_client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "User Alpha",
            "email": "alpha@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    nb_resp = test_client.post("/api/v1/ai/notebooks", json={"title": "Alpha Private Notebook"})
    alpha_nb_id = nb_resp.json()["id"]

    # Upload file for Alpha
    file = {"file": ("alpha_secret.txt", io.BytesIO(b"Alpha's private study notes on calculus."), "text/plain")}
    up_resp = test_client.post("/api/v1/ai/sources/upload", files=file, data={"notebook_id": alpha_nb_id})
    alpha_source_id = up_resp.json()["source"]["id"]

    # 2. User B signs up and logs in
    test_client.cookies.clear()
    test_client.headers.clear()
    test_client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "User Beta",
            "email": "beta@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )

    # User B lists notebooks -> cannot see Alpha's
    beta_nbs = test_client.get("/api/v1/ai/notebooks").json()
    assert not any(n["id"] == alpha_nb_id for n in beta_nbs)

    # User B tries to view Alpha's sources -> 404
    assert test_client.get(f"/api/v1/ai/sources/list/{alpha_nb_id}").status_code == 404

    # User B tries to upload to Alpha's notebook -> 404
    b_file = {"file": ("intruder.txt", io.BytesIO(b"Intruder text"), "text/plain")}
    assert test_client.post("/api/v1/ai/sources/upload", files=b_file, data={"notebook_id": alpha_nb_id}).status_code == 404

    # User B tries to delete Alpha's notebook -> 404
    assert test_client.delete(f"/api/v1/ai/notebooks/{alpha_nb_id}").status_code == 404

    # User B tries to paste transcript to Alpha's source -> 404
    assert test_client.post(
        f"/api/v1/ai/sources/{alpha_source_id}/paste-transcript",
        json={"transcript_text": "Hacked transcript"},
    ).status_code == 404


def test_ai_chat_grounded_mode_and_failover(test_client: SyncASGITestClient) -> None:
    # Signup & notebook
    test_client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Chat Grounding Tester",
            "email": "grounding_tester@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    nb_resp = test_client.post("/api/v1/ai/notebooks", json={"title": "Thermodynamics"})
    nb_id = nb_resp.json()["id"]

    # Upload study source
    txt_content = b"The Second Law of Thermodynamics states that the total entropy of an isolated system always increases over time."
    file = {"file": ("thermo.txt", io.BytesIO(txt_content), "text/plain")}
    test_client.post("/api/v1/ai/sources/upload", files=file, data={"notebook_id": nb_id})

    # Case 1: Primary fails -> Fallback succeeds
    primary_failing = MockProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, AIErrorType.NETWORK_ERROR, "OmniRoute service offline: WinError 10061", status_code=503)],
    )
    fallback_succeeding = MockProvider(
        ProviderId.GROQ,
        ["According to your notes, the Second Law dictates that the entropy of an isolated system always increases."],
    )
    router = AIProviderRouter(
        AISettings(_env_file=None),
        {primary_failing.provider_id: primary_failing, fallback_succeeding.provider_id: fallback_succeeding},
    )
    test_client.app.dependency_overrides[get_ai_router] = lambda: router

    chat_resp = test_client.post(
        "/api/v1/ai/chat",
        json={
            "message": "What does the second law of thermodynamics state?",
            "notebook_id": nb_id,
        },
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert chat_data["success"] is True
    assert "entropy" in chat_data["ai_response"].lower()
    assert len(chat_data["citations"]) >= 1

    # Case 2: Both providers fail -> 503 returned, no orphaned message in DB
    primary_down = MockProvider(
        ProviderId.OMNIROUTE,
        [AIProviderError(ProviderId.OMNIROUTE, AIErrorType.NETWORK_ERROR, "OmniRoute down", status_code=503)],
    )
    fallback_down = MockProvider(
        ProviderId.GROQ,
        [AIProviderError(ProviderId.GROQ, AIErrorType.PROVIDER_ERROR, "Groq free tier 403", status_code=403)],
    )
    failing_router = AIProviderRouter(
        AISettings(_env_file=None),
        {primary_down.provider_id: primary_down, fallback_down.provider_id: fallback_down},
    )
    test_client.app.dependency_overrides[get_ai_router] = lambda: failing_router

    fail_resp = test_client.post(
        "/api/v1/ai/chat",
        json={
            "message": "Will this request fail cleanly?",
            "notebook_id": nb_id,
        },
    )
    assert fail_resp.status_code == 503

    # Verify no orphaned uncommitted messages
    session = test_client.session_factory()
    try:
        orphaned = session.query(AIMessage).filter(AIMessage.content == "Will this request fail cleanly?").first()
        assert orphaned is None
    finally:
        session.close()


def test_grounded_chat_with_17_active_sources_and_bounded_budget(test_client: SyncASGITestClient) -> None:
    """Regression test: verify that 17 active sources do not cause context bloat or 503."""
    signup_resp = test_client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Sources 17 User",
            "email": "sources17@example.com",
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert signup_resp.status_code == 201
    user_id = signup_resp.json()["data"]["user"]["id"]

    session = test_client.session_factory()
    try:
        nb = Notebook(user_id=user_id, title="17 Sources Chemistry Notebook")
        session.add(nb)
        session.flush()

        # Add 17 active sources to this notebook
        for i in range(1, 18):
            title = f"Haloalkane_Chapter_{i}.pdf" if i <= 10 else f"Unrelated_Physics_Topic_{i}.pdf"
            src = Source(
                notebook_id=nb.id,
                user_id=user_id,
                title=title,
                source_type="pdf",
                status="ready",
                is_selected=True,
                file_size=2048,
            )
            session.add(src)
            session.flush()

            for chunk_idx in range(3):
                if i <= 10:
                    content = (
                        f"Section {chunk_idx + 1} of {title}: Nucleophilic substitution mechanisms (SN1 and SN2) "
                        f"in haloalkanes depend on the carbon substrate and leaving group kinetics."
                    )
                else:
                    content = (
                        f"Section {chunk_idx + 1} of {title}: Electrostatic forces and Coulomb's law "
                        f"determine the electric field and potential energy of charges."
                    )
                chunk = SourceChunk(
                    source_id=src.id,
                    chunk_index=chunk_idx,
                    content=content,
                    page_number=chunk_idx + 1,
                )
                session.add(chunk)
        session.commit()
        notebook_id = nb.id
    finally:
        session.close()

    # 1. Test get_notebook_sources directly
    from app.api.ai import get_notebook_sources
    session = test_client.session_factory()
    try:
        sources_meta = get_notebook_sources(
            notebook_id,
            user_id,
            session,
            query="Explain haloalkane mechanisms and nucleophilic substitution.",
            max_total_chunks=10,
        )
        total_chunks = sum(len(s["chunks"]) for s in sources_meta)
        assert 0 < total_chunks <= 10, f"Expected <= 10 chunks, got {total_chunks}"
        # Verify relevant sources are retrieved
        titles = [s["title"] for s in sources_meta]
        assert any("Haloalkane" in t for t in titles)
    finally:
        session.close()

    # 2. Test chat endpoint with AI router
    mock_provider = MockProvider(
        ProviderId.OMNIROUTE,
        ["Nucleophilic substitution occurs via SN1 or SN2 pathways based on substrate hindrance."],
    )
    mock_provider.configured_model = "auto/best-fast"
    router = AIProviderRouter(AISettings(_env_file=None), {mock_provider.provider_id: mock_provider})
    test_client.app.dependency_overrides[get_ai_router] = lambda: router

    resp = test_client.post(
        "/api/v1/ai/chat",
        json={
            "notebook_id": notebook_id,
            "message": "Explain haloalkane mechanisms and nucleophilic substitution.",
            "response_style": "friendly",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "citations" in data
    assert data["citations"] is not None
    # Citations must be bounded, not all 51 chunks
    assert 0 < len(data["citations"]) <= 10
    for citation in data["citations"]:
        assert "passage" in citation
        assert "source_title" in citation

