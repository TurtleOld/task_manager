from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import NotificationInboxEntry, NotificationPreference, NotificationProfile
from ..serializers import (
    NotificationInboxEntrySerializer,
    NotificationPreferenceSerializer,
    NotificationProfileSerializer,
)


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
        unread_only = request.query_params.get("unread_only", "false").lower() in {"1", "true", "yes", "on"}
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
        unread_count = NotificationInboxEntry.objects.filter(user=request.user, read_at__isnull=True).count()
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
            return Response({"detail": "ids must be a list or use mark_all=true"}, status=status.HTTP_400_BAD_REQUEST)

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

    def perform_create(self, serializer: NotificationPreferenceSerializer) -> None:
        serializer.save(user=self.request.user)
