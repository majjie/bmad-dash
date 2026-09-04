# Epic 2 Context: Read any artifact properly

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Open any artifact in a viewer suited to its shape rather than through a generic markdown renderer — a memlog as a typed decision trail, a review as findings with its verdict legible, a reconciliation as gaps, an addendum joined to its parent, sprint tracking as epic and story state — and make a 24,000-word document navigable by section, with a contents rail and permalinks that survive reload and are independent of how the document was divided. The epic consumes Epic 1's identification verdicts. It requires nothing from Epic 3 *except* one open question — which of Story 2.8 or Story 3.10 introduces timestamp normalization; see Cross-Story Dependencies. Two stories were cancelled by user decision on 2026-09-04 — a per-snapshot parse cache and a changed-since-scan currency probe — and the architecture decisions behind them withdrawn rather than deferred: nothing here compares a file against the snapshot's record of it, and nothing caches a rendered document.

## Stories

- Story 2.1: Serve every response from one snapshot
- Story 2.1a: Open an artifact at its own URL
- Story 2.1b: Show an artifact's content, safely
- Story 2.3: Build the surface action buttons
- Story 2.3a: Get from the tool to your editor
- Story 2.3b: Copy the artifact's path
- Story 2.4: Read a memlog as a decision trail
- Story 2.5: Read reviewer output as findings
- Story 2.6: Read a reconciliation as gaps
- Story 2.7: Read an addendum with its parent
- Story 2.8: Read sprint tracking as state
- Story 2.9: Turn a long document into pages
- Story 2.10: Keep the document's shape in view
- Story 2.11: Link to a section and have the link keep working

## Requirements & Constraints

- Each type gets a viewer built for its shape, making that type's structure legible without the reader parsing prose. The generic renderer is a legitimate *fallback* for types whose viewer does not exist yet; the per-type requirement is satisfied progressively, one story per type, and must never be claimed before its viewer exists.
- Every viewer offers copy-to-clipboard of the artifact path and an open-in-editor affordance. Neither writes to the project. **The requirement is founded by Story 2.3a (the editor link) and completed by Story 2.3b (the clipboard); neither story satisfies it alone**, because there is no HTML-only way to write to the clipboard, so the second half needs client script and the CSP change that comes with it.
- Long documents: pages carved by heading weight, except where BMAD already sharded the document — then its shard boundaries are the pages, and the reader looks identical either way. The contents rail marks the current section, scrolls independently, and is a navigation landmark. Section permalinks survive reloads and re-scans. A ~24,000-word document must open and page without perceptible delay.
- Degradation is typed — never an exception, never an omission. An unparseable artifact fails in place, naming what failed and at which stage, without affecting its neighbours; an artifact with no content reads `Empty file.`
- Extraction from convention-defined sources (sprint status words living only in YAML comments, say) must validate that it produced something and fail loudly. A value the tool cannot classify is legal and rendered as present-but-uninterpreted, flagged rather than dropped.
- Read-only stays absolute, and content-derived path segments are sanitized on both the filesystem and the URL surface — two different sanitizers, since percent-encoding, dot-segment normalization and `..` differ between them.
- **Four signal states, never collapsed into "none"**, and copy never claims more than the data supports. Empty is distinguished by cause.
- **No telemetry and no analytics, and nothing in the product's purpose needs an outbound request** — advisory, held by code discipline and review rather than by a gate. A bundled dependency is not an outbound request and no network-module gate is owed.
- Status vocabularies for sprint tracking come from **the target project's own template at runtime**, never a shipped copy, because the project may be on a different BMAD version.
- Timestamps are normalized on read, never shown raw. Memlog entries carry no per-entry timestamp: their order is sequence, not time, and must never be rendered as though timestamped.

## Technical Decisions

