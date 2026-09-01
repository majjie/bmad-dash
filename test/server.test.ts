/**
 * Behavioural coverage of Story 1.1's I/O matrix, plus every gap reviewers have
 * demonstrated by mutation against a green suite: content type, signal
 * handling, the exact usage exit code, the query-string strip, prompt shutdown
 * under a live keep-alive connection, `onError` delivery, and relative-path
 * resolution.
 *
 * The adapter is exercised as source; the CLI is exercised as the compiled
 * `dist/` output, because that is what `npx` runs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest, createServer, Agent } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir, networkInterfaces } from 'node:os';
import { join, dirname, resolve as resolvePath, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  startServer,
  isExpectedHost,
  LOOPBACK_ADDRESS,
} from '../src/adapters/http/server.ts';
import { parseInvocation, run } from '../src/cli/index.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The compiled entry point, taken from `package.json`'s `bin` rather than
 * hardcoded, so these tests exercise the path the package actually publishes.
 */
const CLI = join(
  REPO_ROOT,
  (JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    bin: Record<string, string>;
  }).bin['bmad-dash'] ?? 'dist/cli/index.js',
);
const URL_PATTERN = /^http:\/\/127\.0\.0\.1:(\d+)\/$/;
/** A spawned CLI that has not printed a URL by now is hung, not slow. */
const CLI_TIMEOUT_MS = 15_000;
/**
 * A shutdown must beat this. Node's default `keepAliveTimeout` is 5s, so a
 * server that waits for an idle keep-alive socket instead of destroying it
 * still exits — about five seconds late. That is the hang being caught.
 */
const PROMPT_SHUTDOWN_MS = 2_500;
/** Distinctive to this server: no foreign listener produces either string. */
const OUR_PAGE_MARKER = 'bmad-dash';
const OUR_FORBIDDEN_MARKER = 'Forbidden: unexpected Host header.';

interface Response {
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/**
 * One request, with the `Host` header under the caller's control — `fetch`
 * forbids setting it, which is exactly the header under test.
 */
function get(options: {
  port: number;
  path?: string;
  host?: string;
  method?: string;
  agent?: Agent;
}): Promise<Response> {
  const { port, path = '/', host, method = 'GET', agent } = options;
  return new Promise<Response>((resolve, reject) => {
    const req = httpRequest(
      {
        host: LOOPBACK_ADDRESS,
        port,
        path,
        method,
        setHost: host === undefined,
        headers: host === undefined ? {} : { host },
        ...(agent === undefined ? {} : { agent }),
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          const headers: Record<string, string | undefined> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            headers[key] = Array.isArray(value) ? value.join(', ') : value;
          }
          resolve({ status: res.statusCode ?? 0, body, headers });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

type Identity = 'ours' | 'foreign' | 'unreachable';

/**
 * Connect to `host:port` and decide whether the responder is *this* server.
 *
 * A bare connection test is not enough: something else could be listening on
 * the same port on another interface, and blaming this server for it would be a
 * false failure. `expectedHostHeader` is whatever the server reports having
 * bound, so the identity check holds even when the bind is wrong.
 */
function identify(
  host: string,
  port: number,
  expectedHostHeader: string,
  timeoutMs = 600,
): Promise<Identity> {
  return new Promise<Identity>((resolve) => {
    const socket = connect({ host, port });
    let response = '';
    let settled = false;
    const finish = (outcome: Identity): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(outcome);
    };

    const looksLikeOurs = (): boolean =>
      response.includes(OUR_PAGE_MARKER) || response.includes(OUR_FORBIDDEN_MARKER);

    socket.setTimeout(timeoutMs, () => finish('unreachable'));
    socket.once('error', () => finish('unreachable'));
    socket.once('connect', () => {
      socket.write(`GET / HTTP/1.1\r\nHost: ${expectedHostHeader}\r\nConnection: close\r\n\r\n`);
    });
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      response += chunk;
      if (looksLikeOurs()) finish('ours');
    });
    socket.on('end', () => {
      finish(looksLikeOurs() ? 'ours' : response.length > 0 ? 'foreign' : 'unreachable');
    });
  });
}

interface Candidate {
  readonly name: string;
  /** Connect target, carrying the IPv6 scope id where one is needed. */
  readonly target: string;
  readonly family: string;
}

/**
 * Every non-internal address this host has, IPv4 **and** IPv6. Filtering to
 * IPv4 would leave the test claiming "every non-loopback interface" while
 * checking half of them. Empty on an isolated container, which is a legitimate
 * state, not a reason to skip.
 */
function nonLoopbackAddresses(): Candidate[] {
  const found: Candidate[] = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const entry of addresses ?? []) {
      if (entry.internal) continue;
      // A link-local IPv6 address is unroutable without its scope id.
      const scope =
        entry.family === 'IPv6' && entry.scopeid !== undefined && entry.scopeid !== 0
          ? `%${String(entry.scopeid)}`
          : '';
      found.push({ name, target: `${entry.address}${scope}`, family: entry.family });
    }
  }
  return found;
}

