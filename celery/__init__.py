"""Lightweight Celery test stub.

This minimal stub provides the parts of the public API used in the
project's test environment so that Celery does not need to be installed
for the test suite to import the configured application or shared tasks.
It intentionally mirrors the function signatures we rely on while
keeping the implementation extremely small.
"""
from __future__ import annotations

from datetime import timedelta
from functools import update_wrapper
import sys
import types
from typing import Any, Callable, Optional, Sequence, TypeVar

F = TypeVar('F', bound=Callable[..., Any])


current_app: Optional['Celery'] = None


class _EagerResult:  # pragma: no cover - trivial shim
    """Lightweight object mimicking Celery's async result."""

    def __init__(self, retval: Any) -> None:
        self.retval = retval

    def get(self, timeout: Optional[float] = None) -> Any:
        return self.retval


class Celery:  # pragma: no cover - trivial shim
    """Very small subset of :class:`celery.Celery` API used in tests."""

    def __init__(self, name: str) -> None:
        self.main = name
        global current_app
        current_app = self

    def config_from_object(self, *args: Any, **kwargs: Any) -> None:
        """Ignore configuration calls in tests."""

    def autodiscover_tasks(self, *args: Any, **kwargs: Any) -> None:
        """Ignore task discovery in tests."""

    def task(self, *args: Any, **kwargs: Any) -> Callable[[F], F]:
        """Decorator matching :func:`shared_task` for parity in tests."""

        if args and callable(args[0]) and not kwargs:
            return shared_task()(args[0])

        return shared_task(*args, **kwargs)


def _wrap_task(func: F) -> F:
    """Return a callable with ``delay``/``apply_async`` helpers."""

    class _TaskWrapper:  # pragma: no cover - thin delegation wrapper
        def __init__(self, wrapped: F) -> None:
            self.__wrapped__ = wrapped
            update_wrapper(self, wrapped)

        def __call__(self, *args: Any, **kwargs: Any) -> Any:
            return self.__wrapped__(*args, **kwargs)

        def delay(self, *args: Any, **kwargs: Any) -> _EagerResult:
            return _EagerResult(self.__wrapped__(*args, **kwargs))

        def apply_async(
            self,
            args: Optional[Sequence[Any]] = None,
            kwargs: Optional[dict[str, Any]] = None,
            eta: Any = None,
        ) -> _EagerResult:
            args = tuple(args or ())
            kwargs = dict(kwargs or {})
            return _EagerResult(self.__wrapped__(*args, **kwargs))

    return _TaskWrapper(func)  # type: ignore[return-value]


def shared_task(*args: Any, **kwargs: Any) -> Callable[[F], F]:  # pragma: no cover - trivial shim
    """Decorator that simply returns the wrapped function in tests."""

    def decorator(func: F) -> F:
        return _wrap_task(func)

    return decorator


class _BaseSchedule:
    """Simplified schedule base class used by the test stub."""

    def __init__(self, run_every: Optional[timedelta] = None, nowfun: Any = None, app: Any = None) -> None:
        self.run_every = run_every
        self.nowfun = nowfun
        self.app = app

    def remaining_estimate(self, last_run_at: Any) -> timedelta:
        return self.run_every or timedelta(0)

    def is_due(self, last_run_at: Any) -> tuple[bool, float]:
        return True, 0.0

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f'<{self.__class__.__name__} run_every={self.run_every!r}>'


class schedule(_BaseSchedule):
    """Mimic :class:`celery.schedules.schedule` with eager semantics."""


class crontab(_BaseSchedule):
    """Very small representation of Celery's crontab schedule."""

    def __init__(
        self,
        minute: str | int = '*',
        hour: str | int = '*',
        day_of_week: str | int = '*',
        day_of_month: str | int = '*',
        month_of_year: str | int = '*',
        nowfun: Any = None,
        app: Any = None,
    ) -> None:
        super().__init__(None, nowfun=nowfun, app=app)
        self.minute = minute
        self.hour = hour
        self.day_of_week = day_of_week
        self.day_of_month = day_of_month
        self.month_of_year = month_of_year


def maybe_make_aware(dt: Any) -> Any:
    """Return ``dt`` unchanged; awareness is irrelevant in the stub."""

    return dt


def maybe_schedule(value: Any) -> _BaseSchedule:
    """Convert plain values into ``schedule`` instances for parity."""

    if isinstance(value, _BaseSchedule):
        return value
    if isinstance(value, (int, float)):
        return schedule(timedelta(seconds=float(value)))
    return schedule(run_every=value if isinstance(value, timedelta) else None)


_schedules = types.ModuleType('celery.schedules')
_schedules.schedule = schedule
_schedules.crontab = crontab
_schedules.maybe_make_aware = maybe_make_aware
_schedules.maybe_schedule = maybe_schedule
sys.modules[__name__ + '.schedules'] = _schedules
schedules = _schedules


__all__ = ['Celery', 'shared_task', 'current_app', 'schedules']
