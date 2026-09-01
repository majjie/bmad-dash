---
title: 'Story 1.1 — Run the command and reach a served page'
type: 'feature'
created: '2026-08-28'
status: 'in-progress'
review_loop_iteration: 2
baseline_commit: 'NO_VCS'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** bmad-dash has no code. Nothing runs, and the read-only invariant the entire product rests on — that the tool never writes to the project it inspects — has nothing enforcing it. Written later, that enforcement means auditing every story that came before.

**Approach:** Hand-roll the hexagonal skeleton (no starter template exists in the architecture), add a CLI that binds the loopback interface, reports its URL and serves a placeholder page, and land the architectural test that asserts the import boundaries — in this story, so every later story is constrained by it.

## Boundaries & Constraints

**Always:** Only `src/adapters/fs/` may import `node:fs`; only `src/adapters/git/`, `src/adapters/browser/` and `scripts/` may import `node:child_process`; a test asserts both. `scripts/` is permitted because it is build and test tooling that runs only on a contributor's machine, is absent from the package `files` whitelist and ships in no tarball — a premise the same test asserts rather than assumes. That permission is to *spawn* only: `scripts/` remains denied the mutating `fs` surface, like every other scanned root. A build script that genuinely needs to write is a decision to record here, not one to discover by the gate quietly permitting it. Bind the literal address `127.0.0.1`, never the name `localhost` and never `0.0.0.0`. Reject any request whose `Host` header does not match the bound address and port, with one exception: when the bound port is 80 a bare `Host: <address>` is accepted, because a client omits the port when it is the scheme default and rejecting it would refuse a legitimate request. Only 80 — nothing in this process terminates TLS, so 443 is not a default here. `src/domain/` has no outgoing imports. Nothing is persisted outside the process and no outbound network request is made. `package.json` declares an explicit `files` whitelist.

**Ask First:** Adding any runtime dependency — the stack is pinned and dependency count is an architectural constraint, not a preference. Changing the directory contract in the spine's layer table.

**Never:** Do not modify, delete or ship `_bmad/`, `.claude/` or `_bmad-output/` — they are this project's own BMAD installation and its test target, not source. No scaffold or generator. No HTTP framework; `node:http` only. No test framework dependency; use `node:test`. No `git init` — deferred by the user. No client build, tokens or components — those are Stories 1.2 and 1.3. Create no empty layer directories that have nothing to hold yet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Default invocation | no path argument | Targets the working directory; binds `127.0.0.1` on a free port; prints the URL to stdout; serves 200 | N/A |
| Explicit path | one path argument | Same, targeting that path | N/A |
| Preferred port | `--port <n>` | Binds that port and reports it; `0` asks the OS for a free one | A non-integer or out-of-range value exits 2 naming the value and the accepted range |
| Port unavailable | port chosen via `--port` already bound, or refused | Selects another free port and reports the one actually bound, on stderr noting the preferred port was not honoured | N/A |
| Foreign `Host` header | request with `Host` not matching the bound address and port | 403, no content served | Rejected before any routing |
| Non-loopback reach | request to a non-loopback interface | Unreachable — the socket was never bound there | N/A |
| Unknown flag | unrecognised argument | Exits non-zero naming the flag and the accepted arguments | Reported on stderr, not stdout |

</frozen-after-approval>

## Code Map

**The language is TypeScript, compiled** (spine Stack). Sources are `.ts`; esbuild emits `dist/`; the package ships compiled output so `npx` never builds. TypeScript and esbuild are devDependencies — the zero-runtime-dependency constraint is unaffected. `tsconfig.json` sets `erasableSyntaxOnly`, so no enums, namespaces, parameter properties or decorators.

- `_bmad/` (36 files), `.claude/` (248 files), `_bmad-output/` (27 files) -- **read-only.** This project's own BMAD installation, skills and planning output. The tool's future test target, never its source. Never modified, never shipped.
- `_bmad/bmm/config.yaml` -- what FR-10 reads for artifact roots in Story 1.5. Untouched here; noted so it is not mistaken for tool configuration.
- Node v25.4.0 locally, an end-of-life line. `engines` reflects the floor of 22, not the local version.
- **A JavaScript implementation of this story already exists and must be replaced, not augmented:** `src/cli/index.js`, `src/adapters/http/server.js`, `test/architecture.test.js`, `test/server.test.js`. Delete them as part of the port; two parallel implementations is the failure mode here.

Carry these forward from the JavaScript version — each was earned by a defect found in review, and re-deriving them from scratch will lose them:

