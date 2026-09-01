---
title: Adversarial review — BMAD Dashboard CLI PRD
target: prd.md (65 FR / 16 NFR), addendum.md, .memlog.md
reviewer: adversarial lens
date: 2026-08-28
posture: hostile by design — this document looks for what is wrong, not what is right
---

# Adversarial review — BMAD Dashboard CLI PRD

## Verdict

**Do not build against this PRD as written.** Not because the product is a bad idea, but because the
PRD's four load-bearing empirical claims are wrong against the very BMAD install it was measured on,
and the two most consequential ones are wrong *in the direction that flatters the tool*.

The PRD's distinctive virtue is that it measures its own limits and refuses to over-promise. That
virtue is what makes the errors severe: this document's credibility rests entirely on the accuracy of
a handful of counts and one claim about how the memlog works. I checked all of them. The counts are
miscounted, the memlog claim is contradicted by the memlog script's own docstring, the primary
oversight signal (`--type assumption`) is emitted by **zero** of the 49 installed skills, and the
justification for excluding git is factually false — BMAD ships a git-evidence script.

Strip out what the source does not support, and the honest v1 is: **a good markdown browser with a
table of contents, full-text search, and a recency feed whose ordering cannot be computed.** That may
still be worth building. It is not what §2 promises, and the gap between §2 and §6 is where the
self-deception lives.

Severity scale: **S1** = a load-bearing claim is false or a specified capability cannot be built as
specified. **S2** = the product logic is unsound or undeliverable at stated scope. **S3** = internal
contradiction, unfalsifiable claim, or misallocation.

---

## S1 — Fatal: load-bearing claims that are false against the source

### S1-1. FR-14's top-ranked activity source emits no timestamps. C3 cannot be built as specified.

**Location:** FR-13, FR-14, FR-15 (§6 C3); UJ-3 implications (§4); memlog "reliable ledger" claim (§8).

FR-14 establishes a reliability hierarchy: "`.memlog.md` entries first, then frontmatter `updated`,
then run-folder date, with filesystem mtime used only where nothing better exists." FR-13 requires "a
chronological list of recent project activity." FR-15 requires each entry to display "the confidence
of its own timestamp."

`_bmad/scripts/memlog.py`, `cmd_append`, writes exactly this:

```python
entry = f"- {tag}{text}"
body = (body.rstrip("\n") + "\n" + entry) if body.strip() else entry
```

**A memlog entry carries no timestamp.** None. The only time value in the file is frontmatter
`updated`, and `touch()` *overwrites* it on every single append, at minute resolution
(`"%Y-%m-%dT%H:%M"`).

Three consequences, each independently fatal to C3 as written:

1. **Tier 1 and tier 2 of the FR-14 hierarchy are the same signal.** A memlog contributes exactly one
   datum — a frontmatter `updated:` field — which is precisely what tier 2 is. The four-tier hierarchy
   is three tiers with the top two collapsed. The PRD's most-cited structural device is an illusion.
2. **Entries cannot be placed on a timeline.** You can recover *order within one memlog* and nothing
   else. You cannot interleave two memlogs, cannot date an individual `(override)` entry, cannot
   answer "what happened Tuesday." FR-13's chronological feed of *activity entries* is unbuildable
   from its top-ranked source.
3. **The one timestamp you do get is the wrong one.** `updated` tells you when the run *last wrote* —
   so a 60-entry memlog from a three-hour session presents as one instant. FR-15's "confidence of its
   own timestamp" has no honest value to display here: the confidence is not "high", it is
   "this is the batch's last-write time, applied to entries that may be hours older."

Minute resolution compounds it: UJ-1 is explicitly about the window immediately after a stage
finishes, which is exactly the window where minute-resolution ties are unresolvable.

UJ-3 states the stakes plainly: "Git history is deliberately not consulted (§10, resolved), so the
FR-14 hierarchy carries this journey alone." The hierarchy cannot carry it. It cannot carry anything.

