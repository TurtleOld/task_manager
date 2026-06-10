VERSION_FILE := version.txt
ANDROID_VERSION_FILE := android/version.txt

ifeq ($(OS),Windows_NT)
PYTHON ?= py -3
else
PYTHON ?= python3
endif

.PHONY: uv-venv uv-sync dev migrate run lint typecheck test test-coverage openapi-export version android-version

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
	cd backend && uv run ruff format
	cd frontend && npm run lint

typecheck:
	cd backend && uv run mypy src

test:
	cd backend && uv run pytest -q

test-coverage:
	cd backend && uv run pytest --cov=src/kanban --cov-report=term-missing --cov-report=xml

openapi-export:
	cd backend && uv run python manage.py spectacular --file openapi.json

version:
	@$(PYTHON) -c "from pathlib import Path; print(Path(r'$(VERSION_FILE)').read_text(encoding='utf-8').strip())"

android-version:
	@$(PYTHON) -c "from pathlib import Path; print(Path(r'$(ANDROID_VERSION_FILE)').read_text(encoding='utf-8').strip())"

