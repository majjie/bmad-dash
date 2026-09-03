---
title: bmad-dash
status: final
created: 2026-08-28
updated: 2026-08-28
---

# bmad-dash — Product Requirements

**At a glance.** A single command, run in any BMAD project, opens a browser onto everything the project has produced — synthesized, dense, navigable, and correct — so a human can exercise judgement over machine-generated work. The tool observes and never writes. v1 is capability groups C1 through C6 — 59 active requirements of the 77 assigned below (8 withdrawn, 10 deferred).

| Group | v1 |
|---|---|
| C1 Invocation and serving | Yes |
| C2 Project interpretation | Yes |
| C3 Recent activity and core artifacts | Yes |
| C4 Artifact viewers | Yes |
| C5 Large-document navigation | Yes |
| C6 Oversight surfacing | Yes |
| C7 Live threads | Deferred |
| C8 Corpus navigation | Deferred |
| C9 Concept explanation | Deferred |

## 1. Problem

BMAD records everything it does, faithfully, in markdown and YAML spread across a project tree: planning artifacts, per-run folders, append-only memlogs, sprint tracking. The record is complete. It is also close to unreadable.

Answering a question as simple as *"what is actually happening in this project right now?"* currently requires a practitioner to open several files in different formats, hold their relationships in their head, and mentally reconstruct state that no single file records. The cost is not that the information is missing — it is that retrieving it demands sustained cognitive overhead every time, and that overhead is paid most often at the exact moment the user has least context: on returning to a project.

Two specific failures compound this:

- **Scale.** Specs are reported to reach ~24,000 words. A document that long, rendered as one page, is not navigable — it is a wiki with no navigation.
- **Absence of synthesis.** No artifact answers "what is in flight." `sprint-status.yaml` knows about epics and stories. Frontmatter knows whether one document is draft or final. Nothing joins them.

## 2. Vision

A single command, run in any BMAD project, opens a browser onto that project's generated record — organized so that a human can **exercise judgement over machine-generated work** quickly, and navigate the accumulated corpus of past work without archaeology.

The tool observes and never writes.

### 2.1 What the tool is for

**Primary job — oversight.** The user's central need is assurance: confirming that nothing overtly wrong has entered the generated artifacts — no egregious assumption, oversight, or hallucination. This is a review posture, not a status-check posture. It implies the tool is not a neutral renderer — it must actively expose a project's *risk surface*, drawing attention to what warrants scrutiny rather than presenting all content with equal weight.

**Secondary job — corpus navigation.** The user picks through previously executed or generated artifacts as examples of good practice or as cautionary tales. This makes completed and historical runs first-class subjects, not merely archived state. It is explicitly *not* about what is in flight.

The two jobs share one substrate — the project's artifacts — and differ in time horizon: oversight looks at what is live or recent, corpus navigation looks across everything ever produced.

### 2.2 Framing decisions

Four decisions define the product and constrain everything downstream.

**There is no "current stage."** An early design instinct — show the user which BMAD stage they are at — was investigated and rejected as unsound. Stage is not a computable scalar in BMAD:

- `bmad-correct-course` exists specifically to amend PRD, epics, architecture and UX *during* sprint execution; back-flow into planning is designed-in, not exceptional.
- The mix of artifacts legitimately varies between projects, and a missing artifact type is valid rather than a gap.
- `bmad-build` can run with no planning artifacts at all.

A tool that named one current stage would therefore be confidently wrong. **Live threads are the organizing structure of the UI**: every strand currently active is surfaced concurrently, never collapsed into a single position. Live threads are the *structure*, not the *purpose* — the purpose is oversight, and oversight ranges over historical artifacts too.

**Read-only is an invariant, not a default.** BMAD agents write these files while the tool displays them. Refusing to write removes an entire class of conflict and corruption defects at the door. Supporting evidence: `bmad-sprint-planning` already ships a `fix-sprint-status` repair path, so `sprint-status.yaml` corrupts under a *single* writer. Read-only excludes writes; it does not exclude useful affordances (copy-command, open-in-editor, permalinks).

**Density first, explanation on demand.** The default view optimizes for information density and speed of retrieval, serving a fluent BMAD user. Newer users are served by progressive disclosure — unobtrusive inline affordances that expand concepts on request — rather than by diluting the default view. Note the release consequence: the disclosure layer is C9 and deferred, so v1 delivers only the density half (§3).

