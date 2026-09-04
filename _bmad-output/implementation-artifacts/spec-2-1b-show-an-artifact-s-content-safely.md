---
title: "Show an artifact's content, safely"
type: 'feature'
created: '2026-09-04'
status: 'ready-for-dev'
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
- Precedent to reuse, not re-derive: the `yaml@2.9.0` measurement in `deferred-work.md` — devDependency bundled by esbuild, a `--banner:js` `createRequire` shim for CommonJS dynamic requires, ~34KB→~264KB, and a shipped third-party licence file.
- `DESIGN.md` — `reading-measure: 68ch` :108; the `prose` token :77-81 is IBM Plex Serif at 1.65 line-height and appears in **exactly one place**, a rendered document body :233; reading surfaces break the dashboard grid :255. UX-DR1: no hex, px or rem literal — every value through a token.

## Tasks & Acceptance

**Execution:**
- [ ] `package.json` -- add the markdown parser as a **devDependency**, and the third-party licence to `files` only once the file exists. Add the esbuild banner if the parser needs it. Measure the built bundle for `node:http`/`https`/`net`/`fs`/`child_process`/`fetch` and record the result.
- [ ] `src/domain/markdown.ts` -- new: the render boundary. One exported function from markdown text to a rendered body, and **the named constant** controlling whether embedded HTML becomes markup. Strip the frontmatter block first, using `readFrontmatter`'s `terminated` flag.
- [ ] `test/domain/markdown.test.ts` -- new: headings, lists, code, emphasis; frontmatter stripped; **the constant asserted in both positions**, with a `<script>` and a `<b>` in the source; a `javascript:` link's href observed rather than assumed.
- [ ] `src/adapters/fs/read.ts` -- no change expected; confirm `readText` is sufficient and say so rather than widening it.
- [ ] `src/cli/index.ts` -- a body supplier closing over the existing `ConfinedReader`, reading one path on demand. Keep bodies out of `projectInventory` and out of `snapshotIdOf`.
- [ ] `src/adapters/http/server.ts` -- thread the supplier through `StartServerOptions`; call it for the resolved row; pass the result to `renderArtifact`. Add the CSP, `nosniff` and `Referrer-Policy` to `pageHeaders` so **every** response carries them, refusals included.
- [ ] `src/render/artifact.ts` -- take the body as a third argument and render it: content at the reading measure, or the typed failure in place naming state and stage, or `Empty file.` verbatim.
- [ ] `src/render/stylesheet.ts` -- the prose rules: the `prose` token, `reading-measure`, and whatever elements the parser emits. Every value through a token.
- [ ] `test/render/artifact.test.ts` -- amend `:301` and `:324` as the story requires, **stating in each why the old meaning no longer holds**; add the matrix's content, empty, unreadable, too-large and directory cases.
- [ ] `test/server.test.ts` -- content served end to end at its URL; the hardening headers on a 200 **and** on 403, 404 and 405.
- [ ] `test/cli-entry.test.ts` -- the dependency stays a devDependency, the licence file ships, and the bundle still carries no build metadata.

**Acceptance Criteria:**
- Given a readable markdown artifact, when its URL is requested, then its content is in the response as server-rendered HTML.
- Given an artifact of zero bytes, when it is rendered, then the page reads `Empty file.` and nothing else stands in for it.
- Given an artifact that cannot be read or decoded, when it is rendered, then the page names what failed and at which stage, and the rest of the page still renders.
- Given a file containing `<script>`, when the constant is off, then no element is created by it; when on, it reaches the document and the CSP is the thing that stops it.
- Given any response including a refusal, when it is written, then it carries the CSP, `nosniff` and `Referrer-Policy`.
- Given a page load, when the artifact is rendered, then exactly one file was read and no body reached the snapshot identity.

## Spec Change Log

## Design Notes

**What the CSP can and cannot be worth to us.** The suite has no browser, so it can assert the header is present and correct and it can never assert that a browser honours it. The CSP is therefore defence-in-depth of unverifiable efficacy — which is exactly why the constant matters: it is the control that *is* testable. Do not let the CSP's presence stand in for a test of behaviour.

**Why rendering HTML is defensible here.** User decision: the tool serves a local project's own documents to the person who owns them, which is not the threat model a web application faces. The CSP does most of the work anyway — `default-src 'none'` blocks script execution, image fetches and `javascript:` navigation alike. The accepted cost, stated so it is not discovered later: our own 16 bare `<frozen-after-approval>` tags become unknown elements, so the frozen-intent marker on every spec silently disappears when read in the tool. The constant is the escape valve for exactly that.

**Body as an argument, not as view state.** `renderArtifact` becomes a function of the view *and* the body, which is a deliberate widening of `artifact.test.ts:324`'s claim rather than an abandonment of it. The alternative — text on `ArtifactRow` — would read every artifact on every page load and feed every byte into `snapshotIdOf`, which digests the whole view.

**Two readers of "the first heading", accepted.** `firstHeading` feeds identification; the parser will feed display; they disagree on setext headings and indented code. Unifying them changes identification verdicts across the inventory and belongs to its own story.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm test` -- expected: the 949 at baseline plus the new ones, zero skips; raise `DEFAULT_MIN_TESTS`.
- `node scripts/check-tasks.ts` -- expected: every ticked task names a file the diff touches.
- `node -e "const s=require('fs').readFileSync('dist/cli/index.js','utf8');for(const n of ['node:http','node:https','node:net','node:fs','node:child_process','fetch('])console.log(n,s.includes(n))"` -- record the result; this is the code-discipline measurement, not a gate.
- **Mechanism check:** flip the HTML constant and confirm tests fail in *both* directions. A constant only one position is tested against is not a switch.

**Manual checks:**
- Serve this repository and open one of its own specs. Confirm the content renders, and confirm what happens to the `<frozen-after-approval>` marker in both constant positions.
- Confirm the CSP header's exact value on a 200 and on a 404.
