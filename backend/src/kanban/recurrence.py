from __future__ import annotations

from .models import Card

# A series that outgrows this is cut off rather than walked forever; reaching it
# means a corrupted chain, not a real recurrence history.
MAX_SERIES_LENGTH = 100_000


def find_current_card_id(card_id: int) -> int:
    """Follow the series from `card_id` to its last instance (the one with no successor)."""
    for _ in range(MAX_SERIES_LENGTH):
        successor_id = (
            Card.objects.filter(parent_recurrence__card_id=card_id)
            .order_by("id")
            .values_list("id", flat=True)
            .first()
        )
        if successor_id is None:
            return card_id
        card_id = successor_id
    return card_id
