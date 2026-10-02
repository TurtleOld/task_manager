FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/app/.venv \
    PATH=/app/.venv/bin:$PATH \
    # Ensure Django project packages (./src/config, ./src/kanban, etc.) are importable
    # for process entrypoints that don't go through manage.py (e.g. daphne, celery).
    PYTHONPATH=/app/src \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_LINK_MODE=copy \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Runtime defaults for entrypoint.sh
ENV APP_ROOT=/app \
    MANAGE_PY_PATH=/app/manage.py \
    SRC_DIR=/app/src \
    STATIC_DIR=/app/static \
    MEDIA_DIR=/app/media \
    LOGS_DIR=/app/logs \
    TMP_DIR=/app/tmp

COPY backend/pyproject.toml backend/uv.lock ./

# Pre-install deps (production only) for better layer caching
RUN python -m pip install --upgrade pip uv \
    && uv sync --frozen --no-dev

COPY backend/manage.py ./manage.py
COPY backend/src ./src

# Entrypoint (filesystem prep + optional manage.py generation + exec)
COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh

EXPOSE 8000

# Always run using the project virtualenv's Python to ensure dependencies are available
ENTRYPOINT ["/entrypoint.sh"]

# Production command:
# - Apply migrations
# - Collect static
# - Start ASGI server with Daphne, binding to 0.0.0.0 and PORT env var (default 8000)
CMD ["sh", "-lc", "\
  /app/.venv/bin/python manage.py migrate --noinput \
  && /app/.venv/bin/python manage.py collectstatic --noinput \
  && /app/.venv/bin/daphne -b 0.0.0.0 -p ${PORT:-8000} config.asgi:application\
  "]

# Final production stage (alias for docker build --target prod)
FROM base AS prod
