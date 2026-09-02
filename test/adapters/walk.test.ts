/**
 * The bounded, cycle-detecting walk.
 *
 * Every row of the story's I/O matrix is a named test here, and the bounds are
 * pinned from **both** sides: a case that must truncate is paired with the
 * next-larger budget that must not, so a mutation which *shrinks* a cap fails
 * as loudly as one which removes it. A single "this truncates" assertion is
 * satisfied by a walk that truncates at one entry, which is not a bound — it is
 * a bug that happens to agree with the test.
 *
 * The prior art these tests exist against is `test/support/gate.ts`: it
 * rethrows `EACCES`, so one denied directory loses the whole pass. Several of
 * the rows below are that defect stated as an assertion.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, link } from 'node:fs/promises';
import { join, sep } from 'node:path';

import { canonical, toPlatform, type CanonicalPath } from '../../src/adapters/fs/paths.ts';
import {
  ConfinedReader,
  ConfinementError,
  type ChildListing,
} from '../../src/adapters/fs/read.ts';
import { walk, type WalkBudget, type WalkEntry, type WalkResult } from '../../src/adapters/fs/walk.ts';
import { makeScratchDir } from '../support/project.ts';
import {
  deniableDirectories,
  makeTree,
  symlinksAvailable,
  whileDenied,
  type TreeNode,
} from '../support/tree.ts';

/** Wide enough that nothing in these fixtures reaches it. */
const GENEROUS: WalkBudget = { maxDepth: 16, maxEntries: 500 };

async function walked(
  t: { after: (fn: () => unknown) => void },
  nodes: readonly TreeNode[],
  budget: WalkBudget = GENEROUS,
): Promise<{ readonly root: string; readonly result: WalkResult }> {
  const root = await makeTree(t, nodes);
  return { root, result: walk(new ConfinedReader(canonical(root)), budget) };
}

/**
 * One line per entry: `relative kind` when present, `relative state/stage`
 * otherwise.
 *
 * Compared as a whole list rather than probed field by field, deliberately —
 * an assertion that only looks for the entry it cares about cannot notice a
 * *missing* sibling, which is the exact failure the no-abort contract is about.
 */
function shape(result: WalkResult): readonly string[] {
  return result.entries.map((entry) =>
    entry.state === 'present'
      ? `${entry.relative} ${entry.kind}`
      : `${entry.relative} ${entry.state}/${entry.stage}`,
  );
}

/** `limit at` per truncation — the shape the depth assertions already use. */
function stops(result: WalkResult): readonly string[] {
  return result.truncations.map((truncation) => `${truncation.limit} ${truncation.at}`);
}

function find(result: WalkResult, relative: string): WalkEntry {
  const entry = result.entries.find((candidate) => candidate.relative === relative);
  assert.ok(entry !== undefined, `no entry for ${relative} in ${shape(result).join(', ')}`);
  return entry;
}

// ---------------------------------------------------------------------------
// Plain nested tree
// ---------------------------------------------------------------------------

test('a nested tree yields every entry once, with its relative path and kind', async (t) => {
  const { result } = await walked(t, [
    { file: 'top.txt' },
    { dir: 'empty' },
    { file: 'a/one.txt' },
    { file: 'a/b/two.txt' },
  ]);

  assert.deepEqual(shape(result), [
    '. directory',
    'a directory',
    'a/b directory',
    'a/b/two.txt file',
    'a/one.txt file',
    'empty directory',
    'top.txt file',
  ]);
  assert.deepEqual(result.truncations, [], 'a tree inside the budget is not truncated');

  const relatives = result.entries.map((entry) => entry.relative);
  assert.equal(new Set(relatives).size, relatives.length, 'no entry appears twice');
  assert.deepEqual(
    result.entries.map((entry) => entry.depth),
    [0, 1, 2, 3, 2, 1, 1],
    'depth counts levels below the root, which is depth 0',
  );
});

test('directories are entries in their own right, not just containers', async (t) => {
  // FR-11's run folders are directories, and AD-4's run-folder-versus-sharded
  // -document ambiguity is a question asked *about a directory* — so a walk
  // that reported only files could not express either.
  const { result } = await walked(t, [{ dir: 'runs/2026-09-02' }]);
  assert.deepEqual(shape(result), ['. directory', 'runs directory', 'runs/2026-09-02 directory']);
});

test('the resolved real path travels with every entry that has one', async (t) => {
  const { root, result } = await walked(t, [{ file: 'a/one.txt' }]);
  const entry = find(result, 'a/one.txt');
  assert.equal(entry.state, 'present');
  assert.equal(
    entry.state === 'present' ? toPlatform(entry.path) : '',
    toPlatform(canonical(join(root, 'a', 'one.txt'))),
  );
});

// ---------------------------------------------------------------------------
// One file, two names
// ---------------------------------------------------------------------------

