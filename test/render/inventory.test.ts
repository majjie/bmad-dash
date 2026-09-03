/**
 * The inventory surface, held to the two contracts it sits on.
 *
 * The first is the string index. UX-DR17 requires its wording verbatim, and a
 * constant in source that merely *happens* to match is not that — it is a
 * second copy of the same belief, free to drift the moment either side is
 * edited. So every sentence this surface can show is parsed out of
 * `EXPERIENCE.md`'s own table, and every *state word* out of the domain table
 * that owns the vocabulary. Four `deferred-work.md` entries said in advance
 * that a surface rendering these states without reading those tables would be
 * a finding about this story; this file is what makes that checkable.
 *
 * The second is that nothing disappears from the view. That is the whole point
 * of the inventory, so it is asserted end to end against **this repository** —
 * the pass, the projection and the render composed — rather than only over
 * fixtures: every path the pass reported must appear on the page.
 *
 * Every row of the spec's I/O matrix has a named test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inventoryTiles,
  AMBIGUOUS_RUN_OR_SHARDED,
  ARTIFACTS_TILE_LABEL,
  BELOW_CERTAIN,
  FAMILY_EMPTY,
  NO_DATE_IN_NAME,
  NO_SPRINT_TRACKING,
  PROJECT_EMPTY,
  REUSE_ACCIDENTAL,
  REUSE_DELIBERATE,
  RUN_MAY_HOLD_SEVERAL,
  SCAN_FINISHED,
  SCAN_STOPPED,
  SCAN_TILE_LABEL,
  SPRINT_UNAVAILABLE,
  STORY_LOCATION_IN_TREE,
  UNIDENTIFIED,
  UNINTERPRETED,
  UNPLACED_TILE_LABEL,
  allLevelsTried,
  ALIAS_REPORT,
  CONTENT_SIGNAL_LABEL,
  SCAN_SCOPE,
  STAGE_SIGNAL_LABEL,
  type ArtifactRow,
  type InventoryView,
  type StoryLocationReport,
} from '../../src/render/inventory.ts';
import { tileGrid } from '../../src/render/components.ts';
import { fillIndexString } from '../../src/render/html.ts';
import {
  CONFIDENCE_LABELS,
  FAMILIES,
  FAMILY_LABELS,
  LEVELS,
  LEVEL_LABELS,
  SHAPE_LABELS,
} from '../../src/domain/identity.ts';
import { SIGNAL_LABELS, SIGNAL_STATES } from '../../src/domain/signal.ts';
import {
  LOCATION_STATES,
  OUT_OF_TREE_STRING,
  outOfTreeReport,
} from '../../src/domain/sprint.ts';
import { OUTPUT_DIRECTORY, takeInventory } from '../../src/cli/inventory.ts';
import { projectInventory } from '../../src/cli/index.ts';
import { ConfinedReader } from '../../src/adapters/fs/read.ts';
import { canonical, toPlatform } from '../../src/adapters/fs/paths.ts';
import { EMPTY_INVENTORY, observeRun } from '../support/cli.ts';
import { makeTree, symlinksAvailable } from '../support/tree.ts';
import {
  AMBIGUOUS_BOTH_ROW,
  CERTAIN_ROW,
  FULL_INVENTORY_VIEW,
  HOSTILE_NAME,
  HOSTILE_PATH,
  UNIDENTIFIED_ROW,
  UNINTERPRETED_ROW,
} from '../support/inventory.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const EXPERIENCE_PATH = join(
  REPO_ROOT,
  '_bmad-output',
  'planning-artifacts',
  'ux-designs',
  'ux-bmad-2026-08-28',
  'EXPERIENCE.md',
);

/** The rendered surface, as the page composes it. */
function render(view: InventoryView): string {
  return tileGrid(inventoryTiles(view));
}

/** A view holding exactly the rows given, all under one family. */
function viewOf(view: Partial<InventoryView> & Pick<InventoryView, 'groups'>): InventoryView {
  return {
    complete: view.complete ?? true,
    artifactCount:
      view.artifactCount ?? view.groups.reduce((total, group) => total + group.rows.length, 0),
    namesLeftOut: view.namesLeftOut ?? 0,
    aliases: view.aliases ?? [],
    groups: view.groups,
  };
}

/**
 * A view whose story family carries `note` — alongside one ordinary artifact.
 *
 * The filler row is not padding: with no rows anywhere the surface renders the
 * empty-project sentence and nothing else, which is the right answer for a
 * project with no artifacts and the wrong fixture for a location report. A
 * story location comes out of a `sprint-status.yaml`, which is itself an
 * artifact, so a project that has one always has a row.
 */
function withStoryNote(report: StoryLocationReport): InventoryView {
  return viewOf({
    groups: [
      { family: 'sprint-tracking', rows: [CERTAIN_ROW], notes: [] },
      { family: 'story', rows: [], notes: [{ kind: 'story-location', report }] },
    ],
  });
}

// ---------------------------------------------------------------------------
// The string index is read, not copied
// ---------------------------------------------------------------------------

/**
 * The load-bearing string index, as rows.
 *
 * Scoped to the one table whose header is `| Situation | Says |`, so a row
 * added elsewhere in the document cannot satisfy any assertion below — the same
 * scoping `test/domain/signal.test.ts`, `test/render/chrome.test.ts` and
 * `test/cli/suggest.test.ts` use, and for the same reason.
 */
