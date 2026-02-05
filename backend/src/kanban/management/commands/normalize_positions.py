from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand

from kanban.models import Card, Column


class Command(BaseCommand):
    help = "Normalize positions for columns and cards to sequential integers starting at 1"

    def handle(self, *args: object, **options: object) -> None:
        self.stdout.write("Normalizing column positions...")
        for board_id in Column.objects.values_list("board_id", flat=True).distinct():
            columns = Column.objects.filter(board_id=board_id).order_by("position", "id")
            for idx, col in enumerate(columns, start=1):
                if col.position != Decimal(idx):
                    col.position = Decimal(idx)
                    col.save(update_fields=["position"])

        self.stdout.write("Normalizing card positions...")
        for column_id in Card.objects.values_list("column_id", flat=True).distinct():
            cards = Card.objects.filter(column_id=column_id).order_by("position", "id")
            for idx, card in enumerate(cards, start=1):
                if card.position != Decimal(idx):
                    card.position = Decimal(idx)
                    card.save(update_fields=["position"])

        self.stdout.write(self.style.SUCCESS("Positions normalized."))
