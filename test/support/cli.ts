/**
 * One in-process harness for running the composition root under observation.
 *
 * There were four of these by the end of Story 1.6's first round: `stubHandle`
 * and `exitCodeDeps` in `test/cli/startup-order.test.ts`, plus two
 * near-identical `observe` helpers in the new suggestion tests — while
 * `exitCodeDeps` itself had drifted out of use. Every one of them existed to
 * stub the same four seams, and the risk is not the duplication: it is that a
 * new dependency added to `RunDependencies` gets stubbed faithfully in three
 * copies and forgotten in the fourth, which is how a suite starts opening real
 * browser tabs.
 */

import { createServer } from 'node:http';

import { run } from '../../src/cli/index.ts';
import { suggestInvocations } from '../../src/cli/suggest.ts';
import { canonical } from '../../src/adapters/fs/paths.ts';
import type { ServerHandle } from '../../src/adapters/http/server.ts';

/**
 * A synthetic absolute root. Fixed rather than `process.cwd()` so a test's
 * expectations do not change with the directory it is run from, and chosen to
 * look nothing like this repository so a path leaking from the real filesystem
 * into an assertion is visible.
 */
export const STUB_PROJECT_ROOT = '/tmp/bmad-dash-test-project';

/** A handle that binds nothing, so ordering can be observed without a socket. */
export function stubHandle(projectRoot: string = STUB_PROJECT_ROOT): ServerHandle {
  const socket = createServer();
  return {
    url: 'http://127.0.0.1:1/',
    address: '127.0.0.1',
    port: 1,
    family: 'IPv4',
    addressInfo: { address: '127.0.0.1', port: 1, family: 'IPv4' },
    projectRoot: canonical(projectRoot),
    get socketErrorListeners(): number {
      return socket.listenerCount('error');
    },
    socket,
    close: () => Promise.resolve(),
  };
}

/**
 * Dependencies for a run that is only asked for its exit code.
 *
 * Everything observable is stubbed, so the number `run` returns is the whole
 * result — and `start` never fails, which is what makes an exit of 1 evidence
 * about resolution rather than about the socket.
 */
export function exitCodeDeps(): Parameters<typeof run>[1] {
  return {
    start: () => Promise.resolve(stubHandle()),
    launch: () => Promise.resolve({ opened: true as const, command: 'stub' }),
    stdout: () => {},
    stderr: () => {},
    onSignal: () => {},
  };
}

/** Everything one run made observable. */
export interface RunObservation {
  readonly code: number;
  readonly out: string;
  readonly err: string;
  /** Targets the injected scan was called with, in order. Empty means it never ran. */
  readonly scans: readonly string[];
  /** The flags each scan call was handed. */
  readonly scanFlags: readonly (readonly string[])[];
  /** The root each `start` call was given. Empty means no socket was ever asked for. */
  readonly served: readonly string[];
  readonly launched: number;
  readonly signals: number;
}

export interface ObserveOptions {
  /**
   * Replaces the suggestion scan's *body*. Omit it and the recorder delegates
   * to the real `suggestInvocations`, so a test can both count the calls and
   * assert on genuine output.
   */
  readonly suggest?: (target: string, flags: readonly string[]) => readonly string[];
  /**
   * Set false to pass no `suggest` dependency at all, so the run uses whatever
   * the composition root wires by default. Nothing is recorded in that mode —
   * which is the point: it is the only way to observe the default itself.
   */
  readonly injectSuggest?: boolean;
}

/**
 * Run the CLI in process and record what it did.
 *
 * `start` records and *succeeds* rather than rejecting, so "nothing was bound"
 * is asserted by `served` being empty rather than by an exit code that a
 * rejection would have produced for its own reasons.
 */
export async function observeRun(
  argv: readonly string[],
  options: ObserveOptions = {},
): Promise<RunObservation> {
  const scans: string[] = [];
  const scanFlags: (readonly string[])[] = [];
  const served: string[] = [];
  const counts = { launched: 0, signals: 0 };
  let out = '';
  let err = '';

  const body = options.suggest ?? ((target: string, flags: readonly string[]) =>
    suggestInvocations(target, { flags }));

  const suggest = (target: string, flags: readonly string[]): readonly string[] => {
    scans.push(target);
    scanFlags.push(flags);
    return body(target, flags);
  };

  const code = await run(argv, {
    start: (startOptions: { readonly projectRoot?: unknown }) => {
      served.push(String(startOptions.projectRoot));
      return Promise.resolve(stubHandle());
    },
    launch: () => {
      counts.launched += 1;
      return Promise.resolve({ opened: true as const, command: 'stub' });
    },
    onSignal: () => {
      counts.signals += 1;
    },
    stdout: (text) => {
      out += text;
    },
    stderr: (text) => {
      err += text;
    },
    ...(options.injectSuggest === false ? {} : { suggest }),
  });

  return {
    code,
    out,
    err,
    scans,
    scanFlags,
    served,
    launched: counts.launched,
    signals: counts.signals,
  };
}
