# Review — state-by-surface coverage matrix

**Target:** `EXPERIENCE.md` (draft, 2026-08-28), with `DESIGN.md` as the visual companion.
**Requirements consulted:** `../../../specs/spec-bmad-dash/SPEC.md`, `../../../specs/spec-bmad-dash/bmad-source-shapes.md`, `../../architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md`, `../../prds/prd-bmad-2026-08-28/prd.md`.
**Lens:** does the document specify *observable behaviour* for each surface in each state, such that two developers building independently would build the same thing?

---

## Verdict

`EXPERIENCE.md` §State Patterns opens with a claim the document does not honour:

> "Every surface specifies these five. Absence of a state specification is a defect."

By its own test the document is defective. §State Patterns is a set of five *cross-cutting principles*, not thirty specifications. It names the Dashboard three times (`no empty-then-populate flash on the dashboard`, activity rows, core cards) and the project header once, and never names Oversight, Document reader, Comparison, or No project inside a state description at all. Six of thirty cells carry surface-level observable behaviour.

The document is strong where it is strong: the honesty vocabulary (§Voice and Tone load-bearing strings), the four-state signal discipline, the refusal to interleave unorderable items, the anti-patterns list. Those are genuine design decisions and they are well made. The gap is not taste, it is *state coverage* — and specifically the gap concentrates in the three surfaces reached by clicking through (Artifact view, Document reader, Comparison), which are exactly the surfaces where the product's per-artifact honesty has to survive contact with the shapes in `bmad-source-shapes.md`.

Two structural observations before the matrix:

1. **The project header is the load-bearing element for two of the five states** (Refreshing progress, Stale currency), and §Information Architecture defines it as *"full width above the tiles"* — a Dashboard element. Whether it exists on Oversight, Artifact view, Document reader, or Comparison is never stated. Since `r` (refresh) is a global key in §Interaction Primitives and AD-11 currency mismatch fires on document open, both states are specified on four surfaces via a component those surfaces are not specified to have.
2. **The document never uses the word "sharded"** (zero occurrences in `EXPERIENCE.md` and `DESIGN.md`), despite CAP-2 requiring *"whole and pre-sharded documents are handled equivalently"* and CAP-5 requiring *"an already-sharded document uses its existing shard boundaries."* The Document reader has a whole-document design and a sharded-document requirement.

**Fill rate: 6 / 30 cells fully specified (20%).** 11 implied by a general rule that names no surface; 13 absent.

---

## Part 1 — The named matrix: 6 surfaces × 5 named states

Grades: **S** = observable behaviour specified for this surface. **I** = implied by a general rule that does not name the surface (per the brief, not specified). **A** = absent.

| Surface | Loading (first paint) | Refreshing | Empty | Degraded | Stale |
|---|---|---|---|---|---|
| **Dashboard** | **S** | **S** | **S** | **S** | **S** |
| **Oversight** | I | I | I | I | I |
| **Artifact view** | A | I | A | A | **S** |
| **Document reader** | A | I | A | A | I |
| **Comparison** | A | A | A | A | I |
| **No project** | I | A | I | A | A |

Row and column totals: Dashboard 5 S; Artifact view 1 S; every other surface 0 S. Loading 1 S; Refreshing 1 S; Empty 1 S; Degraded 1 S; Stale 2 S.

### Cell-by-cell

**Dashboard — all five S.** §State Patterns is effectively a Dashboard state specification. Loading: *"the server renders from a completed snapshot, so there is no empty-then-populate flash on the dashboard. First paint is content."* Refreshing: progress in the project header, determinate where file count is known and indeterminate otherwise, current view stays readable, *"the user's current page is not yanked out from under them."* Empty: three causes with three distinct strings and a clear-filter action. Degraded: *"renders as a row or card stating what failed and at which stage (AD-7)… never omitted and never crashes its neighbours."* Stale: §Information Architecture puts *"snapshot currency"* in the project header. Caveat below on the risk summary tile's empty state and on FR-55.

