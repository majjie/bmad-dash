/**
 * The bounded, cycle-detecting walk over one permitted root.
 *
 * Stories 1.7 and 1.9 both assume an enumerator that until now did not exist —
 * 1.7 identifies artifacts, and 1.9 talks about failures that must not "crash
 * the walk". The only traversal in the repository was `test/support/gate.ts`,
 * and it is a counter-example rather than a starting point: it rethrows on
 * `EACCES`, so one directory the user cannot enter ends the whole pass; it
 * `readdir`s the *unresolved* path while keying its cycle set on the resolved
 * one; and it has no depth, breadth or total bound of any kind.
 *
 * Four properties, each of which is the fix for one of those:
 *
 *   1. **Failure is a value, never an exception.** Every per-entry problem —
 *      denied, dangling, looping, out of bounds — is reported in AD-8's
 *      vocabulary and the pass continues. Nothing is omitted either: an entry
 *      the walk could not use still appears, saying what failed and at which
 *      stage, which is Story 1.9's contract and the reason this returns a list
 *      rather than yielding on a happy path.
 *   2. **Confinement is re-asked, per entry, after resolution.** The walk never
 *      touches the filesystem itself: every read goes through `ConfinedReader`,
 *      which resolves and confines the directory before enumerating it and
 *      re-resolves and re-confines every child before returning it. A link
 *      inside the tree pointing out of it is refused *at the child*, so it is
 *      never descended and never read.
 *   3. **Identity is the resolved real path, and only a resolved path is an
 *      identity.** That works because `Child`'s `present` variant is the only
 *      one carrying a `path`: a child whose resolution failed has nothing for
 *      this module to key on, which is deliberate — the canonical form degrades
 *      to the *spelling* on `EACCES`, `ELOOP` and `ENAMETOOLONG`, and `ELOOP`
 *      is the cycle case, so keying a spelling would reintroduce the exact
 *      duplicate the cycle set exists to prevent.
 *   4. **Bounded, with the budget required.** Depth and total entries, both
 *      whole numbers of one or more, passed in rather than defaulted: an
 *      unbounded walk is the thing this signature exists to make impossible to
 *      ask for by accident, and a default would be the one value nobody chose.
 *      Reaching a bound is reported, never silent.
 *
 * **What property 3 does and does not claim, stated narrowly because the first
 * version of this comment overstated it.** It said "the same file reached by
 * two names appears once", which is false for a hard link: two hard links have
 * two resolved absolute paths, `realpathSync.native` returns each unchanged,
 * and the walk reports two entries. That is the *sourced* answer rather than a
 * shortfall — `ARCHITECTURE-SPINE.md`'s identity convention is "an artifact is
 * keyed by its resolved absolute path", so two hard links to one inode are two
 * artifacts, and inode keying would contradict the spine to fix a case the
 * frozen matrix never asked about (its row is scoped to a symlink). So: **a
 * symlink alias collapses; a hard link does not.** Pinned by test in both
 * directions so the decision is visible rather than incidental.
 *
 * **What a suppressed alias leaves behind: a record, not an entry.** When two
 * spellings resolve to one path the second becomes no entry and no truncation —
 * emitting a second entry to say "this is the same thing you already have"
 * would put a duplicate into the inventory whose whole point is that there is
 * not one. The spelling reported is the first the walk meets in its order
 * (sorted names, depth-first), which Story 1.7 inherits.
 *
 * It used to leave behind *nothing*, and Story 1.8 is where that stopped being
 * acceptable: an `index.md` that is a second spelling of an already-reported
 * path vanished from its directory's listing with `complete: true` and no
 * truncation, so the one signal that distinguishes a sharded document from a
 * plain run folder could disappear in silence (`deferred-work.md`, the
 * alias-suppression entry). So a suppression is now reported in `suppressed`,
 * naming both spellings, and it counts against `complete` — the walk shortened
 * a directory's listing, and a caller drawing a structural conclusion from that
 * listing is entitled to know. That is the whole of the decision: an alias is
 * **not** an entry, and it is **not** invisible either.
 *
 * **Why a suppression counts against `complete` and an exclusion does not.**
 * The two shorten a listing the same way and are answered oppositely on
 * purpose: `exclude` is the *caller's own instruction*, so a walk that obeyed
 * it did exactly what it was asked and reports nothing back (see
 * `WalkOptions`), while a suppression is the *walk's own* decision, taken for
 * its cycle set rather than for the caller, and a caller cannot ask about a
 * rule it did not set. So the exclusion is answered by the caller's own record
 * — `src/cli/inventory.ts` keeps one — and the suppression by this result. The
 * asymmetry is between whose decision it was, not between how much was lost.
 *
 * It does not import `list.ts`. That module is the unconfined lister and
 * AD-10's exception is scoped to names-only, no-recursion, no-read; a recursing
 * reader is outside it, and `test/architecture.test.ts` asserts the importer
 * sets on both sides so neither carve-out widens by accident.
 */

