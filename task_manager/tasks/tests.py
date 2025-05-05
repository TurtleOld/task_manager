import pytest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from django.core.management import call_command
from django.urls import reverse_lazy
from django_filters import FilterSet

from task_manager.labels.models import Label
from task_manager.tasks.models import ReminderPeriod, Task, Stage
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
def user1(db):
    """Fixture for the first user from the fixture."""
    return User.objects.get(pk=1)


@pytest.fixture
def user2(db):
    """Fixture for the second user from the fixture."""
    return User.objects.get(pk=2)


@pytest.fixture
def stage(db):
    """Fixture for the first stage from the fixture."""
    return Stage.objects.get(pk=1)


@pytest.fixture
def task1(db):
    """Fixture for the first task from the fixture."""
    return Task.objects.get(pk=1)


@pytest.fixture
def task2(db):
    """Fixture for the second task from the fixture."""
    return Task.objects.get(pk=2)


@pytest.fixture
def label1(db):
    """Fixture for the first label from the fixture."""
    return Label.objects.get(pk=1)


@pytest.fixture
def label2(db):
    """Fixture for the second label from the fixture."""
    return Label.objects.get(pk=2)


@pytest.fixture
def reminder_periods(db):
    """Fixture for reminder periods from the fixture."""
    return {
        2: ReminderPeriod.objects.get(pk=2),
        3: ReminderPeriod.objects.get(pk=3),
        4: ReminderPeriod.objects.get(pk=4),
        5: ReminderPeriod.objects.get(pk=5),
    }


@pytest.mark.django_db
def test_list_tasks(client, user1):
    """Test listing tasks."""
    client.force_login(user1)
    assert user1.is_active
    response = client.get(reverse_lazy('tasks:list'), follow=True)
    assert response.status_code == 200


@pytest.mark.django_db
@patch('task_manager.tasks.tasks.send_message_about_adding_task.delay')
@patch('task_manager.tasks.tasks.send_notification_about_task.apply_async')
def test_create_tasks(
    mock_send_notification: MagicMock,
    mock_send_message: MagicMock,
    client,
    user1,
    stage,
    label1,
    label2,
    reminder_periods,
):
    """Test creating a new task."""
    client.force_login(user1)
    new_task = {
        'name': 'Новая задача',
        'description': 'description',
        'author': user1.id,
        'executor': user1.id,
        'labels': [label1.id, label2.id],
        'image': '',
        'stage': stage.id,
        'order': 3,
        'deadline': (datetime.now() + timedelta(days=1)).isoformat(),
        'reminder_periods': [reminder_periods[2].id, reminder_periods[3].id],
    }
    response = client.post(reverse_lazy('tasks:create'), new_task, follow=True)

    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/tasks/'
    created_task = Task.objects.get(name=new_task['name'])
    assert created_task.name == 'Новая задача'


@pytest.mark.django_db
def test_close_task(client, user2, task1):
    """Test closing a task."""
    client.force_login(user2)
    url = reverse_lazy('tasks:close_task', args=(task1.slug,))
    response = client.post(url, follow=True)

    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/tasks/'
    task1.refresh_from_db()
    assert not task1.state


@pytest.mark.django_db
@patch('task_manager.tasks.tasks.send_about_deleting_task.apply_async')
def test_delete_task(mock_send_message: MagicMock, client, user1, task1):
    """Test deleting a task by its author."""
    client.force_login(user1)
    url = reverse_lazy('tasks:delete_task', args=(task1.slug,))
    response = client.post(url, follow=True)

    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/tasks/'
    with pytest.raises(Task.DoesNotExist):
        Task.objects.get(pk=task1.pk)


@pytest.mark.django_db
def test_delete_task_not_author(client, user1, task2):
    """Test attempting to delete a task by a non-author."""
    client.force_login(user1)
    url = reverse_lazy('tasks:delete_task', args=(task2.slug,))
    response = client.post(url, follow=True)

    assert response.status_code == 200
    assert response.redirect_chain[-1][0] == '/tasks/'
    assert Task.objects.filter(slug=task2.slug).exists()


@pytest.mark.django_db
def test_filter_executor():
    """Test filtering by executor field."""
    status = Task._meta.get_field('executor')
    result = FilterSet.filter_for_field(status, 'executor')
    assert result.field_name == 'executor'


@pytest.mark.django_db
def test_filter_label():
    """Test filtering by labels field."""
    status = Task._meta.get_field('labels')
    result = FilterSet.filter_for_field(status, 'labels')
    assert result.field_name == 'labels'
