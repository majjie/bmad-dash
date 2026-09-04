# Epic 2 Context: Read any artifact properly

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 made every artifact findable and correctly identified; Epic 2 makes each one readable *in the tool*, so a practitioner verifying a finished stage never leaves for an editor just to look. Each artifact type gets a viewer built for its shape rather than a generic markdown dump, and a document too long to read as one page becomes linked pages with a contents rail and section permalinks that survive reload, re-scan and later sharding. It also establishes the artifact-view shell and the document URL grammar every later surface reuses.

## Stories

- Story 2.1: Serve every response from one snapshot
- Story 2.1a: Open an artifact at its own URL
- Story 2.1b: Show an artifact's content, safely
- Story 2.3: Get from the tool to your editor
- Story 2.4: Read a memlog as a decision trail
- Story 2.5: Read reviewer output as findings
- Story 2.6: Read a reconciliation as gaps
- Story 2.7: Read an addendum with its parent
- Story 2.8: Read sprint tracking as state
- Story 2.9: Turn a long document into pages
- Story 2.10: Keep the document's shape in view
- Story 2.11: Link to a section and have the link keep working

## Requirements & Constraints

**The shape is the requirement.** A generic markdown renderer satisfies nothing here. What must be legible without reading the prose body: a memlog's overrides and assumptions among its other entry types; a review's verdict and severity; a reconciliation's gaps between a named source input and the document derived from it; an addendum's parent; sprint tracking's epic and story state, retrospective status, and open action items with owners.

**Memlog entries carry no per-entry timestamp.** They record sequence, not time — rendering them as timestamped, or interleaving them on a chronological timeline, is a defect. Overrides and assumptions must be distinguishable at a glance without relying on colour alone.

**Sprint tracking rests on an unstable source.** Its timestamps arrive month-first and timezone-naive and are normalized on read, never shown raw. Its status vocabularies come from the target project's own template at runtime rather than a shipped copy, since the project may be on a different BMAD version; those definitions live in YAML comments no upstream test protects, so extraction must validate that it produced something and fail visibly rather than returning empty as success. A status value the tool cannot classify is legal: render it present-but-uninterpreted and flag it, never drop it.

**Every viewer offers the same two read-only exits** — copy the path, open it where the user works. Neither writes to the project, and this epic adds no action that mutates BMAD state.

**Changed-since-scan and vanished are withdrawn (2026-09-04).** AD-11 is withdrawn and Story 2.2 cancelled by user decision, and the two `EXPERIENCE.md` strings with them: a snapshot rebuilt on every request cannot disagree with the file it just recorded — verified, an edited artifact reopens as 200 with the new text and a deleted one as 404. FR-47's header currency line (Story 3.6) is a different mechanism and stands.

**Long documents.** A whole document is carved into pages by heading weight; one BMAD already sharded adopts its existing shard boundaries instead, because those are the authoring skill's own division and keep pages, files, permalinks and open-in-editor targets naming the same units. The reader looks identical either way. A ~24,000-word document must open and page without perceptible delay.

**Honesty vocabulary carries over unchanged.** Four signal states, never collapsed into "none". A failing artifact or section renders in place stating what failed and at which stage — never omitted, never fatal to its neighbours. Empty is distinguished by cause, and copy never claims more than the data supports.

**Accessibility floor:** full keyboard operation, focus never obscured, no meaning in colour alone, one `h1` per surface, honest state in accessible names, text resizing to 200%.

**No telemetry or analytics, and nothing in the product's purpose needs an outbound request** — advisory, held by code discipline and review, not a gate. A bundled dependency is not an outbound request and no network-module gate is owed.

## Technical Decisions

**Layered — a pure domain with adapters at the edges.** The domain imports nothing outside itself; adapters depend on it, not the reverse. There is no `src/ports/` ring and none was ever built; documents still saying "hexagonal" or listing `ports/` are stale on that point. Sectioning, permalink identity and timestamp normalization belong in the domain, as functions over data.

**The server renders documents; the client only enhances delivered markup.** Viewer bodies, sections and contents rails are HTML produced server-side from domain types. Content is never assembled client-side and no client router owns a document URL, so browser back and forward simply work.

**One snapshot per refresh; index eager, content lazy.** *(Two corrections since this file was first compiled, both 2026-09-03.* **AD-3's bounded-work rule is now stated as an intent, not a property:** identification levels 2 and 3 read whole files and split their full text, bounded only by an 8 MiB cap rather than by a prefix, so a long document does **not** currently cost the same to scan as to skip. Latent — one pass over a real project opens few files, because most artifacts resolve from their location without being read — and the fix is deferred, so work proportional to length still happens in the scan. **And the snapshot lifecycle is split across epics:** Story 2.1 delivered one immutable snapshot carrying a content-derived identity recorded on every response that carries project content; the *replacement* half — refresh not mutating in place, a failed scan leaving the previous snapshot live — is Story 3.6's, alongside FR-37 and FR-47. Refresh does not exist in Epic 2 at all, so a page load is still the refresh and every load is still a full pass.)* The scan already extracted identity, timestamps and oversight signals; this epic adds the *rendering* parse — token stream, sectioning, table of contents — done on first open. **The cache is gone (2026-09-04):** Story 2.1c would have retained it and was cancelled by user decision, and AD-3's cache clause was withdrawn to match, because the snapshot identity is not a valid key for it (bodies are deliberately off the snapshot, so an edited document would serve a stale render) and a content digest costs as much as the parse. Deferral to first open stands; retention does not. Refresh latency is the binding performance requirement, so work proportional to document length belongs behind that lazy open, never in the scan. Every response records the snapshot identity that produced it and all its content comes from that one snapshot; a refresh mid-read does not mutate the live snapshot in place. The currency probe is the deliberate exception — read from the filesystem at the moment of open, never cached.

