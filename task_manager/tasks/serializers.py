from __future__ import annotations

from typing import Any

from rest_framework import serializers

from task_manager.labels.models import Label
from task_manager.tasks.models import Stage, Task
from task_manager.users.models import User


class ReminderPeriodsField(serializers.Field[Any, Any]):
    default_error_messages = {
        'not_a_list': 'Напоминания должны быть переданы списком.',
        'invalid_item': 'Каждый период напоминания должен быть целым числом.',
    }

    def to_representation(self, value: Task) -> list[int]:
        if isinstance(value, Task):
            periods = value.get_reminder_periods_list()
        else:
            periods = []
        result: list[int] = []
        for period in periods:
            try:
                result.append(int(period))
            except (TypeError, ValueError):
                continue
        return result

    def to_internal_value(self, data: Any) -> dict[str, list[int]]:
        if data in (None, ''):
            return {'reminder_periods': []}

        if not isinstance(data, (list, tuple)):
            self.fail('not_a_list')

        result: list[int] = []
        for item in data:
            try:
                result.append(int(item))
            except (TypeError, ValueError):
                self.fail('invalid_item')
        return {'reminder_periods': result}


class TaskSerializer(serializers.ModelSerializer[Task]):
    reminder_periods = ReminderPeriodsField(source='*', required=False)
    stage = serializers.PrimaryKeyRelatedField(
        queryset=Stage.objects.all(),
        allow_null=True,
        required=False,
    )
    executor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        allow_null=True,
        required=False,
    )
    labels = serializers.PrimaryKeyRelatedField(
        queryset=Label.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = Task
        fields = (
            'id',
            'slug',
            'name',
            'description',
            'state',
            'deadline',
            'created_at',
            'stage',
            'executor',
            'author',
            'labels',
            'reminder_periods',
        )
        read_only_fields = (
            'id',
            'slug',
            'created_at',
            'author',
        )

    def create(self, validated_data: dict[str, Any]) -> Task:
        reminder_periods = validated_data.pop('reminder_periods', None)
        labels = validated_data.pop('labels', [])
        task = Task.objects.create(**validated_data)
        if reminder_periods is not None:
            task.set_reminder_periods_list(reminder_periods)
            task.save(update_fields=['reminder_periods'])
        if labels is not None:
            task.labels.set(labels)
        return task

    def update(self, instance: Task, validated_data: dict[str, Any]) -> Task:
        reminder_periods = validated_data.pop('reminder_periods', None)
        labels = validated_data.pop('labels', None)
        task = super().update(instance, validated_data)
        if reminder_periods is not None:
            task.set_reminder_periods_list(reminder_periods)
            task.save()
        if labels is not None:
            task.labels.set(labels)
        return task
