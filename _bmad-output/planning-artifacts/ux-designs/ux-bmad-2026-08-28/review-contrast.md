# bmad-dash — WCAG 2.2 AA contrast review

**Subject:** `DESIGN.md` (bmad-dash visual system), dark-only
**Usage context:** `EXPERIENCE.md`
**Date:** 2026-09-01
**Method:** every ratio below was computed from the `colors` frontmatter hexes with the WCAG 2.x
relative-luminance formula (sRGB → linear via the 0.03928 / 12.92 / 1.055 piecewise transfer
function, then `0.2126R + 0.7152G + 0.0722B`) and `(L_lighter + 0.05) / (L_darker + 0.05)`.
No ratio in this document is taken from `DESIGN.md`, estimated, or eyeballed.

---

## Verdict

**Does not conform to WCAG 2.2 AA as specified.** Two genuine, unambiguous failures:

1. **`on-surface-faint` fails 1.4.3 on every surface in the ladder** (4.20:1 down to 3.12:1
   against a 4.5:1 requirement), and `DESIGN.md` compounds it by stacking *reduced opacity*
   on top of the token.
2. **`outline` fails 1.4.11 as the boundary of `button-ghost`** (1.79:1 down to 1.47:1 against
   a 3:1 requirement). The ghost button has no fill, so its border is the only thing that
   identifies it as a control.

Everything else — all body, title, prose, metadata, badge and pill *text*, `primary` in all its
roles, the primary button, and the focus ring on all five ladder surfaces — passes with real
headroom. The luminance architecture of the palette is sound; the failures are concentrated in
the two tokens deliberately designed to be quiet, plus a set of tonal fills that are below the
threshold of visibility even though they are not strictly conformance failures.

Separately, and more seriously than the numbers suggest: **the claim that the four signal
colours are distinguishable by hue does not hold.** Under simulated protanopia, `present`,
`absent` and `unchecked` collapse onto a single hue with inter-colour contrast of 1.01:1 to
1.26:1. This is not a conformance failure — `DESIGN.md` and `EXPERIENCE.md` both mandate text
alongside colour — but the palette's *stated* robustness property is false. See §5.

**88 pairings computed. 29 below threshold, of which 9 are genuine AA failures and 20 are
sub-threshold decorative/tonal fills (advisory — see §3 for why each is classified as it is).**

---

## Threshold assignment

Derived from the `typography` tokens, not assumed. WCAG "large text" is ≥18.66px bold or ≥24px;
everything else is 4.5:1.

| Role | Size | Weight | px @16 | Large? | Threshold |
|---|---|---|---|---|---|
| `display` | 1.5rem | 600 | 24px | **yes** | 3:1 |
| `title` | 1.0625rem | 600 | 17px | no (17 < 18.66) | **4.5:1** |
| `body` | 0.875rem | 400 | 14px | no | 4.5:1 |
| `body-dense` | 0.8125rem | 400 | 13px | no | 4.5:1 |
| `prose` | 1rem | 400 | 16px | no | 4.5:1 |
| `mono` | 0.75rem | 400 | 12px | no | 4.5:1 |
| `tile-label` | 0.6875rem | 600 | 11px | no | **4.5:1** |
| `mono-badge` | 0.625rem | 500 | 10px | no | **4.5:1** |

Only `display` earns the 3:1 large-text allowance. Note in particular that `title` at 17px/600
does *not* — it is 1.66px short of the bold-large threshold — and that `tile-label` (11px) and
`mono-badge` (10px) are the two smallest roles in the system and both need the full 4.5:1.
`mono-badge` is what every signal pill and evidence badge is set in, so **all pill and badge
text is held to 4.5:1, not 3:1.**

UI-component and focus-indicator pairings are held to 3:1 per 1.4.11 and 2.4.11.

---

## 1. Text tokens against the container ladder

`on-surface` covers `title` (17px), `body` (14px), `body-dense` (13px) and `prose` (16px) — all
at 4.5:1.