**The glossary tracks the user's installed BMAD version.** Concept explanations must be true for the BMAD version present in the *target* project, including any org-specific skills it carries. An explanation known to be stale is withheld rather than shown. See `addendum.md` for the derivation mechanism.

### 2.3 Scope boundary — what oversight does and does not mean

This boundary is load-bearing and is stated here to prevent downstream over-promise.

**In scope: making the risk surface visible and fast to scan.** The tool surfaces what BMAD already records explicitly — `[ASSUMPTION]` tags, open questions, `[NOTE FOR PM]` callouts, deferred items, and above all memlog entries of type `assumption` and `override`, the latter being where a headless run records decisions taken without the user present. It also surfaces structural risk that is computable without judgement: documents marked final while carrying open items, requirements with no downstream trace, artifacts changed since the user last looked.

**Out of scope: judging correctness.** The tool does not detect hallucination, evaluate whether an assumption is reasonable, or assess whether a requirement is sound. Such detection would require an LLM evaluator, which is a materially different product with its own accuracy, cost, and trust characteristics. The human supplies the judgement; the tool minimizes what they must read to apply it.

**A known limitation, measured.** Marker conventions are unevenly adopted: `[ASSUMPTION]` appears in 6 files across 4 skills, and `[NOTE FOR PM]` in 3 files within a single skill (`bmad-prd` itself). Of 49 installed skills, 20 are deprecated forwarding stubs, leaving an effective denominator near 29. Marker-based surfacing therefore has blind spots wherever a skill does not emit them. The memlog is the more reliable signal because it is written through a shared script rather than by convention. The tool must not imply completeness it cannot deliver.

## 3. Users

**Primary — the fluent practitioner.** Jamie, the author of this PRD and its first user. Runs BMAD regularly, knows what a memlog and an epic are, and wants answers faster. Optimizes for: density, keyboard navigation, immediate correctness. Opens the tool many times per session. This posture sets the default experience.

**Secondary — the newer user.** Learns BMAD's model while using it, and uses the tool to understand what BMAD is doing to their project. Served by opt-in concept explanation layered over the dense view, never by a separate simplified mode.

**This posture is not served in v1.** The concept-explanation layer is capability C9, deferred (§6), so v1 assumes a knowledgeable user base by decision. The explanatory burden falls entirely on default microcopy, which the UX contract treats as load-bearing rather than stylistic for exactly this reason. A newer user is a v2 audience.

The two postures are the same person at different times, which is why they share one interface.

## 4. User journeys

Three sessions, in the user's own priority order. Jamie is the protagonist and the primary user; the tool is not yet designed for anyone whose workflow differs materially.

### UJ-1 — Verifying a completed stage (primary trigger)

A BMAD stage has just finished. Jamie wants to be the human in the loop before anything downstream builds on the output: inspect what was produced, satisfy himself nothing is overtly wrong, and move on.

He runs the command in the project he is working on, and the browser opens. The just-completed work is what he needs first — the artifact the stage produced, plus what the run recorded about its own reasoning: decisions taken, assumptions made, anything overridden without asking. He reads the output itself, then the trail behind it. He is looking for the thing that does not belong.

The session ends when he is satisfied, or when he finds something and goes to fix it — by opening the file in his editor, or by re-running the responsible skill.

**Implications.** Recently completed work must be the first thing visible (C3). The memlog's `override` and `assumption` entries carry the highest oversight value (FR-29). Verification is deliberate and bounded, not ambient monitoring — which is why user-initiated refresh is sufficient (FR-37).

### UJ-2 — Checking that requirements survived the journey

Jamie wants confirmation that requirements and constraints propagated correctly between documents, and that concrete technical decisions have not diverged — the spec saying React 18 while the architecture says React 17.

**This is a manual comparison, not a feature.** The operator opens the relevant artifacts and judges them against each other. `bmad-dash` serves the journey by making that comparison cheap — artifacts identified and located (C2), rendered in viewers suited to their shape (C4), and navigable at section granularity in long documents (C5) — not by detecting divergence itself.

Two reasons the manual framing is the honest one. Automated detection of technology pins from prose is heuristic and would produce exactly the dismissible false alarms FR-56 forbids. And requirement propagation cannot be verified at all: BMAD records no correlation identity linking artifacts and no version stamping of source documents (§8), managing drift conversationally at authoring time and leaving nothing on disk a later reader can check.

A future direction for assisted comparison is recorded in §9.

