---
title: 'Story 1.7 — Identify what each artifact is'
type: 'feature'
created: '2026-09-02'
status: 'done'
baseline_commit: '031182dec3764305ad274d52d57d8868cfca185f'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing decides what an artifact *is*. BMAD names vary legitimately (`prd.md`, `bmm-prd.md`, `product-requirements.md`), so a tool that keys off filenames fails on the first project it has never seen. Stories 1.8–1.12 and all of Epic 3 consume an identity verdict that does not exist yet.

**Approach:** One pure domain module applies FR-8's four-level precedence in order and stops at the first level that resolves, recording *which* level resolved it and which were attempted. A thin pass composes it with the Story 1.6a walk and the confined reader. Every other unit consumes the recorded verdict and never re-derives identity.

## Boundaries & Constraints

**Always:** The verdict records the level that resolved it and the ordered list of levels attempted — FR-69 requires naming the levels tried, and confidence below certain must be derivable rather than inferred. **Level 4 (filename) resolves, but never at certain confidence** — user decision, reconciling FR-8's "stops at the first that resolves" with its "filename alone is never sufficient". An ambiguous verdict is recorded as ambiguous and never resolved silently (AD-4). Identity is decided in exactly one domain module; no other unit re-derives it.

**Ask First:** Adding any third-party dependency. Level 2 needs none: every field it reads is a top-level flat scalar in every artifact measured, so a minimal frontmatter reader covers it, and bundling `yaml` would fire NFR-11's deferred gate and grow the bundle ~34KB→264KB for capability level 2 does not use.

**Never:** Do not read `_bmad/bmm/config.yaml` or any `customize.toml` at runtime — that is FR-10, deferred indefinitely, and a skill's `customize.toml` is the *shipped* default rather than project configuration. Do not introduce a fifth signal state: AD-8's four are about signal availability, and an identity verdict is AD-7's separate vocabulary. Do not import anything into `src/domain/` — the purity gate forbids all outgoing specifiers **including `import type`** (verified against the gate's own regex, which has no `type` awareness). Do not put the skip policy in the walk; it is this story's to supply.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Level 1 resolves | file under a known artifact path (e.g. `_bmad-output/planning-artifacts/prds/…`) | identified, `resolvedAt: 'location'`, certain | N/A |
| Level 2 resolves | unconventional filename, frontmatter declares `title`/`type` | identified from frontmatter, `resolvedAt: 'frontmatter'`; location did not resolve and is recorded as attempted | N/A |
| Level 3 resolves | no frontmatter, structure characteristic of the family | identified, `resolvedAt: 'structure'` | N/A |
| Level 4 resolves | conventional name only, nothing else | identified, `resolvedAt: 'filename'`, **confidence below certain** | never certain on a name alone |
| Nothing resolves | a file no level recognizes | `unidentified`, naming all four levels attempted in order | not omitted, not guessed |
| Run folders | one directory of each of the seven families | each recognized as its family | the two dateless patterns resolve too |
| Ambiguous | a directory that is either a run folder or a sharded document | recorded `ambiguous`, both readings named | never resolved silently |
| Unreadable input | frontmatter unreadable, or the walk entry is not `present` | levels that need content are recorded attempted-and-unavailable; identification continues to the next | never throws, never claims a level ran |

</frozen-after-approval>

## Code Map

