"""Tests for the users app.

This module contains comprehensive tests for user management functionality,
including authentication, registration, profile management, and theme
customization.
"""

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
    """Test suite for user management functionality."""

    fixtures = ['users.yaml']

    def setUp(self) -> None:
        """Set up test data and client."""
        self.user1 = User.objects.get(pk=1)
        self.user2 = User.objects.get(pk=2)
        self.client: Client = Client()
        self.faker = Faker()

    def test_create_user(self) -> None:
        """Test that user creation is restricted when users already exist."""
        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTP_FORBIDDEN)

    def test_delete_user(self) -> None:
        """Test user deletion functionality."""
        user = self.user2
        self.client.force_login(user)
        url = reverse('users:delete_user', args=(user.pk,))

        response = self.client.post(url, follow=True)

        with self.assertRaises(User.DoesNotExist):
            User.objects.get(pk=user.pk)

        self.assertRedirects(response, '/login/?next=/tasks/')

    def test_registration_restricted_when_users_exist(self) -> None:
        """Test that registration is restricted when users already exist."""
        # We already have users from fixtures
        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTP_FORBIDDEN)

    def test_first_user_becomes_superuser(self) -> None:
        """Test that the first user becomes a superuser."""
        # Remove all users
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

        # Check that the user became a superuser
        created_user = User.objects.get(username=username)
        self.assertTrue(created_user.is_superuser)
        self.assertTrue(created_user.is_staff)

    def test_registration_available_when_no_users(self) -> None:
        """Test that registration is available when no users exist."""
        # Remove all users
        User.objects.all().delete()

        url = reverse('users:create')
        response = self.client.get(url)
        self.assertEqual(response.status_code, HTTP_OK)

    def test_registration_available_context_processor(self) -> None:
        """Test that the registration_available context processor works."""
        # Create a fake request
        factory = RequestFactory()
        request = factory.get('/')

        # When users exist, registration is not available
        context = registration_available(request)
        self.assertFalse(context['registration_available'])
