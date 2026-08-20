from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..agenda import (
    agenda_queryset,
    completed_queryset,
    compute_agenda_boundaries,
    family_today_people,
    family_week_progress,
    shopping_list_card,
)
from ..models import ChecklistItem, NotificationProfile
from ..serializers import AgendaCardSerializer, ChecklistItemSerializer


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


class CompletedAgendaView(APIView):
    """All-time completed tasks, newest first — backs the agenda's «Выполнено» tab."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        profile, _ = NotificationProfile.objects.get_or_create(user=request.user)
        boundaries = compute_agenda_boundaries(now=timezone.now(), tz_name=profile.timezone)

        board_id = AgendaView._parse_int(request.query_params.get("list"))
        assignee_id = AgendaView._parse_int(request.query_params.get("assignee"))

        cards = completed_queryset(board_id=board_id, assignee_id=assignee_id)

        return Response(
            {
                "boundaries": boundaries.as_dict(),
                "cards": AgendaCardSerializer(cards, many=True).data,
            }
        )


class FamilyTodayView(APIView):
    """Always family-wide — never scoped to the currently selected list."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        profile, _ = NotificationProfile.objects.get_or_create(user=request.user)
        boundaries = compute_agenda_boundaries(now=timezone.now(), tz_name=profile.timezone)

        people = family_today_people(boundaries=boundaries)
        completed, total = family_week_progress(boundaries=boundaries)
        card = shopping_list_card()

        shopping_list = None
        if card is not None:
            items = ChecklistItem.objects.filter(card=card).order_by("position", "id")
            shopping_list = {
                "card": {"id": card.id, "title": card.title, "list": card.board_id},
                "items": ChecklistItemSerializer(items, many=True).data,
            }

        return Response(
            {
                "boundaries": boundaries.as_dict(),
                "people": [
                    {
                        "user": {
                            "id": person.user_id,
                            "username": person.username,
                            "full_name": person.full_name,
                        },
                        "today_total": person.today_total,
                        "today_completed": person.today_completed,
                    }
                    for person in people
                ],
                "shopping_list": shopping_list,
                "week": {"completed": completed, "total": total},
            }
        )
