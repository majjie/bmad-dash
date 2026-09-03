/**
 * The containers every surface reuses.
 *
 * Two of them, differing only in tone: `tile` at elevation level 1 and
 * `tile-raised` at level 2. That is the whole of tonal elevation — same
 * padding, same radius, no border, no shadow. A tile's tone is its edge.
 *
 * Three rules are enforced here rather than documented:
 *
 *   1. **A tile never renders hollow.** Content is markup, a sentence, or a
 *      stated reason for its absence; there is no fourth option and none of the
 *      three may be blank, because a bare container with nothing in it is the
 *      failure EXPERIENCE.md calls a defect on every surface.
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
 *
 * **A fourth rule arrived with Story 1.12: a tile cannot be handed raw markup.**
 * `TileContent.html` takes a `Markup`, which only `markup()` builds and which
 * escapes every value it interpolates, so project-derived text cannot reach a
 * tile unescaped — see `TileContent` below.
 */

import { escapeHtml, isMarkup, type Markup } from './html.ts';

/**
 * What a tile contains: markup, a sentence, or the reason there is none.
 *
 * **`html` is no longer a string, and that is Story 1.12's correction.** It was
 * caller-provided markup emitted verbatim, with a doc comment asking each
 * caller to escape its own text — safe only while every caller was the render
 * layer's own page copy. The inventory renders artifact paths and family names
 * off a project the user did not necessarily write, so a forgotten
 * `escapeHtml` there is a crafted filename reaching a browser. The type now
 * demands a `Markup`, which only `markup()` builds and which escapes every
 * value it interpolates, so a raw project-derived string **cannot** be handed
 * to a tile at all. That is a compile error rather than a review question.
 *
 * `text` is the form that escapes what it is handed: one ordinary sentence,
 * escaped here, for a tile whose content is a statement rather than a
 * structure. `empty` is the same shape with the stated-absence styling, kept
 * distinct because an absence is not an ordinary sentence.
 *
 * A union rather than an optional string, so "empty" is unrepresentable without
 * saying *why* it is empty. `No <family> artifacts in this project.` and
 * `A BMAD project, with no artifacts yet.` are different facts, and a tile that
 * accepted a bare absence would let a caller lose that distinction silently.
 */
export type TileContent =
  | { readonly html: Markup }
  | { readonly text: string }
  | { readonly empty: string };

export interface TileOptions {
  /** Shown uppercased by CSS; the string itself stays ordinary prose so the
   *  accessible name a screen reader announces is not shouted. */
  readonly label: string;
  readonly content: TileContent;
  /** Level 2 instead of level 1. At most one per surface. */
  readonly raised?: boolean;
  /**
   * Occupy the whole grid row, at every width.
   *
   * For a tile whose content *qualifies* the tiles after it rather than sitting
   * beside them — the inventory's scan report is the case, and the review of
   * that story is where the need was found: its comment claimed the tile "sits
   * above what it qualifies" while above the breakpoint the grid is two columns
   * and the first family tile sat next to it, leaving half the surface not
   * below it.
   */
  readonly span?: boolean;
}

function tileBody(content: TileContent): string {
  if ('html' in content) {
    // The type already refuses a raw string; this refuses one that arrived
    // through an `as` cast, which is now the only way it can — `Markup`'s
    // constructor is module-private to `./html.ts`, which the review of this
    // story is what forced: exported with a public constructor,
    // `new Markup(untrusted)` was shorter than the cast this guard was written
    // to catch. A `TypeError` about `trim` would have been the alternative
    // here, which names the symptom rather than the rule.
    if (!isMarkup(content.html)) {
      throw new Error('a tile takes html only as Markup, built by markup(); a raw string is refused');
    }
    if (content.html.html.trim() === '') {
      throw new Error('a tile given empty html must state a reason instead: use { empty }');
    }
    return content.html.html;
  }
  if ('text' in content) {
    if (content.text.trim() === '') {
      throw new Error('a tile given empty text must state a reason instead: use { empty }');
    }
    return `<p>${escapeHtml(content.text)}</p>`;
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
  const level = options.raised === true ? 'tile-raised' : 'tile';
  const className = options.span === true ? `${level} tile-span` : level;
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
