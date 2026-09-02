/**
 * AD-10's first check: one sanitizer over a path segment derived from content.
 *
 * AD-10 names **two** checks — "every path segment derived from project content
 * passes one sanitizer before use, and every resolved filesystem path is
 * confinement-checked against the one permitted root (AD-9) before it is read"
 * — and only the second existed. `canonical` in `paths.ts` resolves `..` before
 * it brands a path, so traversal is neutralized as a *side effect* of
 * canonicalization; that is not a sanitizer and it says nothing at all about a
 * single segment. This is the missing half, and the spine's own structural seed
 * already claimed it lived here.
 *
 * **Which surfaces it actually covers, stated because the requirement is wider
 * than the caller.** NFR-17 names two surfaces — a BMAD slug reaches the tool
 * "as filesystem paths and as URL components" — and names *run-folder slugs* as
 * the untrusted input. What runs through here today is neither of those: it is
 * `story_location` (FR-51), the one location this tool builds a path from rather
 * than enumerates. The URL half has no surface until Story 2.1, and the
 * walk-derived slug half still reaches `walk.ts` unsanitized because those names
 * come *from* `readdir` rather than being composed into a path — refusing one
 * would make a directory that exists disappear from the inventory, which is the
 * opposite of what this tool promises. Both gaps are recorded in
 * `deferred-work.md`; neither is described here as covered.
 *
 * **Two entry points, because a segment and a location are different
 * questions.**
 *
 *   - `sanitizeSegment` judges one segment as a **name**. A name that is `.` or
 *     `..` is traversal spelled as a name and is refused: no BMAD artifact is
 *     called that, and a caller joining it onto a base is building an escape
 *     whether or not it knows.
 *   - `sanitizeDeclaredPath` judges a whole location a project *declared* —
 *     `story_location` is the one such value that exists — by sanitizing each of
 *     its components as a name, with `.` and `..` **allowed through** because
 *     there they are navigation rather than names. FR-74 says such a value "may
 *     be relative or absolute, and may point outside the project", and the
 *     answer for `../../elsewhere` is out-of-tree (resolved, reported, never
 *     read), not "refused for containing `..`". Canonicalization resolves the
 *     traversal and AD-9's confinement check judges where it landed — the second
 *     of AD-10's two checks, and it still runs.
 *
 * **It refuses rather than repairs.** Rewriting `a/b` into `a_b` or dropping a
 * leading dot invents a name that is not what the project said, and then reads
 * from it — a guess dressed as a reading, which is the one thing this codebase's
 * readers promise not to do (see `frontmatter.ts`'s header). A refusal is a
 * typed value naming the rule that fired, so a caller reports it.
 *
 * The one thing it does *rebuild* is a declared location's spelling, from the
 * very components it checked: `normalized` on a passing `DeclaredPathCheck`.
 * That is not a repair, it is the removal of a gap — the caller used to
 * validate a decomposition and then resolve the raw string, so on a platform
 * where the two can disagree it was checking one value and reading another.
 *
 * **Every rule is refused on every platform**, not only where it is dangerous,
 * and this module asks `process.platform` nothing. `a\b` is one legal filename
 * on POSIX and two path components on Windows; `C:stories` is drive-*relative*
 * on Windows and an ordinary name on POSIX. A value whose meaning depends on
 * the host is refused rather than resolved two ways, which is the only thing
 * that makes NFR-12 (the tool works on all three platforms) worth anything.
 * There is deliberately **no import at all** here, not even `node:path`: this
 * is a decision over a string, which is what lets it run before any syscall
 * could carry the value, and `test/architecture.test.ts` pins the empty import
 * set.
 */

