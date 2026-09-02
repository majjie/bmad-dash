---
title: 'Story 1.5 — Resolve where the project is'
type: 'feature'
created: '2026-09-02'
status: 'done'
baseline_commit: '7ab5955f70c6cdbdf0013db737bf4ac0bc40f068'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The tool takes its target on trust. `assertProjectRoot` checks only that the path is absolute, so a non-existent directory, a file, or any unrelated folder serves happily as a project. Nothing has ever established that the target *is* a BMAD project, and nothing canonicalizes a path — so the identity every later story keys artifacts by does not exist yet.

**Approach:** Recognize the project root in the composition root by the presence of `_bmad` and `_bmad-output`, and pass the resolved location onward. Give the filesystem adapter one canonical path representation and a reading surface that refuses anything outside the permitted root, so later stories inherit both rather than each inventing one.

**Scope note (user decision, 2026-09-02):** reading the project's own configuration for artifact roots (FR-10) is split into its own story, with the parser decision and its measurements already recorded in `deferred-work.md`. Until it lands, artifact roots stay at their documented defaults — a known-wrong state carried deliberately.

## Boundaries & Constraints

**Always:** Resolution happens exactly once, in `src/cli/`, and the result is passed onward — no other module discovers anything. The root is the target path itself, recognized by both markers being present: no walk upward, no walk downward, so nested and sibling roots are unresolvable rather than resolved by precedence. Every path crossing the filesystem adapter is canonicalized on the way in and returned to platform form on the way out; symlinks are resolved before a path is compared or used as identity; case-insensitive filesystems are handled at the adapter rather than assumed away. Reads are confined to the permitted root, checked at the adapter on every read, with no opt-out. `node:fs` stays inside `src/adapters/fs/`, and only its reading surface. Domain code performs no path manipulation and no string comparison of paths.

**Ask First:** Anything that would widen what the tool reads beyond the target project. Any runtime or bundled dependency. Any change to what the tool writes, which remains nothing.

**Never:** No walk in either direction for resolution — the bounded suggestion scan is Story 1.6's. No tree walk, cycle detection or dangling-link handling: split to its own story. No reading the project's configuration, and therefore no YAML: the configured project name and the configured artifact roots both belong to the split-off story, so the header keeps deriving its name from the path. No inventing an artifact-root abstraction with one member to look ready for that story. No writing, and no `fs` call outside the reading surface. No caching of resolution outside the process.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| A BMAD project | target holds both markers | resolves; the canonical root is passed onward and served | N/A |
| One marker missing | only `_bmad`, or only `_bmad-output` | not a project; reported naming the path and both markers | exits 2, binds nothing |
| Neither marker | an ordinary directory | same report, naming both markers | exits 2, binds nothing |
| Target absent | the path does not exist | reported naming the path and that it does not exist | exits 2 |
| Target is a file | a path to a regular file | reported as not a directory, distinctly from absent | exits 2 |
| Marker is a file | `_bmad` exists but is a file | not a project — a marker must be a directory | exits 2 |
| Nested root | the target's parent is also a project | the target resolves; the parent is never consulted | N/A |
| Symlinked target | reached through a link | canonicalized once; the real path is what is used and shown | N/A |
| Case-different paths | `/Foo` and `/foo` where the filesystem does not distinguish | one identity, not two | N/A |
| Read outside the root | any path resolving beyond the permitted root | refused before the read, naming the path | throws; nothing read |
| Unreadable directory | permissions deny the marker check | reported as unreadable, distinctly from absent | exits 2 |

</frozen-after-approval>

## Code Map

Stories 1.1–1.4 are done and pushed. 320 tests, zero dependencies, `HEAD` at `7ab5955`.

- `src/adapters/fs/realpath.ts` -- the adapter's only member and the tree's only `node:fs` importer. `resolveRealPath` is the canonicalization primitive everything here builds on; it gains siblings.
- `src/render/chrome.ts:92` -- `assertProjectRoot` checks absoluteness only. Its own comment records existence and canonicalization as this story's, and `deferred-work.md` carries the matching entry to retire.
- `src/cli/index.ts:101` -- `parseInvocation` resolves the target to an absolute path and checks nothing further. Recognition belongs beside it, in the composition root, and must run **before** the bind so a non-project never opens a socket.
- `src/cli/index.ts:395` -- where `start` is called, and the seam the resolved location has to cross to reach render.
- `src/adapters/http/server.ts:63` -- `StartServerOptions.projectRoot`, a bare string, becomes the resolved location.
- `test/architecture.test.ts` -- the AD-1 gate: `node:fs` confined to `src/adapters/fs/`, **reading operations only**, `src/domain/` frozen at zero outgoing imports. The reading surface grows here for the first time, so the operation half of that gate stops being theoretical.
- `test/cli-entry.test.ts` -- spawns the built CLI against temporary directories already; the fixture helpers are the reuse point for a real not-a-project invocation.
- `scripts/run-tests.ts:32` -- `DEFAULT_MIN_TESTS` is 320 and must rise.

