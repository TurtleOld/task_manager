from __future__ import annotations

from django.contrib import admin

from .models import Board, Column, Card


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "created_at", "updated_at")


@admin.register(Column)
class ColumnAdmin(admin.ModelAdmin):
    list_display = ("id", "board", "name", "position")
    list_filter = ("board",)


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ("id", "board", "column", "title", "position")
    list_filter = ("board", "column")