/** A bound, occupied port. */
function occupyPort(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const squatter = createServer();
    squatter.once('error', reject);
    squatter.listen({ host: LOOPBACK_ADDRESS, port: 0, exclusive: true }, () => {
      const info = squatter.address() as AddressInfo;
      resolve({
        port: info.port,
        close: () => new Promise<void>((done) => squatter.close(() => done())),
      });
    });
  });
}

interface CliResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run the compiled CLI to completion, failing with a diagnostic rather than
 * stalling the suite if it never exits.
 */
function runCli(args: readonly string[], cwd: string = REPO_ROOT): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          `CLI did not exit within ${CLI_TIMEOUT_MS}ms. stdout: ${JSON.stringify(stdout)} stderr: ${JSON.stringify(stderr)}`,
        ),
      );
    }, CLI_TIMEOUT_MS);
    timer.unref();

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c: string) => {
      stdout += c;
    });
    child.stderr.on('data', (c: string) => {
      stderr += c;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

interface Exit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  /** True when the process had to be killed because it would not exit. */
  readonly timedOut: boolean;
}

interface RunningCli {
  readonly url: string;
  readonly port: number;
  stderr(): string;
  /**
   * Send `signal` and resolve with how the process actually exited. Bounded:
   * a process that refuses to shut down must fail the assertion, not stall the
   * suite forever — which is exactly what a hanging `close()` does.
   */
  stopWith(signal: NodeJS.Signals, timeoutMs?: number): Promise<Exit>;
  stop(): Promise<void>;
}

/** Start the compiled CLI and wait for the URL it prints. Caller must stop it. */
function startCli(args: readonly string[], cwd: string): Promise<RunningCli> {
  return new Promise<RunningCli>((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const exited = new Promise<Exit>((done) => {
      child.on('close', (code, signal) => done({ code, signal, timedOut: false }));
    });

    const stopWith = async (signal: NodeJS.Signals, timeoutMs = 8_000): Promise<Exit> => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
      const hung = new Promise<Exit>((done) => {
        const t = setTimeout(() => {
          child.kill('SIGKILL');
          done({ code: null, signal: null, timedOut: true });
        }, timeoutMs);
        t.unref();
      });
      return Promise.race([exited, hung]);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          `CLI printed no URL within ${CLI_TIMEOUT_MS}ms. stdout: ${JSON.stringify(stdout)} stderr: ${JSON.stringify(stderr)}`,
        ),
      );
    }, CLI_TIMEOUT_MS);
    timer.unref();

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c: string) => {
      stderr += c;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      const newline = stdout.indexOf('\n');
      if (settled || newline === -1) return;
      settled = true;
      clearTimeout(timer);
      const url = stdout.slice(0, newline);
      const port = URL_PATTERN.exec(url)?.[1];
      if (port === undefined) {
        child.kill('SIGKILL');
        reject(new Error(`unexpected stdout: ${JSON.stringify(url)}`));
        return;
      }
      resolve({
        url,
        port: Number(port),
        stderr: () => stderr,
        stopWith,
        stop: async () => {
          await stopWith('SIGTERM');
        },
      });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`CLI exited before printing a URL. stderr: ${stderr}`));
      }
    });
  });
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const settle = (ms = 50): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });

/**
 * A losing side for `Promise.race` that can be cancelled.
 *
 * A bare `settle()` loser keeps a live timer after the race is won — three
 * shutdown tests each held a 2.5s handle past their own completion. Unref'd so
 * it cannot hold the process open, and cleared on the winning path so it does
 * not linger at all.
 */
