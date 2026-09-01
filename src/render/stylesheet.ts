/**
 * The token layer, emitted as CSS.
 *
 * Two jobs, kept apart on purpose:
 *
 *   1. **Emission.** Every token that has a CSS value becomes one custom
 *      property on `:root`. This is the *only* place a literal colour, size,
 *      duration or radius appears in any rendering code — everything
 *      downstream, in this story and every later one, resolves through
 *      `var(--…)`. The base rules below hold to that themselves, which is what
 *      makes the rule testable rather than aspirational.
 *   2. **Base rules.** The document-level defaults the served page needs:
 *      the graphite ground, the type roles on the elements that carry them, the
 *      focus ring, and the `prefers-reduced-motion` block.
 *
 * What is deliberately *not* here: components. No tile, no chrome, no
 * `tile-raised` — those are Story 1.3, and their tokens are transcribed in
 * `./tokens.ts` without being emitted. The one component set that is emitted is
 * `focus-ring`, because a focus ring is a base rule on every focusable element
 * without exception rather than a component, and because honouring
 * `prefers-reduced-motion` and instant focus from the outset is what stops a
 * later story retrofitting them.
 *
 * Tonal elevation only. There is no `box-shadow`, no gradient and no blur
 * anywhere in this file, and a test asserts that of the emitted string: a
 * tile's tone is its edge.
 */

import { flatTokens, type TokenGroupName } from './tokens.ts';

/**
 * Tokens whose value is prose, not CSS.
 *
 * DESIGN.md states both as sentences — `motion.reduced` says what reduced
 * motion must produce, `refresh-progress.indeterminate` says what an
 * indeterminate progress indicator is allowed to be — so emitting either as a
 * custom property would put an English sentence where a CSS value goes. They
 * are named here rather than filtered by shape so the exemption is a decision
 * on the record, and `test/render/stylesheet.test.ts` asserts this list is
 * exactly the set of non-emitted scalars.
 */
export const PROSE_TOKENS: readonly string[] = [
  'motion.reduced',
  'components.refresh-progress.indeterminate',
];

/**
 * The component sets whose tokens are emitted as custom properties.
 *
 * A set rather than a single name, because Story 1.3 builds the containers. The
 * remaining seven stay transcribed in `./tokens.ts` and unemitted, so the
 * fidelity test still compares whole documents while nothing reaches a
 * stylesheet before the story that owns it — and `unemittedTokens()` names each
 * one with its reason rather than dropping it quietly.
 */
export const EMITTED_COMPONENTS: readonly string[] = ['tile', 'tile-raised', 'focus-ring'];

/**
 * A component token whose value names a whole type role, e.g.
 * `{typography.tile-label}`.
 *
 * These cannot become one custom property, and the distinction is not cosmetic:
 * a role is five declarations — family, size, weight, line height and
 * sometimes letter spacing — and `:root` emits each separately. There is no
 * `--type-tile-label`, so emitting `--tile-label-type: var(--type-tile-label)`
 * would produce a `var()` naming a property that does not exist, which CSS
 * drops silently along with the whole declaration. The Story 1.2 review added
 * the test that catches exactly that, which is how this was found rather than
 * shipped.
 *
 * A role reference is therefore resolved by *applying* the role's declarations
 * at the point of use, via `typeRole()`, and the token is recorded as
 * deliberately unemitted with that reason.
 */
const ROLE_REFERENCE = /^\{typography\.([-a-zA-Z0-9]+)\}$/;

/** The role a component token names, or `null` if it names something else. */
export function roleReference(raw: string): string | null {
  return ROLE_REFERENCE.exec(raw)?.[1] ?? null;
}

/** Custom-property prefix per token group. `components` is handled separately. */
const GROUP_PREFIX = new Map<TokenGroupName, string>([
  ['colors', 'color'],
  ['typography', 'type'],
  ['motion', 'motion'],
  ['rounded', 'radius'],
  ['spacing', 'space'],
]);