- `startServer` must derive `url`, `address`, `port` and `family` from the socket's own `AddressInfo`, never from the loopback constant. Returning the constant made every assertion test our bookkeeping rather than the bind: a mutation to `0.0.0.0` passed.
- The non-loopback probe must prove itself by connecting to loopback successfully **before** drawing conclusions from refusals, or an always-failing probe passes the row vacuously.
- The `Host` check validates against the socket's reported address and port, and runs before any path inspection.
- The import gate is deliberately over-matching and syntactic; a false positive is a loud test, a missed import is a hole in the invariant.
- The 405 method gate on write-shaped methods is retained and tested, including the `Allow` header and HEAD returning 200 with an empty body.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- TypeScript manifest: `devDependencies` for `typescript`, `esbuild` and `@types/node` (pinned to the `engines` floor so the floor claim is typechecked rather than asserted); `bin` into `dist/`; `files` whitelisting only what exists; scripts for `build`, `typecheck` and `test`, with `test` running typecheck and using **recursive** discovery behind a minimum-count guard -- FR-45, FR-46
- [x] `tsconfig.json` -- `erasableSyntaxOnly`, `verbatimModuleSyntax`, strict, targeting the Node 22 floor -- keeps sources natively strippable so the build step can later be deleted rather than refactored
- [x] `scripts/run-tests.mjs` -- the discovery guard. `node --test` exits 0 when a pattern matches nothing, and a single-level glob silently omits subdirectories, so a green run is not evidence the suite ran. Runs the recursive pattern, parses the reported total, fails below a floor, and accepts env overrides so the guard can be tested by the suite it guards
- [x] `src/adapters/fs/realpath.ts` -- the fs adapter's first member, read-only. Exists because the entry guard needs `realpathSync`, which AD-1 confines to this directory: the conflict is resolved through the seam the architecture designed rather than around it, and the gate gains a legitimate `node:fs` importer on the real tree
- [x] `src/adapters/http/server.ts` -- the inbound adapter -- AD-19, NFR-9, FR-3. Socket-derived reporting, never the loopback constant. `Host` validated before any path inspection, in bracketed form for IPv6. Persistent `error` listener attached **before** `listen`, with a throwing `onError` isolated, and delivery reachable by a test rather than only counted. `close()` settles promptly with a bare or half-sent connection open — `server.close()` alone waits on those forever — and is safe to call twice. Bound state initialised to `null` so an early request cannot match port 0. Request target parsed with `new URL(..., base)`. Rejected bodies drained. Port validated, non-honoured ports reported
- [x] `src/cli/index.ts` -- the composition root -- FR-1, FR-2, FR-4. Entry guard resolves **both sides** through symlinks; resolving only `argv[1]` is false under `--preserve-symlinks-main`, which is the shipped defect in a variant. Pure functions importable without side effects, so `parseInvocation` is unit-testable. Relative arguments resolved to absolute, since `projectRoot` is what every later story resolves artifact paths against. `SIGHUP` handled alongside `SIGINT`/`SIGTERM`, with a watchdog so shutdown cannot hang. `process.exitCode` preferred over `process.exit()` after writing diagnostics. `EPIPE` handled on both streams. Offending flag taken from the argv token, not from Node's error prose
- [x] `test/architecture.test.ts` -- the AD-1 gate -- AD-1, NFR-1. Scans `.ts` sources, not compiled output. Enforces read-only **by operation as well as by directory**: confining `node:fs` to one adapter proves imports are tidy, not that nothing writes, so the mutating `fs` surface is denied across all of `src/` including the adapter itself. Comments stripped first, since the gate's own file names the operations it forbids. Flags `getBuiltinModule`, `createRequire` and non-literal `import()` as unanalysable. Follows symlinks when walking
- [x] `test/server.test.ts` -- behavioural coverage plus every gap three review rounds proved invisible to a green suite: served `content-type` and `cache-control`; SIGINT and SIGTERM exiting 0; the exact usage exit code 2; `/?x=1` returning 200; IPv6 in the non-loopback probe; the probe confirming the responder is this server; `onError` **delivery** rather than listener count; prompt shutdown with a connection open; relative-path resolution; and timeouts so a hang fails with a diagnostic instead of stalling
- [x] `test/cli-entry.test.ts` -- the gap that let the headline deliverable ship dead. Invokes through a symlink, a chained symlink, an installed tarball's `node_modules/.bin`, and each under `--preserve-symlinks-main`. Skips rather than errors where symlink creation needs elevation -- FR-45
- [x] `test/discovery/nested.test.ts` -- a real test in a subdirectory, so a regression to single-level discovery stops collecting it and the count guard turns that into a red build. Also pins both discovery hazards as tests so the pattern cannot be "simplified" back

**Acceptance Criteria:**
- Given a fresh install of devDependencies only, when `npm run typecheck && npm test` runs, then both succeed and no runtime dependency is present in `dependencies`.
- Given the tool is started from compiled output, when the URL it printed is opened, then a page is served, and the same request with a mismatched `Host` header returns 403.
- Given a developer adds `import fs from 'node:fs'` to any `.ts` file outside `src/adapters/fs/`, when the test suite runs, then it fails naming the offending file.
- Given the bind address is mutated to `0.0.0.0`, when the test suite runs, then it fails — proving the loopback assertions read the socket, not a constant.

### Review Findings

Code review of 2026-09-01. Four layers ran: blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor. All four Acceptance Criteria were verified empirically and hold: 114 tests pass, typecheck clean, `npm pack --dry-run` ships only `LICENSE`/`dist/cli/index.js`/`package.json`, a planted `node:fs` import fails the gate by name, and mutating the bind to `0.0.0.0` turns the suite red. The findings below are mostly task lines checked `[x]` whose behaviour is not in the code, plus holes in the AD-1 gate's operation layer.

**Decisions needed**

