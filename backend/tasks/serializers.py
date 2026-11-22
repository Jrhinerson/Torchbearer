from rest_framework import serializers

from .git import repository_path
from .models import Repository, Task


class RepositorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Repository
        fields = ["id", "name", "path"]
        read_only_fields = ["id", "name"]
        extra_kwargs = {"path": {"validators": []}}

    def validate_path(self, value):
        try:
            return repository_path(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error)) from error

    def create(self, validated_data):
        from pathlib import Path

        path = validated_data["path"]
        return Repository.objects.get_or_create(path=path, defaults={"name": Path(path).name})[0]


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ["id", "title", "description", "repository", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def to_internal_value(self, data):
        # Reject workflow assignments rather than silently accepting an ignored field.
        if isinstance(data, dict) and "status" in data:
            raise serializers.ValidationError(
                {"status": ["Task status is managed by Torchbearer."]}
            )
        return super().to_internal_value(data)
