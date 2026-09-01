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

import { escapeHtml } from '../../src/render/html.ts';

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
