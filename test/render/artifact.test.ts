/**
 * The artifact-view shell: what a reader gets when they open one artifact.
 *
 * Three contracts, and the third is the one this story exists for:
 *
 *   1. **It is a surface.** The global project header is on it, because
 *      `EXPERIENCE.md:59` puts that header on every surface and a second
 *      surface is exactly where a rule like that first goes unhonoured. One
 *      `h1`, named from the document's own surface table.
 *   2. **It says what the inventory row says.** Not something adjacent to it —
 *      the same facts, from the same code, so a reader who follows a link and
 *      finds a different account of the artifact is a failing test rather than
 *      a bug report.
 *   3. **Resolution is a set-membership test.** `findArtifact` answers from the
 *      view's rows and from nothing else, so an artifact that exists on disk
 *      and is not a row is not found, and a row whose file has vanished still
 *      is. That is the property `test/server.test.ts` then exercises end to
 *      end.
 *   4. **It shows the artifact.** Story 2.1b's addition, and the fourth
 *      contract: the body arrives as an argument and each of the matrix's five
 *      outcomes — content, empty, unreadable, over-large and directory — has a
 *      rendering that says which it is. `test/render/markdown.test.ts` owns
 *      what a parser does with markdown; this file owns the dispatch and the
 *      shell it lands in.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARTIFACT_SURFACE_TITLE,
  EMPTY_BODY_SENTENCE,
  findArtifact,
  renderArtifact,
  type ArtifactBody,
} from '../../src/render/artifact.ts';
import { RENDER_EMBEDDED_HTML } from '../../src/render/markdown.ts';
import { MAX_READ_BYTES } from '../../src/adapters/fs/read.ts';
import { SIGNAL_LABELS } from '../../src/domain/signal.ts';
import { UNPLACED_TILE_LABEL, type InventoryView } from '../../src/render/inventory.ts';
import { FAMILY_LABELS } from '../../src/domain/identity.ts';
import { PAGE_TITLE, renderPage } from '../../src/render/page.ts';
import { DASHBOARD_HREF, SIGNAL_NOT_CHECKED } from '../../src/render/chrome.ts';
import {
  NO_DATE_IN_NAME,
  REUSE_ACCIDENTAL,
  REUSE_DELIBERATE,
  RUN_MAY_HOLD_SEVERAL,
  UNINTERPRETED,
  allLevelsTried,
} from '../../src/render/inventory.ts';
import { escapeHtml } from '../../src/render/html.ts';
import { artifactUrl } from '../../src/domain/url.ts';
import { canonical } from '../../src/adapters/fs/paths.ts';
import { snapshotIdOf } from '../../src/cli/index.ts';
import {
  AMBIGUOUS_BOTH_ROW,
  CERTAIN_ROW,
  DELIBERATE_RUN_ROW,
  FULL_INVENTORY_VIEW,
  HOSTILE_NAME,
  HOSTILE_PATH,
  HOSTILE_ROW,
  NOT_FOUND_ROW,
  READABLE_BODY,
  UNIDENTIFIED_ROW,
  UNINTERPRETED_ROW,
  UNREADABLE_ROW,
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

/**
 * A synthetic absolute root, unlike this repository's own path so a real path
 * leaking into an assertion is visible.
 */
const PROJECT_ROOT = canonical('/tmp/bmad-dash-test-project');

/**
 * The page for one path in one view, or a failure naming what was missing.
 *
 * The body defaults to `READABLE_BODY`, so a test about the shell states the
 * shell and nothing else — and the shared fixture is what keeps a `<script>` or
 * an `https://` URL out of the bodies the "serves no script and fetches
 * nothing" assertions run over. A test about content passes its own.
 */
function pageFor(view: InventoryView, path: string, body: ArtifactBody = READABLE_BODY): string {
  const found = findArtifact(view, path);
  assert.ok(found !== undefined, `${path} is not a row in this view`);
  return renderArtifact(PROJECT_ROOT, found, body);
}

// ---------------------------------------------------------------------------
// Resolution: the snapshot's rows, and nothing else
// ---------------------------------------------------------------------------

