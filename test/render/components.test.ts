/**
 * The shared containers, held to the three rules they exist to enforce.
 *
 * Story 1.2's review taught the lesson this file is written against: negative
 * assertions alone cannot tell a correct implementation from a missing one,
 * because an empty string satisfies every "must not contain" test there is. So
 * each rule here is asserted in both directions — the tile *does* render its
 * label as a heading, *and* a hollow tile is refused.
 *
 * The focus-containment invariant is geometric rather than visual. What
 * actually clips a ring is a container that hides its overflow, not a container
 * with thin padding, so that is what is checked — along with the padding having
 * room for the ring in the first place.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tile,
  tileGrid,
  buttonPrimary,
  buttonGhost,
  type TileOptions,
} from '../../src/render/components.ts';
import { markup } from '../../src/render/html.ts';
import { components, spacing } from '../../src/render/tokens.ts';
import { STYLESHEET, splitStylesheet, customProperties } from '../../src/render/stylesheet.ts';

const { rules: RULES } = splitStylesheet();

/** A px length as a number. Only the unit the shape tokens use. */
function px(value: string): number {
  const parsed = /^(\d*\.?\d+)px$/.exec(value.trim());
  assert.ok(parsed !== null, `not a px length: ${value}`);
  return Number(parsed?.[1]);
}

// ---------------------------------------------------------------------------
// A tile never renders hollow
// ---------------------------------------------------------------------------

test('a tile renders its label as a heading above its content', () => {
  const html = tile({ label: 'Recent activity', content: { html: markup`<p>Two artifacts.</p>` } });
  assert.match(html, /^<section class="tile">/);
  assert.ok(html.includes('<h2 class="tile-label">Recent activity</h2>'));
  assert.ok(html.indexOf('<h2') < html.indexOf('<p>'), 'the label precedes the content');
  assert.ok(html.endsWith('</section>'));
});

test('a tile with nothing to show states why, and is not a bare container', () => {
  const html = tile({ label: 'Core artifacts', content: { empty: 'A BMAD project, with no artifacts yet.' } });
  assert.ok(html.includes('<h2 class="tile-label">Core artifacts</h2>'), 'the label still renders');
  assert.ok(html.includes('A BMAD project, with no artifacts yet.'), 'the reason renders');
  assert.match(html, /class="tile-empty"/);
});

test('a tile cannot be empty without saying why', () => {
  // The failure this refuses is the one EXPERIENCE.md calls a defect on every
  // surface: a container that renders nothing and explains nothing.
  assert.throws(() => tile({ label: 'Risk summary', content: { empty: '' } }), /cannot be blank/);
  assert.throws(() => tile({ label: 'Risk summary', content: { empty: '   ' } }), /cannot be blank/);
  assert.throws(() => tile({ label: 'Risk summary', content: { html: markup`` } }), /state a reason/);
});

test('a tile takes a sentence and escapes it, so a caller need not', () => {
  // The form Story 1.12 added: a tile whose content is a statement rather than
  // a structure. `html` demands a `Markup`, which is escaped by construction;
  // this one is handed raw text and escapes it here.
  const html = tile({ label: 'Scan', content: { text: 'The scan finished. 3 artifacts examined.' } });
  assert.ok(html.includes('<p>The scan finished. 3 artifacts examined.</p>'));
  const hostile = tile({ label: 'Scan', content: { text: '<img src=x>' } });
  assert.ok(!hostile.includes('<img'), 'a sentence is escaped like a stated reason');
  assert.ok(hostile.includes('&lt;img src=x&gt;'));
  // And it is not the empty state: a statement is ordinary text, an absence is
  // styled as one.
  assert.ok(!html.includes('tile-empty'));
  assert.throws(() => tile({ label: 'Scan', content: { text: '   ' } }), /state a reason/);
});

test('a tile cannot be given raw markup at all, only Markup', () => {
  // The type refuses it, which is the point — asserted at runtime too, because
  // a `as` cast in a future caller would get past the compiler and this is the
  // one place where getting past it is script injection with the project as the
  // vector.
  const raw = { html: '<p>x</p>' } as unknown as Parameters<typeof tile>[0]['content'];
  assert.throws(() => tile({ label: 'A', content: raw }), /takes html only as Markup/);
});

