from django import template

register = template.Library()


@register.filter
def can_edit_comment(comment, user):
    """Проверяет, может ли пользователь редактировать комментарий."""
    return comment.can_edit(user)


@register.filter
def can_delete_comment(comment, user):
    """Проверяет, может ли пользователь удалить комментарий."""
    return comment.can_delete(user)
