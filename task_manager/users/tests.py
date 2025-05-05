import pytest
from django.urls import reverse
from faker import Faker
from django.core.management import call_command

from task_manager.users.models import User


@pytest.fixture(autouse=True)
def load_fixtures(django_db_setup, django_db_blocker):
    """Fixture to load initial data from fixtures."""
    with django_db_blocker.unblock():
        call_command('loaddata', 'users.yaml')


@pytest.fixture
def client():
    """Fixture for Django test client."""
    from django.test.client import Client

    return Client()


@pytest.fixture
def faker():
    """Fixture for Faker instance."""
    return Faker()


@pytest.fixture
def user1(db):
    """Fixture for the first user from the fixture."""
    return User.objects.get(pk=1)


@pytest.fixture
def user2(db):
    """Fixture for the second user from the fixture."""
    return User.objects.filter(pk=2).first()


@pytest.mark.django_db
def test_create_user(client, faker):
    """Test creating a new user."""
    url = reverse('users:create')
    response = client.get(url)
    assert response.status_code == 200

    # Create new user
    Faker.seed(0)
    username = faker.user_name()
    first_name = faker.first_name()
    last_name = faker.last_name()
    set_password = faker.password(length=12)
    new_user = {
        'first_name': first_name,
        'last_name': last_name,
        'username': username,
        'password1': set_password,
        'password2': set_password,
    }

    response = client.post(url, new_user, follow=True)
    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/login/'


@pytest.mark.django_db
def test_delete_user(client, user2):
    """Test deleting a user."""
    client.force_login(user2)
    url = reverse('users:delete_user', args=(user2.pk,))

    response = client.post(url, follow=True)
    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/login/?next=/tasks/'

    with pytest.raises(User.DoesNotExist):
        User.objects.get(pk=user2.pk)
