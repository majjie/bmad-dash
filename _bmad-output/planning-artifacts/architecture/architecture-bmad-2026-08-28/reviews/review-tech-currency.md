---
name: review-tech-currency
type: review
target: ../ARCHITECTURE-SPINE.md
lens: technology currency / verification-gap
reviewed: '2026-08-28'
method: web research (nodejs.org, npm registry, vendor changelogs) + empirical execution on Node 25.4.0
verdict: CHANGES REQUIRED
---

# Technology Currency Review — bmad-dash Architecture Spine

## Verdict

**CHANGES REQUIRED.** The Stack table is headed "Seed — verified current at authoring," and two of its five version pins were not current on the authoring date. One load-bearing technical claim used to justify the markdown library choice is **factually wrong** and was disproved by execution.

The architecture itself is not threatened — every finding is a version pin or a stated rationale, and the spine's own AD-2 deliberately holds the framework as replaceable seed. But the Stack table currently claims a verification standard it does not meet, and a contributor who checks the marked claim will find it false in about ninety seconds.

Scoring the memlog's `(version)` entries against reality: the Node line checks out; the markdown-library line does not. The memlog cites "verified via pkgpulse 2026 comparison" for the library choices. pkgpulse.com is a real site, but it is a low-authority SEO comparison aggregator, not a primary source — and the version numbers derived from it are wrong (see F-2, F-3). That citation should not be treated as verification for a load-bearing claim.

---

## Findings

### F-1 — Node.js: pin is correct today, stale in seven weeks [MEDIUM]

**Claim:** `Node.js | 24 LTS (floor: 22)`; memlog adds "Node 24 Active LTS (supported to 2028-04-30), floor Node 22 (maintenance)."

**Verified — the facts are right:**

| Claim | Status | Evidence |
| --- | --- | --- |
| Node 24 is Active LTS in Aug 2026 | **TRUE** | nodejs.org/en/about/previous-releases lists v24 "Krypton" as LTS; schedule.json: LTS 2025-10-28 |
| Node 24 supported to 2028-04-30 | **TRUE** | schedule.json `v24.end = 2028-04-30` |
| Node 22 still supported | **TRUE** | Maintenance LTS; `v22.maintenance = 2025-10-21`, `v22.end = 2027-04-30` |

**The gap:** the spine does not record that **Node 24 leaves Active LTS on 2026-10-20** — roughly seven weeks after authoring — when **Node 26 becomes Active LTS on 2026-10-28**. Node 26 has been Current since 2026-05-05. The pin stays *supported* until 2028, so nothing breaks; but the phrase "24 LTS" stops meaning "Active LTS" within the quarter, and the spine reads as though it were a durable statement.

Also worth noting for the floor: **Node 20 went EOL 2026-04-30**. The floor of 22 is now the lowest supported line, not a conservative choice — there is no slack beneath it.

**Recommendation:** write the pin as `24 (Active LTS to 2026-10-20, supported to 2028-04-30; floor: 22, Maintenance LTS to 2027-04-30)`, or move the pin to 26 and let 24 be the floor. Either way the dates belong in the table so the next reader can see when it expires.

### F-2 — markdown-it 14.x is no longer the current major line [HIGH]

**Claim:** `markdown-it | 14.x`.

**Reality (npm registry, checked 2026-08-28):**
- `latest` = **15.0.1**, published **2026-08-27** — the day before the spine was authored.
- 15.0.0 shipped earlier; 14.3.1 is now parked under an explicit **`v14-legacy` dist-tag**.

Being on a line the maintainers have tagged `legacy` is a different position from being on the current line, and the spine records it as current.

**v15 breaking changes that touch this project** (from the official migration guide):

| Change | Effect on bmad-dash |
| --- | --- |
| Rewritten to ESM (CJS fallback retained) | Neutral — the spine is ESM-shaped already |
| **TypeScript types now bundled** | **Win.** Drops `@types/markdown-it` — a dependency the spine's own minimalism constraint would want gone |
| linkify-it 6: fuzzy links like `example.com` no longer auto-linked by default | Behaviour change in rendered artifact bodies; likely desirable for a document viewer |
| `md.utils.assign/has/isString` removed | Only affects plugin authors |
| Deep internal imports (`markdown-it/lib/token.mjs`) no longer exported | Only affects plugin authors |
| Individual rules and presets no longer exported | Only affects plugin authors |
| Transitive deps bumped: argparse ^3, entities ^8, uc.micro ^3, linkify-it ^6 | Install surface changes |

**The public parser API — including the token stream `src/render/` and `src/domain/` sectioning depend on — is compatible with v14.** So this is a low-risk bump, not a migration.