- **One snapshot per scan, carrying a content-derived identity.** The scan builds no rendering representation. **Bounded work per artifact is the intent, not yet a property** — a correction dated 2026-09-03 that must not be re-simplified away: identification levels 2 and 3 read whole files and split their full text, bounded only by an 8 MiB cap, so a long document does *not* currently cost the same to scan as to skip. Latent, because most artifacts resolve from their location without being opened, and the fix is deferred by decision. Every response carrying project content records the identity it came from; responses produced before a snapshot exists are exempt by stated reason, not by omission.
- **The rendering parse is deferred to first open and re-done on each open.** Deferral is the load-bearing half — it keeps document length out of scan latency. There is no cache: the snapshot identity is not a valid key (bodies are deliberately kept off it), and a digest key costs about as much as the parse it would skip.
- **Layered — a pure domain with adapters at the edges.** The domain imports nothing outside itself and adapters depend on it, not the reverse. There is no `src/ports/` ring and none was ever built; anything still saying "hexagonal" or listing `ports/` is stale. Sectioning, permalink identity and timestamp normalization belong in the domain, as functions over data.
- **Every new route inherits sanitization, confinement, the `Host` check, and 405 on write-shaped methods.** A new route does not renegotiate them.
- **Server renders documents; the client enhances delivered markup only.** No client router owns a document URL, so back and forward work natively, and content is never assembled client-side.
- **The URL grammar for artifacts and their sections is defined once and owned by the server**, stable across refreshes and independent of how the document was divided.
- **The markdown parser is bundled, not an installed runtime dependency**, following the precedent set for the YAML library.
- **The story that first emits raw markup owes the defence.** Rendering markdown ends the safety that came from escaping every interpolated value, so hardening headers and a CSP land with it. Because embedded HTML in project markdown is rendered, `'unsafe-inline'` is unavailable: client script ships inline with a `sha256-` hash of the script constant.

## UX & Interaction Patterns

- Surfaces built here: Artifact view and Document reader (a long document as linked sections with a contents rail). Both reachable by URL, both surviving reload.
- `button-primary` and `button-ghost` consume tokens that already describe them, with at most one primary per surface enforced by test. Refresh takes ghost: primary is reserved for a surface's own forward action, and a primary control in chrome present on every surface would spend every surface's budget permanently.
- Rows naming something openable become real links; rows with nothing to open stay unlinked, keep their position, and stay reachable to a screen reader.
- Load-bearing strings are implemented verbatim — including `That section no longer exists in this document.` for a dead permalink, which opens the document at its top rather than 404-ing it. Other conditions this epic must cover: an empty file, the run-folder-versus-sharded ambiguity, and a folder that may hold more than one run.
- The keyboard model is defined once and shared: arrows or `j`/`k` between rows, `Enter` to open, `Escape` to leave a reading surface, `1`–`9` to jump to the nth section, single-letter keys inert while a text input has focus.
- Accessibility floor is behavioural: banner, navigation and main landmarks with one `h1` per surface; focus visible and never clipped; no meaning in colour alone; accessible names carrying honest state; full keyboard operation; and text resizing to 200% without loss. Memlog overrides and assumptions must be distinguishable at a glance without relying on colour alone. One breakpoint at ~900px, below which the rail moves above the content.

## Cross-Story Dependencies

- 2.1 comes first: 2.1a's URLs and every later response's identity header build on the snapshot identity it introduces.
- 2.1a defines the URL grammar but cannot verify division-independence — 2.11 asserts that half, once sharding exists.
- 2.1b ships the generic renderer and the security headers 2.4–2.8 inherit; each of those replaces the fallback for one type.
- 2.3 builds the button components; 2.3a consumes them and adds the path and editor affordances into the artifact-view shell, so later viewers inherit rather than reimplement them.
- **2.4–2.8 are independent of each other** once the artifact-view shell exists.
- From Epic 1, inherited rather than rebuilt: identification precedence and its recorded verdict, whole and sharded documents handled alike including the ambiguous case, sprint-tracking location with out-of-tree reporting, tokens, shared components, global chrome, and confinement on every read.
- **Artifact roots from project configuration are deferred indefinitely**; roots stay at their measured defaults.
- 2.9–2.11 form the reader chain: pages, then the rail over them, then permalinks stable across both divisions.
- Into Epic 3: refresh, snapshot replacement, and the header's currency line ("scanned N minutes ago") are Story 3.6's — no refresh exists in this epic. Timestamp normalization is shared with Story 3.10, so 2.8 either introduces it or consumes it. Epic 3's activity rows and oversight findings link into the viewers built here.
