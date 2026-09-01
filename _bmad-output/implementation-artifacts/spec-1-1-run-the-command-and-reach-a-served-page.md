---
title: 'Story 1.1 — Run the command and reach a served page'
type: 'feature'
created: '2026-08-28'
status: 'done'
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

**Always:** Only `src/adapters/fs/` may import `node:fs`; only `src/adapters/git/` and `src/adapters/browser/` may import `node:child_process`; a test asserts both. Bind the literal address `127.0.0.1`, never the name `localhost` and never `0.0.0.0`. Reject any request whose `Host` header does not match the bound address and port. `src/domain/` has no outgoing imports. Nothing is persisted outside the process and no outbound network request is made. `package.json` declares an explicit `files` whitelist.

**Ask First:** Adding any runtime dependency — the stack is pinned and dependency count is an architectural constraint, not a preference. Changing the directory contract in the spine's layer table.

**Never:** Do not modify, delete or ship `_bmad/`, `.claude/` or `_bmad-output/` — they are this project's own BMAD installation and its test target, not source. No scaffold or generator. No HTTP framework; `node:http` only. No test framework dependency; use `node:test`. No `git init` — deferred by the user. No client build, tokens or components — those are Stories 1.2 and 1.3. Create no empty layer directories that have nothing to hold yet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Default invocation | no path argument | Targets the working directory; binds `127.0.0.1` on a free port; prints the URL to stdout; serves 200 | N/A |
| Explicit path | one path argument | Same, targeting that path | N/A |
| Port unavailable | chosen port already bound | Selects another free port and reports the one actually bound | N/A |
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

## Spec Change Log

- **Trigger:** the user identified that the implementation was JavaScript; TypeScript was intended. Root cause upstream — the architecture spine's Stack table named the runtime and every library but never the language, and that gap survived three reviewers.
- **Amended:** spine Stack now specifies TypeScript compiled via esbuild with `dist/` shipped, and AD-1 now scans `.ts` sources. This spec's Code Map, Tasks, Verification and one acceptance criterion updated; the frozen block was checked clause by clause and needed no change.
- **Avoided:** native type stripping (Node 24.12) was rejected because it raises the floor from 22, a supported LTS until 2027-04-30.
- **Ratified:** `@types/node` as a third devDependency. The task's "typescript and esbuild only" was unsatisfiable against the typecheck acceptance criterion, since TypeScript ships no Node types. Type-only, absent from `dependencies`, never installed by consumers. Pinned to the `engines` floor rather than latest, so an API absent in Node 22 fails the typecheck instead of shipping.
- **Ratified:** 20 tests rather than 18. The two additions guard the stale-`.js` masking hole named in the dispatch, turning a manual check into a test.
- **Amended:** `node --test` scoped to `test/`. Repo-wide discovery would collect foreign test files from the read-only directories; safe today, latent otherwise.
- **KEEP:** the five Code Map carry-forwards above.

### Ratifications after completion

- **405 method gate — kept** (user decision). Beyond this spec's letter throughout, flagged in every round, now ratified and promoted into the architecture spine as a second rule under AD-19, so later stories inherit it rather than rediscovering the question.

### Loop 2 — bad_spec

- **Trigger:** three reviewers again. Two findings trace to this spec's own text. (1) The Verification section's test-discovery instruction produced `node --test "test/*.test.ts"`, which excludes subdirectories and exits 0 on zero matches — a nested failing test reported 38 pass / exit 0 while a recursive pattern reported 39 tests / 1 fail. The whole suite can stop running with a green result. (2) This spec instructed comparing `import.meta.url` against `pathToFileURL(realpathSync(process.argv[1]))` — a one-sided resolution that is false under `--preserve-symlinks-main`, reintroducing the silent-exit defect Loop 1 existed to fix.
- **Also found, each demonstrated by mutation against a green suite:** `close()` hangs on keep-alive so Ctrl-C stalls once a browser has connected; `onError` is counted but never invoked, so post-bind socket errors go silent with the guard test passing; relative-path resolution is untested, so `bmad-dash .` could record a cwd-relative root that every later story resolves against.
- **Also found, architectural:** the read-only invariant is enforced by directory, not by operation — nothing prevents `src/adapters/fs/` calling `writeFile`. NFR-1 requires read-only to be verified by test; the import rule alone does not verify it.
- **Amended:** recursive discovery with a low-count failure, both-sides realpath, prompt shutdown under a live connection, `onError` delivery tested, relative-path unit tests, mutating-`fs`-surface denial in the gate, plus the smaller robustness items in the task lines.
- **Known-bad state avoided:** a package whose test suite can silently run nothing, whose entry point dies under a common Node flag, and which cannot be stopped with Ctrl-C once used.
- **KEEP — everything from Loop 1, plus:** `src/adapters/fs/realpath.ts` as the fs adapter's first member, which resolved the AD-1 conflict through the seam rather than around it and gave the gate a legitimate `node:fs` importer on the real tree; the 10-mutation battery and its harness; the honest labelling of the abort-guard requirement as structurally rather than behaviourally verified; and the deferred `--help`/`--version` pinned as exiting 2.

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
