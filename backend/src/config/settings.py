from __future__ import annotations

import os
import socket
import sys
from pathlib import Path

import dj_database_url
from celery.schedules import crontab
from dotenv import load_dotenv

# Load env vars from repo root `.env` (preferred, used by docker-compose by default).
# Fallback to `backend/.env` for legacy local setups.
_repo_root_env = Path(__file__).resolve().parents[3] / ".env"
_backend_env = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_repo_root_env if _repo_root_env.exists() else _backend_env)


BASE_DIR = Path(__file__).resolve().parent.parent  # points to backend/src

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-secret")
DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() in {"1", "true", "yes", "on"}

ALLOWED_HOSTS = [h for h in os.getenv("DJANGO_ALLOWED_HOSTS", "*").split(",") if h]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "channels",
    "rest_framework",
    "rest_framework.authtoken",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    "django_filters",
    "django_celery_beat",
    # Local
    "kanban.apps.KanbanConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"


DATABASES = {
    "default": dj_database_url.config(
        env="DATABASE_URL",
        default=os.getenv(
            "DATABASE_URL",
            f"sqlite:///{(BASE_DIR / 'db.sqlite3').as_posix()}",
        ),
        conn_max_age=600,
    )
}

# Tests should be runnable without external services (PostgreSQL/Redis).
# If running under pytest, default to a local sqlite database unless explicitly requested.
if "pytest" in sys.modules and os.getenv("DJANGO_TEST_USE_ENV_DB", "").lower() not in {
    "1",
    "true",
    "yes",
    "on",
}:
    DATABASES["default"] = {
        "ENGINE": "django.db.backends.sqlite3",
        # Use in-memory DB for hermetic and fast test runs.
        "NAME": ":memory:",
    }


AUTH_PASSWORD_VALIDATORS: list[dict[str, str]] = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

# Where collectstatic will gather static files.
# Default aligned with Docker image layout (APP_ROOT defaults to /app in container).
STATIC_ROOT = os.getenv(
    "DJANGO_STATIC_ROOT",
    str((Path(os.getenv("APP_ROOT", "/app")) / "static").resolve()),
)

# Media files (user uploads etc.)
MEDIA_ROOT = os.getenv(
    "DJANGO_MEDIA_ROOT",
    str((Path(os.getenv("APP_ROOT", "/app")) / "media").resolve()),
)
MEDIA_URL = os.getenv("DJANGO_MEDIA_URL", "/media/")
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")

REDIS_URL = os.getenv("REDIS_URL") or os.getenv("CELERY_BROKER_URL") or "redis://localhost:6379/0"

# Detect dead/half-open Redis sockets after a network blip so clients reconnect
# instead of silently hanging on a stale connection (e.g. pub/sub subscriptions
# used for real-time notifications, which otherwise stay broken until restart).
_REDIS_SOCKET_KEEPALIVE_OPTIONS = {
    socket.TCP_KEEPIDLE: 60,
    socket.TCP_KEEPINTVL: 10,
    socket.TCP_KEEPCNT: 5,
}
REDIS_HEALTH_CHECK_INTERVAL = int(os.getenv("REDIS_HEALTH_CHECK_INTERVAL", "30"))
REDIS_SOCKET_TIMEOUT = int(os.getenv("REDIS_SOCKET_TIMEOUT", "20"))

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [
                {
                    "address": REDIS_URL,
                    "socket_keepalive": True,
                    "socket_keepalive_options": _REDIS_SOCKET_KEEPALIVE_OPTIONS,
                    "socket_timeout": REDIS_SOCKET_TIMEOUT,
                    "socket_connect_timeout": REDIS_SOCKET_TIMEOUT,
                    "health_check_interval": REDIS_HEALTH_CHECK_INTERVAL,
                }
            ],
        },
    }
}

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)

