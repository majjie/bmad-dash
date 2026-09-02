/**
 * FR-71 and FR-72, one named row per I/O-matrix line, **pinned from both
 * sides**.
 *
 * Three properties are asserted harder than the rows themselves, because they
 * are what a mutation would quietly change:
 *
 *   - **No run count.** The acceptance names it as a mutation to fail: the key
 *     set of every fact is asserted exactly, so an added `runs: 1` fails here,
 *     and `RunCount` has one value, so a claimed number fails the typecheck.
 *   - **Deliberate versus accidental**, on both sides. A row that only checked
 *     the four accidental families would pass while the three deliberate ones
 *     reported nothing at all, which is the 4-of-7 reading this story rejects.
 *   - **The dateless pair reports `absent`.** Asserted from both sides too:
 *     `spec` and `forge` absent, and the other five present, so a mutation that
 *     reports every family the same way fails whichever way it leans.
 *
 * Every fixture builds its verdict by calling `identify` rather than writing
 * one out — the convention `test/domain/document.test.ts` and
 * `test/domain/interpretation.test.ts` set, and for the same reason: a
 * hand-written verdict can express a combination the authority would never
 * produce, and a rule tested against one of those is tested against nothing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RESEARCH_TYPES,
  RUN_FOLDER_FAMILIES,
  RUN_FOLDER_PATTERNS,
  identify,
  type Candidate,
  type Family,
} from '../../src/domain/identity.ts';
import {
  RUN_COUNT,
  RUN_COUNT_BASIS,
  RUN_FACT_AXES,
  RUN_FACT_DEFINITIONS,
  RUN_PATTERNS,
  runFactsOf,
  runFolderFamiliesOf,
  type RunFacts,
} from '../../src/domain/runs.ts';

const PRD_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '_bmad-output',
  'planning-artifacts',
  'prds',
  'prd-bmad-2026-08-28',
  'prd.md',
);

/** A readable file with `text` as its contents. */
function file(relative: string, text = ''): Candidate {
  return {
    relative,
    kind: 'file',
    content: () => ({ available: true, text }),
    children: { available: false, reason: 'not a directory (file)' },
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

/** An entry the walk did not report as `present`, so its kind is unknown. */
function unexamined(relative: string, reason: string): Candidate {
  return {
    relative,
    kind: 'unknown',
    content: () => ({ available: false, reason }),
    children: { available: false, reason },
  };
}

/** The one fact a run folder reports, with the outcome narrowed to `measured`. */
function measured(candidate: Candidate): Extract<RunFacts, { readonly outcome: 'measured' }> {
  const facts = runFactsOf(identify(candidate));
  assert.equal(facts.length, 1, `${candidate.relative} reported ${String(facts.length)} facts`);
  const only = facts[0];
  assert.ok(only !== undefined && only.outcome === 'measured', `${candidate.relative} is unmeasured`);
  return only;
}

/** A directory at the family root where that family's runs live. */
function runFolder(root: string, name: string, names: readonly string[] = []): Candidate {
  return directory(`${root}/${name}`, names);
}

// ---------------------------------------------------------------------------
// The matrix rows
// ---------------------------------------------------------------------------

test('a dated run folder can collide within a day, and its reuse is accidental', () => {
  const facts = measured(
    runFolder('_bmad-output/planning-artifacts/prds', 'prd-bmad-2026-08-28', ['prd.md']),
  );
  assert.equal(facts.family, 'prd');
  assert.equal(facts.canCollide, true);
  assert.equal(facts.reuse, 'accidental');
  assert.equal(facts.dateSignal, 'present');
  assert.equal(facts.pattern, 'prd-{project_name}-{date}');

  // The other three of FR-71's four, from where each family's runs live.
  const rows: readonly (readonly [string, string, Family])[] = [
    ['_bmad-output/planning-artifacts/briefs', 'brief-bmad-2026-08-28', 'brief'],
    [
      '_bmad-output/planning-artifacts/architecture',
      'architecture-bmad-2026-08-28',
      'architecture',
    ],
    ['_bmad-output/planning-artifacts/ux-designs', 'ux-bmad-2026-08-28', 'ux-design'],
  ];
  for (const [root, name, family] of rows) {
    const row = measured(runFolder(root, name));
    assert.equal(row.family, family, name);
    assert.equal(row.reuse, 'accidental', name);
    assert.equal(row.dateSignal, 'present', name);
  }
});

test('the three families BMAD offers to resume report their reuse as deliberate', () => {
  // The half FR-71's literal wording leaves out, and the reason the collision
  // surface is seven of seven: a spec folder is reopened by slug, a forge
  // folder by bare slug, a research folder by topic — all three by design.
  const spec = measured(runFolder('_bmad-output/specs', 'spec-bmad-dash', ['SPEC.md']));
  assert.equal(spec.family, 'spec');
  assert.equal(spec.reuse, 'deliberate');
  assert.equal(spec.canCollide, true);

  const forge = measured(runFolder('_bmad-output/forge', 'read-only-dashboard'));
  assert.equal(forge.family, 'forge');
  assert.equal(forge.reuse, 'deliberate');
  assert.equal(forge.canCollide, true);

  const research = measured(
    runFolder('_bmad-output/planning-artifacts/research', 'market-pricing-2026-08-28'),
  );
  assert.equal(research.family, 'research');
  assert.equal(research.reuse, 'deliberate', 'a research run is reopened by topic');
  assert.equal(research.canCollide, true);
});

test('the collision surface is seven of seven, split by whether the reuse is deliberate', () => {
  // Both sides of the split, over the whole table, so neither a "flag all
  // seven alike" nor a "flag only FR-71's four" mutation survives.
  for (const family of RUN_FOLDER_FAMILIES) {
    assert.equal(RUN_PATTERNS[family].canCollide, true, family);
    assert.ok(RUN_PATTERNS[family].basis.length > 0, `${family} has no recorded basis`);
    assert.ok(RUN_PATTERNS[family].pattern.length > 0, `${family} has no recorded pattern`);
  }
  const byReuse = (reuse: string): readonly Family[] =>
    RUN_FOLDER_FAMILIES.filter((family) => RUN_PATTERNS[family].reuse === reuse);
  assert.deepEqual(
    [...byReuse('accidental')],
    ['brief', 'prd', 'architecture', 'ux-design'],
    "the four FR-71 names, whose same-day rerun is an accident of the naming",
  );
  assert.deepEqual(
    [...byReuse('deliberate')],
    ['research', 'spec', 'forge'],
    'the three BMAD offers to resume',
  );
  assert.equal(
    RUN_FOLDER_FAMILIES.length,
    7,
    'seven patterns; a family added without a measured fact fails the typecheck in runs.ts',
  );
});

test('the two dateless families report the date signal absent, and the five dated report present', () => {
  const absent = RUN_FOLDER_FAMILIES.filter(
    (family) => RUN_PATTERNS[family].dateSignal === 'absent',
  );
  assert.deepEqual([...absent], ['spec', 'forge'], "FR-72's two patterns, and only those two");
  const present = RUN_FOLDER_FAMILIES.filter(
    (family) => RUN_PATTERNS[family].dateSignal === 'present',
  );
  assert.deepEqual([...present], ['brief', 'prd', 'architecture', 'ux-design', 'research']);

  // And through a real verdict, because the table being right is not the same
  // as the derivation reading it: Epic 3's tier 5 must read absent here, not
  // an empty date that sorts first.
  assert.equal(
    measured(runFolder('_bmad-output/specs', 'spec-bmad-dash', ['SPEC.md'])).dateSignal,
    'absent',
  );
  assert.equal(
    measured(runFolder('_bmad-output/forge', 'read-only-dashboard')).dateSignal,
    'absent',
  );
  assert.equal(
    measured(runFolder('_bmad-output/planning-artifacts/prds', 'prd-bmad-2026-08-28')).dateSignal,
    'present',
  );
});

// ---------------------------------------------------------------------------
// What is not a run folder, and what is not measured
// ---------------------------------------------------------------------------

test('nothing that is not a run folder reports run facts', () => {
  // Empty rather than a row of falsehoods: a thing that is not a run folder
  // has no run-folder facts, and a zeroed row invites a surface to render one.
  const rows: readonly (readonly [string, Candidate])[] = [
    ['a document', file('_bmad-output/planning-artifacts/prds/prd-x-2026-08-28/prd.md')],
    ['a family container', directory('_bmad-output/planning-artifacts/prds', ['prd-x-2026-08-28'])],
    [
      'a subfolder inside a run',
      directory('_bmad-output/planning-artifacts/ux-designs/ux-x-2026-08-28/mockups', ['a.html']),
    ],
    ['an unidentified entry', file('_bmad-output/unremarkable.txt', 'nothing familiar\n')],
    [
      'an entry the walk never reached',
      unexamined('_bmad-output/planning-artifacts/prds/prd-x-2026-08-28', 'permission denied'),
    ],
    [
      'a sharded document with no run-folder signal',
      directory('_bmad-output/loose/handover/prd', ['index.md', 'part-1.md']),
    ],
  ];
  for (const [label, candidate] of rows) {
    assert.deepEqual(runFactsOf(identify(candidate)), [], label);
    assert.deepEqual(runFolderFamiliesOf(identify(candidate)), [], label);
  }
});

test('an ambiguous run-folder-or-sharded verdict still reports the run-folder reading', () => {
  // FR-73's case: the ambiguity is about the shape, and the run-folder half is
  // still a run folder — so withholding the facts would lose FR-71's
  // disclosure for exactly the folders least well understood.
  const verdict = identify(
    directory('_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01', [
      'index.md',
      'requirements.md',
    ]),
  );
  assert.equal(verdict.outcome, 'ambiguous');
  const facts = runFactsOf(verdict);
  assert.equal(facts.length, 1, 'one fact per family, not one per reading');
  assert.equal(facts[0]?.family, 'prd');
  assert.equal(facts[0]?.outcome, 'measured');
});

test('an ambiguity whose axes crossed reports nothing, because no signal said run folder', () => {
  const verdict = identify(
    directory('_bmad-output/loose/prd-x-2026-08-28', ['index.md', 'prd.md', 'epics.md']),
  );
  assert.equal(verdict.outcome, 'ambiguous');
  assert.deepEqual(runFactsOf(verdict), [], 'the readings carry unknown shapes, so nothing is claimed');
});

test('a run-folder shape whose family has no measured pattern is unmeasured, not defaulted', () => {
  // Reachable, and this is how: the folder *name* matches a run-folder pattern,
  // so the shape is `run-folder`, while an earlier level resolves the family
  // from what the folder holds. `epics` has no run-folder pattern, because BMAD
  // writes no epics runs — and reporting `canCollide: false` for it would be a
  // measurement nobody took.
  const verdict = identify(directory('_bmad-output/loose/prd-bmad-2026-08-28', ['epics.md']));
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'epics');
  assert.equal(verdict.outcome === 'identified' ? verdict.shape : null, 'run-folder');

  const facts = runFactsOf(verdict);
  assert.equal(facts.length, 1);
  const only = facts[0];
  assert.ok(only !== undefined);
  assert.equal(only.outcome, 'unmeasured');
  if (only.outcome !== 'unmeasured') return;
  assert.equal(only.family, 'epics');
  assert.match(only.reason, /no run-folder pattern was measured/);
  assert.equal(only.runCount, RUN_COUNT, 'the count is unknowable here too');
});

test('a review directory where runs live is unmeasured, which is the path this story created', () => {
  // Review round finding: `review` with shape `run-folder` became reachable
  // when the prefix rule landed, and `RUN_PATTERNS`' own comment claimed it
  // could not happen. The family comes from the prefix, the shape from
  // position — `sitsWhereRunsLive` calls any directory where runs live a run
  // folder, deliberately, since that is the only signal a forge run has.
  const verdict = identify(directory('_bmad-output/planning-artifacts/prds/review-round-1'));
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'review');
  assert.equal(verdict.outcome === 'identified' ? verdict.shape : null, 'run-folder');

  const facts = runFactsOf(verdict);
  assert.equal(facts.length, 1);
  const only = facts[0];
  assert.ok(only !== undefined);
  assert.equal(only.outcome, 'unmeasured', 'no review run-folder pattern was ever measured');
  if (only.outcome !== 'unmeasured') return;
  assert.equal(only.family, 'review');
  assert.equal(only.runCount, RUN_COUNT);
  assert.deepEqual(Object.keys(only).sort(), ['family', 'outcome', 'reason', 'runCount']);
});

