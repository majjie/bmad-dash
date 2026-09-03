/**
 * What an artifact **is**, decided once, here, and nowhere else.
 *
 * AD-4: identity is decided in one domain module during the snapshot pass, and
 * every other unit consumes the recorded verdict rather than re-deriving it.
 * Stories 1.8 to 1.12 and the whole of Epic 3 read this verdict; none of them
 * asks the question again. `test/architecture.test.ts` asserts the importer set
 * so a second derivation has to be a deliberate edit rather than a convenience.
 *
 * FR-8's precedence, applied in order and stopping at the first level that
 * resolves:
 *
 *   1. **location** — the path sits under one of the artifact roots. Displayed
 *      as `config path`, which is what FR-8 calls it, and the name is now a
 *      slight overstatement: FR-10 (reading the project's own
 *      `_bmad/bmm/config.yaml`) is deferred indefinitely, so the roots below
 *      are BMAD v6.11.0's **measured defaults**, not the target project's
 *      declared paths. A project that relocates its output folder is read at
 *      the wrong paths; that is FR-10's cost, recorded where it is paid.
 *   2. **frontmatter** — a `title` or `type` that names a family.
 *   3. **structure** — for a directory, the family documents it contains; for a
 *      file, its own first heading.
 *   4. **filename** — the basename, including the run-folder name patterns.
 *
 * **Level 4 resolves, but never at `certain` confidence.** That is a user
 * decision, and it is the reconciliation of FR-8's two halves: "stopping at the
 * first that resolves" against "filename alone is never sufficient". Read as
 * "a filename does not resolve at all", level 4 is not a precedence level and
 * FR-8's own list has three entries; read as "level 4 resolves like any other",
 * `prd.md` is as certain as a declared type. Neither is what the requirement
 * says. So level 4 resolves *and* carries `likely`, which is exactly what
 * FR-69's "confidence is displayed where it is below certain" exists to render.
 *
 * **Ambiguity is recorded, never resolved.** AD-4 again, and FR-73: a run
 * folder and a sharded document are not reliably distinguishable — BMAD's own
 * discovery globs for an `index.md` under a `*prd*` folder and asks a human.
 * Where two readings stand, the verdict carries both and says nothing about
 * which is right. The same shape carries the rarer case of two *families* being
 * signalled at one level, including a `type` and a `title` that disagree.
 *
 * **The family vocabulary is wider than FR-11's seven.** FR-11 constrains *run
 * folders*; it does not enumerate the artifact universe.
 * `_bmad/bmm/config.yaml:7-8` declares **two** peer output roots —
 * `planning_artifacts` and `implementation_artifacts` — and the second holds
 * epics, story specs, sprint tracking and context or working notes, none of
 * which is a run-folder family. Closing the vocabulary at seven left about a
 * third of a real output tree, this project's own included, with nothing to be
 * identified as. `RUN_FOLDER_FAMILIES` is still exactly FR-11's seven and is
 * what the run-folder patterns resolve to; `FAMILIES` is the whole set.
 *
 * **A slug is never a family signal.** FR-49: `{slug}` in a BMAD filename is a
 * context-dependent name and not an identifier, and it means something
 * different in each position. FR-49 itself names **three** — the reviewer's
 * lens in `review-{slug}.md`, the source input in `reconcile-{slug}.md`, the
 * subject in a `spec-{slug}` run folder — and `bmad-source-shapes.md`'s
 * measured table adds a fourth, the topic in `{research_type}-{topic}-{date}`.
 * One rule covers all four: **the prefix names the kind and the rest is a
 * slug**, so once a prefix has answered, the rest of the name is not consulted
 * at all — **at any level**, which is the part the first version of this fix
 * got wrong: it reached levels 1 and 4 and left a heading or a title free to
 * name the artifact under review, at `certain`. A fifth position, the forge
 * bare `{slug}`, is uncoverable by any name rule and is recognizable by
 * location alone; the limit is pinned by test and recorded in
 * `deferred-work.md`.
 *
 * The measured defects this corrects were FR-49's prohibition in its own
 * words: `review-design.md` identified as family `ux-design`,
 * `spec-ux-tokens` gaining a spurious second family, and — found in review —
 * `review-rubric.md` identified as `prd` at `certain` from its own heading.
 *
 * **Content is pulled, never pushed.** `Candidate.content` is a function, so a
 * level that does not need a document's text never causes it to be read — and
 * level 1 resolves for nearly everything under an artifact root. The pass
 * otherwise read every file in the tree, up to its whole entry budget, and
 * discarded the text. Called at most once per candidate and memoized here, so
 * levels 2 and 3 never read twice.
 *
 * **Nothing here imports anything.** The purity gate
 * (`test/support/gate.ts`, `PURE_LAYER`) fails any specifier that does not
 * start with `.` and any relative one that leaves `src/domain/` — and its
 * pattern has no `import type` awareness, so even a type-only import of
 * `CanonicalPath` fails it. Measured, not assumed. This module therefore
 * describes a candidate in its own terms and takes paths as `string`; the
 * adapter's canonical path stays on the adapter's side of the boundary, which
 * is the direction `ARCHITECTURE-SPINE.md` fixes anyway (ports may depend on
 * the domain, never the reverse).
 *
 * **Vocabulary that is deliberately not shared.** AD-8's four signal states
 * (present, absent, unreadable, unchecked) are about *signal availability* and
 * are not reused here; an identity verdict is AD-7's separate typed value. And
 * FR-12's "present-but-uninterpreted" is Story 1.9's term for how an
 * unidentified artifact is *presented* — `EXPERIENCE.md` merges the two and the
 * epics split them, which is recorded in `deferred-work.md` rather than
 * resolved by picking one here.
 */

import { readFrontmatter } from './frontmatter.ts';

/**
 * FR-11's seven, as a type of their own.
 *
 * Narrower than `Family` on purpose: a run-folder pattern resolves to one of
 * these and to nothing else, and `src/domain/runs.ts` keys its facts table on
 * this union so the typechecker makes that table total — a family added here
 * without a measured collision fact fails to compile there rather than falling
 * through a lookup (AD-13's rule, applied the way `interpretation.ts` applies
 * it).
 */
export type RunFolderFamily =
  | 'brief'
  | 'prd'
  | 'architecture'
  | 'ux-design'
  | 'research'
  | 'spec'
  | 'forge';

/**
 * Every family an artifact can belong to.
 *
 * The first seven are FR-11's run-folder families. The rest are what the
 * implementation output root holds plus `review`, and they exist because the
 * artifact universe is wider than the run-folder one — see the header.
 *
 * **`review` is a family because a review is a different artifact from the
 * thing it reviews.** Unowned by any normative document and decided in Story
 * 1.10: without it, `review-rubric.md` beside a PRD is reported as a PRD, so
 * FR-50's "review outputs are located wherever the producing skill writes
 * them" has nothing to resolve *to* and no observable effect. It is not a
 * run-folder family — no skill writes a `review-…` run folder — so it is
 * outside `RunFolderFamily` and outside FR-11's seven.
 */
export type Family =
  | RunFolderFamily
  | 'review'
  | 'epics'
  | 'story'
  | 'sprint-tracking'
  | 'note';