- **`src/domain/` does not exist — this story creates it, and it is the frozen pure layer.** `test/support/gate.ts:32` `PURE_LAYER`; the check at `gate.ts:460-477` fails **any** specifier not starting with `.` (bare packages *and* `node:`) and any relative specifier resolving outside `src/domain/`. `SPECIFIER_PATTERN` (`gate.ts:70`) has no `type` awareness, so `import type { CanonicalPath }` fails the gate — measured, not assumed. The domain declares its own path type or takes `string`; the spine fixes the direction at `ARCHITECTURE-SPINE.md:28-29,61` (ports may depend on domain, never the reverse).
- `src/adapters/fs/walk.ts:142-163` -- `WalkEntry`: `relative`, `depth`, `state`, and on the `present` arm only, `path` and `kind`. **There is no `name` field** — level 4 derives the basename from `relative` (composed at `:218-220`). No mtime, size or content. `walk()` at `:262` takes the reader as its first argument, so the pass holds the reader and calls `readText` (`read.ts:500`) itself. `WalkOptions.exclude` (`:107`) is where this story's skip policy goes.
- `test/architecture.test.ts:755-764` -- the walk's importer set is asserted **empty**; this story must edit it to name the pass. `deferred-work.md:198` says landing 1.7 without importing the walk "is a finding about 1.7".
- **Measured, not specified — record both as such. CORRECTED in iteration 1.** `_bmad/bmm/config.yaml:7-8` declares **two** peer output roots, `planning_artifacts` *and* `implementation_artifacts`; the first draft of this Code Map listed only the first, and the seven run-folder families do not cover what lives under the second. Level 1 must recognize: `planning-artifacts/{prds,architecture,ux-designs,briefs,research}`; `specs` and `forge`, which sit **directly under `_bmad-output`, not under planning-artifacts**; and `implementation-artifacts`. The family vocabulary is correspondingly wider than FR-11's seven run-folder families — FR-11 constrains *run folders*, not the artifact universe — and must name what a BMAD tree actually holds there: epics, stories/specs, sprint tracking, and context/notes documents. Run-folder patterns: `brief-|prd-|architecture-|ux-{project}-{date}` (the four that repeat within a day), `{research_type}-{topic}-{date}`, and the two dateless `spec-{slug}` and `{slug}`. Sources: `_bmad/bmm/config.yaml:7-8` and per-skill `customize.toml`; the family→pattern mapping for the dateless pair is stated nowhere and was measured.
- Binding wording: `prd.md:163` (FR-8), `:164` (FR-69, "confidence is displayed where it is below certain"), `:170-172` (FR-11/71/72), `ARCHITECTURE-SPINE.md:82-86` (AD-4, incl. the ambiguous rule), `:102-106` (AD-7 — an artifact that cannot be identified yields a typed value recording what failed and at which stage), `:108-112` (AD-8's four states, scoped to *signals*), `EXPERIENCE.md:92` (the copy: `Not identified. Tried: config path, frontmatter, structure, filename.`).
- Frontmatter shapes actually on disk: top-level flat scalars universally; also block and inline sequences, nested maps up to four levels (`DESIGN.md:135-155`), and a doubled-quote escape inside single quotes (`ARCHITECTURE-SPINE.md:7`). A reader that takes zero-indent `key: value` and skips indented lines is correct for every field level 2 needs.
- **Known unreconciled, out of scope:** `EXPERIENCE.md:170` calls an unidentified artifact "present-but-uninterpreted", which is FR-12's term and Story 1.9's. The epics split them; the UX doc merges them. Keep the vocabularies separate here and record the collision.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/identity.ts` -- new, pure: the verdict type, the four-level precedence applied in order, the measured default locations and the seven run-folder patterns -- AD-4 requires exactly one authority and the purity gate forbids it importing anything
- [x] `src/domain/frontmatter.ts` -- new, pure: read top-level scalars from a frontmatter block, handling the doubled-quote escape and skipping nested lines -- level 2 needs no YAML library and must not acquire one
- [x] `src/cli/inventory.ts` -- new: the pass — walk with this story's exclude policy, read text where a level needs it, call the authority once per entry -- composition belongs where AD-9 already puts resolution
- [x] `test/domain/identity.test.ts` -- new: every I/O-matrix row, each level pinned as the one that resolved, and level 4 never certain
- [x] `test/domain/frontmatter.test.ts` -- new: the shapes measured on disk, including the doubled-quote escape and a nested block that must be skipped rather than misread
- [x] `test/cli/inventory.test.ts` -- new: the pass over a fixture project, including an entry the walk reported not-`present`
- [x] `test/architecture.test.ts` -- assert the new domain layer is pure and reached by the gate, and update the walk's importer set to name its first consumer -- an empty set was the placeholder this story retires
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- close the walk's empty-importer entry; record the FR-8 level-4 reconciliation, the measured-not-specified roots and patterns, and the `present-but-uninterpreted` collision -- three decisions that will otherwise be re-litigated
- [x] `src/domain/identity.ts` -- iteration 1: add `implementation-artifacts` as a level-1 root and widen the family vocabulary to what a BMAD tree holds there — epics, stories/specs, sprint tracking, context/notes -- FR-11's seven constrain run folders, not the artifact universe, and a third of a real tree had no family to resolve to
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new observed total -- never lowered

**Acceptance Criteria:**
- Given one artifact per precedence level, when identification runs, then each is identified by the expected level, the verdict names which level resolved it, and only the level-4 verdict is below certain.
- Given a directory of each of the seven run-folder families, when identification runs, then all seven are recognized, including the two patterns that carry no date.
- Given an artifact no level resolves, when identification runs, then the verdict is `unidentified` and names all four levels attempted in FR-8 order.
- Given a mutation that reorders the precedence or lets level 4 return certain confidence, when the suite runs, then it fails.
- Given `npm test`, when it completes, then typecheck, build and suite pass with `fail 0`, at or above the raised floor, and the domain purity gate passes over the new `src/domain/`.

## Spec Change Log

- **Iteration 1 (2026-09-02) — bad_spec, resolved by amend-and-extend rather than revert, by user decision.**
  - *Triggering finding:* the Code Map listed seven artifact roots and omitted `implementation-artifacts`, though `_bmad/bmm/config.yaml:7-8` declares it a peer of `planning_artifacts`. The implementation was faithful to the Code Map. Measured consequence: every `spec-1-*.md`, `epic-1-context.md`, `deferred-work.md` and `sprint-status.yaml` in this project's own tree returned `location: no-signal`, several fully `unidentified` — about a third of a real output tree — and the family vocabulary, closed at FR-11's seven *run-folder* families, gave them nothing to be identified as.
  - *Amended:* the Code Map now names all three root groups and states that FR-11's seven constrain run folders rather than the artifact universe. The family set widens to cover epics, stories/specs, sprint tracking and context/notes.
  - *Known-bad state avoided:* Story 1.12 shipping an inventory in which a third of the rows read "Not identified" — on a tool whose subject is BMAD projects, including its own.
  - *KEEP — must survive any re-derivation:* the level-4-resolves-but-never-certain rule and its two-value `Confidence`. `Attempt`'s three-way result, where `unavailable` distinguishes a level that could not run from one that ran and found nothing. Ambiguity carrying every reading with no silent tiebreak. `src/domain/` importing nothing outside itself and speaking `string` paths. Level 3's markdown-only exact-stem restriction, which corrected a measured false positive (`_bmad-output` identifying as a spec because it *contains* a directory named `specs`) — the correction must stay and must gain the test it never had. No YAML library.

## Verification

**Commands:**
- `npm test` -- expected: exit 0, `fail 0`, total at or above the raised `DEFAULT_MIN_TESTS`.
- `node --test --test-reporter=spec test/domain/identity.test.ts` -- expected: every matrix row a named passing test.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-1-7-identify-what-each-artifact-is.md` -- expected: exit 0, no `MISS`.

## Suggested Review Order

**The authority — one module, four levels, in order**

- Start here: the precedence applied in order, stopping at the first level that resolves.
  [`identity.ts:554`](../../src/domain/identity.ts#L554)
- The verdict: identified, ambiguous, or unidentified — ambiguity's confidence narrowed to a literal.
  [`identity.ts:204`](../../src/domain/identity.ts#L204)
- `unavailable` is why a level that could not run is never recorded as having run and found nothing.
  [`identity.ts:178`](../../src/domain/identity.ts#L178)
- Level 4 resolves but never certainly — FR-8's two clauses reconciled.
  [`identity.ts:140`](../../src/domain/identity.ts#L140)

**Level 1's roots, and why there are two kinds**

- Seven single-family roots, `specs` and `forge` outside planning-artifacts.
  [`identity.ts:287`](../../src/domain/identity.ts#L287)
- The implementation root holds several families and is total over itself, so nothing falls through four levels.
  [`identity.ts:315`](../../src/domain/identity.ts#L315)
- Layout containers, excluded from structural reads — the false-positive class that made `_bmad-output` a spec.
  [`identity.ts:356`](../../src/domain/identity.ts#L356)
- FR-11's seven, still exactly seven, kept separate from the wider family set.
  [`identity.ts:103`](../../src/domain/identity.ts#L103)

**Reading frontmatter without a YAML library**

- Flat top-level scalars only; everything else declines rather than guesses.
  [`frontmatter.ts:113`](../../src/domain/frontmatter.ts#L113)
- An unknown escape declines — it used to stand for its own letter, turning `"café"` into `cafu00e9`.
  [`frontmatter.ts:157`](../../src/domain/frontmatter.ts#L157)

**The pass, which decides nothing**

- Walk, read lazily, ask the authority once per entry.
  [`inventory.ts:291`](../../src/cli/inventory.ts#L291)
- Availability derived from whether a directory was finished, not from a truncation lookup.
  [`inventory.ts:386`](../../src/cli/inventory.ts#L386)
- The skip policy, and the cap that keeps its own record bounded.
  [`inventory.ts:184`](../../src/cli/inventory.ts#L184)
- The budget, with the real multiples stated — 78× on entries, 2.4× on depth.
  [`inventory.ts:115`](../../src/cli/inventory.ts#L115)

**The two tests that would have caught the spec's own defect**

- Every artifact in this repository resolves to a family — the end-to-end guard.
  [`inventory.test.ts:372`](../../test/cli/inventory.test.ts#L372)
- The level labels are read out of EXPERIENCE.md rather than held as a second copy.
  [`identity.test.ts:577`](../../test/domain/identity.test.ts#L577)
- The floor, raised to the observed total.
  [`run-tests.ts:38`](../../scripts/run-tests.ts#L38)
