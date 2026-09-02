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
 * **Reading is lazy, so what a read learned is recorded rather than
 * discarded.** The three above are what this pass owns; the fourth thing it now
 * keeps is the *result* of item 2. `Candidate.content` is memoized inside
 * `identify`'s closure, so before Story 1.9 the pass performed a read, learned
 * that a file's bytes were unusable, handed the domain a reason for one level,
 * and kept nothing on the entry — a file of invalid UTF-8 under an artifact
 * root was reported `identified`, `certain`, with no reason anywhere. Every
 * entry now carries a `readability` signal in AD-8's four states, and `unchecked`
 * where no level needed the content, which is the honest report for a file this
 * pass deliberately never opened.
 *
 * It decides nothing about identity, and nothing about composition either. AD-4
 * puts identity in exactly one domain module and the spine puts the model in
 * `src/domain/` beside it; `test/architecture.test.ts` asserts the importer sets
 * on every side, so a second derivation cannot appear quietly.
 *
 * **The listing is surfaced rather than discarded.** It used to be built here,
 * handed to `identify`, and thrown away — so Story 1.8's document model, which
 * needs exactly those names to say what a sharded document is made of, would
 * have had to enumerate the tree again. It is now on every `InventoryEntry`
 * next to the verdict and the composition derived from both.
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
 * **Two known holes in "the children are what the directory holds". One is
 * still open and recorded; the other is closed, with what closing it cost:**
 *
 *   - A child the **skip policy removed** does not appear in the listing handed
 *     to the domain, and the listing is still reported `available`. Today the
 *     only such child below the output folder is a `node_modules`, so no family
 *     document and no `index.md` can be lost that way — but the listing is a
 *     *filtered* one and identification is not told so. Making it `unavailable`
 *     instead would silence level 3 for a whole run folder because it happened
 *     to contain a dependency directory, which is the worse trade. What the
 *     *document model* is told is the omission itself, so composition can
 *     report its parts as possibly-incomplete where identification cannot.
 *   - A child the walk **suppressed as a symlink alias** used to vanish the same
 *     way, with `complete: true` and no truncation, so an `index.md` that was a
 *     second spelling of an already-seen path did not make its directory read
 *     as a sharded document. Story 1.8 closed that: the walk reports every
 *     suppression, and `listingsFor` **restores** the name here — under three
 *     conditions stated there, because "the walk resolved and confined it"
 *     establishes that the *name* is real and not that the spelling it aliases
 *     is usable, is a file, or is even known. Every decision the restore takes
 *     is on `Inventory.aliases`.
 *
 * What the restore costs, stated because a later story pays it: a part path can
 * name a spelling that has no entry of its own — the artifact is reported under
 * the other spelling — so a consumer opening a part by path may be opening a
 * name it never saw in `entries`. `deferred-work.md` carries it as an entry
 * against Story 1.9 and Epic 2.
 *
 * **One project-level fact is resolved here as well as the per-entry ones:**
 * where the project configures its stories to live (FR-51, `story_location` in
 * `sprint-status.yaml`). It belongs here for the reason everything else does —
 * AD-9 puts resolution in the composition root and forbids a second discovery
 * path — and it is derived from the entries this pass already built, so the
 * tracking file is found by its recorded verdict rather than by a second
 * search. Two properties to preserve when touching it: a value pointing
 * outside the project is resolved and reported but **never read**, and *which*
 * file supplies the value is decided by the authority's level-1 verdict rather
 * than by walk order. See `storyLocationOf` and `trackingFiles`.
 */

