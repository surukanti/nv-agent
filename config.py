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
    # Default chat model — any model on NVIDIA NIM will work here.
    # test-agent.py hardcodes deepseek-ai/deepseek-v4-pro for standalone CLI smoke tests.
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
    # Vector store backend: "faiss", "chromadb", "qdrant"
    vector_store: str = "faiss"
    # Backend-specific options
    vector_store_options: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        """Load vector store config from environment variables."""
        import os

        # Read backend from env
        env_backend = os.environ.get("NV_AGENT_VECTOR_STORE")
        if env_backend:
            self.vector_store = env_backend.lower()

        # Read backend-specific options from env
        if self.vector_store == "chromadb":
            self.vector_store_options = {
                "collection_name": os.environ.get("NV_AGENT_CHROMADB_COLLECTION", "nv_agent_kb"),
                "persist_directory": os.environ.get("NV_AGENT_CHROMADB_PERSIST_DIR"),
            }
        elif self.vector_store == "qdrant":
            port_str = os.environ.get("NV_AGENT_QDRANT_PORT")
            self.vector_store_options = {
                "collection_name": os.environ.get("NV_AGENT_QDRANT_COLLECTION", "nv_agent_kb"),
                "host": os.environ.get("NV_AGENT_QDRANT_HOST"),
                "port": int(port_str) if port_str else None,
                "api_key": os.environ.get("NV_AGENT_QDRANT_API_KEY"),
                "path": os.environ.get("NV_AGENT_QDRANT_PATH"),
            }


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
