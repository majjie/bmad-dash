---
title: 'Story 1.6 — Fail with the command that would have worked'
type: 'feature'
created: '2026-09-02'
status: 'done'
baseline_commit: 'ed0f0af4dbc2f377b270fda18edbe6bd8480defb'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Running the tool one directory away from a project produces a correct refusal and no way forward: `<path> is not a BMAD project. Looked for _bmad and _bmad-output; …`. The practitioner has to diagnose their own invocation. FR-7 wants the opposite — hand over the command, do not describe the problem, the way `git push` reports a missing upstream.

**Approach:** When and only when the refusal is `not-a-project`, run a bounded scan — the full ancestor chain, plus two levels below the target, skipping dot-directories and `node_modules` — and append the exact invocations that would work, listing every candidate found. The scan lives in `src/cli/`, produces display text only, and returns nothing any other layer consumes.

## Boundaries & Constraints

**Always:** The scan is a failure-message concern (AD-9 rule 2) — it must never become a resolution path, and that has to be *observable*, not merely intended: at least one test must show that substituting the scan for something inert changes the suggestions and changes nothing about which root gets served. Candidates are named by both markers being present, the same test `resolveLocation` applies. Exit codes are unchanged from Story 1.5: `unreadable` → 1, everything else → 2. Suggestions go to stderr, never stdout. A directory the scan cannot list is skipped, never fatal. The scan is bounded in depth *and* in breadth, and says so when it truncates.

**Ask First:** Widening the new filesystem capability beyond listing one directory's child names — in particular anything that reads file *content* outside the project root. Any change to AD-9 or AD-10 wording.

**Never:** Do not build the cycle-detecting artifact-tree walk deferred at `deferred-work.md:142` — that is its own story, immediately before 1.7, and this scan must not be mistaken for it or grow into it. Do not let the scan run for `absent`, `not-a-directory` or `unreadable`; "try running it over there" does not answer a typo, a file, or a permissions problem. Do not read file content anywhere in the scan. Do not walk up for *resolution*.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One directory inside a project | target is `<proj>/_bmad-output`; `<proj>` has both markers | exit 2; stderr keeps the 1.5 message and adds the exact invocation, spelled to match how the tool was actually invoked (`npx bmad-dash <proj>` or `bmad-dash <proj>`) and quoted so it pastes | N/A |
| A folder of checkouts | two children of the target each have both markers | **every** candidate listed, not the first | N/A |
| Nothing in bounds | no markers on the ancestor chain or within two levels | exit 2; states the path examined and what was looked for, and that no candidate was found | invents no suggestion |
| Refusal is not `not-a-project` | absent / not-a-directory / unreadable target | no scan runs at all; message and exit code identical to Story 1.5 | unreadable still exits 1 |
| An unlistable directory in bounds | a child directory denied `EACCES` | skipped; other candidates still reported | never aborts the scan or the exit |
| Excluded directories | `node_modules/x` or `.hidden/y` holds both markers | not offered as a candidate | skip rule applies at every level |
| Symlink loop below the target | a child directory links back to an ancestor | terminates | depth bound; no hang, no repeat candidate |
| A very wide directory | children exceed the breadth cap | scan stops at the cap and reports that it truncated | honest, not silent |

</frozen-after-approval>

## Code Map

