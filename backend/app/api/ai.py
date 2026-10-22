import json
import logging
import os
import re
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.config import get_ai_settings
from app.ai.contracts import (
    AIMessage,
    AIRequest,
    AITaskType,
    MessageRole,
    ProviderId,
)
from app.ai.errors import AIUnavailableError
from app.ai.router import AIProviderRouter
from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.ai import AIConversation, AIMessage as AIMessageModel, ConversationSource
from app.models.notebook import Notebook, NotebookNote, Source, SourceChunk
from app.models.user import Exam, StudentProfile, User
from app.schemas.ai import (
    AIChatRequest,
    AIChatResponse,
    AIConversationHistoryResponse,
    AIConversationListResponse,
    ConversationCreateRequest,
    ConversationUpdateRequest,
    ConversationOut,
    MissingInformation,
    StructuredAcademicContextUpdate,
    StructuredProfileUpdate,
)
from app.services.document_extractor import (
    detect_source_type,
    extract_content_from_url,
    extract_text,
    safe_fetch_url,
    score_chunks_for_query,
    validate_public_url,
    validate_upload,
    _normalize_text,
    _split_into_chunks,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


class ProfileExtractionResponse(BaseModel):
    profile_updates: StructuredProfileUpdate | None = None
    academic_context_updates: StructuredAcademicContextUpdate | None = None
    missing_information: MissingInformation | None = None
    next_question: str | None = None
    confidence: float = 0.0


# Source management models
class SourceUploadRequest(BaseModel):
    notebook_id: str
    origin: str = "upload"  # upload, folder, google_drive, url, youtube


class UrlImportRequest(BaseModel):
    url: str = Field(..., min_length=4)
    notebook_id: str | None = None
    conversation_id: str | None = None


class YouTubeSaveRequest(BaseModel):
    video_id: str = Field(..., min_length=1)
    notebook_id: str | None = None
    conversation_id: str | None = None
    title: str = Field(..., min_length=1)
    channel: str = Field(default="")
    thumbnail: str | None = None
    url: str | None = None
    description: str | None = None


class PasteTranscriptRequest(BaseModel):
    transcript_text: str = Field(..., min_length=10)


class SourceUploadResponse(BaseModel):
    success: bool
    source: dict[str, Any]
    message: str
    transcript_status: str | None = None
    chunks_indexed: int | None = None


class SourceListItem(BaseModel):
    id: str
    title: str
    source_type: str
    origin: str
    file_size: int
    page_count: int | None
    status: str
    is_selected: bool
    meta_info: dict[str, Any] | None
    created_at: str | datetime


UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_or_create_default_notebook(user_id: str, db: Session) -> Notebook:
    notebook = (
        db.query(Notebook)
        .filter(Notebook.user_id == user_id)
        .order_by(Notebook.created_at.asc())
        .first()
    )
    if not notebook:
        notebook = Notebook(
            user_id=user_id,
            title="Personal Study Notebook",
            description="Default notebook for study notes and sources.",
        )
        db.add(notebook)
        db.commit()
        db.refresh(notebook)
    return notebook


def generate_conversation_title(first_message: str) -> str:
    """Generate a clean, readable 3-6 word title from the user's first message."""
    clean = re.sub(r'[\r\n\t]+', ' ', first_message).strip()
    prefixes = [
        r'^(can you\s+)?(please\s+)?(explain|tell me about|what is|how to|help me with|help me plan|write a|solve|summarize|give me|create a|debug this|debug|show me)\s+(the\s+)?',
        r'^(i want to|i need to|could you|would you)\s+',
    ]
    candidate = clean
    for pat in prefixes:
        candidate = re.sub(pat, '', candidate, flags=re.IGNORECASE).strip()

    words = candidate.split()
    if len(words) > 6:
        candidate = " ".join(words[:6])

    candidate = re.sub(r'[?.!,;:]+$', '', candidate).strip()
    if len(candidate) < 3:
        candidate = " ".join(clean.split()[:5])
        candidate = re.sub(r'[?.!,;:]+$', '', candidate).strip()

    title = candidate[:60].strip()
    if title:
        title = " ".join(w[0].upper() + w[1:] if len(w) > 1 else w.upper() for w in title.split())
    return title or "New Conversation"


# Source router for management endpoints
source_router = APIRouter(prefix="/sources", tags=["ai-sources"])


@source_router.post("/upload", response_model=SourceUploadResponse, status_code=status.HTTP_200_OK)
async def upload_source(
    file: UploadFile = File(...),
    notebook_id: str | None = Form(None),
    conversation_id: str | None = Form(None),
    origin: str = Form("upload"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SourceUploadResponse:
    """Handle source file upload, text extraction, safe disk storage, and conversation association."""
    # Resolve conversation and notebook context
    conversation = None
    if conversation_id:
        conversation = (
            db.query(AIConversation)
            .filter(AIConversation.id == conversation_id, AIConversation.user_id == current_user.id)
            .first()
        )
        if not conversation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
        if not notebook_id and conversation.notebook_id:
            notebook_id = conversation.notebook_id

    if notebook_id:
        notebook = (
            db.query(Notebook)
            .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
            .first()
        )
        if not notebook:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notebook not found.",
            )
    else:
        notebook = get_or_create_default_notebook(current_user.id, db)
        notebook_id = notebook.id

    if conversation and not conversation.notebook_id:
        conversation.notebook_id = notebook_id

    # Read file content
    content = await file.read()
    filename = file.filename or "uploaded_file"
    file_size = len(content)

    # Validate file before processing
    validation_error = validate_upload(filename, content, file.content_type)
    if validation_error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=validation_error,
        )

    source_type = detect_source_type(filename)

    # Check for duplicate: same filename + user + notebook already processed
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
            existing_assoc = (
                db.query(ConversationSource)
                .filter(
                    ConversationSource.conversation_id == conversation.id,
                    ConversationSource.source_id == existing.id,
                )
                .first()
            )
            if not existing_assoc:
                db.add(ConversationSource(
                    conversation_id=conversation.id,
                    source_id=existing.id,
                    is_selected=True,
                ))
                db.commit()
        return SourceUploadResponse(
            success=True,
            source={
                "id": existing.id,
                "title": existing.title,
                "source_type": existing.source_type,
                "origin": existing.origin,
                "file_size": existing.file_size,
                "page_count": existing.page_count,
                "status": existing.status,
                "is_selected": existing.is_selected,
                "meta_info": existing.meta_info,
                "created_at": existing.created_at,
            },
            message=f"Source '{filename}' already exists and is ready.",
        )

    # Create source record in processing state
    source = Source(
        notebook_id=notebook_id,
        user_id=current_user.id,
        title=filename,
        source_type=source_type,
        origin=origin,
        file_size=file_size,
        file_path=filename,
        status="processing",
        meta_info={"original_filename": filename},
    )
    db.add(source)
    db.flush()  # assigns source.id

    # Safely persist physical file to disk storage
    try:
        user_upload_dir = os.path.join(UPLOAD_DIR, current_user.id)
        os.makedirs(user_upload_dir, exist_ok=True)
        safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
        disk_filepath = os.path.join(user_upload_dir, f"{source.id}_{safe_name}")
        with open(disk_filepath, "wb") as f_out:
            f_out.write(content)
        source.file_path = disk_filepath
    except Exception as io_err:
        logger.warning(f"Could not persist upload to physical disk: {io_err}")

    # Perform real text extraction
    result = extract_text(filename, content)

    if not result.success:
        source.status = "failed"
        source.error_message = result.error or "Unknown extraction error."
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.error or "Failed to extract text from the uploaded file.",
        )

    # Persist chunks
    db_chunks = [
        SourceChunk(
            source_id=source.id,
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            page_number=chunk.page_number,
            section_title=chunk.section_title,
        )
        for chunk in result.chunks
    ]
    db.add_all(db_chunks)
    source.status = "ready"
    source.page_count = result.page_count
    source.meta_info = {
        "original_filename": filename,
        "chunk_count": len(result.chunks),
    }

    # Associate with conversation if specified
    if conversation:
        db.add(ConversationSource(
            conversation_id=conversation.id,
            source_id=source.id,
            is_selected=True,
        ))

    db.commit()

    return SourceUploadResponse(
        success=True,
        source={
            "id": source.id,
            "title": source.title,
            "source_type": source.source_type,
            "origin": source.origin,
            "file_size": source.file_size,
            "page_count": source.page_count,
            "status": source.status,
            "is_selected": source.is_selected,
            "meta_info": source.meta_info,
            "created_at": source.created_at,
        },
        message=f"Source '{filename}' uploaded and indexed ({len(result.chunks)} chunks).",
    )