function deadline(ms: number, message: string): { promise: Promise<never>; cancel: () => void } {
  let timer: NodeJS.Timeout | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
    timer.unref();
  });
  return {
    promise,
    cancel: () => {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

test('the server serves a page on the address it reports', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  assert.match(server.url, URL_PATTERN);

  const response = await get({ port: server.port });
  assert.equal(response.status, 200);
  assert.match(response.body, /<html/i);
});

test('the served page declares itself HTML and forbids caching', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  // Serving this exact HTML as text/plain passed every earlier test.
  const page = await get({ port: server.port });
  assert.equal(page.status, 200);
  assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(page.headers['cache-control'], 'no-store');
});

test('error responses are plain text and uncached', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  for (const response of [
    await get({ port: server.port, path: '/nope' }),
    await get({ port: server.port, host: 'evil.example' }),
    await get({ port: server.port, method: 'POST' }),
  ]) {
    assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
});

test('the listening socket itself reports the loopback literal on IPv4', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  // `addressInfo` is the `net` layer's account of the bound socket, not a
  // constant this project stores: a bind to `0.0.0.0` or `::` reports that.
  const info = server.addressInfo;
  assert.equal(info.address, '127.0.0.1', `bound ${info.address}, not the loopback literal`);
  assert.equal(info.family, 'IPv4');
  assert.notEqual(info.address, '0.0.0.0');
  assert.notEqual(info.address, '::');
  assert.ok(info.port > 0);

  // Everything reported downstream is derived from that one report.
  assert.equal(server.url, `http://${info.address}:${info.port}/`);
  assert.equal(server.address, info.address);
  assert.equal(server.port, info.port);
});

test('the socket keeps an error listener after binding', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  // `listen` removes its own one-shot listener on success. With none left, a
  // later socket error is an uncaught exception that kills a process the user
  // expects to stay up.
  assert.ok(
    server.socketErrorListeners >= 1,
    `no error listener survives the bind (${server.socketErrorListeners})`,
  );
});

test('a socket error after binding is delivered to onError', async (t) => {
  const delivered: Error[] = [];
  const server = await startServer({
    onError: (error) => {
      delivered.push(error);
    },
  });
  t.after(() => server.close());

  // Counting the listener proved one exists; it did not prove it delivers
  // anything. Emptying the listener body passed every earlier test.
  const synthetic = new Error('synthetic post-bind socket failure');
  server.socket.emit('error', synthetic);

  assert.equal(delivered.length, 1, 'onError was not called');
  assert.equal(delivered[0], synthetic);

  // And the process is still alive and serving, which is the point of handling.
  assert.equal((await get({ port: server.port })).status, 200);
});

test('the socket is unreachable on every non-loopback interface', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const expectedHost = `${server.address}:${server.port}`;

  // Prove the probe can identify this server first. Without this, an
  // always-failing probe would make the assertion below pass for the wrong
  // reason.
  assert.equal(
    await identify('127.0.0.1', server.port, expectedHost),
    'ours',
    'the probe cannot identify this server on loopback, so its refusals prove nothing',
  );

  const reachable: string[] = [];
  for (const candidate of nonLoopbackAddresses()) {
    // Only "ours" counts: a foreign listener on the same port on another
    // interface is not this server binding too widely.
    if ((await identify(candidate.target, server.port, expectedHost)) === 'ours') {
      reachable.push(`${candidate.name} ${candidate.family} ${candidate.target}`);
    }
  }

  // Always asserts, including where the candidate list is empty: the claim is
  // that no non-loopback address reaches this socket, which an isolated host
  // satisfies.
  assert.deepEqual(
    reachable,
    [],
    `the socket answered on a non-loopback interface: ${reachable.join(', ')}`,
  );
});

test('a preferred port already bound falls back to another free port', async (t) => {
  const squatter = await occupyPort();
  t.after(() => squatter.close());

  const server = await startServer({ port: squatter.port });
  t.after(() => server.close());

  assert.notEqual(server.port, squatter.port);
  assert.equal(server.url, `http://127.0.0.1:${server.port}/`);
  assert.equal((await get({ port: server.port })).status, 200);
});

