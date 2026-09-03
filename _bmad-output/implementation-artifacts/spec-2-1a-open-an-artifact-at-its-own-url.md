---
title: 'Open an artifact at its own URL'
type: 'feature'
created: '2026-09-03'
status: 'in-progress'
baseline_commit: '6c8922cf4e28c45b58a8a94a27723313c5be3bd6'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The tool serves exactly one path. Nothing in the inventory can be linked to, returned to, or opened — a reader who finds something must go to their editor to look at it. AD-18 requires a URL grammar for artifacts and their sections, owned by the server and explicitly *not* deferred, and no document anywhere writes one down.

**Approach:** Give every artifact a readable URL built from the identity that already exists and is already unique — its project-relative path. Resolve a URL by looking that path up in the snapshot's own rows, never by touching the filesystem. Serve the artifact-view shell there. Link the rows that name something openable.

## Boundaries & Constraints

**Always:**
- **Resolution is a set-membership test against the snapshot's rows**, never a filesystem resolution. A path that is not a row is a 404. This is what makes traversal structurally impossible rather than defended against.
- **The URL half of NFR-17 is an encoder, not a sanitizer.** Percent-encoding is a bijection; the filesystem sanitizer refuses rather than repairs, and a lossy transform would let two artifacts share one permalink.
- Every new route inherits the `Host` check, the 405-with-`Allow` gate, and `bmad-snapshot-id` on any response carrying project content.
- The grammar is fixed here for artifacts **and sections**, because the spine lists it as not deferred.

**Ask First:**
- Importing anything from `src/adapters/fs/` into a new module — the HTTP adapter's escape list is asserted as an exact one-entry array, and `segments.ts`'s importer set is exactly `['src/adapters/fs/read.ts']`.
- Adding any file under `web/` — a test asserts it stays the one empty scanned root.
- Changing what `/` serves.

**Never:**
- No content rendering and no markdown parser (Story 2.1b), and no parse cache (2.1c).
- No client-side JavaScript. Links are natively keyboard-operable; the scripted model is the reader stories'.
- **No claim that AD-18 is satisfied in full** — a section URL resolving identically whether a document arrived whole or sharded cannot be tested until sharding exists, so 2.11 asserts that half.
- No deriving section ids: this story fixes the *shape* `/section/<id>`; deriving `<id>` from a document is Story 2.9's.
- No reuse of `sanitizeSegment`'s rules — Windows device names, the leading-dot rule and the byte limits mean nothing to a URL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Artifact opened | `/artifact/<relative path>` naming a row | 200, the artifact shell, `bmad-snapshot-id` present | N/A |
| Unknown path | `/artifact/nope.md` | 404, the existing plain-text body, no identity header | N/A |
| Path needing encoding | A row whose name holds a space, `#`, `?` or `%` | The link the page emits round-trips back to that same row | N/A |
| Dot segments | `/artifact/a/../b` | Normalized per RFC 3986, then looked up; escaping is impossible because the lookup set is the snapshot | 404 if not a row |
| Encoded traversal | `%2e%2e%2f` and `%2f` in the path | Decoded before normalizing, then the same lookup | 404 if not a row |
| Directory artifact | A run folder or sharded document row | Has a URL like any other row | N/A |
| Unidentified artifact | A row the authority could not identify | Resolves and shows the shell saying so; **its inventory row is not a link** | N/A |
| Section shape | `/artifact/<path>/section/<id>` | Parses, resolves to the artifact; no section exists to select yet | N/A |
| Trailing slash | `/artifact/<path>/` | The same resource as without it | N/A |
| Root unchanged | `/` | The inventory, exactly as before | N/A |
| Refused before routing | Foreign `Host`, or `POST` | 403, or 405 with `Allow` — no identity header, no lookup | N/A |

**Combinations with no row, and why.** Crossing URL kind against target state leaves only these. A section on an unknown artifact fails the artifact lookup first, so the unknown-path row covers it. `Host` and method refusals happen before routing, so no target state can reach them — one row covers every URL kind. An empty project has no rows, so every artifact URL is the unknown-path row. And a row whose path needs encoding *and* contains dot segments is not a separate case: decoding precedes normalization, which is stated as the order rather than left to be inferred.

</frozen-after-approval>

## Code Map