| Foreground | Background | Ratio | Threshold | Verdict |
|---|---|---:|---:|---|
| `on-surface` `#E5EAEA` | `surface` `#121617` | **15.00:1** | 4.5:1 | PASS |
| `on-surface` | `surface-container-low` `#181D1E` | **14.02:1** | 4.5:1 | PASS |
| `on-surface` | `surface-container` `#1C2223` | **13.27:1** | 4.5:1 | PASS |
| `on-surface` | `surface-container-high` `#212829` | **12.35:1** | 4.5:1 | PASS |
| `on-surface` | `surface-container-highest` `#273031` | **11.13:1** | 4.5:1 | PASS |
| `on-surface-variant` `#93A3A4` | `surface` | **6.95:1** | 4.5:1 | PASS |
| `on-surface-variant` | `surface-container-low` | **6.50:1** | 4.5:1 | PASS |
| `on-surface-variant` | `surface-container` | **6.15:1** | 4.5:1 | PASS |
| `on-surface-variant` | `surface-container-high` | **5.72:1** | 4.5:1 | PASS |
| `on-surface-variant` | `surface-container-highest` | **5.16:1** | 4.5:1 | PASS |
| `on-surface-faint` `#6E7C7E` | `surface` | **4.20:1** | 4.5:1 | **FAIL** |
| `on-surface-faint` | `surface-container-low` | **3.93:1** | 4.5:1 | **FAIL** |
| `on-surface-faint` | `surface-container` | **3.72:1** | 4.5:1 | **FAIL** |
| `on-surface-faint` | `surface-container-high` | **3.46:1** | 4.5:1 | **FAIL** |
| `on-surface-faint` | `surface-container-highest` | **3.12:1** | 4.5:1 | **FAIL** |

`display` (24px/600, large text, 3:1) on the ladder, for completeness:

| Foreground | Background | Ratio | Threshold | Verdict |
|---|---|---:|---:|---|
| `on-surface` | `surface` | **15.00:1** | 3:1 | PASS |
| `on-surface` | `surface-container-low` | **14.02:1** | 3:1 | PASS |
| `on-surface` | `surface-container` | **13.27:1** | 3:1 | PASS |
| `on-surface` | `surface-container-high` | **12.35:1** | 3:1 | PASS |
| `on-surface` | `surface-container-highest` | **11.13:1** | 3:1 | PASS |

`on-surface-variant` is comfortable everywhere despite carrying the two smallest roles in the
system — a good result, since `tile-label` at 11px/600 on `surface-container-low` (the standard
tile) computes 6.50:1.

`on-surface-faint` fails on all five surfaces. It is *closest* on the page ground (4.20:1, a
7% shortfall) and worst on `surface-container-highest` (3.12:1, a 44% shortfall). The two
in-use tile levels — `surface-container-low` (3.93:1) and `surface-container-high` (3.46:1) —
both fail. See §4.1.

---

## 2. Signal colours

### 2a. Signal text on its own paired container (`mono-badge` 10px → 4.5:1)

| Foreground | Background | Ratio | Threshold | Verdict |
|---|---|---:|---:|---|
| `signal-present` `#7FD9CD` | `signal-present-container` `#1D3A37` | **7.42:1** | 4.5:1 | PASS |
| `signal-absent` `#96A5A7` | `signal-absent-container` `#20282A` | **5.89:1** | 4.5:1 | PASS |
| `signal-unreadable` `#E0B072` | `signal-unreadable-container` `#3D2F20` | **6.53:1** | 4.5:1 | PASS |
| `signal-unchecked` `#B8A2D6` | `signal-unchecked-container` `#2A2333` | **6.62:1** | 4.5:1 | PASS |

### 2b. Signal text directly on bare surfaces (pills may sit on either)

| Foreground | `surface` | `-low` | `-container` | `-high` | `-highest` | Threshold | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| `signal-present` | 11.02 | 10.30 | 9.76 | 9.08 | 8.18 | 4.5:1 | PASS |
| `signal-absent` | 7.14 | 6.68 | 6.32 | 5.88 | 5.30 | 4.5:1 | PASS |
| `signal-unreadable` | 9.21 | 8.61 | 8.16 | 7.59 | 6.84 | 4.5:1 | PASS |
| `signal-unchecked` | 7.96 | 7.44 | 7.05 | 6.55 | 5.91 | 4.5:1 | PASS |

All four signal foregrounds clear 4.5:1 on every surface and on their own container. **The
signal text layer is fully conformant** — the weakest case in the whole set is
`signal-absent` on `signal-absent-container` at 5.89:1, still 31% of headroom above the bar.

### 2c. Signal container *fills* against the surfaces they sit on (advisory, 3:1)

