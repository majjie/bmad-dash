# Epic 1 Context: Point it at a project and see what's there

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

bmad-dash is a read-only CLI (run via `npx`) serving a local web dashboard over a BMAD project's markdown and YAML artifacts, for human oversight of AI-generated work. Epic 1 reaches the starting point: one command inside any BMAD project serves a page listing every artifact found and what the tool made of each — identified, or shown as unidentified, present-but-uninterpreted, unreadable, or ambiguous, with paths displayed — plus an honest terminal failure when there is no project. It also lays what every later epic inherits: the hexagonal skeleton, the read-only invariant and its enforcing test, the token layer, the shared tile and focus treatments, and the global project header. The repo doubles as a BMAD project, so the tool can be run on its own tree.

**Where the code stands.** Story 1.1 is complete and committed — CLI entry, HTTP adapter, an `fs` realpath adapter, and the test harness under `scripts/`. 114 tests pass with zero runtime dependencies; `npm test` typechecks, then runs a recursive discovery pass behind a minimum-count guard so tests cannot silently stop being found. The realpath adapter exists solely because AD-1 confines `node:fs` to `src/adapters/fs/` and the entry guard needs `realpathSync` — it is the pattern for every later filesystem need, not a special case. The served page is currently a constant HTML string inside the HTTP adapter: Story 1.2 replaces its styling with a real token-driven stylesheet, and Story 1.3 adds the shared components and global chrome.

## Stories

- Story 1.1: Run the command and reach a served page
- Story 1.2: Establish the visual foundation
- Story 1.3: Build the components every surface reuses
- Story 1.4: Open the browser, but never depend on it
- Story 1.5: Resolve where the project is
- Story 1.6: Fail with the command that would have worked
- Story 1.7: Identify what each artifact is
- Story 1.8: Handle whole and sharded documents alike
- Story 1.9: Show what could not be read or recognized
- Story 1.10: Get BMAD's own irregularities right
- Story 1.11: Locate sprint tracking safely
- Story 1.12: See the project inventory

## Requirements & Constraints

**Read-only, containment.** Never write, move, delete or modify anything in the target project — enforced structurally and verified by test, including through subprocesses, which an import check alone cannot see. Nothing is persisted anywhere; no config file, no memory of previous runs. Every content-derived path segment is sanitized and confinement-checked on every read, on both filesystem and URL surfaces, including paths resolved during composition.

**Invocation and serving.** One command, optional target path, defaulting to the working directory. Runs via `npx` with no install, no configuration in the target project, no dependency added to it; the package ships compiled server output and prebuilt client assets so `npx` never builds. Auto-selected port, URL on stdout, bound to the literal `127.0.0.1` and nothing else. Requests are rejected unless the `Host` header matches the bound address and port; write-shaped HTTP methods are then refused with 405 and an `Allow` header, so the read-only posture is stated at the protocol level rather than only in prose. No telemetry or outbound network of any kind. Linux, macOS, Windows; usable where no browser can launch. Diagnostics to stderr, stdout carries only URL and progress.

**Locating the project.** The root is the target path itself, recognized by `_bmad` and `_bmad-output` being present — no walking in either direction, so nested or sibling roots are unresolvable rather than resolved by rule. Artifact roots come from the project's own BMAD configuration, never assumed paths. A non-project target neither serves nor launches: it exits naming the path examined and what was looked for, and hands over the exact invocations that would work, found by a bounded scan (full ancestor chain plus two levels below, skipping dot-directories and `node_modules`). That scan exists only to build the message and must never become a resolution path.

**Identifying artifacts.** Four-level precedence, in order, stopping at the first that resolves: config-declared location, frontmatter type or title, structural signature, filename hint. Filename alone is never sufficient — names legitimately vary (`prd.md`, `bmm-prd.md`, `product-requirements.md`). Unresolved means presented as unidentified, naming the levels tried. Seven run-folder families: briefs, PRDs, architecture, UX designs, research, specs, forge.

**Degrading honestly.** Unrecognized shape → present-but-uninterpreted; found but unparseable, including undecodable-as-text → unreadable. Each names what failed and at which stage. Never omitted, never aborts the pass; one bad artifact leaves every other artifact rendering. A parser over a source BMAD defines by convention rather than contract must validate it extracted something and fail visibly, never return empty as success. Other BMAD versions degrade to present-but-uninterpreted.

**BMAD's measured irregularities** — much of this epic is reading these correctly:

- Four of seven run-folder patterns are `{family}-{project}-{date}`, constant within a day, so same-day reruns land in the same folder. One folder is not one run.
- `spec-{slug}` and `{slug}` carry no date, and a spec folder is deliberately reopened under the same slug; those families get no folder-name ordering signal.
- Run folder versus sharded document is not reliably distinguishable — BMAD's own discovery asks a human, so guessing is not available. Present the ambiguity.
- A document is either one file or a directory with `index.md`; both normal, handled equivalently.
- `{slug}` means something different in each position (reviewer/lens, reconciled input, spec subject, research topic), is reused deliberately, and nothing in BMAD sanitizes it. Slugs are names, never identities.
- Review outputs land either at a workspace root or in a `reviews/` subfolder; find both.
- `story_location` lives in `sprint-status.yaml`, is per-project, may be relative or absolute, and may point outside the project (`/custom/stories` is a tested value). Resolve it, report out-of-tree, never read or serve from there. Absence of `sprint-status.yaml` is a normal shape that renders fully.

