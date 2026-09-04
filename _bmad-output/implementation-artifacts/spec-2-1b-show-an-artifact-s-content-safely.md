---
title: "Show an artifact's content, safely"
type: 'feature'
created: '2026-09-04'
status: 'done'
baseline_commit: '0dc6f80798d99167051de0dbe8780f8e4e218b37'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An artifact has a URL and a shell, and the shell is empty — a reader still leaves for their editor to see the file. This is also the first story to put a project's own bytes on a page, and the tool has no answer yet for what happens when those bytes contain markup.

**Approach:** Read the one requested artifact, render its markdown to HTML on the server, and put the response behind a Content-Security-Policy that denies everything the page does not need. Embedded HTML renders, behind a single named constant that turns it off.

## Boundaries & Constraints

**Always:**
- **HTML in a project's markdown renders**, behind one named constant. User decision 2026-09-04: this is local content the reader authored or generated, so the risk is low and fidelity wins. The constant is a real switch, **tested in both positions** — an off-switch nobody exercises is rotten by the time it is needed.
- **The response carries a deny-everything CSP**: nothing is permitted but the inline stylesheet the page already ships. Plus `nosniff` and a `Referrer-Policy`.
- The parser is a **bundled devDependency**, never a runtime dependency — `dependencies` stays empty, which `test/cli-entry.test.ts:315` asserts.
- One file is read per request: the artifact actually asked for.
- A read failure or a parse failure **renders in place**, naming what failed and at which stage (AD-7). Never an omission, never fatal to the page.

**Ask First:**
- Changing the constant's default, or making it anything other than a compile-time constant.
- Adding a second dependency — a sanitiser, a highlighter, anything.
- Touching `firstHeading` or `headingFamilies` in `src/domain/identity.ts`.
- Any `files` whitelist change beyond adding the third-party licence.

**Never:**
- No parse cache (Story 2.1c), no section selection (2.9), no contents rail (2.10).
- No client JavaScript. `web/` stays the one empty scanned root.
- **No claim on FR-18** — it forbids the generic renderer this story ships, and 2.4–2.8 satisfy it by replacing the fallback per type.
- **No swapping `firstHeading` for the parser.** It feeds identification, disagrees with a real parser on setext headings and indented code, and changing it moves identification verdicts across the whole inventory. Two readers of one fact is the accepted cost here.
- No bodies on the snapshot: text must not reach `snapshotIdOf`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Markdown renders | A readable `.md` artifact | Its content as HTML in the shell, at the reading measure | N/A |
| Empty file | Zero bytes, or only whitespace | `Empty file.` verbatim | N/A |
| Not text | Bytes that are not valid UTF-8 | Renders in place naming state and `decode` stage | Typed, not thrown |
| Too large | Over `MAX_READ_BYTES` (8 MiB) | Renders in place naming the size and the limit, at the `examine` stage | Typed, not thrown |
| Gone since the scan | Row exists, file no longer does | Renders in place as absent at the `resolve` stage | Typed, not thrown |
| HTML in content, constant on | `<b>x</b>` and `<script>y</script>` in the file | Both reach the document as markup; the CSP is what stops the script running | N/A |
| HTML in content, constant off | The same file | Both render as visible text, no element created | N/A |
| A hostile link | `[x](javascript:alert(1))` in the file | The href reaches the document; `default-src 'none'` is what refuses it | N/A |
| Headers on the artifact page | Any 200 | CSP, `nosniff` and `Referrer-Policy` present alongside the existing three | N/A |
| Headers on a refusal | 403, 404, 405 | Carry the hardening headers too — a refusal is still a response a browser acts on | N/A |
| Not markdown | A readable non-`.md` artifact | Content shown as preformatted text, not run through the parser | N/A |
| A directory artifact | A run folder or sharded document row | No body to read; the shell says so rather than failing | Typed, not thrown |

**Combinations with no row, and why.** Crossing artifact state against the constant leaves only these. The constant changes *one* thing — whether embedded markup becomes elements — so every read-failure row behaves identically in both positions and needs one row each rather than two. A `javascript:` link is listed separately from embedded HTML because markdown's own link syntax produces it with the constant **off** as well, which is the case a reader of the constant would otherwise assume is covered. Directories cannot be empty-vs-unreadable in the way files can: the row exists but there is no file, so one row covers it.

