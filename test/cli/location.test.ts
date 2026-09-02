/**
 * Recognizing a project, and the eleven answers to "is this one".
 *
 * The point of this file is that the failures are *distinguishable*. One
 * "not a BMAD project" covering a typo'd path, a file, a permissions problem
 * and a genuine non-project would be a single sentence hiding four different
 * next actions, and the reader would have to guess which.
 *
 * Every case runs against a real directory. Recognition is entirely a question
 * about a filesystem, so there is nothing here a fake could honestly stand in
 * for.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { resolveLocation, MARKERS } from '../../src/cli/location.ts';
import { canonical, toPlatform } from '../../src/adapters/fs/paths.ts';
import { makeProjectDir } from '../support/project.ts';

async function bare(t: { after: (fn: () => unknown) => void }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bmad-dash-loc-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return toPlatform(canonical(dir));
}

/** The failure message, or a forced failure if it unexpectedly resolved. */
function refusal(target: string): string {
  const result = resolveLocation(target);
  assert.ok(!result.ok, `expected ${target} to be refused, but it resolved`);
  return result.message;
}

// ---------------------------------------------------------------------------
// Recognized
// ---------------------------------------------------------------------------

test('a directory holding both markers is the project root', async (t) => {
  const dir = await makeProjectDir(t);
  const result = resolveLocation(dir);
  assert.ok(result.ok, result.ok ? '' : result.message);
  assert.equal(toPlatform(result.root), dir);
});

test('this repository resolves, which is the case that actually ships', () => {
  // A fixture proves the rule; the real project proves the rule matches
  // reality — both markers here are real directories with real contents, made
  // by the BMAD installer rather than by this test.
  //
  // Derived from this file's own location, not from `process.cwd()`: the suite
  // is normally run from the repo root, but a test that silently depends on
  // that fails for a reason unrelated to what it checks the moment it is not.
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const result = resolveLocation(repoRoot);
  assert.ok(result.ok, result.ok ? '' : result.message);
});

test('the resolved root is canonical, so a symlinked target is the real path', async (t) => {
  const dir = await makeProjectDir(t);
  const base = await bare(t);
  const link = join(base, 'link-to-project');
  await symlink(dir, link);

  const viaLink = resolveLocation(link);
  const direct = resolveLocation(dir);
  assert.ok(viaLink.ok && direct.ok);
  assert.equal(
    viaLink.ok ? toPlatform(viaLink.root) : '',
    direct.ok ? toPlatform(direct.root) : '',
    'one project, one identity, however it was reached',
  );
});

test('a nested project resolves itself and never consults its parent', async (t) => {
  // No walk upward. Running inside a project that sits inside another must
  // resolve the one asked for — reporting the outer one would tell the reader
  // about a project they are not standing in.
  const outer = await makeProjectDir(t, 'bmad-dash-outer-');
  const inner = join(outer, 'inner');
  await mkdir(inner);
  for (const marker of MARKERS) await mkdir(join(inner, marker), { recursive: true });

  const result = resolveLocation(inner);
  assert.ok(result.ok, result.ok ? '' : result.message);
  assert.equal(toPlatform(result.root), toPlatform(canonical(inner)));
  assert.notEqual(toPlatform(result.root), outer);
});

test('a directory inside a project is not itself the project', async (t) => {
  // The other half of no-walk, and the one that would be most tempting to
  // "fix": running from `_bmad-output/` must fail rather than silently
  // resolving the project above.
  const dir = await makeProjectDir(t);
  const message = refusal(join(dir, '_bmad-output'));
  assert.match(message, /is not a BMAD project/);
  assert.ok(!message.includes('resolved'), 'it must not claim to have found anything');
});

// ---------------------------------------------------------------------------
// Refused, each distinguishably
// ---------------------------------------------------------------------------

test('a path that does not exist says so, naming it', async (t) => {
  const dir = await bare(t);
  const missing = join(dir, 'not-here');
  const message = refusal(missing);
  assert.match(message, /^No such directory: /);
  assert.ok(message.includes(missing));
  assert.doesNotMatch(message, /not a BMAD project/, 'a typo is not a non-project');
});

test('a file given where a directory belongs says that, not that it is absent', async (t) => {
  const dir = await bare(t);
  const file = join(dir, 'a-file.txt');
  await writeFile(file, 'x');
  const message = refusal(file);
  assert.match(message, /^Not a directory: /);
  assert.ok(message.includes(file));
});

test('an ordinary directory reports both markers and that neither is present', async (t) => {
  const dir = await bare(t);
  const message = refusal(dir);
  assert.ok(message.includes(dir));
  for (const marker of MARKERS) {
    assert.ok(message.includes(marker), `the message must name ${marker}`);
  }
  assert.match(message, /neither is present/);
});