@source_router.post("/import-url", response_model=SourceUploadResponse, status_code=status.HTTP_200_OK)
async def import_url_source(
    payload: UrlImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SourceUploadResponse:
    """Validate, fetch, extract, and chunk content from a public URL with SSRF protection."""
    # Resolve conversation and notebook
    conversation = None
    notebook_id = payload.notebook_id
    if payload.conversation_id:
        conversation = (
            db.query(AIConversation)
            .filter(AIConversation.id == payload.conversation_id, AIConversation.user_id == current_user.id)
            .first()
        )
        if not conversation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
        if not notebook_id and conversation.notebook_id:
            notebook_id = conversation.notebook_id

    if notebook_id:
        notebook = (
            db.query(Notebook)
            .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
            .first()
        )
        if not notebook:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found.")
    else:
        notebook = get_or_create_default_notebook(current_user.id, db)
        notebook_id = notebook.id

    if conversation and not conversation.notebook_id:
        conversation.notebook_id = notebook_id

    # 1. SSRF and protocol validation
    is_valid, resolved_ip, error_msg = validate_public_url(payload.url)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=error_msg or "URL failed security validation.",
        )

    clean_url = payload.url.strip()

    # Check for existing duplicate ready source with same URL in this notebook
    existing = (
        db.query(Source)
        .filter(
            Source.notebook_id == notebook_id,
            Source.user_id == current_user.id,
            Source.file_path == clean_url,
            Source.status == "ready",
        )
        .first()
    )
    if existing:
        if conversation:
            existing_assoc = (
                db.query(ConversationSource)
                .filter(
                    ConversationSource.conversation_id == conversation.id,
                    ConversationSource.source_id == existing.id,
                )
                .first()
            )
            if not existing_assoc:
                db.add(ConversationSource(
                    conversation_id=conversation.id,
                    source_id=existing.id,
                    is_selected=True,
                ))
                db.commit()
        return SourceUploadResponse(
            success=True,
            source={
                "id": existing.id,
                "title": existing.title,
                "source_type": existing.source_type,
                "origin": existing.origin,
                "file_size": existing.file_size,
                "page_count": existing.page_count,
                "status": existing.status,
                "is_selected": existing.is_selected,
                "meta_info": existing.meta_info,
                "created_at": existing.created_at,
            },
            message=f"URL source '{existing.title}' is already indexed in this notebook.",
        )

    # Create source in processing state
    source = Source(
        notebook_id=notebook_id,
        user_id=current_user.id,
        title=clean_url[:255],
        source_type="url",
        origin="url",
        file_path=clean_url[:500],
        file_size=0,
        status="processing",
        meta_info={"url": clean_url},
    )
    db.add(source)
    db.flush()

    # 2. Fetch URL content with redirect SSRF protection
    try:
        content_bytes, content_type, final_url = await safe_fetch_url(clean_url)
    except ValueError as fetch_err:
        source.status = "failed"
        source.error_message = str(fetch_err)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to fetch URL: {fetch_err}",
        )

    # 3. Extract text content
    result, page_title = extract_content_from_url(final_url, content_bytes, content_type)
    if not result.success:
        source.status = "failed"
        source.error_message = result.error or "Failed to extract text from URL."
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.error or "No extractable text content found at this URL.",
        )

    # 4. Save chunks
    db_chunks = [
        SourceChunk(
            source_id=source.id,
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            page_number=chunk.page_number,
            section_title=(chunk.section_title or page_title)[:255],
        )
        for chunk in result.chunks
    ]
    db.add_all(db_chunks)

    source.title = (page_title or clean_url)[:255]
    source.status = "ready"
    source.file_size = len(content_bytes)
    source.page_count = result.page_count
    source.meta_info = {
        "url": final_url,
        "title": page_title,
        "chunk_count": len(result.chunks),
    }

    if conversation:
        db.add(ConversationSource(
            conversation_id=conversation.id,
            source_id=source.id,
            is_selected=True,
        ))

    db.commit()
    db.refresh(source)

    return SourceUploadResponse(
        success=True,
        source={
            "id": source.id,
            "title": source.title,
            "source_type": source.source_type,
            "origin": source.origin,
            "file_size": source.file_size,
            "page_count": source.page_count,
            "status": source.status,
            "is_selected": source.is_selected,
            "meta_info": source.meta_info,
            "created_at": source.created_at,
        },
        message=f"URL '{source.title}' imported and indexed ({len(result.chunks)} chunks).",
        chunks_indexed=len(result.chunks),
    )


@source_router.post("/{source_id}/paste-transcript", response_model=SourceUploadResponse, status_code=status.HTTP_200_OK)
async def paste_source_transcript(
    source_id: str,
    payload: PasteTranscriptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SourceUploadResponse:
    """Manually add transcript text to a YouTube or video source."""
    source = (
        db.query(Source)
        .filter(Source.id == source_id, Source.user_id == current_user.id)
        .first()
    )
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found.",
        )

    cleaned_text = _normalize_text(payload.transcript_text)
    if len(cleaned_text) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Transcript text is too short to be processed.",
        )

    chunks = _split_into_chunks(cleaned_text, section_title="Manual Transcript")
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not segment transcript into chunks.",
        )

    # Delete existing chunks if any
    db.query(SourceChunk).filter(SourceChunk.source_id == source.id).delete()

    db_chunks = [
        SourceChunk(
            source_id=source.id,
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            section_title=(chunk.section_title or "Transcript")[:255],
        )
        for chunk in chunks
    ]
    db.add_all(db_chunks)

    meta = dict(source.meta_info or {})
    meta["transcript_available"] = True
    meta["chunk_count"] = len(chunks)
    source.meta_info = meta
    source.status = "ready"
    source.file_size = len(cleaned_text)
    source.error_message = None
    db.commit()
    db.refresh(source)

    return SourceUploadResponse(
        success=True,
        source={
            "id": source.id,
            "title": source.title,
            "source_type": source.source_type,
            "origin": source.origin,
            "file_size": source.file_size,
            "page_count": source.page_count,
            "status": source.status,
            "is_selected": source.is_selected,
            "meta_info": source.meta_info,
            "created_at": source.created_at,
        },
        message=f"Transcript saved and indexed ({len(chunks)} passages). Source is ready for AI grounding.",
        chunks_indexed=len(chunks),
    )


@source_router.get("/list/{notebook_id}", response_model=list[SourceListItem])
async def list_sources(
    notebook_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SourceListItem]:
    """List all sources for a notebook."""
    # Validate ownership
    notebook = (
        db.query(Notebook)
        .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
        .first()
    )
    if not notebook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notebook not found.",
        )

    sources = (
        db.query(Source)
        .filter(Source.notebook_id == notebook_id, Source.user_id == current_user.id)
        .order_by(Source.created_at.desc())
        .all()
    )

    return [
        SourceListItem(
            id=s.id,
            title=s.title,
            source_type=s.source_type,
            origin=s.origin,
            file_size=s.file_size,
            page_count=s.page_count,
            status=s.status,
            is_selected=s.is_selected,
            meta_info=s.meta_info or {},
            created_at=s.created_at,
        )
        for s in sources
    ]


