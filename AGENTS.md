# AI Agent Instructions

## Purpose

NV-Agent solves a concrete problem: **generic AI chatbots can't answer questions about your documents.** This project is a complete, self-hosted RAG system that lets anyone point at their own files (PDFs, Word docs, code, text) and start asking grounded questions — with source citations, streaming responses, and a full browser UI — in under 60 seconds.

It is NOT a framework or a library. It is a **finished application** that you run, add documents to, and chat with.

## What We Built

| Capability | Implementation |
|---|---|
| Knowledge-grounded Q&A | RAG pipeline: embed query → FAISS retrieval → context injection → LLM generation |
| 12 file formats | Text (.txt, .md, .py, .json, .yaml, .yml, .csv, .html, .xml, .rst) + binary (.pdf, .docx) |
| Smart chunking | Paragraph → sentence → word boundary splitting with overlap, no mid-sentence cuts |
| Real-time streaming | WebSocket + SSE with reasoning/thinking token support |
| Session persistence | Disk-backed JSON with atomic writes, survives server restarts |
| Browser file upload | Multipart upload with filename sanitization, extension validation, 50MB size cap |
| Production error handling | Custom exception hierarchy, per-route catch blocks, proper HTTP codes, no internal leaks |
| Zero-infrastructure | No external DB — FAISS index on disk, session JSONs on disk, one Python process |

## Architecture

### Four-layer design

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Chat UI    │────▶│   Chat API   │────▶│  RAG Agent   │────▶│  Knowledge   │
│  (Browser)   │◀────│  (FastAPI)   │◀────│  (LLM+RAG)   │◀────│    Base      │
│  WebSocket   │     │  REST/SSE/WS │     │  Retrieve →  │     │  (FAISS +    │
│  + SSE + REST│     │              │     │  Augment →   │     │  Embeddings) │
│              │     │              │     │  Generate    │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

Each layer is a Python package with a clear `__init__.py` and explicit `__all__` exports.

### File structure

```
nv-agent/
├── main.py                  # Entry point — startup sequence, init, run
├── config.py                # All configuration (dataclasses, reads .env)
├── requirements.txt         # Python dependencies (core + document processing)
├── .env.example             # API key template (DO NOT commit .env)
├── .gitignore               # Excludes .env, sessions, __pycache__, .venv
│
├── data/                    # Knowledge base documents (auto-ingested on startup)
│   └── sessions/            # Persisted conversation sessions (JSON files)
│
├── kb/                      # Knowledge Base Layer
│   ├── __init__.py          # Exports: VectorStore, Chunk, chunk_text, ingest_*
│   ├── chunker.py           # Multi-level text chunking (paragraph→sentence→word)
│   ├── embed.py             # NVIDIA embedding client (singleton, batched, error-handled)
│   ├── ingest.py            # Document ingestion + 12 format readers + DocumentIngestionError
│   ├── vector_store.py      # FAISS index + chunk metadata + persistence
│   └── index/               # Saved FAISS index + chunks.json (auto-created)
│
├── agent/                   # Agent Layer
│   ├── __init__.py          # Exports: RAGAgent, Session, Message, exceptions, SessionStore
│   ├── rag_agent.py         # RAG logic: retrieve → augment → generate + session management
│   └── session_store.py     # Thread-safe disk persistence (atomic JSON writes, timestamps)
│
├── chat/                    # Chat API + UI Layer
│   ├── __init__.py          # Exports: create_app, router
│   ├── app.py               # FastAPI factory, CORS, static file mount
│   ├── routes.py            # All endpoints: REST, SSE, WebSocket, file upload
│   └── ui/
│       ├── index.html       # Chat page (accepts .pdf/.docx uploads)
│       ├── style.css        # Dark theme with NVIDIA green accent
│       ├── app.js           # Client logic (WS, SSE, session switching, FormData upload)
│       └── marked.min.js    # Markdown renderer
│
└── test-agent.py            # Quick CLI smoke test
```

## How to Run

### One-time setup
1. `cp .env.example .env` → set `NVIDIA_NIM_API_KEY`
2. `pip install -r requirements.txt`
3. Add documents to `data/` (optional — supports .txt .md .py .json .yaml .yml .csv .html .xml .rst .pdf .docx)
4. `python main.py` → http://localhost:8000

### Startup sequence (`main.py`)

