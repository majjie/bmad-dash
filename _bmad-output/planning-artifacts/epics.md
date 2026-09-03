---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/specs/spec-bmad-dash/SPEC.md
  - _bmad-output/specs/spec-bmad-dash/bmad-source-shapes.md
  - _bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/EXPERIENCE.md
---

# bmad-dash - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for bmad-dash, decomposing the requirements from the PRD, the UX design contract, and the architecture spine into implementable stories.

**Scope is v1 only** — capability groups C1 through C6. C7 (live threads), C8 (corpus navigation) and C9 (concept explanation) are deferred and generate no stories here.

**FR IDs are the PRD's own and are never renumbered.** The PRD assigns stable global IDs and explicitly forbids reuse or renumbering; eight IDs are retired (FR-28, FR-57 to FR-59, FR-61, FR-63 to FR-65) and must not be revived.

## Requirements Inventory

### Functional Requirements

59 active v1 requirements across six capability groups.

**C1 — Invocation and serving (9)**

- FR-1: Invoked as a single CLI command taking an optional path to a target project folder.
- FR-2: With no path given, the current working directory is the target.
- FR-3: Serves a web UI over HTTP on the loopback interface only.
- FR-4: Selects an available port automatically and reports the chosen URL on stdout.
- FR-5: Opens the user's default browser at the served URL on start.
- FR-6: Browser launch suppressible by flag, with the URL still reported.
- FR-7: With no recognizable BMAD project, the tool does not serve and does not launch a browser. It exits reporting the path examined and what was looked for, plus the exact invocations that would have worked — every candidate a bounded scan finds.
- FR-45: Distributed for `npx` execution, runnable without prior installation and without adding a dependency to the target project.
- FR-46: Requires no configuration in the target project to run.

**C2 — Project interpretation (15)**

- FR-8: Artifacts identified by a defined four-level precedence, stopping at the first that resolves: config-declared location, frontmatter type, structural signature, filename hint. Filename alone is never sufficient.
- FR-9: A document is handled equivalently whether single-file or pre-sharded as a directory with `index.md`.
- FR-10: Artifact roots read from the target project's own configuration, not assumed. **Deferred indefinitely 2026-09-02** — until it lands, roots stay at their measured defaults.
- FR-11: All seven run-folder families recognized: briefs, PRDs, architecture, UX designs, research, specs, forge.
- FR-12: Unrecognized artifact shapes listed as present-but-uninterpreted, never hidden or dropped.
- FR-49: `{slug}` treated as a context-dependent name, never an identity.
- FR-50: Review outputs located wherever the producing skill writes them — workspace root or a `reviews/` subfolder.
- FR-51: Epic and story locations resolved from `story_location` in `sprint-status.yaml`, which is per-project configuration.
- FR-69: An artifact no precedence level resolves is presented as unidentified, naming which levels were attempted.
- FR-70: Project root is the target path itself and resolution never walks in either direction, so nested or sibling roots are unresolvable rather than resolved by precedence. A separate bounded scan — the full ancestor chain plus two levels below, skipping dot-directories and `node_modules` — runs only to construct FR-7's suggestions and is never a resolution path.
- FR-71: A run folder may contain more than one run; four of seven patterns are constant within a day.
- FR-72: Two run-folder patterns carry no date; ordering for those families falls to the FR-14 hierarchy.
- FR-73: Where a run folder and a sharded document cannot be distinguished, the ambiguity is presented, not silently resolved.
- FR-74: `story_location` may be relative or absolute and may point outside the project; resolved, reported when out-of-tree, never served from there.
- FR-75: Absence of `sprint-status.yaml` is a normal project shape; the dashboard renders fully without it.

**C3 — Recent activity and core artifacts (16)**

- FR-13: Default view on open is a chronological list of recent project activity.
- FR-14: Activity ordering derives from a six-tier reliability hierarchy: uncommitted working-tree changes, git commit timestamps, `.memlog.md` frontmatter `updated`, document frontmatter `updated` (date only), run-folder date, filesystem mtime last.
- FR-15: Each activity entry displays the resolution and source of its own timestamp; unorderable entries are grouped, not falsely positioned.
- FR-16: Selecting an activity entry opens the viewer appropriate to that artifact type.
- FR-17: Activity filterable by artifact family and time window.
- FR-37: Refresh is user-initiated; the UI does not watch the filesystem.
- FR-47: Displayed data states how current it is.
- FR-52: Alongside the feed, a persistent set of core artifacts, each directly reachable.
- FR-53: Centrality follows BMAD's own declaration — PRD and epics/stories essential, architecture/UX/spec optional.
- FR-54: An absent core artifact is shown as absent at low visual weight, informational rather than a call to action.
- FR-55: Absence elevated above neutral only when something else on disk implies the artifact should exist.
- FR-56: False alarms treated as a first-order failure; risk indication errs toward silence.
- FR-62: Git consulted where the project is a repository, per FR-14.
- FR-66: `.memlog.md` entries carry no per-entry timestamp; memlogs record sequence, not time, and must not be interleaved on a timeline.
- FR-67: Timestamps normalized on read from at least four incompatible formats, three of them timezone-naive.
- FR-76: Conservatism has a floor: the oversight view always reports what was examined, what could not be interpreted, and which signals were unavailable.

**C4 — Artifact viewers (7)**

- FR-18: Each artifact type rendered by a viewer designed for its shape, not a generic markdown renderer.
- FR-19: Memlog viewer presents the append-only trail as a typed, filterable timeline, with `override` and `assumption` distinguishable at a glance.
- FR-20: Review viewer presents `review-{slug}.md` as findings, verdict and severity legible without reading the prose body.
- FR-21: Reconciliation viewer presents `reconcile-{slug}.md` as gaps between a source input and the resulting document.
- FR-22: Addendum viewer presents `addendum.md` as content deliberately excluded from its parent, linked to that parent.
- FR-23: Sprint viewer presents `sprint-status.yaml` as epic and story state, retrospective status, and open action items with owners.
- FR-24: Every viewer offers copy-to-clipboard of the file path and an open-in-editor affordance.

**C5 — Large-document navigation (4)**

