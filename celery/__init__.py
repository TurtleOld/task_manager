"""Lightweight Celery test stub.

This minimal stub provides the parts of the public API used in the
project's test environment so that Celery does not need to be installed
for the test suite to import the configured application or shared tasks.
It intentionally mirrors the function signatures we rely on while
keeping the implementation extremely small.
"""
from __future__ import annotations

from typing import Any, Callable, TypeVar

F = TypeVar('F', bound=Callable[..., Any])


class Celery:  # pragma: no cover - trivial shim
    """Very small subset of :class:`celery.Celery` API used in tests."""

    def __init__(self, name: str) -> None:
        self.main = name

    def config_from_object(self, *args: Any, **kwargs: Any) -> None:
        """Ignore configuration calls in tests."""

    def autodiscover_tasks(self, *args: Any, **kwargs: Any) -> None:
        """Ignore task discovery in tests."""

    def task(self, *args: Any, **kwargs: Any) -> Callable[[F], F]:
        """Return a decorator that leaves the function untouched."""

        def decorator(func: F) -> F:
            return func

        return decorator


def shared_task(*args: Any, **kwargs: Any) -> Callable[[F], F]:  # pragma: no cover - trivial shim
    """Decorator that simply returns the wrapped function in tests."""

    def decorator(func: F) -> F:
        return func

    return decorator
