#!/usr/bin/env node
/**
 * Composition root.
 *
 * Parses the one accepted argument, resolves it, starts the inbound HTTP
 * adapter and reports the URL actually bound. stdout carries the URL and
 * nothing else; every diagnostic goes to stderr.
 */

import { parseArgs } from 'node:util';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer, type ServerHandle } from '../adapters/http/server.ts';
import { resolveRealPath } from '../adapters/fs/realpath.ts';

const USAGE = 'Usage: bmad-dash [path]';
const ACCEPTED = 'Accepted arguments: one optional path to a BMAD project. No flags are accepted.';

/**
 * Usage error, deliberately distinct from the runtime-failure code so a caller
 * can tell "you typed it wrong" from "it could not start".
 */
const EXIT_USAGE = 2;
const EXIT_FAILURE = 1;

export type Invocation =
  | { readonly ok: true; readonly projectRoot: string }
  | { readonly ok: false; readonly message: string };

/**
 * The first token that looks like an option.
 *
 * Used instead of parsing Node's error prose, which is not API: the message
 * wording can change between releases, and a regex over it fails silently when
 * it does. `--` ends option parsing, and a bare `-` is conventionally a
 * positional.
 */
function firstOptionToken(argv: readonly string[]): string | undefined {
  for (const token of argv) {
    if (token === '--') return undefined;
    if (token.length > 1 && token.startsWith('-')) return token;
  }
  return undefined;
}

/**
 * Resolve the target path from the arguments after the node binary and script.
 *
 * The result is always absolute. Every later story resolves artifact paths
 * against `projectRoot`, so a cwd-relative value recorded here would be
 * re-resolved against whatever directory happened to be current at the time.
 */
export function parseInvocation(argv: readonly string[], cwd: string): Invocation {
  let positionals: string[];
  try {
    ({ positionals } = parseArgs({
      args: [...argv],
      options: {},
      strict: true,
      allowPositionals: true,
    }));
  } catch (error: unknown) {
    const code = errorCode(error);
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      const flag = firstOptionToken(argv);
      return {
        ok: false,
        message: `Unknown argument: ${flag ?? 'unrecognised option'}\n${ACCEPTED}\n${USAGE}`,
      };
    }
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Could not parse arguments: ${detail}\n${ACCEPTED}\n${USAGE}` };
  }

  if (positionals.length > 1) {
    return {
      ok: false,
      message: `Too many arguments: ${positionals.length} paths given.\n${ACCEPTED}\n${USAGE}`,
    };
  }

  const projectRoot = resolve(cwd, positionals[0] ?? '.');
  if (!isAbsolute(projectRoot)) {
    // Unreachable via `resolve`, asserted because everything downstream trusts it.
    return { ok: false, message: `Could not resolve an absolute path for the target.\n${USAGE}` };
  }
  return { ok: true, projectRoot };
}

/**
 * What `run` needs from the outside world.
 *
 * A composition root that hard-wires its own dependencies cannot be asked what
 * it does when one fails. `EXIT_FAILURE` was unreachable through the CLI
 * surface — the loopback bind effectively always succeeds — so the distinction
 * between misuse (2) and failure to start (1) was asserted on one side only.
 * Defaults are the real wiring; the seam exists so the other side is testable.
 */
export interface RunDependencies {
  readonly start?: typeof startServer;
  readonly stdout?: (text: string) => void;
  readonly stderr?: (text: string) => void;
  /** Registers the shutdown handler. Injected so tests do not touch the real process. */
  readonly onSignal?: (handler: () => void) => void;
  readonly exit?: (code: number) => void;
}

/** Returns the process exit code. `0` means the server is up. */
export async function run(
  argv: readonly string[],
  dependencies: RunDependencies = {},
): Promise<number> {
  const start = dependencies.start ?? startServer;
  const stdout = dependencies.stdout ?? ((text: string) => void process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => void process.stderr.write(text));
  const exit = dependencies.exit ?? ((code: number) => process.exit(code));
  const onSignal =
    dependencies.onSignal ??
    ((handler: () => void) => {
      // `on`, not `once`: `once` removes the listener after the first signal, so
      // a second one falls through to the default action and kills the process
      // by signal instead of exiting 0. The latch makes repeat signals safe.
      process.on('SIGINT', handler);
      process.on('SIGTERM', handler);
    });

  const invocation = parseInvocation(argv, process.cwd());
  if (!invocation.ok) {
    stderr(`${invocation.message}\n`);
    return EXIT_USAGE;
  }

  /**
   * **Readiness is announced last, and everything a consumer might do about it
   * is wired first. Do not reorder this.**
   *
   * The URL on stdout is the readiness contract. A consumer that reads it and
   * immediately signals — a wrapper script, a test harness, a supervisor — used
   * to land in the window between the announcement and the handler
   * registration, and got the default signal disposition: terminated by signal,
   * exit code `null`, instead of exiting 0. It failed roughly one run in six,
   * which is indistinguishable from a flake until you look at the ordering.
   *
   * The handler is therefore registered before the socket is even bound, not
   * merely before the URL is printed: the listening socket is observable too,
   * and `Target:` on stderr is observable, so anything registered after either
   * of them has the same window in a different disguise. A signal arriving
   * before the server exists finds nothing to close and exits 0, which is the
   * right answer for an interrupted startup.
   */
  let handle: ServerHandle | null = null;
  onSignal(
    createShutdownHandler({
      close: () => (handle === null ? Promise.resolve() : handle.close()),
      exit,
    }),
  );

  try {
    handle = await start({
      projectRoot: invocation.projectRoot,
      onError: (error) => {
        stderr(`Socket error after bind: ${error.message}\n`);
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Could not bind the loopback interface: ${message}\n`);
    return EXIT_FAILURE;
  }

  stderr(`Target: ${invocation.projectRoot}\n`);
  // Last. See the comment above before moving anything below this line.
  stdout(`${handle.url}\n`);

  return 0;
}

