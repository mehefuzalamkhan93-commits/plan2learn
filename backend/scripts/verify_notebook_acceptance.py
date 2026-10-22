"""
Comprehensive Acceptance Audit Script for Plan2Learn AI Study Notebook.
Verifies all 6 acceptance categories end to end.
"""

import io
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.user import User, StudentProfile
from app.models.notebook import Notebook, Source, SourceChunk, NotebookNote
from app.core.security import hash_password, create_access_token
from app.ai.router import AIProviderRouter
from app.api.ai import get_ai_router
from app.ai.config import AISettings
from app.ai.contracts import (
    PreparedAIRequest,
    ProviderHealth,
    ProviderId,
    ProviderOutput,
)


class FakeAuditProvider:
    def __init__(self, provider_id: ProviderId, outcomes: list[object]) -> None:
        self.provider_id = provider_id
        self.outcomes = outcomes
        self.calls: list[tuple[PreparedAIRequest, str]] = []
        self.configured_model = "audit-model"

    def missing_configuration(self) -> tuple[str, ...]:
        return ()

    def get_capabilities(self) -> tuple[str, ...]:
        return ("text_generation", "runtime_schema_validation", "health_check")

    async def generate(self, request: PreparedAIRequest, model: str) -> ProviderOutput:
        self.calls.append((request, model))
        outcome = self.outcomes.pop(0) if self.outcomes else '{"answer": "Default verified response"}'
        if isinstance(outcome, Exception):
            raise outcome
        return ProviderOutput(str(outcome), input_tokens=20, output_tokens=15)

    async def health_check(self, model: str | None) -> ProviderHealth:
        return ProviderHealth(self.provider_id, "healthy", model, None)