**Oversight — five I.** Every Oversight state is reachable only by generalising a rule written for the Dashboard. §Evidence and Honesty Patterns does give Oversight one genuine requirement — *"`Nothing flagged` and `nothing checked` must be visibly different outcomes"* — but that is a constraint on the outcome, not a specification of it: neither string appears in the §Voice and Tone load-bearing strings table (which has rows for `Not checked`, `Not found`, `Unreadable`, but no `Nothing flagged`), and no layout is described. Oversight also has no stated header, so its Refreshing and Stale cells inherit a component it is not specified to have.

**Artifact view — Stale is the one solid non-Dashboard cell.** §State Patterns Stale plus the load-bearing string `This file changed after the last scan.` + refresh action, backed by AD-11, is genuinely buildable. Loading is absent and non-trivially so: AD-3 defers the *rendering* parse to first open, so opening an artifact is the one place in the product where the user waits on work proportional to document length — and the only loading statement in the document explicitly scopes itself to the Dashboard. Empty and Degraded are absent per-viewer: §State Patterns Degraded describes *"a row or card"*, which is Dashboard vocabulary, and says nothing about what the memlog timeline, reviewer-findings view, or sprint view shows when the artifact it was asked to render is the degraded one.

**Document reader — worst-covered reading surface.** Loading absent (a ~24,000-word document is the NFR-8 case; server-rendered, so the browser holds a blank page while `src/render` tokenises, sections, and builds the contents rail — nothing says what the user sees). Empty absent (a document with no headings yields a contents rail with zero entries, and §Interaction Primitives gives `1`–`9` as "jump to the nth section" with no defined behaviour at zero sections). Degraded absent (a sharded document with one unreadable shard among twelve — is the rail entry present and marked, or missing?). Stale is I: AD-11 fires *"on opening a document"*, and the reader is the surface where "opening" is ambiguous, because each section page is its own request.

**Comparison — one I, four A.** The only state-adjacent statement is §Component Patterns: *"each labelled with its artifact's identity and currency"*, which covers Stale disclosure but not Stale *handling* (one pane stale and the other fresh; does the refresh offer belong to the pane or the page?). Nothing covers a pane whose artifact fails to parse, a surface reached with only one artifact nominated, the same artifact nominated twice, or what a refresh does to two panes that AD-17 requires to come from one snapshot. UJ-2 step 2 — *"he nominates two artifacts"* — is the only description of how the surface is entered, and it describes no mechanism.

**No project — one A that matters more than its rank suggests.** §Information Architecture gives the surface a content sentence (*"What was looked for, and where"*) and §Closure notes it is *"state-driven rather than journey-driven and is reached by error rather than intent."* That is a content brief, not five states. Refreshing is absent and consequential: this is the surface where refresh is most likely to be pressed (wrong directory, or an agent is scaffolding the project right now), `r` is a global key, and there is no project header to host progress. Stale is absent in a way that is nearly a bug: the folder becoming a BMAD project while this page is open is the expected transition out of this surface, and nothing describes it. Degraded is absent and is a real boundary case — a folder that *has* `_bmad/` but whose configuration cannot be read is either No project or a degraded Dashboard, and AD-9 (*"artifact roots are read once from the target project's own configuration"*) makes that read a hard dependency with no specified failure surface.

---

## Part 2 — Extended matrix: states the product has and the document does not name

Derived from `bmad-source-shapes.md`, plus architecture obligations that name a UI duty with no UX behind it. Grade **A** unless noted; the affected surfaces are listed per row.