import { ConfinedReader, ConfinementError } from '../adapters/fs/read.ts';
import { toPlatform, type CanonicalPath } from '../adapters/fs/paths.ts';
import {
  childRelative,
  walk,
  type WalkBudget,
  type WalkEntry,
  type WalkSuppression,
  type WalkTruncation,
} from '../adapters/fs/walk.ts';
import { isMarkdown } from '../domain/identity.ts';
import {
  identify,
  type Candidate,
  type Content,
  type Listing,
  type Verdict,
} from '../domain/identity.ts';
import {
  compose,
  type Composition,
  type PartListing,
  type PartOmission,
} from '../domain/document.ts';
import { interpret, type InterpretationState } from '../domain/interpretation.ts';
import { runFactsOf, type RunFacts } from '../domain/runs.ts';
import { LISTING_NOT_TEXT, UNREAD, type Readability } from '../domain/signal.ts';
import { readUnfenced } from '../domain/frontmatter.ts';
import {
  STORY_LOCATION_FIELD,
  TRACKING_FILE,
  locateStories,
  type FieldReading,
  type Resolution,
  type StoryLocation,
} from '../domain/sprint.ts';

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
  /**
   * The child listing handed to the domain — the same value both the identity
   * and the composition were derived from, so a consumer can see the evidence
   * rather than re-enumerate to guess at it.
   */
  readonly children: Listing;
  /** What it is made of, under every reading its verdict carried. */
  readonly composition: Composition;
  /**
   * Whether this artifact's content could be read — AD-8's four states,
   * recorded as its own signal beside the identity rather than inside it.
   *
   * Story 1.9's measured defect was that this fact existed and was thrown
   * away: the pass hands `identify` a lazy `ContentSource`, the domain
   * memoizes the result inside its own closure, and nothing survived onto the
   * entry — so a file of invalid UTF-8 named `prd.md` under an artifact root
   * came back `identified`, `prd`, `certain`, with `attempted:
   * [location:resolved]` and no reason anywhere, which is corrupt data
   * presented as valid (NFR-3).
   *
   * **`unchecked` is the honest answer for most files, and it is the point.**
   * Level 1 resolves a family from an artifact's location without opening it,
   * so nothing read the content; saying so is what stops a consumer reading
   * "identified" as "the content is fine". The accepted limit that comes with
   * it: a malformed file *under* an artifact root reports `unchecked` rather
   * than `unreadable`, because establishing otherwise means reading eagerly —
   * the trade this pass took deliberately the other way (see the header).
   */
  readonly readability: Readability;
  /**
   * FR-12 or FR-69 or neither, decided once from the recorded verdict — and
   * **`undefined` for an artifact that is not there.**
   *
   * Kept distinct — `present-but-uninterpreted` is a recognized artifact whose
   * shape nothing can interpret, `unidentified` is identification itself
   * failing — with both definitions recorded in
   * `src/domain/interpretation.ts`, which is where the reasoning for keeping
   * them apart lives too.
   *
   * The `undefined` is the correction of a real defect rather than a
   * convenience: applied unconditionally, a dangling `gone.md` under an
   * artifact root came back `state: absent` and
   * `interpretation: present-but-uninterpreted` on the same entry — a term
   * whose first word is *present*, quoted verbatim from FR-12, said of an
   * artifact this very entry reports as not there. FR-12 and FR-69 are both
   * claims about an artifact the tool found; neither has anything to say about
   * one it did not, so nothing is claimed. What happened to it is on `entry`
   * and on `readability`, typed, which is where it belongs.
   */
  readonly interpretation: InterpretationState | undefined;
  /**
   * What a run folder's name cannot carry, per run-folder reading — whether the
   * pattern can collide within a day, whether that reuse is deliberate, and
   * whether the name offers a date at all.
   *
   * **Derived from the recorded verdict, never a second identification** (AD-4):
   * `src/domain/runs.ts` receives the `Verdict` above and nothing else, so
   * there is no path, listing or name for it to re-read. Empty for everything
   * the verdict did not read as a run folder, which is most entries — a
   * document, a family's container directory, a subfolder inside a run — and
   * empty is the answer rather than a row of falsehoods a surface could render.
   *
   * Nothing here counts runs. FR-71's "the tool must not assume one folder
   * equals one run" is honoured as a negative — every fact carries
   * `runCount: 'unknowable'` and the basis for that is recorded in the domain
   * module — because the signal that would tell one run from two does not
   * exist in a run folder. Detecting an actual second run needs git and is
   * Epic 3's.
   */
  readonly runFacts: readonly RunFacts[];
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
   * True when no bound was reached, every entry the walk reported was
   * `present`, and the walk suppressed no name.
   *
   * The walk's own answer, forwarded rather than recomputed — including its
   * suppression clause, which is Story 1.8's and is the reason this is no
   * longer only about bounds and entry states.
   *
   * **It says nothing about `skipped`.** The skip policy is the caller's own
   * instruction, so a pass that deliberately left five subtrees out is still
   * complete in this sense; `skipped` is where that is answered. Spelled out
   * because the walk's own `complete` was added precisely to stop a caller
   * reading a narrower claim as a wider one — and the asymmetry with
   * suppression is deliberate and explained in `walk.ts`'s header: an exclusion
   * is what this pass asked for, a suppression is what the walk decided, and a
   * caller can only be surprised by the second.
   */
  readonly complete: boolean;
  readonly skipped: readonly Skip[];
  /** Skips beyond `MAX_RECORDED_SKIPS`, counted rather than listed. */
  readonly skippedNotRecorded: number;
  /**
   * Names the walk dropped as second spellings of already-reported paths, and
   * what this pass did with each.
   *
   * Surfaced rather than consumed silently: the difference between a directory
   * holding one `index.md` and holding two names for one file is a fact about
   * the project, not an implementation detail — and so is the pass declining to
   * restore one, which is why `restored` is on the record rather than implied.
   */
  readonly aliases: readonly Alias[];
  /**
   * Where this project configures its stories to live, resolved once (FR-51).
   *
   * One record per pass rather than per entry, because it is a property of the
   * project and not of an artifact — and resolved here for the reason every
   * other derivation is: this is where the pass already composes, and a surface
   * that resolved it itself would be a second discovery path (AD-9).
   *
   * **Always present, whatever the project looks like.** A project with no
   * `sprint-status.yaml` gets the `absent` state rather than a missing field:
   * FR-75 makes absence a normal shape, and a field that were sometimes
   * undefined would let a surface render "no story location" for a project that
   * simply had not been looked at. An `in-tree` state means the place resolved
   * and is there; anything else names why nothing may be read from it.
   */
  readonly storyLocation: StoryLocation;
  /**
   * Suppressions beyond the walk's own record cap, counted rather than listed.
   *
   * These are the ones this pass could not act on at all, so the directories
   * they came from have their listings reported **unavailable** rather than
   * short — see `unfinishedListings`. Kept here as the total, because a count
   * of what could not be named is still an answer to "was anything withheld".
   */
  readonly suppressedNotRecorded: number;
}

