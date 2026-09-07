# bmad-dash

A read-only local dashboard over a BMAD project's artifacts.

BMAD records everything it does, faithfully, in markdown and YAML spread across
a project tree: planning artifacts, per-run folders, memlogs, sprint tracking.
The record is complete and close to unreadable. Answering *"what is actually
happening in this project right now?"* means opening several files in different
formats and reconstructing state that no single file holds.

`bmad-dash` is one command, run in any BMAD project, that opens a browser onto
that project's generated record — organized so a human can exercise judgement
over machine-generated work without archaeology.

```
$ bmad-dash
http://127.0.0.1:39481/
```

## Guarantees

These are invariants, not defaults. The first three are enforced by the test
suite rather than left to convention; the last is a scope boundary:

- **It never writes to the project.** Only `src/adapters/fs/` may import
  `node:fs`, only the git and browser adapters may import `node:child_process`,
  and every adapter surface exposes read or launch operations exclusively.
  `test/architecture.test.ts` reads the sources and refuses anything else.
  Gating `node:fs` alone would be insufficient — a subprocess is a write path
  the import assertion would not see.
- **It binds `127.0.0.1` only**, and rejects requests with an unexpected `Host`
  header.
- **It makes no outbound network request.** No fonts, no telemetry, no update
  check. Installing it installs nothing: `dependencies` is empty, and the one
  third-party package is compiled into the shipped bundle at build time (see
  [LICENSE-THIRD-PARTY](LICENSE-THIRD-PARTY)).
- **It does not judge correctness.** It surfaces what BMAD already records
  explicitly — assumptions, overrides, open items, deferred work — and
  structural risk that is computable without judgement. Detecting hallucination
  or evaluating whether an assumption is reasonable would need an LLM evaluator,
  which is a different product. The human supplies the judgement; the tool
  minimizes what they must read to apply it.

## Requirements

Node.js 22 or newer. Nothing else.

The floor is higher for *developing* the tool — Node 22.18, which strips
TypeScript types without a flag — because the test suite runs `.ts` directly.
The shipped tool needs only the `engines` floor of 22, since the package ships
compiled JavaScript in `dist/` and never builds on install.

## Install and run

Not published to a registry yet. From a clone:

```bash
git clone git@github.com:majjie/bmad-dash.git
cd bmad-dash
npm install
npm run build        # dist/ is gitignored; build before first run
npm link             # optional — puts `bmad-dash` on your PATH
```

Then, in any BMAD project:

```bash
bmad-dash                      # the current directory, browser opened
bmad-dash ../other-project     # a project elsewhere
bmad-dash --no-open            # print the URL, launch nothing
bmad-dash --port 8080          # a preferred port (default: 0, OS-assigned)
```

`stdout` carries the URL and nothing else, so it pipes; every diagnostic goes to
`stderr`. `--no-open` still prints the URL — browser launch is best-effort and
never something the tool depends on. Exit code 2 means the arguments were wrong,
1 means it could not start.

Stop it with Ctrl-C. `SIGINT`, `SIGTERM` and `SIGHUP` all shut the server down;
closing the terminal is an ordinary way to end a foreground command.

## What it shows today

The tool is being built epic by epic, and this section describes what is
actually served rather than the full v1 scope.

**The dashboard (`/`)** — the project inventory. Every artifact the scan found,
grouped by family (brief, PRD, architecture, UX design, research, spec, forge,
review, epics, story, sprint tracking, note, and one group for what resolved to
no family), with counts and a scan tile that says whether the pass finished.
Identity is decided once and recorded: an artifact that could be either a run
folder or a sharded document is shown as ambiguous rather than resolved
silently, and one that could not be read or identified is shown as such rather
than omitted — a view whose purpose is assurance cannot let artifacts vanish
from it.

**An artifact (`/artifact/<path>`)** — the document rendered as HTML, server-side.
Alongside it, the two exits back out of the tool: a link that opens the file in
your editor, and a button that copies its path. The editor scheme is hardcoded
to `vscode://file/…`, which is why the path is also on the surface as visible,
selectable text — a reader on another editor gets a link that does not resolve,
and the path is the fact they actually need.

Every response is served from one immutable snapshot of the project, and carries
its identity in a `bmad-snapshot-id` header, so two panels can never render from
files in different states.

**Not built yet:** the recent-activity feed, the memlog and reviewer-output
viewers, long-document pagination and section links, and the consolidated risk
surface. Progress lives in
[`_bmad-output/implementation-artifacts/sprint-status.yaml`](_bmad-output/implementation-artifacts/sprint-status.yaml);
Epic 1 is done and Epic 2 is in flight.

## Development

```bash
npm test          # typecheck, build, then the full suite
npm run typecheck # tsc --noEmit
npm run build     # bundle src/cli/index.ts into dist/cli/index.js
npm run test:raw  # node --test directly, unguarded
```

`npm test` goes through `scripts/run-tests.ts` rather than calling `node --test`
itself, because three of that runner's behaviours make a green result
untrustworthy: a single-level glob silently omits subdirectories, a pattern
matching nothing exits 0, and a skipped test still counts toward the total. So
the pattern is recursive, the reported total is checked against a floor, and a
non-zero skip count fails. Raise the floor when you add tests; never lower it to
make a run pass.

### Layout

Layered — a pure domain with adapters at the edges. Arrows go one way, which is
what makes the read-only invariant a mechanical assertion rather than a promise.

| Layer | Directory | May import |
| --- | --- | --- |
| Domain — model, identification, normalization, ordering, sectioning | `src/domain/` | nothing outside `src/domain/` |
| Outbound adapters — filesystem, git, browser | `src/adapters/fs/`, `src/adapters/git/`, `src/adapters/browser/` | domain types, Node built-ins |
| Inbound adapter — HTTP | `src/adapters/http/` | domain, render, and the path vocabulary from `src/adapters/fs/paths.ts` |
| Render — server-side HTML from the domain model | `src/render/` | domain types only |
| Composition root — CLI entry, wiring | `src/cli/` | everything |
| Client interaction — shipped prebuilt, never fetched | `web/` (empty so far) | nothing from `src/` |

Document content — markdown, sections, tables of contents, viewers — is HTML
produced in `src/render/`. The client enhances delivered markup only; it never
assembles document content, and no client-side router owns a document URL. The
only script shipped today is the inline one behind the copy button, admitted by
a `script-src` hash in the page's Content-Security-Policy rather than by
`'unsafe-inline'`.

### The documents

This project is built with BMAD, so its own planning record is in the tree and
is the place to look before changing behaviour:

- [`prd.md`](_bmad-output/planning-artifacts/prds/prd-bmad-2026-08-28/prd.md) —
  requirements, users, journeys, and the scope boundary
- [`ARCHITECTURE-SPINE.md`](_bmad-output/planning-artifacts/architecture/architecture-bmad-2026-08-28/ARCHITECTURE-SPINE.md) —
  the invariants above, their rationale, and the amendment log
- [`DESIGN.md`](_bmad-output/planning-artifacts/ux-designs/ux-bmad-2026-08-28/DESIGN.md) —
  the visual and interaction contract
- [`epics.md`](_bmad-output/planning-artifacts/epics.md) — the story breakdown,
  including what was cancelled and why

## Licence

MIT — see [LICENSE](LICENSE). Third-party licences carried in the shipped
bundle are reproduced in [LICENSE-THIRD-PARTY](LICENSE-THIRD-PARTY).
