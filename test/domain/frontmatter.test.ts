/**
 * The minimal frontmatter reader, against the shapes measured on disk.
 *
 * Every case here is a shape this repository's own artifacts contain, plus the
 * ones that would make a naive reader *wrong* rather than merely incomplete.
 * The load-bearing pair:
 *
 *   - `DESIGN.md`'s frontmatter nests maps four levels deep and carries an
 *     indented `type:` at every one of them, so a reader that ignores
 *     indentation answers "this declares `type: '{typography.mono}'`". Asserted
 *     as an absence, because that is the only way to state it.
 *   - `ARCHITECTURE-SPINE.md`'s `scope` is single-quoted and contains `''`, so
 *     a reader that slices between the first and second quote truncates the
 *     value mid-sentence and reports the truncation as the whole of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFrontmatter } from '../../src/domain/frontmatter.ts';

/** Fields as pairs, so a whole block is comparable in one assertion. */
function pairs(text: string): readonly (readonly [string, string])[] {
  return [...readFrontmatter(text).fields];
}

test('flat top-level scalars are read, as every artifact on disk has them', () => {
  const text = ['---', 'title: bmad-dash', 'status: final', 'created: 2026-08-28', '---', '', '# bmad-dash'].join('\n');
  const block = readFrontmatter(text);
  assert.equal(block.present, true);
  assert.equal(block.terminated, true);
  assert.deepEqual(
    [...block.fields],
    [
      ['title', 'bmad-dash'],
      ['status', 'final'],
      ['created', '2026-08-28'],
    ],
  );
  assert.deepEqual(block.skipped, []);
  assert.deepEqual(block.duplicates, []);
});

test('a nested map is skipped rather than misread, indented `type` included', () => {
  // DESIGN.md's shape, four levels deep, with `type:` at three of them.
  const text = [
    '---',
    'name: bmad-dash',
    'components:',
    '  evidence-badge:',
    "    type: '{typography.mono}'",
    '    signal-pill:',
    "      type: '{typography.mono-badge}'",
    '      present:',
    "        type: '{typography.tiny}'",
    'status: final',
    '---',
  ].join('\n');
  const block = readFrontmatter(text);
  assert.deepEqual(
    [...block.fields],
    [
      ['name', 'bmad-dash'],
      ['status', 'final'],
    ],
  );
  assert.equal(block.fields.has('type'), false, 'a nested `type` is not the document’s own');
  assert.deepEqual(block.skipped, ['components']);
});

test('a block sequence is recorded as skipped, not flattened into a scalar', () => {
  const text = ['---', 'title: EXPERIENCE', 'sources:', '  - ../../prds/prd.md', '  - ./DESIGN.md', '---'].join('\n');
  const block = readFrontmatter(text);
  assert.deepEqual([...block.fields], [['title', 'EXPERIENCE']]);
  assert.deepEqual(block.skipped, ['sources']);
});

test('a flow collection is skipped, because a collection is not a scalar', () => {
  const block = readFrontmatter(['---', 'binds: [C1, C2, C3]', 'shape: {a: 1}', 'title: spine', '---'].join('\n'));
  assert.deepEqual([...block.fields], [['title', 'spine']]);
  assert.deepEqual(block.skipped, ['binds', 'shape']);
});

test('a block scalar indicator is skipped rather than read as its own first line', () => {
  const block = readFrontmatter(['---', 'note: |', '  first line', '  second line', 'title: x', '---'].join('\n'));
  assert.deepEqual([...block.fields], [['title', 'x']]);
  assert.deepEqual(block.skipped, ['note']);
});

test('a single-quoted scalar keeps a doubled quote as one apostrophe', () => {
  // ARCHITECTURE-SPINE.md line 7, verbatim.
  const line =
    "scope: 'bmad-dash v1 — CLI, local HTTP server, and web dashboard over a BMAD project''s artifacts (capability groups C1–C6)'";
  const block = readFrontmatter(['---', line, '---'].join('\n'));
  assert.equal(
    block.fields.get('scope'),
    "bmad-dash v1 — CLI, local HTTP server, and web dashboard over a BMAD project's artifacts (capability groups C1–C6)",
  );
});

