/**
 * The render boundary: markdown text in, document HTML out.
 *
 * **This is where the escaping guarantee ends, deliberately and in one place.**
 * Every other string that reaches a served page goes through `./html.ts`'s
 * `markup`, which escapes each interpolated value, and `TileContent.html`
 * refuses a raw string outright — so until this module existed, no
 * project-derived byte could become an element. Rendering a document ends that
 * by design: `# x` has to become an `h2`, which means emitting markup built
 * from the project's own bytes. The whole of that concession lives in this
 * file, so a reviewer asking "where can a project create an element?" has one
 * answer rather than a search.
 *
 * Two things bound it:
 *
 *   1. **`RENDER_EMBEDDED_HTML`**, below — whether markup the *author* wrote
 *      inside the markdown becomes elements, or is shown as the text it was
 *      spelled as. It is the control that is testable, and
 *      `test/render/markdown.test.ts` exercises both positions.
 *   2. **The Content-Security-Policy** on the response
 *      (`src/adapters/http/server.ts`). That is the thing that actually stops a
 *      `<script>` running or a `javascript:` href navigating — and the suite
 *      has no browser, so it can assert the header and never its effect. It is
 *      therefore defence-in-depth of unverifiable efficacy, which is exactly
 *      why the constant matters and why the constant is what has tests.
 *
 * **No sanitiser, and that is a decision rather than an omission.** The tool
 * serves a local project's own documents to the person who owns them, over
 * loopback, after a `Host` check. Adding one is on this story's Ask-First list.
 *
 * **What the parser is not allowed to be.** It feeds *display* only. Identity
 * is decided by `src/domain/identity.ts`, whose `firstHeading` is a private
 * mini-scanner that disagrees with a real parser about setext headings, indented
 * code and HTML blocks. Swapping one for the other would move identification
 * verdicts across a whole project's inventory, so the two readers of "the first
 * heading" are kept apart and the cost is accepted rather than paid by accident.
 */

import { Marked, type MarkedExtension } from 'marked';

import { bodyAfterFrontmatter } from '../domain/frontmatter.ts';
import { escapeHtml } from './html.ts';

/**
 * Whether HTML written inside a project's markdown becomes markup.
 *
 * `true` by user decision, 2026-09-04: this is local content the reader
 * authored or generated, so fidelity wins over a threat model the tool is not
 * in. Changing the default is a decision to renegotiate, not a tuning knob —
 * the story that introduced it puts that on its Ask-First list.
 *
 * **A compile-time constant, and a real switch.** It is the *default* of
 * `renderMarkdown`'s second parameter rather than a branch read from inside,
 * because a constant only one position of which is ever exercised is rotten by
 * the time it is needed: `test/render/markdown.test.ts` renders the same source
 * with the switch on and off and asserts each outcome, and separately asserts
 * that the default is this constant, so flipping this line fails the suite in
 * whichever direction it is flipped.
 *
 * **The accepted cost, stated so it is not discovered later.** With it on, this
 * repository's own `<frozen-after-approval>` tags become unknown elements, so
 * the frozen-intent marker on a spec silently disappears when the spec is read
 * *in* the tool. Turning the switch off is what brings it back, as visible
 * text. Deliberately no count of those tags here: a number in a comment that
 * nothing recomputes goes stale on the next spec, which is the defect class
 * this project's own retrospective found seven times.
 */
export const RENDER_EMBEDDED_HTML = true;

/**
 * The stage a rendering failure names, in the shape AD-8 names read failures.
 *
 * **Not a `ReadStage`.** `src/domain/signal.ts`'s six stages are the stages of
 * *reading a file*, and AD-8 fixes that vocabulary for the model and the
 * conventions table alike; parsing happens after the bytes are already text, so
 * adding a seventh to that closed set would widen a domain vocabulary to
 * describe something no signal state is about. It is spelled here, once, and
 * `src/render/artifact.ts` renders it beside a read failure's stage because to a
 * reader they answer the same question — what failed, and at which step.
 */
export const MARKDOWN_PARSE_STAGE = 'parse';

/** A rendered body, or the parse that could not produce one. */
export type MarkdownRendering =
  | { readonly ok: true; readonly html: string }
  | {
      readonly ok: false;
      readonly stage: typeof MARKDOWN_PARSE_STAGE;
      readonly reason: string;
    };

/**
 * Headings start at `h2`, because the surface's `h1` is already spent.
 *
 * `EXPERIENCE.md:224` gives each surface exactly one `h1` and it names the
 * surface, so a document whose own title is `# …` cannot also be an `h1`
 * without putting two of them on one page — which breaks the heading list a
 * screen-reader user traverses by, on the one surface whose whole content is a
 * document. Every level shifts by one and `h6` is the floor, so a document
 * nested six deep flattens its last two levels rather than emitting an `h7`
 * that is not an element.
 */