### S1-2. FR-29's rationale is contradicted by memlog.py, and its two named entry types are emitted by 1 and 0 skills respectively.

**Location:** FR-29 (§6 C6); §2.3 "above all memlog entries of type `assumption` and `override`"; §8
"the memlog is the more reliable signal because it is written through a shared script rather than by
convention"; FR-19.

This is the keystone of the primary job. FR-29: memlog `override` and `assumption` entries are "the
highest-reliability oversight signal, **being script-written rather than convention-dependent**."

`memlog.py`'s own docstring, twice:

> "The host skill supplies the vocabulary by how it calls `append` — **the tool stays neutral**."
>
> "**The host skill names the vocabulary; the script does not enforce one.**"

There is no type validation anywhere in the script. `--type` is a free-text string interpolated into
a tag. **Memlog entry types are exactly as convention-dependent as `[ASSUMPTION]` is.** The PRD has
confused *format* reliability (real: atomic write, append-only, guaranteed line shape) with
*semantic* reliability (absent: the vocabulary is unenforced). It then built the tool's primary
signal on the half that does not exist.

The empirical position is worse than the argument. Across all 49 installed skills:

| Signal | Emitting skills | Note |
|---|---|---|
| `--type assumption` | **0** | Does not appear anywhere in the shipped corpus |
| `--type override` | **1** | `bmad-product-brief`, headless path only |
| `[ASSUMPTION]` marker | 4 | prd, architecture, product-brief, ux |
| Skills that init a memlog at all | 8 | planning-side only |

So the PRD disparages `[ASSUMPTION]` for thin coverage (4 skills) and elevates, "above all", two
memlog types with coverage of **one skill and zero skills**. It picked the *worse*-covered signal as
primary and justified the choice with a property the source code explicitly disclaims.

Note also which 8 skills write memlogs: architecture, brainstorming, deep-recon, forge-idea, prd,
product-brief, spec, ux. **Every one is a planning skill.** No memlog is produced by `bmad-build`,
`bmad-sprint-planning`, `bmad-retrospective`, or `bmad-code-review`. For the entire implementation
half of a project — where UJ-1's "a stage has just finished" most often fires — the FR-14 hierarchy
drops straight past tiers 1 and 2 to run-folder date and mtime, and C6's primary signal does not
exist at all.

### S1-3. The signature measurement is miscounted three times, always in the flattering direction.

**Location:** §2.3 "A known limitation, measured"; FR-31; §8 "Risk markers are convention, not
contract."

All three say "`[ASSUMPTION]` appears in 6 [of 49 skills] and `[NOTE FOR PM]` in 3."

Measured on the same install:

- `[ASSUMPTION]`: **6 files** across **4 skills** (`bmad-prd` contributes three of the six: its
  SKILL.md, its template, and its validation checklist).
- `[NOTE FOR PM]`: **3 files** across **exactly 1 skill** — all three are `bmad-prd`
  (SKILL.md, prd-template.md, prd-validation-checklist.md).

The unit is wrong: *files* were counted and reported as *skills*.

The denominator is also inflated. **20 of the 49 skills are deprecated forwarding stubs** (`bmad-create-prd`,
`bmad-dev-story`, `bmad-market-research`, `bmad-sprint-status`, …). They emit nothing and never will.
The population of live artifact-producing skills is ~29.

The honest figures are approximately **4 of 29** and **1 of 29** — and `[NOTE FOR PM]` is not a thin
convention, it is *one skill's private annotation*, which the tool proposes to surface as a
project-wide risk class (FR-30).

This matters beyond arithmetic. This PRD's entire authority derives from having measured rather than
assumed. Its one measurement is wrong, is repeated verbatim in three places without re-derivation,
and every error makes the tool look better than it is. A reader who trusts §2.3 because it seems
unusually honest is being misled by the most trustworthy-looking paragraph in the document.

### S1-4. FR-34 reads the wrong file and will emit ~35 false positives on a stock install — violating FR-56 on first run.

**Location:** FR-34 (§6 C6); addendum §Consequences.

