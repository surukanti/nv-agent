# ⚡ NV-Agent

**A production-ready, self-hosted RAG AI Agent that grounds every answer in your own documents — with source citations, real-time streaming, and a full browser UI.**

> Most AI chatbots give you generic answers. NV-Agent is an **AI agent** that retrieves relevant context from your knowledge base before generating a response — so every answer is grounded, cited, and honest about what it doesn't know.

---

## 📖 Table of Contents

- [The Problem It Solves](#-the-problem-it-solves)
- [What is NV-Agent?](#-what-is-nv-agent)
- [Why NVIDIA NIM?](#-why-nvidia-nim)
- [Architecture](#-architecture)
  - [High-Level System Architecture](#high-level-system-architecture)
  - [RAG Pipeline Flow](#rag-pipeline-flow)
  - [Data Flow Diagram](#data-flow-diagram)
  - [Streaming Architecture](#streaming-architecture)
  - [Session Persistence](#session-persistence)
- [Key Capabilities](#-key-capabilities)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
  - [Prerequisites](#prerequisites)
  - [Install & Run](#install--run)
  - [Quick API Test (No Server)](#quick-api-test-no-server)
- [How to Use](#-how-to-use)
  - [Adding Documents](#adding-documents)
  - [Chatting with Your Knowledge Base](#chatting-with-your-knowledge-base)
  - [Managing Sessions](#managing-sessions)
  - [Choosing Models](#choosing-models)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
  - [Chat](#chat)
  - [Sessions](#sessions)
  - [Knowledge Base](#knowledge-base)
  - [Health & Auth](#health--auth)
- [Docker](#-docker)
- [Design Decisions](#-design-decisions)
- [Security](#-security)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 The Problem It Solves

| Problem | Why It Matters | How NV-Agent Solves It |
|---------|---------------|----------------------|
| **Generic AI = generic answers** | Off-the-shelf chatbots hallucinate about your domain because they don't know your data | RAG pipeline retrieves your documents before answering — every response is grounded in your knowledge base |
| **RAG is hard to set up** | Most RAG tutorials leave you with a notebook, not a production-ready app | One command starts a complete system: vector store, embeddings, LLM, session persistence, and browser UI |
| **Knowledge trapped in files** | PDFs, DOCX, and text docs sit in folders — unsearchable, unqueryable | Drop 12+ file formats into `data/` and they're instantly indexed and queryable |
| **Conversations are lost** | Most demo chatbots forget everything when you refresh | Every session is persisted to disk with atomic writes — survives restarts and crashes |
| **No infrastructure for AI** | Running LLMs locally requires GPUs, drivers, and model management | NVIDIA NIM gives you hosted state-of-the-art models via a single API key — zero local GPU needed |

---

## 🤖 What is NV-Agent?

NV-Agent is a **complete, self-contained AI agent system** — not a library, not a framework, not a notebook.

It is a **RAG (Retrieval-Augmented Generation) agent** that:

1. **Retrieves** relevant document chunks from a FAISS vector knowledge base
2. **Augments** the LLM prompt with retrieved context and source citations
3. **Generates** grounded answers via NVIDIA NIM LLMs with real-time streaming

You run one command, open a browser, and chat over your own documents:

```bash
python main.py  # → http://localhost:8000
```

The agent follows the **ReAct-inspired pattern**: given a user query, it reasons about what context to retrieve, fetches the most relevant chunks from the knowledge base, then generates a cited answer — explicitly stating when the KB doesn't contain the answer.

---

## 🟢 Why NVIDIA NIM?

NVIDIA NIM (NVIDIA Inference Microservices) provides hosted, state-of-the-art open models via a single OpenAI-compatible API endpoint. By building on NVIDIA NIM, NV-Agent gives you:

| Benefit | Details |
|---------|---------|
| **Zero infrastructure** | No local GPUs, no model downloads, no driver headaches — just an API key |
| **Best-in-class models** | Nemotron, Llama, DeepSeek, and 100+ models available instantly |
| **OpenAI-compatible API** | Same `openai` Python SDK you already know — just a different `base_url` |
| **Enterprise-grade** | NVIDIA-hosted inference with reliability, rate limiting, and monitoring |
| **Free tier** | 1,000 credits/month at [build.nvidia.com](https://build.nvidia.com/) |

---

## 🏗️ Architecture

### High-Level System Architecture

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
│  │          │    │              │    │ Generate  │    │          │ │
│  └──────────┘    └──────────────┘    └───────────┘    └──────────┘ │
│       ▲               ▲                   ▲               ▲       │
│       │               │                   │               │       │
│       │          ┌────┴─────┐        ┌────┴─────┐   ┌────┴────┐  │
│       │          │  Session │        │  NVIDIA   │   │ Vector  │  │
│       │          │  Store   │        │  NIM API  │   │ Store   │  │
│       │          │  (Disk)  │        │ (Cloud)   │   │(FAISS/  │  │
│       │          └──────────┘        └───────────┘   │Qdrant/  │  │
│       │                                               │ChromaDB)│  │
│  ┌────┴──────────────────────────────────────────────────────────┐  │
│  │                     config.py (.env)                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Four-layer design** — each layer is a Python package with clear `__init__.py` and explicit `__all__` exports:

| Layer | Package | Responsibility |
|-------|---------|---------------|
| **Presentation** | `chat/ui/` | Browser UI — vanilla HTML/CSS/JS, WebSocket + SSE + REST |
| **API** | `chat/` | FastAPI routes, CORS, request/response models, streaming |
| **Agent** | `agent/` | RAG logic (retrieve → augment → generate), session management |
| **Knowledge Base** | `kb/` | Document ingestion, chunking, embedding, pluggable vector store (FAISS/Qdrant/ChromaDB) |

---

### RAG Pipeline Flow

This is the core of the AI agent — how a user question becomes a grounded, cited answer:

```
  User asks: "What does our deployment process look like?"
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  1. EMBED QUERY                                              │
│     User question ──▶ bge-m3 embedding ──▶ 1024-dim vector   │
│     (NVIDIA NIM embedding API)                               │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│  2. RETRIEVE                                                 │
│     Query vector ──▶ Vector store search (FAISS/Qdrant/     │
│     ChromaDB) ──▶ top-5 most relevant chunks from KB         │
│     (Choice of backend via NV_AGENT_VECTOR_STORE)            │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│  3. AUGMENT                                                  │
│     System prompt + retrieved chunks (with source citations) │
│     + conversation history + current user message            │
│     → one rich message list for the LLM                      │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│  4. GENERATE                                                 │
│     NVIDIA NIM LLM (Nemotron / Llama / DeepSeek / etc.)     │
│     → Streams answer token-by-token via WebSocket/SSE        │
│     → Reasoning/thinking tokens shown in collapsible block    │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
  Agent responds with citations:
  "Based on [Source: deploy.md (chunk 2)], the deployment
   process involves..." or honestly: "The knowledge base
   does not contain information about that."
```

Every answer cites its source file and chunk number. If the knowledge base doesn't contain the answer, the agent says so honestly — no hallucination.

---

### Data Flow Diagram

```
                        ┌─────────────┐
                        │  Documents   │
                        │  (12 formats)│
                        └──────┬──────┘
                               │
                        ┌──────▼──────┐
                        │  Ingestion   │
                        │  Pipeline    │
                        └──────┬──────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │             │
          ┌──────▼──────┐ ┌───▼────┐ ┌──────▼──────┐
          │   Chunker   │ │ Embed  │ │  Vector     │
          │  (Boundary  │ │ Client │ │  Store      │
          │   Aware)    │ │(Batch) │ │(FAISS/Qdrant/│
          └──────┬──────┘ └───┬────┘ │  ChromaDB)  │
                 │            │      └──────┬──────┘
                 └────────────┼─────────────┘
                              │
                      ┌───────▼───────┐
                      │  Knowledge    │
                      │  Base Index   │
                      │ (kb/index/ or │
                      │  Docker vol)  │
                      └───────┬───────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
       ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
       │   REST API  │ │  SSE Stream│ │  WebSocket  │
       │  /api/chat  │ │  /api/chat │ │  /api/ws/   │
       │             │ │  /stream   │ │    chat      │
       └──────┬──────┘ └─────┬──────┘ └──────┬──────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                       ┌──────▼──────┐
                       │   Browser   │
                       │  Chat UI    │
                       └─────────────┘
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

**Why thread+queue?** The OpenAI SDK is synchronous. We run `chat_stream()` in a worker thread, pipe events through `asyncio.Queue` to the async FastAPI handler — avoiding the `StopIteration`-in-async bug.

---

### Session Persistence

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

Conversations survive server restarts. Every message is timestamped and saved to disk atomically.

---

## ✨ Key Capabilities

| Capability | How It Works |
|-----------|-------------|
| **Grounded answers** | Every response is backed by vector search over your documents, with source citations |
| **Real-time streaming** | WebSocket + SSE streaming — see the answer (and the agent's reasoning) token by token |
| **Thinking/reasoning display** | Agent's reasoning tokens shown in a collapsible block — see *how* it thinks |
| **Multi-format ingestion** | Drop in `.pdf`, `.docx`, `.txt`, `.md`, `.py`, `.json`, `.yaml`, `.yml`, `.csv`, `.html`, `.xml`, `.rst` — auto-indexed on startup |
| **Smart chunking** | Paragraph-aware → sentence-aware → word-boundary splitting with overlap — no cutting mid-sentence |
| **Session persistence** | Conversations survive server restarts. Every message is timestamped and saved to disk atomically |
| **Browser file upload** | Upload PDFs and Word docs directly from the UI — no CLI needed |
| **Dark-themed chat UI** | Responsive single-page interface — sidebar, session management, KB status panel |
| **Multi-model support** | Any model on NVIDIA NIM (Nemotron, Llama, DeepSeek, etc.) — just change one config value |
| **Production patterns** | Custom exceptions, proper HTTP status codes, thread-safe state, filename sanitization, upload size limits |
| **API key auth** | Optional authentication middleware — protect your instance with `NV_AGENT_AUTH_KEY` |
| **Rate limiting** | Per-IP sliding window rate limiter — configurable via `NV_AGENT_RATE_LIMIT` |
| **Pluggable vector stores** | Choose **FAISS** (default, zero-infra), **ChromaDB**, or **Qdrant** (high-performance Rust DB) |

---

## 📁 Project Structure

```
nv-agent/
│
├── main.py                  # 🚀 Entry point — startup sequence, init, run server
├── config.py                # ⚙️ Central configuration (dataclasses, reads .env)
├── test-agent.py            # 🧪 Quick CLI smoke test (bypasses RAG pipeline)
├── requirements.txt         # 📦 Python dependencies
├── pyproject.toml           # 🔧 Ruff, mypy, pytest config
├── .env.example             # 🔑 API key template (copy to .env)
├── .gitignore               # 🛡️ Excludes .env, sessions, __pycache__, .venv
├── .pre-commit-config.yaml  # 🪝 Pre-commit hooks (ruff, mypy, checks)
├── Dockerfile               # 🐳 Multi-stage Docker build (Python 3.12-slim)
├── docker-compose.yml       # 🐳 Compose for easy deployment with volumes
├── LICENSE                  # 📄 MIT License
├── README.md                # 📖 You are here
├── AGENTS.md                # 🤖 AI agent guidelines and architecture
├── CLAUDE.md                # 🤖 Claude Code context and conventions
│
├── data/                    # 📂 Your documents — auto-indexed on startup
│   ├── sample.md            #    Example knowledge base doc
│   └── sessions/            #    Persisted conversation JSONs (auto-created)
│
├── kb/                      # 🧠 Knowledge Base Layer
│   ├── __init__.py          #    Exports: VectorStore, Chunk, ingest_*, chunk_text
│   ├── chunker.py           #    Multi-level text splitting (paragraph→sentence→word)
│   ├── embed.py             #    NVIDIA embedding client (singleton, batched, error-handled)
│   ├── ingest.py            #    File ingestion + readers (PDF, DOCX, 10 text formats)
│   ├── vector_store.py              #    Abstract base class (VectorStoreBase)
│   ├── vector_store_faiss.py        #    FAISS vector store implementation
│   ├── vector_store_qdrant.py       #    Qdrant vector store implementation
│   ├── vector_store_chromadb.py     #    ChromaDB vector store implementation
│   ├── vector_store_factory.py      #    Factory for creating vector stores
│   └── index/               #    Saved FAISS index + chunks.json (auto-created)
│
├── agent/                   # 🤖 Agent Layer
│   ├── __init__.py          #    Exports: RAGAgent, Session, Message, exceptions, SessionStore
│   ├── rag_agent.py         #    RAG logic: retrieve → augment → generate + session mgmt
│   └── session_store.py     #    Thread-safe disk persistence (atomic JSON writes)
│
├── chat/                    # 🌐 Chat API + UI Layer
│   ├── __init__.py          #    Exports: create_app, router
│   ├── app.py               #    FastAPI factory, middleware, CORS, static file mount
│   ├── auth.py              #    API key authentication middleware
│   ├── rate_limit.py        #    Per-IP sliding window rate limiter
│   ├── routes.py            #    All endpoints: REST, SSE, WebSocket, file upload, health, auth
│   └── ui/
│       ├── index.html       #    Chat page (sidebar, messages, upload, KB panel)
│       ├── style.css        #    Dark theme with NVIDIA green accent
│       ├── app.js           #    Client logic (WS, SSE, session mgmt, file upload)
│       └── marked.min.js    #    Markdown renderer
│
├── tests/                   # 🧪 Pytest test suite
│   ├── conftest.py          #    Shared fixtures (mocks, temp dirs, test client)
│   ├── test_chunker.py      #    Chunking unit tests
│   ├── test_config.py       #    Configuration unit tests
│   ├── test_embed.py        #    Embedding client unit tests (mocked API)
│   ├── test_ingest.py       #    Ingestion pipeline unit tests
│   ├── test_session_store.py#    Session persistence unit tests
│   ├── test_rag_agent.py    #    RAG agent unit tests
│   └── test_api.py          #    FastAPI endpoint integration tests
│
├── .github/                 # 🔄 CI/CD
│   └── workflows/
│       └── ci.yml           #    GitHub Actions: lint + type check + test + Docker build
│
└── .claude/                 # 🔧 Claude Code settings
    └── settings.local.json  #    Local permissions
```

### Design Decisions

| Decision | Why |
|----------|-----|
| **No build step** | UI is vanilla HTML/CSS/JS — zero toolchain, just open in a browser |
| **Pluggable vector stores** | Factory pattern with FAISS (default, zero-infra), Qdrant (high-perf Rust), ChromaDB (Python) |
| **Singleton OpenAI client** | Both `embed.py` and `rag_agent.py` lazily create one client — no connection churn |
| **Thread+Queue for streaming** | OpenAI SDK is synchronous — worker thread + `asyncio.Queue` bridges sync→async |
| **Atomic file writes** | Sessions and index use temp-file + `rename()` (POSIX atomic) — no corruption on crash |
| **Skip dirs in ingestion** | `data/sessions/`, `.git`, `.venv` are excluded — session JSONs don't pollute the KB |
| **Custom exception hierarchy** | `RAGAgentError → SessionNotFoundError / LLMError` — routes catch specific types, return proper HTTP codes |
| **Filename sanitization** | Upload endpoint strips path traversal (`../../../etc/passwd` → `_.._.._.._etc_passwd`) |
| **OpenAI-compatible API** | Using NVIDIA NIM's OpenAI-compatible endpoint means we use the standard `openai` SDK — no vendor lock-in |

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.11+**
- **NVIDIA NIM API key** — create a free account at [build.nvidia.com](https://build.nvidia.com/)

NV-Agent accepts any of these environment variables for your API key:
- `NVIDIA_NIM_API_KEY` (preferred)
- `NVIDIA_API_KEY`
- `NGC_API_KEY`

### Install & Run

```bash
# 1. Clone and enter
git clone <your-repo-url> nv-agent && cd nv-agent

# 2. Create virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure your API key (uses NVIDIA_NIM_API_KEY by default)
cp .env.example .env
# Edit .env — set NVIDIA_NIM_API_KEY="nvapi-your-key-here"
# Or export any of: NVIDIA_NIM_API_KEY, NVIDIA_API_KEY, NGC_API_KEY

# 5. Add your documents (optional)
cp ~/my-docs/*.pdf ~/my-docs/*.docx data/

# 6. Start the server
python main.py
```

Then open **http://localhost:8000** in your browser and start chatting.

- 🖥️ **Chat UI**: http://localhost:8000
- 📖 **Interactive API Docs**: http://localhost:8000/docs

### Quick API Test (No Server)

To verify your API key before launching the full server:

```bash
python test-agent.py
```

This runs a standalone CLI smoke test that calls the NVIDIA NIM API directly — no FAISS index, no document ingestion, no web server. It uses a hardcoded model (`deepseek-ai/deepseek-v4-pro`) for quick testing. If this works, your key is valid and the full server will too.

---

## 📖 How to Use

### Adding Documents

NV-Agent supports **three ways** to add documents to your knowledge base:

| Method | How | Best For |
|--------|-----|----------|
| **File drop** | Copy files into `data/` directory before startup | Bulk loading, initial setup |
| **Browser upload** | Click "Upload File" in the sidebar | Quick additions from the UI |
| **API ingest** | `POST /api/kb/ingest` with raw text, or `POST /api/kb/ingest-file` by path | Automation, scripts, CI/CD |

**Supported formats**: `.pdf`, `.docx`, `.txt`, `.md`, `.py`, `.json`, `.yaml`, `.yml`, `.csv`, `.html`, `.xml`, `.rst`

> **Tip**: After adding files to `data/`, hit **"Refresh Status"** in the sidebar, or call `POST /api/kb/ingest-dir` to re-index without restarting the server.

### Chatting with Your Knowledge Base

1. Open **http://localhost:8000**
2. Click **"+ New Chat"** in the sidebar
3. Ask any question about your documents
4. The agent will:
   - Search the knowledge base for relevant chunks
   - Show its **reasoning** in a collapsible "💭 Thinking…" block
   - Stream the **answer** token-by-token with source citations
   - Honestly say when the knowledge base doesn't contain the answer

**Example questions**:
- "What does the deployment process look like?" (if you have deployment docs)
- "Summarize the key points from the quarterly report" (if you uploaded a PDF)
- "What are the API conventions used in this project?" (if you added code files)

### Managing Sessions

- **Create**: Click "+ New Chat" or `POST /api/sessions`
- **Switch**: Click a session in the sidebar — full history loads from disk
- **Delete**: Click the × button on a session — removes from memory and disk
- **Persist**: Automatic — every message is saved to `data/sessions/{uuid}.json`
- **Survive restarts**: Sessions are loaded from disk on server startup

### Choosing Models

NV-Agent works with **any model on NVIDIA NIM**. Change the chat model in `config.py`:

```python
# In config.py, NVIDIAConfig class:
chat_model: str = "nvidia/nemotron-3-ultra-550b-a55b"  # Default
# chat_model: str = "meta/llama-3.1-8b-instruct"       # Fast, cheap
# chat_model: str = "deepseek-ai/deepseek-v4-pro"      # Strong reasoning
```

Or set the `MODEL` environment variable to override at runtime.

> ⚠️ **If you change the embedding model**: You MUST delete `kb/index/` to reset the vector index — mismatched dimensions will cause search failures.

---

## ⚙️ Configuration

All settings are in `config.py` with sensible defaults. Override via environment variables.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NVIDIA_NIM_API_KEY` | ✅ | — | Your NVIDIA NIM API key (also accepts `NVIDIA_API_KEY`, `NGC_API_KEY`) |
| `MODEL` | ❌ | `nvidia/nemotron-3-ultra-550b-a55b` | Override the chat model |
| `NV_AGENT_AUTH_KEY` | ❌ | — | API key for auth middleware (when set, all `/api/*` require `X-API-Key`) |
| `NV_AGENT_RATE_LIMIT` | ❌ | `60/minute` | Rate limit per IP (format: `N/unit`, e.g., `10/second`, `100/hour`) |
| `NV_AGENT_VECTOR_STORE` | ❌ | `faiss` | Vector store backend: `faiss`, `chromadb`, or `qdrant` |

### Vector Store Configuration

| Backend | Required Env Vars | Optional Env Vars | Notes |
|---------|-------------------|-------------------|-------|
| **FAISS** (default) | — | — | Zero-infrastructure, index on disk, no external service |
| **ChromaDB** | `NV_AGENT_VECTOR_STORE=chromadb` | `NV_AGENT_CHROMADB_COLLECTION`, `NV_AGENT_CHROMADB_PERSIST_DIR` | Open-source embedding DB, local file-based |
| **Qdrant** | `NV_AGENT_VECTOR_STORE=qdrant` | `NV_AGENT_QDRANT_PATH` (local mode), or `NV_AGENT_QDRANT_HOST`, `NV_AGENT_QDRANT_PORT`, `NV_AGENT_QDRANT_API_KEY` (server mode) | High-performance Rust vector DB |

**Install optional dependencies:**
```bash
# ChromaDB
pip install chromadb

# Qdrant
pip install qdrant-client
```

### Config Defaults (`config.py`)

| Setting | Default | What It Controls |
|---------|---------|-----------------|
| `chat_model` | `nvidia/nemotron-3-ultra-550b-a55b` | LLM model ID (any model on NVIDIA NIM) |
| `embedding_model` | `baai/bge-m3` | Embedding model (must match `embedding_dim`) |
| `embedding_dim` | 1024 | Vector dimension — must match embedding model output |
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

**WebSocket messages**:
```json
→ {"message": "hello"}
← {"type": "token", "content": "answer "}
← {"type": "reasoning", "content": "thinking..."}
← {"type": "done", "full": "complete answer"}
← {"type": "error", "content": "error message"}
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
| `POST` | `/api/kb/ingest` | Ingest raw text (JSON body: `{text, source}`) |
| `POST` | `/api/kb/ingest-dir` | Re-scan `data/` and index all files |
| `POST` | `/api/kb/ingest-file` | Ingest a file by server path |
| `POST` | `/api/kb/upload` | **Upload file** (multipart/form-data, 12 formats supported) |
| `DELETE` | `/api/kb/reset` | Clear the entire knowledge base |

### Health & Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Returns `{"status": "ok", "kb_chunks": N}` |
| `GET` | `/api/health/detailed` | Full system info: model, KB status, auth, rate limit, active sessions |
| `GET` | `/api/auth/validate` | Validate your NVIDIA NIM API key — returns `{valid, model, error}` |

---

## 🐳 Docker

Run NV-Agent in a container — no Python installation needed on the host.

### Option 1: FAISS (Default) — Zero External Dependencies
```bash
# Build and run with docker compose
cp .env.example .env  # Set your NVIDIA API key
docker compose up -d --build

# Or use the Makefile (also passes --build)
make compose-up

# Or build manually
docker build -t nv-agent .
docker run -p 8000:8000 --env-file .env -v $(pwd)/data:/app/data nv-agent
```

> **Note:** `--build` ensures the Docker image is rebuilt with your latest code and UI changes. The Dockerfile uses separate `COPY` layers for Python code and UI assets, so UI-only edits don't invalidate the Python layer cache.

**Docker Compose** persists your documents and FAISS index in named volumes, so they survive container restarts.

### Option 2: With Qdrant Vector Database (Recommended for Production)
```bash
cp .env.example .env
# Add to .env:
# NV_AGENT_VECTOR_STORE=qdrant
# NV_AGENT_QDRANT_HOST=qdrant
# NV_AGENT_QDRANT_PORT=6333
docker compose up -d --build
```

This starts both NV-Agent and Qdrant containers, with Qdrant persisting data in a named volume.

### Option 3: With ChromaDB
```bash
# Add to .env:
# NV_AGENT_VECTOR_STORE=chromadb
docker compose up -d --build
```

### Custom Configuration
```bash
# With auth key and custom rate limit
docker run -p 8000:8000 \
  --env-file .env \
  -e NV_AGENT_AUTH_KEY=my-secret-key \
  -e NV_AGENT_RATE_LIMIT="30/minute" \
  nv-agent
```

### Vector Store Comparison for Docker

| Backend | Pros | Cons | Best For |
|---------|------|------|----------|
| **FAISS** | Zero config, fast, no extra container | Single-process only, no scaling | Dev, single-user, small KB |
| **ChromaDB** | Easy local setup, good features | Python-based, slower at scale | Medium KB, local dev with persistence |
| **Qdrant** | Rust performance, filtering, distributed, server mode | Extra container, more resources | Production, large KB, multi-user, filtering |

---

## 🔒 Security

| Measure | Details |
|---------|---------|
| **No API key in source control** | `.env` is in `.gitignore` — never commit it |
| **Optional API key auth** | Set `NV_AGENT_AUTH_KEY` to require `X-API-Key` header on all `/api/*` routes |
| **Per-IP rate limiting** | Default: 60 req/min per IP. Override with `NV_AGENT_RATE_LIMIT` (e.g., `"10/second"`) |
| **Filename sanitization** | Path traversal stripped, null bytes removed, special chars replaced with `_` |
| **Upload size limit** | 50 MB max (`MAX_UPLOAD_SIZE` in routes.py) |
| **Extension validation** | Only `SUPPORTED_EXTENSIONS` allowed → 400 if unsupported |
| **Generic error responses** | Internal details logged server-side, clients get `"Internal error"` |
| **Custom exception hierarchy** | Specific HTTP codes: 401 (auth), 429 (rate limit), 404, 502, 500 |

---

## 🤝 Contributing

We welcome contributions! See [AGENTS.md](AGENTS.md) for the full architecture guidelines and coding standards.

### Development Setup

```bash
git clone <your-repo-url> && cd nv-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # Add your NVIDIA API key
```

### Contribution Workflow

1. **Fork** the repo and create a feature branch from `main`
2. **Make your changes** — follow the code style in [AGENTS.md](AGENTS.md)
3. **Test manually** — run `python main.py` and verify your change works end-to-end
4. **Commit clearly** — use descriptive messages (`Add X support`, `Fix Y bug`)
5. **Open a Pull Request** — describe what you changed and why

### Adding a New File Format

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

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
