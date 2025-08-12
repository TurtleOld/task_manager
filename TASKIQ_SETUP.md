# TaskIQ Setup Guide

Это руководство поможет вам настроить TaskIQ для асинхронной обработки задач в проекте Task Manager.

## Что такое TaskIQ?

TaskIQ - это современная библиотека для асинхронной обработки задач в Python, которая использует современные async/await паттерны. Она предоставляет:

- **Простой API** - легкость использования
- **Высокую производительность** - основана на async/await
- **Гибкость** - поддержка различных брокеров сообщений
- **Мониторинг** - встроенная панель управления

## Архитектура

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Django App    │    │   TaskIQ        │    │   RabbitMQ      │
│                 │    │   Worker        │    │   Broker        │
│  - Views        │───▶│  - Tasks        │───▶│  - Queues       │
│  - Models       │    │  - Scheduler    │    │  - Messages     │
│  - Forms        │    │  - Dashboard    │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Установка и настройка

### 1. Зависимости

TaskIQ требует следующие зависимости:

```toml
taskiq = ">=0.13.0"
taskiq-python = ">=0.1.0"
taskiq-aio-pika = ">=0.1.0"
aio-pika = ">=9.3.0"
redis = ">=5.0.0"
```

### 2. Конфигурация

#### Основная конфигурация (`task_manager/taskiq.py`)

```python
import os
from taskiq import TaskiqScheduler, InMemoryResultBackend
from taskiq_aio_pika import AioPikaBroker
from taskiq_python import PythonTaskiq

# Настройка брокера
broker = AioPikaBroker(
    url=os.environ.get('BROKER_URL', 'amqp://rabbitmq:rabbitmq@rabbitmq:5672/'),
    result_backend=InMemoryResultBackend(),
)

# Настройка планировщика
scheduler = TaskiqScheduler(
    broker=broker,
    sources=["task_manager.tasks"],
)

# Создание приложения TaskIQ
taskiq = PythonTaskiq(
    broker=broker,
    scheduler=scheduler,
)
```

#### Настройки Django (`task_manager/settings.py`)

```python
# TaskIQ Configuration Options
TASKIQ_TIMEZONE = 'Europe/Moscow'
TASKIQ_BROKER_URL = os.environ.get(
    'BROKER_URL', 'amqp://rabbitmq:rabbitmq@rabbitmq:5672/'
)
TASKIQ_RESULT_BACKEND_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')

# Маршрутизация задач
TASKIQ_TASK_ROUTES = {
    'task_manager.tasks.*': {'queue': 'default'},
    'task_manager.users.*': {'queue': 'users'},
}

# Настройки воркера
TASKIQ_WORKER_CONCURRENCY = 4
TASKIQ_WORKER_MAX_TASKS_PER_CHILD = 1000

# Настройки планировщика
TASKIQ_SCHEDULER_SOURCES = ["task_manager.tasks"]

if 'test' in sys.argv or 'test_coverage' in sys.argv:
    TASKIQ_ALWAYS_EAGER = True
```

### 3. Переменные окружения

```bash
# RabbitMQ
BROKER_URL=amqp://rabbitmq:rabbitmq@rabbitmq:5672/

# Redis
REDIS_URL=redis://redis:6379/0

# RabbitMQ credentials
RMUSER=rabbitmq
RMPASSWORD=rabbitmq
RMHOST=rabbitmq
RMPORT=5672
```

## Создание задач

### Базовый пример

```python
from taskiq import task

@task
def send_notification(message: str) -> None:
    """Отправка уведомления."""
    print(f"Sending notification: {message}")
    # Ваша логика отправки
```

### Задача с параметрами

```python
@task
def process_data(data: dict, priority: int = 1) -> dict:
    """Обработка данных."""
    result = {"processed": True, "data": data, "priority": priority}
    return result
```

### Отложенные задачи

```python
from datetime import datetime, timedelta

# Выполнить через 1 час
task_result = send_notification.kiq("Hello").with_eta(
    datetime.now() + timedelta(hours=1)
)

# Выполнить в определенное время
task_result = send_notification.kiq("Hello").with_eta(
    datetime(2024, 1, 1, 12, 0, 0)
)
```

## Запуск сервисов

### 1. Воркер

```bash
# Запуск воркера
taskiq worker task_manager.taskiq:broker --workers 4

# Или через Makefile
make taskiq-worker
```

### 2. Планировщик

