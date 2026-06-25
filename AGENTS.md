# 🤖 AI Agent Instructions — NV-Agent

> This file defines the architecture, conventions, and coding standards for NV-Agent. It is intended for AI coding agents (and human contributors) working on this project. Every change should respect the patterns and principles documented here.

---

## 📖 Table of Contents

- [Project Intent](#project-intent)
- [What is NV-Agent?](#what-is-nv-agent)
- [What We Built](#what-we-built)
- [Architecture](#architecture)
  - [System Architecture Diagram](#system-architecture-diagram)
  - [RAG Agent Pipeline](#rag-agent-pipeline)
  - [Component Map](#component-map)
  - [Agent System Prompt](#agent-system-prompt)
  - [Agent Capabilities and Tools](#agent-capabilities-and-tools)
  - [Streaming Architecture](#streaming-architecture)
  - [Session Persistence Model](#session-persistence-model)
- [File Structure](#file-structure)
- [How to Run](#how-to-run)
  - [One-time Setup](#one-time-setup)
  - [Quick API Smoke Test](#quick-api-smoke-test)
  - [Startup Sequence](#startup-sequence)
- [API Endpoints](#api-endpoints)
- [Why NVIDIA NIM?](#why-nvidia-nim)
- [Configuration](#configuration)
- [Important Guidance for AI Agents](#important-guidance-for-ai-agents)
  - [Security — NEVER Violate These](#security--never-violate-these)
  - [Knowledge Base](#knowledge-base)
  - [Embedding Client](#embedding-client-kbembedpy)
  - [Session Persistence](#session-persistence-agentsession_storepy)
  - [Chunking](#chunking-kbchunkerpy)
  - [Error Handling](#error-handling)
  - [Streaming](#streaming)
  - [UI](#ui-frontend--built-to-chatui)
  - [Adding a New File Format](#adding-a-new-file-format)
  - [Adding a New LLM Provider](#adding-a-new-llm-provider)
- [Code Standards](#code-standards)
  - [Python](#python)
  - [JavaScript](#javascript)
  - [CSS](#css)
  - [Project Conventions](#project-conventions)
- [Testing](#testing)
- [Common Pitfalls](#common-pitfalls)

---

## Project Intent

NV-Agent solves a concrete problem: **generic AI chatbots can't answer questions about your documents.**

This project is a **complete, self-hosted RAG AI agent system** that lets anyone point at their own files (PDFs, Word docs, code, text) and start asking grounded questions — with source citations, streaming responses, and a full browser UI — in under 60 seconds.

It is NOT a framework or a library. It is a **finished application** that you run, add documents to, and chat with. The agent autonomously retrieves relevant context, reasons about it, and generates cited responses.

---

## What is NV-Agent?

NV-Agent is a **RAG (Retrieval-Augmented Generation) AI Agent** — an autonomous system that:

1. **Perceives**: Receives a user query via REST, SSE, or WebSocket
2. **Reasons**: Embeds the query, searches the vector knowledge base (FAISS / Qdrant / ChromaDB) for relevant context
3. **Acts**: Augments the LLM prompt with retrieved document chunks and source citations
4. **Generates**: Streams a grounded answer via NVIDIA NIM LLMs, with reasoning/thinking display
5. **Persists**: Saves the complete conversation to disk for session continuity

The agent follows the **Retrieve → Augment → Generate** pattern: for every user message, it first fetches the most relevant knowledge base chunks, then constructs a context-enriched prompt, then generates an answer that explicitly cites sources — and honestly says when it doesn't know.

---

## What We Built

| Capability | Implementation |
|-----------|---------------|
| Knowledge-grounded Q&A | RAG pipeline: embed query → vector retrieval → context injection → LLM generation |
| 12 file formats | Text (`.txt`, `.md`, `.py`, `.json`, `.yaml`, `.yml`, `.csv`, `.html`, `.xml`, `.rst`) + binary (`.pdf`, `.docx`) |
| Smart chunking | Paragraph → sentence → word boundary splitting with overlap, no mid-sentence cuts |
| Real-time streaming | WebSocket + SSE with reasoning/thinking token support |
| Session persistence | Disk-backed JSON with atomic writes, survives server restarts |
| Browser file upload | Multipart upload with filename sanitization, extension validation, 50MB size cap |
| Production error handling | Custom exception hierarchy, per-route catch blocks, proper HTTP codes, no internal leaks |
| Pluggable vector stores | Choose **FAISS** (default), **ChromaDB**, or **Qdrant** — factory pattern |
| Multi-model support | Any model on NVIDIA NIM (Nemotron, Llama, DeepSeek, etc.) — change one config value |

---

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NV-Agent System                            │
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────┐    ┌──────────┐ │
│  │          │    │              │    │           │    │          │ │
│  │  Chat    │◀──▶│  Chat API    │◀──▶│ RAG Agent │◀──▶│Knowledge │ │
│  │  UI      │    │  (FastAPI)   │    │ (LLM+RAG) │    │  Base    │ │
│  │          │    │              │    │           │    │(Vector   │ │
│  │ Browser  │    │ REST / SSE / │    │ Retrieve →│    │ Store)   │ │
│  │ WebSocket│    │ WebSocket    │    │ Augment → │    │          │ │
│  │ + SSE    │    │              │    │ Generate  │    │          │ │
│  └──────────┘    └──────────────┘    └───────────┘    └──────────┘ │
│       ▲               ▲                   ▲               ▲       │
│       │               │                   │               │       │
│       │          ┌────┴─────┐        ┌────┴─────┐   ┌────┴────┐  │
│       │          │  Session │        │  NVIDIA   │   │ Vector  │  │
│       │          │  Store   │        │  NIM API  │   │ Store   │  │
│       │          │  (Disk)  │        │ (Cloud)   │   │(FAISS/  │  │
│       │          └──────────┘        └───────────┘   │Qdrant/  │  │
│       │                                               │ChromaDB)│  │
│       │                                                              │
│  ┌────┴──────────────────────────────────────────────────────────┐  │
│  │                     config.py (.env)                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

External Dependencies:
  • NVIDIA NIM API (cloud)  — LLM inference + embeddings
  • Vector Store (local/remote) — FAISS / ChromaDB / Qdrant
  • PyPDF2 (local)          — PDF text extraction
  • python-docx (local)     — DOCX text extraction
```

**Four-layer design** — each layer is a Python package with a clear `__init__.py` and explicit `__all__` exports. Data flows left-to-right (request) and right-to-left (response):

| Layer | Package | Key Files | Responsibility |
|-------|---------|-----------|---------------|
| **Presentation** | `chat/ui/` | `index.html`, `/ui/assets/*.js`, `/ui/assets/*.css` | Browser UI — React 18 + TypeScript + Tailwind v4 (built from `frontend/`) |
| **API** | `chat/` | `app.py`, `routes.py` | FastAPI routes, CORS, request validation, streaming bridge |
| **Agent** | `agent/` | `rag_agent.py`, `session_store.py` | RAG logic, session management, LLM calls |
| **Knowledge Base** | `kb/` | `chunker.py`, `embed.py`, `ingest.py`, `vector_store_base.py`, `vector_store_faiss.py`, `vector_store_qdrant.py`, `vector_store_chromadb.py`, `vector_store_factory.py` | Document ingestion, chunking, embedding, pluggable vector storage |

---

### RAG Agent Pipeline

The core of the AI agent — how a user question becomes a grounded, cited answer:

```
  User asks a question
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  1. EMBED QUERY                                              │
│     User question ──▶ bge-m3 embedding ──▶ 1024-dim vector   │
│     (NVIDIA NIM embedding API @ kb/embed.py)                 │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│  2. RETRIEVE                                                 │
│     Query vector ──▶ Vector store search (FAISS/Qdrant/     │
│     ChromaDB) ──▶ top-k most relevant chunks from KB         │
│     (kb/vector_store_factory.py → backend-specific impl)     │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│  3. AUGMENT                                                  │
│     System prompt (RAG instructions)                         │
│     + retrieved chunks with [Source: file (chunk N)] tags    │
│     + conversation history (user + assistant messages)       │
│     + current user message                                   │
│     → one rich message list for the LLM                      │
│     (agent/rag_agent.py — _build_messages())                 │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│  4. GENERATE                                                 │
│     NVIDIA NIM LLM (Nemotron / Llama / DeepSeek / etc.)     │
│     → Streams answer token-by-token via WebSocket/SSE        │
│     → Reasoning/thinking tokens in collapsible "<details>"   │
│     (agent/rag_agent.py — chat_stream() generator)           │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
  Agent responds with grounded answer + source citations
  OR honestly says: "No relevant documents found in the
  knowledge base." (no hallucination)
```

---

### Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        main.py (entry point)                    │
│                                                                 │
│  1. config.py ──▶ Validates API key, sets all defaults          │
│  2. kb/vector_store_factory.py ──▶ Creates vector store (FAISS/ │
│     Qdrant/ChromaDB) from config                                │
│  3. kb/ingest.py ──▶ Walks data/, reads files, chunks, indexes  │
│     ├── kb/chunker.py ──▶ Paragraph/sentence/word-aware splits  │
│     └── kb/embed.py ──▶ Batches embeddings via NVIDIA API       │
│  4. agent/session_store.py ──▶ Loads persisted sessions from disk│
│  5. agent/rag_agent.py ──▶ Initializes RAGAgent with store      │
│  6. chat/app.py ──▶ Creates FastAPI app (CORS, routes, UI mount)│
│     └── chat/routes.py ──▶ Registers all /api/* endpoints       │
│  7. uvicorn ──▶ Serves on 0.0.0.0:8000                         │
└─────────────────────────────────────────────────────────────────┘
```

---

### Agent System Prompt

The RAG agent's behavior is governed by this system prompt (defined in `agent/rag_agent.py`):

```python
RAG_SYSTEM_PROMPT = """\
You are a helpful AI assistant with access to a custom knowledge base.
When answering questions, use the provided context from the knowledge base to
ground your responses. If the context does not contain the answer, say so
honestly — do not fabricate information.

Guidelines:
- Always cite the source file when using information from the context.
- If the user's question is outside the scope of the knowledge base, provide a
  general answer but clearly note that it is not from the knowledge base.
- Be concise but thorough.
- Format your responses in Markdown when helpful.
"""
```

**Key behaviors enforced by the prompt:**
- Always cite sources using `[Source: filename (chunk N)]` format
- Never fabricate information — honestly state when the KB lacks the answer
- Use Markdown formatting for structured responses
- Distinguish between KB-grounded answers and general knowledge

**Context injection format:**
```
--- Retrieved Knowledge Base Context ---

[Source: /path/to/file.md (chunk 3)]
Retrieved chunk text here...

---

[Source: /path/to/report.pdf (chunk 7)]
Another retrieved chunk...
```

---

### Agent Capabilities and Tools

NV-Agent is a **knowledge-grounded conversational agent** with these capabilities:

| Capability | Implementation | Trigger |
|-----------|---------------|---------|
| **Document Retrieval** | FAISS inner-product search over embedded chunks | Every user query (automatic) |
| **Context Augmentation** | Retrieved chunks + chat history → enriched LLM prompt | Every user query (automatic) |
| **Streaming Generation** | Token-by-token response via WebSocket/SSE with reasoning display | Every chat request |
| **Session Memory** | Full conversation history per session (in-memory + disk persistence) | Across messages in a session |
| **File Ingestion** | 12 format readers → chunk → embed → index | Startup, upload, or API call |
| **Knowledge Base Management** | Status check, reset, re-ingest, text ingest | Sidebar buttons or API calls |

**Agent decision flow** (per query):

```
User Query
    │
    ├──▶ Embed query → FAISS search → top-k chunks found?
    │         │                              │
    │         │                          Yes ▼          No ▼
    │         │                    Augment prompt    "No relevant docs
    │         │                    with context       found in the KB"
    │         │                         │
    │         └─────────────────────────┘
    │                          │
    │                          ▼
    │                   Generate answer
    │                   (with source citations)
    │                          │
    │                          ▼
    └──────────────────  Stream to client
```

---

### Streaming Architecture

```
  Browser                    FastAPI                   Worker Thread
  ───────                    ───────                   ─────────────
     │                          │                          │
     │  WebSocket connect       │                          │
     │─────────────────────────▶│                          │
     │                          │                          │
     │  {"message": "hello"}    │                          │
     │─────────────────────────▶│                          │
     │                          │  run_in_executor()       │
     │                          │─────────────────────────▶│
     │                          │                          │
     │                          │               chat_stream() generator
     │                          │               ├─ yield {"type": "reasoning"}
     │                          │  queue.put("reasoning")  │
     │  {"type":"reasoning"}    │◀─────────────────────────│
     │◀─────────────────────────│                          │
     │                          │                          │
     │                          │               ├─ yield {"type": "text"}
     │                          │  queue.put("token")      │
     │  {"type":"token"}        │◀─────────────────────────│
     │◀─────────────────────────│                          │
     │                          │               ├─ generator ends
     │                          │  queue.put("done")       │
     │  {"type":"done"}         │◀─────────────────────────│
     │◀─────────────────────────│                          │
     │                          │                          │
```

**Key implementation details:**
- `_consume_stream()` runs `chat_stream()` in a worker thread — the generator is fully consumed inside the thread to avoid `StopIteration`-in-async issues
- Events are piped through `asyncio.Queue` to the async FastAPI handler
- `had_error` flag prevents sending both `error` AND `done` events (only one terminal event)
- SSE format: `data: {"token": "..."}\n\n`, `data: {"reasoning": "..."}\n\n`, `data: [DONE]\n\n`
- WebSocket format: `{"type": "token"/"reasoning"/"done"/"error", "content": "..."}`

---

### Session Persistence Model

```
  ┌──────────┐         ┌───────────────┐         ┌──────────────┐
  │  RAGAgent│────────▶│ SessionStore  │────────▶│  data/       │
  │  (memory)│  save() │ (thread-safe) │  write() │  sessions/  │
  │          │◀────────│  mutex lock   │◀──────── │  {uuid}.json│
  └──────────┘  load() └───────────────┘  read()  └──────────────┘
       │                                          Atomic write:
       │  On startup: load_all()                  temp.json.tmp
       │  On chat: save() after each message        → rename()
       │  On delete: remove from memory + disk     (POSIX atomic)
```

**Session data model** (`agent/rag_agent.py`):
- `Session`: id (UUID), title, history (list of Messages), created_at, updated_at
- `Message`: role ("user"/"assistant"/"system"), content, timestamp
- Each session stored as: `data/sessions/{uuid}.json`

**Session lifecycle**:
1. **Create**: `POST /api/sessions` → Session → atomic write to disk
2. **Chat**: Append messages → update timestamp → re-save (atomic)
3. **Startup**: `RAGAgent.__init__()` calls `session_store.load_all()` → recovers all previous sessions
4. **Switch**: If session not in memory, try loading from disk
5. **Delete**: Remove from memory + delete JSON file

---

## File Structure

```
nv-agent/
├── main.py                  # Entry point — startup sequence, init, run server
├── config.py                # All configuration (dataclasses, reads .env)
├── test-agent.py            # Quick CLI smoke test (bypasses RAG pipeline)
├── requirements.txt         # Python dependencies (core + document processing)
├── .env.example             # API key template (DO NOT commit .env)
├── .gitignore               # Excludes .env, sessions, __pycache__, .venv
│
├── data/                    # Knowledge base documents (auto-ingested on startup)
│   └── sessions/            # Persisted conversation sessions (JSON files)
│
├── kb/                      # Knowledge Base Layer
│   ├── __init__.py          # Exports: VectorStoreBase, Chunk, chunk_text, ingest_*
│   ├── chunker.py           # Multi-level text chunking (paragraph→sentence→word)
│   ├── embed.py             # NVIDIA embedding client (singleton, batched, error-handled)
│   ├── ingest.py            # Document ingestion + 12 format readers + DocumentIngestionError
│   ├── vector_store_base.py      # Abstract base class (VectorStoreBase)
│   ├── vector_store.py            # ⚠️ Legacy FAISS store (tests only), superseded by factory pattern
│   ├── vector_store_faiss.py        # FAISS implementation
│   ├── vector_store_qdrant.py       # Qdrant implementation
│   ├── vector_store_chromadb.py     # ChromaDB implementation
│   ├── vector_store_factory.py      # Factory for creating vector stores
│   └── index/               # Saved FAISS index + chunks.json (auto-created)
│
├── agent/                   # Agent Layer
│   ├── __init__.py          # Exports: RAGAgent, Session, Message, exceptions, SessionStore
│   ├── rag_agent.py         # RAG logic: retrieve → augment → generate + session management
│   └── session_store.py     # Thread-safe disk persistence (atomic JSON writes, timestamps)
│
├── frontend/                # React Frontend (dev)
│   ├── src/
│   │   ├── components/      # Chat, Sidebar, Modals, Shared UI
│   │   ├── context/         # Auth, Chat, KB, Toast (React Context + useReducer)
│   │   ├── hooks/           # useAutoResize, useClipboard, useDragDrop, useKeyboardShortcuts
│   │   ├── services/        # api.ts (apiFetch), markdown.ts (marked + DOMPurify)
│   │   ├── types/           # api.ts, chat.ts (TypeScript interfaces)
│   │   ├── utils/           # cn.ts (clsx + tailwind-merge), constants.tsx
│   │   ├── App.tsx          # Root component with provider composition
│   │   ├── main.tsx         # React 18 entry point
│   │   └── index.css        # Tailwind v4 + CSS variables + animations
│   ├── package.json         # React, Vite, Tailwind, marked, DOMPurify, clsx, tailwind-merge
│   ├── vite.config.ts       # Vite config (React, Tailwind, /api proxy to :8000)
│   └── tsconfig.json        # Strict TypeScript config
│
├── chat/                    # Chat API + UI Layer
│   ├── __init__.py          # Exports: create_app, router
│   ├── app.py               # FastAPI factory, middleware, CORS, static file mount
│   ├── auth.py              # API key authentication middleware
│   ├── rate_limit.py        # Per-IP sliding window rate limiter
│   ├── routes.py            # All endpoints: REST, SSE, WebSocket, file upload
│   └── ui/                  # React production build (generated by `npm run build:deploy`)
│       ├── index.html       # Entry point (loads /ui/assets/*.js, /ui/assets/*.css)
│       ├── assets/          # Hashed JS/CSS bundles
│       └── favicon.svg      # NVIDIA hexagon logo
│
├── tests/                   # Pytest test suite
│   ├── conftest.py          # Shared fixtures (mocks, temp dirs, test client)
│   ├── test_chunker.py      # Chunking unit tests
│   ├── test_config.py       # Configuration unit tests
│   ├── test_embed.py        # Embedding client unit tests (mocked API)
│   ├── test_ingest.py       # Ingestion pipeline unit tests
│   ├── test_session_store.py# Session persistence unit tests
│   ├── test_rag_agent.py    # RAG agent unit tests
│   └── test_api.py          # FastAPI endpoint integration tests
│
├── .github/                 # CI/CD
│   └── workflows/
│       └── ci.yml           # GitHub Actions: lint + type check + test + Docker build
│
├── docker-compose.prod.yml # Production compose (GHCR image, Caddy, resource limits)
├── Caddyfile               # Reverse proxy config (auto HTTPS via Let's Encrypt)
├── deploy.sh               # One-command remote deployment script
├── Makefile                 # Build, test, lint, Docker, compose shortcuts
├── requirements-dev.txt     # Dev dependencies (pytest, ruff, mypy, pre-commit, flake8, pylint)
├── .pylintrc               # Pylint configuration
│
└── .claude/                 # Claude Code settings
    └── settings.local.json  # Local permissions
```

---

## How to Run

### One-time Setup (Local)

1. `cp .env.example .env` → set `NVIDIA_NIM_API_KEY` (also accepts `NVIDIA_API_KEY`, `NGC_API_KEY`)
2. `pip install -r requirements.txt`
3. Add documents to `data/` (optional — supports `.txt .md .py .json .yaml .yml .csv .html .xml .rst .pdf .docx`)
4. `python main.py` → http://localhost:8000

### Docker (Recommended)

```bash
# All vector store backends start together; select via NV_AGENT_VECTOR_STORE
docker compose up -d --build

# Qdrant (high-performance Rust vector DB) — set in .env
# NV_AGENT_VECTOR_STORE=qdrant
docker compose up -d --build

# ChromaDB (Python-based vector DB) — set in .env
# NV_AGENT_VECTOR_STORE=chromadb
docker compose up -d --build
```

Set vector store via `NV_AGENT_VECTOR_STORE` in `.env`:
```bash
NV_AGENT_VECTOR_STORE=faiss      # Default
NV_AGENT_VECTOR_STORE=qdrant     # Qdrant service starts with all services
NV_AGENT_VECTOR_STORE=chromadb   # ChromaDB service starts with all services
```

> **Docker volume note**: The `nv-agent-sessions` named volume overrides the `./data:/app/data` bind mount at `/app/data/sessions` — sessions live inside the Docker volume, not on the host filesystem at `./data/sessions/`.

### Quick API Smoke Test

`python test-agent.py` — Standalone CLI test that calls the NVIDIA NIM API directly. Bypasses the entire RAG pipeline (no FAISS, no documents, no web server). Uses `deepseek-ai/deepseek-v4-pro` by default, unlike `main.py` which uses `config.nvidia.chat_model`. Useful for verifying API key validity before launching the server.

### Startup Sequence

```
1. Validate NVIDIA_API_KEY → exit(1) if missing
2. Load/create VectorStore via factory (FAISS / Qdrant / ChromaDB)
3. Auto-ingest all files in data/ (skipping sessions/, .git, .venv, __pycache__, .claude)
4. Initialize SessionStore from data/sessions/
5. Load all persisted sessions into RAGAgent
6. Create FastAPI app (CORS, routes, UI static mount)
7. Start uvicorn on 0.0.0.0:8000
```

---

## API Endpoints

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
| `GET` | `/api/health/detailed` | Full system info: model, KB status, auth, rate limit, active sessions |
| `GET` | `/api/auth/validate` | Validate NVIDIA NIM API key — returns `{valid, model, error}` |

---

## Why NVIDIA NIM?

NV-Agent builds on NVIDIA NIM (NVIDIA Inference Microservices) because it provides a single OpenAI-compatible API endpoint for state-of-the-art open models — Nemotron, Llama, DeepSeek, etc. — without requiring local GPU infrastructure. This makes the project zero-infrastructure and portable: you only need a NVIDIA API key.

Key benefits:
- **Same SDK**: Uses the standard `openai` Python SDK with `base_url` override — no vendor lock-in
- **Model variety**: 100+ models available, switchable with one config change
- **Free tier**: 1,000 credits/month at [build.nvidia.com](https://build.nvidia.com/)
- **Enterprise-grade**: Hosted inference with rate limiting and monitoring

---

## Configuration

All settings in `config.py` (dataclasses). Key env vars:
- `NVIDIA_NIM_API_KEY` / `NVIDIA_API_KEY` / `NGC_API_KEY` — NVIDIA API key
- `MODEL` — chat model override (default: `nvidia/nemotron-3-ultra-550b-a55b`)
- Default embedding model: `baai/bge-m3` (dimension: 1024)

| Setting | Default | What It Controls |
|---------|---------|-----------------|
| `chat_model` | `nvidia/nemotron-3-ultra-550b-a55b` | LLM model ID (any model on NVIDIA NIM) |
| `embedding_model` | `baai/bge-m3` | Embedding model (must match `embedding_dim`) |
| `embedding_dim` | 1024 | Vector dimension — must match embedding output |
| `temperature` | 1.0 | LLM sampling temperature |
| `top_p` | 0.95 | Nucleus sampling threshold |
| `max_tokens` | 16384 | Max response tokens |
| `enable_thinking` | True | Show reasoning/thinking tokens in streaming |
| `reasoning_budget` | 16384 | Token budget for reasoning |
| `chunk_size` | 512 | Characters per chunk |
| `chunk_overlap` | 64 | Overlap characters between chunks |
| `top_k` | 5 | Number of context chunks to retrieve per query |
| `data_dir` | `./data` | Directory for knowledge base documents |
| `port` | 8000 | Server port |
| `cors_origins` | `["*"]` | CORS allowed origins |

---

## Important Guidance for AI Agents

### Security — NEVER Violate These

- **NEVER commit `.env`** or any API keys to source control
- Uploaded filenames are sanitized: path traversal stripped, null bytes removed, special chars replaced with `_`
- Error responses use generic messages (`"Internal error"`) — internal exception details are only logged, never sent to clients
- File uploads capped at 50 MB (`MAX_UPLOAD_SIZE` in routes.py)
- Upload endpoint validates file extension against `SUPPORTED_EXTENSIONS` → 400 if unsupported

### Knowledge Base

- Vector store persists in `kb/index/` (FAISS) or named Docker volumes (Qdrant/ChromaDB) — survives restarts
- **When changing the embedding model**: DELETE `kb/index/` or vectors will mismatch
- `data/sessions/` is excluded from ingestion (along with `.git`, `.venv`, `__pycache__`, `.claude`)
- PDF support: `PyPDF2>=3.0.0` (lazy import — `ImportError` if missing)
- DOCX support: `python-docx>=1.1.0` (lazy import — `ImportError` if missing)
- Missing optional dependencies produce clear error messages, not crashes
- **Vector store backend**: Set via `NV_AGENT_VECTOR_STORE` (faiss/chromadb/qdrant) — uses factory pattern in `kb/vector_store_factory.py`

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
- `SessionStore.save()` is called via `RAGAgent._persist_session()` after every chat message (both sync and streaming)
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

### Streaming

- `RAGAgent.chat_stream()` yields dicts: `{"type": "reasoning"/"text"/"error", "content": str}`
- `_consume_stream()` runs in a worker thread, puts events onto `asyncio.Queue`
- `had_error` flag prevents sending both `error` AND `done` events (only one terminal event)
- SSE: `data: {"token": "..."}` / `data: {"reasoning": "..."}` / `data: [DONE]`
- WebSocket: JSON `{"type": "token"/"reasoning"/"done"/"error", "content": "..."}`

### UI (`frontend/` → built to `chat/ui/`)

- React 18 + TypeScript + Vite + Tailwind v4 — dev server with HMR, production build to `chat/ui/`
- `npm run dev` → Vite on :5173 (proxies `/api` to :8000); `npm run build:deploy` → builds to `chat/ui/` for Docker
- File uploads use `FormData` → `POST /api/kb/upload` (drag-drop + file input)
- On startup: fetches sessions from `GET /api/sessions`, KB status from `GET /api/kb/status`
- On session switch: loads history from `GET /api/sessions/{id}/history`
- `apiFetch()` (in `frontend/src/services/api.ts`) skips `Content-Type` for `FormData`
- State managed via React Context: `AuthContext`, `ChatContext`, `KBContext`, `ToastContext`
- WebSocket (`/api/ws/chat`) with SSE fallback (`/api/chat/stream`) for streaming
- **Session continuity on refresh**: Session ID persisted to `sessionStorage` — page refresh reconnects to the same session and loads history; cleared on new-session or delete-session
- Markdown rendered via `marked` + `DOMPurify` with syntax highlighting + copy buttons
- Accessibility: focus traps in modals, keyboard shortcuts (Ctrl+N, Ctrl+Shift+S, Ctrl+K, Esc), ARIA labels

### Adding a New File Format

1. Add reader function in `kb/ingest.py` (follow `_read_pdf` pattern — lazy import, per-page/per-section error handling)
2. Register in `_READERS` dict
3. Add extension to `SUPPORTED_EXTENSIONS` in `chat/routes.py`
4. Update `<input accept="...">` in `frontend/src/components/sidebar/KBSection.tsx` (file upload)
5. Add extension to `SUPPORTED_EXTENSIONS` in `frontend/src/utils/constants.tsx`
6. Add dependency to `requirements.txt`

### Adding a New LLM Provider

NV-Agent uses the OpenAI-compatible API format via `config.nvidia.base_url`. To switch providers:

1. Update `config.py` — change `base_url`, `chat_model`, `embedding_model`, `embedding_dim`
2. Delete `kb/index/` to reset the vector store (different embedding = different dimensions)
3. Set the appropriate API key env var

**Note**: If changing the embedding model, you also need to reset the vector store for Qdrant/ChromaDB backends. Use `DELETE /api/kb/reset` or the respective backend's CLI.

---

## Code Standards

### Python

| Area | Standard |
|------|----------|
| **Style** | PEP 8, type hints on all function signatures |
| **Docstrings** | Google-style docstrings on all public functions and classes |
| **Error handling** | Use custom exceptions (`RAGAgentError`, `DocumentIngestionError`), never expose internal details in API responses |
| **Logging** | `logging.getLogger(__name__)` per module, prefix with `[module]` (e.g., `[rag]`, `[ingest]`) |
| **Imports** | Stdlib → third-party → local, blank lines between groups |
| **Type hints** | Required on all function signatures — use `Optional`, `list[str]`, etc. |
| **Dataclasses** | Prefer `@dataclass` for structured data (Chunk, Message, Session, configs) |

### TypeScript / React (Frontend)

| Area | Standard |
|------|----------|
| **Style** | 2-space indent, strict TypeScript (`strict: true`) |
| **Frameworks** | React 18 + Vite + Tailwind CSS v4 + TypeScript |
| **State** | React Context + `useReducer` (Auth, Chat, KB, Toast) |
| **Async** | `async/await` for all API calls, SSE + WebSocket streaming |
| **Security** | DOMPurify sanitizes markdown output; `dangerouslySetInnerHTML` only for sanitized HTML |

### Styling (Tailwind CSS v4)

| Area | Standard |
|------|----------|
| **Theme** | CSS custom properties (`@theme`) for colors, fonts, animations, max-widths |
| **Layout** | Flexbox/Grid via Tailwind utilities (`flex`, `grid`, `gap`, `min-w-0`) |
| **Responsive** | Tailwind breakpoints (`max-md:`, `max-[480px]:`) |
| **Dark theme** | CSS variables: `--color-base`, `--color-surface`, `--color-brand`, etc. |
| **Animations** | `@keyframes` in `@theme` + `animate-*` utilities |

### Project Conventions

| Convention | Reason |
|---|---|
| **Build step for production** | React/TypeScript compiles to `chat/ui/` via `npm run build:deploy` — Docker serves static build |
| **Dev server with proxy** | `npm run dev` runs Vite on :5173, proxies `/api` to backend on :8000 |
| **Singleton clients** | OpenAI clients in `embed.py` and `rag_agent.py` are lazily initialized and reused — no connection waste |
| **Thread-safe state** | `SessionStore` uses mutex locks; streaming uses thread+queue to bridge sync SDK → async server |
| **Atomic writes** | Session files and FAISS index use temp-file + `rename()` — crash-safe on POSIX |
| **Skip dirs in ingestion** | `sessions/`, `.git`, `.venv`, `__pycache__`, `.claude` won't pollute the knowledge base |
| **Sanitized filenames** | Uploads strip path traversal, null bytes, and special characters |
| **Generic error responses** | Routes log full exceptions but return `"Internal error"` to clients — no stack traces leaked |
| **Module-prefix logging** | Every logger uses a `[module]` prefix for easy grep: `[rag]`, `[ingest]`, `[embed]`, `[routes]`, `[upload]` |

---

## Testing

NV-Agent has an automated test suite in `tests/` plus CI via GitHub Actions.

### Automated Tests

```bash
# Run all tests
pytest tests/ -v

# Run only unit tests (fast, no external dependencies)
pytest tests/ -v -m "unit"

# Run API integration tests
pytest tests/ -v -m "api"

# Run with coverage
make test-cov
```

**Test files** (`tests/`):
- `conftest.py` — Shared fixtures (mocks, temp dirs, test client)
- `test_chunker.py` — Chunking unit tests
- `test_config.py` — Configuration unit tests
- `test_embed.py` — Embedding client unit tests (mocked API)
- `test_ingest.py` — Ingestion pipeline unit tests
- `test_session_store.py` — Session persistence unit tests
- `test_rag_agent.py` — RAG agent unit tests
- `test_api.py` — FastAPI endpoint integration tests

### CI Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR to `main`:
1. **Lint** — `ruff check .` + `ruff format --check .` (hard failure)
2. **Type check** — `mypy` with `pyproject.toml` config (allowed to fail — `continue-on-error: true`)
3. **Tests** — `pytest tests/ -v -m "unit or api"` with `NVIDIA_API_KEY=nvapi-test-ci-key` (depends on lint passing)
4. **Docker build** — Builds image, verifies container starts and passes health check within 120s (depends on lint + test)

> **Note**: The Makefile `lint` target also runs `flake8` and `pylint` in addition to `ruff`. CI uses only `ruff`; local `make lint` is stricter.

### Manual Validation

For features not covered by automated tests:

1. **API smoke test**: `python test-agent.py` — verifies API key + NIM connectivity
2. **Server test**: `python main.py` → open http://localhost:8000 → chat and verify
3. **Upload test**: Upload a PDF/DOCX via the browser UI → verify chunks appear in KB status
4. **Session test**: Create session → chat → restart server → verify session persists
5. **Refresh test**: Chat → refresh browser page → verify session reconnects with history

---

## Common Pitfalls

| Pitfall | What Happens | How to Avoid |
|---------|-------------|-------------|
| Changing embedding model without resetting index | Vector dimension mismatch → search failures | Always delete `kb/index/` when changing `embedding_model` or `embedding_dim`; use `DELETE /api/kb/reset` for Qdrant/ChromaDB |
| Creating new OpenAI client per call | Connection churn, slow performance | Use singleton `_get_client()` pattern |
| Running `chat_stream()` directly in async context | `StopIteration` bug in async generators | Always use `_consume_stream()` in worker thread + `asyncio.Queue` |
| Committing `.env` | API key leaked to source control | `.env` is in `.gitignore` — NEVER override this |
| Forgetting to persist sessions | Session saved in memory but not on disk → lost on restart | `RAGAgent._persist_session()` wraps `SessionStore.save()` — call after every state-changing operation |
| Setting `Content-Type` for FormData uploads | Browser can't set multipart boundary → server rejects | `apiFetch()` skips Content-Type for FormData — don't add it |
| Using `embed_query()` failure as fatal | Single query failure crashes the whole chat | `embed_query()` returns `[]` on failure → search returns empty results gracefully |
| Switching vector store backends without re-ingesting | Empty KB or dimension mismatch | Re-ingest documents after changing `NV_AGENT_VECTOR_STORE` |
