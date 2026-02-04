SHELL := /usr/bin/zsh

.PHONY: uv-venv uv-sync dev migrate run lint typecheck test openapi-export

uv-venv:
	uv venv --python 3.13

uv-sync:
	cd backend && uv sync --all-extras

migrate:
	cd backend && uv run python manage.py migrate

run:
	cd backend && uv run python manage.py runserver 0.0.0.0:8000

lint:
	cd backend && uv run ruff check .

typecheck:
	cd backend && uv run mypy src

test:
	cd backend && uv run pytest -q

openapi-export:
	cd backend && uv run python manage.py spectacular --file openapi.json

