import json
import time

import pytest

from .adapters import RunnerFailure, arguments, execute, validate_result


def run_fixture(tmp_path, agent, **kwargs):
    return execute(
        agent,
        "plan",
        json.dumps(
            {"stage": "plan", "title": "Literal `text` $(command) \u2028"}, ensure_ascii=False
        ),
        tmp_path,
        tmp_path / "result.schema.json",
        kwargs.get("on_log", lambda log: None),
        kwargs.get("should_stop", lambda: None),
        timeout=kwargs.get("timeout", 10),
    )


@pytest.mark.parametrize("agent", ["codex", "claude", "pi"])
def test_all_cli_protocols_preserve_prompt_and_unicode(agent, fake_cli, tmp_path):
    fake_cli(agent, "echo")
    result, version = run_fixture(tmp_path, agent)
    assert result["outcome"] == "complete"
    assert "$(command)" in result["details"]
    assert "\u2028" in result["details"]
    assert version


@pytest.mark.parametrize("scenario", ["error", "malformed"])
def test_failed_or_malformed_cli_is_not_a_success(scenario, fake_cli, tmp_path):
    fake_cli("codex", scenario)
    with pytest.raises(RunnerFailure):
        run_fixture(tmp_path, "codex")


@pytest.mark.parametrize("scenario", ["denied", "denied_event"])
def test_denied_tools_are_blocked(fake_cli, tmp_path, scenario):
    fake_cli("claude", scenario)
    with pytest.raises(RunnerFailure) as error:
        run_fixture(tmp_path, "claude")
    assert error.value.state == "blocked"


def test_cancellation_kills_descendants(fake_cli, tmp_path):
    fake_cli("pi", "hang")
    heartbeat = tmp_path / "heartbeat.txt"
    with pytest.raises(RunnerFailure) as error:
        run_fixture(tmp_path, "pi", should_stop=lambda: "cancelled" if heartbeat.exists() else None)
    assert error.value.state == "cancelled"
    content = heartbeat.read_text()
    time.sleep(0.2)
    assert heartbeat.read_text() == content


def test_timeout_stops_agent(fake_cli, tmp_path):
    fake_cli("codex", "hang")
    with pytest.raises(RunnerFailure, match="timeout"):
        run_fixture(tmp_path, "codex", timeout=0.3)


def test_verbose_stderr_is_drained_and_logs_are_bounded(fake_cli, tmp_path):
    fake_cli("codex", "verbose")
    logs = []
    result, _ = run_fixture(tmp_path, "codex", on_log=logs.append)
    assert result["outcome"] == "complete"
    assert logs and max(map(len, logs)) <= 128000


def test_implementation_requires_reported_passing_commands():
    with pytest.raises(RunnerFailure, match="passing validation"):
        validate_result(
            {"outcome": "complete", "summary": "Done", "details": "No tests", "tests": []},
            "integrate",
        )
    assert "workspace-write" in arguments("codex", "integrate", "schema")
    assert "read-only" in arguments("codex", "plan", "schema")
    assert "read-only" in arguments("codex", "code_review", "schema")
    assert "edit" not in arguments("pi", "code_review", "schema")[-1]
    assert "Edit" not in arguments("claude", "code_review", "schema")
