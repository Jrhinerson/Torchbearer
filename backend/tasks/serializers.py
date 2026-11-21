from rest_framework import serializers

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ["id", "title", "description", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def to_internal_value(self, data):
        # Reject workflow assignments rather than silently accepting an ignored field.
        if isinstance(data, dict) and "status" in data:
            raise serializers.ValidationError(
                {"status": ["Task status is managed by Torchbearer."]}
            )
        return super().to_internal_value(data)
