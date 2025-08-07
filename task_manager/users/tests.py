from django.test import TestCase, Client
from django.urls import reverse
from faker import Faker

from task_manager.users.models import User


# Create your tests here.
class TestUser(TestCase):
    fixtures = ['users.yaml']

    def setUp(self) -> None:
        self.user1 = User.objects.get(pk=1)
        self.user2 = User.objects.get(pk=2)
        self.client: Client = Client()
        self.faker = Faker()

    def test_create_user(self) -> None:
        """Тест: создание пользователя недоступно, когда в системе уже есть пользователи"""
        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_delete_user(self) -> None:
        user = self.user2
        self.client.force_login(user)
        url = reverse('users:delete_user', args=(user.id,))

        response = self.client.post(url, follow=True)

        with self.assertRaises(User.DoesNotExist):
            User.objects.get(pk=user.id)

        self.assertRedirects(response, '/login/?next=/tasks/')

    def test_registration_restricted_when_users_exist(self) -> None:
        """Тест: регистрация недоступна, когда в системе уже есть пользователи"""
        # У нас уже есть пользователи из фикстур
        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_first_user_becomes_superuser(self) -> None:
        """Тест: первый пользователь становится суперадмином"""
        # Удаляем всех пользователей
        User.objects.all().delete()

        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        # Создаем первого пользователя
        Faker.seed(0)
        username = self.faker.user_name()
        first_name = self.faker.first_name()
        last_name = self.faker.last_name()
        set_password = self.faker.password(length=12)
        new_user = {
            'first_name': first_name,
            'last_name': last_name,
            'username': username,
            'password1': set_password,
            'password2': set_password,
        }

        response = self.client.post(url, new_user, follow=True)
        self.assertRedirects(response, '/login/')

        # Проверяем, что пользователь стал суперадмином
        created_user = User.objects.get(username=username)
        self.assertTrue(created_user.is_superuser)
        self.assertTrue(created_user.is_staff)

    def test_registration_available_when_no_users(self) -> None:
        """Тест: регистрация доступна, когда в системе нет пользователей"""
        # Удаляем всех пользователей
        User.objects.all().delete()

        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_registration_available_context_processor(self) -> None:
        """Тест: контекстный процессор registration_available работает правильно"""
        from task_manager.context_processors import registration_available
        from django.test import RequestFactory

        # Создаем фейковый запрос
        factory = RequestFactory()
        request = factory.get('/')

        # Когда есть пользователи, регистрация недоступна
        context = registration_available(request)
        self.assertFalse(context['registration_available'])

        # Удаляем всех пользователей
        User.objects.all().delete()

        # Когда нет пользователей, регистрация доступна
        context = registration_available(request)
        self.assertTrue(context['registration_available'])
