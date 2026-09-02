---
title: 'Story 1.9 — Show what could not be read or recognized'
type: 'feature'
created: '2026-09-02'
status: 'done'
baseline_commit: '1da234478170d35f09bb09b2c50c79d749ce7651'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing records at the artifact level whether an artifact could be read. Measured on the current build: a file of invalid UTF-8 bytes named `prd.md` **under an artifact root** is reported `identified`, `family: prd`, `confidence: certain`, with `attempted: [location:resolved]` and no reason at all — because level 1 resolves before anything reads. That is corrupt data presented as valid, which NFR-3 forbids by name. Outside a root the decode failure survives only as prose inside two `Attempt.reason` fields. Two vocabulary questions are also overdue: FR-12's *present-but-uninterpreted* and FR-69's *unidentified* are used interchangeably by one document and as distinct by another, and `inventory.ts:545` flattens a typed state and stage back into an English sentence.

**Approach:** Record readability as its own AD-8 four-state signal, separate from the identity verdict, which stays exactly as Story 1.7 decided it (AD-4). A file no level needed to read is `unchecked` — honest, and it stops anything claiming the content is fine. Keep FR-12 and FR-69 as distinct states with their definitions written down. Every failure keeps its typed state and stage, with the raw reason beside them rather than folded into it.

## Boundaries & Constraints

**Always:** Readability is a **signal**, never an identity outcome — identity is Story 1.7's authority and nothing here re-derives or overrides it (AD-4). Exactly AD-8's four states, no fifth: `present`, `absent`, `unreadable`, `unchecked`. A file no level read is **`unchecked`, never `present`** — the tool says it did not look rather than implying the content is fine. FR-12 and FR-69 stay **distinct**: FR-12 is *recognized, but no interpretation applies*; FR-69 is *identification itself failed*. Both definitions get recorded. Typed state and stage survive to the consumer; the raw OS reason travels beside them, never flattened into a sentence (the shape `deferred-work.md:211` prescribes). Nothing is omitted and nothing aborts the pass (AD-7).

