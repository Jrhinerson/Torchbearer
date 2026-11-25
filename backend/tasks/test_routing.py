from types import SimpleNamespace

import pytest

from .routing import Approach, Stage, agent_for, validate_routing


@pytest.mark.parametrize("frontier", ["codex", "claude"])
@pytest.mark.parametrize("mode", Approach.values)
def test_task_policy_resolves_each_stage(mode, frontier):
    task = SimpleNamespace(
        routing_mode=mode, frontier_agent=None if mode == "local_only" else frontier
    )
    for stage in Stage:
        expected = (
            "pi"
            if mode == "local_only" or (mode == "hybrid" and stage == "integrate")
            else frontier
        )
        assert agent_for(task, stage) == expected


@pytest.mark.parametrize(
    ("mode", "agent"),
    [
        (None, None),
        ("unknown", "codex"),
        ("hybrid", "pi"),
        ("frontier", None),
        ("local_only", "codex"),
    ],
)
def test_invalid_policy_cannot_resolve(mode, agent):
    with pytest.raises(ValueError):
        validate_routing(mode, agent)