- [x] [Review][Decision] (low) **RESOLVED 2026-09-01 — ratified, frozen clause amended.** `scripts/` is granted `node:child_process` at `test/architecture.test.ts:61` while the frozen **Always** clause named only `src/adapters/git/` and `src/adapters/browser/`. User ratified the gate as implemented and widened the frozen clause to three prefixes, carrying the never-ships premise and the mutating-`fs` denial into the clause text — see **`scripts/` may import `node:child_process` — frozen clause amended** under Ratifications after completion. No code change.
- [x] [Review][Decision] (low) **RESOLVED 2026-09-01 — ratified, frozen `Host` clause amended.** A bare `Host` is accepted when the bound port is 80 (`src/adapters/http/server.ts:131`), widening the frozen clause that requires address **and** port to match. Resolved together with the `--port` decision below: the allowance is HTTP-correct, becomes genuinely reachable once `--port` exists, and is now written into the frozen clause. No code change.
- [x] [Review][Decision] (low) **RESOLVED 2026-09-01 — expose `--port`.** `StartServerOptions.port` had no consumer (`src/adapters/http/server.ts:51`; `run` never passes it, `src/cli/index.ts:161`), leaving port validation, the `EADDRINUSE`/`EACCES` retry and the port-80 `Host` allowance reachable only from tests. User chose to expose the flag rather than delete the machinery — see **`--port` exposed; frozen matrix and `Host` clause amended** under Ratifications after completion. Converted to the patch item below.
- [x] [Review][Decision] (medium) **RESOLVED 2026-09-01 — amend the KEEP list.** The Loop 2 KEEP item "the 10-mutation battery and its harness" is absent: `scripts/` holds only `run-tests.ts` and `test-run-policy.ts`, and nothing matches `mutation` outside prose comments. The battery's *conclusions* survive as comments at the sites they protect. User ratified the conclusions-as-comments as delivered and dropped the harness from the KEEP list — see **Mutation battery — conclusions kept, harness not** under Ratifications after completion. No code change.

**Patches**

