from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .cli import agent_catalog
from .models import Repository, Task
from .routing import Approach
from .serializers import (
    ActionSerializer,
    DecisionSerializer,
    RepositorySerializer,
    RunSerializer,
    TaskSerializer,
    TaskSettingsSerializer,
)
from .worker import worker_status
from .workflow import Conflict, act, cancel, update_settings
from .workspaces import changes


@method_decorator(csrf_protect, name="dispatch")
class LocalView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class RoutingView(LocalView):
    def get(self, request):
        return Response(
            {
                **({"read_only": True} if settings.DEMO_MODE else {}),
                "agents": agent_catalog(),
                "approaches": [{"id": mode, "label": mode.label} for mode in Approach],
                "worker": worker_status(),
            }
        )


class OperationsView(LocalView):
    @transaction.atomic
    def get(self, request):
        from .operations import overview

        return Response(overview(request.query_params))


class ActivityView(LocalView):
    def get(self, request):
        from .activity import activity

        return Response(activity(request.query_params))


class TaskFlowView(LocalView):
    @transaction.atomic
    def get(self, request, pk):
        from .operations import flow

        return Response(flow(get_object_or_404(Task, pk=pk)))


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
    queryset = Task.objects.select_related("project")
    serializer_class = TaskSerializer


@method_decorator(csrf_protect, name="dispatch")
class TaskDeleteView(generics.RetrieveUpdateDestroyAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    queryset = Task.objects.all()
    serializer_class = TaskSerializer

    def patch(self, request, *args, **kwargs):
        serializer = TaskSettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        task = update_settings(kwargs["pk"], **serializer.validated_data)
        return Response(TaskSerializer(task).data)

    @transaction.atomic
    def perform_destroy(self, instance):
        Task.objects.filter(pk=instance.pk).update(revision=F("revision") + 1)
        instance.refresh_from_db()
        if instance.status != "backlog" or instance.runs.exists():
            raise Conflict(
                "Tasks with agent history retain their workspace and history. "
                "Cancel active runs instead."
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
            if settings.DEMO_MODE:
                from .demo import workspace_preview

                return Response(workspace_preview(task))
            return Response(changes(task))
        except (OSError, ValueError) as error:
            raise Conflict(str(error)) from error
