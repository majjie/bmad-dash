---
title: 'Story 1.2 — Establish the visual foundation'
type: 'feature'
created: '2026-09-01'
status: 'done'
review_loop_iteration: 1
baseline_commit: '06b1a76'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The served page is unstyled HTML. DESIGN.md carries 53 scalar tokens and 10 component token sets that nothing reads, and its claim that *"frontmatter tokens are normative"* is prose — the first hex typed directly into a stylesheet makes the document fiction, silently.

**Approach:** Transcribe the tokens into a typed module, emit them as CSS custom properties into the served page, and add a test asserting the module matches DESIGN.md's frontmatter. Drift then fails CI instead of shipping. Same pattern as AD-1 and the count floor: enforce by test, not by convention.

## Boundaries & Constraints

**Always:** Every visual value resolves through a token — no hex, px or rem literal in any rendering code. Tonal elevation only: no shadow, gradient or blur anywhere in the system. Three type floors hold, one per class: content text at or above `body-dense` (13px), machine values at or above `mono` (12px), labels and badges at or above 11px. *(Amended 2026-09-01 by user direction — “Amend the rule”. The two-class version was unsatisfiable: it set the content floor at 13px while defining a content-carrying role at 12px, so `mono` was legal only by being miscalled a label.)* `prefers-reduced-motion` is honoured from the outset, so no later story retrofits it. A test asserts the token module against DESIGN.md's frontmatter, failing on a changed value, a missing token, a token present in DESIGN.md but absent from the module, and a whole token group DESIGN.md gained. Assertions are made in **both directions**: the negative rules (no literal escapes, no shadow, no animation outside the media block) are all satisfied by an empty stylesheet, so each must be paired with a positive one naming what the sheet does emit. Every contrast ratio DESIGN.md states in prose is recomputed from the tokens, since a hex edit would otherwise make the document false silently. Document HTML is produced in `src/render/`, not in the HTTP adapter (AD-2). Font files are **not** shipped and no font is fetched: each typography token names IBM Plex first and falls back to the platform's own faces, so the stacks transcribe verbatim and no loading mechanism is added.

**Never:** No CSS framework, no component library, no runtime dependency. No components, no global chrome, no `tile` — Story 1.3. No client-side JavaScript — Story 1.3. Do not edit DESIGN.md to match the code; it is the normative side. No light theme: dark-only, with tokens semantic so light stays a later swap. Do not touch `_bmad/`, `.claude/` or `_bmad-output/` as anything but read-only inputs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Faithful transcription | module matches DESIGN.md frontmatter | fidelity test passes | N/A |
| Value drift | a hex or size differs from DESIGN.md | test fails naming the token and both values | N/A |
| Token added upstream | DESIGN.md gains a token the module lacks | test fails naming the missing token | N/A |
| Token removed upstream | module holds a token DESIGN.md no longer has | test fails naming the stale token | N/A |
| DESIGN.md unreadable | file missing or frontmatter unparseable | test fails saying which, never passes vacuously | Loud failure |
| Reduced motion | `prefers-reduced-motion: reduce` | no animation; determinate progress in discrete steps | N/A |
| Served page | `GET /` | HTML carrying the token stylesheet; `content-type` unchanged from Story 1.1 | N/A |

</frozen-after-approval>

## Code Map

Story 1.1 is complete and committed (`06b1a76`). 154 tests, zero runtime dependencies. Its code review closed three high findings in the AD-1 gate; 21 medium/low findings are deferred and recorded.

- `_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/DESIGN.md` -- **the normative token contract**, read by the fidelity test. 24 colours, 8 typography roles, 4 motion, 5 radius, 12 spacing, 10 component token sets. Read-only; never edited to match code.
- `src/adapters/http/server.ts:99` -- `PLACEHOLDER_PAGE`, the constant this story replaces. Per AD-2 the document belongs in `src/render/`; move it rather than styling it in place.
- `test/architecture.test.ts` -- the AD-1 gate scans `src/render/` automatically; no gate change expected.
- `scripts/run-tests.ts:32` -- `DEFAULT_MIN_TESTS` is 154 and must rise with the new tests, or the floor stops meaning anything. Validation lives next door in `scripts/test-run-policy.ts`; the constant does not.

To create:

- `src/render/tokens.ts` -- the typed token module; the single source the code reads
- `src/render/stylesheet.ts` -- emits CSS custom properties and base rules from the tokens
- `src/render/page.ts` -- the document, moved out of the HTTP adapter
- `test/render/tokens.test.ts` -- fidelity against DESIGN.md
- `test/render/stylesheet.test.ts` -- emission, reduced motion, type floors

## Tasks & Acceptance

