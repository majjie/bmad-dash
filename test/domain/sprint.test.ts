/**
 * Where the stories live — every row of Story 1.11's I/O matrix.
 *
 * Two layers, because the interesting claims live at different altitudes and
 * asserting them all in one place would prove neither:
 *
 *   - **The rule**, over `locateStories` directly: six states, total, and each
 *     of the "the file said nothing usable" shapes distinct from the others.
 *     Pure input, so a row here cannot pass by accident of the filesystem.
 *   - **The whole path**, through `takeInventory` over real trees: a real
 *     `sprint-status.yaml`, read by the real reader, its scalar taken by the
 *     real unfenced frontmatter reader and resolved by the real confined
 *     adapter. That is the only altitude at which "and nothing was read" is a
 *     claim about the tool rather than about a mock.
 *
 * **The load-bearing row is `/etc`.** FR-74 names an out-of-tree value and AD-9
 * says such a value is "recorded as out-of-tree and reported, never read and
 * never served"; the frozen intent sharpens it to "never a read attempt to
 * discover the answer". So it is asserted three ways, because each alone is
 * satisfiable by a mistake: the state and the reported path, that no exception
 * escaped, and — through a reader that records every path it is asked for —
 * that nothing under the declared location was ever asked about.
 *
 * **What "never read" means here, stated precisely**, because an earlier
 * version of this header claimed more than the code does. `resolveDeclared`
 * performs exactly one filesystem operation on a declared value:
 * `realpathSync.native`, the *resolution* AD-9 mandates when it says such a
 * value is "resolved and refused". For a value that leads out of the root, that
 * resolver necessarily touches the far end. What never happens is a **read**:
 * no content opened, no directory enumerated, no `stat` for kind or size, and
 * nothing served. The recorder below asserts exactly that, over the four reader
 * methods that perform reads.
 *
 * The two symlink rows are the pair that keeps the resolution honest, and they
 * face in opposite directions:
 *
 *   - A link **inside** the project pointing **out** must be out-of-tree. That
 *     is the security-critical direction and it had no test at all: replacing
 *     the resolved-form containment check with a bare `ok: true` left the whole
 *     suite green, because every other declared value in it is decided by the
 *     sanitizer or by the spelling.
 *   - A path **outside** the project by spelling that **resolves inside** it
 *     must be in-tree. That is the ordinary macOS shape (`/tmp` is
 *     `/private/tmp`) and any symlinked home, and answering it from the
 *     spelling reported a correct configuration as "points outside the
 *     project", permanently, with no recovery.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOCATION_DEFINITIONS,
  LOCATION_STATES,
  OUT_OF_TREE_STRING,
  STORY_LOCATION_FIELD,
  TRACKING_FILE,
  locateStories,
  outOfTreeReport,
  type StoryLocation,
} from '../../src/domain/sprint.ts';
import { SIGNAL_STATES } from '../../src/domain/signal.ts';
import { canonical } from '../../src/adapters/fs/paths.ts';
import { ConfinedReader } from '../../src/adapters/fs/read.ts';
import { takeInventory, type Inventory } from '../../src/cli/inventory.ts';
import { makeTree, symlinksAvailable, type TreeNode } from '../support/tree.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SPINE_PATH = join(
  REPO_ROOT,
  '_bmad-output',
  'planning-artifacts',
  'architecture',
  'architecture-bmad-2026-08-28',
  'ARCHITECTURE-SPINE.md',
);

const PRD_PATH = join(
  REPO_ROOT,
  '_bmad-output',
  'planning-artifacts',
  'prds',
  'prd-bmad-2026-08-28',
  'prd.md',
);

const EXPERIENCE_PATH = join(
  REPO_ROOT,
  '_bmad-output',
  'planning-artifacts',
  'ux-designs',
  'ux-bmad-2026-08-28',
  'EXPERIENCE.md',
);

/** Where BMAD's sprint planning writes the file, relative to a project root. */
const TRACKING_RELATIVE = `_bmad-output/implementation-artifacts/${TRACKING_FILE}`;

/** The bare bones of a project: both markers, so recognition and the walk work. */
const PROJECT: readonly TreeNode[] = [{ dir: '_bmad' }, { dir: '_bmad-output' }];

