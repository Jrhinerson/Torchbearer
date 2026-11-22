"""Explicit durable handoffs, independent of the bounded recent-attempt history."""

import json

from .adapters import RESULT_SCHEMA, RunnerFailure, validate_result

INSTRUCTIONS = {
    "plan": (
        "Inspect the repository and produce a detailed implementation plan in details, following "
        "the repository planning format. Include scope, acceptance criteria, repository findings, "
        "concrete file paths and symbols, ordered steps and dependencies, effects on the "
        "frontend, backend, and database, "
        "effects, API and data contracts, migrations and existing-data handling, error behavior, "
        "edge cases, validation commands, fixtures, environment prerequisites, expected outcomes, "
        "and code review criteria. The plan must be sufficient for a local agent to implement "
        "without guessing product or architectural decisions. Report blocked for unresolved "
        "requirements. Do not edit files or execute tests."
    ),
    "integrate": (
        "Implement the full human-approved plan from artifacts.approved_plan, incorporating human "
        "feedback and artifacts.rework findings. Run relevant checks. If the scope requires a new "
        "plan or the handoff is insufficient, report blocked rather than inventing requirements."
    ),
    "test": (
        "Validate the implementation from artifacts.implementation using artifacts.approved_plan "
        "and repository test instructions. Run actual validation commands and report each outcome. "
        "Do not edit source, tests, configuration, or lockfiles. Use ignored temporary directories "
        "for generated files. Report failed when validation fails, and blocked when no validation "
        "can run. Never fix failures in this stage."
    ),
    "code_review": (
        "Review all task changes against artifacts.approved_plan, artifacts.implementation, "
        "artifacts.test, and rework findings. Inspect the complete diff against task.base_commit "
        "with git diff --no-ext-diff --no-textconv and inspect new files listed by "
        "git ls-files --others --exclude-standard. Read full files as needed; a bounded UI diff "
        "is not the complete review. Check correctness, acceptance criteria, edge cases, API/data "
        "compatibility, migration behavior, and test coverage. Report actionable findings in "
        "details with severity, file and line references, impact, and a suggested correction. "
        "Explain remaining risks and test evidence. Report complete only with no unresolved "
        "findings that block acceptance, failed when rework is needed, and blocked when evidence "
        "or access is insufficient. Do not edit any workspace files or fix findings."
    ),
}


def artifact(run):
    return {
        "run_id": str(run.id),
        "sequence": run.sequence,
        "stage": run.stage,
        "agent": run.agent,
        "result": run.result,
        "fingerprint": run.review_fingerprint,
    }


def approved_run(run, stage, after=0):
    decision = (
        run.task.decisions.filter(
            action="approve",
            from_stage=stage,
            run__stage=stage,
            run__sequence__gt=after,
            run__sequence__lt=run.sequence,
        )
        .select_related("run")
        .last()
    )
    if (
        not decision
        or decision.run.state != "succeeded"
        or decision.run.result.get("outcome") != "complete"
    ):
        raise RunnerFailure(f"This step needs a human-approved {stage} result.", "blocked")
    return decision.run


def prompt_for(run):
    task = run.task
    artifacts = {}
    if run.stage != "plan":
        plan = approved_run(run, "plan")
        artifacts["approved_plan"] = artifact(plan)
        if run.stage != "integrate":
            implementation = approved_run(run, "integrate", after=plan.sequence)
            artifacts["implementation"] = artifact(implementation)
        if run.stage == "code_review":
            test = approved_run(run, "test", after=implementation.sequence)
            try:
                validate_result(test.result, "test")
            except RunnerFailure as error:
                raise RunnerFailure(
                    "Code Review needs passing Test evidence. Rerun Test.", "blocked"
                ) from error
            if not run.input_fingerprint or not (
                run.input_fingerprint
                == test.review_fingerprint
                == implementation.review_fingerprint
            ):
                raise RunnerFailure(
                    "Code Review evidence is stale. Return to Integrate and rerun Test.", "blocked"
                )
            artifacts["test"] = artifact(test)
        rework = []
        for stage in ["test", "code_review"]:
            decision = (
                task.decisions.filter(
                    action__in=["send_back", "revise"],
                    run__stage=stage,
                    run__sequence__gt=plan.sequence,
                    run__sequence__lt=run.sequence,
                )
                .select_related("run")
                .last()
            )
            if decision:
                rework.append({**artifact(decision.run), "feedback": decision.feedback})
        artifacts["rework"] = rework
    previous = []
    for attempt in task.runs.filter(sequence__lt=run.sequence).order_by("-sequence")[:6]:
        result = dict(attempt.result)
        details = result.get("details", "")
        if len(details) > 12000:
            result["details"] = details[:12000]
            result["details_truncated"] = True
        previous.append(
            {
                "run_id": str(attempt.id),
                "stage": attempt.stage,
                "agent": attempt.agent,
                "state": attempt.state,
                "result": result,
                "feedback": attempt.feedback,
                "error": attempt.error,
            }
        )
    context = {
        "stage": run.stage,
        "instructions": INSTRUCTIONS[run.stage],
        "rules": [
            "Work on this stage in the current worktree. Read and follow repository instructions.",
            "Humans control transitions. Never call Torchbearer APIs or edit its database.",
            "Do not change branches, commit, merge, push, open pull requests, or remove worktrees.",
            "Keep commands in the foreground and wait for them. Leave no background work running.",
            "Return only JSON matching result_schema, with the plan or stage report in details.",
            "Report blocked for missing dependencies, auth, permissions, or unclear requirements. "
            "Never claim checks passed unless run.",
        ],
        "task": {
            "title": task.title,
            "description": task.description,
            "repository": task.repository.name,
            "branch": task.branch,
            "base_commit": task.base_commit,
            "routing_mode": task.routing_mode,
            "frontier_agent": task.frontier_agent,
        },
        "artifacts": artifacts,
        "feedback": run.feedback,
        "prior_runs": previous,
        "human_decisions": list(
            task.decisions.order_by("-id").values("action", "from_stage", "to_stage", "feedback")[
                :10
            ]
        ),
        "result_schema": RESULT_SCHEMA,
    }
    if len(json.dumps(context, ensure_ascii=False)) > 200000:
        raise RunnerFailure(
            "Required handoff context exceeds the supported limit. Revise the plan or reports "
            "while retaining implementation details and review evidence; nothing was truncated.",
            "blocked",
        )
    return context
