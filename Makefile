VERSION_FILE := version.txt
PYTHON ?= py -3

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
	@$(PYTHON) -c "from pathlib import Path; print(Path(r'$(VERSION_FILE)').read_text(encoding='utf-8').strip())"

sync-version:
	$(PYTHON) scripts/sync_version.py

set-version:
	@$(PYTHON) -c "import sys; from pathlib import Path; value = r'$(NEW_VERSION)'; (sys.stderr.write('NEW_VERSION is required\n'), sys.exit(1)) if not value else Path(r'$(VERSION_FILE)').write_text(value + '\n', encoding='utf-8')"
	$(MAKE) sync-version

release-tag:
	@$(PYTHON) -c "import subprocess; from pathlib import Path; version = Path(r'$(VERSION_FILE)').read_text(encoding='utf-8').strip(); subprocess.run(['git', 'tag', f'v{version}'], check=True)"
