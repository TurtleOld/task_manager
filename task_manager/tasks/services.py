"""Task management services for the Django application."""

import json
import logging
import pathlib
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from transliterate import slugify

from task_manager.tasks.models import (
    Checklist,
    ChecklistItem,
    Comment,
    Stage,
    Task,
)

User = get_user_model()
logger = logging.getLogger(__name__)


def slugify_translit(text: str) -> str:
    return slugify(text) or ''


def notify(
    task_name: str,
    task_file_path: str | None = None,
) -> None:
    if task_file_path and pathlib.Path(task_file_path).exists():
        logger.info(
            'Notification for task %s with image %s', task_name, task_file_path
        )
    else:
        logger.info('Notification for task %s without image', task_name)


def get_user_display_name(user) -> str:
    if hasattr(user, 'get_full_name') and user.get_full_name():
        return user.get_full_name()
    return user.username


def _create_checklist_from_form_data(
    task: Task, checklist_items_data: str
) -> None:
    """Create checklist items from form data."""
    if not checklist_items_data:
        return

    try:
        items_data = json.loads(checklist_items_data)
        if isinstance(items_data, list):
            checklist, _ = Checklist.objects.get_or_create(task=task)
            for i, item_data in enumerate(items_data):
                if isinstance(item_data, dict) and 'text' in item_data:
                    ChecklistItem.objects.create(
                        checklist=checklist,
                        text=item_data['text'],
                        is_completed=item_data.get('is_completed', False),
                        order=i,
                    )
    except (json.JSONDecodeError, TypeError, AttributeError):
        pass


def create_task_with_checklist(form, request: HttpRequest) -> tuple[Task, str]:
    task = form.save(commit=False)
    task.author = request.user

    if not task.slug:
        task.slug = slugify_translit(task.name)

    task.save()
    form.save_m2m()

    checklist_items_data = form.cleaned_data.get('checklist_items')
    _create_checklist_from_form_data(task, checklist_items_data)

    return task, task.slug


def send_task_creation_notifications(task_name: str) -> None:
    notify(task_name, '')


def get_checklist_progress(task: Task) -> dict[str, Any]:
    if not hasattr(task, 'checklist') or not task.checklist:
        return {'total': 0, 'completed': 0, 'percentage': 0}

    total_items = task.checklist.items.count()
    completed_items = task.checklist.items.filter(is_completed=True).count()
    percentage = (
        int((completed_items / total_items) * 100) if total_items > 0 else 0
    )

    return {
        'total': total_items,
        'completed': completed_items,
        'percentage': percentage,
    }


def toggle_checklist_item(item_id: int) -> ChecklistItem:
    item = get_object_or_404(ChecklistItem, id=item_id)
    item.is_completed = not item.is_completed
    item.save()
    return item


def process_checklist_items(request: HttpRequest) -> list:
    checklist_items = []
    i = 0
    while f'checklist_text_{i}' in request.POST:
        text = request.POST.get(f'checklist_text_{i}', '').strip()
        is_completed = request.POST.get(f'checklist_completed_{i}', '') == 'on'

        if text:
            checklist_items.append({
                'text': text,
                'is_completed': is_completed,
                'order': i,
            })
        i += 1

    return checklist_items


def get_task_context_data(task: Task, request: HttpRequest) -> dict[str, Any]:
    context = {}

    if hasattr(task, 'checklist') and task.checklist:
        context['checklist_progress'] = get_checklist_progress(task)
        context['checklist_items'] = task.checklist.items.all()

    context['comments'] = get_comments_for_task(task.slug, request)
    context['labels'] = task.labels.all()

    return context


def get_comments_for_task(
    task_slug: str, request: HttpRequest
) -> dict[str, Any]:
    task = get_object_or_404(Task, slug=task_slug)
    comments = task.comments.filter(is_deleted=False).order_by('-created_at')

    return {
        'task': task,
        'comments': comments,
    }


def get_kanban_data(request: HttpRequest) -> dict[str, Any]:
    stages = Stage.objects.all().order_by('order')
    tasks_data = []

    for stage in stages:
        stage_tasks = _get_filtered_stage_tasks(stage, request)
        tasks_data.extend(_build_task_data(task) for task in stage_tasks)

    return {
        'stages': stages,
        'tasks_data': tasks_data,
    }


def _get_filtered_stage_tasks(stage: Stage, request: HttpRequest) -> list:
    tasks = Task.objects.filter(stage=stage).order_by('order', 'created_at')

    if request.user.is_authenticated:
        executor_filter = request.GET.get('executor')
        if executor_filter:
            tasks = tasks.filter(executor_id=executor_filter)

        labels_filter = request.GET.getlist('labels')
        if labels_filter:
            tasks = tasks.filter(labels__id__in=labels_filter).distinct()

        self_tasks = request.GET.get('self_tasks')
        if self_tasks:
            tasks = tasks.filter(author=request.user)

    return list(tasks)