| Fill | `surface` | `-low` | `-high` | Threshold | Verdict |
|---|---:|---:|---:|---:|---|
| `signal-present-container` `#1D3A37` | 1.49 | 1.39 | 1.22 | 3:1 | below |
| `signal-absent-container` `#20282A` | 1.21 | 1.13 | **1.00** | 3:1 | below |
| `signal-unreadable-container` `#3D2F20` | 1.41 | 1.32 | 1.16 | 3:1 | below |
| `signal-unchecked-container` `#2A2333` | 1.20 | 1.12 | **1.01** | 3:1 | below |

Classified **advisory, not a conformance failure** — see §3 for the reasoning. But note the two
1.00:1 entries: `signal-absent-container` (`#20282A`) against `surface-container-high`
(`#212829`) computes **1.00:1**, and `signal-unchecked-container` against the same surface
computes **1.01:1**. Those pill shapes are *invisible* on a raised tile. Since
`surface-container-high` is the level-2 tile ("tile carrying primary attention, and popovers")
and the risk-summary tile is exactly where pills cluster, this is a real usability defect even
though the pill's text still reads at 5.88:1 and 6.55:1.

---

## 3. Why 20 sub-threshold pairings are advisory rather than failures

I am not counting these as 1.4.11 failures, and the reasoning should be visible so it can be
disagreed with:

- **Signal pill fills (§2c) and the strong-evidence-badge border fill (§4b).** 1.4.11 applies
  to visual information *required to identify* a component or state. A signal pill is
  non-interactive, and both `DESIGN.md` ("colour plus text always. Never colour alone") and
  `EXPERIENCE.md` (NFR-15, "a signal pill's name is its state word") make the *text* the sole
  carrier of state. The tint is grouping, not information, and the text inside it passes. Under
  a strict reading these pass; under the document's own design intent they fail, which is §4b.
- **`outline-variant` dividers.** `DESIGN.md` scopes `outline-variant` to "dividers inside a
  tile" — a separator between activity rows. Rows are identified by their text content, not by
  the rule between them, so the divider is decoration for 1.4.11 purposes. Computed: 1.30:1 on
  `-low`, 1.23:1 on `-container`, 1.15:1 on `-high`, **1.03:1** on `-highest`. Advisory, but
  1.03:1 is not a divider, it is a no-op.

The distinction matters: `outline` on a ghost button is **not** in this category, because a
fill-less button has nothing but its border to say it is a button. That one is a real failure.

---

## 4. `primary`, buttons and badges

### 4a. `primary` as text, badge and accent

| Foreground | Background | Ratio | Threshold | Verdict |
|---|---|---:|---:|---|
| `primary` `#6FD3C6` | `surface` | **10.24:1** | 4.5:1 | PASS |
| `primary` | `surface-container-low` | **9.57:1** | 4.5:1 | PASS |
| `primary` | `surface-container` | **9.07:1** | 4.5:1 | PASS |
| `primary` | `surface-container-high` | **8.43:1** | 4.5:1 | PASS |
| `primary` | `surface-container-highest` | **7.60:1** | 4.5:1 | PASS |
| `on-primary` `#08302C` | `primary` `#6FD3C6` | **8.04:1** | 4.5:1 | PASS |
| `primary` (button fill) | `surface` | **10.24:1** | 3:1 | PASS |
| `primary` (button fill) | `surface-container-low` | **9.57:1** | 3:1 | PASS |
| `primary` (button fill) | `surface-container-high` | **8.43:1** | 3:1 | PASS |
| `on-primary-container` `#7FD9CD` | `primary-container` `#1D3A37` | **7.42:1** | 4.5:1 | PASS |
| `primary` | `primary-container` | **6.90:1** | 4.5:1 | PASS |

`primary` is the strongest part of the palette. It passes as small text on every surface
(10.24:1 worst-case on the ground, 7.60:1 worst-case at the top of the ladder), passes as a
button fill against the page, and `on-primary` on it computes 8.04:1 — comfortably above 4.5:1
even though `button-primary` is set in 13px `body-dense`. Note `DESIGN.md`'s evidence badge
spec uses `primary` (not `on-primary-container`) as the strong badge's text on a
`primary-container` border; both computed, both pass.

### 4b. `outline` and `primary-container` as component boundaries

