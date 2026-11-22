# Styling system

Torchbearer's styling follows the compact typography and green surfaces of the
local T3 Code reference. Inter Variable is served with the application, the default
palette is dark, and gold identifies primary actions.

## Stylesheet responsibilities

The document loads `frontend/src/app/styles.css` as a stylesheet in its head. Vite
processes its imports and font URLs for development and production, allowing the
dark canvas and native control appearance to render before JavaScript runs.

| File under `frontend/src/app/` | Responsibility |
| --- | --- |
| `styles/fonts.css` | Local normal/italic Latin and Latin Extended font faces; UI and monospace families |
| `styles/tokens.css` | Typography, spacing, radii, motion, and dark/light semantic palettes |
| `styles/base.css` | Document defaults, control inheritance, selection, and keyboard focus |
| `styles/components.css` | Shared buttons, fields, labels, badges, surfaces, and feedback |
| `styles.css` | Imports and shell, board, card, and dialog layout |
| `theme.ts` | Browser theme-color synchronization with the root palette |

Add raw color values to the palette definitions. Components should consume a
semantic role, such as `--color-text-muted`, rather than choosing a green or gray
directly. Keep feature layout in the application stylesheet and reusable control
behavior in the component stylesheet.

## Typography and sizing

The UI stack is `"Inter Variable", "Segoe UI", system-ui, sans-serif`. Technical
text uses the system monospace stack. Bundled Inter assets support weights 100-900;
the interface uses regular (400), medium (500), and semibold (600). Font synthesis
is disabled. Font subsets and italics load on demand with `font-display: swap`.
Asset provenance and the SIL Open Font License are under
[`frontend/src/assets/fonts/`](../frontend/src/assets/fonts/README.md).

| Token | Default size | Use |
| --- | --- | --- |
| `--text-meta` | 12px | Dates, counts, optional labels, and footer |
| `--text-compact` | 13px | Column headings, state messages, and technical text |
| `--text-body` | 14px | Task content, buttons, fields, and form labels |
| `--text-brand` | 16px | Wordmark and mobile field text |
| `--text-title` | 18px | Dialog title |
| `--text-icon` | 24px | Icon control glyphs |

Sizes use rem units with a 100% root size so browser text preferences apply. Use
`--space-*` for the 4px-based spacing scale, including the 2px `--space-0-5`
adjustment. Control, card, and dialog radii are 6px, 8px, and 12px respectively.
Controls have at least a 44px target at the default root size and grow with text.
Mobile fields use at least 16px text. Avoid fixed heights for text-bearing blocks.

## Palettes and themes

`frontend/index.html` declares `data-theme="dark"` on the root element for first
paint. Setting it to `light` selects the companion palette. Both use the same roles:

- Canvas, surface, raised surface, and overlay surface establish visual depth.
- Main and muted text distinguish content hierarchy; the muted dark color was
  lightened from the reference to meet contrast requirements on elevated surfaces.
- Decorative borders and input borders have separate tokens. Input borders and
  focus indicators meet a 3:1 contrast target against the relevant surfaces.
- Primary, hover, active, and primary-text roles form the gold action treatment.
- Success, warning, error, and information each have foreground and surface roles.

`initializeTheme()` runs before mounting React. It reads `--color-canvas` for the
browser theme-color metadata and observes changes to `data-theme`. CSS controls
`color-scheme`, including native fields and scrollbars. A future theme preference
control can set the root attribute; the current application defaults to dark and
does not persist a theme preference.

Use normal, hover, active, focus, disabled, and pending states when adding controls.
Border feedback transitions are 120ms and become zero under
`prefers-reduced-motion`. Text and surface colors change together immediately to
preserve contrast across pending and disabled states. Pending buttons expose `aria-busy`.

## Shared primitives

Apply the base class together with the appropriate variant and any layout class:

```tsx
<button className="button button-primary" aria-busy={saving} disabled={saving}>
  {saving ? 'Saving…' : 'Save'}
</button>
<button className="button button-secondary">Cancel</button>
<button className="button button-destructive">Delete</button>
<button className="button button-quiet button-icon" aria-label="Close">×</button>
<button className="button button-link">Try again</button>

<label className="field-label" htmlFor="name">Name</label>
<input className="field" id="name" />
<span className="badge">Local</span>
<article className="surface surface-raised">Task content</article>
<dialog className="surface surface-overlay">Dialog content</dialog>
<p className="feedback feedback-error" role="alert">Could not save the task.</p>
```

The additional feedback variants are `feedback-success`, `feedback-warning`, and
`feedback-info`. Supply meaningful text and semantics for the situation. Workflow
stage names accompany the colored stage dots.

## Verification

Run `python scripts/check.py` from the repository root and `npm run test:e2e` from
`frontend/` (use `npm.cmd` in PowerShell). Browser tests use frontend port 15173 and API port 18000
with their own temporary SQLite database. The test launcher trusts only its
configured frontend origin in addition to the development origins. The regular
development app can remain running on ports 5173 and 8000.

The styling checks verify actual custom Inter rendering through Chromium's font
inspection API, local delivery of all four faces, fallback behavior after blocked
font requests, first paint without JavaScript, theme-color/native-control
integration, 35 contrast pairs per palette, keyboard focus, reduced motion, and
pending saves. Existing tests exercise real task creation/deletion and persistence.

Layout coverage includes desktop, 390px and 320px widths, 200% text sizing, and
640x450 CSS pixels to check reflow equivalent to a 1280x900 desktop at 200% zoom.
This reflow check does not change the native browser zoom control. Screenshots of
the board, dialog, error states, mobile layout, and zoom reflow are written under
the ignored `test-results/` directory for visual review.
