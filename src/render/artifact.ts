/**
 * The artifact view: one artifact, opened at its own URL.
 *
 * `EXPERIENCE.md:49` names it — "One artifact in the viewer for its type" —
 * and the viewer is not here. Story 2.1a serves the **shell**: which project is
 * open, which artifact this is, and what the inventory already knows about it.
 * Rendering the artifact's content is Story 2.1b and parsing it is 2.9, so
 * nothing in this file reads a byte of any file, and there is no markdown
 * parser anywhere behind it.
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

import { FAMILY_LABELS, type Family } from '../domain/identity.ts';
import { artifactUrl } from '../domain/url.ts';
import { markup } from './html.ts';
import { tileGrid } from './components.ts';
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
 * downstream of a full directory walk. Story 2.1c's parse cache is where the
 * per-request cost is addressed, keyed by the snapshot identity.
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
 */
export function renderArtifact(projectRoot: string, found: FoundArtifact): string {
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
  const main = [
    '<main>',
    markup`<h1>${ARTIFACT_SURFACE_TITLE}</h1>`.html,
    markup`<code class="artifact-path">${found.row.path}</code>`.html,
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
    '</main>',
  ].join('\n');
  return documentShell(projectRoot, refreshHref, main);
}