test('a file reachable by two names appears exactly once, keyed by resolved path', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }

  // The link sorts *after* the real name, so the real name is met first.
  const later = await walked(t, [{ file: 'real.txt' }, { link: 'zalias', to: 'real.txt', type: 'file' }]);
  assert.deepEqual(shape(later.result), ['. directory', 'real.txt file']);

  // And sorting *before* it, so the property under test is "appears once" and
  // not "the alphabetically later spelling loses". Which spelling is reported
  // is the first one the walk meets; the count is one either way.
  const earlier = await walked(t, [{ file: 'real.txt' }, { link: 'alias', to: 'real.txt', type: 'file' }]);
  assert.deepEqual(shape(earlier.result), ['. directory', 'alias file']);
  assert.equal(
    earlier.result.entries.filter((entry) => entry.state === 'present' && entry.kind === 'file')
      .length,
    1,
    'one file must not become two artifacts because it has two names',
  );
});

// ---------------------------------------------------------------------------
// Directory cycle
// ---------------------------------------------------------------------------

test('a directory cycle terminates, with each real directory appearing once', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }

  // Both shapes: a directory linking to itself, and a longer loop back up.
  const { result } = await walked(t, [
    { file: 'a/f.txt' },
    { link: 'a/loop', to: 'a', type: 'dir' },
    { dir: 'p/q' },
    { link: 'p/q/back', to: 'p', type: 'dir' },
  ]);

  assert.deepEqual(shape(result), [
    '. directory',
    'a directory',
    'a/f.txt file',
    'p directory',
    'p/q directory',
  ]);
  assert.equal(
    result.entries.filter((entry) => entry.relative.startsWith('a/loop')).length,
    0,
    'the cycle must not be re-entered under the link name',
  );
  assert.equal(result.entries.filter((entry) => entry.relative.startsWith('p/q/back')).length, 0);
});

// ---------------------------------------------------------------------------
// Link escaping the tree
// ---------------------------------------------------------------------------

test('a link whose target is outside the root is refused, never descended, never read', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }

  const outside = await makeScratchDir(t, 'bmad-dash-walk-outside-');
  await writeFile(join(outside, 'secret.txt'), 'not yours\n');

  const { result } = await walked(t, [
    { file: 'inside/ok.txt' },
    { link: 'escape', to: outside, type: 'dir' },
  ]);

  assert.deepEqual(shape(result), [
    '. directory',
    'escape unchecked/confinement',
    'inside directory',
    'inside/ok.txt file',
  ]);

  const escape = find(result, 'escape');
  assert.ok(escape.state !== 'present', 'an escaping link is never a present entry');
  assert.equal(escape.state, 'unchecked');
  assert.equal(escape.stage, 'confinement');
  assert.match(
    escape.reason,
    /refusing to read outside the project/,
    'the refusal must name itself, so a reader knows this is a decision and not an error',
  );
  assert.ok(
    escape.reason.includes(outside),
    'and must name the out-of-tree destination it refused',
  );
  assert.equal(
    result.entries.filter((entry) => entry.relative.startsWith('escape/')).length,
    0,
    'nothing below an escaping link may be enumerated',
  );
  assert.equal(
    result.entries.filter((entry) => entry.relative.includes('secret')).length,
    0,
    'and the file at the far end must never be named',
  );
});

test('an out-of-tree entry carries no path, so it cannot become an identity', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  const outside = await makeScratchDir(t, 'bmad-dash-walk-outside-key-');
  const { result } = await walked(t, [{ link: 'escape', to: outside, type: 'dir' }]);
  assert.equal('path' in find(result, 'escape'), false);
});

// ---------------------------------------------------------------------------
// Dangling link
// ---------------------------------------------------------------------------

test('a dangling link is reported absent and the pass continues', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }

  const { result } = await walked(t, [
    { file: 'kept.txt' },
    { link: 'gone', to: 'nowhere', type: 'file' },
  ]);

  assert.deepEqual(shape(result), ['. directory', 'gone absent/resolve', 'kept.txt file']);
  const gone = find(result, 'gone');
  assert.ok(gone.state !== 'present', 'a dangling link is not a present entry');
  assert.equal(gone.state, 'absent');
  assert.equal(gone.stage, 'resolve');
  assert.match(gone.reason, /ENOENT|no such file/i);
  assert.equal('path' in gone, false, 'a link with nothing at the far end has no identity');
});

// ---------------------------------------------------------------------------
// Unreadable directory — the gate walker's defect, as an assertion
// ---------------------------------------------------------------------------

