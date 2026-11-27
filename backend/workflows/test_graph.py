from copy import deepcopy

import pytest
from django.urls import reverse

from .graph import GraphValidationError, graph_projection, ordered_nodes, validate_graph
from .models import WorkflowDefinition


def step(key):
    return {
        "id": key,
        "title": key.title(),
        "description": f"Complete {key}.",
        "requirements": [
            {
                "id": f"{key}-requirement",
                "description": f"Verify {key}.",
                "kind": "validation",
                "applicability": "always",
            }
        ],
        "outputs": [f"{key} evidence"],
        "position": {"x": 0, "y": 0},
    }


def edge(source, target):
    return {
        "id": f"{source}-{target}",
        "source": source,
        "target": target,
        "condition": f"{source} ready",
    }


@pytest.fixture
def example_graph():
    return {
        "schema_version": 1,
        "entry_node_id": "start",
        "nodes": [step("start"), step("finish")],
        "edges": [edge("start", "finish")],
    }


def test_linear_and_fork_join_graphs_have_stable_topological_order(example_graph):
    assert validate_graph(example_graph) == example_graph
    graph = {
        **example_graph,
        "nodes": [step("finish"), step("start"), step("right"), step("left")],
        "edges": [
            edge("start", "left"),
            edge("start", "right"),
            edge("left", "finish"),
            edge("right", "finish"),
        ],
    }
    validate_graph(graph)
    assert [node["id"] for node in ordered_nodes(graph)] == ["start", "right", "left", "finish"]
    assert validate_graph({**graph, "nodes": [step("start")], "edges": []})


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("schema_version",), True),
        (("schema_version",), 2),
        (("entry_node_id",), "missing"),
        (("entry_node_id",), "finish"),
        (("nodes",), []),
        (("nodes",), [None]),
        (("nodes", 0, "title"), " "),
        (("nodes", 0, "description"), 123),
        (("nodes", 0, "unknown"), "value"),
        (("nodes", 0, "outputs"), [""]),
        (("nodes", 0, "position", "x"), True),
        (("nodes", 0, "position", "x"), "10"),
        (("nodes", 0, "position", "x"), float("inf")),
        (("nodes", 0, "position", "x"), 10**400),
        (("nodes", 0, "requirements"), []),
        (("nodes", 0, "requirements", 0, "description"), ""),
        (("nodes", 0, "requirements", 0, "kind"), "execution"),
        (("nodes", 0, "requirements", 0, "applicability"), "sometimes"),
        (("nodes", 0, "requirements", 0, "applicability"), "when_relevant"),
        (("nodes", 1, "id"), "start"),
        (("nodes", 1, "requirements", 0, "id"), "start-requirement"),
        (("edges", 0, "target"), "missing"),
        (("edges", 0, "target"), "start"),
        (("edges", 0, "condition"), ""),
    ],
)
def test_invalid_documents_report_paths(example_graph, path, value):
    target = example_graph
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(GraphValidationError) as cause:
        validate_graph(example_graph)
    assert cause.value.errors
    assert all(isinstance(key, str) for key in cause.value.errors)


@pytest.mark.parametrize("problem", ["cycle", "disconnected-cycle", "isolated", "duplicate"])
def test_invalid_connections_are_rejected(example_graph, problem):
    if problem == "cycle":
        example_graph["edges"].append(edge("finish", "start"))
    elif problem == "disconnected-cycle":
        example_graph["nodes"].extend([step("other"), step("another")])
        example_graph["edges"].extend([edge("other", "another"), edge("another", "other")])
    elif problem == "isolated":
        example_graph["nodes"].append(step("other"))
    else:
        example_graph["edges"].append({**example_graph["edges"][0], "id": "duplicate"})
    with pytest.raises(GraphValidationError):
        validate_graph(example_graph)


@pytest.mark.parametrize("document", [None, [], {}, {"nodes": []}, {"nodes": "x" * 270000}])
def test_incomplete_or_oversize_input_is_rejected(document):
    with pytest.raises(GraphValidationError):
        validate_graph(document)


def test_projection_preserves_applicability_and_deduplicates_outputs(example_graph):
    example_graph["nodes"][0]["requirements"][0].update(
        applicability="when_relevant", applicability_note="For documentation changes."
    )
    example_graph["nodes"][1]["requirements"][0]["kind"] = "approval"
    example_graph["nodes"][1]["outputs"] = ["start evidence"]
    before = deepcopy(example_graph)
    projection = graph_projection(validate_graph(example_graph))
    assert projection["steps"] == ["Complete start.", "Complete finish."]
    assert projection["outputs"] == ["start evidence"]
    assert "When relevant: For documentation changes." in projection["validation"][0]
    assert projection["approval_points"] == ["Verify finish."]
    assert example_graph == before


def test_graph_detail_and_list_projections(client, catalogue, example_graph):
    workflow = WorkflowDefinition.objects.get(pk="plan-execute")
    workflow.graph = example_graph
    workflow.graph_revision = 4
    workflow.save()
    detail = client.get(reverse("workflow-graph", kwargs={"key": workflow.key})).json()
    assert detail["graph"] == example_graph and detail["revision"] == 4
    summary = client.get(reverse("workflow-list")).json()[0]
    assert summary["has_graph"] and summary["steps"] == ["Complete start.", "Complete finish."]
    assert "graph" not in summary
    assert client.get(reverse("workflow-graph", kwargs={"key": "missing"})).status_code == 404
    unmapped = client.get(reverse("workflow-graph", kwargs={"key": "spec-driven"})).json()
    assert unmapped["graph"] is None and unmapped["revision"] == 0
