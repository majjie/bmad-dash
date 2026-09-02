/**
 * The single identification authority, one named test per I/O-matrix row.
 *
 * Two things are pinned harder than the rows themselves, because they are what
 * a mutation would quietly change:
 *
 *   - **The order.** Each precedence pin sets up a candidate that *two* levels
 *     could answer, with the two levels naming **different families**, and
 *     asserts which one won. A test where both levels agree is satisfied by any
 *     order at all, so it pins nothing.
 *   - **Level 4's confidence.** Asserted on every filename verdict in the file
 *     and once as a property over the whole matrix, since "filename alone is
 *     never sufficient" is the half of FR-8 that a `certain` there would erase.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACT_ROOTS,
  DOCUMENT_ROOTS,
  FAMILIES,
  KIND_PREFIXES,
  LEVELS,
  LEVEL_LABELS,
  RESEARCH_TYPES,
  RUN_FOLDER_FAMILIES,
  RUN_FOLDER_PATTERNS,
  identify,
  runFolderFamilies,
  type Candidate,
  type Level,
  type Verdict,
} from '../../src/domain/identity.ts';

/** A readable file with `text` as its contents. */
function file(relative: string, text = ''): Candidate {
  return {
    relative,
    kind: 'file',
    content: () => ({ available: true, text }),
    children: { available: false, reason: 'not a directory (file)' },
  };
}

/**
 * A readable file that counts how many times its text was asked for.
 *
 * The only way to assert the laziness contract: `content` is a function so a
 * level that does not need the text never causes a read, and levels 2 and 3
 * between them cause at most one.
 */
function countedFile(
  relative: string,
  text = '',
): { readonly candidate: Candidate; reads(): number } {
  let reads = 0;
  return {
    candidate: {
      relative,
      kind: 'file',
      content: () => {
        reads += 1;
        return { available: true, text };
      },
      children: { available: false, reason: 'not a directory (file)' },
    },
    reads: () => reads,
  };
}

/** A readable directory holding `names`. */
function directory(relative: string, names: readonly string[] = []): Candidate {
  return {
    relative,
    kind: 'directory',
    content: () => ({ available: false, reason: 'not a regular file (directory)' }),
    children: { available: true, names },
  };
}

/** A file that is there and whose text could not be read. */
function unreadable(relative: string, reason: string): Candidate {
  return {
    relative,
    kind: 'file',
    content: () => ({ available: false, reason }),
    children: { available: false, reason },
  };
}

/** An entry the walk did not report as `present`, so its kind is unknown. */
function unexamined(relative: string, reason: string): Candidate {
  return {
    relative,
    kind: 'unknown',
    content: () => ({ available: false, reason }),
    children: { available: false, reason },
  };
}

/** An entry that is neither a file nor a directory — a FIFO, a socket. */
function neither(relative: string): Candidate {
  return {
    relative,
    kind: 'unknown',
    content: () => ({ available: false, reason: 'not a regular file (other)' }),
    children: { available: false, reason: 'not a directory (other)' },
  };
}

/** `level:result` per attempt, so the whole attempt record is one assertion. */
function attempts(verdict: Verdict): readonly string[] {
  return verdict.attempted.map((attempt) => `${attempt.level}:${attempt.result}`);
}

/** The level a verdict resolved at, or `null` when nothing resolved. */
function resolvedAt(verdict: Verdict): Level | null {
  return verdict.outcome === 'unidentified' ? null : verdict.resolvedAt;
}

const PRD_HEADING = '# bmad-dash — Product Requirements\n\nAt a glance.\n';

/** The string index that defines the copy for the unidentified case. */
const EXPERIENCE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '_bmad-output',
  'planning-artifacts',
  'ux-designs',
  'ux-bmad-2026-08-28',
  'EXPERIENCE.md',
);

/** The measured record of BMAD's own shapes, including the slug-position table. */
const SOURCE_SHAPES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '_bmad-output',
  'specs',
  'spec-bmad-dash',
  'bmad-source-shapes.md',
);

// ---------------------------------------------------------------------------
// The four levels, each pinned as the one that resolved
// ---------------------------------------------------------------------------

test('level 1 resolves a file under a known artifact path, at certain confidence', () => {
  const verdict = identify(
    file('_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md', PRD_HEADING),
  );
  assert.deepEqual(verdict, {
    outcome: 'identified',
    family: 'prd',
    shape: 'document',
    resolvedAt: 'location',
    confidence: 'certain',
    attempted: [{ level: 'location', result: 'resolved' }],
  });
});

test('level 2 resolves an unconventional filename from its frontmatter, location having been attempted', () => {
  const text = ['---', 'title: Handover notes', 'type: prd', '---', '', '# Notes'].join('\n');
  const verdict = identify(file('_bmad-output/notes/handover-2026.md', text));
  assert.equal(verdict.outcome, 'identified');
  assert.equal(resolvedAt(verdict), 'frontmatter');
  assert.deepEqual(attempts(verdict), ['location:no-signal', 'frontmatter:resolved']);
  if (verdict.outcome !== 'identified') return;
  assert.equal(verdict.family, 'prd');
  assert.equal(verdict.confidence, 'certain');
});

test('level 2 reads a prose title as well as a slug type', () => {
  // FR-8 names one level over two fields of different shapes: a `type` is a
  // slug and a `title` is prose, so both are asserted rather than the one the
  // implementation happened to be written against.
  const prose = ['---', 'title: Product Requirements Document', '---'].join('\n');
  const byTitle = identify(file('_bmad-output/notes/handover.md', prose));
  assert.equal(byTitle.outcome === 'identified' ? byTitle.family : null, 'prd');
  assert.equal(resolvedAt(byTitle), 'frontmatter');

  const slug = ['---', 'type: architecture-spine', '---'].join('\n');
  const byType = identify(file('_bmad-output/notes/handover.md', slug));
  assert.equal(byType.outcome === 'identified' ? byType.family : null, 'architecture');
  assert.equal(resolvedAt(byType), 'frontmatter');

  // And a title that merely names the project declares nothing.
  const project = ['---', 'title: bmad-dash', 'status: final', '---'].join('\n');
  const neither = identify(file('_bmad-output/notes/handover.md', project));
  assert.equal(neither.outcome, 'unidentified');
});

test('level 3 resolves a file with no frontmatter from its own first heading', () => {
  const verdict = identify(file('_bmad-output/notes/handover-2026.md', PRD_HEADING));
  assert.equal(resolvedAt(verdict), 'structure');
  assert.deepEqual(attempts(verdict), [
    'location:no-signal',
    'frontmatter:no-signal',
    'structure:resolved',
  ]);
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'prd');
});

test('level 3 resolves a directory from the family document it contains', () => {
  const verdict = identify(directory('_bmad-output/notes/handover', ['prd.md', '.memlog.md']));
  assert.equal(resolvedAt(verdict), 'structure');
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'prd');
  assert.deepEqual(attempts(verdict), [
    'location:no-signal',
    'frontmatter:unavailable',
    'structure:resolved',
  ]);
});

test('level 4 resolves a conventional name alone, and is never certain', () => {
  const verdict = identify(file('_bmad-output/notes/prd.md'));
  assert.deepEqual(verdict, {
    outcome: 'identified',
    family: 'prd',
    shape: 'document',
    resolvedAt: 'filename',
    confidence: 'likely',
    attempted: [
      { level: 'location', result: 'no-signal' },
      { level: 'frontmatter', result: 'no-signal' },
      { level: 'structure', result: 'no-signal' },
      { level: 'filename', result: 'resolved' },
    ],
  });
});

test('all three PRD spellings FR-8 names resolve, none of them certainly', () => {
  for (const name of ['prd.md', 'bmm-prd.md', 'product-requirements.md']) {
    const verdict = identify(file(`_bmad-output/notes/${name}`));
    assert.equal(verdict.outcome, 'identified', name);
    if (verdict.outcome !== 'identified') continue;
    assert.equal(verdict.family, 'prd', name);
    assert.equal(verdict.resolvedAt, 'filename', name);
    assert.equal(verdict.confidence, 'likely', `${name} must not be certain on a name alone`);
  }
});

