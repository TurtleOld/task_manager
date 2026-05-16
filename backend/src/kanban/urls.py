from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ArchiveView,
    BoardViewSet,
    CardViewSet,
    ColumnViewSet,
    CurrentUserView,
    InboxView,
    LoginView,
    NotificationInboxView,
    NotificationPreferenceViewSet,
    NotificationProfileView,
    RegisterView,
    RegistrationStatusView,
    SearchView,
    SiteSettingsView,
    TerminateSessionsView,
    UserAdminViewSet,
)

router = DefaultRouter()
router.register(r"boards", BoardViewSet, basename="board")
router.register(r"columns", ColumnViewSet, basename="column")
router.register(r"cards", CardViewSet, basename="card")
router.register(r"users", UserAdminViewSet, basename="user-admin")
router.register(
    r"notification-preferences",
    NotificationPreferenceViewSet,
    basename="notification-preference",
)

urlpatterns = [
    path("archive/", ArchiveView.as_view(), name="archive"),
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/me/", CurrentUserView.as_view(), name="current-user"),
    path("auth/registration-status/", RegistrationStatusView.as_view(), name="registration-status"),
    path("auth/terminate-sessions/", TerminateSessionsView.as_view(), name="terminate-sessions"),
    path("inbox/", InboxView.as_view(), name="inbox"),
    path("notifications/inbox/", NotificationInboxView.as_view(), name="notification-inbox"),
    path("notifications/profile/", NotificationProfileView.as_view(), name="notification-profile"),
    path("search/", SearchView.as_view(), name="search"),
    path("settings/site/", SiteSettingsView.as_view(), name="site-settings"),
]
urlpatterns += router.urls
