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
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { tmpdir, networkInterfaces } from 'node:os';
import { join, dirname, resolve as resolvePath, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  startServer,
  isExpectedHost,
  HARDENING_HEADERS,
  LOOPBACK_ADDRESS,
  MAX_PORT,
  SNAPSHOT_ID_HEADER,
} from '../src/adapters/http/server.ts';
// One statement, not two: `projectInventory` belongs to the same module as
// `run`, and a second import of it would be the first step of the two drifting
// apart in the reader's head.
import { parseInvocation, projectInventory, run } from '../src/cli/index.ts';
import { takeInventory } from '../src/cli/inventory.ts';
import { makeProjectDir } from './support/project.ts';
import { canonical, toPlatform } from '../src/adapters/fs/paths.ts';
import { ConfinedReader } from '../src/adapters/fs/read.ts';
import { EMPTY_INVENTORY, emptyInventory } from './support/cli.ts';
import type { InventoryView } from '../src/render/inventory.ts';
import { artifactUrl, sectionUrl } from '../src/domain/url.ts';
import { ARTIFACT_SURFACE_TITLE, type ArtifactBody } from '../src/render/artifact.ts';
import { COPY_LABEL, COPY_PAYLOAD_ATTRIBUTE, COPY_SCRIPT } from '../src/render/enhance.ts';
import {
  CERTAIN_ROW,
  DELIBERATE_RUN_ROW,
  FULL_INVENTORY_VIEW,
  HOSTILE_PATH,
  SECTION_NAMED_ROW,
  UNIDENTIFIED_ROW,
  UNREADABLE_ROW,
  readableBody,
} from './support/inventory.ts';

/**
 * A synthetic absolute root. Fixed rather than `process.cwd()` so a test's
 * expectations do not change with the directory it is run from, and chosen to
 * look nothing like this repository so a path leaking from the real filesystem
 * into an assertion is visible.
 */
const PROJECT_ROOT = canonical('/tmp/bmad-dash-test-project');

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
/**
 * A raw socket that has not been answered by now is hung, not slow — the same
 * judgement `CLI_TIMEOUT_MS` makes about a spawned process.
 */
const RAW_REQUEST_TIMEOUT_MS = 5_000;
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
/**
 * `--no-open` is prepended by every helper below, not left to call sites.
 *
 * From Story 1.4 a browser launch is the default, so a spawned CLI that serves
 * opens a real tab — and the suite spawns one many times per run. Suppression
 * lives in the helper so no test can forget it, and `test/cli/flags.test.ts`
 * scans for spawns that escaped it. Prepended rather than appended: appended,
 * it would be swallowed as the value of a trailing option such as `--port`.
 *
 * The one exception is the EPIPE test's shell pipeline, which builds a command
 * string rather than an argv and is suppressed at its own site.
 */
function runCli(args: readonly string[], cwd: string = REPO_ROOT): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, '--no-open', ...args], { cwd });
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
    const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [CLI, '--no-open', ...args], {
      cwd,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const exited = new Promise<Exit>((done) => {
      child.on('close', (code, signal) => done({ code, signal, timedOut: false }));
    });

    const stopWith = async (signal: NodeJS.Signals, timeoutMs = 8_000): Promise<Exit> => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
      let watchdog: NodeJS.Timeout | undefined;
      const hung = new Promise<Exit>((done) => {
        watchdog = setTimeout(() => {
          child.kill('SIGKILL');
          done({ code: null, signal: null, timedOut: true });
        }, timeoutMs);
        watchdog.unref();
      });
      try {
        return await Promise.race([exited, hung]);
      } finally {
        // Cleared when `exited` wins the race. `unref()` meant it held nothing
        // open, so the cost was a stray `SIGKILL` at an already-dead child
        // rather than a leak — but `deadline()` exists to do exactly this and
        // this one place was not using it.
        clearTimeout(watchdog);
      }
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
  t.after(() => server.close());

  assert.match(server.url, URL_PATTERN);

  const response = await get({ port: server.port });
  assert.equal(response.status, 200);
  assert.match(response.body, /<html/i);
});

test('the served page declares itself HTML and forbids caching', async (t) => {
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
  t.after(() => server.close());

  // Serving this exact HTML as text/plain passed every earlier test.
  const page = await get({ port: server.port });
  assert.equal(page.status, 200);
  assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(page.headers['cache-control'], 'no-store');
});