test('nothing resolving names all four levels, in FR-8 order', () => {
  const verdict = identify(
    file('_bmad-output/notes/handover-2026.md', '# Notes\n\nNothing familiar here.\n'),
  );
  assert.equal(verdict.outcome, 'unidentified');
  assert.deepEqual(
    verdict.attempted.map((attempt) => attempt.level),
    [...LEVELS],
  );
  assert.deepEqual(attempts(verdict), [
    'location:no-signal',
    'frontmatter:no-signal',
    'structure:no-signal',
    'filename:no-signal',
  ]);
});

// ---------------------------------------------------------------------------
// The order itself
// ---------------------------------------------------------------------------

test('location wins over a frontmatter that names a different family', () => {
  const text = ['---', 'type: brief', '---'].join('\n');
  const verdict = identify(
    file('_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/odd.md', text),
  );
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'prd');
  assert.equal(resolvedAt(verdict), 'location');
  assert.deepEqual(attempts(verdict), ['location:resolved'], 'nothing after the level that resolved');
});

test('frontmatter wins over a heading that names a different family', () => {
  const text = ['---', 'type: brief', '---', '', '# bmad-dash — Product Requirements'].join('\n');
  const verdict = identify(file('_bmad-output/notes/handover.md', text));
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'brief');
  assert.equal(resolvedAt(verdict), 'frontmatter');
});

test('structure wins over a filename that names a different family', () => {
  const verdict = identify(file('_bmad-output/notes/brief.md', PRD_HEADING));
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'prd');
  assert.equal(resolvedAt(verdict), 'structure');
});

test('no verdict names a level after the one that resolved it', () => {
  const cases: readonly Candidate[] = [
    file('_bmad-output/specs/spec-x/SPEC.md'),
    file('_bmad-output/notes/a.md', ['---', 'type: brief', '---'].join('\n')),
    file('_bmad-output/notes/b.md', PRD_HEADING),
    file('_bmad-output/notes/prd.md'),
  ];
  for (const candidate of cases) {
    const verdict = identify(candidate);
    const level = resolvedAt(verdict);
    assert.notEqual(level, null, candidate.relative);
    const record = verdict.attempted;
    assert.equal(record[record.length - 1]?.level, level, candidate.relative);
    assert.equal(record[record.length - 1]?.result, 'resolved', candidate.relative);
    assert.equal(
      record.slice(0, -1).every((attempt) => attempt.result !== 'resolved'),
      true,
      candidate.relative,
    );
    // The attempted levels are a prefix of FR-8's order, never a reordering.
    assert.deepEqual(
      record.map((attempt) => attempt.level),
      LEVELS.slice(0, record.length),
      candidate.relative,
    );
  }
});

test('only a filename verdict is below certain, ambiguity aside', () => {
  const certain: readonly Candidate[] = [
    file('_bmad-output/specs/spec-x/SPEC.md'),
    file('_bmad-output/notes/a.md', ['---', 'type: brief', '---'].join('\n')),
    file('_bmad-output/notes/b.md', PRD_HEADING),
  ];
  for (const candidate of certain) {
    const verdict = identify(candidate);
    // `assert.equal` from `assert/strict` narrows, so the verdict is the
    // identified variant from here on and the confidence is readable directly.
    assert.equal(verdict.outcome, 'identified', candidate.relative);
    assert.equal(verdict.confidence, 'certain', candidate.relative);
  }
  const named = identify(file('_bmad-output/notes/prd.md'));
  assert.equal(named.outcome === 'identified' ? named.confidence : null, 'likely');
});

// ---------------------------------------------------------------------------
// Run folders: all seven families, including the two dateless patterns
// ---------------------------------------------------------------------------

test('a run folder of each of the seven families is recognized as its family', () => {
  // Six carry a name signal, so they are placed *outside* their artifact root
  // to force level 4 to answer. The seventh — forge, whose pattern is a bare
  // `{slug}` — carries none at all, so it is only ever recognizable by where it
  // sits. That is the measured fact, and the next test asserts its other half.
  const byName: readonly (readonly [string, string])[] = [
    ['brief-bmad-2026-08-28', 'brief'],
    ['prd-bmad-2026-08-28', 'prd'],
    ['architecture-bmad-2026-08-28', 'architecture'],
    ['ux-bmad-2026-08-28', 'ux-design'],
    ['market-pricing-2026-08-28', 'research'],
    ['spec-bmad-dash', 'spec'],
  ];
  for (const [name, family] of byName) {
    const verdict = identify(directory(`_bmad-output/loose/${name}`));
    assert.equal(verdict.outcome, 'identified', name);
    if (verdict.outcome !== 'identified') continue;
    assert.equal(verdict.family, family, name);
    assert.equal(verdict.shape, 'run-folder', name);
    assert.equal(verdict.resolvedAt, 'filename', name);
    assert.equal(verdict.confidence, 'likely', name);
  }

  const forge = identify(directory('_bmad-output/forge/read-only-dashboard'));
  assert.deepEqual(forge, {
    outcome: 'identified',
    family: 'forge',
    shape: 'run-folder',
    resolvedAt: 'location',
    confidence: 'certain',
    attempted: [{ level: 'location', result: 'resolved' }],
  });

  const covered = new Set([...byName.map(([, family]) => family), 'forge']);
  assert.deepEqual(
    [...covered].sort(),
    [...RUN_FOLDER_FAMILIES].sort(),
    'all seven run-folder families are covered',
  );
});

test('the two dateless patterns resolve, and a bare slug outside forge does not', () => {
  assert.deepEqual(runFolderFamilies('spec-bmad-dash'), ['spec'], 'spec-{slug} carries no date');
  assert.deepEqual(
    runFolderFamilies('read-only-dashboard'),
    [],
    'a bare slug carries no name signal at all',
  );
  const bare = identify(directory('_bmad-output/loose/read-only-dashboard'));
  assert.equal(bare.outcome, 'unidentified', 'a bare slug outside forge is not guessed at');
});

test('the date is load-bearing in the five dated patterns', () => {
  assert.deepEqual(runFolderFamilies('prd-bmad-2026-08-28'), ['prd']);
  assert.deepEqual(runFolderFamilies('prd-bmad'), [], 'a dated pattern without a date is not that pattern');
  assert.deepEqual(runFolderFamilies('ux-bmad-2026-8-28'), [], 'a partial date is not a date');
});

test('every shipped research type is a run-folder pattern', () => {
  for (const type of RESEARCH_TYPES) {
    assert.deepEqual(runFolderFamilies(`${type}-topic-2026-08-28`), ['research'], type);
  }
});

test('the four project-name patterns close with a date and the spec pattern does not', () => {
  // Renamed in Story 1.10, because the old name — "all four same-day-repeating
  // families are dated patterns" — committed this row to a claim it does not
  // make and that is not true. What is asserted here is **datedness**: which
  // patterns `TRAILING_DATE` closes. The *collision surface* is a different
  // fact and it is seven of seven, not four of seven: the other three reuse
  // their names too, and BMAD intends them to. That claim lives in
  // `src/domain/runs.ts` and is pinned in `test/domain/runs.test.ts`, on both
  // axes, so the two are never conflated again.
  const dated = RUN_FOLDER_PATTERNS.filter((pattern) => pattern.dated).map((pattern) => pattern.prefix);
  for (const prefix of ['brief-', 'prd-', 'architecture-', 'ux-']) {
    assert.equal(dated.includes(prefix), true, prefix);
  }
  assert.equal(
    RUN_FOLDER_PATTERNS.some((pattern) => pattern.prefix === 'spec-' && !pattern.dated),
    true,
  );
});

test('the directory of a family is recorded as its container, not as an artifact', () => {
  for (const root of ARTIFACT_ROOTS) {
    const verdict = identify(directory(root.path, ['whatever-2026-08-28']));
    assert.equal(verdict.outcome, 'identified', root.path);
    if (verdict.outcome !== 'identified') continue;
    assert.equal(verdict.family, root.family, root.path);
    assert.equal(verdict.shape, 'container', root.path);
    assert.equal(verdict.resolvedAt, 'location', root.path);
  }
});