</frozen-after-approval>

## Code Map

- **The escaping guarantee is narrower than it looks, and the hatch already exists.** `src/render/html.ts` — `markup` :146 escapes every interpolated value; `BUILT_HERE` :69 makes `Markup` unforgeable; `TileContent.html` (`components.ts:57`) is the *only* thing refusing a raw string. But `tile` :111 and `tileGrid` :132 return `string`, and `documentShell(projectRoot, refreshHref, main: string)` (`page.ts:135`) emits `main` **verbatim** at :147 — trust documented at :129-133, enforced by nothing. `renderArtifact` already builds `main` by joining raw strings (`artifact.ts:130-145`). Parser HTML dropped there **typechecks today**.
- **No scheme filter exists anywhere in `src/`.** `escapeHtml` has no URL context (stated at `inventory.ts:623-631`); today's only `href` is safe because `artifactUrl` always begins `/artifact/`. A markdown link's href hits that gap directly.
- `src/adapters/fs/read.ts` — `readText` :761. Returns `{ok:true,text}` or `{ok:false,state,stage,reason}` with `state` narrowed to `absent|unreadable` and `stage` to `resolve|examine|read|decode`. `MAX_READ_BYTES = 8*1024*1024` :113, refused on the `stat` so nothing is read. Strict UTF-8 decode :825 — `readFileSync(path,'utf8')` was the original bug, it substitutes U+FFFD rather than throwing.
- **Nothing currently reads a body for its own sake.** `contentFor` (`cli/inventory.ts:927`) reads for identification and discards the text at :780 — only `readability` survives onto the entry. `InventoryEntry` has no text field.
- **Threading:** `src/render/` cannot import `node:fs` (gated) and cannot reach `src/cli/` (`architecture.test.ts:1709`), so the composition root's `ConfinedReader` (`cli/index.ts:862`) must read. Add a supplier beside `inventory` on `StartServerOptions` (:204) and pass the body to `renderArtifact` as a third argument. **Do not put bodies on the view** — `snapshotIdOf` digests the whole `ViewContent`, so every artifact's text would enter the per-request digest.
- `src/domain/frontmatter.ts` — `readFrontmatter` :339 gives the leading block and a `terminated` flag, which is where the body starts. Reusable and non-colliding; its header says it must not become a YAML parser.
- **`src/domain/identity.ts:1082` `firstHeading`** — a private mini-scanner feeding precedence level 3. A real parser disagrees with it on setext headings, indented code and HTML blocks. `identity.ts:69` records a real bug already caused by heading-derived identity. Leave it.
- **Two tests must change deliberately, and both say so themselves.** `test/render/artifact.test.ts:301` holds a tag allowlist rejecting `<pre>`/`<article>`/`<blockquote>` and its comment says a later story "will fail here and have to say so". `:324` asserts the page is a function of the view; it becomes a function of the view **and** the body.
- Also expected red: `stylesheet.test.ts:740` (bidirectional class round-trip — every new class needs a rule and every rule needs markup), `page.test.ts:145` (`KNOWN_CLASSES`).
- **Dependency gates.** `cli-entry.test.ts:315` production dependencies empty; `:258` every literal `files` entry must exist on disk *before* it is listed; **`:425` the bundle must contain none of `devDependencies`, `esbuild`, `prepublishOnly`, `typescript`** — check the candidate's bundled source against those four strings before choosing it. `architecture.test.ts:157` forbids any install hook. The read-only gate never scans `dist/`, so a bundled parser is invisible to it — the recorded mitigation is a one-off measurement of the built bundle.
- Precedent, with one part that turned out not to apply: the `yaml@2.9.0` measurement in `deferred-work.md` — devDependency bundled by esbuild, ~34KB→~264KB, and a shipped third-party licence file. **The `--banner:js` `createRequire` shim it needed is *not* needed here**: `marked` is pure ESM with no dynamic `require`, so the build flags are unchanged.
- `DESIGN.md` — `reading-measure: 68ch` :108; the `prose` token :77-81 is IBM Plex Serif at 1.65 line-height and appears in **exactly one place**, a rendered document body :233; reading surfaces break the dashboard grid :255. UX-DR1: no hex, px or rem literal — every value through a token.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- `marked@^18.0.11` as a **devDependency**, and `LICENSE-THIRD-PARTY` added to `files` once the file existed. **No esbuild banner needed**: the parser is pure ESM with zero dependencies and no dynamic `require`, so the `createRequire` shim the `yaml` measurement described does not apply. Bundle measured; see Verification.
- [x] `LICENSE-THIRD-PARTY` -- new: the parser's MIT text verbatim, with the version it is bundled at, and why a devDependency still carries a licence obligation.
- [x] `src/render/markdown.ts` -- new: the render boundary. `renderMarkdown` from markdown text to a rendered body, and `RENDER_EMBEDDED_HTML`, the named constant controlling whether embedded HTML becomes markup. **Not `src/domain/markdown.ts`** -- see the Spec Change Log. Frontmatter stripped first, through `readFrontmatter`'s `terminated` flag.
- [x] `src/domain/frontmatter.ts` -- `bodyAfterFrontmatter`, which answers where the block ends using `readFrontmatter`'s own `terminated` flag and this module's own `linesOf`/`FENCE`. Added rather than re-derived in the render layer, which would have been a second reader of one boundary.
- [x] `test/render/markdown.test.ts` -- new: headings, lists, code, emphasis, tables; frontmatter stripped; **the constant asserted in both positions**, with a `<script>` and a `<b>` in the source; a `javascript:` link's href observed rather than assumed; the parse failure as a typed value.
- [x] `test/domain/frontmatter.test.ts` -- the body boundary: closed block, unterminated block, `...` end marker, BOM and CRLF.
- [x] `src/cli/index.ts` -- a body supplier closing over the existing `ConfinedReader`, reading one path on demand, and **confirming `src/adapters/fs/read.ts` needs no change** -- `readText` is sufficient and is used unchanged, said where the supplier is wired rather than by widening the reader (which is why `read.ts` is deliberately absent from this diff). Bodies stay out of `projectInventory` and out of `snapshotIdOf`.
- [x] `src/adapters/http/server.ts` -- the supplier threaded through `StartServerOptions`, called for the resolved row, its result passed to `renderArtifact`. `HARDENING_HEADERS` -- the CSP, `nosniff` and `Referrer-Policy` -- on `pageHeaders` **and** on `respondText`, so every response carries them, refusals included.
- [x] `src/render/artifact.ts` -- the body as a third argument, rendered at the reading measure; the typed failure in place naming state and stage; `Empty file.` verbatim; a non-markdown artifact as escaped preformatted text.
- [x] `src/render/stylesheet.ts` -- the prose rules: the `prose` role, `reading-measure`, and the elements the parser emits. Every value through a token; the base heading rule widened to `h6` because a document's headings are demoted by one.
- [x] `test/render/artifact.test.ts` -- `:301` and `:324` amended, each stating why its old meaning no longer holds; the matrix's content, empty, unreadable, too-large, absent, directory, non-markdown and parse-failure cases.
- [x] `test/server.test.ts` -- content served end to end at its URL, including through a real `run` over a real file; exactly one read per artifact page; the hardening headers on a 200, a HEAD, 403, 404, 405 and 500.
- [x] `test/cli-entry.test.ts` -- the dependency stays a devDependency and is in the bundle, the licence ships and names the bundled version, and neither the bundle nor the parser's own source carries build metadata or a network reach.
- [x] `test/architecture.test.ts` -- the parser boundary's importer set and specifier list, so a second dependency is a deliberate edit; the widened importer sets for `src/domain/signal.ts` and `src/domain/frontmatter.ts`, each with its basis pinned by a named-import assertion.
- [x] `test/render/stylesheet.test.ts` -- `prose` removed from `ROLES_NOT_YET_APPLIED` because a rule now applies it; the reading surface's required rules; the render loop extended to all four content outcomes.
- [x] `test/support/inventory.ts` -- the shared body fixture, so a dozen call sites do not each invent one.
- [x] `test/render/page.test.ts` -- the new required option at its `startServer` call sites.
- [x] `scripts/run-tests.ts` -- the floor raised from 949 to 996.
- [x] **Review round (2026-09-04), five patches.** `test/server.test.ts` -- the confinement gap closed with an end-to-end test through the real composition root (mutation-proven: deleting the catch left 995/995 green before it, and fails on it now). `test/cli-entry.test.ts` -- the parser-source check strengthened to assert what two documents already claimed (every `node:` specifier rather than five literals, plus `require(` and `process`), and the third-party licence pinned to the **installed** version rather than the declared range. `src/render/markdown.ts` -- `bodyAfterFrontmatter` moved inside the `try`, so "the catch is over everything" is true, and the hand-counted `<frozen-after-approval>` figure removed. `test/render/artifact.test.ts` and `test/render/stylesheet.test.ts` -- three duplicated fixture-path literals replaced with `UNINTERPRETED_ROW.path`.

