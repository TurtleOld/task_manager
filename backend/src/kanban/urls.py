from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AgendaView,
    ArchiveView,
    BoardViewSet,
    CardViewSet,
    CurrentUserView,
    FamilyTodayView,
    LoginView,
    NotificationInboxView,
    NotificationPreferenceViewSet,
    NotificationProfileView,
    PushDeviceViewSet,
    RegisterView,
    RegistrationStatusView,
    SearchView,
    SiteSettingsView,
    TerminateSessionsView,
    UserAdminViewSet,
    VapidPublicKeyView,
)

router = DefaultRouter()
router.register(r"boards", BoardViewSet, basename="board")
router.register(r"cards", CardViewSet, basename="card")
router.register(r"users", UserAdminViewSet, basename="user-admin")
router.register(
    r"notification-preferences",
    NotificationPreferenceViewSet,
    basename="notification-preference",
)
router.register(r"push-devices", PushDeviceViewSet, basename="push-device")

urlpatterns = [
    path("agenda/", AgendaView.as_view(), name="agenda"),
    path("agenda/family-today/", FamilyTodayView.as_view(), name="agenda-family-today"),
    path("archive/", ArchiveView.as_view(), name="archive"),
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/me/", CurrentUserView.as_view(), name="current-user"),
    path("auth/registration-status/", RegistrationStatusView.as_view(), name="registration-status"),
    path("auth/terminate-sessions/", TerminateSessionsView.as_view(), name="terminate-sessions"),
    path("notifications/inbox/", NotificationInboxView.as_view(), name="notification-inbox"),
    path("notifications/profile/", NotificationProfileView.as_view(), name="notification-profile"),
    path(
        "notifications/vapid-key/",
        VapidPublicKeyView.as_view(),
        name="notification-vapid-key",
    ),
    path("search/", SearchView.as_view(), name="search"),
    path("settings/site/", SiteSettingsView.as_view(), name="site-settings"),
]
urlpatterns += router.urls