/**
 * A `sprint-status.yaml` with `body` among its top-level lines.
 *
 * Shaped like the real file rather than minimally: a `#` comment header, **no**
 * opening `---`, and an indented `development_status` sub-map. Those three are
 * exactly what the fenced frontmatter reader could not handle and what the
 * indentation rule has to keep out of the top-level fields — a fixture without
 * them would test the unfenced entry point over a document nothing like the one
 * it exists for. The sub-map's story keys are Story 2.8's to read, and a
 * failure here would be this reader having read them.
 */
function trackingFile(body: string): string {
  return [
    '# STATUS DEFINITIONS:',
    '# ==================',
    '#   - backlog: Epic not yet started',
    '',
    'generated: 08-28-2026 20:15',
    'project: bmad-dash',
    'tracking_system: file-system',
    body,
    'development_status:',
    '  epic-1: in-progress',
    '  1-11-locate-sprint-tracking-safely: in-progress',
    '',
  ].join('\n');
}

/** Write a tracking file into an existing project tree. */
async function writeTracking(root: string, contents: string | Uint8Array): Promise<void> {
  const directory = join(root, '_bmad-output', 'implementation-artifacts');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, TRACKING_FILE), contents);
}

/** Take the inventory of a project whose tracking file holds `body`. */
async function locatedIn(
  t: { after: (fn: () => unknown) => void },
  body: string,
  extra: readonly TreeNode[] = [],
): Promise<StoryLocation> {
  const root = await makeTree(t, [
    ...PROJECT,
    { file: TRACKING_RELATIVE, text: trackingFile(body) },
    ...extra,
  ]);
  return takeInventory(new ConfinedReader(canonical(root))).storyLocation;
}

// ---------------------------------------------------------------------------
// The rule, over pure input
// ---------------------------------------------------------------------------

test('the eight location states are closed, defined, and cited', async () => {
  // Closed: the definition table is keyed, so a ninth state fails to compile
  // rather than falling through a lookup — and the two lists are compared here
  // so a state with no definition, or a definition with no state, fails too.
  assert.deepEqual([...LOCATION_STATES].sort(), Object.keys(LOCATION_DEFINITIONS).sort());
  assert.equal(new Set(LOCATION_STATES).size, LOCATION_STATES.length);
  for (const state of LOCATION_STATES) {
    const recorded = LOCATION_DEFINITIONS[state];
    assert.ok(recorded.definition.length > 0, `${state} has no definition`);
  }

  // **Every basis is a real identifier in a normative document.** This table
  // shipped with `unreadable` citing FR-74, the *out-of-tree* requirement, in a
  // table whose only purpose is recording which requirement owns a state's
  // meaning. A wrong citation is the defect there, so the ids are read out of
  // the documents rather than trusted as spellings.
  const prd = await readFile(PRD_PATH, 'utf8');
  const spine = await readFile(SPINE_PATH, 'utf8');
  for (const state of LOCATION_STATES) {
    const basis = LOCATION_DEFINITIONS[state].basis;
    const document = basis.startsWith('FR-') ? prd : spine;
    const where = basis.startsWith('FR-') ? 'prd.md' : 'ARCHITECTURE-SPINE.md';
    assert.ok(
      document.includes(`**${basis}**`) || document.includes(`### ${basis} `),
      `${state} cites ${basis}, which ${where} does not define`,
    );
  }
});

test('the location axis is separate from AD-8, including where the two share a word', () => {
  // AD-8 pins exactly four signal states and `test/domain/signal.test.ts` reads
  // that sentence out of the spine; this story's frozen intent says the location
  // answer is "a first-class location state on its own axis — not a fifth signal
  // state". So the four remain four.
  assert.equal(SIGNAL_STATES.length, 4);
  const signals: readonly string[] = SIGNAL_STATES;

  // **The overlap is asserted rather than looped past.** An earlier version of
  // this test checked only the four spellings unique to this axis and said
  // nothing about the two that coincide, while claiming the stronger property.
  // Two spellings *are* shared, deliberately: `absent` and `unreadable` mean
  // here what they mean there, said of the tracking file rather than of an
  // artifact's content, and inventing second words for the same two physical
  // facts would be the duplicate vocabulary AD-8 exists against.
  const shared = LOCATION_STATES.filter((state) => signals.includes(state));
  assert.deepEqual(shared, ['absent', 'unreadable'], 'the shared spellings are exactly these two');

  // And nothing else has leaked across in either direction.
  for (const state of LOCATION_STATES) {
    if (shared.includes(state)) continue;
    assert.equal(signals.includes(state), false, `${state} must not appear in AD-8's four`);
  }
  for (const signal of SIGNAL_STATES) {
    if (shared.includes(signal as never)) continue;
    assert.equal(
      (LOCATION_STATES as readonly string[]).includes(signal),
      false,
      `${signal} must not appear in the location axis`,
    );
  }

  // A `StoryLocation` carries both axes side by side, which is why the overlap
  // is a live misreading risk rather than a curiosity: the same word means the
  // file on one field and the location on the other.
  const answer = locateStories({ kind: 'absent', reason: 'no such file' });
  assert.equal(answer.state, 'absent');
  assert.equal(answer.tracking.state, 'absent');
});