const HEADING_OFFSET = 1;
const DEEPEST_HEADING = 6;

/**
 * The parser, configured once per switch position.
 *
 * Both instances are built at module load: they are pure, cheap, and holding
 * one per position keeps the switch out of the per-render path. **Nothing is
 * memoised on content, and nothing will be:** Story 2.1c would have cached the
 * parse and was cancelled on 2026-09-04 as overkill for a local developer tool.
 * A document is re-parsed on each open, at a measured 1.7 ms for a typical spec
 * and 31.6 ms for the largest document in this repository.
 */
function parser(embeddedHtml: boolean): Marked {
  const options: MarkedExtension = {
    // Synchronous, so a failure is a `throw` this module can turn into a value
    // rather than a rejected promise the render layer has no way to await.
    async: false,
    // GFM, because the documents this tool exists to show use it: every spec's
    // I/O matrix is a table and every task list is `- [ ]`.
    gfm: true,
    // A single newline is not a line break. Markdown's own rule, and BMAD
    // documents are hard-wrapped, so `breaks: true` would shred every
    // paragraph in the repository.
    breaks: false,
    pedantic: false,
    // **Never silent.** `silent: true` makes the parser emit its own error
    // message *as the document*, which is a page that looks like content and
    // is not. A throw is what lets `renderMarkdown` report the failure in
    // place, at a named stage, the way AD-7 asks.
    silent: false,
    renderer: {
      heading({ tokens, depth }) {
        const level = Math.min(depth + HEADING_OFFSET, DEEPEST_HEADING);
        return `<h${String(level)}>${this.parser.parseInline(tokens)}</h${String(level)}>\n`;
      },
      /**
       * The switch, and the only place either position is implemented.
       *
       * One override covers both block-level HTML (`<div>…` on its own line)
       * and inline HTML (`<b>` mid-sentence): the parser routes both token
       * kinds here. `text` is the author's raw markup — passed through, it
       * becomes elements; escaped, it becomes the visible text they typed.
       */
      html({ text }) {
        return embeddedHtml ? text : escapeHtml(text);
      },
      /**
       * A fenced block's language is dropped rather than emitted as a class.
       *
       * The parser's default writes `class="language-ts"`, which is a hook for
       * a highlighter this story is forbidden to add. An unstyled class in the
       * document would be markup no rule in `./stylesheet.ts` draws — the
       * failure `test/render/stylesheet.test.ts` checks in both directions — so
       * the honest rendering of "we do not highlight" is a plain `pre`.
       */
      code({ text, escaped }) {
        // The trailing newline inside `code` is the parser's own: a block whose
        // last line ended in one must keep it, or the closing tag lands on it.
        return `<pre><code>${escaped ? text : escapeHtml(text)}\n</code></pre>\n`;
      },
    },
  };
  return new Marked(options);
}

const WITH_EMBEDDED_HTML = parser(true);
const WITHOUT_EMBEDDED_HTML = parser(false);

/**
 * One artifact's markdown as document HTML.
 *
 * The frontmatter block is removed first. It is metadata rather than content,
 * and left in place it does not merely show: a `---` fence renders as an `<hr>`
 * and the keys under it as a setext heading, so the block arrives on the
 * reading surface disguised as the document's own title. Where the block ends
 * is `src/domain/frontmatter.ts`'s answer, not a second reading of it here.
 *
 * **It never throws.** AD-7: a failure is a typed value that renders in place,
 * naming what failed and at which stage, because the alternative on this
 * surface is a 500 for a document with one malformed corner. A pathologically
 * nested document exhausts the parser's stack, which is a `RangeError` rather
 * than anything the parser reports, so the catch is over everything.
 */
export function renderMarkdown(
  text: string,
  embeddedHtml: boolean = RENDER_EMBEDDED_HTML,
): MarkdownRendering {
  try {
    // **Inside the `try`, not above it.** The docblock says the catch is over
    // everything and that has to be true of the frontmatter strip too: it is a
    // second reader of the text, and a boundary that promises never to throw
    // cannot have a statement outside its own guard. Nothing reachable throws
    // here today -- which is exactly why the line would never be revisited.
    const body = bodyAfterFrontmatter(text);
    const parsed = (embeddedHtml ? WITH_EMBEDDED_HTML : WITHOUT_EMBEDDED_HTML).parse(body);
    // `async: false` above makes this a string; the type is the union of both
    // modes, so it is narrowed rather than asserted.
    if (typeof parsed !== 'string') {
      return {
        ok: false,
        stage: MARKDOWN_PARSE_STAGE,
        reason: 'the parser answered asynchronously, which this boundary cannot render',
      };
    }
    return { ok: true, html: parsed };
  } catch (error: unknown) {
    return {
      ok: false,
      stage: MARKDOWN_PARSE_STAGE,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
