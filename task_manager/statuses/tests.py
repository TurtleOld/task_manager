from django.test import TestCase
from django.urls import reverse_lazy, reverse

from task_manager.labels.models import Label
from task_manager.statuses.models import Status
from task_manager.tasks.models import Task
from task_manager.users.models import User


class TestStatus(TestCase):
    fixtures = ['users.yaml', 'statuses.yaml', 'tasks.yaml', 'labels.yaml']

    def setUp(self) -> None:
        self.user = User.objects.get(pk=1)
        self.status1 = Status.objects.get(pk=1)
        self.status2 = Status.objects.get(pk=2)
        self.task1 = Task.objects.get(pk=1)
        self.label1 = Label.objects.get(pk=1)
        self.label2 = Label.objects.get(pk=2)

    def test_status_list(self) -> None:
        self.client.force_login(self.user)
        response = self.client.get(reverse_lazy('statuses:list'))
        self.assertEqual(response.status_code, 200)
        statuses_list = list(response.context['statuses'])
        self.assertQuerySetEqual(statuses_list, [self.status1, self.status2])

    def test_create_status(self) -> None:
        self.client.force_login(self.user)
        name_new_status = {'name': 'На тестировании'}

        new_data = self.client.post(
            reverse_lazy('statuses:create'),
            name_new_status,
            follow=True,
        )

        self.assertRedirects(new_data, '/statuses/')
        created_status = Status.objects.get(name=name_new_status['name'])
        self.assertEqual(created_status.name, 'На тестировании')

    def test_change_status(self) -> None:
        self.client.force_login(self.user)
        url = reverse('statuses:update_status', args=(self.status1.pk,))
        name_new_status = {'name': 'Завершен'}
        response = self.client.post(url, name_new_status, follow=True)
        self.assertEqual(Status.objects.get(pk=self.status1.id), self.status1)
        self.assertRedirects(response, '/statuses/')

    def test_delete_status(self) -> None:
        self.client.force_login(self.user)
        url = reverse('statuses:delete_status', args=(self.status2.pk,))
        response = self.client.post(url, follow=True)
        self.assertRedirects(response, '/statuses/')

    def test_delete_status_with_tasks(self) -> None:
        self.client.force_login(self.user)
        url = reverse_lazy('statuses:delete_status', args=(self.status1.pk,))
        response = self.client.post(url, follow=True)
        self.assertTrue(Status.objects.filter(pk=self.status1.id).exists())
        self.assertRedirects(response, '/statuses/')

    def test_status_list_without_authorization(self) -> None:
        response = self.client.get(reverse_lazy('statuses:list'))
        self.assertRedirects(response, '/login/?next=/statuses/')