test('two of the seven artifact roots sit outside planning-artifacts', () => {
  // Measured, not specified: a level-1 rule keyed on planning-artifacts alone
  // misses `specs` and `forge`, which is two families out of seven.
  const outside = ARTIFACT_ROOTS.filter(
    (root) => !root.path.startsWith('_bmad-output/planning-artifacts/'),
  );
  assert.deepEqual(
    outside.map((root) => root.path),
    ['_bmad-output/specs', '_bmad-output/forge'],
  );
  assert.equal(
    ARTIFACT_ROOTS.length,
    RUN_FOLDER_FAMILIES.length,
    'one single-family root per run-folder family',
  );
});

// ---------------------------------------------------------------------------
// FR-49 and FR-50 — the prefix names the kind, the slug names something else
//
// One row per slug position `bmad-source-shapes.md` measured, and each is
// asserted **negatively as well as positively**: the family the slug would have
// produced is named in the assertion, because the measured defect was not a
// missing family but a *spurious* one, and a row that only checks the right
// answer passes while a second wrong answer stands beside it.
// ---------------------------------------------------------------------------

test('a reviewer lens is never read as the family it reviews', () => {
  // The measured defect, in FR-49's own words: `review-design.md` was
  // identified as family `ux-design` because level 4 hint-matched the whole
  // stem after the prefix had already said what this is.
  const verdict = identify(file('_bmad-output/loose/review-design.md'));
  assert.deepEqual(verdict, {
    outcome: 'identified',
    family: 'review',
    shape: 'document',
    resolvedAt: 'filename',
    confidence: 'likely',
    attempted: [
      { level: 'location', result: 'no-signal' },
      { level: 'frontmatter', result: 'no-signal' },
      { level: 'structure', result: 'no-signal' },
      { level: 'filename', result: 'resolved' },
    ],
  });
  assert.notEqual(verdict.outcome, 'ambiguous', 'the lens must not add a second reading');

  // Every lens in this repository, so the row cannot pass on one lucky slug.
  // `rubric` and `edge-cases` name nothing; `design`, `contrast`,
  // `spine-seam`, `state-coverage`, `adversarial-seams` and `tech-currency`
  // are the ones a hint table has opinions about.
  for (const lens of [
    'design',
    'contrast',
    'spine-seam',
    'state-coverage',
    'adversarial',
    'adversarial-seams',
    'tech-currency',
    'edge-cases',
    'rubric',
    'ux-tokens',
    'prd',
    'architecture',
  ]) {
    const named = identify(file(`_bmad-output/loose/review-${lens}.md`));
    assert.equal(named.outcome === 'identified' ? named.family : null, 'review', lens);
  }
});

test('a reconcile slug names a source input and contributes no family at all', () => {
  // `reconcile-{slug}.md` names the input being reconciled, so `prd` is
  // precisely the reading FR-49 forbids. The family vocabulary has no word for
  // a reconciliation — adding a second family with no surface to render it was
  // left as a decision, recorded in `deferred-work.md` — so the honest answer
  // from the name is *no* family, not a wrong one.
  const loose = identify(file('_bmad-output/loose/reconcile-prd.md'));
  assert.equal(loose.outcome, 'unidentified');
  assert.deepEqual(attempts(loose), [
    'location:no-signal',
    'frontmatter:no-signal',
    'structure:no-signal',
    'filename:no-signal',
  ]);

  // And inside a family root, where the location would otherwise answer: the
  // kind declines the root's family rather than taking it, so level 1 reports
  // no signal and the levels that read the document get their turn.
  const inRoot = identify(
    file('_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/reconcile-prd.md'),
  );
  assert.equal(inRoot.outcome, 'unidentified', 'a reconciliation of a PRD is not a PRD');
  assert.deepEqual(attempts(inRoot), [
    'location:no-signal',
    'frontmatter:no-signal',
    'structure:no-signal',
    'filename:no-signal',
  ]);
});

test('a spec subject slug resolves one family and adds no second one', () => {
  // Measured ambiguity at this story's baseline: `spec-ux-tokens` came back
  // `[ux-design, spec]`, the `ux-design` half read out of the subject slug.
  assert.deepEqual(runFolderFamilies('spec-ux-tokens'), ['spec']);
  const verdict = identify(directory('_bmad-output/loose/spec-ux-tokens'));
  assert.equal(verdict.outcome, 'identified', 'no spurious ambiguity');
  if (verdict.outcome !== 'identified') return;
  assert.equal(verdict.family, 'spec');
  assert.equal(verdict.shape, 'run-folder');
});

test('a research topic slug adds no second family either', () => {
  // The fourth slug position, and the same rule covers it: a matched
  // run-folder pattern stops the name being read any further, so a topic that
  // happens to contain a family word contributes nothing.
  for (const topic of ['ux-tokens', 'prd-tooling', 'architecture', 'design']) {
    const verdict = identify(directory(`_bmad-output/loose/market-${topic}-2026-08-28`));
    assert.equal(verdict.outcome, 'identified', topic);
    if (verdict.outcome !== 'identified') continue;
    assert.equal(verdict.family, 'research', topic);
  }
});

test('four of the five measured slug positions are covered, and the fifth cannot be', () => {
  // **Attribution corrected in the review round.** FR-49 (`prd.md:178`) names
  // **three** positions — `review-{slug}.md`, `reconcile-{slug}.md` and a
  // `spec-{slug}` run folder. The fourth, `{research_type}-{topic_slug}-{date}`,
  // comes from `bmad-source-shapes.md`, and the old name of this row credited
  // all four to FR-49.
  //
  // Three are prefixes here; the fourth is a run-folder pattern, and the rule
  // that reads only the prefix is shared — so this row asserts the coverage
  // rather than the mechanism, and fails if a position is dropped from either
  // table.
  assert.deepEqual(
    KIND_PREFIXES.map((kind) => kind.prefix),
    ['review-', 'reconcile-', 'spec-'],
  );
  assert.equal(
    KIND_PREFIXES.find((kind) => kind.prefix === 'reconcile-')?.family,
    undefined,
    'the vocabulary has no family for a reconciliation, and says so rather than guessing',
  );
  assert.deepEqual(
    KIND_PREFIXES.filter((kind) => kind.aboutAnotherArtifact).map((kind) => kind.prefix),
    ['review-', 'reconcile-'],
    'only the kinds BMAD writes into another family workspace outrank the location',
  );
  assert.equal(
    RESEARCH_TYPES.every((type) => runFolderFamilies(`${type}-any-topic-2026-08-28`).length === 1),
    true,
    'the research position is covered by the pattern table',
  );
  // **The fifth position, and it is uncovered by construction.** A forge run
  // folder is a bare `{slug}` with no prefix at all, so neither table can hold
  // a row for it: a rule broad enough to match would match every directory.
  // The consequence is pinned rather than described, because it is the
  // slug-as-family reading this story exists to stop and it survives here — a
  // forge run called `prd-redesign` outside `_bmad-output/forge` reads `prd`
  // from the hint table, at `likely`. Inside the forge root, location answers
  // and the name is never consulted, which is FR-72's own point. Recorded in
  // `deferred-work.md`; this row is what fails if the reading silently changes.
  assert.deepEqual(
    KIND_PREFIXES.filter((kind) => kind.prefix === ''),
    [],
    'a bare slug has no prefix to hold a row for',
  );
  assert.deepEqual(runFolderFamilies('prd-redesign'), [], 'and no pattern matches it either');
  const outsideForge = identify(directory('_bmad-output/loose/prd-redesign'));
  assert.equal(
    outsideForge.outcome === 'identified' ? outsideForge.family : null,
    'prd',
    'the known-bad reading, pinned so a change to it is deliberate',
  );
  assert.equal(resolvedAt(outsideForge), 'filename');
  const insideForge = identify(directory('_bmad-output/forge/prd-redesign'));
  assert.equal(insideForge.outcome === 'identified' ? insideForge.family : null, 'forge');
  assert.equal(resolvedAt(insideForge), 'location', 'location is the only signal a forge run has');
});

