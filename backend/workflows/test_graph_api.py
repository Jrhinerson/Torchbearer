from copy import deepcopy

import pytest
from django.urls import reverse

from .models import WorkflowDefinition, WorkType

pytestmark = pytest.mark.usefixtures("catalogue")


def payload():
    workflow = WorkflowDefinition.objects.get(pk="plan-execute")
    graph = deepcopy(workflow.graph)
    graph["nodes"][2]["description"] = "Validate the reviewed change and retain evidence."
    return {"graph": graph, "revision": workflow.graph_revision}


def save(client, data, key="plan-execute"):
    token = client.get(reverse("csrf-token")).json()["csrfToken"]
    return client.patch(
        reverse("workflow-graph", kwargs={"key": key}),
        data,
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )


def test_save_updates_one_definition_and_compatibility_projection(client):
    assignments = list(WorkType.objects.values())
    original = WorkflowDefinition.objects.get(pk="plan-execute")
    data = payload()
    response = save(client, data)
    assert response.status_code == 200
    assert response.json()["graph"] == data["graph"]
    assert response.json()["revision"] == original.graph_revision + 1
    saved = WorkflowDefinition.objects.get(pk="plan-execute")
    assert saved.graph_updated_at > original.graph_updated_at
    assert saved.steps == original.steps  # Flat storage is only the unmapped fallback.
    summary = client.get(reverse("workflow-list")).json()[0]
    assert summary["steps"][2] == data["graph"]["nodes"][2]["description"]
    assert list(WorkType.objects.values()) == assignments
    assert WorkflowDefinition.objects.filter(graph__isnull=False).count() == 1


def test_stale_and_duplicate_saves_cannot_overwrite_the_current_graph(client):
    data = payload()
    assert save(client, data).status_code == 200
    data["graph"]["nodes"][0]["title"] = "Stale overwrite"
    assert save(client, data).status_code == 409
    current = client.get(reverse("workflow-graph", kwargs={"key": "plan-execute"})).json()
    assert current["revision"] == data["revision"] + 1
    assert current["graph"]["nodes"][0]["title"] == "Define scope"


@pytest.mark.parametrize("problem", ["cycle", "disconnected", "blank", "unknown-field"])
def test_invalid_graph_saves_return_paths_and_leave_all_data_unchanged(client, problem):
    before = list(WorkflowDefinition.objects.values())
    data = payload()
    graph = data["graph"]
    if problem == "cycle":
        graph["edges"].append(
            {"id": "back", "source": "accept", "target": "scope", "condition": "Repeat"}
        )
    elif problem == "disconnected":
        graph["edges"].pop()
    elif problem == "blank":
        graph["nodes"][0]["requirements"][0]["description"] = ""
    else:
        graph["nodes"][0]["script"] = "not executable"
    response = save(client, data)
    assert response.status_code == 400 and response.json()["errors"]["graph"]
    assert list(WorkflowDefinition.objects.values()) == before


@pytest.mark.parametrize(
    "data",
    [
        None,
        [],
        {},
        {"graph": None, "revision": 1},
        {"revision": 1},
        {"graph": {}, "revision": -1},
        {"graph": {}, "revision": True},
        {"graph": {}, "revision": "1"},
        {"graph": {}, "revision": 1, "name": "Overwrite"},
    ],
)
def test_invalid_update_contract_is_rejected(client, data):
    before = list(WorkflowDefinition.objects.values())
    assert save(client, data).status_code == 400
    assert list(WorkflowDefinition.objects.values()) == before


def test_only_authored_graphs_can_be_saved(client):
    assert save(client, payload(), key="missing").status_code == 404
    assert save(client, payload(), key="spec-driven").status_code == 409
    assert WorkflowDefinition.objects.get(pk="spec-driven").graph is None


@pytest.mark.parametrize("verification", ["missing", "wrong-token", "untrusted-origin"])
def test_graph_saves_require_csrf(client, verification):
    token = client.get(reverse("csrf-token")).json()["csrfToken"]
    headers = {"HTTP_X_CSRFTOKEN": "wrong" if verification == "wrong-token" else token}
    if verification == "missing":
        headers = {}
    if verification == "untrusted-origin":
        headers["HTTP_ORIGIN"] = "https://untrusted.example"
    response = client.patch(
        reverse("workflow-graph", kwargs={"key": "plan-execute"}),
        payload(),
        format="json",
        **headers,
    )
    assert response.status_code == 403
    assert WorkflowDefinition.objects.get(pk="plan-execute").graph_revision == 1
