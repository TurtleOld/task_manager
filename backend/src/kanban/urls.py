from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BoardViewSet,
    CardViewSet,
    ColumnViewSet,
    LoginView,
    NotificationPreferenceViewSet,
    NotificationProfileView,
    RegisterView,
    RegistrationStatusView,
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
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/registration-status/", RegistrationStatusView.as_view(), name="registration-status"),
    path("notifications/profile/", NotificationProfileView.as_view(), name="notification-profile"),
]
urlpatterns += router.urls
