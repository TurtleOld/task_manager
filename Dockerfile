FROM python:3.14-slim

ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN useradd -m -u 1000 appuser \
    && mkdir -p /app_data \
    && chown -R appuser:appuser /app /app_data

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

USER appuser
ENV PATH="/home/appuser/.local/bin:$PATH"

RUN curl -LsSf https://astral.sh/uv/install.sh | sh

COPY pyproject.toml README.md ./
RUN uv sync

COPY . .

RUN chmod -R 755 /app_data

EXPOSE 8000

CMD ["uv", "run", "python", "manage.py", "runserver", "0.0.0.0:8000"]