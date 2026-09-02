/**
 * The invocation that would have worked.
 *
 * FR-7 is modelled on `git push` reporting a missing upstream: it does not
 * describe the problem, it hands over the command. So when — and only when —
 * the target is a real directory that simply is not a BMAD project, a bounded
 * scan looks for the projects nearby and the refusal names each one as an exact
 * invocation.
 *
 * **AD-9 rule 2, which is the whole reason this file exists rather than living
 * in `location.ts`: the scan must never become a resolution path.** It runs in
 * `src/cli/`, it produces display strings, and it returns nothing any other
 * layer consumes — no path, no root, no reader. Resolution stays what AD-9 says
 * it is: the target itself, recognized by both markers, with no walk in either
 * direction. That distinction is observable rather than merely intended:
 * `test/architecture.test.ts` substitutes something inert for this function and
 * asserts that the suggestions change, that the root that gets served does not,
 * and that a *successful* resolution calls the scan zero times.
 *
 * **The candidate test is `resolveLocation` itself.** Not a re-implementation of
 * "does it hold both markers" — the same function, called as a predicate and
 * asked nothing else. A second copy of the recognition rule would be free to
 * drift from the first, and the failure mode is the worst kind: a suggested
 * invocation that the tool then refuses. Every verdict is discarded; the `root`
 * one carries is read only for its spelling, so a candidate reached through a
 * symlink is offered as its real path, the way every other path here is.
 *
 * **The command is spelled to match how the tool was actually invoked.** FR-45
 * distributes this for `npx` execution "without prior installation", so for the
 * primary distribution mode a bare `bmad-dash …` is `command not found` — a
 * refusal whose headline feature is a command the reader cannot run, which is
 * the exact failure FR-7 exists to remove. See `commandSpelling`.
 *
 * **Four bounds, and every one of them reports when it bites.** FR-70 gives the
 * shape — the full ancestor chain, plus `MAX_DEPTH_BELOW` levels below the
 * target — and three caps keep a failure message from costing more than the run
 * it is refusing: `MAX_CHILDREN` per directory, `MAX_PROBES` in total, and
 * `MAX_SUGGESTIONS` printed. A scan that hit any of them, or that skipped a
 * directory it could not read, says so: "nothing disappears, name what failed"
 * is this project's invariant, and a suggestion list that silently dropped the
 * candidate you were looking for is worse than one that admits it stopped.
 *
 * **Descent stays inside the target.** Depth counts *hops*, so a child
 * symlinked to `/` or to `$HOME` would otherwise be enumerated and could yield
 * "candidates" nowhere near the target. Every directory the scan descends into
 * or offers must resolve inside the target, so a link can shortcut deeper into
 * your own tree but can never carry the scan out of it. Ancestors are the
 * deliberate exception: they are named by walking `dirname`, which cannot
 * escape anywhere.
 *
 * This is **not** the cycle-detecting artifact-tree walk deferred for the story
 * before 1.7, and must not grow into it. It reads no file content, keys no
 * identity, and enumerates nothing anything else can see.
 */

import { dirname, join } from 'node:path';

import { listChildDirectories } from '../adapters/fs/list.ts';
import {
  canonical,
  contains,
  identical,
  toPlatform,
  type CanonicalPath,
} from '../adapters/fs/paths.ts';
import { MARKERS, markerList, resolveLocation } from './location.ts';

/**
 * The bare command, as `package.json` installs it.
 *
 * `test/cli/suggest.test.ts` pins it against the manifest's `bin` key, and
 * pins the npx spelling against the package `name`, since a suggestion naming
 * a command that is not installed is worse than no suggestion at all.
 */
export const COMMAND = 'bmad-dash';

/**
 * How far below the target the scan looks. Two, per FR-70.
 *
 * One level answers "I am standing in the parent of my project"; two answers
 * "I am standing in my checkouts folder and the project is one directory
 * inside one of them", which is the shape a monorepo or a `src/` wrapper
 * produces. Three starts scanning the user's whole home directory for a
 * message, which is not worth a message.
 */
export const MAX_DEPTH_BELOW = 2;

/**
 * How many child directories of any one directory the scan will look at.
 *
 * A bound on a failure message, not a considered budget. Both ends matter and
 * the suite pins both: below about twenty this silently drops candidates out
 * of an ordinary folder of checkouts, and much above this the refusal starts
 * costing more than the run it is refusing.
 */
export const MAX_CHILDREN = 128;

