"""Small CLI adapters with bounded JSONL output and one normalized result contract."""

import json
import os
import queue
import re
import subprocess
import threading
import time

from .cli import LABELS, resolve_command
from .processes import ProcessTree

RESULT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "outcome": {"type": "string", "enum": ["complete", "blocked", "failed"]},
        "summary": {"type": "string"},
        "details": {"type": "string"},
        "tests": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "command": {"type": "string"},
                    "outcome": {"type": "string", "enum": ["pass", "fail", "not_run"]},
                    "details": {"type": "string"},
                },
                "required": ["command", "outcome", "details"],
            },
        },
    },
    "required": ["outcome", "summary", "details", "tests"],
}
MINIMUM_VERSIONS = {"codex": (0, 162, 0), "claude": (2, 1, 259), "pi": (0, 74, 0)}
MAX_RECORD = 2 * 1024 * 1024
MAX_OUTPUT = 20 * 1024 * 1024
LOG_LIMIT = 128000


class RunnerFailure(Exception):
    def __init__(self, message, state="failed"):
        super().__init__(message)
        self.state = state


def preflight(agent):
    try:
        command = resolve_command(agent)
        if not command:
            raise ValueError(f"Install {LABELS[agent]} and add it to PATH.")
        info = subprocess.run(
            [*command, "--version"],
            capture_output=True,
            timeout=15,
            check=False,
            encoding="utf-8",
            errors="replace",
            **({"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}),
        )
        version = re.search(r"\b(\d+)\.(\d+)\.(\d+)\b", info.stdout)
        if info.returncode or not version:
            raise ValueError(f"Could not read {LABELS[agent]}'s version. Check its installation.")
        if tuple(map(int, version.groups())) < MINIMUM_VERSIONS[agent]:
            minimum = ".".join(map(str, MINIMUM_VERSIONS[agent]))
            raise ValueError(f"Update {LABELS[agent]} to {minimum} or newer.")
        return command, version.group()
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        raise RunnerFailure(str(error), "blocked") from error


def arguments(agent, stage, schema_path):
    if agent == "codex":
        sandbox = "read-only" if stage == "plan" else "workspace-write"
        return [
            "-a",
            "never",
            "exec",
            "--json",
            "--ephemeral",
            "--sandbox",
            sandbox,
            "--output-schema",
            str(schema_path),
            "-",
        ]
    if agent == "claude":
        tools = "Read,Grep,Glob"
        if stage == "integrate":
            tools += ",Edit,Write,Bash"
        elif stage == "test":
            tools += ",Bash"
        return [
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--permission-prompts",
            "none",
            "--tools",
            tools,
            "--allowedTools",
            tools,
            "--json-schema",
            json.dumps(RESULT_SCHEMA),
        ]
    tools = "read,grep,find,ls"
    if stage == "integrate":
        tools += ",edit,write,bash"
    elif stage == "test":
        tools += ",bash"
    return ["--mode", "json", "--no-session", "--tools", tools]


def validate_result(value, stage):
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("```json\n") and text.endswith("```"):
            text = text[8:-3].strip()
        try:
            value = json.loads(text)
        except ValueError as error:
            raise RunnerFailure(
                "The agent did not return the required JSON result. Review its log and retry."
            ) from error
    if not isinstance(value, dict) or set(value) != {"outcome", "summary", "details", "tests"}:
        raise RunnerFailure("The agent result is missing required fields.")
    if value["outcome"] not in {"complete", "blocked", "failed"}:
        raise RunnerFailure("The agent returned an invalid outcome.")
    for field, limit in [("summary", 4000), ("details", 60000)]:
        if (
            not isinstance(value[field], str)
            or not value[field].strip()
            or len(value[field]) > limit
        ):
            raise RunnerFailure(f"The agent returned invalid {field}.")
    tests = value["tests"]
    if not isinstance(tests, list) or len(tests) > 100:
        raise RunnerFailure("The agent returned an invalid test report.")
    for test in tests:
        if (
            not isinstance(test, dict)
            or set(test) != {"command", "outcome", "details"}
            or test["outcome"] not in {"pass", "fail", "not_run"}
            or not isinstance(test["command"], str)
            or not test["command"].strip()
            or len(test["command"]) > 2000
            or not isinstance(test["details"], str)
            or len(test["details"]) > 8000
        ):
            raise RunnerFailure("The agent returned an invalid test report entry.")
    if (
        stage == "test"
        and value["outcome"] == "complete"
        and (not tests or any(test["outcome"] != "pass" for test in tests))
    ):
        raise RunnerFailure("Test cannot complete without passing validation commands.")
    return value


class Events:
    def __init__(self, agent):
        self.agent = agent
        self.result = None
        self.complete = False
        self.failure = ""
        self.denied = False

    def feed(self, line):
        try:
            event = json.loads(line)
        except ValueError as error:
            raise RunnerFailure(
                "The CLI returned invalid JSONL output. Check its supported version."
            ) from error
        if not isinstance(event, dict):
            raise RunnerFailure("The CLI returned an invalid protocol record.")
        kind = event.get("type")
        if self.agent == "codex":
            if kind == "item.completed" and event.get("item", {}).get("type") == "agent_message":
                self.result = event["item"].get("text", "")
            if kind == "turn.completed":
                self.complete = True
            if kind in {"turn.failed", "error"}:
                self.failure = str(event.get("error") or event.get("message") or "Codex failed.")[
                    :2000
                ]
        elif self.agent == "claude":
            if kind == "result":
                self.complete = True
                self.result = event.get("structured_output") or event.get("result", "")
                self.denied = bool(event.get("permission_denials"))
                if event.get("is_error"):
                    self.failure = str(
                        event.get("result") or event.get("errors") or "Claude Code failed."
                    )[:2000]
            if kind == "system" and event.get("subtype") == "permission_denied":
                self.denied = True
        else:
            message = event.get("message", {})
            if kind == "message_end" and message.get("role") == "assistant":
                self.result = "".join(
                    part.get("text", "")
                    for part in message.get("content", [])
                    if part.get("type") == "text"
                )
                if message.get("stopReason") in {"error", "aborted"}:
                    self.failure = message.get("errorMessage") or "Pi stopped before completion."
            if kind in {"agent_end", "agent_settled"}:
                self.complete = True
                if event.get("aborted"):
                    self.failure = "Pi was aborted."
            if kind == "auto_retry_end" and not event.get("success"):
                self.failure = str(event.get("finalError") or "Pi's request failed.")[:2000]


def execute(
    agent,
    stage,
    prompt,
    cwd,
    schema_path,
    on_log,
    should_stop,
    on_started=lambda version: None,
    timeout=1800,
):
    command, version = preflight(agent)
    schema_path.parent.mkdir(parents=True, exist_ok=True)
    schema_path.write_text(json.dumps(RESULT_SCHEMA), encoding="utf-8")
    parser = Events(agent)
    events = queue.Queue(maxsize=200)
    log = ""
    total = 0
    started = time.monotonic()
    last_update = started
    # Do not inherit Git variables that could redirect operations into another repository.
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    tree = ProcessTree([*command, *arguments(agent, stage, schema_path)], cwd, env)

    def read(stream, source):
        try:
            while chunk := stream.readline(MAX_RECORD + 1):
                events.put((source, chunk))
                if len(chunk) > MAX_RECORD:
                    break
        finally:
            events.put((source, None))

    readers = [
        threading.Thread(target=read, args=(stream, name), daemon=True)
        for stream, name in [(tree.process.stdout, "stdout"), (tree.process.stderr, "stderr")]
    ]
    for reader in readers:
        reader.start()

    # Writing on a separate thread keeps cancellation responsive if a CLI never consumes stdin.
    def send_prompt():
        try:
            tree.process.stdin.write(prompt.encode("utf-8"))
            tree.process.stdin.close()
        except OSError, ValueError:
            pass

    writer = threading.Thread(target=send_prompt, daemon=True)
    writer.start()
    closed = set()
    try:
        on_started(version)
        while len(closed) < 2 or tree.process.poll() is None:
            stop = should_stop()
            if stop:
                raise RunnerFailure(
                    "Run cancelled."
                    if stop == "cancelled"
                    else "Worker stopped; review the workspace before retrying.",
                    stop,
                )
            if time.monotonic() - started > timeout:
                raise RunnerFailure(
                    "The agent exceeded the run timeout. Review its workspace before retrying."
                )
            try:
                source, chunk = events.get(timeout=0.1)
            except queue.Empty:
                continue
            if chunk is None:
                closed.add(source)
                continue
            total += len(chunk)
            if total > MAX_OUTPUT or len(chunk) > MAX_RECORD:
                raise RunnerFailure("The agent exceeded the output limit.")
            text = chunk.decode("utf-8", errors="replace")
            log = (log + text)[-LOG_LIMIT:]
            if source == "stdout" and text.strip():
                parser.feed(text)
            if time.monotonic() - last_update >= 0.5:
                on_log(log)
                last_update = time.monotonic()
        code = tree.process.wait()
        on_log(log)
        if parser.denied:
            raise RunnerFailure(
                "A required tool was denied by the CLI permission policy. Review the log.",
                "blocked",
            )
        if parser.failure:
            raise RunnerFailure(parser.failure)
        if code != 0:
            raise RunnerFailure(
                f"{LABELS[agent]} exited with code {code}. "
                "Check the log for authentication or configuration errors."
            )
        if not parser.complete or parser.result is None:
            raise RunnerFailure("The CLI exited without a completed agent result.")
        return validate_result(parser.result, stage), version
    finally:
        tree.stop()
        writer.join(timeout=2)
        # Drain any bounded queue backlog so reader threads can finish after the process is killed.
        while any(reader.is_alive() for reader in readers):
            try:
                events.get(timeout=0.1)
            except queue.Empty:
                pass
            for reader in readers:
                reader.join(timeout=0.05)
        tree.close()
        on_log(log)