**Execution:**
- [x] `src/render/tokens.ts` -- create the typed token module transcribing every DESIGN.md token, structured so a mismatch is locatable by name -- UX-DR1
- [x] `src/render/stylesheet.ts` -- emit custom properties from the tokens plus the base rules the page needs, with a `prefers-reduced-motion` block; no literal values -- UX-DR1, UX-DR2, UX-DR4, UX-DR23
- [x] `src/render/page.ts` -- move the document out of the HTTP adapter and give it the stylesheet; the adapter serves what render produces -- AD-2
- [x] `src/adapters/http/server.ts` -- consume `src/render/page.ts` instead of holding `PLACEHOLDER_PAGE`; response headers unchanged
- [x] `test/render/tokens.test.ts` -- parse DESIGN.md's frontmatter and assert the module matches it in both directions, covering all five matrix rows including the unreadable-file case -- UX-DR24
- [x] `test/render/stylesheet.test.ts` -- assert, negatively, that no literal values escape the tokens, that no shadow, gradient or blur appears anywhere and that reduced motion suppresses animation; and assert, positively, that every required rule is present with the declarations it exists to make, that every `var()` names a property `:root` actually emits, that the rules do reference the tokens at all, and that each type role is pinned to its floor class -- *amended in loop 1; the positive half was missing*
- [x] `test/render/contrast.test.ts` -- recompute every contrast ratio DESIGN.md states, and assert the structural thresholds (4.5:1 text, 3:1 UI and focus) across the tonal ladder -- *added in loop 1* -- UX-DR1
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new total

