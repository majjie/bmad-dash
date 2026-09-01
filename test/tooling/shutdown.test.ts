/**
 * The shutdown latch.
 *
 * `process.on` plus a latch, not `process.once`: `once` removes the listener
 * after the first signal, so a second one falls through to the default action
 * and the process dies by signal instead of exiting 0.
 *
 * End to end this is not observable — shutdown completes in about a
 * millisecond and the OS coalesces pending standard signals, so five rapid
 * SIGINTs exit 0 either way (measured). The latch still has to be correct, so
 * it is tested directly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createShutdownHandler } from '../../src/cli/index.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('repeated calls shut down exactly once', async () => {
  let closes = 0;
  const exits: number[] = [];
  let release: (() => void) | undefined;

  const shutdown = createShutdownHandler({
    close: () => {
      closes += 1;
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    exit: (code) => exits.push(code),
  });

  shutdown();
  shutdown();
  shutdown();
  assert.equal(closes, 1, 'a repeated signal must not start a second shutdown');
  assert.deepEqual(exits, [], 'nothing should exit before close resolves');

  release?.();
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(exits, [0], 'a clean close exits 0, once');
  shutdown();
  assert.equal(closes, 1);
});

test('a close that fails exits 1, not 0', async () => {
  const exits: number[] = [];
  const shutdown = createShutdownHandler({
    close: () => Promise.reject(new Error('close refused')),
    exit: (code) => exits.push(code),
  });

  shutdown();
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(exits, [1]);
});

test('the signal handlers are registered with on, not once', async () => {
  // The latch above covers "runs once"; this covers the other half — that the
  // listener survives the first signal at all. Structural because the race it
  // guards cannot be delivered reliably: see the file comment.
  const source = await readFile(join(REPO_ROOT, 'src', 'cli', 'index.ts'), 'utf8');
  assert.match(source, /process\.on\('SIGINT',/);
  assert.match(source, /process\.on\('SIGTERM',/);
  assert.doesNotMatch(
    source,
    /process\.once\('SIG/,
    'process.once removes the handler after the first signal',
  );
});
