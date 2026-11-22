from rest_framework import serializers

from .git import repository_path
from .models import AgentRun, Decision, Repository, Task


class RunSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentRun
        exclude = ["task"]


class DecisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Decision
        exclude = ["task"]


class ActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=["start", "approve", "retry", "revise", "send_back", "final_approve"]
    )
    revision = serializers.IntegerField(min_value=0)
    run_id = serializers.UUIDField(required=False)
    fingerprint = serializers.CharField(required=False, allow_blank=True, max_length=64)
    feedback = serializers.CharField(required=False, allow_blank=True, max_length=4000)


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
    latest_run = serializers.SerializerMethodField()

    def get_latest_run(self, obj):
        return obj.runs.values(
            "id", "stage", "agent", "state", "sequence", "error", "cancel_requested"
        ).first()

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "repository",
            "status",
            "revision",
            "completed_at",
            "latest_run",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "revision", "completed_at", "created_at", "updated_at"]

    def to_internal_value(self, data):
        # Reject workflow assignments rather than silently accepting an ignored field.
        if (
            isinstance(data, dict)
            and {"status", "revision", "completed_at", "latest_run"} & data.keys()
        ):
            raise serializers.ValidationError(
                {"status": ["Task status is managed by Torchbearer."]}
            )
        return super().to_internal_value(data)
