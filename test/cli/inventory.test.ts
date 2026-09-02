/**
 * The pass: the walk, the confined reader and the authority composed once.
 *
 * The domain tests already cover which level resolves what, so nothing here
 * re-asserts the precedence. What is only observable through the composition is
 * asserted instead:
 *
 *   - the skip policy leaves the right things out **and records every one**,
 *     because an unrecorded exclusion silently shortens the inventory;
 *   - a directory's children come from the walk's own entries, so an `index.md`
 *     on disk actually reaches the ambiguity rule;
 *   - an entry the walk did not report `present` still gets a verdict, with the
 *     levels that need content recorded as unavailable rather than as having
 *     run;
 *   - a bound that stops a directory being enumerated makes its children
 *     *unavailable*, not empty — "holds no `index.md`" and "was never listed"
 *     are different facts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonical } from '../../src/adapters/fs/paths.ts';
import { ConfinedReader, ConfinementError } from '../../src/adapters/fs/read.ts';
import {
  INVENTORY_BUDGET,
  MAX_RECORDED_SKIPS,
  OUTPUT_DIRECTORY,
  SKIPPED_NAMES,
  takeInventory,
  type Inventory,
} from '../../src/cli/inventory.ts';
import type { Verdict } from '../../src/domain/identity.ts';
import { makeTree, symlinksAvailable, type TreeNode } from '../support/tree.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A project-shaped tree, plus whatever the case under test adds. */
const PROJECT: readonly TreeNode[] = [
  { dir: '_bmad' },
  { file: '_bmad/config.yaml', text: 'output_folder: _bmad-output\n' },
  { dir: '_bmad-output' },
  { file: '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md', text: '# A PRD\n' },
  {
    file: '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01/index.md',
    text: '# A sharded PRD\n',
  },
  { file: '_bmad-output/specs/spec-bmad-dash/SPEC.md', text: '# The spec\n' },
  { file: '_bmad-output/handover.md', text: '---\ntype: brief\n---\n\n# Handover\n' },
  { file: '_bmad-output/unremarkable.txt', text: 'nothing familiar\n' },
  // Everything below is outside the artifact output tree and must be skipped.
  { dir: 'src' },
  { file: 'src/index.ts', text: 'export const x = 1;\n' },
  { dir: 'node_modules' },
  { file: 'node_modules/pkg/index.js', text: '// dependency\n' },
  { dir: '.git' },
  { file: 'package.json', text: '{}\n' },
];

async function inventoried(
  t: { after: (fn: () => unknown) => void },
  extra: readonly TreeNode[] = [],
): Promise<{ readonly root: string; readonly inventory: Inventory }> {
  const root = await makeTree(t, [...PROJECT, ...extra]);
  return { root, inventory: takeInventory(new ConfinedReader(canonical(root))) };
}

/** The verdict for one entry, by its project-root-relative path. */
function verdictFor(inventory: Inventory, relative: string): Verdict {
  const found = inventory.entries.find((entry) => entry.entry.relative === relative);
  assert.ok(found !== undefined, `no inventory entry for ${relative}`);
  return found.identity;
}

/** Every path the pass reported, so a missing sibling is visible. */
function paths(inventory: Inventory): readonly string[] {
  return inventory.entries.map((entry) => entry.entry.relative);
}

test('the pass identifies each entry once and leaves nothing in the output tree out', async (t) => {
  const { inventory } = await inventoried(t);

  assert.equal(inventory.startEntry.relative, '.');
  assert.equal(inventory.startEntry.state, 'present');
  assert.equal(
    paths(inventory).includes('.'),
    false,
    'the project root is what was walked, not something found in it',
  );

  assert.deepEqual(paths(inventory), [
    '_bmad-output',
    '_bmad-output/handover.md',
    '_bmad-output/planning-artifacts',
    '_bmad-output/planning-artifacts/prds',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01/index.md',
    '_bmad-output/specs',
    '_bmad-output/specs/spec-bmad-dash',
    '_bmad-output/specs/spec-bmad-dash/SPEC.md',
    '_bmad-output/unremarkable.txt',
  ]);
  assert.equal(inventory.complete, true);
  assert.deepEqual(inventory.truncations, []);
});

