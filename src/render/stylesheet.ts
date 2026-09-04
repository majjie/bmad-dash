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
 * Story 1.12 adds the inventory's own rules and UX-DR22's breakpoint block. It
 * introduces the sheet's **one** dimension literal outside `:root` — the 900px
 * media condition, which cannot be a custom property because `var()` is invalid
 * in a media query. See `BREAKPOINT_PX`.
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
 * A set rather than a single name, because Story 1.3 builds the containers and
 * Story 2.3 builds the two buttons. The remaining five — `activity-row`,
 * `core-artifact-card`, `evidence-badge`, `refresh-progress`, `signal-pill` —
 * stay transcribed in `./tokens.ts` and unemitted, so the fidelity test still
 * compares whole documents while nothing reaches a stylesheet before the story
 * that owns it — and `unemittedTokens()` names each one with its reason rather
 * than dropping it quietly.
 */
export const EMITTED_COMPONENTS: readonly string[] = [
  'tile',
  'tile-raised',
  'focus-ring',
  'button-primary',
  'button-ghost',
];

/**
 * The one breakpoint, in pixels — DESIGN.md's own value.
 *
 * **Not a token, and it cannot be one.** `var()` is invalid in a media-query
 * condition, so a custom property here would produce a query the browser drops
 * in silence, which is the exact failure mode the role-reference guard in this
 * file already exists to prevent. DESIGN.md says of the breakpoint that "this
 * file owns only the breakpoint value" and states it in prose rather than in
 * its frontmatter, so the value is held here and
 * `test/render/stylesheet.test.ts` reads it back out of DESIGN.md — the same
 * contract `SIGNAL_LABELS` and `SIGNAL_NOT_CHECKED` are held under, and the
 * reason a literal that merely happens to match is not good enough.
 *
 * It is therefore the one dimension literal permitted outside `:root`, and the
 * dimension-literal test names this line as its single exemption rather than
 * loosening the rule.
 */
