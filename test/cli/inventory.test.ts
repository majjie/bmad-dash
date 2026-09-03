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
// Synchronous, and only in this file's fixture: the pass reads inside one
// synchronous call, so a file can only be made to vanish *between* the walk and
// the read from inside the read itself.
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonical, toPlatform } from '../../src/adapters/fs/paths.ts';
import { ConfinedReader, ConfinementError, MAX_READ_BYTES } from '../../src/adapters/fs/read.ts';
import {
  INVENTORY_BUDGET,
  MAX_RECORDED_SKIPS,
  OUTPUT_DIRECTORY,
  SKIPPED_NAMES,
  deepFreeze,
  takeInventory,
  type Alias,
  type Inventory,
  type InventoryEntry,
  type Skip,
} from '../../src/cli/inventory.ts';
import { MAX_RECORDED_SUPPRESSIONS, type WalkTruncation } from '../../src/adapters/fs/walk.ts';
import type { Verdict } from '../../src/domain/identity.ts';
import { interpret } from '../../src/domain/interpretation.ts';
import { LISTING_NOT_TEXT, UNREAD, type Readability } from '../../src/domain/signal.ts';
import { documentsOf, type Composition } from '../../src/domain/document.ts';
import { projectInventory } from '../../src/cli/index.ts';
import { renderPage } from '../../src/render/page.ts';
import { makeScratchDir } from '../support/project.ts';
import {
  deniableDirectories,
  makeTree,
  symlinksAvailable,
  whileDenied,
  type TreeNode,
} from '../support/tree.ts';

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

/** One whole entry, by its project-root-relative path. */
function entryFor(inventory: Inventory, relative: string): InventoryEntry {
  const found = inventory.entries.find((entry) => entry.entry.relative === relative);
  assert.ok(found !== undefined, `no inventory entry for ${relative}`);
  return found;
}

/** The verdict for one entry, by its project-root-relative path. */
function verdictFor(inventory: Inventory, relative: string): Verdict {
  const found = inventory.entries.find((entry) => entry.entry.relative === relative);
  assert.ok(found !== undefined, `no inventory entry for ${relative}`);
  return found.identity;
}

/** What one entry is made of, by its project-root-relative path. */
function compositionFor(inventory: Inventory, relative: string): Composition {
  const found = inventory.entries.find((entry) => entry.entry.relative === relative);
  assert.ok(found !== undefined, `no inventory entry for ${relative}`);
  return found.composition;
}

/**
 * This repository's own inventory, taken once and shared.
 *
 * Five tests assert over the real tree, and each of them used to walk it
 * again — five walks of the same unchanging directory inside one process.
 * Lazy rather than eager, so a run of a single unrelated test in this file
 * still costs nothing, and memoized rather than a fixture, because the tree is
 * read-only and the pass is pure with respect to it.
 */
