---
title: 'Get from the tool to your editor'
type: 'feature'
created: '2026-09-04'
status: 'done'
baseline_commit: '3fe84dc8fb6933ccb57e325c290577c46837e123'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A reader who finds the thing that is wrong has no way out of the tool — the artifact view shows content and nothing else, so acting on it means retyping a path. Story 2.3 built the button vocabulary and deliberately left the primary slot empty for this.

**Approach:** Put the artifact's path on the surface as text a reader can see and select, and a link beside it that opens the file where they work. Both live in the artifact-view shell so every later viewer inherits them. No client script: the clipboard half is Story 2.3b, split off by risk class.

## Boundaries & Constraints

**Always:**
- Both the path text and the link live in the **artifact-view shell**, not in a per-type viewer, so Stories 2.4–2.8 inherit them.
- **Nothing writes to the project.** FR-24's own clause and AD-1.
- The path is **visible, selectable text**. It is the fact a reader needs; the clipboard convenience over it is 2.3b's.
- **Exactly one `button-primary`** on the surface — Story 2.3's bound, non-vacuous for the first time here.
- The link renders for **every** row state — readable, unreadable, non-markdown, directory — because it is a function of the row's path, which every row has.
- Keyboard operable, unclipped focus ring, and an accessible name that says what the link does.

**Ask First:**
- Any CSP change, any client script, any new route. **All three belong to Story 2.3b** and the split exists to keep them out of this diff.
- Adding a dependency.
- Making the editor configurable.

**Never:**
- **No claim on FR-24.** FR-24 is copy-to-clipboard *and* open-in-editor; this story ships one of the two, so it **founds FR-24 without satisfying it** — Story 2.3b completes it. Claiming it here is the unenforceable-claim defect Epic 1's retrospective found seven times.
- **No claim on UX-DR11** — Story 2.3's, one requirement one owner.
- No client JavaScript, and **no assertion that the page carries no script may be changed**: this story must leave every one of them true.
- No section permalink — Story 2.11's, and there are no sections yet.
- No configurable editor. FR-10 config is deferred indefinitely.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Readable artifact | Any row the shell renders | The path as visible text, and an open-in-editor link carrying the absolute path | N/A |
| Unreadable artifact | Read failed at any stage | Both still render — the path is exactly what a reader needs when the tool cannot show the file | N/A |
| Not markdown | A readable non-`.md` row | Both render identically | N/A |
| Directory artifact | A run folder or sharded-document row | Both render and target the directory; an editor opens a folder | N/A |
| Path needing encoding | A space, `#`, `?` or non-ASCII in the path | The href encodes it so the whole path survives; the visible text stays the readable path | N/A |
| A path that is already absolute-looking | A row whose relative path begins with a separator or a drive-shaped prefix | Joined to the project root without escaping it; never a path outside the project | N/A |
| One primary per surface | The artifact surface | Exactly one element carries `button-primary` | Test fails on a second |
| Keyboard only | Tab to the link | Reachable and operable, with a visible unclipped ring | N/A |
| The page still carries no script | Any surface | Every existing no-script assertion stays true and unamended | Test fails if one breaks |

**Combinations with no row, and why.** The link and the path text are functions of the row's **path**, which every row has, so read state, content type and directory-ness do not vary them — hence "still render" once rather than a pair per state. There is no row for the editor failing to open: this suite has no editor and no browser, so what happens after the click is unverifiable here and specifying it would be claiming a test that cannot exist. The absent-row case has no row at all and answers 404 before the shell renders.

</frozen-after-approval>

## Code Map

