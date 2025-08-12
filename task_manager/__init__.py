# This will make sure the app is always imported when
# Django starts so that shared_task will use this app.
try:
    from .taskiq import taskiq

    __all__ = ('taskiq',)
except ImportError:
    # TaskIQ not installed, skip
    pass
