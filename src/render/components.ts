/**
 * The containers every surface reuses.
 *
 * Two of them, differing only in tone: `tile` at elevation level 1 and
 * `tile-raised` at level 2. That is the whole of tonal elevation — same
 * padding, same radius, no border, no shadow. A tile's tone is its edge.
 *
 * Three rules are enforced here rather than documented:
 *
 *   1. **A tile never renders hollow.** Content is either markup or a stated
 *      reason for its absence; there is no third option, because a bare
 *      container with nothing in it is the failure EXPERIENCE.md calls a defect
 *      on every surface.
 *   2. **At most one raised tile per surface.** `tileGrid` counts them and
 *      refuses a second. A raised tile means "this is the one thing to look at
 *      first", which two of them cannot both be.
 *   3. **A tile's label is a real heading.** Screen-reader users traverse the
 *      dashboard by structure, so the label is an `h2` under the surface's one
 *      `h1` — not a styled `div`.
 *
 * No value appears here. Everything visual resolves through the custom
 * properties emitted in `./stylesheet.ts`, so this module holds structure and
 * nothing else.
 */

import { escapeHtml } from './html.ts';

/**
 * What a tile contains: markup, or the reason there is none.
 *
 * `html` is **caller-provided markup and is emitted verbatim.** It is the one
 * string in this module that is not escaped, because a tile's content is
 * composed of other rendered components rather than of raw text. Any *text*
 * reaching it must be passed through `escapeHtml` by its caller first — see
 * `dashboard()` in `./page.ts`, which does exactly that. Use `{ empty }` for a
 * plain sentence; that branch escapes.
 *
 * A union rather than an optional string, so "empty" is unrepresentable without
 * saying *why* it is empty. `No <family> runs in this project.` and
 * `A BMAD project, with no artifacts yet.` are different facts, and a tile that
 * accepted a bare absence would let a caller lose that distinction silently.
 */
export type TileContent = { readonly html: string } | { readonly empty: string };

export interface TileOptions {
  /** Shown uppercased by CSS; the string itself stays ordinary prose so the
   *  accessible name a screen reader announces is not shouted. */
  readonly label: string;
  readonly content: TileContent;
  /** Level 2 instead of level 1. At most one per surface. */
  readonly raised?: boolean;
}

function tileBody(content: TileContent): string {
  if ('html' in content) {
    if (content.html.trim() === '') {
      throw new Error('a tile given empty html must state a reason instead: use { empty }');
    }
    return content.html;
  }
  if (content.empty.trim() === '') {
    throw new Error('a tile with no content must say why it is empty; the reason cannot be blank');
  }
  return `<p class="tile-empty">${escapeHtml(content.empty)}</p>`;
}

/** One tile: a labelled container at level 1, or level 2 when raised. */
export function tile(options: TileOptions): string {
  if (options.label.trim() === '') {
    throw new Error('a tile must carry a label; it is the heading the page is traversed by');
  }
  const className = options.raised === true ? 'tile-raised' : 'tile';
  return [
    `<section class="${className}">`,
    `<h2 class="tile-label">${escapeHtml(options.label)}</h2>`,
    tileBody(options.content),
    '</section>',
  ].join('\n');
}

/**
 * A surface's tiles, with the single-raised-tile rule enforced.
 *
 * Takes options rather than rendered strings on purpose: given strings it could
 * only count class names, which is a check on its own output rather than on the
 * caller's intent, and would pass for a caller who hand-wrote the markup.
 */
export function tileGrid(tiles: readonly TileOptions[]): string {
  const raised = tiles.filter((candidate) => candidate.raised === true);
  if (raised.length > 1) {
    throw new Error(
      `a surface may carry at most one raised tile; ${String(raised.length)} were given ` +
        `(${raised.map((candidate) => candidate.label).join(', ')})`,
    );
  }
  if (tiles.length === 0) {
    throw new Error('a tile grid with no tiles is an empty surface; render the empty state instead');
  }
  return [`<div class="tile-grid">`, ...tiles.map(tile), '</div>'].join('\n');
}