test('a port outside the valid range is rejected before binding', async () => {
  // Asserting only `RangeError` was vacuous: `node:net` throws its own
  // RangeError (`ERR_SOCKET_BAD_PORT`) for every one of these, so the test
  // passed with our validation deleted. Match our own message, which is the
  // only evidence the rejection happened here rather than inside `listen`.
  for (const port of [-1, 65536, 1.5, Number.NaN]) {
    await assert.rejects(
      () => startServer({ port }),
      (error: unknown) => {
        assert.ok(error instanceof RangeError, `port ${String(port)}: expected a RangeError`);
        assert.match(error.message, /port must be an integer between 0 and 65535/);
        assert.doesNotMatch(error.message, /options\.port/);
        return true;
      },
      `port ${String(port)} should be rejected before binding`,
    );
  }
});

test('a foreign Host header is rejected with 403 and no content', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const foreign = [
    'evil.example',
    'localhost',
    `localhost:${server.port}`,
    '127.0.0.1',
    `127.0.0.1:${server.port + 1}`,
    '',
  ];
  for (const host of foreign) {
    const response = await get({ port: server.port, host });
    assert.equal(response.status, 403, `Host: ${JSON.stringify(host)} should be rejected`);
    assert.doesNotMatch(response.body, /<html/i);
  }

  assert.equal((await get({ port: server.port, host: `127.0.0.1:${server.port}` })).status, 200);
});

test('a write-shaped method is refused, and HEAD carries no body', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await get({ port: server.port, method });
    assert.equal(response.status, 405, `${method} should not be served`);
    assert.equal(response.headers.allow, 'GET, HEAD');
    assert.doesNotMatch(response.body, /<html/i);
  }

  const head = await get({ port: server.port, method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});

test('the Host check is on the literal bound address and port', () => {
  assert.equal(isExpectedHost('127.0.0.1:4000', '127.0.0.1', 4000), true);
  assert.equal(isExpectedHost('127.0.0.1:4001', '127.0.0.1', 4000), false);
  assert.equal(isExpectedHost('localhost:4000', '127.0.0.1', 4000), false);
  assert.equal(isExpectedHost(undefined, '127.0.0.1', 4000), false);
});

test('a foreign Host is rejected before routing, on unknown paths too', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  assert.equal((await get({ port: server.port, path: '/nope', host: 'evil.example' })).status, 403);
  assert.equal((await get({ port: server.port, path: '/nope' })).status, 404);
});

test('a query string does not change which page is served', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  // Removing the query strip passed every earlier test, while `/?x=1` 404'd.
  for (const path of ['/?x=1', '/?', '/?a=1&b=2']) {
    const response = await get({ port: server.port, path });
    assert.equal(response.status, 200, `${path} should serve the page`);
    assert.match(response.body, /<html/i);
  }

  assert.equal((await get({ port: server.port, path: '/other?x=1' })).status, 404);
});

test('a client that aborts mid-exchange does not take the server down', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  for (let i = 0; i < 3; i += 1) {
    const socket = connect({ host: LOOPBACK_ADDRESS, port: server.port });
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    socket.write(`GET / HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\n\r\n`);
    socket.destroy();
  }
  await settle();

  assert.equal((await get({ port: server.port })).status, 200);
});

test('the adapter guards request and response against a client abort', async () => {
  // Verified empirically: current Node absorbs an aborted exchange internally,
  // so deleting these two listeners changes nothing observable and a mutation
  // test cannot see it. The requirement still holds — an unhandled `error` on
  // either object is fatal on any runtime that does emit one — so it is pinned
  // structurally rather than left silently unenforced.
  const source = await readFile(join(REPO_ROOT, 'src', 'adapters', 'http', 'server.ts'), 'utf8');
  assert.match(source, /request\.on\('error'/, 'no error guard attached to the request');
  assert.match(source, /response\.on\('error'/, 'no error guard attached to the response');
});

/**
 * Open a TCP connection and send `payload` (nothing, by default).
 *
 * A connection with no complete request on it is what `server.close()` waits
 * for forever. Browsers open these routinely — speculative and preconnect
 * sockets — so this is the ordinary case, not an exotic one. Measured: without
 * `closeAllConnections()`, `close()` never resolves for these; a *completed*
 * keep-alive request is closed by `close()` itself since Node 19, which is why
 * an idle-socket test proves nothing.
 */
async function holdConnection(port: number, payload = ''): Promise<() => void> {
  const socket = connect({ host: LOOPBACK_ADDRESS, port });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('error', reject);
  });
  if (payload !== '') socket.write(payload);
  socket.on('error', () => {});
  await settle(30);
  return () => socket.destroy();
}