**Acceptance Criteria:**
- Given a readable markdown artifact, when its URL is requested, then its content is in the response as server-rendered HTML.
- Given an artifact of zero bytes, when it is rendered, then the page reads `Empty file.` and nothing else stands in for it.
- Given an artifact that cannot be read or decoded, when it is rendered, then the page names what failed and at which stage, and the rest of the page still renders.
- Given a file containing `<script>`, when the constant is off, then no element is created by it; when on, it reaches the document and the CSP is the thing that stops it.
- Given any response including a refusal, when it is written, then it carries the CSP, `nosniff` and `Referrer-Policy`.
- Given a page load, when the artifact is rendered, then exactly one file was read and no body reached the snapshot identity.

## Spec Change Log

**2026-09-04 — two amendments authorised by Jamie during implementation. Neither touches the frozen block, and neither is a review loopback.**

**The parser is `marked`, not the seeded `markdown-it`.** The Stack table seeds markdown-it 15.x, and the architecture memlog records *why*: `token.map` carries source line ranges per token, which is what lets a section permalink (FR-27) and an open-in-editor target (FR-24) point at an exact line. `marked` was chosen instead for measured reasons — pure ESM, **zero dependencies**, and no `--banner:js` `createRequire` shim, against a review's measurement of markdown-it at 7 packages / 2.9 MB. Approved.