test('a tile cannot be unlabelled, because the label is how the page is traversed', () => {
  assert.throws(() => tile({ label: '', content: { html: markup`<p>x</p>` } }), /must carry a label/);
  assert.throws(() => tile({ label: '  ', content: { html: markup`<p>x</p>` } }), /must carry a label/);
});

test('a tile escapes its label and its stated reason', () => {
  // Both can carry project data in later stories — a family name, a path.
  const html = tile({ label: '<script>x</script>', content: { empty: '"><img>' } });
  assert.ok(!html.includes('<script>'), 'the label must be escaped');
  assert.ok(!html.includes('<img>'), 'the reason must be escaped');
  assert.ok(html.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------------------
// At most one raised tile per surface
// ---------------------------------------------------------------------------

test('a raised tile takes the raised class, a plain one does not', () => {
  assert.match(tile({ label: 'A', content: { html: markup`<p>x</p>` }, raised: true }), /class="tile-raised"/);
  assert.match(tile({ label: 'A', content: { html: markup`<p>x</p>` }, raised: false }), /class="tile"/);
  assert.match(tile({ label: 'A', content: { html: markup`<p>x</p>` } }), /class="tile"/);
});

test('a surface may carry one raised tile', () => {
  const grid = tileGrid([
    { label: 'Recent activity', content: { html: markup`<p>x</p>` }, raised: true },
    { label: 'Core artifacts', content: { html: markup`<p>y</p>` } },
  ]);
  assert.equal((grid.match(/class="tile-raised"/g) ?? []).length, 1);
  assert.equal((grid.match(/class="tile"/g) ?? []).length, 1);
});

test('a surface with two raised tiles is refused, naming both', () => {
  // "Look at this first" is not something two tiles can both be.
  const two: readonly TileOptions[] = [
    { label: 'Recent activity', content: { html: markup`<p>x</p>` }, raised: true },
    { label: 'Risk summary', content: { html: markup`<p>y</p>` }, raised: true },
  ];
  assert.throws(() => tileGrid(two), /at most one raised tile/);
  assert.throws(() => tileGrid(two), /Recent activity, Risk summary/);
});

test('the rule is enforced on intent, not on rendered markup', () => {
  // `tileGrid` takes options rather than strings on purpose: given strings it
  // could only count class names, which checks its own output instead of the
  // caller's intent and would pass for hand-written markup.
  const three: readonly TileOptions[] = [
    { label: 'A', content: { html: markup`<p>x</p>` }, raised: true },
    { label: 'B', content: { html: markup`<p>y</p>` }, raised: true },
    { label: 'C', content: { html: markup`<p>z</p>` }, raised: true },
  ];
  assert.throws(() => tileGrid(three), /3 were given/);
});

test('an empty surface is refused rather than rendered as an empty grid', () => {
  assert.throws(() => tileGrid([]), /empty surface/);
});

// ---------------------------------------------------------------------------
// Focus containment, geometrically
// ---------------------------------------------------------------------------

test('a container reserves more than the focus ring needs inside its padding', () => {
  const needed = px(components['focus-ring'].width) + px(components['focus-ring'].offset);
  assert.equal(needed, 4, 'a 2px ring at a 2px offset extends 4px beyond its element');
  assert.ok(
    px(spacing['tile-padding']) >= needed,
    `tile padding is ${spacing['tile-padding']} against ${String(needed)}px of ring`,
  );
});

test('no rule clips its overflow, which is what actually cuts a ring', () => {
  // Padding is necessary and not sufficient: a container with generous padding
  // and `overflow: hidden` still cuts a ring drawn on a child at its edge.
  // WCAG 2.4.11 — focus not obscured — makes that a conformance failure.
  // Overflow is the common way; it is not the only way. `clip-path`, a paint
  // containment, and a mask each cut a ring drawn outside the element's box,
  // and none of them mentions overflow.
  const clipping = STYLESHEET.split('\n').filter((line) =>
    /^\s*(overflow(-x|-y)?:\s*(hidden|clip|auto|scroll)|clip-path:|mask(-image)?:|contain:\s*[^;]*paint)/.test(
      line,
    ),
  );
  assert.deepEqual(clipping, [], 'a container that clips its painting clips the focus ring');
});

test('the focus ring is the size UX-DR13 specifies, with its inner stroke', () => {
  assert.equal(components['focus-ring'].width, '2px');
  assert.equal(components['focus-ring'].offset, '2px');
  assert.equal(components['focus-ring'].innerStrokeOnFilled, '{colors.focus-ring-on-primary}');
});

test('every type size is relative, which is the mechanism a text resize uses', () => {
  // WCAG 1.4.4 is about *text-only* zoom, which scales the root font size. A
  // size in px ignores that entirely, so a px type scale does not fail this
  // gradually — it fails completely, while looking fine at 100%.
  const sizes = customProperties().filter((property) => property.name.endsWith('-font-size'));
  assert.ok(sizes.length >= 8, `expected a size per type role, found ${String(sizes.length)}`);
  for (const property of sizes) {
    assert.match(property.value, /rem$/, `${property.name} is ${property.value}, not relative`);
  }
});

test('nothing in the sheet fixes a height in px, so text can resize to 200%', () => {
  // Density comes from spacing, not from small type, which is what makes a
  // 200% text resize survivable (WCAG 1.4.4). A container with a fixed pixel
  // height is the usual way that breaks.
  const fixed = STYLESHEET.split('\n').filter((line) =>
    /^\s*(height|max-height|line-height):\s*\d/.test(line) && /px/.test(line),
  );
  assert.deepEqual(fixed, [], 'a fixed pixel height does not survive a text resize');
});

// ---------------------------------------------------------------------------
// The surface action buttons (Story 2.3)
// ---------------------------------------------------------------------------

test('a primary button carries its class, an escaped label, and its destination', () => {
  const html = buttonPrimary({ label: 'Open the run', href: '/artifact/foo' });
  assert.equal(html, '<a class="button-primary" href="/artifact/foo">Open the run</a>');
});

test('a ghost button carries its class, an escaped label, and its destination', () => {
  const html = buttonGhost({ label: 'Refresh', href: '/' });
  assert.equal(html, '<a class="button-ghost" href="/">Refresh</a>');
});

test('a hostile label renders as visible text, creating no element', () => {
  for (const build of [buttonPrimary, buttonGhost] as const) {
    const html = build({ label: '<script>alert(1)</script>', href: '/x' });
    assert.ok(!html.includes('<script>'), 'the label must be escaped');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'the text must still be shown');
  }
});

test('a hostile destination is escaped too, so it cannot break out of the attribute', () => {
  for (const build of [buttonPrimary, buttonGhost] as const) {
    const html = build({ label: 'Go', href: '/x?"><script>alert(1)</script>' });
    assert.ok(!html.includes('<script>'), 'the destination must be escaped');
    assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
  }
});

test('an empty label is refused, not rendered', () => {
  for (const build of [buttonPrimary, buttonGhost] as const) {
    assert.throws(() => build({ label: '', href: '/x' }), /must carry a label/);
    assert.throws(() => build({ label: '   ', href: '/x' }), /must carry a label/);
  }
});

test('an empty destination is refused, the same way an empty label is', () => {
  // A button with `href=""` re-requests the current page: a control that looks
  // like it works and goes nowhere. Guarded at the boundary rather than at each
  // call site, because Story 2.3a feeds these from project-derived paths.
  for (const build of [buttonPrimary, buttonGhost]) {
    assert.throws(() => build({ label: 'Open', href: '' }), /must say where it goes/);
    assert.throws(() => build({ label: 'Open', href: '   ' }), /must say where it goes/);
  }
});

test('at most one button-primary appears on any surface the suite renders', async () => {
  // UX-DR11, asserted over rendered markup rather than by the component: a
  // button cannot see its neighbours, so this is the same division of labour
  // as `tileGrid` policing raised tiles from the caller's side. `buttonPrimary`
  // itself is called twice in this very test file — once here, once in the
  // round-trip corpus in `stylesheet.test.ts` — and neither call site is a
  // surface, so this loop is the one place the rule is actually checked.
  //
  // **Mechanism check** (see the spec's Verification section): rendering a
  // second `button-primary` into one of these surfaces and re-running this
  // test is expected to fail it.
  const { renderPage } = await import('../../src/render/page.ts');
  const { renderArtifact, findArtifact } = await import('../../src/render/artifact.ts');
  const { CERTAIN_ROW, FULL_INVENTORY_VIEW, READABLE_BODY } = await import('../support/inventory.ts');
  const opened = findArtifact(FULL_INVENTORY_VIEW, CERTAIN_ROW.path);
  assert.ok(opened !== undefined, 'the fixture must hold the row the artifact view is rendered for');

  const surfaces = [
    renderPage('/tmp/bmad-dash-test-project', FULL_INVENTORY_VIEW),
    renderArtifact('/tmp/bmad-dash-test-project', opened, READABLE_BODY),
  ];
  // **A positive control, because today every surface counts zero.** Refresh is
  // ghost and no surface has a forward action yet, so `count <= 1` is satisfied
  // by `0` and would pass just as happily on a counter that matches nothing at
  // all — a typo in the pattern would look identical to a clean surface. So the
  // same expression is run over markup that really does hold two, and must see
  // them. Until Story 2.3a puts a real primary on a surface, this is what makes
  // the loop below a test rather than a formality.
  const countPrimaries = (html: string): number =>
    (html.match(/class="[^"]*\bbutton-primary\b[^"]*"/g) ?? []).length;
  assert.equal(
    countPrimaries(`${buttonPrimary({ label: 'A', href: '/a' })}${buttonPrimary({ label: 'B', href: '/b' })}`),
    2,
    'the counter must detect two primaries, or the loop below proves nothing',
  );
  assert.equal(countPrimaries(buttonGhost({ label: 'G', href: '/g' })), 0, 'and must not count a ghost');

  for (const surface of surfaces) {
    const count = countPrimaries(surface);
    assert.ok(count <= 1, `a surface may carry at most one button-primary; found ${String(count)}`);
  }
});

test('the filled variant takes the inner-stroke focus treatment', () => {
  // UX-DR13: an outer ring in `--color-focus-ring` is invisible against a fill
  // in the same colour (both are `{colors.primary}`), so `.button-primary`
  // overrides the outline colour and pulls it inside its own edge rather than
  // relying on the base `:focus-visible` rule every other focusable element
  // uses unmodified.
  const rule = /^\.button-primary:focus-visible \{\n([\s\S]*?)\n\}/m.exec(RULES);
  assert.ok(rule !== null, 'a focus override for .button-primary must exist');
  const body = rule?.[1] ?? '';
  assert.match(body, /outline-color:\s*var\(--focus-ring-inner-stroke-on-filled\);/);
  assert.match(body, /outline-offset:\s*calc\(var\(--focus-ring-width\) \* -1\);/);
  // The ghost variant is not filled, so the outer ring already reads against
  // whatever it sits on; it takes no override.
  assert.doesNotMatch(RULES, /\.button-ghost:focus-visible/);
});

test('the button rules carry no literal, only tokens and CSS keywords', () => {
  // Anchored to the start of a line: `.button-primary` and `.button-ghost`
  // also appear as part of the combined layout selector one rule up, and an
  // unanchored search would match that line's body instead of each variant's
  // own.
  const primary = /^\.button-primary \{\n([\s\S]*?)\n\}/m.exec(RULES)?.[1] ?? '';
  const ghost = /^\.button-ghost \{\n([\s\S]*?)\n\}/m.exec(RULES)?.[1] ?? '';
  for (const body of [primary, ghost]) {
    assert.ok(body.length > 0);
    assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/, 'no colour literal');
    assert.doesNotMatch(body, /(?<![\w-])\d*\.?\d+(?:px|rem|em)\b/, 'no dimension literal');
  }
  // `button-ghost`'s border width is the one property DESIGN.md's tokens do
  // not cover; `thin` is a CSS keyword rather than a literal DESIGN.md would
  // need to own.
  assert.match(ghost, /border-width:\s*thin;/);
});