### UJ-3 — Returning after absence

Jamie comes back from holiday, pulls from git, and wants to see what happened while he was away.

He opens the tool on the freshly pulled project and orients: what changed, in what order, and what state the project is now in.

**Implications.** This is the journey most exposed to the activity-signal problem (FR-14): a `git pull` rewrites filesystem timestamps wholesale, so mtime after a pull is actively misleading rather than merely imprecise. BMAD's own records are the only trustworthy ordering here, which makes FR-14's reliability hierarchy load-bearing rather than a nicety. Git is consulted where the project is a repository (FR-62), which is what makes this journey tractable: commit times are the only per-event chronology BMAD's own records do not provide. Where the project is not a repository, the remaining tiers carry it. The tool holds no memory of previous visits (FR-61, withdrawn), so "what changed while I was away" is answered by ranking recent activity rather than by diffing against a remembered position.

## 5. Success metrics

**Stage 1 — qualitative, by deliberate choice.** The first release goes to colleagues, and their feedback is the measuring instrument. The tool's value is oversight confidence, which is subjective and not credibly captured by usage counters at this stage. Formal instrumentation is added later only if a specific question demands it.

**Gate — stated as a decision rule.** v1 has succeeded when the aggregate time and mistake costs it saves across its user pool outweigh the cost of proceeding to v2. This is deliberately a comparison, not a threshold: it is assessed at the moment the v2 question is actually asked, and it is falsifiable — if the saved cost does not clear the build cost, v1 has not succeeded and v2 should not be built on the assumption that it has.

Supporting evidence for that judgement: colleagues using the tool on real projects report that it surfaced something they would otherwise have missed.

**Supporting signal, not a gate.** Colleagues inspect BMAD output through the tool rather than by opening files by hand. A tool people call nicer but still bypass has failed, however well it renders.

**On counter-metrics.** An earlier candidate — time-in-dashboard rising indicates answers are not landing — is **rejected**. For an oversight tool, time spent reading is the work rather than friction, and a user choosing to dwell in the tool may signal value rather than failure. No time-based counter-metric is adopted.

**Telemetry: none.** A tool whose central promise is that it never touches the target project should not phone home either. Accepted cost: no passive usage data, and Stage 1 feedback must be gathered by asking.

## 6. Capabilities and requirements

Nine capability groups. FR IDs are global and stable; renumbering is not permitted once assigned.

### Release boundary

**v1 is C1 through C6 inclusive — 59 active requirements.** Eight IDs in that range are withdrawn and retired (FR-28, FR-57 to FR-59, FR-61, FR-63 to FR-65); withdrawn entries are kept in place so a reader meets the decision where the requirement used to be. C7 through C9 are deferred (10 requirements), specified here so the v1 substrate is built to carry them rather than retrofitted.

**What this means.** v1 performs the product's primary job (§2.1) rather than only preparing for it: artifacts are reachable, identified, ordered and legible, *and* the risk surface is actively drawn to the user's attention. The false-alarm discipline that governs that surfacing (FR-55, FR-56) and its floor (FR-76) ship alongside it, which matters — assisted oversight without them is the failure mode they exist to prevent.

Deferred groups are additive rather than foundational. C7 presents concurrency between strands the user can already inspect individually; C8 is an experience layer over historical runs v1 already reaches; C9 explains concepts v1 already displays. None requires reshaping the v1 data model.

**Journey coverage in v1.** UJ-1 is fully served. UJ-3 is served, subject to the ordering hierarchy's honest limits (FR-14, FR-15). UJ-2 is served as a manual comparison — the artifacts are cheap to reach, read, and set beside one another — rather than by automated detection, which is out of scope by decision (§4, §9).

### C1 — Invocation and serving

- **FR-1** The tool is invoked as a single CLI command taking an optional path to a target project folder.
- **FR-2** When no path is given, the current working directory is the target.
- **FR-3** The tool serves a web UI over HTTP on the loopback interface only.
- **FR-4** The tool selects an available port automatically and reports the chosen URL on stdout.
- **FR-5** The tool opens the user's default browser at the served URL on start.
- **FR-6** Browser launch can be suppressed by flag, with the URL still reported, for environments where launching is impossible or unwanted.
- **FR-7** When the target folder contains no recognizable BMAD project, the tool does not serve and does not launch a browser. It exits reporting what it looked for, and — where a bounded discovery scan finds candidates — the exact invocations that would work, listing every candidate found. Modelled on how `git push` reports a missing upstream: the failure hands the user the command rather than describing the problem.
- **FR-45** The tool is distributed for `npx` execution, runnable without prior installation and without adding a dependency to the target project.
- **FR-46** The tool requires no configuration in the target project to run.

