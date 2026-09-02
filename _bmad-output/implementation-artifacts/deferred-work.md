## Keys

One entry per finding. What is still open comes first — the block below, then
each `## Deferred from:` heading in the order the rounds happened — and
`## Resolved and closed` is last. Every entry carries `source_spec` and
`summary`; everything carried over from a review also carries `evidence`. The
rest are optional annotations, and every one of them is **append-only** — this
file exists so nothing is lost, so a claim that turns out to be wrong is struck
in place and corrected beside itself rather than edited away:

| Key | Required | What it holds |
|---|---|---|
| `source_spec` | yes | the spec the finding came from, or `none` when it was split out of planning |
| `summary` | yes | what is wrong, in the reviewer's terms |
| `evidence` | on review findings | where it was confirmed, and why it was deferred rather than fixed |
| `original` | no | the superseded text of a `summary`/`evidence` that has since been corrected, verbatim |
| `revisit` / `triggers` | no | the story or condition that makes it due |
| `findings_already_measured` | no | a decision taken during planning that the next story should not redo |
| `closed` | no | how it ended: RESOLVED, SUPERSEDED, or CLOSED BY DECISION, with the date |
| `mutations` | no | the mutation actually re-run against a resolution's test, and what failed |
| `correction` | no | what a `closed:` or `mutations:` line above got wrong, dated, left standing beside it |

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: The served page carries no hardening headers (nosniff, CSP, Referrer-Policy), and DNS-rebinding defence rests on Host alone with no Origin or Sec-Fetch-Site check.
  evidence: Real but premature — the page is a constant string today. Becomes load-bearing the moment Stories 1.12 and 2.1 render project content into it, and AD-19's rationale already anticipates the browser as the threat vector.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: The AD-1 gate does not cover ungated escape hatches to the filesystem (`node:module`, `node:worker_threads`, `node:vm`) or any outbound-network module, despite NFR-11 forbidding outbound requests entirely.
  evidence: A reviewer noted the gated set is narrower than the read-only, no-telemetry claim it enforces. Expanding the gate's remit is a scope decision rather than a patch, and gating network modules would also cover NFR-11, which currently has no automated enforcement anywhere. Postponed by the user with eyes open.
  revisit: Before Story 1.7, when markdown-it and yaml arrive. The gate reads source specifiers, so once a runtime dependency exists it could reach the network with nothing for the gate to see — a hole the gate cannot close retroactively. NFR-11 remains the only NFR with no automated enforcement until then.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: No socket-level limits configured — requestTimeout, headersTimeout, keepAliveTimeout, maxConnections all default — on a server the user leaves running all day.
  evidence: A reviewer noted this is also the knob that bounds the shutdown problem. Real, but a tuning decision rather than a defect in this story.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: `errorCode()` is duplicated across the adapter and the CLI, and several test helpers are re-implemented across test files.
  evidence: Roughly 80 duplicated lines with drift risk. Cleanup, not correctness; deferred so it does not compete with the correctness work in this story.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: Repository hygiene, consolidated: no README, no `keywords` in package.json, no CI workflow, no lint or format config, and no coverage instrumentation.
  evidence: Consolidates three overlapping entries recorded 2026-09-01, whose combined text is superseded by this one. Verified 2026-09-02: `.gitignore`, `LICENSE`, `license`, `author`, `repository` and a committed lockfile all now exist, so those parts are done and were making the list look longer than it is. What is genuinely absent is the five above. CI is the load-bearing one — nothing automated runs `tsc --noEmit` or the suite outside a contributor's own machine, and three review rounds each found gaps a green local suite could not see. It is not a pure win: it needs a decision on the OS and Node matrix. Note for whoever writes it — a CI container running as root now reports four *named skips* rather than an all-green suite (fixed 2026-09-02), so the run's `skipped` count is a signal worth failing or warning on.

## Deferred from: code review of spec-1-1-run-the-command-and-reach-a-served-page (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: `process.cwd()` is called unguarded at `src/cli/index.ts:128`, so a deleted working directory throws ENOENT and produces a stack trace instead of a clean exit 1.
  evidence: Found by the edge-case reviewer. Exotic — it needs the cwd to be removed between shell prompt and invocation — and unrelated to this story's subject, but it is the one place the CLI touches the process environment without a guard while every other such touch (EPIPE, signals, argv) has one.

  note: Four other findings from this review were already recorded above and were not duplicated — the ungated networking modules, the missing hardening headers and socket timeouts, the `errorCode` duplication, and repository hygiene. The hygiene entries are now partly stale: `.gitignore`, `LICENSE`, and the `license` and `author` fields all exist, and a lockfile is committed. What remains absent is a README, `repository`/`keywords`, CI, lint/format config and coverage.