/** One suppressed spelling, and what the pass did about it. */
export interface Alias {
  /** The spelling with no entry of its own, project-root-relative. */
  readonly relative: string;
  /** Where the artifact at that identity is reported instead. */
  readonly reportedAt: string;
  /** Whether the name was put back into its parent's listing. */
  readonly restored: boolean;
  /** How it was treated, and where it was not restored, why not. */
  readonly reason: string;
}

/**
 * The skip policy's own tally, so the cap is applied in one place.
 *
 * `countsByParent` counts **every** skip, recorded or not, for the same reason
 * the walk counts every suppression per directory: past `MAX_RECORDED_SKIPS`
 * the names are gone, and without the tally a filtered listing past the cap
 * would compose as authoritative — the cap quietly undoing the honesty the
 * record exists for. One entry per directory that lost a child, so it is
 * bounded by the directories walked rather than by the names skipped.
 */
interface SkipLog {
  readonly recorded: Skip[];
  overflow: number;
  readonly countsByParent: Map<string, number>;
}

/**
 * The skip policy, recording as it goes and capped.
 *
 * Returns true to leave a child out. Consulted for every child at every level
 * and before the entry cap, so a cap is never spent on names this policy was
 * always going to discard.
 */
function skipPolicy(log: SkipLog): (name: string, parentRelative: string) => boolean {
  const note = (parentRelative: string, relative: string, reason: string): void => {
    log.countsByParent.set(parentRelative, (log.countsByParent.get(parentRelative) ?? 0) + 1);
    if (log.recorded.length < MAX_RECORDED_SKIPS) log.recorded.push({ relative, reason });
    else log.overflow += 1;
  };
  return (name: string, parentRelative: string): boolean => {
    if (parentRelative === '.') {
      if (name.toLowerCase() === OUTPUT_DIRECTORY) return false;
      note(parentRelative, childRelative(parentRelative, name), 'outside the artifact output tree');
      return true;
    }
    if (SKIPPED_NAMES.includes(name.toLowerCase())) {
      note(parentRelative, childRelative(parentRelative, name), 'dependency directory');
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
/** Everything `listingsFor` works out in one pass over the walk's output. */
interface Listings {
  /** Child names per directory, sorted, with restorable aliases put back. */
  readonly namesByParent: Map<string, string[]>;
  /** Restored names that duplicate another name in the same listing. */
  readonly aliasesByParent: Map<string, string[]>;
  /** How many suppressions the walk counted but could not name, per directory. */
  readonly unnamedByParent: Map<string, number>;
  /** One record per suppression the walk did name, and its disposition. */
  readonly aliases: Alias[];
}

/**
 * The listing handed to the domain for each directory, and what shaped it.
 *
 * **Only `present` children count.** A dangling `index.md` is a name with
 * nothing behind it, and level 3's question is what the directory *contains* —
 * so admitting it would let a broken link make a run folder read as a sharded
 * document at `certain` confidence. The dangling entry is still reported in
 * `entries` with its own state; it just is not a structural signal.
 *
 * **A suppressed alias is restored, under three conditions.** It is a name the
 * directory really holds — the walk resolved and confined it exactly like a
 * reported child and dropped it only because its *identity* was already
 * accounted for — and left out, an `index.md` reached by a second spelling made
 * its directory read as a plain run folder, which is the hole
 * `deferred-work.md` recorded against this story. What "resolved like any
 * other" does *not* establish is that the name is usable as a structural
 * signal, so each condition is checked rather than assumed:
 *
 *   1. **The spelling it aliases is `present`.** Otherwise the winner was
 *      dropped by the rule above and restoring the alias would put the name
 *      back through the side door — a symlink to a directory the pass could not
 *      enumerate became an `index.md` this directory "contains", so its one
 *      part was a denied directory reported `complete`. That is the dangling
 *      case wearing a different hat, and it is checked first because it is the
 *      more precise diagnosis of the two.
 *   2. **It is a file.** The walk knows the kind here, and a directory is
 *      neither a document nor a part of one. The listing being names-only is a
 *      limitation the model states; it is not a licence for this pass to add a
 *      name it *knows* is a directory. Reached by an alias to a directory that
 *      *was* enumerable, which rule 1 has no quarrel with.
 *   3. **The walk could name it.** Past `MAX_RECORDED_SUPPRESSIONS` only a
 *      count survives, and a count cannot be restored — so those directories
 *      get an unavailable listing instead (see `unfinishedListings`), which is
 *      the honest report of a listing whose missing names are unknown.
 *
 * A restored name that duplicates another name in the same listing — a symlink
 * beside its target — is recorded in `aliasesByParent` so the model can list
 * one part for one file while identification still sees both names.
 *
 * Everything the restore declines is on the returned `aliases`, with
 * `restored: false` and the reason, so no rule here is silent.
 */
function listingsFor(
  entries: readonly WalkEntry[],
  suppressed: readonly WalkSuppression[],
  suppressedByDirectory: ReadonlyMap<string, number>,
): Listings {
  const namesByParent = new Map<string, string[]>();
  const aliasesByParent = new Map<string, string[]>();
  const unnamedByParent = new Map<string, number>();
  const aliases: Alias[] = [];
  const present = new Set<string>();

  const push = (into: Map<string, string[]>, parent: string, name: string): void => {
    const held = into.get(parent);
    if (held === undefined) into.set(parent, [name]);
    else held.push(name);
  };

  for (const entry of entries) {
    if (entry.state !== 'present') continue;
    present.add(entry.relative);
    if (entry.relative === '.') continue;
    const { parent, name } = split(entry.relative);
    push(namesByParent, parent, name);
  }

  const named = new Map<string, number>();
  for (const alias of suppressed) {
    const { parent, name } = split(alias.relative);
    named.set(parent, (named.get(parent) ?? 0) + 1);
    if (!present.has(alias.reportedAt)) {
      aliases.push({
        relative: alias.relative,
        reportedAt: alias.reportedAt,
        restored: false,
        reason: `not restored: ${alias.reportedAt} is not reported as present, so the name has nothing usable behind it`,
      });
      continue;
    }
    if (alias.kind !== 'file') {
      aliases.push({
        relative: alias.relative,
        reportedAt: alias.reportedAt,
        restored: false,
        reason: `not restored: a ${alias.kind} is not a document or a part of one`,
      });
      continue;
    }
    push(namesByParent, parent, name);
    // A second spelling of a sibling: kept as a name, excluded from parts.
    const duplicate = split(alias.reportedAt).parent === parent;
    if (duplicate) push(aliasesByParent, parent, name);
    aliases.push({
      relative: alias.relative,
      reportedAt: alias.reportedAt,
      restored: true,
      reason: duplicate
        ? `restored as a name its parent holds, and excluded from parts as a second spelling of ${split(alias.reportedAt).name}`
        : 'restored as a name its parent holds',
    });
  }

  // What the walk counted but could not name, per directory.
  for (const [parent, total] of suppressedByDirectory) {
    const unnamed = total - (named.get(parent) ?? 0);
    if (unnamed > 0) unnamedByParent.set(parent, unnamed);
  }

  // Sorted, because the listing is now a surfaced value: the walk reports
  // children in sorted name order, and appending restored names left
  // `InventoryEntry.children` in an order that depended on which spelling the
  // walk happened to meet first. One order, whatever the tree does.
  for (const names of namesByParent.values()) names.sort();

  return { namesByParent, aliasesByParent, unnamedByParent, aliases };
}

/**
 * What each directory's listing does not include, keyed by the directory.
 *
 * The skip policy is the only rule that produces one: a name it removed is
 * absent from the listing while the listing still reports itself `available`,
 * which is the trade this file's header records. The document model takes these
 * as `omissions` and reports parts as possibly-incomplete rather than
 * authoritative; identification is deliberately left alone, because marking the
 * whole listing unavailable would silence level 3 for a run folder that merely
 * contained a dependency directory.
 *
 * A suppressed alias is **not** an omission — a restored one is not missing at
 * all, and one the restore declined is reported on `Inventory.aliases` with its
 * reason. What is genuinely unaccounted for, past the walk's own record cap,
 * makes the listing unavailable instead: see `unfinishedListings`.
 *
 * Skips beyond `MAX_RECORDED_SKIPS` arrive as a **count**, because the names are
 * gone by then and a count is what the tally kept. Omitting them entirely was
 * the earlier defect: a filtered listing past the cap composed as authoritative
 * and the cap silently undid the report it is meant to bound.
 */
function omissionsByParent(log: SkipLog): Map<string, PartOmission[]> {
  const byParent = new Map<string, PartOmission[]>();
  const push = (parent: string, omission: PartOmission): void => {
    const held = byParent.get(parent);
    if (held === undefined) byParent.set(parent, [omission]);
    else held.push(omission);
  };

  const recorded = new Map<string, number>();
  for (const skip of log.recorded) {
    const { parent, name } = split(skip.relative);
    recorded.set(parent, (recorded.get(parent) ?? 0) + 1);
    push(parent, {
      omitted: 'name',
      name,
      reason: `${name} was left out of the listing: ${skip.reason}`,
    });
  }
  for (const [parent, total] of log.countsByParent) {
    const unnamed = total - (recorded.get(parent) ?? 0);
    if (unnamed === 0) continue;
    push(parent, {
      omitted: 'count',
      count: unnamed,
      reason: `${String(unnamed)} name(s) the skip policy left out were not recorded individually, so this listing may be short by a part`,
    });
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
  unnamedByParent: ReadonlyMap<string, number>,
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

  // A suppression the walk could not name is the same kind of loss as a bound:
  // the names this directory holds are not knowable from what the pass was
  // given, so nothing may be concluded from the short list it *can* see. The
  // alternative was to report the list as available anyway, which past the
  // record cap reinstated the exact defect this story closed — a run folder
  // reading `certain` over a listing an `index.md` had been dropped from.
  for (const [parent, unnamed] of unnamedByParent) {
    note(
      parent,
      `${String(unnamed)} name(s) the walk suppressed as second spellings could not be recorded individually, so this listing is short by names nobody can name`,
    );
  }
  return unfinished;
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
  const log: SkipLog = { recorded: [], overflow: 0, countsByParent: new Map() };
  const result = walk(reader, options.budget ?? INVENTORY_BUDGET, {
    exclude: skipPolicy(log),
  });

  const listings = listingsFor(result.entries, result.suppressed, result.suppressedByDirectory);
  const unfinished = unfinishedListings(
    result.entries,
    result.truncations,
    listings.unnamedByParent,
  );
  const omissions = omissionsByParent(log);

  const entries: InventoryEntry[] = [];
  let startEntry: WalkEntry | undefined;

  for (const entry of result.entries) {
    if (entry.relative === '.') {
      startEntry = entry;
      continue;
    }

    const kind = kindOf(entry);
    const children = childrenFor(entry, kind, listings.namesByParent, unfinished);
    // One read at most, in a cell of the pass's own, so the signal is *derived
    // after* identification rather than written into a variable from inside the
    // closure. The earlier version was correct only because `identify` happens
    // to call `content()` synchronously before it returns — a fact no type and
    // no test pins, and the kind of correctness that survives until someone
    // makes a level lazy.
    let read: Read | undefined;
    const identity = identify({
      relative: entry.relative,
      kind,
      content: () => (read ??= contentFor(reader, entry, kind)).content,
      children,
    });
    entries.push({
      entry,
      identity,
      children,
      readability: read?.readability ?? initialReadability(entry, kind),
      // The verdict's own consequence, decided once here rather than by each
      // surface: FR-12's present-but-uninterpreted, FR-69's unidentified, or
      // neither. It reads the recorded verdict and re-derives no identity.
      //
      // Withheld entirely for an artifact the walk did not report present:
      // both states are claims about something the tool found, and FR-12's own
      // term begins with the word *present*. See `InventoryEntry`.
      interpretation: entry.state === 'present' ? interpret(identity) : undefined,
      // The other consequence of the same verdict, and it needs no `present`
      // guard: an entry the walk did not report present has no `run-folder`
      // shape to read — its kind is unknown, so the authority claims no shape
      // at all — and the derivation is therefore empty by the same rule that
      // makes it empty for a document.
      runFacts: runFactsOf(identity),
      // One composition per entry, from the verdict and the same listing — the
      // domain decides both; this only hands over what it already holds.
      composition: compose({
        relative: entry.relative,
        identity,
        children: partsListing(
          children,
          omissions.get(entry.relative) ?? [],
          listings.aliasesByParent.get(entry.relative) ?? [],
        ),
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
    aliases: listings.aliases,
    // Derived from the entries the pass just built — so the tracking file is
    // found by the recorded verdict rather than by a second search, and no path
    // outside the root is read to answer it.
    storyLocation: storyLocationOf(reader, entries),
    suppressedNotRecorded: result.suppressedNotRecorded,
  };
}

/**
 * The listing again, in the document model's own vocabulary.
 *
 * A translation and not a second derivation: the names and the reason are the
 * ones identification saw, and all that is added is what the pass knows and the
 * domain cannot — that a name was withheld from an otherwise available listing,
 * and that a name is a second spelling of a sibling.
 *
 * Exported so the model's own tests compose through *this* translation rather
 * than a copy of it. A private helper here plus a lookalike in the test file is
 * two spellings of one contract, and the copy is the one that keeps passing
 * after this one changes.
 */
export function partsListing(
  children: Listing,
  omissions: readonly PartOmission[],
  aliases: readonly string[],
): PartListing {
  return children.available
    ? { available: true, names: children.names, omissions, aliases }
    : { available: false, reason: children.reason };
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
 * What one read produced: what the domain gets, and what the entry records.
 *
 * Two values from one attempt, because they answer different questions and
 * neither can be derived from the other. `content` is the domain's own
 * vocabulary — available, or a reason a level could not run — and `readability`
 * is AD-8's, which is what survives onto the entry for a consumer that never
 * sees the levels at all.
 */
interface Read {
  readonly content: Content;
  readonly readability: Readability;
}

/**
 * The readability of an entry no level asked to read.
 *
 * Three cases, and each is a different honest answer:
 *
 *   - **A present file** is `unchecked`: the pass reads only where a level
 *     asks, so until one does, the truthful answer is that nothing looked.
 *   - **A present directory** is `unchecked` too, with its own reason. Nothing
 *     read it *as text*, and saying "nothing read it" would be false — its
 *     listing usually was read, and the listing is what a directory's content
 *     is. What the listing turned out to be is on `children`, in the
 *     vocabulary that answers it.
 *   - **Anything the walk did not report present** takes the walk's own state
 *     and stage, forwarded rather than re-derived: a dangling link is `absent`
 *     at `resolve`, an escaping one `unchecked` at `confinement`, a denied
 *     directory `unreadable` at `read-directory`. An entry the walk could not
 *     reach is an artifact whose content could not be read, whether or not a
 *     level ever asked for it.
 *
 * The forward in the third case is also the tool's one mechanical check that
 * `ReadStage` still covers the walk's three stages: those are inline literals
 * in `WalkEntry`, so dropping a name from `ReadStage` fails to compile *here*.
 * Measured, after an earlier version of this comment put the pin in the wrong
 * place (on `ChildStage`, which is `Extract`ed and narrows silently).
 */
function initialReadability(entry: WalkEntry, kind: Candidate['kind']): Readability {
  if (entry.state !== 'present') {
    return { state: entry.state, stage: entry.stage, reason: entry.reason };
  }
  return kind === 'directory' ? LISTING_NOT_TEXT : UNREAD;
}

/**
 * A file's text, or the reason there is none, and the readability either way.
 *
 * Called by the domain, at most once per candidate, and only when a level
 * actually needs it — see the header.
 */
function contentFor(reader: ConfinedReader, entry: WalkEntry, kind: Candidate['kind']): Read {
  if (entry.state !== 'present') {
    // The platform's own words and nothing else. The state and the stage are
    // not folded in: they are typed on the entry, and on the signal beside it.
    return {
      content: { available: false, reason: entry.reason },
      readability: initialReadability(entry, kind),
    };
  }
  if (kind !== 'file') {
    // A FIFO, a socket, a device — refused on its kind, before anything opens
    // it, which is what keeps the pass from blocking forever on a pipe nobody
    // writes to. A directory never reaches here: no level asks a directory for
    // text.
    const reason = `not a regular file (${entry.kind})`;
    return {
      content: { available: false, reason },
      readability: { state: 'unreadable', stage: 'examine', reason },
    };
  }
  try {
    // The resolved real path, not the relative spelling: it is already
    // canonical, so `resolveWithin` re-confines it without re-deriving it, and
    // no `/`-versus-`\` question arises on the way.
    const read = reader.readText(toPlatform(entry.path));
    if (read.ok) return { content: { available: true, text: read.text }, readability: { state: 'present' } };
    // The reader's own state and stage — carried through rather than re-guessed
    // from its message. Invalid UTF-8 arrives as `unreadable` at `decode`, the
    // row this story's acceptance names; a file that vanished between the walk
    // and the read arrives as `absent`, which is the same answer the walk would
    // have given had it noticed first. Hardcoding `unreadable` here was one
    // physical fact with two answers depending on who saw it.
    return {
      content: { available: false, reason: read.reason },
      readability: { state: read.state, stage: read.stage, reason: read.reason },
    };
  } catch (error: unknown) {
    // `readText` *throws* on a confinement failure, by design — there is no
    // sensible way for a caller to continue reading that path. There is a
    // sensible way to continue the **pass**, and AD-7 requires it: one refused
    // path must not abort an inventory. Reachable only if a path the walk
    // resolved inside the root resolves outside it moments later, which is a
    // race rather than a shape, so it is reported as this entry's own failure.
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof ConfinementError) {
      // `unchecked`, not `unreadable`, and at the same stage the walk uses for
      // the same decision: the filesystem answered and the answer was refused,
      // so nothing was read and nothing will be.
      return {
        content: { available: false, reason },
        readability: { state: 'unchecked', stage: 'confinement', reason },
      };
    }
    return {
      content: { available: false, reason },
      readability: { state: 'unreadable', stage: 'read', reason },
    };
  }
}

/** A directory's child names, from the walk, or the reason there are none. */
function childrenFor(
  entry: WalkEntry,
  kind: Candidate['kind'],
  byParent: ReadonlyMap<string, readonly string[]>,
  unfinished: ReadonlyMap<string, string>,
): Listing {
  // The raw reason again, for the reason `contentFor` gives above it.
  if (entry.state !== 'present') return { available: false, reason: entry.reason };
  if (kind !== 'directory') return { available: false, reason: `not a directory (${entry.kind})` };
  const bound = unfinished.get(entry.relative);
  if (bound !== undefined) return { available: false, reason: bound };
  return { available: true, names: byParent.get(entry.relative) ?? [] };
}

// ---------------------------------------------------------------------------
// Where the stories live — FR-51, resolved once, at the end of the pass
// ---------------------------------------------------------------------------

/**
 * Which artifacts in this project are the sprint tracking file.
 *
 * AD-4's rule applied to *finding* a file rather than to classifying one:
 * `src/domain/identity.ts` already resolves `sprint-status.yaml` to the
 * `sprint-tracking` family, so asking the verdict is free and asking again
 * would be a second identification. Matching on the *name* here would be the
 * re-derivation AD-4 forbids, and it would hardcode
 * `_bmad-output/implementation-artifacts`, which the authority already knows.
 *
 * **Level 1 only, and that is the correction of a measured defect.** This took
 * the first `identified`/`sprint-tracking` entry in walk order, on the premise
 * that "a project with two is not a shape BMAD produces". The premise does not
 * survive the authority's own level 4: `identity.ts`'s hint table resolves that
 * family from a `sprint-status` name hint **anywhere in the tree**, so a stray
 * `_bmad-output/architecture-x/sprint-status.yaml` was identified too — and,
 * sorting before `implementation-artifacts`, it won. Measured: with the real
 * file declaring `docs/real` and a stray one declaring `/etc`, the pass
 * reported out-of-tree `/etc`. Sort order was deciding what the tool may read.
 *
 * So only a **level-1** verdict counts, which is the location rule: the file
 * sitting where BMAD's sprint planning writes it, inside a document root the
 * authority recognizes. A name hint elsewhere in the tree no longer nominates a
 * configuration file for the whole project.
 *
 * Where there is still more than one, the caller reports the ambiguity rather
 * than resolving it (FR-73's own rule, and the one this codebase applies to
 * every other two-readings case). Narrowing happens *inside* the loop rather
 * than in a predicate, so the `present` variant's `path` is available without a
 * second check the typechecker cannot see through — which is also what removes
 * the unreachable "not present" branch the caller used to carry.
 */
function trackingFiles(entries: readonly InventoryEntry[]): {
  readonly paths: readonly CanonicalPath[];
  readonly relatives: readonly string[];
} {
  const paths: CanonicalPath[] = [];
  const relatives: string[] = [];
  for (const candidate of entries) {
    const walked = candidate.entry;
    if (walked.state !== 'present' || walked.kind !== 'file') continue;
    const verdict = candidate.identity;
    if (verdict.outcome !== 'identified') continue;
    if (verdict.family !== 'sprint-tracking') continue;
    if (verdict.resolvedAt !== 'location') continue;
    paths.push(walked.path);
    relatives.push(walked.relative);
  }
  return { paths, relatives };
}

/**
 * What `story_location` says, and where it lands — resolved once, reading
 * nothing outside the root.
 *
 * The composition FR-51 needed, and the order of the steps is the correctness:
 *
 *   1. **Find the file by verdict**, or report `absent` — or `ambiguous`. No
 *      `sprint-status.yaml` among the entries is FR-75's normal project shape,
 *      answered from the walk's own output, so the pass does not probe a path
 *      to discover that a file is missing. More than one is presented rather
 *      than resolved; see `trackingFiles`.
 *   2. **Read it, through the confined reader.** This is the first consumer in
 *      the tool to open this file; level 1 identified it without reading it.
 *      The read is a `readText` like any other, so it is resolved and
 *      confinement-checked at the moment it happens, and its failure is Story
 *      1.9's typed state and stage rather than a message to parse.
 *   3. **Read the one scalar, then resolve it.** `readUnfenced` is the domain
 *      reader's unfenced door, over a file with no `---`; `resolveDeclared` is
 *      the adapter's non-throwing answer, which sanitizes the spelling and then
 *      resolves it once. Nothing outside the root is *read* — that method's own
 *      header states precisely what it does touch, and why the alternatives
 *      were measured to be worse.
 *
 * `readText` throws only on a confinement refusal, and the path here came from
 * the walk, which already resolved and confined it; a race there is the same
 * shape `contentFor` handles, and it is handled the same way — as this record's
 * own failure rather than as an aborted pass (AD-7).
 */
function storyLocationOf(reader: ConfinedReader, entries: readonly InventoryEntry[]): StoryLocation {
  const found = trackingFiles(entries);
  if (found.paths.length > 1) {
    return locateStories({ kind: 'ambiguous', candidates: found.relatives });
  }
  const only = found.paths[0];
  if (only === undefined) {
    return locateStories({
      kind: 'absent',
      reason: `nothing in this project was identified as ${TRACKING_FILE}, which is a normal project shape`,
    });
  }

  let read;
  try {
    read = reader.readText(toPlatform(only));
  } catch (error: unknown) {
    // A path the walk resolved inside the root resolving outside it moments
    // later: a race rather than a shape, reported as this record's failure.
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof ConfinementError) {
      return locateStories({ kind: 'unreadable', stage: 'confinement', reason });
    }
    return locateStories({ kind: 'unreadable', stage: 'read', reason });
  }
  if (!read.ok) {
    // The reader's own state carried through rather than flattened: a file that
    // vanished between the walk and this read is `absent`, which is FR-75's
    // shape and not a defect; anything else is a file we have and cannot use.
    return read.state === 'absent'
      ? locateStories({ kind: 'absent', stage: read.stage, reason: read.reason })
      : locateStories({ kind: 'unreadable', stage: read.stage, reason: read.reason });
  }

  return locateStories({ kind: 'read', field: declaredLocation(reader, read.text) });
}

/**
 * The `story_location` scalar, and what resolving it answered.
 *
 * AD-13's answers kept apart, which is the whole reason this is a function
 * rather than a `fields.get`: `undefined` from a `Map` cannot tell "no such
 * key" from "a key this reader declined", and `readUnfenced` reports the second
 * in `skipped` precisely so the difference survives. A `?? ''` here would be
 * the empty-success AD-13 forbids.
 *
 * **A key declared twice is declined**, and that is the answer this function
 * had to grow. `readUnfenced` is first-wins and *reports* the repeat, and the
 * report was being discarded — so `story_location: docs/stories` followed by
 * `story_location: /etc` came back as `docs/stories` while every YAML parser,
 * BMAD's own tooling included, takes the last. The dashboard would have named
 * one location while the tool that wrote the file used the other. Two readings
 * with nothing to prefer between them is the case this codebase declines
 * everywhere else, so it is declined here.
 */
function declaredLocation(reader: ConfinedReader, text: string): FieldReading {
  const block = readUnfenced(text);

  if (block.duplicates.includes(STORY_LOCATION_FIELD)) {
    return {
      kind: 'declined',
      reason: `${TRACKING_FILE} declares ${STORY_LOCATION_FIELD} more than once and nothing says which is meant: this reader takes the first and a YAML parser takes the last, so the two would disagree`,
    };
  }

  const declared = block.fields.get(STORY_LOCATION_FIELD);
  if (declared === undefined) {
    return block.skipped.includes(STORY_LOCATION_FIELD)
      ? {
          kind: 'declined',
          reason: `${TRACKING_FILE} has a ${STORY_LOCATION_FIELD} key with no value this reader will interpret`,
        }
      : { kind: 'undeclared' };
  }
  return { kind: 'value', value: declared, resolved: resolveDeclared(reader, declared) };
}

/** The adapter's answer, narrowed to the domain's four cases. */
function resolveDeclared(reader: ConfinedReader, declared: string): Resolution {
  const resolved = reader.resolveDeclared(declared);
  if (resolved.ok) return { kind: 'in-tree', path: toPlatform(resolved.path) };
  if (resolved.outcome === 'out-of-tree') {
    return { kind: 'out-of-tree', path: toPlatform(resolved.path) };
  }
  if (resolved.outcome === 'unresolved') {
    return { kind: 'unresolved', path: toPlatform(resolved.reportedPath), reason: resolved.reason };
  }
  // The sanitizer's rule is named in the sentence rather than carried as a type:
  // the rule vocabulary lives in the filesystem adapter, and the domain may not
  // import it (the purity gate forbids the direction).
  return {
    kind: 'refused',
    reason: `${STORY_LOCATION_FIELD} was refused by the path-segment sanitizer (${resolved.rule} in ${JSON.stringify(resolved.component)}): ${resolved.reason}`,
  };
}