To create:

- `src/adapters/fs/paths.ts` -- canonical representation, comparison, containment
- `src/adapters/fs/read.ts` -- the reading surface, confined to the permitted root
- `src/cli/location.ts` -- recognize the root; the resolved type passed onward
- `test/adapters/paths.test.ts`, `test/adapters/read.test.ts`, `test/cli/location.test.ts`

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/fs/paths.ts` -- canonicalize in, platform form out, plus comparison and containment a case-insensitive filesystem cannot fool -- AD-14
- [x] `src/adapters/fs/read.ts` -- reading operations only; every path canonicalized and confinement-checked before the read, with no way for a caller to skip it -- AD-10, NFR-1
- [x] `src/cli/location.ts` -- recognize the root by both markers being directories; distinguish absent, not-a-directory and unreadable; resolve once and return the canonical root -- FR-70, AD-9
- [x] `src/cli/index.ts` -- resolve before binding; a target that is not a project exits 2 naming the path and both markers, and binds nothing -- FR-70
- [x] `src/adapters/http/server.ts` -- carry the resolved location rather than a bare string, so no later module re-derives it -- AD-9
- [x] `test/adapters/paths.test.ts` -- canonicalization, symlink resolution and case behaviour against real temporary directories, not simulated ones -- AD-14, NFR-12
- [x] `test/adapters/read.test.ts` -- the confinement refusal, including a path that escapes via `..` and one via a symlink pointing outside -- AD-10
- [x] `test/cli/location.test.ts` -- every recognition row in the matrix, each distinguishable from the others by its message -- FR-70
- [x] `test/cli-entry.test.ts` -- a real invocation against a real project serves and shows the canonical root; one against a directory with a single marker exits 2 and binds nothing, asserted by attempting a connection -- AD-9
- [x] `test/architecture.test.ts` -- extend the mutating-operation denial to whatever the reading surface adds, so the operation half of AD-1 covers the new file -- NFR-1
- [x] `scripts/check-tasks.ts` -- check a spec's ticked tasks mechanically against the files the diff touches -- *added in loop 1; two ticks in this very spec were false*
- [x] `test/adapters/realpath.test.ts` -- pin the native resolver, whose distinguishing behaviour is unobservable on a case-sensitive volume -- *added in loop 1* -- AD-14
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS`