test('close resolves promptly while a client holds a bare open connection', async (t) => {
  const server = await startServer();
  const release = await holdConnection(server.port);
  // Registered before the assertion: when `close()` does hang, the socket and
  // the listening handle must still be torn down or the whole run never exits
  // — a failing test has to fail, not stall the suite.
  t.after(() => {
    release();
    server.socket.closeAllConnections();
  });

  const started = Date.now();
  const limit = deadline(
    PROMPT_SHUTDOWN_MS,
    'close() did not resolve while one bare connection was open; server.close() ' +
      'alone waits for it indefinitely, which is what makes Ctrl-C hang',
  );
  try {
    await Promise.race([server.close(), limit.promise]);
  } finally {
    limit.cancel();
  }

  assert.ok(Date.now() - started < PROMPT_SHUTDOWN_MS);
});

test('close resolves promptly with a half-sent request in flight', async (t) => {
  const server = await startServer();
  const release = await holdConnection(
    server.port,
    `GET / HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\n`,
  );
  t.after(() => {
    release();
    server.socket.closeAllConnections();
  });

  const started = Date.now();
  const limit = deadline(
    PROMPT_SHUTDOWN_MS,
    'close() did not resolve with a partial request in flight',
  );
  try {
    await Promise.race([server.close(), limit.promise]);
  } finally {
    limit.cancel();
  }

  assert.ok(Date.now() - started < PROMPT_SHUTDOWN_MS);
});

test('a completed keep-alive request does not by itself block close', async (t) => {
  // Documents the boundary: since Node 19 `close()` closes *idle* connections,
  // so this scenario passes with or without `closeAllConnections()`. Kept so
  // nobody mistakes it for the guard — the two tests above are the guard.
  const server = await startServer();
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  t.after(() => {
    agent.destroy();
    server.socket.closeAllConnections();
  });
  assert.equal((await get({ port: server.port, agent })).status, 200);

  await server.close();
});

test('the resolved target is absolute for a relative argument', () => {
  // `projectRoot` is what every later story resolves artifact paths against, so
  // a cwd-relative value here is re-resolved against whatever directory happens
  // to be current later. Dropping `resolve()` passed every earlier test.
  const cwd = '/tmp/somewhere';
  for (const [argument, expected] of [
    ['.', '/tmp/somewhere'],
    ['sub', '/tmp/somewhere/sub'],
    ['./sub', '/tmp/somewhere/sub'],
    ['sub/deeper', '/tmp/somewhere/sub/deeper'],
    ['..', '/tmp'],
    ['../other', '/tmp/other'],
    ['/absolute/elsewhere', '/absolute/elsewhere'],
  ] as const) {
    const invocation = parseInvocation([argument], cwd);
    assert.ok(invocation.ok, `${argument} should parse`);
    assert.equal(invocation.projectRoot, expected, `${argument} resolved wrongly`);
  }
});

test('no argument resolves to the working directory, absolutely', () => {
  const invocation = parseInvocation([], '/tmp/somewhere');
  assert.ok(invocation.ok);
  assert.equal(invocation.projectRoot, '/tmp/somewhere');
});

test('a relative argument is reported as an absolute path by the running CLI', async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'bmad-dash-rel-')));
  t.after(() => rm(parent, { recursive: true, force: true }));

  const target = join(parent, 'project');
  await mkdir(target);
  const relativeArgument = basename(target);

  // Run from `parent`, passing only the bare directory name.
  const cli = await startCli([relativeArgument], parent);
  t.after(() => cli.stop());

  assert.match(cli.stderr(), new RegExp(`Target: ${escapeForRegExp(target)}`));
  assert.equal(resolvePath(parent, relativeArgument), target);
});

test('no argument targets the working directory and prints the URL to stdout', async (t) => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'bmad-dash-cwd-')));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const cli = await startCli([], cwd);
  t.after(() => cli.stop());

  assert.match(cli.url, URL_PATTERN);
  assert.equal((await get({ port: cli.port })).status, 200);
  assert.match(cli.stderr(), new RegExp(`Target: ${escapeForRegExp(cwd)}`));
});

