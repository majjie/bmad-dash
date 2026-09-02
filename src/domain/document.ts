/**
 * What a document is **made of**, for both of its shapes at once.
 *
 * FR-9: "a document is handled equivalently whether it exists as a single file
 * or pre-sharded as a directory with an `index.md`". Story 1.7 decided the
 * *shape*; nothing modelled the composition, so every later story — paging
 * (FR-25/26), the contents rail, a permalink into a section (AD-18) — would
 * have had to re-derive it from a listing it no longer holds.
 *
 * One interface over both shapes, and the difference is confined to one field:
 *
 *   - the **identity** is the artifact's own project-root-relative path, for a
 *     whole document and a sharded one alike. That is the identity rule the
 *     whole tool keys on and this module does not invent a second one.
 *   - the **parts** are paths, ordered. A whole document has one part, itself.
 *     A sharded document has its `index.md` first and its markdown siblings
 *     after.
 *
 * **Paths only — never text, never tokens.** AD-3: the snapshot pass extracts a
 * bounded set of facts and does *not* build a rendering representation. Reading
 * or concatenating shard content into one document is Epic 2's FR-77, and this
 * module is deliberately unable to do it: it never receives content.
 *
 * **It consumes the verdict; it never re-derives a shape.** AD-4 puts identity
 * in exactly one module, so what is composed here is whatever
 * `identity.ts` recorded — including "nothing", which is why an unidentified
 * artifact composes to no document rather than to a document this module
 * decided existed. Two consequences worth stating rather than discovering:
 *
 *   - a verdict of `document` over a `.png` composes to a one-part document.
 *     Composition is not renderability; which parts can be *read* is Epic 2's
 *     question and it needs the same one-part model to ask it of.
 *   - an artifact no level identified has no recorded shape, so it has no
 *     composition. Story 1.9 lists it as present-but-uninterpreted, which is
 *     the honest answer for something whose family and shape are both unknown.
 *
 * **Ambiguity is carried, never resolved.** FR-73 and AD-4: a directory holding
 * an `index.md` *and* a run-folder name is both readings at once, and BMAD's own
 * discovery resolves that by asking a human. So `compose` returns one reading
 * per shape the verdict carried, in the verdict's own order, with the sharded
 * reading carrying its parts and the run-folder reading carrying none. There is
 * no preferred reading, no ranking field, and no way to ask this module which
 * one is right — the absence is the design, and `test/domain/document.test.ts`
 * pins the key set so a `chosen` field cannot appear quietly.
 *
 * **Order is a choice, not a specification.** No BMAD source states a shard
 * order: there is no manifest convention, `index.md` carries no ordering, and
 * it may be absent from a shard set altogether. `index.md` first then lexical
 * is therefore *invented* — recorded as such in `deferred-work.md` so Epic 2's
 * shard-boundary work (FR-77, Stories 2.9–2.11) can overrule it rather than
 * inherit it as a decision someone believes was specified.
 *
 * **What the listing cannot tell it, it does not guess.** The names come from
 * the walk the pass already performed — never a second enumeration — so they
 * are names and nothing more: a *directory* called `part.md` in a real listing
 * would be counted as a part, and there is no kind here to consult. (The pass
 * does not *add* such a name deliberately: where it restores a suppressed
 * alias it knows the kind and restores only files.) Two states exist for what
 * the listing does not support:
 *
 *   - `unavailable` — the enumeration did not finish, or finished with names
 *     the pass could not account for. The parts are unknown, which is not the
 *     same as there being none.
 *   - `possibly-incomplete` — a name that could have been a part was withheld
 *     from an otherwise available listing (the skip policy filtered one, and
 *     `Listing` has no available-but-filtered state to say so;
 *     `deferred-work.md` carries that hole). The parts found are reported and
 *     are not claimed to be all of them. Past the pass's own record cap an
 *     omission arrives as a *count* rather than a name, and still lands here.
 */

import { isMarkdown, isShardIndex, type Shape, type Verdict } from './identity.ts';

/** The two shapes that have parts. The other three are not documents. */
export type DocumentShape = 'document' | 'sharded-document';

/**
 * The paths a document is composed of, and how much of that is authoritative.
 *
 * Three states rather than two, and the third is the point: "the listing was
 * never taken" and "the listing was filtered" are different facts from "these
 * are the parts", and a model with one state for all three would report a
 * filtered listing as an authoritative one.
 */