let repoInventoryCell: Inventory | undefined;
function repoInventory(): Inventory {
  return (repoInventoryCell ??= takeInventory(new ConfinedReader(canonical(REPO_ROOT))));
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
    "the reason a level could not run is the reader's own",
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
  const inventory = repoInventory();
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

test('both review shapes in this repository resolve to review, with no assumed path', async () => {
  // FR-50 over the real tree, which is the only place both shapes exist
  // together: six reviews sit at a run folder's own workspace root and three
  // under a `reviews/` subfolder. Enumerated exactly rather than counted, so a
  // review that stops resolving names itself and a tenth one appearing is a
  // deliberate edit here.
  const inventory = repoInventory();
  const reviews = inventory.entries
    .filter((entry) => entry.identity.outcome === 'identified' && entry.identity.family === 'review')
    .map((entry) => entry.entry.relative)
    .sort();
  assert.deepEqual(reviews, [
    '_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/reviews/review-adversarial-seams.md',
    '_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/reviews/review-rubric.md',
    '_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/reviews/review-tech-currency.md',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/review-adversarial.md',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/review-edge-cases.md',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/review-rubric.md',
    '_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/review-contrast.md',
    '_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/review-spine-seam.md',
    '_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/review-state-coverage.md',
  ]);

  // Both shapes are represented. **Derived from the walk's own listings, not
  // from the array above** — the review round found this pair computed from
  // the very list the `deepEqual` had just fixed exactly, under a comment
  // claiming it was an independent check. The independent question is: of the
  // `review-*.md` names the walk found on disk, how many sit in a `reviews/`
  // directory and how many at a run folder's own root.
  const onDisk = inventory.entries
    .filter((entry) => entry.entry.state === 'present' && entry.entry.kind === 'file')
    .map((entry) => entry.entry.relative)
    .filter((relative) => /(^|\/)review-[^/]*\.md$/.test(relative));
  const nested = onDisk.filter((relative) => relative.includes('/reviews/'));
  assert.equal(nested.length, 3, 'the `reviews/` subfolder shape');
  assert.equal(onDisk.length - nested.length, 6, 'the workspace-root shape');
  assert.deepEqual([...onDisk].sort(), reviews, 'and every one of them resolved to review');

  // And none of them is read as the family of the workspace it sits in, which
  // is the measured defect: `review-contrast.md` came back `ux-design`,
  // `review-rubric.md` under `prds/` came back `prd`. The reviewed artifacts
  // beside them keep their own families, so the fix is not a blanket one.
  const reviewed: readonly (readonly [string, string])[] = [
    ['_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md', 'prd'],
    ['_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/DESIGN.md', 'ux-design'],
    [
      '_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md',
      'architecture',
    ],
  ];
  for (const [relative, family] of reviewed) {
    const verdict = verdictFor(inventory, relative);
    assert.equal(verdict.outcome === 'identified' ? verdict.family : null, family, relative);
  }
});

test('every run folder in this repository reports its collision risk and date signal', async () => {
  // FR-71 and FR-72 through the whole composition, over the four run folders
  // this project actually has. Enumerated, and asserted on both axes: three
  // dated `{project_name}` folders whose reuse is accidental, and one dateless
  // spec folder whose reuse is deliberate — which is the pair of facts a folder
  // name cannot carry and the reason the derivation exists.
  const inventory = repoInventory();
  const withFacts = inventory.entries
    .filter((entry) => entry.runFacts.length > 0)
    .map((entry) => {
      const only = entry.runFacts[0];
      assert.equal(entry.runFacts.length, 1, entry.entry.relative);
      assert.ok(only !== undefined && only.outcome === 'measured', entry.entry.relative);
      return `${entry.entry.relative} ${only.family} ${only.reuse} ${only.dateSignal} ${only.runCount}`;
    })
    .sort();
  assert.deepEqual(withFacts, [
    '_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28 architecture accidental present unknowable',
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28 prd accidental present unknowable',
    '_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28 ux-design accidental present unknowable',
    '_bmad-output/specs/spec-bmad-dash spec deliberate absent unknowable',
  ]);

  // Nothing else claims run facts — not the family container directories, not
  // the documents inside a run, not the `reviews/` and `mockups/` subfolders.
  // An empty list is the answer for those, and a row of falsehoods would be
  // the thing a surface then rendered.
  // The sweep reads **every** reading, `ambiguous` included. The review round
  // demonstrated the narrower version green: replacing `runFactsOf(identity)`
  // with `identity.outcome === 'identified' ? … : []` dropped FR-71's
  // disclosure for exactly the FR-73 folders that most need it, and a sweep
  // that only looked at `identified` entries was satisfied by the result.
  for (const entry of inventory.entries) {
    if (entry.runFacts.length > 0) continue;
    const shapes =
      entry.identity.outcome === 'identified'
        ? [entry.identity.shape]
        : entry.identity.outcome === 'ambiguous'
          ? entry.identity.readings.map((reading) => reading.shape)
          : [];
    assert.equal(
      shapes.includes('run-folder'),
      false,
      `${entry.entry.relative} carries a run-folder reading with no facts`,
    );
  }
});

test('an ambiguous run folder keeps its collision disclosure through the pass', async (t) => {
  // The fixture the repository cannot supply: it has no directory that is both
  // a run folder and a sharded document. `PROJECT` does — `prd-bmad-2026-09-01`
  // holds an `index.md` under the `prds` root — and this is the row that fails
  // if the derivation is narrowed to `identified` verdicts. `runs.test.ts`
  // covers the rule; this covers the wiring, which is where the mutation lives.
  const { inventory } = await inventoried(t);
  const ambiguous = entryFor(inventory, '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01');
  assert.equal(ambiguous.identity.outcome, 'ambiguous');
  assert.equal(ambiguous.runFacts.length, 1, 'an ambiguous shape is not a reason to say nothing');
  const only = ambiguous.runFacts[0];
  assert.ok(only !== undefined && only.outcome === 'measured');
  assert.equal(only.family, 'prd');
  assert.equal(only.canCollide, true);
  assert.equal(only.reuse, 'accidental');
  assert.equal(only.dateSignal, 'present');
  assert.equal(only.runCount, 'unknowable');
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

  // The signal, not only the verdict. Left unasserted, replacing this branch's
  // signal with `{state: 'present'}` kept the suite green — the pass then
  // reported content it had been *refused* as readable, with
  // `content.available === false` beside it, which is the same shape this story
  // opened with one layer down. `unchecked` rather than `unreadable`, and at
  // the same stage the walk uses for the same decision: the filesystem
  // answered and the answer was declined.
  const read = failedRead(inventory, '_bmad-output/loose/handover.md');
  assert.equal(read.state, 'unchecked');
  assert.equal(read.stage, 'confinement');
  assert.match(read.reason, /outside/);

  // And the rest of the pass is intact.
  assert.equal(paths(inventory).includes('_bmad-output/loose/other.md'), true);
  assert.equal(entryFor(inventory, '_bmad-output/loose/other.md').readability.state, 'present');
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

// ---------------------------------------------------------------------------
// What each entry is made of — Story 1.8, composed through the real pass
// ---------------------------------------------------------------------------

test('the document model is attached per entry, over both shapes at once', async (t) => {
  const { inventory } = await inventoried(t, [
    { file: '_bmad-output/loose/handover/prd/index.md', text: '# A sharded PRD\n' },
    { file: '_bmad-output/loose/handover/prd/requirements.md', text: '# Requirements\n' },
    { file: '_bmad-output/loose/handover/prd/appendix.md', text: '# Appendix\n' },
  ]);

  // A whole document: one part, itself.
  const whole = compositionFor(
    inventory,
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md',
  );
  assert.deepEqual(documentsOf(whole), [
    {
      relative: '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md',
      shape: 'document',
      parts: {
        state: 'complete',
        paths: ['_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md'],
      },
    },
  ]);

  // And a sharded one: the same interface, the same identity rule, its parts
  // taken from the listing the walk already reported — index first.
  const sharded = compositionFor(inventory, '_bmad-output/loose/handover/prd');
  assert.deepEqual(documentsOf(sharded), [
    {
      relative: '_bmad-output/loose/handover/prd',
      shape: 'sharded-document',
      parts: {
        state: 'complete',
        paths: [
          '_bmad-output/loose/handover/prd/index.md',
          '_bmad-output/loose/handover/prd/appendix.md',
          '_bmad-output/loose/handover/prd/requirements.md',
        ],
      },
    },
  ]);

  // The ambiguous directory in the shared fixture offers both readings, and the
  // pass chooses neither: the run-folder reading is still there beside it.
  const both = compositionFor(
    inventory,
    '_bmad-output/planning-artifacts/prds/prd-bmad-2026-09-01',
  );
  assert.deepEqual(
    both.readings.map((reading) =>
      reading.reading === 'document' ? reading.document.shape : `not:${reading.shape}`,
    ),
    ['not:run-folder', 'sharded-document'],
  );
});

test('the child listing is surfaced on every entry rather than discarded', async (t) => {
  // The alternative this exists to prevent is a second enumeration: the model
  // needs the very names identification saw, and re-deriving them through
  // `childrenOf` would probe the whole tree twice and could disagree.
  const { inventory } = await inventoried(t);

  const run = inventory.entries.find(
    (entry) => entry.entry.relative === '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28',
  );
  assert.ok(run !== undefined);
  assert.deepEqual(run.children, { available: true, names: ['prd.md'] });

  const document = inventory.entries.find(
    (entry) => entry.entry.relative === '_bmad-output/handover.md',
  );
  assert.ok(document !== undefined);
  assert.equal(document.children.available, false, 'a file has no listing to surface');
});

test('a directory whose listing a bound stopped has parts unavailable, not empty', async (t) => {
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/prd-bmad-2026-09-01/aaa.md', text: '# a\n' },
    { file: '_bmad-output/loose/prd-bmad-2026-09-01/index.md', text: '# i\n' },
  ]);
  const cut = takeInventory(new ConfinedReader(canonical(root)), {
    budget: { maxDepth: INVENTORY_BUDGET.maxDepth, maxEntries: 5 },
  });

  const composition = compositionFor(cut, '_bmad-output/loose/prd-bmad-2026-09-01');
  const documents = documentsOf(composition);
  assert.equal(documents.length, 1, 'the sharded reading stays open rather than refuted');
  assert.equal(documents[0]?.parts.state, 'unavailable');
  const parts = documents[0]?.parts;
  assert.match(
    parts?.state === 'unavailable' ? parts.reason : '',
    /entry budget/,
    'parts are unavailable for the reason the walk gave, not silently empty',
  );

  // The larger budget lists it, and the parts arrive — so a mutation that
  // shrank the bound would fail here as well as above.
  const whole = takeInventory(new ConfinedReader(canonical(root)), {
    budget: { maxDepth: INVENTORY_BUDGET.maxDepth, maxEntries: 8 },
  });
  const listed = documentsOf(compositionFor(whole, '_bmad-output/loose/prd-bmad-2026-09-01'));
  assert.deepEqual(listed[0]?.parts, {
    state: 'complete',
    paths: [
      '_bmad-output/loose/prd-bmad-2026-09-01/index.md',
      '_bmad-output/loose/prd-bmad-2026-09-01/aaa.md',
    ],
  });
});

test('a skipped name that could never be a part leaves the parts authoritative', async (t) => {
  // The `Listing` hole carried into the model — and then *filtered by the
  // model*, which is the half worth pinning here. The only name the policy
  // removes below the output folder is `node_modules`, which is neither
  // markdown nor an index, so the parts genuinely are all of them and saying
  // otherwise would put a permanent "may be short" on every artifact directory
  // that happens to contain a dependency directory.
  const { inventory } = await inventoried(t, [
    { file: '_bmad-output/loose/handover/prd/index.md', text: '# i\n' },
    { file: '_bmad-output/loose/handover/prd/node_modules/pkg/part.md', text: '# no\n' },
  ]);

  const documents = documentsOf(compositionFor(inventory, '_bmad-output/loose/handover/prd'));
  assert.deepEqual(documents[0]?.parts, {
    state: 'complete',
    paths: ['_bmad-output/loose/handover/prd/index.md'],
  });

  // The exclusion is still recorded, and the safety above is a property of the
  // policy holding exactly one non-markdown name rather than of the design —
  // asserted together, so adding a markdown-capable name makes this row's own
  // premise visibly false.
  assert.equal(
    inventory.skipped.some(
      (skip) => skip.relative === '_bmad-output/loose/handover/prd/node_modules',
    ),
    true,
  );
  assert.deepEqual(SKIPPED_NAMES, ['node_modules']);
});

test('past the skip cap the omission arrives as a count, and the parts say so', async (t) => {
  // Finding 5's fixture. `omissionsByParent` read only the *recorded* skips, so
  // past `MAX_RECORDED_SKIPS` a filtered listing composed `complete` — the cap
  // quietly undoing the report it exists to bound, exactly as the suppression
  // cap did one layer down. The noise fills the record during the root's own
  // enumeration, so the `node_modules` deeper in the tree lands in the
  // overflow with its name gone and only the tally left.
  const noise = Array.from({ length: MAX_RECORDED_SKIPS + 5 }, (_unused, index) => ({
    dir: `noise-${String(index).padStart(4, '0')}`,
  }));
  const root = await makeTree(t, [
    { dir: '_bmad' },
    ...noise,
    { file: '_bmad-output/loose/handover/prd/index.md', text: '# i\n' },
    { file: '_bmad-output/loose/handover/prd/node_modules/pkg/part.md', text: '# no\n' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  assert.equal(inventory.skipped.length, MAX_RECORDED_SKIPS);
  assert.ok(inventory.skippedNotRecorded > 0, 'the fixture must overflow the record');
  assert.equal(
    inventory.skipped.some((skip) => skip.relative.endsWith('/node_modules')),
    false,
    'and the deep skip must be one of the ones it could not name',
  );

  const parts = documentsOf(compositionFor(inventory, '_bmad-output/loose/handover/prd'))[0]?.parts;
  assert.equal(parts?.state, 'possibly-incomplete');
  if (parts?.state !== 'possibly-incomplete') return;
  assert.deepEqual(parts.paths, ['_bmad-output/loose/handover/prd/index.md']);
  assert.match(String(parts.reasons[0]), /1 name\(s\) the skip policy left out were not recorded/);
});

test('an aliased index.md is restored, so the directory is not silently a plain run folder', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('symlinks are unavailable here, so an alias cannot be built');
    return;
  }
  // The inherited defect, closed. The link's name sorts after its target's, so
  // the walk reports `aaa.md` and suppresses `index.md` — and before Story 1.8
  // the suppression left no trace at all: this directory read as an
  // `identified`, `certain` run folder over a listing that was short by exactly
  // the one name that makes it ambiguous.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/prd-bmad-2026-09-01/aaa.md', text: '# a\n' },
    { link: '_bmad-output/loose/prd-bmad-2026-09-01/index.md', to: '_bmad-output/loose/prd-bmad-2026-09-01/aaa.md', type: 'file' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));
  const relative = '_bmad-output/loose/prd-bmad-2026-09-01';

  // Reported, not consumed silently, and the disposition is on the record.
  assert.deepEqual(
    inventory.aliases.map((alias) => `${alias.relative} -> ${alias.reportedAt} (${String(alias.restored)})`),
    [`${relative}/index.md -> ${relative}/aaa.md (true)`],
  );
  assert.match(String(inventory.aliases[0]?.reason), /restored as a name its parent holds/);
  assert.equal(inventory.suppressedNotRecorded, 0);
  assert.equal(inventory.complete, false, 'a shortened listing is not a complete pass');

  // Restored into the listing, because the name is one the directory holds: the
  // verdict is FR-73 ambiguous rather than a plain run folder.
  const entry = inventory.entries.find((each) => each.entry.relative === relative);
  assert.ok(entry !== undefined);
  assert.deepEqual(entry.children, { available: true, names: ['aaa.md', 'index.md'] });
  assert.equal(entry.identity.outcome, 'ambiguous');
  if (entry.identity.outcome !== 'ambiguous') return;
  assert.deepEqual(
    entry.identity.readings.map((reading) => reading.shape),
    ['run-folder', 'sharded-document'],
  );

  // One file is one part. The alias is a name this directory holds — which is
  // the whole signal — and it is a second spelling of `aaa.md`, so the sharded
  // reading lists the spelling the walk reported and not both: two parts for
  // one file would have Epic 2 render it twice.
  assert.deepEqual(documentsOf(entry.composition)[0]?.parts, {
    state: 'complete',
    paths: [`${relative}/aaa.md`],
  });
  assert.match(String(inventory.aliases[0]?.reason), /excluded from parts as a second spelling of aaa\.md/);

  // Nothing is duplicated: the artifact at that identity appears once.
  assert.equal(paths(inventory).filter((each) => each.startsWith(`${relative}/`)).length, 1);
});

test('a restored name does not disturb the listing order the walk reported', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('symlinks are unavailable here, so an alias cannot be built');
    return;
  }
  // `InventoryEntry.children` is a surfaced value now, so its order is part of
  // the contract. Appending restored names left it depending on which spelling
  // the walk happened to meet first: this fixture put `bbb.md` last where a
  // sorted listing puts it second.
  const relative = '_bmad-output/loose/prd-bmad-2026-09-01';
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: `${relative}/aaa.md`, text: '# a\n' },
    { link: `${relative}/bbb.md`, to: `${relative}/aaa.md`, type: 'file' },
    { file: `${relative}/index.md`, text: '# i\n' },
    { file: `${relative}/zzz.md`, text: '# z\n' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  const entry = inventory.entries.find((each) => each.entry.relative === relative);
  assert.ok(entry !== undefined);
  assert.deepEqual(entry.children, {
    available: true,
    names: ['aaa.md', 'bbb.md', 'index.md', 'zzz.md'],
  });
  // The general shape, so a fixture that happens to sort correctly proves
  // nothing: whatever the tree, the names come back sorted.
  for (const each of inventory.entries) {
    if (!each.children.available) continue;
    assert.deepEqual([...each.children.names].sort(), [...each.children.names], each.entry.relative);
  }
  // And the duplicate spelling is still one part.
  assert.deepEqual(documentsOf(entry.composition)[0]?.parts, {
    state: 'complete',
    paths: [`${relative}/index.md`, `${relative}/aaa.md`, `${relative}/zzz.md`],
  });
});

