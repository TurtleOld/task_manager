from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIClient

from kanban.models import Column
from kanban.serializers import PERMISSION_MAP, ROLE_PRESETS

User = get_user_model()

COLUMN_PERMISSION_KEYS = {"columns:view", "columns:add", "columns:edit", "columns:delete"}


def test_permission_map_has_no_column_permissions() -> None:
    """Ticket #14: kanban columns are no longer a permission a role can hold."""
    assert COLUMN_PERMISSION_KEYS.isdisjoint(PERMISSION_MAP.keys())


@pytest.mark.parametrize("role", sorted(ROLE_PRESETS.keys()))
def test_role_presets_have_no_column_permissions(role: str) -> None:
    assert COLUMN_PERMISSION_KEYS.isdisjoint(set(ROLE_PRESETS[role]))


def test_role_presets_only_reference_known_permissions() -> None:
    for role, keys in ROLE_PRESETS.items():
        unknown = set(keys) - set(PERMISSION_MAP.keys())
        assert not unknown, f"role {role!r} references unknown permissions: {unknown}"


def test_admin_role_preset_matches_expected_permission_set() -> None:
    assert set(ROLE_PRESETS["admin"]) == {
        "boards:view",
        "boards:add",
        "boards:edit",
        "boards:delete",
        "cards:view",
        "cards:add",
        "cards:edit",
        "cards:delete",
    }


def test_viewer_role_preset_matches_expected_permission_set() -> None:
    assert set(ROLE_PRESETS["viewer"]) == {"boards:view", "cards:view"}


@pytest.mark.django_db()
def test_api_never_reports_column_permissions_even_if_directly_granted() -> None:
    """A directly-granted column Django permission (e.g. left over from before
    the 0052 data migration ran, or added by hand) must never surface in the
    API permission set, while other grants keep being reported normally."""
    user = User.objects.create_user(username="grantee", password="pass12345")
    content_type = ContentType.objects.get_for_model(Column)
    column_permission = Permission.objects.get(content_type=content_type, codename="view_column")
    board_content_type = ContentType.objects.get(app_label="kanban", model="board")
    board_permission = Permission.objects.get(
        content_type=board_content_type, codename="view_board"
    )

    user.user_permissions.add(column_permission, board_permission)

    client = APIClient()
    client.force_authenticate(user=user)  # noqa: S106 — test-only auth bypass
    admin = User.objects.create_superuser(username="root", password="pass12345")
    admin_client = APIClient()
    admin_client.force_authenticate(user=admin)

    resp = admin_client.get(f"/api/v1/users/{user.id}/")
    assert resp.status_code == 200
    permissions = resp.json()["permissions"]
    assert "boards:view" in permissions
    assert not COLUMN_PERMISSION_KEYS.intersection(permissions)