FR-34: "Skill customizations recorded in `customize.toml` are surfaced as project-level deviations
from BMAD defaults."

`customize.toml` is a **shipped vendor default**, present in 35 of 49 skills, and every one begins:

```
# DO NOT EDIT -- overwritten on every update.
#
# Override files (not edited here):
#   {project-root}/_bmad/custom/bmad-prd.toml         (team)
#   {project-root}/_bmad/custom/bmad-prd.user.toml    (personal)
```

Actual project-level deviations live in **`_bmad/custom/*.toml`**, which appears **nowhere in the 65
FRs** — only as a passing aside in the addendum's Consequences list.

As specified, FR-34 presents 35 untouched vendor files as "deviations from BMAD defaults." That is a
mass false positive in the exact feature group whose governing principle (FR-56) declares false
alarms a first-order failure. The tool's first run on a stock project would fire its loudest signal
35 times, all wrong. FR-56 and FR-34 are in the same capability group, four bullets apart, and
neither notices the other.

Secondary point: even pointed at `_bmad/custom/`, "deviation from defaults" requires diffing against
the defaults, which requires the tool to know the shipped baseline for the installed version. FR-34
specifies no such mechanism, and the addendum's runtime-derivation design (which would be the natural
home for it) does not cover it.

### S1-5. §10's git resolution rests on a false premise. BMAD ships a git-evidence script.

**Location:** §10 "Git history as an activity signal — **resolved: no.** BMAD-native sources only";
FR-62; UJ-3 implications.

The resolution's sole justification is that git is not BMAD-native. It is:
**`.claude/skills/bmad-retrospective/scripts/git_evidence.py`** — a shipped BMAD script whose
docstring reads "Measure git commit and file-change evidence over a revision range… This script only
MEASURES — it never judges."

That is a direct precedent, in BMAD's own toolchain, for treating git as evidence while leaving
judgement to the reader — which is precisely this PRD's stated posture (§2.3). The decision was made
against a fact that is not true, and the memlog records it as settled ("RESOLVED: NO"), so nothing
downstream will revisit it.

The cost is not theoretical. Git commit history is the *only* source in the environment that carries
per-event timestamps, ordering, and authorship — the exact three properties S1-1 shows the memlog
lacks. FR-61 (tool-side last-viewed marker) is offered as the mitigation, but it is not a
substitute: it answers "what is different since I looked", while UJ-3 asks "what changed, **in what
order**, and what state the project is now in." Order is what was thrown away, and FR-61 does not
recover it. UJ-3's claim that FR-61 recovers "the exactness git would have provided" is false.

---

## S2 — Major: the product logic

### S2-1. The hedging stack is self-neutralizing, and no requirement sets a floor.

**Location:** FR-55, FR-56, FR-59, FR-64, FR-65, FR-31, FR-48, FR-54; §2.3.

The question in the brief is a good one, and the answer is yes. Enumerate the constraints on C6's
output:

- FR-56 — err toward silence over noise.
- FR-65 — conservative extraction; do not imply exhaustive coverage.
- FR-64 — present divergence, never assert conflict.
- FR-59 — "may predate", never "is inconsistent".
- FR-55 — do not elevate absence unless something else implies it should exist.
- FR-54 — absent core artifacts greyed, "non-attracting", "not a call to action".
- FR-31 — do not imply that absence of markers means absence of risk.
- FR-48 — inferred relationships must be presented as inferred.

Every one is individually correct. Collectively they specify a UI in which **nothing is ever
asserted**, and combined with S1-2 and S1-3 the surviving assertable signals are: `[ASSUMPTION]` tags
from 4 skills, `[NOTE FOR PM]` from 1, `override` entries from 1, `assumption` entries from 0,
`status: final` with open items, and adjacency of version pins.

The structural defect: **there is no floor requirement anywhere in the PRD.** Not one FR takes the
form "the tool must surface X" in a way that could be violated by surfacing nothing. A build that
renders an empty oversight panel on every real project satisfies FR-29 through FR-65 completely and
scores perfectly against FR-56.

