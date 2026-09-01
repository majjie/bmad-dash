---
id: SPEC-bmad-dash
companions:
  - bmad-source-shapes.md
  - ../../planning-artifacts/architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/prds/prd-bmad-2026-08-28/prd.md
  - ../../planning-artifacts/prds/prd-bmad-2026-08-28/addendum.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# bmad-dash

## Why

**A pain to solve.** BMAD records everything it does — planning artifacts, per-run folders, append-only memlogs, sprint tracking — faithfully and unreadably. The record is complete; retrieving anything from it costs sustained effort, paid most often at the moment the user has least context: returning to a project, or checking a stage an agent just finished.

The people affected are BMAD practitioners exercising judgement over machine-generated work. The job is oversight: confirming nothing overtly wrong, no egregious assumption or hallucination, has entered the artifacts before anything downstream builds on them. Today that means opening several files in different formats and reconstructing state no single file states.

Two failures compound it. Specs reach ~24,000 words, which is a wiki with no navigation. And nothing answers "what is in flight" — `sprint-status.yaml` knows about epics and stories, frontmatter knows whether one document is draft or final, and nothing joins them.

## Capabilities

- **CAP-1**
  - **intent:** A practitioner can run one command against a project folder and reach a working dashboard in a browser.
  - **success:** `npx bmad-dash [path]` with no prior install serves on loopback, reports its URL, and opens a browser; with no path it targets the working directory; it works when run from anywhere inside the project, and remains usable when no browser can be launched.

- **CAP-2**
  - **intent:** The tool can interpret an arbitrary BMAD project's artifacts, whatever their version, naming, or layout.
  - **success:** Artifacts are identified without relying on filenames; whole and pre-sharded documents are handled equivalently; unrecognized shapes appear as present-but-uninterpreted rather than dropped; a project with no sprint tracking, or none of a given artifact family, renders without error.

- **CAP-3**
  - **intent:** A practitioner returning to a project can see what has recently been active and reach what is central, without judging the tool's ordering on faith.
  - **success:** The landing view lists recent activity ordered by the reliability hierarchy, and each entry discloses which evidence placed it and at what resolution; entries that cannot be ordered are grouped rather than falsely positioned; core artifacts are reachable directly, with absent ones shown as absent at low visual weight.

- **CAP-4**
  - **intent:** A practitioner can read any artifact through a view suited to that artifact's shape rather than a generic renderer.
  - **success:** A memlog reads as a typed timeline with overrides and assumptions distinguishable at a glance; a reviewer output reads as findings with its verdict legible without the prose body; sprint tracking reads as epic and story state with open action items; every viewer offers the file path and an open-in-editor affordance, and renders a degraded artifact explicitly rather than omitting it.

- **CAP-5**
  - **intent:** A practitioner can navigate a document too large to read as a single page, and return to any part of it later.
  - **success:** A ~24,000-word document is navigable as linked pages with a persistent contents view; an already-sharded document uses its existing shard boundaries; any section has a permalink stable across refreshes and independent of how the document was divided.

- **CAP-6**
  - **intent:** A practitioner can see what in a project warrants scrutiny, and can tell what the tool examined from what it did not.
  - **success:** Memlog overrides and assumptions, in-document risk markers, documents marked final while carrying open items, and reviewer findings aggregated across run folders are all surfaced; for every artifact and signal the tool reports one of present, absent, unreadable, or unchecked, so "nothing was flagged" is never confusable with "nothing was checked"; a project built entirely through `bmad-build`, legitimately carrying no planning artifacts, raises no deficiency; and a practitioner can nominate two artifacts and see them side by side, the tool asserting no relationship between them.

## Constraints

- The tool never writes, moves, deletes, or modifies anything in the target project. This is enforced structurally and verified by test, not held as a convention — including through subprocesses, which are a write path an import check alone will not see.
- Git is invoked in a read-only manner that cannot rewrite repository state, and a scanned repository's own configuration must not be able to cause command execution.
- No telemetry, analytics, or outbound network request of any kind. The server binds the literal loopback address and rejects requests whose `Host` header does not match what it bound.
- Nothing is persisted outside the process. The tool has no memory of previous runs and no state in the target project.
- The tool surfaces risk and never judges correctness. No LLM evaluation, no assessment of whether an assumption is reasonable, no assertion of a relationship between artifacts it cannot evidence.
- False alarms are a first-order failure: a signal users learn to dismiss is worse than no signal, so risk indication errs toward silence — bounded by the requirement that silence always distinguishes itself from not having looked.
- Activity signals come only from what BMAD natively provides plus git. Uncommitted working-tree state ranks above commit history, because agents write without committing.
- Refresh is user-initiated. The tool does not watch the filesystem, and displayed data always states how current it is.
- Scope is the single target project. No cross-project library, no scanning of unrelated paths.
- Distribution is `npx` with no install step and no dependency added to the target project; dependency count is itself constrained, because every dependency is latency on every invocation.
- Concept explanations must be true for the BMAD version installed in the *target* project; an explanation known to be stale is withheld rather than shown.

## Non-goals

- Judging correctness — detecting hallucination, or evaluating whether an assumption or requirement is sound. That is a different product with different accuracy and trust characteristics.
- Automated cross-artifact consistency checking, including technology-version divergence detection. Comparison is a manual act the tool supports by placing two user-nominated artifacts side by side.
- Full-text search across artifact content. It is the only capability that would oblige reading every file for rendering rather than extraction, and it shapes the whole read layer.
- Any write path, including convenience ones: marking a story done, resolving an open question, or launching a skill.
- Live updating or filesystem watching.
- Cross-project browsing, project discovery on disk, or a library of other projects' runs.
- Remembering the user between runs.
- Deferred to a later release, specified but not built now: concurrent live-thread presentation, historical-corpus browsing, and the concept-explanation glossary.

## Success signal

v1 has succeeded when the aggregate time and mistake costs it saves across its user pool outweigh the cost of proceeding to v2 — a comparison assessed at the moment the v2 question is actually asked, and falsifiable in the sense that if the saving does not clear the build cost, v1 did not succeed. The supporting evidence is colleagues reporting, on real projects, that the tool surfaced something they would otherwise have missed.

## Assumptions

- Node is present on a target machine, on the grounds that BMAD is itself normally installed via `npx`.
- Timezone-naive timestamps in BMAD artifacts are interpreted in the local timezone of the machine running the tool.
- The dashboard's audience is one role in two postures — a fluent practitioner and a newer user — served by one dense interface with opt-in explanation, not by two modes.

## Open Questions

- None blocking. Residual medium and low findings from three PRD reviews and three architecture reviews remain recorded in their run folders as an implementation-planning checklist.
