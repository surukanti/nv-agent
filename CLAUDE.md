# CLAUDE.md — Project Context for AI Agents

> This file provides Claude Code (and other AI agents) with the essential context needed to work effectively on this project. For full architecture guidelines, see [AGENTS.md](AGENTS.md).

## What This Project Is

NV-Agent is a **self-hosted RAG AI Agent** — a complete application that lets users chat over their own documents with grounded, cited answers. It is NOT a library or framework. Users run it, add documents, and chat.

## Quick Reference

### Commands

```bash
# Run the server (local)
python main.py                    # → http://localhost:8000

# Quick API smoke test (no server needed)
python test-agent.py              # Prompts for input, calls NIM API directly

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest tests/ -v

# Lint
ruff check .                    # CI lint (ruff only)
make lint                       # Full lint: flake8 + ruff + pylint

# Format check
ruff format --check .

# Type check
mypy . --ignore-missing-imports

# Frontend dev
cd frontend && npm run dev        # Vite on :5173 (proxies /api to :8000)
cd frontend && npm run build:deploy  # Build React → chat/ui/ (for Docker)

# Docker Compose
make compose-up                   # Start all services (rebuilds image first)
make compose-down                 # Stop all services
make compose-reset                # Stop, remove volumes, restart (rebuilds)
make compose-logs                 # Follow logs
```

### Key URLs (when running)