And FR-56 is in direct tension with the §5 success gate, which requires the tool to surface something
a colleague would otherwise have missed. The PRD tunes the product toward silence with one hand and
gates its success on speech with the other, and never puts the two in the same paragraph.

**What is missing:** a calibration requirement. Something like — "against a fixture project seeded
with N known defects, the tool must surface at least M, with no more than K signals the reviewer
dismisses." Without it, FR-56 is not a design principle; it is permission to ship a blank page.

### S2-2. The success gate cannot be failed, and the one honest counter-signal was argued away.

**Location:** §5 in full.

The gate: "colleagues using the tool on real projects report that it surfaced something they would
otherwise have missed."

No N. No denominator. No timebox. No definition of "colleague" or "real project". No stated
falsification condition. One enthusiastic message from one friendly colleague clears it. Nothing
anyone could observe would fail it, and with telemetry excluded (NFR-11), nothing is observed anyway.

The counter-metric rejection is where the reasoning inverts. Time-in-dashboard was rejected because
"a user choosing to dwell in the UI may signal value rather than failure." Correct — and the
conclusion should have been *disambiguate it* (dwelling with a resolution vs. dwelling while lost),
not *delete it*. What was actually removed is the last channel through which negative evidence could
reach the team. The argument that dwell time might mean value is used to license ignoring dwell time
entirely, which also forecloses it meaning failure.

