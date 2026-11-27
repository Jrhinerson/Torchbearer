"""Own one native device authorization in the local single-process service."""

import math
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from django.conf import settings
from django.db import DatabaseError, transaction
from rest_framework.exceptions import APIException

from .credentials import CredentialError, CredentialStore, InvalidCredentials, StoredCredentials
from .models import GitHubConnection
from .oauth import VERIFICATION_URL, GitHubOAuthClient, GitHubRequestError, Tokens


class GitHubError(APIException):
    status_code = 503
    default_detail = "GitHub sign-in failed. Check your connection and try again."


class StaleAuthorization(APIException):
    status_code = 409
    default_detail = "This GitHub sign-in is no longer active. Start a new connection."


@dataclass
class Authorization:
    id: uuid.UUID
    client_id: str
    deadline: float
    user_code: str = ""
    device_code: str = field(default="", repr=False)
    tokens: Tokens | None = field(default=None, repr=False)
    expires_at: float | None = None
    interval: int = 5
    next_poll: float = 0
    state: str = "pending"
    error: str = ""
    busy: bool = True

    def serialize(self, now):
        return {
            "id": str(self.id),
            "state": self.state,
            "user_code": self.user_code,
            "verification_url": VERIFICATION_URL if self.user_code else "",
            "expires_at": datetime.fromtimestamp(self.expires_at, UTC).isoformat()
            if self.expires_at
            else None,
            "poll_after": max(1, math.ceil(self.next_poll - now)),
            "error": self.error,
        }


