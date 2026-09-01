---
title: 'Story 1.3 — Build the components every surface reuses'
type: 'feature'
created: '2026-09-01'
status: 'done'
baseline_commit: '7db809b74284449870be2d2c225fc518f30c0d4b'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The served page is one heading and one status line inside `main` — no banner, no container, nothing a later surface can reuse. The first surface built would invent its own tile, header and focus containment, and Story 1.2's tokens would each acquire a second interpretation.

**Approach:** Build the shared vocabulary once as functions in `src/render/`: `tile`, `tile-raised`, and the project header as a real banner landmark, every value resolving through the Story 1.2 token layer. Project identity reaches render through the seam the composition root already opened but nothing yet reads.

## Boundaries & Constraints

**Always:** Every visual value resolves through a token — no hex, px or rem literal. Tonal elevation only: no shadow, gradient or blur. `tile-raised` is exactly one ladder step above `tile`, and at most one raised tile per surface, enforced mechanically rather than by convention. Containers reserve focus-ring space inside their own padding and never clip it. A tile renders meaningfully when its content is empty and says which; its label is a real heading, so the page is traversable by structure. Landmarks: `banner` for the header, `main` for the surface, exactly one `h1` — belonging to the surface, not the banner. The surface here is the **Dashboard**, the landing surface for a bare invocation, so that is what the `h1` names; the tool's own name stays in `title` alone. The surface exists and is correctly named from this story on; its tiles arrive later. Strings from the load-bearing index are verbatim: git availability reads `Not checked`, the index's own wording for a signal not examined. Project identity resolves once in the composition root and is passed onward; nothing in `src/render/` or `src/adapters/` re-resolves it. Document HTML lives in `src/render/`, never in the HTTP adapter (AD-2).

**Ask First:** Any user-visible string that is not in the 25-row string index. Any runtime dependency. Reading anything from the target project beyond the resolved root path already passed in.

**Never:** No client-side JavaScript — the refresh control is a link, since a page load builds a new snapshot, only `GET` and `HEAD` are permitted, and no client router may own a URL. No git invocation and no `node:child_process`; the availability probe is a separate story. No reading project configuration for a display name — the path's final segment serves for now. No `activity-row`, `evidence-badge`, `signal-pill`, `core-artifact-card`, buttons or `refresh-progress`: later stories, tokens transcribed but unemitted. No snapshot currency, progress or failure reporting — there is no snapshot yet. No framework, component library or runtime dependency. Do not edit `DESIGN.md`, `EXPERIENCE.md` or `epics.md` to match the code. No light theme.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Tile with content | label and body | one tonal container, label as a heading above its content | N/A |
| Tile with empty content | label, no body | renders and states that it has nothing, never a bare container | N/A |
| Raised tile | `tile-raised` requested | one ladder step above `tile`, same padding and radius | N/A |
| Two raised tiles on one surface | a surface composing two | composition fails naming the rule | Loud failure |
| Project header | resolved absolute root path | banner carrying name, full path monospaced, `Not checked`, refresh link | N/A |
| Refresh activated | the refresh link followed | `GET /` returns a freshly rendered page; no state carried across | N/A |
| Render without a project root | root missing or not absolute | render fails loudly; never a header with a blank or invented path | Loud failure |
| Focus on any control | keyboard focus at a container's edge | complete ring, offset intact, nothing clipped or occluded | N/A |
| Text at 200% | browser zoom on text only | layout survives; no clipped or overlapping content | N/A |

</frozen-after-approval>

## Code Map

Stories 1.1 and 1.2 are done and pushed. 227 tests, zero runtime dependencies, `HEAD` at `7db809b`.

- `.../ux-bmad-2026-08-28/DESIGN.md` -- normative. `components.tile` and `tile-raised` already transcribed; Elevation & Depth was rewritten 2026-09-01 and distinguishes peer levels from nested surfaces. Read-only.
- `.../ux-bmad-2026-08-28/EXPERIENCE.md` -- the string index (`Not checked`), tile behaviour, landmark and accessibility rules. Read-only.
- `src/render/stylesheet.ts:50` -- `EMITTED_COMPONENT`, a **single** name. Must become a set; `isEmitted`, `unemittedTokens` and `customPropertyName` all key off it.
- `test/render/stylesheet.test.ts` -- asserts the deferred sets are exactly nine by name. Two leave that list, so this changes; it is what proves nothing is emitted by accident.
- `src/render/page.ts` -- the whole document, `main` only, `renderPage()` taking no arguments. Gains the banner and takes project identity as input.
- `src/adapters/http/server.ts:327` -- calls `renderPage()` with nothing. `StartServerOptions.projectRoot` exists, documented "never read here", and `src/cli/index.ts:182` already passes it. This story is its first consumer — the unconsumed-option shape the `--port` finding flagged in 1.1.
- `test/render/page.test.ts` -- structural assertions (one `h1`, no inline style, no fetch) that must keep holding as the document grows.
- `test/architecture.test.ts` -- the AD-1 gate scans `src/render/` automatically; no gate change expected.
- `scripts/run-tests.ts:32` -- `DEFAULT_MIN_TESTS` is 227 and must rise, or the floor stops meaning anything.

