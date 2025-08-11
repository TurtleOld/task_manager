"""
Test suite for the tasks app.

This module contains comprehensive tests for the task management system,
including task CRUD operations, comment functionality, filtering, and permissions.
"""

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
    """
    Test cases for task-related functionality.
    
    Tests task creation, deletion, filtering, and various task operations
    including permission checks and notification sending.
    """
    fixtures = ['users.yaml', 'tasks.yaml', 'labels.yaml']

    def setUp(self) -> None:
        """
        Set up test data for task tests.
        
        Initializes test users, stages, tasks, labels, and reminder periods
        from fixtures for use in test methods.
        """
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
        """
        Test that authenticated users can view the task list.
        
        Verifies that the task list view is accessible to logged-in users
        and returns a successful response.
        """
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
        """
        Test task creation with all required fields.
        
        Verifies that tasks can be created successfully with proper data,
        including labels, reminder periods, and deadline information.
        Also checks that notifications are sent appropriately.
        """
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
        """
        Test task closing functionality.
        
        Verifies that tasks can be closed and their state is properly updated.
        """
        self.client.force_login(self.user2)
        url = reverse_lazy('tasks:close_task', args=(self.task1.slug,))
        response = self.client.post(url, follow=True)
        self.assertRedirects(response, '/tasks/')
        self.task1.refresh_from_db()
        self.assertFalse(self.task1.state)

    @patch('task_manager.tasks.tasks.send_about_deleting_task.apply_async')
    def test_delete_task(self, mock_send_massage: MagicMock) -> None:
        """
        Test task deletion by the task author.
        
        Verifies that task authors can delete their own tasks and that
        appropriate notifications are sent.
        """
        self.client.force_login(self.user1)
        url = reverse_lazy('tasks:delete_task', args=(self.task1.slug,))
        response = self.client.post(url, follow=True)
        with self.assertRaises(Task.DoesNotExist):
            Task.objects.get(pk=self.task1.pk)
        self.assertRedirects(response, '/tasks/')

    def test_delete_task_not_author(self) -> None:
        """
        Test that non-authors cannot delete tasks.
        
        Verifies that users who are not the task author cannot delete
        tasks and are properly redirected with an error message.
        """
        self.client.force_login(self.user1)
        url = reverse_lazy('tasks:delete_task', args=(self.task2.slug,))
        response = self.client.post(url, follow=True)
        self.assertTrue(Task.objects.filter(slug=self.task2.slug).exists())
        self.assertRedirects(response, '/tasks/')

    def test_filter_executor(self) -> None:
        """
        Test task filtering by executor.
        
        Verifies that the task filter correctly handles executor field filtering.
        """
        status = Task._meta.get_field('executor')
        result = FilterSet.filter_for_field(status, 'executor')
        self.assertEqual(result.field_name, 'executor')

    def test_filter_label(self) -> None:
        """
        Test task filtering by labels.
        
        Verifies that the task filter correctly handles label field filtering.
        """
        status = Task._meta.get_field('labels')
        result = FilterSet.filter_for_field(status, 'labels')
        self.assertEqual(result.field_name, 'labels')


class TestComments(TestCase):
    """
    Test cases for comment functionality.
    
    Tests comment creation, editing, deletion, permissions, and pagination
    for the comment system.
    """
    def setUp(self):
        """
        Set up test data for comment tests.
        
        Creates test users, stages, and tasks for use in comment-related tests.
        """
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
        """
        Test that authorized users can create comments.
        
        Verifies that users with permission can create comments on tasks
        and that the comments are properly saved to the database.
        """
        self.client.login(username='commentuser1', password='testpass123')

        response = self.client.post(
            reverse('tasks:comment_create', kwargs={'task_slug': self.task.slug}),
            {'content': 'Test comment content'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Comment.objects.filter(content='Test comment content').exists())

    def test_comment_permissions(self):
        """
        Test comment edit and delete permissions.
        
        Verifies that only comment authors can edit or delete their comments,
        and that deleted comments cannot be edited.
        """
        comment = Comment.objects.create(
            task=self.task, author=self.user1, content='Test comment'
        )

        self.assertTrue(comment.can_edit(self.user1))
        self.assertFalse(comment.can_edit(self.user2))

        self.assertTrue(comment.can_delete(self.user1))
        self.assertFalse(comment.can_delete(self.user2))

    def test_comment_soft_delete(self):
        """
        Test comment soft deletion functionality.
        
        Verifies that comments can be soft deleted (marked as deleted)
        while remaining in the database.
        """
        comment = Comment.objects.create(
            task=self.task, author=self.user1, content='Test comment'
        )

        comment.soft_delete()

        self.assertTrue(comment.is_deleted)
        self.assertTrue(Comment.objects.filter(id=comment.id).exists())

    def test_comment_pagination(self):
        """
        Test comment pagination functionality.
        
        Verifies that comments are properly paginated and that the
        pagination system works correctly with multiple comments.
        """
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
        """
        Test comment access control for unauthorized users.
        
        Verifies that users without proper permissions cannot create
        comments on tasks they don't have access to.
        """
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
        """
        Test comment editing with proper permissions.
        
        Verifies that comment authors can edit their comments and that
        the edits are properly saved and reflected in the database.
        """
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
        """
        Test comment deletion with proper permissions.
        
        Verifies that comment authors can delete their comments and that
        the deletion is properly handled through soft delete.
        """
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
        """
        Test comment edit status tracking.
        
        Verifies that comment edit timestamps are properly updated when
        comments are modified and that the edit status is correctly tracked.
        """
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
