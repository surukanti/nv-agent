"""FastAPI application factory for the NV-Agent chat system."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from chat.auth import APIKeyAuthMiddleware, get_auth_key
from chat.rate_limit import RateLimitMiddleware, parse_rate_limit
from chat.routes import router
from config import config

# UI directory containing React build output (index.html, assets/)
_UI_DIR = Path(__file__).parent / "ui"


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="NV-Agent",
        description="RAG agent serving a custom knowledge base via NVIDIA LLMs",
        version="1.0.0",
    )

    # ── Middleware (order matters: outermost first) ──────────────

    # 1. Rate limiting (protects all /api/* routes, per-IP sliding window)
    rate_limit_str = os.environ.get("NV_AGENT_RATE_LIMIT", "60/minute")
    max_requests, window_seconds = parse_rate_limit(rate_limit_str)
    app.add_middleware(
        RateLimitMiddleware, max_requests=max_requests, window_seconds=window_seconds
    )

    # 2. API key auth (only active when NV_AGENT_AUTH_KEY is set)
    auth_key = get_auth_key()
    if auth_key:
        app.add_middleware(APIKeyAuthMiddleware, auth_key=auth_key)

    # 3. CORS (always last in middleware stack, first to process request)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.server.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ──────────────────────────────────────────────────

    # API routes
    app.include_router(router, prefix="/api")

    # Serve UI static files (CSS, JS, etc.) at /ui/*  (after API routes so /api takes priority)
    app.mount("/ui", StaticFiles(directory=str(_UI_DIR)), name="ui-static")

    # Serve the chat UI at the root path
    @app.get("/")
    async def serve_ui() -> FileResponse:
        return FileResponse(str(_UI_DIR / "index.html"))

    return app
