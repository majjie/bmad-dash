/**
 * Where a project keeps its stories, and the closed vocabulary for the answer.
 *
 * FR-51 says epic and story locations "are resolved from the `story_location`
 * field in `sprint-status.yaml`, which is per-project configuration, rather
 * than from a fixed path". Nothing read that field before this story —
 * measured, `grep -rn "story_location" src/` was empty — so the case FR-74
 * names, a value that "may be relative or absolute, and may point outside the
 * project", was not merely unhandled but unreachable.
 *
 * **The answer is a state on its own axis, and that is the decision this
 * module exists to record.** Three sources in the corpus disagreed about where
 * an out-of-tree location should be reported:
 *
 *   - the code precedent (`src/adapters/fs/walk.ts`, `src/cli/inventory.ts`)
 *     reports a confinement refusal as `unchecked` at the `confinement` stage;
 *   - `EXPERIENCE.md:168` says it is "reported at the artifact-family level,
 *     **not as a signal state**";
 *   - `review-state-coverage.md:125` (finding F5) says `unchecked` "misdescribes
 *     a deliberate refusal as inattention", and that inventing a fifth signal
 *     state would break a closed set `DESIGN.md` protects by name.
 *
 * Decided by the human, in this story's frozen intent: **a first-class location
 * state on its own axis.** It is not a fifth `SignalState` — AD-8 pins exactly
 * four, per artifact and per signal, and `test/domain/signal.test.ts` reads
 * that sentence out of the spine — and this does not overturn Story 1.9's "no
 * fifth state" record, which was about `SignalState`. Two different axes
 * answering two different questions is what AD-8's *per-signal* wording already
 * contemplates; one axis answering two would be the collapse it forbids.
 *
 * **Two of the eight spellings are deliberately shared with AD-8's four.**
 * `absent` and `unreadable` mean here what they mean there, said of the
 * tracking file rather than of an artifact's content, and a `StoryLocation`
 * carries both axes side by side. Sharing the word is the honest choice —
 * inventing `missing` and `undecodable` for the same two physical facts would
 * be a second vocabulary for one thing, which is what AD-8 exists against —
 * but it *is* a shared spelling and `test/domain/sprint.test.ts` asserts it in
 * both directions rather than looping past it.
 *
 * **Eight states where the frozen task list enumerates five.** The task line
 * names in-tree, out-of-tree, absent, undeclared and declined; the other three
 * each answer a question the five could only answer falsely, and each was
 * measured rather than imagined:
 *
 *   - `unreadable` — the same spec's I/O matrix carries a row for a tracking
 *     file that "exists and cannot be decoded", and requires it be "not
 *     conflated with absent".
 *   - `unresolved` — `in-tree` used to be returned for `docs/does-not-exist`,
 *     so it claimed nothing about the place existing while reading as though it
 *     did. FR-75 asks for sprint-derived views to be "unavailable rather than
 *     empty or broken", which needs a state that says *configured, in bounds,
 *     and not there*.
 *   - `ambiguous` — two files identified as sprint tracking used to be resolved
 *     by walk order, so a stray `sprint-status.yaml` anywhere in the tree could
 *     supply the project's location. FR-73's own rule is the one applied
 *     instead: present the ambiguity rather than resolve it silently.
 *
 * **Pure, and it reads nothing.** The purity gate forbids this module any
 * outgoing import beyond `src/domain/`, so it holds no path type, no reader and
 * no filesystem knowledge. Resolution is the adapter's
 * (`ConfinedReader.resolveDeclared`) and reading is the pass's; what arrives
 * here is what those two learned, and all this does is map it onto the
 * vocabulary. That split is also what makes "never read" checkable: a module
 * that cannot read cannot have read.
 *
 * **What it deliberately does not read.** `sprint-status.yaml`'s comment header
 * defines epic, story, retrospective and action-item status vocabularies, and
 * its `development_status` map holds a status per story. Those are Story 2.8's,
 * with NFR-6 and AD-13 assigned there. This module takes one scalar and claims
 * nothing about the rest of the file.
 */

import type { ReadStage, Readability } from './signal.ts';

/** The file BMAD's sprint planning writes, named as BMAD names it (AD-8). */
export const TRACKING_FILE = 'sprint-status.yaml';

/** The one field this story reads out of it (FR-51). */
export const STORY_LOCATION_FIELD = 'story_location';

