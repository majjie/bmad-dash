/**
 * AD-18's URL grammar: how an artifact — and a section of one — is addressed.
 *
 * The spine says the grammar "is defined once and owned by the server", and
 * until this module existed no document anywhere wrote it down. It is written
 * here, in the pure layer, because two layers need it and neither may import
 * the other: `src/render/` builds the link a row carries, and
 * `src/adapters/http/` parses the request that link produces. A grammar spelled
 * twice is two grammars.
 *
 * The shapes, and they are the whole of it:
 *
 *   - `/artifact/<project-relative path>`
 *   - `/artifact/<project-relative path>/section/<id>`
 *
 * **The identity is the project-relative path, and that is not a convenience.**
 * The spine keys an artifact by its resolved absolute path and says slugs are
 * never identities. The resolved path cannot reach the render layer — an
 * asserted importer set stops `src/adapters/fs/paths.ts` at the composition
 * root — but the relative path is its faithful proxy: `src/adapters/fs/walk.ts`
 * keys its `seen` map on the resolved real path, so two spellings of one file
 * never both become rows. `relative` is unique *by construction*, which is what
 * an identity has to be.
 *
 * **This is an encoder, not a sanitizer, and the two are opposites.**
 * `src/adapters/fs/segments.ts` is NFR-17's filesystem half and it *refuses*
 * rather than repairs; it must, because a name it cannot vouch for must not be
 * opened. Nothing here opens anything, and the requirement is the mirror image:
 * percent-encoding is a bijection, so every distinct path gets a distinct URL
 * and every URL decodes back to exactly the path it came from. A lossy
 * transform would be a defect rather than a nicety — two reviews recorded that
 * sanitizing collapses `spec-my/thing`, `spec-my thing` and `spec-my-thing`
 * into one string, and in a URL that means one permalink addressing two
 * artifacts. So none of `segments.ts`'s twelve rules is reused here: Windows
 * device names, the leading-dot rule and the byte limits are facts about
 * filesystems and mean nothing to a URL.
 *
 * **Nothing here resolves anything.** `parseArtifactUrl` returns a *key*, and
 * the caller looks that key up in the snapshot's own rows. A path that is not a
 * row is a 404. That is what makes traversal structurally impossible rather
 * than defended against: `..` normalizes away, and whatever it leaves behind
 * either names a row or names nothing — it can never name a file, because no
 * filesystem is consulted at any point.
 *
 * Zero imports, like every module in this layer. `encodeURIComponent` and
 * `decodeURIComponent` are globals, so the purity gate — which reads imports —
 * is satisfied in substance and not only in letter: neither touches a
 * filesystem, a clock or a network.
 */

/** The one route prefix an artifact is addressed under. */
export const ARTIFACT_URL_PREFIX = '/artifact';

/**
 * The literal segment separating an artifact's path from a section id.
 *
 * A word rather than a delimiter character, because every delimiter that is
 * legal in a filename is a delimiter that cannot separate one. `section` is a
 * legal *segment*, so `encodeSegment` escapes a path segment that would spell
 * it — see there. That escape is what keeps the grammar unambiguous without
 * making it lossy.
 */
export const SECTION_MARKER = 'section';

/** What a URL names: one artifact, and optionally one section of it. */
export interface ArtifactTarget {
  /** The project-relative, `/`-separated path to look up in the snapshot. */
  readonly path: string;
  /**
   * The section id, or `undefined` for the artifact itself.
   *
   * Carried because AD-18 fixes the grammar for artifacts **and** sections and
   * the spine lists it as not deferred. Nothing derives an id yet — that is
   * Story 2.9 — so a caller today parses the shape and resolves the artifact.
   */
  readonly section: string | undefined;
}

/**
 * One path segment, encoded so it cannot be mistaken for grammar.
 *
 * `encodeURIComponent` escapes `/`, `?`, `#`, `%`, `&`, a space and every
 * non-ASCII character, and leaves the unreserved set plus `!'()*` — all of
 * which are legal in a path segment. It is injective, so two segments never
 * encode alike.
 *
 * The one thing it does not do is protect the grammar's own vocabulary: a
 * directory genuinely called `section` would encode to the marker itself and
 * `docs/section/x.md` would read as artifact `docs`, section `x.md`. So such a
 * segment has its first byte percent-escaped — `%73ection` — which decodes back
 * to `section` and therefore keeps the round trip exact while leaving no bare
 * marker in the artifact half of a URL.
 */
function encodeSegment(segment: string): string {
  const encoded = encodeURIComponent(segment);
  return encoded === SECTION_MARKER ? `%73${encoded.slice(1)}` : encoded;
}

/**
 * A project-relative path, checked and split.
 *
 * Throws rather than repairs, which is this module's one refusal and is not a
 * contradiction of the header: the *encoder* is total over the paths the walk
 * produces, and these three shapes are not among them. `WalkEntry.relative` is
 * `/`-separated, never absolute, never empty and never carries a `.` or `..`
 * segment, so each of these is a defect upstream rather than an input to
 * handle. Encoding one anyway would be worse than failing: `.` and `..`
 * normalize away on the way back, so the URL would not round-trip and the
 * bijection this module is built on would quietly be false.
 *
 * A throw here reaches the HTTP adapter's own `catch` and becomes a 500 the
 * reader can report, which is how `src/render/inventory.ts` already treats a
 * verdict the authority cannot have produced.
 */