test('both FR-50 review shapes resolve to review, at any depth and with no assumed path', () => {
  // FR-50's two locations, measured in this repository: six reviews sit at a
  // run folder's own root and three under a `reviews/` subfolder. The *locate*
  // half already held — level 1 matches a root by prefix containment at any
  // depth — but until `review` was a family there was nothing for it to
  // resolve to, so both shapes came back as the family of the workspace they
  // sat in.
  const shapes: readonly string[] = [
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/review-rubric.md',
    '_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/review-contrast.md',
    '_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/reviews/review-rubric.md',
    // Deeper still, because "at any depth" is the claim and two levels is the
    // deepest this repository happens to have.
    '_bmad-output/planning-artifacts/briefs/brief-x-2026-08-28/reviews/round-2/review-rubric.md',
  ];
  for (const relative of shapes) {
    const verdict = identify(file(relative));
    assert.equal(verdict.outcome, 'identified', relative);
    if (verdict.outcome !== 'identified') continue;
    assert.equal(verdict.family, 'review', relative);
    assert.equal(verdict.resolvedAt, 'location', relative);
    assert.equal(verdict.confidence, 'certain', relative);
  }

  // The workspace keeps its own answer for its own documents: the prefix rule
  // is not a licence for a name to override a location generally, and a
  // `spec-…` name inside another family root claims nothing.
  const prd = identify(file('_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md'));
  assert.equal(prd.outcome === 'identified' ? prd.family : null, 'prd');
  const named = identify(file('_bmad-output/planning-artifacts/prds/prd-x-2026-08-28/spec-notes.md'));
  assert.equal(named.outcome === 'identified' ? named.family : null, 'prd');
});

test('a document that declares itself a review is read as one', () => {
  // Three of this repository's nine reviews carry `type: review`. Level 1
  // answers for all of them where they sit, so this is the row that says the
  // declaration is readable at all — a family the frontmatter can name and the
  // filename cannot is a family half-added.
  const verdict = identify(file('_bmad-output/loose/round-2.md', '---\ntype: review\n---\n'));
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'review');
  assert.equal(resolvedAt(verdict), 'frontmatter');
});

test('a kind prefix is not overruled by a heading or a title that names the target', () => {
  // Review round finding, reproduced before it was fixed: the first version of
  // this story's fix reached levels 1 and 4 and left `HEADING_PHRASES` and
  // `declaredFamilies` untouched, so outside every artifact root — which this
  // module's header calls exactly what a project using its own layout looks
  // like — a review was still read as the artifact it reviews, at `certain`,
  // which outranks the `likely` level-4 reading that had just been corrected.
  //
  // Both measured rows, with the *real* strings from this repository's own
  // reviews rather than invented ones.
  const heading = identify(
    file('_bmad-output/loose/review-rubric.md', '# PRD Quality Review — BMAD Dashboard CLI\n'),
  );
  assert.equal(heading.outcome, 'identified', 'the heading names the target, not this document');
  if (heading.outcome !== 'identified') return;
  assert.equal(heading.family, 'review');
  assert.notEqual(heading.family, 'prd', 'level 3 must not name the reviewed artifact');
  assert.equal(heading.resolvedAt, 'filename', 'the heading contributed nothing, so level 4 answers');
  assert.equal(heading.confidence, 'likely');
  assert.deepEqual(attempts(heading), [
    'location:no-signal',
    // The level *ran* and found no family for this document: `no-signal`, not
    // `unavailable`, because the text was read and what it held was a target.
    'frontmatter:no-signal',
    'structure:no-signal',
    'filename:resolved',
  ]);

  // The commonest way a review titles itself, and the row that went
  // `ambiguous ['prd', 'review']` — for the very family the hint rows were
  // added to serve. A declaration that names *both* keeps the half that names
  // this document and discards the half that names its subject.
  const titled = identify(
    file(
      '_bmad-output/loose/review-adversarial.md',
      ['---', 'title: Adversarial review — BMAD Dashboard CLI PRD', '---'].join('\n'),
    ),
  );
  assert.equal(titled.outcome, 'identified', 'a two-family review title is not ambiguous');
  if (titled.outcome !== 'identified') return;
  assert.equal(titled.family, 'review');
  assert.equal(titled.resolvedAt, 'frontmatter', 'the document does declare itself a review');
  assert.equal(titled.confidence, 'certain');

  // And a review whose frontmatter names only its target resolves from its
  // name instead, rather than from the target.
  const target = identify(
    file('_bmad-output/loose/review-x.md', ['---', 'type: prd', '---'].join('\n')),
  );
  assert.equal(target.outcome === 'identified' ? target.family : null, 'review');
  assert.equal(resolvedAt(target), 'filename');

  // A reconciliation has no family at any level, so a heading naming the input
  // it reconciles resolves nothing at all — the FR-49 reading, closed on the
  // level that was reporting it at `certain`.
  const reconcile = identify(
    file('_bmad-output/loose/reconcile-epics.md', '# Reconciliation against the epics list\n'),
  );
  assert.equal(reconcile.outcome, 'unidentified');

  // The constraint applies only to a document *about another artifact*. A story
  // spec is about itself, and a name must not decide between `spec-`'s two
  // spellings — so its own declaration still wins, which is the property the
  // location test below depends on.
  const story = identify(
    file(
      '_bmad-output/loose/spec-1-7-x.md',
      ['---', 'title: Story 1.7 — identify what each artifact is', '---'].join('\n'),
    ),
  );
  assert.equal(story.outcome === 'identified' ? story.family : null, 'story');
  assert.equal(resolvedAt(story), 'frontmatter');
});

test('the implementation output root resolves reviews, declines reconciliations, and stays total otherwise', () => {
  // Review round finding: the level-1 rule returned `undefined` for a kind with
  // no family *anywhere*, which took the `DOCUMENT_ROOTS` residual with it and
  // regressed the totality property Story 1.7 added — the one whose absence
  // made a third of a real tree read "not identified". Two BMAD skills write
  // their reviews under `{implementation_artifacts}` when subagents are
  // unavailable, so both halves are real locations.
  const review = identify(file('_bmad-output/implementation-artifacts/review-story-1-10.md'));
  assert.deepEqual(review, {
    outcome: 'identified',
    family: 'review',
    shape: 'document',
    resolvedAt: 'location',
    confidence: 'certain',
    attempted: [{ level: 'location', result: 'resolved' }],
  });

  const reconcile = identify(file('_bmad-output/implementation-artifacts/reconcile-epics.md'));
  assert.equal(reconcile.outcome, 'unidentified', 'a reconciliation is not a working note');
  assert.equal(
    reconcile.outcome === 'unidentified' ? null : 'resolved',
    null,
    'and it is not resolved to the residual by another route either',
  );

  // Totality, restated as what it actually claims: every name **no rule
  // matches** resolves, to the residual. The exception above is a rule
  // matching and declining, not a hole.
  for (const name of ['anything-else.md', 'notes.txt', 'epic-1-context.md']) {
    const verdict = identify(file(`_bmad-output/implementation-artifacts/${name}`));
    assert.equal(verdict.outcome, 'identified', name);
    assert.equal(resolvedAt(verdict), 'location', name);
  }
  assert.equal(
    DOCUMENT_ROOTS[0]?.documents.some((rule) => rule.family === undefined),
    true,
    'the declining rule is in the table, not a side channel around it',
  );
});

