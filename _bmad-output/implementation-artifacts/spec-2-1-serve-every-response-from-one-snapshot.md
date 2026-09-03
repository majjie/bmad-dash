---
title: 'Serve every response from one snapshot'
type: 'feature'
created: '2026-09-03'
status: 'done'
review_loop_iteration: 1
baseline_commit: 'faa0e27749ad23b71049dcbc990ee4bcf87b20dd'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing identifies which scan a page came from. AD-17 has **zero code presence** — no field on `InventoryView`, no header on any response — so two pages cannot be told apart and Story 2.1a has nothing to key a rendering cache on. AD-3 calls the snapshot *immutable*; measured, it is immutable by type only: `Object.isFrozen(inventory)` is `false`, and `skipped` is handed out as the same array the skip policy pushed into.

**Approach:** Give one scan one identity, computed from the facts that scan recorded, so two passes over an unchanged project agree and any change disagrees. Freeze the snapshot by construction. Record the identity on every response carrying project content, and exempt the refusals that happen before a snapshot exists — by stated reason, not by omission.

## Boundaries & Constraints

**Always:**
- **The per-request scan stays.** A page load remains the refresh. Real refresh is FR-37/FR-47 (Epic 3), so holding a snapshot would leave the tool stale for the process's life — a regression, not an improvement.
- **The identity is a function of recorded facts only** — never a clock, counter, request id or random value. That is what lets 2.1a's cache hit on an unchanged project; a minted id would miss every time.
- `src/domain/` keeps zero outgoing imports: the digest is pure, and the `Inventory`-shaped projection into its inputs stays where `projectInventory` already lives.
- Freezing is **deep**, covering the arrays that currently escape live.

**Ask First:**
- Introducing `node:crypto` or any Node built-in not already imported.
- Editing `test/architecture.test.ts`'s single-importer assertion on `src/cli/inventory.ts` ("a second importer is a second snapshot").
- Putting the identity in the page body rather than a response header.

**Never:**
- No refresh mechanism, no filesystem watching, no in-place replacement (Story 3.6).
- No currency probe, no changed-since-scan comparison (AD-11, Story 2.2).
- No timestamps — nothing in the tool handles time yet (FR-67, Story 3.10).
- No rendering representation in the pass. **No holding a snapshot between requests** — 2.1a will cache *parses* keyed by this identity, which is a different thing from reusing the snapshot itself.
- No bounded prefix read: AD-3's bounded-work limit is deferred by decision and now stated in the spine.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Unchanged project, two loads | Nothing on disk changes | Same identity both times; bodies byte-identical | N/A |
| Changed project, two loads | Artifact added, removed or edited between | Different identity | N/A |
| Empty project | Markers only, no artifacts | Identity exists and is stable across loads | N/A |
| Unreadable root | Root at mode `0o111` | Snapshot and identity still exist; page still reports the scan did not finish | Typed, not thrown |
| `HEAD /` | Same request, no body | Same identity as `GET`; no body | N/A |
| Foreign `Host` | Mismatches bound address | 403, **no identity** — refused before a snapshot exists | N/A |
| Write-shaped method | `POST /` | 405 with `Allow`, **no identity** — same reason | N/A |
| Unknown path | `GET /nope` | 404, **no identity** — same reason | N/A |
| Supplier or render throws | Pass raises | 500, **no identity** — no snapshot was produced | To `onError` once |
| Snapshot mutated | Caller writes to a returned array | Throws | Frozen by construction |

**Combinations with no row, and why.** Crossing response kind against project state leaves only these, and none can vary: the four no-identity responses (403/405/404/500) never consult a snapshot, so project state cannot reach them and one row each covers every state. The `503` unbound guard is documented-unreachable and exempt for 403's reason. Straddling two snapshots in one response is impossible here — the path is synchronous from supplier to `response.end` with no `await` — so it gets no row; it is a property to keep, asserted below, not an input to vary.

</frozen-after-approval>

## Code Map

