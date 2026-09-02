---
title: 'Verify and land the deferred-findings cleanup'
type: 'chore'
created: '2026-09-02'
status: 'in-progress'
baseline_commit: 'cef8da80f3cf94a49a0732a90da43bdeba43435a'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An uncommitted 17-file change sits in the working tree, resolving seven review findings from Stories 1.1 and 1.5. The suite is green at 374 and the floor was raised to match, but the largest single piece of it — 75 new lines in `scripts/check-tasks.ts`, the task-ledger honesty guard the project's own standing facts make mandatory — has **no test anywhere**. That script has already failed once by verifying the wrong thing, and its new failure modes (a rebased baseline, a missing `git`, a spec piped from outside a repository, a cwd-dependent path space) are exactly the ones that turn a guard into a no-op that reports success.

**Approach:** Close the verification gap, then land the batch. Write the missing test file for the checker's new behavior, re-run the mutations that `deferred-work.md` already claims were run rather than trusting the claim, raise the floor to the new total, and record what was actually observed.

## Boundaries & Constraints

**Always:** Assert exit **2** (broken check) and exit **1** (real unbacked tick) in the same file, so the separation the new code exists to create is observed rather than assumed. Drive the checker as a spawned child process against throwaway repositories under `os.tmpdir()` — it reads stdin at module scope and cannot be imported. Every mutation run gets recorded with what failed.

**Ask First:** Any change to the *behavior* of the pending diff rather than to its verification. Splitting the batch into more than one commit.

**Never:** Do not touch `_bmad-output/implementation-artifacts/deferred-work.md`'s existing `evidence:` or `summary:` lines — it is append/annotate-only. Do not lower `DEFAULT_MIN_TESTS`. Do not weaken the AD-1 gate to make the new test file pass: `test/` is not scanned, so it needs no allowance.

## I/O & Edge-Case Matrix

Scenarios for `scripts/check-tasks.ts`, driven by piping a synthetic spec into it.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Honest tick, run from repo root | spec ticks a task naming a tracked, modified file | `ok` for that file, exit 0 | N/A |
| Honest tick on an **untracked** file, run from a **subdirectory** | spec ticks a task naming a new untracked file; cwd is a nested dir | `ok`, exit 0 — the two lists share one path space | the regression the fix exists for: this used to print `MISS` and exit 1 |
| Genuine lie | spec ticks a task naming a file the diff never touches | `MISS` and exit **1**, naming the task line | exit 1 is the finding, and must stay distinct from 2 |
| Rebased/absent baseline | `baseline_commit` is a 40-hex sha not in the repo | exit **2**, message names the sha, the repo root, and rebase/amend | not a stack trace, and not exit 1 |
| Repository configuring `diff.relative=true` | same as the honest-tick case, with the config set | `ok`, exit 0 | the `-c diff.relative=false` override is live |
| Not a repository | stdin piped with cwd outside any git repo | exit **2**, reporting the failed git command | no uncaught exception |
| No ticked task names a file | spec has ticks but none carry a path | exit **2** | a checker with nothing to check is a no-op |

</frozen-after-approval>

## Code Map

- `scripts/check-tasks.ts` -- subject under test. `git()` wrapper at :43-61 (exit 2, never 1); `repoRoot` at :82; baseline verification at :86-97 (the only `execFileSync` deliberately *not* routed through `git()`, because it must catch); `changedFiles` at :112-121 (`--full-name` + `-c diff.relative=false`); `tickedTargets` at :130-140 (first backticked token, must contain `/` or `.`); exit 1 at :165.
- `test/tooling/check-tasks.test.ts` -- **new file.** The gap this spec closes.
- `test/tooling/run-policy.test.ts` -- sibling convention, but *imports* pure functions from `scripts/test-run-policy.ts`. Not the pattern to copy here.
- `test/server.test.ts:294-315` -- `startCli`/`stopWith`: the precedent for spawning a real child process and racing a watchdog. `deadline()` at :357 is the reusable timer helper.
- `test/support/gate.ts:24-28` -- `SCANNED_ROOTS = ['src','web','scripts']`; `test/` is deliberately ungated, so the new test may use `node:fs` and `node:child_process` freely.
- `test/architecture.test.ts:106-114` and `:582-588` -- two spot-check enumerations asserting the gate reaches named files. Both name `scripts/run-tests.ts` and one names `scripts/test-run-policy.ts`; **neither names `scripts/check-tasks.ts`**, the only `scripts/` file whose `node:child_process` allowance is load-bearing.
- `scripts/run-tests.ts:32` -- `DEFAULT_MIN_TESTS`, currently 374, matching the observed total exactly.
- Read-only evidence, verified by running git 2.43.0 rather than reasoned about: `ls-files --others` is cwd-relative and `diff --name-only` is repo-relative (so the bug was real); `--full-name` and `-c diff.relative=false` each pin their command repo-relative regardless of cwd and of a repo configuring the opposite; `rev-parse --verify --quiet <sha>^{commit}` exits non-zero for an absent sha. A snapshot of the pending tree is recoverable at `refs/snapshots/pending-cleanup` (`2d265a2`).