| # | Condition | Source | Surfaces affected | Grade |
|---|---|---|---|---|
| X1 | Refresh fails partway (git call fails, file deleted mid-scan, permission change) | AD-17, §Git in shapes | all | A |
| X2 | Project is not a git repository — FR-14 tiers 1 and 2 disappear | FR-62, shapes §Timestamps | Dashboard, Artifact view, Oversight | A |
| X3 | Artifact vanished between scan and open | AD-11, AD-3 | Artifact view, Document reader, Comparison, and every link into them | A |
| X4 | Section permalink whose section no longer exists after refresh | AD-18 | Document reader | A |
| X5 | Sharded vs whole document; and run folder vs sharded document indistinguishable | CAP-2, CAP-5, AD-4, shapes §Run folders | Document reader, Artifact view, Dashboard | A |
| X6 | `story_location` resolves outside the project tree | AD-9, shapes §Files that are not what their name suggests | Artifact view (sprint), Oversight | A |
| X7 | Zero artifacts of every family in a valid BMAD project | CAP-6, FR-55, shapes §The memlog is weaker than it looks | Dashboard, Oversight | A |
| X8 | Run folder holds more than one same-day run | shapes §Run folders | Dashboard, Artifact view | Partial — string only |
| X9 | Unidentified artifact | FR-8, CAP-2 | Dashboard (feed + filter), Artifact view, Oversight | Partial — string only |
| X10 | Unknown memlog entry type (vocabulary unenforced) | shapes §The memlog is weaker than it looks | Artifact view (memlog) | A |
| X11 | Status vocabulary could not be extracted from YAML comments | AD-13, shapes | Artifact view (sprint), Oversight | A |
| X12 | Timezone of a naive timestamp must be disclosed | AD-5 | Dashboard, Artifact view | A |
| X13 | Free-text unsanitized slug as a display string (length, escaping) | shapes §Slugs are names, not identities, NFR-17 | Dashboard, Artifact view, Comparison | A |
| X14 | Two candidates for one core artifact; reviews written to two locations | FR-8, shapes §Files that are not what their name suggests | Dashboard (core card), Oversight | A |
| X15 | Modal overlay exists in the interaction model but on no surface | §Accessibility Floor, §Interaction Primitives | none named | A |

Extended coverage: 2 of 15 partially specified (both are a *string* with no placement or behaviour), 13 absent.

---

## Part 3 — Findings, ranked by likelihood of a user-visible inconsistency

Ranking criterion: how likely is it that two developers building from this document independently ship visibly different products, weighted by how much of the surface area the difference touches.

### F1 — Project not a git repository: the whole feed's evidence presentation is undefined (X2 · Dashboard, Artifact view)

**Condition.** `FR-62`: *"Projects that are not repositories degrade to the remaining tiers."* Tiers 1 and 2 of FR-14 vanish, so every remaining tier is day- or minute-resolution at best, and mtime is explicitly *"not an activity signal at all"* (shapes §Timestamps). `DESIGN.md` §Components defines the strong evidence badge weight as *"commit-level and uncommitted evidence"* only — so on a non-git project **every badge in the feed is weak**, permanently.

**What a developer must invent.** Whether the whole feed therefore collapses into `Order unknown` (§Voice and Tone: *"Items that cannot be ordered"*), or is sorted by AD-6's *"documented tiebreak"* and labelled `Day resolution — order within the day unknown`. AD-6 says the tiebreak must exist *"so a non-git project yields a usable feed rather than one large unordered bucket"* — but the tiebreak is not documented anywhere in the UX layer, and `EXPERIENCE.md` §Evidence and Honesty Patterns says the opposite-sounding thing: *"Unorderable is a rendered state, not a fallback position."* The developer must also invent whether the project header states "not a git repository" at all, and whether UJ-1's `uncommitted` badge simply never appears without explanation.

**Consequence of divergence.** Dev A ships a chronological feed of weak badges. Dev B ships one large `Order unknown` group. These are not variations on a layout; they are different answers to the product's central question. On any non-git project — a fresh scaffold, a downloaded snapshot, a docs folder — the two builds show the user a different picture of what happened, and §Inspiration and Anti-patterns names the first as *"the single worst outcome available to this product"* while §Evidence and Honesty Patterns arguably mandates the second.

### F2 — Refresh has no failure branch (X1 · all surfaces)

**Condition.** §State Patterns Refreshing describes only the success path: progress in the header, then *"On completion the header offers the new snapshot."* The scan *"head-reads every file"* across a large tree; shapes §Git notes git invocations can fail or hang and that `core.fsmonitor` is hostile; an agent may delete a file mid-scan. AD-17 requires each snapshot to be immutable and identified but does not say what a partial pass produces.

