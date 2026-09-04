/**
 * The render boundary, where the escaping guarantee ends on purpose.
 *
 * Three contracts:
 *
 *   1. **It renders markdown.** Headings, lists, code, emphasis and tables —
 *      the constructs a BMAD document is actually made of — and the frontmatter
 *      block is content the reader must not be shown as a heading.
 *   2. **The constant is a real switch.** `RENDER_EMBEDDED_HTML` is asserted in
 *      **both** positions over the same source, and the default is asserted to
 *      *be* the constant, so flipping the constant's line fails this file
 *      whichever way it is flipped. An off-switch nobody exercises is rotten by
 *      the time it is needed.
 *   3. **A `javascript:` link's href is observed, not assumed.** It is the case
 *      markdown's *own* link syntax produces with the switch **off** as well —
 *      the one a reader of the constant would otherwise assume is covered by it
 *      — so what actually reaches the document is asserted here, and the
 *      Content-Security-Policy in `src/adapters/http/server.ts` is the thing
 *      that refuses it. `test/server.test.ts` asserts that header; no test in
 *      this suite can assert a browser honours it, and none pretends to.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MARKDOWN_PARSE_STAGE,
  RENDER_EMBEDDED_HTML,
  renderMarkdown,
} from '../../src/render/markdown.ts';

/** The rendered HTML, or a failure naming what the parser said. */
function html(text: string, embeddedHtml?: boolean): string {
  const rendered =
    embeddedHtml === undefined ? renderMarkdown(text) : renderMarkdown(text, embeddedHtml);
  assert.ok(rendered.ok, `expected a rendering, got ${JSON.stringify(rendered)}`);
  return rendered.html;
}

/** A document carrying both kinds of embedded markup, block and inline. */
const WITH_EMBEDDED_MARKUP = 'a <b>bold</b> word\n\n<script>alert(1)</script>\n';

// ---------------------------------------------------------------------------
// It renders markdown
// ---------------------------------------------------------------------------

test('headings render, demoted by one so the surface keeps its single h1', () => {
  // `EXPERIENCE.md:224` gives each surface one `h1` and it names the surface,
  // so a document's `#` cannot also be one. Every level shifts.
  const rendered = html('# One\n\n## Two\n\n### Three\n');
  assert.match(rendered, /<h2>One<\/h2>/);
  assert.match(rendered, /<h3>Two<\/h3>/);
  assert.match(rendered, /<h4>Three<\/h4>/);
  assert.doesNotMatch(rendered, /<h1[ >]/, 'the surface owns the h1, not the document');
});

test('h6 is the floor, so a document nested seven deep emits no h7', () => {
  // `<h7>` is not an element: a browser renders it as an unknown inline, so the
  // deepest levels flatten rather than silently becoming body text.
  const rendered = html('##### Five\n\n###### Six\n');
  assert.match(rendered, /<h6>Five<\/h6>/);
  assert.match(rendered, /<h6>Six<\/h6>/);
  assert.doesNotMatch(rendered, /<h7/);
});

