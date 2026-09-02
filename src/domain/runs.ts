/**
 * What a run folder's **name** cannot carry, recorded beside the verdict.
 *
 * Two facts, and neither has anywhere else to live. A run-folder name says what
 * family the folder belongs to and — for five of the seven patterns — one date.
 * It does not say whether that name can be produced twice, and for two of the
 * seven it does not say anything about time at all. Both facts are consequences
 * of BMAD's own naming, measured against v6.11.0 and specified nowhere, and
 * both are needed by work that has not been built yet: FR-71's "the tool must
 * not assume one folder equals one run" is a claim a surface has to be able to
 * make, and FR-72's dateless pair has to reach FR-14's tier 5 reading **absent**
 * rather than zero.
 *
 * **It consumes the verdict and derives nothing.** AD-4 puts identification in
 * one module; this reads what `identity.ts` recorded — the families whose
 * reading carried a `run-folder` shape — and looks up facts about the pattern
 * that names them. It never re-derives a family, a shape or a name: it receives
 * a `Verdict` and nothing else, no path, no listing and no content. The same
 * arrangement `interpretation.ts` uses, and for the same reason.
 *
 * **No run count, and the absence is deliberate.** The signal that would tell
 * one run from two *does not exist* in a BMAD run folder, so nothing here
 * counts, estimates or approximates. `RUN_COUNT_BASIS` records why, item by
 * item, because "we did not implement it" and "it cannot be implemented from a
 * folder's contents" are different claims and only the second is true. What
 * ships is FR-71's negative clause plus the disclosure that a collision is
 * possible; detecting an actual second run needs git and belongs to Epic 3.
 *
 * **The collision surface is seven of seven, not four of seven.** FR-71's
 * literal wording names the four `{family}-{project_name}-{date}` patterns, and
 * it is true of them — but the other three collide too, and BMAD *intends* them
 * to: a spec folder is reopened under the same slug, a forge folder under the
 * same bare slug, a research folder under the same topic. So the fact is split
 * into two axes: **whether** the pattern can collide, which is true for all
 * seven, and **whether that reuse is deliberate**, which separates the three
 * BMAD offers to resume from the four where a same-day rerun is an accident of
 * the naming. Collapsing them would either overstate FR-71 (four folders
 * flagged, three silently as risky) or understate it (seven flagged alike,
 * three of them wrongly).
 *
 * **No page copy here.** `EXPERIENCE.md` is normative and its string index is
 * used verbatim; the one row it carries for this state
 * (`Run folder may hold several runs`) has no wording for the deliberate/
 * accidental distinction or for an absent date signal, and inventing it in a
 * domain module is exactly the drift the index exists to prevent. The gap is
 * recorded in `deferred-work.md` against Story 1.12, as Story 1.9 did for
 * FR-12. What is here is data and the requirements' own sentences.
 *
 * **Nothing here imports anything outside the pure layer** — the purity gate
 * (`test/support/gate.ts`, `PURE_LAYER`) has no `import type` exemption, so the
 * authority beside it is the only permitted dependency.
 */

import { RUN_FOLDER_FAMILIES, type Family, type RunFolderFamily, type Verdict } from './identity.ts';

/**
 * Whether BMAD reuses the name on purpose.
 *
 * `deliberate` — BMAD offers to resume the existing folder, so a second run
 * under one name is the intended workflow: a spec reopened by slug, a forge
 * run by slug, a research run by topic.
 *
 * `accidental` — the name simply repeats, because both of its components are
 * constant for a day. This is the dangerous one and it is the direction FR-71
 * points: the resume offer for these four is conditional on the existing
 * document not being final, so a same-day re-create over a finalized document
 * overwrites it with no prompt.
 */
export type Reuse = 'deliberate' | 'accidental';

/**
 * Whether the folder name offers a date at all.
 *
 * `absent`, not zero and not "unknown": FR-72's two patterns carry no date
 * component, so FR-14's tier 5 has nothing to read for them and must say so.
 * Reporting a missing date as an old one, or as an empty value that sorts
 * first, is the ordering lie this state exists to prevent.
 */
export type DateSignal = 'present' | 'absent';

/**
 * The only answer there is to "how many runs is this folder".
 *
 * A single-value union rather than a number, so a mutation that claims a count
 * has to change this type: there is no arithmetic to get wrong because there is
 * no quantity to compute. See `RUN_COUNT_BASIS`.
 */
export type RunCount = 'unknowable';

export const RUN_COUNT: RunCount = 'unknowable';

/**
 * Why the count is unknowable from the folder itself, measured item by item.
 *
 * Every per-run signal a BMAD run folder could have carried, and what each one
 * actually does. None of them distinguishes one run from two, and the last is
 * FR-14's own last resort.
 */
export const RUN_COUNT_BASIS: readonly string[] = [
  "`memlog.py`'s `init` errors on a second run, so both runs append to one log rather than starting a second",
  'document frontmatter dates are day-resolution and are overwritten in place, so a rerun leaves one date',
  'no file a run writes is numbered or otherwise per-run',
  "filesystem mtime is FR-14's own last resort and is actively misleading after a clone, checkout or pull",
];

