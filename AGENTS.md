# AGENTS

## Release Versioning

- Releases are fully automated by release-please (`.github/workflows/release-please.yml`, `release-please-config.json`, `.release-please-manifest.json`).
- Never bump versions or create release tags manually: release-please opens a release PR per component; merging it updates version files, CHANGELOG.md, and creates the tag.
- Versions are derived from conventional commit messages on `main`: `fix:` bumps patch, `feat:` bumps minor, `feat!:`/`BREAKING CHANGE:` bumps major. Commits of other types (`chore:`, `refactor:`, `docs:`, ...) do not trigger a release.
- Components:
  - Root (backend/frontend): version in `version.txt`, mirrored into `frontend/package.json`, `backend/pyproject.toml`, and `backend/src/config/settings.py` (line annotated with `x-release-please-version`). Tag format: `v<version>`. Commits under `android/` are excluded.
  - Android: version in `android/version.txt`, mirrored into `android/app/build.gradle.kts` `versionName` (line annotated with `x-release-please-version`). Tag format: `android-v<version>`. Only commits under `android/` count.
- The `v<version>` tag triggers Docker image build/push for backend, celery, and frontend; the `android-v<version>` tag triggers the Android APK release.
- `versionCode` in `android/app/build.gradle.kts` is derived from `versionName` (`major*10000 + minor*100 + patch`), so every release-please version bump automatically produces an increasing `versionCode`.

## Commit Style

- Use Conventional Commits for all commits and PR titles that may become merge commits on `main`: `type(scope): summary`.
- Prefer `fix:` for bug fixes, `feat:` for user-facing features, `docs:` for documentation-only changes, `refactor:` for behavior-preserving code changes, `test:` for tests, `ci:` for CI/workflow-only changes, and `chore:` for maintenance.
- Use `fix(android): ...` or `feat(android): ...` for Android changes that should trigger an Android release; use `fix:` or `feat:` without the `android` scope for root backend/frontend releases.
- When using squash merge, ensure the final PR title is a valid Conventional Commit, because it becomes the commit message on `main`.

## Code Style

- Keep Python lines at 80 characters when practical; the lint limit is 81 characters.

## Android Testing

- Before Android verification, ensure backend API is running and the mobile app points to the same environment as the backend used for manual testing.
- Preferred pre-flight checks before mobile testing: run `npm run typecheck` and `npm run lint` in `frontend/`, then run backend card-related tests in an environment where backend dev dependencies are installed.
- If `frontend` build is needed, use a writable workspace; current build may fail if `frontend/tsconfig.tsbuildinfo` cannot be created because of filesystem permissions.
- Manual regression for newly created task flow on Android:
  1. Open a board in the Android app.
  2. Create a task in any column.
  3. Tap the new task immediately without restarting the app.
  4. Verify the task details modal/screen opens without `404` and shows the task description area.
  5. Edit and save the same task, close it, and reopen it again from the board.
  6. Restart the Android app and verify the same task still opens correctly after fresh sync.
- If the issue is related to optimistic UI or real-time sync, specifically verify that the newly created task receives a real backend `id` before card-specific requests are sent.

## Environment Details Format

Use and preserve this format when environment context is provided by the user:

```xml
<environment_details>
Current time: 2026-04-06T21:48:31+03:00
Active file: backend/src/kanban/models.py
Visible files:
  backend/src/kanban/models.py
Open tabs:
  backend/src/kanban/models.py
</environment_details>
```
