FROM python:3.13-slim

ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/home/appuser/.local/bin:$PATH"

WORKDIR /app

# Создаем пользователя сразу, чтобы потом ставить uv от него
RUN useradd -m -u 1000 appuser

# Системные зависимости — от root
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем uv под appuser
USER appuser
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Копируем pyproject и README с нужными правами
COPY --chown=appuser:appuser pyproject.toml README.md ./

# Ставим зависимости через uv
RUN uv sync

# Копируем остальной код
COPY --chown=appuser:appuser . .

EXPOSE 8000

CMD ["uv", "run", "python", "manage.py", "runserver", "0.0.0.0:8000"]
