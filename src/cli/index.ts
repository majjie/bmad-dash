#!/usr/bin/env node
/**
 * Composition root.
 *
 * Parses the arguments, resolves the target, starts the inbound HTTP
 * adapter and reports the URL actually bound. stdout carries the URL and
 * nothing else; every diagnostic goes to stderr.
 */

import { parseArgs } from 'node:util';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer, type ServerHandle } from '../adapters/http/server.ts';
import { resolveRealPath } from '../adapters/fs/realpath.ts';
import { openBrowser, type LaunchResult } from '../adapters/browser/open.ts';
import { resolveLocation } from './location.ts';
import { toPlatform } from '../adapters/fs/paths.ts';

const USAGE = 'Usage: bmad-dash [path] [options]';
const ACCEPTED =
  'Accepted arguments: one optional path to a BMAD project, and --no-open, --port <n>, ' +
  '-h/--help, --version.';

/**
 * The lowest and highest port a socket can be asked for. `0` is meaningful — it
 * asks the OS for a free one — so the range starts there rather than at 1.
 */
const MIN_PORT = 0;
const MAX_PORT = 65_535;

/**
 * The published version.
 *
 * A one-key JSON file rather than `package.json`, and rather than an esbuild
 * `--define`. Importing `package.json` works in all three toolchains but makes
 * esbuild inline the *whole* file, shipping devDependencies and script commands
 * to every consumer — measured, not assumed. A `--define` avoided that but had
 * to smuggle a quoted string through the shell, and the `'"0.1.0"'` form relies
 * on `sh` stripping the outer quotes; `cmd.exe` does not, so a Windows build
 * shipped a version with the quotes embedded — on the one platform this story
 * goes out of its way to support a launcher for.
 *
 * So the version lives in a file that contains nothing else. It is duplicated
 * from `package.json`, which `test/cli-entry.test.ts` asserts, and
 * `prepublishOnly` runs the suite so a stale copy cannot be published.
 */
import versionFile from '../version.json' with { type: 'json' };

export const VERSION: string = (versionFile as { version: string }).version;

/**
 * The help text, specified in the story rather than invented here.
 *
 * The last two lines are the point: they state the guarantees a reader most
 * wants from something they are about to aim at their own work, in the place
 * they are most likely to look first.
 */
export const HELP = `${USAGE}

A read-only local dashboard over a BMAD project's artifacts.

Arguments:
  path          the BMAD project to inspect (default: the current directory)

Options:
  --no-open     do not launch a browser; the URL is still printed
  --port <n>    preferred port, ${String(MIN_PORT)}-${String(MAX_PORT)} (default: 0, an OS-assigned port)
  -h, --help    print this message and exit
  --version     print the version and exit

Binds 127.0.0.1 only. Never writes to the project. Makes no outbound
network request.
`;

/**
 * Usage error, deliberately distinct from the runtime-failure code so a caller
 * can tell "you typed it wrong" from "it could not start".
 */
const EXIT_USAGE = 2;
const EXIT_FAILURE = 1;

/**
 * Signals that mean "stop". `SIGHUP` is here because closing the terminal is an
 * ordinary way to end a foreground command, and without a handler it took the
 * default disposition: the process died and the server was never closed.
 */
const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

/**
 * How long a shutdown may take before it is abandoned.
 *
 * `close()` was awaited with no timer, so a `close()` that never settles hung
 * the process — the Loop 2 failure mode, left unguarded on the one signal path
 * that had no test. Shutdown measures about a millisecond in practice, so this
 * is generous; it exists so a hang is a bounded, reported failure rather than a
 * process the user cannot kill without a second, harsher signal.
 */
const SHUTDOWN_TIMEOUT_MS = 2_000;

/**
 * What the arguments asked for.
 *
 * `print` is its own case rather than a flag on the success case, because
 * `--help` and `--version` do not start a server at all — and the matrix row
 * that says so ("nothing bound, nothing launched") is only assertable if the
 * two paths are different shapes. A boolean on the serving case would have to
 * be checked, and a check can be forgotten.
 */
export type Invocation =
  | { readonly ok: true; readonly projectRoot: string; readonly open: boolean; readonly port: number }
  | { readonly ok: true; readonly print: string }
  | { readonly ok: false; readonly message: string };

/**
 * `--port` as a number, or `null` if it is not a port.
 *
 * Absent means `0`, the OS-assigned default. Everything else must be a plain
 * decimal integer in range: `Number()` alone would accept `0x10`, `1e3`, `1.5`,
 * `' 80 '` and `Infinity`, each of which is a typo rather than a port, and
 * `parseInt` would accept `80abc`. The pattern is checked before the value so
 * the two cannot disagree.
 */
