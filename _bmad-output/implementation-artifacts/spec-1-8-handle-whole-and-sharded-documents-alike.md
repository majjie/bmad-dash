---
title: 'Story 1.8 — Handle whole and sharded documents alike'
type: 'feature'
created: '2026-09-02'
status: 'done'
baseline_commit: 'c74275feac3491c7064ea226ff3ad9995049a099'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.7 decides an artifact's *shape* — `document`, `sharded-document`, `run-folder` — but nothing models what a document is *made of*. A sharded PRD is a directory whose parts are separate files, and no unit can name them, so every later story that opens, pages or links a document would have to re-derive its composition. Nothing in the codebase carries a document's parts.

**Approach:** A pure domain model that presents both shapes through one interface: the document's own identity plus the ordered parts that compose it, as paths. A whole document has one part, itself. A sharded document has its `index.md` first and its siblings after. Where the directory cannot be told from a run folder, both readings are offered and neither is chosen.

## Boundaries & Constraints

**Always:** **`index.md` is neither necessary nor sufficient** — measured, `review-edge-cases.md:290`: it may be absent from a shard set and present in a run folder. So the ambiguity is a real property of the filesystem, not a gap in the rule, and it is presented rather than resolved (AD-4, FR-73). Parts are **paths only** — extraction-shaped, never text or tokens, because AD-3 forbids the snapshot pass building a rendering representation. Parts come from the listing the walk already reported; **never re-enumerate** (`inventory.ts:19-22`: asking again probes the tree twice and could disagree). Part order is lexical with `index.md` first — a **choice, not a specification**, recorded as such so Epic 2 can overrule it.

**Ask First:** Reading or concatenating shard content into one text — that is a rendering representation and Epic 2's FR-77. Adding a fifth `Shape`. Widening `ConfinedReader` beyond its one root.

**Never:** Do not invent a manifest convention — no source says BMAD writes an ordering into `index.md`, and it may be absent. Do not page, carve by heading weight, or build a contents rail (FR-25/26/77, Epic 2). Do not resolve the run-folder-versus-sharded ambiguity, by precedence or by heuristic. Do not import anything into `src/domain/` from outside it — the purity gate has no `import type` exemption.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Whole document | a single `.md` file | one document whose single part is itself | N/A |
| Sharded, unambiguous | directory with `index.md`, name carries no run-folder signal | sharded document; parts are `index.md` then the remaining markdown children, lexically | N/A |
| Both signals | directory with `index.md` **and** a run-folder name | ambiguous: both readings offered, the sharded reading carrying its parts, neither chosen | never resolved by precedence |
| Shard set with no index | directory of markdown, no `index.md`, no run-folder signal | not claimed as a document — stated, because `index.md` being absent is measured-possible and there is no other signal | the honest limit, recorded |
| Alias-suppressed index | `index.md` is a symlink to an already-reported path | the suppression is **reported**, so the directory is not silently a plain run folder | the inherited defect at `deferred-work.md:258` |
| Listing unavailable | a bound stopped the directory's enumeration | parts unavailable; the sharded reading stays open rather than refuted | never answered from evidence not held |
| Listing filtered | the skip policy removed a child | parts reported as possibly incomplete rather than authoritative | the `Listing` hole at `deferred-work.md:263` |
| Empty directory | no children at all | not a document | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/identity.ts:163` -- `Shape` (`document` | `sharded-document` | `run-folder` | `container` | `unknown`); `:477` `SHARD_INDEX = 'index.md'`; `:775-799` `directoryShapes` — `:791` is the index test, `:792` both-signals ⇒ both readings, `:789` deliberately leaves the sharded reading open when the listing is unavailable. **`Verdict` (`:204-229`) has no parts field**, and `Candidate.children` (`:270`) is transient — 1.7 has the shape answer and none of the composition answer.
- `src/cli/inventory.ts:137-140` -- `InventoryEntry` carries only `entry` and `identity`. The child listing is built at `:219-229` (`childNamesByParent`), consumed at `:315-321`, and **discarded**. Surfacing it is the alternative the header at `:19-22` demands over re-enumeration.
- `src/adapters/fs/walk.ts:434-437` -- where a symlink alias is suppressed with no trace; the header already records why. The inherited fix is a `WalkResult` field reporting suppressions, per `deferred-work.md:258-261`.
- `test/architecture.test.ts:785-803` -- importer sets asserted **exactly**: `src/domain/identity.ts` ← `['src/cli/inventory.ts']`, `frontmatter.ts` ← `['src/domain/identity.ts']`; `:805-815` `src/cli/inventory.ts` ← **empty**. A new domain module and a new importer each require a deliberate edit here.
- `test/support/gate.ts:32,460-477` -- `PURE_LAYER`; any specifier not starting with `.`, or any relative one escaping `src/domain/`, is a violation, `import type` included.
- Binding wording: `prd.md:167` (FR-9), `:174` (FR-73, including BMAD's `*prd*/index.md` glob and asking a human), `ARCHITECTURE-SPINE.md:75-80` (AD-3 — the snapshot pass does **not** build a rendering representation), `:82-87` (AD-4, ambiguity recorded and presented), `:234` and `:262` (the spine puts model, ordering and **sectioning** in `src/domain/`), `EXPERIENCE.md:102` (the string-index row: `Could be a run folder or a sharded document`), `:166` (the artifact view "offers both readings").
- **Unspecified, and to be recorded rather than silently invented:** shard order (no manifest, no convention — `review-state-coverage.md:113` calls sharded documents "a requirement with no design"); whether a sharded document is one artifact view or many (`review-state-coverage.md:117`). **There is no sharded document anywhere in this repository** — `find _bmad-output -name index.md` returns nothing — so this story is verified against fixtures, and that is a stated limit rather than an oversight.
- **Anchor note.** Every `path:line` above is as of `baseline_commit` — the state the implementer starts from — and is deliberately not re-pointed afterwards, following this project's own decision that a spec records a state rather than acting as a live index (`deferred-work.md`, Story 1.1's *Suggested Review Order* pointers, closed by decision). One exception, because it misleads rather than merely shifts: the frozen matrix's `deferred-work.md:258` named the alias-suppression entry, which **this story's own diff relocated** to the *Resolved and closed* section (now around `:307`); line 258 today names the unrelated empty-importer-set entry.
- Epic boundary: paging, shard-boundary adoption and the contents rail are FR-25/26/77 and Stories 2.9–2.11 (`epics.md:243,487-513`). `review-edge-cases.md:288` warns Epic 2 presupposes detection this story owns.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/document.ts` -- new, pure: the parts-bearing model over both shapes, ordered `index.md`-first then lexical, with parts as paths and an explicit unavailable/incomplete state -- nothing models composition today and every later story would re-derive it
- [x] `src/adapters/fs/walk.ts` -- report suppressed symlink aliases on `WalkResult` -- an aliased `index.md` currently vanishes with `complete: true`, so the one signal this story turns on can disappear silently
- [x] `src/cli/inventory.ts` -- surface the child listing the pass already computes and attach the document model per entry -- re-enumerating is ruled out by this file's own header
- [x] `test/domain/document.test.ts` -- new: every I/O-matrix row, with part order pinned and the ambiguous case asserted to carry both readings
- [x] `test/adapters/walk.test.ts` -- cover alias suppression being reported, including that an aliased `index.md` no longer reads as a plain run folder
- [x] `test/cli/inventory.test.ts` -- cover the document attached per entry, and a directory whose listing a bound stopped
- [x] `test/architecture.test.ts` -- update the exact importer sets for the new domain module and its consumer, and assert the new module is pure -- an exact set is what makes each widening deliberate
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- close the alias-suppression entry; record the lexical part order as invented-not-specified, the no-index shard-set limit, and that no sharded document exists locally to measure against
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new observed total -- never lowered

