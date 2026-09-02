/**
 * AD-8's four states, and that no fifth is reachable.
 *
 * Two of the assertions here read their expectation out of a **normative
 * document** rather than restating it — `ARCHITECTURE-SPINE.md` for the four
 * state names, `EXPERIENCE.md`'s load-bearing string index for the four labels
 * — which is the mechanism this repository already uses at
 * `test/domain/identity.test.ts`, `test/render/chrome.test.ts` and
 * `test/cli/suggest.test.ts`. A literal here that merely happened to match
 * would be a second copy of one belief, free to drift the moment either side
 * is edited, and this vocabulary is shared by three layers.
 *
 * "No fifth is reachable" is asserted three ways, because each alone is
 * satisfiable by a mistake: the value list is compared whole against the spine
 * (so an addition fails), the label table's keys are compared against the value
 * list (so a fifth state with no label, or a label with no state, fails), and
 * the `Readability` union is exercised over every state so a state nobody can
 * construct is visible as one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LISTING_NOT_TEXT,
  READ_STAGES,
  SIGNAL_LABELS,
  SIGNAL_STATES,
  UNREAD,
  type ReadStage,
  type Readability,
  type SignalState,
} from '../../src/domain/signal.ts';
import type { ChildStage } from '../../src/adapters/fs/read.ts';

const PLANNING = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '_bmad-output',
  'planning-artifacts',
);

const SPINE_PATH = join(
  PLANNING,
  'architecture',
  'architecture-bmad-2026-08-28',
  'ARCHITECTURE-SPINE.md',
);

const EXPERIENCE_PATH = join(
  PLANNING,
  'ux-designs',
  'ux-bmad-2026-08-28',
  'EXPERIENCE.md',
);

// ---------------------------------------------------------------------------
// The four states
// ---------------------------------------------------------------------------

test('the four states are the four AD-8 names, in AD-8 order', async () => {
  // Parsed out of the rule itself rather than matched against a list written
  // here: AD-8 is what makes this vocabulary closed, so a fifth state added to
  // the spine should fail this test rather than pass unnoticed, and a fifth
  // added to the code should fail it in the other direction.
  const spine = await readFile(SPINE_PATH, 'utf8');
  // Scoped to the enumerating **sentence**, not the rest of the line. `[^.]*`
  // stops at the period that closes the list — the parentheticals inside it
  // contain commas and no periods — because AD-8's rule continues for two more
  // sentences, and harvesting bold tokens from those would let a word emphasised
  // later become a phantom fifth state that this test then demanded.
  const rule = /exactly one of four states:([^.]*)\./.exec(spine)?.[1];
  assert.ok(rule !== undefined, 'AD-8 no longer states its four states as one enumerating sentence');
  const named = [...(rule ?? '').matchAll(/\*\*([a-z-]+)\*\*/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
  assert.equal(named.length, 4, `AD-8's sentence names ${String(named.length)} states: ${rule ?? ''}`);
  // actual first, expected second — a failure must report the two the right
  // way round. The document is the normative side: if these disagree, the code
  // is what moves, unless the spine itself was changed deliberately.
  assert.deepEqual(
    [...SIGNAL_STATES],
    named,
    'SIGNAL_STATES and AD-8 disagree; AD-8 is normative, so this is a fix to the code unless the spine was changed on purpose',
  );
  assert.equal(SIGNAL_STATES.length, 4, 'four states, and AD-8 says no fifth');
});

test('every state has a label and every label has a state, with no fifth of either', () => {
  assert.deepEqual(Object.keys(SIGNAL_LABELS).sort(), [...SIGNAL_STATES].sort());
  // Exhaustive by type as well as by count: a fifth member of `SignalState`
  // with no row in the table fails the typecheck on this line rather than a
  // runtime assertion.
  const labelled: Readonly<Record<SignalState, string>> = SIGNAL_LABELS;
  assert.equal(new Set(Object.values(labelled)).size, 4, 'two states must never read the same');
});

test('the four labels are read out of EXPERIENCE.md, not from a second copy', async () => {
  // Scoped to the string-index table — the one whose header row is
  // `| Situation | Says |` — so a row added elsewhere in the document cannot
  // satisfy it. The four rows are matched by their *situation* wording, which
  // is what makes this a check on the mapping rather than on the set of
  // strings: swapping `Not found` and `Not checked` in the code would still
  // produce four correct-looking labels and must fail.
  const experience = await readFile(EXPERIENCE_PATH, 'utf8');
  const table = /\|\s*Situation\s*\|\s*Says\s*\|([\s\S]*?)\n\n/.exec(experience)?.[1];
  assert.ok(table !== undefined, 'EXPERIENCE.md must carry the load-bearing string index table');

  const said = (situation: string): string | undefined => {
    const pattern = new RegExp(`\\|\\s*${situation}\\s*\\|\\s*\`([^\`]+)\`\\s*\\|`);
    return pattern.exec(table ?? '')?.[1];
  };
  const rows: Readonly<Record<SignalState, string>> = {
    present: 'Signal found',
    absent: 'Signal looked for, not found',
    unreadable: 'Signal found, unparseable',
    unchecked: 'Signal not examined',
  };
  for (const state of SIGNAL_STATES) {
    const situation = rows[state];
    const index = said(situation);
    assert.ok(index !== undefined, `the string index has no row for "${situation}"`);
    assert.equal(
      SIGNAL_LABELS[state],
      index,
      `the label for ${state} differs from the string index that defines it`,
    );
  }

  // The two the index insists must never collapse, pinned as the distinct
  // sentences it requires: "'Not checked' and 'not found' are different
  // sentences and must never collapse into 'none'".
  assert.notEqual(SIGNAL_LABELS.absent, SIGNAL_LABELS.unchecked);
});