/**
 * The rule that refused a segment, named rather than inferred from prose.
 *
 * Named because a caller has to report *which* rule fired — the same reason
 * `ReadStage` exists one module over — and because a message is not something
 * to pattern-match. Each is a distinct way a free-text slug turns into a path
 * component nobody chose:
 *
 *   - `empty` — nothing, or only whitespace. `join(base, '')` is `base`, so an
 *     empty segment silently addresses the parent: an escape with no `..` in it.
 *   - `nul` — a NUL byte. Node refuses these, but only at the syscall; a value
 *     carrying one has already been concatenated into log lines and messages by
 *     then, and C-string truncation is the classic way `safe.txt\0.png` becomes
 *     `safe.txt`.
 *   - `control` — any other C0 or **C1** control, or DEL. A name carrying `\r`
 *     or an escape rewrites the line it is printed on, and this tool prints
 *     paths. C1 is included because the stated reason reaches it: a terminal
 *     that decodes Latin-1 treats 0x9B as a control sequence introducer.
 *   - `bidi` — a directional override or isolate (`U+202A`–`U+202E`,
 *     `U+2066`–`U+2069`, `U+200E`, `U+200F`, `U+061C`). Its own rule rather
 *     than a flavour of `control`, because the threat is different in kind:
 *     these characters do not corrupt the line, they make the printed path
 *     *misrepresent itself*, so a user checking this tool's report against a
 *     directory listing is comparing a lie with the truth and cannot tell.
 *   - `separator` — `/` or `\`, either of them, on every platform.
 *   - `windows-illegal` — `:` `<` `>` `"` `|` `?` `*`. `:` is the dangerous one
 *     and the reason this rule exists rather than being left to the platform:
 *     `C:stories` is drive-relative on Windows (resolved against that drive's
 *     own working directory, which is not the project) and
 *     `docs/file.txt:stream` names an NTFS alternate data stream, which is
 *     content the tool would read while reporting the plain name. The rest are
 *     refused with it because they are illegal in a Windows filename and legal
 *     elsewhere, which is the meaning-depends-on-the-host shape this module
 *     exists to refuse.
 *   - `traversal` — exactly `.` or `..`. Refused as a *name*; allowed through
 *     `sanitizeDeclaredPath` as navigation, which is the whole difference
 *     between the two entry points.
 *   - `leading-dot` — a name beginning `.`. Two reasons rather than one: it is
 *     hidden from the ordinary listing a user would check this tool's report
 *     against, and `.git`, `.claude` and `.ssh` are all reachable by one.
 *   - `trailing` — a trailing space or `.`. Windows strips both silently at
 *     creation, so `secret.txt.` and `secret.txt` are the same file there and
 *     different strings everywhere, which is a mismatch between what is checked
 *     and what is opened.
 *   - `reserved` — a Windows device name (`CON`, `NUL`, `COM1`, `CLOCK$`, …),
 *     with or without an extension. Opening one is not a file operation at all.
 *   - `too-long` — a segment over `MAX_SEGMENT_BYTES`, or a whole declared
 *     location over `MAX_PATH_BYTES`, encoded. Both limits are in **bytes**,
 *     because POSIX `NAME_MAX` and `PATH_MAX` are, so a name of 128 emoji is
 *     over the first. Refused here rather than left to `canonical`, which
 *     *degrades silently* on `ENAMETOOLONG` and hands back the spelling.
 *   - `too-deep` — a declared location of more than `MAX_COMPONENTS`
 *     components. A bound on the work the checks below do, and on what a
 *     single configuration value can address.
 */
export type SegmentRule =
  | 'empty'
  | 'nul'
  | 'control'
  | 'bidi'
  | 'separator'
  | 'windows-illegal'
  | 'traversal'
  | 'leading-dot'
  | 'trailing'
  | 'reserved'
  | 'too-long'
  | 'too-deep';

/** Every rule, in the order the two entry points apply them. */
export const SEGMENT_RULES: readonly SegmentRule[] = [
  'empty',
  'nul',
  'control',
  'bidi',
  'separator',
  'windows-illegal',
  'traversal',
  'leading-dot',
  'trailing',
  'reserved',
  'too-long',
  'too-deep',
];

/**
 * The longest segment accepted, in UTF-8 bytes.
 *
 * POSIX `NAME_MAX` is 255 and the limit is on bytes; Windows and macOS are
 * effectively at or above that for a single component.
 */
export const MAX_SEGMENT_BYTES = 255;

/**
 * The longest whole declared location accepted, in UTF-8 bytes.
 *
 * POSIX `PATH_MAX` is 4096 on Linux and lower elsewhere; Windows' classic
 * `MAX_PATH` is 260. The Linux figure is used because this is a bound against a
 * pathological configuration value rather than a promise that everything under
 * it opens — a shorter limit would refuse locations that work.
 */
export const MAX_PATH_BYTES = 4096;

/** The most components a declared location may have. */
export const MAX_COMPONENTS = 64;

/**
 * What a segment turned out to be.
 *
 * `ok: false` carries the rule *and* a sentence, on the precedent every failure
 * in this adapter follows: the typed value is what a caller branches on and the
 * prose is what it reports, and folding them would leave a caller
 * pattern-matching English.
 *
 * `ok: true` hands back a plain `string`. A branded `SafeSegment` was written
 * and then **removed**: no signature in `src/` accepted one, and the only
 * consumer — `sanitizeDeclaredPath` — discarded every brand it produced, so the
 * type asserted a discipline nothing practised. What enforces the discipline
 * instead is the importer test: this module is importable only by
 * `src/adapters/fs/read.ts`, so there is exactly one place a content-derived
 * path can be built, and it is the place that runs the check.
 */
export type SegmentCheck =
  | { readonly ok: true; readonly segment: string }
  | { readonly ok: false; readonly rule: SegmentRule; readonly reason: string };

