import pytest

from .adapters import RunnerFailure
from .models import AgentRun, Decision, Task
from .prompts import prompt_for

pytestmark = pytest.mark.django_db


def approval(task, stage, sequence, details="Complete report"):
    run = AgentRun.objects.create(
        task=task,
        stage=stage,
        sequence=sequence,
        agent="codex",
        state="succeeded",
        result={"outcome": "complete", "summary": "Approved", "details": details, "tests": []},
    )
    Decision.objects.create(
        task=task,
        run=run,
        action="approve",
        from_stage=stage,
        to_stage="integrate",
        task_revision=sequence,
    )
    return run


def test_full_plan_and_rework_survive_long_retry_history(repository):
    task = Task.objects.create(title="Long task", repository=repository)
    plan = approval(task, "plan", 1, "Detailed step\n" * 3000)
    failed = AgentRun.objects.create(
        task=task,
        stage="test",
        sequence=2,
        agent="pi",
        state="failed",
        result={"summary": "Fix regression", "details": "Important failure\n" * 1000},
    )
    Decision.objects.create(
        task=task,
        run=failed,
        action="send_back",
        from_stage="test",
        to_stage="integrate",
        task_revision=2,
        feedback="Fix the regression.",
    )
    for sequence in range(3, 11):
        AgentRun.objects.create(
            task=task, stage="integrate", sequence=sequence, agent="pi", state="failed"
        )
    run = AgentRun.objects.create(task=task, stage="integrate", sequence=11, agent="pi")
    context = prompt_for(run)
    assert len(context["prior_runs"]) == 6
    assert context["artifacts"]["approved_plan"]["run_id"] == str(plan.id)
    assert context["artifacts"]["approved_plan"]["result"]["details"] == plan.result["details"]
    assert context["artifacts"]["rework"][0]["result"] == failed.result


def test_test_requires_implementation_for_current_approved_plan(repository):
    task = Task.objects.create(title="Replanned task", repository=repository)
    approval(task, "plan", 1)
    approval(task, "integrate", 2)
    approval(task, "plan", 3)
    run = AgentRun.objects.create(task=task, stage="test", sequence=4, agent="pi")
    with pytest.raises(RunnerFailure, match="human-approved integrate"):
        prompt_for(run)


def test_required_context_is_never_silently_truncated(repository):
    task = Task.objects.create(title="Large plan", repository=repository)
    approval(task, "plan", 1, "x" * 200001)
    run = AgentRun.objects.create(task=task, stage="integrate", sequence=2, agent="pi")
    with pytest.raises(RunnerFailure, match="supported limit") as error:
        prompt_for(run)
    assert error.value.state == "blocked"