- `src/adapters/http/server.ts` — `handleRequest` :408. Order is `Host` :428, method :433, then path. **The path parse at :439 is `request.url?.split('?')[0]`** — no decode, no dot-segment handling, no `#` strip. Route is one equality, `if (path === '/')` :440; 404 fallthrough :489; `respondText` :492 writes only content-type and `cache-control`, deliberately no identity header. The 200 path :464-486 has `inventory()`, `renderPage` and `writeHead` inside one `try`.
- `src/render/inventory.ts` — `ArtifactRow.path` :305 is the **only** path field the render layer has, and it is `entry.relative` verbatim (set at `src/cli/index.ts:412`). `artifactRow` :594 emits it at :597 inside `<code class="artifact-path">`, wrapped by `<li class="artifact-row">` :605. `test/render/inventory.test.ts:1555` pins that markup shape.
- `src/adapters/fs/walk.ts` — `WalkEntry` :161. `relative` is on all three arms, `/`-separated on every platform; `path: CanonicalPath` is on the `present` arm only and **stops at the composition root**. **Uniqueness is by construction**: a `seen` map keyed by resolved real path (:400, :541, :563) makes a second spelling a suppression, not a second entry — header at :144-145. `kind` includes `'directory'`, so directories are first-class rows.
- `src/adapters/fs/segments.ts` — NFR-17's filesystem half, and the thing not to copy: it refuses rather than repairs, `%2e%2e` and `%2f` pass all twelve of its rules untouched, and its importer set is asserted as exactly `['src/adapters/fs/read.ts']`.
- `src/render/html.ts` — `markup` :146 escapes every interpolated value (:40). **It has no URL context**: an `href` built this way is safe as HTML and still wrong as a URL. That is the one real hazard in linking a row.
- `test/architecture.test.ts` — `src/domain/` has zero outgoing imports :98 (globals are invisible to the scan, so `encodeURIComponent` is fine); every domain module carries an exact importer set, and :1061's comment says a new one is expected to; the HTTP adapter's escape list is an exact one-entry array :990; `web/` must stay the only empty scanned root :701.
- Measured on this repository: **59 rows, 2 unidentified** (`_bmad-output/implementation-artifacts`, `_bmad-output/planning-artifacts`) which must not be links, so **57 linked**; row paths unique across the whole view; and none currently needing encoding — so a fixture must supply that case. *(Corrected at the end of implementation: the Code Map said 58 when this spec was written and the count moved to 59 during the story, because this spec file is itself an artifact under a scanned root. That is the stale-measured-figure pattern this project has recorded twice before, in miniature and inside a single story — which is the argument for the recomputing test the standing entry asks for rather than for a number in a comment.)*

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/url.ts` -- new pure module, zero imports: the artifact and section URL grammar. Build a URL from a project-relative path, and parse one back to `{ path, section? }`. Percent-encode per segment; decode, then normalize dot segments per RFC 3986 §5.2.4, in that order. State in the header that this is an **encoder** and why a refusing sanitizer would be wrong here.
- [x] `test/domain/url.test.ts` -- new: round-trip for a path holding a space, `#`, `?`, `%` and a non-ASCII character; `..` and `%2e%2e` both normalized; the section shape parsed; a trailing slash equal to none; and a pinned example URL so the grammar cannot move silently.
- [x] `src/adapters/http/server.ts` -- route `/artifact/...`: parse the URL, look the path up in the view's rows, serve the shell on a hit and the existing 404 on a miss. Keep `Host` and method before routing, and carry `bmad-snapshot-id` on the 200 exactly as `/` does.
- [x] `src/render/artifact.ts` -- new: the artifact-view shell. The global project header (`EXPERIENCE.md:59` requires it on every surface), the artifact's path, and what the inventory row already says about it. No content -- that is 2.1b.
- [x] `src/render/inventory.ts` -- a row that names something openable becomes a link to its URL; a row the authority could not identify stays unlinked, per `EXPERIENCE.md:183`. The accessible name must still carry the row's honest state.
- [x] `test/render/artifact.test.ts` -- new: the shell renders, carries the project header, and states an unidentified artifact honestly.
- [x] `test/render/inventory.test.ts` -- linked rows point at the URL the grammar builds; unidentified rows have no anchor; **the project's first keyboard assertion** -- every linked row is reachable by `Tab` in document order and activatable by `Enter`, which a real anchor gives natively.
- [x] `test/server.test.ts` -- the matrix: a hit, a miss, encoded and dot-segment paths, a directory row, the section shape, a trailing slash, `/` unchanged, and the refusals still refused before any lookup.
- [x] `test/architecture.test.ts` -- an exact importer set for `src/domain/url.ts`, matching the convention every other domain module follows.

**Acceptance Criteria:**
- Given an artifact in the snapshot, when its URL is requested, then the shell is served with the snapshot identity header.
- Given a URL naming no row, when it is requested, then the answer is 404 and no filesystem access occurred.
- Given a row whose path needs encoding, when the page links it, then following that link resolves to the same row.
- Given a URL containing `..` in any encoding, when it is resolved, then it either names a row in the snapshot or 404s — it can never name anything outside.
- Given the inventory page, when a reader tabs through it, then every linked row takes focus in document order and opens with `Enter`.
- Given an unidentified artifact, when the inventory renders it, then it has a row and no link.

## Spec Change Log

## Design Notes

**Why the relative path is the identity.** The spine's convention says an artifact is keyed by its resolved absolute path and that *slugs are never identities*. The resolved path cannot reach the render layer — an asserted importer set stops it at the composition root — but the relative path is its faithful proxy: the walk keys its `seen` map on the resolved real path, so two spellings never both become rows. `relative` is unique by construction, not by convention.

**The evidence behind "encoder, not sanitizer".** Two reviews recorded that lossy sanitization collapses `spec-my/thing`, `spec-my thing` and `spec-my-thing` into one string. In a URL that means one permalink addressing two artifacts. Percent-encoding cannot do that, and it is the reason this half of NFR-17 takes the opposite policy from the half already built.

**Sections now, ids later.** The spine fixes the artifact *and section* grammar here and defers only non-document route shapes. Deriving `<id>` from a document is Story 2.9's; 2.11 asserts the division-independence this story cannot test.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm test` -- expected: the 891 tests at the baseline still pass with zero skips, plus the new ones; raise `DEFAULT_MIN_TESTS`.
- `node scripts/check-tasks.ts` -- expected: every ticked task names a file the diff touches.
- **Mechanism check:** make the resolver consult the filesystem instead of the row set, and confirm a test fails. If none does, confinement is unenforced and the story is not done.

**Manual checks:**
- Serve this repository, follow a row's link, and confirm the URL survives a reload and the browser back button. Then request `/artifact/../../etc/passwd` in every encoding and confirm a 404 with no read attempted.