test('every level the pass composes actually resolves something over a real tree', async (t) => {
  const { inventory } = await inventoried(t);

  const byLocation = verdictFor(inventory, '_bmad-output/specs/spec-bmad-dash/SPEC.md');
  assert.equal(byLocation.outcome === 'identified' ? byLocation.resolvedAt : null, 'location');

  const byFrontmatter = verdictFor(inventory, '_bmad-output/handover.md');
  assert.equal(byFrontmatter.outcome === 'identified' ? byFrontmatter.resolvedAt : null, 'frontmatter');
  assert.equal(byFrontmatter.outcome === 'identified' ? byFrontmatter.family : null, 'brief');

  const nothing = verdictFor(inventory, '_bmad-output/unremarkable.txt');
  assert.equal(nothing.outcome, 'unidentified');
  assert.deepEqual(
    nothing.attempted.map((attempt) => attempt.level),
    ['location', 'frontmatter', 'structure', 'filename'],
  );
});

test('a directory children come from the walk, so an index.md reaches the ambiguity rule', async (t) => {
  const { inventory } = await inventoried(t);

  const sharded = verdictFor(inventory, '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01');
  assert.equal(sharded.outcome, 'ambiguous');
  if (sharded.outcome !== 'ambiguous') return;
  assert.deepEqual(sharded.readings, [
    { family: 'prd', shape: 'run-folder' },
    { family: 'prd', shape: 'sharded-document' },
  ]);

  const run = verdictFor(inventory, '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28');
  assert.equal(run.outcome, 'identified');
  assert.equal(run.outcome === 'identified' ? run.shape : null, 'run-folder');
});

test('the skip policy records everything it leaves out', async (t) => {
  const { inventory } = await inventoried(t);

  assert.deepEqual(
    inventory.skipped.map((skip) => `${skip.relative} (${skip.reason})`).sort(),
    [
      '.git (outside the artifact output tree)',
      'node_modules (outside the artifact output tree)',
      'package.json (outside the artifact output tree)',
      'src (outside the artifact output tree)',
      '_bmad (outside the artifact output tree)',
    ].sort(),
  );
  for (const skipped of inventory.skipped) {
    // Segment-wise, not prefix-wise: `_bmad-output` begins with `_bmad`, and a
    // bare `startsWith` reports the output folder itself as a skip violation.
    assert.equal(
      paths(inventory).some(
        (relative) => relative === skipped.relative || relative.startsWith(`${skipped.relative}/`),
      ),
      false,
      `${skipped.relative} was skipped and must not appear`,
    );
  }
});

test('a dependency directory inside the output tree is skipped and recorded', async (t) => {
  const { inventory } = await inventoried(t, [
    { file: '_bmad-output/specs/spec-bmad-dash/node_modules/pkg/index.js', text: '// no\n' },
  ]);
  assert.deepEqual(
    inventory.skipped.filter((skip) => skip.reason === 'dependency directory').map((skip) => skip.relative),
    ['_bmad-output/specs/spec-bmad-dash/node_modules'],
  );
  assert.deepEqual(SKIPPED_NAMES, ['node_modules']);
});

test('a dot-named file inside the output tree is kept, because a memlog is one', async (t) => {
  const { inventory } = await inventoried(t, [
    { file: '_bmad-output/specs/spec-bmad-dash/.memlog.md', text: '- (decision) kept\n' },
  ]);
  assert.equal(paths(inventory).includes('_bmad-output/specs/spec-bmad-dash/.memlog.md'), true);
  const verdict = verdictFor(inventory, '_bmad-output/specs/spec-bmad-dash/.memlog.md');
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'spec');
});

test('an unreadable file is identified by path alone and does not stop the pass', async (t) => {
  const root = await makeTree(t, PROJECT);
  // Invalid UTF-8, so `readText` refuses it rather than substituting U+FFFD.
  await writeFile(join(root, '_bmad-output', 'prd.md'), Buffer.from([0xff, 0xfe, 0x00, 0x41]));
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  const verdict = verdictFor(inventory, '_bmad-output/prd.md');
  assert.deepEqual(
    verdict.attempted.map((attempt) => `${attempt.level}:${attempt.result}`),
    ['location:no-signal', 'frontmatter:unavailable', 'structure:unavailable', 'filename:resolved'],
  );
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'prd');
  assert.match(
    String(verdict.attempted[1]?.reason),
    /UTF-8/,
    'the reason a level could not run is the reader own',
  );
  // The rest of the tree is still there: an unreadable file is a value, not an
  // abort, which is the whole of AD-7 applied to this pass.
  assert.equal(paths(inventory).includes('_bmad-output/specs/spec-bmad-dash/SPEC.md'), true);
  assert.equal(inventory.complete, true, 'an unreadable *file* is still a present entry');
});