- **Chat UI**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Health**: http://localhost:8000/api/health

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NVIDIA_NIM_API_KEY` | ✅ | Primary API key (also accepts `NVIDIA_API_KEY`, `NGC_API_KEY`) |
| `MODEL` | ❌ | Override chat model (default: `nvidia/nemotron-3-ultra-550b-a55b`) |
| `NV_AGENT_VECTOR_STORE` | ❌ | Vector store backend: `faiss` (default), `chromadb`, `qdrant` |
| `NV_AGENT_AUTH_KEY` | ❌ | API key for auth middleware (protects `/api/*`, skips `/api/health*`) |
| `NV_AGENT_RATE_LIMIT` | ❌ | Rate limit per IP (format: `N/unit`, e.g., `60/minute`, `10/second`) |
| `NV_AGENT_QDRANT_HOST` | ❌ | Qdrant server host (default: `qdrant`) |
| `NV_AGENT_QDRANT_PORT` | ❌ | Qdrant server port (default: `6333`) |
| `NV_AGENT_QDRANT_API_KEY` | ❌ | Qdrant API key (for cloud/self-hosted with auth) |
| `NV_AGENT_QDRANT_COLLECTION` | ❌ | Qdrant collection name (default: `nv_agent_kb`) |
| `NV_AGENT_QDRANT_PATH` | ❌ | Qdrant local filesystem path (alternative to host/port) |
| `NV_AGENT_CHROMADB_COLLECTION` | ❌ | ChromaDB collection name (default: `nv_agent_kb`) |
| `NV_AGENT_CHROMADB_PERSIST_DIR` | ❌ | ChromaDB persist directory |

## Architecture — 4 Layers

```
frontend/    → React 18 + TypeScript + Vite + Tailwind v4 (dev)
chat/ui/     → React production build (served as static files)
chat/        → FastAPI routes (REST, SSE, WebSocket)
agent/       → RAG logic (retrieve → augment → generate)
kb/          → Knowledge base (ingest, chunk, embed, VectorStoreBase)
```

**Data flow**: User query → embed → VectorStore search (FAISS/Qdrant/ChromaDB) → augment prompt → LLM generate → stream tokens back

**Vector Store Backends** (pluggable via factory pattern):
- **FAISS** (default) — Zero-infrastructure, local disk index
- **Qdrant** — High-performance Rust vector DB (starts with all services, select via `NV_AGENT_VECTOR_STORE=qdrant`)
- **ChromaDB** — Python-based embedding DB (starts with all services, select via `NV_AGENT_VECTOR_STORE=chromadb`)

## Key Patterns

### Singleton OpenAI Clients
Both `kb/embed.py` and `agent/rag_agent.py` lazily create one `OpenAI` client via `_get_client()`. **Never** create a new client per call.

### Streaming Bridge
`chat/routes.py` → `_consume_stream()` runs `chat_stream()` in a **worker thread** → pipes events through `asyncio.Queue` → async handler sends to WebSocket/SSE. This avoids the `StopIteration`-in-async bug.

### Session Persistence
- **Server-side**: `SessionStore` saves to `data/sessions/{uuid}.json` with atomic writes (temp-file + `rename()`). Loaded on startup via `session_store.load_all()`.
- **Client-side**: Session ID saved to `sessionStorage` — page refresh reconnects to the same session via WebSocket with `?session_id=` param and loads history. Cleared on new-session and delete-session.

### Atomic File Writes
`SessionStore.save()` and `VectorStore.save()` use temp-file + `rename()` for POSIX atomicity. Never write directly to the target path.

### Custom Exception Hierarchy
```
RAGAgentError (base)
├── SessionNotFoundError → HTTP 404
└── LLMError            → HTTP 502
DocumentIngestionError   → HTTP 400/500
```
Routes catch specific types. Never expose internal details in API responses — log full error, return `"Internal error"`.

### Module-Prefix Logging
Every module uses `logging.getLogger(__name__)` with a `[prefix]` tag:
- `[rag]` — agent/rag_agent.py
- `[ingest]` — kb/ingest.py
- `[embed]` — kb/embed.py
- `[routes]` — chat/routes.py
- `[session_store]` — agent/session_store.py
- `[upload]` — file upload path in routes.py

## Security Rules

- **NEVER** commit `.env` or API keys
- Upload filenames are sanitized (`_sanitize_filename()`)
- File uploads capped at 50 MB
- Extension validation against `SUPPORTED_EXTENSIONS`
- Generic error responses — no stack traces in API output

## Adding New Features

### New File Format
1. Reader function in `kb/ingest.py` (lazy import pattern like `_read_pdf`)
2. Register in `_READERS` dict
3. Add to `SUPPORTED_EXTENSIONS` in `chat/routes.py`
4. Update `<input accept>` in `frontend/src/components/sidebar/KBSection.tsx`
5. Add extension to `SUPPORTED_EXTENSIONS` in `frontend/src/utils/constants.tsx`
6. Add dependency to `requirements.txt`

### New LLM Provider
1. Update `config.py` — change `base_url`, `chat_model`, `embedding_model`, `embedding_dim`
2. Delete `kb/index/` to reset FAISS index (different embedding = different dimensions)
3. For Qdrant/ChromaDB backends, call `DELETE /api/kb/reset` to clear computed vectors
4. Set appropriate API key env var

### New Vector Store Backend
1. Create new implementation in `kb/vector_store_<name>.py` inheriting `VectorStoreBase`
2. Register in `kb/vector_store_factory.py::create_vector_store()`
3. Add environment variable config in `config.py::KBConfig.__post_init__()`
4. Update `docker-compose.yml` if external service needed

### New API Endpoint
1. Add route handler in `chat/routes.py` (follow existing pattern)
2. Add Pydantic request/response models
3. Use `_run_sync()` for sync operations
4. Catch specific exceptions → proper HTTP codes
5. Add to API Endpoints table in `AGENTS.md`

## Gotchas

- **Changing embedding model** → MUST delete `kb/index/` or vectors will mismatch; for Qdrant/ChromaDB use `DELETE /api/kb/reset`
- **`embed_query()` returns `[]` on failure** — non-fatal, search returns empty results gracefully
- **`apiFetch()` in `services/api.ts`** — do NOT set `Content-Type` for FormData (browser needs to set boundary)
- **WebSocket sessions are NOT auto-deleted** on disconnect — sessions persist across connections for refresh survival
- **`RAGAgent._extra_body()`** adds `chat_template_kwargs` for Nemotron thinking/reasoning tokens — other models may not support this
- **`RAGAgent._persist_session()`** wraps `SessionStore.save()` — call after every state-changing operation
- **CI checks committed code** — always `git stash && ruff check . && ruff format --check .` against what CI sees, not your working tree

## File Map (Quick)

| File | Purpose |
|------|---------|
| `main.py` | Entry point — startup, init, run |
| `config.py` | All configuration (dataclasses, .env) |
| `test-agent.py` | CLI smoke test (bypasses RAG) |
| `kb/chunker.py` | Text splitting (paragraph→sentence→word) |
| `kb/embed.py` | NVIDIA embedding client (singleton) |
| `kb/ingest.py` | Document ingestion + 12 format readers |
| `kb/vector_store_base.py` | Abstract base class (VectorStoreBase) |
| `kb/vector_store.py` | ⚠️ Legacy FAISS store (tests only) |
| `kb/vector_store_faiss.py` | FAISS vector store implementation |
| `kb/vector_store_qdrant.py` | Qdrant vector store implementation |
| `kb/vector_store_chromadb.py` | ChromaDB vector store implementation |
| `kb/vector_store_factory.py` | Factory for creating vector stores |
| `agent/rag_agent.py` | RAG logic + session management |
| `agent/session_store.py` | Thread-safe disk persistence |
| `chat/app.py` | FastAPI factory |
| `chat/auth.py` | API key auth middleware |
| `chat/rate_limit.py` | Per-IP rate limiter |
| `chat/routes.py` | All API endpoints |
| `frontend/src/context/ChatContext.tsx` | Chat state + WebSocket/SSE streaming |
| `frontend/src/services/api.ts` | API client (`apiFetch`, auth key storage) |
| `frontend/src/utils/constants.tsx` | Shared constants, icons, storage keys |
| `docker-compose.prod.yml` | Production compose (GHCR, Caddy, limits) |
| `Caddyfile` | Reverse proxy (auto HTTPS via Let's Encrypt) |
| `deploy.sh` | One-command remote deployment |
| `Makefile` | Build, test, lint, Docker shortcuts |
| `requirements-dev.txt` | Dev dependencies |
| `.pylintrc` | Pylint configuration |
