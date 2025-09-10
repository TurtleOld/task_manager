import json
import logging
import os

from typing import Any

from celery.exceptions import CeleryError
from django.conf import settings
from django.contrib import messages
from django.core.paginator import Paginator
from django.db import OperationalError, transaction
from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from django.utils.timezone import now
from django.utils.translation import gettext_lazy as _
from transliterate import translit

from task_manager.labels.models import Label
from task_manager.tasks.forms import CommentForm
from task_manager.tasks.models import (
    ChecklistItem,
    Comment,
    Stage,
    Task,
    reorder_task_within_stage,
    reorder_tasks_in_stage,
)
from task_manager.tasks.tasks import (
    send_about_closing_task,
    send_about_deleting_task,
    send_about_moving_task,
    send_about_opening_task,
    send_comment_notification,
    send_message_about_adding_task,
)
from task_manager.users.models import User


def send_celery_task(task_func, *args, eta=None, **kwargs):
    if not getattr(settings, 'CELERY_ENABLED', True):
        return False

    try:
        if eta:
            return task_func.apply_async(args=args, kwargs=kwargs, eta=eta)
        return task_func.delay(*args, **kwargs)
    except (CeleryError, OperationalError):
        logger = logging.getLogger(__name__)
        logger.exception('Failed to send Celery task %s', task_func.__name__)
        return False


def slugify_translit(task_name: str) -> str:
    translite_name = translit(task_name, language_code='ru', reversed=True)
    return slugify(translite_name)


def get_user_display_name(user) -> str:
    if hasattr(user, 'get_full_name'):
        full_name = user.get_full_name()
        if full_name:
            return full_name
    return user.username


def process_checklist_items(request: HttpRequest) -> list[dict[str, Any]]:
    checklist_items = []
    index = 0
    while f'checklist_items[{index}][description]' in request.POST:
        description = request.POST.get(
            f'checklist_items[{index}][description]', ''
        ).strip()
        is_completed = (
            request.POST.get(f'checklist_items[{index}][is_completed]', 'false')
            == 'true'
        )
        if description:
            checklist_items.append({
                'description': description,
                'is_completed': is_completed,
            })
        index += 1
    return checklist_items


def create_task_with_checklist(form, request: HttpRequest) -> tuple[Task, str]:
    form.instance.author = User.objects.get(pk=request.user.pk)
    task = form.save(commit=False)
    task_name = task.name
    task.slug = slugify_translit(task_name)
    task.stage_id = 1
    task = form.save()
    task_slug = task.slug

    checklist_items = process_checklist_items(request)
    form.cleaned_data = form.cleaned_data or {}
    form.cleaned_data['checklist_items'] = checklist_items
    form.save_checklist_items(task)

    return task, task_slug


def send_task_creation_notifications(
    task_name: str, task_slug: str, form, request: HttpRequest
) -> None:
    task_url = request.build_absolute_uri(f'/tasks/{task_slug}')
    if getattr(settings, 'CELERY_ENABLED', True):
        send_celery_task(send_message_about_adding_task, task_name, task_url)

    task_image = form.instance.image
    deadline = form.instance.deadline
    reminder_periods = form.cleaned_data.get('reminder_periods', [])
    task_image_path = task_image.path if task_image else None

    if deadline and reminder_periods and os.environ.get('TOKEN_TELEGRAM_BOT'):
        notify(
            task_name,
            reminder_periods,
            deadline,
            task_image_path,
            task_url,
        )


def _get_task_author_data(task: Task) -> dict[str, str]:
    return {
        'username': (task.author.username if task.author else ''),
        'full_name': (task.author.get_full_name() if task.author else ''),
    }


def _get_task_executor_data(task: Task) -> dict[str, str]:
    return {
        'username': (task.executor.username if task.executor else ''),
        'full_name': (task.executor.get_full_name() if task.executor else ''),
    }


def _build_task_data(task: Task) -> dict[str, Any]:
    return {
        'id': task.pk,
        'name': task.name,
        'slug': task.slug,
        'author': _get_task_author_data(task),
        'executor': _get_task_executor_data(task),
        'created_at': task.created_at.strftime('%d.%m.%Y %H:%M'),
        'stage': task.stage.pk,
        'labels': list(task.labels.values('id', 'name')),
    }


def _get_filtered_stage_tasks(stage: Stage, selected_labels: list[str]) -> Any:
    stage_tasks = stage.tasks.prefetch_related('labels')
    if selected_labels:
        stage_tasks = stage_tasks.filter(
            labels__id__in=selected_labels
        ).distinct()
    return stage_tasks


