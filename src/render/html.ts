/**
 * Escaping, for the one place project data becomes markup.
 *
 * Every string the header shows comes from the filesystem: a directory's name
 * and its absolute path. A path is not a safe string — a directory can be
 * called `"><script>`, and nothing stops a repository from containing one — so
 * a path interpolated raw into the document is script injection with the
 * project as the vector. The tool is pointed at projects the user did not
 * necessarily write, including ones just pulled from a remote, which is exactly
 * the case the read-only promise is meant to make safe.
 *
 * Escaped here rather than at each call site, because "did I escape that one?"
 * is not a question a reviewer should have to ask nine times.
 */

/** The five characters that change meaning inside markup or an attribute. */
const ESCAPES = new Map<string, string>([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

/**
 * `value` as text safe in element content and in a quoted attribute.
 *
 * `&` is replaced first by virtue of being in the same pass: a two-pass
 * implementation that replaced `<` before `&` would turn `&lt;` into
 * `&amp;lt;`, so the single regex is the correctness argument, not a
 * micro-optimisation.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES.get(character) ?? character);
}