function pathSegments(path: string): readonly string[] {
  if (path === '') throw new Error('an artifact URL needs a project-relative path; it was empty');
  if (path.startsWith('/')) {
    throw new Error(`an artifact URL is built from a project-relative path, not "${path}"`);
  }
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment === '') throw new Error(`"${path}" has an empty path segment`);
    if (segment === '.' || segment === '..') {
      throw new Error(`"${path}" has a dot segment, which no walk entry carries`);
    }
  }
  return segments;
}

/** The URL that opens one artifact. */
export function artifactUrl(path: string): string {
  return `${ARTIFACT_URL_PREFIX}/${pathSegments(path).map(encodeSegment).join('/')}`;
}

/**
 * The URL that opens one artifact at one section.
 *
 * The section id is encoded as a segment like any other, and is *not* given the
 * marker escape: it sits after the marker, where nothing can be mistaken for
 * it.
 */
export function sectionUrl(path: string, section: string): string {
  if (section === '') throw new Error('a section URL needs a section id; it was empty');
  return `${artifactUrl(path)}/${SECTION_MARKER}/${encodeURIComponent(section)}`;
}

/**
 * RFC 3986 §5.2.4, over a relative path's segments.
 *
 * `.` is dropped, `..` removes the segment before it, and a `..` with nothing
 * left to remove is dropped too. That last clause is where confinement would
 * live in a filesystem resolver and where it deliberately does not live here:
 * the result is a *lookup key*, and a key that climbed past the root simply
 * names no row. Escaping is impossible because nothing is resolved, not
 * because this function refuses.
 *
 * **An empty segment is dropped as well, which RFC 3986 keeps.** The RFC is
 * normalizing a URI path, where `//` is meaningful; this is producing a key to
 * compare against `WalkEntry.relative`, which never holds an empty segment. So
 * `//` and a leading `/` — the latter reachable through `%2f` — would otherwise
 * produce keys shaped like nothing the walk can report, including one that
 * *looks* absolute. Dropping them loses nothing: no row is reachable only
 * through an empty segment, so no two rows are collapsed onto one key.
 */
function normalizeSegments(segments: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out;
}

/** Trailing empty segments, so `a/` and `a//` name the same thing as `a`. */
function withoutTrailingEmpties(segments: readonly string[]): readonly string[] {
  const out = [...segments];
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return out;
}

/**
 * Percent-decoding that answers `undefined` instead of throwing.
 *
 * `decodeURIComponent` throws a `URIError` on a malformed escape (`%zz`, a
 * truncated `%e0`, a lone surrogate), and a malformed URL is an ordinary
 * request from the network rather than a defect in this process. It becomes a
 * miss, which becomes the same 404 as any other unknown path.
 */
function decodeOrUndefined(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}

/**
 * Parse a request path into the artifact — and section — it names, or
 * `undefined` when it names neither.
 *
 * **Decode first, then normalize, and the order is stated rather than
 * inferred.** RFC 3986 treats `%2e%2e` as an ordinary segment and only a
 * literal `..` as a dot segment, which would leave `%2e%2e%2f` un-normalized
 * and reaching the lookup as itself. Here it is decoded first, so every
 * spelling of a traversal collapses to the same key before anything looks at
 * it. That costs nothing in fidelity: no filename can contain `/`, and none can
 * be `.` or `..`, so no real artifact path is changed by the normalization —
 * and `artifactUrl` refuses to build a URL for a path that would be.
 *
 * The section marker is found in the **raw** segments, before decoding, which
 * is the other half of `encodeSegment`'s escape: a path segment spelling
 * `section` arrives as `%73ection` and cannot be read as the marker, while the
 * marker itself is never percent-encoded.
 */
export function parseArtifactUrl(requestPath: string): ArtifactTarget | undefined {
  // A request-target never carries a fragment and this server already strips
  // the query, but both are cut here so the grammar is total over whatever it
  // is handed rather than correct only for its current caller.
  const withoutFragment = requestPath.split('#')[0] ?? '';
  const target = withoutFragment.split('?')[0] ?? '';
  if (target !== ARTIFACT_URL_PREFIX && !target.startsWith(`${ARTIFACT_URL_PREFIX}/`)) {
    return undefined;
  }
  const raw = withoutTrailingEmpties(target.slice(ARTIFACT_URL_PREFIX.length + 1).split('/'));

  const marker = raw.indexOf(SECTION_MARKER);
  // Exactly one segment after the marker, or this is not a section URL at all:
  // `/artifact/a/section` names no section and `/artifact/a/section/b/c` names
  // no shape this grammar has. Neither is repaired into something adjacent.
  if (marker !== -1 && raw.length - marker !== 2) return undefined;
  const rawPath = marker === -1 ? raw : raw.slice(0, marker);
  const rawSection = marker === -1 ? undefined : raw[marker + 1];

  const decoded = decodeOrUndefined(rawPath.join('/'));
  if (decoded === undefined) return undefined;
  const path = normalizeSegments(decoded.split('/')).join('/');
  if (path === '') return undefined;

  if (rawSection === undefined) return { path, section: undefined };
  const section = decodeOrUndefined(rawSection);
  if (section === undefined || section === '') return undefined;
  return { path, section };
}
