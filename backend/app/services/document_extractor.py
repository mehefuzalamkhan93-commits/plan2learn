"""
Document text extraction service.

Supports: PDF (pdfminer.six), DOCX (python-docx), PPTX (python-pptx),
TXT and Markdown (safe UTF-8 decode with fallback).

Returns a list of ExtractionChunk objects that map text to optional
page numbers and section titles.

Never marks a source ready when extraction failed.
"""

from __future__ import annotations

import io
import ipaddress
import logging
import re
import socket
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {"pdf", "docx", "txt", "md", "pptx"}
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
CHUNK_SIZE = 600          # target characters per chunk
CHUNK_OVERLAP = 100       # overlap characters between consecutive chunks


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ExtractionChunk:
    content: str
    page_number: int | None = None
    section_title: str | None = None
    chunk_index: int = 0


@dataclass
class ExtractionResult:
    chunks: list[ExtractionChunk] = field(default_factory=list)
    page_count: int | None = None
    error: str | None = None

    @property
    def success(self) -> bool:
        return self.error is None and len(self.chunks) > 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_text(text: str) -> str:
    """Collapse whitespace and remove control characters."""
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_into_chunks(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
    page_number: int | None = None,
    section_title: str | None = None,
) -> list[ExtractionChunk]:
    """Split a text block into overlapping chunks by sentence boundaries."""
    text = text.strip()
    if not text:
        return []

    # Split on sentence boundaries first
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[ExtractionChunk] = []
    current: list[str] = []
    current_len = 0

    for sentence in sentences:
        sentence_len = len(sentence)
        if current_len + sentence_len > chunk_size and current:
            chunk_text = " ".join(current).strip()
            if chunk_text:
                chunks.append(
                    ExtractionChunk(
                        content=chunk_text,
                        page_number=page_number,
                        section_title=section_title,
                    )
                )
            # keep overlap
            overlap_sentences: list[str] = []
            overlap_len = 0
            for s in reversed(current):
                if overlap_len + len(s) <= overlap:
                    overlap_sentences.insert(0, s)
                    overlap_len += len(s) + 1
                else:
                    break
            current = overlap_sentences
            current_len = overlap_len

        current.append(sentence)
        current_len += sentence_len + 1

    if current:
        chunk_text = " ".join(current).strip()
        if chunk_text:
            chunks.append(
                ExtractionChunk(
                    content=chunk_text,
                    page_number=page_number,
                    section_title=section_title,
                )
            )

    return chunks


def _index_chunks(chunks: list[ExtractionChunk]) -> list[ExtractionChunk]:
    for i, c in enumerate(chunks):
        c.chunk_index = i
    return chunks


# ---------------------------------------------------------------------------
# Format extractors
# ---------------------------------------------------------------------------

def _extract_pdf(content: bytes) -> ExtractionResult:
    """Extract text from PDF using pdfminer.six, page by page."""
    try:
        from pdfminer.high_level import extract_pages
        from pdfminer.layout import LTTextContainer, LTAnno, LTChar
        from pdfminer.pdfdocument import PDFPasswordIncorrect, PDFTextExtractionNotAllowed
    except ImportError:
        return ExtractionResult(error="pdfminer.six is not installed. Run: pip install pdfminer.six")

    try:
        pdf_file = io.BytesIO(content)
        all_chunks: list[ExtractionChunk] = []
        page_count = 0

        try:
            for page_num, page_layout in enumerate(extract_pages(pdf_file), start=1):
                page_count += 1
                page_texts: list[str] = []

                for element in page_layout:
                    if isinstance(element, LTTextContainer):
                        page_texts.append(element.get_text())

                page_text = _normalize_text("".join(page_texts))
                if page_text:
                    all_chunks.extend(
                        _split_into_chunks(page_text, page_number=page_num)
                    )
        except PDFPasswordIncorrect:
            return ExtractionResult(error="This PDF is encrypted and requires a password.")
        except PDFTextExtractionNotAllowed:
            return ExtractionResult(error="This PDF does not allow text extraction.")

        if not all_chunks:
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(content))
                page_count = len(reader.pages)
                for page_num, page in enumerate(reader.pages, start=1):
                    t = page.extract_text() or ""
                    t_clean = _normalize_text(t)
                    if t_clean:
                        all_chunks.extend(_split_into_chunks(t_clean, page_number=page_num))
            except Exception:
                pass

        if not all_chunks:
            return ExtractionResult(error="No extractable text found in this PDF. It may be a scanned image.")

        return ExtractionResult(
            chunks=_index_chunks(all_chunks),
            page_count=page_count,
        )

    except Exception as exc:
        logger.exception("PDF extraction failed")
        return ExtractionResult(error=f"PDF extraction error: {exc}")


