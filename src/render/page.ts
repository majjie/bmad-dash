/**
 * The served document.
 *
 * It lives here and not in the HTTP adapter because AD-2 puts document HTML in
 * `src/render/`: the adapter's job is binding, validating `Host` and choosing a
 * status code, and a page held as a constant inside it was a second job that
 * would only grow.
 *
 * From Story 1.3 the document has a real shape: a `banner` carrying the project
 * header, and a `main` carrying one surface. The surface is the **Dashboard** —
 * the landing surface for a bare invocation — so that is what its single `h1`
 * names. The tool's own name stays in `title` alone: once the banner states
 * which project is open, a heading repeating the tool's name would spend the
 * page's one `h1` on the thing the reader is least in doubt about.
 *
 * The Dashboard's real tiles — recent activity, core artifacts, risk summary —
 * arrive with the stories that can populate them. What is here now is the
 * **inventory**, which no document designed: `EXPERIENCE.md` and `DESIGN.md`
 * never mention one and UX-DR15 fixes the surface list at five, so the
 * inventory takes the placeholder tile's slot as an interim rather than as a
 * sixth surface. That is recorded in `deferred-work.md` and in
 * `./inventory.ts`'s header, not presented as the designed shape. The status
 * line Stories 1.1 to 1.3 served in that slot is gone: `Serving. No surface
 * built yet.` stopped being true here.
 *
 * **No font is fetched, and no script is served.** There is no `<link>`, no
 * `@import`, no `@font-face` and no `<script>` in what this module emits. Each
 * typography token names IBM Plex first and falls back to the platform's own
 * faces; refresh is a link, because a page load builds a new snapshot. A page
 * that fetched a font would make the reader's browser talk to a third party,
 * which the no-outbound-network rule forbids outright.
 */

import { STYLESHEET } from './stylesheet.ts';
import { DASHBOARD_HREF, projectHeader } from './chrome.ts';
import { tileGrid } from './components.ts';
import { inventoryTiles, type InventoryView } from './inventory.ts';
import { escapeHtml } from './html.ts';

/** The `<title>`, and the marker a test can look for to know the page is ours. */
export const PAGE_TITLE = 'bmad-dash';

/**
 * The landing surface's name, per EXPERIENCE.md's surface table: a bare
 * invocation opens the Dashboard. The surface is correctly named from this
 * story on, whatever it is yet able to show.
 */
export const SURFACE_TITLE = 'Dashboard';

/**
 * Refuse to inline a stylesheet that could end the `<style>` element early.
 *
 * The stylesheet is built from a static module, so this cannot fire today —
 * which is exactly when a guard is cheap. Inside `<style>` there is no escaping
 * mechanism at all: HTML entities are not decoded there, so a `<` that reached
 * this string could only be handled by refusing to serve it. The check is on
 * `<` rather than on `</style` because the parser's rules for what closes the
 * element are looser than they look.
 */
function inlinable(css: string): string {
  if (css.includes('<')) {
    throw new Error(
      'the stylesheet contains "<", which cannot be escaped inside a <style> element',
    );
  }
  return css;
}

/**
 * The Dashboard surface: its one `h1`, and the inventory's tiles.
 *
 * The heading levels are fixed here and nowhere else: one `h1` naming the
 * surface, and every tile label an `h2` under it. The inventory's rows are list
 * items rather than a third heading level, because DESIGN.md's "a tile that
 * needs two headings is two tiles" makes the family label a tile's only
 * heading.
 */
function dashboard(inventory: InventoryView): string {
  return [
    '<main>',
    `<h1>${escapeHtml(SURFACE_TITLE)}</h1>`,
    tileGrid(inventoryTiles(inventory)),
    '</main>',
  ].join('\n');
}

/**
 * The document to serve for `GET /`.
 *
 * A function of the resolved project root and of the projected inventory, both
 * of which the composition root produced once and passes through the adapter
 * unchanged. The view is **required**, for the reason `projectRoot` is: from
 * this story the Dashboard's content *is* the inventory, so a page rendered
 * without one is not a page — and an argument its owner cannot function without
 * should not be omittable. The adapter composes nothing (AD-2); it carries.
 *
 * It is checked in two places, deliberately, against one definition:
 * `assertProjectRoot` in `./chrome.ts` is called by the HTTP adapter before it
 * binds — so an unrenderable root stops the command rather than throwing inside
 * a request handler — and again by `projectHeader` as a render-layer guard for
 * any future caller that is not the adapter. Two call sites, one rule, so they
 * cannot drift into disagreeing about what a usable root is. An earlier version
 * of this comment claimed a single check while three existed with two different
 * messages, which is why the definition is now shared rather than repeated.
 */
export function renderPage(projectRoot: string, inventory: InventoryView): string {
  return documentShell(projectRoot, DASHBOARD_HREF, dashboard(inventory));
}

/**
 * Everything a served document has that is not its surface: the head, the
 * inlined stylesheet, and the global chrome.
 *
 * Extracted in Story 2.1a, when the artifact view became the second surface
 * this tool serves. `EXPERIENCE.md:59` puts the project header on **every**
 * surface — "it is present on every surface, and it is where snapshot currency,
 * refresh progress, and refresh failure are reported" — and a second surface
 * assembling its own `<!doctype>`, its own `<style>` and its own call to
 * `projectHeader` is how the two drift into disagreeing about what a served
 * page is. One shell, so the chrome cannot be *forgotten* on a later surface
 * rather than deliberately omitted.
 *
 * `refreshHref` is the path of the surface being rendered, passed straight to
 * the header: refresh re-requests *this* surface (`EXPERIENCE.md:161`), so the
 * shell cannot hold a constant for it. Required rather than defaulted to `/`,
 * so a new surface that forgets it is a compile error rather than a control
 * that quietly navigates the reader to the Dashboard.
 *
 * `main` is markup the caller already composed. It is emitted verbatim, which
 * is the one thing this function trusts: every caller is inside `src/render/`,
 * and each builds its surface through `markup` or through `./components.ts`,
 * both of which escape project-derived text. Nothing outside this layer can
 * reach it — the HTTP adapter takes a rendered document and never supplies one.
 */
export function documentShell(projectRoot: string, refreshHref: string, main: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(PAGE_TITLE)}</title>
<style>
${inlinable(STYLESHEET)}</style>
</head>
<body>
${projectHeader(projectRoot, refreshHref)}
${main}
</body>
</html>
`;
}
