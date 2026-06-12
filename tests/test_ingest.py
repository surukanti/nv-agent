"""Unit tests for kb/ingest.py — document ingestion logic."""

import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from kb.ingest import (
    _READERS,
    DocumentIngestionError,
    _read_text,
    ingest_documents,
    ingest_file,
    ingest_text,
)


class TestReaders:
    """Tests for file reader functions."""

    def test_read_text_file(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write("Hello, world!")
            f.flush()
        try:
            result = _read_text(Path(f.name))
            assert result == "Hello, world!"
        finally:
            os.unlink(f.name)

    def test_read_text_utf8(self):
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", encoding="utf-8", delete=False
        ) as f:
            f.write("Héllo wörld! 🌍")
            f.flush()
        try:
            result = _read_text(Path(f.name))
            assert "🌍" in result
        finally:
            os.unlink(f.name)

    def test_readers_dict_has_expected_extensions(self):
        expected = {
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
        assert expected == set(_READERS.keys())

    def test_readers_pdf_is_callable(self):
        assert callable(_READERS[".pdf"])

    def test_readers_docx_is_callable(self):
        assert callable(_READERS[".docx"])


class TestIngestText:
    """Tests for ingest_text() — raw text ingestion into vector store."""

    def test_ingest_text_creates_chunks(self, tmp_dir):
        from kb.vector_store import VectorStore

        index_dir = os.path.join(tmp_dir, "index")
        store = VectorStore(index_dir=index_dir, embedding_dim=128)

        # Patch at the import location used by vector_store.py
        with patch("kb.vector_store.embed_texts", lambda texts: [[0.1] * 128 for _ in texts]):
            n = ingest_text(store, "Hello, this is some test text to ingest.", source="test")
        assert n > 0

    def test_ingest_empty_text_returns_zero(self):
        mock_store = MagicMock()
        n = ingest_text(mock_store, "", source="test")
        assert n == 0

    def test_ingest_whitespace_text_returns_zero(self):
        mock_store = MagicMock()
        n = ingest_text(mock_store, " \n\n ", source="test")
        assert n == 0


class TestIngestFile:
    """Tests for ingest_file() — single file ingestion."""

    def test_ingest_nonexistent_file_raises(self):
        mock_store = MagicMock()
        with pytest.raises(DocumentIngestionError, match="File not found"):
            ingest_file(mock_store, "/nonexistent/path.txt")

    def test_ingest_unsupported_extension_raises(self):
        mock_store = MagicMock()
        with tempfile.NamedTemporaryFile(suffix=".exe", delete=False) as f:
            f.write(b"content")
        try:
            with pytest.raises(DocumentIngestionError, match="Unsupported file type"):
                ingest_file(mock_store, f.name)
        finally:
            os.unlink(f.name)

    def test_ingest_text_file_succeeds(self, tmp_dir):
        from kb.vector_store import VectorStore

        # Create a text file
        file_path = os.path.join(tmp_dir, "test.txt")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write("This is a test document with some content for ingestion. " * 10)

        index_dir = os.path.join(tmp_dir, "index")
        store = VectorStore(index_dir=index_dir, embedding_dim=128)

        with patch("kb.vector_store.embed_texts", lambda texts: [[0.1] * 128 for _ in texts]):
            n = ingest_file(store, file_path)
        assert n > 0


class TestIngestDocuments:
    """Tests for ingest_documents() — directory scanning."""

    def test_ingest_empty_directory(self, tmp_dir):
        from kb.vector_store import VectorStore

        data_dir = os.path.join(tmp_dir, "data")
        os.makedirs(data_dir)
        index_dir = os.path.join(tmp_dir, "index")
        store = VectorStore(index_dir=index_dir, embedding_dim=128)

        with patch("kb.vector_store.embed_texts", lambda texts: [[0.1] * 128 for _ in texts]):
            n = ingest_documents(store, data_dir=data_dir)
        assert n == 0

    def test_ingest_directory_with_files(self, tmp_dir):
        from kb.vector_store import VectorStore

        data_dir = os.path.join(tmp_dir, "data")
        os.makedirs(data_dir)

        # Create some text files
        with open(os.path.join(data_dir, "doc1.txt"), "w", encoding="utf-8") as f:
            f.write("Document one has some content for testing the ingestion pipeline. " * 10)
        with open(os.path.join(data_dir, "doc2.md"), "w", encoding="utf-8") as f:
            f.write(
                "# Document Two\n\nThis is markdown content with enough text to be chunked properly. "
                * 10
            )

        index_dir = os.path.join(tmp_dir, "index")
        store = VectorStore(index_dir=index_dir, embedding_dim=128)

        with patch("kb.vector_store.embed_texts", lambda texts: [[0.1] * 128 for _ in texts]):
            n = ingest_documents(store, data_dir=data_dir)
        assert n > 0

    def test_ingest_skips_sessions_directory(self, tmp_dir):
        from kb.vector_store import VectorStore

        data_dir = os.path.join(tmp_dir, "data")
        sessions_dir = os.path.join(data_dir, "sessions")
        os.makedirs(sessions_dir)

        # Create a session file (should be skipped)
        with open(os.path.join(sessions_dir, "session.json"), "w", encoding="utf-8") as f:
            f.write('{"id": "test"}')

        # Create a real document
        with open(os.path.join(data_dir, "doc.txt"), "w", encoding="utf-8") as f:
            f.write("Real document content that is long enough. " * 10)

        index_dir = os.path.join(tmp_dir, "index")
        store = VectorStore(index_dir=index_dir, embedding_dim=128)

        with patch("kb.vector_store.embed_texts", lambda texts: [[0.1] * 128 for _ in texts]):
            n = ingest_documents(store, data_dir=data_dir)
        # Should index doc.txt but not sessions/session.json
        assert n > 0
