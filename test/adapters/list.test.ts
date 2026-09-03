/**
 * The listing adapter — one directory's child directories, and nothing else.
 *
 * Three properties carry the weight, and each of them is a defect this project
 * has already been bitten by somewhere else:
 *
 *   1. **Symlinks are followed.** A `Dirent` for a symlink answers false to
 *      both `isDirectory()` and `isFile()`, which is exactly how the read-only
 *      gate's walker went blind to a symlinked source tree. A checkout reached
 *      through a link is an ordinary way to hold a project, so it has to be
 *      listed — and a dangling one has to be skipped rather than throw.
 *   2. **An unlistable directory is an answer, not an exception.** The caller's
 *      rule is that it skips such a directory and keeps going, which it cannot
 *      do if this throws.
 *   3. **The cap is honest.** A truncated listing reports that it truncated,
 *      and truncates the same way every time — names are sorted first — so the
 *      suggestion built from it is reproducible.
 *   4. **The caller's exclusions apply before the cap.** `.` sorts ahead of
 *      every letter in ASCII, so a directory of dot-directories used to fill
 *      the budget and hide every real project beside them. The order of those
 *      two operations is the difference between a cap and a blindfold.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { listChildDirectories } from '../../src/adapters/fs/list.ts';
import { makeScratchDir } from '../support/project.ts';
import { deniableDirectories, whileDenied } from '../support/tree.ts';

async function scratch(t: { after: (fn: () => unknown) => void }): Promise<string> {
  return makeScratchDir(t, 'bmad-dash-list-');
}

/** The listing, or a forced failure if it unexpectedly could not be read. */
function listed(
  path: string,
  limit = 128,
  keep?: (name: string) => boolean,
): { directories: readonly string[]; truncated: boolean } {
  const result =
    keep === undefined
      ? listChildDirectories(path, limit)
      : listChildDirectories(path, limit, keep);
  assert.ok(result.ok, result.ok ? '' : `expected ${path} to be listable: ${result.reason}`);
  return { directories: result.directories, truncated: result.truncated };
}

test('child directories are listed, sorted, and files are not', async (t) => {
  const base = await scratch(t);
  for (const name of ['zeta', 'alpha', 'middle']) await mkdir(join(base, name));
  await writeFile(join(base, 'notes.md'), 'not a directory\n');
  await writeFile(join(base, 'alpha.txt'), 'nor this\n');

  const result = listed(base);
  assert.deepEqual([...result.directories], ['alpha', 'middle', 'zeta']);
  assert.equal(result.truncated, false);
});

test('names are returned, not paths', async (t) => {
  // The caller joins them itself. Returning paths here would put path
  // construction in two places and give the adapter an opinion about which.
  const base = await scratch(t);
  await mkdir(join(base, 'child'));
  assert.deepEqual([...listed(base).directories], ['child']);
});

test('an empty directory lists nothing and is not an error', async (t) => {
  const base = await scratch(t);
  const result = listed(base);
  assert.deepEqual([...result.directories], []);
  assert.equal(result.truncated, false);
});

test('a symlink to a directory is listed as a directory', async (t) => {
  // The gate's recorded defect, at the adapter level: a `Dirent` for a symlink
  // is neither a file nor a directory, so a naive filter drops every one.
  const base = await scratch(t);
  const real = join(base, 'real');
  await mkdir(real);
  await symlink(real, join(base, 'via-link'));

  assert.deepEqual([...listed(base).directories], ['real', 'via-link']);
});

test('a symlink to a file is not listed', async (t) => {
  const base = await scratch(t);
  await writeFile(join(base, 'target.txt'), 'x\n');
  await symlink(join(base, 'target.txt'), join(base, 'link-to-file'));
  await mkdir(join(base, 'real'));

  assert.deepEqual([...listed(base).directories], ['real']);
});

