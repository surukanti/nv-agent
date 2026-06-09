# ⚡ NV-Agent

**A self-hosted RAG chatbot you can point at your own documents and start asking questions — in 60 seconds.**

> Most AI chatbots give you generic answers. NV-Agent grounds every response in **your** documents, cites its sources, and tells you honestly when it doesn't know. Drop in PDFs, Word docs, or text files, and start chatting over your knowledge base instantly.

---

## The Problem It Solves

- **Generic AI = generic answers.** Off-the-shelf chatbots hallucinate about your domain because they don't know your data.
- **RAG is hard to set up.** Most RAG tutorials leave you with a notebook, not a production-ready app with a UI, persistence, and file uploads.
- **Enterprise knowledge is trapped in files.** PDFs, DOCX files, and text docs sit in folders — NV-Agent makes them instantly queryable.
- **Conversations are lost.** Most demo chatbots forget everything when you refresh. NV-Agent persists every session to disk.

## What We Built

NV-Agent is a **complete, self-contained RAG system** — not a library, not a framework, not a notebook. You run one command, open a browser, and chat over your own documents:

| Capability | How |
|---|---|
| **Grounded answers** | Every response is backed by FAISS vector search over your documents, with source citations |
| **Real-time streaming** | WebSocket + SSE streaming — see the answer (and the agent's reasoning) token by token |
| **Multi-format ingestion** | Drop in `.pdf`, `.docx`, `.txt`, `.md`, `.py`, `.json`, `.yaml`, `.csv`, `.html`, `.xml`, `.rst` — auto-indexed on startup |
| **Smart chunking** | Paragraph-aware → sentence-aware → word-boundary splitting with overlap — no cutting mid-sentence |
| **Session persistence** | Conversations survive server restarts. Every message is timestamped and saved to disk atomically |
| **Browser file upload** | Upload PDFs and Word docs directly from the UI — no CLI needed |
| **Dark-themed chat UI** | Responsive single-page interface — sidebar, session management, KB status panel |
| **Multi-model support** | Any model on NVIDIA NIM (Nemotron, Llama, DeepSeek, etc.) — just change one config value |
| **Production patterns** | Custom exceptions, proper HTTP status codes, thread-safe state, filename sanitization, upload size limits |

---

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- NVIDIA NIM API key — grab one free at [build.nvidia.com](https://build.nvidia.com/)

### Install & Run

```bash
# 1. Clone and enter
git clone <your-repo-url> nv-agent && cd nv-agent

# 2. Create virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure your API key
cp .env.example .env
# Edit .env — set NVIDIA_NIM_API_KEY="nvapi-your-key-here"

# 5. Add your documents (optional)
cp ~/my-docs/*.pdf ~/my-docs/*.docx data/

# 6. Start the server
python main.py
```

Then open **http://localhost:8000** in your browser and start chatting.

- 🖥️ **Chat UI**: http://localhost:8000
- 📖 **Interactive API Docs**: http://localhost:8000/docs

---

## 🏗️ How It Works — The RAG Pipeline

```
  You ask a question
         │
         ▼
  ┌──────────────────────────────────────────────────────────┐
  │  1. EMBED QUERY                                          │
  │     Your question → bge-m3 embedding → 1024-dim vector   │
  └──────────────┬───────────────────────────────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────────────────────────────┐
  │  2. RETRIEVE                                              │
  │     Vector → FAISS inner-product search → top-5 chunks   │
  └──────────────┬───────────────────────────────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────────────────────────────┐
  │  3. AUGMENT                                               │
  │     System prompt + retrieved chunks + chat history       │
  │     → one rich message list for the LLM                   │
  └──────────────┬───────────────────────────────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────────────────────────────┐
  │  4. GENERATE                                              │
  │     NVIDIA NIM LLM (Nemotron, Llama, etc.)                │
  │     → Streams answer token-by-token via WebSocket/SSE     │
  └──────────────────────────────────────────────────────────┘
```

Every answer cites its source file and chunk number. If the knowledge base doesn't contain the answer, the agent says so honestly.

---

## 📁 Project Structure

```
nv-agent/
├── main.py                  # 🚀 Entry point — startup, init, run server
├── config.py                # ⚙️ All configuration (env vars, defaults, dataclasses)
├── requirements.txt         # 📦 Python dependencies
├── .env.example             # 🔑 API key template (copy to .env)
├── .gitignore               # 🛡️ Excludes .env, sessions, __pycache__, .venv
│
├── data/                    # 📂 Your documents — auto-indexed on startup
│   ├── sample.md            # Example knowledge base doc
│   └── sessions/            # Persisted conversation JSONs (auto-created)
│
├── kb/                      # 🧠 Knowledge Base Layer
│   ├── __init__.py          #    Exports: VectorStore, Chunk, ingest_*, chunk_text
│   ├── chunker.py           #    Multi-level text splitting (paragraph→sentence→word)
│   ├── embed.py             #    NVIDIA embedding client (singleton, batched, error-handled)
│   ├── ingest.py            #    File ingestion + readers (PDF, DOCX, 10 text formats)
│   ├── vector_store.py      #    FAISS index + metadata persistence
│   └── index/               #    Saved FAISS index + chunks.json (auto-created)
│
├── agent/                   # 🤖 Agent Layer
│   ├── __init__.py          #    Exports: RAGAgent, Session, Message, exceptions, SessionStore
│   ├── rag_agent.py         #    RAG logic: retrieve → augment → generate
│   └── session_store.py     #    Thread-safe disk persistence (atomic JSON writes)
│
├── chat/                    # 🌐 Chat API + UI Layer
│   ├── __init__.py          #    Exports: create_app, router
│   ├── app.py               #    FastAPI factory, CORS, static file mount
│   ├── routes.py            #    All endpoints: REST, SSE, WebSocket, file upload
│   └── ui/
│       ├── index.html       #    Chat page (sidebar, messages, upload, KB panel)
│       ├── style.css        #    Dark theme with NVIDIA green accent
│       ├── app.js           #    Client logic (WS, SSE, session mgmt, file upload)
│       └── marked.min.js    #    Markdown renderer
│
└── test-agent.py            # 🧪 Quick CLI smoke test
```

### Design Decisions

| Decision | Why |
|----------|-----|
| **No build step** | UI is vanilla HTML/CSS/JS — zero toolchain, just open in a browser |
| **FAISS (not a vector DB)** | Zero-infrastructure — index lives on disk, no external service needed |
| **Singleton OpenAI client** | Both embed.py and rag_agent.py lazily create one client — no connection churn |
| **Thread+Queue for streaming** | OpenAI SDK is synchronous — we run it in a worker thread, pipe events via asyncio.Queue to avoid the StopIteration-in-async bug |
| **Atomic file writes** | Sessions and index use temp-file + rename (POSIX atomic) — no corruption on crash |
| **Skip dirs in ingestion** | `data/sessions/`, `.git`, `.venv` are excluded — session JSONs don't pollute the knowledge base |
| **Custom exception hierarchy** | `RAGAgentError → SessionNotFoundError / LLMError` — routes catch specific types and return proper HTTP codes |
| **Filename sanitization** | Upload endpoint strips path traversal (`../../../etc/passwd` → `_.._.._.._etc_passwd`) |

---

## 📡 API Reference

All endpoints are under `/api`. Full interactive docs at `/docs`.

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send a message, get a full response |
| `POST` | `/api/chat/stream` | Send a message, get a streaming SSE response |
| `WS` | `/api/ws/chat` | WebSocket chat with real-time token streaming |

**Request body** (chat + stream):
```json
{ "session_id": "uuid", "message": "What does the KB say about X?" }
```

**SSE events**:
```
data: {"token": "answer "}
data: {"reasoning": "thinking..."}
data: [DONE]
```

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create a session (optional `?title=My+Chat`) |
| `GET` | `/api/sessions` | List all sessions with titles |
| `GET` | `/api/sessions/{id}/history` | Get messages (`?limit=50`) |
| `DELETE` | `/api/sessions/{id}` | Delete a session |

### Knowledge Base

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/kb/status` | Chunk count + index status |
| `POST` | `/api/kb/ingest` | Ingest raw text (JSON body) |
| `POST` | `/api/kb/ingest-dir` | Re-scan data/ and index all files |
| `POST` | `/api/kb/ingest-file` | Ingest a file by server path |
| `POST` | `/api/kb/upload` | **Upload file** (multipart/form-data, PDF/DOCX supported) |
| `DELETE` | `/api/kb/reset` | Clear the entire knowledge base |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Returns `{"status": "ok", "kb_chunks": N}` |

---

## ⚙️ Configuration

All settings are in `config.py` with sensible defaults. Override via environment variables.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NVIDIA_NIM_API_KEY` | ✅ | — | Your NVIDIA NIM API key (also accepts `NVIDIA_API_KEY`, `NGC_API_KEY`) |

### Config Defaults (`config.py`)

| Setting | Default | What It Controls |
|---------|---------|-----------------|
| `chat_model` | `nvidia/nemotron-3-ultra-550b-a55b` | LLM model ID (any model on NVIDIA NIM) |
| `embedding_model` | `baai/bge-m3` | Embedding model (must match `embedding_dim`) |
| `embedding_dim` | 1024 | Vector dimension — must match embedding model output |
| `temperature` | 1.0 | LLM sampling temperature |
| `top_p` | 0.95 | Nucleus sampling threshold |
| `max_tokens` | 16384 | Max response tokens |
| `enable_thinking` | True | Show reasoning/thinking tokens |
| `reasoning_budget` | 16384 | Token budget for reasoning |
| `chunk_size` | 512 | Characters per chunk |
| `chunk_overlap` | 64 | Overlap characters between chunks |
| `top_k` | 5 | Number of context chunks to retrieve |
| `data_dir` | `./data` | Directory for knowledge base documents |
| `port` | 8000 | Server port |
| `cors_origins` | `["*"]` | CORS allowed origins |

> ⚠️ **If you change the embedding model**, you MUST delete `kb/index/` to reset the vector index — mismatched dimensions will cause search failures.

---

## 🔄 Run Steps — How Data Flows

### Server Startup (`main.py`)

```
1. Validate NVIDIA_API_KEY exists
2. Load/create FAISS vector store from kb/index/
3. Auto-ingest all files in data/ → chunk → embed → index
4. Initialize SessionStore (data/sessions/)
5. Load all persisted sessions into memory
6. Initialize RAGAgent with store + session_store
7. Create FastAPI app with CORS, routes, static file mount
8. Start uvicorn on 0.0.0.0:8000
```

### Document Ingestion (startup, API upload, or directory re-scan)

```
1. Walk data/ directory (skip sessions/, .git, .venv, __pycache__)
2. For each supported file (.pdf, .docx, .txt, .md, etc.):
   a. Read file using format-specific reader
   b. Split text into overlapping chunks (paragraph/sentence-aware)
   c. Batch-embed chunks (16 at a time via NVIDIA embedding API)
   d. Normalize vectors (L2) → add to FAISS index
   e. Save updated index + metadata to kb/index/
3. Report: N files, M chunks, E errors
```

### Chat Request (REST, SSE, or WebSocket)

```
1. Look up session by ID (load from disk if not in memory)
2. Embed user query → search FAISS for top-k similar chunks
3. Build message list:
   - System prompt with RAG instructions
   - Injected context: retrieved chunks with source citations
   - Conversation history (user + assistant messages)
   - Current user message
4. Call NVIDIA LLM API (streaming or non-streaming)
5. Stream tokens to client via WebSocket/SSE:
   - "reasoning" events → thinking/reasoning tokens
   - "token" events → visible answer tokens
6. On completion: save user + assistant messages to session
7. Persist session to data/sessions/{id}.json (atomic write)
```

### Session Persistence

```
- On create:  Session → data/sessions/{uuid}.json (atomic temp+rename)
- On chat:    Append messages, update timestamp, re-save
- On startup: Load all JSON files from data/sessions/ into memory
- On switch:  If not in memory, try loading from disk
- On delete:  Remove from memory + delete JSON file
```

### File Upload (browser → server)

```
1. Browser reads file, creates FormData
2. POST /api/kb/upload (multipart/form-data)
3. Server validates extension (.pdf, .docx, .txt, etc.)
4. Server sanitizes filename (strip path traversal)
5. Server checks file size (max 50 MB)
6. Save file to data/{sanitized_name}
7. Run through ingestion pipeline (read → chunk → embed → index)
8. Return chunks_added count
9. If ingestion fails, clean up the saved file
```

---

## 🤝 Contributing

We welcome contributions! Here's how to get started.

### Development Setup

```bash
git clone <your-repo-url> && cd nv-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Add your NVIDIA API key
```

### Contribution Workflow

1. **Fork** the repo and create a feature branch from `main`
2. **Make your changes** — follow the code style below
3. **Test manually** — run `python main.py` and verify your change works end-to-end
4. **Commit clearly** — use descriptive messages (`Add X support`, `Fix Y bug`)
5. **Open a Pull Request** — describe what you changed and why

### Code Standards

| Area | Standard |
|------|----------|
| **Python** | PEP 8, type hints on all function signatures, docstrings on public functions |
| **Error handling** | Use custom exceptions (`RAGAgentError`, `DocumentIngestionError`), never expose internal details in API responses |
| **Logging** | `logging.getLogger(__name__)` per module, prefix with `[module]` (e.g., `[rag]`, `[ingest]`) |
| **Imports** | Stdlib → third-party → local, blank lines between groups |
| **JavaScript** | 2-space indent, strict mode, no frameworks |
| **CSS** | Custom properties for theming, BEM-like naming |
| **Tests** | Manual validation via `python main.py` + browser/API testing |

### Adding a New File Format

Want to support `.epub`, `.pptx`, or another format?

1. Add a reader function in `kb/ingest.py` — follow the `_read_pdf` / `_read_docx` pattern
2. Register it in the `_READERS` dict
3. Add the extension to `SUPPORTED_EXTENSIONS` in `chat/routes.py`
4. Update the `accept` attribute on the file input in `chat/ui/index.html`
5. Add the dependency to `requirements.txt`
6. Test by uploading a file through the UI

### Adding a New LLM Provider

NV-Agent uses the OpenAI-compatible API format via `config.nvidia.base_url`. To switch providers:

1. Update `config.py` — change `base_url`, `chat_model`, `embedding_model`, `embedding_dim`
2. Delete `kb/index/` to reset the vector store (different embedding = different dimensions)
3. Set the appropriate API key env var

### Project Conventions

| Convention | Reason |
|---|---|
| **No build step** | UI is vanilla HTML/CSS/JS served as static files — zero toolchain friction |
| **Singleton clients** | OpenAI clients in `embed.py` and `rag_agent.py` are lazily initialized and reused — no connection waste |
| **Thread-safe state** | `SessionStore` uses mutex locks; streaming uses thread+queue to bridge sync SDK → async server |
| **Atomic writes** | Session files and FAISS index use temp-file + `rename()` — crash-safe on POSIX |
| **Skip dirs in ingestion** | `sessions/`, `.git`, `.venv`, `__pycache__`, `.claude` won't pollute the knowledge base |
| **Sanitized filenames** | Uploads strip path traversal, null bytes, and special characters |
| **Generic error responses** | Routes log full exceptions but return `"Internal error"` to clients — no stack traces leaked |

---

## 📄 License

This project is provided as-is. See [LICENSE](LICENSE) for details.
