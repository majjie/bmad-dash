/**
 * The document model: one named test per I/O-matrix row, plus the three things
 * a mutation would quietly change.
 *
 *   - **Part order.** Asserted as a whole list, with the fixture's names handed
 *     over in reverse and with `index.md` last, so a model that merely passed
 *     the listing through would fail. An assertion that only checked
 *     `paths[0]` would be satisfied by an otherwise arbitrary order.
 *   - **The ambiguity.** Both readings, in the verdict's order, and the key set
 *     of the composition itself — so a `chosen`, `preferred` or `resolved`
 *     field cannot appear without a failure. "No test can observe one being
 *     chosen" is only true if something checks that there is nothing to
 *     observe.
 *   - **Equivalence.** A whole document and a sharded one holding the same
 *     content are compared field by field, and the only difference permitted is
 *     `parts`.
 *
 * Verdicts are built by calling `identify` over a candidate rather than written
 * out by hand. The model consumes what the authority recorded, so a fixture
 * verdict nobody could produce would test a shape that cannot occur — and the
 * one thing this story must not do is invent a reading identity did not make.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { identify, SHARD_INDEX, type Candidate, type Verdict } from '../../src/domain/identity.ts';
import {
  compose,
  documentsOf,
  type Composition,
  type Document,
  type PartListing,
  type PartOmission,
  type Parts,
} from '../../src/domain/document.ts';
// The pass's own translation from a `Listing` to a `PartListing`, imported
// rather than re-implemented: a lookalike helper here is a second spelling of
// that contract, and the copy is the one that keeps passing after the original
// changes. Importing the CLI layer into a domain test is fine — `test/` is
// ungated by design, and the rule the gate enforces is about what ships.
import { partsListing } from '../../src/cli/inventory.ts';

/** A file candidate, the way the pass builds one. */
function file(relative: string, text = ''): Candidate {
  return {
    relative,
    kind: 'file',
    content: () => ({ available: true, text }),
    children: { available: false, reason: 'not a directory (file)' },
  };
}

/** A directory candidate whose listing is available. */
function directory(relative: string, names: readonly string[] = []): Candidate {
  return {
    relative,
    kind: 'directory',
    content: () => ({ available: false, reason: 'not a regular file (directory)' }),
    children: { available: true, names },
  };
}

/** A directory candidate whose listing a bound stopped. */
function unlisted(relative: string, reason: string): Candidate {
  return {
    relative,
    kind: 'directory',
    content: () => ({ available: false, reason: 'not a regular file (directory)' }),
    children: { available: false, reason },
  };
}

/** The listing in the model's vocabulary, through the pass's own translation. */
function listing(
  candidate: Candidate,
  omissions: readonly PartOmission[] = [],
  aliases: readonly string[] = [],
): PartListing {
  return partsListing(candidate.children, omissions, aliases);
}

/** Compose a candidate through the authority, the way the pass does. */
function composed(
  candidate: Candidate,
  omissions: readonly PartOmission[] = [],
  aliases: readonly string[] = [],
): Composition {
  return compose({
    relative: candidate.relative,
    identity: identify(candidate),
    children: listing(candidate, omissions, aliases),
  });
}

/** A skipped name, as `omissionsByParent` reports one. */
function skipped(name: string): PartOmission {
  return { omitted: 'name', name, reason: `${name} was left out of the listing: dependency directory` };
}

/** `reading` per reading, so the whole offer is one assertion. */
function readings(composition: Composition): readonly string[] {
  return composition.readings.map((reading) =>
    reading.reading === 'document'
      ? `document:${reading.document.shape}`
      : `not-a-document:${reading.shape}`,
  );
}

/** The one document a composition offers, or a failure naming what it offered. */
function onlyDocument(composition: Composition): Document {
  const documents = documentsOf(composition);
  assert.equal(documents.length, 1, `expected one document, got ${readings(composition).join(', ')}`);
  const document = documents[0];
  assert.ok(document !== undefined);
  assert.equal(document.relative, composition.relative, 'a document is keyed by the artifact path');
  return document;
}

/** The paths of a `Parts`, or `null` where there are none to have. */
function paths(parts: Parts): readonly string[] | null {
  return parts.state === 'unavailable' ? null : parts.paths;
}

const SHARD_NAMES: readonly string[] = ['requirements.md', 'index.md', 'appendix.md', 'goals.md'];

// ---------------------------------------------------------------------------
// The matrix, row by row
// ---------------------------------------------------------------------------

test('a whole document is one document whose single part is itself', () => {
  const whole = composed(file('_bmad-output/loose/handover/prd.md', '# A PRD\n'));
  assert.deepEqual(readings(whole), ['document:document']);
  const document = onlyDocument(whole);
  assert.equal(document.shape, 'document');
  assert.deepEqual(document.parts, {
    state: 'complete',
    paths: ['_bmad-output/loose/handover/prd.md'],
  });
});