**The inherited risk, measured rather than assumed.** `marked`'s tokens carry **no** `map`, `line`, `position` or `loc` field. But every token carries `raw`, and those concatenate back to the source **byte-exactly** — verified over three shapes including frontmatter, fenced code, block quotes, lists and tables. So line ranges are **derivable by accumulating `raw` in document order**, not given. Stories 2.9 and 2.11 inherit that derivation as work markdown-it would have handed them. Recorded as its own deferred entry with those stories as the trigger, so it is a known cost rather than a surprise.

**`style-src 'unsafe-inline'` is accepted.** The CSP as approved was described as permitting "nothing but the inline stylesheet the page already ships" — and the option text I offered said `style-src 'self'`, **which was wrong**: `'self'` does not permit an inline `<style>` block, and the page inlines its stylesheet. `'unsafe-inline'` is what actually permits it. The carve-out, stated so it is not rediscovered as a finding: `'unsafe-inline'` permits **any** inline style, so with embedded HTML rendering on, a `<style>` block or `style=` attribute inside a project's own document is permitted too. Jamie accepted this. The exposure is bounded by the rest of the policy — `default-src 'none'` still denies script execution, image and font fetches, form submission, framing and `javascript:` navigation — so injected CSS has almost nothing to reach for and cannot exfiltrate. A `'sha256-…'` hash would permit only our own stylesheet and deny a document's; it is not taken here, and is recorded as the tightening available if the posture ever needs it.

**2026-09-04, during execution: the render boundary is `src/render/markdown.ts`, not `src/domain/markdown.ts`.** The Tasks list named the domain layer and it cannot be there. `src/domain/` is under a **frozen** architectural constraint -- "no outgoing imports at all" -- and `test/architecture.test.ts:586` demonstrates the rule with a fixture that is literally `src/domain/pkg.ts` importing `markdown-it`, denied. A parser in the pure layer would therefore have failed `npm test` on the first run. The module is otherwise exactly what the task asked for: one exported function from markdown text to a rendered body, the named constant beside it, and the frontmatter stripped first. Its test moves with it, to `test/render/markdown.test.ts`. Nothing in the frozen Intent, Boundaries or Matrix depends on which layer it sits in.

