SHELL := /usr/bin/zsh
VERSION_FILE := version.txt
VERSION := $(shell tr -d '\n' < $(VERSION_FILE))

.PHONY: uv-venv uv-sync dev migrate run lint typecheck test openapi-export version sync-version set-version release-tag

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

openapi-export:
	cd backend && uv run python manage.py spectacular --file openapi.json

version:
	@printf '%s\n' "$(VERSION)"

sync-version:
	python3 scripts/sync_version.py

set-version:
	@test -n "$(NEW_VERSION)" || (printf '%s\n' 'NEW_VERSION is required' >&2; exit 1)
	@printf '%s\n' "$(NEW_VERSION)" > $(VERSION_FILE)
	$(MAKE) sync-version

release-tag:
	git tag "v$(VERSION)"