async function indexRows(): Promise<ReadonlyMap<string, string>> {
  const experience = await readFile(EXPERIENCE_PATH, 'utf8');
  const table = /\|\s*Situation\s*\|\s*Says\s*\|([\s\S]*?)\n\n/.exec(experience)?.[1];
  assert.ok(table !== undefined, 'EXPERIENCE.md must carry the load-bearing string index table');
  const rows = new Map<string, string>();
  for (const row of (table ?? '').matchAll(/\|([^|`]+)\|\s*`([^`]+)`\s*\|/g)) {
    rows.set((row[1] ?? '').trim(), row[2] ?? '');
  }
  assert.ok(rows.size > 20, `the index parsed to ${String(rows.size)} rows, which cannot be right`);
  return rows;
}

/** Every sentence this surface can show, and the index row that defines it. */
const INDEXED: readonly (readonly [string, string])[] = [
  ['Artifact unidentified', allLevelsTried()],
  ['Run folder vs sharded document ambiguous', AMBIGUOUS_RUN_OR_SHARDED],
  ['Run folder may hold several runs', RUN_MAY_HOLD_SEVERAL],
  ['Valid project, no artifacts yet', PROJECT_EMPTY],
  ['Story location outside the project', OUT_OF_TREE_STRING],
  ['Artifact identified, shape not interpreted', UNINTERPRETED],
  ['Identification below certain', BELOW_CERTAIN],
  ['Run folder name reused deliberately', REUSE_DELIBERATE],
  ['Run folder name repeats by accident', REUSE_ACCIDENTAL],
  ['Run folder name carries no date', NO_DATE_IN_NAME],
  ['No artifacts of a family', FAMILY_EMPTY],
  ['Story location resolved inside the project', STORY_LOCATION_IN_TREE],
  ['No sprint tracking in the project', NO_SPRINT_TRACKING],
  ['Sprint-derived view unavailable', SPRINT_UNAVAILABLE],
  ['Artifact scan finished', SCAN_FINISHED],
  ['Artifact scan stopped before it finished', SCAN_STOPPED],
  ['Names the scan did not examine', SCAN_SCOPE],
  ['Second spelling of an artifact', ALIAS_REPORT],
];

test('every sentence the surface shows is the string index own wording', async () => {
  const rows = await indexRows();
  for (const [situation, held] of INDEXED) {
    const indexed = rows.get(situation);
    assert.ok(indexed !== undefined, `the string index carries no "${situation}" row`);
    // actual first, expected second — a failure must report the two the right
    // way round.
    assert.equal(indexed, held, `the surface states "${situation}" differently from the index`);
  }
});

test('the unidentified sentence is assembled from LEVEL_LABELS, not from a prefix', () => {
  // The index row carries the fully substituted example, so the only way to pin
  // a template against it is to fill the template and compare. That is what
  // makes the level *words* come from `LEVEL_LABELS` — a mutation renaming
  // `config path` in the label table changes this sentence and fails above.
  assert.equal(allLevelsTried(), `Not identified. Tried: ${LEVELS.map((l) => LEVEL_LABELS[l]).join(', ')}.`);
  assert.ok(allLevelsTried().includes(LEVEL_LABELS.location), 'the level label reaches the sentence');
  // And the template itself carries the placeholder rather than the example.
  assert.match(UNIDENTIFIED, /<levels>/);
});

test('the surface strings follow the index conventions for their shape', () => {
  const sentences = [
    UNINTERPRETED,
    REUSE_DELIBERATE,
    REUSE_ACCIDENTAL,
    NO_DATE_IN_NAME,
    FAMILY_EMPTY,
    STORY_LOCATION_IN_TREE,
    NO_SPRINT_TRACKING,
    SPRINT_UNAVAILABLE,
    SCAN_FINISHED,
    SCAN_STOPPED,
    PROJECT_EMPTY,
    RUN_MAY_HOLD_SEVERAL,
    BELOW_CERTAIN,
  ];
  for (const sentence of sentences) {
    assert.ok(sentence.endsWith('.'), `not a sentence-shaped string: ${JSON.stringify(sentence)}`);
  }
  // A substituted value is spelled `<placeholder>`; a bare digit baked into a
  // sentence is the defect the suggestion scan already had once.
  for (const sentence of [SCAN_FINISHED, SCAN_SCOPE, STORY_LOCATION_IN_TREE, BELOW_CERTAIN]) {
    assert.match(sentence, /<[a-z]+>/, `${sentence} must spell its substitution`);
  }
  assert.doesNotMatch(SCAN_FINISHED.replace('<n>', ''), /\d/);
  // `FAMILY_EMPTY` deliberately carries no `<family>`: filling one from
  // `FAMILY_LABELS` dropped a label-shaped, initial-capital string into
  // mid-sentence (`No Story artifacts in this project.`). The tile's `h2` names
  // the family one line above.
  assert.doesNotMatch(FAMILY_EMPTY, /<[a-z]+>/);
  // And the count clause agrees at every value, which `<n> artifacts examined.`
  // does not: it renders `1 artifacts examined.` The index's Oversight row has
  // that flaw and nothing renders it yet; it is recorded rather than copied.
  for (const n of ['0', '1', '55']) {
    assert.ok(
      fillIndexString(SCAN_FINISHED, { n }).endsWith(`: ${n}.`),
      'the count must not need a plural agreement',
    );
  }
  // Label-shaped: initial capital, no terminal period.
  for (const label of [SCAN_TILE_LABEL, ARTIFACTS_TILE_LABEL, UNPLACED_TILE_LABEL, AMBIGUOUS_RUN_OR_SHARDED]) {
    assert.match(label, /^[A-Z]/, `${label} takes an initial capital`);
    assert.doesNotMatch(label, /\.$/, `${label} is label-shaped and takes no period`);
  }
});

test('every placeholder in every row this surface uses is one the filler sees', () => {
  // The pattern and the rows are two halves of one contract and neither is the
  // authority alone: a placeholder the filler cannot see is neither substituted
  // nor reported, and ships to a reader as literal text — which is the single
  // failure `fillIndexString` throws to prevent, arriving through the pattern
  // instead of through a missing value. `<[a-z]+>` missed `<file-name>`, `<n2>`
  // and `<Path>`; this asserts nothing in use is outside what it now accepts.
  const seen = /<([A-Za-z][A-Za-z0-9_-]*)>/g;
  for (const [, held] of INDEXED) {
    for (const angled of held.matchAll(/<[^>]*>/g)) {
      const whole = angled[0];
      seen.lastIndex = 0;
      const match = seen.exec(whole);
      assert.ok(
        match !== null && match[0] === whole,
        `${whole} in ${JSON.stringify(held)} is a placeholder the filler cannot see`,
      );
    }
  }
});

test('a substituted value carrying replacement syntax survives verbatim', () => {
  // `$&`, `` $` ``, `$'` and `$1` are interpreted inside a replacement *string*,
  // and every value substituted here comes out of a project file. Verified as a
  // real defect: `outOfTreeReport('/etc/$&x')` produced
  // `… outside the project: /etc/<path>x. Not read.` — a literal `<path>`
  // shipped to a reader — and `/etc/$'x` spliced `. Not read.` into the path.
  for (const hostile of ['/etc/$&x', "/etc/$'x", '/etc/$`x', '/etc/$1x', '/etc/$$x']) {
    assert.equal(
      outOfTreeReport(hostile),
      `Story location points outside the project: ${hostile}. Not read.`,
    );
    assert.equal(
      fillIndexString(STORY_LOCATION_IN_TREE, { path: hostile }),
      `Stories are at ${hostile}.`,
    );
  }
  // And a value that looks like another placeholder is not re-read as one.
  assert.equal(fillIndexString(STORY_LOCATION_IN_TREE, { path: '<n>' }), 'Stories are at <n>.');
});

test('a placeholder naming an Object.prototype member is reported, not resolved', () => {
  // `values[key]` is a bare index, so a template spelling `<constructor>` or
  // `<tostring>` resolved off the prototype chain and substituted a function's
  // source into a sentence. Own-property only.
  assert.throws(() => fillIndexString('At <constructor>.', {}), /unfilled placeholder/);
  assert.throws(() => fillIndexString('At <toString>.', {}), /unfilled placeholder/);
  // An own property that *is* the empty string is a caller saying "nothing
  // here", which is different from forgetting, and is used.
  assert.equal(fillIndexString('At <path>.', { path: '' }), 'At .');
});

test('the family, shape and confidence labels are total over their vocabularies', () => {
  // `Record`-keyed, so a twelfth family fails to compile rather than falling
  // through a lookup — which is what "pinned against FAMILIES so none can be
  // missing" has to mean. Asserted at runtime too, because a `Record` says
  // nothing about the values being usable.
  for (const family of FAMILIES) {
    assert.ok((FAMILY_LABELS[family] ?? '').trim() !== '', `${family} has no label`);
    assert.match(FAMILY_LABELS[family], /^[A-Z]/, `${family}'s label takes an initial capital`);
    assert.doesNotMatch(FAMILY_LABELS[family], /\.$/, `${family}'s label is label-shaped`);
  }
  assert.equal(Object.keys(FAMILY_LABELS).length, FAMILIES.length, 'a label with no family');
  for (const shape of Object.keys(SHAPE_LABELS)) {
    assert.ok((SHAPE_LABELS[shape as keyof typeof SHAPE_LABELS] ?? '').trim() !== '');
  }
  assert.deepEqual(Object.keys(CONFIDENCE_LABELS).sort(), ['certain', 'likely']);
});

// ---------------------------------------------------------------------------
// The I/O matrix, row by row
// ---------------------------------------------------------------------------

test('a real project: every artifact the pass found appears, grouped by family', () => {
  // The pass, the projection and the render composed over **this repository**,
  // which is the one place "nothing disappears from the view" can be asserted
  // against a real tree rather than a fixture.
  const inventory = takeInventory(new ConfinedReader(canonical(REPO_ROOT)));
  assert.ok(inventory.entries.length > 20, 'this repository must have artifacts to list');
  const view = projectInventory(inventory);
  const html = render(view);

  // **Anchored on the whole cell**, which the first version of this was not: it
  // filtered on `html.includes(relative)`, and every path here is a prefix of
  // its children — so a parent counted as "found" whenever any child rendered,
  // and the deliberately excluded `_bmad-output` row was invisible because it
  // prefixes all fifty-odd others. Eight single-line mutations inside the
  // projection survived that assertion.
  const cell = (relative: string): string => `<code class="artifact-path">${relative}</code>`;
  const expected = inventory.entries
    .map((entry) => entry.entry.relative)
    .filter((relative) => relative.toLowerCase() !== OUTPUT_DIRECTORY.toLowerCase());
  assert.deepEqual(
    expected.filter((relative) => !html.includes(cell(relative))),
    [],
    'an artifact the pass reported is not on the page',
  );
  // The one exclusion, asserted explicitly rather than left to a prefix match:
  // the output folder is what was walked, not something found in it.
  assert.ok(
    inventory.entries.some((entry) => entry.entry.relative === OUTPUT_DIRECTORY),
    'the pass must report the output folder, or this assertion proves nothing',
  );
  assert.ok(!html.includes(cell(OUTPUT_DIRECTORY)), 'the output folder is not an artifact row');

  // Grouped by family, and every family has a tile whether or not it holds
  // anything — so an eleventh family cannot be silently missing from the
  // surface because no artifact happened to resolve to it.
  for (const family of FAMILIES) {
    assert.ok(
      html.includes(`<h2 class="tile-label">${FAMILY_LABELS[family]}</h2>`),
      `${family} has no tile`,
    );
  }
});

test('the projected view itself carries what the pass recorded', () => {
  // Assertions over the `InventoryView` rather than over rendered substrings.
  // Rendering is a lossy check on a projection: a field dropped or inverted
  // there shows up as an absent sentence, which a substring test only notices
  // if it happened to look for that sentence. These look at the structure.
  const inventory = takeInventory(new ConfinedReader(canonical(REPO_ROOT)));
  const view = projectInventory(inventory);

  // Counts agree with each other and with the pass, minus the one exclusion.
  const rows = view.groups.flatMap((group) => group.rows);
  assert.equal(view.artifactCount, rows.length, 'the count must be the rows the reader can see');
  assert.equal(view.artifactCount, inventory.entries.length - 1, 'exactly one entry is excluded');
  assert.equal(view.namesLeftOut, inventory.skipped.length + inventory.skippedNotRecorded);
  assert.ok(view.namesLeftOut > 0, 'this repository has names outside the output tree');
  assert.equal(view.aliases.length, inventory.aliases.length);

  // `complete` is the narrow claim, not the walk's own — asserted against its
  // three inputs rather than against `true`.
  assert.equal(
    view.complete,
    inventory.truncations.length === 0 &&
      inventory.skippedNotRecorded === 0 &&
      inventory.suppressedNotRecorded === 0,
  );
  // **And against a pass that actually stopped short**, because on an
  // untruncated tree the line above expects `true` and an unconditional `true`
  // satisfies it — measured, that mutation survived. A budget of two entries
  // reaches a bound on any real project.
  const bounded = takeInventory(new ConfinedReader(canonical(REPO_ROOT)), {
    budget: { maxDepth: 1, maxEntries: 2 },
  });
  assert.ok(bounded.truncations.length > 0, 'the budget must actually bind');
  assert.equal(projectInventory(bounded).complete, false, 'a bound reached is not complete');
  assert.equal(view.complete, true, 'and the full pass is complete, so the two differ');

  // Every row keeps the four things the pass recorded about it, so a
  // `stage: undefined`, `attempted: []` or `runFacts: []` in the projection
  // fails rather than merely rendering less.
  const byPath = new Map(rows.map((row) => [row.path, row]));
  for (const entry of inventory.entries) {
    if (entry.entry.relative.toLowerCase() === OUTPUT_DIRECTORY.toLowerCase()) continue;
    const row = byPath.get(entry.entry.relative);
    assert.ok(row !== undefined, `${entry.entry.relative} has no row`);
    assert.equal(row?.interpretation, entry.interpretation);
    assert.equal(row?.readability.state, entry.readability.state);
    assert.equal(
      row?.readability.stage,
      entry.readability.state === 'present' ? undefined : entry.readability.stage,
    );
    assert.equal(row?.identity.outcome, entry.identity.outcome);
    if (row?.identity.outcome === 'unidentified' && entry.identity.outcome === 'unidentified') {
      assert.deepEqual(
        row.identity.attempted,
        entry.identity.attempted.map((at) => at.level),
      );
      assert.ok(row.identity.attempted.length > 0, 'FR-69 needs the levels');
    }
    assert.equal(row?.runFacts.length, entry.runFacts.length);
  }

  // A single-family ambiguity is placed under that family; two families are
  // placed under none. Asserted from the verdicts, so inverting `familyOf`'s
  // test fails.
  for (const group of view.groups) {
    for (const row of group.rows) {
      const entry = inventory.entries.find((held) => held.entry.relative === row.path);
      const verdict = entry?.identity;
      if (verdict === undefined) continue;
      if (verdict.outcome === 'identified') {
        assert.equal(group.family, verdict.family, `${row.path} is on the wrong tile`);
        continue;
      }
      if (verdict.outcome === 'unidentified') {
        assert.equal(group.family, undefined, `${row.path} must be unplaced`);
        continue;
      }
      const families = new Set(verdict.readings.map((reading) => reading.family));
      assert.equal(
        group.family,
        families.size === 1 ? verdict.readings[0]?.family : undefined,
        `${row.path} is placed against its readings`,
      );
    }
  }

  // The story family carries the location note, and only it does.
  const noted = view.groups.filter((group) => group.notes.length > 0);
  assert.deepEqual(
    noted.map((group) => group.family),
    ['story'],
    'the location is reported at the story family and nowhere else',
  );
  assert.equal(noted[0]?.notes[0]?.kind, 'story-location');

  // And the path it names is **project-relative**, like every other path on the
  // surface. `sprint.ts` records that printing the absolute project root beside
  // this value was a defect it already corrected once, and an absolute path
  // here beside fifty rows of `_bmad-output/…` is that defect returning at the
  // display layer. Asserted by reconstruction rather than against a literal, so
  // it does not encode this repository's own configured location.
  const report = noted[0]?.notes[0]?.report;
  assert.equal(report?.kind, 'at', 'this repository configures a location inside itself');
  if (report?.kind === 'at') {
    assert.ok(!isAbsolute(report.path), `${report.path} is absolute`);
    assert.equal(join(toPlatform(inventory.root), report.path), inventory.storyLocation.path);
  }
});

test('a stage and an ambiguity survive the projection, over a tree that has both', async (t) => {
  // **This repository has neither**, which is why the assertions over it were
  // vacuous for two of the eight mutations the review measured: every entry
  // here reports `unchecked` with *no* stage, and every verdict is identified or
  // unidentified, so `stage: undefined` and an inverted single-family test were
  // both unreachable. A tree that has both is the only thing that reaches them.
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { dir: '_bmad-output' },
    // A run folder holding an `index.md`: one family, two shapes, and FR-73
    // forbids resolving it. It must still be placed under `prd`, because every
    // reading agrees on the family.
    { file: '_bmad-output/planning-artifacts/prds/prd-x-2026-08-28/index.md', text: '# A PRD\n' },
  ]);
  // Invalid UTF-8 *outside* an artifact root, so a level actually reads it and
  // the read fails at `decode` — under a root, level 1 resolves without reading
  // and the honest answer is `unchecked` with no stage. Written as bytes, not
  // as a string: Node's UTF-8 encoder turns an unpaired surrogate into U+FFFD
  // and produces a perfectly valid file.
  await writeFile(join(root, '_bmad-output', 'loose.md'), Buffer.from([0xff, 0xfe, 0x00, 0x41]));

  const inventory = takeInventory(new ConfinedReader(canonical(root)));
  const view = projectInventory(inventory);
  const rows = view.groups.flatMap((group) => group.rows.map((row) => [group, row] as const));

  const unreadable = rows.find(([, row]) => row.readability.state === 'unreadable');
  assert.ok(unreadable !== undefined, 'the fixture must produce an unreadable entry');
  assert.equal(unreadable?.[1].readability.stage, 'decode', 'the stage must reach the view');

  const ambiguous = rows.find(([, row]) => row.identity.outcome === 'ambiguous');
  assert.ok(ambiguous !== undefined, 'the fixture must produce an ambiguous verdict');
  assert.equal(ambiguous?.[0].family, 'prd', 'a single-family ambiguity is placed under it');
  const identity = ambiguous?.[1].identity;
  assert.ok(identity?.outcome === 'ambiguous' && identity.readings.length >= 2);

  // And it reaches the page as the state word, the stage and FR-73's sentence.
  const html = render(view);
  assert.ok(html.includes(`${CONTENT_SIGNAL_LABEL} ${SIGNAL_LABELS.unreadable}`));
  assert.ok(html.includes('<code class="artifact-stage">decode</code>'));
  assert.ok(html.includes(AMBIGUOUS_RUN_OR_SHARDED));
});

test('a second spelling with no row of its own is reported on the page', async (t) => {
  // **The one loss the narrowing argument does not cover.** Every other thing a
  // pass can lose is on the affected artifact's own row; a suppressed spelling
  // has no row, because the artifact is reported under the other name — so
  // without the scan tile's alias line nothing anywhere mentions that the
  // project holds this name. This repository has no symlinks, which is why the
  // projection assertions over it were vacuous for the alias field: dropping it
  // entirely left the suite green.
  if (!(await symlinksAvailable())) {
    t.skip('this machine cannot create symlinks, so a suppressed spelling cannot be built');
    return;
  }
  const root = await makeTree(t, [
    { dir: '_bmad' },
    { file: '_bmad-output/specs/spec-x/SPEC.md', text: '# The spec\n' },
    { link: '_bmad-output/specs/spec-x/link.md', to: '_bmad-output/specs/spec-x/SPEC.md', type: 'file' },
  ]);

  const inventory = takeInventory(new ConfinedReader(canonical(root)));
  assert.equal(inventory.aliases.length, 1, 'the walk must have suppressed one spelling');
  const view = projectInventory(inventory);
  assert.deepEqual(view.aliases, [
    {
      name: inventory.aliases[0]?.relative ?? '',
      reportedAt: inventory.aliases[0]?.reportedAt ?? '',
    },
  ]);
  // And the hand-written `reason` and the `restored` flag do not cross: the
  // first is on this story's Never list, and the second is about how a verdict
  // was reached rather than about what the project holds.
  assert.deepEqual(Object.keys(view.aliases[0] ?? {}).sort(), ['name', 'reportedAt']);

  const html = render(view);
  assert.ok(
    html.includes(
      `${inventory.aliases[0]?.relative ?? ''} is a second spelling of ${inventory.aliases[0]?.reportedAt ?? ''}.`,
    ),
    'the alias must be named on the page',
  );
  assert.ok(!html.includes('not restored:'), 'and never the hand-written reason');
});

test('the composition root hands the server the view it projected', () => {
  // **The gap this closes was the most serious in the story.** Every in-process
  // test stubs `start`, and the observer recorded only `projectRoot` — so
  // replacing the projected view with an empty one in the composition root,
  // while still walking the tree, left the whole suite green: the tool would
  // serve `A BMAD project, with no artifacts yet.` for every real project, the
  // entire payload absent, with nothing red. It is the same shape
  // `test/server.test.ts` already records for the root, whose closing assertion
  // had no equivalent for this option.
  //
  // Asserted through `run` rather than by calling `projectInventory` twice,
  // because what is in doubt is the *wiring*, not the function.
  return observeRun([REPO_ROOT, '--no-open']).then((observed) => {
    assert.equal(observed.code, 0, observed.err);
    assert.equal(observed.inventories.length, 1, 'the server must be given a supplier');
    const served = observed.inventories[0];
    assert.ok(served !== undefined);
    assert.deepEqual(
      served,
      projectInventory(takeInventory(new ConfinedReader(canonical(REPO_ROOT)))),
      'the server is served something other than the projection of this project',
    );
    // And it is not the empty view, which is the substitution that went unseen.
    assert.ok((served?.artifactCount ?? 0) > 20, 'the payload must actually be there');
    assert.ok((served?.groups.length ?? 0) > 1);
  });
});

test('identified below certain: the type shows, and so does the confidence', () => {
  const html = render(FULL_INVENTORY_VIEW);
  assert.ok(html.includes(`<span class="artifact-type">${SHAPE_LABELS.document}</span>`));
  assert.ok(
    html.includes(`${CONFIDENCE_LABELS.likely}, not certain — resolved by ${LEVEL_LABELS.filename}.`),
    'FR-69 displays confidence where it is below certain',
  );
  // And *only* where it is below certain: a `certain` verdict says nothing.
  const certain = render(
    viewOf({
      groups: [
        {
          family: 'prd',
          rows: [
            {
              path: 'a.md',
              identity: {
                outcome: 'identified',
                shape: 'document',
                confidence: 'certain',
                resolvedAt: 'location',
              },
              readability: { state: 'present', stage: undefined },
              interpretation: 'interpreted',
              runFacts: [],
            },
          ],
          notes: [],
        },
      ],
    }),
  );
  assert.ok(!certain.includes('not certain'), 'a certain verdict must claim no confidence caveat');
});

test('unidentified: the index sentence, with the levels named from LEVEL_LABELS', () => {
  const html = render(viewOf({ groups: [{ family: undefined, rows: [UNIDENTIFIED_ROW], notes: [] }] }));
  assert.ok(html.includes(allLevelsTried()), 'FR-69 names the levels attempted');
  // It has no type cell: an unidentified artifact has no type, and a cell
  // reading "unknown" would be a claim the verdict did not make.
  assert.ok(!html.includes('class="artifact-type"'), 'no type is claimed for an unidentified row');
  // And it sits under its own tile rather than under a family the tool guessed.
  assert.ok(html.includes(`<h2 class="tile-label">${UNPLACED_TILE_LABEL}</h2>`));
});

test('uninterpretable: FR-12 gets its own row, not merged with unidentified', () => {
  const html = render(viewOf({ groups: [{ family: 'prd', rows: [UNINTERPRETED_ROW], notes: [] }] }));
  assert.ok(html.includes(UNINTERPRETED), "FR-12's state is shown");
  assert.ok(!html.includes('Not identified'), 'FR-12 is not FR-69 and must not borrow its sentence');
  // The two sentences are different strings, which is the whole of the
  // distinction `src/domain/interpretation.ts` exists to keep.
  assert.notEqual(UNINTERPRETED, allLevelsTried());
});

test('unreadable: the state word from SIGNAL_LABELS, and the stage beside it', () => {
  const html = render(FULL_INVENTORY_VIEW);
  assert.ok(
    html.includes(
      `<span class="artifact-state">${CONTENT_SIGNAL_LABEL} ${SIGNAL_LABELS.unreadable}</span>`,
    ),
  );
  assert.ok(html.includes('<code class="artifact-stage">decode</code>'), 'the stage is named');
  // Never colour alone: the four signal colours converge under protanopia
  // (DESIGN.md:221), so the state word is load-bearing. Nothing on this surface
  // carries a signal colour at all.
  assert.ok(!html.includes('signal-'), 'no signal colour class may encode a state here');
  assert.doesNotMatch(html, /\sstyle=/, 'no inline style may encode a state either');
});

test('not checked and not found are different sentences, and never "none"', () => {
  const html = render(FULL_INVENTORY_VIEW);
  assert.ok(
    html.includes(`${CONTENT_SIGNAL_LABEL} ${SIGNAL_LABELS.unchecked}<`),
    'a file no level opened says so',
  );
  assert.ok(
    html.includes(`${CONTENT_SIGNAL_LABEL} ${SIGNAL_LABELS.absent}<`),
    'a name with nothing behind it says so',
  );
  assert.notEqual(SIGNAL_LABELS.unchecked, SIGNAL_LABELS.absent);
  assert.doesNotMatch(html, /\bnone\b/i, 'the two must never collapse into "none"');
  // Every state word on the page is one of AD-8's four, read from the table.
  for (const state of SIGNAL_STATES) {
    assert.ok(SIGNAL_LABELS[state].trim() !== '', `${state} has no label`);
  }
});

test('a family with no artifacts gets the per-family sentence, not the run-folder one', () => {
  const html = render(FULL_INVENTORY_VIEW);
  // `forge` holds nothing in the fixture, and BMAD writes no `epics` runs — so
  // the sentence has to be true of a family that is never a run, which is why
  // `No <family> runs in this project.` was not reused.
  assert.ok(html.includes(FAMILY_EMPTY), 'a family with nothing in it says so');
  assert.ok(!html.includes('runs in this project'), 'the run-folder template is false here');
  // Once per empty family, and the sentence names no family — the tile's `h2`
  // does. A label dropped into mid-sentence read `No Story artifacts in this
  // project.`, which the label table's own doc forbids by calling itself
  // label-shaped.
  const empties = (html.match(new RegExp(FAMILY_EMPTY, 'g')) ?? []).length;
  assert.equal(empties, FAMILIES.length - 2, 'prd and spec hold rows; every other family is empty');
  // And it is a stated absence rather than a blank: EXPERIENCE.md:152 calls a
  // bare "nothing here" a defect on every surface.
  assert.match(html, /class="tile-empty"/);
});

test('story location out of tree: the index sentence, at the family level', () => {
  const html = render(withStoryNote({ kind: 'outside', path: '/etc' }));
  assert.ok(html.includes('Story location points outside the project: /etc. Not read.'));
  // At the family level (EXPERIENCE.md:168), which means on the story family's
  // tile and not as a signal state on a row.
  const tile = /<h2 class="tile-label">Story<\/h2>([\s\S]*?)<\/section>/.exec(html)?.[1];
  assert.ok(tile !== undefined, 'the story family must have a tile');
  assert.ok((tile ?? '').includes('/etc'), 'the report belongs to the story family');
  assert.ok(!(tile ?? '').includes('class="artifact-state"'), 'it is not a signal state');
  // And never the hand-written reason, which is not backed by any document.
  assert.ok(!html.includes('resolves inside the project'));
});

test('story location in tree names the place; absent is a normal shape', () => {
  const html = render(FULL_INVENTORY_VIEW);
  assert.ok(html.includes('Stories are at docs/stories.'));
  // Project-relative, like every other path on the surface. `sprint.ts` records
  // that printing the absolute project root beside this value was a defect it
  // already corrected once, and an absolute path here beside fifty rows of
  // `_bmad-output/…` was that defect returning at the display layer.
  assert.ok(!html.includes('Stories are at /'), 'no absolute path in the in-tree report');

  const absent = render(withStoryNote({ kind: 'none' }));
  assert.ok(absent.includes(NO_SPRINT_TRACKING), 'FR-75 makes absence a shape, not a failure');
  assert.ok(!absent.includes(SPRINT_UNAVAILABLE), 'and not an unavailable view');
  // And the fact is stated **once**: the reader's question on the story tile is
  // where the stories are, which this answers; `No artifacts of this family in
  // this project.` beside it was the same absence twice.
  const storyTile = /<h2 class="tile-label">Story<\/h2>([\s\S]*?)<\/section>/.exec(absent)?.[1];
  assert.ok(storyTile !== undefined);
  assert.ok(
    !(storyTile ?? '').includes(FAMILY_EMPTY),
    'an absence note is not repeated as an empty state',
  );
});

test('a note that names a place still leaves room for the empty state', () => {
  // The other half of the rule: `Stories are at docs/stories.` and "no
  // artifacts of this family" are two different facts and both are worth
  // having, so only an *absence* note suppresses the empty sentence.
  const html = render(withStoryNote({ kind: 'at', path: 'docs/stories' }));
  assert.ok(html.includes('Stories are at docs/stories.'));
  assert.ok(html.includes(FAMILY_EMPTY));
});

test('sprint view unavailable: FR-75 row, with the state named as the machine value', () => {
  // The five remaining location states are FR-75's requirement exactly —
  // unavailable rather than empty or broken — and stay distinguishable by the
  // state itself rather than by five sentences no document carries.
  for (const state of ['unresolved', 'ambiguous', 'undeclared', 'declined', 'unreadable'] as const) {
    const html = render(withStoryNote({ kind: 'unavailable', state }));
    assert.ok(html.includes(SPRINT_UNAVAILABLE), `${state} must report the view unavailable`);
    assert.ok(
      html.includes(`<code class="artifact-stage">${state}</code>`),
      `${state} must stay distinguishable`,
    );
  }
  // Every location state is answered by one of the three sentences: a ninth
  // state added to the vocabulary would fall into the unavailable branch rather
  // than render nothing, which is the honest default of the three.
  assert.equal(LOCATION_STATES.length, 8);
});

test('a run folder that may collide says so, and says whether the reuse is deliberate', () => {
  const html = render(FULL_INVENTORY_VIEW);
  assert.ok(html.includes(RUN_MAY_HOLD_SEVERAL), "FR-71's disclosure");
  assert.ok(html.includes(REUSE_ACCIDENTAL), 'the four dated patterns repeat by accident');
  assert.ok(html.includes(REUSE_DELIBERATE), 'the three slug patterns are reopened on purpose');
  assert.ok(html.includes(NO_DATE_IN_NAME), "FR-72's dateless pair");
  assert.notEqual(REUSE_ACCIDENTAL, REUSE_DELIBERATE);
});

test('a run-folder reading with no measured pattern claims nothing', () => {
  // `src/domain/runs.ts` says of the unmeasured outcome that "nothing is
  // claimed about collision or date signal", so the honest rendering is
  // silence — and never its hand-written `reason`, which is on the Never list.
  const html = render(
    viewOf({
      groups: [
        {
          family: 'review',
          rows: [
            {
              path: 'r',
              identity: {
                outcome: 'identified',
                shape: 'run-folder',
                confidence: 'likely',
                resolvedAt: 'filename',
              },
              readability: { state: 'unchecked', stage: undefined },
              interpretation: 'interpreted',
              runFacts: [{ measured: false }],
            },
          ],
          notes: [],
        },
      ],
    }),
  );
  assert.ok(!html.includes(RUN_MAY_HOLD_SEVERAL), 'no collision is claimed');
  assert.ok(!html.includes('no run-folder pattern was measured'), 'and never the raw reason');
});

test('run folder versus sharded document is presented, never resolved', () => {
  const html = render(FULL_INVENTORY_VIEW);
  assert.ok(html.includes(AMBIGUOUS_RUN_OR_SHARDED), "FR-73's own wording");
  // Both readings get a type cell, because the tool ranks neither and a
  // connective between them would have to.
  assert.ok(html.includes(`<span class="artifact-type">${SHAPE_LABELS['run-folder']}</span>`));
  assert.ok(html.includes(`<span class="artifact-type">${SHAPE_LABELS['sharded-document']}</span>`));
});

test('a bound reached is reported: the page says the scan did not finish', () => {
  const stopped = render(viewOf({ complete: false, groups: FULL_INVENTORY_VIEW.groups }));
  assert.ok(stopped.includes(SCAN_STOPPED), 'never silently partial');
  assert.ok(!stopped.includes('The scan finished'), 'and it must not also claim it finished');
  // Raised, because a scan that did not finish qualifies everything below it —
  // and it is the one raised tile, which `tileGrid` enforces per surface.
  assert.match(stopped, /<section class="tile-raised tile-span">\n<h2 class="tile-label">Scan<\/h2>/);
  assert.equal((stopped.match(/tile-raised/g) ?? []).length, 1);
  // A complete pass still reports, so "nothing was flagged" is not silence.
  const finished = render(FULL_INVENTORY_VIEW);
  assert.ok(finished.includes('The scan finished. Artifacts examined: 11.'));
  assert.ok(!finished.includes('tile-raised'), 'a finished scan is not the thing to see first');
});

test('the scan tile reports its scope and every second spelling', () => {
  const html = render(FULL_INVENTORY_VIEW);
  // Skips are the caller's own instruction, so they do not make the pass
  // *incomplete* — `Inventory.complete`'s own doc says so — which is exactly
  // why they need saying somewhere. Measured on this repository: thirteen names
  // are skipped every run, and nothing on the page mentioned one.
  assert.ok(html.includes('Names outside the artifact output tree, not examined: 13.'));
  // An alias is the one loss with no row anywhere: the artifact is reported
  // under the other spelling, so without this nothing says the name exists.
  assert.ok(
    html.includes('_bmad-output/specs/link.md is a second spelling of _bmad-output/specs/SPEC.md.'),
  );
  // And the tile spans the row, so it is above everything it qualifies rather
  // than beside the first family tile above the breakpoint.
  assert.match(html, /<section class="tile tile-span">\n<h2 class="tile-label">Scan<\/h2>/);
});

test('the state and stage cells are captioned, so a row cannot contradict itself', () => {
  const html = render(FULL_INVENTORY_VIEW);
  // The common case rather than an edge: on a real project nearly every row is
  // `Not checked`, and uncaptioned beside FR-12's `Present, but its shape was
  // not interpreted.` it read as two answers to one question. The chrome one
  // landmark up sets the pattern (`Git: Not checked`).
  assert.ok(html.includes(`${CONTENT_SIGNAL_LABEL} ${SIGNAL_LABELS.unchecked}`));
  assert.ok(html.includes(`${CONTENT_SIGNAL_LABEL} ${SIGNAL_LABELS.unreadable}`));
  assert.ok(html.includes(`${STAGE_SIGNAL_LABEL} <code class="artifact-stage">decode</code>`));
  // Label-shaped, and never a bare state word without its caption.
  for (const caption of [CONTENT_SIGNAL_LABEL, STAGE_SIGNAL_LABEL]) {
    assert.match(caption, /^[A-Z][a-z]*:$/, `${caption} is a caption, not a sentence`);
  }
  assert.doesNotMatch(html, /class="artifact-state">(Present|Not checked|Not found|Unreadable)</);
});

test('every inline cell is separated by real whitespace, not by a CSS gap', () => {
  const html = render(FULL_INVENTORY_VIEW);
  // The flex `gap` is not text, so it reaches neither text extraction, nor
  // copy-paste, nor a render with styles unavailable. Measured before the fix:
  // a row read `prdsFamily directoryNot checked` and two type cells read
  // `Run folderSharded document`.
  assert.ok(!/<\/code><span/.test(html), 'a path runs into the cell after it');
  assert.ok(!/<\/span><span/.test(html), 'two cells run together');
  const text = html.replace(/<[^>]+>/g, '');
  assert.ok(!/[a-z][A-Z]/.test(text.replace(/BMAD|PRD|UX/g, '')), `cells run together: ${text}`);
});

test('a run folder with two measured readings says each thing once, or not at all', () => {
  // Two readings produced the disclosure twice and then put the deliberate and
  // accidental sentences side by side, with nothing tying either to a reading —
  // two contradictory claims about one folder.
  const html = render(
    viewOf({
      groups: [
        {
          family: 'spec',
          rows: [
            {
              path: 'two',
              identity: {
                outcome: 'identified',
                shape: 'run-folder',
                confidence: 'certain',
                resolvedAt: 'location',
              },
              readability: { state: 'unchecked', stage: undefined },
              interpretation: 'interpreted',
              runFacts: [
                { measured: true, reuse: 'deliberate', dateSignal: 'absent' },
                { measured: true, reuse: 'accidental', dateSignal: 'present' },
              ],
            },
          ],
          notes: [],
        },
      ],
    }),
  );
  assert.equal((html.match(new RegExp(RUN_MAY_HOLD_SEVERAL, 'g')) ?? []).length, 1);
  assert.ok(!html.includes(REUSE_DELIBERATE), 'readings disagree, so neither is claimed');
  assert.ok(!html.includes(REUSE_ACCIDENTAL));
  assert.ok(!html.includes(NO_DATE_IN_NAME), 'not every reading says the date is absent');
  // And where they agree, the sentence is emitted once.
  const agreeing = render(
    viewOf({
      groups: [
        {
          family: 'spec',
          rows: [
            {
              path: 'two',
              identity: {
                outcome: 'identified',
                shape: 'run-folder',
                confidence: 'certain',
                resolvedAt: 'location',
              },
              readability: { state: 'unchecked', stage: undefined },
              interpretation: 'interpreted',
              runFacts: [
                { measured: true, reuse: 'deliberate', dateSignal: 'absent' },
                { measured: true, reuse: 'deliberate', dateSignal: 'absent' },
              ],
            },
          ],
          notes: [],
        },
      ],
    }),
  );
  assert.equal((agreeing.match(new RegExp(REUSE_DELIBERATE, 'g')) ?? []).length, 1);
  assert.equal((agreeing.match(new RegExp(NO_DATE_IN_NAME, 'g')) ?? []).length, 1);
});

test('an ambiguity over both family and shape names both in each cell', () => {
  // The third branch of `typeCells`, which nothing exercised: replacing it with
  // an empty cell left the suite green.
  const html = render(viewOf({ groups: [{ family: undefined, rows: [AMBIGUOUS_BOTH_ROW], notes: [] }] }));
  assert.ok(
    html.includes(
      `<span class="artifact-type">${FAMILY_LABELS.prd} · ${SHAPE_LABELS.document}</span>`,
    ),
  );
  assert.ok(
    html.includes(
      `<span class="artifact-type">${FAMILY_LABELS.brief} · ${SHAPE_LABELS['sharded-document']}</span>`,
    ),
  );
});

test('a verdict shape the authority never produces is refused, not rendered', () => {
  // Two shapes, both defects rather than project shapes, and both of which the
  // first version rendered as a claim no verdict made: an unidentified verdict
  // with no attempted levels rendered `Not identified. Tried: .`, and an
  // ambiguity with one reading rendered as an ordinary row with the ambiguity
  // gone from the page. AD-7's "never an omission" makes a visible failure the
  // right answer; the adapter's own `catch` turns it into a reportable 500.
  const row = (identity: ArtifactRow['identity']): InventoryView =>
    viewOf({
      groups: [
        {
          family: 'prd',
          rows: [
            {
              path: 'a',
              identity,
              readability: { state: 'present', stage: undefined },
              interpretation: 'interpreted',
              runFacts: [],
            },
          ],
          notes: [],
        },
      ],
    });
  assert.throws(
    () => render(row({ outcome: 'unidentified', attempted: [] })),
    /must name the levels it attempted/,
  );
  assert.throws(
    () =>
      render(
        row({
          outcome: 'ambiguous',
          readings: [{ family: 'prd', shape: 'document' }],
          confidence: 'likely',
          resolvedAt: 'frontmatter',
        }),
      ),
    /two or more readings/,
  );
});

test('a hostile filename renders as text; no element is created by it', () => {
  const html = render(FULL_INVENTORY_VIEW);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;.md'), 'the escaped name appears');
  assert.ok(!html.includes(HOSTILE_NAME), 'the raw name must not reach the markup');
  assert.ok(!html.includes('<img'), 'no element may be created by a filename');
  // The path around it survives, so this is not passing because the row was
  // dropped.
  assert.ok(html.includes(HOSTILE_PATH.replace(HOSTILE_NAME, '')));
});

test('an empty project renders the index sentence, not twelve empty families', () => {
  const html = render(EMPTY_INVENTORY);
  assert.ok(html.includes(PROJECT_EMPTY), "the index's own row for a project with nothing in it");
  assert.ok(html.includes(`<h2 class="tile-label">${ARTIFACTS_TILE_LABEL}</h2>`));
  // One artifact tile, not one per family saying the same thing twelve times.
  assert.equal((html.match(/class="tile-label"/g) ?? []).length, 2, 'the scan tile and one more');
  assert.ok(!html.includes(FAMILY_EMPTY), 'no per-family sentence here');
});

// ---------------------------------------------------------------------------
// Structure and accessibility
// ---------------------------------------------------------------------------

test('a tile label is the tile only heading, and rows are list items', () => {
  const html = render(FULL_INVENTORY_VIEW);
  // DESIGN.md:293 — "a tile that needs two headings is two tiles" — so a family
  // label is the tile's one heading and an artifact row is an `li`.
  assert.doesNotMatch(html, /<h[13-6][ >]/, 'the surface uses one heading level inside the grid');
  assert.match(html, /<ul class="artifact-list">/);
  assert.match(html, /<li class="artifact-row">/);
  // The path leads the row, because that is what the reader scans by.
  assert.match(html, /<li class="artifact-row"><code class="artifact-path">/);
});

test('the surface serves no script, and creates no element it did not write', () => {
  const html = render(FULL_INVENTORY_VIEW);
  assert.doesNotMatch(html, /<script\b/i, 'the keyboard story is document order alone');
  assert.doesNotMatch(html, /https?:\/\//i);
  // `role=` and `tabindex` are banned: nothing here is interactive, so an added
  // role would describe structure the elements already carry, and a tabindex
  // would put a non-interactive element in the tab order.
  //
  // **`aria-` is deliberately not banned**, which the first version of this
  // assertion got wrong: it locked out `aria-label` and `aria-labelledby`
  // outright — including the naming that would let a later story give these
  // sections accessible names — and the chrome one landmark up establishes the
  // opposite pattern by captioning its own signal. Naming is not a role.
  assert.doesNotMatch(html, /tabindex=|role=/);

  // Every tag in the output is one this surface writes. Stronger than a list
  // of forbidden elements: a crafted filename cannot introduce *any* element,
  // named in advance or not — and the fixture contains one that tries.
  const written = new Set(['div', 'section', 'h2', 'ul', 'li', 'code', 'span', 'p']);
  const tags = [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)].map((match) => match[1] ?? '');
  assert.ok(tags.length > 0, 'the surface must emit markup');
  assert.deepEqual(
    [...new Set(tags.filter((tag) => !written.has(tag)))],
    [],
    'an element reached the page that this surface does not write',
  );
});

test('an unfilled placeholder is refused rather than shown to a reader', () => {
  // `<n>` reaching a page is the visible half of having edited the index and
  // not the call, so the substitution throws rather than shipping a literal
  // angle bracket. Asserted on the helper the surface uses, because that is
  // where the guard is.
  assert.throws(() => fillIndexString(SCAN_FINISHED, {}), /unfilled placeholder <n>/);
  assert.throws(() => fillIndexString(SCAN_SCOPE, { other: 'x' }), /unfilled placeholder/);
  assert.equal(fillIndexString(SCAN_FINISHED, { n: '3' }), 'The scan finished. Artifacts examined: 3.');
});

test('a location state with no path to name falls to the unavailable branch', () => {
  // AD-13's rule at the render boundary: `in-tree` carries a path, and one that
  // somehow does not must not fill `<path>` with an empty string — an empty
  // substitution is a claim, and this is the branch that claims nothing.
  const html = render(withStoryNote({ kind: 'unavailable', state: 'in-tree' }));
  assert.ok(html.includes(SPRINT_UNAVAILABLE));
  assert.ok(!html.includes('<path>') && !html.includes('&lt;path&gt;'), 'no placeholder ships');
  assert.ok(!html.includes('Stories are at .'), 'and no empty substitution');
});