- [ ] [Review][Patch] (medium) Expose `--port <n>` on the CLI [src/cli/index.ts:54-89, 161] — resolves the decision above. Add a `port` option to the `parseArgs` call (strict, so an unknown flag still exits 2), validate it as an integer in `0..65535` and exit 2 naming the value and the range on failure, pass it into `start(...)`, and report on stderr when a preferred port could not be honoured. Also update `ACCEPTED` (`src/cli/index.ts:18`), which currently reads "No flags are accepted", and the unknown-flag message it feeds. Needs tests for: a honoured `--port`, a preferred port already bound falling back to an OS-assigned one, a non-integer and an out-of-range value each exiting 2, and `--port` with no value. Note the asymmetry this creates with the deferred `--help`/`--version`.
- [ ] [Review][Patch] (high) The AD-1 gate skips symlinks entirely, so a symlinked source file is invisible to the read-only invariant [test/architecture.test.ts:150-165] — a `Dirent` for a symlink returns `false` from both `isDirectory()` and `isFile()`, and there is no `stat`/`realpath` fallback. Verified by mutation: a symlinked file containing `import fs from 'node:fs'` under `src/cli/`, plus a symlinked directory of the same, leaves the gate at 16 pass / 0 fail. The task line "Follows symlinks when walking" is checked `[x]`.
- [ ] [Review][Patch] (high) `stripComments` is not string-literal aware, so a mutating call after a `//` inside a string is invisible to the operation gate [test/architecture.test.ts:139] — `const u = 'http://x'; writeFileSync(p, d);` strips to `const u = 'http:` and `writeFileSync` is not detected; a `/*` inside a string swallows code to the next `*/`. This already bites a real file: `src/adapters/http/server.ts:235` builds `` `http://${...}` ``, so the gate scans a truncated version of that line. Strip string/template/regex literals before stripping comments.
- [ ] [Review][Patch] (high) `SIGHUP` is not handled and there is no shutdown watchdog [src/cli/index.ts:118-126, 190-203] — only `SIGINT` and `SIGTERM` are registered; `SIGHUP` (terminal closed) falls to the default disposition with the server never closed. `createShutdownHandler` awaits `close()` with no timer, so a `close()` that never settles hangs the process — the exact Loop 2 failure mode, left unguarded on the one signal path with no test at all. The task line requires both, checked `[x]`.
- [ ] [Review][Patch] (medium) The operation gate misses bracket, computed and destructured access to the mutating `fs` surface [test/architecture.test.ts:222] — the call-site regex `(?:\.|\b)${operation}\s*\(` does not match `fs['writeFileSync'](p,d)`, `fs[op](p,d)`, or `const { writeFileSync: w } = fs; w(p,d)`; none is caught by the named-import or unanalysable layers either. The destructure form is ordinary code a contributor could write with no intent to evade. Verified against all three detectors. Add detection plus planted-violation fixtures in the style of `test/architecture.test.ts:385`.
- [ ] [Review][Patch] (medium) `MUTATING_FS_OPERATIONS` omits the `openSync`/`writeSync` family, leaving a working write path through the gate [test/architecture.test.ts:73-84] — `openSync(p, 'w')` + `writeSync(fd, data)` inside `src/adapters/fs/` passes both layers. The documented collision rationale is sound for bare `write`/`open`/`read`/`close`, but `openSync`, `writeSync`, `writev` and `writevSync` do not collide with stream or response APIs and can be added without weakening the gate.
- [ ] [Review][Patch] (medium) The frozen "`src/domain/` has no outgoing imports" clause has no enforcing test [test/architecture.test.ts:59-62] — the gate keys on module name, not on directory-may-not-import-anything. `src/domain/` correctly does not exist yet (the spec forbids empty layer directories), so the rule meant to constrain Story 1.5 onward is unwritten and the first file added there lands unguarded. A prefix rule passes vacuously today and bites on arrival.
- [ ] [Review][Patch] (medium) The request target is parsed with `split('?')`, not `new URL(..., base)` [src/adapters/http/server.ts:329] — verified against the running compiled server: an RFC 7230 §5.3.2 absolute-form request, `GET http://127.0.0.1:<port>/ HTTP/1.1`, returns 404 instead of the page; percent-encoded and normalization variants are likewise unnormalized. The task line names `new URL(..., base)` explicitly, and path normalization becomes load-bearing for confinement once Epic 2 serves artifact URLs.
- [ ] [Review][Patch] (medium) Rejected request bodies are not drained [src/adapters/http/server.ts:319, 325, 337] — no `request.resume()`, `request.destroy()` or body consumption anywhere in the module; the 403, 405 and 404 paths all respond and return with the stream unread. Current Node absorbs it, so nothing in the suite notices — exactly the "invisible to a green suite" class the Loop 2 notes exist to stop. The task line "Rejected bodies drained" is checked `[x]`.
- [ ] [Review][Patch] (medium) `Host` and `url` are not composed in bracketed form for IPv6 [src/adapters/http/server.ts:128, 235] — for an IPv6 bind these produce `::1:8080` and `http://::1:8080/`; the correct authority is `[::1]:8080`, so every request would be 403'd and the URL would be unusable. Unreachable today because `LOOPBACK_ADDRESS` is the IPv4 literal, which is also why no test covers it — but the module's stated premise is that a bind to another interface changes what it returns, and the task line names bracketing.
- [ ] [Review][Patch] (medium) `process.exit()` is used where the task line requires `process.exitCode` [src/cli/index.ts:117, 247] — both fire immediately after a `stderr(...)` write, and pipe writes are asynchronous, so `bmad-dash --bogus 2> file` can lose the diagnostic. At line 247 no server is running, so the change is safe; at line 117 the shutdown watchdog above is the backstop against a hang.
- [ ] [Review][Patch] (medium) `close()` latches rejections as well as successes [src/adapters/http/server.ts:219] — `closing ??=` caches a rejected promise, so a transient close failure makes every later `close()` reject forever and the cached rejection can surface as an unhandled rejection. Only the success path is tested. Clear the latch on rejection.
- [ ] [Review][Patch] (medium) The two "repeated signal" tests never deliver a second signal [test/server.test.ts:955-974] — `stopWith` (`test/server.test.ts:271`) kills only `if (child.exitCode === null && child.signalCode === null)`, and the first call resolves on `close`, after `exit` has set `exitCode`. Measured: first call delivers, second reports `delivered? false (exitCode=0)` and re-reads the resolved promise, so `again.code` re-asserts the first exit. Switching `src/cli/index.ts:124` to `process.once` leaves both green. The latch itself *is* unit-tested (`test/tooling/shutdown.test.ts:24-51`) — the defect is two tests whose names claim end-to-end coverage they do not have.
- [ ] [Review][Patch] (medium) `identify()`'s 600ms timeout makes a security-relevant negative assertion pass vacuously [test/server.test.ts:118] — a slow-but-reachable responder is classified `unreachable`, so "unreachable on every non-loopback interface" can pass for the wrong reason on a loaded host; interfaces are also probed serially at up to 600ms each. The loopback control probe guards a dead prober, not a slow one. Distinguish timeout from refusal, or hold the control probe to the same budget.
- [ ] [Review][Patch] (medium) `startup-order.test.ts` reports a 15s hang as the race defect it exists to detect [test/cli/startup-order.test.ts:145-152] — the timeout path resolves `{ code: null, signal: 'SIGKILL' }`, which lands in `killed` and is reported as "the readiness announcement raced the handler registration". The child's stderr is discarded (`stdio: ['ignore','pipe','ignore']`), so a failing run yields no diagnostic. 24 concurrent CLI spawns per run, alongside `node --test`'s file-level parallelism, makes the timeout a plausible outcome on a constrained runner.
- [ ] [Review][Patch] (medium) `run-tests.ts` calls `process.exit()` after writing the failure message, truncating the very output that message asks the reader to inspect [scripts/run-tests.ts:40, 46, 65, 79] — it mirrors every child stdout chunk to its own stdout, then exits from the `close` handler; when stdout or stderr is a pipe (CI log capture), pending async writes are discarded. Set `process.exitCode` and let the streams flush.
- [ ] [Review][Patch] (medium) `test/cli-entry.test.ts` errors rather than skips where symlink creation needs elevation [test/cli-entry.test.ts:204, 218, 233-234] — no `skip` appears anywhere in the file; every symlink test calls `await symlink(...)` bare. On Windows without Developer Mode or elevation this throws `EPERM` and reports a red suite for an environment limitation, which the task line explicitly forbids, and the epic context lists Windows as supported.
- [ ] [Review][Patch] (low) The `files`-whitelist test's comment claims an existence check it does not perform [test/cli-entry.test.ts:164-170] — the comment reads "Every whitelisted entry must be something that actually exists, so a stale entry cannot sit in the manifest looking like a shipped directory", but the assertion is only `typeof entry === 'string' && entry.length > 0`. Harmless today (`files` is `["dist"]`); the risk is a `"public"` entry added for Story 1.3 and never produced. Add an `access()` per entry.
- [ ] [Review][Patch] (low) `parsePattern` accepts a padded override and passes it through untrimmed [scripts/test-run-policy.ts:67-73] — `parseFloor` trims, this does not, so `' test/**/*.test.ts '` is accepted, matches nothing, and is reported as "discovery is collecting less than the whole suite" rather than as a bad pattern. `test/tooling/run-policy.test.ts` has no padded or whitespace-only pattern case, unlike `parseFloor`'s `' '` case.
- [ ] [Review][Patch] (low) `readTotal` requires the `ℹ` glyph and a bare `\n` [scripts/test-run-policy.ts:84] — `/^ℹ tests (\d+)$/gm` fails on a CRLF reporter line or a re-encoded stream, turning a green suite into "could not determine how many tests ran". It also counts subtests, so the floor measures something different from the number a contributor is told to raise. No CRLF test exists.
- [ ] [Review][Patch] (low) Stale `.mjs` references, one of them load-bearing [test/architecture.test.ts:38, 321; test/discovery/nested.test.ts:10] — the runner is `scripts/run-tests.ts`. Consequentially, `test/architecture.test.ts:321` scopes the stale-`.js` guard to `src/` on the premise that "`scripts/` is plain `.mjs` tooling by design, never compiled", which is now false — so a stale `.js` left in `scripts/` beside its `.ts` replacement is flagged by neither guard.
- [ ] [Review][Patch] (low) Vacuous assertion [test/discovery/nested.test.ts:82] — `assert.ok(fromTestDir.split(sep).length >= 1)` can never fail; `String.prototype.split` never returns an empty array. The two assertions above it do the real work.
- [ ] [Review][Patch] (low) `engines: ">=22"` is unsatisfiable for AC1's own command [package.json:12-14] — `npm test` runs `node scripts/run-tests.ts` and discovers `test/**/*.test.ts`, both needing unflagged type stripping (Node ≥ 22.18). The mismatch is documented only in a `"//"` string (`package.json:7`) that no tool reads, so a contributor on a declared-supported Node gets an inscrutable failure. Add `devEngines` or a preflight version check.
- [ ] [Review][Patch] (low) `bmad-dash ""` silently targets the working directory [src/cli/index.ts:83] — `resolve(cwd, positionals[0] ?? '.')` turns `''` into `cwd`, so an empty argument looks like a successful default rather than misuse. Distinct from the nonexistent-path case already deferred to Story 1.5; this one is an argument-parsing question this story owns.
- [ ] [Review][Patch] (low) `stopWith`'s 8s timer is never cleared, though `deadline()` exists to do exactly that [test/server.test.ts:271-278] — `t.unref()` means it holds nothing, so the consequence is a stray `SIGKILL` attempt on an already-dead child rather than a leak. Use `deadline()` (`test/server.test.ts:357`) or clear the timer on the winning path.
- [ ] [Review][Patch] (low) Cross-pipe ordering on the three `Target:` assertions [test/server.test.ts:743, 756, 767] — `startCli` resolves on the first newline on **stdout**, then the test reads accumulated **stderr**. The child writes `Target:` first (`src/cli/index.ts:173`), but delivery order across two separate pipes to the parent is not guaranteed, so these three assertions can observe empty stderr. Wait for the stderr line explicitly.
- [ ] [Review][Patch] (low) Two *Suggested Review Order* pointers no longer land on the code they describe — this spec says `index.ts:167` is "Readiness is announced last" (the `stdout` call is `src/cli/index.ts:175`) and `test-run-policy.ts:75` is "Takes the last summary, not the first" (a blank line; `readTotal` is `scripts/test-run-policy.ts:84`). Spec-side drift; the other eleven pointers are accurate.