| Boundary | `surface` | `-low` | `-container` | `-high` | Threshold | Verdict |
|---|---:|---:|---:|---:|---:|---|
| `outline` `#394345` — `button-ghost` border | 1.79 | 1.67 | 1.58 | 1.47 | 3:1 | **FAIL** |
| `primary-container` `#1D3A37` — strong badge border | 1.49 | 1.39 | — | 1.22 | 3:1 | advisory |

`outline` is a genuine 1.4.11 failure. `DESIGN.md` assigns it to "the edge of an interactive
element that has no fill" and `button-ghost` is `background: transparent` with
`border: {colors.outline}`. With no fill and no other cue, the 1.79:1 border is the entire
visual identification of the control. At 1.47:1 on a raised tile it is barely a line.

`primary-container` as the strong badge border is advisory by the §3 reasoning (the badge is
non-interactive and its text differentiates it). **But it breaks the document's own claim.**
`DESIGN.md` says of the two evidence weights: *"The weight is the disclosure — a reader must be
able to see that an ordering is weakly evidenced without reading the label."* The two borders
compute 1.79:1 (`outline`, weak) and 1.49:1 (`primary-container`, strong) against `surface` —
both near-invisible, and only 1.20:1 apart from each other. A reader cannot see the weight
without reading the label. What *does* differentiate them is the text colour (`primary` at
10.24:1 vs `on-surface-variant` at 6.95:1), which is a real and legible difference — so the
disclosure survives, but through the mechanism `DESIGN.md` does not credit.
`EXPERIENCE.md` is the more accurate of the two documents here: "Its two visual weights are
redundant with its text."

---

## 5. The three non-numeric claims

### 5.1 "`on-surface` is body text, at or above 4.5:1 on every container in the ladder"

**Holds.** Computed across all five: 15.00, 14.02, 13.27, 12.35, 11.13. The weakest case
(`surface-container-highest`) is 2.47× the requirement. The claim is not just true, it is
conservative — `on-surface` would still pass at 4.5:1 on a surface considerably lighter than
anything in the ladder. It also passes for `title` at 17px/600, which does not qualify for the
large-text allowance and so is held to the same 4.5:1.

Worth noting the related `DESIGN.md` rationale checks out too: `#121617` is a graphite ground,
not `#000`, and `#E5EAEA` is not pure white, so the stated halation argument is consistent with
the tokens actually shipped. `#FFFFFF` on `#121617` would have computed 16.75:1 — the palette
gave up 1.75 points of contrast to avoid halation, which is a defensible trade at 15:1.

### 5.2 "`focus-ring` at 3:1 on every surface it may be drawn on"

**Holds for the container ladder; fails as written.**

| `focus-ring` `#6FD3C6` on | Ratio | Threshold | Verdict |
|---|---:|---:|---|
| `surface` | **10.24:1** | 3:1 | PASS |
| `surface-container-low` | **9.57:1** | 3:1 | PASS |
| `surface-container` | **9.07:1** | 3:1 | PASS |
| `surface-container-high` | **8.43:1** | 3:1 | PASS |
| `surface-container-highest` | **7.60:1** | 3:1 | PASS |
| `primary-container` | **6.90:1** | 3:1 | PASS |
| `signal-absent-container` | **8.44:1** | 3:1 | PASS |
| `signal-unchecked-container` | **8.52:1** | 3:1 | PASS |
| `signal-unreadable-container` | **7.26:1** | 3:1 | PASS |
| **`primary`** | **1.00:1** | 3:1 | **FAIL** |

`focus-ring` and `primary` are the same hex (`#6FD3C6`), so the ring computes **1.00:1** against
the primary button's fill. `EXPERIENCE.md` states focus is on "every focusable element without
exception" and `button-primary` is the refresh control — a focusable element on every surface.

Being precise about severity: the ring is specified at 2px *offset*, so it is drawn on the
surface behind the button, not on the button, and 1.4.11's "adjacent colour" for the ring is
that 2px band of `surface` at 10.24:1. **Under a strict AA reading this passes.** What actually
happens visually is a cyan button, a 2px graphite gap, and a 2px cyan ring of identical hue and
luminance — a focus indicator that reads as a halo on the accent rather than as a state change,
and which disappears entirely if the 2px offset is ever collapsed, clipped, or rendered against
an adjacent primary element. WCAG 2.2's 2.4.13 Focus Appearance would flag this, though that is
AAA and out of scope. Either way, the claim as written in `DESIGN.md` is false: there is a
surface the ring is drawn on where it computes 1.00:1, not 3:1.