test('error responses are plain text and uncached', async (t) => {
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
  t.after(() => server.close());

  // **Both 500s are in this loop, and neither was.** The loop covered 404, 403
  // and 405 only, so an html-typed 500 passed everything — and a 500 is the
  // response most likely to be reached for by a reader who is trying to report
  // what went wrong. The two arrive by different routes: a supplier that
  // throws before any snapshot exists, and a `renderPage` that throws over a
  // snapshot the supplier produced successfully.
  const supplierThrows = await startServer({
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    inventory: () => {
      throw new Error('the project went away');
    },
    onError: () => {},
  });
  t.after(() => supplierThrows.close());
  const renderThrows = await startServer({
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    inventory: () => refusedView(),
    onError: () => {},
  });
  t.after(() => renderThrows.close());

  for (const [status, response] of [
    [404, await get({ port: server.port, path: '/nope' })],
    [403, await get({ port: server.port, host: 'evil.example' })],
    [405, await get({ port: server.port, method: 'POST' })],
    [500, await get({ port: supplierThrows.port })],
    [500, await get({ port: renderThrows.port })],
  ] as const) {
    assert.equal(response.status, status, 'the row must be about the response it names');
    assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
});

/**
 * A view the supplier can hand over successfully and `renderPage` must refuse:
 * an `unidentified` verdict with no attempted levels, which no authority
 * produces and which would otherwise render as `Not identified. Tried: .`
 *
 * This is the only way to reach the *second* 500 — the one where a snapshot
 * did exist, which is what the adapter's own comment stakes its reasoning on.
 * `test/render/inventory.test.ts` owns the refusal itself and says in as many
 * words that "the adapter's own `catch` turns it into a reportable 500"; this
 * is the assertion that the sentence was true.
 */
function refusedView(): InventoryView {
  return {
    ...EMPTY_INVENTORY,
    artifactCount: 1,
    groups: [
      {
        family: 'prd',
        rows: [
          {
            path: 'a',
            identity: { outcome: 'unidentified', attempted: [] },
            readability: { state: 'present', stage: undefined },
            interpretation: 'interpreted',
            runFacts: [],
          },
        ],
        notes: [],
      },
    ],
  };
}

test('over a real project, two loads carry one identity and identical bodies', async (t) => {
  // The I/O matrix's first row, both clauses, over the **composed** path. The
  // two halves were each covered and the join was not: `page.test.ts:193`
  // proves two responses are byte-identical given a *constant* supplier, and
  // the projection test proves two real passes agree on the identity. Neither
  // observes the real supplier feeding the real render, which is where AD-17's
  // claim actually lives — and asserting a value at both ends with nothing
  // crossing the join is the gap this project's verification standard names.
  const root = await makeProjectDir(t, 'bmad-dash-one-identity-');
  await mkdir(join(root, '_bmad-output', 'loose'), { recursive: true });
  await writeFile(join(root, '_bmad-output', 'loose', 'one.md'), '# One\n');

  const canonicalRoot = canonical(root);
  const reader = new ConfinedReader(canonicalRoot);
  const server = await startServer({
    projectRoot: canonicalRoot,
    body: readableBody,
    // The real supplier, not a fixture: a full pass per request, exactly as
    // the composition root wires it.
    inventory: () => projectInventory(takeInventory(reader)),
  });
  t.after(() => server.close());

  const first = await get({ port: server.port });
  const second = await get({ port: server.port });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.match(
    first.headers[SNAPSHOT_ID_HEADER] ?? '',
    /^[0-9a-f]{16}$/,
    'a 200 from a real pass must carry an identity',
  );
  assert.equal(
    second.headers[SNAPSHOT_ID_HEADER],
    first.headers[SNAPSHOT_ID_HEADER],
    'two loads of an unchanged project are one snapshot',
  );
  assert.equal(second.body, first.body, 'and the bodies must be byte-identical');

  // The other direction, so the row above cannot pass by nothing ever moving:
  // a changed project must move both the identity and the page.
  await writeFile(join(root, '_bmad-output', 'loose', 'two.md'), '# Two\n');
  const third = await get({ port: server.port });
  // **The status first, and this is not ceremony.** A regression that turned
  // the third response into a 500 would satisfy both `notEqual`s below
  // vacuously — a 500 carries no identity header and a plain-text body — and
  // the test would report that a changed project is correctly distinguished.
  assert.equal(third.status, 200, 'the third response must be a page, not a refusal');
  assert.notEqual(
    third.headers[SNAPSHOT_ID_HEADER],
    first.headers[SNAPSHOT_ID_HEADER],
    'a changed project must carry a different identity',
  );
  assert.notEqual(third.body, first.body, 'and must render differently');
});

test('the identity header is on 200 and HEAD, and absent on 403, 404, 405 and 500', async (t) => {
  // AD-17's mechanical half, as a presence/absence matrix. The four
  // no-identity responses divide into two reasons, which the spec states as
  // two: 403, 404 and 405 are refused *before* the supplier is called, so no
  // snapshot exists for them to name, while a 500 from a render throw happens
  // after a snapshot existed — and omits the header because no body was
  // produced from it.
  // **The literal, asserted once.** Every assertion below indexes
  // `SNAPSHOT_ID_HEADER`, so renaming the constant's value to anything at all
  // would leave them green while breaking the wire contract the spec fixes by
  // name and the RFC 6648 reasoning behind it. Same shape as
  // `test/architecture.test.ts`'s `assert.equal(MAX_PORT, 65535, …)` beside
  // its own importer-set rule.
  assert.equal(SNAPSHOT_ID_HEADER, 'bmad-snapshot-id', 'the header name is an external contract');

  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
  t.after(() => server.close());

  const page = await get({ port: server.port });
  assert.equal(page.status, 200);
  assert.equal(
    page.headers[SNAPSHOT_ID_HEADER],
    EMPTY_INVENTORY.snapshotId,
    'the header carries the supplier’s own id, not one the adapter made up',
  );

  const head = await get({ port: server.port, method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '', 'HEAD carries no body');
  assert.equal(
    head.headers[SNAPSHOT_ID_HEADER],
    EMPTY_INVENTORY.snapshotId,
    'HEAD carries the same identity as GET, per the I/O matrix',
  );

  for (const [status, response] of [
    [404, await get({ port: server.port, path: '/nope' })],
    [403, await get({ port: server.port, host: 'evil.example' })],
    [405, await get({ port: server.port, method: 'POST' })],
  ] as const) {
    // The status is asserted alongside the absence: without it, a response
    // that had regressed to some *other* refusal would still satisfy the
    // header check, and the row would no longer be about the response it names.
    assert.equal(response.status, status);
    assert.equal(
      response.headers[SNAPSHOT_ID_HEADER],
      undefined,
      `a ${String(status)} is refused before a snapshot exists, so it carries no identity`,
    );
  }
  // And the 405 keeps its own header, so widening the 200 path did not touch it.
  const rejected = await get({ port: server.port, method: 'POST' });
  assert.equal(rejected.headers['allow'], 'GET, HEAD');

  // **Both 500s, because they have different reasons and only one of them was
  // exercised.** A throwing supplier means no snapshot was ever produced. A
  // throwing `renderPage` means the supplier *succeeded* — a snapshot did
  // exist — and the header is omitted because no body was produced from it,
  // which is precisely the distinction the adapter's comment draws and which
  // nothing here checked.
  const supplierThrew = await startServer({
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    inventory: () => {
      throw new Error('the project went away');
    },
    onError: () => {},
  });
  t.after(() => supplierThrew.close());
  const renderThrew = await startServer({
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    inventory: () => refusedView(),
    onError: () => {},
  });
  t.after(() => renderThrew.close());

  for (const [reason, response] of [
    ['no snapshot was ever produced', await get({ port: supplierThrew.port })],
    ['a snapshot existed but no body came from it', await get({ port: renderThrew.port })],
  ] as const) {
    assert.equal(response.status, 500, reason);
    assert.equal(
      response.headers[SNAPSHOT_ID_HEADER],
      undefined,
      `a 500 carries no identity: ${reason}`,
    );
  }
});

test('a view whose identity cannot be a header value is a 500, not a hung request', async (t) => {
  // Why `writeHead` is inside the surrounding `try`. It validates every header
  // name and value it is handed, so a malformed identity threw *past* the
  // request listener: no response written, no `onError`, and a reader watching
  // the tab spin until the socket timed out. There is no snapshot id the
  // projection can produce that looks like this — the digest is sixteen hex
  // characters — which is exactly why it has to be asserted here rather than
  // left to the type.
  //
  // **Parameterized over both routes from Story 2.1a, and the review round is
  // why.** This test defaulted its path to `/` and served `EMPTY_INVENTORY`,
  // which holds no rows — so pointing it at an artifact URL would have 404'd
  // before `writeHead` was ever reached. Moving `writeHead` out of the artifact
  // branch's `try` therefore reintroduced this exact hung request on the second
  // route with nothing red. The view below carries the row, so both routes get
  // as far as writing headers.
  const view: InventoryView = {
    ...FULL_INVENTORY_VIEW,
    snapshotId: 'not\na header value' as InventoryView['snapshotId'],
  };
  for (const path of ['/', artifactUrl(CERTAIN_ROW.path), sectionUrl(CERTAIN_ROW.path, 'goals')]) {
    const reported: Error[] = [];
    const server = await startServer({
      projectRoot: PROJECT_ROOT,
      body: readableBody,
      inventory: () => view,
      onError: (error) => reported.push(error),
    });
    t.after(() => server.close());

    const response = await get({ port: server.port, path });
    assert.equal(response.status, 500, `${path} must be answered rather than abandoned`);
    assert.equal(response.headers[SNAPSHOT_ID_HEADER], undefined, path);
    assert.equal(reported.length, 1, `${path} reported to onError exactly once`);
  }

  // And the identity is the only thing wrong with that view, so the same routes
  // over a well-formed one are 200s — otherwise the loop above would pass for a
  // view that could not render at all.
  const healthy = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: () => FULL_INVENTORY_VIEW });
  t.after(() => healthy.close());
  for (const path of ['/', artifactUrl(CERTAIN_ROW.path)]) {
    assert.equal((await get({ port: healthy.port, path })).status, 200, path);
  }
});

test('the listening socket itself reports the loopback literal on IPv4', async (t) => {
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    inventory: emptyInventory,
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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

  const server = await startServer({
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    port: squatter.port,
    inventory: emptyInventory,
  });
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
      () => startServer({ projectRoot: PROJECT_ROOT, port, body: readableBody, inventory: emptyInventory }),
      (error: unknown) => {
        assert.ok(error instanceof RangeError, `port ${String(port)}: expected a RangeError`);
        assert.match(
          error.message,
          new RegExp(`port must be an integer between 0 and ${String(MAX_PORT)}`),
        );
        assert.doesNotMatch(error.message, /options\.port/);
        return true;
      },
      `port ${String(port)} should be rejected before binding`,
    );
  }
});

test('a foreign Host header is rejected with 403 and no content', async (t) => {
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
  t.after(() => server.close());

  assert.equal((await get({ port: server.port, path: '/nope', host: 'evil.example' })).status, 403);
  assert.equal((await get({ port: server.port, path: '/nope' })).status, 404);
});

test('a query string does not change which page is served', async (t) => {
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
    assert.ok('projectRoot' in invocation, `${argument} should be a serving invocation`);
    assert.equal(invocation.projectRoot, expected, `${argument} resolved wrongly`);
  }
});

test('no argument resolves to the working directory, absolutely', () => {
  const invocation = parseInvocation([], '/tmp/somewhere');
  assert.ok(invocation.ok);
  assert.ok('projectRoot' in invocation);
  assert.equal(invocation.projectRoot, '/tmp/somewhere');
});

test('a relative argument is reported as an absolute path by the running CLI', async (t) => {
  const parent = await makeProjectDir(t, 'bmad-dash-rel-');

  const target = join(parent, 'project');
  await mkdir(target);
  for (const marker of ['_bmad', '_bmad-output']) {
    await mkdir(join(target, marker), { recursive: true });
  }
  const relativeArgument = basename(target);

  // Run from `parent`, passing only the bare directory name.
  const cli = await startCli([relativeArgument], parent);
  t.after(() => cli.stop());

  assert.match(cli.stderr(), new RegExp(`Target: ${escapeForRegExp(target)}`));
  assert.equal(resolvePath(parent, relativeArgument), target);
});

test('no argument targets the working directory and prints the URL to stdout', async (t) => {
  const cwd = await makeProjectDir(t, 'bmad-dash-cwd-');

  const cli = await startCli([], cwd);
  t.after(() => cli.stop());

  assert.match(cli.url, URL_PATTERN);
  assert.equal((await get({ port: cli.port })).status, 200);
  assert.match(cli.stderr(), new RegExp(`Target: ${escapeForRegExp(cwd)}`));
});