## Tasks & Acceptance

**Execution:**
- [x] `test/tooling/check-tasks.test.ts` -- new file covering every row of the I/O matrix, spawning the checker with a piped synthetic spec against throwaway repos -- the honesty guard's 75 new lines are wholly unverified, and its whole value is that it cannot be routed around
- [x] `test/architecture.test.ts` -- add `scripts/check-tasks.ts` to both gate-reach enumerations -- a spot-check that omits the one file the `child_process` allowance is for cannot detect losing it
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the total observed after the new tests land -- never lowered, and it must not lag the suite
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- append a `mutations:` line to each of the five entries already claiming "Mutation-checked", recording the mutation actually re-run and what failed; add an open entry for anything this spec leaves unverified -- the claims were inherited, not observed

**Acceptance Criteria:**
- Given the new test file, when a mutation reverts `--full-name` in `changedFiles` and the checker is run from a subdirectory, then the suite fails.
- Given the new test file, when the baseline-verification block at `scripts/check-tasks.ts:86-97` is deleted, then the suite fails with a differently-named test than the one that catches a genuine unbacked tick — proving 1 and 2 are separately observed.
- Given `npm test`, when it completes, then typecheck, build and the suite all pass and the reported total is at or above the raised floor.
- Given the whole batch, when `scripts/check-tasks.ts` is run against this spec on stdin, then every ticked task names a file the diff since `cef8da8` touches, and it exits 0.

## Spec Change Log

_Empty — no review loopback yet._

## Verification

**Commands:**
- `npm test` -- expected: exit 0; typecheck and build clean; reported total at or above the raised `DEFAULT_MIN_TESTS`, with `fail 0`.
- `node --test --test-reporter=spec test/tooling/check-tasks.test.ts` -- expected: every I/O-matrix row present as a named passing test, none skipped on a POSIX non-root box.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-land-deferred-findings-cleanup.md` -- expected: exit 0, no `MISS`.
- `cd src && node ../scripts/check-tasks.ts < ../_bmad-output/implementation-artifacts/spec-land-deferred-findings-cleanup.md` -- expected: identical verdict to the run from the root. This is the cwd-independence claim, checked on the real repository and not only on a fixture.

**Observed (2026-09-02, git 2.43.0, Node v25.4.0):**
- `npm test` -- exit 0. typecheck and build clean; `tests 384 / pass 384 / fail 0 / skipped 0`. `DEFAULT_MIN_TESTS` raised 374 -> 384.
- `node --test --test-reporter=spec test/tooling/check-tasks.test.ts` -- 10 named tests, all passing, none skipped. Every I/O-matrix row is present; two tests carry a `win32` name-skip (the `git` shim on PATH and the empty-PATH missing-git row), which does not fire on this box.
- Both `check-tasks.ts` runs -- exit 0 from the repository root and, byte-identically, from `src/`.

**Mutations run against the new test file** (each applied, the file re-run, then reverted):

| Mutation to `scripts/check-tasks.ts` | Result |
|---|---|
| `--full-name` dropped from `ls-files` | 9 pass / 1 fail -- `both list commands are pinned repo-relative in the argv the checker issues` |
| `-c diff.relative=false` dropped from `diff` | 9 pass / 1 fail -- same test |
| the baseline-verification block (`:86-97`) deleted | 9 pass / 1 fail -- `a baseline that is not a commit is a broken check, exit 2, naming the rebase`. A *different* test from the exit-1 one, which still passed: 1 and 2 are separately observed. |
| `cwd: repoRoot` removed from both list commands | 7 pass / 3 fail -- `a ticked task naming an untracked file passes from a subdirectory`, `a repository configuring diff.relative=true is overridden, not obeyed`, and the argv test |
| the `targets.length === 0` no-op guard deleted | 9 pass / 1 fail -- `a spec whose ticks name no file at all is a broken check, exit 2` |
| `git()` exiting 1 instead of 2 | 8 pass / 2 fail -- `a spec piped in from outside a repository...` and `a missing git is a broken check...` |

Note on the first two rows: run with `cwd` at the repository root, both flags are *redundant* -- measured, not assumed -- so no black-box run can tell whether they are present. They are observed instead by putting a logging `git` shim on `PATH` and asserting the argv, which is why that test exists and why it is whiter-box than its neighbours. Recorded as an open entry in `deferred-work.md`.
