#!/usr/bin/env node
/**
 * Composition root.
 *
 * Parses the arguments, resolves the target, starts the inbound HTTP
 * adapter and reports the URL actually bound. stdout carries the URL and
 * nothing else; every diagnostic goes to stderr.
 */

import { parseArgs } from 'node:util';
import { resolve, isAbsolute, relative as relativePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MAX_PORT,
  startServer,
  type ServerHandle,
  type StartServerOptions,
} from '../adapters/http/server.ts';
import { resolveRealPath } from '../adapters/fs/realpath.ts';
import { ConfinedReader } from '../adapters/fs/read.ts';
import { errorCode } from '../domain/thrown.ts';
import { openBrowser, type LaunchResult } from '../adapters/browser/open.ts';
import { resolveLocation } from './location.ts';
import { suggestInvocations } from './suggest.ts';
import {
  OUTPUT_DIRECTORY,
  takeInventory,
  type Inventory,
  type InventoryEntry,
} from './inventory.ts';
import type {
  AliasReport,
  ArtifactRow,
  FamilyGroup,
  GroupNote,
  InventoryView,
  RowIdentity,
  RowReadability,
  RowRunFacts,
  StoryLocationReport,
} from '../render/inventory.ts';
import { toPlatform, type CanonicalPath } from '../adapters/fs/paths.ts';
import { digestOf, type SnapshotId } from '../domain/snapshot.ts';

const USAGE = 'Usage: bmad-dash [path] [options]';
const ACCEPTED =
  'Accepted arguments: one optional path to a BMAD project, and --no-open, --port <n>, ' +
  '-h/--help, --version.';

/**
 * The lowest port a socket can be asked for. `0` is meaningful — it asks the OS
 * for a free one — so the range starts there rather than at 1. The top of the
 * range is `MAX_PORT`, imported from the adapter that does the binding rather
 * than spelled a second time here.
 */
const MIN_PORT = 0;

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

  // An explicit empty argument is misuse, not a request for the default.
  // `resolve(cwd, '')` returns `cwd`, so `bmad-dash ""` — an unset variable in a
  // wrapper script's `bmad-dash "$TARGET"` — inspected whatever directory the
  // script happened to be run from and reported it as the project the caller
  // asked for. Absent means the current directory; empty means a mistake.
  //
  // Only the empty string. `" "` resolves to a directory literally named one
  // space, which is a legal path and is not the working directory, so refusing
  // it would refuse something the caller could actually have meant.
  const given = positionals[0];
  if (given === '') {
    return {
      ok: false,
      message:
        'Empty path argument. Omit it to target the current directory.\n' +
        `${ACCEPTED}\n${USAGE}`,
    };
  }

  const projectRoot = resolve(cwd, given ?? '.');
  if (!isAbsolute(projectRoot)) {
    // Unreachable via `resolve`, asserted because everything downstream trusts it.
    return { ok: false, message: `Could not resolve an absolute path for the target.\n${USAGE}` };
  }
  return { ok: true, projectRoot, open: values['no-open'] !== true, port };
}

// ---------------------------------------------------------------------------
// Projecting the pass onto the surface
// ---------------------------------------------------------------------------

/**
 * Which tile a row goes on, in the view's own vocabulary.
 *
 * Taken off `FamilyGroup` rather than imported from `src/domain/identity.ts`,
 * and that is not a stylistic dodge: the architecture gate reads specifiers
 * with no `import type` awareness, so a type-only import of `Family` would put
 * the composition root in the authority's exact importer set — a set that
 * exists to make every consumer of the identity authority a deliberate edit.
 * This projection consumes a recorded verdict and needs no family *vocabulary*
 * of its own, so it borrows the one the view already declares.
 */
type GroupFamily = FamilyGroup['family'];

/**
 * The family the story location is reported at (`EXPERIENCE.md:168`).
 *
 * A literal, checked against `GroupFamily` by the annotation, so a renamed
 * family fails the typecheck here rather than silently detaching the note.
 */
const STORY_FAMILY: GroupFamily = 'story';