test('an explicit path argument targets that path', async (t) => {
  const target = await makeProjectDir(t, 'bmad-dash-target-');

  const cli = await startCli([target], REPO_ROOT);
  t.after(() => cli.stop());

  const response = await get({ port: cli.port });
  assert.equal(response.status, 200);
  assert.match(cli.stderr(), new RegExp(`Target: ${escapeForRegExp(target)}`));

  // End to end, through a real spawned process: the path the CLI resolved must
  // be the path the *page* shows, not merely the path it announced on stderr.
  // Those two were independent until this assertion existed — the `Target:`
  // line is built from `invocation.projectRoot` directly, so handing the server
  // a different root left it saying the right thing while serving the wrong
  // project, with the whole suite green.
  assert.ok(
    response.body.includes(target),
    `the served page does not name the target the CLI resolved (${target})`,
  );
  assert.ok(
    !response.body.includes(`<code class="project-path">${REPO_ROOT}</code>`),
    'the served page names the working directory instead of the target',
  );
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

test('--help, -h and --version answer on stdout and exit 0', async () => {
  // Story 1.1 asserted the opposite here, pinning the deferral recorded in
  // deferred-work.md: all three exited 2 as unknown arguments. Story 1.4 lands
  // them, so the assertion inverts — which is the deferral test doing its job
  // rather than a regression.
  for (const flag of ['--help', '-h']) {
    const result = await runCli([flag]);
    assert.equal(result.code, 0, `${flag} should exit 0`);
    assert.equal(result.stderr, '', `${flag} must not write to stderr`);
    assert.match(result.stdout, /^Usage: bmad-dash \[path\] \[options\]/);
  }

  const version = await runCli(['--version']);
  assert.equal(version.code, 0);
  assert.equal(version.stderr, '');
  assert.match(version.stdout, /^\d+\.\d+\.\d+\n$/, 'a bare semantic version and nothing else');
});

test('--help and --version bind no socket and launch nothing', async () => {
  // The matrix row says "nothing bound, nothing launched", and both would be
  // invisible if not asserted: a bound socket in a process that exits
  // immediately leaves no trace, and a launcher is not observable from outside.
  for (const flag of ['--help', '--version']) {
    let started = 0;
    let launched = 0;
    const code = await run([flag], {
      start: () => {
        started += 1;
        throw new Error('a server must not be started for ' + flag);
      },
      launch: () => {
        launched += 1;
        return Promise.resolve({ opened: true, command: 'stub' });
      },
      stdout: () => {},
      stderr: () => {},
      onSignal: () => {},
    });
    assert.equal(code, 0, `${flag} should exit 0`);
    assert.equal(started, 0, `${flag} started a server`);
    assert.equal(launched, 0, `${flag} launched a browser`);
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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });

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
  const server = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
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
    launch: () => Promise.resolve({ opened: true, command: 'stub' }),
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
    launch: () => Promise.resolve({ opened: true, command: 'stub' }),
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
  const pipeline = `${quote(process.execPath)} ${quote(CLI)} --no-open | ${quote(process.execPath)} -e ""`;

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

test('a server given no usable project root refuses to bind at all', async () => {
  // Before the socket, not at request time. A root that cannot be rendered
  // must stop the command; throwing inside a request handler would surface as
  // an uncaught exception and take the process down while the user watches a
  // browser tab hang.
  // The casts are deliberate. Since Story 1.5 the option is a `CanonicalPath`,
  // so a TypeScript caller cannot make this mistake — that is the stronger
  // guard and it is the point of the brand. The runtime check remains for
  // callers the type system does not reach: a JavaScript consumer, or a cast
  // exactly like the one below. Asserting through the cast is what keeps the
  // second guard honest rather than assumed-unreachable.
  type Unchecked = Parameters<typeof startServer>[0]['projectRoot'];
  for (const bad of ['', '   ']) {
    await assert.rejects(
      () => startServer({ projectRoot: bad as unknown as Unchecked, body: readableBody, inventory: emptyInventory }),
      /needs the resolved project root/,
    );
  }
  for (const bad of ['.', 'relative/path', '../sibling']) {
    await assert.rejects(
      () => startServer({ projectRoot: bad as unknown as Unchecked, body: readableBody, inventory: emptyInventory }),
      /must be absolute/,
    );
  }
});

test('the handle reports the root it was given, so a caller can check it', async (t) => {
  const handle = await startServer({ projectRoot: PROJECT_ROOT, body: readableBody, inventory: emptyInventory });
  t.after(() => handle.close());
  assert.equal(handle.projectRoot, PROJECT_ROOT);
});

test('a requested port is the port actually bound, end to end', async (t) => {
  // Through a real spawned process, against the socket rather than against our
  // own variable. `--port` was the CLI's first consumer of an option that had
  // been implemented and test-only since Story 1.1.
  // Borrowed from the OS rather than hardcoded: a fixed number fails on any
  // machine already using it, and `startServer`'s own fallback would then bind
  // elsewhere and make an environment collision look like a `--port` defect.
  const wanted = await new Promise<number>((settle, fail) => {
    const probe = createServer();
    probe.on('error', fail);
    probe.listen(0, LOOPBACK_ADDRESS, () => {
      const bound = (probe.address() as AddressInfo).port;
      probe.close(() => settle(bound));
    });
  });
  const cli = await startCli(['--port', String(wanted)], REPO_ROOT);
  t.after(() => cli.stop());

  assert.equal(cli.port, wanted, `asked for ${String(wanted)}, bound ${String(cli.port)}`);
  const response = await get({ port: wanted });
  assert.equal(response.status, 200, 'the requested port serves the page');
});


// ---------------------------------------------------------------------------
// Story 2.1a: an artifact at its own URL
// ---------------------------------------------------------------------------

/**
 * One request written straight onto the socket, byte for byte.
 *
 * Node's HTTP client refuses a request target containing an unescaped `<`,
 * space or quote (`ERR_UNESCAPED_CHARACTERS`) — which is exactly the target a
 * hostile filename produces if a page links it without encoding, and therefore
 * exactly the target this server must answer sensibly. A raw socket is the only
 * way to ask.
 */
function getRawTarget(port: number, target: string): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const socket = connect({ host: LOOPBACK_ADDRESS, port });
    let raw = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      raw += chunk;
    });
    // **A timeout that destroys, added in review.** This resolved only on
    // `close`, so a server that accepted the connection and answered nothing —
    // which is the hung-request defect two tests in this file exist to catch —
    // would have hung the whole suite until the runner's own timeout rather
    // than failing with a diagnostic. Destroying is what makes `close` fire, so
    // the rejection below is reached rather than raced.
    socket.setTimeout(RAW_REQUEST_TIMEOUT_MS, () => {
      socket.destroy(new Error(`no response to \`GET ${target}\` within ${String(RAW_REQUEST_TIMEOUT_MS)}ms`));
    });
    socket.on('error', (error: Error) => {
      socket.destroy();
      reject(error);
    });
    socket.on('close', () => {
      const [head = '', ...rest] = raw.split('\r\n\r\n');
      const [statusLine = '', ...headerLines] = head.split('\r\n');
      const headers: Record<string, string | undefined> = {};
      for (const line of headerLines) {
        const at = line.indexOf(':');
        if (at > 0) headers[line.slice(0, at).toLowerCase()] = line.slice(at + 1).trim();
      }
      resolve({
        status: Number(/^HTTP\/1\.\d (\d{3})/.exec(statusLine)?.[1] ?? 0),
        body: rest.join('\r\n\r\n'),
        headers,
      });
    });
    socket.on('connect', () => {
      socket.write(
        `GET ${target} HTTP/1.1\r\nHost: ${LOOPBACK_ADDRESS}:${String(port)}\r\nConnection: close\r\n\r\n`,
      );
    });
  });
}

/**
 * A server serving one fixed view, and a count of how often each supplier was
 * asked.
 *
 * `reads` is Story 2.1b's addition and it records the *paths*, not a count:
 * "exactly one file is read per artifact page, and it is the one asked for" is
 * a claim about which path reached the reader, and a bare tally could not tell
 * one read of the right file from one read of the wrong one.
 */
async function servingFixture(
  t: { after: (fn: () => unknown) => void },
  view: InventoryView = FULL_INVENTORY_VIEW,
  body: (path: string) => ArtifactBody = readableBody,
): Promise<{
  readonly port: number;
  readonly scans: () => number;
  readonly reads: () => readonly string[];
}> {
  let scans = 0;
  const reads: string[] = [];
  const server = await startServer({
    projectRoot: PROJECT_ROOT,
    body: (path) => {
      reads.push(path);
      return body(path);
    },
    inventory: () => {
      scans += 1;
      return view;
    },
  });
  t.after(() => server.close());
  return { port: server.port, scans: () => scans, reads: () => reads };
}

