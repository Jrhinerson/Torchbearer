"""Workflow definitions, independent of canvas internals and task execution."""

import json
import math
import re

MAX_GRAPH_BYTES = 256 * 1024
MAX_NODES = 100
MAX_EDGES = 300
ID_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$")


class GraphValidationError(ValueError):
    def __init__(self, errors):
        self.errors = errors
        super().__init__("The workflow graph is invalid.")


def ordered_nodes(graph):
    """Stable topological order, using document order for equally ready nodes."""
    nodes = {node["id"]: node for node in graph["nodes"]}
    indices = {key: index for index, key in enumerate(nodes)}
    incoming = dict.fromkeys(nodes, 0)
    outgoing = {key: [] for key in nodes}
    for edge in graph["edges"]:
        incoming[edge["target"]] += 1
        outgoing[edge["source"]].append(edge["target"])
    ready = [key for key in nodes if not incoming[key]]
    result = []
    while ready:
        ready.sort(key=indices.__getitem__)
        key = ready.pop(0)
        result.append(nodes[key])
        for target in outgoing[key]:
            incoming[target] -= 1
            if not incoming[target]:
                ready.append(target)
    return result


def validate_graph(graph):
    """Reject malformed or cyclic definitions with field paths usable by an editor."""
    errors = {}

    def fail(path, message):
        errors.setdefault(path, message)

    def fields(value, required, optional, path):
        if not isinstance(value, dict):
            fail(path, "Expected an object.")
            return False
        for key in required - value.keys():
            fail(f"{path}.{key}" if path else key, "This field is required.")
        for key in value.keys() - required - optional:
            fail(f"{path}.{key}" if path else key, "Unknown field.")
        return True

    def string(value, path, maximum=4000, allow_blank=False):
        if not isinstance(value, str) or len(value) > maximum:
            fail(path, f"Use text of at most {maximum} characters.")
        elif not allow_blank and not value.strip():
            fail(path, "Enter a description.")

    def identifier(value, path, seen=None):
        if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
            fail(path, "Use a stable ID of 1–80 letters, numbers, hyphens, or underscores.")
        elif seen is not None:
            if value in seen:
                fail(path, "IDs must be unique.")
            seen.add(value)

    def collection(value, path, maximum, minimum=0):
        if not isinstance(value, list) or not minimum <= len(value) <= maximum:
            fail(path, f"Use a list with {minimum}–{maximum} items.")
            return []
        return value

    try:
        encoded = json.dumps(graph, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, OverflowError, RecursionError) as error:
        raise GraphValidationError({"graph": "Use a finite JSON document."}) from error
    if len(encoded) > MAX_GRAPH_BYTES:
        raise GraphValidationError({"graph": "The graph must be at most 256 KiB."})
    if not fields(graph, {"schema_version", "entry_node_id", "nodes", "edges"}, set(), ""):
        raise GraphValidationError(errors)
    if type(graph.get("schema_version")) is not int or graph.get("schema_version") != 1:
        fail("schema_version", "Only graph schema version 1 is supported.")
    identifier(graph.get("entry_node_id"), "entry_node_id")
    nodes = collection(graph.get("nodes"), "nodes", MAX_NODES, 1)
    edges = collection(graph.get("edges"), "edges", MAX_EDGES)
    node_ids, edge_ids, requirement_ids = set(), set(), set()
    for index, node in enumerate(nodes):
        path = f"nodes.{index}"
        if not fields(
            node,
            {"id", "title", "description", "requirements", "outputs", "position"},
            {"iteration_note"},
            path,
        ):
            continue
        identifier(node.get("id"), f"{path}.id", node_ids)
        string(node.get("title"), f"{path}.title", 150)
        string(node.get("description"), f"{path}.description")
        string(node.get("iteration_note", ""), f"{path}.iteration_note", 2000, True)
        for output_index, output in enumerate(
            collection(node.get("outputs"), f"{path}.outputs", 30)
        ):
            string(output, f"{path}.outputs.{output_index}", 2000)
        position = node.get("position")
        if fields(position, {"x", "y"}, set(), f"{path}.position"):
            for axis in ("x", "y"):
                value = position.get(axis)
                if (
                    type(value) not in (int, float)
                    or abs(value) > 100000
                    or not math.isfinite(value)
                ):
                    fail(f"{path}.position.{axis}", "Use a finite number from -100000 to 100000.")
        for req_index, requirement in enumerate(
            collection(node.get("requirements"), f"{path}.requirements", 30, 1)
        ):
            req_path = f"{path}.requirements.{req_index}"
            if not fields(
                requirement,
                {"id", "description", "kind", "applicability"},
                {"applicability_note"},
                req_path,
            ):
                continue
            identifier(requirement.get("id"), f"{req_path}.id", requirement_ids)
            string(requirement.get("description"), f"{req_path}.description", 2000)
            if requirement.get("kind") not in ("requirement", "validation", "approval"):
                fail(f"{req_path}.kind", "Choose requirement, validation, or approval.")
            if requirement.get("applicability") not in ("always", "when_relevant"):
                fail(f"{req_path}.applicability", "Choose always or when_relevant.")
            string(
                requirement.get("applicability_note", ""),
                f"{req_path}.applicability_note",
                2000,
                requirement.get("applicability") != "when_relevant",
            )
    pairs = set()
    for index, edge in enumerate(edges):
        path = f"edges.{index}"
        if not fields(edge, {"id", "source", "target", "condition"}, set(), path):
            continue
        identifier(edge.get("id"), f"{path}.id", edge_ids)
        string(edge.get("condition"), f"{path}.condition", 160)
        for endpoint in ("source", "target"):
            value = edge.get(endpoint)
            if not isinstance(value, str) or value not in node_ids:
                fail(f"{path}.{endpoint}", "Choose an existing node.")
        source, target = edge.get("source"), edge.get("target")
        if isinstance(source, str) and isinstance(target, str):
            if source == target:
                fail(f"{path}.target", "A step cannot connect to itself.")
            if (source, target) in pairs:
                fail(f"{path}.target", "This connection already exists.")
            pairs.add((source, target))
    if errors:
        raise GraphValidationError(errors)
    entry = graph["entry_node_id"]
    if entry not in node_ids:
        fail("entry_node_id", "Choose an existing entry node.")
    incoming = {edge["target"] for edge in edges}
    if node_ids - incoming != {entry}:
        fail("entry_node_id", "The graph must have exactly one entry, with no incoming edges.")
    if len(ordered_nodes(graph)) != len(nodes):
        fail(
            "edges", "Connections must not form a cycle; describe repetition in an iteration note."
        )
    reached = set()
    pending = [entry]
    while pending:
        key = pending.pop()
        if key in reached:
            continue
        reached.add(key)
        pending.extend(edge["target"] for edge in edges if edge["source"] == key)
    if node_ids - reached:
        fail("nodes", "Every step must be reachable from the entry node.")
    if errors:
        raise GraphValidationError(errors)
    return graph


def graph_projection(graph):
    nodes = ordered_nodes(graph)

    def requirements(kind):
        values = []
        for node in nodes:
            for requirement in node["requirements"]:
                if requirement["kind"] != kind:
                    continue
                text = requirement["description"]
                if requirement["applicability"] == "when_relevant":
                    text += f" (When relevant: {requirement['applicability_note']})"
                values.append(text)
        return list(dict.fromkeys(values))

    return {
        "steps": [node["description"] for node in nodes],
        "outputs": list(dict.fromkeys(output for node in nodes for output in node["outputs"])),
        "validation": requirements("validation"),
        "approval_points": requirements("approval"),
    }
