import asyncio
import io
import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.ai.config import AISettings
from app.ai.contracts import (
    PreparedAIRequest,
    ProviderHealth,
    ProviderId,
    ProviderOutput,
)
from app.ai.router import AIProviderRouter
from app.api.ai import get_ai_router
from app.core.database import Base, get_db
from app.main import create_app
from app.models.notebook import Notebook, Source, SourceChunk, NotebookNote
from app.models.user import User


def run(coroutine):
    return asyncio.run(coroutine)


class SyncASGITestClient:
    def __init__(self, app) -> None:
        self.app = app
        self.cookies: dict[str, str] = {}

    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        async def send_request() -> httpx.Response:
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=self.app),
                base_url="http://testserver",
                cookies=self.cookies,
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


class FakeProvider:
    def __init__(self, provider_id: ProviderId, outcomes: list[object]) -> None:
        self.provider_id = provider_id
        self.outcomes = outcomes
        self.calls: list[tuple[PreparedAIRequest, str]] = []
        self.configured_model = f"{provider_id.value}-test-model"

    def missing_configuration(self) -> tuple[str, ...]:
        return ()

    def get_capabilities(self) -> tuple[str, ...]:
        return ("text_generation", "runtime_schema_validation", "health_check")

    async def generate(self, request: PreparedAIRequest, model: str) -> ProviderOutput:
        self.calls.append((request, model))
        outcome = self.outcomes.pop(0) if self.outcomes else '{"answer": "Standard explanation"}'
        if isinstance(outcome, Exception):
            raise outcome
        return ProviderOutput(str(outcome), input_tokens=15, output_tokens=10)

    async def health_check(self, model: str | None) -> ProviderHealth:
        return ProviderHealth(self.provider_id, "healthy", model, None)


@pytest.fixture
def notebook_client() -> SyncASGITestClient:
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


def signup_user(client: SyncASGITestClient, email: str = "notebook_user@example.com") -> None:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Notebook Researcher",
            "email": email,
            "password": "Password123!",
            "confirm_password": "Password123!",
        },
    )
    assert response.status_code == 201


