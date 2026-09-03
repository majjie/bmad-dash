---
title: 'Story 1.12 — See the project inventory'
type: 'feature'
created: '2026-09-03'
status: 'done'
baseline_commit: 'e7b6c7ab9e044066345f11bf8467f5be058b3b61'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.7–1.11 built a model nothing reads. `src/cli/inventory.ts` has an asserted-empty importer set, the served page still says `Serving. No surface built yet.`, and thirteen deferred entries are waiting on this story. The verdicts, readability signals, interpretation states, run facts and story location all exist and are invisible.

**Approach:** The Dashboard's placeholder tile is replaced by the inventory, grouped by family, rendered with the Story 1.2 tokens and the Story 1.3 tile. The composition root projects the `Inventory` into a view the render layer declares, so render depends on domain types only. Every state word comes from the vocabularies the model already pins against their source documents; every sentence comes from the string index, extended where it has no row. Project-derived text is escaped at the boundary.

## Boundaries & Constraints

**Always:** State words and sentences are **read** from the existing normative tables — `SIGNAL_LABELS`, `LEVEL_LABELS`, `OUT_OF_TREE_STRING`, `LOCATION_DEFINITIONS`, `INTERPRETATION_DEFINITIONS`, `RUN_FACT_DEFINITIONS` — never re-copied; a second copy of any of them is a defect this story was told about in advance. Where the index has no row, a row is **added to `EXPERIENCE.md`** and the code reads it from there. Every project-derived value is escaped before it reaches markup, and a crafted filename must be unable to inject. Nothing depends on colour alone: every state carries its word. One `h1`, landmarks in order, tile labels as real headings, focus ring never clipped, text to 200%. `Not checked` and `Not found` never collapse into "none".

**Ask First:** A third `Confidence` value. A sixth surface or a second route. Hardening headers and CSP — recorded as their own item, and this story is what makes them load-bearing. Any change to the four signal colours or the closed state sets.

**Never:** Do not render a `reason` sentence verbatim — `StoryLocation.reason`, `Readability.reason`, `WalkEntry.reason`, `Attempt.reason`, `Parts.reason(s)`, `Skip.reason`, `Alias.reason`, `UnmeasuredRunFacts.reason` and `Listing.reason` are all hand-written and no document backs them. Do not import anything from `src/cli/` into `src/render/`. Do not link an artifact anywhere — artifact URLs are Story 2.1's and there is one route. Do not paginate (2.9), do not build the Recent activity, Core artifacts or Risk summary tiles (Epic 3), and do not serve a script — the page ships none and the keyboard story is document order alone.

**Stated limit, accepted deliberately:** the UX design has **no inventory surface**. `EXPERIENCE.md` and `DESIGN.md` never mention one, UX-DR15 fixes the surface list at five, and the Dashboard's three named tiles are all Epic 3 content. The inventory therefore takes the placeholder's slot on the Dashboard as an **interim**, and that is recorded rather than presented as the designed shape. `EXPERIENCE.md:220`'s collapse order names tiles that do not exist yet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| A real project | this repository | every artifact listed, grouped by family, each with its type, its path, and its state where one applies | nothing omitted |
| Identified below certain | a verdict resolved at `filename` | the artifact shows its type **and** that the reading is below certain | FR-69's confidence clause |
| Unidentified | no level resolved | the index's `Not identified. Tried: …` sentence, levels named from `LEVEL_LABELS` | FR-69 |
| Uninterpretable | identified, no interpretation applies | FR-12's state, by its own row rather than merged with unidentified | distinct from unidentified |
| Unreadable | a file that could not be decoded | its state word and the stage, from `SIGNAL_LABELS` | never colour alone |
| Not checked under a root | a file no level opened | `Not checked` — and a decision recorded on whether that reads as misleading | never shown as "none" |
| A family with no artifacts | e.g. `forge` absent | the index's per-family empty sentence, and **not** the run-folder template for a family that is never a run | the template is false for four of eleven |
| Story location out of tree | `story_location: /etc` | the index's out-of-tree sentence, substituted, at the family level | never the raw `reason` |
| Sprint view unavailable | no `sprint-status.yaml` | the new index row for an unavailable view, not an empty tile | FR-75 |
| Run folder that may collide | a dated run folder | the collision sentence, and whether reuse is deliberate or accidental | from `RUN_FACT_DEFINITIONS` |
| Bound reached | the walk truncated | the pass reports incomplete and the page says so | never silently partial |
| Hostile filename | a file named `<img src=x onerror=alert(1)>.md` | rendered as text; no markup injected | escaped at the boundary |
| An empty project | markers present, no artifacts | the index's `A BMAD project, with no artifacts yet.` | not a bare blank |

</frozen-after-approval>

## Code Map

