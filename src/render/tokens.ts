/**
 * The token layer: a verbatim transcription of the frontmatter in
 * `_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/DESIGN.md`.
 *
 * DESIGN.md is the normative side. Its own prose says so — *"the frontmatter
 * tokens are the contract [...] where prose and token disagree, the token
 * wins"* — but until Story 1.2 that claim was prose about prose: nothing read
 * the frontmatter, so the first hex typed straight into a stylesheet would have
 * made the document fiction without anything going red. This module is the one
 * place the values are repeated, and `test/render/tokens.test.ts` parses
 * DESIGN.md and compares the two in both directions, so drift fails CI instead
 * of shipping.
 *
 * Consequences of that, and they are the whole point:
 *
 *   - **Never edit a value here to match the code.** Change DESIGN.md, then
 *     transcribe. The test will name any token that disagrees.
 *   - **Component tokens keep their `{group.key}` references verbatim.** They
 *     are not pre-resolved, because resolving them here would mean this module
 *     no longer matches DESIGN.md character for character, and the fidelity
 *     test would have to understand the indirection to compare. Resolution is
 *     the emitter's job — see `./stylesheet.ts`.
 *   - **Prose-valued tokens are transcribed as prose.** `motion.reduced` and
 *     `components.refresh-progress.indeterminate` are sentences in DESIGN.md,
 *     so they are sentences here; the emitter names them as deliberately
 *     non-CSS rather than dropping them silently.
 *
 * Pure data and one pure function. Nothing here imports anything, so the whole
 * layer is safe to read from the domain side of AD-1 as well as the adapters.
 */

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * Twenty-four semantic colour roles. Dark-only for now, and semantic precisely
 * so a light polarity stays a token swap rather than a rewrite: nothing below
 * is named for what it looks like.
 *
 * The four `signal-*` roles and their containers are a **closed, unranked set**
 * mapping one-to-one onto present / absent / unreadable / unchecked. They are
 * not a severity ramp and must never be reused as one, and they stay separate
 * from `primary` so the accent never encodes state.
 */
export const colors = {
  surface: '#121617',
  'surface-container-low': '#181D1E',
  'surface-container': '#1C2223',
  'surface-container-high': '#212829',
  'surface-container-highest': '#273031',
  'on-surface': '#E5EAEA',
  'on-surface-variant': '#93A3A4',
  'on-surface-faint': '#8B9899',
  outline: '#687A7D',
  'outline-variant': '#2A3234',
  primary: '#6FD3C6',
  'on-primary': '#08302C',
  'primary-container': '#1D3A37',
  'on-primary-container': '#7FD9CD',
  'signal-present': '#9BD98F',
  'signal-present-container': '#243A22',
  'signal-absent': '#96A5A7',
  'signal-absent-container': '#20282A',
  'signal-unreadable': '#E0B072',
  'signal-unreadable-container': '#3D2F20',
  'signal-unchecked': '#B8A2D6',
  'signal-unchecked-container': '#2A2333',
  'focus-ring': '#6FD3C6',
  'focus-ring-on-primary': '#08302C',
} as const;

export type ColorName = keyof typeof colors;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * One type role: the complete set of properties a caller applies together.
 *
 * `letterSpacing` is optional because DESIGN.md declares it on three roles
 * only, and inventing `normal` for the other five would be a value this module
 * made up — which is the one thing it is not allowed to do.
 */
export interface TypeRole {
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly fontWeight: number;
  readonly lineHeight: string;
  readonly letterSpacing?: string;
}

/**
 * Eight roles across three families of one superfamily, so metrics agree.
 *
 * **No font file is shipped and none is fetched.** Loading IBM Plex from a CDN
 * would make the reader's browser talk to a third party — against the
 * no-outbound-request rule, and it would disclose that they are running this
 * tool — and self-hosting would be the largest single item in the startup
 * budget. Each stack therefore names IBM Plex first and falls back to the
 * platform's own sans, mono and serif. Most readers see system faces; the
 * shared-metrics property holds only where IBM Plex is already installed. The
 * semantic rule survives either way, because it depends on the distinction
 * between families rather than on which families they are.
 *
 * Mono is applied semantically, not decoratively: a string that came from the
 * filesystem or names a machine state is monospaced, so a reader can separate
 * tool language from project data at a glance.
 */
export const typography = {
  display: {
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    fontSize: '1.5rem',
    fontWeight: 600,
    lineHeight: '1.2',
    letterSpacing: '-0.01em',
  },
  title: {
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    fontSize: '1.0625rem',
    fontWeight: 600,
    lineHeight: '1.3',
  },
  'tile-label': {
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    fontSize: '0.6875rem',
    fontWeight: 600,
    lineHeight: '1.2',
    letterSpacing: '0.1em',
  },
  body: {
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    fontSize: '0.875rem',
    fontWeight: 400,
    lineHeight: '1.5',
  },
  'body-dense': {
    fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
    fontSize: '0.8125rem',
    fontWeight: 400,
    lineHeight: '1.45',
  },
  mono: {
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: '0.75rem',
    fontWeight: 400,
    lineHeight: '1.45',
  },
  'mono-badge': {
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: '0.6875rem',
    fontWeight: 500,
    lineHeight: '1.2',
    letterSpacing: '0.05em',
  },
  prose: {
    fontFamily: "'IBM Plex Serif', Georgia, serif",
    fontSize: '1rem',
    fontWeight: 400,
    lineHeight: '1.65',
  },
} as const satisfies Record<string, TypeRole>;