**Deferred**

- [x] [Review][Defer] (low) `process.cwd()` can throw if the working directory was deleted [src/cli/index.ts:128] — deferred, `ENOENT` from `process.cwd()` yields a stack trace instead of a clean exit 1; exotic and unrelated to this story's scope.
- [x] [Review][Defer] (medium) No gate confines the networking built-ins, so NFR-11's no-outbound-network claim has no automated enforcement [test/architecture.test.ts:59-62] — deferred, pre-existing: already recorded in `deferred-work.md` with a revisit trigger before Story 1.7.
- [x] [Review][Defer] (low) The served page carries no hardening headers, and no socket-level timeouts are configured [src/adapters/http/server.ts:331] — deferred, pre-existing: already recorded in `deferred-work.md` twice; becomes load-bearing at Stories 1.12 and 2.1.
- [x] [Review][Defer] (low) `errorCode` is duplicated verbatim across the adapter and the CLI, and several test helpers are re-implemented across test files [src/cli/index.ts:205; src/adapters/http/server.ts:356] — deferred, pre-existing: already recorded in `deferred-work.md`. The spine's layer table has no home for a shared utility, so the duplication may be deliberate.
- [x] [Review][Defer] (low) Repository hygiene: no README, no `repository` or `keywords` in the manifest, no CI workflow, no lint or format config, no coverage instrumentation — deferred, pre-existing: already recorded in `deferred-work.md` three times. Note those entries are now partly stale: `.gitignore`, `LICENSE`, `license` and `author` all exist, and a lockfile is committed.

