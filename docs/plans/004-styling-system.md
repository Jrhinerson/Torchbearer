# T3-inspired styling system

Status: Implemented locally. The font, tokens, shared styling, and focused verification described below are complete; validation results are recorded at the end.

## Reference and findings

The reference is the user's running Windows T3 Code installation, inspected visually alongside its saved client settings and bundled CSS/theme definitions. The visible interface has a dark forest-green canvas, slightly lighter navigation and control surfaces, soft white text, muted green-gray labels, fine borders, compact controls, and restrained rounding. The bundled Grove dark palette is the concrete color reference for this direction; the environment theme API does not report the desktop's selected theme.

T3's bundled UI stack is `-apple-system, BlinkMacSystemFont, "Inter Variable", "Segoe UI", system-ui, sans-serif`. On Windows, its bundled Inter Variable is the first available family in that stack. The saved font-family overrides are empty, interface size is 16px, prompt size is 14px, code size is 13px, terminal size is 12px, font smoothing is enabled, and panel animation duration is zero. A 16px interface setting establishes the base scale; individual labels and controls use smaller text.

Torchbearer currently declares `Inter` in `frontend/src/app/styles.css`, but neither loads nor bundles it. Its actual font therefore depends on what is installed on the device. Colors, dimensions, font sizes, and weights are repeated throughout one stylesheet, with some labels as small as 9px. `frontend/index.html` also hardcodes the existing pale background as its browser theme color.

## Proposed commit sequence

Prerequisites outside this change: None. The current foundation already contains the five-column board and task dialog. Each implementation commit below depends on the preceding commit and should be committed locally for review.

### 1. `feat: establish self-hosted Inter typography`

- **Frontend:** Bundle licensed Inter Variable WOFF2 assets and their license, define font and typography tokens, and apply them to the shell, board, dialog, and form controls. Use consistent regular, medium, and semibold weights so text renders predictably without a network connection.
- **Backend:** No changes.
- **Database:** No changes.

### 2. `feat: add semantic Grove-inspired design tokens`

- **Frontend:** Introduce semantic color, spacing, radius, border, focus, and motion tokens with a dark default based on the local T3 reference and a companion light palette. Define a root theme attribute and synchronize native control appearance and browser theme color with the selected palette.
- **Backend:** No changes.
- **Database:** No changes.

### 3. `refactor: apply shared styling across the task workspace`

- **Frontend:** Migrate the header, board columns, cards, buttons, fields, dialog, and feedback states to the shared tokens and small reusable styling primitives. Tune spacing and visual hierarchy for T3's compact workspace feel while preserving readable task content and usable controls.
- **Backend:** No changes.
- **Database:** No changes.

### 4. `test: verify typography and theme behavior`

- **Frontend:** Extend the existing browser checks where needed to verify local font loading, theme integration, and layout at narrow widths and increased text size; exercise existing creation, deletion, and dialog flows under the new styles. Document token usage and complete visual, keyboard, contrast, formatting, lint, TypeScript, and production-build verification.
- **Backend:** Configure the isolated browser-test launcher with a dedicated API port and trusted frontend origin so checks can run beside the development app.
- **Database:** No changes.

## Typography specification

Use `"Inter Variable", "Segoe UI", system-ui, sans-serif` as Torchbearer's UI stack. Putting the bundled family first gives consistent typography across platforms. Load supported variable weights explicitly with `@font-face`, `font-display: swap`, and the existing `font-synthesis: none`; include normal and italic faces for the styles the application uses.

Keep monospace for technical content such as future branch names, paths, identifiers, and code: `ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace`. Task names, navigation, descriptions, and buttons use Inter.

| Role | Proposed size / line height | Weight | Application |
| --- | --- | --- | --- |
| Root | 16px | 400 | Basis for rem sizing and browser text scaling |
| Metadata | 12px / 18px | 400 or 500 | Dates, counts, optional labels, footer |
| Compact label | 13px / 18px | 500 or 600 | Column headings and compact status labels |
| UI and body | 14px / 21px | 400 or 500 | Controls, task descriptions, helper text |
| Task title | 14px / 21px | 600 | Card hierarchy without oversized headings |
| Brand | 16px / 24px | 600 | Compact Torchbearer wordmark |
| Dialog title | 18px / 24px | 600 | Clear modal hierarchy |
| Technical text | 13px / 20px | 400 | Future monospace content |

Express the scale in rem values. Keep mobile text inputs at least 16px, as the existing stylesheet does. Use normal tracking for body text and restrained negative tracking for larger headings; raise tiny uppercase labels to a readable size and reduce their wide tracking. Preserve browser text scaling and avoid fixed-height text containers.

## Token architecture

Keep the existing plain CSS approach, with separate responsibilities:

- `frontend/src/app/styles/fonts.css`: local font faces and font-family tokens, with assets and license under `frontend/src/assets/fonts/`.
- `frontend/src/app/styles/tokens.css`: typography scale, spacing, radii, motion, and semantic theme values.
- `frontend/src/app/styles/base.css`: reset, document defaults, native control inheritance, selection, focus, and reduced-motion behavior.
- `frontend/src/app/styles/components.css`: shared button, field, badge, surface, and feedback styles.
- `frontend/src/app/styles.css`: imports plus application shell, board, and dialog layouts.

