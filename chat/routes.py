"""API routes — REST and WebSocket endpoints for agent chat + KB management."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.rag_agent import LLMError, RAGAgent, SessionNotFoundError
from kb.ingest import ingest_documents, ingest_file, ingest_text
from kb.vector_store import VectorStore

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Shared state (initialized at startup) ──────────────────────────
_agent: RAGAgent | None = None
_store: VectorStore | None = None


def set_agent(agent: RAGAgent) -> None:
    global _agent
    _agent = agent


def set_store(store: VectorStore) -> None:
    global _store
    _store = store


def _get_agent() -> RAGAgent:
    if _agent is None:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    return _agent


def _get_store() -> VectorStore:
    if _store is None:
        raise HTTPException(status_code=503, detail="Knowledge base not initialized")
    return _store


# ── Request / Response models ──────────────────────────────────────


class CreateSessionResponse(BaseModel):
    session_id: str
    title: str | None = None


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    session_id: str
    answer: str


class IngestTextRequest(BaseModel):
    text: str
    source: str = "api-upload"


class IngestFileRequest(BaseModel):
    file_path: str


class IngestResponse(BaseModel):
    chunks_added: int


class KBStatusResponse(BaseModel):
    total_chunks: int
    index_ready: bool


class HealthResponse(BaseModel):
    status: str
    kb_chunks: int


class SessionHistoryResponse(BaseModel):
    session_id: str
    title: str | None
    messages: list[dict]


class SessionListItem(BaseModel):
    session_id: str
    title: str | None


class ErrorResponse(BaseModel):
    detail: str


# ── Constants ───────────────────────────────────────────────────────

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB

# Supported file extensions for upload
SUPPORTED_EXTENSIONS = {
    ".txt",
    ".md",
    ".py",
    ".json",
    ".yaml",
    ".yml",
    ".csv",
    ".html",
    ".xml",
    ".rst",
    ".pdf",
    ".docx",
}

# ── Security helpers ────────────────────────────────────────────────


def _sanitize_filename(name: str) -> str:
    """Sanitize an uploaded filename to prevent path traversal."""
    # Strip directory components
    name = os.path.basename(name)
    # Remove any remaining path separators or null bytes
    name = name.replace("\0", "")
    # Only allow alphanumeric, dots, dashes, underscores
    name = re.sub(r"[^\w.\-]", "_", name)
    # Prevent empty names
    if not name or name.startswith("."):
        name = "upload_" + name
    return name


# ── Helpers ─────────────────────────────────────────────────────────


async def _run_sync(func, *args):
    """Run a synchronous function in the default thread executor."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, func, *args)


def _consume_stream(agent, session_id, message, queue):
    """Run chat_stream in a worker thread, pushing events into the queue.

    chat_stream yields dicts: {"type": "reasoning"/"text"/"error", "content": str}.

    Puts ("reasoning", text), ("token", text), ("done", full_text), or
    ("error", msg) onto the queue. The generator is fully consumed
    inside the thread to avoid asyncio+StopIteration issues.
    """
    full_parts: list[str] = []
    had_error = False
    try:
        for event in agent.chat_stream(session_id, message):
            kind = event.get("type", "text")
            content = event.get("content", "")
            if kind == "reasoning":
                queue.put_nowait(("reasoning", content))
            elif kind == "text":
                full_parts.append(content)
                queue.put_nowait(("token", content))
            elif kind == "error":
                had_error = True
                queue.put_nowait(("error", content))
        # Only send "done" if we didn't already send an error mid-stream
        if not had_error:
            queue.put_nowait(("done", "".join(full_parts)))
    except Exception as exc:
        partial = "".join(full_parts)
        logger.error("[chat] stream error: %s (partial: %.200s)", exc, partial)
        queue.put_nowait(("error", f"{exc} | partial: {partial[:200]}"))


# ── Health ──────────────────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse)
async def health():
    agent = _get_agent()
    stats = agent.kb_stats()
    return HealthResponse(status="ok", kb_chunks=stats["total_chunks"])


class DetailedHealthResponse(BaseModel):
    """Detailed health check response with system info."""

    status: str
    version: str
    kb_chunks: int
    kb_index_ready: bool
    chat_model: str
    embedding_model: str
    embedding_dim: int
    active_sessions: int
    auth_enabled: bool
    rate_limit: str


