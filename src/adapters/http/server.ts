/**
 * Inbound HTTP adapter.
 *
 * Binds the literal loopback address and nothing else, lets the OS assign a
 * free port, and rejects any request whose `Host` header does not match the
 * address and port actually bound. Nothing here reads, writes or launches
 * anything.
 *
 * It does not compose the document either. Per AD-2 the served HTML belongs to
 * `src/render/`, so this module asks `renderPage()` for a body and decides only
 * the status and the headers. The page was a constant here through Story 1.1;
 * Story 1.2 moved it rather than styling it in place, because a page that gains
 * a stylesheet in the transport layer gains components there next.
 *
 * **From Story 1.12 it carries a second value through, and composes it no more
 * than it composes the first.** The Dashboard's content is the projected
 * inventory. This adapter holds the *supplier* the composition root gave it,
 * calls it once per `GET /`, and hands the result to `renderPage` unchanged. It
 * does not take an inventory, project one, or substitute a blank one for a
 * caller that omitted it — the option is required for exactly that reason.
 *
 * **A supplier and not a value, because a page load builds a new snapshot.**
 * The first version of this closed over one view for the socket's life, so
 * every request re-rendered a frozen snapshot while the header's refresh
 * control, this module's own comment and a test all said otherwise — AD-3's
 * "one immutable snapshot per refresh" implemented as one per process. Calling
 * the supplier per request is what makes the refresh link mean what three
 * places already claimed it meant. The snapshot is still immutable and still
 * built in one place: this adapter neither mutates one nor knows how one is
 * made.
 *
 * **Story 2.1a gives it a second route and no second job.** `/artifact/…`
 * resolves through `src/domain/url.ts` — AD-18's grammar, owned by the server
 * and shared with the render layer that builds the links — and the resulting
 * path is looked up in the snapshot's own rows. The adapter still composes
 * nothing: it asks `src/render/artifact.ts` whether the snapshot holds that row
 * and, if it does, for the document. What it decides is what it has always
 * decided, the status and the headers. Every route inherits the `Host` check
 * and the 405-with-`Allow` gate, because both happen before any path is looked
 * at.
 */

import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

import { renderPage } from '../../render/page.ts';
import { findArtifact, renderArtifact } from '../../render/artifact.ts';
import { assertProjectRoot } from '../../render/chrome.ts';
import type { InventoryView } from '../../render/inventory.ts';
import { errorCode } from '../../domain/thrown.ts';
import { parseArtifactUrl } from '../../domain/url.ts';
import { toPlatform, type CanonicalPath } from '../fs/paths.ts';

/**
 * The only interface this tool ever binds. Never a name, never a wildcard.
 *
 * This is an **input to `listen` only**. Nothing reported back to a caller is
 * derived from it — see `startServer` — because a constant that is also an
 * output makes every assertion test our bookkeeping instead of the bind.
 */
export const LOOPBACK_ADDRESS = '127.0.0.1';

/**
 * The highest port a TCP socket can carry.
 *
 * Exported because the composition root validates `--port` against the same
 * bound and had its own `65_535` beside this `65535` -- one value, two private
 * definitions, two literal spellings, and four test expectations restating the
 * digits. The bound belongs to the thing that binds, so it is stated here and
 * read there.
 */
export const MAX_PORT = 65535;

/**
 * Where a response records which scan it was built from (AD-17), on the 200
 * and `HEAD` paths only.
 *
 * **Not `ETag`, and that was decided rather than defaulted.** An `ETag`
 * validates a *representation*; this identity names a *scan*. Story 2.1a
 * introduces many representations per snapshot — AD-18's grammar covers
 * artifacts and their sections — so one scan will serve `/`, an artifact's URL
 * and each section's URL, which under `ETag` semantics must carry different
 * values and under AD-17 must report the same one. Different cardinality, so
 * one header cannot be both. `cache-control: no-store` below reinforces it: a
 * client may not store the representation, so it can never revalidate from a
 * stored copy and the `304` an `ETag` exists for is unreachable as this server
 * behaves. `ETag` stays available for a later caching story as a genuine
 * per-representation validator derived from the rendered document.
 *
 * No `X-` prefix, which RFC 6648 deprecates for new headers, and it names the
 * BMAD family rather than this one package.
 *
 * `respondText` and the 405 path are untouched: none of those responses
 * consults a snapshot, so none has an identity to carry — see
 * `src/domain/snapshot.ts` for what the value is derived from.
 */