**What a developer must invent.** Whether a partial scan is published as a snapshot or discarded; whether the old snapshot survives; what the header says; whether a per-file read failure becomes an `Unreadable` artifact (which AD-7 would support) or aborts the pass; whether progress stops, resets, or shows a determinate bar that never completes.

**Consequence of divergence.** Dev A publishes the partial snapshot: the user sees a fresh-looking dashboard with silent holes in it. Dev B keeps the previous snapshot and reports the failure: the user sees honest stale data. In an oversight tool the first is the failure mode the entire honesty vocabulary exists to prevent — a surface that is empty because nothing was looked at, presented as if it were looked at — and it arrives through the one interaction the user performs most.

### F3 — Artifact vanished between scan and open, and the dead-link case generally (X3 · Artifact view, Document reader, Comparison)

**Condition.** AD-3 makes the snapshot an index over files it does not hold; AD-11 compares *"the file's current state against the snapshot's record of it"* on open. A file deleted, renamed, or moved by an agent between scan and click is the ordinary case in this product, because the tool is opened precisely while agents are working. Every link on the Dashboard and Oversight is a candidate.

**What a developer must invent.** The entire surface. Does the click land on an error page, on the Dashboard with a message, on the Artifact view rendered from the snapshot's remembered facts with a "no longer on disk" banner? Is the existing string `This file changed after the last scan.` reused (it is wrong — the file is gone, not changed)? What does `Escape` — *"leave the current reading surface, returning to where you came from"* — do from a page that never rendered? Is the vanished artifact still listed after a refresh, or does it silently disappear from the feed, which would let the tool lose an event without saying so?

**Consequence of divergence.** Dev A shows a stated absence and keeps the user oriented; Dev B shows a browser error or a bare 404 with no project header and no way back, breaking the §Interaction Primitives navigation contract. Silent disappearance from the feed after refresh is the worst variant: it violates §Evidence and Honesty Patterns *"Silence is bounded"* without any code being obviously wrong.

### F4 — Sharded documents are a requirement with no design (X5 · Document reader, Artifact view, Dashboard)

**Condition.** CAP-2 requires whole and pre-sharded documents be *"handled equivalently"*; CAP-5 requires a sharded document *"uses its existing shard boundaries"*; AD-18 requires a section to resolve to the same URL whether the document arrived whole or sharded; shapes §Run folders states a run folder and a sharded document are *"not reliably distinguishable"* and that BMAD's own discovery *"resolves ambiguity by asking a human"* — which this tool cannot do. AD-4 requires an ambiguous verdict be *"recorded as ambiguous and presented as such, never resolved silently."* The word "sharded" appears zero times in `EXPERIENCE.md` and `DESIGN.md`.

**What a developer must invent.** Whether the contents rail lists headings or shard files, and whether the difference is disclosed; whether a sharded document is one Artifact view or many; what a directory of ambiguous type looks like in the feed, which family filter it answers to, and what string announces the ambiguity — no such string exists in the load-bearing strings table, and AD-4 mandates one.

**Consequence of divergence.** The same project read by two builds yields different rails, different section counts, and different permalinks, which is precisely the four-units-on-one-contract failure AD-18 was written to prevent. The ambiguous-directory case additionally produces a *silent* resolution in whichever build forgot it, breaking an ADOPTED architecture rule from the UX side.

### F5 — `story_location` out of tree forces a fifth signal state into a closed set (X6 · Artifact view, Oversight)

**Condition.** Shapes: `story_location` *"is a per-project field inside `sprint-status.yaml`, not a fixed path. It may be absolute and may point outside the project — `/custom/stories` is an explicitly tested value."* AD-9: such a location *"is recorded as out-of-tree and reported, never admitted and never served."*