### 5.3 "The four signal colours are distinguishable from each other by hue"

**Does not hold.** This is the most interesting finding in the review, and the one the numbers
in §2 conceal — every signal colour passes its own contrast requirement while the *set* fails
its stated design property.

I simulated dichromacy with the Viénot–Brettel–Mollon linear-RGB projections and measured both
hue separation and mutual contrast:

**Normal trichromatic vision** — four distinct hues, well separated:

| State | Hex | Hue | Contrast vs `surface` |
|---|---|---:|---:|
| `present` | `#7FD9CD` | 172° | 11.02:1 |
| `absent` | `#96A5A7` | 187° | 7.14:1 |
| `unreadable` | `#E0B072` | 34° | 9.21:1 |
| `unchecked` | `#B8A2D6` | 265° | 7.96:1 |

Even here, `present` (172°) and `absent` (187°) are only **15° apart** — the weakest pair in the
set before any deficiency is applied. The saturation difference (54% vs 9%) is what separates
them, not hue.

**Deuteranopia:**

| State | Simulated | Hue | Mutual contrast |
|---|---|---:|---|
| `present` | `#A8A1D1` | 249° | — |
| `absent` | `#9C9BA6` | 246° | vs `present` **1.13:1**, Δhue **3.3°** |
| `unchecked` | `#B0B2C8` | 235° | vs `present` **1.16:1**, Δhue **13.7°** |
| `unreadable` | `#D0D388` | 62° | vs all others 1.33–1.75:1, Δhue ~174° |

**Protanopia** — worse:

| State | Simulated | Hue | Mutual contrast |
|---|---|---:|---|
| `present` | `#AEAED0` | 240° | — |
| `absent` | `#9D9DA7` | 240° | vs `present` **1.25:1**, Δhue **0.0°** |
| `unchecked` | `#AFAFCB` | 240° | vs `present` **1.01:1**, Δhue **0.0°** |
| `unreadable` | `#CDCD84` | 60° | vs all others 1.26–1.62:1, Δhue 180° |

Under protanopia, three of the four states — `present`, `absent` and `unchecked` — land on
**exactly the same hue (240°)**, and `present` vs `unchecked` computes **1.01:1**: they are, for
a protanope, the same colour. Only `unreadable` (the amber) survives as a distinct hue, because
amber is the one choice in the set that is separated along the surviving blue–yellow axis rather
than the lost red–green one.

The specific rationale `DESIGN.md` gives fails hardest of all: *"`unchecked` is violet rather
than a warmer hue specifically so it cannot be misread as a mild version of `unreadable`."*
That reasoning is sound for trichromats and *inverted* for dichromats — violet is precisely the
hue that collapses onto cyan under both deuteranopia and protanopia, so for a protanope
`unchecked` becomes indistinguishable from `present` (1.01:1) while remaining clearly separate
from `unreadable` (1.29:1). The palette successfully prevents the confusion it worried about and
creates a worse one it did not.

Two related token-level observations, both computed:

- `signal-present` (`#7FD9CD`) vs `primary` (`#6FD3C6`) computes **1.08:1**, and
  `signal-present-container` is byte-identical to `primary-container` (`#1D3A37`, **1.00:1**).
  `DESIGN.md` asserts *"Semantic signal colour is separate from `primary`. The accent never
  encodes state, and state never borrows the accent."* At the token level, `signal-present`
  **is** the accent — it is the same colour as `on-primary-container`, exactly. The separation
  is a naming convention, not a visual fact. A `present` pill and a strong evidence badge are
  the same cyan on the same dark cyan fill.
- `signal-absent` (`#96A5A7`) vs `on-surface-variant` (`#93A3A4`) computes **1.03:1**. An
  "absent" pill is the same grey as ordinary metadata text, which is arguably the intent
  (absent should not attract the eye) but means the pill has no colour identity at all.

**This is a robustness finding, not a 1.4.1 failure.** `DESIGN.md` mandates "colour plus text
always. Never colour alone", `EXPERIENCE.md` reinforces it at NFR-15 and in the accessible-name
rules, and the Voice-and-Tone table gives each state a distinct sentence (`Not checked` vs
`Not found` vs `Unreadable`). **1.4.1 Use of Colour passes** on the strength of that redundancy.
What is lost for a dichromat is the *at-a-glance* scanning that the four-colour set exists to
provide — the pills degrade to "read every label", which is exactly the speed the product is
optimising for. Given `bmad-dash`'s stated purpose ("the speed at which a fact can be located"),
that is a product cost even where it is not a conformance one.