test('a tracking file that is absent, unreadable, undeclared or declined gives four answers', () => {
  // The four "no usable location" shapes, distinct — FR-75 plus AD-13 at this
  // altitude. Collapsing any pair would tell a reader their project has no
  // sprint tracking when it has one nobody could read, or that a key says
  // nothing when there is no key at all.
  const absent = locateStories({ kind: 'absent', reason: 'no such file' });
  assert.equal(absent.state, 'absent');
  assert.equal(absent.tracking.state, 'absent');
  assert.equal(absent.path, undefined);
  assert.equal(absent.declared, undefined);

  const unreadable = locateStories({
    kind: 'unreadable',
    stage: 'decode',
    reason: 'not valid UTF-8 text',
  });
  assert.equal(unreadable.state, 'unreadable');
  assert.equal(unreadable.tracking.state, 'unreadable');
  assert.equal(
    unreadable.tracking.state === 'unreadable' ? unreadable.tracking.stage : undefined,
    'decode',
  );

  const undeclared = locateStories({ kind: 'read', field: { kind: 'undeclared' } });
  assert.equal(undeclared.state, 'undeclared');
  assert.equal(undeclared.tracking.state, 'present', 'the file itself was read perfectly well');

  const declined = locateStories({
    kind: 'read',
    field: { kind: 'declined', reason: 'the key says nothing' },
  });
  assert.equal(declined.state, 'declined');
  assert.equal(declined.tracking.state, 'present');

  assert.equal(
    new Set([absent, unreadable, undeclared, declined].map((answer) => answer.state)).size,
    4,
  );
});

test('a sanitizer refusal is declined and never out-of-tree', () => {
  // The two are not interchangeable: `out-of-tree` claims the value resolved to
  // a place, and a refused spelling was never resolved to anywhere.
  const refused = locateStories({
    kind: 'read',
    field: {
      kind: 'value',
      value: 'docs/.hidden',
      resolved: { kind: 'refused', reason: 'leading-dot in ".hidden"' },
    },
  });
  assert.equal(refused.state, 'declined');
  assert.equal(refused.path, undefined, 'nothing was resolved, so no path may be reported');
  assert.equal(refused.declared, 'docs/.hidden', 'what the project said is still on the record');
});

test('an in-tree and an out-of-tree resolution both report their path', () => {
  const inside = locateStories({
    kind: 'read',
    field: { kind: 'value', value: 'docs', resolved: { kind: 'in-tree', path: '/p/docs' } },
  });
  assert.equal(inside.state, 'in-tree');
  assert.equal(inside.path, '/p/docs');

  const outside = locateStories({
    kind: 'read',
    field: {
      kind: 'value',
      value: '/etc',
      resolved: { kind: 'out-of-tree', path: '/etc' },
    },
  });
  assert.equal(outside.state, 'out-of-tree');
  assert.equal(outside.path, '/etc', 'FR-74 reports the path; it just never reads it');
  // One state, one phrasing, and it is the index's. `reason` used to carry a
  // second non-normative sentence for the same fact, which also printed the
  // absolute project root.
  assert.equal(outside.reason, outOfTreeReport('/etc'));
  assert.equal(outside.reason, 'Story location points outside the project: /etc. Not read.');
});

test("the out-of-tree copy is EXPERIENCE.md's own sentence, read out of the document", async () => {
  // The string index is normative and every entry in it is used verbatim, so
  // this is compared against the document rather than restated from memory —
  // the mechanism `SIGNAL_LABELS` uses, and for the same reason: a literal that
  // merely happens to match is a second copy of one belief.
  const experience = await readFile(EXPERIENCE_PATH, 'utf8');
  assert.ok(
    experience.includes(OUT_OF_TREE_STRING),
    `EXPERIENCE.md no longer contains ${JSON.stringify(OUT_OF_TREE_STRING)}`,
  );
  assert.ok(OUT_OF_TREE_STRING.includes('<path>'), 'the placeholder convention is <placeholder>');
});