test('one marker missing is named specifically, not lumped in with none', async (t) => {
  for (const [present, absent] of [
    [MARKERS[0], MARKERS[1]],
    [MARKERS[1], MARKERS[0]],
  ] as const) {
    const dir = await bare(t);
    await mkdir(join(dir, present), { recursive: true });
    const message = refusal(dir);
    assert.match(message, new RegExp(`${absent} is missing`), `should name ${absent}`);
    assert.doesNotMatch(message, /neither is present/, 'one is present');
  }
});

test('a marker that is a file does not count as a marker', async (t) => {
  // `_bmad` as a file is not an installed toolchain. Accepting it would push
  // the failure into whichever later story first read inside it.
  const dir = await bare(t);
  await mkdir(join(dir, MARKERS[1]), { recursive: true });
  await writeFile(join(dir, MARKERS[0]), 'not a directory');
  const message = refusal(dir);
  assert.match(message, new RegExp(`${MARKERS[0]} is missing`));
});

test('a marker that is a symlink to a directory does count', async (t) => {
  // The refusal above is about kind, not about spelling. A marker reached
  // through a link is still a directory, and canonicalization already resolved
  // it — so refusing this would be refusing a legitimate layout.
  const dir = await bare(t);
  const real = join(dir, 'real-bmad');
  await mkdir(real);
  await mkdir(join(dir, MARKERS[1]), { recursive: true });
  await symlink(real, join(dir, MARKERS[0]));

  const result = resolveLocation(dir);
  assert.ok(result.ok, result.ok ? '' : result.message);
});

test('a directory whose children cannot be read reports the marker it could not stat', async (t) => {
  const dir = await bare(t);
  if (process.platform === 'win32' || process.getuid?.() === 0) return;

  await chmod(dir, 0o000);
  try {
    const result = resolveLocation(dir);
    assert.ok(!result.ok);
    assert.equal(!result.ok && result.reason, 'unreadable');
    assert.match(result.ok ? '' : result.message, /^Could not read /);
  } finally {
    await chmod(dir, 0o755);
  }
});

test('a target the tool cannot even stat is unreadable, not "not a directory"', async (t) => {
  // The branch the test above does *not* reach. `stat` on a `0o000` directory
  // succeeds — only its children are denied — so the case above exercises the
  // per-marker branch, and the target branch was never executed at all:
  // deleting it left the suite green. Denying traversal to the *parent* is what
  // makes the target itself unstattable.
  if (process.platform === 'win32' || process.getuid?.() === 0) return;

  const outer = await bare(t);
  const project = join(outer, 'project');
  await mkdir(project);
  for (const marker of MARKERS) await mkdir(join(project, marker), { recursive: true });

  await chmod(outer, 0o000);
  try {
    const result = resolveLocation(project);
    assert.ok(!result.ok, 'an unreachable target must not resolve');
    assert.equal(!result.ok && result.reason, 'unreadable');
    const message = result.ok ? '' : result.message;
    assert.match(message, /^Could not read /);
    assert.doesNotMatch(message, /^Not a directory/, 'a denied path is not a wrong-type path');
    assert.doesNotMatch(message, /_bmad/, 'the report must name the target, not a marker inside it');
  } finally {
    await chmod(outer, 0o755);
  }
});

test('every refusal message is distinct, which is the point of having several', async (t) => {
  const dir = await bare(t);
  const file = join(dir, 'f.txt');
  await writeFile(file, 'x');
  const half = await bare(t);
  await mkdir(join(half, MARKERS[0]), { recursive: true });

  const messages = [
    refusal(join(dir, 'missing')),
    refusal(file),
    refusal(dir),
    refusal(half),
  ];
  assert.equal(new Set(messages).size, messages.length, `messages collided: ${messages.join(' | ')}`);
});

test('every refusal carries a reason code, not only prose', async (t) => {
  // Story 1.6 has to know *which* failure it is proposing an invocation for,
  // and only one of these — `not-a-project` — is answered by "try over there".
  // Without a code it would have to pattern-match English, which is what the
  // tests above were doing before this existed.
  const dir = await bare(t);
  const file = join(dir, 'f.txt');
  await writeFile(file, 'x');
  const half = await bare(t);
  await mkdir(join(half, MARKERS[0]), { recursive: true });

  const cases = [
    [join(dir, 'missing'), 'absent'],
    [file, 'not-a-directory'],
    [dir, 'not-a-project'],
    [half, 'not-a-project'],
  ] as const;

  for (const [target, expected] of cases) {
    const result = resolveLocation(target);
    assert.ok(!result.ok, `${target} should be refused`);
    assert.equal(!result.ok && result.reason, expected, `${target} got the wrong reason`);
  }
});

test('the marker names are pinned, not taken on trust from the code under test', () => {
  // Every fixture in the suite builds a project from `MARKERS`, so renaming
  // them would leave all of those green while the tool stopped recognizing any
  // real BMAD project. This is the one place the literal names are asserted.
  assert.deepEqual([...MARKERS], ['_bmad', '_bmad-output']);
});
