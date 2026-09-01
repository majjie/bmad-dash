---
title: Rubric review — ARCHITECTURE-SPINE (bmad-dash)
type: review
lens: rubric-walk
target: ../ARCHITECTURE-SPINE.md
sources:
  - ../../../prds/prd-bmad-2026-08-28/prd.md
  - ../../../prds/prd-bmad-2026-08-28/addendum.md
  - ../.memlog.md
reviewer: rubric walker
created: 2026-08-28
---

# Rubric review — ARCHITECTURE-SPINE (bmad-dash)

**Overall verdict: THIN.** A well-formed spine, unusually disciplined about the spine/seed boundary, carrying four or five genuinely strong ADs — that is nevertheless not yet a safe build substrate. One contradiction (AD-3 vs AD-8) leaves C6, the PRD's stated *primary job*, with no read model at all. Three cross-unit contracts that separately-built units cannot invent independently — URL and section-anchor grammar, the artifact identity key, and the accessibility contract across viewers — are unfixed, two of them by explicit deferral. The two highest-stakes rules (AD-1, AD-5) each stop short of preventing the divergence they name.

The distance to "adequate" is short. Most of what follows is one clause added to an existing AD, plus two new ADs and one correction. Nothing here argues the paradigm, the layering, or the twelve ADs' selection — those are sound.

| # | Checklist item | Verdict |
|---|---|---|
| 1 | Fixes the real divergence points, misses none | thin |
| 2 | Every AD's Rule enforceable and prevents its stated divergence | thin |
| 3 | Nothing under Deferred could let two units diverge | thin |
| 4 | Named technology verified-current | thin |
| 5 | Covers the driving PRD's capabilities (C1–C6, 57 active FRs) | thin |
| 6 | Every dimension decided, deferred, or open | thin |

**Findings: 1 critical, 7 high, 4 medium, 4 low.**

---

## What is strong, and should survive any revision

Stated first so the revision does not sand it off.