<!-- Story 1.1 code review, 2026-09-01: 27 findings. 3 high + 3 gate-related medium fixed;
     the 21 below deferred by decision so 1.1 could close. Locations preserved verbatim. -->

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) The request target is parsed with `split('?')`, not `new URL(..., base)`
  evidence: From the 2026-09-01 code review, located and verified there. Full text: The request target is parsed with `split('?')`, not `new URL(..., base)` [src/adapters/http/server.ts:329] — verified against the running compiled server: an RFC 7230 §5.3.2 absolute-form request, `GET http://127.0.0.1:<port>/ HTTP/1.1`, returns 404 instead of the page; percent-encoded and normaliza

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) Rejected request bodies are not drained
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Rejected request bodies are not drained [src/adapters/http/server.ts:319, 325, 337] — no `request.resume()`, `request.destroy()` or body consumption anywhere in the module; the 403, 405 and 404 paths all respond and return with the stream unread. Current Node absorbs it, so nothing in the suite noti

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) `Host` and `url` are not composed in bracketed form for IPv6
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `Host` and `url` are not composed in bracketed form for IPv6 [src/adapters/http/server.ts:128, 235] — for an IPv6 bind these produce `::1:8080` and `http://::1:8080/`; the correct authority is `[::1]:8080`, so every request would be 403'd and the URL would be unusable. Unreachable today because `LOO

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) `process.exit()` is used where the task line requires `process.exitCode`
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `process.exit()` is used where the task line requires `process.exitCode` [src/cli/index.ts:117, 247] — both fire immediately after a `stderr(...)` write, and pipe writes are asynchronous, so `bmad-dash --bogus 2> file` can lose the diagnostic. At line 247 no server is running, so the change is safe;

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) `close()` latches rejections as well as successes
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `close()` latches rejections as well as successes [src/adapters/http/server.ts:219] — `closing ??=` caches a rejected promise, so a transient close failure makes every later `close()` reject forever and the cached rejection can surface as an unhandled rejection. Only the success path is tested. Clea

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) The two "repeated signal" tests never deliver a second signal
  evidence: From the 2026-09-01 code review, located and verified there. Full text: The two "repeated signal" tests never deliver a second signal [test/server.test.ts:955-974] — `stopWith` (`test/server.test.ts:271`) kills only `if (child.exitCode === null && child.signalCode === null)`, and the first call resolves on `close`, after `exit` has set `exitCode`. Measured: first call d

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) `identify()`'s 600ms timeout makes a security-relevant negative assertion pass vacuously
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `identify()`'s 600ms timeout makes a security-relevant negative assertion pass vacuously [test/server.test.ts:118] — a slow-but-reachable responder is classified `unreachable`, so "unreachable on every non-loopback interface" can pass for the wrong reason on a loaded host; interfaces are also probed

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) `startup-order.test.ts` reports a 15s hang as the race defect it exists to detect
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `startup-order.test.ts` reports a 15s hang as the race defect it exists to detect [test/cli/startup-order.test.ts:145-152] — the timeout path resolves `{ code: null, signal: 'SIGKILL' }`, which lands in `killed` and is reported as "the readiness announcement raced the handler registration". The chil

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) `run-tests.ts` calls `process.exit()` after writing the failure message, truncating the very output that message asks the reader to inspect
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `run-tests.ts` calls `process.exit()` after writing the failure message, truncating the very output that message asks the reader to inspect [scripts/run-tests.ts:40, 46, 65, 79] — it mirrors every child stdout chunk to its own stdout, then exits from the `close` handler; when stdout or stderr is a p

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) `test/cli-entry.test.ts` errors rather than skips where symlink creation needs elevation
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `test/cli-entry.test.ts` errors rather than skips where symlink creation needs elevation [test/cli-entry.test.ts:204, 218, 233-234] — no `skip` appears anywhere in the file; every symlink test calls `await symlink(...)` bare. On Windows without Developer Mode or elevation this throws `EPERM` and rep

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `readTotal` is coupled to the reporter's `ℹ` glyph, and counts subtests rather than test files. **The CRLF half of this finding was wrong and has been struck** — see evidence.
  original: Restored verbatim 2026-09-02 at the user's decision, because the no-loss contract has to hold inside this file and not only in git history. The correction below stands — the CRLF half really is wrong — but the text it corrected is this: "summary: (low) `readTotal` requires the `ℹ` glyph and a bare `\n`" / "evidence: From the 2026-09-01 code review, located and verified there. Full text: `readTotal` requires the `ℹ` glyph and a bare `\n` [scripts/test-run-policy.ts:84] — `/^ℹ tests (\d+)$/gm` fails on a CRLF reporter line or a re-encoded stream, turning a green suite into "could not determine how many tests ran". It also counts subtests, so the floor measures something different fro" (the review's own text was truncated there when it was first recorded).
  evidence: From the 2026-09-01 code review. Re-examined 2026-09-02 while clearing easy wins. The original claimed `/^ℹ tests (\d+)$/gm` "fails on a CRLF reporter line", which is false: under `/m` JavaScript treats `\r` as a line terminator, so `$` matches before it. Measured on all three of `\n`, `\r\n` and bare `\r` — every one matches, with and without a `\r?`. A "fix" was written, found to be a no-op whose test passed either way, and reverted; `test/tooling/run-policy.test.ts` now pins the real behaviour as a characterization test so nobody re-fixes it. What remains genuinely open is the other half: the match depends on the reporter emitting `ℹ tests <n>`, so a reporter change turns a green suite into "could not determine how many tests ran" — which is the safe direction but still a coupling — and the count includes subtests, so the floor measures something other than the number of test files. Inert today: the suite reports `suites 0` and uses no subtests.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `engines: ">=22"` is unsatisfiable for AC1's own command
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `engines: ">=22"` is unsatisfiable for AC1's own command [package.json:12-14] — `npm test` runs `node scripts/run-tests.ts` and discovers `test/**/*.test.ts`, both needing unflagged type stripping (Node ≥ 22.18). The mismatch is documented only in a `"//"` string (`package.json:7`) that no tool read

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) Cross-pipe ordering on the three `Target:` assertions
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Cross-pipe ordering on the three `Target:` assertions [test/server.test.ts:743, 756, 767] — `startCli` resolves on the first newline on **stdout**, then the test reads accumulated **stderr**. The child writes `Target:` first (`src/cli/index.ts:173`), but delivery order across two separate pipes to t

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-establish-the-visual-foundation.md`
  summary: (low) The contrast tests recompute the ratios DESIGN.md states and the pairings the system uses today, but nothing enumerates the *unused* pairings — a future story combining, say, `on-surface-faint` with a hover surface would get no warning until someone audits by hand.
  evidence: From the Story 1.2 review, 2026-09-01. Deferred rather than fixed because the full cross-product of 24 colours is 276 pairs, most of them meaningless, and asserting a threshold on pairs the design never uses would produce failures that are not defects. The right shape is a declared pairing table that Story 1.3 extends as it introduces surfaces — worth doing when there is more than one component to declare.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-build-the-components-every-surface-reuses.md`
  summary: (medium) Build `src/adapters/git/` and the git-availability probe that the project header reports, replacing the `Not checked` state Story 1.3 ships with.
  evidence: Split from Story 1.3 at the step-1 multi-goal check, 2026-09-01, by user decision. Two reasons. (1) It is the first and only consumer of `node:child_process` in the tree, governed by AD-16 — reporting commands only, optional locks disabled so no `.git/index` can be rewritten, and `core.fsmonitor` neutralized by explicit command-line override — which is the most security-sensitive code in the project so far and deserves a review round of its own rather than sharing one with tile padding and header markup. (2) `unchecked` is already a legitimate member of the four-state signal vocabulary, meaning "not examined at this altitude", so the header reports honestly in the meantime instead of carrying a placeholder that must later be found and removed. Also unblocks nothing: no Epic 1 story before 3.1 consumes git.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-build-the-components-every-surface-reuses.md`
  summary: (medium) `.tile-grid` ships `display: grid` with `grid-template-columns: 1fr`, so tiles stack in one column at every width. The dashboard's actual column behaviour and the 900px collapse are UX-DR22.
  evidence: From the Story 1.3 review, 2026-09-01. Not built here because a `minmax()` track needs a tile-width token the system does not define, and inventing one would put a value in the stylesheet that DESIGN.md does not carry — the exact thing the token rule forbids. The rule is commented as deliberately single-column so it does not read as finished. Story 1.12 is the first story with more than one tile to place, and is where the columns and the breakpoint belong.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-build-the-components-every-surface-reuses.md`
  summary: (low) `REFRESH_HREF` is hardcoded to `/`, so the header's refresh control will navigate to the Dashboard rather than re-requesting the current surface once other surfaces exist.
  evidence: From the Story 1.3 review, 2026-09-01. Correct today — the Dashboard is the only surface — and wrong the moment UX-DR15 adds a second. The fix is to pass the current surface's path into `projectHeader`, which is a one-parameter change best made by the story that creates the second surface, since that story can actually test it.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-build-the-components-every-surface-reuses.md`
  summary: (low) `TileContent.html` is emitted verbatim while every other string in the render layer is escaped, so a caller passing project-derived text rather than composed markup would inject.
  evidence: From the Story 1.3 review, 2026-09-01. Now documented on the type and honoured at the only call site, which escapes before passing. A stronger fix is a branded `SafeHtml` type that only `escapeHtml` and the component builders can produce, making the unsafe path unrepresentable rather than merely documented — worth doing when there is more than one component composing another.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-establish-the-visual-foundation.md`
  summary: (low) RE-DEFERRED from Story 1.2 — the declared contrast pairing table that 1.2's entry said "Story 1.3 extends as it introduces surfaces" was not extended by Story 1.3.
  evidence: Re-recorded 2026-09-01 rather than left as a silently unmet trigger. Story 1.3 introduced three header pairings, all of which reuse colours the existing structural tests already sweep across the whole tonal ladder — `on-surface-variant` on every ladder level, which covers `.project-path` and `.project-signal`. So no new *pairing* went unchecked, and building the declared table would have been ceremony. The trigger stands for the first story that introduces a colour pairing the ladder sweep does not already cover.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-open-the-browser-but-never-depend-on-it.md`
  summary: (low) A repeated flag silently takes the last value — `--port 3000 --port 4000` binds 4000, and nothing warns. `parseArgs` is not configured with `multiple`, and the help text does not say last-wins.
  evidence: From the Story 1.4 review, 2026-09-01, verified against the built CLI. Left as-is because last-wins is the conventional shell behaviour and a reader who typed a flag twice most likely meant the second; making it an error risks refusing an invocation assembled by a wrapper script that appends a default. Worth revisiting if a flag ever gains a value where silently taking the last is dangerous rather than merely surprising.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-open-the-browser-but-never-depend-on-it.md`
  summary: (low) The help text documents no exit codes, and does not mention that `--` ends option parsing — so `bmad-dash -- --no-open` resolving a path literally named `--no-open` is undiscoverable from the tool itself.
  evidence: From the Story 1.4 review, 2026-09-01, both verified. The CLI deliberately distinguishes exit 2 (you typed it wrong) from exit 1 (it could not start), which is useful to a script author and currently documented nowhere. Deferred rather than added now because the right place is probably a `--help` section that grows with the flag surface, and the surface is four flags old.

- source_spec: none
  summary: (high) Build the safe artifact-tree walk — cycle-detecting directory traversal in which symlinks are resolved before confinement is checked and before identity is keyed, a link inside the tree pointing outside it cannot pass confinement, the same file reachable two ways does not appear as two artifacts, and a dangling link is reported rather than crashing the listing. Should land as its own story immediately before Story 1.7.
  evidence: Split from Story 1.5 at the step-1 multi-goal check, 2026-09-02, by user decision. Story 1.5's second paragraph specifies these as properties of "the walk" and "the listing", but no story in Epic 1 builds an enumerator — 1.7 identifies artifacts and 1.9 refers to "crashing the walk", so both assume one already exists. Carved out rather than folded into 1.5 because the walk's failure modes (cycles, dangling links, permission errors, case-insensitive collisions) are a different kind of risk from config parsing and root resolution, and pairing them in one review round is the shape that produced three consecutive bad_spec loops. Blocking for Story 1.7, which is its first real consumer.

- source_spec: none
  summary: (high) Read the target project's own configuration to locate artifact roots (FR-10) — `_bmad/bmm/config.yaml` and its user override — substituting `{project-root}`, admitting each resolved root to the permitted-root set only after an out-of-tree check, and reporting a malformed config rather than partially applying it. Should land as its own story before Story 1.7, alongside the safe tree walk.
  evidence: Split from Story 1.5 at the step-1 checkpoint, 2026-09-02, by user decision, because the narrowed 1.5 (root resolution, canonical paths, reading surface) is already at the token ceiling. Until this lands the artifact roots stay at their documented defaults, which is a known-wrong state carried deliberately — FR-10 exists precisely because a project may put them elsewhere.
  findings_already_measured: The parser decision was made and verified during 1.5 planning, so the next story should not redo it. `yaml@2.9.0` (ISC, no dependencies of its own, ships types) is to be a **devDependency bundled by esbuild**, not a runtime dependency — user decision, and the architecture spine records why. Measured: its node export is CommonJS and dynamically requires `process` and `buffer`, so an ESM bundle throws `Dynamic require of "process" is not supported` at import unless the build carries a banner such as `--banner:js='import{createRequire as __cr}from "node:module";const require=__cr(import.meta.url);'`. With that banner, parsing of flat scalars, one level of nesting and inline sequences is correct; the only dynamic requires in the output are those two builtins; and there is no `node:http`, `node:https`, `node:net`, `node:fs`, `node:child_process` or `fetch` anywhere in it. The bundle grows from about 34KB to about 264KB. `LICENSE-THIRD-PARTY` carrying yaml's ISC text must ship, taking the tarball from three files to four. Measured shapes it must handle: `config.yaml` is flat `key: scalar`; `sprint-status.yaml` has one level of nesting; artifact frontmatter has scalars and inline sequences.
  triggers: NFR-11's deferred automated enforcement comes due with this story, not before — a gate that reads source specifiers proves nothing once third-party code executes at runtime, so it must assert against `dist/` instead.

## Deferred from: review of the deferred-findings cleanup batch (2026-09-02)

Found while verifying the batch that put `scripts/check-tasks.ts` under test.
The first two were opened by that work; the three `tickedTargets` entries came
out of the review round on it and are deferred by decision, not by omission.

- source_spec: `_bmad-output/implementation-artifacts/spec-land-deferred-findings-cleanup.md`
  summary: (low) The stale-`.js` guard is still scoped to `src/`, so a compiled leftover under `scripts/` or `web/` is invisible to it — `test/architecture.test.ts:134-138` filters `file.startsWith('src/')` while the gate scans three roots.
  evidence: Found 2026-09-02 while re-verifying the closed "Stale `.mjs` references" entry, whose closing note claims this consequence "no longer exists in the code". It does. The premise that justified the scoping ("`scripts/` is plain `.mjs` tooling") was deleted from the comment; the scoping itself was left. Harmless today because `scripts/` holds three `.ts` files and `web/` is empty, and it is a one-token change — but it is a guard narrower than the invariant it is named for, which is the shape of defect this list keeps recording.

- source_spec: `_bmad-output/implementation-artifacts/spec-land-deferred-findings-cleanup.md`
  summary: (low) `changedFiles` in `scripts/check-tasks.ts` carries two latches for one invariant, and only one of them is observable end to end: `--full-name` and `-c diff.relative=false` are both redundant while the commands also run with `cwd: repoRoot`.
  evidence: Measured 2026-09-02 with git 2.43.0 while writing `test/tooling/check-tasks.test.ts`, not reasoned about. Run at the repository root, `ls-files --others` and `diff --name-only` are already repo-relative, so reverting either flag changes no verdict from any cwd — the spec's acceptance criterion for that mutation cannot be met by a black-box run. It is met instead by `both list commands are pinned repo-relative in the argv the checker issues`, which puts a logging `git` shim on PATH and asserts the argv. That test earns its keep (removing `cwd: repoRoot` *is* caught end to end, by two other tests, so the flags are the half that could vanish silently) but it is a whiter box than the rest of the suite. Two of its rows — the shim and the empty-PATH missing-git row — name-skip on `win32`, so the flag pinning and the ENOENT branch of `git()` are unverified on Windows. Comes due with the CI matrix decision in the "Repository hygiene, consolidated" entry.

- source_spec: `_bmad-output/implementation-artifacts/spec-land-deferred-findings-cleanup.md`
  summary: (medium) `tickedTargets` in `scripts/check-tasks.ts` treats any leading backticked token containing a `.` as a path, so a task line that leads with an identifier — `` `t.skip` ``, `` `Promise.race` ``, `` `diff.relative=false` `` — is checked as a filename, misses, and exits 1 on honest work.
  evidence: Found 2026-09-02 in the review of the batch that put the checker under test. The heuristic is "first backticked token, if it contains `/` or `.`", which cannot distinguish `src/a.ts` from `a.b`. This project's own task lines lead with a path by convention, so it is latent rather than live — but the failure it produces is the false accusation the checker's whole value depends on not producing, and the false accusation is what teaches a reader to stop trusting the guard. **Deferred rather than patched, deliberately:** every tightening trades one error for the other. Requiring a `/` misses a ticked `package.json` or `README.md` at the root; requiring a known extension needs a list that will be wrong; asking git whether the token is a path makes the heuristic depend on the diff it is checking against. Choosing among those is a decision about which error to prefer, and it should be made once, on purpose, rather than inside a cleanup batch.

- source_spec: `_bmad-output/implementation-artifacts/spec-land-deferred-findings-cleanup.md`
  summary: (medium) `tickedTargets` matches only unindented, lowercase `- [x] `, so a nested sub-task or a `- [X] ` tick is invisible to the guard — it reports "every ticked task names a file the diff touches" without having looked at them.
  evidence: Found 2026-09-02 in the same review. `line.startsWith('- [x] ')` fails on `  - [x] ` and on `- [X] `, both of which render as a ticked checkbox in every markdown tool and both of which a human will write. This is precisely the "a checker that finds nothing to check has become a no-op" shape the file's own header names as its reason to exist — and worse than the no-op case, because the `targets.length === 0` guard only fires when *nothing* matched: a spec with one top-level tick and six indented ones passes with one checked. Deferred with the entry above because the two share the parser and should be fixed in one pass.

- source_spec: `_bmad-output/implementation-artifacts/spec-land-deferred-findings-cleanup.md`
  summary: (low) The baseline-verification block in `scripts/check-tasks.ts` runs `rev-parse --verify` with `stdio: 'ignore'`, so *any* failure is reported as "Rebased or amended since the spec was written?" — including an unreadable `.git`, a corrupt object database, or a sha that names a tree rather than a commit.
  evidence: Found 2026-09-02 in the same review. The message sends the reader to edit the spec's frontmatter when the actual fault is in the repository, which is the same class of misdirection the `git()` wrapper's exit-2 separation exists to prevent — one level finer. Low because a rebased baseline really is the overwhelmingly common cause and the exit code (2, a broken check) is correct either way; the fix is to capture stderr and include it, which is a small change to a block that currently has a deliberate reason to `catch`.


## Resolved and closed

Kept verbatim rather than deleted — this file exists so nothing is lost, and a
resolved finding is evidence about what this project gets wrong. Moved here on
2026-09-02 so the list above is only what is actually open: it had 43 entries,
of which 15 were already closed, superseded, or triple-recorded.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: RESOLVED 2026-09-01 by Story 1.4 — `--help`, `-h` and `--version` are implemented and exit 0, the help text is reachable on request rather than only by error, and FR-6's flag is named `--no-open`. The deferral test in test/server.test.ts was inverted to assert the new behaviour. Original: No `--help`, `-h` or `--version`; all three exit 2 as unknown arguments and the USAGE string is reachable only by error.
  evidence: Reviewers confirmed `parseArgs` runs strict with an empty options map. A published CLI with no --version is hard to support. FR-6's suppression flag is also still unnamed in the PRD.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: RESOLVED 2026-09-01 by Story 1.4 — `--port <n>` is exposed, validated as a plain decimal integer in range, passed to the server, and a fallback to an OS-assigned port is now reported rather than silent. This also makes the port-80 `Host` allowance and the bind-retry path reachable outside tests, which was the reason for exposing it. Original: (medium) Expose `--port <n>` on the CLI
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Expose `--port <n>` on the CLI [src/cli/index.ts:54-89, 161] — resolves the decision above. Add a `port` option to the `parseArgs` call (strict, so an unknown flag still exits 2), validate it as an integer in `0..65535` and exit 2 naming the value and the range on failure, pass it into `start(...)`,

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-build-the-components-every-surface-reuses.md`
  summary: RESOLVED 2026-09-02 by Story 1.5 — the CLI now recognizes its target before binding: existence, directory-ness, both markers and readability are all checked, each with a distinguishable message, and the root is canonicalized through the platform's own resolver so a symlinked or differently-cased target yields one identity. Original: (medium) `assertProjectRoot` checks that the root is a non-empty absolute path, but not that it exists, is a directory, or is canonical — so a non-existent path renders as a project, and a symlinked invocation displays a path that differs from the canonical root later stories key artifacts by.
  evidence: From the Story 1.3 review, 2026-09-01, verified against src/render/chrome.ts. Existence and canonicalization are Story 1.5's, which resolves the root by the presence of `_bmad` and `_bmad-output` and canonicalizes at the filesystem adapter. Deferred rather than half-implemented: a partial existence check in the render layer would need `node:fs`, which AD-1 forbids there, and would duplicate the resolution Story 1.5 owns.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-establish-the-visual-foundation.md`
  summary: RESOLVED 2026-09-01 — user chose the relative ladder; DESIGN.md's Elevation & Depth section rewritten to distinguish peer levels from nested surfaces, hover moved to the outline, and the tonal-separation claims put under test. (medium) DESIGN.md contradicts itself on the elevation ladder — its Elevation & Depth table states that `{colors.surface-container}` and `{colors.surface-container-highest}` "are not used at rest in v1", but `components.core-artifact-card` uses `surface-container-highest` as its background and `surface-container` as its absent background, both at rest.
  evidence: From the Story 1.2 review, 2026-09-01, verified against DESIGN.md:267 and DESIGN.md:360-368. Not resolved in the build story because DESIGN.md is the normative side and this is an internal contradiction within it rather than code drift — resolving it is a UX decision about whether the ladder has three levels or five. Blocking for Story 1.3, which builds the core-artifact card and cannot pick a surface token from an ambiguous ladder.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: A nonexistent or non-directory target path is accepted without complaint; the tool serves a dashboard over nothing.
  evidence: Confirmed by a reviewer. Deliberate for this story — the spec assigns project recognition to Story 1.5 (FR-7) — but it must not be lost, because until 1.5 lands a typo'd path looks like a working tool.
  closed: RESOLVED 2026-09-02 by Story 1.5. Superseded and simply never marked — recognition now happens in the composition root before the socket binds. It was still sitting in the open list a day after it closed.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) Vacuous assertion
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Vacuous assertion [test/discovery/nested.test.ts:82] — `assert.ok(fromTestDir.split(sep).length >= 1)` can never fail; `String.prototype.split` never returns an empty array. The two assertions above it do the real work.
  closed: RESOLVED 2026-09-02. `test/discovery/nested.test.ts` now asserts the depth on the *file* path with `>= 2`, which fails if the file moves up into `test/`. Mutation-checked: tightening it to `>= 3` fails the test, so it is live.
  mutations: Re-run 2026-09-02, not inherited. Tightened `test/discovery/nested.test.ts:89` to `>= 3`: `this test file is itself in a subdirectory of test/` failed, 16 pass / 1 fail in that file. Restored. The claim holds.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `parsePattern` accepts a padded override and passes it through untrimmed
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `parsePattern` accepts a padded override and passes it through untrimmed [scripts/test-run-policy.ts:67-73] — `parseFloor` trims, this does not, so `' test/**/*.test.ts '` is accepted, matches nothing, and is reported as "discovery is collecting less than the whole suite" rather than as a bad patter
  closed: RESOLVED 2026-09-02. `parsePattern` trims like `parseFloor`, and a pattern that is only padding is still refused. Mutation-checked: removing the trim fails the new test in `test/tooling/run-policy.test.ts`.
  mutations: Re-run 2026-09-02, not inherited. Replaced `raw.trim()` with `raw` in `parsePattern`: `a padded pattern override is trimmed rather than passed through` failed, 12 pass / 1 fail. Restored. The claim holds.
  correction: 2026-09-02, second review round. The `closed:` line above credits the fix with one thing it did not do: "a pattern that is only padding is still refused" was **pre-existing** behaviour. The `raw.trim() === ''` branch is there in `cef8da8`, unchanged — verified by reading it. The fix was the trim on the *accepted* path only. The new test's second assertion and this note both described the old branch as if it were new. Separately, that branch's message said the variable "is set but empty", which is inaccurate for `'   '` — set, and not empty; the wording is now "an empty or whitespace-only value".

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) Stale `.mjs` references, one of them load-bearing
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Stale `.mjs` references, one of them load-bearing [test/architecture.test.ts:38, 321; test/discovery/nested.test.ts:10] — the runner is `scripts/run-tests.ts`. Consequentially, `test/architecture.test.ts:321` scopes the stale-`.js` guard to `src/` on the premise that "`scripts/` is plain `.mjs` tool
  closed: RESOLVED 2026-09-02. Two of the three named sites had already gone (`test/architecture.test.ts:38, 321`); the third, a header comment in `test/discovery/nested.test.ts` naming `scripts/run-tests.mjs`, is corrected. The load-bearing consequence the finding warned about — the stale-`.js` guard scoped to `src/` on a false premise — no longer exists in the code.
  mutations: Re-checked 2026-09-02, and **the last sentence above is wrong**. No mutation applies — the fix was a comment — so the claim was read against the code instead. The three `.mjs` references are indeed gone (the only survivors are extension lists in `test/support/gate.ts:62` and the guard's own pattern, both correct). But the guard at `test/architecture.test.ts:134-138` is *still* scoped to `src/`: only the false premise in its comment was removed, not the scoping the premise justified. Re-opened as its own entry in the list above.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `bmad-dash ""` silently targets the working directory
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `bmad-dash ""` silently targets the working directory [src/cli/index.ts:83] — `resolve(cwd, positionals[0] ?? '.')` turns `''` into `cwd`, so an empty argument looks like a successful default rather than misuse. Distinct from the nonexistent-path case already deferred to Story 1.5; this one is an ar
  closed: RESOLVED 2026-09-02. An empty positional is now a usage error naming the fix. Deliberately only the empty string: `" "` names a directory called one space, which is legal and is not the working directory, so refusing it would refuse something a caller could have meant. Mutation-checked: disabling the guard fails the new test in `test/cli/flags.test.ts`. Independently re-found by the Story 1.5 review, which is some evidence this list is not being read.
  mutations: Re-run 2026-09-02, not inherited. Forced the `given === ''` branch in `src/cli/index.ts:292` to never be taken: `an empty path argument is refused, not treated as the default` failed, 17 pass / 1 fail. Restored. The claim holds.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `stopWith`'s 8s timer is never cleared, though `deadline()` exists to do exactly that
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `stopWith`'s 8s timer is never cleared, though `deadline()` exists to do exactly that [test/server.test.ts:271-278] — `t.unref()` means it holds nothing, so the consequence is a stray `SIGKILL` attempt on an already-dead child rather than a leak. Use `deadline()` (`test/server.test.ts:357`) or clear
  closed: RESOLVED 2026-09-02. Cleared in a `finally` after the race. **No test**, and that is not an oversight: the consequence was a stray `SIGKILL` attempt at an already-dead child rather than an observable behaviour, exactly as the finding said, so there is nothing an assertion could catch. Recorded rather than claimed as verified.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) The `files`-whitelist test's comment claims an existence check it does not perform
  evidence: From the 2026-09-01 code review, located and verified there. Full text: The `files`-whitelist test's comment claims an existence check it does not perform [test/cli-entry.test.ts:164-170] — the comment reads "Every whitelisted entry must be something that actually exists, so a stale entry cannot sit in the manifest looking like a shipped directory", but the assertion is
  closed: RESOLVED 2026-09-02. The assertion now does what the comment claims, using the `access` already imported in that file. Mutation-checked: adding a non-existent entry to `files` in package.json fails the test.
  mutations: Re-run 2026-09-02, not inherited. Added `"no-such-directory"` to `package.json`'s `files`: `the files whitelist publishes the directory holding the bin` failed, 20 pass / 1 fail in `test/cli-entry.test.ts`. Restored. The claim holds.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) Two *Suggested Review Order* pointers no longer land on the code they describe — this spec says `index.ts:167` is "Readiness is announced last" (the `stdout` call is `src/cli/index.ts:175`) and `test-run-policy.ts:75` is "Takes the last summary, not the first" (a blank line; `readTotal` is `scripts/test-run-policy.ts:84`). Spec-side drift; the other eleven pointers are accurate.
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Two *Suggested Review Order* pointers no longer land on the code they describe — this spec says `index.ts:167` is "Readiness is announced last" (the `stdout` call is `src/cli/index.ts:175`) and `test-run-policy.ts:75` is "Takes the last summary, not the first" (a blank line; `readTotal` is `scripts/
  closed: CLOSED BY DECISION 2026-09-02, not fixed — raise it again if you disagree. The pointers sit in a *completed* story's spec and were accurate for the code as it stood at that review. Re-pointing them at today's line numbers would make a Story 1.1 document describe code written in 1.4 and 1.5, which is worse than leaving them stale: the spec records a review that happened, it is not a live index.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: Repository hygiene absent — no .gitignore, README, LICENSE, repository or author fields, and no CI workflow running typecheck or tests.
  evidence: Confirmed by two reviewers. Partly downstream of the deferred `git init`; the license needs a human decision. CI matters because nothing automated currently runs `tsc --noEmit`.
  closed: SUPERSEDED 2026-09-02, not resolved — the work is still open, recorded once instead of three times. See "Repository hygiene, consolidated" in the open list above, which states what is actually still missing (README, `keywords`, CI, lint/format, coverage) and what has since landed (`.gitignore`, `LICENSE`, `license`, `author`, `repository`, lockfile).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: No README, and no `license`, `repository`, `author` or `keywords` in package.json, for a package whose whole interface is one npx command.
  evidence: Two reviewers noted the npm page would be blank. License needs a human decision; the rest are mechanical but out of scope for a story about serving a page.
  closed: SUPERSEDED 2026-09-02, not resolved — the work is still open, recorded once instead of three times. See "Repository hygiene, consolidated" in the open list above, which states what is actually still missing (README, `keywords`, CI, lint/format, coverage) and what has since landed (`.gitignore`, `LICENSE`, `license`, `author`, `repository`, lockfile).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: No CI workflow, no lockfile committed, no lint or format config, and no coverage instrumentation despite a suite whose entire thesis is coverage.
  evidence: Nothing automated runs `tsc --noEmit` outside a contributor's own machine. Coverage matters here specifically because three review rounds each found gaps that a green suite could not see.
  closed: SUPERSEDED 2026-09-02, not resolved — the work is still open, recorded once instead of three times. See "Repository hygiene, consolidated" in the open list above, which states what is actually still missing (README, `keywords`, CI, lint/format, coverage) and what has since landed (`.gitignore`, `LICENSE`, `license`, `author`, `repository`, lockfile).
