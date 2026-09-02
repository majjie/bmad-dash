/**
 * AD-8's four signal states, and the one signal Story 1.9 records in them.
 *
 * AD-8 fixes **four** states — `present`, `absent`, `unreadable`, `unchecked` —
 * as "the single vocabulary used by the model, the conventions table, and the
 * UI", per artifact *and per signal*. Three modules had already grown their own
 * copy of the four (`src/adapters/fs/read.ts`'s `Child`,
 * `src/adapters/fs/walk.ts`'s `WalkEntry`, `src/cli/location.ts`'s `Refusal`
 * for three of them) while nothing gave the vocabulary a home, so there was
 * nowhere for a *second* signal to be recorded in it. This is that home.
 *
 * **A signal, never an identity outcome.** What an artifact *is* stays Story
 * 1.7's single authority (AD-4): `src/domain/identity.ts` owns `Verdict`, and
 * nothing here re-derives, overrides or widens it. `Verdict` has no
 * `unreadable` outcome and its `Confidence` is a closed two on purpose, which
 * is exactly why readability could not be expressed as an identity state and
 * is expressed as its own signal instead. The two travel side by side on an
 * inventory entry: a file whose bytes are unusable can still be identified by
 * its location, and saying so is more honest than either collapsing them or
 * reporting `certain` over content nobody could read (NFR-3).
 *
 * **Exactly the four, and no fifth.** `test/domain/signal.test.ts` reads the
 * four names out of `ARCHITECTURE-SPINE.md`'s own AD-8 rule and the four labels
 * out of `EXPERIENCE.md`'s string index, so a fifth state or a reworded label
 * is a failing test rather than a divergence. Out-of-tree, over-limit and
 * not-a-regular-file are **stages**, not states — the shape the untyped-`reason`
 * finding in `deferred-work.md` prescribes (its summary: "`Listing`'s failure
 * carries an untyped `reason: string`"; cited by summary rather than by line,
 * because closing it moved the entry and the line citation went stale in the
 * same commit), and the one the walk already follows.
 *
 * **Nothing here imports anything.** The purity gate (`test/support/gate.ts`,
 * `PURE_LAYER`) fails any specifier that leaves `src/domain/`, including a
 * type-only one, so this module describes a read in its own terms and holds no
 * path, no reader and no `node:fs` type. The dependency runs the other way:
 * `src/adapters/fs/read.ts` imports `ReadStage` from here rather than spelling
 * a fourth copy of the vocabulary, which the spine permits (a port may depend
 * on the domain, never the reverse).
 */

/**
 * AD-8's four, in AD-8's own order.
 *
 * The parenthetical definitions are the spine's, kept verbatim because the
 * distinction between the last two is the whole point of the vocabulary:
 * "nothing was flagged" must never be indistinguishable from "nothing was
 * checked" (FR-76).
 *
 *   - `present` — the signal was examined and is there.
 *   - `absent` — looked for, not there.
 *   - `unreadable` — found, could not be parsed.
 *   - `unchecked` — not examined at this altitude.
 */
export type SignalState = 'present' | 'absent' | 'unreadable' | 'unchecked';

/** The four as a value, so a consumer can enumerate them without a second list. */
export const SIGNAL_STATES: readonly SignalState[] = [
  'present',
  'absent',
  'unreadable',
  'unchecked',
];

/**
 * How each state is named to a reader.
 *
 * `EXPERIENCE.md`'s load-bearing string index is normative and every entry in
 * it is used verbatim, so these are read from it by test rather than restated
 * from memory — the same mechanism `LEVEL_LABELS` uses one module over, and for
 * the same reason: a literal that merely happens to match is a second copy of
 * one belief, free to drift the moment either side is edited.
 *
 * Note that `absent` reads `Not found` and `unchecked` reads `Not checked` —
 * the two the index insists "must never collapse into 'none'". Rendering the
 * sentence is the render layer's job; this is the vocabulary, not page copy.
 */
export const SIGNAL_LABELS: Readonly<Record<SignalState, string>> = {
  present: 'Present',
  absent: 'Not found',
  unreadable: 'Unreadable',
  unchecked: 'Not checked',
};