test('lists, emphasis, code and tables all render', () => {
  const rendered = html(
    [
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      'text with *emphasis*, **strength** and `a span`.',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      '> quoted',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n'),
  );
  assert.match(rendered, /<ul>\n<li>one<\/li>/);
  assert.match(rendered, /<ol>\n<li>first<\/li>/);
  assert.match(rendered, /<em>emphasis<\/em>/);
  assert.match(rendered, /<strong>strength<\/strong>/);
  assert.match(rendered, /<code>a span<\/code>/);
  assert.match(rendered, /<blockquote>/);
  // GFM, because every spec in this repository states its I/O matrix as a table
  // and its tasks as `- [ ]`.
  assert.match(rendered, /<table>/);
  assert.match(rendered, /<th>a<\/th>/);
});

test('a fenced block keeps its text and drops the language class', () => {
  // The parser's default emits `class="language-ts"`, a hook for a highlighter
  // this story may not add — and an unstyled class in a served document is
  // markup no rule in `./stylesheet.ts` draws, which
  // `test/render/stylesheet.test.ts` checks in both directions.
  const rendered = html('```ts\nconst x = 1;\n```\n');
  assert.match(rendered, /<pre><code>const x = 1;\n<\/code><\/pre>/);
  assert.doesNotMatch(rendered, /class="language/);
});

test('code inside a fence is escaped, so a document cannot smuggle markup through one', () => {
  // Independent of the constant: this is the *code* path, not the embedded-HTML
  // path, and a `<script>` inside a fence must read as the text it is in both
  // positions of the switch.
  for (const embedded of [true, false]) {
    const rendered = html('```\n<script>alert(1)</script>\n```\n', embedded);
    assert.ok(rendered.includes('&lt;script&gt;'), `escaped with the switch ${String(embedded)}`);
    assert.doesNotMatch(rendered, /<script\b/i);
  }
});

test('the frontmatter block is stripped, not rendered as the document title', () => {
  // Left in place it does not merely show: the closing `---` makes the keys
  // above it a setext heading and the opening one an `<hr>`, so the block
  // arrives dressed as the document's own title.
  const rendered = html("---\ntitle: 'Something'\ntype: 'feature'\n---\n\n# Real title\n\nBody.\n");
  assert.match(rendered, /<h2>Real title<\/h2>/);
  assert.ok(!rendered.includes('Something'), 'a frontmatter value is not content');
  assert.ok(!rendered.includes('type'), 'and neither is a frontmatter key');
  assert.doesNotMatch(rendered, /<hr/, 'and the fence is not a rule');
});

test('a block that opens and never closes is rendered whole, not truncated', () => {
  // A document beginning `---` with no closing fence is a document, not a
  // frontmatter block: dropping the rest would show the reader a fragment with
  // nothing to say it was one.
  const rendered = html('---\nnot really frontmatter\n\n# A heading\n');
  assert.ok(rendered.includes('not really frontmatter'));
  assert.match(rendered, /<h2>A heading<\/h2>/);
});

test('a document with no frontmatter is untouched', () => {
  const rendered = html('# Just a document\n\nWith a body.\n');
  assert.match(rendered, /<h2>Just a document<\/h2>/);
  assert.match(rendered, /<p>With a body\.<\/p>/);
});

// ---------------------------------------------------------------------------
// The constant, in both positions
// ---------------------------------------------------------------------------

test('with embedded HTML on, both a tag and a script reach the document as markup', () => {
  const rendered = html(WITH_EMBEDDED_MARKUP, true);
  assert.ok(rendered.includes('<b>bold</b>'), 'the inline tag becomes an element');
  assert.ok(rendered.includes('<script>alert(1)</script>'), 'and so does the block');
  // The page is not what stops it running. Said here so a reader of this test
  // does not conclude the suite proves the script inert.
  assert.ok(!rendered.includes('&lt;script&gt;'), 'nothing escaped it on the way through');
});

test('with embedded HTML off, both render as visible text and create no element', () => {
  const rendered = html(WITH_EMBEDDED_MARKUP, false);
  assert.ok(rendered.includes('&lt;b&gt;bold&lt;/b&gt;'), 'the inline tag is text');
  assert.ok(rendered.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'and so is the block');
  assert.doesNotMatch(rendered, /<b>|<script\b/i, 'no element is created by either');
});

test('the two positions actually differ, so neither assertion passes vacuously', () => {
  assert.notEqual(html(WITH_EMBEDDED_MARKUP, true), html(WITH_EMBEDDED_MARKUP, false));
  // And the switch changes *only* that: the surrounding markdown is identical.
  for (const rendered of [html(WITH_EMBEDDED_MARKUP, true), html(WITH_EMBEDDED_MARKUP, false)]) {
    assert.ok(rendered.includes('word'));
  }
});

test('the default is the constant, so flipping the constant fails in either direction', () => {
  // The link between the switch and the shipped behaviour. Without this, both
  // positions could be green while the constant meant nothing.
  assert.equal(html(WITH_EMBEDDED_MARKUP), html(WITH_EMBEDDED_MARKUP, RENDER_EMBEDDED_HTML));
  assert.notEqual(html(WITH_EMBEDDED_MARKUP), html(WITH_EMBEDDED_MARKUP, !RENDER_EMBEDDED_HTML));
  // And what it is set to right now, pinned. User decision 2026-09-04: HTML in a
  // project's own markdown renders, because this is local content the reader
  // authored and fidelity wins. Changing this line is a decision to renegotiate,
  // not a tuning knob — which is what this assertion makes it.
  assert.equal(RENDER_EMBEDDED_HTML, true);
});

test("this repository's own frozen-intent marker is the cost the constant pays for", () => {
  // Stated as a test rather than as a comment, because it is the concrete thing
  // a reader will notice: with the switch on, `<frozen-after-approval>` is an
  // unknown element and its content shows with the tag invisible; with it off,
  // the marker itself is readable. Neither is wrong — but a story that shipped
  // the first without recording it would have made every spec's frozen section
  // silently unmarked when read in the tool.
  const marker = '<frozen-after-approval reason="human-owned intent">\n\nIntent.\n';
  assert.ok(html(marker, true).includes('<frozen-after-approval'), 'on: an unknown element');
  assert.ok(html(marker, false).includes('&lt;frozen-after-approval'), 'off: a visible marker');
});

// ---------------------------------------------------------------------------
// A hostile link, observed
// ---------------------------------------------------------------------------

test('a javascript: link keeps its href, in both positions of the constant', () => {
  // **Observed, not assumed.** There is no scheme filter anywhere in `src/`, and
  // this is the case markdown's own link syntax produces — so it is not covered
  // by the embedded-HTML switch and a reader must not think it is. What refuses
  // it is `default-src 'none'`, asserted as a header in `test/server.test.ts`
  // and unverifiable here.
  for (const embedded of [true, false]) {
    const rendered = html('[x](javascript:alert(1))\n', embedded);
    assert.ok(
      rendered.includes('href="javascript:alert(1)"'),
      `the href reaches the document with the switch ${String(embedded)}`,
    );
  }
});

test('an ordinary link and an image are unfiltered too, and that is the same fact', () => {
  const rendered = html('[a](./other.md) and ![alt](./picture.png)\n');
  assert.ok(rendered.includes('href="./other.md"'));
  // An image is a fetch the CSP refuses; the alt text is what a reader gets.
  assert.ok(rendered.includes('alt="alt"'));
});

// ---------------------------------------------------------------------------
// AD-7: a parse failure is a value
// ---------------------------------------------------------------------------

test('a parse failure is a typed value naming the parse stage, never a throw', () => {
  // The input exhausts the parser's own recursion. It is the only way to reach
  // this branch without stubbing the parser out, which would test the stub.
  const rendered = renderMarkdown('> '.repeat(20_000) + 'x');
  assert.equal(rendered.ok, false);
  assert.ok(!rendered.ok);
  assert.equal(rendered.stage, MARKDOWN_PARSE_STAGE);
  assert.equal(rendered.stage, 'parse');
  assert.ok(rendered.reason.trim() !== '', 'a failure with no reason is an empty success');
});

test('the parse stage is not one of AD-8 read stages, and does not pretend to be', async () => {
  // A seventh member of `src/domain/signal.ts`'s closed vocabulary would widen a
  // domain rule to describe something no signal state is about. It is spelled in
  // the render layer, once, and this is what keeps the two apart.
  const { READ_STAGES } = await import('../../src/domain/signal.ts');
  assert.ok(
    !(READ_STAGES as readonly string[]).includes(MARKDOWN_PARSE_STAGE),
    `${MARKDOWN_PARSE_STAGE} must not be a ReadStage`,
  );
});

test('an empty document renders to nothing, and that is a success rather than a failure', () => {
  // `src/render/artifact.ts` owns saying `Empty file.`; the parser's honest
  // answer to no content is no markup, and reporting that as a parse failure
  // would put a failure where a fact belongs.
  assert.equal(html('').trim(), '');
  assert.equal(html('   \n\n').trim(), '');
});
