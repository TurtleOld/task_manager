# AGENTS

## Release Versioning

- Single source of truth for backend/frontend project version: `version.txt`
- Single source of truth for Android app version: `android/version.txt`
- Keep frontend and backend versions synchronized via `python3 scripts/sync_version.py`
- Keep Android version synchronized into Gradle via `python3 scripts/sync_android_version.py`
- Preferred command to update backend/frontend version: `make set-version NEW_VERSION=<version>`
- Preferred command to update Android version: `make set-android-version NEW_VERSION=<version>`
- Backend/frontend release tag format: `v<version>`
- Android release tag format: `android-v<version>`
- Docker compose release workflow reads backend/frontend project version from `version.txt`
- Android release workflow reads Android app version from `android/version.txt`

## Release Scope Rules

- If changes do not touch `android/`, update only `version.txt` with `make set-version NEW_VERSION=<version>` and use tag `v<version>`.
- If changes touch `android/`, update only `android/version.txt` with `make set-android-version NEW_VERSION=<version>` and use tag `android-v<version>`.
- Do not bump `version.txt` for Android-only changes.
- Do not bump `android/version.txt` for backend/frontend-only changes.
- The `v<version>` tag triggers Docker image build/push for backend, celery, and frontend only.
- The `android-v<version>` tag triggers Android APK release only.

## Release Order

### Backend/Frontend

1. Make code changes.
2. Run `make set-version NEW_VERSION=<version>`.
3. Commit versioned changes together with the code changes.
4. Push the commit to remote.
5. Create tag `v<version>` on that commit.
6. Push the tag to remote.

### Android

1. Make Android code changes under `android/`.
2. Run `make set-android-version NEW_VERSION=<version>`.
3. Commit Android versioned changes together with the Android code changes.
4. Push the commit to remote.
5. Create tag `android-v<version>` on that commit.
6. Push the tag to remote.

## Important Constraint

- Never push tag `v<version>` before the commit containing the same `version.txt` value is already pushed.
- Never push tag `android-v<version>` before the commit containing the same `android/version.txt` value is already pushed.
- If tag version and committed version file differ, the matching release workflow fails by design.

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
Active file: scripts/sync_version.py
Visible files:
  scripts/sync_version.py
Open tabs:
  scripts/sync_version.py
</environment_details>
```
