"""Session persistence — saves/loads conversation sessions to disk as JSON."""

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from agent.rag_agent import Message, Session

logger = logging.getLogger(__name__)


class SessionStore:
    """Thread-safe persistent store for conversation sessions.

    Sessions are saved as individual JSON files under ``store_dir``.
    Filenames use the session ID, making lookups O(1).
    """

    def __init__(self, store_dir: str):
        self.store_dir = Path(store_dir)
        self.store_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    # ── Path helpers ────────────────────────────────────────────

    def _session_path(self, session_id: str) -> Path:
        return self.store_dir / f"{session_id}.json"

    # ── Serialization ─────────────────────────────────────────

    @staticmethod
    def _session_to_dict(session: Session) -> dict:
        return {
            "id": session.id,
            "title": session.title,
            "created_at": session.created_at.isoformat() if session.created_at else None,
            "updated_at": session.updated_at.isoformat() if session.updated_at else None,
            "history": [
                {
                    "role": m.role,
                    "content": m.content,
                    "timestamp": m.timestamp.isoformat() if m.timestamp else None,
                }
                for m in session.history
            ],
        }

    @staticmethod
    def _dict_to_session(data: dict) -> Session:
        session = Session(id=data.get("id", "unknown"))
        session.title = data.get("title")

        # Parse timestamps
        created_at = data.get("created_at")
        if created_at:
            try:
                session.created_at = datetime.fromisoformat(created_at)
            except (ValueError, TypeError):
                session.created_at = datetime.now(timezone.utc)
        else:
            session.created_at = datetime.now(timezone.utc)

        updated_at = data.get("updated_at")
        if updated_at:
            try:
                session.updated_at = datetime.fromisoformat(updated_at)
            except (ValueError, TypeError):
                session.updated_at = datetime.now(timezone.utc)
        else:
            session.updated_at = datetime.now(timezone.utc)

        session.history = []
        for m in data.get("history", []):
            msg = Message(role=m.get("role", "unknown"), content=m.get("content", ""))
            ts = m.get("timestamp")
            if ts:
                try:
                    msg.timestamp = datetime.fromisoformat(ts)
                except (ValueError, TypeError):
                    msg.timestamp = None
            session.history.append(msg)

        return session

    # ── Public API ──────────────────────────────────────────────

    def save(self, session: Session) -> None:
        """Persist a single session to disk."""
        # Ensure timestamps are set
        if session.created_at is None:
            session.created_at = datetime.now(timezone.utc)
        session.updated_at = datetime.now(timezone.utc)

        with self._lock:
            path = self._session_path(session.id)
            tmp = path.with_suffix(".json.tmp")
            try:
                tmp.write_text(json.dumps(self._session_to_dict(session), indent=2), encoding="utf-8")
                tmp.replace(path)  # atomic on POSIX
            except OSError as exc:
                logger.error("[session_store] failed to save session %s: %s", session.id, exc)
                raise

    def load(self, session_id: str) -> Optional[Session]:
        """Load a session by ID. Returns None if not found."""
        path = self._session_path(session_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return self._dict_to_session(data)
        except (json.JSONDecodeError, KeyError, TypeError, OSError) as exc:
            logger.warning("[session_store] corrupt session file %s: %s", path, exc)
            return None

    def delete(self, session_id: str) -> bool:
        """Delete a persisted session. Returns True if it existed."""
        path = self._session_path(session_id)
        with self._lock:
            if path.exists():
                try:
                    path.unlink()
                    return True
                except OSError as exc:
                    logger.error("[session_store] failed to delete session %s: %s", session_id, exc)
                    return False
            return False

    def list_sessions(self) -> list[str]:
        """Return all persisted session IDs."""
        try:
            return sorted(p.stem for p in self.store_dir.glob("*.json"))
        except OSError as exc:
            logger.error("[session_store] failed to list sessions: %s", exc)
            return []

    def load_all(self) -> dict[str, Session]:
        """Load all persisted sessions. Skips corrupt files."""
        sessions: dict[str, Session] = {}
        for sid in self.list_sessions():
            session = self.load(sid)
            if session is not None:
                sessions[sid] = session
        return sessions

    def get_session_info(self, session_id: str) -> Optional[dict]:
        """Get metadata about a session without loading full history."""
        path = self._session_path(session_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return {
                "id": data.get("id"),
                "title": data.get("title"),
                "created_at": data.get("created_at"),
                "updated_at": data.get("updated_at"),
                "message_count": len(data.get("history", [])),
            }
        except (json.JSONDecodeError, OSError):
            return None