**What a developer must invent.** What "reported" looks like, and on which surface. And crucially: which of the four closed signal states applies to a story the tool can see named in `sprint-status.yaml` but is forbidden to read. It is not `absent` (it exists), not `unreadable` (it parses fine, if read), not `present`, and `unchecked` is the closest but misdescribes a deliberate refusal as inattention. §Voice and Tone insists *"'Not checked' and 'not found' are different sentences and must never collapse into 'none'"*, and `DESIGN.md` states the four signal colours *"are a closed set"*.

**Consequence of divergence.** Dev A labels out-of-tree stories `Not checked` — indistinguishable from a signal the tool merely skipped, on the exact axis FR-76 exists to protect. Dev B invents a fifth state with a fifth colour, breaking the closed set that `DESIGN.md` protects by name. Both are defects, in opposite directions, and the document gives no basis for choosing.

### F6 — Zero-artifact valid project, and FR-55's "elevated absence" has no visual spec (X7 · Dashboard, Oversight)

**Condition.** Shapes: `bmad-build` writes no memlog and only 9 of 49 skills write one, all planning-side — so a build-only project is normal and legitimately holds no planning artifacts. FR-55 says absence *"is only elevated above neutral when something else on disk implies the missing artifact should exist."*

**What a developer must invent.** `DESIGN.md` §Components gives the absent core card exactly one appearance — *"reduced opacity plus `{colors.on-surface-faint}`"* — and `on-surface-faint` is *"reserved for one purpose: an absent core artifact."* There is no second, elevated appearance anywhere, so FR-55's elevated state has no token, no string, and no threshold. The developer must also decide whether an all-empty Dashboard says anything at project level, and whether it is visibly distinguishable from the No project surface — three tiles each stating their own local emptiness could read as a broken scan.

**Consequence of divergence.** Dev A implements FR-55 with an invented emphasis and risks the anti-pattern the document names outright (*"A dashboard that flags a missing PRD on a `bmad-build`-only project"*). Dev B drops FR-55 entirely, and the tool stays silent when a story genuinely depends on a decision nothing records. The requirement is bidirectionally dangerous and the design says nothing.

### F7 — Section permalink to a section that no longer exists (X4 · Document reader)

**Condition.** §Interaction Primitives: *"Section permalinks are stable across refreshes and independent of how a document was divided (AD-18)."* URL stability is not target existence. A refresh, or a rewrite by an agent, removes the heading the permalink names.

**What a developer must invent.** 404, or the document top with a stated note, or a nearest-heading fallback. The third is tempting and forbidden in spirit: §Evidence and Honesty Patterns says *"The tool never asserts a relationship it cannot evidence"*, and silently landing a reader on a neighbouring section is exactly such an assertion. Also undefined: whether `1`–`9` renumber under the reader's feet after a refresh.

**Consequence of divergence.** A copied permalink pasted to a colleague resolves to a different place in two builds, one of them plausibly to the wrong content with no indication.

### F8 — Refreshing on Oversight, Artifact view, Document reader, Comparison has no host element (Refreshing row · four surfaces)

**Condition.** Progress lives *"in the project header"*, which §Information Architecture places above the Dashboard tiles. `r` is global. AD-11's refresh offer can fire on any reading surface.

**What a developer must invent.** Whether the header is global chrome or Dashboard-only; where progress appears on a document you are mid-read; what "the header offers the new snapshot" looks like when the current page came from the old one — a banner, a button, a changed currency line — and whether accepting it preserves scroll position and the open section. On Comparison, whether one refresh re-resolves both panes (AD-17 says a response is one snapshot, so it must) and what happens if one pane's artifact changed and the other did not.

**Consequence of divergence.** Dev A ships persistent global chrome; Dev B ships reading surfaces with no visible refresh state at all, where pressing `r` appears to do nothing until the user navigates. Same keystroke, two products.

### F9 — Per-viewer Empty and Degraded are Dashboard vocabulary only (Artifact view / Document reader / Comparison × Empty, Degraded)