test('a sharded document is index.md first, then its markdown siblings lexically', () => {
  // The names are handed over unsorted and with the index in the middle, so a
  // model that passed the listing through, or sorted it without lifting the
  // index, fails. Both `.md` filters matter: the `.txt` and the `assets`
  // directory are not parts.
  const sharded = composed(
    directory('_bmad-output/loose/handover/prd', [...SHARD_NAMES, 'notes.txt', 'assets']),
  );
  assert.deepEqual(readings(sharded), ['document:sharded-document']);
  const document = onlyDocument(sharded);
  assert.equal(document.shape, 'sharded-document');
  assert.deepEqual(document.parts, {
    state: 'complete',
    paths: [
      '_bmad-output/loose/handover/prd/index.md',
      '_bmad-output/loose/handover/prd/appendix.md',
      '_bmad-output/loose/handover/prd/goals.md',
      '_bmad-output/loose/handover/prd/requirements.md',
    ],
  });
});

test('the part order does not depend on the order the listing arrived in', () => {
  const forward = composed(directory('_bmad-output/loose/handover/prd', [...SHARD_NAMES].sort()));
  const backward = composed(
    directory('_bmad-output/loose/handover/prd', [...SHARD_NAMES].sort().reverse()),
  );
  assert.deepEqual(paths(onlyDocument(forward).parts), paths(onlyDocument(backward).parts));
  assert.equal(paths(onlyDocument(backward).parts)?.[0]?.endsWith(`/${SHARD_INDEX}`), true);
});

test('both signals offer both readings, the sharded one carrying its parts', () => {
  // FR-73's row: an `index.md` inside a directory whose name and position both
  // say run folder. BMAD's own discovery asks a human here; this offers both.
  const both = composed(
    directory('_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01', [
      'index.md',
      'requirements.md',
      '.memlog.md',
    ]),
  );
  const verdict = identify(
    directory('_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01', ['index.md']),
  );
  assert.equal(verdict.outcome, 'ambiguous', 'the fixture must actually be the ambiguous case');

  assert.deepEqual(readings(both), ['not-a-document:run-folder', 'document:sharded-document']);
  const document = onlyDocument(both);
  assert.deepEqual(paths(document.parts), [
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01/index.md',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01/.memlog.md',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01/requirements.md',
  ]);

  // The run-folder reading is stated rather than dropped, so a consumer can see
  // that this composition is an offer of two and not an answer of one.
  const other = both.readings.find((reading) => reading.reading === 'not-a-document');
  assert.ok(other !== undefined && other.reading === 'not-a-document');
  assert.match(other.reason, /run folder/);
});

test('nothing in a composition ranks, prefers or resolves a reading', () => {
  // The absence is the design, so it is asserted rather than trusted: no field
  // anywhere in the composition says which reading won, and every reading has
  // exactly the fields its own variant declares.
  const both = composed(
    directory('_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01', ['index.md']),
  );
  assert.deepEqual(Object.keys(both).sort(), ['readings', 'relative']);
  for (const reading of both.readings) {
    assert.deepEqual(
      Object.keys(reading).sort(),
      reading.reading === 'document' ? ['document', 'reading'] : ['reading', 'reason', 'shape'],
    );
  }
  // And the order is the verdict's order, which is an order and not a ranking:
  // the reading that is *not* a document comes first, so a consumer reading
  // `readings[0]` as "the answer" gets the run folder rather than the document.
  assert.equal(both.readings[0]?.reading, 'not-a-document');
});

test('a shard set with no index is not claimed as a document', () => {
  // Measured-possible and deliberately unclaimed: `review-edge-cases.md` says
  // an `index.md` "may be absent from a shard set", and with no index and no
  // run-folder signal there is no second signal to claim one from. Recorded as
  // this story's honest limit rather than guessed at.
  const shardSet = composed(
    directory('_bmad-output/loose/handover/prd-parts', ['goals.md', 'requirements.md']),
  );
  assert.deepEqual(documentsOf(shardSet), []);
  assert.deepEqual(readings(shardSet), ['not-a-document:unknown']);
});

test('a listing a bound stopped leaves the sharded reading open with parts unavailable', () => {
  const cut = composed(
    unlisted(
      '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01',
      'entry budget of 6 reached',
    ),
  );
  assert.deepEqual(readings(cut), ['not-a-document:run-folder', 'document:sharded-document']);
  const document = onlyDocument(cut);
  assert.deepEqual(document.parts, { state: 'unavailable', reason: 'entry budget of 6 reached' });
  assert.equal(paths(document.parts), null, 'no part is invented from evidence nobody holds');
});

