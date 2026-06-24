"""Abstract base class for vector stores."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from kb.chunker import Chunk


@dataclass
class SearchResult:
    """A single retrieval result."""

    chunk: "Chunk"
    score: float


class VectorStoreBase(ABC):
    """Abstract base class for vector store backends."""

    def __init__(self, index_dir: str, embedding_dim: int = 1024):
        self.index_dir = index_dir
        self.embedding_dim = embedding_dim

    @abstractmethod
    def add_chunks(self, chunks: list["Chunk"]) -> None:
        """Embed and index a list of chunks."""
        ...

    @abstractmethod
    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """Retrieve the top-k most relevant chunks for a query."""
        ...

    @abstractmethod
    def reset(self) -> None:
        """Drop all data and reset the index."""
        ...

    @property
    @abstractmethod
    def count(self) -> int:
        """Return total number of chunks in the store."""
        ...

    @property
    @abstractmethod
    def index(self) -> object | None:
        """Return the underlying index object if available (for status checks)."""
        ...

    @property
    def index_ready(self) -> bool:
        """Return True if the index is initialized and has data."""
        return self.count > 0 and self.index is not None
