import pytest
from django.urls import reverse_lazy, reverse
from django.core.management import call_command

from task_manager.labels.models import Label
from task_manager.tasks.models import Task
from task_manager.users.models import User


@pytest.fixture(autouse=True)
def load_fixtures(django_db_setup, django_db_blocker):
    """Fixture to load initial data from fixtures."""
    with django_db_blocker.unblock():
        call_command('loaddata', 'users.yaml')
        call_command('loaddata', 'labels.yaml')
        call_command('loaddata', 'tasks.yaml')


@pytest.fixture
def client():
    """Fixture for Django test client."""
    from django.test.client import Client

    return Client()


@pytest.fixture
def user(db):
    """Fixture for the first user from the fixture."""
    return User.objects.get(pk=1)


@pytest.fixture
def tasks(db):
    """Fixture for tasks from the fixture."""
    return Task.objects.all()


@pytest.fixture
def labels(db):
    """Fixture for labels from the fixture."""
    return Label.objects.all()


@pytest.mark.django_db
def test_label_list(client, user, labels):
    """Test label list view."""
    client.force_login(user)
    response = client.get(reverse_lazy('labels:list'))
    assert response.status_code == 200
    labels_list = list(response.context['labels'])
    assert labels_list == list(labels)


@pytest.mark.django_db
def test_create_label(client, user):
    """Test creating a new label."""
    client.force_login(user)
    name_new_label = {'name': 'Новая метка'}

    response = client.post(
        reverse_lazy('labels:create'),
        name_new_label,
        follow=True,
    )

    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/labels/'
    created_label = Label.objects.get(name=name_new_label['name'])
    assert created_label.name == 'Новая метка'


@pytest.mark.django_db
def test_change_label(client, user, labels):
    """Test updating a label."""
    client.force_login(user)
    label_to_update = labels[1]  # Assuming the second label is at index 1
    url = reverse('labels:update_label', args=(label_to_update.pk,))
    name_new_label = {'name': 'Blue'}

    response = client.post(url, name_new_label, follow=True)

    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/labels/'
    updated_label = Label.objects.get(pk=label_to_update.pk)
    assert updated_label.name == 'Blue'


@pytest.mark.django_db
def test_delete_label(client, user, labels):
    """Test deleting a label without associated tasks."""
    client.force_login(user)
    Task.objects.all().delete()
    label_to_delete = labels[1]  # Assuming the second label is at index 1
    url = reverse_lazy('labels:delete_label', args=(label_to_delete.pk,))

    response = client.post(url, follow=True)

    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/labels/'
    with pytest.raises(Label.DoesNotExist):
        Label.objects.get(pk=label_to_delete.pk)


@pytest.mark.django_db
def test_delete_label_with_tasks(client, user, labels):
    """Test attempting to delete a label with associated tasks."""
    client.force_login(user)
    label_to_delete = labels[1]  # Assuming the second label is at index 1
    url = reverse_lazy('labels:delete_label', args=(label_to_delete.pk,))

    response = client.post(url, follow=True)

    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/labels/'
    assert Label.objects.filter(pk=label_to_delete.pk).exists()


@pytest.mark.django_db
def test_label_list_without_authorization(client):
    """Test accessing label list without authorization."""
    response = client.get(reverse_lazy('labels:list'))
    assert response.status_code == 302
    assert response.url == '/login/?next=/labels/'