/**
 * The `Inventory` as the render layer's own view.
 *
 * **Why the projection is here.** `ARCHITECTURE-SPINE.md` gives `src/render/`
 * "domain types only", and `Inventory` is not one — it references
 * `CanonicalPath` and `WalkEntry`, which the purity gate forbids the domain
 * importing, so it cannot move to `src/domain/` either. The composition root is
 * the layer permitted to see both sides, so this is where the two meet.
 * `test/architecture.test.ts` asserts the other half of that: `src/render/`
 * imports nothing from `src/cli/`.
 *
 * **What it decides, and what it refuses to.** It decides *what appears* —
 * which entries become rows, which family each row is placed under, and which
 * project-level facts reach the surface at all. It decides neither order: rows
 * keep the pass's own walk order untouched, and the order families appear in is
 * the render layer's `FAMILIES` walk. (An earlier version of this paragraph
 * claimed "the order of both", which was wrong on the day it was written and is
 * the kind of claim a reader would have taken on trust.) It decides no wording
 * either: every state word and every sentence is looked up in the render layer
 * from the vocabulary table that owns it, so a display string cannot be
 * invented on this side of the seam.
 *
 * **What it deliberately drops.** Every hand-written `reason` on the model —
 * `StoryLocation.reason`, `Readability.reason`, `WalkEntry.reason`,
 * `Attempt.reason`, `Skip.reason`, `Alias.reason`, `Listing.reason`,
 * `UnmeasuredRunFacts.reason`, `Parts.reason` — is left where it was recorded.
 * No normative document backs any of them, so none may be rendered; what
 * crosses instead is the typed state and stage beside each one, which is the
 * whole of "naming what failed and at which stage".
 */
export function projectInventory(inventory: Inventory): InventoryView {
  const byFamily = new Map<GroupFamily, ArtifactRow[]>();
  const place = (family: GroupFamily, row: ArtifactRow): void => {
    const held = byFamily.get(family);
    if (held === undefined) byFamily.set(family, [row]);
    else held.push(row);
  };

  for (const entry of inventory.entries) {
    // **The output folder itself is not an artifact.** It is what was walked,
    // not something found in it — the same reasoning `Inventory.startEntry`
    // records for the project root one level up — and no artifact root
    // contains it, so the authority reports it `unidentified`. Listed, it puts
    // a permanent "Not identified" row on every project for the tool's own
    // layout, which is the noise `Shape: 'container'` was introduced to stop
    // for the seven family directories and which nothing had stopped for their
    // parent. It also made a marker-only project report one artifact, so the
    // index's `A BMAD project, with no artifacts yet.` was unreachable.
    //
    // Compared case-insensitively, because that is how the pass recognizes the
    // directory in the first place: on a case-insensitive volume the folder
    // BMAD created as `_bmad-output` can come back spelled otherwise. **Both**
    // sides are lowered: the constant is spelled lowercase today, so lowering
    // one side happened to work and would stop working the moment it was not.
    if (entry.entry.relative.toLowerCase() === OUTPUT_DIRECTORY.toLowerCase()) continue;
    place(familyOf(entry), {
      path: entry.entry.relative,
      identity: rowIdentity(entry),
      readability: rowReadability(entry),
      interpretation: entry.interpretation,
      runFacts: entry.runFacts.map(rowRunFacts),
    });
  }

  // A group per family that holds something, plus the story family whether or
  // not it does — it carries the location note. Which families exist, in what
  // order, and what a family with no artifacts says are display decisions, and
  // they belong to the layer that has the labels: `inventoryTiles` walks
  // `FAMILIES` and fills in every family this projection did not emit. That is
  // also what keeps the composition root from importing the identity authority
  // for a list of names.
  const keys = new Set<GroupFamily>([...byFamily.keys(), STORY_FAMILY]);
  const groups: FamilyGroup[] = [];
  for (const family of keys) {
    groups.push({ family, rows: byFamily.get(family) ?? [], notes: notesFor(family, inventory) });
  }

  // **Narrower than `Inventory.complete`, deliberately — with one exception
  // that the narrowing argument does not reach.** The walk's own `complete`
  // also goes false for a single entry it could not read and for any name it
  // suppressed — facts that are already on the affected entry's own row.
  // Reporting them again as "the scan did not finish" would be false: the
  // scan did finish. What this claims is only the thing the row cannot say,
  // which is that something is missing from the list *entirely* — a bound was
  // reached, or a name was left out past a record cap and nobody can name it.
  //
  // **`startEntry` is that exception, because it is the one entry with no
  // row.** `Inventory` keeps the project root out of `entries` on purpose
  // (the root is what was walked, not something found in it), so "it is on
  // the affected entry's own row" is true of everything here except the root
  // itself. Measured: over a root the walk could not enumerate, the pass said
  // `complete: false` with `startEntry: unreadable`, this returned `true`, and
  // the page reported a finished scan of an empty project — a project the tool
  // could not open, presented as one it read fine. Pinned from both sides in
  // `test/render/inventory.test.ts`.
  const complete =
    inventory.startEntry.state === 'present' &&
    inventory.truncations.length === 0 &&
    inventory.skippedNotRecorded === 0 &&
    inventory.suppressedNotRecorded === 0;
  // The rows actually placed, not `entries.length`: the output folder is
  // excluded above, and a count that included it would contradict the list
  // the reader can see.
  const artifactCount = groups.reduce((total, group) => total + group.rows.length, 0);
  // The skip policy's whole tally, recorded names and the overflow count
  // together, because the reader's question is how many names were not
  // examined and neither half answers it alone.
  const namesLeftOut = inventory.skipped.length + inventory.skippedNotRecorded;

  // Everything the surface renders, assembled once — and then digested whole,
  // rather than the identity being folded in from a chosen handful of these
  // fields. See `snapshotIdOf`.
  const content: ViewContent = {
    complete,
    artifactCount,
    namesLeftOut,
    aliases: inventory.aliases.map(aliasReport),
    groups,
  };
  return { ...content, snapshotId: snapshotIdOf(inventory.root, content) };
}

