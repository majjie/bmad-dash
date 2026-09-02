/**
 * Listing one directory's child directories — unconfined, and read-only.
 *
 * The precedent is `realpath.ts`: an fs-adapter module that deliberately steps
 * outside the permitted root while staying strictly read-only, justified here
 * rather than left for a reader to infer. `ConfinedReader` cannot serve this
 * caller by design — the CLI's suggestion scan (Story 1.6, AD-9 rule 2) looks
 * at the target's *ancestors*, and every ancestor is outside the target root by
 * definition, so a confined reader would refuse all of them correctly.
 *
 * **The capability is exactly one thing: the child *directory* names of one
 * directory.** No recursion — the caller owns its own depth bound, so the bound
 * is visible where the policy lives. No file content, ever: this module has no
 * way to read a byte of anything, which is what keeps "unconfined" from
 * widening into "reads whatever it likes". A path is *named* here and never
 * opened, so nothing outside the project is disclosed beyond the fact that a
 * directory exists — which the caller is about to print anyway.
 *
 * **Symlinks are followed, and that is a decision.** A `Dirent` for a symlink
 * answers false to both `isDirectory()` and `isFile()`, so the naive walk skips
 * every one — the defect recorded in `test/support/gate.ts`'s header, which
 * made a symlinked source tree invisible to the read-only gate. A checkout
 * reached through a link is an ordinary way to hold a project, so a link to a
 * directory is a directory here. Termination is therefore not this module's
 * problem to solve and it does not pretend to: it does not recurse, so a cycle
 * is only reachable through a caller that walks, and the caller bounds itself.
 */

import { readdirSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

/**
 * What one directory holds, or why it could not be listed.
 *
 * `ok: false` rather than a throw, because the one caller's rule is that a
 * directory it cannot list is *skipped* — a folder of checkouts containing one
 * the user is denied should still suggest the others. The reason travels
 * anyway, so a future caller that does want to report it can.
 */
export type Listing =
  | {
      readonly ok: true;
      /** Child directory names — not paths — sorted, and capped at the limit. */
      readonly directories: readonly string[];
      /** True when more child directories existed than the limit allowed. */
      readonly truncated: boolean;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Whether `entry` names a directory, resolving a link to find out.
 *
 * A dangling link, and one whose target cannot be stat'd, are both "not a
 * directory" here. Neither is this module's failure to report: the caller is
 * looking for project roots, and a link it cannot follow is not one.
 */
function isDirectoryEntry(parent: string, entry: Dirent): boolean {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return statSync(join(parent, entry.name)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The child directory names of `path`, at most `limit` of them.
 *
 * `limit` is required rather than defaulted: an unbounded listing is the thing
 * this signature exists to make impossible to ask for by accident, and a
 * default would be the one value nobody chose.
 *
 * `keep` names the children worth considering, and is applied **before** the
 * cap for the reason recorded at the filter itself: a cap spent on names the
 * caller discards is a cap that hides the answer. It defaults to keeping
 * everything, so a caller with no exclusions writes none.
 *
 * **What the cap bounds is the *directories* returned, not the entries read.**
 * `readdirSync` produces the whole entry list in one call and there is no
 * cheaper way to ask; the cap then limits how many of those the caller will
 * probe and descend into, which is where the cost actually is. So a directory
 * of ten thousand files with three subdirectories returns three and reports no
 * truncation, correctly — files are never candidates and must not consume the
 * budget. Names are sorted before the cap applies, so a truncated listing is
 * the same listing every time rather than whatever order the filesystem
 * happened to return.
 */
export function listChildDirectories(
  path: string,
  limit: number,
  keep: (name: string) => boolean = () => true,
): Listing {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(
      `listChildDirectories needs a whole limit of 1 or more, got ${JSON.stringify(limit)}`,
    );
  }

  let entries: Dirent[];
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch (error: unknown) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  // `keep` runs **before** the cap, which is the whole reason it is a parameter
  // rather than something the caller applies to the result. It was applied
  // afterwards for one review round, and because `.` sorts ahead of every
  // letter in ASCII, a directory holding `limit` dot-directories returned
  // nothing but dot-directories — which the caller then filtered away, hiding
  // every real project beside them. A cap spent on entries the caller was
  // always going to discard is a cap on the wrong thing.
  const directories = entries
    .filter((entry) => keep(entry.name) && isDirectoryEntry(path, entry))
    .map((entry) => entry.name)
    .sort();

  return {
    ok: true,
    directories: directories.slice(0, limit),
    truncated: directories.length > limit,
  };
}