test('a double-quoted scalar honours backslash escapes', () => {
  const block = readFrontmatter(['---', 'title: "a \\"quoted\\" name\\tand a tab"', '---'].join('\n'));
  assert.equal(block.fields.get('title'), 'a "quoted" name\tand a tab');
});

test('an unterminated quote is skipped, because the scalar continues off the line', () => {
  const block = readFrontmatter(['---', "title: 'never closed", 'status: final', '---'].join('\n'));
  assert.deepEqual([...block.fields], [['status', 'final']]);
  assert.deepEqual(block.skipped, ['title']);
});

test('a trailing comment is removed only where whitespace precedes the hash', () => {
  assert.deepEqual(pairs(['---', 'status: final # for now', 'title: C#', 'url: http://x#y', '---'].join('\n')), [
    ['status', 'final'],
    ['title', 'C#'],
    ['url', 'http://x#y'],
  ]);
});

test('a value keeps its own colons', () => {
  assert.deepEqual(pairs(['---', 'repo: git+https://example.test/x.git', '---'].join('\n')), [
    ['repo', 'git+https://example.test/x.git'],
  ]);
});

test('`key:value` with no space is not a mapping, so no field is invented', () => {
  const block = readFrontmatter(['---', 'title:bmad-dash', 'status: final', '---'].join('\n'));
  assert.deepEqual([...block.fields], [['status', 'final']]);
  assert.equal(block.fields.has('title'), false);
});

test('comment lines and blank lines inside the block are ignored', () => {
  assert.deepEqual(pairs(['---', '# BMM Module Configuration', '', 'title: x', '---'].join('\n')), [['title', 'x']]);
});

test('no leading fence means no block at all, which is not the same as no fields', () => {
  const block = readFrontmatter('# A document with no frontmatter\n\ntitle: not a field\n');
  assert.equal(block.present, false);
  assert.equal(block.terminated, false);
  assert.deepEqual([...block.fields], []);
});

test('a fence later in the body does not open a block', () => {
  const block = readFrontmatter('# Heading\n\n---\n\ntitle: not a field\n');
  assert.equal(block.present, false);
  assert.deepEqual([...block.fields], []);
});

test('an unterminated block is reported as such, and its fields are still read', () => {
  const block = readFrontmatter(['---', 'title: x', 'status: final'].join('\n'));
  assert.equal(block.present, true);
  assert.equal(block.terminated, false);
  assert.deepEqual([...block.fields], [
    ['title', 'x'],
    ['status', 'final'],
  ]);
});

test('either of YAML’s two closing fences ends the block', () => {
  const block = readFrontmatter(['---', 'title: x', '...', 'title: in the body', ''].join('\n'));
  assert.equal(block.terminated, true);
  assert.deepEqual([...block.fields], [['title', 'x']]);
});

test('CRLF endings read the same as LF', () => {
  assert.deepEqual(pairs('---\r\ntitle: x\r\nstatus: final\r\n---\r\n'), [
    ['title', 'x'],
    ['status', 'final'],
  ]);
});

test('a leading byte-order mark does not hide the opening fence', () => {
  const block = readFrontmatter('﻿---\ntitle: x\n---\n');
  assert.equal(block.present, true);
  assert.deepEqual([...block.fields], [['title', 'x']]);
});

test('a duplicate key keeps the first value and reports the repeat', () => {
  const block = readFrontmatter(['---', 'type: prd', 'status: final', 'type: brief', '---'].join('\n'));
  assert.equal(block.fields.get('type'), 'prd', 'a later line must not override a declared identity');
  assert.deepEqual(block.duplicates, ['type']);
});

test('a key repeated after being skipped is still reported as a duplicate', () => {
  const block = readFrontmatter(['---', 'sources:', '  - a.md', 'sources: b.md', '---'].join('\n'));
  assert.deepEqual(block.skipped, ['sources']);
  assert.deepEqual(block.duplicates, ['sources']);
  assert.equal(block.fields.has('sources'), false);
});

