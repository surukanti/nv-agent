"""Shared test fixtures and configuration for NV-Agent tests."""

import os
import tempfile
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── Unit test fixtures ──────────────────────────────────────


@pytest.fixture
def tmp_dir():
    """Provide a temporary directory that is cleaned up after the test."""
    with tempfile.TemporaryDirectory() as d:
        yield d


@pytest.fixture
def sample_text():
    """A multi-paragraph text sample for chunking tests."""
    return (
        "Introduction to NV-Agent\n\n"
        "NV-Agent is a self-hosted RAG AI Agent. It lets users chat over their own documents "
        "with grounded, cited answers. The system uses FAISS for vector search and NVIDIA NIM "
        "for language model inference.\n\n"
        "Architecture Overview\n\n"
        "The system has four layers: Knowledge Base, Agent, Chat API, and Browser UI. "
        "Each layer is a Python package with clear exports. Data flows left-to-right for "
        "requests and right-to-left for responses.\n\n"
        "Getting Started\n\n"
        "To run NV-Agent, you need Python 3.11+ and an NVIDIA NIM API key. Copy .env.example "
        "to .env, set your key, install dependencies, and run python main.py. The server starts "
        "on http://localhost:8000 with a browser chat UI and interactive API docs."
    )


@pytest.fixture
def sample_chunks(sample_text):
    """Pre-chunked sample text for vector store tests."""
    from kb.chunker import Chunk

    return [
        Chunk(
            text=sample_text[:200],
            source="test.md",
            chunk_index=0,
            start_char=0,
            end_char=200,
        ),
        Chunk(
            text=sample_text[200:400],
            source="test.md",
            chunk_index=1,
            start_char=200,
            end_char=400,
        ),
    ]


@pytest.fixture
def sample_session_data():
    """Session data for serialization tests."""
    return {
        "id": "test-session-123",
        "title": "Test Session",
        "created_at": "2026-01-15T10:30:00+00:00",
        "updated_at": "2026-01-15T10:35:00+00:00",
        "history": [
            {"role": "user", "content": "Hello", "timestamp": "2026-01-15T10:30:00+00:00"},
            {"role": "assistant", "content": "Hi there!", "timestamp": "2026-01-15T10:30:05+00:00"},
        ],
    }


# ── Mock fixtures (no external API calls) ───────────────────


@pytest.fixture
def mock_nvidia_api_key():
    """Set a fake NVIDIA API key for tests that need config."""
    with patch.dict(os.environ, {"NVIDIA_API_KEY": "nvapi-test-key-for-testing"}):
        # Re-import config so it picks up the new env var
        from config import Config, KBConfig, NVIDIAConfig, ServerConfig

        yield Config(
            nvidia=NVIDIAConfig(api_key="nvapi-test-key-for-testing"),
            kb=KBConfig(data_dir="/tmp/test-data", index_dir="/tmp/test-index"),
            server=ServerConfig(port=8000),
        )


@pytest.fixture
def mock_embedding_response():
    """Mock response from NVIDIA embedding API."""
    mock_data = MagicMock()
    mock_data.index = 0
    mock_data.embedding = [0.1] * 1024  # 1024-dim vector

    mock_response = MagicMock()
    mock_response.data = [mock_data]
    return mock_response


@pytest.fixture
def mock_chat_response():
    """Mock response from NVIDIA chat completions API (non-streaming)."""
    mock_choice = MagicMock()
    mock_choice.message.content = "This is a test response from the agent."

    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    return mock_response


@pytest.fixture
def mock_streaming_response():
    """Mock response chunks from NVIDIA chat completions API (streaming)."""

    class MockChunk:
        def __init__(self, content=None, reasoning=None):
            self.choices = [MockChoice(content, reasoning)]

    class MockChoice:
        def __init__(self, content=None, reasoning=None):
            delta = MagicMock()
            delta.content = content
            delta.reasoning_content = reasoning
            delta.thinking = None
            self.delta = delta

    return [
        MockChunk(reasoning="Let me think about this..."),
        MockChunk(content="Here is "),
        MockChunk(content="the answer."),
    ]


# ── Integration test fixtures (FastAPI) ─────────────────────


@pytest.fixture
def mock_vector_store():
    """A mock VectorStore that doesn't need FAISS or embeddings."""
    store = MagicMock()
    store.count = 3
    store.index = MagicMock()  # truthy = "ready"
    store.chunks = []

    # search() returns empty by default
    store.search.return_value = []

    return store


@pytest.fixture
def mock_session_store(tmp_dir):
    """A real SessionStore pointing at a temp directory."""
    from agent.session_store import SessionStore

    session_dir = os.path.join(tmp_dir, "sessions")
    return SessionStore(session_dir)


@pytest.fixture
def app_client(mock_vector_store, mock_session_store, mock_nvidia_api_key):
    """FastAPI TestClient with mocked dependencies."""
    from agent.rag_agent import RAGAgent
    from chat.app import create_app
    from chat.routes import set_agent, set_store

    # Create agent with mock store
    agent = RAGAgent(store=mock_vector_store, session_store=mock_session_store)
    set_agent(agent)
    set_store(mock_vector_store)

    app = create_app()
    return TestClient(app)


@pytest.fixture
def app_client_with_kb(mock_vector_store, mock_session_store, mock_nvidia_api_key):
    """FastAPI TestClient with a KB that returns search results."""
    from agent.rag_agent import RAGAgent
    from chat.app import create_app
    from chat.routes import set_agent, set_store
    from kb.chunker import Chunk
    from kb.vector_store import SearchResult

    # Configure mock search results
    result = SearchResult(
        chunk=Chunk(
            text="NV-Agent uses FAISS for vector search.",
            source="test.md",
            chunk_index=0,
            start_char=0,
            end_char=40,
        ),
        score=0.95,
    )
    mock_vector_store.search.return_value = [result]

    agent = RAGAgent(store=mock_vector_store, session_store=mock_session_store)
    set_agent(agent)
    set_store(mock_vector_store)

    app = create_app()
    return TestClient(app)
