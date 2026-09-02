---
title: 'Story 1.6a — Walk the artifact tree safely'
type: 'feature'
created: '2026-09-02'
status: 'done'
baseline_commit: '6e772f296412380e5494ecfbe5892dc6bcd4efec'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No unit in this project enumerates a directory tree. Story 1.7 identifies artifacts and Story 1.9 speaks of "crashing the walk" — both assume an enumerator that was never built. The only existing traversal is test scaffolding (`test/support/gate.ts:337`) and it is a counter-example: it rethrows on `EACCES`, so one unreadable directory kills the whole pass; it has no depth, breadth or total bound; and it has no unit test of its own.

**Approach:** Build the walk in the filesystem adapter, where AD-1 and AD-10 require the I/O to live. Symlinks resolve before confinement is checked and before identity is keyed; a link inside the tree pointing out of it is refused; the same file reached two ways appears once; and every failure is a value in the existing four-state vocabulary rather than an exception. Bounded in depth and in total entries, with the budget a required argument.

## Boundaries & Constraints

**Always:** Failure is a value — an unreadable directory becomes an entry and the pass continues (Story 1.9: "neither is omitted and neither aborts the pass"). Confined enumeration only: the directory is `resolveWithin`-checked before it is read, and **every child is re-canonicalized and re-confinement-checked before it is yielded or descended**. Identity is the resolved real path. **A path whose resolution failed is reported unreadable and never descended, and never counted as a new identity** — `canonical` returns the *spelling* for anything `realpathSync.native` could not resolve (`EACCES`, `ELOOP`, `ENAMETOOLONG`), and `ELOOP` is the cycle case, so keying an unresolved path would reintroduce the duplicate this story exists to prevent. Directories are entries in their own right (FR-11 run folders; AD-4's run-folder-versus-sharded-document ambiguity). Every bound is pinned from **both** sides by test — a mutation that shrinks it must fail, not merely one that removes it.

**Ask First:** Widening `ConfinedReader` to a permitted-root *set* — that is the artifact-roots config story's work, and this walk is deliberately built against the single root. Adding a second importer to `src/adapters/fs/list.ts`, whose exact-importer test is AD-10's only enforcement.

**Never:** Do not import the unconfined `list.ts` — this walk recurses and reads, so AD-10's scoped exception does not cover it. Do not create `src/domain/` or `src/ports/`; that split is Story 1.7's. Do not introduce a fifth state — AD-8's present/absent/unreadable/unchecked already covers what the walk reports. Do not rethrow on a per-entry failure. Do not default the budget.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plain nested tree | files and directories several levels deep | every entry once, each with its path relative to the root and its kind | N/A |
| One file, two names | a symlink inside the tree to a file inside the tree | the file appears **once**, keyed by resolved path | N/A |
| Directory cycle | `a/link -> a` (or a longer loop) | terminates; each real directory appears once | no hang, no repeated entry |
| Link escaping the tree | a link inside the root whose target is outside it | refused: reported out-of-tree, never descended, never read | confinement decided after resolution |
| Dangling link | a link whose target does not exist | reported, pass continues | not a crash, not silently skipped |
| Unreadable directory | a directory denied `EACCES` | that entry is `unreadable` naming the stage; siblings and the rest of the tree still enumerated | **must not abort the pass** — the gate walker's defect |
| Unresolvable path | resolution fails `ELOOP`/`EACCES` | `unreadable`, not descended, and not keyed as a new identity | never deduped on a spelling |
| Budget or depth exceeded | tree larger than the caps | stops and reports truncation | honest, never silent |
| Case-only difference | `Foo/` and `foo/` on the running volume | whatever the volume says — one identity where it folds case, two where it does not | the question goes to the volume, never to the platform name |

</frozen-after-approval>

## Code Map

- `src/adapters/fs/read.ts` -- `ConfinedReader` (`:81`): `resolveWithin` `:99` (throws outside root), `entryAt` `:117`, `isDirectory` `:135`, `readText` `:153`. **No enumeration exists** — `readdir` appears nowhere. `Entry` `:66` is the vocabulary 1.9 forbids extending. `:73-80` states the root-*set* widening this story stays behind.
- `src/adapters/fs/list.ts:90` -- the unconfined lister, **off limits**. `test/architecture.test.ts:684` asserts its importers `deepEqual ['src/cli/suggest.ts']` exactly; a second importer widens AD-10's carve-out.
- `src/adapters/fs/paths.ts:21-29,47-52,126-130` -- the narrowed guarantees behind this story's hardest case: the brand certifies neither existence nor resolution, and `contains` answers about *spelling* once resolution failed. `identical` `:113`, `canonical` `:78` (resolves, then falls back silently).
- `src/adapters/fs/list.ts:71-73` -- precedent for a **required** budget: an unbounded listing must be impossible to ask for by accident.
- `test/support/gate.ts:337-383` -- prior art, and a counter-example. Cycle set keyed on `realpath` `:339-348` but `readdir`s the **unresolved** path `:352`; `EACCES` rethrown `:353-357`; skip rule `:376`; no bound of any kind; header `:1-16` records two defects a unit test would have caught, and it still has none.
- `test/support/project.ts:29,50,66` -- `makeProjectDir`, `makeScratchDir`, `makeProjectAt`. Nothing in `test/support/` creates a symlink, and `deferred-work.md:179` records ~20 unguarded `symlink()` calls that error rather than skip on Windows.
- Binding wording: `ARCHITECTURE-SPINE.md:126` (AD-10, no opt-out), `:127` (the scan's exception — names only, no recursion, no read; **not available here**), `:189` (keyed by resolved absolute path), `:102-112` (AD-7/AD-8 four states), `epics.md:361-369` (1.9's no-abort contract).
- Closes `deferred-work.md:142`. Collides with `:198` (`readdirSync` materializes before capping — a walk is the "larger appetite" it names), `:193` (untyped `reason` vs the closed vocabulary), `:179`.

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/fs/read.ts` -- add confined enumeration to `ConfinedReader`: `resolveWithin` the directory, then re-canonicalize and re-confine every child before returning it -- AD-10 forbids an opt-out and the scan's exception does not reach a recursing reader
- [x] `src/adapters/fs/walk.ts` -- new: the bounded, cycle-detecting walk over one root, required budget, per-entry failure as a value -- the enumerator Stories 1.7 and 1.9 already assume
- [x] `test/support/tree.ts` -- new: fixture builder for trees with symlinks, cycles, dangling links and denied directories, each guarded and typed for Windows -- no support helper makes a symlink today and the unguarded ones are already a recorded defect
- [x] `test/adapters/walk.test.ts` -- new: every I/O-matrix row, with each bound pinned from both sides
- [x] `test/adapters/read.test.ts` -- cover the new enumeration, including a child that resolves out of the root
- [x] `test/architecture.test.ts` -- assert `walk.ts` does not import `list.ts` and that the walk's importer set is stated -- AD-10's only enforcement is an exact importer assertion, so a new adapter needs its own
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- carry `1-6a-walk-the-artifact-tree-safely` through to `done`
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- close `:142`, and record what this walk decides about `:198` and `:193` rather than leaving them to be rediscovered
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new observed total -- never lowered

**Added in review round 1** (2026-09-02), all within this story's boundaries:
- [x] `src/adapters/fs/realpath.ts` -- add `tryResolveRealPathNative`, the one call site of `realpathSync.native`, reporting the failure the existing wrapper swallows -- inferring resolution from a `statSync` probe was wrong: different syscall, different failure set, so a path `stat` accepts and the resolver refuses was marked `present` with an identity built from a spelling
- [x] `src/adapters/fs/paths.ts` -- add `canonicalWithResolution`, the same canonicalization with the discarded half handed back -- the narrowed guarantee this file already documents is exactly what a caller keying an identity cannot live with
- [x] `test/adapters/paths.test.ts` -- cover `canonicalWithResolution` on a resolvable path, an absent one and an `ELOOP` one -- the new guarantee needs a test where the guarantee lives

**Acceptance Criteria:**
- Given a tree containing a directory cycle, a dangling link, a link escaping the root and a directory denied `EACCES`, when the walk runs, then it terminates, every readable entry appears exactly once, the escaping link is reported out-of-tree and never read, and the denied directory is one `unreadable` entry among otherwise complete results.
- Given the same file reachable by two names, when the walk runs, then it appears once; and given a path whose resolution fails, then it is reported unreadable and is not treated as a distinct identity.
- Given a mutation that *shrinks* the depth cap or the entry budget, when the suite runs, then it fails — the bounds are pinned from both sides, not merely against removal.
- Given a mutation that makes the walk rethrow a per-entry `EACCES`, when the suite runs, then it fails.
- Given `npm test`, when it completes, then typecheck, build and suite pass with `fail 0`, at or above the raised floor (`skipped 0` on POSIX non-root; a root run needs the documented `BMAD_DASH_TEST_ALLOW_SKIPS`).

## Spec Change Log

**Review round 1 — 2026-09-02.** Twenty findings applied, three deferred as new
open entries in `deferred-work.md`. No change to the frozen intent: the matrix
row for "one file, two names" is scoped to *a symlink*, so the hard-link case
was a claim to narrow rather than a requirement to meet. Two additions were
coordinator calls on questions the sources settle: the walk gains a start
subpath and an exclusion predicate as **mechanism** (policy stays in Story 1.7,
per the Never clause), and hard links stay two artifacts because
`ARCHITECTURE-SPINE.md:189` keys an artifact by its resolved absolute path.
Everything else was a correctness fix, a test that pinned an already-deletable
behaviour, or an overstated claim narrowed.

## Implementation Notes

- **The walk reports the root as its own entry, spelled `.`.** That is what lets
  a root the tool cannot enumerate be reported in the same four-state
  vocabulary as any other directory, instead of needing a special field on the
  result for the one case where there is nothing to list. It counts against
  `maxEntries`, so the budget bounds the size of the result rather than an
  internal quantity a caller would have to guess the relationship to.
- **Where a shared identity is reported.** One file reached two ways appears
  once, keyed by resolved path; the *spelling* it is reported under is the first
  one the walk meets in its order (sorted names, depth-first). Both directions
  are asserted, so the contract is "appears once" and not "the link loses".
- **How an unresolved path is kept out of the identity set.** Only the
  `present` variant of `Child` and `WalkEntry` carries a `path`. A child whose
  resolution failed has no field for a caller to key on, so the mistake the
  frozen intent names — keying a spelling that `realpathSync.native` refused,
  with `ELOOP` as the cycle case — is unavailable rather than discouraged.
- **How resolution failure is detected at all.** `canonical` cannot say: it
  returns the spelling for `EACCES`, `ELOOP` and `ENAMETOOLONG` alike. `statSync`
  follows the same chain of links and directory lookups that
  `realpathSync.native` does, so it fails in the same cases and names which —
  and it is the probe the kind was already needed for. A non-symlink `Dirent`
  needs no probe, because the parent is already canonical.
- **Depth is walk depth, not filesystem depth.** A directory reached through a
  symlink is one level below wherever the link sat, which is the depth the bound
  was actually applied at.
- **A depth truncation claims only what the walk did.** "Not enumerated" is true
  of an empty directory at the boundary as well as a full one, and the walk
  cannot tell those apart without doing the thing the bound forbids.

### Added in review round 1

- **`start` and `exclude` are mechanism; the names are policy.** Measured on
  this repository at `{maxDepth: 8, maxEntries: 25}`, the walk reached `.` and
  the dot-directories and never saw `_bmad-output` or `src` — `.` sorts ahead of
  every letter, so the budget was spent before the real subtrees. `gate.ts`, the
  counter-example, *has* a skip rule and dropping it was a regression rather
  than a simplification. `node_modules` and dot-directory names are deliberately
  **not** in the adapter: that is Story 1.7's domain policy. `exclude` runs
  before the cap, on `listChildDirectories`' hard-won lesson, and an excluded
  child is neither an entry nor a truncation — the caller asked for it to be
  left out.
- **A symlink alias collapses; a hard link does not.** Two hard links have two
  resolved absolute paths, and `ARCHITECTURE-SPINE.md:189` keys an artifact by
  its resolved absolute path, so two artifacts is the sourced answer. Inode
  keying would contradict the spine to fix a case the frozen matrix never asked
  about. The module's headline claim was narrowed from "the same file reached by
  two names" to what is actually guaranteed, and both directions are pinned by
  test so the decision is visible rather than incidental.
- **A suppressed alias leaves no trace, deliberately.** Nothing became
  unavailable and the artifact at that identity *is* reported, once; a second
  entry saying "this is the same thing you already have" would put a duplicate
  into the inventory whose point is that there is not one. Recorded in the
  module and here rather than left to be inferred.
- **Resolution is probed with the resolver, not with a `stat`.** They are
  different syscalls with different failure sets — `ENAMETOOLONG` on the
  expanded chain is the named case — so a path `statSync` accepts and
  `realpathSync.native` refuses was being marked `present` with a `path` built
  from the spelling. `canonicalWithResolution` closes that, and the *directory*
  argument goes through it too, so `readdir` can never follow an unresolvable
  link and enumerate names from outside the root.
- **A `Dirent` is trusted only for what it positively answers.** `DT_UNKNOWN`
  makes every `isX()` false, so `!isSymbolicLink()` reads "unknown" as "not a
  link", skips the probe, and reports a real directory as `other` that the walk
  then never descends. The rule is `trustedKind`, exported and unit-tested
  against a synthetic unknown entry — no development filesystem produces one, so
  a test driven through `readdir` could not tell the two rules apart.
- **`complete` is the completeness question; `truncations` is not.** This
  story's own acceptance tree has an empty `truncations` and a denied directory
  in it, so the old doc invited a caller to call an incomplete walk complete.
  `truncations` now means "a bound was reached", nothing more.
- **The child cap reserves the directory's own entry.** Without the
  reservation the walk asked for one more child than it could ever hold and then
  recorded a per-directory shortfall for it — over-counting one loss, and
  blaming a directory for the global cap. With the budget already spent only the
  loop-head record fires, and it names the first path actually dropped.
- **A throw from enumeration is told apart from a refusal.** A `ConfinementError`
  is a decision, reported `unchecked`/`confinement`; anything else — a bad
  limit, a `TypeError` — is a defect and is reported `unreadable`/
  `read-directory`. A single catch-all arm sent a programming defect to a user
  as "refused for being outside the project".

## Verification

**Commands:**
- `npm test` -- expected: exit 0, `fail 0`, total at or above the raised `DEFAULT_MIN_TESTS`.
- `node --test --test-reporter=spec test/adapters/walk.test.ts` -- expected: every matrix row a named passing test.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-1-6a-walk-the-artifact-tree-safely.md` -- expected: exit 0, no `MISS`.

## Suggested Review Order

**The walk itself**

- Start here: the whole traversal — bounded, cycle-detecting, failure as a value.
  [`walk.ts:262`](../../src/adapters/fs/walk.ts#L262)
- The budget, required rather than defaulted, and validated instead of clamped.
  [`walk.ts:78`](../../src/adapters/fs/walk.ts#L78)
- Mechanism, not policy: a start subpath and an exclusion predicate. Story 1.7 supplies the names.
  [`walk.ts:107`](../../src/adapters/fs/walk.ts#L107)
- The cycle set seeded with the starting directory — what stops a link back to the root.
  [`walk.ts:287`](../../src/adapters/fs/walk.ts#L287)
- `complete` separated from `truncations`: a bound was hit is not the same as the tree was whole.
  [`walk.ts:207`](../../src/adapters/fs/walk.ts#L207)

**Identity, and the claim narrowed to what is true**

- The overstatement corrected: a symlink alias collapses, a hard link does not, with the spine cited.
  [`walk.ts:41`](../../src/adapters/fs/walk.ts#L41)
- Only the `present` variant carries a `path`, so keying identity on an unresolved child is a type error.
  [`read.ts:177`](../../src/adapters/fs/read.ts#L177)
- Resolution probed with the resolver itself, so a `stat` that succeeds cannot mint a spelling-keyed identity.
  [`realpath.ts:84`](../../src/adapters/fs/realpath.ts#L84)
- The canonical form that reports whether it actually resolved.
  [`paths.ts:110`](../../src/adapters/fs/paths.ts#L110)

**Confinement, on every child**

- Confined enumeration: the directory checked, then every child re-canonicalized and re-confined.
  [`read.ts:382`](../../src/adapters/fs/read.ts#L382)
- A refusal is a distinct class, so a programming defect is not reported as out-of-tree.
  [`read.ts:146`](../../src/adapters/fs/read.ts#L146)
- Only a positive `isDirectory`/`isFile` is trusted — a `DT_UNKNOWN` entry gets probed.
  [`read.ts:92`](../../src/adapters/fs/read.ts#L92)

**Tests and fixtures**

- Fixture trees with symlinks, cycles and dangling links, guarded by measurement rather than platform name.
  [`tree.ts:138`](../../test/support/tree.ts#L138)
- Denial restores the mode it found, and refuses when denial would not be enforced.
  [`tree.ts:183`](../../test/support/tree.ts#L183)
- The walk reads through the reader and never lists — enforced by the gate's own scanner, not a regex.
  [`architecture.test.ts:702`](../../test/architecture.test.ts#L702)
- The importer set is stated, so Story 1.7 claiming it is a deliberate edit.
  [`architecture.test.ts:755`](../../test/architecture.test.ts#L755)
- The floor, raised to the observed total.
  [`run-tests.ts:38`](../../scripts/run-tests.ts#L38)
