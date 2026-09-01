---
title: 'Story 1.4 — Open the browser, but never depend on it'
type: 'feature'
created: '2026-09-01'
status: 'done'
baseline_commit: '90f69d9cf8640fd2789b9684c3d6b5718234b591'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The tool prints a URL and stops. Nothing opens a browser, and nothing can be told not to — `parseArgs` runs strict with an empty options map, so `ACCEPTED` reads "No flags are accepted" and `--help`, `-h`, `--version` and `--port` all exit 2. A practitioner over SSH or in a container has no way to say "don't try", and one on a desktop has to copy the URL by hand.

**Approach:** Add a browser adapter that launches best-effort and never gates serving, and open the CLI's flag surface in one pass rather than four: `--no-open`, `--port`, `-h`/`--help` and `--version`. The ordering AD-15 requires — bind, report, *then* attempt — is preserved by construction and asserted by event order rather than by timing.

**Scope note (user decision, 2026-09-01):** this is deliberately multi-goal. The browser adapter, the port option and the help/version pair are three independently shippable deliverables, taken together because all four flags touch the same `parseArgs` options map and the same two usage strings, and splitting them means editing those same lines three times with three review rounds. The user chose this with the cost stated.

## Boundaries & Constraints

**Always:** The server binds and reports its URL before any launch is attempted; launch failure is reported and ignored, never fatal, and no code path makes serving conditional on a browser (AD-15). `node:child_process` is imported only inside `src/adapters/browser/`, and the launcher is invoked with an argument vector and **no shell**, so a URL can never be interpreted as a command. The launched child is detached with its stdio ignored, so it neither holds the event loop open nor writes into our output. `--help` and `--version` exit 0 without binding a socket or launching anything; usage errors exit 2 naming both the offending value and what is accepted. The version comes from `package.json` and is verified against the built artifact, not asserted from a copy. Ordering guarantees are tested as the order of observable events, never as a timing window.

**Ask First:** Any change to what the tool binds, reads or writes. Any runtime dependency. A launch mechanism that needs a shell.

**Never:** No browser detection, no probing of `DISPLAY`, no guessing whether a launch will work — attempt and report. No second attempt, no fallback launcher chain: one command per platform, and failure is an outcome rather than something to retry around. No waiting on the browser: the tool does not know or care whether a page was opened. No writing to the target project, and no outbound network request (the launcher opens a loopback URL). No `--open` as the inverse of `--no-open`. No config file, environment variable or persisted preference for any flag — the tool persists nothing (AD-12).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Launch succeeds | default invocation | URL printed, then a browser opened at it | N/A |
| Launch fails | no launcher on the platform's PATH | reported on stderr; exit stays 0 and the server keeps serving | report and ignore |
| Headless environment | SSH, container, WSL, CI | same as launch failure — reported once, ignored | report and ignore |
| Launcher present but refuses | `xdg-open` with no handler, exits non-zero at once | reported as a failure, not as success | report and ignore |
| Suppressed | `--no-open` | URL printed; no launch attempted at all | N/A |
| Preferred port | `--port 3000`, free | binds 3000 and reports 3000 | N/A |
| Preferred port taken | `--port 3000`, already bound | falls back to an OS-assigned port and reports the port actually bound | existing retry path |
| Port not a valid port | `abc`, `-1`, `65536`, `1.5`, empty | exit 2 naming the value and the permitted range | usage error |
| Help | `--help` or `-h` | usage on stdout, exit 0; nothing bound, nothing launched | N/A |
| Version | `--version` | the version `package.json` declares, exit 0; nothing bound | N/A |
| Unknown flag | `--nope` | exit 2 naming the flag and what is accepted | usage error |

</frozen-after-approval>

## Code Map

Stories 1.1–1.3 are done and pushed. 275 tests, zero runtime dependencies, `HEAD` at `90f69d9`.