- `src/render/artifact.ts:258-280` -- `refreshHref` :258, `main` assembled :259, `documentShell(projectRoot, refreshHref, main)` :280. The path text and the link go into `main`. `found.row.path` is **project-relative**; `projectRoot` is already this function's first argument.
- `src/domain/url.ts` -- the precedent for a pure URL owner, and the reason the editor URL belongs in the domain: encoding is then testable with no server. `src/domain/` has **zero outgoing imports** (frozen), so the new module must import nothing — including `node:path`, so any joining is string work it does itself.
- `src/adapters/fs/paths.ts` -- `toPlatform` unbrands a `CanonicalPath`. Decide deliberately where the project-relative path becomes absolute: the domain module should take an already-absolute path rather than knowing about roots, which keeps it a pure URL formatter.
- `src/render/components.ts` -- `buttonPrimary` / `buttonGhost`, `ButtonOptions` is `{label, href}`, both guarded (empty label **and** empty destination throw), both values escaped, both emit `<a>`. The link needs nothing more than these.
- `test/render/components.test.ts` -- the one-primary loop and its positive control. Both surfaces count **zero** today; this story is the first to make the bound real, so it should now count exactly one on the artifact surface.
- `test/render/artifact.test.ts:316` and `:432` -- page-level `doesNotMatch(page, /<script\b/i)`. **These must keep passing untouched.** `:547` likewise, and it is a different claim worth not confusing with them: it asserts a *non-markdown artifact's own text* `<script>alert(1)</script>` is escaped in the content region. Story 2.3b will amend the first two and must still leave `:547` alone.
- `test/render/stylesheet.test.ts` -- the bidirectional round-trip (a rule with no markup fails, a class with no rule fails) and `test/render/page.test.ts`'s `KNOWN_CLASSES`: any new class needs both a rule and an entry.
- `test/render/components.test.ts` -- the anti-clipping rule is **zero tolerance across the whole sheet** for `overflow: hidden|clip|auto|scroll`, `clip-path`, `mask`, `contain: …paint`. A path string is long and will want to wrap, not scroll.
- `deferred-work.md` entries whose recorded trigger is **this story**: primary/ghost box geometry differs by the ghost border — this is the first surface to render a primary at all, though the ghost beside it (Refresh) is in the header rather than adjacent, so state whether that counts; and the Refresh hand-written-anchor drift risk, which this story adds one call site to. Close them or say explicitly that it does not.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/editor.ts` -- new: the editor URL as a pure function of an **absolute** path. `vscode://file/<path>`, hardcoded and recorded. Imports nothing.
- [x] `test/domain/editor.test.ts` -- new: the scheme; a path with a space, `#`, `?`, `%` and a non-ASCII character surviving the round trip; and a relative or empty input refused rather than formatted into a broken href. Assert the href, never that an editor opens.
- [x] `src/render/artifact.ts` -- the path as visible selectable text and the open-in-editor `button-primary`, in the shell. The absolute path derived here from `projectRoot`, not in the domain module.
- [x] `src/render/stylesheet.ts` -- rules for the exits' container and the path text: every value through a token, wrapping rather than scrolling, no clipping property of any kind.
- [x] `test/render/artifact.test.ts` -- the link and the path text for readable, unreadable, non-markdown and directory rows; the href exact for a path needing encoding; the surface now carrying exactly one `button-primary`; and the existing no-script assertions still passing **unamended**.
- [x] `test/render/stylesheet.test.ts` and `test/render/page.test.ts` -- the new classes in the round-trip corpus and in `KNOWN_CLASSES`.
- [x] `scripts/run-tests.ts` -- raise the floor from 1008.
- [x] `test/render/components.test.ts` -- the one-primary bound made **exact** per surface (Dashboard 0, artifact view 1) rather than only `<= 1`, since this story is what makes it non-vacuous. Not on the original task list; recorded here because `check-tasks.ts` only verifies ticked-to-touched and would not have caught the reverse.
- [x] `test/architecture.test.ts` -- the importer-set and purity rows for `src/domain/editor.ts`: one importer, an exactly-empty specifier list, and no Node built-in named. Also not on the original list, and added deliberately — a third pure module joining that table unasserted is how the convention stops being one.