test('the review hint rows are both load-bearing, and the plural one only outside a root', () => {
  // Review round finding: the plural row survived deletion with the whole
  // suite green. Both rows are pinned here, and the plural one is pinned in
  // the only place it can act — inside any artifact root, level 1 answers a
  // directory called `reviews` with the root's own family and level 4 is never
  // reached.
  assert.equal(
    identify(directory('_bmad-output/loose/reviews', [])).outcome === 'identified'
      ? 'resolved'
      : null,
    'resolved',
  );
  const dir = identify(directory('_bmad-output/loose/reviews', []));
  assert.equal(dir.outcome === 'identified' ? dir.family : null, 'review');
  const doc = identify(file('_bmad-output/loose/reviews.md'));
  assert.equal(doc.outcome === 'identified' ? doc.family : null, 'review');

  // The singular row, which is what a self-declaration needs.
  const declared = identify(file('_bmad-output/loose/round-3.md', '---\ntype: review\n---\n'));
  assert.equal(declared.outcome === 'identified' ? declared.family : null, 'review');

  // Inside a root the plural row is inert: this is the enclosing family, and
  // the comment that once said otherwise was wrong.
  const inRoot = identify(
    directory('_bmad-output/planning-artifacts/architecture/architecture-x-2026-08-28/reviews', [
      'review-rubric.md',
    ]),
  );
  assert.equal(inRoot.outcome === 'identified' ? inRoot.family : null, 'architecture');
  assert.equal(resolvedAt(inRoot), 'location');
});

test('the prefix rule speaks only about document names, so an image beside a mockup is not a review', () => {
  // Review round finding: `review-mockup.png` in a UX run folder resolved
  // family `review`, shape `document`, at `certain` — an image reported as a
  // review because its filename starts with a word. The guard asks
  // `isMarkdown`, which is exported precisely so two readers of "what counts
  // as markdown" cannot disagree.
  const image = identify(
    file('_bmad-output/planning-artifacts/ux-designs/ux-x-2026-08-28/mockups/review-mockup.png'),
  );
  assert.equal(image.outcome === 'identified' ? image.family : null, 'ux-design');
  assert.equal(resolvedAt(image), 'location');

  // The markdown sibling is still a review, so the guard has not closed the
  // rule it exists to bound.
  const document = identify(
    file('_bmad-output/planning-artifacts/ux-designs/ux-x-2026-08-28/review-contrast.md'),
  );
  assert.equal(document.outcome === 'identified' ? document.family : null, 'review');

  // A directory has no extension and is admitted, which is what a `spec-{slug}`
  // run folder needs.
  const folder = identify(directory('_bmad-output/loose/spec-ux-tokens'));
  assert.equal(folder.outcome === 'identified' ? folder.family : null, 'spec');
});

test('an empty slug names no lens, and reads the same way inside a root and outside one', () => {
  // The empty-slug guard was removed in the review round: it survived deletion
  // with the suite green, and its one observable effect was an inconsistency —
  // `review-.md` read `review` outside a root, from the hint table, and the
  // enclosing family inside one. Now the prefix answers in both places.
  const loose = identify(file('_bmad-output/loose/review-.md'));
  assert.equal(loose.outcome === 'identified' ? loose.family : null, 'review');
  const inRoot = identify(file('_bmad-output/planning-artifacts/prds/prd-x-2026-08-28/review-.md'));
  assert.equal(inRoot.outcome === 'identified' ? inRoot.family : null, 'review');
});

test("the slug meanings are read out of bmad-source-shapes.md, not restated here", async () => {
  // The mechanism the level labels, the signal labels and the interpretation
  // definitions already use, applied to the one table this story added: a
  // measured meaning restated from memory is a second copy of one belief.
  // Raised in the review round as dead data — documented as measured, read by
  // nothing, asserted by nothing.
  const measured = await readFile(SOURCE_SHAPES_PATH, 'utf8');
  const rows = new Map<string, string>();
  for (const line of measured.split('\n')) {
    const cells = /^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|$/.exec(line);
    if (cells === null) continue;
    const [, position, names] = cells;
    if (position === undefined || names === undefined) continue;
    rows.set(position, names);
  }
  assert.ok(rows.size >= 4, `the slug table was not found in bmad-source-shapes.md (${String(rows.size)} rows)`);

  const expected: readonly (readonly [string, string])[] = [
    ['review-', 'review-{slug}.md'],
    ['reconcile-', 'reconcile-{slug}.md'],
    ['spec-', 'spec-{slug}/'],
  ];
  for (const [prefix, position] of expected) {
    const kind = KIND_PREFIXES.find((row) => row.prefix === prefix);
    assert.ok(kind !== undefined, prefix);
    assert.equal(kind.slugNames, rows.get(position), position);
  }
  // The fourth position is the research pattern, and its meaning is measured in
  // the same table — asserted so the table cannot be trimmed to three.
  assert.equal(rows.get('{research_type}-{topic_slug}-{date}/'), 'the research topic');
});

// ---------------------------------------------------------------------------
// Ambiguity
// ---------------------------------------------------------------------------

test('a directory that could be a run folder or a sharded document is recorded ambiguous', () => {
  const verdict = identify(
    directory('_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01', [
      'index.md',
      'requirements.md',
    ]),
  );
  assert.equal(verdict.outcome, 'ambiguous');
  if (verdict.outcome !== 'ambiguous') return;
  assert.deepEqual(verdict.readings, [
    { family: 'prd', shape: 'run-folder' },
    { family: 'prd', shape: 'sharded-document' },
  ]);
  assert.equal(verdict.resolvedAt, 'location');
  assert.equal(verdict.confidence, 'likely', 'two readings standing is below certain');
});

test('an index.md folder matching a run-folder name is ambiguous even outside a root', () => {
  const verdict = identify(directory('_bmad-output/loose/prd-bmad-2026-08-28', ['index.md']));
  assert.equal(verdict.outcome, 'ambiguous');
  if (verdict.outcome !== 'ambiguous') return;
  assert.deepEqual(
    verdict.readings.map((reading) => reading.shape),
    ['run-folder', 'sharded-document'],
  );
});

test('a sharded document with no run-folder signal is not ambiguous', () => {
  const verdict = identify(directory('_bmad-output/loose/handover/prd', ['index.md', 'part-1.md']));
  assert.equal(verdict.outcome, 'identified');
  if (verdict.outcome !== 'identified') return;
  assert.equal(verdict.shape, 'sharded-document');
  assert.equal(verdict.family, 'prd');
});

test('a directory whose documents name two families is ambiguous rather than ranked', () => {
  const verdict = identify(directory('_bmad-output/loose/mixed', ['prd.md', 'SPEC.md']));
  assert.equal(verdict.outcome, 'ambiguous');
  if (verdict.outcome !== 'ambiguous') return;
  assert.deepEqual(
    verdict.readings.map((reading) => reading.family),
    ['prd', 'spec'],
  );
  assert.equal(verdict.resolvedAt, 'structure');
});

test('a nested directory inside a run carries no invented shape', () => {
  const verdict = identify(
    directory('_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/reviews', [
      'review-rubric.md',
    ]),
  );
  assert.equal(verdict.outcome, 'identified');
  if (verdict.outcome !== 'identified') return;
  assert.equal(verdict.shape, 'unknown', 'a subfolder of a run is not itself a run');
});

// ---------------------------------------------------------------------------
// Unreadable and unexamined input
// ---------------------------------------------------------------------------

test('an unreadable file records the content levels as unavailable and carries on', () => {
  const verdict = identify(unreadable('_bmad-output/notes/prd.md', 'not valid UTF-8 text'));
  assert.deepEqual(attempts(verdict), [
    'location:no-signal',
    'frontmatter:unavailable',
    'structure:unavailable',
    'filename:resolved',
  ]);
  assert.equal(
    verdict.attempted.every(
      (attempt) => (attempt.result === 'unavailable') === (attempt.reason !== undefined),
    ),
    true,
    'a reason is carried exactly where a level could not run',
  );
  assert.equal(verdict.attempted[1]?.reason, 'not valid UTF-8 text');
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'prd');
});

test('an entry the walk did not report present is identified by path alone', () => {
  // The reason the pass actually hands over: the platform's own words, and
  // only those. It used to be `'absent at the resolve stage: ENOENT'` here,
  // because the pass composed that sentence; Story 1.9 removed the composition
  // — the state and the stage are typed on the entry and on its readability
  // signal — so a fixture in that shape would test a format nothing produces.
  const reason = "ENOENT: no such file or directory, lstat '/p/_bmad-output/specs/spec-x/gone.md'";
  const under = identify(unexamined('_bmad-output/specs/spec-x/gone.md', reason));
  assert.equal(under.outcome, 'identified');
  if (under.outcome !== 'identified') return;
  assert.equal(under.family, 'spec');
  assert.equal(under.shape, 'unknown', 'nothing was examined, so nothing is claimed about the shape');

  const loose = identify(unexamined('_bmad-output/loose/gone.md', reason));
  assert.deepEqual(attempts(loose), [
    'location:no-signal',
    'frontmatter:unavailable',
    'structure:unavailable',
    'filename:no-signal',
  ]);
  assert.equal(loose.outcome, 'unidentified');
});