// ---------------------------------------------------------------------------
// The whole path, through the real pass
// ---------------------------------------------------------------------------

test("this repository's own story_location resolves in-tree, at its canonical path", () => {
  // The acceptance row, over the real file: `story_location:
  // _bmad-output/implementation-artifacts`, relative and unquoted.
  const located = takeInventory(new ConfinedReader(canonical(REPO_ROOT))).storyLocation;
  assert.equal(located.state, 'in-tree', located.reason);
  assert.equal(located.declared, '_bmad-output/implementation-artifacts');
  assert.equal(located.path, canonical(join(REPO_ROOT, '_bmad-output', 'implementation-artifacts')));
  assert.equal(located.tracking.state, 'present');
});

test('an absolute out-of-tree location is reported, and nothing under it is ever asked about', async (t) => {
  // FR-74's `/etc`, and the acceptance criterion in full. The reader records
  // every path it is asked for, which is the only way to assert the *negative*
  // — that the answer was reached without a read, rather than by reading and
  // then discarding.
  const root = await makeTree(t, [
    ...PROJECT,
    { file: TRACKING_RELATIVE, text: trackingFile(`${STORY_LOCATION_FIELD}: /etc`) },
  ]);
  const reader = new ConfinedReader(canonical(root));
  const asked: string[] = [];
  const record = (name: 'entryAt' | 'readText' | 'childrenOf' | 'isDirectory'): void => {
    const real = reader[name].bind(reader) as (...args: unknown[]) => unknown;
    (reader as unknown as Record<string, unknown>)[name] = (...args: unknown[]): unknown => {
      asked.push(String(args[0]));
      return real(...args);
    };
  };
  for (const name of ['entryAt', 'readText', 'childrenOf', 'isDirectory'] as const) record(name);

  // No exception escapes: an out-of-tree location is a typed value. The
  // precedent it is measured against is `src/cli/location.ts`, which records
  // that an uncaught confinement throw reached the user as a stack trace and
  // exit 1.
  let inventory: Inventory | undefined;
  assert.doesNotThrow(() => {
    inventory = takeInventory(reader);
  });
  assert.ok(inventory !== undefined);

  const located = inventory.storyLocation;
  assert.equal(located.state, 'out-of-tree');
  assert.equal(located.declared, '/etc');
  // The **resolved** form, which is what the report names. Compared against
  // `canonical('/etc')` rather than against the literal string, because on
  // macOS `/etc` is a symlink to `/private/etc` — an earlier version of this
  // row compared the reported *spelling* against a resolved path and failed
  // there, on a platform NFR-12 requires.
  assert.equal(located.path, canonical('/etc'), 'the path is reported, which is FR-74');
  assert.equal(located.reason, outOfTreeReport(canonical('/etc')));

  // **Nothing at or under it was read.** Both spellings are filtered, not just
  // the canonical one: on macOS `canonical('/etc')` is `/private/etc`, so a
  // filter over that alone matched nothing and the assertion passed vacuously
  // wherever it mattered most.
  const outside = [canonical('/etc'), '/etc'];
  const touched = asked.filter((path) =>
    outside.some((prefix) => path === prefix || path.startsWith(`${prefix}${sep}`)),
  );
  assert.deepEqual(
    touched,
    [],
    `the tool read a path outside the project: ${touched.join(', ')} (of ${asked.join(', ')})`,
  );
  assert.ok(asked.length > 0, 'the recorder saw nothing at all — it is not wired up');
  // And the recorder is proved to be able to see the tracking file, so "nothing
  // outside" is a claim about the filter rather than about a silent reader.
  assert.ok(
    asked.some((path) => path.endsWith(TRACKING_FILE)),
    `the recorder never saw the tracking file: ${asked.join(', ')}`,
  );
});

test('a relative location that escapes is reported out-of-tree, with the .. already resolved', async (t) => {
  const located = await locatedIn(t, `${STORY_LOCATION_FIELD}: ../../elsewhere`);
  assert.equal(located.state, 'out-of-tree', located.reason);
  assert.equal(located.declared, '../../elsewhere');
  assert.ok(located.path !== undefined);
  assert.equal(
    located.path.includes('..'),
    false,
    `the reported path still holds a traversal segment: ${located.path}`,
  );
  assert.ok(located.path.endsWith(`${sep}elsewhere`), located.path);
});

