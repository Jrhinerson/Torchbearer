"""GitHub CLI owns OAuth and credentials; Torchbearer retains only verified identity.

Login runs headlessly so the React client can open GitHub in the user's browser.
Each attempt has a separate gh config, never adopting the shell's active account.
"""

import atexit
import json
import os
import re
import shutil
import subprocess
import threading
import uuid
from dataclasses import dataclass, field

from django.conf import settings
from rest_framework.exceptions import APIException
from tasks.processes import ProcessTree

from .models import GitHubConnection

VERIFICATION_URL = "https://github.com/login/device"
LOGIN_TIMEOUT = 900
CODE_PATTERN = re.compile(r"\b[A-Z0-9]{4}-[A-Z0-9]{4}\b")


class GitHubError(APIException):
    status_code = 503
    default_detail = "GitHub sign-in failed. Check your connection and try again."


class StaleAuthorization(APIException):
    status_code = 409
    default_detail = "This GitHub sign-in is no longer active. Start a new connection."


def command():
    executable = shutil.which("gh")
    return [executable] if executable else None


def config_directory(config_id):
    return settings.DATA_DIR / "github" / str(config_id)


def environment(config_id):
    # Environment credentials override gh's account selection, including GH_CONFIG_DIR.
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.upper().startswith(("GH_", "GITHUB_"))
    }
    env.update(
        GH_CONFIG_DIR=str(config_directory(config_id)),
        GH_HOST="github.com",
        GH_PROMPT_DISABLED="1",
        GH_NO_UPDATE_NOTIFIER="1",
        GH_NO_EXTENSION_UPDATE_NOTIFIER="1",
        NO_COLOR="1",
        TERM="dumb",
    )
    return env


def remove_config(config_id):
    # The UUID is generated internally; never accept a client-supplied filesystem path.
    directory = config_directory(uuid.UUID(str(config_id)))
    if directory.exists():
        shutil.rmtree(directory)


def profile(config_id):
    try:
        result = subprocess.run(
            [*command(), "api", "--hostname", "github.com", "user"],
            env=environment(config_id),
            cwd=settings.DATA_DIR,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=20,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            check=True,
        )
        account = json.loads(result.stdout)
        if (
            not isinstance(account["id"], int)
            or isinstance(account["id"], bool)
            or account["id"] <= 0
            or not isinstance(account["login"], str)
            or not re.fullmatch(r"[A-Za-z0-9-]{1,39}", account["login"])
        ):
            raise ValueError("Invalid account identity")
        return {
            "account_id": account["id"],
            "login": account["login"],
            "name": (account.get("name") or "")[:255],
        }
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError) as error:
        # CLI output can contain credentials; never expose it in errors or logs.
        raise GitHubError("Could not verify the GitHub account. Try connecting again.") from error


@dataclass
class Authorization:
    id: uuid.UUID
    tree: ProcessTree
    code: str = ""
    state: str = "pending"
    error: str = ""
    verifying: bool = False
    finished: threading.Event = field(default_factory=threading.Event)
    timer: threading.Timer | None = None

    def read_output(self):
        try:
            for line in self.tree.process.stderr:
                match = CODE_PATTERN.search(line.decode("utf-8", errors="replace"))
                if match:
                    self.code = match.group()
            self.tree.process.wait()
        finally:
            self.finished.set()

    def serialize(self):
        return {
            "id": str(self.id),
            "state": self.state,
            "user_code": self.code,
            "verification_url": VERIFICATION_URL if self.code else "",
            "error": self.error,
        }