test('a row is found by its exact project-relative path, and nothing else is', () => {
  assert.equal(findArtifact(FULL_INVENTORY_VIEW, CERTAIN_ROW.path)?.row, CERTAIN_ROW);
  assert.equal(findArtifact(FULL_INVENTORY_VIEW, UNIDENTIFIED_ROW.path)?.row, UNIDENTIFIED_ROW);
  // Near misses, each of which a filesystem resolver would have opened: a
  // prefix, a suffix, a differing case, a leading slash and an absolute path.
  for (const near of [
    '_bmad-output',
    '_bmad-output/planning-artifacts/prds',
    `${CERTAIN_ROW.path}x`,
    CERTAIN_ROW.path.toUpperCase(),
    `/${CERTAIN_ROW.path}`,
    `./${CERTAIN_ROW.path}`,
    'etc/passwd',
    '',
  ]) {
    assert.equal(findArtifact(FULL_INVENTORY_VIEW, near), undefined, `${near} must not resolve`);
  }
});

test('the family a row was placed under travels with it, so the page can name it', () => {
  // The row itself does not carry a family — an ambiguous verdict may name two
  // and an unidentified one names none — so the lookup returns the group's,
  // which is the placement the projection already made.
  assert.equal(findArtifact(FULL_INVENTORY_VIEW, CERTAIN_ROW.path)?.family, 'prd');
  assert.equal(findArtifact(FULL_INVENTORY_VIEW, AMBIGUOUS_BOTH_ROW.path)?.family, undefined);
  assert.equal(findArtifact(FULL_INVENTORY_VIEW, UNIDENTIFIED_ROW.path)?.family, undefined);
});

test('a row whose file is gone still resolves; a file that is not a row does not', () => {
  // The two halves of "resolution is a set-membership test", stated over the
  // resolver itself. `NOT_FOUND_ROW` names a path with nothing behind it and is
  // found because it is a row; this test file exists on disk and is not found
  // because it is not one. A resolver that consulted the filesystem would fail
  // both directions at once.
  const gone = '_bmad-output/planning-artifacts/prds/gone.md';
  assert.ok(findArtifact(FULL_INVENTORY_VIEW, gone) !== undefined, 'a recorded absence is a row');
  assert.equal(findArtifact(FULL_INVENTORY_VIEW, 'test/render/artifact.test.ts'), undefined);
  assert.equal(findArtifact(FULL_INVENTORY_VIEW, 'package.json'), undefined);
});

// ---------------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------------

test('the surface name is EXPERIENCE.md own, not a second copy of it', async () => {
  // UX-DR17's rule applied to a heading: a literal in source that merely
  // happens to match the surface table is free to drift the moment either side
  // is edited. The table's first column is the surface's name.
  const experience = await readFile(EXPERIENCE_PATH, 'utf8');
  const surfaces = [...experience.matchAll(/^\|\s*\*\*([^*]+)\*\*\s*\|/gm)].map(
    (match) => (match[1] ?? '').trim(),
  );
  assert.ok(surfaces.length > 3, `the surface table parsed to ${String(surfaces.length)} rows`);
  assert.ok(
    surfaces.includes(ARTIFACT_SURFACE_TITLE),
    `"${ARTIFACT_SURFACE_TITLE}" is not a surface EXPERIENCE.md names: ${surfaces.join(', ')}`,
  );
});