/**
 * FR-11's seven, in FR-11's order. These and only these are what a run-folder
 * pattern resolves to, which is the claim FR-11 actually makes.
 */
export const RUN_FOLDER_FAMILIES: readonly RunFolderFamily[] = [
  'brief',
  'prd',
  'architecture',
  'ux-design',
  'research',
  'spec',
  'forge',
];

/** Every family, run-folder families first so a report reads FR-11's order. */
export const FAMILIES: readonly Family[] = [
  ...RUN_FOLDER_FAMILIES,
  'review',
  'epics',
  'story',
  'sprint-tracking',
  'note',
];

/** FR-8's four levels. The array below is the order; nothing may reorder it. */
export type Level = 'location' | 'frontmatter' | 'structure' | 'filename';

export const LEVELS: readonly Level[] = ['location', 'frontmatter', 'structure', 'filename'];

/**
 * How each level is named to a reader.
 *
 * `EXPERIENCE.md`'s string index spells the unidentified case
 * `Not identified. Tried: config path, frontmatter, structure, filename.` — so
 * `location` is displayed as `config path`. The labels live here because they
 * are the level vocabulary rather than page copy; assembling that sentence is
 * the render layer's job in Story 1.9. `test/domain/identity.test.ts` reads the
 * row **out of `EXPERIENCE.md`** and derives the expected labels from it, so
 * editing either side fails — a literal in the test that merely happened to
 * match would be a second copy of one belief, which is the drift this project
 * already corrects at two other sites.
 */
export const LEVEL_LABELS: Readonly<Record<Level, string>> = {
  location: 'config path',
  frontmatter: 'frontmatter',
  structure: 'structure',
  filename: 'filename',
};

/**
 * How each family is named to a reader.
 *
 * **Invented here, because no normative document names them.** `grep -in` over
 * `EXPERIENCE.md`, `DESIGN.md` and `SPEC.md` returns no family display label
 * and no inventory surface at all, so Story 1.12 needed one and this is where
 * the level labels above already live: a family is vocabulary, not page copy,
 * and a surface holding its own copy would be the second belief this table
 * exists to prevent. The invention is recorded in `deferred-work.md` rather
 * than presented as something a document asked for.
 *
 * **Keyed rather than searched**, so the typechecker makes the table total over
 * `Family`: a twelfth family fails to compile here instead of falling through a
 * lookup to a guessed default. That is what "pinned against `FAMILIES` so none
 * can be missing" buys, and it is the same rule
 * `INTERPRETATION_DEFINITIONS` states at length.
 *
 * Label-shaped per the string index's convention — initial capital, no
 * terminal period — because these name a thing rather than say something about
 * it. `PRD` and `UX design` are spelled as the corpus spells them.
 */
export const FAMILY_LABELS: Readonly<Record<Family, string>> = {
  brief: 'Brief',
  prd: 'PRD',
  architecture: 'Architecture',
  'ux-design': 'UX design',
  research: 'Research',
  spec: 'Spec',
  forge: 'Forge',
  review: 'Review',
  epics: 'Epics',
  story: 'Story',
  'sprint-tracking': 'Sprint tracking',
  note: 'Note',
};

/**
 * How each shape is named to a reader — the artifact's *type* on a surface.
 *
 * Invented on the same terms as `FAMILY_LABELS`, keyed for the same reason, and
 * two of the five say something the shape name alone does not:
 *
 *   - `container` reads **Family directory**, because `…/prds` is the tool's own
 *     layout rather than an artifact, and "Container" would name an
 *     implementation term at a reader.
 *   - `unknown` reads **Shape not recognized**, which is deliberately a
 *     statement about the tool and not about the artifact: FR-12's own state is
 *     what says the artifact is nevertheless present, and it is rendered beside
 *     this rather than folded into it.
 */
export const SHAPE_LABELS: Readonly<Record<Shape, string>> = {
  document: 'Document',
  'sharded-document': 'Sharded document',
  'run-folder': 'Run folder',
  container: 'Family directory',
  unknown: 'Shape not recognized',
};

/**
 * How each confidence value is named to a reader.
 *
 * Two rows, because `Confidence` is a closed two — FR-69 asks one question, is
 * this below `certain` — and a third value is on Story 1.12's Ask First list
 * rather than something a label table may introduce. `certain` has a label at
 * all so the vocabulary is complete and a surface that wanted to state it
 * could; the inventory renders only the below-certain case, which is what
 * FR-69 asks to be displayed.
 */
export const CONFIDENCE_LABELS: Readonly<Record<Confidence, string>> = {
  certain: 'Certain',
  likely: 'Likely',
};

/**
 * How sure the verdict is. Two values, because FR-69 asks one question:
 * is this below `certain`, and therefore something to display.
 */
export type Confidence = 'certain' | 'likely';

/**
 * What the thing turned out to be, structurally.
 *
 * `container` is a family's own directory — `…/prds` holds PRD runs and is not
 * itself a PRD — recorded rather than left unidentified so a view can group by
 * it instead of showing rows that read "not identified" for the tool's own
 * layout. `unknown` is honest: a directory carrying neither a run-folder nor a
 * sharded-document signal, an entry that is neither file nor directory, or one
 * the walk could not examine at all.
 */
export type Shape = 'document' | 'sharded-document' | 'run-folder' | 'container' | 'unknown';

/**
 * What happened at one level. Three outcomes, and the third is the point:
 *
 *   - `resolved` — this level answered, and the precedence stopped here.
 *   - `no-signal` — the level ran and found nothing.
 *   - `unavailable` — the level could **not** run, because what it reads was
 *     not there: a directory has no frontmatter, an unreadable file no text, an
 *     unenumerable directory no children, a frontmatter block that is unclosed
 *     or whose `type` is a shape this reader declines no readable declaration.
 *     FR-69 requires naming the levels attempted, and a level recorded as
 *     having run and found nothing, when in fact it never ran, is the one claim
 *     this vocabulary exists to prevent.
 */
export type AttemptResult = 'resolved' | 'no-signal' | 'unavailable';

export interface Attempt {
  readonly level: Level;
  readonly result: AttemptResult;
  /** Why the level could not run. Present exactly when `result` is `unavailable`. */
  readonly reason?: string;
}

/** One of the readings an ambiguous verdict refuses to choose between. */
export interface Reading {
  readonly family: Family;
  /**
   * The shape this reading pairs with, or `unknown` where nothing paired one.
   *
   * Never a cross product: where both the family and the shape are unresolved,
   * pairing every family with every shape asserts combinations no signal
   * produced, so the shape is left `unknown` instead. See `readingsOf`.
   */
  readonly shape: Shape;
}

/**
 * The recorded verdict. AD-7's typed value: never an exception, never an
 * omission, and it always says which levels were attempted and in what order.
 */
export type Verdict =
  | {
      readonly outcome: 'identified';
      readonly family: Family;
      readonly shape: Shape;
      readonly resolvedAt: Level;
      readonly confidence: Confidence;
      readonly attempted: readonly Attempt[];
    }
  | {
      readonly outcome: 'ambiguous';
      /** Two or more, and the tool does not rank them. */
      readonly readings: readonly Reading[];
      readonly resolvedAt: Level;
      /**
       * Invariantly below certain — two readings standing is what below-certain
       * means — so the type says so rather than the prose restating it.
       */
      readonly confidence: 'likely';
      readonly attempted: readonly Attempt[];
    }
  | {
      readonly outcome: 'unidentified';
      /** All four levels, in FR-8 order, with what each of them did. */
      readonly attempted: readonly Attempt[];
    };

