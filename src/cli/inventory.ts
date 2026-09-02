/**
 * The pass: walk the artifact tree, read what a level needs, ask the authority.
 *
 * A thin composition and nothing more. It owns three things the domain cannot
 * and the walk must not:
 *
 *   1. **The skip policy.** `WalkOptions.exclude` is mechanism; the names to
 *      skip are BMAD-project policy, which `src/adapters/fs/walk.ts` says in
 *      its own header belongs to this story. Every skip is *recorded*, up to a
 *      cap, because an exclusion invisible to the caller silently shortens the
 *      inventory whose whole purpose is that nothing disappears from it.
 *   2. **Reading, and only where a level needs it.** `Candidate.content` is a
 *      function the domain calls, so a file whose family level 1 resolved from
 *      its location is never opened. That is not a micro-optimization: read
 *      eagerly, this pass pulled up to `maxEntries` × `MAX_READ_BYTES` through
 *      a synchronous decoder and discarded almost all of it, and every PNG in a
 *      mockups folder came back as "not valid UTF-8".
 *   3. **Children, without a second enumeration.** A directory's child names
 *      come from the walk's own entries rather than a fresh `childrenOf` call:
 *      the walk already resolved and confined every one of them, and asking
 *      again would probe the whole tree twice and could disagree with the list
 *      the inventory is actually built from.
 *
 * It decides nothing about identity. AD-4 puts that in exactly one domain
 * module, and `test/architecture.test.ts` asserts the importer sets on both
 * sides so a second derivation cannot appear quietly.
 *
 * **Why it starts at the project root and then keeps only one child.** The
 * measured artifact roots all sit under `_bmad-output`, so starting the walk
 * there would be equivalent and cheaper — except that the walk reports paths
 * relative to its start, and every identity in this tool is keyed by a
 * project-root-relative path. Walking from the root and skipping its other
 * children costs one entry and a bounded list of recorded skips, and keeps one
 * spelling of a path across the whole tool.
 *
 * **There is no dot-name rule, deliberately.** The obvious policy — skip
 * anything beginning with `.` — would hide the `.memlog.md` inside every run
 * folder, which is a decision trail the oversight views read. Dot-directories
 * outside the output folder are already gone by the rule above, so a dot rule
 * would only ever have cost something.
 *
 * **Two known holes in "the children are what the directory holds", both
 * recorded rather than papered over:**
 *
 *   - A child the **skip policy removed** does not appear in the listing handed
 *     to the domain, and the listing is still reported `available`. Today the
 *     only such child below the output folder is a `node_modules`, so no family
 *     document and no `index.md` can be lost that way — but the listing is a
 *     *filtered* one and the domain is not told so. Making it `unavailable`
 *     instead would silence level 3 for a whole run folder because it happened
 *     to contain a dependency directory, which is the worse trade.
 *   - A child the walk **suppressed as a symlink alias** likewise vanishes,
 *     with `complete: true` and no truncation, because a second spelling of an
 *     already-seen real path is dropped by design (`walk.ts` explains why). An
 *     `index.md` that is an alias therefore does not make its directory read as
 *     a sharded document. The walk cannot report it without reintroducing the
 *     duplicate its cycle set exists to prevent, so this is stated here and in
 *     `deferred-work.md` rather than fixed.
 */

import { ConfinedReader, ConfinementError } from '../adapters/fs/read.ts';
import { toPlatform, type CanonicalPath } from '../adapters/fs/paths.ts';
import {
  childRelative,
  walk,
  type WalkBudget,
  type WalkEntry,
  type WalkTruncation,
} from '../adapters/fs/walk.ts';
import {
  identify,
  type Candidate,
  type Content,
  type Listing,
  type Verdict,
} from '../domain/identity.ts';

