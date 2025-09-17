# Task Manager

Task Manager — веб‑приложение на Django с канбан‑доской для управления задачами. Задачи визуально распределены по колонкам стадий и перетаскиваются между ними. Сервис позволяет назначать исполнителей, добавлять метки и следить за сроками. Фоновые операции (уведомления, напоминания) выполняются через Celery и Redis.

## Возможности
- визуальная канбан‑доска с drag‑and‑drop задач между стадиями
- управление пользователями и метками
- REST API для интеграций
- асинхронные уведомления и периодические задачи на Celery

## Запуск для разработки

### 1. Клонирование и настройка окружения
```bash
git clone https://github.com/TurtleOld/task_manager.git
cd task_manager
cp .env.example .env  # заполните переменные окружения
```
В `.env` как минимум нужны значения:
```
SECRET_KEY=<случайная_строка>
DATABASE_URL=postgres://postgres:postgres@localhost:5432/task-manager
ALLOWED_HOSTS=127.0.0.1,localhost
CSRF_TRUSTED_ORIGINS=http://127.0.0.1,http://localhost
```

### 2. Установка зависимостей и миграций
```bash
make install      # установка зависимостей через uv
make migrate      # применение миграций БД
```

### 3. Запуск сервера
```bash
make run          # http://127.0.0.1:8000
```
Для фоновых задач при разработке можно запустить Celery:
```bash
make celery-worker
make celery-beat
```

### 4. Тестирование
```bash
make test
```

## Запуск в production

Для продакшн‑развертывания используется Docker Compose.

```bash
make docker-up       # запуск Postgres, Redis, RabbitMQ, веб‑сервера и воркеров
make health-check    # проверка состояния сервисов
make docker-down     # остановка контейнеров
```
Веб‑приложение доступно на `http://localhost:8000`. Мониторинг Celery — `http://localhost:5555`, управление RabbitMQ — `http://localhost:15672`.

## Полезные команды
- `make format` — автоформатирование кода
- `make lint` — проверка стиля
- `make collectstatic` — сбор статических файлов

## REST API

Основные эндпоинты для работы с задачами доступны по префиксу `/api/tasks/` и требуют аутентификации:

- `GET /api/tasks/` — список задач.
- `POST /api/tasks/` — создание задачи (slug формируется автоматически, стадия по умолчанию берётся из первой стадии по порядку).
- `GET /api/tasks/{id}/` — подробности задачи.
- `PATCH /api/tasks/{id}/` — обновление задачи, включая напоминания и смену исполнителя/меток.
- `DELETE /api/tasks/{id}/` — удаление задачи.
