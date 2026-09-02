# Epic 1 Context: Point it at a project and see what's there

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Run one command inside a BMAD project and reach a served local page that lists every artifact, each correctly identified — or, when the target is not a BMAD project, be handed the invocation that would have worked. This epic establishes the foundations every later epic builds on: the hexagonal skeleton, the read-only invariant with the test that enforces it, the token layer, the shared components and global chrome, project and artifact-root resolution, and the vocabulary for artifacts the tool cannot read or classify. Nothing here interprets artifact *content* beyond identifying what each one is.

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

**Read-only is the load-bearing promise.** The tool never writes, moves, deletes or modifies anything in the target project, verified by test rather than convention. `_bmad/`, `.claude/` and `_bmad-output/` are read-only inputs, never shipped in the published package.

**No outbound network of any kind** — no telemetry, fonts or CDN; the only socket is the loopback listener. Nothing persists outside the process: no cache, no config file, no tool-owned state anywhere.

**Serving is confined and defensive.** The listener binds the literal loopback address and no other interface; a mismatched `Host` is refused, write-shaped methods get 405 with an `Allow` header. Every path segment derived from project content is sanitized and confinement-checked on every read — including paths resolved during composition — so a value inside a project file can never address a file outside it. AD-10 carries exactly one scoped exception: the not-a-project suggestion scan enumerates *directory names* outside every permitted root, reads no content, and is importable only by the scan. Reads themselves are never exempt.

**There is deliberately no "no project" surface.** When the target is not a BMAD project the tool does not serve and does not launch a browser. It exits reporting the path it examined and what it looked for, plus the exact invocations that would have worked, modelled on `git push` reporting a missing upstream: hand over the command rather than describe the problem. That failure never reaches a rendered page, and the suggestion scan is bounded — the full ancestor chain plus two levels below, dot-directories and `node_modules` skipped on the way down but not on the way up. It applies recognition to each candidate deliberately, using the same `resolveLocation` the tool resolves with, and **discards every verdict**: what it returns is display text. That is the checkable claim, and it is what keeps the scan from becoming a resolution path.

**Nothing disappears from the view.** An artifact the tool cannot classify is listed as present-but-uninterpreted; one it cannot parse, as unreadable — naming what failed and at which stage. Neither is omitted and neither aborts the pass. A parser reading a convention-defined source fails visibly rather than returning empty as success.

**Accessibility is a floor.** WCAG 2.2 AA: full keyboard operation with no traps, focus always visible and never clipped or obscured, nothing dependent on colour alone, proper landmarks with one `h1` per surface, text resizing to 200% without loss. Density comes from spacing, not small type — which is what makes resizing survivable.

**BMAD's own layout is irregular, and the irregularities are measured rather than assumed.** A `{slug}` is a context-dependent name and never an identity. Seven run-folder families exist; four of the seven repeat within a single day, so a run folder must not be assumed to hold one run, and two carry no date at all and fall through to the ordering hierarchy with no folder-name signal. Review outputs appear either at a workspace root or under a `reviews/` subfolder. A directory that could be either a run folder or a sharded document is presented as ambiguous rather than resolved — BMAD's own discovery resolves that case by asking a human. Story locations come from configuration; a value that is absolute or resolves outside the project is reported as out-of-tree and never read from, and the absence of sprint tracking is a normal project shape.

**Serving specifics that later stories inherit rather than redecide:** the URL is announced on stdout and the resolved target on stderr, so one can be piped without the other; a preferred port that cannot be bound falls back to an OS-assigned one, so the port reported is always the port bound; and responses carry `cache-control: no-store`, since a page load is a refresh.

Cold start is explicitly not a gate in this epic; refresh latency is the binding performance requirement and is carried later.

## Technical Decisions

**Ports and adapters, chosen so read-only is mechanically testable.** Filesystem, git and browser access sit behind adapters; the domain is pure. A test enforces the boundary over the TypeScript sources: nothing outside the filesystem adapter imports `node:fs`, only the git, browser and build-script directories may import `node:child_process`, and mutating filesystem calls are denied everywhere.

**Rendering happens on the server.** HTML is produced in the render layer, never in the HTTP adapter and never assembled client-side. The client may only enhance already-delivered markup, and no client-side router owns a URL — so back and forward work throughout, and every surface is usable before any script runs.

**One immutable snapshot per refresh.** The pass reads each artifact once, recording identity, timestamps and oversight signals; rendering parses are deferred to first open and cached for that snapshot's lifetime. A page belongs to exactly one snapshot, whose identity it records. A refresh never mutates a snapshot in place.

**Identity is decided once,** in a single domain module, by a four-level precedence in which filename alone is never sufficient. Everything else consumes the verdict. An ambiguous verdict is recorded and presented as ambiguous, never resolved silently.

**Four signal states, one closed vocabulary** — present, absent, unreadable, unchecked — shared by model, conventions table and UI. Absence is never inferred from an empty result set.

