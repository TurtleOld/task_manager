from __future__ import annotations

from typing import Any

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..inbox import get_or_create_user_inbox, serialize_inbox
from ..models import Card
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
        for field in ["deadline", "priority", "labels", "checklist", "attachments"]:
            if field in payload:
                data[field] = payload[field]

        serializer = CardSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        card = serializer.save()
        card = (
            Card.objects.select_related("board", "column")
            .prefetch_related("labels")
            .get(pk=card.pk)
        )
        return Response(CardSerializer(card).data, status=status.HTTP_201_CREATED)
