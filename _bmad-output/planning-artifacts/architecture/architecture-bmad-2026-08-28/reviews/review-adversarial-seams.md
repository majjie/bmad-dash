---
title: Adversarial seam review — ARCHITECTURE-SPINE.md
type: review
lens: adversarial (compliant-divergence construction)
target: ../ARCHITECTURE-SPINE.md
sources:
  - ../../../prds/prd-bmad-2026-08-28/prd.md
  - ../../../prds/prd-bmad-2026-08-28/addendum.md
created: '2026-08-28'
status: final
---

# Adversarial seam review — bmad-dash architecture spine

## Method

The spine's stated job is to be a *build substrate*: a set of invariants such that anything built from it is consistent with everything else built from it. The test applied here is therefore not "is each AD good?" but:

> Can I construct two units, one level below the spine, each of which obeys **every** AD to the letter, which nonetheless build into a product that does not fit together?

Every pair below is such a construction. Each finding names the two units, shows the AD-compliance of both, and shows the concrete incompatibility. A pair that can be constructed is a hole in the spine, not a failure of imagination in the implementer — the spine is what is supposed to make the pair impossible.

Findings are ordered by how expensive they are to discover late. S1 findings are ones where the two units are *both already implied by the spine's own capability map*, so the divergence is not hypothetical — it is the default outcome of two people reading the document.

## Verdict

**Do not hand this to implementation as-is.** The spine is unusually strong on *direction* (AD-1, AD-2, AD-12 are genuinely enforceable and genuinely prevent what they claim). It is weak at exactly the place a spine has to be strong: **the shape of the one object every unit shares.** AD-3 mandates "one snapshot" and then the Deferred list explicitly declines to say what a snapshot *is*, while five capability groups read from it. Every S1 finding below is a consequence of that single decision.

Three of the findings are not merely coordination hazards but correctness or safety defects that survive full AD compliance:

- **F1** makes C6 — the product's stated primary job — unimplementable as specified, because AD-8 requires the snapshot to record something AD-3 forbids the snapshot to have read.
- **F2** leaves AD-10's confinement anchor undetermined, and AD-9's ordering means the one input that *defines* the confinement boundary is the one input the sanitizer never sees.
- **F3** shows NFR-1 — read-only, the invariant the whole paradigm was chosen to make testable — being violated by a unit that passes AD-1's test, because the git adapter writes to the target project through a subprocess.

Count: **12 constructed pairs**, of which 5 are S1 (spine-implied, divergence is the default), 5 are S2 (plausible independent choices), 2 are S3 (adversarial but legal). **9 new or tightened ADs** are proposed, listed consolidated in §14.

---

## F1 — AD-3 (content lazy) and AD-8 (signal availability recorded in the snapshot) are mutually unsatisfiable for in-document signals [S1, blocking]

This is the most serious finding. It is not a coordination hazard; it is a contradiction, and it lands on the capability group the PRD calls "the primary job".

### The two units

- **Unit A — `src/domain/oversight/scan.ts`**, built by whoever owns C6. Reads AD-8: *"the snapshot records, per artifact and per signal, whether that signal was available, absent, or unreadable."* Builds the signal ledger during the snapshot pass. To know whether `[ASSUMPTION]` (FR-30) appears in `prd.md`, it must read `prd.md`'s body.
- **Unit B — `src/adapters/fs/read.ts` + `src/domain/snapshot.ts`**, built by whoever owns C2/C3. Reads AD-3: *"Document bodies are read on first open, cached for that snapshot's lifetime."* The snapshot pass discovers, identifies, timestamps and orders — it does not read bodies. This is not incidental: FR-28 was withdrawn from the PRD *specifically* so "the read layer stays index-eager and content-lazy", and NFR-7/NFR-16 depend on it.

### How each obeys

Unit A obeys AD-8 word for word: the snapshot records, per artifact and per signal, one of three states. Unit B obeys AD-3 word for word: the pass is discovery-only, bodies are lazy. Neither has misread anything.

### The incompatibility

The signals C6 must report on are overwhelmingly *in-document*:

| Requirement | Signal | Lives in |
| --- | --- | --- |
| FR-30 | `[ASSUMPTION]` tags | document body |
| FR-30 | `[NOTE FOR PM]` callouts | document body |
| FR-30 | open-question sections | document body |
| FR-30 | deferred items | document body |
| FR-32 | `status: final` **with unresolved open items** | frontmatter **and** body |
| FR-29 | memlog `override` / `assumption` entries | document body |
| FR-33 | reviewer findings, aggregated project-wide | document bodies |

Under Unit B's snapshot, none of these has been looked at when the ledger is written. So Unit A must record something. Its options, all AD-compliant:

1. **Record `absent`.** AD-8 offers exactly three states and `absent` is the only one that fits "we have no positive evidence". This is *word-for-word AD-8 compliance that produces precisely the failure FR-76 exists to prevent*: "nothing was flagged" becomes indistinguishable from "nothing was checked", silently, on every cold start. AD-8's own Prevents clause is defeated by AD-8's own state vocabulary.
2. **Record `unreadable`.** Honest-ish, but false — the file is perfectly readable — and it poisons FR-76's "what it could not interpret" column with 40 fabricated entries, which is the pure-noise signal FR-56 forbids.
3. **Read the bodies during the pass anyway.** Now Unit A violates AD-3, warms a cache Unit B does not know exists, and reintroduces exactly the whole-corpus read cost the PRD withdrew FR-28 to avoid. Cold start becomes O(total bytes) — the thing AD-3's Prevents clause names.

Meanwhile a third construction, **Unit A' — `oversight/lazy-ledger.ts`** — records a fourth state `unchecked` and populates it only as documents are opened. A' is arguably the *honest* implementation, and it is the one that makes FR-76 true. But AD-8 does not contain the state `unchecked`, so A' is inventing model vocabulary the spine does not sanction, and the C6 view it renders says *"0 of 41 documents examined"* on cold start — the oversight view delivers nothing until the user has manually opened every document, which defeats the capability. A and A' produce snapshots with different state vocabularies and different cardinalities; the C6 renderer written against one cannot render the other.