def _extract_docx(content: bytes) -> ExtractionResult:
    """Extract text from DOCX using python-docx, grouped by heading sections."""
    try:
        import docx  # python-docx
    except ImportError:
        return ExtractionResult(error="python-docx is not installed. Run: pip install python-docx")

    try:
        doc = docx.Document(io.BytesIO(content))
        all_chunks: list[ExtractionChunk] = []
        current_section: str | None = None
        current_paragraphs: list[str] = []

        def flush_section() -> None:
            if current_paragraphs:
                text = _normalize_text("\n".join(current_paragraphs))
                if text:
                    all_chunks.extend(
                        _split_into_chunks(text, section_title=current_section)
                    )

        for para in doc.paragraphs:
            if para.style.name.startswith("Heading"):
                flush_section()
                current_section = para.text.strip() or None
                current_paragraphs = []
            else:
                text = para.text.strip()
                if text:
                    current_paragraphs.append(text)

        flush_section()

        if not all_chunks:
            return ExtractionResult(error="No extractable text found in this DOCX file.")

        return ExtractionResult(chunks=_index_chunks(all_chunks))

    except Exception as exc:
        logger.exception("DOCX extraction failed")
        return ExtractionResult(error=f"DOCX extraction error: {exc}")


def _extract_pptx(content: bytes) -> ExtractionResult:
    """Extract text from PPTX using python-pptx, slide by slide."""
    try:
        from pptx import Presentation
        from pptx.util import Pt
    except ImportError:
        return ExtractionResult(error="python-pptx is not installed. Run: pip install python-pptx")

    try:
        prs = Presentation(io.BytesIO(content))
        all_chunks: list[ExtractionChunk] = []
        page_count = len(prs.slides)

        for slide_num, slide in enumerate(prs.slides, start=1):
            slide_texts: list[str] = []
            slide_title: str | None = None

            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text:
                    text = shape.text.strip()
                    if not text:
                        continue
                    # Attempt to pick up slide title
                    if shape.has_text_frame and slide_title is None:
                        try:
                            if shape.shape_type == 13:  # MSO_SHAPE_TYPE.PICTURE
                                pass
                            elif "Title" in shape.name or (
                                shape.text_frame and shape.text_frame.paragraphs
                                and any(
                                    p.runs and p.runs[0].font.bold
                                    for p in shape.text_frame.paragraphs
                                )
                            ):
                                slide_title = text
                        except Exception:
                            pass
                    slide_texts.append(text)

            slide_text = _normalize_text("\n".join(slide_texts))
            if slide_text:
                all_chunks.extend(
                    _split_into_chunks(
                        slide_text,
                        page_number=slide_num,
                        section_title=slide_title or f"Slide {slide_num}",
                    )
                )

        if not all_chunks:
            return ExtractionResult(error="No extractable text found in this PPTX file.")

        return ExtractionResult(
            chunks=_index_chunks(all_chunks),
            page_count=page_count,
        )

    except Exception as exc:
        logger.exception("PPTX extraction failed")
        return ExtractionResult(error=f"PPTX extraction error: {exc}")


def _extract_text(content: bytes) -> ExtractionResult:
    """Extract plain text or Markdown using UTF-8 with latin-1 fallback."""
    try:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1", errors="replace")

        text = _normalize_text(text)
        if not text:
            return ExtractionResult(error="This text file appears to be empty.")

        chunks = _split_into_chunks(text)
        return ExtractionResult(chunks=_index_chunks(chunks))

    except Exception as exc:
        logger.exception("Text extraction failed")
        return ExtractionResult(error=f"Text extraction error: {exc}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_upload(
    filename: str,
    content: bytes,
    mime_type: str | None = None,
) -> str | None:
    """Return an error string if the upload is invalid, else None."""
    if len(content) == 0:
        return "Uploaded file is empty."

    if len(content) > MAX_FILE_SIZE_BYTES:
        mb = MAX_FILE_SIZE_BYTES // (1024 * 1024)
        return f"File exceeds the maximum allowed size of {mb} MB."

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        return f"Unsupported file type '.{ext}'. Supported: {supported}."

    return None