/**
 * The view minus its own identity — everything the digest is taken over.
 *
 * Spelled as `Omit` rather than as a second interface so it cannot drift: a
 * field added to `InventoryView` is a field this type gains, and therefore a
 * field the identity covers, with no edit here and no audit to forget.
 */
export type ViewContent = Omit<InventoryView, 'snapshotId'>;

/**
 * The view's own identity (AD-17), derived from the facts this projection just
 * built rather than minted.
 *
 * **Everything `renderPage` is given, and not a chosen subset of it.**
 * `renderPage(root, view)` is a pure function of exactly two arguments, so
 * digesting both is what makes "anything that changes what is rendered changes
 * the id" true *by construction*. Iteration 1 of this story enumerated three
 * per-row fields plus three scalars and argued the rest never reached the page.
 * That argument was false — an ambiguous verdict's second reading, the run
 * facts, the aliases, `readability.stage`, the interpretation state, a group's
 * notes and a group's family all render — and, worse, nothing failed when the
 * digest's input was reduced to the artifact count alone. An enumeration also
 * has to be re-audited every time the view gains a field, and a skipped audit
 * is silent. A structural walk carries no such obligation.
 *
 * **The root is the second argument, and iteration 2 left it out.** It is not
 * on the view — this projection drops `Inventory.root` — yet `renderPage`
 * renders it as the project's name and its path (`src/render/chrome.ts`), so a
 * digest over the view alone gave two projects at different paths with
 * identical inventories one identity for two visibly different pages. The
 * *canonical* root is what is folded in, while the page shows
 * `toPlatform(root)`: that is a deterministic function of this one, so the two
 * distinguish exactly the same roots.
 *
 * **What this id does and does not track, measured rather than reasoned.** It
 * is a digest of the *view*, so it moves when the view moves — a new artifact,
 * a changed verdict, a different row set. It does **not** move when a
 * document's bytes change: bodies are kept off the snapshot on purpose, and
 * verified end to end on 2026-09-04, editing a document's prose, its first
 * heading and its frontmatter title each left this id unmoved while only adding
 * an artifact moved it.
 *
 * So this is **not** a currency signal and must never be used as one. Story 2.2
 * owns "has what I am reading changed", and it reads the filesystem at the
 * moment of open precisely because this id cannot answer it. An earlier version
 * of this comment claimed any change anywhere in the project changes the id;
 * that was wrong, and it was the reasoning that made a parse cache keyed here
 * look sound. Story 2.1c would have built that cache and was cancelled.
 *
 * A thin wrapper over `digestOf` and deliberately so: it is the one place that
 * names *what* is digested, and it is exported so a test can build two pages
 * that render differently and compare their identities without going through a
 * filesystem that cannot produce such a pair on demand.
 */