/**
 * `camelCase` -> `kebab-case`, with all-caps keys lowercased whole.
 *
 * `rounded.DEFAULT` is a real frontmatter key, and the letter-by-letter rule
 * would have turned it into `-d-e-f-a-u-l-t`.
 */
function kebab(key: string): string {
  if (/^[A-Z]+$/.test(key)) return key.toLowerCase();
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * The custom property a token path is emitted as.
 *
 * Throws for a path the emitter has no name for, rather than inventing one: a
 * new token group would otherwise be emitted under a guessed prefix that
 * nothing downstream references, which looks like success.
 */
export function customPropertyName(path: string): string {
  const segments = path.split('.');
  const group = segments[0];
  const rest = segments.slice(1);

  if (group === 'components') {
    const [component, ...fields] = rest;
    if (component === undefined || !EMITTED_COMPONENTS.includes(component) || fields.length === 0) {
      throw new Error(`no custom property is emitted for ${path}`);
    }
    return `--${component}-${fields.map(kebab).join('-')}`;
  }

  const prefix = group === undefined ? undefined : GROUP_PREFIX.get(group as TokenGroupName);
  if (prefix === undefined || rest.length === 0) {
    throw new Error(`no custom property is emitted for ${path}`);
  }
  return `--${prefix}-${rest.map(kebab).join('-')}`;
}

/** A `{group.key}` reference to another token, as DESIGN.md writes them. */
const REFERENCE = /^\{([^}]+)\}$/;

/**
 * Resolve a token value to a CSS value.
 *
 * A `{group.key}` reference becomes `var(--…)` rather than the referenced
 * literal, so the indirection DESIGN.md declares survives into the stylesheet:
 * changing `colors.focus-ring` changes the ring, and the emitted CSS says out
 * loud that it is the same value rather than a coincidence.
 */
export function cssValue(raw: string): string {
  const reference = REFERENCE.exec(raw);
  if (reference === null) return raw;
  const target = reference[1];
  if (target === undefined) return raw;
  return `var(${customPropertyName(target)})`;
}

export interface CustomProperty {
  /** The dotted token path this came from — the name a failure can cite. */
  readonly token: string;
  readonly name: string;
  readonly value: string;
}

/**
 * True for a token that is emitted as a custom property.
 *
 * Takes the value as well as the path, because whether a token *can* be one
 * property is a property of its value: a role reference cannot, whatever it is
 * called.
 */
function isEmitted(path: string, raw: string): boolean {
  if (PROSE_TOKENS.includes(path)) return false;
  if (roleReference(raw) !== null) return false;
  if (!path.startsWith('components.')) return true;
  const component = path.split('.')[1];
  return component !== undefined && EMITTED_COMPONENTS.includes(component);
}

/**
 * Every emitted custom property, in DESIGN.md's own group order.
 *
 * Derived from the flattened token map rather than listed by hand, so a token
 * added to `./tokens.ts` is emitted without a second edit here — the failure
 * mode of a hand-written list is a token that exists, passes the fidelity test,
 * and reaches no stylesheet.
 */
export function customProperties(): readonly CustomProperty[] {
  const emitted: CustomProperty[] = [];
  for (const [token, raw] of flatTokens()) {
    if (!isEmitted(token, raw)) continue;
    emitted.push({ token, name: customPropertyName(token), value: cssValue(raw) });
  }
  return emitted;
}

/** Why one token is carried but not emitted. Exhaustive by construction. */
function unemittedReason(token: string, raw: string): string {
  if (PROSE_TOKENS.includes(token)) return 'prose, not a CSS value';
  if (roleReference(raw) !== null) return 'type role reference; applied as declarations';
  return 'component token; a later story owns the component';
}

/** Tokens carried by the module and deliberately not emitted, with the reason. */
export function unemittedTokens(): readonly { readonly token: string; readonly reason: string }[] {
  const held: { token: string; reason: string }[] = [];
  for (const [token, raw] of flatTokens()) {
    if (isEmitted(token, raw)) continue;
    held.push({ token, reason: unemittedReason(token, raw) });
  }
  return held;
}

