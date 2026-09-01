/**
 * The filesystem adapter's one operation, tested behaviourally.
 *
 * It had only a source grep asserting that `realpathSync` appears in the file.
 * That proves the text is present, not that either branch works — and both
 * branches are load-bearing: the resolving branch is what makes the entry guard
 * recognise a symlinked `bin`, and the catch branch is what stops an
 * unresolvable path throwing out of the composition root before anything runs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveRealPath } from '../../src/adapters/fs/realpath.ts';

async function scratch(t: { after: (fn: () => unknown) => void }): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'bmad-dash-rp-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('a symlink resolves to its target', async (t) => {
  const dir = await scratch(t);
  const target = join(dir, 'real.js');
  const link = join(dir, 'link.js');
  await writeFile(target, '// target\n');
  await symlink(target, link);

  assert.equal(resolveRealPath(link), target);
  assert.notEqual(link, target, 'the fixture must actually be a symlink');
});

test('a chain of symlinks resolves all the way through', async (t) => {
  const dir = await scratch(t);
  const target = join(dir, 'real.js');
  const first = join(dir, 'first.js');
  const second = join(dir, 'second.js');
  await writeFile(target, '// target\n');
  await symlink(target, first);
  await symlink(first, second);

  assert.equal(resolveRealPath(second), target);
});

test('a real path resolves to itself', async (t) => {
  const dir = await scratch(t);
  const target = join(dir, 'real.js');
  await writeFile(target, '// target\n');

  assert.equal(resolveRealPath(target), target);
});

test('a symlink to a directory resolves', async (t) => {
  const dir = await scratch(t);
  const inner = join(dir, 'inner');
  const link = join(dir, 'inner-link');
  await mkdir(inner);
  await symlink(inner, link);

  assert.equal(resolveRealPath(link), inner);
});

test('a path that cannot be resolved is returned unchanged', async (t) => {
  const dir = await scratch(t);
  const missing = join(dir, 'does-not-exist', 'nor-this.js');

  // Documented behaviour: the caller compares the result and simply fails to
  // match, which is the safe direction. Throwing here would take down the
  // composition root before it had reported anything.
  assert.equal(resolveRealPath(missing), missing);
});

test('a dangling symlink is returned unchanged rather than throwing', async (t) => {
  const dir = await scratch(t);
  const link = join(dir, 'dangling');
  await symlink(join(dir, 'never-created'), link);

  assert.equal(resolveRealPath(link), link);
});

test('the empty string resolves like "." rather than throwing', () => {
  // Node treats an empty path as the working directory rather than an error, so
  // this goes down the resolving branch, not the catch. Asserted because I
  // assumed the opposite: the point of the catch branch is unresolvable paths,
  // and an empty string is not one of them.
  assert.equal(resolveRealPath(''), resolveRealPath('.'));
});