export function snapshotIdOf(root: CanonicalPath, content: ViewContent): SnapshotId {
  return digestOf({ root, view: content });
}

/**
 * One suppressed spelling, as the surface reports it.
 *
 * `restored` and `reason` do not cross. The reason is hand-written and is on
 * this story's Never list; `restored` is about whether the name was put back
 * into its parent's *listing* for identification's benefit, which is a fact
 * about how the verdict was reached rather than about what the project holds.
 * What the reader needs is that the project holds this name and that the
 * artifact behind it is reported elsewhere — which is true either way.
 */
function aliasReport(alias: Inventory['aliases'][number]): AliasReport {
  return { name: alias.relative, reportedAt: alias.reportedAt };
}

/**
 * Which family's tile an entry belongs on.
 *
 * `undefined` for the two cases no single family claims, and they are different
 * facts the row itself states: an `unidentified` verdict resolved no family at
 * all, and an `ambiguous` verdict whose readings name two *families* is one the
 * tool declines to rank — so placing it under either would be the silent
 * resolution AD-4 and FR-73 forbid. An ambiguity over *shapes* of one family is
 * placed under that family, because every reading agrees on it.
 */
function familyOf(entry: InventoryEntry): GroupFamily {
  const verdict = entry.identity;
  if (verdict.outcome === 'identified') return verdict.family;
  if (verdict.outcome === 'unidentified') return undefined;
  const families = new Set(verdict.readings.map((reading) => reading.family));
  return families.size === 1 ? verdict.readings[0]?.family : undefined;
}

/** The recorded verdict, narrowed to what a row shows. */
function rowIdentity(entry: InventoryEntry): RowIdentity {
  const verdict = entry.identity;
  if (verdict.outcome === 'identified') {
    return {
      outcome: 'identified',
      shape: verdict.shape,
      confidence: verdict.confidence,
      resolvedAt: verdict.resolvedAt,
    };
  }
  if (verdict.outcome === 'ambiguous') {
    return {
      outcome: 'ambiguous',
      readings: verdict.readings.map((reading) => ({
        family: reading.family,
        shape: reading.shape,
      })),
      confidence: verdict.confidence,
      resolvedAt: verdict.resolvedAt,
    };
  }
  // FR-69's "naming which levels were attempted", in FR-8's order, which is the
  // order the authority records them in. The result and the `reason` beside each
  // one stay on the verdict: the index's sentence names levels.
  return { outcome: 'unidentified', attempted: verdict.attempted.map((at) => at.level) };
}

/**
 * The one signal a row shows, in AD-8's four states.
 *
 * `present` carries no stage — there is none in a read that finished — and the
 * type says so, which is why this is a branch rather than a spread.
 */
function rowReadability(entry: InventoryEntry): RowReadability {
  const readability = entry.readability;
  if (readability.state === 'present') return { state: 'present', stage: undefined };
  return { state: readability.state, stage: readability.stage };
}

/** One run-folder reading's facts, or the fact that none were measured. */
function rowRunFacts(facts: InventoryEntry['runFacts'][number]): RowRunFacts {
  if (facts.outcome !== 'measured') return { measured: false };
  return { measured: true, reuse: facts.reuse, dateSignal: facts.dateSignal };
}

/**
 * The project-level facts that belong on a family's tile.
 *
 * One so far, and `EXPERIENCE.md:168` decides both halves: the story location
 * is "reported at the artifact-family level, not as a signal state", and the
 * family it is reported at is `story`, because that is the family the value
 * locates. It is one record per pass rather than per entry, so it is attached
 * here rather than folded into a row.
 */
function notesFor(family: GroupFamily, inventory: Inventory): readonly GroupNote[] {
  if (family !== STORY_FAMILY) return [];
  return [{ kind: 'story-location', report: storyLocationReport(inventory) }];
}