export type Parts =
  | { readonly state: 'complete'; readonly paths: readonly string[] }
  | {
      readonly state: 'possibly-incomplete';
      readonly paths: readonly string[];
      /**
       * Why the listing may be short — one entry per omission that could have
       * been a part, which is a withheld *name* where the pass had one and a
       * count where its own record cap left it without one.
       */
      readonly reasons: readonly string[];
    }
  | { readonly state: 'unavailable'; readonly reason: string };

/**
 * One document: its identity, its shape, and what it is made of.
 *
 * The same interface for both shapes. A whole document and a sharded one
 * holding equivalent content differ here in exactly one field — `parts` — which
 * is what FR-9's "handled equivalently" means once it is a type rather than a
 * sentence.
 */
export interface Document {
  /** The artifact's own path, `/`-separated from the project root. */
  readonly relative: string;
  readonly shape: DocumentShape;
  readonly parts: Parts;
}

/**
 * One reading of what an artifact is made of.
 *
 * `not-a-document` is stated rather than omitted, so an ambiguous verdict's
 * *other* reading is visible in the composition too. Dropping it would be a
 * silent resolution — the model would offer exactly one document and a consumer
 * could not tell that reading apart from an unambiguous one.
 */
export type Reading =
  | { readonly reading: 'document'; readonly document: Document }
  | { readonly reading: 'not-a-document'; readonly shape: Shape; readonly reason: string };

/**
 * What one artifact is made of, under every reading its verdict carried.
 *
 * `readings` is never empty and is in the verdict's own order, which is an
 * order and not a ranking. More than one entry is FR-73's ambiguity, presented.
 */
export interface Composition {
  readonly relative: string;
  readonly readings: readonly Reading[];
}

/**
 * One name the listing does not include, or a group of names it cannot name.
 *
 * Two variants, because the pass can be in either position: it knows the name
 * the skip policy removed, and past that policy's record cap it knows only how
 * many there were. The `count` variant is what stops a cap from turning a
 * shortfall into silence — an omission nobody can name still has to be
 * reported, and reporting it as a name would be a fabrication.
 *
 * The **name is carried rather than pre-filtered** so that "could this have
 * been a part" is answered here, by the same `isMarkdown` the authority uses,
 * instead of in the pass with a second copy of the rule. A skipped
 * `node_modules` cannot have been a part and does not make parts uncertain; a
 * skipped `chapter.md` can and does.
 */
export type PartOmission =
  | { readonly omitted: 'name'; readonly name: string; readonly reason: string }
  | { readonly omitted: 'count'; readonly count: number; readonly reason: string };

/**
 * A directory's child names as the pass already has them, or why it has none.
 *
 * Deliberately *not* `identity.ts`'s `Listing`: this one carries `omissions`
 * and `aliases`, because a listing that had a name withheld still supports a
 * partial answer here, whereas level 3 was decided — with reasons recorded in
 * `src/cli/inventory.ts` and `deferred-work.md` — to read a filtered listing as
 * authoritative rather than to go silent over it. Widening `Listing` itself is
 * a domain vocabulary change that would alter identification, which this story
 * does not own.
 */
export type PartListing =
  | {
      readonly available: true;
      readonly names: readonly string[];
      /** What the listing does not include; empty when it is whole. */
      readonly omissions: readonly PartOmission[];
      /**
       * Names in `names` that are a second spelling of another name in the
       * same listing — a symlink beside its target.
       *
       * They stay in `names` because the directory really holds them and the
       * *identity* question is about what it holds; they are excluded from
       * parts because one file is one part. Which spelling survives is not a
       * choice made here: the pass excludes the alias and keeps the spelling
       * the walk reported, which is the identity the whole tool keys by.
       */
      readonly aliases: readonly string[];
    }
  | { readonly available: false; readonly reason: string };

/** One artifact to compose: its path, its recorded verdict, its children. */
export interface Subject {
  readonly relative: string;
  readonly identity: Verdict;
  readonly children: PartListing;
}

/** Why a shape that is not a document has no parts. */
const NOT_A_DOCUMENT: Readonly<Record<Exclude<Shape, DocumentShape>, string>> = {
  'run-folder': 'a run folder holds runs, not the parts of one document',
  container: "a family's own directory holds artifacts, not the parts of one document",
  // Covers both ways a shape can be `unknown`: recorded as such by the
  // authority — a directory with neither signal — and absent entirely, because
  // an unidentified verdict carries no shape at all.
  unknown: 'the shape is unknown, so nothing is claimed about its parts',
};