test('a filtered listing reports its parts as possibly incomplete, never authoritative', () => {
  const filtered = composed(
    directory('_bmad-output/loose/handover/prd', ['index.md', 'goals.md']),
    [skipped('chapter.md')],
  );
  const document = onlyDocument(filtered);
  assert.equal(document.parts.state, 'possibly-incomplete');
  if (document.parts.state !== 'possibly-incomplete') return;
  assert.deepEqual(document.parts.reasons, [
    'chapter.md was left out of the listing: dependency directory',
  ]);
  // The parts it did find are still reported: a filtered listing supports a
  // partial answer, and withholding it would lose the shards that are there.
  assert.deepEqual(document.parts.paths, [
    '_bmad-output/loose/handover/prd/index.md',
    '_bmad-output/loose/handover/prd/goals.md',
  ]);
});

test('an empty directory is not a document', () => {
  const empty = composed(directory('_bmad-output/loose/handover/prd-parts', []));
  assert.deepEqual(documentsOf(empty), []);
  assert.deepEqual(readings(empty), ['not-a-document:unknown']);

  // An empty *run folder* is not one either, and says so as a run folder.
  const run = composed(directory('_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01', []));
  assert.deepEqual(readings(run), ['not-a-document:run-folder']);
});

// ---------------------------------------------------------------------------
// FR-9's own claim: one interface, one identity rule, one difference
// ---------------------------------------------------------------------------

test('a whole and a sharded document present the same interface, differing only in parts', () => {
  const whole = onlyDocument(composed(file('_bmad-output/loose/handover/prd.md', '# A PRD\n')));
  const sharded = onlyDocument(
    composed(directory('_bmad-output/loose/handover/prd', ['index.md', 'goals.md'])),
  );

  // The identity rule is the same rule, applied to each artifact's own path —
  // asserted through `onlyDocument`, which checks it against the composition's
  // `relative` for both. What is left is that the *fields* are the same fields
  // and that `parts` is the only one that differs.
  assert.deepEqual(Object.keys(whole).sort(), Object.keys(sharded).sort());
  assert.deepEqual(Object.keys(whole).sort(), ['parts', 'relative', 'shape']);

  assert.notDeepEqual(whole.parts, sharded.parts, 'the parts are the difference');
  assert.equal(whole.parts.state, sharded.parts.state, 'and the state vocabulary is shared');
  assert.deepEqual(paths(whole.parts)?.length, 1);
  assert.deepEqual(paths(sharded.parts)?.length, 2);
});

test('every composition offers at least one reading, whatever the verdict was', () => {
  // Total by construction: an empty `readings` would be indistinguishable from
  // a composition this function forgot to fill in, and the unidentified verdict
  // — which carries no shape at all — is the case that reaches it.
  const candidates: readonly Candidate[] = [
    file('_bmad-output/unremarkable.txt', 'nothing familiar\n'),
    file('_bmad-output/loose/handover/prd.md', '# A PRD\n'),
    directory('_bmad-output/loose/nothing', ['unremarkable.txt']),
    directory('_bmad-output/planning-artifacts/prds', ['prd-bmad-2026-08-28']),
    unlisted('_bmad-output/loose/deep/inner', 'entry budget of 6 reached'),
  ];
  for (const candidate of candidates) {
    const composition = composed(candidate);
    assert.ok(composition.readings.length >= 1, candidate.relative);
    assert.equal(composition.relative, candidate.relative);
    for (const reading of composition.readings) {
      if (reading.reading === 'not-a-document') {
        assert.notEqual(reading.reason, '', `${candidate.relative}: a refusal states its reason`);
      }
    }
  }
});

test('an artifact no level identified has no composition, and no shape is invented for it', () => {
  const unknown = composed(file('_bmad-output/unremarkable.txt', 'nothing familiar\n'));
  const verdict: Verdict = identify(file('_bmad-output/unremarkable.txt', 'nothing familiar\n'));
  assert.equal(verdict.outcome, 'unidentified', 'the fixture must be the unidentified case');
  assert.deepEqual(documentsOf(unknown), []);
  assert.deepEqual(readings(unknown), ['not-a-document:unknown']);
});

test("a family's own directory holds artifacts rather than parts", () => {
  const container = composed(
    directory('_bmad-output/planning-artifacts/prds', ['prd-bmad-2026-08-28']),
  );
  assert.deepEqual(readings(container), ['not-a-document:container']);
  assert.deepEqual(documentsOf(container), []);
});