**Ask First:** Reading eagerly to establish readability for files no level needs — that trade was taken deliberately the other way, and reversing it is a scope change. Adding a fifth signal state. Wiring the pass into the served page (Story 1.12's, and its importer set is asserted empty on purpose).

**Never:** Do not collapse FR-12 into FR-69, or resolve either by precedence. Do not re-derive identity, shape, or parts. Do not return an empty extraction as a successful empty result (AD-13). Do not import anything into `src/domain/` from outside it. Do not claim the render half of this story's acceptance — see the stated limit below.

**Stated limit, accepted deliberately:** because readability is established only where a level needed the content, a malformed file **under** an artifact root is reported `unchecked` rather than `unreadable`. The NFR-3 violation is fixed — nothing claims it readable — but this story's own clause "a file that cannot be decoded as text is reported as unreadable" holds only for files some level actually read. Recorded, not silently narrowed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Undecodable, and read | invalid UTF-8 where a level needed the text | readability `unreadable`, stage naming the decode, reason beside it; identity unchanged | never an exception |
| Undecodable, not read | invalid UTF-8 under an artifact root, level 1 resolves | readability **`unchecked`** — the accepted limit; nothing claims it readable | no false `present` |
| Oversized | file beyond the read limit | readability `unreadable`, reason naming size and limit | listed, never omitted |
| Non-regular | a FIFO named `notes.md` | readability `unreadable`; the pass does not block | never hangs |
| Recognized, uninterpretable | identified family, but nothing can interpret it — e.g. an index-less markdown directory that is not claimed a document | **FR-12** present-but-uninterpreted | distinct from unidentified |
| Identification failed | no precedence level resolves | **FR-69** unidentified, naming the levels attempted | unchanged from 1.7 |
| One bad artifact among many | a tree holding a single malformed file | every sibling still present and identified; the pass reports `complete`; nothing aborts | per-artifact containment (NFR-4) |
| Frontmatter opened, never closed | `---` with no closing fence | reported unavailable with its reason — never an empty success (AD-13) | no silent empty |
| Truncated mid-write | a partially written artifact | handled without crashing and without presenting it as valid (NFR-3) | typed, not thrown |

</frozen-after-approval>

## Code Map

- **The measured defect.** `src/domain/identity.ts` short-circuits at level 1 before any read, so a file under `ARTIFACT_ROOTS`/`DOCUMENT_ROOTS` never has its content touched. `src/cli/inventory.ts` passes content as a lazy `ContentSource` memoized only inside `identify`'s closure and then **discards it** — so no readability fact survives onto `InventoryEntry`. Reproduce with invalid UTF-8 at `_bmad-output/planning-artifacts/prds/prd.md`.
- `src/adapters/fs/read.ts:500-534` -- `readText`: decodes with `TextDecoder('utf8', {fatal:true})` and returns `{ok:false, reason:'not valid UTF-8 text'}`. Its header records that `readFileSync(path,'utf8')` is *lossy* and would have left this story "building 'report it as unreadable' on a function that guesses". Also refuses non-regular files and anything over `MAX_READ_BYTES` (`:74`), each with its own reason.
- `src/cli/inventory.ts:545-546` -- `unusable()` composes `` `${state} at the ${stage} stage: ${reason}` `` — the one place typed state and stage are flattened back into prose, and the thing `deferred-work.md:211` says to keep typed.
- `src/domain/identity.ts` -- `Verdict` has **no `unreadable` outcome** and `Confidence` is a closed two, so readability cannot be expressed as an identity state without widening 1.7's vocabulary. `Attempt`'s `unavailable` + `reason` is where a decode failure currently hides. `identity.ts:68-74` records the FR-12/FR-69 collision as deliberately unresolved by 1.7.
- Reuse the state vocabularies already in `read.ts`, `walk.ts`, `identity.ts` and `document.ts` rather than inventing more; grep them. The shape to copy is `Refusal` (`cli/location.ts:48-53`) — the codebase's one closed reason vocabulary, carrying typed cause and raw text side by side.
- `test/architecture.test.ts:834-843` -- the pass's importer set is asserted **empty**, with the message that Story 1.12 is the first consumer and adding one is an edit there. This story must not add one.
- Binding wording: `prd.md:177` (FR-12), `:285-291` (NFR-3/4/5/6), `ARCHITECTURE-SPINE.md:102-106` (AD-7 — typed degradation, never exception or omission), `:112` (AD-8's four states, per artifact **per signal**), `:141-145` (AD-13), `epics.md:369` (this story's acceptance), `:397-399` (Story 1.12 surfaces 1.7–1.11 and satisfies no new FRs).
- **Unsettled, decided here.** FR-12 vs FR-69: `EXPERIENCE.md:170` merges them with one string row (`:92`); `epics.md:46,369,483` treat them as distinct; `review-adversarial-seams.md:352-359` reads FR-12 as "recognized, no viewer applies" and proposed one closed enumeration, **not adopted**. And **AD-13 has no code to bind today** — its subject is status vocabularies in YAML comments, which nothing reads; `frontmatter.ts:82-99` already separates absent from undecodable.
- **Anchor note.** Every `path:line` above is as of `baseline_commit`, and is not re-pointed afterwards — this project's own decision that a spec records a state rather than acting as a live index. One correction, because it misleads rather than merely shifts: the prescribed "typed state and stage, raw reason beside them" shape is cited above as `deferred-work.md:211`, and **this story's own diff relocated that entry** to the *Resolved and closed* section. Cite it by its summary text — the untyped-`reason` entry for `Listing` and `Entry` — not by line.
- **The render half is not deliverable.** `src/render/page.ts:51` is still `'Serving. No surface built yet.'`; nothing imports `takeInventory`. AD-7's "every view renders these values explicitly" and this story's "renders every other artifact correctly" are Story 1.12's.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/signal.ts` -- new, pure: AD-8's four states as one shared vocabulary, with the readability signal expressed in it and a stage naming where a read failed -- AD-8 says the four are shared by model and UI, and nothing has yet given them a home
- [x] `src/domain/interpretation.ts` -- new, pure: the FR-12/FR-69 distinction as two recorded states with their definitions, and the rule that decides which applies to a verdict -- the corpus contradicts itself and this is the story told to settle it
- [x] `src/cli/inventory.ts` -- retain a readability signal per entry from the content result the pass already has, `unchecked` where no level read it; stop flattening state and stage into prose -- the fact exists and is thrown away
- [x] `src/adapters/fs/read.ts` -- give `readText`'s failure a typed stage, so a decode failure is distinguishable from an over-limit refusal without pattern-matching English -- added in review round 1: "naming what failed and at which stage" had no answer at the read boundary, and I omitted this from the original task list
- [x] `test/domain/signal.test.ts` -- new: the four states, and that no fifth is reachable
- [x] `test/domain/interpretation.test.ts` -- new: FR-12 and FR-69 asserted distinct, including a verdict that is identified yet uninterpretable
- [x] `test/cli/inventory.test.ts` -- cover every matrix row, including the undecodable file **under** a root reported `unchecked` and one malformed artifact leaving every sibling intact
- [x] `test/architecture.test.ts` -- assert the new domain modules are pure and their importer sets are exact, and that the pass still has no consumer -- an exact set is what makes each widening deliberate
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- resolve the FR-12/FR-69 collision entry with the decision and its reasoning; settle the untyped-reason question for `Listing` and `Entry` per the prescribed shape, and correct that entry's now-stale claim that an `EACCES` message reaches a terminal; record the `unchecked` limit and that AD-13 has no code to bind
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new observed total -- never lowered

**Acceptance Criteria:**
- Given invalid UTF-8 under an artifact root, when the inventory is taken, then its readability is `unchecked` and nothing in the entry claims the content is readable — the NFR-3 violation measured at baseline is gone.
- Given invalid UTF-8 where a level needed the text, then readability is `unreadable` with a stage and a reason, and the identity verdict is unchanged from what Story 1.7 would produce.
- Given a tree holding one malformed artifact, when the inventory is taken, then every other entry is present and identified and the pass reports itself complete.
- Given a read that fails, when the failure is inspected, then it carries a typed stage distinguishing the decode, the open and the examine, and a mutation that collapses any two of those fails the suite.
- Given a mutation that reports an unread file as readable, collapses FR-12 into FR-69, or reintroduces the prose flattening, when the suite runs, then it fails.
- Given `npm test`, when it completes, then typecheck, build and suite pass with `fail 0`, at or above the raised floor, and the purity gate passes over every domain module.

## Spec Change Log

_Empty — no review loopback yet._

## Verification

**Commands:**
- `npm test` -- expected: exit 0, `fail 0`, total at or above the raised `DEFAULT_MIN_TESTS`.
- `node --test --test-reporter=spec test/domain/signal.test.ts test/domain/interpretation.test.ts` -- expected: every matrix row a named passing test.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-1-9-show-what-could-not-be-read-or-recognized.md` -- expected: exit 0, no `MISS`.

## Suggested Review Order

**The vocabulary — AD-8's four states, given a home**

- Start here: the four states, the read stages, and readability as typed state + stage with the raw reason beside them.
  [`signal.ts:160`](../../src/domain/signal.ts#L160)
- The six stages a read can fail at, so "what failed and at which stage" has an answer.
  [`signal.ts:120`](../../src/domain/signal.ts#L120)
- `unchecked` with a true reason: nothing asked for this content.
  [`signal.ts:187`](../../src/domain/signal.ts#L187)
- And the reason a directory gets instead — its listing was read; it just isn't a document.
  [`signal.ts:204`](../../src/domain/signal.ts#L204)

**FR-12 and FR-69, kept apart**

- The two states with their definitions read out of the PRD rather than paraphrased.
  [`interpretation.ts:90`](../../src/domain/interpretation.ts#L90)
- The rule, whose ordering is load-bearing and is now a compile error to remove.
  [`interpretation.ts:156`](../../src/domain/interpretation.ts#L156)
- **Withheld, not guessed:** an artifact the walk never found is neither state — FR-12's term begins with "present".
  [`inventory.ts:227`](../../src/cli/inventory.ts#L227)

**The read boundary**

- A failed read now names its own state as well as its stage, so `absent` is reachable from a read.
  [`read.ts:548`](../../src/adapters/fs/read.ts#L548)
- The walk's own state and stage forwarded rather than re-decided.
  [`inventory.ts:772`](../../src/cli/inventory.ts#L772)
- The signal retained per entry — the fact the pass used to compute and throw away.
  [`inventory.ts:206`](../../src/cli/inventory.ts#L206)

**Tests**

- The four states read out of AD-8's own sentence, with a count check so a later bolded word cannot invent a fifth.
  [`signal.test.ts`](../../test/domain/signal.test.ts)
- The floor, raised to the observed total.
  [`run-tests.ts:38`](../../scripts/run-tests.ts#L38)
