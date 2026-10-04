from __future__ import annotations

import argparse

from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand

from kanban.models import Attachment


class Command(BaseCommand):
    help = "Report attachments whose file is missing from storage; delete them with --delete"

    def add_arguments(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--delete",
            action="store_true",
            help="delete the reported attachments",
        )

    def handle(self, *args: object, **options: object) -> None:
        broken = [
            attachment
            for attachment in Attachment.objects.exclude(path="").order_by("card_id", "id")
            if not default_storage.exists(attachment.path)
        ]
        for attachment in broken:
            self.stdout.write(
                "\t".join(
                    [
                        str(attachment.id),
                        f"задача {attachment.card_id}",
                        attachment.name,
                        attachment.path,
                    ]
                )
            )
        self.stdout.write(f"Вложений без файла: {len(broken)}")

        if options["delete"] and broken:
            Attachment.objects.filter(id__in=[attachment.id for attachment in broken]).delete()
            self.stdout.write(self.style.SUCCESS(f"Удалено: {len(broken)}"))
