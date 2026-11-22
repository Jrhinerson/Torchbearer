"""Resolve trusted local executables without passing prompts through a command shell."""

import json
import os
import shutil
from pathlib import Path

from .routing import Agent

PACKAGES = {
    "codex": ["@openai/codex/bin/codex.js"],
    "claude": ["@anthropic-ai/claude-code/cli.js"],
    "pi": [
        "@earendil-works/pi-coding-agent/dist/cli.js",
        "@mariozechner/pi-coding-agent/dist/cli.js",
    ],
}
LABELS = dict(Agent.choices)


def resolve_command(agent):
    override = os.environ.get(f"TORCHBEARER_{agent.upper()}_COMMAND")
    if override:
        try:
            command = json.loads(override)
        except ValueError as error:
            raise ValueError("CLI command overrides must be JSON arrays.") from error
        if (
            not isinstance(command, list)
            or not command
            or not all(isinstance(part, str) and part for part in command)
        ):
            raise ValueError("CLI command overrides must be nonempty JSON arrays of strings.")
        if Path(command[0]).suffix.lower() in {".cmd", ".bat", ".ps1"}:
            raise ValueError("Use the underlying executable, not a shell script, in CLI overrides.")
        return command
    executable = shutil.which(agent)
    if not executable:
        return None
    path = Path(executable)
    if path.suffix.lower() in {".cmd", ".bat", ".ps1"}:
        node = shutil.which("node")
        for package in PACKAGES[agent]:
            entry = path.parent / "node_modules" / package
            if node and entry.is_file():
                return [node, str(entry)]
        return None
    return [str(path)]


def agent_catalog():
    catalog = []
    for agent, label in LABELS.items():
        try:
            available = resolve_command(agent) is not None
        except ValueError:
            available = False
        catalog.append(
            {
                "id": agent,
                "label": label,
                "kind": "local" if agent == Agent.PI else "frontier",
                "available": available,
            }
        )
    return catalog