### C2 — Project interpretation

**Identification (FR-8, FR-69, FR-49, FR-50).**

- **FR-8** Artifacts are identified by a defined precedence, applied in order and stopping at the first that resolves: (1) location under a path declared in the project's own BMAD configuration; (2) frontmatter declaring title or type; (3) structural signature characteristic of the family; (4) filename hint. Filename alone is never sufficient, because BMAD names legitimately vary (`prd.md`, `bmm-prd.md`, `product-requirements.md`).
- **FR-69** An artifact that no precedence level resolves is presented as unidentified, naming which levels were attempted. Identification is never guessed, and confidence is displayed where it is below certain.
**Layout and location (FR-9 to FR-12, FR-51, FR-70 to FR-75).**

- **FR-9** A document is handled equivalently whether it exists as a single file or pre-sharded as a directory with an `index.md`.
- **FR-10** *(Deferred indefinitely 2026-09-02, by user decision. Recorded here because the requirement stands and only its delivery is deferred — see the epic 1 retrospective, item 6.)* The tool reads the target project's own configuration (`_bmad/bmm/config.yaml` and user overrides) to locate artifact roots rather than assuming default paths. **Until it lands, artifact roots stay at their measured defaults, so a project that puts them elsewhere is read at the wrong paths.**
- **FR-51** Epic and story locations are resolved from the `story_location` field in `sprint-status.yaml`, which is per-project configuration, rather than from a fixed path.
- **FR-11** All seven run-folder families are recognized: briefs, PRDs, architecture, UX designs, research, specs, forge.
- **FR-70** Project resolution looks for `_bmad` and `_bmad-output` in the target path only, and never walks the tree in either direction. Multiple or nested roots are therefore not resolvable states rather than states resolved by rule. A separate bounded scan — the full ancestor chain, and two levels below, skipping dot-directories and `node_modules` — runs only to construct FR-7's suggestions and is never a resolution path.
- **FR-71** A run folder may contain more than one run. Four of seven run-folder patterns are `{family}-{project_name}-{date}`, in which both components are constant within a day, so same-day reruns land in the same folder. The tool must not assume one folder equals one run.
- **FR-72** Two run-folder patterns (`spec-{slug}`, `{slug}`) carry no date at all, and a spec folder is deliberately reopened under the same slug. Ordering for these families falls to the FR-14 hierarchy without any folder-name signal.
- **FR-73** A run folder and a sharded document are not reliably distinguishable by structure — BMAD's own discovery uses a `*prd*/index.md` glob and resolves ambiguity by asking a human. Where the tool cannot distinguish them, it presents the ambiguity rather than resolving it silently.
- **FR-74** `story_location` may be relative or absolute, and may point outside the project tree — `/custom/stories` is an explicitly tested value. The tool resolves it, and where it falls outside the artifact tree it reports that fact without serving content from there, preserving NFR-10 and FR-40.
- **FR-75** Absence of `sprint-status.yaml` is a normal project shape, not an error. The tool renders fully without it, presenting sprint-derived views as unavailable rather than empty or broken.
- **FR-12** Artifact shapes the tool does not recognize are listed as present-but-uninterpreted rather than hidden or silently dropped.
- **FR-49** `{slug}` in BMAD filenames is a context-dependent name, not an identifier: in `review-{slug}.md` it names the reviewer, in `reconcile-{slug}.md` the source input, in a `spec-{slug}` run folder the subject (and is deliberately reused to reopen an existing folder). The tool must not treat slugs as identities.
- **FR-50** Review outputs are located wherever the producing skill writes them — workspace root or a `reviews/` subfolder — rather than at one assumed path.

### C3 — Recent activity (landing view)

**Ordering evidence (FR-13 to FR-17, FR-61, FR-62, FR-66, FR-67).**

