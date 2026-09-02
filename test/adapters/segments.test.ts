/**
 * AD-10's first check, pinned from both sides.
 *
 * "Both sides" is the whole shape of this file, and it is what stops the
 * sanitizer being a rule that only ever says no. For every rule there is a
 * value it must **refuse** and a near neighbour it must **accept** — `..`
 * refused and `a..b` accepted, a leading dot refused and an inner dot
 * accepted, `NUL.txt` refused and `nullable.md` accepted. A one-sided suite
 * passes over a sanitizer that rejects everything, which would be a denial of
 * service dressed as security, and BMAD slugs are free text that legitimately
 * contain dots, dashes, spaces and non-ASCII.
 *
 * The two entry points are tested apart because their disagreement is
 * deliberate: `sanitizeSegment` refuses `..` as a name, and
 * `sanitizeDeclaredPath` lets it through as navigation so that FR-74's
 * `../../elsewhere` is answered by confinement (out-of-tree, reported, never
 * read) rather than by a refusal that never resolves anything.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_COMPONENTS,
  MAX_PATH_BYTES,
  MAX_SEGMENT_BYTES,
  SEGMENT_RULES,
  sanitizeDeclaredPath,
  sanitizeSegment,
  type SegmentRule,
} from '../../src/adapters/fs/segments.ts';

/** The rule a declared location was refused by, or `undefined` when accepted. */
function pathRuleFor(raw: string): SegmentRule | undefined {
  const checked = sanitizeDeclaredPath(raw);
  return checked.ok ? undefined : checked.rule;
}

/** The rule a segment was refused by, or `undefined` when it was accepted. */
function ruleFor(raw: string): SegmentRule | undefined {
  const checked = sanitizeSegment(raw);
  return checked.ok ? undefined : checked.rule;
}

/** The segment as accepted, asserting that it was — and unchanged. */
function accepted(raw: string): string {
  const checked = sanitizeSegment(raw);
  assert.ok(checked.ok, `expected ${JSON.stringify(raw)} to be accepted`);
  return checked.segment;
}

// ---------------------------------------------------------------------------
// Refused, one row per rule
// ---------------------------------------------------------------------------

test('a segment carrying a path separator is refused, either separator', () => {
  // Both, on every platform: `a\b` is one legal filename on POSIX and two path
  // components on Windows, so a value whose meaning depends on the host is
  // refused rather than resolved two different ways.
  assert.equal(ruleFor('docs/stories'), 'separator');
  assert.equal(ruleFor('docs\\stories'), 'separator');
  assert.equal(ruleFor('/etc'), 'separator');
  assert.equal(ruleFor('a/../b'), 'separator');
});

test('a segment that is traversal spelled as a name is refused', () => {
  assert.equal(ruleFor('.'), 'traversal');
  assert.equal(ruleFor('..'), 'traversal');
});

test('a segment beginning with a dot is refused', () => {
  // Hidden from the listing a user would check this tool's report against, and
  // the route to `.git`, `.claude` and `.ssh`.
  assert.equal(ruleFor('.git'), 'leading-dot');
  assert.equal(ruleFor('.memlog.md'), 'leading-dot');
});

test('a segment carrying a NUL byte is refused, and the byte is named before the slash', () => {
  assert.equal(ruleFor('safe.txt\u0000.png'), 'nul');
  // The ordering claim from the sanitizer's own comment: a value breaking both
  // rules is reported as the more surprising of the two facts.
  assert.equal(ruleFor('a\u0000/b'), 'nul');
});

test('a segment carrying any other control character is refused', () => {
  // A name holding `\r` or an escape rewrites the line it is printed on, and
  // this tool prints paths.
  assert.equal(ruleFor('spec\rdone'), 'control');
  assert.equal(ruleFor('spec\u001b[2Kdone'), 'control');
  assert.equal(ruleFor('spec\u007f'), 'control');
});

test('an empty or whitespace-only segment is refused', () => {
  // `join(base, '')` is `base`, so an empty segment silently addresses the
  // parent — which is an escape without a single `..` in it.
  assert.equal(ruleFor(''), 'empty');
  assert.equal(ruleFor('   '), 'empty');
  assert.equal(ruleFor('\t'), 'empty');
});

test('a segment ending in a space or a dot is refused', () => {
  // Windows strips both at creation, so the name checked and the name opened
  // would differ.
  assert.equal(ruleFor('secret.txt.'), 'trailing');
  assert.equal(ruleFor('secret.txt '), 'trailing');
});

test('a Windows device name is refused, with or without an extension', () => {
  assert.equal(ruleFor('NUL'), 'reserved');
  assert.equal(ruleFor('nul'), 'reserved');
  assert.equal(ruleFor('CON.txt'), 'reserved');
  assert.equal(ruleFor('com9.md'), 'reserved');
  assert.equal(ruleFor('LPT1'), 'reserved');
});