/**
 * How many directories the scan will examine in total.
 *
 * `MAX_CHILDREN` alone bounds each *listing*, not the work: at two levels it
 * admits 128 + 128 × 128 ≈ 16,500 probes, each a `resolveLocation` — a
 * `realpath` plus up to three stats. Measured at 2.3s on tmpfs, and a cold
 * cache or a network mount is far worse, which flatly contradicts the reason
 * the per-directory cap exists. This is the cap on the total.
 */
export const MAX_PROBES = 512;

/**
 * How many invocations the refusal will print.
 *
 * "Lists every candidate found" is right about not *choosing* one, and wrong
 * about volume: a folder of two hundred checkouts scrolls the answer off the
 * terminal. The count found is always stated, so the elision is visible.
 */
export const MAX_SUGGESTIONS = 10;

/** How many unreadable directories the report names before it counts them. */
export const MAX_SKIPPED_NAMED = 3;

// ---------------------------------------------------------------------------
// Load-bearing strings
// ---------------------------------------------------------------------------

/**
 * The five sentences this file puts in front of a user, verbatim from
 * `EXPERIENCE.md`'s string index, `<placeholder>` spellings and all.
 *
 * Held as constants for the reason `src/render/chrome.ts` holds
 * `SIGNAL_NOT_CHECKED`: UX-DR17 requires the index's wording, and a literal in
 * source that merely *happens* to match is a second copy of the same belief,
 * free to drift the moment either side is edited. `test/cli/suggest.test.ts`
 * asserts each of these against the document's own table.
 *
 * The clause fragments below them are the variable part of `SCAN_INCOMPLETE`'s
 * `<reasons>` — the assembled sentence is the indexed string, not each piece.
 */
export const ONE_CANDIDATE = 'A BMAD project is nearby. Run this instead.';
export const MANY_CANDIDATES = '<n> BMAD projects are nearby. Run one of these instead.';
export const NO_CANDIDATE =
  'No directory holding <markers> is in the ancestors of <path>, or within <n> levels below it.';
export const SCAN_INCOMPLETE = 'The scan did not finish, so a project may be missing: <reasons>.';
export const CANDIDATES_ELIDED = '<n> more not listed.';

/**
 * Substitute an index string's placeholders, refusing to emit an unfilled one.
 *
 * The throw is the point: `<n>` reaching a terminal is the visible half of
 * having edited the index and not the call, and a message that ships a literal
 * angle bracket is the kind of defect a reader reports rather than a suite.
 */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  const filled = template.replace(/<([a-z]+)>/g, (whole, key: string) => values[key] ?? whole);
  const unfilled = /<[a-z]+>/.exec(filled);
  if (unfilled !== null) {
    throw new Error(`unfilled placeholder ${unfilled[0]} in ${JSON.stringify(template)}`);
  }
  return filled;
}

// ---------------------------------------------------------------------------
// How the tool was invoked
// ---------------------------------------------------------------------------

/** Which spelling of the command the reader can actually run. */
export type Invoked = 'npx' | 'installed' | 'unknown';

export interface CommandSpelling {
  /** The command, spelled for a terminal: `npx bmad-dash` or `bmad-dash`. */
  readonly command: string;
  /** Why it is spelled that way — reported so a test can pin each branch. */
  readonly how: Invoked;
}

/** Path segments of `entry`, whichever separator the platform used. */
function segments(entry: string): string[] {
  return entry.split(/[\\/]/).filter((part) => part !== '');
}

/**
 * Decide how to spell the command, from the environment this process was given.
 *
 * Three branches, and the third is a decision rather than a gap:
 *
 *   - **npx.** `npx` and `npm exec` stage the package under a `_npx` directory
 *     and set `npm_command=exec`, so either signal is conclusive. The `_npx`
 *     segment is checked *first*, because an npx-staged binary also sits in a
 *     `node_modules/.bin` that would otherwise read as an install.
 *   - **installed.** The entry point is the command itself — a global or
 *     project `bin` shim, reached by name — so the bare name is on PATH.
 *   - **unknown**, which is `node dist/cli/index.js` and anything else, spelled
 *     with `npx`. That is the fallback because it is the spelling that works in
 *     *both* worlds: `npx bmad-dash` runs an installed copy when there is one
 *     and fetches it when there is not, whereas a bare `bmad-dash` guessed
 *     wrongly is `command not found` — the failure this whole file exists to
 *     remove, reintroduced one layer up.
 *
 * Pure: everything it reads is an argument, so all three branches are testable
 * without touching the real process.
 */