test('a denied directory is one unreadable entry and does not abort the pass', async (t) => {
  if (!deniableDirectories()) {
    t.skip('needs a non-root POSIX user: root is not denied by a 0o000 mode');
    return;
  }

  const root = await makeTree(t, [
    { file: 'denied/hidden.txt' },
    { file: 'other/x.txt' },
    { file: 'top.txt' },
  ]);
  const reader = new ConfinedReader(canonical(root));

  const result = await whileDenied(join(root, 'denied'), () => walk(reader, GENEROUS));

  assert.deepEqual(shape(result), [
    '. directory',
    'denied unreadable/read-directory',
    'other directory',
    'other/x.txt file',
    'top.txt file',
  ]);

  const denied = find(result, 'denied');
  assert.ok(denied.state !== 'present', 'a directory that cannot be listed is not present');
  assert.equal(denied.state, 'unreadable');
  assert.match(denied.reason, /EACCES|permission/i);
  assert.equal(
    denied.stage,
    'read-directory',
    'the stage says which question failed, which is Story 1.9’s contract',
  );
  assert.equal(
    result.entries.filter((entry) => entry.relative.startsWith('denied/')).length,
    0,
    'nothing inside it is invented',
  );
});

test('a denied directory deeper in the tree loses only its own contents', async (t) => {
  if (!deniableDirectories()) {
    t.skip('needs a non-root POSIX user: root is not denied by a 0o000 mode');
    return;
  }

  const root = await makeTree(t, [
    { file: 'a/b/denied/hidden.txt' },
    { file: 'a/b/sibling.txt' },
    { file: 'a/later.txt' },
  ]);
  const reader = new ConfinedReader(canonical(root));
  const result = await whileDenied(join(root, 'a', 'b', 'denied'), () => walk(reader, GENEROUS));

  assert.deepEqual(shape(result), [
    '. directory',
    'a directory',
    'a/b directory',
    'a/b/denied unreadable/read-directory',
    'a/b/sibling.txt file',
    'a/later.txt file',
  ]);
});

// ---------------------------------------------------------------------------
// Unresolvable path
// ---------------------------------------------------------------------------

test('a path that cannot be resolved is unreadable, undescended, and not an identity', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }

  // `literally` is the only way to write a self-referential target: the link
  // names itself relative to its own directory, which is `ELOOP`.
  const { result } = await walked(t, [
    { file: 'kept.txt' },
    { link: 'loopA', literally: 'loopA', type: 'file' },
    { link: 'loopB', literally: 'loopB', type: 'file' },
  ]);

  assert.deepEqual(shape(result), [
    '. directory',
    'kept.txt file',
    'loopA unreadable/resolve',
    'loopB unreadable/resolve',
  ]);

  const loop = find(result, 'loopA');
  assert.ok(loop.state !== 'present', 'an unresolvable path is not a present entry');
  assert.equal(loop.stage, 'resolve');
  assert.match(loop.reason, /ELOOP|too many symbolic links/i);
  // The load-bearing assertion. `canonical` returns the *spelling* when
  // `realpathSync.native` fails, and `ELOOP` is the cycle case, so keying an
  // unresolved path is how the duplicate this walk exists to prevent comes
  // back. There is no `path` on the entry to key: the mistake is unavailable,
  // not merely discouraged.
  assert.equal('path' in loop, false);
  assert.equal('path' in find(result, 'loopB'), false);
  assert.equal(
    result.entries.filter((entry) => entry.relative.startsWith('loopA/')).length,
    0,
    'an unresolved path is never descended',
  );
});

test('a path denied part-way along is unreadable at the resolve stage', async (t) => {
  if (!(await symlinksAvailable()) || !deniableDirectories()) {
    t.skip('needs symlinks and a non-root POSIX user');
    return;
  }

  // The other way `realpathSync.native` fails while the path genuinely exists:
  // `EACCES` on an intermediate directory. Reached through a link so the walk
  // meets it as a child rather than as a directory it was descending into.
  const root = await makeTree(t, [
    { file: 'vault/inner/x.txt' },
    { link: 'reach', to: 'vault/inner', type: 'dir' },
  ]);
  const reader = new ConfinedReader(canonical(root));
  const result = await whileDenied(join(root, 'vault'), () => walk(reader, GENEROUS));

  const reach = find(result, 'reach');
  assert.ok(reach.state !== 'present', 'a path that cannot be resolved is not present');
  assert.equal(reach.state, 'unreadable');
  assert.equal(reach.stage, 'resolve');
  assert.equal('path' in reach, false);
  assert.equal(find(result, 'vault').state, 'unreadable', 'and the denied directory itself too');
});

// ---------------------------------------------------------------------------
// Budget and depth — every bound pinned from both sides
// ---------------------------------------------------------------------------

const LADDER: readonly TreeNode[] = [{ file: 'a/b/c/d/deep.txt' }];