**2026-09-04: `src/domain/frontmatter.ts` gained `bodyAfterFrontmatter`, and the render layer is its third importer.** The task said to strip the block "using `readFrontmatter`'s `terminated` flag", and `readFrontmatter` reports *that* the block closed without reporting *where* -- so a caller has to re-find the closing fence. Doing that in the render layer meant a second line-splitter, free to disagree with the domain's own about a BOM, about `\r\n`, and about whether `...` closes a block: two readers of the one boundary that decides what is content and what is metadata. The function is added beside the scan instead, and the importer-set widening is answered rather than waved through -- the render boundary takes only `bodyAfterFrontmatter`, pinned by a named-import assertion, so it reads no frontmatter *field* and cannot derive identity from one, which is the rule that set exists to protect.

**2026-09-04: a document's own headings are demoted by one, and `h2, h3` became `h2, h3, h4, h5, h6`.** Not in the task list and not optional. `EXPERIENCE.md:224` gives each surface one `h1` naming the surface, and `test/render/artifact.test.ts` asserts it; a document whose title is `# …` would have put a second `h1` on the page. Demoting means the surface now reaches `h6`, and DESIGN.md gives eight type roles with no fourth heading size -- so every heading level takes `title` rather than falling to browser defaults, which below `h4` are *smaller than body text* and would put a document's deepest headings under DESIGN.md's own content floor.

**2026-09-04: preformatted text and tables fold rather than scroll.** The obvious rendering for content wider than the reading measure is `overflow-x: auto`, and `test/render/components.test.ts` refuses every form of clipping -- a scroll container clips a focus ring drawn on a child at its edge, WCAG 2.4.11, and a table cell is exactly where a link plausibly sits. `white-space: pre-wrap` with `overflow-wrap: anywhere` on `pre`, and `overflow-wrap: anywhere` on table cells with `width: 100%`, satisfy that rule and WCAG 1.4.10's reflow requirement together.

**2026-09-04: `StartServerOptions.body` is required, on `inventory`'s own reasoning.** Thirty-nine test call sites were updated. The alternative -- optional, with the adapter deciding what an absent body looks like -- is composing, which AD-2 forbids it, and it would have invented a sixth outcome the matrix does not have.

**2026-09-04: a fenced block's language class is dropped.** The parser's default emits `class="language-ts"`, a hook for a highlighter this story's Ask-First list forbids adding. An unstyled class in a served document is markup no rule in `src/render/stylesheet.ts` draws, which `test/render/stylesheet.test.ts` checks in both directions, so the honest rendering of "we do not highlight" is a plain `pre`.

**2026-09-04, review round: three layers ran, and what they found was checked rather than relayed.** Two claims were verified and **rejected** with measurements, both recorded in `deferred-work.md`: relative in-document links are *not* dead clicks -- AD-18's grammar mirrors the project path, so `./sibling.md` resolves to exactly that artifact's URL, which is a property worth keeping rather than a gap -- and HEAD's full read is deliberate, because the proposed guard would answer 200 to a HEAD whose GET would 500. Two reviewers also disagreed about the frontmatter-only artifact; reproducing it settled the symptom as a blank region, not `Empty file.`, and it is deferred because the fix needs a copy decision `EXPERIENCE.md` owns. One claim was overstated in *this spec's own text* and is corrected above: the parser-source test asserted five `node:` literals and `fetch(`, while this document and `deferred-work.md` both said `require(` and `process` were checked too. All four were measured absent, so the test was strengthened to match the claim rather than the claim weakened to match the test.

## Design Notes

**What the CSP can and cannot be worth to us.** The suite has no browser, so it can assert the header is present and correct and it can never assert that a browser honours it. The CSP is therefore defence-in-depth of unverifiable efficacy — which is exactly why the constant matters: it is the control that *is* testable. Do not let the CSP's presence stand in for a test of behaviour.