### Aggravating: the spine contradicts itself on the state vocabulary

AD-8's rule names the triple **`available` / `absent` / `unreadable`**.
The Consistency Conventions table names the triple **`absent` / `unreadable` / `unchecked`** — *"Three distinct states throughout the model and the UI. Collapsing any pair is a defect."*

These are different sets. `available` is not `unchecked`; they are not even on the same axis (`available` is a positive finding, `unchecked` is an absence of process). A unit implementing AD-8's triple and a unit implementing the conventions table's triple both obey the spine, produce four distinct state names between them, and disagree about the classification of *every* unread document. The conventions table's own final sentence — "collapsing any pair is a defect" — is a defect the spine ships with.

### Proposed fix

**Tighten AD-8 and add AD-13.** AD-8's vocabulary becomes a closed four-state enumeration `present | absent | unreadable | unchecked`, aligned with the conventions table, with `unchecked` explicitly defined as *"within scope for this signal, not yet examined"*. Then AD-13 must decide the question the spine currently ducks:

> **AD-13 — Signal extraction has a declared phase.** Every signal in the C6 catalogue declares whether it is *index-phase* (derivable from path, frontmatter, or directory structure — computed eagerly in the snapshot pass, never `unchecked`) or *body-phase* (requires the document body — recorded `unchecked` until the body is read, and promoted when it is). The oversight view reports the two phases distinctly and always states the count of `unchecked` artifacts. No signal may be silently reclassified from `unchecked` to `absent`.

This also forces the productive question the spine currently avoids: FR-32 (`status: final` + open items) splits cleanly — `status: final` is index-phase, "carries open items" is body-phase — and the spine should say so, because that split determines whether C6 works on cold start.

---

## F2 — AD-10's confinement anchor is undetermined, and AD-9 resolves the anchor-defining input *before* the sanitizer exists [S1, blocking, security-relevant]

### The two units

- **Unit A — `src/adapters/fs/confine.ts` (multi-root)**. AD-9 says *"artifact roots are read once from the target project's own configuration"* — plural. FR-51 says epic and story locations come from `story_location` in `sprint-status.yaml`. FR-74 says that value "may be relative or absolute, and may point outside the project tree — `/custom/stories` is an explicitly tested value. **The tool resolves it.**" Unit A therefore treats the configured roots as *the* set of confinement roots. `/custom/stories` is a root; stories under it are served. AD-10 satisfied: every resolved path is confinement-checked against **an** artifact root.
- **Unit B — `src/adapters/fs/confine.ts` (project-root)**. AD-10 says *"confinement-checked against the artifact root"* — singular, definite article — and NFR-10 says *"file serving is confined to the target project's artifact tree; path traversal outside it is prevented."* FR-74's second clause says "where it falls outside the artifact tree it reports that fact **without serving content from there**". Unit B anchors confinement on the AD-9 project root. `/custom/stories` is outside; nothing under it is read.

### How each obeys

Both pass AD-10 verbatim; the AD does not say *which* root. Both cite a PRD requirement — A cites FR-51 and FR-74's first clause, B cites NFR-10 and FR-74's second clause. FR-74 itself contains both halves of the contradiction in one sentence.

### The incompatibility

On the same project with `story_location: /custom/stories`:

- Unit A: the sprint viewer (FR-23) links to stories, C3's feed includes story activity, C6 aggregates story-level signals.
- Unit B: the sprint viewer renders epics with every story marked out-of-tree and unreachable; the feed has no story entries; C6 reports the entire story corpus as `unreadable`/out-of-scope.

Two materially different products from full compliance. Worse, a unit built against A's assumption (the C3 ranker expecting story artifacts in the snapshot) silently produces an empty section against B's snapshot, with no error anywhere — AD-7's typed degradation does not fire, because from B's perspective nothing failed.

### The sharper defect: ordering

AD-9: *"the project root is discovered once at startup... and artifact roots are read once from the target project's own configuration. **Both are resolved in the composition root** and passed to everything else."*
AD-10: *"every path segment derived from project content passes one sanitizer before use... **Both checks live in the filesystem adapter**; no caller may opt out."*

`sprint-status.yaml` is project content. `story_location` is a value read out of it. It is therefore, by AD-10's own definition, a content-derived path — and it is precisely the class of input NFR-17 was written for. But AD-9 resolves it in the composition root, which sits *above* the filesystem adapter in the layer table, so the value is resolved and installed as a confinement root **before** the sanitizer that AD-10 says no caller may opt out of ever runs. AD-10's "no caller may opt out" is defeated by AD-9's sequencing, for the single input that determines what confinement even means.

Under Unit A this is an arbitrary-read primitive parameterized by a file in the project: `story_location: /home/jamie/.ssh` yields a served, browsable directory, and the tool that promises "it does not touch your project" happily serves anything on the disk. Unit A is fully AD-compliant.

### Proposed fix

**Tighten AD-9 and AD-10 jointly.**

> **AD-9 (tightened).** Configuration values that resolve to filesystem locations are *inputs to* root resolution, not roots. The composition root resolves the project root by walk-up; every other candidate root is handed to the filesystem adapter for sanitization and adjudication, and the adapter — not the composition root — returns the authoritative root set.
>
> **AD-10 (tightened).** Confinement is checked against **the resolved root set**, which is closed at startup and never extended at request time. A configured location that resolves outside the project root is recorded as `out-of-tree` and is never added to the root set; artifacts under it are modelled as present-but-unreachable (FR-74), a first-class state that every view renders, not an absence.

The `out-of-tree` state must be named in the spine, because both C3 and C6 have to render it and neither can invent it independently.

---

## F3 — Read-only is enforced by an import test that the git adapter routes around [S1, blocking, correctness]

### The two units

- **Unit A — `src/adapters/git/worktree.ts`**. Implements FR-14 tier 1, the highest-reliability ordering signal: uncommitted working-tree modifications. The obvious implementation is `git status --porcelain`.
- **Unit B — `src/adapters/git/log.ts`**. Implements FR-14 tier 2: commit timestamps. `git log --format=... -n N -- <path>`.