@router.get("/health/detailed", response_model=DetailedHealthResponse)
async def health_detailed():
    """Detailed health check — returns system info, model config, and status."""

    from chat.auth import get_auth_key
    from config import config

    agent = _get_agent()
    stats = agent.kb_stats()
    auth_key = get_auth_key()

    return DetailedHealthResponse(
        status="ok",
        version="1.0.0",
        kb_chunks=stats["total_chunks"],
        kb_index_ready=stats["index_ready"],
        chat_model=config.nvidia.chat_model,
        embedding_model=config.nvidia.embedding_model,
        embedding_dim=config.nvidia.embedding_dim,
        active_sessions=len(agent.sessions),
        auth_enabled=auth_key is not None,
        rate_limit=os.environ.get("NV_AGENT_RATE_LIMIT", "60/minute"),
    )


class APIKeyValidationResponse(BaseModel):
    """Response for API key validation."""

    valid: bool
    model: str | None = None
    error: str | None = None


@router.get("/auth/validate", response_model=APIKeyValidationResponse)
async def validate_api_key():
    """Validate that the NVIDIA NIM API key is configured and working.

    Makes a lightweight API call to verify the key. Useful for
    checking setup before starting a full chat session.
    """
    from config import config

    if not config.nvidia.api_key:
        return APIKeyValidationResponse(
            valid=False,
            error="No API key configured. Set NVIDIA_NIM_API_KEY, NVIDIA_API_KEY, or NGC_API_KEY.",
        )

    try:
        from openai import OpenAI

        client = OpenAI(
            base_url=config.nvidia.base_url,
            api_key=config.nvidia.api_key,
        )
        # Minimal call to validate the key — list models (lightweight)
        client.models.list()
        return APIKeyValidationResponse(
            valid=True,
            model=config.nvidia.chat_model,
        )
    except Exception as exc:
        logger.warning("[auth] API key validation failed: %s", exc)
        return APIKeyValidationResponse(
            valid=False,
            error=str(exc)[:200],
        )


# ── Session endpoints ───────────────────────────────────────────────


@router.post("/sessions", response_model=CreateSessionResponse)
async def create_session(title: str | None = None):
    """Create a new conversation session."""
    agent = _get_agent()
    session = agent.create_session(title=title)
    return CreateSessionResponse(session_id=session.id, title=session.title)


@router.get("/sessions", response_model=list[SessionListItem])
async def list_sessions():
    """List all active sessions."""
    agent = _get_agent()
    sessions = agent.list_sessions()
    return [SessionListItem(session_id=sid, title=title) for sid, title in sessions]


@router.get("/sessions/{session_id}/history", response_model=SessionHistoryResponse)
async def get_session_history(session_id: str, limit: int = 50):
    """Get conversation history for a session."""
    agent = _get_agent()
    try:
        history = agent.get_session_history(session_id, limit=limit)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as exc:
        logger.error("[routes] failed to get session history: %s", exc)
        raise HTTPException(status_code=500, detail="Internal error")

    session = agent.get_session(session_id)
    return SessionHistoryResponse(
        session_id=session_id,
        title=session.title if session else None,
        messages=[{"role": m.role, "content": m.content} for m in history],
    )


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a conversation session."""
    agent = _get_agent()
    if not agent.delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"detail": "Session deleted"}


# ── Chat (REST, non-streaming) ──────────────────────────────────────


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Send a chat message and get a non-streaming response."""
    agent = _get_agent()
    try:
        answer = await _run_sync(agent.chat, req.session_id, req.message)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except LLMError as exc:
        logger.error("[routes] LLM error: %s", exc)
        raise HTTPException(status_code=502, detail="LLM service error")
    except Exception as exc:
        logger.error("[routes] unexpected chat error: %s", exc)
        raise HTTPException(status_code=500, detail="Internal error")
    return ChatResponse(session_id=req.session_id, answer=answer)