test('a directory records frontmatter as unavailable rather than as absent signal', () => {
  const verdict = identify(directory('_bmad-output/loose/empty'));
  const frontmatter = verdict.attempted.find((attempt) => attempt.level === 'frontmatter');
  assert.equal(frontmatter?.result, 'unavailable');
  assert.match(String(frontmatter?.reason), /directory has no frontmatter/);
});

test('a directory that could not be listed records structure as unavailable', () => {
  const verdict = identify({
    relative: '_bmad-output/loose/denied',
    kind: 'directory',
    content: () => ({ available: false, reason: 'not a regular file (directory)' }),
    children: { available: false, reason: 'not enumerated: depth limit of 2 reached' },
  });
  const structure = verdict.attempted.find((attempt) => attempt.level === 'structure');
  assert.equal(structure?.result, 'unavailable');
  assert.equal(structure?.reason, 'not enumerated: depth limit of 2 reached');
  assert.equal(verdict.outcome, 'unidentified');
});

test('identify never throws, whatever the candidate looks like', () => {
  const awkward: readonly Candidate[] = [
    file(''),
    file('.'),
    file('_bmad-output'),
    directory('_bmad-output/planning-artifacts/prds'),
    unexamined('', 'nothing'),
    file('_bmad-output/notes/x.md', '  '),
  ];
  for (const candidate of awkward) {
    assert.doesNotThrow(() => identify(candidate), JSON.stringify(candidate.relative));
  }
});

// ---------------------------------------------------------------------------
// The vocabulary itself
// ---------------------------------------------------------------------------

test('the precedence is the four levels FR-8 names, in the order it names them', () => {
  assert.deepEqual([...LEVELS], ['location', 'frontmatter', 'structure', 'filename']);
});

test('the level labels are read out of EXPERIENCE.md, not from a second copy', async () => {
  // The mechanism this repository already uses at `test/render/chrome.test.ts`
  // and `test/cli/suggest.test.ts`, and for the reason spelled out there: a
  // literal in a test that merely happens to match the string index is a
  // second copy of one belief, free to drift the moment either side is edited.
  // The header of `LEVEL_LABELS` claimed this test existed before it did.
  //
  // Scoped to the string-index table rather than the whole file, so a row
  // added elsewhere cannot satisfy it. The table is the one whose header row is
  // `| Situation | Says |`.
  const experience = await readFile(EXPERIENCE_PATH, 'utf8');
  const table = /\|\s*Situation\s*\|\s*Says\s*\|([\s\S]*?)\n\n/.exec(experience)?.[1];
  assert.ok(table !== undefined, 'EXPERIENCE.md must carry the load-bearing string index table');
  const row = /\|\s*Artifact unidentified\s*\|\s*`([^`]+)`\s*\|/.exec(table ?? '');
  assert.ok(row !== null, 'the string index must carry an "Artifact unidentified" row');

  const said = row?.[1] ?? '';
  // The row is a whole sentence; the levels are the comma-separated list after
  // `Tried:`, which is the part these labels are. Parsed rather than matched,
  // so a reworded sentence fails loudly instead of silently ceasing to check.
  const listed = /^Not identified\. Tried: (.+)\.$/.exec(said)?.[1];
  assert.ok(
    listed !== undefined,
    `the unidentified row no longer has the shape these labels are read from: ${said}`,
  );
  // actual first, expected second — a failure must report the two the right way round.
  assert.deepEqual(
    LEVELS.map((level) => LEVEL_LABELS[level]),
    (listed ?? '').split(', '),
    'the level labels state the precedence differently from the index that defines it',
  );
});

test('the run-folder families are the seven FR-11 requires, and the vocabulary is wider', () => {
  // FR-11 constrains *run folders*, not the artifact universe. The wider set
  // exists because `_bmad/bmm/config.yaml:7-8` declares a second output root
  // whose contents are none of the seven — and closing the vocabulary at seven
  // left about a third of this project's own tree with nothing to be.
  assert.deepEqual(
    [...RUN_FOLDER_FAMILIES],
    ['brief', 'prd', 'architecture', 'ux-design', 'research', 'spec', 'forge'],
  );
  assert.deepEqual(
    [...FAMILIES],
    [
      'brief',
      'prd',
      'architecture',
      'ux-design',
      'research',
      'spec',
      'forge',
      // Story 1.10's addition, and it is deliberately *not* one of FR-11's
      // seven: no skill writes a `review-…` run folder, and a review is a
      // different artifact from the thing it reviews — which is what gives
      // FR-50 something to resolve to.
      'review',
      'epics',
      'story',
      'sprint-tracking',
      'note',
    ],
  );
  assert.equal(
    (RUN_FOLDER_FAMILIES as readonly string[]).includes('review'),
    false,
    'review is a family but never a run-folder family',
  );
  assert.equal(
    RUN_FOLDER_FAMILIES.every((family) => FAMILIES.includes(family)),
    true,
    'the run-folder families are a subset of the whole vocabulary',
  );
  // Every run-folder pattern resolves to one of FR-11's seven and never to one
  // of the four the implementation root added.
  for (const pattern of RUN_FOLDER_PATTERNS) {
    assert.equal(
      RUN_FOLDER_FAMILIES.includes(pattern.family),
      true,
      `${pattern.prefix} resolves outside FR-11's seven`,
    );
  }
});

// ---------------------------------------------------------------------------
// The implementation output root, and the wider family vocabulary
// ---------------------------------------------------------------------------

test('the implementation output root is a level-1 root, and every document in it resolves', () => {
  // `_bmad/bmm/config.yaml:7-8` declares `implementation_artifacts` a peer of
  // `planning_artifacts`. Omitting it left every `spec-1-*.md`,
  // `epic-1-context.md`, `deferred-work.md` and `sprint-status.yaml` in this
  // project's own tree at `location: no-signal`.
  const rows: readonly (readonly [string, string])[] = [
    ['spec-1-7-identify-what-each-artifact-is.md', 'story'],
    ['spec-land-deferred-findings-cleanup.md', 'story'],
    ['epics.md', 'epics'],
    ['sprint-status.yaml', 'sprint-tracking'],
    ['epic-1-context.md', 'note'],
    ['deferred-work.md', 'note'],
    // The residual is what makes level 1 total over a declared root: a name no
    // rule matches still resolves rather than falling through four levels.
    ['something-nobody-anticipated.md', 'note'],
  ];
  for (const [name, family] of rows) {
    const verdict = identify(file(`_bmad-output/implementation-artifacts/${name}`));
    assert.equal(verdict.outcome, 'identified', name);
    if (verdict.outcome !== 'identified') continue;
    assert.equal(verdict.family, family, name);
    assert.equal(verdict.resolvedAt, 'location', name);
    assert.equal(verdict.confidence, 'certain', name);
    assert.deepEqual(attempts(verdict), ['location:resolved'], name);
  }
});

test('a story spec and a spec run are different families, told apart by location', () => {
  // Both are spelled `spec-…`. The `spec` family is a `bmad-spec` run under
  // `_bmad-output/specs`; a `story` is what `bmad-build` writes per story under
  // the implementation root. A name alone must not decide between them.
  const story = identify(file('_bmad-output/implementation-artifacts/spec-1-7-x.md'));
  assert.equal(story.outcome === 'identified' ? story.family : null, 'story');
  const run = identify(directory('_bmad-output/specs/spec-bmad-dash'));
  assert.equal(run.outcome === 'identified' ? run.family : null, 'spec');
});

