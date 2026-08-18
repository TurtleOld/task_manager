from __future__ import annotations

from django.db import migrations

# Kanban columns are no longer a product concept (see ticket #14): the four
# column permissions are dropped from PERMISSION_MAP / ROLE_PRESETS. Existing
# users keep every other permission grant untouched — this only unassigns
# the removed ones so nobody is left holding a permission the UI can no
# longer show or exercise. The underlying `auth.Permission` rows (and the
# `Column` model/table they describe) are left in place.
REMOVED_CODENAMES = ["view_column", "add_column", "change_column", "delete_column"]


def remove_column_permission_grants(apps, schema_editor):
    Permission = apps.get_model("auth", "Permission")
    permissions = Permission.objects.filter(
        content_type__app_label="kanban",
        codename__in=REMOVED_CODENAMES,
    )
    for permission in permissions:
        permission.user_set.clear()


class Migration(migrations.Migration):
    dependencies = [
        ("kanban", "0051_family_shopping_list"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunPython(remove_column_permission_grants, migrations.RunPython.noop),
    ]
