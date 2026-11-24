"""Human actions own task transitions; adapters only report execution results."""

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from projects.models import Project
from rest_framework.exceptions import APIException, ValidationError

from .adapters import RunnerFailure, validate_result
from .cli import resolve_command
from .models import AgentRun, Decision, Task
from .routing import NEXT_STAGE, Agent, Approach, agent_for, validate_routing
from .workspaces import fingerprint as workspace_fingerprint

ACTIVE = [AgentRun.State.QUEUED, AgentRun.State.RUNNING]


class Conflict(APIException):
    status_code = 409
    default_detail = "The task changed. Refresh and review it again."


def validate_review(task, run, fingerprint):
    if (
        run.state != AgentRun.State.SUCCEEDED
        or run.result.get("outcome") != "complete"
        or not run.review_fingerprint
        or fingerprint != run.review_fingerprint
    ):
        raise Conflict("Review the latest successful result before approving.")
    if run.stage == "integrate":
        try:
            validate_result(run.result, "integrate")
        except RunnerFailure as error:
            raise Conflict(str(error)) from error
    try:
        current = workspace_fingerprint(task)
    except (OSError, ValueError) as error:
        raise Conflict(str(error)) from error
    if current != run.review_fingerprint:
        raise Conflict(
            "Workspace changes made this review stale. Request a new run before approving."
        )


def available_agent(task, stage):
    try:
        agent = agent_for(task, stage)
        available = resolve_command(agent)
    except ValueError as error:
        raise Conflict(str(error)) from error
    if not available:
        raise Conflict(f"{Agent(agent).label} is not installed on PATH.")
    return agent


@transaction.atomic
def update_settings(task_id, *, revision, **settings):
    if not Task.objects.filter(pk=task_id, revision=revision).update(revision=F("revision") + 1):
        get_object_or_404(Task, pk=task_id)
        raise Conflict()
    task = Task.objects.get(pk=task_id)
    if task.completed_at or task.runs.filter(state__in=ACTIVE).exists():
        raise Conflict("Cancel or wait for active work before updating task settings.")
    routing = bool({"routing_mode", "frontier_agent"} & settings.keys())
    if task.status != "backlog" and (
        not routing or task.routing_mode is not None or "repository" in settings
    ):
        raise Conflict("Task routing and repository are locked after planning starts.")
    if routing:
        mode = settings.get("routing_mode", task.routing_mode)
        frontier = settings.get(
            "frontier_agent",
            None if mode == Approach.LOCAL else task.frontier_agent or Agent.CODEX,
        )
        try:
            validate_routing(mode, frontier)
        except ValueError as error:
            raise ValidationError({"routing_mode": str(error)}) from error
        settings.update(routing_mode=mode, frontier_agent=frontier)
    if "repository" in settings:
        repository = settings["repository"]
        settings["project"] = (
            Project.objects.filter(path=repository.path, archived=False).first()
            if repository
            else None
        )
    for field, value in settings.items():
        setattr(task, field, value)
    task.save(update_fields=[*settings, "updated_at"])
    return task


@transaction.atomic
def act(task_id, *, action, revision, run_id=None, fingerprint="", feedback=""):
    # Acquire SQLite's write lock before reading state. The revision is also the action's CAS token.
    changed = Task.objects.filter(pk=task_id, revision=revision).update(revision=F("revision") + 1)
    if not changed:
        get_object_or_404(Task, pk=task_id)
        raise Conflict()
    task = Task.objects.select_related("repository").get(pk=task_id)
    if task.completed_at:
        raise Conflict("This task is already approved.")
    if task.routing_mode is None:
        raise Conflict("Choose a routing approach before continuing this task.")
    run = task.runs.first()
    if run and run.state in ACTIVE:
        raise Conflict("Cancel or wait for the active run first.")
    if action != "start" and (not run or str(run.id) != str(run_id)):
        raise Conflict("Choose the latest run before continuing.")
    previous = task.status
    if action == "start":
        if previous != Task.Status.BACKLOG or run:
            raise Conflict("Only a backlog task can start planning.")
        target = "plan"
    elif action in {"retry", "revise"}:
        if previous not in NEXT_STAGE or run.stage != previous:
            raise Conflict("This step cannot be rerun here.")
        if action == "retry" and run.state == AgentRun.State.SUCCEEDED:
            raise Conflict("Use Request Revision to replace a successful result.")
        if action == "revise" and not feedback.strip():
            raise Conflict("Describe the requested revision.")
        target = previous
    elif action == "send_back":
        if previous not in {"integrate", "code_review", "final_approval"} or not feedback.strip():
            raise Conflict("Describe the changes needed before sending this task back.")
        target = "plan" if previous == "integrate" else "integrate"
    elif action in {"approve", "final_approve"}:
        validate_review(task, run, fingerprint)
        if action == "final_approve":
            if previous != "final_approval" or run.stage != "code_review":
                raise Conflict("Final approval follows a successful Code Review result.")
            task.completed_at = timezone.now()
            target = previous
        else:
            if previous not in NEXT_STAGE or run.stage != previous:
                raise Conflict("This result does not belong to the current step.")
            target = NEXT_STAGE[previous]
    else:
        raise Conflict("Unknown workflow action.")
    agent = None
    if target in NEXT_STAGE and not task.completed_at:
        if not task.repository:
            raise Conflict("Choose a repository before starting planning.")
        agent = available_agent(task, target)
    Decision.objects.create(
        task=task,
        run=run,
        action=action,
        from_stage=previous,
        to_stage=target,
        task_revision=task.revision,
        feedback=feedback,
        review_fingerprint=run.review_fingerprint if run else "",
    )
    task.status = target
    task.save(update_fields=["status", "completed_at", "updated_at"])
    if agent:
        try:
            baseline = workspace_fingerprint(task) if task.workspace_path else ""
        except (OSError, ValueError) as error:
            raise Conflict(str(error)) from error
        AgentRun.objects.create(
            task=task,
            sequence=(run.sequence + 1 if run else 1),
            stage=target,
            agent=agent,
            feedback=feedback,
            input_fingerprint=baseline,
        )
    return task


@transaction.atomic
def cancel(task_id, run_id):
    Task.objects.filter(pk=task_id).update(revision=F("revision") + 1)
    run = get_object_or_404(AgentRun, pk=run_id, task_id=task_id)
    if run.state == AgentRun.State.QUEUED:
        run.state = AgentRun.State.CANCELLED
        run.finished_at = timezone.now()
    elif run.state != AgentRun.State.RUNNING:
        raise Conflict("This run has already finished.")
    run.cancel_requested = True
    run.save(update_fields=["state", "finished_at", "cancel_requested"])
    Decision.objects.create(
        task=run.task,
        run=run,
        action="cancel",
        from_stage=run.task.status,
        to_stage=run.task.status,
        task_revision=run.task.revision,
    )
    return run.task
