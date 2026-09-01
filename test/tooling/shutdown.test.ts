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
  assert.match(source, /process\.on\(signal, handler\)/);
  assert.doesNotMatch(
    source,
    /process\.once\('SIG/,
    'process.once removes the handler after the first signal',
  );
});

test('every stop signal is registered, SIGHUP included', async () => {
  // SIGHUP was missing: closing the terminal is an ordinary way to end a
  // foreground command, and without a handler it took the default disposition —
  // the process died and the server was never closed.
  const source = await readFile(join(REPO_ROOT, 'src', 'cli', 'index.ts'), 'utf8');
  const declared = /const STOP_SIGNALS = \[([^\]]*)\]/.exec(source)?.[1] ?? '';
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    assert.match(declared, new RegExp(`'${signal}'`), `${signal} is not registered`);
  }
});

test('a close that never settles is abandoned rather than hanging', async () => {
  // `close()` was awaited with no timer, so a close that never resolves hung
  // the process — the Loop 2 failure mode on the one path that had no test.
  const exits: number[] = [];
  const timeouts: number[] = [];
  const shutdown = createShutdownHandler({
    close: () => new Promise<void>(() => {}),
    exit: (code) => exits.push(code),
    timeoutMs: 40,
    onTimeout: (ms) => timeouts.push(ms),
  });

  shutdown();
  assert.deepEqual(exits, [], 'must not exit before the watchdog fires');
  await new Promise((r) => setTimeout(r, 120));

  assert.deepEqual(timeouts, [40], 'the timeout must be reported, not silent');
  assert.deepEqual(exits, [1], 'an abandoned shutdown is a failure, not a clean exit');
});

test('the watchdog does not fire after a clean close', async () => {
  const exits: number[] = [];
  const timeouts: number[] = [];
  const shutdown = createShutdownHandler({
    close: () => Promise.resolve(),
    exit: (code) => exits.push(code),
    timeoutMs: 40,
    onTimeout: (ms) => timeouts.push(ms),
  });

  shutdown();
  await new Promise((r) => setTimeout(r, 120));

  assert.deepEqual(exits, [0]);
  assert.deepEqual(timeouts, [], 'a clean close must not report a timeout');
});

test('a close that settles after the watchdog does not exit twice', async () => {
  let release: (() => void) | undefined;
  const exits: number[] = [];
  const shutdown = createShutdownHandler({
    close: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    exit: (code) => exits.push(code),
    timeoutMs: 30,
  });

  shutdown();
  await new Promise((r) => setTimeout(r, 90));
  assert.deepEqual(exits, [1]);

  release?.();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(exits, [1], 'a late close must not exit a second time');
});
