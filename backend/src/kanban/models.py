from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

POSITION_DEFAULT = Decimal("1")


class ActiveColumnManager(models.Manager["Column"]):
    def get_queryset(self) -> models.QuerySet["Column"]:
        return super().get_queryset().filter(archived_at__isnull=True)


class ActiveCardManager(models.Manager["Card"]):
    def get_queryset(self) -> models.QuerySet["Card"]:
        return (
            super()
            .get_queryset()
            .filter(
                archived_at__isnull=True,
                column__archived_at__isnull=True,
            )
        )


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


class ActiveBoardManager(models.Manager["Board"]):
    def get_queryset(self) -> models.QuerySet["Board"]:
        return super().get_queryset().filter(archived_at__isnull=True)


class Board(TimestampedModel):
    name = models.CharField(max_length=200)
    icon = models.CharField(max_length=50, blank=True, default="📋")
    color = models.CharField(max_length=9, blank=True, default="#2563eb")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="boards",
        null=True,
        blank=True,
    )
    is_inbox = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)

    objects = ActiveBoardManager()
    with_archived = models.Manager()

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner"],
                condition=models.Q(is_inbox=True),
                name="unique_inbox_board_per_owner",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return self.name


class Column(TimestampedModel):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="columns")
    name = models.CharField(max_length=200)
    icon = models.CharField(max_length=50, blank=True, default="")
    position = models.DecimalField(max_digits=20, decimal_places=10, default=POSITION_DEFAULT)
    is_default = models.BooleanField(default=False)
    is_done = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)

    objects = ActiveColumnManager()
    with_archived = models.Manager()

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["board", "position"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.board_id}:{self.name}"


class Label(TimestampedModel):
    name = models.CharField(max_length=100, unique=True)
    color = models.CharField(max_length=9, blank=True, default="")

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:  # pragma: no cover
        return self.name


class CardPriority(models.IntegerChoices):
    NONE = 0, "Без приоритета"
    LOW = 1, "Можно позже"
    NORMAL = 2, "Важно"
    HIGH = 3, "Срочно"


class RecurrenceFrequency(models.TextChoices):
    DAILY = "daily", "Daily"
    WEEKLY = "weekly", "Weekly"
    MONTHLY = "monthly", "Monthly"
    YEARLY = "yearly", "Yearly"


class AttachmentType(models.TextChoices):
    FILE = "file", "File"
    LINK = "link", "Link"
    PHOTO = "photo", "Photo"


class Card(TimestampedModel):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="cards")
    column = models.ForeignKey(Column, on_delete=models.CASCADE, related_name="cards")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="subtasks",
        null=True,
        blank=True,
    )
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
    priority = models.IntegerField(
        choices=CardPriority.choices,
        default=CardPriority.NORMAL,
    )
    labels = models.ManyToManyField(Label, blank=True, related_name="cards")
    position = models.DecimalField(max_digits=20, decimal_places=10, default=POSITION_DEFAULT)
    archived_at = models.DateTimeField(null=True, blank=True)
    parent_recurrence = models.ForeignKey(
        "RecurrenceRule",
        on_delete=models.SET_NULL,
        related_name="generated_cards",
        null=True,
        blank=True,
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="completed_cards",
        null=True,
        blank=True,
    )
    is_shopping_list = models.BooleanField(default=False)

    objects = ActiveCardManager()
    with_archived = models.Manager()

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["column", "position"]),
            models.Index(fields=["parent", "position"]),
            models.Index(fields=["parent_recurrence", "created_at"]),
            models.Index(fields=["assignee", "deadline"], name="card_assignee_deadline_idx"),
            models.Index(fields=["column", "archived_at"], name="card_column_archived_idx"),
            models.Index(fields=["priority", "deadline"], name="card_priority_deadline_idx"),
            models.Index(
                fields=["board", "completed_at", "deadline"],
                name="card_completed_deadline_idx",
            ),
        ]

    def save(self, *args: Any, **kwargs: Any) -> None:
        # Ensure denormalized board stays in sync with column.board
        if self.column_id:
            self.board = self.column.board
        if self.is_shopping_list:
            # At most one card is pinned as the shared shopping checklist.
            Card.with_archived.filter(is_shopping_list=True).exclude(pk=self.pk).update(
                is_shopping_list=False
            )
        super().save(*args, **kwargs)

    def clean(self) -> None:
        super().clean()
        if not self.parent_id:
            return
        from django.core.exceptions import ValidationError

        if self.pk and self.parent_id == self.pk:
            raise ValidationError({"parent": "A card cannot be its own parent."})
        if self.parent and self.parent.parent_id is not None:
            raise ValidationError({"parent": "Only two subtask levels are allowed."})