export function parsePort(raw: string | undefined): number | null {
  if (raw === undefined) return 0;
  // `0` alone, or a digit string with no leading zero. `0080` was accepted and
  // parsed to 80 — which is privileged, so it then fell back to an OS-assigned
  // port and bound 40821. A typo should be refused, not silently reinterpreted
  // twice. This also keeps the rule consistent with rejecting `+80` and ` 80 `.
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) return null;
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < MIN_PORT || port > MAX_PORT) return null;
  return port;
}

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
    if (token.length <= 1 || !token.startsWith('-')) continue;
    // The first option token is not necessarily the *unknown* one. It was,
    // while no flag was accepted at all — every option token was unknown by
    // definition. Now that four are declared, reporting the first would answer
    // `bmad-dash --no-open --nope` with "Unknown argument: --no-open", naming a
    // flag that works and sending the reader to look in the wrong place.
    if (isDeclaredOption(token)) continue;
    return token;
  }
  return undefined;
}

/** The token following `name`, or the inline value of `name=value`. */
function valueAfter(argv: readonly string[], name: string): string | undefined {
  for (const [index, token] of argv.entries()) {
    if (token === name) return argv[index + 1];
    if (token.startsWith(`${name}=`)) return token.slice(name.length + 1);
  }
  return undefined;
}

/** Long and short forms the parser accepts, including `--flag=value`. */
function isDeclaredOption(token: string): boolean {
  const name = token.startsWith('--') ? (token.split('=')[0] ?? token) : token;
  return DECLARED_OPTIONS.includes(name);
}

/**
 * Every option token the parser accepts, as written on a command line.
 *
 * Kept beside `parseArgs`'s own options map, and `test/cli/flags.test.ts`
 * asserts the two agree — a second list that drifts is how the message above
 * would start lying again.
 */
export const DECLARED_OPTIONS: readonly string[] = [
  '--no-open',
  '--port',
  '--help',
  '-h',
  '--version',
];

/**
 * Resolve the target path from the arguments after the node binary and script.
 *
 * The result is always absolute. Every later story resolves artifact paths
 * against `projectRoot`, so a cwd-relative value recorded here would be
 * re-resolved against whatever directory happened to be current at the time.
 */
