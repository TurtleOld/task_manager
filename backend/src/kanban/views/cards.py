from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
import re
from typing import Any

from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.text import get_valid_filename
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from ..broadcast import broadcast_board_event
from ..models import (
    Board,
    Card,
    CardComment,
    CardDeadlineReminder,
    CardPriority,
    ChecklistItem,
    Column,
    NotificationEventType,
    RecurrenceRule,
)
from ..notifications import create_notification_event
from ..reminders import reminder_channel_availability, upsert_and_schedule_reminder
from ..serializers import (
    CardCommentSerializer,
    CardDeadlineReminderSerializer,
    CardSerializer,
    ChecklistItemSerializer,
    RecurrenceRuleSerializer,
)

User = get_user_model()

CARD_PREFETCH_RELATED = (
    "labels",
    "checklist_items",
    "subtasks__labels",
    "subtasks__checklist_items",
    "recurrence_rule",
)


class CardViewSet(viewsets.ModelViewSet[Card]):
    queryset = (
        Card.objects.select_related("board", "column")
        .prefetch_related(*CARD_PREFETCH_RELATED)
        .all()
        .order_by("position", "id")
    )
    serializer_class = CardSerializer
    filterset_fields = ["board", "column"]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list" and (
            self.request.query_params.get("board") or self.request.query_params.get("column")
        ):
            return queryset.filter(parent__isnull=True)
        return queryset

    @action(detail=False, methods=["get"], url_path="my-today")
    def my_today(self, request: Request) -> Response:
        local_now = timezone.localtime(timezone.now())
        today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow_start = today_start + timedelta(days=1)

        base = (
            Card.objects.select_related("board", "column")
            .prefetch_related(*CARD_PREFETCH_RELATED)
            .exclude(
                Q(column__is_done=True)
                | Q(column__name__iexact="Done")
                | Q(column__name__iexact="Готово")
            )
        )
        if request.user and request.user.is_authenticated:
            base = base.filter(Q(assignee=request.user) | Q(assignee__isnull=True))

        overdue_cards = list(
            base.filter(deadline__lt=today_start).order_by("deadline", "position", "id")
        )
        today_cards = list(
            base.filter(deadline__gte=today_start, deadline__lt=tomorrow_start).order_by(
                "deadline", "position", "id"
            )
        )
        important_cards = list(
            base.filter(priority=CardPriority.HIGH).order_by("deadline", "position", "id")
        )

        board_ids = {card.board_id for card in [*overdue_cards, *today_cards, *important_cards]}
        done_columns = {
            item["board_id"]: item["id"]
            for item in Column.objects.filter(board_id__in=board_ids, is_done=True)
            .order_by("board_id", "position", "id")
            .values("board_id", "id")
        }

        def serialize(cards: list[Card]) -> list[dict[str, Any]]:
            payload = self.get_serializer(cards, many=True).data
            result: list[dict[str, Any]] = []
            for card, item in zip(cards, payload, strict=True):
                data = dict(item)
                data["board_name"] = card.board.name
                data["column_name"] = card.column.name
                data["done_column"] = done_columns.get(card.board_id)
                result.append(data)
            return result

        return Response(
            {
                "overdue": serialize(overdue_cards),
                "today": serialize(today_cards),
                "important": serialize(important_cards),
            }
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="attachments",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_attachments(self, request: Request, pk: str | None = None) -> Response:
        card_id = int(pk) if pk is not None else None
        if not card_id:
            return Response({"detail": "Card id is required"}, status=400)

        files = request.FILES.getlist("files") or request.FILES.getlist("file")
        if not files:
            return Response(
                {"detail": "No files uploaded. Use form field 'files'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            try:
                card = Card.objects.select_for_update().get(id=card_id)
            except Card.DoesNotExist:
                return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            existing = list(card.attachments or [])

            for f in files:
                attachment_id = str(uuid.uuid4())
                safe_name = get_valid_filename(getattr(f, "name", "file"))
                storage_path = f"cards/{card.id}/{attachment_id}-{safe_name}"
                saved_path = default_storage.save(storage_path, f)
                url = default_storage.url(saved_path)
                existing.append(
                    {
                        "id": attachment_id,
                        "name": safe_name,
                        "type": "file",
                        "url": url,
                        "mimeType": getattr(f, "content_type", ""),
                        "size": getattr(f, "size", None),
                        "path": saved_path,
                    }
                )

            card.attachments = existing
            card.save(update_fields=["attachments"])

        card_data = self.get_serializer(card).data
        broadcast_board_event(card.board_id, "card.updated", {"card": card_data})
        return Response(card_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["delete"], url_path=r"attachments/(?P<attachment_id>[^/]+)")
    def delete_attachment(
        self,
        request: Request,
        pk: str | None = None,
        attachment_id: str | None = None,
    ) -> Response:
        card_id = int(pk) if pk is not None else None
        if not card_id or not attachment_id:
            return Response({"detail": "Card id and attachment id are required"}, status=400)

        with transaction.atomic():
            try:
                card = Card.objects.select_for_update().get(id=card_id)
            except Card.DoesNotExist:
                return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
            existing = list(card.attachments or [])

            removed: dict[str, Any] | None = None
            kept: list[dict[str, Any]] = []
            for item in existing:
                if str(item.get("id")) == attachment_id and removed is None:
                    removed = item
                    continue
                kept.append(item)

            if removed is None:
                return Response(
                    {"detail": "Attachment not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            path = removed.get("path")
            if isinstance(path, str) and path:
                try:
                    default_storage.delete(path)
                except Exception:  # noqa: BLE001
                    pass

            card.attachments = kept
            card.save(update_fields=["attachments"])

        card_data = self.get_serializer(card).data
        broadcast_board_event(card.board_id, "card.updated", {"card": card_data})
        return Response(card_data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get", "post"], url_path="checklist")
    def checklist(self, request: Request, pk: str | None = None) -> Response:
        card = self.get_object()

        if request.method == "GET":
            items = ChecklistItem.objects.filter(card=card).order_by("position", "id")
            return Response(ChecklistItemSerializer(items, many=True).data)

        serializer = ChecklistItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        last = ChecklistItem.objects.filter(card=card).order_by("-position").first()
        position = (last.position + 1) if last else 0
        item = serializer.save(card=card, position=position)
        self._broadcast_checklist_update(card)
        return Response(ChecklistItemSerializer(item).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"checklist/(?P<item_id>[0-9]+)",
    )
    def checklist_item(
        self,
        request: Request,
        pk: str | None = None,
        item_id: str | None = None,
    ) -> Response:
        card = self.get_object()
        try:
            item = ChecklistItem.objects.get(id=int(item_id or 0), card=card)
        except ChecklistItem.DoesNotExist:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        if request.method == "DELETE":
            item.delete()
            self._broadcast_checklist_update(card)
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = ChecklistItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        self._broadcast_checklist_update(card)
        return Response(serializer.data)

    def _broadcast_checklist_update(self, card: Card) -> None:
        card = (
            Card.objects.select_related("board", "column")
            .prefetch_related(*CARD_PREFETCH_RELATED)
            .get(pk=card.pk)
        )
        broadcast_board_event(card.board_id, "card.updated", {"card": CardSerializer(card).data})

    @action(detail=True, methods=["get", "post"], url_path="subtasks")
    def subtasks(self, request: Request, pk: str | None = None) -> Response:
        parent = self.get_object()

        if request.method == "GET":
            cards = (
                self._card_queryset_for_payload().filter(parent=parent).order_by("position", "id")
            )
            return Response(self.get_serializer(cards, many=True).data)

        payload = dict(request.data or {})
        payload["parent"] = parent.id
        payload.setdefault("column", parent.column_id)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        card = serializer.save()
        self._broadcast_card_with_parent(card, "card.created")
        self._broadcast_parent_update(parent.id)
        return Response(self.get_serializer(card).data, status=status.HTTP_201_CREATED)

    def _card_queryset_for_payload(self):
        return Card.objects.select_related("board", "column").prefetch_related(
            *CARD_PREFETCH_RELATED,
        )

    def _broadcast_card_with_parent(self, card: Card, event_type: str) -> None:
        card = self._card_queryset_for_payload().get(pk=card.pk)
        broadcast_board_event(card.board_id, event_type, {"card": CardSerializer(card).data})

    def _broadcast_parent_update(self, parent_id: int | None) -> None:
        if parent_id is None:
            return
        try:
            parent = self._card_queryset_for_payload().get(pk=parent_id)
        except Card.DoesNotExist:
            return
        broadcast_board_event(
            parent.board_id,
            "card.updated",
            {"card": CardSerializer(parent).data},
        )

    @action(detail=True, methods=["get", "put", "delete"], url_path="recurrence")
    def recurrence(self, request: Request, pk: str | None = None) -> Response:
        card = self.get_object()

        if request.method == "GET":
            rule = getattr(card, "recurrence_rule", None)
            if rule is None:
                return Response(None)
            return Response(RecurrenceRuleSerializer(rule).data)

        if request.method == "DELETE":
            RecurrenceRule.objects.filter(card=card).delete()
            self._broadcast_card_with_parent(card, "card.updated")
            return Response(status=status.HTTP_204_NO_CONTENT)

        from ..tasks import calculate_next_recurrence_due  # noqa: E402

        rule = getattr(card, "recurrence_rule", None)
        serializer = RecurrenceRuleSerializer(rule, data=request.data)
        serializer.is_valid(raise_exception=True)
        next_due = calculate_next_recurrence_due(
            base=card.deadline or timezone.now(),
            freq=serializer.validated_data["freq"],
            interval=serializer.validated_data.get("interval", 1),
            byweekday=serializer.validated_data.get("byweekday", []),
            byday=serializer.validated_data.get("byday"),
        )
        saved = serializer.save(card=card, next_due=next_due)
        self._broadcast_card_with_parent(card, "card.updated")
        return Response(RecurrenceRuleSerializer(saved).data)

    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request: Request, pk: str | None = None) -> Response:
        card = self.get_object()

        if request.method == "GET":
            comments = CardComment.objects.filter(card=card).select_related("author")
            return Response(CardCommentSerializer(comments, many=True, context={"request": request}).data)

        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = CardCommentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(card=card, author=request.user)
        self._broadcast_comment(card, comment, "comment.created", request)
        self._notify_comment_mentions(card, comment)
        return Response(
            CardCommentSerializer(comment, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"comments/(?P<comment_id>[0-9]+)",
    )
    def comment_item(
        self,
        request: Request,
        pk: str | None = None,
        comment_id: str | None = None,
    ) -> Response:
        card = self.get_object()
        try:
            comment = CardComment.objects.select_related("author").get(
                id=int(comment_id or 0),
                card=card,
            )
        except CardComment.DoesNotExist:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        if not request.user or not request.user.is_authenticated or comment.author_id != request.user.id:
            return Response({"detail": "Only the author can edit this comment"}, status=status.HTTP_403_FORBIDDEN)

        if request.method == "DELETE":
            comment_id_int = comment.id
            comment.delete()
            broadcast_board_event(card.board_id, "comment.deleted", {"card_id": card.id, "comment_id": comment_id_int})
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = CardCommentSerializer(comment, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(edited_at=timezone.now())
        self._broadcast_comment(card, comment, "comment.updated", request)
        return Response(CardCommentSerializer(comment, context={"request": request}).data)

    def _broadcast_comment(
        self,
        card: Card,
        comment: CardComment,
        event_type: str,
        request: Request,
    ) -> None:
        broadcast_board_event(
            card.board_id,
            event_type,
            {
                "card_id": card.id,
                "comment": CardCommentSerializer(comment, context={"request": request}).data,
            },
        )

    def _notify_comment_mentions(self, card: Card, comment: CardComment) -> None:
        usernames = {item.lower() for item in re.findall(r"@([\w.@+-]+)", comment.text)}
        if not usernames:
            return
        mentioned_users = User.objects.filter(username__in=usernames).exclude(id=comment.author_id)
        if not mentioned_users.exists():
            return
        create_notification_event(
            event_type=NotificationEventType.COMMENT_CREATED.value,
            actor=comment.author,
            board=card.board,
            column=card.column,
            card=card,
            summary=f"Новый комментарий с упоминанием в задаче «{card.title}»",
            payload={
                "board": card.board.name,
                "column": card.column.name,
                "card": card.title,
                "comment": comment.text[:500],
                "mention_user_ids": list(mentioned_users.values_list("id", flat=True)),
            },
        )

    def perform_create(self, serializer: CardSerializer) -> None:
        card = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.CARD_CREATED.value,
            actor=actor,
            board=card.board,
            column=card.column,
            card=card,
            summary=f"Создана карточка «{card.title}»",
            payload={"board": card.board.name, "column": card.column.name, "card": card.title},
        )
        card = (
            Card.objects.select_related("board", "column")
            .prefetch_related(*CARD_PREFETCH_RELATED)
            .get(pk=card.pk)
        )
        broadcast_board_event(card.board_id, "card.created", {"card": CardSerializer(card).data})
        self._broadcast_parent_update(card.parent_id)

    def perform_update(self, serializer: CardSerializer) -> None:
        card = serializer.save()
        reminders = CardDeadlineReminder.objects.filter(card_id=card.id, enabled=True)
        for reminder in reminders:
            upsert_and_schedule_reminder(card=card, reminder=reminder)
        card = (
            Card.objects.select_related("board", "column")
            .prefetch_related(*CARD_PREFETCH_RELATED)
            .get(pk=card.pk)
        )
        broadcast_board_event(card.board_id, "card.updated", {"card": CardSerializer(card).data})
        self._broadcast_parent_update(card.parent_id)

    def perform_destroy(self, instance: Card) -> None:
        board_id = instance.board_id
        card_id = instance.id
        instance.archived_at = timezone.now()
        instance.save(update_fields=["archived_at", "updated_at", "version"])
        broadcast_board_event(board_id, "card.deleted", {"card_id": card_id})
        self._broadcast_parent_update(instance.parent_id)

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request: Request, pk: str | None = None) -> Response:
        try:
            card = (
                Card.with_archived.select_related("board", "column")
                .prefetch_related(*CARD_PREFETCH_RELATED)
                .get(pk=pk)
            )
        except Card.DoesNotExist:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        if card.column.archived_at is not None:
            return Response(
                {"detail": "Restore the column before restoring this card"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if card.archived_at is not None:
            card.archived_at = None
            card.save(update_fields=["archived_at", "updated_at", "version"])
            card = (
                Card.objects.select_related("board", "column")
                .prefetch_related(*CARD_PREFETCH_RELATED)
                .get(pk=card.pk)
            )

        data = self.get_serializer(card).data
        broadcast_board_event(card.board_id, "card.created", {"card": data})
        self._broadcast_parent_update(card.parent_id)
        return Response(data)

    @action(detail=True, methods=["get", "put", "patch", "delete"], url_path="deadline-reminder")
    def deadline_reminder(self, request: Request, pk: str | None = None) -> Response:
        card = self.get_object()
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Authentication required"}, status=401)

        if request.method == "GET":
            reminders = list(
                CardDeadlineReminder.objects.filter(
                    card_id=card.id,
                    user_id=request.user.id,
                ).order_by("order", "id")
            )
            availability = reminder_channel_availability(
                user_id=request.user.id,
                board_id=card.board_id,
                event_type="card.deadline_reminder",
            )
            return Response(
                {
                    "reminders": CardDeadlineReminderSerializer(reminders, many=True).data,
                    "channels": {
                        "email": {
                            "available": availability["email"].available,
                            "reason": availability["email"].reason,
                        },
                        "telegram": {
                            "available": availability["telegram"].available,
                            "reason": availability["telegram"].reason,
                        },
                    },
                    "deadline": card.deadline,
                }
            )

        if request.method == "DELETE":
            CardDeadlineReminder.objects.filter(card_id=card.id, user_id=request.user.id).delete()
            return Response(status=204)

        if request.method == "PATCH":
            return Response({"detail": "PATCH is not supported for multi reminders"}, status=405)

        payload = request.data or {}
        reminders_payload = payload.get("reminders")
        if not isinstance(reminders_payload, list):
            return Response({"detail": "reminders must be a list"}, status=400)

        incoming: list[CardDeadlineReminder] = []
        with transaction.atomic():
            CardDeadlineReminder.objects.filter(card_id=card.id, user_id=request.user.id).delete()
            for idx, item in enumerate(reminders_payload, start=1):
                serializer = CardDeadlineReminderSerializer(data=item)
                serializer.is_valid(raise_exception=True)
                reminder = serializer.save(card=card, user=request.user, order=idx)
                reminder = upsert_and_schedule_reminder(card=card, reminder=reminder)
                incoming.append(reminder)

        return Response(CardDeadlineReminderSerializer(incoming, many=True).data)

    @action(detail=True, methods=["post"], url_path="notify-updated")
    def notify_updated(self, request: Request, pk: str | None = None) -> Response:
        card = self.get_object()
        payload: dict[str, Any] = request.data or {}
        version = payload.get("version")
        if version is None:
            return Response({"detail": "version is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            version_int = int(version)
        except (TypeError, ValueError):
            return Response(
                {"detail": "version must be an integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if version_int != card.version:
            return Response({"detail": "Version conflict"}, status=status.HTTP_409_CONFLICT)

        actor = request.user if request.user.is_authenticated else None
        dedupe_key = f"card.updated:{card.id}:{version_int}"
        description = payload.get("description")
        changes = payload.get("changes")

        summary_parts = [f'Обновлена карточка "{card.title}"']
        if isinstance(description, str) and description.strip():
            summary_parts.append(f"\nОписание: {description.strip()}")
        if isinstance(changes, list):
            changes_text = "\n".join([str(item) for item in changes if str(item).strip()])
            if changes_text:
                summary_parts.append(f"\nИзменения:\n{changes_text}")

        payload_updates: dict[str, Any] = {
            "board": card.board.name,
            "column": card.column.name,
            "card": card.title,
        }
        if isinstance(description, str) and description.strip():
            payload_updates["description"] = description.strip()
        if isinstance(changes, list):
            payload_updates["changes"] = changes
        if isinstance(payload.get("changes_meta"), dict):
            payload_updates["changes_meta"] = payload.get("changes_meta")

        event = create_notification_event(
            event_type=NotificationEventType.CARD_UPDATED.value,
            actor=actor,
            board=card.board,
            column=card.column,
            card=card,
            summary="".join(summary_parts),
            payload=payload_updates,
            dedupe_key=dedupe_key,
        )
        return Response(
            {"event_id": getattr(event, "pk", None), "dedupe_key": dedupe_key},
            status=200,
        )

    @action(detail=False, methods=["post"], url_path="notify-deleted")
    def notify_deleted(self, request: Request) -> Response:
        payload: dict[str, Any] = request.data or {}
        board_id = payload.get("board")
        column_id = payload.get("column")
        card_title = payload.get("card_title")

        missing = [k for k in ["card_id", "version"] if payload.get(k) is None]
        if missing:
            return Response(
                {"detail": f"Missing fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            card_id_int = int(payload["card_id"])
            version_int = int(payload["version"])
        except (TypeError, ValueError):
            return Response(
                {"detail": "card_id and version must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        board: Board | None = None
        column: Column | None = None
        if board_id is not None:
            try:
                board = Board.objects.get(id=int(board_id))
            except Exception:  # noqa: BLE001
                board = None
        if column_id is not None:
            try:
                column = Column.with_archived.get(id=int(column_id))
            except Exception:  # noqa: BLE001
                column = None

        title = str(card_title) if card_title is not None else "(без названия)"
        actor = request.user if request.user.is_authenticated else None
        dedupe_key = f"card.deleted:{card_id_int}:{version_int}"
        event = create_notification_event(
            event_type=NotificationEventType.CARD_DELETED.value,
            actor=actor,
            board=board,
            column=column,
            summary=f"Удалена карточка «{title}»",
            payload={
                "board": getattr(board, "name", ""),
                "column": getattr(column, "name", ""),
                "card": title,
            },
            dedupe_key=dedupe_key,
        )
        return Response(
            {"event_id": getattr(event, "pk", None), "dedupe_key": dedupe_key},
            status=200,
        )

    @action(detail=True, methods=["post"], url_path="move")
    def move(self, request: Request, pk: str | None = None) -> Response:
        card = self.get_object()
        payload: dict[str, Any] = request.data or {}
        expected_version = payload.get("expected_version")
        to_column_id = payload.get("to_column")
        before_id = payload.get("before_id")
        after_id = payload.get("after_id")

        if expected_version is not None and int(expected_version) != card.version:
            return Response({"detail": "Version conflict"}, status=status.HTTP_409_CONFLICT)

        with transaction.atomic():
            before_column = card.column
            if to_column_id is not None and int(to_column_id) != card.column_id:
                try:
                    target_column = Column.objects.get(id=int(to_column_id))
                except Column.DoesNotExist:
                    return Response({"detail": "Target column not found"}, status=404)
            else:
                target_column = card.column

            neighbor_ids = [int(cid) for cid in [before_id, after_id] if cid is not None]
            positions: dict[int, Decimal] = {}
            if neighbor_ids:
                for c in Card.objects.filter(id__in=neighbor_ids).only("id", "position"):
                    positions[c.id] = c.position

            before_pos = positions.get(int(before_id)) if before_id is not None else None
            after_pos = positions.get(int(after_id)) if after_id is not None else None

            if before_pos is not None and after_pos is not None:
                new_position = (before_pos + after_pos) / Decimal("2")
            elif before_pos is not None:
                new_position = before_pos + Decimal("1")
            elif after_pos is not None:
                new_position = after_pos - Decimal("1")
            else:
                last = Card.objects.filter(column=target_column).order_by("-position").first()
                new_position = (last.position + Decimal("1")) if last else Decimal("1")

            card.column = target_column
            card.board = target_column.board
            card.position = new_position
            card.save()

        card = (
            Card.objects.select_related("board", "column")
            .prefetch_related(*CARD_PREFETCH_RELATED)
            .get(pk=card.pk)
        )
        serializer = self.get_serializer(card)

        actor = request.user if request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.CARD_MOVED.value,
            actor=actor,
            board=card.board,
            column=card.column,
            card=card,
            summary=f"Карточка «{card.title}» перемещена",
            payload={
                "board": card.board.name,
                "column": card.column.name,
                "card": card.title,
                "from_column": before_column.name if before_column else "",
            },
        )
        broadcast_board_event(card.board_id, "card.moved", {"card": serializer.data})
        return Response(serializer.data)
