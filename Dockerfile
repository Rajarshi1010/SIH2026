# ==============================================================================
# Multi-Stage Dockerfile for GeoAI Industrial Fire Classifier (Root Entrypoint)
# Compatible with Hugging Face Spaces (Port 7860), Render (Port 10000), & Local (8000)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Python Virtual Environment
# ------------------------------------------------------------------------------
FROM python:3.11-slim-bookworm AS builder

WORKDIR /build

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY Backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# ------------------------------------------------------------------------------
# Stage 2: Hardened Non-Root Production Runtime
# ------------------------------------------------------------------------------
FROM python:3.11-slim-bookworm AS runner

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=7860 \
    HOST=0.0.0.0

# Install runtime utilities: curl for container healthcheck, libgomp1 for LightGBM OpenMP
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

# Create dedicated non-root application user (UID/GID 10001)
RUN groupadd -g 10001 appuser && \
    useradd -u 10001 -g appuser -s /bin/sh -d /app -M appuser

# Pre-create data and artifacts directories with secure 755 permissions
RUN mkdir -p /app/data /app/artifacts && \
    chmod -R 755 /app/data /app/artifacts && \
    chown -R appuser:appuser /app

# Copy Backend codebase into container /app
COPY Backend/ /app/

# Enforce secure ownership and permissions
RUN chmod -R 755 /app/data /app/artifacts && \
    chown -R appuser:appuser /app

USER 10001

EXPOSE 7860

# Health check dynamically verifies whichever port is assigned ($PORT or default 7860)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD sh -c "curl -f http://localhost:\${PORT:-7860}/api/v1/health || exit 1"

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860} --workers 1"]
