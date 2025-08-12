# Makefile for Task Manager project

.PHONY: help install migrate collectstatic run test clean docker-up docker-down docker-logs taskiq-worker taskiq-scheduler taskiq-dashboard test-taskiq

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
	@echo "  taskiq-worker  - Start TaskIQ worker"
	@echo "  taskiq-scheduler - Start TaskIQ scheduler"
	@echo "  taskiq-dashboard - Start TaskIQ dashboard"
	@echo "  test-taskiq    - Test TaskIQ functionality"

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

# TaskIQ commands
taskiq-worker:
	taskiq worker task_manager.taskiq:broker --workers 4 --no-parse

taskiq-scheduler:
	taskiq scheduler task_manager.taskiq:broker

taskiq-dashboard:
	taskiq dashboard task_manager.taskiq:broker --port 5555 --no-parse

# Testing commands
test-taskiq:
	python manage.py test_taskiq --task all

test-taskiq-basic:
	python manage.py test_taskiq --task basic

test-taskiq-email:
	python manage.py test_taskiq --task email --email test@example.com --name "Test User"

check-taskiq:
	python scripts/check_taskiq.py

# Production commands
prod-setup:
	python manage.py migrate --noinput
	python manage.py collectstatic --noinput
	python manage.py createsuperuser --noinput

# Monitoring commands
monitor:
	@echo "TaskIQ Dashboard: http://localhost:5555"
	@echo "RabbitMQ Management: http://localhost:15672"
	@echo "Django Admin: http://localhost:8000/admin"

# Health check commands
health-check:
	@echo "Checking service health..."
	@docker-compose ps
	@echo ""
	@echo "Checking TaskIQ worker..."
	@docker-compose exec worker-taskiq taskiq worker task_manager.taskiq:broker --workers 1 --help
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