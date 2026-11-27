"""Frozen initial catalogue. Seeding only adds missing records, preserving assignments."""

from django.db import migrations

WORKFLOWS = [
    (
        "plan-execute",
        "Plan and execute",
        "A short plan and proportionate checks for straightforward, low-risk work.",
        [
            "Define scope and acceptance criteria",
            "Implement the change",
            "Validate the result",
            "Review and accept",
        ],
        ["Scope and acceptance checklist", "Completed change and validation evidence"],
        ["Run the checks appropriate to the affected behavior and environment"],
        ["Approve the brief plan", "Accept the reviewed result"],
    ),
    (
        "spec-driven",
        "Spec-driven development",
        "Carry an agreed specification through planning, implementation, and acceptance.",
        [
            "Specify behavior and acceptance criteria",
            "Resolve open questions",
            "Plan independently verifiable slices",
            "Implement and validate each slice",
            "Review against the specification",
        ],
        ["Approved specification and technical plan", "Implementation and acceptance evidence"],
        ["Verify acceptance criteria and edge cases", "Run agreed regression checks"],
        [
            "Approve the specification and plan",
            "Accept the implementation against the specification",
        ],
    ),
    (
        "test-driven",
        "Test-driven development",
        "Develop precise behavior through short test, implementation, and refactoring cycles.",
        [
            "Agree behavior examples and public test boundaries",
            "Write and run one meaningful failing test",
            "Implement enough to make it pass",
            "Refactor with tests passing",
            "Repeat and review",
        ],
        ["Behavior examples", "Implementation and meaningful automated tests"],
        [
            "Confirm the test fails for the intended reason before implementation",
            "Run final affected and regression checks",
        ],
        ["Agree behavior and test boundaries", "Accept the reviewed result"],
    ),
    (
        "diagnose-regression",
        "Diagnosis and regression testing",
        "Find the cause of a reproducible failure and prove the fix prevents recurrence.",
        [
            "Reproduce and minimize the symptom",
            "Investigate competing explanations",
            "Capture the failure in a regression test",
            "Implement the scoped fix",
            "Rerun the reproduction and affected checks",
        ],
        ["Reproduction and cause assessment", "Scoped fix, regression test, and evidence"],
        [
            "Show that the regression test detects the original failure",
            "Verify the original reproduction and related behavior",
        ],
        ["Review the diagnosis and fix scope", "Accept the verified fix"],
    ),
    (
        "behavior-preserving-refactor",
        "Behavior-preserving refactoring",
        "Improve internal structure while preserving observable behavior.",
        [
            "Establish a passing baseline",
            "Cover important existing behavior where needed",
            "Make small structural changes",
            "Verify behavior after each change",
            "Review the complete refactor",
        ],
        ["Behavior baseline", "Focused structural changes and test evidence"],
        [
            "Keep relevant tests passing",
            "Check public interfaces and observable behavior remain compatible",
        ],
        ["Agree refactoring scope", "Accept the behavior-preserving result"],
    ),
    (
        "design-validate",
        "Design and validate, then implement",
        "Resolve interaction and visual design questions before implementing the user experience.",
        [
            "Define the user journey",
            "Explore a mockup or prototype when needed",
            "Review the interaction",
            "Implement the design",
            "Validate the experience",
        ],
        ["Agreed user journey and design", "Implemented interaction and review evidence"],
        [
            "Check interactions, responsive layouts, and visual results",
            "Check keyboard access and relevant automated behavior tests",
        ],
        ["Approve the design", "Accept the implemented experience"],
    ),
    (
        "accessibility-remediation",
        "Standards-based remediation",
        "Remove accessibility barriers using applicable standards and human evaluation.",
        [
            "Identify requirements and affected journeys",
            "Reproduce accessibility barriers",
            "Implement targeted fixes",
            "Evaluate with automated and human checks",
            "Review remaining barriers",
        ],
        [
            "Barrier assessment and acceptance criteria",
            "Fixes and accessibility evaluation evidence",
        ],
        [
            "Run applicable automated accessibility checks",
            "Evaluate keyboard, assistive technology, and other relevant human interactions",
        ],
        ["Agree requirements and evaluation scope", "Accept the evaluated improvements"],
    ),
    (
        "contract-testing",
        "Specification and contract testing",
        "Agree interface behavior and verify compatibility and failure paths across integrations.",
        [
            "Specify requests, responses, and error behavior",
            "Assess authentication and compatibility",
            "Define contract tests",
            "Implement the integration",
            "Verify contracts and integration behavior",
        ],
        ["Interface contract and compatibility decisions", "Integration and verification evidence"],
        [
            "Test contracts, authentication, and failure paths",
            "Verify against a representative integration environment",
        ],
        ["Approve the interface contract", "Accept compatibility and integration evidence"],
    ),
    (
        "staged-migration",
        "Migration planning and staged execution",
        "Change schema or data with integrity checks and a rehearsed recovery strategy.",
        [
            "Assess existing data and compatibility",
            "Plan and rehearse migration and recovery",
            "Expand and backfill when coexistence is needed",
            "Switch consumers and verify integrity",
            "Retire old structures when safe",
        ],
        [
            "Migration, compatibility, and recovery plan",
            "Reviewed migration and data verification evidence",
        ],
        [
            "Rehearse on representative existing data",
            "Verify integrity, application compatibility, and recovery",
        ],
        [
            "Approve the migration and recovery plan",
            "Approve destructive retirement after verification",
        ],
    ),
    (
        "measure-optimize",
        "Measure, diagnose, optimize",
        "Use representative measurements to identify a bottleneck and verify improvement.",
        [
            "Set a measurable performance target",
            "Establish a representative baseline",
            "Profile and identify the bottleneck",
            "Optimize the measured cause",
            "Compare results and verify correctness",
        ],
        ["Target, workload, and baseline", "Optimization and comparable before/after evidence"],
        [
            "Repeat representative measurements under comparable conditions",
            "Run correctness and regression checks",
        ],
        ["Agree the target and measurement method", "Accept measured improvement and trade-offs"],
    ),
    (
        "security-focused",
        "Security-focused development",
        "Assess threats or a vulnerability, implement mitigations, and evaluate remaining risk.",
        [
            "Assess the vulnerability or model threats",
            "Define security requirements",
            "Plan mitigations",
            "Implement and verify defenses",
            "Review remaining risk",
        ],
        [
            "Threat or vulnerability assessment",
            "Mitigations, security evidence, and remaining risks",
        ],
        [
            "Verify relevant abuse cases and regression behavior",
            "Run appropriate security checks without exposing credentials",
        ],
        ["Approve mitigation scope", "Accept security review and remaining risk"],
    ),
    (
        "compatibility-upgrade",
        "Compatibility assessment and upgrade",
        "Upgrade dependencies or runtimes in manageable steps with compatibility evidence.",
        [
            "Review breaking changes and compatibility",
            "Establish a passing baseline",
            "Upgrade in manageable steps",
            "Adapt affected code and configuration",
            "Run compatibility and regression checks",
        ],
        [
            "Compatibility assessment and upgrade plan",
            "Updated dependencies and verification evidence",
        ],
        [
            "Verify affected integrations and supported environments",
            "Run regression and build checks",
        ],
        ["Approve the upgrade approach", "Accept compatibility evidence"],
    ),
    (
        "controlled-operational-change",
        "Controlled operational change",
        "Validate operational changes, prepare recovery, and observe a controlled rollout.",
        [
            "Assess impact and success criteria",
            "Plan rollout and recovery",
            "Validate in a representative environment",
            "Roll out gradually where appropriate",
            "Monitor and decide whether to continue or recover",
        ],
        ["Change, rollout, and recovery plan", "Environment validation and rollout observations"],
        [
            "Validate configuration and recovery procedures",
            "Monitor health and success criteria during rollout",
        ],
        ["Authorize the operational change", "Approve rollout continuation and final acceptance"],
    ),
    (
        "risk-based-testing",
        "Risk-based test development",
        "Prioritize meaningful uncovered behavior and prove that new tests detect failures.",
        [
            "Identify important uncovered behavior",
            "Prioritize risks and test boundaries",
            "Implement focused tests",
            "Verify tests detect meaningful failures",
            "Review reliability and maintenance cost",
        ],
        ["Risk and coverage assessment", "Reliable tests and failure-detection evidence"],
        [
            "Demonstrate meaningful failure detection",
            "Run tests repeatedly where flakiness is a concern",
        ],
        ["Agree priority risks", "Accept coverage and reliability evidence"],
    ),
    (
        "docs-as-code",
        "Docs as code",
        "Develop accurate documentation through repository review and automated checks.",
        [
            "Identify the audience and information gap",
            "Draft the documentation",
            "Verify examples, commands, and links",
            "Review accuracy and clarity",
            "Publish through the repository process",
        ],
        ["Reviewed documentation", "Verified examples and documentation checks"],
        [
            "Check examples, links, and applicable documentation builds",
            "Review technical accuracy and audience suitability",
        ],
        ["Agree documentation scope", "Approve the reviewed documentation"],
    ),
    (
        "timeboxed-discovery",
        "Timeboxed discovery",
        "Answer a question with evidence, a decision, and an optional disposable prototype.",
        [
            "State the question, timebox, and decision criteria",
            "Investigate sources or run scoped experiments",
            "Compare findings and alternatives",
            "Recommend proceed, clarify, or stop",
        ],
        ["Evidence and findings", "Decision recommendation and optional disposable prototype"],
        [
            "Check evidence against the stated question and decision criteria",
            "Record limitations and unresolved uncertainty",
        ],
        ["Agree the question and timebox", "Accept the findings and decide next steps"],
    ),
    (
        "design-proposal",
        "Design proposal and review",
        "Compare architectural options and record a reviewed decision before implementation.",
        [
            "Capture constraints and quality requirements",
            "Compare alternatives and trade-offs",
            "Document the decision and consequences",
            "Review the proposal",
            "Identify implementation slices",
        ],
        [
            "Reviewed design proposal or architectural decision",
            "Implementation breakdown and open risks",
        ],
        [
            "Assess alternatives against constraints and quality requirements",
            "Review compatibility, operational effects, and reversibility",
        ],
        ["Agree design criteria", "Approve the architectural decision"],
    ),
    (
        "incident-response",
        "Incident response",
        "Reduce impact, restore stability, and verify a durable correction with prevention work.",
        [
            "Assess impact and coordinate response",
            "Mitigate impact and stabilize",
            "Diagnose the cause",
            "Implement and verify a durable fix",
            "Record causes and prevention work",
        ],
        [
            "Incident timeline and mitigation evidence",
            "Verified correction and follow-up recommendations",
        ],
        [
            "Verify service recovery and monitor stability",
            "Reproduce and verify the durable correction where practical",
        ],
        [
            "Authorize operational mitigation as required",
            "Accept recovery and review prevention work",
        ],
    ),
]

