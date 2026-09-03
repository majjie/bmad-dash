/**
 * Scanning primitives for the AD-1 gate.
 *
 * Extracted from `architecture.test.ts` so the tokenizer can be unit-tested on
 * its own. It had two defects that a unit test would have caught at once:
 *
 *   - The directory walk asked a `Dirent` `isDirectory()`/`isFile()` and skipped
 *     anything answering false to both — which is every symlink. A symlinked
 *     source file, or a symlinked directory of them, was invisible to the
 *     read-only invariant.
 *   - Comment stripping ran before any awareness of string literals, so
 *     `const u = 'http://x'; writeFileSync(p, d);` truncated at `'http:` and the
 *     write was never seen. The tool's own `server.ts` builds
 *     `` `http://${…}` ``, so the gate was scanning a mangled copy of real
 *     source.
 */

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Directories holding source a contributor edits. `test/` is not gated. */
export const SCANNED_ROOTS = ['src', 'web', 'scripts'] as const;

/** Gated built-in -> the only directory prefixes allowed to import it. */
export const GATED_MODULES = new Map<string, readonly string[]>([
  ['fs', ['src/adapters/fs/']],
  // `src/adapters/git/` was granted `child_process` here from the first story
  // and removed 2026-09-03: the directory has never existed, so the grant was
  // a permission over nothing, pinned by a `deepEqual` that could not fail.
  // The git adapter is still deferred work; when it lands it re-adds its own
  // prefix, which `every gate permission is load-bearing` makes a deliberate
  // edit rather than a quiet grant.
  ['child_process', ['src/adapters/browser/', 'scripts/']],
]);

/** The layer that must have no outgoing dependency, ever (frozen constraint). */
export const PURE_LAYER = 'src/domain/';

/**
 * The mutating `fs` surface. Denied everywhere scanned, including inside the
 * adapter permitted to import `fs` at all — that permission is to *read*.
 *
 * Bare `write`, `open`, `close` and `read` are deliberately absent: they are
 * stream and response methods too, and a gate that cries wolf gets weakened.
 * The `*Sync` forms carry no such collision — there is no `stream.writeSync` —
 * so `openSync`, `writeSync`, `writev` and `writevSync` are gated. `openSync`
 * is gated even though it can open for reading: it is the file-descriptor entry
 * point to writing, and reads have `readFile`, `readFileSync` and
 * `createReadStream`. A legitimate read-only `openSync` is a decision to record
 * here, not something to slip through.
 */
export const MUTATING_FS_OPERATIONS: readonly string[] = [
  'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync',
  'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync',
  'rm', 'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync',
  'rename', 'renameSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync',
  'chmod', 'chmodSync', 'fchmod', 'fchmodSync', 'lchmod', 'lchmodSync',
  'chown', 'chownSync', 'fchown', 'fchownSync', 'lchown', 'lchownSync',
  'truncate', 'truncateSync', 'ftruncate', 'ftruncateSync',
  'utimes', 'utimesSync', 'futimes', 'futimesSync', 'lutimes', 'lutimesSync',
  'symlink', 'symlinkSync', 'link', 'linkSync',
  'createWriteStream',
  'openSync', 'writeSync', 'writev', 'writevSync',
];

export const SOURCE_EXTENSIONS = new Set([
  '.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx',
]);

/**
 * Every module specifier in an import, dynamic import or require position.
 * Deliberately syntactic: it over-matches rather than under-matches, because a
 * missed import is a hole in the invariant and a false positive is a loud test.
 */
export const SPECIFIER_PATTERN =
  /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;