- **FR-13** The default view on open is a chronological list of recent project activity.
- **FR-14** Activity ordering derives from the following hierarchy, in descending reliability. Uncommitted working-tree changes rank first because BMAD agents write files without committing, making a dirty working tree the signature of work in flight rather than merely recent work.
  1. Uncommitted working-tree modifications, where the project is a git repository.
  2. Git commit timestamps — the only per-event, timezone-aware chronology available.
  3. `.memlog.md` frontmatter `updated` — file-level, minute resolution, overwritten on each append.
  4. Document frontmatter `updated` — date resolution only; cannot order within a day.
  5. Run-folder date in the folder name — date resolution only.
  6. Filesystem mtime — last resort only, and actively misleading after a clone, checkout or pull.
- **FR-15** Each activity entry displays the resolution and source of its own timestamp, so a date-only or mtime-derived entry is visibly weaker evidence than a commit-derived one. Entries whose ordering cannot be established are grouped rather than given a false position in the sequence.
- **FR-66** `.memlog.md` entries carry no per-entry timestamp — the file records sequence, not time. Within one memlog, entry order is authoritative; across artifacts, memlogs cannot be interleaved on a timeline and must not be presented as if they can.
- **FR-67** Timestamps are normalized on read from at least four incompatible formats present in BMAD: `MM-DD-YYYY HH:MM` (`sprint-status.yaml`), ISO minute-resolution (`.memlog.md` frontmatter), date-only (document frontmatter), and timezone-aware filesystem times. Three of the four are timezone-naive; the tool must not silently assume they share a zone.
- **FR-16** Selecting an activity entry opens the viewer appropriate to that artifact type.
- **FR-17** Activity can be filtered by artifact family and by time window.
- **FR-61** *Withdrawn.* A tool-side last-viewed marker was specified and then removed: persistent state outside the target project introduces first-run, corruption, project-move, and name-collision cases whose cost outweighs the benefit. Activity ranking is best-effort under FR-14 instead, with no memory of previous visits. The ID is retained rather than reused.
- **FR-62** Git is consulted where the project is a repository, per FR-14. BMAD itself ships `bmad-retrospective/scripts/git_evidence.py`, documented as a tool that *"only MEASURES — it never judges"*, so reading git is consistent both with BMAD practice and with the §2.3 boundary. Projects that are not repositories degrade to the remaining tiers.
**Core artifacts (FR-52 to FR-55).**

- **FR-52** Alongside the chronological feed, the landing view presents a persistent set of core artifacts, each directly reachable without navigating the feed. Recency and centrality are different axes: an artifact can be central and untouched for weeks.
- **FR-53** Centrality follows BMAD's own declaration rather than the tool's preference. `bmad-correct-course` treats PRD and epics/stories as essential and halts without them; architecture, UX design and spec are loaded if available. Core presentation reflects that ranking.
- **FR-54** A core artifact that is absent is shown as absent rather than omitted, at low visual weight — greyed and non-attracting. Its presence in the layout is informational, not a call to action.
- **FR-55** Absence is only elevated above neutral when something else on disk implies the missing artifact should exist. A project built entirely through `bmad-build` — which implements any intent, requirement or change request without requiring planning artifacts — legitimately has no PRD, and the tool must not present that as a deficiency. This follows BMAD's own rule: *"a missing document type is only a finding if stories depend on decisions nothing records."*
**Refresh lifecycle (FR-37, FR-47).**

- **FR-37** Refresh is user-initiated. The UI reflects on-disk state as of its last read and offers an explicit refresh; it does not watch the filesystem.
- **FR-47** Displayed data states how current it is, so a stale view is never mistaken for a live one.

**Signal discipline (FR-56, FR-76).**

- **FR-56** False alarms are treated as a first-order failure. Because the tool's only purpose is oversight, a signal the user learns to dismiss is worse than no signal, so risk indication must err toward silence over noise.
- **FR-76** Conservatism has a floor, so the preference for silence (FR-56) cannot reduce the tool to surfacing nothing. The oversight view always reports what it examined, what it could not interpret, and which signals were unavailable for each artifact family. "Nothing was flagged" must be distinguishable from "nothing was checked" — an assurance tool that cannot tell the user which of those it is provides no assurance at all.

### C4 — Artifact viewers

- **FR-18** Each artifact type is rendered by a viewer designed for its shape, not by a generic markdown renderer.
- **FR-19** A memlog viewer presents the append-only trail as a typed, filterable timeline, with `override` and `assumption` entries distinguishable at a glance.
- **FR-20** A review viewer presents `review-{slug}.md` reviewer output as findings, with verdict and severity legible without reading the prose body.
- **FR-21** A reconciliation viewer presents `reconcile-{slug}.md` as gaps between a source input and the resulting document.
- **FR-22** An addendum viewer presents `addendum.md` as content deliberately excluded from its parent document, linked to that parent.
- **FR-23** A sprint viewer presents `sprint-status.yaml` as epic and story state, including retrospective status and open action items with owners.
- **FR-24** Every viewer offers copy-to-clipboard of the underlying file path and an open-in-editor affordance.

