from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..agenda import agenda_queryset, compute_agenda_boundaries
from ..models import NotificationProfile
from ..serializers import AgendaCardSerializer


class AgendaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        profile, _ = NotificationProfile.objects.get_or_create(user=request.user)
        boundaries = compute_agenda_boundaries(now=timezone.now(), tz_name=profile.timezone)

        board_id = self._parse_int(request.query_params.get("list"))
        assignee_id = self._parse_int(request.query_params.get("assignee"))

        cards = agenda_queryset(
            boundaries=boundaries,
            board_id=board_id,
            assignee_id=assignee_id,
        )

        return Response(
            {
                "boundaries": boundaries.as_dict(),
                "cards": AgendaCardSerializer(cards, many=True).data,
            }
        )

    @staticmethod
    def _parse_int(value: str | None) -> int | None:
        if value is None or value == "":
            return None
        try:
            return int(value)
        except ValueError:
            return None
