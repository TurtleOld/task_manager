from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

POSITION_DEFAULT = Decimal("1")


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True

    def save(self, *args: Any, **kwargs: Any) -> None:
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
    icon = models.CharField(max_length=50, blank=True, default="")
    position = models.DecimalField(max_digits=20, decimal_places=10, default=POSITION_DEFAULT)

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["board", "position"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.board_id}:{self.name}"


class Tag(TimestampedModel):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:  # pragma: no cover
        return self.name


class Category(TimestampedModel):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:  # pragma: no cover
        return self.name


class Card(TimestampedModel):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="cards")
    column = models.ForeignKey(Column, on_delete=models.CASCADE, related_name="cards")
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="assigned_cards",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    deadline = models.DateTimeField(null=True, blank=True)
    estimate = models.CharField(max_length=100, blank=True, default="")
    priority = models.CharField(max_length=10, blank=True, default="🟡")
    tags = models.ManyToManyField(Tag, blank=True, related_name="cards")
    categories = models.ManyToManyField(Category, blank=True, related_name="cards")
    checklist = models.JSONField(default=list, blank=True)
    attachments = models.JSONField(default=list, blank=True)
    position = models.DecimalField(max_digits=20, decimal_places=10, default=POSITION_DEFAULT)

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["column", "position"]),
        ]

    def save(self, *args: Any, **kwargs: Any) -> None:
        # Ensure denormalized board stays in sync with column.board
        if self.column_id:
            self.board = self.column.board
        super().save(*args, **kwargs)


class NotificationChannel(models.TextChoices):
    EMAIL = "email", "Email"
    TELEGRAM = "telegram", "Telegram"


class NotificationEventType(models.TextChoices):
    BOARD_CREATED = "board.created", "Board created"
    BOARD_UPDATED = "board.updated", "Board updated"
    BOARD_DELETED = "board.deleted", "Board deleted"
    COLUMN_CREATED = "column.created", "Column created"
    COLUMN_UPDATED = "column.updated", "Column updated"
    COLUMN_DELETED = "column.deleted", "Column deleted"
    CARD_CREATED = "card.created", "Card created"
    CARD_UPDATED = "card.updated", "Card updated"
    CARD_DELETED = "card.deleted", "Card deleted"
    CARD_MOVED = "card.moved", "Card moved"


class NotificationProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    email = models.EmailField(blank=True, default="")
    telegram_chat_id = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:  # pragma: no cover
        return f"profile:{self.user_id}"


class NotificationPreference(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    board = models.ForeignKey(Board, on_delete=models.CASCADE, null=True, blank=True)
    channel = models.CharField(max_length=20, choices=NotificationChannel.choices)
    event_type = models.CharField(max_length=50, choices=NotificationEventType.choices)
    enabled = models.BooleanField(default=True)

    class Meta:
        ordering = ["user_id", "board_id", "channel", "event_type"]
        unique_together = ["user", "board", "channel", "event_type"]
        indexes = [
            models.Index(fields=["user", "board"]),
            models.Index(fields=["event_type", "channel"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        suffix = f"board:{self.board_id}" if self.board_id else "global"
        return f"{self.user_id}:{suffix}:{self.channel}:{self.event_type}"


class NotificationEvent(models.Model):
    event_type = models.CharField(max_length=50, choices=NotificationEventType.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notification_events",
    )
    board = models.ForeignKey(Board, on_delete=models.SET_NULL, null=True, blank=True)
    column = models.ForeignKey(Column, on_delete=models.SET_NULL, null=True, blank=True)
    card = models.ForeignKey(Card, on_delete=models.SET_NULL, null=True, blank=True)
    summary = models.CharField(max_length=300)
    link = models.URLField(max_length=500, blank=True, default="")
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event_type", "created_at"]),
            models.Index(fields=["board", "created_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.event_type}:{self.summary}"


class NotificationDelivery(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    event = models.ForeignKey(NotificationEvent, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    channel = models.CharField(max_length=20, choices=NotificationChannel.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    error = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["user", "channel"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.event_id}:{self.user_id}:{self.channel}:{self.status}"