test('two families reading as run folders produce two facts, one each', () => {
  // Review round finding: the field is plural and plurality was never
  // produced, so every row asserted `length === 1` — including the one whose
  // comment said "one fact per family, not one per reading". It is producible:
  // a structural read that names two families, with one run-folder shape from
  // the name, gives two readings that differ by family.
  const verdict = identify(
    directory('_bmad-output/loose/prd-bmad-2026-08-28', ['prd.md', 'SPEC.md']),
  );
  assert.equal(verdict.outcome, 'ambiguous');
  if (verdict.outcome !== 'ambiguous') return;
  assert.deepEqual(
    verdict.readings.map((reading) => `${reading.family}:${reading.shape}`),
    ['prd:run-folder', 'spec:run-folder'],
  );

  const facts = runFactsOf(verdict);
  assert.deepEqual(
    facts.map((fact) => fact.family),
    ['prd', 'spec'],
    'one fact per family, and the ambiguity is not resolved by picking one',
  );
  assert.deepEqual(
    facts.map((fact) => (fact.outcome === 'measured' ? `${fact.reuse}/${fact.dateSignal}` : 'x')),
    ['accidental/present', 'deliberate/absent'],
    'and the two facts differ, so a mutation returning the first twice fails',
  );
});

test('the date signal and the authority own dated flag are one fact, not two that can drift', () => {
  // Review round finding: `dated` in `identity.ts` and `dateSignal` here were
  // two encodings of one measured fact in two modules with no cross-check —
  // flipping `spec-` to `dated: true` left every test passing. For a story
  // whose principle is that a measured fact is stated once, that is the exact
  // failure to close.
  for (const family of RUN_FOLDER_FAMILIES) {
    const rows = RUN_FOLDER_PATTERNS.filter((pattern) => pattern.family === family);
    if (family === 'forge') {
      // The stated exception: a bare `{slug}` has no pattern row at all, so
      // there is no `dated` flag to agree with. Its date signal is absent for
      // a stronger reason than a flag — there is no name pattern to carry one.
      assert.deepEqual(rows, [], 'forge has no run-folder pattern row');
      assert.equal(RUN_PATTERNS[family].dateSignal, 'absent');
      continue;
    }
    assert.ok(rows.length > 0, `${family} has no pattern row`);
    const dated = rows.every((pattern) => pattern.dated);
    assert.equal(
      rows.some((pattern) => pattern.dated),
      dated,
      `${family}'s pattern rows disagree with each other about the date`,
    );
    assert.equal(
      RUN_PATTERNS[family].dateSignal,
      dated ? 'present' : 'absent',
      `${family}: the authority says dated=${String(dated)} and the fact says ${RUN_PATTERNS[family].dateSignal}`,
    );
  }
});