export const SNAPSHOT_ID_HEADER = 'bmad-snapshot-id';

/**
 * The default port for the scheme this adapter serves. A client omits the port
 * from `Host` when it is the scheme default, so on port 80 a browser sends a
 * bare `Host: 127.0.0.1`. Only http is served here, so 443 is deliberately not
 * treated as a default: nothing in this process terminates TLS.
 */
const SCHEME_DEFAULT_PORT = 80;

/**
 * The body every miss answers with, stated once.
 *
 * Two routes can miss from Story 2.1a — a path that is no route at all, and an
 * artifact URL naming no row — and they are the same answer: the tool has
 * nothing at that address. One constant so the two cannot drift into two
 * sentences that imply a distinction the reader cannot act on.
 */
const NOT_FOUND_BODY = 'Not found.\n';

/**
 * The headers on any response carrying a rendered page from one snapshot.
 *
 * Stated once, on `NOT_FOUND_BODY`'s own reasoning one constant up: from Story
 * 2.1a two routes serve a page, they must agree on the content type, on
 * `no-store` and on recording the scan (AD-17), and a third surface copying a
 * block for the second time is how one of them ends up without the identity
 * header.
 *
 * It takes the **view**, not a bare id, so the identity on a response can only
 * come from the snapshot the body was rendered from — there is no parameter to
 * hand it something else through.
 *
 * Building this object validates nothing; `writeHead` validates every header
 * name and value it is handed, which is why every caller keeps that call inside
 * its own `try`. See the `/` branch's comment.
 */
function pageHeaders(view: InventoryView): Readonly<Record<string, string>> {
  return {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    [SNAPSHOT_ID_HEADER]: view.snapshotId,
  };
}

/** Bind failures worth retrying on an OS-assigned port instead of giving up. */
const RETRYABLE_BIND_CODES = new Set(['EADDRINUSE', 'EACCES', 'EADDRNOTAVAIL']);

/** What the socket reported binding. Never a value this module chose. */
export type BoundAddress = Readonly<Pick<AddressInfo, 'address' | 'port' | 'family'>>;

export interface StartServerOptions {
  /**
   * Absolute path this run targets, resolved once in the composition root.
   *
   * **Required**, and validated before the socket binds. From Story 1.3 the
   * served page states which project is open, so a server without a root
   * cannot render — and an option its owner cannot function without should not
   * be omittable. Requiring it turns "forgot to pass the root" from a throw
   * inside a request handler, which would take the process down, into a
   * compile error. It was optional and unread for two stories; the mirror of
   * the `--port` finding, where an option had no consumer at all.
   *
   * A `CanonicalPath`, not a string, from Story 1.5. The root must be the one
   * the composition root *recognized* — existence checked, symlinks resolved,
   * spelled as the filesystem spells it — because every later story keys
   * artifact identity by it. As a bare string, handing over the raw argument
   * instead of the resolved root typechecked, and only one end-to-end test
   * stood between that substitution and shipping. The brand makes that
   * substitution a compile error, which is what this repo does with invariants
   * it can move into the type system.
   *
   * **The brand proves less than the paragraph above, and the difference
   * matters here.** It certifies that the value went through `canonical`, not
   * that anything exists: `canonical` brands a path that is not there, and
   * `test/render/page.test.ts` relies on that. So "recognized" is a property of
   * the caller — `src/cli/` resolving before it binds — and not something this
   * adapter can read off the type. What this adapter checks for itself is the
   * `assertProjectRoot` call in `startServer`, which still runs and still
   * rejects an empty or relative root.
   */
  readonly projectRoot: CanonicalPath;
  /**
   * The Dashboard's content, built by the composition root on demand.
   *
   * **Required**, on `projectRoot`'s own reasoning one field up: from Story
   * 1.12 the surface *is* the inventory, so a server without one cannot render
   * a page, and an option its owner cannot function without should not be
   * omittable. Making it optional would mean this adapter deciding what an
   * absent inventory looks like, which is composing — the one thing AD-2 says
   * it must not do.
   *
   * **A function, called once per `GET /`.** A page load builds a new snapshot
   * (AD-3), which a value captured at bind time cannot do; see this module's
   * header. It may throw — the pass is built not to, but a filesystem can fail
   * between two requests — and a throw here is handled exactly as a render
   * throw is, because to a reader they are the same failure.
   *
   * It yields a render-layer view rather than the pass's `Inventory`: the spine
   * gives `src/render/` domain types only, and `Inventory` references
   * `CanonicalPath` and `WalkEntry`. The projection is the composition root's.
   */
  readonly inventory: () => InventoryView;
  /**
   * Preferred port. `0` — the default — asks the OS for a free one. A preferred
   * port that cannot be bound falls back to `0`, so the port reported is always
   * the port bound.
   */
  readonly port?: number;
  /**
   * Where a socket error *after* a successful bind is reported. A listener is
   * always attached whether or not this is supplied: an unhandled `error` on
   * the server is an uncaught exception, which would kill a process the user
   * expects to stay up.
   */
  readonly onError?: (error: Error) => void;
}

