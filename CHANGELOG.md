# Changelog

## [1.2.13](https://github.com/TurtleOld/task_manager/compare/v1.2.12...v1.2.13) (2026-08-09)


### Bug Fixes

* не терять напоминания о дедлайнах при перезапуске воркера ([#52](https://github.com/TurtleOld/task_manager/issues/52)) ([f27ee95](https://github.com/TurtleOld/task_manager/commit/f27ee95434dedfd10a390abba765fa5e6fe3570a))

## [1.2.12](https://github.com/TurtleOld/task_manager/compare/v1.2.11...v1.2.12) (2026-07-05)


### Bug Fixes

* show reminder interval form when no reminders exist yet ([2f80d8b](https://github.com/TurtleOld/task_manager/commit/2f80d8bae21389d134053bcdee1504a245e6a88f))

## [1.2.11](https://github.com/TurtleOld/task_manager/compare/v1.2.10...v1.2.11) (2026-07-02)


### Bug Fixes

* устранить рассинхрон component в конфиге release-please ([#43](https://github.com/TurtleOld/task_manager/issues/43)) ([fce1398](https://github.com/TurtleOld/task_manager/commit/fce1398647a4ad9ef356f1107bfccb88853fabe8))

## [1.2.10](https://github.com/TurtleOld/task_manager/compare/v1.2.9...v1.2.10) (2026-07-02)


### Bug Fixes

* пропадающий push при перемещении карточки из-за таймаутов redis ([#40](https://github.com/TurtleOld/task_manager/issues/40)) ([2abac69](https://github.com/TurtleOld/task_manager/commit/2abac692c7a37f2a950b026b1e8a40eca164fd23))

## [1.2.9](https://github.com/TurtleOld/task_manager/compare/v1.2.8...v1.2.9) (2026-06-26)


### Bug Fixes

* check rolldown native binary instead of rollup in frontend image ([#37](https://github.com/TurtleOld/task_manager/issues/37)) ([2d067a7](https://github.com/TurtleOld/task_manager/commit/2d067a73096317f368f6736777f46c91ddd54c7f))

## [1.2.8](https://github.com/TurtleOld/task_manager/compare/v1.2.7...v1.2.8) (2026-06-26)


### Bug Fixes

* keep redis connections alive to restore stale pub/sub ([#35](https://github.com/TurtleOld/task_manager/issues/35)) ([8e89252](https://github.com/TurtleOld/task_manager/commit/8e89252751a2ac5ab491bd8e4312ec970593aed3))

## [1.2.7](https://github.com/TurtleOld/task_manager/compare/v1.2.6...v1.2.7) (2026-06-10)


### Bug Fixes

* **android:** derive versionCode from versionName ([59285dc](https://github.com/TurtleOld/task_manager/commit/59285dce60ab9a58d667e7414caa326caf6be2b0))
* **notifications:** deduplicate notification preferences and enforce uniqueness ([095b361](https://github.com/TurtleOld/task_manager/commit/095b36130df61bbd3e3346c299ae4cbf855e426c))
