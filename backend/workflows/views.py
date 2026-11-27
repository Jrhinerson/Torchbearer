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
from .serializers import AssignmentSerializer, WorkflowDefinitionSerializer, WorkTypeSerializer


@method_decorator(csrf_protect, name="dispatch")
class LocalView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class WorkflowListView(LocalView):
    def get(self, request):
        return Response(
            WorkflowDefinitionSerializer(WorkflowDefinition.objects.all(), many=True).data
        )


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