WORK_TYPES = [
    (
        "maintenance",
        "Small change / routine maintenance",
        "Straightforward upkeep and small, low-risk changes.",
        "plan-execute",
    ),
    (
        "feature",
        "Feature / enhancement",
        "New capabilities or changes to existing product behavior.",
        "spec-driven",
    ),
    (
        "business-logic",
        "Business rules / complex application logic",
        "Precise rules, calculations, validation, and behavior with important edge cases.",
        "test-driven",
    ),
    (
        "bug",
        "Bug / regression",
        "Incorrect behavior or a previously working behavior that has broken.",
        "diagnose-regression",
    ),
    (
        "refactor",
        "Refactoring / code health",
        "Internal structural improvements that preserve observable behavior.",
        "behavior-preserving-refactor",
    ),
    (
        "ui-ux",
        "UI / UX change",
        "Changes to user journeys, interactions, layouts, and visual presentation.",
        "design-validate",
    ),
    (
        "accessibility",
        "Accessibility improvement",
        "Remove barriers for people with different abilities and assistive technologies.",
        "accessibility-remediation",
    ),
    (
        "api-integration",
        "API / external integration",
        "Interfaces and connections between services, clients, or external systems.",
        "contract-testing",
    ),
    (
        "data-migration",
        "Database schema / data migration",
        "Changes to stored structures, existing data, or how applications consume them.",
        "staged-migration",
    ),
    (
        "performance",
        "Performance / scalability",
        "Measurable improvements to latency, throughput, resource usage, or capacity.",
        "measure-optimize",
    ),
    (
        "security",
        "Security vulnerability / hardening",
        "Correction of vulnerabilities or strengthening of security controls.",
        "security-focused",
    ),
    (
        "dependency-upgrade",
        "Dependency / framework / runtime upgrade",
        "Updates to libraries, frameworks, runtimes, and their compatibility requirements.",
        "compatibility-upgrade",
    ),
    (
        "developer-tooling",
        "Build / CI / developer tooling",
        "Improvements to builds, checks, pipelines, and the development environment.",
        "plan-execute",
    ),
    (
        "operations",
        "Infrastructure / configuration / release",
        "Changes to operational environments, configuration, and release procedures.",
        "controlled-operational-change",
    ),
    (
        "testing",
        "Testing / QA improvement",
        "Additional or improved tests, coverage, reliability, and verification methods.",
        "risk-based-testing",
    ),
    (
        "documentation",
        "Documentation",
        "Guides, reference material, examples, and other technical documentation.",
        "docs-as-code",
    ),
    (
        "research",
        "Research / technical spike / prototype",
        "Timeboxed investigation or experimentation to resolve uncertainty.",
        "timeboxed-discovery",
    ),
    (
        "architecture",
        "Architecture / system design",
        "Architectural proposals, system boundaries, and consequential technical decisions.",
        "design-proposal",
    ),
    (
        "incident",
        "Production incident / emergency fix",
        "Urgent response to customer impact followed by a durable correction.",
        "incident-response",
    ),
]


def seed_catalogue(apps, schema_editor):
    workflow_model = apps.get_model("workflows", "WorkflowDefinition")
    work_type_model = apps.get_model("workflows", "WorkType")
    database = schema_editor.connection.alias
    fields = ["name", "description", "steps", "outputs", "validation", "approval_points"]
    for order, (key, *values) in enumerate(WORKFLOWS):
        workflow_model.objects.using(database).get_or_create(
            key=key, defaults={**dict(zip(fields, values, strict=True)), "display_order": order}
        )
    for order, (key, name, description, workflow) in enumerate(WORK_TYPES):
        work_type_model.objects.using(database).get_or_create(
            key=key,
            defaults={
                "name": name,
                "description": description,
                "display_order": order,
                "recommended_workflow_id": workflow,
                "assigned_workflow_id": workflow,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("workflows", "0001_initial")]

    operations = [migrations.RunPython(seed_catalogue, migrations.RunPython.noop)]