test('a segment over the byte limit is refused, and the limit is bytes not characters', () => {
  assert.equal(ruleFor('a'.repeat(MAX_SEGMENT_BYTES + 1)), 'too-long');
  // Four bytes each, so 64 of them is 256 — over the limit at a `String#length`
  // of 128, which is the mistake a character count makes.
  assert.equal(ruleFor('\u{1f600}'.repeat(64)), 'too-long');
});

// ---------------------------------------------------------------------------
// Accepted: the other side of every rule
// ---------------------------------------------------------------------------

test('an ordinary BMAD slug is accepted unchanged', () => {
  for (const name of [
    'spec-1-11-locate-sprint-tracking-safely.md',
    'prd-bmad-2026-08-28',
    'implementation-artifacts',
    '_bmad-output',
    'sprint-status.yaml',
    'index.md',
    'a run folder with spaces',
    'caf\u00e9-research',
  ]) {
    assert.equal(accepted(name), name);
  }
});

test('the near neighbour of every refusal is accepted', () => {
  // The half a one-sided suite would miss. Each of these is one edit away from
  // a refused value and is a name a project may legitimately hold.
  assert.equal(accepted('a..b'), 'a..b'); // dots in the middle are not traversal
  assert.equal(accepted('a.b.c'), 'a.b.c'); // dots, just not leading and not last
  assert.equal(accepted('nullable.md'), 'nullable.md'); // `nul` is a prefix, not the stem
  assert.equal(accepted('console.md'), 'console.md'); // `con` likewise
  assert.equal(accepted('com10'), 'com10'); // only COM1..COM9 are devices
  assert.equal(accepted(' leading space'), ' leading space'); // only a *trailing* one is refused
  assert.equal(accepted('a'.repeat(MAX_SEGMENT_BYTES)), 'a'.repeat(MAX_SEGMENT_BYTES));
});

test('an accepted segment comes back byte-identical — the sanitizer repairs nothing', () => {
  // The refuse-rather-than-repair decision, asserted rather than described.
  // Rewriting `a/b` into `a_b` would invent a name the project never wrote and
  // then read from it, which is a guess dressed as a reading.
  const raw = 'spec-{slug}-with.dots and spaces';
  assert.equal(accepted(raw), raw);
});

// ---------------------------------------------------------------------------
// The rule vocabulary itself
// ---------------------------------------------------------------------------

test('every rule in the vocabulary is reachable, and no refusal names one outside it', () => {
  // A rule nobody can trigger is a comment, and a rule fired from outside the
  // list would be a vocabulary with two spellings. Both directions, so neither
  // an unreachable rule nor an unlisted one survives.
  const fired = new Set<SegmentRule>();
  for (const raw of [
    '',
    '\u0000',
    // `a\rb` rather than a bare `\r`, which `trim()` reduces to nothing and is
    // therefore refused as `empty` before `control` is ever asked.
    'a\rb',
    'a\u202estories',
    'a/b',
    'C:stories',
    '..',
    '.git',
    'x.',
    'NUL',
    'a'.repeat(MAX_SEGMENT_BYTES + 1),
  ]) {
    const rule = ruleFor(raw);
    assert.ok(rule !== undefined, `expected ${JSON.stringify(raw)} to be refused`);
    assert.ok(SEGMENT_RULES.includes(rule), `${rule} is not in SEGMENT_RULES`);
    fired.add(rule);
  }
  // The two rules only a whole declared location can break, so the comparison
  // below is over the vocabulary rather than over one entry point's half of it.
  for (const raw of [
    Array(41).fill('x'.repeat(100)).join('/'),
    Array(MAX_COMPONENTS + 1).fill('a').join('/'),
  ]) {
    const rule = pathRuleFor(raw);
    assert.ok(rule !== undefined, 'expected an over-limit location to be refused');
    assert.ok(SEGMENT_RULES.includes(rule), `${rule} is not in SEGMENT_RULES`);
    fired.add(rule);
  }
  assert.deepEqual([...fired].sort(), [...SEGMENT_RULES].sort());
});

// ---------------------------------------------------------------------------
// A declared location: the same rules, minus the one that must not apply
// ---------------------------------------------------------------------------

test('a declared location is split and every component is sanitized as a name', () => {
  const checked = sanitizeDeclaredPath('_bmad-output/implementation-artifacts');
  assert.ok(checked.ok, 'the value this repository actually declares must pass');
  assert.equal(checked.absolute, false);
  assert.deepEqual(checked.components, ['_bmad-output', 'implementation-artifacts']);
  assert.equal(checked.value, '_bmad-output/implementation-artifacts');
});