- FR-25: Documents navigable as a linked set of pages derived from heading structure.
- FR-26: A persistent table of contents reflecting document structure available alongside content.
- FR-27: Any section has a stable permalink that survives reload.
- FR-77: Where a document is already sharded by BMAD, its shard boundaries become the page structure; heading-weight carving applies only to whole documents.

**C6 — Oversight surfacing (8)**

- FR-29: Memlog `override` and `assumption` entries surfaced prominently where they exist, with reliability qualified rather than assumed.
- FR-30: Explicit in-document risk markers surfaced where present.
- FR-31: Marker coverage presented honestly; absence of markers does not imply absence of risk.
- FR-32: Structural risk computable without judgement surfaced, including documents marked final carrying unresolved open items.
- FR-33: Reviewer findings aggregated across the project rather than siloed in run folders.
- FR-34: Project-level deviations read from `_bmad/custom/*.toml`, not a skill's shipped `customize.toml`.
- FR-60: The user nominates two artifacts and the tool places them side by side, asserting no relationship between them.
- FR-68: Memlog coverage presented as partial; `bmad-build` writes no memlog, so a build stage leaves no trail.

### NonFunctional Requirements

- NFR-1: Never writes, moves, deletes or modifies anything in the target project. Enforceable invariant, verified by test.
- NFR-2: Any tool-owned state lives outside the target project.
- NFR-3: Truncated, partially written or transiently invalid files handled without crashing and without presenting corrupt data as valid.
- NFR-4: A single unparseable artifact degrades to an explicit error for that artifact only.
- NFR-5: Tolerates BMAD versions other than the one developed against, degrading to present-but-uninterpreted.
- NFR-6: Reliance on unstable sources guarded; extraction from convention-defined sources fails loudly rather than silently returning nothing.
- NFR-7: Cold start short enough that checking is not a deliberate act. Target under two seconds; aspirational, not a release gate.
- NFR-8: A ~24,000-word document opens and navigates without perceptible delay.
- NFR-9: Server binds explicitly to `127.0.0.1` and no other interface, by literal address rather than the name `localhost`.
- NFR-10: File serving confined to the target project's artifact tree; path traversal prevented.
- NFR-11: No telemetry, analytics or outbound network requests of any kind.
- NFR-12: Works on Linux, macOS and Windows.
- NFR-13: Environments where a browser cannot be launched remain usable via the reported URL.
- NFR-14: The dense default view is fully keyboard navigable.
- NFR-15: Meets WCAG 2.2 AA for contrast and focus visibility; no meaning encoded in colour alone.
- NFR-16: Refresh latency is the binding performance requirement, paid repeatedly within a session.
- NFR-17: Every path segment derived from project content sanitized before use, on both the filesystem and URL surfaces.

### Additional Requirements

From the architecture spine (19 architecture decisions, hexagonal paradigm, feature altitude).

**No starter template.** The spine specifies no starter, scaffold or generator. Epic 1 Story 1 is a hand-rolled project skeleton conforming to the spine's directory contract, not an initialization from a template.

- Hexagonal layering enforced by directory: `src/domain/` (pure), `src/ports/`, `src/adapters/{fs,git,http}/`, `src/render/`, `src/cli/` (composition root), `web/` → `public/`.
- AD-1: Only `src/adapters/fs/` may import `node:fs`; only the git and browser adapters may import `node:child_process`. A test asserts nothing else does.
- AD-2: Server renders document content; client enhances delivered markup only. No client-side router owns a document URL.
- AD-3: One immutable snapshot per refresh. The scan reads each artifact once and extracts identity, timestamps and every oversight signal; the rendering parse is deferred to first open and cached for the snapshot's life.
- AD-4: Artifact identity decided once, in one domain module, during the scan.
- AD-5: Timestamps converted to absolute instants at the adapter boundary; naive sources interpreted in the tool machine's local zone, fixed.
- AD-6: Ordering evidence travels on the item; unordered is a value, with a documented tiebreak.
- AD-7: Typed degradation — never an exception aborting the pass, never a silent omission.
- AD-8: Signal availability recorded per artifact and per signal as exactly one of present, absent, unreadable, unchecked.
- AD-9: Project root resolved once in the composition root; exactly one permitted root, never widened (narrowed 2026-09-02; artifact roots from config are deferred with FR-10).
- AD-10: Content-derived path segments sanitized and confinement-checked on every read, with **one scoped exception** (added 2026-09-02): the not-a-project suggestion scan enumerates directory *names* outside the permitted root, reads nothing, and is importable only by that scan.
- AD-11: Currency mismatch surfaced on open with a refresh offer.
- AD-12: Ephemeral single process; nothing persisted, no outbound network, literal `127.0.0.1`.
- AD-13: Convention-derived sources validate that extraction produced something and fail visibly.
- AD-14: One canonical path representation; platform difference confined to the adapter.
- AD-15: Browser launch best-effort; the server binds and reports before any launch attempt.
- AD-16: Git invoked read-only in the strong sense — optional locks disabled, repository-configured hook and monitor mechanisms neutralized, reporting commands only.
- AD-17: A rendered page belongs to exactly one snapshot; the currency probe is never cached.
- AD-18: Document and section URL grammar fixed and server-owned; section URLs stable across refreshes and independent of how the document was divided.
- AD-19: Requests rejected unless the `Host` header matches the bound address and port.
- Stack, verified 2026-08-28: Node 24 (floor 22), markdown-it 15.x, yaml 2.x, Preact 10.x, esbuild 0.28.x, `node:http`, `node:util` parseArgs, git as a subprocess. Prebuilt client assets ship in the package so `npx` never builds.
- Watch items: Node 24 leaves Active LTS 2026-10-20; Preact 11 RC reworks hydration at the AD-2 seam.

### UX Design Requirements

From the UX design contract (DESIGN.md + EXPERIENCE.md), both final. 24 colour tokens, 8 type roles, 4 motion tokens, 12 spacing tokens, 10 component token sets, 6 surfaces, a 25-row string index, 8 keyboard bindings, 8 edge conditions.

