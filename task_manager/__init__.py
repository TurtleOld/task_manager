# This will make sure the app is always imported when
# Django starts so that shared_task will use this app.
try:
    from task_manager.taskiq import broker

    __all__ = ('broker',)
except ImportError:
    # TaskIQ not installed, skip
    __all__ = ()