test('the shell is a whole document: head, chrome, one h1, one main', () => {
  const page = pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path);
  assert.ok(page.startsWith('<!doctype html>'), 'a served document, not a fragment');
  assert.ok(page.includes(`<title>${PAGE_TITLE}</title>`));
  assert.ok(page.includes('<html lang="en">'), 'a language is declared');
  // `EXPERIENCE.md:59` — the project header is on every surface, and this is
  // the second surface. It is asserted through its own markup rather than
  // through `projectHeader`, so removing the call fails here.
  assert.ok(page.includes('<header class="project-header">'));
  assert.ok(page.includes(PROJECT_ROOT), 'the header names the project that is open');
  assert.ok(page.includes(`${'Git:'} ${SIGNAL_NOT_CHECKED}`), 'the chrome signal comes with it');
  // And the refresh control re-requests *this* artifact rather than the
  // Dashboard: `EXPERIENCE.md:161` forbids replacing the current surface under
  // the reader, and `:153` gives this surface "stays on its snapshot".
  assert.ok(
    page.includes(`class="project-refresh" href="${artifactUrl(CERTAIN_ROW.path)}"`),
    'the refresh control points at the artifact, not at the Dashboard',
  );
  assert.ok(!page.includes(`class="project-refresh" href="${DASHBOARD_HREF}"`));
  assert.equal((page.match(/<h1>/g) ?? []).length, 1, 'one h1 per surface');
  assert.ok(page.includes(`<h1>${ARTIFACT_SURFACE_TITLE}</h1>`));
  assert.equal((page.match(/<main>/g) ?? []).length, 1);
});

test('the page states which artifact it is, in the mono family', () => {
  const page = pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path);
  assert.ok(page.includes(`<code class="artifact-path">${CERTAIN_ROW.path}</code>`));
});

test('the page states exactly what the inventory row states about the artifact', () => {
  // Not "something about it": the type cell, the content signal and FR-12's
  // sentence, each of which the Dashboard shows for this same row.
  const page = pageFor(FULL_INVENTORY_VIEW, UNINTERPRETED_ROW.path);
  assert.ok(page.includes('<span class="artifact-type">'), 'the shape the verdict resolved');
  assert.ok(page.includes('Content: Not checked'), 'the readability signal, captioned');
  assert.ok(page.includes(UNINTERPRETED), "FR-12's sentence travels with the row");
  // And a row that failed to read names the stage it failed at.
  const unreadable = pageFor(FULL_INVENTORY_VIEW, '_bmad-output/planning-artifacts/prds/binary.md');
  assert.ok(unreadable.includes('Content: Unreadable'));
  assert.ok(unreadable.includes('<code class="artifact-stage">decode</code>'));
});

/** Every state cell in a fragment, in document order: the row's facts as markup. */
function factCells(html: string): readonly string[] {
  return [...html.matchAll(/<span class="artifact-(?:type|state|note)">[\s\S]*?<\/span>/g)].map(
    (match) => match[0],
  );
}

test('a run folder page carries the run sentences, not only its path', () => {
  // **Finding from Story 2.1a's review round.** Every row this file rendered had
  // `runFacts: []`, and the one server test touching a run row asserted only
  // status and path — so `renderArtifact` could have stopped calling
  // `artifactFacts` altogether and shipped a run-folder page missing FR-71's
  // disclosure, the reuse verdict and FR-72's dateless sentence, with the whole
  // suite green. These are the facts a reader opening a run folder most needs.
  const page = pageFor(FULL_INVENTORY_VIEW, DELIBERATE_RUN_ROW.path);
  assert.ok(page.includes(RUN_MAY_HOLD_SEVERAL), "FR-71's disclosure");
  assert.ok(page.includes(REUSE_DELIBERATE), 'and which way the reuse goes');
  assert.ok(page.includes(NO_DATE_IN_NAME), "and FR-72's dateless pair");
  // The other direction of the reuse distinction, so this cannot pass by the
  // page carrying one fixed sentence.
  const accidental = pageFor(FULL_INVENTORY_VIEW, '_bmad-output/planning-artifacts/prds/prd-z-2026-08-30');
  assert.ok(accidental.includes(REUSE_ACCIDENTAL));
  assert.ok(!accidental.includes(REUSE_DELIBERATE));
});