/**
 * BMAD's output folder, and the only child of the project root this pass looks
 * inside. Per-project configuration in BMAD; fixed here because AD-9 already
 * recognizes a project by this directory being present.
 *
 * Matched case-insensitively, which is the same rule `identity.ts` applies to
 * every layout name and for the same reason: on a case-insensitive volume the
 * directory BMAD created as `_bmad-output` can come back spelled otherwise, and
 * skipping it as "outside the artifact output tree" returns an **empty
 * inventory reporting itself complete** — the worst available failure.
 */
export const OUTPUT_DIRECTORY = '_bmad-output';

/**
 * Names skipped anywhere below the output folder.
 *
 * One entry, and it is insurance rather than an observation: nothing in a BMAD
 * output tree should contain a dependency directory, and a walk that wandered
 * into one would spend its whole budget there.
 */
export const SKIPPED_NAMES: readonly string[] = ['node_modules'];

/**
 * How far and how much, chosen rather than defaulted — `walk` refuses a
 * missing bound for exactly that reason.
 *
 * Measured against this project's own output tree: 51 entries, and its deepest
 * artifact (`planning-artifacts/ux-designs/{run}/mockups/{file}`) sits 5 levels
 * below the project root. So `maxEntries` is about 78× the observed size and
 * `maxDepth` about 2.4× the observed depth — deliberately stated as the two
 * different numbers they are, because the first draft of this comment called
 * both "roughly two orders of magnitude" and one of them was 2.4. Depth is the
 * tighter of the two on purpose: BMAD's layout is shallow and a tree 12 deep is
 * a sharded document inside a run folder inside a family root with room to
 * spare, whereas an entry count is what a pathological directory attacks.
 * Reaching either bound is reported in `truncations` and never silent.
 */
export const INVENTORY_BUDGET: WalkBudget = { maxDepth: 12, maxEntries: 4_000 };

/**
 * The most skips recorded individually.
 *
 * `skipped` was the one list here outside a budget: `childrenOf` applies the
 * exclusion filter *before* it slices to its limit, so an excluded name costs
 * nothing against `maxEntries` and one pathological directory could produce a
 * `Skip` per name. Beyond this cap the count is kept and the paths are not,
 * which is the shape that answers "was anything left out" without letting the
 * answer grow without limit.
 */
export const MAX_RECORDED_SKIPS = 200;

/** One thing the walk left out, and which rule left it out. */
export interface Skip {
  /** Project-root-relative, `/`-separated, like every other path here. */
  readonly relative: string;
  readonly reason: string;
}

/** One thing found, exactly as the walk reported it, plus what it is. */
export interface InventoryEntry {
  readonly entry: WalkEntry;
  readonly identity: Verdict;
}

/**
 * Everything the pass found, plus everywhere it stopped short.
 *
 * `startEntry` is the project root's own walk entry, kept out of `entries`
 * because the root is what was walked rather than something found in it — and
 * kept rather than dropped because its state is the one that says whether the
 * pass could read anything at all.
 */
export interface Inventory {
  readonly root: CanonicalPath;
  readonly startEntry: WalkEntry;
  readonly entries: readonly InventoryEntry[];
  readonly truncations: readonly WalkTruncation[];
  /**
   * True when no bound was reached and every entry the walk reported was
   * `present`.
   *
   * **It says nothing about `skipped`.** The skip policy is the caller's own
   * instruction, so a pass that deliberately left five subtrees out is still
   * complete in this sense; `skipped` is where that is answered. Spelled out
   * because the walk's own `complete` was added precisely to stop a caller
   * reading a narrower claim as a wider one.
   */
  readonly complete: boolean;
  readonly skipped: readonly Skip[];
  /** Skips beyond `MAX_RECORDED_SKIPS`, counted rather than listed. */
  readonly skippedNotRecorded: number;
}

/** The skip policy's own tally, so the cap is applied in one place. */
interface SkipLog {
  readonly recorded: Skip[];
  overflow: number;
}

/**
 * The skip policy, recording as it goes and capped.
 *
 * Returns true to leave a child out. Consulted for every child at every level
 * and before the entry cap, so a cap is never spent on names this policy was
 * always going to discard.
 */