import { toPlatform, type CanonicalPath } from './paths.ts';
import { ConfinedReader, ConfinementError, type ChildStage } from './read.ts';

/**
 * How far and how much. Required, and validated rather than clamped.
 *
 * `maxDepth` counts levels below the starting directory: its own children are
 * depth 1, and a directory at that depth is enumerated only if `maxDepth` is at
 * least 2. `maxEntries` counts reported entries, the starting directory's own
 * entry included — so it bounds the size of the result rather than some
 * internal quantity a caller would have to guess the relationship to.
 */
export interface WalkBudget {
  readonly maxDepth: number;
  readonly maxEntries: number;
}

/**
 * Where to start and what to leave out. **Mechanism only — never policy.**
 *
 * Both exist because without them the walk is unusable on a real project, and
 * that was measured rather than argued: pointed at this repository with a
 * budget of 60 entries it reached `.` and `.claude` and never saw
 * `_bmad-output` or `src`, because `.` sorts ahead of every letter and the
 * dot-directories spent the whole budget. `test/support/gate.ts` — the
 * counter-example this module replaces — *has* a skip rule, and dropping it
 * without saying so was a regression rather than a simplification.
 *
 * The names to skip are deliberately **not** here. `node_modules` and
 * dot-directories are BMAD-project policy, and policy belongs to Story 1.7's
 * domain layer, which this walk is built to serve rather than to anticipate.
 * An adapter that hardcoded them would have to be edited for every project
 * shape, and the exclusion would be invisible to the caller whose inventory it
 * silently shortens.
 *
 * `exclude` is consulted for every child at every level, and — following
 * `listChildDirectories`' hard-won lesson — **before the entry cap applies**,
 * because a cap spent on names the caller was always going to discard is a cap
 * on the wrong thing. An excluded child is not an entry and not a truncation:
 * the caller asked for it to be left out, so reporting it back would be noise.
 */
export interface WalkOptions {
  /**
   * A subpath relative to the reader's root to walk instead of the root
   * itself. Confinement-checked like any other path, so an escaping value is
   * refused rather than walked.
   */
  readonly start?: string;
  /** True to leave a child out entirely. Receives the parent's `relative`. */
  readonly exclude?: (name: string, parentRelative: string) => boolean;
}

/** The stage vocabulary is the reader's; the walk adds none of its own. */
export type WalkStage = ChildStage;

/**
 * One thing the walk found, in AD-8's four states.
 *
 * `relative` is the path from the starting directory, in `/` separators
 * regardless of platform, with the starting directory itself spelled `.`. Two
 * entries never share a `relative`, and no entry outside the root ever appears.
 *
 * **Only `present` carries a `path`.** Same reason as `Child`, and this is
 * where it pays: `path` is the resolved real path and therefore the identity a
 * consumer keys artifacts by, so it is available exactly where resolution
 * actually happened. An `unreadable` entry offers no path to key, so no
 * consumer can accidentally key a spelling that `realpathSync.native` refused.
 *
 * State and stage are paired rather than free, so the combinations the prose
 * calls impossible — `unchecked` at `resolve`, `absent` at `confinement` — do
 * not typecheck either.
 *
 * `depth` is walk depth, not filesystem depth. A directory reached through a
 * symlink is one level below wherever the link sat, which is the depth the
 * bound was applied at and so the honest number to report.
 */
