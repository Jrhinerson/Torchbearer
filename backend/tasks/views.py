from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import generics, serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .cli import agent_catalog
from .models import ColumnAssignment, Repository, Task
from .serializers import (
    ActionSerializer,
    DecisionSerializer,
    RepositorySerializer,
    RunSerializer,
    TaskSerializer,
)
from .worker import worker_status
from .workflow import Conflict, act, cancel
from .workspaces import changes


@method_decorator(csrf_protect, name="dispatch")
class LocalView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class RoutingView(LocalView):
    def get(self, request):
        assignments = dict(ColumnAssignment.objects.values_list("stage", "agent"))
        return Response(
            {
                "agents": agent_catalog(),
                "assignments": {
                    stage: assignments.get(stage, "") for stage in ColumnAssignment.Stage
                },
                "worker": worker_status(),
            }
        )


class AssignmentView(LocalView):
    def patch(self, request, stage):
        if stage not in ColumnAssignment.Stage.values:
            raise serializers.ValidationError("Only Plan, Integrate, and Test can run agents.")
        agent = request.data.get("agent")
        if agent not in ["", *ColumnAssignment.Agent.values]:
            raise serializers.ValidationError("Choose a supported agent or Unassigned.")
        ColumnAssignment.objects.update_or_create(stage=stage, defaults={"agent": agent})
        return Response({"stage": stage, "agent": agent})


@method_decorator(csrf_protect, name="dispatch")
class RepositoryListView(generics.ListCreateAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    queryset = Repository.objects.all()
    serializer_class = RepositorySerializer


@method_decorator(csrf_protect, name="dispatch")
class TaskListCreateView(generics.ListCreateAPIView):
    """Local task inbox. CSRF applies even when there is no authenticated user."""

    authentication_classes = []
    permission_classes = [AllowAny]
    queryset = Task.objects.all()
    serializer_class = TaskSerializer


@method_decorator(csrf_protect, name="dispatch")
class TaskDeleteView(generics.RetrieveUpdateDestroyAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    queryset = Task.objects.all()
    serializer_class = TaskSerializer

    def patch(self, request, *args, **kwargs):
        if set(request.data) != {"repository"} or self.get_object().status != Task.Status.BACKLOG:
            raise serializers.ValidationError("Only a backlog task's repository can be changed.")
        return self.partial_update(request, *args, **kwargs)

    @transaction.atomic
    def perform_update(self, serializer):
        if not Task.objects.filter(pk=serializer.instance.pk, status="backlog").update(
            repository=serializer.validated_data["repository"], revision=F("revision") + 1
        ):
            raise Conflict("A task's repository cannot change after planning starts.")
        serializer.instance.refresh_from_db()

    @transaction.atomic
    def perform_destroy(self, instance):
        Task.objects.filter(pk=instance.pk).update(revision=F("revision") + 1)
        instance.refresh_from_db()
        if instance.status != "backlog":
            raise Conflict(
                "Started tasks retain their workspace and history. Cancel active runs instead."
            )
        instance.delete()

    def put(self, request, *args, **kwargs):
        return Response(status=405)


class TaskActionView(LocalView):
    def post(self, request, pk):
        serializer = ActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = act(pk, **serializer.validated_data)
        return Response(TaskSerializer(task).data)


class TaskRunsView(LocalView):
    def get(self, request, pk):
        task = get_object_or_404(Task, pk=pk)
        return Response(
            {
                "runs": RunSerializer(task.runs.all(), many=True).data,
                "decisions": DecisionSerializer(task.decisions.all(), many=True).data,
            }
        )


class CancelRunView(LocalView):
    def post(self, request, pk, run_id):
        return Response(TaskSerializer(cancel(pk, run_id)).data)


class WorkspaceView(LocalView):
    def get(self, request, pk):
        task = get_object_or_404(Task, pk=pk)
        try:
            return Response(changes(task))
        except (OSError, ValueError) as error:
            raise Conflict(str(error)) from error
