---
title: 'Build the surface action buttons'
type: 'feature'
created: '2026-09-04'
status: 'done'
baseline_commit: 'c82791336046bdc4ca0d30b4b4870f3b4e4399fd'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** DESIGN.md assigns `button-primary` to a surface's single main action and `button-ghost` to its others, and neither component has been built. The cost is already in the code: `src/render/chrome.ts:37-39` records that the Refresh control on **every** surface is unstyled precisely because the component it needs "belongs to a later story". Nothing can be given a real action until the vocabulary for one exists.

**Approach:** Build both components from the tokens that already describe them, give Refresh the ghost treatment it has been waiting for, and make "at most one primary per surface" a test rather than a habit.

## Boundaries & Constraints

**Always:**
- **At most one `button-primary` per surface** (UX-DR11), asserted over rendered markup.
- Every value through a token — no hex, px or rem literal (UX-DR1).
- The filled variant uses the **inner-stroke** focus treatment; an outer ring is invisible on a `primary` fill.
- Labels escaped; an empty label refused, not rendered.
- Keyboard operable, focus ring never clipped, accessible name says what the control does.

**Ask First:** any CSP change; any new dependency.

**Never:**
- **No client JavaScript here.** Not because AD-2 forbids it — AD-2 permits the client to enhance delivered markup, and it is the CSP that denies script — but because the affordance needing it is the next story's.
- No copy affordance, no open-in-editor link: both are Story 2.3a.
- No new route, no static-file serving.
- **No claim on FR-24.** This satisfies **UX-DR11 only**. FR-24 is the two exits; claiming it here would be the unenforceable-claim defect Epic 1's retrospective found seven times.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Ghost button | A label and a destination | An element carrying `button-ghost`, label escaped | N/A |
| Primary button | A label and a destination | An element carrying `button-primary`, label escaped | N/A |
| Hostile label | `<script>alert(1)</script>` | Renders as visible text, creating no element | N/A |
| Empty label | `''` or whitespace only | Refused at the boundary | Throws, naming the field |
| Refresh adopts ghost | Any surface | Refresh carries `button-ghost` and still navigates | N/A |
| One primary per surface | Every surface the suite renders | At most one `button-primary` occurrence | Test fails on a second |
| Focus | Tab to either variant | Visible ring, unclipped, inner stroke on the filled one | N/A |
| Ghost label contrast | `primary` as label text on each surface colour | Clears 4.5:1 on all four | Test fails below |

**Combinations with no row, and why.** Variant against label content is one behaviour — escaping and the empty refusal are properties of the boundary, not the variant — so those rows are stated once. Variant against surface is one row too: markup does not vary by surface, and the only per-surface rule is the primary count, which has its own row. There is no disabled or busy state: nothing here has an action that can be unavailable or in flight, and styling one would mean inventing a state no surface can enter.

</frozen-after-approval>

## Code Map

- `src/render/tokens.ts:349-361` -- both are **component tokens**, not typography roles. Primary: `{background, color, borderRadius, type}`. Ghost: `{background: 'transparent', color, border, borderRadius, type}` — it mixes a **literal** with refs and carries a `border` primary lacks. `stylesheet.ts` resolves the refs.
- `src/render/components.ts` -- the shape to copy: `tile` :111 returns `string`; `tileBody` :81 runtime-checks `isMarkup` :90 because `Markup`'s `BUILT_HERE` symbol (`html.ts:69`) survives a cast. So: options interface, guard that throws, `escapeHtml` the label, return `string`.
- `src/render/chrome.ts:37-39` -- the deferral this story closes. `projectHeader` :128 renders the anchor at :153; `REFRESH_LABEL` :72. Rewrite that docblock to record what happened.
- `test/render/stylesheet.test.ts:772-826` -- bidirectional round-trip: a rule no markup carries fails, a class nothing styles fails. Its comment :777-780 is the precedent for a component ahead of its surface — `.tile-raised` is "styled and fully tested while the Dashboard has… nothing to raise… without pretending the page uses everything." `button-primary` takes that route; its first *surface* consumer is 2.3a.
- `test/render/page.test.ts:145-180` -- `KNOWN_CLASSES`; both classes must be added.
- `test/render/components.test.ts:155-168` -- **zero tolerance, whole sheet**, for `overflow: hidden|clip|auto|scroll`, `clip-path:`, `mask:`, `contain: …paint`. `:146-151` requires padding to clear the ring's 4px, checked today only against `tile-padding`.
- `test/render/contrast.test.ts` -- `:176-184` already validates `on-primary` on `primary` at >=4.5:1, so the filled variant's pairing is covered. `:165-174` is why the filled variant needs `innerStrokeOnFilled`. **`:193-199` must be left exactly as it is:** it asserts `primary` versus `on-surface` is *below* 3:1 — text against text, deliberate, about links not relying on colour alone, and a different question from a label against a background.
- `test/render/stylesheet.test.ts:738-745` -- `ROLES_NOT_YET_APPLIED` is empty and **irrelevant**: it tracks typography roles. Do not touch it.
- `src/render/stylesheet.ts` -- `:337` the global `:focus-visible` already reaches new interactive elements; `:430` already mentions `button-primary` in a comment.

