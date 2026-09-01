/**
 * The served document.
 *
 * It lives here and not in the HTTP adapter because AD-2 puts document HTML in
 * `src/render/`: the adapter's job is binding, validating `Host` and choosing a
 * status code, and a page held as a constant inside it was a second job that
 * would only grow. The adapter now serves what this module produces, and every
 * later surface is added here rather than there.
 *
 * The page is still the Story 1.1 placeholder in content — one heading and one
 * line of status. Story 1.2 gives it the token layer and nothing else: no
 * component, no chrome, no client-side JavaScript. What it does prove is that
 * the tokens reach a browser, on the graphite ground, with the type roles
 * applied.
 *
 * **No font is fetched.** There is no `<link>`, no `@import` and no
 * `@font-face` in what this module emits, because each typography token names
 * IBM Plex first and then falls back to the platform's own faces. A page that
 * fetched a font would make the reader's browser talk to a third party, which
 * the no-outbound-network rule forbids outright.
 */

import { STYLESHEET } from './stylesheet.ts';

/** The `<title>`, and the marker a test can look for to know the page is ours. */
export const PAGE_TITLE = 'bmad-dash';

/**
 * Terse and technical, per the voice rule: state the fact, do not apologise.
 * Sentence-shaped, so it takes a period.
 */
export const PAGE_STATUS_LINE = 'Serving. No surface built yet.';

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
 * The document, built once.
 *
 * `lang` is declared so a screen reader picks a voice. `color-scheme` is on
 * `:root` in the stylesheet rather than in a meta tag, so the polarity travels
 * with the tokens. One `h1`, inside `main`: the banner and navigation landmarks
 * arrive with the global header in Story 1.3, and inventing empty ones now
 * would be chrome this story is told not to build.
 */
const DOCUMENT = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${PAGE_TITLE}</title>
<style>
${inlinable(STYLESHEET)}</style>
</head>
<body>
<main>
<h1>${PAGE_TITLE}</h1>
<p>${PAGE_STATUS_LINE}</p>
</main>
</body>
</html>
`;

/**
 * The document to serve for `GET /`.
 *
 * A function rather than the bare constant because every later surface is a
 * function of the scan, and the adapter should be calling render from the
 * outset rather than being rewritten when the first real page arrives.
 */
export function renderPage(): string {
  return DOCUMENT;
}
