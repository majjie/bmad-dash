- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: No `--help`, `-h` or `--version`; all three exit 2 as unknown arguments and the USAGE string is reachable only by error.
  evidence: Reviewers confirmed `parseArgs` runs strict with an empty options map. A published CLI with no --version is hard to support. FR-6's suppression flag is also still unnamed in the PRD.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: A nonexistent or non-directory target path is accepted without complaint; the tool serves a dashboard over nothing.
  evidence: Confirmed by a reviewer. Deliberate for this story — the spec assigns project recognition to Story 1.5 (FR-7) — but it must not be lost, because until 1.5 lands a typo'd path looks like a working tool.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: The served page carries no hardening headers (nosniff, CSP, Referrer-Policy), and DNS-rebinding defence rests on Host alone with no Origin or Sec-Fetch-Site check.
  evidence: Real but premature — the page is a constant string today. Becomes load-bearing the moment Stories 1.12 and 2.1 render project content into it, and AD-19's rationale already anticipates the browser as the threat vector.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: The AD-1 gate does not cover ungated escape hatches to the filesystem (`node:module`, `node:worker_threads`, `node:vm`) or any outbound-network module, despite NFR-11 forbidding outbound requests entirely.
  evidence: A reviewer noted the gated set is narrower than the read-only, no-telemetry claim it enforces. Expanding the gate's remit is a scope decision rather than a patch, and gating network modules would also cover NFR-11, which currently has no automated enforcement anywhere. Postponed by the user with eyes open.
  revisit: Before Story 1.7, when markdown-it and yaml arrive. The gate reads source specifiers, so once a runtime dependency exists it could reach the network with nothing for the gate to see — a hole the gate cannot close retroactively. NFR-11 remains the only NFR with no automated enforcement until then.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: Repository hygiene absent — no .gitignore, README, LICENSE, repository or author fields, and no CI workflow running typecheck or tests.
  evidence: Confirmed by two reviewers. Partly downstream of the deferred `git init`; the license needs a human decision. CI matters because nothing automated currently runs `tsc --noEmit`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: No README, and no `license`, `repository`, `author` or `keywords` in package.json, for a package whose whole interface is one npx command.
  evidence: Two reviewers noted the npm page would be blank. License needs a human decision; the rest are mechanical but out of scope for a story about serving a page.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: No CI workflow, no lockfile committed, no lint or format config, and no coverage instrumentation despite a suite whose entire thesis is coverage.
  evidence: Nothing automated runs `tsc --noEmit` outside a contributor's own machine. Coverage matters here specifically because three review rounds each found gaps that a green suite could not see.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: No socket-level limits configured — requestTimeout, headersTimeout, keepAliveTimeout, maxConnections all default — on a server the user leaves running all day.
  evidence: A reviewer noted this is also the knob that bounds the shutdown problem. Real, but a tuning decision rather than a defect in this story.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: `errorCode()` is duplicated across the adapter and the CLI, and several test helpers are re-implemented across test files.
  evidence: Roughly 80 duplicated lines with drift risk. Cleanup, not correctness; deferred so it does not compete with the correctness work in this story.

## Deferred from: code review of spec-1-1-run-the-command-and-reach-a-served-page (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: `process.cwd()` is called unguarded at `src/cli/index.ts:128`, so a deleted working directory throws ENOENT and produces a stack trace instead of a clean exit 1.
  evidence: Found by the edge-case reviewer. Exotic — it needs the cwd to be removed between shell prompt and invocation — and unrelated to this story's subject, but it is the one place the CLI touches the process environment without a guard while every other such touch (EPIPE, signals, argv) has one.

  note: Four other findings from this review were already recorded above and were not duplicated — the ungated networking modules, the missing hardening headers and socket timeouts, the `errorCode` duplication, and repository hygiene. The hygiene entries are now partly stale: `.gitignore`, `LICENSE`, and the `license` and `author` fields all exist, and a lockfile is committed. What remains absent is a README, `repository`/`keywords`, CI, lint/format config and coverage.

