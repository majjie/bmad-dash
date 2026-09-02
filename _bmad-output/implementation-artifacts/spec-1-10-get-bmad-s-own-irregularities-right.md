---
title: "Story 1.10 — Get BMAD's own irregularities right"
type: 'feature'
created: '2026-09-02'
status: 'done'
baseline_commit: '929cd4d814f215e4aea58eb500770e4471f190e8'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** BMAD's own naming is irregular in four ways the tool currently gets wrong or cannot express. Measured on this build: `review-design.md` is identified as family **`ux-design`** — the reviewer's lens slug read as the artifact's family, which is FR-49's prohibition in its exact words — and `spec-ux-tokens` gains a spurious second family the same way. A review is indistinguishable from the artifact it reviews, because there is no `review` family. And nothing records that a run folder's name may cover more than one run, or that two families carry no date at all.

**Approach:** One rule underlies FR-49 and FR-50 together: in `review-{slug}.md`, `reconcile-{slug}.md` and `spec-{slug}`, **the prefix names the kind and the slug names something else** — a lens, a source input, a subject. So read the position and never the slug. Then record, beside the verdict, the two facts a run-folder name cannot carry: whether its pattern can collide within a day, and whether it offers a date signal at all.

## Boundaries & Constraints

**Always:** A slug is never a family signal and never a key — position and prefix are the only name signals. `review` becomes a family, because a review is a different artifact from the thing it reviews. Run-folder facts are **derived from the recorded verdict**, never a second identification (AD-4). Every run folder records whether its pattern can collide and whether that reuse is *deliberate* (BMAD offers to resume) or *accidental*; and the two dateless families record the **absence** of a date signal, so Epic 3's FR-14 tier 5 reads absent rather than zero.