**Acceptance Criteria:**
- Given the token module and DESIGN.md agree, when `npm test` runs, then it passes; and given any single token is changed in either file, then it fails naming that token.
- Given the page is opened in a browser, then it renders on the graphite ground with the specified type roles, and carries no colour or size literal outside the emitted custom properties.
- Given `prefers-reduced-motion: reduce`, when the page is rendered, then no animation is declared.
- Given any single base rule is deleted, or any `var()` is repointed at a property `:root` does not emit, or any type role is moved between floor classes, when `npm test` runs, then it fails. *(Added in loop 1 — all three passed the suite before it.)*

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm test` -- expected: all pass, none skipped, count floor raised
- Change one hex in `src/render/tokens.ts`, run `npm test` -- expected: failure naming that token; restore
- Change one hex in DESIGN.md, run `npm test` -- expected: failure naming that token; restore
- `npm pack --dry-run` -- expected: `dist/` and metadata only; no planning artifacts

**Manual checks:**
- Appearance and perceived performance are judged directly by the product owner, not asserted here.
- `grep` the emitted stylesheet for `box-shadow`, `gradient` and `blur` -- expected: no matches.

### Review Findings

Three reviewers, run in parallel against the diff from `06b1a76` to `ac30a50` (8 files, 1,993 lines). They converged independently on one structural hole, and it is the finding that matters: **the stylesheet was verified from the `:root` side only, never from the rules side.**

Resolved by patch, 2026-09-01:

- [x] **(high) An unresolvable `var()` was invisible.** Repointing `var(--focus-ring-width)` at `--focus-ring-thickness`, a property `:root` never emits, passed 205/205. CSS drops the whole declaration on an unresolvable `var()` and reports nothing, so the focus ring would have shipped with no width. **Fixed:** `test/render/stylesheet.test.ts` now closes every `var()` in the sheet over the emitted set, plus a companion asserting the rules reference at least 20 properties so the closure cannot pass vacuously on a sheet with no `var()` at all. Mutation now fails 3 tests.
- [x] **(high) Deleting the `:focus-visible` rule outright passed 205/205** — every focus token defined, no focus indicator drawn, keyboard focus invisible on the graphite ground, and the suite reporting the ring as "emitted". WCAG 2.4.7. **Fixed:** a `REQUIRED_RULES` table asserts each rule exists *and* declares what it exists to declare, plus a dedicated focus test that also rejects `outline: none` and a zero width. Mutation now fails 2 tests.
- [x] **(medium) Moving a type role between floor classes passed 205/205.** Reclassifying `display` from `content` to `label` was silent — the classification cannot be recovered from the sizes, which is precisely why it exists, so nothing but a written-down expectation can catch it. **Fixed:** each of the eight roles is pinned to its class by `deepEqual`. Mutation now fails 1 test.
- [x] **(medium) The fidelity gate was blind to a token group DESIGN.md *gained*.** `loadDesignTokens` reads only the six groups it is told to, so an added `elevation:` group was invisible on both sides at once while the test file's own header claimed the comparison "is deliberately symmetric." **Fixed:** a `DESIGN_METADATA_KEYS` allowlist separates header fields from token groups, and any other top-level key fails. Mutation now fails 1 test. *(First attempt asserted the frontmatter keys equalled `TOKEN_GROUPS` exactly, which was wrong — the frontmatter carries a six-field metadata header. Caught before running.)*
- [x] **(medium) Contrast was the one normative numeric rule in DESIGN.md still unenforced.** The type floors were enforced; the nine stated ratios were prose. DESIGN.md's own rule says *"Don't re-reason a colour change. Recompute the ratios."* **Fixed:** `test/render/contrast.test.ts` implements the WCAG formulas — self-checked against black-on-white at 21:1 — and asserts both halves: the structural thresholds across the whole tonal ladder, and that each ratio quoted in the prose is what the tokens compute *and* still appears in the file. All six computed claims verified correct as written (11.13/15.00, 4.54, 5.88/9.08, 8.04). Changing one hex now fails 3 tests.
- [x] **(medium) `a` differentiated links by colour alone, at 1.46:1** against body text — WCAG 1.4.1, and against DESIGN.md's own Do list. **Fixed:** the rule takes `text-decoration-line: underline` with `from-font` thickness, and a test asserts it. *(A `text-underline-offset: 0.15em` was written first and removed: DESIGN.md declares no such token, and inventing one is exactly what the token rule forbids. The dimension-literal test would have caught it.)*
- [x] **(medium) TDZ hazard: `rootBlock()` read `EMITTED`, declared 16 lines below it.** Safe only because nothing calls it before module evaluation completes; a reordering would have thrown at import, breaking server start rather than a test. **Fixed:** hoisted above its first reader.
- [x] **(low) Stale "two floors" doc comments** at `src/render/tokens.ts:168`, `:183` and `test/render/stylesheet.test.ts:15`, left by the three-floor amendment and now contradicting the rule they sit beside. **Fixed:** all three rewritten.

Deferred, recorded in `deferred-work.md`:

- [~] **DESIGN.md contradicts itself on elevation.** Its Elevation table says `{colors.surface-container}` and `{colors.surface-container-highest}` "are not used at rest in v1", but `components.core-artifact-card` uses `surface-container-highest` as its background and `surface-container` as its absent background — both at rest. Not touched here: DESIGN.md is the normative side and this is an internal contradiction in it, not code drift, so resolving it is a UX decision rather than a build patch. Story 1.3 builds the card and must not proceed on an ambiguous ladder.

## Spec Change Log

### Loop 1 — bad_spec, patched in place (user decision)

- **Trigger:** three reviewers, converging on one hole. Five mutations that should have failed passed the full 205-test suite: an unresolvable `var()`, a deleted `:focus-visible` rule, a reclassified type role, a token group added upstream, and a hex edit invalidating a stated contrast ratio.
- **Root cause was this spec, not the code.** Task 6 asked only for *negative* assertions — "no literal values escape the tokens, no shadow, gradient or blur, both type floors hold, reduced motion suppresses animation." Every one of those is satisfied by an empty stylesheet. The tests do exactly what the spec asked; the spec asked one-sidedly. The frozen fidelity clause had the same shape: it named the three ways drift could appear *within* a group and not the fourth, a new group.
- **Patched in place rather than re-derived** (user chose `[P]`). This differs from Story 1.1, where both loops were full loopbacks, and the reason is where the defect sits. There, the findings were behavioural defects in source — a dead entry point, a startup race — so re-deriving produced better code. Here the three source modules are correct: the fidelity comparison, the emission, the type floors and the reduced-motion block all do what they claim. The gap is in the tests. Reverting correct work to fix something not located in it would trade evidence for ceremony.
- **Amended:** the frozen Boundaries clause now requires assertions in both directions and names contrast recomputation and group-level drift; task 6 splits into its negative and positive halves; a new task covers `test/render/contrast.test.ts`; a third acceptance criterion states the property directly — deleting a rule, repointing a `var()`, or moving a role between classes must fail the suite.
- **Verified by re-running every mutation against the amended suite:** each now fails (2, 3, 1, 1 and 3 tests respectively), and the restored tree is green at 223. DESIGN.md was confirmed byte-identical to its pre-mutation state afterward, since two of the five mutations edited it.
- **Known-bad state avoided:** a visual foundation whose 51 tests report the token layer as enforced while the sheet could ship with no focus indicator, a widthless ring, a mislabelled type role, an untranscribed token group, and a design document whose stated contrast ratios had quietly become false.
- **KEEP — earned here, and worth surviving any later re-derivation:** the `:root`/rules split in `splitStylesheet`, which is what made the one-sidedness *visible* once someone looked for it (a single regex over the whole sheet could only ever have asserted the weaker half); component tokens transcribed with `{group.key}` references **unresolved**, so the fidelity test compares documents rather than understanding indirection; the contrast formula's self-check against black-on-white, so a wrong formula cannot make every ratio agreeably wrong in the same direction; the non-vacuity companions on the closure and count tests; and `customPropertyName` throwing for an unnameable path rather than guessing a prefix.

## Suggested Review Order

**The contract, and the one place values are repeated**

- Start here: DESIGN.md's frontmatter transcribed verbatim; nothing else in the tree holds a hex.
  [`tokens.ts:1`](../../src/render/tokens.ts#L1)

- The classification that cannot be derived from the sizes — hence written down, hence pinned by test.
  [`tokens.ts:189`](../../src/render/tokens.ts#L189)

- Group names are load-bearing: the fidelity test keys off exactly these six.
  [`tokens.ts:400`](../../src/render/tokens.ts#L400)

- One flattener over both sides, so a mismatch can only be real data drift.
  [`tokens.ts:425`](../../src/render/tokens.ts#L425)

**Emission — tokens to CSS**

- References resolve to `var()`, not to literals, so the indirection survives into the sheet.
  [`stylesheet.ts:140`](../../src/render/stylesheet.ts#L140)

- Hoisted above `rootBlock()` this loop: it was read 16 lines before its declaration.
  [`stylesheet.ts:167`](../../src/render/stylesheet.ts#L167)

- The `:root`/rules split — what made the one-sided verification visible at all.
  [`stylesheet.ts:321`](../../src/render/stylesheet.ts#L321)

- The exemption list for the two prose-valued tokens, on the record rather than filtered by shape.
  [`stylesheet.ts:42`](../../src/render/stylesheet.ts#L42)

**The rules the page actually draws**

- Every base rule; each value a `var()` or a unitless `0`, which is what the literal test enforces.
  [`stylesheet.ts:233`](../../src/render/stylesheet.ts#L233)

- Underlined, not merely coloured: `primary` on `on-surface` is 1.46:1.
  [`stylesheet.ts:256`](../../src/render/stylesheet.ts#L256)

- The rule a reviewer deleted whole while 205 tests stayed green.
  [`stylesheet.ts:266`](../../src/render/stylesheet.ts#L266)

- The sheet reaches the page inlined, with a guard refusing a `<`.
  [`page.ts:44`](../../src/render/page.ts#L44)

**The half that was missing — positive assertions**

- Why this section exists: five mutations that passed the whole suite.
  [`stylesheet.test.ts:356`](../../test/render/stylesheet.test.ts#L356)

- Closes every `var()` over the emitted set; an unresolvable one drops its declaration silently.
  [`stylesheet.test.ts:380`](../../test/render/stylesheet.test.ts#L380)

- The companion that stops the closure passing vacuously on a sheet with no `var()`.
  [`stylesheet.test.ts:390`](../../test/render/stylesheet.test.ts#L390)

- Each required rule must exist *and* declare what it exists to declare.
  [`stylesheet.test.ts:407`](../../test/render/stylesheet.test.ts#L407)

- Rejects `outline: none` and a zero width — the two ways to define a ring and draw nothing.
  [`stylesheet.test.ts:434`](../../test/render/stylesheet.test.ts#L434)

- Spelled out, not derived: only a written expectation can catch a reclassification.
  [`stylesheet.test.ts:469`](../../test/render/stylesheet.test.ts#L469)

**Contrast, moved from prose into the suite**

- Self-check first: a wrong formula would make every ratio below agreeably wrong.
  [`contrast.test.ts:90`](../../test/render/contrast.test.ts#L90)

- The formulas, applied to the frontmatter hexes exactly as the Conformance record claims.
  [`contrast.test.ts:53`](../../test/render/contrast.test.ts#L53)

- The faint role's 0.04 of margin, asserted as deliberate rather than discovered later.
  [`contrast.test.ts:117`](../../test/render/contrast.test.ts#L117)

- Each ratio quoted in DESIGN.md recomputed from the tokens and checked to still appear there.
  [`contrast.test.ts:185`](../../test/render/contrast.test.ts#L185)

- The reverse direction: DESIGN.md may state no ratio this file does not recompute.
  [`contrast.test.ts:223`](../../test/render/contrast.test.ts#L223)

**Peripherals**

- Header metadata separated from token groups, so a *new group* upstream now fails.
  [`tokens.test.ts:178`](../../test/render/tokens.test.ts#L178)

- The count floor, raised with the suite or it stops meaning anything.
  [`run-tests.ts:32`](../../scripts/run-tests.ts#L32)