**Is it a gate or an excuse?** As written, an excuse. Qualitative Stage-1 feedback is a defensible
choice; an unfalsifiable qualitative gate is not the same thing, and the PRD's "this is a considered
decision, not a deferred one" asserts rigour it does not exhibit. A three-line fix would restore the
gate: name the colleague count, name the window, and pre-commit to the finding that would kill the
tool ("if after four weeks no colleague can name a specific thing the tool caught, the oversight
premise is disconfirmed and we ship it as a document browser or not at all").

### S2-3. It is three products in one coat — four, counting the glossary — with no MVP cut.

Yes. Decompose:

| Product | FRs | Why it is separable |
|---|---|---|
| **A. Activity / live-threads engine** | FR-13–17, 35–37, 47, 52–55, 61–62 | Data-poor and hard (see S1-1). Ships alone as "what's going on." |
| **B. Wiki renderer** | FR-18–28 | Six bespoke viewers + sharding + TOC + permalinks + full-text search. Ships alone and is *already useful*. Zero dependency on A or C. |
| **C. Oversight analyser** | FR-29–34, 57–60, 63–65 | The stated primary job. Depends on nothing in A or B except a place to render. |
| **D. Versioned glossary system** | FR-41–44 + entire addendum | Three-tier runtime derivation, version-range metadata, loud-failure validation on YAML *comments*, custom-skill discovery. A product with its own maintenance treadmill (the addendum concedes Tier 3 "remains hand-maintained"). |

65 FRs, 16 NFRs, no priority ranking, no phasing, no "v1 must / v1.1 may" split. Load-bearing extras
buried in the NFRs: three-platform support (NFR-12), WCAG 2.2 AA including non-colour encoding
(NFR-15), full keyboard navigation (NFR-14), path-traversal hardening (NFR-10), sub-2s cold start
(NFR-7), imperceptible navigation of 24k-word documents (NFR-8), graceful degradation across BMAD
versions (NFR-5), and correct behaviour while agents concurrently rewrite the tree (NFR-3).

FR-18 forecloses the only cheap path: viewers must be "designed for its shape, **not by a generic
markdown renderer**." That single clause converts B from a weekend to a month.

The one deferral (§9 Archaeologist mode) saves nothing real: C8's FR-38 (browse all historical runs)
and FR-39 (present multiple runs as a comparable series) already require the browsing UI and the
series comparison. The PRD says as much — "an experience layer over data the tool will already hold"
— which is an admission that the deferral removes no work, only a name.

**The uncomfortable inference:** B is the part that certainly works, is certainly useful, and has no
false empirical claims under it. A and C are where the vision lives and where every S1 finding
lands. The PRD's own evidence argues for shipping B first and treating C as a research spike — and
the PRD nowhere entertains that.

### S2-4. Viewer investment is allocated to the rarest artifacts and skips the implementation half entirely.

**Location:** FR-18–24 (C4), FR-33.

Dedicated viewers are specified for `review-{slug}.md` (FR-20, ~3 emitting skills),
`reconcile-{slug}.md` (FR-21, 2 references in the whole corpus), and `addendum.md` (FR-22), plus
cross-project aggregation of reviewer findings (FR-33).

Specified for the implementation side: FR-23, one viewer for `sprint-status.yaml`. That is all.

No viewer for epics. No viewer for stories — despite FR-51 spending a requirement on locating them
and FR-53 declaring them co-essential with the PRD. No viewer for `bmad-build` output, code-review
output, or retrospectives. Meanwhile `epics` is the most frequently referenced output family in the
skill corpus, and FR-11 does not list it as a run-folder family at all (S2-5).

This inverts UJ-1's own priority. UJ-1 is triggered by "a BMAD stage has just finished" — most stages
that finish in a working project are build/story stages, and the tool has nothing purpose-built for
any of them.

### S2-5. FR-11's completeness claim is false in the version it was measured against.

**Location:** FR-11.

"**All seven** run-folder families are recognized: briefs, PRDs, architecture, UX designs, research,
specs, forge."

Observed output families in the v6.11.0 skill corpus include, beyond those seven: **`epics`** (the
single most-referenced), **`prfaq-*`**, **`implementation-readiness`**, **`sprint-change-proposal-*`**,
plus outputs from brainstorming, party-mode and retrospective.

FR-12 (present-but-uninterpreted) prevents a crash but does not rescue the word "All", and NFR-5
(tolerate other BMAD versions) does not apply — these families exist in the version measured. The
omission is not random: it drops the family FR-53 declares essential and the families the
implementation half of the workflow produces, which is the same blind spot as S2-4.

### S2-6. UJ-1, the declared primary journey, is the one the tool serves worst — and it contradicts §1.

**Location:** UJ-1 (§4); §1 paragraph 2; FR-37.

UJ-1 needs three things: (a) know a stage just finished; (b) see what it produced; (c) see "what the
run recorded about its own reasoning: decisions taken, assumptions made, anything overridden without
asking."

- (a) is unobtainable. FR-37 forbids watching; there is no completion event on disk for most stages.
  The user must already know — meaning they are sitting at the terminal where they just watched it
  finish, transcript still on screen.
- (c) is unobtainable for any implementation-side stage (S1-2: no memlog), and for planning stages
  reduces to a memlog whose `override` type one skill emits and whose `assumption` type none does.
- (b) is genuinely served. (b) is the file browser.

Worse, UJ-1 contradicts the problem statement. §1 argues the overhead "is paid most often at the
exact moment the user has least context: on returning to a project." That is UJ-3, ranked **third**.
UJ-1 — ranked first, called "primary trigger" — is the moment the user has *maximum* context, having
just watched the run complete. The PRD's stated problem and its stated primary journey point at
opposite ends of the context spectrum, and no section reconciles them.

### S2-7. The value proposition, stated without the hedges.

The brief asks whether read-only + no-LLM + surface-only is enough to be worth installing. Assemble
what the PRD actually commits to after its own caveats are applied:

- Oversight surfacing → markers from 4 skills, one skill's private `[NOTE FOR PM]`, `override`
  entries from one skill's headless path, and `status: final` with open items.
- UJ-2 Part A (divergence) → "surfaces high-confidence candidates rather than claiming exhaustive
  coverage… does not imply that an unflagged project is free of divergence" (FR-65). Adjacency, not
  detection.
- UJ-2 Part B (propagation) → "The tool therefore **cannot verify that a requirement propagated**."
- UJ-3 (re-orientation) → an ordering built on a source with no timestamps (S1-1), with git excluded
  on a false premise (S1-5).
- Live threads → composite state from sprint-status.yaml, refreshed manually.

What is left that is unambiguously delivered: **navigation of large documents, full-text search,
permalinks, typed rendering of memlogs and sprint status, and a list of files that changed since you
last looked.** That is a real product. It is a *reading* product, and it is worth an `npx`.

But §2 sells something else — "actively surface the *risk surface* of a project, drawing attention to
what warrants scrutiny rather than presenting all content with equal weight." Nothing in C6 that
survives the S1 findings does that with enough coverage to change a user's behaviour. **The tool
delivers a very good file browser that feels like oversight**, and the feeling is the hazard: a user
who scans a quiet oversight panel and concludes "nothing to worry about" has been actively harmed by
a tool whose coverage is 4 skills out of 29. FR-31 tries to defuse this with a disclaimer. A
disclaimer in the UI does not undo the reassurance the UI just produced — that is the whole reason
FR-56 exists, applied in the opposite direction, and the PRD does not consider the symmetric failure.

---

## S3 — Contradictions, unfalsifiable claims, and misallocations

### S3-1. Cross-reference and internal-consistency defects

| # | Location | Defect |
|---|---|---|
| a | NFR-11 | Cites "(§4)" for the telemetry decision. Telemetry is decided in **§5**; §4 is User Journeys. |
| b | §2.2 read-only rationale | Cites `fix-sprint-status` as proof `sprint-status.yaml` "corrupts under a *single* writer." That is evidence the **file format is fragile**, not that a *reader* could corrupt it. Non-sequitur propping up a decision that needs no propping — and it appears in the memlog as an argument Jamie "agreed+reinforced", so it will be repeated downstream. |
| c | FR-8 vs FR-49 / FR-50 / FR-51 | FR-8: identify artifacts "by reading their content and structure, **not by filename pattern**." The three FRs that operationalize identification are all filename/path-based (`review-{slug}.md`, `reviews/` subfolder, `story_location` path). The principle is abandoned by its own implementation. |
| d | FR-52/53 vs FR-55 | FR-53 imports a **halting gate's** essentiality ranking (`bmad-correct-course` refuses to run without PRD + epics) as a **presentation** ranking. FR-55 then removes the consequence. Net result on a `bmad-build`-only project: a permanent greyed-out panel of correctly-absent artifacts. Low-contrast noise, forever, in the group governed by FR-56. |
| e | FR-25 vs FR-27 vs §10 | FR-27 requires permalinks that "survive reload." Permalink identity depends on the heading carve-up, and the carve-up rule (§10 "Sharding precedence") is **an unresolved open question**. A shipped FR is load-bearing on an open question. |
| f | FR-28 vs FR-37 vs FR-47 vs NFR-16 | Full-text search needs an index. Refresh is manual and must be fast (NFR-16). So either the index rebuilds on every refresh (fighting NFR-16) or goes silently stale — and FR-47 requires stale data to declare its staleness, which nothing specifies for search results. |
| g | NFR-7 vs NFR-16 | NFR-7 carries a number (2s) and is explicitly "not a release gate." NFR-16 is declared "the binding performance requirement" and carries **no number at all**. The measurable one isn't binding; the binding one isn't measurable. Neither is testable. |
| h | FR-15 vs FR-47 vs FR-37 | Three separate staleness-disclosure mechanisms (per-entry timestamp confidence, whole-view currency, manual-refresh state) with no unified model. The UI will grow three different "how sure are we" chrome systems, in a design whose stated first principle is density. |
| i | §3 vs stakes | §4 states "Jamie is the protagonist and the primary user; the tool is not yet designed for anyone whose workflow differs materially." The memlog's first line sets stakes as "public launch (OSS/product) — compatibility/versioning/adoption are live concerns", and §5 measures success by **colleague** feedback. The PRD designs for n=1, ships to the public, and grades itself on people it admits it did not design for. |
| j | NFR-1 | "Verified by test" — a test can prove the server process performs no writes. It cannot constrain FR-24's open-in-editor affordance, which hands a path to an arbitrary external program. The invariant's scope boundary is unstated. |

### S3-2. NFR-3's premise is partly overstated (a rare error in the tool's favour, worth correcting for effort estimation)

NFR-3 warns of "truncated, partially written" files. `memlog.py` writes via temp file + `flush()` +
`fsync()` + `os.replace()` — memlogs are **never** observable half-written. The concern is real for
LLM-authored markdown and for `sprint-status.yaml`, but not for the script-written files, and the PRD
treats the whole tree as equally hazardous. Minor upside: some robustness budget can be reclaimed.

Minor downside the PRD misses: the atomic write transiently creates `.memlog.md.tmp` in the run
folder. Under FR-12, the tool would faithfully list it as a "present-but-uninterpreted artifact" —
a visible UI element representing nothing.

### S3-3. The npx question is a launch blocker filed as a note

**Location:** §10, last bullet.

"`npx` distribution assumes Node in the user's environment. BMAD's own tooling is Python via `uv`, so
a BMAD user does not necessarily have Node. **Impact on adoption unassessed.**"

For an OSS launch whose only success gate is colleague adoption, "the distribution channel may not
exist on the target audience's machines" is not an open question. It is either a blocker or a
rewrite, and it sits in a bullet list directly beneath "Product name." Every skill script in this
repo runs `uv run …`; the environment's demonstrated runtime is Python. Nothing in the PRD explains
why the dashboard is not.

### S3-4. "Oversight" is never operationalized, so it can never be shown to work or fail

The PRD nowhere states what a user must be able to **conclude**. There is no acceptance criterion of
the form "given a project containing defect X, the tool surfaces it within N seconds." Without one,
neither the team nor the §5 gate can distinguish:

- the tool found nothing because there was nothing, from
- the tool found nothing because it structurally cannot see this class of thing.

Those are the same observation. That indistinguishability is what makes S2-1 and S2-2 compound rather
than merely coexist: an unfalsifiable gate over a silence-tuned tool over signals with 4/29 coverage.

**This is the cheapest high-value fix in the review.** Build a fixture BMAD project with seeded,
catalogued defects — a `react 18`/`react 17` split across spec and architecture, a `status: final`
document with open items, an `(override)` entry buried in a long memlog, an architecture older than
its PRD, an `[ASSUMPTION]` in a skill that emits them and a bare unmarked assumption in one that does
not. Then state the recall floor and the false-positive ceiling as requirements. That single artifact
turns FR-56 from permission-to-be-silent into a real constraint, turns §5 into a falsifiable gate,
and would have caught S1-1, S1-2 and S1-4 before a line of code was written.

---

## What would change the verdict

Five changes, in order of value:

1. **Re-measure everything, and fix FR-14/FR-29 to match reality.** Memlog entries have no
   timestamps; the type vocabulary is unenforced; `--type assumption` has zero emitters. C3's
   ordering model and C6's primary signal both need redesigning around what is actually on disk.
2. **Reopen the git decision.** It was resolved against a false premise, and git carries exactly the
   per-event ordering the memlog lacks. `git_evidence.py` is the BMAD-native precedent.
3. **Add a seeded-defect fixture and a recall floor / false-positive ceiling** (S3-4). Without this
   the product cannot be shown to work, and FR-56 has no counterweight.
4. **Cut to one product and phase the rest.** B (the reading product) is deliverable and has no false
   claims under it. Ship B; treat C as a spike whose continuation is gated on the fixture results.
5. **Correct the counts and FR-34's target file** (S1-3, S1-4), and make the §5 gate falsifiable
   (S2-2) — three sentences each, and they remove the document's worst credibility risks.

The honest summary a reader deserves in §2: *this is a fast reader for a corpus that is hard to read,
which additionally surfaces the small number of risk signals BMAD happens to record explicitly, and
which cannot tell you that a project is fine.* Everything in the PRD that goes beyond that sentence
is currently unsupported by the source it cites.