- `src/cli/location.ts:14-16` -- already reserves this story by name, and `:48` defines `Refusal` **so this scan need not pattern-match English**; `:44-46` records that `not-a-project` is the only variant it applies to. `:34` `MARKERS`, `:112` the message this appends to.
- `src/cli/index.ts:397` -- `resolveLocation` call; `:399` writes the refusal to **stderr**; `:405` maps `unreadable`→1 and the rest→2. The scan slots between `:398` and `:406`, still before `onSignal` at `:409` and before any socket. `:318-340` `RunDependencies` (note `launch` is deliberately required); `:562` is the only wiring point.
- **`src/adapters/fs/`: nothing in `src/` can list a directory today** -- `readdir`/`opendir` appear zero times. `read.ts:81` `ConfinedReader` offers single-entry `statSync` (`:117`) and single-file read (`:153`) only, and `:99-105` refuses anything outside its root — which every ancestor is by definition. Hence a new module.
- `src/adapters/fs/realpath.ts:1-13,24,58` -- **the precedent to copy**: an fs-adapter module that is deliberately *unconfined* but strictly read-only, justified in its header. AD-1 permits `node:fs` under this directory, and `readdir` is absent from the mutating deny list (`test/support/gate.ts:47-59`), so no gate change is needed.
- `test/support/gate.ts:337` `collectSourceFiles` -- prior-art walker: cycle detection by realpath (`:339-349`), and **the exact skip rule at `:376`** (`node_modules` or leading `.`). It has *no depth bound*. Its header `:5-15` records two defects a unit test would have caught — read before writing a second walker.
- `test/support/project.ts:30` `makeProjectDir(t, prefix)` -- returns a canonical tmpdir with both markers. No ancestor/nested-tree fixture exists yet; `test/cli/location.test.ts:25` `bare(t)` is the nearest.
- `test/cli-entry.test.ts:74` `runBuilt(args)` -- spawns the built CLI and always passes `--no-open`; the current not-a-project assertion is `:459-484`. **`test/cli/flags.test.ts:209-267` fails if a new CLI-spawning test omits `--no-open`.**
- `test/cli/startup-order.test.ts:76` `exitCodeDeps()` -- the in-process stub set for exit-code-only assertions.
- Binding wording, read and quoted rather than paraphrased: `ARCHITECTURE-SPINE.md:119` (AD-9 rule 2, "must never become a resolution path"), `:126` (AD-10, every read confinement-checked, no opt-out), `prd.md:155` (FR-7: does not serve, does not launch, lists every candidate), `prd.md:171` (FR-70: the exact bounds).
- **Three stale lines in `epics.md`, contradicting the above and in scope by user decision:** `:36` and `:191` still say FR-7 "still serves and opens a plain page"; `:51` still says the root is found by "walking up". The PRD, the architecture spine, `EXPERIENCE.md:63` and this story's own acceptance all carry the revised behaviour.

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/fs/list.ts` -- new: list one directory's child *directory* names, unconfined but read-only, no recursion and no content reads -- the two-levels-below half of the scan cannot be done with `stat` alone, and `ConfinedReader` cannot reach an ancestor by design
- [x] `src/cli/suggest.ts` -- new: the bounded scan and its message text; ancestors probed by marker `stat` (no listing needed), two levels below by listing; depth- and breadth-capped; returns display strings only -- AD-9 rule 2 puts it in `src/cli/` and forbids it returning anything the domain consumes
- [x] `src/cli/index.ts` -- run the scan only for a `not-a-project` refusal and append its lines to the existing stderr message, leaving both exit codes and the startup ordering untouched -- the refusal path is the one place this belongs
- [x] `test/adapters/list.test.ts` -- new: cover the listing adapter, including an unlistable directory and a non-directory child
- [x] `test/cli/suggest.test.ts` -- new: cover every I/O-matrix row against throwaway ancestor/nested trees
- [x] `test/architecture.test.ts` -- assert the new adapter is scanned and still permitted, and that scan output never reaches resolution or serving -- the wiring seam is what decides whether the "never a resolution path" rule actually holds
- [x] `_bmad-output/planning-artifacts/epics.md` -- correct `:36`, `:191` and `:51` to the revised FR-7/FR-70 behaviour the PRD, the spine and this story's acceptance already carry -- user decision: an inventory that still promises a served "no project" page will send the next agent to build a surface the UX deleted
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new observed total -- never lowered

**Review round 1 — the files the round's findings reached beyond the list above:**
- [x] `src/cli/location.ts` -- catch the escaping-marker throw and return a distinguishable `marker-out-of-tree` refusal (exit 2, no scan); export the shared `markerList()` the scan had copied -- a reproduced crash the scan turned from an edge case into a routine reachability
- [x] `test/cli/location.test.ts` -- the escaping marker at the direct target, by reason code and message
- [x] `test/support/cli.ts` -- new: one in-process harness (`stubHandle`, `exitCodeDeps`, `observeRun`) replacing four copies of the same stub set -- a new `RunDependencies` member stubbed in three copies and forgotten in the fourth is how a suite starts opening real browser tabs
- [x] `test/support/project.ts` -- add `makeScratchDir` and `makeProjectAt`, the fixtures every new test file had privately re-implemented
- [x] `test/cli/startup-order.test.ts` -- consume the shared harness instead of its own `stubHandle`/`exitCodeDeps`
- [x] `test/cli-entry.test.ts` -- the suggestion path through the **built bundle**, in both command spellings, plus the scan's report on the half-project case it already traversed mutely
- [x] `_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md` -- AD-10 gains the scoped carve-out for unconfined enumeration of directory names: no content, one module, importable only by the scan, enforced by an importer test -- user decision
- [x] `_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/EXPERIENCE.md` -- five rows in the load-bearing string index for the sentences the scan prints, which is what the cross-check reads
- [x] `_bmad-output/implementation-artifacts/epic-1-context.md` -- correct the unqualified AD-10 restatement, and replace "names candidates without ever resolving one" with the claim that actually holds and is checkable
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- the round's four DEFER findings as open entries

**Acceptance Criteria:**
- Given a target one directory inside a real project, when the CLI runs, then stderr names the exact invocation — spelled `npx bmad-dash <ancestor>` or `bmad-dash <ancestor>` to match how the tool was actually invoked, shell-quoted, and carrying the flags the invocation already had — and the process exits 2 without binding a socket or launching a browser.
- Given the scan is replaced by a stub returning no candidates, when the suite runs, then the suggestion assertions fail and every resolution and serving assertion still passes — the scan is observably not a resolution path. And in the other direction: a *successful* resolution calls the scan zero times, asserted by counting, because comparing only the served root and stderr left `void suggest(...)` on the success path green.
- Given a symlink loop and a directory exceeding the breadth cap within two levels, when the scan runs, then it terminates and reports truncation rather than hanging or silently dropping candidates.
- Given `npm test` on a POSIX box as a non-root user, when it completes, then typecheck, build and suite pass with `fail 0` and `skipped 0`, at or above the raised floor. As root, the eight `needs POSIX permissions and a non-root user` guards skip — three of them added by this story — and the run needs `BMAD_DASH_TEST_ALLOW_SKIPS=8`, since the skip gate fails any run with unexplained skips.

## Spec Change Log

- **Iteration 1 (2026-09-02) — intent_gap, resolved by human renegotiation rather than loopback.**
  - *Triggering finding:* the frozen I/O matrix specified the suggestion as `bmad-dash <proj>`. FR-45 distributes this tool for `npx` execution "without prior installation", so for the primary distribution mode the emitted command is `command not found` — while FR-7 promises "the exact invocations that would have worked". The implementation complied with the frozen intent exactly; the intent was wrong.
  - *Amended:* the matrix's happy-path row now requires the command spelled to match the actual invocation, and quoted so it survives a shell. Three further human decisions recorded: AD-10 gains a scoped carve-out in the spine for unconfined enumeration of directory names (no content reads, importable only by the scan, enforced by an importer test); the dot-directory/`node_modules` exclusion stays **descent-only**, so an ancestor you are standing inside is still named; and the code was carried forward as patches instead of reverted.
  - *Known-bad state avoided:* shipping a refusal whose headline feature is a command the reader cannot run — the failure mode FR-7 exists to remove, reintroduced one layer up.
  - *KEEP — must survive any re-derivation:* the candidate test is `resolveLocation` itself, called as a predicate, never a second copy of the recognition rule. The AD-9 rule-2 substitution test (real scan vs. inert stub: suggestions differ, served root identical) is the story's load-bearing check and must remain. `MAX_DEPTH_BELOW` stays pinned from both sides. The `Refusal` code, not message text, is what gates the scan.

## Verification

**Commands:**
- `npm test` -- expected: exit 0; `fail 0`, `skipped 0`, total at or above the raised `DEFAULT_MIN_TESTS`. **`skipped 0` holds on a POSIX box as a non-root user only.** Eight tests guard on `process.getuid?.() === 0`, and the skip gate landed in the previous batch fails any run with skips unless an allowance says otherwise — so as root the command is `BMAD_DASH_TEST_ALLOW_SKIPS=8 npm test`, and on Windows a different set guards instead. Stated because "skipped 0" as an unqualified expectation makes a root container a policy failure rather than a degraded run.
- `node --test --test-reporter=spec test/cli/suggest.test.ts test/adapters/list.test.ts` -- expected: every matrix row present as a named passing test.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-1-6-fail-with-the-command-that-would-have-worked.md` -- expected: exit 0, no `MISS`. Note the check is one-directional; see the round's DEFER entry on the missing reverse half.
- Manual, from a scratch tree: `node dist/cli/index.js <proj>/_bmad-output --no-open` -- expected: exit 2, stdout empty, stderr proposing `npx bmad-dash <proj> --no-open` (the `unknown` spelling branch, since a direct `node dist/...` invocation is neither npx nor an installed shim), with the path shell-quoted if it needs it.