test('an entry the walk did not report present still gets a verdict', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('symlinks are unavailable here, so a dangling entry cannot be built');
    return;
  }
  const { inventory } = await inventoried(t, [
    { link: '_bmad-output/specs/spec-bmad-dash/gone.md', to: '_bmad-output/nowhere.md', type: 'file' },
  ]);

  const entry = inventory.entries.find(
    (each) => each.entry.relative === '_bmad-output/specs/spec-bmad-dash/gone.md',
  );
  assert.ok(entry !== undefined, 'a dangling entry is reported, never omitted');
  assert.equal(entry.entry.state, 'absent');
  assert.equal(entry.identity.outcome, 'identified');
  if (entry.identity.outcome !== 'identified') return;
  assert.equal(entry.identity.family, 'spec', 'location needs no content, so it still answers');
  assert.equal(entry.identity.shape, 'unknown', 'nothing was examined, so no shape is claimed');
  assert.equal(inventory.complete, false, 'an entry that is not present is not a complete pass');
});

test('a directory the depth bound stopped at has children unavailable, not empty', async (t) => {
  // A plain directory, not one of BMAD's layout roots and not an artifact root:
  // those two are answered before level 3 is reached, so neither can show what
  // an unfinished listing does to it.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/handover/prd.md', text: '# p\n' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)), {
    budget: { maxDepth: 2, maxEntries: INVENTORY_BUDGET.maxEntries },
  });

  assert.deepEqual(
    inventory.truncations.map((truncation) => truncation.limit),
    ['depth'],
  );
  const verdict = verdictFor(inventory, '_bmad-output/loose');
  const structure = verdict.attempted.find((attempt) => attempt.level === 'structure');
  assert.equal(structure?.result, 'unavailable');
  assert.match(String(structure?.reason), /depth limit of 2/);
  assert.equal(inventory.complete, false);

  // The next-larger depth must not truncate, so shrinking the bound fails too.
  const deeper = takeInventory(new ConfinedReader(canonical(root)), {
    budget: { maxDepth: 4, maxEntries: INVENTORY_BUDGET.maxEntries },
  });
  assert.deepEqual(deeper.truncations, []);
  const listed = verdictFor(deeper, '_bmad-output/loose');
  assert.equal(
    listed.attempted.find((attempt) => attempt.level === 'structure')?.result,
    'no-signal',
  );
});

