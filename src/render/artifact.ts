/**
 * The artifact view: one artifact, opened at its own URL.
 *
 * `EXPERIENCE.md:49` names it — "One artifact in the viewer for its type" —
 * and the per-type viewer is not here. Story 2.1a served the **shell**: which
 * project is open, which artifact this is, and what the inventory already knows
 * about it. Story 2.1b adds the **content**, as the generic fallback a type
 * with no viewer of its own gets: `renderArtifact` now takes the artifact's
 * body and renders it through `./markdown.ts`.
 *
 * **It still reads no byte of any file.** The body arrives as an argument,
 * already read by the composition root's confined reader — the render layer has
 * no filesystem adapter to reach and `test/architecture.test.ts` pins the
 * import list that keeps it that way. So the traversal argument below is
 * unchanged: a URL that is not a row cannot open anything, because there is no
 * code path from a request to a read.
 *
 * **FR-18 is founded here and not satisfied.** It requires each artifact type
 * to be rendered "by a viewer designed for its shape, **not** by a generic
 * markdown renderer", which is precisely what this ships. Stories 2.4 to 2.8
 * satisfy it by replacing this fallback per type; section selection is 2.9 and
 * the contents rail is 2.10.
 *
 * **It states the same facts as the inventory row, from the same code.**
 * `artifactFacts` is imported rather than re-rendered, because a second
 * rendering of the type cell, the readability state, the stage, FR-69's
 * levels-tried sentence and FR-12's uninterpreted sentence is nine facts free
 * to drift from the nine the Dashboard shows — and a reader who follows a link
 * and finds a different account of the same artifact has been told one of them
 * is wrong without being told which.
 *
 * **The tile label is the artifact's family, and no new copy was invented for
 * it.** On the Dashboard, which family an artifact belongs to is said by *which
 * tile its row is in*; carrying that through is what makes this page state what
 * the row stated. Where no single family resolved — an unidentified verdict, or
 * an ambiguity whose readings name two families — the label is
 * `UNPLACED_TILE_LABEL`, exactly as the inventory labels the tile those rows
 * land in.
 *
 * **An artifact the authority could not identify still has a page.** Its
 * inventory row is deliberately not a link (`EXPERIENCE.md:183`), but the URL
 * resolves and the shell says so: the tile is labelled `No family resolved` and
 * the facts carry FR-69's `Not identified. Tried: …`. A URL that 404'd for a
 * row the reader can see would be the tool hiding an artifact it listed.
 */

import { editorUrl } from '../domain/editor.ts';
import { FAMILY_LABELS, type Family } from '../domain/identity.ts';
import { SIGNAL_LABELS, type ReadStage, type SignalState } from '../domain/signal.ts';
import { artifactUrl } from '../domain/url.ts';
import { markup } from './html.ts';
import { buttonPrimary, tileGrid } from './components.ts';
import { renderMarkdown } from './markdown.ts';
import { documentShell } from './page.ts';
import {
  UNPLACED_TILE_LABEL,
  artifactFacts,
  type ArtifactRow,
  type InventoryView,
} from './inventory.ts';

/**
 * This surface's name, verbatim from `EXPERIENCE.md`'s surface table.
 *
 * Held as a constant and pinned against the document by
 * `test/render/artifact.test.ts`, on the same terms as every string index row:
 * a literal in source that merely happens to match the table is a second copy
 * of one belief. `EXPERIENCE.md:224` requires one `h1` per surface, and this is
 * what it names.
 */
export const ARTIFACT_SURFACE_TITLE = 'Artifact view';

/**
 * One artifact, with the family whose tile its row sits in.
 *
 * The family is not on `ArtifactRow` — the inventory carries it on the
 * `FamilyGroup`, because for an ambiguous verdict there may be two of them and
 * for an unidentified one there is none. So the lookup returns both, and this
 * page does not have to re-derive a placement the projection already made.
 */
export interface FoundArtifact {
  readonly row: ArtifactRow;
  readonly family: Family | undefined;
}

/**
 * The row `path` names, or `undefined` because the snapshot has no such row.
 *
 * **This is the whole of URL resolution, and it is a set-membership test.**
 * Nothing here calls `resolve`, `realpath`, `stat` or anything else that could
 * consult a filesystem — it cannot, since the render layer has no filesystem
 * adapter to reach — so a URL cannot name a file that is not in the snapshot,
 * whatever it spells. That is what makes traversal *structurally* impossible
 * rather than defended against: `/artifact/../../etc/passwd` normalizes to the
 * key `etc/passwd`, which is not a row, which is a 404. There is no code path
 * from a request to a read.
 *
 * A linear scan, deliberately, and not an index built per request. The measured
 * shape of this repository is 58 rows; the pass that produced them walked the
 * whole tree first, so a map keyed by path would be a micro-optimisation
 * downstream of a full directory walk. The per-request cost is not addressed
 * anywhere: Story 2.1c would have cached the parse and was cancelled on
 * 2026-09-04, so a repeat open re-parses. Deliberate — see `epics.md`.
 *
 * Row paths are unique across the whole view — `src/adapters/fs/walk.ts` keys
 * its `seen` map on the resolved real path, so a second spelling is suppressed
 * rather than added — so the first match is the only match.
 */