# Keep the broker/result Redis connections resilient to network blips so the
# worker reconnects automatically instead of hanging on a stale socket.
CELERY_BROKER_TRANSPORT_OPTIONS = {
    "socket_keepalive": True,
    "socket_keepalive_options": _REDIS_SOCKET_KEEPALIVE_OPTIONS,
    "health_check_interval": REDIS_HEALTH_CHECK_INTERVAL,
    "retry_on_timeout": True,
}
CELERY_RESULT_BACKEND_TRANSPORT_OPTIONS = CELERY_BROKER_TRANSPORT_OPTIONS
CELERY_REDIS_BACKEND_HEALTH_CHECK_INTERVAL = REDIS_HEALTH_CHECK_INTERVAL
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_BROKER_CONNECTION_MAX_RETRIES = None

# Acknowledge a task only after it finishes, so a task in flight when the
# worker dies is redelivered instead of silently lost.
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True

# Reserve one task at a time per process. Prevents a slow task from parking
# a batch of unrelated messages in a worker's local buffer.
CELERY_WORKER_PREFETCH_MULTIPLIER = 1

# Route every user-facing task explicitly: an unrouted one falls back to the
# default queue, which a deployment is not guaranteed to consume.
CELERY_TASK_DEFAULT_QUEUE = "celery"
CELERY_TASK_ROUTES = {
    "kanban.tasks.send_overdue_card_reminders": {"queue": "notifications"},
    "kanban.tasks.generate_recurring_cards": {"queue": "maintenance"},
    "kanban.tasks.prune_card_activity": {"queue": "maintenance"},
}
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BEAT_SCHEDULE = {
    "check-overdue-cards": {
        "task": "kanban.tasks.send_overdue_card_reminders",
        "schedule": 60.0,  # runs every minute, task itself reads interval from SiteSettings
    },
    "generate-recurring-cards": {
        "task": "kanban.tasks.generate_recurring_cards",
        "schedule": 60.0,
    },
    "prune-card-activity": {
        "task": "kanban.tasks.prune_card_activity",
        "schedule": crontab(hour=0, minute=30, day_of_month="1"),
    },
}

# --- Web Push (VAPID) ---
#
# Generate once with `npx web-push generate-vapid-keys`. The pair is permanent:
# rotating it invalidates every existing browser subscription, so treat the
# private key as long-lived state, not as a rotatable secret.
# The public key is not secret and is served to the browser via
# GET /api/v1/notifications/vapid-key/.
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
# Push services (FCM, Mozilla) reject a request whose VAPID claims carry no
# contact for the sender, so this must be a real "mailto:" or "https:" value.
VAPID_CLAIM_EMAIL = os.getenv("VAPID_CLAIM_EMAIL", "")

# --- Notification dispatcher ---
#
# Poll intervals for `manage.py run_dispatcher`. The database is the queue;
# these numbers only decide how promptly it is drained.
DISPATCHER_POLL_SECONDS = int(os.getenv("DISPATCHER_POLL_SECONDS", "20"))
# Recurring cards and activity pruning are not time-critical.
DISPATCHER_MAINTENANCE_SECONDS = int(os.getenv("DISPATCHER_MAINTENANCE_SECONDS", "300"))
DISPATCHER_BATCH_SIZE = int(os.getenv("DISPATCHER_BATCH_SIZE", "100"))
DISPATCHER_MAX_ATTEMPTS = int(os.getenv("DISPATCHER_MAX_ATTEMPTS", "5"))
# A row left in PROCESSING for longer than this is assumed orphaned by a
# crashed dispatcher and is returned to PENDING.
DISPATCHER_STUCK_MINUTES = int(os.getenv("DISPATCHER_STUCK_MINUTES", "10"))


REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    # Basic global throttling to reduce risk of resource starvation / DoS.
    # Per-view overrides can be added where needed.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("DRF_THROTTLE_ANON_RATE", "60/min"),
        "user": os.getenv("DRF_THROTTLE_USER_RATE", "600/min"),
    },
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
        "rest_framework.filters.SearchFilter",
    ],
}


SPECTACULAR_SETTINGS = {
    "TITLE": "Task Manager API",
    "DESCRIPTION": "Kanban API for Task Manager",
    "VERSION": "1.4.0",  # x-release-please-version
    "SERVE_INCLUDE_SCHEMA": False,
}