const INDENT = '  ';

/** Emitted once: every rule below asks the same question of the same answer. */
const EMITTED = customProperties();
const EMITTED_NAMES = new Set(EMITTED.map((property) => property.name));

function declaration(name: string, value: string): string {
  return `${INDENT}${name}: ${value};`;
}

/**
 * The `:root` block: `color-scheme` plus every emitted token.
 *
 * `color-scheme: dark` is a statement of polarity, not a colour. The system is
 * dark-only for now, and declaring it means the browser's own furniture —
 * scrollbars, form controls, the canvas behind an overscroll — is dark too,
 * instead of a strip of white appearing under a graphite page.
 */
function rootBlock(): string {
  const lines = [':root {', declaration('color-scheme', 'dark')];
  let group = '';
  for (const property of EMITTED) {
    const nextGroup = property.token.split('.')[0] ?? '';
    if (nextGroup !== group) {
      lines.push('');
      group = nextGroup;
    }
    lines.push(declaration(property.name, property.value));
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * The properties of one type role, as declarations inside a rule.
 *
 * A role's `letter-spacing` is declared only where DESIGN.md declares one,
 * because `var(--type-body-letter-spacing)` with no such token would resolve to
 * nothing and drop the whole declaration — a silent no-op that looks like a
 * rule doing work.
 */
export function typeRole(role: string): string {
  // A role name with no emitted properties would produce an empty rule body:
  // every `wanted` entry filtered out, no declaration, and no error. That is
  // the silent no-op this function's own comment warns about one level down,
  // so it is refused rather than trusted.
  if (!EMITTED_NAMES.has(`--type-${role}-font-size`)) {
    throw new Error(`no emitted type role named "${role}"; nothing would be declared`);
  }
  const wanted = [
    ['font-family', `--type-${role}-font-family`],
    ['font-size', `--type-${role}-font-size`],
    ['font-weight', `--type-${role}-font-weight`],
    ['line-height', `--type-${role}-line-height`],
    ['letter-spacing', `--type-${role}-letter-spacing`],
  ] as const;
  return wanted
    .filter(([, property]) => EMITTED_NAMES.has(property))
    .map(([css, property]) => declaration(css, `var(${property})`))
    .join('\n');
}

function rule(selector: string, body: readonly string[]): string {
  return `${selector} {\n${body.filter((line) => line !== '').join('\n')}\n}`;
}

/**
 * Document defaults. Every value is a `var(--…)` or a unitless `0`; there is no
 * literal here, which is the property the stylesheet test enforces.
 *
 * `h2`/`h3` take `title` and not a scale of their own: DESIGN.md gives eight
 * roles and no more, so a fourth heading size would be a value invented here.
 * `code`, `kbd`, `samp` and `pre` take `mono` because mono is semantic — if a
 * string came from the filesystem or names a machine state it is monospaced —
 * and those elements are exactly where such strings land in plain HTML.
 */
function baseRules(): readonly string[] {
  return [
    rule('*, *::before, *::after', [declaration('box-sizing', 'border-box')]),

    rule('html', [
      declaration('background', 'var(--color-surface)'),
      declaration('color', 'var(--color-on-surface)'),
      typeRole('body'),
    ]),

    rule('body', [
      declaration('margin', '0'),
      declaration('padding', 'var(--space-page-margin)'),
      declaration('background', 'var(--color-surface)'),
    ]),

    rule('h1', [typeRole('display'), declaration('margin', '0 0 var(--space-3)')]),
    rule('h2, h3', [typeRole('title'), declaration('margin', '0 0 var(--space-2)')]),
    rule('p', [typeRole('body'), declaration('margin', '0 0 var(--space-2)')]),
    rule('code, kbd, samp, pre', [typeRole('mono')]),
    // Underlined, not merely coloured. `primary` against `on-surface` is
    // 1.46:1 — far under the 3:1 that WCAG 1.4.1 asks of a colour-only
    // distinction — so the underline is the non-colour channel, not decoration.
    rule('a', [
      declaration('color', 'var(--color-primary)'),
      declaration('text-decoration-line', 'underline'),
      declaration('text-decoration-thickness', 'from-font'),
    ]),

    // On every focusable element without exception, and never clipped: a
    // container reserves the offset inside its own padding rather than letting
    // the ring overflow. `:focus-visible` only, because a mouse click on a
    // heading should not draw one.
    rule(':focus-visible', [
      declaration('outline', 'var(--focus-ring-width) solid var(--focus-ring-color)'),
      declaration('outline-offset', 'var(--focus-ring-offset)'),
    ]),
  ];
}

/**
 * The shared containers, and the chrome around them.
 *
 * `.tile` and `.tile-raised` differ only in tone — one ladder step — which is
 * the whole of "tonal elevation": same padding, same radius, no border, no
 * shadow. A tile's tone is its edge.
 *
 * Nothing here sets `overflow: hidden`. That is deliberate and load-bearing:
 * a container that clips its overflow clips a focus ring drawn at a 2px offset
 * on a child at its edge, and a clipped ring is a conformance failure (WCAG
 * 2.4.11) rather than a cosmetic one. The tile's padding is 15px against a ring
 * that needs 4px, so the space is reserved with room over — but padding alone
 * does not save a container that clips.
 *
 * The project header has **no component token set** in DESIGN.md: the ten sets
 * are components, and chrome is not one of them. Its values therefore come from
 * the scalar groups directly — the page ground it already sits on, spacing, and
 * the type roles its content calls for. That choice is recorded in the spec's
 * Design Notes rather than invented here silently.
 *
 * It carries **no rule line**, for two reasons that agree. There is no
 * border-width token — the only widths in the system are a signal pill's
 * stroke, the progress bar's height and the focus ring, each owned by its own
 * component — so any border here would have introduced a `1px` literal, which
 * the token rule forbids. And DESIGN.md assigns `outline-variant` to dividers
 * *inside a tile*; the header is chrome, not a tile, so borrowing it would have
 * been a misuse dressed as a token. Separation is spacing plus the tonal step
 * to the tiles below, which is what the elevation model already provides.
 */
function componentRules(): readonly string[] {
  return [
    rule('.tile, .tile-raised', [
      declaration('border-radius', 'var(--tile-border-radius)'),
      declaration('padding', 'var(--tile-padding)'),
    ]),
    rule('.tile', [declaration('background', 'var(--tile-background)')]),
    rule('.tile-raised', [declaration('background', 'var(--tile-raised-background)')]),

    // The label is a real heading, so the page is traversable by structure.
    // Uppercasing is done in CSS rather than in the string, so the accessible
    // name a screen reader announces stays ordinary prose.
    rule('.tile-label', [
      typeRole('tile-label'),
      declaration('color', 'var(--tile-label-color)'),
      declaration('text-transform', 'uppercase'),
      declaration('margin', '0 0 var(--space-2)'),
    ]),

    rule('.project-header', [
      declaration('display', 'flex'),
      declaration('flex-wrap', 'wrap'),
      declaration('align-items', 'baseline'),
      declaration('gap', 'var(--space-3)'),
      declaration('padding', '0 0 var(--space-3)'),
      declaration('margin', '0 0 var(--space-5)'),
    ]),
    rule('.project-name', [typeRole('title'), declaration('margin', '0')]),
    // An absolute path is unbreakable text of unbounded length, and it is shown
    // in full because a shortened path is one the reader cannot check. So it
    // must be allowed to wrap: `min-width: 0` because a flex item will not
    // shrink below its content otherwise, and `overflow-wrap` because there is
    // no space in a path to break at. Without both, a deep path pushes the page
    // sideways — a WCAG 1.4.10 reflow failure, and the case the 200% text
    // resize proxy does not reach.
    rule('.project-path', [
      typeRole('mono'),
      declaration('color', 'var(--color-on-surface-variant)'),
      declaration('min-width', '0'),
      declaration('overflow-wrap', 'anywhere'),
    ]),
    // Pushed to the end of the header, and given the label role rather than
    // inheriting body text: it is a control, not prose. `button-primary` is what
    // DESIGN.md assigns a surface's single main action, and that component
    // belongs to a later story — so this is deliberately a plain link for now,
    // styled only enough to read as the control it is.
    rule('.project-refresh', [
      typeRole('body-dense'),
      declaration('margin-inline-start', 'auto'),
    ]),
    rule('.project-signal', [
      typeRole('mono-badge'),
      declaration('color', 'var(--color-on-surface-variant)'),
      declaration('text-transform', 'uppercase'),
    ]),
    // Secondary colour, not the faint role: `on-surface-faint` is reserved for
    // an absent core artifact and is 0.04 above its contrast floor. A stated
    // reason is ordinary secondary text, not an absence.
    rule('.tile-empty', [declaration('color', 'var(--color-on-surface-variant)')]),

    // One column, deliberately, and not yet the dashboard's layout. The grid's
    // column behaviour and the 900px collapse are UX-DR22, owned by the story
    // that has more than one tile to place; inventing a `minmax()` track here
    // would need a width token the system does not define. What this rule is
    // for now is the gap and the flow, so tiles are already spaced correctly
    // when the columns arrive. Recorded in `deferred-work.md`.
    rule('.tile-grid', [
      declaration('display', 'grid'),
      declaration('grid-template-columns', '1fr'),
      declaration('gap', 'var(--space-tile-gap)'),
      declaration('margin', 'var(--space-4) 0 0'),
    ]),
  ];
}

/**
 * `prefers-reduced-motion: reduce`, honoured from the outset.
 *
 * Nothing in Story 1.2 animates, so this block suppresses nothing today — and
 * that is the reason to write it now rather than later. The alternative is a
 * story that adds refresh progress and a story that remembers to make it
 * respectful, and the second one is the one that gets skipped.
 *
 * `!important` is deliberate. The whole point is that a rule written later,
 * more specifically, in a component file, cannot outrank the reader's stated
 * preference. `transition` goes too, not just `animation`: DESIGN.md's reduced
 * behaviour is *"determinate progress updates in discrete steps"*, and a
 * transition on the fill would smooth those steps back into an animation.
 */
function reducedMotionBlock(): string {
  const body = rule('*, *::before, *::after', [
    declaration('animation', 'none !important'),
    declaration('transition', 'none !important'),
  ])
    .split('\n')
    .map((line) => `${INDENT}${line}`)
    .join('\n');
  return `@media (prefers-reduced-motion: reduce) {\n${body}\n}`;
}

/** The stylesheet, built once. Pure, so building it once is safe. */
function build(): string {
  return (
    [rootBlock(), ...baseRules(), ...componentRules(), reducedMotionBlock()].join('\n\n') + '\n'
  );
}

/**
 * The whole stylesheet, as text ready to inline.
 *
 * Built at module load because it is a pure function of a frozen data module;
 * there is nothing per-request about it, and rebuilding it on every `GET /`
 * would be work with no input that could have changed.
 */
export const STYLESHEET = build();

/**
 * The `:root` block on its own, and everything after it.
 *
 * Exposed because the two halves answer to different rules and a test that
 * cannot separate them cannot state either: literals are *expected* inside
 * `:root` — that block is where the token values live — and forbidden
 * everywhere else. A single regex over the whole sheet could only ever assert
 * the weaker of the two.
 */
export function splitStylesheet(css: string = STYLESHEET): {
  readonly root: string;
  readonly rules: string;
} {
  const end = css.indexOf('\n}');
  if (!css.startsWith(':root {') || end === -1) {
    throw new Error('the stylesheet must open with a :root block');
  }
  return { root: css.slice(0, end + 2), rules: css.slice(end + 2) };
}