**The document and section URL grammar is defined once and owned by the server.** Permalinks, in-document navigation, open-in-editor targets and shard-derived pages are four consumers of one contract. Section identity must derive from something the division does not change, so the same document whole and later sharded resolves a section to the same URL. A permalink whose section is gone opens the document at its top and says so; it never fails the whole document. Route shapes for other endpoints stay the code's choice — this grammar does not.

Viewers consume the scan's recorded identification verdict and never re-derive it; expected failures stay typed results rather than exceptions; every new route inherits sanitization, confinement, the `Host` check and 405 on write-shaped methods. Heading-weight thresholds, per-viewer markup and the in-memory snapshot representation are deliberately the code's to choose, within the URL contract and typed degradation.

## UX & Interaction Patterns

**Two surfaces land here:** Artifact view and Document reader, each reachable by URL and surviving reload. Put the path-copy and open-in-editor affordances in the artifact-view shell so later viewers inherit them.

**Reader layout** breaks the dashboard grid: one column at the reading measure — the only place the serif prose role is used — with the contents rail beside it. The rail is a navigation landmark, marks the current section, scrolls independently, is fully keyboard operable, and does not disclose whether pages were carved or sharded. At the 900px breakpoint it moves above the content.

**Keyboard bindings are defined once and shared;** no surface implements its own. This epic's additions: number keys jump to the nth section of the open document, and Escape with no overlay open leaves the reading surface and returns you where you came from. Single-letter keys are inert while a text input has focus.

**Surface states.** During refresh the artifact view holds its own snapshot and the reader preserves position. An artifact with no content reads as an empty file; a document with no headings is one unsectioned page; an unparseable section shows the failure for that section only, while a whole-artifact parse failure replaces the viewer, naming path and stage. (The stale mismatch banner is withdrawn with AD-11, 2026-09-04.)

**Load-bearing strings are implemented verbatim** from the string index, with its period-and-capital conventions. Conditions this epic must cover: section permalink target gone, empty file, run-folder-versus-sharded ambiguity, and folder that may hold more than one run. (Changed-since-the-last-scan and no-longer-on-disk were withdrawn on 2026-09-04 with AD-11.)

## Cross-Story Dependencies

- **Stories 2.1 and 2.1a found the epic**, split on 2026-09-03 at the build workflow's multi-goal checkpoint. **2.1** is the snapshot lifecycle alone: one immutable snapshot per refresh carrying an identity, every response recording the identity it came from, no in-place mutation, and the currency probe read at the moment of open. **2.1a, 2.1b and 2.1c** were the original Story 2.1's second half, split three ways on 2026-09-03 into one risk class each (2.1c since cancelled): 2.1a the URL grammar and the URL-side **encoder** — NFR-17's second surface takes the opposite policy from its first, because a filesystem name must be legal while a URL segment can carry anything if encoded, and a lossy transform would let two artifacts share one permalink, 2.1b the server-rendered content with the bundled parser and the Content-Security-Policy that first emitting raw markup makes due, and 2.1c the parse cache keyed on 2.1's identity — **cancelled 2026-09-04**, so Epic 2's founding stories are 2.1, 2.1a and 2.1b. **FR-18 is founded by 2.1b and satisfied by 2.4–2.8**, because it forbids the generic renderer 2.1b ships as a fallback. The order was fixed by the dependency: 2.1b needs 2.1a's shell to put content into. (2.1c's place in that order is moot — it was cancelled.) (Corrected 2026-09-04: this sentence said 2.1a's cache, which was true of the story before it was split three ways.) Story 2.3 then completes the shell that 2.4 to 2.8 inherit — 2.2 was cancelled on 2026-09-04, and nothing in that shell depended on it.
- **Stories 2.4 to 2.8 are independent of each other** once the shell exists.
- **Stories 2.9 to 2.11 are one chain, and the permalink is why.** Section identity must be settled while page division is written, not retrofitted: dividing a document is exactly what a permalink has to survive. The rail consumes the same section model.
- **From Epic 1:** identification precedence and its recorded verdict, whole and sharded documents handled alike including the ambiguous case, sprint-tracking location with out-of-tree reporting, tokens, shared components, global chrome, confinement on every read.
- **Epic 3 consumes what this epic parses** — overrides and assumptions surfaced project-wide, review findings aggregated across run folders, normalized timestamps — so extraction here should yield a shape the oversight pass can reuse rather than a viewer-private one. Epic 3's activity rows also link into these viewers.
- **Artifact roots from project configuration are deferred indefinitely;** roots stay at their measured defaults.
