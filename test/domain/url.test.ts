/**
 * AD-18's grammar, over the pure functions in isolation.
 *
 * Three properties, and each is a claim `src/domain/url.ts`'s header makes:
 *
 *   1. **It is a bijection.** Every path the walk can produce round-trips
 *      through a URL and back to itself — the property that stops two artifacts
 *      sharing one permalink, and the reason this half of NFR-17 takes the
 *      opposite policy from the filesystem sanitizer beside it.
 *   2. **Traversal collapses before anything looks at it.** `..` in every
 *      encoding normalizes away, in the stated order — decode, then normalize.
 *   3. **The grammar cannot move silently.** One pinned example URL, so a
 *      refactor that changes what a link looks like fails here rather than
 *      breaking every permalink a reader saved.
 *
 * What is *served* at these URLs is `test/server.test.ts`'s, over the composed
 * adapter. Nothing here binds a socket or reads a file, because nothing in the
 * module under test can.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARTIFACT_URL_PREFIX,
  SECTION_MARKER,
  artifactUrl,
  parseArtifactUrl,
  sectionUrl,
} from '../../src/domain/url.ts';

/** The path back out of a URL, or a message naming what came out instead. */
function pathOf(url: string): string | undefined {
  return parseArtifactUrl(url)?.path;
}

test('a pinned URL, so the grammar cannot move without anyone noticing', () => {
  // The one assertion in this file that is not a property. Every other row here
  // would still pass if the prefix became `/a/`, the separator became `~`, or
  // the encoding became base64 — all of which round-trip perfectly and all of
  // which break every permalink anyone has saved. AD-18 calls the grammar a
  // *contract*, and a contract is a literal somewhere.
  assert.equal(
    artifactUrl('_bmad-output/planning-artifacts/prds/prd.md'),
    '/artifact/_bmad-output/planning-artifacts/prds/prd.md',
  );
  assert.equal(
    sectionUrl('_bmad-output/planning-artifacts/prds/prd.md', 'goals'),
    '/artifact/_bmad-output/planning-artifacts/prds/prd.md/section/goals',
  );
  assert.equal(ARTIFACT_URL_PREFIX, '/artifact');
  assert.equal(SECTION_MARKER, 'section');
});