export const BREAKPOINT_PX = 900;

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
    // **Every heading below the surface's own takes `title`.** DESIGN.md gives
    // eight roles and no more, so a fourth heading size would be a value
    // invented here — and from Story 2.1b a rendered document reaches `h6`,
    // because its own headings are demoted by one to leave the surface its
    // single `h1`. The alternative was letting `h4` to `h6` fall to the
    // browser's defaults, which are *smaller than body text* and would put a
    // document's deepest headings below DESIGN.md's own content floor.
    rule('h2, h3, h4, h5, h6', [typeRole('title'), declaration('margin', '0 0 var(--space-2)')]),
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

    // A tile that spans the whole grid row, at every width. For a tile whose
    // content *qualifies* the tiles after it: the inventory's scan report is
    // the case, and without this it sat beside the first family tile above the
    // breakpoint, leaving half the surface it qualifies not below it. `1 / -1`
    // is the whole row whatever the track count, so this needs no width value
    // and holds at one column as well as two.
    rule('.tile-span', [declaration('grid-column', '1 / -1')]),

    // The label is a real heading, so the page is traversable by structure.
    // Uppercasing is done in CSS rather than in the string, so the accessible
    // name a screen reader announces stays ordinary prose.
    rule('.tile-label', [
      typeRole('tile-label'),
      declaration('color', 'var(--tile-label-color)'),
      declaration('text-transform', 'uppercase'),
      declaration('margin', '0 0 var(--space-2)'),
    ]),

    // -----------------------------------------------------------------------
    // Story 2.3: the two surface action buttons
    // -----------------------------------------------------------------------
    //
    // `button-primary` is DESIGN.md's component for a surface's single main
    // action; `button-ghost` for every other one, including Refresh
    // (`.project-refresh` in `./chrome.ts`, which carries both classes). Both
    // are emitted and styled here before either has a surface consumer of its
    // own for `button-primary` — `.tile-raised`'s own precedent, noted in that
    // rule's comment: a component may be built ahead of the surface that uses
    // it, and `test/render/stylesheet.test.ts`'s round-trip corpus renders one
    // directly so the rule is exercised rather than merely defined.
    //
    // An anchor, not a `<button>`: everything on these surfaces navigates and
    // there is no client script to submit a form, so `<a>` is the honest
    // element — `./components.ts`'s `ButtonOptions` doc comment states the same
    // reasoning for the function that builds one.
    rule('.button-primary, .button-ghost', [
      typeRole('body-dense'),
      declaration('display', 'inline-flex'),
      declaration('align-items', 'center'),
      declaration('justify-content', 'center'),
      declaration('padding', 'var(--space-2) var(--space-4)'),
      // Cancels the base `a` rule's underline. A link relies on the underline
      // because colour alone fails WCAG 1.4.1 against `on-surface` — but a
      // button is not that: its fill or its border is already a non-colour
      // channel, which is what `.artifact-link` argues for the same reason one
      // rule further down this file.
      declaration('text-decoration-line', 'none'),
    ]),
    rule('.button-primary', [
      declaration('background', 'var(--button-primary-background)'),
      declaration('color', 'var(--button-primary-color)'),
      declaration('border-radius', 'var(--button-primary-border-radius)'),
    ]),
    rule('.button-ghost', [
      declaration('background', 'var(--button-ghost-background)'),
      declaration('color', 'var(--button-ghost-color)'),
      declaration('border-radius', 'var(--button-ghost-border-radius)'),
      // DESIGN.md's `button-ghost.border` token names only a colour — there is
      // no border-width token anywhere in the system, and the tile rule above
      // records why one was never added. `thin` is a CSS keyword, not a
      // dimension: it draws the hairline the token's own name promises without
      // inventing a pixel value the token layer does not own.
      declaration('border-style', 'solid'),
      declaration('border-width', 'thin'),
      declaration('border-color', 'var(--button-ghost-border)'),
    ]),
    // The filled variant's own fill is `--color-primary`, and the base
    // `:focus-visible` ring above is drawn in `--color-focus-ring` — the same
    // token value, by DESIGN.md's own frontmatter. An outer ring in that colour
    // reads as the button growing, not as a ring, which is why UX-DR13 gives
    // filled controls an inner stroke instead: `focus-ring.innerStrokeOnFilled`
    // is the dark colour that contrasts with the fill rather than matching it.
    // A negative offset the width of the ring pulls it fully inside the
    // button's own border box; nothing clips it, because nothing in this sheet
    // sets `overflow` on a button, the same invariant `test/render/components.
    // test.ts` already holds every container to.
    rule('.button-primary:focus-visible', [
      declaration('outline-color', 'var(--focus-ring-inner-stroke-on-filled)'),
      declaration('outline-offset', 'calc(var(--focus-ring-width) * -1)'),
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

    // UX-DR22, and the story that owns it is the first one with more than one
    // tile to place. One column below the breakpoint — "in reading order",
    // which is what a single grid column in document order is — and two above
    // it.
    //
    // **Two columns, and `minmax(0, 1fr)` rather than a width track.** The
    // deferred entry against Story 1.3 said a `minmax()` track needs a tile-width
    // token the system does not define, and that is still true: a `repeat(auto-fit,
    // minmax(320px, 1fr))` would put a width literal in the sheet that DESIGN.md
    // does not carry. Equal fractions need no such value. The `0` floor is the
    // load-bearing half — a bare `1fr` is `minmax(auto, 1fr)`, and a column
    // holding an unbreakable artifact path would refuse to shrink below it and
    // push the page sideways, which is the WCAG 1.4.10 reflow failure
    // `.project-path` already guards against one rule up.
    //
    // Two rather than three: at the breakpoint a third column is about 300px
    // wide, and every row on this surface leads with a deep project-relative
    // path. The count is an invention — no document specifies one — and is
    // recorded in `deferred-work.md`.
    rule('.tile-grid', [
      declaration('display', 'grid'),
      declaration('grid-template-columns', '1fr'),
      declaration('gap', 'var(--space-tile-gap)'),
      declaration('margin', 'var(--space-4) 0 0'),
    ]),

    // The inventory's own rules. No colour here encodes a state: the four
    // signal colours are a closed set, they converge under protanopia
    // (DESIGN.md:221), and the signal-pill component that would use them
    // belongs to a later story. Every state on this surface is a word, so
    // these rules carry type role and secondary colour and nothing else.
    rule('.artifact-list', [
      declaration('list-style', 'none'),
      declaration('margin', '0'),
      declaration('padding', '0'),
    ]),
    // Wrapping rather than a fixed grid: a row's cells are a path, a type and
    // however many state words apply, and a track count would either clip the
    // last of them or reserve space for states most rows do not carry.
    rule('.artifact-row', [
      declaration('display', 'flex'),
      declaration('flex-wrap', 'wrap'),
      declaration('align-items', 'baseline'),
      declaration('gap', 'var(--space-2)'),
      declaration('padding', 'var(--space-row-padding-y) 0'),
    ]),
    // Story 2.1a: an openable row is an anchor wrapping the whole row, so the
    // link's accessible name carries the row's state rather than a bare path.
    // The anchor therefore has to *be* the flex line — a plain inline anchor
    // would collapse the row's cells into one flex item and lose the wrapping
    // gap — so it repeats `.artifact-row`'s layout and grows to fill it.
    //
    // `text-decoration-line: none` here with `underline` on the path one rule
    // down, rather than the document's link rule underlining all nine cells:
    // the affordance belongs on the thing the reader scans by. It is still a
    // non-colour channel, which is what WCAG 1.4.1 asks for and why the base
    // `a` rule carries an underline at all — `primary` against `on-surface` is
    // 1.46:1, so colour alone could never carry it.
    rule('.artifact-link', [
      declaration('display', 'flex'),
      declaration('flex-wrap', 'wrap'),
      declaration('align-items', 'baseline'),
      declaration('gap', 'var(--space-2)'),
      declaration('flex', '1 1 auto'),
      declaration('min-width', '0'),
      declaration('color', 'inherit'),
      declaration('text-decoration-line', 'none'),
      // **The pointer target covers the whole row, not the row minus its
      // padding.** The row keeps its own block padding — it is the rhythm of
      // the list, and an unlinked row needs it too — so the anchor pulls its
      // box back out over that padding and puts it back as its own. Without
      // this the accessible name was the whole row while the clickable area was
      // a band inside it, which is a pointer target smaller than the thing it
      // looks like.
      declaration('margin-block', 'calc(var(--space-row-padding-y) * -1)'),
      declaration('padding-block', 'var(--space-row-padding-y)'),
    ]),
    rule('.artifact-link .artifact-path', [
      declaration('color', 'var(--color-primary)'),
      declaration('text-decoration-line', 'underline'),
      declaration('text-decoration-thickness', 'from-font'),
    ]),
    // A project-relative path is unbreakable text of unbounded length, shown in
    // full because a shortened path is one the reader cannot check — the same
    // pair of declarations, for the same reason, as `.project-path`.
    rule('.artifact-path', [
      declaration('color', 'var(--color-on-surface)'),
      declaration('min-width', '0'),
      declaration('overflow-wrap', 'anywhere'),
    ]),
    rule('.artifact-type', [
      typeRole('body-dense'),
      declaration('color', 'var(--color-on-surface-variant)'),
    ]),
    // `mono-badge` because a state word names a machine state, which is
    // DESIGN.md's semantic rule for the mono family. Not uppercased: the same
    // class carries `Not checked` and `Unreadable`, and shouting a state is
    // what the pill component's own treatment is for.
    rule('.artifact-state', [
      typeRole('mono-badge'),
      declaration('color', 'var(--color-on-surface)'),
    ]),
    rule('.artifact-stage', [
      typeRole('mono-badge'),
      declaration('color', 'var(--color-on-surface-variant)'),
    ]),
    // A sentence, so the body role rather than a badge role — and secondary,
    // because it qualifies the row rather than naming it. Never
    // `on-surface-faint`, which DESIGN.md reserves for an absent core artifact
    // and which sits 0.04 above its contrast floor.
    rule('.artifact-note', [
      typeRole('body-dense'),
      declaration('color', 'var(--color-on-surface-variant)'),
      declaration('margin', '0'),
    ]),

    // -----------------------------------------------------------------------
    // Story 2.1b: the reading surface
    // -----------------------------------------------------------------------
    //
    // `DESIGN.md:255` — "reading surfaces break the dashboard grid: a rendered
    // document uses a single column at `{spacing.reading-measure}`" — so this
    // is a column beside the tile grid rather than a tile inside it, and it is
    // the **one** place `{typography.prose}` is applied: DESIGN.md:233 says
    // IBM Plex Serif "appears in exactly one place … the body of a rendered
    // BMAD document". The contents rail that paragraph also names is Story
    // 2.10's and is deliberately absent rather than approximated.
    //
    // Headings stay in the interface family. There is no serif heading role in
    // the eight, and inventing one is exactly what this file may not do — so a
    // document's headings take `title` from the base rule above, and the shift
    // in family marks its *body*, which is what DESIGN.md's sentence says.
    rule('.artifact-content', [
      typeRole('prose'),
      declaration('max-width', 'var(--space-reading-measure)'),
      declaration('margin', 'var(--space-6) 0 0'),
    ]),
    // `p` needs its own rule and the rest do not: the base `p` rule declares a
    // family, so inheritance from the container above loses to it. `li`,
    // `blockquote`, `td` and `th` have no base rule and inherit as intended.
    rule('.artifact-content p', [typeRole('prose'), declaration('margin', '0 0 var(--space-4)')]),
    // Space *above* a heading and less below it, so a heading groups with what
    // follows it rather than floating between two sections.
    rule(
      [
        '.artifact-content h2',
        '.artifact-content h3',
        '.artifact-content h4',
        '.artifact-content h5',
        '.artifact-content h6',
      ].join(',\n'),
      [declaration('margin', 'var(--space-6) 0 var(--space-2)')],
    ),
    rule(['.artifact-content ul', '.artifact-content ol'].join(',\n'), [
      declaration('margin', '0 0 var(--space-4)'),
      declaration('padding-inline-start', 'var(--space-6)'),
    ]),
    // A code block and a non-markdown artifact get the same treatment, because
    // they are the same thing to a reader: text to be read exactly as it is.
    // Tonal, with no border — a tile's tone is its edge, and so is this one's.
    //
    // **It wraps rather than scrolling, and that pair is load-bearing.**
    // Preformatted text does not wrap by default, so a long line makes the
    // *page* scroll sideways — the WCAG 1.4.10 reflow failure `.project-path`
    // and the grid's `minmax(0, …)` floor already guard against elsewhere. The
    // obvious fix, `overflow-x: auto`, trades one conformance failure for
    // another: a scroll container clips a focus ring drawn on a child at its
    // edge, which is WCAG 2.4.11, and `test/render/components.test.ts` refuses
    // every way of clipping for exactly that reason. `pre-wrap` keeps the
    // newlines that make it preformatted while letting long lines fold, and
    // `anywhere` handles the unbreakable token — a 200-character path or a
    // minified line — that folding alone cannot.
    rule(['.artifact-content pre', '.artifact-source'].join(',\n'), [
      declaration('background', 'var(--color-surface-container-low)'),
      declaration('border-radius', 'var(--radius-md)'),
      declaration('padding', 'var(--space-3)'),
      declaration('margin', '0 0 var(--space-4)'),
      declaration('white-space', 'pre-wrap'),
      declaration('overflow-wrap', 'anywhere'),
    ]),
    rule('.artifact-content blockquote', [
      declaration('background', 'var(--color-surface-container-low)'),
      declaration('border-radius', 'var(--radius-md)'),
      declaration('padding', 'var(--space-3)'),
      declaration('margin', '0 0 var(--space-4)'),
    ]),
    // A table folds into the column rather than scrolling out of it, on `pre`'s
    // own reasoning one rule up: a wide table is the one thing in a BMAD
    // document guaranteed to exceed the reading measure — every spec in this
    // repository opens its I/O matrix as one — and a table cell is where a
    // *link* most plausibly sits, so a scroll container here is the case WCAG
    // 2.4.11 is actually about rather than a theoretical one.
    //
    // `overflow-wrap: anywhere` on the cells is what makes `width: 100%` hold:
    // it drops each cell's min-content width to one character, so the auto
    // layout can shrink the table to the column instead of being forced wider
    // by the longest unbreakable string in it. `body-dense` rather than `prose`
    // because a table is scanned, not read — the distinction DESIGN.md's own
    // three floors are built on.
    rule('.artifact-content table', [
      declaration('width', '100%'),
      declaration('border-collapse', 'collapse'),
      declaration('margin', '0 0 var(--space-4)'),
    ]),
    rule(['.artifact-content th', '.artifact-content td'].join(',\n'), [
      typeRole('body-dense'),
      declaration('padding', 'var(--space-2) var(--space-3)'),
      declaration('text-align', 'start'),
      declaration('vertical-align', 'baseline'),
      declaration('overflow-wrap', 'anywhere'),
    ]),
    // Tone, not rules between cells. A header row and alternating body rows are
    // the two separations a table needs, and both are one elevation step —
    // which is the whole vocabulary this system has for separation.
    rule(
      ['.artifact-content thead th', '.artifact-content tbody tr:nth-child(even)'].join(',\n'),
      [declaration('background', 'var(--color-surface-container-low)')],
    ),
    // An image in a project's document is not fetched — `default-src 'none'`
    // refuses it — so what this bounds is the alt text's box and any image a
    // future story does serve. Relative, because a fixed width would be a
    // literal and would break reflow at 320px.
    rule('.artifact-content img', [declaration('max-width', '100%')]),
    // `Empty file.` and the in-place failure. Both are the tool speaking rather
    // than the document, so both leave the serif behind and take the interface
    // body role, and both are secondary: they qualify the absent content rather
    // than being it. Never `on-surface-faint`, which DESIGN.md reserves for an
    // absent core artifact and which sits 0.04 above its contrast floor.
    rule(['.artifact-empty', '.artifact-failure'].join(',\n'), [
      typeRole('body'),
      declaration('color', 'var(--color-on-surface-variant)'),
      declaration('margin', '0'),
    ]),
  ];
}

/**
 * UX-DR22's single breakpoint: the tile grid gains its second column above it.
 *
 * Written as `min-width` rather than `max-width` so the single column is the
 * base rule and the wider layout is the addition. That ordering is the reason
 * the collapse needs no separate rule: below the breakpoint nothing applies and
 * the grid is one column in document order, which is `EXPERIENCE.md:220`'s
 * "one column in reading order". That paragraph's collapse *order* names
 * recent activity, core artifacts and risk summary — three tiles that do not
 * exist yet — so the order it specifies cannot be implemented here and is
 * recorded in `deferred-work.md` rather than approximated.
 *
 * The one dimension literal outside `:root`; see `BREAKPOINT_PX`.
 */
function breakpointBlock(): string {
  const body = rule('.tile-grid', [
    declaration('grid-template-columns', 'repeat(2, minmax(0, 1fr))'),
  ])
    .split('\n')
    .map((line) => `${INDENT}${line}`)
    .join('\n');
  return `@media (min-width: ${String(BREAKPOINT_PX)}px) {\n${body}\n}`;
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
    [
      rootBlock(),
      ...baseRules(),
      ...componentRules(),
      breakpointBlock(),
      reducedMotionBlock(),
    ].join('\n\n') + '\n'
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
