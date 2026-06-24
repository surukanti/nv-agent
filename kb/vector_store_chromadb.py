"""ChromaDB-backed vector store for knowledge base retrieval.

ChromaDB is an open-source embedding database that provides persistent storage
and efficient vector search. It's a good alternative to FAISS when you need
a standalone database server or more features.
"""

import contextlib
import os
from typing import TYPE_CHECKING

import chromadb
from chromadb.config import Settings

from kb.chunker import Chunk
from kb.embed import embed_query, embed_texts
from kb.vector_store_base import SearchResult, VectorStoreBase

if TYPE_CHECKING:
    from chromadb.api.models.Collection import Collection


class ChromaDBVectorStore(VectorStoreBase):
    """Manages a ChromaDB collection over document chunks with metadata.

    Persists to disk so the knowledge base survives restarts.
    """

    def __init__(
        self,
        index_dir: str,
        embedding_dim: int = 1024,
        collection_name: str = "nv_agent_kb",
        persist_directory: str | None = None,
    ):
        super().__init__(index_dir, embedding_dim)
        self.collection_name = collection_name
        self.persist_directory = persist_directory or os.path.join(index_dir, "chromadb")
        self._client: chromadb.PersistentClient | None = None
        self._collection: Collection | None = None
        os.makedirs(self.persist_directory, exist_ok=True)
        self._init_client()

    def _init_client(self) -> None:
        """Initialize ChromaDB client and collection."""
        self._client = chromadb.PersistentClient(
            path=self.persist_directory,
            settings=Settings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
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

        ids = [f"{c.source}_{c.chunk_index}" for c in chunks]
        metadatas = [
            {
                "source": c.source,
                "chunk_index": c.chunk_index,
                "start_char": c.start_char,
                "end_char": c.end_char,
            }
            for c in chunks
        ]

        self._collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )

    # ── Retrieval ────────────────────────────────────────────────

    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """Retrieve the top-k most relevant chunks for a query."""
        query_vec = embed_query(query)
        if not query_vec:
            return []

        results = self._collection.query(
            query_embeddings=[query_vec],
            n_results=min(top_k, self.count),
            include=["documents", "metadatas", "distances"],
        )

        search_results: list[SearchResult] = []
        if not results["documents"] or not results["documents"][0]:
            return search_results

        for doc, metadata, distance in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
            strict=False,
        ):
            # ChromaDB returns cosine distance (0 = identical, 2 = opposite)
            # Convert to similarity score (1 = identical, -1 = opposite)
            score = 1.0 - (distance / 2.0)

            chunk = Chunk(
                text=doc,
                source=metadata.get("source", "unknown"),
                chunk_index=metadata.get("chunk_index", 0),
                start_char=metadata.get("start_char", 0),
                end_char=metadata.get("end_char", 0),
            )
            search_results.append(SearchResult(chunk=chunk, score=score))

        return search_results

    # ── Stats ────────────────────────────────────────────────────

    @property
    def count(self) -> int:
        try:
            return self._collection.count()
        except Exception:
            return 0

    def reset(self) -> None:
        """Drop all data and reset the index."""
        with contextlib.suppress(Exception):
            self._client.delete_collection(name=self.collection_name)
        self._collection = self._client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    @property
    def index(self):
        return self._collection
