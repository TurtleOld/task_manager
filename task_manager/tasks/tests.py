from datetime import datetime, timedelta
from unittest.mock import patch
from django.test import TestCase
from django.urls import reverse_lazy, reverse
from django_filters import FilterSet

from task_manager.labels.models import Label
from task_manager.statuses.models import Status
from task_manager.tasks.models import ReminderPeriod, Task
from task_manager.users.models import User


class TestTask(TestCase):
    fixtures = ['users.yaml', 'statuses.yaml', 'tasks.yaml', 'labels.yaml']

    def setUp(self) -> None:
        self.user1 = User.objects.get(pk=1)
        self.user2 = User.objects.get(pk=2)
        self.user3 = User.objects.get(pk=3)
        self.status1 = Status.objects.get(pk=1)
        self.status2 = Status.objects.get(pk=2)
        self.task1 = Task.objects.get(pk=1)
        self.task2 = Task.objects.get(pk=2)
        self.label1 = Label.objects.get(pk=1)
        self.label2 = Label.objects.get(pk=2)
        self.reminderperiod2 = ReminderPeriod.objects.get(pk=2)
        self.reminderperiod3 = ReminderPeriod.objects.get(pk=3)
        self.reminderperiod4 = ReminderPeriod.objects.get(pk=4)
        self.reminderperiod5 = ReminderPeriod.objects.get(pk=5)

    def test_list_tasks(self):
        self.client.force_login(self.user1)
        response = self.client.get(reverse_lazy('tasks:list'))
        self.assertEqual(response.status_code, 200)
        tasks_list = list(response.context['tasks'])
        self.assertQuerySetEqual(tasks_list, [self.task2, self.task1])

    @patch('task_manager.tasks.tasks.send_message_about_adding_task.delay')
    @patch('task_manager.tasks.tasks.send_notification_about_task.apply_async')
    def test_create_tasks(self, mock_send_massage, mock_send_notification):
        self.client.force_login(self.user1)
        new_task = {
            'name': 'Новая задача',
            'description': 'description',
            'author': 1,
            'executor': 2,
            'status': 1,
            'labels': [1, 2],
            'deadline': (datetime.now() + timedelta(days=1)).isoformat(),
            'reminder_periods': [1, 2],
        }
        response = self.client.post(
            reverse_lazy('tasks:create'), new_task, follow=True
        )

        self.assertRedirects(response, '/tasks/')
        created_task = Task.objects.get(name=new_task['name'])
        self.assertEqual(created_task.name, 'Новая задача')

    def test_close_task(self):
        self.client.force_login(self.user3)
        url = reverse_lazy('tasks:close_task', args=(self.task1.slug,))
        response = self.client.post(url, follow=True)
        self.assertRedirects(response, '/tasks/')
        self.task1.refresh_from_db()
        self.assertFalse(self.task1.state)

    @patch('task_manager.tasks.tasks.send_about_updating_task.apply_async')
    @patch('task_manager.tasks.tasks.send_notification_about_task.apply_async')
    def test_update_task(self, mock_send_massage, mock_send_notification):
        self.client.force_login(self.user1)
        url = reverse('tasks:update_task', args=(self.task1.slug,))
        changed_task = {
            'name': 'New task',
            'description': 'description',
            'author': 2,
            'executor': 1,
            'status': 2,
            'labels': [1, 2],
            'slug': 'new-task',
            'deadline': (datetime.now() + timedelta(days=1)).isoformat(),
            'reminder_periods': [3, 4],
        }

        response = self.client.post(url, changed_task, follow=True)
        self.assertRedirects(response, '/tasks/')
        created_task = Task.objects.get(name=changed_task['name'])
        self.assertEqual(created_task.name, 'New task')

    @patch('task_manager.tasks.tasks.send_about_deleting_task.apply_async')
    def test_delete_task(self, mock_send_massage):
        self.client.force_login(self.user1)
        url = reverse_lazy('tasks:delete_task', args=(self.task1.slug,))
        response = self.client.post(url, follow=True)
        with self.assertRaises(Task.DoesNotExist):
            Task.objects.get(pk=self.task1.id)
        self.assertRedirects(response, '/tasks/')
        mock_send_massage.assert_called_once()

    def test_delete_task_not_author(self):
        self.client.force_login(self.user1)
        url = reverse_lazy('tasks:delete_task', args=(self.task2.slug,))
        response = self.client.post(url, follow=True)
        self.assertTrue(Task.objects.filter(pk=self.task2.pk).exists())
        self.assertRedirects(response, '/tasks/')

    def test_filter_status(self):
        status = Task._meta.get_field('status')
        result = FilterSet.filter_for_field(status, 'status')
        self.assertEqual(result.field_name, 'status')

    def test_filter_executor(self):
        status = Task._meta.get_field('executor')
        result = FilterSet.filter_for_field(status, 'executor')
        self.assertEqual(result.field_name, 'executor')

    def test_filter_label(self):
        status = Task._meta.get_field('labels')
        result = FilterSet.filter_for_field(status, 'labels')
        self.assertEqual(result.field_name, 'labels')