test('every fact the Dashboard row shows, the artifact page shows too — and no other', () => {
  // The module header claims sharing `artifactFacts` makes a divergent account
  // of one artifact "a failing test rather than a bug report". This is that
  // test, and it is a cross-check between two *renders* rather than two calls to
  // the same function: the cells are extracted from the Dashboard's markup and
  // from the artifact page's markup and compared as sequences, so dropping a
  // fact from either surface, reordering them, or rendering one of them
  // differently all fail here.
  const dashboard = renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW);
  const rows = [...dashboard.matchAll(/<li class="artifact-row">([\s\S]*?)<\/li>/g)].map(
    (match) => match[1] ?? '',
  );
  assert.ok(rows.length > 5, `only ${String(rows.length)} rows on the Dashboard`);

  let compared = 0;
  for (const group of FULL_INVENTORY_VIEW.groups) {
    for (const row of group.rows) {
      const onDashboard = rows.find((markup) => markup.includes(`>${escapeHtml(row.path)}</code>`));
      assert.ok(onDashboard !== undefined, `${row.path} has no row on the Dashboard`);
      assert.deepEqual(
        factCells(pageFor(FULL_INVENTORY_VIEW, row.path)),
        factCells(onDashboard ?? ''),
        `the two surfaces disagree about ${row.path}`,
      );
      compared += 1;
    }
  }
  // Not vacuous, and it covers every shape the fixture carries — run facts,
  // ambiguity, unreadable, absent, unidentified.
  assert.equal(compared, FULL_INVENTORY_VIEW.artifactCount);
  assert.ok(
    factCells(pageFor(FULL_INVENTORY_VIEW, DELIBERATE_RUN_ROW.path)).length >= 4,
    'and at least one compared row carries more than a type and a state',
  );
});

test('the tile is labelled by the family the row was placed under', () => {
  // Zero invented copy: on the Dashboard the family is said by *which tile* the
  // row is in, and this carries that through rather than inventing a label no
  // document carries.
  const page = pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path);
  assert.ok(page.includes(`<h2 class="tile-label">${FAMILY_LABELS.prd}</h2>`));
});

test('an unidentified artifact has a page, and the page says so', () => {
  // `EXPERIENCE.md:183` keeps its *row* from being a link; it does not hide the
  // artifact, and a URL that 404'd for a row the reader can see would be the
  // tool concealing something it listed.
  const page = pageFor(FULL_INVENTORY_VIEW, UNIDENTIFIED_ROW.path);
  assert.ok(page.includes(`<code class="artifact-path">${UNIDENTIFIED_ROW.path}</code>`));
  assert.ok(page.includes(allLevelsTried()), "FR-69's sentence, with the levels tried");
  assert.ok(
    page.includes(`<h2 class="tile-label">${UNPLACED_TILE_LABEL}</h2>`),
    'and the tile says no family resolved, rather than guessing one',
  );
  assert.ok(!page.includes('<span class="artifact-type">'), 'an unidentified verdict has no type');
});

test('an ambiguous artifact keeps both readings, and is not ranked into one', () => {
  const page = pageFor(FULL_INVENTORY_VIEW, AMBIGUOUS_BOTH_ROW.path);
  assert.equal(
    (page.match(/<span class="artifact-type">/g) ?? []).length,
    2,
    'one cell per reading; AD-4 forbids resolving the ambiguity silently',
  );
  assert.ok(page.includes(`<h2 class="tile-label">${UNPLACED_TILE_LABEL}</h2>`));
});

test('a hostile filename renders as text on this surface too, creating no element', () => {
  // The escaping question is asked again here rather than assumed from the
  // Dashboard: this is a second document builder, and "the other page escapes
  // it" is exactly the reasoning that leaves a new surface unescaped.
  const page = pageFor(FULL_INVENTORY_VIEW, HOSTILE_PATH);
  assert.ok(page.includes('&lt;img src=x onerror=alert(1)&gt;.md'), 'the escaped name appears');
  assert.ok(!page.includes(HOSTILE_NAME), 'the raw name must not reach the document');
  assert.ok(!page.includes('<img'), 'no element may be created by a filename');
  assert.equal(findArtifact(FULL_INVENTORY_VIEW, HOSTILE_ROW.path)?.row, HOSTILE_ROW);
});

test('the surface serves no script and fetches nothing', () => {
  const page = pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path);
  assert.doesNotMatch(page, /<script\b/i, 'the scripted model belongs to the reader stories');
  assert.doesNotMatch(page, /<link\b/i);
  assert.doesNotMatch(page, /https?:\/\//i);
  assert.doesNotMatch(page, /\sstyle=/);
});

