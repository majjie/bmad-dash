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

/**
 * A synthetic absolute root. Fixed rather than `process.cwd()` so a test's
 * expectations do not change with the directory it is run from, and chosen to
 * look nothing like this repository so a path leaking from the real filesystem
 * into an assertion is visible.
 */
const PROJECT_ROOT = '/tmp/bmad-dash-test-project';

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
    projectRoot: PROJECT_ROOT,
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
    launch: () => Promise.resolve({ opened: true, command: 'stub' }),
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
    launch: () => Promise.resolve({ opened: true, command: 'stub' }),
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
    launch: () => Promise.resolve({ opened: true, command: 'stub' }),
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
  // Matched on the prefix rather than the whole call: the production invocation
  // gained an argument when `launch` became a required dependency, and a test
  // that pins the exact call text fails on every future dependency too.
  const invoke = source.indexOf('await run(process.argv.slice(2)');
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
  const child = spawn(process.execPath, [CLI, '--no-open'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
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

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
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

test('the root the composition root resolves is the root the server is given', async () => {
  // The seam this story opened, asserted at the *consuming* end. Both halves
  // were already tested — `parseInvocation` resolves the argument, and the
  // render layer prints whatever root it is handed — with nothing crossing the
  // join. Replacing `invocation.projectRoot` with `process.cwd()` at the call
  // site passed all 263 tests: the `Target:` line on stderr is built from
  // `invocation.projectRoot` independently of what reaches `start`, so it
  // cannot catch this, and no other test reads a response body.
  let seen: unknown = '<never called>';
  const target = '/tmp/bmad-dash-seam-check';

  const code = await run([target], {
    launch: () => Promise.resolve({ opened: true, command: 'stub' }),
    start: (options: { readonly projectRoot?: unknown }) => {
      seen = options.projectRoot;
      return Promise.resolve(stubHandle());
    },
    stdout: () => {},
    stderr: () => {},
    onSignal: () => {},
  });

  assert.equal(code, 0);
  assert.equal(seen, target, 'the server was given a different root than the CLI resolved');
});

test('a relative argument reaches the server already resolved to absolute', async () => {
  // The reason the seam matters: every later surface resolves artifact paths
  // against this value, so a cwd-relative root recorded here would be resolved
  // differently by each of them.
  let seen = '';
  await run(['.'], {
    launch: () => Promise.resolve({ opened: true, command: 'stub' }),
    start: (options: { readonly projectRoot?: unknown }) => {
      seen = String(options.projectRoot);
      return Promise.resolve(stubHandle());
    },
    stdout: () => {},
    stderr: () => {},
    onSignal: () => {},
  });
  assert.ok(seen.startsWith('/'), `the server received a relative root: ${seen}`);
  assert.equal(seen, process.cwd());
});

test('the URL reaches stdout before any launch is attempted', async () => {
  // AD-15 as an ordering, asserted as the order of observable events rather
  // than as a timing window — a launch that happened to be slow would make a
  // timing-based version pass while the guarantee was broken.
  const order: string[] = [];

  const code = await run([], {
    start: () => Promise.resolve(stubHandle()),
    stdout: (text: string) => {
      order.push(`stdout:${text.trim()}`);
    },
    stderr: (text: string) => {
      order.push(`stderr:${text.trim().split(':')[0] ?? ''}`);
    },
    launch: (url: string) => {
      order.push(`launch:${url}`);
      return Promise.resolve({ opened: true, command: 'stub' });
    },
    onSignal: () => {},
  });

  assert.equal(code, 0);
  const announcement = order.indexOf('stdout:http://127.0.0.1:1/');
  const attempt = order.indexOf('launch:http://127.0.0.1:1/');
  assert.notEqual(announcement, -1, `the URL was never announced: ${order.join(' | ')}`);
  assert.notEqual(attempt, -1, `no launch was attempted: ${order.join(' | ')}`);
  assert.ok(
    announcement < attempt,
    `the launch preceded the announcement: ${order.join(' | ')}`,
  );
  // And the launcher is handed the URL that was announced, not a rebuilt one.
  assert.equal(order[attempt], `launch:${order[announcement]?.slice('stdout:'.length) ?? ''}`);
});

test('--no-open attempts no launch at all', async () => {
  // Not "launches and fails" — never calls the launcher. A suppression flag
  // that still spawned something would be worse than none, because the reader
  // asked for exactly the opposite.
  let attempts = 0;
  const code = await run(['--no-open'], {
    start: () => Promise.resolve(stubHandle()),
    stdout: () => {},
    stderr: () => {},
    launch: () => {
      attempts += 1;
      return Promise.resolve({ opened: true, command: 'stub' });
    },
    onSignal: () => {},
  });
  assert.equal(code, 0);
  assert.equal(attempts, 0, '--no-open still called the launcher');
});

test('a failed launch is reported and changes nothing else', async () => {
  // AD-15: reported and ignored. The exit code must not move, and the URL must
  // still have been announced — a reader whose browser did not open needs the
  // URL more than anyone.
  const out: string[] = [];
  const err: string[] = [];
  const code = await run([], {
    start: () => Promise.resolve(stubHandle()),
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    launch: () => Promise.resolve({ opened: false, command: 'xdg-open', reason: 'spawn xdg-open ENOENT' }),
    onSignal: () => {},
  });

  assert.equal(code, 0, 'a failed launch must not change the exit code');
  assert.ok(out.join('').includes('http://127.0.0.1:1/'), 'the URL is still announced');
  const report = err.join('');
  assert.match(report, /Could not open a browser: spawn xdg-open ENOENT\./);
  assert.match(report, /Open the URL above\./, 'the reader is told what to do instead');
});

test('a successful launch says nothing', async () => {
  // The common case is silent. A line saying "opened your browser" is noise
  // next to a browser that just appeared.
  const err: string[] = [];
  await run([], {
    start: () => Promise.resolve(stubHandle()),
    stdout: () => {},
    stderr: (text: string) => err.push(text),
    launch: () => Promise.resolve({ opened: true, command: 'xdg-open' }),
    onSignal: () => {},
  });
  assert.doesNotMatch(err.join(''), /browser/i, 'success must be silent');
});

test('the port the CLI parsed is the port the server is asked for', async () => {
  // The same seam as `projectRoot`, one story later and in the same file:
  // `parsePort` is tested where the value is created, `startServer` is tested
  // where it is used, and nothing crossed the join. Deleting `port:` from the
  // start options passed the whole suite.
  for (const [argv, expected] of [
    [['--port', '3000'], 3000],
    [['--port', '0'], 0],
    [['--port', '65535'], 65_535],
    [[], 0],
  ] as const) {
    let seen: unknown = '<never called>';
    const code = await run([...argv], {
      start: (options: { readonly port?: unknown }) => {
        seen = options.port;
        return Promise.resolve(stubHandle());
      },
    launch: () => Promise.resolve({ opened: true, command: 'stub' }),
      stdout: () => {},
      stderr: () => {},
      onSignal: () => {},
    });
    assert.equal(code, 0);
    assert.equal(seen, expected, `${argv.join(' ') || '(no flags)'} reached the server as ${String(seen)}`);
  }
});

test('a requested port that could not be bound is reported, not swallowed', async () => {
  // The adapter falls back to an OS-assigned port so the tool still starts,
  // which is right. Saying nothing about it is not: `--port 45999` binding
  // 36203 in silence tells the reader their instruction was obeyed.
  const err: string[] = [];
  const code = await run(['--port', '45999'], {
    start: () => Promise.resolve({ ...stubHandle(), port: 36_203, url: 'http://127.0.0.1:36203/' }),
    launch: () => Promise.resolve({ opened: true, command: 'stub' }),
    stdout: () => {},
    stderr: (text: string) => err.push(text),
    onSignal: () => {},
  });

  assert.equal(code, 0, 'a fallback is not a failure');
  assert.match(err.join(''), /Port 45999 was not available; using 36203 instead\./);
});

test('an honoured port is not remarked on, and neither is the default', async () => {
  // The other direction: the default of 0 *means* "whatever is free", so
  // reporting the fallback every run would be noise on every ordinary start.
  for (const argv of [[], ['--port', '1']]) {
    const err: string[] = [];
    await run([...argv], {
      start: () => Promise.resolve(stubHandle()),
      launch: () => Promise.resolve({ opened: true, command: 'stub' }),
      stdout: () => {},
      stderr: (text: string) => err.push(text),
      onSignal: () => {},
    });
    assert.doesNotMatch(err.join(''), /was not available/, `${argv.join(' ') || '(default)'} should be quiet`);
  }
});