- `src/cli/inventory.ts` — `takeInventory` :663, `Inventory` :279. **Freeze target, one return site.** `skipped` :302 is the array `skipPolicy` pushed into; `entries` is the loop local; each `children.names` is sorted in place. Nothing in `src/` mutates them today, so freezing should surface nothing — if it throws, that is a finding. Note two values the recursion reaches are **shared module singletons**: `UNREAD` and `LISTING_NOT_TEXT` from `src/domain/signal.ts`, returned for every unread entry. They are already frozen at their definition, which is why freezing the graph is safe — not because nothing is shared.
- `src/cli/index.ts` — `projectInventory` :385; the supplier `const snapshot = (): InventoryView => projectInventory(pass(reader))` at **:805**; eager fail-fast call :807; `startServer` wiring :814-822. May import everything.
- `src/render/inventory.ts` — `InventoryView` :380 (`complete`, `artifactCount`, `namesLeftOut`, `aliases`, `groups`). Gains the identity; may import domain **types**. **The page is a pure function of this view** plus the project root, and these are the fields that render: `readability.stage` :586, `identityNotes` :592 — which exposes an ambiguous verdict's `readings` — `interpretationNote` :593, `runFactNotes` :594, `group.notes` :660 and :667, `group.family` :765, and `aliases` through `ALIAS_REPORT` :708.
- `src/adapters/http/server.ts` — `inventory: () => InventoryView` :132, called **once per request at :428**; 200 headers :434-437 (`content-type` and `cache-control: no-store` only); `Allow` on 405 :409; `respondText` :445; Host check :403, before method and routing. `writeHead` sits **outside** the surrounding `try`.
- `src/domain/snapshot.ts` — **new**, pure, zero imports.
- `test/render/page.test.ts` — :193 byte-identical across a refresh (bodies only); :225 the adapter serves exactly what render produces; :268 the supplier is called once per load; :297 supplier-throws-is-500.
- `test/architecture.test.ts` — pins `src/cli/inventory.ts`'s importers to `['src/cli/index.ts']`, `src/render/` importing nothing from `src/cli/`, and domain purity.
- Read-only evidence: `node:fs` imported once (`src/adapters/fs/read.ts:87`), `statSync`/`readFileSync`/`readdirSync` only, enforced by "no source under src/, web/ or scripts/ uses the mutating fs surface".

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/snapshot.ts` -- new pure module: branded `SnapshotId`, and a **structural** digest over a deterministic 64-bit FNV-1a that walks a value canonically -- object keys sorted, arrays in order, each primitive tagged by type so `1`, `'1'` and `true` cannot coincide, every string length-delimited so `['a','bc']` and `['ab','c']` cannot collide. It must **throw** on a value it cannot walk deterministically (a `Map`, `Set`, `Date`, function or symbol) rather than digest it as `{}`.
- [x] `test/domain/snapshot.test.ts` -- new: determinism, order sensitivity, the length-delimiting collision case, primitive-type tagging, key-order independence for objects, the refusal for an unwalkable value, and **one pinned input-to-digest vector** so a refactor of the mixing cannot silently move every id.
- [x] `src/cli/inventory.ts` -- deep-freeze the returned `Inventory` and every array it holds, iterating `Reflect.ownKeys` and skipping accessor properties rather than invoking them. State in the doc that `Object.freeze` does not cover a `Map` or `Set`, and that the shared `UNREAD`/`LISTING_NOT_TEXT` singletons are reached and are already frozen at their definition.
- [x] `src/cli/index.ts` -- compute the identity by digesting **the whole view** just built, every field except the identity itself. Do not enumerate a subset: the page is a pure function of the view, so digesting all of it is what makes "anything that changes what is rendered changes the id" true by construction rather than by a judgement about which fields render.
- [x] `src/render/inventory.ts` -- add `readonly snapshotId: SnapshotId` to `InventoryView`, imported as a domain type.
- [x] `src/adapters/http/server.ts` -- record the identity as the response header **`bmad-snapshot-id`** (that exact name, decided 2026-09-03 -- see Design Notes) on the 200 and `HEAD` path; leave `respondText` and the 405 path untouched. Bring `writeHead` inside the surrounding `try` so a malformed view cannot throw past the handler and leave the request hanging. Give the 500 case its real reason: a `renderPage` throw means the supplier already succeeded, so a snapshot did exist -- the header is omitted because no body was produced from it, not because no snapshot was.
- [x] `test/cli/inventory.test.ts` -- freezing is real: mutating each escaping array throws `TypeError` (assert the error type, not merely that something threw), and the pass over this repository still completes **with `projectInventory` and `renderPage` run over the frozen value**, since an in-place sort would throw in a consumer rather than in `takeInventory`.
- [x] `test/render/inventory.test.ts` -- the identity crosses the projection. Beyond equal-for-unchanged and different-after-a-change: **a matrix of view pairs whose rows are identical but which render differently** -- an added alias, a different `readability.stage`, an ambiguous verdict's second reading, a changed run fact, a different group note -- each asserting that a rendering difference implies an identity difference. That property is what pins the digest's coverage; without it the whole digest reduces to `artifactCount` with the suite green.
- [x] `test/server.test.ts` -- the header carries the supplier's id on 200 and HEAD, and is absent on 403, 404, 405 and 500.
- [x] `test/architecture.test.ts` -- **added in review round 2, not by the original task list:** an exact importer set for `src/domain/snapshot.ts`, plus a `namedImportsIn` assertion that the render layer takes only the `SnapshotId` *type*. Every other module in the pure layer carries one, and a new module arriving without makes that table silently non-exhaustive -- a reader cannot tell "deliberately unconstrained" from "nobody added it". Mutation-checked: importing `digestOf` into the render layer fails it. **Assert the status code on every response the test compares**, including the third in any changed-project sequence: without it a regression to 500 satisfies a `notEqual` on the header vacuously. Merge the two `import ... from '../src/cli/index.ts'` statements into one.

**Acceptance Criteria:**
- Given an unchanged project, when two `GET /` requests are served, then both carry the same identity and identical bodies.
- Given a project changed between requests, when the second is served, then it carries a different identity.
- Given two views that render differently, when their identities are compared, then they differ — for every field the view carries, not only the row set.
- Given a request refused before a snapshot exists, when the response is written, then it carries no identity header.
- Given a returned snapshot, when any caller attempts to mutate it, then the attempt throws.
- Given one response, when it is produced, then the supplier was consulted exactly once for it.

## Spec Change Log

**2026-09-03 — iteration 1, `bad_spec` (high).**

*Triggering finding.* All three review layers independently reported that the identity omits facts the page renders, and the verification-gap layer supplied the mechanism check: reducing the entire digest body to `parts.push(String(artifactCount))` left **875/875 tests green**. Reproduced directly before acting on it. Every "must differ" test changed the row set by adding a file, so `artifactCount` moved and the three per-row inputs were never observed at all.

*Root cause, and it was in this spec rather than in the code.* The previous Tasks line prescribed the exact input set — "each row's `path`, `identity.outcome` and `readability.state` in group order, plus `complete`, `artifactCount` and `namesLeftOut`" — and the previous Design Notes justified it with a claim that is false: that an ambiguous verdict's second reading, run facts and aliases "never reach the page". All three render, as do `readability.stage`, `interpretationNote`, `group.notes` and `group.family`. The implementation followed the spec faithfully; the spec was wrong.

*What was amended.* The digest is now **structural over the whole view** rather than an enumerated subset, which makes the documented property true by construction: the page is a pure function of the view, so digesting all of the view means any rendering difference implies an identity difference. A new acceptance criterion and a test matrix of same-rows-different-render pairs pin exactly that. The false justification is removed rather than softened.

*Known-bad state avoided.* A response asserting one snapshot identity for two materially different pages — the exact claim AD-17 asks the header to make — and Story 2.1a's parse cache, which this id is the key for, serving a stale parse whenever a change lands in an alias, an interpretation state, a run fact or an identity detail.

*KEEP — what worked and must survive re-derivation.*
1. `digestOf`'s **length-delimiting**, and its honest framing as a bespoke FNV-1a variant that consumes UTF-16 code units rather than bytes and is not interoperable with other implementations. Keep the collision-case tests. Fix only the stated collision probability: at n = 10^4 over 64 bits it is about 2.7 x 10^-12, not "near 10^-11".
2. The **branded `SnapshotId`** with the digest as its only constructor, on `CanonicalPath`'s reasoning.
3. `deepFreeze` applied at `takeInventory`'s **one return site**, with its cycle guard, and the freeze test that proves the freeze reaches *the same array* `skipPolicy` pushed into rather than a copy.
4. The header **presence/absence matrix** over 200/HEAD/403/404/405/500, and leaving `respondText` and the 405 path untouched.
5. `page.test.ts` untouched — all four of its named rows keep their exact meanings, and `:268` is what covers the supplier being consulted once per response.
6. Extracting `complete`, `artifactCount` and `namesLeftOut` into locals before the return, which made the projection readable; keep that shape even though the digest no longer takes them individually.
7. The two fixtures (`EMPTY_INVENTORY`, `FULL_INVENTORY_VIEW`) carrying a fixed arbitrary id, with the comment explaining that the real derivation is asserted over a live pass instead.

## Design Notes

**Derived, not minted.** Every page load is still a full pass, so a counter or timestamp would differ on every response — 2.1a's cache, keyed on it, would never hit, and that cache is the whole reason AD-3 defers the parse. A digest is equal exactly when the recorded facts are equal.

**Digest the whole view, not a chosen subset.** The page is a pure function of the view, so digesting every field the view carries makes "anything that changes what is rendered changes the id" true by construction. Iteration 1 of this spec enumerated three per-row fields plus three scalars and argued the rest never render; that was wrong on six counts and unenforced by any test. An enumeration also has to be re-audited whenever the view gains a field, and nothing would fail if that audit were skipped. A structural walk carries no such obligation.

The conservatism to accept is unchanged: any change anywhere in the project changes the id, so 2.1a's cache invalidates wholesale. Correct, not minimal; a finer key is a later optimisation needing its own cache-coherence argument.

**Refuse what cannot be walked deterministically.** A `Map`, `Set`, `Date`, function or symbol has no canonical form here, and digesting one as `{}` would silently drop it — reintroducing the same hole through the structural walk. Throwing is loud, and the view contains none of them today.

**FNV-1a, not `node:crypto`.** This is a cache key and a currency marker, not a security boundary. A pure function keeps `src/domain/` importing nothing — the layer's frozen constraint — and avoids adding a built-in for a non-adversarial hash.

**A header, not the page.** AD-17 asks that a response *record* the identity. A header does that without disturbing the body, so `page.test.ts:225` and `:193` keep their exact meanings. A visible currency line is FR-47, Story 3.6.

**`bmad-snapshot-id`, and specifically not `ETag`.** Decided 2026-09-03 after review raised `ETag` as the standard header for a content-derived opaque identity. It is the wrong header here, for a reason that bites in the very next story: **an `ETag` validates a *representation*; this identity names a *scan*.** Story 2.1a introduces many representations per snapshot — AD-18's grammar covers artifacts *and their sections* — so one scan will serve `/`, an artifact's URL and each section's URL. Under `ETag` semantics those must carry different values; under AD-17 they must report the same one. Different cardinality, so one header cannot be both. The `cache-control: no-store` already on every response reinforces it: a client may not store the representation, so it can never revalidate from a stored copy and the `304` benefit is unreachable regardless.

The name drops the `X-` prefix, which RFC 6648 deprecates for new headers, and names the BMAD family rather than this one package. `ETag` stays available for a later caching story as a genuinely per-representation validator derived from the rendered document rather than from the view — recorded in `deferred-work.md` with this reasoning so it is not re-litigated from scratch.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm test` -- expected: the 862 tests at the baseline still pass with zero skips, plus the new ones; raise `DEFAULT_MIN_TESTS` in `scripts/run-tests.ts` to the new total.
- `node --test test/render/page.test.ts` -- expected: :193, :225, :268 and :297 all pass **unchanged**. If any needs editing, that is a design problem, not a test problem — stop and report.
- `node scripts/check-tasks.ts` -- expected: every ticked task names a file the diff touches.
- **The mechanism check that caught iteration 1:** replace the digest's input with `artifactCount` alone and confirm the suite **fails**. If it passes, the digest's coverage is still unenforced and the story is not done.

