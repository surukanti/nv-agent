"""Unit tests for agent/rag_agent.py — RAG agent logic."""

from unittest.mock import MagicMock, patch

import pytest

from agent.rag_agent import (
    LLMError,
    RAGAgent,
    RAGAgentError,
    SessionNotFoundError,
)


@pytest.mark.unit
class TestExceptionHierarchy:
    """Tests for the custom exception hierarchy."""

    def test_session_not_found_is_rag_error(self):
        assert issubclass(SessionNotFoundError, RAGAgentError)

    def test_llm_error_is_rag_error(self):
        assert issubclass(LLMError, RAGAgentError)

    def test_rag_agent_error_is_exception(self):
        assert issubclass(RAGAgentError, Exception)


class TestRAGAgentSessions:
    """Tests for RAGAgent session management."""

    def test_create_session(self):
        mock_store = MagicMock()
        agent = RAGAgent(store=mock_store)
        session = agent.create_session("Test Chat")
        assert session.title == "Test Chat"
        assert session.id in agent.sessions

    def test_get_session(self):
        mock_store = MagicMock()
        agent = RAGAgent(store=mock_store)
        session = agent.create_session()
        retrieved = agent.get_session(session.id)
        assert retrieved is not None
        assert retrieved.id == session.id

    def test_get_nonexistent_session_returns_none(self):
        mock_store = MagicMock()
        mock_store.load.return_value = None
        agent = RAGAgent(store=mock_store)
        result = agent.get_session("nonexistent")
        assert result is None

    def test_delete_session(self):
        mock_store = MagicMock()
        agent = RAGAgent(store=mock_store)
        session = agent.create_session()
        assert agent.delete_session(session.id) is True
        assert session.id not in agent.sessions

    def test_delete_nonexistent_session(self):
        mock_store = MagicMock()
        agent = RAGAgent(store=mock_store)
        assert agent.delete_session("nonexistent") is False

    def test_list_sessions(self):
        mock_store = MagicMock()
        agent = RAGAgent(store=mock_store)
        s1 = agent.create_session("Chat 1")
        s2 = agent.create_session("Chat 2")
        sessions = agent.list_sessions()
        assert len(sessions) == 2
        ids = [sid for sid, _ in sessions]
        assert s1.id in ids
        assert s2.id in ids

    def test_get_session_history_raises_on_missing(self):
        mock_store = MagicMock()
        agent = RAGAgent(store=mock_store)
        with pytest.raises(SessionNotFoundError):
            agent.get_session_history("nonexistent")


class TestRAGAgentContextRetrieval:
    """Tests for _retrieve_context() — the core RAG step."""

    def test_retrieve_context_with_results(self):
        from kb.chunker import Chunk
        from kb.vector_store import SearchResult

        mock_store = MagicMock()
        mock_store.search.return_value = [
            SearchResult(
                chunk=Chunk(
                    text="Test content", source="doc.md", chunk_index=0, start_char=0, end_char=12
                ),
                score=0.9,
            )
        ]

        agent = RAGAgent(store=mock_store)
        context = agent._retrieve_context("test query")
        assert "doc.md" in context
        assert "chunk 0" in context
        assert "Test content" in context

    def test_retrieve_context_empty_results(self):
        mock_store = MagicMock()
        mock_store.search.return_value = []

        agent = RAGAgent(store=mock_store)
        context = agent._retrieve_context("test query")
        assert "No relevant documents" in context

    def test_retrieve_context_search_error(self):
        mock_store = MagicMock()
        mock_store.search.side_effect = Exception("Search failed")

        agent = RAGAgent(store=mock_store)
        context = agent._retrieve_context("test query")
        assert "Error" in context


class TestRAGAgentBuildMessages:
    """Tests for _build_messages() — prompt construction."""

    def test_builds_messages_with_context(self):
        from kb.chunker import Chunk
        from kb.vector_store import SearchResult

        mock_store = MagicMock()
        mock_store.search.return_value = [
            SearchResult(
                chunk=Chunk(
                    text="Relevant info", source="doc.md", chunk_index=0, start_char=0, end_char=13
                ),
                score=0.9,
            )
        ]

        agent = RAGAgent(store=mock_store)
        session = agent.create_session()
        messages = agent._build_messages(session, "What is in the docs?")

        # Should have system + user message
        assert len(messages) >= 2
        assert messages[0]["role"] == "system"
        assert "doc.md" in messages[0]["content"]  # Context injected
        assert messages[-1]["role"] == "user"
        assert messages[-1]["content"] == "What is in the docs?"

    def test_builds_messages_with_history(self):
        mock_store = MagicMock()
        mock_store.search.return_value = []

        agent = RAGAgent(store=mock_store)
        session = agent.create_session()
        agent.sessions[session.id].add("user", "Previous question")

        messages = agent._build_messages(session, "Follow-up question")
        # System + history message + current message
        user_messages = [m for m in messages if m["role"] == "user"]
        assert len(user_messages) == 2


class TestRAGAgentChat:
    """Tests for chat() — synchronous response."""

    @patch("agent.rag_agent.RAGAgent._get_client")
    def test_chat_returns_answer(self, mock_get_client):
        mock_store = MagicMock()
        mock_store.search.return_value = []

        # Mock LLM response
        mock_choice = MagicMock()
        mock_choice.message.content = "Test answer"
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]

        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = mock_response
        mock_get_client.return_value = mock_client

        agent = RAGAgent(store=mock_store)
        session = agent.create_session()

        answer = agent.chat(session.id, "Hello")
        assert answer == "Test answer"

        # Verify session has messages
        assert len(agent.sessions[session.id].history) >= 2


class TestRAGAgentKBStats:
    """Tests for kb_stats()."""

    def test_kb_stats(self):
        mock_store = MagicMock()
        mock_store.count = 42
        mock_store.index = MagicMock()  # truthy

        agent = RAGAgent(store=mock_store)
        stats = agent.kb_stats()
        assert stats["total_chunks"] == 42
        assert stats["index_ready"] is True
