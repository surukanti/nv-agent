"""Authentication middleware — optional API key gate for NV-Agent endpoints.

When NV_AGENT_AUTH_KEY is set (in .env or environment), all /api/* endpoints
require the client to send the same key via X-API-Key header or ?api_key query param.
When not set, auth is disabled (open access, suitable for local dev).
"""

import os

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class APIKeyAuthMiddleware(BaseHTTPMiddleware):
    """Middleware that validates an API key on /api/* routes.

    Auth is ACTIVE when NV_AGENT_AUTH_KEY is set in the environment.
    Auth is DISABLED (open access) when NV_AGENT_AUTH_KEY is not set.

    When active, clients must send the key via:
      - Header: X-API-Key: <your-key>
      - Query param: ?api_key=<your-key>
    """

    def __init__(self, app, auth_key: str | None = None):
        super().__init__(app)
        self.auth_key = auth_key

    async def dispatch(self, request: Request, call_next):
        # Skip auth for non-API routes (UI, static files, OpenAPI docs)
        path = request.url.path
        if not path.startswith("/api"):
            return await call_next(request)

        # Skip health endpoint — it should always be accessible
        if path == "/api/health":
            return await call_next(request)

        # If no auth key configured, allow all access
        if not self.auth_key:
            return await call_next(request)

        # Check API key from header or query parameter
        provided_key = request.headers.get("X-API-Key")
        if not provided_key:
            provided_key = request.query_params.get("api_key")

        if provided_key != self.auth_key:
            return Response(
                content='{"detail":"Invalid or missing API key. Set X-API-Key header or ?api_key= query param."}',
                status_code=401,
                media_type="application/json",
            )

        return await call_next(request)


def get_auth_key() -> str | None:
    """Resolve the auth key from environment variables.

    Checks NV_AGENT_AUTH_KEY first, then AUTH_KEY.
    Returns None if neither is set (auth disabled).
    """
    for var in ("NV_AGENT_AUTH_KEY", "AUTH_KEY"):
        val = os.environ.get(var, "")
        if val:
            return val
    return None