/**
 * Matches of `pattern` whose keyword is genuinely in code position.
 *
 * The specifier patterns have to run over `withLiterals`, because the thing
 * they capture *is* a string literal. That view keeps the prose inside every
 * other literal too, so a sentence ending in the word "from" followed by its
 * own closing quote reads as an import: `src/adapters/fs/walk.ts` carries
 * `'a second spelling of the directory the walk started from'`, which yielded a
 * phantom specifier running to the next quote in the file. Inert there, because
 * the garbage keys to no gated module -- but the same sentence inside
 * `src/domain/` would be reported as a **purity violation**, since that rule
 * treats every specifier it does not recognize as outgoing.
 *
 * `code` and `withLiterals` are the same length by construction: blanking
 * replaces each non-newline character with a space. So a match's own index
 * addresses both views, and the keyword that starts the match survives in
 * `code` exactly when it was code. `test/support/scanner.test.ts` pins the
 * length equality this depends on, and the phantom itself, in both directions.
 */
export function codeMatches(scanned: ScannedSource, pattern: RegExp): RegExpMatchArray[] {
  return [...scanned.withLiterals.matchAll(pattern)].filter((match) => {
    const at = match.index;
    if (at === undefined) return false;
    // Every alternative in both patterns begins with the keyword, so the first
    // character of a real match is a letter in `code` and a blank where the
    // "keyword" was prose inside a literal.
    return /[A-Za-z]/.test(scanned.code[at] ?? '');
  });
}

/** Named bindings pulled out of an import, with the specifier they came from. */
export const NAMED_IMPORT_PATTERN =
  /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2/g;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type SpanKind = 'code' | 'blank';

interface Span {
  readonly kind: SpanKind;
  readonly start: number;
  readonly end: number;
  /** True for comments; string/regex literals are blanked only in `code`. */
  readonly comment: boolean;
}

/**
 * A `/` starts a regex only where a value cannot already have ended.
 *
 * Deliberately conservative: guessing "regex" wrongly would consume real code
 * up to the next `/` and hide it, which is the failure this whole file exists
 * to prevent. Guessing "division" wrongly leaves a regex body in the scan,
 * which at worst produces a loud false positive.
 */
const VALUE_END = /[A-Za-z0-9_$)\]]/;

export interface ScannedSource {
  /** Comments and string, template and regex literal bodies blanked. */
  readonly code: string;
  /** Comments blanked; literals kept, so import specifiers survive. */
  readonly withLiterals: string;
}

/**
 * Split `source` into code and non-code spans in one pass.
 *
 * Template-literal interpolations are treated as code, because `${…}` can
 * contain a call and a gate that blanked it would miss one.
 */
