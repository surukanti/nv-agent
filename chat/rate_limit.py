"""Rate limiting middleware — in-memory sliding window rate limiter.

Limits per-IP request rates to protect against abuse.
Configured via NV_AGENT_RATE_LIMIT env var (default: "60/minute").
"""

import time
from collections import defaultdict

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding window rate limiter per client IP.

    Default: 60 requests per minute per IP.
    Override with NV_AGENT_RATE_LIMIT env var (format: "N/minute" or "N/second").
    """

    def __init__(self, app: ASGIApp, max_requests: int = 60, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # IP → list of request timestamps
        self._requests: dict[str, list[float]] = defaultdict(list)

    def _cleanup(self, ip: str, now: float) -> None:
        """Remove timestamps outside the current window."""
        cutoff = now - self.window_seconds
        self._requests[ip] = [t for t in self._requests[ip] if t > cutoff]

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP, considering X-Forwarded-For for reverse proxies."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Only rate-limit API routes
        if not request.url.path.startswith("/api"):
            return await call_next(request)

        now = time.time()
        ip = self._get_client_ip(request)

        self._cleanup(ip, now)

        if len(self._requests[ip]) >= self.max_requests:
            return Response(
                content='{"detail":"Rate limit exceeded. Try again later."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(self.window_seconds)},
            )

        self._requests[ip].append(now)
        return await call_next(request)


def parse_rate_limit(rate_str: str) -> tuple[int, int]:
    """Parse a rate limit string like '60/minute' or '10/second'.

    Returns (max_requests, window_seconds).
    """
    parts = rate_str.strip().split("/")
    if len(parts) != 2:
        return 60, 60  # Safe default

    try:
        count = int(parts[0])
    except ValueError:
        return 60, 60

    unit = parts[1].lower().rstrip("s")  # "minute" or "minutes" → "minute"
    multiplier = {"second": 1, "minute": 60, "hour": 3600}.get(unit, 60)

    return count, multiplier