- `src/cli/index.ts:17-18` -- `USAGE` and `ACCEPTED`. `ACCEPTED` states "No flags are accepted" and is wrong the moment this story lands; it feeds three error messages.
- `src/cli/index.ts:70` -- `parseInvocation`, whose `parseArgs` call has `options: {}` and `strict: true`. Strict is why every flag exits 2 today, and it must stay strict so an unknown flag still does.
- `src/cli/index.ts` `run()` -- the ordering comment beginning "**Readiness is announced last**" is load-bearing and was earned by a defect that failed one run in six. The launch goes *after* `stdout(handle.url)`; nothing moves above it.
- `src/cli/index.ts` `RunDependencies` -- `start`, `stdout`, `stderr`, `onSignal`, `exit`. Gains an injectable launcher so the ordering can be asserted without opening a real browser.
- `src/adapters/http/server.ts` `StartServerOptions.port` -- already implemented with validation and an `EADDRINUSE`/`EACCES` fallback, and reachable only from tests. `--port` is its first real consumer, which is why the fallback row above is finally a real path.
- `test/architecture.test.ts` -- the AD-1 gate **already permits** `src/adapters/browser/`, and a test plants a `browser` adapter in a scratch tree to prove it. No gate change expected; this story is the first real occupant.
- `test/cli/startup-order.test.ts` -- the existing event-order harness, including the recording-stub pattern added in Story 1.3. The launch-ordering assertion belongs here.
- `package.json:27` -- the `build` script. `--version` needs the version inlined at build time; see Design Notes for why neither a JSON import nor a build-time file read works.
- `scripts/run-tests.ts:32` -- `DEFAULT_MIN_TESTS` is 275 and must rise.

To create:

- `src/adapters/browser/open.ts` -- the launcher: one command per platform, spawned with an argv vector and no shell
- `test/adapters/browser.test.ts` -- the platform table, the no-shell property, and failure being an outcome
- `test/cli/flags.test.ts` -- the four flags, their exit codes, and the usage errors

## Tasks & Acceptance

**Execution:**
- [x] `src/adapters/browser/open.ts` -- resolve a platform command and spawn it detached with stdio ignored; resolve to a result describing success or the reason, never reject -- FR-5, NFR-13, AD-15
- [x] `src/cli/index.ts` -- declare the four options on the strict `parseArgs` call; validate `--port` as an integer in range; rewrite `USAGE` and `ACCEPTED` and add the help text -- FR-6
- [x] `src/cli/index.ts` -- handle `--help`/`-h` and `--version` before any socket is bound, exiting 0; attempt the launch only after the URL is on stdout -- AD-15
- [x] `package.json` -- inline the version at build time via an esbuild define, with a `dev` fallback for unbundled runs -- FR-5
- [x] `test/adapters/browser.test.ts` -- the platform command table, that no invocation passes a shell, that the child is detached and ignored, and that a failing launcher yields a reported result rather than a rejection -- NFR-13
- [x] `test/cli/flags.test.ts` -- every matrix row for the four flags, including each rejected `--port` value and the unknown-flag message -- FR-6
- [x] `test/cli/startup-order.test.ts` -- the URL reaches stdout before the launcher is called, and `--no-open` calls it not at all, asserted as event order -- AD-15
- [x] `test/cli-entry.test.ts` -- `node dist/cli/index.js --version` prints exactly the version `package.json` declares, so the build-time inlining is verified at the consuming end -- FR-5
- [x] `test/cli/flags.test.ts` -- every declared option appears in the help text and every option the help text documents is declared, checked in both directions, so neither can drift from the other -- FR-6
- [x] `test/cli-entry.test.ts` -- shadow the platform launcher on `PATH` with a recorder and assert a real, unsuppressed invocation reaches it with the announced URL -- *added in loop 1; substituting `openBrowser` passed 311 tests* -- FR-5, AD-15
- [x] `test/cli/startup-order.test.ts` -- a requested port that could not be bound is reported; an honoured port and the default are not -- *added in loop 1* -- FR-6
- [x] `scripts/run-tests.ts` -- raise `DEFAULT_MIN_TESTS` to the new total

**Acceptance Criteria:**
- Given a platform whose launcher does not exist, when the tool starts, then it prints the URL, reports that it could not open a browser, and continues serving with exit code 0.
- Given `--help` or `--version`, when the tool runs, then no socket is bound and no launcher is invoked — asserted, not assumed, since both would otherwise be invisible.
- Given the launcher is replaced with one that records its arguments, then no argument vector contains a shell, a shell metacharacter, or the URL concatenated into a command string.

## Design Notes

**`--version` is inlined by the build, and verified against the built artifact.** Three other routes were tried and rejected. A `package.json` JSON import typechecks, runs under `node --test` and bundles — but esbuild inlines the **whole** file, so `dist/cli/index.js` would ship devDependencies, script commands and repository metadata to every consumer; measured, not assumed. Reading `package.json` in the build script needs `node:fs`, which AD-1 confines to `src/adapters/fs/` and the gate scans `scripts/`. Reading it at runtime through the fs adapter works but adds a runtime failure mode and a path assumption to a flag whose entire job is printing a string. So the version is an esbuild `--define`, the source carries a `dev` fallback for unbundled runs, and a test spawns the built `dist/cli/index.js --version` and compares its output to `package.json` — which verifies the whole chain rather than the duplication.

