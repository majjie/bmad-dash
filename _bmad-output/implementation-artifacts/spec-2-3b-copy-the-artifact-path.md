---
title: "Copy the artifact's path"
type: 'feature'
created: '2026-09-04'
status: 'done'
baseline_commit: 'd64f993073510e8ec56449ad9d5afb65bc7fac7e'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.3a put the artifact's path on the surface as selectable text, which is the fact a reader needs but still costs them a hand-selection. FR-24 asks for the clipboard, and there is no HTML-only way to write to it — so this is the story that lets one script onto the page, and the first to touch the Content-Security-Policy since Jamie pinned it.

**Approach:** One inline listener, permitted by a `sha256` hash of exactly that script and nothing else. The control appears only when the script that powers it has run, so a reader without script sees the path and no dead button.

## Boundaries & Constraints

**Always:**
- **One script, permitted by its own hash.** `script-src 'sha256-…'`, derived from the script constant so the header and the page cannot disagree.
- The control is **hidden in the served markup and revealed by the script**. A control that cannot work must not be visible — the path text is the no-script answer and it stays.
- The copy control is **`button-ghost`**: Story 2.3a's editor link holds the surface's one primary, and the exact per-surface count must stay true.
- The path is still visible, selectable text whether or not the script runs.
- Keyboard operable, with an accessible name that says what it does.
- **Nothing writes to the project.** FR-24's own clause and AD-1.

**Ask First:**
- `'unsafe-inline'`, `'self'`, `'strict-dynamic'`, a nonce, or any CSP change other than the one hash. **The policy was pinned by Jamie and this story's one exception is already decided** — anything further is a new decision.
- A second script, or a script that is not a compile-time constant.
- A static-file route, a build step for client code, or a dependency.

**Never:**
- **No `'unsafe-inline'`.** `RENDER_EMBEDDED_HTML` is `true`, so a project's own markdown can contain `<script>`: `'unsafe-inline'` would execute it and a hash cannot.
- No script on the Dashboard. It is not a viewer and needs no clipboard, so the script goes in the **artifact** shell and `test/render/page.test.ts`'s no-script assertion stays untouched.
- **No claim on UX-DR11** — Story 2.3's.
- No content assembled client-side, no client router owning a URL (AD-2).
- **No assertion changed to accommodate the code.** Six change because the page genuinely carries a script now; **two must not** — see the Code Map.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Copy control served | Any row the shell renders | A `button-ghost` carrying the path as its payload, `hidden` in the served markup | N/A |
| Script runs | A browser executing the page's one script | The control is revealed and copies the path on activation | N/A |
| No script | Script disabled, or the CSP refuses the hash | The control never appears; the path is still visible and selectable | Never a dead control |
| Hostile path | A path containing `"`, `<`, `&` or a quote-escape attempt | The payload is escaped so it cannot leave its attribute or create an element | N/A |
| The header matches the page | Any artifact response | The CSP's `sha256` equals the hash of the script in that response's body | Test fails on drift |
| Every other response | 200 on `/`, and 403, 404, 405, 500 | Carry the same policy, including the hash, because the constant is shared | N/A |
| One primary per surface | The artifact surface | Still exactly one, and it is the editor link, not this control | Test fails on a second |
| Project content containing a script | A non-markdown artifact whose text is `<script>alert(1)</script>` | Still escaped in the content region, creating no element — **unchanged by this story** | N/A |
| Both exits adjacent | The exits row | Primary and ghost side by side without the row's reflow or focus ring degrading | N/A |

**Combinations with no row, and why.** The control's markup does not vary by row state — it carries the row's path, which every row has — so the readable, unreadable, non-markdown and directory cases behave as one row rather than four. Crossing the script against row state collapses the same way: the script is one constant on every artifact page regardless of what the page shows. There is **no row for the clipboard rejecting**: `writeText` returns a promise that can reject on permissions or an insecure context, this suite has no clipboard, and specifying an outcome no test can observe would be claiming coverage that cannot exist — what the control does after the call is stated in Design Notes as unverifiable, not as behaviour.

</frozen-after-approval>

## Code Map