test('an artifact URL naming a row serves the shell, with the snapshot identity', async (t) => {
  const { port } = await servingFixture(t);

  const response = await get({ port, path: artifactUrl(CERTAIN_ROW.path) });
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-store');
  // AD-17: the response records which scan it was built from, exactly as `/`
  // does — one scan serving many representations, which is why this is a
  // snapshot header and not an `ETag`.
  assert.equal(response.headers[SNAPSHOT_ID_HEADER], FULL_INVENTORY_VIEW.snapshotId);
  assert.ok(response.body.includes(`<h1>${ARTIFACT_SURFACE_TITLE}</h1>`));
  assert.ok(response.body.includes(CERTAIN_ROW.path), 'the page names the artifact opened');

  // And `/` still carries the same identity for the same scan.
  const dashboard = await get({ port, path: '/' });
  assert.equal(dashboard.headers[SNAPSHOT_ID_HEADER], FULL_INVENTORY_VIEW.snapshotId);
});

test('HEAD on an artifact URL answers with the headers and no body', async (t) => {
  const { port } = await servingFixture(t);
  const response = await get({ port, path: artifactUrl(CERTAIN_ROW.path), method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(response.headers[SNAPSHOT_ID_HEADER], FULL_INVENTORY_VIEW.snapshotId);
  assert.equal(response.body, '');
});

test('an artifact URL naming no row is the same 404 as any unknown path', async (t) => {
  const { port } = await servingFixture(t);
  for (const path of ['/artifact/nope.md', '/artifact/docs/nope', '/artifact/_bmad-output']) {
    const response = await get({ port, path });
    assert.equal(response.status, 404, path);
    assert.equal(response.body, 'Not found.\n', 'the existing plain-text body, not a new one');
    assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
    // No identity: the response carries no project content, so naming a
    // snapshot on it would be a claim about content it does not have.
    assert.equal(response.headers[SNAPSHOT_ID_HEADER], undefined, path);
  }
  // And a shape the grammar does not have is the same answer, not a guess at an
  // adjacent one.
  assert.equal((await get({ port, path: '/artifact' })).status, 404);
  assert.equal((await get({ port, path: '/artifact/' })).status, 404);
  assert.equal((await get({ port, path: '/artifacts/x' })).status, 404);
  assert.equal((await get({ port, path: `${artifactUrl(CERTAIN_ROW.path)}/section` })).status, 404);
});

test('a path needing encoding is served at the URL the page links', async (t) => {
  // The fixture carries the case this repository does not have: a filename made
  // of markup characters, which needs percent-encoding to be addressable at all.
  const { port } = await servingFixture(t);
  const response = await get({ port, path: artifactUrl(HOSTILE_PATH) });
  assert.equal(response.status, 200, artifactUrl(HOSTILE_PATH));
  assert.ok(response.body.includes('&lt;img src=x onerror=alert(1)&gt;.md'), 'and it is the right row');
  assert.ok(!response.body.includes('<img'), 'no element is created by the filename');
  // **The unencoded spelling does not reach this artifact**, which is the
  // concrete reason the link has to be encoded rather than merely escaped as
  // HTML. Node's own HTTP client refuses to send it
  // (`ERR_UNESCAPED_CHARACTERS`), so it goes out on a raw socket.
  //
  // What this pins is only that the row is not served that way. The *status* is
  // deliberately not asserted: the space inside the filename ends the request
  // target, so what comes back is llhttp's opinion of a malformed request line
  // rather than a decision this server took, and pinning `400` would have been
  // a test of the parser's leniency. The assertion below is the property that
  // belongs to this code.
  const unencoded = await getRawTarget(port, `/artifact/${HOSTILE_PATH}`);
  assert.notEqual(unencoded.status, 200, 'a target the encoder never emits is not this artifact');
  assert.ok(!unencoded.body.includes('&lt;img'), 'and no part of the row is served for it');
  // The encoded target goes over the identical raw socket and *is* served, so
  // the difference above is the encoding and not the transport.
  assert.equal((await getRawTarget(port, artifactUrl(HOSTILE_PATH))).status, 200);
});

test('a row whose path spells the section marker is served at its escaped URL', async (t) => {
  // The grammar's most delicate rule, end to end. Added in review round 1,
  // where it was exercised only by `test/domain/url.test.ts`: no request had
  // ever carried a segment spelling `section`, so the escape and the
  // locate-the-marker-before-decoding order never ran through the adapter.
  const { port } = await servingFixture(t);
  const escaped = artifactUrl(SECTION_NAMED_ROW.path);
  assert.ok(escaped.includes('/%73ection/'), escaped);

  const response = await get({ port, path: escaped });
  assert.equal(response.status, 200);
  assert.ok(response.body.includes(SECTION_NAMED_ROW.path), 'and it is this row');

  // The bare spelling is a *section* URL for a different artifact, which is
  // exactly the collision the escape exists to prevent — and that artifact
  // (`…/prds`) is not a row here, so it 404s rather than serving this one.
  const bare = `/artifact/${SECTION_NAMED_ROW.path}`;
  assert.equal((await get({ port, path: bare })).status, 404, bare);

  // And a section *of* this row still parses, with the marker read once.
  const section = await get({ port, path: sectionUrl(SECTION_NAMED_ROW.path, 'goals') });
  assert.equal(section.status, 200);
  assert.equal(section.body, response.body);
});

test('a row path the grammar cannot address is a 500 on its own page, and costs the Dashboard nothing', async (t) => {
  // The two halves of review round 1's finding about `artifactUrl` throwing,
  // asserted as the different answers they deliberately are.
  //
  // On the Dashboard one malformed path costs one link: the row renders
  // unlinked and every other row still links, because the whole surface must
  // not go down for one bad neighbour (AD-7).
  //
  // On the artifact view it is a 500, because that surface *is* the one row —
  // there are no neighbours to protect, and its own refresh control cannot be
  // addressed, so a page that renders would carry a control that lies. Asserted
  // rather than left implicit: it is a decision, and an unasserted 500 is
  // indistinguishable from an oversight.
  const bad = 'docs//prd.md';
  const errors: Error[] = [];
  const server = await startServer({
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    inventory: () => ({
      ...FULL_INVENTORY_VIEW,
      groups: [{ family: 'prd', rows: [{ ...CERTAIN_ROW, path: bad }, CERTAIN_ROW], notes: [] }],
    }),
    onError: (error) => errors.push(error),
  });
  t.after(() => server.close());

  const dashboard = await get({ port: server.port, path: '/' });
  assert.equal(dashboard.status, 200, 'one bad path must not take the surface down');
  assert.ok(dashboard.body.includes(bad), 'the row is still listed');
  assert.ok(dashboard.body.includes(`href="${artifactUrl(CERTAIN_ROW.path)}"`), 'and its neighbour still links');
  assert.equal((dashboard.body.match(/class="artifact-link"/g) ?? []).length, 1, 'exactly one link');

  // The malformed path is not addressable by the grammar, so no URL reaches it
  // — an empty segment is refused outright.
  assert.equal((await get({ port: server.port, path: `/artifact/${bad}` })).status, 404);
  assert.equal(errors.length, 0, 'and nothing has failed yet');

  // A path that *is* reachable and still unaddressable: a row whose path the
  // grammar refuses to build a URL for, keyed by a URL that does parse.
  const dotted = await startServer({
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    inventory: () => ({
      ...FULL_INVENTORY_VIEW,
      groups: [{ family: 'prd', rows: [{ ...CERTAIN_ROW, path: '/absolute/prd.md' }], notes: [] }],
    }),
    onError: (error) => errors.push(error),
  });
  t.after(() => dotted.close());
  assert.equal((await get({ port: dotted.port, path: '/' })).status, 200, 'still a page');
  assert.equal((await get({ port: dotted.port, path: '/artifact/absolute/prd.md' })).status, 404);
});

test('dot segments and their encodings normalize before the lookup, and escape nothing', async (t) => {
  const { port } = await servingFixture(t);
  const target = artifactUrl(CERTAIN_ROW.path);

  // A URL that climbs and comes back names the same row.
  assert.equal((await get({ port, path: `/artifact/somewhere/..${target.slice(9)}` })).status, 200);
  assert.equal((await get({ port, path: target.replace('/prds/', '/prds/./') })).status, 200);
  assert.equal((await get({ port, path: target.replace('/prds/', '/prds/x/../') })).status, 200);

  // A URL that climbs *out* names nothing, in every encoding. Each of these
  // names a real file on the machine running this suite, and none of them is a
  // row. Two different mechanisms produce the same 404, and both are wanted: a
  // traversal written as whole segments normalizes to a key that is not a row,
  // and one squeezed into a single percent-encoded segment is refused by the
  // grammar before a key exists at all.
  for (const path of [
    '/artifact/../../etc/passwd',
    '/artifact/%2e%2e/%2e%2e/etc/passwd',
    '/artifact/..%2f..%2fetc%2fpasswd',
    '/artifact/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/artifact/%2fetc%2fpasswd',
    '/artifact/....//....//etc/passwd',
  ]) {
    const response = await get({ port, path });
    assert.equal(response.status, 404, path);
    assert.equal(response.headers[SNAPSHOT_ID_HEADER], undefined, path);
  }
});

test('a directory row has a URL like any other row', async (t) => {
  // `WalkEntry.kind` includes `directory`, so a run folder and a sharded
  // document are first-class rows — and a resolver that tested for a *file*
  // would have quietly excluded them.
  const { port } = await servingFixture(t);
  const response = await get({ port, path: artifactUrl(DELIBERATE_RUN_ROW.path) });
  assert.equal(response.status, 200);
  assert.ok(response.body.includes(DELIBERATE_RUN_ROW.path));
});

test('an unidentified row has no link on the Dashboard and still resolves at its URL', async (t) => {
  // The two halves of the matrix row, which are deliberately different answers:
  // `EXPERIENCE.md:183` keeps the *row* from being a link; the URL still works,
  // because a 404 for a row the reader can see would be the tool hiding it.
  const { port } = await servingFixture(t);
  const dashboard = await get({ port, path: '/' });
  assert.ok(dashboard.body.includes(UNIDENTIFIED_ROW.path), 'the row is on the page');
  assert.ok(!dashboard.body.includes(`href="${artifactUrl(UNIDENTIFIED_ROW.path)}"`));

  const response = await get({ port, path: artifactUrl(UNIDENTIFIED_ROW.path) });
  assert.equal(response.status, 200);
  assert.ok(response.body.includes('Not identified. Tried:'), 'and the page says so honestly');
});

test('the section shape parses and resolves to the artifact', async (t) => {
  // AD-18 fixes the grammar for artifacts *and* sections, and the spine lists it
  // as not deferred — so the shape resolves today. Nothing selects a section:
  // deriving an id from a document is Story 2.9's, and the page that claimed to
  // have selected one it cannot name would be worse than one that opens the
  // artifact.
  const { port } = await servingFixture(t);
  const whole = await get({ port, path: artifactUrl(CERTAIN_ROW.path) });
  for (const id of ['goals', 'a section', '1']) {
    const response = await get({ port, path: sectionUrl(CERTAIN_ROW.path, id) });
    assert.equal(response.status, 200, id);
    assert.equal(response.body, whole.body, 'the artifact, with nothing claimed about the section');
  }
  // A section on an artifact that is not a row fails the artifact lookup first.
  assert.equal((await get({ port, path: sectionUrl('nope.md', 'goals') })).status, 404);
});

test('a trailing slash is the same resource as none', async (t) => {
  const { port } = await servingFixture(t);
  const bare = await get({ port, path: artifactUrl(CERTAIN_ROW.path) });
  const slashed = await get({ port, path: `${artifactUrl(CERTAIN_ROW.path)}/` });
  assert.equal(slashed.status, 200);
  assert.equal(slashed.body, bare.body);
  assert.equal(slashed.headers[SNAPSHOT_ID_HEADER], bare.headers[SNAPSHOT_ID_HEADER]);
  // And with a query on top, since the adapter strips that before the grammar.
  assert.equal((await get({ port, path: `${artifactUrl(CERTAIN_ROW.path)}/?x=1` })).status, 200);
});

test('the root still serves the Dashboard, unchanged', async (t) => {
  const { port } = await servingFixture(t);
  const response = await get({ port, path: '/' });
  assert.equal(response.status, 200);
  assert.ok(response.body.includes('<h1>Dashboard</h1>'), 'the landing surface is untouched');
  assert.ok(!response.body.includes(`<h1>${ARTIFACT_SURFACE_TITLE}</h1>`));
});

test('Host and method are refused before any artifact lookup happens', async (t) => {
  // Both refusals happen before a path is looked at, so no target state can
  // reach them — which is why the matrix needs one row for every URL kind
  // rather than one per kind per state. Asserted by counting scans: a refusal
  // that had reached routing would have built a snapshot to answer from.
  const fixture = await servingFixture(t);
  const target = artifactUrl(CERTAIN_ROW.path);

  const forbidden = await get({ port: fixture.port, path: target, host: 'evil.example' });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers[SNAPSHOT_ID_HEADER], undefined);

  const refused = await get({ port: fixture.port, path: target, method: 'POST' });
  assert.equal(refused.status, 405);
  assert.equal(refused.headers['allow'], 'GET, HEAD');
  assert.equal(refused.headers[SNAPSHOT_ID_HEADER], undefined);

  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    assert.equal((await get({ port: fixture.port, path: target, method })).status, 405, method);
  }
  assert.equal(fixture.scans(), 0, 'a refused request must not build a snapshot');

  // And the same request, allowed, does.
  assert.equal((await get({ port: fixture.port, path: target })).status, 200);
  assert.equal(fixture.scans(), 1);
});

