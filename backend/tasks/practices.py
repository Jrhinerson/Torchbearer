"""Self-contained adaptations of Matt Pocock's skills for Torchbearer's stage boundaries.

Source: https://github.com/mattpocock/skills (MIT), consulted 2026-11-24.
These instructions travel with each run; no global skill installation or slash-command
support is required. Source links are attribution, not runtime dependencies.
"""

CATALOG = {
    "grill-with-docs": (
        "engineering",
        "Clarify the problem, desired outcome, acceptance criteria, and scope. Preserve the "
        "decisions and proposed domain documentation in the report; this stage cannot edit files.",
    ),
    "grilling": (
        "productivity",
        "Investigate repository facts yourself. Ask only material product or design decisions "
        "that cannot be inferred. Group independent questions into a short numbered round, each "
        "with a recommended answer and its trade-off. Report blocked with these questions when "
        "answers are needed; the human replies through feedback on the next run. Do not wait "
        "for interactive stdin or ask the user to repeat settled decisions. Scale depth to risk.",
    ),
    "triage": (
        "engineering",
        "For an incoming report or request only, check whether the behavior already exists, "
        "classify the request, identify missing reproduction details, and recommend scope. "
        "Do not change tracker labels, publish issues, or start implementation.",
    ),
    "to-spec": (
        "engineering",
        "Synthesize the known requirements into a specification with acceptance criteria, "
        "implementation decisions, testing decisions, and out-of-scope work. Follow repository "
        "planning conventions, including concrete paths when required. Return the spec in "
        "details rather than publishing issues or writing files. Block on unresolved decisions.",
    ),
    "domain-modeling": (
        "engineering",
        "Read existing glossary and architectural decisions. Challenge overloaded terms and "
        "test domain relationships with concrete edge cases. Propose glossary updates when "
        "terms change. Propose an ADR only for a real trade-off that is costly to reverse and "
        "would surprise future readers. Read-only stages report proposed edits; Integrate "
        "persists only approved documentation changes.",
    ),
    "codebase-design": (
        "engineering",
        "Concentrate behavior behind small, clear module interfaces. Prefer existing testable "
        "interfaces and keep implementation private. Avoid speculative abstractions, unnecessary "
        "layers, and unrelated refactoring. Assess interface contracts, error behavior, and "
        "where callers and tests observe the same real behavior.",
    ),
    "to-tickets": (
        "engineering",
        "When work needs decomposition, use complete, independently verifiable vertical slices "
        "with explicit dependencies. Prefer safe expand-migrate-contract steps for broad schema "
        "or interface changes. Keep the breakdown inside the repository's required commit-plan "
        "format; do not publish tickets or start parallel worktrees.",
    ),
    "implement": (
        "engineering",
        "Build the approved plan one slice at a time, honoring human feedback and review "
        "findings. Stop for changed scope or missing decisions. Write approved documentation "
        "alongside code. This adaptation ends with implementation and validation evidence: "
        "Code Review is a separate stage and Git commits remain prohibited.",
    ),
    "tdd": (
        "engineering",
        "For behavior changes, first run a meaningful failing test at a public interface agreed "
        "in Plan, implement enough to pass, then continue one vertical slice at a time. Expected "
        "values come from acceptance criteria or independent examples. Avoid tests of private "
        "methods, excessive internal mocks, tautologies, and batches of speculative tests. "
        "Use proportionate existing checks for low-impact changes. Run the agreed repository "
        "validation on the final files and report every command, actual outcome, and relevant "
        "output in tests. Missing dependencies are blocked; failing checks mean failed. Do not "
        "declare complete with missing or non-passing validation. Rerun affected checks "
        "after fixes.",
    ),
    "diagnosing-bugs": (
        "engineering",
        "When a failure needs investigation, establish a repeatable command that detects the "
        "specific symptom before proposing causes. Minimize the reproduction, compare falsifiable "
        "hypotheses, and change one variable at a time. Add regression coverage at the real "
        "behavior interface before fixing it, rerun the original reproduction and affected "
        "checks, and remove temporary instrumentation. Redact secrets from all evidence.",
    ),
    "code-review": (
        "engineering",
        "Independently review the entire task diff, including uncommitted and new files, "
        "against the approved plan. Keep Standards and Spec findings separate so success in "
        "one cannot mask failure in the other. Standards covers repository rules, module design, "
        "unnecessary complexity, and test quality; Spec covers missing, incorrect, or unrequested "
        "behavior, edge cases, compatibility, and migrations. Inspect whether validation actually "
        "exercises the promised behavior; passing commands alone do not prove completeness. "
        "Report severity, file/line, impact, and correction for actionable findings. Keep review "
        "read-only and route all fixes and new tests back to Integrate. End with a concise final "
        "approval brief: delivered behavior, how the human can try it, evidence, and "
        "remaining risks.",
    ),
    "handoff": (
        "productivity",
        "Make the report self-contained for a fresh agent: summarize decisions, delivered "
        "behavior, validation, unresolved risks, and relevant context pointers. Reference existing "
        "artifacts without copying their full text. The persisted stage report is the handoff; "
        "do not create extra handoff files. Never include credentials.",
    ),
    "research": (
        "engineering",
        "Only when a technical fact is uncertain, inspect available first-party documentation "
        "or source and cite the evidence in the report. Do not invent API behavior. If necessary "
        "sources are unavailable, report the gap rather than guessing.",
    ),
    "prototype": (
        "engineering",
        "If a design question needs runnable exploration or visual comparison, identify the "
        "specific question and recommend a separate prototype task before approving "
        "implementation. "
        "Do not build prototypes or change the workspace in read-only discovery or planning.",
    ),
    "retro": (
        "engineering",
        "Review the recorded task session, failures, human feedback, and review findings. "
        "Suggest environment improvements in severity order: navigation, automated checks, "
        "tooling, standards, and agent instructions. Prefer deterministic checks for mechanical "
        "mistakes and written standards for judgment calls. Propose follow-up tasks with evidence "
        "and expected benefit. Do not edit accepted code or instructions, reopen the task, "
        "publish issues, or automatically begin follow-up work.",
    ),
    "writing-for-agents": (
        "productivity",
        "When suggesting agent-instruction changes, favor concise, specific instructions and "
        "context pointers with clear triggers. Reuse existing documents. Keep always-loaded "
        "instructions small and avoid rules that merely repeat automated tooling.",
    ),
}

STAGE_SKILLS = {
    "refine": ["grill-with-docs", "grilling", "triage", "domain-modeling", "research", "handoff"],
    "plan": [
        "to-spec",
        "grilling",
        "domain-modeling",
        "codebase-design",
        "to-tickets",
        "research",
        "prototype",
        "handoff",
    ],
    "integrate": ["implement", "tdd", "codebase-design", "diagnosing-bugs", "handoff"],
    "code_review": ["code-review", "codebase-design", "handoff"],
    "retro": ["retro", "writing-for-agents", "handoff"],
}


def practices_for(stage):
    return [
        {
            "name": name,
            "source": f"https://github.com/mattpocock/skills/blob/main/skills/"
            f"{CATALOG[name][0]}/{name}/SKILL.md",
            "instructions": CATALOG[name][1],
        }
        for name in STAGE_SKILLS[stage]
    ]
