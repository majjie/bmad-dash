---
name: bmad-dash
description: Dark, dashboard-dense visual system for a read-only local dashboard over a BMAD project's artifacts. Material 3 token roles, tonal elevation, static tiles.
status: final
created: 2026-08-28
updated: 2026-08-28
sources:
  - ../../../specs/spec-bmad-dash/SPEC.md
  - ../../prds/prd-bmad-2026-08-28/prd.md
  - ../../architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md

colors:
  surface: '#121617'
  surface-container-low: '#181D1E'
  surface-container: '#1C2223'
  surface-container-high: '#212829'
  surface-container-highest: '#273031'
  on-surface: '#E5EAEA'
  on-surface-variant: '#93A3A4'
  on-surface-faint: '#8B9899'
  outline: '#687A7D'
  outline-variant: '#2A3234'
  primary: '#6FD3C6'
  on-primary: '#08302C'
  primary-container: '#1D3A37'
  on-primary-container: '#7FD9CD'
  signal-present: '#9BD98F'
  signal-present-container: '#243A22'
  signal-absent: '#96A5A7'
  signal-absent-container: '#20282A'
  signal-unreadable: '#E0B072'
  signal-unreadable-container: '#3D2F20'
  signal-unchecked: '#B8A2D6'
  signal-unchecked-container: '#2A2333'
  focus-ring: '#6FD3C6'
  focus-ring-on-primary: '#08302C'

typography:
  display:
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: '1.2'
    letterSpacing: '-0.01em'
  title:
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: '1.0625rem'
    fontWeight: 600
    lineHeight: '1.3'
  tile-label:
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: '0.6875rem'
    fontWeight: 600
    lineHeight: '1.2'
    letterSpacing: '0.1em'
  body:
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: '1.5'
  body-dense:
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: '1.45'
  mono:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: '0.75rem'
    fontWeight: 400
    lineHeight: '1.45'
  mono-badge:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: '0.6875rem'
    fontWeight: 500
    lineHeight: '1.2'
    letterSpacing: '0.05em'
  prose:
    fontFamily: "'IBM Plex Serif', Georgia, serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: '1.65'

motion:
  duration-progress: '900ms'
  easing-progress: 'linear'
  duration-focus: '0ms'
  reduced: 'no animation; determinate progress updates in discrete steps, indeterminate becomes a static in-progress label'

rounded:
  sm: '3px'
  md: '6px'
  lg: '12px'
  full: '9999px'
  DEFAULT: '6px'

spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '5': '20px'
  '6': '24px'
  '8': '32px'
  tile-padding: '15px'
  tile-gap: '12px'
  row-padding-y: '8px'
  page-margin: '24px'
  reading-measure: '68ch'

