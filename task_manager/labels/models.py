from django.db import models

# Constants
MAX_LABEL_NAME_LENGTH = 50


class Label(models.Model):
    name = models.CharField(max_length=MAX_LABEL_NAME_LENGTH, null=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name

    @property
    def tasks_count(self):
        """Возвращает количество задач, использующих этот тег"""
        return self.tasks.count()

    @property
    def is_active(self):
        """Возвращает True, если тег используется в задачах"""
        return self.tasks.exists()

    class Meta:
        verbose_name = 'Тег'
        verbose_name_plural = 'Теги'
        ordering = ['-created_at']
