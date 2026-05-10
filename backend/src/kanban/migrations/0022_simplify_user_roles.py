"""Collapse the four-role model (admin/manager/editor/viewer) onto the
simpler two-role one (owner/member) used by Phase 1.

Mapping (per plan §3.4 / acceptance):
  - is_superuser=True  → owner (kept as is_staff=True, is_superuser=True)
  - everyone else      → member (is_staff cleared, is_superuser kept off)

Per-user `user_permissions` rows are left intact: the column survives as
"advanced mode" reserved for a future iteration (see plan §3.4 "не удалять
колонку"). Reverse path is a no-op — the original four-way split cannot be
reconstructed without external knowledge."""

from __future__ import annotations

from django.db import migrations


def collapse_to_owner_member(apps, schema_editor):
    User = apps.get_model("auth", "User")
    User.objects.filter(is_superuser=False).update(is_staff=False)


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0021_label_consolidation"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(
            collapse_to_owner_member,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
