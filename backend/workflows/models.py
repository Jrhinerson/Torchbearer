from django.db import models


class WorkflowDefinition(models.Model):
    key = models.SlugField(primary_key=True, max_length=80)
    name = models.CharField(max_length=150)
    description = models.TextField()
    steps = models.JSONField(default=list)
    outputs = models.JSONField(default=list)
    validation = models.JSONField(default=list)
    approval_points = models.JSONField(default=list)
    graph = models.JSONField(null=True, blank=True, default=None)
    graph_revision = models.PositiveIntegerField(default=0)
    graph_updated_at = models.DateTimeField(null=True, blank=True)
    display_order = models.PositiveSmallIntegerField()
    definition_version = models.PositiveIntegerField(default=1)
    execution_profile = models.JSONField(default=dict)

    class Meta:
        ordering = ["display_order", "key"]

    def __str__(self):
        return self.name


class WorkType(models.Model):
    key = models.SlugField(primary_key=True, max_length=80)
    name = models.CharField(max_length=150)
    description = models.TextField()
    recommended_workflow = models.ForeignKey(
        WorkflowDefinition, on_delete=models.PROTECT, related_name="recommended_for"
    )
    assigned_workflow = models.ForeignKey(
        WorkflowDefinition, on_delete=models.PROTECT, related_name="assigned_to"
    )
    display_order = models.PositiveSmallIntegerField()
    revision = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["display_order", "key"]

    def __str__(self):
        return self.name