---

## 6. Failures in severity order, with minimum fixes

Severity ordered by conformance impact first, then by how far below threshold. All replacement
hexes were derived by raising HSL lightness while holding hue and saturation fixed, so each
preserves the palette's hue and its desaturated graphite/cyan register.

### F1 — `on-surface-faint` fails 1.4.3 on all five surfaces (worst 3.12:1, need 4.5:1)

Real text, real information: the name and status line of an absent core artifact.
`EXPERIENCE.md` is explicit that this content is *informational* and *not a link* — so the
"inactive UI component" exemption in 1.4.3 does not apply. It has to meet 4.5:1.

The problem is compounded twice over. First, `DESIGN.md` specifies **reduced opacity plus**
`on-surface-faint` for the absent card. Computed: `#6E7C7E` at 70% opacity over `surface`
blends to `#525D5F` = **2.68:1**; over `surface-container-high` = **2.41:1**. At 60% opacity it
falls to 2.30:1 and 2.11:1. The opacity is not a modifier on a passing token, it takes a
failing token to roughly half the requirement. Second, the token is set in `mono` at 12px,
the second-smallest role in the system.

**Minimum fix:**

- If the token must clear the whole ladder: **`#8B9899`** → 6.11 / 5.72 / 5.41 / 5.03 / **4.54**:1.
  Same hue (185°), same saturation, +11% lightness.
- If it only needs the three levels in use at rest (`surface`, `-low`, `-high`):
  **`#829092`** → 5.51 / 5.15 / **4.54**:1. Closer to the original register.
- Prefer **`#8D9A9B`** (6.27 / 5.86 / 5.55 / 5.16 / **4.65**:1) if you want margin for the
  hover and future-level uses of `-container` and `-highest`.

**And drop the opacity reduction entirely.** `#8B9899` computes 6.11:1 against `surface` versus
`on-surface-variant`'s 6.95:1 and `on-surface`'s 15.00:1 — a 2.5× step down from body text,
which achieves "present in the layout but not attracting the eye" through the token alone. If
de-emphasis beyond that is wanted, use the existing non-colour affordances the design already
has (no link treatment, no accent, the honest status line) rather than opacity. Note the fixed
token lands close to `on-surface-variant` (`#93A3A4`, 6.95:1); if the three-way distinction
between body / secondary / faint needs to stay legible as a hierarchy, lighten
`on-surface-variant` toward `#A5B3B4` at the same time so the ladder of text weights keeps its
spacing.

### F2 — `outline` fails 1.4.11 as the `button-ghost` boundary (worst 1.47:1, need 3:1)

`button-ghost` is `background: transparent` + `border: {colors.outline}`. The border is the
only thing identifying it as a control, so 1.4.11 applies squarely. Computed 1.79:1 on
`surface`, 1.67:1 on `-low`, 1.58:1 on `-container`, 1.47:1 on `-high` — between 40% and 51%
of the requirement.

**Minimum fix:** split the token by role. `outline` is doing two jobs — interactive boundary
and non-interactive badge border — and only the first needs 3:1.

- Raise `outline` to **`#687A7D`** → 4.05 / 3.79 / 3.58 / 3.33 / **3.01**:1 across the ladder.
  Same hue (189°), same saturation. **`#6A7D81`** gives headroom (4.22 / 3.94 / 3.73 / 3.47 /
  3.13:1) if you would rather not sit on the line at the top of the ladder.
- If `#687A7D` reads as too loud for the weak evidence badge, introduce
  `outline-interactive: '#687A7D'` for `button-ghost` and leave `outline: '#394345'` for the
  badge border, which is non-interactive and text-redundant (§3). That is the smaller visual
  change and keeps the badge quiet.
- Alternatively give `button-ghost` a faint fill (e.g. `surface-container-high` on `surface`,
  which computes 1.35:1 — not sufficient alone) *in addition to* a lightened border. The border
  fix is the load-bearing one; a fill does not substitute for it.

### F3 — `focus-ring` computes 1.00:1 on the primary button

