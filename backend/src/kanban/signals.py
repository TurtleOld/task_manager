from __future__ import annotations

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .inbox import get_or_create_user_inbox


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_inbox_for_user(
    sender: object,
    instance: object,
    created: bool,
    **kwargs: object,
) -> None:
    if created:
        get_or_create_user_inbox(instance)