test('an explicit path argument targets that path', async (t) => {
  const target = await realpath(await mkdtemp(join(tmpdir(), 'bmad-dash-target-')));
  t.after(() => rm(target, { recursive: true, force: true }));

  const cli = await startCli([target], REPO_ROOT);
  t.after(() => cli.stop());

  assert.equal((await get({ port: cli.port })).status, 200);
  assert.match(cli.stderr(), new RegExp(`Target: ${escapeForRegExp(target)}`));
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  test(`${signal} shuts the server down with exit code 0`, async () => {
    const cli = await startCli([], REPO_ROOT);

    // Deleting both handlers passed every earlier test: the process died by
    // signal, which no assertion looked at.
    const exit = await cli.stopWith(signal);
    assert.equal(exit.timedOut, false, `${signal} never exited`);
    assert.equal(exit.code, 0, `${signal} should exit 0, got code ${String(exit.code)}`);
    assert.equal(exit.signal, null, `${signal} should be handled, not kill the process`);
  });

  test(`${signal} exits promptly once a browser has connected`, async () => {
    const cli = await startCli([], REPO_ROOT);
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });

    // Earlier signal tests passed only because the CLI had never been touched.
    // A browser both completes requests and leaves speculative connections
    // open; the open one is what `server.close()` waits for indefinitely.
    assert.equal((await get({ port: cli.port, agent })).status, 200);
    const release = await holdConnection(cli.port);

    const started = Date.now();
    const exit = await cli.stopWith(signal);
    const elapsed = Date.now() - started;
    release();
    agent.destroy();

    assert.equal(exit.timedOut, false, `${signal} never exited; Ctrl-C hangs`);
    assert.equal(exit.code, 0, `${signal} should exit 0, got code ${String(exit.code)}`);
    assert.equal(exit.signal, null);
    assert.ok(
      elapsed < PROMPT_SHUTDOWN_MS,
      `${signal} took ${String(elapsed)}ms to exit with a connection open`,
    );
  });
}

test('an unknown flag exits with exactly code 2, naming the flag on stderr', async () => {
  const result = await runCli(['--serve-everywhere']);

  // Exactly 2: changing it to 1 — the runtime-failure code — passed every
  // earlier test, erasing the distinction between misuse and failure to start.
  assert.equal(result.code, 2);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /--serve-everywhere/);
  assert.match(result.stderr, /Accepted arguments/);
});

test('more than one path argument exits with exactly code 2', async () => {
  const result = await runCli(['.', '..']);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Accepted arguments/);
});

test('the deferred --help and --version are rejected as unknown arguments', async () => {
  // Recorded in deferred-work.md: all three exit 2 rather than being handled.
  for (const flag of ['--help', '-h', '--version']) {
    const result = await runCli([flag]);
    assert.equal(result.code, 2, `${flag} should exit 2`);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, new RegExp(escapeForRegExp(flag)));
  }
});

test('the durable error listener is attached before the first listen', async () => {
  // `listen` installs a one-shot `error` handler and removes it on success, so
  // attaching the durable one afterwards left a window — reopened by the retry
  // — with no `error` listener at all, in which any socket failure is an
  // uncaught exception. The window is a microtask, so no runtime test can
  // observe it; the ordering is asserted structurally instead.
  const source = await readFile(join(REPO_ROOT, 'src', 'adapters', 'http', 'server.ts'), 'utf8');
  const durable = source.indexOf("server.on('error'");
  const firstListen = source.indexOf('await listen(server, preferredPort');
  assert.notEqual(durable, -1, 'no durable error listener found');
  assert.notEqual(firstListen, -1, 'could not find the first listen call');
  assert.ok(
    durable < firstListen,
    'the durable error listener must be attached before the first listen, or the ' +
      'socket spends a window with no error listener at all',
  );
});

test('close is idempotent: a second call resolves rather than rejecting', async () => {
  const server = await startServer();

  await server.close();
  // `server.close()` rejects with ERR_SERVER_NOT_RUNNING the second time.
  // Already-closed is the desired end state, not a failure, and a caller
  // should not need its own latch to say so.
  await server.close();
  await Promise.all([server.close(), server.close()]);
});

