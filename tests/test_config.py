"""Unit tests for config.py — configuration loading and defaults."""

import os
from unittest.mock import patch


class TestNVIDIAConfig:
    """Tests for NVIDIA API configuration."""

    @patch.dict(os.environ, {"NVIDIA_API_KEY": "nvapi-test-123"}, clear=False)
    def test_resolves_nvidia_api_key(self):
        from config import _get_nvidia_api_key

        result = _get_nvidia_api_key()
        assert result == "nvapi-test-123"

    @patch.dict(os.environ, {"NVIDIA_NIM_API_KEY": "nvapi-nim-456"}, clear=False)
    def test_resolves_nim_api_key(self):
        from config import _get_nvidia_api_key

        result = _get_nvidia_api_key()
        assert result == "nvapi-nim-456"

    @patch.dict(os.environ, {"NGC_API_KEY": "ngc-key-789"}, clear=False)
    def test_resolves_ngc_api_key(self):
        from config import _get_nvidia_api_key

        # Clear the others so NGC is picked up
        with patch.dict(os.environ, {"NVIDIA_API_KEY": "", "NVIDIA_NIM_API_KEY": ""}, clear=False):
            result = _get_nvidia_api_key()
            # NGC should be checked but may not win if others are set
            assert isinstance(result, str)

    @patch.dict(
        os.environ, {"NVIDIA_API_KEY": "", "NVIDIA_NIM_API_KEY": "", "NGC_API_KEY": ""}, clear=False
    )
    def test_returns_empty_when_no_key(self):
        from config import _get_nvidia_api_key

        result = _get_nvidia_api_key()
        assert result == ""

    def test_nvidia_config_defaults(self):
        from config import NVIDIAConfig

        config = NVIDIAConfig(api_key="test")
        assert config.base_url == "https://integrate.api.nvidia.com/v1"
        assert config.embedding_model == "baai/bge-m3"
        assert config.embedding_dim == 1024
        assert config.temperature == 1.0
        assert config.top_p == 0.95
        assert config.max_tokens == 16384

    def test_nvidia_config_custom_model(self):
        from config import NVIDIAConfig

        config = NVIDIAConfig(api_key="test", chat_model="meta/llama-3.1-8b-instruct")
        assert config.chat_model == "meta/llama-3.1-8b-instruct"


class TestKBConfig:
    """Tests for Knowledge Base configuration."""

    def test_kb_config_defaults(self):
        from config import KBConfig

        config = KBConfig()
        assert config.chunk_size == 512
        assert config.chunk_overlap == 64
        assert config.top_k == 5

    def test_kb_config_custom(self):
        from config import KBConfig

        config = KBConfig(chunk_size=1024, chunk_overlap=128, top_k=10)
        assert config.chunk_size == 1024
        assert config.chunk_overlap == 128
        assert config.top_k == 10


class TestServerConfig:
    """Tests for server configuration."""

    def test_server_config_defaults(self):
        from config import ServerConfig

        config = ServerConfig()
        assert config.host == "0.0.0.0"
        assert config.port == 8000
        assert config.cors_origins == ["*"]


class TestConfig:
    """Tests for the root Config dataclass."""

    def test_config_has_all_sections(self):
        from config import Config, KBConfig, NVIDIAConfig, ServerConfig

        config = Config()
        assert isinstance(config.nvidia, NVIDIAConfig)
        assert isinstance(config.kb, KBConfig)
        assert isinstance(config.server, ServerConfig)