test('an absolute declared location passes the sanitizer and is left for confinement', () => {
  // FR-74's explicitly tested value. The sanitizer's job is the spelling; where
  // it lands is AD-9's answer, and refusing it here would mean never resolving
  // it and never reporting the path.
  const checked = sanitizeDeclaredPath('/custom/stories');
  assert.ok(checked.ok);
  assert.equal(checked.absolute, true);
  assert.deepEqual(checked.components, ['custom', 'stories']);
});

test('navigation passes a declared location but not a segment — the one deliberate disagreement', () => {
  const checked = sanitizeDeclaredPath('../../elsewhere');
  assert.ok(checked.ok, '`..` in a declared location is navigation, resolved and then confined');
  assert.deepEqual(checked.components, ['..', '..', 'elsewhere']);
  // And the same string as a *name* is refused, which is the difference.
  assert.equal(ruleFor('..'), 'traversal');
});

test('a declared location carrying a NUL, a control character or a backslash is refused', () => {
  const nul = sanitizeDeclaredPath('docs/sto\u0000ries');
  assert.ok(!nul.ok);
  assert.equal(nul.rule, 'nul');

  const control = sanitizeDeclaredPath('docs/sto\rries');
  assert.ok(!control.ok);
  assert.equal(control.rule, 'control');
  assert.equal(control.component, 'sto\rries');

  // The Windows-shaped spelling, refused rather than resolved two ways. Stated
  // in the sanitizer's header as a consequence rather than discovered here.
  const backslash = sanitizeDeclaredPath('C:\\stories');
  assert.ok(!backslash.ok);
  assert.equal(backslash.rule, 'separator');
});

test('a declared location with a hidden component is refused, and the component is named', () => {
  const checked = sanitizeDeclaredPath('docs/.hidden/stories');
  assert.ok(!checked.ok);
  assert.equal(checked.rule, 'leading-dot');
  assert.equal(checked.component, '.hidden');
});

test('a trailing separator is dropped and an interior empty component is refused', () => {
  const trailing = sanitizeDeclaredPath('docs/stories/');
  assert.ok(trailing.ok, 'docs/stories/ and docs/stories name one directory');
  assert.deepEqual(trailing.components, ['docs', 'stories']);

  // A value assembled by something that lost a piece. Collapsing it quietly
  // would resolve a path nobody wrote.
  const doubled = sanitizeDeclaredPath('docs//stories');
  assert.ok(!doubled.ok);
  assert.equal(doubled.rule, 'empty');
});

test('the filesystem root is accepted by the sanitizer, with no components', () => {
  // Accepted here and refused by confinement: this function refuses what cannot
  // be resolved safely, and `/` resolves perfectly well to somewhere out of tree.
  const checked = sanitizeDeclaredPath('/');
  assert.ok(checked.ok);
  assert.equal(checked.absolute, true);
  assert.deepEqual(checked.components, []);
});

test('an empty declared location is refused rather than read as the project root', () => {
  for (const raw of ['', '   ']) {
    const checked = sanitizeDeclaredPath(raw);
    assert.ok(!checked.ok, `expected ${JSON.stringify(raw)} to be refused`);
    assert.equal(checked.rule, 'empty');
  }
});

// ---------------------------------------------------------------------------
// The rules added after the review round found the doctrine wider than the code
// ---------------------------------------------------------------------------

/**
 * A segment carrying one code point, spelled by number.
 *
 * `String.fromCodePoint` rather than a literal, deliberately: the characters
 * these rows are about are invisible or actively reorder the line they sit on,
 * so a literal in this file would be a test whose *source* misrepresents what
 * it tests, which is the very property the `bidi` rule exists against.
 */
function carrying(code: number): string {
  return `a${String.fromCodePoint(code)}b`;
}

test('the characters whose meaning depends on Windows are refused', () => {
  // The header's doctrine is "a value whose meaning depends on the host is
  // refused rather than resolved two ways", and `:` was the hole in it. Both
  // forms matter and neither was refused: `C:stories` is drive-*relative* on
  // Windows, resolved against that drive's own working directory rather than
  // against the project, and `file.txt:stream` names an NTFS alternate data
  // stream, which is content the tool would read while reporting the plain name.
  assert.equal(ruleFor('C:stories'), 'windows-illegal');
  assert.equal(ruleFor('file.txt:stream'), 'windows-illegal');
  for (const character of ['<', '>', '"', '|', '?', '*']) {
    assert.equal(ruleFor(`spec${character}slug`), 'windows-illegal', character);
  }
  // And the near neighbours stay accepted: none of these is one of the seven.
  assert.equal(accepted('spec-slug'), 'spec-slug');
  assert.equal(accepted("it's"), "it's");
  assert.equal(accepted('a;b,c=d'), 'a;b,c=d');
});

