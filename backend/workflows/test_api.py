import pytest
from django.urls import reverse

from .models import WorkType

pytestmark = pytest.mark.usefixtures("catalogue")


def write(client, key, data, **headers):
    token = client.get(reverse("csrf-token")).json()["csrfToken"]
    return client.patch(
        reverse("work-type-detail", kwargs={"key": key}),
        data,
        format="json",
        HTTP_X_CSRFTOKEN=token,
        **headers,
    )


def test_lists_catalogue_and_assignment_details(client):
    workflows = client.get(reverse("workflow-list")).json()
    work_types = client.get(reverse("work-type-list")).json()
    assert len(workflows) == 15 and len(work_types) == 19
    assert workflows[0]["key"] == "plan-execute"
    assert workflows[0]["steps"] and workflows[0]["approval_points"]
    assert [item["key"] for item in work_types[:4]] == [
        "maintenance",
        "feature",
        "business-logic",
        "bug",
    ]
    bug = next(item for item in work_types if item["key"] == "bug")
    assert bug["assigned_workflow"] == bug["recommended_workflow"] == "diagnose-regression"
    assert client.get(reverse("work-type-detail", kwargs={"key": "bug"})).json() == bug
    for key, workflow in [
        ("documentation", "plan-execute"),
        ("api-integration", "spec-driven"),
        ("architecture", "timeboxed-discovery"),
    ]:
        work_type = next(item for item in work_types if item["key"] == key)
        assert work_type["assigned_workflow"] == work_type["recommended_workflow"] == workflow


def test_reassigns_and_restores_without_changing_other_types(client):
    response = write(client, "bug", {"assigned_workflow": "test-driven", "revision": 0})
    assert response.status_code == 200
    saved = response.json()
    assert saved["assigned_workflow"] == "test-driven" and saved["revision"] == 1
    assert saved["recommended_workflow"] == "diagnose-regression"
    assert WorkType.objects.get(key="feature").assigned_workflow_id == "spec-driven"
    response = write(client, "bug", {"assigned_workflow": "diagnose-regression", "revision": 1})
    assert response.status_code == 200 and response.json()["revision"] == 2
    assert response.json()["assigned_workflow"] == "diagnose-regression"


def test_every_type_and_workflow_can_be_reassigned(client):
    for work_type in WorkType.objects.all():
        response = write(
            client,
            work_type.key,
            {"assigned_workflow": "test-driven", "revision": work_type.revision},
        )
        assert response.status_code == 200
    for workflow in client.get(reverse("workflow-list")).json():
        work_type = WorkType.objects.get(key="maintenance")
        response = write(
            client,
            work_type.key,
            {"assigned_workflow": workflow["key"], "revision": work_type.revision},
        )
        assert response.status_code == 200


def test_stale_save_does_not_overwrite_another_assignment(client):
    assert (
        write(client, "bug", {"assigned_workflow": "spec-driven", "revision": 0}).status_code == 200
    )
    response = write(client, "bug", {"assigned_workflow": "test-driven", "revision": 0})
    assert response.status_code == 409
    saved = WorkType.objects.get(key="bug")
    assert saved.assigned_workflow_id == "spec-driven" and saved.revision == 1


def test_consolidated_assignments_reject_a_save_from_before_migration(client):
    saved = WorkType.objects.get(key="documentation")
    response = write(
        client,
        saved.key,
        {"assigned_workflow": "test-driven", "revision": saved.revision - 1},
    )
    assert response.status_code == 409
    saved.refresh_from_db()
    assert saved.assigned_workflow_id == "plan-execute"


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"assigned_workflow": "missing", "revision": 0},
        {"assigned_workflow": "docs-as-code", "revision": 0},
        {"assigned_workflow": "contract-testing", "revision": 0},
        {"assigned_workflow": "design-proposal", "revision": 0},
        {"assigned_workflow": None, "revision": 0},
        {"assigned_workflow": "test-driven", "revision": -1},
        {"assigned_workflow": "test-driven"},
        {"assigned_workflow": "test-driven", "revision": 0, "name": "Overwrite"},
        {"assigned_workflow": "test-driven", "revision": 0, "recommended_workflow": "test-driven"},
        [],
    ],
)
def test_invalid_assignments_leave_data_unchanged(client, data):
    assert write(client, "bug", data).status_code == 400
    assert WorkType.objects.get(key="bug").revision == 0
    assert WorkType.objects.get(key="bug").assigned_workflow_id == "diagnose-regression"


def test_missing_work_type_returns_not_found(client):
    assert (
        write(client, "missing", {"assigned_workflow": "test-driven", "revision": 0}).status_code
        == 404
    )


@pytest.mark.parametrize("verification", ["missing", "wrong-token", "untrusted-origin"])
def test_assignments_require_csrf(client, verification):
    token = client.get(reverse("csrf-token")).json()["csrfToken"]
    headers = {"HTTP_X_CSRFTOKEN": "wrong" if verification == "wrong-token" else token}
    if verification == "missing":
        headers = {}
    if verification == "untrusted-origin":
        headers["HTTP_ORIGIN"] = "https://untrusted.example"
    response = client.patch(
        reverse("work-type-detail", kwargs={"key": "bug"}),
        {"assigned_workflow": "test-driven", "revision": 0},
        format="json",
        **headers,
    )
    assert response.status_code == 403
    assert WorkType.objects.get(key="bug").revision == 0


@pytest.mark.parametrize("method", ["post", "put", "delete"])
def test_catalogue_definitions_are_read_only(client, method):
    token = client.get(reverse("csrf-token")).json()["csrfToken"]
    for url in [
        reverse("workflow-list"),
        reverse("work-type-list"),
        reverse("work-type-detail", kwargs={"key": "bug"}),
    ]:
        assert (
            getattr(client, method)(url, {}, format="json", HTTP_X_CSRFTOKEN=token).status_code
            == 405
        )
