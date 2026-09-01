---
review: cross-spine seam check
subject: DESIGN.md ⇄ EXPERIENCE.md (ux-bmad-2026-08-28)
date: 2026-09-01
verdict: REVISE — the seam is structurally sound but leaks in 47 places; 4 findings are blocking
---

# Cross-spine seam review — DESIGN.md ⇄ EXPERIENCE.md

Scope: only the join between the two peer spines. Each document is internally
coherent enough to ship on its own; the defects below live in the gap between
them, plus a handful of places where a document contradicts itself in a way that
only becomes visible when the other document is held against it.

**Method.** Every `{path.to.token}` reference in both documents was extracted and
resolved literally against the DESIGN.md YAML. Every token defined in the
frontmatter was searched for as a referent in both documents' prose and in the
`components` block. Every behavioural requirement in EXPERIENCE.md was searched
for a visual counterpart, and every component in DESIGN.md for a behavioural one.

**Headline.** The single most damaging finding is not an orphan or a dangling
path — it is that DESIGN.md's evidence-badge rule and its own "one primary accent
per tile" prohibition cannot both hold in the Recent activity tile, which is the
tile the product exists for (F5.1).

**Counts**

| # | Category | Findings |
|---|---|---|
| 1 | Orphan tokens | 13 |
| 2 | Dangling / ill-typed references | 3 |
| 3 | Behaviour with no visual specification | 15 |
| 4 | Visual specification with no behaviour | 5 |
| 5 | Contradictions | 8 |
| 6 | Hardcoded values bypassing tokens | 9 |
| 7 | Naming drift | 7 |
| | **Total** | **47** (4 blocking, 16 significant, 27 minor) |

**Blocking:** F5.1, F5.2, F3.1, F5.5.

---

## 0. Structural observation: the seam is one-directional

EXPERIENCE.md contains **zero** `{path.to.token}` references. Not one. The brief
for these spines is that EXPERIENCE.md references DESIGN.md tokens *by name*
rather than restating values, and it does honour the weaker half of that contract
— it names components ("Tile", "Signal pill", "Evidence badge") and it defers
explicitly three times (`EXPERIENCE.md:21`, `:77`, `:153`). But it never once
names a token. The consequence is that every mapping from behaviour to
appearance is inferred by the reader, which is precisely how the 15 findings in
§3 accumulated undetected.

The link is also asymmetric: `EXPERIENCE.md:12` carries `design: ./DESIGN.md`,
but DESIGN.md's frontmatter has no `experience:` back-pointer. For peers, the
reference should run both ways.

*Minimum fix:* add `experience: ./EXPERIENCE.md` to DESIGN.md frontmatter. Adopt
a convention that EXPERIENCE.md names the token wherever it asserts an
appearance-bearing requirement (states, weights, currency, focus), even if only
as a trailing `→ {colors.signal-unreadable}`.

Note also a sources drift: `EXPERIENCE.md:9` lists
`specs/spec-bmad-dash/bmad-source-shapes.md`, which DESIGN.md's `sources` omits.
All four listed source paths were verified to exist.

---

## 1. Orphan tokens (13)

Defined in DESIGN.md frontmatter, referenced by nothing in either document's
prose or in any component token.

### 1.1 The four signal container colours — genuinely unused, and the gap is structural

| Token | Line | Value |
|---|---|---|
| `colors.signal-present-container` | `DESIGN.md:28` | `#1D3A37` |
| `colors.signal-absent-container` | `DESIGN.md:30` | `#20282A` |
| `colors.signal-unreadable-container` | `DESIGN.md:32` | `#3D2F20` |
| `colors.signal-unchecked-container` | `DESIGN.md:34` | `#2A2333` |

These are not reserved — they are stranded. The component that needs them is
`components.signal-pill` (`DESIGN.md:128-131`), which defines `type`,
`borderRadius` and `paddingX` and **no colour at all**. So the one component in
the system whose entire job is to carry a colour-plus-text state has no colour
token, while the four background colours built for it sit unreferenced four
lines above. `DESIGN.md:169` and `:227` and `EXPERIENCE.md:85` all assert
"colour plus text always, never colour alone" — and the token layer cannot
currently express which colour.

*Minimum fix:* the signal pill is state-varying, so give it a per-state map
rather than flat keys:

```yaml
  signal-pill:
    type: '{typography.mono-badge}'
    borderRadius: '{rounded.full}'
    paddingX: '{spacing.2}'
    present:    { color: '{colors.signal-present}',    background: '{colors.signal-present-container}' }
    absent:     { color: '{colors.signal-absent}',     background: '{colors.signal-absent-container}' }
    unreadable: { color: '{colors.signal-unreadable}', background: '{colors.signal-unreadable-container}' }
    unchecked:  { color: '{colors.signal-unchecked}',  background: '{colors.signal-unchecked-container}' }
```

This is the highest-value single edit in this review: it closes one orphan class,
one dangling-component gap, and part of F3.7 at once.

### 1.2 `colors.on-primary-container` — genuinely unused

`DESIGN.md:26`, `#7FD9CD`. No referent anywhere. Its M3 pair
`colors.primary-container` is used (as `evidence-badge.strongBorder`,
`DESIGN.md:125`), but the "on" colour intended to sit on top of it is not — the
badge's `strongColor` is `{colors.primary}` instead.

Worse, its value is *byte-identical to `colors.signal-present`*
(`DESIGN.md:27`, `#7FD9CD`). See F5.3 — this is the mechanism by which "state
never borrows the accent" is already false.

*Minimum fix:* either delete it, or use it as `evidence-badge.strongColor` in
place of `{colors.primary}` — which would also relieve the primary-overload in
F5.1. The latter is the better fix and resolves two findings.

### 1.3 Six base spacing steps — reserved by convention, but the claim is not stated

`spacing.1` (`:90`), `spacing.3` (`:92`), `spacing.4` (`:93`), `spacing.5`
(`:94`), `spacing.6` (`:95`), `spacing.8` (`:96`). Only `spacing.2` is
referenced (twice, as `paddingX` on the two badge components).

