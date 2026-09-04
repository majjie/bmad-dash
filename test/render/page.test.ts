/**
 * The served document, and the AD-2 seam it now sits behind.
 *
 * Story 1.1 held the page as a constant inside the HTTP adapter. AD-2 puts
 * document HTML in `src/render/`, so Story 1.2 moved it rather than styling it
 * in place — a page that gains a stylesheet in the transport layer gains
 * components there next. These tests pin the move (the adapter serves exactly
 * what render produces, byte for byte) and the properties of the document
 * itself: the tokens reach it, no literal does, and no font is fetched.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';

import { renderPage, PAGE_TITLE, SURFACE_TITLE } from '../../src/render/page.ts';
import { STYLESHEET } from '../../src/render/stylesheet.ts';
import { startServer } from '../../src/adapters/http/server.ts';
import { canonical } from '../../src/adapters/fs/paths.ts';
import { DASHBOARD_HREF } from '../../src/render/chrome.ts';
import {
  ARTIFACTS_TILE_LABEL,
  SCAN_TILE_LABEL,
  UNPLACED_TILE_LABEL,
} from '../../src/render/inventory.ts';
import { FAMILY_LABELS } from '../../src/domain/identity.ts';
import { EMPTY_INVENTORY } from '../support/cli.ts';
import { FULL_INVENTORY_VIEW, HOSTILE_NAME, readableBody } from '../support/inventory.ts';

/**
 * A synthetic absolute root. Fixed rather than `process.cwd()` so a test's
 * expectations do not change with the directory it is run from, and chosen to
 * look nothing like this repository so a path leaking from the real filesystem
 * into an assertion is visible.
 */
const PROJECT_ROOT = '/tmp/bmad-dash-test-project';
const CANONICAL_ROOT = canonical(PROJECT_ROOT);

/** Everything outside the inlined `<style>` element. */
function markupOnly(document: string): string {
  return document.replace(/<style>[\s\S]*?<\/style>/, '<style></style>');
}

function fetchRoot(url: string): Promise<{ status: number; body: string; contentType?: string }> {
  return new Promise((resolve, reject) => {
    const client = httpRequest(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          body,
          contentType: response.headers['content-type'],
        }),
      );
    });
    client.on('error', reject);
    client.end();
  });
}

test('the document carries the token stylesheet inline, and only inline', () => {
  const page = renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW);
  assert.ok(page.includes(`<style>\n${STYLESHEET}</style>`), 'the stylesheet must be inlined');
  assert.equal((page.match(/<style>/g) ?? []).length, 1);
  assert.ok(page.includes('--color-surface:'), 'the tokens must reach the document');
});

test('the document is one h1 inside a main landmark, with a language declared', () => {
  const page = renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW);
  assert.match(page, /^<!doctype html>\n<html lang="en">/);
  assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1, 'exactly one h1 per surface');
  assert.ok(page.includes('<main>') && page.includes('</main>'));
  // The h1 names the *surface*, not the tool. Once the banner states which
  // project is open, spending the page's one h1 on the tool's own name would
  // spend it on the thing the reader is least in doubt about.
  assert.ok(page.includes(`<h1>${SURFACE_TITLE}</h1>`), 'the h1 names the surface');
  assert.ok(!page.includes(`<h1>${PAGE_TITLE}</h1>`), 'the tool name belongs in title alone');
  assert.ok(page.includes(`<title>${PAGE_TITLE}</title>`), 'and it is still in title');
  // The placeholder tile is gone: `Serving. No surface built yet.` stopped
  // being true the moment the surface was built, and a status line saying so
  // beside a rendered inventory would be the page contradicting itself.
  assert.ok(!page.includes('No surface built yet'), 'the placeholder must not survive');
  // Terse and technical: label-shaped strings take no period.
  for (const label of [SURFACE_TITLE, SCAN_TILE_LABEL, ARTIFACTS_TILE_LABEL, UNPLACED_TILE_LABEL]) {
    assert.doesNotMatch(label, /\.$/, `${label} is label-shaped and takes no period`);
  }
});

test('rendering without a usable project root fails loudly, at the page level too', () => {
  // The check lives in `projectHeader`, so there is one place it can disagree
  // with itself rather than two. Asserted here as well because `renderPage` is
  // what the adapter calls, and a future refactor could route around the header.
  for (const bad of ['', '  ', '.', 'relative/path']) {
    assert.throws(() => renderPage(bad, FULL_INVENTORY_VIEW), /project root/);
  }
});

test('the banner and the surface are separate landmarks, in that order', () => {
  const page = renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW);
  assert.equal((page.match(/<header[ >]/g) ?? []).length, 1, 'exactly one banner');
  assert.equal((page.match(/<main[ >]/g) ?? []).length, 1, 'exactly one main');
  assert.ok(page.indexOf('<header') < page.indexOf('<main'), 'chrome precedes the surface');
  // The header is chrome, not part of the surface: nesting it inside main would
  // make it a section of the Dashboard and it must appear on every surface.
  const main = page.slice(page.indexOf('<main'));
  assert.ok(!main.includes('<header'), 'the banner must not be nested inside main');
});

