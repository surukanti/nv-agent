"""Qdrant-backed vector store for knowledge base retrieval.

Qdrant is an open-source vector database written in Rust, providing high-performance
vector search with filtering capabilities. Can run in-memory, local file-based, or
as a standalone server.
"""

import os
from typing import TYPE_CHECKING, Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models

from kb.chunker import Chunk
from kb.embed import embed_query, embed_texts
from kb.vector_store_base import SearchResult, VectorStoreBase

if TYPE_CHECKING:
    from qdrant_client.http.models import ScoredPoint


class QdrantVectorStore(VectorStoreBase):
    """Manages a Qdrant collection over document chunks with metadata.

    Supports both local file-based storage and remote server connections.
    """

    def __init__(
        self,
        index_dir: str,
        embedding_dim: int = 1024,
        collection_name: str = "nv_agent_kb",
        # Remote server mode
        host: Optional[str] = None,
        port: Optional[int] = None,
        api_key: Optional[str] = None,
        # Local mode
        path: Optional[str] = None,
    ):
        super().__init__(index_dir, embedding_dim)
        self.collection_name = collection_name

        # Determine connection mode
        if host and port:
            # Remote server mode
            self._client = QdrantClient(
                host=host,
                port=port,
                api_key=api_key,
            )
        else:
            # Local file-based mode
            local_path = path or os.path.join(index_dir, "qdrant")
            os.makedirs(local_path, exist_ok=True)
            self._client = QdrantClient(path=local_path)

        self._ensure_collection()

    def _ensure_collection(self) -> None:
        """Create collection if it doesn't exist."""
        collections = self._client.get_collections().collections
        exists = any(c.name == self.collection_name for c in collections)

        if not exists:
            self._client.create_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.embedding_dim,
                    distance=models.Distance.COSINE,
                ),
            )

    # ── Indexing ─────────────────────────────────────────────────

    def add_chunks(self, chunks: list[Chunk]) -> None:
        """Embed and index a list of chunks."""
        if not chunks:
            return

        texts = [c.text for c in chunks]
        embeddings = embed_texts(texts)
        if not embeddings:
            return

        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings, strict=False)):
            point_id = hash(f"{chunk.source}_{chunk.chunk_index}") % (2**63 - 1)
            points.append(
                models.PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "text": chunk.text,
                        "source": chunk.source,
                        "chunk_index": chunk.chunk_index,
                        "start_char": chunk.start_char,
                        "end_char": chunk.end_char,
                    },
                )
            )

        self._client.upsert(
            collection_name=self.collection_name,
            points=points,
        )

    # ── Retrieval ────────────────────────────────────────────────

    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """Retrieve the top-k most relevant chunks for a query."""
        query_vec = embed_query(query)
        if not query_vec:
            return []

        results: list["ScoredPoint"] = self._client.search(
            collection_name=self.collection_name,
            query_vector=query_vec,
            limit=min(top_k, self.count),
            with_payload=True,
        )

        search_results: list[SearchResult] = []
        for scored_point in results:
            payload = scored_point.payload or {}
            chunk = Chunk(
                text=payload.get("text", ""),
                source=payload.get("source", "unknown"),
                chunk_index=payload.get("chunk_index", 0),
                start_char=payload.get("start_char", 0),
                end_char=payload.get("end_char", 0),
            )
            # Qdrant returns cosine similarity (1 = identical, -1 = opposite)
            score = float(scored_point.score)
            search_results.append(SearchResult(chunk=chunk, score=score))

        return search_results

    # ── Stats ────────────────────────────────────────────────────

    @property
    def count(self) -> int:
        try:
            info = self._client.get_collection(collection_name=self.collection_name)
            return info.points_count
        except Exception:
            return 0

    def reset(self) -> None:
        """Drop all data and reset the index."""
        try:
            self._client.delete_collection(collection_name=self.collection_name)
        except Exception:
            pass
        self._ensure_collection()

    @property
    def index(self):
        return self._client