test('a `__proto__` key cannot reach an object prototype, because fields are a Map', () => {
  const block = readFrontmatter(['---', '__proto__: polluted', 'title: x', '---'].join('\n'));
  assert.equal(block.fields.get('__proto__'), 'polluted');
  assert.equal(block.fields.get('title'), 'x');
  assert.equal(({} as Record<string, unknown>)['polluted'], undefined);
});

test('a sequence document and a stray sentence produce no fields', () => {
  assert.deepEqual(pairs(['---', '- one', '- two', '---'].join('\n')), []);
  assert.deepEqual(pairs(['---', 'just a sentence with no colon', '---'].join('\n')), []);
});

test('an empty text is neither a block nor a crash', () => {
  const block = readFrontmatter('');
  assert.equal(block.present, false);
  assert.deepEqual([...block.fields], []);
});

test('a fence-only document is a block with nothing in it', () => {
  const block = readFrontmatter('---\n---\n');
  assert.equal(block.present, true);
  assert.equal(block.terminated, true);
  assert.deepEqual([...block.fields], []);
});

// ---------------------------------------------------------------------------
// Shapes this reader must decline rather than guess at
// ---------------------------------------------------------------------------

test('an escape this reader does not know is declined, not stood for its own letter', () => {
  // The failure this replaces: `ESCAPES.get(c) ?? c` turned `"café"` into
  // `cafu00e9` and `"a\x41b"` into `ax41b` — a wrong value where a declined one
  // is at least visible.
  const unicode = readFrontmatter(['---', 'title: "caf\\u00e9"', 'status: final', '---'].join('\n'));
  assert.equal(unicode.fields.has('title'), false, 'a \\u escape is not interpreted');
  assert.deepEqual(unicode.skipped, ['title']);
  assert.deepEqual([...unicode.fields], [['status', 'final']]);

  const hex = readFrontmatter(['---', 'title: "a\\x41b"', '---'].join('\n'));
  assert.deepEqual(hex.skipped, ['title']);

  // The escapes it does know still read.
  const known = readFrontmatter(['---', 'title: "a \\"q\\" and\\ta tab"', '---'].join('\n'));
  assert.equal(known.fields.get('title'), 'a "q" and\ta tab');
});

test('anchors, aliases, tags and directives are declined', () => {
  // The header lists these among what it does not read; they were being handed
  // back as ordinary strings — `title: *anchor` as `"*anchor"`, `tag: !!str x`
  // as `"!!str x"`.
  const rows: readonly (readonly [string, string])[] = [
    ['title: *anchor', 'title'],
    ['title: &anchor bmad', 'title'],
    ['tag: !!str x', 'tag'],
    ['directive: %YAML 1.2', 'directive'],
    ['reserved: @x', 'reserved'],
    ['quoted: `x', 'quoted'],
  ];
  for (const [line, key] of rows) {
    const block = readFrontmatter(['---', line, 'status: final', '---'].join('\n'));
    assert.equal(block.fields.has(key), false, line);
    assert.deepEqual(block.skipped, [key], line);
    assert.deepEqual([...block.fields], [['status', 'final']], line);
  }
});

test('content after a closing quote is declined, not dropped in silence', () => {
  const trailing = readFrontmatter(['---', "title: 'x' and more", 'status: final', '---'].join('\n'));
  assert.equal(trailing.fields.has('title'), false, 'reporting `x` would report a fragment as the whole');
  assert.deepEqual(trailing.skipped, ['title']);

  // Whitespace and a comment are the two things that may follow.
  const commented = readFrontmatter(['---', "title: 'x'   # why", '---'].join('\n'));
  assert.equal(commented.fields.get('title'), 'x');
  const spaced = readFrontmatter(['---', 'title: "x"   ', '---'].join('\n'));
  assert.equal(spaced.fields.get('title'), 'x');
});

test('a value that is only a comment is no value at all', () => {
  // `type: # comment` took the comment as the value, so a document declared a
  // `type` of `# comment`.
  const block = readFrontmatter(['---', 'type: # a comment', 'status: final', '---'].join('\n'));
  assert.equal(block.fields.has('type'), false);
  assert.deepEqual(block.skipped, ['type']);
  assert.deepEqual([...block.fields], [['status', 'final']]);
});
