from rest_framework import serializers

from .models import WorkflowDefinition, WorkType


class WorkflowDefinitionSerializer(serializers.ModelSerializer):
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
            "definition_version",
            "execution_profile",
        ]


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