test('a directional character is refused as its own rule, not as a control', () => {
  // The threat is different in kind from a carriage return: these do not
  // corrupt the printed line, they make the printed path *misrepresent itself*,
  // so a user comparing this tool's report against a directory listing is
  // comparing a lie with the truth and cannot tell. U+202E is the classic one.
  for (const code of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2069, 0x200e, 0x200f, 0x061c]) {
    assert.equal(ruleFor(carrying(code)), 'bidi', `U+${code.toString(16)}`);
    // Distinct from `control`, so a report can say which of the two happened.
    assert.notEqual(ruleFor(carrying(code)), 'control', `U+${code.toString(16)}`);
  }
});

test('a C1 control is refused, because the stated reason reaches it', () => {
  // "This tool prints paths": a terminal decoding Latin-1 treats 0x9B as a
  // control sequence introducer, so the C0-and-DEL rule was narrower than its
  // own justification.
  assert.equal(ruleFor(carrying(0x80)), 'control');
  assert.equal(ruleFor(carrying(0x9b)), 'control');
  assert.equal(ruleFor(carrying(0x9f)), 'control');
  // U+00A0 is the first code point past C1 and is an ordinary space: accepted.
  assert.equal(accepted(carrying(0xa0)), carrying(0xa0));
});

test('the three console and clock devices are reserved too', () => {
  for (const name of ['CONIN$', 'conout$', 'CLOCK$', 'clock$.txt']) {
    assert.equal(ruleFor(name), 'reserved', name);
  }
});

test('a whole declared location is bounded in bytes and in components', () => {
  // Left to `canonical` before, which *degrades silently* on `ENAMETOOLONG` and
  // hands back the spelling, so an over-long value became an unresolved in-tree
  // answer rather than a refusal.
  // Built from components each well under `MAX_SEGMENT_BYTES`, so it is the
  // whole-path limit under test and not the per-segment one: 41 components of
  // 100 characters is 4140 bytes, and 40 of them is 4039.
  const wide = (count: number): string => Array(count).fill('x'.repeat(100)).join('/');
  assert.equal(pathRuleFor(wide(41)), 'too-long');
  assert.equal(pathRuleFor(wide(40)), undefined);
  // And the per-segment limit still answers first for one very long component,
  // which is the narrower fact and the more useful message.
  assert.equal(pathRuleFor('x'.repeat(MAX_PATH_BYTES + 1)), 'too-long');
  assert.equal(pathRuleFor(`docs/${'x'.repeat(MAX_SEGMENT_BYTES + 1)}`), 'too-long');
  assert.equal(pathRuleFor(Array(MAX_COMPONENTS + 1).fill('a').join('/')), 'too-deep');
  assert.equal(pathRuleFor(Array(MAX_COMPONENTS).fill('a').join('/')), undefined);
});

test('absoluteness is decided by / alone, with no reference to the platform', () => {
  // The one platform-dependent line in a module whose doctrine is platform
  // independence: testing `path.sep` too made a leading backslash absolute on
  // Windows and a `separator` refusal on POSIX, which is one spelling with two
  // answers. There is now no `node:path` import at all, which the architecture
  // test pins.
  assert.equal(pathRuleFor('\\stories'), 'separator');

  const relative = sanitizeDeclaredPath('docs/stories');
  assert.ok(relative.ok);
  assert.equal(relative.absolute, false);

  const absolute = sanitizeDeclaredPath('/custom/stories');
  assert.ok(absolute.ok);
  assert.equal(absolute.absolute, true);
});

test('a run of leading separators is absoluteness, not an empty component', () => {
  // `//etc/passwd` used to be refused as `empty`, which named the wrong fact
  // about a value that is simply an absolute path.
  const doubled = sanitizeDeclaredPath('//etc/passwd');
  assert.ok(doubled.ok, 'a doubled leading separator is still just absolute');
  assert.equal(doubled.absolute, true);
  assert.deepEqual(doubled.components, ['etc', 'passwd']);
  assert.equal(doubled.normalized, '/etc/passwd');
});

test('the spelling a caller may resolve is rebuilt from the components checked', () => {
  // The gap this field closes: the caller validated a decomposition and then
  // resolved the raw string, so on a platform where the two can disagree it was
  // checking one value and reading another.
  const trailing = sanitizeDeclaredPath('docs/stories/');
  assert.ok(trailing.ok);
  assert.equal(trailing.value, 'docs/stories/', 'what the project wrote is kept');
  assert.equal(trailing.normalized, 'docs/stories', 'what the resolver is handed');

  const navigating = sanitizeDeclaredPath('../../elsewhere');
  assert.ok(navigating.ok);
  assert.equal(navigating.normalized, '../../elsewhere');

  const root = sanitizeDeclaredPath('/');
  assert.ok(root.ok);
  assert.equal(root.normalized, '/', 'the filesystem root still spells as itself');
});