/** What the walk managed to learn about the entry's kind. */
export type CandidateKind = 'file' | 'directory' | 'unknown';

/** A file's text, or why there is none to read. */
export type Content =
  | { readonly available: true; readonly text: string }
  | { readonly available: false; readonly reason: string };

/**
 * A file's text on demand.
 *
 * A function rather than a value so that reading is driven by the precedence
 * rather than by the pass: nothing is read for a candidate whose family level 1
 * already resolved. Called at most once per candidate.
 */
export type ContentSource = () => Content;

/** A directory's child names, or why they could not be listed. */
export type Listing =
  | { readonly available: true; readonly names: readonly string[] }
  | { readonly available: false; readonly reason: string };

/**
 * One thing to identify, in the domain's own terms.
 *
 * `relative` is the path from the project root, `/`-separated on every
 * platform — the same spelling the walk reports, and the spelling the artifact
 * roots below are written in. It is never `.`: the project root is the thing
 * being walked, not a thing found in it.
 *
 * Both signals say *why* something is missing rather than merely being absent.
 * `Content` and `Listing` carrying a reason is what lets a level be recorded
 * `unavailable` with something a human can read, instead of a level silently
 * reporting `no-signal` for a file it never opened.
 */
export interface Candidate {
  readonly relative: string;
  readonly kind: CandidateKind;
  readonly content: ContentSource;
  readonly children: Listing;
}

/**
 * A root whose every artifact belongs to one family.
 *
 * **Measured against a BMAD v6.11.0 install with no project override, not
 * specified anywhere.** Two of the seven do not live under
 * `planning-artifacts` at all — `specs` and `forge` sit directly under the
 * output folder — so a level-1 rule keyed on `planning-artifacts` alone misses
 * two families out of seven. Sources: `_bmad/bmm/config.yaml` for
 * `output_folder` and `planning_artifacts`, and the per-skill output paths in
 * BMAD's own help tables.
 *
 * Paths are spelled lowercase and compared case-insensitively; see
 * `locationSignal` for why.
 */
export const ARTIFACT_ROOTS: readonly { readonly path: string; readonly family: Family }[] = [
  { path: '_bmad-output/planning-artifacts/briefs', family: 'brief' },
  { path: '_bmad-output/planning-artifacts/prds', family: 'prd' },
  { path: '_bmad-output/planning-artifacts/architecture', family: 'architecture' },
  { path: '_bmad-output/planning-artifacts/ux-designs', family: 'ux-design' },
  { path: '_bmad-output/planning-artifacts/research', family: 'research' },
  { path: '_bmad-output/specs', family: 'spec' },
  { path: '_bmad-output/forge', family: 'forge' },
];

/**
 * The `{kind}-{slug}` name prefixes: the prefix names the kind, the slug does
 * not name anything the tool may key on.
 *
 * Three of FR-49's slug positions. FR-49 itself (`prd.md:178`) names exactly
 * these three — `review-{slug}.md`, `reconcile-{slug}.md`, and a `spec-{slug}`
 * run folder; the **fourth**, `{research_type}-{topic_slug}-{date}`, comes from
 * `bmad-source-shapes.md`'s measured table and is a run-folder pattern above,
 * where the same rule covers it because a matched pattern likewise stops the
 * name being read any further. `slugNames` is quoted from that table's second
 * column and `test/domain/identity.test.ts` reads the table and compares, so
 * this is data with one source rather than a comment nobody checks.
 *
 * **A fifth position exists and neither table can cover it:** the forge run
 * folder is a bare `{slug}` with no prefix at all, so a forge run called
 * `prd-redesign` outside `_bmad-output/forge` still hint-matches `prd` at
 * level 4. That is the slug-as-family reading this story exists to stop, and it
 * is unfixable by a name rule — a bare slug matches every directory. Location
 * is the only signal, which is FR-72's own point; the limit is pinned in the
 * coverage test and recorded in `deferred-work.md`.
 *
 * **`family` is optional, and its absence is the honest answer rather than an
 * omission.** A reconciliation is its own kind of artifact and the family
 * vocabulary has no word for it: this story added `review` because a review is
 * a different artifact from the thing it reviews, and adding a second family
 * with no surface to render it was left as a decision for whoever needs it
 * (recorded in `deferred-work.md`). So `reconcile-prd.md` resolves to *no*
 * family from any level — which is the point, because the alternative on offer
 * was `prd`, read out of a slug that names the input being reconciled.
 *
 * **`aboutAnotherArtifact` marks a document whose subject is a different
 * artifact**, and that one fact has two consequences, both of which were
 * needed before this table was right:
 *
 *   1. **The prefix outranks the location.** BMAD writes reviews and
 *      reconciliations into whichever workspace the reviewed artifact lives
 *      in — FR-50's two shapes, a run folder's own root or a `reviews/`
 *      subfolder under it — so inside an artifact root the prefix, not the
 *      root, decides. That is not level 4 in disguise, for the same reason
 *      `DOCUMENT_ROOTS` is not: the root closes the candidate set to the kinds
 *      BMAD writes there before any name is consulted.
 *   2. **Its own prose names its subject, not itself**, so levels 2 and 3 may
 *      not overrule the prefix either. Measured, and it is the half the first
 *      version of this fix missed: `review-rubric.md` whose heading reads
 *      `# PRD Quality Review — BMAD Dashboard CLI` was identified `prd` at
 *      **`certain`**, which outranks the `likely` level-4 reading the prefix
 *      rule had just corrected, and a review titled
 *      `Adversarial review — … PRD` went `ambiguous ['prd', 'review']`. So
 *      `constrainToKind` filters every level's families to the kind's, which
 *      keeps a genuine self-declaration (`type: review`) and discards a
 *      mention of the target.
 *
 * `spec-` is the opposite case on both counts: it is a run folder's *own*
 * prefix and a spec is about itself, so a `spec-…` name inside another family's
 * root claims nothing and a `spec-1-7-x.md` titled `Story 1.7 — …` is still
 * read as a story from its declaration. A name must not decide between the two
 * spellings of `spec-` — that is what level 1 is for.
 */
export const KIND_PREFIXES: readonly {
  readonly prefix: string;
  readonly family?: Family;
  /**
   * What the slug after the prefix names. Quoted from
   * `bmad-source-shapes.md`'s table, pinned by test, and never a key.
   */
  readonly slugNames: string;
  readonly aboutAnotherArtifact: boolean;
}[] = [
  {
    prefix: 'review-',
    family: 'review',
    slugNames: 'the reviewer or lens',
    aboutAnotherArtifact: true,
  },
  {
    prefix: 'reconcile-',
    slugNames: 'the source input being reconciled',
    aboutAnotherArtifact: true,
  },
  {
    prefix: 'spec-',
    family: 'spec',
    slugNames: 'the subject, reused deliberately to reopen the folder',
    aboutAnotherArtifact: false,
  },
];