components:
  tile:
    background: '{colors.surface-container-low}'
    borderRadius: '{rounded.lg}'
    padding: '{spacing.tile-padding}'
    labelColor: '{colors.on-surface-variant}'
    labelType: '{typography.tile-label}'
  tile-raised:
    background: '{colors.surface-container-high}'
    borderRadius: '{rounded.lg}'
    padding: '{spacing.tile-padding}'
  activity-row:
    paddingY: '{spacing.row-padding-y}'
    dividerColor: '{colors.outline-variant}'
    primaryType: '{typography.body}'
    secondaryType: '{typography.mono}'
    secondaryColor: '{colors.on-surface-variant}'
  evidence-badge:
    type: '{typography.mono-badge}'
    borderRadius: '{rounded.sm}'
    paddingX: '{spacing.2}'
    strongColor: '{colors.primary}'
    strongBorder: '{colors.primary-container}'
    weakColor: '{colors.on-surface-variant}'
    weakBorder: '{colors.outline}'
  signal-pill:
    type: '{typography.mono-badge}'
    borderRadius: '{rounded.full}'
    paddingX: '{spacing.2}'
    strokeWidth: '1px'
    present:
      color: '{colors.signal-present}'
      background: '{colors.signal-present-container}'
      stroke: '{colors.signal-present}'
    absent:
      color: '{colors.signal-absent}'
      background: '{colors.signal-absent-container}'
      stroke: '{colors.signal-absent}'
    unreadable:
      color: '{colors.signal-unreadable}'
      background: '{colors.signal-unreadable-container}'
      stroke: '{colors.signal-unreadable}'
    unchecked:
      color: '{colors.signal-unchecked}'
      background: '{colors.signal-unchecked-container}'
      stroke: '{colors.signal-unchecked}'
  button-primary:
    background: '{colors.primary}'
    color: '{colors.on-primary}'
    borderRadius: '{rounded.full}'
    type: '{typography.body-dense}'
  button-ghost:
    background: 'transparent'
    color: '{colors.primary}'
    border: '{colors.outline}'
    borderRadius: '{rounded.full}'
    type: '{typography.body-dense}'
  core-artifact-card:
    background: '{colors.surface-container-highest}'
    borderRadius: '{rounded.md}'
    padding: '{spacing.3}'
    nameType: '{typography.body}'
    statusType: '{typography.mono}'
    absentColor: '{colors.on-surface-faint}'
    absentBackground: '{colors.surface-container}'
  refresh-progress:
    determinateTrack: '{colors.outline-variant}'
    determinateFill: '{colors.primary}'
    height: '2px'
    indeterminate: 'label only — no looping animation'
    labelType: '{typography.mono}'
    labelColor: '{colors.on-surface-variant}'
  focus-ring:
    color: '{colors.focus-ring}'
    width: '2px'
    offset: '2px'
    innerStrokeOnFilled: '{colors.focus-ring-on-primary}'
---

# bmad-dash — Visual identity

## Brand & Style

An instrument, not a destination. `bmad-dash` is opened to answer a question and closed once answered, so the visual system optimizes for the speed at which a fact can be located and trusted — never for impression on arrival.

The register is cool and measured. Surfaces are graphite; the single accent is a desaturated cyan that reads as an indicator light rather than a brand colour. Nothing decorates. Where a page looks busy it is because the project *is* busy, and the design's job is to keep that legible rather than to smooth it into calm.

The system is dark-only for now. Every token is semantic, so a light polarity is a token swap rather than a rewrite.

**What is normative.** The frontmatter tokens are the contract. The prose below explains why each exists and how to apply it, and is not a second source of values: where prose and token disagree, the token wins.

## Reference mockups

Key screens rendering these tokens: [`mockups/key-screens.html`](./mockups/key-screens.html) — Dashboard mid-refresh and the memlog Artifact view opened stale. Palette exploration, including the four rejected directions: [`mockups/color-themes.html`](./mockups/color-themes.html).

Where a mockup and the tokens in this file disagree, the tokens win.

## Colors

**`{colors.surface}`** is the page ground: graphite, deliberately not black. Pure black under near-white text produces halation, worst for readers with astigmatism.

**The surface-container ladder** — `{colors.surface-container-low}` through `{colors.surface-container-highest}` — supplies every level of lift in the system. See Elevation & Depth for how the levels are used.

**`{colors.primary}`** carries interactive affordance, strong ordering evidence, and the focus ring. It appears sparingly by design: at most one control or heading per tile takes it, because when everything is accented the accent stops meaning anything. Repeating data columns are exempt — an evidence badge appears on every activity row by requirement, and there its accent is a value rather than emphasis. It is desaturated relative to a light-theme cyan, because a hue tuned for white ground is harsh on graphite.

**`{colors.on-surface}`** is body text, computed at 11.13:1 to 15.00:1 across the container ladder. **`{colors.on-surface-variant}`** carries secondary and metadata text. **`{colors.on-surface-faint}`** is reserved for one purpose: an absent core artifact, which must be present in the layout but must not attract the eye. It is 4.54:1 at its worst pairing — deliberately close to the floor, and therefore **never combined with reduced opacity**, which would drop it below conformance.

**The four signal colours are a closed set** and map one-to-one onto the states in AD-8: `{colors.signal-present}`, `{colors.signal-absent}`, `{colors.signal-unreadable}`, `{colors.signal-unchecked}`. They are not a severity ramp and must not be reused as one.