**Acceptance Criteria:**
- Given a directory holding both markers as directories, when the tool starts, then it serves and the page shows the canonical root; given either marker missing, absent, or a file, then it exits 2 naming the path and both markers, and nothing accepts a connection.
- Given the same directory reachable by two paths — through a symlink, or differing only in case where the filesystem does not distinguish — when each is resolved, then both yield the identical canonical root.
- Given any path that resolves outside the permitted root, when a read is attempted, then the adapter refuses before touching the filesystem and names the path.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm test` -- expected: all pass, none skipped, floor raised
- `npm run build && node dist/cli/index.js --no-open` -- expected: serves this project
- `node dist/cli/index.js --no-open /tmp` -- expected: exits 2 naming `/tmp` and both markers; nothing bound
- `npm pack --dry-run` -- expected: `dist/`, `LICENSE` and metadata only; still three files

## Design Notes

**Case is settled by asking the volume, not by folding it.** `canonical` resolves through `realpathSync.native`, which defers to the platform's own resolver and returns the casing actually stored on disk. That is what makes `identical` byte equality — a case-insensitive volume returns the same bytes for `/Foo` and `/foo`, and a case-sensitive one correctly returns different bytes for two directories that really do differ only in case. A `toLowerCase` comparison would undo that and start reporting two real directories as one. Verified empirically that `.native` exists, resolves symlinks, and returns the stored spelling; **this machine's filesystem is case-sensitive, so the case-insensitive branch is not observable here** — the test detects the volume's behaviour and asserts whichever answer is correct for it, rather than hardcoding an expectation that would silently never run.

**Containment is computed with `relative`, not by prefix.** A prefix test says `/home/jamie/project-other` is inside `/home/jamie/project`. Both arguments are canonical by the time they arrive, so a `..` segment or a symlink out of the tree has already been resolved away and cannot pass by virtue of its spelling — which is the whole reason canonicalization happens first.

**`absent` and `unreadable` are separate answers throughout.** A directory the tool is denied is not a directory that is not there, and collapsing them sends a reader looking for a missing folder they actually just cannot read. Both directions of that conflation were mutation-tested.

**Recognition happens before the socket.** A target that is not a project must bind nothing, so resolution runs before the shutdown handler is even registered — there is nothing to shut down. It is also the first thing in the run that touches the filesystem.

## Spec Change Log

### Loop 1 — bad_spec, patched in place (user decision)

- **Trigger:** three reviewers. The headline was not in the code. **Two ticked tasks were never done** — `src/adapters/http/server.ts` and `test/architecture.test.ts` were both marked complete while neither file appeared in the diff, and `projectRoot` was still a bare `string`. A third false claim was in the Design Notes: "both directions of that conflation were mutation-tested" — only the marker direction was, because `stat` on a `0o000` directory succeeds, so the test that appeared to cover an unreadable *target* actually exercised the marker branch, and deleting the target branch left the suite green.
- **Root cause was the act of verifying.** I wrote a verification pass and it checked **proxies** rather than the task lines: for the server task it grepped `src/cli/index.ts` — a different file — for an adjacent-looking string, and passed. A grep chosen after the fact tends to confirm what its author already believes. This is the same asserted-rather-than-observed failure the project keeps hitting, one story after `TASK LEDGER HONESTY` was written into the standing facts, applied to the checking of my own ticks.
- **So the fix is mechanical, not a resolution to try harder.** `scripts/check-tasks.ts` parses a spec's ticked task lines for the file each names and compares that list against the files the diff since `baseline_commit` actually touches. It caught both false ticks immediately, and the standing fact now requires it before any spec's tasks are marked complete. It reads the spec from **stdin** rather than opening it — the first version imported `readFileSync` and the AD-1 gate refused it, correctly, since `scripts/` may reach `node:child_process` but not `node:fs`. Taking the text on stdin left the architecture rule where it was instead of widening it for tooling.
- **The seam is now structural.** `StartServerOptions.projectRoot` is a `CanonicalPath`, not a string, so handing over the raw argument is a compile error rather than something one end-to-end test stood between and shipping. That surfaced 25 type errors across the suite, which is the measure of how many call sites were passing unverified strings.
- **Behavioural defects fixed:** `canonical` did not normalize an absolute path, so `/tmp/nope//a/./b/../c` came back verbatim and one absent path had as many identities as spellings; `contains` treated `..foo` and `...` as escapes and rejected legitimate children; `readText`'s comment claimed it returned a decode failure while `readFileSync(p, 'utf8')` is lossy and substitutes U+FFFD — it now decodes with `fatal: true`, which is what Story 1.9 needs to exist; a fifo inside a project would have blocked the server forever, so the file kind is checked before the read; a permissions failure exited 2 as though the invocation were mistyped, and now exits 1; and the `Location` failure carried prose only, so Story 1.6 would have had to pattern-match English to know which refusal it was suggesting for.
- **Unconsumed surface removed.** `resolveLocation` returned a `ConfinedReader` that nothing used. That is the same shape as `projectRoot`, `--port` and `.project-refresh` before it, so it is withheld until the story that reads artifacts has a caller for it.
- **Verification gaps closed:** the native resolver is pinned by source assertion, because the behaviour that distinguishes it from the JS one is unobservable on a case-sensitive volume and swapping them passed all 357 tests; the `Target:` stderr line is asserted through a symlink, since reverting it to the raw argument was also silent; the gate is asserted to actually *scan* the files it claims to cover, and gutting `SCANNED_ROOTS` now fails 25 tests where before it would have turned every "no violations" rule green.
- **Known-bad state avoided:** a story whose ledger said it had made a seam structural when it had not, shipping a reading surface that guesses at binary files, hangs on a fifo, mis-normalizes absent paths, and rejects directories whose names begin with two dots.
- **KEEP — earned here:** the branded `CanonicalPath` and its use at the server seam; canonicalization through the platform's own resolver so byte equality is correct without folding case; containment computed with `relative` on segment boundaries; `absent`, `unreadable` and `not-a-directory` as separate answers with separate exit codes; the refusal messages being mutually distinct, asserted as a set; `check-tasks.ts` as a stdin filter; and the fixture in `test/support/project.ts`, which is what let the CLI's contract change without twenty tests inventing their own idea of a project.

## Verification results

Seven mutations, all failing against the suite: `canonical` no longer normalizing absolute paths (1), `contains` rejecting `..foo` again (1), the JS resolver in place of the native one (1), a lossy UTF-8 decode (1), dropping the file-kind check (**hangs rather than fails** — `readFileSync` on a fifo waits for a writer that never comes, which is the defect the check prevents and is recorded here rather than dressed up as a clean failure), collapsing the unreadable exit code back to 2 (1), and deleting the unreadable-target branch (1).

Gutting `SCANNED_ROOTS` fails 25 tests. `scripts/check-tasks.ts` reports every ticked task backed by a file the diff touches.
