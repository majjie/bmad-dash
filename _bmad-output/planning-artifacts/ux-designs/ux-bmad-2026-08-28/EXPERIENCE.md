---
name: bmad-dash
description: Information architecture, behavior, states, interactions, accessibility and journeys for bmad-dash v1. Visual identity lives in DESIGN.md.
status: final
created: 2026-08-28
updated: 2026-09-03
sources:
  - ../../../specs/spec-bmad-dash/SPEC.md
  - ../../../specs/spec-bmad-dash/bmad-source-shapes.md
  - ../../prds/prd-bmad-2026-08-28/prd.md
  - ../../architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md
design: ./DESIGN.md
---

# bmad-dash — Experience

## Foundation

**Form factor:** desktop browser, served on loopback by a CLI the user just ran. Responsive and platform behaviour is specified once, in Responsive and platform.

**UI system:** none inherited. Material 3 is adopted as a *token* reference — colour roles, tonal elevation, shape and spacing scales — not as a component library. Components are built locally. Visual identity: `./DESIGN.md`.

**Rendering boundary (inherited, AD-2):** document content is HTML from the server. The client adds interaction on delivered markup. No client-side router owns a document URL. Every pattern below respects that split — anything specified as a behaviour is client-side enhancement of server-rendered structure.

**Session model (inherited, AD-12):** the tool remembers nothing between runs. No preferences, no layout, no history, no "last viewed". Every surface must be fully meaningful on first load with zero prior state.

## Evidence and honesty patterns

The product-specific section. `bmad-dash` exists to be trusted about a machine's output, so the interface has to be trustworthy about its own.

**Every ordered thing shows why it is ordered there.** Position is never presented without its evidence tier and resolution. A feed that looks confidently chronological while resting on day-resolution dates is the failure mode this pattern prevents.

**Unorderable is a rendered state, not a fallback position.** Items whose evidence cannot separate them are grouped under `Order unknown` rather than interleaved in a plausible-looking sequence.

**Coverage is always visible in the Oversight surface,** which reports what was examined, what could not be interpreted, and which signals were unavailable per artifact family (AD-8, FR-76). `Nothing flagged` and `nothing checked` must be visibly different outcomes — a reader must never have to guess which one they are looking at.

**Silence is bounded.** Risk indication errs quiet (FR-56), but no surface may be empty without saying whether it is empty because nothing was found or because nothing was looked at.

**The tool never asserts a relationship it cannot evidence.** No inferred lineage between artifacts, no divergence claims, no "this supersedes that."

## Information architecture

Five surfaces. Each is reachable by URL and survives reload (AD-18).

| Surface | Holds | Reached from |
|---|---|---|
| **Dashboard** | Recent activity, core artifacts, risk summary | landing; `bmad-dash` invocation |
| **Oversight** | Risk surface aggregated across the project | dashboard risk tile |
| **Artifact view** | One artifact in the viewer for its type | activity row, core card, oversight finding |
| **Document reader** | A long document as linked sections with a contents rail; shard boundaries where the document is already sharded | artifact view, when the artifact is a long document |
| **Comparison** | Two user-nominated artifacts side by side | artifact view action, or dashboard |

**Dashboard composition.** Static tiles, fixed positions (no drag, resize, or dismiss — a user arrangement would need persistence the architecture forbids). Tiles are the developer extension point: a new capability adds a tile.

- **Recent activity** — the widest tile, top-left. The reason the page exists.
- **Core artifacts** — right column. Central documents, present or absent.
- **Risk summary** — beneath core artifacts. Counts by signal state, linking into Oversight.

