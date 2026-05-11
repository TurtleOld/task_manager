from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction

from .models import Board, Card, Column, Label

BOARD_TEMPLATES: dict[str, dict[str, Any]] = {
    "family": {
        "name": "Семейные дела",
        "icon": "🏡",
        "color": "#16a34a",
        "columns": [
            {"name": "Нужно сделать", "icon": "📋"},
            {"name": "В процессе", "icon": "⚡"},
            {"name": "Готово", "icon": "✅", "is_done": True},
        ],
        "cards": [
            {
                "column": "Нужно сделать",
                "title": "Составить список покупок",
                "labels": ["Хозяйство"],
            },
            {"column": "Нужно сделать", "title": "Оплатить счета", "labels": ["Финансы"]},
        ],
    },
    "renovation": {
        "name": "Ремонт",
        "icon": "🛠️",
        "color": "#d97706",
        "columns": [
            {"name": "Идеи", "icon": "💡"},
            {"name": "Купить", "icon": "🛒"},
            {"name": "Работы", "icon": "🧰"},
            {"name": "Готово", "icon": "✅", "is_done": True},
        ],
        "cards": [
            {"column": "Идеи", "title": "Собрать референсы", "labels": ["Планирование"]},
            {"column": "Купить", "title": "Выбрать краску", "labels": ["Материалы"]},
        ],
    },
    "vacation": {
        "name": "Отпуск",
        "icon": "🏖️",
        "color": "#0891b2",
        "columns": [
            {"name": "План", "icon": "🗺️"},
            {"name": "Бронирования", "icon": "🎫"},
            {"name": "Собрать", "icon": "🎒"},
            {"name": "Готово", "icon": "✅", "is_done": True},
        ],
        "cards": [
            {"column": "План", "title": "Проверить документы", "labels": ["Важно"]},
            {"column": "Собрать", "title": "Аптечка", "labels": ["Список"]},
        ],
    },
    "shopping": {
        "name": "Покупки",
        "icon": "🛒",
        "color": "#db2777",
        "columns": [
            {"name": "Купить", "icon": "🛒"},
            {"name": "Сравнить", "icon": "🔍"},
            {"name": "Куплено", "icon": "✅", "is_done": True},
        ],
        "cards": [
            {"column": "Купить", "title": "Продукты на неделю", "labels": ["Еда"]},
            {"column": "Сравнить", "title": "Подарок", "labels": ["Семья"]},
        ],
    },
}

LABEL_COLORS = {
    "Хозяйство": "#16a34a",
    "Финансы": "#2563eb",
    "Планирование": "#7c3aed",
    "Материалы": "#d97706",
    "Важно": "#dc2626",
    "Список": "#0891b2",
    "Еда": "#16a34a",
    "Семья": "#db2777",
}


def list_board_templates() -> list[dict[str, str]]:
    return [
        {
            "id": template_id,
            "name": template["name"],
            "icon": template["icon"],
            "color": template["color"],
        }
        for template_id, template in BOARD_TEMPLATES.items()
    ]


@transaction.atomic
def create_board_from_template(template_id: str, name: str | None = None) -> Board:
    template = BOARD_TEMPLATES.get(template_id)
    if template is None:
        raise KeyError(template_id)

    board = Board.objects.create(
        name=(name or str(template["name"])).strip(),
        icon=template["icon"],
        color=template["color"],
    )
    columns_by_name: dict[str, Column] = {}
    for index, column_data in enumerate(template["columns"], start=1):
        column = Column.objects.create(
            board=board,
            name=column_data["name"],
            icon=column_data.get("icon", ""),
            position=Decimal(index),
            is_default=True,
            is_done=column_data.get("is_done", False),
        )
        columns_by_name[column.name] = column

    for card_data in template.get("cards", []):
        column = columns_by_name.get(card_data["column"])
        if column is None:
            continue
        card = Card.objects.create(column=column, title=card_data["title"])
        labels = []
        for label_name in card_data.get("labels", []):
            label, _ = Label.objects.get_or_create(
                name=label_name,
                defaults={"color": LABEL_COLORS.get(label_name, "#64748b")},
            )
            labels.append(label)
        if labels:
            card.labels.set(labels)

    return board