def _build_task_data(task: Task) -> dict[str, Any]:
    return {
        'id': task.pk,
        'name': task.name,
        'description': task.description,
        'author': get_user_display_name(task.author),
        'executor': get_user_display_name(task.executor)
        if task.executor
        else None,
        'stage': task.stage.id if task.stage else None,
        'order': task.order,
        'state': task.state,
        'created_at': task.created_at.isoformat() if task.created_at else None,
        'deadline': task.deadline.isoformat() if task.deadline else None,
        'labels': [
            {'id': label.id, 'name': label.name} for label in task.labels.all()
        ],
        'progress': get_checklist_progress(task)['percentage'],
    }


def _validate_task_update_data(task_id, new_stage_id, new_order) -> bool:
    """Validate task update request data."""
    if not task_id:
        return False
    return new_stage_id is not None or new_order is not None


def _update_task_stage(task: Task, new_stage_id: int) -> None:
    """Update task stage if new_stage_id is provided."""
    if new_stage_id is not None:
        new_stage = Stage.objects.get(id=new_stage_id)
        task.stage = new_stage


def _update_task_order(task: Task, new_order: int) -> None:
    """Update task order if new_order is provided."""
    if new_order is not None:
        task.order = new_order
        reorder_task_within_stage(task, new_order)


def update_task_stage_and_order(
    task_id: int,
    new_stage_id: int | None,
    new_order: int | None,
) -> dict[str, Any]:
    try:
        task = Task.objects.get(id=task_id)
        _update_task_stage(task, new_stage_id)
        _update_task_order(task, new_order)
    except Task.DoesNotExist:
        return {'success': False, 'error': 'Task not found'}
    except Stage.DoesNotExist:
        return {'success': False, 'error': 'Stage not found'}
    except Exception:
        logger = logging.getLogger(__name__)
        logger.exception('Unexpected error in update_task_stage_and_order')
        return {'success': False, 'error': 'An unexpected error occurred'}
    else:
        return {'success': True}


def process_bulk_task_updates(tasks_data: list) -> None:
    with transaction.atomic():
        for task_data in tasks_data:
            task_id = task_data.get('id')
            new_stage_id = task_data.get('stage_id')
            new_order = task_data.get('order')

            if task_id and (new_stage_id is not None or new_order is not None):
                update_task_stage_and_order(task_id, new_stage_id, new_order)


def create_comment(
    task_slug: str, request: HttpRequest
) -> tuple[bool, str, Comment | None]:
    task = get_object_or_404(Task, slug=task_slug)

    if request.user not in {task.author, task.executor} and task.executor:
        return (
            False,
            'У вас нет прав для добавления комментариев к этой задаче.',
            None,
        )

    content = request.POST.get('content', '').strip()
    if not content:
        return False, 'Содержание комментария обязательно.', None

    comment = Comment.objects.create(
        task=task, author=request.user, content=content
    )

    return True, 'Комментарий успешно добавлен.', comment


def update_comment(
    comment_id: int, request: HttpRequest
) -> tuple[bool, str, Comment | None]:
    comment = get_object_or_404(Comment, id=comment_id)

    if not comment.can_edit(request.user):
        return (
            False,
            'У вас нет прав для редактирования этого комментария.',
            None,
        )

    content = request.POST.get('content', '').strip()
    if not content:
        return False, 'Содержание комментария обязательно.', None

    comment.content = content
    comment.save()

    return True, 'Комментарий успешно обновлен.', comment


def delete_comment(comment_id: int, request: HttpRequest) -> tuple[bool, str]:
    comment = get_object_or_404(Comment, id=comment_id)

    if not comment.can_delete(request.user):
        return False, 'У вас нет прав для удаления этого комментария.'

    comment.soft_delete()
    return True, 'Комментарий успешно удален.'


def close_or_reopen_task(
    task_slug: str, request: HttpRequest
) -> tuple[bool, str]:
    task = get_object_or_404(Task, slug=task_slug)

    if request.user not in {task.author, task.executor}:
        return False, 'У вас нет прав для изменения состояния этой задачи'

    task.state = not task.state
    task.save()

    action = 'закрыта' if task.state else 'открыта'
    return True, f'Задача {action}.'


def delete_task_with_notification(task: Task) -> None:
    task.delete()


def reorder_task_within_stage(task: Task, new_order: int) -> None:
    if task.stage:
        stage_tasks = Task.objects.filter(stage=task.stage).exclude(pk=task.pk)
        new_order = min(stage_tasks.count(), new_order)
        stage_tasks = list(stage_tasks)
        stage_tasks.insert(new_order, task)
        for i, t in enumerate(stage_tasks):
            t.order = i
            t.save(update_fields=['order'])
