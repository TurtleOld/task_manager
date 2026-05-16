VERSION_FILE := version.txt
ANDROID_VERSION_FILE := android/version.txt

ifeq ($(OS),Windows_NT)
PYTHON ?= py -3
else
PYTHON ?= python3
endif

.PHONY: uv-venv uv-sync dev migrate run lint typecheck test test-coverage openapi-export version android-version sync-version sync-android-version set-version set-android-version release-tag android-release-tag

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

sync-version:
	$(PYTHON) scripts/sync_version.py

sync-android-version:
	$(PYTHON) scripts/sync_android_version.py

set-version:
	@$(PYTHON) -c "import sys; from pathlib import Path; value = r'$(NEW_VERSION)'; (sys.stderr.write('NEW_VERSION is required\n'), sys.exit(1)) if not value else Path(r'$(VERSION_FILE)').write_text(value + '\n', encoding='utf-8')"
	$(MAKE) sync-version

set-android-version:
	@$(PYTHON) -c "import sys; from pathlib import Path; value = r'$(NEW_VERSION)'; (sys.stderr.write('NEW_VERSION is required\n'), sys.exit(1)) if not value else Path(r'$(ANDROID_VERSION_FILE)').write_text(value + '\n', encoding='utf-8')"
	$(MAKE) sync-android-version

release-tag:
	@$(PYTHON) -c "import subprocess; from pathlib import Path; version = Path(r'$(VERSION_FILE)').read_text(encoding='utf-8').strip(); subprocess.run(['git', 'tag', f'v{version}'], check=True)"

android-release-tag:
	@$(PYTHON) -c "import subprocess; from pathlib import Path; version = Path(r'$(ANDROID_VERSION_FILE)').read_text(encoding='utf-8').strip(); subprocess.run(['git', 'tag', f'android-v{version}'], check=True)"
