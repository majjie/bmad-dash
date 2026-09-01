---
title: Addendum — bmad-dash
status: final
created: 2026-08-28
updated: 2026-08-28
parent: prd.md
---

# Addendum — bmad-dash

This addendum holds depth that belongs downstream, in architecture, solution design, or UX spec, rather than in the requirement narrative of its parent PRD (`prd.md`).

## Glossary derivation — mechanism

FR-42 to FR-44 require that concept explanations stay true to the BMAD version installed in the target project. **The recommendation is runtime derivation from the target project, with a shipped baseline for the tier that cannot be derived.** This is the investigation behind it.

### Extractability, measured

Tested against the BMAD v6.11.0 install in this repository.

**Tier 1 — reliable and fully automatable.** Every skill carries YAML frontmatter with `name` and `description`. Verified **49/49** skills. Descriptions are substantive and written for routing ("Distill any intent input into the SPEC kernel + companions… Use when the user says…"). This tier answers *what is `bmad-correct-course` for?* with zero authoring effort and no drift risk.

**Tier 2 — semi-structured and fragile.** Status vocabularies are defined in `bmad-sprint-planning/sprint-status-template.yaml`: epic states, story states, retrospective states, and action-item states, each with a one-line gloss. Machine-extractable via pattern, **but the definitions live in YAML comments**. Comments are not a contract — they can be reworded, reformatted or dropped by an upstream refactor with no test failing. Extraction here needs a validation step that fails visibly rather than silently producing an empty glossary.

**Tier 3 — not extractable.** Conceptual definitions exist only as prose distributed across SKILL.md bodies and `references/`: what a memlog *is*, how an epic differs from a story, what "sharded" means, what `[ASSUMPTION]` tags signify, why read-only matters. There is no structured source. Tier 3 is the tier a newer user needs most, and it must be hand-authored.

### Build time versus runtime — recommendation

The original proposal was extraction as a build step at dashboard publish time. Recommended instead: **runtime derivation from the target project, with a shipped baseline.**

| Tier | Source | Timing | Notes |
|---|---|---|---|
| 1 — skill purposes | target project `.claude/skills/*/SKILL.md` frontmatter | runtime | — |
| 2 — status vocabularies | target project template and asset files | runtime | validation must fail visibly |
| 3 — concepts | hand-authored content shipped with the dashboard | build time | keyed by version range |

Rationale: the dashboard points at an arbitrary project folder, which has *its own* `.claude/skills/` at *its own* BMAD version, potentially with org-specific skills in `_bmad/custom/` and overrides in `customize.toml`. Build-time extraction bakes in one version's glossary and relocates the drift problem rather than removing it — a dashboard shipping a v6.11.0 glossary to a user on v6.14.0 is wrong in a way that is invisible to both the dashboard and the user. Runtime derivation is automatically correct for whatever is installed, and picks up custom skills the dashboard's authors have never seen.

Tier 3 entries should carry version-range metadata, so that when the installed BMAD version falls outside the range the text was written against, the explanation is withheld rather than shown wrongly.

### Consequences

- Upkeep cost for the glossary drops substantially but does not vanish; Tier 3 remains hand-authored.
- Tier 2 requires an upstream-fragility guard.
- Reading `_bmad/custom/` surfaces org-authored skill descriptions in the UI. That is harmless locally, but relevant to any future export, share or screenshot feature.
