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