/** The two facts, and the requirement whose sentence defines each. */
export type RunFactAxis = 'collision' | 'date-signal';

/** The axes in reporting order, collision first — it is the one FR-71 names. */
export const RUN_FACT_AXES: readonly RunFactAxis[] = ['collision', 'date-signal'];

/**
 * Each axis's requirement and definition, recorded rather than described.
 *
 * **Keyed rather than searched**, so the typechecker makes the table total: a
 * third axis fails to compile here instead of falling through a lookup with an
 * empty fallback, which AD-13 forbids and `interpretation.ts` explains at
 * length.
 *
 * The definitions are the requirements' **own sentences**, quoted verbatim:
 * `test/domain/runs.test.ts` reads FR-71 and FR-72 out of `prd.md` and
 * compares, so a reworded requirement fails the suite rather than leaving a
 * restatement standing beside it.
 */
export const RUN_FACT_DEFINITIONS: Readonly<
  Record<RunFactAxis, { readonly requirement: string; readonly definition: string }>
> = {
  collision: {
    requirement: 'FR-71',
    definition:
      'A run folder may contain more than one run. Four of seven run-folder patterns are `{family}-{project_name}-{date}`, in which both components are constant within a day, so same-day reruns land in the same folder. The tool must not assume one folder equals one run.',
  },
  'date-signal': {
    requirement: 'FR-72',
    definition:
      'Two run-folder patterns (`spec-{slug}`, `{slug}`) carry no date at all, and a spec folder is deliberately reopened under the same slug. Ordering for these families falls to the FR-14 hierarchy without any folder-name signal.',
  },
};

/** What is known about the pattern that names one family's run folders. */
export interface RunPattern {
  /**
   * The name shape, as BMAD produces it. Measured from each skill's
   * `run_folder_pattern`, and stated nowhere in BMAD's own documentation.
   *
   * This is a **second spelling** of `identity.ts`'s `RUN_FOLDER_PATTERNS`
   * prefix, kept because the whole shape is what a reader needs and a bare
   * prefix is not — and pinned against it rather than trusted:
   * `test/domain/runs.test.ts` asserts that each family's pattern begins with
   * the prefix the authority matches on, with research and forge as the two
   * stated exceptions (a research prefix is one of six types, and forge has no
   * prefix at all).
   */
  readonly pattern: string;
  /**
   * True for all seven — see the header for why that is not FR-71's four.
   *
   * Typed as the **literal** `true` rather than `boolean`, for the reason
   * `RunCount` is a single-value union: a fact that is invariantly true in
   * every row should not be expressible as false without changing the type, so
   * a mutation has to be a deliberate edit here rather than a value a test
   * happens to catch.
   */
  readonly canCollide: true;
  readonly reuse: Reuse;
  readonly dateSignal: DateSignal;
  /** Why this row says what it says, in the measurement's own terms. */
  readonly basis: string;
}

/**
 * The seven patterns' collision and date facts.
 *
 * **Keyed on `RunFolderFamily`**, not on `Family`, so the table is total by
 * construction over exactly the families a run-folder *pattern* can resolve
 * to: an eighth run-folder family fails to compile here.
 *
 * **The other families have no row, and one of them can still arrive here.**
 * `review` is the case, and it is one this story created: a directory named
 * `review-round-1` sitting directly inside an artifact root takes its family
 * from the new prefix rule and its shape from position — `sitsWhereRunsLive`
 * calls any directory where runs live a run folder, deliberately, since
 * position is the only signal a forge run has. So the verdict pairs `review`
 * with `run-folder`, no pattern row exists, and `runFactsOf` answers
 * `unmeasured` with the reason. That is what the second branch of `RunFacts`
 * is for, and it is asserted in `test/domain/runs.test.ts` over exactly that
 * path — the earlier version of this comment claimed such a pairing could not
 * happen, which was wrong on the day it was written.
 */
export const RUN_PATTERNS: Readonly<Record<RunFolderFamily, RunPattern>> = {
  brief: {
    pattern: 'brief-{project_name}-{date}',
    canCollide: true,
    reuse: 'accidental',
    dateSignal: 'present',
    basis:
      'both name components are constant within a day, so a same-day rerun lands in this folder; the resume offer is conditional on the existing document not being final',
  },
  prd: {
    pattern: 'prd-{project_name}-{date}',
    canCollide: true,
    reuse: 'accidental',
    dateSignal: 'present',
    basis:
      'both name components are constant within a day, so a same-day rerun lands in this folder; the resume offer is conditional on the existing document not being final',
  },
  architecture: {
    pattern: 'architecture-{project_name}-{date}',
    canCollide: true,
    reuse: 'accidental',
    dateSignal: 'present',
    basis:
      'both name components are constant within a day, so a same-day rerun lands in this folder; the resume offer is conditional on the existing document not being final',
  },
  'ux-design': {
    pattern: 'ux-{project_name}-{date}',
    canCollide: true,
    reuse: 'accidental',
    dateSignal: 'present',
    basis:
      'both name components are constant within a day, so a same-day rerun lands in this folder; the resume offer is conditional on the existing document not being final',
  },
  research: {
    pattern: '{research_type}-{topic}-{date}',
    canCollide: true,
    reuse: 'deliberate',
    dateSignal: 'present',
    basis:
      "the topic slug is the user's own, and re-running the same topic on the same day reopens this folder rather than making a second one",
  },
  spec: {
    pattern: 'spec-{slug}',
    canCollide: true,
    reuse: 'deliberate',
    dateSignal: 'absent',
    basis:
      'dateless, and the slug is deliberately reused to reopen an existing spec and update it in place',
  },
  forge: {
    pattern: '{slug}',
    canCollide: true,
    reuse: 'deliberate',
    dateSignal: 'absent',
    basis:
      'dateless and shapeless — a bare slug, which is also why no name pattern matches a forge folder and only its location identifies it',
  },
};

