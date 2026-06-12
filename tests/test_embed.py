"""Unit tests for kb/embed.py — embedding client (mocked API)."""

from unittest.mock import MagicMock, patch

import pytest


class TestEmbedTexts:
    """Tests for embed_texts() with mocked NVIDIA API."""

    def test_empty_list_returns_empty(self):
        from kb.embed import embed_texts

        result = embed_texts([])
        assert not result

    @patch("kb.embed._get_client")
    def test_single_text_embedding(self, mock_get_client, mock_embedding_response):
        from kb.embed import embed_texts

        mock_client = MagicMock()
        mock_client.embeddings.create.return_value = mock_embedding_response
        mock_get_client.return_value = mock_client

        result = embed_texts(["test query"])
        assert len(result) == 1
        assert len(result[0]) == 1024

    @patch("kb.embed._get_client")
    def test_batched_embedding(self, mock_get_client):
        from kb.embed import embed_texts

        # Create mock response for 20 texts
        # embed_texts processes in batches of 16, so we need the mock
        # to return appropriate data for each batch call
        def mock_create(**kwargs):
            input_texts = kwargs.get("input", [])
            mock_data = []
            for i, _ in enumerate(input_texts):
                d = MagicMock()
                d.index = i
                d.embedding = [0.1] * 1024
                mock_data.append(d)
            mock_response = MagicMock()
            mock_response.data = mock_data
            return mock_response

        mock_client = MagicMock()
        mock_client.embeddings.create = mock_create
        mock_get_client.return_value = mock_client

        result = embed_texts([f"text {i}" for i in range(20)])
        assert len(result) == 20

    @patch("kb.embed._get_client")
    def test_api_failure_raises_runtime_error(self, mock_get_client):
        from kb.embed import embed_texts

        mock_client = MagicMock()
        mock_client.embeddings.create.side_effect = Exception("API Error")
        mock_get_client.return_value = mock_client

        with pytest.raises(RuntimeError, match="Embedding API call failed"):
            embed_texts(["test"])

    @patch("kb.embed._get_client")
    def test_results_are_sorted_by_index(self, mock_get_client):
        """Embeddings should be returned in input order, not API response order."""
        from kb.embed import embed_texts

        # Return data out of order
        d1 = MagicMock()
        d1.index = 1
        d1.embedding = [0.2] * 1024

        d0 = MagicMock()
        d0.index = 0
        d0.embedding = [0.1] * 1024

        mock_response = MagicMock()
        mock_response.data = [d1, d0]  # Out of order

        mock_client = MagicMock()
        mock_client.embeddings.create.return_value = mock_response
        mock_get_client.return_value = mock_client

        result = embed_texts(["first", "second"])
        assert result[0][0] == pytest.approx(0.1, abs=0.01)  # First input
        assert result[1][0] == pytest.approx(0.2, abs=0.01)  # Second input


class TestEmbedQuery:
    """Tests for embed_query() — non-fatal failure handling."""

    @patch("kb.embed.embed_texts")
    def test_success_returns_vector(self, mock_embed):
        from kb.embed import embed_query

        mock_embed.return_value = [[0.1] * 1024]
        result = embed_query("test query")
        assert len(result) == 1024

    @patch("kb.embed.embed_texts")
    def test_failure_returns_empty_list(self, mock_embed):
        from kb.embed import embed_query

        mock_embed.side_effect = RuntimeError("API down")
        result = embed_query("test query")
        assert not result

    @patch("kb.embed.embed_texts")
    def test_empty_result_returns_empty_list(self, mock_embed):
        from kb.embed import embed_query

        mock_embed.return_value = []
        result = embed_query("test query")
        assert not result


class TestGetClient:
    """Tests for singleton client creation."""

    def test_creates_client_with_api_key(self):
        import kb.embed

        # Reset module-level client
        kb.embed._client = None

        with patch("kb.embed.config") as mock_config:
            mock_config.nvidia.api_key = "nvapi-test-key"
            mock_config.nvidia.base_url = "https://integrate.api.nvidia.com/v1"
            client = kb.embed._get_client()
            assert client is not None

        # Clean up
        kb.embed._client = None

    def test_raises_on_missing_key(self):
        import kb.embed

        kb.embed._client = None

        with patch("kb.embed.config") as mock_config:
            mock_config.nvidia.api_key = ""
            with pytest.raises(ValueError, match="NVIDIA_API_KEY"):
                kb.embed._get_client()

        kb.embed._client = None
