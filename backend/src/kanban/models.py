from __future__ import annotations

from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone


POSITION_DEFAULT = Decimal("1")


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs) -> None:  # type: ignore[override]
        # optimistic version bump on updates
        if self.pk:
            self.version += 1
        super().save(*args, **kwargs)


class Board(TimestampedModel):
    name = models.CharField(max_length=200)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:  # pragma: no cover
        return self.name


class Column(TimestampedModel):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="columns")
    name = models.CharField(max_length=200)
    position = models.DecimalField(max_digits=20, decimal_places=10, default=POSITION_DEFAULT)

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["board", "position"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.board_id}:{self.name}"


class Card(TimestampedModel):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="cards")
    column = models.ForeignKey(Column, on_delete=models.CASCADE, related_name="cards")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    position = models.DecimalField(max_digits=20, decimal_places=10, default=POSITION_DEFAULT)

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["column", "position"]),
        ]

    def save(self, *args, **kwargs) -> None:  # type: ignore[override]
        # Ensure denormalized board stays in sync with column.board
        if self.column_id and (self.board_id != self.column.board_id):
            self.board_id = self.column.board_id
        super().save(*args, **kwargs)