## Technical Decisions

**Language: TypeScript, compiled.** Sources are `.ts`; esbuild emits `dist/`, and the package ships that compiled output so `npx` never builds. TypeScript, esbuild and `@types/node` are devDependencies. The runtime dependency count is zero, and that is an architectural constraint rather than a preference — every dependency is install latency on every `npx` invocation, package size, and supply-chain surface for a tool whose promise is that it does not touch your project. `tsconfig.json` sets `erasableSyntaxOnly`: no enums, no namespaces, no parameter properties, no decorators, so every source file stays natively strippable and the build step can be deleted rather than refactored once Node 22 goes EOL and the floor can rise to a type-stripping runtime.

**Hexagonal, enforced by directory.** `src/domain/` (model, identification, normalization, ordering, sectioning — pure, no outgoing dependency, ever); `src/ports/` (domain types only); `src/adapters/{fs,git,browser,http}/`; `src/render/` (server-side HTML from domain types only); `src/cli/` (composition root, imports everything); `web/` (imports nothing from `src/`) built by esbuild into `public/`.

- Only `src/adapters/fs/` may import `node:fs`; only the git and browser adapters may import `node:child_process`. The assertion reads the `.ts` sources rather than compiled output, because the constraint lives in the source a contributor edits. Adapters expose read or launch operations only — no create, write, move, delete or permission call in any adapter surface.
- Identity is decided once, in one domain module, during the scan; every other unit consumes the recorded verdict and never re-derives it. Ambiguity is recorded as ambiguous.
- Root and artifact roots resolve once in the composition root and pass onward; no other unit discovers anything. Permitted roots are a **set**, admission-checked: any content-derived value that would become a root passes the sanitizer and an explicit admission check first.
- One canonical internal path representation, produced at the fs adapter and converted back to platform form on the way out. Domain does no path manipulation and no path string comparison; case-insensitive filesystems handled at the adapter. Symlinks resolved before confinement is checked and before identity is keyed; cycles detected, not followed; a dangling link reported, not fatal. An artifact is keyed by its resolved absolute path.
- Expected conditions return typed results; the domain does not throw for them, and adapters translate I/O failure into the same typed results.
- Signal availability is recorded per artifact and per signal as exactly one of **present, absent, unreadable, unchecked** — one vocabulary for model, UI and coverage. Collapsing any pair is a defect.
- Artifact **family** has one axis: the producing BMAD workflow. Document type within a family is a separate attribute, never called a family.
- Ephemeral single process. The server binds and reports its URL before any launch attempt; launch failure is reported and ignored, and serving is never conditional on a browser.
- Server renders document content; the client only enhances delivered markup, and no client router owns a document URL.
- Domain types name BMAD concepts as BMAD does (`RunFolder`, `Memlog`, `SprintStatus`, `Artifact`); adapters are named for what they adapt.
- Stack seed: Node 24 (floor 22), TypeScript 5.x and esbuild 0.28.x as devDependencies, `node:http`, `node:util` `parseArgs`, git as a subprocess. markdown-it 15.x, yaml 2.x and Preact 10.x are seeded for later epics; adding a runtime dependency is an architectural decision, not a convenience. Preact 11 is at RC with a reworked hydration path aimed at exactly this server-rendered-plus-islands seam — evaluate before the client layer is built, not after.
- Left to the code: test framework and runner, route shapes for non-document endpoints, styling approach and component structure inside `web/`, snapshot in-memory representation.

## UX & Interaction Patterns

Dark-only, dashboard-dense — an instrument, not a destination, optimized for the speed at which a fact can be located and trusted.

**Story 1.2 is the token layer, and DESIGN.md's frontmatter is its contract.** Precedence is fixed and must be encoded in how the layer is built: frontmatter tokens are normative over DESIGN.md prose (where they disagree, the token wins), and both spines beat any mockup, so a mockup is never the source of a value. Every colour, type, spacing, radius and motion value resolves through a token; no hex, px or rem literal is permitted in any component.

The roles the layer must define:

