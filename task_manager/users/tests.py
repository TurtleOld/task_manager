from django.test import Client, RequestFactory, TestCase
from django.urls import reverse
from faker import Faker

from task_manager.constants import (
    DEFAULT_PASSWORD_LENGTH,
    HTTP_FORBIDDEN,
    HTTP_OK,
)
from task_manager.context_processors import registration_available
from task_manager.users.models import User


class TestUser(TestCase):
    fixtures = ['users.yaml']

    def setUp(self) -> None:
        self.user1 = User.objects.get(pk=1)
        self.user2 = User.objects.get(pk=2)
        self.client: Client = Client()
        self.faker = Faker()

    def test_create_user(self) -> None:
        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTP_FORBIDDEN)

    def test_delete_user(self) -> None:
        user = self.user2
        self.client.force_login(user)
        url = reverse('users:delete_user', args=(user.id,))

        response = self.client.post(url, follow=True)

        with self.assertRaises(User.DoesNotExist):
            User.objects.get(pk=user.id)

        self.assertRedirects(response, '/login/?next=/tasks/')

    def test_registration_restricted_when_users_exist(self) -> None:
        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTP_FORBIDDEN)

    def test_first_user_becomes_superuser(self) -> None:
        User.objects.all().delete()

        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTP_OK)

        Faker.seed(0)
        username = self.faker.user_name()
        first_name = self.faker.first_name()
        last_name = self.faker.last_name()
        set_password = self.faker.password(length=DEFAULT_PASSWORD_LENGTH)
        new_user = {
            'first_name': first_name,
            'last_name': last_name,
            'username': username,
            'password1': set_password,
            'password2': set_password,
        }

        response = self.client.post(url, new_user, follow=True)
        self.assertRedirects(response, '/login/')

        created_user = User.objects.get(username=username)
        self.assertTrue(created_user.is_superuser)
        self.assertTrue(created_user.is_staff)

    def test_registration_available_when_no_users(self) -> None:
        User.objects.all().delete()

        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTP_OK)

    def test_registration_available_context_processor(self) -> None:
        factory = RequestFactory()
        request = factory.get('/')

        context = registration_available(request)
        self.assertFalse(context['registration_available'])

        User.objects.all().delete()

        context = registration_available(request)
        self.assertTrue(context['registration_available'])