**Git is read-only in the strong sense:** reporting commands only, optional locks disabled so no index is rewritten, repository-configured hook and monitor mechanisms neutralized by command-line override. It is a supplementary signal; the tool works without it.

**Resolution happens once, in the composition root,** and is passed onward — no other module discovers anything. The root is the target path itself, recognized by the artifact directories being present, with no walk up or down, so nested or sibling roots are unresolvable rather than resolved by precedence. Permitted roots are a *set*, admission-checked: any root derived from project content passes the sanitizer and an explicit admission check before joining it. Paths are canonicalized at the filesystem adapter; symlinks resolve before confinement is checked and before identity is keyed. The bounded discovery scan that builds the not-a-project failure message lives in the CLI and returns nothing the domain consumes, so it can never become a resolution path — asserted by substituting an inert stub for it and observing that the suggestions change, the served root does not, and a successful resolution calls it zero times.

**Third-party runtime code is bundled, not installed.** Runtime `dependencies` stays empty: a library the shipped code needs is a devDependency that esbuild inlines into `dist/`, so `npx` resolves nothing and the supply-chain surface is fixed at publish time rather than on each user's machine. The trade accepted with it: a security fix in a bundled library reaches users only when we republish, and third-party licence text ships alongside ours — so each addition is cheaper for the user, not free. Dependency count still counts. The first such library is the YAML parser, which lands with config parsing (split out of project resolution), not with document rendering.

**Stack seed:** TypeScript compiled with esbuild to `dist/`, `erasableSyntaxOnly` on so no TypeScript construct survives into emitted output and no enums, namespaces, parameter properties or decorators appear in source; Node 24 as the development runtime with a supported floor of 22, and `@types/node` pinned to that floor so an API absent in Node 22 fails the typecheck rather than shipping. Only `dist/`, prebuilt client assets and metadata are published. Two dates not to be surprised by: Node 24 leaves Active LTS on 2026-10-20 (the floor of 22 holds to 2027-04-30), and Preact 11 is at RC with a reworked hydration path aimed at exactly the server-rendered-plus-islands seam — worth evaluating before the client layer is built.

## UX & Interaction Patterns

**Tokens are normative.** Every colour, type, spacing, radius and motion value resolves through a token; no literal is permitted in rendering code. Frontmatter wins over the design document's own prose, and both spines win over any mockup — a mockup is never the source of a value.

**Elevation is tonal only** — no shadow, gradient or blur anywhere. Three levels govern peer surfaces; a nested surface is relative to its container and needs two ladder steps to read as an edge. Because nesting exhausts the ladder, hover and transient states change the outline, not the surface.

**Tiles are self-contained** and never depend on another tile's state; each renders meaningfully when its data is empty, partial or unavailable, and says which. Tiles are the extension point — a new capability adds a tile. Positions are fixed: a user arrangement would need persistence the architecture forbids.

**The project header is global chrome,** not a tile: present on every surface, carrying project name, resolved root path, git availability, snapshot currency and the refresh control, so every surface inherits currency and refresh reporting. The refresh control is a link, not script — a page load builds a new snapshot.

**The string index is normative and every entry in it is used verbatim,** with a stated convention: a period for sentence-shaped strings and none for label-shaped, an initial capital for badge and pill labels, `<placeholder>` for substituted values. The four signal states read `Present`, `Not checked`, `Not found` and `Unreadable`. Where a value is stated in the string index, code reads the index rather than holding a second copy.

**Responsive behaviour has a single breakpoint at ~900px,** below which the tile grid becomes one column in reading order and the Document reader moves its contents rail above the content. Nothing below ~600px is a design target.

**Interaction primitives are defined once and shared** — no surface implements its own. Tab order follows document order; arrows or `k`/`j` within a focused list; `Enter` opens; `Escape` leaves a reading surface or closes an overlay; `r` refreshes; `g` then a letter navigates. Single-letter keys are inert while a text input has focus. Motion is refresh progress only, focus transitions are instant, and `prefers-reduced-motion` is honoured from the outset.

**Honesty is visible and reaches assistive tech.** Where a fact is weakly evidenced the UI says so rather than showing it at full confidence, and accessible names carry the same honest state the visuals do — not a flattened version. Affordances are read-only throughout: copy a path, open in the user's editor, copy a permalink.

## Cross-Story Dependencies

Story 1.3's components and chrome are consumed by every surface afterwards, in this epic and later ones — the widest dependency here. Stories 1.7 to 1.11 all feed the inventory surface in 1.12, the first story to render real project data. Story 1.5's resolution is a precondition for every story that reads the project; 1.6 depends on 1.5's recognition rule to know when to fail; and 1.11 extends 1.5's notion of a permitted root to cover configured story locations. Config parsing (FR-10) was split out of 1.5 and brings the first bundled library with it. Story 1.4 depends only on 1.1, so it can land at any point. Stories 1.8, 1.9 and 1.10 all build on 1.7's identity verdict and must not re-derive it. Git availability in the header is its own story and reads `Not checked` until it lands. Later epics inherit the snapshot, the signal vocabulary and the identity verdict without re-deriving them.