test('a path needing encoding round-trips exactly, character for character', () => {
  // Every character that means something in a URL, plus a non-ASCII one,
  // spread over three segments so the separator is exercised too. This is the
  // bijection: what comes back is the string that went in, not a repair of it.
  const paths = [
    'docs/a file with spaces.md',
    'docs/hash#in-name.md',
    'docs/query?in-name.md',
    'docs/percent%in-name.md',
    'docs/ampersand&plus+in-name.md',
    'docs/café/résumé.md',
    'docs/quote\'s "name".md',
    'docs/<img src=x onerror=alert(1)>.md',
    'docs/back\\slash.md',
    'docs/semi;colon,comma=equals.md',
    '_bmad-output/specs/spec-2-1a-open-an-artifact-at-its-own-url.md',
  ];
  for (const path of paths) {
    const url = artifactUrl(path);
    assert.equal(pathOf(url), path, `${path} did not survive ${url}`);
    // And the URL itself carries nothing that could end an attribute, start a
    // scheme or split a path: the encoder leaves only characters legal in a
    // path segment, which is why `markup`'s HTML escaping on top of it is
    // sufficient rather than load-bearing.
    assert.match(url, /^\/artifact\/[A-Za-z0-9\-._~!'()*%/]+$/, url);
  }
});

test('two paths that a sanitizer would collapse keep two distinct URLs', () => {
  // The recorded evidence behind "encoder, not sanitizer": a lossy transform
  // maps `spec-my/thing`, `spec-my thing` and `spec-my-thing` onto one string,
  // which in a URL is one permalink addressing three artifacts.
  const paths = ['spec-my/thing', 'spec-my thing', 'spec-my-thing'];
  const urls = paths.map(artifactUrl);
  assert.equal(new Set(urls).size, 3, `three paths, ${String(new Set(urls).size)} URLs: ${urls.join(' ')}`);
  for (const path of paths) assert.equal(pathOf(artifactUrl(path)), path);
});

test('a segment spelling the section marker is escaped, so the grammar stays unambiguous', () => {
  // A directory genuinely called `section` is legal, and unescaped it would
  // make `docs/section/x.md` read as artifact `docs`, section `x.md`. The
  // escape keeps the round trip exact and leaves no bare marker in the artifact
  // half of the URL.
  const url = artifactUrl('docs/section/x.md');
  assert.equal(url, '/artifact/docs/%73ection/x.md');
  assert.deepEqual(parseArtifactUrl(url), { path: 'docs/section/x.md', section: undefined });
  // And the marker itself still parses as a marker when it is one.
  assert.deepEqual(parseArtifactUrl('/artifact/docs/section/x.md'), {
    path: 'docs',
    section: 'x.md',
  });
});

test('the section shape parses, and a section id round-trips like a path segment', () => {
  assert.deepEqual(parseArtifactUrl('/artifact/docs/prd.md/section/goals'), {
    path: 'docs/prd.md',
    section: 'goals',
  });
  for (const id of ['goals', 'a section', 'why#now', '100%', 'café']) {
    const parsed = parseArtifactUrl(sectionUrl('docs/prd.md', id));
    assert.equal(parsed?.section, id);
    assert.equal(parsed?.path, 'docs/prd.md');
  }
  // A section id equal to the marker is not special: the marker is found in the
  // segment *before* it.
  assert.deepEqual(parseArtifactUrl('/artifact/docs/section/section'), {
    path: 'docs',
    section: 'section',
  });
});

test('a shape the grammar does not have is refused rather than repaired', () => {
  // Each of these is *adjacent* to a real URL, which is exactly why none may be
  // guessed into one. A miss here becomes the same 404 as any unknown path.
  for (const url of [
    '/artifact/docs/section',
    '/artifact/docs/section/a/b',
    '/artifact/docs/prd.md/section/',
    '/artifact',
    '/artifact/',
    '/artifact//',
    '/',
    '/artifacts/docs/prd.md',
    '/artifactory/docs',
    'artifact/docs/prd.md',
    '',
  ]) {
    assert.equal(parseArtifactUrl(url), undefined, `${url} must not parse`);
  }
});

test('a malformed percent escape is a miss, not a throw', () => {
  // An ordinary request from the network, not a defect in this process:
  // `decodeURIComponent` throws a `URIError` on each of these, and a throw here
  // would reach the request handler as a 500 for what is a bad address.
  for (const url of ['/artifact/%zz', '/artifact/%', '/artifact/%e0%a4', '/artifact/a/%ed%a0%80']) {
    assert.doesNotThrow(() => parseArtifactUrl(url));
    assert.equal(parseArtifactUrl(url)?.path ?? undefined, undefined, url);
  }
  assert.equal(parseArtifactUrl('/artifact/docs/prd.md/section/%zz'), undefined);
});

test('dot segments normalize per RFC 3986, in every encoding', () => {
  // The order is decode *then* normalize, and it is the order that makes these
  // agree: RFC 3986 treats `%2e%2e` as an ordinary segment, so a normalizer
  // running first would pass it through untouched and hand `%2e%2e/etc` to the
  // lookup as itself.
  assert.equal(pathOf('/artifact/a/../b'), 'b');
  assert.equal(pathOf('/artifact/a/./b'), 'a/b');
  assert.equal(pathOf('/artifact/a/b/../../c'), 'c');
  assert.equal(pathOf('/artifact/%2e%2e/%2e%2e/etc/passwd'), 'etc/passwd');
  assert.equal(pathOf('/artifact/..%2f..%2fetc%2fpasswd'), 'etc/passwd');
  assert.equal(pathOf('/artifact/%2e%2e%2fetc'), 'etc');
  assert.equal(pathOf('/artifact/a%2f..%2fb'), 'b');
  // A `..` with nothing left to climb is dropped rather than refused: the
  // result is a lookup key, and a key that climbed past the root simply names
  // no row. What matters is that nothing outside the key space survives.
  assert.equal(pathOf('/artifact/../../../etc/passwd'), 'etc/passwd');
  assert.equal(parseArtifactUrl('/artifact/..'), undefined);
  assert.equal(parseArtifactUrl('/artifact/a/..'), undefined);
});

test('no URL can name anything with a leading slash or a drive, whatever it spells', () => {
  // The acceptance criterion, stated as a property over the shapes an attacker
  // reaches for. None of these is *refused*; each simply produces a key, and a
  // key is only ever compared against the snapshot's rows.
  for (const url of [
    '/artifact/%2fetc%2fpasswd',
    '/artifact/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/artifact/....//etc/passwd',
    '/artifact/%252e%252e%252fetc',
  ]) {
    const path = pathOf(url);
    assert.notEqual(path, undefined, `${url} produced no key at all`);
    assert.ok(path !== undefined && !path.startsWith('/'), `${url} produced ${String(path)}`);
  }
  // `%252e` is a *literal* `%2e` in a filename, not a second-round dot segment:
  // one decode, never two, or a name containing a percent could smuggle a
  // traversal past the normalizer.
  assert.equal(pathOf('/artifact/%252e%252e%252fetc'), '%2e%2e%2fetc');
});

test('a trailing slash names the same resource as none', () => {
  assert.deepEqual(parseArtifactUrl('/artifact/docs/prd.md/'), parseArtifactUrl('/artifact/docs/prd.md'));
  assert.deepEqual(
    parseArtifactUrl('/artifact/docs/prd.md/section/goals/'),
    parseArtifactUrl('/artifact/docs/prd.md/section/goals'),
  );
  assert.equal(pathOf('/artifact/docs/prd.md//'), 'docs/prd.md');
});

test('a query string and a fragment are cut before the grammar sees them', () => {
  // The adapter strips the query itself, and a request-target never carries a
  // fragment — so this is the grammar being total over what it is handed rather
  // than correct only for its current caller.
  assert.equal(pathOf('/artifact/docs/prd.md?x=1'), 'docs/prd.md');
  assert.equal(pathOf('/artifact/docs/prd.md#goals'), 'docs/prd.md');
  assert.equal(pathOf('/artifact/docs/prd.md#a?b'), 'docs/prd.md');
  // And a `#` that is part of a *name* survives, because it arrives encoded.
  assert.equal(pathOf(artifactUrl('docs/a#b.md')), 'docs/a#b.md');
});

test('the encoder refuses a path no walk entry can carry, rather than silently mangling it', () => {
  // `WalkEntry.relative` is `/`-separated, never absolute, never empty and
  // never holds a dot segment. Each of these would encode to something that
  // does not round-trip — `.` and `..` normalize away on the way back — so the
  // bijection would quietly become false. A throw reaches the adapter's own
  // `catch` and becomes a 500 that can be reported.
  for (const path of ['', '/docs/prd.md', 'docs//prd.md', 'docs/./prd.md', 'docs/../prd.md', '..', '.']) {
    assert.throws(() => artifactUrl(path), /artifact URL|path segment|dot segment/, path);
  }
  assert.throws(() => sectionUrl('docs/prd.md', ''), /section id/);
});