**Condition.** §State Patterns Degraded speaks of *"a row or card"*; CAP-4 requires each viewer to render *"a degraded artifact explicitly rather than omitting it"*, and AD-7 requires *"Every view renders these values explicitly."* Concrete cases: a memlog file that exists with zero entries (distinct from `No decision trail — bmad-build does not write one.`, which is the *build-stage* case named in UJ-1); a reviewer output with no findings but a verdict; sprint tracking with zero epics; an unknown memlog entry type, since shapes states the vocabulary is *"not enforced"* and `memlog.py` says *"the script does not enforce one"* — while §Key Flows UJ-1 step 3 specifies only that `override` and `assumption` are *"visually distinct"*, leaving a third type with no appearance and `DESIGN.md` with no token for it.

**What a developer must invent.** Three separate renderings currently collapsed onto one string (no memlog file / empty memlog / build stage that writes none); the appearance of an unrecognised entry type; whether a degraded artifact's row is even clickable and what the destination shows; whether a Comparison pane can hold a degraded artifact or the comparison is refused.

**Consequence of divergence.** UJ-1's climax is finding an `override` entry. In a build where unknown types render as plain body text, an override recorded under a project-specific vocabulary variant is invisible — the tool silently fails at the one thing the journey exists to do. Divergence here is not cosmetic; it changes what the user can find.

### F10 — Same-day run folder and unidentified artifact: strings without placement (X8, X9 · Dashboard, Artifact view, Oversight)

**Condition.** Both have load-bearing strings — `This folder may contain more than one run.` and `Not identified. Tried: config path, frontmatter, structure, filename.` — and no placement or behaviour. Shapes: *"same-day reruns land in the same folder — one folder is not one run."*

**What a developer must invent.** Whether a multi-run folder is one activity row or several, what its evidence resolution is, and whether the caveat sits on the row, the artifact header, or both. For an unidentified artifact: which family filter it answers to (FR-17 filters by family and it has none), whether it appears in the feed at all, which viewer opens it given CAP-4's premise that generic rendering is what the product avoids, and how it counts in Oversight coverage.

**Consequence of divergence.** Activity counts differ between builds for the same project; a family filter hides items in one build and shows them in the other. Visible, but narrower than F1–F9.

### F11 — Timezone disclosure is an architecture obligation with no UX (X12 · Dashboard, Artifact view)

**Condition.** AD-5: *"The applied zone travels with the value so the UI can disclose it."* SPEC §Assumptions fixes local-machine interpretation. Three of four BMAD timestamp formats are timezone-naive. `EXPERIENCE.md` mentions timezone zero times and has no strings-table row for it; AD-6 explicitly separates zone from resolution, so the evidence badge does not carry it.

**What a developer must invent.** Whether the zone is disclosed at all, and if so per row, per artifact, or once in the project header.

**Consequence of divergence.** One build discloses an assumption that materially affects ordering; the other does not, and its feed looks more confident than its evidence supports — a milder instance of the named worst outcome.

### F12 — Unsanitized slugs as display strings (X13 · Dashboard, Artifact view, Comparison)

**Condition.** Shapes: slugs are *"free text that nothing sanitizes"* reaching consumers as both paths and URL components. NFR-17 and AD-10 cover the security surface. Neither UX document covers the *display* surface: no truncation rule, no escaping statement, no maximum width. §Voice and Tone says monospace machine strings; `DESIGN.md` §Layout gives no overflow behaviour for the activity row's monospaced secondary line or the Comparison pane label.

**What a developer must invent.** Truncation point, ellipsis position (a path truncated at the head loses the filename; at the tail, the location), tooltip or not, and wrapping behaviour.

**Consequence of divergence.** Visibly different rows and, in the tail-truncation build, unreadable identities on deep artifact paths. Low-moderate: annoying rather than misleading.

### F13 — Two candidates for one core artifact; reviews in two locations (X14 · Dashboard, Oversight)

**Condition.** Shapes: filenames vary legitimately (`prd.md`, `bmm-prd.md`, `product-requirements.md`) and *"Review outputs are written to two places — the workspace root by some skills, a `reviews/` subfolder by others."* CAP-6 aggregates reviewer findings *"across run folders"*.