/**
 * The run facts for one family a verdict read as a run folder.
 *
 * Two outcomes rather than one optional field, because "this family's pattern
 * cannot collide" and "no pattern for this family was ever measured" are
 * different answers and a surface must not render the second as the first.
 * `unmeasured` is reachable: a directory whose *name* matches a run-folder
 * pattern can have its family resolved by an earlier level — a folder called
 * `prd-x-2026-08-28` holding an `epics.md` is identified `epics` at level 3
 * with a `run-folder` shape — and `epics` has no run-folder pattern because
 * BMAD writes no epics runs.
 */
export interface MeasuredRunFacts extends RunPattern {
  readonly outcome: 'measured';
  /**
   * Narrowed to `RunFolderFamily`, not `Family`: `isRunFolderFamily` has
   * already proved it by the time this is built, and handing out the wide type
   * would throw that proof away at the boundary — a consumer could not switch
   * exhaustively over the seven, which is the whole benefit of the union this
   * story introduced.
   */
  readonly family: RunFolderFamily;
  /** Always `unknowable`. See `RUN_COUNT_BASIS`. */
  readonly runCount: RunCount;
}

export interface UnmeasuredRunFacts {
  readonly outcome: 'unmeasured';
  readonly family: Family;
  readonly runCount: RunCount;
  readonly reason: string;
}

export type RunFacts = MeasuredRunFacts | UnmeasuredRunFacts;

/** Whether a family is one a run-folder pattern resolves to. */
function isRunFolderFamily(family: Family): family is RunFolderFamily {
  return (RUN_FOLDER_FAMILIES as readonly Family[]).includes(family);
}

/**
 * The families a recorded verdict read as run folders, in the verdict's order.
 *
 * The shape is the question, not the family: FR-73's ambiguous case carries a
 * `run-folder` reading and a `sharded-document` reading of the same family, and
 * the run-folder half is still a run folder — so the ambiguity is not a reason
 * to withhold the facts. An ambiguity whose axes crossed carries `unknown`
 * shapes and therefore no run-folder reading, which is the honest answer: no
 * signal said run folder, so nothing here says anything.
 */
export function runFolderFamiliesOf(verdict: Verdict): readonly Family[] {
  if (verdict.outcome === 'identified') {
    return verdict.shape === 'run-folder' ? [verdict.family] : [];
  }
  if (verdict.outcome === 'unidentified') return [];
  const found: Family[] = [];
  for (const reading of verdict.readings) {
    if (reading.shape !== 'run-folder') continue;
    // Defensive, and unreachable today: `readingsOf` emits either one family
    // across distinct shapes or distinct families across one shape, so no two
    // readings can both be `run-folder` for the same family. Kept because the
    // cost is one `includes` and the failure it prevents — one folder reporting
    // the same collision fact twice — is the kind a surface renders before
    // anyone notices.
    if (!found.includes(reading.family)) found.push(reading.family);
  }
  return found;
}

/**
 * The run facts a recorded verdict implies, one entry per run-folder reading.
 *
 * Empty for everything that is not a run folder under any reading — a document,
 * a family's own container directory, a subfolder inside a run, an unidentified
 * entry, and anything the walk did not report present. That is not an absence
 * of information: a thing that is not a run folder has no run-folder facts, and
 * emitting a row of `false`s for it would invite a surface to render one.
 *
 * Never throws, for the reason `identify`, `compose` and `interpret` never do:
 * this runs once per entry in the snapshot pass, and AD-7 makes a failure a
 * typed value rather than an exception that aborts an inventory.
 */
export function runFactsOf(verdict: Verdict): readonly RunFacts[] {
  return runFolderFamiliesOf(verdict).map((family) => {
    if (!isRunFolderFamily(family)) {
      return {
        outcome: 'unmeasured',
        family,
        runCount: RUN_COUNT,
        reason: `no run-folder pattern was measured for the ${family} family, so nothing is claimed about collision or date signal`,
      };
    }
    return { outcome: 'measured', family, runCount: RUN_COUNT, ...RUN_PATTERNS[family] };
  });
}
