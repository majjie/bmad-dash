# Edge-Case Review — BMAD Dashboard CLI PRD

Reviewer lens: unhandled conditions. Findings are grounded in the BMAD v6.11.0 install
at `_bmad/` and `.claude/skills/` in this repository; every claim below cites the file
that establishes it. Hypothetical cases are marked as such and kept to a minimum.

**Verdict: CHANGES REQUIRED.** The PRD is unusually disciplined about what it cannot
know, but three of its load-bearing empirical premises do not survive contact with the
installed BMAD tree — FR-29's reliability claim, FR-14's tier-1 ordering source, and
FR-34's location for customizations. Each is a requirement the PRD leans on hardest,
and each is wrong in the same direction: it assumes a structure is richer than it is.
Below that sit a set of real filesystem and layout conditions the requirements are
silent on.

Counts: 5 critical, 8 high, 11 medium.

---

## CRITICAL

### C-1. Memlog entries carry no timestamp. FR-13/14/15 have no tier-1 clock.

**Condition.** FR-14 places `.memlog.md` entries first in the activity-ordering
hierarchy, and FR-13 requires "a chronological list of recent project activity."
`_bmad/scripts/memlog.py` writes each entry as a single line:

```
- (decision) Read-only confirmed for v1 …
```

There is no per-entry timestamp, and by design — the docstring states "It is a FLAT log
… The chronology itself is the structure." The only time value in the file is a
single frontmatter `updated:` field, rewritten by `touch()` on every append. The live
memlog in this very run folder confirms it: 55 lines, ~30 entries, one timestamp.

**Why the requirements do not cover it.** FR-14 treats "`.memlog.md` entries" as a
timestamp source of the highest reliability. It is a *sequence* source of the highest
reliability, which is a different thing. Within one file, order is trustworthy. Across
two run folders, there is nothing to interleave on — every entry in a memlog would have
to inherit the file's single `updated` value, collapsing an entire run's history to one
instant. FR-15 ("each activity entry displays the confidence of its own timestamp")
presumes each entry *has* a timestamp of its own.

**Consequence.** The landing view — the default view, the thing the user sees first —
cannot be built from its stated primary source. Either every memlog collapses to one
feed row (losing the per-decision granularity UJ-1 asks for) or entries are ordered by
a fabricated timestamp. FR-15 would then be displaying confidence in a number the tool
invented. This is the single most consequential gap in the document.

---

### C-2. FR-29's premise is factually wrong: `override` is emitted by 1 of 49 skills, `assumption` by none.

**Condition.** FR-29 designates memlog `override` and `assumption` entries "the
highest-reliability oversight signal, being script-written rather than
convention-dependent." Measured against the install:

| Fact | Evidence |
|---|---|
| Skills that invoke `memlog.py` at all | **9 of 49** (architecture, brainstorming, deep-recon, forge-idea, party-mode, prd, product-brief, spec, ux) |
| Skills documenting `--type override` | **1** (`bmad-product-brief`) |
| Skills documenting `--type assumption` | **0** |
| Most common documented types | `event` (6), `idea` (4), `decision` (3) |

And `memlog.py`'s own docstring disqualifies the premise directly: *"The host skill
supplies the vocabulary by how it calls `append` — the tool stays neutral … The host
skill names the vocabulary; the script does not enforce one."*

**Why the requirements do not cover it.** The PRD conflates two separate reliabilities.
The *write mechanism* is script-mediated and atomic — true, and valuable. The
*vocabulary* is pure convention, enforced by nothing, exactly like `[ASSUMPTION]`. §2.3
and FR-31 go to considerable trouble to caveat marker coverage at 6/49, then rank a
1/49 signal above it as the reliable alternative. The ranking is inverted.

**Consequence.** The primary job's primary signal has *worse* coverage than the signal
the PRD explicitly discounts. Worse, it fails silently and asymmetrically: memlogs
exist only for planning-side skills, so `bmad-build`, `bmad-code-review`,
`bmad-correct-course`, `bmad-retrospective` and `bmad-sprint-planning` produce no
memlog at all. UJ-1 says "a BMAD stage has just finished" — for the most frequently run
stage, `bmad-build`, there is no run record for the tool to show. A user who learns to
trust the override panel will read an empty panel as "no overrides were taken," which
is precisely the false assurance FR-56 exists to prevent, inverted into a false
negative.