**Countervailing evidence for staying on 14:** VS Code 1.136.0 still pins `markdown-it ^14.2.0` in `extensions/markdown-language-features/package.json`. If the "contributors recognize it" argument is doing real work, it argues for 14, not 15. That is a legitimate reason to hold — but it should be *written down as a reason*, not left looking like the current version.

### F-3 — The marked rationale is factually wrong, and disproved by execution [HIGH — most serious finding]

**Claim (spine Stack rationale, via memlog):** "marked returns HTML strings and cannot section a document, making FR-77 shard-aware paging and FR-26 TOC impossible."

**This is false.** Executed against `marked@18.0.11` on Node 25.4.0:

```
marked.lexer(src) -> token array
  marked heading depth=1 text="Title"   raw="# Title"
  marked heading depth=2 text="Alpha"   raw="## Alpha"
  marked heading depth=3 text="Alpha 1" raw="### Alpha 1"
  marked heading depth=2 text="Beta"    raw="## Beta"

marked.parser(tokens.slice(betaIdx)) -> "<h2>Beta</h2>\n<p>text b</p>\n"
```

marked exposes `marked.lexer()` returning a token array whose `heading` tokens carry `depth` (1–6), `text`, and `raw`; `marked.walkTokens` for traversal; and `marked.parser()`, which renders an **arbitrary token subset** back to HTML. The third line above *is* a document being sectioned at a heading boundary and rendered — the exact operation the spine says marked cannot perform.

markdown-it may well still be the right choice. But the reason given is not one of the reasons, and it is the only reason the spine offers. This matters more than a version pin: the spine names its audience as "future open-source contributors" who "never spoke to the author," and this is the first claim such a contributor would test.

**Compounding evidence that this decision was asserted, not checked:** the memlog compares against **"marked 12.x."** marked is at **18.0.11**, published 2026-08-24. That is six major versions stale, and marked 12 dates to early 2024 — a training-data-shaped number, not a researched one. A comparison that got the competitor's major version wrong by six did not verify the competitor's API.

(For completeness: remark 15.0.1 and unified 11.0.5 are correctly stated, but remark's `latest` was last published 2023-09-18 and unified's 2024-06-19. The "drags in the unified ecosystem" objection stands on its own and needs no version claim.)

**Recommendation:** replace the rationale with reasons that survive checking. The strongest available ones, verified below:
- markdown-it's tokens carry **source line ranges** (`token.map`), which marked's tokens do not — this is what makes shard-boundary alignment and heading-weight carving clean rather than string-matching. See F-4.
- markdown-it is CommonMark-spec-driven with a plugin ecosystem the project will want as artifact viewers grow (C4).
- VS Code's markdown extension uses it, so contributors recognize the token model.

Note also that `marked@18` declares `engines: {node: ">= 20"}` — it would have been compatible with the pinned floor, so compatibility was not the discriminator either.

### F-4 — markdown-it's heading-level claim is TRUE, with a precision trap [MEDIUM]

**Claim:** "markdown-it's token stream carries heading levels."

**Verified TRUE** on markdown-it 15.0.1 — but not in the field a reader would guess:

```
heading_open tag=h1 markup="#"   nesting=1 level=0 map=[0,1]
heading_open tag=h2 markup="##"  nesting=1 level=0 map=[4,5]
heading_open tag=h3 markup="###" nesting=1 level=0 map=[8,9]
heading_open tag=h2 markup="##"  nesting=1 level=0 map=[12,13]
```

The heading level lives in **`token.tag`** (`h1`…`h6`) and **`token.markup`** (`#`, `##`, `###`). **`token.level` is nesting depth, not heading depth** — it reads `0` for h1, h2 and h3 alike.

The spine defers "the sectioning algorithm's heading-weight thresholds" to the code. A contributor implementing FR-77 from the phrase "the token stream carries heading levels" will reach for `.level`, get a uniform `0`, and either debug it or ship carving that silently never splits. Name `tag`/`markup` in the Deferred entry.

**Unclaimed and more valuable than what is claimed:** every `heading_open` token carries `token.map = [startLine, endLine)` — exact source line ranges. That is the mechanism that makes both FR-77 shard-boundary adoption and whole-document heading-weight carving tractable, and it is the genuine discriminator against marked (whose `raw` gives source text but no line offsets). This should be in the spine; it is the real reason for the choice.

### F-5 — esbuild 0.25.x is three release lines stale [MEDIUM]