## Tasks & Acceptance

**Execution:**
- [x] `src/render/components.ts` -- the button component(s) for both variants. State whether it emits an `<a>` or a `<button>`: everything on these surfaces navigates, and with no script a `<button>` outside a form does nothing, so the honest element is likely an anchor styled as a button.
- [x] `src/render/stylesheet.ts` -- rules for both classes, every value through a token, inner-stroke focus on the filled variant, no clipping property.
- [x] `src/render/chrome.ts` -- Refresh adopts `button-ghost`; the `:37-39` docblock rewritten to say the deferral is met and why ghost: Refresh is not a reading surface's main action, and reserving primary keeps UX-DR11 satisfiable when 2.3a adds one.
- [x] `test/render/components.test.ts` -- both variants render class and escaped label; hostile label creates no element; empty label throws; **at most one `button-primary`** across every surface rendered.
- [x] `test/render/chrome.test.ts` -- Refresh carries `button-ghost` and is still a link. `:116` already asserts "refresh is navigation, not script" — keep that meaning.
- [x] `test/render/stylesheet.test.ts` -- both classes in the round-trip corpus, `button-primary` on the `.tile-raised` precedent with a comment saying so.
- [x] `test/render/page.test.ts` -- `KNOWN_CLASSES` gains both classes.
- [x] `test/render/contrast.test.ts` -- pairing rows for `primary` as **label text** on `surface`, `surface-container`, `surface-container-high`, `primary-container` — `button-ghost`'s case, unchecked today. Measured 2026-09-04: 10.24, 9.07, 8.43, 6.90:1, all clearing AA-normal. **Recompute from the tokens; do not hardcode these numbers.** Closes the `deferred-work.md` entry for the missing `primary`-as-text row.
- [x] `scripts/run-tests.ts` -- raise the floor from 996.

**Acceptance Criteria:**
- Given any surface the suite renders, when its markup is inspected, then at most one element carries `button-primary`.
- Given the Refresh control, when any surface renders, then it carries `button-ghost` and remains a navigation link with no script.
- Given a keyboard alone, when either variant takes focus, then a visible ring appears and no ancestor rule clips it.
- Given the token values, when the contrast suite runs, then `primary` as label text clears 4.5:1 on every surface colour it sits on, recomputed from the tokens.

## Spec Change Log

**2026-09-04 — split at the planning checkpoint, by user decision.** The original spec covered FR-24's two exits *and* both components at ~4,100 tokens; Jamie chose "buttons first, exits second". This spec is the buttons alone and claims UX-DR11 only. The exits are recorded in `deferred-work.md` as Story 2.3a, carrying FR-24 **and Jamie's already-made CSP decision**, so 2.3a does not re-ask it.