/**
 * Windows device names, which are not files at any extension.
 *
 * The console and clock devices are in the list as well as the classic nine:
 * `CONIN$`, `CONOUT$` and `CLOCK$` are reserved on the same terms and are the
 * three every shortened version of this list leaves out.
 */
const RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'conin$',
  'conout$',
  'clock$',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

/** Illegal in a Windows filename, and legal elsewhere. See `windows-illegal`. */
const WINDOWS_ILLEGAL = new Set([':', '<', '>', '"', '|', '?', '*']);

/**
 * Characters that change how a path *reads* without changing what it is.
 *
 * The directional overrides and isolates, plus the two plain marks and Arabic
 * letter mark. Listed by code point so the set is auditable against Unicode
 * rather than resting on a regex property nobody can read.
 */
const BIDI = new Set([
  0x200e, 0x200f, 0x061c, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);

const UTF8 = new TextEncoder();

/** A control character: C0, C1, or DEL. Tested by code point, not by a class. */
function isControl(code: number): boolean {
  return code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
}

/**
 * Judge one content-derived segment as a name.
 *
 * Never throws: a refusal is a value, because every caller of this is in the
 * middle of a pass over a project and one bad slug must not abort it (AD-7).
 *
 * The order of the rules is reported rather than load-bearing — the rules are
 * independent and a segment breaking two is refused either way — with one
 * exception worth stating: the character rules are asked before `separator`, so
 * the message for `a\0/b` names the byte rather than the slash, which is the
 * more surprising of the two facts.
 */
export function sanitizeSegment(raw: string): SegmentCheck {
  const refuse = (rule: SegmentRule, reason: string): SegmentCheck => ({ ok: false, rule, reason });

  if (raw === '' || raw.trim() === '') {
    return refuse('empty', 'a path segment cannot be empty or only whitespace');
  }

  for (const character of raw) {
    // Iterated by code point rather than by UTF-16 unit, so an astral
    // character is one value here and a surrogate half is never tested alone.
    const code = character.codePointAt(0) ?? 0;
    if (code === 0) return refuse('nul', 'a path segment cannot contain a NUL byte');
    if (isControl(code)) {
      return refuse(
        'control',
        `a path segment cannot contain the control character U+${hex(code)}`,
      );
    }
    if (BIDI.has(code)) {
      return refuse(
        'bidi',
        `a path segment cannot contain the directional character U+${hex(code)}: it changes how the path reads without changing what it is`,
      );
    }
  }

  if (raw.includes('/') || raw.includes('\\')) {
    return refuse(
      'separator',
      'a path segment cannot contain a path separator: / and \\ are both refused, because \\ separates components on Windows and is a legal filename character elsewhere',
    );
  }

  for (const character of raw) {
    if (WINDOWS_ILLEGAL.has(character)) {
      return refuse(
        'windows-illegal',
        `a path segment cannot contain ${JSON.stringify(character)}: it is illegal in a Windows filename and legal elsewhere, and : additionally names a drive or an alternate data stream there`,
      );
    }
  }

  if (raw === '.' || raw === '..') {
    return refuse('traversal', `${raw} is traversal spelled as a name, not a name`);
  }

  if (raw.startsWith('.')) {
    return refuse(
      'leading-dot',
      'a path segment cannot begin with a dot: such a name is hidden from an ordinary listing',
    );
  }

  const last = raw[raw.length - 1];
  if (last === ' ' || last === '.') {
    return refuse(
      'trailing',
      'a path segment cannot end with a space or a dot: Windows strips both at creation, so the name checked and the name opened would differ',
    );
  }

  // The stem before the first dot, which is what Windows resolves a device
  // name from: `NUL.txt` is the null device, not a text file.
  const dot = raw.indexOf('.');
  const stem = raw.slice(0, dot === -1 ? raw.length : dot);
  if (RESERVED.has(stem.toLowerCase())) {
    return refuse('reserved', `${stem} is a reserved device name on Windows, not a file`);
  }

  const bytes = UTF8.encode(raw).length;
  if (bytes > MAX_SEGMENT_BYTES) {
    return refuse(
      'too-long',
      `a path segment of ${String(bytes)} bytes is over the ${String(MAX_SEGMENT_BYTES)}-byte limit`,
    );
  }

  return { ok: true, segment: raw };
}

/** A code point as the four-or-more hex digits Unicode is written in. */
function hex(code: number): string {
  return code.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * What a declared location turned out to be, before anything resolves it.
 *
 * `ok: true` carries three things and each has a caller. `value` is what the
 * project wrote, for the record. `normalized` is the spelling **rebuilt from
 * the components that were checked**, which is what the resolver is handed —
 * validating one string and resolving another is the gap this field closes.
 * `absolute` is the fact FR-74 singles out, and it is what tells `normalized`
 * apart from a relative value of the same components.
 */
export type DeclaredPathCheck =
  | {
      readonly ok: true;
      /** The value as declared, unchanged, for the report. */
      readonly value: string;
      /** True when the value is rooted, so it resolves against nothing. */
      readonly absolute: boolean;
      /** The components that passed, navigation included, in order. */
      readonly components: readonly string[];
      /** `components` rejoined — the only spelling a caller may resolve. */
      readonly normalized: string;
    }
  | {
      readonly ok: false;
      readonly rule: SegmentRule;
      /** The component that was refused, so the report names it. */
      readonly component: string;
      readonly reason: string;
    };

/** Navigation, which is not a name and is judged by confinement instead. */
const NAVIGATION = new Set(['.', '..']);

/**
 * Judge a location a project declared, component by component.
 *
 * Split on `/` only, and that is deliberate rather than an oversight on
 * Windows: `path.resolve` accepts `/` on every platform, BMAD writes its
 * configured locations with `/`, and a component still holding a `\` is refused
 * by the `separator` rule above. Splitting on both would make `\` unreachable
 * by any rule and let one spelling mean two things on two platforms.
 *
 * **Absoluteness is decided by `/` alone, with no reference to the platform.**
 * An earlier version also tested `path.sep`, which made `\stories` absolute on
 * Windows and a `separator` refusal on POSIX — one spelling, two answers, the
 * exact thing this module's doctrine forbids. A *run* of leading separators is
 * consumed, so `//etc/passwd` is answered as the absolute path it is rather
 * than refused for an empty component it does not really have.
 *
 * A single trailing separator is dropped, because `docs/stories/` and
 * `docs/stories` name one directory. Any *other* empty component — the middle
 * of `docs//stories` — is refused, because it means the value was assembled by
 * something that lost a piece, and quietly collapsing it would resolve a path
 * nobody wrote.
 *
 * An absolute value with no components at all is the filesystem root. It is
 * accepted here and answered by confinement, which refuses it: this function's
 * job is to refuse what cannot be *resolved safely*, and the root resolves
 * perfectly well to somewhere out of tree.
 *
 * One consequence, stated rather than discovered: because `:` is refused, a
 * Windows **absolute** location is always refused — `C:\stories` for its
 * backslash and `C:/stories` for its colon — so on Windows only a relative
 * `story_location` resolves. That is the deliberate direction: `C:stories` and
 * `C:/stories` differ by one character and name entirely different places, and
 * BMAD writes this field relative. FR-74's own tested value is the
 * POSIX-shaped `/custom/stories`, which resolves and is reported out-of-tree.
 */
export function sanitizeDeclaredPath(raw: string): DeclaredPathCheck {
  const refuse = (rule: SegmentRule, component: string, reason: string): DeclaredPathCheck => ({
    ok: false,
    rule,
    component,
    reason,
  });

  if (raw === '' || raw.trim() === '') {
    return refuse('empty', raw, 'a declared location cannot be empty or only whitespace');
  }

  const pathBytes = UTF8.encode(raw).length;
  if (pathBytes > MAX_PATH_BYTES) {
    return refuse(
      'too-long',
      raw,
      `a declared location of ${String(pathBytes)} bytes is over the ${String(MAX_PATH_BYTES)}-byte limit`,
    );
  }

  // Asked over the whole value before it is split, so the message for a NUL
  // names the byte rather than whichever component happened to hold it — and
  // so a NUL is never handed to `split` at all.
  for (const character of raw) {
    if ((character.codePointAt(0) ?? 0) === 0) {
      return refuse('nul', raw, 'a declared location cannot contain a NUL byte');
    }
  }

  const absolute = raw.startsWith('/');
  let body = raw;
  while (body.startsWith('/')) body = body.slice(1);
  if (body.endsWith('/')) body = body.slice(0, -1);

  const components: string[] = [];
  if (body !== '') {
    const parts = body.split('/');
    if (parts.length > MAX_COMPONENTS) {
      return refuse(
        'too-deep',
        raw,
        `a declared location of ${String(parts.length)} components is over the ${String(MAX_COMPONENTS)}-component limit`,
      );
    }
    for (const component of parts) {
      if (NAVIGATION.has(component)) {
        // Navigation, not a name: `..` is resolved by canonicalization and
        // where it lands is confinement's answer. This is the one difference
        // between this function and `sanitizeSegment`, and FR-74's
        // `../../elsewhere` row is what it is for.
        components.push(component);
        continue;
      }
      const checked = sanitizeSegment(component);
      if (!checked.ok) return refuse(checked.rule, component, checked.reason);
      components.push(checked.segment);
    }
  }

  return {
    ok: true,
    value: raw,
    absolute,
    components,
    normalized: (absolute ? '/' : '') + components.join('/'),
  };
}
