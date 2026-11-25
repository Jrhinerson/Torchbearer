# Engineering practices

Torchbearer embeds adapted practices from [Matt Pocock's skills](https://github.com/mattpocock/skills)
(MIT), consulted November 24, 2026. The self-contained instructions live in
`backend/tasks/practices.py` and are recorded in each run's input context. They work with every
supported agent without installing global skills, fetching mutable upstream prompts at runtime,
or requiring slash commands. Repository instructions and Torchbearer permissions take precedence.

| Column | Practices | Result |
| --- | --- | --- |
| Backlog | Optional grill-with-docs, grilling, domain-modeling, and triage for incoming requests | Clear intent, decisions, scope, or a short round of questions with recommendations |
| Plan | to-spec, domain-modeling, codebase-design, and to-tickets for larger work | A repository-format plan with acceptance criteria, interfaces, migrations, and agreed validation |
| Integrate | implement, tdd, codebase-design, diagnosing-bugs when needed | Implementation, meaningful behavior tests, and passing validation commands |
| Code Review | code-review and codebase-design | Separate Standards and Spec findings, evidence assessment, and a final approval brief |
| Final Approval | Human decision, with optional retro afterward | Accepted behavior and suggested environment improvements as separate follow-up work |

Every agent report is a durable handoff. Required artifacts travel in full even after many
retries; pointers identify prior reports and source files. Research is conditional on uncertain
technical facts and uses primary sources. A design needing a runnable prototype is surfaced as
a separate exploration task; read-only planning cannot build it.

Planning proposes glossary and ADR edits inside its report. Integrate writes only approved
documentation changes. TDD applies to meaningful behavior changes at agreed public interfaces;
low-impact edits use proportionate existing checks. Integrate cannot complete or receive approval
without passing reported validation commands. Code Review checks evidence against the approved
implementation snapshot and evaluates whether tests actually cover requirements. Review never
fixes code: rework returns to Integrate for fixes, renewed validation, and another review.

The upstream implement skill's automatic commit and internal code-review steps are deliberately
replaced by Torchbearer's separate review column and human-controlled Git workflow. Upstream
interviews become report-and-feedback rounds because CLI runs are non-interactive. Source links
in run context provide attribution; they do not grant permissions or trigger external workflows.

## Optional refinement and retrospective actions

Refine task starts a read-only run in Backlog. Because it starts agent work, it creates the isolated workspace and fixes repository/routing choices; the task retains history and is no longer deletable. Questions and recommended answers appear in its report. Send answers for another round; each report retains all settled decisions. A successful, current refinement can start Plan, which receives the full refinement report. Refinement can be cancelled and explicitly rerun.

Run retrospective is available after final approval for tasks with an accepted Code Review. It uses the approved plan, implementation, accepted review, all recorded stage reports, and human decisions. It preserves completion, edits no workspace files, and suggests follow-ups without creating them. Later commits or workspace edits do not invalidate the historical retrospective; the accepted reports remain its source of truth and the current workspace is still protected against edits during the run. Tasks predating Code Review keep their history but cannot run a retrospective without accepted review evidence.
