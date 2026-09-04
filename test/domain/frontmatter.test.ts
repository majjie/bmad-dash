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
 *
 * The last section covers Story 1.11's second door, `readUnfenced`, over the
 * shape `sprint-status.yaml` actually has — comment header, no fence, indented
 * sub-map. It is one scan behind two doors, so its rules are asserted through
 * the new door as well: a second hand-rolled reader would be free to drift from
 * this one, and the drift would be invisible until a value came back wrong.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { bodyAfterFrontmatter, readFrontmatter, readUnfenced } from '../../src/domain/frontmatter.ts';

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

// ---------------------------------------------------------------------------
// The unfenced door onto the same scan — Story 1.11
// ---------------------------------------------------------------------------

test('a file with no fence yields its zero-indent scalars, which readFrontmatter refuses', () => {
  // `sprint-status.yaml`'s actual shape: a `#` comment header, no `---`, flat
  // scalars, then an indented sub-map. The one gate that blocked reuse was the
  // opening fence, and this is both halves of that fact in one row.
  const text = [
    '# STATUS DEFINITIONS:',
    '# ==================',
    '',
    'generated: 08-28-2026 20:15',
    'project: bmad-dash',
    'story_location: _bmad-output/implementation-artifacts',
    'development_status:',
    '  epic-1: in-progress',
    '  1-11-locate-sprint-tracking-safely: in-progress',
    '',
  ].join('\n');

  const block = readUnfenced(text);
  assert.deepEqual(
    [...block.fields],
    [
      ['generated', '08-28-2026 20:15'],
      ['project', 'bmad-dash'],
      ['story_location', '_bmad-output/implementation-artifacts'],
    ],
  );

  // The indentation rule is what keeps the sub-map out, and it is asserted as
  // an absence because that is the only way to state it: `epic-1` is a
  // *nested* key and must never surface as a top-level field. Those statuses
  // are Story 2.8's to read, and this reader having read them would be the
  // defect.
  assert.equal(block.fields.has('epic-1'), false);
  assert.equal(block.fields.has('1-11-locate-sprint-tracking-safely'), false);
  // `development_status:` has no inline value, so it is declined rather than
  // invented as an empty string — AD-13, and the same rule the fenced door
  // applies.
  assert.deepEqual(block.skipped, ['development_status']);

  // And the fenced door still refuses the same text, which is the gate this
  // entry point exists to get past rather than to remove.
  const fenced = readFrontmatter(text);
  assert.equal(fenced.present, false);
  assert.equal(fenced.fields.size, 0);
});

test('an unfenced scan stops at a document boundary rather than reading the next document', () => {
  // A `---` in an unfenced file *starts* a second YAML document, so keys after
  // it belong to that one. Reading past it would let a second document's
  // `story_location` answer for the first document's.
  const block = readUnfenced(
    ['story_location: docs/stories', '---', 'story_location: /etc', ''].join('\n'),
  );
  assert.deepEqual([...block.fields], [['story_location', 'docs/stories']]);
});

test('the unfenced door declines a valueless key rather than inventing an empty one', () => {
  // The distinction FR-51's consumer depends on: "no such key" and "a key that
  // says nothing" are different answers, and `fields.get` alone cannot tell
  // them apart — which is why `skipped` carries the second.
  const declined = readUnfenced('story_location:\nproject: bmad-dash\n');
  assert.equal(declined.fields.has('story_location'), false);
  assert.deepEqual(declined.skipped, ['story_location']);

  const undeclared = readUnfenced('project: bmad-dash\n');
  assert.equal(undeclared.fields.has('story_location'), false);
  assert.deepEqual(undeclared.skipped, []);
});

test('the unfenced door keeps every refusal the fenced one has', () => {
  // The point of one scan behind two doors: a second hand-rolled reader would
  // be free to drift, so the rules are asserted through the new door too.
  const block = readUnfenced(
    [
      'flow: [a, b]',
      'anchor: *ref',
      'tagged: !!str x',
      'block: |',
      'escaped: "caf\\u00e9"',
      'good: plain value  # with a comment',
      'quoted: "docs/stories"',
      "single: 'it''s here'",
      'colons: http://example.test/x',
      '',
    ].join('\r\n'),
  );
  assert.deepEqual(block.skipped, ['flow', 'anchor', 'tagged', 'block', 'escaped']);
  assert.deepEqual(
    [...block.fields],
    [
      ['good', 'plain value'],
      ['quoted', 'docs/stories'],
      ['single', "it's here"],
      ['colons', 'http://example.test/x'],
    ],
  );
});

