/**
 * The inventory surface: every artifact the pass found, grouped by family.
 *
 * **What this module is, and what it is not.** Stories 1.7 to 1.11 built a
 * model — an identity verdict, a readability signal, an interpretation state,
 * run facts, a story location — and nothing read it. This is the first
 * consumer. It renders and it decides nothing: every state word comes from the
 * vocabulary table that owns it, and every sentence is `EXPERIENCE.md`'s own
 * wording, held here as a constant and pinned against the document by
 * `test/render/inventory.test.ts`.
 *
 * **The view is this layer's own shape, and that is the layering rather than a
 * preference.** `ARCHITECTURE-SPINE.md` gives `src/render/` "domain types
 * only", and `Inventory` is not one: it lives in `src/cli/` because it
 * references `CanonicalPath` and `WalkEntry`, which the purity gate forbids the
 * domain importing. So the types below are declared here and the composition
 * root projects an `Inventory` into them. Nothing in this file may import from
 * `src/cli/` — the gate has no render rule of its own, so
 * `test/architecture.test.ts` grew one for this story.
 *
 * **Every project-derived value is escaped by construction.** The paths and
 * names here come off a project the user did not necessarily write, and
 * `markup` escapes every value it interpolates, so a file called
 * `<img src=x onerror=alert(1)>.md` renders as text. A tile no longer accepts a
 * raw string at all; see `./components.ts`.
 *
 * **What no document designed, recorded rather than presented as the designed
 * shape.** `EXPERIENCE.md` and `DESIGN.md` never mention an inventory: UX-DR15
 * fixes the surface list at five and the Dashboard's three named tiles are all
 * Epic 3 content. So the inventory takes the placeholder tile's slot on the
 * Dashboard as an **interim**, and the grouping, the row shape, the heading
 * levels, the per-family tile and the three label tables it reads are this
 * story's inventions. Each is recorded in `deferred-work.md`.
 *
 * **No colour carries meaning here, and that is not an accident of the
 * palette.** `DESIGN.md:221` records that `present`, `absent` and `unchecked`
 * converge under simulated protanopia, so the state word is load-bearing; the
 * signal-pill component that would colour them belongs to a later story and is
 * deliberately not emitted yet. Every state on this surface is a word.
 */

import {
  CONFIDENCE_LABELS,
  FAMILIES,
  FAMILY_LABELS,
  LEVELS,
  LEVEL_LABELS,
  SHAPE_LABELS,
  type Confidence,
  type Family,
  type Level,
  type Shape,
} from '../domain/identity.ts';
import type { InterpretationState } from '../domain/interpretation.ts';
import type { DateSignal, Reuse } from '../domain/runs.ts';
import { SIGNAL_LABELS, type ReadStage, type SignalState } from '../domain/signal.ts';
import type { SnapshotId } from '../domain/snapshot.ts';
import { outOfTreeReport, type LocationState } from '../domain/sprint.ts';
import type { TileContent, TileOptions } from './components.ts';
import { fillIndexString, markup, type Markup } from './html.ts';

// ---------------------------------------------------------------------------
// The string index, held verbatim
// ---------------------------------------------------------------------------

/**
 * The sentences this surface shows, verbatim from `EXPERIENCE.md`'s index,
 * `<placeholder>` spellings and all.
 *
 * Held as constants for the reason `src/render/chrome.ts` holds
 * `SIGNAL_NOT_CHECKED` and `src/cli/suggest.ts` holds its five: UX-DR17
 * requires the index's wording, and a literal in source that merely *happens*
 * to match is a second copy of one belief, free to drift the moment either side
 * is edited. `test/render/inventory.test.ts` asserts every one of these against
 * the document's own table, so a reworded row fails the suite.
 *
 * **Eleven of these rows did not exist.** The index calls itself "the complete
 * index", and it had no wording for FR-12's state, FR-69's confidence clause,
 * FR-75's unavailable view, the deliberate-versus-accidental reuse and
 * absent-date distinctions this project measured, a per-family empty sentence
 * that is true for a family that is never a run, or the scan's own
 * completeness. Four `deferred-work.md` entries said in advance that this story
 * must "either add a row to the string index or state which existing row it
 * uses and why". Rows were added; what each answers is recorded there.
 */

/** FR-69's own sentence. The `<levels>` are `LEVEL_LABELS`, in FR-8 order. */
export const UNIDENTIFIED = 'Not identified. Tried: <levels>.';