**Why rendering HTML is defensible here.** User decision: the tool serves a local project's own documents to the person who owns them, which is not the threat model a web application faces. The CSP does most of the work anyway — `default-src 'none'` blocks script execution, image fetches and `javascript:` navigation alike. The accepted cost, stated so it is not discovered later: our own bare `<frozen-after-approval>` tags become unknown elements (no count stated: a figure nothing recomputes goes stale on the next spec), so the frozen-intent marker on every spec silently disappears when read in the tool. The constant is the escape valve for exactly that.

**The style carve-out.** The policy is deny-everything with one exception, and the exception is broader than it reads: `style-src 'unsafe-inline'` permits any inline style, ours and a document's alike. Accepted by decision — `default-src 'none'` leaves injected CSS with no script to run, no image to fetch and no form to post, so the practical reach is close to nil. A hash would narrow it to our own stylesheet; see the Spec Change Log.

**Body as an argument, not as view state.** `renderArtifact` becomes a function of the view *and* the body, which is a deliberate widening of `artifact.test.ts:324`'s claim rather than an abandonment of it. The alternative — text on `ArtifactRow` — would read every artifact on every page load and feed every byte into `snapshotIdOf`, which digests the whole view.

**Two readers of "the first heading", accepted.** `firstHeading` feeds identification; the parser will feed display; they disagree on setext headings and indented code. Unifying them changes identification verdicts across the inventory and belongs to its own story.

## Verification

**Commands:**
- `npm run typecheck` -- **clean.**
- `npm test` -- **996 pass, 0 fail, 0 skipped** (949 at baseline). `DEFAULT_MIN_TESTS` raised to 996. The 996th is the review round's confinement test.
- `node scripts/check-tasks.ts` -- every ticked task names a file the diff touches.
- `node -e "…dist/cli/index.js…"` -- recorded, not a gate: `node:http` **true**, `node:https` false, `node:net` false, `node:fs` **true**, `node:child_process` **true**, `fetch(` false. The three trues are this tool's own -- the loopback server, the confined reader and the browser launcher -- and each predates this story. The parser adds none of them: asserted directly against `node_modules/marked/lib/marked.esm.js` in `test/cli-entry.test.ts`, which carries no `node:` specifier, no `require(`, and no `fetch(` at all.
- **Bundle size, measured:** `dist/cli/index.js` goes from **161,004 to 217,087 bytes** (~157KB to ~212KB) -- the parser adds **56,083 bytes**. Re-measured after the review round, because the earlier figures (161,002 / 217,085) were taken before it and two bytes of comment drift is exactly how a stated number starts lying. Measured by building the same entry with `--external:marked` and comparing. No `--banner:js` was needed: `marked` is pure ESM with zero dependencies and no dynamic `require`, so the `createRequire` shim the `yaml` measurement in `deferred-work.md` describes does not apply here.
- **Mechanism check:** flipped `RENDER_EMBEDDED_HTML` to `false` and re-ran: **993 pass, 1 fail** -- `the default is the constant, so flipping the constant fails in either direction` in `test/render/markdown.test.ts`. Restoring the line returns the suite to green. That one test is what holds the switch in *both* directions: it asserts the default rendering equals the explicitly-switched one, that it differs from the negation, and pins the current value, so a flip either way fails it. The two position tests keep passing on a flip **by design** -- they pass the switch explicitly, which is what makes them a test of the mechanism rather than of the default. The two tests that *branch* on the constant (the artifact surface's dispatch, and the frozen-marker cost) also keep passing on a flip, deliberately: they exist to prove no second copy of the switch was made, so following it is the property they assert.

**Manual checks:**
- Served this repository and opened its own 2.1b spec at `/artifact/…`. **Content renders**: the I/O matrix as a `<table>`, `##` headings as `<h3>` (demoted by one), one `<h1>` on the page. The `<frozen-after-approval>` marker with the constant **on** reaches the document as an unknown element -- so the marker itself is invisible and its content shows, exactly the cost the Design Notes predicted; with the constant **off** it is visible text, asserted in `test/render/markdown.test.ts` rather than only observed.
- **CSP header's exact value, on a 200 and on a 404** (both identical): `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, alongside `x-content-type-options: nosniff` and `referrer-policy: no-referrer`.
