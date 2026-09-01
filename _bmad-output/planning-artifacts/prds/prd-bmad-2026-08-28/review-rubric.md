# PRD Quality Review — BMAD Dashboard CLI

## Overall verdict

This is an unusually honest PRD. Its reasoning is real: §2.2's four framing decisions each name what was given up, UJ-2 Part B openly concedes the tool **"cannot verify that a requirement propagated"**, §5 rejects a counter-metric with an argument rather than adopting it for form, and §8 records the BMAD gaps that cap what any such tool can do. Claims are measured, not asserted — "6 of 49", "3 of 49", "49/49". Almost nothing here is furniture.

What is at risk is buildability, not thinking. Sixty-five FRs arrive flat, with no MVP cut and no priority order, so a decision-maker cannot tell what the first release contains — and §2.1's "secondary job" is quietly deferred to §9. The three mechanisms the product actually turns on — recognizing artifacts by content (FR-8), deciding when an absence is a finding (FR-55), and avoiding false alarms (FR-56) — are stated as intentions with no operational rule, and the requirement the PRD itself calls "the binding performance requirement" (NFR-16) carries no number. Layer on the framing context — a public OSS launch — and the PRD is shaped for an audience of one.

## Decision-readiness — adequate

The PRD makes decisions and says so. §2.2 states four of them as decisions ("Read-only is an invariant, not a default"), each with the cost attached: no filesystem watching (FR-37) buys freshness ambiguity, paid for by FR-47; no telemetry (§5) buys trust, paid for by "no passive usage data, and Stage 1 feedback must be gathered by asking"; no git (§10) buys BMAD-native purity, paid for by FR-61. §10 resolves the git question inline with "**resolved: no.** ... Consequence accepted and mitigated by FR-61". A reader pushing back on read-only, on stage-detection, or on the absence of correctness-judging will find their objection already stated and answered — §2.3 in particular pre-empts the obvious "why doesn't it just detect hallucinations" with a real reason (a different product, "with its own accuracy, cost and trust characteristics").

What a decision-maker cannot do is act. §6 delivers nine capability groups and sixty-five FRs at uniform weight. Nothing in the document says which of them constitute a first release. §9 uses the phrase "The v1 requirements" as though a v1 boundary had been drawn, but no section draws it — the only reasonable reading is that v1 is all sixty-five, which is not credible for a tool whose success gate is "colleagues using the tool on real projects". C5's four FRs and C9's four FRs are not obviously the same release as C6's fourteen.

The second gap is §10's last entry. `npx` distribution (FR-45) is the *only* distribution mechanism the PRD names, and the PRD itself observes that "BMAD's own tooling is Python via `uv`, so a BMAD user does not necessarily have Node" — then closes with "Impact on adoption unassessed." That is the reach of the product being unknown, recorded as a bullet.

Finally, for a document with this many live tensions, there are zero `[NOTE FOR PM]` callouts. The PRD references that marker five times as subject matter and uses it never. At least three places warrant one: the v1 boundary, the Node runtime question, and the mtime-after-pull conflict between FR-14/FR-15 and UJ-3.

### Findings

- **critical** No release boundary across 65 FRs (§6, §9) — There is no MVP cut, no phasing, and no priority order; C1–C9 read at uniform weight, and §9's "The v1 requirements" refers to a scope no section defines. Downstream sprint planning has nothing to slice against. *Fix:* Add a short "v1 scope" subsection to §6 naming which capability groups (and which FRs within C6) ship first, with the scope-kind logic — this is a problem-solving MVP, so the cut should follow the oversight thesis: C1 + C2 + C3 + C6 minimum, C5/C9 as candidates to defer.
- **high** The sole distribution channel may not reach the audience (§10 "Node runtime availability", FR-45) — "Impact on adoption unassessed" is not a resolution for a public launch whose users are, by the PRD's own observation, Python/`uv` users. *Fix:* Resolve it — either accept Node as a stated prerequisite with a one-line install path, or record a `[NOTE FOR PM]` with the alternative packaging options and the cost of each. Do not ship this as an open bullet.
- **medium** No `[NOTE FOR PM]` callouts anywhere (whole document) — The tensions exist and are even described in prose; they are just not marked, so a reader skimming for unresolved decisions finds none. *Fix:* Mark the v1 boundary, the Node question, and the FR-14/UJ-3 mtime conflict.

