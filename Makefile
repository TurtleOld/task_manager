lint:
		@cd ./task_manager && \
			echo "Running ruff check..." && \
			uv run ruff check . --fix
start:
		docker compose up -d

install: .env
		@poetry install

shell: install
		@poetry shell

.env:
		@test ! -f .env && cp .env.example .env

migrate:
		@poetry run python manage.py migrate

setup: migrate
		@echo Create a super user
		@poetry run python manage.py createsuperuser

transprepare:
		@poetry run django-admin makemessages

transcompile:
		@poetry run django-admin compilemessages

secretkey:
		@poetry run python -c 'from django.utils.crypto import get_random_string; print(get_random_string(40))'
		
test:
		DB_USER="postgres" DB_PASSWORD="postgres" poetry run python ./manage.py test -v 2

.PHONY: poetry-export-prod
poetry-export-prod:
		@poetry export -f requirements.txt -o requirements.txt --without-hashes

.PHONY: poetry-export-dev
poetry-export-dev: poetry-export-prod
		@poetry export -f requirements.txt -o requirements.txt --with dev --without-hashes