export function commandSpelling(
  env: Readonly<Record<string, string | undefined>>,
  entry: string | undefined,
): CommandSpelling {
  const parts = entry === undefined ? [] : segments(entry);

  if (
    parts.includes('_npx') ||
    env.npm_command === 'exec' ||
    (env.npm_config_user_agent ?? '').includes('npx/')
  ) {
    return { command: `npx ${COMMAND}`, how: 'npx' };
  }

  const last = parts.at(-1) ?? '';
  const bare = last.replace(/\.(cmd|exe|ps1)$/i, '');
  if (bare === COMMAND || parts.includes('.bin')) {
    return { command: COMMAND, how: 'installed' };
  }

  return { command: `npx ${COMMAND}`, how: 'unknown' };
}

/**
 * Spell `value` so a shell hands it back unchanged.
 *
 * Reproduced before it was fixed: a project under `…/My Projects/proj` was
 * offered unquoted, the shell split it on the space, and the tool refused its
 * own suggestion. A pasteable command is the entire deliverable here, so this
 * is not cosmetic.
 *
 * POSIX shells take single quotes, with the one escape they need for an
 * embedded quote; `cmd.exe` has no single-quote form at all and treats `"` as
 * the quote, which is also why a Windows path can never contain one.
 */
export function shellQuote(value: string, platform: string = process.platform): string {
  if (platform === 'win32') {
    return /^[A-Za-z0-9_@%+=:,.\\/-]+$/.test(value) ? value : `"${value}"`;
  }
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.split("'").join("'\\''")}'`;
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

/**
 * Whether the scan will descend into a child called `name`.
 *
 * **Descent only, and the asymmetry is deliberate.** `node_modules` and
 * dot-directories are excluded on the way *down* because a project inside
 * either is not the user's work — a dependency's fixtures, a tool's cache —
 * and the two together are where a scan's time would otherwise go. Going *up*
 * they are not excluded, by user decision: you are standing inside an
 * ancestor, so it is not somewhere the tool is sending you speculatively, and
 * naming the project you are already inside beats hiding it on principle.
 *
 * The two marker directories are excluded too. The target is not a project, so
 * at most one of them is even there; descending into BMAD's own toolchain or
 * output looking for a *sibling* project is wasted work, and a marker pair
 * nested inside one would be offered as a candidate it has no business being.
 */
function worthDescending(name: string): boolean {
  if (name === 'node_modules' || name.startsWith('.')) return false;
  return !MARKERS.includes(name as (typeof MARKERS)[number]);
}

export interface SuggestOptions {
  /**
   * Flags the user typed, repeated after the path.
   *
   * `bmad-dash --port 8080 ../wrong` used to suggest `bmad-dash /right`,
   * quietly dropping options the reader would have to remember to retype.
   */
  readonly flags?: readonly string[];
  /** The command spelling; defaults to this process's own invocation. */
  readonly command?: string;
  /** Total directories the scan may examine; defaults to `MAX_PROBES`. */
  readonly budget?: number;
}

/**
 * Lines to append to the `not-a-project` refusal for `target`.
 *
 * Display strings only, without the blank line that separates them from the
 * refusal above — the caller owns the layout of its own message. Never empty:
 * finding nothing is itself the answer to "where should I have run this", and
 * silence would leave a reader wondering whether the scan ran.
 *
 * Only ever called for `not-a-project`. A mistyped path, a file given where a
 * directory belongs, a directory the tool is denied and a marker that resolves
 * out of its own tree are none of them answered by "try running it over
 * there", and the caller — `src/cli/index.ts` — branches on the `Refusal` code
 * rather than on the wording of the message.
 */
