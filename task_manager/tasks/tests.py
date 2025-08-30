"""Tests for the tasks app."""

import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse_lazy
from django.utils import timezone

from task_manager.labels.models import Label
from task_manager.tasks.models import (
    Checklist,
    ChecklistItem,
    Comment,
    Stage,
    Task,
)

User = get_user_model()

HTTP_OK = 200
HTTP_CREATED = 201
HTTP_BAD_REQUEST = 400
HTTP_FORBIDDEN = 403
HTTP_NOT_FOUND = 404

TASK_NAME = 'Test Task'
TASK_DESCRIPTION = 'Test Description'
TASK_NAME_CONSTANT = 'name'
TASK_DESCRIPTION_CONSTANT = 'description'


class TestData(TestCase):
    fixtures = ['users.yaml', 'tasks.yaml', 'labels.yaml']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user1 = None
        self.user2 = None
        self.stage1 = None
        self.stage2 = None
        self.label1 = None
        self.label2 = None
        self.task1 = None
        self.task2 = None

    def setUp(self) -> None:
        self.user1 = User.objects.get(pk=1)
        self.user2 = User.objects.get(pk=2)
        self.stage1 = Stage.objects.get(pk=1)
        self.stage2 = Stage.objects.get(pk=2)
        self.label1 = Label.objects.get(pk=1)
        self.label2 = Label.objects.get(pk=2)
        self.task1 = Task.objects.get(pk=1)
        self.task2 = Task.objects.get(pk=2)

    def _login_user1(self) -> None:
        self.client.force_login(self.user1)

    def _login_user2(self) -> None:
        self.client.force_login(self.user2)