**Acceptance Criteria:**
- Given any artifact the shell renders, when the page is requested, then the path is present as visible text and an open-in-editor link carries the absolute path.
- Given a path containing characters that need encoding, when the link is rendered, then the href encodes them and the visible text does not.
- Given the artifact surface, when its markup is inspected, then exactly one element carries `button-primary`.
- Given a keyboard alone, when the reader tabs to the link, then it is reachable with a visible, unclipped ring.
- Given the whole suite, when it runs, then every existing no-script assertion still passes unamended, nothing writes to the project, and no new route exists.

## Spec Change Log

**2026-09-04 — split by risk class at the planning checkpoint, by user decision.** The first draft of this spec covered both of FR-24's exits at ~3,600 tokens. Open-in-editor is a link and needs no script, no CSP change and no amended assertions; copying needs all three. Rather than carve by size, the split follows the risk boundary — the same shape as Story 2.1's three-way split into one risk class each. **Story 2.3b** carries the clipboard half and is recorded in `deferred-work.md` with Jamie's already-made CSP decision attached, so it is not re-asked. FR-24 is satisfied by the pair; this story founds it alone.

**2026-09-04 — review round: three layers, eleven patches, six deferrals, and one regression of my own.**

**The split held.** All six no-script assertions pass **textually unchanged**, and no CSP change is in the diff — verified by diffing them against the baseline rather than by running them, since passing would not have proved they were untouched. That was the point of splitting by risk class, and it is now a checked fact rather than an intention.

**Two declarations the code's own comments called load-bearing were unpinned.** Measured: deleting `.artifact-path`'s `overflow-wrap: anywhere` and `min-width: 0` left the suite at **1025/1025 green**, and so did deleting `.artifact-exits`'s `align-items: baseline`. The first matters most — `.artifact-path` became a flex item beside a focusable button in this story, and `flex-wrap` only wraps *between* items, so without that pair one unbreakable path pushes the page sideways and re-invites the scroll container the comment says is refused. Both are now required rules, each re-verified by mutation.

**A UNC project root took down the whole artifact view, and the docblock said it could not happen.** `isAbsolutePath` recognised only `/` and a drive prefix; its comment claimed `canonical` "resolves through the platform's own resolver" so no caller could produce a UNC path. `canonical` is `resolve()` plus `realpathSync.native`, and neither converts `\\server\share` — so `editorUrl` threw, the throw reached the HTTP adapter's catch, and **every** artifact page answered 500 while the Dashboard kept working. Now recognised, with both spellings producing one href and the host's two leading separators preserved (squeezing one would make the host a path segment and name a different place while still looking valid). It is pure string logic, so it is tested here rather than deferred to a Windows run. An empty `projectRoot` also silently anchored at the filesystem root; now refused at the boundary, as `chrome.ts` already does for a blank root.

**My own regression, caused between planning and review.** Recompiling `epic-2-context.md` from the sources dropped load-bearing content the previous hand-patched copy carried — most seriously it re-asserted AD-3's bounded-work rule **as a property**, deleting the dated 2026-09-03 correction that demoted it to an intent. Also lost: the layering decision this very story leans on to justify a pure `src/domain/editor.ts`, the four-signal-state honesty rule, the no-telemetry advisory and its bundled-dependency carve-out, status vocabularies coming from the target project's own template at runtime, 200% text resize, Epic 1's inheritances, the indefinite deferral of artifact roots, and Story 2.3b itself. Nine restorations applied. The lesson recorded in `deferred-work.md`: a recompile is not a safe refresh of a document that has been corrected in place.

**A third dependent of the AD-11 withdrawal, missed twice before.** `EXPERIENCE.md`'s global-chrome paragraph still said Refreshing **and Stale** are reported in the header, "so every surface inherits both". Struck. That is now three dependents found after the withdrawal itself, all in documents no test reads.

**Also patched:** `exitsOf`'s non-greedy region match, which stopped at the first `</div>` and would have silently narrowed to a prefix the moment Story 2.3b nests an element in the row — demonstrated losing the link, now depth-counted; four comments in files this diff touches that still claimed no surface renders a `button-primary`; a duplicated CSP paragraph under Story 2.3b in `epics.md`; the `Satisfies:` convention restored on both split stories, which 39 others carry; a `correction:` reconciling the superseded "seven assertions" count against the correct six-and-one-that-must-not; and the two test files this story changed that were absent from its own task list.

