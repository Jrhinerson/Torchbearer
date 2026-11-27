"""One durable local worker per data directory. Interrupted work is never auto-repeated."""

import json
import os
import threading
import time
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .adapters import RunnerFailure, execute
from .execution import policy_for
from .models import AgentRun, Task, WorkerStatus
from .prompts import prompt_for
from .workspaces import ensure_workspace, fingerprint


class WorkerLock:
    def __enter__(self):
        settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.file = (settings.DATA_DIR / "agent-worker.lock").open("a+b")
        self.file.seek(0, os.SEEK_END)
        if not self.file.tell():
            self.file.write(b"0")
            self.file.flush()
        self.file.seek(0)
        try:
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            self.file.close()
            raise RuntimeError("Another agent worker already owns this data directory.") from error
        return self

    def __exit__(self, *args):
        self.file.close()


def worker_status():
    row = WorkerStatus.objects.filter(pk=1).first()
    return {
        "available": bool(
            row and row.running and row.heartbeat > timezone.now() - timedelta(seconds=20)
        ),
        "heartbeat": row.heartbeat if row else None,
        "active_run": row.active_run_id if row else None,
    }


class Worker:
    def __init__(self, stop=None):
        self.id = uuid.uuid4()
        self.stop = stop or threading.Event()
        self.last_heartbeat = 0

    def heartbeat(self, active=None, force=False):
        if force or time.monotonic() - self.last_heartbeat >= 1:
            values = {
                "worker_id": self.id,
                "heartbeat": timezone.now(),
                "running": True,
                "active_run": active,
            }
            if not WorkerStatus.objects.filter(pk=1).update(**values):
                WorkerStatus.objects.create(pk=1, **values)
            self.last_heartbeat = time.monotonic()

    @transaction.atomic
    def recover(self):
        abandoned = list(AgentRun.objects.filter(state="running").values_list("task_id", flat=True))
        AgentRun.objects.filter(state="running").update(
            state="interrupted",
            finished_at=timezone.now(),
            error="The previous worker stopped. Review the workspace before explicitly retrying.",
        )
        Task.objects.filter(pk__in=abandoned).update(revision=F("revision") + 1)
        self.heartbeat(force=True)

    @transaction.atomic
    def claim(self):
        run = AgentRun.objects.filter(state="queued").order_by("created_at", "id").first()
        if not run or not AgentRun.objects.filter(pk=run.pk, state="queued").update(
            state="running", worker_id=self.id, started_at=timezone.now()
        ):
            return None
        Task.objects.filter(pk=run.task_id).update(revision=F("revision") + 1)
        run.refresh_from_db()
        return run

    @transaction.atomic
    def finish(self, run, state, result, error, snapshot):
        # The final cancellation check shares the write lock with cancellation requests.
        AgentRun.objects.filter(pk=run.pk, state="running", worker_id=self.id).update(log=F("log"))
        current = AgentRun.objects.get(pk=run.pk)
        if current.state != "running" or current.worker_id != self.id:
            return
        if current.cancel_requested:
            state, error = "cancelled", "Run cancelled."
        AgentRun.objects.filter(pk=run.pk).update(
            state=state,
            result=result,
            error=error[:4000],
            finished_at=timezone.now(),
            review_fingerprint=snapshot if state == "succeeded" else "",
        )
        Task.objects.filter(pk=run.task_id).update(
            revision=F("revision") + 1, updated_at=timezone.now()
        )

    def run_once(self):
        run = self.claim()
        if run is None:
            self.heartbeat()
            return False
        self.heartbeat(run, force=True)
        state, result, error, snapshot = "failed", {}, "", ""
        last_check = 0
        cancelled = False

        def should_stop():
            nonlocal last_check, cancelled
            if self.stop.is_set():
                return "interrupted"
            if time.monotonic() - last_check >= 0.2:
                self.heartbeat(run)
                cancelled = AgentRun.objects.get(pk=run.pk).cancel_requested
                last_check = time.monotonic()
            return "cancelled" if cancelled else None

        try:
            workspace = ensure_workspace(run.task)
            before = fingerprint(run.task)
            if run.input_fingerprint and before != run.input_fingerprint:
                raise RunnerFailure(
                    "The workspace changed while queued. Review it and request a new run.",
                    "blocked",
                )
            run.input_fingerprint = before
            run.input_context = prompt_for(run)
            AgentRun.objects.filter(pk=run.pk).update(
                input_context=run.input_context, input_fingerprint=before
            )
            if stop := should_stop():
                raise RunnerFailure("The run was stopped before launch.", stop)
            result, _ = execute(
                run.agent,
                run.stage,
                json.dumps(run.input_context, ensure_ascii=False),
                workspace,
                settings.DATA_DIR / "run-artifacts" / str(run.id) / "result.schema.json",
                on_log=lambda log: AgentRun.objects.filter(pk=run.pk).update(log=log),
                should_stop=should_stop,
                on_started=lambda version: AgentRun.objects.filter(pk=run.pk).update(
                    cli_version=version
                ),
                timeout=settings.TORCHBEARER_RUN_TIMEOUT,
                workflow=run.input_context.get("workflow"),
            )
            snapshot = fingerprint(run.task)
            if (
                not policy_for(run.stage, run.input_context.get("workflow")).can_write
                and snapshot != before
            ):
                raise RunnerFailure(
                    f"The {run.stage.title()} agent changed workspace files. "
                    "Review them before requesting another run.",
                    "blocked",
                )
            state = {"complete": "succeeded", "blocked": "blocked", "failed": "failed"}[
                result["outcome"]
            ]
            if state != "succeeded":
                error = result["summary"]
        except RunnerFailure as failure:
            state, error = failure.state, str(failure)
        except Exception as failure:
            state, error = "failed", f"{type(failure).__name__}: {failure}"
        finally:
            self.finish(run, state, result, error, snapshot)
            self.heartbeat(force=True)
        return True

    def run(self, once=False):
        with WorkerLock():
            self.recover()
            try:
                while not self.stop.is_set():
                    worked = self.run_once()
                    if once:
                        break
                    if not worked:
                        self.stop.wait(0.2)
            finally:
                WorkerStatus.objects.filter(pk=1, worker_id=self.id).update(
                    running=False, active_run=None, heartbeat=timezone.now()
                )
