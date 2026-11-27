"""Deterministic CLI protocol fixture. Never used by normal application startup."""

import json
import subprocess
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")

agent, scenario = sys.argv[1:3]
if "--version" in sys.argv:
    print({"codex": "codex-cli 0.162.1", "claude": "2.1.300 (Claude Code)", "pi": "0.74.2"}[agent])
    sys.exit(0)
prompt = sys.stdin.read()
context = json.loads(prompt)
stage = context.get("stage", "plan")
if scenario == "browser":
    title = context.get("task", {}).get("title", "")
    scenario = (
        "hang"
        if "[cancel]" in title
        else "questions"
        if "[refine]" in title and stage == "refine" and not context.get("feedback")
        else "conversation"
        if "[conversation]" in title
        else "test_fail"
        if "[validation fails]" in title and stage == "integrate" and not context.get("feedback")
        else "review_fail"
        if "[review fails]" in title
        and stage == "code_review"
        and not context.get("artifacts", {}).get("rework")
        else "implement"
    )
if scenario == "hang":
    subprocess.Popen(
        [
            sys.executable,
            "-c",
            "import time; from pathlib import Path\nwhile True:\n"
            " Path('heartbeat.txt').write_text(str(time.time())); time.sleep(.05)",
        ]
    )
    print(json.dumps({"type": "session"}), flush=True)
    time.sleep(120)
if scenario == "error":
    print("Authentication required", file=sys.stderr, flush=True)
    sys.exit(1)
if scenario == "malformed":
    print("not JSON", flush=True)
    sys.exit(0)
if scenario == "modify":
    Path(f"violation-{stage}.txt").write_text("Unexpected edit\n", encoding="utf-8")
if (
    stage == "integrate"
    and scenario in {"implement", "conversation"}
    and context.get("workflow", {}).get("execution_mode") != "decision"
):
    Path("feature.txt").write_text("Implemented by the fixture\n", encoding="utf-8")
result = {
    "outcome": "blocked"
    if scenario == "questions"
    else "failed"
    if scenario == "review_fail" or (scenario == "test_fail" and stage == "integrate")
    else "complete",
    "summary": f"{stage.title()} completed by {agent}",
    "details": prompt
    if scenario == "echo"
    else "Reviewable result with Unicode \u2028 and context.",
    "tests": [
        {
            "command": "python -m pytest",
            "outcome": "fail" if scenario == "test_fail" else "pass",
            "details": "Fixture test report",
        }
    ]
    if stage == "integrate"
    else [],
}
if scenario == "questions":
    result["summary"] = "Clarify task scope"
    result["details"] = "Should priority affect sorting? Recommended: display only."
elif scenario == "test_fail":
    result["summary"] = "Validation failed"
elif scenario == "review_fail":
    result["summary"] = "Review needs rework"
elif stage == "refine":
    result["details"] = "Settled decisions: " + context.get("feedback", "Intent is clear.")
elif stage == "retro":
    result["details"] = "Suggested follow-up: add an automated regression check."
if scenario == "conversation" and stage == "plan":
    messages = [
        message["content"] for message in context["plan_conversation"] if message["role"] == "user"
    ]
    result.update(
        outcome="blocked" if len(messages) == 1 else "complete",
        summary="Let's clarify the plan" if len(messages) == 1 else "Updated plan",
        details="What should happen when no matching files are found?"
        if len(messages) == 1
        else "Implement the agreed behavior:\n" + "\n\n".join(messages),
    )
workflow = context.get("workflow", {})
if workflow.get("execution_mode") == "decision":
    result["tests"] = []
if workflow.get("result_contract") == 2:
    result["workflow_steps"] = [
        {
            "step_id": step["id"],
            "outcome": "complete" if result["outcome"] == "complete" else "blocked",
            "summary": "Fixture recorded step evidence",
            "test_indexes": [0] if result["tests"] else [],
        }
        for step in workflow.get("steps", [])
        if step["stage"] == stage
    ]
    result["artifacts"] = {"decision": None}
    if workflow.get("execution_mode") == "decision" and stage == "integrate":
        result["artifacts"]["decision"] = {
            "question": "Which queue backend fits this project?",
            "findings": [{"summary": "A local repository is available.", "source": "README.md"}],
            "options": [
                {"name": "Local queue", "tradeoffs": "Simple single-machine deployment."},
                {"name": "Remote queue", "tradeoffs": "Additional infrastructure."},
            ],
            "recommendation": "Retain a local queue for this deployment.",
            "limitations": "No production workload measurements were available.",
        }
text = json.dumps(result, ensure_ascii=False)
if scenario == "verbose":
    print("diagnostic output\n" * 10000, file=sys.stderr, flush=True)
if agent == "codex":
    records = [
        {"type": "item.completed", "item": {"type": "agent_message", "text": text}},
        {"type": "turn.completed"},
    ]
elif agent == "claude":
    records = [
        {
            "type": "result",
            "is_error": False,
            "structured_output": result,
            "permission_denials": [{"tool_name": "Bash"}] if scenario == "denied" else [],
        }
    ]
    if scenario == "denied_event":
        records.insert(0, {"type": "system", "subtype": "permission_denied"})
else:
    records = [
        {
            "type": "message_end",
            "message": {
                "role": "assistant",
                "stopReason": "stop",
                "content": [{"type": "text", "text": text}],
            },
        },
        {"type": "agent_end"},
    ]
for record in records:
    print(json.dumps(record, ensure_ascii=False), flush=True)
