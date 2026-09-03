/**
 * The gate's tokenizer.
 *
 * `stripComments` ran with no awareness of string literals, so
 * `const u = 'http://x'; writeFileSync(p, d);` became `const u = 'http:` and the
 * write vanished. The tool's own `server.ts` builds `` `http://${…}` ``, so the
 * gate was scanning a mangled copy of real source. A `/*` inside a string
 * swallowed code to the next `*​/`, and a regex containing a quote desynced the
 * scan entirely.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SPECIFIER_PATTERN, codeMatches, scanSource } from './gate.ts';

const visible = (code: string, name: string): boolean =>
  new RegExp(`(?:\\.|\\b)${name}\\s*\\(`).test(code);

test('a URL in a string literal does not truncate the scan', () => {
  // The reviewer's exact reproduction.
  const { code } = scanSource("const u = 'http://x'; writeFileSync(p, d);");
  assert.ok(visible(code, 'writeFileSync'), `writeFileSync hidden by a string: ${code}`);
});

test('a block-comment opener inside a string does not swallow code', () => {
  const { code } = scanSource("const s = '/*'; rmSync(p); const t = '*/';");
  assert.ok(visible(code, 'rmSync'), `rmSync hidden by a fake comment opener: ${code}`);
});

test('a line-comment marker inside a string does not blank the rest of the line', () => {
  const { code } = scanSource("const marker = '// not a comment'; writeFileSync(p, d);");
  assert.ok(visible(code, 'writeFileSync'), code);
});

test('a real comment is blanked in both views', () => {
  const source = 'const a = 1; // writeFileSync(p, d)\n/* rmSync(p) */\nconst b = 2;';
  const { code, withLiterals } = scanSource(source);
  assert.ok(!visible(code, 'writeFileSync'), 'a commented call must not be a violation');
  assert.ok(!visible(code, 'rmSync'));
  assert.ok(!visible(withLiterals, 'writeFileSync'));
  assert.match(code, /const a = 1;/);
  assert.match(code, /const b = 2;/);
});

test('template interpolations are treated as code, their text is not', () => {
  const source = 'const url = `http://${host}:${port}/`; const x = `pre ${rmSync(p)} post`;';
  const { code } = scanSource(source);
  assert.match(code, /host/, 'an interpolation is code and must survive');
  assert.match(code, /port/);
  assert.ok(!/http:/.test(code), `literal text should be blanked: ${code}`);
  assert.ok(visible(code, 'rmSync'), `a call inside an interpolation must be seen: ${code}`);
});

test("the tool's own url template does not hide anything after it", () => {
  const source = [
    'const handle = {',
    '  url: `http://${addressInfo.address}:${addressInfo.port}/`,',
    '};',
    'writeFileSync(p, d);',
  ].join('\n');
  const { code } = scanSource(source);
  assert.ok(visible(code, 'writeFileSync'), code);
});

test('a regex containing quotes does not desync the scan', () => {
  const source = "const q = /['\"]/g; writeFileSync(p, d);";
  const { code } = scanSource(source);
  assert.ok(visible(code, 'writeFileSync'), `a regex with quotes desynced the scan: ${code}`);
});

test('a regex body is blanked, so it cannot produce a false positive', () => {
  const { code } = scanSource('const p = /writeFileSync\\(/; const q = 1;');
  assert.ok(!visible(code, 'writeFileSync'), `a regex body must not read as a call: ${code}`);
  assert.match(code, /const q = 1;/);
});

test('division is not mistaken for a regex', () => {
  const { code } = scanSource('const ratio = width / height; writeFileSync(p, d);');
  assert.ok(visible(code, 'writeFileSync'), `division consumed real code: ${code}`);
  assert.match(code, /width/);
  assert.match(code, /height/);
});

test('import specifiers survive in the literal-preserving view', () => {
  const source = "import { readFile } from 'node:fs/promises';\nimport fs from 'node:fs';";
  const { code, withLiterals } = scanSource(source);
  assert.match(withLiterals, /'node:fs\/promises'/);
  assert.match(withLiterals, /'node:fs'/);
  // And blanked in the code view, which is why the import scan uses the other.
  assert.ok(!/node:fs/.test(code));
});

test('an escaped quote does not end a string early', () => {
  const { code } = scanSource("const s = 'it\\'s fine'; writeFileSync(p, d);");
  assert.ok(visible(code, 'writeFileSync'), code);
});

test('line numbering is preserved so messages stay meaningful', () => {
  const source = "const a = 'x';\n// comment\nconst b = `y`;\n";
  const { code, withLiterals } = scanSource(source);
  assert.equal(code.split('\n').length, source.split('\n').length);
  assert.equal(withLiterals.split('\n').length, source.split('\n').length);
});

test('an unterminated string does not consume the rest of the file', () => {
  const { code } = scanSource("const broken = 'oops\nwriteFileSync(p, d);");
  assert.ok(visible(code, 'writeFileSync'), `an unterminated string ate the file: ${code}`);
});

// ---------------------------------------------------------------------------
// Specifiers, and the phantom the literal-preserving view can produce
// ---------------------------------------------------------------------------

test('both views index the same offsets, which is what codeMatches relies on', () => {
  // Not a stylistic property: `codeMatches` reads `code[match.index]` for a
  // match found in `withLiterals`. If blanking ever stopped being
  // character-for-character the check would silently address the wrong column
  // and start discarding real imports.
  const source =
    "const s = 'a b';\n/* c */ import x from 'y';\nconst t = `k${1}`;\nconst r = /a'b/;\n";
  const { code, withLiterals } = scanSource(source);
  assert.equal(code.length, source.length);
  assert.equal(withLiterals.length, source.length);
});

test('prose ending in the word from is not read as an import', () => {
  // Measured on `src/adapters/fs/walk.ts`, which really carries this sentence.
  // The literal-preserving view keeps it, so `from` plus the string's own
  // closing quote matched, and the specifier ran on to the next quote in the
  // file. Harmless where it was found; a purity violation if it were written
  // inside `src/domain/`, where every unrecognized specifier counts as
  // outgoing.
  const source = [
    "const reason =",
    "  first === '.'",
    "    ? 'a second spelling of the directory the walk started from'",
    "    : `a second spelling of ${first}, which is already reported`;",
    // The quote that closes the phantom. In `walk.ts` it is simply the next
    // string literal in the file; without one the phantom never terminates and
    // the raw pattern finds nothing, which is why the fixture carries it.
    "const kind = 'alias';",
  ].join('\n');
  const scanned = scanSource(source);

  // The raw view is where the phantom lives -- asserted, so this row fails if
  // the pattern is ever "fixed" by narrowing it instead, which would hide the
  // reason this filter exists.
  const raw = [...scanned.withLiterals.matchAll(SPECIFIER_PATTERN)];
  assert.equal(raw.length, 1, 'the phantom is gone from the raw view; this row is now vacuous');

  assert.deepEqual(codeMatches(scanned, SPECIFIER_PATTERN), []);
});

test('a real import beside that prose is still found', () => {
  // The other direction. A filter that discarded everything would satisfy the
  // row above and break the gate entirely.
  const source = [
    "import { walk } from './walk.ts';",
    "const reason = 'the directory the walk started from'",
  ].join('\n');
  const found = codeMatches(scanSource(source), SPECIFIER_PATTERN).flatMap((m) =>
    m[2] === undefined ? [] : [m[2]],
  );
  assert.deepEqual(found, ['./walk.ts']);
});
