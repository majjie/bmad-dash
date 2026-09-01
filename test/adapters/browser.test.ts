/**
 * The browser adapter: what it invokes, how, and what it does when that fails.
 *
 * A real launch is the one thing this cannot assert — CI has no browser, and
 * "a window appeared" is not observable from here. So the launcher is injected
 * and the *invocation* is asserted instead: the command, the argument vector,
 * and the absence of a shell. The story's own Verification section carries the
 * manual check that a browser really opens.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { spawn as SpawnFn } from 'node:child_process';

import { openBrowser, launcherFor } from '../../src/adapters/browser/open.ts';

interface Invocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: Record<string, unknown>;
}

/** A stub `spawn` that records how it was called and never starts anything. */
function recordingSpawn(behaviour: 'ok' | 'error' | 'throw' = 'ok'): {
  readonly spawnProcess: typeof SpawnFn;
  readonly calls: readonly Invocation[];
} {
  const calls: Invocation[] = [];
  const spawnProcess = ((command: string, args: readonly string[], options: Record<string, unknown>) => {
    calls.push({ command, args: [...args], options });
    if (behaviour === 'throw') throw new Error('EINVAL: bad argument');
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};
    if (behaviour === 'error') {
      setImmediate(() => child.emit('error', new Error(`spawn ${command} ENOENT`)));
    }
    return child;
  }) as unknown as typeof SpawnFn;
  return { spawnProcess, calls };
}

const URL_UNDER_TEST = 'http://127.0.0.1:41753/';

// ---------------------------------------------------------------------------
// One command per platform
// ---------------------------------------------------------------------------

test('each platform gets exactly one launcher, and the URL is its last argument', async () => {
  for (const [platform, command] of [
    ['darwin', 'open'],
    ['linux', 'xdg-open'],
    ['win32', 'rundll32'],
    ['freebsd', 'xdg-open'],
    ['android', 'xdg-open'],
  ] as const) {
    const { spawnProcess, calls } = recordingSpawn();
    const result = await openBrowser(URL_UNDER_TEST, { spawnProcess, platform });

    assert.equal(calls.length, 1, `${platform} must attempt exactly once — no fallback chain`);
    assert.equal(calls[0]?.command, command, `${platform} should use ${command}`);
    assert.equal(calls[0]?.args.at(-1), URL_UNDER_TEST, 'the URL is the final argument');
    assert.ok(result.opened, `${platform} should report success from a stub that starts`);
  }
});

test('Windows uses rundll32, not a shell builtin', () => {
  // `start` is a cmd builtin, so reaching it means reaching a shell — the one
  // place a URL must never be handed to.
  const windows = launcherFor('win32');
  assert.equal(windows.command, 'rundll32');
  assert.deepEqual(windows.args, ['url.dll,FileProtocolHandler']);
  assert.ok(!windows.command.includes('cmd'), 'no cmd');
  assert.ok(!windows.args.some((arg) => arg.includes('start')), 'no start builtin');
});

test('an unknown platform falls back to xdg-open rather than to nothing', () => {
  // Failing to launch is fine; failing to *try* would silently drop FR-5 on
  // any platform Node grows a name for.
  assert.equal(launcherFor('some-future-os').command, 'xdg-open');
  assert.equal(launcherFor('').command, 'xdg-open');
});

// ---------------------------------------------------------------------------
// No shell, ever
// ---------------------------------------------------------------------------

test('the child is spawned without a shell, detached, with stdio ignored', async () => {
  const { spawnProcess, calls } = recordingSpawn();
  await openBrowser(URL_UNDER_TEST, { spawnProcess, platform: 'linux' });
  const options = calls[0]?.options ?? {};
  assert.equal(options.shell, false, 'a shell would make the URL interpretable as a command');
  assert.equal(options.detached, true, 'the browser must outlive us');
  assert.equal(options.stdio, 'ignore', 'a chatty launcher must not write into our output');
});

test('no argument is ever a command string, however hostile the URL', async () => {
  // The URL we pass is one we built from a loopback address and a port, so this
  // cannot happen today. It is asserted so that it still cannot happen if a
  // later story ever passes a URL it did not construct.
  const hostile = 'http://127.0.0.1:1/?x=$(touch /tmp/pwned)&y=`id`;rm -rf /';
  const { spawnProcess, calls } = recordingSpawn();
  await openBrowser(hostile, { spawnProcess, platform: 'linux' });

  assert.equal(calls.length, 1);
  // The URL travels as one argv element, intact and unsplit — which is exactly
  // what makes the metacharacters inert — and behind `--`, so it cannot be read
  // as an option either.
  assert.deepEqual(calls[0]?.args, ['--', hostile]);
  assert.equal(calls[0]?.options.shell, false);
  assert.ok(!calls[0]?.command.includes(' '), 'the command is a bare executable name');
});

// ---------------------------------------------------------------------------
// Failure is an outcome
// ---------------------------------------------------------------------------