### C5 — Large-document navigation

- **FR-25** Documents are navigable as a linked set of pages derived from heading structure, rather than presented as one continuous page. Specs are reported to reach ~24,000 words.
- **FR-26** A persistent table of contents reflecting document structure is available alongside content.
- **FR-77** Where a document is already sharded by BMAD (a directory with `index.md`), the tool adopts those shard boundaries as its page structure rather than re-deriving them from heading weight. Existing shards reflect the authoring skill's own division of the document, and adopting them keeps the tool's pages, BMAD's files, permalinks (FR-27), and open-in-editor targets (FR-24) all referring to the same units. Heading-weight carving applies only to documents that arrive whole.
- **FR-27** Any section has a stable permalink that survives reload.
- **FR-28** *Withdrawn.* Full-text search across artifacts is out of scope. It was the only requirement obliging the tool to read every file's content rather than identify it, so removing it lets the read layer stay index-eager and content-lazy. See §9. The ID is retained rather than reused.

### C6 — Oversight surfacing

The primary job. Per §2.3 this surfaces risk; it does not judge correctness.

**Risk markers and trails (FR-29 to FR-34, FR-68).**

- **FR-29** Memlog entries of type `override` and `assumption` are surfaced prominently where they exist. Their reliability is qualified rather than assumed: `memlog.py` explicitly does not enforce the type vocabulary, and only 9 of 49 skills write a memlog at all, every one planning-side.
- **FR-68** Memlog coverage is presented as partial. `bmad-build` writes no memlog, so a build stage completes leaving no decision trail — the case UJ-1 most often faces. The tool must show that no trail exists rather than showing an empty one.
- **FR-30** Explicit in-document risk markers are surfaced where present: `[ASSUMPTION]` tags, `[NOTE FOR PM]` callouts, open-question sections, deferred items.
- **FR-31** Marker coverage is presented honestly. Given the adoption measured in §2.3, the tool does not imply that absence of markers means absence of risk.
- **FR-32** Structural risk computable without judgement is surfaced, including documents marked `status: final` that still carry unresolved open items.
- **FR-33** Reviewer findings from `review-{slug}.md` files are aggregated across the project rather than left siloed in their run folders.
**Side-by-side comparison (FR-60; FR-57 to FR-59 and FR-63 to FR-65 withdrawn).**

- **FR-57** *Withdrawn.* Cross-artifact consistency inference is not built: UJ-2 is a manual comparison (§4), and automated relationship claims are the false-alarm surface FR-56 forbids. The ID is retained rather than reused.
- **FR-58** *Withdrawn.* Cross-artifact consistency inference is not built: UJ-2 is a manual comparison (§4), and automated relationship claims are the false-alarm surface FR-56 forbids. The ID is retained rather than reused.
- **FR-59** *Withdrawn.* Cross-artifact consistency inference is not built: UJ-2 is a manual comparison (§4), and automated relationship claims are the false-alarm surface FR-56 forbids. The ID is retained rather than reused.
- **FR-60** The user nominates two artifacts and the tool places them side by side. Selection is the user's, not the tool's: nominating the pair keeps the scope of any comparison under the user's control and means the tool asserts no relationship between artifacts it cannot evidence. This is the whole of the tool's support for UJ-2, and the same nomination model the §9 direction builds on.
- **FR-63** *Withdrawn.* Automated technology-version divergence detection is not built. UJ-2 is a manual comparison the operator performs, supported by the viewers and navigation of C4 and C5, not a detection feature. See §9 for the direction intended to serve it later. The ID is retained rather than reused.
- **FR-64** *Withdrawn.* Automated technology-version divergence detection is not built. UJ-2 is a manual comparison the operator performs, supported by the viewers and navigation of C4 and C5, not a detection feature. See §9 for the direction intended to serve it later. The ID is retained rather than reused.
- **FR-65** *Withdrawn.* Automated technology-version divergence detection is not built. UJ-2 is a manual comparison the operator performs, supported by the viewers and navigation of C4 and C5, not a detection feature. See §9 for the direction intended to serve it later. The ID is retained rather than reused.
- **FR-34** Project-level deviations from BMAD defaults are read from `_bmad/custom/*.toml`. A skill's own `customize.toml` is the shipped default layer — 35 of them are marked *"DO NOT EDIT — overwritten on every update"* — and reading those as deviations would report roughly 35 fabricated findings on every project, a pure-noise signal forbidden by FR-56.