test('the shell writes only the elements it owns, and the content region is one of them', () => {
  // **This test said the opposite until Story 2.1b, and it said so on purpose.**
  // Its previous form was `no artifact content is rendered: this story serves
  // the shell only`, with a tag allowlist that rejected `<pre>`, `<article>` and
  // `<blockquote>` and a comment predicting that "a later story that starts
  // rendering content will fail here and have to say so". This is that story and
  // this is it saying so: the old claim was that the surface *cannot* show
  // content because no bytes reach it, and bytes now reach it as
  // `renderArtifact`'s third argument, so the claim is not weakened — it is
  // false.
  //
  // What survives is the half that is still worth enforcing, and it is why the
  // allowlist is kept rather than deleted. The shell must not grow elements of
  // its own without a decision: the surface's markup outside the content region
  // is a fixed set, and `<article class="artifact-content">` is the *one*
  // addition, which is what makes "the shell writes no element a document
  // viewer would need" still true of everything but the document itself.
  //
  // The parser's own vocabulary is deliberately not listed here — it is not the
  // shell's, it is the document's, and pinning it would make this test fail
  // whenever a fixture used a new markdown construct. `test/render/markdown.test.ts`
  // is where what the parser emits is asserted.
  const page = pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path, { ok: true, text: 'plain text' });
  const tags = new Set(
    [...page.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)].map((match) => match[1] ?? ''),
  );
  assert.deepEqual(
    [...tags].filter(
      (tag) =>
        ![
          'html', 'head', 'meta', 'title', 'style', 'body', 'header', 'p', 'code', 'a',
          'main', 'h1', 'div', 'section', 'h2', 'span',
          // Story 2.1b: the reading surface, and the only element the shell
          // gained. `DESIGN.md:255` puts a rendered document in its own column
          // rather than in a tile, so it is a sibling of the tile grid.
          'article',
        ].includes(tag),
    ),
    [],
    'the shell writes no element a document viewer would need',
  );
  // And the region is there, with the class the stylesheet's measure hangs on.
  assert.ok(page.includes('<article class="artifact-content">'));
});

test('the page is a function of the view and the body, and of nothing else', () => {
  // **Widened by Story 2.1b, deliberately.** This test was `the page is a
  // function of the view`, and that claim is no longer the whole truth: the
  // body is a second input, so two pages from one view can differ. The reason
  // the old claim cannot simply be kept is on this story's own record — text on
  // `ArtifactRow` would have fed every artifact's bytes into `snapshotIdOf`,
  // which digests the whole view, and would have made a page load read every
  // file in the project instead of one.
  //
  // What the old test was *for* is preserved below and is still exact: with the
  // body held fixed, the page is a function of the view's rows, so the identity
  // the adapter reports cannot be a snapshot the page did not come from. The
  // second half is new and is the other direction — with the view held fixed,
  // the body changes the page, which is what makes the argument load-bearing
  // rather than accepted and ignored.
  const other: InventoryView = {
    ...FULL_INVENTORY_VIEW,
    snapshotId: snapshotIdOf(PROJECT_ROOT, {
      complete: FULL_INVENTORY_VIEW.complete,
      artifactCount: FULL_INVENTORY_VIEW.artifactCount,
      namesLeftOut: FULL_INVENTORY_VIEW.namesLeftOut + 1,
      aliases: FULL_INVENTORY_VIEW.aliases,
      groups: FULL_INVENTORY_VIEW.groups,
    }),
  };
  assert.notEqual(other.snapshotId, FULL_INVENTORY_VIEW.snapshotId);
  // The rows are the same, so the *page* is the same — the identity names the
  // scan, not the representation, which is why this server carries it as a
  // header rather than as an `ETag`.
  assert.equal(pageFor(other, CERTAIN_ROW.path), pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path));
  // And the body is the second input, not a decoration: the same view and the
  // same row with a different body is a different page.
  assert.notEqual(
    pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path, { ok: true, text: '# Something else\n' }),
    pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path),
  );
});

// ---------------------------------------------------------------------------
// The content: Story 2.1b's five outcomes, one per matrix row
// ---------------------------------------------------------------------------

