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
 *   - both type floors hold, against the classification rather than against the
 *     numbers, since `mono` at 12px is below `body-dense` and correct;
 *   - `prefers-reduced-motion: reduce` suppresses animation, and nothing
 *     animates outside that block in the first place.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

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
  EMITTED_COMPONENT,
  customProperties,
  customPropertyName,
  cssValue,
  splitStylesheet,
  unemittedTokens,
} from '../../src/render/stylesheet.ts';

const { root: ROOT_BLOCK, rules: RULES } = splitStylesheet();

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

test('the tokens deliberately not emitted are the two prose values and Story 1.3 components', () => {
  const held = unemittedTokens();
  const prose = held.filter((t) => t.reason === 'prose, not a CSS value').map((t) => t.token);
  assert.deepEqual(prose.sort(), [...PROSE_TOKENS].sort());

  const deferred = new Set(
    held
      .filter((t) => t.token.startsWith('components.') && !prose.includes(t.token))
      .map((t) => t.token.split('.')[1]),
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
      'tile',
      'tile-raised',
    ],
    'only the component sets Story 1.3 owns may be held back',
  );
  assert.ok(!deferred.has(EMITTED_COMPONENT), 'the focus ring is emitted, not held back');

  // Nothing is lost: every token is either emitted or on this list.
  assert.equal(customProperties().length + held.length, flatTokens().size);
});

test('custom property names are unique, so no token silently overwrites another', () => {
  const names = customProperties().map((p) => p.name);
  assert.deepEqual(names.length, new Set(names).size, 'duplicate custom property name');
});

test('the emitter refuses to name a token it has no naming rule for', () => {
  assert.throws(() => customPropertyName('components.tile.background'), /no custom property/);
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

test('no rule outside :root carries a dimension literal', () => {
  const offending = RULES.split('\n').filter((line) => DIMENSION_LITERAL.test(line));
  assert.deepEqual(offending, [], 'every size must resolve through a token');
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
