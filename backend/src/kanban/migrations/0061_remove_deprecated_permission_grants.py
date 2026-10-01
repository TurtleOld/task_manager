from __future__ import annotations

from django.db import migrations


# The permission registry was never enforced by the backend: access is decided
# by authentication and the owner/member role. Unassign every kanban-app grant
# so no user is left holding a permission the API can no longer report or
# exercise. The `auth.Permission` rows themselves are left in place, mirroring
# 0052.
def remove_deprecated_permission_grants(apps, schema_editor):
    Permission = apps.get_model("auth", "Permission")
    permissions = Permission.objects.filter(content_type__app_label="kanban")
    for permission in permissions:
        permission.user_set.clear()


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0060_alter_notificationevent_event_type_and_more"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(
            remove_deprecated_permission_grants,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
