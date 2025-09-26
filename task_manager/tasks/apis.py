from __future__ import annotations

from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from task_manager.tasks.models import Stage, Task
from task_manager.tasks.permissions import IsAuthenticated
from task_manager.tasks.serializers import TaskSerializer
from task_manager.tasks.services import slugify_translit


class StageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stage
        fields = ['id', 'name', 'order']


class StageViewSet(ModelViewSet):
    serializer_class = StageSerializer
    permission_classes = [IsAuthenticated]
    queryset = Stage.objects.all()

    def get_queryset(self):
        return Stage.objects.all().order_by('order')

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)


class TaskViewSet(ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    queryset = Task.objects.select_related(
        'stage', 'author', 'executor'
    ).prefetch_related('labels')

    def get_queryset(self):
        return super().get_queryset().filter(author=self.request.user)

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def _get_default_stage(self) -> Stage | None:
        return Stage.objects.order_by('order').first()

    def perform_create(self, serializer: TaskSerializer) -> None:
        name = serializer.validated_data.get('name', '')
        slug = (
            slugify_translit(name)
            if name
            else serializer.validated_data.get('slug')
        )
        default_stage = self._get_default_stage()
        stage = serializer.validated_data.get('stage') or default_stage
        serializer.save(
            author=self.request.user,
            slug=slug,
            stage=stage,
        )

    def perform_update(self, serializer: TaskSerializer) -> None:
        name = serializer.validated_data.get('name', serializer.instance.name)
        slug = slugify_translit(name) if name else serializer.instance.slug
        default_stage = self._get_default_stage()
        stage = serializer.validated_data.get('stage')
        if stage is None:
            stage = serializer.instance.stage or default_stage
        serializer.save(
            author=self.request.user,
            slug=slug,
            stage=stage,
        )

    @action(detail=True, methods=['post'], url_path='update')
    def update_task(self, request, pk=None):
        """Update a task with partial data.

        Args:
            request: The HTTP request object containing the task data to update.
            pk: The primary key of the task to update.

        Returns:
            Response: JSON response containing the updated task data.

        Raises:
            ValidationError: If the provided data is invalid.
        """
        task = self.get_object()
        serializer = self.get_serializer(task, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='delete')
    def delete_task(self, request, pk=None):
        """Delete a task.

        Args:
            request: The HTTP request object.
            pk: The primary key of the task to delete.

        Returns:
            Response: HTTP 204 No Content response indicating successful
                deletion.
        """
        task = self.get_object()
        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
