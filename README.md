# Task Manager (Kanban)

Проект состоит из backend (Django + DRF) и frontend (React + Vite). База данных — PostgreSQL. Backend предоставляет API для досок, колонок и карточек, включая перемещение карточек с оптимистической версионизацией.

## Возможности

- CRUD для досок, колонок и карточек.
- Перемещение карточек между колонками с сохранением порядка.
- Health endpoint.
- OpenAPI схема через drf-spectacular.
- Swagger UI.
- Персональные напоминания о дедлайне (минуты/часы) с проверкой доступности каналов.

## Быстрый старт через Docker Compose

### Требования

- Docker + Docker Compose.

### Запуск

```bash
docker compose up --build
```

### Единый файл переменных окружения

Используйте один файл `./.env` в корне репозитория (рядом с [`docker-compose.yml`](docker-compose.yml:1)).

- Docker Compose использует этот файл для подстановки `${...}` в `docker-compose.yml`.
- Backend (Django) также загружает `./.env` при старте (с fallback на `backend/.env` для legacy-окружений).

После старта:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- OpenAPI schema: http://localhost:8000/api/schema
- Swagger UI: http://localhost:8000/api/schema/swagger-ui/

### Переменные окружения (опционально)

Можно переопределить в `./.env` или через окружение:

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
- `/api/v1/notifications/profile/` — профиль уведомлений (email/telegram chat_id)
- `/api/v1/notification-preferences/` — настройки уведомлений
- `/api/v1/cards/{id}/deadline-reminder/` — настройка персонального напоминания о дедлайне

## Критерии приемки (напоминания о дедлайне)

1. В карточке задачи не отображается и не редактируется оценка времени.
2. В левой части карточки есть блок «Напоминание о дедлайне» с выбором интервала в минутах/часах.
3. Напоминание отправляется в рассчитанное время (дедлайн − интервал) с учётом таймзоны пользователя.
4. Изменение дедлайна или интервала корректно перепланирует отправку напоминания.
5. При отсутствии дедлайна или при времени напоминания в прошлом уведомление не отправляется, UI сообщает причину.
6. Канал доставки строго соответствует настройкам пользователя (email/Telegram); недоступные каналы явно помечены.

## Уведомления

Система уведомлений отправляет сообщения о событиях досок, колонок и карточек.

### Каналы

- Email (SMTP)
- Telegram (бот через HTTP API)

### Настройки

- Глобальные настройки пользователя (board = null)
- Переопределения на уровне доски

### События

- board.created, board.updated, board.deleted
- column.created, column.updated, column.deleted
- card.created, card.updated, card.deleted, card.moved

### Переменные окружения

- FRONTEND_BASE_URL — базовый URL фронтенда для ссылок в уведомлениях
- EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD, EMAIL_USE_TLS, EMAIL_USE_SSL, DEFAULT_FROM_EMAIL
- TELEGRAM_BOT_TOKEN — токен бота
- CELERY_BROKER_URL, CELERY_RESULT_BACKEND — брокер/результаты (Redis)

### Запуск Celery

В docker-compose добавлен сервис `celery` и `redis`.

Для локального запуска:

```bash
cd backend
set PYTHONPATH=src && uv run --active celery -A config worker -l info
```

## План тестирования уведомлений

### Unit

- Проверить формирование события и ссылок в [`backend/src/kanban/notifications.py`](backend/src/kanban/notifications.py).
- Проверить выбор настроек: глобальные и на уровне доски, приоритет доски над глобальными в [`backend/src/kanban/tasks.py`](backend/src/kanban/tasks.py).
- Проверить генерацию Delivery записей и статусов (queued/sent/failed) в [`backend/src/kanban/tasks.py`](backend/src/kanban/tasks.py).

### Integration

- Создание доски/колонки/карточки через API вызывает создание NotificationEvent и отправку задач Celery (используя CELERY_TASK_ALWAYS_EAGER=1).
- Обновление/удаление сущностей создаёт корректный summary и payload.
- Перемещение карточки `/api/v1/cards/{id}/move/` создаёт событие card.moved.
- Уведомления доставляются по email при заполненном email профиле и включённых настройках.
- Уведомления доставляются в Telegram при заполненном chat_id и корректном TELEGRAM_BOT_TOKEN.

## Структура проекта

- `backend/` — Django API
- `frontend/` — React UI
- `android/` — Android (Kotlin + Jetpack Compose, WebView + OneSignal push)
- `docker-compose.yml` — инфраструктура для разработки

## Mobile (Android)

### Требования

- JDK 17
- Android SDK (локально) или Docker (для сборки через compose)

### Переменные окружения

- `ANDROID_API_BASE_URL` — base URL API (по умолчанию `http://10.0.2.2:8000` для эмулятора)
- `ANDROID_WEB_BASE_URL` — base URL Web UI (по умолчанию `http://10.0.2.2:5173`)
- `ONESIGNAL_APP_ID` — App ID из OneSignal (для push)

### Firebase / google-services.json

- Файл [`android/app/google-services.json`](android/app/google-services.json) не хранится в Git.
- Для локальной разработки положите свой файл вручную в [`android/app/google-services.json`](android/app/google-services.json).
- Для CI используется секрет `GOOGLE_SERVICES_JSON_B64` (base64 от содержимого файла), из которого на этапе сборки восстанавливается [`android/app/google-services.json`](android/app/google-services.json).

Пример получения base64 для секрета:

```bash
base64 -w 0 android/app/google-services.json
```

Проверка перед локальной сборкой (файл обязателен при подключенном Firebase plugin):

```bash
test -f android/app/google-services.json || (echo "Missing android/app/google-services.json" && exit 1)
```

### Локальная сборка

```bash
cd android
./gradlew :app:assembleDebug
./gradlew :app:bundleRelease
```

### Сборка через Docker Compose

```bash
docker compose build android
```

APK/AAB находятся в `android/app/build/outputs`.
