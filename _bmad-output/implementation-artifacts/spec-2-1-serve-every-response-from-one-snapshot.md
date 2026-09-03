---
title: 'Serve every response from one snapshot'
type: 'feature'
created: '2026-09-03'
status: 'in-progress'
baseline_commit: 'faa0e27749ad23b71049dcbc990ee4bcf87b20dd'
review_loop_iteration: 0
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

- `src/cli/inventory.ts` — `takeInventory` :663, `Inventory` :279. **Freeze target, one return site.** `skipped` :302 is the array `skipPolicy` pushed into; `entries` is the loop local; each `children.names` is sorted in place. Nothing in `src/` mutates them today, so freezing should surface nothing — if it throws, that is a finding.
- `src/cli/index.ts` — `projectInventory` :385; the supplier `const snapshot = (): InventoryView => projectInventory(pass(reader))` at **:805**; eager fail-fast call :807; `startServer` wiring :814-822. May import everything.
- `src/render/inventory.ts` — `InventoryView` :380 (`complete`, `artifactCount`, `namesLeftOut`, `aliases`, `groups`). Gains the identity; may import domain **types**.
- `src/adapters/http/server.ts` — `inventory: () => InventoryView` :132, called **once per request at :428**; 200 headers :434-437 (`content-type` and `cache-control: no-store` only); `Allow` on 405 :409; `respondText` :445; Host check :403, before method and routing.
- `src/domain/snapshot.ts` — **new**, pure, zero imports.
- `test/render/page.test.ts` — :193 byte-identical across a refresh (bodies only); :225 the adapter serves exactly what render produces; :268 the supplier is called once per load; :297 supplier-throws-is-500.
- `test/architecture.test.ts` — pins `src/cli/inventory.ts`'s importers to `['src/cli/index.ts']`, `src/render/` importing nothing from `src/cli/`, and domain purity.
- Read-only evidence: `node:fs` imported once (`src/adapters/fs/read.ts:87`), `statSync`/`readFileSync`/`readdirSync` only, enforced by "no source under src/, web/ or scripts/ uses the mutating fs surface".

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/snapshot.ts` -- new pure module: branded `SnapshotId` and `digestOf(parts: readonly string[]): SnapshotId`, a deterministic 64-bit FNV-1a over a **length-delimited** join -- length-delimited because a bare join lets `['a','bc']` and `['ab','c']` collide.
- [x] `test/domain/snapshot.test.ts` -- new: determinism, order sensitivity, that delimiter case, and an id for empty input.
- [x] `src/cli/inventory.ts` -- deep-freeze the returned `Inventory` and every array it holds; record in the header that the arrays previously escaped live.
- [x] `src/cli/index.ts` -- compute the identity in `projectInventory` from the view it is building: each row's `path`, `identity.outcome` and `readability.state` in group order, plus `complete`, `artifactCount` and `namesLeftOut`. Digest of what is rendered, so identical views give identical ids.
- [x] `src/render/inventory.ts` -- add `readonly snapshotId: SnapshotId` to `InventoryView`, imported as a domain type.
- [x] `src/adapters/http/server.ts` -- record the identity as a response header on the 200 and `HEAD` paths only; leave `respondText` and the 405 path untouched.
- [x] `test/cli/inventory.test.ts` -- freezing is real: mutating each escaping array throws, and the pass over this repository still completes.
- [x] `test/render/inventory.test.ts` -- the identity crosses the projection: equal for two passes of an unchanged tree, different after a change, present on every view. **Amended after the matrix audit:** the empty-project row was only covered by asserting the `EMPTY_INVENTORY` *fixture* carries a hex id, which shows the field exists rather than that the projection derives one — a markers-only project is where every digest input is empty or zero. A real two-pass test over such a tree was added, plus the negative half (an empty project's identity differs from a non-empty one's, so the empty case is not collapsing to a constant).
- [x] `test/server.test.ts` -- the header carries the supplier's id on 200 and HEAD, and is absent on 403, 404, 405 and 500. **Amended after the matrix audit:** the first matrix row's second clause — bodies byte-identical — was covered only with a *constant* supplier (`page.test.ts:193`), while the identity half was covered only at the projection. Each end was asserted and the join was not, which is the across-seams gap this project's verification standard names. A test using the **real** supplier over a real project now asserts one identity and identical bodies across two loads, and both moving after a change.

**Acceptance Criteria:**
- Given an unchanged project, when two `GET /` requests are served, then both carry the same identity and identical bodies.
- Given a project changed between requests, when the second is served, then it carries a different identity.
- Given a request refused before a snapshot exists, when the response is written, then it carries no identity header.
- Given a returned snapshot, when any caller attempts to mutate it, then the attempt throws.
- Given one response, when it is produced, then the supplier was consulted exactly once for it.

## Spec Change Log

## Design Notes

**Derived, not minted.** Every page load is still a full pass, so a counter or timestamp would differ on every response — 2.1a's cache, keyed on it, would never hit, and that cache is the whole reason AD-3 defers the parse. A digest is equal exactly when the recorded facts are equal.

**Digest the view, and accept that it is conservative.** The inputs are the projected view's own facts, so the id is an identity for *what is rendered* — which is exactly "all content in one response comes from one snapshot". The conservatism to accept: any change anywhere in the project changes the id, so 2.1a's cache invalidates for every artifact when one changes. That is correct, just not minimal, and a finer key is a later optimisation with a real cache-coherence argument behind it.

**FNV-1a, not `node:crypto`.** This is a cache key and a currency marker, not a security boundary. A pure function keeps `src/domain/` importing nothing — the layer's frozen constraint — and avoids adding a built-in for a non-adversarial hash. Collisions are negligible at this scale: 64 bits over even 10^4 distinct snapshots gives a birthday probability near 10^-11.

**A header, not the page.** AD-17 asks that a response *record* the identity. A header does that without disturbing the body, so `page.test.ts:225` and `:193` keep their exact meanings. A visible currency line is FR-47, Story 3.6.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm test` -- expected: the 862 existing tests still pass with zero skips, plus the new ones; raise `DEFAULT_MIN_TESTS` in `scripts/run-tests.ts` to the new total.
- `node --test test/render/page.test.ts` -- expected: :193, :225, :268 and :297 all pass **unchanged**. If any needs editing, that is a design problem, not a test problem — stop and report.
- `node scripts/check-tasks.ts` -- expected: every ticked task names a file the diff touches.

**Manual checks:**
- Build and serve this repository; confirm two successive requests carry the same identity header, then touch a tracked artifact and confirm the next differs.