export function parseInvocation(argv: readonly string[], cwd: string): Invocation {
  // Before parsing, deliberately. `parseArgs` throws on an undeclared flag, so
  // `--help --nope` exited 2 while the matrix promised help wins over anything
  // else on the line — and a reader who mistyped a flag is exactly the reader
  // who wants the help text rather than a refusal. `--` still ends options, so
  // `bmad-dash -- --help` is a path.
  const beforeSeparator = argv.slice(0, argv.indexOf('--') === -1 ? argv.length : argv.indexOf('--'));
  if (beforeSeparator.includes('--help') || beforeSeparator.includes('-h')) {
    return { ok: true, print: HELP };
  }

  let positionals: string[];
  let values: {
    readonly 'no-open'?: boolean;
    readonly port?: string;
    readonly help?: boolean;
    readonly version?: boolean;
  };
  try {
    ({ positionals, values } = parseArgs({
      args: [...argv],
      options: {
        // Declared literally as `no-open`: Node's `parseArgs` has no automatic
        // `--no-` negation, so an `open` option would not answer to it.
        'no-open': { type: 'boolean' },
        // A string, then validated. `parseArgs` has no numeric type, and
        // accepting `--port abc` only to fail later is worse than one check
        // that names both the value and the range.
        port: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
      },
      // Still strict, so an undeclared flag exits 2 exactly as it did when no
      // flag at all was accepted.
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
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      // Node raises this for `--port -1`, because a value beginning with `-`
      // is ambiguous with the next flag. Its prose asks "did you forget to
      // specify the option argument?", which never names the range and sends
      // the reader looking for a missing argument rather than a bad one.
      const offending = valueAfter(argv, '--port');
      return {
        ok: false,
        message:
          `Invalid --port value: ${JSON.stringify(offending ?? '')}. ` +
          `Expected an integer from ${String(MIN_PORT)} to ${String(MAX_PORT)}.\n${USAGE}`,
      };
    }
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Could not parse arguments: ${detail}\n${ACCEPTED}\n${USAGE}` };
  }

  // Before the positional check and before any resolution: `bmad-dash --help`
  // with three stray paths is still a request for help, and answering it with a
  // usage error would be pedantry.
  if (values.help === true) return { ok: true, print: HELP };
  if (values.version === true) return { ok: true, print: `${VERSION}\n` };

  if (positionals.length > 1) {
    return {
      ok: false,
      message: `Too many arguments: ${positionals.length} paths given.\n${ACCEPTED}\n${USAGE}`,
    };
  }

  const port = parsePort(values.port);
  if (port === null) {
    return {
      ok: false,
      message:
        `Invalid --port value: ${JSON.stringify(values.port)}. ` +
        `Expected an integer from ${String(MIN_PORT)} to ${String(MAX_PORT)}.\n${USAGE}`,
    };
  }

  const projectRoot = resolve(cwd, positionals[0] ?? '.');
  if (!isAbsolute(projectRoot)) {
    // Unreachable via `resolve`, asserted because everything downstream trusts it.
    return { ok: false, message: `Could not resolve an absolute path for the target.\n${USAGE}` };
  }
  return { ok: true, projectRoot, open: values['no-open'] !== true, port };
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
  /**
   * **Required, unlike every other dependency here.**
   *
   * The others default to something inert or observable; this one is the only
   * dependency whose default reaches out of the process and changes something
   * on the user's desktop. It was optional for one afternoon, and in that time
   * five in-process tests and one shell pipeline silently opened real browser
   * tabs on every suite run — the tests injected `start` and `stdout` faithfully
   * and simply never thought about this one, because nothing made them.
   *
   * Requiring it moves "a test forgot to stub the launcher" from something a
   * grep might notice to something that does not compile. The real entry point
   * passes `openBrowser`; that is the single place the side effect is chosen.
   */
  readonly launch: (url: string) => Promise<LaunchResult>;
}

/** Returns the process exit code. `0` means the server is up. */
export async function run(
  argv: readonly string[],
  dependencies: RunDependencies,
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
      for (const signal of STOP_SIGNALS) process.on(signal, handler);
    });

  const launch = dependencies.launch;

  const invocation = parseInvocation(argv, process.cwd());
  if (!invocation.ok) {
    stderr(`${invocation.message}\n`);
    return EXIT_USAGE;
  }

  // `--help` and `--version` answer and leave. Nothing is bound, no signal
  // handler is registered and no launcher is called: a successful invocation
  // that happens not to involve a server.
  if ('print' in invocation) {
    stdout(invocation.print);
    return 0;
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
  // Before the socket, and before the shutdown handler: a target that is not a
  // BMAD project must not bind, so there is nothing to shut down. This is also
  // the first thing in the run that touches the filesystem.
  const location = resolveLocation(invocation.projectRoot);
  if (!location.ok) {
    stderr(`${location.message}\n`);
    // A permissions failure is not a usage error. The CLI separates 2 — "you
    // typed it wrong" — from 1 — "it could not start" — and a directory the
    // tool is denied is the second kind: the invocation was fine and the
    // environment was not. A wrapper script branching on the code needs those
    // apart.
    return location.reason === 'unreadable' ? EXIT_FAILURE : EXIT_USAGE;
  }

  let handle: ServerHandle | null = null;
  onSignal(
    createShutdownHandler({
      close: () => (handle === null ? Promise.resolve() : handle.close()),
      exit,
      onTimeout: (ms) => {
        stderr(`Shutdown did not complete within ${String(ms)}ms; exiting anyway.\n`);
      },
    }),
  );

  try {
    handle = await start({
      projectRoot: location.root,
      port: invocation.port,
      onError: (error) => {
        stderr(`Socket error after bind: ${error.message}\n`);
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Could not bind the loopback interface: ${message}\n`);
    return EXIT_FAILURE;
  }

  // A requested port that could not be bound is reported, not swallowed. The
  // adapter falls back to an OS-assigned port so the tool still starts — which
  // is right — but `--port 45999` binding 36203 in silence tells the reader
  // their instruction was obeyed when it was not. Only when a port was actually
  // asked for: the default of 0 *means* "whatever is free", so reporting it
  // would be noise on every ordinary run.
  if (invocation.port !== 0 && handle.port !== invocation.port) {
    stderr(
      `Port ${String(invocation.port)} was not available; using ${String(handle.port)} instead.\n`,
    );
  }

  stderr(`Target: ${toPlatform(location.root)}\n`);
  // Last of the readiness announcements. See the comment above before moving
  // anything below this line.
  stdout(`${handle.url}\n`);

  /**
   * **After the announcement, and never a gate.** AD-15: the server is bound and
   * its URL is on stdout by the time this runs, so a launch that fails costs the
   * reader a copy and paste and nothing else. The result is reported and
   * discarded; the exit code does not move.
   *
   * Awaited rather than left dangling, so the order of events is deterministic
   * and a test can assert it instead of sampling a timing window. `launch` never
   * rejects — see `openBrowser` — so there is nothing here to catch.
   */
  if (invocation.open) {
    const result = await launch(handle.url);
    if (!result.opened) {
      stderr(`Could not open a browser: ${result.reason}. Open the URL above.\n`);
    }
  }

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
  /** Override only in tests; production uses `SHUTDOWN_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
  readonly onTimeout?: (timeoutMs: number) => void;
}): () => void {
  const timeoutMs = dependencies.timeoutMs ?? SHUTDOWN_TIMEOUT_MS;
  let shuttingDown = false;

  return () => {
    if (shuttingDown) return;
    shuttingDown = true;

    let settled = false;
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      dependencies.exit(code);
    };

    // A `close()` that never settles must not hold the process open. Unref'd so
    // it never keeps the loop alive on its own: while a socket is still open the
    // loop is alive and this fires, and once nothing is open there is nothing
    // left to wait for.
    const watchdog = setTimeout(() => {
      if (settled) return;
      dependencies.onTimeout?.(timeoutMs);
      settled = true;
      dependencies.exit(EXIT_FAILURE);
    }, timeoutMs);
    watchdog.unref();

    dependencies.close().then(
      () => finish(0),
      () => finish(EXIT_FAILURE),
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

  const code = await run(process.argv.slice(2), { launch: openBrowser });
  if (code !== 0) process.exit(code);
}
