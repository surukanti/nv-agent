"""FastAPI application factory for the NV-Agent chat system."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from chat.routes import router
from config import config

# UI directory containing index.html, style.css, app.js, marked.min.js
_UI_DIR = Path(__file__).parent / "ui"


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="NV-Agent",
        description="RAG agent serving a custom knowledge base via NVIDIA LLMs",
        version="1.0.0",
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.server.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API routes
    app.include_router(router, prefix="/api")

    # Serve UI static files (CSS, JS, etc.) at /ui/*
    app.mount("/ui", StaticFiles(directory=str(_UI_DIR)), name="ui-static")

    # Serve the chat UI at the root path
    @app.get("/")
    async def serve_ui():
        return FileResponse(str(_UI_DIR / "index.html"))

    return app