test('the implementation root own directory is layout, not an artifact', () => {
  // It holds four families, so there is no family for it to be. Same for the
  // output folder itself and the planning root: BMAD's layout rather than
  // artifacts, and `test/cli/inventory.test.ts` enumerates them by name.
  for (const layout of [
    '_bmad-output',
    '_bmad-output/planning-artifacts',
    '_bmad-output/implementation-artifacts',
  ]) {
    const verdict = identify(directory(layout, ['prds', 'specs', 'forge']));
    assert.equal(verdict.outcome, 'unidentified', layout);
  }
  assert.deepEqual(
    DOCUMENT_ROOTS.map((root) => root.path),
    ['_bmad-output/implementation-artifacts'],
  );
});

test('an epics document outside a declared root still resolves, at level 4', () => {
  const verdict = identify(file('_bmad-output/loose/epics.md'));
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'epics');
  assert.equal(resolvedAt(verdict), 'filename');
  assert.equal(verdict.outcome === 'identified' ? verdict.confidence : null, 'likely');
});

// ---------------------------------------------------------------------------
// Level 3's measured false positive — the correction the change log keeps
// ---------------------------------------------------------------------------

test('a directory is not identified from a child that is not a document', () => {
  // The measured false positive this restriction corrected: `_bmad-output`
  // *contains* a directory called `specs`, and a level-3 read that
  // hint-matched every child name reported it as a spec at `certain`. Reverting
  // either half of the restriction — the markdown filter, or exact-stem instead
  // of hint matching — makes this row fail.
  const holder = identify(
    directory('_bmad-output/loose/holder', ['planning-artifacts', 'specs', 'forge']),
  );
  assert.equal(holder.outcome, 'unidentified', 'a directory of family directories is not a family');
  assert.deepEqual(attempts(holder), [
    'location:no-signal',
    'frontmatter:unavailable',
    'structure:no-signal',
    'filename:no-signal',
  ]);

  // `_bmad-output` is the case that was actually measured, and it is now
  // answered one step earlier: a layout directory is not read from its children
  // at all. Both rules are load-bearing and each is asserted where it applies.
  const output = identify(directory('_bmad-output', ['planning-artifacts', 'specs', 'forge']));
  assert.equal(output.outcome, 'unidentified', '_bmad-output holds families; it is not one');
  assert.deepEqual(attempts(output), [
    'location:no-signal',
    'frontmatter:unavailable',
    'structure:unavailable',
    'filename:no-signal',
  ]);
  assert.match(
    String(output.attempted.find((attempt) => attempt.level === 'structure')?.reason),
    /layout directory holds families/,
  );

  // A non-markdown child contributes nothing, however it is named.
  const scripts = identify(directory('_bmad-output/loose/tools', ['prd.ts', 'prd.json', 'prd']));
  assert.equal(scripts.outcome, 'unidentified', 'only a document is a structural signature');

  // And a loosely-matching markdown name contributes nothing either: the stem
  // must *be* the hint, not merely carry it.
  const loose = identify(directory('_bmad-output/loose/notes', ['about-the-prd-review.md']));
  assert.equal(loose.outcome, 'unidentified');

  // The positive control, so this row cannot pass by matching nothing at all.
  const real = identify(directory('_bmad-output/loose/run', ['prd.md']));
  assert.equal(real.outcome === 'identified' ? real.family : null, 'prd');
  assert.equal(resolvedAt(real), 'structure');
});

// ---------------------------------------------------------------------------
// AD-4 at level 2: a declaration that disagrees with itself
// ---------------------------------------------------------------------------

test('a type and a title naming different families is ambiguous, never tiebroken', () => {
  // AD-4's never-resolved-silently rule was unguarded here: taking the first
  // field that answered would report `brief` at `certain` and lose the fact
  // that the document says two things about itself.
  const text = ['---', 'type: brief', 'title: Product Requirements Document', '---'].join('\n');
  const verdict = identify(file('_bmad-output/loose/handover.md', text));
  assert.equal(verdict.outcome, 'ambiguous');
  if (verdict.outcome !== 'ambiguous') return;
  // Ordered by the family vocabulary, not by which field was read first, so
  // the reading list never depends on match order.
  assert.deepEqual(verdict.readings, [
    { family: 'brief', shape: 'document' },
    { family: 'prd', shape: 'document' },
  ]);
  assert.equal(verdict.resolvedAt, 'frontmatter');
  assert.equal(verdict.confidence, 'likely');
  assert.deepEqual(attempts(verdict), ['location:no-signal', 'frontmatter:resolved']);
});

test('a declared field the reader cannot interpret is unavailable, not absent signal', () => {
  // A flow collection, a block scalar and an unclosed block are all fields that
  // *existed* and could not be read. Reporting `no-signal` over them claims the
  // level ran and found no declaration, which is the false claim `unavailable`
  // exists to prevent one level down.
  const flow = identify(file('_bmad-output/loose/a.md', ['---', 'type: [prd, brief]', '---'].join('\n')));
  const flowAttempt = flow.attempted.find((attempt) => attempt.level === 'frontmatter');
  assert.equal(flowAttempt?.result, 'unavailable');
  assert.match(String(flowAttempt?.reason), /type carries a value this reader does not interpret/);

  const both = identify(
    file('_bmad-output/loose/b.md', ['---', 'type: [a]', 'title: |', '  x', '---'].join('\n')),
  );
  const bothAttempt = both.attempted.find((attempt) => attempt.level === 'frontmatter');
  assert.match(String(bothAttempt?.reason), /type and title/);

  const unclosed = identify(file('_bmad-output/loose/c.md', ['---', 'type: prd'].join('\n')));
  const unclosedAttempt = unclosed.attempted.find((attempt) => attempt.level === 'frontmatter');
  assert.equal(unclosedAttempt?.result, 'unavailable');
  assert.match(String(unclosedAttempt?.reason), /never closed/);
  assert.equal(unclosed.outcome, 'unidentified', 'an unclosed block is not authoritative');

  // A field that *is* readable and simply names no family stays `no-signal`.
  const plain = identify(file('_bmad-output/loose/d.md', ['---', 'title: bmad-dash', '---'].join('\n')));
  const plainAttempt = plain.attempted.find((attempt) => attempt.level === 'frontmatter');
  assert.equal(plainAttempt?.result, 'no-signal');
  assert.equal(plainAttempt?.reason, undefined);
});

// ---------------------------------------------------------------------------
// Reading is pulled, not pushed
// ---------------------------------------------------------------------------

test('a candidate whose location resolves is never read', () => {
  const counted = countedFile('_bmad-output/specs/spec-x/SPEC.md', '# The spec\n');
  const verdict = identify(counted.candidate);
  assert.equal(resolvedAt(verdict), 'location');
  assert.equal(counted.reads(), 0, 'level 1 needs only the path');
});

test('levels 2 and 3 between them read a document at most once', () => {
  const counted = countedFile('_bmad-output/loose/handover.md', '# Nothing familiar\n');
  const verdict = identify(counted.candidate);
  assert.equal(verdict.outcome, 'unidentified', 'both content levels ran');
  assert.deepEqual(attempts(verdict), [
    'location:no-signal',
    'frontmatter:no-signal',
    'structure:no-signal',
    'filename:no-signal',
  ]);
  assert.equal(counted.reads(), 1, 'the text is read once and memoized');
});

// ---------------------------------------------------------------------------
// Case, decided once
// ---------------------------------------------------------------------------

test('layout names are matched case-insensitively, wherever they appear in a path', () => {
  // Decided once and applied everywhere a layout name is compared: a
  // case-insensitive volume can hand back a different spelling of the directory
  // BMAD created, and the cost of refusing it is the whole inventory.
  const upper = identify(file('_BMAD-Output/Planning-Artifacts/PRDS/prd-x-2026-08-28/prd.md'));
  assert.equal(upper.outcome === 'identified' ? upper.family : null, 'prd');
  assert.equal(resolvedAt(upper), 'location');

  const mixedRoot = identify(file('_bmad-output/Implementation-Artifacts/Sprint-Status.yaml'));
  assert.equal(mixedRoot.outcome === 'identified' ? mixedRoot.family : null, 'sprint-tracking');

  // A run folder's own name too, which was already case-folded.
  assert.deepEqual(runFolderFamilies('PRD-Bmad-2026-08-28'), ['prd']);
  // And the shard index.
  const sharded = identify(directory('_bmad-output/loose/handover/prd', ['Index.MD']));
  assert.equal(sharded.outcome === 'identified' ? sharded.shape : null, 'sharded-document');
});