/**
 * The kinds written into another family's workspace, as level-1 document rules.
 *
 * Derived rather than restated: these rows appear in every root's rule list so
 * that a reader of `DOCUMENT_ROOTS` sees the whole set of things that root
 * holds, and a second copy of the prefixes would be one belief written twice —
 * which is the drift this project corrects at three other sites.
 */
const WORKSPACE_KIND_RULES: readonly { readonly prefix: string; readonly family?: Family }[] =
  KIND_PREFIXES.filter((kind) => kind.aboutAnotherArtifact).map((kind) => ({
    prefix: kind.prefix,
    ...(kind.family === undefined ? {} : { family: kind.family }),
  }));

/**
 * A root that holds several families, and how to tell them apart within it.
 *
 * `implementation_artifacts` is a peer of `planning_artifacts` in
 * `_bmad/bmm/config.yaml:7-8` and holds four different things, so no single
 * family covers it. What distinguishes them there *is* the document name — but
 * that is not level 4 in disguise: the root closes the candidate set to four
 * before the name is consulted, and a name that matches none of the rules still
 * resolves, to the root's `residual` family. That is what makes level 1 total
 * over a declared root, which is the property that stops a third of a real tree
 * reading "not identified".
 *
 * **The totality claim has exactly one exception, and it is in the table.** A
 * rule whose `family` is absent is a kind the vocabulary has no family for —
 * `reconcile-`, today — and it makes level 1 *decline* rather than assign the
 * residual. So the property is precisely: every name **no rule matches**
 * resolves, to the residual. A `reconcile-…` name is not an unmatched name
 * falling through a hole; it is a recognized kind whose honest answer is no
 * family, and assigning `note` to it would report a reconciliation of the epics
 * list as a working note. Stated here because the unqualified claim above was
 * left standing over the exception once already, and an over-claiming comment
 * is worse than none.
 *
 * The root's **own directory** deliberately resolves to nothing: it holds
 * several families, so there is no family for it to be, and it is BMAD's output
 * layout rather than an artifact. `_bmad-output` and
 * `_bmad-output/planning-artifacts` are the same kind of thing and are
 * likewise not artifacts.
 */
export const DOCUMENT_ROOTS: readonly {
  readonly path: string;
  readonly documents: readonly {
    readonly stems?: readonly string[];
    readonly prefix?: string;
    /** Absent for a recognized kind the vocabulary has no family for. */
    readonly family?: Family;
  }[];
  readonly residual: Family;
}[] = [
  {
    path: '_bmad-output/implementation-artifacts',
    documents: [
      // First, and derived from `KIND_PREFIXES` rather than restated: two
      // BMAD skills write their reviews under `{implementation_artifacts}`
      // when subagents are unavailable, so this is a real location for them
      // and not a hypothetical. `review-…` resolves to `review` here;
      // `reconcile-…` declines, per the exception stated above.
      ...WORKSPACE_KIND_RULES,
      { stems: ['epics'], family: 'epics' },
      { stems: ['sprint-status'], family: 'sprint-tracking' },
      // `spec-{story}` is what `bmad-build` writes per story. Distinct from the
      // `spec` family, which is a `bmad-spec` run under `_bmad-output/specs`;
      // the two share a word and are different artifacts, which is why the
      // location has to decide and a name alone must not.
      { prefix: 'spec-', family: 'story' },
    ],
    // Context documents and working notes — `epic-1-context.md`,
    // `deferred-work.md` — plus anything else the root comes to hold.
    residual: 'note',
  },
];

/**
 * BMAD's output **layout**: the output folder and the two roots the config
 * declares. Directories that hold families rather than being one.
 *
 * Level 3 does not read a structural signature out of these, and that is the
 * third correction of one measured false-positive class. A layout directory
 * contains the family *directories* and, in `planning-artifacts`, an
 * `epics.md`; a level-3 read that treated any contained family document as the
 * directory's own signature reported `planning-artifacts` as an epics artifact,
 * exactly as it once reported `_bmad-output` as a spec. A family's structural
 * signature is the document a *run* holds.
 *
 * Enumerated rather than derived, because they are three measured names and a
 * rule broad enough to derive them would also catch a run folder.
 */
export const LAYOUT_DIRECTORIES: readonly string[] = [
  '_bmad-output',
  '_bmad-output/planning-artifacts',
  '_bmad-output/implementation-artifacts',
];

/**
 * `bmad-deep-recon`'s shipped type packs, which are the `{research_type}` half
 * of the research run-folder pattern. Measured from the installed skill.
 */
export const RESEARCH_TYPES: readonly string[] = [
  'market',
  'domain',
  'technical',
  'competitive',
  'user-voice',
  'academic-lit',
];

/**
 * The run-folder name patterns, as prefixes plus whether a date closes them.
 *
 * Seven families, seven patterns, and only **six** of them carry a name signal:
 *
 *   - `brief-|prd-|architecture-|ux-{project_name}-{date}` — the four that
 *     repeat within a day, because both halves are constant for a day, so a
 *     folder is not a run (FR-71).
 *   - `{research_type}-{topic}-{date}` — one per shipped research type.
 *   - `spec-{slug}`, dateless, and deliberately reopened under the same slug.
 *   - `{slug}`, dateless and **shapeless**: forge run folders are a bare slug,
 *     so there is no name pattern to match and a forge run is recognizable by
 *     location alone. FR-72 says the ordering consequence; this is the identity
 *     one, and the family-to-pattern mapping for the dateless pair is stated
 *     nowhere in BMAD and was measured.
 */
export const RUN_FOLDER_PATTERNS: readonly {
  readonly prefix: string;
  readonly family: RunFolderFamily;
  readonly dated: boolean;
}[] = [
  { prefix: 'brief-', family: 'brief', dated: true },
  { prefix: 'prd-', family: 'prd', dated: true },
  { prefix: 'architecture-', family: 'architecture', dated: true },
  { prefix: 'ux-', family: 'ux-design', dated: true },
  ...RESEARCH_TYPES.map((type) => ({
    prefix: `${type}-`,
    family: 'research' as RunFolderFamily,
    dated: true,
  })),
  { prefix: 'spec-', family: 'spec', dated: false },
];

/**
 * Basename hints for level 4.
 *
 * FR-8's own example of why a name is never sufficient is the PRD: `prd.md`,
 * `bmm-prd.md` and `product-requirements.md` all occur, and BMAD instructs its
 * skills to identify documents by reading them. So this table is broad on
 * purpose and its verdicts are never `certain`.
 */
