lint:
		@cd ./task_manager && \
			echo "Running ruff check..." && \
			poetry run ruff check . --fix

test-coverage:
		@poetry run coverage run manage.py test

start: migrate transcompile
		@poetry run python manage.py runserver 127.0.0.1:8000

install: .env
		@poetry install

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
		
heroku:
		git push heroku main
		
github:
		git push origin main

test:
		DB_USER="postgres" DB_PASSWORD="postgres" poetry run python ./manage.py test -v 2

test-coverage-report-xml:
		@poetry run coverage xml

heroku-migrate:
		heroku run python manage.py migrate

heroku-make-migrations:
		heroku run python manage.py makemigrations

coverage:
		@poetry run coverage run manage.py test
		@poetry run coverage xml
		@poetry run coverage report

.PHONY: poetry-export-prod
poetry-export-prod:
		@poetry export -f requirements.txt -o requirements.txt --without-hashes

.PHONY: poetry-export-dev
poetry-export-dev: poetry-export-prod
		@poetry export -f requirements.txt -o requirements.txt --with dev --without-hashes