export type TypeRoleName = keyof typeof typography;

/**
 * Which of the three type floors a role answers to.
 *
 * DESIGN.md states them as three classes, not one scale: **content text** never
 * goes below `body-dense` (13px), **machine values** have a floor of 12px, and
 * **labels and badges** a floor of 11px. The classification has to be written
 * down somewhere, because
 * it cannot be recovered from the sizes — `mono` at 12px is below `body-dense`
 * and entirely correct, since it carries paths, timestamps and machine states
 * rather than content. Reading the floor off the numbers would either flag that
 * as a violation or quietly lower the content floor to 12px.
 *
 * `mono-badge` sits *at* the 11px floor rather than below it on purpose: its
 * text is the redundant channel that keeps signal state legible without colour,
 * so it must not be the smallest text on screen.
 *
 * Adding a role without classifying it fails to typecheck, and
 * `test/render/stylesheet.test.ts` asserts all three floors against these
 * classes, and pins each role to its class so a reclassification fails.
 */
export type TypeFloorClass = 'content' | 'machine' | 'label';

export const TYPE_FLOOR_CLASS = {
  display: 'content',
  title: 'content',
  'tile-label': 'label',
  body: 'content',
  'body-dense': 'content',
  mono: 'machine',
  'mono-badge': 'label',
  prose: 'content',
} as const satisfies Record<TypeRoleName, TypeFloorClass>;

/** Each floor is a role, not a number, so it moves when DESIGN.md does. */
export const CONTENT_FLOOR_ROLE = 'body-dense' as const satisfies TypeRoleName;

/**
 * The machine-value floor, per DESIGN.md's three-class rule. File paths and
 * timestamps are content by any reading, but they are scanned rather than read,
 * and monospace holds legibility at 12px where a proportional face would not.
 */
export const MACHINE_FLOOR_ROLE = 'mono' as const satisfies TypeRoleName;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * The only animation in v1 is refresh progress; nothing else moves.
 *
 * `duration-focus` is `0ms` deliberately — a delayed focus ring is worse than
 * none. `reduced` is a sentence rather than a CSS value: it states what
 * `prefers-reduced-motion: reduce` must produce, and the emitter honours it as
 * a rule rather than as a custom property.
 */
export const motion = {
  'duration-progress': '900ms',
  'easing-progress': 'linear',
  'duration-focus': '0ms',
  reduced:
    'no animation; determinate progress updates in discrete steps, indeterminate becomes a static in-progress label',
} as const;

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * Four radii on one rule: the larger the surface, the larger the radius, so
 * curvature reads as consistent at every scale. `full` is for pills and
 * buttons. `DEFAULT` is the frontmatter's own key for the inputs-and-containers
 * default and duplicates `md` by design.
 */
export const rounded = {
  sm: '3px',
  md: '6px',
  lg: '12px',
  full: '9999px',
  DEFAULT: '6px',
} as const;

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

/**
 * A 4px base scale plus five named measures. Density comes from compressed
 * vertical rhythm — `row-padding-y` — and never from shrinking type, which is
 * also what makes a 200% text resize survivable.
 *
 * `tile-padding` is 15px rather than 16 because a tile reserves the 2px focus
 * ring plus its 2px offset *inside* its own padding: a ring clipped by a tile
 * edge is a defect, not a cosmetic issue.
 */
export const spacing = {
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  'tile-padding': '15px',
  'tile-gap': '12px',
  'row-padding-y': '8px',
  'page-margin': '24px',
  'reading-measure': '68ch',
} as const;

// ---------------------------------------------------------------------------
// Component tokens
// ---------------------------------------------------------------------------

/**
 * Ten component token sets, transcribed with their `{group.key}` references
 * intact.
 *
 * Story 1.2 builds no components — that is Story 1.3 — so all but `focus-ring`
 * are carried here without being emitted. They are still transcribed, because
 * the fidelity test compares whole documents: a component set present in
 * DESIGN.md and absent here is drift whether or not anything renders it yet.
 *
 * `focus-ring` is the exception the emitter reaches for, since a focus ring is
 * a base rule on every focusable element rather than a component, and
 * `prefers-reduced-motion` and focus treatment are both honoured from the
 * outset so no later story retrofits them.
 */
