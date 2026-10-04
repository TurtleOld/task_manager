from __future__ import annotations

import io
import logging
from datetime import timedelta
from pathlib import Path

import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from kanban.models import Attachment, Board, Card, Column, RecurrenceFrequency, RecurrenceRule
from kanban.tasks import generate_recurring_cards


@pytest.fixture(autouse=True)
def media_root(tmp_path: Path, settings) -> None:
    settings.MEDIA_ROOT = str(tmp_path)


def attach(card: Card, name: str = "договор.pdf") -> Attachment:
    path = default_storage.save(f"cards/{card.id}/{name}", ContentFile(b"%PDF"))
    return Attachment.objects.create(
        card=card, name=name, type="file", path=path, url=default_storage.url(path)
    )


def recurring_series(column: Column) -> tuple[Card, Card]:
    now = timezone.now()
    first = Card.objects.create(
        column=column,
        title="Оплатить интернет",
        deadline=now - timedelta(minutes=1),
        completed_at=now,
    )
    attach(first)
    rule = RecurrenceRule.objects.create(
        card=first,
        freq=RecurrenceFrequency.WEEKLY,
        interval=1,
        next_due=now - timedelta(minutes=1),
    )
    generate_recurring_cards()
    return first, Card.objects.get(parent_recurrence=rule)


@pytest.mark.django_db()
def test_recurrence_copy_shares_the_file_of_the_previous_instance(column: Column) -> None:
    first, copy = recurring_series(column)

    assert copy.attachments.get().path == first.attachments.get().path


@pytest.mark.django_db()
def test_deleting_attachment_in_one_instance_keeps_the_file_for_the_others(
    auth_client: APIClient, column: Column, django_capture_on_commit_callbacks
) -> None:
    first, copy = recurring_series(column)
    shared = copy.attachments.get()

    with django_capture_on_commit_callbacks(execute=True):
        resp = auth_client.delete(f"/api/v1/cards/{copy.id}/attachments/{shared.id}/")

    assert resp.status_code == 200
    assert not copy.attachments.exists()
    assert default_storage.exists(first.attachments.get().path)


@pytest.mark.django_db()
def test_deleting_the_last_reference_removes_the_file(
    auth_client: APIClient, card: Card, django_capture_on_commit_callbacks
) -> None:
    attachment = attach(card)

    with django_capture_on_commit_callbacks(execute=True):
        auth_client.delete(f"/api/v1/cards/{card.id}/attachments/{attachment.id}/")

    assert not default_storage.exists(attachment.path)


@pytest.mark.django_db()
def test_file_is_kept_when_the_deleting_transaction_does_not_commit(
    auth_client: APIClient, card: Card, django_capture_on_commit_callbacks
) -> None:
    attachment = attach(card)

    with django_capture_on_commit_callbacks(execute=False):
        auth_client.delete(f"/api/v1/cards/{card.id}/attachments/{attachment.id}/")

    assert default_storage.exists(attachment.path)


@pytest.mark.django_db()
def test_failed_file_removal_is_logged_and_the_attachment_stays_deleted(
    auth_client: APIClient,
    card: Card,
    django_capture_on_commit_callbacks,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    attachment = attach(card)

    def broken_delete(path: str) -> None:
        raise OSError("read-only file system")

    monkeypatch.setattr(default_storage, "delete", broken_delete)
    monkeypatch.setattr(logging.getLogger("kanban"), "propagate", True)

    with caplog.at_level(logging.WARNING, logger="kanban.attachments"):
        with django_capture_on_commit_callbacks(execute=True):
            resp = auth_client.delete(f"/api/v1/cards/{card.id}/attachments/{attachment.id}/")

    assert resp.status_code == 200
    assert not Attachment.objects.filter(id=attachment.id).exists()
    assert attachment.path in caplog.text


@pytest.mark.django_db()
def test_permanent_card_deletion_removes_files_of_the_card_and_its_subtasks(
    auth_client: APIClient, column: Column, card: Card, django_capture_on_commit_callbacks
) -> None:
    subtask = Card.objects.create(column=column, parent=card, title="Подзадача")
    paths = [attach(card).path, attach(subtask, "чек.jpg").path]
    Card.objects.filter(id__in=[card.id, subtask.id]).update(archived_at=timezone.now())

    with django_capture_on_commit_callbacks(execute=True):
        resp = auth_client.delete(f"/api/v1/cards/{card.id}/")

    assert resp.status_code == 204
    assert not any(default_storage.exists(path) for path in paths)


@pytest.mark.django_db()
def test_permanent_deletion_of_an_instance_keeps_the_file_shared_with_another(
    auth_client: APIClient, column: Column, django_capture_on_commit_callbacks
) -> None:
    first, copy = recurring_series(column)
    Card.objects.filter(id=first.id).update(archived_at=timezone.now())

    with django_capture_on_commit_callbacks(execute=True):
        auth_client.delete(f"/api/v1/cards/{first.id}/")

    assert default_storage.exists(copy.attachments.get().path)


@pytest.mark.django_db()
def test_permanent_board_deletion_removes_files_of_its_tasks(
    auth_client: APIClient, board: Board, card: Card, django_capture_on_commit_callbacks
) -> None:
    path = attach(card).path
    Board.objects.filter(id=board.id).update(archived_at=timezone.now())

    with django_capture_on_commit_callbacks(execute=True):
        resp = auth_client.delete(f"/api/v1/boards/{board.id}/")

    assert resp.status_code == 204
    assert not default_storage.exists(path)


@pytest.mark.django_db()
def test_attachment_files_command_reports_attachments_without_a_file(card: Card) -> None:
    intact = attach(card)
    broken = attach(card, "чек.jpg")
    default_storage.delete(broken.path)
    Attachment.objects.create(card=card, name="Сайт", type="link", url="https://example.com")
    out = io.StringIO()

    call_command("check_attachment_files", stdout=out)

    assert str(broken.id) in out.getvalue()
    assert str(intact.id) not in out.getvalue()
    assert Attachment.objects.filter(id=broken.id).exists()


@pytest.mark.django_db()
def test_attachment_files_command_deletes_broken_attachments_on_request(card: Card) -> None:
    intact = attach(card)
    broken = attach(card, "чек.jpg")
    default_storage.delete(broken.path)

    call_command("check_attachment_files", "--delete", stdout=io.StringIO())

    assert list(Attachment.objects.values_list("id", flat=True)) == [intact.id]
