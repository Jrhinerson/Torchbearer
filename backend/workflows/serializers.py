from rest_framework import serializers

from .graph import GraphValidationError, graph_projection, validate_graph
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
            "definition_version",
            "execution_profile",
        ]


class WorkflowGraphSerializer(serializers.ModelSerializer):
    revision = serializers.IntegerField(source="graph_revision")
    updated_at = serializers.DateTimeField(source="graph_updated_at")

    class Meta:
        model = WorkflowDefinition
        fields = ["key", "name", "description", "graph", "revision", "updated_at"]


class WorkflowGraphUpdateSerializer(serializers.Serializer):
    graph = serializers.JSONField()
    revision = serializers.IntegerField(min_value=0, max_value=2147483646)

    def to_internal_value(self, data):
        if isinstance(data, dict):
            if set(data) - self.fields.keys():
                raise serializers.ValidationError(
                    {"non_field_errors": ["Only the graph and its revision can be changed."]}
                )
            if "revision" in data and type(data["revision"]) is not int:
                raise serializers.ValidationError({"revision": ["Use an integer revision."]})
        return super().to_internal_value(data)

    def validate_graph(self, value):
        try:
            return validate_graph(value)
        except GraphValidationError as error:
            raise serializers.ValidationError(error.errors) from error


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
