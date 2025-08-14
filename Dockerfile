FROM python:3.13-slim

ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/home/appuser/.local/bin:$PATH"

WORKDIR /app

# Устанавливаем системные зависимости под root
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Создаём пользователя и назначаем владельца /app
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

# Переходим на appuser
USER appuser

# Устанавливаем uv под appuser
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Копируем pyproject.toml и README.md с правильными правами
COPY --chown=appuser:appuser pyproject.toml README.md ./

# Ставим зависимости под appuser
RUN uv sync

# Копируем остальной код
COPY --chown=appuser:appuser . .

EXPOSE 8000

CMD ["uv", "run", "python", "manage.py", "runserver", "0.0.0.0:8000"]