export function scanSource(source: string): ScannedSource {
  const spans: Span[] = [];
  const n = source.length;
  let codeStart = 0;
  let lastValueChar = '';

  const flushCode = (upTo: number): void => {
    if (upTo > codeStart) spans.push({ kind: 'code', start: codeStart, end: upTo, comment: false });
  };
  const pushBlank = (start: number, end: number, comment: boolean): void => {
    spans.push({ kind: 'blank', start, end, comment });
  };

  /** True when an unescaped closing `/` exists before the end of the line. */
  const regexClosesOnThisLine = (from: number): boolean => {
    let j = from + 1;
    let inClass = false;
    while (j < n) {
      const ch = source[j];
      if (ch === '\n') return false;
      if (ch === '\\') {
        j += 2;
        continue;
      }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) return true;
      j += 1;
    }
    return false;
  };

  let i = 0;
  /** Brace depth inside template interpolations, innermost last. */
  const templateStack: number[] = [];

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      flushCode(i);
      let j = i;
      while (j < n && source[j] !== '\n') j += 1;
      pushBlank(i, j, true);
      i = j;
      codeStart = i;
      continue;
    }

    if (c === '/' && next === '*') {
      flushCode(i);
      let j = i + 2;
      while (j < n && !(source[j] === '*' && source[j + 1] === '/')) j += 1;
      j = Math.min(j + 2, n);
      pushBlank(i, j, true);
      i = j;
      codeStart = i;
      continue;
    }

    if (c === '"' || c === "'") {
      flushCode(i);
      const quote = c;
      let j = i + 1;
      while (j < n && source[j] !== quote) {
        if (source[j] === '\\') j += 1;
        if (source[j] === '\n') break;
        j += 1;
      }
      j = Math.min(j + 1, n);
      pushBlank(i, j, false);
      i = j;
      codeStart = i;
      lastValueChar = 'x';
      continue;
    }

    if (c === '`') {
      flushCode(i);
      let j = i + 1;
      let segmentStart = j;
      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }
        if (source[j] === '`') break;
        if (source[j] === '$' && source[j + 1] === '{') {
          pushBlank(segmentStart, j, false);
          // The interpolation is code: hand control back to the main loop.
          templateStack.push(0);
          i = j + 2;
          codeStart = i;
          break;
        }
        j += 1;
      }
      if (templateStack.length > 0 && codeStart === j + 2) continue;
      j = Math.min(j + 1, n);
      pushBlank(segmentStart, j, false);
      i = j;
      codeStart = i;
      lastValueChar = 'x';
      continue;
    }

    if (templateStack.length > 0) {
      if (c === '{') templateStack[templateStack.length - 1] = (templateStack[templateStack.length - 1] ?? 0) + 1;
      else if (c === '}') {
        const depth = templateStack[templateStack.length - 1] ?? 0;
        if (depth === 0) {
          // End of interpolation: resume literal text until the backtick.
          flushCode(i);
          templateStack.pop();
          let j = i + 1;
          const segmentStart = j;
          while (j < n) {
            if (source[j] === '\\') {
              j += 2;
              continue;
            }
            if (source[j] === '`') break;
            if (source[j] === '$' && source[j + 1] === '{') {
              pushBlank(segmentStart, j, false);
              templateStack.push(0);
              i = j + 2;
              codeStart = i;
              break;
            }
            j += 1;
          }
          if (templateStack.length > 0 && codeStart === j + 2) continue;
          j = Math.min(j + 1, n);
          pushBlank(segmentStart, j, false);
          i = j;
          codeStart = i;
          lastValueChar = 'x';
          continue;
        }
        templateStack[templateStack.length - 1] = depth - 1;
      }
    }

    if (c === '/' && !VALUE_END.test(lastValueChar) && regexClosesOnThisLine(i)) {
      flushCode(i);
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const ch = source[j];
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) break;
        j += 1;
      }
      j = Math.min(j + 1, n);
      // Trailing flags.
      while (j < n && /[a-z]/.test(source[j] ?? '')) j += 1;
      pushBlank(i, j, false);
      i = j;
      codeStart = i;
      lastValueChar = 'x';
      continue;
    }

    if (c !== undefined && c.trim() !== '') lastValueChar = c;
    i += 1;
  }
  flushCode(n);

  let code = '';
  let withLiterals = '';
  let cursor = 0;
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    if (span.start > cursor) {
      const gap = source.slice(cursor, span.start);
      code += gap;
      withLiterals += gap;
    }
    const text = source.slice(span.start, span.end);
    if (span.kind === 'code') {
      code += text;
      withLiterals += text;
    } else {
      // Newlines are preserved so line-oriented reasoning still works.
      const blanked = text.replace(/[^\n]/g, ' ');
      code += blanked;
      withLiterals += span.comment ? blanked : text;
    }
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < n) {
    const tail = source.slice(cursor);
    code += tail;
    withLiterals += tail;
  }

  return { code, withLiterals };
}

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

export function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}

/**
 * Repo-relative POSIX paths of source files under the scanned roots.
 *
 * **Follows symlinks.** A `Dirent` for a symlink answers false to both
 * `isDirectory()` and `isFile()`, so the previous walk skipped every one of
 * them and a symlinked source file was invisible to the gate. Resolved
 * directories are remembered so a link cycle terminates instead of recursing
 * forever, and a dangling link is skipped rather than fatal.
 */
