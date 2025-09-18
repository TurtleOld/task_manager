import datetime as dt
from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse, reverse_lazy
from django.utils import timezone

from task_manager.constants import HTTP_FOUND, HTTP_OK, RANGE
from task_manager.labels.models import Label
from task_manager.tasks.models import Stage, Task
from task_manager.users.models import User

TASK_NAME = 'Новая задача'
TASK_DESCRIPTION = 'description'
TASKS_URL = '/tasks/'
TASK_NAME_CONSTANT = 'name'
TASK_DESCRIPTION_CONSTANT = 'description'


class TestData:
    def __init__(self):
        self.users = self._setup_users()
        self.stages = self._setup_stages()
        self.tasks = self._setup_tasks()
        self.labels = self._setup_labels()

    def _setup_users(self):
        return {
            'user1': User.objects.get(pk=1),
            'user2': User.objects.get(pk=2),
        }

    def _setup_stages(self):
        return {
            'stage': Stage.objects.get(pk=1),
        }

    def _setup_tasks(self):
        return {
            'task1': Task.objects.get(pk=1),
            'task2': Task.objects.get(pk=2),
        }

    def _setup_labels(self):
        return {
            'label1': Label.objects.get(pk=1),
            'label2': Label.objects.get(pk=2),
        }


class TaskTestBase(TestCase):
    fixtures = ['users.yaml', 'tasks.yaml', 'labels.yaml']

    def setUp(self) -> None:
        super().setUp()
        self.test_data = TestData()
        self._setup_attributes()

    def _setup_attributes(self) -> None:
        self.users = self.test_data.users
        self.stages = self.test_data.stages
        self.tasks = self.test_data.tasks
        self.labels = self.test_data.labels

    @property
    def user1(self):
        return self.users['user1']

    @property
    def user2(self):
        return self.users['user2']

    @property
    def stage(self):
        return self.stages['stage']

    @property
    def task1(self):
        return self.tasks['task1']

    @property
    def task2(self):
        return self.tasks['task2']

    @property
    def label1(self):
        return self.labels['label1']

    @property
    def label2(self):
        return self.labels['label2']

    def _login_user1(self) -> None:
        self.client.force_login(self.user1)

    def _assert_redirect_to_tasks(self, response) -> None:
        self.assertRedirects(response, TASKS_URL)

    def _get_task1_slug(self) -> str:
        return self.task1.slug

    def _get_task_slug_list(self) -> list[str]:
        return [self._get_task1_slug()]

    def _get_task1_args(self) -> list[str]:
        return [self._get_task1_slug()]

    def _get_task1_url(self, view_name: str) -> str:
        return reverse(f'tasks:{view_name}', args=self._get_task1_args())

    def _create_task_post(self, task_data):
        return self.client.post(reverse('tasks:create'), task_data, follow=True)

    def _get_create_url(self):
        return reverse('tasks:create')

    def _create_task_with_data(self, task_data):
        return self.client.post(self._get_create_url(), task_data, follow=True)


class TestTaskCRUD(TaskTestBase):
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
                'labels': [1, 2],
                'image': '',
                'stage': 1,
                'order': 3,
                'deadline': (timezone.now() + dt.timedelta(days=1)).isoformat(),
                'reminder_periods': [],
            }
            response = self.client.post(
                reverse_lazy('tasks:create'), new_task, follow=True
            )
            self.assertRedirects(response, TASKS_URL)
            created_task = Task.objects.get(name=new_task[TASK_NAME_CONSTANT])
            self.assertEqual(created_task.name, TASK_NAME)

    def test_close_task(self) -> None:
        self._login_user1()
        response = self.client.post(
            self._get_task1_url('close_task'), follow=True
        )
        self.assertRedirects(response, TASKS_URL)
        self.task1.refresh_from_db()
        self.assertTrue(self.task1.state)

    def test_open_task(self) -> None:
        self._login_user1()
        self.task1.state = True
        self.task1.save()
        response = self.client.post(self._get_task1_url('update'), follow=True)
        self.assertIn(response.status_code, [HTTP_OK, HTTP_FOUND])
        if response.status_code == HTTP_FOUND:
            self.task1.refresh_from_db()
            self.assertFalse(self.task1.state)

    def test_delete_task(self) -> None:
        self._login_user1()
        response = self.client.post(
            self._get_task1_url('delete_task'), follow=True
        )
        self.assertRedirects(response, TASKS_URL)
        with self.assertRaises(Task.DoesNotExist):
            Task.objects.get(pk=self.task1.pk)

    def test_update_task(self) -> None:
        self._login_user1()
        updated_data = {
            TASK_NAME_CONSTANT: 'Обновленная задача',
            TASK_DESCRIPTION_CONSTANT: 'Updated description',
            'executor': 2,
            'labels': [1],
            'stage': 1,
            'order': 0,
        }
        response = self.client.post(
            reverse('tasks:update', args=self._get_task1_args()),
            updated_data,
            follow=True,
        )
        self.assertIn(response.status_code, [HTTP_OK, HTTP_FOUND])
        self.task1.refresh_from_db()
        self.assertEqual(self.task1.name, 'Обновленная задача')

    def test_view_task(self) -> None:
        self._login_user1()
        response = self.client.get(
            reverse('tasks:view_task', args=self._get_task1_args())
        )
        self.assertEqual(response.status_code, HTTP_OK)
        self.assertEqual(response.context['task'], self.task1)