### How each obeys

AD-1: neither imports `node:fs`; the assertion test passes. AD-1's surface rule ("no create, write, move, delete, or permission-changing call appears in its surface") is about `src/adapters/fs/`, and both units are in `src/adapters/git/`. AD-12: neither makes an outbound network request from the tool's own code. The Stack table explicitly sanctions "`git` invoked as a subprocess". Both units are fully compliant.

### The incompatibility — and the invariant violation

`git status` is not a read. As a normal, documented side effect it refreshes and **rewrites `.git/index`** with updated stat information, takes `index.lock`, and — depending on repo configuration — executes the `core.fsmonitor` hook, an arbitrary command specified by the repository being inspected. `git log` on a repo with `core.fsmonitor` or certain `gc.auto` settings can likewise touch the repository.

So:

- Unit A **writes to the target project** (`.git/index`, `.git/index.lock`), violating **NFR-1** — "the tool never writes, moves, deletes, or modifies any file in the target project. This is an enforceable invariant, verified by test, not a convention" — and **AD-12** — "it persists nothing outside its own memory".
- Unit B, if written as `git --no-optional-locks -c core.fsmonitor= log ...`, does not.

Two units, both AD-compliant, one of which breaks the product's headline invariant. And the test AD-1 mandates — "a test asserts no other module imports `node:fs`" — **passes in both cases**. The paradigm was chosen, in the spine's own words, "for enforceability rather than tidiness: NFR-1 requires read-only to be *verified by test, not convention*". The test as specified verifies a proxy for read-only that the git adapter is architecturally outside of. This is the single place where the spine's central justification does not hold.

A secondary consequence: if the target repo sets `core.fsmonitor`, Unit A executes attacker-or-agent-controlled code from a directory the tool was pointed at, and a `core.fsmonitor` daemon can hold state across invocations — breaking AD-12's ephemerality. `git lfs` smudge configuration can also produce genuine outbound network traffic from a `git` invocation, directly contradicting AD-12's "no outbound network request of any kind" and NFR-11.

### Proposed fix

> **AD-14 — Subprocess reads are hardened and are inside the read-only boundary.** Every `git` invocation runs with optional locks disabled (`GIT_OPTIONAL_LOCKS=0`), hooks and repo-scoped executable config neutralized (`-c core.fsmonitor=`, `-c core.hooksPath=/dev/null`), system and global config excluded (`GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`), and no command that can mutate the repository or reach the network in its allowed set. The allowed command set is enumerated in one module and asserted by test.
>
> **AD-1 (tightened).** The read-only test is a *behavioural* assertion, not only an import assertion: a fixture project is snapshotted before and after a full refresh (including git tiers) and asserted byte-identical, `.git/` included. The import assertion is retained as a fast complement, not as the guarantee.

The behavioural test is the one that actually discharges NFR-1's "verified by test, not convention", and it is cheap. Without it the spine's chosen paradigm is not doing the job it was chosen for.

---

## F4 — "Artifact family" is used by four ADs and defined by none [S1]

The prompt's suspicion is correct, and it is worse than a missing definition: the concept is used on **two different axes** by units that both have a legitimate claim to it.

### The two units

- **Unit A — `src/domain/identify/family.ts`**, built for C2. FR-11: *"All seven run-folder families are recognized: briefs, PRDs, architecture, UX designs, research, specs, forge."* Unit A enumerates exactly those seven. `family` is a property of a **run**, derived from run-folder pattern and location under a configured root.
- **Unit B — `src/domain/oversight/coverage.ts`**, built for C6. FR-76: *"which signals were unavailable **for each artifact family**"*. Unit B needs family rows for the things C6 and C4 actually reason about: memlogs, reviews, reconciliations, addenda, sprint status, epics, stories, custom TOMLs. None of those is a run-folder family. Unit B enumerates the **document types** that have viewers (FR-18 to FR-23) plus the unrecognized bucket (FR-12). `family` is a property of a **document**, derived from identification.

### How each obeys

There is no AD to disobey. AD-4 fixes *identity* ("keyed by its resolved absolute path") and is silent on family. AD-8 uses "family" only via FR-76. The capability map assigns C2 to identification and C6 to the oversight view, so both units are exactly where the spine puts them.

### The incompatibility

The two family sets **intersect in zero elements** as value sets, because they are on different axes:

- FR-17 ("activity can be filtered by artifact family") renders a filter with Unit A's seven values. A memlog, a review and `sprint-status.yaml` are unfilterable — they belong to no run-folder family, and FR-50 states outright that reviews are written to the workspace root *or* a `reviews/` subfolder, so a review may sit outside any run folder at all.
- FR-76's coverage table renders Unit B's rows. A PRD document has a coverage row under B; under A's vocabulary the row is keyed `prds`, which is a *run folder*, which may contain several runs (FR-71) and several documents. The two tables cannot be joined.
- FR-33 ("reviewer findings aggregated across the project") groups differently in each: under A a review inherits the family of the run folder it sits in (so `review-adversarial.md` in an architecture run folder is family `architecture`); under B it is family `review`. The aggregate is a different aggregate.

And a third unit, **Unit C — `render/landing/core.ts`** for FR-52/FR-53, needs a *third* notion: "core artifact" is keyed by something family-shaped (PRD, epics/stories, architecture, UX, spec) that is neither A's run folders nor B's document types — FR-53's essential set includes "epics/stories", which is not a run-folder family and is two document types.

### Proposed fix

> **AD-15 — Artifact family is a closed enumeration with one owner.** One domain module owns a single closed enumeration of artifact families, covering **every** artifact the tool can hold — the seven run-folder families of FR-11, every document type with a viewer (C4), and the defined members `unrecognized` (FR-12) and `ambiguous` (FR-73, AD-4). Every artifact in the snapshot carries exactly one family value; there is no null family. Run-folder provenance is recorded as a **separate** field (`runFolderFamily`), because a document's family and the family of the folder it happens to sit in are different facts and FR-50 guarantees they diverge. Adding a family is a spine change, not a code change, because AD-8's coverage floor, FR-17's filter and FR-53's core set are all keyed on it.