- **AD-4, AD-6, AD-7 are model spine work.** Each names one divergence that would actually happen between two independently-built units, and each fixes it with a rule about *where a decision is made* rather than about how code looks. AD-6's "every activity item carries the tier that produced its position and that tier's resolution, **as data on the item**" is the sharpest of the twelve: it converts FR-15 from a UI promise into a type obligation, and its second sentence — "Items whose order cannot be established are grouped as unordered rather than given a false position" — closes the escape hatch. AD-7 does the same for the throw-vs-skip split.
- **AD-9 is correctly scoped.** "Both are resolved in the composition root and passed to everything else. No other unit performs discovery" is enforceable by inspection and kills a real class of bug (FR-70's false "no BMAD project").
- **The `Prevents` / `Rule` pairing throughout.** Forcing every AD to name its divergence before stating its rule is what makes this document auditable at all — most of the findings below were only findable *because* the `Prevents` line is explicit enough to test the `Rule` against.
- **The seed/spine separation is honest.** "Seed — verified current at authoring; the code owns this once it exists" over the Stack table, and the Structural Seed section kept out of Invariants, is exactly right. Rationale is in the memlog, not the spine — also right.
- **AD-12 exists at all.** Most feature-altitude spines leave the operational envelope silent. Recording "There is no deployment topology, no infrastructure, and no provider dependency" as a positive decision is the correct move, and the memlog says so deliberately ("Recorded explicitly so the dimension is decided rather than silent"). The findings below are about what AD-12 *does not* cover, not about its existence.

---

## Item 1 — Does it fix the real divergence points for the level below, and miss none?

**Verdict: thin.**

The spine correctly identifies and fixes the four hardest domain divergences: who decides identity (AD-4), what a timestamp is by the time it reaches comparison logic (AD-5), what an ordered item carries (AD-6), and what a failure looks like in the model (AD-7). Those are the right four, and they are the ones a naive spine would miss.

What it misses is a fifth of equal weight — the read model that C6 needs — and it misses it by contradiction rather than omission, which is worse.

### F-1 — AD-3 and AD-8 contradict each other; C6 has no read model [CRITICAL]

AD-3 fixes the snapshot as structural only:

> a refresh builds one immutable snapshot — every artifact discovered, identified, timestamped, and ordered in a single pass … Document bodies are read on first open, cached for that snapshot's lifetime, and discarded when it is replaced.

The memlog is unambiguous that this is the intent: "Snapshot collapses to ONE phase — structure and identification only" (memlog, FR-28 resolution), and the cost model is "first chunk of every file, not list directories."

AD-8 then requires of that same snapshot:

> the snapshot records, per artifact and per signal, whether that signal was available, absent, or unreadable.

And the Capability map places the whole of C6 on it: **"C6 — Oversight surfacing | `src/domain/` over the snapshot; AD-8"**.

These cannot both hold. C6's requirements are content-level, and the content is not in the snapshot:

- **FR-29** — memlog entries "of type `override` and `assumption`" require parsing entry bodies of every `.memlog.md`.
- **FR-30** — `[ASSUMPTION]` tags, `[NOTE FOR PM]` callouts, open-question sections, deferred items — these appear anywhere in a document, including at word 20,000 of a 24,000-word spec. A head-read cannot see them.
- **FR-32** — "documents marked `status: final` that still carry unresolved open items" needs frontmatter (head-read, fine) *and* the whole body (not fine).
- **FR-33** — reviewer findings "aggregated across the project" requires reading every `review-{slug}.md` in full.

This is the *same* conflict the memlog caught for full-text search — "FR-28 full-text search is v1 (C5) and needs content from every file, which lazy content loading does not provide" — and resolved by withdrawing FR-28. C6 was never re-checked against the resolution. The withdrawal of FR-28 removed one content-hungry requirement and left four.

**Why this is critical rather than high.** Two units built from this spine will resolve it in opposite, both-compliant directions. The oversight builder either (a) reads every file in full during the snapshot pass — which silently repeals AD-3, blows the memlog's cost model, and puts NFR-16 ("refresh latency is the binding performance requirement") at risk on a large `_bmad-output` tree; or (b) honours AD-3 and records every content-derived signal as "unavailable", which satisfies AD-8's letter perfectly while delivering a C6 that reports nothing — precisely the "nothing was checked" outcome FR-76 exists to make visible, now shipped as the product. C6 is the PRD's **primary job** (§2.1, §6: "v1 performs the product's primary job rather than only preparing for it"). A spine that cannot say how its primary job reads its data is not yet a substrate for it.

**What the spine needs to decide.** Whether the snapshot pass extracts a bounded *signal set* per artifact on a full read (making the cost model "every byte once per refresh", which is a different NFR-16 conversation), or whether C6 is a second lazy pass with its own currency semantics, or whether content signals are extracted on open and the oversight view is honestly incremental. Any of the three is a defensible spine decision. Silence is not, and a contradiction is worse than silence because both readings look sanctioned.

### F-2 — Artifact identity key is under-specified, and the platform dimension that makes it matter is silent [HIGH]

Consistency Conventions:

> An artifact is keyed by its resolved absolute path.

This key is load-bearing across at least four units: AD-4's identification verdict is looked up by it, AD-3's content cache is keyed by it, AD-11's currency check compares against the snapshot record for it, and permalinks (FR-27) are derived from it. "Resolved absolute path" does not say whether symlinks are resolved, whether case is normalised, whether a trailing separator is stripped, or how a Windows drive letter is cased.

NFR-12 requires Linux, macOS **and Windows**. On Windows and default macOS the filesystem is case-insensitive: `…/PRDs/prd.md` and `…/prds/prd.md` are one file with two spellings, and BMAD slugs are free text (FR-49, NFR-17), so both spellings genuinely occur. Two units that each independently call "resolve the absolute path" produce different keys for the same file — the content cache misses, the currency check reports a phantom mismatch (AD-11 then offers a refresh that changes nothing), and permalinks fork.

The platform dimension is otherwise entirely silent in the spine — no rule about separators, path length, case, or the fact that AD-10's sanitizer must reject a different character set on Windows (`:`, `*`, `?`, reserved device names) than on POSIX. This is the environmental envelope AD-12 does not reach.

**Fix shape:** name canonicalization as a single function in the filesystem adapter alongside AD-10's sanitizer and confinement check — one place produces the key, nobody else derives one.

### F-3 — No signal vocabulary; AD-8's "per signal" has no referent [MEDIUM]

AD-8 records availability "per artifact and per signal" and the Conventions table makes "Absent vs unreadable vs unchecked" three distinct states "throughout the model and the UI" — but what *a signal is* is neither decided in an AD, listed under Deferred, nor recorded as an open question. The PRD names at least six distinct kinds (memlog `override`/`assumption` FR-29; memlog presence at all FR-68; in-document markers FR-30; final-with-open-items FR-32; aggregated review findings FR-33; `_bmad/custom/*.toml` deviations FR-34), with FR-34 carrying an explicit trap — reading a skill's own `customize.toml` "would report roughly 35 fabricated findings on every project."

Two units adding signals independently produce incompatible availability records, and AD-8's "the oversight view reads this record rather than inferring absence" becomes unimplementable across them. Relatedly, **FR-56** — "false alarms are treated as a first-order failure … risk indication must err toward silence over noise" — is the PRD's stated first-order failure mode and has no corresponding rule anywhere in the spine, so the elevation threshold for C3's core-artifact absence (FR-54/55) and C6's markers is set independently by each unit.

---

## Item 2 — Is every AD's Rule enforceable, and does it actually prevent its stated divergence?

**Verdict: thin.** Ten of twelve hold up. The two that do not are the two the product leans on hardest.

### F-4 — AD-5's Rule makes the divergence visible instead of preventing it [HIGH]

AD-5 states its divergence precisely:

> **Prevents:** four incompatible timestamp formats — three of them timezone-naive — reaching comparison logic where **two units assume different zones and produce a silently mis-ordered feed**

Its Rule then says:

> Where a source carries no timezone, **the assumption applied is recorded alongside the value** rather than resolved invisibly.

Recording the assumption does not stop two units from making *different* assumptions. Unit A normalises `MM-DD-YYYY HH:MM` from `sprint-status.yaml` as machine-local; Unit B normalises date-only document frontmatter as UTC midnight. Both comply with AD-5 in full — each recorded what it assumed — and FR-14's ordering hierarchy still produces a feed that is wrong by up to a day, now with two conflicting annotations attached explaining why. The rule removes silence, which is valuable, but the `Prevents` line promises it removes *divergence*.

Note the contrast with AD-4, which gets this exactly right for identity: "artifact identity is decided once, **in one domain module**". AD-5 has no equivalent single-authority clause, and it has two adapters (`fs/` and `git/`) that both produce timestamps.

**Fix shape:** one clause — the assumed zone for naive sources is fixed once by the spine (or by one normalization module named the way AD-4 names one identification module), and *that* single assumption is what travels with the value.

### F-5 — AD-1's enforcement gate is `node:fs`, but the product's write surface includes `node:child_process` [HIGH]

AD-1's `Prevents` is broad — "**a write path existing anywhere in the product**" — and its Rule narrows to one module:

> only `src/adapters/fs/` may import `node:fs` … **A test asserts no other module imports `node:fs`.**

Two gaps, one structural and one literal.

**Structural.** The Stack table says "Git access | `git` invoked as a subprocess", so `node:child_process` (or equivalent) is a sanctioned import somewhere. Nothing in the spine confines it. `child_process` is a complete write path: `git checkout`, `git clean`, `rm`, `mv` all reach the target project through it, and AD-1's mandated test passes while they do. This matters more than a purist's objection because the git adapter's job — "working-tree state and commit times" — sits one flag away from mutation (`git stash`, `git status` vs `git status --porcelain` is fine, but the boundary is a code-review convention, not a test). NFR-1 asks for an invariant "verified by test, not a convention"; as written, half of it is a convention.

**Literal.** A test asserting "no other module imports `node:fs`" does not catch `node:fs/promises`, `require('fs')`, bare `'fs'`, or `await import('node:fs')`. The spine names the assertion in enough detail to be taken literally by the unit that writes it (Deferred correctly leaves the *framework* open but calls the assertion "required"), so the imprecision propagates.

**Related — the process-spawning surface has no home at all.** The layer table and Structural Seed list exactly three adapters: `fs`, `git`, `http`. But C1 requires **FR-5** ("opens the user's default browser at the served URL on start") and C4 requires **FR-24** ("an open-in-editor affordance"). Both spawn processes on the user's machine. Neither has a directory, a port, or a rule. AD-12's envelope covers persistence, network and binding, but launching a browser is none of those — it is an uncontained side effect on the host, and it is the one place where a content-derived string (a file path, per AD-10) is handed to a shell-adjacent API. Two units will place it in two different layers, and one of them will place it in `src/render/` or `web/`.

### Ten that hold

AD-2, AD-3 (as a caching rule, setting aside F-1 and F-11), AD-4, AD-6, AD-7, AD-8 (as a rule; see F-3 for its referent), AD-9, AD-11, AD-12 are each enforceable by inspection or by construction and each prevent what they claim. AD-10 holds as a rule but has an ambiguous term — see F-6.

---

## Item 3 — Could anything under Deferred let two units diverge?

**Verdict: thin.** Three of the seven deferred items are cross-unit contracts, not internals. Deferral is correct for the other four (test framework, heading-weight thresholds, C7–C9 internals, and — with a caveat — concurrency).

### F-6 — "Route shapes and URL grammar" is the C4/C5 interface, not an internal [HIGH]

> Deferred: Route shapes and URL grammar, beyond AD-2's rule that document URLs are server-owned.

**FR-27** requires "any section has a stable permalink that survives reload", and **FR-77** requires that BMAD's existing shard boundaries become the tool's pages so that "the tool's pages, BMAD's files, permalinks (FR-27), and open-in-editor targets (FR-24) all refer to the same units." That is a four-way identity contract, and its expression *is* the URL grammar.

The units that must agree on it are not one unit: `src/domain/` sectioning mints section identities, `src/render/` emits the anchors, `src/adapters/http/` routes them, and `web/` resolves them for keyboard navigation (NFR-14) and side-by-side selection (FR-60). AD-2 says the client "enhances delivered markup only" and no client router owns a document URL — which correctly forbids the client from *inventing* URLs but says nothing about how it *constructs* the ones it needs for filtering (FR-17) and nomination (FR-60).

Compounding it: AD-10 requires "every path segment derived from project content passes one sanitizer before use" including "every … URL", but fixes nothing about the sanitizer's output contract. If two BMAD slugs sanitize to the same string, two artifacts share a permalink — FR-27's "stable" fails, and AD-4's identity verdict is looked up under a colliding key. Injectivity, or an explicit collision rule, is a spine-level property of a sanitizer that AD-10 makes mandatory and universal.

### F-7 — Deferring styling and per-viewer markup defers the accessibility contract [HIGH]

> Deferred: Styling approach, design tokens, and component structure inside `web/`.
> Deferred: Per-viewer markup for each artifact type (C4).

Between them these hand away every carrier of **NFR-14** ("the dense default view is fully keyboard navigable") and **NFR-15** ("meets WCAG 2.2 AA for contrast and focus visibility, and does not encode meaning in colour alone — relevant given status and severity are colour-coded"). C4 is six or seven viewers (FR-18 through FR-23), each plausibly a separate unit of work, each authoring its own markup under this deferral. Keyboard navigation across independently-authored viewers with no shared focus model, no shared landmark structure, and no shared interaction vocabulary does not converge — it is the textbook two-units-diverge case, and it is not recoverable late.

NFR-15's colour clause interacts directly with the spine's own convention — "Absent vs unreadable vs unchecked | Three distinct states throughout the model and the UI. Collapsing any pair is a defect" — since the obvious rendering of three states is three colours. The spine states the model obligation and drops the presentation obligation that carries it.

This is also the item-6 finding: **accessibility is a whole dimension the feature altitude owns, and the spine is silent on it** — not decided, not deferred by name, not an open question. It reaches Deferred only as collateral of a styling deferral.

### F-8 — "Snapshot representation in memory" is the shared data contract [LOW]

> Deferred: Snapshot representation in memory, and whether phase-1 reads are concurrent.

Bounded rather than open, because AD-4 through AD-8 each mandate *fields* on it (the identity verdict, the normalized timestamp with its assumption, the ordering tier and resolution, the typed degradation value, the per-signal availability record). What is unfixed is the entity set — what an `Artifact` is versus a run versus a section versus a shard — consumed by four capability groups. Low only because the ADs constrain it heavily in practice and one domain module plausibly owns it.

The concurrency half deserves a note: **NFR-3** ("BMAD agents write these files while the tool reads them. Truncated, partially written or transiently invalid files must be handled") means read concurrency is not purely a performance choice — it affects whether a single pass can claim internal consistency. AD-3's "one immutable snapshot" is a promise about a moving filesystem, and the spine does not say what "immutable" means when the source changed mid-pass.

---

## Item 4 — Is named technology verified-current?

**Verdict: thin.** Verified against the npm registry and endoflife.date on 2026-08-28, the spine's own authoring date.

### F-9 — Two stack rows are stale at authoring; the runtime line expires in weeks [MEDIUM]

| Spine says | Actual latest (2026-08-28) | Verdict |
|---|---|---|
| markdown-it 14.x | **15.0.1** | stale — one major behind |
| esbuild 0.25.x | **0.28.2** | stale — three minors behind, pre-1.0 |
| Node.js 24 LTS (floor 22) | 24 is Active LTS **until Oct 2026**; **26** is current Active LTS (EOL 2029-04-30) | expiring |
| Preact 10.x | 10.29.8 | current |
| yaml 2.x | 2.9.0 | current |
| `node:http`, `node:util parseArgs`, `git` subprocess | built-in / external | n/a |

The markdown-it miss is not cosmetic given *why* it was chosen. The memlog's rationale is the token stream — "markdown-it's token stream carries heading levels at one dependency" — and v15's breaking changes land exactly there: package-internal imports such as `markdown-it/lib/token.mjs` are no longer exported (classes move to statics on the default export, `MarkdownIt.Token`), types are now bundled (`@types/markdown-it` must be removed), and linkify no longer recognises fuzzy links by default. The public parser API is otherwise v14-compatible, so this is a cheap correction — but a v1 built on 14.x starts one major behind on its most load-bearing dependency.

esbuild is pre-1.0, where minor bumps carry breaking changes by policy; 0.25 → 0.28 is three of them.

Node: naming 24 as the line is defensible (floor 22 is in maintenance until 2027-04) but 24 leaves Active LTS in **October 2026**, roughly six weeks out, and the memlog itself flags that month as the release-model change point ("Node release model changes Oct 2026 to one major per year, all becoming LTS — pinning to an LTS line is more durable than usual"). The reasoning was right and the line chosen was the one about to roll over; 26 is now Active LTS through 2029-04-30.

**Verification trail.** The memlog records verification for exactly two rows — Node ("Verified via endoflife.date and nodejs.org release-schedule announcement") and markdown-it ("Verified via pkgpulse 2026 comparison"). Preact, esbuild and yaml carry no verification entry at all, and the two rows that *were* verified are the two that are stale, which suggests the verification predates the write-up rather than that it was skipped.

Severity is medium, not high: the Stack table is explicitly seed ("the code owns this once it exists"), so a wrong pin costs a version bump rather than a redesign. But item 4 asks whether it is verified-current, and two of five pinned libraries are not.

---

## Item 5 — Does it cover the driving PRD's capabilities (C1–C6, 57 active requirements)?

**Verdict: thin.** All six groups appear in the Capability → Architecture map, and C2, C3 and C5 are genuinely well served — AD-4/7/9/10 cover C2's fifteen requirements closely, and AD-3/5/6/8 cover C3's fourteen. C6 is the failure (F-1). Beyond it, four requirements have no architectural home.

### F-10 — AD-10's confinement set is singular where AD-9 resolves a plural, and FR-74 needs a third state [HIGH]

AD-9 resolves **roots**, plural:

> **artifact roots** are read once from the target project's own configuration

AD-10 checks against a root, singular:

> every resolved filesystem path is confinement-checked against **the artifact root** before it is read

With multiple roots (FR-10 reads them from `_bmad/bmm/config.yaml` plus user overrides; FR-51 adds `story_location` from `sprint-status.yaml` as a further one), "the artifact root" has at least three readings — the project root, the union of configured roots, or the specific family root for the artifact in hand. They differ by a lot: the union permits reads the family root forbids. This is a **security** invariant (NFR-10) with two compliant implementations, in a spine that otherwise gets confinement exactly right by placing both checks in one adapter with no opt-out.

**FR-74** then requires a state AD-10 cannot express: `story_location` "may point outside the project tree — `/custom/stories` is an explicitly tested value. The tool resolves it, and **where it falls outside the artifact tree it reports that fact without serving content from there**." AD-10 produces a rejection; AD-7's typed degradation covers artifacts that "cannot be parsed or identified", which an out-of-confinement path is not. So the required outcome — visible, named, deliberately unserved — falls between the two ADs, and units will split between dropping it silently (violating FR-74) and throwing (violating AD-7).

### F-11 — AD-3's refresh lifecycle and the whole of AD-11 rest on requirements the PRD defers to C7 [MEDIUM]

AD-11 is FR-47 restated, and AD-3's lifecycle clause — "A refresh replaces the snapshot and its content cache together, so refresh has exactly one meaning" — presupposes FR-37. Both FRs sit under **C7 — Live threads**, which the PRD defers: §6 counts "12 requirements" deferred across C7–C9, and C7's list is FR-35, FR-36, FR-48, **FR-37, FR-47**. The 57-requirement v1 count excludes them.

The memlog treats both as v1: "user-initiated refresh, no filesystem watching (FR-37)" appears as an INHERITED constraint, and FR-47 is worked as an open question and resolved by Jamie. So the memlog and the PRD disagree about the release boundary, and the spine followed the memlog without recording that it did.

Practical consequence for the level below: the ADs bind AD-11 to C3/C4/C5, so the currency check gets built — but the *refresh mechanism itself* belongs to a group nobody is building in v1. AD-11's rule ends "A mismatch is surfaced with an offer to refresh", and AD-3's snapshot is replaced only by a refresh. If no v1 epic owns FR-37, the snapshot is immortal for the life of the process and AD-11 offers an action that does not exist. Either the PRD moves FR-37/FR-47 into C1/C3, or the spine records that it is binding two deferred requirements and why.

### F-12 — NFR-6's fail-loudly guard has no home and sits against AD-7 [MEDIUM]

**NFR-6**: "Status vocabularies are currently defined in YAML *comments* in `sprint-status-template.yaml`; extraction from such sources **must fail loudly on change** rather than silently return nothing." The addendum confirms this is v1-relevant, not C9-only — the sprint viewer (FR-23, C4) renders "epic and story state, including retrospective status", which is that vocabulary.

Two problems. The spine has no rule for detecting *change* in an unstable source — a canary, a shape assertion, a pinned expectation — and the dimension of BMAD-version tolerance (NFR-5, NFR-6) appears nowhere as decided, deferred, or open. And "fail loudly" reads against AD-7's "never an exception that aborts the pass". They are reconcilable — a typed value that every view renders explicitly *is* loud — but the spine never says so, and a unit reading NFR-6 literally will throw.

### F-13 — Four v1 requirements have no placement [LOW]

- **FR-60** (side-by-side comparison of two user-nominated artifacts) is C6, and the Capability map places all of C6 at "`src/domain/` over the snapshot; AD-8" — which is not where a two-pane view lives. The memlog listed "side-by-side selection" as client interaction under the rendering-boundary decision; the spine dropped that example when it became AD-2.
- **FR-24** (copy-path and open-in-editor on every viewer) — see F-5; open-in-editor is the second process-spawning side effect with no layer.
- **FR-4** (automatic port selection, URL on stdout) — the Conventions table covers the stdout half ("stdout carries only the served URL and progress"); port selection and its collision behaviour are unmentioned. Benign as a single-unit concern, noted because it interacts with FR-7's promise that the tool always serves something.
- **Packaging.** The memlog records as ADOPTED that "prebuilt assets shipped in the npm package so npx never builds", and the spine carries it only as a layer-table gloss ("Client interaction — built, shipped prebuilt") and a tree comment. For an FR-45 `npx`-distributed tool this is a shipping invariant — no build step, no postinstall, `public/` is a build output that must be committed or packed — and it is the kind of thing that erodes silently.

---

## Item 6 — Is every dimension the feature altitude owns decided, deferred, or an open question?

**Verdict: thin.** The spine deserves credit for treating the envelope as a dimension at all (AD-12, and the memlog's explicit "Recorded explicitly so the dimension is decided rather than silent"). But AD-12 covers process lifetime, persistence, outbound network and bind address, and stops there. Three dimensions are wholly silent.

| Dimension | Status in spine |
|---|---|
| Domain model, identity, ordering, degradation | Decided — AD-4, AD-5, AD-6, AD-7 (strong) |
| Read/caching model | Decided but self-contradictory — AD-3 vs AD-8 (F-1) |
| Layering and dependency direction | Decided — layer table + graph (strong) |
| Filesystem security, traversal, sanitization | Decided, one term ambiguous — AD-10 (F-10) |
| Process/persistence/outbound/bind envelope | Decided — AD-12 |
| Error and logging model | Decided — Conventions |
| Performance | Partially — AD-3 states the shape; no budget for NFR-16, the binding one |
| **Inbound request trust (local server)** | **Silent — F-14** |
| **Accessibility (NFR-14, NFR-15)** | **Silent — F-7** |
| **Platform portability (NFR-12, NFR-13)** | **Silent — F-2** |
| BMAD version tolerance (NFR-5, NFR-6) | Silent — F-12 |
| URL / permalink grammar | Deferred, incorrectly — F-6 |

### F-14 — Inbound trust for the loopback server is undecided [HIGH]

AD-12 is entirely outbound-facing:

> makes **no outbound network request** of any kind, and binds the literal address `127.0.0.1` and no other interface

Nothing addresses what may talk *to* it. A local HTTP server that reads a user's entire project tree and serves it without authentication is reachable by any web page open in the same browser: origins can probe `127.0.0.1` across the port range, and DNS rebinding defeats same-origin entirely for a server that checks neither `Host` nor `Origin`. FR-4's automatic port selection narrows the port but does not close it — a scan is cheap.

The PRD states the limit it *did* consider — NFR-9's "on a shared machine, other local users and processes can still reach a loopback port" — and accepts it. That is a different exposure from browser-origin exposure, and the PRD does not accept the second one because it does not raise it. The spine is the right place for the decision, and it is exactly spine-shaped: a `Host`/`Origin` check, or a token in the served URL, is an invariant every route must apply or none, which is what AD-10 already demonstrates for path confinement. As it stands, some routes will get it and some will not, or none will.

Not marked critical because the blast radius is a read-only local tool and the mitigation is small. Marked high because it is a security dimension the spine is silent on, in a product whose entire promise is safety around the user's project, and because retrofitting a trust check across an already-built route surface is precisely the retrofit a spine exists to avoid.

---

## Findings index

| ID | Severity | Item(s) | Summary |
|---|---|---|---|
| F-1 | Critical | 1, 5 | AD-3's structure-only snapshot cannot serve AD-8/C6's content-level signals; the FR-28 conflict was resolved for search and never re-checked for oversight |
| F-2 | High | 1, 6 | "Keyed by its resolved absolute path" under-specified; platform dimension (NFR-12) silent |
| F-4 | High | 2 | AD-5 records the timezone assumption instead of fixing it; two units can diverge while both complying |
| F-5 | High | 2, 5 | AD-1 gates `node:fs` only; `node:child_process` is an unguarded write path, and browser/editor launch has no layer |
| F-6 | High | 3, 5 | Deferring URL grammar defers the C4/C5/FR-27/FR-77 identity contract; AD-10's sanitizer has no collision rule |
| F-7 | High | 3, 6 | Deferring styling and per-viewer markup defers NFR-14/NFR-15 across independently-built viewers; accessibility is a silent dimension |
| F-10 | High | 5 | AD-10's "the artifact root" is singular against AD-9's plural roots; FR-74's report-but-don't-serve state falls between AD-10 and AD-7 |
| F-14 | High | 6 | Inbound request trust for the 127.0.0.1 server is undecided |
| F-3 | Medium | 1 | No signal vocabulary behind AD-8's "per signal"; FR-56's silence discipline has no rule |
| F-9 | Medium | 4 | markdown-it 14.x (latest 15.0.1) and esbuild 0.25.x (latest 0.28.2) stale at authoring; Node 24 leaves Active LTS Oct 2026; 5 of 8 rows have no verification trail |
| F-11 | Medium | 5 | AD-11 and AD-3's refresh lifecycle rest on FR-37/FR-47, which the PRD assigns to deferred C7 |
| F-12 | Medium | 5, 6 | NFR-6's fail-loudly guard has no home and reads against AD-7 |
| F-8 | Low | 3 | Deferred snapshot representation is the shared data contract, though heavily constrained by AD-4–AD-8; NFR-3 makes concurrency a consistency question |
| F-13a | Low | 5 | FR-60 side-by-side has no placement |
| F-13b | Low | 5 | FR-4 port selection unmentioned |
| F-13c | Low | 5 | "npx never builds" is ADOPTED in the memlog but survives in the spine only as a table gloss |

## Suggested order of work

1. **F-1** — decide the C6 read model. Everything else is smaller than this, and it may change AD-3's wording.
2. **F-4, F-5, F-10** — three one-clause repairs to existing ADs (fix the assumed zone; extend AD-1's gate to the process surface and fix the assertion's wording; define the confinement set and FR-74's third state).
3. **F-6, F-7, F-14** — three additions the spine currently lacks: a URL/anchor identity rule, an accessibility contract, an inbound-trust rule. Each is genuinely spine-shaped, each is one AD.
4. **F-2, F-3, F-9, F-11, F-12** — canonicalization authority, signal vocabulary, version bumps, release-boundary reconciliation with the PRD, unstable-source guard.
