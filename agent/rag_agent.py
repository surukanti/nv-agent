"""RAG Agent — retrieves from knowledge base and generates answers via NVIDIA LLM."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from openai import OpenAI

from config import config
from kb.vector_store import VectorStore

logger = logging.getLogger(__name__)


@dataclass
class Message:
    """A single conversation message with optional timestamp."""

    role: str  # "user" | "assistant" | "system"
    content: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class Session:
    """A conversation session with history and metadata."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    history: list[Message] = field(default_factory=list)
    title: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def add(self, role: str, content: str) -> None:
        """Add a message to the session history."""
        self.history.append(Message(role=role, content=content))
        self.updated_at = datetime.now(UTC)

    def to_openai_messages(self) -> list[dict]:
        """Convert history to OpenAI message format."""
        return [{"role": m.role, "content": m.content} for m in self.history]

    def get_recent_messages(self, limit: int = 50) -> list[Message]:
        """Get the most recent messages, up to the limit."""
        return self.history[-limit:] if len(self.history) > limit else self.history[:]

    def clear_history(self) -> None:
        """Clear all conversation history."""
        self.history = []
        self.updated_at = datetime.now(UTC)


RAG_SYSTEM_PROMPT = """\
You are a helpful AI assistant with access to a custom knowledge base.
When answering questions, use the provided context from the knowledge base to
ground your responses. If the context does not contain the answer, say so
honestly — do not fabricate information.

Guidelines:
- Always cite the source file when using information from the context.
- If the user's question is outside the scope of the knowledge base, provide a
general answer but clearly note that it is not from the knowledge base.
- Be concise but thorough.
- Format your responses in Markdown when helpful.
"""


class RAGAgentError(Exception):
    """Base exception for RAG agent errors."""

    pass


class SessionNotFoundError(RAGAgentError):
    """Raised when a session ID is not found."""

    pass


class LLMError(RAGAgentError):
    """Raised when the LLM API call fails."""

    pass


