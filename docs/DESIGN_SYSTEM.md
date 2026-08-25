# Frontend Design System

This document describes the CSS architecture after the 2026-08-24 stylesheet migration. The migration preserves the existing Wrike/Jira visual language and class names that are still used by the application; it does not introduce a visual redesign.

## Architecture

The styling hierarchy is now:

```text
src/client/styles/tokens.css
        ↓
src/client/styles/index.css (Tailwind entry point + authored primitives)
        ↓
Tailwind utilities and feature composition
        ↓
React views
```

`tokens.css` is the source of truth for authored CSS and the Tailwind theme extension. `index.css` owns only the global baseline, shared controls, shared surfaces, tables, status primitives, and the two canvas/dropdown primitives. Feature-specific layout remains in component composition and Tailwind utilities.

## Token categories

- Palette primitives: neutral, brand, info, warning, danger, and Jira-compatible legacy values.
- Semantic roles: page/panel/subtle/hover/selected surfaces, primary/secondary/muted text, borders, focus, and status roles.
- Spacing: `--space-0` through `--space-12` for the established rhythm, plus shared control/table/pill sizing tokens.
- Typography: sans/mono families, body sizes, weights, and line-height roles.
- Shape and elevation: `--radius-*` and `--shadow-*` scales.
- Motion: fast/normal/slow durations, standard easing, focus-ring, and reduced-motion policy.
- Layering: content, sticky, header, floating, dropdown, overlay, modal, toast, and dialog z-index roles.

Tailwind exposes the same foundation through `semantic.*`, `wrike.*`, `spacing.ds*`, `borderRadius.ds*`, `transitionDuration.ds*`, and `zIndex.ds*` keys. Existing `wrike.*` names are retained for compatibility, but their values now resolve to CSS variables.

## Component rules

- Use `wrike-btn-primary`, `wrike-btn-secondary`, `jira-btn-primary`, `jira-btn-secondary`, or `jira-btn-subtle` for shared buttons. Do not recreate shared button geometry in a feature stylesheet.
- Use `wrike-input`, `jira-input`, and `wrike-select` for shared controls. Runtime-derived values may remain inline.
- Use `wrike-card`, `wrike-pill-*`, and `jira-lozenge-*` for their existing feature semantics.
- Use `jira-table` or `wrike-table` when a view needs the corresponding table density.
- Preserve `:focus-visible` indicators. Do not add `!important` to work around a utility conflict; add a semantic variant or adjust ownership instead.
- Shared buttons and filter pills expose explicit keyboard focus-visible rings; the global reduced-motion rule removes transition/animation duration without changing layout.
- `AppLayout` owns the responsive shell: below the `lg` breakpoint (including the required 390px and 768px checks) `Sidebar` is a drawer opened by the top-bar navigation button, with a dismissible overlay; large desktop keeps the existing in-flow sidebar.

## CSS ownership rules

Global CSS should contain only the baseline, tokens, shared primitives, browser policies, and cross-feature controls. Component-specific geometry belongs to the component composition. A data-driven color, percentage, transform, or annotation coordinate may remain inline when it cannot be represented by a static class.

Prefer semantic consumption:

```css
background: var(--surface-panel);
color: var(--text-primary);
border-color: var(--border-default);
```

Do not add a token for a one-off geometry value. Do not add a second `card` or button family because a feature needs a small variation; add an explicit, named variant only when the behavior is shared.

## Class audit

Every authored class selector was extracted from both stylesheet files and searched across all source files. The audit also records 173 `className={...}` expression sites and 1,233 dynamic-class markers (`${...}`, variant helpers, and class-list operations) for manual conditional/runtime review. The 28 remaining selectors are all referenced by client code:

```text
custom-scrollbar
jira-btn-primary, jira-btn-secondary
jira-filter-pill, jira-filter-pill-inactive
jira-input
jira-lozenge, jira-lozenge-todo, jira-lozenge-inprogress,
jira-lozenge-review, jira-lozenge-blocked, jira-lozenge-done
jira-table
mini-label
wrike-btn-primary, wrike-btn-secondary
wrike-canvas-grid, wrike-card, wrike-dropdown-menu
wrike-input, wrike-pill, wrike-pill-green, wrike-pill-blue,
wrike-pill-amber, wrike-select, wrike-table
```

Ten high-confidence orphaned selectors were removed after the exact source audit found no literal, conditional, template, or map-based references: `empty-action`, `empty-box`, `field-label`, `section-label`, `step-number`, `wrike-btn-subtle`, `wrike-card-hover`, `wrike-pill-red`, `jira-filter-pill-active`, and `pill`. No application component was deleted.

## Audit metrics

The “before” stylesheet numbers were captured from the pre-migration working-tree stylesheet; the tracked baseline had 592 lines, while the working tree also contained the user’s 19-line date-input addition. Current values come from `pnpm.cmd audit:css`; the audit now covers every repository stylesheet extension while excluding generated/vendor directories.

| Metric | Before | After |
|---|---:|---:|
| CSS/style files | 1 | 2 |
| CSS lines (working-tree baseline / current) | 611 | 485 |
| Class selectors inspected | 38 | 28 active |
| Dynamic/conditional class paths | not separately identifiable | 173 expression sites / 1,233 markers reviewed; 0 unreferenced selectors |
| Dead classes removed | 0 | 10 |
| CSS variables | 18 | 289 |
| Raw color literals in authored CSS | 149 | 157 |
| Raw color occurrences in client source | 3,382 | 24 (20 unique) |
| Arbitrary color utility occurrences in client source | 2,137 | 0 |
| All audited arbitrary utility occurrences | not reliably captured | 43 |
| `!important` declarations | 1 | 0 |
| Unique raw spacing values in authored CSS | 16 | 15 |
| Keyframes | 0 | 0 |
| z-index declarations in authored CSS | 0 | 0 |
| Numeric z-index utility classes | not separately captured | 0 (only `z-auto` remains) |
| Unused CSS variables | not separately captured | 0 |
| Unused keyframes | 0 | 0 |

The token count intentionally increased because the application previously had only a small legacy `--wrike-*` set. The 289 variables are grouped into palette, semantic roles, feature-state surfaces, spacing, shared sizing, typography, shape, elevation, motion, and layering; the Tailwind config exposes the foundation so these values are not CSS-only dead definitions.

## Preserved/suspicious styling

- Client source now contains 24 raw color occurrences across 20 unique values and no arbitrary color utilities. Remaining values are persisted department palette choices, workflow visualization palette definitions, and runtime fallbacks that must remain actual color strings for SVG/canvas or server-stored data.
- Inline styles remain for runtime-derived widths, coordinates, transforms, department/status colors, and annotation geometry. Static shared control styling was moved to CSS; dynamic values remain intentionally data-driven. The current audit reports 32 inline-style expressions.
- The remaining arbitrary utility values are mostly dimensions, grid geometry, and feature-specific one-offs. Numeric z-index utilities were migrated to the semantic layer; only `z-auto` remains.

## Validation contract

`lint:css` is a dependency-free architectural lint for the repository’s stylesheet and class/token contract; ESLint and Stylelint are not configured in this checkout. Run these commands after future styling changes:

```text
pnpm.cmd lint:css
pnpm.cmd build
pnpm.cmd test
```

The audit reports every stylesheet file, all authored selectors, unused variables/keyframes, dynamic class-expression sites, specificity, numeric z-index utilities, inline-style sites, and the final scans for `!important`, raw colors, `box-shadow`, `border-radius`, `z-index`, `transition`, `animation`, and `style={{...}}`. A rendered route check is separate evidence from a successful build or test run.