export function findArtifact(view: InventoryView, path: string): FoundArtifact | undefined {
  for (const group of view.groups) {
    for (const row of group.rows) {
      if (row.path === path) return { row, family: group.family };
    }
  }
  return undefined;
}

/**
 * One artifact's bytes as text, or the typed reason there are none.
 *
 * **Exactly the shape `ConfinedReader.readText` returns**, deliberately and
 * structurally: the composition root's supplier *is* that method, so the
 * failure a reader reports is the failure the page renders, with no translation
 * step in between that could flatten `absent` into `unreadable` or lose the
 * stage. Nothing imports this type to build one — it is satisfied by the
 * reader's own return value — which is what keeps `src/cli/` out of the
 * importer set `test/architecture.test.ts` pins on this module.
 *
 * `stage` is the whole of AD-8's vocabulary rather than the four stages a file
 * read can reach, because the supplier also answers for `confinement`: a row
 * whose path escapes the permitted root is a value the page renders in place,
 * not an exception that costs the reader the rest of the document.
 *
 * **A parameter and not a field on `ArtifactRow`.** `snapshotIdOf` digests the
 * whole `InventoryView`, so text on a row would put every artifact's bytes into
 * every per-request identity — and the projection would have to read every file
 * on every page load to build one. `renderArtifact` is therefore a function of
 * the view *and* the body, which widens `test/render/artifact.test.ts`'s "the
 * page is a function of the view" rather than abandoning it.
 */
export type ArtifactBody =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly state: Extract<SignalState, 'absent' | 'unreadable'>;
      readonly stage: ReadStage;
      readonly reason: string;
    };

/**
 * What a file of no content says, verbatim.
 *
 * A sentence rather than a blank region, on `./components.ts`'s rule for a
 * hollow tile: an empty surface is indistinguishable from a surface that
 * failed, and "the file is empty" is a fact the reader can act on.
 */
export const EMPTY_BODY_SENTENCE = 'Empty file.';

/**
 * The open-in-editor link's own text, and therefore its accessible name.
 *
 * A verb phrase rather than a noun, because an anchor's accessible name is what
 * a screen reader announces in a links list and "Editor" would name a place
 * rather than an action. No document dictates this string — `EXPERIENCE.md:213`
 * names the affordance ("open it in the user's editor") without prescribing
 * copy — so it is held as a constant here and pinned by
 * `test/render/artifact.test.ts` on the same terms as any other page string: one
 * definition, so a reword is a change to state rather than a drifted duplicate.
 */
export const OPEN_IN_EDITOR_LABEL = 'Open in editor';

/**
 * The row's project-relative path joined onto the project root.
 *
 * **The join is here rather than in `../domain/editor.ts`, deliberately.** The
 * root is `renderArtifact`'s own first argument and a URL formatter has no
 * business learning about roots — so the domain module takes an already-absolute
 * path and stays a pure formatter, which is what keeps it testable with no
 * server and no filesystem. It is also string work rather than `node:path`
 * work, because `test/architecture.test.ts` pins this module's import list
 * precisely to stop a resolver here growing a filesystem reach; `basename` and
 * `isAbsolute` in `./page.ts` are the render layer's whole allowance and neither
 * would help.
 *
 * **It cannot produce a path outside the root, and that is the point of the
 * loop rather than a happy consequence.** Three shapes are handled, each of
 * which a naive `${root}/${relative}` would get wrong:
 *
 *   - An **empty** segment, which is what a leading or doubled separator
 *     splits to. Dropped, so a relative path spelled `/etc/passwd` joins as
 *     `<root>/etc/passwd` rather than resolving to the system file — the
 *     matrix's absolute-looking row.
 *   - A `.` segment. Dropped, as RFC 3986 §5.2.4 drops it.
 *   - A `..` segment. It removes the segment before it and is otherwise
 *     dropped, exactly as `../domain/url.ts`'s `normalizeSegments` does — and
 *     because the loop only ever pops segments of the *relative* path, the root
 *     itself can never be popped off. Climbing past it is not defended against,
 *     it is unrepresentable.
 *
 * A drive-shaped relative path (`C:\Windows\x`) needs no branch: it is one
 * segment containing legal POSIX filename characters, so it joins as
 * `<root>/C:\Windows\x` — a file inside the project that this project does not
 * contain, which is the same answer `../domain/url.ts` gives for the same input.
 *
 * **None of these shapes can reach this function through a page today**, and it
 * is guarded anyway. `WalkEntry.relative` is `/`-separated, non-empty, never
 * absolute and carries no dot segment, and `artifactUrl` above throws for each
 * of the three — so a row spelling one 500s at the refresh href a line earlier.
 * That makes this the second line of defence, which is why it is asserted at
 * the unit it lives in rather than through a page that cannot render one.
 */