# ── Chat (REST, streaming via SSE) ──────────────────────────────────


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Send a chat message and get a streaming SSE response."""
    agent = _get_agent()
    queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()

    # Start the streaming generator in a worker thread
    asyncio.get_running_loop().run_in_executor(
        None, _consume_stream, agent, req.session_id, req.message, queue
    )

    async def event_stream():
        while True:
            kind, content = await queue.get()
            if kind == "token":
                yield f"data: {json.dumps({'token': content})}\n\n"
            elif kind == "reasoning":
                yield f"data: {json.dumps({'reasoning': content})}\n\n"
            elif kind == "done":
                yield "data: [DONE]\n\n"
                break
            elif kind == "error":
                yield f"data: {json.dumps({'error': content})}\n\n"
                yield "data: [DONE]\n\n"
                break

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ── Chat (WebSocket) ────────────────────────────────────────────────


@router.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket):
    await websocket.accept()
    agent = _get_agent()

    # Create a session for this WebSocket connection
    session = agent.create_session()
    await websocket.send_json({"type": "session", "session_id": session.id})

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                user_message = msg.get("message", "")
            except json.JSONDecodeError:
                user_message = data

            if not user_message.strip():
                continue

            # Stream the response via queue from worker thread
            queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()
            asyncio.get_running_loop().run_in_executor(
                None,
                _consume_stream,
                agent,
                session.id,
                user_message,
                queue,
            )

            while True:
                kind, content = await queue.get()
                if kind == "token":
                    await websocket.send_json({"type": "token", "content": content})
                elif kind == "reasoning":
                    await websocket.send_json({"type": "reasoning", "content": content})
                elif kind == "done":
                    await websocket.send_json({"type": "done", "full": content})
                    break
                elif kind == "error":
                    await websocket.send_json({"type": "error", "content": content})
                    await websocket.send_json({"type": "done", "full": ""})
                    break

    except WebSocketDisconnect:
        logger.info("[ws] client disconnected, cleaning up session %s", session.id)
        agent.delete_session(session.id)
    except Exception as exc:
        logger.error("[ws] unexpected error: %s", exc)
        try:
            await websocket.send_json({"type": "error", "content": f"Server error: {exc}"})
        except Exception:
            pass
        finally:
            agent.delete_session(session.id)


# ── Knowledge base management ───────────────────────────────────────


@router.get("/kb/status", response_model=KBStatusResponse)
async def kb_status():
    """Get knowledge base status."""
    store = _get_store()
    return KBStatusResponse(
        total_chunks=store.count,
        index_ready=store.index is not None,
    )


@router.post("/kb/ingest", response_model=IngestResponse)
async def kb_ingest_text(req: IngestTextRequest):
    """Ingest raw text into the knowledge base."""
    store = _get_store()
    try:
        n = await _run_sync(ingest_text, store, req.text, req.source)
    except Exception as exc:
        logger.error("[routes] text ingestion failed: %s", exc)
        raise HTTPException(status_code=500, detail="Ingestion failed")
    return IngestResponse(chunks_added=n)


@router.post("/kb/ingest-dir")
async def kb_ingest_dir():
    """Ingest all documents from the data directory."""
    store = _get_store()
    try:
        n = await _run_sync(ingest_documents, store)
    except Exception as exc:
        logger.error("[routes] directory ingestion failed: %s", exc)
        raise HTTPException(status_code=500, detail="Directory ingestion failed")
    return {"chunks_added": n, "data_dir": str(store.index_dir)}


@router.post("/kb/ingest-file", response_model=IngestResponse)
async def kb_ingest_file(req: IngestFileRequest):
    """Ingest a single file by path into the knowledge base."""
    store = _get_store()
    try:
        n = await _run_sync(ingest_file, store, req.file_path)
    except Exception as exc:
        logger.error("[routes] file ingestion failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"File ingestion failed: {exc}")
    return IngestResponse(chunks_added=n)


@router.post("/kb/upload", response_model=IngestResponse)
async def kb_upload_file(file: UploadFile = File(...)):
    """Upload a file (including PDF/DOCX) and ingest it into the knowledge base.

    Accepts multipart/form-data uploads. The file is saved to the data
    directory, then processed by the ingestion pipeline which supports
    .txt, .md, .py, .json, .yaml, .yml, .csv, .html, .xml, .rst,
    .pdf, and .docx.
    """
    store = _get_store()
    from config import config

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Supported: {sorted(SUPPORTED_EXTENSIONS)}",
        )

    # Sanitize the filename to prevent path traversal
    safe_name = _sanitize_filename(file.filename)

    # Read file content with size limit
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {len(content)} bytes (max {MAX_UPLOAD_SIZE // (1024 * 1024)} MB)",
        )

    # Save uploaded file to the data directory
    data_dir = config.kb.data_dir
    os.makedirs(data_dir, exist_ok=True)
    save_path = os.path.join(data_dir, safe_name)

    try:
        with open(save_path, "wb") as f:
            f.write(content)
        logger.info("[upload] saved %s (%d bytes)", safe_name, len(content))
    except Exception as exc:
        logger.error("[upload] failed to save file: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save file")

    # Ingest the saved file
    try:
        n = await _run_sync(ingest_file, store, save_path)
    except Exception as exc:
        logger.error("[upload] ingestion failed for %s: %s", safe_name, exc)
        # Clean up the file if ingestion failed
        try:
            os.remove(save_path)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail="Ingestion failed")

    return IngestResponse(chunks_added=n)


@router.delete("/kb/reset")
async def kb_reset():
    """Clear all knowledge base data."""
    store = _get_store()
    try:
        store.reset()
    except Exception as exc:
        logger.error("[routes] KB reset failed: %s", exc)
        raise HTTPException(status_code=500, detail="KB reset failed")
    return {"detail": "Knowledge base cleared"}