**Judgement: deliberately reserved, but undeclared.** These are a Tailwind-shaped
base scale, and `DESIGN.md:187` explicitly frames the system as "A 4px base
scale" — so their existence is justified. But unlike the container ladder (see
§1.6), the document never says they are a scale from which future values are
drawn rather than a set of live tokens. A reader auditing for orphans cannot
distinguish them from F1.1.

*Minimum fix:* one clause at `DESIGN.md:187`: "A 4px base scale — `spacing.1`
through `spacing.8` are the ladder from which all new values are drawn; the
named tokens below are the ones v1 actually uses."

### 1.4 `rounded.DEFAULT` — reserved by convention, and redundant by value

`DESIGN.md:87`, `'6px'` — identical to `rounded.md` (`:84`). Never referenced as
`{rounded.DEFAULT}`. `DESIGN.md:215` says "`{rounded.md}` as the default for
inputs and containers", i.e. the prose expresses the default through `md`, not
through `DEFAULT`.

**Judgement: reserved for build-tool convention** (Tailwind reads `DEFAULT` to
emit a bare `rounded` class). Legitimate, but it duplicates a literal rather
than referencing its sibling.

*Minimum fix:* `DEFAULT: '{rounded.md}'`, and note the convention inline.

### 1.5 `components.tile-raised` — orphan component

`DESIGN.md:110-113`. Named in neither document's prose. `DESIGN.md:205` describes
elevation level 2 as "tile carrying primary attention, and popovers" and
`components.tile-raised.background` is exactly that level's
`{colors.surface-container-high}` — but the two are never connected, and
EXPERIENCE.md never nominates any tile as raised. See also F4.1.

*Minimum fix:* name it at `DESIGN.md:205` ("level 2 — `tile-raised`, and
popovers") and have EXPERIENCE.md's Dashboard composition (`:42-45`) say which
tile, if any, is raised.

### 1.6 Verification of the reservation claim for the two unused container levels

The task asks whether the document *states* the reservation or whether the
reader is assumed to infer it. **The claim is stated, explicitly and in the right
place.** `DESIGN.md:207`:

> `{colors.surface-container}` and `{colors.surface-container-highest}` exist for
> hover and for a future third level; they are not used at rest in v1.

So these two are correctly **not** orphans — they are declared reserves, and this
is the model the six spacing steps in §1.3 should follow. Two problems remain,
however:

- **The hover half of the reservation is unclaimed by EXPERIENCE.md.**
  EXPERIENCE.md specifies five states per surface (`:95`) — Loading, Refreshing,
  Empty, Degraded, Stale — and *no hover state anywhere in the document*. DESIGN
  reserves a tone for an interaction state that its peer never requires. Either
  EXPERIENCE.md should specify hover (rows and cards are clickable per `:81`
  and `:87`), or the reservation should say "for a future hover state".
- **"a future third level" is off by one.** `DESIGN.md:199` says "Three levels
  are in use" and the table enumerates levels 0, 1 and 2 — so the next level is
  the *fourth*, or level 3. As written, "third level" collides with the level-2
  row that already exists. See F5.7.

*Minimum fix:* reword `:207` to "…for hover and for a future level 3"; and add
hover to EXPERIENCE.md's state set or drop the hover reservation.

---

## 2. Dangling and ill-typed references (3)

Every one of the 80 `{path.to.token}` references in DESIGN.md was resolved
literally against the YAML. **No reference points at a non-existent path** —
`colors.*`, `typography.*`, `rounded.*` and `spacing.*` all resolve, including
`{spacing.2}` against the quoted key `'2'`. Clean on that axis. Three references
resolve to the wrong *kind* of thing, however, which is a dangling reference in
practice: the value cannot be substituted where it is used.

### 2.1 `{components.focus-ring}` resolves to a map, not a value — `DESIGN.md:233`

> **Focus ring** — `{components.focus-ring}`, 2px of `{colors.focus-ring}` at 2px offset…

The path resolves to the four-key object at `DESIGN.md:143-146`. Substituting it
into prose yields a serialized map. It is also the *only* `components.*`
reference in either document, and it is immediately followed by a manual restatement
of the very values it was supposed to stand in for (see F6.3).

*Minimum fix:* `**Focus ring** — {components.focus-ring.width} of
{components.focus-ring.color} at {components.focus-ring.offset} offset, on every
focusable element without exception.`

### 2.2 `{typography.body-dense}` used as a scalar size — `DESIGN.md:250`

> Don't shrink type below `{typography.body-dense}` to gain density

The comparison is against a font size, but the path resolves to a five-key type
role. (`DESIGN.md:177` and `:189` also reference type roles, but there they
correctly denote the role itself, not a scalar.)

*Minimum fix:* `{typography.body-dense.fontSize}`. But see F5.5 — this rule is
false whichever way it is typed.

### 2.3 `{spacing.reading-measure}` is not a spacing value — `DESIGN.md:101`

`'68ch'` lives in the `spacing` group alongside px steps, and is referenced at
`:181` and `:195` as a line-length cap. A `ch` measure is not commensurable with
a 4px scale, so any consumer that treats the `spacing` group as a uniform scale
(a Tailwind spacing extension, for instance) will emit a nonsense
`p-reading-measure` / `gap-reading-measure`.

*Minimum fix:* move it to its own group — `measure: { reading: '68ch' }` — and
update the two references.

---

## 3. Behaviour with no visual specification (15)

EXPERIENCE.md requires these; DESIGN.md offers no token, no component, and in
most cases no prose. Ordered by consequence.

### 3.1 Refresh progress — determinate *and* indeterminate — BLOCKING

`EXPERIENCE.md:99`:

> Progress is visible in the project header because the scan head-reads every
> file and lags on a large tree: **determinate where file count is known,
> indeterminate otherwise.**

That is two distinct visual components. DESIGN.md specifies neither, has no
progress token of any kind, and — critically — **contains no motion tokens at
all**: no duration, no easing, no delay. Yet `EXPERIENCE.md:149` states "Only
refresh progress and focus transitions move. All motion respects
`prefers-reduced-motion`." An indeterminate progress indicator is *by definition*
animated, so the one animation v1 ships has no specified duration, easing, track
colour, fill colour, height, or reduced-motion fallback. `prefers-reduced-motion`
appears nowhere in DESIGN.md.

This is blocking because refresh is FR-37, the only user-initiated action in the
product, and an indeterminate indicator with no reduced-motion fallback is a
2.3.3 / 2.2.2 exposure against EXPERIENCE.md's own AA floor (`:153`).

*Minimum fix:* add a `motion` group (`duration.fast`, `duration.slow`,
`easing.standard`) and a `components.progress` with `determinate` and
`indeterminate` variants, track/fill colours drawn from
`{colors.outline-variant}` / `{colors.primary}`, plus an explicit statement of
the reduced-motion substitute (a static determinate bar, or text only).

### 3.2 Project header — the surface that holds four distinct things

`EXPERIENCE.md:45`: "full width above the tiles: project name, resolved path,
snapshot currency, refresh control." Plus the progress region (`:99`) and the
"header offers the new snapshot" completion affordance (`:99`).

DESIGN.md has no `project-header` component and never mentions the header. The
closest hooks are `{typography.display}` "for the page title" (`:177`) and
`{typography.mono}` for paths (`:179`), but neither is bound to the header, and
snapshot currency — a phrase, not an identifier — has no type role assigned.
This is also the only full-width, non-tile region on the dashboard, and
DESIGN.md's Layout section (`:187-195`) describes only tiles and reading
surfaces.

*Minimum fix:* a `components.project-header` token set, and one sentence in
DESIGN.md's Layout section binding display/mono/body roles to its four slots.

### 3.3 Contents rail — including its current-section marker

`EXPERIENCE.md:90`: "accompanies the Document reader; **marks the current
section**; is a nav landmark; scrolls independently of content." Also `:36` and
`:165`.

DESIGN.md mentions it once, in passing — "with its contents rail beside it"
(`:195`) — and gives it no component, no width, no type role, and above all **no
treatment for the current-section marker**. That marker is a live, changing
visual state, and there is no token for it. It is the most obvious candidate for
`{colors.surface-container}` (the reserved hover tone) or for
`{colors.primary}`, but nothing says so.

*Minimum fix:* `components.contents-rail` with `width`, `itemType`,
`itemColor`, `currentColor`, `currentIndicator`.

### 3.4 Comparison pane

`EXPERIENCE.md:91` and `:37`, and it is the climax of UJ-2 (`:188`). Two panes,
each independently scrollable, each labelled with identity and currency,
deliberately with no relationship asserted between them.

DESIGN.md contains no reference to Comparison at all: no two-pane layout, no
divider between panes, no pane-label type role. The restraint that UJ-2 says
"is what makes the panes trustworthy" is a *visual* claim — panes must look
parallel and unlinked, with no connecting affordance — and no visual spec
carries it.

*Minimum fix:* a Comparison entry in DESIGN.md's Layout section (pane split,
divider via `{colors.outline}`, label type) and a note that no visual element may
span or align the two panes.

