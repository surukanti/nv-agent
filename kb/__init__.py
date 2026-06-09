"""Knowledge base layer — document ingestion, embedding, storage, and retrieval."""

from kb.vector_store import VectorStore
from kb.ingest import ingest_documents, ingest_text, ingest_file
from kb.chunker import Chunk, chunk_text

__all__ = [
    "VectorStore",
    "ingest_documents",
    "ingest_text",
    "ingest_file",
    "Chunk",
    "chunk_text",
]
