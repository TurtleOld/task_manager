# Makefile for Task Manager project

.PHONY: help install migrate collectstatic run test clean docker-up docker-down docker-logs celery-worker celery-beat flower test-celery

# Default target
help:
	@echo "Available commands:"
	@echo "  install        - Install dependencies"
	@echo "  migrate        - Run database migrations"
	@echo "  collectstatic  - Collect static files"
	@echo "  run            - Run Django development server"
	@echo "  test           - Run tests"
	@echo "  clean          - Clean Python cache files"
	@echo "  docker-up      - Start all Docker services"
	@echo "  docker-down    - Stop all Docker services"
	@echo "  docker-logs    - Show Docker logs"
	@echo "  celery-worker  - Start Celery worker"
	@echo "  celery-beat    - Start Celery beat"
	@echo "  flower         - Start Flower monitoring"
	@echo "  test-celery    - Test Celery functionality"

# Development commands
install:
	pip install -e .

migrate:
	python manage.py migrate

collectstatic:
	python manage.py collectstatic --noinput

run:
	python manage.py runserver

test:
	python manage.py test

clean:
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +

# Docker commands
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

# Celery commands
celery-worker:
	celery -A task_manager worker -l INFO

celery-beat:
	celery -A task_manager beat -l INFO --scheduler django_celery_beat.schedulers:DatabaseScheduler

flower:
	celery -A task_manager flower --port=5555

# Testing commands
test-celery:
	python manage.py test_celery --task all

test-celery-debug:
	python manage.py test_celery --task debug

test-celery-simple:
	python manage.py test_celery --task simple

test-celery-email:
	python manage.py test_celery --task email --email test@example.com --name "Test User"

check-celery:
	python scripts/check_celery.py

# Production commands
prod-setup:
	python manage.py migrate --noinput
	python manage.py collectstatic --noinput
	python manage.py createsuperuser --noinput

# Monitoring commands
monitor:
	@echo "Flower (Celery monitoring): http://localhost:5555"
	@echo "RabbitMQ Management: http://localhost:15672"
	@echo "Django Admin: http://localhost:8000/admin"

# Health check commands
health-check:
	@echo "Checking service health..."
	@docker-compose ps
	@echo ""
	@echo "Checking Celery worker..."
	@docker-compose exec worker-celery celery -A task_manager inspect active
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