def test_notebook_crud_lifecycle(notebook_client: SyncASGITestClient) -> None:
    signup_user(notebook_client, "nb_crud@example.com")

    # 1. Create Notebook
    create_resp = notebook_client.post(
        "/api/v1/ai/notebooks",
        json={"title": "Organic Chemistry", "description": "Stereochemistry and reactions"},
    )
    assert create_resp.status_code == 201
    nb_data = create_resp.json()
    assert nb_data["title"] == "Organic Chemistry"
    assert nb_data["description"] == "Stereochemistry and reactions"
    nb_id = nb_data["id"]

    # 2. List Notebooks
    list_resp = notebook_client.get("/api/v1/ai/notebooks")
    assert list_resp.status_code == 200
    notebooks = list_resp.json()
    assert len(notebooks) >= 1
    assert any(n["id"] == nb_id for n in notebooks)

    # 3. Update Notebook
    patch_resp = notebook_client.patch(
        f"/api/v1/ai/notebooks/{nb_id}",
        json={"title": "Organic Chemistry I - Advanced"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["title"] == "Organic Chemistry I - Advanced"

    # 4. Delete Notebook
    del_resp = notebook_client.delete(f"/api/v1/ai/notebooks/{nb_id}")
    assert del_resp.status_code == 200

    # Verify deleted
    list_after = notebook_client.get("/api/v1/ai/notebooks").json()
    assert not any(n["id"] == nb_id for n in list_after)


def test_source_upload_and_toggle(notebook_client: SyncASGITestClient) -> None:
    signup_user(notebook_client, "nb_sources@example.com")

    # Create notebook
    nb_resp = notebook_client.post(
        "/api/v1/ai/notebooks",
        json={"title": "Physics Notes"},
    )
    assert nb_resp.status_code == 201
    nb_id = nb_resp.json()["id"]

    # Upload TXT file
    file_content = b"Newton's First Law states that an object will remain at rest unless acted upon by a net external force."
    files = {"file": ("newton_laws.txt", io.BytesIO(file_content), "text/plain")}
    data = {"notebook_id": nb_id, "origin": "upload"}

    upload_resp = notebook_client.post(
        "/api/v1/ai/sources/upload",
        files=files,
        data=data,
    )
    assert upload_resp.status_code == 200
    upload_data = upload_resp.json()
    assert upload_data["success"] is True
    source_id = upload_data["source"]["id"]
    assert upload_data["source"]["status"] == "ready"

    # List sources
    list_sources = notebook_client.get(f"/api/v1/ai/sources/list/{nb_id}")
    assert list_sources.status_code == 200
    srcs = list_sources.json()
    assert len(srcs) == 1
    assert srcs[0]["id"] == source_id
    assert srcs[0]["is_selected"] is True

    # Toggle selection
    toggle_resp = notebook_client.patch(f"/api/v1/ai/sources/{source_id}/toggle-selection")
    assert toggle_resp.status_code == 200
    assert toggle_resp.json()["is_selected"] is False

    # Toggle back
    toggle_resp2 = notebook_client.patch(f"/api/v1/ai/sources/{source_id}/toggle-selection")
    assert toggle_resp2.status_code == 200
    assert toggle_resp2.json()["is_selected"] is True

    # Delete source
    del_src = notebook_client.delete(f"/api/v1/ai/sources/{source_id}")
    assert del_src.status_code == 200

    # Verify deleted
    list_after = notebook_client.get(f"/api/v1/ai/sources/list/{nb_id}").json()
    assert len(list_after) == 0


def test_notes_management(notebook_client: SyncASGITestClient) -> None:
    signup_user(notebook_client, "nb_notes@example.com")

    # Create notebook
    nb_resp = notebook_client.post(
        "/api/v1/ai/notebooks",
        json={"title": "Biology Notes"},
    )
    nb_id = nb_resp.json()["id"]

    # Create manual note
    create_note_resp = notebook_client.post(
        "/api/v1/ai/notes",
        json={
            "notebook_id": nb_id,
            "title": "Mitosis Stages",
            "content": "Prophase, Metaphase, Anaphase, Telophase.",
            "note_type": "manual",
        },
    )
    assert create_note_resp.status_code == 201
    note_id = create_note_resp.json()["id"]

    # List notes
    notes_list = notebook_client.get(f"/api/v1/ai/notes/{nb_id}")
    assert notes_list.status_code == 200
    assert len(notes_list.json()) == 1

    # Delete note
    del_note = notebook_client.delete(f"/api/v1/ai/notes/{note_id}")
    assert del_note.status_code == 200

    # Verify deleted
    notes_after = notebook_client.get(f"/api/v1/ai/notes/{nb_id}").json()
    assert len(notes_after) == 0


def test_study_tools_and_save_note(notebook_client: SyncASGITestClient) -> None:
    signup_user(notebook_client, "nb_tools@example.com")

    # Setup fake AI provider
    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            '{"answer": "A detailed explanation of limits in calculus."}',
            '{"answer": "Summary of derivatives and integrals."}',
            '{"answer": "1. What is the derivative of sin(x)? A) cos(x) B) -cos(x)"}',
        ],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = AIProviderRouter(AISettings(_env_file=None), {primary.provider_id: primary, fallback.provider_id: fallback})
    notebook_client.app.dependency_overrides[get_ai_router] = lambda: test_router

    # Create notebook
    nb_resp = notebook_client.post(
        "/api/v1/ai/notebooks",
        json={"title": "Calculus"},
    )
    nb_id = nb_resp.json()["id"]

    # 1. Explain topic
    explain_resp = notebook_client.post(
        "/api/v1/ai/study-tool/explain",
        json={"notebook_id": nb_id, "topic": "Limits at infinity"},
    )
    assert explain_resp.status_code == 200
    assert explain_resp.json()["success"] is True
    assert "explanation" in explain_resp.json()["content"].lower()

    # 2. Summarize
    sum_resp = notebook_client.post(
        "/api/v1/ai/study-tool/summarize",
        json={"notebook_id": nb_id, "topic": "Calculus Fundamentals"},
    )
    assert sum_resp.status_code == 200
    assert sum_resp.json()["success"] is True

    # 3. Save note from study tool
    save_resp = notebook_client.post(
        "/api/v1/ai/study-tool/save-note",
        json={
            "notebook_id": nb_id,
            "title": "AI Summary: Limits",
            "content": sum_resp.json()["content"],
        },
    )
    assert save_resp.status_code in (200, 201)

    # Verify saved note in notebook
    notes = notebook_client.get(f"/api/v1/ai/notes/{nb_id}").json()
    assert len(notes) == 1
    assert notes[0]["title"] == "AI Summary: Limits"


def test_youtube_search_and_drive_status(notebook_client: SyncASGITestClient) -> None:
    signup_user(notebook_client, "nb_integrations@example.com")

    # YouTube search endpoint
    yt_resp = notebook_client.get("/api/v1/ai/youtube/search?query=Calculus+Derivatives")
    assert yt_resp.status_code == 200
    yt_data = yt_resp.json()
    assert "results" in yt_data
    assert yt_data["query"] == "Calculus Derivatives"

    # Drive status endpoint
    drive_resp = notebook_client.get("/api/v1/ai/drive/status")
    assert drive_resp.status_code == 200
    drive_data = drive_resp.json()
    assert "configured" in drive_data
    assert "connected" in drive_data


def test_response_style_and_grounded_chat(notebook_client: SyncASGITestClient) -> None:
    signup_user(notebook_client, "nb_grounded@example.com")

    primary = FakeProvider(
        ProviderId.OMNIROUTE,
        [
            '{"profile_updates": {"target_subjects": ["Organic Chemistry"]}, "confidence": 0.95}'
        ],
    )
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = AIProviderRouter(AISettings(_env_file=None), {primary.provider_id: primary, fallback.provider_id: fallback})
    notebook_client.app.dependency_overrides[get_ai_router] = lambda: test_router

    # Create notebook and add a source directly to DB
    session = notebook_client.session_factory()
    user = session.query(User).filter(User.email == "nb_grounded@example.com").first()
    nb = Notebook(user_id=user.id, title="Chemistry Lab")
    session.add(nb)
    session.flush()

    source = Source(
        notebook_id=nb.id,
        user_id=user.id,
        title="Lab_Safety.pdf",
        source_type="pdf",
        status="ready",
        is_selected=True,
        file_size=1024,
    )
    session.add(source)
    session.flush()

    chunk = SourceChunk(
        source_id=source.id,
        chunk_index=0,
        content="Wear protective goggles and nitrile gloves at all times in the organic synthesis lab.",
        page_number=1,
    )
    session.add(chunk)
    session.commit()
    target_nb_id = str(nb.id)
    session.close()

    # Chat with notebook_id and strict mode
    chat_resp = notebook_client.post(
        "/api/v1/ai/chat",
        json={
            "message": "What protective gear is required in the synthesis lab?",
            "notebook_id": target_nb_id,
            "response_style": "strict",
        },
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert chat_data["success"] is True
    assert "citations" in chat_data
    assert chat_data["citations"] is not None
    assert len(chat_data["citations"]) >= 1
    assert chat_data["citations"][0]["source_title"] == "Lab_Safety.pdf"

    # Test set-response-style
    conv_id = chat_data["conversation_id"]
    style_resp = notebook_client.post(
        "/api/v1/ai/set-response-style",
        json={"conversation_id": conv_id, "response_style": "friendly"},
    )
    assert style_resp.status_code == 200
    assert style_resp.json()["response_style"] == "friendly"


def test_additional_study_tools_and_drive(notebook_client: SyncASGITestClient) -> None:
    signup_user(notebook_client, "nb_tools@example.com")

    primary = FakeProvider(ProviderId.OMNIROUTE, ["Diagnostic generated successfully."])
    fallback = FakeProvider(ProviderId.GROQ, [])
    test_router = AIProviderRouter(AISettings(_env_file=None), {primary.provider_id: primary, fallback.provider_id: fallback})
    notebook_client.app.dependency_overrides[get_ai_router] = lambda: test_router

    # Create notebook
    nb_res = notebook_client.post("/api/v1/ai/notebooks", json={"title": "Physics 101"})
    assert nb_res.status_code == 201
    nb_id = nb_res.json()["id"]

    # Test weak-areas
    wa_res = notebook_client.post(
        "/api/v1/ai/study-tool/weak-areas",
        json={"notebook_id": nb_id, "topic": "Electromagnetism"},
    )
    assert wa_res.status_code == 200
    assert wa_res.json()["success"] is True
    assert wa_res.json()["topic"] == "Electromagnetism"

    # Test optimize-routine
    opt_res = notebook_client.post(
        "/api/v1/ai/study-tool/optimize-routine",
        json={"notebook_id": nb_id, "topic": "Thermodynamics"},
    )
    assert opt_res.status_code == 200
    assert opt_res.json()["success"] is True
    assert opt_res.json()["topic"] == "Thermodynamics"

    # Test high-yield
    hy_res = notebook_client.post(
        "/api/v1/ai/study-tool/high-yield",
        json={"notebook_id": nb_id, "topic": "Quantum Optics"},
    )
    assert hy_res.status_code == 200
    assert hy_res.json()["success"] is True
    assert hy_res.json()["topic"] == "Quantum Optics"

    # Test notes CRUD
    note_create = notebook_client.post(
        "/api/v1/ai/notes",
        json={
            "notebook_id": nb_id,
            "title": "Quantum Principles",
            "content": "Photons have dual wave-particle properties.",
            "note_type": "summary",
        },
    )
    assert note_create.status_code == 201
    note_id = note_create.json()["id"]

    # List notes
    notes_list = notebook_client.get(f"/api/v1/ai/notes/{nb_id}")
    assert notes_list.status_code == 200
    assert len(notes_list.json()) == 1

    # Delete note
    note_del = notebook_client.delete(f"/api/v1/ai/notes/{note_id}")
    assert note_del.status_code == 200

    # Drive disconnect
    dc_res = notebook_client.post("/api/v1/ai/drive/disconnect")
    assert dc_res.status_code == 200
