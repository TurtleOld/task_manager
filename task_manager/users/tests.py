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
        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        # create new user
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

    def test_delete_user(self) -> None:
        user = self.user2
        self.client.force_login(user)
        url = reverse('users:delete_user', args=(user.id,))

        response = self.client.post(url, follow=True)

        with self.assertRaises(User.DoesNotExist):
            User.objects.get(pk=user.id)

        self.assertRedirects(response, '/login/?next=/users/')