/** The content region alone, so an assertion cannot pass on the shell's markup. */
function contentOf(page: string): string {
  const region = /<article class="artifact-content">([\s\S]*?)<\/article>/.exec(page);
  assert.ok(region !== null, 'the page has no content region');
  return region[1] ?? '';
}

test('a readable markdown artifact is in the page as server-rendered HTML', () => {
  const page = pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path, {
    ok: true,
    text: '# Title\n\nA paragraph with *emphasis*.\n\n- one\n- two\n',
  });
  const content = contentOf(page);
  assert.match(content, /<p>A paragraph with <em>emphasis<\/em>\.<\/p>/);
  assert.match(content, /<li>one<\/li>/);
  // The document's own heading is **not** a second `h1`: `EXPERIENCE.md:224`
  // gives the surface one and it names the surface, so the document's levels
  // are demoted by one. Asserted over the whole page, because the failure this
  // catches is two `h1`s rather than a wrong tag in the region.
  assert.equal((page.match(/<h1>/g) ?? []).length, 1, 'one h1 per surface, still');
  assert.match(content, /<h2>Title<\/h2>/);
  // No script and no fetch on the way in either: this is the same rule the
  // shell is held to, asked again now that the region carries project bytes.
  assert.doesNotMatch(page, /<script\b/i);
  assert.doesNotMatch(page, /\sstyle=/);
});

test('an artifact of zero bytes says so, and nothing stands in for it', () => {
  for (const text of ['', '   ', '\n\n\t\n']) {
    const content = contentOf(pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path, { ok: true, text }));
    assert.equal(
      content.trim(),
      `<p class="artifact-empty">${EMPTY_BODY_SENTENCE}</p>`,
      `${JSON.stringify(text)} must read exactly "${EMPTY_BODY_SENTENCE}"`,
    );
  }
  // Verbatim, and pinned: the sentence is the fact the reader acts on, so a
  // reworded constant is a change to state rather than a rename.
  assert.equal(EMPTY_BODY_SENTENCE, 'Empty file.');
});

test('bytes that are not text render in place, naming the state and the decode stage', () => {
  const page = pageFor(FULL_INVENTORY_VIEW, UNREADABLE_ROW.path, {
    ok: false,
    state: 'unreadable',
    stage: 'decode',
    reason: 'not valid UTF-8 text',
  });
  const content = contentOf(page);
  assert.match(content, /class="artifact-failure"/);
  assert.ok(content.includes(SIGNAL_LABELS.unreadable), 'the state word, from the one table');
  assert.ok(content.includes('<code class="artifact-stage">decode</code>'), 'and the stage');
  assert.ok(content.includes('not valid UTF-8 text'), 'and what the reader can act on');
  // **In place, never fatal to the page.** The shell, the path and the row's own
  // facts all still render — AD-7's whole point.
  assert.ok(page.startsWith('<!doctype html>'));
  assert.ok(page.includes(`<h1>${ARTIFACT_SURFACE_TITLE}</h1>`));
  assert.ok(page.includes(`<code class="artifact-path">${UNREADABLE_ROW.path}</code>`));
  assert.ok(page.includes('Content: Unreadable'), "the inventory row's own signal is untouched");
});

test('an over-large artifact names the size and the limit, at the examine stage', () => {
  const size = MAX_READ_BYTES + 1;
  const content = contentOf(
    pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path, {
      ok: false,
      state: 'unreadable',
      stage: 'examine',
      reason: `file is ${String(size)} bytes, over the ${String(MAX_READ_BYTES)}-byte read limit`,
    }),
  );
  assert.ok(content.includes('<code class="artifact-stage">examine</code>'));
  assert.ok(content.includes(String(size)), 'the size it actually is');
  assert.ok(content.includes(String(MAX_READ_BYTES)), 'and the limit it is over');
});

