/**
 * The one script, and the one control that needs it.
 *
 * **What is decidable here, and what is not.** There is no browser in this
 * suite, no clipboard and no editor. So this file asserts the *markup* and the
 * *shape of the script text* — the `hidden` attribute, the escaped payload, the
 * element kind, and that the script is a constant with nothing interpolated
 * into it — and it asserts nothing about what happens when a reader clicks.
 * That boundary is the point rather than a limitation: "the control is hidden
 * in the served markup" is a check, and "the button copies the path" is not,
 * which is exactly why the design is hidden-then-revealed rather than a button
 * that might not work.
 *
 * The other half of the contract — that the served response's
 * `content-security-policy` carries a `sha256` of the script in that same
 * response's body — is in `test/server.test.ts`, because it is a claim about a
 * response and only a server can produce one.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

import {
  COPY_CONTROL_CLASS,
  COPY_LABEL,
  COPY_PAYLOAD_ATTRIBUTE,
  COPY_SCRIPT,
  copyControl,
  copyScriptElement,
  scriptable,
} from '../../src/render/enhance.ts';
import { HOSTILE_NAME, HOSTILE_PATH } from '../support/inventory.ts';

const PLAIN_PATH = '_bmad-output/planning-artifacts/prds/prd-x-2026-08-28/prd.md';

// ---------------------------------------------------------------------------
// The control: hidden, keyboard operable, and carrying the path
// ---------------------------------------------------------------------------

test('the control is hidden in the served markup, so it can never be a dead control', () => {
  // **The story's central assertion, and the reason `hidden` was chosen over a
  // class or an inline style.** A reader without script — disabled, or a
  // browser that refuses the CSP hash — must not see a control that cannot
  // work; `hidden` is honoured with no stylesheet at all, and the script is the
  // only thing that removes it.
  const html = copyControl(PLAIN_PATH);
  assert.match(html, /^<button\b/, 'a real button, not a styled span or an anchor');
  assert.match(html, /\shidden(?=[\s>])/, 'the control must be served hidden');
  // A bare `hidden`, not `hidden="false"` — which is still hidden, and reads to
  // an editor as though it were not.
  assert.doesNotMatch(html, /hidden=/, 'a valueless attribute; hidden="false" still hides');
  assert.doesNotMatch(html, /\sstyle=/, 'not hidden by an inline style the CSP would also govern');
});

test('the control is keyboard operable by construction, and announces what it does', () => {
  // **Structural, because that is what is decidable without a browser.** A
  // `<button>` is in the tab order natively, activates on both `Enter` and
  // `Space`, and announces as a button, so its own text is its accessible name
  // — no ARIA and no `tabindex`. An `<a>` was not an option: without an `href`
  // it is not focusable at all, and with one it would announce a navigation it
  // does not perform.
  const html = copyControl(PLAIN_PATH);
  assert.match(html, /\stype="button"/, 'a bare button submits an enclosing form');
  assert.doesNotMatch(html, /tabindex/, 'nothing may take it out of the tab order');
  assert.doesNotMatch(html, /aria-|\srole=/, 'a button needs no ARIA to be a button');
  // The name is the element's own text, and it names an action with an object.
  assert.ok(html.endsWith(`>${COPY_LABEL}</button>`), html);
  assert.equal(COPY_LABEL, 'Copy path');
  // No inline handler, which the policy could not permit in any case: a hash
  // source does not cover attribute handlers. The listener is attached by the
  // script.
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'the listener is attached, never inlined');
});

test('the control is a ghost, because the editor link holds the surface primary', () => {
  // UX-DR11 is Story 2.3's claim and `test/render/components.test.ts` owns the
  // per-surface bound; what is asserted here is this control's own variant.
  // Opening the artifact where the reader works is the forward action they came
  // for; a convenience over text already on the page is not.
  const html = copyControl(PLAIN_PATH);
  assert.ok(html.includes(`class="button-ghost ${COPY_CONTROL_CLASS}"`), html);
  assert.doesNotMatch(html, /button-primary/, 'the primary slot is the editor link’s');
  // Two classes and exactly two: `button-ghost` for the appearance
  // `./components.ts` defines, and its own class for the geometry a `<button>`
  // needs and the selector the script queries.
  assert.deepEqual((/class="([^"]+)"/.exec(html)?.[1] ?? '').split(' '), [
    'button-ghost',
    COPY_CONTROL_CLASS,
  ]);
});

test('a hostile path is escaped into the attribute and cannot leave it', () => {
  // The matrix's hostile-path row. The payload travels in an attribute, which
  // is the one place a path can break out of if it is not escaped — a `"` ends
  // the value and everything after it becomes markup the browser acts on. The
  // existing escaping is used deliberately rather than a new mechanism:
  // `../../src/render/html.ts`'s `markup` escapes every value it interpolates.
  const html = copyControl(HOSTILE_PATH);
  assert.ok(html.includes(HOSTILE_PATH) === false, 'the raw name must not reach the document');
  assert.ok(!html.includes(HOSTILE_NAME));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;.md'), 'shown as the text it is');
  assert.doesNotMatch(html, /<img/i, 'no element may be created by a filename');
  // And the quote-escape attempt specifically, which is the shape that would
  // add an attribute rather than an element: `a" onmouseover=alert(1) x="b`
  // must not produce a second attribute.
  const escaped = copyControl('a" onmouseover=alert(1) x="b');
  assert.ok(escaped.includes('data-copy-path="a&quot; onmouseover=alert(1) x=&quot;b"'), escaped);
  // The payload is still exactly one attribute: three `"` pairs, for `type`,
  // `class` and the payload, and no fourth opened by the path.
  assert.equal((escaped.match(/=\"/g) ?? []).length, 3, escaped);
});

test('a blank payload is refused rather than rendered, the same way a blank href is', () => {
  // `./components.ts` refuses a button with no destination because it looks
  // like it works and goes nowhere; a control that would put nothing on the
  // clipboard is the same failure. No row can produce one — `WalkEntry.relative`
  // is non-empty by construction — which is when the guard costs nothing.
  for (const path of ['', '   ']) {
    assert.throws(() => copyControl(path), /needs the path it copies/, JSON.stringify(path));
  }
});

// ---------------------------------------------------------------------------
// The script: one constant, with nothing interpolated into it
// ---------------------------------------------------------------------------

test('the script is a constant, with no value interpolated into it', async () => {
  // **The assertion the CSP hash rests on.** The header is a `sha256` of these
  // bytes, so a script assembled per request — a path spliced in, a snapshot
  // id, anything — would be a page carrying one script while the header
  // permitted another, and the browser would refuse it with nothing here going
  // red. Checked as a *shape* rather than as today's output: the source line
  // must hold a plain string, not a template with a substitution in it.
  //
  // Read from the module's own source rather than from the value, because a
  // value cannot tell you how it was built.
  // **This now reads the file, which is what the paragraph above always
  // claimed and what the code did not do.** It was `const source =
  // COPY_SCRIPT`, the runtime *value* — and a value cannot tell you how it was
  // built: rewriting the selector as `'.${COPY_CONTROL_CLASS}'` leaves the
  // value byte-identical, so the old check passed on exactly the shape both
  // docblocks forbid. Measured in review 2026-09-04.
  const module = await readFile(new URL('../../src/render/enhance.ts', import.meta.url), 'utf8');
  const assignment = /export const COPY_SCRIPT = `([\s\S]*?)`;/.exec(module);
  assert.ok(assignment !== null, 'the script must be one backtick literal assigned to COPY_SCRIPT');
  assert.doesNotMatch(
    assignment[1] ?? '',
    /\$\{/,
    'the source line must hold no substitution: the hash covers bytes, not a recipe',
  );
  assert.equal(assignment[1], COPY_SCRIPT, 'and the literal in the file is the value that ships');
  assert.ok(COPY_SCRIPT.length > 0, 'the script must not be empty');
  // **The script is real JavaScript.** It is a string under `src/`, so `tsc`
  // never sees it and no linter parses it — a typo would ship a permanently
  // dead feature with a green suite and a hash faithfully permitting the
  // broken bytes. Parsing is the cheapest thing that can possibly notice.
  new Script(COPY_SCRIPT);
  // Idempotent across calls and identical between two reads: a getter that
  // rebuilt it, or anything derived from a clock or a counter, would move the
  // hash between the header and the page.
  assert.equal(copyScriptElement(), copyScriptElement());
  assert.equal(copyScriptElement(), `<script>${COPY_SCRIPT}</script>`);
});

test('the script is the whole of the client code, and it fetches nothing', () => {
  // Inline, with no attributes on the element at all: a `src` would be a fetch
  // this tool never makes, and any attribute would fall outside the bytes the
  // hash covers, so a browser honouring the policy would refuse the script.
  const element = copyScriptElement();
  assert.ok(element.startsWith('<script>'), element);
  assert.ok(element.endsWith('</script>'), element);
  assert.doesNotMatch(COPY_SCRIPT, /https?:\/\//i, 'no outbound URL: NFR — no network');
  assert.doesNotMatch(COPY_SCRIPT, /\bfetch\b|XMLHttpRequest|import\s*\(|eval\b/);
  // `<` cannot be escaped inside a `<script>` element — HTML entities are not
  // decoded there — so a script containing one could only be refused. It is a
  // constant, so this cannot fire; it is the same guard, for the same reason,
  // as `./page.ts`'s on the inlined stylesheet.
  assert.doesNotMatch(COPY_SCRIPT, /</, 'a "<" in the script would end the element early');
});

test('the script drives the control this module renders, not a selector of its own', () => {
  // The script is a literal, so the correspondence between what it queries and
  // what the control carries is asserted rather than constructed. This is the
  // drift the two constants exist to make visible: rename the class and the
  // control still renders, the script still parses, and nothing works.
  assert.ok(COPY_SCRIPT.includes(`.${COPY_CONTROL_CLASS}`), 'the script must query the control');
  assert.ok(copyControl(PLAIN_PATH).includes(COPY_CONTROL_CLASS));
  // `data-copy-path` is read as `dataset.copyPath`, which is the one place the
  // attribute name and the property name are two spellings of one fact.
  assert.equal(COPY_PAYLOAD_ATTRIBUTE, 'data-copy-path');
  const property = COPY_PAYLOAD_ATTRIBUTE.replace(/^data-/, '').replace(/-([a-z])/g, (_, c: string) =>
    c.toUpperCase(),
  );
  assert.equal(property, 'copyPath');
  assert.ok(COPY_SCRIPT.includes(`dataset.${property}`), 'the script must read the payload');
  // It reveals the control, and that pairing is what makes `hidden` safe to
  // serve: an attribute nothing removes is a control no reader can reach.
  assert.ok(COPY_SCRIPT.includes('hidden = false'));
  assert.ok(COPY_SCRIPT.includes('clipboard'), 'and it is the clipboard it writes to');
  // It reveals nothing where the API is absent — an insecure context has no
  // `navigator.clipboard` — which is the `hidden` rule applied at the one
  // condition markup cannot see.
  // **Both halves of the capability, not just the object.** This read
  // `if (navigator.clipboard) {` until review 2026-09-04, when a reviewer
  // pointed out that a `clipboard` object without a callable `writeText` would
  // reveal the control and then throw on every click — a dead control reached
  // by passing the guard. The reveal must sit inside a check of the method it
  // is about to call.
  assert.match(
    COPY_SCRIPT,
    /if \(navigator\.clipboard && navigator\.clipboard\.writeText\) \{[\s\S]*hidden = false/,
    'the reveal must sit inside the capability check, method included',
  );
  // **Scoped to the shell's own row, and never to a document's markup.**
  // `RENDER_EMBEDDED_HTML` is `true` and there is no sanitiser, so a project's
  // markdown can contain `<button class="artifact-copy" data-copy-path="...">`.
  // A document-wide query would have revealed it and wired the tool's own
  // script to an attacker-chosen payload. Found in review 2026-09-04.
  assert.ok(
    COPY_SCRIPT.includes('.artifact-exits .artifact-copy'),
    'the query must be scoped to the exits row',
  );
  assert.ok(
    COPY_SCRIPT.includes("closest('.artifact-content')"),
    'and must skip anything inside the content region, which is where a document can plant one',
  );
  // A control with no payload does nothing, rather than writing an empty
  // string over whatever the reader had on their clipboard.
  assert.match(COPY_SCRIPT, /if \(!payload\) return;/, 'a blank payload is a no-op, not a wipe');
  // **What this deliberately no longer asserts.** It read
  // `doesNotMatch(COPY_SCRIPT, /\.catch\b|try \{/)` until review 2026-09-04 —
  // pinning the *absence* of rejection handling as a required property, so the
  // eventual fix would have had to delete an assertion first. That inverts the
  // rule this project holds elsewhere: an expectation must never be shaped to
  // match the code. Not asserting the outcome is right, because this suite has
  // no clipboard; asserting that no handler may exist is not the same claim,
  // and it was the wrong one. The unhandled rejection is recorded in
  // `deferred-work.md` as an open limit instead.
});

test('the script guard refuses what it exists to refuse, in both directions', () => {
  // **Pinned because its docblock states a mechanism.** `scriptable` refuses a
  // `<` because inside a `<script>` element there is no escaping mechanism at
  // all — a `<` reaching the string could only be handled by refusing to serve
  // it. Measured in review 2026-09-04: dropping the `scriptable(...)` wrapper
  // from `copyScriptElement` left the whole suite green, so the guard's
  // *wiring* was invisible. This pins the guard's behaviour in both positions.
  assert.equal(scriptable('const x = 1;'), 'const x = 1;', 'a clean script passes through unchanged');
  for (const hostile of ['a < b', 'x</script>y', '<!--']) {
    assert.throws(() => scriptable(hostile), /</, `must refuse ${JSON.stringify(hostile)}`);
  }
  // The wiring itself remains unpinned, and that is stated rather than implied:
  // `copyScriptElement` takes a constant, so with today's input the guard can
  // never fire, and no assertion can distinguish a wired guard from a dropped
  // one. `./page.ts`'s `inlinable` is unpinned the same way and for the same
  // reason -- this follows the repo's precedent rather than inventing one --
  // and `deferred-work.md` carries it as an open limit with its trigger.
  assert.doesNotMatch(COPY_SCRIPT, /</, 'and the constant it guards has no < to refuse');
});