---

## F5 — AD-3 and AD-11 do not determine what happens when a document changes under an open reader [S1]

The prompt asks whether the AD-3/AD-11 interaction is fully determined. It is not, at four independent points, and the divergences compose.

### Point 1 — the lazily-read body is never the snapshot's body

AD-3's Prevents clause: *"two panels rendering from files in different states"*. But AD-3's own rule makes exactly that the normal case. The index records `prd.md` at state S0. The body is read on first open at time T, and at T the bytes on disk may be S1. The "one immutable snapshot" is immutable only in its *index*; its content cache is a set of reads spread across the whole session, each at whatever state the file was in when someone happened to open it. AD-11 detects this and surfaces it, but does not say what to *do*.

**Unit A — `http/document.ts` (cache-then-check).** Serves the cached or freshly-read body, then runs the AD-11 comparison and renders a banner above it. Obeys AD-3 (read on first open, cached for the snapshot's lifetime) and AD-11 (surfaced, not silently corrected, not silently ignored).

**Unit B — `http/document.ts` (check-then-read).** Runs the AD-11 comparison first; on mismatch it does not populate the cache and renders the mismatch page with an offer to refresh instead of the body. Also obeys both — arguably more faithfully, since AD-3 says the *snapshot's* content is cached and this content is not the snapshot's.

Incompatibility: A serves stale-labelled content and populates the cache with a body from a state the index does not describe; B serves no content. A user's permalink (FR-27) either resolves to a document or to an interstitial, depending on which unit shipped. Downstream, C5's section navigation built against A (bodies always present) breaks against B (bodies conditionally absent) with no typed value to render, because AD-7 does not cover "present but currency-blocked".

### Point 2 — the cache makes the mismatch invisible to the second reader

Under Unit A, the S1 body is now cached. The next request for that document is a cache hit. Does the AD-11 check re-run? AD-11 says the comparison happens "on opening a document" — a cache hit *is* an open. But **Unit A'** reasonably treats the currency probe as part of the read it just cached (one `stat` per document per snapshot, for NFR-16's sake), so the second reader gets the S1 body with no banner, indistinguishable from a current document. Both A and A' obey AD-11's text. A' is the one where the tool whose job is catching inconsistency presents an inconsistency as clean — the exact failure AD-11's Prevents clause names, produced by literal compliance.

**The spine never says whether the currency probe may be cached.** It must: the probe is an I/O read that is deliberately *not* from the snapshot, which puts it outside AD-3's model entirely, and AD-3's "All structural views read from the current snapshot" gives no guidance on a view that must not.

### Point 3 — "opening a document" is undefined, and C5 splits it

**Unit A — `http/routes/document.ts`.** Each HTTP GET of a document or shard page is an open. Navigating section 9 to section 10 of a sharded spec re-runs the currency check and can pop a refresh offer mid-read, on every page turn.
**Unit B — `web/section-nav.ts`.** Per AD-2 the client "enhances delivered markup". AD-2 forbids the client *assembling* document content and forbids a client router *owning a document URL* — it does not forbid the client navigating between server-rendered fragments it has been delivered. Unit B prefetches adjacent server-rendered sections and swaps them with `pushState`. No HTTP GET, therefore no currency check, therefore a reader can traverse a 24,000-word spec from end to end without one currency comparison.

Same document, two navigation paths, two currency behaviours, both compliant. FR-27's permalink hits path A and shows a banner; the in-page path B does not. A user who reloads sees a warning that vanished when they navigated.

### Point 4 — no snapshot has an identity, so a page can straddle two

AD-3 constrains snapshot *construction* and says nothing about request *serving*. Nothing requires a request to be served from one snapshot for its lifetime, and nothing requires a snapshot to be identifiable.

**Unit A — `http/router.ts`** resolves `getSnapshot()` once per request.
**Unit B — `render/toc.ts` + `web/toc.ts`** fetches the table of contents (FR-26, "persistent... alongside content") as a separate fragment request.

A refresh landing between the document request and the TOC request yields a page whose body is snapshot N and whose TOC is snapshot N+1 — **"two panels rendering from files in different states"**, AD-3's headline Prevents clause, occurring while both units obey AD-3 completely. Same for the C6 oversight panel and the C3 feed if either is fetched independently. And AD-11's comparison is against "the snapshot's record" — if the snapshot swapped under an open page, the check compares against a snapshot whose index the user never saw, so the banner it renders describes a mismatch the user cannot interpret.

### Proposed fix

> **AD-3 (tightened) + AD-16.** The snapshot carries a monotonic identity. Every response — page or fragment — states the snapshot id it was produced from. Any fragment or enhancement request pins the id it was issued under and receives a defined *snapshot-superseded* response rather than content from a newer snapshot; the client's sole permitted response is to surface it, per AD-11. No view composes content from two snapshot ids.
>
> **AD-11 (tightened).** "Opening a document" means *any* delivery of document content to the client, including a client-initiated fragment fetch; client-side traversal between already-delivered sections is not an open. The currency probe is a fresh filesystem read on every open and is never cached. On mismatch the body is not entered into the content cache, and the served response labels the body's state relative to the index rather than presenting it as snapshot-consistent.

---

## F6 — Nobody owns the snapshot lifecycle, and the layer table contradicts the dependency diagram at exactly that seam [S1]

### The contradiction

The layer table says the inbound HTTP adapter may import **"ports, domain, render"**.
The dependency diagram has `HTTP --> RENDER` and `HTTP --> DOMAIN` and **no `HTTP --> PORTS` arrow**, while stating "Arrows are the permitted direction of dependency."

The spine says both things. The seam this falls on is not cosmetic — it is where AD-3's lazy content read and its cache live.

### The two units

