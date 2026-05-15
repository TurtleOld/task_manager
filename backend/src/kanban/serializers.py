from __future__ import annotations

# Re-export everything from the split serializers package.
# This file is kept so that any code importing from `.serializers` continues to work.
from .serializers_pkg import (  # noqa: F401
    PERMISSION_MAP,
    ROLE_PRESETS,
    AttachmentSerializer,
    BoardSerializer,
    CardActivitySerializer,
    CardCommentSerializer,
    CardDeadlineReminderSerializer,
    CardLabelField,
    CardSerializer,
    ChecklistItemSerializer,
    ColumnSerializer,
    CurrentUserUpdateSerializer,
    LabelSerializer,
    NotificationInboxEntrySerializer,
    NotificationPreferenceSerializer,
    NotificationProfileSerializer,
    PasswordChangeSerializer,
    RecurrenceRuleSerializer,
    RegisterSerializer,
    SiteSettingsSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