### C7 — Live threads

- **FR-35** All concurrently active strands of work are presented together, without collapsing them into a single "current stage" (§2.2).
- **FR-36** In-flight state is derived compositely from sprint tracking, epic and story states, and document status, rather than inferred from artifact existence.
- **FR-48** Where a relationship between artifacts is inferred rather than recorded, it is presented as inferred. BMAD records no correlation identity linking a thread of work across artifact families (see §8), so cross-family lineage must not be asserted as fact.

### C8 — Corpus navigation

- **FR-38** All historical runs within the target project are browsable, including completed and superseded ones.
- **FR-39** Multiple runs of the same artifact family are presented as a series, so successive attempts can be compared.
- **FR-40** Scope is the target project only; no cross-project library and no scanning of unrelated paths on disk.

### C9 — Concept explanation

- **FR-41** Unobtrusive inline affordances alongside BMAD-specific terminology open an explanation of that concept on demand, leaving the dense default view undiluted.
- **FR-42** Skill purposes and status vocabularies are derived at runtime from the target project's own installed skills, so explanations match the BMAD version actually present, including org-specific custom skills.
- **FR-43** Hand-authored concept explanations carry version-range metadata; an explanation known to be stale for the installed version is withheld rather than shown.
- **FR-44** Failure to derive runtime glossary content fails visibly rather than silently yielding empty explanations.

## 7. Non-functional requirements

### Read-only integrity

- **NFR-1** The tool never writes, moves, deletes, or modifies any file in the target project. This is an enforceable invariant, verified by test, not a convention.
- **NFR-2** Any tool-owned state (caches, preferences) lives outside the target project.

### Concurrency and robustness

- **NFR-3** BMAD agents write these files while the tool reads them. Truncated, partially written or transiently invalid files must be handled without crashing and without presenting corrupt data as valid.
- **NFR-4** A single unparseable artifact degrades to an explicit error for that artifact only; the rest of the tool remains usable.

### Version compatibility

- **NFR-5** The tool tolerates BMAD versions other than the one it was developed against, degrading to present-but-uninterpreted rather than failing.
- **NFR-6** Reliance on unstable sources is guarded. Status vocabularies are currently defined in YAML *comments* in `sprint-status-template.yaml`; extraction from such sources must fail loudly on change rather than silently return nothing.

### Performance

- **NFR-7** Cold start — command invocation to a usable rendered view — should be short enough that checking the tool is not a deliberate act. Target: under two seconds on a typical project. **Aspirational, not a release gate**: because refresh is user-initiated (FR-37), a session is one start followed by many refreshes, so cold start is paid rarely.
- **NFR-16** Refresh latency is the binding performance requirement, being paid repeatedly within a session. It must be fast enough that refreshing is not a decision the user weighs.
- **NFR-8** A ~24,000-word document opens and navigates without perceptible delay.

### Security and privacy

- **NFR-9** The server binds explicitly to `127.0.0.1` and to no other interface, so it is reachable only from the same machine. Binding is by literal address rather than by the name `localhost`, which can resolve to other addresses, and never to `0.0.0.0`. The honest limit of this guarantee: on a shared machine, other local users and processes can still reach a loopback port.
- **NFR-10** File serving is confined to the target project's artifact tree; path traversal outside it is prevented.
- **NFR-17** Every path segment derived from project content is sanitized before use. BMAD run-folder names are built from free-text slugs (`spec-{slug}`, `{topic_slug}`) that no BMAD component sanitizes, and those names reach the tool as filesystem paths and as URL components. They are treated as untrusted input on both surfaces.
- **NFR-11** No telemetry, analytics, or outbound network requests of any kind (§5).

### Environment portability

- **NFR-12** The tool works on Linux, macOS, and Windows.
- **NFR-13** Environments where a browser cannot be launched — SSH sessions, containers, WSL, headless CI — remain usable via the reported URL.

### Accessibility