test('two readings that differ only in family compose once, not twice', () => {
  // A `type` and a `title` naming different families is ambiguous on the family
  // axis, which composition does not read: the identity is the path and the
  // parts are the listing. Emitting one document per family would offer two
  // indistinguishable readings and imply a choice nobody has to make.
  const disagreeing = composed(
    file('_bmad-output/loose/handover/thing.md', '---\ntype: prd\ntitle: Product Brief\n---\n'),
  );
  const verdict = identify(
    file('_bmad-output/loose/handover/thing.md', '---\ntype: prd\ntitle: Product Brief\n---\n'),
  );
  assert.equal(verdict.outcome, 'ambiguous');
  if (verdict.outcome !== 'ambiguous') return;
  assert.equal(verdict.readings.length, 2, 'two families, one shape');
  assert.deepEqual(readings(disagreeing), ['document:document']);
});

test('a part is a path and never content, whatever it points at', () => {
  // AD-3: the snapshot pass does not build a rendering representation, so the
  // model is extraction-shaped by construction — `compose` is never handed
  // text. A `.png` a location resolved is a one-part document for the same
  // reason: composition is not renderability, which is Epic 2's question.
  const image = composed(file('_bmad-output/planning-artifacts/ux-designs/ux-x/mockup.png'));
  const document = onlyDocument(image);
  assert.deepEqual(document.parts, {
    state: 'complete',
    paths: ['_bmad-output/planning-artifacts/ux-designs/ux-x/mockup.png'],
  });
  for (const part of paths(document.parts) ?? []) {
    assert.equal(typeof part, 'string');
  }
});

// ---------------------------------------------------------------------------
// What the pass can tell the model that the listing alone cannot
// ---------------------------------------------------------------------------

test('an omission that could never have been a part leaves the parts complete', () => {
  // The caveat has to have a case behind it. `node_modules` is the only name
  // the skip policy removes below the output folder and it is neither markdown
  // nor an index, so the parts genuinely are all of them — reporting otherwise
  // would put a permanent "may be short" on every artifact directory that
  // happens to contain a dependency directory, and a caveat nobody can act on
  // teaches a reader to ignore the honest ones.
  const filtered = composed(
    directory('_bmad-output/loose/handover/prd', ['index.md', 'goals.md']),
    [skipped('node_modules'), skipped('mockups')],
  );
  assert.equal(onlyDocument(filtered).parts.state, 'complete');

  // One markdown name among them is enough to make it uncertain again, and
  // only that one is named.
  const mixed = composed(
    directory('_bmad-output/loose/handover/prd', ['index.md']),
    [skipped('node_modules'), skipped('chapter.md')],
  );
  const parts = onlyDocument(mixed).parts;
  assert.equal(parts.state, 'possibly-incomplete');
  if (parts.state !== 'possibly-incomplete') return;
  assert.deepEqual(parts.reasons, ['chapter.md was left out of the listing: dependency directory']);
});

test('an omission the pass could only count still makes the parts uncertain', () => {
  // Past the pass's record cap the names are gone, so the omission arrives as a
  // count. It has to land: the earlier version dropped it, and a filtered
  // listing past the cap then composed as authoritative — the cap silently
  // undoing the report it exists to bound.
  const capped = composed(directory('_bmad-output/loose/handover/prd', ['index.md']), [
    { omitted: 'count', count: 24, reason: '24 name(s) were left out and not recorded individually' },
  ]);
  const parts = onlyDocument(capped).parts;
  assert.equal(parts.state, 'possibly-incomplete');
  if (parts.state !== 'possibly-incomplete') return;
  assert.deepEqual(parts.reasons, ['24 name(s) were left out and not recorded individually']);
  assert.deepEqual(parts.paths, ['_bmad-output/loose/handover/prd/index.md']);
});

test('an alias beside its target is one part, and stays a name in the listing', () => {
  // A symlink beside the file it points at: the directory holds both names, so
  // identification sees both — that `index.md` is the whole sharded signal —
  // and composition lists one part, because one file is one part and Epic 2
  // would otherwise render it twice.
  const names = ['aaa.md', 'index.md'];
  const withAlias = composed(
    directory('_bmad-output/loose/prd-bmad-2026-09-01', names),
    [],
    ['index.md'],
  );
  const document = documentsOf(withAlias).find((each) => each.shape === 'sharded-document');
  assert.ok(document !== undefined, 'the alias is still the signal that this may be sharded');
  assert.deepEqual(paths(document.parts), ['_bmad-output/loose/prd-bmad-2026-09-01/aaa.md']);

  // Nothing is claimed to be missing: an alias is a duplicate, not a shortfall.
  assert.equal(document.parts.state, 'complete');

  // And without the alias marking, the same listing yields two parts for one
  // file — which is what the marking exists to prevent.
  const unmarked = composed(directory('_bmad-output/loose/prd-bmad-2026-09-01', names));
  assert.equal(paths(documentsOf(unmarked)[0]?.parts ?? { state: 'unavailable', reason: '' })?.length, 2);
});