To create:

- `src/render/components.ts` -- `tile` and `tileRaised`, plus the surface composer that enforces the single-raised-tile rule
- `src/render/chrome.ts` -- the project header as a banner landmark
- `test/render/components.test.ts` and `test/render/chrome.test.ts` -- behaviour, tokens, and the geometric focus-containment invariant

## Tasks & Acceptance

**Execution:**
- [x] `src/render/stylesheet.ts` -- generalize `EMITTED_COMPONENT` to a set and emit `tile` and `tile-raised`; keep the seven remaining sets transcribed and unemitted -- UX-DR2
- [x] `src/render/components.ts` -- `tile`, `tileGrid`; a tile states its emptiness rather than rendering hollow; the composer refuses a second raised tile -- UX-DR5, UX-DR6 -- *(amended: built as `tile({ raised })` rather than a separate `tileRaised` export. `tileGrid` must count raised tiles to enforce the one-per-surface rule, and it can only do that from the caller's **intent**; given two functions it would have had to infer intent from rendered class names, which checks its own output rather than the caller and would pass for hand-written markup.)*
- [x] `src/render/chrome.ts` -- the project header as a `banner`: name from the path's final segment, full path monospaced, git availability as the verbatim `Not checked`, and the refresh control as a link -- UX-DR14
- [x] `src/render/page.ts` -- take project identity as input and compose banner plus `main`; the single `h1` names the Dashboard surface, and the existing status line moves into a tile so the component has a real consumer -- UX-DR21, AD-2
- [x] `src/adapters/http/server.ts` -- read `projectRoot` from options and pass it to render; fail loudly rather than serving a header with no path -- NFR-15
- [x] `test/render/components.test.ts` -- the matrix rows for tiles, including the two-raised-tile failure and the empty-content case, plus the geometric invariant that a container's padding reserves the ring's width and offset and never clips it -- UX-DR13
- [x] `test/render/chrome.test.ts` -- the header's landmark role and contents, `Not checked` asserted against EXPERIENCE.md's own index rather than a copy, and the absence of any script or git invocation -- UX-DR14, UX-DR17
- [x] `test/render/page.test.ts` -- landmark and single-`h1` structure as the document grows; the loud failure when project identity is missing
- [x] `test/render/html.test.ts` -- every escape mapping asserted by table, including `&` and `'`, and a double-escape check -- *added in loop 1; the module shipped untested* -- NFR-15
- [x] `test/cli/startup-order.test.ts`, `test/server.test.ts` -- assert the value the composition root resolves is the value the served page shows, end to end -- *added in loop 1* -- AD-9
- [x] `test/render/stylesheet.test.ts` -- every emitted type role is applied by some rule, and every class the document carries is styled by one -- *added in loop 1* -- UX-DR3, UX-DR4
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new total

**Acceptance Criteria:**
- Given a surface composed with two raised tiles, when it is rendered, then composition fails naming the rule rather than producing two lifted containers.
- Given the page is served, then the document carries exactly one `banner`, one `main` and one `h1`, and no `script` element or external reference of any kind.
- Given any string the header takes from the load-bearing index, when EXPERIENCE.md's wording for it changes, then a test fails naming the string — the index is read, not copied.
- Given the composition root resolves a project root, when the page is served, then the page shows *that* root; and given the root passed to the server is changed to any other path, then a test fails. *(Added in loop 1 — replacing it with `process.cwd()` passed all 263 tests.)*
- Given any value the document depends on is produced in one module and consumed in another, then a test observes it at the consuming end, not only at the producing end. *(Added in loop 1 — this is the general form of the three findings that caused it.)*

## Design Notes

**A component token can name a whole type role, and those cannot be custom properties.** `components.tile.labelType` is `{typography.tile-label}`. A role is five declarations — family, size, weight, line height, sometimes letter spacing — each emitted separately, so there is no `--type-tile-label` to point at. Emitting `--tile-label-type: var(--type-tile-label)` would have produced a `var()` naming a property that does not exist, which CSS drops silently along with the whole declaration. The Story 1.2 review added the test that catches exactly this, which is how it was found rather than shipped. Role references are therefore a third category of unemitted token, resolved by *applying* the role at the point of use. Seven of the nine deferred component sets carry one, so every later component story meets this.

**The project header has no token set in DESIGN.md.** The ten sets are components; chrome is not one of them. Its values come from the scalar groups directly: it sits on the page ground it is already on, and its three lines take the `title`, `mono` and `mono-badge` roles.

**The header carries no rule line, for two reasons that agree.** There is no border-width token — the only widths in the system are a signal pill's stroke, the progress bar's height and the focus ring, each owned by its own component — so any border would have introduced a `1px` literal, which the token rule forbids. And DESIGN.md assigns `outline-variant` to dividers *inside a tile*; borrowing it for chrome would have been a misuse dressed as a token. Separation is spacing plus the tonal step to the tiles below, which the elevation model already provides.

**`projectRoot` became required rather than optional.** It existed unread for two stories. An option its owner cannot function without should not be omittable, and requiring it turns "forgot to pass the root" from a throw inside a request handler — which would surface as an uncaught exception and take the process down — into a compile error. Validation happens before the bind, so an unrenderable root stops the command instead of hanging a browser tab. This is the mirror of the `--port` finding, where an option had no consumer at all.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm test` -- expected: all pass, none skipped, floor raised
- `npm run build && node dist/cli/index.js` -- expected: serves; the page carries the banner with this project's own path
- `curl -s "$URL" | grep -c "<script"` -- expected: `0`
- `npm pack --dry-run` -- expected: `dist/`, `LICENSE` and metadata only

**Manual checks:**
- Tab to the refresh control and confirm the ring is complete and not clipped by the header's edge. This is the story's stated check that matters; the tile-edge case has no interactive element inside a tile until Story 1.12, so for tiles the invariant is enforced geometrically by test and re-checked visually then.
- Appearance and density are judged directly by the product owner, not asserted here.

**Matrix audit — two rows are covered structurally rather than behaviourally, stated rather than glossed:**

- *Focus on any control.* The geometric preconditions are enforced by test — a container's padding exceeds the ring's 4px reach, and no rule in the sheet hides its overflow, which is what actually cuts a ring. Whether the ring *looks* complete is a browser observation, and the tile-edge case has no interactive element inside a tile until Story 1.12.
- *Text at 200%.* Enforced as its mechanism, not its outcome: every type size is `rem`, and no rule fixes a height in px. A real text-only zoom needs a browser, so this is a proxy — a strong one, since a px type scale fails 1.4.4 completely rather than gradually, but a proxy.

## Spec Change Log

### Loop 1 — bad_spec, patched in place (user decision)

- **Trigger:** three reviewers. Three mutations passed the full 263-test suite: the composition root handing the server `process.cwd()` instead of the resolved target, deleting every `typeRole()` call from the new component rules, and dropping two of the five entries from the escaping table. A fourth finding needed no mutation — `.project-refresh` is emitted in markup with zero rules anywhere in the sheet.
- **Root cause was this spec, and it is the second consecutive loop of the same species.** Story 1.2's tasks asked only for *negative* assertions. This spec's tasks named the files to test but never required that a value produced in one module be observed at the module that consumes it. So `projectRoot` was asserted where it is created and where it is rendered, never across the seam; the type roles were asserted as tokens and as `REQUIRED_RULES` entries, never as *applied*; and `src/render/html.ts`, added during implementation, had no task requiring a test at all because it was not in the Code Map.
- **Because it recurred, the fix is not only in this spec.** A standing verification requirement was written to `_bmad/custom/bmad-build.toml`, so every future story inherits it at planning time instead of depending on my remembering the shape of the last failure. That file is the same mechanism the UX workflow uses to persist its reviewer lenses.
- **Patched in place rather than re-derived** (user chose `[P]`, with the tradeoff stated). Unlike Story 1.2 there were real source defects this time, not only test gaps — a dead class, a grid rule that does nothing, a path that overflows the viewport, a false claim in a doc comment, and no catch around a render inside the request handler. All are small and local, and re-deriving would have risked losing the role-reference discovery: a component token naming a whole type role cannot be a custom property, because a role is five declarations and there is no aggregate to point at. Every later component story meets that, and it was found by the closure test Story 1.2's own review added.
- **Known-bad state avoided:** a dashboard that names the wrong project while printing the right one on stderr; a header rendering filesystem paths in the body font; an escaping module missing two mappings, so a project at `/work/Acme & Co` emits a raw `&` and a directory named `&lt;script&gt;` is displayed to the reader as `<script>`.
- **KEEP — earned here, and worth surviving any later re-derivation:** the role-reference category and the reason it exists; `escapeHtml` as one central boundary rather than nine call-site decisions; `projectRoot` **required** rather than optional, validated before the bind, so an unrenderable root stops the command instead of throwing inside a request handler; `tileGrid` taking tile *options* rather than rendered strings, so the one-raised-tile rule is checked against the caller's intent rather than against its own output; `TileContent` as a union, so "empty" is unrepresentable without saying why; and the geometric focus-containment invariant expressed as *nothing clips its overflow* rather than as padding arithmetic, since clipping is what actually cuts a ring.

## Suggested Review Order

**The seam this story opened, and the loop-1 finding that it was never crossed**

- Start here: the CLI resolves the root once; everything below consumes that value.
  [`index.ts:182`](../../src/cli/index.ts#L182)

- One definition of a usable root, two callers, so they cannot drift into disagreeing.
  [`chrome.ts:92`](../../src/render/chrome.ts#L92)

- Validated before the bind, so an unrenderable root stops the command rather than a request.
  [`server.ts:350`](../../src/adapters/http/server.ts#L350)

- The assertion that was missing: the value the CLI resolved must be the value the server gets.
  [`startup-order.test.ts:188`](../../test/cli/startup-order.test.ts#L188)

- And end to end through a real spawned process, against the page's own body.
  [`server.test.ts:779`](../../test/server.test.ts#L779)

**Emission — a third category of token, discovered by Story 1.2's own gate**

- A component token naming a whole type role cannot be one custom property.
  [`stylesheet.ts:75`](../../src/render/stylesheet.ts#L75)

- The set that replaced a single component name; seven sets stay transcribed and unemitted.
  [`stylesheet.ts:56`](../../src/render/stylesheet.ts#L56)

- Refuses a role it cannot emit, rather than returning an empty rule body silently.
  [`stylesheet.ts:245`](../../src/render/stylesheet.ts#L245)

- The containers and the chrome; no border, because there is no border-width token to use.
  [`stylesheet.ts:349`](../../src/render/stylesheet.ts#L349)

**The containers**

- Content is markup or a stated reason — "empty" is unrepresentable without saying why.
  [`components.ts:43`](../../src/render/components.ts#L43)

- Counts raised tiles from the caller's intent, not from its own rendered class names.
  [`components.ts:88`](../../src/render/components.ts#L88)

- Label as a real heading, so the dashboard is traversable by structure.
  [`components.ts:68`](../../src/render/components.ts#L68)

**Chrome, and the one place project data becomes markup**

- Four of UX-DR14's six elements; the git signal is present and unexamined, not absent.
  [`chrome.ts:104`](../../src/render/chrome.ts#L104)

- Escaping as one boundary rather than nine call-site decisions.
  [`html.ts:33`](../../src/render/html.ts#L33)

- The banner precedes the surface, and the h1 names the Dashboard rather than the tool.
  [`page.ts:99`](../../src/render/page.ts#L99)

- The status line moved into a tile, so the component has a consumer on the page.
  [`page.ts:73`](../../src/render/page.ts#L73)

**The gates the loop added — each one a mutation that used to pass**

- Every emitted type role is applied by a rule, or held back with a written reason.
  [`stylesheet.test.ts:596`](../../test/render/stylesheet.test.ts#L596)

- Both directions: no rule without markup, no markup without a rule.
  [`stylesheet.test.ts:619`](../../test/render/stylesheet.test.ts#L619)

- The table this story should have extended the first time.
  [`stylesheet.test.ts:293`](../../test/render/stylesheet.test.ts#L293)

- The escaping contract as a table, not as whichever characters a fixture happened to hold.
  [`html.test.ts:28`](../../test/render/html.test.ts#L28)

- The module's own correctness argument — one pass, so `&` cannot double-escape — asserted.
  [`html.test.ts:43`](../../test/render/html.test.ts#L43)

**Peripherals**

- The index is read from EXPERIENCE.md's table, not held as a second copy of the string.
  [`chrome.test.ts:50`](../../test/render/chrome.test.ts#L50)

- The one-raised-tile rule checked where a surface actually exists.
  [`page.test.ts:107`](../../test/render/page.test.ts#L107)

- Refused, naming both tiles, because "look at this first" is not something two can be.
  [`components.test.ts:91`](../../test/render/components.test.ts#L91)