/**
 * FR-73's two readings, label-shaped and therefore without a period.
 *
 * Used **only** where the two shapes are exactly a run folder and a sharded
 * document, which is the case the row names. Any other pair of readings is
 * rendered as two type cells rather than pushed into this sentence, because a
 * sentence naming two things it was not written about is worse than no
 * sentence.
 */
export const AMBIGUOUS_RUN_OR_SHARDED = 'Could be a run folder or a sharded document';

/** FR-71's disclosure. Says nothing about how many; nothing can. */
export const RUN_MAY_HOLD_SEVERAL = 'This folder may contain more than one run.';

/** FR-12's state, on the row this story added for it. */
export const UNINTERPRETED = 'Present, but its shape was not interpreted.';

/** FR-69's confidence clause, on the row this story added for it. */
export const BELOW_CERTAIN = '<confidence>, not certain — resolved by <level>.';

/** The deliberate half of the reuse distinction `src/domain/runs.ts` measured. */
export const REUSE_DELIBERATE = 'Reusing this name is how BMAD resumes a run.';

/** The accidental half — the direction FR-71 points, and the dangerous one. */
export const REUSE_ACCIDENTAL = 'A same-day rerun lands in this folder.';

/** FR-72's dateless pair. `absent`, never zero and never an old date. */
export const NO_DATE_IN_NAME = 'No date in the folder name.';

/**
 * The per-family empty sentence.
 *
 * A **second** row rather than a reuse of `No <family> runs in this project.`,
 * which is false for four of the eleven families: BMAD writes no `epics`,
 * `story`, `sprint-tracking` or `note` runs, so "no runs" would be true of a
 * project holding every one of them.
 *
 * **It carries no `<family>` placeholder, and the first version did.** Filling
 * one from `FAMILY_LABELS` produced `No Story artifacts in this project.` — a
 * label, which the table's own doc says is label-shaped with an initial
 * capital, dropped into the middle of a sentence. The choice was a second
 * family table holding mid-sentence forms, or no substitution at all; the
 * second is right here because the tile's `h2` names the family one line
 * above, so repeating it inside the sentence was never carrying information.
 */
export const FAMILY_EMPTY = 'No artifacts of this family in this project.';

/** FR-51's location, where it resolved inside the project. */
export const STORY_LOCATION_IN_TREE = 'Stories are at <path>.';

/** FR-75's normal project shape, stated as a shape rather than as a failure. */
export const NO_SPRINT_TRACKING = 'No sprint tracking in this project.';

/** FR-75's requirement: unavailable rather than empty or broken. */
export const SPRINT_UNAVAILABLE = 'Sprint view unavailable.';

/**
 * The pass reporting on itself, so "nothing was flagged" is not silence.
 *
 * **Phrased so the count agrees at every value**, which the first version did
 * not: `<n> artifacts examined.` renders `1 artifacts examined.` and
 * `0 artifacts examined.`. The index's existing Oversight row
 * (`No findings. <n> artifacts examined.`) has the same flaw and nothing
 * renders it yet; copying its clause would have propagated the defect, so the
 * convention was fixed here instead and the Oversight row is recorded in
 * `deferred-work.md` for the story that renders it.
 */
export const SCAN_FINISHED = 'The scan finished. Artifacts examined: <n>.';

/** A bound reached, or names nobody can name. Never silently partial. */
export const SCAN_STOPPED = 'The scan did not finish, so an artifact may be missing.';

/**
 * What the scan deliberately did not look at.
 *
 * The skip policy's own tally, reported rather than left in the model. It is
 * **not** covered by the scan-finished sentence — `Inventory.complete`'s own
 * doc says so in as many words: "it says nothing about `skipped`; the skip
 * policy is the caller's own instruction, so a pass that deliberately left five
 * subtrees out is still complete in this sense". Measured on this repository,
 * thirteen names are skipped on every run and nothing on the page mentioned
 * one, which for a story whose contract is "nothing disappears from the view"
 * is the contract's own failure mode.
 */
export const SCAN_SCOPE = 'Names outside the artifact output tree, not examined: <n>.';

/**
 * A name the walk dropped as a second spelling of a path it already reported.
 *
 * The one loss the "it is already on that entry's own row" argument does not
 * cover, which is why it is on the page rather than folded into the
 * completeness claim: a suppressed spelling has **no row of its own** — the
 * artifact is reported under the other name — so without this nothing anywhere
 * mentions that the project holds a second name for it.
 */
