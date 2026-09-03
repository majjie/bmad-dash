/**
 * The emitted stylesheet, held to the rules the token layer exists to enforce.
 *
 * The fidelity test next door proves the module says what DESIGN.md says. That
 * is only half of it: a faithful module nothing resolves through is still a
 * document that lies the moment someone types a hex. So this file asserts the
 * properties that make the layer load-bearing rather than decorative —
 *
 *   - every token that has a CSS value is emitted, and the ones that are not
 *     are named with a reason rather than quietly dropped;
 *   - no colour or size literal appears in any rule, only inside `:root` where
 *     the token values live by definition;
 *   - no shadow, gradient or blur appears anywhere, because elevation is tonal
 *     and a tile's tone is its edge;
 *   - all three type floors hold, against the classification rather than against
 *     the numbers, since `mono` at 12px is below `body-dense` and correct — and
 *     each role is pinned to its class, so relabelling one to make it legal
 *     fails instead of passing;
 *   - `prefers-reduced-motion: reduce` suppresses animation, and nothing
 *     animates outside that block in the first place.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  colors,
  typography,
  motion,
  rounded,
  spacing,
  components,
  TYPE_FLOOR_CLASS,
  CONTENT_FLOOR_ROLE,
  MACHINE_FLOOR_ROLE,
  flatTokens,
  type TypeRoleName,
} from '../../src/render/tokens.ts';
import {
  STYLESHEET,
  PROSE_TOKENS,
  EMITTED_COMPONENTS,
  roleReference,
  customProperties,
  customPropertyName,
  cssValue,
  splitStylesheet,
  typeRole,
  unemittedTokens,
  BREAKPOINT_PX,
} from '../../src/render/stylesheet.ts';

const { root: ROOT_BLOCK, rules: RULES } = splitStylesheet();

/** DESIGN.md, which owns the breakpoint value. Read-only, never edited to match. */
const DESIGN_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '_bmad-output',
  'planning-artifacts',
  'ux-designs',
  'ux-bmad-2026-08-28',
  'DESIGN.md',
);