test('a link inside the project that points out of it is out-of-tree', async (t) => {
  // **The security-critical direction, and it had no test at all.** Replacing
  // the resolved-form containment check with a bare `ok: true` left the suite
  // green at 756: every other declared value in it is decided by the sanitizer
  // or by the spelling, and the one symlink row that existed faced the other
  // way. This is the row that fails that mutation.
  if (!(await symlinksAvailable())) {
    t.skip('this platform cannot create symlinks without elevation');
    return;
  }
  const outside = await makeTree(t, [{ dir: 'target' }], 'bmad-dash-escape-');
  const root = await makeTree(t, [
    ...PROJECT,
    { link: 'escape', to: join(outside, 'target'), type: 'dir' },
    { file: TRACKING_RELATIVE, text: trackingFile(`${STORY_LOCATION_FIELD}: escape`) },
  ]);

  const located = takeInventory(new ConfinedReader(canonical(root))).storyLocation;
  assert.equal(
    located.state,
    'out-of-tree',
    `a link inside the project leading out of it must be refused: ${located.reason}`,
  );
  assert.equal(located.declared, 'escape', 'the spelling was in bounds; the destination was not');
  assert.equal(located.path, canonical(join(outside, 'target')), 'the report names where it went');
});

test('a path outside the project by spelling that resolves inside it is in-tree', async (t) => {
  // **The opposite direction, and it was a live defect.** Answering containment
  // from the spelling reported this as out-of-tree, permanently, with no
  // recovery — and it is the ordinary shape: `/tmp` is a symlink to
  // `/private/tmp` on macOS, and a symlinked home does the same on Linux. A
  // correct configuration made the tool print "Story location points outside
  // the project". Both paths carried the `CanonicalPath` brand while not being
  // in the same form, which is the one thing that brand exists to guarantee.
  if (!(await symlinksAvailable())) {
    t.skip('this platform cannot create symlinks without elevation');
    return;
  }
  const base = await makeTree(t, [
    { dir: 'real/proj/_bmad' },
    { dir: 'real/proj/_bmad-output/stories' },
    { link: 'alias', to: 'real', type: 'dir' },
  ]);
  const root = join(base, 'real', 'proj');
  // The same directory, named through the aliased ancestor. `/`-separated,
  // because a declared location is written that way in a YAML file whatever the
  // platform.
  const declared = join(base, 'alias', 'proj', '_bmad-output', 'stories')
    .split(sep)
    .join('/');
  await writeTracking(root, trackingFile(`${STORY_LOCATION_FIELD}: ${declared}`));

  const located = takeInventory(new ConfinedReader(canonical(root))).storyLocation;
  assert.equal(
    located.state,
    'in-tree',
    `the same directory reached through a symlinked ancestor is in the project: ${located.reason}`,
  );
  assert.equal(
    located.path,
    canonical(join(root, '_bmad-output', 'stories')),
    'and it is reported at the canonical path, not at the alias',
  );
});

test("the shipped template's quoted form is read, and resolves in-tree", async (t) => {
  // `.claude/skills/bmad-sprint-planning/sprint-status-template.yaml:50` writes
  // `story_location: "docs/stories"`, so both quoting forms occur in the wild
  // and the reader has to handle both.
  const located = await locatedIn(t, `${STORY_LOCATION_FIELD}: "docs/stories"`, [
    { dir: 'docs/stories' },
  ]);
  assert.equal(located.state, 'in-tree', located.reason);
  assert.equal(located.declared, 'docs/stories', 'the quotes are not part of the value');
});

test('no sprint-status.yaml at all is absent, and a file with no key is undeclared', async (t) => {
  const bare = await makeTree(t, PROJECT);
  const missing = takeInventory(new ConfinedReader(canonical(bare))).storyLocation;
  assert.equal(missing.state, 'absent');
  assert.equal(missing.tracking.state, 'absent');
  assert.match(missing.reason, /normal project shape/);
  // No stage, and `Readability` documents what that means: nothing was
  // attempted. The answer came from the walk's own output, so no read of the
  // tracking path was ever begun — naming a stage here would claim an attempt
  // that never happened.
  assert.equal(
    missing.tracking.state === 'absent' ? missing.tracking.stage : 'unexpected',
    undefined,
  );

  // The file is there, readable, and says nothing about where stories live.
  const silent = await locatedIn(t, 'last_updated: 09-02-2026 22:22');
  assert.equal(silent.state, 'undeclared');
  assert.equal(silent.tracking.state, 'present');

  assert.notEqual(missing.state, silent.state, 'absent and undeclared are different facts');
});