def detect_source_type(filename: str) -> str:
    """Return the canonical source_type string from a filename."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
    mapping = {
        "pdf": "pdf",
        "docx": "docx",
        "doc": "docx",
        "pptx": "pptx",
        "ppt": "pptx",
        "txt": "txt",
        "md": "txt",
        "markdown": "txt",
    }
    return mapping.get(ext, "txt")


def extract_text(filename: str, content: bytes) -> ExtractionResult:
    """Dispatch to the correct extractor based on file extension."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"

    if ext == "pdf":
        return _extract_pdf(content)
    if ext in ("docx", "doc"):
        return _extract_docx(content)
    if ext in ("pptx", "ppt"):
        return _extract_pptx(content)
    if ext in ("txt", "md", "markdown"):
        return _extract_text(content)

    return ExtractionResult(error=f"No extractor for extension '.{ext}'.")


# ---------------------------------------------------------------------------
# Lexical relevance retrieval (BM25-style TF-IDF approximation)
# ---------------------------------------------------------------------------

def score_chunks_for_query(
    query: str,
    chunks: list[Any],  # list of SourceChunk ORM objects
    top_k: int = 10,
) -> list[Any]:
    """
    Return the top-k chunks most relevant to the query using a simple
    TF-IDF-inspired term frequency scoring.

    Falls back to returning the first top_k chunks when the query is empty.
    This is a deterministic lexical fallback — no vector embeddings required.
    """
    if not chunks:
        return []

    query_terms = set(re.findall(r"\b\w{3,}\b", query.lower()))
    if not query_terms:
        return chunks[:top_k]

    scored: list[tuple[float, Any]] = []
    for chunk in chunks:
        text = (chunk.content or "").lower()
        words = re.findall(r"\b\w{3,}\b", text)
        if not words:
            continue
        word_count = len(words)
        term_freq = sum(words.count(term) for term in query_terms)
        score = term_freq / word_count if word_count > 0 else 0.0
        scored.append((score, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored[:top_k]]


# ---------------------------------------------------------------------------
# SSRF Protection & URL Text Extraction
# ---------------------------------------------------------------------------

def is_ip_private_or_restricted(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True if IP is private, loopback, link-local, reserved, multicast, or unspecified."""
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def validate_public_url(url_str: str) -> tuple[bool, str | None, str | None]:
    """Validate that url_str is a publicly accessible HTTP/HTTPS URL and not an SSRF target.

    Returns (is_valid, resolved_ip, error_message).
    """
    clean_url = url_str.strip()
    try:
        parsed = urlsplit(clean_url)
    except Exception as exc:
        return False, None, f"Invalid URL format: {exc}"

    if parsed.scheme.lower() not in ("http", "https"):
        return False, None, "Unsupported protocol. Only HTTP and HTTPS URLs are supported."

    hostname = parsed.hostname
    if not hostname:
        return False, None, "URL must include a valid hostname."

    lower_host = hostname.lower()

    # Disallow known loopback, local and cloud metadata identifiers directly
    if lower_host in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        return False, None, "Access to localhost or loopback addresses is forbidden."

    if lower_host in ("metadata.google.internal", "instance-data"):
        return False, None, "Access to internal cloud metadata endpoints is forbidden."

    # Disallow non-standard ports to prevent port scanning
    if parsed.port and parsed.port not in (80, 443, 8080, 8443):
        return (
            False,
            None,
            f"Port {parsed.port} is not permitted. Only standard web ports (80, 443, 8080, 8443) are allowed.",
        )

    # Check if hostname itself is an IP literal
    try:
        direct_ip = ipaddress.ip_address(lower_host)
        if is_ip_private_or_restricted(direct_ip):
            return False, str(direct_ip), f"Access to private/restricted IP address ({direct_ip}) is forbidden."
    except ValueError:
        pass

    # Resolve hostname via DNS
    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False, None, f"Could not resolve domain name '{hostname}'."
    except Exception as exc:
        return False, None, f"DNS resolution failed: {exc}"

    if not addr_info:
        return False, None, f"Could not resolve domain name '{hostname}'."

    resolved_ip = None
    for item in addr_info:
        sockaddr = item[4]
        ip_str = sockaddr[0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            if is_ip_private_or_restricted(ip_obj):
                return False, ip_str, f"Domain resolves to a restricted or private IP address ({ip_str})."
            if not resolved_ip:
                resolved_ip = ip_str
        except ValueError:
            return False, None, f"Invalid IP address resolved: {ip_str}"

    return True, resolved_ip, None


async def safe_fetch_url(
    url_str: str,
    max_redirects: int = 3,
    max_size_bytes: int = 15 * 1024 * 1024,
) -> tuple[bytes, str, str]:
    """Fetch URL with SSRF checks on every hop and redirect.

    Returns (content_bytes, content_type, final_url).
    Raises ValueError on SSRF, redirect loops, or non-200 responses.
    """
    current_url = url_str.strip()

    for hop in range(max_redirects + 1):
        is_valid, _, error = validate_public_url(current_url)
        if not is_valid:
            raise ValueError(error or "URL failed security validation.")

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36 SmartLearningPlanner/1.0"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml,text/plain,application/pdf,*/*;q=0.8",
        }

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            try:
                response = await client.get(current_url, headers=headers)
            except httpx.TimeoutException:
                raise ValueError("The request to the URL timed out.")
            except httpx.RequestError as exc:
                raise ValueError(f"Could not connect to URL: {exc}")

        if response.status_code in (301, 302, 303, 307, 308):
            redirect_target = response.headers.get("Location")
            if not redirect_target:
                raise ValueError(f"HTTP redirect {response.status_code} missing Location header.")
            current_url = urljoin(current_url, redirect_target)
            continue

        if response.is_error:
            raise ValueError(f"The web server returned HTTP {response.status_code}.")

        content = response.content
        if len(content) > max_size_bytes:
            raise ValueError(f"Content exceeds size limit of {max_size_bytes // (1024 * 1024)} MB.")

        content_type = response.headers.get("content-type", "").lower()
        return content, content_type, current_url

    raise ValueError(f"Exceeded maximum allowed redirects ({max_redirects}).")


def extract_text_from_html(html_bytes: bytes, fallback_title: str) -> tuple[str, str]:
    """Extract clean readable text and title from HTML bytes using lxml.

    Returns (extracted_text, title).
    """
    try:
        import lxml.html
        doc = lxml.html.fromstring(html_bytes)
    except Exception:
        # Fallback to regex text extraction if lxml parsing fails
        raw = html_bytes.decode("utf-8", errors="replace")
        no_tags = re.sub(r"<[^>]+>", " ", raw)
        return _normalize_text(no_tags), fallback_title

    # Remove non-content elements
    for element in doc.xpath(
        "//script | //style | //nav | //header | //footer | //aside | //noscript | //svg | //iframe"
    ):
        try:
            element.drop_tree()
        except Exception:
            pass

    title_elem = doc.find(".//title")
    title = (title_elem.text.strip() if title_elem is not None and title_elem.text else None)
    if not title:
        h1 = doc.find(".//h1")
        title = (h1.text_content().strip() if h1 is not None else None)
    final_title = title or fallback_title

    # Extract text with newline spacing between blocks
    text_content = doc.text_content()
    cleaned = _normalize_text(text_content)
    return cleaned, final_title


def extract_content_from_url(url: str, content: bytes, content_type: str) -> tuple[ExtractionResult, str]:
    """Extract chunks and title from fetched URL content."""
    parsed = urlsplit(url)
    fallback_title = f"{parsed.netloc}{parsed.path}" if parsed.path and parsed.path != "/" else parsed.netloc

    # Case 1: PDF Document
    if "application/pdf" in content_type or parsed.path.lower().endswith(".pdf"):
        res = _extract_pdf(content)
        return res, fallback_title

    # Case 2: Plain Text / Markdown
    if "text/plain" in content_type or parsed.path.lower().endswith((".txt", ".md")):
        res = _extract_text(content)
        return res, fallback_title

    # Case 3: HTML / Web Page
    text, title = extract_text_from_html(content, fallback_title)
    if len(text) < 50:
        return (
            ExtractionResult(
                error=(
                    "No usable textual content could be extracted from this URL. "
                    "The page may require JavaScript or authentication."
                )
            ),
            title,
        )

    chunks = _split_into_chunks(text)
    if not chunks:
        return (
            ExtractionResult(
                error="Could not split page content into study chunks."
            ),
            title,
        )

    return ExtractionResult(chunks=_index_chunks(chunks)), title

