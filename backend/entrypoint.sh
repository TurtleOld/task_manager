#!/bin/sh
# POSIX entrypoint for Django backend containers.
# - Creates required directories idempotently
# - Optionally generates manage.py if missing
# - Validates filesystem write access (with best-effort fixes when running as root)
# - Executes the provided command via exec for proper signal handling

set -eu

# Enable pipefail when the current /bin/sh supports it (not POSIX, but common)
if (set -o pipefail) 2>/dev/null; then
  set -o pipefail
fi

log() {
  # shellcheck disable=SC2039
  printf '%s\n' "entrypoint: $*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

is_root() {
  [ "$(id -u 2>/dev/null || echo 1)" -eq 0 ]
}

# Best-effort chown/chmod helpers. Never fail the script directly.
maybe_fix_perms() {
  _path="$1"

  if ! is_root; then
    return 0
  fi

  # Optional: user can provide desired ownership as numeric ids.
  # Example: APP_UID=1000 APP_GID=1000
  _uid="${APP_UID:-}"
  _gid="${APP_GID:-}"

  if [ -n "$_uid" ] && [ -n "$_gid" ]; then
    log "Attempting: chown -R ${_uid}:${_gid} '${_path}'"
    chown -R "${_uid}:${_gid}" "${_path}" 2>/dev/null || true
  fi

  # Ensure current user (root) can write; and group can write when applicable.
  chmod u+rwX,g+rwX "${_path}" 2>/dev/null || true
}

ensure_dir() {
  _dir="$1"

  if [ -z "$_dir" ]; then
    die "ensure_dir: empty path"
  fi

  if [ -d "$_dir" ]; then
    return 0
  fi

  # Try create (idempotent)
  if mkdir -p "$_dir" 2>/dev/null; then
    return 0
  fi

  # If failed, attempt best-effort permission fixes on the closest existing parent.
  _parent="$_dir"
  while [ "$_parent" != "/" ] && [ ! -d "$_parent" ]; do
    _parent=$(dirname "$_parent")
  done
  maybe_fix_perms "$_parent"

  mkdir -p "$_dir" 2>/dev/null || die "Cannot create directory: ${_dir} (check volume mount and permissions)"
}

assert_writable_dir() {
  _dir="$1"

  [ -d "$_dir" ] || die "Not a directory: ${_dir}"

  # Try to create a file. `test -w` is not sufficient for all mount/ACL cases.
  _probe="${_dir}/.write_probe.$$"

  if ( : >"$_probe" ) 2>/dev/null; then
    rm -f "$_probe" 2>/dev/null || true
    return 0
  fi

  maybe_fix_perms "$_dir"

  if ( : >"$_probe" ) 2>/dev/null; then
    rm -f "$_probe" 2>/dev/null || true
    return 0
  fi

  if is_root; then
    die "Directory is not writable even as root: ${_dir} (possibly mounted read-only)"
  fi

  die "Directory is not writable: ${_dir} (check mount is not read-only and user permissions)"
}

write_file_if_missing() {
  _path="$1"
  _mode="$2"

  if [ -f "$_path" ]; then
    return 0
  fi

  ensure_dir "$(dirname "$_path")"

  # Refuse to overwrite anything that exists (dir/symlink/etc.)
  if [ -e "$_path" ]; then
    die "Path exists but is not a regular file (won't overwrite): ${_path}"
  fi

  # Create with safe permissions (umask respected)
  umask 022

  # Create via temp file + atomic rename
  _tmp="${_path}.tmp.$$"
  cat >"$_tmp" || die "Failed to write temporary file: ${_tmp}"
  chmod "$_mode" "$_tmp" 2>/dev/null || true
  mv "$_tmp" "$_path" || die "Failed to move ${_tmp} -> ${_path}"
}

# ---- configuration ----

# Container project root where manage.py and src/ live.
APP_ROOT="${APP_ROOT:-/backend}"
MANAGE_PY_PATH="${MANAGE_PY_PATH:-${APP_ROOT}/manage.py}"

# Directories that are commonly required for Django apps.
SRC_DIR="${SRC_DIR:-${APP_ROOT}/src}"
STATIC_DIR="${STATIC_DIR:-${APP_ROOT}/static}"
MEDIA_DIR="${MEDIA_DIR:-${APP_ROOT}/media}"
LOGS_DIR="${LOGS_DIR:-${APP_ROOT}/logs}"
TMP_DIR="${TMP_DIR:-${APP_ROOT}/tmp}"

# ---- filesystem preparation ----

log "Using APP_ROOT='${APP_ROOT}'"
ensure_dir "${APP_ROOT}"

# Must-have project directory
ensure_dir "${SRC_DIR}"

# Typical Django dirs (idempotent)
ensure_dir "${STATIC_DIR}"
ensure_dir "${MEDIA_DIR}"
ensure_dir "${LOGS_DIR}"
ensure_dir "${TMP_DIR}"

# Validate writability (can be disabled for fully read-only images)
if [ "${SKIP_WRITABLE_CHECKS:-0}" != "1" ]; then
  assert_writable_dir "${SRC_DIR}"
  assert_writable_dir "${STATIC_DIR}"
  assert_writable_dir "${MEDIA_DIR}"
  assert_writable_dir "${LOGS_DIR}"
  assert_writable_dir "${TMP_DIR}"
fi

# Generate manage.py when missing (do not overwrite)
if [ ! -f "${MANAGE_PY_PATH}" ]; then
  log "manage.py not found at '${MANAGE_PY_PATH}', generating a minimal Django manage.py"
  # shellcheck disable=SC2317
  write_file_if_missing "${MANAGE_PY_PATH}" 0755 <<'PY'
#!/usr/bin/env python3
"""Django's command-line utility for administrative tasks."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> None:
    base_dir = Path(__file__).resolve().parent

    # Common layout: project sources are in ./src
    src_dir = base_dir / "src"
    if src_dir.is_dir():
        sys.path.insert(0, str(src_dir))

    settings_module = os.environ.get("DJANGO_SETTINGS_MODULE", "config.settings")
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", settings_module)

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and available on your PYTHONPATH environment variable? "
            "Did you forget to activate a virtual environment?"
        ) from exc

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
PY
fi

# Ensure manage.py is readable/executable
if [ ! -r "${MANAGE_PY_PATH}" ]; then
  die "manage.py exists but is not readable: ${MANAGE_PY_PATH}"
fi
if [ ! -x "${MANAGE_PY_PATH}" ]; then
  chmod +x "${MANAGE_PY_PATH}" 2>/dev/null || true
fi

# ---- hand off to CMD ----

if [ "$#" -eq 0 ]; then
  die "No command provided. Pass a command via Docker CMD, e.g. 'python /backend/manage.py runserver 0.0.0.0:8000'"
fi

log "Starting: $*"
exec "$@"