class InboxSchedule(TimestampedModel):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="inbox_schedules",
    )
    target_column = models.ForeignKey(
        Column,
        on_delete=models.CASCADE,
        related_name="inbox_schedules",
    )
    move_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    moved_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["move_at", "id"]
        indexes = [
            models.Index(fields=["status", "move_at"]),
            models.Index(fields=["user", "status", "move_at"]),
        ]


class RecurrenceRule(TimestampedModel):
    card = models.OneToOneField(Card, on_delete=models.CASCADE, related_name="recurrence_rule")
    freq = models.CharField(max_length=12, choices=RecurrenceFrequency.choices)
    interval = models.PositiveIntegerField(default=1)
    byweekday = models.JSONField(default=list, blank=True)
    byday = models.PositiveIntegerField(null=True, blank=True)
    bysetpos = models.SmallIntegerField(null=True, blank=True)
    until = models.DateField(null=True, blank=True)
    count = models.PositiveIntegerField(null=True, blank=True)
    generated_count = models.PositiveIntegerField(default=0)
    next_due = models.DateTimeField(null=True, blank=True)
    last_generated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["next_due"]),
            models.Index(fields=["freq"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"recurrence:{self.card_id}:{self.freq}"


class Attachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="attachments")
    name = models.CharField(max_length=255)
    type = models.CharField(
        max_length=10,
        choices=AttachmentType.choices,
        default=AttachmentType.FILE,
    )
    url = models.URLField(max_length=2000, blank=True, default="")
    path = models.CharField(max_length=1000, blank=True, default="")
    mime = models.CharField(max_length=255, blank=True, default="")
    size = models.PositiveBigIntegerField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="uploaded_attachments",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["card", "created_at"]),
            models.Index(fields=["uploaded_by", "created_at"]),
            models.Index(fields=["type", "created_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"attachment:{self.card_id}:{self.name}"


class ChecklistItem(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="checklist_items")
    text = models.CharField(max_length=1000)
    done = models.BooleanField(default=False)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["card", "position"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"card:{self.card_id}:{self.text[:40]}"


class NotificationChannel(models.TextChoices):
    EMAIL = "email", "Email"
    TELEGRAM = "telegram", "Telegram"
    PUSH = "push", "Push"


class NotificationEventType(models.TextChoices):
    BOARD_CREATED = "board.created", "Board created"
    BOARD_UPDATED = "board.updated", "Board updated"
    BOARD_DELETED = "board.deleted", "Board deleted"
    CARD_CREATED = "card.created", "Card created"
    CARD_UPDATED = "card.updated", "Card updated"
    CARD_DELETED = "card.deleted", "Card deleted"
    CARD_COMPLETED = "card.completed", "Card completed"
    COMMENT_CREATED = "comment.created", "Comment created"
    CARD_DEADLINE_REMINDER = "card.deadline_reminder", "Card deadline reminder"


class CardComment(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="card_comments",
    )
    text = models.TextField()
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["card", "created_at"]),
            models.Index(fields=["author", "created_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"comment:{self.card_id}:{self.author_id}"


class CardActivity(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="card_activities",
    )
    action = models.CharField(max_length=50)
    before = models.JSONField(default=dict, blank=True)
    after = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["card", "created_at"]),
            models.Index(fields=["actor", "created_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"activity:{self.card_id}:{self.action}"


class NotificationProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    email = models.EmailField(blank=True, default="")
    telegram_chat_id = models.CharField(max_length=64, blank=True, default="")
    onesignal_player_id = models.CharField(max_length=200, blank=True, default="")
    fcm_token = models.CharField(max_length=512, blank=True, default="")
    unifiedpush_endpoint = models.URLField(max_length=1000, blank=True, default="")
    timezone = models.CharField(max_length=64, blank=True, default="UTC")
    timezone_configured = models.BooleanField(default=False)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:  # pragma: no cover
        return f"profile:{self.user_id}"


class PushDevice(TimestampedModel):
    """One push destination belonging to one user.

    Replaces the single `NotificationProfile.fcm_token` field: a person has a
    phone, a tablet and a laptop browser, and every one of them needs its own
    subscription. Registering a new device must never silently unregister
    another.

    Two kinds live side by side. `webpush` is the primary one — a W3C Push API
    subscription, where `endpoint` is the push service URL and `p256dh`/`auth`
    are the client's encryption keys. `fcm` is the legacy Android app channel,
    where only `token` is set.
    """

    class Kind(models.TextChoices):
        WEBPUSH = "webpush", "Web Push"
        FCM = "fcm", "Firebase Cloud Messaging"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_devices",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.WEBPUSH)

    # Web Push subscription (kind=webpush).
    endpoint = models.URLField(max_length=1000, blank=True, default="")
    p256dh = models.CharField(max_length=200, blank=True, default="")
    auth = models.CharField(max_length=100, blank=True, default="")

    # FCM registration token (kind=fcm).
    token = models.CharField(max_length=512, blank=True, default="")

    # Human-readable hint so a person can tell their devices apart when
    # revoking one ("Chrome на Android").
    label = models.CharField(max_length=120, blank=True, default="")

    # A device is retired only when the push service tells us the subscription
    # is gone (404/410). Everything else is a transient failure and must not
    # cost the user their subscription.
    active = models.BooleanField(default=True)

    last_success_at = models.DateTimeField(null=True, blank=True)
    last_failure_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    failure_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["user_id", "-id"]
        constraints = [
            # The push service endpoint is globally unique, so re-subscribing
            # the same browser updates the row instead of duplicating it.
            models.UniqueConstraint(
                fields=["endpoint"],
                condition=models.Q(kind="webpush"),
                name="uniq_push_device_webpush_endpoint",
            ),
            models.UniqueConstraint(
                fields=["token"],
                condition=models.Q(kind="fcm"),
                name="uniq_push_device_fcm_token",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "active"]),
            models.Index(fields=["kind", "active"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"push_device:{self.user_id}:{self.kind}:{self.pk}"

    @property
    def destination(self) -> str:
        return self.endpoint if self.kind == self.Kind.WEBPUSH else self.token


class DispatcherHeartbeat(models.Model):
    """Last time the notification dispatcher completed a pass.

    Exists so that "no notifications arrived" can be distinguished from "no
    notifications were due". Without it a dead dispatcher is indistinguishable
    from a quiet week, which is exactly how four days of silence went
    unnoticed. Read by the health endpoint.
    """

    name = models.CharField(max_length=50, unique=True, default="dispatcher")
    last_tick_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    ticks = models.PositiveBigIntegerField(default=0)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:  # pragma: no cover
        return f"heartbeat:{self.name}:{self.last_tick_at}"


class NotificationPreference(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    board = models.ForeignKey(Board, on_delete=models.CASCADE, null=True, blank=True)
    channel = models.CharField(max_length=20, choices=NotificationChannel.choices)
    event_type = models.CharField(max_length=50, choices=NotificationEventType.choices)
    enabled = models.BooleanField(default=True)

    class Meta:
        ordering = ["user_id", "board_id", "channel", "event_type"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "board", "channel", "event_type"],
                condition=models.Q(board__isnull=False),
                name="uniq_notification_pref_board",
            ),
            models.UniqueConstraint(
                fields=["user", "channel", "event_type"],
                condition=models.Q(board__isnull=True),
                name="uniq_notification_pref_global",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "board"]),
            models.Index(fields=["event_type", "channel"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        suffix = f"board:{self.board_id}" if self.board_id else "global"
        return f"{self.user_id}:{suffix}:{self.channel}:{self.event_type}"


class NotificationEvent(models.Model):
    event_type = models.CharField(max_length=50, choices=NotificationEventType.choices)
    # Optional idempotency key to prevent duplicate notification events on retries/double-clicks.
    # If provided, must be globally unique.
    dedupe_key = models.CharField(max_length=200, null=True, blank=True, unique=True)
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

    # --- transactional outbox ---
    #
    # The row is written inside the same transaction as the change that caused
    # it, and the dispatcher polls for PENDING rows afterwards. That is the
    # whole point: handing the event to a broker in `transaction.on_commit()`
    # loses it without a trace whenever the broker is unreachable at that
    # instant, because the transaction has already been committed.
    class Dispatch(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        DONE = "done", "Done"
        FAILED = "failed", "Failed"

    dispatch_status = models.CharField(
        max_length=20,
        choices=Dispatch.choices,
        default=Dispatch.PENDING,
    )
    dispatch_attempts = models.PositiveIntegerField(default=0)
    # When the dispatcher may next pick this row up. Set to `created_at` on
    # insert and pushed forward with exponential backoff after each failure.
    next_attempt_at = models.DateTimeField(default=timezone.now)
    dispatch_started_at = models.DateTimeField(null=True, blank=True)
    dispatch_error = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["event_type", "created_at"]),
            models.Index(fields=["board", "created_at"]),
            # The dispatcher's hot query: pending work that is due.
            models.Index(fields=["dispatch_status", "next_attempt_at"]),
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


class NotificationInboxEntry(models.Model):
    event = models.ForeignKey(
        NotificationEvent,
        on_delete=models.CASCADE,
        related_name="inbox_entries",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_inbox",
    )
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ["-created_at", "-id"]
        unique_together = ["event", "user"]
        indexes = [
            models.Index(fields=["user", "read_at", "created_at"]),
            models.Index(fields=["event", "user"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"inbox:{self.user_id}:{self.event_id}"


class CardDeadlineReminder(TimestampedModel):
    """Per-user reminder relative to card.deadline.

    Reminder is personal: only the user who configured it receives it.
    """

    class Unit(models.TextChoices):
        MINUTES = "minutes", "Minutes"
        HOURS = "hours", "Hours"

    class Status(models.TextChoices):
        DISABLED = "disabled", "Disabled"
        SCHEDULED = "scheduled", "Scheduled"
        DISPATCHED = "dispatched", "Dispatched"
        SENT = "sent", "Sent"
        SKIPPED = "skipped", "Skipped"
        FAILED = "failed", "Failed"
        INVALID_NO_DEADLINE = "invalid.no_deadline", "Invalid: no deadline"
        INVALID_PAST = "invalid.past", "Invalid: time in past"
        INVALID_CHANNEL = "invalid.channel", "Invalid: channel unavailable"

    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="deadline_reminders")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="card_deadline_reminders",
    )

    order = models.PositiveIntegerField(default=1)

    enabled = models.BooleanField(default=False)

    offset_value = models.PositiveIntegerField(default=20)
    offset_unit = models.CharField(
        max_length=10,
        choices=Unit.choices,
        default=Unit.MINUTES,
    )

    # Chosen delivery channel (optional):
    # - null/blank => auto (only possible when there is exactly one available channel)
    # - email / telegram => explicit
    channel = models.CharField(
        max_length=20,
        choices=NotificationChannel.choices,
        null=True,
        blank=True,
    )

    # Scheduling
    scheduled_at = models.DateTimeField(null=True, blank=True)
    schedule_token = models.UUIDField(null=True, blank=True, editable=False)

    # Result tracking
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.DISABLED)
    last_error = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)

    # Retry bookkeeping. Celery used to own this; now the row does, so a
    # restart of the dispatcher cannot forget how many attempts were made.
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["scheduled_at"]),
            models.Index(fields=["card", "user"]),
            models.Index(fields=["status", "scheduled_at"]),
        ]

    def offset_minutes(self) -> int:
        if self.offset_unit == self.Unit.HOURS:
            return int(self.offset_value) * 60
        return int(self.offset_value)


class CardDeadlineReminderDelivery(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    # Global idempotency key for a single reminder send attempt.
    dedupe_key = models.CharField(max_length=200, unique=True)

    reminder = models.ForeignKey(
        CardDeadlineReminder,
        on_delete=models.CASCADE,
        related_name="deliveries",
    )
    card = models.ForeignKey(Card, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    channel = models.CharField(max_length=20, choices=NotificationChannel.choices)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    error = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["reminder", "status"]),
            models.Index(fields=["user", "channel"]),
        ]


class SiteSettings(models.Model):
    class OverdueReminderInterval(models.IntegerChoices):
        FIVE_MINUTES = 5, "5 минут"
        TEN_MINUTES = 10, "10 минут"
        THIRTY_MINUTES = 30, "30 минут"
        ONE_HOUR = 60, "1 час"

    overdue_reminder_interval = models.IntegerField(
        choices=OverdueReminderInterval.choices,
        default=OverdueReminderInterval.THIRTY_MINUTES,
        verbose_name="Интервал повторяющихся напоминаний",
    )

    class Meta:
        verbose_name = "Настройки сайта"
        verbose_name_plural = "Настройки сайта"

    def __str__(self) -> str:  # pragma: no cover
        return "SiteSettings"

    def save(self, *args: Any, **kwargs: Any) -> None:
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> SiteSettings:
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
