"""Unit tests for agent/session_store.py — session persistence."""

import os

from agent.rag_agent import Message, Session
from agent.session_store import SessionStore


class TestSessionCreation:
    """Tests for Session and Message data models."""

    def test_session_has_uuid_id(self):
        s = Session()
        assert len(s.id) == 36  # UUID format
        assert "-" in s.id

    def test_session_custom_title(self):
        s = Session(title="My Chat")
        assert s.title == "My Chat"

    def test_session_default_title(self):
        s = Session()
        assert s.title is None

    def test_session_timestamps_are_utc(self):
        s = Session()
        assert s.created_at is not None
        assert s.created_at.tzinfo is not None

    def test_message_roles(self):
        m = Message(role="user", content="Hello")
        assert m.role == "user"
        assert m.content == "Hello"

    def test_session_add_message(self):
        s = Session()
        s.add("user", "Hi there")
        assert len(s.history) == 1
        assert s.history[0].role == "user"
        assert s.history[0].content == "Hi there"

    def test_session_add_updates_timestamp(self):
        s = Session()
        before = s.updated_at
        s.add("user", "test")
        assert s.updated_at >= before

    def test_session_to_openai_messages(self):
        s = Session()
        s.add("user", "Hello")
        s.add("assistant", "Hi!")
        msgs = s.to_openai_messages()
        assert len(msgs) == 2
        assert msgs[0] == {"role": "user", "content": "Hello"}
        assert msgs[1] == {"role": "assistant", "content": "Hi!"}

    def test_session_get_recent_messages_limit(self):
        s = Session()
        for i in range(10):
            s.add("user", f"Message {i}")
        recent = s.get_recent_messages(limit=3)
        assert len(recent) == 3
        assert recent[0].content == "Message 7"

    def test_session_clear_history(self):
        s = Session()
        s.add("user", "test")
        s.clear_history()
        assert len(s.history) == 0


class TestSessionStorePersistence:
    """Tests for SessionStore — save, load, delete, list."""

    def test_save_and_load_session(self, tmp_dir):
        store = SessionStore(os.path.join(tmp_dir, "sessions"))
        session = Session(title="Test Chat")
        session.add("user", "Hello")
        session.add("assistant", "Hi there!")

        store.save(session)

        loaded = store.load(session.id)
        assert loaded is not None
        assert loaded.id == session.id
        assert loaded.title == "Test Chat"
        assert len(loaded.history) == 2
        assert loaded.history[0].role == "user"
        assert loaded.history[0].content == "Hello"

    def test_load_nonexistent_session(self, tmp_dir):
        store = SessionStore(os.path.join(tmp_dir, "sessions"))
        result = store.load("nonexistent-id")
        assert result is None

    def test_delete_session(self, tmp_dir):
        store = SessionStore(os.path.join(tmp_dir, "sessions"))
        session = Session(title="To Delete")
        store.save(session)

        assert store.delete(session.id) is True
        assert store.load(session.id) is None

    def test_delete_nonexistent_session(self, tmp_dir):
        store = SessionStore(os.path.join(tmp_dir, "sessions"))
        assert store.delete("nonexistent") is False

    def test_list_sessions(self, tmp_dir):
        store = SessionStore(os.path.join(tmp_dir, "sessions"))
        s1 = Session(title="Chat 1")
        s2 = Session(title="Chat 2")
        store.save(s1)
        store.save(s2)

        ids = store.list_sessions()
        assert len(ids) == 2
        assert s1.id in ids
        assert s2.id in ids

    def test_load_all_sessions(self, tmp_dir):
        store = SessionStore(os.path.join(tmp_dir, "sessions"))
        s1 = Session(title="Chat 1")
        s2 = Session(title="Chat 2")
        store.save(s1)
        store.save(s2)

        sessions = store.load_all()
        assert len(sessions) == 2
        assert s1.id in sessions
        assert s2.id in sessions

    def test_load_all_skips_corrupt_files(self, tmp_dir):
        session_dir = os.path.join(tmp_dir, "sessions")
        store = SessionStore(session_dir)

        # Save a valid session
        valid = Session(title="Valid")
        store.save(valid)

        # Write a corrupt JSON file
        corrupt_path = os.path.join(session_dir, "corrupt-session.json")
        with open(corrupt_path, "w", encoding="utf-8") as f:
            f.write("{ invalid json")

        sessions = store.load_all()
        # Should only have the valid session, skip the corrupt one
        assert valid.id in sessions
        assert "corrupt-session" not in sessions

    def test_get_session_info(self, tmp_dir):
        store = SessionStore(os.path.join(tmp_dir, "sessions"))
        session = Session(title="Info Test")
        session.add("user", "Hello")
        store.save(session)

        info = store.get_session_info(session.id)
        assert info is not None
        assert info["id"] == session.id
        assert info["title"] == "Info Test"
        assert info["message_count"] == 1

    def test_get_session_info_nonexistent(self, tmp_dir):
        store = SessionStore(os.path.join(tmp_dir, "sessions"))
        info = store.get_session_info("nonexistent")
        assert info is None

    def test_save_creates_directory(self, tmp_dir):
        nested_dir = os.path.join(tmp_dir, "nested", "sessions")
        store = SessionStore(nested_dir)
        session = Session(title="Nested")
        store.save(session)
        assert os.path.exists(os.path.join(nested_dir, f"{session.id}.json"))

    def test_roundtrip_preserves_timestamps(self, tmp_dir):
        store = SessionStore(os.path.join(tmp_dir, "sessions"))
        session = Session(title="Timestamps")
        session.add("user", "test")
        original_created = session.created_at
        original_updated = session.updated_at

        store.save(session)
        loaded = store.load(session.id)

        assert loaded.created_at.year == original_created.year
        assert loaded.updated_at.year == original_updated.year
