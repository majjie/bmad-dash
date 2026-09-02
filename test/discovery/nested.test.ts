/**
 * Discovery guards — and the reason this file lives in a subdirectory.
 *
 * `node --test "test/*.test.ts"` does not descend. A failing test one directory
 * down was simply not collected: the suite reported 38 pass and exit 0 while a
 * recursive pattern reported 39 tests and 1 failure. A green run was not
 * evidence that the suite had run.
 *
 * Two things guard that now. This file's *location* means a single-level
 * pattern stops collecting it, and `scripts/run-tests.ts` fails when the
 * reported total drops below a floor — which is what turns "collected nothing"
 * into a red build, since `node --test` exits 0 when a pattern matches nothing.
 *
 * The tests below pin both hazards so neither can be quietly reintroduced by
 * "simplifying" the pattern.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const RUNNER = join(REPO_ROOT, 'scripts', 'run-tests.ts');

interface Ran {
  readonly code: number | null;
  readonly output: string;
}

function runNode(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = {}): Promise<Ran> {
  return new Promise<Ran>((resolve, reject) => {
    // `node:test` sets NODE_TEST_CONTEXT in this process. Inherited by a child
    // that itself runs `node --test`, it makes the child skip running files
    // with a "run() is being called recursively" warning — so these checks
    // would silently measure nothing. Strip it for the nested run.
    const inherited = { ...process.env, ...env };
    delete inherited.NODE_TEST_CONTEXT;

    const child = spawn(process.execPath, [...args], { cwd, env: inherited });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c: string) => {
      output += c;
    });
    child.stderr.on('data', (c: string) => {
      output += c;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

/** A throwaway project with one passing top-level and one failing nested test. */
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-disc-'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
  await mkdir(join(root, 'test', 'nested'), { recursive: true });
  await writeFile(
    join(root, 'test', 'top.test.ts'),
    "import test from 'node:test';\ntest('top', () => {});\n",
  );
  await writeFile(
    join(root, 'test', 'nested', 'deep.test.ts'),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\n" +
      "test('deep and failing', () => assert.equal(1, 2));\n",
  );
  return root;
}

test('this test file is itself in a subdirectory of test/', () => {
  // If discovery regresses to a single level, this file stops running — and the
  // runner's count floor is what makes that absence fail the build.
  const fromTestDir = relative(join(REPO_ROOT, 'test'), HERE);
  assert.notEqual(fromTestDir, '', 'this file must not sit directly in test/');
  assert.ok(!fromTestDir.startsWith('..'), 'this file must live under test/');

  // On the *file's* path, and `>= 2`. The previous version asked whether the
  // directory's path had at least one segment, which `String.prototype.split`
  // guarantees for every input — so it could not fail, and the depth this file
  // depends on for its entire purpose was unasserted.
  const fileFromTestDir = relative(join(REPO_ROOT, 'test'), fileURLToPath(import.meta.url));
  assert.ok(
    fileFromTestDir.split(sep).length >= 2,
    `this file must be at least one directory below test/, got ${fileFromTestDir}`,
  );
});

test('a single-level pattern misses a nested failing test, and still exits 0', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const shallow = await runNode(['--test', '--test-reporter=spec', 'test/*.test.ts'], root);

  // The hazard, pinned: green, and blind to the failure one level down.
  assert.equal(shallow.code, 0, 'the single-level pattern is expected to pass, wrongly');
  assert.match(shallow.output, /ℹ tests 1$/m);
  assert.doesNotMatch(shallow.output, /deep and failing/);
});

test('the recursive pattern collects the nested test and fails', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const deep = await runNode(['--test', '--test-reporter=spec', 'test/**/*.test.ts'], root);

  assert.notEqual(deep.code, 0, 'the recursive pattern must surface the nested failure');
  assert.match(deep.output, /ℹ tests 2$/m);
  assert.match(deep.output, /deep and failing/);
});

