/**
 * `whileDenied`, which is the helper the fixtures now share.
 *
 * Written 2026-09-03 with retrospective item 5. Seven test sites hand-rolled
 * the deny/restore pair and restored a guessed `0o755`; this helper restores
 * the mode that was actually there, and its own header says so. That claim had
 * nothing behind it -- the helper had no test at all -- and on every fixture in
 * this repository the observed mode *is* `0o755`, so the divergence the item
 * describes was invisible either way. These rows are what make the difference
 * observable: a directory deliberately not at `0o755`, and a body that throws.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, chmod, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { makeScratchDir } from './project.ts';
import { deniableDirectories, whileDenied } from './tree.ts';

const modeOf = async (path: string): Promise<number> => ((await stat(path)).mode & 0o777);

test('the mode that was there is the mode restored, not a guessed 0o755', async (t) => {
  if (!deniableDirectories()) {
    t.skip('needs POSIX permissions and a non-root user');
    return;
  }
  const base = await makeScratchDir(t, 'bmad-dash-tree-');
  const odd = join(base, 'odd');
  await mkdir(odd);
  // Deliberately not the guess. A helper that rewrote this to 0o755 would be
  // editing a caller's fixture, which is what makes a shared helper unsafe to
  // reach for.
  await chmod(odd, 0o701);
  assert.equal(await modeOf(odd), 0o701, 'the fixture must start where it claims');

  await whileDenied(odd, () => undefined);
  assert.equal(await modeOf(odd), 0o701, 'the observed mode came back, not 0o755');
});

test('the denial actually applies while the body runs', async (t) => {
  if (!deniableDirectories()) {
    t.skip('needs POSIX permissions and a non-root user');
    return;
  }
  const base = await makeScratchDir(t, 'bmad-dash-tree-');
  const denied = join(base, 'denied');
  await mkdir(denied);

  const seen = await whileDenied(denied, () => modeOf(denied));
  assert.equal(seen, 0o000, 'the body must run against a denied directory');
});

test('a partial denial is applied as asked, not widened to 0o000', async (t) => {
  if (!deniableDirectories()) {
    t.skip('needs POSIX permissions and a non-root user');
    return;
  }
  const base = await makeScratchDir(t, 'bmad-dash-tree-');
  const partial = join(base, 'partial');
  await mkdir(partial);

  // Read, never assumed. On this machine `mkdir` yields `0o775` under a `002`
  // umask, not the `0o755` the seven hand-rolled sites restored -- so the
  // "behavioural divergence, not a style one" this item describes is real here
  // rather than hypothetical: every one of those sites was quietly tightening
  // its own fixture by a group-write bit. The first draft of this row asserted
  // `0o755` and failed for exactly that reason.
  const before = await modeOf(partial);

  // `0o111` is search-without-read: Story 1.12's unreadable-root case needs a
  // root whose markers can still be `stat`ed, so recognition succeeds and only
  // the walk fails. A blanket `0o000` reaches a different defect.
  const seen = await whileDenied(partial, () => modeOf(partial), 0o111);
  assert.equal(seen, 0o111, 'the mode asked for is the mode applied');
  assert.equal(await modeOf(partial), before, 'and the original still comes back');
});

test('the mode is restored when the body throws, which is why it is a finally', async (t) => {
  if (!deniableDirectories()) {
    t.skip('needs POSIX permissions and a non-root user');
    return;
  }
  const base = await makeScratchDir(t, 'bmad-dash-tree-');
  const denied = join(base, 'denied');
  await mkdir(denied);
  await chmod(denied, 0o750);

  await assert.rejects(
    whileDenied(denied, () => {
      throw new Error('the assertion inside failed');
    }),
    /the assertion inside failed/,
  );
  // Without this the scratch cleanup would fail on a directory it cannot enter,
  // which is the failure mode the helper's header describes.
  assert.equal(await modeOf(denied), 0o750, 'a failing body still gets its fixture back');
});
