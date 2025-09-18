from __future__ import annotations

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.test import APIClient
from transliterate import translit

from task_manager.labels.models import Label
from task_manager.tasks.models import Stage, Task
from task_manager.users.models import User


class TaskAPITestCase(TestCase):
    @classmethod
    def setUpTestData(cls) -> None:
        cls.user = User.objects.create_user(
            username='author',
            email='author@example.com',
            password='password123',
        )
        cls.other_user = User.objects.create_user(
            username='executor',
            email='executor@example.com',
            password='password123',
        )
        cls.default_stage = Stage.objects.create(name='to_do', order=1)
        cls.other_stage = Stage.objects.create(name='in_progress', order=2)
        cls.label = Label.objects.create(name='Backend')
        cls.other_label = Label.objects.create(name='Urgent')

        cls.task = Task.objects.create(
            name='Одна новая задача',
            description='Описание задачи',
            author=cls.other_user,
            executor=cls.user,
            stage=cls.default_stage,
        )
        cls.task.set_reminder_periods_list([10, 20])
        cls.task.save(update_fields=['reminder_periods'])
        cls.task.labels.set([cls.label, cls.other_label])

        cls.second_task = Task.objects.create(
            name='Майская задача',
            description='Ещё одна задача',
            author=cls.user,
            executor=cls.other_user,
            stage=cls.other_stage,
        )
        cls.second_task.set_reminder_periods_list([15])
        cls.second_task.save(update_fields=['reminder_periods'])
        cls.second_task.labels.set([cls.label])

    def setUp(self) -> None:
        super().setUp()
        self.client = APIClient()
        self.user = self.__class__.user
        self.other_user = self.__class__.other_user
        self.label = self.__class__.label
        self.default_stage = self.__class__.default_stage
        self.task = self.__class__.task
        self.list_url = reverse('api:task-list')

    def authenticate(self) -> None:
        self.client.force_authenticate(self.user)

    def test_requires_authentication(self) -> None:
        response = APIClient().get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_tasks(self) -> None:
        self.authenticate()
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # ViewSet фильтрует задачи по автору, поэтому видим только задачи текущего пользователя
        user_tasks_count = Task.objects.filter(author=self.user).count()
        self.assertEqual(len(response.data), user_tasks_count)

    def test_create_task_with_default_stage_and_slug(self) -> None:
        self.authenticate()
        payload = {
            'name': 'Новая задача',
            'description': 'Описание новой задачи',
            'executor': self.other_user.pk,
            'labels': [self.label.pk],
            'deadline': timezone.now().isoformat(),
            'reminder_periods': [10, 20],
        }
        response = self.client.post(self.list_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        created_task = Task.objects.get(pk=response.data['id'])
        expected_slug = slugify(
            translit(payload['name'], language_code='ru', reversed=True)
        )
        self.assertEqual(created_task.slug, expected_slug)
        default_stage = Stage.objects.order_by('order').first()
        self.assertEqual(created_task.stage, default_stage)
        self.assertEqual(created_task.author, self.user)
        self.assertListEqual(response.data['reminder_periods'], [10, 20])
        self.assertListEqual(
            created_task.get_reminder_periods_list(), ['10', '20']
        )

    def test_update_task_updates_slug_and_reminders(self) -> None:
        self.authenticate()
        # Создаем задачу, где текущий пользователь является автором
        task = Task.objects.create(
            name='Задача для обновления',
            description='Описание задачи',
            author=self.user,  # Важно: текущий пользователь - автор
            executor=self.other_user,
            stage=self.default_stage,
        )
        detail_url = reverse('api:task-detail', args=[task.pk])
        payload = {
            'name': 'Обновленная задача',
            'reminder_periods': [30],
        }
        response = self.client.patch(detail_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(
            task.slug,
            slugify(
                translit(payload['name'], language_code='ru', reversed=True)
            ),
        )
        self.assertListEqual(task.get_reminder_periods_list(), ['30'])
        self.assertEqual(task.author, self.user)
        self.assertListEqual(response.data['reminder_periods'], [30])

    def test_delete_task(self) -> None:
        self.authenticate()
        task = Task.objects.create(
            name='Задача на удаление',
            description='Удалить меня',
            author=self.user,  # Важно: текущий пользователь - автор
            executor=self.other_user,
            stage=self.default_stage,
        )
        detail_url = reverse('api:task-detail', args=[task.pk])
        response = self.client.delete(detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Task.objects.filter(pk=task.pk).exists())

    def test_reminder_periods_serialization_round_trip(self) -> None:
        self.authenticate()
        # Создаем задачу, где текущий пользователь является автором
        task = Task.objects.create(
            name='Задача для тестирования напоминаний',
            description='Описание задачи',
            author=self.user,  # Важно: текущий пользователь - автор
            executor=self.other_user,
            stage=self.default_stage,
        )
        task.set_reminder_periods_list([10, 20])
        task.save(update_fields=['reminder_periods'])

        detail_url = reverse('api:task-detail', args=[task.pk])
        response = self.client.get(detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            all(
                isinstance(value, int)
                for value in response.data['reminder_periods']
            )
        )

        payload = {'reminder_periods': [60, 120, '180']}
        response = self.client.patch(detail_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertListEqual(
            task.get_reminder_periods_list(), ['60', '120', '180']
        )
        self.assertListEqual(response.data['reminder_periods'], [60, 120, 180])
