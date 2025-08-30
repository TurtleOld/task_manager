"""
Constants for the task manager application.

This module contains all application-wide constants including HTTP status codes,
pagination settings, and other configuration values.
"""

from typing import Final

# HTTP Status Codes
HTTP_OK: Final[int] = 200
HTTP_FOUND: Final[int] = 302
HTTP_BAD_REQUEST: Final[int] = 400
HTTP_FORBIDDEN: Final[int] = 403
HTTP_NOT_FOUND: Final[int] = 404

# Pagination
COMMENTS_PAGE_SIZE: Final[int] = 10

# Default reminder periods (in minutes)
DEFAULT_REMINDER_PERIODS: Final[tuple[int, ...]] = (
    60,
    120,
    180,
    240,
    300,
    360,
    420,
    480,
    540,
    600,
    660,
    720,
    780,
    840,
    900,
    960,
    1020,
    1080,
    1140,
    1200,
    1260,
    1320,
    1380,
    1440,
)

# Default reminder period name
DEFAULT_REMINDER_PERIOD: Final[str] = 'Не задано'

RANGE: Final[int] = 25

# Task Management
DEFAULT_TASK_ORDER: Final[int] = 0

# User Management
DEFAULT_USER_ID: Final[int] = 1
DEFAULT_EXECUTOR_ID: Final[int] = 2

# File Upload
MAX_FILE_SIZE: Final[int] = 5242880  # 5MB in bytes
ALLOWED_IMAGE_TYPES: Final[tuple[str, ...]] = (
    'image/jpeg',
    'image/png',
    'image/gif',
)

# Theme Colors
VALID_THEME_COLORS: Final[tuple[str, ...]] = (
    'red',
    'orange',
    'yellow',
    'green',
    'blue',
    'indigo',
    'purple',
)

# Task States
TASK_OPEN: Final[bool] = False
TASK_CLOSED: Final[bool] = True

# Comment States
COMMENT_ACTIVE: Final[bool] = False
COMMENT_DELETED: Final[bool] = True

# Database
DEFAULT_CONN_MAX_AGE: Final[int] = 500

# Notification
DEFAULT_NOTIFICATION_DELAY: Final[int] = 60  # seconds

# Security
CSRF_TOKEN_LENGTH: Final[int] = 64
SESSION_TIMEOUT: Final[int] = 3600  # 1 hour in seconds
DEFAULT_PASSWORD_LENGTH: Final[int] = 12

# UI/UX
MAX_TASK_NAME_LENGTH: Final[int] = 100
MAX_DESCRIPTION_LENGTH: Final[int] = 1000
MAX_COMMENT_LENGTH: Final[int] = 500

# API
API_VERSION: Final[str] = 'v1'
DEFAULT_API_PAGE_SIZE: Final[int] = 20
MAX_API_PAGE_SIZE: Final[int] = 100
