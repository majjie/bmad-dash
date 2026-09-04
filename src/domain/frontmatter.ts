/**
 * Top-level scalars, out of a frontmatter block or out of a bare YAML file.
 * Pure, and no library.
 *
 * FR-8's second precedence level asks one question of a document — does its
 * frontmatter declare a `title` or a `type` — and every field that can answer
 * it was measured to be a **zero-indent flat scalar** in every artifact on
 * disk. So this reads exactly that shape and says so; it is not a YAML parser
 * and must not become one.
 *
 * Why not `yaml`: measuring the trade settled it for this level. (This comment
 * used to open by citing "NFR-11's dependency gate", which was never a thing
 * NFR-11 said — it is about telemetry and outbound requests, and a bundled
 * parser opens no socket. Corrected 2026-09-03 with NFR-11's reclassification;
 * the bundle-size measurement below was always the actual reason.)
 * — bundling `yaml` grows `dist/` from about 34KB to about 264KB to buy
 * anchors, tags, merge keys, multi-document streams and flow collections, none
 * of which level 2 reads. **No bundled library is anticipated any more**: this
 * header used to say the first one "still lands with config parsing (FR-10),
 * where nested structure is the point", and FR-10 is now deferred indefinitely,
 * so there is no story queued that needs nested structure. If one ever is, that
 * is the moment to measure the trade again — not a plan this file is waiting on.
 *
 * **Two entry points over one reader**, which is the whole of Story 1.11's
 * change here. `readFrontmatter` reads a leading `---` block; `readUnfenced`
 * reads the same zero-indent scalars out of a file that has no fence at all,
 * which is what `sprint-status.yaml` is (FR-51 needs exactly one scalar out of
 * it, `story_location`). Every rule below already handled that file — its
 * `development_status` sub-map is indented and therefore skipped, its comment
 * header is skipped, a valueless key is declined rather than invented — and the
 * *only* thing standing between them was the opening-fence gate. A second
 * hand-rolled reader beside this one would be free to drift from it, so there
 * is one scan and two doors into it.
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
 * What a run of zero-indent mapping lines yielded.
 *
 * Shared by both entry points, because both answer the same three questions
 * about the same shape and a second copy of them would be two vocabularies for
 * one reading. AD-13's rule lives in the split between `fields` and `skipped`:
 * a key this reader declined is **not** the same fact as a key that was not
 * there, and neither is an empty success.
 */
export interface ScalarBlock {
  /** Top-level flat scalars, in the order they appeared. */
  readonly fields: ReadonlyMap<string, string>;
  /** Top-level keys whose value this reader declines to interpret, in order. */
  readonly skipped: readonly string[];
  /** Keys that appeared more than once; the first occurrence is the one in `fields`. */
  readonly duplicates: readonly string[];
  /**
   * True when a `---` or `...` line stopped the scan.
   *
   * Shared by both doors rather than owned by the fenced one, and that took a
   * correction: `readUnfenced` dropped this field on the argument that
   * "terminated" was a claim about a block it has none of, which left **no
   * caller able to tell that the scan had stopped early at all.** In an
   * unfenced file the same line means a document boundary, and a reader that
   * stops at one and cannot say so is the silent-truncation shape AD-13 exists
   * against. Each door documents what it means by it; neither hides it.
   */
  readonly terminated: boolean;
}

/**
 * What a document's leading frontmatter block yielded.
 *
 * `present` is about the *block*, not about the fields: a document opening with
 * `---` and holding nothing readable has a frontmatter block and no fields,
 * which is a different fact from having no block at all. FR-8 level 2 needs
 * both apart — a document with no frontmatter did not decline to declare a
 * type, it had nowhere to declare one.
 */