export function artifactAbsolutePath(projectRoot: string, relative: string): string {
  // **A nameless root is refused, not anchored.** An empty `projectRoot` joined
  // to `a/b.md` produced `/a/b.md` — silently rooted at the filesystem, an href
  // naming a file the project does not contain. `./chrome.ts` already refuses a
  // blank root rather than rendering a nameless project; this is the same rule
  // at the same boundary. A relative root is refused here too, because the throw
  // is more useful than `editorUrl`'s: this one names which argument was wrong.
  if (projectRoot.trim() === '') {
    throw new Error('an artifact path needs a project root; it was empty');
  }
  // A trailing separator on the root would double when joined, and a root of
  // `/` must survive as the leading separator rather than becoming one segment.
  const root = projectRoot.replace(/[\\/]+$/, '');
  const inside: string[] = [];
  // Split on `/` alone. A backslash is a legal character in a POSIX filename,
  // and `WalkEntry.relative` is `/`-separated on every platform, so treating
  // `\` as a separator here would break one name into two.
  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      inside.pop();
      continue;
    }
    inside.push(segment);
  }
  return [root, ...inside].join('/');
}

/** Which artifacts the parser is pointed at. Everything else is shown as it is. */
function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/**
 * A read or parse failure, rendered **in place** — AD-7.
 *
 * Never an omission and never fatal to the page: the shell, the path and the
 * inventory's own facts all still render, and this replaces the content region
 * alone. It names the state word and the stage, which is what "naming what
 * failed and at which stage" is, and carries the underlying `reason` because
 * that is where the useful half of two matrix rows lives — the size and the
 * limit for an over-large file, and `not a regular file (directory)` for a run
 * folder or a sharded document, which have no body to read at all.
 *
 * The stage is a `<code class="artifact-stage">`, the same element and the same
 * class the inventory row uses for the same vocabulary. Reusing it is the point:
 * a second treatment of one word is a second answer to "which step failed".
 * What it deliberately does *not* reuse is `.artifact-state` and
 * `.artifact-note`, which are the row's *fact cells* — the two surfaces are
 * compared cell for cell by `test/render/artifact.test.ts`, and a content
 * failure is not a fact the Dashboard row states.
 */
function failureRegion(state: string, stage: string, reason: string): string {
  return markup`<p class="artifact-failure">${state} at the <code class="artifact-stage">${stage}</code> stage: ${reason}</p>`
    .html;
}

/**
 * The reading surface: one artifact's content, or the stated reason for none.
 *
 * `DESIGN.md:255` — "reading surfaces break the dashboard grid: a rendered
 * document uses a single column at `{spacing.reading-measure}`" — so this is a
 * sibling of the tile grid rather than a tile in it. The `article` is the
 * document; `./stylesheet.ts` is where the measure and the serif `prose` role
 * are applied.
 *
 * Four outcomes, and each is the matrix's own:
 *
 *   - **A readable markdown artifact** is parsed. The result is emitted
 *     verbatim, which is the one place a page carries markup built from a
 *     project's bytes; see `./markdown.ts` for what bounds that.
 *   - **Zero bytes, or only whitespace** is `Empty file.` and nothing standing
 *     in for it.
 *   - **A readable non-markdown artifact** is preformatted text, escaped, not
 *     run through the parser. A `.yaml` or a `.txt` put through a markdown
 *     parser is not rendered, it is mangled.
 *   - **A read or parse failure** renders in place.
 */
function contentRegion(path: string, body: ArtifactBody): string {
  if (!body.ok) return failureRegion(SIGNAL_LABELS[body.state], body.stage, body.reason);
  if (body.text.trim() === '') {
    return markup`<p class="artifact-empty">${EMPTY_BODY_SENTENCE}</p>`.html;
  }
  if (!isMarkdown(path)) return markup`<pre class="artifact-source">${body.text}</pre>`.html;
  const rendered = renderMarkdown(body.text);
  if (!rendered.ok) {
    return failureRegion('Could not be rendered', rendered.stage, rendered.reason);
  }
  return rendered.html;
}

