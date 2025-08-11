from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from django.core.paginator import Paginator
from django.test import Client, TestCase
from django.urls import reverse, reverse_lazy
from django_filters import FilterSet

from task_manager.labels.models import Label
from task_manager.tasks.models import Comment, ReminderPeriod, Stage, Task
from task_manager.users.models import User


class TestTask(TestCase):
    fixtures = ['users.yaml', 'tasks.yaml', 'labels.yaml']

    def setUp(self) -> None:
        self.user1 = User.objects.get(pk=1)
        self.user2 = User.objects.get(pk=2)
        self.stage = Stage.objects.get(pk=1)
        self.task1 = Task.objects.get(pk=1)
        self.task2 = Task.objects.get(pk=2)
        self.label1 = Label.objects.get(pk=1)
        self.label2 = Label.objects.get(pk=2)
        self.reminderperiod2 = ReminderPeriod.objects.get(pk=2)
        self.reminderperiod3 = ReminderPeriod.objects.get(pk=3)
        self.reminderperiod4 = ReminderPeriod.objects.get(pk=4)
        self.reminderperiod5 = ReminderPeriod.objects.get(pk=5)

    def test_list_tasks(self) -> None:
        self.client.force_login(self.user1)
        self.assertTrue(self.user1.is_active)
        response = self.client.get(reverse_lazy('tasks:list'), follow=True)
        self.assertEqual(response.status_code, 200)

    @patch('task_manager.tasks.tasks.send_message_about_adding_task.delay')
    @patch('task_manager.tasks.tasks.send_notification_about_task.apply_async')
    def test_create_tasks(
        self,
        mock_send_massage: MagicMock,
        mock_send_notification: MagicMock,
    ) -> None:
        self.client.force_login(self.user1)
        new_task = {
            'name': 'Новая задача',
            'description': 'description',
            'author': 1,
            'executor': 2,
            'labels': [1, 2],
            'image': '',
            'stage': 1,
            'order': 3,
            'deadline': (datetime.now() + timedelta(days=1)).isoformat(),
            'reminder_periods': [2, 3],
        }
        response = self.client.post(reverse_lazy('tasks:create'), new_task, follow=True)

        self.assertRedirects(response, '/tasks/')
        created_task = Task.objects.get(name=new_task['name'])
        self.assertEqual(created_task.name, 'Новая задача')

    def test_close_task(self) -> None:
        self.client.force_login(self.user2)
        url = reverse_lazy('tasks:close_task', args=(self.task1.slug,))
        response = self.client.post(url, follow=True)
        self.assertRedirects(response, '/tasks/')
        self.task1.refresh_from_db()
        self.assertFalse(self.task1.state)

    @patch('task_manager.tasks.tasks.send_about_deleting_task.apply_async')
    def test_delete_task(self, mock_send_massage: MagicMock) -> None:
        self.client.force_login(self.user1)
        url = reverse_lazy('tasks:delete_task', args=(self.task1.slug,))
        response = self.client.post(url, follow=True)
        with self.assertRaises(Task.DoesNotExist):
            Task.objects.get(pk=self.task1.pk)
        self.assertRedirects(response, '/tasks/')

    def test_delete_task_not_author(self) -> None:
        self.client.force_login(self.user1)
        url = reverse_lazy('tasks:delete_task', args=(self.task2.slug,))
        response = self.client.post(url, follow=True)
        self.assertTrue(Task.objects.filter(slug=self.task2.slug).exists())
        self.assertRedirects(response, '/tasks/')

    def test_filter_executor(self) -> None:
        status = Task._meta.get_field('executor')
        result = FilterSet.filter_for_field(status, 'executor')
        self.assertEqual(result.field_name, 'executor')

    def test_filter_label(self) -> None:
        status = Task._meta.get_field('labels')
        result = FilterSet.filter_for_field(status, 'labels')
        self.assertEqual(result.field_name, 'labels')


