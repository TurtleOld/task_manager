from __future__ import annotations

from django.conf import settings
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .inbox import get_or_create_user_inbox
from .models import Card, CardActivity

TRACKED_CARD_FIELDS = ("title", "description", "deadline", "priority", "column_id", "assignee_id")


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_inbox_for_user(
    sender: object,
    instance: object,
    created: bool,
    **kwargs: object,
) -> None:
    if created:
        get_or_create_user_inbox(instance)


@receiver(pre_save, sender=Card)
def capture_card_activity(
    sender: type[Card],
    instance: Card,
    **kwargs: object,
) -> None:
    if not instance.pk:
        return
    update_fields = kwargs.get("update_fields")
    if update_fields is not None and not set(update_fields).intersection(TRACKED_CARD_FIELDS):
        return

    try:
        previous = Card.with_archived.get(pk=instance.pk)
    except Card.DoesNotExist:
        return

    before: dict[str, object] = {}
    after: dict[str, object] = {}
    for field in TRACKED_CARD_FIELDS:
        old_value = getattr(previous, field)
        new_value = getattr(instance, field)
        if old_value != new_value:
            public_name = field.removesuffix("_id")
            before[public_name] = serialize_activity_value(old_value)
            after[public_name] = serialize_activity_value(new_value)

    if not before:
        return

    actor = getattr(instance, "_activity_actor", None)
    CardActivity.objects.create(
        card=instance,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action="card.updated",
        before=before,
        after=after,
    )


def serialize_activity_value(value: object) -> object:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value