test('a pattern matching nothing exits 0, which is why the floor exists', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const nothing = await runNode(
    ['--test', '--test-reporter=spec', 'test/**/*.nonexistent.ts'],
    root,
  );

  assert.equal(nothing.code, 0, 'node --test exits 0 on zero matches');
  assert.match(nothing.output, /ℹ tests 0$/m);
});

test('the runner fails when fewer tests run than the floor', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const starved = await runNode([RUNNER], root, {
    BMAD_DASH_TEST_PATTERN: 'test/**/*.nonexistent.ts',
    BMAD_DASH_TEST_MIN: '1',
  });

  assert.notEqual(starved.code, 0, 'collecting nothing must fail the build');
  assert.match(starved.output, /only 0 tests ran/);
});

test('the runner passes when the floor is met', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const ok = await runNode([RUNNER], root, {
    BMAD_DASH_TEST_PATTERN: 'test/top.test.ts',
    BMAD_DASH_TEST_MIN: '1',
  });

  assert.equal(ok.code, 0, ok.output);
  assert.match(ok.output, /ℹ tests 1$/m);
});

/**
 * The floor's own guard.
 *
 * `Number('abc')` is `NaN` and every `<` comparison against `NaN` is false, so
 * an unparseable override silently switched the floor off entirely. `Number('')`
 * is 0, so a CI variable *declared without a value* did the same — the guard
 * protecting all of the tests was disableable by a typo. An unverified guard is
 * exactly what this file exists to prevent, so the guard is verified too.
 */
for (const bad of ['', 'abc', '-1', '1.5', 'null', '0x10', '1e3', ' ']) {
  test(`the runner refuses a floor override of ${JSON.stringify(bad)}`, async (t) => {
    const root = await fixture();
    t.after(() => rm(root, { recursive: true, force: true }));

    const ran = await runNode([RUNNER], root, {
      // A pattern that collects nothing: if the override were honoured as a
      // disabled floor, this would exit 0 with zero tests run.
      BMAD_DASH_TEST_PATTERN: 'test/**/*.nonexistent.ts',
      BMAD_DASH_TEST_MIN: bad,
    });

    assert.notEqual(ran.code, 0, `a floor of ${JSON.stringify(bad)} must not be accepted`);
    assert.match(
      ran.output,
      /BMAD_DASH_TEST_MIN must be an integer of 1 or more/,
      `expected a rejection naming the bad value, got: ${ran.output}`,
    );
    assert.match(ran.output, new RegExp(JSON.stringify(JSON.stringify(bad)).slice(1, -1)));
  });
}

test('the runner refuses an empty pattern override', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const ran = await runNode([RUNNER], root, { BMAD_DASH_TEST_PATTERN: '' });

  assert.notEqual(ran.code, 0);
  assert.match(ran.output, /BMAD_DASH_TEST_PATTERN is set but empty/);
});

test('a valid floor override is still honoured', async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const ran = await runNode([RUNNER], root, {
    BMAD_DASH_TEST_PATTERN: 'test/top.test.ts',
    BMAD_DASH_TEST_MIN: '1',
  });

  assert.equal(ran.code, 0, ran.output);
});

test('the runner reports the last summary, not a nested one', async (t) => {
  // Assertion messages in this very file quote the output of nested runner
  // runs. Parsing the *first* summary would report a fixture's count and mask
  // the real result, so the parse takes the last match.
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  // The fixture's nested test fails, so the real total is 2 and the run is red.
  const ran = await runNode([RUNNER], root, {
    BMAD_DASH_TEST_PATTERN: 'test/**/*.test.ts',
    BMAD_DASH_TEST_MIN: '2',
  });

  assert.notEqual(ran.code, 0, 'the nested failure must surface');
  assert.doesNotMatch(
    ran.output,
    /only 2 tests ran/,
    'the floor must not have been misread from a nested summary',
  );
});
