/**
 * One canonical path representation, and the comparisons that depend on it.
 *
 * AD-14: platform difference stops at this adapter. Domain code does no path
 * manipulation and no string comparison of paths, because a path is not a
 * string for comparison purposes — `/Foo` and `/foo` are the same directory on
 * macOS and Windows and different ones on Linux, and a symlink makes two
 * spellings of one file. Every later story keys artifact identity by path, so
 * getting this wrong once means the same artifact appearing twice, or two
 * appearing as one.
 *
 * The canonical form is absolute, normalized, spelled the way the filesystem
 * itself spells it, in the platform's own separator, with symlinks resolved. It
 * is deliberately *not* lower-cased. Folding case here would be right on a
 * case-insensitive filesystem and wrong on a case-sensitive one, where two
 * directories really can differ only in case — so the question is put to the
 * volume, via `realpathSync.native`, instead of guessed from the platform.
 * Once that has happened, canonical paths compare by bytes.
 *
 * **With one limit, stated here because this file used to overstate it.** A
 * path that does not exist cannot be resolved, and `canonical` returns it
 * absolute and normalized rather than throwing. That is deliberate and load
 * bearing — recognition's whole job is asking about markers that may be absent
 * — but it means the "symlinks resolved" half of the form holds only for paths
 * that exist, and the brand below certifies neither existence nor resolution.
 * `canonical` and `contains` each say what survives.
 */

import { resolve, relative, isAbsolute, sep } from 'node:path';

import { resolveRealPathNative } from './realpath.ts';

/**
 * A path that has been through `canonical`: absolute, normalized,
 * platform-shaped, and — if it exists — resolved through the platform's own
 * resolver.
 *
 * A branded string rather than a bare one, so a caller cannot pass an
 * un-canonicalized path where a canonical one is required and have it
 * typecheck. That is the whole value — the mistake this file exists to prevent
 * is comparing two paths that were never put in the same form.
 *
 * **What the brand does not assert: that the path exists.** This said
 * "absolute, real", which reads as an existence guarantee the type cannot
 * carry — `canonical` brands a path that is not there, and the suite depends on
 * it doing so. So the brand certifies exactly one thing: that two values of
 * this type were put in the same form and are therefore comparable to each
 * other. A consumer that needs the path to exist has to check, and to say that
 * it checked; `src/cli/location.ts` is where that happens for the project root.
 */
export type CanonicalPath = string & { readonly __canonical: unique symbol };

/**
 * Put `path` in canonical form, resolving it against `from` if it is relative.
 *
 * Resolution happens before symlinks, and symlinks before anything compares the
 * result: an existing link inside the tree pointing outside it cannot pass a
 * containment check by virtue of its spelling.
 *
 * **A path that cannot be resolved is returned absolute and normalized, with
 * any symlinks in it still unresolved.** Missing paths are the ordinary case
 * here, so this does not throw. What that costs is precise: for a path that
 * does not exist, `contains` answers about the spelling rather than the
 * destination, so a path under a link that leaves the tree reads as inside it.
 * No read escapes as a result — the `stat` that follows resolves the link and
 * finds nothing at the far end — but the answer is about the spelling and not
 * about whatever later appears at it, so a passing containment check on a
 * missing path is not a durable claim.
 */
export function canonical(path: string, from?: string): CanonicalPath {
  // `resolve` runs unconditionally, not only for relative input. An absolute
  // path can still need normalizing — `/tmp/nope//a/./b/../c` — and when it
  // does not exist the real-path call returns it untouched, so without this
  // one absent path had as many identities as it had spellings, and the
  // "No such directory" message printed whichever one was typed.
  const absolute = resolve(from ?? process.cwd(), path);
  return resolveRealPathNative(absolute) as CanonicalPath;
}

/**
 * Unwrap a canonical path for display, or for handing back to the filesystem.
 *
 * The body is the identity, and that is the point rather than an omission:
 * because canonicalization goes through the platform's own resolver, canonical
 * form already *is* platform form — separators included — so there is nothing
 * to convert. What this function does is discard the brand, which is the only
 * thing standing between a canonical path and the string APIs that take one.
 */
export function toPlatform(path: CanonicalPath): string {
  return path;
}

/**
 * Whether two canonical paths name the same thing.
 *
 * Byte equality, and it is sufficient *because* they are canonical: the
 * filesystem was already asked how it spells each one, so a case-insensitive
 * volume has returned the same bytes for both and a case-sensitive one has
 * correctly returned different bytes. A `toLowerCase` comparison here would
 * undo that and start reporting two genuinely different directories as one.
 *
 * Trivial by design. The work is in `canonical`, and this exists so that no
 * caller is tempted to write `a === b` against paths that never went through it.
 */
export function identical(a: CanonicalPath, b: CanonicalPath): boolean {
  return a === b;
}

/**
 * Whether `child` is inside `root`, or is `root` itself.
 *
 * Computed with `relative` rather than by prefix matching, because a prefix
 * test says `/home/jamie/project-other` is inside `/home/jamie/project`. Both
 * arguments must already be canonical, so a `..` segment cannot smuggle a path
 * past this whether or not the path exists: `resolve` removed it before the
 * brand was applied.
 *
 * A symlink cannot either — **provided it exists.** For a path that does not,
 * there was nothing to resolve, and this answers about the spelling. See
 * `canonical` for why that is the deliberate trade and what it costs.
 */
export function contains(root: CanonicalPath, child: CanonicalPath): boolean {
  if (identical(root, child)) return true;
  const step = relative(root, child);
  // On a different volume — a Windows drive letter — `relative` returns an
  // absolute path, which is never a child.
  if (isAbsolute(step)) return false;
  // `..` exactly, or a leading `..` segment. Testing `startsWith('..')` alone
  // rejected legitimate children: a directory really can be called `..foo`,
  // and `relative` only ever emits `..` at the start of its result, so the
  // segment boundary is what distinguishes an escape from a name.
  return step !== '..' && !step.startsWith(`..${sep}`);
}
