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
 *
 * **From Story 1.12 the answer is stronger than a shared function.** The
 * inventory renders a project's own artifact paths and family names, so a
 * forgotten `escapeHtml` is not a lapse in this module's own copy — it is a
 * crafted filename reaching a browser. `markup` below is the tagged template
 * that makes the escaping automatic, and `Markup` is the type a tile now
 * demands, so a raw project string cannot be handed to one at all.
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

/**
 * Markup whose interpolated values were escaped as it was built.
 *
 * A wrapper and not a bare string, and that is the whole of its value: with
 * `TileContent.html` typed `string`, any string in the process could be handed
 * to a tile and emitted verbatim — which was safe only while every caller was
 * this module's own page copy. Story 1.12 renders artifact paths and family
 * names straight off a project the user did not necessarily write, so the type
 * now refuses a raw string and the only way to build one of these is
 * `markup()`, which escapes every value it interpolates.
 *
 * **The constructor is module-private, and the first version's was not.** The
 * review of this story found the hole: the class was exported with a public
 * constructor, so `new Markup(untrustedString)` was *shorter* than the `as`
 * cast the runtime guard in `./components.ts` had been added to catch, and the
 * safety claim stated in three doc comments was simply false. The class is no
 * longer exported; what leaves this module is the `Markup` **type** and the two
 * functions that build one. A caller outside this file can hold and compose a
 * `Markup` and cannot manufacture one.
 *
 * The `token` field is what makes that structural rather than conventional: it
 * is a module-private symbol, so an object literal claiming to be a `Markup`
 * does not typecheck and cannot be forged without importing something this
 * module does not export.
 */
const BUILT_HERE: unique symbol = Symbol('markup built by this module');

class BuiltMarkup {
  readonly html: string;
  readonly [BUILT_HERE]: true;

  constructor(html: string) {
    this.html = html;
    this[BUILT_HERE] = true;
  }

  toString(): string {
    return this.html;
  }
}

/** Markup this module built. The type is public; the constructor is not. */
export type Markup = BuiltMarkup;

/**
 * True for a value this module built.
 *
 * Exported so `./components.ts` can refuse a value that reached it through an
 * `as` cast — the guard the review showed was the *second* line of defence and
 * is now the only one a caller can trip, since the constructor is private.
 */
export function isMarkup(value: unknown): value is Markup {
  return value instanceof BuiltMarkup;
}

/** What may be interpolated into `markup`. */
export type MarkupValue = string | number | Markup | readonly MarkupValue[] | undefined;

/**
 * One interpolated value, as markup.
 *
 * A `Markup` passes through — it was escaped when it was built, and escaping it
 * again would render `&amp;lt;` at the reader. Everything else is escaped: a
 * string because it is the case this exists for, a number because
 * `String(count)` at every call site is noise, an array because a list of rows
 * is the shape most of this file's markup takes, and `undefined` as the empty
 * string so an optional value needs no ternary.
 */
function interpolate(value: MarkupValue): string {
  if (value === undefined) return '';
  if (isMarkup(value)) return value.html;
  if (typeof value === 'number') return escapeHtml(String(value));
  if (typeof value === 'string') return escapeHtml(value);
  // Narrowed by elimination rather than by `Array.isArray`, which narrows a
  // `readonly` array to `any[]` and would put an `as` cast back in the one
  // function whose whole job is that no value escapes escaping.
  //
  // **Joined with a newline, not with nothing**, and that is a defect fix
  // rather than formatting. An array here is a *sequence of nodes* — a list of
  // rows, or a row's own cells — and concatenated with no separator the cells
  // ran together: with styles unavailable, in text extraction and on
  // copy-paste, a row read `prdsFamily directoryNot checked` and two type cells
  // read `Run folderSharded document`. The flex `gap` that separates them
  // visually is not text, so it does not reach any of those three readers.
  return value.map(interpolate).join('\n');
}