**Claim:** `esbuild | 0.25.x`. **Reality:** `latest` = **0.28.2**, published **2026-08-08**. Lines 0.26, 0.27 and 0.28 have all shipped.

esbuild is pre-1.0 and treats **minor bumps as breaking by policy**. Relevant changes:

- **0.27.0** — deliberately backwards-incompatible. The binary loader now uses `Uint8Array.fromBase64` unless unavailable in the configured target; the Go toolchain moved to 1.25.4, raising OS requirements to Linux kernel 3.2+ / macOS 12+.
- **0.28.0** — hashes for all platform-specific binary packages are now embedded in the top-level `esbuild` package and validated on install-fallback paths. This is a **supply-chain hardening the spine should actively want**, given that its stated dependency rationale is "supply-chain surface for a tool whose promise is that it does not touch your project."
- `esbuild@0.28.2` declares `engines: {node: ">=18"}` — compatible with the Node 22 floor.

esbuild's own guidance is to pin an exact version or use a patch-only range (`~0.28.0`), explicitly *not* `^`. The spine's `0.25.x` notation is ambiguous about which it means; since esbuild is a build-time devDependency it never reaches the `npx` install path, so the pin is low-risk either way — but it should be current and it should be exact.

### F-6 — Preact 10.x is correct, but Preact 11 RC targets exactly this architecture [MEDIUM]

**Claim:** `Preact | 10.x`. **Correct as stated** — `latest` = 10.29.8, published 2026-08-01. 10.x is the stable line and 11.0.0 is not yet final.

**But:** `preact@11.0.0-rc.1` is published (rc.0 landed ~2026-08-10, following a beta from September 2025). Preact 11's headline change is **Hydration 2.0** — and hydration is precisely the seam AD-2 defines, where server-rendered document HTML meets client-side interaction islands. A major version whose primary change targets this spine's central rendering boundary, currently at RC, is a material fact the Stack table does not record.

Pinning 10.x today is right — 11 is not stable, and the search result explicitly notes production migrations were not recommended pre-final. The finding is that the spine states "10.x" as a settled fact with no note that a directly relevant major is weeks from release. AD-2 already insulates the project (framework is seed behind the rendering-boundary rule), which is the correct design response — it just is not written next to the pin.

### F-7 — yaml 2.x is correct; a 3.0 is in flight [LOW]

`yaml` `latest` = **2.9.0** (2026-05-11). 2.x is the current stable line — **claim correct**. A `next` tag carries `3.0.0-1` (2026-05-02, following `3.0.0-0` in February). No action needed; recorded so the pin's shelf life is visible.

### F-8 — `node:util` parseArgs: CONFIRMED STABLE [VERIFIED — no action]

**Claim:** built-in `parseArgs` used instead of a CLI dependency.

**Confirmed on both pinned versions.** The Node v24 `util` docs version history states verbatim:

> **v20.0.0** — The API is no longer experimental.

Added in v18.3.0/v16.17.0; `tokens` detailed-parse since v18.7.0; default values since v18.11.0; negative-option support since v22.4.0/v20.16.0. Stable on Node 22 and Node 24 alike — the spine's reliance on it is sound, and this is the best-supported decision in the Stack table.

Executed on Node 25.4.0 with `--throw-deprecation` and no warning emitted:

```
parseArgs({args:['--port','3000','./proj'], options:{port:{type:'string'}}, allowPositionals:true})
  -> {"values":{"port":"3000"},"positionals":["./proj"]}
```

One implementation note, below spine altitude: `allowPositionals` defaults to `false`, so `npx bmad-dash [path]` requires it to be set explicitly or the path argument throws.

### F-9 — Preact + esbuild islands in 2026: defensible, but no longer the default [LOW — record the reasoning]

Both projects are healthy and actively released as of August 2026 (Preact 10.29.8 on 2026-08-01; esbuild 0.28.2 on 2026-08-08). The pattern remains documented and in production use — Bridgetown ships islands over esbuild bundling, and `preact-island-plugins` exists as an esbuild-specific island toolkit.

**However, ecosystem gravity has moved.** Astro is now the reference islands implementation (Server Islands stable since Astro 5), and Vite is the general-purpose bundler default. Other islands-shaped options in 2026: Fresh (Deno, Preact-based, zero build step), Enhance (HTML-first via web components), Marko (streaming SSR with automatic partial hydration), Qwik (resumability — a different paradigm).

**The spine's choice is defensible on its own terms, and I would keep it.** Astro is a heavier answer to a smaller question: bmad-dash's dependency-minimalism constraint is architectural (NFR-7 install latency on every `npx`), and AD-2 already assigns document rendering to the server in `src/render/` — Astro would fight AD-2 rather than serve it, since it wants to own the document pipeline the spine deliberately keeps in hand.

