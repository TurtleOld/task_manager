from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ANDROID_VERSION_FILE = ROOT / "android/version.txt"
ANDROID_BUILD_GRADLE = ROOT / "android/app/build.gradle.kts"


def read_version() -> str:
    return ANDROID_VERSION_FILE.read_text(encoding="utf-8").strip()


def update_android_version(version: str) -> None:
    content = ANDROID_BUILD_GRADLE.read_text(encoding="utf-8")
    updated, count = re.subn(
        r'(versionName\s*=\s*")([^"]+)(")',
        rf'\g<1>{version}\g<3>',
        content,
        count=1,
        flags=re.MULTILINE,
    )
    if count != 1:
        raise RuntimeError(f"Could not update Android versionName in {ANDROID_BUILD_GRADLE}")
    ANDROID_BUILD_GRADLE.write_text(updated, encoding="utf-8")


def main() -> None:
    version = read_version()
    if not version:
        raise RuntimeError(f"Android version file is empty: {ANDROID_VERSION_FILE}")

    update_android_version(version)


if __name__ == "__main__":
    main()