test('an alias whose winning spelling is not present is not restored as a name', async (t) => {
  if (!(await symlinksAvailable()) || !deniableDirectories()) {
    t.skip('needs symlinks and a non-root POSIX user');
    return;
  }
  // The hole the first version of the restore opened. `aaa` is a directory the
  // pass cannot enumerate, so it is reported `unreadable` and — by the rule
  // above — kept out of its parent's listing; `index.md` aliases it and was
  // restored unconditionally, so the listing held the alias and not the real
  // name, the verdict flipped to ambiguous, and the sharded reading's one part
  // was a denied directory reported `complete`. "Resolved and confined like any
  // other" says the name is real; it does not say the winner is usable.
  const relative = '_bmad-output/loose/prd-bmad-2026-09-01';
  const denied = join(await makeTree(t, [
    { dir: '_bmad' },
    { dir: `${relative}/aaa` },
    { link: `${relative}/index.md`, to: `${relative}/aaa`, type: 'dir' },
  ]), '_bmad-output', 'loose', 'prd-bmad-2026-09-01', 'aaa');
  const root = denied.slice(0, denied.length - '/_bmad-output/loose/prd-bmad-2026-09-01/aaa'.length);

  const inventory = await whileDenied(denied, () =>
    takeInventory(new ConfinedReader(canonical(root))),
  );

  assert.deepEqual(
    inventory.aliases.map((alias) => `${alias.relative} restored=${String(alias.restored)}`),
    [`${relative}/index.md restored=false`],
  );
  assert.match(String(inventory.aliases[0]?.reason), /is not reported as present/);

  // The denied directory's own entry: the walk's state and stage are forwarded
  // onto the signal rather than being re-derived or defaulted. Unasserted, an
  // `if (entry.state !== 'absent') return { state: 'present' }` inserted ahead
  // of the forward left the suite green — a directory the pass could not
  // enumerate reported readable content.
  const deniedRead = failedRead(inventory, `${relative}/aaa`);
  assert.equal(deniedRead.state, 'unreadable');
  assert.equal(deniedRead.stage, 'read-directory');
  const deniedEntry = entryFor(inventory, `${relative}/aaa`).entry;
  assert.notEqual(deniedEntry.state, 'present');
  if (deniedEntry.state !== 'present') {
    assert.equal(deniedRead.reason, deniedEntry.reason, 'the reason is carried, not composed');
  }
  assert.equal(
    entryFor(inventory, `${relative}/aaa`).interpretation,
    undefined,
    'a directory the pass could not read is not an interpretation of anything',
  );

  const entry = inventory.entries.find((each) => each.entry.relative === relative);
  assert.ok(entry !== undefined);
  assert.deepEqual(entry.children, { available: true, names: [] }, 'neither name is a signal');
  assert.notEqual(entry.identity.outcome, 'ambiguous', 'no sharded reading is invented from it');
  assert.deepEqual(documentsOf(entry.composition), [], 'and no document over a denied directory');

  // The denied directory is still reported, with its own state — nothing
  // disappears, which is the rule the restore must not be allowed to bend.
  const inner = inventory.entries.find((each) => each.entry.relative === `${relative}/aaa`);
  assert.ok(inner !== undefined);
  assert.equal(inner.entry.state, 'unreadable');
});

