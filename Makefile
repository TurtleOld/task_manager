lint:
		poetry run flake8 task_manager task_manager/users task_manager/statuses task_manager/tasks task_manager/labels

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
		@poetry run coverage run --source='.' manage.py test

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