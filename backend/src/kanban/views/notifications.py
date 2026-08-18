from __future__ import annotations

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import (
    NotificationInboxEntry,
    NotificationPreference,
    NotificationProfile,
    PushDevice,
)
from ..push_delivery import send_push_to_user
from ..serializers import (
    NotificationInboxEntrySerializer,
    NotificationPreferenceSerializer,
    NotificationProfileSerializer,
)
from ..serializers_pkg.notifications import (
    PushDeviceSerializer,
    PushSubscriptionSerializer,
)
from ..webpush import webpush_configured


class NotificationProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        profile, _ = NotificationProfile.objects.get_or_create(user=request.user)
        return Response(NotificationProfileSerializer(profile).data)

    def patch(self, request: Request) -> Response:
        profile, _ = NotificationProfile.objects.get_or_create(user=request.user)
        serializer = NotificationProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class NotificationInboxView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        limit_raw = request.query_params.get("limit", "20")
        unread_only = request.query_params.get("unread_only", "false").lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        try:
            limit = max(1, min(int(limit_raw), 100))
        except (TypeError, ValueError):
            limit = 20

        queryset = NotificationInboxEntry.objects.filter(user=request.user).select_related(
            "event",
            "event__actor",
            "event__board",
            "event__column",
            "event__card",
        )
        if unread_only:
            queryset = queryset.filter(read_at__isnull=True)

        items = list(queryset[:limit])
        unread_count = NotificationInboxEntry.objects.filter(
            user=request.user,
            read_at__isnull=True,
        ).count()
        return Response(
            {
                "results": NotificationInboxEntrySerializer(items, many=True).data,
                "unread_count": unread_count,
            }
        )

    def patch(self, request: Request) -> Response:
        payload = request.data or {}
        ids = payload.get("ids")
        mark_all = bool(payload.get("mark_all"))
        queryset = NotificationInboxEntry.objects.filter(user=request.user, read_at__isnull=True)

        if mark_all:
            updated = queryset.update(read_at=timezone.now())
            return Response({"updated": updated}, status=status.HTTP_200_OK)

        if not isinstance(ids, list):
            return Response(
                {"detail": "ids must be a list or use mark_all=true"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        int_ids = [int(item) for item in ids if str(item).isdigit()]
        if not int_ids:
            return Response({"updated": 0}, status=status.HTTP_200_OK)

        updated = queryset.filter(id__in=int_ids).update(read_at=timezone.now())
        return Response({"updated": updated}, status=status.HTTP_200_OK)


class NotificationPreferenceViewSet(viewsets.ModelViewSet[NotificationPreference]):
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = NotificationPreference.objects.filter(user=self.request.user).order_by("id")
        board = self.request.query_params.get("board")
        if board:
            queryset = queryset.filter(board_id=board)
        return queryset

    def create(self, request: Request, *args: object, **kwargs: object) -> Response:
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        lookup = {
            "user": request.user,
            "board": data.get("board"),
            "channel": data["channel"],
            "event_type": data["event_type"],
        }
        try:
            with transaction.atomic():
                instance = serializer.save(user=request.user)
        except IntegrityError:
            instance = NotificationPreference.objects.get(**lookup)
            enabled = data.get("enabled")
            if enabled is not None and instance.enabled != enabled:
                instance.enabled = enabled
                instance.save(update_fields=["enabled"])
            return Response(self.get_serializer(instance).data, status=status.HTTP_200_OK)
        return Response(self.get_serializer(instance).data, status=status.HTTP_201_CREATED)


class VapidPublicKeyView(APIView):
    """Hand the browser the key it needs to create a subscription.

    Served from the backend rather than baked into the frontend bundle at
    build time, so rotating the key pair does not require rebuilding and
    redeploying the frontend image.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, _request: Request) -> Response:
        return Response(
            {
                "public_key": settings.VAPID_PUBLIC_KEY,
                "configured": webpush_configured(),
            }
        )


class PushDeviceViewSet(viewsets.ViewSet):
    """Register, list and revoke the devices that receive push notifications."""

    permission_classes = [permissions.IsAuthenticated]

    def list(self, request: Request) -> Response:
        devices = PushDevice.objects.filter(user=request.user).order_by("-id")
        return Response(PushDeviceSerializer(devices, many=True).data)

    def create(self, request: Request) -> Response:
        """Register a Web Push subscription (idempotent on endpoint).

        The same browser re-subscribing produces the same endpoint, so this
        updates the existing row instead of accumulating duplicates — and
        re-activates a device that was previously retired.
        """

        serializer = PushSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        keys = data["keys"]

        device, created = PushDevice.objects.update_or_create(
            endpoint=data["endpoint"],
            kind=PushDevice.Kind.WEBPUSH,
            defaults={
                "user": request.user,
                "p256dh": keys["p256dh"],
                "auth": keys["auth"],
                "label": data.get("label", "")[:120],
                "active": True,
                "failure_count": 0,
                "last_error": "",
            },
        )
        return Response(
            PushDeviceSerializer(device).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def destroy(self, request: Request, pk: str | None = None) -> Response:
        deleted, _ = PushDevice.objects.filter(user=request.user, pk=pk).delete()
        if not deleted:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="test")
    def test(self, request: Request) -> Response:
        """Send a test notification to every device of the current user.

        The point of this endpoint is that a person can verify delivery
        themselves, right now, instead of discovering days later that a
        deadline passed in silence.
        """

        result = send_push_to_user(
            user_id=request.user.pk,
            title="Проверка уведомлений",
            body="Если вы это видите — push работает.",
            link=settings.FRONTEND_BASE_URL,
            tag="test-notification",
            data={"eventType": "test"},
        )
        return Response(
            {
                "delivered": result.delivered,
                "sent": result.sent,
                "retired": result.retired,
                "failed": result.failed,
                "detail": result.summary(),
            },
            status=status.HTTP_200_OK if result.delivered else status.HTTP_502_BAD_GATEWAY,
        )
