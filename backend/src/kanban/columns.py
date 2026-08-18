from __future__ import annotations

from decimal import Decimal

from .models import Board, Column

DEFAULT_COLUMN_NAME = "Задачи"


def get_or_create_default_column(board: Board) -> Column:
    """Return the single internal column a list's cards attach to.

    Kanban columns are no longer a product concept: there is no UI or API to
    create, view, or manage them. The `Column` table still backs `Card.column`
    (a required FK) at the database level, so every list gets one hidden
    column created lazily on first use instead of a set of default columns.
    """
    column = Column.objects.filter(board=board).order_by("position", "id").first()
    if column is not None:
        return column
    return Column.objects.create(board=board, name=DEFAULT_COLUMN_NAME, position=Decimal("1"))