- UX-DR1: Implement the token layer as the single source of visual values — 24 colour, 8 typography, 4 motion, 12 spacing, 5 radius tokens. No component may carry a hex, px or rem literal; every value resolves through a token.
- UX-DR2: Implement tonal elevation as the only depth mechanism. Three levels of the surface-container ladder govern peer surfaces; a surface nested inside another is relative to its container and takes two ladder steps of separation, because one step is below the ratio at which a tonal boundary reads as an edge. Since nesting exhausts the ladder, hover and other transient states change the outline rather than the surface. No shadow, gradient or blur anywhere in the system. *(Amended 2026-09-01: previously read "three levels ... at rest", which contradicted the core-artifact card's own tokens; DESIGN.md's Elevation & Depth section was rewritten and this followed.)*
- UX-DR3: Declare IBM Plex Sans, Mono and Serif with system fallback stacks — **no font file is shipped and none is fetched**, because NFR-11 forbids any outbound request *(verb corrected 2026-09-03: the requirement said "Load", which the implementation deliberately does not do)* — and apply the mono role semantically: any string originating from the filesystem or naming a machine state is monospaced.
- UX-DR4: Enforce two type floors — content text at or above `body-dense`, labels and badges at or above 11px. Density is achieved by compressing spacing, never by shrinking type.
- UX-DR5: Build the `tile` component: uppercase label in `on-surface-variant`, content below, one kind of information per tile, meaningful when its data is empty, partial or unavailable.
- UX-DR6: Build `tile-raised`, identical but one ladder step higher, at most one per surface.
- UX-DR7: Build `activity-row`: primary text, monospaced secondary line, evidence badge pinned right, divider between rows and none on the last, whole row activating on click or Enter.
- UX-DR8: Build `evidence-badge` with two visual weights — strong for commit and uncommitted evidence, weak for day-resolution and file-time — where the weight never carries information the text omits, and the tier is part of the row's accessible name.
- UX-DR9: Build `signal-pill` for the closed four-state set, each state carrying its colour, its container, a 1px stroke in its own signal colour, and its state word. Never colour alone.
- UX-DR10: Build `core-artifact-card`: name, monospaced status line, `on-surface-faint` when absent with no opacity applied, keeping grid position and not being a link when absent.
- UX-DR11: Build `button-primary` and `button-ghost`, at most one primary per surface.
- UX-DR12: Build `refresh-progress`: a 2px determinate bar with a monospaced count label in the global header; where the total is unknown, the bar is omitted and the label alone reports progress.
- UX-DR13: Build the focus ring: 2px at 2px offset on every focusable element, an additional 1px inner stroke on elements filled with `primary`, and containers reserving ring space inside their padding so no ring is ever clipped or occluded.
- UX-DR14: Build the global chrome — a project header present on every surface carrying project name, resolved root path, git availability, snapshot currency, the refresh control, and refresh progress and failure reporting.
- UX-DR15: Build the five surfaces: Dashboard, Oversight, Artifact view, Document reader, Comparison. Each reachable by URL and surviving reload. There is no no-project surface — that failure is reported in the terminal (FR-7).
- UX-DR16: Build the artifact nominator overlay — the only modal in v1 — trapping focus while open and returning focus to its trigger on close.
- UX-DR17: Implement all 25 strings in the load-bearing string index verbatim, following the stated conventions: period for sentence-shaped strings and none for label-shaped, initial capital for badge and pill labels, `<placeholder>` for substituted values.
- UX-DR18: Implement the surface-state matrix: five states across six surfaces, with the cross-cutting defaults binding and the matrix carrying departures. Includes the refresh-failure branch, where a partial scan is discarded rather than published.
- UX-DR19: Implement the eight edge conditions with their specified strings: no git repository, artifact vanished between scan and open, sharded document, `story_location` out of tree, unidentified artifact, dead section permalink, multi-run folder, valid project with zero artifacts.
- UX-DR20: Implement the keyboard model: eight bindings shared by every surface, single-letter keys inert while a text input has focus, and no surface implementing its own.
- UX-DR21: Meet the accessibility floor behaviourally: full keyboard operation, focus never obscured, nothing dependent on colour alone, banner/navigation/main landmarks with one `h1` per surface, tile labels as real headings, polite live region for refresh completion only, honest state in accessible names, and text resizing to 200% without loss.
- UX-DR22: Implement responsive behaviour at the single 900px breakpoint: tile grid to one column in reading order, contents rail above content in the Document reader. Nothing below 600px is a design target.
- UX-DR23: Implement motion: refresh progress only, instant focus transitions, and `prefers-reduced-motion` replacing determinate animation with discrete steps and indeterminate progress with a static label.
- UX-DR24: Honour the documents' precedence rules: frontmatter tokens are normative over DESIGN.md prose, and both spines win over any mockup.

### FR Coverage Map