export const components = {
  tile: {
    background: '{colors.surface-container-low}',
    borderRadius: '{rounded.lg}',
    padding: '{spacing.tile-padding}',
    labelColor: '{colors.on-surface-variant}',
    labelType: '{typography.tile-label}',
  },
  'tile-raised': {
    background: '{colors.surface-container-high}',
    borderRadius: '{rounded.lg}',
    padding: '{spacing.tile-padding}',
  },
  'activity-row': {
    paddingY: '{spacing.row-padding-y}',
    dividerColor: '{colors.outline-variant}',
    primaryType: '{typography.body}',
    secondaryType: '{typography.mono}',
    secondaryColor: '{colors.on-surface-variant}',
  },
  'evidence-badge': {
    type: '{typography.mono-badge}',
    borderRadius: '{rounded.sm}',
    paddingX: '{spacing.2}',
    strongColor: '{colors.primary}',
    strongBorder: '{colors.primary-container}',
    weakColor: '{colors.on-surface-variant}',
    weakBorder: '{colors.outline}',
  },
  'signal-pill': {
    type: '{typography.mono-badge}',
    borderRadius: '{rounded.full}',
    paddingX: '{spacing.2}',
    strokeWidth: '1px',
    present: {
      color: '{colors.signal-present}',
      background: '{colors.signal-present-container}',
      stroke: '{colors.signal-present}',
    },
    absent: {
      color: '{colors.signal-absent}',
      background: '{colors.signal-absent-container}',
      stroke: '{colors.signal-absent}',
    },
    unreadable: {
      color: '{colors.signal-unreadable}',
      background: '{colors.signal-unreadable-container}',
      stroke: '{colors.signal-unreadable}',
    },
    unchecked: {
      color: '{colors.signal-unchecked}',
      background: '{colors.signal-unchecked-container}',
      stroke: '{colors.signal-unchecked}',
    },
  },
  'button-primary': {
    background: '{colors.primary}',
    color: '{colors.on-primary}',
    borderRadius: '{rounded.full}',
    type: '{typography.body-dense}',
  },
  'button-ghost': {
    background: 'transparent',
    color: '{colors.primary}',
    border: '{colors.outline}',
    borderRadius: '{rounded.full}',
    type: '{typography.body-dense}',
  },
  'core-artifact-card': {
    background: '{colors.surface-container-highest}',
    borderRadius: '{rounded.md}',
    padding: '{spacing.3}',
    nameType: '{typography.body}',
    statusType: '{typography.mono}',
    absentColor: '{colors.on-surface-faint}',
    absentBackground: '{colors.surface-container}',
  },
  'refresh-progress': {
    determinateTrack: '{colors.outline-variant}',
    determinateFill: '{colors.primary}',
    height: '2px',
    indeterminate: 'label only — no looping animation',
    labelType: '{typography.mono}',
    labelColor: '{colors.on-surface-variant}',
  },
  'focus-ring': {
    color: '{colors.focus-ring}',
    width: '2px',
    offset: '2px',
    innerStrokeOnFilled: '{colors.focus-ring-on-primary}',
  },
} as const;

export type ComponentName = keyof typeof components;

// ---------------------------------------------------------------------------
// The whole document
// ---------------------------------------------------------------------------

/**
 * The six token groups DESIGN.md's frontmatter declares, in its order.
 *
 * The group *names* are load-bearing: the fidelity test compares this object
 * against the frontmatter keyed by exactly these names, so a group renamed on
 * either side is reported rather than skipped.
 */
export const TOKEN_GROUPS = ['colors', 'typography', 'motion', 'rounded', 'spacing', 'components'] as const;

export type TokenGroupName = (typeof TOKEN_GROUPS)[number];

export const tokens = {
  colors,
  typography,
  motion,
  rounded,
  spacing,
  components,
} as const satisfies Record<TokenGroupName, unknown>;

/**
 * Flatten nested token groups to `dotted.path -> value`, values stringified.
 *
 * Deliberately generic and deliberately shared: the fidelity test runs it over
 * *both* this module and the map parsed out of DESIGN.md, so the two sides are
 * reduced by identical rules and a mismatch can only be a real difference in
 * the data rather than an artefact of comparing two shapes two ways.
 *
 * Numbers become strings because YAML hands back text: `fontWeight: 600` in
 * DESIGN.md and `fontWeight: 600` here must compare equal without either side
 * guessing at the other's type.
 */
export function flattenTokens(value: unknown, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>();
  const visit = (node: unknown, path: string): void => {
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      for (const [key, child] of Object.entries(node)) {
        visit(child, path === '' ? key : `${path}.${key}`);
      }
      return;
    }
    if (Array.isArray(node)) {
      // No token group is a sequence; recorded rather than dropped so a group
      // that becomes one is a visible difference instead of an absence.
      flat.set(path, `[${node.map((item) => String(item)).join(', ')}]`);
      return;
    }
    flat.set(path, String(node));
  };
  visit(value, prefix);
  return flat;
}

/** Every token in the module, as `dotted.path -> stringified value`. */
export function flatTokens(): Map<string, string> {
  return flattenTokens(tokens);
}