`focus-ring` and `primary` are the same hex. Strictly, the 2px offset means the ring's adjacent
colour is `surface` (10.24:1) and AA is satisfied — but `DESIGN.md`'s claim is false as written,
`EXPERIENCE.md` calls a clipped or occluded ring "a defect, not a cosmetic issue", and a focus
indicator that is the same colour as the control it rings has no perceptual margin at all.

**Minimum fix:** add an inner contrasting stroke, so the ring works regardless of what is
behind it. Computed options against `primary`:

- **`on-primary` `#08302C`** → **8.04:1** against `primary`. Best choice: it is already in the
  palette, it is the button's own text colour, so the ring reads as belonging to the component.
- `surface` `#121617` → **10.24:1**. Slightly higher contrast, but introduces the page ground
  as a stroke colour on a component.
- Not `on-surface` `#E5EAEA` → **1.46:1** against `primary`. Near-invisible; do not use.

Recommended token shape: keep `focus-ring: '#6FD3C6'` as the outer 2px, and add
`focus-ring-inner: '{colors.on-primary}'` as a 1px stroke at the element edge. On the ladder
surfaces the inner stroke is invisible and costs nothing; on `primary` it is what makes the
ring readable. This also hardens the ring against the tile-edge clipping `EXPERIENCE.md`
already worries about.

### F4 — Signal pill fills are invisible on raised tiles (worst 1.00:1)

Advisory for conformance (§3), but `signal-absent-container` vs `surface-container-high`
computes **1.00:1** and `signal-unchecked-container` vs the same computes **1.01:1** — the pill
shape does not exist on a level-2 tile. Since `surface-container-high` is specified for "tile
carrying primary attention, and popovers" and the risk-summary tile is where pills cluster,
this defeats the pill shape as a scanning aid.

**Minimum fix:** do not chase 3:1 on the fills. Lightening them to 3:1 breaks the pill text:
`signal-present-container` → `#3D7A74` puts its own text at 3.00:1 (from 7.42), `absent` →
`#5C7479` at **1.95:1**, `unreadable` → `#896A48` at 2.52:1, `unchecked` → `#7B6796` at 2.17:1.
Every one of those trades a passing 1.4.3 pairing for a marginal 1.4.11 one. Wrong direction.

Instead, **add a 1px stroke in the signal colour itself** — the foreground already passes on
every surface, so the stroke comes free:

| Pill | Stroke | vs `surface` | vs `-low` | vs `-high` |
|---|---|---:|---:|---:|
| `present` | `#7FD9CD` | 11.02 | 10.30 | 9.08 |
| `absent` | `#96A5A7` | 7.14 | 6.68 | 5.88 |
| `unreadable` | `#E0B072` | 9.21 | 8.61 | 7.59 |
| `unchecked` | `#B8A2D6` | 7.96 | 7.44 | 6.55 |

This keeps every fill and every text pairing exactly as specified, adds no token, and gives the
pill a visible boundary on any surface. It also happens to be the same mechanism that fixes F5.

### F5 — `outline-variant` dividers at 1.03:1 are not visible

Advisory (§3 — an in-tile divider between text rows is decoration for 1.4.11). But 1.03:1 on
`surface-container-highest`, 1.15:1 on `-high` and 1.30:1 on `-low` means the activity feed's
row separation is carried by spacing, not by the divider the component spec names. If the
divider is meant to do work, it needs to be visible.

**Minimum fix:** this does not need 3:1 — holding a decorative divider to a component threshold
would overshoot and add visual noise the design explicitly rejects. Target visibility instead:
**`#3F4C4F`** computes 2.05 / 1.91 / 1.81 / 1.68 / 1.52:1 across the ladder — same hue, clearly
present, still recessive. (For reference, 3:1 across the whole ladder would require `#677A7F`,
which is as light as the fixed `outline` and would read as a rule rather than a divider.)

### F6 — `primary-container` as strong-badge border, 1.49:1

Advisory (§3), and the fix is a documentation change rather than a token change. Do not lighten
`primary-container`: raising it to 3:1 (`#41827B`) drops `on-primary-container` on it from
7.42:1 to **2.70:1** and `primary` on it from 6.90:1 to **2.51:1**, breaking two passing text
pairings to fix a boundary that carries no information.