- FR-1: Epic 1 — CLI entry taking an optional target path
- FR-2: Epic 1 — defaults to the working directory
- FR-3: Epic 1 — serves over loopback only
- FR-4: Epic 1 — auto port selection, URL on stdout
- FR-5: Epic 1 — opens the default browser
- FR-6: Epic 1 — launch suppressible by flag
- FR-7: Epic 1 — no served page; the refusal hands over the invocation that would have worked
- FR-8: Epic 1 — four-level identification precedence
- FR-9: Epic 1 — whole and sharded documents handled alike
- FR-10: **Deferred indefinitely** (2026-09-02) — artifact roots from the project's own config; not delivered in Epic 1
- FR-11: Epic 1 — seven run-folder families recognized
- FR-12: Epic 1 — unrecognized shapes present-but-uninterpreted
- FR-13: Epic 3 — activity feed as the default view
- FR-14: Epic 3 — six-tier ordering hierarchy
- FR-15: Epic 3 — per-entry evidence and resolution disclosed
- FR-16: Epic 3 — selecting an entry opens its viewer
- FR-17: Epic 3 — filter by family and time window
- FR-18: Epic 2 — per-type viewers, not a generic renderer
- FR-19: Epic 2 — memlog as a typed timeline
- FR-20: Epic 2 — review output as findings
- FR-21: Epic 2 — reconciliation as gaps
- FR-22: Epic 2 — addendum linked to its parent
- FR-23: Epic 2 — sprint status as epic and story state
- FR-24: Epic 2 — path copy and open-in-editor on every viewer
- FR-25: Epic 2 — documents as linked pages
- FR-26: Epic 2 — persistent contents rail
- FR-27: Epic 2 — stable section permalinks
- FR-29: Epic 3 — memlog overrides and assumptions surfaced
- FR-30: Epic 3 — in-document risk markers surfaced
- FR-31: Epic 3 — marker coverage presented honestly
- FR-32: Epic 3 — structural risk surfaced
- FR-33: Epic 3 — reviewer findings aggregated across the project
- FR-34: Epic 3 — deviations read from _bmad/custom
- FR-37: Epic 3 — user-initiated refresh, no watching
- FR-45: Epic 1 — npx distribution, no install
- FR-46: Epic 1 — no configuration required in the target project
- FR-47: Epic 3 — displayed data states its currency
- FR-49: Epic 1 — slugs treated as names, not identities
- FR-50: Epic 1 — review outputs found at either location
- FR-51: Epic 1 — story_location resolved from sprint-status.yaml
- FR-52: Epic 3 — persistent core-artifact set
- FR-53: Epic 3 — centrality from BMAD's own declaration
- FR-54: Epic 3 — absent core artifacts shown at low weight
- FR-55: Epic 3 — absence elevated only when implied
- FR-56: Epic 3 — false alarms are a first-order failure
- FR-60: Epic 3 — user-nominated side-by-side comparison
- FR-62: Epic 3 — git consulted where present
- FR-66: Epic 3 — memlogs record sequence, not time
- FR-67: Epic 3 — four timestamp formats normalized
- FR-68: Epic 3 — memlog coverage is partial; build writes none
- FR-69: Epic 1 — unidentified artifacts name the levels tried
- FR-70: Epic 1 — project root is the target path only, never found by walking
- FR-71: Epic 1 — a run folder may hold several runs
- FR-72: Epic 1 — dateless run-folder families
- FR-73: Epic 1 — run-folder versus sharded-document ambiguity presented
- FR-74: Epic 1 — story_location may be absolute or out-of-tree
- FR-75: Epic 1 — absent sprint tracking is a normal shape
- FR-76: Epic 3 — coverage floor — examined versus unchecked
- FR-77: Epic 2 — existing shard boundaries become pages

All 59 active v1 requirements are mapped. Eight retired IDs (FR-28, FR-57 to FR-59, FR-61, FR-63 to FR-65) are deliberately absent and must not be revived.

## Epic List

### Epic 1: Point it at a project and see what's there

Run `npx bmad-dash` at a BMAD project and reach a served page that lists every artifact, correctly identified — unrecognized shapes shown as present-but-uninterpreted, ambiguous cases shown as ambiguous, paths displayed — or, where the target is not a project, be handed the invocation that would have worked rather than a page. Establishes the hexagonal skeleton, the read-only invariant with its enforcing test, the token layer, and the global chrome that every later surface inherits.

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-11, FR-12, FR-45, FR-46, FR-49, FR-50, FR-51, FR-69, FR-70, FR-71, FR-72, FR-73, FR-74, FR-75

### Epic 2: Read any artifact properly

Open any artifact in a viewer suited to its shape — a memlog as a typed timeline with overrides and assumptions distinguishable at a glance, a review as findings with its verdict legible, sprint tracking as epic and story state — and navigate a 24,000-word document by section, with a persistent contents rail and permalinks that survive reload and are independent of how the document was divided.

**FRs covered:** FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-77

### Epic 3: See what's active and what's questionable

Land on a dashboard that shows recent activity with the evidence for its ordering disclosed on every entry, core artifacts including the absent ones, and user-initiated refresh that never publishes a partial scan. Reach an oversight surface reporting memlog overrides and assumptions, in-document risk markers, structural risk, and reviewer findings aggregated across run folders — together with what was examined, what could not be interpreted, and which signals were unavailable. Delivers the product's primary job.

**FRs covered:** FR-13, FR-14, FR-15, FR-16, FR-17, FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, FR-37, FR-47, FR-52, FR-53, FR-54, FR-55, FR-56, FR-60, FR-62, FR-66, FR-67, FR-68, FR-76

**Epic dependency flow.** Epic 1 stands alone. Epic 2 consumes Epic 1's identification verdicts and requires nothing later. Epic 3 consumes Epic 1's identification and links into Epic 2's viewers, and requires nothing later. No epic requires a future epic to function.

