import uuid

from django.db import models


class Repository(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    path = models.CharField(max_length=2000, unique=True)
    name = models.CharField(max_length=255)

    class Meta:
        ordering = ["name", "path"]


class ColumnAssignment(models.Model):
    class Stage(models.TextChoices):
        PLAN = "plan", "Plan"
        INTEGRATE = "integrate", "Integrate"
        TEST = "test", "Test"

    class Agent(models.TextChoices):
        CODEX = "codex", "Codex CLI"
        CLAUDE = "claude", "Claude Code CLI"
        PI = "pi", "Pi"

    stage = models.CharField(max_length=20, choices=Stage.choices, primary_key=True)
    agent = models.CharField(max_length=20, choices=Agent.choices, blank=True)


class Task(models.Model):
    class Status(models.TextChoices):
        BACKLOG = "backlog", "Backlog"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, max_length=10000)
    repository = models.ForeignKey(Repository, null=True, blank=True, on_delete=models.PROTECT)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.BACKLOG, editable=False
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.title