test('a bare Host is accepted only when the bound port is the scheme default', () => {
  // Building `address:port` unconditionally rejected a browser sending
  // `Host: 127.0.0.1` against a server on port 80.
  assert.equal(isExpectedHost('127.0.0.1', '127.0.0.1', 80), true);
  assert.equal(isExpectedHost('127.0.0.1:80', '127.0.0.1', 80), true);
  assert.equal(isExpectedHost('127.0.0.1', '127.0.0.1', 8080), false);
  assert.equal(isExpectedHost('127.0.0.1', '127.0.0.1', 443), false);
  assert.equal(isExpectedHost('localhost', '127.0.0.1', 80), false);
  assert.equal(isExpectedHost('127.0.0.2', '127.0.0.1', 80), false);
});

test('the error listener count is live, not a snapshot taken at bind time', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const before = server.socketErrorListeners;
  assert.ok(before >= 1);

  const extra = (): void => {};
  server.socket.on('error', extra);
  assert.equal(server.socketErrorListeners, before + 1, 'the count is a stale snapshot');
  server.socket.removeListener('error', extra);
  assert.equal(server.socketErrorListeners, before);
});

test('a failure to start exits 1, distinct from the usage code 2', async () => {
  // `EXIT_FAILURE` was unreachable through the CLI surface, so the suite
  // asserted exit code 2 five times and exit code 1 not once — in a suite whose
  // stated point is that misuse and failure-to-start are different outcomes.
  const written: string[] = [];
  const code = await run([], {
    start: () => Promise.reject(new Error('bind refused, for the test')),
    stdout: () => {},
    stderr: (text) => written.push(text),
  });

  assert.equal(code, 1);
  assert.match(written.join(''), /Could not bind the loopback interface: bind refused, for the test/);
});

test('a usage error exits 2 through the same call path', async () => {
  const written: string[] = [];
  const code = await run(['--not-a-flag'], {
    start: () => {
      throw new Error('start must not be reached for a usage error');
    },
    stdout: () => {},
    stderr: (text) => written.push(text),
  });

  assert.equal(code, 2);
  assert.notEqual(code, 1, 'usage must not collapse into the runtime-failure code');
  assert.match(written.join(''), /--not-a-flag/);
});

test('a closed stdout is a clean exit, not a stack trace', async () => {
  // `bmad-dash | true`. Deleting the EPIPE handler passed all 63 tests while
  // the real pipeline exited 1 and printed an unhandled-error stack trace.
  // A real pipeline is required: destroying the parent's read end does not
  // reproduce it.
  const quote = (value: string): string => `"${value}"`;
  const pipeline = `${quote(process.execPath)} ${quote(CLI)} | ${quote(process.execPath)} -e ""`;

  const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(pipeline, { shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`the pipeline did not finish within ${CLI_TIMEOUT_MS}ms`));
    }, CLI_TIMEOUT_MS);
    timer.unref();
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });

  assert.equal(result.code, 0, `closed stdout should exit 0, stderr: ${result.stderr}`);
  assert.doesNotMatch(result.stderr, /EPIPE/, `EPIPE leaked to stderr: ${result.stderr}`);
  assert.doesNotMatch(result.stderr, /Unhandled 'error' event/);
  assert.doesNotMatch(result.stderr, /at ContextifyScript|at node:internal/);
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  test(`a repeated ${signal} during shutdown still exits 0`, async () => {
    const cli = await startCli([], REPO_ROOT);
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    assert.equal((await get({ port: cli.port, agent })).status, 200);
    const release = await holdConnection(cli.port);

    // Replacing the latch with `process.once` passes every other test, while a
    // double Ctrl-C falls through to the default action and the process dies by
    // signal instead of exiting 0.
    const exit = await cli.stopWith(signal);
    const again = await cli.stopWith(signal);
    release();
    agent.destroy();

    assert.equal(exit.timedOut, false, `${signal} never exited`);
    assert.equal(exit.code, 0, `repeated ${signal} should exit 0, got ${String(exit.code)}`);
    assert.equal(exit.signal, null, `repeated ${signal} must not terminate by signal`);
    assert.equal(again.code, 0);
  });
}
