/**
 * FR-12 and FR-69 kept **distinct**, with both definitions written down.
 *
 * The corpus contradicts itself about these two and Story 1.9 is the story told
 * to settle it, so the decision is here rather than in a review note:
 *
 *   - `prd.md:177` (FR-12) — "Artifact shapes the tool does not recognize are
 *     listed as present-but-uninterpreted rather than hidden or silently
 *     dropped." That is about a *shape nothing can interpret*, said of an
 *     artifact the tool otherwise recognizes.
 *   - `prd.md:164` (FR-69) — "An artifact that no precedence level resolves is
 *     presented as unidentified, naming which levels were attempted." That is
 *     about identification itself failing.
 *   - `EXPERIENCE.md:170` writes "listed as present-but-uninterpreted, naming
 *     the levels tried (FR-69)", which is both terms in one sentence, and its
 *     string index (`:92`) carries one row for the pair. `epics.md:46,369,483`
 *     treats them as two.
 *
 * **Decided: two states, not one, and neither resolves the other by
 * precedence.** They answer different questions and a project can be in either
 * without being in the other — an unremarkable `.txt` no level resolves is
 * FR-69 and says nothing about shapes, while a directory of markdown with no
 * `index.md` under a recognized family root is identified at `certain` and
 * still has no shape any view can interpret, which is FR-12 exactly. Collapsing
 * them would report the second as "not identified" over a verdict that
 * identified it, which is the false claim AD-7's typed values exist to prevent.
 * `review-adversarial-seams.md:352-359`'s single closed enumeration was
 * considered and **not adopted** for that reason. `EXPERIENCE.md` is normative
 * and is not edited here: what the UI says for FR-69 is already in its string
 * index (`Not identified. Tried: …`), and that FR-12's state has **no row of
 * its own there** is recorded in `deferred-work.md` against Story 1.12 rather
 * than answered by inventing copy in a domain module.
 *
 * **It consumes the verdict and derives nothing.** AD-4 puts identity in one
 * module; this reads what `identity.ts` recorded — the shapes the verdict
 * carried — and classifies it. It never re-derives a family, a shape or a part,
 * and it cannot: it receives a `Verdict` and nothing else, no path, no listing
 * and no content.
 *
 * **Readability is a separate axis and is deliberately not consulted.** A `.png`
 * identified as a one-part document is `interpreted` here even though nothing
 * will render its bytes; whether an artifact's content could be *read* is
 * `src/domain/signal.ts`'s `Readability`, recorded beside this on the same
 * entry. Folding the two would make "unreadable" and "uninterpretable" one
 * word again, one story after they were separated.
 */

import type { Shape, Verdict } from './identity.ts';

/**
 * How much of an artifact anything can make of, in three states.
 *
 * Two of the three are the ones a surface reports, and each is owned by the
 * requirement it comes from; `interpreted` is the ordinary case and exists so
 * this is a total function over every verdict rather than a pair of flags.
 */
export type InterpretationState = 'interpreted' | 'present-but-uninterpreted' | 'unidentified';

/** The requirement that owns a state's term, or `none` for the ordinary case. */
export type Requirement = 'FR-12' | 'FR-69' | 'none';

/**
 * The three states in reporting order — the ordinary case first.
 *
 * A separate value from the table below, because a `Record` has no order worth
 * relying on and this is the order a surface would list them in.
 */
export const INTERPRETATION_STATES: readonly InterpretationState[] = [
  'interpreted',
  'present-but-uninterpreted',
  'unidentified',
];

/**
 * Every state's requirement and definition, recorded rather than described.
 *
 * **Keyed rather than searched**, so the typechecker makes the table total: a
 * fourth state added to the union fails to compile here instead of falling
 * through a lookup. That is not a style preference — the previous shape was an
 * array plus a `find` with a `?? { definition: '' }` fallback, which is an
 * empty extraction returned as a success, and AD-13 forbids exactly that. A
 * closed union has no honest fallback, so the fix is to have no fallback.
 *
 * The two reported definitions are the requirements' **own sentences**, quoted
 * verbatim: `test/domain/interpretation.test.ts` reads FR-12 and FR-69 out of
 * `prd.md` and compares, so a reworded requirement fails the suite instead of
 * quietly leaving two vocabularies in place — which is the state this story
 * inherited.
 */
export const INTERPRETATION_DEFINITIONS: Readonly<
  Record<InterpretationState, { readonly requirement: Requirement; readonly definition: string }>
> = {
  interpreted: {
    requirement: 'none',
    definition:
      'The recorded verdict carries a shape a view can interpret, so there is nothing to report here.',
  },
  'present-but-uninterpreted': {
    requirement: 'FR-12',
    definition:
      'Artifact shapes the tool does not recognize are listed as present-but-uninterpreted rather than hidden or silently dropped.',
  },
  unidentified: {
    requirement: 'FR-69',
    definition:
      'An artifact that no precedence level resolves is presented as unidentified, naming which levels were attempted. Identification is never guessed, and confidence is displayed where it is below certain.',
  },
};

/** The recorded definition of one state. */
export function definitionOf(state: InterpretationState): string {
  return INTERPRETATION_DEFINITIONS[state].definition;
}

/** The requirement that owns one state's term. */
export function requirementOf(state: InterpretationState): Requirement {
  return INTERPRETATION_DEFINITIONS[state].requirement;
}

/**
 * The shapes a verdict carried, as a question rather than a list.
 *
 * A predicate and not a second copy of `src/domain/document.ts`'s `shapesOf`:
 * that one deduplicates and preserves order because composition emits one
 * reading per shape, whereas the only thing asked here is whether *any* shape
 * survived as something interpretable. `unknown` is the authority's own word
 * for a shape it declined to claim — a directory carrying neither a run-folder
 * nor a sharded-document signal, an entry that is neither file nor directory,
 * or an ambiguity whose axes crossed — and it is exactly the case FR-12 names.
 */
function carriesInterpretableShape(
  verdict: Exclude<Verdict, { readonly outcome: 'unidentified' }>,
): boolean {
  const interpretable = (shape: Shape): boolean => shape !== 'unknown';
  if (verdict.outcome === 'identified') return interpretable(verdict.shape);
  return verdict.readings.some((reading) => interpretable(reading.shape));
}

/**
 * Which of the three applies to a recorded verdict.
 *
 * **The order is load-bearing, not cosmetic.** FR-69 is answered first because
 * an unidentified verdict carries no shape at all: delete the guard and it
 * falls through to the shape question, which finds nothing interpretable and
 * answers `present-but-uninterpreted` — the collapse this module exists to
 * prevent, arrived at by omission. The two states still cannot both *apply* to
 * one verdict; what the order decides is which question gets asked of a verdict
 * that has no answer to the second one. The type says so too: the shape
 * predicate below refuses an unidentified verdict, so removing the guard is a
 * compile error rather than a silent collapse.
 *
 * Never throws, for the reason `identify` and `compose` never do: this runs
 * once per entry in the snapshot pass, and AD-7 makes a failure a typed value
 * rather than an exception that would abort an inventory over one artifact.
 */
export function interpret(verdict: Verdict): InterpretationState {
  if (verdict.outcome === 'unidentified') return 'unidentified';
  return carriesInterpretableShape(verdict) ? 'interpreted' : 'present-but-uninterpreted';
}
