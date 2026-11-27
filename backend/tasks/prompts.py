"""Explicit durable handoffs, independent of the bounded recent-attempt history."""

import json

from rest_framework.exceptions import ValidationError
from workflows.profiles import validate_profile, workflow_snapshot

from .adapters import RESULT_SCHEMA, RunnerFailure, validate_result
from .practices import practices_for
from .results import profiled, result_schema

INSTRUCTIONS = {
    "refine": (
        "Refine the Backlog task without implementing it or changing its column. Inspect the "
        "repository and use artifacts.refinement, prior feedback, and the task description. "
        "Return Problem, Desired outcome, Scope, Settled decisions, and Open questions in details. "
        "Retain all previously settled decisions in every report so a later Plan has the full "
        "context. Ask only material unanswered decisions, with recommended answers. Report blocked "
        "when answers are needed and complete when the intent is clear enough to plan. "
        "Do not edit files, execute tests, publish issues, or start planning automatically."
    ),
    "plan": (
        "Have a back-and-forth planning conversation with the human. Read plan_conversation in "
        "order and respond to the latest human message naturally in details. Inspect the "
        "repository as needed. Ask focused clarifying questions when requirements or decisions "
        "are unresolved; "
        "use outcome blocked for these replies so the human can answer before implementation. "
        "Discuss alternatives and incorporate corrections without starting implementation. Once "
        "requirements are clear, use outcome complete only when details contains the full current, "
        "self-contained implementation plan, incorporating all agreed decisions from the "
        "conversation. Follow the repository planning format. Include scope, acceptance criteria, "
        "repository findings, "
        "concrete file paths and symbols, ordered steps and dependencies, effects on the "
        "frontend, backend, and database, "
        "API and data contracts, migrations and existing-data handling, error behavior, "
        "edge cases, validation commands, fixtures, environment prerequisites, expected outcomes, "
        "and code review criteria. The plan must be sufficient for a local agent to implement "
        "without guessing product or architectural decisions. Report blocked for unresolved "
        "requirements. A complete plan still needs explicit human approval; sending a message is "
        "never approval. Do not edit files or execute tests. Leave tests empty for planning "
        "replies."
    ),
    "integrate": (
        "Implement the full human-approved plan from artifacts.approved_plan, incorporating human "
        "feedback and artifacts.rework findings. Write meaningful behavior tests and run all "
        "agreed validation commands, reporting each command and its actual outcome in tests. "
        "Complete only when validation passes. If the scope requires a new "
        "plan or the handoff is insufficient, report blocked rather than inventing requirements."
    ),
    "code_review": (
        "Review all task changes against artifacts.approved_plan, artifacts.implementation, "
        "its validation evidence in result.tests, and rework findings. Inspect the complete diff "
        "against task.base_commit "
        "with git diff --no-ext-diff --no-textconv and inspect new files listed by "
        "git ls-files --others --exclude-standard. Read full files as needed; a bounded UI diff "
        "is not the complete review. Check correctness, acceptance criteria, edge cases, API/data "
        "compatibility, migration behavior, and test coverage. Report actionable findings in "
        "details with severity, file and line references, impact, and a suggested correction. "
        "Explain remaining risks and test evidence. Report complete only with no unresolved "
        "findings that block acceptance, failed when rework is needed, and blocked when evidence "
        "or access is insufficient. Do not edit any workspace files or fix findings."
    ),
    "retro": (
        "Review artifacts.accepted_review, artifacts.approved_plan, artifacts.implementation, "
        "artifacts.session, and human_decisions for this completed task. Cite the run IDs and "
        "specific evidence behind each recommendation. Return severity-ordered suggestions "
        "covering automated checks, navigation, tooling, standards, or agent instructions. "
        "Describe each proposed follow-up's purpose and expected benefit. Do not edit files, "
        "execute tests, reopen this task, publish issues, or automatically start follow-up work. "
        "The workspace may have changed since acceptance; use the recorded artifacts as the "
        "historical source of truth and do not mistake current files for the accepted snapshot."
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


def plan_conversation(run):
    """Replay every planning turn because adapters start fresh CLI sessions."""
    messages = [
        {
            "role": "user",
            "content": "\n\n".join(filter(None, [run.task.title, run.task.description])),
        }
    ]
    for attempt in run.task.runs.filter(stage="plan", sequence__lte=run.sequence).order_by(
        "sequence"
    ):
        if attempt.feedback:
            messages.append(
                {"role": "user", "content": attempt.feedback, "sequence": attempt.sequence}
            )
        if attempt.sequence < run.sequence and attempt.result:
            content = "\n\n".join(
                filter(None, [attempt.result.get("summary"), attempt.result.get("details")])
            )
            if content:
                messages.append(
                    {
                        "role": "assistant",
                        "content": content,
                        "sequence": attempt.sequence,
                        "agent": attempt.agent,
                    }
                )
    return messages


def prompt_for(run):
    task = run.task
    workflow = run.input_context.get("workflow") or workflow_snapshot(task)
    if profiled(workflow):
        try:
            validate_profile(workflow)
        except ValidationError as error:
            raise RunnerFailure(str(error), "blocked") from error
    if run.stage not in INSTRUCTIONS:
        raise RunnerFailure("This stage was retired. Resume the task in Integrate.", "blocked")
    artifacts = {}
    if run.stage in {"refine", "plan"}:
        refinement = task.runs.filter(stage="refine", sequence__lt=run.sequence).first()
        if refinement:
            artifacts["refinement"] = {**artifact(refinement), "feedback": refinement.feedback}
    if run.stage in {"integrate", "code_review", "retro"}:
        plan = approved_run(run, "plan")
        artifacts["approved_plan"] = artifact(plan)
        if run.stage != "integrate":
            implementation = approved_run(run, "integrate", after=plan.sequence)
            artifacts["implementation"] = artifact(implementation)
        if run.stage == "code_review":
            try:
                validate_result(implementation.result, "integrate", workflow)
            except RunnerFailure as error:
                raise RunnerFailure(
                    "Code Review needs passing Integrate validation. Return to Integrate.",
                    "blocked",
                ) from error
            if not run.input_fingerprint or not (
                run.input_fingerprint == implementation.review_fingerprint
            ):
                raise RunnerFailure(
                    "Code Review evidence is stale. Return to Integrate and rerun validation.",
                    "blocked",
                )
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
    if run.stage == "retro":
        accepted = task.decisions.filter(action="final_approve").select_related("run").last()
        if not accepted or not accepted.run:
            raise RunnerFailure("A retrospective needs the accepted review.", "blocked")
        artifacts["accepted_review"] = artifact(accepted.run)
        artifacts["session"] = [
            {
                **artifact(attempt),
                "state": attempt.state,
                "feedback": attempt.feedback,
                "error": attempt.error,
            }
            for attempt in task.runs.filter(sequence__lt=run.sequence).order_by("sequence")
        ]
    previous = []
    attempts = task.runs.filter(sequence__lt=run.sequence)
    if run.stage == "plan":
        # The full conversation below already contains these results without truncation.
        attempts = attempts.exclude(stage="plan")
    for attempt in attempts.order_by("-sequence")[:6]:
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
        "engineering_practices": practices_for(run.stage),
        "rules": [
            "Work on this stage in the current worktree. Read and follow repository instructions.",
            "Humans control transitions. Never call Torchbearer APIs or edit its database.",
            "Do not change branches, commit, merge, push, open pull requests, or remove worktrees.",
            "Keep commands in the foreground and wait for them. Leave no background work running.",
            "Apply engineering_practices within this stage's permissions. They are adapted "
            "instructions, not requests to invoke external skills or their full workflows.",
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
                : None if run.stage == "retro" else 10
            ]
        ),
        "workflow": workflow,
        "result_contract": workflow.get("result_contract", 1),
        "result_schema": result_schema(RESULT_SCHEMA, workflow),
    }
    if run.stage == "plan":
        context["plan_conversation"] = plan_conversation(run)
    if profiled(workflow):
        context["instructions"] += (
            " Follow the frozen workflow's instructions, expected outputs, and validation within "
            "this stage's existing permissions. Report every procedure step belonging to this "
            "stage in workflow_steps using its exact stable ID. Reference reported command "
            "evidence by zero-based test_indexes. A conditional check may be not_applicable only "
            "with a concrete explanation. Leave future-stage steps out of this report. "
            "Never claim internal progress that has not been observed. Use artifacts.decision "
            "null for code changes. Humans still approve every stage; workflow instructions "
            "do not authorize production actions or bypass repository permissions."
        )
    if workflow.get("execution_mode") == "decision":
        context["engineering_practices"] = [
            {
                "name": "Evidence and decision review",
                "instructions": "Keep investigation bounded by the approved question and timebox. "
                "Cite inspected sources, compare alternatives, disclose limitations, and retain "
                "human decisions. Work read-only. Never implement or run external operational "
                "actions.",
            }
        ]
        if run.stage == "plan":
            context["instructions"] = (
                "Discuss and refine an investigation plan with the human using plan_conversation. "
                "Agree the question, scope, timebox, constraints, sources, alternatives, and "
                "decision acceptance criteria. Return blocked while material questions remain, "
                "or complete with the full agreed investigation plan in details. Do not implement, "
                "edit files, execute commands, or approve the plan. Report this stage's workflow "
                "steps; use tests [] and artifacts.decision null."
            )
        elif run.stage == "integrate":
            context["instructions"] = (
                "Investigate artifacts.approved_plan read-only, incorporating feedback and rework. "
                "Inspect repository sources, compare at least two alternatives, and produce "
                "artifacts.decision with the question, sourced findings, options and tradeoffs, "
                "recommendation, and limitations. Complete only with evidence supporting the "
                "decision; otherwise report blocked. Report each investigation workflow step. "
                "Do not edit files, execute commands, implement the recommendation, or start "
                "another task. Use tests [] rather than inventing validation commands."
            )
        elif run.stage == "code_review":
            context["instructions"] = (
                "Independently review the decision in artifacts.implementation against "
                "artifacts.approved_plan and its cited sources. Check findings, alternatives, "
                "tradeoffs, recommendation, limitations, and decision criteria. Return complete "
                "only with no blocking findings, failed for investigation rework, or blocked for "
                "insufficient evidence. Report this stage's workflow steps, tests [], and "
                "artifacts.decision null. Do not edit files or execute commands. "
                "A human must explicitly approve the review and accept the decision."
            )
    if len(json.dumps(context, ensure_ascii=False)) > 200000:
        raise RunnerFailure(
            "Required handoff context exceeds the supported limit. Revise the plan or reports "
            "while retaining implementation details and review evidence. Required artifacts "
            "were not truncated.",
            "blocked",
        )
    return context
