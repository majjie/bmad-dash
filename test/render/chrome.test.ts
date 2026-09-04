/**
 * The project header, and the two contracts it sits on.
 *
 * The first is the string index. UX-DR17 requires its wording verbatim, and a
 * constant in source that merely *happens* to match is not that — it is a
 * second copy of the same belief, free to drift the moment either side is
 * edited. So the `Not checked` assertion parses EXPERIENCE.md's own table. This
 * is the same failure shape that has recurred through this project: a value
 * asserted from plausibility rather than observed at its source.
 *
 * The second is the resolution rule. The header is the first thing to display
 * the project root, and every later surface resolves artifact paths against
 * that same value — so a root that is blank, relative or invented is not a
 * cosmetic defect, it is a wrong answer rendered authoritatively.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  projectHeader,
  SIGNAL_NOT_CHECKED,
  GIT_SIGNAL_LABEL,
  REFRESH_LABEL,
  DASHBOARD_HREF,
} from '../../src/render/chrome.ts';

const EXPERIENCE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '_bmad-output',
  'planning-artifacts',
  'ux-designs',
  'ux-bmad-2026-08-28',
  'EXPERIENCE.md',
);

const RENDER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'render');

const PROJECT_ROOT = '/tmp/bmad-dash-test-project';

// ---------------------------------------------------------------------------
// The string index is read, not copied
// ---------------------------------------------------------------------------

test('the not-checked wording comes from EXPERIENCE.md, not from a second copy', async () => {
  const experience = await readFile(EXPERIENCE_PATH, 'utf8');
  // Scoped to the string-index table rather than the whole file, so a row
  // added elsewhere cannot satisfy this. The table is the one whose header row
  // is `| Situation | Says |`.
  const table = /\|\s*Situation\s*\|\s*Says\s*\|([\s\S]*?)\n\n/.exec(experience)?.[1];
  assert.ok(table !== undefined, 'EXPERIENCE.md must carry the load-bearing string index table');
  const row = /\|\s*Signal not examined\s*\|\s*`([^`]+)`\s*\|/.exec(table ?? '');
  assert.ok(
    row !== null,
    'the string index must carry a "Signal not examined" row',
  );
  // actual first, expected second — a failure must report the two the right way round.
  assert.equal(
    row?.[1],
    SIGNAL_NOT_CHECKED,
    'the header states a signal differently from the index that defines it',
  );
});

test('the header strings follow the index conventions for their shape', () => {
  // Label-shaped: initial capital, no terminal period. Sentence-shaped strings
  // take a period; none of these is a sentence.
  for (const label of [SIGNAL_NOT_CHECKED, REFRESH_LABEL]) {
    assert.match(label, /^[A-Z]/, `${label} takes an initial capital`);
    assert.doesNotMatch(label, /\.$/, `${label} is label-shaped and takes no period`);
  }
  assert.equal(GIT_SIGNAL_LABEL, 'Git:');
});

// ---------------------------------------------------------------------------
// What the header carries
// ---------------------------------------------------------------------------

test('the header is a banner carrying the four elements this story owns', () => {
  const html = projectHeader(PROJECT_ROOT, DASHBOARD_HREF);
  assert.match(html, /^<header class="project-header">/);
  assert.ok(html.includes('<p class="project-name">bmad-dash-test-project</p>'), 'the name');
  assert.ok(html.includes(`<code class="project-path">${PROJECT_ROOT}</code>`), 'the full path');
  assert.ok(html.includes(`${GIT_SIGNAL_LABEL} ${SIGNAL_NOT_CHECKED}`), 'the git signal');
  assert.ok(html.includes(`href="${DASHBOARD_HREF}"`), 'the refresh control');
  assert.ok(html.includes(`>${REFRESH_LABEL}</a>`));
  assert.ok(html.endsWith('</header>'));
});

test('the path is shown in full, not truncated or abbreviated', () => {
  // A shortened path is a path the reader cannot check, and checking is the
  // whole point of showing it.
  const deep = '/home/someone/work/clients/acme/services/api/bmad-workspace';
  const html = projectHeader(deep, DASHBOARD_HREF);
  assert.ok(html.includes(deep), 'the whole path must appear');
  assert.ok(!html.includes('…') && !html.includes('...'), 'no elision');
});

test('the git signal is present and unexamined, not absent', () => {
  // A signal missing from the page is indistinguishable from a signal that does
  // not exist. Telling those apart is why the four-state vocabulary exists, so
  // the deferred probe must still occupy its place.
  const html = projectHeader(PROJECT_ROOT, DASHBOARD_HREF);
  assert.ok(html.includes(SIGNAL_NOT_CHECKED));
  assert.ok(!/\bPresent\b|\bNot found\b|\bUnreadable\b/.test(html), 'it must claim no verdict');
});

test('the refresh control is a link, and the header carries no script', () => {
  const html = projectHeader(PROJECT_ROOT, DASHBOARD_HREF);
  assert.match(html, /<a class="project-refresh button-ghost" href="\/">/);
  assert.doesNotMatch(html, /<script|onclick|on[a-z]+=/i, 'refresh is navigation, not script');
  assert.doesNotMatch(html, /<button/i, 'a page load is the refresh; there is nothing to submit');
});

test('refresh carries the ghost button treatment, and remains a plain link', () => {
  // Story 2.3 closes the deferral `chrome.ts` used to record: Refresh is not a
  // surface's single main action — reading is — so it takes `button-ghost`
  // rather than spending the one `button-primary` UX-DR11 allows a surface.
  const html = projectHeader(PROJECT_ROOT, DASHBOARD_HREF);
  assert.match(html, /<a class="project-refresh button-ghost" href="\/">/);
  assert.doesNotMatch(html, /class="[^"]*\bbutton-primary\b/, 'refresh is ghost, never primary');
  assert.doesNotMatch(html, /<script|onclick|on[a-z]+=/i, 'refresh is navigation, not script');
  assert.doesNotMatch(html, /<button/i, 'a page load is the refresh; there is nothing to submit');
});

// ---------------------------------------------------------------------------
// The resolution rule
// ---------------------------------------------------------------------------

test('a blank root fails loudly rather than rendering a nameless project', () => {
  for (const bad of ['', '   ', '\n']) {
    assert.throws(() => projectHeader(bad, DASHBOARD_HREF), /needs the resolved project root/);
  }
});

test('a relative root fails loudly, naming what it got', () => {
  // A cwd-relative root would be resolved differently by every later story,
  // depending on what directory happened to be current.
  for (const bad of ['.', './project', 'project', '../sibling']) {
    assert.throws(() => projectHeader(bad, DASHBOARD_HREF), /must be absolute/);
    assert.throws(() => projectHeader(bad, DASHBOARD_HREF), new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('a filesystem root is named by its path, since it has no final segment', () => {
  const html = projectHeader('/', DASHBOARD_HREF);
  assert.ok(html.includes('<p class="project-name">/</p>'), 'never a blank name');
  assert.ok(html.includes('<code class="project-path">/</code>'));
});

test('a path carrying markup is escaped, so a directory name cannot inject', () => {
  // Nothing stops a repository from containing a directory called `"><script>`,
  // and the tool is pointed at projects the user did not necessarily write.
  const hostile = '/tmp/"><script>alert(1)</script>';
  const html = projectHeader(hostile, DASHBOARD_HREF);
  assert.ok(!html.includes('<script>'), 'the path must not reach the document as markup');
  assert.ok(html.includes('&lt;script&gt;'), 'it is shown, escaped, rather than dropped');
  assert.ok(html.includes('&quot;'), 'the quote is escaped, not stripped');

  // Checked on the rendered path itself rather than on the whole document: a
  // document-wide search for `">` matches every attribute in it, including this
  // header's own `class="project-header">`.
  const shown = /<code class="project-path">([\s\S]*?)<\/code>/.exec(html)?.[1] ?? '';
  assert.notEqual(shown, '', 'the path region must be found');
  for (const character of ['<', '>', '"', "'"]) {
    assert.ok(!shown.includes(character), `a raw ${character} survived into the path`);
  }
  // And the name, which is derived from the same string.
  const name = /<p class="project-name">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
  for (const character of ['<', '>', '"']) {
    assert.ok(!name.includes(character), `a raw ${character} survived into the name`);
  }
});

test('rendering is pure: the same root twice gives the same header', () => {
  // A page load is a refresh, so nothing may carry across one.
  assert.equal(projectHeader(PROJECT_ROOT, DASHBOARD_HREF), projectHeader(PROJECT_ROOT, DASHBOARD_HREF));
});

test('the render layer invokes nothing: no git, no subprocess, no filesystem', async () => {
  // The AD-1 gate asserts this across the whole tree by directory. Asserted
  // again here, narrowly, because this story is the one that made the header
  // *want* a git verdict — and the cheapest way to get one would be to shell
  // out from exactly these files.
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(RENDER_DIR)).filter((name) => name.endsWith('.ts'));
  assert.ok(files.length >= 5, `expected the render modules, found ${String(files.length)}`);
  for (const name of files) {
    const source = await readFile(join(RENDER_DIR, name), 'utf8');
    // `await import('node:fs')` is the form the previous version of this loop
    // missed — which was the form this very test file uses two lines below its
    // own guard. Static import, dynamic import and bare call, all covered.
    for (const forbidden of [
      'node:child_process',
      'node:fs',
      'node:fs/promises',
      'execSync',
      'execFileSync',
      'spawn',
      'spawnSync',
      'fork',
      'readFile',
      'writeFile',
      'readdir',
    ]) {
      const quoted = forbidden.replace(/[/]/g, '\\/');
      assert.ok(
        !new RegExp(`(from|import|require)\\s*\\(?\\s*['"\`]${quoted}['"\`]`).test(source) &&
          !new RegExp(`\\b${forbidden}\\s*\\(`).test(source),
        `${name} reaches for ${forbidden}; the render layer renders and nothing else`,
      );
    }
  }
});