**The help text, specified here rather than invented during implementation.** It is the tool's largest piece of user-facing prose so far, and the last three lines are deliberate: they state the guarantees a reader most wants from something they are about to point at their work.

```
Usage: bmad-dash [path] [options]

A read-only local dashboard over a BMAD project's artifacts.

Arguments:
  path          the BMAD project to inspect (default: the current directory)

Options:
  --no-open     do not launch a browser; the URL is still printed
  --port <n>    preferred port, 0-65535 (default: 0, an OS-assigned port)
  -h, --help    print this message and exit
  --version     print the version and exit

Binds 127.0.0.1 only. Never writes to the project. Makes no outbound
network request.
```

**`launch` is a required dependency, and that was earned the hard way.** Every other entry in `RunDependencies` is optional with a default, because every other default is inert or observable from a test. This one reaches out of the process and changes something on the user's desktop. It was optional for one afternoon, and in that time five in-process `run()` calls and one shell pipeline opened real browser tabs on every suite run — the tests injected `start` and `stdout` faithfully and simply never thought about the launcher, because nothing made them. The user noticed before any test did. Requiring it moves "a test forgot to stub the launcher" from something a grep might catch to something that does not compile; the spawned-CLI case is not reachable that way, since the child parses its own argv, so those are suppressed in the spawn helpers and a scanning test keeps them there.

