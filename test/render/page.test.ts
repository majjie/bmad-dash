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

import {
  renderPage,
  PAGE_TITLE,
  PAGE_STATUS_LINE,
  SURFACE_TITLE,
  STATUS_TILE_LABEL,
} from '../../src/render/page.ts';
import { STYLESHEET } from '../../src/render/stylesheet.ts';
import { startServer } from '../../src/adapters/http/server.ts';
import { REFRESH_HREF } from '../../src/render/chrome.ts';

/**
 * A synthetic absolute root. Fixed rather than `process.cwd()` so a test's
 * expectations do not change with the directory it is run from, and chosen to
 * look nothing like this repository so a path leaking from the real filesystem
 * into an assertion is visible.
 */
const PROJECT_ROOT = '/tmp/bmad-dash-test-project';

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
  const page = renderPage(PROJECT_ROOT);
  assert.ok(page.includes(`<style>\n${STYLESHEET}</style>`), 'the stylesheet must be inlined');
  assert.equal((page.match(/<style>/g) ?? []).length, 1);
  assert.ok(page.includes('--color-surface:'), 'the tokens must reach the document');
});

test('the document is one h1 inside a main landmark, with a language declared', () => {
  const page = renderPage(PROJECT_ROOT);
  assert.match(page, /^<!doctype html>\n<html lang="en">/);
  assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1, 'exactly one h1 per surface');
  assert.ok(page.includes('<main>') && page.includes('</main>'));
  // The h1 names the *surface*, not the tool. Once the banner states which
  // project is open, spending the page's one h1 on the tool's own name would
  // spend it on the thing the reader is least in doubt about.
  assert.ok(page.includes(`<h1>${SURFACE_TITLE}</h1>`), 'the h1 names the surface');
  assert.ok(!page.includes(`<h1>${PAGE_TITLE}</h1>`), 'the tool name belongs in title alone');
  assert.ok(page.includes(`<title>${PAGE_TITLE}</title>`), 'and it is still in title');
  assert.ok(page.includes(PAGE_STATUS_LINE), 'the status line survives, now inside a tile');
  // Terse and technical: sentence-shaped strings take a period, labels do not.
  assert.match(PAGE_STATUS_LINE, /\.$/);
  for (const label of [SURFACE_TITLE, STATUS_TILE_LABEL]) {
    assert.doesNotMatch(label, /\.$/, `${label} is label-shaped and takes no period`);
  }
});

test('rendering without a usable project root fails loudly, at the page level too', () => {
  // The check lives in `projectHeader`, so there is one place it can disagree
  // with itself rather than two. Asserted here as well because `renderPage` is
  // what the adapter calls, and a future refactor could route around the header.
  for (const bad of ['', '  ', '.', 'relative/path']) {
    assert.throws(() => renderPage(bad), /project root/);
  }
});

test('the banner and the surface are separate landmarks, in that order', () => {
  const page = renderPage(PROJECT_ROOT);
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
  const page = renderPage(PROJECT_ROOT);
  assert.ok((page.match(/class="tile-raised"/g) ?? []).length <= 1, 'two raised tiles on one surface');
});

test('the tile label is a real heading below the surface heading', () => {
  const page = renderPage(PROJECT_ROOT);
  // Screen-reader users traverse the dashboard by structure, so a tile label is
  // an h2 under the surface's one h1 — never a styled div.
  assert.ok(page.includes(`<h2 class="tile-label">${STATUS_TILE_LABEL}</h2>`));
  assert.ok(page.indexOf('<h1') < page.indexOf('<h2'), 'the h1 precedes any h2');
});

test('the markup carries no colour or size literal, and no inline style', () => {
  const markup = markupOnly(renderPage(PROJECT_ROOT));
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
  const page = renderPage(PROJECT_ROOT);
  assert.doesNotMatch(page, /<link\b/i);
  assert.doesNotMatch(page, /<script\b/i, 'no client-side JavaScript: refresh is a link');
  assert.doesNotMatch(page, /@font-face|@import/i);
  assert.doesNotMatch(page, /https?:\/\//i);
});

test('the polarity is dark, declared once, with no light theme', () => {
  const page = renderPage(PROJECT_ROOT);
  assert.ok(page.includes('color-scheme: dark;'));
  assert.doesNotMatch(page, /prefers-color-scheme/);
});

test('following the refresh link re-requests the surface and carries nothing across', async (t) => {
  // Refresh is navigation, not script: a page load builds a new snapshot. Two
  // successive GETs must therefore both succeed and, with nothing changed on
  // disk, produce byte-identical documents — no counter, no session, no state.
  const handle = await startServer({ projectRoot: PROJECT_ROOT });
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
  assert.ok(first.body.includes(`href="${REFRESH_HREF}"`), 'the refresh control is in the page');
});

test('the adapter serves exactly what render produces, headers unchanged', async (t) => {
  const handle = await startServer({ projectRoot: PROJECT_ROOT });
  t.after(() => handle.close());

  const response = await fetchRoot(handle.url);
  assert.equal(response.status, 200);
  assert.equal(response.contentType, 'text/html; charset=utf-8');
  assert.equal(response.body, renderPage(PROJECT_ROOT), 'the adapter must not reshape the document');
});
