/**
 * Filesystem adapter — the sole importer of `node:fs` (AD-1).
 *
 * Exposes read operations only. `realpathSync` is a read: it resolves symlinks
 * and returns a path, and touches nothing. The composition root needs it to
 * recognise itself when `bin` is invoked through a symlink, which is how `npx`
 * and a global install always invoke it.
 *
 * AD-1 confines `node:fs` to this directory. That confinement is a necessary
 * condition for read-only, not a sufficient one — nothing about living here
 * would stop this file calling `writeFile`. The gate therefore also denies the
 * mutating `fs` surface inside this directory; see `test/architecture.test.ts`.
 */

import { realpathSync } from 'node:fs';

/**
 * Resolve `path` through any symlinks.
 *
 * Returns `path` unchanged when it cannot be resolved — a missing or
 * unreadable path is not this function's problem to report, and a caller
 * comparing the result simply fails to match, which is the safe direction.
 */
export function resolveRealPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Resolve `path` through symlinks *and* through the filesystem's own idea of
 * how it is spelled.
 *
 * `realpathSync.native` defers to the platform's resolver, which on a
 * case-insensitive filesystem returns the casing actually stored on disk. That
 * is what makes canonical paths comparable by bytes: `/Foo` and `/foo` naming
 * one directory come back identically spelled, so nothing downstream has to
 * fold case — and on a case-sensitive filesystem, where two directories really
 * can differ only in case, nothing wrongly folds it either. The question is
 * answered by the volume rather than guessed from the platform, which matters
 * because a case-sensitive volume on a case-insensitive system is a real
 * configuration.
 *
 * Kept separate from `resolveRealPath` rather than replacing it: that function
 * serves the entry-point guard, which was earned by a defect, and its two
 * callers must keep resolving by the same rule as each other rather than by the
 * best available rule.
 */
export function resolveRealPathNative(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}
