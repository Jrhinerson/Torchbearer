# Operations finishing work

Base: `059de73`. No prerequisite commits outside this branch. Use the existing worktree environment.

Status: Implemented and locally verified, 2026-11-27.

## Ordered proposed commits

### 1. `feat: complete needs-you inspector actions`

- **Frontend:** Show state-specific recovery actions and actual blockers in the inspector, preserving source-attempt and revision guards. Keep messages in the existing conversation composer.
- **Backend:** Refine existing action descriptors for support stages and recovery states; keep action services authoritative.
- **Database:** **No changes.**

### 2. `test: add populated operations acceptance fixtures`

- **Frontend:** Exercise the real board with 40 deterministic mixed tasks and capture desktop and phone layouts.
- **Backend:** Add an isolated, read-only demo environment and deterministic fixture builder with execution disabled. Document how to launch it separately from normal data.
- **Database:** **No changes.**

### 3. `perf: avoid unchanged operations detail reloads`

- **Frontend:** Use stable detail tokens, retain current evidence across unchanged polls, and fetch large workspace previews only when requested or changed.
- **Backend:** Provide stable task/run tokens and conditional flow responses plus fingerprint-only workspace checks. Preserve external-edit detection and all approval protections.
- **Database:** **No changes.**

## Validation

Run focused recovery, demo isolation, token, and external-edit tests with each commit. Finish with the complete portable checks, restart-persistence check, and full Chromium suite on the final source. Check installed real CLI availability and perform disposable smoke tests where authentication and tool availability permit. Hosted Windows/Linux CI remains the user's push/PR workflow; do not push or open a PR.

## Verification record

- `python scripts/check.py`: passed all static checks, migration checks, **308 backend tests**, frontend formatting/linting, TypeScript, and production build.
- `npm run test:e2e`: **95 passed in one complete run** on the final application source, including inspector retry, retained drafts, conditional detail responses, lazy previews, and external-edit approval protection.
- `npm run test:e2e:demo`: **1 passed**, with 40 deterministic tasks, discovery artifacts, disabled mutations, and actual desktop/320px screenshots. Backend tests also verify worker refusal and preservation of existing data.
- `python scripts/check_persistence.py`: passed restart persistence with isolated data and fake agents.
- Real **Codex CLI 0.172.0**: planning contract passed; a disposable code change passed structured implementation evidence and an independent Python behavior assertion; read-only discovery passed its decision artifact contract with repository contents unchanged.
- Real Claude Code testing was unavailable because it is not installed. Pi was discoverable but failed its version preflight. Fake-agent adapter coverage remains green for all supported adapters.
- Hosted Windows/Linux CI has not run: this work remains local under the project's Git workflow instructions. The existing matrix now also runs the populated-demo acceptance check.

No new database migrations were required. Demo data is temporary and separate from normal application data. Flow caching preserves server-side revision and fingerprint validation at action time.
