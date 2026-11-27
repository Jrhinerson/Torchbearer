"""One stage/profile policy for CLI permissions and validation."""

from dataclasses import dataclass


@dataclass(frozen=True)
class ExecutionPolicy:
    can_write: bool
    can_shell: bool
    requires_commands: bool


def policy_for(stage, workflow=None):
    decision = bool(workflow and workflow.get("execution_mode") == "decision")
    return ExecutionPolicy(
        can_write=stage == "integrate" and not decision,
        can_shell=stage in {"integrate", "code_review"} and not decision,
        requires_commands=stage == "integrate" and not decision,
    )