**Cross-cutting requirements.** The 17 NFRs and 24 UX-DRs are not epic-exclusive. Epic 1 carries the foundational ones — NFR-1, NFR-2, NFR-9, NFR-10, NFR-17 (read-only and security, with AD-1's import assertion present from the first story), NFR-12, NFR-13, and UX-DR1 to UX-DR4, UX-DR13, UX-DR14 (token layer, elevation, type floors, focus ring, global chrome). NFR-3 to NFR-5, NFR-14, NFR-15 and the accessibility floor bind every story in every epic. Remaining UX-DRs land with the surface or component they specify.

## Epic 1: Point it at a project and see what's there

Run `npx bmad-dash` from anywhere inside any BMAD project and reach a served page that lists every artifact, correctly identified. Establishes the hexagonal skeleton, the read-only invariant with its enforcing test, the token layer, and the global chrome every later surface inherits.

Acceptance criteria are stated lean: each story names the requirements it satisfies and one condition for done. The requirements themselves are the contract — the PRD, the architecture spine and the UX spines carry the detail, and restating it here would create a second source of truth. Where a story carries behaviour whose correct and incorrect states look identical on screen, the done condition names the check that distinguishes them. Visual appearance and perceived performance are judged directly by the product owner rather than specified as criteria.

**NFR-7 is deliberately unassigned.** Cold start is aspirational rather than a release gate; NFR-16, refresh latency, is the binding performance requirement and is carried by Story 3.1. No story gates on cold start.

### Story 1.1: Run the command and reach a served page

As a BMAD practitioner,
I want to run one command in my project and be given a working local URL,
So that I can reach the tool without installing or configuring anything.

**Satisfies:** FR-1, FR-2, FR-3, FR-4, FR-45, FR-46 · NFR-2, NFR-9, NFR-11 · AD-1, AD-12, AD-19

**Done when:** `npx bmad-dash [path]` serves a page and prints its URL, defaulting to the working directory; the socket is bound to the literal `127.0.0.1`; and a test asserts that no module outside `src/adapters/fs/` imports `node:fs` and none outside the git and browser adapters imports `node:child_process`. That test exists in this story, not later — the invariant is unenforceable once ten stories have been written against it. NFR-2 is satisfied by construction rather than by placement: with the last-viewed marker withdrawn, the tool persists nothing anywhere, so there is no tool-owned state to keep outside the project.

### Story 1.2: Establish the visual foundation

As a developer building later surfaces,
I want the token layer, elevation model, type roles, focus treatment and global chrome in place,
So that no surface I build afterwards invents its own values.

**Satisfies:** UX-DR1, UX-DR2, UX-DR3, UX-DR4, UX-DR23, UX-DR24 · NFR-15

**Done when:** every colour, type, spacing, radius and motion value resolves through a token, with no literal permitted in any component; the three type families load with their eight roles bound, and the mono role is applied semantically to filesystem-derived and machine-state strings; two type floors hold, content at or above `body-dense` and labels and badges at or above 11px; focus transitions are instant rather than animated and `prefers-reduced-motion` is honoured from the outset, so no later story retrofits it; and the precedence rules are encoded in how the layer is built — frontmatter tokens are normative over DESIGN.md prose, and both spines win over any mockup, so a mockup is never the source of a value.

### Story 1.3: Build the components every surface reuses

As a developer building later surfaces,
I want the shared tile, elevation and focus treatments and the global chrome in place,
So that no surface invents its own container or its own focus behaviour.

**Satisfies:** UX-DR2, UX-DR5, UX-DR6, UX-DR13, UX-DR14 · NFR-14, NFR-15

**Done when:** `tile` and `tile-raised` exist, lifting by surface-container tone with no shadow, gradient or blur anywhere in the system, and at most one raised tile per surface; the focus ring renders at 2px/2px on every focusable element, takes its inner stroke on primary-filled elements, and is never clipped by a container edge because containers reserve the offset inside their padding; and the project header renders as global chrome on every served surface, carrying project name, resolved path, git availability and the refresh control. *(Amended 2026-09-01 by user decision at the build multi-goal check: the git-availability probe is split into its own story, because it is the tree's only `node:child_process` consumer and AD-16 governs it tightly enough to want a dedicated review round. Until it lands, git availability renders as `Not checked` — the string index's own wording for a signal never examined, and a legitimate member of the four-state vocabulary, so the header is honest rather than placeholdered. The refresh control is a link, not script: a page load builds a new snapshot, only GET and HEAD are permitted, and no client router may own a URL — so this story needs no client-side JavaScript.)* The check that matters: a focused element at a tile's edge shows a complete ring.

### Story 1.4: Open the browser, but never depend on it

As a practitioner working over SSH or in a container,
I want the tool to open my browser when it can and stay usable when it can't,
So that the environment never blocks me.

**Satisfies:** FR-5, FR-6 · NFR-13 · AD-15

**Done when:** the browser opens on start; a flag suppresses launch while still reporting the URL; and the server binds and prints its URL before any launch is attempted, so a launch failure is reported and ignored rather than fatal.

### Story 1.5: Resolve where the project is

As a practitioner who runs commands from wherever I happen to be,
I want the tool to find the project root and its artifact roots itself,
So that it works from any directory inside the project.

**Satisfies:** FR-70 · NFR-12 · AD-9, AD-14 *(FR-10 was split out of this story and deferred indefinitely on 2026-09-02)*

**Done when:** the root is the target path itself, recognized by the presence of `_bmad` and `_bmad-output`, with no walk in either direction — so nested or sibling roots are unresolvable rather than resolved by a precedence rule; artifact roots resolve once in the composition root (from measured defaults, since FR-10 is deferred) and are passed onward, with no other module performing discovery; and paths are canonicalized at the filesystem adapter so identity does not vary by platform, including on case-insensitive filesystems.

Also in this story: symlinks are resolved before confinement is checked and before identity is keyed, so a link inside the tree pointing outside it cannot pass the confinement check and the same file reachable two ways does not appear as two artifacts; the walk detects cycles rather than following them; and a dangling link is reported rather than crashing the listing.

### Story 1.6: Fail with the command that would have worked

As a practitioner who ran the tool one directory away from my project,
I want to be told what to run instead,
So that a wrong invocation costs me one line rather than a diagnosis.

**Satisfies:** FR-7

**Done when:** a target with no `_bmad` and `_bmad-output` neither serves nor launches a browser; it exits reporting the path it examined and what it looked for; a bounded scan — the full ancestor chain plus two levels below, skipping dot-directories and `node_modules` — proposes the exact invocations that would work, listing every candidate found; and the scan runs in the CLI, contributing nothing the domain consumes, so it can never become a resolution path. Modelled on `git push` reporting a missing upstream: hand over the command, do not describe the problem. The check that matters: the suggestion scan never resolves a project, only names one.

### Story 1.6a: Walk the artifact tree safely

*(Added to this file 2026-09-03. Split out of Story 1.5 mid-epic on 2026-09-02 at the build workflow's multi-goal check, by user decision, and built as `1-6a-walk-the-artifact-tree-safely`; it was tracked in `sprint-status.yaml` from the start and only ever missing from here.)*

As a practitioner whose project contains whatever a filesystem allows,
I want the tool's traversal to be safe and bounded,
So that a link, a cycle or a permission error cannot make it lie or hang.

**Satisfies:** the traversal properties Story 1.5's second paragraph specified · AD-7, AD-10, AD-14

**Done when:** symlinks are resolved before confinement is checked and before identity is keyed, so a link inside the tree pointing outside it cannot pass the check and one file reached two ways does not appear as two artifacts; cycles terminate; a dangling link is reported rather than crashing the listing; an unreadable directory is one entry among otherwise complete results rather than an aborted pass; and the walk is bounded in depth and in total entries, with the budget a required argument. The check that matters: every bound is pinned from **both** sides — a mutation that widens a cap fails, not only one that removes it.

### Story 1.7: Identify what each artifact is

As a practitioner whose project uses its own file naming,
I want artifacts recognized by what they are rather than what they are called,
So that the tool works on a project it has never seen.

**Satisfies:** FR-8, FR-11, FR-69 · AD-4

**Done when:** identification applies the four-level precedence in order and stops at the first that resolves, with filename never sufficient on its own; all seven run-folder families are recognized; an artifact no level resolves is presented as unidentified naming the levels attempted; and identity is decided in exactly one domain module that every other unit consumes.

### Story 1.8: Handle whole and sharded documents alike

As a practitioner whose documents exist in both shapes,
I want either shape to be understood without my telling the tool which it is,
So that a sharded PRD is no harder to work with than a single file.

**Satisfies:** FR-9, FR-73

**Done when:** a document is handled equivalently whether it is one file or a directory with `index.md`; and where a directory cannot be distinguished between a run folder and a sharded document, the ambiguity is presented rather than resolved silently. BMAD's own discovery resolves this case by asking a human, so guessing is not an available answer.

### Story 1.9: Show what could not be read or recognized

As a practitioner relying on this for assurance,
I want artifacts the tool cannot parse or classify to appear anyway,
So that nothing disappears from a view I am trusting to be complete.

**Satisfies:** FR-12 · NFR-3, NFR-4, NFR-5, NFR-6 · AD-7, AD-13

**Done when:** an unrecognized shape is listed as present-but-uninterpreted and an unparseable one as unreadable, each naming what failed and at which stage; neither is omitted and neither aborts the pass; a single bad artifact leaves the rest of the page usable; a file that cannot be decoded as text is reported as unreadable rather than skipped or crashing the walk — the existing vocabulary covers it, so no new state is introduced; and a parser reading a convention-defined source fails visibly rather than returning an empty result as success. The check that matters: a project containing a deliberately malformed artifact renders every other artifact correctly and shows the malformed one.

### Story 1.10: Get BMAD's own irregularities right

As a practitioner whose project has accumulated real history,
I want the tool to handle BMAD's naming and layout quirks correctly,
So that its inventory matches what is actually on disk.

**Satisfies:** FR-49, FR-50, FR-71, FR-72

**Done when:** slugs are treated as context-dependent names and never as identities; review outputs are found whether written to a workspace root or a `reviews/` subfolder; a run folder is not assumed to hold one run, since four of seven patterns are constant within a day; and the two dateless patterns fall through to the ordering hierarchy without a folder-name signal. The check that matters: a folder containing two same-day runs of one family reports both.

### Story 1.11: Locate sprint tracking safely

As a practitioner whose stories live wherever the project put them,
I want sprint tracking found by configuration and confined to the project,
So that the tool reads what it should and nothing it should not.

**Satisfies:** FR-51, FR-74, FR-75 · NFR-10, NFR-17 · AD-10

**Done when:** story locations resolve from `story_location` in `sprint-status.yaml`; a value that is absolute or resolves outside the project is reported as out-of-tree and never served from; absence of `sprint-status.yaml` renders as a normal shape rather than an error; and every content-derived path segment is sanitized and confinement-checked on every read, including paths resolved during composition. The check that matters: `story_location: /etc` is reported and never read.

### Story 1.12: See the project inventory

As a practitioner opening the tool for the first time on a project,
I want one page listing every artifact the tool found and what it made of each,
So that I can see what is there before I go looking for anything specific.

**Satisfies:** surfaces the results of Stories 1.7 to 1.11; no new FRs

**Done when:** the served page lists every artifact grouped by family, each showing its identified type, its path, and where applicable its unidentified, uninterpreted or unreadable state. Rendered with the Story 1.2 tokens and tile component, keyboard navigable, with no meaning carried by colour alone.

## Epic 2: Read any artifact properly

Open any artifact in a viewer suited to its shape, and navigate a document too long to read as one page. Same lean acceptance form as Epic 1.

### Story 2.1: Open an artifact at its own URL

As a practitioner who found something in the inventory,
I want to open it and read it in the tool,
So that I do not have to leave for my editor just to look.

**Satisfies:** FR-18 · AD-2, AD-3, AD-17, AD-18 · UX-DR15

**Done when:** an artifact is reachable at a stable URL that survives reload; its content is HTML produced on the server, with the client only enhancing delivered markup; the rendering parse happens on first open and is cached for the life of the current snapshot; and every response records which snapshot produced it, so all content in one response comes from one scan. The check that matters: a refresh landing mid-read does not produce a page assembled from two snapshots.

### Story 2.2: Know when what you are reading has moved

As a practitioner reading an artifact while agents are working,
I want to be told when the file has changed since the scan,
So that I do not act on a version that no longer exists.

**Satisfies:** AD-11 · UX-DR19 (currency and vanished conditions)

**Done when:** opening an artifact compares its current on-disk state against the snapshot's record and surfaces a mismatch with a refresh offer, never silently correcting it; the probe is evaluated at the moment of open and never cached; and an artifact that has disappeared since the scan says so in its own words rather than reusing the changed-since-scan wording. Two distinct facts, two distinct strings.

### Story 2.3: Get from the tool to your editor

As a practitioner who found the thing that is wrong,
I want the file path and a way to open it where I work,
So that reading and fixing are one motion.

**Satisfies:** FR-24 · UX-DR11

**Done when:** every viewer offers copy-to-clipboard of the artifact's path and an open-in-editor affordance, built into the artifact-view shell so later viewers inherit them rather than reimplementing. Nothing in either affordance writes to the project.

### Story 2.4: Read a memlog as a decision trail

As a practitioner verifying a stage an agent just finished,
I want the memlog as a typed timeline rather than a wall of bullets,
So that a decision taken without me is the thing I notice first.

**Satisfies:** FR-19 · UX-DR9, UX-DR17

**Done when:** the trail renders as a typed, filterable timeline with counts per type; `override` and `assumption` entries are distinguishable from `decision`, `change` and `event` at a glance and without relying on colour alone; and entry order within the file is presented as sequence rather than as time, since memlog entries carry no per-entry timestamp. The check that matters: a memlog is never rendered as though its entries were timestamped.

### Story 2.5: Read reviewer output as findings

As a practitioner who wants to know what a reviewer already found,
I want the verdict and the findings legible without reading the prose,
So that critiques written once stop being effectively write-only.

**Satisfies:** FR-20 · UX-DR17

**Done when:** a `review-{slug}.md` renders as findings with its verdict and severity readable without opening the prose body, whether the file was written to the workspace root or a `reviews/` subfolder.

### Story 2.6: Read a reconciliation as gaps

As a practitioner who supplied source material,
I want to see what did not make it into the resulting document,
So that a dropped requirement surfaces before it is built on.

**Satisfies:** FR-21

**Done when:** a `reconcile-{slug}.md` renders as gaps between a named source input and the document derived from it.

### Story 2.7: Read an addendum with its parent

As a practitioner reading depth that was kept out of a document,
I want to know which document it belongs to,
So that the excluded material is not orphaned from its context.

**Satisfies:** FR-22

**Done when:** an `addendum.md` renders as content deliberately excluded from its parent, with the parent named and linked. Where the addendum declares a parent in frontmatter that is used; where it does not, the relationship is presented as inferred rather than asserted.

### Story 2.8: Read sprint tracking as state

As a practitioner mid-implementation,
I want epic and story state, retrospective status and open action items,
So that the one machine-readable state file in BMAD is actually readable.

**Satisfies:** FR-23 · NFR-6 · UX-DR17

**Done when:** `sprint-status.yaml` renders as epic and story state, retrospective status, and open action items with their owners; its `MM-DD-YYYY HH:MM` timestamps are normalized on read rather than displayed raw; and its status vocabularies are read from the project's own template with a loud failure if extraction yields nothing, since those definitions live in YAML comments no test protects. A `development_status` key the tool cannot classify is treated as legal and rendered as present-but-uninterpreted, flagged rather than dropped — the same rule FR-12 applies to files, applied to a key.

### Story 2.9: Turn a long document into pages

As a practitioner facing a 24,000-word spec,
I want it divided into pages I can move between,
So that a document that long is navigable rather than merely present.

**Satisfies:** FR-25, FR-77 · NFR-8

**Done when:** a whole document is carved into linked pages by heading weight; a document already sharded by BMAD uses its existing shard boundaries instead, since those are the authoring skill's own division; the reader looks the same either way; and a 24,000-word document opens and moves between pages without perceptible delay.

### Story 2.10: Keep the document's shape in view

As a practitioner reading one section of something long,
I want the whole structure beside me,
So that I know where I am and what else is there.

**Satisfies:** FR-26 · NFR-14 · UX-DR20, UX-DR21

**Done when:** a persistent contents rail reflects document structure, marks the current section, scrolls independently of content, and is exposed as a navigation landmark. Number keys jump to the nth section, and the rail is fully keyboard operable.

### Story 2.11: Link to a section and have the link keep working

As a practitioner who wants to point a colleague at one part of a document,
I want a link that survives a reload and a re-scan,
So that a reference stays a reference.

**Satisfies:** FR-27 · AD-18 · UX-DR19 (dead permalink condition)

**Done when:** every section has a permalink stable across refreshes and independent of how the document was divided, so a document that arrives whole and the same document later sharded resolve the same section to the same URL; the grammar is defined once and owned by the server; and a permalink whose section no longer exists opens the document at its top and says so, rather than failing the whole document. The check that matters: sharding a previously whole document does not break existing section links.

## Epic 3: See what's active and what's questionable

The dashboard and the oversight surface, both reading from one snapshot pass. This epic delivers the product's primary job, and its first four stories build the machinery the rest render.

### Story 3.1: Scan the project once

As a practitioner opening the tool,
I want everything I see to have come from one consistent read of the project,
So that no two panels can disagree about what is on disk.

**Satisfies:** AD-3, AD-8 · NFR-16

**Done when:** one pass reads each artifact once and extracts identity and timestamps, through an extractor registry that later stories add to rather than reopening the pass; the model records, per artifact and per registered signal, exactly one of present, absent, unreadable or unchecked; the pass builds no rendering representation; and its cost is bounded by file count rather than total document length. Stories 3.9 to 3.12 each register their own extractor — this story defines the mechanism and registers none, so nothing here depends on a signal not yet specified. The check that matters: adding a 24,000-word document to a project does not measurably lengthen the scan.

### Story 3.2: Make times comparable

As a practitioner relying on an ordering,
I want BMAD's several timestamp formats reconciled before anything is sorted,
So that the sequence I see is not an artefact of parsing.

**Satisfies:** FR-67 · AD-5

**Done when:** every timestamp is converted to an absolute instant at the adapter boundary, from at least four incompatible formats including month-first `MM-DD-YYYY HH:MM` and date-only frontmatter; timezone-naive sources are interpreted in the tool machine's local zone as a fixed rule rather than a per-caller choice; the applied zone travels with the value for disclosure; and no raw BMAD timestamp string reaches domain code. Where a document's `created` and `updated` disagree in the wrong direction, the newer of the two is used — this is best-guess ordering evidence, not a correction, and its resolution is disclosed like any other tier.

### Story 3.3: Read git without touching it

As a practitioner pointing the tool at any repository,
I want git consulted for chronology and guaranteed not to alter anything,
So that reading my project cannot change it or run code from it.

**Satisfies:** FR-62 · AD-16 · NFR-1

**Done when:** git supplies uncommitted working-tree state and commit times where the project is a repository; every invocation disables optional locks so it cannot rewrite `.git/index`; repository-configured hook and monitor mechanisms are neutralized by explicit command-line override; only reporting commands are used; and a project that is not a repository degrades to the remaining tiers. The check that matters: scanning a repository leaves `.git` byte-identical, and a repository configuring `core.fsmonitor` to an arbitrary command does not execute it.

### Story 3.4: Order activity, and show why

As a practitioner returning to a project,
I want an ordering together with the evidence behind each position,
So that I can tell a reliable sequence from a guess.

**Satisfies:** FR-14, FR-15, FR-66 · AD-6 · UX-DR8, UX-DR19 (no-git condition)

**Done when:** ordering applies the six-tier hierarchy from uncommitted changes down to filesystem mtime; every item carries the tier that placed it and that tier's resolution as data, not as a badge computed separately; items whose evidence cannot separate them are grouped as order-unknown rather than interleaved; memlog entries contribute sequence within a file and are never interleaved across files on a timeline; and in a project with no repository the badge weights re-base on the available tiers, with equal day-resolution ties broken by run-folder date then path. The check that matters: a non-git project yields a usable feed rather than one large order-unknown group, and no displayed ordering claims precision its evidence lacks.

### Story 3.5: Land on what happened recently

As a practitioner who has been away,
I want the first thing I see to be recent activity,
So that re-orienting is the default rather than a search.

**Satisfies:** FR-13, FR-16, FR-17 · NFR-14 · UX-DR7, UX-DR15, UX-DR18, UX-DR20, UX-DR21, UX-DR22

**Done when:** the default view is a chronological activity list; selecting an entry opens the viewer for that artifact type; entries filter by artifact family and time window with filters carried in the URL and never remembered between runs; a valid BMAD project containing no artifacts renders every tile in its empty state with the header confirming a project was found; and the tile grid collapses to one column in the specified reading order below the single 900px breakpoint.

### Story 3.6: Refresh on demand, and never publish half a scan

As a practitioner who just watched an agent finish,
I want to refresh deliberately and trust what comes back,
So that a slow or failed scan never leaves me looking at holes.

**Satisfies:** FR-37, FR-47 · AD-17 · UX-DR12, UX-DR18, UX-DR23

**Done when:** refresh is user-initiated with no filesystem watching; the current surface stays readable and interactive on its own snapshot throughout and is never replaced under the user; progress is reported in the global header, determinate where the file count is known and indeterminate otherwise, and the determinate bar is the only animation the product ships — replaced by discrete step updates under `prefers-reduced-motion`; displayed data always states how current it is; and a scan that fails partway is discarded rather than published, leaving the previous snapshot current and saying so with the reason. The check that matters: a scan interrupted midway leaves the previous snapshot live, not a fresh-looking dashboard with silent gaps.

### Story 3.7: Reach the central documents, including the missing ones

As a practitioner who wants the PRD rather than whatever changed last,
I want the project's central artifacts directly reachable,
So that recency is not the only way to find something.

**Satisfies:** FR-52, FR-53, FR-54, FR-55 · UX-DR10

**Done when:** a persistent core-artifact set sits alongside the feed, with centrality following BMAD's own declaration rather than the tool's preference; an absent artifact keeps its position at low visual weight, is not a link, and reads as not found; and absence is elevated above neutral only when something else on disk implies the artifact should exist. The check that matters: a project built entirely through `bmad-build`, which legitimately has no PRD, raises no deficiency.

### Story 3.8: Establish the vocabulary that makes silence specific

As a practitioner using this for assurance,
I want one vocabulary for what was found, missing, unreadable and unexamined,
So that every later signal reports itself the same way.

**Satisfies:** FR-56, FR-76 · AD-8 · UX-DR9, UX-DR17

**Done when:** the four-state vocabulary exists as the single set used by the model and the UI alike, with the state word always rendered and never colour alone; the coverage record is carried in the snapshot per artifact and per registered signal; and no surface may render empty without reporting which of the four states it is reporting. This story defines the mechanism and the pill component; Stories 3.9 to 3.12 populate it, and Story 3.13 renders the coverage record. Nothing here depends on a signal not yet registered.

### Story 3.9: Surface the decisions taken without you

As a practitioner verifying machine-generated work,
I want overrides and assumptions drawn to my attention,
So that the decisions I was not consulted on are the ones I see.

**Satisfies:** FR-29, FR-68 · UX-DR17

**Done when:** memlog `override` and `assumption` entries are surfaced prominently where they exist, with their reliability qualified rather than asserted, since the entry vocabulary is convention rather than enforced; and coverage is presented as partial, stating plainly that a stage run through `bmad-build` writes no memlog at all. The check that matters: a completed build stage shows that no decision trail exists, rather than showing an empty one.

### Story 3.10: Surface risk the documents state or imply

As a practitioner scanning for problems,
I want in-document markers and computable structural risk brought together,
So that I do not have to grep for the tool's own conventions.

**Satisfies:** FR-30, FR-31, FR-32

**Done when:** in-document risk markers are surfaced where present, including assumption tags, notes, open-question sections and deferred items; documents marked final while carrying unresolved open items are surfaced as structural risk needing no judgement; and marker coverage is presented honestly, since the conventions are emitted by four skills and one respectively, so absence of a marker is never presented as absence of risk.

### Story 3.11: Find the critiques already written

As a practitioner who wants to know what a reviewer found last month,
I want reviewer findings gathered across the whole project,
So that critiques stop being buried in the folder that produced them.

**Satisfies:** FR-33

**Done when:** findings from every `review-{slug}.md` in the project are aggregated into one view rather than left siloed in their run folders, each linking to its source artifact, and found whether written to a workspace root or a `reviews/` subfolder.

### Story 3.12: Show where this project departs from BMAD's defaults

As a practitioner auditing how a project runs,
I want project-level customizations visible,
So that behaviour that differs from stock BMAD is not invisible.

**Satisfies:** FR-34

**Done when:** deviations are read from `_bmad/custom/*.toml` and presented as project-level departures. A skill's own `customize.toml` is the shipped default and is never read as a deviation. The check that matters: a project with no customization reports none, rather than reporting roughly thirty-five findings from files marked do-not-edit.

### Story 3.13: Bring the risk surface together

As a practitioner doing a deliberate review pass,
I want one surface holding everything that warrants scrutiny,
So that oversight is a place I go rather than a sweep I remember to do.

**Satisfies:** assembles Stories 3.8 to 3.12 · UX-DR15, UX-DR21

**Done when:** the oversight surface presents overrides and assumptions, in-document markers, structural risk, aggregated reviewer findings and project deviations, alongside the coverage record established in Story 3.8 — reporting what was examined, what could not be interpreted, and which signals were unavailable per artifact family; it is reachable by URL and from the dashboard risk tile; and it is fully keyboard operable with nothing dependent on colour alone. The check that matters: nothing-flagged and nothing-checked are visibly different outcomes, including when both counts are zero. This is the first story at which that check is testable, because it is the first at which both a surface and registered signals exist.

### Story 3.14: Put two artifacts side by side

As a practitioner who suspects two documents have drifted,
I want to choose two artifacts and see them together,
So that I can judge the comparison the tool will not make for me.

**Satisfies:** FR-60 · UX-DR16

**Done when:** the user nominates two artifacts through the nominator overlay — the only modal in v1, trapping focus while open and returning focus to its trigger on close — and both render side by side, each labelled with its own identity and currency and scrolling independently. The tool asserts no relationship between them: no diff, no divergence flag, no alignment of one to the other. The check that matters: nothing in this surface claims the two artifacts are related.