## Design Notes

**Why the link is primary.** Open-in-editor is the forward action a reader came for. Story 2.3 gave Refresh `button-ghost` precisely to keep this slot free, and the one-primary bound has been asserted-but-vacuous since then — every surface counted zero. This story is what makes it a real constraint, so expect it to start doing work.

**Why the editor URL is a domain module.** A pure function from an absolute path to an href is testable with no server, no filesystem and no browser — which matters because everything downstream of the href is unverifiable here. Keeping it out of `src/render/` also avoids widening a layer boundary that retrospective action item 13 records as unenforced.

**What cannot be verified, stated so it is not claimed.** This suite has no browser and no editor. It can assert the href is exact, absolute and correctly encoded. It cannot assert that clicking it opens anything, and nothing in the tests may imply otherwise.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm test` -- **1027 pass, 0 fail, 0 skipped** (1008 at baseline). `DEFAULT_MIN_TESTS` raised to 1027.
- `node scripts/check-tasks.ts < _bmad-output/implementation-artifacts/spec-2-3a-get-from-the-tool-to-your-editor.md` -- every ticked task names a file the diff touches.
- **Mechanism check:** break the href's encoding for one character and confirm a named test fails. **Done:** leaving `#` unencoded failed `a path needing encoding survives the round trip, character for character`. (A first attempt patched a comment rather than the call site and changed nothing — a non-applied mutation, redone at `editor.ts`'s `segments.map(encodeURIComponent)`.)
- **Mechanism check:** add a second `button-primary` to the artifact surface and confirm Story 2.3's one-primary assertion fails — on real markup this time, not on the synthetic positive control. **Done:** two tests failed, including `at most one button-primary appears on any surface the suite renders`, which had been vacuous since Story 2.3 shipped because every surface counted zero. This story is what made it real.

**Manual checks:**
- Serve this repository, open one of its own specs, and report the exact `vscode://` href and the visible path text.
- Confirm the served page still contains no `<script>`.

## Suggested Review Order

**The URL, and the two shapes that nearly broke it**

- One pure function, absolute path in, href out; nothing downstream is verifiable.
  [`editor.ts:135`](../../src/domain/editor.ts#L135)

- A UNC root used to 500 every artifact page, on a reason that did not hold.
  [`editor.ts:70`](../../src/domain/editor.ts#L70)

- Recognising UNC forced this too: its backslashes separate, POSIX's do not.
  [`editor.ts:104`](../../src/domain/editor.ts#L104)

**Where relative becomes absolute**

- The join, guarded so `..` and a leading separator cannot leave the root.
  [`artifact.ts:212`](../../src/render/artifact.ts#L212)

- The label, chosen by the code because the string index specifies none.
  [`artifact.ts:170`](../../src/render/artifact.ts#L170)

**The row, and the declarations that keep it survivable**

- Flex, wrapping not scrolling; a clipped row would cut a focus ring.
  [`stylesheet.ts:664`](../../src/render/stylesheet.ts#L664)

- Deleting this pair left the suite green; `flex-wrap` alone does not save it.
  [`stylesheet.test.ts:677`](../../test/render/stylesheet.test.ts#L677)

**Where the review round changed the outcome**

- Both UNC spellings pinned to one href, with the host not eaten.
  [`editor.test.ts:164`](../../test/domain/editor.test.ts#L164)

- An empty root silently anchored at `/`; now refused at the boundary.
  [`artifact.test.ts:385`](../../test/render/artifact.test.ts#L385)

- Depth-counted, so 2.3b nesting an element cannot silently narrow the region.
  [`artifact.test.ts:221`](../../test/render/artifact.test.ts#L221)

**Supporting**

- One importer by design: a second means a viewer building its own exit.
  [`architecture.test.ts:1194`](../../test/architecture.test.ts#L1194)