- **Unit A — `src/adapters/http/document.ts` (table-compliant).** Imports the content-read port and calls it directly for lazy body loads, memoizing per snapshot in a module-level map.
- **Unit B — `src/cli/session.ts` (diagram-compliant).** HTTP may not reach ports, so the composition root owns the snapshot holder, the content cache, and the refresh orchestration, and injects a `loadBody(artifactKey)` callback into the HTTP adapter.

### How each obeys

A follows the table; B follows the diagram. Both cite the spine.

### The incompatibility

AD-3 mandates a content cache and names no owner. If A ships and any other unit follows B's reading, there are **two caches** for the same bodies with independent lifetimes, and AD-3's "a refresh replaces the snapshot and its content cache together, so refresh has exactly one meaning" becomes false: refresh clears one cache and not the other, and refresh acquires two meanings. If B ships and any unit follows A's reading, a body read initiated from HTTP bypasses the cache entirely, so "cached for that snapshot's lifetime" silently does not happen and NFR-8 (a 24,000-word document navigating without perceptible delay) fails on every section turn, with nothing failing loudly.

There is a deeper omission behind this: hexagonal architecture normally has an **application layer** holding use cases, and this spine has none. The layer table jumps from ports to adapters to a composition root that "may import everything". So the three things that are unambiguously application concerns — *build a snapshot*, *hold the current one*, *replace it on refresh* — have no home, and every unit that needs to touch them finds a different API depending on which reading its author took.

### Proposed fix

