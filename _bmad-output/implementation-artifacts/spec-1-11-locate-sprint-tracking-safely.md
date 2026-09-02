---
title: 'Story 1.11 — Locate sprint tracking safely'
type: 'feature'
created: '2026-09-02'
status: 'done'
baseline_commit: 'b32f1b19b8e05078be1be2f5678a4476b67f763f'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `story_location` is never read — measured, `grep -rn "story_location" src/` is empty — so FR-51 is unmet and the `/etc` case FR-74 names is not merely unhandled but unreachable. Handed naively to the existing surfaces it **throws**: `ConfinedReader` treats confinement as the one refusal that still throws, by design. And AD-10's other half does not exist at all: `grep -rni "sanitiz" src/` returns nothing, though the spine's own structural seed says "sanitization and confinement live here". Absence has no record either — a missing `sprint-status.yaml` simply produces no entry, and nothing states it was looked for.

**Approach:** Read the one scalar this story needs without a YAML library, by giving the existing reader an unfenced entry point. Resolve the value and report its outcome as a **first-class location state on its own axis** — not a fifth signal state, because AD-8's four are per-signal and stay four. Add the segment sanitizer AD-10 requires, for the filesystem surface that has a caller today. Nothing outside the one permitted root is ever read.

## Boundaries & Constraints

**Always:** An out-of-tree location is **resolved, reported, and never read** — a typed value, never a throw, and never a read attempt to discover the answer. Absence of `sprint-status.yaml` is a normal shape with its own state, distinct from out-of-tree and from present. The location vocabulary is closed and lives beside the existing state vocabularies rather than restating them. AD-13's shape applies to this reader too: having found the file, "no `story_location` key" is a distinct answer from "the key says nothing", and neither is an empty success. Every content-derived path **segment** passes the sanitizer before use, and the resolved whole path is still confinement-checked — the two are different checks and both run.

**Ask First:** Adding a fifth `SignalState` — AD-8 pins exactly four and a test reads that sentence out of the spine. Widening the permitted root to a set: AD-9 was narrowed to one on 2026-09-02 and a second root is now a spine edit. Any third-party dependency.

**Never:** Do not read anything outside the one permitted root, including to check whether it exists. Do not turn `frontmatter.ts` into a YAML parser — an unfenced entry point over zero-indent scalars is the whole of the change; nested maps stay skipped and valueless keys stay declined. Do not build the URL half of the sanitizer — there is no URL surface until Story 2.1, and shipping it now is the unconsumed-surface shape this project has been caught with repeatedly. Do not read the status vocabularies in the file's comments; those are Story 2.8's, with NFR-6 and AD-13 assigned there.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| The real value | `story_location: _bmad-output/implementation-artifacts` | resolved in-tree, reported with its canonical path | N/A |
| Absolute, outside | `story_location: /etc` | **out-of-tree**, reported with the path, **never read** — the check that matters | typed value, never a throw |
| Relative, escaping | `story_location: ../../elsewhere` | out-of-tree, reported | `..` resolved before the answer |
| Quoted value | `story_location: "docs/stories"` — the shipped template's form | resolved in-tree | both quoting forms read |
| No file at all | no `sprint-status.yaml` | **absent** — a normal shape with its own state, not an error and not empty | FR-75 |
| File, no key | `sprint-status.yaml` present, `story_location` absent | **undeclared** — distinct from absent and from a key that says nothing | never an empty success (AD-13) |
| Key, no value | `story_location:` with nothing after it | declined, reported as such | distinct from undeclared |
| Unreadable file | the file exists and cannot be decoded | reported unreadable, reusing Story 1.9's readability signal | not conflated with absent |
| Untrusted segment | a free-text slug carrying a separator, a leading dot, or a NUL | the sanitizer rejects or neutralizes it **before** any path is built | NFR-17, filesystem half |

</frozen-after-approval>

## Code Map

