FROM python:3.13-slim

ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Устанавливаем системные зависимости
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

# Ставим uv под appuser и делаем его доступным в /usr/local/bin
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /home/appuser/.local/bin/uv /usr/local/bin/uv

# Копируем pyproject.toml и README.md с правильными правами
COPY --chown=appuser:appuser pyproject.toml README.md ./

# Ставим зависимости
RUN uv sync

# Копируем остальной код
COPY --chown=appuser:appuser . .

EXPOSE 8000

CMD ["uv", "run", "python", "manage.py", "runserver", "0.0.0.0:8000"]
