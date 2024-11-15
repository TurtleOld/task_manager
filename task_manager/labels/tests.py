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
        self.task2 = Task.objects.get(pk=2)

        self.label1 = Label.objects.get(pk=1)
        self.label2 = Label.objects.get(pk=2)

    def test_label_list(self) -> None:
        self.client.force_login(self.user)
        response = self.client.get(reverse_lazy('labels:list'))
        self.assertEqual(response.status_code, 200)
        labels_list = list(response.context['labels'])
        self.assertQuerySetEqual(labels_list, [self.label1, self.label2])

    def test_create_label(self) -> None:
        self.client.force_login(self.user)
        name_new_label = {'name': 'Новая метка'}

        new_data = self.client.post(
            reverse_lazy('labels:create'),
            name_new_label,
            follow=True,
        )

        self.assertRedirects(new_data, '/labels/')
        created_status = Label.objects.get(name=name_new_label['name'])
        self.assertEqual(created_status.name, 'Новая метка')

    def test_change_label(self) -> None:
        self.client.force_login(self.user)
        url = reverse('labels:update_label', args=(self.label2.pk,))
        name_new_label = {'name': 'Blue'}
        response = self.client.post(url, name_new_label, follow=True)
        self.assertEqual(Label.objects.get(pk=self.label2.id), self.label2)
        self.assertRedirects(response, '/labels/')

    def test_delete_label(self) -> None:
        self.client.force_login(self.user)
        Task.objects.all().delete()
        url = reverse_lazy('labels:delete_label', args=(self.label2.pk,))
        response = self.client.post(url, follow=True)
        self.assertRedirects(response, '/labels/')
        with self.assertRaises(Label.DoesNotExist):
            Label.objects.get(pk=self.label2.pk)

    def test_delete_label_with_tasks(self) -> None:
        self.client.force_login(self.user)
        url = reverse_lazy('labels:delete_label', args=(self.label2.pk,))
        response = self.client.post(url, follow=True)
        self.assertTrue(Label.objects.filter(pk=self.label2.id).exists())

        self.assertRedirects(response, '/labels/')

    def test_status_list_without_authorization(self) -> None:
        response = self.client.get(reverse_lazy('labels:list'))
        self.assertRedirects(response, '/login/?next=/labels/')
