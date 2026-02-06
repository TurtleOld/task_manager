from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import AnonymousUser
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils.text import get_valid_filename
from rest_framework import permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Board,
    Card,
    Column,
    NotificationEventType,
    NotificationPreference,
    NotificationProfile,
)
from .notifications import create_notification_event
from .serializers import (
    BoardSerializer,
    CardSerializer,
    ColumnSerializer,
    NotificationPreferenceSerializer,
    NotificationProfileSerializer,
    PasswordChangeSerializer,
    RegisterSerializer,
    UserSerializer,
    UserUpdateSerializer,
)

User = get_user_model()


class BoardViewSet(viewsets.ModelViewSet[Board]):
    queryset = Board.objects.all().order_by("id")
    serializer_class = BoardSerializer

    def perform_create(self, serializer: BoardSerializer) -> None:
        board = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.BOARD_CREATED[0],
            actor=actor,
            board=board,
            summary=f"Создана доска “{board.name}”",
            payload={"board": board.name},
        )

    def perform_update(self, serializer: BoardSerializer) -> None:
        board = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.BOARD_UPDATED[0],
            actor=actor,
            board=board,
            summary=f"Обновлена доска “{board.name}”",
            payload={"board": board.name},
        )

    def perform_destroy(self, instance: Board) -> None:
        actor = self.request.user if self.request.user.is_authenticated else None
        summary = f"Удалена доска “{instance.name}”"
        payload = {"board": instance.name}
        board = instance
        instance.delete()
        create_notification_event(
            event_type=NotificationEventType.BOARD_DELETED[0],
            actor=actor,
            board=board,
            summary=summary,
            payload=payload,
        )


class ColumnViewSet(viewsets.ModelViewSet[Column]):
    queryset = Column.objects.select_related("board").all().order_by("position", "id")
    serializer_class = ColumnSerializer
    filterset_fields = ["board"]

    def perform_create(self, serializer: ColumnSerializer) -> None:
        column = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.COLUMN_CREATED[0],
            actor=actor,
            board=column.board,
            column=column,
            summary=f"Создана колонка “{column.name}”",
            payload={"board": column.board.name, "column": column.name},
        )

    def perform_update(self, serializer: ColumnSerializer) -> None:
        column = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.COLUMN_UPDATED[0],
            actor=actor,
            board=column.board,
            column=column,
            summary=f"Обновлена колонка “{column.name}”",
            payload={"board": column.board.name, "column": column.name},
        )

    def perform_destroy(self, instance: Column) -> None:
        actor = self.request.user if self.request.user.is_authenticated else None
        summary = f"Удалена колонка “{instance.name}”"
        payload = {"board": instance.board.name, "column": instance.name}
        board = instance.board
        instance.delete()
        create_notification_event(
            event_type=NotificationEventType.COLUMN_DELETED[0],
            actor=actor,
            board=board,
            summary=summary,
            payload=payload,
        )