/**
 * The recorded location, as one of the four things there is to say about it.
 *
 * **This is where `{ state: 'in-tree', path: undefined }` is resolved**, and it
 * has to be resolved somewhere: `StoryLocation` types the path as
 * `string | undefined` independently of the state, so the combination is
 * representable even though `src/domain/sprint.ts` fills a path for exactly
 * three states. Rendered, it fell through the surface's branches and reached a
 * reader as `Sprint view unavailable. in-tree`, which looks like a ninth
 * location state. Answered here it is `unavailable` carrying the state, which
 * is honest for an inconsistency nobody can interpret, and the render layer's
 * union no longer admits the pair at all.
 *
 * **The in-tree path is made project-relative.** Every other path on the
 * surface is, and `sprint.ts` records that printing the absolute project root
 * beside this value was a defect it already corrected once — so a
 * `Stories are at /home/someone/work/proj/docs/stories.` beside fifty rows of
 * `_bmad-output/…` was the same defect returning at the display layer. The
 * `out-of-tree` path is deliberately left **absolute**: FR-74's whole point is
 * saying where the value actually pointed, and a value outside the root has no
 * meaningful spelling relative to it.
 */
function storyLocationReport(inventory: Inventory): StoryLocationReport {
  const location = inventory.storyLocation;
  const path = location.path;
  if (location.state === 'in-tree' && path !== undefined) {
    return { kind: 'at', path: withinProject(inventory.root, path) };
  }
  if (location.state === 'out-of-tree' && path !== undefined) {
    return { kind: 'outside', path };
  }
  if (location.state === 'absent') return { kind: 'none' };
  return { kind: 'unavailable', state: location.state };
}

/**
 * A path inside the project, spelled the way every other path here is spelled.
 *
 * `/`-separated whatever the platform, project-root-relative, and `.` for the
 * root itself — the same three properties `WalkEntry.relative` has, so the two
 * spellings on one page cannot look like two different conventions. A pure
 * string projection: it resolves nothing and touches no filesystem, so the
 * rule that resolution happens once still holds.
 */
