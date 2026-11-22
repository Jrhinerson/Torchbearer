"""Task policies determine agents; columns never own assignments."""

from django.db import models


class Agent(models.TextChoices):
    CODEX = "codex", "Codex"
    CLAUDE = "claude", "Claude Code"
    PI = "pi", "Pi"


class Stage(models.TextChoices):
    PLAN = "plan", "Plan"
    INTEGRATE = "integrate", "Integrate"
    TEST = "test", "Test"
    CODE_REVIEW = "code_review", "Code Review"


class Approach(models.TextChoices):
    FRONTIER = "frontier", "Frontier"
    HYBRID = "hybrid", "Hybrid"
    LOCAL = "local_only", "Local Only"


FRONTIER_AGENTS = [Agent.CODEX, Agent.CLAUDE]


def validate_routing(mode, frontier_agent):
    if mode not in Approach.values:
        raise ValueError("Choose a routing approach before continuing this task.")
    if mode == Approach.LOCAL:
        if frontier_agent is not None:
            raise ValueError("Local Only cannot select a frontier agent.")
    elif frontier_agent not in FRONTIER_AGENTS:
        raise ValueError("Choose Codex or Claude Code as the frontier agent.")


def agent_for(task, stage):
    validate_routing(task.routing_mode, task.frontier_agent)
    if stage not in Stage.values:
        raise ValueError("Only working stages run agents.")
    if task.routing_mode == Approach.LOCAL or (
        task.routing_mode == Approach.HYBRID and stage in {Stage.INTEGRATE, Stage.TEST}
    ):
        return Agent.PI
    return task.frontier_agent