function skipPolicy(log: SkipLog): (name: string, parentRelative: string) => boolean {
  const note = (relative: string, reason: string): void => {
    if (log.recorded.length < MAX_RECORDED_SKIPS) log.recorded.push({ relative, reason });
    else log.overflow += 1;
  };
  return (name: string, parentRelative: string): boolean => {
    if (parentRelative === '.') {
      if (name.toLowerCase() === OUTPUT_DIRECTORY) return false;
      note(childRelative(parentRelative, name), 'outside the artifact output tree');
      return true;
    }
    if (SKIPPED_NAMES.includes(name.toLowerCase())) {
      note(childRelative(parentRelative, name), 'dependency directory');
      return true;
    }
    return false;
  };
}

/** The parent and name halves of a `/`-separated relative path. */
function split(relative: string): { readonly parent: string; readonly name: string } {
  const cut = relative.lastIndexOf('/');
  if (cut === -1) return { parent: '.', name: relative };
  return { parent: relative.slice(0, cut), name: relative.slice(cut + 1) };
}

/**
 * Child names of each directory, taken from the walk's own entries.
 *
 * **Only `present` children count.** A dangling `index.md` is a name with
 * nothing behind it, and level 3's question is what the directory *contains* —
 * so admitting it would let a broken link make a run folder read as a sharded
 * document at `certain` confidence. The dangling entry is still reported in
 * `entries` with its own state; it just is not a structural signal.
 */
function childNamesByParent(entries: readonly WalkEntry[]): Map<string, string[]> {
  const byParent = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.relative === '.' || entry.state !== 'present') continue;
    const { parent, name } = split(entry.relative);
    const names = byParent.get(parent);
    if (names === undefined) byParent.set(parent, [name]);
    else names.push(name);
  }
  return byParent;
}

/**
 * Which directories' listings the walk did not finish, and why.
 *
 * Three truncation shapes and they do not mean the same thing, which the first
 * version of this got wrong:
 *
 *   - A **depth** bound and a **per-directory entry** bound both record `at` as
 *     the directory itself, whose own listing is therefore short. Its ancestors
 *     are unaffected — their listings completed.
 *   - The **global entry budget** records `at` as the next path the walk *would*
 *     have reported, which is a path that never appears in `entries` at all. The
 *     walk is depth-first pre-order, so a directory's whole subtree is emitted
 *     contiguously: the directories with unreported descendants are exactly the
 *     ancestors of that cut point. Keying only on `at` missed every one of them,
 *     so a run folder holding an `index.md` reported `children: ['aaa']` as
 *     complete and flipped from `ambiguous` to a `certain` run folder.
 *
 * The two are told apart by whether `at` names a reported entry, which is
 * exact: a pending job has not been reported and, once the loop breaks, never
 * will be.
 */
function unfinishedListings(
  entries: readonly WalkEntry[],
  truncations: readonly WalkTruncation[],
): Map<string, string> {
  const reported = new Set(entries.map((entry) => entry.relative));
  const unfinished = new Map<string, string>();
  const note = (relative: string, reason: string): void => {
    if (!unfinished.has(relative)) unfinished.set(relative, reason);
  };

  for (const truncation of truncations) {
    if (reported.has(truncation.at)) {
      note(truncation.at, truncation.reason);
      continue;
    }
    // Never reported: the pass was cut here, so every ancestor of this path has
    // descendants the walk never got to.
    let ancestor = split(truncation.at).parent;
    for (;;) {
      note(ancestor, truncation.reason);
      if (ancestor === '.') break;
      ancestor = split(ancestor).parent;
    }
  }
  return unfinished;
}

/** Why an entry the walk could not use has no text and no children. */
function unusable(entry: Exclude<WalkEntry, { readonly state: 'present' }>): string {
  return `${entry.state} at the ${entry.stage} stage: ${entry.reason}`;
}

/**
 * Take the inventory of `reader`'s root.
 *
 * `reader` is the confined reader for the project root — the one root AD-9
 * permits — so every read this performs is resolved and confinement-checked at
 * the moment it happens, including the reads composed here from walk output.
 */
