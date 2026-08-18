from __future__ import annotations

from ..broadcast import broadcast_board_event  # noqa: F401 — re-exported for test patches
from .agenda import AgendaView, FamilyTodayView
from .archive import ArchiveView
from .auth import (
    CurrentUserView,
    LoginView,
    RegisterView,
    RegistrationStatusView,
    TerminateSessionsView,
)
from .boards import BoardViewSet
from .cards import CardViewSet
from .notifications import (
    NotificationInboxView,
    NotificationPreferenceViewSet,
    NotificationProfileView,
    PushDeviceViewSet,
    VapidPublicKeyView,
)
from .search import SearchView
from .site_settings import SiteSettingsView
from .users import IsAdminUser, UserAdminViewSet

__all__ = [
    "PushDeviceViewSet",
    "VapidPublicKeyView",
    "AgendaView",
    "FamilyTodayView",
    "BoardViewSet",
    "ArchiveView",
    "CardViewSet",
    "CurrentUserView",
    "IsAdminUser",
    "LoginView",
    "NotificationInboxView",
    "NotificationPreferenceViewSet",
    "NotificationProfileView",
    "RegisterView",
    "RegistrationStatusView",
    "TerminateSessionsView",
    "SearchView",
    "SiteSettingsView",
    "UserAdminViewSet",
]
