from __future__ import annotations

from typing import Any

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..inbox import get_or_create_user_inbox, serialize_inbox, serialize_inbox_schedule
from ..models import Card, Column, InboxSchedule
from ..serializers import CardSerializer


class InboxView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response(serialize_inbox(request.user))

    def post(self, request: Request) -> Response:
        _board, column = get_or_create_user_inbox(request.user)
        payload: dict[str, Any] = request.data or {}
        data = {
            "column": column.id,
            "title": payload.get("title"),
            "description": payload.get("description", ""),
        }
        for field in ["deadline", "priority", "labels", "checklist"]:
            if field in payload:
                data[field] = payload[field]

        serializer = CardSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        card = serializer.save()
        card = (
            Card.objects.select_related("board", "column")
            .prefetch_related("labels", "checklist_items", "attachments")
            .get(pk=card.pk)
        )
        return Response(CardSerializer(card).data, status=status.HTTP_201_CREATED)


class InboxScheduleView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request) -> Response:
        target_column_id = request.data.get("target_column")
        move_at = request.data.get("move_at")
        if not target_column_id or not move_at:
            return Response(
                {"detail": "target_column and move_at are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_column = (
            Column.objects.select_related("board")
            .filter(pk=target_column_id, board__is_inbox=False)
            .first()
        )
        if target_column is None:
            return Response(
                {"detail": "Target column not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            parsed_move_at = timezone.datetime.fromisoformat(
                str(move_at).replace("Z", "+00:00"),
            )
        except ValueError:
            return Response(
                {"detail": "move_at must be a valid datetime."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if timezone.is_naive(parsed_move_at):
            parsed_move_at = timezone.make_aware(parsed_move_at, timezone.get_current_timezone())
        if parsed_move_at <= timezone.now():
            return Response(
                {"detail": "move_at must be in the future."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule = InboxSchedule.objects.create(
            user=request.user,
            target_column=target_column,
            move_at=parsed_move_at,
        )
        return Response(serialize_inbox_schedule(schedule), status=status.HTTP_201_CREATED)


class InboxScheduleDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request: Request, pk: int) -> Response:
        schedule = (
            InboxSchedule.objects.select_related("target_column", "target_column__board")
            .filter(
                pk=pk,
                user=request.user,
                status=InboxSchedule.Status.SCHEDULED,
            )
            .first()
        )
        if schedule is None:
            return Response(
                {"detail": "Schedule not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        schedule.status = InboxSchedule.Status.CANCELLED
        schedule.save(update_fields=["status", "updated_at", "version"])
        return Response(serialize_inbox_schedule(schedule))