export interface ServerHandle {
  readonly url: string;
  readonly address: string;
  readonly port: number;
  readonly family: string;
  /** The `net` layer's account of the bound socket, passed through untouched. */
  readonly addressInfo: BoundAddress;
  /** The root this server renders for, exactly as validated at start. */
  readonly projectRoot: CanonicalPath;
  /**
   * How many `error` listeners are on the socket **right now**. Must be at
   * least one, permanently: exposed so a test can assert the invariant rather
   * than trusting that nobody deleted the listener. A live count, not a
   * snapshot — a value captured at bind time would only ever prove the
   * invariant held at t=0, which is not what "permanently" means.
   */
  readonly socketErrorListeners: number;
  /**
   * The underlying server, exposed for lifecycle and diagnostics only — closing
   * connections, and letting a test assert that a socket error is actually
   * delivered to `onError`. No binding, routing or `Host` decision may be taken
   * through it; those belong to this module and are tested through it.
   */
  readonly socket: Server;
  /**
   * Stop serving and resolve once the socket is closed.
   *
   * Destroys live connections rather than waiting for them. `server.close()`
   * alone waits for every open connection to end, and a connection with no
   * complete request on it — a browser preconnect — never ends, which makes
   * Ctrl-C hang forever once the page has been opened.
   *
   * **Idempotent.** A second call resolves rather than rejecting with
   * `ERR_SERVER_NOT_RUNNING`: already-closed is the desired end state, not a
   * failure, and a caller should not need its own latch to say so.
   */
  close(): Promise<void>;
}

/**
 * True when `headerValue` names exactly the address and port bound.
 *
 * A missing header, a bare address, a name that resolves to loopback and a
 * different port are all mismatches: the check is on the literal value, not on
 * what it might resolve to.
 */
export function isExpectedHost(
  headerValue: string | undefined,
  address: string,
  port: number,
): boolean {
  if (typeof headerValue !== 'string') return false;
  if (headerValue === `${address}:${port}`) return true;
  // Building `address:port` unconditionally rejected a legitimate bare
  // authority when the bound port is the scheme default.
  return port === SCHEME_DEFAULT_PORT && headerValue === address;
}

/**
 * Start the server.
 *
 * Every value reported back — `url`, `address`, `port`, `family` — is derived
 * from `addressInfo`, which is the socket's own account of what it bound as
 * reported by the `net` layer. `LOOPBACK_ADDRESS` is an input to `listen` and
 * never an output, so a bind to any other interface changes what this returns
 * instead of being masked by a constant.
 */