/** Colour written as a value rather than resolved through a token. */
const COLOUR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\s*\(/;

/**
 * A number carrying a unit. `0` on its own is deliberately not a literal in
 * this sense: it is the same length in every design system there has ever been,
 * and a `--space-zero` token would be ceremony rather than a decision.
 */
const DIMENSION_LITERAL =
  /(?<![\w-])\d*\.?\d+\s*(?:px|rem|em|ch|ex|vh|vw|vmin|vmax|pt|pc|in|cm|mm|q)\b/i;

/** Depth by anything other than tone. */
const NON_TONAL_DEPTH = /box-shadow|text-shadow|drop-shadow|gradient|blur|backdrop-filter/i;

/** Declarations inside a block, as `[property, value]`. */
function declarations(block: string): readonly [string, string][] {
  const found: [string, string][] = [];
  for (const line of block.split('\n')) {
    const parsed = /^\s{2}([-a-zA-Z][-a-zA-Z0-9]*):\s*(.+);$/.exec(line);
    if (parsed === null) continue;
    found.push([parsed[1] ?? '', parsed[2] ?? '']);
  }
  return found;
}

/** A CSS length in px. Only the units the type roles actually use. */
function toPx(value: string): number {
  const parsed = /^(\d*\.?\d+)(px|rem)$/.exec(value.trim());
  assert.ok(parsed !== null, `not a px or rem length: ${value}`);
  const magnitude = Number(parsed?.[1]);
  return parsed?.[2] === 'rem' ? magnitude * 16 : magnitude;
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

test('every colour token is emitted as a custom property', () => {
  const emitted = new Map(customProperties().map((p) => [p.token, p]));
  for (const name of Object.keys(colors)) {
    const property = emitted.get(`colors.${name}`);
    assert.ok(property !== undefined, `colors.${name} is not emitted`);
    assert.equal(property.name, `--color-${name}`);
    assert.ok(
      ROOT_BLOCK.includes(`  --color-${name}: ${colors[name as keyof typeof colors]};`),
      `--color-${name} is missing from :root`,
    );
  }
});

test('every field of every type role is emitted, and only the fields that exist', () => {
  const emitted = new Set(customProperties().map((p) => p.name));
  for (const [role, fields] of Object.entries(typography)) {
    for (const field of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight']) {
      const property = `--type-${role}-${field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      assert.ok(emitted.has(property), `${property} is not emitted`);
    }
    const spacingProperty = `--type-${role}-letter-spacing`;
    assert.equal(
      emitted.has(spacingProperty),
      'letterSpacing' in fields,
      `${spacingProperty} must be emitted exactly when DESIGN.md declares one`,
    );
  }
});

test('every spacing, radius and CSS motion token is emitted', () => {
  const emitted = new Set(customProperties().map((p) => p.token));
  for (const key of Object.keys(spacing)) assert.ok(emitted.has(`spacing.${key}`), key);
  for (const key of Object.keys(rounded)) assert.ok(emitted.has(`rounded.${key}`), key);
  for (const key of Object.keys(motion)) {
    if (PROSE_TOKENS.includes(`motion.${key}`)) continue;
    assert.ok(emitted.has(`motion.${key}`), key);
  }
  // The frontmatter key `DEFAULT` must not become `-d-e-f-a-u-l-t`.
  assert.ok(ROOT_BLOCK.includes(`  --radius-default: ${rounded.DEFAULT};`));
  assert.ok(ROOT_BLOCK.includes(`  --space-page-margin: ${spacing['page-margin']};`));
});

test('the focus ring is emitted, with its references resolved to var()', () => {
  assert.ok(ROOT_BLOCK.includes('  --focus-ring-color: var(--color-focus-ring);'));
  assert.ok(ROOT_BLOCK.includes(`  --focus-ring-width: ${components['focus-ring'].width};`));
  assert.ok(ROOT_BLOCK.includes(`  --focus-ring-offset: ${components['focus-ring'].offset};`));
  assert.ok(
    ROOT_BLOCK.includes('  --focus-ring-inner-stroke-on-filled: var(--color-focus-ring-on-primary);'),
  );
});

test('every unemitted token is held for one of exactly three stated reasons', () => {
  const held = unemittedTokens();
  const byReason = (reason: string) => held.filter((t) => t.reason === reason).map((t) => t.token);

  assert.deepEqual(byReason('prose, not a CSS value').sort(), [...PROSE_TOKENS].sort());

  // Role references: a token naming a whole type role cannot be one property,
  // because a role is five declarations and `:root` emits each separately.
  // Emitting one would produce a var() naming a property that does not exist.
  const roles = byReason('type role reference; applied as declarations');
  assert.ok(roles.length > 0, 'the role-reference category must not be empty');
  for (const token of roles) {
    const raw = flatTokens().get(token);
    assert.ok(raw !== undefined && roleReference(raw) !== null, `${token} is not a role reference`);
    assert.ok(
      Object.keys(typography).includes(roleReference(raw ?? '') ?? ''),
      `${token} names ${String(roleReference(raw ?? ''))}, which is not a type role`,
    );
  }

  const deferred = new Set(
    byReason('component token; a later story owns the component').map((t) => t.split('.')[1]),
  );
  assert.deepEqual(
    [...deferred].sort(),
    [
      'activity-row',
      'button-ghost',
      'button-primary',
      'core-artifact-card',
      'evidence-badge',
      'refresh-progress',
      'signal-pill',
    ],
    'only the component sets a later story owns may be held back',
  );
  for (const emitted of EMITTED_COMPONENTS) {
    assert.ok(!deferred.has(emitted), `${emitted} is emitted, not held back`);
  }

  // Nothing is lost: every token is either emitted or on this list, and the
  // three reasons above account for all of it.
  assert.equal(customProperties().length + held.length, flatTokens().size);
  assert.equal(
    byReason('prose, not a CSS value').length + roles.length + byReason('component token; a later story owns the component').length,
    held.length,
    'an unemitted token carries a reason outside the three stated categories',
  );
});

test('the containers this story owns are emitted, and their references resolve', () => {
  const emitted = new Map(customProperties().map((p) => [p.token, p]));
  for (const [token, expected] of [
    ['components.tile.background', 'var(--color-surface-container-low)'],
    ['components.tile.borderRadius', 'var(--radius-lg)'],
    ['components.tile.padding', 'var(--space-tile-padding)'],
    ['components.tile.labelColor', 'var(--color-on-surface-variant)'],
    ['components.tile-raised.background', 'var(--color-surface-container-high)'],
  ] as const) {
    const property = emitted.get(token);
    assert.ok(property !== undefined, `${token} is not emitted`);
    assert.equal(property.value, expected, `${token} resolved to ${property.value}`);
  }
  // The one tile token that is a role reference, deliberately absent.
  assert.equal(emitted.get('components.tile.labelType'), undefined);
});

test('tile-raised sits exactly one elevation level above tile', () => {
  // DESIGN.md's peer levels are 0 = surface, 1 = surface-container-low,
  // 2 = surface-container-high. `surface-container` is not a peer level, so one
  // *level* of lift is two *tones* on the five-tone ladder. Asserting the tone
  // gap without saying which is meant is how "one step" became ambiguous in the
  // first place.
  const PEER_LEVELS = ['surface', 'surface-container-low', 'surface-container-high'] as const;
  const toneOf = (reference: string) => reference.replace('{colors.', '').replace('}', '');

  const base = toneOf(components.tile.background);
  const raised = toneOf(components['tile-raised'].background);

  assert.equal(PEER_LEVELS.indexOf(base as (typeof PEER_LEVELS)[number]), 1, 'a tile is level 1');
  assert.equal(PEER_LEVELS.indexOf(raised as (typeof PEER_LEVELS)[number]), 2, 'a raised tile is level 2');
  // Upward, by hex ordering — which for six-digit uppercase hex agrees with
  // numeric ordering. Luminance monotonicity of the whole ladder is asserted
  // properly in `contrast.test.ts`; this is only a local sanity check.
  assert.ok(colors[raised as keyof typeof colors] > colors[base as keyof typeof colors]);
});

test('the two containers differ only in tone', () => {
  // Same padding, same radius: that is what makes elevation *tonal*. A raised
  // tile that also changed shape would be a second variable.
  assert.equal(components['tile-raised'].borderRadius, components.tile.borderRadius);
  assert.equal(components['tile-raised'].padding, components.tile.padding);
  assert.notEqual(components['tile-raised'].background, components.tile.background);
});

test('custom property names are unique, so no token silently overwrites another', () => {
  const names = customProperties().map((p) => p.name);
  assert.deepEqual(names.length, new Set(names).size, 'duplicate custom property name');
});

test('the emitter refuses to name a token it has no naming rule for', () => {
  assert.throws(() => customPropertyName('components.activity-row.paddingY'), /no custom property/);
  assert.throws(() => customPropertyName('elevation.level-2'), /no custom property/);
  assert.throws(() => customPropertyName('colors'), /no custom property/);
});

test('a reference resolves to var(), a literal passes through', () => {
  assert.equal(cssValue('{colors.primary}'), 'var(--color-primary)');
  assert.equal(cssValue('{spacing.tile-padding}'), 'var(--space-tile-padding)');
  assert.equal(cssValue('2px'), '2px');
  assert.equal(cssValue('transparent'), 'transparent');
});

// ---------------------------------------------------------------------------
// No literal escapes the tokens
// ---------------------------------------------------------------------------

test(':root carries exactly the emitted tokens, plus the polarity declaration', () => {
  const declared = declarations(ROOT_BLOCK);
  const custom = declared.filter(([property]) => property.startsWith('--'));
  const other = declared.filter(([property]) => !property.startsWith('--'));

  assert.deepEqual(other, [['color-scheme', 'dark']], ':root may declare no other plain property');
  assert.deepEqual(
    custom.map(([property, value]) => `${property}: ${value}`),
    customProperties().map((p) => `${p.name}: ${p.value}`),
    ':root must be exactly the emitted properties, in order',
  );
});

test('no rule outside :root carries a colour literal', () => {
  const offending = RULES.split('\n').filter((line) => COLOUR_LITERAL.test(line));
  assert.deepEqual(offending, [], 'every colour must resolve through a token');
});

/**
 * The one dimension literal permitted outside `:root`, and why.
 *
 * `var()` is invalid in a media-query condition, so the 900px breakpoint cannot
 * resolve through a custom property — a `@media (min-width: var(--…))` is a
 * query the browser drops in silence, which is the same class of failure the
 * role-reference guard in `stylesheet.ts` exists to prevent. The value is
 * pinned against DESIGN.md by its own test below, so this exemption is one
 * line rather than a loosened rule.
 */
const BREAKPOINT_LINE = `@media (min-width: ${String(BREAKPOINT_PX)}px) {`;

test('no rule outside :root carries a dimension literal', () => {
  const offending = RULES.split('\n').filter(
    (line) => DIMENSION_LITERAL.test(line) && line !== BREAKPOINT_LINE,
  );
  assert.deepEqual(offending, [], 'every size must resolve through a token');
  // And the exemption may not outlive the line it exempts: a breakpoint block
  // that was renamed or removed would leave this passing vacuously.
  assert.ok(RULES.includes(BREAKPOINT_LINE), 'the breakpoint block must be in the sheet');
});

test('the breakpoint is DESIGN.md own value, read out of the document', async () => {
  // DESIGN.md says of it that "this file owns only the breakpoint value", and
  // states it in prose rather than in the frontmatter the fidelity test
  // compares — so it is read from the prose here. A literal in this file that
  // merely happened to match would be a second copy of one belief, which is the
  // drift this project already corrects at three other sites.
  const design = await readFile(DESIGN_PATH, 'utf8');
  const stated = /one breakpoint at (\d+)px/.exec(design);
  assert.ok(stated !== null, 'DESIGN.md must state the breakpoint value');
  assert.equal(BREAKPOINT_PX, Number(stated?.[1]));
});

test('the tile grid is one column below the breakpoint and two above it', () => {
  // UX-DR22. Written as `min-width`, so the single column is the base rule and
  // the collapse needs no rule of its own: below the breakpoint nothing applies
  // and the grid is one column in document order.
  const grid = /^\.tile-grid \{\n([\s\S]*?)\n\}/m.exec(RULES);
  assert.ok(grid !== null, 'the sheet must carry a .tile-grid rule');
  assert.match(grid?.[1] ?? '', /grid-template-columns: 1fr;/);
  const block = new RegExp(
    `@media \\(min-width: ${String(BREAKPOINT_PX)}px\\) \\{\n([\\s\\S]*?)\n\\}`,
  ).exec(RULES);
  assert.ok(block !== null, 'the sheet must carry the breakpoint block');
  assert.match(block?.[1] ?? '', /\.tile-grid \{/);
  // `minmax(0, 1fr)` and not a bare `1fr`: a bare fraction is `minmax(auto,
  // 1fr)`, and a column holding an unbreakable artifact path would refuse to
  // shrink below its content and push the page sideways — WCAG 1.4.10.
  assert.match(block?.[1] ?? '', /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
});

test('the page ground and text colour resolve through tokens, not literals', () => {
  assert.match(RULES, /^html \{$/m);
  assert.ok(RULES.includes('background: var(--color-surface);'));
  assert.ok(RULES.includes('color: var(--color-on-surface);'));
  assert.ok(RULES.includes('padding: var(--space-page-margin);'));
  // The ground is the graphite token, and the token is not black.
  assert.equal(colors.surface, '#121617');
  assert.notEqual(colors.surface.toLowerCase(), '#000000');
});

test('the type roles reach the elements that carry them', () => {
  for (const [selector, role] of [
    ['html', 'body'],
    ['h1', 'display'],
    ['h2, h3', 'title'],
    ['p', 'body'],
    ['code, kbd, samp, pre', 'mono'],
    // The four use sites this story added. Deleting every `typeRole()` call
    // from `componentRules()` passed all 263 tests before these four lines:
    // the header rendered filesystem paths in the body font, losing the
    // monospacing UX-DR3 requires for any string originating from the
    // filesystem, and the tile label lost its 11px label role.
    ['.tile-label', 'tile-label'],
    ['.project-name', 'title'],
    ['.project-path', 'mono'],
    ['.project-signal', 'mono-badge'],
    ['.project-refresh', 'body-dense'],
  ] as const) {
    const block = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{\\n([\\s\\S]*?)\\n\\}`, 'm').exec(RULES);
    assert.ok(block !== null, `no rule for ${selector}`);
    assert.ok(
      (block[1] ?? '').includes(`font-size: var(--type-${role}-font-size);`),
      `${selector} must carry the ${role} role`,
    );
  }
});

test('the stylesheet declares no font fetch of any kind', () => {
  assert.doesNotMatch(STYLESHEET, /@font-face|@import|url\s*\(/i);
  assert.doesNotMatch(STYLESHEET, /https?:/i);
});

test('the stylesheet is safe to inline in a style element', () => {
  assert.ok(!STYLESHEET.includes('<'), 'a "<" cannot be escaped inside <style>');
});

// ---------------------------------------------------------------------------
// Tonal elevation only
// ---------------------------------------------------------------------------

test('no shadow, gradient or blur appears anywhere in the stylesheet', () => {
  const offending = STYLESHEET.split('\n').filter((line) => NON_TONAL_DEPTH.test(line));
  assert.deepEqual(offending, [], 'elevation is tonal: a tile’s tone is its edge');
});

test('no token invites non-tonal depth either', () => {
  for (const [token, value] of flatTokens()) {
    assert.doesNotMatch(value, NON_TONAL_DEPTH, `${token} carries a non-tonal depth value`);
  }
});

// ---------------------------------------------------------------------------
// The three type floors
// ---------------------------------------------------------------------------

test('every type role is classified into exactly one floor class', () => {
  assert.deepEqual(Object.keys(TYPE_FLOOR_CLASS).sort(), Object.keys(typography).sort());
  for (const [role, floorClass] of Object.entries(TYPE_FLOOR_CLASS)) {
    assert.ok(
      floorClass === 'content' || floorClass === 'machine' || floorClass === 'label',
      `${role}: ${floorClass}`,
    );
  }
  // All three classes are populated. An empty class lets the floor it guards
  // pass vacuously — which is how `mono` was legal as a "label".
  assert.deepEqual([...new Set(Object.values(TYPE_FLOOR_CLASS))].sort(), ['content', 'label', 'machine']);
});

test('no content role sits below body-dense', () => {
  const floor = toPx(typography[CONTENT_FLOOR_ROLE].fontSize);
  assert.equal(floor, 13, 'the content floor is body-dense at 13px');
  for (const [role, floorClass] of Object.entries(TYPE_FLOOR_CLASS)) {
    if (floorClass !== 'content') continue;
    const size = toPx(typography[role as TypeRoleName].fontSize);
    assert.ok(size >= floor, `content role ${role} is ${String(size)}px, below the ${String(floor)}px floor`);
  }
});

test('no machine-value role sits below the 12px floor', () => {
  const floor = toPx(typography[MACHINE_FLOOR_ROLE].fontSize);
  assert.equal(floor, 12, 'the machine-value floor is mono at 12px');
  const machine = Object.entries(TYPE_FLOOR_CLASS).filter(([, c]) => c === 'machine');
  assert.ok(machine.length > 0, 'the machine class must not be empty');
  for (const [role] of machine) {
    const size = toPx(typography[role as TypeRoleName].fontSize);
    assert.ok(size >= floor, `machine role ${role} is ${String(size)}px, below ${String(floor)}px`);
  }
  // This class exists because the two-class rule put the content floor at 13px
  // while defining a content-carrying role at 12px. `mono` carries file paths
  // and timestamps; calling it a label to make it legal was the fiction.
  assert.equal(TYPE_FLOOR_CLASS.mono, 'machine');
});

test('no label or badge role sits below the 11px floor', () => {
  const labels = Object.entries(TYPE_FLOOR_CLASS).filter(([, c]) => c === 'label');
  assert.ok(labels.length > 0, 'the label class must not be empty');
  const sizes = labels.map(([role]) => toPx(typography[role as TypeRoleName].fontSize));
  assert.equal(Math.min(...sizes), 11, 'the label floor is 11px');
  for (const [index, [role]] of labels.entries()) {
    assert.ok((sizes[index] ?? 0) >= 11, `label role ${role} is below 11px`);
  }
  // mono-badge sits at the floor, not below it: its text is the redundant
  // channel that keeps signal state legible without colour.
  assert.equal(toPx(typography['mono-badge'].fontSize), 11);
});

test('the smallest type in the system is 11px, in every emitted role', () => {
  const emitted = customProperties().filter((p) => p.name.endsWith('-font-size'));
  assert.equal(emitted.length, Object.keys(typography).length);
  for (const property of emitted) {
    assert.ok(toPx(property.value) >= 11, `${property.name} is ${property.value}`);
  }
});

// ---------------------------------------------------------------------------
// Reduced motion, honoured from the outset
// ---------------------------------------------------------------------------

test('prefers-reduced-motion: reduce suppresses animation and transition', () => {
  const block = /@media \(prefers-reduced-motion: reduce\) \{\n([\s\S]*)\n\}\n?$/.exec(STYLESHEET);
  assert.ok(block !== null, 'the stylesheet must carry a prefers-reduced-motion block');
  const body = block[1] ?? '';
  assert.match(body, /\*, \*::before, \*::after \{/);
  assert.match(body, /animation: none !important;/);
  assert.match(body, /transition: none !important;/);
});

test('nothing animates outside the reduced-motion block, so there is nothing to retrofit', () => {
  const beforeMedia = STYLESHEET.slice(0, STYLESHEET.indexOf('@media'));
  assert.doesNotMatch(beforeMedia, /@keyframes/);
  assert.doesNotMatch(beforeMedia, /^\s*animation(-[a-z]+)?:/m);
  assert.doesNotMatch(beforeMedia, /^\s*transition(-[a-z]+)?:/m);
  // The one v1 animation is refresh progress, and its duration is a token
  // waiting for Story 1.3 rather than a rule here.
  assert.equal(motion['duration-progress'], '900ms');
  assert.equal(motion['duration-focus'], '0ms');
});

// ---------------------------------------------------------------------------
// The rules side
//
// Everything above this line questions `:root`. That was the hole: a sheet can
// define every token correctly and draw nothing with them. Three mutations
// passed the whole suite before these tests existed — deleting the
// `:focus-visible` rule outright, pointing a `var()` at a property `:root`
// never emits, and relabelling a content role as a label. All three are
// silent in CSS: an unresolvable `var()` drops its entire declaration without
// an error anywhere.
// ---------------------------------------------------------------------------

/** The body of one rule, by exact selector. Fails rather than returning empty. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`^${escaped} \\{\\n([\\s\\S]*?)\\n\\}`, 'm').exec(STYLESHEET);
  assert.ok(found !== null, `the stylesheet declares no rule for \`${selector}\``);
  return found?.[1] ?? '';
}

/** Every custom property a `var()` anywhere in the sheet asks for. */
function referencedProperties(css: string): readonly string[] {
  return [...css.matchAll(/var\(\s*(--[-a-zA-Z0-9]+)/g)].map((m) => m[1] ?? '');
}

test('every var() in the stylesheet names a property :root actually emits', () => {
  const emitted = new Set(customProperties().map((p) => p.name));
  const dangling = [...new Set(referencedProperties(STYLESHEET))].filter((name) => !emitted.has(name));
  assert.deepEqual(
    dangling,
    [],
    'an unresolvable var() drops its whole declaration silently — CSS reports nothing',
  );
});

test('the rules do reference the tokens, so the closure above is not vacuous', () => {
  // A sheet with no var() at all satisfies the test above perfectly.
  const referenced = new Set(referencedProperties(RULES));
  assert.ok(referenced.size >= 20, `only ${String(referenced.size)} properties are referenced by any rule`);
  for (const property of ['--color-surface', '--color-on-surface', '--space-page-margin']) {
    assert.ok(referenced.has(property), `no rule resolves ${property}`);
  }
});

/**
 * The rules that must exist, and what each must declare.
 *
 * Positive assertions, deliberately. The negative ones — no literal, no
 * shadow, no animation outside the media block — are all satisfied by an empty
 * stylesheet, so on their own they cannot tell a correct sheet from a missing
 * one.
 */
const REQUIRED_RULES: readonly (readonly [string, readonly string[]])[] = [
  ['*, *::before, *::after', ['box-sizing: border-box']],
  ['html', ['background: var(--color-surface)', 'color: var(--color-on-surface)']],
  ['body', ['margin: 0', 'padding: var(--space-page-margin)']],
  ['h1', ['font-size: var(--type-display-font-size)']],
  ['h2, h3', ['font-size: var(--type-title-font-size)']],
  ['p', ['font-size: var(--type-body-font-size)']],
  ['code, kbd, samp, pre', ['font-family: var(--type-mono-font-family)']],
  // The containers this story adds. Listed here for the same reason as the
  // rest: a rule that exists only in a token is a rule nothing draws.
  ['.tile, .tile-raised', ['border-radius: var(--tile-border-radius)', 'padding: var(--tile-padding)']],
  ['.tile', ['background: var(--tile-background)']],
  ['.tile-raised', ['background: var(--tile-raised-background)']],
  ['.tile-label', ['color: var(--tile-label-color)', 'text-transform: uppercase']],
  ['.tile-empty', ['color: var(--color-on-surface-variant)']],
  ['.project-header', ['display: flex', 'gap: var(--space-3)']],
  ['.project-name', ['margin: 0']],
  ['.project-path', ['color: var(--color-on-surface-variant)', 'overflow-wrap: anywhere', 'min-width: 0']],
  ['.project-signal', ['text-transform: uppercase']],
  ['.project-refresh', ['margin-inline-start: auto']],
  ['.tile-grid', ['display: grid', 'gap: var(--space-tile-gap)']],
  // The one that a reviewer deleted whole while the suite stayed green.
  [
    ':focus-visible',
    ['outline: var(--focus-ring-width) solid var(--focus-ring-color)', 'outline-offset: var(--focus-ring-offset)'],
  ],
];

test('every required rule is present and declares what it exists to declare', () => {
  for (const [selector, required] of REQUIRED_RULES) {
    const body = ruleBody(selector);
    for (const declared of required) {
      assert.ok(
        body.includes(`  ${declared};`),
        `\`${selector}\` must declare \`${declared}\` — found:\n${body}`,
      );
    }
  }
});

test('focus is visible: the ring is drawn, not merely defined', () => {
  const body = ruleBody(':focus-visible');
  assert.match(body, /outline:\s*var\(--focus-ring-width\) solid var\(--focus-ring-color\);/);
  // `outline: none` and a zero width are the two ways to define a ring and
  // draw nothing. Both are conformance failures (WCAG 2.4.7), not style choices.
  assert.doesNotMatch(body, /outline:\s*(none|0)\b/);
  assert.notEqual(components['focus-ring'].width, '0');
  assert.notEqual(components['focus-ring'].width, '0px');
  // Instant, per `motion.duration-focus`: a delayed ring is worse than none.
  assert.equal(motion['duration-focus'], '0ms');
});

test('a link is distinguished by more than its colour', () => {
  const body = ruleBody('a');
  // `primary` on `on-surface` is 1.46:1. WCAG 1.4.1 asks for a non-colour
  // channel, and DESIGN.md's own Do list says the same.
  assert.match(body, /text-decoration-line:\s*underline;/, 'colour alone cannot carry the affordance');
});

test('no emitted value is prose, so a sentence cannot corrupt :root', () => {
  for (const property of customProperties()) {
    assert.ok(!property.value.includes(';'), `${property.token} would terminate its own declaration`);
    assert.ok(!property.value.includes('}'), `${property.token} would close the :root block`);
    assert.ok(
      property.value.trim() !== '' && !/\s\w+\s\w+\s\w+\s\w+\s/.test(property.value),
      `${property.token} reads as prose, not a CSS value: ${property.value}`,
    );
  }
  // And the exemption list is not a place to hide a real token: every name on
  // it must still exist in the module.
  for (const token of PROSE_TOKENS) {
    assert.ok(flatTokens().has(token), `${token} is exempted but no longer exists`);
  }
});

test('each type role is pinned to its floor class, so relabelling one fails', () => {
  // Spelled out rather than derived. The classification cannot be recovered
  // from the sizes — that is the whole reason it exists — so the only thing
  // that can catch a reclassification is a written-down expectation.
  assert.deepEqual(
    { ...TYPE_FLOOR_CLASS },
    {
      display: 'content',
      title: 'content',
      'tile-label': 'label',
      body: 'content',
      'body-dense': 'content',
      mono: 'machine',
      'mono-badge': 'label',
      prose: 'content',
    },
    'moving a role between classes changes which floor it answers to — say so here first',
  );
  assert.equal(CONTENT_FLOOR_ROLE, 'body-dense');
  assert.equal(MACHINE_FLOOR_ROLE, 'mono');
});

// ---------------------------------------------------------------------------
// Nothing is emitted that nothing uses, and nothing is used that nothing emits
// ---------------------------------------------------------------------------

/**
 * Type roles emitted but not yet applied by any rule, each with its reason.
 *
 * A list rather than a silence. The point of the test below is that an
 * unapplied role must be a decision on the record — the same treatment
 * `unemittedTokens()` gives a token it holds back — so that "nothing uses this"
 * cannot be the accidental state it was for `prose` until someone looked.
 */
const ROLES_NOT_YET_APPLIED: readonly (readonly [string, string])[] = [
  ['prose', 'the serif reading role; the Document reader that uses it is a later epic'],
];

test('every emitted type role is applied by a rule, or held back with a reason', () => {
  // The general form of the finding this loop turned up. A role can be
  // transcribed faithfully, emitted correctly, and reach no element at all —
  // which the fidelity and emission tests both pass happily, because neither
  // looks at whether a rule uses it.
  const held = new Map(ROLES_NOT_YET_APPLIED);
  const unapplied = Object.keys(typography).filter(
    (role) => !RULES.includes(`var(--type-${role}-font-size)`),
  );
  assert.deepEqual(
    unapplied.filter((role) => !held.has(role)),
    [],
    'a type role is emitted but no rule applies it; either use it or add it to ROLES_NOT_YET_APPLIED',
  );
  // And the list may not outlive its reason: a role listed here that a rule now
  // applies is a stale exemption, which is how an exemption list rots.
  for (const [role, reason] of ROLES_NOT_YET_APPLIED) {
    assert.ok(Object.keys(typography).includes(role), `${role} is exempted but is not a role`);
    assert.ok(reason.trim() !== '', `${role} is exempted with no reason`);
    assert.ok(unapplied.includes(role), `${role} is exempted but a rule now applies it`);
  }
});

test('every class rule is exercised by some render path, and vice versa', async () => {
  // The other direction of `page.test.ts`'s `KNOWN_CLASSES` check, which only
  // asks whether each class in the markup is known. `.project-refresh` was
  // emitted in markup with zero rules in the sheet; the reverse — a rule
  // written for markup nobody emits — was equally unchecked.
  //
  // "Some render path" rather than "the page", because a component may exist
  // before a surface uses it: `.tile-raised` is styled and fully tested while
  // the Dashboard has only one tile to show and nothing to raise. Rendering
  // each component closes the loop without pretending the page uses everything.
  const { renderPage } = await import('../../src/render/page.ts');
  const { tile, tileGrid } = await import('../../src/render/components.ts');
  const { markup } = await import('../../src/render/html.ts');
  const { FULL_INVENTORY_VIEW } = await import('../support/inventory.ts');
  const rendered = [
    // The full view rather than an empty one: from Story 1.12 the inventory's
    // own classes are only emitted when there is something to list, and a
    // surface rendered empty would let a rule for an unrendered class pass this
    // check in the direction it was written to catch.
    renderPage('/tmp/bmad-dash-test-project', FULL_INVENTORY_VIEW),
    tileGrid([
      { label: 'A', content: { html: markup`<p>x</p>` }, raised: true },
      { label: 'B', content: { empty: 'Nothing yet.' } },
    ]),
    tile({ label: 'C', content: { empty: 'Nothing yet.' } }),
  ].join('\n');
  const inMarkup = new Set(
    [...rendered.matchAll(/\sclass="([^"]+)"/g)].flatMap((m) => (m[1] ?? '').split(/\s+/)),
  );
  const styled = new Set(
    [...RULES.matchAll(/^\.([-a-zA-Z0-9]+)(?:,|\s)/gm)].map((m) => m[1] ?? ''),
  );
  assert.ok(styled.size > 0, 'the sheet must carry class rules');
  for (const selector of styled) {
    assert.ok(inMarkup.has(selector), `.${selector} is styled but no markup carries it`);
  }
  for (const selector of inMarkup) {
    assert.ok(styled.has(selector), `.${selector} is rendered but nothing styles it`);
  }
});

test('a rule cannot ask for a type role that does not exist', () => {
  // `typeRole` filtered every property it could not find and returned an empty
  // string, so a typo produced a rule with no declarations and no error.
  assert.throws(() => typeRole('not-a-role'), /no emitted type role/);
  assert.throws(() => typeRole('tile_label'), /no emitted type role/);
  // And it still works for every real one, so the guard is not over-eager.
  for (const role of Object.keys(typography)) {
    assert.match(typeRole(role), /font-size: var\(--type-/, `${role} must resolve`);
  }
});
