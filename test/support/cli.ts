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
import { digestOf } from '../../src/domain/snapshot.ts';
import type { InventoryView } from '../../src/render/inventory.ts';

/**
 * A synthetic absolute root. Fixed rather than `process.cwd()` so a test's
 * expectations do not change with the directory it is run from, and chosen to
 * look nothing like this repository so a path leaking from the real filesystem
 * into an assertion is visible.
 */
export const STUB_PROJECT_ROOT = '/tmp/bmad-dash-test-project';

/**
 * The view for a project the pass found nothing in.
 *
 * Shared because `StartServerOptions.inventory` is required, and the twenty-odd
 * tests that bind a socket to ask about `Host` handling, methods and shutdown
 * have nothing to say about content. Held here rather than spelled inline in
 * each of them for this file's own reason: a field added to `InventoryView`
 * should be a compile error in one place, not stubbed faithfully in twenty and
 * forgotten in the twenty-first.
 *
 * It is a *real* state and not a placeholder — `artifactCount: 0` renders the
 * index's `A BMAD project, with no artifacts yet.` — so a test using it still
 * serves a page that says something true.
 */
export const EMPTY_INVENTORY: InventoryView = {
  complete: true,
  artifactCount: 0,
  namesLeftOut: 0,
  aliases: [],
  groups: [],
  // Arbitrary but fixed, on `FULL_INVENTORY_VIEW`'s own reasoning: this
  // fixture's whole point is having nothing to say about content, and the real
  // derivation is asserted over a live pass, not over this stub.
  snapshotId: digestOf(['test/support/cli.ts', 'EMPTY_INVENTORY']),
};

/** The supplier form `StartServerOptions.inventory` takes. */
export const emptyInventory = (): InventoryView => EMPTY_INVENTORY;

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
  /**
   * The view each `start` call's supplier produced, in order.
   *
   * **Recorded because nothing recorded it, and that was the most serious hole
   * in Story 1.12.** Every in-process test stubs `start`, and this observer
   * captured only `projectRoot` — so replacing the projected view with
   * `{ complete: true, artifactCount: 0, groups: [] }` in the composition root,
   * while still walking the tree, left the whole suite green. The tool would
   * have served `A BMAD project, with no artifacts yet.` for every real
   * project, the story's entire payload absent, with nothing red.
   *
   * It is the identical shape `test/server.test.ts` already records for the
   * root — "handing the server a different root left it saying the right thing
   * while serving the wrong project, with the whole suite green" — and the
   * assertion added to close that one had no equivalent for this option.
   *
   * The supplier is **called** here rather than stored, because from Story 1.12
   * `inventory` is a function invoked per request: storing it would record that
   * *something* was passed and not what a page would show.
   */
  readonly inventories: readonly InventoryView[];
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
  const inventories: InventoryView[] = [];
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
    start: (startOptions: {
      readonly projectRoot?: unknown;
      readonly inventory?: () => InventoryView;
    }) => {
      served.push(String(startOptions.projectRoot));
      const supplier = startOptions.inventory;
      if (supplier !== undefined) inventories.push(supplier());
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
    inventories,
    launched: counts.launched,
    signals: counts.signals,
  };
}