test('a row whose file is gone since the scan renders as absent, at the resolve stage', () => {
  const content = contentOf(
    pageFor(FULL_INVENTORY_VIEW, NOT_FOUND_ROW.path, {
      ok: false,
      state: 'absent',
      stage: 'resolve',
      reason: "ENOENT: no such file or directory, stat '/tmp/x/gone.md'",
    }),
  );
  // `Not found`, not `Unreadable`: one physical fact with one answer, and the
  // same word the walk itself would have reported.
  assert.ok(content.includes(SIGNAL_LABELS.absent));
  assert.ok(!content.includes(SIGNAL_LABELS.unreadable));
  assert.ok(content.includes('<code class="artifact-stage">resolve</code>'));
});

test('a directory artifact has no body, and the shell says so rather than failing', () => {
  // A run folder and a sharded-document row are both directories, and
  // `ConfinedReader.readText` refuses anything that is not a regular file
  // *before* opening it — so this is the value it actually returns, not an
  // invented shape. The fixture is the real one: `DELIBERATE_RUN_ROW`.
  const page = pageFor(FULL_INVENTORY_VIEW, DELIBERATE_RUN_ROW.path, {
    ok: false,
    state: 'unreadable',
    stage: 'examine',
    reason: 'not a regular file (directory)',
  });
  const content = contentOf(page);
  assert.ok(content.includes('not a regular file (directory)'));
  assert.ok(content.includes('<code class="artifact-stage">examine</code>'));
  // And the run facts a reader opens a run folder for are still there.
  assert.ok(page.includes(RUN_MAY_HOLD_SEVERAL), "FR-71's disclosure survives the empty body");
});

test('a readable non-markdown artifact is preformatted text, not parsed', () => {
  // A `.yaml` through a markdown parser is not rendered, it is mangled: `#` is a
  // comment there and a heading here, and two-space indentation is structure
  // there and a continuation here.
  const yaml = '# a comment\nkey: value\nnested:\n  - one\n  - two\n';
  const content = contentOf(
    pageFor(FULL_INVENTORY_VIEW, UNINTERPRETED_ROW.path, {
      ok: true,
      text: yaml,
    }),
  );
  assert.match(content, /^\s*<pre class="artifact-source">/);
  assert.ok(content.includes('key: value'), 'the text is there as it was written');
  assert.doesNotMatch(content, /<h[1-6]>/, 'and no heading was invented from a comment');
  assert.doesNotMatch(content, /<li>/, 'and no list was invented from an indented sequence');
});

test('a non-markdown artifact carrying markup creates no element', () => {
  // The preformatted path escapes rather than trusting: it is the branch the
  // parser never sees, so `./markdown.ts`'s switch has no bearing on it and the
  // escaping has to be its own.
  const content = contentOf(
    pageFor(FULL_INVENTORY_VIEW, UNINTERPRETED_ROW.path, {
      ok: true,
      text: '<script>alert(1)</script>',
    }),
  );
  assert.ok(content.includes('&lt;script&gt;'), 'shown as the text it is');
  assert.doesNotMatch(content, /<script\b/i, 'and no element is created by it');
});

test('embedded markup in a document follows the constant, on this surface too', () => {
  // The dispatch honours `./markdown.ts`'s default rather than deciding for
  // itself: the surface has no second copy of the switch, which is what makes
  // the constant the one place it lives.
  const content = contentOf(
    pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path, { ok: true, text: 'a <b>bold</b> word\n' }),
  );
  if (RENDER_EMBEDDED_HTML) {
    assert.ok(content.includes('<b>bold</b>'), 'the constant is on, so the element is created');
  } else {
    assert.ok(content.includes('&lt;b&gt;bold&lt;/b&gt;'), 'the constant is off, so it is text');
    assert.doesNotMatch(content, /<b>/);
  }
});

test('a document that cannot be parsed renders in place, at the parse stage', () => {
  // AD-7 over the parser as well as over the reader: a document with one
  // pathological corner costs the reader that corner, not the page. The input
  // exhausts the parser's own recursion, which is the only way to reach the
  // failure without stubbing the parser out and testing the stub.
  const content = contentOf(
    pageFor(FULL_INVENTORY_VIEW, CERTAIN_ROW.path, { ok: true, text: '> '.repeat(20_000) + 'x' }),
  );
  assert.match(content, /class="artifact-failure"/);
  assert.ok(content.includes('<code class="artifact-stage">parse</code>'));
});