**One command per platform, and no shell.** `open` on darwin, `xdg-open` elsewhere; Windows takes `rundll32 url.dll,FileProtocolHandler` rather than `cmd /c start`, because `start` is a shell builtin and reaching it means a shell, which is the one thing a URL must never be handed to. WSL is deliberately not special-cased: `xdg-open` is often absent there, the launch fails, and that is a correct outcome under NFR-13 rather than a case to detect.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm test` -- expected: all pass, none skipped, floor raised
- `npm run build && node dist/cli/index.js --version` -- expected: the version in `package.json`, exit 0
- `node dist/cli/index.js --help` -- expected: usage on stdout, exit 0, no server bound
- `PATH= node dist/cli/index.js` -- expected: URL printed, launch failure reported, still serving
- `npm pack --dry-run` -- expected: `dist/`, `LICENSE` and metadata only

**Matrix audit.** Every row is covered by a test that ran, with one honest qualification: *headless environment* and *launch fails* are the same code path — a launcher that is not on `PATH` is exactly what a headless box looks like from here — so they share coverage rather than having one test each. Verified separately by hand with `env PATH=/nonexistent node dist/cli/index.js`, which printed the URL, reported the failure and kept serving a 200.

**Suite hygiene.** A full run opens zero browser tabs, measured rather than assumed: `xdg-open` was shadowed on `PATH` with a recorder and the log file was never created.

**Manual checks:**
- Run `node dist/cli/index.js` on this machine and confirm a browser actually opens at the URL. The adapter is tested with an injected launcher, so a real launch is the one thing the suite cannot prove.

## Spec Change Log

### Loop 1 — bad_spec, patched in place (user decision)

- **Trigger:** three reviewers. The decisive finding: replacing `openBrowser` at the composition root with a no-op passed all 311 tests, so the story's headline feature could have stopped working entirely with a green suite. Six behavioural defects came with it, each verified by hand against the built CLI.
- **Root cause was the spec, for the third consecutive story, and the standing fix from the second did not prevent it.** The verification standard added to `_bmad/custom/bmad-build.toml` after Story 1.3 says a value produced in one module must be observed at the module consuming it. I applied that to **values** — and caught the `--port` seam myself before this gate because of it — and never to **wiring**. The composition root's choice of *which implementation to inject* is the seam that decides whether a feature exists at all, and making `launch` a required dependency only catches omission; substitution is invisible to the type system.
- **So the amendment is not in this spec.** The standing fact now covers wiring explicitly, with the note that a rule naming one shape of a recurring failure gets applied to that shape and no further.
- **Behavioural defects fixed:** a requested port that could not be bound was dropped in silence (`--port 45999` bound 36203 with nothing on stderr); `--port 0080` was accepted, parsed to 80, and — 80 being privileged — fell back and bound 40821, a typo silently reinterpreted twice; `--port -1` returned Node's "argument is ambiguous" prose and never named the range the matrix promised; `--help --nope` exited 2 while the matrix and a test name both said help wins; the launcher reported "the process started" as success, so a handler-less `xdg-open` exiting 3 left the reader with no browser and no message; the URL was passed without an end-of-options separator, so a URL beginning with `-` would have become an option; and the version's esbuild `--define` smuggled a quoted string through the shell in a form `cmd.exe` does not strip, so a Windows build would have shipped `"0.1.0"` with the quotes — on the one platform this story goes out of its way to support a launcher for.
- **My own guard was the same failure in miniature.** The suite-hygiene scanner carried a comment claiming "the count below is checked rather than assumed" while checking no count at all, matched line by line so a wrapped call escaped it, and matched *any* `node` spawn — which forced a meaningless `--no-open` onto `node --test` invocations in a discovery test that never runs the CLI. Rewritten to scan whole calls, to match only spawns naming the entry point, and to fail when it stops matching. Both escapes are now demonstrated to fail.
- **Known-bad state avoided:** a tool that silently ignores the port you asked for, silently reinterprets a mistyped one, tells you nothing when your browser does not open, refuses to show help to the reader who most needs it, and reports a quoted version string on Windows.
- **KEEP — earned here:** `launch` as a required dependency, which is still right and still catches omission at compile time; the platform launcher table with no detection and no fallback chain; `LaunchResult` as an outcome rather than an exception, so a failed launch cannot become fatal; the `--` separator before the URL; the version in a one-key file rather than in `package.json` or a shell-quoted define, with `prepublishOnly` running the suite so a stale copy cannot be published; and the `PATH`-shimmed recorder as the way to prove a real launcher is reached without opening a tab.

## Suggested Review Order

**Best-effort launch, and what "best-effort" turned out to mean**

- Start here: one command per platform, no detection, no fallback chain.
  [`open.ts:55`](../../src/adapters/browser/open.ts#L55)

- Never rejects — a failed launch is an outcome the caller reports, not an error.
  [`open.ts:75`](../../src/adapters/browser/open.ts#L75)

- A launcher that starts is not one that worked: a fast non-zero exit is a failure.
  [`open.ts:119`](../../src/adapters/browser/open.ts#L119)

- The grace window that separates "refused at once" from "found something to do".
  [`open.ts:40`](../../src/adapters/browser/open.ts#L40)

**The flag surface**

- `--` before the URL: no shell is not the same guarantee as no argument injection.
  [`open.ts:95`](../../src/adapters/browser/open.ts#L95)

- Help is answered before parsing, so a mistyped flag still gets the help text.
  [`index.ts:200`](../../src/cli/index.ts#L200)

- A plain decimal integer only — `0080` was accepted, then bound something else entirely.
  [`index.ts:122`](../../src/cli/index.ts#L122)

- Node's ambiguous-value prose never names the range, so this branch does.
  [`index.ts:240`](../../src/cli/index.ts#L240)

- A port that could not be honoured is reported rather than quietly substituted.
  [`index.ts:404`](../../src/cli/index.ts#L404)

- After the announcement, and never a gate: AD-15 as an ordering.
  [`index.ts:425`](../../src/cli/index.ts#L425)

**The two seams this story is really about**

- Required, unlike every other dependency — the only one that reaches the user's desktop.
  [`index.ts:318`](../../src/cli/index.ts#L318)

- And required only catches omission, so this proves the real launcher is reached.
  [`cli-entry.test.ts:342`](../../test/cli-entry.test.ts#L342)

- The version in a one-key file: not `package.json`, which esbuild inlines whole.
  [`index.ts:46`](../../src/cli/index.ts#L46)

- The duplication that choice creates, guarded — with `prepublishOnly` running it.
  [`cli-entry.test.ts:307`](../../test/cli-entry.test.ts#L307)

**Gates added by the review loop**

- Scans whole calls, matches only CLI spawns, and fails when it stops matching.
  [`flags.test.ts:208`](../../test/cli/flags.test.ts#L208)

- A refusing launcher must not be reported as success.
  [`browser.test.ts:191`](../../test/adapters/browser.test.ts#L191)

- The fallback is announced; an honoured port and the default stay quiet.
  [`startup-order.test.ts:357`](../../test/cli/startup-order.test.ts#L357)

- Help wins over a flag the parser does not know — which it did not, before.
  [`flags.test.ts:277`](../../test/cli/flags.test.ts#L277)
