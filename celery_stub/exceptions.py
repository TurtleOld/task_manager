"""Minimal Celery exceptions shim for tests."""


class CeleryError(Exception):
    """Base exception used in the project when Celery tasks fail."""


__all__ = ['CeleryError']