test('the depth cap stops exactly where it says, and one level more does not', async (t) => {
  const root = await makeTree(t, LADDER);
  const reader = new ConfinedReader(canonical(root));
  const at = (maxDepth: number): readonly string[] =>
    shape(walk(reader, { maxDepth, maxEntries: 500 }));

  assert.deepEqual(at(1), ['. directory', 'a directory']);
  assert.deepEqual(at(2), ['. directory', 'a directory', 'a/b directory']);
  assert.deepEqual(at(3), ['. directory', 'a directory', 'a/b directory', 'a/b/c directory']);
  // `deep.txt` sits at depth 5, so 4 is the last cap that hides something and
  // 5 is the first that hides nothing. Both are asserted: a mutation that
  // *shrinks* the cap breaks the second, and one that widens it breaks the
  // first, so neither direction can drift unnoticed.
  assert.deepEqual(at(4), [
    '. directory',
    'a directory',
    'a/b directory',
    'a/b/c directory',
    'a/b/c/d directory',
  ]);
  assert.deepEqual(at(5), [
    '. directory',
    'a directory',
    'a/b directory',
    'a/b/c directory',
    'a/b/c/d directory',
    'a/b/c/d/deep.txt file',
  ]);
});

test('reaching the depth cap is reported, and not reaching it reports nothing', async (t) => {
  const root = await makeTree(t, LADDER);
  const reader = new ConfinedReader(canonical(root));

  const capped = walk(reader, { maxDepth: 4, maxEntries: 500 });
  assert.deepEqual(
    capped.truncations.map((truncation) => `${truncation.limit} ${truncation.at}`),
    ['depth a/b/c/d'],
    'the report names the bound and the place it bit',
  );
  assert.match(capped.truncations[0]?.reason ?? '', /depth limit of 4/);

  assert.deepEqual(walk(reader, { maxDepth: 5, maxEntries: 500 }).truncations, []);
});

test('the entry budget stops exactly at its own number, from both sides', async (t) => {
  const root = await makeTree(t, [
    { file: 'a.txt' },
    { file: 'b.txt' },
    { file: 'c.txt' },
    { file: 'd.txt' },
    { file: 'e.txt' },
  ]);
  const reader = new ConfinedReader(canonical(root));
  // Six entries in total: the root, spelled `.`, plus five files.
  const count = (maxEntries: number): number =>
    walk(reader, { maxDepth: 16, maxEntries }).entries.length;

  assert.equal(count(6), 6, 'a budget of exactly the tree size is not a truncation');
  assert.equal(count(7), 6, 'and a larger one does not invent entries');
  assert.equal(count(5), 5);
  assert.equal(count(3), 3);
  assert.equal(count(1), 1, 'a budget of one yields the root and stops');

  assert.deepEqual(walk(reader, { maxDepth: 16, maxEntries: 6 }).truncations, []);
  const short = walk(reader, { maxDepth: 16, maxEntries: 5 });
  assert.deepEqual(
    short.truncations.map((truncation) => truncation.limit),
    ['entries'],
  );
  assert.match(short.truncations[0]?.reason ?? '', /entry budget of 5/);
});

test('a budget smaller than one directory reports the shortfall against that directory', async (t) => {
  // The cap is applied before any child is probed, so it bounds syscalls and
  // not merely the length of what comes back — and the shortfall is reported
  // against the directory it happened in. Asserted as `limit at` pairs rather
  // than as `truncations.length > 0`: that weaker form was satisfied by the
  // loop-head record alone, so the whole per-directory report could be deleted
  // with the suite green.
  const root = await makeTree(t, [
    { file: 'one/a.txt' },
    { file: 'one/b.txt' },
    { file: 'one/c.txt' },
    { file: 'one/d.txt' },
  ]);
  const reader = new ConfinedReader(canonical(root));
  const result = walk(reader, { maxDepth: 16, maxEntries: 3 });

  assert.deepEqual(shape(result), ['. directory', 'one directory', 'one/a.txt file']);
  assert.deepEqual(stops(result), ['entries one']);
  assert.match(
    result.truncations[0]?.reason ?? '',
    /entry budget of 3 left room for only 1 of this directory's children/,
  );
  assert.equal(result.complete, false);
});

test('a per-directory shortfall is reported even when the stack drains first', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  // The case that isolates the per-directory report: the cap drops three names
  // before they become jobs, and identity dedupe then removes the two aliases
  // that did survive it, so the walk finishes well inside its budget and the
  // loop-head record never fires. Deleting the per-directory report leaves
  // `truncations` empty here, which nothing else in the suite would notice.
  const root = await makeTree(t, [
    { file: 'a.txt' },
    { link: 'b1', to: 'a.txt', type: 'file' },
    { link: 'b2', to: 'a.txt', type: 'file' },
    { link: 'b3', to: 'a.txt', type: 'file' },
    { link: 'b4', to: 'a.txt', type: 'file' },
    { link: 'b5', to: 'a.txt', type: 'file' },
  ]);
  const result = walk(new ConfinedReader(canonical(root)), { maxDepth: 16, maxEntries: 4 });

  assert.deepEqual(shape(result), ['. directory', 'a.txt file']);
  assert.equal(result.entries.length, 2, 'well inside the budget of four');
  assert.deepEqual(stops(result), ['entries .']);
});