export const ALIAS_REPORT = '<name> is a second spelling of <path>.';

/** The index's own sentence for a project with markers and nothing in them. */
export const PROJECT_EMPTY = 'A BMAD project, with no artifacts yet.';

// ---------------------------------------------------------------------------
// Labels this story invented, because no document carries them
// ---------------------------------------------------------------------------

/**
 * The caption on the content signal, so a row cannot contradict itself.
 *
 * Label-shaped, and modelled on the chrome one landmark up, which spells its
 * own signal `Git: Not checked` for exactly this reason. The review of this
 * story found the case it fixes, and it is the common case rather than an edge:
 * on a real project nearly every row reports `Not checked` for its content,
 * and beside FR-12's `Present, but its shape was not interpreted.` an uncaptioned
 * `Not checked` read as a contradiction — two answers to what looked like one
 * question. Captioned, the two axes are visible as two: the *content* was not
 * examined, and the *shape* was not interpreted.
 */
export const CONTENT_SIGNAL_LABEL = 'Content:';

/** Caption on the stage, so a bare machine value is not read as a state. */
export const STAGE_SIGNAL_LABEL = 'Stage:';

/**
 * The tile label for the pass's own report.
 *
 * Label-shaped, and invented: the Dashboard's three named tiles are Epic 3
 * content and none of them is this. Recorded in `deferred-work.md`.
 */
export const SCAN_TILE_LABEL = 'Scan';

/** The tile label for a project with no artifacts at all. Invented. */
export const ARTIFACTS_TILE_LABEL = 'Artifacts';

/**
 * The tile label for artifacts no single family claims.
 *
 * Two verdicts land here and they are different facts, both stated on the row
 * rather than in this label: an `unidentified` verdict, which resolved no
 * family at all, and an `ambiguous` one whose readings name two *families* —
 * which the tool declines to rank, so placing the row under one of them would
 * be the silent resolution AD-4 forbids.
 */
export const UNPLACED_TILE_LABEL = 'No family resolved';

// ---------------------------------------------------------------------------
// The view: what this layer consumes
// ---------------------------------------------------------------------------

/**
 * Whether an artifact's content could be read, in AD-8's four states.
 *
 * The domain's `Readability` flattened by one field: `state` and `stage` travel
 * together, and the `reason` beside them does **not** come across. That is
 * deliberate and it is on this story's Never list — `Readability.reason` is the
 * platform's own words or a hand-written sentence, and no normative document
 * backs either. What the reader gets is the state word and the stage, which is
 * the whole of "naming what failed and at which stage".
 *
 * **One signal per row, not two.** A row could have carried the walk's own
 * presence state as well, and it would have read as a contradiction — `Present`
 * beside `Not checked` on one line — needing a caption apiece to disambiguate.
 * It is unnecessary: for an entry the walk did not report present,
 * `initialReadability` forwards the walk's own state and stage, so this one
 * field already says `Not found`, `Unreadable` or `Not checked` with the stage
 * that produced it.
 */
export interface RowReadability {
  readonly state: SignalState;
  /** Where the attempt stopped, or `undefined` because nothing was attempted. */
  readonly stage: ReadStage | undefined;
}

/** One of the readings an ambiguous verdict refuses to choose between. */
export interface RowReading {
  readonly family: Family;
  readonly shape: Shape;
}

/**
 * What the recorded verdict said, narrowed to what a row shows.
 *
 * `attempted` is levels only. The domain's `Attempt` also carries a result and,
 * where a level could not run, a hand-written `reason`; FR-69 asks for "which
 * levels were attempted" and the index's sentence names exactly that, so the
 * rest is left where it was recorded.
 */
export type RowIdentity =
  | {
      readonly outcome: 'identified';
      readonly shape: Shape;
      readonly confidence: Confidence;
      readonly resolvedAt: Level;
    }
  | {
      readonly outcome: 'ambiguous';
      readonly readings: readonly RowReading[];
      readonly confidence: 'likely';
      readonly resolvedAt: Level;
    }
  | { readonly outcome: 'unidentified'; readonly attempted: readonly Level[] };

/**
 * What a run folder's name cannot carry, for one run-folder reading.
 *
 * `measured: false` is the `unmeasured` outcome, and it renders **nothing**:
 * `src/domain/runs.ts` says of it that "nothing is claimed about collision or
 * date signal", and the honest rendering of a claim nobody made is silence. Its
 * `reason` is hand-written and is on this story's Never list.
 */
