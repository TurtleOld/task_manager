from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "version.txt"

TARGETS: tuple[tuple[Path, str, str], ...] = (
    (
        ROOT / "android/app/build.gradle.kts",
        r'(versionName\s*=\s*")([^"]+)(")',
        'Android versionName',
    ),
    (
        ROOT / "frontend/package.json",
        r'("version"\s*:\s*")([^"]+)(")',
        'Frontend package version',
    ),
    (
        ROOT / "backend/pyproject.toml",
        r'(^version\s*=\s*")([^"]+)(")',
        'Backend project version',
    ),
    (
        ROOT / "backend/src/config/settings.py",
        r'("VERSION"\s*:\s*")([^"]+)(")',
        'Backend API schema version',
    ),
)


def read_version() -> str:
    return VERSION_FILE.read_text(encoding="utf-8").strip()


def update_file(path: Path, pattern: str, label: str, version: str) -> None:
    content = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, rf'\g<1>{version}\g<3>', content, count=1, flags=re.MULTILINE)
    if count != 1:
        raise RuntimeError(f"Could not update {label} in {path}")
    path.write_text(updated, encoding="utf-8")


def main() -> None:
    version = read_version()
    if not version:
        raise RuntimeError(f"Version file is empty: {VERSION_FILE}")

    for path, pattern, label in TARGETS:
        update_file(path, pattern, label, version)


if __name__ == "__main__":
    main()
