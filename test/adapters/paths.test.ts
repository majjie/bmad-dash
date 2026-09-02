/**
 * Canonical paths, against a real filesystem.
 *
 * Every assertion here runs on actual temporary directories rather than on
 * strings, because the questions are ones only a filesystem can answer: what a
 * symlink resolves to, and whether this volume distinguishes case. A test that
 * simulated either would be asserting my beliefs about filesystems back at me.
 *
 * The case-sensitivity tests detect the volume's behaviour and assert whichever
 * answer is correct *for it*. That is deliberate: this machine's filesystem is
 * case-sensitive, so a test hardcoding case-insensitive expectations would
 * simply never run the interesting path, and one hardcoding case-sensitive
 * expectations would fail on a Mac.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { canonical, identical, contains, toPlatform } from '../../src/adapters/fs/paths.ts';
import { ConfinedReader } from '../../src/adapters/fs/read.ts';

async function scratch(t: { after: (fn: () => unknown) => void }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bmad-dash-paths-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // The temp root itself can be a symlink (`/tmp` -> `/private/tmp` on macOS),
  // so canonicalize it before comparing anything against it.
  return toPlatform(canonical(dir));
}

/** Whether this volume distinguishes case, asked rather than assumed. */
async function caseSensitive(root: string): Promise<boolean> {
  await mkdir(join(root, 'CaseProbe'), { recursive: true });
  try {
    await stat(join(root, 'caseprobe'));
    return false;
  } catch {
    return true;
  }
}

test('a relative path is resolved, and an absolute one is left where it is', async (t) => {
  const root = await scratch(t);
  await mkdir(join(root, 'inner'));
  assert.equal(toPlatform(canonical('inner', root)), join(root, 'inner'));
  assert.equal(toPlatform(canonical(join(root, 'inner'))), join(root, 'inner'));
});

test('a symlink is resolved to what it points at', async (t) => {
  const root = await scratch(t);
  const real = join(root, 'real');
  await mkdir(real);
  await symlink(real, join(root, 'link'));

  const viaLink = canonical(join(root, 'link'));
  const direct = canonical(real);
  assert.equal(toPlatform(viaLink), real, 'the link must resolve to the real path');
  assert.ok(identical(viaLink, direct), 'both spellings must be one identity');
});

test('a dot-dot segment is resolved away, not carried', async (t) => {
  const root = await scratch(t);
  await mkdir(join(root, 'a', 'b'), { recursive: true });
  const climbed = canonical(join(root, 'a', 'b', '..', '..'));
  assert.equal(toPlatform(climbed), root);
  assert.ok(!toPlatform(climbed).includes('..'));
});

test('a path that does not exist still canonicalizes, so a caller can report it', async (t) => {
  const root = await scratch(t);
  const missing = join(root, 'nope', 'deeper');
  // Not an error: `resolveLocation` has to canonicalize before it can say
  // "no such directory", and a throw here would make that message impossible.
  assert.equal(toPlatform(canonical(missing)), missing);
});

test('two spellings of one directory are one identity, whatever this volume does about case', async (t) => {
  const root = await scratch(t);
  await mkdir(join(root, 'MixedCase'));
  const sensitive = await caseSensitive(root);

  const upper = canonical(join(root, 'MixedCase'));
  const lower = canonical(join(root, 'mixedcase'));

  if (sensitive) {
    // `mixedcase` does not exist here, so it canonicalizes to itself and must
    // *not* be conflated with the directory that does exist.
    assert.ok(!identical(upper, lower), 'a case-sensitive volume must keep them apart');
  } else {
    // The filesystem was asked how it spells the path and returned the stored
    // casing for both, which is what makes byte equality correct.
    assert.ok(identical(upper, lower), 'a case-insensitive volume must fold them together');
    assert.equal(toPlatform(lower), join(root, 'MixedCase'), 'the on-disk casing wins');
  }
});

test('identical is byte equality, and does not fold case itself', () => {
  // The mistake this guards: a `toLowerCase` comparison would undo the work
  // `canonical` did and start reporting two real directories as one.
  const a = canonical('/tmp/Alpha');
  const b = canonical('/tmp/alpha');
  assert.equal(identical(a, a), true);
  if (toPlatform(a) !== toPlatform(b)) assert.equal(identical(a, b), false);
});

// ---------------------------------------------------------------------------
// Containment
// ---------------------------------------------------------------------------

test('a child is contained, and the root contains itself', async (t) => {
  const root = await scratch(t);
  await mkdir(join(root, 'a', 'b'), { recursive: true });
  const canonicalRoot = canonical(root);
  assert.ok(contains(canonicalRoot, canonicalRoot), 'a root contains itself');
  assert.ok(contains(canonicalRoot, canonical(join(root, 'a'))));
  assert.ok(contains(canonicalRoot, canonical(join(root, 'a', 'b'))));
});

