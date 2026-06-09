"""Embedding client — generates embeddings via NVIDIA's API."""

import logging

from openai import OpenAI

from config import config

logger = logging.getLogger(__name__)

# Module-level singleton client — lazily initialized
_client: OpenAI | None = None


def _get_client() -> OpenAI:
    """Get or create the shared OpenAI embedding client."""
    global _client
    if _client is None:
        if not config.nvidia.api_key:
            raise ValueError("NVIDIA_API_KEY is not set — cannot generate embeddings")
        _client = OpenAI(
            base_url=config.nvidia.base_url,
            api_key=config.nvidia.api_key,
        )
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using NVIDIA's embedding model.

    Returns a list of float vectors, one per input text.
    Batches in groups of 16 to stay within API limits.

    Raises:
        ValueError: If the API key is not configured.
        RuntimeError: If the embedding API call fails.
    """
    if not texts:
        return []

    client = _get_client()
    all_embeddings: list[list[float]] = []
    batch_size = 16

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        try:
            response = client.embeddings.create(
                model=config.nvidia.embedding_model,
                input=batch,
                encoding_format="float",
            )
        except Exception as exc:
            logger.error("[embed] API call failed for batch %d: %s", i, exc)
            raise RuntimeError(f"Embedding API call failed: {exc}") from exc

        # Sort by index to preserve order
        sorted_data = sorted(response.data, key=lambda d: d.index)
        all_embeddings.extend([d.embedding for d in sorted_data])

    return all_embeddings


def embed_query(text: str) -> list[float]:
    """Generate an embedding for a single query string.

    Returns an empty list if the call fails (non-fatal for search).
    """
    try:
        result = embed_texts([text])
        return result[0] if result else []
    except Exception as exc:
        logger.error("[embed] query embedding failed: %s", exc)
        return []