export async function collectSourceFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const visitedDirectories = new Set<string>();

  async function walk(absolute: string): Promise<void> {
    let resolved: string;
    try {
      resolved = await realpath(absolute);
    } catch {
      return;
    }
    if (visitedDirectories.has(resolved)) return;
    visitedDirectories.add(resolved);

    let entries: Dirent[];
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch (error: unknown) {
      if (isEnoent(error)) return;
      throw error;
    }

    for (const entry of entries) {
      const child = join(absolute, entry.name);
      let directory = entry.isDirectory();
      let file = entry.isFile();

      if (entry.isSymbolicLink()) {
        try {
          const target = await stat(child);
          directory = target.isDirectory();
          file = target.isFile();
        } catch {
          // Dangling link: nothing to scan, and not this gate's job to report.
          continue;
        }
      }

      if (directory) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        await walk(child);
        continue;
      }
      if (!file) continue;
      const dot = entry.name.lastIndexOf('.');
      if (dot === -1 || !SOURCE_EXTENSIONS.has(entry.name.slice(dot))) continue;
      found.push(relative(root, child).split(sep).join('/'));
    }
  }

  for (const scanned of SCANNED_ROOTS) {
    await walk(join(root, scanned));
  }
  return found.sort();
}

/** The gate key: `node:` stripped, subpath dropped. */
export function gateKey(specifier: string): string {
  const withoutPrefix = specifier.startsWith('node:')
    ? specifier.slice('node:'.length)
    : specifier;
  return withoutPrefix.split('/')[0] ?? withoutPrefix;
}

export interface Violation {
  readonly file: string;
  readonly specifier: string;
  readonly allowed: readonly string[];
}

export interface OperationViolation {
  readonly file: string;
  readonly operation: string;
  readonly how: string;
}

export interface Unanalysable {
  readonly file: string;
  readonly mechanism: string;
}

export interface DomainViolation {
  readonly file: string;
  readonly specifier: string;
}

async function readScanned(
  root: string,
): Promise<{ file: string; raw: string; scanned: ScannedSource }[]> {
  const files = await collectSourceFiles(root);
  return Promise.all(
    files.map(async (file) => {
      const raw = await readFile(join(root, file), 'utf8');
      return { file, raw, scanned: scanSource(raw) };
    }),
  );
}

export async function findImportViolations(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const { file, scanned } of await readScanned(root)) {
    for (const match of codeMatches(scanned, SPECIFIER_PATTERN)) {
      const specifier = match[2];
      if (specifier === undefined) continue;
      const allowed = GATED_MODULES.get(gateKey(specifier));
      if (allowed === undefined) continue;
      if (allowed.some((prefix) => file.startsWith(prefix))) continue;
      violations.push({ file, specifier, allowed });
    }
  }
  return violations;
}

/**
 * The frozen constraint: `src/domain/` has no outgoing imports.
 *
 * Keyed on the importing directory, not on a module name, because the rule is
 * about a layer having no outgoing dependency at all. Relative imports that
 * stay inside `src/domain/` are internal, not outgoing; a bare specifier, a
 * `node:` builtin, or a relative path that escapes the layer is a violation.
 * Written before `src/domain/` existed, on the grounds that a prefix rule which
 * only ever sees an empty directory passes vacuously. It holds seven modules
 * now, and `the scan reaches every module in the pure layer` is what keeps the
 * rule from going quiet if that ever stops being true.
 */
export async function findDomainViolations(root: string): Promise<DomainViolation[]> {
  const violations: DomainViolation[] = [];
  for (const { file, scanned } of await readScanned(root)) {
    if (!file.startsWith(PURE_LAYER)) continue;
    for (const match of codeMatches(scanned, SPECIFIER_PATTERN)) {
      const specifier = match[2];
      if (specifier === undefined) continue;
      if (!specifier.startsWith('.')) {
        violations.push({ file, specifier });
        continue;
      }
      const importer = file.slice(0, file.lastIndexOf('/'));
      const target = join(importer, specifier).split(sep).join('/');
      if (!target.startsWith(PURE_LAYER)) violations.push({ file, specifier });
    }
  }
  return violations;
}

