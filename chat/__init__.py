"""Chat layer — FastAPI REST + WebSocket endpoints for agent chat."""

from chat.app import create_app
from chat.routes import router

__all__ = ["create_app", "router"]
