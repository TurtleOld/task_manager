lint:
		@cd ./task_manager && \
			echo "Running ruff check..." && \
			uv run ruff check . --fix
start:
		docker compose up -d

install: .env
		@uv install

shell: install
		@uv shell

.env:
		@test ! -f .env && cp .env.example .env

migrate:
		@uv run python manage.py migrate

setup: migrate
		@echo Create a super user
		@uv run python manage.py createsuperuser

transprepare:
		@uv run django-admin makemessages

transcompile:
		@uv run django-admin compilemessages

secretkey:
		@uv run python -c 'from django.utils.crypto import get_random_string; print(get_random_string(40))'
		
test:
		DB_USER="postgres" DB_PASSWORD="postgres" uv run python ./manage.py test -v 2