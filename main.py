"""NV-Agent — entry point. Starts the FastAPI server with RAG agent + KB."""

import logging
import os
import sys

from agent.rag_agent import RAGAgent
from agent.session_store import SessionStore
from chat.app import create_app
from chat.routes import set_agent, set_store
from config import config
from kb.ingest import ingest_documents
from kb.vector_store_factory import create_vector_store, get_vector_store_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def main() -> None:
    # Validate API key
    if not config.nvidia.api_key:
        print("ERROR: NVIDIA_API_KEY environment variable is not set.")
        print("Export it before running: export NVIDIA_API_KEY='your-key-here'")
        sys.exit(1)

    # Initialize knowledge base
    print("[init] Loading knowledge base...")
    try:
        vs_config = get_vector_store_config()
        # Remove 'backend' from config since we pass it explicitly
        backend = vs_config.pop("backend", config.kb.vector_store)
        vs_config.update(config.kb.vector_store_options)
        store = create_vector_store(
            backend=backend,
            index_dir=config.kb.index_dir,
            embedding_dim=config.nvidia.embedding_dim,
            **vs_config,
        )
        set_store(store)
        print(f"[init] Using vector store backend: {backend}")
    except ImportError as exc:
        logger.error("[init] missing dependency for vector store: %s", exc)
        sys.exit(1)
    except Exception as exc:
        logger.error("[init] failed to initialize knowledge base: %s", exc)
        sys.exit(1)

    # Auto-ingest from data/ directory on startup
    if os.path.isdir(config.kb.data_dir) and os.listdir(config.kb.data_dir):
        print(f"[init] Ingesting documents from {config.kb.data_dir}...")
        try:
            n = ingest_documents(store)
            print(f"[init] Indexed {n} chunks from data directory")
        except Exception as exc:
            logger.error("[init] ingestion error: %s", exc)
            print(f"[init] Warning: ingestion error: {exc}")
    else:
        # Create data dir for future uploads
        os.makedirs(config.kb.data_dir, exist_ok=True)
        print(f"[init] Data directory is empty. Add files to {config.kb.data_dir} or use the API.")

    print(f"[init] Knowledge base ready — {store.count} total chunks")

    # Initialize session store (persists conversations to disk)
    session_dir = os.path.join(os.path.dirname(__file__), "data", "sessions")
    try:
        session_store = SessionStore(session_dir)
        logger.info("[init] Session persistence directory: %s", session_dir)
    except Exception as exc:
        logger.error("[init] failed to initialize session store: %s", exc)
        sys.exit(1)

    # Initialize agent (with session persistence)
    print("[init] Initializing RAG agent...")
    try:
        agent = RAGAgent(store, session_store=session_store)
        set_agent(agent)
    except Exception as exc:
        logger.error("[init] failed to initialize RAG agent: %s", exc)
        sys.exit(1)

    # Create and run the app
    app = create_app()
    print(f"[init] Starting server on http://{config.server.host}:{config.server.port}")
    print(f"[init] Docs at http://{config.server.host}:{config.server.port}/docs")

    import uvicorn

    uvicorn.run(
        app,
        host=config.server.host,
        port=config.server.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