Signal pill *fills* are near-invisible against level-2 tiles by construction — they are tonal, and so is the tile. Each pill therefore carries a 1px stroke in its own signal colour, which computes between 5.88:1 and 9.08:1 against a level-2 surface. Lightening the fills instead would push pill text below conformance.

**Colour-vision limits.** Under simulated protanopia, `present`, `absent` and `unchecked` converge toward a single hue. Because every signal is rendered as colour *plus its state word*, this is not a conformance failure — but it does mean the state word is load-bearing rather than decorative. Nothing may distinguish these three states by colour alone.

Semantic signal colour is separate from `{colors.primary}`: `signal-present` is green rather than cyan, and its container differs from `primary-container`, so the accent never encodes state and state never borrows the accent.

## Typography

Three families across eight roles, from one superfamily so they share metrics.

**IBM Plex Sans** carries the interface: `{typography.display}` for the page title, `{typography.title}` for tile and section headings, `{typography.tile-label}` for the uppercase label at the top of every tile, `{typography.body}` and `{typography.body-dense}` for content.

**IBM Plex Mono** carries anything that is an identifier or a machine value: file paths, timestamps, artifact IDs, evidence badges, signal pills. The rule is semantic, not decorative — if the string came from the filesystem or names a state, it is monospaced, which lets a reader tell tool language from project data at a glance.

**IBM Plex Serif** appears in exactly one place: `{typography.prose}`, the body of a rendered BMAD document. Documents are read rather than scanned, and the shift in family marks the shift from dashboard to reading surface. Line length is capped at `{spacing.reading-measure}`.

IBM Plex covers all three uses without pairing across foundries, and its technical heritage suits an instrument.

**The fonts are not shipped.** Loading them from a CDN would make the reader's browser fetch from a third party, against NFR-11's prohibition on outbound requests, and would disclose that they are running this tool; self-hosting would add the single largest item to a startup budget NFR-7 cares about. Each role therefore names IBM Plex first and falls back to the platform's own sans, mono and serif. Two consequences, stated rather than assumed: most readers will see system faces, and the shared-metrics property above holds only where IBM Plex is already installed. The semantic rule — mono for anything filesystem-derived or naming a machine state — is unaffected, since it depends on the distinction between families rather than on which families they are.

## Layout & Spacing

A 4px base scale. `{spacing.tile-gap}` between tiles, `{spacing.tile-padding}` inside them, `{spacing.page-margin}` at the page edge.

Density comes from tight vertical rhythm rather than from small type: `{typography.body}` stays at 14px while `{spacing.row-padding-y}` compresses row spacing.

Two floors, one per class. **Content text** never goes below `{typography.body-dense}`; never shrink content text to gain density. **Labels and badges** form a separate class with a floor of 11px (`{typography.tile-label}`, `{typography.mono-badge}`), carrying short, repeated strings. `mono-badge` sits at that floor rather than below it: its text is the redundant channel that keeps signal state legible without colour, so it must not be the smallest text on screen.

**Tiles are static.** Position is fixed by the design; nothing drags, resizes, or dismisses. Tile layout is a developer extension point — a new capability adds a tile — not a user preference, because remembering a user's arrangement would require persistence the architecture forbids.

The target is a desktop browser, with one breakpoint at 900px. What collapses, and in what order, is specified in EXPERIENCE.md under Responsive and platform; this file owns only the breakpoint value.

Reading surfaces break the dashboard grid: a rendered document uses a single column at `{spacing.reading-measure}` with its contents rail beside it.

## Elevation & Depth

Tonal only. Three levels are in use:

| Level | Token | Used for |
|---|---|---|
| 0 | `{colors.surface}` | page ground |
| 1 | `{colors.surface-container-low}` | standard tile |
| 2 | `{colors.surface-container-high}` | tile carrying primary attention, and popovers |

`{colors.surface-container}` and `{colors.surface-container-highest}` exist for hover and for a future third level; they are not used at rest in v1.

Borders are structural, not decorative: `{colors.outline-variant}` for dividers inside a tile, `{colors.outline}` for the edge of an interactive element that has no fill. A tile does not need a border — its tone is its edge.

