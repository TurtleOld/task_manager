# Task Manager (Kanban)

Проект состоит из backend (Django + DRF) и frontend (React + Vite). База данных — PostgreSQL. Backend предоставляет API для досок, колонок и карточек, включая перемещение карточек с оптимистической версионизацией.

## Возможности

- CRUD для досок, колонок и карточек.
- Перемещение карточек между колонками с сохранением порядка.
- Health endpoint.
- OpenAPI схема через drf-spectacular.

## Быстрый старт через Docker Compose

### Требования

- Docker + Docker Compose.

### Запуск

```bash
docker compose up --build
```

После старта:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- OpenAPI schema: http://localhost:8000/api/schema
- Swagger UI: http://localhost:8000/api/schema/swagger-ui/

### Переменные окружения (опционально)

Можно переопределить в `.env` или через окружение:

- `POSTGRES_USER` (по умолчанию `postgres`)
- `POSTGRES_PASSWORD` (по умолчанию `postgres`)
- `POSTGRES_DB` (по умолчанию `task_manager`)
- `DJANGO_SECRET_KEY` (по умолчанию `dev`)
- `DJANGO_DEBUG` (по умолчанию `true`)
- `DJANGO_ALLOWED_HOSTS` (по умолчанию `*`)

## Dev-разработка (локально без Docker)

### Backend

Требования: Python 3.13, uv.

```bash
make uv-venv
make uv-sync
make migrate
make run
```

Backend будет доступен на http://localhost:8000.

Полезные команды:

```bash
make lint
make typecheck
make test
```

### Frontend

Требования: Node.js 20.

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Frontend будет доступен на http://localhost:5173.

### Генерация типов API (опционально)

```bash
cd frontend
OPENAPI_URL=http://localhost:8000/api/schema npm run generate:openapi
```

## API

- `/api/boards/` — доски
- `/api/columns/` — колонки
- `/api/cards/` — карточки
- `/api/cards/{id}/move/` — перемещение карточки
- `/api/health/` — health check

## Структура проекта

- `backend/` — Django API
- `frontend/` — React UI
- `docker-compose.yml` — инфраструктура для разработки