export const NAME_HINTS: readonly { readonly hint: string; readonly family: Family }[] = [
  { hint: 'prd', family: 'prd' },
  { hint: 'prds', family: 'prd' },
  { hint: 'bmm-prd', family: 'prd' },
  { hint: 'product-requirements', family: 'prd' },
  { hint: 'architecture', family: 'architecture' },
  { hint: 'architecture-spine', family: 'architecture' },
  { hint: 'brief', family: 'brief' },
  { hint: 'briefs', family: 'brief' },
  { hint: 'product-brief', family: 'brief' },
  { hint: 'ux', family: 'ux-design' },
  { hint: 'ux-design', family: 'ux-design' },
  { hint: 'ux-designs', family: 'ux-design' },
  { hint: 'design', family: 'ux-design' },
  { hint: 'experience', family: 'ux-design' },
  { hint: 'research', family: 'research' },
  { hint: 'spec', family: 'spec' },
  { hint: 'specs', family: 'spec' },
  { hint: 'forge', family: 'forge' },
  // Not the `review-` prefix — that is `KIND_PREFIXES`, and it answers before
  // any hint is consulted. The singular row is for a document that says
  // `type: review` of itself. The plural is for a directory or document
  // literally named `reviews`, and it serves the **outside-a-root case only**:
  // inside any artifact root such a directory is answered by level 1 with the
  // root's family and never reaches level 4 at all, which the first version of
  // this comment got wrong. Both rows are pinned in
  // `test/domain/identity.test.ts`.
  { hint: 'review', family: 'review' },
  { hint: 'reviews', family: 'review' },
  { hint: 'epics', family: 'epics' },
  { hint: 'story', family: 'story' },
  { hint: 'stories', family: 'story' },
  { hint: 'sprint-status', family: 'sprint-tracking' },
];

/** The two frontmatter fields FR-8 names, consulted in this order. */
const DECLARING_FIELDS: readonly string[] = ['type', 'title'];

/**
 * Level 3 for a file: phrases in its own first heading.
 *
 * Measured against the headings on disk — `# bmad-dash — Product Requirements`,
 * `# Cross-spine seam review — DESIGN.md ⇄ EXPERIENCE.md` — and kept to
 * phrases that name a family rather than words that merely occur near one.
 * `design` alone is deliberately absent: it appears in prose about every
 * family, and level 4 already carries the `DESIGN.md` filename. `epics` is
 * plural-only for the same reason — `# Epic 1 Context` is a context document,
 * not the epics list.
 */
const HEADING_PHRASES: readonly { readonly phrase: RegExp; readonly family: Family }[] = [
  { phrase: /\bproduct requirements?\b/i, family: 'prd' },
  { phrase: /\bprd\b/i, family: 'prd' },
  { phrase: /\barchitecture\b/i, family: 'architecture' },
  { phrase: /\bproduct brief\b/i, family: 'brief' },
  { phrase: /\bux\b/i, family: 'ux-design' },
  { phrase: /\bexperience\b/i, family: 'ux-design' },
  { phrase: /\bdesign system\b/i, family: 'ux-design' },
  { phrase: /\bresearch\b/i, family: 'research' },
  { phrase: /\bspecification\b/i, family: 'spec' },
  { phrase: /\bforge\b/i, family: 'forge' },
  { phrase: /\bepics\b/i, family: 'epics' },
];

/**
 * A trailing `-YYYY-MM-DD`, which is what closes five of the seven patterns.
 *
 * Month and day ranges are checked, so `prd-x-2026-99-99` is not a dated run
 * folder. It is a **shape** check and not a calendar one — 31 February passes —
 * because the alternative is a date library in a layer that may not import one,
 * and an impossible-but-well-formed date is a folder BMAD did not write either
 * way.
 */
const TRAILING_DATE = /-\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

/** The document naming a sharded document, per FR-9 and BMAD's own glob. */
export const SHARD_INDEX = 'index.md';

/**
 * Whether a child name is a markdown document.
 *
 * Exported, and the two callers are the point: level 3's structural read asks
 * it of a directory's children, and Story 1.8's document model asks it of the
 * same names to decide what a part is. Two copies of "what counts as markdown"
 * would let composition and identification disagree about one listing — the
 * model would compose parts from names the authority had not read as documents,
 * or the reverse, with nothing failing.
 *
 * Case-insensitive for the reason every layout name here is: this tool never
 * writes, and a volume can hand back a spelling BMAD did not create.
 */
