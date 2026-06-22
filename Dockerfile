# ── NV-Agent Dockerfile ──────────────────────────────────────
# Multi-stage build for a minimal production image.
# Usage:
#   docker build -t nv-agent .
#   docker run -p 8000:8000 --env-file .env -v $(pwd)/data:/app/data nv-agent

# ── Stage 1: Builder ────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install dependencies into a clean prefix
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ────────────────────────────────────────
FROM python:3.12-slim

LABEL org.opencontainers.image.title="NV-Agent"
LABEL org.opencontainers.image.description="Self-hosted RAG AI Agent powered by NVIDIA NIM"
LABEL org.opencontainers.image.source="https://github.com/chinnareddy/nv-agent"

# Create non-root user for security
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --shell /bin/bash --create-home appuser

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy Python application code first — these change less often,
# so this layer stays cached across UI-only edits.
COPY --chown=appuser:appuser main.py config.py .
COPY --chown=appuser:appuser chat/__init__.py chat/
COPY --chown=appuser:appuser chat/app.py chat/
COPY --chown=appuser:appuser chat/auth.py chat/
COPY --chown=appuser:appuser chat/rate_limit.py chat/
COPY --chown=appuser:appuser chat/routes.py chat/
COPY --chown=appuser:appuser agent/ agent/
COPY --chown=appuser:appuser kb/ kb/

# ── UI assets (separate layer) ──────────────────────────────
# UI files change frequently. Keeping them in their own layer
# ensures Docker's build cache is properly invalidated when
# only UI changes are made, without re-copying Python code.
COPY --chown=appuser:appuser chat/ui/ chat/ui/

# Create data directories with correct ownership
RUN mkdir -p /app/data/sessions /app/kb/index && \
    chown -R appuser:appuser /app/data /app/kb/index

# Switch to non-root user
USER appuser

# Expose the default port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Default environment variables (override at runtime)
ENV NV_HOST=0.0.0.0
ENV NV_PORT=8000

# Run the server
CMD ["python", "main.py"]
