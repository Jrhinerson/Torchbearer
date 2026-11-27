# Operations finishing work

Base: `059de73`. No prerequisite commits outside this branch. Use the existing worktree environment.

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
