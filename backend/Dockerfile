FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/app/.venv \
    PATH=/app/.venv/bin:$PATH \
    # Ensure Django project packages (./src/config, ./src/kanban, etc.) are importable
    # for process entrypoints that don't go through manage.py (e.g. daphne, celery).
    PYTHONPATH=/app/src \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && rm -rf /var/lib/apt/lists/*

# NOTE: Some corporate environments intercept TLS with a custom CA.
# You can override these build args as needed.
ARG PIP_TRUSTED_HOST_1=pypi.org
ARG PIP_TRUSTED_HOST_2=files.pythonhosted.org

WORKDIR /app

# Runtime defaults for entrypoint.sh
ENV APP_ROOT=/app \
    MANAGE_PY_PATH=/app/manage.py \
    SRC_DIR=/app/src \
    STATIC_DIR=/app/static \
    MEDIA_DIR=/app/media \
    LOGS_DIR=/app/logs \
    TMP_DIR=/app/tmp

# Pre-install deps (production only) for better layer caching
COPY backend/pyproject.toml ./pyproject.toml

# Create venv and install runtime deps (no dev extras)
RUN python -m venv "$VIRTUAL_ENV" \
    && python -m pip install --upgrade pip \
    && python -c "import pathlib, tomllib; data=tomllib.loads(pathlib.Path('pyproject.toml').read_text('utf-8')); print('\\n'.join(data.get('project', {}).get('dependencies', [])))" > /tmp/requirements.txt \
    && python -m pip install \
        --trusted-host "$PIP_TRUSTED_HOST_1" \
        --trusted-host "$PIP_TRUSTED_HOST_2" \
        -r /tmp/requirements.txt

# Copy project source
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
