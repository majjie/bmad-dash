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
 */

import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

import { renderPage } from '../../render/page.ts';
import { assertProjectRoot } from '../../render/chrome.ts';
import { toPlatform, type CanonicalPath } from '../fs/paths.ts';

/**
 * The only interface this tool ever binds. Never a name, never a wildcard.
 *
 * This is an **input to `listen` only**. Nothing reported back to a caller is
 * derived from it — see `startServer` — because a constant that is also an
 * output makes every assertion test our bookkeeping instead of the bind.
 */
export const LOOPBACK_ADDRESS = '127.0.0.1';

const MAX_PORT = 65535;

/**
 * The default port for the scheme this adapter serves. A client omits the port
 * from `Host` when it is the scheme default, so on port 80 a browser sends a
 * bare `Host: 127.0.0.1`. Only http is served here, so 443 is deliberately not
 * treated as a default: nothing in this process terminates TLS.
 */
const SCHEME_DEFAULT_PORT = 80;

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
   * stood between that substitution and shipping. The brand makes it a
   * compile error, which is what this repo does with invariants it can move
   * into the type system.
   */
  readonly projectRoot: CanonicalPath;
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
    handleRequest(request, response, bound, projectRoot, onError);
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

  const path = request.url?.split('?')[0] ?? '/';
  if (path === '/') {
    // Rendering is pure and its input was validated before the bind, so a
    // throw here means a defect rather than bad input. Caught all the same: an
    // exception escaping a request listener is an uncaught exception, which
    // ends the process while the reader watches a tab hang. A 500 they can
    // report beats a server that vanishes.
    let document: string;
    try {
      document = renderPage(toPlatform(projectRoot));
    } catch (error: unknown) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      respondText(response, 500, 'The page could not be rendered.\n');
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(document);
    return;
  }

  respondText(response, 404, 'Not found.\n');
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

/** Narrow an unknown thrown value to its `code`, if it has a string one. */
function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}
