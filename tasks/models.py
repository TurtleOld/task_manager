from django.db import models

from labels.models import Label
from statuses.models import Status
from users.models import User


class Task(models.Model):
    name = models.CharField(max_length=50)
    description = models.TextField()

    status = models.ForeignKey(Status,
                               on_delete=models.PROTECT,
                               null=True,
                               related_name='tasks')
    author = models.ForeignKey(User,
                               on_delete=models.PROTECT,
                               null=False,
                               related_name='tasks')
    executor = models.ForeignKey(User,
                                 null=True,
                                 on_delete=models.PROTECT,
                                 related_name='works')

    created_at = models.DateTimeField(auto_now_add=True)

    labels = models.ManyToManyField(Label, related_name='tasks', blank=True)

    def __str__(self):
        return self.name