- `src/adapters/http/server.ts:166-171` -- `HARDENING_HEADERS`, frozen, spread into `pageHeaders` and `respondText`. A hash over a **constant** script is static, so this stays frozen and neither call site changes shape. `node:crypto` is **ungated** (only `fs` and `child_process` are) and this file already imports `node:http` and `node:net`. **The hash is computed here, not in `src/render/`:** retrospective item 13 records that nothing enforces what `src/render/` may import and that `chrome.ts` already reaches for `node:path` against its layer row — adding `node:crypto` there would widen a boundary this story is told not to widen. So the script *text* lives in the render layer and the *hash* is derived in the adapter that already owns the header.
- **Six assertions change, each stating why its old meaning no longer holds; verify the numbers, three stories have moved them.** *(Corrected 2026-09-04 during implementation: **eight**, not six. The two not listed here are `test/render/artifact.test.ts`'s `doesNotMatch(exits, /<button\b/i)` — whose own message was "there is no script to submit a form with" — and the shell's element allowlist in `the shell writes only the elements it owns`, which needs `button` and `script`. Neither is an assertion bent to fit code: each had already written down the condition that invalidates it. Recorded in `deferred-work.md` as well.)* `test/server.test.ts:1926` (`EXPECTED_HARDENING`, exact equality against the module), `:1951` (`doesNotMatch(policy, /script-src/)`), `:1853` and `:2016` (page bodies); `test/render/artifact.test.ts:554` and `:670` (page-level).
- **Two must not change.** `test/render/artifact.test.ts:785` asserts a *non-markdown artifact's own text* `<script>alert(1)</script>` is escaped in the content region — that is about **project content**, stays true, and amending it would be editing an expectation to match code. `test/render/page.test.ts:199` stays untouched because the script is artifact-only.
- `src/render/artifact.ts:367` -- the exits row: `<div class="artifact-exits">` then `markup`<code class="artifact-path">…</code>`` then the editor link. `OPEN_IN_EDITOR_LABEL` and `artifactAbsolutePath` are exported beside it.
- `src/render/html.ts` -- `markup` escapes an attribute value correctly: a payload of `a" onmouseover=alert(1) x="b` renders `data-copy="a&quot; onmouseover=…"`, verified 2026-09-04. So the payload route needs no new escaping, only the existing one used deliberately.
- `src/render/components.ts` -- `ButtonOptions` is `{label, href}` and both are **required and guarded**. A copy control has no `href` and needs a payload instead, so it does not fit: decide between widening the type and building this control beside them, and say which. `deferred-work.md` records the Refresh hand-written-anchor bypass as a drift risk whose trigger is **this story**.
- `test/render/artifact.test.ts:221` -- `exitsOf` **depth-counts** the region, changed in 2.3a's review round precisely because this story is likely to nest an element there. Use it; do not reintroduce a non-greedy match.
- `test/render/stylesheet.test.ts` -- `REQUIRED_RULES` pins `.artifact-path`'s `overflow-wrap: anywhere` + `min-width: 0` and `.artifact-exits`'s `align-items: baseline`. All three were measured unpinned in 2.3a's review; a ghost button joining the row must keep them true.
- `test/render/components.test.ts` -- the exact per-surface primary count (Dashboard 0, artifact view 1). This story must not disturb it.
- `deferred-work.md` entries whose recorded trigger is **this story**: the primary/ghost box geometry difference (this is the first surface to render both **adjacently** — 2.3a's review established that condition had not yet fired); the Refresh anchor drift risk; and the **served-page coverage gap** — nothing asserts the served artifact response carries the exits row or an absolute href, and this story touches `test/server.test.ts` anyway, so it is the cheap moment. Close them or state explicitly that this story does not.

## Tasks & Acceptance

**Execution:**
- [x] `src/render/enhance.ts` -- new: the one script, as a compile-time constant, and the copy control's markup. Client code as a string under `src/` leaves `web/` empty, so `test/architecture.test.ts`'s deliberate one-empty-scanned-root tripwire does **not** trip — state that placement rather than discovering it.
- [x] `src/render/artifact.ts` -- the control in the exits row, `hidden`, with the path as its escaped payload; the script emitted once in the artifact shell.
- [x] `src/adapters/http/server.ts` -- the `sha256` of the script constant appended to the CSP as `script-src 'sha256-…'`, computed at module load so the header and the page derive from one source.
- [x] `src/render/stylesheet.ts` -- whatever the control needs, every value through a token, no clipping property; and confirm the row's pinned reflow declarations still hold with two controls in it.
- [x] `test/render/enhance.test.ts` -- new: the control is `hidden` in the served markup; the payload is escaped against a hostile path; the script is a constant with no interpolation.
- [x] `test/server.test.ts` -- **the hash recomputed from the served response body** and compared to the header's directive, so the check cannot pass on a constant agreeing with itself (proven feasible 2026-09-04: extraction and recomputation reproduce the directive exactly, and a one-identifier edit to the page breaks the match). Plus the four assertion changes here, and the served exits row with an absolute href, closing the coverage gap.
- [x] `test/render/artifact.test.ts` -- the control in the exits row for every row state; `:554` and `:670` amended with reasons; **`:785` left alone**.
- [x] `test/render/stylesheet.test.ts` / `test/render/page.test.ts` -- the new class in the round-trip and `KNOWN_CLASSES`; `page.test.ts`'s no-script assertion **untouched**.
- [x] `scripts/run-tests.ts` -- raise the floor from 1027.

**Acceptance Criteria:**
- Given any artifact response, when its CSP is read, then its `sha256` equals the hash of the script in that same response's body.
- Given the served markup, when the copy control is inspected, then it is `hidden` and carries the path escaped inside its attribute.
- Given a reader without script, when the page renders, then no copy control is visible and the path is still selectable text.
- Given the artifact surface, when its markup is inspected, then exactly one element carries `button-primary` and it is the editor link.
- Given the whole suite, when it runs, then `test/render/page.test.ts`'s and `test/render/artifact.test.ts:785`'s no-script assertions pass unamended, and nothing writes to the project.

**2026-09-04 — review round: three layers, nine patches, five deferrals, and one defect that broke this story's own acceptance criterion.**

**The control was visible with no script.** `[hidden] { display: none }` is a *user-agent* declaration, and `.button-primary, .button-ghost` sets `display: inline-flex` in **author** origin — author beats UA regardless of specificity, and the sheet had no `[hidden]` rule at all. So the control this story serves `hidden` was painted anyway: a reader with script disabled, or whose browser refused the hash, saw a button that does nothing. That is precisely the dead control the hidden-then-revealed design was chosen to prevent, and the acceptance criterion "no copy control is visible" was unmet while the suite was green. Fixed with a `.artifact-copy[hidden]` rule that wins by specificity, pinned in `REQUIRED_RULES`, and re-verified by mutation.

**The script's position was unpinned, and my first attempt to pin it was vacuous.** The comment calls the placement after `</main>` a mechanism — the script is a classic inline script with no `defer`, so it sees only what precedes it. Measured: moving the emit above `<main>` left **1040/1040 green** while, in a browser, the control would never be revealed. My first assertion compared `page.indexOf(COPY_CONTROL_CLASS)`, which finds the class in the **inlined stylesheet** in `<head>` and is therefore satisfied by every placement. Caught by re-running the mutation against my own fix; it now compares the control's element to the script's element and it bites.

**The shape guard the CSP hash "rests on" read the value, not the source.** The test's own comment said "Read from the module's own source rather than from the value, because a value cannot tell you how it was built" — and the next line was `const source = COPY_SCRIPT`. Measured: rewriting the selector as `'.${COPY_CONTROL_CLASS}'` — the exact shape both docblocks forbid — leaves the value byte-identical and passes. It now reads the file. **And the script is now parsed** (`new Script(COPY_SCRIPT)`): it is a string under `src/`, so `tsc` never sees it and no linter touches it, and a typo would have shipped a dead feature with a green suite and a hash faithfully permitting the broken bytes.

**Three script hardenings the reviewers were right about.** The query was document-wide, so a project's own markdown containing `<button class="artifact-copy" data-copy-path="…">` would have been revealed and wired to the clipboard with an attacker-chosen payload — now scoped to the exits row *and* skipping anything inside the content region. The guard tested `navigator.clipboard` but called `writeText`, so an object without the method would reveal the control and throw on every click — now both. And a missing payload wrote an empty string over whatever the reader had copied — now a no-op.

**One assertion removed for being the wrong kind of claim.** A test pinned the *absence* of `writeText` rejection handling, which made a known limitation a required property and would have forced the eventual fix to delete an assertion first. Not asserting the outcome is right — there is no clipboard here; asserting that no handler may exist is a different claim and it was wrong.

**One reviewer claim measured and rejected.** A layer reported that an *unclosed* `<script>` in a document swallows the shell's script so nothing hashes to the permitted source. Measured directly: both the closed and unclosed spellings leave the shell's script a discrete element. What the finding did correctly expose is that "exactly one script" was a fact about the *fixture* — an embedded script makes two — so the claim is now scoped and both spellings are asserted.

## Design Notes

**Hidden-then-revealed, rather than a button that might not work.** The control is served `hidden` and the script removes that. With script disabled it never appears, so there is no dead control and no promise the page cannot keep; with script enabled it appears and works. This also makes the requirement testable from markup alone — `hidden` in the served body is an assertion, where "the button works" is not.

**Why a hash and not `'unsafe-inline'`, restated because it is the whole reason this story is separate.** Embedded HTML renders, so a project's own markdown can carry a `<script>`. `'unsafe-inline'` would execute it. A hash permits exactly one script — ours — and nothing else, at no extra cost, because it is derived rather than maintained.

**What cannot be verified here.** No browser, no clipboard, no editor. Assertable: the markup, the `hidden` attribute, the escaped payload, the header's exact value, and that the header's hash matches the script served. Not assertable: that the clipboard receives anything, that `writeText`'s rejection is handled well, or that the CSP is honoured. `server.ts`'s own CSP docblock warns the policy "must not be allowed to stand in for a test of behaviour" — nothing in the tests may imply otherwise.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm test` -- **1041 pass, 0 fail, 0 skipped** (1027 at baseline). `DEFAULT_MIN_TESTS` raised to 1041.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-2-3b-copy-the-artifact-path.md` -- every ticked task names a file the diff touches.
- **Mechanism check:** change one byte of the script constant and confirm the served-body hash test fails. If it passes, the test is comparing a constant to itself.
- **Mechanism check:** remove `hidden` from the served control and confirm a named test fails.
- **Diff check, not a test:** done — both are **byte-identical** to `d64f993` (they moved lines, the text did not). Passing would not have shown this, which is why it was a diff and not a run. Separately, the Code Map's "six assertions change" was **wrong: it is eight** — the two it missed had each written down the condition that invalidated them, and the replacements are *tighter* rather than looser (`/<script[^>]/i` now asserts the only script is bare, with no `src`, `nonce` or `defer`, and a new row pins the Dashboard at zero).

**Manual checks:**
- Serve this repository, open one of its own specs, and report the exact `content-security-policy` header and the `<script>`'s first line.
- Confirm the Dashboard's response carries no `<script>` while the artifact page's does.

## Suggested Review Order

**The script, and the four things review changed about it**

- The page's one script: scoped to the exits row, skipping the content region.
  [`enhance.ts:111`](../../src/render/enhance.ts#L111)

- The guard that refuses a `<`; its behaviour is pinned, its wiring is not.
  [`enhance.ts:133`](../../src/render/enhance.ts#L133)

**The header, derived rather than maintained**

- One `sha256` of the constant, spliced into a still-frozen policy.
  [`server.ts:165`](../../src/adapters/http/server.ts#L165)

- Recomputed from the served body, so it cannot pass on a constant agreeing with itself.
  [`server.test.ts:2118`](../../test/server.test.ts#L2118)

**Where the story nearly shipped a dead control**

- `hidden` lost to an author-origin `display` until this rule; author beats UA.
  [`stylesheet.ts:731`](../../src/render/stylesheet.ts#L731)

- Pinned, because the whole no-dead-control design rests on one declaration.
  [`stylesheet.test.ts:700`](../../test/render/stylesheet.test.ts#L700)

- Position is the correctness: a parse-time script sees only what precedes it.
  [`artifact.ts:416`](../../src/render/artifact.ts#L416)

- Both facts asserted; my first version compared the stylesheet and was vacuous.
  [`artifact.test.ts:334`](../../test/render/artifact.test.ts#L334)

**Supporting**

- Reads the file, not the value — and parses the script, which nothing else does.
  [`enhance.test.ts:129`](../../test/render/enhance.test.ts#L129)