/**
 * The shapes a verdict carried, deduplicated, in the verdict's order.
 *
 * **Family-blind on purpose.** Two readings that differ only in family compose
 * identically — the identity is the path and the parts come from the listing,
 * neither of which a family touches — so a `type`/`title` disagreement over one
 * shape yields one composition rather than two indistinguishable ones. What is
 * never collapsed is the axis this story is about: two *shapes* stay two
 * readings.
 */
function shapesOf(verdict: Verdict): readonly Shape[] {
  if (verdict.outcome === 'identified') return [verdict.shape];
  if (verdict.outcome === 'unidentified') return [];
  const shapes: Shape[] = [];
  for (const reading of verdict.readings) {
    if (!shapes.includes(reading.shape)) shapes.push(reading.shape);
  }
  return shapes;
}

/**
 * Lexical by code unit, and deliberately not `localeCompare`.
 *
 * A part order that depended on the machine's locale would put two developers'
 * page numbers in different orders over one document, which is the class of
 * divergence AD-18 exists to prevent.
 */
function byName(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** A part's path: the child's name under the document's own directory. */
function partPath(relative: string, name: string): string {
  return `${relative}/${name}`;
}

/**
 * The parts of a sharded document: `index.md` first, then the rest, lexically.
 *
 * Only markdown children are parts. A run folder's `.memlog.md` is markdown
 * too, which is one of the reasons the run-folder-versus-sharded ambiguity is
 * carried rather than resolved: where both readings stand, these are the parts
 * the *sharded* reading would have, and nothing here claims that reading is the
 * right one.
 *
 * More than one spelling of the index can survive a case-sensitive volume
 * (`index.md` beside `Index.md`); both sort to the front, among themselves
 * lexically, rather than one being picked.
 */
function shardParts(relative: string, children: PartListing): Parts {
  if (!children.available) return { state: 'unavailable', reason: children.reason };
  const markdown = children.names.filter(
    (name) => isMarkdown(name) && !children.aliases.includes(name),
  );
  const paths = [
    ...markdown.filter(isShardIndex).sort(byName),
    ...markdown.filter((name) => !isShardIndex(name)).sort(byName),
  ].map((name) => partPath(relative, name));

  // Only an omission that could have been a part makes the parts uncertain.
  // Reported the other way round, every artifact directory that happens to
  // contain a `node_modules` would claim its parts might be short, which is a
  // caveat with no case behind it — and a caveat nobody can act on is the kind
  // that teaches a reader to ignore the honest ones.
  const reasons = children.omissions
    .filter((omission) => omission.omitted === 'count' || isMarkdown(omission.name))
    .map((omission) => omission.reason);
  return reasons.length > 0
    ? { state: 'possibly-incomplete', paths, reasons }
    : { state: 'complete', paths };
}

/** The parts of a whole document: itself, and nothing else. */
function wholeParts(relative: string): Parts {
  return { state: 'complete', paths: [relative] };
}

/**
 * Compose one artifact: what it is made of, under every reading it carries.
 *
 * Never throws, for the reason `identify` never does: this runs once per entry
 * in the snapshot pass, and AD-7 makes a failure a typed value rather than an
 * exception that would abort an inventory over one directory.
 */
export function compose(subject: Subject): Composition {
  const shapes = shapesOf(subject.identity);
  const readings: Reading[] = shapes.map((shape) => {
    if (shape === 'document' || shape === 'sharded-document') {
      return {
        reading: 'document',
        document: {
          relative: subject.relative,
          shape,
          parts: shape === 'document' ? wholeParts(subject.relative) : shardParts(subject.relative, subject.children),
        },
      };
    }
    return { reading: 'not-a-document', shape, reason: NOT_A_DOCUMENT[shape] };
  });

  // Total by construction: an unidentified verdict carries no shape, and a
  // composition with no readings at all would be indistinguishable from one
  // this function forgot to fill in.
  return {
    relative: subject.relative,
    readings:
      readings.length > 0
        ? readings
        : [{ reading: 'not-a-document', shape: 'unknown', reason: NOT_A_DOCUMENT.unknown }],
  };
}

/**
 * The documents among a composition's readings, in its order.
 *
 * Two of them is not a thing any signal produces — one artifact has at most one
 * document reading, because `document` and `sharded-document` come from
 * mutually exclusive evidence (a file versus a directory's listing) — so this
 * is a filter rather than a choice, and it returns a list so it stays one.
 */
export function documentsOf(composition: Composition): readonly Document[] {
  return composition.readings.flatMap((reading) =>
    reading.reading === 'document' ? [reading.document] : [],
  );
}