No shadows anywhere. No gradients. No blur.

## Motion

One animation ships in v1: refresh progress. Nothing else moves.

`{motion.duration-progress}` at `{motion.easing-progress}` for the determinate progress fill. Focus transitions are instant (`{motion.duration-focus}`) — a delayed focus ring is worse than none.

Under `prefers-reduced-motion`, `{motion.reduced}` applies. Nothing else in the system animates, so there is nothing further to suppress.

## Shapes

`{rounded.lg}` for tiles, `{rounded.md}` as the default for inputs and containers, `{rounded.sm}` for badges that sit inline with text, `{rounded.full}` for pills and buttons.

The logic: the larger the surface, the larger the radius, so curvature reads as consistent at every scale. Pills are fully round to distinguish a state label from a clickable control at a glance — state pills and buttons share the shape but never the colour role.

## Components

**Tile** — the fundamental unit. An uppercase `{typography.tile-label}` heading in `{colors.on-surface-variant}`, then content. One tile holds one kind of information; a tile that needs two headings is two tiles.

**Activity row** — a single line of the feed: primary text in `{typography.body}`, a monospaced secondary line carrying family and time, and an evidence badge pinned right. Rows divide with `{colors.outline-variant}`, and the last row carries no divider.

**Evidence badge** — states which tier placed an item and at what resolution. Two visual weights: strong (text `{colors.primary}`, border `{colors.primary-container}`) for commit and uncommitted evidence, weak (text `{colors.on-surface-variant}`, border `{colors.outline}`) for day-resolution and file-time evidence. The weight *is* the disclosure — a reader must be able to see that an ordering is weakly evidenced without reading the label.

**Signal pill** — one of the four closed states, always colour plus its state word.

**Core artifact card** — name and a monospaced status line, in `{colors.on-surface-faint}` when absent. The token alone carries the reduced weight; no opacity is applied, which would drop it below conformance. An absent card keeps its grid position and is not a link.

**Buttons** — `button-primary` for the single main action on a surface (refresh); `button-ghost` for everything else. No more than one primary button visible at a time.

**Focus ring** — `{components.focus-ring}`, 2px of `{colors.focus-ring}` at 2px offset, on every focusable element without exception. It must never be clipped by a tile edge or occluded by a sticky region: tiles reserve the offset inside their padding rather than letting the ring overflow.

On an element already filled with `{colors.primary}` the ring would be invisible against its own background, so a focused primary-filled element additionally takes a 1px inner stroke in `{colors.focus-ring-on-primary}` (8.04:1 against the fill). The offset gap alone is not relied on.

## Do's and Don'ts

**Do**

- Lift with tone. A new elevated element takes the next step on the container ladder.
- Monospace anything that came from the filesystem or names a machine state.
- Pair every colour-carried meaning with text or shape, so nothing depends on hue alone.
- Reserve focus-ring space inside a container's padding.
- Define new colours as semantic tokens, so light polarity stays a swap rather than a rewrite.

**Don't**

- Don't use shadow, gradient, or blur for depth. Tone only.
- Don't use `#000` as a ground, and don't put pure white on graphite.
- Don't shrink content text below `{typography.body-dense}`, or any label or badge below 11px. Compress spacing instead.
- Don't accent more than one *control or heading* per tile with `{colors.primary}`. Repeating data columns are exempt: an evidence badge appears on every activity row by requirement, and its accent is a data value, not emphasis. The rule governs emphasis, not encoding.
- Don't reuse a signal colour as a severity level; the set is closed and unranked.
- Don't introduce a hex literal in a component. Every colour resolves through a token.
- Don't stack opacity on a colour that is already near its contrast floor. Change the token instead.
- Don't lighten a signal container to make a pill visible; stroke it.
- Don't re-reason a colour change. Recompute the ratios.

## Conformance record

Every ratio in this file comes from the WCAG relative-luminance and contrast-ratio formulas, applied to the frontmatter hex values on 2026-08-28. Thresholds applied: 4.5:1 for text at these sizes — every type role here sits below the large-text boundary — and 3:1 for UI component boundaries, graphical objects, and focus indicators.