export async function startServer(options: StartServerOptions): Promise<ServerHandle> {
  const projectRoot = options.projectRoot;
  // Held and called, never inspected: this adapter does not look inside a view
  // and does not know how one is built. AD-3 puts one immutable snapshot behind
  // each page load, so this is invoked per request rather than captured here.
  const inventory = options.inventory;

  // Before the bind, not at request time. A root that cannot be rendered must
  // stop the command, not throw inside a request handler where the rejection
  // would surface as an uncaught exception and take the process down while the
  // user watches a browser tab hang.
  assertProjectRoot(projectRoot);
  const preferredPort = options.port ?? 0;
  const onError = options.onError;

  if (!Number.isInteger(preferredPort) || preferredPort < 0 || preferredPort > MAX_PORT) {
    throw new RangeError(
      `port must be an integer between 0 and ${MAX_PORT}, got ${JSON.stringify(options.port)}`,
    );
  }

  const server = createNodeServer();

  /**
   * The socket's own report. `null` until a bind succeeds, so the pre-bind
   * state is in the type: a request arriving before then cannot be compared
   * against a placeholder address and port 0 and accidentally match. Assigned
   * synchronously from the `listening` event, so it is set before any request
   * can be dispatched.
   */
  let bound: BoundAddress | null = null;

  /**
   * Durable, attached **before the first `listen`**. `listen` installs a
   * one-shot `error` handler and removes it on success, so attaching the
   * durable one afterwards left a window — reopened by the retry — in which the
   * socket had no `error` listener at all and any failure was an uncaught
   * exception that would kill a process the user expects to stay up.
   */
  server.on('error', (error: Error) => {
    // Before a successful bind, the pending `listen` promise owns the failure
    // and rejects with it; reporting here too would double-report.
    if (bound === null) return;
    onError?.(error);
  });

  server.on('request', (request: IncomingMessage, response: ServerResponse) => {
    // A client that disappears mid-exchange must not take the process with it.
    request.on('error', () => {});
    response.on('error', () => {});
    handleRequest(request, response, bound, projectRoot, inventory, onError);
  });

  const adopt = (info: BoundAddress): void => {
    bound = info;
  };

  try {
    await listen(server, preferredPort, adopt);
  } catch (error: unknown) {
    if (preferredPort !== 0 && isRetryableBindError(error)) {
      await listen(server, 0, adopt);
    } else {
      throw error;
    }
  }

  if (bound === null) {
    // Unreachable: `listen` either adopts an `AddressInfo` or rejects. Narrowed
    // explicitly rather than spread, because `{ ...null }` is `{}` and would
    // quietly produce `http://undefined:undefined/` — defeating the whole point
    // of keeping the pre-bind state in the type.
    await closeQuietly(server);
    throw new Error('listen reported success without reporting an address');
  }
  const settled: BoundAddress = bound;

  const addressInfo: BoundAddress = Object.freeze({
    address: settled.address,
    port: settled.port,
    family: settled.family,
  });

  /** Latched so a second `close()` resolves instead of rejecting. */
  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined && errorCode(error) !== 'ERR_SERVER_NOT_RUNNING') {
          reject(error);
          return;
        }
        resolve();
      });
      // Must follow `close`: on its own, `close` waits for every open
      // connection, and a connection carrying no complete request never ends.
      server.closeAllConnections();
    });
    return closing;
  };

  return {
    url: `http://${addressInfo.address}:${addressInfo.port}/`,
    address: addressInfo.address,
    port: addressInfo.port,
    family: addressInfo.family,
    addressInfo,
    projectRoot,
    get socketErrorListeners(): number {
      return server.listenerCount('error');
    },
    socket: server,
    close,
  };
}

/** Close without caring whether it was ever listening. */
function closeQuietly(server: Server): Promise<void> {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

/**
 * Bind one port, resolving with the socket's `AddressInfo` — the kernel's
 * account of the address, port and family actually bound, not the request.
 */
function listen(
  server: Server,
  port: number,
  adopt: (info: BoundAddress) => void,
): Promise<BoundAddress> {
  return new Promise<BoundAddress>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      const info = server.address();
      if (info === null || typeof info === 'string') {
        // Not an IP socket, so nothing here can hold. Close before rejecting:
        // an abandoned listening handle would keep the process alive.
        server.close(() => {
          reject(new Error(`expected an IP socket, got ${JSON.stringify(info)}`));
        });
        return;
      }
      const boundInfo: BoundAddress = {
        address: info.address,
        port: info.port,
        family: info.family,
      };
      // Adopted in the same tick as `listening`, strictly before any request
      // can be dispatched, so the null state below is genuinely unreachable.
      adopt(boundInfo);
      resolve(boundInfo);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host: LOOPBACK_ADDRESS, port, exclusive: true });
  });
}

/**
 * Validate `Host`, then route. Nothing is served to a request that failed the
 * host check — the rejection happens before any path is looked at.
 */
