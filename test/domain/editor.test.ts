/**
 * The open-in-editor href, over the pure function in isolation.
 *
 * **What this file can and cannot claim, stated first so nothing here implies
 * more than it proves.** There is no browser and no editor in this suite, so
 * whether a click opens anything is unverifiable and is never asserted. What is
 * asserted is everything that is decidable about the *string*: its scheme, that
 * it carries an absolute path, that percent-encoding is a bijection over the
 * characters a filename may legally contain, and that the two inputs which
 * would produce a broken href are refused rather than formatted.
 *
 * That division is the reason `src/domain/editor.ts` is a domain module at all:
 * a pure function from a path to an href needs no server, no filesystem and no
 * page to be pinned exactly, and the half that cannot be pinned is the half
 * that lives entirely outside this process.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EDITOR_URL_PREFIX, editorUrl } from '../../src/domain/editor.ts';

/**
 * The href's path half, decoded back segment by segment.
 *
 * Per segment rather than over the joined string, on `src/domain/url.ts`'s own
 * finding: decoding the whole thing would turn a `%2F` inside a name into a
 * separator and make the round trip look exact while being many-to-one.
 */
function decodePathOf(href: string): string {
  assert.ok(href.startsWith(`${EDITOR_URL_PREFIX}/`), `${href} does not carry the editor prefix`);
  const encoded = href.slice(`${EDITOR_URL_PREFIX}/`.length);
  return `/${encoded.split('/').map(decodeURIComponent).join('/')}`;
}

test('the scheme is the one this module names, and the href is pinned exactly', () => {
  // Pinned as a whole string, not matched loosely: this is what a reader's
  // browser is handed, so a refactor that changes its shape should fail here
  // rather than be discovered by a link that no longer opens.
  assert.equal(
    editorUrl('/home/jamie/project/_bmad-output/planning-artifacts/prd.md'),
    'vscode://file/home/jamie/project/_bmad-output/planning-artifacts/prd.md',
  );
  // And the prefix is the constant rather than a second spelling of it.
  assert.equal(EDITOR_URL_PREFIX, 'vscode://file');
  assert.ok(editorUrl('/a/b.md').startsWith(`${EDITOR_URL_PREFIX}/`));
});

test('a path needing encoding survives the round trip, character for character', () => {
  // The matrix's encoding row, over every character class that has to survive:
  // a space, the two that would otherwise start a query or a fragment, the
  // escape character itself, and a non-ASCII codepoint that is two UTF-8 bytes.
  // Each is asserted *encoded* in the href and *identical* after decoding,
  // because either half alone is satisfiable by a formatter that is wrong: an
  // encoder that escapes nothing round-trips, and one that escapes lossily
  // looks encoded.
  const path = '/home/j d/a b/c#d?e%f/über.md';
  const href = editorUrl(path);
  assert.equal(href, 'vscode://file/home/j%20d/a%20b/c%23d%3Fe%25f/%C3%BCber.md');
  // Each raw character is gone, and its escape is there. `%` is checked by its
  // escape alone: it is the escape *prefix*, so "the href contains no `%`" is
  // unsatisfiable by any encoder — asserting it would have been a test that can
  // only fail, which is what the first draft of this row was.
  for (const [raw, escaped] of [
    [' ', '%20'],
    ['#', '%23'],
    ['?', '%3F'],
    ['ü', '%C3%BC'],
  ] as const) {
    assert.ok(!href.includes(raw), `${raw} reached the href unencoded`);
    assert.ok(href.includes(escaped), `${raw} is not escaped as ${escaped}`);
  }
  assert.ok(href.includes('e%25f'), 'a literal % must be escaped rather than left to start one');
  assert.equal(decodePathOf(href), path, 'the path did not survive the round trip');
});

test('the encoding is injective, so two paths never produce one href', () => {
  // The property the round trip above implies and this states directly: it is
  // what stops the href for one artifact opening another. `src/domain/url.ts`
  // asserts the same thing about permalinks, and for the identical reason.
  const paths = [
    '/p/spec-my thing.md',
    '/p/spec-my-thing.md',
    '/p/spec-my/thing.md',
    '/p/spec-my%20thing.md',
    '/p/spec-my#thing.md',
  ];
  const hrefs = paths.map(editorUrl);
  assert.equal(new Set(hrefs).size, paths.length, `two paths collided: ${hrefs.join(', ')}`);
  for (const path of paths) assert.equal(decodePathOf(editorUrl(path)), path);
});

test('a separator is never encoded, so the path stays a path', () => {
  // The one character that must *not* be escaped, asserted on its own: escaping
  // it would produce a single opaque segment, which is a URL that names nothing
  // an editor can open even though it round-trips through this file's helper.
  const href = editorUrl('/a/b/c/d.md');
  assert.ok(!href.includes('%2F') && !href.includes('%2f'));
  assert.deepEqual(href.slice(`${EDITOR_URL_PREFIX}/`.length).split('/'), ['a', 'b', 'c', 'd.md']);
});

