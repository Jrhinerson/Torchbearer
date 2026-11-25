import uuid

from django.db import models


class GitHubConnection(models.Model):
    # Torchbearer is a local single-user app with one explicitly selected GitHub account.
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    config_id = models.UUIDField(default=uuid.uuid4, editable=False)
    account_id = models.PositiveBigIntegerField()
    login = models.CharField(max_length=39)
    name = models.CharField(max_length=255, blank=True)
    connected_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(id=1), name="one_github_connection")
        ]