test('a snapshot that fails at request time is a 500 on the artifact route too', async (t) => {
  const errors: Error[] = [];
  const server = await startServer({
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    inventory: () => {
      throw new Error('the project went away');
    },
    onError: (error) => errors.push(error),
  });
  t.after(() => server.close());

  const response = await get({ port: server.port, path: artifactUrl(CERTAIN_ROW.path) });
  assert.equal(response.status, 500);
  assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(response.headers[SNAPSHOT_ID_HEADER], undefined);
  assert.equal(errors.length, 1, 'and the failure is reported rather than swallowed');
});

test('resolution is the row set and not the filesystem, in both directions', async (t) => {
  // **The mechanism check, as a test.** Point the server at a real directory
  // holding a real file, and hand it a view that does not list that file but
  // does list one that is not there. A resolver that consulted the filesystem
  // gets both of these backwards; the set-membership one gets both right.
  //
  // This is what makes traversal structurally impossible rather than defended
  // against: there is no code path from a request to a read, so no spelling of
  // any URL can reach a byte on disk.
  const root = await makeProjectDir(t);
  await mkdir(join(root, 'real'), { recursive: true });
  await writeFile(join(root, 'real', 'onDisk.md'), '# on disk\n', 'utf8');

  const ghost = 'imagined/notOnDisk.md';
  const view: InventoryView = {
    ...FULL_INVENTORY_VIEW,
    groups: [
      {
        family: 'prd',
        rows: [{ ...CERTAIN_ROW, path: ghost }],
        notes: [],
      },
    ],
  };
  const server = await startServer({
    projectRoot: canonical(root),
    body: readableBody,
    inventory: () => view,
  });
  t.after(() => server.close());

  // On disk, not a row: 404. A filesystem resolver would have served it.
  assert.equal((await get({ port: server.port, path: '/artifact/real/onDisk.md' })).status, 404);
  assert.equal((await get({ port: server.port, path: '/artifact/real' })).status, 404);
  // A row, not on disk: 200. A filesystem resolver would have 404'd it.
  const served = await get({ port: server.port, path: artifactUrl(ghost) });
  assert.equal(served.status, 200);
  assert.ok(served.body.includes(ghost));
  // And nothing outside the root is reachable however it is spelled, including
  // through a path that exists and is absolute.
  for (const path of [
    '/artifact/../../etc/passwd',
    `/artifact${root}/real/onDisk.md`,
    `/artifact/${encodeURIComponent(join(root, 'real', 'onDisk.md'))}`,
  ]) {
    assert.equal((await get({ port: server.port, path })).status, 404, path);
  }
});

// ---------------------------------------------------------------------------
// Story 2.1b: content end to end, and the hardening headers
// ---------------------------------------------------------------------------