Resolve the table/diagram contradiction explicitly (add the `HTTP --> PORTS` arrow or remove `ports` from HTTP's import list), then:

> **AD-17 — One session object owns snapshot lifecycle.** A single unit owns the current snapshot, the content cache keyed to it, and the refresh operation that replaces both. It exposes exactly three operations — `current()`, `body(artifactKey)`, `refresh()` — and no other unit constructs a snapshot, caches a body, or discards a cache. It lives in one named layer, stated here.

---

## F7 — AD-5's "assumption beside the value" and AD-6's "ordering evidence" are two mechanisms that both claim to answer FR-15 [S2]

The prompt asks whether these are the same mechanism. They are not, and the spine does not say how they relate — so two units resolve the relationship differently and produce different feeds from identical projects.

### The two units

- **Unit A — `src/adapters/fs/timestamp.ts`.** Per AD-5, converts every timestamp to one internal representation at the point of read and records the assumption applied. Emits `Timestamp { instant, sourceFormat, assumedZone: 'system' | null, resolution: 'date' | 'minute' | 'second' }`. `resolution` is a property of the **value**, which is what FR-67 describes.
- **Unit B — `src/domain/ordering/rank.ts`.** Per AD-6, attaches to every activity item "the tier that produced its position and **that tier's resolution**". Emits `Evidence { tier: 1..6, resolution: 'date' | 'minute' | 'second' }`. `resolution` is a property of the **tier**, which is what AD-6 literally says.

### How each obeys

Verbatim, both.

### Incompatibility 1 — two fields claim to be "the resolution"

FR-15: *"Each activity entry displays the resolution and source of its own timestamp."* There are now two candidate answers and they disagree in real cases. An item ranked by tier 2 (git commit, second-resolution, timezone-aware) may display a date drawn from its frontmatter (date resolution). Renderer A shows "date"; renderer B shows "second". Same item, two confidence badges, and AD-6's stated purpose — that "FR-15's confidence display cannot drift from the sort it describes" — is defeated *by rules-compliant construction*, which is the precise failure AD-6 exists to prevent.

### Incompatibility 2 — does the assumed zone reach the ordering decision?

Nothing says. Consider two artifacts, both ranked by tier 3 or 4 (memlog frontmatter `updated`, document frontmatter `updated`), both timezone-naive, per FR-67.

- **Unit A'** materializes each under its recorded assumption and compares the resulting instants. The comparison is total; the feed is fully ranked. A' has not assumed *silently* — the assumption is recorded beside the value, exactly as AD-5 requires.
- **Unit B'** treats an assumed zone as making the comparison unestablished when the values are within the uncertainty window (up to 26 hours), and puts both items in AD-6's **unordered** group. B' obeys AD-5 ("must not silently assume they share a zone" — it refuses to assume) and AD-6 ("items whose order cannot be established are grouped as unordered").

**Result: on the same project, A' renders a fully ranked chronological feed and B' renders a landing view where nearly every item is in the unordered bucket** — because tiers 3, 4 and 5 are all naive and date-or-minute resolution, and in a non-git project (FR-62 explicitly supports these) they are *all* that exists. C3's default view, the product's landing page, is either a chronological list or effectively an unordered pile, and both are AD-compliant. This is the largest observable divergence in the review.

### Proposed fix

> **AD-5 / AD-6 (unified).** One evidence record, produced once, travels with the item: `{ tier, timestamp, resolution, assumedZone }`, where `resolution` and `assumedZone` are properties of the *value* and `tier` names the source that supplied it. The renderer of FR-15 reads that record and nothing else — there is no second resolution.
>
> **AD-6 (tightened) — the comparison rule is stated, not chosen.** Whether two timestamps with recorded zone assumptions are comparable is decided by one rule in one module: [the spine must pick one, e.g. *values with unresolved zone assumptions are compared under the recorded assumption and displayed at their true resolution; the assumption is shown, never hidden*]. `unordered` is reserved for items with **no** usable timestamp at any tier, not for items whose timestamp is merely weak — otherwise the unordered group swallows the feed on every non-git project.

---

## F8 — The granularity of an activity item is undefined, and FR-66 needs a partial-order state AD-6 does not have [S2]

### The two units

- **Unit A — `domain/activity/items.ts` (file-granular).** One activity item per artifact. A memlog appears once, ordered by tier 3 (its frontmatter `updated`). Entries are shown inside the C4 memlog viewer (FR-19).
- **Unit B — `domain/activity/items.ts` (entry-granular).** FR-29 requires memlog `override` and `assumption` entries to be "surfaced prominently"; UJ-1 says the trail behind a run is what the user needs. Those are *entries*, not files. Unit B emits one activity item per memlog entry.

### How each obeys

AD-4 fixes identity as "keyed by its resolved absolute path" — for *artifacts*. An activity item is not stated to be an artifact, and AD-6 speaks of "activity items" without saying what one is. Both units comply.

### The incompatibility

FR-66: *"`.memlog.md` entries carry no per-entry timestamp... Within one memlog, entry order is authoritative; across artifacts, memlogs cannot be interleaved on a timeline and must not be presented as if they can."*

This is a **partial order** — total within a file, undefined across files. AD-6 offers exactly two states: positioned, or unordered. It has no representation for "ordered within a group, ungrouped across". So:

- Unit B must place every memlog entry in the unordered bucket (any position on the shared timeline would be the false position AD-6 forbids), which means the entries carrying the highest oversight value per FR-29 are precisely the ones with no position in the view whose purpose is showing recent activity.
- Unit A never faces the problem but cannot satisfy FR-29's "surfaced prominently" from the feed, and C6 cannot deep-link a specific override entry from the C3 landing view because no such item exists.

And the two disagree on the *cardinality* of the shared collection. Every unit keyed on "activity item" — FR-17's family and time-window filters, pagination, FR-76's coverage counts, the keyboard navigation order NFR-14 requires — computes different results. A C6 view reporting "41 items examined" against A and "312" against B is describing the same project.

### Proposed fix

> **AD-18 — Activity item granularity and the ordered-group state.** An activity item is defined [one artifact, or one artifact-event, chosen here]. Items may carry a **group** identity within which order is authoritative but which is not interleaved with other groups (FR-66). The feed renders three states — positioned, grouped-but-not-interleaved, unordered — and no view collapses the middle state into either neighbour.

---

## F9 — AD-7's degradation vocabulary is unspecified, and five overlapping "we could not fully understand this" states have no single owner [S2]

### The two units

- **Unit A — `domain/result.ts` (wrapper).** AD-7: "a typed value in the model recording what failed and **at which stage**". A enumerates stages `read | parse | identify | normalize` and wraps: `Degraded<Artifact>`.
- **Unit B — `domain/artifact.ts` (variant).** B enumerates stages `io | yaml | markdown | precedence` and models degradation as a variant of the artifact type itself: `{ kind: 'unreadable', stage, detail }`.

### How each obeys

AD-7 specifies neither the stage vocabulary nor the representation. Both comply.

### The incompatibility

AD-7's final sentence is *"Every view renders these values explicitly"* — an obligation on `src/render/` and on `web/`. A renderer written against A's `Degraded<T>` wrapper cannot render B's variant and vice versa, and the two stage vocabularies do not map (`identify` vs `precedence`, `parse` vs `yaml`+`markdown`). AD-7 imposes a cross-cutting obligation on every view while leaving the thing they must render unspecified — the strongest form of shared-shape hole in the document.

### The compounding problem: five names, overlapping meanings, no owner

| Source | State | Meaning |
| --- | --- | --- |
| FR-12 | present-but-uninterpreted | recognized as a file, no viewer applies |
| FR-69 | unidentified | no precedence level resolved; names which were attempted |
| AD-4 | ambiguous | run folder vs sharded document, FR-73 |
| AD-7 | degraded | parse or read failed, with a stage |
| NFR-5 | present-but-uninterpreted | unknown BMAD version |
| AD-8 | unreadable | signal could not be read |

Unit A collapses `unidentified` into `present-but-uninterpreted` (both render as "no viewer"), which is defensible and unforbidden. Unit B keeps all five distinct. The C6 coverage table (FR-76: "what it examined, what it could not interpret") then reports different denominators for the same disk. And the Consistency Conventions' "Absent vs unreadable vs unchecked — collapsing any pair is a defect" governs only three of these six names.

### The case nothing models at all: NFR-3 transient invalidity

NFR-3: *"BMAD agents write these files while the tool reads them. Truncated, partially written or transiently invalid files must be handled without crashing and without presenting corrupt data as valid."*

A YAML file caught mid-write is `unreadable` at snapshot time and perfectly valid 200ms later. Nothing in the spine distinguishes transient from permanent, and nothing says whether a read may be retried.

- **Unit A''** retries a failed parse once after a short delay — nothing forbids it, and it directly serves NFR-3.
- **Unit B''** does not retry — AD-7 says a failure yields a typed value, and B'' yields one.

Both compliant. Under concurrent agent writes the two produce **different snapshots from identical disks**. Worse, A''`s retry makes the snapshot pass non-atomic in time, which quietly undermines AD-3's "single pass" and makes the AD-11 currency comparison fire against a record taken at an unpredictable moment.

### Proposed fix

> **AD-7 (tightened).** One domain module owns a single closed result type and a single closed stage vocabulary, enumerated in the spine. Every degradation state in the model is a member of one enumeration that also contains `unidentified`, `ambiguous`, `present-but-uninterpreted` and `out-of-tree`, so no unit invents a sixth name and every view has one thing to render.
>
> **AD-19 — Snapshot reads are single-attempt and time-boxed.** A read that fails during the snapshot pass is recorded as degraded and is not retried within the pass; the snapshot's "single pass" is a bounded interval. Transient invalidity is resolved by refresh (which is a user action), not by retry, so the snapshot remains a statement about one moment.

---

## F10 — Identity confidence, ordering confidence and signal availability are three uncertainty axes with three vocabularies and no rule that they stay distinct [S2]

### The three sources

- FR-69 / AD-4: identification confidence — *"confidence is displayed where it is below certain"*, plus a distinct `ambiguous` state.
- FR-15 / AD-6: ordering evidence tier and resolution.
- FR-76 / AD-8: per-signal availability.

### The two units

- **Unit A — `render/confidence.ts` (unified badge).** Reads the three axes and renders one badge with one scale, because the UI has one "how sure are we" affordance and NFR-15 requires meaning not be encoded in colour alone, which makes three parallel scales expensive. Nothing in the spine forbids the merge.
- **Unit B — `render/*` (three badges).** Keeps them distinct because they are distinct facts.

### The incompatibility

Under A, an artifact identified at precedence level 4 (filename hint — weakest) and ordered by tier 1 (uncommitted working-tree change — strongest) collapses to one badge, and whichever way A resolves it, the badge misstates one of the two. Under B the user sees both. Beyond appearance, the *data* diverges: A's snapshot may store a single derived `confidence` field, and any unit written against B's three fields cannot read it. AD-4's "confidence displayed where below certain" and AD-6's "tier and resolution as data on the item" are satisfied in both.

Additionally, neither AD specifies a representation for identification confidence. **Unit A'** uses an ordinal `certain | probable | ambiguous | none`; **Unit B'** uses `resolvedAtLevel: 1|2|3|4|null` plus `attemptedLevels` and `alternatives[]` (which is what FR-69's "naming which levels were attempted" actually requires). B' can render FR-69; A' cannot, having discarded the level information — and A' is AD-4-compliant.

### Proposed fix

> **AD-20 — Uncertainty axes are named, separate, and non-collapsible.** The model carries exactly three uncertainty axes with fixed, distinct vocabularies: *identification* (`resolvedAtLevel` + `attemptedLevels` + `alternatives`, per FR-8/FR-69), *ordering evidence* (per AD-6), and *signal availability* (per AD-8). No view merges two axes into one indicator; the conventions table's "collapsing any pair is a defect" extends to these.

---

## F11 — Deferred items that are not safe to defer

The Deferred list says "the spine does not decide these; they are the code's to choose." Four of the seven are decisions two units cannot make independently.

### 11a — "Route shapes and URL grammar" [S1]

This is constrained on three sides simultaneously and is therefore not a free choice:

- AD-2: document URLs are server-owned.
- Conventions: *"An artifact is keyed by its resolved absolute path. Slugs are never identities."*
- AD-10/NFR-17: content-derived path segments are sanitized before use "on either of the two surfaces they touch" — filesystem **and URL**.
- FR-27: any section has a stable permalink that survives reload.
- FR-77: for sharded documents the page structure is BMAD's shard boundaries, so shard filenames appear in the URL space.

**Unit A — `render/permalink.ts`** builds URLs from sanitized slugs, per AD-10.
**Unit B — `http/resolve.ts`** maps an inbound URL back to an absolute path, the artifact key per the conventions.

**Sanitization is not injective.** Run folder names are free-text slugs no BMAD component sanitizes (NFR-17). `spec-my/thing`, `spec-my thing` and `spec-my-thing` all sanitize to `spec-my-thing`. So A's forward map is many-to-one and B's reverse map is ambiguous: a permalink can address two artifacts, and FR-27's "stable permalink" resolves to whichever B's tie-break picks — possibly a different document than the one the user bookmarked. Neither unit is wrong; the spine mandated a lossy transform and then deferred the round trip. AD-10 makes this *worse* than an unsanitized design, and it is exactly the kind of hazard a spine exists to catch.

> **Fix — AD-21.** URLs address artifacts and sections by a stable opaque identifier derived from the artifact key (AD-4), not by sanitized content-derived segments. Sanitized slugs may appear in URLs only as non-authoritative decoration. Where two artifacts would collide under any content-derived encoding, the collision is detected in the snapshot pass and recorded, never resolved silently — the same discipline AD-4 applies to identity.

### 11b — "Snapshot representation in memory, and whether phase-1 reads are concurrent" [S1]

Two problems in one bullet.

**Representation.** Five capability groups read from the snapshot (AD-3 binds C2–C5; AD-8 adds C6). Deferring the shape of the one object every unit shares is deferring the substrate itself. Every S1 finding in this review is downstream of this bullet.

**Concurrency.** AD-3 asserts the snapshot is *immutable*; it does not assert it is *simultaneous*. Under NFR-3 (agents writing during the read), a concurrent pass produces a snapshot in which file X was read pre-write and file Y post-write — an internally inconsistent statement about a moment that never existed. A sequential pass has a longer but still non-zero window. **Unit A (concurrent)** and **Unit B (sequential)** both obey AD-3, and AD-11's currency check — which compares one file's current state against the snapshot's record — fires spuriously at different rates in each, so the two units disagree about how often the tool tells the user it is out of date.

> **Fix.** Move snapshot representation out of Deferred and into the spine (or a named companion), owned by AD-17's session unit. State the concurrency decision, or state explicitly that the snapshot is a best-effort statement over an interval and that AD-11's check is the compensating mechanism — but state it, because AD-11's tuning depends on it.

### 11c — "The sectioning algorithm's heading-weight thresholds" [S2]

The thresholds are genuinely deferrable. **Section identity is not.** FR-27 requires permalinks stable across reload; sections derive from heading structure; so section ids are a function of the sectioning output.

**Unit A — `domain/sectioning.ts`** emits ids as slugified heading text.
**Unit B — `render/toc.ts`** emits anchors as ordinals (`#s-7`), because heading text is not unique in a 24,000-word spec.

Both survive reload, so both satisfy FR-27 as written. But A's ids silently retarget when a heading is reworded and B's silently retarget when a section is inserted — and if A owns the content anchors while B owns the TOC anchors, the TOC does not link to the content. FR-77 adds a third case: a sharded document's page ids come from BMAD's filenames, so **the id scheme differs between sharded and whole documents**, and any unit that assumes one scheme breaks on the other.

> **Fix.** Add to AD-2 or a new AD: section identity is produced once, by the sectioning module, for both sharded and whole documents, and is the sole source of anchors, TOC targets and permalinks. Thresholds remain deferred; identity does not.

### 11d — v1 depends on two requirements the PRD defers [S1, cross-document]

**AD-3** is written around "a refresh". **AD-11** offers "an offer to refresh". Both are v1 ADs binding C2–C5.

In the PRD, **FR-37** — *"Refresh is user-initiated. The UI reflects on-disk state as of its last read and offers an explicit refresh"* — and **FR-47** — *"Displayed data states how current it is, so a stale view is never mistaken for a live one"* — are both listed under **C7 — Live threads, which is deferred**. The PRD's own release boundary says v1 is C1–C6.

So the spine's v1 invariants depend on two deferred requirements, and the PRD's UJ-1 implications cite FR-37 as v1-load-bearing while §6 defers it. Two units read this differently and neither is wrong:

- **Unit A** ships a refresh control and a currency banner, treating FR-37/FR-47 as implicitly in v1 because AD-3 and AD-11 require them.
- **Unit B** ships no refresh control, because C7 is deferred — and then AD-11's "offer to refresh" has nothing to offer, AD-3's "a refresh replaces the snapshot" never occurs, the content cache never expires, and a session's data is frozen at process start.

Under B the tool is a one-shot renderer, and NFR-16 ("refresh latency is the binding performance requirement, being paid repeatedly within a session") describes a feature that does not exist.

> **Fix.** Pull FR-37 and FR-47 into v1 explicitly in the PRD's release boundary (they are C1/C3 concerns, not live-thread concerns), or state in the spine that refresh and currency display are v1 mechanisms independent of C7. This is a one-line correction with a large blast radius if missed.

---

## F12 — AD-2's boundary does not survive contact with FR-17 and FR-19, and fragment ownership is unassigned [S3]

### The two units

- **Unit A — `render/memlog.ts` (server-side filtering).** FR-19's "typed, filterable timeline" is implemented as a server round trip per filter change: new URL, new render. Cleanly AD-2-compliant — the server renders document content.
- **Unit B — `web/memlog-filter.ts` (client-side filtering).** All entries are delivered as markup; the client hides DOM nodes. Also AD-2-compliant — "the client enhances delivered markup only", and no content is assembled client-side.

### The incompatibility

Two seams open at once.

**Fragment ownership.** Unit B keeps filter state in the URL fragment (`#type=override`) so a filtered view is linkable. FR-27 requires *sections* to have stable permalinks, and section anchors conventionally live in the fragment too. Two units now claim the fragment, and AD-2's "no client-side router owns a document URL" is ambiguous about whether fragment state counts as owning the URL. A permalink to a section inside a filtered memlog is unrepresentable under one scheme or the other.

**Currency interaction.** Under Unit A every filter change is a document open, so per AD-11 it runs a currency check — meaning adjusting a filter can pop a refresh offer, and doing so repeatedly is the FR-56 dismissible-signal failure applied to the currency mechanism itself. Under Unit B no filter change is an open, so a memlog can be filtered for an entire session with no currency check at all. AD-11 does not distinguish "the user asked for different content" from "the user asked for the same content differently".

> **Fix.** Assign fragment ownership explicitly (section identity owns the fragment; view state such as filters uses query parameters, which keeps them server-visible and consistent with AD-2's server-owned document URLs), and scope AD-11's "open" to first delivery of a document's content within a snapshot rather than to every request.

---

## §14 — Consolidated remediation

Ordered by blast radius. Items 1–4 are prerequisites for a coherent build.

| # | Change | Kind | Closes |
| --- | --- | --- | --- |
| 1 | **AD-13** — every signal declares index-phase or body-phase; `unchecked` is a first-class state; AD-8's triple becomes the conventions table's four states | new + tighten AD-8 | F1 |
| 2 | **AD-9 / AD-10 tightened** — the filesystem adapter adjudicates the root set; configured locations are sanitized inputs, not roots; `out-of-tree` is a modelled state | tighten | F2 |
| 3 | **AD-14** + **AD-1 tightened** — hardened, enumerated git subprocess surface; read-only verified by a before/after byte-identity test over a fixture project including `.git/` | new + tighten | F3 |
| 4 | **Snapshot representation moved out of Deferred**; **AD-17** — one session unit owns snapshot, cache and refresh; resolve the layer-table/diagram contradiction on `HTTP --> PORTS` | new + correction | F5, F6, F11b |
| 5 | **AD-15** — artifact family is a closed, single-owner enumeration covering every artifact; run-folder provenance is a separate field | new | F4 |
| 6 | **AD-16** + **AD-11 tightened** — snapshot identity on every response; fragments pin it; "open" defined; currency probe never cached; mismatched bodies never enter the cache | new + tighten | F5 |
| 7 | **AD-5 / AD-6 unified** — one evidence record; one resolution; the naive-zone comparison rule is stated, not chosen; `unordered` reserved for no-timestamp items | tighten | F7 |
| 8 | **AD-18** — activity item granularity fixed; grouped-but-not-interleaved is a third feed state (FR-66) | new | F8 |
| 9 | **AD-7 tightened** + **AD-19** — one closed result type and stage vocabulary absorbing all six "not fully understood" names; snapshot reads are single-attempt | tighten + new | F9 |
| 10 | **AD-20** — three uncertainty axes, named and non-collapsible | new | F10 |
| 11 | **AD-21** — URLs address artifacts and sections by stable opaque id; sanitized slugs are decoration; encoding collisions are detected and recorded | new | F11a |
| 12 | Section identity produced once by the sectioning module for both sharded and whole documents | tighten AD-2 | F11c |
| 13 | **PRD correction** — FR-37 and FR-47 are v1, not C7 | cross-document | F11d |
| 14 | Fragment ownership assigned; filter state uses query parameters | tighten AD-2 | F12 |

## What the spine gets right

Recording this so the remediation does not overcorrect. **AD-1's** choice of a mechanically assertable invariant over a stylistic one is the right instinct and needs only the extension of item 3 to be genuinely sound. **AD-12** is unusually well-drawn: "binds the literal address `127.0.0.1` and no other interface" is testable and closes the exact NFR-9 hazard. **AD-2** correctly identifies that two rendering models for the same content is the defect to prevent, and its permalink rationale is right. **AD-4's** refusal to resolve the run-folder/sharded-document ambiguity silently is the correct posture toward FR-73, and the conventions table's "slugs are never identities" is the single most valuable line in the document. The Stack section's framing of dependency count as a constraint rather than a preference is well judged for an `npx` tool.

The weakness is narrow and specific: the spine constrains *direction* rigorously and *shared shape* not at all, and for a build substrate feeding six capability groups off one object, shared shape is the load-bearing half.
