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
 *
 * **Returns `path` unchanged on any failure, not only on a missing path.** The
 * `catch` is bare, so `EACCES` on an intermediate directory, `ELOOP` and
 * `ENAMETOOLONG` all take the same route as `ENOENT`. `paths.ts` documents what
 * that costs and `test/adapters/paths.test.ts` pins it; the point of saying it
 * here is that a caller cannot tell the reasons apart from the return value,
 * and must not write a comment implying it can.
 */
export function resolveRealPathNative(path: string): string {
  const attempt = tryResolveRealPathNative(path);
  return attempt.ok ? attempt.path : path;
}

/**
 * What `realpathSync.native` said, failure included.
 *
 * The same call as `resolveRealPathNative`, with the answer it swallows. That
 * swallowing is deliberate for the callers that only want a comparable form —
 * recognition asks about markers that may be absent, and a missing path is not
 * an error there — but it leaves a caller no way to tell "resolved" from
 * "could not be resolved, here is the spelling instead". A walk cannot live
 * with that: identity is the resolved absolute path, so a caller that keys one
 * has to know the resolution actually happened. `statSync` is *not* a substitute
 * probe, which is the correction that earned this function: it is a different
 * syscall with a different failure set, so a path it accepts can still be one
 * `realpathSync.native` refuses — `ENAMETOOLONG` on the expanded chain being
 * the named case — and a `present` verdict taken from a stat would then carry
 * an identity built from a spelling.
 *
 * One call site for `realpathSync.native` in the whole project, so the two
 * behaviours cannot drift: `resolveRealPathNative` is this function with the
 * failure discarded, rather than a second `try`/`catch` that might catch
 * differently.
 */
export function tryResolveRealPathNative(
  path: string,
):
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly code: string | undefined; readonly reason: string } {
  try {
    return { ok: true, path: realpathSync.native(path) };
  } catch (error: unknown) {
    return {
      ok: false,
      code: (error as { code?: string }).code,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
