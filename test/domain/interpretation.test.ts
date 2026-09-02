/**
 * FR-12 and FR-69, asserted **distinct** — the collision Story 1.9 settles.
 *
 * `EXPERIENCE.md:170` merges the two terms into one sentence and its string
 * index carries one row for the pair; `epics.md` treats them as two. The
 * decision taken here is two states, and these rows are what makes it
 * enforceable rather than a paragraph:
 *
 *   - a verdict that identified a family and carries no interpretable shape is
 *     FR-12 and **is not** FR-69 — the row a collapse would break, because
 *     collapsing reports "not identified" over an artifact the authority
 *     identified at `certain`;
 *   - a verdict no level resolved is FR-69 and **is not** FR-12;
 *   - the recorded definitions are the requirements' own sentences, read out of
 *     `prd.md` rather than restated here.
 *
 * Every fixture builds its verdict by calling `identify` rather than writing
 * one out, which is the convention `test/domain/document.test.ts` set for the
 * same reason: a hand-written verdict can express a combination the authority
 * would never produce, and a rule tested against one of those is tested against
 * nothing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { identify, type Candidate, type Verdict } from '../../src/domain/identity.ts';
import {
  INTERPRETATION_DEFINITIONS,
  INTERPRETATION_STATES,
  definitionOf,
  interpret,
  requirementOf,
  type InterpretationState,
} from '../../src/domain/interpretation.ts';
import { compose } from '../../src/domain/document.ts';

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

/** A file that is there and whose text could not be read. */
function unreadable(relative: string, reason: string): Candidate {
  return {
    relative,
    kind: 'file',
    content: () => ({ available: false, reason }),
    children: { available: false, reason },
  };
}

/** The shape a verdict recorded, as one string per reading, for a message. */
function shapes(verdict: Verdict): readonly string[] {
  if (verdict.outcome === 'identified') return [verdict.shape];
  if (verdict.outcome === 'ambiguous') return verdict.readings.map((reading) => reading.shape);
  return [];
}

// ---------------------------------------------------------------------------
// The two states, kept apart
// ---------------------------------------------------------------------------

test('a recognized family with no interpretable shape is FR-12, not FR-69', () => {
  // The matrix row: an index-less markdown directory that is not claimed a
  // document. Level 4 resolves the family from the folder name, and the shape
  // stays `unknown` because the directory carries neither a run-folder nor a
  // sharded-document signal — recognized, and nothing can interpret it.
  const verdict = identify(directory('_bmad-output/loose/research', ['a.md', 'b.md']));
  assert.equal(verdict.outcome, 'identified');
  if (verdict.outcome !== 'identified') return;
  assert.equal(verdict.family, 'research');
  assert.equal(verdict.shape, 'unknown', `the fixture must carry no shape: ${shapes(verdict).join(', ')}`);

  assert.equal(interpret(verdict), 'present-but-uninterpreted');
  assert.notEqual(
    interpret(verdict),
    'unidentified',
    'FR-12 must never be reported as FR-69: the authority identified this artifact',
  );
  assert.equal(requirementOf(interpret(verdict)), 'FR-12');
});

test('a verdict no level resolved is FR-69, not FR-12', () => {
  const verdict = identify(file('_bmad-output/unremarkable.txt', 'nothing familiar\n'));
  assert.equal(verdict.outcome, 'unidentified');
  assert.equal(interpret(verdict), 'unidentified');
  assert.notEqual(
    interpret(verdict),
    'present-but-uninterpreted',
    'FR-69 must never be reported as FR-12: no family was recognized at all',
  );
  assert.equal(requirementOf(interpret(verdict)), 'FR-69');
  // FR-69's other half is the verdict's own and is unchanged by this module:
  // the levels attempted are on the record, in FR-8 order.
  assert.deepEqual(
    verdict.attempted.map((attempt) => attempt.level),
    ['location', 'frontmatter', 'structure', 'filename'],
  );
});

test('the two states are two, with different terms, requirements and definitions', () => {
  // The collapse this settles would show up as any of these three being equal.
  assert.notEqual('present-but-uninterpreted', 'unidentified');
  assert.notEqual(requirementOf('present-but-uninterpreted'), requirementOf('unidentified'));
  assert.notEqual(definitionOf('present-but-uninterpreted'), definitionOf('unidentified'));
  assert.deepEqual(
    INTERPRETATION_STATES.map(requirementOf),
    ['none', 'FR-12', 'FR-69'],
    'each state is owned by exactly one requirement, in reporting order',
  );
});