test("an artifact URL serves the artifact's own content, rendered on the server", async (t) => {
  const fixture = await servingFixture(t, FULL_INVENTORY_VIEW, () => ({
    ok: true,
    text: '# The title\n\nA paragraph.\n',
  }));

  const response = await get({ port: fixture.port, path: artifactUrl(CERTAIN_ROW.path) });
  assert.equal(response.status, 200);
  assert.ok(response.body.includes('<article class="artifact-content">'));
  assert.ok(response.body.includes('<h2>The title</h2>'), 'rendered, not echoed');
  assert.ok(response.body.includes('<p>A paragraph.</p>'));
  // **Server-rendered, and that is the claim this line makes now.** It read
  // `doesNotMatch(response.body, /<script\b/i)` until Story 2.3b, on the
  // reasoning that nothing on the page needs to run to produce it. That is
  // still true of the *content* — the heading and the paragraph above came off
  // the server — and it is no longer true of the page, which carries FR-24's
  // one clipboard listener. So the assertion narrows to what it always meant:
  // the content region is server-rendered, and the page's one script is the
  // shell's, counted at exactly one.
  const article = /<article class="artifact-content">([\s\S]*?)<\/article>/.exec(response.body);
  assert.ok(article !== null, 'the served page has no content region');
  assert.doesNotMatch(article[1] ?? '', /<script\b/i, 'no script produced this content');
  assert.equal((response.body.match(/<script\b/gi) ?? []).length, 1, 'and the shell carries one');
  // `web/` is still the one empty scanned root: the script is a string constant
  // under `src/`, so nothing is served from disk and no client build exists.
  // `test/architecture.test.ts` holds both halves of that.

  // **Exactly one file was read, and it is the one asked for.** The Dashboard
  // reads none, a 404 reads none, and the artifact page reads its own row's
  // path — never a path a request spelled.
  assert.deepEqual(fixture.reads(), [CERTAIN_ROW.path]);
  await get({ port: fixture.port, path: '/' });
  await get({ port: fixture.port, path: '/artifact/not-a-row.md' });
  assert.deepEqual(fixture.reads(), [CERTAIN_ROW.path], 'neither / nor a 404 reads anything');
});

test('no body reaches the snapshot identity, so text is not in a per-request digest', async (t) => {
  // `snapshotIdOf` digests the whole `InventoryView`, which is exactly why the
  // body is an argument to `renderArtifact` rather than a field on
  // `ArtifactRow`. Asserted through the header, over two servers whose views
  // are the same object and whose bodies differ: the identity names the *scan*,
  // and a body that had reached it would make these two differ.
  const first = await servingFixture(t, FULL_INVENTORY_VIEW, () => ({ ok: true, text: '# One\n' }));
  const second = await servingFixture(t, FULL_INVENTORY_VIEW, () => ({
    ok: true,
    text: '# Something entirely different\n',
  }));
  const target = artifactUrl(CERTAIN_ROW.path);
  const a = await get({ port: first.port, path: target });
  const b = await get({ port: second.port, path: target });

  // The bodies really did differ, so this cannot pass by both serving the same
  // page — which would make the identity assertion below trivial.
  assert.notEqual(a.body, b.body);
  assert.equal(a.headers[SNAPSHOT_ID_HEADER], FULL_INVENTORY_VIEW.snapshotId);
  assert.equal(b.headers[SNAPSHOT_ID_HEADER], a.headers[SNAPSHOT_ID_HEADER]);
});

test('a read failure on an artifact is still a 200 page, with the failure in it', async (t) => {
  // AD-7 end to end: the page came, and it says what did not. A 500 here would
  // be the tool refusing to show a document because one part of it is broken.
  const fixture = await servingFixture(t, FULL_INVENTORY_VIEW, () => ({
    ok: false,
    state: 'unreadable',
    stage: 'decode',
    reason: 'not valid UTF-8 text',
  }));
  const response = await get({ port: fixture.port, path: artifactUrl(UNREADABLE_ROW.path) });
  assert.equal(response.status, 200);
  assert.equal(response.headers[SNAPSHOT_ID_HEADER], FULL_INVENTORY_VIEW.snapshotId);
  assert.ok(response.body.includes('class="artifact-failure"'));
  assert.ok(response.body.includes('<code class="artifact-stage">decode</code>'));
});

test('a body supplier that throws is a 500 the reader can report, not a hung tab', async (t) => {
  // The supplier is built to answer rather than throw, so this is a defect
  // path — and it is the same answer a throwing `inventory` gets, because to a
  // reader they are one failure: the page did not come.
  const errors: Error[] = [];
  const server = await startServer({
    projectRoot: PROJECT_ROOT,
    body: () => {
      throw new Error('the reader gave up');
    },
    inventory: () => FULL_INVENTORY_VIEW,
    onError: (error) => errors.push(error),
  });
  t.after(() => server.close());

  const response = await get({ port: server.port, path: artifactUrl(CERTAIN_ROW.path) });
  assert.equal(response.status, 500);
  assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(errors.length, 1, 'and it is reported rather than swallowed');
  // The Dashboard is unaffected: it never asks for a body.
  assert.equal((await get({ port: server.port, path: '/' })).status, 200);
});

/**
 * The script hash the policy must carry, recomputed here rather than imported.
 *
 * **Spelled out from the script's own bytes, which is what makes the header
 * checkable at all.** Importing `SCRIPT_SOURCE` would assert that the constant
 * equals itself. This recomputes the digest from `COPY_SCRIPT` — the render
 * layer's script text — so the expectation below is what the *policy ought to
 * say about the script the page carries*, and the server's own derivation is
 * the thing under test. The stronger form of the same check is further down,
 * where the hash is recomputed from the **served response body**.
 */
const EXPECTED_SCRIPT_SOURCE = `'sha256-${createHash('sha256')
  .update(COPY_SCRIPT, 'utf8')
  .digest('base64')}'`;

/**
 * The three headers, and their exact values, as one place to change them.
 *
 * **`script-src` arrived with Story 2.3b, and the row below used to assert its
 * absence.** Until then the policy had no `script-src` at all and the
 * `default-src 'none'` fallback denied script outright, which was correct while
 * the tool served none. FR-24 is copy-to-clipboard and there is no HTML-only
 * way to write to the clipboard, so the artifact view now carries exactly one
 * inline script and the policy admits exactly that one, by hash. The old
 * assertion is not weakened — a hash permits one script and nothing else,
 * which is a *narrower* grant than `'unsafe-inline'` and the reason that was
 * refused — but it is no longer true, and this is where it is said.
 *
 * The hash is interpolated rather than written out as base64, because the
 * digest of a script is not a fact a human can check by reading it; what a
 * human can check is that it is a digest of *this* script, which is what
 * `EXPECTED_SCRIPT_SOURCE` above states and the served-body test below proves.
 */