class CardViewSet(viewsets.ModelViewSet[Card]):
    queryset = Card.objects.select_related("board", "column").all().order_by("position", "id")
    serializer_class = CardSerializer
    filterset_fields = ["board", "column"]

    @action(
        detail=True,
        methods=["post"],
        url_path="attachments",
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_attachments(self, request: Request, pk: str | None = None) -> Response:
        """Upload one or many files and attach them to the card.

        Expects multipart/form-data with field name: files
        """
        # Note: `self.get_object()` does not lock the row; we lock explicitly for race-safety.
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

                item = {
                    "id": attachment_id,
                    "name": safe_name,
                    "type": "file",
                    "url": url,
                    "mimeType": getattr(f, "content_type", ""),
                    "size": getattr(f, "size", None),
                    "path": saved_path,
                }
                existing.append(item)

            card.attachments = existing
            card.save(update_fields=["attachments"])

        # Return updated card to keep frontend state consistent
        return Response(self.get_serializer(card).data, status=status.HTTP_200_OK)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<attachment_id>[^/]+)",
    )
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

            # Best-effort delete from storage if we have the internal path.
            path = removed.get("path")
            if isinstance(path, str) and path:
                try:
                    default_storage.delete(path)
                except Exception:  # noqa: BLE001
                    # File might be already removed; do not fail the API.
                    pass

            card.attachments = kept
            card.save(update_fields=["attachments"])

        return Response(self.get_serializer(card).data, status=status.HTTP_200_OK)

    def perform_create(self, serializer: CardSerializer) -> None:
        card = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.CARD_CREATED[0],
            actor=actor,
            board=card.board,
            column=card.column,
            card=card,
            summary=f"Создана карточка “{card.title}”",
            payload={"board": card.board.name, "column": card.column.name, "card": card.title},
        )

    def perform_update(self, serializer: CardSerializer) -> None:
        card = serializer.save()
        actor = self.request.user if self.request.user.is_authenticated else None
        create_notification_event(
            event_type=NotificationEventType.CARD_UPDATED[0],
            actor=actor,
            board=card.board,
            column=card.column,
            card=card,
            summary=f"Обновлена карточка “{card.title}”",
            payload={"board": card.board.name, "column": card.column.name, "card": card.title},
        )

    def perform_destroy(self, instance: Card) -> None:
        actor = self.request.user if self.request.user.is_authenticated else None
        summary = f"Удалена карточка “{instance.title}”"
        payload = {
            "board": instance.board.name,
            "column": instance.column.name,
            "card": instance.title,
        }
        board = instance.board
        column = instance.column
        instance.delete()
        create_notification_event(
            event_type=NotificationEventType.CARD_DELETED[0],
            actor=actor,
            board=board,
            column=column,
            summary=summary,
            payload=payload,
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
                    target_column = Column.objects.select_for_update().get(id=int(to_column_id))
                except Column.DoesNotExist:
                    return Response({"detail": "Target column not found"}, status=404)
            else:
                target_column = Column.objects.select_for_update().get(id=card.column_id)

            def pos_of(card_id: int) -> Decimal | None:
                try:
                    c = Card.objects.select_for_update().get(id=card_id)
                    return c.position
                except Card.DoesNotExist:
                    return None

            before_pos = pos_of(int(before_id)) if before_id is not None else None
            after_pos = pos_of(int(after_id)) if after_id is not None else None

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

        serializer = self.get_serializer(card)

        actor = request.user if request.user.is_authenticated else None
        moved_summary = f"Карточка “{card.title}” перемещена"
        payload = {
            "board": card.board.name,
            "column": card.column.name,
            "card": card.title,
            "from_column": before_column.name if before_column else "",
        }
        create_notification_event(
            event_type=NotificationEventType.CARD_MOVED[0],
            actor=actor,
            board=card.board,
            column=card.column,
            card=card,
            summary=moved_summary,
            payload=payload,
        )

        return Response(serializer.data)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request: Request) -> Response:
        user_count = User.objects.count()
        requester = request.user
        allow = user_count == 0 or (not isinstance(requester, AnonymousUser) and requester.is_staff)
        if not allow:
            return Response({"detail": "Registration is not allowed"}, status=403)

        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        if user_count == 0:
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=["is_staff", "is_superuser"])

        token, _ = Token.objects.get_or_create(user=user)
        role = "admin" if user.is_superuser else ("manager" if user.is_staff else "viewer")
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "full_name": user.first_name,
                "is_admin": user.is_staff or user.is_superuser,
                "role": role,
                "token": token.key,
            },
            status=201,
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request: Request) -> Response:
        payload = request.data or {}
        username = payload.get("username")
        password = payload.get("password")
        if not username or not password:
            return Response({"detail": "Username and password required"}, status=400)
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid credentials"}, status=400)
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "full_name": user.first_name,
                "is_admin": user.is_staff or user.is_superuser,
                "token": token.key,
            }
        )


class RegistrationStatusView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request: Request) -> Response:
        user_count = User.objects.count()
        requester = request.user
        allow_admin = (
            not isinstance(requester, AnonymousUser) and requester.is_staff
        )
        return Response(
            {
                "user_count": user_count,
                "allow_first": user_count == 0,
                "allow_admin": allow_admin,
            }
        )


class IsAdminUser(permissions.BasePermission):
    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class UserAdminViewSet(viewsets.ViewSet):
    permission_classes = [IsAdminUser]

    def list(self, request: Request) -> Response:
        users = User.objects.all().order_by("id")
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)

    def retrieve(self, request: Request, pk: str | None = None) -> Response:
        user = User.objects.filter(id=pk).first()
        if not user:
            return Response({"detail": "Not found"}, status=404)
        serializer = UserSerializer(user)
        return Response(serializer.data)

    def partial_update(self, request: Request, pk: str | None = None) -> Response:
        user = User.objects.filter(id=pk).first()
        if not user:
            return Response({"detail": "Not found"}, status=404)
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(user).data)

    @action(detail=True, methods=["post"], url_path="change-password")
    def change_password(self, request: Request, pk: str | None = None) -> Response:
        user = User.objects.filter(id=pk).first()
        if not user:
            return Response({"detail": "Not found"}, status=404)
        serializer = PasswordChangeSerializer(user, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password updated"})


class NotificationProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        profile, _ = NotificationProfile.objects.get_or_create(user=request.user)
        serializer = NotificationProfileSerializer(profile)
        return Response(serializer.data)

    def patch(self, request: Request) -> Response:
        profile, _ = NotificationProfile.objects.get_or_create(user=request.user)
        serializer = NotificationProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


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