/**
 * Build markup with every interpolated value escaped by construction.
 *
 * The tagged-template form is deliberate: "did I escape that one?" is a
 * question a reviewer had to ask at each of nine interpolations in the header,
 * and the answer here is that there is no way to *not* escape one. A value that
 * is already markup — a rendered row, a list of them — arrives as `Markup` and
 * is passed through, which is what lets the escaping be automatic without
 * double-escaping composition.
 *
 * The literal parts of the template are the author's own markup and are not
 * escaped. That is the one thing this function trusts, and it is trustworthy
 * for the reason a template literal is: the parts come from the source text of
 * the call, never from a value.
 */
export function markup(parts: TemplateStringsArray, ...values: readonly MarkupValue[]): Markup {
  let built = parts[0] ?? '';
  for (const [index, value] of values.entries()) {
    built += interpolate(value) + (parts[index + 1] ?? '');
  }
  return new BuiltMarkup(built);
}

/**
 * Substitute a string index template's `<placeholder>`s, refusing an unfilled one.
 *
 * The index spells substituted values `<placeholder>`, so a template is held
 * verbatim and filled here. The throw is the point, and it is
 * `src/cli/suggest.ts`'s own reasoning applied to a page: `<n>` reaching a
 * reader is the visible half of having edited the index and not the call, and
 * markup that ships a literal angle bracket is a defect a reader reports rather
 * than a suite.
 *
 * Substitution happens **before** escaping, never after: the filled sentence is
 * interpolated into `markup` like any other string, so a value carrying `<` is
 * escaped there. Filling an already-escaped sentence would have been the other
 * order and the wrong one — and it is also why the unfilled check below asks
 * which placeholders went unsupplied rather than re-scanning the result, since
 * a substituted value may legitimately contain angle brackets.
 *
 * A second spelling of the helper in `src/cli/suggest.ts`, deliberately: that
 * one is the composition root's and this one is the render layer's, and the
 * layering forbids the render layer importing it. Recorded in
 * `deferred-work.md` rather than resolved by an import that would invert the
 * dependency the spine fixes.
 */
/**
 * A `<placeholder>` as the string index spells them.
 *
 * Wider than the `[a-z]+` this shipped with, which was narrower than its own
 * comment claimed: `<file-name>`, `<n2>` and `<Path>` matched nothing, so such
 * a placeholder was neither substituted nor reported and shipped to a reader as
 * literal text — the single failure this function throws to prevent, arriving
 * through the pattern rather than through a missing value.
 * `test/render/inventory.test.ts` asserts that every placeholder in every index
 * row the surface uses matches this pattern, so the two cannot drift.
 */
const PLACEHOLDER = /<([A-Za-z][A-Za-z0-9_-]*)>/g;

export function fillIndexString(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  const missing: string[] = [];
  const filled = template.replace(PLACEHOLDER, (whole, key: string) => {
    // `Object.hasOwn`, not `values[key]`, and not a truthiness test. A bare
    // index reads the prototype chain, so a template spelling `<constructor>`
    // or `<tostring>` resolved off `Object.prototype` and substituted a
    // function's source into a sentence — found in review. Own-property only,
    // and an own property is used even when it is the empty string, because
    // that is a caller saying "nothing here" rather than a caller forgetting.
    if (!Object.hasOwn(values, key)) {
      missing.push(whole);
      return whole;
    }
    return values[key] ?? '';
  });
  // Checked against what was **not supplied**, not by re-scanning the filled
  // sentence. The scanning form was measured wrong on this project's own data:
  // a substituted path containing `<script>` looks exactly like an unfilled
  // placeholder, so `Stories are at <script>.` threw instead of rendering — a
  // hostile directory name turning a guard into a denial of the whole page.
  const first = missing[0];
  if (first !== undefined) {
    throw new Error(`unfilled placeholder ${first} in ${JSON.stringify(template)}`);
  }
  return filled;
}