<!-- Story 1.1 code review, 2026-09-01: 27 findings. 3 high + 3 gate-related medium fixed;
     the 21 below deferred by decision so 1.1 could close. Locations preserved verbatim. -->

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (medium) Expose `--port <n>` on the CLI
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Expose `--port <n>` on the CLI [src/cli/index.ts:54-89, 161] — resolves the decision above. Add a `port` option to the `parseArgs` call (strict, so an unknown flag still exits 2), validate it as an integer in `0..65535` and exit 2 naming the value and the range on failure, pass it into `start(...)`,

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
  summary: (low) The `files`-whitelist test's comment claims an existence check it does not perform
  evidence: From the 2026-09-01 code review, located and verified there. Full text: The `files`-whitelist test's comment claims an existence check it does not perform [test/cli-entry.test.ts:164-170] — the comment reads "Every whitelisted entry must be something that actually exists, so a stale entry cannot sit in the manifest looking like a shipped directory", but the assertion is

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `parsePattern` accepts a padded override and passes it through untrimmed
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `parsePattern` accepts a padded override and passes it through untrimmed [scripts/test-run-policy.ts:67-73] — `parseFloor` trims, this does not, so `' test/**/*.test.ts '` is accepted, matches nothing, and is reported as "discovery is collecting less than the whole suite" rather than as a bad patter

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `readTotal` requires the `ℹ` glyph and a bare `\n`
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `readTotal` requires the `ℹ` glyph and a bare `\n` [scripts/test-run-policy.ts:84] — `/^ℹ tests (\d+)$/gm` fails on a CRLF reporter line or a re-encoded stream, turning a green suite into "could not determine how many tests ran". It also counts subtests, so the floor measures something different fro

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) Stale `.mjs` references, one of them load-bearing
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Stale `.mjs` references, one of them load-bearing [test/architecture.test.ts:38, 321; test/discovery/nested.test.ts:10] — the runner is `scripts/run-tests.ts`. Consequentially, `test/architecture.test.ts:321` scopes the stale-`.js` guard to `src/` on the premise that "`scripts/` is plain `.mjs` tool

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) Vacuous assertion
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Vacuous assertion [test/discovery/nested.test.ts:82] — `assert.ok(fromTestDir.split(sep).length >= 1)` can never fail; `String.prototype.split` never returns an empty array. The two assertions above it do the real work.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `engines: ">=22"` is unsatisfiable for AC1's own command
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `engines: ">=22"` is unsatisfiable for AC1's own command [package.json:12-14] — `npm test` runs `node scripts/run-tests.ts` and discovers `test/**/*.test.ts`, both needing unflagged type stripping (Node ≥ 22.18). The mismatch is documented only in a `"//"` string (`package.json:7`) that no tool read

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `bmad-dash ""` silently targets the working directory
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `bmad-dash ""` silently targets the working directory [src/cli/index.ts:83] — `resolve(cwd, positionals[0] ?? '.')` turns `''` into `cwd`, so an empty argument looks like a successful default rather than misuse. Distinct from the nonexistent-path case already deferred to Story 1.5; this one is an ar

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) `stopWith`'s 8s timer is never cleared, though `deadline()` exists to do exactly that
  evidence: From the 2026-09-01 code review, located and verified there. Full text: `stopWith`'s 8s timer is never cleared, though `deadline()` exists to do exactly that [test/server.test.ts:271-278] — `t.unref()` means it holds nothing, so the consequence is a stray `SIGKILL` attempt on an already-dead child rather than a leak. Use `deadline()` (`test/server.test.ts:357`) or clear

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) Cross-pipe ordering on the three `Target:` assertions
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Cross-pipe ordering on the three `Target:` assertions [test/server.test.ts:743, 756, 767] — `startCli` resolves on the first newline on **stdout**, then the test reads accumulated **stderr**. The child writes `Target:` first (`src/cli/index.ts:173`), but delivery order across two separate pipes to t

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-command-and-reach-a-served-page.md`
  summary: (low) Two *Suggested Review Order* pointers no longer land on the code they describe — this spec says `index.ts:167` is "Readiness is announced last" (the `stdout` call is `src/cli/index.ts:175`) and `test-run-policy.ts:75` is "Takes the last summary, not the first" (a blank line; `readTotal` is `scripts/test-run-policy.ts:84`). Spec-side drift; the other eleven pointers are accurate.
  evidence: From the 2026-09-01 code review, located and verified there. Full text: Two *Suggested Review Order* pointers no longer land on the code they describe — this spec says `index.ts:167` is "Readiness is announced last" (the `stdout` call is `src/cli/index.ts:175`) and `test-run-policy.ts:75` is "Takes the last summary, not the first" (a blank line; `readTotal` is `scripts/

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-establish-the-visual-foundation.md`
  summary: (medium) DESIGN.md contradicts itself on the elevation ladder — its Elevation & Depth table states that `{colors.surface-container}` and `{colors.surface-container-highest}` "are not used at rest in v1", but `components.core-artifact-card` uses `surface-container-highest` as its background and `surface-container` as its absent background, both at rest.
  evidence: From the Story 1.2 review, 2026-09-01, verified against DESIGN.md:267 and DESIGN.md:360-368. Not resolved in the build story because DESIGN.md is the normative side and this is an internal contradiction within it rather than code drift — resolving it is a UX decision about whether the ladder has three levels or five. Blocking for Story 1.3, which builds the core-artifact card and cannot pick a surface token from an ambiguous ladder.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-establish-the-visual-foundation.md`
  summary: (low) The contrast tests recompute the ratios DESIGN.md states and the pairings the system uses today, but nothing enumerates the *unused* pairings — a future story combining, say, `on-surface-faint` with a hover surface would get no warning until someone audits by hand.
  evidence: From the Story 1.2 review, 2026-09-01. Deferred rather than fixed because the full cross-product of 24 colours is 276 pairs, most of them meaningless, and asserting a threshold on pairs the design never uses would produce failures that are not defects. The right shape is a declared pairing table that Story 1.3 extends as it introduces surfaces — worth doing when there is more than one component to declare.
