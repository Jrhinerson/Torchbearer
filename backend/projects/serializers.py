from django.db import IntegrityError, transaction
from rest_framework import serializers

from .models import Project
from .services import clone_repository, resolve_folder, validate_git_url


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ["id", "name", "path", "archived", "created_at", "updated_at"]
        read_only_fields = ["id", "path", "archived", "created_at", "updated_at"]


class AddProjectSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, required=False)
    path = serializers.CharField(max_length=4096)
    source = serializers.ChoiceField(choices=["local", "clone"], default="local")
    url = serializers.CharField(max_length=2048, required=False, write_only=True)

    def validate(self, data):
        if data["source"] == "clone":
            if not data.get("url"):
                raise serializers.ValidationError({"url": ["Enter the repository's clone URL."]})
            validate_git_url(data["url"])
        else:
            data["path"] = str(resolve_folder(data["path"]))
            if Project.objects.filter(path=data["path"], archived=False).exists():
                raise serializers.ValidationError(
                    {"path": ["This folder is already a saved project."]}
                )
        return data

    def create(self, validated_data):
        path = validated_data["path"]
        if validated_data["source"] == "clone":
            path = str(clone_repository(validated_data["url"], path))
        name = validated_data.get("name") or (resolve_folder(path).name or path)[:200]
        try:
            with transaction.atomic():
                project, created = Project.objects.get_or_create(
                    path=path, defaults={"name": name, "archived": False}
                )
                if not created:
                    if not project.archived:
                        raise serializers.ValidationError(
                            {"path": ["This folder is already a saved project."]}
                        )
                    project.name = name
                    project.archived = False
                    project.save(update_fields=["name", "archived", "updated_at"])
                return project
        except IntegrityError:
            raise serializers.ValidationError(
                {"path": ["This folder is already a saved project."]}
            ) from None