/**
 * A shutdown that runs once however many times it is called.
 *
 * Extracted so the latch is testable. End to end it is not: shutdown completes
 * in about a millisecond and the OS coalesces pending standard signals, so a
 * second SIGINT cannot reliably be delivered inside the window — measured,
 * five rapid SIGINTs exit 0 with and without the latch. The latch still has to
 * be right, so it is tested here rather than left to a race nothing can
 * observe.
 */
export function createShutdownHandler(dependencies: {
  readonly close: () => Promise<void>;
  readonly exit: (code: number) => void;
}): () => void {
  let shuttingDown = false;
  return () => {
    if (shuttingDown) return;
    shuttingDown = true;
    dependencies.close().then(
      () => dependencies.exit(0),
      () => dependencies.exit(EXIT_FAILURE),
    );
  };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Entry guard.
 *
 * Resolves **both sides** through `realpath` before comparing. One-sided
 * resolution is not enough:
 *
 *   - Normally `bin` is reached through a symlink in `node_modules/.bin`, so
 *     `process.argv[1]` is the symlink while `import.meta.url` is the realpath.
 *   - Under `--preserve-symlinks-main`, `import.meta.url` is itself the symlink
 *     path, so resolving only `argv[1]` inverts the same mismatch.
 *
 * Either way an unresolved side makes this false and the CLI exits 0 having
 * done nothing at all, which is the defect this comparison exists to prevent.
 */
function isDirectInvocation(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return resolveRealPath(fileURLToPath(import.meta.url)) === resolveRealPath(entry);
}

if (isDirectInvocation()) {
  // A closed output stream — `bmad-dash | head`, `bmad-dash | true` — is a
  // normal end, not a crash. Without this, the write throws EPIPE, Node prints
  // a stack trace and the process exits 1. Installed here rather than inside
  // `run` because it is a property of being the process, not of running the
  // logic — and installed before any write, for the same reason the signal
  // handlers are: a guard registered after the thing it guards is not a guard.
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE') process.exit(0);
    });
  }

  const code = await run(process.argv.slice(2));
  if (code !== 0) process.exit(code);
}