export type WalkEntry =
  | {
      readonly relative: string;
      readonly depth: number;
      readonly state: 'present';
      readonly path: CanonicalPath;
      readonly kind: 'directory' | 'file' | 'other';
    }
  | {
      readonly relative: string;
      readonly depth: number;
      readonly state: 'unchecked';
      readonly stage: 'confinement';
      readonly reason: string;
    }
  | {
      readonly relative: string;
      readonly depth: number;
      readonly state: 'absent' | 'unreadable';
      readonly stage: 'resolve' | 'read-directory';
      readonly reason: string;
    };

/** Which bound stopped the walk. Two bounds, two values, no third. */
export type WalkLimit = 'depth' | 'entries';

/**
 * A place the walk stopped short **of its own accord**, and why.
 *
 * Only the two bounds appear here. A denied directory or an escaping link is
 * *not* a truncation: the walk did everything it was asked to, and the
 * shortfall is reported as that entry's own state. Conflating them would make
 * `truncations` unusable for the question it is for, which is "would a bigger
 * budget have found more".
 *
 * The claim is deliberately about what the walk *did*, not about what exists:
 * "not enumerated" is true of an empty directory at the depth boundary as well
 * as a full one, and the walk cannot tell those apart without doing the thing
 * the bound forbids. Overstating it would make a bound's report a guess.
 */
export interface WalkTruncation {
  readonly limit: WalkLimit;
  /** The `relative` of the entry or directory the walk stopped at. */
  readonly at: string;
  readonly reason: string;
}

/**
 * A name the walk dropped because its resolved path was already reported.
 *
 * Both spellings are named, because either alone is useless: `relative` is the
 * name that has no entry of its own, and `reportedAt` is where the artifact at
 * that identity actually appears. A consumer that wants to restore the name to
 * its parent's listing — Story 1.8's pass does, so an aliased `index.md` still
 * counts as a name the directory holds — needs the first; one that wants to
 * point a reader at the artifact needs the second.
 *
 * Only children the reader resolved and confined can be suppressed, so this
 * always carries a `path` and a `kind`. An unresolvable child has no identity
 * to collide with and is reported as its own `WalkEntry` instead.
 */
export interface WalkSuppression {
  /** The spelling that was dropped, relative to the starting directory. */
  readonly relative: string;
  /** Walk depth of the dropped spelling, on the same footing as `WalkEntry`. */
  readonly depth: number;
  /** The resolved real path the two spellings share. */
  readonly path: CanonicalPath;
  readonly kind: 'directory' | 'file' | 'other';
  /** The `relative` this resolved path was first reported at. */
  readonly reportedAt: string;
  readonly reason: string;
}

/**
 * The most suppressions recorded individually.
 *
 * The lesson `src/cli/inventory.ts` learned about its skip log, applied before
 * it is paid for a second time: a suppressed child costs nothing against
 * `maxEntries` — it never becomes an entry — so a directory of ten thousand
 * links to one file would produce ten thousand records under a budget that
 * thinks it is bounding the result. Beyond this cap the count is kept and the
 * paths are not, which answers "was a name withheld" without letting the answer
 * grow without limit.
 *
 * `suppressedByDirectory` below is what keeps the cap from hiding anything: it
 * counts **every** suppression per directory, recorded or not, so a consumer
 * can always tell which listings are short even where it cannot be told which
 * names are missing.
 *
 * The value equals `src/cli/inventory.ts`'s `MAX_RECORDED_SKIPS` and is
 * deliberately a second constant rather than a shared one: an adapter cannot
 * import the pass (AD-1's layering, and the pass is this module's consumer),
 * and the two bound different lists whose owners are different — one the caller
 * asked for, one this walk decided. Equal today, and free to diverge.
 */
export const MAX_RECORDED_SUPPRESSIONS = 200;