function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  bound: BoundAddress | null,
  projectRoot: CanonicalPath,
  inventory: () => InventoryView,
  onError: ((error: Error) => void) | undefined,
): void {
  if (bound === null) {
    // Unreachable in practice, and deliberately kept. The `request` listener
    // must be attached *before* `listen` — a listening socket with no listener
    // would accept a connection and answer nothing at all — so the unbound
    // state is representable here and the type says so. `bound` is adopted
    // synchronously from the `listening` event, which is why nothing can reach
    // this. Answering honestly costs three lines; a non-null assertion here
    // would be a lie the compiler could not check.
    respondText(response, 503, 'Not bound yet.\n');
    return;
  }

  if (!isExpectedHost(request.headers.host, bound.address, bound.port)) {
    respondText(response, 403, 'Forbidden: unexpected Host header.\n');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    respondText(response, 405, 'Method not allowed.\n');
    return;
  }

  // The query is stripped and the path is otherwise untouched here: decoding,
  // dot-segment normalization and the artifact grammar all belong to
  // `src/domain/url.ts`, which owns them for the render layer too. `/` is an
  // equality against the raw path for the same reason it always was — it takes
  // no argument, so there is nothing to parse.
  const path = request.url?.split('?')[0] ?? '/';
  if (path === '/') {
    // Building the snapshot and rendering it, inside one `try`, and that is
    // deliberate: to a reader they are one failure — the page did not come —
    // and neither may escape a request listener, because an exception that does
    // ends the process while the reader watches a tab hang. A 500 they can
    // report beats a server that vanishes.
    //
    // Rendering is pure over a validated root, so a throw from it is a defect;
    // the pass is built not to throw at all (AD-7), but it reads a filesystem
    // that can change between two requests, which is the one honest reason a
    // second request can fail where the first succeeded.
    //
    // **`writeHead` is inside the `try` too, which it was not.** It validates
    // every header name and value it is given, so a view carrying a malformed
    // `snapshotId` would have thrown *past* this handler — no response written,
    // no `onError`, and a reader watching a tab hang until the socket timed
    // out. Inside, the same 500 covers it. Nothing has been written to the
    // socket at that point: `writeHead` only records the status and headers,
    // and `end` below is what flushes them, so the 500 can still be sent.
    //
    // The view is held rather than discarded after `renderPage` consumes it:
    // its `snapshotId` is what AD-17 asks this response to record, and it is a
    // fact about the *view*, not about the document string `renderPage`
    // returns.
    let document: string;
    try {
      const view = inventory();
      document = renderPage(toPlatform(projectRoot), view);
      response.writeHead(200, pageHeaders(view));
    } catch (error: unknown) {
      // **A 500 carries no identity, and its reason is not the other four's.**
      // The 403, 404 and 405 responses are refused before the supplier is
      // called, so no snapshot exists for them to name. Here one may well
      // exist — a `renderPage` throw means the supplier already succeeded —
      // and the header is omitted because no body was produced *from* it. An
      // identity on a response that is not the page would be a claim about
      // content this response does not carry.
      onError?.(error instanceof Error ? error : new Error(String(error)));
      respondText(response, 500, 'The page could not be rendered.\n');
      return;
    }
    response.end(document);
    return;
  }

  const target = parseArtifactUrl(path);
  if (target !== undefined) {
    // **The lookup is a set-membership test against this snapshot's own rows,
    // and that is the whole of the confinement.** Nothing on this path resolves,
    // stats or reads anything: `findArtifact` lives in the render layer, which
    // has no filesystem adapter to reach, so a URL naming a file that is not a
    // row cannot open it however it is spelled. `/artifact/../../etc/passwd`
    // normalizes to the key `etc/passwd`, which is not a row, which is the 404
    // below — not because a check refused it, but because there is no code path
    // from a request to a read.
    //
    // The snapshot is built first and the miss decided from it, so a 404 costs
    // a scan. That is the honest order: "is this a row" is a question only a
    // snapshot can answer, and answering it from the filesystem instead is
    // exactly the mutation this story's mechanism check plants.
    //
    // `target.section` is parsed and deliberately unused. AD-18 fixes the
    // grammar for artifacts **and** sections and the spine lists it as not
    // deferred, so the shape resolves today; deriving a section id from a
    // document is Story 2.9's, and a page that claimed to have selected a
    // section it cannot name would be worse than one that opens the artifact.
    //
    // One `try`, and `writeHead` inside it, for the reasons the `/` branch
    // states at length: to a reader a snapshot failure and a render failure are
    // one failure, and `writeHead` validates the header values it is given.
    let document: string;
    try {
      const view = inventory();
      const found = findArtifact(view, target.path);
      if (found === undefined) {
        // No identity header. The response carries no project content — it
        // carries the fact that there is none — so naming a snapshot on it
        // would be a claim about content this response does not have, which is
        // the rule the 403, 405 and 500 paths already follow.
        respondText(response, 404, NOT_FOUND_BODY);
        return;
      }
      document = renderArtifact(toPlatform(projectRoot), found);
      response.writeHead(200, pageHeaders(view));
    } catch (error: unknown) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      respondText(response, 500, 'The page could not be rendered.\n');
      return;
    }
    response.end(document);
    return;
  }

  respondText(response, 404, NOT_FOUND_BODY);
}

function respondText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(body);
}

function isRetryableBindError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && RETRYABLE_BIND_CODES.has(code);
}

