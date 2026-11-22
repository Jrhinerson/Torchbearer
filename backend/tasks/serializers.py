from projects.models import Project
from projects.serializers import ProjectSerializer
from rest_framework import serializers

from .git import repository_path
from .models import AgentRun, Decision, Repository, Task
from .routing import (
    FRONTIER_AGENTS,
    NEXT_STAGE,
    Agent,
    Approach,
    Stage,
    agent_for,
    validate_routing,
)


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
        choices=[
            "start",
            "plan_message",
            "approve",
            "retry",
            "revise",
            "send_back",
            "final_approve",
        ]
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
    project = ProjectSerializer(read_only=True)
    project_id = serializers.PrimaryKeyRelatedField(
        source="project",
        queryset=Project.objects.filter(archived=False),
        required=False,
        allow_null=True,
        write_only=True,
    )
    latest_run = serializers.SerializerMethodField()
    stage_agents = serializers.SerializerMethodField()
    next_stage = serializers.SerializerMethodField()

    def get_next_stage(self, obj):
        return NEXT_STAGE.get(obj.status)

    def get_stage_agents(self, obj):
        if obj.routing_mode is None:
            return {}
        return {stage: agent_for(obj, stage) for stage in Stage}

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
            "project",
            "project_id",
            "repository",
            "routing_mode",
            "frontier_agent",
            "stage_agents",
            "next_stage",
            "status",
            "revision",
            "completed_at",
            "latest_run",
            "created_at",
            "updated_at",
            "workspace_path",
            "branch",
            "base_commit",
        ]
        read_only_fields = [
            "id",
            "status",
            "revision",
            "completed_at",
            "created_at",
            "updated_at",
            "workspace_path",
            "branch",
            "base_commit",
        ]
        extra_kwargs = {"frontier_agent": {"required": False}}

    def validate(self, data):
        mode = data.get("routing_mode", Approach.FRONTIER)
        frontier = data.get("frontier_agent", None if mode == Approach.LOCAL else Agent.CODEX)
        try:
            validate_routing(mode, frontier)
        except ValueError as error:
            raise serializers.ValidationError({"routing_mode": str(error)}) from error
        data.update(routing_mode=mode, frontier_agent=frontier)
        project = data.get("project")
        if project and "repository" not in data:
            try:
                path = repository_path(project.path)
            except ValueError:
                # Ordinary folders are valid projects; execution still needs a Git repository.
                data["repository"] = None
            else:
                data["repository"] = Repository.objects.get_or_create(
                    path=path, defaults={"name": project.name}
                )[0]
        elif "repository" in data:
            repository = data["repository"]
            if project and (not repository or repository.path != project.path):
                raise serializers.ValidationError(
                    {"repository": ["The repository must match the selected project's folder."]}
                )
            if "project" not in data:
                data["project"] = (
                    Project.objects.filter(path=repository.path, archived=False).first()
                    if repository
                    else None
                )
        return data

    def to_internal_value(self, data):
        # Reject workflow assignments rather than silently accepting an ignored field.
        if (
            isinstance(data, dict)
            and {
                "status",
                "revision",
                "completed_at",
                "latest_run",
                "workspace_path",
                "branch",
                "base_commit",
                "stage_agents",
                "next_stage",
            }
            & data.keys()
        ):
            raise serializers.ValidationError(
                {"status": ["Task status is managed by Torchbearer."]}
            )
        return super().to_internal_value(data)


class TaskSettingsSerializer(serializers.Serializer):
    revision = serializers.IntegerField(min_value=0)
    repository = serializers.PrimaryKeyRelatedField(
        queryset=Repository.objects.all(), required=False, allow_null=True
    )
    routing_mode = serializers.ChoiceField(choices=Approach.choices, required=False)
    frontier_agent = serializers.ChoiceField(
        choices=FRONTIER_AGENTS, required=False, allow_null=True
    )

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            return super().to_internal_value(data)
        if set(data) - self.fields.keys() or not (set(data) - {"revision"}):
            raise serializers.ValidationError(
                "Choose repository or task routing settings to update."
            )
        return super().to_internal_value(data)