class RAGAgent:
    """Retrieval-Augmented Generation agent backed by NVIDIA LLM + FAISS KB."""

    def __init__(self, store: VectorStore, session_store: SessionStore | None = None):
        self.store = store
        self.sessions: dict[str, Session] = {}
        self._client: OpenAI | None = None
        self._session_store = session_store

        # Load persisted sessions on startup
        if self._session_store is not None:
            try:
                self.sessions = self._session_store.load_all()
                logger.info("[rag] loaded %d persisted session(s)", len(self.sessions))
            except Exception as exc:
                logger.error("[rag] failed to load persisted sessions: %s", exc)

    def _get_client(self) -> OpenAI:
        """Get or create the OpenAI client, validating the API key."""
        if self._client is None:
            if not config.nvidia.api_key:
                raise LLMError("NVIDIA_API_KEY is not set — cannot call LLM")
            self._client = OpenAI(
                base_url=config.nvidia.base_url,
                api_key=config.nvidia.api_key,
            )
        return self._client

    def _extra_body(self) -> dict:
        """Build the extra_body kwargs for Nemotron-style models.

        Nemotron models accept chat_template_kwargs for thinking/reasoning.
        """
        extra = {}
        if config.nvidia.enable_thinking:
            extra["chat_template_kwargs"] = {
                "enable_thinking": True,
            }
        if config.nvidia.reasoning_budget:
            extra["reasoning_budget"] = config.nvidia.reasoning_budget
        return extra

    # ── Session management ───────────────────────────────────────

    def _persist_session(self, session: Session) -> None:
        """Persist session to disk if a session store is configured."""
        if self._session_store is not None:
            try:
                self._session_store.save(session)
            except Exception as exc:
                logger.error("[rag] failed to persist session %s: %s", session.id, exc)

    def create_session(self, title: str | None = None) -> Session:
        """Create a new conversation session."""
        session = Session(title=title or "New Conversation")
        self.sessions[session.id] = session
        self._persist_session(session)
        return session

    def get_session(self, session_id: str) -> Session | None:
        """Get a session by ID, loading from disk if needed."""
        session = self.sessions.get(session_id)
        if session is None and self._session_store is not None:
            try:
                session = self._session_store.load(session_id)
                if session is not None:
                    self.sessions[session_id] = session
            except Exception as exc:
                logger.error("[rag] failed to load session %s: %s", session_id, exc)
        return session

    def delete_session(self, session_id: str) -> bool:
        """Delete a session from memory and disk."""
        existed = self.sessions.pop(session_id, None) is not None
        if self._session_store is not None:
            try:
                self._session_store.delete(session_id)
            except Exception as exc:
                logger.error("[rag] failed to delete persisted session %s: %s", session_id, exc)
        return existed

    def list_sessions(self) -> list[tuple[str, str | None]]:
        """List all known sessions (id, title)."""
        return [(sid, s.title) for sid, s in self.sessions.items()]

    def get_session_history(self, session_id: str, limit: int = 50) -> list[Message]:
        """Get conversation history for a session."""
        session = self.get_session(session_id)
        if session is None:
            raise SessionNotFoundError(f"Session {session_id} not found")
        return session.get_recent_messages(limit)

    # ── Core RAG logic ───────────────────────────────────────────

    def _retrieve_context(self, query: str, top_k: int | None = None) -> str:
        """Search the knowledge base and format retrieved chunks as context."""
        top_k = top_k or config.kb.top_k
        try:
            results = self.store.search(query, top_k=top_k)
        except Exception as exc:
            logger.error("[rag] knowledge base search failed: %s", exc)
            return "Error retrieving context from knowledge base."

        if not results:
            return "No relevant documents found in the knowledge base."

        parts: list[str] = []
        for r in results:
            source = r.chunk.source
            snippet = r.chunk.text
            parts.append(f"[Source: {source} (chunk {r.chunk.chunk_index})]\n{snippet}")

        return "\n\n---\n\n".join(parts)

    def _build_messages(self, session: Session, user_query: str) -> list[dict]:
        """Build the full message list for the LLM call."""
        # Retrieve context
        context = self._retrieve_context(user_query)

        # System prompt with injected context
        system_content = (
            f"{RAG_SYSTEM_PROMPT}\n\n--- Retrieved Knowledge Base Context ---\n\n{context}"
        )

        messages = [{"role": "system", "content": system_content}]
        # Add conversation history (excluding previous system messages)
        for m in session.history:
            if m.role != "system":
                messages.append({"role": m.role, "content": m.content})
        # Add the current user message
        messages.append({"role": "user", "content": user_query})

        return messages

    # ── Sync response ────────────────────────────────────────────

    def chat(self, session_id: str, user_query: str) -> str:
        """Synchronous (non-streaming) chat: returns the full response at once."""
        session = self.get_session(session_id)
        if session is None:
            raise SessionNotFoundError(f"Session {session_id} not found")

        session.add("user", user_query)
        messages = self._build_messages(session, user_query)

        try:
            client = self._get_client()
            completion = client.chat.completions.create(
                model=config.nvidia.chat_model,
                messages=messages,
                temperature=config.nvidia.temperature,
                top_p=config.nvidia.top_p,
                max_tokens=config.nvidia.max_tokens,
                stream=False,
                extra_body=self._extra_body(),
            )
        except Exception as exc:
            raise LLMError(f"LLM API call failed: {exc}")

        answer = completion.choices[0].message.content or ""
        session.add("assistant", answer)
        self._persist_session(session)
        return answer

    # ── Streaming response ───────────────────────────────────────

    def chat_stream(self, session_id: str, user_query: str):
        """Streaming chat: yields dicts with 'type' and 'content' keys.

        Yields:
            {"type": "reasoning", "content": "..."} — thinking/reasoning tokens
            {"type": "text", "content": "..."} — visible answer tokens
        """
        session = self.get_session(session_id)
        if session is None:
            raise SessionNotFoundError(f"Session {session_id} not found")

        session.add("user", user_query)
        messages = self._build_messages(session, user_query)

        try:
            client = self._get_client()
            completion = client.chat.completions.create(
                model=config.nvidia.chat_model,
                messages=messages,
                temperature=config.nvidia.temperature,
                top_p=config.nvidia.top_p,
                max_tokens=config.nvidia.max_tokens,
                stream=True,
                extra_body=self._extra_body(),
            )
        except Exception as exc:
            raise LLMError(f"LLM API stream failed: {exc}")

        full_response: list[str] = []
        try:
            for chunk in completion:
                if not getattr(chunk, "choices", None):
                    continue
                delta = chunk.choices[0].delta

                # Nemotron reasoning/thinking tokens (if present)
                reasoning = getattr(delta, "reasoning_content", None) or getattr(
                    delta, "thinking", None
                )
                if reasoning is not None:
                    yield {"type": "reasoning", "content": reasoning}

                # Normal text content
                if delta.content is not None:
                    full_response.append(delta.content)
                    yield {"type": "text", "content": delta.content}
        except Exception as exc:
            logger.error("[rag] stream interrupted: %s", exc)
            yield {"type": "error", "content": f"Stream interrupted: {exc}"}

        session.add("assistant", "".join(full_response))
        self._persist_session(session)

    # ── Knowledge base status ────────────────────────────────────

    def kb_stats(self) -> dict:
        return {
            "total_chunks": self.store.count,
            "index_ready": self.store.index is not None,
        }