```
1. Validate NVIDIA_API_KEY → exit(1) if missing
2. Load/create FAISS VectorStore from kb/index/
3. Auto-ingest all files in data/ (skipping sessions/, .git, .venv, __pycache__, .claude)
4. Initialize SessionStore from data/sessions/
5. Load all persisted sessions into RAGAgent
6. Create FastAPI app (CORS, routes, UI static mount)
7. Start uvicorn on 0.0.0.0:8000
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create session (optional `?title=`) |
| `GET` | `/api/sessions` | List all sessions with titles |
| `GET` | `/api/sessions/{id}/history` | Get conversation history (`?limit=N`) |
| `DELETE` | `/api/sessions/{id}` | Delete session from memory + disk |
| `POST` | `/api/chat` | Non-streaming chat (returns full answer) |
| `POST` | `/api/chat/stream` | SSE streaming chat (token-by-token) |
| `WS` | `/api/ws/chat` | WebSocket streaming chat |
| `POST` | `/api/kb/upload` | Upload file (multipart/form-data, PDF/DOCX supported) |
| `POST` | `/api/kb/ingest` | Ingest raw text (JSON body: `{text, source}`) |
| `POST` | `/api/kb/ingest-dir` | Re-ingest all files from data/ |
| `POST` | `/api/kb/ingest-file` | Ingest file by server-side path |
| `GET` | `/api/kb/status` | Chunk count + index readiness |
| `DELETE` | `/api/kb/reset` | Clear the knowledge base |
| `GET` | `/api/health` | Health check with chunk count |

## Configuration

All settings in `config.py` (dataclasses). Key env vars:
- `NVIDIA_NIM_API_KEY` / `NVIDIA_API_KEY` / `NGC_API_KEY` — NVIDIA API key
- `MODEL` — chat model override (default: `nvidia/nemotron-3-ultra-550b-a55b`)
- Default embedding model: `baai/bge-m3` (dimension: 1024)

## Important Guidance for AI Agents

### Security — NEVER violate these
- **NEVER commit `.env`** or any API keys to source control
- Uploaded filenames are sanitized: path traversal stripped, null bytes removed, special chars replaced with `_`
- Error responses use generic messages (`"Internal error"`) — internal exception details are only logged, never sent to clients
- File uploads capped at 50 MB (`MAX_UPLOAD_SIZE` in routes.py)
- Upload endpoint validates file extension against `SUPPORTED_EXTENSIONS` → 400 if unsupported

### Knowledge Base
- FAISS index persists in `kb/index/` — survives restarts
- **When changing the embedding model**: DELETE `kb/index/` or vectors will mismatch
- `data/sessions/` is excluded from ingestion (along with `.git`, `.venv`, `__pycache__`, `.claude`)
- PDF support: `PyPDF2>=3.0.0` (lazy import — ImportError if missing)
- DOCX support: `python-docx>=1.1.0` (lazy import — ImportError if missing)
- Missing optional dependencies produce clear error messages, not crashes

### Embedding Client (`kb/embed.py`)
- Uses a **singleton** OpenAI client — `_get_client()` lazily creates one instance
- `embed_texts()` batches in groups of 16, raises `RuntimeError` on API failure
- `embed_query()` returns `[]` on failure (non-fatal — search returns empty results, not a crash)
- Do NOT create a new OpenAI client per call

### Session Persistence (`agent/session_store.py`)
- Sessions: individual JSON files in `data/sessions/{uuid}.json`
- Writes use temp-file + `rename()` for POSIX atomicity — no half-written files on crash
- Thread-safe: all file operations guarded by `threading.Lock`
- Each session stores: `id`, `title`, `created_at`, `updated_at`, full message history with per-message `timestamp`
- `SessionStore.save()` is called after every chat message (both sync and streaming)
- On startup, `RAGAgent.__init__()` calls `session_store.load_all()` to recover previous sessions

### Chunking (`kb/chunker.py`)
- `chunk_text()` — multi-level boundary strategy:
  1. Paragraph boundary (`\n\n`) — preserves document structure
  2. Sentence boundary (`. `, `? `, `! `) — natural breaks
  3. Word boundary (space/newline) — graceful fallback
  4. Fixed-size — last resort
- Chunks below `min_chunk_size` (default 100) are merged with the previous chunk to avoid tiny fragments
- `chunk_text_preserving_structure()` — alternative that keeps paragraphs intact, splitting only when a paragraph exceeds `chunk_size`

### Error Handling
- **Custom exception hierarchy**:
  - `RAGAgentError` (base) → `SessionNotFoundError`, `LLMError`
  - `DocumentIngestionError` (ingest.py)
- Routes catch specific exceptions → proper HTTP status codes:
  - `SessionNotFoundError` → 404
  - `LLMError` → 502
  - Catch-all → 500 with generic message
- All errors logged with module prefix: `[rag]`, `[ingest]`, `[routes]`, `[embed]`, `[upload]`

### Streaming Architecture
- `RAGAgent.chat_stream()` yields dicts: `{"type": "reasoning"/"text"/"error", "content": str}`
- `_consume_stream()` runs in a worker thread, puts events onto `asyncio.Queue`
- `had_error` flag prevents sending both `error` AND `done` events (only one terminal event)
- SSE: `data: {"token": "..."}` / `data: {"reasoning": "..."}` / `data: [DONE]`
- WebSocket: JSON `{"type": "token"/"reasoning"/"done"/"error", "content": "..."}`

### UI (`chat/ui/app.js`)
- No build step — vanilla HTML/CSS/JS served as static files
- File uploads use `FormData` → `POST /api/kb/upload` (works for binary PDF/DOCX)
- On startup: fetches persisted sessions from `GET /api/sessions`
- On session switch: loads history from `GET /api/sessions/{id}/history`
- `apiFetch()` only sets `Content-Type: application/json` when body is NOT FormData
- Session list, KB status, and toast notifications are all client-side state

### Adding a New File Format
1. Add reader function in `kb/ingest.py` (follow `_read_pdf` pattern — lazy import, per-page/per-section error handling)
2. Register in `_READERS` dict
3. Add extension to `SUPPORTED_EXTENSIONS` in `chat/routes.py`
4. Update `<input accept="...">` in `chat/ui/index.html`
5. Add dependency to `requirements.txt`