The finding is that **none of this reasoning is in the spine.** A contributor arriving in 2026 will ask "why not Astro?" and the spine has no answer. One sentence — "framework-free by choice; Astro/Vite would own the document pipeline AD-2 reserves for `src/render/`" — closes it permanently.

---

## Asserted as technical fact, not verified

Flagged per the brief. These are not necessarily wrong; they are unverified.

| Claim | Location | Status |
| --- | --- | --- |
| "markdown-it ... is what VS Code uses, so contributors recognize it" | memlog | **Verified true**, with a caveat: it is the `markdown-language-features` extension, not VS Code core, and it pins `^14.2.0` — so the familiarity argument supports 14, not 15 |
| "git is shelled out to, matching BMAD's own `git_evidence.py`" | memlog | **Not verified** — internal to the BMAD codebase, not web-checkable; I did not inspect the repo |
| "Dependency count is itself a constraint: every dependency is install latency on every `npx` invocation" | spine, Stack | Directionally true but **no measurement cited**. Counter-datum: markdown-it is presented as costing "one dependency," but a clean `npm install --omit=dev markdown-it@15` installs **7 packages / 2.9 MB** (argparse, entities, linkify-it, markdown-it, mdurl, punycode.js, uc.micro). markdown-it@14 installs the same 7 / 2.9 MB. If install latency is genuinely architectural, the spine should count packages, not direct dependencies |
| "marked 12.x" as the compared alternative | memlog | **False** — marked is at 18.0.11 (2026-08-24), six majors newer |
| "Verified via pkgpulse 2026 comparison" | memlog | **Source exists but is inadequate.** pkgpulse.com is a real SEO comparison aggregator, not a primary source. Every version fact traceable to it is wrong or stale (F-2, F-3). The Node line, verified against nodejs.org and endoflife.date, is by contrast accurate — which is the tell: primary sources produced correct facts, the aggregator did not |

## Verified correct — no action

- Node 24 Active LTS status, its 2028-04-30 end date, and Node 22's continued support (F-1)
- Node release-model change: **October 2026** start and "every release becomes LTS" are both accurate per nodejs.org's *Evolving the Node.js Release Schedule*. One precision note — October 2026 begins the six-month **Alpha** phase of Node 27; the first release delivered under the new model is **27.0.0 in April 2027**, entering LTS October 2027. LTS window stays 30 months (36 total). The spine's framing is right; "the model changes in Oct 2026" and "Node 27 is the first release under it" are both true and are easy to hear as contradictory
- `node:util` parseArgs stability on both pinned Node versions (F-8)
- markdown-it's token stream carries sufficient heading information for heading-weight sectioning (F-4)
- `yaml` 2.x as the current stable line (F-7)
- Preact 10.x as the current stable line (F-6)

## Recommended actions, in priority order

1. **Fix or remove the marked rationale (F-3).** It is disproved by three lines of code. Replace with `token.map` source-line-ranges, spec compliance, and the plugin ecosystem.
2. **Move markdown-it to 15.x, or record why 14.x is deliberate (F-2).** 14 is now `v14-legacy`; the API is compatible either way, and 15 drops `@types/markdown-it`.
3. **Bump esbuild to 0.28.x with an exact or `~` pin (F-5).**
4. **Add expiry dates to the Node pin (F-1)** so "24 LTS" does not silently become false on 2026-10-20.
5. **Note Preact 11 RC / Hydration 2.0 beside the Preact pin (F-6)**, and add one sentence on why not Astro/Vite (F-9).
6. **Name `token.tag`/`token.markup` in the Deferred sectioning entry (F-4)** so nobody implements against `token.level`.
7. **Soften the Stack table's "verified current at authoring" header**, or re-verify against primary sources — npm `dist-tags` and vendor changelogs — rather than comparison aggregators.

## Method

- Node: `nodejs.org/en/about/previous-releases`, `nodejs/Release` `schedule.json`, `nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule`, Node v24 `util` API docs
- Packages: live `registry.npmjs.org` queries for `dist-tags`, publish timestamps, `engines` and dependency sets — markdown-it, yaml, preact, esbuild, marked, remark, unified
- markdown-it v15 migration guide; esbuild release notes; `microsoft/vscode` `extensions/markdown-language-features/package.json`
- **Empirical:** installed `markdown-it@15.0.1`, `marked@18.0.11` and executed heading-token, document-sectioning and `parseArgs` probes on Node 25.4.0; measured markdown-it's installed package count and footprint