**Acceptance Criteria:**
- Given a whole document and a sharded document holding equivalent content, when each is modelled, then both present the same interface and the same identity rule, differing only in their parts.
- Given a directory carrying both an `index.md` and a run-folder name, when it is modelled, then both readings are offered with the sharded one carrying its parts, and no test can observe one being chosen.
- Given an `index.md` that is a symlink to an already-reported path, when the walk runs, then the suppression is reported and the directory does not read as a plain run folder with `complete: true`.
- Given a mutation that reorders parts, drops `index.md` from first position, or resolves the ambiguity to either reading, when the suite runs, then it fails.
- Given `npm test`, when it completes, then typecheck, build and suite pass with `fail 0`, at or above the raised floor, and the purity gate passes over both domain modules.

## Spec Change Log

_Empty — no review loopback yet._

## Verification

**Commands:**
- `npm test` -- expected: exit 0, `fail 0`, total at or above the raised `DEFAULT_MIN_TESTS`.
- `node --test --test-reporter=spec test/domain/document.test.ts` -- expected: every matrix row a named passing test.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-1-8-handle-whole-and-sharded-documents-alike.md` -- expected: exit 0, no `MISS`.

## Suggested Review Order

**The model — one interface, two shapes**

- Start here: composition per reading the verdict carried, with nothing ranked or chosen.
  [`document.ts:107`](../../src/domain/document.ts#L107)
- Parts in three states, so an unlisted directory never claims a complete set.
  [`document.ts:85`](../../src/domain/document.ts#L85)
- `index.md` first, then lexical by code unit — the invented order, recorded as invented.
  [`document.ts:253`](../../src/domain/document.ts#L253)
- The markdown and index rules imported rather than re-derived, so composition cannot drift from identification.
  [`identity.ts:492`](../../src/domain/identity.ts#L492)

**Closing the alias hole, and the two ways the fix first reopened it**

- Every suppression tallied per directory — recorded or not, bounded by directories rather than by names.
  [`walk.ts:290`](../../src/adapters/fs/walk.ts#L290)
- Past the cap a listing reports itself unavailable, rather than being silently short.
  [`inventory.ts:355`](../../src/cli/inventory.ts#L355)
- Three stated conditions before a name is restored: present, a file, and nameable.
  [`inventory.ts:355`](../../src/cli/inventory.ts#L355)
- Every declined restore is recorded with its reason, so no rule is silent.
  [`inventory.ts:218`](../../src/cli/inventory.ts#L218)

**What the pass now hands on**

- The child listing surfaced instead of discarded — the alternative to a second enumeration.
  [`inventory.ts:170`](../../src/cli/inventory.ts#L170)
- Omissions filtered by the part rule, so a `node_modules` leaves parts complete.
  [`document.ts:269`](../../src/domain/document.ts#L269)

**Tests**

- Every matrix row, with verdicts built by calling `identify` rather than hand-written.
  [`document.test.ts`](../../test/domain/document.test.ts)
- The floor, raised to the observed total.
  [`run-tests.ts:38`](../../scripts/run-tests.ts#L38)
