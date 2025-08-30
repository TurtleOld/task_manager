"""Label models for the task manager application.

This module contains the Label model for categorizing and organizing tasks
with metadata such as creation date and usage statistics.
"""

from django.db import models

# Constants
MAX_LABEL_NAME_LENGTH = 50


class Label(models.Model):
    """Model representing a label or tag for categorizing tasks.

    Labels provide a way to organize and categorize tasks, making it easier
    for users to find and manage related tasks.
    """

    name = models.CharField(max_length=MAX_LABEL_NAME_LENGTH, null=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        """Return the label name as string representation."""
        return self.name

    @property
    def tasks_count(self):
        """Return the number of tasks using this label.

        Returns:
            The count of tasks associated with this label.
        """
        return self.tasks.count()

    @property
    def is_active(self):
        """Check if the label is actively used in tasks.

        Returns:
            True if the label is used in at least one task, False otherwise.
        """
        return self.tasks.exists()

    class Meta:
        """Meta class for model configuration."""

        verbose_name = 'Тег'
        verbose_name_plural = 'Теги'
        ordering = ['-created_at']