Components consume roles such as `--color-canvas`, `--color-surface`, `--color-surface-raised`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-input-border`, `--color-primary`, `--color-primary-text`, `--color-focus`, and paired status foreground/background tokens. Raw palette values belong in token definitions. Add component-specific aliases only where a real component needs a distinct role.

Use a 4px-based spacing scale with 2px available for fine alignment. Start with 6px controls, 8px cards, and 12px dialogs; use 1px borders, minimal card shadows, and a stronger modal shadow. Use immediate panel changes and short color feedback transitions, with reduced-motion support.

## Color and theme direction

These rounded sRGB values come from the installed Grove dark palette and provide starting points. Validate each foreground/background pairing before finalizing it; decorative separators and essential control boundaries may require different contrast.

| Semantic role | Starting value | Purpose |
| --- | --- | --- |
| Canvas | `#1b2821` | Main workspace background |
| Subtle surface | `#21362b` | Column wells and navigation-like surfaces |
| Raised surface | `#36413c` | Task cards and input surfaces |
| Overlay surface | `#444d49` | Dialog and popover elevation |
| Main text | `#fffaff` | Primary content |
| Muted text | `#9da5a2` | Supporting content |
| Border | `#415f4f` | Fine separators; strengthen for essential boundaries as needed |
| Focus / positive accent | `#69d69a` | Keyboard focus and positive state emphasis |
| Selected surface | `#37664d` | Active or selected emphasis |
| Primary action | `#e3b34e` | Warm gold for the main action, reflecting Grove's action color |
| Primary action text | `#241523` | Dark foreground on gold |

Give success, warning, error, and informational states distinct text, icon, and surface treatments. Workflow stage names and counts remain the primary stage indicators; color supplements them.

Dark is the initial default to match the inspected app. Define the light palette through the same semantic roles under `data-theme="light"`; a future preference control can reuse it. Set `color-scheme` for the active palette and initialize the document theme before the first paint. Browser theme-color metadata follows the same source of truth. A theme-picker screen is outside this first styling pass.

## Application treatment

- Use a compact header, consistent Inter wordmark, and quiet local/device labels. Align the brand mark's letter with the sans-serif typography.
- Let the board occupy the workspace with 16-24px outer gutters, approximately 12px column gaps, and 12-16px internal padding. Maintain the five-stage order and horizontal scrolling on small screens.
- Give columns subtle green wells and cards a small tonal lift. Use spacing, text weight, and restrained borders to distinguish titles, descriptions, and dates.
- Consolidate primary, secondary, quiet, destructive, and icon button styles. Define hover, active, disabled, pending, and focus-visible treatments; preserve 44px touch targets while keeping the visual treatment compact.
- Apply the same surface, typography, field, error, and action rules to the task dialog. Keep long descriptions, validation messages, and pending labels readable without clipping.
- Keep loading, empty, connection-error, creation-error, and deletion-error states within the same visual system.

## Acceptance and verification

- Inter loads from the application origin in a clean browser without installed Inter or external font requests. Verify the actual loaded font face as well as the computed family, and confirm assets are present in the production build.
- The UI uses the documented size and weight roles, with readable metadata and no simulated font weights. Normal font failure still leaves usable fallback text.
- Text reaches at least 4.5:1 contrast for normal text and 3:1 for qualifying large text. Essential control boundaries and focus indicators reach 3:1 against adjacent colors; verify muted text and every interaction state in both palettes.
- Check the desktop board, the existing 390px mobile case, a 320px viewport, and 200% browser zoom. The board owns horizontal overflow; the dialog, actions, long titles, and validation content stay reachable.
- Verify keyboard access to the scroll region, visible focus, title-field autofocus, Escape/Cancel/close behavior, and restored focus. Existing creation, draft retention, error recovery, and persistent deletion checks continue to pass.
- Verify dark and light native controls, browser theme color, first paint, and reduced-motion behavior. Capture representative board, dialog, and error-state views for review during implementation.
- Run the frontend formatting, lint, TypeScript, build, and Playwright checks. Keep any added automated checks focused on font delivery, theme integration, and actual usability regressions.
- Record the final token conventions and validation results in the repository documentation. Implementation commits remain local for the user's review.

## Implementation and validation

- Vendored the normal/italic Latin and Latin Extended Inter Variable assets from the integrity-verified Fontsource 5.3.0 package, including its license and provenance.
- Implemented the documented stylesheet layers, semantic themes, shared primitives, and browser theme-color synchronization. A head stylesheet and root dark attribute provide the initial palette before JavaScript runs.
- Strengthened muted text and interactive boundaries from the reference palette. All 35 tested contrast pairings per theme meet their applicable 4.5:1 text or 3:1 boundary/focus thresholds.
- Browser verification passed all 16 tests, including the existing seven task-flow tests and nine styling checks. Reviewed captured desktop dark/light layouts, dialog/error states, narrow layouts, and zoom-equivalent reflow.
- Visual review identified a transient contrast dip when save buttons left the disabled state. Foreground and surface colors now change immediately, border feedback retains the short transition, and the nine styling checks passed again after this adjustment.
- `python scripts/check.py` passed all static, migration, API, and frontend checks, including 15 API tests, formatting/linting, TypeScript, and the production build. Frontend checks also passed after the final color-transition adjustment.
- The layout checks include 200% text sizing and a 640x450 CSS viewport equivalent to desktop 200% zoom reflow; they do not manipulate the native browser zoom setting.
- Browser tests now use ports 15173/18000 and their existing temporary database isolation. Their test-only origin is explicitly trusted by the isolated launcher.
- The developer conventions are documented in [the styling guide](../styling.md).