test('a suppressed directory alias is not restored, even when it is named index.md', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('symlinks are unavailable here, so an alias cannot be built');
    return;
  }
  // `WalkSuppression.kind` is carried precisely so this decision can be made
  // where the fact is known. The listing being names-only is a limitation the
  // model states; it is not a licence for the pass to add a name it knows is a
  // directory, which would flip the parent to sharded with a directory as a
  // part.
  const relative = '_bmad-output/loose/prd-bmad-2026-09-01';
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: `${relative}/aaa/one.md`, text: '# o\n' },
    { link: `${relative}/index.md`, to: `${relative}/aaa`, type: 'dir' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  assert.deepEqual(
    inventory.aliases.map((alias) => `${alias.relative} restored=${String(alias.restored)}`),
    [`${relative}/index.md restored=false`],
  );
  assert.match(String(inventory.aliases[0]?.reason), /a directory is not a document or a part of one/);

  const entry = inventory.entries.find((each) => each.entry.relative === relative);
  assert.ok(entry !== undefined);
  assert.deepEqual(entry.children, { available: true, names: ['aaa'] });
  assert.equal(entry.identity.outcome, 'identified');
  assert.equal(entry.identity.outcome === 'identified' ? entry.identity.shape : null, 'run-folder');
  assert.deepEqual(documentsOf(entry.composition), []);
});

test('a suppression the walk could not record leaves its listing unavailable, not short', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('symlinks are unavailable here, so aliases cannot be built');
    return;
  }
  // Finding 1's fixture, and the reason the cap is not allowed to be quiet: the
  // restore can only put back names the walk recorded, so past
  // `MAX_RECORDED_SUPPRESSIONS` an aliased `index.md` in the overflow was
  // dropped exactly as it was before this story — `identified`, `certain` run
  // folder, no document, `parts` claiming to be complete over a listing 24
  // names short. The walk's per-directory tally is what makes the shortfall
  // knowable, and an unknowable name makes the listing unavailable rather than
  // authoritative.
  const relative = '_bmad-output/loose/prd-bmad-2026-09-01';
  const aliases = MAX_RECORDED_SUPPRESSIONS + 24;
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: `${relative}/aaa.md`, text: '# a\n' },
    // `index.md` sorts after every `b*` link, so it lands in the overflow.
    ...Array.from({ length: aliases }, (_unused, index) => ({
      link: `${relative}/b${String(index).padStart(4, '0')}.md`,
      to: `${relative}/aaa.md`,
      type: 'file' as const,
    })),
    { link: `${relative}/index.md`, to: `${relative}/aaa.md`, type: 'file' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  assert.equal(inventory.aliases.length, MAX_RECORDED_SUPPRESSIONS);
  assert.equal(inventory.suppressedNotRecorded, aliases + 1 - MAX_RECORDED_SUPPRESSIONS);
  assert.equal(
    inventory.aliases.some((alias) => alias.relative.endsWith('/index.md')),
    false,
    'the fixture must actually push the index into the overflow',
  );

  const entry = inventory.entries.find((each) => each.entry.relative === relative);
  assert.ok(entry !== undefined);
  assert.equal(entry.children.available, false, 'a listing short by unknowable names is unavailable');
  assert.match(
    entry.children.available ? '' : entry.children.reason,
    /could not be recorded individually/,
  );

  // So the sharded reading stays open rather than being refuted by a listing
  // the pass could not account for, and the parts say they are unknown.
  assert.equal(entry.identity.outcome, 'ambiguous');
  const document = documentsOf(entry.composition)[0];
  assert.equal(document?.shape, 'sharded-document');
  assert.equal(document?.parts.state, 'unavailable');

  // The same tree one alias below the cap restores everything and claims
  // nothing unknown, so a mutation that shrank the cap fails here too.
  const under = await makeTree(t, [
    { dir: '_bmad' },
    { file: `${relative}/aaa.md`, text: '# a\n' },
    ...Array.from({ length: MAX_RECORDED_SUPPRESSIONS - 1 }, (_unused, index) => ({
      link: `${relative}/b${String(index).padStart(4, '0')}.md`,
      to: `${relative}/aaa.md`,
      type: 'file' as const,
    })),
    { link: `${relative}/index.md`, to: `${relative}/aaa.md`, type: 'file' },
  ], 'bmad-dash-tree-under-');
  const restored = takeInventory(new ConfinedReader(canonical(under)));
  assert.equal(restored.suppressedNotRecorded, 0);
  const whole = restored.entries.find((each) => each.entry.relative === relative);
  assert.equal(whole?.children.available, true);
  assert.equal(
    whole?.children.available === true ? whole.children.names.includes('index.md') : false,
    true,
  );
});

test('an alias inside a directory a bound already stopped changes nothing about it', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('symlinks are unavailable here, so an alias cannot be built');
    return;
  }
  // Two shortenings at once, which is the combination neither row covered: the
  // entry budget cuts the listing short *and* a name in it was suppressed. The
  // listing is unavailable either way and one reason is reported, so the two
  // do not compound into a claim about which of them bit.
  const relative = '_bmad-output/loose/prd-bmad-2026-09-01';
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: `${relative}/aaa.md`, text: '# a\n' },
    { link: `${relative}/bbb.md`, to: `${relative}/aaa.md`, type: 'file' },
    { file: `${relative}/ccc.md`, text: '# c\n' },
    { file: `${relative}/index.md`, text: '# i\n' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)), {
    budget: { maxDepth: INVENTORY_BUDGET.maxDepth, maxEntries: 5 },
  });

  const entry = inventory.entries.find((each) => each.entry.relative === relative);
  assert.ok(entry !== undefined);
  assert.equal(entry.children.available, false);
  assert.equal(entry.identity.outcome, 'ambiguous', 'the sharded reading stays open');
  assert.equal(documentsOf(entry.composition)[0]?.parts.state, 'unavailable');
  assert.equal(inventory.complete, false);
});

test('every composition over this repository is complete, with no alias anywhere', async () => {
  // The real tree, which has no symlinks in its output folder and no directory
  // the budget cuts short — so every composition here is over a listing the
  // walk stood behind. A regression that made suppression or unavailability
  // routine would show up as a failure over the project's own artifacts.
  const inventory = repoInventory();
  assert.deepEqual(inventory.aliases, []);
  assert.equal(inventory.suppressedNotRecorded, 0);
  assert.equal(inventory.complete, true);

  for (const entry of inventory.entries) {
    for (const document of documentsOf(entry.composition)) {
      // The stricter claim, asserted once rather than as a `notEqual` and an
      // `ok` that say the same thing: every part list here is authoritative.
      assert.equal(document.parts.state, 'complete', entry.entry.relative);
      if (document.parts.state !== 'complete') continue;
      assert.ok(document.parts.paths.length >= 1, entry.entry.relative);
    }
  }

  // Every `.md` artifact in the tree is a whole document of exactly one part,
  // because there is no sharded document anywhere in this repository to measure
  // against — a stated limit of this story rather than an oversight, recorded
  // in `deferred-work.md`. Compared as *paths*, so a failure names the artifact
  // instead of dumping an inventory entry.
  const sharded = inventory.entries
    .filter((entry) =>
      documentsOf(entry.composition).some((document) => document.shape === 'sharded-document'),
    )
    .map((entry) => entry.entry.relative);
  assert.deepEqual(sharded, [], 'if a sharded document lands here, this story gains a real fixture');
});