function withinProject(root: CanonicalPath, path: string): string {
  const within = relativePath(toPlatform(root), path);
  if (within === '') return '.';
  return within.split(sep).join('/');
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
  /**
   * The bounded suggestion scan, for the `not-a-project` refusal only.
   *
   * A seam because AD-9 rule 2 — "must never become a resolution path" — is
   * worth nothing as an intention. Injecting it lets a test substitute
   * something inert and observe that the *suggestions* change, that the root
   * reaching `start` does not, and that a **successful** resolution calls this
   * zero times — which is the only form of that rule anything can check. It
   * returns lines of text and its return value is written to stderr and
   * dropped; nothing below reads it.
   *
   * `flags` are the options the invocation already carried, so the suggested
   * command keeps them instead of silently asking the reader to retype.
   */
  readonly suggest?: (target: string, flags: readonly string[]) => readonly string[];
  /**
   * The snapshot pass, injected so its failure path is reachable.
   *
   * A seam for the reason `start` is one: the pass is built never to throw
   * (AD-7 makes every failure a typed value on the model), so the `catch` that
   * turns a thrown pass into `EXIT_FAILURE` had no test that could reach it —
   * a guard nobody had ever seen run. It also lets a test observe *when* the
   * pass happens relative to the signal handler and the bind, which is an
   * ordering this file argues at length and could not otherwise assert.
   *
   * Defaults to the real pass. It receives the confined reader for the
   * recognized root, so a substitute is handed the same single root AD-9
   * permits and cannot widen it.
   */
  readonly inventory?: (reader: ConfinedReader) => Inventory;
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
  const pass = dependencies.inventory ?? takeInventory;

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
    // FR-7: hand over the command rather than describe the problem — but only
    // for the one refusal a command answers. `absent`, `not-a-directory` and
    // `unreadable` are a typo, a file and a permissions problem respectively,
    // and "try running it over there" answers none of them. Branching on the
    // `Refusal` code rather than on the message text, so rewording a sentence
    // cannot silently switch the scan on or off.
    // Reconstructed from the parsed invocation rather than replayed from argv:
    // argv also holds the path being replaced, and `--port 3000 --port 4000`
    // last-wins means the raw text is not what the tool acted on anyway.
    const flags: string[] = [];
    if (!invocation.open) flags.push('--no-open');
    if (invocation.port !== 0) flags.push('--port', String(invocation.port));

    const suggest =
      dependencies.suggest ??
      ((target: string, carried: readonly string[]) =>
        suggestInvocations(target, { flags: carried }));
    const suggestions =
      location.reason === 'not-a-project' ? suggest(invocation.projectRoot, flags) : [];
    // A blank line between the refusal and the suggestions: the layout is the
    // caller's, so the scan itself returns content and no spacing.
    const detail = suggestions.length > 0 ? `\n\n${suggestions.join('\n')}` : '';
    stderr(`${location.message}${detail}\n`);
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

  /**
   * How a snapshot is taken (AD-3, AD-9) — and one taken now, to fail fast.
   *
   * **The supplier is what the server gets, and it is called per request.** AD-3
   * puts one immutable snapshot behind each page load, and the refresh control
   * is a link precisely because following it should build one. For one story
   * this closed over a single view for the socket's life, so the control was
   * inert while three comments and a test said otherwise; that is fixed in the
   * adapter, and this is the other half of the fix.
   *
   * **The eager call is the fail-fast check, and its position is load-bearing.**
   * After the shutdown handler, because the walk is the longest filesystem
   * operation in the run and a Ctrl-C during it must exit 0 rather than take
   * the default signal disposition — the window this file's ordering comment
   * measured at 4 of 25 runs. Before the bind, because a project the pass
   * cannot walk must stop the command while stopping is still cheap: nothing is
   * bound, nothing is announced, and the reader gets an exit code instead of a
   * 500 on their first page load. `test/cli/startup-order.test.ts` asserts both
   * halves of that position.
   *
   * The reader is built **once** and closed over, so every snapshot this run
   * produces is confined to the root the command recognized — the single root
   * AD-9 permits — and every read is resolved and confinement-checked at the
   * moment it happens.
   *
   * Caught, though the pass is built not to throw: AD-7 makes every failure a
   * typed value on the model, so an exception here is a defect rather than a
   * project shape. It still must not reach the user as a stack trace, and it is
   * a failure to start rather than a usage error — the invocation was fine.
   */
  const reader = new ConfinedReader(location.root);
  const snapshot = (): InventoryView => projectInventory(pass(reader));

  /**
   * One artifact's content, read on demand — the other half of what the server
   * needs, and the only read that happens per *page* rather than per scan.
   *
   * **`readText` is the supplier, not a wrapper around it.** AD-7 already makes
   * every read failure a typed value carrying a state, a stage and a reason, in
   * exactly the shape the artifact surface renders, so translating it here would
   * add a step whose only possible contribution is losing something —
   * `absent` flattened into `unreadable`, or the stage dropped. The reader was
   * measured sufficient for this story and deliberately not widened: it refuses
   * anything that is not a regular file *before* opening it (so a run folder,
   * a sharded-document directory and a FIFO are all answers rather than hangs),
   * refuses over `MAX_READ_BYTES` on the `stat` so nothing large is read at all,
   * and decodes with `fatal: true` so bytes that are not UTF-8 are a `decode`
   * failure rather than a page full of U+FFFD.
   *
   * **The confinement throw is turned into a value here, and only here.**
   * `resolveWithin` throws for a path outside the permitted root, which is right
   * for a reader — but on this path it would cost the reader the whole page for
   * a fact the page can state. Nothing should be able to reach it: the argument
   * is a key out of the snapshot's own rows and the walk only produces paths
   * inside the root. It is answered rather than asserted because "unreachable,
   * so throw" is how a 500 arrives for a symlink that changed under the tool
   * between the scan and the page load.
   *
   * **Bodies stay off the snapshot.** This closure is not called by
   * `projectInventory` and its result never reaches `snapshotIdOf`, which
   * digests the whole view — so a project's text is not in any per-request
   * identity, and a page load reads one file rather than every file.
   */
  const body: StartServerOptions['body'] = (path) => {
    try {
      return reader.readText(path);
    } catch (error: unknown) {
      return {
        ok: false,
        state: 'unreadable',
        stage: 'confinement',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };
  try {
    snapshot();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Could not take the inventory of ${toPlatform(location.root)}: ${message}\n`);
    return EXIT_FAILURE;
  }

  try {
    handle = await start({
      projectRoot: location.root,
      inventory: snapshot,
      body,
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