def generate_pdf_bytes() -> bytes:
    """Generate a valid binary PDF 1.4 with a text content stream."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        b"4 0 obj\n<< /Length 125 >>\nstream\n"
        b"BT\n/F1 14 Tf\n50 700 Td\n(Photosynthesis produces ATP and NADPH in the thylakoid membrane of chloroplasts.) Tj\nET\n"
        b"endstream\nendobj\n"
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        b"xref\n0 6\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000244 00000 n \n"
        b"0000000420 00000 n \n"
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n492\n%%EOF\n"
    )


def generate_docx_bytes() -> bytes:
    """Generate a valid DOCX file using python-docx."""
    import docx
    doc = docx.Document()
    doc.add_heading("Cellular Respiration and Glycolysis", level=1)
    doc.add_paragraph("Glycolysis breaks glucose down into pyruvate in the cytoplasm, yielding a net of 2 ATP.")
    doc.add_heading("The Krebs Cycle and Electron Transport", level=2)
    doc.add_paragraph("Oxidative phosphorylation generates 28 to 32 ATP using the electron transport chain and ATP synthase.")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def generate_txt_bytes() -> bytes:
    """Generate a plain text document."""
    text = (
        "Quantum Mechanics Fundamentals:\n\n"
        "Wave-particle duality states that matter and light exhibit behaviors of both waves and particles. "
        "The de Broglie wavelength connects momentum to wavelength via the formula lambda = h / p.\n\n"
        "Heisenberg's Uncertainty Principle dictates that the position and momentum of a particle cannot "
        "both be simultaneously measured with arbitrary precision. Delta x times Delta p >= hbar / 2."
    )
    return text.encode("utf-8")


def run_acceptance_audit():
    print("=" * 70)
    print("STARTING PLAN2LEARN AI STUDY NOTEBOOK ACCEPTANCE AUDIT")
    print("=" * 70)

    db = SessionLocal()

    # Wire up Fake AI provider for predictable grounded verification
    primary = FakeAuditProvider(
        ProviderId.OMNIROUTE,
        [
            # Chat response grounded in document
            '{"answer": "According to the course notes, the de Broglie wavelength is calculated using lambda = h / p, where h is Planck\'s constant and p is momentum."}',
            # Study tools responses
            '{"answer": "Explanation: Cellular respiration converts glucose into usable energy (ATP) through glycolysis, the Krebs cycle, and oxidative phosphorylation."}',
            '{"answer": "Summary: 1. Glycolysis yields 2 ATP in cytoplasm. 2. Oxidative phosphorylation yields 28-32 ATP via ATP synthase."}',
            '{"answer": "Revision Notes: Key enzymes include phosphofructokinase for glycolysis and ATP synthase for the electron transport chain."}',
            '{"answer": "1. Where does glycolysis occur? A) Cytoplasm B) Mitochondria C) Nucleus D) Ribosome. Correct: A."}',
            '{"answer": "Practice Question 1: Calculate the total theoretical ATP yield from complete aerobic oxidation of one glucose molecule."}',
        ],
    )
    fallback = FakeAuditProvider(ProviderId.GROQ, [])
    test_router = AIProviderRouter(
        AISettings(_env_file=None),
        {primary.provider_id: primary, fallback.provider_id: fallback},
    )
    app.dependency_overrides[get_ai_router] = lambda: test_router

    client = TestClient(app)

    try:
        # Setup test users
        email1 = "student_alpha@audit.local"
        email2 = "student_beta@audit.local"

        user1 = db.query(User).filter(User.email == email1).first()
        if not user1:
            user1 = User(
                email=email1,
                full_name="Student Alpha",
                hashed_password=hash_password("AuditPass123!"),
                is_active=True,
            )
            db.add(user1)
            db.flush()
            profile1 = StudentProfile(
                user_id=user1.id,
                education_level="College",
                board_curriculum="University",
                grade_class="Senior",
                target_subjects=["Physics", "Biology"],
                weak_topics=[],
                strong_topics=[],
                completed_topics=[],
                current_topics=[],
                daily_time_minutes=240,
                score_goal=90,
            )
            db.add(profile1)

        user2 = db.query(User).filter(User.email == email2).first()
        if not user2:
            user2 = User(
                email=email2,
                full_name="Student Beta",
                hashed_password=hash_password("AuditPass123!"),
                is_active=True,
            )
            db.add(user2)
            db.flush()
            profile2 = StudentProfile(
                user_id=user2.id,
                education_level="College",
                board_curriculum="University",
                grade_class="Junior",
                target_subjects=["History"],
                weak_topics=[],
                strong_topics=[],
                completed_topics=[],
                current_topics=[],
                daily_time_minutes=180,
                score_goal=85,
            )
            db.add(profile2)

        db.commit()

        token1 = create_access_token(data={"sub": str(user1.id)})
        token2 = create_access_token(data={"sub": str(user2.id)})

        client.cookies.set("access_token", token1)
        headers1 = {"Authorization": f"Bearer {token1}"}
        headers2 = {"Authorization": f"Bearer {token2}"}

        print("\n[STEP 1] Create Notebook for User 1...")
        r = client.post(
            "/api/v1/ai/notebooks",
            json={"title": "Physics & Biology Audit Notebook", "subject": "Sciences"},
            headers=headers1,
        )
        assert r.status_code == 201, f"Failed to create notebook: {r.text}"
        nb1 = r.json()
        nb1_id = nb1["id"]
        print(f"  -> Created notebook {nb1_id} ('{nb1['title']}')")

        # ---------------------------------------------------------
        # Document Ingestion: TXT
        # ---------------------------------------------------------
        print("\n[STEP 2A] Test Real TXT Ingestion...")
        txt_bytes = generate_txt_bytes()
        r = client.post(
            "/api/v1/ai/sources/upload",
            files={"file": ("quantum_mechanics.txt", io.BytesIO(txt_bytes), "text/plain")},
            data={"notebook_id": nb1_id, "origin": "upload"},
            headers=headers1,
        )
        assert r.status_code == 200, f"TXT upload failed: {r.text}"
        txt_res = r.json()
        assert txt_res["success"] is True
        txt_source = txt_res["source"]
        txt_chunks = txt_source.get("meta_info", {}).get("chunk_count", 0)
        assert txt_source["status"] == "ready", f"TXT status should be ready, got {txt_source['status']}"
        assert txt_chunks > 0, "TXT should have extracted chunks"
        print(f"  -> TXT Ingested: id={txt_source['id']}, chunks={txt_chunks}, status={txt_source['status']}")

        # ---------------------------------------------------------
        # Document Ingestion: DOCX
        # ---------------------------------------------------------
        print("\n[STEP 2B] Test Real DOCX Ingestion...")
        docx_bytes = generate_docx_bytes()
        r = client.post(
            "/api/v1/ai/sources/upload",
            files={"file": ("respiration_guide.docx", io.BytesIO(docx_bytes), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            data={"notebook_id": nb1_id, "origin": "upload"},
            headers=headers1,
        )
        assert r.status_code == 200, f"DOCX upload failed: {r.text}"
        docx_res = r.json()
        assert docx_res["success"] is True
        docx_source = docx_res["source"]
        docx_chunks = docx_source.get("meta_info", {}).get("chunk_count", 0)
        assert docx_source["status"] == "ready", f"DOCX status should be ready, got {docx_source['status']}"
        assert docx_chunks > 0, "DOCX should have extracted chunks"
        print(f"  -> DOCX Ingested: id={docx_source['id']}, chunks={docx_chunks}, status={docx_source['status']}")

        # ---------------------------------------------------------
        # Document Ingestion: PDF
        # ---------------------------------------------------------
        print("\n[STEP 2C] Test Real PDF Ingestion...")
        pdf_bytes = generate_pdf_bytes()
        r = client.post(
            "/api/v1/ai/sources/upload",
            files={"file": ("cell_biology.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={"notebook_id": nb1_id, "origin": "upload"},
            headers=headers1,
        )
        assert r.status_code == 200, f"PDF upload failed: {r.text}"
        pdf_res = r.json()
        assert pdf_res["success"] is True
        pdf_source = pdf_res["source"]
        pdf_chunks = pdf_source.get("meta_info", {}).get("chunk_count", 0)
        assert pdf_source["status"] == "ready", f"PDF status should be ready, got {pdf_source['status']}"
        assert pdf_chunks > 0, "PDF should have extracted chunks"
        print(f"  -> PDF Ingested: id={pdf_source['id']}, chunks={pdf_chunks}, status={pdf_source['status']}")

        # ---------------------------------------------------------
        # Corrupted File Handling
        # ---------------------------------------------------------
        print("\n[STEP 2D] Test Corrupted File Handling...")
        corrupt_bytes = b"%PDF-1.4\nInvalid non-decodable bytes \xff\xfe\x00\x01\x02 corrupted header"
        r = client.post(
            "/api/v1/ai/sources/upload",
            files={"file": ("corrupt_lecture.pdf", io.BytesIO(corrupt_bytes), "application/pdf")},
            data={"notebook_id": nb1_id, "origin": "upload"},
            headers=headers1,
        )
        assert r.status_code == 422, f"Upload should return 422 for corrupt file: {r.text}"
        corrupt_rec = db.query(Source).filter(Source.notebook_id == nb1_id, Source.title == "corrupt_lecture.pdf").first()
        assert corrupt_rec is not None
        assert corrupt_rec.status == "failed", f"Corrupt file MUST be 'failed', got {corrupt_rec.status}"
        print(f"  -> Corrupted file correctly rejected with HTTP 422 and recorded with status='failed' (NOT 'ready'). Error: '{corrupt_rec.error_message}'")

        # ---------------------------------------------------------
        # Unsupported Extension Handling
        # ---------------------------------------------------------
        print("\n[STEP 2E] Test Unsupported Extension Handling...")
        unsupported_bytes = b"echo 'unsupported binary'"
        r = client.post(
            "/api/v1/ai/sources/upload",
            files={"file": ("malicious.sh", io.BytesIO(unsupported_bytes), "application/x-sh")},
            data={"notebook_id": nb1_id, "origin": "upload"},
            headers=headers1,
        )
        assert r.status_code == 422, f"Unsupported extension should be 422, got {r.status_code}"
        print("  -> Unsupported extension (.sh) correctly rejected with HTTP 422")

        # ---------------------------------------------------------
        # Persistence & Page Reload Behavior
        # ---------------------------------------------------------
        print("\n[STEP 2F] Verify Database Persistence & Page Reload...")
        r = client.get(f"/api/v1/ai/sources/list/{nb1_id}", headers=headers1)
        assert r.status_code == 200
        sources_list = r.json()
        filenames = [s["title"] for s in sources_list]
        assert "quantum_mechanics.txt" in filenames
        assert "respiration_guide.docx" in filenames
        assert "cell_biology.pdf" in filenames
        assert "corrupt_lecture.pdf" in filenames
        print(f"  -> All {len(sources_list)} sources successfully retrieved from database on reload")

        # ---------------------------------------------------------
        # Grounded Q&A with Citations & Source Toggle
        # ---------------------------------------------------------
        print("\n[STEP 3] Verify Grounded Chat & Citations...")
        question = "What is the formula for the de Broglie wavelength?"
        r = client.post(
            "/api/v1/ai/chat",
            json={
                "message": question,
                "notebook_id": nb1_id,
                "response_style": "friendly",
            },
            headers=headers1,
        )
        assert r.status_code == 200, f"Chat request failed: {r.text}"
        chat_data = r.json()
        assert chat_data["success"] is True
        assert "citations" in chat_data
        citations = chat_data["citations"]
        assert len(citations) > 0, "Grounded response must include citations from selected notebook sources"
        print(f"  -> Chat succeeded with {len(citations)} citations:")
        for c in citations:
            print(f"     * Source: '{c['source_title']}', passage snippet: '{c['passage'][:65]}...'")

        # ---------------------------------------------------------
        # Study Tools End-to-End
        # ---------------------------------------------------------
        print("\n[STEP 4] Verify Grounded Study Tools...")
        tools = [
            ("explain", "/api/v1/ai/study-tool/explain", {"notebook_id": nb1_id, "topic": "Cellular Respiration"}),
            ("summarize", "/api/v1/ai/study-tool/summarize", {"notebook_id": nb1_id, "topic": "Glycolysis"}),
            ("revision_notes", "/api/v1/ai/study-tool/revision-notes", {"notebook_id": nb1_id, "topic": "Bioenergetics"}),
            ("mcqs", "/api/v1/ai/study-tool/mcqs", {"notebook_id": nb1_id, "topic": "Cellular Respiration"}),
            ("practice_questions", "/api/v1/ai/study-tool/practice-questions", {"notebook_id": nb1_id, "topic": "Oxidative Phosphorylation"}),
        ]
        last_tool_content = ""
        for tool_name, endpoint, payload in tools:
            r = client.post(endpoint, json=payload, headers=headers1)
            assert r.status_code == 200, f"Study tool '{tool_name}' failed: {r.text}"
            res = r.json()
            assert res["success"] is True
            assert len(res["content"]) > 10
            last_tool_content = res["content"]
            print(f"  -> Tool '{tool_name}' returned valid output ({len(res['content'])} chars)")

        # ---------------------------------------------------------
        # Save to Notes and Persistence
        # ---------------------------------------------------------
        print("\n[STEP 5] Verify Save Note to Database & Retrieval...")
        r = client.post(
            "/api/v1/ai/study-tool/save-note",
            json={
                "notebook_id": nb1_id,
                "title": "Bioenergetics Practice & Summary",
                "content": last_tool_content,
            },
            headers=headers1,
        )
        assert r.status_code in (200, 201), f"Save note failed: {r.text}"
        saved_note_id = r.json()["note_id"]
        print(f"  -> Saved note id: {saved_note_id}")

        # Verify persisted notes list
        r = client.get(f"/api/v1/ai/notes/{nb1_id}", headers=headers1)
        assert r.status_code == 200
        notes = r.json()
        assert len(notes) >= 1
        assert any(n["id"] == saved_note_id for n in notes)
        print(f"  -> Successfully loaded {len(notes)} notes from database for notebook {nb1_id}")

        # ---------------------------------------------------------
        # Security & Isolation Checks
        # ---------------------------------------------------------
        print("\n[STEP 6] Verify Security Ownership & Notebook Isolation...")
        # User 2 tries to access User 1's notebook sources
        client.cookies.set("access_token", token2)
        r = client.get(f"/api/v1/ai/sources/list/{nb1_id}", headers=headers2)
        assert r.status_code == 404, f"Cross-user source access must be 404, got {r.status_code}"

        # User 2 tries to access User 1's notes
        r = client.get(f"/api/v1/ai/notes/{nb1_id}", headers=headers2)
        assert r.status_code == 404, f"Cross-user note access must be 404, got {r.status_code}"

        # User 2 tries to run study tool on User 1's notebook
        r = client.post(
            "/api/v1/ai/study-tool/explain",
            json={"notebook_id": nb1_id, "topic": "Unauthorized Attempt"},
            headers=headers2,
        )
        assert r.status_code == 404, f"Cross-user study tool must be 404, got {r.status_code}"
        print("  -> Security Verified: Unauthorized user strictly receives HTTP 404 for alien notebooks, sources, and notes")

        # Intra-user isolation: User 1 creates Notebook 2
        client.cookies.set("access_token", token1)
        r = client.post(
            "/api/v1/ai/notebooks",
            json={"title": "World History Notebook", "subject": "History"},
            headers=headers1,
        )
        nb2_id = r.json()["id"]
        r = client.get(f"/api/v1/ai/sources/list/{nb2_id}", headers=headers1)
        assert r.status_code == 200
        assert len(r.json()) == 0, "New notebook must have 0 sources; sources from other notebooks must NOT leak"
        print(f"  -> Isolation Verified: Notebook 2 starts with 0 sources, unaffected by Notebook 1")

        # ---------------------------------------------------------
        # External Integrations: Google Drive & YouTube
        # ---------------------------------------------------------
        print("\n[STEP 7] Verify External Integrations...")
        r = client.get("/api/v1/ai/drive/status", headers=headers1)
        assert r.status_code == 200
        drive_data = r.json()
        print(f"  -> Google Drive: connected={drive_data.get('connected')}, configured={drive_data.get('configured')}, message='{drive_data.get('message')}'")
        assert not drive_data.get("connected"), "Without credentials, Google Drive must report connected=False"

        r = client.get("/api/v1/ai/youtube/search?query=photosynthesis", headers=headers1)
        assert r.status_code == 200
        yt_data = r.json()
        print(f"  -> YouTube Search: query='{yt_data.get('query')}', results count={len(yt_data.get('results', []))}")

        print("\n" + "=" * 70)
        print("ALL ACCEPTANCE AUDIT TESTS PASSED WITH 100% SUCCESS!")
        print("=" * 70)

    finally:
        app.dependency_overrides.clear()
        db.close()


if __name__ == "__main__":
    run_acceptance_audit()