// ---------------------------------------------------------------------------
// What could not be read or recognized — Story 1.9, one row per matrix line
//
// Readability is a **signal**, recorded beside the verdict and never inside it:
// every row below asserts both, because the defect this story closes was one
// value being present and honest (the identity) while the other did not exist
// at all. `assert.notEqual(readability.state, 'present')` appears deliberately
// often — it is the mutation that reports content nobody read as fine, which is
// the NFR-3 violation measured at this story's baseline.
// ---------------------------------------------------------------------------

/**
 * The readability of one entry, narrowed to the failing variant.
 *
 * The return type is the union member itself, not a widened `{state: string}`:
 * widening it would let a stage outside `ReadStage` satisfy every assertion
 * beneath it, in the tests for the story whose whole subject is a closed
 * vocabulary. `assert.ok` narrows, so no second guard is needed.
 */
function failedRead(
  inventory: Inventory,
  relative: string,
): Exclude<Readability, { readonly state: 'present' }> {
  const { readability } = entryFor(inventory, relative);
  assert.ok(readability.state !== 'present', `${relative} was reported readable`);
  return readability;
}

test('an undecodable file a level had to read is unreadable, at the decode stage', async (t) => {
  // Outside every artifact root, so level 2 actually asks for the text. The
  // decode is what fails — `readFileSync(path, 'utf8')` would have substituted
  // U+FFFD and reported success, which is why the reader decodes strictly.
  const root = await makeTree(t, PROJECT);
  await writeFile(join(root, '_bmad-output', 'prd.md'), Buffer.from([0xff, 0xfe, 0x00, 0x41]));
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  const read = failedRead(inventory, '_bmad-output/prd.md');
  assert.equal(read.state, 'unreadable');
  assert.equal(read.stage, 'decode', 'the stage names the read that failed, not the file');
  assert.match(read.reason, /UTF-8/, "the reason is the reader's own words, beside the typed pair");

  // And the identity verdict is exactly what Story 1.7 produces for this file:
  // this story records a second signal and re-derives nothing (AD-4).
  const verdict = verdictFor(inventory, '_bmad-output/prd.md');
  assert.deepEqual(
    verdict.attempted.map((attempt) => `${attempt.level}:${attempt.result}`),
    ['location:no-signal', 'frontmatter:unavailable', 'structure:unavailable', 'filename:resolved'],
  );
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'prd');
  assert.equal(verdict.outcome === 'identified' ? verdict.confidence : null, 'likely');
  assert.equal(inventory.complete, true, 'an unreadable file is a value, not an abort');
});

test('an undecodable file under an artifact root is unchecked, never present', async (t) => {
  // The measured defect, and this story's accepted limit in one row. Level 1
  // resolves this file's family from its location without opening it, so
  // nothing read the bytes: the honest report is `unchecked` — the tool saying
  // it did not look — rather than `present`, which claimed corrupt content was
  // fine, or `unreadable`, which would claim a read that never happened.
  const root = await makeTree(t, PROJECT);
  const under = join(root, '_bmad-output', 'planning-artifacts', 'prds', 'prd.md');
  await writeFile(under, Buffer.from([0xff, 0xfe, 0x00, 0x41]));

  const reader = new ConfinedReader(canonical(root));
  const real = reader.readText.bind(reader);
  const opened: string[] = [];
  reader.readText = (path: string) => {
    opened.push(path);
    return real(path);
  };
  const inventory = takeInventory(reader);

  const read = failedRead(inventory, '_bmad-output/planning-artifacts/prds/prd.md');
  assert.equal(read.state, 'unchecked');
  assert.equal('stage' in read, false, 'nothing was attempted, so there is no stage to name');
  assert.match(read.reason, /identification never opened it/);
  assert.equal(
    opened.some((path) => path.endsWith('prd.md') && path.includes('prds')),
    false,
    'the file under a root must never be opened — that is the trade this limit comes from',
  );

  // Nothing else in the entry claims the content is readable either: the
  // verdict resolved at level 1 and says so, and its only attempt is that one.
  const verdict = verdictFor(inventory, '_bmad-output/planning-artifacts/prds/prd.md');
  assert.deepEqual(
    verdict.attempted.map((attempt) => `${attempt.level}:${attempt.result}`),
    ['location:resolved'],
  );
  assert.equal(verdict.outcome === 'identified' ? verdict.family : null, 'prd');
  assert.equal(verdict.outcome === 'identified' ? verdict.confidence : null, 'certain');
});

test('a file over the read limit is unreadable, naming the size and the limit', async (t) => {
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/notes.md', text: '# Notes\n' },
  ]);
  await writeFile(join(root, '_bmad-output', 'loose', 'huge.md'), Buffer.alloc(MAX_READ_BYTES + 1, 0x61));
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  const read = failedRead(inventory, '_bmad-output/loose/huge.md');
  assert.equal(read.state, 'unreadable');
  assert.equal(read.stage, 'examine', 'refused before a byte was read, which is the point of the limit');
  assert.match(read.reason, new RegExp(String(MAX_READ_BYTES)));
  // Listed, never omitted, and the sibling is untouched.
  assert.equal(paths(inventory).includes('_bmad-output/loose/huge.md'), true);
  assert.equal(entryFor(inventory, '_bmad-output/loose/notes.md').readability.state, 'present');
});

test('a fifo named like a document is unreadable and does not block the pass', async (t) => {
  if (process.platform === 'win32') {
    t.skip('no fifos on Windows');
    return;
  }
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/real.md', text: '# Real\n' },
  ]);
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync('mkfifo', [join(root, '_bmad-output', 'loose', 'notes.md')]);
  } catch {
    t.skip('no mkfifo on this box; nothing to assert');
    return;
  }

  // If this hangs, the pass opened it: `readFileSync` on a fifo waits for a
  // writer that never comes, and in the server that means the request never
  // returns and the process never exits.
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  const read = failedRead(inventory, '_bmad-output/loose/notes.md');
  assert.equal(read.state, 'unreadable');
  assert.equal(read.stage, 'examine', 'refused on its kind, before anything opened it');
  assert.match(read.reason, /not a regular file/);
  assert.equal(entryFor(inventory, '_bmad-output/loose/notes.md').entry.state, 'present');
  assert.equal(entryFor(inventory, '_bmad-output/loose/real.md').readability.state, 'present');
});

test('one malformed artifact leaves every sibling intact and the pass complete', async (t) => {
  // NFR-4 through the composition: a single unparseable artifact degrades to an
  // explicit state for that artifact only. Asserted over *every* other entry
  // rather than one spot check, because "the rest of the tool remains usable"
  // is a claim about all of them.
  const root = await makeTree(t, PROJECT);
  await writeFile(join(root, '_bmad-output', 'broken.md'), Buffer.from([0xc3, 0x28, 0xa0, 0xa1]));
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  assert.equal(failedRead(inventory, '_bmad-output/broken.md').state, 'unreadable');
  assert.equal(inventory.complete, true, 'one bad artifact must not make the pass incomplete');
  assert.deepEqual(inventory.truncations, []);

  for (const entry of inventory.entries) {
    assert.equal(entry.entry.state, 'present', entry.entry.relative);
    if (entry.entry.relative === '_bmad-output/broken.md') continue;
    if (entry.entry.relative === '_bmad-output/unremarkable.txt') continue;
    if (['_bmad-output', '_bmad-output/planning-artifacts'].includes(entry.entry.relative)) continue;
    assert.notEqual(entry.identity.outcome, 'unidentified', entry.entry.relative);
    assert.notEqual(
      entry.readability.state,
      'unreadable',
      `${entry.entry.relative} was made unreadable by a sibling`,
    );
  }
});