test('the served surface carries at most one raised tile', () => {
  // `tileGrid` enforces the rule per call, which is not the same as per
  // surface: two grids on one page would each pass their own check, and `tile`
  // is exported and honours `raised: true` on its own. This asserts the
  // invariant where the surface actually exists.
  const page = renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW);
  assert.ok((page.match(/class="tile-raised"/g) ?? []).length <= 1, 'two raised tiles on one surface');
});

test('the tile label is a real heading below the surface heading', () => {
  const page = renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW);
  // Screen-reader users traverse the dashboard by structure, so a tile label is
  // an h2 under the surface's one h1 — never a styled div.
  assert.ok(page.includes(`<h2 class="tile-label">${SCAN_TILE_LABEL}</h2>`));
  assert.ok(page.includes(`<h2 class="tile-label">${FAMILY_LABELS.prd}</h2>`));
  assert.ok(page.indexOf('<h1') < page.indexOf('<h2'), 'the h1 precedes any h2');
  // And there is no third heading level: DESIGN.md's "a tile that needs two
  // headings is two tiles" makes a family label the tile's only heading, so an
  // artifact row is a list item rather than an h3.
  assert.doesNotMatch(page, /<h[3-6][ >]/, 'the surface uses two heading levels');
});

test('the markup carries no colour or size literal, and no inline style', () => {
  const markup = markupOnly(renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW));
  assert.doesNotMatch(markup, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(markup, /(?<![\w-])\d*\.?\d+(?:px|rem|em|ch|pt)\b/i);
  assert.doesNotMatch(markup, /\sstyle=/, 'no inline style: every value resolves through a token');
  // Story 1.2 asserted no `class` at all, because it built no components. That
  // assertion is superseded here, but only in the one direction the story
  // sanctions: classes are permitted, and each must be one this story defines.
  // An unknown class means markup styled by a rule nobody wrote, or a rule
  // written for markup nobody emits.
  const KNOWN_CLASSES = [
    'project-header',
    'project-name',
    'project-path',
    'project-signal',
    'project-refresh',
    'tile',
    'tile-raised',
    'tile-label',
    'tile-empty',
    'tile-grid',
    // A tile that spans the whole grid row, for one whose content qualifies the
    // tiles after it rather than sitting beside them.
    'tile-span',
    // Story 1.12's inventory. Each has a rule in `./stylesheet.ts`, and
    // `test/render/stylesheet.test.ts` asserts the other direction — a rule for
    // a class nothing renders.
    'artifact-list',
    'artifact-row',
    'artifact-path',
    'artifact-type',
    'artifact-state',
    'artifact-stage',
    'artifact-note',
    // Story 2.1a: an openable row is an anchor around the whole row, so the
    // link's accessible name carries the row's state rather than a bare path.
    'artifact-link',
    // Story 2.3's two surface action buttons. `button-ghost` is exercised by
    // this very page — Refresh carries it — and `button-primary` is listed
    // even though no surface renders one yet, on `.tile-raised`'s own
    // precedent: known ahead of use rather than unknown until 2.3a adds one.
    'button-ghost',
    'button-primary',
  ];
  const used = [...markup.matchAll(/\sclass="([^"]+)"/g)].flatMap((m) => (m[1] ?? '').split(/\s+/));
  assert.ok(used.length > 0, 'the markup must carry the classes its rules style');
  assert.deepEqual(
    used.filter((name) => !KNOWN_CLASSES.includes(name)),
    [],
    'the document carries a class this story does not define',
  );
});

test('no font, script or stylesheet is fetched from anywhere', () => {
  const page = renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW);
  assert.doesNotMatch(page, /<link\b/i);
  assert.doesNotMatch(page, /<script\b/i, 'no client-side JavaScript: refresh is a link');
  assert.doesNotMatch(page, /@font-face|@import/i);
  assert.doesNotMatch(page, /https?:\/\//i);
});

test('the polarity is dark, declared once, with no light theme', () => {
  const page = renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW);
  assert.ok(page.includes('color-scheme: dark;'));
  assert.doesNotMatch(page, /prefers-color-scheme/);
});

test('following the refresh link re-requests the surface and carries nothing across', async (t) => {
  // Refresh is navigation, not script: a page load builds a new snapshot. Two
  // successive GETs must therefore both succeed and, with nothing changed on
  // disk, produce byte-identical documents — no counter, no session, no state.
  //
  // On its own this assertion is satisfied by a server that never rebuilds
  // anything, which is what it was quietly asserting for one story. The test
  // below is its other half: with the supplier's answer changed, the second
  // response must differ.
  const handle = await startServer({ projectRoot: CANONICAL_ROOT, body: readableBody, inventory: () => FULL_INVENTORY_VIEW });
  t.after(() => handle.close());

  const fetchPage = async (): Promise<{ status: number; body: string }> =>
    await new Promise((settle, fail) => {
      const call = httpRequest(`${handle.url}`, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (body += chunk));
        response.on('end', () => settle({ status: response.statusCode ?? 0, body }));
      });
      call.on('error', fail);
      call.end();
    });

  const first = await fetchPage();
  const second = await fetchPage();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body, first.body, 'nothing may carry across a refresh');
  assert.ok(first.body.includes(`href="${DASHBOARD_HREF}"`), 'the refresh control is in the page');
});

