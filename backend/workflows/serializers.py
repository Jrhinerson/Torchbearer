from rest_framework import serializers

from .graph import graph_projection
from .models import WorkflowDefinition, WorkType


class WorkflowDefinitionSerializer(serializers.ModelSerializer):
    has_graph = serializers.SerializerMethodField()

    def get_has_graph(self, obj):
        return obj.graph is not None

    def to_representation(self, instance):
        result = super().to_representation(instance)
        if instance.graph is not None:
            result.update(graph_projection(instance.graph))
        return result

    class Meta:
        model = WorkflowDefinition
        fields = [
            "key",
            "name",
            "description",
            "steps",
            "outputs",
            "validation",
            "approval_points",
            "has_graph",
        ]


class WorkflowGraphSerializer(serializers.ModelSerializer):
    revision = serializers.IntegerField(source="graph_revision")
    updated_at = serializers.DateTimeField(source="graph_updated_at")

    class Meta:
        model = WorkflowDefinition
        fields = ["key", "name", "description", "graph", "revision", "updated_at"]


class WorkTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkType
        fields = [
            "key",
            "name",
            "description",
            "recommended_workflow",
            "assigned_workflow",
            "revision",
            "updated_at",
        ]


class AssignmentSerializer(serializers.Serializer):
    assigned_workflow = serializers.PrimaryKeyRelatedField(
        queryset=WorkflowDefinition.objects.all()
    )
    revision = serializers.IntegerField(min_value=0)

    def to_internal_value(self, data):
        if isinstance(data, dict) and set(data) - self.fields.keys():
            raise serializers.ValidationError(
                {"non_field_errors": ["Only the workflow assignment can be changed."]}
            )
        return super().to_internal_value(data)
