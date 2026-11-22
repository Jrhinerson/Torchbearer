from projects.models import Project
from projects.serializers import ProjectSerializer
from rest_framework import serializers

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    project = ProjectSerializer(read_only=True)
    project_id = serializers.PrimaryKeyRelatedField(
        source="project",
        queryset=Project.objects.filter(archived=False),
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "project",
            "project_id",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def to_internal_value(self, data):
        # Reject workflow assignments rather than silently accepting an ignored field.
        if isinstance(data, dict) and "status" in data:
            raise serializers.ValidationError(
                {"status": ["Task status is managed by Torchbearer."]}
            )
        return super().to_internal_value(data)