test('each recorded pattern string begins with the prefix the authority matches on', () => {
  // The third copy of one fact, cross-checked rather than trusted: the whole
  // shape is what a reader needs and a bare prefix is not, so the string stays
  // — pinned against the table that decides.
  for (const family of RUN_FOLDER_FAMILIES) {
    const { pattern } = RUN_PATTERNS[family];
    if (family === 'forge') {
      assert.equal(pattern, '{slug}', 'no prefix at all, which is why no pattern row exists');
      continue;
    }
    if (family === 'research') {
      // Six prefixes, one per shipped type, and the recorded shape names the
      // type rather than spelling one of them.
      assert.equal(pattern, '{research_type}-{topic}-{date}');
      assert.equal(
        RESEARCH_TYPES.every((type) =>
          RUN_FOLDER_PATTERNS.some((row) => row.prefix === `${type}-` && row.family === 'research'),
        ),
        true,
      );
      continue;
    }
    const prefixes = RUN_FOLDER_PATTERNS.filter((row) => row.family === family).map(
      (row) => row.prefix,
    );
    assert.equal(prefixes.length, 1, family);
    const prefix = prefixes[0] ?? '';
    // The **literal head** — everything before the first placeholder — must be
    // the prefix exactly, not merely start with it. `startsWith` was the first
    // version and a mutation walked through it: `ux-design-{project_name}-{date}`
    // still starts with `ux-`, so a pattern naming a prefix BMAD does not match
    // on passed.
    assert.equal(
      pattern.slice(0, pattern.indexOf('{')),
      prefix,
      `${family}: recorded pattern ${pattern} does not lead with the matched prefix ${prefix}`,
    );
  }
});

