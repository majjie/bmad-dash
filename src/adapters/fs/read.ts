/**
 * The reading surface, confined to the permitted root.
 *
 * Everything the tool ever learns about a project comes through here. Two
 * properties are enforced rather than documented:
 *
 *   1. **Reads only.** AD-1's confinement of `node:fs` to this directory proves
 *      imports are tidy; it does nothing to stop this file calling `writeFile`.
 *      Read-only is a property of the operations, so the gate in
 *      `test/architecture.test.ts` denies the mutating surface here too.
 *   2. **Confined.** Every path is canonicalized and checked against the
 *      permitted root before the filesystem is touched — not after, and not by
 *      the caller. Canonicalization comes first because that is what makes the
 *      check meaningful: a `..` segment, and an *existing* symlink pointing
 *      outside the tree, have both been resolved away by the time containment
 *      is asked, so neither passes by virtue of its spelling. For a path that
 *      does not exist there is nothing to resolve and containment answers about
 *      the spelling instead — see `canonical`. No read escapes as a result,
 *      since the `stat` below resolves the link and finds nothing at the far
 *      end; the point of saying so here is that the guarantee is narrower than
 *      this paragraph used to claim.
 *
 * There is no way for a caller to skip the check. That is the design: a reader
 * that could be handed an already-checked path would eventually be handed one
 * that was not.
 */

import { statSync, readFileSync } from 'node:fs';

import { canonical, contains, toPlatform, type CanonicalPath } from './paths.ts';

/**
 * The largest file this will read into memory.
 *
 * A bound rather than a considered budget: the tool reads project documents,
 * and a BMAD spec is measured in tens of kilobytes, so anything at this scale
 * is a mistake — a build artifact, a log, a database — and reading it into a
 * long-lived server process helps nobody. Story 1.9 owns reporting it as
 * unreadable in the UI; this is the guard that makes that possible rather than
 * an out-of-memory kill.
 */
export const MAX_READ_BYTES = 8 * 1024 * 1024;

/** Enough of a stat to name what a non-file actually is, for the report. */
function describeKind(stats: {
  isDirectory(): boolean;
  isFIFO(): boolean;
  isSocket(): boolean;
  isSymbolicLink(): boolean;
}): string {
  if (stats.isDirectory()) return 'directory';
  if (stats.isFIFO()) return 'fifo';
  if (stats.isSocket()) return 'socket';
  if (stats.isSymbolicLink()) return 'symlink';
  return 'special file';
}

/** What a path turned out to be. `unreadable` is not the same as `absent`. */
export type Entry =
  | { readonly kind: 'directory' }
  | { readonly kind: 'file' }
  | { readonly kind: 'other' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unreadable'; readonly reason: string };

/**
 * A reader confined to one root.
 *
 * Constructed with the root, so confinement is a property of the object rather
 * than an argument someone can forget. Later stories widen this to a set of
 * permitted roots when a configured artifact location becomes the second
 * member; with one member a set would be an abstraction nothing uses.
 */
export class ConfinedReader {
  readonly #root: CanonicalPath;

  constructor(root: CanonicalPath) {
    this.#root = root;
  }

  get root(): CanonicalPath {
    return this.#root;
  }

  /**
   * Canonicalize `path` and refuse it if it escapes the root.
   *
   * Throws rather than returning a result, because there is no sensible way for
   * a caller to continue: a path outside the project is either a defect or an
   * attempt, and both want to stop here and be named.
   */
  resolveWithin(path: string): CanonicalPath {
    const target = canonical(path, toPlatform(this.#root));
    if (!contains(this.#root, target)) {
      throw new Error(
        `refusing to read outside the project: ${toPlatform(target)} is not within ${toPlatform(this.#root)}`,
      );
    }
    return target;
  }

  /**
   * What is at `path`.
   *
   * `absent` and `unreadable` are separate answers on purpose. A directory the
   * tool cannot read is not a directory that is not there, and reporting the
   * second when the first is true sends a reader looking for a missing folder
   * they are actually just denied.
   */
  entryAt(path: string): Entry {
    const target = this.resolveWithin(path);
    try {
      const stats = statSync(toPlatform(target));
      if (stats.isDirectory()) return { kind: 'directory' };
      if (stats.isFile()) return { kind: 'file' };
      return { kind: 'other' };
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'absent' };
      return {
        kind: 'unreadable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** True only for a directory that is actually there and readable. */
  isDirectory(path: string): boolean {
    return this.entryAt(path).kind === 'directory';
  }

  /**
   * The contents of a regular file as UTF-8 text.
   *
   * Strict decoding, and that took a correction: `readFileSync(path, 'utf8')`
   * is *lossy* — it never throws on malformed input, it substitutes U+FFFD. An
   * earlier version of this comment claimed the opposite, which would have left
   * Story 1.9 building "report it as unreadable rather than guess" on a
   * function that guesses. Reading bytes and decoding with `fatal: true` is
   * what actually makes a non-text file an answerable failure.
   *
   * Refuses anything that is not a regular file *before* reading it. A FIFO is
   * the reason: `readFileSync` on one blocks until something writes, which in a
   * server means the request never returns and the process never exits.
   */
  readText(path: string): { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string } {
    const target = this.resolveWithin(path);
    const platform = toPlatform(target);

    let size: number;
    try {
      const stats = statSync(platform);
      if (!stats.isFile()) {
        return { ok: false, reason: `not a regular file (${describeKind(stats)})` };
      }
      size = stats.size;
    } catch (error: unknown) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }

    if (size > MAX_READ_BYTES) {
      return {
        ok: false,
        reason: `file is ${String(size)} bytes, over the ${String(MAX_READ_BYTES)}-byte read limit`,
      };
    }

    let bytes: Buffer;
    try {
      bytes = readFileSync(platform);
    } catch (error: unknown) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }

    try {
      return { ok: true, text: new TextDecoder('utf8', { fatal: true }).decode(bytes) };
    } catch {
      return { ok: false, reason: 'not valid UTF-8 text' };
    }
  }
}
