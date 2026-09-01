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

import { renderPage, PAGE_TITLE, PAGE_STATUS_LINE } from '../../src/render/page.ts';
import { STYLESHEET } from '../../src/render/stylesheet.ts';
import { startServer } from '../../src/adapters/http/server.ts';

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
  const page = renderPage();
  assert.ok(page.includes(`<style>\n${STYLESHEET}</style>`), 'the stylesheet must be inlined');
  assert.equal((page.match(/<style>/g) ?? []).length, 1);
  assert.ok(page.includes('--color-surface:'), 'the tokens must reach the document');
});

test('the document is one h1 inside a main landmark, with a language declared', () => {
  const page = renderPage();
  assert.match(page, /^<!doctype html>\n<html lang="en">/);
  assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1, 'exactly one h1 per surface');
  assert.ok(page.includes('<main>') && page.includes('</main>'));
  assert.ok(page.includes(`<h1>${PAGE_TITLE}</h1>`));
  assert.ok(page.includes(`<p>${PAGE_STATUS_LINE}</p>`));
  // Terse and technical, and sentence-shaped strings take a period.
  assert.match(PAGE_STATUS_LINE, /\.$/);
});

test('the markup carries no colour or size literal, and no inline style', () => {
  const markup = markupOnly(renderPage());
  assert.doesNotMatch(markup, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(markup, /(?<![\w-])\d*\.?\d+(?:px|rem|em|ch|pt)\b/i);
  assert.doesNotMatch(markup, /\sstyle=/);
  assert.doesNotMatch(markup, /\sclass=/, 'no components in Story 1.2');
});

test('no font, script or stylesheet is fetched from anywhere', () => {
  const page = renderPage();
  assert.doesNotMatch(page, /<link\b/i);
  assert.doesNotMatch(page, /<script\b/i, 'no client-side JavaScript until Story 1.3');
  assert.doesNotMatch(page, /@font-face|@import/i);
  assert.doesNotMatch(page, /https?:\/\//i);
});

test('the polarity is dark, declared once, with no light theme', () => {
  const page = renderPage();
  assert.ok(page.includes('color-scheme: dark;'));
  assert.doesNotMatch(page, /prefers-color-scheme/);
});

test('the adapter serves exactly what render produces, headers unchanged', async (t) => {
  const handle = await startServer();
  t.after(() => handle.close());

  const response = await fetchRoot(handle.url);
  assert.equal(response.status, 200);
  assert.equal(response.contentType, 'text/html; charset=utf-8');
  assert.equal(response.body, renderPage(), 'the adapter must not reshape the document');
});
