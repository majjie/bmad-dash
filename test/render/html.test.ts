/**
 * The escaping boundary, asserted by table.
 *
 * This module shipped in the first pass of Story 1.3 with no test file at all —
 * the module whose own argument is that escaping must not be a per-call-site
 * question. Two of its five mappings could be deleted and the whole suite
 * stayed green, because the only hostile fixtures in the suite happened to
 * contain `<`, `>` and `"` and neither `&` nor `'`.
 *
 * A table, not a hostile string, is the right shape here. A fixture proves the
 * characters it happens to contain; a table proves the contract.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, fillIndexString, isMarkup, markup } from '../../src/render/html.ts';

/** The complete contract. Every character, and what it must become. */
const MAPPINGS: readonly (readonly [string, string])[] = [
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
];

test('every character that changes meaning in markup is escaped', () => {
  for (const [raw, escaped] of MAPPINGS) {
    assert.equal(escapeHtml(raw), escaped, `${raw} must become ${escaped}`);
  }
});

test('the mapping is complete: nothing dangerous passes through unchanged', () => {
  // The implementation's fallback returns the character unchanged when a
  // mapping is missing, which is what made a deleted entry silent rather than
  // loud. This is the assertion that makes it loud.
  for (const [raw] of MAPPINGS) {
    assert.notEqual(escapeHtml(raw), raw, `${raw} passed through unescaped`);
  }
});

test('an ampersand is escaped once, not twice', () => {
  // The correctness argument in the module is that a single pass prevents this:
  // a two-pass implementation replacing `<` before `&` would turn `&lt;` into
  // `&amp;lt;`. That argument was never asserted.
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
  assert.equal(escapeHtml('&&'), '&amp;&amp;');
});

test('a real hostile path is neutralised end to end', () => {
  const hostile = `/work/Acme & Co/"><script>alert('x')</script>`;
  const escaped = escapeHtml(hostile);
  // The four that must be wholly absent. `&` cannot be checked that way — every
  // entity begins with one — so it is checked structurally instead: each `&`
  // must open a known entity, which is exactly what "escaped once" means.
  for (const character of ['<', '>', '"', "'"]) {
    assert.ok(!escaped.includes(character), `a raw ${character} survived`);
  }
  const entities = escaped.match(/&[^;]*;?/g) ?? [];
  assert.equal((escaped.match(/&/g) ?? []).length, entities.length, 'every & opens an entity');
  for (const entity of entities) {
    assert.ok(
      ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;'].includes(entity),
      `${entity} is not one of the five entities this module emits`,
    );
  }
  // And it is still readable: escaping shows the string, it does not drop it.
  assert.ok(escaped.includes('Acme &amp; Co'));
  assert.ok(escaped.includes('&lt;script&gt;'));
});

test('ordinary text is returned unchanged', () => {
  // An over-eager escaper that mangled normal paths would be caught here
  // rather than in a browser.
  for (const ordinary of ['/home/jamie/code/scratch/bmad', 'Dashboard', 'Not checked', '']) {
    assert.equal(escapeHtml(ordinary), ordinary);
  }
});

test('a project directory named like markup is displayed, not executed', () => {
  // The case that motivates the module: nothing stops a repository from
  // containing a directory called `<script>`, and the tool is pointed at
  // projects the user did not necessarily write.
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.ok(!escapeHtml('<img onerror=x>').includes('<'));
});

// ---------------------------------------------------------------------------
// Escaping by construction
// ---------------------------------------------------------------------------

test('markup escapes every interpolated value, and the literal parts it does not', () => {
  // The literal parts come from the source text of the call and are the
  // author's own markup; only the values can carry project data.
  const built = markup`<code>${'<script>x</script>'}</code>`;
  assert.equal(built.html, '<code>&lt;script&gt;x&lt;/script&gt;</code>');
  assert.ok(isMarkup(built));
});

test('markup passes nested markup through without escaping it twice', () => {
  // Composition is the whole reason `Markup` is a type rather than a naming
  // convention: escaping a rendered row again would render `&amp;lt;` at the
  // reader, and a bare string cannot be told from one.
  const row = markup`<li>${'a & b'}</li>`;
  const list = markup`<ul>${row}</ul>`;
  assert.equal(list.html, '<ul><li>a &amp; b</li></ul>');
});

test('a Markup cannot be manufactured outside the module that builds one', async () => {
  // The safety claim three doc comments make. It was false in the first
  // version: the class was exported with a public constructor, so
  // `new Markup(untrusted)` was shorter than the `as` cast the runtime guard in
  // `./components.ts` had been added to catch.
  const exports = Object.keys(
    (await import('../../src/render/html.ts')) as Record<string, unknown>,
  );
  assert.deepEqual(
    exports.filter((name) => name === 'Markup'),
    [],
    'the class must not be exported; only the type and the builders are',
  );
  assert.deepEqual(exports.sort(), ['escapeHtml', 'fillIndexString', 'isMarkup', 'markup']);
});

test('markup takes a list, a number and an absent value without a call-site ternary', () => {
  // A list of values is a **sequence of nodes**, joined with real whitespace
  // rather than with nothing. Concatenated, a row's cells ran together for every
  // reader not looking at the styled page — text extraction, copy-paste, and an
  // unstyled render all got `prdsFamily directoryNot checked`, because the flex
  // `gap` that separates them visually is not text.
  const rows = [markup`<li>1</li>`, markup`<li>2</li>`];
  assert.equal(markup`<ul>${rows}</ul>`.html, '<ul><li>1</li>\n<li>2</li></ul>');
  assert.equal(markup`<p>${3}</p>`.html, '<p>3</p>');
  assert.equal(markup`<p>${undefined}</p>`.html, '<p></p>');
  // A number is escaped like anything else, so the rule has no exception to
  // remember: `String(value)` at each call site is what this removes.
  assert.equal(markup`<p>${0}</p>`.html, '<p>0</p>');
});

test('markup handles a template with no values and one with only values', () => {
  assert.equal(markup`<hr>`.html, '<hr>');
  assert.equal(markup`${'&'}${'<'}`.html, '&amp;&lt;');
  assert.equal(markup`<p>${[]}</p>`.html, '<p></p>', 'an empty list adds no whitespace');
});

test('an index string is filled, and an unfilled placeholder throws', () => {
  assert.equal(fillIndexString('No <family> artifacts.', { family: 'PRD' }), 'No PRD artifacts.');
  // `<n>` reaching a reader is the visible half of having edited the index and
  // not the call site, so it is refused rather than shipped.
  assert.throws(() => fillIndexString('Examined <n>.', {}), /unfilled placeholder <n>/);
  assert.throws(() => fillIndexString('<a> and <b>.', { a: 'x' }), /unfilled placeholder <b>/);
  // Substitution happens before escaping, never after: a value carrying markup
  // is escaped where it is interpolated, so the filled sentence is ordinary
  // text at this point.
  const filled = fillIndexString('At <path>.', { path: '<script>' });
  assert.equal(filled, 'At <script>.');
  assert.equal(markup`<p>${filled}</p>`.html, '<p>At &lt;script&gt;.</p>');
});