export async function findMutatingOperations(root: string): Promise<OperationViolation[]> {
  const found: OperationViolation[] = [];
  const denied = new Set(MUTATING_FS_OPERATIONS);

  for (const { file, scanned } of await readScanned(root)) {
    for (const match of codeMatches(scanned, NAMED_IMPORT_PATTERN)) {
      const [, bindings, , specifier] = match;
      if (bindings === undefined || specifier === undefined) continue;
      if (gateKey(specifier) !== 'fs') continue;
      for (const binding of bindings.split(',')) {
        const name = binding.split(/\s+as\s+/)[0]?.trim();
        if (name !== undefined && denied.has(name)) {
          found.push({ file, operation: name, how: `imported from '${specifier}'` });
        }
      }
    }

    for (const operation of MUTATING_FS_OPERATIONS) {
      // A call site, bare or through a namespace: `rm(` or `fs.rm(`.
      if (new RegExp(`(?:\\.|\\b)${operation}\\s*\\(`).test(scanned.code)) {
        found.push({ file, operation, how: 'called' });
      }
      // Bracket access with a literal name: `fs['rm'](…)`. Read from the
      // literal-preserving text, since the name lives inside a string.
      if (new RegExp(`\\[\\s*(['"])${operation}\\1\\s*\\]`).test(scanned.withLiterals)) {
        found.push({ file, operation, how: 'accessed by bracket notation' });
      }
      // Destructured out of a namespace, renamed or not:
      // `const { rm } = fs` and `const { rm: wipe } = fs`.
      if (
        new RegExp(`(?:const|let|var)\\s*\\{[^}]*\\b${operation}\\b[^}]*\\}\\s*=`).test(
          scanned.code,
        )
      ) {
        found.push({ file, operation, how: 'destructured from a namespace' });
      }
    }
  }
  return found;
}

/** Ways to reach a built-in that no name-based scan can resolve. */
const UNANALYSABLE_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'process.getBuiltinModule', pattern: /\bgetBuiltinModule\s*\(/ },
  { name: 'createRequire', pattern: /\bcreateRequire\b/ },
  { name: 'dynamic import() with a non-literal specifier', pattern: /\bimport\s*\(\s*(?!['"])/ },
];

/** A computed member call — `fs[op](…)` — carries no name to match on. */
const COMPUTED_CALL = /\[\s*[A-Za-z_$][\w$]*\s*\]\s*\(/;

export async function findUnanalysable(root: string): Promise<Unanalysable[]> {
  const found: Unanalysable[] = [];
  for (const { file, scanned } of await readScanned(root)) {
    // The literal-preserving view, not the code view: blanking a string turns
    // `import('node:fs')` into `import(   )`, which the non-literal-specifier
    // pattern would then match — a false positive on every ordinary dynamic
    // import. Comments are blanked here, so prose naming a mechanism is safe.
    for (const { name, pattern } of UNANALYSABLE_PATTERNS) {
      if (pattern.test(scanned.withLiterals)) found.push({ file, mechanism: name });
    }
    // Scoped to files that import an `fs` module: `arr[i](…)` is ordinary code
    // elsewhere, and only this directory may touch `fs` at all, so the check is
    // precise where it matters and silent where it would be noise.
    const importsFs = codeMatches(scanned, SPECIFIER_PATTERN).some(
      (match) => match[2] !== undefined && gateKey(match[2]) === 'fs',
    );
    if (importsFs && COMPUTED_CALL.test(scanned.code)) {
      found.push({ file, mechanism: 'computed member call on a module that imports fs' });
    }
  }
  return found;
}

export function describeImports(violations: readonly Violation[]): string {
  return violations
    .map((v) => `${v.file} imports ${v.specifier}; only ${v.allowed.join(', ')} may`)
    .join('\n');
}

export function describeOperations(found: readonly OperationViolation[]): string {
  return found.map((o) => `${o.file} ${o.how}: the mutating operation ${o.operation}`).join('\n');
}

export function describeUnanalysable(found: readonly Unanalysable[]): string {
  return found.map((u) => `${u.file} uses ${u.mechanism}, which the gate cannot resolve`).join('\n');
}

export function describeDomain(found: readonly DomainViolation[]): string {
  return found
    .map((d) => `${d.file} imports ${d.specifier}; ${PURE_LAYER} must have no outgoing imports`)
    .join('\n');
}
