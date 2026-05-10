from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import SiteSettings
from ..serializers import SiteSettingsSerializer


class SiteSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        settings_obj = SiteSettings.load()
        return Response(SiteSettingsSerializer(settings_obj).data)

    def patch(self, request: Request) -> Response:
        if not request.user.is_staff:
            return Response(
                {"detail": "Только администратор может изменять настройки"},
                status=status.HTTP_403_FORBIDDEN,
            )
        settings_obj = SiteSettings.load()
        serializer = SiteSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
