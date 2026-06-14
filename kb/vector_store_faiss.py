"""FAISS-backed vector store for knowledge base retrieval."""

import json
import os
from typing import TYPE_CHECKING

import faiss
import numpy as np

from kb.chunker import Chunk
from kb.embed import embed_query, embed_texts
from kb.vector_store_base import SearchResult, VectorStoreBase


class FAISSVectorStore(VectorStoreBase):
    """Manages a FAISS index over document chunks with metadata.

    Persists index + metadata to disk so the knowledge base survives restarts.
    """

    def __init__(self, index_dir: str, embedding_dim: int = 1024):
        super().__init__(index_dir, embedding_dim)
        self.chunks: list[Chunk] = []
        self._index: faiss.IndexFlatIP | None = None
        os.makedirs(index_dir, exist_ok=True)
        self._load()

    # ── Persistence ──────────────────────────────────────────────

    def _index_path(self) -> str:
        return os.path.join(self.index_dir, "faiss.index")

    def _meta_path(self) -> str:
        return os.path.join(self.index_dir, "chunks.json")

    def _load(self) -> None:
        """Load index and metadata from disk if they exist."""
        if os.path.exists(self._index_path()) and os.path.exists(self._meta_path()):
            self._index = faiss.read_index(self._index_path())
            with open(self._meta_path(), encoding="utf-8") as f:
                raw = json.load(f)
            self.chunks = [
                Chunk(
                    text=c["text"],
                    source=c["source"],
                    chunk_index=c["chunk_index"],
                    start_char=c["start_char"],
                    end_char=c["end_char"],
                )
                for c in raw
            ]
        else:
            self._index = faiss.IndexFlatIP(self.embedding_dim)
            self.chunks = []

    def save(self) -> None:
        """Persist index and metadata to disk."""
        faiss.write_index(self._index, self._index_path())
        with open(self._meta_path(), "w", encoding="utf-8") as f:
            json.dump(
                [
                    {
                        "text": c.text,
                        "source": c.source,
                        "chunk_index": c.chunk_index,
                        "start_char": c.start_char,
                        "end_char": c.end_char,
                    }
                    for c in self.chunks
                ],
                f,
                indent=2,
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

        vectors = np.array(embeddings, dtype=np.float32)
        # Normalize for inner-product (cosine) similarity
        faiss.normalize_L2(vectors)
        self._index.add(vectors)
        self.chunks.extend(chunks)
        self.save()

    # ── Retrieval ────────────────────────────────────────────────

    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """Retrieve the top-k most relevant chunks for a query."""
        if not self.chunks or self._index is None:
            return []

        query_vec = embed_query(query)
        if not query_vec:
            return []

        q = np.array([query_vec], dtype=np.float32)
        faiss.normalize_L2(q)
        scores, indices = self._index.search(q, min(top_k, len(self.chunks)))

        results: list[SearchResult] = []
        for score, idx in zip(scores[0], indices[0], strict=False):
            if idx < 0 or idx >= len(self.chunks):
                continue
            results.append(SearchResult(chunk=self.chunks[idx], score=float(score)))

        return results

    # ── Stats ────────────────────────────────────────────────────

    @property
    def count(self) -> int:
        return len(self.chunks)

    def reset(self) -> None:
        """Drop all data and reset the index."""
        self._index = faiss.IndexFlatIP(self.embedding_dim)
        self.chunks = []
        for path in [self._index_path(), self._meta_path()]:
            if os.path.exists(path):
                os.remove(path)

    @property
    def index(self):
        return self._index