class TestComments(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(
            username='commentuser1',
            email='comment1@example.com',
            password='testpass123',
        )
        self.user2 = User.objects.create_user(
            username='commentuser2',
            email='comment2@example.com',
            password='testpass123',
        )

        self.stage = Stage.objects.create(name='Comment Test Stage', order=0)

        self.task = Task.objects.create(
            name='Comment Test Task',
            description='Test task for comments',
            author=self.user1,
            executor=self.user2,
            stage=self.stage,
            slug='comment-test-task',
        )

        self.client = Client()

    def test_comment_creation(self):
        self.client.login(username='commentuser1', password='testpass123')

        response = self.client.post(
            reverse('tasks:comment_create', kwargs={'task_slug': self.task.slug}),
            {'content': 'Test comment content'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Comment.objects.filter(content='Test comment content').exists())

    def test_comment_permissions(self):
        comment = Comment.objects.create(
            task=self.task, author=self.user1, content='Test comment'
        )

        self.assertTrue(comment.can_edit(self.user1))
        self.assertFalse(comment.can_edit(self.user2))

        self.assertTrue(comment.can_delete(self.user1))
        self.assertFalse(comment.can_delete(self.user2))

    def test_comment_soft_delete(self):
        comment = Comment.objects.create(
            task=self.task, author=self.user1, content='Test comment'
        )

        comment.soft_delete()

        self.assertTrue(comment.is_deleted)
        self.assertTrue(Comment.objects.filter(id=comment.id).exists())

    def test_comment_pagination(self):
        for i in range(15):
            Comment.objects.create(
                task=self.task, author=self.user1, content=f'Comment {i+1}'
            )

        comments = self.task.comments.filter(is_deleted=False).order_by('-created_at')
        self.assertEqual(comments.count(), 15)

        paginator = Paginator(comments, 10)
        self.assertEqual(paginator.num_pages, 2)
        self.assertEqual(len(paginator.page(1)), 10)
        self.assertEqual(len(paginator.page(2)), 5)

    def test_comment_access_control(self):
        User.objects.create_user(
            username='commentuser3',
            email='comment3@example.com',
            password='testpass123',
        )

        self.client.login(username='commentuser3', password='testpass123')

        response = self.client.post(
            reverse('tasks:comment_create', kwargs={'task_slug': self.task.slug}),
            {'content': 'Unauthorized comment'},
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            Comment.objects.filter(content='Unauthorized comment').exists()
        )

    def test_comment_edit_permissions(self):
        comment = Comment.objects.create(
            task=self.task, author=self.user1, content='Original comment'
        )

        self.client.login(username='commentuser1', password='testpass123')

        response = self.client.post(
            reverse('tasks:comment_update', kwargs={'comment_id': comment.id}),
            {'content': 'Updated comment'},
        )

        self.assertEqual(response.status_code, 200)
        comment.refresh_from_db()
        self.assertEqual(comment.content, 'Updated comment')

    def test_comment_delete_permissions(self):
        comment = Comment.objects.create(
            task=self.task, author=self.user1, content='Comment to delete'
        )

        self.client.login(username='commentuser1', password='testpass123')

        response = self.client.post(
            reverse('tasks:comment_delete', kwargs={'comment_id': comment.id})
        )

        self.assertEqual(response.status_code, 200)
        comment.refresh_from_db()
        self.assertTrue(comment.is_deleted)

    def test_comment_edit_status_display(self):
        comment = Comment.objects.create(
            task=self.task, author=self.user1, content='Original comment'
        )

        self.assertIsNone(comment.updated_at)

        self.client.login(username='commentuser1', password='testpass123')

        response = self.client.post(
            reverse('tasks:comment_update', kwargs={'comment_id': comment.id}),
            {'content': 'Updated comment'},
        )

        self.assertEqual(response.status_code, 200)
        comment.refresh_from_db()

        self.assertIsNotNone(comment.updated_at)
        self.assertNotEqual(comment.created_at, comment.updated_at)
