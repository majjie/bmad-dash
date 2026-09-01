/**
 * DESIGN.md's contrast claims, recomputed.
 *
 * The file states nine ratios in prose and asserts, in its Conformance record,
 * that *"every ratio in this file comes from the WCAG relative-luminance and
 * contrast-ratio formulas, applied to the frontmatter hex values"*. Until this
 * file existed that was a claim about a claim: the ratios were correct on the
 * day they were computed, and one hex edit anywhere in the frontmatter would
 * have made the document false with nothing going red — the same failure the
 * token fidelity test exists to prevent for the values themselves.
 *
 * DESIGN.md's own rule says so out loud: *"Don't re-reason a colour change.
 * Recompute the ratios."* This is that recomputation, run on every commit.
 *
 * Two halves, and both are needed:
 *
 *   1. **The structural rules** — every text pairing the system actually uses
 *      clears 4.5:1, every boundary and the focus indicator clear 3:1. These
 *      hold whatever DESIGN.md's prose says, so they catch a hex that breaks
 *      conformance even in a pairing nobody wrote a sentence about.
 *   2. **The stated numbers** — each figure quoted in the prose is recomputed
 *      from the tokens *and* checked to still appear in the file. A changed
 *      token fails the first check; a rewritten sentence fails the second.
 *
 * Thresholds are WCAG 2.2: 4.5:1 for text (every type role sits below the
 * large-text boundary of 18pt / 14pt bold, so none qualifies for 3:1), and 3:1
 * for UI component boundaries, graphical objects and focus indicators.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { colors, type ColorName } from '../../src/render/tokens.ts';

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

const TEXT_THRESHOLD = 4.5;
const UI_THRESHOLD = 3;

/** WCAG 2.x relative luminance of an sRGB hex colour. */
function relativeLuminance(hex: string): number {
  const parsed = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  assert.ok(parsed !== null, `not a six-digit hex colour: ${hex}`);
  const digits = parsed?.[1] ?? '';
  const [r, g, b] = [0, 2, 4].map((offset) => {
    const channel = parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two token colours, lighter over darker. */
function contrast(a: ColorName, b: ColorName): number {
  const [lighter, darker] = [relativeLuminance(colors[a]), relativeLuminance(colors[b])].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Two decimal places, the precision DESIGN.md quotes. */
function quoted(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

/** The tonal ladder, every level a text colour may land on. */
const LADDER: readonly ColorName[] = [
  'surface',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
];

// ---------------------------------------------------------------------------
// The formula itself
// ---------------------------------------------------------------------------

test('the contrast formula is right, against the two ratios that need no tokens', () => {
  // Black on white is exactly 21:1 and white on white exactly 1:1. A formula
  // that gets these wrong makes every number below wrong in the same direction,
  // which is the one way this whole file could agree with itself and be useless.
  assert.equal(relativeLuminance('#FFFFFF'), 1);
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(((1 + 0.05) / (0 + 0.05)).toFixed(0), '21');
});

// ---------------------------------------------------------------------------
// Structural: the pairings the system uses
// ---------------------------------------------------------------------------

test('body text clears 4.5:1 on every level of the tonal ladder', () => {
  for (const surface of LADDER) {
    const ratio = contrast('on-surface', surface);
    assert.ok(ratio >= TEXT_THRESHOLD, `on-surface on ${surface} is ${quoted(ratio)}`);
  }
});

test('secondary and metadata text clears 4.5:1 on every level of the ladder', () => {
  for (const surface of LADDER) {
    const ratio = contrast('on-surface-variant', surface);
    assert.ok(ratio >= TEXT_THRESHOLD, `on-surface-variant on ${surface} is ${quoted(ratio)}`);
  }
});

test('the faint role clears 4.5:1 even at its worst pairing, with no margin to spare', () => {
  const worst = Math.min(...LADDER.map((surface) => contrast('on-surface-faint', surface)));
  assert.ok(worst >= TEXT_THRESHOLD, `on-surface-faint bottoms out at ${quoted(worst)}`);
  // DESIGN.md calls this "deliberately close to the floor" and forbids stacking
  // opacity on it. The margin is 0.04 — worth failing loudly about if a future
  // token edit eats it, rather than discovering it in an audit.
  assert.ok(
    worst - TEXT_THRESHOLD < 0.1,
    `the faint role now has ${(worst - TEXT_THRESHOLD).toFixed(2)} of margin — ` +
      'DESIGN.md describes it as near the floor and bans opacity on it for that reason',
  );
});

test('every signal stroke clears 3:1 against the surface its pill sits on', () => {
  // Level 2 per DESIGN.md's elevation table: the pill fills are tonal and
  // near-invisible by construction, so the stroke is what makes the boundary.
  const signals: readonly ColorName[] = [
    'signal-present',
    'signal-absent',
    'signal-unreadable',
    'signal-unchecked',
  ];
  for (const signal of signals) {
    const ratio = contrast(signal, 'surface-container-high');
    assert.ok(ratio >= UI_THRESHOLD, `${signal} stroke is ${quoted(ratio)} on level 2`);
  }
});

test('the focus ring clears 3:1 on every ladder level and on its own fill', () => {
  for (const surface of LADDER) {
    const ratio = contrast('focus-ring', surface);
    assert.ok(ratio >= UI_THRESHOLD, `the focus ring is ${quoted(ratio)} on ${surface}`);
  }
  // On an element already filled with `primary` the ring is invisible against
  // its own background, so the inner stroke is what remains visible.
  const inner = contrast('focus-ring-on-primary', 'primary');
  assert.ok(inner >= UI_THRESHOLD, `the inner stroke on a filled element is ${quoted(inner)}`);
});

test('text on the accent and on its container clears 4.5:1', () => {
  for (const [text, ground] of [
    ['on-primary', 'primary'],
    ['on-primary-container', 'primary-container'],
  ] as const) {
    const ratio = contrast(text, ground);
    assert.ok(ratio >= TEXT_THRESHOLD, `${text} on ${ground} is ${quoted(ratio)}`);
  }
});

test('the outline clears 3:1 where it is the edge of an unfilled control', () => {
  for (const surface of ['surface', 'surface-container-low', 'surface-container-high'] as const) {
    const ratio = contrast('outline', surface);
    assert.ok(ratio >= UI_THRESHOLD, `outline on ${surface} is ${quoted(ratio)}`);
  }
});

test('primary against body text is below 3:1, which is why colour alone cannot carry a link', () => {
  // Not a failure — an accent is not required to contrast with text. It is
  // recorded because it is the reason `a` carries an underline: at this ratio a
  // colour-only distinction fails WCAG 1.4.1.
  const ratio = contrast('primary', 'on-surface');
  assert.ok(ratio < UI_THRESHOLD, `primary vs on-surface is ${quoted(ratio)}`);
});

// ---------------------------------------------------------------------------
// The numbers DESIGN.md states in prose
// ---------------------------------------------------------------------------

test('every ratio DESIGN.md quotes is what the tokens actually compute', async () => {
  const design = await readFile(DESIGN_PATH, 'utf8');

  const claims: readonly (readonly [string, number])[] = [
    // "on-surface [...] computed at 11.13:1 to 15.00:1 across the container ladder"
    ['on-surface, worst on the ladder', Math.min(...LADDER.map((s) => contrast('on-surface', s)))],
    ['on-surface, best on the ladder', Math.max(...LADDER.map((s) => contrast('on-surface', s)))],
    // "on-surface-faint [...] is 4.54:1 at its worst pairing"
    ['on-surface-faint, worst pairing', Math.min(...LADDER.map((s) => contrast('on-surface-faint', s)))],
    // "computes between 5.88:1 and 9.08:1 against a level-2 surface"
    [
      'signal stroke, weakest',
      Math.min(
        ...(['signal-present', 'signal-absent', 'signal-unreadable', 'signal-unchecked'] as const).map(
          (s) => contrast(s, 'surface-container-high'),
        ),
      ),
    ],
    [
      'signal stroke, strongest',
      Math.max(
        ...(['signal-present', 'signal-absent', 'signal-unreadable', 'signal-unchecked'] as const).map(
          (s) => contrast(s, 'surface-container-high'),
        ),
      ),
    ],
    // "a 1px inner stroke in {colors.focus-ring-on-primary} (8.04:1 against the fill)"
    ['focus-ring-on-primary against the fill', contrast('focus-ring-on-primary', 'primary')],
  ];

  const missing = claims.filter(([, ratio]) => !design.includes(quoted(ratio)));
  assert.deepEqual(
    missing.map(([what, ratio]) => `${what}: computed ${quoted(ratio)}, not stated in DESIGN.md`),
    [],
    'DESIGN.md and the tokens disagree — recompute the ratios rather than re-reasoning the colour',
  );
});

test('the quoted set is complete: DESIGN.md states no ratio this file does not recompute', async () => {
  const design = await readFile(DESIGN_PATH, 'utf8');
  const stated = new Set([...design.matchAll(/\b(\d+\.\d{2}):1\b/g)].map((m) => m[0] ?? ''));

  const recomputed = new Set([
    ...LADDER.map((s) => quoted(contrast('on-surface', s))),
    ...LADDER.map((s) => quoted(contrast('on-surface-faint', s))),
    ...(['signal-present', 'signal-absent', 'signal-unreadable', 'signal-unchecked'] as const).map((s) =>
      quoted(contrast(s, 'surface-container-high')),
    ),
    quoted(contrast('focus-ring-on-primary', 'primary')),
  ]);

  const unaccounted = [...stated].filter((ratio) => !recomputed.has(ratio));
  assert.deepEqual(
    unaccounted,
    [],
    'DESIGN.md quotes a ratio nothing here recomputes — add the pairing to this file or drop the claim',
  );
  // And the guard that keeps the check above from passing on an empty parse.
  assert.ok(stated.size >= 6, `only ${String(stated.size)} ratios found in DESIGN.md`);
});