// ---------------------------------------------------------------------------
// The thing that is deliberately not reported
// ---------------------------------------------------------------------------

test('no fact claims a run count, and the reason it cannot is recorded', () => {
  // The mutation this story's acceptance names. Two guards, because either one
  // alone is escapable: the key set is asserted exactly, so an added `runs: 2`
  // fails; and `RunCount` has one value, so a number fails the typecheck. The
  // signal to tell one run from two does not exist in a run folder, and
  // approximating it from mtimes is on the Never list.
  const facts = measured(
    runFolder('_bmad-output/planning-artifacts/prds', 'prd-bmad-2026-08-28', ['prd.md']),
  );
  assert.deepEqual(Object.keys(facts).sort(), [
    'basis',
    'canCollide',
    'dateSignal',
    'family',
    'outcome',
    'pattern',
    'reuse',
    'runCount',
  ]);
  assert.equal(facts.runCount, 'unknowable');
  assert.equal(RUN_COUNT, 'unknowable');

  // And the basis is enumerated rather than asserted: each item is a per-run
  // signal a run folder could have carried and does not.
  assert.equal(RUN_COUNT_BASIS.length, 4);
  for (const reason of RUN_COUNT_BASIS) assert.ok(reason.length > 0);
  assert.match(RUN_COUNT_BASIS.join(' | '), /memlog/);
  assert.match(RUN_COUNT_BASIS.join(' | '), /mtime/);
});

