"""
Document preparation: PII scanning/redaction, page-aware extraction, and
semantic chunking.

Upgraded from the original sliding-window chunker to the paragraph/sentence
-aware "Tier 1" chunker validated in the Colab notebook — chunks now always
end on a real sentence boundary (never cut a fact in half), and PDF
extraction keeps page numbers so citations can point to a real page, not
just a filename.
"""
import re

# Deliberately conservative patterns — false positives (over-redacting) are
# safer than false negatives in a banking context.
PII_PATTERNS = {
    "pan": re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"),
    "aadhaar": re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b"),
    "phone": re.compile(r"\b(?:\+91[-\s]?)?[6-9]\d{9}\b"),
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    "account_number": re.compile(r"\b\d{9,18}\b"),
    "card_number": re.compile(r"\b(?:\d[ -]*?){13,16}\b"),
}


def redact_pii(text: str) -> tuple[str, bool]:
    """Returns (redacted_text, was_anything_found)."""
    found = False
    redacted = text
    for label, pattern in PII_PATTERNS.items():
        def _sub(m, label=label):
            nonlocal found
            found = True
            return f"[REDACTED_{label.upper()}]"
        redacted = pattern.sub(_sub, redacted)
    return redacted, found


# --------------------------------------------------------------- extraction
def extract_pdf_pages(file_bytes: bytes) -> list[tuple[int, str]]:
    """Returns [(page_number, text), ...] — 1-indexed pages, so citations
    can report a real page number."""
    from pypdf import PdfReader
    import io
    reader = PdfReader(io.BytesIO(file_bytes))
    return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]


def extract_pdf_text(file_bytes: bytes) -> str:
    """Kept for backward compatibility with any caller that just wants the
    flat text (e.g. quick sanity checks)."""
    return "\n".join(t for _, t in extract_pdf_pages(file_bytes))


# ----------------------------------------------------------------- chunking
_CLEAN_RE = re.compile(r"[^\x09\x0A\x0D\x20-\x7E]")
_WS_RE = re.compile(r"[ \t]+")
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")


def _clean_text(text: str) -> str:
    text = _CLEAN_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text)
    return text.strip()


def _split_into_sentences(paragraph: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(paragraph) if s.strip()]


def semantic_chunk_page(text: str, target_chars: int = 700, max_chars: int = 900,
                         overlap_sentences: int = 1) -> list[str]:
    """Paragraph-aware, sentence-boundary-respecting chunking. Never cuts a
    sentence in half. Returns a list of chunk strings."""
    text = _clean_text(text)
    if not text:
        return []
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n|\n(?=[A-Z][a-z]+ ?\d*\.?\s*$)", text) if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    chunks: list[str] = []
    current_sentences: list[str] = []
    current_len = 0

    def flush():
        if current_sentences:
            chunks.append(" ".join(current_sentences).strip())

    for para in paragraphs:
        sentences = _split_into_sentences(para) or [para]
        for sent in sentences:
            if current_len + len(sent) > max_chars and current_sentences:
                flush()
                carry = current_sentences[-overlap_sentences:] if overlap_sentences else []
                current_sentences = list(carry)
                current_len = sum(len(s) for s in current_sentences)
            current_sentences.append(sent)
            current_len += len(sent)
            if current_len >= target_chars:
                flush()
                current_sentences, current_len = [], 0
    flush()
    return chunks


def is_probably_real_text(chunk: str, min_alpha_ratio: float = 0.55, min_words: int = 8) -> bool:
    letters = sum(c.isalpha() for c in chunk)
    if len(chunk) == 0 or letters / len(chunk) < min_alpha_ratio:
        return False
    if len(chunk.split()) < min_words:
        return False
    return True


def chunk_pages(pages: list[tuple[int, str]]) -> list[dict]:
    """Turns [(page_num, text), ...] into a flat list of chunk dicts:
    {text, page, chunk_index}. Drops garbage/near-empty chunks."""
    out = []
    idx = 0
    for page_num, page_text in pages:
        redacted_text, _ = redact_pii(page_text)
        for c in semantic_chunk_page(redacted_text):
            if is_probably_real_text(c):
                out.append({"text": c, "page": page_num, "chunk_index": idx})
                idx += 1
    return out


def chunk_text(text: str) -> list[dict]:
    """Same semantic chunker for pasted text with no page structure —
    everything reported as page 1."""
    redacted_text, _ = redact_pii(text)
    out = []
    for i, c in enumerate(semantic_chunk_page(redacted_text)):
        if is_probably_real_text(c):
            out.append({"text": c, "page": 1, "chunk_index": i})
    return out