## Substance over theater — strong

Very little here is decoration. **No persona theater**: §3 has one role and two postures, and explicitly refuses to inflate them — "The two postures are the same person at different times, which is why they share one interface." The secondary posture then does real work, producing C9 rather than sitting unused.

**No vision theater**: §2's vision could not swap into another PRD. "exercise judgement over machine-generated work" and "The tool observes and never writes" are specific to this product, and §2.1 goes further than most PRDs by distinguishing the primary job from the structure that serves it — "live threads are the *structure*, not the *purpose*".

**No NFR theater**, which is rare. NFR-3 names the actual concurrency hazard ("BMAD agents write these files while the tool reads them"). NFR-6 names a specific fragility with its source ("Status vocabularies are currently defined in YAML *comments*"). NFR-13 enumerates the environments that matter ("SSH sessions, containers, WSL, headless CI"). NFR-15 justifies itself against a product fact ("relevant given status and severity are colour-coded"). Even NFR-7 earns its hedge by explaining why cold start is *not* the binding constraint.

**No innovation theater**: there is no differentiation section, because Discovery evidently did not surface a differentiation claim. That restraint is correct. §2.3's "A known limitation, measured" is the opposite of theater — a section whose only function is to reduce the PRD's own apparent capability.

The one soft spot is an evidentiary one rather than a rhetorical one.

### Findings

- **low** The ~24,000-word figure is hearsay but load-bearing (§1, FR-25, NFR-8) — It appears three times, each hedged as "reported to reach", and it justifies an entire capability group (C5) plus a performance NFR. *Fix:* Measure the largest spec in a real project and state the number, or restate C5's justification in terms that do not depend on one unverified figure.

## Strategic coherence — adequate

The thesis is stated and it is a good one: **surface the risk surface, do not judge correctness** (§2.1, §2.3). It is genuinely load-bearing — it produces FR-56, FR-59's "may predate" phrasing, FR-64's refusal to assert conflicts, and UJ-2's decision to place artifacts side by side rather than diff them. The success gate validates the thesis rather than measuring activity: "colleagues... report that it surfaced something they would otherwise have missed. Absent that, the primary job is unproven regardless of adoption" — that last clause is the correct instinct, explicitly disqualifying adoption as a proxy.

Two things break the arc.

First, §2.1 names two jobs — oversight primary, **corpus navigation secondary** — and states that corpus navigation "makes completed and historical runs first-class subjects, not merely archived state." §9 then defers "Archaeologist mode... Browsing old runs as a corpus — examples of good practice, cautionary tales, comparing successive attempts at the same artifact" as future scope. That is the secondary job, described in almost the same words. What remains in v1 is C8's three FRs: runs are "browsable" and "presented as a series". A reader of §2.1 would reasonably expect the secondary job to ship; it does not, and §2.1 never says so.

Second, FR-56 declares false alarms "a first-order failure" — "a signal the user learns to dismiss is worse than no signal" — and §5 measures nothing about it. There is no gate, no qualitative question to colleagues, no counter-metric. §5's discussion of counter-metrics is entirely about the time-in-dashboard candidate it rejected; having rejected that one, it adopts none. The PRD's own named failure mode is unobserved. The rejection of the time-based metric is right; the conclusion "No time-based counter-metric is adopted" quietly became "no counter-metric is adopted."

Prioritization also does not follow the thesis. C6 is annotated "The primary job" and then sits as the sixth of nine equal-weight groups.

### Findings

- **high** The stated secondary job is deferred without saying so (§2.1 vs §9) — §2.1 elevates corpus navigation to a job of the product; §9 defers the experience that delivers it. v1 keeps the data reachable (C8) but not the job. *Fix:* Either say in §2.1 that corpus navigation is v1-partial — data reachable, experience deferred — or move the relevant Archaeologist-mode capability into C8.
- **high** The PRD's own first-order failure mode is unmeasured (FR-56 vs §5) — False alarms are named as the thing that kills the product, and §5 adopts no counter-metric or gate for them after rejecting the time-based candidate. *Fix:* Add a qualitative counter-gate to §5 — e.g. colleagues report dismissing surfaced signals as noise more often than acting on them — so Stage 1 feedback is instrumented against the failure the PRD fears most.
- **medium** Capability groups carry no priority signal (§6) — Nine groups presented flat; the group labelled "The primary job" is indistinguishable in weight from C1. *Fix:* Order or annotate the groups by their relation to the thesis, and fold this into the v1 cut.
- **low** No alternative to a dashboard is considered (§1, §2) — The problem statement is strong, but the PRD never asks why the answer is a served web UI rather than, say, a terminal summary command. For a public launch the "why this shape" question will be asked. *Fix:* One paragraph in §2 naming the alternatives weighed and why a browser view won (large-document navigation and side-by-side comparison are plausible reasons already latent in C5/FR-60).