/** Everything the walk found, plus every place it stopped short. */
export interface WalkResult {
  readonly root: CanonicalPath;
  /** The directory actually walked — the root unless `start` said otherwise. */
  readonly start: CanonicalPath;
  /** Depth-first, pre-order, children in sorted name order. */
  readonly entries: readonly WalkEntry[];
  /** Empty exactly when no bound was reached. Not a completeness flag. */
  readonly truncations: readonly WalkTruncation[];
  /**
   * Every name dropped as a second spelling of an already-reported path, up to
   * `MAX_RECORDED_SUPPRESSIONS`.
   */
  readonly suppressed: readonly WalkSuppression[];
  /** Suppressions beyond that cap, counted rather than listed. */
  readonly suppressedNotRecorded: number;
  /**
   * How many names each directory's reported listing is short by — **every**
   * suppression, whether or not it was recorded individually above.
   *
   * The cap's escape hatch, and the reason it is a tally rather than a second
   * list: one entry per directory that lost a name, so it is bounded by the
   * directories the walk visits and therefore by `maxEntries`, which the
   * per-name list is not. A consumer comparing a directory's count here against
   * the names it can see in `suppressed` knows exactly how many it was not told
   * about, which is what stops the cap from silently reinstating the defect the
   * suppression report exists to remove.
   *
   * Keyed by the *parent* directory's `relative`, so `.` appears for a name
   * dropped from the starting directory's own listing.
   */
  readonly suppressedByDirectory: ReadonlyMap<string, number>;
  /**
   * True when no bound was reached, every entry is `present`, **and** no name
   * was suppressed.
   *
   * The question a caller actually wants, computed once here rather than
   * rebuilt from `truncations` — which used to be documented as answering it
   * and does not. This story's own acceptance tree has an empty `truncations`
   * and a denied directory in it, so a caller trusting that doc would have
   * called an incomplete walk complete.
   *
   * The suppression clause is Story 1.8's, and it is the narrow claim rather
   * than the wide one: it does **not** say an artifact went missing — a
   * suppressed alias resolves to a path this result reports — it says a
   * directory's listing here is shorter than the directory is, which is
   * precisely what a structural read over that listing needs to know.
   */
  readonly complete: boolean;
}

/** A bound is a defect when it is not a whole number of one or more. */
function requireBound(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`walk needs a whole ${name} of 1 or more, got ${JSON.stringify(value)}`);
  }
}

/**
 * `relative` for a child, keeping the starting directory spelled `.`.
 *
 * Exported because a caller composing the same path has to compose it the same
 * way: `src/cli/inventory.ts` builds a `relative` for every child its skip
 * policy excludes — those never become entries, so the walk cannot hand it one
 * — and a second copy of this one-liner is a second spelling of the walk's own
 * convention, free to drift the moment either side changes.
 */
export function childRelative(parent: string, name: string): string {
  return parent === '.' ? name : `${parent}/${name}`;
}

/**
 * Work still to do: enumerate a directory, or report an entry already decided.
 *
 * Two shapes rather than one because a directory's own state is not known until
 * its listing has been attempted — a denied directory must read `unreadable`,
 * not `present` with a shrug — so a directory is emitted *by* its visit rather
 * than before it. Pre-order still holds: the visit emits the directory and then
 * pushes its children.
 */
type Job =
  | { readonly job: 'visit'; readonly path: CanonicalPath; readonly relative: string; readonly depth: number }
  | { readonly job: 'report'; readonly entry: WalkEntry };

/** The `relative` a job will report at, for naming where a bound bit. */
function jobRelative(job: Job): string {
  return job.job === 'visit' ? job.relative : job.entry.relative;
}