/**
 * The served document for one artifact.
 *
 * `projectRoot` is the resolved root, passed through unchanged from the
 * composition root exactly as `renderPage` takes it: the shell renders the
 * global project header from it, which `EXPERIENCE.md:59` requires on every
 * surface.
 *
 * The path is a `<code>` under the `h1` rather than being the `h1` itself. The
 * heading names the surface, which is what the Dashboard's does and what makes
 * a screen reader's heading list read as a list of surfaces; the path is a
 * string off the filesystem, which `DESIGN.md`'s own rule puts in the mono
 * family rather than in a display role.
 *
 * From Story 2.3a that `<code>` sits in `.artifact-exits` beside the
 * open-in-editor link, because the path and the way out of the tool are one
 * thing to a reader: the link is the exit, and the text is what they act on when
 * the link's editor is not the one they use.
 *
 * `body` is **required**, on `StartServerOptions.inventory`'s own reasoning:
 * from this story the surface *is* the artifact's content, so a page rendered
 * without a body is not the page — and deciding for a caller what an absent
 * body looks like would be inventing a fifth outcome the matrix does not have.
 */
export function renderArtifact(
  projectRoot: string,
  found: FoundArtifact,
  body: ArtifactBody,
): string {
  const label = found.family === undefined ? UNPLACED_TILE_LABEL : FAMILY_LABELS[found.family];
  // **Refresh re-requests this artifact, not the Dashboard.** `EXPERIENCE.md:161`
  // says the current surface "is never replaced under the user" and `:153` gives
  // the Artifact view "stays on its snapshot", so a header pointing at `/` would
  // navigate the reader off what they were reading. This is the second surface,
  // which is the story `deferred-work.md` named as the one to fix it.
  //
  // **Unguarded, and that is the difference from `./inventory.ts`.** `artifactUrl`
  // throws for a path no walk entry carries, and the inventory catches that so
  // one malformed row costs one link rather than the whole Dashboard. Here the
  // surface *is* the one row, so there are no neighbours to protect — and a page
  // whose own refresh control cannot be addressed is better refused as a 500 the
  // reader can report than served with a control that lies about where it goes.
  const refreshHref = artifactUrl(found.row.path);
  // **The two exits, in the shell.** Story 2.3a puts FR-24's open-in-editor half
  // here rather than in a per-type viewer so Stories 2.4-2.8 inherit it rather
  // than reimplementing it five times — and the path text moves in beside the
  // link for the same reason it was already on the surface: it is the fact a
  // reader needs, and the one that still works when the link's editor is not
  // theirs. Both are functions of the row's **path**, which every row has, so
  // they render identically for a readable, unreadable, non-markdown or
  // directory row; there is no read state to branch on.
  //
  // **The link is this surface's one `button-primary`**, which until now no
  // surface carried at all: Story 2.3 gave Refresh the ghost treatment
  // precisely to keep the slot free, and `test/render/components.test.ts`'s
  // one-primary bound has been asserted-but-vacuous since. Opening the artifact
  // where the reader works is the forward action they came for, so this is what
  // makes that bound a real constraint.
  //
  // Unguarded, on `refreshHref`'s own reasoning one line up: `editorUrl` throws
  // only for a path that is not absolute, which the join above cannot produce,
  // and a surface whose primary action cannot be addressed is better refused as
  // a 500 the reader can report than served with a control that lies.
  const exits = [
    '<div class="artifact-exits">',
    markup`<code class="artifact-path">${found.row.path}</code>`.html,
    buttonPrimary({
      label: OPEN_IN_EDITOR_LABEL,
      href: editorUrl(artifactAbsolutePath(projectRoot, found.row.path)),
    }),
    '</div>',
  ].join('\n');
  const main = [
    '<main>',
    markup`<h1>${ARTIFACT_SURFACE_TITLE}</h1>`.html,
    exits,
    tileGrid([
      {
        label,
        // A `div` carrying the row's own class rather than a one-item list: the
        // cells need the flex row that separates them, and a `ul` holding
        // exactly one `li` announces "list, 1 item" to a screen reader on a
        // page whose whole subject is that one artifact.
        content: { html: markup`<div class="artifact-row">${artifactFacts(found.row)}</div>` },
      },
    ]),
    // After the facts, not inside them: the tile grid states what the tool
    // knows *about* the artifact, and this is the artifact.
    '<article class="artifact-content">',
    contentRegion(found.row.path, body),
    '</article>',
    '</main>',
  ].join('\n');
  return documentShell(projectRoot, refreshHref, main);
}