test('a key with nothing after it is declined, and that is not undeclared either', async (t) => {
  // AD-13's shape at this reader: "no such key" and "a key that says nothing"
  // are different answers, and neither is an empty success. A `?? ''` in the
  // pass would make this row resolve to the project root and read in-tree.
  const declined = await locatedIn(t, `${STORY_LOCATION_FIELD}:`);
  assert.equal(declined.state, 'declined', declined.reason);
  assert.equal(declined.path, undefined);
  assert.equal(declined.tracking.state, 'present');

  const undeclared = await locatedIn(t, 'project_key: NOKEY');
  assert.notEqual(declined.state, undeclared.state);
});

test('a tracking file that cannot be decoded is unreadable, not absent', async (t) => {
  // Story 1.9's readability signal, reused rather than restated: the location
  // state is this axis's answer and the signal carries the stage the read
  // stopped at.
  const root = await makeTree(t, PROJECT);
  await writeTracking(root, Buffer.from([0xff, 0xfe, 0x00, 0x41]));

  const located = takeInventory(new ConfinedReader(canonical(root))).storyLocation;
  assert.equal(located.state, 'unreadable');
  assert.equal(located.tracking.state, 'unreadable');
  assert.equal(
    located.tracking.state === 'unreadable' ? located.tracking.stage : undefined,
    'decode',
  );
  assert.match(located.reason, /unknown/, 'the report says what is unknown, not only what failed');
});

test('an untrusted segment in a declared location is declined before any path is built', async (t) => {
  // NFR-17's filesystem half, through the whole path. Each of these would
  // otherwise contribute a path component nobody chose — a hidden directory, a
  // NUL that truncates a C string, a component whose meaning differs by
  // platform — and a mutation removing the sanitizer from `resolveDeclared`
  // turns every one of them into a resolution.
  const cases: readonly { readonly declared: string; readonly written: string }[] = [
    { declared: 'docs/.hidden/stories', written: '"docs/.hidden/stories"' },
    { declared: 'docs/sto\u0000ries', written: '"docs/sto\\0ries"' },
    { declared: 'C:\\stories', written: '"C:\\\\stories"' },
  ];
  for (const { declared, written } of cases) {
    const located = await locatedIn(t, `${STORY_LOCATION_FIELD}: ${written}`);
    assert.equal(located.state, 'declined', `${declared} was not declined: ${located.reason}`);
    assert.equal(located.path, undefined, `${declared} produced a path`);
    assert.match(located.reason, /sanitizer/, located.reason);
    assert.equal(located.declared, declared, 'the value the project wrote is on the record');
  }
});

// ---------------------------------------------------------------------------
// The rows the review round found missing
// ---------------------------------------------------------------------------

test('an in-tree location that is not there is unresolved, not in-tree', async (t) => {
  // **`in-tree` used to claim nothing about the place existing.** A declared
  // `docs/does-not-exist` came back `in-tree`, because `canonical` degrades
  // silently to the spelling when the resolver cannot answer — so the
  // containment re-ask had checked a spelling and the record read as though the
  // directory were there. FR-75 asks for sprint-derived views to be
  // "unavailable rather than empty or broken", which needs a state that says
  // configured, in bounds, and not there.
  const missing = await locatedIn(t, `${STORY_LOCATION_FIELD}: docs/does-not-exist`);
  assert.equal(missing.state, 'unresolved', missing.reason);
  assert.ok(missing.path !== undefined, 'the place it named is still reported');
  assert.match(missing.reason, /could not be resolved/);
  assert.equal(missing.tracking.state, 'present', 'the tracking file itself read fine');

  // And a location that *is* there is still `in-tree`, so the new state has not
  // swallowed the ordinary case.
  const present = await locatedIn(t, `${STORY_LOCATION_FIELD}: docs/stories`, [
    { dir: 'docs/stories' },
  ]);
  assert.equal(present.state, 'in-tree', present.reason);
  assert.notEqual(present.state, missing.state);
});