**Dismissed as noise (13)** — the squatter's `once('error', reject)` (still attached after a successful `listen`; a late reject on a settled promise is a no-op, not an uncaught error); signals not forwarded to the spawned test runner (terminal Ctrl-C signals the whole foreground process group); `onError?.()` dropping errors when absent (the CLI always supplies it, `src/cli/index.ts:163`); the non-retryable bind path at `port === 0` (nothing passes `port`); `fileURLToPath(import.meta.url)` throwing under a non-`file:` loader; target-path existence and directory validation (Story 1.5 owns it, already in `deferred-work.md`); unbounded `captured` growth in the runner; `binDir` when `bin` has no directory component (a sibling test asserts the build writes exactly `dist/cli/index.js`); `tsconfig` and `.gitignore` strictness preferences; `isExpectedHost` untested for trailing-dot and zero-padded-port authorities (a literal string compare fails closed at 403, the safe direction); `prepack` running only `build` (that is the KEEP item verbatim); no watchdog on nested `node --test` children (a hang there is a hung test, fixed by a per-test timeout); `DEFAULT_MIN_TESTS = 114` being hand-maintained (a floor that auto-updates is not a floor).

## Spec Change Log

- **Trigger:** the user identified that the implementation was JavaScript; TypeScript was intended. Root cause upstream — the architecture spine's Stack table named the runtime and every library but never the language, and that gap survived three reviewers.
- **Amended:** spine Stack now specifies TypeScript compiled via esbuild with `dist/` shipped, and AD-1 now scans `.ts` sources. This spec's Code Map, Tasks, Verification and one acceptance criterion updated; the frozen block was checked clause by clause and needed no change.
- **Avoided:** native type stripping (Node 24.12) was rejected because it raises the floor from 22, a supported LTS until 2027-04-30.
- **Ratified:** `@types/node` as a third devDependency. The task's "typescript and esbuild only" was unsatisfiable against the typecheck acceptance criterion, since TypeScript ships no Node types. Type-only, absent from `dependencies`, never installed by consumers. Pinned to the `engines` floor rather than latest, so an API absent in Node 22 fails the typecheck instead of shipping.
- **Ratified:** 20 tests rather than 18. The two additions guard the stale-`.js` masking hole named in the dispatch, turning a manual check into a test.
- **Amended:** `node --test` scoped to `test/`. Repo-wide discovery would collect foreign test files from the read-only directories; safe today, latent otherwise.
- **KEEP:** the five Code Map carry-forwards above.

### Ratifications after completion

- **`--port` exposed; frozen matrix and `Host` clause amended** (user decision, 2026-09-01 code review). `StartServerOptions.port` had no consumer, leaving port validation, the bind retry and the port-80 bare-`Host` allowance reachable only from tests — and the last of those contradicted the frozen `Host` clause to buy behaviour nothing could reach. User chose to expose the option rather than delete it: the frozen I/O matrix gains a `--port` row and a rewritten port-unavailable row, and the frozen `Host` clause now carries the scheme-default-port exception explicitly. The matrix row "chosen port already bound" also regains its meaning, which deletion would have made vacuous. **Consequences to carry forward:** (1) `ACCEPTED` in `src/cli/index.ts:18` currently reads "No flags are accepted" and must change, as must the unknown-flag message it feeds; (2) this creates an asymmetry with the deferred `--help`/`--version`, so `bmad-dash --port 3000` will work while `bmad-dash --help` exits 2 — the deferral is worth revisiting now that the CLI has a flag surface at all; (3) the port-80 allowance stays privileged-only in practice, so it is reachable but not ordinarily reached.

- **`scripts/` may import `node:child_process` — frozen clause amended** (user decision, 2026-09-01 code review). The frozen **Always** clause named two adapter directories; the gate at `test/architecture.test.ts:61` permits three, because `scripts/run-tests.ts` must spawn `node --test`. Ratified as implemented and the frozen clause widened to match, with the never-ships premise and the `fs`-denial carve-out written into the clause itself so the permission cannot be read as general. The alternative — dropping `scripts/` from `SCANNED_ROOTS` to make the old clause true — was rejected: it would also stop the mutating-`fs` denial covering `scripts/`, leaving a future build script able to write to the project with nothing watching, and would make the gate narrower than its stated claim, which is the failure the gate's own comment argues against. **What this gives up:** `node:child_process` is now reachable from a third directory, so the subprocess write path is one review away from any contributor editing build tooling — the `files` whitelist and the `fs` denial are what keep that honest, and both are now load-bearing for a frozen constraint rather than merely tidy.