- **Nothing reads `story_location` today**, so the `/etc` case is unreachable rather than mishandled. `_bmad-output/implementation-artifacts/sprint-status.yaml:36` holds the real value, relative and unquoted; the shipped template at `.claude/skills/bmad-sprint-planning/sprint-status-template.yaml:50` uses the double-quoted form, so both occur.
- `src/domain/frontmatter.ts` -- **one gate blocks reuse**: it returns `present: false` unless line 1 is `---`. Every other rule already handles this exact file — indented lines skipped (so `development_status`'s sub-map cannot become a top-level field), blanks and `#` comments skipped, and a valueless key declined into `skipped` rather than invented. The change is an additive entry point plus a decision about what terminates an unfenced scan. Its header's claim that "the first bundled library still lands with config parsing (FR-10)" is **stale** — FR-10 is deferred indefinitely.
- `test/architecture.test.ts` -- `importersOf('src/domain/frontmatter.ts')` is asserted **exactly** `['src/domain/identity.ts']`, with the message that level 2 is part of the authority rather than a reader anything else may key identity on. Widening it is a deliberate edit there, not a quiet import.
- `src/adapters/fs/read.ts` -- `resolveWithin` throws `ConfinementError`, and the header states confinement is the one refusal that still throws because "there is no sensible way for a caller to continue". This story needs a **non-throwing** resolution answer for a *shape* rather than a race. The precedent for converting such a throw into a typed value is `src/cli/location.ts`, which turns a marker-out-of-tree throw into a typed `Refusal` — and records that uncaught it reached the user as a stack trace and exit 1.
- `src/adapters/fs/paths.ts` -- `canonical` resolves `..` before the brand is applied, so traversal is neutralized as a **side effect** of canonicalization. That is not a sanitizer and does nothing for a segment.
- `src/domain/signal.ts` -- `SignalState` is closed at AD-8's four and `ReadStage` already carries `confinement`; `Readability` is the shape to reuse for the unreadable-file row. **The four stay four**: the new location state is a separate axis, which is also what `EXPERIENCE.md:168` means by "not as a signal state".
- `src/domain/identity.ts` -- `sprint-status.yaml` already identifies as family `sprint-tracking` at level 1 without its content being read, so this story is the first to open it. `src/cli/inventory.ts` is where the record attaches; its importer set is asserted empty and stays so (Story 1.12's).
- Binding wording: `prd.md:169` (FR-51), `:175` (FR-74, naming `/custom/stories` as an explicitly tested value), `:176` (FR-75, "presenting sprint-derived views as unavailable rather than empty or broken"), `:302` (NFR-10), `:303` (NFR-17, both surfaces), `ARCHITECTURE-SPINE.md:120` (AD-9 narrowed — resolved and refused, recorded out-of-tree, never read, never served), `:126` (AD-10's two checks), `:192` (exactly four signal states), `EXPERIENCE.md:103` (the copy: `Story location points outside the project: <path>. Not read.`).
- **Contested, and decided here by the human.** Where out-of-tree is reported: the code precedent says `unchecked` at the `confinement` stage; `EXPERIENCE.md:168` says at the family level and not as a signal state; `review-state-coverage.md:125` says `unchecked` "misdescribes a deliberate refusal as inattention". Decision: a first-class state on its own axis. This does **not** overturn Story 1.9's "no fifth state" record, which was about `SignalState`.
- **Stale and to be corrected:** `epic-1-context.md:84` still says this story "extends 1.5's notion of a permitted root to cover configured story locations" — cancelled by the AD-9 narrowing, and misleading to anyone reading the context as the brief.
- **No authoritative string for FR-75.** `EXPERIENCE.md`'s index has a row for out-of-tree but none for a sprint-derived view being unavailable. Record the gap for Story 1.12 as Story 1.9 did for FR-12; do not invent copy.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/frontmatter.ts` -- add an unfenced-document entry point so a zero-indent scalar can be read from a YAML file with no `---`, and correct the stale FR-10 sentence -- one gate is all that blocks this file, and a second hand-rolled reader would be free to drift from the first
- [x] `src/adapters/fs/segments.ts` -- new: the AD-10 sanitizer over a content-derived path segment, filesystem surface only -- it does not exist, and the spine's structural seed already claims it does
- [x] `src/adapters/fs/read.ts` -- add a non-throwing resolution answer for a configured location, so an out-of-tree value is a typed value rather than an exception -- confinement rightly throws for a race; this is a shape
- [x] `src/domain/sprint.ts` -- new, pure: the closed location vocabulary — in-tree, out-of-tree, absent, undeclared, declined — and the rule mapping a read scalar onto it -- FR-74 and FR-75 need states that do not exist, on their own axis rather than as a fifth signal state
- [x] `src/cli/inventory.ts` -- resolve `story_location` once and attach the record, reading nothing outside the root -- resolution belongs where the pass already composes
- [x] `test/domain/sprint.test.ts` -- new: every I/O-matrix row, with the `/etc` case asserting that no read was attempted
- [x] `test/adapters/segments.test.ts` -- new: separators, leading dots, NUL, and the traversal forms, each pinned from both sides
- [x] `test/adapters/read.test.ts` -- cover `resolveDeclared`'s four outcomes in its own module's test file, both symlink directions included -- review round 1: a contract observed only through two other layers is a contract nobody can read
- [x] `src/domain/signal.ts` -- narrow `UNREAD`'s sentence from "nothing read it" to "identification never opened it" -- review round 1: this story reads `sprint-status.yaml` on every pass, so the old sentence was false on that entry
- [x] `test/domain/frontmatter.test.ts` -- cover the unfenced door directly: the real file's shape, the indented sub-map excluded, a valueless key declined, a document boundary respected -- added during execution, because the reader change is behavioural and the integration rows above cannot state the indentation claim as an absence
- [x] `test/architecture.test.ts` -- widen `frontmatter.ts`'s importer set deliberately with the reason, and add exact sets for the new modules
- [x] `_bmad-output/implementation-artifacts/epic-1-context.md` -- correct the stale claim that this story widens the permitted root -- the AD-9 narrowing cancelled it and the context is what a reader takes as the brief
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- record the out-of-tree decision and that it does not add a fifth `SignalState`; the URL half of NFR-17 deferred to Story 2.1; FR-75's missing string row for Story 1.12; and that this story is the first consumer to open `sprint-status.yaml`
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new observed total -- never lowered

**Acceptance Criteria:**
- Given `story_location: /etc`, when the location is resolved, then it is reported out-of-tree with its path, no exception escapes, and **no read of that path is attempted** — observed by a reader that records every path it is asked for.
- Given this repository's own `sprint-status.yaml`, when the location is resolved, then it reports in-tree with the canonical path of `_bmad-output/implementation-artifacts`.
- Given no `sprint-status.yaml`, and separately given one with no `story_location` key, then the two are reported as different states and neither is an error.
- Given a free-text segment carrying a path separator or a leading dot, when it passes the sanitizer, then it cannot contribute a path component that escapes or hides — and a mutation removing the sanitizer fails the suite.
- Given `npm test`, when it completes, then typecheck, build and suite pass with `fail 0`, at or above the raised floor, and the purity gate passes over every domain module.

## Spec Change Log

**2026-09-02, during implementation.** No review loopback. Three notes, none of
them touching the frozen sections:

1. **One task line added**, listed above with its reason:
   `test/domain/frontmatter.test.ts`, direct coverage of the unfenced door,
   because the reader change is behavioural and an integration row cannot state
   the indentation claim as an absence.
2. **`LocationState` ships six values where the task line enumerates five.**
   The sixth is `unreadable`, required by this spec's own I/O matrix row for a
   tracking file that "exists and cannot be decoded … not conflated with
   absent", which none of the five can carry. Recorded in `deferred-work.md`
   with the full reasoning. AD-8's four are untouched.
3. **The `/etc` acceptance is asserted twice, not once.** A recording reader
   proves no read was attempted, and a symlink row pins the resolution
   direction the recorder cannot see.

**2026-09-02, review round 1.** Eighteen findings, no spec loopback; the frozen
sections are untouched. What changed the *shape* of the delivery, as against
fixing a defect inside it:

4. **`resolveDeclared` now resolves before it judges, and the "touches nothing
   outside the root" claim is withdrawn.** Refusing from the spelling first was
   measured to report a correct in-project location as out-of-tree whenever the
   project is reached through a symlinked ancestor — the ordinary macOS
   `/tmp → /private/tmp` shape — because the root is canonical and a raw
   spelling is not, so two values carried the `CanonicalPath` brand without
   being in the same form. The invariant that holds and is now stated in all
   three places that overstated it: **nothing outside the root is ever read** —
   no content, no listing, no `stat` for kind or size — while the one
   `realpathSync.native` AD-9 mandates does follow a link out. `canonical` was
   replaced by `canonicalWithResolution` in the same change, because `ok: true`
   was promising a resolution that silently degraded to a spelling.
5. **`src/adapters/fs/paths.ts` is no longer touched at all.** Its
   `absoluteSpelling` addition existed only for the spelling-first check and
   went with it; the task line is removed rather than left ticked over an
   unchanged file.
6. **`LocationState` ships eight, not six.** `unresolved` and `ambiguous` were
   added because five states could only answer two measured questions falsely:
   `in-tree` was returned for a directory that does not exist, and two files
   identified as sprint tracking were resolved by walk order. Both are recorded
   in `deferred-work.md` beside the six-versus-five note.
7. **The sanitizer grew three rules and lost a brand.** `windows-illegal`,
   `bidi` and `too-deep` close gaps the module's own doctrine demanded;
   `SafeSegment` was removed because no signature accepted one. It now imports
   nothing at all, `node:path` included, which is what removing its one
   platform-dependent line cost.

## Verification

**Commands:**
- `npm test` -- expected: exit 0, `fail 0`, total at or above the raised `DEFAULT_MIN_TESTS`.
- `node --test --test-reporter=spec test/domain/sprint.test.ts test/adapters/segments.test.ts` -- expected: every matrix row a named passing test.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-1-11-locate-sprint-tracking-safely.md` -- expected: exit 0, no `MISS`.

## Suggested Review Order

**The check that matters: resolved, reported, never read**

- Start here: sanitize, resolve once, judge the resolved form — the same rule every other path in this class gets.
  [`read.ts:463`](../../src/adapters/fs/read.ts#L463)
- AD-10's missing first check, over one content-derived segment, refusing rather than repairing.
  [`segments.ts:260`](../../src/adapters/fs/segments.ts#L260)
- A declared location judged component by component, with `.` and `..` allowed through as navigation so confinement answers them.
  [`segments.ts:413`](../../src/adapters/fs/segments.ts#L413)

**A location state on its own axis, not a fifth signal state**

- The closed vocabulary: in-tree, out-of-tree, absent, undeclared, declined, unreadable, unresolved, ambiguous.
  [`sprint.ts:108`](../../src/domain/sprint.ts#L108)
- Each state's meaning and the requirement that owns it, every id read out of the source document.
  [`sprint.ts:157`](../../src/domain/sprint.ts#L157)
- The rule mapping what the pass found onto that axis.
  [`sprint.ts:353`](../../src/domain/sprint.ts#L353)

**Reading one scalar without a YAML parser**

- The second door onto the same scan — unfenced, starting after a leading document marker.
  [`frontmatter.ts:376`](../../src/domain/frontmatter.ts#L376)
- Resolved once per pass, from the tracking file the level-1 rule identified — never from a name hint, never by sort order.
  [`inventory.ts:1084`](../../src/cli/inventory.ts#L1084)
- The record the inventory carries.
  [`inventory.ts:330`](../../src/cli/inventory.ts#L330)

**Tests**

- Both symlink directions, the two that matter: inside pointing out, and outside resolving in.
  [`sprint.test.ts`](../../test/domain/sprint.test.ts)
- Every refusal rule pinned from both sides.
  [`segments.test.ts`](../../test/adapters/segments.test.ts)
- The floor, raised to the observed total.
  [`run-tests.ts:38`](../../scripts/run-tests.ts#L38)