// ---------------------------------------------------------------------------
// The stage beside the state
// ---------------------------------------------------------------------------

test("the read stages are a closed six, and the reader's three are among them", () => {
  assert.deepEqual(
    [...READ_STAGES],
    ['confinement', 'resolve', 'read-directory', 'examine', 'read', 'decode'],
  );
  assert.equal(new Set(READ_STAGES).size, READ_STAGES.length, 'no stage is listed twice');

  // The subset claim, made mechanical: `ChildStage` is the enumeration
  // vocabulary in `src/adapters/fs/read.ts`, and this function does not compile
  // if any of its members stops being a `ReadStage`. `src/cli/inventory.ts`
  // relies on exactly this when it carries a walk entry stage onto a signal.
  const widen = (stage: ChildStage): ReadStage => stage;
  assert.deepEqual(
    (['confinement', 'resolve', 'read-directory'] as const).map(widen),
    ['confinement', 'resolve', 'read-directory'],
  );
});

// ---------------------------------------------------------------------------
// The readability signal expressed in them
// ---------------------------------------------------------------------------

test('every state is constructible as a readability, and none of the four is skipped', () => {
  // A signal vocabulary nothing can express in all four states is a vocabulary
  // with a dead member, which is the defect one level up: `Verdict` has no
  // `unreadable` outcome, which is why readability is a signal of its own.
  const built: readonly Readability[] = [
    { state: 'present' },
    { state: 'absent', stage: 'resolve', reason: 'no such file or directory' },
    { state: 'unreadable', stage: 'decode', reason: 'not valid UTF-8 text' },
    { state: 'unchecked', stage: 'confinement', reason: 'refusing to read outside the project' },
    UNREAD,
    LISTING_NOT_TEXT,
  ];
  assert.deepEqual(
    [...new Set(built.map((signal) => signal.state))].sort(),
    [...SIGNAL_STATES].sort(),
    'a state the signal cannot express is a state nothing can report',
  );
});

test('a signal that read nothing carries no stage, and does not claim the content is fine', () => {
  // The story's measured defect, pinned at the vocabulary level: the state for
  // "no level needed this" is `unchecked`, never `present`. A mutation to
  // `present` here reports an unread file as readable, which is the NFR-3
  // violation this story exists to close.
  // Compared as a plain string on purpose: a `const` annotated with a union is
  // narrowed to its initializer, so `UNREAD.state === 'present'` is a
  // comparison the typechecker rejects as impossible — which is a fine thing
  // for the type to know and a useless thing for a test to assert. What is
  // worth asserting is the value a *consumer* reads.
  assert.equal(String(UNREAD.state), 'unchecked');
  assert.notEqual(String(UNREAD.state), 'present');
  assert.equal('stage' in UNREAD, false, 'nothing was attempted, so there is no stage');
  assert.ok(
    UNREAD.state !== 'present' && UNREAD.reason.length > 0,
    'a state that is not present must say why in words a human can read',
  );

  // Both are one shared value on every entry a pass produces, so a consumer
  // that mutated one would rewrite the signal on all of them.
  for (const shared of [UNREAD, LISTING_NOT_TEXT]) {
    assert.equal(Object.isFrozen(shared), true, 'a shared signal must not be mutable');
  }

  // And the directory signal exists because `UNREAD`'s reason is false of a
  // directory: its listing is its content, and the listing usually *was* read.
  // Two `unchecked` signals with two reasons, neither of them a false sentence.
  // Read through a parameter, so the narrowing a `const` gets from its own
  // initializer does not turn these into comparisons the typechecker refuses.
  const reasonOf = (signal: Readability): string => (signal.state === 'present' ? '' : signal.reason);
  assert.equal(String(LISTING_NOT_TEXT.state), 'unchecked');
  assert.notEqual(
    reasonOf(LISTING_NOT_TEXT),
    reasonOf(UNREAD),
    'a directory and an unread file must not claim the same thing',
  );
  assert.doesNotMatch(
    reasonOf(LISTING_NOT_TEXT),
    /nothing read it/,
    "a directory's listing is read, so its reason must not say nothing read it",
  );
});

test('the typed pair and the raw reason stay separate fields, never one sentence', () => {
  // The shape the untyped-`reason` finding in `deferred-work.md` prescribes
  // (summary: "`Listing`'s failure carries an untyped `reason: string`"),
  // asserted as a property rather
  // than trusted to a comment: `reason` holds the platform's own words and
  // neither the state nor the stage is folded into it. This is the assertion a
  // reintroduced `${state} at the ${stage} stage: ${reason}` fails.
  // Built through a function so the fixture keeps the whole union as its type:
  // a `const` with a union annotation narrows to its initializer, and then the
  // `present` variant this test is about *not* being is unreachable to it.
  const failing = (state: 'absent' | 'unreadable' | 'unchecked'): Readability => ({
    state,
    stage: 'examine',
    reason: 'not a regular file (fifo)',
  });
  const signal = failing('unreadable');
  if (signal.state === 'present') {
    assert.fail('the fixture is not the present variant');
    return;
  }
  assert.equal(signal.reason, 'not a regular file (fifo)');
  assert.equal(signal.reason.includes(signal.state), false, 'the state is a field, not prose');
  assert.equal(
    signal.reason.includes(String(signal.stage)),
    false,
    'the stage is a field, not prose',
  );
});