test('a launcher that does not exist yields a reported reason, not a rejection', async () => {
  const { spawnProcess } = recordingSpawn('error');
  const result = await openBrowser(URL_UNDER_TEST, { spawnProcess, platform: 'linux' });

  assert.equal(result.opened, false);
  assert.ok(!result.opened && result.reason.includes('ENOENT'), `reason was ${JSON.stringify(result)}`);
  assert.ok(!result.opened && result.command === 'xdg-open', 'the command is reported separately');
  // Not prefixed with the command: Node's own message already names it, and
  // prefixing produced "xdg-open: spawn xdg-open ENOENT".
  assert.ok(!result.opened && !result.reason.startsWith('xdg-open:'));
});

test('a spawn that throws synchronously is also an outcome', async () => {
  // `spawn` throws rather than emitting for some argument-level failures, and
  // an uncaught throw here would end the process after the server was already
  // serving — the exact opposite of best-effort.
  const { spawnProcess } = recordingSpawn('throw');
  const result = await openBrowser(URL_UNDER_TEST, { spawnProcess, platform: 'linux' });
  assert.equal(result.opened, false);
  assert.ok(!result.opened && result.reason.includes('EINVAL'));
});

test('openBrowser never rejects, whatever the launcher does', async () => {
  for (const behaviour of ['ok', 'error', 'throw'] as const) {
    const { spawnProcess } = recordingSpawn(behaviour);
    await assert.doesNotReject(
      () => openBrowser(URL_UNDER_TEST, { spawnProcess, platform: 'linux' }),
      `behaviour "${behaviour}" must resolve, not reject`,
    );
  }
});

test('a failure and a success are distinguishable, so the caller can stay quiet on success', async () => {
  const ok = await openBrowser(URL_UNDER_TEST, {
    spawnProcess: recordingSpawn('ok').spawnProcess,
    platform: 'linux',
  });
  const bad = await openBrowser(URL_UNDER_TEST, {
    spawnProcess: recordingSpawn('error').spawnProcess,
    platform: 'linux',
  });
  assert.equal(ok.opened, true);
  assert.equal(bad.opened, false);
  assert.ok(ok.opened && ok.command === 'xdg-open');
});

test('the child is released, so a launcher cannot hold the process open', async () => {
  let unreffed = false;
  const spawnProcess = ((command: string) => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {
      unreffed = true;
    };
    void command;
    return child;
  }) as unknown as typeof SpawnFn;

  await openBrowser(URL_UNDER_TEST, { spawnProcess, platform: 'linux' });
  assert.ok(unreffed, 'the child must be unref’d or it keeps the event loop alive');
});

test('a URL beginning with a dash cannot become an option to the launcher', () => {
  // Shell safety and argument safety are different properties. Without the
  // `--` separator a URL like `-a/Calculator` is an *option* to `open`, which
  // no amount of "no shell" prevents.
  const dashy = '-a/Applications/Calculator.app';
  const { spawnProcess, calls } = recordingSpawn();
  void openBrowser(dashy, { spawnProcess, platform: 'darwin' });
  const args = calls[0]?.args ?? [];
  assert.equal(args.at(-1), dashy, 'the URL is still the last argument');
  assert.equal(args.at(-2), '--', 'and it sits behind an end-of-options separator');
});

test('a launcher that exits non-zero immediately is a failure, not a success', async () => {
  // `xdg-open` exists on plenty of machines with no handler registered and
  // exits 3 at once. Reporting that as success left the reader with no browser,
  // no message and no hint.
  const spawnProcess = ((command: string) => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};
    void command;
    setImmediate(() => child.emit('exit', 3));
    return child;
  }) as unknown as typeof SpawnFn;

  const result = await openBrowser(URL_UNDER_TEST, { spawnProcess, platform: 'linux' });
  assert.equal(result.opened, false, 'a launcher that refused must not be reported as success');
  assert.ok(!result.opened && result.reason.includes('3'), `reason was ${JSON.stringify(result)}`);
});

test('a launcher that keeps running is a success', async () => {
  // The other side of the same rule: a launcher still alive after the grace
  // window has found something to do, and we do not wait for a browser.
  const spawnProcess = ((command: string) => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};
    void command;
    return child;
  }) as unknown as typeof SpawnFn;

  const result = await openBrowser(URL_UNDER_TEST, { spawnProcess, platform: 'linux' });
  assert.equal(result.opened, true);
});

test('a clean immediate exit is still a success', async () => {
  // `open` on macOS returns 0 promptly once it has handed the URL over.
  const spawnProcess = ((command: string) => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};
    void command;
    setImmediate(() => child.emit('exit', 0));
    return child;
  }) as unknown as typeof SpawnFn;

  const result = await openBrowser(URL_UNDER_TEST, { spawnProcess, platform: 'darwin' });
  assert.equal(result.opened, true);
});
