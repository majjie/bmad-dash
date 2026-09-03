/**
 * Global chrome: the project header, present on every surface.
 *
 * It is not a tile. EXPERIENCE.md places it outside the dashboard grid because
 * it answers a question every surface raises — *which project am I looking at,
 * and how current is this?* — and a tile would make that answer specific to one
 * page.
 *
 * DESIGN.md defines **no token set for it.** Its ten sets are components, and
 * chrome is not one of them, so the header's values come from the scalar groups
 * directly: it sits on the page ground it is already on, and its three lines
 * take the `title`, `mono` and `mono-badge` roles. That decision is recorded in
 * the spec's Design Notes; the styling itself is in `./stylesheet.ts` with the
 * rest of the sheet.
 *
 * **Four of the six elements UX-DR14 asks for.** Snapshot currency, refresh
 * progress and refresh failure all describe a snapshot, and there is no
 * snapshot until Epic 3 — reporting them now would mean inventing states to
 * report. Git availability is present but unexamined: the probe is its own
 * story, so the signal reads `Not checked`, which is the string index's own
 * wording for a signal that was never looked at. That is deliberately not the
 * same as omitting it. A signal absent from the page is indistinguishable from
 * a signal that does not exist, and telling those two apart is the entire
 * reason the four-state vocabulary exists.
 *
 * **The refresh control is a link to the surface it is on**, which from Story
 * 2.1a is a required argument rather than the constant `/` — see
 * `DASHBOARD_HREF`. A page load builds a new
 * snapshot — genuinely, from Story 1.12 on: the HTTP adapter holds a supplier
 * and calls it per `GET /`, so following this link re-walks the project. (For
 * one story it did not, and this comment said it did; the review of 1.12 found
 * the three places making that claim over a snapshot frozen at bind time.) Only
 * `GET` and `HEAD` are served, and no client router may own a URL — so refresh
 * is navigation, and the page needs no JavaScript to offer it.
 * It is unstyled beyond the document's link rule: `button-primary` is the
 * component DESIGN.md assigns to a surface's single main action, and that
 * component belongs to a later story.
 */

import { basename, isAbsolute } from 'node:path';

import { markup } from './html.ts';

/**
/**
 * The one place a project root is judged usable, shared by the render layer and
 * the HTTP adapter.
 *
 * It lives here rather than in `src/domain/` because the check needs
 * `isAbsolute`, and the domain is frozen at zero outgoing imports. One
 * definition with two callers, so the two cannot drift into disagreeing about
 * what a usable root is — which they briefly did: the adapter carried a
 * `typeof` guard this function lacked, and a doc comment claimed there was only
 * one check while there were three.
 *
 * Returns the value so a caller can use it as a narrowing assertion.
 */

/**
 * `Not checked` — the string index's wording for a signal never examined.
 *
 * Held as a constant so `test/render/chrome.test.ts` can assert it against
 * EXPERIENCE.md's own table rather than against a second copy of the same
 * belief. A string index that nothing reads is a style guide, not a contract.
 */
export const SIGNAL_NOT_CHECKED = 'Not checked';

/** Caption for the git signal. Label-shaped: initial capital, no period. */
export const GIT_SIGNAL_LABEL = 'Git:';

/** The refresh control's label. Label-shaped. */
export const REFRESH_LABEL = 'Refresh';

/**
 * The Dashboard's own path — what the refresh control points at *on the
 * Dashboard*, and nowhere else.
 *
 * **It was `REFRESH_HREF`, and the name was the defect.** Refresh means "this
 * surface, requested again" (`EXPERIENCE.md:161`: the current surface "is never
 * replaced under the user"; `:153`: the Artifact view "stays on its snapshot"),
 * so a single constant could only be right while there was one surface. Story
 * 2.1a is the second, and a `/` in its header would have navigated the reader
 * off the artifact they were reading. `deferred-work.md` recorded the fix
 * against Story 1.3 and named the story that creates the second surface as the
 * one to make it, "since that story can actually test it" — this is that story.
 *
 * The target is now a **required argument** to `projectHeader` rather than a
 * default, so a third surface cannot inherit the Dashboard's path by omission.
 */
export const DASHBOARD_HREF = '/';

/**
 * The project header.
 *
 * `projectRoot` is the absolute path the composition root resolved once, passed
 * through unchanged. The display name is `basename` of it — a pure string
 * projection, not a second resolution: it touches no filesystem, canonicalizes
 * nothing and discovers nothing, so the rule that identity is resolved exactly
 * once still holds.
 *
 * A root that is missing, empty or relative throws rather than rendering. A
 * header showing a blank path, or one relative to whatever directory happened
 * to be current, is worse than no page at all — every later surface resolves
 * artifact paths against this value, so a wrong one here is wrong everywhere
 * and looks authoritative while it is.
 *
 * What is *not* checked here, and why that is now safe: existence,
 * directory-ness and canonical form. Story 1.5 moved all three upstream — the
 * composition root recognizes the project before the socket binds, and
 * `StartServerOptions.projectRoot` is a `CanonicalPath`, so by the time a root
 * reaches this function the type says it came from that recognition. This
 * function keeps its own absoluteness check as the render layer's guard for a
 * caller the type system does not reach, which is the same division as the
 * server's runtime check.
 */
export function assertProjectRoot(projectRoot: unknown): string {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new Error('the project header needs the resolved project root; it was empty or absent');
  }
  if (!isAbsolute(projectRoot)) {
    throw new Error(
      `the project root must be absolute, resolved once in the composition root: got "${projectRoot}"`,
    );
  }
  return projectRoot;
}

export function projectHeader(projectRoot: string, refreshHref: string): string {
  assertProjectRoot(projectRoot);
  // A blank target would render `href=""`, which resolves to the current URL in
  // a browser and so happens to work — and would hide a caller that forgot to
  // say which surface it is. Refused for the reason the root is: a control that
  // works by accident is one nothing can hold to a contract.
  if (refreshHref.trim() === '') {
    throw new Error('the project header needs the path of the surface it is on; it was empty');
  }

  // `basename('/')` is the empty string, and a filesystem root is a legitimate
  // if unusual target. Falling back to the path keeps the header from rendering
  // a nameless project.
  const name = basename(projectRoot) === '' ? projectRoot : basename(projectRoot);

  // Built through `markup` rather than by concatenation with a remembered
  // `escapeHtml` at each of four interpolations. Story 1.12 introduced the
  // tagged template so a tile's content could not be handed raw project text,
  // and its review pointed out that the header — the *original* place project
  // data becomes markup, and the reason `./html.ts` exists — was left outside
  // it. Same output, and now the escaping is not a call site's responsibility.
  return markup`<header class="project-header">
<p class="project-name">${name}</p>
<code class="project-path">${projectRoot}</code>
<p class="project-signal">${`${GIT_SIGNAL_LABEL} ${SIGNAL_NOT_CHECKED}`}</p>
<a class="project-refresh" href="${refreshHref}">${REFRESH_LABEL}</a>
</header>`.html;
}