def get_kanban_data(request: HttpRequest) -> dict[str, Any]:
    labels = Label.objects.all().order_by('name')
    selected_labels = request.GET.getlist('labels')
    stages = Stage.objects.prefetch_related('tasks').order_by('order')

    tasks_data = []
    for stage in stages:
        stage_tasks = _get_filtered_stage_tasks(stage, selected_labels)
        tasks_data.extend(_build_task_data(task) for task in stage_tasks)

    return {
        'stages': stages,
        'tasks': json.dumps(tasks_data, default=str, ensure_ascii=False),
        'labels': labels,
        'selected_labels': selected_labels,
    }


def _process_stage_change(
    task: Task, new_stage_id: int | None, request: HttpRequest
) -> dict[str, Any] | None:
    if new_stage_id is None:
        return None

    old_stage = task.stage
    new_stage = Stage.objects.get(id=new_stage_id) if new_stage_id else None

    if new_stage and not can_move_to_done_stage(task, new_stage, request):
        return {
            'success': False,
            'error': 'Unauthorized move to Done stage',
        }

    if old_stage != new_stage and new_stage:
        move_task_to_new_stage(task, old_stage, new_stage, request)

    return None


def _process_order_change(
    task: Task, new_stage_id: int | None, new_order: int | None
) -> None:
    if new_stage_id is not None:
        task.stage_id = new_stage_id
        task.save(update_fields=['stage_id'])

    if new_order is not None:
        task.order = new_order
        task.save(update_fields=['order'])
        reorder_task_within_stage(task, new_order)


def _handle_update_exceptions(
    exception: Exception, logger: logging.Logger
) -> dict[str, Any]:
    if isinstance(exception, Task.DoesNotExist):
        return {'success': False, 'error': 'Task not found'}
    if isinstance(exception, Stage.DoesNotExist):
        return {'success': False, 'error': 'Stage not found'}
    if isinstance(exception, ValueError | TypeError | AttributeError):
        return {'success': False, 'error': f'Invalid data: {exception!s}'}
    logger.exception('Unexpected error in update_task_stage_and_order')
    return {'success': False, 'error': 'An unexpected error occurred'}


def update_task_stage_and_order(
    task_id: int,
    new_stage_id: int | None,
    new_order: int | None,
    request: HttpRequest,
) -> dict[str, Any]:
    try:
        with transaction.atomic():
            task = Task.objects.select_for_update().get(id=task_id)

            # Process stage change
            stage_result = _process_stage_change(task, new_stage_id, request)
            if stage_result:
                return stage_result

            # Process order change
            _process_order_change(task, new_stage_id, new_order)
            return {'success': True}
    except Exception as exception:
        logger = logging.getLogger(__name__)
        return _handle_update_exceptions(exception, logger)


def can_move_to_done_stage(
    task: Task, new_stage: Stage, request: HttpRequest
) -> bool:
    if new_stage and new_stage.name == 'Done' and task.author != request.user:
        messages.error(
            request,
            _('Only the task author can move it to Done'),
        )
        return False
    return True


def move_task_to_new_stage(
    task: Task, old_stage: Stage, new_stage: Stage, request: HttpRequest
) -> None:
    task.stage = new_stage
    task.save()

    send_move_notification(task, new_stage, request)
    reorder_stages(old_stage, new_stage)


def send_move_notification(
    task: Task, new_stage: Stage, request: HttpRequest
) -> None:
    task_url = request.build_absolute_uri(f'/tasks/{task.slug}')
    moved_by = get_user_display_name(request.user)

    if getattr(settings, 'CELERY_ENABLED', True):
        send_celery_task(
            send_about_moving_task,
            task.name,
            moved_by,
            new_stage.name,
            task_url,
        )


def reorder_stages(old_stage: Stage, new_stage: Stage) -> None:
    if old_stage:
        reorder_tasks_in_stage(old_stage)
    if new_stage:
        reorder_tasks_in_stage(new_stage)


def process_bulk_task_updates(
    tasks_data: list[dict[str, Any]], request: HttpRequest
) -> None:
    for task_data in tasks_data:
        validate_task_data(task_data)
        update_single_task(task_data, request)


def validate_task_data(task_data: dict[str, Any]) -> None:
    task_id = task_data.get('task_id')
    stage_id = task_data.get('stage_id')
    order = task_data.get('order')

    if task_id is None or stage_id is None or order is None:
        raise ValueError('Invalid task data')


def update_single_task(task_data: dict[str, Any], request: HttpRequest) -> None:
    task_id = task_data.get('task_id')
    stage_id = task_data.get('stage_id')
    order = task_data.get('order')

    task = Task.objects.filter(pk=task_id).first()
    if not task:
        raise ValueError(f'Task with ID {task_id} not found')

    old_stage_id = task.stage.id if task.stage else None
    task.stage_id = stage_id
    task.order = order
    task.save()

    if old_stage_id != stage_id and stage_id is not None:
        handle_task_stage_change(task, int(stage_id), request)


