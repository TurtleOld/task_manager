FROM python:3.13-slim

ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Устанавливаем системные зависимости и uv глобально в /usr/local/bin
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -LsSf https://astral.sh/uv/install.sh | sh -s -- --bin-dir /usr/local/bin

# Копируем pyproject и README для установки зависимостей
COPY pyproject.toml README.md ./

# Ставим зависимости через uv
RUN uv sync

# Копируем остальной код
COPY . .

# Создаём обычного пользователя и передаём ему права на /app
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uv", "run", "python", "manage.py", "runserver", "0.0.0.0:8000"]