test('a directory the entry budget stopped short of does not read as fully listed', async (t) => {
  // The bug this row exists for: the walk records a *global* entry-budget
  // truncation at the next pending path, which is a path it never reported,
  // while the lookup was keyed on a directory's own `relative` — so it missed,
  // and a run folder holding an `index.md` one entry past the cut reported
  // `children: ['aaa.md']` as available and flipped from `ambiguous` to a
  // `certain` run folder.
  //
  // The only truncation test before this one set `maxDepth` and left
  // `maxEntries` at its default, and the depth bound *does* record at the
  // directory — which is why it passed either way.
  //
  // This fixture triggers both entry-budget shapes at once: the per-directory
  // cap bites inside the first run folder, and the global cap bites between the
  // two, leaving the second unreported entirely.
  const nodes: readonly TreeNode[] = [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/prd-bmad-2026-09-01/aaa.md', text: '# a\n' },
    { file: '_bmad-output/loose/prd-bmad-2026-09-01/index.md', text: '# i\n' },
    { file: '_bmad-output/loose/prd-bmad-2026-09-02/bbb.md', text: '# b\n' },
  ];
  const first = '_bmad-output/loose/prd-bmad-2026-09-01';
  const second = '_bmad-output/loose/prd-bmad-2026-09-02';

  const root = await makeTree(t, nodes);
  const cut = takeInventory(new ConfinedReader(canonical(root)), {
    budget: { maxDepth: INVENTORY_BUDGET.maxDepth, maxEntries: 5 },
  });

  assert.deepEqual(
    cut.truncations.map((truncation) => truncation.limit),
    ['entries', 'entries'],
  );
  assert.equal(paths(cut).includes(`${first}/index.md`), false, 'the cut is where it is claimed');
  assert.equal(paths(cut).includes(second), false, 'the second run folder is never reported');
  assert.equal(cut.complete, false);

  // The directory whose own listing was capped. Its children are unavailable,
  // so the sharded reading is left open rather than refuted — and the verdict
  // must not read as a `certain` run folder over a listing that never finished.
  const short = verdictFor(cut, first);
  assert.equal(short.outcome, 'ambiguous', 'an unfinished listing cannot refute a sharded reading');
  if (short.outcome !== 'ambiguous') return;
  assert.deepEqual(
    short.readings.map((reading) => reading.shape),
    ['run-folder', 'sharded-document'],
  );
  const capped = short.attempted.find((attempt) => attempt.level === 'structure');
  assert.equal(capped?.result, 'unavailable');
  assert.match(String(capped?.reason), /entry budget/);

  // And the ancestor of the *global* cut, which is where the keying was wrong:
  // `_bmad-output/loose` has a child the walk never reported, so its own
  // listing is not something to draw a conclusion from.
  const ancestor = verdictFor(cut, '_bmad-output/loose');
  const unfinished = ancestor.attempted.find((attempt) => attempt.level === 'structure');
  assert.equal(unfinished?.result, 'unavailable');
  assert.match(String(unfinished?.reason), /entry budget/);

  // The next-larger budget must *not* truncate, so a mutation that shrinks a
  // cap fails as loudly as one that removes it.
  const whole = takeInventory(new ConfinedReader(canonical(root)), {
    budget: { maxDepth: INVENTORY_BUDGET.maxDepth, maxEntries: 8 },
  });
  assert.deepEqual(whole.truncations, []);
  assert.equal(whole.complete, true);
  assert.equal(paths(whole).includes(second), true);
  const listed = verdictFor(whole, '_bmad-output/loose');
  assert.equal(
    listed.attempted.find((attempt) => attempt.level === 'structure')?.result,
    'no-signal',
    'a complete listing is available, and names no family',
  );
  // With the whole listing the first run folder is still FR-73 ambiguous, but
  // now on evidence rather than on absence of it.
  const full = verdictFor(whole, first);
  assert.equal(full.outcome, 'ambiguous');
});

test('the pass reads only inside the project root, and the budget is stated rather than defaulted', () => {
  // `walk` refuses a missing bound, so a caller has to choose; these are the
  // choices, asserted so a change to them is deliberate.
  assert.equal(INVENTORY_BUDGET.maxDepth, 12);
  assert.equal(INVENTORY_BUDGET.maxEntries, 4_000);
  assert.equal(OUTPUT_DIRECTORY, '_bmad-output');
});

test('a project with no output folder yields an empty inventory rather than a failure', async (t) => {
  const root = await makeTree(t, [{ dir: '_bmad' }, { file: 'README.md', text: '# x\n' }]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));
  assert.deepEqual(paths(inventory), []);
  assert.equal(inventory.startEntry.state, 'present');
  assert.deepEqual(
    inventory.skipped.map((skip) => skip.relative).sort(),
    ['README.md', '_bmad'],
  );
});

// ---------------------------------------------------------------------------
// This project's own tree, end to end
// ---------------------------------------------------------------------------

