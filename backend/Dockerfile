FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    VIRTUAL_ENV=/app/.venv \
    PATH=/app/.venv/bin:/root/.local/bin:/root/.cargo/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && ( [ -x /root/.local/bin/uv ] && ln -sf /root/.local/bin/uv /usr/local/bin/uv || true ) \
    && ( [ -x /root/.cargo/bin/uv ] && ln -sf /root/.cargo/bin/uv /usr/local/bin/uv || true ) \
    && uv --version

WORKDIR /app

# Pre-install deps using uv for better layer caching
COPY backend/pyproject.toml ./pyproject.toml

# Create venv and resolve deps with uv (generate lock inside image for caching)
RUN uv venv && (uv lock || true) && uv sync --no-dev || (rm -f uv.lock && uv sync --no-dev)

# Copy project source
COPY backend/manage.py ./manage.py
COPY backend/src ./src

EXPOSE 8000

# Always run using the project virtualenv's Python to ensure dependencies are available
CMD ["sh", "-lc", "/app/.venv/bin/python manage.py migrate && /app/.venv/bin/python manage.py runserver 0.0.0.0:8000"]
