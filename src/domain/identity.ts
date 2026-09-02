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
 * Every family an artifact can belong to.
 *
 * The first seven are FR-11's run-folder families. The last four are what the
 * implementation output root holds, and they exist because the artifact
 * universe is wider than the run-folder one — see the header.
 */
export type Family =
  | 'brief'
  | 'prd'
  | 'architecture'
  | 'ux-design'
  | 'research'
  | 'spec'
  | 'forge'
  | 'epics'
  | 'story'
  | 'sprint-tracking'
  | 'note';

/**
 * FR-11's seven, in FR-11's order. These and only these are what a run-folder
 * pattern resolves to, which is the claim FR-11 actually makes.
 */
export const RUN_FOLDER_FAMILIES: readonly Family[] = [
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
    readonly family: Family;
  }[];
  readonly residual: Family;
}[] = [
  {
    path: '_bmad-output/implementation-artifacts',
    documents: [
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
  readonly family: Family;
  readonly dated: boolean;
}[] = [
  { prefix: 'brief-', family: 'brief', dated: true },
  { prefix: 'prd-', family: 'prd', dated: true },
  { prefix: 'architecture-', family: 'architecture', dated: true },
  { prefix: 'ux-', family: 'ux-design', dated: true },
  ...RESEARCH_TYPES.map((type) => ({ prefix: `${type}-`, family: 'research' as Family, dated: true })),
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
 */
function locationSignal(
  relative: string,
): { readonly family: Family; readonly container: boolean } | undefined {
  const lower = relative.toLowerCase();
  for (const root of ARTIFACT_ROOTS) {
    if (lower === root.path) return { family: root.family, container: true };
    if (lower.startsWith(`${root.path}/`)) return { family: root.family, container: false };
  }
  for (const root of DOCUMENT_ROOTS) {
    // The root's own directory is layout, not an artifact — see DOCUMENT_ROOTS.
    if (lower === root.path) return undefined;
    if (!lower.startsWith(`${root.path}/`)) continue;
    const stem = nameStem(baseName(lower));
    for (const rule of root.documents) {
      if (rule.stems?.includes(stem) === true) return { family: rule.family, container: false };
      if (rule.prefix !== undefined && stem.startsWith(rule.prefix)) {
        return { family: rule.family, container: false };
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
 */
function declaredFamilies(value: string): readonly Family[] {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  const found: Family[] = [];
  for (const { hint, family } of NAME_HINTS) {
    if (matchesHint(normalized, hint)) found.push(family);
  }
  return familySet(found);
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

/** Level 4 for a directory: the run-folder patterns, then the basename hints. */
function directoryNameFamilies(name: string): readonly Family[] {
  const found: Family[] = [...runFolderFamilies(name)];
  const stem = name.toLowerCase();
  for (const { hint, family } of NAME_HINTS) {
    if (matchesHint(stem, hint)) found.push(family);
  }
  return familySet(found);
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

/** Level 4 for a file: the basename hints, extension removed. */
function fileNameFamilies(name: string): readonly Family[] {
  const stem = nameStem(name);
  const found: Family[] = [];
  for (const { hint, family } of NAME_HINTS) {
    if (matchesHint(stem, hint)) found.push(family);
  }
  return familySet(found);
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
  return signal.families.length > 0
    ? resolved('frontmatter', signal.families)
    : noSignal('frontmatter');
}

/** Level 3, as one total answer. */
function structureLevel(candidate: Candidate, textOf: ContentSource): LevelAnswer {
  if (candidate.kind === 'directory') {
    if (LAYOUT_DIRECTORIES.includes(candidate.relative.toLowerCase())) {
      return unavailable('structure', 'a layout directory holds families rather than being one');
    }
    if (!candidate.children.available) return unavailable('structure', candidate.children.reason);
    const families = childFamilies(candidate.children.names);
    return families.length > 0 ? resolved('structure', families) : noSignal('structure');
  }
  const content = textOf();
  if (!content.available) return unavailable('structure', content.reason);
  const families = headingFamilies(content.text);
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