## Done-ness clarity — thin

Parts of §6 are exemplary. FR-14 gives a four-tier ordering hierarchy an engineer can implement verbatim. FR-31 states its own honesty constraint with numbers attached. FR-54 specifies the visual treatment of absence concretely — "greyed and non-attracting". FR-59 fixes the exact phrasing ("may predate" rather than "is inconsistent"). NFR-1 says "verified by test, not a convention". NFR-15 names a standard and a version.

But the requirements the product most depends on are principles, not specifications, and they are the ones an engineer will hit first.

**FR-8** is the foundation of C2 and it is a policy without a mechanism: "Artifacts are identified by reading their content and structure, not by filename pattern." Nothing states what content identifies a PRD versus an architecture versus a spec — frontmatter keys? heading signatures? the run-folder's own name? FR-7 depends on this (it must decide "no recognizable BMAD project" and report "what it looked for"), as do FR-11's seven families, FR-12's uninterpreted fallback, and FR-52's core set. There is no testable consequence anywhere for the recognizer.

**FR-55** is the crux of the anti-false-alarm design and is equally unbounded: absence is elevated "only... when something else on disk implies the missing artifact should exist." The PRD then quotes BMAD's rule — "a missing document type is only a finding if stories depend on decisions nothing records" — which is itself a judgement, and §2.3 has already said the tool does not make judgements. Nothing says how "stories depend on decisions nothing records" is computed. An engineer will either invent the rule or, more likely, elevate nothing.

**FR-56** is a principle with no test: "risk indication must err toward silence over noise." There is no precision floor, no cap on signals per view, no dismissal mechanism.

**NFR-16** is the sharpest instance. The PRD correctly identifies refresh latency as "the binding performance requirement, being paid repeatedly within a session" — then gives it an adjective ("fast enough that refreshing is not a decision the user weighs"), while NFR-7, explicitly labelled "**Aspirational, not a release gate**", is the one carrying a number ("under two seconds"). The requirement that binds has no bound; the one that does not bind does.

**FR-61** promises more than its stated mechanism supports. It records "when each project was last viewed" — a timestamp — and from that presents "changed since you last looked". But changed *relative to what*? FR-14 has just established that the change signals themselves are ranked by unreliability, and UJ-3 states that after a `git pull` mtime is "actively misleading rather than merely imprecise". A last-viewed timestamp compared against untrustworthy per-artifact timestamps does not yield a trustworthy diff. UJ-3 leans on FR-61 to recover "the exactness git would have provided"; as specified, it cannot.

Remaining adjective FRs: FR-29 "surfaced prominently", FR-41 "Unobtrusive inline affordances", FR-18 "a viewer designed for its shape" (rescued only because FR-19–23 enumerate the viewers), FR-63/65 "high-confidence candidates" with no definition of high confidence, NFR-8 "without perceptible delay".

### Findings