test('a relative path is refused rather than formatted into a broken href', () => {
  // `vscode://file/rel/ative` looks like a valid href and opens the wrong file
  // or nothing at all. So the module refuses, which reaches the HTTP adapter's
  // catch as a 500 the reader can report — `src/domain/url.ts`'s own policy for
  // an input no walk entry can produce.
  for (const relative of [
    '_bmad-output/planning-artifacts/prd.md',
    './prd.md',
    '../prd.md',
    'prd.md',
    // A bare drive letter with no separator is drive-*relative* on Windows, so
    // it is as relative as `sub/dir` and is refused with it.
    'C:prd.md',
  ]) {
    assert.throws(() => editorUrl(relative), /absolute path/, `${relative} must be refused`);
  }
});

test('an empty path is refused, and so is a path that is separators alone', () => {
  assert.throws(() => editorUrl(''), /it was empty/);
  // Whitespace is not a path either; it falls to the absoluteness check rather
  // than to a second guard, because a trimmed empty string is still not absolute.
  assert.throws(() => editorUrl('   '), /absolute path/);
  // Separators alone are absolute and yet name no file: without this the href
  // would be `vscode://file/`, the empty destination `src/render/components.ts`
  // already refuses at the button boundary for the same reason.
  for (const nothing of ['/', '//', '///']) {
    assert.throws(() => editorUrl(nothing), /names no file/, `${nothing} must be refused`);
  }
});

test('a doubled or trailing separator is squeezed, because this is an address not an identity', () => {
  // The one normalization this module performs, and the reason it is right here
  // where `src/domain/url.ts` refuses the same shapes: a permalink is an
  // identity and must be a bijection, while this is an address to open — and
  // `/a//b`, `/a/b/` and `/a/b` all name one file on every platform. `canonical`
  // never emits any of them, so nothing is lost either way.
  assert.equal(editorUrl('/a//b'), editorUrl('/a/b'));
  assert.equal(editorUrl('/a/b/'), editorUrl('/a/b'));
});

test('a directory is formatted exactly as a file is, because an editor opens a folder', () => {
  // The matrix's directory row, at this layer: a run folder or a sharded
  // document has no extension and no body, and nothing about the href changes.
  assert.equal(
    editorUrl('/home/jamie/project/_bmad-output/implementation-artifacts/run-2026-09-04'),
    'vscode://file/home/jamie/project/_bmad-output/implementation-artifacts/run-2026-09-04',
  );
});

test('a Windows path is absolute by its drive prefix, and both its separators split', () => {
  // The platform this suite does not run on, asserted anyway because
  // `src/adapters/fs/paths.ts` returns canonical paths in the platform's own
  // spelling and this module has no `node:path` to ask which platform that is.
  // A backslash separates only after a drive-shaped prefix — on POSIX it is a
  // legal filename character, which the row below is what pins.
  assert.equal(editorUrl('C:\\Users\\jamie\\p\\prd.md'), 'vscode://file/C%3A/Users/jamie/p/prd.md');
  assert.equal(editorUrl('C:/Users/jamie/p/prd.md'), 'vscode://file/C%3A/Users/jamie/p/prd.md');
  // The drive colon is escaped rather than special-cased back, and it decodes.
  assert.equal(decodeURIComponent('C%3A'), 'C:');
});

test('a UNC share is absolute, and both its spellings give one href', () => {
  // **The reason this row exists.** `isAbsolutePath` used to recognise only `/`
  // and a drive prefix, and its doc block claimed a UNC share could not arise
  // because `canonical` "resolves through the platform's own resolver".
  // `canonical` is `resolve()` plus `realpathSync.native`, and neither turns
  // `\\server\share` into a drive-lettered path — so a project on a network
  // share threw here, the throw reached the HTTP adapter's catch, and **every**
  // artifact page answered 500 while the Dashboard kept working.
  //
  // Both leading separators survive: the first is the authority component, the
  // second begins the path. Squeezing one the way an ordinary doubled separator
  // is squeezed would make the host an ordinary segment, so the href would name
  // a different location while still looking valid.
  const expected = 'vscode://file//server/share/docs/prd.md';
  assert.equal(editorUrl('//server/share/docs/prd.md'), expected);
  assert.equal(editorUrl('\\\\server\\share\\docs\\prd.md'), expected, 'the two spellings are one location');
  // The host is not escaped into a segment, which is what the earlier form did.
  assert.doesNotMatch(editorUrl('\\\\server\\share\\a.md'), /%5C/i, 'a UNC separator is a separator, not a character');
});

test('a backslash in a POSIX name is a character, not a separator', () => {
  // The other side of the row above, and the reason the separator set depends
  // on the drive prefix rather than always including `\`: splitting on it here
  // would break one filename into two segments and produce an href for a file
  // that does not exist. `src/domain/url.ts` makes the same call for the same
  // reason.
  const path = '/home/jamie/a\\b.md';
  const href = editorUrl(path);
  assert.equal(href, 'vscode://file/home/jamie/a%5Cb.md');
  assert.equal(decodePathOf(href), path);
});