## Suggested Review Order

**The promise: a command the reader can actually run**

- Start here: the whole story in one function — probe, bound, propose.
  [`suggest.ts:297`](../../src/cli/suggest.ts#L297)
- Spelling decided from how the tool was really invoked; `npx` when unsure, never a wrong bare guess.
  [`suggest.ts:201`](../../src/cli/suggest.ts#L201)
- The flags the invocation already carried survive into the suggestion.
  [`index.ts:355`](../../src/cli/index.ts#L355)

**Bounded, and honest when the bounds bite**

- Four caps, each with the failure it prevents named beside it.
  [`suggest.ts:86`](../../src/cli/suggest.ts#L86)
- A total probe budget, because per-listing caps bound each listing and not the work.
  [`suggest.ts:107`](../../src/cli/suggest.ts#L107)
- One sentence covers truncation and unreadable directories alike — neither disappears.
  [`suggest.ts:142`](../../src/cli/suggest.ts#L142)
- Exclusion is descent-only by decision: an ancestor you stand in is still named.
  [`suggest.ts:264`](../../src/cli/suggest.ts#L264)

**The capability, kept as small as it can be**

- Names only, no content read of any kind — what keeps "unconfined" survivable.
  [`list.ts:90`](../../src/adapters/fs/list.ts#L90)
- `keep` is applied *before* the cap; filtering after it hides the answer.
  [`list.ts:75`](../../src/adapters/fs/list.ts#L75)
- The scoped AD-10 exception, written down rather than left to leak out quietly.
  [`ARCHITECTURE-SPINE.md:127`](../../_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md#L127)

**A marker that leaves its project is not a marker**

- Fourth refusal code: what used to be an uncaught throw and a stack trace.
  [`location.ts:121`](../../src/cli/location.ts#L121)

**Tests — the two fences that decide whether the rules hold**

- AD-9 rule 2: real scan versus inert stub — suggestions differ, served root identical, and zero calls on success.
  [`architecture.test.ts:714`](../../test/architecture.test.ts#L714)
- The unconfined capability reaches exactly one importer, enforced not assumed.
  [`architecture.test.ts:684`](../../test/architecture.test.ts#L684)
- The floor, raised to the observed total.
  [`run-tests.ts:38`](../../scripts/run-tests.ts#L38)
