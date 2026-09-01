---
title: 'Story 1.2 — Establish the visual foundation'
type: 'feature'
created: '2026-09-01'
status: 'ready-for-dev'
review_loop_iteration: 0
baseline_commit: '0ddf4dd2635ccc9c4cd661870625e2a3affa7483'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The served page is unstyled HTML. DESIGN.md carries 53 scalar tokens and 10 component token sets that nothing reads, and its claim that *"frontmatter tokens are normative"* is prose — the first hex typed directly into a stylesheet makes the document fiction, silently.

**Approach:** Transcribe the tokens into a typed module, emit them as CSS custom properties into the served page, and add a test asserting the module matches DESIGN.md's frontmatter. Drift then fails CI instead of shipping. Same pattern as AD-1 and the count floor: enforce by test, not by convention.

## Boundaries & Constraints

**Always:** Every visual value resolves through a token — no hex, px or rem literal in any rendering code. Tonal elevation only: no shadow, gradient or blur anywhere in the system. Two type floors hold: content text at or above `body-dense`, labels and badges at or above 11px. `prefers-reduced-motion` is honoured from the outset, so no later story retrofits it. A test asserts the token module against DESIGN.md's frontmatter, failing on a changed value, a missing token, and a token present in DESIGN.md but absent from the module. Document HTML is produced in `src/render/`, not in the HTTP adapter (AD-2). Font files are **not** shipped and no font is fetched: each typography token names IBM Plex first and falls back to the platform's own faces, so the stacks transcribe verbatim and no loading mechanism is added.

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

Story 1.1 is complete and committed (`c10c3d9`). 114 tests, zero runtime dependencies.

- `_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/DESIGN.md` -- **the normative token contract**, read by the fidelity test. 24 colours, 8 typography roles, 4 motion, 5 radius, 12 spacing, 10 component token sets. Read-only; never edited to match code.
- `src/adapters/http/server.ts:99` -- `PLACEHOLDER_PAGE`, the constant this story replaces. Per AD-2 the document belongs in `src/render/`; move it rather than styling it in place.
- `test/architecture.test.ts` -- the AD-1 gate scans `src/render/` automatically; no gate change expected.
- `scripts/run-tests.ts:32` -- `DEFAULT_MIN_TESTS` is 114 and must rise with the new tests, or the floor stops meaning anything. Validation lives next door in `scripts/test-run-policy.ts`; the constant does not.

To create:

- `src/render/tokens.ts` -- the typed token module; the single source the code reads
- `src/render/stylesheet.ts` -- emits CSS custom properties and base rules from the tokens
- `src/render/page.ts` -- the document, moved out of the HTTP adapter
- `test/render/tokens.test.ts` -- fidelity against DESIGN.md
- `test/render/stylesheet.test.ts` -- emission, reduced motion, type floors

## Tasks & Acceptance

**Execution:**
- [ ] `src/render/tokens.ts` -- create the typed token module transcribing every DESIGN.md token, structured so a mismatch is locatable by name -- UX-DR1
- [ ] `src/render/stylesheet.ts` -- emit custom properties from the tokens plus the base rules the page needs, with a `prefers-reduced-motion` block; no literal values -- UX-DR1, UX-DR2, UX-DR4, UX-DR23
- [ ] `src/render/page.ts` -- move the document out of the HTTP adapter and give it the stylesheet; the adapter serves what render produces -- AD-2
- [ ] `src/adapters/http/server.ts` -- consume `src/render/page.ts` instead of holding `PLACEHOLDER_PAGE`; response headers unchanged
- [ ] `test/render/tokens.test.ts` -- parse DESIGN.md's frontmatter and assert the module matches it in both directions, covering all five matrix rows including the unreadable-file case -- UX-DR24
- [ ] `test/render/stylesheet.test.ts` -- assert no literal values escape the tokens, that no shadow, gradient or blur appears anywhere, that both type floors hold, and that reduced motion suppresses animation
- [ ] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new total

**Acceptance Criteria:**
- Given the token module and DESIGN.md agree, when `npm test` runs, then it passes; and given any single token is changed in either file, then it fails naming that token.
- Given the page is opened in a browser, then it renders on the graphite ground with the specified type roles, and carries no colour or size literal outside the emitted custom properties.
- Given `prefers-reduced-motion: reduce`, when the page is rendered, then no animation is declared.

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