export function isMarkdown(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

/** Whether a child name is the shard index. Shared for the same reason. */
export function isShardIndex(name: string): boolean {
  return name.toLowerCase() === SHARD_INDEX;
}

/** A byte-order mark is invisible and would hide the first line of a document. */
function withoutMark(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

/** The last segment of a `/`-separated relative path. */
function baseName(relative: string): string {
  const cut = relative.lastIndexOf('/');
  return cut === -1 ? relative : relative.slice(cut + 1);
}

/** The parent of a `/`-separated relative path, or `''` at the top level. */
function parentOf(relative: string): string {
  const cut = relative.lastIndexOf('/');
  return cut === -1 ? '' : relative.slice(0, cut);
}

/** A basename with one trailing extension removed, lowercased. */
function nameStem(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.toLowerCase();
}

/** Distinct, in `FAMILIES` order, so a reading list never depends on match order. */
function familySet(found: readonly Family[]): readonly Family[] {
  return FAMILIES.filter((family) => found.includes(family));
}

/**
 * One level's answer: exactly one `Attempt`, and the families it produced.
 *
 * Returned as a pair rather than pushed by each branch, so the attempt record
 * is **total by construction**: there is no path through a level that records
 * nothing, which is what FR-69's "naming which levels were attempted" needs and
 * what a chain of `if`/`else if` cannot promise.
 */
interface LevelAnswer {
  readonly attempt: Attempt;
  readonly families: readonly Family[];
}

function resolved(level: Level, families: readonly Family[]): LevelAnswer {
  return { attempt: { level, result: 'resolved' }, families };
}

function noSignal(level: Level): LevelAnswer {
  return { attempt: { level, result: 'no-signal' }, families: [] };
}

function unavailable(level: Level, reason: string): LevelAnswer {
  return { attempt: { level, result: 'unavailable', reason }, families: [] };
}

/**
 * Level 1: the artifact root this path sits in, and whether it *is* that root.
 *
 * **Compared case-insensitively, decided once here and applied everywhere a
 * layout name is matched.** BMAD writes these names itself, always lowercase,
 * and this tool never writes; a case-insensitive volume — macOS by default,
 * Windows — can hand back `_BMAD-Output` for the directory BMAD created as
 * `_bmad-output`. Refusing that spelling costs the entire inventory (the pass
 * skips the output folder and reports a complete, empty result); accepting a
 * differently-cased sibling on a case-sensitive volume costs nothing, because
 * such a directory is one BMAD did not create and everything in it is still
 * reported.
 *
 * Single-family roots are consulted before mixed ones, so the most specific
 * root wins; today they do not overlap, and this keeps that from becoming a
 * silent ordering dependency if one ever does.
 *
 * **FR-50 is why a root is not the last word inside itself.** A review is
 * written wherever the producing skill writes it — a run folder's own root, or
 * a `reviews/` subfolder under it, at any depth — so a single-family root
 * holds reviews as well as its own family's documents, and returning the root's
 * family for all of them reports a review of a PRD *as* a PRD. The prefix
 * decides within the root, which is `DOCUMENT_ROOTS`'s arrangement applied to
 * the case FR-50 names, and it is still level 1: position closes the candidate
 * set to the kinds BMAD writes there before any name is consulted.
 */
function locationSignal(
  relative: string,
): { readonly family: Family; readonly container: boolean } | undefined {
  const lower = relative.toLowerCase();
  // The kind the name declares, where the name is one a `{kind}-{slug}` rule
  // can speak about at all — see `declaredKind`. A kind with no family
  // **declines** the root's answer rather than taking it: the slug is the input
  // being reconciled, so `prd` would be exactly the reading FR-49 forbids, and
  // the residual `note` would report a reconciliation as a working note.
  const kind = declaredKind(lower, { aboutAnotherArtifactOnly: true });
  // A family, or a declining `undefined` for a rule the vocabulary has no
  // family for. One helper for both root kinds, so the exception is expressed
  // once.
  const resolvedTo = (
    family: Family | undefined,
  ): { family: Family; container: boolean } | undefined =>
    family === undefined ? undefined : { family, container: false };

  for (const root of ARTIFACT_ROOTS) {
    if (lower === root.path) return { family: root.family, container: true };
    if (!lower.startsWith(`${root.path}/`)) continue;
    return resolvedTo(kind === undefined ? root.family : kind.family);
  }
  for (const root of DOCUMENT_ROOTS) {
    // The root's own directory is layout, not an artifact — see DOCUMENT_ROOTS.
    if (lower === root.path) return undefined;
    if (!lower.startsWith(`${root.path}/`)) continue;
    const stem = nameStem(baseName(lower));
    for (const rule of root.documents) {
      // A workspace-kind row delegates to `declaredKind`, which holds both the
      // prefix match and the document-name guard — so `review-x.png` beside a
      // mockup is not a review, and the guard exists in one place rather than
      // two that could disagree.
      if (WORKSPACE_KIND_RULES.some((row) => row.prefix === rule.prefix)) {
        if (kind === undefined || kind.prefix !== rule.prefix) continue;
        return resolvedTo(kind.family);
      }
      if (rule.stems?.includes(stem) === true) return resolvedTo(rule.family);
      if (rule.prefix !== undefined && stem.startsWith(rule.prefix)) {
        return resolvedTo(rule.family);
      }
    }
    return { family: root.residual, container: false };
  }
  return undefined;
}

/** True when `relative` sits directly inside a single-family root — where runs live. */
function sitsWhereRunsLive(relative: string): boolean {
  const parent = parentOf(relative).toLowerCase();
  return ARTIFACT_ROOTS.some((root) => root.path === parent);
}

/**
 * Level 2: a `title` or `type` that names a family.
 *
 * Three answers rather than two, because the frontmatter reader has three: a
 * field can be readable, absent, or **declined** — a flow collection, a block
 * scalar, an anchor. A declined field existed and could not be interpreted, so
 * reporting `no-signal` over it would claim the level ran and found no
 * declaration, which is the false claim `unavailable` exists to prevent one
 * level down. An unclosed block is the same kind of failure and is treated the
 * same way rather than as authoritative.
 *
 * A duplicated `type`/`title` is **not** unavailable: the field was read, and
 * first-wins is the reader's documented rule, chosen so a stray later line
 * cannot override a declared identity.
 */
function frontmatterFamilies(text: string): { readonly families: readonly Family[]; readonly declined?: string } {
  const block = readFrontmatter(text);
  if (!block.present) return { families: [] };
  if (!block.terminated) {
    return { families: [], declined: 'the frontmatter block is never closed' };
  }
  const found: Family[] = [];
  const declined: string[] = [];
  for (const field of DECLARING_FIELDS) {
    if (block.skipped.includes(field)) {
      declined.push(field);
      continue;
    }
    const value = block.fields.get(field);
    if (value === undefined) continue;
    for (const family of declaredFamilies(value)) found.push(family);
  }
  const families = familySet(found);
  if (families.length > 0) return { families };
  if (declined.length > 0) {
    return {
      families: [],
      declined: `${declined.join(' and ')} carries a value this reader does not interpret`,
    };
  }
  return { families: [] };
}

/**
 * The families a declared `title`/`type` value names.
 *
 * Token-wise rather than substring-wise: `architecture-spine` declares
 * architecture, and a title merely *containing* the letters `ux` does not
 * declare a UX design.
 *
 * Whitespace is folded to `-` first, so one segment rule covers both halves of
 * FR-8's field pair: a `type` is a slug (`architecture-spine`) and a `title` is
 * prose (`Product Requirements Document`), and without the fold the hints would
 * answer for the first and never for the second.
 *
 * **`KIND_PREFIXES` is deliberately not applied here.** FR-49 is about BMAD
 * *filenames*; a `title` is prose, and reading `Review of the PRD` as a
 * `{kind}-{slug}` name would silence the second half of a sentence rather than
 * a slug. A title that names two families stays ambiguous, which is the answer
 * AD-4 already requires of this level.
 */
function declaredFamilies(value: string): readonly Family[] {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  return hintFamilies(normalized);
}

/**
 * Whether `normalized` carries `hint` as a whole word or bounding segment.
 *
 * Equality, a leading `hint-`, a trailing `-hint`, or an interior `-hint-`.
 * That is what catches `bmm-prd`, `prd-bmad-2026-08-28` and `spec-1-7-…` while
 * leaving `review-adversarial`, `addendum` and `deferred-work` alone.
 * Deliberately not a bare `includes`: `specification` would then declare a spec
 * and `design-system-notes` a UX design, and level 4 is already the weakest
 * level without also being the loosest.
 */
function matchesHint(normalized: string, hint: string): boolean {
  if (normalized === hint) return true;
  if (normalized.startsWith(`${hint}-`)) return true;
  if (normalized.endsWith(`-${hint}`)) return true;
  return normalized.includes(`-${hint}-`);
}

/** Every family the hint table matches in one normalized name. */
function hintFamilies(normalized: string): readonly Family[] {
  const found: Family[] = [];
  for (const { hint, family } of NAME_HINTS) {
    if (matchesHint(normalized, hint)) found.push(family);
  }
  return familySet(found);
}

/**
 * Whether a basename is one a `{kind}-{slug}` rule may speak about at all.
 *
 * A directory name, or a markdown document. **Asked through `isMarkdown`**,
 * which is exported for exactly this reason — two copies of "what counts as
 * markdown" would let this rule and level 3's structural read disagree about
 * one listing. Measured need: a `review-mockup.png` inside a UX run folder was
 * identified family `review`, shape `document`, at `certain` — an image
 * reported as a review because its filename starts with a word.
 *
 * A name with no extension is admitted, because that is what a run folder and
 * every other directory looks like, and a dotfile with no second extension
 * (`.memlog`) is a name BMAD writes.
 */
function carriesDocumentName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot <= 0 || isMarkdown(name);
}

/**
 * The `{kind}-{slug}` prefix a name carries, if any.
 *
 * An empty slug is deliberately **not** rejected: `review-` names no reviewer,
 * but it still says the kind, and the alternative was an unobserved branch
 * whose only effect was an inconsistency — `review-.md` read `review` outside a
 * root, from the hint table, and the enclosing family inside one.
 */
function kindPrefixOf(
  stem: string,
  options: { readonly aboutAnotherArtifactOnly?: boolean } = {},
): (typeof KIND_PREFIXES)[number] | undefined {
  for (const kind of KIND_PREFIXES) {
    if (options.aboutAnotherArtifactOnly === true && !kind.aboutAnotherArtifact) continue;
    if (stem.startsWith(kind.prefix)) return kind;
  }
  return undefined;
}

/**
 * The kind a candidate's **own basename** declares, guard applied.
 *
 * One place, called by three: level 1, the level-2/3 constraint, and level 4.
 * Takes the whole relative path rather than a stem so that the guard and the
 * stem are derived the same way at every call site — the earlier version had
 * each caller do half of it.
 */
function declaredKind(
  relative: string,
  options: { readonly aboutAnotherArtifactOnly?: boolean } = {},
): (typeof KIND_PREFIXES)[number] | undefined {
  const name = baseName(relative).toLowerCase();
  if (!carriesDocumentName(name)) return undefined;
  return kindPrefixOf(nameStem(name), options);
}

/**
 * The families a `{kind}-{slug}` name resolves to, and nothing from the slug.
 *
 * `undefined` means no prefix answered, which is what lets a caller fall
 * through to the next rule; an **empty array** means a prefix answered and its
 * kind has no family — a different fact, and the one that keeps
 * `reconcile-prd.md` from being read as a PRD.
 */
function kindPrefixFamilies(relative: string): readonly Family[] | undefined {
  const kind = declaredKind(relative);
  if (kind === undefined) return undefined;
  return kind.family === undefined ? [] : [kind.family];
}

/**
 * A level's families, constrained by what the candidate's name says it is.
 *
 * **The half the first version of this fix missed, and the more damaging
 * half.** The prefix rule reached levels 1 and 4; `HEADING_PHRASES` and
 * `declaredFamilies` were untouched, so outside every artifact root — which
 * this module's own header calls exactly what a project using its own layout
 * looks like — a review was still read as the artifact it reviews, and at
 * `certain`, which outranks the `likely` level-4 reading that had just been
 * corrected. Measured: `review-rubric.md` with the heading
 * `# PRD Quality Review — BMAD Dashboard CLI` came back `prd` at `structure`;
 * `review-adv.md` titled `Adversarial review — BMAD Dashboard CLI PRD` came
 * back `ambiguous ['prd', 'review']` at `frontmatter`.
 *
 * A filter and not a veto: a review that declares `type: review` still resolves
 * at level 2, at `certain`, because that is the document naming *itself*. What
 * is discarded is a family that only ever came from the document naming its
 * **subject** — which is why only `aboutAnotherArtifact` kinds constrain
 * anything. A `spec-1-7-x.md` titled `Story 1.7 — …` is still read as a story
 * from its own declaration, because a spec is about itself and because a name
 * must not decide between `spec-`'s two spellings; that is level 1's job.
 */
function constrainToKind(relative: string, families: readonly Family[]): readonly Family[] {
  const kind = declaredKind(relative, { aboutAnotherArtifactOnly: true });
  if (kind === undefined) return families;
  return families.filter((family) => family === kind.family);
}

/**
 * The first ATX heading in a document's own prose.
 *
 * A leading frontmatter block is skipped, and so is anything inside a fenced
 * code block. Both are corrections: a `#` line inside frontmatter is a YAML
 * comment and a `#` line inside a fence is sample text, and reading either as
 * the document's heading takes a structural signal from something that is not
 * structure. An unclosed frontmatter block therefore yields no heading, which
 * is the conservative direction — level 2 has already reported it unavailable.
 */
function firstHeading(text: string): string | undefined {
  const lines = withoutMark(text).split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  let index = 0;
  if (lines[0]?.trimEnd() === '---') {
    index = 1;
    while (index < lines.length && !/^(?:---|\.\.\.)$/.test((lines[index] ?? '').trimEnd())) {
      index += 1;
    }
    index += 1;
  }
  let fenced = false;
  for (; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').trim();
    if (line.startsWith('```') || line.startsWith('~~~')) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !line.startsWith('#')) continue;
    const heading = line.replace(/^#+\s*/, '').trim();
    if (heading !== '') return heading;
  }
  return undefined;
}

/** Level 3 for a file: what its own first heading names. */
function headingFamilies(text: string): readonly Family[] {
  const heading = firstHeading(text);
  if (heading === undefined) return [];
  const found: Family[] = [];
  for (const { phrase, family } of HEADING_PHRASES) {
    if (phrase.test(heading)) found.push(family);
  }
  return familySet(found);
}

/**
 * Level 3 for a directory: which families its own **documents** name.
 *
 * Restricted to markdown children, and exactly matched rather than
 * hint-matched. Both restrictions are corrections of a measured false positive:
 * without them, `_bmad-output` itself is identified as a spec at `certain`
 * confidence, because it *contains* a directory called `specs`. A family's
 * structural signature is the document it holds — `prd.md`, `SPEC.md`,
 * `ARCHITECTURE-SPINE.md` — not the name of a sibling folder.
 */
function childFamilies(names: readonly string[]): readonly Family[] {
  const found: Family[] = [];
  for (const name of names) {
    if (!isMarkdown(name)) continue;
    const stem = nameStem(name);
    for (const { hint, family } of NAME_HINTS) {
      if (stem === hint) found.push(family);
    }
  }
  return familySet(found);
}

/**
 * Level 4 for a directory: the kind prefix, then the run-folder patterns, then
 * the basename hints — **stopping at the first that answers**.
 *
 * The stop is the fix, not the order. This ran the patterns and *then*
 * hint-matched the whole folder name with nothing in between, so a matched
 * pattern's slug was read as a second signal: `spec-ux-tokens` came back
 * ambiguous between `ux-design` and `spec`, and a research folder named for a
 * topic that happens to contain a family word did the same. Once a prefix has
 * said what kind of thing this is, the rest of the name is a slug and a slug is
 * never a family signal (FR-49).
 */
function directoryNameFamilies(name: string): readonly Family[] {
  const normalized = name.toLowerCase();
  const kind = kindPrefixFamilies(name);
  if (kind !== undefined) return kind;
  const runs = runFolderFamilies(normalized);
  if (runs.length > 0) return runs;
  return hintFamilies(normalized);
}

/**
 * The families a directory name matches as a run folder.
 *
 * Exported because Story 1.10 owns BMAD's layout irregularities and will ask
 * this question of a folder name without wanting a whole verdict — and because
 * a table this measured deserves to be assertable directly rather than only
 * through the levels above it.
 */
export function runFolderFamilies(name: string): readonly Family[] {
  const normalized = name.toLowerCase();
  const found: Family[] = [];
  for (const { prefix, family, dated } of RUN_FOLDER_PATTERNS) {
    if (!normalized.startsWith(prefix)) continue;
    if (normalized.length === prefix.length) continue;
    if (dated && !TRAILING_DATE.test(normalized)) continue;
    found.push(family);
  }
  return familySet(found);
}

/**
 * Level 4 for a file: the kind prefix, then the basename hints, extension
 * removed — and the prefix stops the hints for the reason above it.
 *
 * The two rows this closes are FR-49's first two positions: `review-design.md`
 * was identified as family `ux-design`, which is the prohibition in its own
 * words, and `reconcile-prd.md` as a `prd`. Both now read the position and not
 * the slug.
 */
function fileNameFamilies(name: string): readonly Family[] {
  return kindPrefixFamilies(name) ?? hintFamilies(nameStem(name));
}

/**
 * The structural readings a directory supports, both of which can be true.
 *
 * FR-73's case exactly: a run-folder signal and an `index.md` are both present
 * in a directory BMAD's own discovery cannot classify, and the answer is to
 * carry both readings rather than to rank them.
 */
function directoryShapes(candidate: Candidate, container: boolean): readonly Shape[] {
  if (container) return ['container'];
  const runFolder =
    sitsWhereRunsLive(candidate.relative) ||
    runFolderFamilies(baseName(candidate.relative)).length > 0;

  // The two signals come from different places: the run-folder reading is
  // position and name, the sharded reading is the listing. So a listing that
  // was never taken does not refute the sharded reading — it leaves it open,
  // which is FR-73's ambiguity arrived at by missing information rather than by
  // conflicting evidence. Answering `run-folder` here was the bug: a directory
  // the entry budget cut short reported a *certain* run folder over a listing
  // the walk had not finished, and an `index.md` one entry further on would
  // have made it ambiguous.
  if (!candidate.children.available) return runFolder ? ['run-folder', 'sharded-document'] : ['unknown'];

  const sharded = candidate.children.names.some(isShardIndex);
  if (sharded && runFolder) return ['run-folder', 'sharded-document'];
  if (sharded) return ['sharded-document'];
  if (runFolder) return ['run-folder'];
  // A directory with neither signal — a subfolder inside a run, say. Named
  // `unknown` rather than guessed at as a run folder, which is the guess a
  // consumer would then have to unpick.
  return ['unknown'];
}

/** The shapes a candidate supports, given the level-1 container answer. */
function shapesOf(candidate: Candidate, container: boolean): readonly Shape[] {
  if (candidate.kind === 'directory') return directoryShapes(candidate, container);
  if (candidate.kind === 'file') return ['document'];
  return ['unknown'];
}

/**
 * The readings an ambiguous verdict carries. **Never a cross product.**
 *
 * One axis is ambiguous at a time in every case anything has produced: two
 * shapes for one family is FR-73's run-folder-or-sharded-document, and two
 * families for one shape is a `type` and a `title` that disagree. Crossing them
 * where *both* are ambiguous emits pairs no signal produced — a `spec`
 * run-folder reading built from a `spec` family signal and a run-folder shape
 * signal that came from different evidence — so the shape is left `unknown`
 * there instead. What that gives up is stated: the two shapes that were
 * signalled do not appear in the readings, and `unknown` is what a consumer
 * gets. Inventing the pairing was the worse of the two.
 */
function readingsOf(families: readonly Family[], shapes: readonly Shape[]): readonly Reading[] {
  if (families.length > 1 && shapes.length > 1) {
    return families.map((family) => ({ family, shape: 'unknown' as Shape }));
  }
  if (shapes.length > 1) {
    const family = families[0];
    return family === undefined ? [] : shapes.map((shape) => ({ family, shape }));
  }
  const shape = shapes[0] ?? 'unknown';
  return families.map((family) => ({ family, shape }));
}

/**
 * Turn a level's answer into a verdict.
 *
 * One family and one shape is `identified`; anything more is `ambiguous` with
 * every reading named and none preferred. Confidence is `certain` for the three
 * levels that read something the artifact actually declares or contains, and
 * `likely` for level 4 and for every ambiguous verdict.
 */
function verdictFrom(
  candidate: Candidate,
  level: Level,
  families: readonly Family[],
  container: boolean,
  attempted: readonly Attempt[],
): Verdict {
  const shapes = shapesOf(candidate, container);
  const confidence: Confidence = level === 'filename' ? 'likely' : 'certain';
  const family = families[0];
  const shape = shapes[0];
  if (families.length === 1 && shapes.length === 1 && family !== undefined && shape !== undefined) {
    return { outcome: 'identified', family, shape, resolvedAt: level, confidence, attempted };
  }
  return {
    outcome: 'ambiguous',
    readings: readingsOf(families, shapes),
    resolvedAt: level,
    confidence: 'likely',
    attempted,
  };
}

/** Level 2, as one total answer. */
function frontmatterLevel(candidate: Candidate, textOf: ContentSource): LevelAnswer {
  if (candidate.kind === 'directory') {
    return unavailable('frontmatter', 'a directory has no frontmatter');
  }
  const content = textOf();
  if (!content.available) return unavailable('frontmatter', content.reason);
  const signal = frontmatterFamilies(content.text);
  if (signal.declined !== undefined) return unavailable('frontmatter', signal.declined);
  // A declaration that only named this document's *subject* is no signal about
  // this document — `no-signal` and not `unavailable`, because the level ran
  // and the frontmatter was read; what it found was a target, not an identity.
  const families = constrainToKind(candidate.relative, signal.families);
  return families.length > 0 ? resolved('frontmatter', families) : noSignal('frontmatter');
}

/** Level 3, as one total answer. */
function structureLevel(candidate: Candidate, textOf: ContentSource): LevelAnswer {
  if (candidate.kind === 'directory') {
    if (LAYOUT_DIRECTORIES.includes(candidate.relative.toLowerCase())) {
      return unavailable('structure', 'a layout directory holds families rather than being one');
    }
    if (!candidate.children.available) return unavailable('structure', candidate.children.reason);
    const families = constrainToKind(candidate.relative, childFamilies(candidate.children.names));
    return families.length > 0 ? resolved('structure', families) : noSignal('structure');
  }
  const content = textOf();
  if (!content.available) return unavailable('structure', content.reason);
  const families = constrainToKind(candidate.relative, headingFamilies(content.text));
  return families.length > 0 ? resolved('structure', families) : noSignal('structure');
}

/** Level 4, as one total answer. Needs only the name, so it is never unavailable. */
function filenameLevel(candidate: Candidate): LevelAnswer {
  const name = baseName(candidate.relative);
  const families =
    candidate.kind === 'directory' ? directoryNameFamilies(name) : fileNameFamilies(name);
  return families.length > 0 ? resolved('filename', families) : noSignal('filename');
}

/**
 * Identify one candidate.
 *
 * Never throws, for anything: AD-7 makes a failure a typed value, and this is
 * the pass's inner loop, so an exception here would abort an inventory over
 * one unreadable file. The levels that need content record themselves
 * `unavailable` and identification continues to the next one — the alternative,
 * a level marked as having run and found nothing, would report a fact nobody
 * measured.
 */
export function identify(candidate: Candidate): Verdict {
  const attempted: Attempt[] = [];

  // Read at most once, and only when a level actually asks. Levels 2 and 3
  // both want a file's text and neither should cause a second read.
  let content: Content | undefined;
  const textOf: ContentSource = () => (content ??= candidate.content());

  const location = locationSignal(candidate.relative);
  if (location !== undefined) {
    attempted.push({ level: 'location', result: 'resolved' });
    return verdictFrom(candidate, 'location', [location.family], location.container, attempted);
  }
  attempted.push({ level: 'location', result: 'no-signal' });

  for (const level of [frontmatterLevel, structureLevel] as const) {
    const answer = level(candidate, textOf);
    attempted.push(answer.attempt);
    if (answer.families.length > 0) {
      return verdictFrom(candidate, answer.attempt.level, answer.families, false, attempted);
    }
  }

  const named = filenameLevel(candidate);
  attempted.push(named.attempt);
  if (named.families.length > 0) {
    return verdictFrom(candidate, 'filename', named.families, false, attempted);
  }

  return { outcome: 'unidentified', attempted };
}