test('a frontmatter block that is never closed is unavailable, not an empty success', async (t) => {
  // AD-13's rule applied where this story can apply it: a parser reading a
  // convention-defined source validates that it extracted something, and an
  // empty extraction is never returned as a successful empty result. The block
  // opens, declares `type: prd`, and never closes — so the declaration is not
  // authoritative, and level 2 says it could not run rather than reporting no
  // declaration over one that is there.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/opened.md', text: '---\ntype: prd\n\n# Something\n' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  // The bytes read perfectly well: this is an interpretation failure, not a
  // readability one, and keeping the two apart is the point of the two fields.
  assert.equal(entryFor(inventory, '_bmad-output/loose/opened.md').readability.state, 'present');

  const verdict = verdictFor(inventory, '_bmad-output/loose/opened.md');
  const frontmatter = verdict.attempted.find((attempt) => attempt.level === 'frontmatter');
  assert.equal(frontmatter?.result, 'unavailable');
  assert.match(String(frontmatter?.reason), /never closed/);
  assert.equal(verdict.outcome, 'unidentified', 'an unclosed block must not resolve a family');
  assert.equal(
    entryFor(inventory, '_bmad-output/loose/opened.md').interpretation,
    'unidentified',
  );
});

test('an artifact truncated mid-write is reported, never presented as valid', async (t) => {
  // NFR-3's own words: BMAD agents write these files while the tool reads them,
  // and a partially written one must be handled without crashing and without
  // presenting corrupt data as valid. The cut lands inside a multi-byte
  // character, which is what a real truncation does — the frontmatter above it
  // is intact and is still not treated as a declaration, because the file it
  // came from could not be decoded.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/other.md', text: '# Other\n' },
  ]);
  await writeFile(
    join(root, '_bmad-output', 'loose', 'partial.md'),
    Buffer.concat([
      Buffer.from('---\ntype: prd\n---\n\n# Product Requirements\n\ncaf', 'utf8'),
      Buffer.from([0xc3]),
    ]),
  );
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  const read = failedRead(inventory, '_bmad-output/loose/partial.md');
  assert.equal(read.state, 'unreadable');
  assert.equal(read.stage, 'decode');

  const verdict = verdictFor(inventory, '_bmad-output/loose/partial.md');
  assert.equal(verdict.outcome, 'unidentified', 'a file nobody could decode must claim no family');
  assert.deepEqual(
    verdict.attempted.map((attempt) => attempt.result),
    ['no-signal', 'unavailable', 'unavailable', 'no-signal'],
  );
  assert.equal(entryFor(inventory, '_bmad-output/loose/other.md').readability.state, 'present');
  assert.equal(inventory.complete, true);
});

test('the state and the stage stay typed, and no reason is a sentence about them', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('symlinks are unavailable here, so a dangling entry cannot be built');
    return;
  }
  // The pin against the flattening this story removed. `unusable` used to
  // compose `${state} at the ${stage} stage: ${reason}` — three values in one
  // string nothing can branch on — while the state and the stage were already
  // typed on the walk entry. Both are now on the readability signal too, in
  // AD-8's vocabulary, and the reason is the platform's own words and only
  // those.
  const { inventory } = await inventoried(t, [
    { link: '_bmad-output/loose/gone.md', to: '_bmad-output/nowhere.md', type: 'file' },
  ]);
  const entry = entryFor(inventory, '_bmad-output/loose/gone.md');
  assert.equal(entry.entry.state, 'absent');
  // `assert.equal` narrows the state, and with it the entry, so `reason` below
  // is reachable without a second guard the typechecker would call impossible.
  const read = failedRead(inventory, '_bmad-output/loose/gone.md');
  assert.equal(read.state, 'absent', "the walk's own state, forwarded rather than re-derived");
  assert.equal(read.stage, 'resolve');
  assert.equal(read.reason, entry.entry.reason, 'the reason is carried, not composed');

  for (const attempt of entry.identity.attempted) {
    if (attempt.reason === undefined) continue;
    assert.equal(attempt.reason, entry.entry.reason, 'a level reason is the raw one');
    assert.doesNotMatch(
      attempt.reason,
      /at the \w+ stage/,
      'the typed state and stage must not be folded back into prose',
    );
  }
});

test('FR-12 and FR-69 arrive as distinct states on the entry', async (t) => {
  const { inventory } = await inventoried(t, [
    // Recognized by name, with no shape anything can interpret: a directory of
    // markdown with no `index.md` and no run-folder signal.
    { file: '_bmad-output/loose/research/a.md', text: '# Notes\n' },
  ]);

  const uninterpreted = entryFor(inventory, '_bmad-output/loose/research');
  assert.equal(uninterpreted.identity.outcome, 'identified');
  assert.equal(uninterpreted.interpretation, 'present-but-uninterpreted');

  const unidentified = entryFor(inventory, '_bmad-output/unremarkable.txt');
  assert.equal(unidentified.identity.outcome, 'unidentified');
  assert.equal(unidentified.interpretation, 'unidentified');
  assert.deepEqual(
    unidentified.identity.attempted.map((attempt) => attempt.level),
    ['location', 'frontmatter', 'structure', 'filename'],
    "FR-69 names the levels attempted, and that half is the verdict's own",
  );

  const interpreted = entryFor(inventory, '_bmad-output/specs/spec-bmad-dash/SPEC.md');
  assert.equal(interpreted.interpretation, 'interpreted');

  // Distinct, not two spellings of one state: no entry is both, and the two
  // rows above disagree with each other.
  assert.notEqual(uninterpreted.interpretation, unidentified.interpretation);
});

test('over this repository, only what a level read is reported readable', async () => {
  // The accepted limit and the fix, both measured against the only real BMAD
  // project to hand. Every entry level 1 resolved is `unchecked` — nothing
  // opened it, and nothing claims otherwise — and the entries that *are*
  // `present` are exactly the ones a later level had to read.
  const inventory = repoInventory();

  const readable: string[] = [];
  for (const entry of inventory.entries) {
    const { identity, readability } = entry;
    // Deliberately **not** "nothing here is unreadable": that is a claim about
    // what happens to be committed, and it breaks the day someone adds a
    // binary or an over-limit file under `_bmad-output`. The property that is
    // actually wanted is that an unreadable one says where and why.
    if (readability.state !== 'present' && readability.state !== 'unchecked') {
      assert.notEqual(readability.stage, undefined, entry.entry.relative);
      assert.ok(readability.reason.length > 0, entry.entry.relative);
    }
    if (identity.outcome !== 'unidentified' && identity.resolvedAt === 'location') {
      assert.equal(
        readability.state,
        'unchecked',
        `${entry.entry.relative} claims a readability nothing established`,
      );
      continue;
    }
    if (readability.state === 'present') readable.push(entry.entry.relative);
  }

  // Not vacuous from either side: some artifacts here really are read, and
  // `epics.md` is one — it sits directly under BMAD's planning layout rather
  // than inside a family root, so level 1 finds nothing and level 2 opens it.
  assert.ok(readable.length > 0, 'no artifact in the real tree was read at all');
  assert.ok(
    readable.includes('_bmad-output/planning-artifacts/epics.md'),
    `expected epics.md among the artifacts actually read: ${readable.join(', ')}`,
  );

  // And every interpretation over the real tree is one of the three, with the
  // layout directories the only rows FR-69 applies to — the same three the
  // family assertion above enumerates, arrived at from the other side.
  const byState = new Map<string, string[]>();
  for (const entry of inventory.entries) {
    // Every entry in this tree is `present`, so every one has an
    // interpretation; a `?? 'none'` bucket would hide it if that stopped being
    // true, so the absence is asserted instead.
    assert.notEqual(entry.interpretation, undefined, entry.entry.relative);
    const state = entry.interpretation ?? 'none';
    const held = byState.get(state) ?? [];
    held.push(entry.entry.relative);
    byState.set(state, held);
    // The pairing, checked rather than trusted: `interpretation` is a cached
    // derivation of `identity` sitting beside it, and nothing else would notice
    // the two drifting apart.
    assert.equal(state, interpret(entry.identity), entry.entry.relative);
  }
  assert.deepEqual(
    (byState.get('unidentified') ?? []).sort(),
    ['_bmad-output', '_bmad-output/implementation-artifacts', '_bmad-output/planning-artifacts'],
  );
});