### 3.5 Filter controls and the clear-filter action

`EXPERIENCE.md:147` (filter by family and time window, FR-17) and `:103`
("`No matches. 14 items hidden by filter.` with a clear-filter action").

DESIGN.md has no filter component: no chip, no select, no input. `DESIGN.md:215`
promises "`{rounded.md}` as the default for **inputs** and containers" — but no
input component exists anywhere in the frontmatter, so `rounded.md`'s stated
purpose has no consumer (see F4.4).

*Minimum fix:* a `components.filter-chip` (or `select`) token set; state whether
the clear-filter action is `button-ghost`.

### 3.6 Modal overlay, focus trap, and scrim

`EXPERIENCE.md:135` (`Escape` "closes any open overlay first") and `:155` ("no
keyboard traps outside a **modal overlay**, which returns focus to its trigger on
close").

DESIGN.md acknowledges "popovers" at elevation level 2 (`:205`) but defines no
overlay or popover component, and — the substantive gap — **no scrim colour**.
Compounding it, `DESIGN.md:211` forbids shadow and blur outright, which removes
the two conventional ways to separate an overlay from its ground on a dark
surface, leaving tone alone to do it. That is workable, but it must be specified,
not left to the implementer.

*Minimum fix:* `components.overlay` with `background:
'{colors.surface-container-high}'`, a `scrim` colour token, and a sentence in
Elevation explaining how an overlay reads as above the page without shadow.

### 3.7 Degraded artifact rendering

`EXPERIENCE.md:106`: a failed-to-parse artifact "renders as a row or card stating
what failed and at which stage (AD-7). It is never omitted and never crashes its
neighbours."

DESIGN.md has `{colors.signal-unreadable}` and its stranded container (§1.1) but
never connects either to the degraded row or card, and `components.activity-row`
(`:114-119`) has no degraded variant. The Components section (`:221-233`) does
not mention degradation at all.

*Minimum fix:* an `activity-row.degraded` variant bound to
`{colors.signal-unreadable}` / `{colors.signal-unreadable-container}`, and one
line in DESIGN.md's Activity row entry.

### 3.8 Stale notice

`EXPERIENCE.md:108` and the load-bearing string at `:70`: "`This file changed
after the last scan.` + refresh action".

There is no notice, banner, or inline-alert component in DESIGN.md. This string
appears at the top of a reading surface and must be noticeable without being
alarming — a real visual design problem with no spec.

*Minimum fix:* `components.notice` with `background`, `borderColor`, `type`, and
a note that it uses no signal colour (it is not one of the four states).

### 3.9 Focused / current row in a keyboard-navigated list

`EXPERIENCE.md:134`: `↑ ↓` or `k j` "move between rows within the focused list";
`:133` Tab order; `:136` Enter opens "the focused row".

`components.activity-row` has no focus, hover, or current treatment. The focus
ring covers the ring itself, but roving-focus lists conventionally also need a
row background change, and the reserved hover tone
(`{colors.surface-container}`, §1.6) is the obvious candidate and is never
assigned. On a dense dark grid, ring-only focus at 2px offset inside 15px of
padding is tight.

*Minimum fix:* add `hoverBackground` and `focusBackground` to
`components.activity-row`, drawing on `{colors.surface-container}`.

### 3.10 `Order unknown` group header

`EXPERIENCE.md:69`, `:116`, `:194`. Items that cannot be ordered are "grouped,
not interleaved" under a header — a structural element inside the Recent activity
tile.

DESIGN.md's `{typography.title}` claims "section headings" (`:177`) but is never
bound to any component, so the group header has no specified type role, colour,
or separation from the rows above it. This matters because `DESIGN.md:253`
forbids a tile carrying "two kinds of information" — a grouped tail arguably is a
second kind, and the design never rules on it.

*Minimum fix:* bind `{typography.title}` (or `tile-label`) to a
`activity-row-group` header token, and state that a group tail does not count as
a second kind of information.

### 3.11 Memlog typed timeline, with `override` and `assumption` "visually distinct"

`EXPERIENCE.md:177` (UJ-1 step 3): "The memlog viewer shows the trail as a typed
timeline, with `override` and `assumption` entries **visually distinct**."

This is an explicit, unambiguous *visual* requirement — the word is "visually" —
and it is the mechanism of UJ-1's climax at `:178` ("It is the thing he came to
find"). DESIGN.md has no timeline component, no entry-type tokens, and no
guidance on how to distinguish entry types. Because `DESIGN.md:169` closes the
four signal colours against reuse and `:252` forbids reusing them as a ramp, the
implementer cannot reach for them either — leaving no sanctioned means at all.

*Minimum fix:* a `components.memlog-entry` with per-type accents, plus an
explicit statement of which colours entry types may use given the closed signal
set. This is the most consequential of the non-blocking §3 findings.

### 3.12 Read-only affordances, and the absence of any icon specification

`EXPERIENCE.md:145`: "copy the artifact's path, open it in the user's editor,
copy a section permalink."

Three controls with no specified appearance. DESIGN.md's Buttons entry (`:231`)
says `button-ghost` is "for everything else", which arguably covers them by
default, but never says so. More broadly, **DESIGN.md specifies no icons at
all** — no icon set, no icon size token, no icon colour role — while these three
affordances are the canonical icon-button case in a dense header.

*Minimum fix:* state that read-only affordances are `button-ghost`; add an
`icon` size token and a statement of whether v1 uses icons at all.

### 3.13 Empty-state text has no assigned role

`EXPERIENCE.md:101-104` specifies three distinct empty messages by cause. No type
role or colour is assigned to empty-state copy in DESIGN.md.
`{colors.on-surface-variant}` is the likely intent, but note that
`{colors.on-surface-faint}` is explicitly reserved for "one purpose: an absent
core artifact" (`DESIGN.md:167`), so empty copy may *not* use it.

*Minimum fix:* one clause in DESIGN.md's Colors section assigning empty-state
copy to `{colors.on-surface-variant}`.

### 3.14 The `No project` surface

`EXPERIENCE.md:38`: an entire surface ("What was looked for, and where"),
correctly flagged at `:47` as state-driven rather than journey-driven. DESIGN.md
addresses it nowhere. It is the first thing a new user may ever see, and it is
the only surface with no tiles.

*Minimum fix:* one paragraph in DESIGN.md's Layout section covering the
single-column, tile-less case.

### 3.15 Landmark and heading roles are unmapped to type roles

`EXPERIENCE.md:158`: "banner, navigation (contents rail), main, and one `h1` per
surface. **Tile labels are real headings.**"

DESIGN.md assigns `{typography.display}` to "the page title" and
`{typography.tile-label}` to the tile label but never states which is the `h1`,
nor that tile labels — set at `0.6875rem`, uppercase, `0.1em` tracked — are
headings rather than labels. The visual treatment reads as a label; the semantics
are a heading. That divergence is intentional but unstated on the DESIGN side,
and it drives F5.4.

*Minimum fix:* state in DESIGN.md's Typography section that `display` is the
per-surface `h1` and `tile-label` renders `h2`/`h3` despite its label-like
appearance.

---

## 4. Visual specification with no behaviour (5)

### 4.1 `components.tile-raised` — nothing says when a tile is raised

`DESIGN.md:110-113` and elevation level 2 (`:205`, "tile carrying primary
attention"). EXPERIENCE.md's Dashboard composition (`:42-45`) names four
regions — Recent activity, Core artifacts, Risk summary, Project header — and
assigns elevation to none of them. "Primary attention" is undefined: Recent
activity is "the reason the page exists" (`:42`), which suggests it, but nothing
states it, and `DESIGN.md:191` fixes tile positions by design, so this is not a
runtime decision that can be deferred.

*Minimum fix:* EXPERIENCE.md `:42` states which tile is raised (Recent activity
is the natural reading), or DESIGN.md drops `tile-raised` to a popover-only
token.

### 4.2 `components.button-primary` and `button-ghost` — EXPERIENCE.md never mentions buttons

`DESIGN.md:132-142` and `:231`. EXPERIENCE.md contains the word "button"
**zero** times. It has a "refresh control" (`:45`), a "refresh action" (`:70`), a
"refresh offer" (`:108`), a "clear-filter action" (`:103`) and three read-only
affordances (`:145`) — and never says any of them is a button, nor which weight.
DESIGN.md asserts `button-primary` is for "the single main action on a surface
(refresh)" and "No more than one primary button visible at a time" (`:231`), a
constraint EXPERIENCE.md neither states nor tests: on a document reading surface
showing a stale notice, the refresh offer (`:108`) and the header refresh control
(`:45`) are plausibly both visible, which would breach it.

*Minimum fix:* EXPERIENCE.md names the refresh control as the primary button and
everything else as ghost, and rules on the stale-notice case.

### 4.3 `typography.title` has no component and no location

Referenced only in prose (`DESIGN.md:177`), where it claims "tile and section
headings" — a claim contradicted for tiles by `components.tile.labelType`
(`:109`) and by EXPERIENCE.md `:158` (see F5.4), and unbound for sections
because no section-header component exists (§3.10). As shipped, the role has no
consumer.

*Minimum fix:* bind it to the group header from §3.10 and drop "tile" from its
stated scope.

### 4.4 `rounded.md`'s stated purpose — "inputs" — has no referent

`DESIGN.md:215`: "`{rounded.md}` as the default for inputs and containers." No
input component exists in the frontmatter, and the product is read-only
(`EXPERIENCE.md:145`, AD-1). Yet EXPERIENCE.md `:141` says "Single-letter keys
are inert **while a text input has focus**" — asserting a text input exists
somewhere while never specifying one. Either there is a filter/search input
(§3.5) or the `:141` clause and `rounded.md`'s "inputs" are both vestigial.

*Minimum fix:* decide whether v1 has a text input. If yes, specify it in both
documents; if no, drop "inputs" from `:215` and rewrite `:141` as a
forward-looking rule.

### 4.5 `typography.prose` and `spacing.reading-measure` are unacknowledged by their consumer

`DESIGN.md:181` commits IBM Plex Serif to "exactly one place: the body of a
rendered BMAD document", capped at `{spacing.reading-measure}`. EXPERIENCE.md's
Document reader (`:36`, `:90`) describes linked sections and a contents rail and
never acknowledges either the family shift or the measure cap — even though the
family shift is doing real work ("marks the shift from dashboard to reading
surface"). Low severity: this is DESIGN's territory, so the omission is
tolerable, but the reading-measure cap interacts with the ~900px breakpoint and
the 200% resize requirement (§5.8, §6.5) and should be visible to whoever owns
the responsive rules.

*Minimum fix:* one sentence in EXPERIENCE.md's Document reader row referencing
the reading measure as a layout constraint.

---

## 5. Contradictions (8)

### 5.1 BLOCKING — The evidence badge and the one-accent-per-tile rule are mutually exclusive

Three statements, all load-bearing:

- `DESIGN.md:225`: strong evidence weight is "`{colors.primary}` on
  `{colors.primary-container}` border", and this is confirmed in the token layer
  at `:124-125` (`strongColor: '{colors.primary}'`).
- `EXPERIENCE.md:83`: "**Evidence badge** — always present, **never omitted for
  strong evidence.**"
- `DESIGN.md:251`: "Don't accent more than one element per tile with
  `{colors.primary}`."

Recent activity is "the widest tile" (`EXPERIENCE.md:42`) and holds many rows.
Every row carries a badge; every strongly-evidenced row's badge is
primary-coloured. A tile with three commit-evidenced rows therefore carries three
primary accents, and the Don't is breached by correct implementation of the other
two rules. The breach is not marginal — UJ-1 (`:176`) and UJ-3 (`:193-194`) both
depend on rows showing evidence strength at a glance.

The focus ring compounds it: `colors.focus-ring` is the same value as
`colors.primary` (`#6FD3C6`, `:23` and `:35`), and `DESIGN.md:165` says primary
"carries interactive affordance, strong ordering evidence, and the focus ring" —
three meanings on one hue. A focused row inside a tile that already shows a
strong badge is a second primary accent by construction.

*Minimum fix:* restate `:251` at the right granularity — "Don't accent more than
one element per tile with `{colors.primary}` **outside of repeated per-row
evidence badges and the focus ring**" — and, better, move the strong badge off
the accent onto the currently-orphaned `{colors.on-primary-container}` (§1.2),
which reserves primary for affordance and focus alone.

### 5.2 BLOCKING — The four signal states have only three words

`DESIGN.md:169` closes the set and asserts a one-to-one map onto AD-8, and the
token names match AD-8 exactly (verified at
`ARCHITECTURE-SPINE.md:189`: "Exactly four, per AD-8: present, absent,
unreadable, unchecked").

`EXPERIENCE.md:56` commits to "**Distinguish the four states in words,
always.**" Its load-bearing string table (`:63-73`) then supplies words for
three:

| AD-8 state | DESIGN token | EXPERIENCE string |
|---|---|---|
| unchecked | `colors.signal-unchecked` `:33` | `Not checked` `:65` |
| absent | `colors.signal-absent` `:29` | `Not found` `:66` |
| unreadable | `colors.signal-unreadable` `:31` | `Unreadable` `:67` |
| **present** | `colors.signal-present` `:27` | **— absent from the table —** |

The one state that means "everything is fine here" has no specified word, in the
document that declares its strings to be "the only explanation a reader gets"
(`:51`). And because `EXPERIENCE.md:85` requires "colour plus text, never colour
alone (NFR-15)", a present-state pill cannot be rendered at all without inventing
copy — in the one place the spine says copy must not be invented.

*Minimum fix:* add a row to `:63-73`: | Signal examined and found | `Present` |.

### 5.3 The palette already violates "state never borrows the accent"

`DESIGN.md:171`: "Semantic signal colour is separate from `{colors.primary}`.
The accent never encodes state, and state never borrows the accent."

The values say otherwise:

| Signal token | Value | Identical accent token |
|---|---|---|
| `colors.signal-present` `:27` | `#7FD9CD` | `colors.on-primary-container` `:26` |
| `colors.signal-present-container` `:28` | `#1D3A37` | `colors.primary-container` `:25` |

Two of the four signal roles are byte-identical to accent-family roles. On screen,
a present pill and a primary-container element are indistinguishable, so the
separation the paragraph promises does not exist for the `present` state — the
one state most likely to appear beside a primary-accented badge in the same row.
`colors.focus-ring` = `colors.primary` (`#6FD3C6`) is the same pattern in the
other direction.

*Minimum fix:* shift `signal-present` off `#7FD9CD` by a discernible step, or
soften `:171` to state that `present` deliberately shares the accent family
because "present" and "good" coincide here — and then delete
`on-primary-container` as redundant.

### 5.4 `typography.title` claims tile headings; `tile-label` and the token layer own them

- `DESIGN.md:177`: "`{typography.title}` for **tile** and section headings".
- `DESIGN.md:177` (same sentence): "`{typography.tile-label}` for the uppercase
  label at the top of **every** tile".
- `components.tile.labelType: '{typography.tile-label}'` (`DESIGN.md:109`).
- `DESIGN.md:221`: "**Tile** — … An uppercase `{typography.tile-label}` heading".
- `EXPERIENCE.md:158`: "**Tile labels are real headings**".

Four sources say the tile heading is `tile-label`; one clause in the same
sentence says it is `title`. `title` at `1.0625rem/600` and `tile-label` at
`0.6875rem/600/0.1em` are very different treatments, and a reader implementing
from `:177` will render tile headings twice the intended size.

*Minimum fix:* strike "tile and" from `:177`, leaving `title` for section
headings only.

### 5.5 BLOCKING — The type-size floor is below four of the system's own roles

`DESIGN.md:250`: "Don't shrink type below `{typography.body-dense}` to gain
density — compress spacing instead."

`body-dense` is `0.8125rem` (13px, `:63`). Four defined roles are smaller:

| Role | Size | vs floor |
|---|---|---|
| `typography.mono` `:68` | `0.75rem` / 12px | below |
| `typography.tile-label` `:52` | `0.6875rem` / 11px | below |
| `typography.mono-badge` `:73` | `0.625rem` / 10px | below |

The rule is violated by the system that states it, and not marginally:
`mono-badge` at 10px is 77% of the floor, and it is the type of *both* badge
components (`:121`, `:129`) — i.e. of the evidence badge that UJ-1 and UJ-3
depend on reading at a glance, and of the signal pill that must be legible for
NFR-15.

It also strains the peer requirement. `EXPERIENCE.md:161`: "Text resizes to 200%
without loss (1.4.4). **Density comes from spacing, not from small type, which is
what makes this survivable.**" DESIGN.md echoes it at `:189` ("Shrinking type to
gain density is forbidden"). Both claims are false as tokenised: density here
*does* come partly from small type, at 10px and 11px.

*Minimum fix:* rewrite `:250` as a floor on *body* type — "Don't shrink body
type below `{typography.body-dense.fontSize}`; the label and badge roles are
deliberately smaller and are the only exceptions" — and have EXPERIENCE.md `:161`
acknowledge that the badge roles are the 200%-resize risk to test first.

### 5.6 `typography.mono` claims badges and pills; both components use `mono-badge`

`DESIGN.md:179`: IBM Plex Mono carries "file paths, timestamps, artifact IDs,
**evidence badges, signal pills**". But `components.evidence-badge.type` (`:121`)
and `components.signal-pill.type` (`:129`) are both `{typography.mono-badge}`,
not `{typography.mono}` — a different size (10px vs 12px), weight (500 vs 400)
and tracking (`0.05em` vs none).

Family-level the sentence is true, role-level it is wrong, and it is the same
class of error as F5.4 in the same section.

*Minimum fix:* "…artifact IDs (`{typography.mono}`); evidence badges and signal
pills use `{typography.mono-badge}`."

### 5.7 Elevation: "next step on the ladder" skips the next step, and level counting is off by one

- `DESIGN.md:163`: the ladder "`{colors.surface-container-low}` through
  `{colors.surface-container-highest}` — is the only elevation mechanism".
- `DESIGN.md:201-205`: level 1 = `surface-container-low`, level 2 =
  `surface-container-**high**`.
- `DESIGN.md:207`: `surface-container` is reserved for hover.
- `DESIGN.md:239` (Do): "Lift with tone. A new elevated element takes **the next
  step on the container ladder**."

The literal next step above `surface-container-low` is `surface-container`, which
`:207` forbids at rest. So the Do, followed literally, produces a token the
Elevation section reserves. And as noted in §1.6, "a future third level" (`:207`)
denotes a fourth level given that `:199` counts three in use.

*Minimum fix:* `:239` → "takes the next step on the *elevation table*, not the
next tone in the ladder — `surface-container` is reserved for hover"; and `:207`
→ "a future level 3".

### 5.8 The responsive breakpoint: "one breakpoint", two thresholds, and only one shared

- `DESIGN.md:193`: "Below roughly 900px the tile grid collapses to a single
  column and remains usable; narrow viewports are not a design target, and no
  mobile layout is specified."
- `EXPERIENCE.md:19`: "Below ~900px the grid collapses to one column and stays
  usable, but no mobile layout is specified." — agrees.
- `EXPERIENCE.md:165`: "**One breakpoint** at ~900px… **Below ~600px no layout is
  specified**; the page remains readable but is not a design target."

Three problems. (a) EXPERIENCE.md says "one breakpoint" and then names two
thresholds in the same sentence. (b) The ~600px floor exists only in
EXPERIENCE.md; DESIGN.md, which owns layout, has never heard of it, and its
`:193` implies nothing is specified below 900px at all — flatly inconsistent with
EXPERIENCE.md's claim that a specified single-column layout runs from 900 down to
600. (c) `EXPERIENCE.md:165` specifies a responsive behaviour that is purely
visual and belongs to DESIGN.md — "Document reader moves its contents rail above
the content" — which DESIGN.md contradicts by describing the rail only as
"beside it" (`:195`) with no stacked variant.

*Minimum fix:* DESIGN.md owns both thresholds as tokens (§6.1) and the rail's
stacked variant; EXPERIENCE.md `:165` reduces to "Two thresholds, ~900px and
~600px — see DESIGN.md", or says "one *collapse* breakpoint at ~900px and an
unspecified floor at ~600px".

---

## 6. Hardcoded values bypassing tokens (9)

First, the self-compliance question. **DESIGN.md's own hardest rule — `:254`,
"Don't introduce a hex literal in a component. Every colour resolves through a
token" — is obeyed.** The `components` block (`:103-146`) was scanned: zero hex
literals, every colour is a `{colors.*}` reference. Credit where due. The
failures below are px/rem literals, prose literals, and one non-token keyword.

### 6.1 `900px` and `600px` — a breakpoint with no token, restated three times

`DESIGN.md:193`, `EXPERIENCE.md:19`, `EXPERIENCE.md:165` (twice). There is no
`breakpoints` group in the frontmatter at all, so the single most consequential
layout number in the system exists only as prose in two documents — exactly the
shape that drifts, and it already has (§5.8: 600px appears in one document only).

*Minimum fix:* add to DESIGN.md frontmatter:

```yaml
breakpoints:
  collapse: '900px'
  floor: '600px'
```

and replace all four prose occurrences with `{breakpoints.collapse}` /
`{breakpoints.floor}`.

### 6.2 `14px` — `DESIGN.md:189`

> `{typography.body}` stays at 14px while `{spacing.row-padding-y}` compresses
> row spacing.

The sentence references the token and then restates its value — in a different
unit from the token, which is `0.875rem` (`:58`). Any change to `body.fontSize`
silently falsifies the prose, and the px/rem mismatch obscures that the system is
rem-based (which is what makes `EXPERIENCE.md:161`'s 200% resize work).

*Minimum fix:* "`{typography.body}` holds its size while
`{spacing.row-padding-y}` compresses row spacing." Drop the number entirely.

### 6.3 `2px` twice, immediately after referencing the token that holds them — `DESIGN.md:233`

> **Focus ring** — `{components.focus-ring}`, 2px of `{colors.focus-ring}` at 2px offset

Both literals duplicate `components.focus-ring.width` and `.offset` (`:145-146`).
Same defect as §2.1 and the clearest instance of the pattern in the document.

*Minimum fix:* see §2.1.

### 6.4 `components.focus-ring.width: '2px'` and `.offset: '2px'` — `DESIGN.md:145-146`

px literals inside a component — the letter of `:254` covers only colour, so this
is legal, but it is the same bypass class. There is no 2px step in the spacing
scale (which starts at `spacing.1: '4px'`, `:90`), so these cannot currently be
tokenised, and the ring's 4px total footprint (width + offset) is what
`DESIGN.md:233` and `EXPERIENCE.md:156` require tiles to reserve inside their
padding — an important number with no token.

*Minimum fix:* add `spacing.ring: '2px'` (or `'0.5': '2px'`) and reference it
from both keys, so the reserved footprint is derivable rather than restated.

### 6.5 `spacing.tile-padding: '15px'` breaks the declared 4px base scale — `DESIGN.md:97`

`DESIGN.md:187` opens with "A 4px base scale." 15px is not on it — it is not a
multiple of 4, and it is the only such value in the group. Every other named
token lands on a step: `tile-gap` 12px = `spacing.3`, `row-padding-y` 8px =
`spacing.2`, `page-margin` 24px = `spacing.6`.

It also interacts with §6.4: with 15px padding, the 4px focus-ring footprint
leaves 11px of true padding, and `DESIGN.md:233` requires tiles to "reserve the
offset inside their padding". 16px would make that arithmetic clean.

*Minimum fix:* `tile-padding: '{spacing.4}'` (16px). If 15px is deliberate — a
1px border compensation, say — state the reason inline, because as written it
reads as a typo for 16.

### 6.6 Three named spacing tokens restate scale steps instead of referencing them

`tile-gap: '12px'` (`:98`), `row-padding-y: '8px'` (`:99`), `page-margin: '24px'`
(`:100`) duplicate the literals of `spacing.3`, `spacing.2` and `spacing.6`
(`:92`, `:91`, `:95`). The semantic-alias pattern is right; the duplication of
values is what lets the alias and the scale drift apart.

*Minimum fix:* `tile-gap: '{spacing.3}'`, `row-padding-y: '{spacing.2}'`,
`page-margin: '{spacing.6}'`.

### 6.7 `rounded.DEFAULT: '6px'` duplicates `rounded.md: '6px'` — `DESIGN.md:87`

See §1.4. *Minimum fix:* `DEFAULT: '{rounded.md}'`.

### 6.8 Two duplicated hex values across the colour group

`colors.focus-ring: '#6FD3C6'` (`:35`) duplicates `colors.primary` (`:23`);
`colors.signal-present: '#7FD9CD'` (`:27`) duplicates
`colors.on-primary-container` (`:26`); `colors.signal-present-container`
(`:28`) duplicates `colors.primary-container` (`:25`). Frontmatter is where
literals belong, so this is not a bypass in the strict sense — but three of the
23 colours are copies, and the copies are silently coupled: changing `primary`
leaves `focus-ring` behind, and `DESIGN.md:165` asserts primary "carries … the
focus ring", so they must not drift. It is also the mechanism of §5.3.

*Minimum fix:* `focus-ring: '{colors.primary}'`, making the stated relationship
enforced rather than coincidental. Resolve `signal-present` per §5.3.

### 6.9 `components.button-ghost.background: 'transparent'` — `DESIGN.md:138`

A raw CSS keyword, the only non-token value in the components block. Obeys `:254`
(not a hex) but not its spirit — "Every colour resolves through a token" — and
`:157`'s promise that "a light polarity is a token swap rather than a rewrite"
depends on no component holding a literal colour.

*Minimum fix:* add `colors.transparent: 'transparent'` and reference it.

**Checked and cleared:** `` `#000` `` at `DESIGN.md:249` is a prose prohibition
("Don't use `#000` as a ground"), not a value in use — correct as written.
`200%` at `EXPERIENCE.md:161` is the WCAG 1.4.4 criterion figure, not a design
value. `14 items` at `EXPERIENCE.md:104` is illustrative copy. EXPERIENCE.md
contains no colour, radius, or spacing literals of any kind — its only numeric
bypasses are the breakpoints in §6.1.

---

## 7. Naming drift (7)

### 7.1 Signal state names: tokens vs. user-facing words

`absent` (`DESIGN.md:29`, and AD-8) surfaces to the user as `Not found`
(`EXPERIENCE.md:66`); `unchecked` (`:33`) as `Not checked` (`:65`). The drift is
*correct* — the token name is canonical per AD-8, the string is the honest
sentence, and `EXPERIENCE.md:56` deliberately refuses to collapse them. But
nothing in either document states the mapping, so an implementer reading only
DESIGN.md will write "Absent" on the pill and quietly break the load-bearing
strings.

*Minimum fix:* one column in `EXPERIENCE.md:63-73` naming the token behind each
string, or a four-row mapping table in DESIGN.md's Colors section. Combine with
the §5.2 fix.

### 7.2 "popover" vs "overlay" vs "modal overlay"

`DESIGN.md:205` says "popovers"; `EXPERIENCE.md:135` says "any open overlay";
`:155` says "a modal overlay". Three names, one or possibly two concepts — a
popover and a modal have different focus semantics (`:155` requires a trap and
focus return), so this may be conflating two things that need separate specs.

*Minimum fix:* pick one term; if both concepts exist, name and specify both.

### 7.3 The refresh control has four names and no canonical one

"refresh control" (`EXPERIENCE.md:45`), "refresh" (`:137`, the `r` key),
"refresh action" (`:70`), "refresh offer" (`:99`, `:108`), and
`components.button-primary` "for the single main action on a surface (refresh)"
(`DESIGN.md:231`). Whether the header control and the stale-notice offer are the
same component is never resolved — and that is exactly the question §4.2 says
determines whether the one-primary-button rule holds.

*Minimum fix:* name the header control canonically and state that the stale
notice's offer is a distinct, ghost-weight instance.

### 7.4 "tile-raised" vs "tile carrying primary attention"

Token name (`DESIGN.md:110`) vs prose description (`:205`), with no link between
them and no name at all in EXPERIENCE.md. See §1.5 and §4.1.

### 7.5 "Core artifact card" — three names and a collision with the tile

`components` has no entry for it. Named "Core artifact card" in both prose
sections (`DESIGN.md:229`, `EXPERIENCE.md:87`), "an absent core artifact" at
`DESIGN.md:167`, and the containing tile is "Core artifacts" at
`EXPERIENCE.md:44`. So "core artifacts" denotes both a tile and the cards inside
it, one of the two is the token-less component from §3, and DESIGN.md's rule that
a tile holds "one kind of information" (`:253`) makes the tile/card distinction
load-bearing.

*Minimum fix:* add `components.core-artifact-card` and use "Core artifacts tile"
vs "core artifact card" consistently.

### 7.6 "reduced opacity" vs "reduced weight" vs `on-surface-faint`

The absent-artifact treatment is described as "reduced opacity plus
`{colors.on-surface-faint}`" (`DESIGN.md:229`) and as "reduced weight"
(`EXPERIENCE.md:87`). "Weight" collides with the evidence badge's "two visual
weights" (`DESIGN.md:225`, `EXPERIENCE.md:83`), which means something else
entirely. And **no opacity token exists** — the one place DESIGN.md calls for
opacity, it does so in prose with no value.

This is not only naming. `on-surface-faint` (`#6E7C7E`) on `surface`
(`#121617`) computes to **≈4.30:1** — under the 4.5:1 that `EXPERIENCE.md:153`
sets as the floor and that `DESIGN.md:167` claims for the ladder — and the
"reduced opacity" applied on top of it pushes it lower still. So the treatment as
specified breaches the peer document's accessibility floor by construction.
Flagging here rather than in §5 because the fix is one token, but it should be
verified before either document is signed off.

*Minimum fix:* lighten `on-surface-faint` to clear 4.5:1 on `{colors.surface}`,
drop the opacity reduction (the colour alone carries the de-emphasis), and use
"reduced emphasis" in both documents to keep "weight" for evidence.

### 7.7 "reading surface" vs "Document reader" vs "artifact view"

`DESIGN.md:195` says "Reading surfaces break the dashboard grid" (plural,
undefined); `EXPERIENCE.md:135` has `Escape` "leave the current reading surface";
the IA names the surface "Document reader" (`:36`) and a separate "Artifact view"
(`:35`). Whether "reading surface" means Document reader only, or both, decides
what `Escape` does — a keyboard behaviour resting on an undefined noun.

*Minimum fix:* define "reading surface" once in EXPERIENCE.md's IA as the set it
denotes, and have `DESIGN.md:195` use the same definition.

---

## Appendix A — In-document defect found while checking the seam

Not strictly a seam finding, but it falsifies a claim the seam relies on.

`EXPERIENCE.md:47`: "Every surface is reached by a journey below **except No
project**, which is state-driven rather than journey-driven."

Tracing the three journeys: UJ-1 (`:173-181`) touches Dashboard and Artifact view
(the memlog viewer); UJ-2 (`:183-188`) touches Artifact view and Comparison;
UJ-3 (`:190-195`) touches Dashboard. **Document reader and Oversight are reached
by no journey**, so the stated exception list is short by two. Both are
capability landings — `EXPERIENCE.md:47` maps CAP-5 → Document reader and
CAP-6 → Oversight — which makes them the two capabilities with no journey
evidence. The same claim is recorded as verified in `.memlog.md` ("IA closure
verified: … every surface is reached by a journey EXCEPT 'No project'"), so the
error is upstream of the document.

This matters to the seam because DESIGN.md also has the least to say about
exactly these two surfaces (§3.3, §3.14, §4.5): the surfaces with no journey are
the surfaces with no visual specification.

*Minimum fix:* either add a fourth journey covering the Oversight → finding →
Document reader path, or correct `:47` to list Document reader and Oversight as
reached by navigation rather than by a named journey — and correct the memlog.

## Appendix B — Verification notes

- **Reference resolution:** 84 `{path}` references in DESIGN.md, 0 in
  EXPERIENCE.md. All 84 resolve to an existing YAML path. 3 resolve to the wrong
  type (§2).
- **Token coverage:** 23 colours (18 referenced, 5 orphaned), 8 type roles (8
  referenced), 5 radii (4 referenced), 12 spacing values (6 referenced), 8
  components (7 named in prose).
- **Contrast spot-checks** (WCAG 2.x relative luminance):
  `on-surface` `#E5EAEA` on `surface-container-highest` `#273031` ≈ **11.1:1** —
  DESIGN.md:167's "at or above 4.5:1 on every container in the ladder" holds.
  `on-surface-variant` `#93A3A4` on `surface-container-low` `#181D1E` ≈
  **6.85:1** — tile labels pass.
  `on-surface-faint` `#6E7C7E` on `surface` `#121617` ≈ **4.30:1** — **fails**
  (§7.6), before the specified opacity reduction.
- **Upstream check:** AD-8's four state names were verified against
  `ARCHITECTURE-SPINE.md:189`. DESIGN.md's token names match it exactly;
  EXPERIENCE.md's string table covers three of the four (§5.2).
- **"Seven roles" count:** `DESIGN.md:175` says "Three families across seven
  roles"; the frontmatter defines eight (`display`, `title`, `tile-label`,
  `body`, `body-dense`, `mono`, `mono-badge`, `prose`) and `:177-181` enumerates
  eight (5 sans + 2 mono + 1 serif). `.memlog.md` also records "7 type roles",
  so a role was added after the count was written. *Minimum fix:* "eight roles".