**Ask First:** A third `Confidence` value — `deferred-work.md` records that the two are deliberate and a third arrives with the surface that renders it. Widening `RESEARCH_TYPES` beyond the six measured. Wiring the pass into the served page (Story 1.12's).

**Never:** Do not claim a run count, or present a folder as one run — the signal to tell one run from two **does not exist**: `memlog.py`'s `init` errors on a second run so both append to one log, frontmatter dates are day-resolution and overwritten in place, no file is numbered, and mtime is FR-14's own "actively misleading" last resort. Do not approximate it from mtimes. Do not re-derive family, shape or parts. Do not invent copy for the collision state — `EXPERIENCE.md` has no row for it; record the gap as Story 1.9 did for FR-12.

**Stated limit, accepted deliberately:** this story's acceptance says "a folder containing two same-day runs of one family reports both". **That is undeliverable and is not delivered.** No fixture can be built that a reader could distinguish from a single run. What ships is FR-71's negative clause — nothing assumes one folder is one run — plus the disclosure that a collision is possible. Detecting an actual second run needs git and is Epic 3's.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reviewer slug | `review-design.md` outside any root | family **`review`** from the prefix; `design` contributes nothing | the measured FR-49 defect, fixed |
| Reconcile slug | `reconcile-prd.md` | the slug names a source input and contributes no family | never read as a `prd` |
| Spec subject slug | `spec-ux-tokens` | the `spec-` prefix resolves the family; the slug adds no second one | no spurious ambiguity |
| Review, workspace root | `…/prd-x-2026-08-28/review-rubric.md` | found, family `review` | FR-50, shape A |
| Review, `reviews/` subfolder | `…/architecture-x-2026-08-28/reviews/review-rubric.md` | found, family `review`, at any depth | FR-50, shape B |
| Dated run folder | `prd-bmad-2026-08-28` | run facts: can collide within a day, reuse **accidental**, date signal present | no run count claimed |
| Deliberate reuse | `spec-bmad-dash`, a forge `{slug}`, or a research folder | run facts: can collide, reuse **deliberate** | distinguished from accidental |
| Dateless family | `spec-{slug}` and the bare `{slug}` | date signal **absent**, not zero | Epic 3 tier 5 reads absent |
| Custom research type | a dated folder whose prefix is not one of the six measured | no pattern match; identified by location if it sits under the research root | the recorded fragility |

</frozen-after-approval>

## Code Map

- **The measured defect.** `src/domain/identity.ts` — `directoryNameFamilies` runs `runFolderFamilies` **and then** hint-matches the whole folder name with no short-circuit; `fileNameFamilies` hint-matches the whole file stem; `matchesHint` matches on `-hint-` boundaries. Reproduce: `review-design.md` → family `ux-design`; `spec-ux-tokens` → ambiguous `[ux-design, spec]`. Bounded because level 1 pre-empts level 4 under any artifact root, so only artifacts outside every root are affected today — which is exactly what a project using its own layout looks like.
- `src/domain/identity.ts` -- `Family` has no `review` member; `RUN_FOLDER_PATTERNS` holds 11 rows for 7 families (4 dated `{project_name}` prefixes, 6 dated research prefixes spread from `RESEARCH_TYPES`, 1 dateless `spec-`) and **no row for forge**, because a bare `{slug}` matches every directory; `runFolderFamilies` requires prefix, length and (when dated) `TRAILING_DATE`. `locationSignal` resolves by prefix containment at any depth — which is why FR-50's *locate* clause already holds without a rule.
- `src/domain/interpretation.ts` -- the pattern to copy for a module that consumes the recorded verdict and adds a derived fact without re-deciding it.
- `src/cli/inventory.ts` -- keys everything by project-relative path, never by slug, so FR-49's identity half already holds structurally. The pass is where run facts attach.
- `test/domain/identity.test.ts` -- a `reviews/` directory is already pinned to `shape: 'unknown'`; `runFolderFamilies('read-only-dashboard')` is pinned empty; the four dated families are pinned `dated`. **The test asserting "all four same-day-repeating families are dated patterns" commits to the 4-of-7 reading in its name** and must change with the claim.
- Binding wording: `prd.md:178` (FR-49, which names **three** slug positions — `review-{slug}.md`, `reconcile-{slug}.md`, and a reused `spec-{slug}` run folder; the fourth, `{research_type}-{topic}-{date}`, comes from `bmad-source-shapes.md`, not from FR-49), `:179` (FR-50), `:172` (FR-71), `:173` (FR-72), `:140-146` (FR-14's six tiers — run-folder date is **tier 5**), `:326` (the PRD's own record that same-day reruns lose iterations), `epics.md:198,265` (FR-14 and the ordering hierarchy are **Epic 3, Story 3.4**), `ARCHITECTURE-SPINE.md:82-87` (AD-4).
- **Measured against BMAD v6.11.0, specified nowhere.** The seven run-folder patterns come from each skill's `customize.toml` `run_folder_pattern`; `bmad-deep-recon` supplies the six research packs and documents user-added custom types, so `RESEARCH_TYPES` is open in BMAD and closed here. `deferred-work.md` records this, with a trigger that fires on FR-10 — deferred indefinitely — so this story adopts it deliberately rather than waiting.
- **The collision surface is 7 of 7, not 4 of 7.** Three families reuse deliberately (BMAD offers to resume: spec by slug, forge by slug, research by topic) and four accidentally. The accidental four are the dangerous case: their resume offer is conditional on `status != final`, so a same-day re-create over a finalized document overwrites with no prompt. FR-71's literal wording is true — those four have both name components constant within a day — but it understates the surface.
- **Correction to this spec's own frozen text (2026-09-02).** The **Never** clause says `EXPERIENCE.md` "has no row for it" for the collision state. That is wrong, and I asserted it without re-reading the document: `EXPERIENCE.md:90` carries `| Run folder may hold several runs | This folder may contain more than one run. |`, with the edge condition at `:174`. What is genuinely missing is copy for **deliberate-versus-accidental reuse** and for an **absent date signal** — record that gap, not the row's absence. The frozen text stands as written; this is the correction beside it.
- **Unowned by any normative document,** and decided here by the human: whether a review is its own family. The closed-enumeration proposal in `review-adversarial-seams.md` was written and never adopted into the spine.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/identity.ts` -- read the prefix and the position, never the slug: stop hint-matching the slug portion of a matched run-folder or `{kind}-{slug}` name, and add `review` as a family recognized by its prefix -- FR-49's prohibition is currently violated in its own words, and FR-50 has no observable effect without a family to resolve to
- [x] `src/domain/runs.ts` -- new, pure: run-folder facts derived from the recorded verdict — whether the pattern can collide within a day, whether that reuse is deliberate or accidental, and whether a date signal is present or absent -- the two things a run-folder name cannot carry, and neither has anywhere to live today
- [x] `src/cli/inventory.ts` -- attach run facts per entry, deriving them from the verdict rather than re-identifying -- AD-4 puts identification in one place
- [x] `test/domain/identity.test.ts` -- cover every slug position from the matrix, and rename the four-family assertion to the claim it actually makes
- [x] `test/domain/runs.test.ts` -- new: collision risk, deliberate versus accidental reuse, and date-signal absence, each pinned from both sides
- [x] `test/cli/inventory.test.ts` -- assert over this repository's own tree: both review shapes resolve to `review`, and every run folder here reports its collision risk and date signal
- [x] `test/architecture.test.ts` -- exact importer sets for the new domain module, and the purity gate over it
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- record that FR-71's "reports both" is undeliverable without git, with Epic 3 as its trigger; the `RESEARCH_TYPES` fragility; the 7-of-7 framing against FR-71's 4-of-7 wording; the missing `EXPERIENCE.md` row for the collision state; and that this story adopted the measured-not-specified pattern tables deliberately
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new observed total -- never lowered

**Acceptance Criteria:**
- Given `review-design.md`, `reconcile-prd.md` and `spec-ux-tokens`, when each is identified, then no slug contributes a family, and the review resolves to family `review`.
- Given both review shapes in this repository — six at a workspace root and three under a `reviews/` subfolder — when the inventory is taken, then all nine resolve to family `review` with no assumed path.
- Given every run folder in this repository, when the inventory is taken, then each reports whether its pattern can collide and whether reuse is deliberate, and the two dateless families report their date signal absent.
- Given a mutation that reads a slug as a family, claims a run count, or reports a dateless family's date signal as present, when the suite runs, then it fails.
- Given `npm test`, when it completes, then typecheck, build and suite pass with `fail 0`, at or above the raised floor, and the purity gate passes over every domain module.

## Spec Change Log

_Empty — no review loopback yet._

## Verification

**Commands:**
- `npm test` -- expected: exit 0, `fail 0`, total at or above the raised `DEFAULT_MIN_TESTS`.
- `node --test --test-reporter=spec test/domain/runs.test.ts` -- expected: every matrix row a named passing test.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-1-10-get-bmad-s-own-irregularities-right.md` -- expected: exit 0, no `MISS`.

## Suggested Review Order

**One rule: the prefix names the kind, the slug names something else**

- Start here: the kind prefixes, and which of them describe *another* artifact.
  [`identity.ts:398`](../../src/domain/identity.ts#L398)
- The filter that makes the rule hold at every level, not just the two it first reached.
  [`identity.ts:993`](../../src/domain/identity.ts#L993)
- A workspace rule may recognize a kind and still decline to name it — the one exception to level 1's totality.
  [`identity.ts:398`](../../src/domain/identity.ts#L398)
- `review` is a family but never a run folder, so the run-folder union is narrower than the family one.
  [`identity.ts:109`](../../src/domain/identity.ts#L109)

**The two facts a run-folder name cannot carry**

- Per family: can it collide, is the reuse deliberate, is there a date signal at all.
  [`runs.ts:190`](../../src/domain/runs.ts#L190)
- `canCollide` is the literal `true` — 7 of 7, and a flip is a compile error rather than a test failure.
  [`runs.ts:164`](../../src/domain/runs.ts#L164)
- The four per-run signals that do not exist, enumerated so the refusal is checkable.
  [`runs.ts:99`](../../src/domain/runs.ts#L99)
- Derived from the recorded verdict, including an ambiguous one — the folders least well understood keep the disclosure.
  [`runs.ts:331`](../../src/domain/runs.ts#L331)

**The pass**

- Run facts attached beside the verdict, never re-identified.
  [`inventory.ts:248`](../../src/cli/inventory.ts#L248)

**Tests**

- Every slug position, both review shapes, and the datedness claim renamed to what it asserts.
  [`identity.test.ts`](../../test/domain/identity.test.ts)
- `dated` and `dateSignal` cross-checked, with forge's missing row as the stated exception.
  [`runs.test.ts`](../../test/domain/runs.test.ts)
- The floor, raised to the observed total.
  [`run-tests.ts:38`](../../scripts/run-tests.ts#L38)