export function takeInventory(
  reader: ConfinedReader,
  options: { readonly budget?: WalkBudget } = {},
): Inventory {
  const log: SkipLog = { recorded: [], overflow: 0 };
  const result = walk(reader, options.budget ?? INVENTORY_BUDGET, {
    exclude: skipPolicy(log),
  });

  const byParent = childNamesByParent(result.entries);
  const unfinished = unfinishedListings(result.entries, result.truncations);

  const entries: InventoryEntry[] = [];
  let startEntry: WalkEntry | undefined;

  for (const entry of result.entries) {
    if (entry.relative === '.') {
      startEntry = entry;
      continue;
    }

    const kind = kindOf(entry);
    entries.push({
      entry,
      identity: identify({
        relative: entry.relative,
        kind,
        content: () => contentFor(reader, entry, kind),
        children: childrenFor(entry, kind, byParent, unfinished),
      }),
    });
  }

  return {
    root: result.root,
    // The walk always reports its starting directory as its own entry; the
    // fallback is for the shape of the type rather than for a reachable state,
    // and it reports rather than throws, because this pass has no failure mode
    // that is allowed to be an exception.
    startEntry:
      startEntry ?? {
        relative: '.',
        depth: 0,
        state: 'unreadable',
        stage: 'read-directory',
        reason: 'the walk reported no entry for the project root',
      },
    entries,
    truncations: result.truncations,
    complete: result.complete,
    skipped: log.recorded,
    skippedNotRecorded: log.overflow,
  };
}

/** What the walk learned about the kind, in the domain's three-way vocabulary. */
function kindOf(entry: WalkEntry): Candidate['kind'] {
  if (entry.state !== 'present') return 'unknown';
  if (entry.kind === 'directory') return 'directory';
  if (entry.kind === 'file') return 'file';
  // A FIFO, a socket, a device. Neither a document to read nor a directory to
  // list, so no shape is claimed for it; its *name* can still resolve a family
  // at level 4, below certain, which is the honest answer for a thing whose
  // only signal is what it is called.
  return 'unknown';
}

/**
 * A file's text, or the reason there is none.
 *
 * Called by the domain, at most once per candidate, and only when a level
 * actually needs it — see the header.
 */
function contentFor(reader: ConfinedReader, entry: WalkEntry, kind: Candidate['kind']): Content {
  if (entry.state !== 'present') return { available: false, reason: unusable(entry) };
  if (kind !== 'file') return { available: false, reason: `not a regular file (${entry.kind})` };
  try {
    // The resolved real path, not the relative spelling: it is already
    // canonical, so `resolveWithin` re-confines it without re-deriving it, and
    // no `/`-versus-`\` question arises on the way.
    const read = reader.readText(toPlatform(entry.path));
    return read.ok ? { available: true, text: read.text } : { available: false, reason: read.reason };
  } catch (error: unknown) {
    // `readText` *throws* on a confinement failure, by design — there is no
    // sensible way for a caller to continue reading that path. There is a
    // sensible way to continue the **pass**, and AD-7 requires it: one refused
    // path must not abort an inventory. Reachable only if a path the walk
    // resolved inside the root resolves outside it moments later, which is a
    // race rather than a shape, so it is reported as this entry's own failure.
    if (error instanceof ConfinementError) return { available: false, reason: error.message };
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** A directory's child names, from the walk, or the reason there are none. */
function childrenFor(
  entry: WalkEntry,
  kind: Candidate['kind'],
  byParent: ReadonlyMap<string, readonly string[]>,
  unfinished: ReadonlyMap<string, string>,
): Listing {
  if (entry.state !== 'present') return { available: false, reason: unusable(entry) };
  if (kind !== 'directory') return { available: false, reason: `not a directory (${entry.kind})` };
  const bound = unfinished.get(entry.relative);
  if (bound !== undefined) return { available: false, reason: bound };
  return { available: true, names: byParent.get(entry.relative) ?? [] };
}
