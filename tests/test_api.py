"""Integration tests for FastAPI endpoints — session, chat, and KB management."""

from unittest.mock import patch

# ── Health endpoint ──────────────────────────────────────────


class TestHealthEndpoint:
    """Tests for GET /api/health."""

    def test_health_returns_ok(self, app_client):
        response = app_client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "kb_chunks" in data


# ── Session endpoints ───────────────────────────────────────


class TestSessionEndpoints:
    """Tests for session CRUD via REST API."""

    def test_create_session(self, app_client):
        response = app_client.post("/api/sessions")
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert len(data["session_id"]) == 36

    def test_create_session_with_title(self, app_client):
        response = app_client.post("/api/sessions?title=My+Chat")
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "My Chat"

    def test_list_sessions(self, app_client):
        # Create two sessions
        app_client.post("/api/sessions?title=Chat+1")
        app_client.post("/api/sessions?title=Chat+2")

        response = app_client.get("/api/sessions")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 2

    def test_get_session_history(self, app_client):
        # Create a session first
        create_resp = app_client.post("/api/sessions")
        session_id = create_resp.json()["session_id"]

        response = app_client.get(f"/api/sessions/{session_id}/history")
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == session_id
        assert "messages" in data

    def test_get_nonexistent_session_history(self, app_client):
        response = app_client.get("/api/sessions/nonexistent-id/history")
        assert response.status_code == 404

    def test_delete_session(self, app_client):
        create_resp = app_client.post("/api/sessions")
        session_id = create_resp.json()["session_id"]

        response = app_client.delete(f"/api/sessions/{session_id}")
        assert response.status_code == 200

        # Verify it's gone
        history_resp = app_client.get(f"/api/sessions/{session_id}/history")
        assert history_resp.status_code == 404

    def test_delete_nonexistent_session(self, app_client):
        response = app_client.delete("/api/sessions/nonexistent-id")
        assert response.status_code == 404


# ── Chat endpoint (REST, non-streaming) ─────────────────────


class TestChatEndpoint:
    """Tests for POST /api/chat (non-streaming)."""

    @patch("agent.rag_agent.RAGAgent.chat")
    def test_chat_returns_answer(self, mock_chat, app_client_with_kb):
        mock_chat.return_value = "This is a test answer."

        # Create session first
        create_resp = app_client_with_kb.post("/api/sessions")
        session_id = create_resp.json()["session_id"]

        response = app_client_with_kb.post(
            "/api/chat",
            json={"session_id": session_id, "message": "Hello"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["answer"] == "This is a test answer."

    def test_chat_nonexistent_session(self, app_client):
        response = app_client.post(
            "/api/chat",
            json={"session_id": "nonexistent", "message": "Hello"},
        )
        assert response.status_code == 404


# ── Chat streaming endpoint (SSE) ───────────────────────────


class TestChatStreamEndpoint:
    """Tests for POST /api/chat/stream (SSE)."""

    @patch("agent.rag_agent.RAGAgent.chat_stream")
    def test_stream_returns_events(self, mock_stream, app_client_with_kb):
        mock_stream.return_value = iter(
            [
                {"type": "text", "content": "Hello "},
                {"type": "text", "content": "world"},
            ]
        )

        create_resp = app_client_with_kb.post("/api/sessions")
        session_id = create_resp.json()["session_id"]

        response = app_client_with_kb.post(
            "/api/chat/stream",
            json={"session_id": session_id, "message": "Hi"},
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")


# ── Knowledge Base endpoints ────────────────────────────────


class TestKBEndpoints:
    """Tests for knowledge base management endpoints."""

    def test_kb_status(self, app_client):
        response = app_client.get("/api/kb/status")
        assert response.status_code == 200
        data = response.json()
        assert "total_chunks" in data
        assert "index_ready" in data

    @patch("chat.routes.ingest_text")
    def test_ingest_text(self, mock_ingest, app_client):
        mock_ingest.return_value = 5

        response = app_client.post(
            "/api/kb/ingest",
            json={"text": "Some text to ingest", "source": "test"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["chunks_added"] == 5

    @patch("chat.routes.ingest_documents")
    def test_ingest_dir(self, mock_ingest, app_client):
        mock_ingest.return_value = 10

        response = app_client.post("/api/kb/ingest-dir")
        assert response.status_code == 200

    @patch("chat.routes.ingest_file")
    def test_ingest_file(self, mock_ingest, app_client):
        mock_ingest.return_value = 3

        response = app_client.post(
            "/api/kb/ingest-file",
            json={"file_path": "/tmp/test.txt"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["chunks_added"] == 3

    def test_kb_reset(self, app_client):
        response = app_client.delete("/api/kb/reset")
        assert response.status_code == 200


# ── Upload endpoint ─────────────────────────────────────────


class TestUploadEndpoint:
    """Tests for POST /api/kb/upload (multipart file upload)."""

    @patch("chat.routes.ingest_file")
    def test_upload_text_file(self, mock_ingest, app_client):
        mock_ingest.return_value = 2

        response = app_client.post(
            "/api/kb/upload",
            files={"file": ("test.txt", b"Hello world", "text/plain")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["chunks_added"] == 2

    def test_upload_unsupported_extension(self, app_client):
        response = app_client.post(
            "/api/kb/upload",
            files={"file": ("test.exe", b"binary content", "application/octet-stream")},
        )
        assert response.status_code == 400

    @patch("chat.routes.ingest_file")
    def test_upload_pdf_extension(self, mock_ingest, app_client):
        mock_ingest.return_value = 5

        response = app_client.post(
            "/api/kb/upload",
            files={"file": ("doc.pdf", b"fake pdf content", "application/pdf")},
        )
        assert response.status_code == 200


# ── Filename sanitization ───────────────────────────────────


class TestFilenameSanitization:
    """Tests for _sanitize_filename() in routes.py."""

    def test_strips_directory_traversal(self):
        from chat.routes import _sanitize_filename

        result = _sanitize_filename("../../../etc/passwd")
        assert ".." not in result
        assert "/" not in result

    def test_removes_null_bytes(self):
        from chat.routes import _sanitize_filename

        result = _sanitize_filename("file\x00name.txt")
        assert "\x00" not in result

    def test_replaces_special_chars(self):
        from chat.routes import _sanitize_filename

        result = _sanitize_filename("my file (1).txt")
        assert " " not in result or "_" in result

    def test_preserves_normal_filename(self):
        from chat.routes import _sanitize_filename

        result = _sanitize_filename("document.pdf")
        assert result == "document.pdf"

    def test_handles_dot_prefix(self):
        from chat.routes import _sanitize_filename

        result = _sanitize_filename(".env")
        # Should be prefixed to avoid hidden files
        assert not result.startswith(".") or "upload_" in result