/**
 * Where the configured story location landed — eight states, closed.
 *
 *   - `in-tree` — resolved through the platform's own resolver, and inside the
 *     one permitted root. The only state from which anything may be read, and
 *     it now means the place is actually there: see `unresolved`.
 *   - `out-of-tree` — resolved, and outside it. Reported with its path and
 *     **never read** (AD-9, FR-74). The state the whole axis exists for.
 *   - `unresolved` — inside the root by its spelling, and the platform could
 *     not resolve it: not there, or `EACCES` on the way through, or `ELOOP`.
 *     Its own state because `in-tree` must not imply readable (FR-75).
 *   - `absent` — there is no `sprint-status.yaml`. A normal project shape and
 *     not an error (FR-75).
 *   - `ambiguous` — more than one artifact in this project is identified as
 *     sprint tracking, and nothing says which is authoritative. Presented
 *     rather than resolved (FR-73); the alternative was letting sort order
 *     decide what the tool may read.
 *   - `undeclared` — the file is there and readable and has no `story_location`
 *     key. Distinct from `absent` and from `declined`: nobody said anything, as
 *     against there being nothing to say it in.
 *   - `declined` — the key is there and the tool would not use what it found:
 *     `story_location:` with nothing after it, a value the AD-10 sanitizer
 *     refused, or the key declared twice with two different values. Never an
 *     empty success (AD-13).
 *   - `unreadable` — the file is there and its bytes could not be used, so what
 *     it declares is unknown.
 */
export type LocationState =
  | 'in-tree'
  | 'out-of-tree'
  | 'unresolved'
  | 'absent'
  | 'ambiguous'
  | 'undeclared'
  | 'declined'
  | 'unreadable';

/**
 * The eight as a value, in the order a report would list them.
 *
 * A separate value from the table below for the reason
 * `INTERPRETATION_STATES` is: a `Record` has no order worth relying on, and a
 * consumer enumerating the vocabulary should not have to build a second list.
 */
export const LOCATION_STATES: readonly LocationState[] = [
  'in-tree',
  'out-of-tree',
  'unresolved',
  'absent',
  'ambiguous',
  'undeclared',
  'declined',
  'unreadable',
];

/**
 * The requirement or architecture decision that owns a state's meaning.
 *
 * Every value is a real identifier in a normative document, and
 * `test/domain/sprint.test.ts` reads each one out of `prd.md` or
 * `ARCHITECTURE-SPINE.md` rather than trusting the spelling. That check exists
 * because this table shipped with a wrong citation: `unreadable` cited FR-74,
 * the *out-of-tree* requirement, in a table whose only purpose is recording
 * which requirement owns a state's meaning.
 */
export type LocationBasis = 'FR-51' | 'FR-73' | 'FR-74' | 'FR-75' | 'AD-8' | 'AD-9' | 'AD-13';

/**
 * Every state's basis and definition, recorded rather than described.
 *
 * **Keyed rather than searched**, on `INTERPRETATION_DEFINITIONS`' precedent
 * and for its reason: the typechecker makes the table total, so a ninth state
 * added to the union fails to compile here instead of falling through a lookup
 * to an invented default. A closed union has no honest fallback, so there is
 * none.
 */
export const LOCATION_DEFINITIONS: Readonly<
  Record<LocationState, { readonly basis: LocationBasis; readonly definition: string }>
> = {
  'in-tree': {
    basis: 'FR-51',
    definition:
      'The configured story location resolved inside the one permitted root and the platform resolved it, so it is there and it can be read from.',
  },
  'out-of-tree': {
    basis: 'AD-9',
    definition:
      'The configured story location resolved outside the one permitted root. It is recorded as out-of-tree and reported, never read and never served.',
  },
  unresolved: {
    basis: 'FR-75',
    definition:
      'The configured story location is inside the root by its spelling and the platform could not resolve it, so the place it names is unavailable rather than empty or broken. Nothing may be read from it.',
  },
  absent: {
    basis: 'FR-75',
    definition:
      'There is no sprint-status.yaml. Absence of sprint tracking is a normal project shape, not an error.',
  },
  ambiguous: {
    basis: 'FR-73',
    definition:
      'More than one artifact is identified as sprint tracking and nothing says which is authoritative, so the ambiguity is presented rather than resolved silently.',
  },
  undeclared: {
    basis: 'FR-51',
    definition:
      'sprint-status.yaml was read and declares no story_location, so there is no configured location, which is a different fact from there being no file.',
  },
  declined: {
    basis: 'AD-13',
    definition:
      'story_location is present and the tool would not use what it found, because the key says nothing, or the sanitizer refused the spelling, or the key was declared more than once with different values. A declined value is never reported as an empty success.',
  },
  unreadable: {
    basis: 'AD-8',
    definition:
      'sprint-status.yaml is there and its content could not be read, so what it declares is unknown. Recorded in the same four-state signal vocabulary every other unreadable artifact uses.',
  },
};