**2026-09-04 — review round: three layers, and what survived checking.** Two claims were verified and **rejected**: that `sprint-status.yaml` should read `review` (the workflow's step 5 sets that, not step 3), and that the ghost variant's missing `:focus-visible` rule is an omission (it deliberately inherits the base ring, which a test pins by asserting no such rule exists). One claim was **wrong in the reviewer's favour and right in substance**: DESIGN.md really does name refresh as `button-primary`'s example, which contradicted this story — but the UX memlog records the project header being "promoted from Dashboard tile to GLOBAL CHROME", so that parenthetical was written when refresh was one surface's action. Against the same sentence's one-primary rule, a global-chrome primary would spend every surface's budget permanently. So the code stands and **DESIGN.md was corrected**, dated, with that reasoning.

**Eight patches applied.** The load-bearing one: `.button-ghost`'s `border-style: solid` was **unpinned**, and deleting it left the suite at 1007/1007 green — CSS's initial `border-style: none` computes the width to zero, so no border painted, and with a transparent fill Refresh would have degraded to colour-only text with its underline already cancelled. A WCAG 1.4.1 failure on the one control present on every surface, shipping green. It is now a required rule, and the pin was re-verified by mutation. Also: the contrast row iterated a hand-picked four grounds whose stated rule did not describe the set — it excluded `surface-container-low`, which is `components.tile`'s own background and therefore the exact ground the `deferred-work.md` entry being closed was about (9.57:1, the figure that entry had measured by hand); it now iterates the whole ladder. `buttonPrimary`'s docblock named `test/render/page.test.ts` as a second enforcer of the one-primary rule, and that file allow-lists the class and counts nothing — corrected. An empty `href` rendered `<a href="">`, a control that looks like it works and goes nowhere — now refused at the boundary like an empty label. And the one-primary counter gained a **positive control**, because every real surface counts zero today, so `count <= 1` would have passed just as happily on a pattern that matched nothing; breaking the pattern now fails it.

**Eight findings deferred** with triggers, including UX-DR13's "additional 1px inner stroke" (the implementation pulls the single ring inside instead, and no inner-stroke width token exists), and `outline` on `primary-container` at 2.73:1 — below the 3:1 a ghost border needs as its non-colour channel, latent because no ghost sits there yet.

## Design Notes

**Why `button-primary` ships before a surface uses it.** The round-trip test fails a rule with no markup, so it is rendered in the test corpus — the route `.tile-raised` already takes, with that test's own comment as precedent. Stated because it resembles dead code: the alternative ships half of UX-DR11 now and half next story, leaving "one primary per surface" unwritten exactly when the first primary is added.

**Why Refresh is ghost.** `chrome.ts:37-39` calls primary the component for "a surface's single main action". Refresh is not that on a reading surface — reading is — and promoting it spends the one primary the artifact view is allowed before its real forward action exists.

## Verification

**Commands:**
- `npm run typecheck` -- **clean.**
- `npm test` -- **1008 pass, 0 fail, 0 skipped** (996 at baseline). `DEFAULT_MIN_TESTS` raised to 1008.
- `node scripts/check-tasks.ts < …` -- every ticked task names a file the diff touches; 9 of 9 ticked, 0 unticked.
- **Mechanism check, one-primary:** injected two `button-primary` anchors into the artifact shell -- the assertion failed with `found 2`; reverted. Then, because every real surface counts **zero**, a permanent positive control was added: breaking the counter's pattern fails with `the counter must detect two primaries, or the loop below proves nothing`. Both measured.
- **Mechanism check, contrast:** moved the `primary` token to `#2a2a2a` -- the pairing test failed with a **recomputed** `primary as text on surface is 1.27:1`, not a stale figure; reverted. (A first attempt using near-white passed correctly and was a bad mutation, not a bad test: this is a dark theme, so near-white *raises* contrast.)
- **Mechanism check, ghost border:** deleted `declaration('border-style', 'solid')` -- **before the review round this left 1007/1007 green**; after pinning it in `REQUIRED_RULES` the same deletion fails `every required rule is present and declares what it exists to declare`. Reverted.

**Manual checks:**
- Serve this repository; confirm Refresh renders as a ghost button on the Dashboard and on an artifact page, and still navigates. Tab to it and confirm the ring is visible and uncut.

## Suggested Review Order

**The components, and what a button is**

- The one place either variant is built; both guards live here.
  [`components.ts:174`](../../src/render/components.ts#L174)

- An anchor, not a `<button>`: with no script, a `<button>` outside a form does nothing.
  [`components.ts:203`](../../src/render/components.ts#L203)

**The decision that reverses a design document**

- Why Refresh is ghost: a global-chrome primary spends every surface's budget.
  [`chrome.ts:36`](../../src/render/chrome.ts#L36)

- The control itself — two classes, positioning and treatment kept separate.
  [`chrome.ts:48`](../../src/render/chrome.ts#L48)

**The rules, and the channel that replaces the underline**

- Both variants' rules; the underline is cancelled here, so a border must exist.
  [`stylesheet.ts:445`](../../src/render/stylesheet.ts#L445)

- The filled variant pulls its ring inside; an outer ring is invisible on the fill.
  [`stylesheet.ts:473`](../../src/render/stylesheet.ts#L473)

**Where the review round changed the outcome**

- `border-style` now required: deleting it once left the whole suite green.
  [`stylesheet.test.ts:607`](../../test/render/stylesheet.test.ts#L607)

- The counter's positive control, because every real surface counts zero today.
  [`components.test.ts:250`](../../test/render/components.test.ts#L250)

- The whole ladder, not a hand-picked four that excluded the tile's own ground.
  [`contrast.test.ts:193`](../../test/render/contrast.test.ts#L193)

**Supporting**

- An empty destination refused at the boundary, like an empty label.
  [`components.test.ts:240`](../../test/render/components.test.ts#L240)

- The floor, raised to match the exact count.
  [`run-tests.ts:38`](../../scripts/run-tests.ts#L38)

