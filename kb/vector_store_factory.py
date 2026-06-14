"""Factory for creating vector store instances based on configuration."""

from kb.vector_store_base import VectorStoreBase
from kb.vector_store_faiss import FAISSVectorStore


def create_vector_store(
    backend: str,
    index_dir: str,
    embedding_dim: int,
    **kwargs,
) -> VectorStoreBase:
    """Create a vector store instance based on the backend name.

    Args:
        backend: Backend name ("faiss", "chromadb", "qdrant")
        index_dir: Directory for index storage
        embedding_dim: Embedding dimension
        **kwargs: Additional backend-specific arguments

    Returns:
        VectorStoreBase instance

    Raises:
        ValueError: If backend is unknown
        ImportError: If required dependencies are not installed
    """
    backend = backend.lower()

    if backend == "faiss":
        return FAISSVectorStore(index_dir, embedding_dim)

    elif backend == "chromadb":
        try:
            from kb.vector_store_chromadb import ChromaDBVectorStore
        except ImportError as e:
            raise ImportError(
                "ChromaDB backend requires 'chromadb' package. "
                "Install with: pip install chromadb"
            ) from e
        return ChromaDBVectorStore(
            index_dir=index_dir,
            embedding_dim=embedding_dim,
            collection_name=kwargs.get("collection_name", "nv_agent_kb"),
            persist_directory=kwargs.get("persist_directory"),
        )

    elif backend == "qdrant":
        try:
            from kb.vector_store_qdrant import QdrantVectorStore
        except ImportError as e:
            raise ImportError(
                "Qdrant backend requires 'qdrant-client' package. "
                "Install with: pip install qdrant-client"
            ) from e
        return QdrantVectorStore(
            index_dir=index_dir,
            embedding_dim=embedding_dim,
            collection_name=kwargs.get("collection_name", "nv_agent_kb"),
            host=kwargs.get("host"),
            port=kwargs.get("port"),
            api_key=kwargs.get("api_key"),
            path=kwargs.get("path"),
        )

    else:
        raise ValueError(
            f"Unknown vector store backend: {backend}. "
            f"Supported: faiss, chromadb, qdrant"
        )


def get_vector_store_config() -> dict:
    """Get vector store configuration from environment variables.

    Returns:
        Dictionary with backend and configuration options
    """
    import os

    backend = os.environ.get("NV_AGENT_VECTOR_STORE", "faiss").lower()

    config = {"backend": backend}

    if backend == "chromadb":
        config.update(
            {
                "collection_name": os.environ.get(
                    "NV_AGENT_CHROMADB_COLLECTION", "nv_agent_kb"
                ),
                "persist_directory": os.environ.get(
                    "NV_AGENT_CHROMADB_PERSIST_DIR"
                ),
            }
        )
    elif backend == "qdrant":
        config.update(
            {
                "collection_name": os.environ.get(
                    "NV_AGENT_QDRANT_COLLECTION", "nv_agent_kb"
                ),
                "host": os.environ.get("NV_AGENT_QDRANT_HOST"),
                "port": (
                    int(os.environ.get("NV_AGENT_QDRANT_PORT", "6333"))
                    if os.environ.get("NV_AGENT_QDRANT_PORT")
                    else None
                ),
                "api_key": os.environ.get("NV_AGENT_QDRANT_API_KEY"),
                "path": os.environ.get("NV_AGENT_QDRANT_PATH"),
            }
        )

    return config