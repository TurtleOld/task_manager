from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import BoardViewSet, CardViewSet, ColumnViewSet

router = DefaultRouter()
router.register(r"boards", BoardViewSet, basename="board")
router.register(r"columns", ColumnViewSet, basename="column")
router.register(r"cards", CardViewSet, basename="card")

urlpatterns = router.urls
