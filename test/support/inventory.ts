/**
 * One inventory view that exercises every shape the surface can render.
 *
 * Shared rather than rebuilt per file for `test/support/cli.ts`'s own reason: a
 * field added to `InventoryView` should be a compile error in one place, and
 * three near-identical fixtures are how one of them ends up not covering the
 * row a later story added.
 *
 * Every row here corresponds to a line of the spec's I/O matrix, and the
 * hostile filename is deliberately in it: `test/render/page.test.ts` and
 * `test/render/inventory.test.ts` both render this and assert that no element
 * is created by it, so the injection case is covered by the fixture the whole
 * surface is rendered from rather than by a special-purpose one.
 */

import { digestOf } from '../../src/domain/snapshot.ts';
import type { ArtifactBody } from '../../src/render/artifact.ts';
import type { ArtifactRow, FamilyGroup, InventoryView } from '../../src/render/inventory.ts';

/** A filename a repository can legally contain, and which is markup if unescaped. */
export const HOSTILE_NAME = '<img src=x onerror=alert(1)>.md';

/** Where the hostile name sits, project-root-relative like every other path. */
export const HOSTILE_PATH = `_bmad-output/planning-artifacts/prds/${HOSTILE_NAME}`;

/** A document identified at level 1, read, and unremarkable. */
export const CERTAIN_ROW: ArtifactRow = {
  path: '_bmad-output/planning-artifacts/prds/prd-x-2026-08-28/prd.md',
  identity: { outcome: 'identified', shape: 'document', confidence: 'certain', resolvedAt: 'location' },
  readability: { state: 'present', stage: undefined },
  interpretation: 'interpreted',
  runFacts: [],
};

/** FR-69's confidence clause: resolved, and below certain. */
export const LIKELY_ROW: ArtifactRow = {
  path: '_bmad-output/loose-prd.md',
  identity: { outcome: 'identified', shape: 'document', confidence: 'likely', resolvedAt: 'filename' },
  readability: { state: 'present', stage: undefined },
  interpretation: 'interpreted',
  runFacts: [],
};

/** FR-12: identified, and no view can interpret the shape. */
export const UNINTERPRETED_ROW: ArtifactRow = {
  path: '_bmad-output/planning-artifacts/prds/prd-y-2026-08-29',
  identity: { outcome: 'identified', shape: 'unknown', confidence: 'certain', resolvedAt: 'location' },
  readability: { state: 'unchecked', stage: undefined },
  interpretation: 'present-but-uninterpreted',
  runFacts: [],
};

/** AD-8: found, and its bytes are not text. */
export const UNREADABLE_ROW: ArtifactRow = {
  path: '_bmad-output/planning-artifacts/prds/binary.md',
  identity: { outcome: 'identified', shape: 'document', confidence: 'certain', resolvedAt: 'location' },
  readability: { state: 'unreadable', stage: 'decode' },
  interpretation: 'interpreted',
  runFacts: [],
};

/** AD-8: a name with nothing behind it. Never rendered as "none". */
export const NOT_FOUND_ROW: ArtifactRow = {
  path: '_bmad-output/planning-artifacts/prds/gone.md',
  identity: { outcome: 'identified', shape: 'unknown', confidence: 'likely', resolvedAt: 'location' },
  readability: { state: 'absent', stage: 'resolve' },
  interpretation: undefined,
  runFacts: [],
};

/** The escaping case: a legal filename that is markup if it is not escaped. */
export const HOSTILE_ROW: ArtifactRow = {
  path: HOSTILE_PATH,
  identity: { outcome: 'identified', shape: 'document', confidence: 'certain', resolvedAt: 'location' },
  readability: { state: 'unchecked', stage: undefined },
  interpretation: 'interpreted',
  runFacts: [],
};

/**
 * A path whose own segment spells the grammar's section marker.
 *
 * The most delicate rule in `src/domain/url.ts` — a directory genuinely called
 * `section` is legal, and unescaped it would make this row's URL read as
 * artifact `.../prds`, section `prd.md`. Added to the shared fixture in Story
 * 2.1a's review round, where the rule was exercised only by the grammar's own
 * unit test: no fixture row and no served request had ever carried one, so the
 * escape and its round trip never ran through the surface or the adapter.
 */
export const SECTION_NAMED_ROW: ArtifactRow = {
  path: '_bmad-output/planning-artifacts/prds/section/prd.md',
  identity: { outcome: 'identified', shape: 'document', confidence: 'certain', resolvedAt: 'location' },
  readability: { state: 'present', stage: undefined },
  interpretation: 'interpreted',
  runFacts: [],
};

/** FR-73: one family, two shapes, and the tool ranks neither. */
export const AMBIGUOUS_SHAPE_ROW: ArtifactRow = {
  path: '_bmad-output/planning-artifacts/prds/prd-z-2026-08-30',
  identity: {
    outcome: 'ambiguous',
    readings: [
      { family: 'prd', shape: 'run-folder' },
      { family: 'prd', shape: 'sharded-document' },
    ],
    confidence: 'likely',
    resolvedAt: 'structure',
  },
  readability: { state: 'unchecked', stage: undefined },
  interpretation: 'interpreted',
  runFacts: [{ measured: true, reuse: 'accidental', dateSignal: 'present' }],
};