test('the two entry-budget reports are distinct facts, and both are named', async (t) => {
  // One record for names the cap dropped inside a directory, one for jobs the
  // cap dropped from the queue. They are different losses, so both are kept —
  // and `at` on the second is the next job to pop, which is the first path the
  // walk would have reported.
  const root = await makeTree(t, [
    { file: 'sub/s1.txt' },
    { file: 'sub/s2.txt' },
    { file: 'sub/s3.txt' },
    { file: 'sub/s4.txt' },
    { file: 'sub/s5.txt' },
    { file: 'z1.txt' },
    { file: 'z2.txt' },
    { file: 'z3.txt' },
  ]);
  const result = walk(new ConfinedReader(canonical(root)), { maxDepth: 16, maxEntries: 5 });

  assert.deepEqual(stops(result), ['entries sub', 'entries z1.txt']);
  assert.match(
    result.truncations[1]?.reason ?? '',
    /entry budget of 5 reached with at least 3 path\(s\) still unwalked/,
  );
});

test('a budget spent before a directory is listed blames the budget, not the directory', async (t) => {
  // The off-by-one this pins: the cap handed to `childrenOf` must reserve the
  // directory's own entry, so a budget of one asks for one child it can never
  // hold and must *not* then record a per-directory shortfall for it. Only the
  // loop-head record is honest here, and it names the first dropped path.
  const root = await makeTree(t, [{ file: 'a.txt' }, { file: 'b.txt' }, { file: 'c.txt' }]);
  const result = walk(new ConfinedReader(canonical(root)), { maxDepth: 16, maxEntries: 1 });

  assert.deepEqual(shape(result), ['. directory']);
  assert.deepEqual(stops(result), ['entries a.txt']);
  assert.match(
    result.truncations[0]?.reason ?? '',
    /entry budget of 1 reached with at least 1 path\(s\) still unwalked/,
  );
});