def handle_task_stage_change(
    task: Task, new_stage_id: int, request: HttpRequest
) -> None:
    new_stage = Stage.objects.get(id=new_stage_id)
    task_url = request.build_absolute_uri(f'/tasks/{task.slug}')
    moved_by = get_user_display_name(request.user)

    if getattr(settings, 'CELERY_ENABLED', True):
        send_celery_task(
            send_about_moving_task,
            task.name,
            moved_by,
            new_stage.name,
            task_url,
        )


def get_task_context_data(task: Task, request: HttpRequest) -> dict[str, Any]:
    context = {'labels': task.labels.all()}

    if hasattr(task, 'checklist'):
        checklist_items = task.checklist.items.all()
        context['checklist_items'] = checklist_items
        total_checklist = checklist_items.count()
        done_checklist = checklist_items.filter(is_completed=True).count()
        progress_checklist = (
            int(done_checklist / total_checklist * 100)
            if total_checklist
            else 0
        )
        context['total_checklist'] = total_checklist
        context['done_checklist'] = done_checklist
        context['progress_checklist'] = progress_checklist
    else:
        context['checklist_items'] = []
        context['total_checklist'] = 0
        context['done_checklist'] = 0
        context['progress_checklist'] = 0

    comments = task.comments.filter(is_deleted=False).order_by('-created_at')
    paginator = Paginator(comments, 10)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)
    context['comments'] = page_obj

    return context


def get_checklist_progress(task: Task) -> dict[str, int]:
    if hasattr(task, 'checklist'):
        checklist_items = task.checklist.items.all()
        total_checklist = checklist_items.count()
        done_checklist = checklist_items.filter(is_completed=True).count()
        progress_checklist = (
            int(done_checklist / total_checklist * 100)
            if total_checklist
            else 0
        )
    else:
        total_checklist = 0
        done_checklist = 0
        progress_checklist = 0

    return {
        'progress_checklist': progress_checklist,
        'done_checklist': done_checklist,
        'total_checklist': total_checklist,
    }


def toggle_checklist_item(checklist_item_id: int) -> ChecklistItem:
    checklist_item = get_object_or_404(ChecklistItem, pk=checklist_item_id)
    checklist_item.is_completed = not checklist_item.is_completed
    checklist_item.save()
    return checklist_item


def create_comment(
    task_slug: str, request: HttpRequest
) -> tuple[bool, str, Comment | None]:
    task = get_object_or_404(Task, slug=task_slug)

    if request.user not in {task.author, task.executor}:
        return (
            False,
            'У вас нет прав для добавления комментариев к этой задаче.',
            None,
        )

    form = CommentForm(request.POST)
    if form.is_valid():
        comment = form.save(commit=False)
        comment.task = task
        comment.author = request.user
        comment.save()

        if (
            task.executor
            and task.executor != request.user
            and getattr(settings, 'CELERY_ENABLED', True)
        ):
            send_celery_task(send_comment_notification, comment.id)

        return True, 'Comment created successfully', comment
    return False, f'Ошибка: {form.errors}', None


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

    form = CommentForm(request.POST, instance=comment)
    if form.is_valid():
        comment = form.save(commit=False)
        comment.updated_at = now()
        comment.save()
        return True, 'Comment updated successfully', comment
    return False, f'Ошибка: {form.errors}', None


def delete_comment(comment_id: int, request: HttpRequest) -> tuple[bool, str]:
    comment = get_object_or_404(Comment, id=comment_id)

    if not comment.can_delete(request.user):
        return False, 'У вас нет прав для удаления этого комментария.'

    comment.soft_delete()
    return True, 'Comment deleted successfully'


def get_comments_for_task(
    task_slug: str, request: HttpRequest
) -> dict[str, Any]:
    task = get_object_or_404(Task, slug=task_slug)
    comments = task.comments.filter(is_deleted=False).order_by('-created_at')

    paginator = Paginator(comments, 10)
    page_number = request.GET.get('page')
    page_obj = paginator.get_page(page_number)

    return {
        'comments': page_obj,
        'task': task,
    }


def close_or_reopen_task(
    task_slug: str, request: HttpRequest
) -> tuple[bool, str]:
    task = get_object_or_404(Task, slug=task_slug)
    task_url = request.build_absolute_uri(f'/tasks/{task_slug}')

    if request.user not in {task.author, task.executor}:
        return False, 'У вас нет прав для изменения состояния этой задачи'

    task.state = not task.state
    task.save()

    if task.state:
        if getattr(settings, 'CELERY_ENABLED', True):
            send_celery_task(send_about_closing_task, task.name, task_url)
        return True, 'Статус задачи изменен.'
    if getattr(settings, 'CELERY_ENABLED', True):
        send_celery_task(send_about_opening_task, task.name, task_url)
    return True, 'Статус задачи изменен.'


def delete_task_with_notification(task: Task) -> None:
    task_name = task.name
    if getattr(settings, 'CELERY_ENABLED', True):
        send_celery_task(send_about_deleting_task, task_name)
    task.delete()