```bash
# Запуск планировщика
taskiq scheduler task_manager.taskiq:scheduler

# Или через Makefile
make taskiq-scheduler
```

### 3. Панель управления

```bash
# Запуск панели управления
taskiq dashboard task_manager.taskiq:broker --port 5555

# Или через Makefile
make taskiq-dashboard
```

## Docker Compose

```yaml
services:
  worker-taskiq:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: task_manager_taskiq
    command: taskiq worker task_manager.taskiq:broker --workers 4
    env_file:
      - .env
    depends_on:
      - rabbitmq
      - redis
    restart: on-failure

  taskiq-scheduler:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: task_manager_taskiq_scheduler
    command: taskiq scheduler task_manager.taskiq:scheduler
    env_file:
      - .env
    depends_on:
      - rabbitmq
      - redis
      - db
    restart: on-failure

  taskiq-dashboard:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: task_manager_taskiq_dashboard
    command: taskiq dashboard task_manager.taskiq:broker --port 5555
    ports:
      - "5555:5555"
    depends_on:
      - rabbitmq
      - redis
    restart: on-failure
```

## Мониторинг

### TaskIQ Dashboard

Доступен по адресу: http://localhost:5555

Функции:
- Просмотр активных задач
- История выполнения
- Статистика производительности
- Управление очередями

### RabbitMQ Management

Доступен по адресу: http://localhost:15672

Логин: `rabbitmq`
Пароль: `rabbitmq`

## Тестирование

### Команды Makefile

```bash
# Тест всех задач
make test-taskiq

# Тест базовых задач
make test-taskiq-basic

# Тест email задач
make test-taskiq-email

# Проверка здоровья системы
make check-taskiq
```

### Django команды

```bash
# Тест всех задач
python manage.py test_taskiq --task all

# Тест конкретной задачи
python manage.py test_taskiq --task email --email test@example.com --name "Test User"
```

### Скрипт проверки

```bash
python scripts/check_taskiq.py
```

## Миграция с Celery

### Основные изменения

1. **Декораторы**: `@shared_task` → `@task`
2. **Вызов задач**: `.delay()` → `.kiq()`
3. **Отложенные задачи**: `.apply_async(eta=...)` → `.kiq().with_eta(...)`
4. **Конфигурация**: `CELERY_*` → `TASKIQ_*`

### Пример миграции

**Было (Celery):**
```python
from celery import shared_task

@shared_task
def send_email(email: str, message: str):
    # логика отправки
    pass

# Вызов
send_email.delay("test@example.com", "Hello")
```

**Стало (TaskIQ):**
```python
from taskiq import task

@task
def send_email(email: str, message: str):
    # логика отправки
    pass

# Вызов
send_email.kiq("test@example.com", "Hello")
```

## Устранение неполадок

### Частые проблемы

1. **Ошибка подключения к RabbitMQ**
   - Проверьте переменную `BROKER_URL`
   - Убедитесь, что RabbitMQ запущен
   - Проверьте сетевые настройки Docker

2. **Задачи не выполняются**
   - Проверьте, что воркер запущен
   - Убедитесь, что задачи правильно импортированы
   - Проверьте логи воркера

3. **Ошибки планировщика**
   - Проверьте настройки `TASKIQ_SCHEDULER_SOURCES`
   - Убедитесь, что планировщик запущен
   - Проверьте подключение к базе данных

### Логи

```bash
# Логи воркера
docker-compose logs worker-taskiq

# Логи планировщика
docker-compose logs taskiq-scheduler

# Логи панели управления
docker-compose logs taskiq-dashboard
```

## Производительность

### Рекомендации

1. **Количество воркеров**: Настройте в зависимости от нагрузки
2. **Размер очереди**: Мониторьте размер очереди в RabbitMQ
3. **Таймауты**: Установите разумные таймауты для задач
4. **Мониторинг**: Регулярно проверяйте метрики производительности

### Масштабирование

```bash
# Горизонтальное масштабирование
docker-compose up --scale worker-taskiq=3
```

## Безопасность

1. **Переменные окружения**: Храните чувствительные данные в переменных окружения
2. **Сеть**: Используйте внутренние сети Docker
3. **Аутентификация**: Настройте аутентификацию для RabbitMQ
4. **Мониторинг**: Регулярно проверяйте логи на подозрительную активность

## Дополнительные ресурсы

- [TaskIQ Documentation](https://taskiq-python.github.io/)
- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [Django Async Support](https://docs.djangoproject.com/en/stable/topics/async/)