const EXPECTED_HARDENING: readonly (readonly [string, string])[] = [
  [
    'content-security-policy',
    `default-src 'none'; style-src 'unsafe-inline'; script-src ${EXPECTED_SCRIPT_SOURCE}; ` +
      "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  ],
  ['x-content-type-options', 'nosniff'],
  ['referrer-policy', 'no-referrer'],
];

test('the hardening headers are exactly what the module exports, spelled out here once', () => {
  // Pinned as literals against the constant, on `SNAPSHOT_ID_HEADER`'s own
  // terms: these are an external contract a browser acts on, so a value that
  // merely came from the source it is being checked against would assert
  // nothing. The policy is what makes rendering a project's own HTML
  // defensible, so *which* directives it carries is the decision, not a detail.
  assert.deepEqual(Object.entries(HARDENING_HEADERS).sort(), [...EXPECTED_HARDENING].sort());
  // And the two clauses that do not fall back to `default-src` are present, so
  // a future edit cannot drop them believing `'none'` already covers them.
  for (const directive of ['base-uri', 'form-action', 'frame-ancestors']) {
    assert.ok(
      (HARDENING_HEADERS['content-security-policy'] ?? '').includes(`${directive} 'none'`),
      `${directive} does not inherit default-src and must be stated`,
    );
  }
  // **This line read `doesNotMatch(policy, /script-src/)` until Story 2.3b**,
  // on the reasoning that script was denied by the `default-src` fallback and
  // "never allowed back in". It is allowed back in, once, by hash — see the
  // constant above for why the requirement leaves no other option. What
  // replaces the absence is the two things that make the exception narrow, and
  // both are stronger claims than the one they replace:
  const policy = HARDENING_HEADERS['content-security-policy'] ?? '';
  //   1. **The one script source is a hash, not a keyword.** `'unsafe-inline'`
  //      would execute a `<script>` out of a project's own markdown, which
  //      `RENDER_EMBEDDED_HTML` makes possible; a hash cannot. `'self'` would
  //      permit any same-origin script. `'strict-dynamic'` would let the
  //      permitted script load more. A nonce would have to be per-response and
  //      is not derivable from a constant.
  assert.match(policy, /script-src 'sha256-[A-Za-z0-9+/]+={0,2}'/, 'one hash source, spelled out');
  // Read out of the `script-src` directive alone, not out of the whole policy:
  // `style-src` legitimately carries `'unsafe-inline'` one directive earlier,
  // and a whole-string search would either miss the case that matters or fire
  // on the one that does not.
  const scriptSrc = policy.slice(policy.indexOf('script-src')).split(';')[0] ?? '';
  for (const forbidden of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'strict-dynamic'", "'self'", 'nonce-']) {
    assert.ok(!scriptSrc.includes(forbidden), `script-src must not carry ${forbidden}`);
  }
  //   2. **It is a hash of *our* script**, derived from the same constant the
  //      page is built from rather than written down beside it. The served-body
  //      form of this check is below; this one catches a header assembled from
  //      a stale digest.
  assert.ok(policy.includes(`script-src ${EXPECTED_SCRIPT_SOURCE}`), policy);
  // `style-src` keeps `'unsafe-inline'` and is untouched: the stylesheet is
  // inlined by `src/render/page.ts` and a hash over it would move on every
  // token edit for no gain, since a style cannot execute.
  assert.ok(policy.includes("style-src 'unsafe-inline'"));
});

test('every response carries the hardening headers — the 200 and every refusal', async (t) => {
  const fixture = await servingFixture(t);
  const target = artifactUrl(CERTAIN_ROW.path);

  /** Every response shape this server can produce, with how it is provoked. */
  const responses: readonly (readonly [string, Response])[] = [
    ['the Dashboard', await get({ port: fixture.port, path: '/' })],
    ['an artifact page', await get({ port: fixture.port, path: target })],
    ['a HEAD', await get({ port: fixture.port, path: target, method: 'HEAD' })],
    ['a 404', await get({ port: fixture.port, path: '/artifact/nope.md' })],
    ['an unknown path', await get({ port: fixture.port, path: '/nowhere' })],
    ['a 403', await get({ port: fixture.port, path: target, host: 'evil.example' })],
    ['a 405', await get({ port: fixture.port, path: target, method: 'POST' })],
  ];

  // Not vacuous: the four refusals are actually refusals, so this cannot pass
  // by every request having been answered 200.
  assert.deepEqual(
    responses.map(([, response]) => response.status),
    [200, 200, 200, 404, 404, 403, 405],
  );

  for (const [what, response] of responses) {
    for (const [header, value] of EXPECTED_HARDENING) {
      assert.equal(response.headers[header], value, `${what} is missing ${header}`);
    }
  }
});

test('a 500 carries the hardening headers too, which is where they matter most', async (t) => {
  // A 500 is the response a reader reaches for when something is already wrong,
  // and it is the one most likely to be reached by a page that half-rendered.
  const errors: Error[] = [];
  const server = await startServer({
    projectRoot: PROJECT_ROOT,
    body: readableBody,
    inventory: () => {
      throw new Error('the project went away');
    },
    onError: (error) => errors.push(error),
  });
  t.after(() => server.close());

  for (const path of ['/', artifactUrl(CERTAIN_ROW.path)]) {
    const response = await get({ port: server.port, path });
    assert.equal(response.status, 500, path);
    for (const [header, value] of EXPECTED_HARDENING) {
      assert.equal(response.headers[header], value, `the 500 for ${path} is missing ${header}`);
    }
  }
  assert.equal(errors.length, 2);
});

test('the policy permits the one thing the page needs and nothing else', async (t) => {
  // The page's single need is its inlined `<style>`; everything else the
  // document could ask for is denied by the `default-src` fallback. Asserted
  // against the *served page* rather than against the constant, because "the
  // policy matches what the page needs" is a claim about the pair.
  const fixture = await servingFixture(t);
  const response = await get({ port: fixture.port, path: artifactUrl(CERTAIN_ROW.path) });
  assert.ok(response.body.includes('<style>'), 'the page does inline a stylesheet');
  assert.ok(!response.body.includes('<link'), 'and fetches no stylesheet');
  // **This line read `and serves no script` until Story 2.3b.** The page serves
  // one, because FR-24's clipboard half has no HTML-only form — so the claim
  // this test makes is unchanged in shape and stronger in content: the policy
  // permits *the things the page needs and nothing else*, and the page's needs
  // are now two rather than one. Both are inline and neither is fetched.
  assert.equal(
    (response.body.match(/<script\b/gi) ?? []).length,
    1,
    'exactly one script, so the one hash covers the whole of it',
  );
  assert.doesNotMatch(response.body, /<script[^>]/i, 'inline, with no src and no attribute');
  const policy = response.headers['content-security-policy'] ?? '';
  assert.ok(policy.includes("style-src 'unsafe-inline'"), 'inline style is the style allowance');
  assert.ok(policy.includes(`script-src ${EXPECTED_SCRIPT_SOURCE}`), 'and one hash is the script one');
  assert.ok(policy.startsWith("default-src 'none'"), 'and everything else falls back to none');
  // Nothing else was let in on the way. Everything the document could ask for
  // besides style and that one script — an image, a font, a frame, a fetch — is
  // still denied by the fallback, which is the half of this test that a new
  // directive would quietly cost.
  assert.deepEqual(
    policy.split('; ').map((directive) => directive.split(' ')[0]),
    ['default-src', 'style-src', 'script-src', 'base-uri', 'form-action', 'frame-ancestors'],
    'a seventh directive is a decision, not a detail',
  );
});

test('the CSP hash is the hash of the script in that same response body', async (t) => {
  // **The check the story exists to make, and the shape matters more than the
  // result.** A test that compared `HARDENING_HEADERS` to `SCRIPT_SOURCE` would
  // be a constant agreeing with itself: both come from `COPY_SCRIPT`, so it
  // would pass over a page that served a *different* script, or none. This one
  // takes the script out of the **served response body**, digests those bytes,
  // and compares the result to the directive in that same response's header. If
  // the page and the header ever describe different scripts, this is what says
  // so — and a browser honouring the policy would refuse the script while every
  // other assertion in this file still passed.
  //
  // Mechanism check, per the spec's Verification section: changing one byte of
  // `COPY_SCRIPT` and reverting the header is expected to fail this row.
  const fixture = await servingFixture(t);
  const response = await get({ port: fixture.port, path: artifactUrl(CERTAIN_ROW.path) });
  assert.equal(response.status, 200);

  const served = /<script>([\s\S]*?)<\/script>/.exec(response.body);
  assert.ok(served !== null, 'the served page carries no script to hash');
  const script = served[1] ?? '';
  assert.ok(script.trim() !== '', 'an empty script would hash to a constant that permits nothing');
  const recomputed = `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;

  const policy = response.headers['content-security-policy'] ?? '';
  const directive = /script-src ('sha256-[^']+')/.exec(policy)?.[1];
  assert.equal(directive, recomputed, 'the header permits a script this response does not carry');
  // And it is the module's own script, not merely *a* script whose hash happens
  // to be in the header — which a page serving `<script></script>` and a header
  // built from the same empty string would also satisfy.
  assert.equal(script, COPY_SCRIPT, 'the served bytes are the render layer’s constant');

  // Every other response carries the same directive, because the constant is
  // shared: the Dashboard, which serves no script at all, and the four
  // refusals, which serve no HTML. A policy assembled per route is one that can
  // be assembled wrongly.
  const others = [
    ['the Dashboard', await get({ port: fixture.port, path: '/' })],
    ['a 404', await get({ port: fixture.port, path: '/artifact/nope.md' })],
    ['a 403', await get({ port: fixture.port, path: '/', host: 'evil.example' })],
    ['a 405', await get({ port: fixture.port, path: '/', method: 'POST' })],
  ] as const;
  assert.deepEqual(
    others.map(([, r]) => r.status),
    [200, 404, 403, 405],
    'not vacuous: the three refusals are refusals',
  );
  for (const [what, other] of others) {
    assert.ok(
      (other.headers['content-security-policy'] ?? '').includes(`script-src ${recomputed}`),
      `${what} carries a different script-src`,
    );
  }
  // The Dashboard carries the directive and no script, which is the point of
  // one shared constant: a hash naming a script a response does not carry
  // permits nothing extra, and `test/render/page.test.ts` holds the other half.
  assert.doesNotMatch(others[0][1].body, /<script\b/i, 'the Dashboard is not a viewer');
});

test('the served artifact response carries the exits row, with an absolute editor href', async (t) => {
  // **The wiring seam Story 2.3a could not see, closed here.** Every render
  // test passes `PROJECT_ROOT` in directly, so all of them prove the shell
  // builds an href from whatever root it is handed and none of them proves the
  // root the *server* passes is absolute — the one place that is decided is
  // `toPlatform(projectRoot)` in this module, reached only through the real
  // composition root. `deferred-work.md` recorded the gap against 2.3a and
  // named this story as the moment to close it, since it touches this file
  // anyway. The shape is copied from `the composition root wires the real
  // confined reader, end to end` above.
  const root = await makeProjectDir(t, 'bmad-dash-exits-');
  const relative = '_bmad-output/planning-artifacts/prds/prd-exits-2026-09-04/prd.md';
  await mkdir(join(root, dirname(relative)), { recursive: true });
  await writeFile(join(root, relative), "---\ntitle: 'Exits'\ntype: 'prd'\n---\n\n# Exits\n");

  let url = '';
  let shutdown: () => void = () => {};
  const code = await run([root], {
    launch: () => Promise.resolve({ opened: false as const, command: 'stub', reason: 'stubbed' }),
    stdout: (text) => {
      url += text;
    },
    stderr: () => {},
    onSignal: (handler) => {
      shutdown = handler;
    },
    exit: () => {},
  });
  t.after(() => shutdown());
  assert.equal(code, 0, `the run did not start: ${JSON.stringify(url)}`);
  const port = Number(URL_PATTERN.exec(url.trim())?.[1]);
  assert.ok(Number.isInteger(port), `no port in ${JSON.stringify(url)}`);

  const response = await get({ port, path: artifactUrl(relative) });
  assert.equal(response.status, 200);
  assert.ok(response.body.includes('<div class="artifact-exits">'), 'no exits row was served');

  // **The href is absolute, and it is absolute under the root this invocation
  // actually resolved** — not under a root a test chose. Built here from the
  // real directory rather than by calling `editorUrl`, so the expectation does
  // not come from the code under test. `makeProjectDir` returns a canonical
  // path, which is why this can be compared literally.
  const expected = `vscode://file/${[...root.split('/'), ...relative.split('/')]
    .filter((segment) => segment !== '')
    .map(encodeURIComponent)
    .join('/')}`;
  assert.ok(response.body.includes(`href="${expected}"`), `no such href in the served page`);
  assert.match(expected, /^vscode:\/\/file\/[^/]/, 'an editor cannot open a relative path');
  // The path text and the copy control travel with it, both carrying the row's
  // **project-relative** path — the exits row states one fact three ways and
  // only the editor needs it absolute.
  assert.ok(response.body.includes(`<code class="artifact-path">${relative}</code>`));
  assert.ok(response.body.includes(`hidden ${COPY_PAYLOAD_ATTRIBUTE}="${relative}"`));
  assert.ok(response.body.includes(`>${COPY_LABEL}</button>`));
  // And the hash on a real invocation's response matches its own body, which is
  // the check above asked of the composition root rather than of a fixture.
  const script = /<script>([\s\S]*?)<\/script>/.exec(response.body)?.[1] ?? '';
  assert.ok(
    (response.headers['content-security-policy'] ?? '').includes(
      `script-src 'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`,
    ),
    'a real invocation serves a script its own policy does not permit',
  );
});

test('the composition root wires the real confined reader, end to end', async (t) => {
  // **The wiring seam, and the only test that can see it.** Every other test in
  // this file hands the server a body supplier of its own, so all of them would
  // pass over a composition root that passed a stub, an empty string, or a
  // supplier pointed at the wrong path. This one runs the real `run` with the
  // real `startServer` and the real `ConfinedReader` over a real file on disk,
  // and asserts the file's own bytes came back through the URL.
  //
  // It is the same class of check as `a real invocation actually reaches a
  // platform launcher`: substituting an inert implementation for a correct one
  // is invisible to the type system.
  const root = await makeProjectDir(t, 'bmad-dash-real-read-');
  const relative = '_bmad-output/planning-artifacts/prds/prd-real-2026-09-04/prd.md';
  await mkdir(join(root, dirname(relative)), { recursive: true });
  await writeFile(
    join(root, relative),
    "---\ntitle: 'A real document'\ntype: 'prd'\n---\n\n# On disk\n\nRead through the reader.\n",
  );

  let url = '';
  let shutdown: () => void = () => {};
  const code = await run([root], {
    launch: () => Promise.resolve({ opened: false as const, command: 'stub', reason: 'stubbed' }),
    stdout: (text) => {
      url += text;
    },
    stderr: () => {},
    onSignal: (handler) => {
      shutdown = handler;
    },
    exit: () => {},
  });
  t.after(() => shutdown());
  assert.equal(code, 0, `the run did not start: ${JSON.stringify(url)}`);

  const port = Number(URL_PATTERN.exec(url.trim())?.[1]);
  assert.ok(Number.isInteger(port), `no port in ${JSON.stringify(url)}`);

  const response = await get({ port, path: artifactUrl(relative) });
  assert.equal(response.status, 200);
  // The file's own words, through the real read and the real parse.
  assert.ok(response.body.includes('<h2>On disk</h2>'), 'the document heading, rendered');
  assert.ok(response.body.includes('Read through the reader.'), 'and its body');
  // The frontmatter is metadata and does not reach the reading surface.
  assert.ok(!response.body.includes('A real document'), 'the frontmatter is not content');
  // And the hardening headers are on a real invocation's response, not only on
  // a server this file constructed.
  for (const [header, value] of EXPECTED_HARDENING) {
    assert.equal(response.headers[header], value, `a real invocation is missing ${header}`);
  }
});

test('a confinement refusal on the body read is a page, not a 500', async (t) => {
  // **The scenario the composition root's docblock names, tested through it.**
  // `src/cli/index.ts` turns `resolveWithin`'s throw into a typed value "here,
  // and only here", and says why: the reader is right to throw, but on this
  // path a throw costs the reader the whole page for a fact the page can state
  // -- and the way it arrives is "a symlink that changed under the tool between
  // the scan and the page load".
  //
  // Nothing else reaches that branch. Every other test in this file supplies
  // its own body function, and the one end-to-end test above reads an ordinary
  // in-root file, so **deleting the catch leaves the whole suite green** -- 995
  // of 995, measured before this test existed. Removing it now turns this
  // artifact's page into a 500.
  //
  // The escaping symlink is the row *and* the refusal at once: the walk lists
  // it, so the snapshot has a row to find, and the read resolves it outside the
  // root, so the reader refuses. That is one artifact failing, in place, on a
  // page whose shell, path and inventory facts all still render.
  // Narrower than `deniableDirectories()` on purpose: that helper also excludes
  // root, and root creates symlinks perfectly well. Only Windows, where an
  // unprivileged process cannot make one at all, has to opt out.
  if (process.platform === 'win32') {
    t.skip('creating a symlink needs privileges this platform does not grant');
    return;
  }
  const root = await makeProjectDir(t, 'bmad-dash-escape-');
  const outside = await makeProjectDir(t, 'bmad-dash-outside-');
  await writeFile(join(outside, 'elsewhere.md'), '# A heading from outside the project\n');

  const relative = '_bmad-output/planning-artifacts/prds/prd-escape-2026-09-04/prd.md';
  await mkdir(join(root, dirname(relative)), { recursive: true });
  await symlink(join(outside, 'elsewhere.md'), join(root, relative), 'file');

  let url = '';
  let shutdown: () => void = () => {};
  const code = await run([root], {
    launch: () => Promise.resolve({ opened: false as const, command: 'stub', reason: 'stubbed' }),
    stdout: (text) => {
      url += text;
    },
    stderr: () => {},
    onSignal: (handler) => {
      shutdown = handler;
    },
    exit: () => {},
  });
  t.after(() => shutdown());
  assert.equal(code, 0, `the run did not start: ${JSON.stringify(url)}`);
  const port = Number(URL_PATTERN.exec(url.trim())?.[1]);
  assert.ok(Number.isInteger(port), `no port in ${JSON.stringify(url)}`);

  const response = await get({ port, path: artifactUrl(relative) });
  // The status is the whole point: a throw from the supplier lands in the same
  // `try` as a render failure and would answer 500 for the entire page.
  assert.equal(response.status, 200, 'a refused read must not cost the reader the page');
  // AD-7 and AD-8: the state word and the stage, named in place.
  assert.match(response.body, /Unreadable at the/, 'the failure names its state');
  assert.ok(
    response.body.includes('>confinement<'),
    'the failure names the confinement stage, which is the fact worth reporting',
  );
  // And the refusal is a refusal: the file outside the root is not served
  // through the symlink that pointed at it.
  assert.ok(
    !response.body.includes('A heading from outside the project'),
    'content from outside the root reached the page',
  );
  // The page is still a page -- the shell and the artifact's own path render,
  // which is what "never fatal to its neighbours" means on a one-artifact
  // surface.
  assert.ok(response.body.includes('prd.md'), 'the shell still names the artifact');
});
