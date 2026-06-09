# NV-Agent Knowledge Base — Sample Document

## About NV-Agent
NV-Agent is a Retrieval-Augmented Generation (RAG) system that combines a custom
knowledge base with NVIDIA's large language models. It allows users to upload
documents, automatically chunk and embed them, and then ask questions that are
answered using the retrieved context.

## Architecture
The system has three layers:
1. **Knowledge Base Layer** — Document ingestion, chunking, embedding via NVIDIA's
   embedding API, and FAISS-based vector storage with cosine similarity retrieval.
2. **Agent Layer** — A RAG agent that retrieves relevant chunks from the knowledge
   base and feeds them as context to the LLM for grounded answer generation.
3. **Chat Layer** — A FastAPI server exposing REST, SSE streaming, and WebSocket
   endpoints for interactive chat sessions.

## Supported File Types
The ingester supports plain text files including: .txt, .md, .py, .json, .yaml,
.yml, .csv, .html, .xml, and .rst formats. Files are read as UTF-8 text.

## API Endpoints
- `POST /api/sessions` — Create a new chat session
- `POST /api/chat` — Send a message and get a response
- `POST /api/chat/stream` — Send a message and get a streamed (SSE) response
- `WS /api/ws/chat` — WebSocket chat with real-time token streaming
- `POST /api/kb/ingest` — Add text directly to the knowledge base
- `POST /api/kb/ingest-dir` — Re-ingest all files from the data directory
- `GET /api/kb/status` — Check knowledge base status
- `DELETE /api/kb/reset` — Clear the entire knowledge base
- `GET /api/health` — Health check

## Configuration
All settings live in `config.py` and can be customized via environment variables:
- `NVIDIA_API_KEY` or `NVIDIA_NIM_API_KEY` — Required. Your NVIDIA API key.
- Default chat model: `deepseek-ai/deepseek-v4-pro`
- Default embedding model: `baai/bge-m3` (1024 dimensions)