/**
 * Where an attempt to read an artifact's content stopped.
 *
 * The typed half of "naming what failed and at which stage": a raw `EACCES`
 * does not say which question was being asked when it arrived, and a state
 * alone does not either. Six stages, and the first three are deliberately the
 * same three names `ChildStage` already uses, because a walk failure *is* how
 * an artifact's content becomes unreadable and paraphrasing the stage on the
 * way through would be a second vocabulary for one fact:
 *
 *   - `confinement` — the path resolved outside the one permitted root and was
 *     refused. Not an OS error at all: the filesystem answered and the answer
 *     was declined, so nothing was read and nothing will be (AD-9).
 *   - `resolve` — the path itself could not be resolved: a dangling link,
 *     `EACCES` on the way through, `ELOOP`, `ENAMETOOLONG`.
 *   - `read-directory` — the path resolved and is in bounds, and `readdir`
 *     still refused it. A directory's own content is its listing.
 *   - `examine` — the artifact was found and refused **before its bytes were
 *     read**: it is not a regular file (a FIFO, a socket, a device), or it is
 *     larger than the read limit. Refusing first is what keeps the pass from
 *     blocking forever on a FIFO and from pulling a gigabyte into a
 *     long-lived process.
 *   - `read` — the bytes themselves could not be read.
 *   - `decode` — the bytes were read and are not valid UTF-8 text. Its own
 *     stage rather than a flavour of `read`, because this is the row Story
 *     1.9's acceptance names and `readFileSync(path, 'utf8')` would have
 *     silently substituted U+FFFD instead of reaching it.
 *
 * The first three are pinned to the reader's own by two different mechanisms,
 * neither of which is a comment. `ChildStage` is `Extract`ed from this type, so
 * it cannot name a stage this vocabulary lacks; and `src/cli/inventory.ts`
 * assigns a walk entry's stage — spelled there as inline literals — straight
 * into a `Readability`, so **dropping one of the three names here fails the
 * typecheck at that assignment**. Measured by deleting `read-directory`, which
 * fails in `inventory.ts` and in `test/domain/signal.test.ts`'s `widen`.
 */
export type ReadStage =
  | 'confinement'
  | 'resolve'
  | 'read-directory'
  | 'examine'
  | 'read'
  | 'decode';

/** The six as a value, ordered as the read itself proceeds. */
export const READ_STAGES: readonly ReadStage[] = [
  'confinement',
  'resolve',
  'read-directory',
  'examine',
  'read',
  'decode',
];

/**
 * Whether an artifact's content could be read, in AD-8's four states.
 *
 * The typed pair and the raw detail travel **side by side** and are never
 * folded into one sentence: `state` and `stage` are what a machine reads and a
 * UI branches on, and `reason` is the OS's own words, kept untyped on purpose —
 * typing it would mean enumerating every errno or paraphrasing the platform.
 * That is the shape the untyped-`reason` finding in `deferred-work.md`
 * prescribes — cited by its summary, "`Listing`'s failure carries an untyped
 * `reason: string`", because closing that finding moved the entry and a line
 * citation would have gone stale in the same commit that wrote it. What it
 * replaces is `src/cli/inventory.ts` flattening the same three values into
 * `` `${state} at the ${stage} stage: ${reason}` ``.
 *
 * **`stage` is absent in exactly one case, and it means something:** nothing
 * was attempted at all, so there is no stage at which anything stopped. That
 * is the `unchecked` a file no precedence level needed to read reports — the
 * tool saying it did not look, rather than implying the content is fine.
 *
 * `present` carries neither field: there is no stage in a read that finished
 * and no reason for a fact that is simply true.
 */
export type Readability =
  | { readonly state: 'present' }
  | {
      readonly state: 'absent' | 'unreadable' | 'unchecked';
      /** Where the attempt stopped. Absent only when nothing was attempted. */
      readonly stage?: ReadStage;
      /** The raw detail beside the typed pair, never folded into it. */
      readonly reason: string;
    };

/**
 * The signal for content no level asked for.
 *
 * **Not `present`**, which is the whole of this story's measured defect: level
 * 1 resolves a family from an artifact's location without opening it, so a file
 * of invalid UTF-8 named `prd.md` under an artifact root was reported
 * `identified`, `certain`, with nothing anywhere saying its bytes had never
 * been touched. Reading eagerly to answer the question properly is the trade
 * this project deliberately took the other way — it pulled `maxEntries` ×
 * `MAX_READ_BYTES` through a synchronous decoder and discarded almost all of
 * it — so the honest answer is `unchecked`, and the limit that leaves is
 * recorded in the spec and in `deferred-work.md` rather than narrowed
 * silently.
 *
 * Frozen, because it is one shared value on every entry a pass produces and a
 * consumer that mutated it would rewrite the signal on all of them.
 */
export const UNREAD: Readability = Object.freeze({
  state: 'unchecked',
  reason: 'no precedence level needed this content, so nothing read it',
});

/**
 * The signal for a directory, whose content is not text at all.
 *
 * Also `unchecked`, and for a reason that had to be stated separately rather
 * than sharing `UNREAD`'s: nothing read a directory *as text*, but its listing
 * — which is what `read-directory` above calls a directory's content — very
 * often **was** read, and `UNREAD`'s "nothing read it" was therefore a false
 * sentence on every directory in a project. What the listing turned out to be
 * is recorded in its own field on the entry, in its own vocabulary, which is
 * why this signal does not restate it: two answers to one question is what
 * AD-8's per-signal rule exists to avoid.
 */
export const LISTING_NOT_TEXT: Readability = Object.freeze({
  state: 'unchecked',
  reason: 'nothing read this as text: a directory holds a listing, not a document',
});
