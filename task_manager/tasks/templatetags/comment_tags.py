"""Template tags for comment management."""

from django import template

register = template.Library()


@register.filter
def can_edit_comment(comment, user):
    return comment.can_edit(user)


@register.filter
def can_delete_comment(comment, user):
    return comment.can_delete(user)