**Global chrome.** The **project header** is not a Dashboard tile — it is present on every surface, and it is where snapshot currency, refresh progress, and refresh failure are reported (all three Story 3.6's; the per-document **Stale** mismatch that used to be listed among them was withdrawn 2026-09-04 with AD-11). Refreshing is reported here, so every surface inherits it. (~~and Stale~~ — **withdrawn 2026-09-04** with AD-11: with no currency mismatch there is nothing for a surface to inherit.) It carries: project name, resolved root path, snapshot currency, the refresh control, and the git-availability indicator.

**Overlays.** One overlay pattern exists: the **artifact nominator**, opened from the Comparison surface to choose an artifact. It is the only modal in v1, traps focus while open, and returns focus to its trigger on close.

**Closure.** Every capability lands on a surface or on the global chrome: CAP-1 → global header, with its failure path handled in the CLI rather than by a surface; CAP-2 → provides the artifact identity every surface depends on; CAP-3 → Dashboard; CAP-4 → Artifact view; CAP-5 → Document reader; CAP-6 → Oversight and the risk summary tile. Every surface is reached by a journey in Key flows. The one former exception — a No project surface reached by error rather than intent — no longer exists: the tool does not serve when there is no project, and reports the failure in the terminal with suggested invocations instead.

## Voice and tone

Terse and technical, matching the fluent-practitioner default. This is load-bearing rather than stylistic: v1 ships no explainer layer (C9 is v2), so these strings are the only explanation a reader gets.

- **State facts; don't apologise.** "Could not parse `sprint-status.yaml`" — not "Sorry, something went wrong."
- **Name the limit, not the feeling.** "Ordered by day only" beats "ordering may be approximate."
- **Never claim more than the data supports.** Copy says *may predate*, never *is out of date*. It says *no memlog for this run*, never *no decisions recorded*.
- **Distinguish the four signal states in words, always.** "Not checked" and "not found" are different sentences and must never collapse into "none".
- **Monospace machine strings inline** so tool language and project data stay separable.
- **No exclamation marks, no encouragement, no personality.** The tool is an instrument in someone's judgement loop.

**String conventions.** Sentence-shaped strings end with a period; label-shaped strings do not. Badge and pill labels take an initial capital. Substituted values appear as `<placeholder>`; a number shown without brackets is an example, not a literal.

**Load-bearing strings** — the complete index. These carry the product's honesty and are reviewed as design, not copy. A string specified anywhere in this document appears here; prose may quote one for context but this table holds its authoritative form.

| Situation | Says |
|---|---|
| Signal found | `Present` |
| Signal not examined | `Not checked` |
| Signal looked for, not found | `Not found` |
| Signal found, unparseable | `Unreadable` |
| Ordering from mtime only | `File time only — weak evidence` |
| Ordering at day resolution | `Day resolution — order within the day unknown` |
| Items that cannot be ordered | `Order unknown` (grouped, not interleaved) |
| ~~Document changed since scan~~ | ~~`This file changed after the last scan.` + refresh action~~ — **WITHDRAWN 2026-09-04** with AD-11 and Story 2.2. The condition cannot arise: the snapshot is rebuilt per request, so it always already records the edit. |
| Run folder may hold several runs | `This folder may contain more than one run.` |
| No memlog for a build stage | `No decision trail — bmad-build does not write one.` |
| Artifact unidentified | `Not identified. Tried: config path, frontmatter, structure, filename.` |
| Refresh failed partway | `Refresh failed — showing the previous scan.` plus the reason |
| Project is not a git repository | `Not a git repository — ordering from BMAD records only` |
| ~~Artifact gone since scan~~ | ~~`No longer on disk. It was present at the last scan.`~~ — **WITHDRAWN 2026-09-04** with AD-11 and Story 2.2. A vanished artifact loses its row in the same re-scan, so the request is a 404 and no artifact page renders. |
| Section permalink target gone | `That section no longer exists in this document.` |
| Oversight with nothing flagged | `No findings. <n> artifacts examined.` |
| Artifact exists but is empty | `Empty file.` |
| Comparison pane with nothing chosen | `Choose an artifact.` |
| No runs of a family | `No <family> runs in this project.` |
| Everything hidden by a filter | `No matches. <n> items hidden by filter.` |
| Run folder vs sharded document ambiguous | `Could be a run folder or a sharded document` |
| Story location outside the project | `Story location points outside the project: <path>. Not read.` |
| Valid project, no artifacts yet | `A BMAD project, with no artifacts yet.` |
| Evidence tier labels | `Commit` · `Uncommitted` · `Day only` · `File time` · `None` |
| One BMAD project found near a non-project target | `A BMAD project is nearby. Run this instead.` |
| Several BMAD projects found near a non-project target | `<n> BMAD projects are nearby. Run one of these instead.` |
| No BMAD project within the suggestion scan's bounds | `No directory holding <markers> is in the ancestors of <path>, or within <n> levels below it.` |
| Suggestion scan stopped before it finished | `The scan did not finish, so a project may be missing: <reasons>.` |
| More candidates found than the refusal prints | `<n> more not listed.` |
| Artifact identified, shape not interpreted | `Present, but its shape was not interpreted.` |
| Identification below certain | `<confidence>, not certain — resolved by <level>.` |
| Run folder name reused deliberately | `Reusing this name is how BMAD resumes a run.` |
| Run folder name repeats by accident | `A same-day rerun lands in this folder.` |
| Run folder name carries no date | `No date in the folder name.` |
| No artifacts of a family | `No artifacts of this family in this project.` |
| Story location resolved inside the project | `Stories are at <path>.` |
| No sprint tracking in the project | `No sprint tracking in this project.` |
| Sprint-derived view unavailable | `Sprint view unavailable.` |
| Artifact scan finished | `The scan finished. Artifacts examined: <n>.` |
| Artifact scan stopped before it finished | `The scan did not finish, so an artifact may be missing.` |
| Names the scan did not examine | `Names outside the artifact output tree, not examined: <n>.` |
| Second spelling of an artifact | `<name> is a second spelling of <path>.` |

## Component patterns

Behavioural specs. Visual specs live in `DESIGN.md`.

**Tile** — self-contained; never depends on another tile's state. Renders meaningfully when its data is empty, partial, or unavailable, and says which.

**Activity row** — one artifact event. Click or Enter opens the artifact view. The evidence badge is not interactive but is readable to assistive tech as part of the row's accessible name, so the evidence tier travels with the item instead of sitting beside it as decoration.

**Evidence badge** — always present, including for strong evidence. Its two visual weights never carry information the text omits: a reader who cannot distinguish the weights still reads the label.

**Signal pill** — one of exactly four signal states; the set is closed. Visual treatment: DESIGN.md.

**Core artifact card** — an absent artifact keeps its grid position at reduced weight, is not a link, and reads `Not found`. It is informational, never a call to action, and never implies a deficiency: a project built entirely through `bmad-build` legitimately has no PRD. Absence is elevated above neutral only when another artifact on disk implies the missing one should exist (FR-54, FR-55).

**Contents rail** — accompanies the Document reader; marks the current section; is a nav landmark; scrolls independently of content.

**Comparison pane** — two panes, each independently scrollable, each labelled with its artifact's identity and currency. The tool asserts no relationship between them; there is no "difference" affordance, no diff, and no alignment of one to the other.

## Surface states

Five surface states. The cross-cutting rules after the matrix **bind on every surface by default**; the matrix carries only where a surface departs from them. Neither is commentary — a surface's behaviour is its matrix row read against the defaults.

Refreshing has two outcomes, complete and failed. The failure branch is a branch, not a sixth state.

| Surface | Refreshing | Empty | Degraded | Stale |
|---|---|---|---|---|
| **Dashboard** | tiles stay live | per-tile, by cause | per row or card | header currency |
| **Oversight** | findings stay live | `No findings. <n> artifacts examined.` — never a bare "no findings" | unreadable artifacts listed as their own group | header currency |
| **Artifact view** | stays on its snapshot | artifact exists but has no content → `Empty file.` | parse failure replaces the viewer, path and stage shown | ~~mismatch banner + refresh offer (AD-11)~~ withdrawn 2026-09-04 |
| **Document reader** | position preserved | document with no headings → single unsectioned page | section unparseable → that section only shows the failure | ~~mismatch banner; contents rail marked stale~~ — **WITHDRAWN 2026-09-04** with AD-11 and Story 2.2, the same strike already applied to the Artifact view row above. With no currency mismatch there is nothing to banner, so the Document reader (Story 2.10) has no Stale behaviour to build. |
| **Comparison** | both panes hold their snapshot | pane with nothing nominated → `Choose an artifact.` | either pane degrades independently | per-pane currency, independently |

**Cross-cutting rules.**

**Loading** — every surface's first paint is server-rendered content: no skeleton, no spinner-then-populate. Comparison renders both panes server-side.

**Refreshing** — user-initiated (FR-37), progress reported in the global header. The current surface stays readable and interactive on its own snapshot (AD-17); it is never replaced under the user. Progress is determinate where the file count is known, indeterminate otherwise.

**Refresh failure** — a scan that fails partway is **discarded, not published.** The previous snapshot remains current and the header states `Refresh failed — showing the previous scan.` with the reason. A partially-built snapshot must never become the live one: a fresh-looking dashboard with silent holes is the worst outcome this product can produce.

**Empty** — always distinguished by cause. `No <family> runs in this project.` · `No matches. 14 items hidden by filter.` with a clear action · `Not checked` where the signal was never examined, which is never rendered as empty. A bare "nothing here" is a defect on every surface.

**Degraded** — a failing artifact renders in place, stating what failed and at which stage (AD-7). Never omitted, never fatal to its neighbours.

**Stale** — ~~currency is always stated. On opening a document whose on-disk state differs from the snapshot record, the mismatch is surfaced with a refresh offer (AD-11), never silently corrected.~~ **WITHDRAWN 2026-09-04** with AD-11 and Story 2.2: a per-request snapshot cannot differ from the file it just recorded. The *header's* currency line (FR-47, Story 3.6) is a different thing and is unaffected.

## Edge conditions

Conditions beyond the five surface states, drawn from `bmad-source-shapes.md`. Each needs one answer, not one per developer.

**No git repository** — FR-14's top two tiers vanish, so every badge would read weak and the feed would be one large `Order unknown` group. Instead: the header states `Not a git repository — ordering from BMAD records only`, and the badge weights re-base on the tiers that *are* available, so a weak badge still means weak relative to the evidence this project can offer. Where items share a day-resolution timestamp, AD-6 breaks the tie by run-folder date, then path, so ordering is deterministic rather than arbitrary. No displayed timestamp is finer than its evidence supports.

**Artifact vanished between scan and open** — ~~ordinary in a tool opened while agents write. The artifact view renders `No longer on disk. It was present at the last scan.` with a refresh offer. It is a distinct string from the changed-since-scan case, which is a different fact.~~ **WITHDRAWN 2026-09-04** with AD-11 and Story 2.2. Verified: the re-scan that would notice the file is gone also drops its row, so the request answers 404 rather than rendering an artifact page with a notice on it.

**Sharded document** — a document arriving as a directory with `index.md` uses its existing shard boundaries as pages (FR-77); one arriving whole is carved by heading weight. The reader looks identical either way, and the contents rail does not disclose which it was. Where the shape is genuinely ambiguous (AD-4 forbids resolving it silently), the artifact view states `Could be a run folder or a sharded document` and offers both readings.

**`story_location` outside the project tree** — reported at the artifact-family level, not as a signal state: `Story location points outside the project: <path>. Not read.` 

**Unidentified artifact** — listed as present-but-uninterpreted, naming the levels tried (FR-69). It occupies a row, is not a link, and is never hidden.

**Section permalink whose section is gone** — after a refresh or an upstream edit, the reader opens the document at its top and states `That section no longer exists in this document.` It does not 404 the whole document.

**Run folder holding several same-day runs** — the artifact view states `This folder may contain more than one run.` Items are not silently merged into one.

**Valid BMAD project with zero artifacts** — distinct from the CLI's not-a-project failure, which never reaches a surface: the Dashboard renders with every tile in its empty state, and the header confirms that a project *was* found. `A BMAD project, with no artifacts yet.`


## Interaction primitives

Defined once, shared by every surface (no surface implements its own).

**Keyboard model**

| Key | Does |
|---|---|
| `Tab` / `Shift+Tab` | move through interactive elements in one document order |
| `↑` `↓` or `k` `j` | move between rows within the focused list |
| `Enter` | open the focused row or card |
| `Escape` | closes any open overlay; with none open, leaves the current reading surface and returns you to where you came from |
| `r` | refresh |
| `g` then `d` | dashboard |
| `g` then `o` | oversight |
| `1`–`9` | jump to the nth section of the open document |

Single-letter keys are inert while a text input has focus.

**Navigation** — every surface has a URL; browser back and forward work throughout, because no client router owns document URLs (AD-2). Section permalinks are stable across refreshes and independent of how a document was divided (AD-18).

**Read-only affordances** — copy the artifact's path, open it in the user's editor, copy a section permalink. Nothing writes to the project (AD-1). There is no action that mutates BMAD state, and none should be added.

**Filtering** — activity filters by artifact family and time window (FR-17). Filters live in the URL so a filtered view is linkable, and are never remembered between runs.

**Motion** — functional only; specified in DESIGN.md. The one behavioural rule this document owns: no interaction is gated on an animation completing.

## Accessibility floor

WCAG 2.2 AA is the floor, not the goal. Behavioural requirements; contrast lives in `DESIGN.md`.

- **Full keyboard operation** (NFR-14). Every action reachable without a pointer; no keyboard traps outside a modal overlay, which returns focus to its trigger on close.
- **Focus is always visible and never obscured** (2.4.11, 2.4.13). Containers reserve ring space inside their padding; no sticky region may overlap a focused element. A focus ring clipped by a tile edge is a defect, not a cosmetic issue.
- **Nothing depends on colour alone** (1.4.1). Every signal state, evidence weight, and status carries text or shape as well as hue.
- **Landmarks and headings** — banner, navigation (contents rail), main, and one `h1` per surface. Tile labels are real headings so a screen reader can traverse the dashboard by structure.
- **Live regions used sparingly** — refresh completion is announced politely; nothing else interrupts.
- **Accessible names carry the honest state.** A row's accessible name includes its evidence tier; a signal pill's name is its state word. Assistive tech users get the same honesty the visual design provides, not a flattened version.
- **Text resizes to 200% without loss** (1.4.4). Density comes from spacing, not from small type, which is what makes resizing survivable.

## Responsive and platform

Desktop browser only. One breakpoint at ~900px, below which the tile grid becomes a single column in reading order: project header, recent activity, core artifacts, risk summary. Document reader moves its contents rail above the content. Below ~600px no layout is specified; the page remains readable but is not a design target.

No platform-specific behaviour. Latest Chrome, Firefox, Safari and Edge; no legacy support.

## Reference mockups

[`mockups/key-screens.html`](./mockups/key-screens.html) shows the Dashboard mid-refresh — determinate progress, strong and weak evidence badges, a degraded row in place, the `Order unknown` group, an absent core card, all four signal pills — and the Artifact view opened stale, with override and assumption entries typed distinctly. Surfaces not mocked (Oversight, Document reader, Comparison) are built from the tables above.

The spines win on conflict with any mockup.

## Key flows

Protagonist is Jamie, the author of the requirements and the tool's first user. Journey names mirror the PRD verbatim.

### UJ-1 — Verifying a completed stage

1. A BMAD stage has just finished. Jamie runs `bmad-dash` in the project; the browser opens on the Dashboard.
2. **Recent activity** shows the just-completed run at the top, its evidence badge reading `uncommitted` — the agent wrote but did not commit.
3. He opens the run's memlog. The memlog viewer shows the trail as a typed timeline, with `override` and `assumption` entries visually distinct.
4. **Climax:** an `override` entry states a decision the agent took without asking him. It is the thing he came to find, and he found it without opening a file or knowing the folder's name.
5. To see whether it stands alone he opens **Oversight**, which aggregates the project's risk surface and reports what was examined and what was not — confirming this is the only override, rather than the only one that happened to surface.
6. The override references a requirement, so he opens the PRD in the **Document reader** and reads that section directly rather than scrolling six thousand words.
7. He copies the file path, opens it in his editor, and fixes it — or re-runs the responsible skill. The tool wrote nothing.

*If the stage was a build:* step 3 shows `No decision trail — bmad-build does not write one.` The absence is stated, not implied by an empty panel.

### UJ-2 — Checking that requirements survived the journey

1. Jamie suspects the architecture may not reflect the current spec.
2. From the artifact view he nominates two artifacts for **Comparison**.
3. The two panes open side by side, each labelled with its identity and currency, each scrolling independently.
4. **Climax:** he reads the two and decides for himself. The tool has claimed nothing about their relationship — no diff, no divergence flag, no lineage — and that restraint is what makes the panes trustworthy.

### UJ-3 — Returning after absence

1. Jamie comes back from holiday, pulls from git, and runs `bmad-dash`.
2. The Dashboard orders recent activity by commit time — the only per-event chronology available, since memlog entries carry no timestamps.
3. Rows resting on weaker evidence are visibly weaker; a group under `Order unknown` holds what could not be placed.
4. **Climax:** he sees what moved while he was away *and* how much to trust the sequence — including that some of it cannot be sequenced at all. The tool has no memory of his last visit and does not pretend to.

## Anti-patterns

Consolidated for a builder scanning for what not to do. Each is specified in full where it is cited.

- A confidently chronological feed with no indication of evidence quality — Evidence and honesty patterns.
- An empty panel that could mean "clean" or "not examined" — Surface states, Empty.
- Colour-only status encoding — Component patterns, Accessibility floor.
- Any write path, including convenient ones: marking a story done, resolving a question, launching a skill — Interaction primitives.
- Live-updating panels — Surface states, Refreshing.
- Flagging a missing PRD on a `bmad-build`-only project — Component patterns, Core artifact card.
- Rearrangeable tiles — Information architecture, Dashboard composition.
- Publishing a partially built snapshot — Surface states, Refresh failure.

## Open questions

None.
