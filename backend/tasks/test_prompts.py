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


def test_planning_replays_every_turn_without_truncating_earlier_decisions(repository):
    task = Task.objects.create(
        title="Folder search", description="Preserve Unicode: café", repository=repository
    )
    for sequence in range(1, 10):
        AgentRun.objects.create(
            task=task,
            stage="plan",
            sequence=sequence,
            agent="codex",
            state="blocked" if sequence == 1 else "succeeded",
            feedback=f"Human decision {sequence}" if sequence > 1 else "",
            result={"summary": f"Reply {sequence}", "details": "x" * 13000 + f" End {sequence}"},
        )
    run = AgentRun.objects.create(
        task=task, stage="plan", sequence=10, agent="codex", feedback="Keep all earlier decisions."
    )
    context = prompt_for(run)
    messages = context["plan_conversation"]
    assert messages[0] == {"role": "user", "content": "Folder search\n\nPreserve Unicode: café"}
    assert messages[1]["content"].endswith("End 1")
    assert len(messages[1]["content"]) > 13000
    assert [message["role"] for message in messages] == ["user", "assistant"] * 9 + ["user"]
    assert messages[-1]["content"] == run.feedback
    assert context["prior_runs"] == []
    assert "self-contained implementation plan" in context["instructions"]


def test_oversized_planning_conversation_blocks_instead_of_forgetting(repository):
    task = Task.objects.create(title="Long conversation", repository=repository)
    AgentRun.objects.create(
        task=task,
        stage="plan",
        sequence=1,
        agent="codex",
        state="succeeded",
        result={"summary": "Earlier decisions", "details": "x" * 200001},
    )
    run = AgentRun.objects.create(task=task, stage="plan", sequence=2, agent="codex")
    with pytest.raises(RunnerFailure, match="supported limit"):
        prompt_for(run)


@pytest.mark.parametrize("evidence", ["missing", "failed", "stale", "valid"])
def test_review_needs_current_passing_test_evidence(repository, evidence):
    task = Task.objects.create(title="Review task", repository=repository)
    approval(task, "plan", 1)
    implementation = approval(task, "integrate", 2)
    implementation.review_fingerprint = "snapshot"
    implementation.save()
    if evidence != "missing":
        test = approval(task, "test", 3)
        test.result["tests"] = [
            {
                "command": "python -m pytest",
                "outcome": "fail" if evidence == "failed" else "pass",
                "details": "Test evidence",
            }
        ]
        test.review_fingerprint = "old" if evidence == "stale" else "snapshot"
        test.save()
    run = AgentRun.objects.create(
        task=task,
        stage="code_review",
        sequence=4,
        agent="codex",
        input_fingerprint="snapshot",
    )
    if evidence == "valid":
        context = prompt_for(run)
        assert context["artifacts"]["test"]["run_id"] == str(test.id)
        assert context["artifacts"]["implementation"]["run_id"] == str(implementation.id)
    else:
        with pytest.raises(RunnerFailure) as error:
            prompt_for(run)
        assert error.value.state == "blocked"
