/**
 * Top-level scalars out of a leading frontmatter block. Pure, and no library.
 *
 * FR-8's second precedence level asks one question of a document — does its
 * frontmatter declare a `title` or a `type` — and every field that can answer
 * it was measured to be a **zero-indent flat scalar** in every artifact on
 * disk. So this reads exactly that shape and says so; it is not a YAML parser
 * and must not become one.
 *
 * Why not `yaml`: NFR-11's dependency gate is a deferred decision, and
 * measuring the trade settled it for this level rather than deferring it again
 * — bundling `yaml` grows `dist/` from about 34KB to about 264KB to buy
 * anchors, tags, merge keys, multi-document streams and flow collections, none
 * of which level 2 reads. The first bundled library still lands with config
 * parsing (FR-10), where nested structure is the point.
 *
 * **What it deliberately refuses to interpret**, each recorded rather than
 * silently flattened, because a reader that guesses at a shape it cannot read
 * is worse than one that says it did not read it:
 *
 *   - **Indented lines.** `DESIGN.md`'s frontmatter nests maps four levels
 *     deep and carries an *indented* `type:` key at every one of them. A reader
 *     that ignored indentation would answer "this document declares
 *     `type: '{typography.mono}'`" — a nested token reference read as a family
 *     declaration. Indentation is therefore the first thing checked, not the
 *     last.
 *   - **Block sequences** (`sources:` then `  - …`) and **flow collections**
 *     (`binds: [C1, C2]`). Both are collections; handing one back as a scalar
 *     would let a consumer compare it to a family name and get a plausible
 *     answer from a value that was never a scalar.
 *   - **Block scalars** (`|`, `>`), which continue over following lines.
 *   - **An unterminated quote**, which is a multi-line flow scalar.
 *   - **Anchors, aliases and tags** (`&x`, `*x`, `!!str`), directives, and the
 *     reserved indicators — each of which was previously handed back as though
 *     the indicator were part of an ordinary string.
 *   - **An escape it does not know** (`\u00e9`, `\x41`). Standing an unknown
 *     escape for its own letter turns `caf\u00e9` into `cafu00e9`: a wrong
 *     value where a declined one would at least be visible.
 *   - **Trailing content after a closing quote** (`title: 'x' and more`), which
 *     used to be dropped in silence.
 *
 * What it does handle, because the artifacts on disk contain it: single-quoted
 * scalars with the doubled-quote escape (`'…project''s artifacts…'`, from
 * `ARCHITECTURE-SPINE.md`), double-quoted scalars with the escapes it knows,
 * plain scalars with a trailing `#` comment, comment-only lines, CRLF endings,
 * a leading byte-order mark, and a value containing colons (`url: http://x`).
 *
 * Duplicate keys are **first-wins**, and the repeat is reported. YAML calls a
 * duplicate an error and most parsers take the last; taking the first means a
 * stray later line cannot quietly override a declared identity, and reporting
 * it means the choice is visible rather than buried in a loop.
 */

/** The characters a backslash escape stands for. A `Map`, so no key on `Object.prototype` can answer. */
const ESCAPES = new Map<string, string>([
  ['n', '\n'],
  ['t', '\t'],
  ['r', '\r'],
  ['0', '\0'],
  ['\\', '\\'],
  ['"', '"'],
  ["'", "'"],
  ['/', '/'],
]);

/**
 * A key this reader will accept.
 *
 * Every key measured on disk is a bare word in this shape. A quoted or
 * complex key is not rejected loudly — it simply is not one of the two fields
 * level 2 reads, and a line that is not a mapping at all (a sequence item, a
 * stray sentence) must not become a field either.
 */
const KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

/** A closing fence: either of YAML's two, since both appear in the wild. */
const FENCE = /^(?:---|\.\.\.)$/;

/**
 * What a document's leading frontmatter block yielded.
 *
 * `present` is about the *block*, not about the fields: a document opening with
 * `---` and holding nothing readable has a frontmatter block and no fields,
 * which is a different fact from having no block at all. FR-8 level 2 needs
 * both apart — a document with no frontmatter did not decline to declare a
 * type, it had nowhere to declare one.
 */
export interface FrontmatterBlock {
  /** True when the text opens with a `---` fence. */
  readonly present: boolean;
  /** True when an opened block was closed. An unterminated block is reported, not guessed at. */
  readonly terminated: boolean;
  /** Top-level flat scalars, in the order they appeared. */
  readonly fields: ReadonlyMap<string, string>;
  /** Top-level keys whose value this reader declines to interpret, in order. */
  readonly skipped: readonly string[];
  /** Keys that appeared more than once; the first occurrence is the one in `fields`. */
  readonly duplicates: readonly string[];
}

/**
 * A scalar that was read, or a value shape this reader declines.
 *
 * `end` is the index just past the closing quote, so the caller can check what
 * follows it. Trailing content used to be dropped in silence — `title: 'x' and
 * more` came back as `x` — which is a *guess* dressed as a reading, and the one
 * thing this file's header promises it does not do.
 */
type Scalar =
  | { readonly ok: true; readonly text: string; readonly end: number }
  | { readonly ok: false };

const DECLINED: Scalar = { ok: false };

/**
 * A single-quoted scalar, with `''` standing for one quote.
 *
 * The escape `ARCHITECTURE-SPINE.md` actually uses, and the one a naive
 * "slice between the quotes" read gets wrong: it would end the value at the
 * first half of the doubled pair and drop the rest of the sentence.
 */