/**
 * `EXPERIENCE.md`'s own sentence for the out-of-tree case, with its placeholder.
 *
 * The string index is normative and every entry in it is used verbatim, so this
 * is held here and pinned against the document by test — the mechanism
 * `SIGNAL_LABELS` uses one module over, and for the same reason: a literal that
 * merely happens to match is a second copy of one belief.
 *
 * **There is no such string for FR-75.** The index has this row and no row for
 * a sprint-derived view being unavailable, so nothing is invented here — the
 * gap is recorded in `deferred-work.md` against Story 1.12, exactly as Story
 * 1.9 recorded FR-12's missing row.
 */
export const OUT_OF_TREE_STRING = 'Story location points outside the project: <path>. Not read.';

/**
 * The normative sentence with its `<path>` substituted.
 *
 * The substitution the constant above shipped without, and the reason it needed
 * one: `locateStories` was composing a *second*, non-normative phrasing of the
 * same fact for `reason` — which also printed the absolute project root — so one
 * state had two sentences and only one of them was the index's. Now there is one
 * sentence, it is the index's, and it names the declared location and nothing
 * else. Rendering the surface around it is still the render layer's job.
 */
export function outOfTreeReport(path: string): string {
  return OUT_OF_TREE_STRING.replace('<path>', path);
}

/**
 * Where a declared value landed, in the adapter's terms.
 *
 * The adapter's `DeclaredLocation` narrowed to what the rule needs: this module
 * is pure, so it cannot name a `CanonicalPath` and does not try. `path` is the
 * platform spelling the adapter handed over, carried for the report only —
 * `out-of-tree` carries one precisely so the reported sentence can name the
 * place, and nothing may read from it.
 *
 * `refused` and `unresolved` keep their detail as sentences rather than typed
 * rules and codes, because the rule vocabulary belongs to the sanitizer and the
 * code to the platform, and importing either would invert the dependency the
 * purity gate protects.
 */
export type Resolution =
  | { readonly kind: 'in-tree'; readonly path: string }
  | { readonly kind: 'out-of-tree'; readonly path: string }
  | { readonly kind: 'unresolved'; readonly path: string; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * What the tracking file said about `story_location`.
 *
 * AD-13's shape, applied to this reader: three answers, and none of them is an
 * empty string. The resolution lives **inside** the `value` variant rather than
 * beside it, so "a value that was never resolved" and "a resolution with no
 * value" are combinations that do not typecheck.
 */
export type FieldReading =
  | { readonly kind: 'value'; readonly value: string; readonly resolved: Resolution }
  | { readonly kind: 'undeclared' }
  | { readonly kind: 'declined'; readonly reason: string };

/**
 * What happened when the pass went looking for the tracking file.
 *
 * Four shapes: the file's own two failures, the "which file" failure, and a
 * successful read carrying what the field said. A `stage` on `unreadable`
 * because Story 1.9's contract is "naming what failed and at which stage", and
 * the stage vocabulary is `ReadStage` rather than a fourth copy of it.
 */
export type Tracking =
  | { readonly kind: 'read'; readonly field: FieldReading }
  | {
      readonly kind: 'absent';
      /**
       * Where the attempt stopped, **or absent because nothing was attempted.**
       *
       * The distinction `Readability` documents, and this is the caller that has
       * both: a project with no `sprint-status.yaml` at all was answered from
       * the walk's own output, so no read of that path was ever begun and there
       * is no stage to name; a file that vanished between the walk and the read
       * failed at `resolve`, and saying so is the difference between "this
       * project keeps no sprint tracking" and "it did a moment ago".
       */
      readonly stage?: ReadStage;
      readonly reason: string;
    }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly string[] }
  | { readonly kind: 'unreadable'; readonly stage: ReadStage; readonly reason: string };

/**
 * The recorded answer: one location state, plus the evidence for it.
 *
 * `path` and `declared` are `undefined` rather than empty strings wherever
 * there is nothing to report, which is the same correction `InventoryEntry`'s
 * `interpretation` records: an empty string is a claim, and `undefined` is the
 * absence of one.
 *
 * `tracking` is Story 1.9's `Readability` **reused, not restated** — the signal
 * for reading `sprint-status.yaml` itself, in AD-8's four states with its stage
 * and its reason. It sits beside the location state rather than inside it
 * because they answer different questions: whether the file could be read, and
 * where the value it carried points.
 */
export interface StoryLocation {
  readonly state: LocationState;
  /**
   * The location as resolved, in the platform's spelling — for the report.
   *
   * Present for `in-tree`, `out-of-tree` and `unresolved`, and for nothing
   * else. Only the first may be read from: an `out-of-tree` path is a
   * **reportable** value and never a readable one, because FR-74's whole point
   * is that the tool says where the value pointed without going there, and an
   * `unresolved` path is a spelling whose links were never followed.
   */
  readonly path: string | undefined;
  /** The raw value the file declared, where it declared one. */
  readonly declared: string | undefined;
  /**
   * Every artifact identified as sprint tracking, where there was not exactly
   * one — project-root-relative, so a report can name them.
   *
   * Empty for every state but `ambiguous`. A list rather than a count because
   * "one of these two is wrong" is only actionable if the reader is told which
   * two.
   */
  readonly candidates: readonly string[];
  /** Whether `sprint-status.yaml` itself could be read — Story 1.9's signal. */
  readonly tracking: Readability;
  /** Why this state, in a sentence — the adapter's or this module's own words. */
  readonly reason: string;
}