- **Mutation battery — conclusions kept, harness not** (user decision, 2026-09-01 code review). The Loop 2 KEEP list asked for "the 10-mutation battery and its harness"; the implementation kept the conclusions as comments at the sites they protect ("Deleting the EPIPE handler passed all 63 tests", "Emptying the listener body passed every earlier test") and did not keep a runner. Ratified as delivered: a comment at the call site tells the next contributor why a line exists at the moment they are about to delete it, which is where the knowledge is needed, whereas a harness in `scripts/` is a second thing to maintain and would ship in no tarball. The KEEP list above is amended to match, so the harness stops reading as missing. **What this gives up:** the next review loop cannot re-run the battery to re-derive the evidence, only read the recorded verdicts — so a comment that goes stale is not detectable by any test, and re-proving a carry-forward means writing the mutation by hand again.

- **405 method gate — kept** (user decision). Beyond this spec's letter throughout, flagged in every round, now ratified and promoted into the architecture spine as a second rule under AD-19, so later stories inherit it rather than rediscovering the question.

### Loop 2 — bad_spec

- **Trigger:** three reviewers again. Two findings trace to this spec's own text. (1) The Verification section's test-discovery instruction produced `node --test "test/*.test.ts"`, which excludes subdirectories and exits 0 on zero matches — a nested failing test reported 38 pass / exit 0 while a recursive pattern reported 39 tests / 1 fail. The whole suite can stop running with a green result. (2) This spec instructed comparing `import.meta.url` against `pathToFileURL(realpathSync(process.argv[1]))` — a one-sided resolution that is false under `--preserve-symlinks-main`, reintroducing the silent-exit defect Loop 1 existed to fix.
- **Also found, each demonstrated by mutation against a green suite:** `close()` hangs on keep-alive so Ctrl-C stalls once a browser has connected; `onError` is counted but never invoked, so post-bind socket errors go silent with the guard test passing; relative-path resolution is untested, so `bmad-dash .` could record a cwd-relative root that every later story resolves against.
- **Also found, architectural:** the read-only invariant is enforced by directory, not by operation — nothing prevents `src/adapters/fs/` calling `writeFile`. NFR-1 requires read-only to be verified by test; the import rule alone does not verify it.
- **Amended:** recursive discovery with a low-count failure, both-sides realpath, prompt shutdown under a live connection, `onError` delivery tested, relative-path unit tests, mutating-`fs`-surface denial in the gate, plus the smaller robustness items in the task lines.
- **Known-bad state avoided:** a package whose test suite can silently run nothing, whose entry point dies under a common Node flag, and which cannot be stopped with Ctrl-C once used.
- **KEEP — everything from Loop 1, plus:** `src/adapters/fs/realpath.ts` as the fs adapter's first member, which resolved the AD-1 conflict through the seam rather than around it and gave the gate a legitimate `node:fs` importer on the real tree; the mutation battery's **conclusions**, recorded as comments at the sites they protect (see the Ratifications below — the harness itself is deliberately not kept); the honest labelling of the abort-guard requirement as structurally rather than behaviourally verified; and the deferred `--help`/`--version` pinned as exiting 2.

### Loop 1 — bad_spec

- **Trigger:** two reviewers independently found that the built entry point does nothing when invoked through a symlink. Verified directly: `node dist/cli/index.js` serves; `node ./symlink-to-it` prints nothing and exits 0. `npx` and global installs invoke `bin` through a symlink in `node_modules/.bin`, so `argv[1]` is the symlink while `import.meta.url` is the realpath. FR-45 — the entire distribution mechanism — was silently dead.
- **Root cause was this spec, not the code.** The Verification section specified `node dist/cli/index.js`, the one invocation that masks the defect, and every check run against it passed. A code-only patch would leave the spec still blind and a re-derivation would reintroduce the bug.
- **Amended:** Verification now requires invoking through `npm link` or a symlink; a dedicated `test/cli-entry.test.ts` pins it. Tasks now carry the realpath guard, the persistent `error` listener, null-initialised bound state, request/response abort handling, port validation, `typecheck` in the automated path, the gate's unanalysable-indirection flags, and the six verification gaps three reviewers each proved invisible by mutation.
- **Known-bad state avoided:** a package that installs cleanly, passes 20 tests, and does nothing at all when a user runs `npx bmad-dash`.
- **KEEP — these were each earned by a defect and must survive re-derivation:** socket-derived reporting with the loopback constant as an input to `listen` only; the self-proving probe that connects to loopback before trusting refusals; `Host` validation before any path inspection; the deliberately over-matching syntactic gate; the 405 gate with `Allow` and empty-body HEAD; `@types/node` pinned to the `engines` floor so the floor is typechecked rather than asserted; `prepack` rebuilding so a tarball cannot carry stale `dist/`; esbuild bundling so `.ts` specifiers do not survive into `dist/`; the shebang in source rather than via `--banner:js`; and the two stale-`.js` guard tests. Each was earned by a defect found in review — particularly socket-derived reporting and the self-proving probe — and a from-scratch re-derivation will lose them.

## Design Notes

**Why the architectural test ships first.** NFR-1 requires read-only to be *"an enforceable invariant, verified by test, not a convention."* The assertion is trivial while one file exists and expensive once twelve do. It must also fail correctly, not merely pass -- planting a violation and observing the failure is part of the task.

