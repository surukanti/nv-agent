"""Central configuration for the NV-Agent system."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project root
_project_root = Path(__file__).parent
load_dotenv(_project_root / ".env")


def _get_nvidia_api_key() -> str:
    """Resolve the NVIDIA API key from multiple possible env var names."""
    for var in ("NVIDIA_API_KEY", "NVIDIA_NIM_API_KEY", "NGC_API_KEY"):
        val = os.environ.get(var, "")
        if val:
            return val
    return ""


@dataclass
class NVIDIAConfig:
    """NVIDIA API configuration."""
    api_key: str = field(default_factory=_get_nvidia_api_key)
    base_url: str = "https://integrate.api.nvidia.com/v1"
    # chat_model: str = "meta/llama-3.1-8b-instruct"
    chat_model: str = "nvidia/nemotron-3-ultra-550b-a55b"
    embedding_model: str = "baai/bge-m3"
    embedding_dim: int = 1024
    temperature: float = 1.0
    top_p: float = 0.95
    max_tokens: int = 16384
    enable_thinking: bool = True
    reasoning_budget: int = 16384


@dataclass
class KBConfig:
    """Knowledge base configuration."""
    data_dir: str = field(default_factory=lambda: str(_project_root / "data"))
    index_dir: str = field(default_factory=lambda: str(_project_root / "kb" / "index"))
    chunk_size: int = 512
    chunk_overlap: int = 64
    top_k: int = 5


@dataclass
class ServerConfig:
    """Server configuration."""
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list = field(default_factory=lambda: ["*"])


@dataclass
class Config:
    """Root configuration."""
    nvidia: NVIDIAConfig = field(default_factory=NVIDIAConfig)
    kb: KBConfig = field(default_factory=KBConfig)
    server: ServerConfig = field(default_factory=ServerConfig)


config = Config()