test('an escaping link and a denied directory forward the walk state onto the signal', async (t) => {
  if (!(await symlinksAvailable()) || !deniableDirectories()) {
    t.skip('needs symlinks and a non-root POSIX user');
    return;
  }
  // Two of the three non-present states, which the dangling-file row above
  // does not reach: it pins `absent`/`resolve` alone, so inserting
  // `if (entry.state !== 'absent') return { state: 'present' };` ahead of the
  // forward left the suite green — an escaping link and an unreadable
  // directory both reporting readable content.
  const outside = await makeScratchDir(t, 'bmad-dash-inventory-outside-');
  await writeFile(join(outside, 'secret.md'), '# not yours\n');

  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/real.md', text: '# Real\n' },
    { dir: '_bmad-output/loose/denied' },
    { link: '_bmad-output/loose/away.md', to: join(outside, 'secret.md'), type: 'file' },
  ]);
  const inventory = await whileDenied(join(root, '_bmad-output', 'loose', 'denied'), () =>
    takeInventory(new ConfinedReader(canonical(root))),
  );

  const escaped = failedRead(inventory, '_bmad-output/loose/away.md');
  assert.equal(escaped.state, 'unchecked', 'a refused path was never read, and never will be');
  assert.equal(escaped.stage, 'confinement');
  assert.match(escaped.reason, /outside the project/);
  assert.equal(entryFor(inventory, '_bmad-output/loose/away.md').interpretation, undefined);

  const denied = failedRead(inventory, '_bmad-output/loose/denied');
  assert.equal(denied.state, 'unreadable');
  assert.equal(denied.stage, 'read-directory');
  assert.equal(entryFor(inventory, '_bmad-output/loose/denied').interpretation, undefined);

  // Neither one stops the pass, and the sibling is read normally.
  assert.equal(entryFor(inventory, '_bmad-output/loose/real.md').readability.state, 'present');
  assert.equal(inventory.complete, false, 'entries that are not present are not a complete pass');
});

test('a file denied to the process is unreadable at the read stage', async (t) => {
  if (!deniableDirectories()) {
    t.skip('needs a non-root POSIX user: root is not denied by a 0o000 mode');
    return;
  }
  // The most ordinary unreadable artifact there is, and the only case that
  // reaches `stage: 'read'` — the stat succeeds, so everything `examine` asks
  // about is answered, and the open is what fails. Unasserted, changing that
  // stage to `examine` left the suite green: every other stage assertion in
  // this story lands on `examine` or `decode`.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/readable.md', text: '# Readable\n' },
    { file: '_bmad-output/loose/locked.md', text: '# Locked\n' },
  ]);
  const inventory = await whileDenied(join(root, '_bmad-output', 'loose', 'locked.md'), () =>
    takeInventory(new ConfinedReader(canonical(root))),
  );

  const read = failedRead(inventory, '_bmad-output/loose/locked.md');
  assert.equal(read.state, 'unreadable', 'a file that is there and cannot be opened is not absent');
  assert.equal(read.stage, 'read');
  assert.match(read.reason, /permission|EACCES/i);

  // Present as an entry, listed, and identified by what needs no content — a
  // denied file is a value, not an omission and not an abort.
  assert.equal(entryFor(inventory, '_bmad-output/loose/locked.md').entry.state, 'present');
  assert.equal(entryFor(inventory, '_bmad-output/loose/readable.md').readability.state, 'present');
  assert.equal(inventory.complete, true);
});

test('an artifact that is not there is not present-but-uninterpreted', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('symlinks are unavailable here, so a dangling entry cannot be built');
    return;
  }
  // The defect this guard closes, measured: a dangling `gone.md` under an
  // artifact root came back `walk: absent | readability: absent |
  // interpretation: present-but-uninterpreted` — a term whose first word is
  // *present*, quoted verbatim from FR-12 in this project's own module, said
  // of an artifact the same entry reports as not there. Both directions are
  // asserted, because the unconditional version was satisfied by any value at
  // all: nothing observed it.
  const { inventory } = await inventoried(t, [
    {
      link: '_bmad-output/specs/spec-bmad-dash/gone.md',
      to: '_bmad-output/nowhere.md',
      type: 'file',
    },
    { file: '_bmad-output/loose/research/a.md', text: '# Notes\n' },
  ]);

  const missing = entryFor(inventory, '_bmad-output/specs/spec-bmad-dash/gone.md');
  assert.equal(missing.entry.state, 'absent');
  assert.equal(missing.identity.outcome, 'identified', 'location needs no content, so it answers');
  assert.equal(missing.interpretation, undefined, 'nothing is claimed about an artifact not there');

  // The other direction: a present entry does carry one, and it is the state
  // the rule produces for its verdict rather than whatever was convenient.
  const uninterpreted = entryFor(inventory, '_bmad-output/loose/research');
  assert.equal(uninterpreted.entry.state, 'present');
  assert.equal(uninterpreted.interpretation, 'present-but-uninterpreted');
  assert.equal(uninterpreted.interpretation, interpret(uninterpreted.identity));

  const identified = entryFor(inventory, '_bmad-output/specs/spec-bmad-dash/SPEC.md');
  assert.equal(identified.interpretation, 'interpreted');
});

test('a file that vanishes between the walk and the read is absent, not unreadable', async (t) => {
  // One physical fact, one answer, asserted through the whole pass rather than
  // only at the adapter. The pass used to hardcode `unreadable` for every read
  // failure, so this file — gone by the time it was opened — reported
  // `unreadable` while the identical condition noticed one step earlier, by the
  // walk, reported `absent`. Which state a consumer saw depended on who
  // noticed first, which is exactly what a closed vocabulary is meant to stop.
  //
  // Deterministic rather than a race: the walk finishes before any read
  // happens, so deleting the file from inside the first read of it reproduces
  // the window exactly.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/staying.md', text: '# Staying\n' },
    { file: '_bmad-output/loose/vanishing.md', text: '# Vanishing\n' },
  ]);
  const reader = new ConfinedReader(canonical(root));
  const real = reader.readText.bind(reader);
  let removed = false;
  reader.readText = (path: string) => {
    if (!removed && path.endsWith(`vanishing.md`)) {
      rmSync(path);
      removed = true;
    }
    return real(path);
  };

  const inventory = takeInventory(reader);
  assert.equal(removed, true, 'the fixture never opened the file it was built around');

  const read = failedRead(inventory, '_bmad-output/loose/vanishing.md');
  assert.equal(read.state, 'absent', "the reader's own state, forwarded rather than hardcoded");
  assert.equal(read.stage, 'resolve', 'the stat never answered, so nothing was examined');
  assert.match(read.reason, /ENOENT|no such file/i);

  // It is still an entry — the walk saw it, so it is reported — and the pass
  // finished with the sibling read normally.
  assert.equal(entryFor(inventory, '_bmad-output/loose/vanishing.md').entry.state, 'present');
  assert.equal(entryFor(inventory, '_bmad-output/loose/staying.md').readability.state, 'present');
});

test('a directory says its listing was read, not that nothing was', async (t) => {
  // `UNREAD`'s reason — "nothing read it" — is false of a directory: its
  // listing is its content, as the `read-directory` stage says, and the
  // listing usually was read. Two `unchecked` signals with two true reasons.
  const { inventory } = await inventoried(t);

  const directory = entryFor(inventory, '_bmad-output/specs/spec-bmad-dash');
  assert.deepEqual(directory.children, { available: true, names: ['SPEC.md'] });
  const listing = failedRead(inventory, '_bmad-output/specs/spec-bmad-dash');
  assert.equal(listing.state, 'unchecked', 'a directory holds no text, so none was read');
  assert.doesNotMatch(
    listing.reason,
    /identification never opened it/,
    'its listing was read, and this said so',
  );
  assert.match(listing.reason, /listing/);

  // And the file that genuinely was not read says the other thing.
  const unopened = failedRead(inventory, '_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md');
  assert.equal(unopened.state, 'unchecked');
  const reasonOf = (signal: Readability): string => (signal.state === 'present' ? '' : signal.reason);
  assert.equal(unopened.reason, reasonOf(UNREAD), 'the file signal is the shared unread one');
});