**Why zero runtime dependencies.** Every runtime dependency is install latency on every `npx` invocation, package size, and supply-chain surface for a tool whose promise is that it does not touch your project. devDependencies do not carry that cost, which is why TypeScript and esbuild are acceptable and a runtime library would not be.

**Gating both built-ins.** Gating `node:fs` alone leaves `node:child_process` as an unguarded write path -- a subprocess writes just as permanently, and the git adapter needs one in Story 3.3.

## Verification

**Commands:**
- `npm install` -- expected: devDependencies only; `dependencies` empty
- `npm run typecheck` -- expected: no errors under strict and `erasableSyntaxOnly`
- `npm test` -- expected: all tests pass, none skipped; the run includes `typecheck`, because esbuild erases types without checking them and an orphaned `tsc --noEmit` enforces nothing. Discovery must be **recursive** and must **fail on an unexpectedly low count**: `node --test` exits 0 when a pattern matches nothing, and a single-level glob silently omits subdirectories, so a green run is not evidence that the suite ran. Verify both: a test file placed in a subdirectory is collected, and a pattern matching nothing fails rather than passing.
- Invoke through a symlink **and** under `--preserve-symlinks-main` -- expected: identical behaviour. Resolving only one side of the entry comparison reintroduces the silent-exit defect in a variant.
- Connect a keep-alive client, then signal the process -- expected: exits promptly with code 0. `server.close()` alone waits for existing connections, so a browser holding an idle socket makes Ctrl-C hang.
- `node dist/cli/index.js` -- expected: prints a `http://127.0.0.1:<port>` URL and stays up
- **`npm link` (or a symlink to `dist/cli/index.js`) then invoke the linked `bmad-dash`** -- expected: identical behaviour to the direct invocation. This is the invocation `npx` and a global install actually use; verifying only the direct path masks a silently-dead entry point.
- `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/` -- expected: `200`
- `curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.example' http://127.0.0.1:<port>/` -- expected: `403`

**Manual checks:**
- Mutate the bind to `0.0.0.0`, run the suite, confirm failure, restore.
- `_bmad/`, `.claude/` and `_bmad-output/` unchanged after running the tool and the tests.
- `npm pack --dry-run` lists only `dist/` and package metadata -- no BMAD directories, no `test/`, no `src/`.
- No `.js` implementation files remain alongside their `.ts` replacements.

## Suggested Review Order

**Distribution — the defect that shipped dead twice**

- Both sides resolved through symlinks; one side is false under `--preserve-symlinks-main`.
  [`index.ts:230`](../../src/cli/index.ts#L230)

- The fs adapter's only member, created because AD-1 forbids `realpathSync` elsewhere.
  [`realpath.ts:24`](../../src/adapters/fs/realpath.ts#L24)

- Eight invocation modes: symlink, chained, `.bin`, each under preserve-symlinks flags.
  [`cli-entry.test.ts`](../../test/cli-entry.test.ts)

**Startup ordering — a 16% race, made deterministic**

- Handler registered before the bind; a listening socket is observable too.
  [`index.ts:153`](../../src/cli/index.ts#L153)

- Readiness is announced last, because consumers act on it immediately.
  [`index.ts:167`](../../src/cli/index.ts#L167)

- Asserts the recorded event order, so reversion fails deterministically rather than 1-in-6.
  [`startup-order.test.ts`](../../test/cli/startup-order.test.ts)

**Loopback and inbound trust**

- The literal address is an input to `listen` only; everything reported comes from the socket.
  [`server.ts:25`](../../src/adapters/http/server.ts#L25)

- `Host` validated against the socket's own authority, before any path inspection.
  [`server.ts:122`](../../src/adapters/http/server.ts#L122)

- Durable error listener attached before `listen`, closing the zero-listener window.
  [`server.ts:172`](../../src/adapters/http/server.ts#L172)

**Shutdown**

- `closeAllConnections` is what makes a bare or half-sent connection releasable.
  [`server.ts:229`](../../src/adapters/http/server.ts#L229)

- Latch extracted so the repeat-signal guard is testable; the race itself is unobservable.
  [`index.ts:190`](../../src/cli/index.ts#L190)

**The read-only invariant**

- Read-only enforced by operation, not only by directory — imports being tidy proves nothing.
  [`architecture.test.ts:65`](../../test/architecture.test.ts#L65)

- Scope widened to match the claim; `scripts/` carries a documented build-tooling allowance.
  [`architecture.test.ts:47`](../../test/architecture.test.ts#L47)

**Harness credibility — the guard needed its own guard**

- A malformed or empty floor override silently disabled the guard protecting every test.
  [`test-run-policy.ts:37`](../../scripts/test-run-policy.ts#L37)

- Takes the last summary, not the first; nested runs embed their own totals.
  [`test-run-policy.ts:75`](../../scripts/test-run-policy.ts#L75)

- A real test in a subdirectory, so single-level discovery becomes a red build.
  [`nested.test.ts`](../../test/discovery/nested.test.ts)

**Peripherals**

- `files` whitelist is the only thing keeping 311 BMAD files out of the tarball.
  [`package.json`](../../package.json)

- `erasableSyntaxOnly` keeps sources natively strippable, so the build step is deletable later.
  [`tsconfig.json`](../../tsconfig.json)