test("the recorded definitions are the requirements' own sentences, read out of prd.md", async () => {
  // The mechanism the level labels and the signal labels already use: a
  // definition restated from memory is a second copy of one belief. Both
  // requirements are quoted whole, so a reworded FR fails here instead of
  // leaving two vocabularies standing — which is the state this story
  // inherited.
  const prd = await readFile(PRD_PATH, 'utf8');
  const stated = (id: string): string | undefined => {
    const pattern = new RegExp(`^- \\*\\*${id}\\*\\*\\s+(.+)$`, 'm');
    return pattern.exec(prd)?.[1];
  };

  const fr12 = stated('FR-12');
  const fr69 = stated('FR-69');
  assert.ok(fr12 !== undefined, 'prd.md must still state FR-12 as a bullet');
  assert.ok(fr69 !== undefined, 'prd.md must still state FR-69 as a bullet');
  assert.equal(definitionOf('present-but-uninterpreted'), fr12);
  assert.equal(definitionOf('unidentified'), fr69);
  // And each definition actually contains the term it defines, so a pair of
  // correct-looking sentences swapped between the two states fails.
  assert.match(definitionOf('present-but-uninterpreted'), /present-but-uninterpreted/);
  assert.match(definitionOf('unidentified'), /unidentified/);
});

// ---------------------------------------------------------------------------
// The ordinary case, and the axis this module does not consult
// ---------------------------------------------------------------------------

test('a shape a view can interpret is neither of the two reported states', () => {
  const document = identify(file('_bmad-output/specs/spec-x/SPEC.md', '# The spec\n'));
  assert.equal(interpret(document), 'interpreted');

  const container = identify(directory('_bmad-output/planning-artifacts/prds', ['prd-x-2026-08-28']));
  assert.equal(container.outcome === 'identified' ? container.shape : null, 'container');
  assert.equal(interpret(container), 'interpreted', "a family's own directory is a shape, not a gap");
});

test('an ambiguous verdict is interpreted while either reading carries a shape', () => {
  // FR-73's case: a run folder that also holds an `index.md`. Two readings
  // stand, both interpretable, and the tool does not rank them — so there is
  // nothing for FR-12 to report.
  const verdict = identify(
    directory('_bmad-output/planning-artifacts/prds/prd-x-2026-08-28', ['index.md', 'notes.md']),
  );
  assert.equal(verdict.outcome, 'ambiguous');
  assert.deepEqual([...shapes(verdict)], ['run-folder', 'sharded-document']);
  assert.equal(interpret(verdict), 'interpreted');
});

test('an ambiguity whose axes crossed carries no shape, so it is FR-12', () => {
  // Both axes ambiguous at once: two families from the structural read and two
  // shapes from position and listing. The authority refuses to invent the
  // pairing and records `unknown` for every reading — so nothing can interpret
  // it, and this must agree with what composition does with the same verdict
  // rather than being a second opinion about it.
  const verdict = identify(
    directory('_bmad-output/loose/prd-x-2026-08-28', ['index.md', 'prd.md', 'epics.md']),
  );
  assert.equal(verdict.outcome, 'ambiguous');
  assert.deepEqual([...new Set(shapes(verdict))], ['unknown']);
  assert.equal(interpret(verdict), 'present-but-uninterpreted');

  const composition = compose({
    relative: '_bmad-output/loose/prd-x-2026-08-28',
    identity: verdict,
    children: { available: true, names: ['index.md', 'prd.md', 'epics.md'], omissions: [], aliases: [] },
  });
  assert.deepEqual(
    composition.readings.map((reading) => reading.reading),
    ['not-a-document'],
    'the interpretation must agree with the composition of the same verdict',
  );
});

test('readability is a separate axis and does not change the interpretation', () => {
  // An artifact whose bytes could not be read, whose family the location
  // resolves anyway. Folding the two axes would report an unreadable file as
  // uninterpreted, which is the word this story just separated from
  // "unreadable" — and the readability signal is where that fact belongs.
  const verdict = identify(
    unreadable('_bmad-output/planning-artifacts/prds/prd.md', 'not valid UTF-8 text'),
  );
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'prd');
  assert.equal(interpret(verdict), 'interpreted');
});

// ---------------------------------------------------------------------------
// The table itself
// ---------------------------------------------------------------------------

test('every state has exactly one recorded definition, and no state is unreachable', () => {
  const states: readonly InterpretationState[] = [
    'interpreted',
    'present-but-uninterpreted',
    'unidentified',
  ];
  assert.deepEqual([...INTERPRETATION_STATES], states, 'the states, in reporting order');
  // Total by the typechecker rather than by a lookup with a fallback: the
  // table is a `Record` over the union, so a fourth state fails to compile
  // instead of returning an empty definition as a success (AD-13, which the
  // spec's Never list names). This checks the other half — that no *recorded*
  // definition is empty, which a `Record` cannot enforce.
  assert.deepEqual(Object.keys(INTERPRETATION_DEFINITIONS).sort(), [...states].sort());
  for (const state of states) {
    assert.ok(definitionOf(state).length > 0, `${state} has no recorded definition`);
    assert.notEqual(requirementOf(state), undefined, `${state} has no recorded requirement`);
  }

  // Reachability, from the other side: each of the three is produced by some
  // verdict the authority can actually record. A state nothing reaches is a
  // state a surface will never render, and a rule with a dead branch is how
  // two vocabularies survive in one codebase.
  const reached = new Set(
    [
      identify(file('_bmad-output/specs/spec-x/SPEC.md', '# The spec\n')),
      identify(directory('_bmad-output/loose/research', ['a.md'])),
      identify(file('_bmad-output/unremarkable.txt')),
    ].map(interpret),
  );
  assert.deepEqual([...reached].sort(), [...states].sort());
});