test('the adapter serves exactly what render produces, headers unchanged', async (t) => {
  const handle = await startServer({ projectRoot: CANONICAL_ROOT, body: readableBody, inventory: () => FULL_INVENTORY_VIEW });
  t.after(() => handle.close());

  const response = await fetchRoot(handle.url);
  assert.equal(response.status, 200);
  assert.equal(response.contentType, 'text/html; charset=utf-8');
  assert.equal(response.body, renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW), 'the adapter must not reshape the document');
});

// ---------------------------------------------------------------------------
// Project-derived text reaches the page as text
// ---------------------------------------------------------------------------

test('a filename made of markup characters renders as text, creating no element', () => {
  // The one place project data becomes markup, asserted on the whole document
  // rather than on one helper: a repository can legally contain a file called
  // `<img src=x onerror=alert(1)>.md`, and the tool is pointed at projects the
  // user did not necessarily write — including ones just pulled from a remote,
  // which is exactly the case the read-only promise is meant to make safe.
  const page = renderPage(PROJECT_ROOT, FULL_INVENTORY_VIEW);
  // The expected form is spelled out rather than computed with `escapeHtml`: a
  // test that escapes with the function under test cannot tell escaping from
  // no escaping at all.
  assert.ok(
    page.includes('&lt;img src=x onerror=alert(1)&gt;.md'),
    'the escaped name must appear, so this cannot pass by omission',
  );
  assert.ok(!page.includes(HOSTILE_NAME), 'the raw name must not reach the document');
  assert.ok(!page.includes('<img'), 'no element may be created by a filename');
  // A mutation removing the escaping fails the first assertion *and* the second:
  // dropping the name to satisfy the negatives is refused by the positive one.
});

test('an empty project renders the index own sentence, not a bare blank', () => {
  const page = renderPage(PROJECT_ROOT, EMPTY_INVENTORY);
  assert.ok(page.includes('A BMAD project, with no artifacts yet.'));
  assert.ok(page.includes(`<h2 class="tile-label">${ARTIFACTS_TILE_LABEL}</h2>`));
  // And the grid still exists: `tileGrid` refuses an empty surface, so the
  // empty-project case has to be a tile that says so rather than no tiles.
  assert.ok(page.includes('<div class="tile-grid">'));
});

test('a page load builds a new snapshot, rather than replaying the one at bind time', async (t) => {
  // **AD-3, made observable.** The first version of this story took the pass
  // once before the bind and closed over the result for the socket's life, so
  // every `GET /` re-rendered a frozen snapshot — while `chrome.ts` said "a
  // page load builds a new snapshot", `server.ts` said "a page load builds a
  // new one by re-running the command", and the byte-identical test above
  // passed whether or not that was true. Three claims and no check.
  //
  // The supplier is called per request, so counting calls and varying the
  // answer proves both halves: the adapter asks again, and what it asks for is
  // what the reader gets.
  let calls = 0;
  const handle = await startServer({
    projectRoot: CANONICAL_ROOT,
    body: readableBody,
    inventory: () => {
      calls += 1;
      return calls === 1 ? EMPTY_INVENTORY : FULL_INVENTORY_VIEW;
    },
  });
  t.after(() => handle.close());

  const first = await fetchRoot(handle.url);
  const second = await fetchRoot(handle.url);
  assert.equal(calls, 2, 'the snapshot must be built once per page load');
  assert.ok(first.body.includes('A BMAD project, with no artifacts yet.'));
  assert.ok(second.body.includes('class="artifact-row"'), 'the second load shows the new snapshot');
  assert.notEqual(second.body, first.body, 'a changed project must change the page');
});

test('a snapshot that fails at request time is a 500, not a dead process', async (t) => {
  // The pass is built never to throw (AD-7), but it reads a filesystem that can
  // change between two requests — a project deleted while the page is open is
  // the ordinary case. An exception escaping a request listener ends the
  // process while the reader watches a tab hang, so it is caught and reported
  // exactly as a render failure is: to a reader they are one failure.
  const errors: Error[] = [];
  const handle = await startServer({
    projectRoot: CANONICAL_ROOT,
    body: readableBody,
    inventory: () => {
      throw new Error('the project went away');
    },
    onError: (error) => errors.push(error),
  });
  t.after(() => handle.close());

  const response = await fetchRoot(handle.url);
  assert.equal(response.status, 500);
  assert.match(response.body, /could not be rendered/);
  assert.deepEqual(
    errors.map((error) => error.message),
    ['the project went away'],
    'the failure is reported to the owner, not swallowed',
  );
  // And the server is still up: a second request is answered.
  assert.equal((await fetchRoot(handle.url)).status, 500);
});