- **NFR-14** The dense default view is fully keyboard navigable.
- **NFR-15** The UI meets WCAG 2.2 AA for contrast and focus visibility, and does not encode meaning in colour alone — relevant given status and severity are colour-coded.

## 8. Upstream feedback candidates

Gaps found in BMAD itself during this PRD's development. Per scope, the tool works with what BMAD natively provides; these are recorded as candidate contributions back to the BMAD community rather than as features to engineer around.

- **No correlation identity for a thread of work.** Nothing links a PRD to the architecture, epics, and stories descended from it; the only join keys are naming conventions and dates, both coincidental. The most consequential gap found — it caps how well any tool can present lineage (FR-48).
- **No version or hash stamping of source documents.** Nothing records which version of a PRD an architecture was built from, so no later reader can confirm that requirements propagated (UJ-2 Part B).
- **Risk markers are convention, not contract.** Absence of a marker cannot be read as absence of risk (adoption measured in §2.3).
- **The memlog is not the reliable ledger it appears to be.** Entry types are convention rather than enforcement, coverage is planning-side only, and entries carry no per-entry timestamp (FR-29, FR-66, FR-68).
- **Status vocabularies are defined in YAML comments**, which no test protects (NFR-6).
- **Review output location is inconsistent** — workspace root for some skills, a `reviews/` subfolder for others (FR-50).
- **Run folders collide.** Four of seven patterns are constant within a day, so same-day reruns share a folder and iterations are lost (FR-71).

## 9. Future scope

Deferred capability groups are specified in §6 so the v1 substrate carries them: **C7 — Live threads** (FR-35 to FR-37, FR-47, FR-48), **C8 — Corpus navigation**, and **C9 — Concept explanation** (FR-41 to FR-44), whose derivation mechanism is designed in `addendum.md`.

Two items warrant more than a pointer.

- **Archaeologist mode (C8).** Browsing old runs as a corpus — good practice, cautionary tales, successive attempts at the same artifact compared. Genuinely wanted, deferred for expediency. An experience layer over data v1 already reaches, not a data-model change.
- **Full-text search.** Searching artifact content across the project. Withdrawn from v1 (FR-28) because it is the single requirement that forces reading every file rather than identifying it, and that cost shapes the entire read layer. Revisit as a deliberate capability with its own indexing design, not as a free addition.
- **LLM-assisted consistency checks.** The intended direction for UJ-2: invoking Claude through its CLI to compare user-nominated files against each other. Nominating the files keeps the user in control of scope, which avoids the false-alarm cost of scanning everything, and puts the judgement where §2.3 says judgement belongs. Out of scope for v1; it is the concrete form the §2.3 boundary re-examination is expected to take.
- **Deriving glossary content reads `_bmad/custom/`**, surfacing org-authored skill descriptions in the UI. Harmless locally, but any later export, share, or screenshot capability must account for it.

## 10. Questions and decisions

Each carries an owner and the condition under which it must be revisited. None blocks handoff to architecture, UX, or epic breakdown.

- **Residual reviewer findings.** Three reviews were run at Finalize and their critical and high findings are resolved in this document. Medium and low findings remain recorded in `review-rubric.md`, `review-adversarial.md` and `review-edge-cases.md`. *Owner: architecture. Revisit: during implementation planning, as a checklist rather than a rewrite trigger.*

**Resolved during this PRD's development**, retained so they are not reopened without cause:

- **Sharding precedence — resolved: defer to BMAD's shards.** Where a document is already sharded, those boundaries become the tool's pages (FR-77). Revisit if the resulting page sizes prove unreadable in practice.
- **Node availability — resolved: not a barrier.** BMAD is itself normally installed via `npx`, so Node is already present on a target machine. This closes the reviewer finding that treated `npx` distribution as an unfiled launch blocker.
- **Product name — resolved: `bmad-dash`.** Chosen by the user; the npm package name follows from it, per FR-45's `npx` distribution.
- **Git as an activity signal — resolved: yes.** Initially rejected on the mistaken premise that git was not BMAD-native; BMAD ships `git_evidence.py`, documented as measuring and never judging. Re-decided with uncommitted working-tree changes ranking above commit history, since agents write without committing (FR-14, FR-62).
- **Oversight depth — resolved: surface only.** No LLM evaluation in v1 (§2.3).
- **Corpus scope — resolved: current project only** (FR-40).
- **Live updating — resolved: user-initiated refresh**, no filesystem watching (FR-37).