export type RowRunFacts =
  | { readonly measured: false }
  | { readonly measured: true; readonly reuse: Reuse; readonly dateSignal: DateSignal };

/** One artifact, as a row. */
export interface ArtifactRow {
  /** Project-root-relative, `/`-separated — the spelling the pass reports. */
  readonly path: string;
  readonly identity: RowIdentity;
  readonly readability: RowReadability;
  /**
   * FR-12 or FR-69 or neither, and `undefined` for an artifact that is not
   * there — the domain's own distinction, carried rather than flattened.
   */
  readonly interpretation: InterpretationState | undefined;
  readonly runFacts: readonly RowRunFacts[];
}

/**
 * A fact about a family rather than about one artifact.
 *
 * One kind so far, and `EXPERIENCE.md:168` is why it is a family-level note
 * rather than a row or a signal state: an out-of-tree story location is
 * "reported at the artifact-family level, **not as a signal state**". The
 * family it is reported at is `story`, which is the family the value locates.
 *
 * The `reason` on `StoryLocation` is deliberately not here — it is
 * hand-written on seven of the eight states and no document backs it. What
 * crosses is the state and, where there is one to name, the path.
 */
export type GroupNote = {
  readonly kind: 'story-location';
  readonly report: StoryLocationReport;
};

/**
 * What there is to say about the configured story location, in four shapes.
 *
 * **A union rather than a state plus an optional path**, and the review of this
 * story is what forced it: the pair `{ state: 'in-tree', path: undefined }` was
 * representable, and it fell through the render's branches to
 * `Sprint view unavailable. in-tree` — an internal inconsistency reaching a
 * reader dressed as a ninth location state. Here it does not typecheck, so the
 * projection has to decide what such a value means and does so where the
 * evidence is.
 *
 * The eight `LocationState`s map onto these four:
 *
 *   - `at` — `in-tree`. Names the place, because that is the useful fact.
 *   - `outside` — `out-of-tree`. The index's own sentence, and never read.
 *   - `none` — `absent`. FR-75's normal project shape, said as a shape.
 *   - `unavailable` — the remaining five, which is FR-75's requirement exactly.
 *     It keeps the state so the five stay distinguishable without five
 *     sentences no document carries.
 */
export type StoryLocationReport =
  | { readonly kind: 'at'; readonly path: string }
  | { readonly kind: 'outside'; readonly path: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'unavailable'; readonly state: LocationState };

/**
 * One family's tile.
 *
 * `family` is `undefined` for the group holding artifacts no single family
 * claims. That group is rendered only when it has rows: there is no family to
 * say `No … artifacts in this project.` about.
 */
export interface FamilyGroup {
  readonly family: Family | undefined;
  readonly rows: readonly ArtifactRow[];
  readonly notes: readonly GroupNote[];
}

/**
 * The whole surface's input.
 *
 * `complete` is narrower than `Inventory.complete` on purpose, and the
 * composition root's projection is where that is argued: the walk's own
 * `complete` also goes false for an entry it could not read, which is a fact
 * already on that entry's own row — reporting it again as "the scan did not
 * finish" would be false, because the scan did finish.
 */
export interface InventoryView {
  readonly complete: boolean;
  /**
   * How many artifacts the pass reported, for the scan tile's own sentence.
   *
   * Not what decides the empty-project case — that is "no group holds a row",
   * asked of the groups themselves, so the count and the emptiness cannot
   * disagree.
   */
  readonly artifactCount: number;
  /**
   * How many names the skip policy left out — every one, recorded or not.
   *
   * Reported rather than dropped: the skip policy is the caller's own
   * instruction and so does not make the pass *incomplete*, but a reader told
   * only "the scan finished" has no way to know the scan's scope. See
   * `SCAN_SCOPE`.
   */
  readonly namesLeftOut: number;
  /** Second spellings the walk dropped, which have no row of their own. */
  readonly aliases: readonly AliasReport[];
  readonly groups: readonly FamilyGroup[];
  /**
   * AD-17: this response's identity, derived from the facts above rather than
   * minted. Two views built from an unchanged project carry the same id;
   * anything that changes what is rendered changes it. See
   * `src/cli/index.ts`'s `snapshotIdOf` for what is folded in and why.
   */
  readonly snapshotId: SnapshotId;
}