- **Colour** — a graphite page ground (not black: pure black under near-white text halates); a five-step `surface-container` ladder supplying every level of lift; three on-surface text roles, the faintest reserved for one purpose only (an absent core artifact) and never combined with reduced opacity, which would drop it below conformance; `outline` and `outline-variant` for structural borders; a `primary` accent with its container and on-colours; and **four signal colours with paired containers** mapping one-to-one onto present / absent / unreadable / unchecked. That set is closed and unranked — never reuse a signal colour as a severity level. Signal colour stays separate from `primary`, so the accent never encodes state and state never borrows the accent. `primary` appears sparingly: at most one control or heading per tile, repeating data columns (the per-row evidence badge) exempt because there the accent is a value rather than emphasis.
- **Typography** — three families across eight roles, from one superfamily so metrics agree. IBM Plex Sans carries the interface (`display`, `title`, `tile-label`, `body`, `body-dense`); IBM Plex Mono carries `mono` and `mono-badge`; IBM Plex Serif carries `prose` and appears in exactly one place, the body of a rendered BMAD document. **Mono is applied semantically, not decoratively:** if a string came from the filesystem or names a machine state — paths, timestamps, artifact IDs, evidence badges, signal pills — it is monospaced, so a reader can separate tool language from project data at a glance.
- **Elevation** — tonal only, three levels at rest (ground, standard tile, one raised level for the tile carrying primary attention plus popovers). Two ladder steps are held back for hover and a future third level. No shadow, no gradient, no blur anywhere; a tile's tone is its edge.
- **Spacing, radius, motion** — a 4px base scale with named tile padding, tile gap, row padding, page margin and reading measure; four radii on the rule that the larger the surface the larger the radius, pills fully round; and a motion set whose only v1 animation is refresh progress.
- **Component tokens** — tile, tile-raised, activity row, evidence badge, signal pill, the two button weights, core artifact card, refresh progress, focus ring.

**The two type floors.** Content text never goes below `body-dense`; labels and badges are a separate class with an 11px floor. `mono-badge` sits at that floor rather than below it because its text is the redundant channel keeping signal state legible without colour. Density comes from compressed vertical rhythm, never from shrinking type — which is also what makes 200% text resize survivable.

Also binding across the epic:

- Focus ring 2px at 2px offset on every focusable element without exception, plus a 1px inner stroke on `primary`-filled elements where the ring would otherwise vanish against its own fill. Containers reserve the offset inside their padding; a ring clipped by a tile edge is a defect, not a cosmetic issue. Focus transitions are instant — a delayed focus ring is worse than none — and `prefers-reduced-motion` is honoured from the outset so nothing retrofits it later.
- Components in this epic: `tile` (uppercase label, one kind of information, renders meaningfully when its data is empty or unavailable and says which), `tile-raised` (one step up the ladder, at most one per surface), and the **global project header**, which is chrome on every served surface rather than a dashboard tile, carrying project name, resolved root path, git availability, snapshot currency, the refresh control, and refresh progress and failure.
- Tiles are static — nothing drags, resizes or dismisses, because remembering an arrangement would need persistence the architecture forbids. Tile layout is a developer extension point: a new capability adds a tile.
- Keyboard model and focus-visible treatment are defined once in `web/` and shared; no surface implements its own, and single-letter keys are inert while a text input has focus. Landmarks banner / navigation / main, one `h1` per surface, tile labels as real headings so the dashboard is traversable by structure.
- Nothing depends on colour alone — under simulated protanopia three of the four signal colours converge, so the state word is load-bearing, not decorative. One breakpoint at 900px collapses the tile grid to a single column in reading order.
- Every surface's first paint is server-rendered content: no skeleton, no spinner-then-populate. Every surface must be fully meaningful on first load with zero prior state.
- There is deliberately **no** no-project surface; that failure is reported in the terminal.
- Voice is terse and technical: state facts, do not apologise, name the limit not the feeling, never claim more than the data supports. Strings from the load-bearing index are implemented verbatim — for this epic, `Not identified. Tried: config path, frontmatter, structure, filename.`, `Could be a run folder or a sharded document`, `This folder may contain more than one run.`, `Story location points outside the project: <path>. Not read.`, `A BMAD project, with no artifacts yet.`, `Empty file.`, `Not found`. Sentence-shaped strings take a period, label-shaped ones do not, badge labels take an initial capital, and substituted values appear as `<placeholder>`.

## Cross-Story Dependencies

- 1.1 is done: it carries the skeleton and the import-assertion test, and every later story is written into it.
- 1.2 (tokens) → 1.3 (shared components, chrome) → 1.12 (the inventory page, the epic's only user-visible surface). 1.2 restyles the HTTP adapter's existing constant page rather than introducing a new surface.
- 1.5 resolves root and artifact roots once; 1.7, 1.8, 1.10 and 1.11 consume that rather than discovering anything. 1.11 extends 1.5's permitted-root set with a sanitized, admission-checked `story_location`.
- 1.6 depends on 1.5's recognition rule, but its scan stays CLI-local and contributes nothing the domain consumes.
- 1.7's single identification module is consumed by 1.8, 1.10 and 1.12; 1.9's degradation vocabulary must exist before 1.12 renders it.
- 1.4 depends only on 1.1 binding and reporting first.
- Epic 1 needs nothing from later epics. Epics 2 and 3 consume its identification verdicts, its four-state signal vocabulary and its token layer, so those are this epic's outward contract — later epics extend them rather than reinterpret them.