// ---------------------------------------------------------------------------
// Freezing: AD-3's "immutable", made real
// ---------------------------------------------------------------------------

test('the returned inventory is frozen by construction, deeply', async (t) => {
  // Measured before this story: `Object.isFrozen(inventory)` was `false`, and
  // `skipped` was handed out as the very array `skipPolicy` pushed into — a
  // caller holding a reference to either could mutate the snapshot every other
  // reader of it was still relying on. This asserts the fix over a tree that
  // produces a non-empty directory listing, so `children.names` — sorted in
  // place today — is exercised too.
  //
  // Every attempt asserts `TypeError` rather than merely that *something*
  // threw: a frozen array's `push` throws `TypeError`, and so does an
  // assignment to a frozen property under the module semantics this suite runs
  // under. A bare `assert.throws` would also be satisfied by a fixture that
  // threw for an unrelated reason — a missing entry, say — which is how a
  // freeze test passes over a snapshot nothing froze.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/loose/one.md', text: '# One\n' },
    { file: '_bmad-output/loose/two.md', text: '# Two\n' },
  ]);
  const inventory = takeInventory(new ConfinedReader(canonical(root)));

  assert.ok(Object.isFrozen(inventory), 'the returned Inventory itself must be frozen');
  assert.throws(() => {
    (inventory as { root: unknown }).root = 'elsewhere';
  }, TypeError);

  assert.ok(Object.isFrozen(inventory.entries));
  assert.throws(() => {
    (inventory.entries as InventoryEntry[]).push(inventory.entries[0]!);
  }, TypeError);
  assert.throws(() => {
    (inventory.entries as unknown as Record<number, unknown>)[0] = {};
  }, TypeError);

  assert.ok(Object.isFrozen(inventory.skipped));
  assert.throws(() => {
    (inventory.skipped as Skip[]).push({ relative: 'x', reason: 'y' });
  }, TypeError);

  assert.ok(Object.isFrozen(inventory.aliases));
  assert.throws(() => {
    (inventory.aliases as Alias[]).push({
      relative: 'x',
      reportedAt: 'y',
      restored: false,
      reason: 'z',
    });
  }, TypeError);

  assert.ok(Object.isFrozen(inventory.truncations));
  assert.throws(() => {
    (inventory.truncations as WalkTruncation[]).push({ limit: 'entries', at: '.', reason: 'z' });
  }, TypeError);

  // The array `skipPolicy` itself pushed into, escaping live before this
  // story: pushing into it directly must throw exactly as `inventory.skipped`
  // above does — proving the freeze reaches the *same* array rather than a
  // copy `inventory.skipped` happens to also be frozen.
  const directory = inventory.entries.find(
    (entry) => entry.children.available && entry.children.names.length > 0,
  );
  assert.ok(directory !== undefined, 'the fixture must produce a non-empty directory listing');
  // Narrowed by `assert.fail`, which returns `never`, rather than by an `if`
  // guarding the assertions: `assert.ok(x); if (x) { … }` lets the block go
  // vacuous, which is the same failure mode this test asserts `TypeError` to
  // avoid one paragraph up.
  const children = directory.children;
  if (!children.available) assert.fail('the fixture must produce an available listing');
  assert.ok(Object.isFrozen(children.names));
  assert.throws(() => {
    (children.names as string[]).push('nope');
  }, TypeError);

  // And one nested field for good measure — an entry's own verdict, reached
  // two levels down from the array `entries` holds.
  assert.ok(Object.isFrozen(directory.identity));
});

test('the shared domain singletons the freeze walks are already frozen where they are defined', () => {
  // `deepFreeze`'s safety argument rests on this and nothing asserted it: the
  // recursion reaches `UNREAD` and `LISTING_NOT_TEXT` once per unread entry —
  // the *same* objects every other reader of the domain holds — so freezing
  // the graph is only safe because they are frozen at their definition rather
  // than because nothing here is shared. If either stopped being frozen there,
  // the pass would start freezing a module singleton as a side effect.
  assert.ok(Object.isFrozen(UNREAD), 'UNREAD is frozen at its definition');
  assert.ok(Object.isFrozen(LISTING_NOT_TEXT), 'LISTING_NOT_TEXT is frozen at its definition');
});

test('deepFreeze freezes the branches a real tree cannot produce, and runs nothing to do it', () => {
  // **Why this exists.** `deepFreeze` is reachable in production only through
  // `takeInventory` over a real filesystem, which cannot produce a getter, a
  // symbol-keyed branch, a non-enumerable field or a cycle on demand — so
  // every mechanism its doc block promises was unreachable by any assertion,
  // and collapsing its body to `for (const child of Object.values(value))`
  // left the whole suite green while losing three of the four.
  let reads = 0;
  const symbolKey = Symbol('branch');
  const throughGetter = { deep: [1] };
  const subject: Record<string | symbol, unknown> = {
    plain: { deep: [1] },
    [symbolKey]: { deep: [1] },
  };
  Object.defineProperty(subject, 'shifting', {
    get: () => {
      reads += 1;
      return throughGetter;
    },
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(subject, 'quiet', {
    value: { deep: [1] },
    enumerable: false,
    configurable: true,
  });

  deepFreeze(subject);

  assert.equal(reads, 0, 'an accessor is skipped, not invoked');
  assert.equal(Object.isFrozen(throughGetter), false, 'so what it would have returned is untouched');
  assert.ok(Object.isFrozen(subject.plain), 'an ordinary branch is frozen');
  assert.ok(Object.isFrozen(subject[symbolKey]), 'a symbol-keyed branch is frozen');
  assert.ok(Object.isFrozen(subject.quiet), 'a non-enumerable branch is frozen');
  assert.ok(
    Object.isFrozen((subject.plain as { deep: unknown[] }).deep),
    'and the recursion reaches the array under it',
  );

  // A repeated reference terminates rather than recursing forever — the guard
  // is what makes the walk safe over a graph nobody has audited for cycles.
  const cyclic: { self?: unknown; leaf: number[] } = { leaf: [1] };
  cyclic.self = cyclic;
  assert.equal(deepFreeze(cyclic), cyclic, 'a cycle returns rather than overflowing the stack');
  assert.ok(Object.isFrozen(cyclic.leaf));

  // And a keyed collection is refused rather than reported frozen while
  // staying mutable through `set`/`add`.
  assert.throws(() => deepFreeze({ counts: new Map([['a', 1]]) }), /Object\.freeze does not seal/);
  assert.throws(() => deepFreeze({ seen: new Set(['a']) }), /Object\.freeze does not seal/);
});

test('freezing surfaces nothing: the pass over this repository still projects and renders', () => {
  // The code map's own prediction: nothing in `src/` mutates these arrays
  // today, so freezing them should surface nothing — and if it throws, that is
  // a finding.
  //
  // **Run through the consumers, not only through `takeInventory`.** An
  // in-place sort or a `push` on an escaping array would throw where the array
  // is *used*, not where it was frozen, so a test that only took the pass
  // would report a clean freeze over a tool that could no longer draw a page.
  // The projection and the render are every consumer the snapshot has.
  const inventory = repoInventory();
  assert.ok(Object.isFrozen(inventory));
  assert.ok(inventory.entries.length > 0, 'the pass must still find this repository’s own artifacts');

  const view = projectInventory(inventory);
  assert.ok(view.artifactCount > 0, 'the projection must still place rows over a frozen snapshot');
  const html = renderPage(toPlatform(inventory.root), view);
  assert.ok(html.includes('<!doctype html>'), 'and the page must still render from it');
});