test('every artifact in this repository resolves to a family', async () => {
  // The assertion the iteration-1 finding asked for, and the one no fixture can
  // stand in for: the tool's subject is BMAD projects, and its own is the only
  // real one to hand. Before `implementation-artifacts` was a level-1 root,
  // about a third of these rows read "not identified".
  const inventory = takeInventory(new ConfinedReader(canonical(REPO_ROOT)));
  assert.equal(inventory.startEntry.state, 'present');
  assert.ok(inventory.entries.length > 20, `only ${String(inventory.entries.length)} entries found`);
  assert.equal(inventory.complete, true, 'the real tree walks cleanly within the budget');

  // BMAD's output *layout*, which is not an artifact: the output folder and the
  // two roots the config declares. Enumerated rather than pattern-matched, so a
  // third one appearing is a failure and has to be a decision.
  const layout = [
    '_bmad-output',
    '_bmad-output/planning-artifacts',
    '_bmad-output/implementation-artifacts',
  ];

  const unidentified = inventory.entries
    .filter((entry) => entry.identity.outcome === 'unidentified')
    .map((entry) => entry.entry.relative);
  assert.deepEqual(
    unidentified.sort(),
    [...layout].sort(),
    'every artifact must resolve; only BMAD own layout directories may not',
  );

  // And the layout rows are unidentified for the stated reason — they hold
  // several families — rather than because a level threw or was skipped.
  for (const relative of layout) {
    const verdict = verdictFor(inventory, relative);
    assert.deepEqual(
      verdict.attempted.map((attempt) => attempt.level),
      ['location', 'frontmatter', 'structure', 'filename'],
      relative,
    );
  }

  // A spot check that the families are the right ones and not merely present.
  const expected: readonly (readonly [string, string])[] = [
    ['_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md', 'prd'],
    ['_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md', 'architecture'],
    ['_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/DESIGN.md', 'ux-design'],
    ['_bmad-output/specs/spec-bmad-dash/SPEC.md', 'spec'],
    ['_bmad-output/planning-artifacts/epics.md', 'epics'],
    ['_bmad-output/implementation-artifacts/sprint-status.yaml', 'sprint-tracking'],
    ['_bmad-output/implementation-artifacts/deferred-work.md', 'note'],
    ['_bmad-output/implementation-artifacts/epic-1-context.md', 'note'],
    ['_bmad-output/implementation-artifacts/spec-1-7-identify-what-each-artifact-is.md', 'story'],
  ];
  for (const [relative, family] of expected) {
    const verdict = verdictFor(inventory, relative);
    assert.equal(verdict.outcome, 'identified', relative);
    if (verdict.outcome !== 'identified') continue;
    assert.equal(verdict.family, family, relative);
  }
});

// ---------------------------------------------------------------------------
// The skip policy's own edges
// ---------------------------------------------------------------------------

test('the recorded skips are capped, and the overflow is counted rather than dropped', async (t) => {
  // `childrenOf` applies the exclusion filter *before* it slices to its limit,
  // so an excluded name costs nothing against `maxEntries` — which left this
  // one list outside the budget the rest of the pass is careful about.
  const many = Array.from({ length: MAX_RECORDED_SKIPS + 25 }, (_unused, index) => ({
    dir: `noise-${String(index).padStart(4, '0')}`,
  }));
  const root = await makeTree(t, [{ dir: '_bmad' }, { dir: '_bmad-output' }, ...many]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  // Every root child except the output folder: the noise plus `_bmad`.
  const excluded = many.length + 1;
  assert.equal(inventory.skipped.length, MAX_RECORDED_SKIPS);
  assert.equal(inventory.skippedNotRecorded, excluded - MAX_RECORDED_SKIPS);
  assert.equal(
    inventory.skipped.length + inventory.skippedNotRecorded,
    excluded,
    'nothing is lost: what is not listed is counted',
  );
});

test('a listing the skip policy filtered is still reported as available, deliberately', async (t) => {
  // Stated rather than left to be discovered. The alternative — reporting the
  // whole listing unavailable because one child was excluded — would silence
  // level 3 for a run folder that happened to contain a dependency directory,
  // which is the worse trade. What makes it safe today is that the only name
  // skipped below the output folder is `node_modules`, which is neither a
  // family document nor an `index.md`.
  const { inventory } = await inventoried(t, [
    { file: '_bmad-output/specs/spec-bmad-dash/node_modules/pkg/index.md', text: '# no\n' },
  ]);
  const verdict = verdictFor(inventory, '_bmad-output/specs/spec-bmad-dash');
  assert.equal(verdict.outcome, 'identified');
  if (verdict.outcome !== 'identified') return;
  assert.equal(
    verdict.shape,
    'run-folder',
    'a skipped index.md does not make the directory read as sharded',
  );
  assert.equal(
    inventory.skipped.some(
      (skip) => skip.relative === '_bmad-output/specs/spec-bmad-dash/node_modules',
    ),
    true,
    'the exclusion is recorded, so it is visible to the caller',
  );
});

test('complete says nothing about what the policy skipped, and the doc says so', async (t) => {
  const { inventory } = await inventoried(t);
  assert.equal(inventory.complete, true);
  assert.ok(inventory.skipped.length > 0, 'this fixture has skips');
  // The narrower claim, spelled out here because the walk's own `complete` was
  // added to stop exactly this misread: `complete` is about bounds and entry
  // states, and `skipped` is where a deliberate exclusion is answered.
  const doc = await readFile(join(REPO_ROOT, 'src', 'cli', 'inventory.ts'), 'utf8');
  assert.match(doc, /It says nothing about `skipped`/);
});

test('the output folder is matched case-insensitively, so a recased volume is not empty', async (t) => {
  // The destructive case: gating on an exact `_bmad-output` meant a
  // case-insensitive volume handing back another spelling skipped the whole
  // output tree and returned an **empty inventory reporting itself complete**.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/specs/spec-x/SPEC.md', text: '# s\n' },
  ]);
  await rename(join(root, '_bmad-output'), join(root, '_BMAD-Output'));
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  assert.equal(
    inventory.skipped.some((skip) => skip.relative.toLowerCase() === '_bmad-output'),
    false,
    'the output folder must not be skipped as being outside itself',
  );
  const verdict = verdictFor(inventory, '_BMAD-Output/specs/spec-x/SPEC.md');
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'spec');
  assert.equal(verdict.outcome === 'identified' ? verdict.resolvedAt : null, 'location');
});