test('a leading document-start marker opens the document rather than ending it', () => {
  // **The reader's own empty success, and the row that pins the fix.**
  // `readUnfenced` began the shared scan at line 0, and the scan's first act is
  // the fence test — so a file whose first line is `---` terminated before a
  // single key was read and came back with no fields, which the caller then
  // reported as "declares no story_location" over a file that plainly declared
  // one. In YAML a leading `---` *opens* the first document: its keys are this
  // document's keys.
  const opened = readUnfenced('---\nstory_location: docs/stories\nproject: bmad-dash\n');
  assert.deepEqual(
    [...opened.fields],
    [
      ['story_location', 'docs/stories'],
      ['project', 'bmad-dash'],
    ],
  );
  assert.equal(opened.terminated, false, 'the scan reached the end of the file');

  // A second `---` further down is still a boundary, so the skip applies to the
  // opening marker only and not to every fence in the file.
  const bounded = readUnfenced('---\nstory_location: docs/stories\n---\nstory_location: /etc\n');
  assert.deepEqual([...bounded.fields], [['story_location', 'docs/stories']]);
  assert.equal(bounded.terminated, true);

  // And a document-*end* marker on the first line is not skipped: the document
  // is already over, so skipping it would read the next one's keys as this
  // one's.
  const ended = readUnfenced('...\nstory_location: /etc\n');
  assert.equal(ended.fields.size, 0);
  assert.equal(ended.terminated, true);
});

test('an unfenced scan says whether it stopped early, so truncation is observable', () => {
  // `readUnfenced` dropped `terminated` on the argument that it was a claim
  // about a block it has none of, which left **no caller able to tell that the
  // scan had stopped at all** — silent truncation, which is the shape AD-13
  // exists against. Both doors report it now, each meaning its own thing.
  assert.equal(readUnfenced('project: bmad-dash\n').terminated, false);
  assert.equal(readUnfenced('project: bmad-dash\n---\nother: x\n').terminated, true);
  assert.equal(readFrontmatter('---\ntitle: x\n---\n').terminated, true);
  assert.equal(readFrontmatter('---\ntitle: x\n').terminated, false, 'an unterminated block');
});

// ---------------------------------------------------------------------------
// Story 2.1b's third question of the same scan: where does the body start?
// ---------------------------------------------------------------------------

test('the body after a closed block is everything below the closing fence', () => {
  assert.equal(
    bodyAfterFrontmatter("---\ntitle: 'x'\ntype: 'feature'\n---\n\n# Heading\n\nBody.\n"),
    '\n# Heading\n\nBody.\n',
  );
  // The fence's own line goes with the block, and nothing above it survives:
  // left in a rendered document the keys become a setext heading under an
  // `<hr>`, so the block arrives dressed as the document's own title.
  assert.ok(!bodyAfterFrontmatter("---\ntitle: 'x'\n---\nBody.\n").includes('title'));
  assert.ok(!bodyAfterFrontmatter("---\ntitle: 'x'\n---\nBody.\n").includes('---'));
});

test('a document with no leading block is returned exactly as it was handed over', () => {
  for (const text of ['# Heading\n\nBody.\n', '', 'no fence anywhere\n', '  ---\nindented\n']) {
    assert.equal(bodyAfterFrontmatter(text), text, JSON.stringify(text));
  }
});

test('an unterminated block is a document, not a truncation', () => {
  // The alternative would show the reader a fragment with nothing to say it was
  // one. `terminated` is the flag that separates the two, and it is the same
  // flag `readFrontmatter` reports — one scan, not a second reading of it.
  const opened = '---\nlooks like frontmatter\n\n# But nothing closes it\n';
  assert.equal(readFrontmatter(opened).terminated, false);
  assert.equal(bodyAfterFrontmatter(opened), opened);
});

test('a document-end marker closes the block, exactly as the scan says it does', () => {
  // `...` is a YAML document-end marker and `FENCE` matches it, so `terminated`
  // is true for it — which means the body has to start after it too. A second
  // reader in the render layer that only knew about `---` would disagree with
  // this file about where the content begins, which is the whole reason this
  // function is here rather than there.
  assert.equal(readFrontmatter("---\ntitle: 'x'\n...\nBody.\n").terminated, true);
  assert.equal(bodyAfterFrontmatter("---\ntitle: 'x'\n...\nBody.\n"), 'Body.\n');
});

test('a BOM and CRLF line endings are handled by the same rules as the scan', () => {
  // The two things a second line-splitter would most plausibly get differently.
  // `﻿---` still opens a block, so its body must still be found.
  assert.equal(readFrontmatter("﻿---\ntitle: 'x'\n---\nBody.\n").present, true);
  assert.equal(bodyAfterFrontmatter("﻿---\ntitle: 'x'\n---\nBody.\n"), 'Body.\n');
  // And the body comes back with `\n` endings, because it is rebuilt from the
  // same `linesOf` the scan uses. Stated rather than glossed: it is a
  // normalization, and it is harmless for the one consumer — a markdown parser
  // treats the two identically — but a caller that needed the bytes back
  // unchanged would not get them from here.
  assert.equal(bodyAfterFrontmatter("---\r\ntitle: 'x'\r\n---\r\nBody.\r\n"), 'Body.\n');
});