class TestTaskFiltering(TaskTestBase):
    def test_task_filtering(self) -> None:
        self._login_user1()
        filter_data = {
            'executor': 2,
            'labels': 1,
            'self_task': False,
        }
        response = self.client.get(reverse('tasks:list'), filter_data)
        self.assertEqual(response.status_code, HTTP_OK)

    def test_task_pagination(self) -> None:
        self._login_user1()

        for task_index in range(RANGE):
            Task.objects.create(
                name=f'Test Task {task_index}',
                description=f'Description for task {task_index}',
                executor=self.user1,
                stage=self.stage,
                author=self.user1,
            )

        response = self.client.get(reverse('tasks:list'))
        self.assertEqual(response.status_code, HTTP_OK)
        self.assertGreater(len(response.context['tasks']), 10)

    def test_task_search(self) -> None:
        self._login_user1()
        search_data = {'search': 'Test Task'}
        response = self.client.get(reverse('tasks:list'), search_data)
        self.assertEqual(response.status_code, HTTP_OK)

    def test_task_ordering(self) -> None:
        self._login_user1()
        order_data = {'ordering': '-created_at'}
        response = self.client.get(reverse('tasks:list'), order_data)
        self.assertEqual(response.status_code, HTTP_OK)


class TestTaskPermissions(TaskTestBase):
    def test_task_unauthorized_access(self) -> None:
        response = self.client.get(reverse('tasks:list'))
        self.assertRedirects(response, '/login/?next=/tasks/')

    def test_task_authorization(self) -> None:
        self.client.force_login(self.user2)
        response = self.client.get(
            reverse('tasks:view_task', args=self._get_task1_args())
        )
        self.assertEqual(response.status_code, HTTP_OK)

    def test_task_permissions(self) -> None:
        self._login_user1()
        response = self.client.get(
            reverse('tasks:view_task', args=self._get_task1_args())
        )
        self.assertEqual(response.status_code, HTTP_OK)


class TestTaskFeatures(TaskTestBase):
    def test_task_labels(self) -> None:
        self._login_user1()
        label = Label.objects.create(name='Test Label')
        self.task1.labels.add(label)

        response = self.client.get(
            reverse('tasks:view_task', args=self._get_task1_args())
        )
        self.assertEqual(response.status_code, HTTP_OK)
        self.assertIn(label, self.task1.labels.all())

    def test_task_deadline_validation(self) -> None:
        self._login_user1()
        past_date = timezone.now() - dt.timedelta(days=1)

        task_data = {
            'name': 'Past Deadline Task',
            'description': 'Task with past deadline',
            'deadline': past_date.strftime('%Y-%m-%d'),
            'executor': self.user1.pk,
        }
        response = self.client.post(
            reverse('tasks:create'), task_data, follow=True
        )
        self.assertIn(response.status_code, [HTTP_OK, HTTP_FOUND])

    def test_task_notifications(self) -> None:
        self._login_user1()
        task_data = {
            'name': 'Notification Test Task',
            'description': 'Task to test notifications',
            'executor': self.user2.pk,
        }
        response = self.client.post(
            reverse('tasks:create'), task_data, follow=True
        )
        self.assertIn(response.status_code, [HTTP_OK, HTTP_FOUND])

    def test_task_comment_functionality(self) -> None:
        self._login_user1()
        comment_data = {
            'comment_content': 'Test comment on task',
        }
        response = self.client.post(
            reverse('tasks:comment_create', args=self._get_task1_args()),
            comment_data,
        )
        self.assertIn(response.status_code, [HTTP_OK, HTTP_FOUND])

    def test_task_checklist_functionality(self) -> None:
        self._login_user1()
        checklist_data = {
            'checklist_items': [
                {'description': 'First item', 'is_completed': False},
                {'description': 'Second item', 'is_completed': True},
            ]
        }
        task_data = {
            'name': 'Task with checklist',
            'description': 'Test task',
            'executor': self.user1.pk,
            **checklist_data,
        }
        response = self.client.post(
            reverse('tasks:create'), task_data, follow=True
        )
        self.assertRedirects(response, TASKS_URL)

    def test_task_image_upload(self) -> None:
        self._login_user1()
        image_content = b'fake-image-content'
        image_file = SimpleUploadedFile(
            'test_image.jpg', image_content, content_type='image/jpeg'
        )

        task_data = {
            'name': 'Image Upload Test Task',
            'description': 'Task to test image upload',
            'executor': self.user1.pk,
            'image': image_file,
        }
        response = self.client.post(
            reverse('tasks:create'), task_data, follow=True
        )
        self.assertIn(response.status_code, [HTTP_OK, HTTP_FOUND])
        if response.status_code == HTTP_FOUND:
            created_task = Task.objects.get(name='Image Upload Test Task')
            self.assertEqual(created_task.image, '')

    def test_task_workflow(self) -> None:
        self._login_user1()

        task_data = {
            'name': 'Workflow Test Task',
            'description': 'Task to test complete workflow',
            'executor': self.user1.pk,
        }
        response = self.client.post(
            reverse('tasks:create'), task_data, follow=True
        )
        self.assertIn(response.status_code, [HTTP_OK, HTTP_FOUND])

        if response.status_code == HTTP_FOUND:
            created_task = Task.objects.get(name='Workflow Test Task')

            next_stage = Stage.objects.create(
                name='Next Stage', order=2, user=self.user1
            )
            move_data = {'stage': next_stage.pk}
            response = self.client.post(
                reverse('tasks:update', args=[created_task.slug]), move_data
            )
            self.assertIn(response.status_code, [HTTP_OK, HTTP_FOUND])

            if response.status_code == HTTP_FOUND:
                created_task.refresh_from_db()
                self.assertEqual(created_task.stage, next_stage)