@source_router.delete("/{source_id}", status_code=status.HTTP_200_OK)
async def remove_source(
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Remove a source and its associated data."""
    source = (
        db.query(Source)
        .filter(Source.id == source_id)
        .filter(Source.user_id == current_user.id)
        .first()
    )
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found.",
        )

    notebook_id = source.notebook_id

    # Delete source (cascade will delete chunks and notes)
    db.delete(source)
    db.commit()

    return {"detail": "Source removed successfully."}


@router.post("/set-response-style", status_code=status.HTTP_200_OK)
async def set_response_style(
    payload: dict[str, str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Update the response style for the current active conversation."""
    style = payload.get("style", "friendly")  # "friendly" or "strict"

    # Find the most recently active conversation for this user
    conversation = (
        db.query(AIConversation)
        .filter(AIConversation.user_id == current_user.id)
        .order_by(AIConversation.last_active_at.desc())
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No conversations found.",
        )

    conversation.response_style = style
    db.commit()

    return {"style": style, "response_style": style, "detail": "Response style updated successfully."}




async def get_ai_router() -> AIProviderRouter:
    settings = get_ai_settings()
    return AIProviderRouter(settings)


def build_system_prompt(
    profile: StudentProfile | None,
    response_style: str = "friendly",
    include_extraction_instructions: bool = True,
    include_study_planning_context: bool = False,
) -> str:
    base_prompt = (
        "You are the AI assistant integrated into Smart Learning Planner. "
        "You help users think, learn, create, and get things done across a wide range of tasks. "
        "Your capabilities include answering questions, explaining concepts, writing and editing, "
        "coding and debugging, research and analysis, planning and organization, and learning support. "
        "When the user is a student, you can also help with study planning, practice questions, and revision. "
        "Adapt your responses to the user's request, goals, preferred level of detail, and available context. "
        "Do not assume the user's age, profession, academic level, or goals unless they provide that information. "
        "Be clear, helpful, and honest about limitations. Format responses with clean Markdown when appropriate."
    )

    # Response style configuration
    if response_style == "strict":
        base_prompt += "\n\n--- Response Style: Strict Coach ---"
        base_prompt += (
            "\nYou are in Strict Coach mode. Be direct, structured, disciplined, and action-oriented. "
            "Give honest feedback about incomplete work or weak understanding. Break goals into concrete actions. "
            "Encourage accountability and consistent habits. Avoid unnecessary praise when corrective feedback is needed. "
            "Never insult, threaten, humiliate, or deliberately shame the user. Be firm but fair."
        )
    else:
        base_prompt += "\n\n--- Response Style: Friendly Mentor ---"
        base_prompt += (
            "\nYou are in Friendly Mentor mode. Be warm, supportive, and approachable. "
            "Explain concepts step by step with clear examples and simple language. "
            "Encourage questions without making the user feel embarrassed. Offer small, achievable next steps. "
            "Support a friendly learning environment while remaining honest about uncertainty."
        )

    if profile:
        # Include user profile context when available, but don't assume it defines the user's only goals
        context_parts = []
        if profile.education_level:
            context_parts.append(f"Education Level: {profile.education_level}")
        if profile.board_curriculum:
            context_parts.append(f"Board/Curriculum: {profile.board_curriculum}")
        if profile.grade_class:
            context_parts.append(f"Grade/Class: {profile.grade_class}")
        if profile.target_subjects:
            context_parts.append(f"Target Subjects: {', '.join(profile.target_subjects)}")
        if profile.weak_topics:
            context_parts.append(f"Weak Topics: {', '.join(profile.weak_topics)}")
        if profile.strong_topics:
            context_parts.append(f"Strong Topics: {', '.join(profile.strong_topics)}")
        if profile.completed_topics:
            context_parts.append(f"Completed Topics: {', '.join(profile.completed_topics)}")
        if profile.current_topics:
            context_parts.append(f"Current Topics: {', '.join(profile.current_topics)}")
        if profile.goals:
            context_parts.append(f"Goals: {', '.join(profile.goals)}")
        if profile.constraints:
            context_parts.append(f"Constraints: {', '.join(profile.constraints)}")
        if profile.preferences:
            context_parts.append(f"Preferences: {profile.preferences}")

        # Only include study-planning-specific fields when explicitly requested
        if include_study_planning_context:
            if profile.planning_preferences:
                context_parts.append(f"Planning Preferences: {profile.planning_preferences}")
            if profile.daily_time_minutes:
                context_parts.append(f"Daily Study Time: {profile.daily_time_minutes} minutes")
            if profile.exam_date:
                context_parts.append(f"Exam Date: {profile.exam_date}")
            if profile.score_goal:
                context_parts.append(f"Score Goal: {profile.score_goal}%")
            if profile.study_routine:
                context_parts.append(f"Study Routine: {profile.study_routine}")

        if context_parts:
            base_prompt += "\n\nUser Profile Context (for personalization, not assumption):\n" + "\n".join(context_parts)

    if include_extraction_instructions:
        base_prompt += (
            "\n\nYou must respond with a JSON object matching the ProfileExtractionResponse schema. "
            "Include your conversational response in the 'next_question' field (or provide a natural response there). "
            "Extract any structured profile updates you can infer. "
            "Identify missing information and suggest the next question to ask. "
            "Rate your confidence in the extracted information (0.0 to 1.0)."
        )
    else:
        base_prompt += (
            "\n\nProvide clear, comprehensive answers adapted to the user's request. "
            "Format your response with clean Markdown (headings, bullet points) where appropriate. "
            "Do not ask the user to choose a study-plan approach unless they explicitly request help creating a study plan "
            "and the choice is genuinely useful for their stated goal."
        )

    return base_prompt


GROUNDING_STOPWORDS = {
    "and", "the", "for", "with", "from", "that", "this", "what", "how",
    "can", "you", "tell", "explain", "about", "are", "was", "were", "been",
    "has", "have", "had", "will", "would", "should", "could", "give", "help",
    "more", "some", "which", "when", "where", "who", "why", "into", "onto",
    "does", "doing", "please",
}


def rank_and_score_sources(
    sources: list[Source],
    query: str,
    db: Any,
    top_k_per_source: int = 4,
    max_total_chunks: int = 10,
    max_total_chars: int = 15000,
) -> list[dict[str, Any]]:
    """Score and package chunks across a list of sources for grounded answering."""
    if not sources:
        return []

    # Extract non-stopword query terms for scoring
    raw_terms = set(re.findall(r"\b\w{3,}\b", query.lower())) if query else set()
    query_terms = raw_terms - GROUNDING_STOPWORDS
    if not query_terms:
        query_terms = raw_terms

    # Collect all chunks across all active sources
    source_chunk_map: dict[str, list[Any]] = {}
    scored_items: list[tuple[float, int, Source, Any]] = []

    for source in sources:
        all_chunks = (
            db.query(SourceChunk)
            .filter(SourceChunk.source_id == source.id)
            .order_by(SourceChunk.chunk_index)
            .all()
        )
        source_chunk_map[source.id] = all_chunks

        for chunk in all_chunks:
            text = (chunk.content or "").lower()
            words = re.findall(r"\b\w{3,}\b", text)
            if not words:
                score = 0.0
            elif query_terms:
                term_freq = sum(words.count(term) for term in query_terms)
                score = term_freq / len(words)
            else:
                score = 0.0
            scored_items.append((score, chunk.chunk_index, source, chunk))

    has_positive_matches = any(score > 0 for score, _, _, _ in scored_items)
    selected_chunks_by_source: dict[str, list[Any]] = {s.id: [] for s in sources}
    current_chars = 0
    total_selected = 0

    if has_positive_matches:
        scored_items.sort(key=lambda x: (x[0], -x[1]), reverse=True)
        for score, _, source, chunk in scored_items:
            if score <= 0.0 and total_selected >= 2:
                break
            if len(selected_chunks_by_source[source.id]) >= top_k_per_source:
                continue
            chunk_len = len(chunk.content or "")
            if total_selected >= max_total_chunks or (current_chars + chunk_len > max_total_chars and total_selected >= 2):
                break
            selected_chunks_by_source[source.id].append(chunk)
            current_chars += chunk_len
            total_selected += 1
    else:
        for chunk_idx in range(top_k_per_source):
            if total_selected >= max_total_chunks or current_chars >= max_total_chars:
                break
            for source in sources:
                chunks = source_chunk_map.get(source.id, [])
                if chunk_idx < len(chunks):
                    chunk = chunks[chunk_idx]
                    chunk_len = len(chunk.content or "")
                    if total_selected >= max_total_chunks or (current_chars + chunk_len > max_total_chars and total_selected >= 2):
                        break
                    selected_chunks_by_source[source.id].append(chunk)
                    current_chars += chunk_len
                    total_selected += 1

    result = []
    for source in sources:
        chosen_chunks = selected_chunks_by_source.get(source.id, [])
        if not chosen_chunks:
            if has_positive_matches:
                continue
            if len(sources) == 1:
                result.append(
                    {
                        "source_id": source.id,
                        "title": source.title,
                        "source_type": source.source_type,
                        "chunks": ["(no extracted content)"],
                    }
                )
            continue

        chosen_chunks.sort(key=lambda c: c.chunk_index)
        chunk_texts = []
        for chunk in chosen_chunks:
            part = chunk.content
            if chunk.page_number is not None:
                part += f" (page {chunk.page_number})"
            if chunk.section_title:
                part += f" [{chunk.section_title}]"
            chunk_texts.append(part)

        result.append(
            {
                "source_id": source.id,
                "title": source.title,
                "source_type": source.source_type,
                "chunks": chunk_texts,
            }
        )

    if not result and sources:
        first_source = sources[0]
        chunks = source_chunk_map.get(first_source.id, [])
        chunk_texts = [chunks[0].content] if chunks else ["(no extracted content)"]
        result.append(
            {
                "source_id": first_source.id,
                "title": first_source.title,
                "source_type": first_source.source_type,
                "chunks": chunk_texts,
            }
        )

    return result


def get_notebook_sources(
    notebook_id: str | None,
    user_id: str,
    db: Any,
    query: str = "",
    top_k_per_source: int = 4,
    max_total_chunks: int = 10,
    max_total_chars: int = 15000,
) -> list[dict[str, Any]]:
    """Retrieve sources and relevant chunks for a notebook with cross-source ranking."""
    if not notebook_id:
        return []

    sources = (
        db.query(Source)
        .filter(
            Source.notebook_id == notebook_id,
            Source.user_id == user_id,
            Source.status == "ready",
            Source.is_selected.is_(True),
        )
        .all()
    )

    return rank_and_score_sources(
        sources, query, db, top_k_per_source, max_total_chunks, max_total_chars
    )


def build_grounded_prompt(
    message: str, sources: list[dict[str, Any]], response_style: str = "friendly"
) -> str:
    """Build a prompt that includes source context for grounded answering."""

    style_prefix = ""
    if response_style == "strict":
        style_prefix = (
            "You are in Strict Coach mode. Be direct, structured, and action-oriented. "
            "Give honest feedback and break goals into concrete actions. "
            "Never insult, threaten, humiliate, or shame the user.\n"
        )
    else:
        style_prefix = (
            "You are in Friendly Mentor mode. Be warm, supportive, and approachable. "
            "Explain concepts step by step with clear examples and simple language. "
            "Encourage questions and offer achievable next steps.\n"
        )

    if not sources:
        return (
            f"{style_prefix}"
            f"The user is asking: \"{message}\"\n\n"
            "You are answering a question. Do not fabricate citations, page numbers, or quoted passages. "
            "If the material does not contain the requested answer, say that you could not find the answer "
            "in the available sources. You may offer a general explanation only when appropriate and should "
            "clearly label that explanation as additional knowledge, not from the sources.\n\n"
            f"User question: {message}"
        )

    # Build source summary
    source_sections = []
    for i, source in enumerate(sources, 1):
        chunks_text = "\n".join(f"- {chunk}" for chunk in source["chunks"])
        source_sections.append(
            f"Source {i}: {source['title']} (type: {source['source_type']})\n{chunks_text}"
        )

    sources_text = "\n\n".join(source_sections)

    return (
        f"{style_prefix}"
        f"The user is asking: \"{message}\"\n\n"
        "You are answering a question using the following source materials. "
        "Ground your answer in these sources and provide citations. "
        "Include page numbers when applicable. "
        "If the answer is not in the sources, say so clearly and you may offer general knowledge labeled as such.\n\n"
        f"{sources_text}\n\n"
        f"User question: {message}"
    )


@router.post("/chat", response_model=AIChatResponse, status_code=status.HTTP_200_OK)
async def chat_with_ai(
    payload: AIChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> AIChatResponse:
    profile = current_user.profile

    # Determine notebook context
    conversation = None
    notebook_id = None

    if payload.notebook_id:
        nb_check = (
            db.query(Notebook)
            .filter(Notebook.id == payload.notebook_id, Notebook.user_id == current_user.id)
            .first()
        )
        if not nb_check:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notebook not found.",
            )

    if payload.conversation_id:
        conversation = (
            db.query(AIConversation)
            .filter(
                AIConversation.id == payload.conversation_id,
                AIConversation.user_id == current_user.id,
            )
            .first()
        )
        if not conversation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
        if payload.notebook_id and not conversation.notebook_id:
            conversation.notebook_id = payload.notebook_id
        if payload.response_style:
            conversation.response_style = payload.response_style
        notebook_id = conversation.notebook_id
    elif payload.notebook_id:
        # Check if conversation already exists for this notebook
        conversation = (
            db.query(AIConversation)
            .filter(
                AIConversation.notebook_id == payload.notebook_id,
                AIConversation.user_id == current_user.id,
            )
            .order_by(AIConversation.last_active_at.desc())
            .first()
        )
        if conversation:
            if payload.response_style:
                conversation.response_style = payload.response_style
        else:
            conversation = AIConversation(
                user_id=current_user.id,
                notebook_id=payload.notebook_id,
                response_style=payload.response_style or "friendly",
            )
            db.add(conversation)
            db.flush()
        notebook_id = conversation.notebook_id
    else:
        # Create a new, independent conversation
        default_nb = get_or_create_default_notebook(current_user.id, db)
        conversation = AIConversation(
            user_id=current_user.id,
            notebook_id=default_nb.id,
            response_style=payload.response_style or "friendly",
        )
        db.add(conversation)
        db.flush()
        notebook_id = default_nb.id

    # Build system prompt with response style
    response_style = conversation.response_style if conversation else "friendly"

    # Source retrieval with strict conversation-level isolation
    sources: list[dict[str, Any]] = []
    if conversation:
        conv_sources_records = (
            db.query(ConversationSource, Source)
            .join(Source, ConversationSource.source_id == Source.id)
            .filter(
                ConversationSource.conversation_id == conversation.id,
                Source.user_id == current_user.id,
                Source.status == "ready",
            )
            .all()
        )
        if conv_sources_records:
            if payload.selected_source_ids is not None:
                selected_ids = set(payload.selected_source_ids)
                active_sources = [src for cs, src in conv_sources_records if src.id in selected_ids]
            else:
                active_sources = [src for cs, src in conv_sources_records if cs.is_selected]

            if active_sources:
                sources = rank_and_score_sources(active_sources, payload.message, db)
        elif payload.conversation_id:
            # Explicit conversation requested, but it has no sources associated:
            # Strictly return NO sources! Never inherit from previous chats!
            sources = []
        elif notebook_id:
            # Desktop/notebook without conversation isolation
            sources = get_notebook_sources(notebook_id, current_user.id, db, query=payload.message)
    elif notebook_id:
        sources = get_notebook_sources(notebook_id, current_user.id, db, query=payload.message)

    # Build source-grounded prompt if sources are available
    grounded_prompt = build_grounded_prompt(
        payload.message, sources, response_style
    )

    # Prepare messages for AI
    user_message = AIMessageModel(
        conversation_id=conversation.id,
        role=MessageRole.USER.value,
        content=payload.message,
    )
    db.add(user_message)
    db.flush()

    messages = (
        db.query(AIMessageModel)
        .filter(AIMessageModel.conversation_id == conversation.id)
        .order_by(AIMessageModel.created_at)
        .all()
    )

    ai_messages = [
        AIMessage(MessageRole(msg.role), msg.content) for msg in messages
    ]

    # Check if grounded study chat (explicit notebook_id in request or sources present)
    is_grounded_study = bool(sources or payload.notebook_id)

    if is_grounded_study:
        # Grounded study chat: include study planning context since it's study-focused
        system_prompt = build_system_prompt(
            profile, response_style, include_extraction_instructions=False, include_study_planning_context=True
        )
        task_type = AITaskType.CHAT
        response_model = None
        if sources:
            final_messages = [
                AIMessage(MessageRole.SYSTEM, system_prompt),
            ] + ai_messages[:-1] + [AIMessage(MessageRole.USER, grounded_prompt)]
        else:
            final_messages = [
                AIMessage(MessageRole.SYSTEM, system_prompt),
            ] + ai_messages
    else:
        # General conversation: do NOT include study planning context (avoids stale exam dates, daily limits, etc.)
        system_prompt = build_system_prompt(
            profile, response_style, include_extraction_instructions=True, include_study_planning_context=False
        )
        task_type = AITaskType.PROFILE_EXTRACTION
        response_model = ProfileExtractionResponse
        final_messages = [
            AIMessage(MessageRole.SYSTEM, system_prompt),
        ] + ai_messages

    request = AIRequest(
        task_type=task_type,
        messages=final_messages,
        response_model=response_model,
        fallback_allowed=True,
    )

    try:
        result = await ai_router.generate(request)
    except AIUnavailableError as e:
        logger.error("AI chat generation unavailable: %s | errors=%s", e, getattr(e, "errors", ()))
        db.rollback()
        detail = (
            "AI service is not configured. Please verify provider settings."
            if e.is_configuration_error
            else "AI service temporarily unavailable. Please try again in a few moments."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        )
    except Exception as e:
        logger.exception("AI chat generation unexpected error: %s", e)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service temporarily unavailable. Please try again in a few moments.",
        )

    extraction = result.structured if isinstance(result.structured, ProfileExtractionResponse) else None
    if not extraction:
        extraction = ProfileExtractionResponse(
            next_question=result.text.strip(),
            confidence=0.0,
        )

    ai_response_text = (
        result.text.strip()
        if is_grounded_study
        else (
            extraction.next_question.strip()
            if extraction.next_question and extraction.next_question.strip()
            else (result.text.strip() or "I understand. Let me help you with that.")
        )
    )

    # Collect citations from sourced passages
    citations = []
    if sources:
        for source in sources:
            for chunk in source["chunks"]:
                if chunk and chunk != "(no extracted content)":
                    citations.append(
                        {
                            "source_id": source["source_id"],
                            "source_title": source["title"],
                            "passage": chunk,
                        }
                    )

    ai_message = AIMessageModel(
        conversation_id=conversation.id,
        role=MessageRole.ASSISTANT.value,
        content=ai_response_text,
        citations=citations or None,
        provider_used=result.provider.value,
        model_used=result.model,
    )
    db.add(ai_message)

    conversation.last_active_at = datetime.now(timezone.utc)
    db.commit()

    if extraction.profile_updates and profile:
        update_data = extraction.profile_updates.model_dump(exclude_none=True)
        for key, value in update_data.items():
            if hasattr(profile, key):
                setattr(profile, key, value)
        db.commit()

    if extraction.academic_context_updates and extraction.academic_context_updates.exams:
        for exam_data in extraction.academic_context_updates.exams:
            if not isinstance(exam_data, dict):
                continue
            raw_date = exam_data.get("exam_date")
            if isinstance(raw_date, str):
                try:
                    exam_date_val = date.fromisoformat(raw_date)
                except ValueError:
                    exam_date_val = date.today()
            elif isinstance(raw_date, date):
                exam_date_val = raw_date
            else:
                exam_date_val = date.today()

            exam = Exam(
                user_id=current_user.id,
                name=exam_data.get("name", "Exam"),
                subject_name=exam_data.get("subject_name"),
                exam_date=exam_date_val,
                target_score=exam_data.get("target_score"),
            )
            db.add(exam)
        db.commit()

    if not conversation.title or (not conversation.custom_title and conversation.title in ("New Chat", "New Conversation")):
        conversation.title = generate_conversation_title(payload.message)
        conversation.custom_title = False
        db.commit()

    return AIChatResponse(
        message="AI response generated successfully.",
        conversation_id=conversation.id,
        ai_response=ai_response_text,
        title=conversation.title,
        profile_updates=extraction.profile_updates,
        academic_context_updates=extraction.academic_context_updates,
        missing_information=extraction.missing_information,
        next_question=extraction.next_question,
        confidence=extraction.confidence,
        provider_used=result.provider.value,
        model_used=result.model,
        citations=citations,
    )


