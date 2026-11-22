"""Human actions own task transitions; adapters only report execution results."""

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException

from .cli import resolve_command
from .models import AgentRun, ColumnAssignment, Decision, Task

ACTIVE = [AgentRun.State.QUEUED, AgentRun.State.RUNNING]
NEXT = {"plan": "integrate", "integrate": "test", "test": "final_approval"}


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


def assigned_agent(stage):
    agent = ColumnAssignment.objects.filter(stage=stage).values_list("agent", flat=True).first()
    if not agent:
        raise Conflict(f"Assign an agent to {stage.title()} before starting this step.")
    try:
        available = resolve_command(agent)
    except ValueError as error:
        raise Conflict(str(error)) from error
    if not available:
        raise Conflict(f"{ColumnAssignment.Agent(agent).label} is not installed on PATH.")
    return agent


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
        if previous not in NEXT or run.stage != previous:
            raise Conflict("This step cannot be rerun here.")
        if action == "retry" and run.state == AgentRun.State.SUCCEEDED:
            raise Conflict("Use Request Revision to replace a successful result.")
        if action == "revise" and not feedback.strip():
            raise Conflict("Describe the requested revision.")
        target = previous
    elif action == "send_back":
        if previous not in {"integrate", "test", "final_approval"} or not feedback.strip():
            raise Conflict("Describe the changes needed before sending this task back.")
        target = "plan" if previous == "integrate" else "integrate"
    elif action in {"approve", "final_approve"}:
        validate_review(task, run, fingerprint)
        if action == "final_approve":
            if previous != "final_approval" or run.stage != "test":
                raise Conflict("Final approval follows a reviewed Test result.")
            task.completed_at = timezone.now()
            target = previous
        else:
            if previous not in NEXT or run.stage != previous:
                raise Conflict("This result does not belong to the current step.")
            target = NEXT[previous]
    else:
        raise Conflict("Unknown workflow action.")
    agent = None
    if target in NEXT and not task.completed_at:
        if not task.repository:
            raise Conflict("Choose a repository before starting planning.")
        agent = assigned_agent(target)
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
        AgentRun.objects.create(
            task=task,
            sequence=(run.sequence + 1 if run else 1),
            stage=target,
            agent=agent,
            feedback=feedback,
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
