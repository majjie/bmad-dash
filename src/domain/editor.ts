/**
 * The URL that opens one artifact in the reader's editor — FR-24's second exit.
 *
 * A pure function from an **absolute** path to an href, and that shape is the
 * whole design. Everything downstream of the href is unverifiable here: this
 * suite has no browser and no editor, so what happens after a click cannot be
 * asserted. What *can* be asserted is that the href is exact, absolute and
 * correctly encoded — which is why the formatter lives in the pure layer, where
 * `test/domain/editor.test.ts` reaches it with no server, no filesystem and no
 * page. `src/render/` would have been the other candidate and is the wrong one:
 * it would widen a layer boundary that retrospective action item 13 already
 * records as unenforced, for a function that needs nothing the render layer has.
 *
 * **The editor is hardcoded, and that is recorded rather than glossed.** One
 * scheme, `vscode://file/…`, chosen because it is the editor this project is
 * developed in and because FR-10's configuration file is deferred indefinitely
 * — so there is nowhere for a preference to live and inventing one would be
 * this story adding config surface it was told not to. A reader on another
 * editor gets a link that does not resolve; the *path text* beside it is the
 * fact they need, which is why the path is on the surface as visible,
 * selectable text and not only as this href.
 *
 * **It takes an absolute path and knows nothing about project roots.** The join
 * from a project-relative row path to an absolute one is `src/render/artifact.ts`'s,
 * because the root is that function's own argument and a root is not something a
 * URL formatter should learn about. Given a relative path this refuses rather
 * than formatting `vscode://file/rel/ative` — an href that looks right and opens
 * the wrong file, or nothing.
 *
 * **This is an encoder, not a sanitizer**, on exactly `./url.ts`'s reasoning:
 * percent-encoding is a bijection, so a path with a space, a `#`, a `?`, a `%`
 * or a non-ASCII character survives it intact. Nothing here opens anything, so
 * there is no name to vouch for and nothing to refuse on the filesystem's
 * behalf — `src/adapters/fs/segments.ts` is where refusal belongs and it refuses
 * for the opposite reason.
 *
 * Zero imports, like every module in this layer, which the purity gate reads and
 * `test/architecture.test.ts` asserts as an exactly-empty specifier list.
 * `encodeURIComponent` is a global, so the gate is satisfied in substance as
 * well as in letter: it touches no filesystem, no clock and no network. The
 * consequence is that **all path work here is string work** — there is no
 * `node:path` to reach for, and that is deliberate rather than inconvenient,
 * because a path arriving here has already been through
 * `src/adapters/fs/paths.ts`'s canonicalization.
 */

/** The one scheme and authority an artifact is opened under. */
export const EDITOR_URL_PREFIX = 'vscode://file';

/**
 * Whether `path` is absolute, asked of a string with no platform to consult.
 *
 * Two shapes, because canonical paths arrive in the platform's own spelling and
 * this layer cannot import `node:path` to ask which platform that is: a leading
 * `/`, and a drive-shaped prefix (`C:\` or `C:/`). Nothing else counts —
 * notably not a bare `C:` with no separator, which names a drive-relative path
 * on Windows and is therefore exactly as relative as `sub/dir`.
 *
 * **A UNC share is absolute, and the earlier claim that it could not arise was
 * wrong.** This block previously said `canonical` "resolves through the
 * platform's own resolver" so no caller could produce one. `canonical` is
 * `resolve()` followed by `realpathSync.native`, and neither converts
 * `\\server\share` into a drive-lettered path — so a project opened from a
 * network share reached here unrecognised, `editorUrl` threw, and the throw
 * landed in the HTTP adapter's `catch`: **every** artifact page answered 500
 * while the Dashboard kept working. Measured 2026-09-04. It is pure string
 * logic, so it is decidable and testable on this Linux-only suite rather than
 * blocked on a Windows run.
 */
function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
}

/**
 * Whether a path names a UNC host, whose **two** leading separators are part of
 * the address rather than a doubled separator to squeeze.
 *
 * `//server/share` and `\\server\share` are the same location. Dropping one
 * slash turns the host into an ordinary path segment and the href then names a
 * different place while still looking valid — which is why this is separated
 * from the empty-segment squeeze below rather than folded into it.
 */
function isUncPath(path: string): boolean {
  return path.startsWith('//') || path.startsWith('\\\\');
}

/**
 * Which characters separate this path's segments.
 *
 * A drive-shaped path is a Windows path, where both `\` and `/` separate and
 * neither can appear inside a name. **A UNC path is a Windows path too**, and
 * for the same reason — added 2026-09-04, because recognising `\\server\share`
 * as absolute without also splitting its backslashes escaped them into the
 * href: `vscode://file//%5C%5Cserver%5Cshare%5C…`, one opaque segment naming
 * nothing. The two rules have to move together.
 *
 * Everything else is treated as POSIX, where `/` alone separates and a
 * **backslash is a legal character in a filename** — so splitting on it there
 * would break one name into two segments and produce an href that opens the
 * wrong thing. `./url.ts` makes the same distinction for the same reason: "a
 * backslash, a colon or a drive letter *is* allowed through, because each is a
 * legal character in a POSIX filename".
 */
function splitSegments(path: string): readonly string[] {
  const windowsShaped = /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\');
  return windowsShaped ? path.split(/[\\/]/) : path.split('/');
}

/**
 * The URL that opens one artifact in the reader's editor.
 *
 * Every segment goes through `encodeURIComponent`, which escapes `/`, `?`, `#`,
 * `%`, `&`, a space and every non-ASCII character while leaving the unreserved
 * set — all of which are legal in a URL path segment. It is injective, so the
 * whole path survives and decodes back to exactly what it came from. A Windows
 * drive letter's colon is escaped to `%3A` along with everything else rather
 * than special-cased back: `:` is legal in a path segment but is reserved in the
 * scheme and authority, and an editor parsing the URI decodes the escape, so
 * escaping it costs nothing and keeps the encoder one rule rather than two.
 *
 * **Empty segments are dropped, and this is the one place this module
 * normalizes.** `//a/b` and `/a/b/` name the same file as `/a/b` on every
 * platform, and `canonical` never emits either — so a doubled or trailing
 * separator is squeezed rather than refused, because the result is an *address
 * to open* and not, as in `./url.ts`, an identity to key rows by. A path that
 * is nothing but separators leaves no segment at all and is refused: it would
 * render `vscode://file/`, which is a control that looks like it works and goes
 * nowhere — the failure `./components.ts`'s empty-`href` guard exists for.
 *
 * Throws rather than repairs for the two shapes that are not paths to a file,
 * on `./url.ts`'s own terms: a throw reaches the HTTP adapter's `catch` and
 * becomes a 500 the reader can report, which is better than an href that lies
 * about where it goes.
 */
export function editorUrl(absolutePath: string): string {
  if (absolutePath === '') throw new Error('an editor URL needs a path; it was empty');
  if (!isAbsolutePath(absolutePath)) {
    throw new Error(`an editor URL is built from an absolute path, not "${absolutePath}"`);
  }
  const segments = splitSegments(absolutePath).filter((segment) => segment !== '');
  if (segments.length === 0) {
    throw new Error(`"${absolutePath}" is separators alone and names no file to open`);
  }
  // A UNC path keeps both leading separators: the first names the authority
  // component, the second begins its path. Squeezing them the way an ordinary
  // doubled separator is squeezed would make the host a path segment, so the
  // href would name a different location and still look valid.
  const authority = isUncPath(absolutePath) ? '/' : '';
  return `${EDITOR_URL_PREFIX}/${authority}${segments.map(encodeURIComponent).join('/')}`;
}
