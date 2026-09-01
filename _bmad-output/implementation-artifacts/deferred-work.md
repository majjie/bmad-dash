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
