"""Knowledge base layer — document ingestion, embedding, storage, and retrieval."""

from kb.chunker import Chunk, chunk_text
from kb.ingest import ingest_documents, ingest_file, ingest_text
from kb.vector_store_base import VectorStoreBase

__all__ = [
    "Chunk",
    "VectorStoreBase",
    "chunk_text",
    "ingest_documents",
    "ingest_file",
    "ingest_text",
]