test('a sibling whose name merely starts with the root is not contained', async (t) => {
  // The defect a prefix test has: `/home/jamie/project-other` starts with
  // `/home/jamie/project`, and is not inside it.
  const root = await scratch(t);
  const project = join(root, 'project');
  const sibling = join(root, 'project-other');
  await mkdir(project);
  await mkdir(sibling);
  assert.ok(!contains(canonical(project), canonical(sibling)));
  assert.ok(toPlatform(canonical(sibling)).startsWith(toPlatform(canonical(project))));
});

test('a parent is not contained by its child', async (t) => {
  const root = await scratch(t);
  await mkdir(join(root, 'inner'));
  assert.ok(!contains(canonical(join(root, 'inner')), canonical(root)));
});

test('a symlink pointing outside the root is not contained', async (t) => {
  // The case confinement exists for. The link *lives* inside the tree, so any
  // check made on its spelling would admit it; canonicalizing first is what
  // makes containment answer about where it actually goes.
  const root = await scratch(t);
  const project = join(root, 'project');
  const outside = join(root, 'outside');
  await mkdir(project);
  await mkdir(outside);
  await writeFile(join(outside, 'secret.txt'), 'x');
  await symlink(outside, join(project, 'escape'));

  const escape = canonical(join(project, 'escape'));
  assert.ok(!contains(canonical(project), escape), 'a link out of the tree must not be contained');
  assert.equal(toPlatform(escape), outside);
});

test('containment is computed on segments, not on characters', async (t) => {
  // The previous version of this test asserted `!contains(...) || climbing ===
  // root`, which is a tautology — the second half is always true — so it could
  // not fail. `..` must be an escape and `..foo` must not.
  const root = await scratch(t);
  const canonicalRoot = canonical(root);

  await mkdir(join(root, '..foo'));
  await mkdir(join(root, '...'));
  assert.ok(contains(canonicalRoot, canonical(join(root, '..foo'))), '..foo is a name, not an escape');
  assert.ok(contains(canonicalRoot, canonical(join(root, '...'))), '... is a name, not an escape');

  // And the real escape still is one.
  assert.ok(!contains(canonicalRoot, canonical(join(root, '..'))));
  assert.equal(toPlatform(canonical(join(root, 'a', '..'))), root, 'dot-dot resolves, never survives');
  assert.ok(!toPlatform(canonical(join(root, 'a', '..'))).split(sep).includes('..'));
});

test('the resolution limit is where the comments now say it is, not wider', async (t) => {
  // A characterization test, and deliberately so: it pins the *limit* the doc
  // comments in `paths.ts` were narrowed to state, rather than blessing it.
  //
  // `canonical` cannot resolve a path that is not there, so it returns it
  // absolute and normalized with the symlink in it intact — which means
  // `contains` answers about the spelling and reports an escaping path as
  // inside. The comments used to claim this could not happen. It can; what
  // cannot happen is a read escaping, because the `stat` at the far end finds
  // nothing. If someone later makes `canonical` throw or resolve differently,
  // this test is the one that has to be reconsidered along with those comments.
  const root = await scratch(t);
  const project = join(root, 'project');
  const outside = join(root, 'outside');
  await mkdir(project);
  await mkdir(outside);
  await symlink(outside, join(project, 'escape'));

  // The link's own target resolves and is correctly refused.
  assert.ok(!contains(canonical(project), canonical(join(project, 'escape'))));

  // A file that does not exist *under* it does not resolve, so containment
  // answers about the spelling and says yes.
  const absent = join(project, 'escape', 'not-created-yet.txt');
  assert.equal(toPlatform(canonical(absent)), absent, 'an unresolvable path is returned as spelled');
  assert.ok(
    contains(canonical(project), canonical(absent)),
    'the documented limit: an unresolvable path is judged by its spelling',
  );

  // And the consequence the comments claim: nothing outside is readable, because
  // the far end is empty. The read fails as absent rather than reaching across.
  const reader = new ConfinedReader(canonical(project));
  assert.equal(reader.entryAt('escape/not-created-yet.txt').kind, 'absent');

  // Whereas a file that *does* exist out there resolves, and is refused.
  await writeFile(join(outside, 'secret.txt'), 'x');
  assert.throws(
    () => reader.entryAt('escape/secret.txt'),
    /refusing to read outside the project/,
    'an existing path out of the tree is still refused',
  );
});

test('an absolute path is normalized even when it does not exist', async (t) => {
  // `resolve` used to run only for relative input, so an absent absolute path
  // came back exactly as typed: `/tmp/nope//a/./b/../c`. One path then had as
  // many identities as spellings, and "No such directory" printed whichever
  // was typed rather than the path it means.
  const root = await scratch(t);
  const messy = `${root}//missing/./deeper/../deeper/x.txt`;
  const tidy = join(root, 'missing', 'deeper', 'x.txt');
  assert.equal(toPlatform(canonical(messy)), tidy);
  assert.ok(identical(canonical(messy), canonical(tidy)), 'one absent path, one identity');
});