test('a stray sprint-status file elsewhere in the tree cannot supply the location', async (t) => {
  // **Measured defect: sort order decided what the tool may read.** The real
  // file declaring `docs/real` plus a stray
  // `_bmad-output/architecture-x/sprint-status.yaml` declaring `/etc` reported
  // out-of-tree `/etc`, because the stray sorted before
  // `implementation-artifacts` and the search took the first `identified`
  // `sprint-tracking` entry in walk order. `identity.ts`'s level-4 hint
  // resolves that family from a name **anywhere** in the tree, so the premise
  // that a project cannot hold two did not survive the hint level.
  const located = await locatedIn(t, `${STORY_LOCATION_FIELD}: docs/real`, [
    { dir: 'docs/real' },
    {
      file: '_bmad-output/architecture-x/sprint-status.yaml',
      text: trackingFile(`${STORY_LOCATION_FIELD}: /etc`),
    },
  ]);
  assert.equal(located.state, 'in-tree', located.reason);
  assert.equal(located.declared, 'docs/real', 'the level-1 verdict decides, not the sort order');
  assert.deepEqual(located.candidates, []);
});

test('two tracking files at level 1 are reported ambiguous, never resolved', async (t) => {
  // Where the level-1 rule still finds two, FR-73's own rule applies: present
  // the ambiguity rather than resolve it silently. The producible shape is two
  // *extensions* of the same stem in the one document root that carries the
  // `sprint-status` rule — `identity.ts` keys level 1 on the filename stem, so
  // `sprint-status.yaml` and `sprint-status.yml` are both sprint tracking, in
  // the right place, with nothing to choose between them.
  const root = await makeTree(t, [
    ...PROJECT,
    { file: TRACKING_RELATIVE, text: trackingFile(`${STORY_LOCATION_FIELD}: docs/one`) },
    {
      file: '_bmad-output/implementation-artifacts/sprint-status.yml',
      text: trackingFile(`${STORY_LOCATION_FIELD}: /etc`),
    },
    { dir: 'docs/one' },
  ]);
  const located = takeInventory(new ConfinedReader(canonical(root))).storyLocation;
  assert.equal(located.state, 'ambiguous', located.reason);
  assert.equal(located.path, undefined, 'nothing is read while nothing says which file is meant');
  assert.equal(located.declared, undefined);
  assert.equal(located.candidates.length, 2, located.candidates.join(', '));
  assert.deepEqual(
    [...located.candidates].sort(),
    [
      '_bmad-output/implementation-artifacts/sprint-status.yaml',
      '_bmad-output/implementation-artifacts/sprint-status.yml',
    ],
    'both are named, because "one of these two is wrong" is only actionable if the reader is told which two',
  );
  // `unchecked`, not `unreadable`: no read was attempted, because the question
  // of which file to read has no answer.
  assert.equal(located.tracking.state, 'unchecked');
});

test('a tracking file opening with a document-start marker still declares its location', async (t) => {
  // **The reader's own empty success.** `readUnfenced` began the shared scan at
  // line 0 and the scan's first act is the fence test, so a leading `---`
  // terminated it before a single key was read — and the pass reported
  // "declares no story_location" over a file that plainly declared one. That is
  // exactly the AD-13 shape this story's vocabulary exists to prevent,
  // committed by the reader the story added.
  const root = await makeTree(t, PROJECT);
  await writeTracking(
    root,
    `---\n${STORY_LOCATION_FIELD}: docs/stories\nproject: bmad-dash\n`,
  );
  await mkdir(join(root, 'docs', 'stories'), { recursive: true });

  const located = takeInventory(new ConfinedReader(canonical(root))).storyLocation;
  assert.equal(located.state, 'in-tree', located.reason);
  assert.equal(located.declared, 'docs/stories');
});

test('a story_location declared twice is declined, not silently first-wins', async (t) => {
  // **The dashboard would have named one location while BMAD used the other.**
  // The scan reports the repeat and the reader discarded the report, so
  // `docs/stories` then `/etc` came back as `docs/stories` — first-wins — while
  // every YAML parser takes the last. Two readings with nothing to prefer
  // between them is the case this codebase declines everywhere else.
  const declined = await locatedIn(
    t,
    `${STORY_LOCATION_FIELD}: docs/stories\n${STORY_LOCATION_FIELD}: /etc`,
    [{ dir: 'docs/stories' }],
  );
  assert.equal(declined.state, 'declined', declined.reason);
  assert.equal(declined.path, undefined, 'neither reading is served');
  assert.match(declined.reason, /more than once/);
  assert.equal(declined.tracking.state, 'present');
});