- **critical** Artifact recognition has no rule (FR-8, and FR-7 / FR-11 / FR-12 / FR-52 depend on it) — "reading their content and structure" states a policy and specifies no mechanism or test. This is the first thing the tool does and the thing everything else reads from. *Fix:* State the recognition inputs in priority order (frontmatter `title`/`status`, run-folder family name, heading signature, `_bmad/bmm/config.yaml` roots per FR-10) and give FR-8 at least one testable consequence — e.g. the three filename variants it already lists must all resolve to "PRD".
- **high** FR-55's elevation rule is unimplementable as written (FR-55, FR-32) — "something else on disk implies the missing artifact should exist" reduces to a judgement the tool has forsworn (§2.3). *Fix:* Enumerate the concrete on-disk implications that count — e.g. `sprint-status.yaml` references an epic file that does not exist; a `source:`/`inputs:` frontmatter entry points at a missing document — and say that nothing outside the enumerated set elevates absence.
- **high** The binding performance requirement has no number (NFR-16 vs NFR-7) — The aspirational NFR carries "under two seconds"; the one declared binding carries an adjective. *Fix:* Give NFR-16 a target and a corpus to measure it on (e.g. refresh under 300 ms on a project with N artifacts / M total words), and say whether it is a release gate.
- **high** FR-61's "changed since you last looked" is not supported by a last-viewed timestamp (FR-61, FR-14, UJ-3) — The comparison basis is exactly the signal set the PRD has just declared unreliable, in exactly the scenario (post-`git pull`) where it is worst. *Fix:* Specify what the tool records at view time — content hashes or a per-artifact fingerprint, not just a timestamp — or narrow FR-61's claim to "activity recorded since you last looked" and say it inherits FR-14's confidence tiers.
- **medium** Technology-divergence extraction has no precision floor (FR-63, FR-65) — "high-confidence candidates" is undefined, and FR-65 disclaims recall, so the feature is bounded on neither axis. *Fix:* Define the pattern classes that count as high-confidence (e.g. `name` + semver-shaped token adjacent, in a table cell or a fenced block) and state that free-prose mentions such as "the latest React" are out of scope.
- **medium** Adjective requirements at load-bearing points (FR-29 "prominently", FR-41 "Unobtrusive", NFR-8 "without perceptible delay", FR-18 "designed for its shape") — Each will be resolved by whoever implements it. *Fix:* FR-29 and FR-41 belong with a UX spec reference; NFR-8 needs a millisecond target on the ~24,000-word document it names.
- **medium** FR-24's open-in-editor is unspecified across three platforms (FR-24, NFR-12) — Editor resolution, and its behaviour when none is configured, is undefined on Linux/macOS/Windows. *Fix:* Name the resolution order ($VISUAL/$EDITOR, then a platform default) and the failure behaviour — which, given FR-7's precedent, should be visible rather than silent.
- **medium** UJ-3 and FR-15 disagree about mtime (UJ-3, FR-14, FR-15) — UJ-3 says post-pull mtime is "actively misleading"; FR-14 still admits it as a fallback and FR-15 only labels its confidence. A label does not neutralise a misleading ordering. *Fix:* State what the tool does when mtimes cluster implausibly (the post-pull signature) — suppress mtime-derived ordering entirely, or present those entries unordered.
- **low** NFR-5 has no version range and the PRD never states its baseline (NFR-5) — The addendum records "BMAD v6.11.0" but §7 does not. *Fix:* State the developed-against version in NFR-5 and, if known, the floor below which behaviour is untested.

## Scope honesty — adequate

In prose, this dimension is a strength. §2.3 is a dedicated scope boundary that explicitly exists "to prevent downstream over-promise" and does real work: it names what is in, what is out, *and* volunteers a limitation nobody asked for ("A known limitation, measured"). UJ-2 splits itself into "Serviceable" and "Only partly serviceable" and states flatly that "The PRD must not pretend otherwise." §9 records deferrals with reasons rather than dropping them. §5 states an accepted cost. FR-40 bounds scope to the target project. De-scoping is proposed openly throughout, never done silently.

