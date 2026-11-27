from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import WorkflowDefinition, WorkType
from .serializers import (
    AssignmentSerializer,
    WorkflowDefinitionSerializer,
    WorkflowGraphSerializer,
    WorkflowGraphUpdateSerializer,
    WorkTypeSerializer,
)


@method_decorator(csrf_protect, name="dispatch")
class LocalView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class WorkflowListView(LocalView):
    def get(self, request):
        return Response(
            WorkflowDefinitionSerializer(WorkflowDefinition.objects.all(), many=True).data
        )


class WorkflowGraphView(LocalView):
    def get(self, request, key):
        workflow = get_object_or_404(WorkflowDefinition, pk=key)
        return Response(WorkflowGraphSerializer(workflow).data)

    @transaction.atomic
    def patch(self, request, key):
        serializer = WorkflowGraphUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"detail": "Review the workflow graph before saving.", "errors": serializer.errors},
                status=400,
            )
        values = serializer.validated_data
        # The first database operation is a conditional write. Keeping the expected
        # revision in this UPDATE prevents a stale tab from winning a read/write race.
        changed = WorkflowDefinition.objects.filter(
            pk=key, graph_revision=values["revision"], graph__isnull=False
        ).update(
            graph=values["graph"],
            graph_revision=F("graph_revision") + 1,
            graph_updated_at=timezone.now(),
        )
        workflow = get_object_or_404(WorkflowDefinition, pk=key)
        if not changed:
            detail = (
                "This workflow changed elsewhere. Load the latest version to compare your draft."
                if workflow.graph is not None
                else "This workflow's map has not been authored yet."
            )
            return Response({"detail": detail}, status=409)
        return Response(WorkflowGraphSerializer(workflow).data)


class WorkTypeListView(LocalView):
    def get(self, request):
        return Response(WorkTypeSerializer(WorkType.objects.all(), many=True).data)


class WorkTypeDetailView(LocalView):
    def get(self, request, key):
        return Response(WorkTypeSerializer(get_object_or_404(WorkType, pk=key)).data)

    @transaction.atomic
    def patch(self, request, key):
        serializer = AssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        changed = WorkType.objects.filter(pk=key, revision=values["revision"]).update(
            assigned_workflow=values["assigned_workflow"],
            revision=F("revision") + 1,
            updated_at=timezone.now(),
        )
        work_type = get_object_or_404(WorkType, pk=key)
        if not changed:
            return Response(
                {"detail": "This assignment changed elsewhere. Reload it before saving again."},
                status=409,
            )
        return Response(WorkTypeSerializer(work_type).data)