/** One name the walk dropped, and where the artifact behind it is reported. */
export interface AliasReport {
  readonly name: string;
  readonly reportedAt: string;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * One captioned state word, from the table that owns the vocabulary.
 *
 * The caption is what stops the row contradicting itself; see
 * `CONTENT_SIGNAL_LABEL`. The word itself is `SIGNAL_LABELS`', never a second
 * copy.
 */
function stateWord(state: SignalState): Markup {
  return markup`<span class="artifact-state">${CONTENT_SIGNAL_LABEL} ${SIGNAL_LABELS[state]}</span>`;
}

/**
 * The stage, captioned, as the machine value it is.
 *
 * Monospaced rather than given a label table of its own, which is DESIGN.md's
 * own rule: "if the string came from the filesystem or names a machine state it
 * is monospaced". A `ReadStage` is a closed vocabulary naming a machine state,
 * so it is shown as one — and inventing prose for six stages would have put
 * page copy no document carries into a surface that already had rows to add.
 * The caption is there so a bare `decode` is not read as a state of its own.
 */
function stageValue(stage: ReadStage): Markup {
  return markup`<span class="artifact-state">${STAGE_SIGNAL_LABEL} <code class="artifact-stage">${stage}</code></span>`;
}

/** One sentence about an artifact, beside its state words. */
function note(sentence: string): Markup {
  return markup`<span class="artifact-note">${sentence}</span>`;
}

/** One type cell — what the artifact *is*, in the shape vocabulary. */
function typeCell(label: string): Markup {
  return markup`<span class="artifact-type">${label}</span>`;
}

/**
 * The type cells for one verdict.
 *
 * An `identified` verdict has one. An `ambiguous` one has **one per reading**,
 * because the tool does not rank them and a connective would have to: where the
 * readings differ only in shape the cells name shapes, where they differ only
 * in family they name families, and where both differ each cell names both.
 * An `unidentified` verdict has none — it has no type, and the sentence beside
 * it says so rather than a cell reading "unknown".
 */
function typeCells(identity: RowIdentity): readonly Markup[] {
  if (identity.outcome === 'identified') return [typeCell(SHAPE_LABELS[identity.shape])];
  if (identity.outcome === 'unidentified') return [];
  const families = new Set(identity.readings.map((reading) => reading.family));
  const shapes = new Set(identity.readings.map((reading) => reading.shape));
  return identity.readings.map((reading) => {
    if (families.size === 1 && shapes.size > 1) return typeCell(SHAPE_LABELS[reading.shape]);
    if (shapes.size === 1 && families.size > 1) return typeCell(FAMILY_LABELS[reading.family]);
    return typeCell(`${FAMILY_LABELS[reading.family]} · ${SHAPE_LABELS[reading.shape]}`);
  });
}

/** True when the readings are exactly the pair FR-73's index row names. */
function isRunOrShardedAmbiguity(identity: RowIdentity): boolean {
  if (identity.outcome !== 'ambiguous') return false;
  const shapes = new Set(identity.readings.map((reading) => reading.shape));
  return shapes.size === 2 && shapes.has('run-folder') && shapes.has('sharded-document');
}

/**
 * Every sentence one verdict produces, in reporting order.
 *
 * FR-69's unidentified sentence comes from the *identity*, because it is the
 * only place the levels tried are recorded. The interpretation state's own
 * `unidentified` is therefore skipped where it appears — see `interpretationNote`.
 *
 * **Two shapes are refused rather than rendered**, both found in review, and
 * both would have produced a page that claims something no verdict said. An
 * `unidentified` verdict with no attempted levels rendered
 * `Not identified. Tried: .`; an `ambiguous` verdict with fewer than two
 * readings rendered as an ordinary row with the ambiguity gone from the page.
 * The authority produces neither — it records all four levels always, and an
 * ambiguity is two or more readings by definition — so each is a defect, and
 * AD-7's "never an omission" makes a visible failure the right answer. The
 * throw reaches the adapter's own `catch` and becomes a 500 the reader can
 * report, not a silent misstatement.
 */
function identityNotes(identity: RowIdentity): readonly Markup[] {
  if (identity.outcome === 'unidentified') {
    if (identity.attempted.length === 0) {
      throw new Error('an unidentified verdict must name the levels it attempted (FR-69)');
    }
    const levels = identity.attempted.map((level) => LEVEL_LABELS[level]).join(', ');
    return [note(fillIndexString(UNIDENTIFIED, { levels }))];
  }
  const notes: Markup[] = [];
  if (identity.outcome === 'ambiguous' && identity.readings.length < 2) {
    throw new Error('an ambiguous verdict carries two or more readings; one is not an ambiguity');
  }
  if (isRunOrShardedAmbiguity(identity)) notes.push(note(AMBIGUOUS_RUN_OR_SHARDED));
  // FR-69's confidence clause: displayed where, and only where, it is below
  // certain. `Confidence` is a closed two, so this is the whole of the case.
  if (identity.confidence !== 'certain') {
    notes.push(
      note(
        fillIndexString(BELOW_CERTAIN, {
          confidence: CONFIDENCE_LABELS[identity.confidence],
          level: LEVEL_LABELS[identity.resolvedAt],
        }),
      ),
    );
  }
  return notes;
}

/**
 * FR-12's sentence, where FR-12 applies and nowhere else.
 *
 * `interpreted` says nothing — the ordinary case has nothing to report — and
 * `unidentified` says nothing *here*, because `identityNotes` already stated it
 * with the levels FR-69 requires and two sentences for one fact would read as
 * two facts. The two states stay distinct in the view either way, which is what
 * `src/domain/interpretation.ts` exists to keep true.
 */
function interpretationNote(state: InterpretationState | undefined): readonly Markup[] {
  return state === 'present-but-uninterpreted' ? [note(UNINTERPRETED)] : [];
}

/**
 * Every sentence one artifact's run-folder readings produce, said once each.
 *
 * **Deduplicated, and the first version was not.** With two measured readings
 * on one entry the page said `This folder may contain more than one run.`
 * twice and then put `Reusing this name is how BMAD resumes a run.` beside
 * `A same-day rerun lands in this folder.`, with nothing tying either sentence
 * to a reading — two contradictory claims about one folder. So the disclosure
 * is emitted once, and a per-axis sentence is emitted only where **every**
 * measured reading agrees: what all readings say is a fact about the folder,
 * and what they disagree about is not something this surface can attribute
 * without naming readings it has no wording for.
 */
function runFactNotes(facts: readonly RowRunFacts[]): readonly Markup[] {
  const measured = facts.filter((fact) => fact.measured);
  if (measured.length === 0) return [];
  const notes: Markup[] = [note(RUN_MAY_HOLD_SEVERAL)];
  const reuse = new Set(measured.map((fact) => fact.reuse));
  if (reuse.size === 1) {
    notes.push(note(reuse.has('deliberate') ? REUSE_DELIBERATE : REUSE_ACCIDENTAL));
  }
  if (measured.every((fact) => fact.dateSignal === 'absent')) notes.push(note(NO_DATE_IN_NAME));
  return notes;
}

/**
 * One artifact: its path, its type, and its state where one applies.
 *
 * A list item and not a heading, deliberately: DESIGN.md's "a tile that needs
 * two headings is two tiles" makes the family label the tile's one heading, so
 * a row cannot be an `h3` without splitting every family into a tile per
 * artifact. Screen-reader traversal by structure is the tile labels, and within
 * a tile the list is the structure.
 *
 * The cells are interpolated as one **array**, so `markup` separates them with
 * real whitespace. Concatenated, they ran together for every reader who is not
 * looking at the styled page: the flex `gap` that separates them visually is
 * not text, and text extraction, copy-paste and an unstyled render all got
 * `prdsFamily directoryNot checked`.
 */
function artifactRow(row: ArtifactRow): Markup {
  const stage = row.readability.stage;
  const cells: Markup[] = [
    markup`<code class="artifact-path">${row.path}</code>`,
    ...typeCells(row.identity),
    stateWord(row.readability.state),
    ...(stage === undefined ? [] : [stageValue(stage)]),
    ...identityNotes(row.identity),
    ...interpretationNote(row.interpretation),
    ...runFactNotes(row.runFacts),
  ];
  return markup`<li class="artifact-row">${cells}</li>`;
}

/**
 * A family-level fact, as a sentence.
 *
 * Total over `StoryLocationReport`'s four shapes with no fall-through, which is
 * the point of that union: the pair the first version fell through on —
 * `in-tree` with no path — is not representable here, and the projection is
 * where it is now resolved.
 *
 *   - `at` names the place, because a configured location the reader can go to
 *     is the useful fact. The path is project-relative like every other path on
 *     this surface; the projection makes it so.
 *   - `outside` is the index's own sentence, substituted — read from
 *     `src/domain/sprint.ts` rather than copied, which is the finding that
 *     module's `outOfTreeReport` closed. Its path stays **absolute**, because
 *     the whole point of FR-74 is saying where the value actually pointed.
 *   - `none` is FR-75's normal project shape and must not read as a failure, so
 *     it says what is true rather than that something is unavailable.
 *   - `unavailable` is FR-75's requirement exactly, with the state shown beside
 *     it as the machine value it is, so the five states it covers stay
 *     distinguishable without five sentences no document carries.
 */
function groupNote(entry: GroupNote): Markup {
  const report = entry.report;
  if (report.kind === 'at') {
    return markup`<p class="artifact-note">${fillIndexString(STORY_LOCATION_IN_TREE, { path: report.path })}</p>`;
  }
  if (report.kind === 'outside') {
    return markup`<p class="artifact-note">${outOfTreeReport(report.path)}</p>`;
  }
  if (report.kind === 'none') {
    return markup`<p class="artifact-note">${NO_SPRINT_TRACKING}</p>`;
  }
  return markup`<p class="artifact-note">${SPRINT_UNAVAILABLE} <code class="artifact-stage">${report.state}</code></p>`;
}

/**
 * True for a note that already reports an absence.
 *
 * What it is for: on a family tile with no rows, such a note and the per-family
 * empty sentence say the same thing twice. With no `sprint-status.yaml` the
 * story tile read `No sprint tracking in this project.` and then
 * `No artifacts of this family in this project.` — and the reader's question on
 * that tile is where the stories are, which the first sentence answers and the
 * second does not add to. A note that *names a place* is different: `Stories
 * are at docs/stories.` beside "no artifacts of this family" are two facts, and
 * both are worth having.
 */
function reportsAbsence(entry: GroupNote): boolean {
  return entry.report.kind === 'none' || entry.report.kind === 'unavailable';
}

/**
 * One family's tile content: its notes, then its artifacts or why there are none.
 *
 * Takes the family as a `Family` rather than reading it off the group, so the
 * branch the first version carried — `family === undefined` with no rows,
 * returning the *whole project's* empty sentence inside the `No family
 * resolved` tile — is not expressible. That tile is built by `unplacedContent`,
 * which is only reached when it holds rows.
 */
function groupContent(family: Family, group: FamilyGroup): TileContent {
  const notes = group.notes.map(groupNote);
  if (group.rows.length === 0) {
    // A family with nothing in it still says which family and still says
    // *why* it is empty: `EXPERIENCE.md:152` calls a bare "nothing here" a
    // defect on every surface. Where a note has already said it, it is not
    // said twice; see `reportsAbsence`.
    if (notes.length === 0) return { empty: FAMILY_EMPTY };
    if (group.notes.every(reportsAbsence)) return { html: markup`${notes}` };
    return { html: markup`${notes}<p class="tile-empty">${FAMILY_EMPTY}</p>` };
  }
  return { html: markup`${notes}<ul class="artifact-list">${group.rows.map(artifactRow)}</ul>` };
}

/** The tile for artifacts no single family claims. Only built when it has rows. */
function unplacedContent(group: FamilyGroup): TileContent {
  return { html: markup`<ul class="artifact-list">${group.rows.map(artifactRow)}</ul>` };
}

/**
 * The pass's report on itself: what it examined, and what it did not.
 *
 * Present whether or not anything went wrong, which is FR-76's rule applied to
 * the scan: "nothing was flagged" must never be indistinguishable from "nothing
 * was checked", and a tile that appeared only on failure would make a complete
 * scan and an unreported one look the same.
 *
 * Three kinds of fact, and each is here because nothing else on the page can
 * carry it. Completeness — a bound reached, or a name lost past a record cap —
 * is the one thing an artifact's own row cannot say, because the artifact has
 * no row. The **scope** line is the skip policy's tally, which
 * `Inventory.complete` explicitly does not cover. The **aliases** are second
 * spellings the walk dropped, which are the one loss with no row anywhere.
 *
 * Raised only when the scan did not finish. A raised tile means "this is the
 * one thing to look at first", which a scan that finished is not — and it is
 * also what keeps the one-raised-tile rule satisfied without a second decision.
 *
 * `span` at every width, because this tile *qualifies* the tiles after it: a
 * reader told the scan did not finish reads the lists below differently, and
 * above the breakpoint a half-width tile would have had the first family tile
 * beside it rather than below.
 */
function scanTile(view: InventoryView): TileOptions {
  const lines: Markup[] = [
    markup`<p>${view.complete ? fillIndexString(SCAN_FINISHED, { n: String(view.artifactCount) }) : SCAN_STOPPED}</p>`,
    markup`<p>${fillIndexString(SCAN_SCOPE, { n: String(view.namesLeftOut) })}</p>`,
    ...view.aliases.map(
      (alias) =>
        markup`<p class="artifact-note">${fillIndexString(ALIAS_REPORT, { name: alias.name, path: alias.reportedAt })}</p>`,
    ),
  ];
  return {
    label: SCAN_TILE_LABEL,
    content: { html: markup`${lines}` },
    span: true,
    ...(view.complete ? {} : { raised: true }),
  };
}

/**
 * The tiles this surface is made of, for `tileGrid`.
 *
 * Options rather than markup, so the one-raised-tile rule is enforced on the
 * caller's intent by the component that owns it rather than by a class count
 * here.
 *
 * The scan tile comes first because it qualifies everything below it: a reader
 * who is told the scan did not finish reads the lists that follow differently.
 */
export function inventoryTiles(view: InventoryView): readonly TileOptions[] {
  const scan = scanTile(view);
  if (!view.groups.some((group) => group.rows.length > 0)) {
    // The index's own row for a valid project with nothing in it. Not a grid of
    // twelve families each saying it is empty, which is the same fact twelve
    // times, and not a bare blank.
    //
    // Family notes are dropped in this branch, and the reason is that only one
    // of them is reachable here: a `sprint-status.yaml` is itself an artifact,
    // so a project with none has its story location in the `absent` state, and
    // `No sprint tracking in this project.` adds nothing to `A BMAD project,
    // with no artifacts yet.` Any other location state implies a tracking file,
    // which implies a row.
    // **Only a *finished* scan has earned this sentence.** `PROJECT_EMPTY` is a
    // positive claim about what the project holds, and a scan that stopped
    // short cannot make it — it said so anyway for a root the walk could not
    // read, which is the defect this branch was corrected for.
    //
    // When the scan did not finish, the scan tile above is the whole answer and
    // this tile is dropped rather than repeating it. The alternative was to
    // reuse `SCAN_STOPPED` here, which put one sentence on the page twice; the
    // scan tile already spans the row and is raised, so a reader has been told.
    // No new copy is invented either way: the string index has no row for a
    // root that could not be read, and adding one is a UX decision this does
    // not own.
    if (!view.complete) return [scan];
    return [scan, { label: ARTIFACTS_TILE_LABEL, content: { empty: PROJECT_EMPTY } }];
  }
  // **`FAMILIES` is walked here rather than in the projection**, so every family
  // has a tile whether or not the project holds one of it — a family with no
  // artifacts is a fact, and this layer is the one holding the index's sentence
  // for it. It also fixes the order at FR-11's (run-folder families first),
  // which is a display decision, and it means an eleventh family cannot be
  // silently missing from the surface because no artifact happened to resolve
  // to it.
  const byFamily = new Map<Family | undefined, FamilyGroup>(
    view.groups.map((group) => [group.family, group]),
  );
  const tiles: TileOptions[] = [scan];
  for (const family of FAMILIES) {
    const group = byFamily.get(family) ?? { family, rows: [], notes: [] };
    tiles.push({ label: FAMILY_LABELS[family], content: groupContent(family, group) });
  }
  // The unplaced group has no family to be empty *about*, so it appears only
  // when it holds something.
  const unplaced = byFamily.get(undefined);
  if (unplaced !== undefined && unplaced.rows.length > 0) {
    tiles.push({ label: UNPLACED_TILE_LABEL, content: unplacedContent(unplaced) });
  }
  return tiles;
}

/**
 * Every level label, in FR-8 order — the filled form of `UNIDENTIFIED`.
 *
 * Exported so `test/render/inventory.test.ts` can assert that filling the
 * template with all four levels reproduces the index row *verbatim*, which is
 * the only way to pin a template against a document that carries the
 * substituted example. A literal prefix in this module plus a literal row in
 * the test would be two copies of one belief again.
 */
export function allLevelsTried(): string {
  return fillIndexString(UNIDENTIFIED, {
    levels: LEVELS.map((level) => LEVEL_LABELS[level]).join(', '),
  });
}