// ---------------------------------------------------------------------------
// Children the walk could not stand behind
// ---------------------------------------------------------------------------

test('a dangling index.md is not a structural signal, though it is still reported', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('symlinks are unavailable here, so a dangling entry cannot be built');
    return;
  }
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/handover/prd.md', text: '# p\n' },
    { link: '_bmad-output/loose/handover/index.md', to: '_bmad-output/nowhere.md', type: 'file' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  // The name is there and there is nothing behind it. Level 3's question is
  // what the directory *contains*, so a broken link must not make a directory
  // read as a sharded document at `certain` confidence.
  const verdict = verdictFor(inventory, '_bmad-output/loose/handover');
  assert.equal(verdict.outcome, 'identified');
  if (verdict.outcome !== 'identified') return;
  assert.notEqual(verdict.shape, 'sharded-document');
  assert.equal(verdict.family, 'prd', 'the readable document still answers');

  // Nothing disappeared: the dangling entry has its own row and its own state.
  const dangling = inventory.entries.find(
    (entry) => entry.entry.relative === '_bmad-output/loose/handover/index.md',
  );
  assert.ok(dangling !== undefined, 'a dangling entry is reported, never omitted');
  assert.equal(dangling.entry.state, 'absent');
});

test('a confinement refusal on one read does not abort the pass', async (t) => {
  // `readText` throws on a confinement failure by design — there is no sensible
  // way to continue reading that path. There is a sensible way to continue the
  // *pass*, and AD-7 requires it. Reachable in the wild only as a race, so it
  // is provoked here rather than waited for.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/handover.md', text: '---\ntype: brief\n---\n' },
    { file: '_bmad-output/loose/other.md', text: '# Nothing\n' },
  ]);
  const reader = new ConfinedReader(canonical(root));
  const real = reader.readText.bind(reader);
  reader.readText = (path: string) => {
    if (path.endsWith('handover.md')) {
      throw new ConfinementError(canonical('/elsewhere/handover.md'), canonical(root));
    }
    return real(path);
  };

  const inventory = takeInventory(reader);
  const refused = verdictFor(inventory, '_bmad-output/loose/handover.md');
  const frontmatter = refused.attempted.find((attempt) => attempt.level === 'frontmatter');
  assert.equal(frontmatter?.result, 'unavailable');
  assert.match(String(frontmatter?.reason), /outside/);
  // And the rest of the pass is intact.
  assert.equal(paths(inventory).includes('_bmad-output/loose/other.md'), true);
});

test('a file whose family the location resolves is never opened', async (t) => {
  // The laziness contract, observed through the composition rather than only in
  // the domain: `contentFor` used to run for every entry, so the pass read the
  // whole tree — up to its entry budget times the 8MB read limit — and threw
  // the text away.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/specs/spec-x/SPEC.md', text: '# s\n' },
    { file: '_bmad-output/specs/spec-x/notes.md', text: '# n\n' },
    { file: '_bmad-output/loose/handover.md', text: '---\ntype: brief\n---\n' },
  ]);
  const reader = new ConfinedReader(canonical(root));
  const real = reader.readText.bind(reader);
  const read: string[] = [];
  reader.readText = (path: string) => {
    read.push(path);
    return real(path);
  };

  takeInventory(reader);
  assert.deepEqual(
    read.map((path) => path.slice(root.length + 1).split(/[\\/]/).join('/')),
    ['_bmad-output/loose/handover.md'],
    'only the file no location resolved was opened',
  );
});