export interface FrontmatterBlock extends ScalarBlock {
  /** True when the text opens with a `---` fence. */
  readonly present: boolean;
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
 * The text as lines, with the two invisible things that break a naive split
 * already dealt with.
 *
 * A byte-order mark is invisible and would make an opening fence fail to match,
 * turning a document with frontmatter into one without; a CRLF ending leaves a
 * `\r` on every line, which would end up inside every value.
 */
function linesOf(text: string): string[] {
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  return body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/**
 * Scan `lines` from `from` until a fence or the end, collecting zero-indent
 * scalars.
 *
 * The one scan both entry points use. `terminated` says a fence stopped it,
 * which `readFrontmatter` reports as its block being closed and `readUnfenced`
 * uses for a different purpose: in an unfenced file a `---` line **starts a
 * second YAML document**, and keys after it belong to that document rather than
 * to this one, so the scan stops there too. Reading past it would let a
 * second document's `story_location` answer for the first one's.
 */
function scan(lines: readonly string[], from: number): ScalarBlock {
  const fields = new Map<string, string>();
  const skipped: string[] = [];
  const duplicates: string[] = [];
  let terminated = false;

  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (FENCE.test(line.trimEnd())) {
      terminated = true;
      break;
    }
    // Indentation first. See the header: this is the check that stops a nested
    // `type:` four levels down being read as the document's own declaration,
    // and the same check is what keeps `sprint-status.yaml`'s
    // `development_status` sub-map out of the top-level fields.
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

  return { fields, skipped, duplicates, terminated };
}

/**
 * Read the leading frontmatter block of `text`.
 *
 * Never throws and never returns a partial answer as a whole one: everything
 * it declined to read is named in `skipped`, so a caller can tell "no such
 * field" from "a field this reader does not interpret".
 */
export function readFrontmatter(text: string): FrontmatterBlock {
  const lines = linesOf(text);
  const opening = lines[0];
  if (opening === undefined || opening.trimEnd() !== '---') {
    return {
      present: false,
      terminated: false,
      fields: new Map(),
      skipped: [],
      duplicates: [],
    };
  }
  return { present: true, ...scan(lines, 1) };
}

/**
 * Read the zero-indent scalars of a YAML file that has **no** fence.
 *
 * The entry point Story 1.11 needed and the one gate that was blocking it:
 * `readFrontmatter` returns `present: false` for anything whose first line is
 * not `---`, and `sprint-status.yaml` opens with a block of `#` comments. Every
 * other rule in this file already handles that file correctly, so this is the
 * same scan with the fence requirement removed rather than a second reader.
 *
 * **It is still not a YAML parser and must not become one.** Nested maps stay
 * skipped by the indentation rule \u2014 which is what keeps `development_status`'s
 * per-story statuses out of the top-level fields, and those statuses are Story
 * 2.8's to read, not this reader's \u2014 sequences and flow collections stay
 * declined, and a valueless key stays declined into `skipped` rather than
 * invented as an empty string. That last one is AD-13 applied here: "no such
 * key" and "a key that says nothing" are different answers, and neither is an
 * empty success.
 *
 * `present` is deliberately absent from the return type: there is no block to
 * be present, so a caller cannot read that fact off a shape with no honest
 * value for it. `terminated` **is** present, and here it means the scan stopped
 * at a document boundary rather than at the end of the file. That is the fact
 * an earlier version withheld, leaving a caller unable to tell a complete
 * reading from a truncated one.
 */
export function readUnfenced(text: string): ScalarBlock {
  const lines = linesOf(text);
  // **Start after a leading document-start marker.** This began at line 0
  // unconditionally, and `scan`'s first act is the fence test, so a
  // `sprint-status.yaml` whose first line is `---` terminated before a single
  // key was read and came back with no fields at all. The caller then reported
  // that as "declares no `story_location`" over a file that plainly declared
  // one, which is the empty-success AD-13 forbids, produced by the very reader
  // this story built to keep "nobody said anything" apart from "we could not
  // tell". A leading `---` in YAML *opens* the first document, so its keys are
  // this document's keys and the scan belongs after it.
  //
  // Only `---`, not `...`: a document-*end* marker on the first line means the
  // document is already over, and skipping it would read the next document's
  // keys as this one's. `scan` stops at it and `terminated` says so.
  const opening = lines[0];
  const from = opening !== undefined && opening.trimEnd() === '---' ? 1 : 0;
  return scan(lines, from);
}

/**
 * `text` with its leading frontmatter block removed, or `text` unchanged.
 *
 * **Where a document's body starts, decided once.** Story 2.1b renders an
 * artifact's markdown, and a rendered `---` fence produces an `<hr>` followed
 * by the frontmatter's own keys as a setext heading — the block leaking into
 * the reading surface as content. Finding the closing fence is the *same*
 * question `readFrontmatter` already answers with `terminated`, so it is
 * answered here, against this file's own `linesOf` and `FENCE`, rather than by
 * a second line-splitter in the render layer that would be free to disagree
 * about a BOM, about `\r\n`, or about whether `...` closes a block.
 *
 * The body it returns is rebuilt from `linesOf`, so `\r\n` comes back as `\n`.
 * That is a normalization rather than a loss for the one consumer — a markdown
 * parser treats the two identically — and it is stated because a caller that
 * needed the original bytes would not get them from here.
 *
 * **This is not a third reader and not a step towards a YAML parser.** It
 * interprets nothing: it reads `readFrontmatter`'s two flags and returns a
 * slice of the text it was handed. A block that opened and never closed is
 * returned whole, because a caller shown a truncated document would have no
 * way to tell that from a document that simply began with `---`.
 */
export function bodyAfterFrontmatter(text: string): string {
  const block = readFrontmatter(text);
  if (!block.present || !block.terminated) return text;
  const lines = linesOf(text);
  // From 1, never from 0: line 0 is the opening fence, which `readFrontmatter`
  // has already matched and which `FENCE` would match again.
  for (let index = 1; index < lines.length; index += 1) {
    if (FENCE.test((lines[index] ?? '').trimEnd())) return lines.slice(index + 1).join('\n');
  }
  // Unreachable: `terminated` is set by the same test over the same lines.
  // Answered rather than asserted, because the honest answer to "the fence is
  // not there" is the whole text, which is what an unterminated block gets.
  return text;
}