function singleQuoted(raw: string): Scalar {
  let text = '';
  let index = 1;
  while (index < raw.length) {
    if (raw[index] === "'") {
      if (raw[index + 1] === "'") {
        text += "'";
        index += 2;
        continue;
      }
      return { ok: true, text, end: index + 1 };
    }
    text += raw[index] ?? '';
    index += 1;
  }
  // Unterminated: the scalar continues onto lines this reader does not join.
  return DECLINED;
}

/**
 * A double-quoted scalar, with the escapes in `ESCAPES` and no others.
 *
 * **An escape this reader does not know is declined, not guessed at.** It used
 * to stand for the character it preceded, which silently mangles exactly the
 * YAML the header says is out of scope: `"caf\u00e9"` came back as `cafu00e9`
 * and `"a\x41b"` as `ax41b`. A value that is wrong is worse than a value that
 * is reported as unread, because only the second one is visible.
 */
function doubleQuoted(raw: string): Scalar {
  let text = '';
  let index = 1;
  while (index < raw.length) {
    const char = raw[index];
    if (char === '\\') {
      const escaped = raw[index + 1];
      if (escaped === undefined) return DECLINED;
      const stands = ESCAPES.get(escaped);
      if (stands === undefined) return DECLINED;
      text += stands;
      index += 2;
      continue;
    }
    if (char === '"') return { ok: true, text, end: index + 1 };
    text += char ?? '';
    index += 1;
  }
  return DECLINED;
}

/**
 * A plain scalar's text, with a trailing comment removed.
 *
 * A `#` only starts a comment where whitespace precedes it, which is what
 * keeps `url: http://x#y` and `title: C#` intact — the mistake a bare
 * `split('#')` makes.
 */
function plain(raw: string): Scalar {
  let end = raw.length;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== '#') continue;
    const before = raw[index - 1];
    if (before === ' ' || before === '\t') {
      end = index;
      break;
    }
  }
  return { ok: true, text: raw.slice(0, end).trimEnd(), end };
}

/**
 * Indicators that mean the value is not a plain scalar this reader can read.
 *
 * `[` `{` flow collections and `|` `>` block scalars are shapes rather than
 * scalars. `*` and `&` are an alias and an anchor, `!` a tag, `%` a directive,
 * and `@` and a backtick are reserved: the header lists anchors and tags among
 * what this does not read, and it used to hand `*anchor` and `!!str x` back as
 * if they were ordinary strings. `#` means the value is a comment and the field
 * has no inline value at all.
 */
const NOT_A_PLAIN_SCALAR = new Set(['[', '{', '|', '>', '*', '&', '!', '%', '@', '`', '#']);

/** The value half of a mapping line, or a decision not to interpret it. */
function scalarOf(raw: string): Scalar {
  const value = raw.trim();
  if (value === '') return DECLINED;
  const first = value[0];
  if (first === undefined || NOT_A_PLAIN_SCALAR.has(first)) return DECLINED;
  if (first === "'" || first === '"') {
    const quoted = first === "'" ? singleQuoted(value) : doubleQuoted(value);
    if (!quoted.ok) return quoted;
    // Only whitespace, or a comment, may follow the closing quote. Anything
    // else means the line is not one quoted scalar and dropping the remainder
    // would report a fragment as the whole value.
    const after = value.slice(quoted.end).trim();
    if (after !== '' && !after.startsWith('#')) return DECLINED;
    return quoted;
  }
  return plain(value);
}

/**
 * Read the leading frontmatter block of `text`.
 *
 * Never throws and never returns a partial answer as a whole one: everything
 * it declined to read is named in `skipped`, so a caller can tell "no such
 * field" from "a field this reader does not interpret".
 */
export function readFrontmatter(text: string): FrontmatterBlock {
  const fields = new Map<string, string>();
  const skipped: string[] = [];
  const duplicates: string[] = [];

  // A byte-order mark is invisible and would make the opening fence fail to
  // match, turning a document with frontmatter into one without.
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const lines = body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));

  const opening = lines[0];
  if (opening === undefined || opening.trimEnd() !== '---') {
    return { present: false, terminated: false, fields, skipped, duplicates };
  }

  let terminated = false;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (FENCE.test(line.trimEnd())) {
      terminated = true;
      break;
    }
    // Indentation first. See the header: this is the check that stops a nested
    // `type:` four levels down being read as the document's own declaration.
    if (line.startsWith(' ') || line.startsWith('\t')) continue;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // A mapping needs `key:` at end of line or `key: value`. `key:value` is a
    // plain scalar in YAML, not a mapping, and reading it as one would invent
    // a field the document does not have.
    const colon = trimmed.indexOf(':');
    if (colon < 1) continue;
    const key = trimmed.slice(0, colon);
    const rest = trimmed.slice(colon + 1);
    if (rest !== '' && !rest.startsWith(' ')) continue;
    if (!KEY.test(key)) continue;

    if (fields.has(key) || skipped.includes(key)) {
      if (!duplicates.includes(key)) duplicates.push(key);
      continue;
    }

    const scalar = scalarOf(rest);
    if (!scalar.ok) {
      skipped.push(key);
      continue;
    }
    fields.set(key, scalar.text);
  }

  return { present: true, terminated, fields, skipped, duplicates };
}