**What a developer must invent.** Which candidate a core card links to when FR-8's precedence resolves two; whether the ambiguity is disclosed; whether findings found in both locations are deduplicated, and on what key given shapes §What BMAD does not record states there is *"no correlation identity between artifacts."*

**Consequence of divergence.** Oversight counts differ between builds. Moderate, and it undermines a count the user is asked to trust — but it needs a project with reviews in both locations to bite.

### F14 — Status vocabulary extraction failure has no surface (X11 · Artifact view, Oversight)

**Condition.** AD-13 requires convention-derived parsers to *"fail visibly"* when extraction yields nothing; shapes: status vocabularies *"are defined in YAML comments"* in `sprint-status-template.yaml` and *"no test protects them."*

**What a developer must invent.** What "visibly" is in the interface — a degraded sprint view, an `Unreadable` signal on the sprint family, or a project-level notice. AD-13 mandates visibility and the UX layer names no visible thing.

**Consequence of divergence.** One build shows a sprint view with unlabelled states; the other shows a stated failure. Real, but bounded to one viewer and one BMAD-version change.

### F15 — The modal overlay exists in the interaction model and on no surface (X15)

**Condition.** §Accessibility Floor: *"no keyboard traps outside a modal overlay, which returns focus to its trigger on close."* §Interaction Primitives: `Escape` *"closes any open overlay first."* §Information Architecture names six surfaces and no overlay; `DESIGN.md` §Elevation lists level 2 for *"tile carrying primary attention, and popovers"* — a popover with no owner.

**What a developer must invent.** Whether the overlay is real, and if so what it holds — the most likely candidates are the Comparison artifact nominator (UJ-2 step 2, unspecified) and the activity filter control (§Interaction Primitives Filtering, also unspecified as a control). Either would be a seventh surface, or a component, that the IA does not acknowledge.

**Consequence of divergence.** Dev A builds a nomination dialog; Dev B builds an inline picker on the Artifact view. Both satisfy the document. Low ranking only because the divergence is visible immediately and cheap to reconcile — but it is a genuine hole in §Closure's claim that *"Every capability lands on a surface."*

---

## Recommended remedies, in the order that closes the most risk per edit

1. **Add a per-surface state table** to §State Patterns — six rows, five columns, one sentence of observable behaviour per cell — and keep the existing five prose patterns as the defaults the table specialises. This alone converts most I grades to S and makes the section's own claim true.
2. **Declare the project header global chrome** (or declare it Dashboard-only and specify a refresh/currency affordance for the other five surfaces). This closes the Refreshing and Stale rows at once (F8).
3. **Specify the refresh failure branch** — partial snapshot published or discarded, what the header says, what per-file read failures become (F2).
4. **Write the non-git project's feed presentation**, including AD-6's tiebreak and whether the project states its non-repository status (F1).
5. **Add a "not on disk" state and string** for the vanished-artifact case, distinct from `This file changed after the last scan.`, plus the navigation behaviour from a page that cannot render (F3).
6. **Add sharded/whole to the Document reader**, with the contents rail's granularity rule and a string for AD-4's ambiguous run-folder-or-sharded-document verdict (F4).
7. **Resolve out-of-tree against the four-state set** — either extend the closed vocabulary deliberately with a fifth state and colour, or define the out-of-tree sentence that keeps it out of `Not checked` (F5).
8. **Give FR-55's elevated absence a token, a string, and a stated threshold**, or record a decision not to implement FR-55 in v1 (F6).
9. **Extend the load-bearing strings table** with the rows the extended matrix requires: empty-but-present artifact, unknown memlog entry type, out-of-tree location, extraction failure, missing permalink target, timezone disclosure, and `Nothing flagged` / `nothing checked` as literal strings rather than a requirement about them.
10. **Close §Open Questions honestly.** It currently reads "None." The nomination mechanism for Comparison, the identity of the modal overlay, and the AD-6 tiebreak are three open questions the document contains but does not list.