test('the budget is required and validated, never defaulted or clamped', async (t) => {
  const root = await makeTree(t, [{ file: 'a.txt' }]);
  const reader = new ConfinedReader(canonical(root));

  // An unbounded walk must be impossible to ask for by accident, which is why
  // there is no default to fall back to — and the message is matched like every
  // sibling case below, so an incidental `TypeError` from reading a field off
  // `undefined` does not satisfy the assertion.
  assert.throws(() => walk(reader, undefined as unknown as WalkBudget), /needs a budget/);
  assert.throws(() => walk(reader, null as unknown as WalkBudget), /needs a budget/);
  for (const budget of [
    { maxDepth: 0, maxEntries: 10 },
    { maxDepth: -1, maxEntries: 10 },
    { maxDepth: 1.5, maxEntries: 10 },
    { maxDepth: Number.NaN, maxEntries: 10 },
    { maxDepth: Number.POSITIVE_INFINITY, maxEntries: 10 },
  ]) {
    assert.throws(() => walk(reader, budget), /maxDepth/, JSON.stringify(budget));
  }
  for (const budget of [
    { maxDepth: 10, maxEntries: 0 },
    { maxDepth: 10, maxEntries: -3 },
    { maxDepth: 10, maxEntries: 2.5 },
    { maxDepth: 10, maxEntries: Number.NaN },
    { maxDepth: 10, maxEntries: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(() => walk(reader, budget), /maxEntries/, JSON.stringify(budget));
  }
});

// ---------------------------------------------------------------------------
// Case-only difference — the question goes to the volume
// ---------------------------------------------------------------------------

test('two names differing only in case are whatever the running volume says', async (t) => {
  const root = await makeTree(t, [{ file: 'Foo/x.txt' }]);

  // Asked by measurement, never by platform name: a case-sensitive volume
  // mounted on a case-insensitive system is a real configuration, and
  // `process.platform` cannot see it. `mkdir` on the folded spelling is the
  // question, and `EEXIST` is the volume answering "same directory".
  let folds = false;
  try {
    await mkdir(join(root, 'foo'));
  } catch (error: unknown) {
    assert.equal((error as { code?: string }).code, 'EEXIST', String(error));
    folds = true;
  }

  const result = walk(new ConfinedReader(canonical(root)), GENEROUS);
  const directories = result.entries.filter(
    (entry) => entry.state === 'present' && entry.kind === 'directory' && entry.relative !== '.',
  );

  if (folds) {
    assert.deepEqual(shape(result), ['. directory', 'Foo directory', 'Foo/x.txt file']);
    assert.equal(directories.length, 1, 'a case-folding volume has one directory here');
  } else {
    assert.equal(directories.length, 2, 'a case-sensitive volume has two, and they are not merged');
    assert.deepEqual(shape(result), [
      '. directory',
      'Foo directory',
      'Foo/x.txt file',
      'foo directory',
    ]);
  }
});

// ---------------------------------------------------------------------------
// The whole acceptance criterion, in one tree
// ---------------------------------------------------------------------------

test('a tree with a cycle, a dangling link, an escape and a denial walks completely', async (t) => {
  if (!(await symlinksAvailable()) || !deniableDirectories()) {
    t.skip('needs symlinks and a non-root POSIX user');
    return;
  }

  const outside = await makeScratchDir(t, 'bmad-dash-walk-all-outside-');
  await writeFile(join(outside, 'secret.txt'), 'not yours\n');

  const root = await makeTree(t, [
    { file: 'artifacts/one.md' },
    { file: 'artifacts/two.md' },
    { link: 'artifacts/cycle', to: 'artifacts', type: 'dir' },
    { link: 'artifacts/alias', to: 'artifacts/one.md', type: 'file' },
    { file: 'denied/hidden.md' },
    { link: 'dangling', to: 'nowhere', type: 'file' },
    { link: 'escape', to: outside, type: 'dir' },
    { file: 'plain.md' },
  ]);
  const reader = new ConfinedReader(canonical(root));
  const result = await whileDenied(join(root, 'denied'), () => walk(reader, GENEROUS));

  assert.deepEqual(shape(result), [
    '. directory',
    'artifacts directory',
    // `alias` sorts first, so it is the spelling the shared identity is
    // reported under — once, which is the contract.
    'artifacts/alias file',
    'artifacts/two.md file',
    'dangling absent/resolve',
    'denied unreadable/read-directory',
    'escape unchecked/confinement',
    'plain.md file',
  ]);
  assert.deepEqual(result.truncations, [], 'and it saw the whole tree it was allowed to see');

  // One appearance per resolved identity, across the whole result.
  const identities = result.entries.flatMap((entry) =>
    entry.state === 'present' ? [toPlatform(entry.path)] : [],
  );
  assert.equal(new Set(identities).size, identities.length, identities.join(', '));

  // And nothing outside the root is named anywhere in the result.
  for (const entry of result.entries) {
    if (entry.state === 'present') {
      assert.ok(
        toPlatform(entry.path).startsWith(toPlatform(canonical(root))),
        `${entry.relative} resolved outside the root`,
      );
    }
  }
});

test('the walk never rethrows a per-entry failure, whatever the tree holds', async (t) => {
  if (!(await symlinksAvailable()) || !deniableDirectories()) {
    t.skip('needs symlinks and a non-root POSIX user');
    return;
  }

  // The gate walker's defect, stated directly: it rethrows anything that is not
  // `ENOENT`, so a single denied directory ends the pass. A mutation that
  // reintroduces the rethrow fails here rather than somewhere downstream.
  const outside = await makeScratchDir(t, 'bmad-dash-walk-throw-outside-');
  const root = await makeTree(t, [
    { file: 'denied/x.md' },
    { link: 'loop', literally: 'loop', type: 'file' },
    { link: 'escape', to: outside, type: 'dir' },
    { link: 'dangling', to: 'nowhere', type: 'file' },
    { file: 'last.md' },
  ]);
  const reader = new ConfinedReader(canonical(root));

  const result = await whileDenied(join(root, 'denied'), () => {
    // Not `assert.doesNotThrow(...)` — the value is wanted as well as the
    // absence of the throw, and the last entry is the proof the pass finished
    // rather than stopping at the first bad one.
    return walk(reader, GENEROUS);
  });

  assert.equal(find(result, 'last.md').state, 'present', 'the pass must reach the far side');
  assert.deepEqual(
    result.entries.map((entry) => entry.state),
    ['present', 'absent', 'unreadable', 'unchecked', 'present', 'unreadable'],
    shape(result).join(', '),
  );
});

// ---------------------------------------------------------------------------
// Start path and exclusion — the mechanism that makes the walk usable
// ---------------------------------------------------------------------------

/** Twenty dot-directories, each holding a file, plus one named subtree. */
const DOT_HEAVY: readonly TreeNode[] = [
  ...Array.from({ length: 20 }, (_, index) => ({
    file: `.d${String(index).padStart(2, '0')}/f.txt`,
  })),
  { file: '_bmad-output/spec.md' },
  { file: 'src/index.ts' },
];

test('a dot-directory-heavy root spends the whole budget before the real subtrees', async (t) => {
  // The measurement that earned `start` and `exclude`, kept as a test so the
  // problem cannot quietly stop being true. `.` sorts ahead of every letter, so
  // sorted order puts twenty dot-directories in front of `_bmad-output` and
  // `src`, and the budget is gone before either is reached.
  const root = await makeTree(t, DOT_HEAVY);
  const result = walk(new ConfinedReader(canonical(root)), { maxDepth: 8, maxEntries: 25 });

  const relatives = result.entries.map((entry) => entry.relative);
  assert.ok(relatives.includes('.d00'), relatives.join(', '));
  assert.equal(
    relatives.some((relative) => relative.startsWith('_bmad-output')),
    false,
    'this is the failure the two options exist for, not a wish',
  );
  assert.equal(relatives.some((relative) => relative.startsWith('src')), false);
  assert.equal(result.complete, false);
});

test('a start subpath reaches the named subtree within the same budget', async (t) => {
  const root = await makeTree(t, DOT_HEAVY);
  const reader = new ConfinedReader(canonical(root));
  const result = walk(reader, { maxDepth: 8, maxEntries: 25 }, { start: '_bmad-output' });

  assert.deepEqual(shape(result), ['. directory', 'spec.md file']);
  assert.equal(toPlatform(result.start), toPlatform(canonical(join(root, '_bmad-output'))));
  assert.equal(toPlatform(result.root), toPlatform(canonical(root)), 'the root is still the root');
  assert.equal(result.complete, true);
});

test('an exclusion predicate reaches the named subtree within the same budget', async (t) => {
  const root = await makeTree(t, DOT_HEAVY);
  const reader = new ConfinedReader(canonical(root));
  // Applied *before* the cap, which is the whole reason it is a parameter here
  // rather than a filter over the result: a cap spent on names the caller was
  // always going to discard is a cap on the wrong thing.
  const result = walk(
    reader,
    { maxDepth: 8, maxEntries: 25 },
    { exclude: (name) => name.startsWith('.') },
  );

  assert.deepEqual(shape(result), [
    '. directory',
    '_bmad-output directory',
    '_bmad-output/spec.md file',
    'src directory',
    'src/index.ts file',
  ]);
  assert.deepEqual(result.truncations, [], 'an excluded child is not a truncation');
  assert.equal(result.complete, true);
});

test('the exclusion predicate is consulted for every child at every level', async (t) => {
  const root = await makeTree(t, [{ file: 'x/y/z.txt' }, { file: 'x/keep.txt' }, { file: 'top.txt' }]);
  const asked: string[] = [];
  const result = walk(
    new ConfinedReader(canonical(root)),
    GENEROUS,
    {
      exclude: (name, parentRelative) => {
        asked.push(`${parentRelative}:${name}`);
        return name === 'keep.txt';
      },
    },
  );

  // Every level, with the parent's own relative path travelling with the name
  // so a caller can write a level-aware rule without re-deriving position.
  assert.deepEqual(asked.sort(), ['.:top.txt', '.:x', 'x/y:z.txt', 'x:keep.txt', 'x:y']);
  assert.deepEqual(shape(result), [
    '. directory',
    'top.txt file',
    'x directory',
    'x/y directory',
    'x/y/z.txt file',
  ]);
  assert.equal(
    result.entries.some((entry) => entry.relative.includes('keep.txt')),
    false,
    'an excluded child is left out entirely — no entry, and nothing to render',
  );
});

test('a start path outside the root is refused rather than walked', async (t) => {
  const root = await makeTree(t, [{ file: 'a.txt' }]);
  const reader = new ConfinedReader(canonical(root));
  assert.throws(
    () => walk(reader, GENEROUS, { start: '../elsewhere' }),
    /refusing to read outside the project/,
  );
});

// ---------------------------------------------------------------------------
// A link back to the start — the identity ordinary dedupe never covers
// ---------------------------------------------------------------------------

test('a link targeting the starting directory is a repeat, not a second subtree', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  // The cycle set is seeded with the starting directory, and this is the only
  // case that pins the seed: `seen.add` covers every directory the walk
  // *discovers*, and the start is never discovered. Without the seed the root
  // is reported twice under one resolved path.
  const { result } = await walked(t, [{ dir: 'a' }, { link: 'self', to: '.', type: 'dir' }]);
  assert.deepEqual(shape(result), ['. directory', 'a directory']);

  const identities = result.entries.flatMap((entry) =>
    entry.state === 'present' ? [toPlatform(entry.path)] : [],
  );
  assert.equal(new Set(identities).size, identities.length, identities.join(', '));
});

// ---------------------------------------------------------------------------
// Hard links — the claim narrowed to what is true
// ---------------------------------------------------------------------------

test('two hard links to one file are two artifacts, because they are two resolved paths', async (t) => {
  const root = await makeTree(t, [{ file: 'real.txt', text: 'shared\n' }]);
  try {
    await link(join(root, 'real.txt'), join(root, 'hard.txt'));
  } catch {
    t.skip('this filesystem does not support hard links; nothing to assert');
    return;
  }

  // Deliberate, and sourced rather than incidental: the architecture spine keys
  // an artifact by its resolved absolute path, and two hard links have two
  // resolved absolute paths. Inode keying would collapse them and contradict
  // the spine to fix a case the frozen matrix never asked about — its row is
  // scoped to a symlink. So the module's claim is "a symlink alias collapses",
  // and this test is what stops it drifting back to "the same file".
  const result = walk(new ConfinedReader(canonical(root)), GENEROUS);
  assert.deepEqual(shape(result), ['. directory', 'hard.txt file', 'real.txt file']);
  assert.equal(result.complete, true);
});

// ---------------------------------------------------------------------------
// The starting directory as an entry — the case the `.` design was made for
// ---------------------------------------------------------------------------

test('a root that is absent, a file, or denied is reported as its own entry', async (t) => {
  const base = await makeScratchDir(t, 'bmad-dash-walk-root-');

  // Absent: resolution fails, so it is `absent` at the `resolve` stage.
  const missing = walk(new ConfinedReader(canonical(join(base, 'nope'))), GENEROUS);
  assert.deepEqual(shape(missing), ['. absent/resolve']);
  assert.equal(missing.complete, false, 'a root that is not there is not a complete walk');
  assert.deepEqual(missing.truncations, [], 'and it is not a truncation either');

  // A regular file: it resolves and is in bounds, and `readdir` says ENOTDIR.
  const file = join(base, 'plain.txt');
  await writeFile(file, 'x');
  const notDirectory = walk(new ConfinedReader(canonical(file)), GENEROUS);
  assert.deepEqual(shape(notDirectory), ['. absent/read-directory']);

  if (!deniableDirectories()) {
    t.skip('needs a non-root POSIX user for the denied-root half');
    return;
  }
  const denied = join(base, 'denied');
  await mkdir(denied);
  const reader = new ConfinedReader(canonical(denied));
  const refused = await whileDenied(denied, () => walk(reader, GENEROUS));
  assert.deepEqual(shape(refused), ['. unreadable/read-directory']);
});

// ---------------------------------------------------------------------------
// Never rethrows — asserted against a reader that actually throws
// ---------------------------------------------------------------------------

/**
 * A reader whose enumeration throws for one directory.
 *
 * The only way to reach the walk's `catch`: every other test drives a real
 * reader over a real tree, and a real `childrenOf` returns absence and
 * unreadability as values. It throws on a genuine TOCTOU — a path component
 * replaced by an out-of-tree link between the parent's listing and the descent
 * — which is not a race a test can arrange, so it is injected instead.
 */
class ThrowingReader extends ConfinedReader {
  readonly #failAt: string;
  readonly #error: (path: string) => Error;

  constructor(root: CanonicalPath, failAt: string, error: (path: string) => Error) {
    super(root);
    this.#failAt = failAt;
    this.#error = error;
  }

  override childrenOf(path: string, limit: number, keep?: (name: string) => boolean): ChildListing {
    if (path.endsWith(this.#failAt)) throw this.#error(path);
    return super.childrenOf(path, limit, keep);
  }
}

test('a throwing enumeration becomes an entry, and the later siblings still appear', async (t) => {
  const root = await makeTree(t, [{ file: 'a/x.txt' }, { file: 'b/y.txt' }, { file: 'z.txt' }]);
  const canonicalRoot = canonical(root);

  const generic = new ThrowingReader(canonicalRoot, `${sep}a`, () => new Error('simulated TOCTOU'));
  const result = walk(generic, GENEROUS);

  // `unreadable` at `read-directory`, because enumerating that directory is
  // what failed — and emphatically *not* `unchecked`/`confinement`, which is
  // what a single catch-all arm reported for every throw including a defect.
  assert.deepEqual(shape(result), [
    '. directory',
    'a unreadable/read-directory',
    'b directory',
    'b/y.txt file',
    'z.txt file',
  ]);
  const failed = find(result, 'a');
  assert.ok(failed.state !== 'present');
  assert.match(failed.reason, /simulated TOCTOU/);
});

test('a confinement refusal from enumeration is reported as a refusal, not as a defect', async (t) => {
  const root = await makeTree(t, [{ file: 'a/x.txt' }, { file: 'z.txt' }]);
  const canonicalRoot = canonical(root);
  const refusing = new ThrowingReader(
    canonicalRoot,
    `${sep}a`,
    (path) => new ConfinementError(canonical(path), canonicalRoot),
  );

  const result = walk(refusing, GENEROUS);
  assert.deepEqual(shape(result), ['. directory', 'a unchecked/confinement', 'z.txt file']);
  const refused = find(result, 'a');
  assert.ok(refused.state !== 'present');
  assert.match(refused.reason, /refusing to read outside the project/);
});

// ---------------------------------------------------------------------------
// `complete` — the question `truncations` was wrongly documented as answering
// ---------------------------------------------------------------------------

test('completeness is a single derived answer, not truncations being empty', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  const clean = await walked(t, [{ file: 'a/one.md' }]);
  assert.equal(clean.result.complete, true);
  assert.deepEqual(clean.result.truncations, []);

  // The case the old doc got wrong: no bound was reached, so `truncations` is
  // empty, and the walk is plainly not complete.
  const dangling = await walked(t, [{ file: 'a.md' }, { link: 'gone', to: 'nowhere', type: 'file' }]);
  assert.deepEqual(dangling.result.truncations, []);
  assert.equal(dangling.result.complete, false, 'an unusable entry is an incomplete walk');
});