**Minimum fix:** either use `primary` (`#6FD3C6`, 10.24 / 9.57 / 8.43:1 vs the surfaces) as the
strong badge's *border* as well as its text — a one-token change with no downstream cost — or
correct `DESIGN.md`'s claim that "the weight *is* the disclosure" to match `EXPERIENCE.md`'s
more accurate "its two visual weights are redundant with its text", and let the text colour
difference (10.24:1 vs 6.95:1) carry the distinction it already carries.

### F7 — Signal set is not hue-distinguishable under dichromacy

Not a conformance failure (§5.3). The redundant-text mandate in both documents is what saves
1.4.1, and it should be treated as load-bearing rather than as belt-and-braces.

**Minimum fixes, in increasing order of cost:**

1. **Correct the claim.** `DESIGN.md`'s `unchecked`-is-violet rationale is stated as a
   robustness property and is false under protanopia. Rewrite it to say what is actually true:
   the four colours are distinct for trichromats, the set is *not* hue-separable under
   red–green deficiency, and the mandatory text label is therefore a conformance dependency,
   not a redundancy. This costs nothing and stops the false claim propagating into
   implementation decisions ("the colour tells you, so the label can be abbreviated").
2. **Separate the two that collapse hardest.** `present` and `unchecked` compute 1.01:1 under
   protanopia. They are also the two whose distinction matters most (a satisfied signal vs an
   unexamined one — precisely the "`Nothing flagged` and `nothing checked` must be visibly
   different outcomes" requirement in `EXPERIENCE.md`). Give them a luminance separation as
   well as a hue one: `unchecked` is currently the *lightest* of the four (L\* 73.7%) despite
   meaning "least information". Darkening it to around L\* 60% while holding its 265° hue would
   give it a distinct weight under every simulation, at the cost of some contrast headroom it
   can afford (7.96:1 today).
3. **Add shape to the closed set.** The strongest fix, and consistent with the design's own
   "pair every colour-carried meaning with text or shape" rule — which currently pairs with
   text everywhere and shape nowhere, since all four pills share `rounded.full`. Four distinct
   leading glyphs in the pill (a filled dot, a hollow dot, a triangle, a dash) restore
   at-a-glance scanning for dichromats without touching a single colour token.

---

## 7. What is right, and should not be changed while fixing the above

- **The luminance architecture of the ladder.** Five surfaces spanning 15.00:1 to 11.13:1
  against `on-surface` means the elevation system costs almost nothing in text contrast. Tonal
  elevation on a dark ground usually forces exactly the trade this palette avoided.
- **`primary` is exemplary.** 10.24:1 as small text on the ground, 7.60:1 at the top of the
  ladder, 8.04:1 for `on-primary` on it, 3:1+ as a fill everywhere. A desaturated accent that
  still passes as 10px badge text is not easy to hit.
- **Every signal *text* pairing passes**, on its own container and on all five bare surfaces,
  at the full 4.5:1 small-text threshold rather than the 3:1 that a careless reading of
  `mono-badge` might have allowed.
- **The graphite-not-black and off-white-not-white decisions are real**, not rationalisation:
  the palette gave up 1.75 contrast points versus `#FFFFFF` on `#121617` and still sits at
  15.00:1.
- **The redundancy mandate is what carries 1.4.1** through the dichromacy problem in §5.3. It
  was specified for the right reason and it works. It should be treated as non-negotiable in
  implementation, not as a nice-to-have that a future compact density mode can trim.

## Summary table

| | Count |
|---|---:|
| Pairings computed | 88 |
| Pass | 59 |
| Genuine AA failures | 9 |
| Sub-threshold, advisory (decorative/tonal, §3) | 20 |

Genuine failures: `on-surface-faint` × 5 surfaces (1.4.3), `outline` × 4 surfaces (1.4.11).
`focus-ring` on `primary` at 1.00:1 is listed separately as F3 — a false claim and a real
perceptual defect that a strict reading of 1.4.11 nonetheless permits because of the 2px offset.

## Method notes

Ratios were computed by script, not by tool or estimate. Colour-vision simulation used the
Viénot–Brettel–Mollon linear-RGB projection matrices for deuteranopia, protanopia and
tritanopia; simulated hexes are round-tripped through the sRGB transfer function, so the hue and
lightness figures in §5.3 are measured on the simulated colours rather than inferred. Candidate
replacement hexes were found by monotonically raising HSL lightness with hue and saturation
held constant, then re-measuring against every relevant background — so each proposed hex is
verified, not proposed and assumed.