// ---------------------------------------------------------------------------
// Readings are observed, never crossed
// ---------------------------------------------------------------------------

test('two ambiguous axes do not become a cross product of readings', () => {
  // A directory whose documents name two families *and* which is both a
  // run-folder position and an `index.md` holder. Crossing the axes emitted
  // four readings, two of which paired a family signal with a shape signal that
  // came from different evidence.
  // Outside a single-family root, so level 3 is what answers and can answer
  // with two families; the name matches a dated run-folder pattern and the
  // directory holds an `index.md`, so the shape is two-ways too.
  const verdict = identify(
    directory('_bmad-output/loose/prd-bmad-2026-08-28', ['prd.md', 'SPEC.md', 'index.md']),
  );
  assert.equal(verdict.outcome, 'ambiguous');
  if (verdict.outcome !== 'ambiguous') return;
  assert.equal(verdict.resolvedAt, 'structure');
  assert.deepEqual(verdict.readings, [
    { family: 'prd', shape: 'unknown' },
    { family: 'spec', shape: 'unknown' },
  ]);
  assert.equal(
    verdict.readings.every((reading) => reading.shape === 'unknown'),
    true,
    'no reading asserts a pairing nothing signalled',
  );
});

// ---------------------------------------------------------------------------
// Level 3 reads prose, not frontmatter and not sample text
// ---------------------------------------------------------------------------

test('a hash line inside frontmatter or a code fence is not the document heading', () => {
  const inFrontmatter = [
    '---',
    '# Product Requirements — a YAML comment, not a heading',
    'status: final',
    '---',
    '',
    'Body with no heading at all.',
  ].join('\n');
  assert.equal(identify(file('_bmad-output/loose/a.md', inFrontmatter)).outcome, 'unidentified');

  const inFence = ['# Handover', '', '```', '# Product Requirements', '```', ''].join('\n');
  const fenced = identify(file('_bmad-output/loose/b.md', inFence));
  assert.equal(fenced.outcome, 'unidentified', 'the first real heading names no family');

  const fenceFirst = ['```md', '# Product Requirements', '```', '', '# Architecture spine', ''].join('\n');
  const afterFence = identify(file('_bmad-output/loose/c.md', fenceFirst));
  assert.equal(afterFence.outcome === 'identified' ? afterFence.family : null, 'architecture');

  // The positive control: a real first heading still answers.
  const real = identify(file('_bmad-output/loose/d.md', PRD_HEADING));
  assert.equal(real.outcome === 'identified' ? real.family : null, 'prd');
});

// ---------------------------------------------------------------------------
// Run-folder edges
// ---------------------------------------------------------------------------

test('an impossible date is not a date', () => {
  assert.deepEqual(runFolderFamilies('prd-x-2026-99-99'), [], 'month 99 is not a month');
  assert.deepEqual(runFolderFamilies('prd-x-2026-00-10'), [], 'month 00 is not a month');
  assert.deepEqual(runFolderFamilies('prd-x-2026-08-32'), [], 'day 32 is not a day');
  assert.deepEqual(runFolderFamilies('prd-x-2026-08-00'), [], 'day 00 is not a day');
  assert.deepEqual(runFolderFamilies('prd-x-2026-08-28'), ['prd'], 'the control still matches');
  // A shape check, not a calendar one — stated rather than left to be found.
  assert.deepEqual(runFolderFamilies('prd-x-2026-02-31'), ['prd'], '31 February is well-formed');
});

test('an ordinary subdirectory where runs live is read as a run folder, position being the only signal', () => {
  // Deliberate, and the reason is FR-72: a forge run folder is a bare `{slug}`
  // with no name signal at all, so position has to suffice — which means
  // `specs/archive` and a `{slug}` run are indistinguishable to this tool. The
  // alternative is that no forge run is ever recognized.
  const verdict = identify(directory('_bmad-output/specs/archive'));
  assert.equal(verdict.outcome, 'identified');
  if (verdict.outcome !== 'identified') return;
  assert.equal(verdict.family, 'spec');
  assert.equal(verdict.shape, 'run-folder');
  assert.equal(verdict.resolvedAt, 'location');
});

test('an entry that is neither file nor directory claims no shape, and its name still answers', () => {
  // A FIFO named `prd.md`. Level 4 resolves from the name, below certain; no
  // shape is claimed, because nothing was read and nothing was listed.
  const verdict = identify(neither('_bmad-output/loose/prd.md'));
  assert.deepEqual(verdict, {
    outcome: 'identified',
    family: 'prd',
    shape: 'unknown',
    resolvedAt: 'filename',
    confidence: 'likely',
    attempted: [
      { level: 'location', result: 'no-signal' },
      { level: 'frontmatter', result: 'unavailable', reason: 'not a regular file (other)' },
      { level: 'structure', result: 'unavailable', reason: 'not a regular file (other)' },
      { level: 'filename', result: 'resolved' },
    ],
  });
});

// ---------------------------------------------------------------------------
// The attempt record is total
// ---------------------------------------------------------------------------

test('every verdict records one attempt per level it reached, and never zero', () => {
  const every: readonly Candidate[] = [
    file('_bmad-output/specs/spec-x/SPEC.md'),
    file('_bmad-output/loose/a.md', ['---', 'type: brief', '---'].join('\n')),
    file('_bmad-output/loose/b.md', PRD_HEADING),
    file('_bmad-output/loose/prd.md'),
    file('_bmad-output/loose/nothing.md', 'plain text'),
    directory('_bmad-output/loose/empty'),
    directory('_bmad-output/loose/run', ['prd.md']),
    unreadable('_bmad-output/loose/x.md', 'not valid UTF-8 text'),
    unexamined('_bmad-output/loose/gone.md', 'ENOENT: no such file or directory'),
    neither('_bmad-output/loose/fifo'),
  ];
  for (const candidate of every) {
    const verdict = identify(candidate);
    const levels = verdict.attempted.map((attempt) => attempt.level);
    // A prefix of FR-8's order, with no level named twice and none skipped.
    assert.deepEqual(levels, LEVELS.slice(0, levels.length), candidate.relative);
    assert.equal(new Set(levels).size, levels.length, candidate.relative);
    assert.ok(levels.length >= 1, candidate.relative);
    for (const attempt of verdict.attempted) {
      assert.equal(
        (attempt.result === 'unavailable') === (attempt.reason !== undefined),
        true,
        `${candidate.relative}: ${attempt.level} carries a reason only when it could not run`,
      );
    }
  }
});

test('a listing that was never taken leaves the sharded reading open, not refuted', () => {
  // The shape signals come from different places — position and name give the
  // run-folder reading, the listing gives the sharded one — so an unlisted
  // directory is ambiguous rather than certainly a run folder. Answering
  // `run-folder` at `certain` over a listing the walk never finished was the
  // bug an entry-budget truncation reached.
  const cut = identify({
    relative: '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01',
    kind: 'directory',
    content: () => ({ available: false, reason: 'not a regular file (directory)' }),
    children: { available: false, reason: 'entry budget of 6 reached' },
  });
  assert.equal(cut.outcome, 'ambiguous');
  if (cut.outcome !== 'ambiguous') return;
  assert.deepEqual(cut.readings, [
    { family: 'prd', shape: 'run-folder' },
    { family: 'prd', shape: 'sharded-document' },
  ]);

  // With no run-folder signal either, an unlisted directory claims nothing.
  const nowhere = identify({
    relative: '_bmad-output/loose/deep/inner',
    kind: 'directory',
    content: () => ({ available: false, reason: 'not a regular file (directory)' }),
    children: { available: false, reason: 'entry budget of 6 reached' },
  });
  assert.equal(nowhere.outcome, 'unidentified');
});