**Manual checks:**
- Build and serve this repository; confirm two successive requests carry the same identity header, then touch a tracked artifact and confirm the next differs.

## Suggested Review Order

**The identity itself — start here**

- The whole design in two lines: digest the root *and* the view, never mint.
  [`index.ts:523`](../../src/cli/index.ts#L523)

- Why derived and not minted, and why FNV-1a over `node:crypto`.
  [`snapshot.ts:344`](../../src/domain/snapshot.ts#L344)

- `Omit` rather than a second interface, so a new view field is covered with no audit to forget.
  [`index.ts:485`](../../src/cli/index.ts#L485)

- Branded, with the digest as its only constructor — `CanonicalPath`'s reasoning.
  [`snapshot.ts:333`](../../src/domain/snapshot.ts#L333)

**Refusing what has no canonical form — the round-2 fixes**

- Arrays now require `Array.prototype` exactly; a subclass is refused, not silently flattened.
  [`snapshot.ts:163`](../../src/domain/snapshot.ts#L163)

- Own keys must be precisely the indices: closes the extra-property and sparse-hole collisions.
  [`snapshot.ts:231`](../../src/domain/snapshot.ts#L231)

- Reads only the prototype's own data descriptor, so the refusal path invokes no accessor.
  [`snapshot.ts:186`](../../src/domain/snapshot.ts#L186)

**The wire contract**

- The name, and the argued case against `ETag` — a scan is not a representation.
  [`server.ts:90`](../../src/adapters/http/server.ts#L90)

- Inside the `try` now, so a malformed identity cannot throw past the handler.
  [`server.ts:468`](../../src/adapters/http/server.ts#L468)

- The field the surface carries but may never derive.
  [`inventory.ts:418`](../../src/render/inventory.ts#L418)

**AD-3's "immutable", made real**

- Descriptor-based walk: accessors skipped rather than invoked, `Map` and `Set` refused.
  [`inventory.ts:708`](../../src/cli/inventory.ts#L708)

- One return site, applied to a graph nothing touches again.
  [`inventory.ts:812`](../../src/cli/inventory.ts#L812)

**The tests that would have caught the two loopback defects**

- The matrix: pairs equal under iteration 1's inputs that render differently — "or it proves nothing".
  [`inventory.test.ts:828`](../../test/render/inventory.test.ts#L828)

- One identity and byte-identical bodies over the real supplier — the join neither end covered.
  [`server.test.ts:506`](../../test/server.test.ts#L506)

- Presence and absence across 200, HEAD and all four refusals, with statuses asserted.
  [`server.test.ts:562`](../../test/server.test.ts#L562)

**Supporting tests**

- The refusal set, including the branches a comment had promised and nothing reached.
  [`snapshot.test.ts:185`](../../test/domain/snapshot.test.ts#L185)

- Pinned vectors, so a rewrite of the mixing cannot silently re-key every snapshot.
  [`snapshot.test.ts:249`](../../test/domain/snapshot.test.ts#L249)

- The freeze reaches the same array the skip policy pushed into, not a copy.
  [`inventory.test.ts:1816`](../../test/cli/inventory.test.ts#L1816)

- Added in review, not by the task list: the pure layer's importer set stays exhaustive.
  [`architecture.test.ts:1061`](../../test/architecture.test.ts#L1061)