class GitHubService:
    def __init__(
        self,
        *,
        store=None,
        client_factory=GitHubOAuthClient,
        clock=time.monotonic,
        wall_clock=time.time,
    ):
        self.lock = threading.RLock()
        self.verification_lock = threading.Lock()
        self.store = store if store is not None else CredentialStore()
        self.client_factory = client_factory
        self.clock = clock
        self.wall_clock = wall_clock
        self.authorization = None
        self.invalid_credentials = set()

    def _availability(self):
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,255}", settings.TORCHBEARER_GITHUB_CLIENT_ID):
            return "GitHub sign-in is not configured in this build. Contact the app publisher."
        try:
            self.store.ready()
        except CredentialError as error:
            return str(error)
        return ""

    def _expire(self):
        if (
            self.authorization
            and self.authorization.state == "pending"
            and self.clock() >= self.authorization.deadline
        ):
            self._fail("GitHub sign-in expired. Connect again to get a new code.", "expired")

    def status(self):
        with self.lock:
            self._expire()
            reason = self._availability()
            connection = GitHubConnection.objects.filter(pk=1).first()
            reauthorize = bool(
                connection
                and (
                    not connection.client_id
                    or connection.client_id != settings.TORCHBEARER_GITHUB_CLIENT_ID
                    or connection.config_id in self.invalid_credentials
                )
            )
            if connection and not reauthorize and not reason:
                try:
                    credentials = self.store.read(connection.config_id)
                    reauthorize = not self._credentials_match(connection, credentials)
                except InvalidCredentials:
                    reauthorize = True
                except CredentialError as error:
                    reason = str(error)
            return {
                "available": not reason,
                "unavailable_reason": reason,
                "account": {
                    "id": connection.account_id,
                    "login": connection.login,
                    "name": connection.name,
                    "connected_at": connection.connected_at.isoformat(),
                    "reauthorization_required": reauthorize,
                }
                if connection
                else None,
                "authorization": self.authorization.serialize(self.clock())
                if self.authorization
                else None,
            }

    def connect(self):
        with self.lock:
            self._expire()
            if self.authorization and self.authorization.state == "pending":
                return self.status()
            if reason := self._availability():
                raise GitHubError(reason)
            authorization = Authorization(
                uuid.uuid4(), settings.TORCHBEARER_GITHUB_CLIENT_ID, self.clock() + 900
            )
            self.authorization = authorization
        started = self.clock()
        started_wall = self.wall_clock()
        try:
            code = self.client_factory(authorization.client_id).request_device_code()
        except GitHubRequestError as error:
            with self.lock:
                self._current(authorization.id)
                self.authorization = None
            raise GitHubError(str(error)) from None
        with self.lock:
            self._current(authorization.id)
            authorization.busy = False
            authorization.device_code = code.device_code
            authorization.user_code = code.user_code
            authorization.deadline = started + code.expires_in
            authorization.expires_at = started_wall + code.expires_in
            authorization.interval = code.interval
            authorization.next_poll = self.clock() + code.interval
            return self.status()

    def poll(self, authorization_id):
        with self.lock:
            authorization = self._current(authorization_id)
            if (
                authorization.state != "pending"
                or authorization.busy
                or self.clock() < authorization.next_poll
            ):
                return self.status()
            authorization.busy = True
            client = self.client_factory(authorization.client_id)
            tokens = authorization.tokens
            device_code = authorization.device_code
        try:
            if tokens is None:
                result = client.poll_tokens(device_code)
                with self.lock:
                    self._current(authorization_id)
                    if authorization.state != "pending":
                        return self.status()
                    authorization.next_poll = self.clock() + authorization.interval
                    if result.error:
                        authorization.busy = False
                        if result.error == "authorization_pending":
                            authorization.error = ""
                        elif result.error == "slow_down":
                            authorization.interval = max(
                                authorization.interval + 5, result.interval
                            )
                            authorization.next_poll = self.clock() + authorization.interval
                        elif result.error in {"expired_token", "token_expired"}:
                            self._fail(
                                "GitHub sign-in expired. Connect again to get a new code.",
                                "expired",
                            )
                        else:
                            self._fail(
                                "GitHub authorization was denied or failed. Try connecting again."
                            )
                        return self.status()
                    authorization.tokens = result.tokens
                    tokens = result.tokens
            account = client.user(tokens.access_token)
            with self.lock:
                self._current(authorization_id)
                if authorization.state != "pending":
                    return self.status()
            credentials = StoredCredentials(authorization.client_id, account["account_id"], tokens)
            # This write can prompt for keychain access. Recheck cancellation after it completes.
            self.store.write(authorization.id, credentials)
            with self.lock:
                self._current(authorization_id)
                if authorization.state != "pending":
                    self.store.delete(authorization.id)
                    return self.status()
                try:
                    with transaction.atomic():
                        previous = GitHubConnection.objects.filter(pk=1).first()
                        GitHubConnection.objects.update_or_create(
                            pk=1,
                            defaults={
                                **account,
                                "config_id": authorization.id,
                                "client_id": authorization.client_id,
                            },
                        )
                        if previous and previous.client_id:
                            self.store.delete(previous.config_id)
                except Exception:
                    self.store.delete(authorization.id)
                    raise
                self.authorization = None
                if previous:
                    self.invalid_credentials.discard(previous.config_id)
                return self.status()
        except StaleAuthorization:
            self.store.delete(authorization.id)
            raise
        except CredentialError as error:
            with self.lock:
                self._current(authorization_id)
                self._fail(str(error))
                return self.status()
        except DatabaseError:
            with self.lock:
                self._current(authorization_id)
                self._fail("Could not save the GitHub connection. Please connect again.")
                return self.status()
        except GitHubRequestError as error:
            with self.lock:
                self._current(authorization_id)
                if authorization.state != "pending":
                    return self.status()
                authorization.busy = False
                if error.code in {"", "unavailable", "rate_limited"}:
                    authorization.error = str(error)
                    authorization.next_poll = self.clock() + max(
                        authorization.interval, error.retry_after, 5
                    )
                else:
                    self._fail(str(error))
                return self.status()

    def cancel(self, authorization_id):
        with self.lock:
            self._current(authorization_id)
            self.authorization = None
            return self.status()

    def disconnect(self):
        with self.lock:
            self.authorization = None
            connection = GitHubConnection.objects.filter(pk=1).first()
            if connection:
                try:
                    if connection.client_id:
                        self.store.delete(connection.config_id)
                except CredentialError as error:
                    raise GitHubError(str(error)) from None
                connection.delete()
                self.invalid_credentials.discard(connection.config_id)
            return self.status()

    @staticmethod
    def _credentials_match(connection, credentials):
        return bool(
            credentials
            and credentials.client_id == connection.client_id
            and credentials.account_id == connection.account_id
        )

    def _connection_current(self, snapshot):
        current = GitHubConnection.objects.filter(pk=1).first()
        if not current or (current.config_id, current.account_id, current.client_id) != (
            snapshot.config_id,
            snapshot.account_id,
            snapshot.client_id,
        ):
            raise StaleAuthorization(
                "The GitHub connection changed. Reload connections to continue."
            )
        return current

    def _invalidate(self, snapshot):
        with self.lock:
            self._connection_current(snapshot)
            self.invalid_credentials.add(snapshot.config_id)
            self.store.delete(snapshot.config_id)
            return self.status()

    def _save_rotated(self, snapshot, tokens):
        with self.lock:
            self._connection_current(snapshot)
        try:
            self.store.write(
                snapshot.config_id,
                StoredCredentials(snapshot.client_id, snapshot.account_id, tokens),
            )
        except CredentialError:
            with self.lock:
                self.invalid_credentials.add(snapshot.config_id)
            raise
        with self.lock:
            try:
                self._connection_current(snapshot)
            except StaleAuthorization:
                self.store.delete(snapshot.config_id)
                raise

    def verify(self):
        # Refresh tokens are single-use: concurrent tabs must not rotate the same token twice.
        # Keep cancellation/disconnect free to take the separate service lock during HTTPS.
        with self.verification_lock:
            with self.lock:
                snapshot = GitHubConnection.objects.filter(pk=1).first()
                if (
                    not snapshot
                    or not snapshot.client_id
                    or snapshot.client_id != settings.TORCHBEARER_GITHUB_CLIENT_ID
                    or snapshot.config_id in self.invalid_credentials
                ):
                    return self.status()
                if reason := self._availability():
                    raise GitHubError(reason)
            try:
                try:
                    credentials = self.store.read(snapshot.config_id)
                except InvalidCredentials:
                    return self._invalidate(snapshot)
                if not self._credentials_match(snapshot, credentials):
                    return self._invalidate(snapshot)
                client = self.client_factory(snapshot.client_id)
                tokens = credentials.tokens

                def refresh():
                    if not tokens.refresh_token or (
                        tokens.refresh_expires_at is not None
                        and tokens.refresh_expires_at <= self.wall_clock()
                    ):
                        raise GitHubRequestError(
                            "GitHub authorization has expired. Connect again.",
                            code="reauthorization_required",
                        )
                    rotated = client.refresh_tokens(tokens.refresh_token)
                    # Persist rotation before another HTTPS call; a temporary profile outage
                    # must not lose the only usable refresh token.
                    self._save_rotated(snapshot, rotated)
                    return rotated

                refreshed = False
                if tokens.expires_at is not None and tokens.expires_at <= self.wall_clock() + 60:
                    tokens = refresh()
                    refreshed = True
                try:
                    account = client.user(tokens.access_token)
                except GitHubRequestError as error:
                    if error.code != "unauthorized" or refreshed:
                        raise
                    tokens = refresh()
                    account = client.user(tokens.access_token)
                if account["account_id"] != snapshot.account_id:
                    return self._invalidate(snapshot)
                with self.lock:
                    self._connection_current(snapshot)
                    GitHubConnection.objects.filter(pk=1).update(
                        login=account["login"], name=account["name"]
                    )
                    return self.status()
            except GitHubRequestError as error:
                if error.code in {"unauthorized", "reauthorization_required"}:
                    return self._invalidate(snapshot)
                raise GitHubError(str(error)) from None
            except CredentialError as error:
                raise GitHubError(str(error)) from None

    def _current(self, authorization_id):
        if not self.authorization or str(self.authorization.id) != str(authorization_id):
            raise StaleAuthorization()
        self._expire()
        return self.authorization

    def _fail(self, message, state="failed"):
        self.authorization.state = state
        self.authorization.error = message
        self.authorization.device_code = ""
        self.authorization.tokens = None
        self.authorization.busy = False


github = GitHubService()
