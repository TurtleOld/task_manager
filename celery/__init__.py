"""Lightweight Celery test stub.

This minimal stub provides the parts of the public API used in the
project's test environment so that Celery does not need to be installed
for the test suite to import the configured application or shared tasks.
It intentionally mirrors the function signatures we rely on while
keeping the implementation extremely small.
"""
from __future__ import annotations

from functools import update_wrapper
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


__all__ = ['Celery', 'shared_task', 'current_app']