class GitHubService:
    def __init__(self):
        self.lock = threading.RLock()
        self.authorization = None

    def status(self):
        connection = GitHubConnection.objects.filter(pk=1).first()
        return {
            "available": command() is not None,
            "account": (
                {
                    "id": connection.account_id,
                    "login": connection.login,
                    "name": connection.name,
                    "connected_at": connection.connected_at.isoformat(),
                }
                if connection
                else None
            ),
            "authorization": self.authorization.serialize() if self.authorization else None,
        }

    def connect(self):
        with self.lock:
            if self.authorization and self.authorization.state == "pending":
                return self.status()
            self._clear()
            executable = command()
            if not executable:
                raise GitHubError("Install GitHub CLI (gh) on this machine, then try again.")
            config_id = uuid.uuid4()
            config_directory(config_id).mkdir(mode=0o700, parents=True)
            try:
                tree = ProcessTree(
                    [
                        *executable,
                        "auth",
                        "login",
                        "--hostname",
                        "github.com",
                        "--git-protocol",
                        "https",
                        "--web",
                        "--skip-ssh-key",
                    ],
                    cwd=settings.DATA_DIR,
                    env=environment(config_id),
                )
            except OSError as error:
                remove_config(config_id)
                raise GitHubError("Could not start GitHub CLI. Check its installation.") from error
            tree.process.stdin.close()
            authorization = Authorization(id=config_id, tree=tree)
            self.authorization = authorization
            authorization.timer = threading.Timer(LOGIN_TIMEOUT, self._expire, args=(config_id,))
            authorization.timer.daemon = True
            authorization.timer.start()
            threading.Thread(target=authorization.read_output, daemon=True).start()
            return self.status()

    def poll(self, authorization_id):
        with self.lock:
            authorization = self._current(authorization_id)
            if (
                authorization.state != "pending"
                or not authorization.finished.is_set()
                or authorization.verifying
            ):
                return self.status()
            if authorization.tree.process.returncode != 0:
                self._fail("GitHub authorization was denied or failed. Try connecting again.")
                return self.status()
            authorization.verifying = True
        # Never hold the service lock over a network call: cancellation and expiry
        # must be able to invalidate an in-flight identity verification.
        try:
            account = profile(authorization.id)
        except GitHubError:
            account = None
        with self.lock:
            self._current(authorization_id)
            if authorization.state != "pending":
                return self.status()
            authorization.verifying = False
            if account is None:
                self._fail("Could not verify the GitHub account. Try connecting again.")
                return self.status()
            previous = GitHubConnection.objects.filter(pk=1).first()
            GitHubConnection.objects.update_or_create(
                pk=1, defaults={**account, "config_id": authorization.id}
            )
            self._clear(keep_config=True)
            if previous and previous.config_id != authorization.id:
                remove_config(previous.config_id)
            return self.status()

    def cancel(self, authorization_id):
        with self.lock:
            self._current(authorization_id)
            self._clear()
            return self.status()

    def disconnect(self):
        with self.lock:
            self._clear()
            connection = GitHubConnection.objects.filter(pk=1).first()
            if connection:
                connection.delete()
                remove_config(connection.config_id)
            # gh's keyring can be shared with other applications. Do not run gh auth logout.
            return self.status()

    def _current(self, authorization_id):
        if not self.authorization or str(self.authorization.id) != str(authorization_id):
            raise StaleAuthorization()
        return self.authorization

    def _fail(self, message, state="failed"):
        authorization = self.authorization
        authorization.state = state
        authorization.error = message
        authorization.timer.cancel()
        authorization.tree.stop()
        authorization.finished.wait(timeout=10)
        authorization.tree.close()
        remove_config(authorization.id)

    def _expire(self, authorization_id):
        with self.lock:
            if self.authorization and self.authorization.id == authorization_id:
                self._fail("GitHub sign-in expired. Connect again to get a new code.", "expired")

    def _clear(self, *, keep_config=False):
        authorization = self.authorization
        if authorization:
            authorization.timer.cancel()
            authorization.tree.stop()
            authorization.finished.wait(timeout=10)
            authorization.tree.close()
            if not keep_config:
                remove_config(authorization.id)
            self.authorization = None

    def shutdown(self):
        with self.lock:
            self._clear()


github = GitHubService()
atexit.register(github.shutdown)