export function suggestInvocations(
  target: string,
  options: SuggestOptions = {},
): readonly string[] {
  const root = canonical(target);
  const shown = toPlatform(root);
  const command =
    options.command ?? commandSpelling(process.env, process.argv[1]).command;
  const budget = options.budget ?? MAX_PROBES;
  const flags = options.flags ?? [];

  const candidates: string[] = [];
  // Canonical paths already looked at. The target starts in it because it has
  // just been refused, and because a symlinked child pointing back at it must
  // not be offered as somewhere else to try. This set is also what makes a link
  // cycle below the target terminate without a repeated candidate: the walk is
  // depth-bounded anyway, so the set is about not saying the same thing twice.
  const seen = new Set<string>([root]);
  /** Directories that could not be listed, named in the report. */
  const skipped: string[] = [];
  /** How many directories held more children than `MAX_CHILDREN`. */
  let wide = 0;
  let probes = 0;
  let exhausted = false;

  /** Look at `directory` once, and remember it as a candidate if it is one. */
  const visit = (directory: CanonicalPath): 'new' | 'seen' | 'exhausted' => {
    if (seen.has(directory)) return 'seen';
    if (probes >= budget) {
      exhausted = true;
      return 'exhausted';
    }
    seen.add(directory);
    probes += 1;
    const found = resolveLocation(toPlatform(directory));
    // `found.root` rather than `directory`: identical in practice, and reading
    // it from the verdict keeps the spelling that recognition itself decided.
    // Every other verdict — including a marker that resolves out of its own
    // tree, which is its own refusal — simply is not a candidate.
    if (found.ok) candidates.push(toPlatform(found.root));
    return 'new';
  };

  // The ancestor chain, by stat alone — a parent's name is already known, so
  // there is nothing to list. `dirname` fixes at the filesystem root, which is
  // what ends the loop, and cannot leave the tree it is climbing.
  let below: CanonicalPath = root;
  for (;;) {
    const parent = canonical(dirname(toPlatform(below)));
    if (identical(parent, below)) break;
    if (visit(parent) === 'exhausted') break;
    below = parent;
  }

  // Then downward, breadth-first, to the depth bound. A directory that cannot
  // be listed contributes nothing and stops nothing — it is recorded and the
  // scan carries on.
  let level: CanonicalPath[] = [root];
  for (let depth = 1; depth <= MAX_DEPTH_BELOW && !exhausted; depth += 1) {
    const next: CanonicalPath[] = [];
    for (const directory of level) {
      if (exhausted) break;
      const listing = listChildDirectories(toPlatform(directory), MAX_CHILDREN, worthDescending);
      if (!listing.ok) {
        skipped.push(toPlatform(directory));
        continue;
      }
      if (listing.truncated) wide += 1;
      for (const name of listing.directories) {
        const child = canonical(join(toPlatform(directory), name));
        // Depth counts hops, so containment is what keeps "two levels below the
        // target" true of a symlinked child. A link may shortcut deeper into the
        // target's own tree; it may not carry the scan out of it.
        if (!contains(root, child)) continue;
        const outcome = visit(child);
        if (outcome === 'exhausted') break;
        if (outcome === 'new') next.push(child);
      }
    }
    level = next;
  }

  return report({ shown, command, flags, candidates, skipped, wide, exhausted });
}

/** Why a scan is incomplete, in the order the report states them. */
function reasons(skipped: readonly string[], wide: number, exhausted: boolean): string[] {
  const clauses: string[] = [];
  if (wide > 0) {
    clauses.push(
      `${String(wide)} ${wide === 1 ? 'directory holds' : 'directories hold'} more than ` +
        `${String(MAX_CHILDREN)} subdirectories`,
    );
  }
  if (exhausted) {
    clauses.push(`it stopped after examining ${String(MAX_PROBES)} directories`);
  }
  if (skipped.length > 0) {
    const named = skipped.slice(0, MAX_SKIPPED_NAMED).join(', ');
    const rest = skipped.length - Math.min(skipped.length, MAX_SKIPPED_NAMED);
    clauses.push(
      `${String(skipped.length)} could not be read (${named}${rest > 0 ? `, and ${String(rest)} more` : ''})`,
    );
  }
  return clauses;
}

/** Turn what the scan found into the lines the refusal appends. */
function report(state: {
  readonly shown: string;
  readonly command: string;
  readonly flags: readonly string[];
  readonly candidates: readonly string[];
  readonly skipped: readonly string[];
  readonly wide: number;
  readonly exhausted: boolean;
}): readonly string[] {
  const { shown, command, flags, candidates, skipped, wide, exhausted } = state;
  const lines: string[] = [];
  const tail = flags.map((flag) => shellQuote(flag)).join(' ');

  if (candidates.length === 1) {
    lines.push(ONE_CANDIDATE, '');
  } else if (candidates.length > 1) {
    lines.push(fill(MANY_CANDIDATES, { n: String(candidates.length) }), '');
  } else {
    lines.push(
      fill(NO_CANDIDATE, {
        markers: markerList(),
        path: shown,
        n: String(MAX_DEPTH_BELOW),
      }),
    );
  }

  for (const candidate of candidates.slice(0, MAX_SUGGESTIONS)) {
    lines.push(`    ${command} ${shellQuote(candidate)}${tail === '' ? '' : ` ${tail}`}`);
  }
  const elided = candidates.length - Math.min(candidates.length, MAX_SUGGESTIONS);
  if (elided > 0) lines.push('', fill(CANDIDATES_ELIDED, { n: String(elided) }));

  const why = reasons(skipped, wide, exhausted);
  if (why.length > 0) lines.push('', fill(SCAN_INCOMPLETE, { reasons: why.join('; ') }));

  return lines;
}
