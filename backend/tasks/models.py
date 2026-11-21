import uuid

from django.db import models


class Task(models.Model):
    class Status(models.TextChoices):
        BACKLOG = "backlog", "Backlog"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, max_length=10000)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.BACKLOG, editable=False
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.title