The failure is mechanical and, given the subject matter, conspicuous: **the PRD carries zero `[ASSUMPTION]` tags and has no Assumptions Index.** It discusses `[ASSUMPTION]` twelve times — as a BMAD marker convention, as FR-30's surfacing target, as §2.3's measured blind spot — and tags none of its own. Inferences that a reader would want tagged and that the user did not directly confirm include: that `_bmad/bmm/config.yaml` is where artifact roots live (FR-10); that `story_location` is present in `sprint-status.yaml` (FR-51); that seven is the complete set of run-folder families (FR-11); that the ~24,000-word figure is representative (FR-25, NFR-8); that runtime derivation is the right glossary strategy (addendum's "Recommended instead", surfaced into FR-42/43 as settled); and that Node is available (§10, flagged as a question rather than tagged as an assumption).

There is also no consolidated Non-Goals section. §2.3, §9 and FR-40 collectively cover the big omissions, but a reader must assemble them, and a few omissions are never stated at all — there is no posture on access control (NFR-9 binds loopback, but nothing says that any local process or user can therefore read the project through the dashboard), and no statement that export/share/screenshot is out of scope, despite the addendum forward-referencing "any future export, share or screenshot feature" as though such a feature were contemplated.

Open-items density is low: three genuinely open questions and one resolved, against sixty-five FRs. For a green-light-to-build PRD that would be reassuring — except that the PRD has not been given a build boundary, and one of the three open items is whether the distribution channel works at all. The document reads more settled than its own §10 supports.

### Findings

- **high** No `[ASSUMPTION]` tags and no Assumptions Index (whole document) — On a PRD whose product thesis is that unmarked assumptions are the risk surface, its own inferences are unmarked. Downstream cannot tell FR-10, FR-11 and FR-51 (inferred from one repo's layout) apart from FR-1–FR-6 (directly specified). *Fix:* Tag the inferences named above inline and add an Assumptions Index section; FR-11's "seven families" and FR-51's `story_location` in particular are load-bearing on one observed install.
- **medium** No consolidated Non-Goals section (§2.3, §9, FR-40 scattered) — The omissions are real but distributed, and two are absent entirely: the access-control posture implied by NFR-9, and export/share/screenshot, which the addendum forward-references. *Fix:* Add a Non-Goals section that gathers the existing exclusions and adds `[NON-GOAL for MVP]` lines for remote/multi-user access and for export/share.
- **low** Settled tone outruns the open items (§10) — Three open questions on a 65-FR PRD reads as near-final, while one of them (Node availability) is unresolved at the distribution layer. *Fix:* Nothing to add to §10 itself; resolving the Node item and adding the assumption tags corrects the impression.

## Downstream usability — adequate

This is a chain-top PRD — it feeds UX, architecture and story creation inside BMAD — so traceability matters here more than it would for a standalone document.

The ID hygiene is clean. FR-1 through FR-65 are all present, each defined exactly once, with no gaps or duplicates; NFR-1 through NFR-16 likewise. §6's policy statement — "FR IDs are global and stable; renumbering is not permitted once assigned" — is the right rule and explains why C2 reads 8, 9, 10, 51, 11, 12, 49, 50. Cross-references resolve (FR-56 from UJ-2, §8 from FR-48, C3 from UJ-1), with one exception noted in Mechanical notes. Sections largely stand alone: FR-49 and FR-55 restate their own justifications rather than pointing "see above".

Two gaps.

**There is no Glossary section.** The PRD's domain nouns are BMAD jargon carrying meaning a UX or architecture consumer must get exactly right — *memlog*, *run folder*, *artifact family*, *live thread*, *core artifact*, *risk surface*, *sharded*, *override entry*, *thread of work*. None is defined. This is the same PRD that specifies FR-41–FR-44 to build precisely this facility for its users; withholding it from its own readers is a self-inflicted wound. The two occurrences of "glossary" in §6/§2.2 both refer to the product feature, not to a section of this document.

**Success Metrics have no IDs and no extractable definitions.** §5 is three paragraphs of prose. The gate — "colleagues using the tool on real projects report that it surfaced something they would otherwise have missed" — is a real, checkable condition, but it is unlabelled, so nothing downstream can reference it and no FR traces to it. UJs and FRs are traceable; SMs are not.

UJ protagonists are named and consistent: Jamie carries all three, and §4 states the constraint honestly ("the tool is not yet designed for anyone whose workflow differs materially"). No floating UJs.

### Findings

- **high** No Glossary section (whole document; contrast C9) — BMAD-specific nouns used throughout are undefined for downstream consumers, and terminology is already drifting slightly as a result. *Fix:* Add a Glossary defining at minimum memlog, run folder, artifact family, live thread, core artifact, risk surface, sharded, and override entry — and use those exact strings in FRs.
- **medium** Success Metrics are unlabelled and untraceable (§5) — No SM IDs, so the distribution gate cannot be cross-referenced from FRs or from downstream stories. *Fix:* Give the gate and the telemetry decision SM IDs, and add the FR-56 counter-gate from the Strategic coherence finding as a third.
- **low** FR ordering within capability groups is non-monotonic (C2, C3, C6) — Correct per the stable-ID policy, but it makes visual completeness-checking hard for a human reader. *Fix:* Optional — a per-group FR list in ID order at the top of §6, or accept the cost as the price of stable IDs.

## Shape fit — adequate

For a single-operator internal tool, the PRD's instincts are right. It resists over-formalization: two postures instead of four personas, three UJs instead of a dozen, operational rather than user-funnel success signals. And critically, the UJs are **not** overhead here — each one produces a finding rather than narrative. UJ-2 is where the correlation-identity gap surfaces (§8's "most consequential gap"). UJ-3 is where the post-`git pull` mtime problem surfaces and where FR-14's hierarchy is shown to be load-bearing. UJ-1 justifies FR-37's user-initiated refresh. That is UJs earning their place in a shape where they often do not; no finding against them.

The mismatch is with the framing this PRD is being written under: a **public OSS launch**. Nothing in the document reflects that. §3 serves one role; §4 names one protagonist and says the tool "is not yet designed for anyone whose workflow differs materially"; §5's measuring instrument is "colleagues"; §8's only mention of a community concerns contributing *upstream to BMAD*, not this project's own users. There is no licence, no README or docs requirement, no issue-triage or support posture, no compatibility policy beyond NFR-5's untargeted tolerance, no versioning statement, and — per the Decision-readiness finding — an unassessed runtime prerequisite for the sole distribution channel.

This is a solvable framing problem, and it may even be the right product decision: "public availability is not a v1 goal; the first release goes to colleagues" is a legitimate stance, and §5 nearly says it. But the PRD must state which shape it is in. As written, a reader told this is a public-launch PRD will find a personal-tool PRD, and the gaps will read as oversights rather than as choices.

### Findings

- **high** Shaped as a personal tool, framed as a public launch (§3, §4, §5, §8) — No licensing, docs, support, contribution, versioning or compatibility-policy requirements; success is measured by colleague feedback and the audience is one named person. *Fix:* Pick the shape explicitly. Either state in §5 that public distribution is gated behind the Stage 1 gate and is a non-goal for v1, or add a capability group covering the launch surface (licence, README/quickstart, BMAD version-compatibility statement, issue intake) and widen §3 beyond the single practitioner.

## Mechanical notes

- **Broken cross-reference.** NFR-11 ends "(§4)" — §4 is User Journeys. The telemetry decision is in §5 (Success Metrics). Should read "(§5)".
- **Glossary drift — family.** FR-11 says "run-folder families"; FR-17, FR-39 and FR-48 say "artifact family". If these are the same set, use one term; if FR-11's seven are a subset of what FR-17 filters by, say so.
- **Glossary drift — thread / strand.** C7 is titled "Live threads" and §2.2 says "Live threads are the organizing structure"; FR-35 says "concurrently active strands of work"; FR-48 says "a thread of work". Three terms, one concept.
- **Term reuse against a framing decision — stage.** §2.2 argues at length that "There is no 'current stage'", and UJ-1 is titled "Verifying a completed stage" and opens "A BMAD stage has just finished." The reconciliation is implicit and defensible — the user knows a stage finished because they ran it; the *tool* never computes one — but it is not stated, and it is the PRD's most quotable framing decision being immediately contradicted in the primary UJ. One clause in UJ-1 fixes it.
- **Addendum forward-reference to an unlisted feature.** The addendum's Consequences section mentions "any future export, share or screenshot feature". No such feature appears in §9 Future scope or anywhere in §6. Either add it to §9 or reword the addendum.
- **Version baseline not in the PRD.** The addendum states "Tested against the BMAD v6.11.0 install in this repository"; NFR-5 refers to "the one it was developed against" without naming it.
- **ID continuity — clean.** FR-1…FR-65 all defined exactly once, no gaps, no duplicates. NFR-1…NFR-16 likewise. All inline FR references resolve to a defined FR. Section references resolve (§2.2, §2.3, §8, §10) apart from the NFR-11 case above.
- **Assumptions Index roundtrip — not applicable.** No inline `[ASSUMPTION]` tags and no index; see the Scope honesty finding.
- **UJ protagonists — clean.** All three UJs name Jamie inline and carry their context locally.
- **Missing sections for this shape.** Glossary (see Downstream usability), Non-Goals (see Scope honesty), Assumptions Index (see Scope honesty), v1/MVP scope (see Decision-readiness).