**Related, same root.** Headless-override capture is fragmented across three unrelated
mechanisms, only one of which FR-29 addresses:
- memlog `--type override` — `bmad-prd`, `bmad-product-brief` (and arch/ux by the same File-roles block)
- an *Assumptions section inside the retrospective document* — `bmad-retrospective` `-H` records "each assumption made without the user … into the retrospective document's Assumptions section so the audit trail survives"
- structured `assumptions[]` / `open_questions[]` fields — `bmad-spec`, `bmad-architecture`, `bmad-prd`, `bmad-ux`, `bmad-brainstorming`

---

### C-3. Same-day reruns collide into one run folder. FR-38/FR-39 have no series to show.

**Condition.** Run-folder patterns, read from each skill's `customize.toml`:

| Family | `run_folder_pattern` | Root |
|---|---|---|
| prd | `prd-{project_name}-{date}` | `{planning_artifacts}/prds` |
| architecture | `architecture-{project_name}-{date}` | `{planning_artifacts}/architecture` |
| brief | `brief-{project_name}-{date}` | `{planning_artifacts}/briefs` |
| ux | `ux-{project_name}-{date}` | `{planning_artifacts}/ux-designs` |
| research | `{research_type}-{topic_slug}-{date}` | `{planning_artifacts}/research` |
| **spec** | `spec-{slug}` | **`{output_folder}/specs`** |
| **forge** | `{slug}` | **`{output_folder}/forge`** |

`{project_name}` is constant per project (`_bmad/config.toml`: `project_name = "bmad"`)
and `{date}` is day-granular. For four of seven families, **two runs on the same day
resolve to the same directory** — the second run writes into the first's folder. This
run folder is `prd-bmad-2026-08-28`; re-running the PRD skill today lands here again.

**Why the requirements do not cover it.** FR-39 requires "multiple runs of the same
artifact family are presented as a series, so successive attempts can be compared," and
FR-38 requires historical runs including "superseded ones." Nothing in the PRD
acknowledges that the folder naming cannot distinguish two attempts within a day. FR-49
addresses slug reuse for *spec* folders as deliberate, but says nothing about
*date-pattern* collision for the four dated families, which is accidental rather than
deliberate.

**Consequence.** The corpus-navigation job (§2.1 secondary) silently loses history in
the exact case where comparison matters most — two attempts at the same artifact on the
same day, i.e. an iteration. The tool will present one run where two occurred, with no
signal that it has done so.

**Second-order.** Spec and forge have *no date and no project name* in their folder
names. FR-14's third tier ("run-folder date") is simply unavailable for two of seven
families, dropping them straight to mtime — the tier FR-14 and UJ-3 declare untrustworthy.

---

### C-4. `story_location` can point outside the project. FR-51 and NFR-10/FR-40 conflict with no resolution.

**Condition.** FR-51 requires epic and story locations be resolved from
`story_location` in `sprint-status.yaml`. That field is free-form and an **absolute
path is a tested, supported value** — `.claude/skills/bmad-sprint-planning/scripts/tests/test_sprint_plan.py:161`
sets `story_location: /custom/stories` and asserts it round-trips. The template default
`"docs/stories"` is relative, to an unstated base.

**Why the requirements do not cover it.** Three requirements make incompatible demands
and the PRD never adjudicates:
- **FR-51** — honour the configured location.
- **NFR-10** — "File serving is confined to the target project's artifact tree; path traversal outside it is prevented."
- **FR-40** — "Scope is the target project only; no cross-project library and no scanning of unrelated paths on disk."