// ---------------------------------------------------------------------------
// The definitions, read out of the PRD rather than restated
// ---------------------------------------------------------------------------

test("the recorded definitions are the requirements' own sentences, read out of prd.md", async () => {
  // The mechanism `interpretation.ts` and the level labels already use: a
  // definition restated from memory is a second copy of one belief, and this is
  // a story whose whole subject is facts measured in one place and stated
  // nowhere else.
  const prd = await readFile(PRD_PATH, 'utf8');
  // Continuation lines are joined, so a requirement that merely **wraps**
  // still matches. The single-line version reported "prd.md must still state
  // FR-71 as a bullet" for a bullet that was stated and wrapped, which is the
  // opposite of the diagnostic this exists to give.
  const stated = (id: string): string | undefined => {
    const lines = prd.split('\n');
    const head = new RegExp(`^- \\*\\*${id}\\*\\*\\s+(.*)$`);
    for (let index = 0; index < lines.length; index += 1) {
      const opened = head.exec(lines[index] ?? '');
      if (opened === null) continue;
      const parts = [opened[1] ?? ''];
      for (let next = index + 1; next < lines.length; next += 1) {
        const line = lines[next] ?? '';
        if (line.trim() === '' || /^\s*[-*#]/.test(line)) break;
        parts.push(line.trim());
      }
      return parts.join(' ').trim();
    }
    return undefined;
  };

  const fr71 = stated('FR-71');
  const fr72 = stated('FR-72');
  assert.ok(fr71 !== undefined, 'prd.md must still state FR-71 as a bullet');
  assert.ok(fr72 !== undefined, 'prd.md must still state FR-72 as a bullet');
  assert.deepEqual([...RUN_FACT_AXES], ['collision', 'date-signal']);
  assert.equal(RUN_FACT_DEFINITIONS.collision.definition, fr71);
  assert.equal(RUN_FACT_DEFINITIONS['date-signal'].definition, fr72);
  assert.equal(RUN_FACT_DEFINITIONS.collision.requirement, 'FR-71');
  assert.equal(RUN_FACT_DEFINITIONS['date-signal'].requirement, 'FR-72');
  assert.deepEqual(Object.keys(RUN_FACT_DEFINITIONS).sort(), [...RUN_FACT_AXES].sort());

  // FR-71's own wording says four of seven, and the table says seven — the
  // widening this story took deliberately and recorded in `deferred-work.md`.
  // Asserted so the difference is visible here rather than looking like a
  // transcription error in the table.
  assert.match(fr71, /Four of seven/);
  assert.equal(
    RUN_FOLDER_FAMILIES.every((family) => RUN_PATTERNS[family].canCollide),
    true,
    "the recorded fact is wider than FR-71's literal wording, on purpose",
  );
});
