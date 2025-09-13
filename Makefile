# Makefile for Task Manager project

.PHONY: help install migrate collectstatic run test clean docker-up docker-down docker-logs celery-worker celery-beat celery-flower format lint

# Default target
help:
	@echo "Available commands:"
	@echo "  install        - Install dependencies"
	@echo "  makemigrations - Create database migrations"
	@echo "  migrate        - Run database migrations"
	@echo "  check          - Run Django system check"
	@echo "  collectstatic  - Collect static files"
	@echo "  run            - Run Django development server"
	@echo "  test           - Run tests"
	@echo "  format         - Run ruff check and format"
	@echo "  lint           - Run flake8 with WPS rules"
	@echo "  clean          - Clean Python cache files"
	@echo "  docker-up      - Start all Docker services"
	@echo "  docker-down    - Stop all Docker services"
	@echo "  docker-logs    - Show Docker logs"
	@echo "  celery-worker  - Start Celery worker"
	@echo "  celery-beat    - Start Celery beat scheduler"
	@echo "  celery-flower  - Start Celery Flower dashboard"
	@echo "  setup-task-system - Setup complete task system (periods, stages, tasks)"

# Development commands
install:
	uv sync

makemigrations:
	uv run python manage.py makemigrations

migrate:
	uv run python manage.py migrate

check:
	uv run python manage.py check

collectstatic:
	uv run python manage.py collectstatic --noinput

run:
	uv run python manage.py runserver

test:
	uv run python manage.py test

clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +

format:
	uv run ruff check . --fix || true
	uv run ruff format .

lint:
	uv run flake8 . --select=WPS

# Docker commands
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

# Celery commands
celery-worker:
	uv run celery -A task_manager worker --loglevel=info --concurrency=4 -Q default,celery

celery-beat:
	uv run celery -A task_manager beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler

celery-flower:
	uv run celery -A task_manager flower --port=5555

# Setup commands
setup-task-system:
	uv run python manage.py setup_task_system

create-default-stages:
	uv run python manage.py create_default_stages

setup-periodic-tasks:
	uv run python manage.py setup_periodic_tasks



# Production commands
prod-setup:
	uv run python manage.py migrate --noinput
	uv run python manage.py collectstatic --noinput
	uv run python manage.py createsuperuser --noinput

# Monitoring commands
monitor:
	@echo "Celery Flower: http://localhost:5555"
	@echo "RabbitMQ Management: http://localhost:15672"
	@echo "Django Admin: http://localhost:8000/admin"

# Health check commands
health-check:
	@echo "Checking service health..."
	@docker-compose ps
	@echo ""
	@echo "Checking Celery worker..."
	@docker-compose exec worker-celery celery -A task_manager inspect ping
	@echo ""
	@echo "Checking Redis..."
	@docker-compose exec redis redis-cli ping
	@echo ""
	@echo "Checking RabbitMQ..."
	@docker-compose exec rabbitmq rabbitmq-diagnostics check_port_connectivity

# Backup and restore commands
backup:
	@echo "Creating database backup..."
	docker-compose exec db pg_dump -U postgres task-manager > backup_$(shell date +%Y%m%d_%H%M%S).sql

restore:
	@echo "Restoring database from backup..."
	@read -p "Enter backup file name: " backup_file; \
	docker-compose exec -T db psql -U postgres task-manager < $$backup_file