An absolute or `../`-relative `story_location` satisfies FR-51 only by violating the
other two. There is also no stated base for the relative form (project root?
`implementation_artifacts`? the sprint-status file's own directory?).

**Consequence.** Either stories vanish from the dashboard for any project using a
non-default story location, or the tool serves files from outside the target tree —
turning the read-only local server into an arbitrary-path file browser reachable from
the loopback UI. That second outcome is a security regression against NFR-9/NFR-10, not
merely a bug.

**And the absent case.** This project has **no `sprint-status.yaml` at all** and no
`_bmad-output/implementation-artifacts/` directory (`_bmad/bmm/config.yaml` declares
the path; nothing created it). FR-23 and FR-51 both take the file's existence as given.
`bmad-retrospective` names this state explicitly — "the normal path for a stories-mode
project with no `sprint-status.yaml`" — so it is a supported project shape, not
breakage. No requirement states what C7 (live threads) shows when its composite input
(FR-36: "sprint tracking, epic and story states, document status") is one-third absent.

---

### C-5. Four mutually incompatible timestamp formats, three timezone-naive, sorted against mtime.

**Condition.** The formats actually on disk:

| Source | Format | Example | TZ |
|---|---|---|---|
| `.memlog.md` frontmatter | `%Y-%m-%dT%H:%M` (`memlog.py:now()`) | `2026-08-28T16:29` | naive local, no seconds |
| `sprint-status.yaml` | `%m-%d-%Y %H:%M` (`sprint_plan.py:71`) | `05-06-2025 21:30` | naive local, **US month-first** |
| Document frontmatter | `{YYYY-MM-DD}` date-only | `2026-08-28` | none |
| `_bmad/_config/manifest.yaml`, `config.yaml` headers | ISO-8601 with `Z` | `2026-08-28T14:11:32.652Z` | **UTC** |
| Filesystem mtime | epoch | — | absolute |

`sprint_plan.py:75` accepts **three** formats in the *same field* —
`STAMP_FORMATS = ("%m-%d-%Y %H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d")` — because
"hand-edited files drift toward ISO stamps." Staleness is computed against
`datetime.now()`, local and naive.

**Why the requirements do not cover it.** FR-14 defines a *precedence* between sources
but never a *normalization* between them. The PRD's only mention of time handling is
implicit. Nothing addresses:
- **Mixing naive-local with absolute.** mtime is UTC-anchored; memlog and sprint stamps are wall-clock in whatever zone the writer sat in. Sorting them into one feed is unsound by up to the UTC offset. A container writing UTC alongside a host writing BST puts entries out of order by an hour, silently.
- **`%m-%d-%Y` ambiguity.** A hand-edit of `06-05-2025` intending 5 June parses as 6 May. Two months of error, no error raised.
- **Precision mismatch.** Date-only frontmatter versus minute-granular stamps. FR-57 ("an artifact last updated before its source was last updated is flagged as possibly predating it") compares a day to a minute. Same-day edits are unorderable, and FR-57 will either fire on every same-day pair or on none.
- **Identical timestamps.** Minute granularity plus parallel reviewer subagents (see M-4) guarantees ties. No tiebreak rule is stated.
- **`updated` before `created`, or in the future.** Both are LLM-written free text in templates (`created: '{date}'`). Neither is validated by anything. FR-57/FR-59 have no defined behaviour for a negative or future interval.

**Consequence.** FR-14 and FR-57 — the ordering hierarchy and the staleness signal —
rest on arithmetic across incomparable quantities. Given FR-56 treats a dismissible
false alarm as a first-order failure, a staleness flag driven by timezone offset is
exactly the defect the PRD says it most wants to avoid.

---

## HIGH

### H-1. FR-34 reads customizations from the wrong file. It would report 35 false deviations.

**Condition.** FR-34: "Skill customizations recorded in `customize.toml` are surfaced
as project-level deviations from BMAD defaults." But
`_bmad/scripts/config_utils.py:load_customization()` shows `customize.toml` is the
**shipped default**, loaded `required=True` as the base layer:

```python
load_toml(skill_dir / "customize.toml", required=True),
load_toml(custom_dir / f"{skill_name}.toml"),
load_toml(custom_dir / f"{skill_name}.user.toml"),
```

Project-level deviations live in `_bmad/custom/{skill}.toml` (team, committed) and
`_bmad/custom/{skill}.user.toml` (personal, gitignored). Both are absent in this
project — there are zero deviations here. 35 of 49 skills ship a `customize.toml`.

**Why not covered.** The PRD names the wrong file and never mentions `_bmad/custom/`
as an override layer for skills (the addendum mentions `_bmad/custom/` only for *custom
skills*, not overrides).

**Consequence.** The tool would present 35 shipped defaults as "project-level
deviations from BMAD defaults" — a wholly fabricated finding on every project,
including projects that have customized nothing. FR-56 violation of the first order:
a signal that is 100% noise.

**Compounding.** `_bmad/custom/.gitignore` contains `*.user.toml`. Personal overrides
are never committed, so after the `git pull` of UJ-3 the tool sees a different
customization set than the machine that produced the artifacts.

---

### H-2. FR-10 names a derived config file, not the authoritative one, and misses two of seven artifact roots.

**Condition.** FR-10: "reads the target project's own configuration
(`_bmad/bmm/config.yaml` and user overrides)." On disk:

- **Authoritative:** a four-layer TOML merge — `_bmad/config.toml` (required),
  `_bmad/config.user.toml`, `_bmad/custom/config.toml`, `_bmad/custom/config.user.toml`
  (`config_utils.py:load_central_config`).
- **Derived:** `_bmad/bmm/config.yaml` and `_bmad/core/config.yaml`, both headed
  "Generated by BMAD installer / Date: 2026-08-28T14:11:32.547Z". They are regenerated
  *only at install*. `_bmad/config.toml` warns: "Regenerated on every install", and the
  custom layers are "never touched by the installer."

So a team override added to `_bmad/custom/config.toml` after install takes effect for
every BMAD skill and is invisible in `config.yaml`. FR-10 reads the stale copy.

**Two roots are not in central config at all.** `spec_output_path = "{output_folder}/specs"`
and `forge_output_path = "{output_folder}/forge"` are declared in each skill's
`customize.toml`, and land under `{output_folder}` — *not* under `planning_artifacts`.
FR-11 requires all seven families be recognized; two of them cannot be located from the
source FR-10 names.

**Unaddressed mechanics.** `{project-root}`, `{output_folder}`, `{planning_artifacts}`
are placeholder tokens requiring recursive expansion; the PRD never mentions them.
`output_folder` is user-settable and could be `docs` — which is also
`project_knowledge = "{project-root}/docs"`, intermixing generated artifacts with
hand-written project knowledge under one root with no discriminator.

**Consequence.** Wrong artifact roots on any project that customized paths after
install; specs and forge sessions missing entirely; FR-11 unmeetable as specified.

---

### H-3. A run folder is indistinguishable from a sharded document. BMAD resolves this by asking a human.

**Condition.** FR-9 requires equivalent handling of "a single file or pre-sharded as a
directory with an `index.md`." BMAD's own discovery patterns
(`bmad-create-epics-and-stories/steps/step-01-validate-prerequisites.md:60`,
`bmad-create-story/discover-inputs.md:87`) are:

```
whole:   {planning_artifacts}/*prd*.md
sharded: {planning_artifacts}/*prd*/index.md
```

The sharded glob matches **this run folder's parent chain**:
`_bmad-output/planning-artifacts/prds/` matches `*prd*/`, and
`prds/prd-bmad-2026-08-28/` matches `*prd*/` at the next level. A PRD run folder
containing `prd.md`, `addendum.md`, `.memlog.md` and `review-*.md` is structurally a
directory-of-markdown, same as a shard set.

BMAD's own answer is to defer to the user — `bmad-create-epics-and-stories`: *"If both
a whole document and a sharded version exist, ask which is current rather than
guessing."* A batch renderer has nobody to ask.

**Why not covered.** Open Question 3 asks whether the tool's heading carve-up should
*defer to* an existing shard structure. That presupposes shard structure has already
been *detected*. Detection is the harder problem and is unasked. FR-8 ("identified by
reading content and structure, not filename pattern") is the right instinct but gives
no discriminator: an `index.md` may be absent from a shard set or present in a run
folder.

**Consequence.** A PRD run folder rendered as a sharded document, presenting a memlog,
an addendum and four reviewer outputs as chapters of the PRD — or a genuinely sharded
PRD rendered as a run folder, scattering one document across the corpus view. Both are
plausible; the PRD gives no basis to prefer either.

---

### H-4. Hidden entries: the rule that finds the memlog also surfaces scratch and temp files.

**Condition.** Four classes of dot-prefixed entries live inside run folders:

| Entry | Nature | Source |
|---|---|---|
| `.memlog.md` | **canonical**, FR-14 tier 1, FR-19's whole subject | `memlog.py:MEMLOG` |
| `.working/` | **deliberate scratch** — "artifacts land in `.working/` and are not promoted unless the caller signals" | `bmad-ux` (e.g. `.working/color-themes-1.html`) |
| `.memlog.md.tmp` | transient, visible mid-write | `memlog.py:write_atomic` |
| `.sprint-status-*.tmp` | transient, visible mid-write | `sprint_plan.py:_atomic_write` (`tempfile.mkstemp(prefix=".sprint-status-", ...)`) |

**Why not covered.** The PRD never states whether directory traversal includes dotted
entries. Both settings are wrong:
- **Skip dotfiles** (the default in most glob libraries) → every memlog is invisible, and FR-14 tier 1, FR-19 and FR-29 all silently return nothing on every project.
- **Include dotfiles** → FR-12 ("shapes the tool does not recognize are listed as present-but-uninterpreted rather than hidden") mandates surfacing `.working/` scratch that the producing skill deliberately did not promote, plus whatever `.tmp` files happen to exist at scan time.

**Consequence.** Either the highest-value signal is invisible, or unpromoted scratch
and mid-write temp files appear as project artifacts. FR-12's "never hidden" rule is
stated as an absolute and needs an exception it does not have.

---

### H-5. NFR-6's extraction source is not uniquely addressable, and its vocabulary is provably incomplete.

**Condition.** NFR-6 anchors status-vocabulary extraction on
`sprint-status-template.yaml` with loud failure on change. Two problems:

1. **Two byte-identical copies exist** — `.claude/skills/bmad-sprint-planning/sprint-status-template.yaml`
   and `.claude/skills/bmad-retrospective/scripts/tests/fixtures/sprint-status-template.yaml`
   (verified `diff` clean). The second is a **test fixture**, free to diverge from the
   real template at any time. A filename-based lookup finds both with no rule for
   choosing, and the fixture may be found first.

2. **The comments are already incomplete.** `sprint_plan.py:68` defines
   `LEGACY_STATUS = {"drafted": "ready-for-dev", "contexted": "in-progress"}`, noted as
   *"v6 wrote these; they still exist in the wild (v6-shims/bmad-create-story actively
   writes 'contexted')."* Neither value appears in the template's comment block. The
   real story vocabulary is seven values; the documented one is five.

**Why not covered.** NFR-6 guards against the comments *changing*. It does not guard
against the comments being *incomplete but well-formed* — which is the state today. A
loud-failure validator that checks structure will pass happily on a vocabulary missing
two live values.

**Consequence.** FR-23 (sprint viewer) and FR-42 (runtime glossary) would mark
`contexted` and `drafted` as invalid or unknown on real files that BMAD itself accepts
and normalizes without complaint. The failure is silent-looking-correct, the mode NFR-6
was written to prevent.

---

### H-6. FR-42 assumes `.claude/skills/`, which is IDE-specific, and 20 of 49 skills are deprecated shims.

**Condition.** `_bmad/_config/manifest.yaml` records `ides: [claude-code]`. The
`.claude/skills/` path is that IDE's install target; the addendum's Tier 1 table names
`target project .claude/skills/*/SKILL.md` as the runtime source. A project that
installed BMAD for a different IDE has `_bmad/` but no `.claude/skills/`.

Separately, **20 of 49 installed skills are deprecation shims** — every one carries
"Deprecated" in its `description:`. Per `_bmad/bmm/v6-shims/README.md` the installer
"discovers skills recursively and installs each one under its own `name`, so nesting
here does not change any installed path" — i.e. shims are flattened into the same
directory as live skills, indistinguishable by location. Some ("`bmad-create-story`,
`bmad-dev-story` — Retained in full") are simultaneously deprecated and functional.

**Why not covered.** FR-42 derives skill purposes "from the target project's own
installed skills" with no filter and no fallback for a missing skills directory. FR-44
requires loud failure on derivation failure — but a project with `_bmad/` and no
`.claude/skills/` is not a failure of derivation, it is a valid install the tool cannot
read, and FR-7's "no recognizable BMAD project" page will not fire because `_bmad/`
exists.

**Consequence.** The glossary presents 20 deprecated aliases alongside 29 live skills
as equivalent capabilities — directly harming the secondary user (§3), who is the
glossary's whole audience and least able to spot a dead alias. On a non-Claude-Code
install, C9 fails wholesale in a state neither FR-7 nor FR-44 describes.

---

### H-7. No project-root discovery. Running from inside the artifact tree yields a false "no BMAD project."

**Condition.** FR-2: "When no path is given, the current working directory is the
target." FR-7: when the target "contains no recognizable BMAD project," serve a page
saying so. There is no requirement to search *upward* for `_bmad/`.

Config values are anchored on `{project-root}` (`planning_artifacts =
"{project-root}/_bmad-output/planning-artifacts"`) and
`resolve_config.py` requires `--project-root … containing _bmad/`. Root identity is
therefore load-bearing, and the tool has no stated way to establish it.

**Why not covered.** The PRD treats "target folder" and "project root" as the same
thing throughout. They diverge in the ordinary case: a user reading a spec in
`_bmad-output/specs/spec-foo/` and typing the command there.

**Consequence.** Running from any subdirectory — including from inside the artifact
tree, which is where a user reviewing artifacts naturally is — produces the FR-7 empty
page listing "what it looked for." The user is told their BMAD project is not a BMAD
project. FR-7 is designed to prevent silent failure and here it produces a confident
wrong answer instead.

**Related, unaddressed.** Monorepos with several `_bmad/` roots (which root wins for a
CWD under two?), a `_bmad/` nested inside another project's artifact tree, and the
symmetric case of a target path that is a *file* rather than a directory, or does not
exist, or is unreadable. FR-1/FR-2/FR-7 cover only "directory, exists, readable, has
`_bmad/`" and "directory, exists, readable, has no `_bmad/`."

---

### H-8. FR-8 forbids filename-based identification; six other FRs require it. Content-sniffing is unbounded.

**Condition.** FR-8: artifacts identified "by reading their content and structure, not
by filename pattern." But FR-20 keys on `review-{slug}.md`, FR-21 on
`reconcile-{slug}.md`, FR-22 on `addendum.md`, FR-49 on both, FR-50 on review file
placement, and C5's whole shard question is filename-shaped (`index.md`). These are
filename patterns.

Simultaneously, FR-8's content-reading has no stated bound while NFR-7 targets a
two-second cold start and NFR-16 makes refresh "the binding performance requirement."
Content-based identification means opening every candidate file on every refresh. The
tree already contains a 245 KB `brain-selector.html` asset, `.pyc` bytecode in
`__pycache__/` (BMAD's retrospective tests leave it in the skills tree),
`.excalidraw` wireframes, `.json`, `.csv`, and per `bmad-ux` a `mockups/` directory of
generated HTML.

**Why not covered.** No requirement states a file-size ceiling, a read-prefix limit, a
binary/encoding guard, a file-count bound, or an exclusion list. NFR-3 covers
*truncated* files; it does not cover files that are valid, enormous, and irrelevant.
Non-UTF-8 content is unmentioned anywhere — `read_text(encoding="utf-8")` in
`memlog.py` shows BMAD assumes UTF-8, but a hand-edited artifact in latin-1 or with a
BOM is not excluded by anything.

**Consequence.** FR-8 as absolutely stated is unimplementable alongside FR-20/21/22;
the PRD should say where the line is. And FR-8 as stated is in direct tension with
NFR-16 — refresh cost scales with total bytes in the tree, not with what changed, on a
tool whose refresh is manual and therefore frequent.

---

## MEDIUM

### M-1. FR-61 marker keying: no first-run, corruption, move, or name-collision behaviour.
FR-61 records "when each project was last viewed" in tool-owned state (NFR-2) but never
says what identifies "each project." Both candidates fail:
- **By `project_name`** — `_bmad/config.toml` sets `project_name = "bmad"`, installer-derived from the directory name. Two checkouts of the same repo, or two unrelated projects in directories called `api`, collide and cross-contaminate each other's "changed since you last looked."
- **By absolute path** — breaks on rename, move, a different clone location, or the same project seen from a WSL path (`/home/...`) and a Windows path (`\\wsl$\...`), or macOS `/tmp` vs `/private/tmp`.

Unspecified: first run with no marker (is *everything* "changed since you last looked"?
That makes UJ-3's headline feature useless on the run where the user most wants it);
a corrupt or partially written marker; a marker newer than every artifact after a clock
change; pruning markers for projects that no longer exist. FR-61 is the mitigation the
PRD accepted in exchange for resolving Open Question 2 against git — so it carries UJ-3
alone (the PRD says so explicitly) — yet it is one sentence long.

### M-2. FR-32 keys on `status: final`, a value two of the five status vocabularies never reach.
Status vocabularies differ per template and are declared in trailing comments, each
with its own delimiter:
- `bmad-architecture/assets/spine-template.md:8` — `status: draft  # draft · final` (middle dot)
- `bmad-build/spec-template.md:5` — `status: 'draft' # draft | ready-for-dev | in-progress | in-review | done` (pipe)
- `bmad-build-auto/spec-template.md:5` — same, **plus `| blocked`**
- `bmad-deep-recon/assets/research.template.md:7` — `status: draft`, no vocabulary
- `bmad-prfaq/assets/prfaq-template.md:3` — `status: "{status}"`, no vocabulary

FR-32 surfaces "documents marked `status: final` that still carry unresolved open
items." A `bmad-build` spec terminates at `done`, never `final`; a `build-auto` spec can
be `blocked`. FR-32 therefore never fires on build specs — the artifact family most
likely to be sitting finished-but-unreviewed. NFR-6's loud-failure guard is scoped to
`sprint-status-template.yaml` only and does not cover these markdown comment
vocabularies at all.

Quoting also varies: `created: {YYYY-MM-DD}` unquoted (parses as a YAML **date object**)
versus `created: '{date}'` quoted (a **string**). Same field, two types, depending on
which skill wrote the file — and an unsubstituted run leaves the literal `{date}`.

### M-3. Symlinks are a supported shape BMAD handles deliberately; the PRD is silent.
`sprint_plan.py:_atomic_write` opens with `path = os.path.realpath(path)` and documents
why: *"`path` is resolved through symlinks first: renaming onto a symlink would detach
the link and leave the real file stale."* BMAD anticipates symlinked artifacts. NFR-10
confines serving to "the target project's artifact tree" without saying whether that
means the logical tree or the resolved one — a symlinked artifact is inside the former
and outside the latter. Also unaddressed: symlink loops during traversal (NFR-7's
2-second budget), a symlinked *directory* creating the same subtree twice in the corpus
view, and Windows behaviour where symlink creation is privileged (NFR-12).

### M-4. Concurrency: the PRD treats all writers as equally unsafe; they are not, and the unsafe ones are the documents.
NFR-3 covers truncation generically. On disk the risk is precisely inverted from what
that implies:
- **Safe** — `.memlog.md` and `sprint-status.yaml` are written via temp + `fsync` + `os.replace`. A reader never observes a partial file. Only the `.tmp` sibling is transiently visible (see H-4).
- **Unsafe** — `prd.md`, `SPEC.md`, `ARCHITECTURE-SPINE.md`, `review-*.md`, `addendum.md` are written directly by the LLM's file tools with no atomicity guarantee. Frontmatter is written before the body, so a mid-write read yields *valid YAML frontmatter with a truncated body* — which parses cleanly and renders as a real, shorter document. NFR-3 says "without presenting corrupt data as valid," but a truncated markdown body is indistinguishable from a short one.

Specifically unaddressed and specifically real: `bmad-prd/customize.toml` and
`bmad-architecture` dispatch **parallel reviewer subagents, each writing its own
`review-{slug}.md` into the same folder**. A refresh during Finalize sees a folder whose
file set is growing between the directory listing and the reads — the "run folder
created while rendering" and "files appearing between listing and reading" cases. FR-33
aggregates reviewer findings across the project and would report a partial aggregate
with no indication it is partial. FR-47 ("displayed data states how current it is")
assumes a single coherent read instant; a tree walk has none.

Also unaddressed: a file deleted between listing and reading (ordinary during a
`--fresh` sprint-status rebuild), and read-permission-denied subtrees mid-walk —
NFR-4's per-artifact degradation is defined for *unparseable*, not for *unreadable* or
*vanished*.

### M-5. Memlog parsing: BMAD's parser is not YAML, and the entry tag grammar is ambiguous.
`memlog.py:split()` parses frontmatter with a hand-rolled `line.split(":", 1)`, not a
YAML parser, and terminates on the first line *exactly* `---`. A dashboard using a real
YAML parser will disagree with BMAD on inputs BMAD accepts happily — e.g. `topic: Onboarding: v2`
(BMAD: value `Onboarding: v2`; strict YAML: a mapping-value error). NFR-4 would then
show an error on a file BMAD considers fine.

The entry grammar `- (type) text` / `- (type by who) text` / `- (by who) text` /
`- text` is ambiguous: an untyped entry whose text opens with a parenthetical is
misparsed as a typed entry. `split()` raises on a memlog with no frontmatter or an
unterminated one — the "malformed `.memlog.md`" case — and FR-19 does not say whether
the viewer shows entries recovered from a memlog whose frontmatter is broken but whose
body is intact.

### M-6. `development_status` key grammar: unclassifiable keys are simultaneously legal and illegal.
`sprint_plan.py` defines `EPIC_KEY_RE ^epic-(\d+)$`, `RETRO_KEY_RE
^epic-(\d+)-retrospective$`, `STORY_KEY_RE ^(\d+)-(\d+)([a-z]?)-.+` (the `[a-z]?`
carries split stories like `2-6a-…`). BMAD contradicts itself on anything else:
`generate-tracking.md:16` says merging preserves "`action_items`, custom keys, and user
comments"; `sprint_plan.py:633` reports `unrecognized key '{key}' (expected epic-N,
N-M-slug, or epic-N-retrospective)`. So a valid file can contain keys the tool cannot
classify. FR-23 does not say what the sprint viewer does with them.

`development_status` is a flat map — epic/story association is a *string-prefix
convention*, not structure. `epic-1` and `epic-10` share a prefix. Duplicate YAML keys
(easy to produce by hand-merging a conflict) are accepted last-wins by most parsers
with no error. `action_items` joins by `epic: 1` (an **integer**) against keys of the
form `epic-1` (a **string**) — FR-23 requires presenting action items with their
epics and the join needs a type coercion nobody has specified.

### M-7. Reviewer output splits three ways, not two, and FR-50's "wherever the skill writes them" is not a locatable rule.
- `{doc_workspace}/review-{slug}.md` — `bmad-prd`, `bmad-product-brief`, `bmad-ux` (workspace root)
- `{doc_workspace}/reviews/review-{slug}.md` — `bmad-architecture`, explicitly *"a subfolder, so the gate's scratch stays out of the deliverable folder"*
- `{doc_workspace}/validation-report.md` **and** `validation-report.html` — a fourth reviewer output shape entirely, plus `review-rubric.md`

FR-50 says reviews are found "wherever the producing skill writes them." The tool
cannot know which skill produced a folder without already having interpreted it. FR-20
and FR-33 both need this resolved. The `.html` validation report is a reviewer finding
in a format FR-20's viewer cannot read and FR-28's search should probably not index.

### M-8. FR-31's own coverage numbers do not reproduce, in a requirement whose sole purpose is honesty.
The PRD states `[ASSUMPTION]` "appears in 6" of 49 skills and `[NOTE FOR PM]` in 3.
Measured: **6 files across 4 skills** (architecture, prd, product-brief, ux) and
**3 files across 1 skill** (prd). The counts are file counts presented as skill counts.
The corrected figures are worse than stated — `[NOTE FOR PM]` is emitted by one skill,
not three. Given FR-31 exists specifically so the UI does not overstate coverage, and
§2.3 calls these numbers "a known limitation, measured," a requirement that overstates
by 3x is a defect in the thing it is measuring.

### M-9. Slug-derived folder names are unsanitized free text used directly as paths.
`spec-{slug}` and forge's bare `{slug}` are "resolved against the input-derived slug at
activation" — LLM-generated from user input, validated by nothing. FR-49 correctly says
slugs are not identities, but says nothing about them as *path components*. Unhandled:
a slug beginning with `.` (the run folder becomes hidden — see H-4, and it disappears
from the corpus entirely); a slug containing `..` or `/`; spaces, quotes, or shell
metacharacters (relevant to FR-24's copy-command and open-in-editor affordances and to
FR-27's permalinks); non-ASCII, where NFD/NFC normalization differs between macOS and
Linux so the same slug is two folders after a sync; and length against Windows path
limits (NFR-12). On a **case-insensitive filesystem**, `spec-Foo` and `spec-foo` are one
folder on macOS and two on Linux — so FR-49's "deliberately reused to reopen an existing
folder" behaves differently per platform, and BMAD's uppercase-by-convention filenames
(`SPEC.md`, `ARCHITECTURE-SPINE.md`, `EXPERIENCE.md`, `DESIGN.md`) sit beside lowercase
peers (`prd.md`, `brief.md`, `research.md`) with no case rule stated for discovery.

### M-10. Environment: FR-4/FR-5/FR-6 cover the happy path and one flag.
- **Port** — FR-4 says the tool "selects an available port automatically." Unstated: behaviour when no port can be bound, when a *previous instance of this tool* is already serving the same project (a second browser tab on stale state, FR-47 notwithstanding), and whether a user-specified port is even possible. NFR-9 requires loopback-only; on WSL2 the browser runs on the Windows host and `127.0.0.1` in the guest is not the host's loopback — NFR-13 names WSL as an environment that "remains usable via the reported URL," but the reported URL is exactly what does not resolve there. That is the one environment where FR-6's fallback does not fall back.
- **Browser** — FR-5 opens the default browser; FR-6 suppresses it *by flag*. Nothing covers automatic detection of the impossible case (no `$DISPLAY`, no `xdg-open`, headless container), so the default path in a container is a launch attempt that fails or hangs, and FR-6 requires the user to already know to pass the flag. NFR-13 asserts the outcome without a requirement that produces it.
- **Lifetime** — nothing states when the server stops. A `npx` process on an SSH session that disconnects, or a container that outlives the terminal, leaves a loopback server running against a project tree with no stated shutdown.

### M-11. `_bmad/render/` is fully gitignored, and UJ-3 begins with a `git pull`.
`_bmad/render/.gitignore` is `*` plus `!.gitignore` — the rendered-skill output
directory is empty on every fresh clone until something regenerates it. Combined with
`_bmad/custom/.gitignore` (`*.user.toml`), the freshly-pulled project of UJ-3 is
materially different from the one the artifacts were produced against: no rendered
skills, no personal config layer, no personal skill overrides. UJ-3 is the journey the
PRD calls "most exposed," and FR-42's runtime derivation runs against a tree that is
missing generated content by design. No requirement acknowledges that a clone is a
partial install.

---

## Cross-cutting observation

Nine of the twenty-four findings share one root: **the PRD reasons about BMAD's
*documented intent* where the *implementation* is looser.** `override` entries are
described in File-roles prose as though universal; they are emitted once. Status
vocabularies are documented in comments; the code carries two more. `customize.toml` is
named as customization; it is the default. `sprint-status.yaml` is treated as present;
it is optional. In every case the PRD's model is the tidier one.

This matters more than usual for this product. A tool whose only job is oversight, and
whose stated first-order failure mode is the dismissible false alarm (FR-56), inherits
its credibility from the accuracy of these premises. The document's intellectual
honesty about what it *cannot* know (§2.3, FR-31, FR-48, FR-59, UJ-2 Part B) is its
strongest feature — and it is undercut by the premises it did not re-verify.