/**
 * Walk `reader`'s root — or `options.start` beneath it — and report everything.
 *
 * Depth-first and pre-order, with children in sorted name order, so the result
 * is the same list on every run over the same tree; a walk whose output order
 * depended on what the filesystem happened to return would make every
 * downstream assertion flaky and every truncated result arbitrary.
 *
 * The starting directory appears as its own entry, spelled `.`. That is what
 * lets a directory the tool cannot enumerate — including the root itself, and
 * including a root that is absent or is a regular file — be reported in the
 * same vocabulary as any other directory, instead of needing a special field on
 * the result for the one case where there is nothing to list.
 *
 * Cycles terminate because a directory is descended only the first time its
 * resolved path is seen, and the starting directory is seeded into that set —
 * so `a/link -> a` and a link back to the start both stop at the second
 * encounter. The seed is the half that is easy to lose: ordinary `seen.add`
 * never covers the start, so without it a link to the start reports it twice
 * under one resolved path, which is precisely the duplicate this story exists
 * to prevent.
 */
export function walk(
  reader: ConfinedReader,
  budget: WalkBudget,
  options: WalkOptions = {},
): WalkResult {
  // Checked before the fields are read, so a missing budget reports the
  // requirement rather than an incidental "cannot read properties of
  // undefined" that says nothing about this function's contract.
  if (typeof budget !== 'object' || budget === null) {
    throw new Error(`walk needs a budget of { maxDepth, maxEntries }, got ${JSON.stringify(budget)}`);
  }
  requireBound('maxDepth', budget.maxDepth);
  requireBound('maxEntries', budget.maxEntries);

  const root = reader.root;
  // Throws if it escapes, like every other path handed to the reader. A start
  // outside the root is a caller defect, not a walkable location.
  const start = options.start === undefined ? root : reader.resolveWithin(options.start);
  const exclude = options.exclude;

  const entries: WalkEntry[] = [];
  const truncations: WalkTruncation[] = [];
  const suppressed: WalkSuppression[] = [];
  let suppressedNotRecorded = 0;
  const suppressedByDirectory = new Map<string, number>();
  // Resolved real paths already accounted for, each mapped to the `relative` it
  // was first reported at — a set until Story 1.8, and the value is what lets a
  // suppression name the spelling that won rather than only the one that lost.
  // The starting directory is seeded so a link pointing back at it is a repeat
  // rather than a fresh subtree — see the note on cycles above.
  const seen = new Map<string, string>([[start, '.']]);
  const stack: Job[] = [{ job: 'visit', path: start, relative: '.', depth: 0 }];

  while (stack.length > 0) {
    if (entries.length >= budget.maxEntries) {
      const next = stack[stack.length - 1];
      truncations.push({
        limit: 'entries',
        // The next job to pop, which is the first path that would have been
        // reported — the stack is LIFO and children were pushed reversed, so
        // the top is the earliest remaining entry in walk order.
        at: next === undefined ? '.' : jobRelative(next),
        // "At least", because a pending job is either one entry or a whole
        // unexplored subtree, and counting them as paths understated the
        // remainder arbitrarily.
        reason: `entry budget of ${String(budget.maxEntries)} reached with at least ${String(stack.length)} path(s) still unwalked`,
      });
      break;
    }

    const job = stack.pop();
    if (job === undefined) break;

    if (job.job === 'report') {
      entries.push(job.entry);
      continue;
    }

    if (job.depth >= budget.maxDepth) {
      entries.push({
        relative: job.relative,
        depth: job.depth,
        state: 'present',
        path: job.path,
        kind: 'directory',
      });
      truncations.push({
        limit: 'depth',
        at: job.relative,
        reason: `not enumerated: depth limit of ${String(budget.maxDepth)} reached`,
      });
      continue;
    }

    // Slots left for this directory's children *after* its own entry, which is
    // pushed below. The reservation is the fix for an off-by-one that asked for
    // one more child than could ever be held, and then blamed the directory for
    // the global cap when the extra one came back. `slots` can be zero or
    // negative when the budget is all but spent; the cap handed to `childrenOf`
    // still has to be at least one, because the listing is also how the walk
    // learns whether the directory is readable at all.
    const slots = budget.maxEntries - entries.length - 1;
    const room = Math.max(1, slots);

    // `childrenOf` returns absence and unreadability as values. Confinement it
    // still throws, and a defect — a bad limit, a `TypeError` — throws too.
    // Catching both here is what makes "never rethrows a per-entry failure" a
    // property of the walk rather than a property of everything it calls; and
    // telling them apart is what stops a defect reaching a user as "refused
    // for being outside the project".
    let listing;
    try {
      listing = reader.childrenOf(
        toPlatform(job.path),
        room,
        exclude === undefined ? undefined : (name: string) => !exclude(name, job.relative),
      );
    } catch (error: unknown) {
      entries.push(
        error instanceof ConfinementError
          ? {
              relative: job.relative,
              depth: job.depth,
              state: 'unchecked',
              stage: 'confinement',
              reason: error.message,
            }
          : {
              relative: job.relative,
              depth: job.depth,
              state: 'unreadable',
              stage: 'read-directory',
              reason: error instanceof Error ? error.message : String(error),
            },
      );
      continue;
    }

    if (!listing.ok) {
      entries.push({
        relative: job.relative,
        depth: job.depth,
        state: listing.state,
        stage: listing.stage,
        reason: listing.reason,
      });
      continue;
    }

    entries.push({
      relative: job.relative,
      depth: job.depth,
      state: 'present',
      path: job.path,
      kind: 'directory',
    });

    // Only when the cap handed down was the *real* remaining room. With
    // `slots < 1` the budget was already spent and the loop head is about to
    // report that honestly; a second record here would count one shortfall
    // twice and attribute a global cap to whichever directory met it.
    if (listing.truncated && slots >= 1) {
      truncations.push({
        limit: 'entries',
        at: job.relative,
        reason: `entry budget of ${String(budget.maxEntries)} left room for only ${String(room)} of this directory's children`,
      });
    }

    const childDepth = job.depth + 1;
    const pending: Job[] = [];
    for (const child of listing.children) {
      const relative = childRelative(job.relative, child.name);
      if (child.state !== 'present') {
        pending.push({
          job: 'report',
          entry: {
            relative,
            depth: childDepth,
            ...(child.state === 'unchecked'
              ? { state: 'unchecked' as const, stage: 'confinement' as const }
              : { state: child.state, stage: child.stage }),
            reason: child.reason,
          },
        });
        continue;
      }
      // Only a resolved path reaches here, so only a resolved path becomes an
      // identity. A repeat is dropped rather than reported again — appearing
      // once is the contract — but it is *recorded*, because the name is one
      // this directory really holds and the listing above is short without it.
      const first = seen.get(child.path);
      if (first !== undefined) {
        // Counted first and unconditionally: the tally is what the cap below
        // must not be able to hide.
        suppressedByDirectory.set(job.relative, (suppressedByDirectory.get(job.relative) ?? 0) + 1);
        if (suppressed.length < MAX_RECORDED_SUPPRESSIONS) {
          suppressed.push({
            relative,
            depth: childDepth,
            path: child.path,
            kind: child.kind,
            reportedAt: first,
            reason:
              first === '.'
                ? 'a second spelling of the directory the walk started from'
                : `a second spelling of ${first}, which is already reported`,
          });
        } else {
          suppressedNotRecorded += 1;
        }
        continue;
      }
      seen.set(child.path, relative);
      if (child.kind === 'directory') {
        pending.push({ job: 'visit', path: child.path, relative, depth: childDepth });
        continue;
      }
      pending.push({
        job: 'report',
        entry: {
          relative,
          depth: childDepth,
          state: 'present',
          path: child.path,
          kind: child.kind,
        },
      });
    }

    // Reversed, because a stack pops last-first and the children are already in
    // sorted order. Without this the result is sorted per directory but
    // backwards, which is the kind of detail that reads as arbitrary noise in a
    // rendered inventory.
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const next = pending[index];
      if (next !== undefined) stack.push(next);
    }
  }

  return {
    root,
    start,
    entries,
    truncations,
    suppressed,
    suppressedNotRecorded,
    suppressedByDirectory,
    complete:
      truncations.length === 0 &&
      suppressed.length === 0 &&
      suppressedNotRecorded === 0 &&
      entries.every((entry) => entry.state === 'present'),
  };
}
