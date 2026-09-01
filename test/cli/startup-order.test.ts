/**
 * Startup ordering: readiness is announced last.
 *
 * The URL on stdout is the readiness contract. A consumer that reads it and
 * immediately signals — a wrapper script, a supervisor, a test harness — landed
 * in the window between the announcement and the signal-handler registration
 * and got the default disposition: terminated by signal, exit code `null`,
 * instead of exiting 0.
 *
 * Measured before the fix: signalling on the first byte of stdout killed the
 * process on **4 of 25** SIGTERM runs and 0 of 25 SIGINT runs. A 16% hit rate
 * is why this read as a flake for three clean suite runs, and it is also why
 * the race alone is a poor guard — at that rate a 16-iteration race test would
 * itself pass 94% of the time. So the invariant is asserted **deterministically**
 * on the injected seams, and the race runs alongside it as corroboration that
 * the real binary behaves.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../../src/cli/index.ts';
import type { ServerHandle } from '../../src/adapters/http/server.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(
  REPO_ROOT,
  (
    JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      bin: Record<string, string>;
    }
  ).bin['bmad-dash'] ?? 'dist/cli/index.js',
);

/** A handle that binds nothing, so ordering can be observed without a socket. */
function stubHandle(): ServerHandle {
  const socket = createServer();
  return {
    url: 'http://127.0.0.1:1/',
    address: '127.0.0.1',
    port: 1,
    family: 'IPv4',
    addressInfo: { address: '127.0.0.1', port: 1, family: 'IPv4' },
    projectRoot: null,
    get socketErrorListeners(): number {
      return socket.listenerCount('error');
    },
    socket,
    close: () => Promise.resolve(),
  };
}

test('the signal handler is registered before anything a consumer can observe', async () => {
  const order: string[] = [];

  const code = await run([], {
    start: () => {
      // The listening socket is observable too, so the handler must already be
      // in place before the bind — not merely before the URL is printed.
      order.push('bind');
      return Promise.resolve(stubHandle());
    },
    onSignal: () => order.push('register-signal-handler'),
    stdout: () => order.push('announce-url'),
    stderr: () => order.push('write-diagnostic'),
    exit: () => order.push('exit'),
  });

  assert.equal(code, 0);
  assert.deepEqual(order, ['register-signal-handler', 'bind', 'write-diagnostic', 'announce-url']);
});

test('the URL is the last thing startup emits', async () => {
  const order: string[] = [];
  await run([], {
    start: () => Promise.resolve(stubHandle()),
    onSignal: () => order.push('register-signal-handler'),
    stdout: () => order.push('announce-url'),
    stderr: () => order.push('write-diagnostic'),
    exit: () => {},
  });

  assert.equal(order.at(-1), 'announce-url', 'readiness must be announced last');
  assert.ok(
    order.indexOf('register-signal-handler') < order.indexOf('announce-url'),
    'the signal handler must be registered before readiness is announced',
  );
});

test('a signal arriving before the bind completes still exits 0', async () => {
  // With the handler registered first, an interrupted startup finds nothing to
  // close. Exiting 0 is the right answer; being killed by the signal is not.
  const exits: number[] = [];
  let handler: (() => void) | undefined;

  await run([], {
    start: () => {
      handler?.();
      return Promise.resolve(stubHandle());
    },
    onSignal: (h) => {
      handler = h;
    },
    stdout: () => {},
    stderr: () => {},
    exit: (code) => exits.push(code),
  });

  await new Promise((r) => setImmediate(r));
  assert.deepEqual(exits, [0], 'a signal during startup must exit 0, not fall through');
});

test('the EPIPE guards are installed before any write', async () => {
  // Same principle as the signal handlers: a guard registered after the thing
  // it guards is not a guard. Structural because the entry block only runs in a
  // real process invocation.
  const source = await readFile(join(REPO_ROOT, 'src', 'cli', 'index.ts'), 'utf8');
  const guard = source.indexOf("stream.on('error'");
  const invoke = source.indexOf('await run(process.argv.slice(2))');
  assert.notEqual(guard, -1, 'no EPIPE guard found');
  assert.notEqual(invoke, -1, 'could not find the run invocation');
  assert.ok(guard < invoke, 'the EPIPE guard must be installed before run() writes anything');
});

/**
 * End-to-end corroboration: signal on the **first byte** of stdout, with no
 * settling delay, repeatedly. This is what a consumer racing the readiness
 * contract actually does.
 */
async function signalOnFirstByte(signal: NodeJS.Signals): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
}> {
  const child = spawn(process.execPath, [CLI], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
  let sent = false;
  child.stdout.on('data', () => {
    if (sent) return;
    sent = true;
    child.kill(signal);
  });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: null, signal: 'SIGKILL' });
    }, 15_000);
    timer.unref();
    child.on('close', (code, closeSignal) => {
      clearTimeout(timer);
      resolve({ code, signal: closeSignal });
    });
  });
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  test(`signalling on the first byte of the URL always exits 0 (${signal})`, async () => {
    const attempts = 12;
    const results = await Promise.all(
      Array.from({ length: attempts }, () => signalOnFirstByte(signal)),
    );

    const killed = results.filter((r) => r.code === null);
    assert.deepEqual(
      killed,
      [],
      `${killed.length}/${attempts} runs were terminated by signal instead of exiting 0 — ` +
        'the readiness announcement raced the handler registration',
    );
    for (const result of results) {
      assert.equal(result.code, 0);
      assert.equal(result.signal, null);
    }
  });
}
