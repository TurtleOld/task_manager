from __future__ import annotations

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet
from rest_framework.views import APIView
from rest_framework.response import Response
from django.http import JsonResponse

from task_manager.tasks.models import Stage, Task
from task_manager.tasks.serializers import TaskSerializer
from task_manager.tasks.services import slugify_translit
from task_manager.tasks.permissions import IsAuthenticatedOrOptions


class StageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stage
        fields = ['id', 'name', 'order']


class StageViewSet(ModelViewSet):
    serializer_class = StageSerializer
    permission_classes = [IsAuthenticatedOrOptions]
    queryset = Stage.objects.all()

    def get_queryset(self):
        return Stage.objects.all().order_by('order')

    def options(self, request, *args, **kwargs):
        response = super().options(request, *args, **kwargs)
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = (
            'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        )
        response['Access-Control-Allow-Headers'] = (
            'Content-Type, Authorization, Accept'
        )
        return response

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = (
            'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        )
        response['Access-Control-Allow-Headers'] = (
            'Content-Type, Authorization, Accept'
        )
        return response


class TaskViewSet(ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticatedOrOptions]
    queryset = Task.objects.select_related(
        'stage', 'author', 'executor'
    ).prefetch_related('labels')

    def get_queryset(self):
        return super().get_queryset().filter(author=self.request.user)

    def options(self, request, *args, **kwargs):
        response = super().options(request, *args, **kwargs)
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = (
            'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        )
        response['Access-Control-Allow-Headers'] = (
            'Content-Type, Authorization, Accept'
        )
        return response

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = (
            'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        )
        response['Access-Control-Allow-Headers'] = (
            'Content-Type, Authorization, Accept'
        )
        return response

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