test('a dangling symlink is skipped rather than fatal', async (t) => {
  const base = await scratch(t);
  await mkdir(join(base, 'real'));
  await symlink(join(base, 'never-created'), join(base, 'dead'));

  assert.deepEqual([...listed(base).directories], ['real']);
});

test('a missing directory is reported, not thrown', async (t) => {
  const base = await scratch(t);
  const result = listChildDirectories(join(base, 'nope'), 128);
  assert.ok(!result.ok, 'a missing directory must not list as empty');
  assert.match(result.reason, /ENOENT|no such file/i);
});

test('a path that is a file is reported, not thrown', async (t) => {
  const base = await scratch(t);
  const file = join(base, 'f.txt');
  await writeFile(file, 'x\n');

  const result = listChildDirectories(file, 128);
  assert.ok(!result.ok, 'a file must not list as an empty directory');
  assert.match(result.reason, /ENOTDIR|not a directory/i);
});

test('a directory that cannot be listed is reported, not thrown', async (t) => {
  const base = await scratch(t);
  const denied = join(base, 'denied');
  await mkdir(denied);
  if (!deniableDirectories()) {
    t.skip('needs POSIX permissions and a non-root user');
    return;
  }

  await whileDenied(denied, async () => {
    const result = listChildDirectories(denied, 128);
    assert.ok(!result.ok, 'a denied directory must not list as empty');
    assert.match(result.reason, /EACCES|permission denied/i);
  });
});

test('the cap truncates deterministically and says so', async (t) => {
  const base = await scratch(t);
  for (let i = 0; i < 5; i += 1) await mkdir(join(base, `d-${String(i)}`));

  const capped = listed(base, 3);
  assert.deepEqual([...capped.directories], ['d-0', 'd-1', 'd-2']);
  assert.equal(capped.truncated, true, 'a dropped child must be reported');

  // Exactly at the cap is not truncation: the boundary is where an off-by-one
  // would turn every full listing into a claim that something was missed.
  const exact = listed(base, 5);
  assert.equal(exact.directories.length, 5);
  assert.equal(exact.truncated, false);
});

test('files do not consume the breadth budget', async (t) => {
  // A directory of ten thousand files with two subdirectories must return both
  // and report no truncation — files are never candidates, so a cap that
  // counted them would drop the answer and blame the width.
  const base = await scratch(t);
  await mkdir(join(base, 'a'));
  await mkdir(join(base, 'b'));
  for (let i = 0; i < 20; i += 1) await writeFile(join(base, `f-${String(i)}.md`), 'x\n');

  const result = listed(base, 2);
  assert.deepEqual([...result.directories], ['a', 'b']);
  assert.equal(result.truncated, false);
});

test('the keep predicate excludes names before anything else looks at them', async (t) => {
  const base = await scratch(t);
  for (const name of ['keep-me', 'node_modules', '.cache']) await mkdir(join(base, name));

  const result = listed(base, 128, (name) => name !== 'node_modules' && !name.startsWith('.'));
  assert.deepEqual([...result.directories], ['keep-me']);
  assert.equal(result.truncated, false);
});

test('excluded names do not consume the cap', async (t) => {
  // The reproduction. Ten dot-directories sort ahead of the one real project,
  // so with the cap applied first a limit of 3 returned three dot-directories
  // and the caller — filtering afterwards — was handed nothing at all.
  const base = await scratch(t);
  await Promise.all(
    Array.from({ length: 10 }, (_unused, i) => mkdir(join(base, `.hidden-${String(i)}`))),
  );
  await mkdir(join(base, 'real'));

  const result = listed(base, 3, (name) => !name.startsWith('.'));
  assert.deepEqual([...result.directories], ['real'], 'the excluded names ate the cap');
  assert.equal(result.truncated, false, 'one kept child is not a truncated listing');
});

test('a limit that is not a whole number of 1 or more is refused', async (t) => {
  const base = await scratch(t);
  for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => listChildDirectories(base, bad),
      /whole limit of 1 or more/,
      `a limit of ${String(bad)} must be refused`,
    );
  }
});
