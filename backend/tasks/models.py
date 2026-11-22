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
        PLAN = "plan", "Plan"
        INTEGRATE = "integrate", "Integrate"
        TEST = "test", "Test"
        FINAL_APPROVAL = "final_approval", "Final Approval"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, max_length=10000)
    repository = models.ForeignKey(Repository, null=True, blank=True, on_delete=models.PROTECT)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.BACKLOG, editable=False
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    revision = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    workspace_path = models.CharField(max_length=2000, blank=True)
    branch = models.CharField(max_length=100, blank=True)
    base_commit = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return self.title


class AgentRun(models.Model):
    class State(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        SUCCEEDED = "succeeded", "Awaiting review"
        BLOCKED = "blocked", "Blocked"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"
        INTERRUPTED = "interrupted", "Interrupted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="runs")
    sequence = models.PositiveIntegerField()
    stage = models.CharField(max_length=20, choices=ColumnAssignment.Stage.choices)
    agent = models.CharField(max_length=20, choices=ColumnAssignment.Agent.choices)
    state = models.CharField(max_length=20, choices=State.choices, default=State.QUEUED)
    feedback = models.TextField(blank=True)
    result = models.JSONField(default=dict)
    log = models.TextField(blank=True)
    error = models.TextField(blank=True)
    review_fingerprint = models.CharField(max_length=64, blank=True)
    input_fingerprint = models.CharField(max_length=64, blank=True)
    input_context = models.JSONField(default=dict)
    cli_version = models.CharField(max_length=64, blank=True)
    worker_id = models.UUIDField(null=True, blank=True)
    cancel_requested = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-sequence"]
        constraints = [
            models.UniqueConstraint(fields=["task", "sequence"], name="unique_task_attempt"),
            models.UniqueConstraint(
                fields=["task"],
                condition=models.Q(state__in=["queued", "running"]),
                name="one_active_run_per_task",
            ),
        ]


class Decision(models.Model):
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="decisions")
    run = models.ForeignKey(AgentRun, null=True, on_delete=models.PROTECT)
    action = models.CharField(max_length=20)
    from_stage = models.CharField(max_length=20)
    to_stage = models.CharField(max_length=20)
    task_revision = models.PositiveIntegerField()
    feedback = models.TextField(blank=True)
    review_fingerprint = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]


class WorkerStatus(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    worker_id = models.UUIDField()
    heartbeat = models.DateTimeField()
    running = models.BooleanField(default=True)
    active_run = models.ForeignKey(AgentRun, null=True, on_delete=models.SET_NULL)
