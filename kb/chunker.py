"""Document chunker — splits text into semantically-aware overlapping chunks."""

import re
from dataclasses import dataclass


@dataclass
class Chunk:
    """A single text chunk with metadata."""

    text: str
    source: str
    chunk_index: int
    start_char: int
    end_char: int


# Pre-compile regex for sentence splitting performance
_SENTENCE_PATTERN = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")


def _split_into_sentences(text: str) -> list[str]:
    """Split text into sentences, preserving sentence delimiters."""
    sentences = _SENTENCE_PATTERN.split(text)
    # Clean up and filter out empty strings
    return [s.strip() for s in sentences if s.strip()]


def _split_into_paragraphs(text: str) -> list[str]:
    """Split text into paragraphs (separated by blank lines)."""
    paragraphs = text.split("\n\n")
    return [p.strip() for p in paragraphs if p.strip()]


def _find_word_boundary(text: str, pos: int, direction: int = -1) -> int:
    """Find the nearest word boundary (space or newline) from pos.

    Args:
        text: The text to search in.
        pos: The starting position.
        direction: -1 to look backwards, 1 to look forwards.

    Returns:
        The position of the nearest word boundary, or pos if none found.
    """
    if direction == -1:
        # Look backwards
        for i in range(pos, max(0, pos - 50), -1):
            if text[i] in (" ", "\n", "\t"):
                return i + 1
        return max(0, pos - 50)
    else:
        # Look forwards
        for i in range(pos, min(len(text), pos + 50)):
            if text[i] in (" ", "\n", "\t"):
                return i
        return min(len(text), pos + 50)


def chunk_text(
    text: str,
    source: str,
    chunk_size: int = 512,
    chunk_overlap: int = 64,
    min_chunk_size: int = 100,
) -> list[Chunk]:
    """Split text into overlapping chunks with sentence and paragraph awareness.

    Uses a multi-level boundary strategy:
    1. Try to break at paragraph boundaries (\n\n)
    2. Fall back to sentence boundaries (.!?)
    3. Fall back to word boundaries (space)
    4. Last resort: fixed-size boundary

    Args:
        text: The text to chunk.
        source: Source identifier for the chunk metadata.
        chunk_size: Target size (in characters) for each chunk.
        chunk_overlap: Number of characters of overlap between chunks.
        min_chunk_size: Minimum chunk size; chunks smaller than this are merged
                       with the next chunk if possible.

    Returns:
        A list of Chunk objects.
    """
    if not text or not text.strip():
        return []

    text = text.strip()
    chunks: list[Chunk] = []
    idx = 0
    char_pos = 0

    while char_pos < len(text):
        # Define the window for this chunk
        window_end = min(char_pos + chunk_size, len(text))

        # Strategy 1: Try paragraph boundary
        if window_end < len(text):
            # Look for \n\n within the window
            search_text = text[char_pos:window_end]
            last_para = search_text.rfind("\n\n")
            if last_para != -1 and last_para > chunk_size // 4:
                window_end = char_pos + last_para
            else:
                # Strategy 2: Try sentence boundary
                # Search backwards from the end of the window
                search_end = min(window_end, char_pos + chunk_size)
                for sep in [". ", "? ", "! ", "。", "？", "！"]:
                    last_sep = text[char_pos:search_end].rfind(sep)
                    if last_sep != -1 and last_sep > chunk_size // 4:
                        window_end = char_pos + last_sep + len(sep)
                        break
                else:
                    # Strategy 3: Word boundary
                    word_boundary = _find_word_boundary(text, window_end, direction=-1)
                    if word_boundary > char_pos + chunk_size // 4:
                        window_end = word_boundary

        # Extract and clean the chunk
        chunk_content = text[char_pos:window_end].strip()
        if not chunk_content:
            # Avoid infinite loop: advance at least 1 character
            char_pos += 1
            continue

        # Skip very short chunks at the end (merge with previous)
        if len(chunk_content) < min_chunk_size and chunks:
            # Merge with previous chunk
            prev = chunks[-1]
            merged_text = text[prev.start_char : window_end].strip()
            chunks[-1] = Chunk(
                text=merged_text,
                source=source,
                chunk_index=prev.chunk_index,
                start_char=prev.start_char,
                end_char=window_end,
            )
        else:
            chunks.append(
                Chunk(
                    text=chunk_content,
                    source=source,
                    chunk_index=idx,
                    start_char=char_pos,
                    end_char=window_end,
                )
            )
            idx += 1

        # Advance with overlap
        advance = window_end - char_pos - chunk_overlap
        if advance <= 0:
            advance = max(1, window_end - char_pos)
        char_pos += advance

    return chunks


def chunk_text_preserving_structure(
    text: str,
    source: str,
    chunk_size: int = 512,
    chunk_overlap: int = 64,
) -> list[Chunk]:
    """Alternative chunking strategy that preserves document structure.

    This variant tries to keep paragraphs together when possible, only splitting
    when a paragraph exceeds the chunk_size.

    Args:
        text: The text to chunk.
        source: Source identifier for the chunk metadata.
        chunk_size: Target size (in characters) for each chunk.
        chunk_overlap: Number of characters of overlap between chunks.

    Returns:
        A list of Chunk objects.
    """
    if not text or not text.strip():
        return []

    paragraphs = _split_into_paragraphs(text)
    if not paragraphs:
        return []

    chunks: list[Chunk] = []
    idx = 0
    current_chunk: list[str] = []
    current_size = 0
    char_pos = 0

    for paragraph in paragraphs:
        para_size = len(paragraph)

        # If adding this paragraph would exceed chunk_size, finalize current chunk
        if current_chunk and current_size + para_size > chunk_size:
            combined_text = "\n\n".join(current_chunk).strip()
            if combined_text:
                chunk_len = len(combined_text)
                chunks.append(
                    Chunk(
                        text=combined_text,
                        source=source,
                        chunk_index=idx,
                        start_char=char_pos,
                        end_char=char_pos + chunk_len,
                    )
                )
                char_pos += chunk_len
                idx += 1
            current_chunk = []
            current_size = 0

        # Single paragraph too large? Use standard chunker for it
        if para_size > chunk_size:
            # Finalize any pending chunk first
            if current_chunk:
                combined_text = "\n\n".join(current_chunk).strip()
                if combined_text:
                    chunk_len = len(combined_text)
                    chunks.append(
                        Chunk(
                            text=combined_text,
                            source=source,
                            chunk_index=idx,
                            start_char=char_pos,
                            end_char=char_pos + chunk_len,
                        )
                    )
                    char_pos += chunk_len
                    idx += 1
                current_chunk = []
                current_size = 0

            # Chunk the oversized paragraph
            sub_chunks = chunk_text(paragraph, source, chunk_size, chunk_overlap)
            for sc in sub_chunks:
                sc.chunk_index = idx
                chunks.append(sc)
                idx += 1
            char_pos += len(paragraph)
        else:
            current_chunk.append(paragraph)
            current_size += para_size

    # Finalize remaining chunk
    if current_chunk:
        chunk_text_str = "\n\n".join(current_chunk).strip()
        if chunk_text_str:
            chunks.append(
                Chunk(
                    text=chunk_text_str,
                    source=source,
                    chunk_index=idx,
                    start_char=char_pos,
                    end_char=char_pos + len(chunk_text_str),
                )
            )

    return chunks