class TestTask(TestData):
    def test_list_tasks(self) -> None:
        self._login_user1()
        self.assertTrue(self.user1.is_active)
        response = self.client.get(reverse_lazy('tasks:list'), follow=True)
        self.assertEqual(response.status_code, HTTP_OK)

    def test_create_tasks(self) -> None:
        with patch(
            'task_manager.tasks.tasks.send_message_about_adding_task'
        ) as mock_send_message:
            mock_send_message.kiq = MagicMock()
            self._login_user1()
            new_task = {
                TASK_NAME_CONSTANT: TASK_NAME,
                TASK_DESCRIPTION_CONSTANT: TASK_DESCRIPTION,
                'author': 1,
                'executor': 2,
                'stage': 1,
                'order': 0,
                'deadline': timezone.now() + timezone.timedelta(days=1),
                'labels': [1, 2],
                'reminder_periods': [],
            }

            response = self.client.post(
                reverse_lazy('tasks:create'),
                new_task,
                follow=True,
            )

            self.assertEqual(response.status_code, HTTP_OK)
            created_task = Task.objects.get(name=TASK_NAME)
            self.assertEqual(created_task.description, TASK_DESCRIPTION)
            self.assertEqual(created_task.author, self.user1)
            self.assertEqual(created_task.executor, self.user2)
            self.assertEqual(created_task.stage, self.stage1)
            self.assertEqual(created_task.order, 0)
            self.assertEqual(created_task.labels.count(), 2)

    def test_create_task_with_checklist(self) -> None:
        self._login_user1()
        checklist_data = json.dumps([
            {'text': 'Item 1', 'is_completed': False},
            {'text': 'Item 2', 'is_completed': True},
        ])

        new_task = {
            TASK_NAME_CONSTANT: 'Task with Checklist',
            TASK_DESCRIPTION_CONSTANT: 'Description',
            'author': 1,
            'executor': 2,
            'stage': 1,
            'order': 0,
            'checklist_items': checklist_data,
        }

        response = self.client.post(
            reverse_lazy('tasks:create'),
            new_task,
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)
        created_task = Task.objects.get(name='Task with Checklist')
        self.assertTrue(hasattr(created_task, 'checklist'))
        self.assertEqual(created_task.checklist.items.count(), 2)

    def test_update_task(self) -> None:
        self._login_user1()
        updated_data = {
            TASK_NAME_CONSTANT: 'Updated Task',
            TASK_DESCRIPTION_CONSTANT: 'Updated Description',
            'author': 1,
            'executor': 2,
            'stage': 1,
            'order': 1,
        }

        response = self.client.post(
            reverse_lazy('tasks:update_task', kwargs={'slug': self.task1.slug}),
            updated_data,
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)
        updated_task = Task.objects.get(pk=self.task1.pk)
        self.assertEqual(updated_task.name, 'Updated Task')
        self.assertEqual(updated_task.description, 'Updated Description')
        self.assertEqual(updated_task.order, 1)

    def test_delete_task(self) -> None:
        self._login_user1()
        response = self.client.post(
            reverse_lazy('tasks:delete_task', kwargs={'slug': self.task1.slug}),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)
        with self.assertRaises(Task.DoesNotExist):
            Task.objects.get(pk=self.task1.pk)

    def test_delete_task_unauthorized(self) -> None:
        self._login_user2()
        response = self.client.post(
            reverse_lazy('tasks:delete_task', kwargs={'slug': self.task1.slug}),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_view_task(self) -> None:
        self._login_user1()
        response = self.client.get(
            reverse_lazy('tasks:view_task', kwargs={'slug': self.task1.slug}),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)
        self.assertEqual(response.context['task'], self.task1)

    def test_close_task(self) -> None:
        self._login_user1()
        response = self.client.post(
            reverse_lazy('tasks:close_task', kwargs={'slug': self.task1.slug}),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)
        updated_task = Task.objects.get(pk=self.task1.pk)
        self.assertTrue(updated_task.state)

    def test_close_task_unauthorized(self) -> None:
        self._login_user2()
        response = self.client.post(
            reverse_lazy('tasks:close_task', kwargs={'slug': self.task1.slug}),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_create_stage(self) -> None:
        self._login_user1()
        new_stage = {
            'name': 'New Stage',
            'order': 3,
        }

        response = self.client.post(
            reverse_lazy('tasks:create_stage'),
            new_stage,
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)
        created_stage = Stage.objects.get(name='New Stage')
        self.assertEqual(created_stage.order, 3)

    def test_download_file(self) -> None:
        self._login_user1()
        response = self.client.get(
            reverse_lazy(
                'tasks:download_file', kwargs={'slug': self.task1.slug}
            ),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)


class TestChecklist(TestData):
    def test_checklist_progress(self) -> None:
        self._login_user1()
        response = self.client.get(
            reverse_lazy(
                'tasks:checklist_progress', kwargs={'task_id': self.task1.pk}
            ),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_toggle_checklist_item(self) -> None:
        self._login_user1()
        checklist, _ = Checklist.objects.get_or_create(task=self.task1)
        item = ChecklistItem.objects.create(
            checklist=checklist, text='Test Item', is_completed=False, order=0
        )

        response = self.client.post(
            reverse_lazy('tasks:toggle_checklist_item', kwargs={'pk': item.pk}),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)
        updated_item = ChecklistItem.objects.get(pk=item.pk)
        self.assertTrue(updated_item.is_completed)


class TestComments(TestData):
    def test_comments_list(self) -> None:
        self._login_user1()
        response = self.client.get(
            reverse_lazy(
                'tasks:comments_list', kwargs={'slug': self.task1.slug}
            ),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_create_comment(self) -> None:
        self._login_user1()
        comment_data = {
            'content': 'Test comment content',
        }

        response = self.client.post(
            reverse_lazy(
                'tasks:comment_create', kwargs={'slug': self.task1.slug}
            ),
            comment_data,
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_create_comment_unauthorized(self) -> None:
        self._login_user2()
        comment_data = {
            'content': 'Test comment content',
        }

        response = self.client.post(
            reverse_lazy(
                'tasks:comment_create', kwargs={'slug': self.task1.slug}
            ),
            comment_data,
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_update_comment(self) -> None:
        self._login_user1()
        comment = Comment.objects.create(
            task=self.task1, author=self.user1, content='Original content'
        )

        updated_data = {
            'content': 'Updated content',
        }

        response = self.client.post(
            reverse_lazy(
                'tasks:comment_update', kwargs={'comment_id': comment.pk}
            ),
            updated_data,
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_update_comment_unauthorized(self) -> None:
        self._login_user1()
        comment = Comment.objects.create(
            task=self.task1, author=self.user1, content='Original content'
        )

        self._login_user2()
        updated_data = {
            'content': 'Updated content',
        }

        response = self.client.post(
            reverse_lazy(
                'tasks:comment_update', kwargs={'comment_id': comment.pk}
            ),
            updated_data,
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_delete_comment(self) -> None:
        self._login_user1()
        comment = Comment.objects.create(
            task=self.task1, author=self.user1, content='Test comment'
        )

        response = self.client.post(
            reverse_lazy(
                'tasks:comment_delete', kwargs={'comment_id': comment.pk}
            ),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_delete_comment_unauthorized(self) -> None:
        self._login_user1()
        comment = Comment.objects.create(
            task=self.task1, author=self.user1, content='Test comment'
        )

        self._login_user2()
        response = self.client.post(
            reverse_lazy(
                'tasks:comment_delete', kwargs={'comment_id': comment.pk}
            ),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_comment_edit_form(self) -> None:
        self._login_user1()
        comment = Comment.objects.create(
            task=self.task1, author=self.user1, content='Test comment'
        )

        response = self.client.get(
            reverse_lazy(
                'tasks:comment_edit_form', kwargs={'comment_id': comment.pk}
            ),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_comment_edit_form_unauthorized(self) -> None:
        self._login_user1()
        comment = Comment.objects.create(
            task=self.task1, author=self.user1, content='Test comment'
        )

        self._login_user2()
        response = self.client.get(
            reverse_lazy(
                'tasks:comment_edit_form', kwargs={'comment_id': comment.pk}
            ),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_comment_view(self) -> None:
        self._login_user1()
        comment = Comment.objects.create(
            task=self.task1, author=self.user1, content='Test comment'
        )

        response = self.client.get(
            reverse_lazy(
                'tasks:comment_view', kwargs={'comment_id': comment.pk}
            ),
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)


class TestTaskManagement(TestData):
    def test_update_task_stage(self) -> None:
        self._login_user1()
        data = {
            'task_id': self.task1.pk,
            'new_stage_id': self.stage2.pk,
            'new_order': 0,
        }

        response = self.client.post(
            reverse_lazy('tasks:update_task_stage'),
            data=json.dumps(data),
            content_type='application/json',
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)

    def test_update_task_order(self) -> None:
        self._login_user1()
        data = {
            'tasks': [
                {
                    'id': self.task1.pk,
                    'stage_id': self.stage1.pk,
                    'order': 1,
                },
                {
                    'id': self.task2.pk,
                    'stage_id': self.stage1.pk,
                    'order': 0,
                },
            ]
        }

        response = self.client.post(
            reverse_lazy('tasks:update_task_order'),
            data=json.dumps(data),
            content_type='application/json',
            follow=True,
        )

        self.assertEqual(response.status_code, HTTP_OK)