/** FR-72's dateless pair, and BMAD's own resume workflow. */
export const DELIBERATE_RUN_ROW: ArtifactRow = {
  path: '_bmad-output/specs/spec-see-the-inventory',
  identity: { outcome: 'identified', shape: 'run-folder', confidence: 'certain', resolvedAt: 'location' },
  readability: { state: 'unchecked', stage: undefined },
  interpretation: 'interpreted',
  runFacts: [{ measured: true, reuse: 'deliberate', dateSignal: 'absent' }],
};

/** A run-folder reading with no measured pattern: nothing is claimed. */
export const UNMEASURED_RUN_ROW: ArtifactRow = {
  path: '_bmad-output/planning-artifacts/prds/review-round-1',
  identity: { outcome: 'identified', shape: 'run-folder', confidence: 'likely', resolvedAt: 'filename' },
  readability: { state: 'unchecked', stage: undefined },
  interpretation: 'interpreted',
  runFacts: [{ measured: false }],
};

/** FR-69: no level resolved anything, and the levels tried are named. */
export const UNIDENTIFIED_ROW: ArtifactRow = {
  path: '_bmad-output/unremarkable.txt',
  identity: {
    outcome: 'unidentified',
    attempted: ['location', 'frontmatter', 'structure', 'filename'],
  },
  readability: { state: 'unchecked', stage: undefined },
  interpretation: 'unidentified',
  runFacts: [],
};

/** Two families signalled at one level: placed under neither. */
export const AMBIGUOUS_FAMILY_ROW: ArtifactRow = {
  path: '_bmad-output/two-readings.md',
  identity: {
    outcome: 'ambiguous',
    readings: [
      { family: 'prd', shape: 'document' },
      { family: 'brief', shape: 'document' },
    ],
    confidence: 'likely',
    resolvedAt: 'frontmatter',
  },
  readability: { state: 'present', stage: undefined },
  interpretation: 'interpreted',
  runFacts: [],
};

/** Two families *and* two shapes: the type cell that names both. */
export const AMBIGUOUS_BOTH_ROW: ArtifactRow = {
  path: '_bmad-output/crossed.md',
  identity: {
    outcome: 'ambiguous',
    readings: [
      { family: 'prd', shape: 'document' },
      { family: 'brief', shape: 'sharded-document' },
    ],
    confidence: 'likely',
    resolvedAt: 'structure',
  },
  readability: { state: 'present', stage: undefined },
  interpretation: 'interpreted',
  runFacts: [],
};

/**
 * A view holding every row shape, with the story location in tree.
 *
 * `forge` is deliberately absent from `groups`, so the per-family empty
 * sentence is exercised by rendering this: the render layer walks `FAMILIES`
 * and fills in every family the projection did not emit.
 */
export const FULL_INVENTORY_VIEW: InventoryView = {
  complete: true,
  artifactCount: 13,
  namesLeftOut: 13,
  aliases: [{ name: '_bmad-output/specs/link.md', reportedAt: '_bmad-output/specs/SPEC.md' }],
  // Arbitrary but fixed: this fixture exercises every row shape the surface can
  // render, which has nothing to do with *which* snapshot it came from.
  // `test/render/inventory.test.ts` asserts the real derivation over a live
  // pass instead.
  snapshotId: digestOf(['test/support/inventory.ts', 'FULL_INVENTORY_VIEW']),
  groups: [
    {
      family: 'prd',
      rows: [
        CERTAIN_ROW,
        LIKELY_ROW,
        UNINTERPRETED_ROW,
        UNREADABLE_ROW,
        NOT_FOUND_ROW,
        HOSTILE_ROW,
        SECTION_NAMED_ROW,
        AMBIGUOUS_SHAPE_ROW,
        UNMEASURED_RUN_ROW,
      ],
      notes: [],
    },
    { family: 'spec', rows: [DELIBERATE_RUN_ROW], notes: [] },
    {
      family: 'story',
      rows: [],
      notes: [{ kind: 'story-location', report: { kind: 'at', path: 'docs/stories' } }],
    },
    {
      family: undefined,
      rows: [UNIDENTIFIED_ROW, AMBIGUOUS_FAMILY_ROW, AMBIGUOUS_BOTH_ROW],
      notes: [],
    },
  ] satisfies readonly FamilyGroup[],
};

// ---------------------------------------------------------------------------
// Bodies: Story 2.1b's third argument
// ---------------------------------------------------------------------------

/**
 * The body a test that is not about content hands to the artifact surface.
 *
 * Shared for the reason the view above is: `renderArtifact` and
 * `StartServerOptions` both require one from this story on, so a dozen files
 * would otherwise each invent a literal, and the one that happened to carry a
 * `<script>` or an `https://` URL would quietly break the surface's own
 * "serves no script and fetches nothing" assertions.
 *
 * Deliberately short, deliberately markdown, and deliberately carrying no URL,
 * no embedded markup and no second `h1`: what it exercises is that a body
 * *arrives*, not what a parser does with one. `test/render/markdown.test.ts`
 * and `test/render/artifact.test.ts` own the shapes.
 */
export const FIXTURE_BODY_TEXT = '# Fixture\n\nOne short paragraph.\n';

export const READABLE_BODY: ArtifactBody = { ok: true, text: FIXTURE_BODY_TEXT };

/** A supplier answering with `READABLE_BODY` for every path it is asked about. */
export const readableBody = (): ArtifactBody => READABLE_BODY;