/** The shape every branch below fills in, so no branch can forget a field. */
const NOTHING = {
  path: undefined,
  declared: undefined,
  candidates: [] as readonly string[],
} as const;

/**
 * Map what the pass learned onto the location vocabulary.
 *
 * Total over `Tracking`, and every branch names its state explicitly rather
 * than defaulting: there is no fallthrough for a shape nobody thought about,
 * because a wrong location state is a claim about where this tool may read.
 *
 * Never throws, for the reason `identify`, `compose` and `interpret` never do:
 * this runs once per pass and AD-7 makes a failure a typed value rather than an
 * exception that would abort an inventory over one configuration field.
 */
export function locateStories(tracking: Tracking): StoryLocation {
  if (tracking.kind === 'absent') {
    return {
      ...NOTHING,
      state: 'absent',
      // `absent` on both axes, and they are not the same claim: the state says
      // this project keeps no sprint tracking, the signal says nothing was
      // found to read. FR-75 is the first, Story 1.9's vocabulary the second —
      // and the stage is forwarded rather than invented, so "no file, nothing
      // attempted" keeps the absent stage that means exactly that.
      tracking: { state: 'absent', stage: tracking.stage, reason: tracking.reason },
      reason: tracking.reason,
    };
  }

  if (tracking.kind === 'ambiguous') {
    const reason = `more than one artifact is identified as ${TRACKING_FILE} and nothing says which is authoritative: ${tracking.candidates.join(', ')}`;
    return {
      ...NOTHING,
      state: 'ambiguous',
      candidates: tracking.candidates,
      // `unchecked`, not `unreadable`: no read was attempted, because the
      // question of *which* file to read has no answer. Naming a stage would
      // claim an attempt that never happened.
      tracking: { state: 'unchecked', reason },
      reason,
    };
  }

  if (tracking.kind === 'unreadable') {
    return {
      ...NOTHING,
      state: 'unreadable',
      tracking: { state: 'unreadable', stage: tracking.stage, reason: tracking.reason },
      // Deliberately says what is *unknown* rather than describing the file. A
      // reader who is told only "could not decode" will assume the location is
      // the default; the honest report is that the declaration was not read.
      reason: `${TRACKING_FILE} could not be read, so what it declares about ${STORY_LOCATION_FIELD} is unknown: ${tracking.reason}`,
    };
  }

  // The file was read, so its own signal is `present` on every branch below.
  // That is a fact about the file and stays true whatever the field said —
  // conflating "the file is fine" with "the field is usable" is what the two
  // axes exist to keep apart.
  const read: Readability = { state: 'present' };
  const field = tracking.field;

  if (field.kind === 'undeclared') {
    return {
      ...NOTHING,
      state: 'undeclared',
      tracking: read,
      reason: `${TRACKING_FILE} declares no ${STORY_LOCATION_FIELD}`,
    };
  }

  if (field.kind === 'declined') {
    return { ...NOTHING, state: 'declined', tracking: read, reason: field.reason };
  }

  if (field.resolved.kind === 'refused') {
    // The sanitizer's refusal, reported as `declined` — the tool declined the
    // value — and never as `out-of-tree`, which would claim a place the value
    // was never resolved to.
    return {
      ...NOTHING,
      state: 'declined',
      declared: field.value,
      tracking: read,
      reason: field.resolved.reason,
    };
  }

  if (field.resolved.kind === 'out-of-tree') {
    return {
      ...NOTHING,
      state: 'out-of-tree',
      path: field.resolved.path,
      declared: field.value,
      tracking: read,
      // The string index's own sentence, substituted. One state, one phrasing.
      reason: outOfTreeReport(field.resolved.path),
    };
  }

  if (field.resolved.kind === 'unresolved') {
    return {
      ...NOTHING,
      state: 'unresolved',
      path: field.resolved.path,
      declared: field.value,
      tracking: read,
      reason: `${STORY_LOCATION_FIELD} is inside the project and could not be resolved, so nothing there can be read: ${field.resolved.reason}`,
    };
  }

  return {
    ...NOTHING,
    state: 'in-tree',
    path: field.resolved.path,
    declared: field.value,
    tracking: read,
    reason: `${STORY_LOCATION_FIELD} resolves inside the project`,
  };
}