@router.get("/history", response_model=AIConversationListResponse)
@router.get("/conversations", response_model=AIConversationListResponse)
async def get_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AIConversationListResponse:
    """List all saved conversations for the authenticated user, sorted with pinned first then last active."""
    conversations = (
        db.query(AIConversation)
        .filter(AIConversation.user_id == current_user.id)
        .order_by(AIConversation.is_pinned.desc(), AIConversation.last_active_at.desc())
        .all()
    )

    conversation_out = []
    for conv in conversations:
        message_count = (
            db.query(AIMessageModel)
            .filter(AIMessageModel.conversation_id == conv.id)
            .count()
        )
        conversation_out.append(
            {
                "id": conv.id,
                "user_id": conv.user_id,
                "title": conv.title or "New Conversation",
                "is_pinned": conv.is_pinned,
                "custom_title": conv.custom_title,
                "created_at": conv.created_at,
                "last_active_at": conv.last_active_at,
                "message_count": message_count,
                "notebook_id": conv.notebook_id,
                "response_style": conv.response_style,
            }
        )

    return AIConversationListResponse(
        conversations=conversation_out,
        message="Conversations retrieved.",
    )


@router.post("/conversations", response_model=ConversationOut)
async def create_conversation(
    payload: ConversationCreateRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationOut:
    """Create a new independent conversation."""
    notebook = None
    if payload and payload.notebook_id:
        notebook = (
            db.query(Notebook)
            .filter(Notebook.id == payload.notebook_id, Notebook.user_id == current_user.id)
            .first()
        )
    if not notebook:
        notebook = get_or_create_default_notebook(current_user.id, db)

    conv = AIConversation(
        user_id=current_user.id,
        notebook_id=notebook.id,
        title=payload.title if (payload and payload.title) else "New Conversation",
        response_style=payload.response_style if (payload and payload.response_style) else "friendly",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    return ConversationOut(
        id=conv.id,
        user_id=conv.user_id,
        title=conv.title,
        is_pinned=conv.is_pinned,
        custom_title=conv.custom_title,
        notebook_id=conv.notebook_id,
        response_style=conv.response_style,
        created_at=conv.created_at,
        last_active_at=conv.last_active_at,
        message_count=0,
    )


@router.get("/history/{conversation_id}", response_model=AIConversationHistoryResponse)
@router.get("/conversations/{conversation_id}", response_model=AIConversationHistoryResponse)
async def get_conversation_history(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AIConversationHistoryResponse:
    """Retrieve history and messages for a specific conversation."""
    conversation = (
        db.query(AIConversation)
        .filter(
            AIConversation.id == conversation_id,
            AIConversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    messages = (
        db.query(AIMessageModel)
        .filter(AIMessageModel.conversation_id == conversation_id)
        .order_by(AIMessageModel.created_at)
        .all()
    )

    message_out = [
        {
            "role": msg.role,
            "content": msg.content,
            "provider_used": msg.provider_used,
            "model_used": msg.model_used,
            "created_at": msg.created_at,
            "citations": msg.citations,
        }
        for msg in messages
    ]

    return AIConversationHistoryResponse(
        conversation_id=conversation_id,
        title=conversation.title,
        is_pinned=conversation.is_pinned,
        response_style=conversation.response_style,
        messages=message_out,
        message="Conversation history retrieved.",
    )


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
async def update_conversation(
    conversation_id: str,
    payload: ConversationUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationOut:
    """Update conversation title (rename), pinned status, or response style."""
    conv = (
        db.query(AIConversation)
        .filter(AIConversation.id == conversation_id, AIConversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    if payload.title is not None:
        trimmed = payload.title.strip()
        if not trimmed:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Title cannot be empty.")
        conv.title = trimmed
        conv.custom_title = True

    if payload.is_pinned is not None:
        conv.is_pinned = payload.is_pinned

    if payload.response_style is not None:
        conv.response_style = payload.response_style

    db.commit()
    db.refresh(conv)

    message_count = (
        db.query(AIMessageModel)
        .filter(AIMessageModel.conversation_id == conv.id)
        .count()
    )

    return ConversationOut(
        id=conv.id,
        user_id=conv.user_id,
        title=conv.title,
        is_pinned=conv.is_pinned,
        custom_title=conv.custom_title,
        notebook_id=conv.notebook_id,
        response_style=conv.response_style,
        created_at=conv.created_at,
        last_active_at=conv.last_active_at,
        message_count=message_count,
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_200_OK)
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Delete a conversation and its messages. Does not delete physical sources."""
    conv = (
        db.query(AIConversation)
        .filter(AIConversation.id == conversation_id, AIConversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    db.delete(conv)
    db.commit()
    return {"success": True, "message": "Conversation deleted."}


@router.get("/conversations/{conversation_id}/sources", response_model=list[SourceListItem])
async def list_conversation_sources(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SourceListItem]:
    """List sources associated with this specific conversation with independent selection state."""
    conv = (
        db.query(AIConversation)
        .filter(AIConversation.id == conversation_id, AIConversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    items = (
        db.query(ConversationSource, Source)
        .join(Source, ConversationSource.source_id == Source.id)
        .filter(
            ConversationSource.conversation_id == conversation_id,
            Source.user_id == current_user.id,
        )
        .order_by(ConversationSource.created_at.desc())
        .all()
    )

    return [
        SourceListItem(
            id=s.id,
            title=s.title,
            source_type=s.source_type,
            origin=s.origin,
            file_size=s.file_size,
            page_count=s.page_count,
            status=s.status,
            is_selected=cs.is_selected,
            meta_info=s.meta_info or {},
            created_at=s.created_at,
        )
        for cs, s in items
    ]


@router.patch("/conversations/{conversation_id}/sources/{source_id}/toggle-selection")
async def toggle_conversation_source(
    conversation_id: str,
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Toggle source selection within this conversation context."""
    conv = (
        db.query(AIConversation)
        .filter(AIConversation.id == conversation_id, AIConversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    cs = (
        db.query(ConversationSource)
        .filter(
            ConversationSource.conversation_id == conversation_id,
            ConversationSource.source_id == source_id,
        )
        .first()
    )
    if not cs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not associated with this conversation.")

    cs.is_selected = not cs.is_selected
    db.commit()
    return {"success": True, "source_id": source_id, "is_selected": cs.is_selected}


@router.delete("/conversations/{conversation_id}/sources/{source_id}", status_code=status.HTTP_200_OK)
async def remove_source_from_conversation(
    conversation_id: str,
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Remove a source association from a conversation without deleting the underlying physical source."""
    conv = (
        db.query(AIConversation)
        .filter(AIConversation.id == conversation_id, AIConversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    cs = (
        db.query(ConversationSource)
        .filter(
            ConversationSource.conversation_id == conversation_id,
            ConversationSource.source_id == source_id,
        )
        .first()
    )
    if not cs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source association not found.")

    db.delete(cs)
    db.commit()
    return {"success": True, "message": "Source removed from conversation."}


# ---------------------------------------------------------------------------
# Notebook CRUD endpoints
# ---------------------------------------------------------------------------
notebook_router = APIRouter(prefix="/notebooks", tags=["ai-notebooks"])


class NotebookCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class NotebookUpdateRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class NotebookOut(BaseModel):
    id: str
    title: str
    description: str | None
    source_count: int
    created_at: str


@notebook_router.get("", response_model=list[NotebookOut])
async def list_notebooks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NotebookOut]:
    """List all notebooks for the current user."""
    notebooks = (
        db.query(Notebook)
        .filter(Notebook.user_id == current_user.id)
        .order_by(Notebook.updated_at.desc())
        .all()
    )
    return [
        NotebookOut(
            id=nb.id,
            title=nb.title,
            description=nb.description,
            source_count=len(nb.sources),
            created_at=nb.created_at.isoformat() if nb.created_at else "",
        )
        for nb in notebooks
    ]


@notebook_router.post("", response_model=NotebookOut, status_code=status.HTTP_201_CREATED)
async def create_notebook(
    payload: NotebookCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotebookOut:
    """Create a new notebook for the current user."""
    notebook = Notebook(
        user_id=current_user.id,
        title=payload.title.strip(),
        description=payload.description,
    )
    db.add(notebook)
    db.commit()
    db.refresh(notebook)
    return NotebookOut(
        id=notebook.id,
        title=notebook.title,
        description=notebook.description,
        source_count=0,
        created_at=notebook.created_at.isoformat() if notebook.created_at else "",
    )


@notebook_router.patch("/{notebook_id}", response_model=NotebookOut)
async def update_notebook(
    notebook_id: str,
    payload: NotebookUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotebookOut:
    """Update a notebook's title or description."""
    notebook = (
        db.query(Notebook)
        .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
        .first()
    )
    if not notebook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found.")
    if payload.title is not None:
        notebook.title = payload.title.strip()
    if payload.description is not None:
        notebook.description = payload.description
    db.commit()
    db.refresh(notebook)
    return NotebookOut(
        id=notebook.id,
        title=notebook.title,
        description=notebook.description,
        source_count=len(notebook.sources),
        created_at=notebook.created_at.isoformat() if notebook.created_at else "",
    )


@notebook_router.delete("/{notebook_id}", status_code=status.HTTP_200_OK)
async def delete_notebook(
    notebook_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Delete a notebook and all its sources."""
    notebook = (
        db.query(Notebook)
        .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
        .first()
    )
    if not notebook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found.")
    db.delete(notebook)
    db.commit()
    return {"detail": "Notebook deleted successfully."}


@notebook_router.get("/{notebook_id}/messages", response_model=AIConversationHistoryResponse)
async def get_notebook_messages(
    notebook_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AIConversationHistoryResponse:
    notebook = (
        db.query(Notebook)
        .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
        .first()
    )
    if not notebook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found.")

    conversation = (
        db.query(AIConversation)
        .filter(
            AIConversation.notebook_id == notebook_id,
            AIConversation.user_id == current_user.id,
        )
        .order_by(AIConversation.last_active_at.desc())
        .first()
    )

    if not conversation:
        return AIConversationHistoryResponse(
            conversation_id="",
            messages=[],
            message="No messages for this notebook yet.",
        )

    messages = (
        db.query(AIMessageModel)
        .filter(AIMessageModel.conversation_id == conversation.id)
        .order_by(AIMessageModel.created_at)
        .all()
    )

    message_out = [
        {
            "role": msg.role,
            "content": msg.content,
            "provider_used": msg.provider_used,
            "model_used": msg.model_used,
            "created_at": msg.created_at,
            "citations": msg.citations,
        }
        for msg in messages
    ]

    return AIConversationHistoryResponse(
        conversation_id=conversation.id,
        messages=message_out,
        message="Notebook conversation retrieved.",
    )


@notebook_router.delete("/{notebook_id}/messages")
async def clear_notebook_messages(
    notebook_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notebook = (
        db.query(Notebook)
        .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
        .first()
    )
    if not notebook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found.")

    conversations = (
        db.query(AIConversation)
        .filter(
            AIConversation.notebook_id == notebook_id,
            AIConversation.user_id == current_user.id,
        )
        .all()
    )
    for conv in conversations:
        db.delete(conv)
    db.commit()

    return {"success": True, "message": "Notebook conversation cleared."}


# Source selection toggle
@source_router.patch("/{source_id}/toggle-selection", status_code=status.HTTP_200_OK)
async def toggle_source_selection(
    source_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Toggle whether a source is used in AI grounding."""
    source = (
        db.query(Source)
        .filter(Source.id == source_id, Source.user_id == current_user.id)
        .first()
    )
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found.")
    source.is_selected = not source.is_selected
    db.commit()
    return {"id": source.id, "is_selected": source.is_selected}


# ---------------------------------------------------------------------------
# Note management endpoints
# ---------------------------------------------------------------------------
note_router = APIRouter(prefix="/notes", tags=["ai-notes"])


class NoteOut(BaseModel):
    id: str
    notebook_id: str
    title: str
    content: str
    note_type: str
    created_at: str


class NoteCreateRequest(BaseModel):
    notebook_id: str | None = None
    conversation_id: str | None = None
    title: str = Field(default="Study Note", min_length=1, max_length=255)
    content: str
    note_type: str = "manual"


@note_router.get("/{notebook_id}", response_model=list[NoteOut])
async def list_notes(
    notebook_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NoteOut]:
    """List all notes for a notebook."""
    notebook = (
        db.query(Notebook)
        .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
        .first()
    )
    if not notebook:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found.")
    notes = (
        db.query(NotebookNote)
        .filter(NotebookNote.notebook_id == notebook_id, NotebookNote.user_id == current_user.id)
        .order_by(NotebookNote.created_at.desc())
        .all()
    )
    return [
        NoteOut(
            id=n.id,
            notebook_id=n.notebook_id,
            title=n.title,
            content=n.content,
            note_type=n.note_type,
            created_at=n.created_at.isoformat() if n.created_at else "",
        )
        for n in notes
    ]


@note_router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: NoteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NoteOut:
    """Save a note to a notebook."""
    notebook_id = payload.notebook_id
    if payload.conversation_id and not notebook_id:
        conv = (
            db.query(AIConversation)
            .filter(AIConversation.id == payload.conversation_id, AIConversation.user_id == current_user.id)
            .first()
        )
        if conv and conv.notebook_id:
            notebook_id = conv.notebook_id
    if notebook_id:
        notebook = (
            db.query(Notebook)
            .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
            .first()
        )
        if not notebook:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found.")
    else:
        notebook = get_or_create_default_notebook(current_user.id, db)
        notebook_id = notebook.id

    note = NotebookNote(
        notebook_id=notebook_id,
        user_id=current_user.id,
        title=payload.title,
        content=payload.content,
        note_type=payload.note_type,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return NoteOut(
        id=note.id,
        notebook_id=note.notebook_id,
        title=note.title,
        content=note.content,
        note_type=note.note_type,
        created_at=note.created_at.isoformat() if note.created_at else "",
    )


@note_router.delete("/{note_id}", status_code=status.HTTP_200_OK)
async def delete_note(
    note_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Delete a note."""
    note = (
        db.query(NotebookNote)
        .filter(NotebookNote.id == note_id, NotebookNote.user_id == current_user.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")
    db.delete(note)
    db.commit()
    return {"detail": "Note deleted successfully."}


# ---------------------------------------------------------------------------
# Study tool endpoints
# ---------------------------------------------------------------------------

class StudyToolRequest(BaseModel):
    topic: str | None = None
    context: str | None = None  # optional additional context from sources
    notebook_id: str | None = None  # explicit notebook override


class StudyToolResponse(BaseModel):
    success: bool
    topic: str
    content: str
    generated_at: str
    source_references: list[dict[str, Any]] | None = None


class FreeTextResponse(BaseModel):
    """Schema for study-tool AI responses that return plain prose."""
    answer: str = Field(
        default="",
        description="The generated study content — explanation, summary, MCQs, notes, or questions.",
    )



# ---------------------------------------------------------------------------
# Shared study-tool helper
# ---------------------------------------------------------------------------

def _get_notebook_context(
    payload: StudyToolRequest,
    current_user: User,
    db: Session,
) -> tuple[str | None, str, list[dict[str, Any]]]:
    """Return (notebook_id, style, sources) for a study-tool request.

    Prefers payload.notebook_id when set; falls back to the most-recent
    conversation's notebook.  Never raises if no notebook is found — it
    simply returns (None, 'friendly', []).
    """
    notebook_id = payload.notebook_id
    style = "friendly"
    if notebook_id:
        notebook = (
            db.query(Notebook)
            .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
            .first()
        )
        if not notebook:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notebook not found.",
            )
        conversation = (
            db.query(AIConversation)
            .filter(
                AIConversation.user_id == current_user.id,
                AIConversation.notebook_id == notebook_id,
            )
            .order_by(AIConversation.last_active_at.desc())
            .first()
        )
        if conversation:
            style = conversation.response_style or "friendly"
    else:
        conversation = (
            db.query(AIConversation)
            .filter(AIConversation.user_id == current_user.id)
            .order_by(AIConversation.last_active_at.desc())
            .first()
        )
        if conversation:
            notebook_id = conversation.notebook_id
            style = conversation.response_style or "friendly"

    query_text = payload.topic or payload.context or ""
    sources = (
        get_notebook_sources(notebook_id, current_user.id, db, query=query_text)
        if notebook_id
        else []
    )
    return notebook_id, style, sources


async def _run_study_tool(
    user_prompt: str,
    system_prompt: str,
    sources: list[dict[str, Any]],
    payload: StudyToolRequest,
    ai_router: AIProviderRouter,
) -> StudyToolResponse:
    """Run an AI study-tool request and return a StudyToolResponse.

    Uses FreeTextResponse schema so the AI returns a plain answer
    rather than a profile-extraction JSON blob.
    """
    messages = [
        AIMessage(MessageRole.SYSTEM, system_prompt),
        AIMessage(MessageRole.USER, user_prompt),
    ]

    request = AIRequest(
        task_type=AITaskType.CHAT,
        messages=messages,
        response_model=None,
        fallback_allowed=True,
    )

    try:
        result = await ai_router.generate(request)
    except AIUnavailableError as exc:
        detail = (
            "AI service is not configured. Please verify provider settings."
            if exc.is_configuration_error
            else "AI service temporarily unavailable. Please try again in a few moments."
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service temporarily unavailable. Please try again in a few moments.",
        )

    content = result.text.strip()
    if content.startswith("{") and content.endswith("}"):
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                content = parsed.get("answer") or parsed.get("content") or content
        except Exception:
            pass

    if not content:
        content = "No content was generated. Please try again."

    citations = [
        {
            "source_id": source["source_id"],
            "source_title": source["title"],
            "passage": chunk,
        }
        for source in sources
        for chunk in source["chunks"]
    ]

    return StudyToolResponse(
        success=True,
        topic=payload.topic or "general",
        content=content,
        generated_at=datetime.now(timezone.utc).isoformat(),
        source_references=citations if citations else None,
    )


# ---------------------------------------------------------------------------
# Study tool endpoints
# ---------------------------------------------------------------------------

@router.post("/study-tool/explain", response_model=StudyToolResponse, status_code=status.HTTP_200_OK)
async def explain_topic(
    payload: StudyToolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> StudyToolResponse:
    """Explain a topic step by step using selected sources."""
    _, style, sources = _get_notebook_context(payload, current_user, db)
    system_prompt = build_system_prompt(
        current_user.profile, style, include_extraction_instructions=False, include_study_planning_context=True
    )

    if sources:
        sources_text = "\n\n".join(
            f"Source {i}: {s['title']}\n" + "\n".join(f"- {c}" for c in s["chunks"])
            for i, s in enumerate(sources, 1)
        )
        user_prompt = (
            f"Explain the following topic using the student's study materials as evidence. "
            f"Ground your answer in these sources and include citations (source name + page number when available). "
            f"Clearly label any additional knowledge not from the sources.\n\n"
            f"{sources_text}\n\n"
            f"Topic: {payload.topic or 'the discussed topic'}\n"
            f"Additional context: {payload.context or ''}"
        )
    else:
        user_prompt = (
            f"Explain the following topic clearly step by step. "
            f"Use simple language, examples, and analogies where helpful. "
            f"Make the explanation accessible but rigorous.\n\n"
            f"Topic: {payload.topic or 'the discussed topic'}\n"
            f"Additional context: {payload.context or ''}"
        )

    return await _run_study_tool(user_prompt, system_prompt, sources, payload, ai_router)


@router.post("/study-tool/summarize", response_model=StudyToolResponse, status_code=status.HTTP_200_OK)
async def summarize_notes(
    payload: StudyToolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> StudyToolResponse:
    """Summarize the student's notes and study materials."""
    _, style, sources = _get_notebook_context(payload, current_user, db)
    system_prompt = build_system_prompt(
        current_user.profile, style, include_extraction_instructions=False, include_study_planning_context=True
    )

    if sources:
        sources_text = "\n\n".join(
            f"Source {i}: {s['title']}\n" + "\n".join(f"- {c}" for c in s["chunks"])
            for i, s in enumerate(sources, 1)
        )
        user_prompt = (
            f"Generate a concise summary of the student's study materials. "
            f"Ground your summary in these sources and include citations. "
            f"Highlight key concepts, important formulas, and main takeaways.\n\n"
            f"{sources_text}\n\n"
            f"Summarize: {payload.topic or 'all study materials'}"
        )
    else:
        user_prompt = (
            f"Generate a concise summary of the student's study notes. "
            f"Organize by key topics and highlight important points. "
            f"Make the summary clear and study-focused.\n\n"
            f"Summarize: {payload.topic or 'all study materials'}"
        )

    return await _run_study_tool(user_prompt, system_prompt, sources, payload, ai_router)


@router.post("/study-tool/revision-notes", response_model=StudyToolResponse, status_code=status.HTTP_200_OK)
async def generate_revision_notes(
    payload: StudyToolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> StudyToolResponse:
    """Generate comprehensive revision notes from study materials."""
    _, style, sources = _get_notebook_context(payload, current_user, db)
    system_prompt = build_system_prompt(
        current_user.profile, style, include_extraction_instructions=False, include_study_planning_context=True
    )

    if sources:
        sources_text = "\n\n".join(
            f"Source {i}: {s['title']}\n" + "\n".join(f"- {c}" for c in s["chunks"])
            for i, s in enumerate(sources, 1)
        )
        user_prompt = (
            f"Generate comprehensive revision notes from the study materials below. "
            f"Organize by key topics, include section summaries, highlight important formulas and "
            f"concepts, and add review questions. Include citations where applicable.\n\n"
            f"{sources_text}\n\n"
            f"Generate revision notes for: {payload.topic or 'the studied topic'}"
        )
    else:
        user_prompt = (
            f"Generate comprehensive revision notes for the following topic. "
            f"Organize by key sub-topics, include summaries, important terms, and review questions.\n\n"
            f"Topic: {payload.topic or 'the studied topic'}"
        )

    return await _run_study_tool(user_prompt, system_prompt, sources, payload, ai_router)


@router.post("/study-tool/mcqs", response_model=StudyToolResponse, status_code=status.HTTP_200_OK)
async def create_mcqs(
    payload: StudyToolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> StudyToolResponse:
    """Create multiple-choice questions from study materials."""
    _, style, sources = _get_notebook_context(payload, current_user, db)
    system_prompt = build_system_prompt(
        current_user.profile, style, include_extraction_instructions=False, include_study_planning_context=True
    )

    if sources:
        sources_text = "\n\n".join(
            f"Source {i}: {s['title']}\n" + "\n".join(f"- {c}" for c in s["chunks"])
            for i, s in enumerate(sources, 1)
        )
        user_prompt = (
            f"Create 5 multiple-choice questions (MCQs) from the study materials below. "
            f"Each MCQ must have: question text, 4 answer options (A-D), the correct answer letter, "
            f"and a brief explanation. Ground the questions in these sources and cite where applicable.\n\n"
            f"{sources_text}\n\n"
            f"Generate MCQs for: {payload.topic or 'the studied topic'}"
        )
    else:
        user_prompt = (
            f"Create 5 multiple-choice questions (MCQs) for the following topic. "
            f"Each MCQ must have: question text, 4 answer options (A-D), the correct answer letter, "
            f"and a brief explanation. Focus on understanding of key concepts.\n\n"
            f"Topic: {payload.topic or 'the studied topic'}"
        )

    return await _run_study_tool(user_prompt, system_prompt, sources, payload, ai_router)


@router.post("/study-tool/practice-questions", response_model=StudyToolResponse, status_code=status.HTTP_200_OK)
async def generate_practice_questions(
    payload: StudyToolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> StudyToolResponse:
    """Generate practice questions from study materials."""
    _, style, sources = _get_notebook_context(payload, current_user, db)
    system_prompt = build_system_prompt(
        current_user.profile, style, include_extraction_instructions=False, include_study_planning_context=True
    )

    if sources:
        sources_text = "\n\n".join(
            f"Source {i}: {s['title']}\n" + "\n".join(f"- {c}" for c in s["chunks"])
            for i, s in enumerate(sources, 1)
        )
        user_prompt = (
            f"Generate 3 practice questions (short-answer or numerical) from the study materials below. "
            f"Questions should require the student to apply concepts, not just recall facts. "
            f"Include model answers and cite relevant sources.\n\n"
            f"{sources_text}\n\n"
            f"Generate practice questions for: {payload.topic or 'the studied topic'}"
        )
    else:
        user_prompt = (
            f"Generate 3 practice questions (short-answer or numerical) for the following topic. "
            f"Questions should require the student to apply concepts, not just recall facts. "
            f"Include model answers.\n\n"
            f"Topic: {payload.topic or 'the studied topic'}"
        )

    return await _run_study_tool(user_prompt, system_prompt, sources, payload, ai_router)


@router.post("/study-tool/weak-areas", response_model=StudyToolResponse, status_code=status.HTTP_200_OK)
async def identify_weak_areas(
    payload: StudyToolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> StudyToolResponse:
    """Analyze student weak topics and study materials to prioritize spaced recall."""
    _, style, sources = _get_notebook_context(payload, current_user, db)
    system_prompt = build_system_prompt(
        current_user.profile, style, include_extraction_instructions=False, include_study_planning_context=True
    )

    profile = current_user.profile
    weak = getattr(profile, "weak_topics", []) if profile else []
    target_exam = getattr(profile, "target_exam", "Exams") if profile else "Exams"

    if sources:
        sources_text = "\n\n".join(
            f"Source {i}: {s['title']}\n" + "\n".join(f"- {c}" for c in s["chunks"])
            for i, s in enumerate(sources, 1)
        )
        user_prompt = (
            f"Perform an academic weak-area diagnostic for {target_exam} preparation.\n"
            f"Known weak topics from student profile: {', '.join(weak) if weak else 'General retention gaps'}.\n"
            f"Focus topic requested: {payload.topic or 'Current study material'}.\n\n"
            f"Course Materials:\n{sources_text}\n\n"
            f"Identify conceptual pitfalls, high-error sub-topics, and give a 3-step prioritized recall action plan."
        )
    else:
        user_prompt = (
            f"Perform a weak-area diagnostic and spaced retrieval strategy for {target_exam}.\n"
            f"Known weak topics: {', '.join(weak) if weak else 'General review'}.\n"
            f"Focus topic: {payload.topic or 'Current focus'}.\n"
            f"Provide a prioritized retention roadmap and diagnostic questions."
        )

    return await _run_study_tool(user_prompt, system_prompt, sources, payload, ai_router)


@router.post("/study-tool/optimize-routine", response_model=StudyToolResponse, status_code=status.HTTP_200_OK)
async def optimize_study_routine(
    payload: StudyToolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> StudyToolResponse:
    """Generate an optimized daily sprint routine with Pomodoro intervals and breaks."""
    _, style, sources = _get_notebook_context(payload, current_user, db)
    system_prompt = build_system_prompt(
        current_user.profile, style, include_extraction_instructions=False, include_study_planning_context=True
    )

    profile = current_user.profile
    daily_min = getattr(profile, "daily_time_minutes", 120) if profile else 120

    user_prompt = (
        f"Design an optimized daily study routine for a target daily budget of {daily_min} minutes.\n"
        f"Topic focus: {payload.topic or 'Core subject mastery'}.\n"
        f"Structure the routine into focused Pomodoro intervals, active recall blocks, and cognitive rest breaks. "
        f"Include pacing tips to avoid burnout while maximizing memory consolidation."
    )

    return await _run_study_tool(user_prompt, system_prompt, sources, payload, ai_router)


@router.post("/study-tool/high-yield", response_model=StudyToolResponse, status_code=status.HTTP_200_OK)
async def high_yield_strategy(
    payload: StudyToolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    ai_router: AIProviderRouter = Depends(get_ai_router),
) -> StudyToolResponse:
    """Analyze high-weightage topics and high-yield exam strategy."""
    _, style, sources = _get_notebook_context(payload, current_user, db)
    system_prompt = build_system_prompt(
        current_user.profile, style, include_extraction_instructions=False, include_study_planning_context=True
    )

    profile = current_user.profile
    target_exam = getattr(profile, "target_exam", "Upcoming Exams") if profile else "Upcoming Exams"

    if sources:
        sources_text = "\n\n".join(
            f"Source {i}: {s['title']}\n" + "\n".join(f"- {c}" for c in s["chunks"])
            for i, s in enumerate(sources, 1)
        )
        user_prompt = (
            f"Analyze high-yield exam topics for {target_exam} using the following course materials.\n\n"
            f"{sources_text}\n\n"
            f"Target topic: {payload.topic or 'Comprehensive course materials'}.\n"
            f"Provide: 1. Top 3 high-weightage themes likely to appear. 2. High-probability exam question formats. 3. Quick-scoring mnemonic or formula review."
        )
    else:
        user_prompt = (
            f"Provide a high-yield exam strategy for {target_exam}.\n"
            f"Topic: {payload.topic or 'Core curriculum'}.\n"
            f"Outline high-weightage scoring priorities and effective revision tactics."
        )

    return await _run_study_tool(user_prompt, system_prompt, sources, payload, ai_router)


@router.post("/study-tool/save-note", status_code=status.HTTP_200_OK)
async def save_note(
    payload: dict[str, str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Save a note to the specified or most-recent notebook."""
    title = payload.get("title", "Study Note")
    content = payload.get("content", "")
    notebook_id = payload.get("notebook_id")

    if not content.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Note content cannot be empty.",
        )

    # Resolve notebook
    if notebook_id:
        notebook = (
            db.query(Notebook)
            .filter(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
            .first()
        )
    else:
        # Fall back to the most recent conversation's notebook
        conversation = (
            db.query(AIConversation)
            .filter(AIConversation.user_id == current_user.id)
            .order_by(AIConversation.last_active_at.desc())
            .first()
        )
        notebook = None
        if conversation and conversation.notebook_id:
            notebook = (
                db.query(Notebook)
                .filter(
                    Notebook.id == conversation.notebook_id,
                    Notebook.user_id == current_user.id,
                )
                .first()
            )

    if not notebook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No notebook found to save this note to.",
        )

    notebook_note = NotebookNote(
        notebook_id=notebook.id,
        user_id=current_user.id,
        title=title,
        content=content,
        note_type=payload.get("note_type", "manual"),
    )
    db.add(notebook_note)
    db.commit()

    return {"detail": "Note saved successfully.", "note_id": notebook_note.id}


# ---------------------------------------------------------------------------
# YouTube Educational Video Search
# ---------------------------------------------------------------------------

class YouTubeVideoResult(BaseModel):
    video_id: str
    title: str
    channel: str
    url: str
    thumbnail: str | None = None
    description: str | None = None


class YouTubeSearchResponse(BaseModel):
    results: list[YouTubeVideoResult]
    query: str
    configured: bool
    message: str


@router.get("/youtube/search", response_model=YouTubeSearchResponse)
async def youtube_search(
    q: str | None = Query(default=None, description="Search query"),
    query: str | None = Query(default=None, description="Search query alias"),
    max_results: int = Query(default=6, ge=1, le=10),
    current_user: User = Depends(get_current_user),
) -> YouTubeSearchResponse:
    """Search YouTube Data API v3 for educational videos.

    Requires YOUTUBE_API_KEY to be set in the server-side .env file.
    Returns an honest not-configured state if the key is absent.
    Results are scoped to educational content (type=video, relevanceLanguage=en).
    """
    search_term = (q or query or "").strip()
    if not search_term:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A non-empty 'q' or 'query' parameter is required.",
        )
    q = search_term

    import httpx as _httpx

    settings = get_ai_settings()
    api_key = settings.youtube_api_key

    if not api_key:
        return YouTubeSearchResponse(
            results=[],
            query=q,
            configured=False,
            message=(
                "YouTube search is not configured. "
                "Set YOUTUBE_API_KEY in the backend .env file. "
                "Obtain a key from Google Cloud Console → APIs → YouTube Data API v3."
            ),
        )

    try:
        async with _httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "snippet",
                    "q": q,
                    "type": "video",
                    "videoEmbeddable": "true",
                    "relevanceLanguage": "en",
                    "maxResults": max_results,
                    "key": api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()

    except _httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        if status_code == 403:
            body = exc.response.json() if exc.response.content else {}
            reason = (body.get("error", {}).get("message") or "quota exhausted or key invalid")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"YouTube API error: {reason}",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"YouTube API returned HTTP {status_code}.",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"YouTube search failed: {exc}",
        )

    items = data.get("items", [])
    results = []
    for item in items:
        video_id = item.get("id", {}).get("videoId")
        snippet = item.get("snippet", {})
        if not video_id:
            continue
        results.append(
            YouTubeVideoResult(
                video_id=video_id,
                title=snippet.get("title", ""),
                channel=snippet.get("channelTitle", ""),
                url=f"https://www.youtube.com/watch?v={video_id}",
                thumbnail=(snippet.get("thumbnails") or {}).get("medium", {}).get("url"),
                description=snippet.get("description", "")[:300] or None,
            )
        )

    return YouTubeSearchResponse(
        results=results,
        query=q,
        configured=True,
        message=f"{len(results)} video(s) found." if results else "No results found for this query.",
    )


@router.post("/youtube/save", response_model=SourceUploadResponse, status_code=status.HTTP_200_OK)
async def save_youtube_video(
    payload: YouTubeSaveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SourceUploadResponse:
    """Save a YouTube educational video as a notebook study source with transcript extraction."""
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notebook not found.")
    else:
        notebook = get_or_create_default_notebook(current_user.id, db)
        notebook_id = notebook.id

    canonical_url = payload.url or f"https://www.youtube.com/watch?v={payload.video_id}"

    # 2. Check for duplicate: same video_id or canonical_url in the same notebook
    existing = (
        db.query(Source)
        .filter(
            Source.notebook_id == notebook_id,
            Source.user_id == current_user.id,
            (Source.file_path == canonical_url) | (Source.title == payload.title),
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
        return SourceUploadResponse(
            success=True,
            source={
                "id": existing.id,
                "title": existing.title,
                "source_type": existing.source_type,
                "origin": existing.origin,
                "file_size": existing.file_size,
                "page_count": existing.page_count,
                "status": existing.status,
                "is_selected": existing.is_selected,
                "meta_info": existing.meta_info,
                "created_at": existing.created_at,
            },
            message=f"Video '{payload.title}' is already saved to this notebook.",
        )

    # 3. Create Source record in 'processing' state
    source = Source(
        notebook_id=notebook_id,
        user_id=current_user.id,
        title=payload.title[:255],
        source_type="youtube",
        origin="youtube",
        file_path=canonical_url[:500],
        file_size=0,
        page_count=None,
        status="processing",
        is_selected=True,
        meta_info={
            "video_id": payload.video_id,
            "canonical_url": canonical_url,
            "title": payload.title,
            "channel": payload.channel,
            "thumbnail": payload.thumbnail,
            "description": payload.description,
            "transcript_available": False,
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

    # 4. Attempt to retrieve transcript via permitted mechanism
    chunks_created = 0
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        transcript_data = None
        try:
            api = YouTubeTranscriptApi()
            if hasattr(api, "fetch"):
                fetched = api.fetch(
                    payload.video_id,
                    languages=["en", "en-US", "en-GB", "es", "fr", "de", "hi"],
                )
                transcript_data = fetched.to_raw_data() if hasattr(fetched, "to_raw_data") else list(fetched)
            elif hasattr(YouTubeTranscriptApi, "get_transcript"):
                transcript_data = YouTubeTranscriptApi.get_transcript(
                    payload.video_id,
                    languages=["en", "en-US", "en-GB", "es", "fr", "de", "hi"],
                )
        except Exception:
            try:
                api = YouTubeTranscriptApi()
                if hasattr(api, "list"):
                    transcript_list = api.list(payload.video_id)
                else:
                    transcript_list = YouTubeTranscriptApi.list_transcripts(payload.video_id)
                for t in transcript_list:
                    fetched = t.fetch()
                    transcript_data = fetched.to_raw_data() if hasattr(fetched, "to_raw_data") else list(fetched)
                    break
            except Exception:
                transcript_data = None

        if transcript_data:
            chunks: list[dict[str, Any]] = []
            curr_text: list[str] = []
            curr_len = 0
            curr_start = 0

            for entry in transcript_data:
                txt = entry.get("text", "").strip()
                if not txt:
                    continue
                start_sec = int(entry.get("start", 0))
                if not curr_text:
                    curr_start = start_sec

                if curr_len + len(txt) > 500 and curr_text:
                    mins = curr_start // 60
                    secs = curr_start % 60
                    timestamp_str = f"{mins:02d}:{secs:02d}"
                    chunks.append({
                        "content": " ".join(curr_text),
                        "section_title": f"Timestamp [{timestamp_str}]",
                    })
                    curr_text = [txt]
                    curr_len = len(txt)
                    curr_start = start_sec
                else:
                    curr_text.append(txt)
                    curr_len += len(txt) + 1

            if curr_text:
                mins = curr_start // 60
                secs = curr_start % 60
                timestamp_str = f"{mins:02d}:{secs:02d}"
                chunks.append({
                    "content": " ".join(curr_text),
                    "section_title": f"Timestamp [{timestamp_str}]",
                })

            if chunks:
                db_chunks = [
                    SourceChunk(
                        source_id=source.id,
                        chunk_index=idx,
                        content=c["content"],
                        section_title=c["section_title"],
                    )
                    for idx, c in enumerate(chunks)
                ]
                db.add_all(db_chunks)
                source.status = "ready"
                source.file_size = sum(len(c["content"]) for c in chunks)
                source.meta_info = {
                    **source.meta_info,
                    "transcript_available": True,
                    "chunk_count": len(chunks),
                }
                chunks_created = len(chunks)
    except Exception:
        pass

    if chunks_created == 0:
        source.status = "no_transcript"
        source.meta_info = {
            **source.meta_info,
            "transcript_available": False,
        }
        source.error_message = (
            "Video saved. Spoken transcript is not available from YouTube. "
            "You can paste transcript text manually to enable AI grounding."
        )

    db.commit()
    db.refresh(source)

    msg = (
        f"Video '{source.title}' saved with transcript indexed ({chunks_created} passages)."
        if chunks_created > 0
        else f"Video '{source.title}' saved to notebook. Transcript not available; video content not yet available to AI."
    )

    return SourceUploadResponse(
        success=True,
        source={
            "id": source.id,
            "title": source.title,
            "source_type": source.source_type,
            "origin": source.origin,
            "file_size": source.file_size,
            "page_count": source.page_count,
            "status": source.status,
            "is_selected": source.is_selected,
            "meta_info": source.meta_info,
            "created_at": source.created_at,
        },
        message=msg,
        transcript_status="ready" if chunks_created > 0 else "no_transcript",
        chunks_indexed=chunks_created,
    )


# ---------------------------------------------------------------------------
# Google Drive integration lives in app/api/drive.py (real OAuth flow,
# encrypted token storage, Picker support). Included below.
# ---------------------------------------------------------------------------


# Register sub-routers (kept at bottom to avoid circular issues)
router.include_router(source_router)
router.include_router(notebook_router)
router.include_router(note_router)
from app.api.drive import router as drive_router  # noqa: E402
router.include_router(drive_router)