- `src/cli/inventory.ts` -- `takeInventory` → `Inventory` (`:279-341`) and `InventoryEntry` (`:196-269`): `entry`, `identity`, `children`, `composition`, `readability`, `interpretation` (`undefined` when the artifact is not there), `runFacts`. Plus `truncations`, `complete`, `skipped`, `skippedNotRecorded`, `aliases`, `suppressedNotRecorded`, `storyLocation`. **Its importer set is asserted empty** at `test/architecture.test.ts:998-1008` with the message that this story is the first and adding it is an edit there.
- **The layering constraint.** `ARCHITECTURE-SPINE.md:32` gives `src/render/` "domain types only", and `:52` has `RENDER --> DOMAIN`. `Inventory` cannot move to `src/domain/` — it references `CanonicalPath` and `WalkEntry`, which the purity gate forbids the domain importing. So the composition root projects it into a view the render layer declares. Note the gate does **not** enforce a render layer rule, so a `render → cli` import would pass the suite; the spine and `test/architecture.test.ts:793-795` are what forbid it.
- Render layer today: `page.ts:51` `PAGE_STATUS_LINE = 'Serving. No surface built yet.'`, the single-tile placeholder at `:73-82`, `renderPage(projectRoot)` at `:99`; `components.ts:43` `TileContent = {html} | {empty}` with **`html` emitted unescaped** (`:28-42`); `html.ts:33` `escapeHtml`; `chrome.ts` header and `SIGNAL_NOT_CHECKED`; `stylesheet.ts:56` `EMITTED_COMPONENTS`, and `.tile-grid` at `:415-420` is `grid-template-columns: 1fr` **at every width** — this is the first story with more than one tile, and UX-DR22's 900px breakpoint belongs here.
- Wiring: `src/cli/index.ts:459` passes `projectRoot` to `startServer`; `StartServerOptions` (`server.ts:53-83`) has no data slot; `server.ts:361` is the only route. Three signatures widen.
- Normative tables to read, never copy: `SIGNAL_LABELS` (`signal.ts:77`, already read out of the index by `test/render/chrome.test.ts:50-69`), `LEVEL_LABELS` (`identity.ts:183` — `location` displays as **`config path`**), `OUT_OF_TREE_STRING`/`outOfTreeReport` (`sprint.ts:215,227`), `LOCATION_DEFINITIONS` (`sprint.ts:157`), `INTERPRETATION_DEFINITIONS` (`interpretation.ts:90`), `RUN_FACT_DEFINITIONS` (`runs.ts:125`). **No label table exists for `Family`, `Shape` or `Confidence`** — one is needed, pinned against `FAMILIES` so none can be missing.
- Importer sets that must be edited deliberately, each with a message saying so: `inventory.ts` (`:998`), `signal.ts` (`:884`, a fourth importer is a decision), `interpretation.ts` (`:889`), `runs.ts` (`:916`), `sprint.ts` (`:936`), `identity.ts` (`:809` — whose comment says a render module in that list "is the failure the exact set exists to catch"). Also `test/render/page.test.ts:132-149` `KNOWN_CLASSES` and `test/render/stylesheet.test.ts:619-652`'s bidirectional class/rule check.
- Accessibility already enforced: one `h1`, one `<header>` before one `<main>`, tile labels as `h2`, no inline style or hex/px literal, **no `<script>`**, no `overflow`/`clip-path`/`mask` anywhere (2.4.11), every font-size in `rem`, 17 recomputed contrast ratios, focus ring drawn and never clipped, `prefers-reduced-motion`. **Nothing tests keyboard or ARIA** — `grep` for `tabindex|aria-|role=` over `src/` and `test/` returns nothing.
- Binding wording: `epics.md:399` (this story's done-condition), `EXPERIENCE.md:78-110` (the index, declared "the complete index"), `:152` ("a bare 'nothing here' is a defect on every surface"), `:154`, `:168` (out-of-tree at the family level, not as a signal state), `:206-216` (the accessibility floor), `:220` (the 900px collapse order), `DESIGN.md:217,221` (the four signal colours are closed and converge under protanopia, so the state word is load-bearing), `:293` ("a tile that needs two headings is two tiles"), `:253` (the breakpoint value).
- **Thirteen deferred entries trigger here**, at `deferred-work.md:253, 266, 329, 339, 349, 383, 389, 399, 417, 423, 430, 446, 468` — the empty importer set, below-certain confidence, `Not checked` over a root, FR-12's missing row, FR-75's missing row, the run-collision distinctions, `No <family> runs` being false for four families, three sets of unconsumed exports, out-of-tree's treatment, and the seven non-normative `reason` sentences. Two more name this story in `evidence:` only: `:23-25` (no hardening headers — "becomes load-bearing the moment Stories 1.12 and 2.1 render project content into it") and `:117-119` (the single-column tile grid).
- **Not designed, and to be recorded as invented:** the inventory's existence, its grouping markup and heading levels, what a row shows and in what order, the per-family empty state, and the grid track. `grep -in "inventor"` over `EXPERIENCE.md`, `DESIGN.md` and `SPEC.md` returns nothing; there is no inventory mockup, and UX-DR24 says the spines win over any mockup.

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/EXPERIENCE.md` -- add the index rows this surface needs — FR-12's state, FR-75's unavailable view, the location states that have no row, the deliberate-versus-accidental reuse and absent-date distinctions, and a per-family empty sentence that is true for a family that is never a run -- the index calls itself complete and nine needed strings are missing
- [x] `src/render/inventory.ts` -- new: the view types the render layer declares, and the inventory rendered as tiles grouped by family, every state word and sentence read from its normative table -- render may depend on domain types only, so the shape it consumes is its own
- [x] `src/render/components.ts` -- give a tile a content form that escapes what it is handed -- `html` is emitted verbatim and this is the first caller passing project-derived text
- [x] `src/render/page.ts` -- replace the placeholder tile with the inventory, keeping one `h1`, the landmark order and the heading levels -- the surface is the Dashboard's interim content, not a sixth surface
- [x] `src/render/stylesheet.ts` -- give `.tile-grid` real columns and the 900px breakpoint, and emit a rule for every new class -- the grid is single-column at every width and this is the first story with more than one tile
- [x] `src/cli/index.ts` -- take the inventory once and project it into the render view -- the projection is where display decisions live, and it keeps `src/render/` clear of `src/cli/`
- [x] `src/adapters/http/server.ts` -- carry the projected view through to the page -- three signatures widen and the adapter must not compose anything itself
- [x] `test/render/inventory.test.ts` -- new: every I/O-matrix row, with each sentence asserted to come from `EXPERIENCE.md` and each state word from its table
- [x] `test/render/page.test.ts` -- extend the structural and class assertions to the new markup, and add the injection case: a crafted filename renders as text
- [x] `test/architecture.test.ts` -- edit each importer set deliberately, with the reason, and assert that `src/render/` imports nothing from `src/cli/` -- the gate has no render rule, so the spine's dependency direction needs one here
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- close or answer each of the thirteen entries that trigger here; record the interim-surface decision, the invented grouping and row shape, the hardening-header item this story makes load-bearing, and the keyboard limit -- a story that renders everything is where the accumulated obligations come due
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new observed total -- never lowered

**Acceptance Criteria:**
- Given this repository, when the page is rendered, then every artifact the pass found appears, grouped by family, each showing its type, its path, and its state where one applies — and no artifact is omitted.
- Given a file named with markup characters, when the page is rendered, then the name appears as text and no element is created by it; a mutation removing the escaping fails the suite.
- Given every sentence the surface shows, when the suite runs, then each is read out of `EXPERIENCE.md`'s index and each state word out of its own table — a mutation that hardcodes any of them fails.
- Given `src/render/`, when the architecture suite runs, then it imports nothing from `src/cli/`, and each widened importer set names its new member deliberately.
- Given `npm test`, when it completes, then typecheck, build and suite pass with `fail 0`, at or above the raised floor, the contrast and structural assertions still hold, and the page ships no script.

## Spec Change Log

_Empty — no review loopback yet._

## Verification

**Commands:**
- `npm test` -- expected: exit 0, `fail 0`, total at or above the raised `DEFAULT_MIN_TESTS`.
- `node --test --test-reporter=spec test/render/inventory.test.ts` -- expected: every matrix row a named passing test.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-1-12-see-the-project-inventory.md` -- expected: exit 0, no `MISS`.
- Manual: `node dist/cli/index.js . --no-open` then fetch `/` -- expected: the inventory of this repository, grouped by family, with no placeholder text.

## Suggested Review Order

**The surface, and what it may know**

- Start here: the view the render layer declares, so it depends on domain types and never on `src/cli/`.
  [`inventory.ts:380`](../../src/render/inventory.ts#L380)
- One row: its type, its path, and its state where one applies.
  [`inventory.ts:302`](../../src/render/inventory.ts#L302)
- The tiles, grouped by family, the scan tile spanning the row it qualifies.
  [`inventory.ts:721`](../../src/render/inventory.ts#L721)

**Escaping made structural, not remembered**

- `Markup` is unforgeable: the class never leaves the module, so `new Markup(untrusted)` cannot be written.
  [`html.ts:146`](../../src/render/html.ts#L146)
- Index sentences filled by name, with an unfilled placeholder reported rather than shipped.
  [`html.ts:190`](../../src/render/html.ts#L190)

**The projection — where every display decision lives**

- The one place the pass becomes a view; drops every non-normative reason by construction.
  [`index.ts:383`](../../src/cli/index.ts#L383)
- A supplier, not a value: one snapshot per page load, which is what makes Refresh true.
  [`index.ts:792`](../../src/cli/index.ts#L792)
- The adapter carries it and composes nothing.
  [`server.ts:122`](../../src/adapters/http/server.ts#L122)
- The breakpoint, the one dimension literal outside `:root`, because `var()` is invalid in a media query.
  [`stylesheet.ts:80`](../../src/render/stylesheet.ts#L80)

**The two tests that close this epic's last gap**

- The composition root hands the server the view it projected — the seam that was green while serving nothing.
  [`inventory.test.ts:556`](../../test/render/inventory.test.ts#L556)
- Every artifact the pass found appears, anchored on its own path cell rather than a substring.
  [`inventory.test.ts:321`](../../test/render/inventory.test.ts#L321)
