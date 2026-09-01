# BMAD source shapes

What the target project actually contains, measured against a BMAD **v6.11.0** install. Every entry here bends an implementation decision; several contradict what the artifact names imply. Treat the tolerant reading as correct.

## Run folders

Seven families, produced by different skills: briefs, PRDs, architecture, UX designs, research, specs, forge.

- Four use `{family}-{project_name}-{date}`. Both components are constant within a day, so **same-day reruns land in the same folder** — one folder is not one run.
- `spec-{slug}` and `{slug}` carry **no date at all**, and a spec folder is deliberately reopened under the same slug to update in place.
- A run folder and a sharded document are **not reliably distinguishable**: BMAD's own discovery uses a `*prd*/index.md` glob and resolves ambiguity by asking a human.

## Slugs are names, not identities

`{slug}` means something different in each position:

| Where | What it names |
| --- | --- |
| `review-{slug}.md` | the reviewer or lens |
| `reconcile-{slug}.md` | the source input being reconciled |
| `spec-{slug}/` | the subject, reused deliberately to reopen the folder |
| `{research_type}-{topic_slug}-{date}/` | the research topic |

Slugs are **free text that nothing sanitizes**, and they reach a consumer as both filesystem paths and URL components.

## Document naming and layout

Filenames vary legitimately — `prd.md`, `bmm-prd.md`, `product-requirements.md` all occur, and BMAD instructs its own skills to identify documents by reading them rather than by pattern. A document exists either as one file or **sharded** as a directory with `index.md`. Both are normal.

## Timestamps

Four incompatible formats coexist, three of them timezone-naive:

| Source | Format | Resolution |
| --- | --- | --- |
| `sprint-status.yaml` | `MM-DD-YYYY HH:MM` (month-first) | minute |
| `.memlog.md` frontmatter `updated` | `YYYY-MM-DDTHH:MM` | minute |
| Document frontmatter `created` / `updated` | `YYYY-MM-DD` | **day** |
| Filesystem mtime | epoch | instant, timezone-aware |

Document frontmatter cannot order two events within a day. Filesystem mtime is not an activity signal at all: a clone, checkout, branch switch, copy, or pull rewrites it wholesale.

## The memlog is weaker than it looks

- Entries carry **no per-entry timestamp**. The format is `- (type) text`. A memlog records *sequence within one file* and cannot be interleaved with another on a timeline.
- The type vocabulary is **not enforced**: `memlog.py` states that the host skill names the vocabulary and "the script does not enforce one".
- Only **9 of 49** skills write a memlog, and every one is planning-side. `bmad-build` writes none — so a completed build stage leaves no decision trail, which is the commonest case for stage verification.

## Risk markers are convention, not contract

`[ASSUMPTION]` is emitted by 4 skills; `[NOTE FOR PM]` by one (`bmad-prd` itself). Of 49 installed skills, 20 are deprecated forwarding stubs, leaving an effective denominator near 29. **Absence of a marker does not mean absence of risk.**

## Files that are not what their name suggests

- **`customize.toml` inside a skill is the shipped default**, not a project's customization — 35 of them carry `DO NOT EDIT -- overwritten on every update`. Real project deviations live in `_bmad/custom/*.toml`. Reading the former as deviation reports ~35 fabricated findings on every project.
- **Status vocabularies are defined in YAML comments** in `sprint-status-template.yaml` (epic, story, retrospective, and action-item states). Comments are not a contract; no test protects them.
- **`story_location`** is a per-project field inside `sprint-status.yaml`, not a fixed path. It may be **absolute** and may point outside the project — `/custom/stories` is an explicitly tested value.
- **Review outputs are written to two places** — the workspace root by some skills, a `reviews/` subfolder by others.

## Git

BMAD ships `bmad-retrospective/scripts/git_evidence.py`, documented as a tool that "only MEASURES — it never judges", so reading git is established practice.

But `git status --porcelain` **writes** to `.git/index`, and a repository's own `core.fsmonitor` configuration can cause command execution. Neither is visible to a check that only guards filesystem imports.

## What BMAD does not record

- **No correlation identity between artifacts.** Nothing links a PRD to the architecture, epics, and stories descended from it. The only join keys are naming conventions and dates, both coincidental.
- **No version or hash stamping of source documents.** Of all shipped templates, `source:` and `inputs:` frontmatter appear once each, against `updated:` in six. Drift is managed conversationally at authoring time and leaves nothing a later reader can check.

Both are gaps in BMAD itself, recorded upstream as candidate contributions rather than problems to engineer around. They cap how well any tool can present lineage.
