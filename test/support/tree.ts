/**
 * Trees to walk: symlinks, cycles and dangling links — plus a guarded wrapper
 * for denying a directory while a test runs.
 *
 * The denial is deliberately *not* a `TreeNode`, and the header used to claim
 * it was. A denied directory cannot be part of a declaratively built tree
 * because the restore cannot be a cleanup hook: `makeScratchDir` registers its
 * recursive delete first, so a later hook would run after it and the delete
 * fails on a directory it cannot enter. `whileDenied` scopes the denial to the
 * body instead, which is the only shape that composes with the cleanup that
 * already exists.
 *
 * Nothing in `test/support/` made a symlink before this. Every test that needed
 * one called `symlink()` inline, and `deferred-work.md` records the result —
 * roughly twenty unguarded calls across seven files, none passing a link type,
 * so on Windows without elevation they throw `EPERM` and the tests **error**
 * rather than skip. An error names the wrong thing: the suite reports a broken
 * test where the honest report is "this platform cannot make the fixture".
 *
 * So the two platform questions are asked here, once, and answered by
 * measurement rather than by platform name:
 *
 *   - `symlinksAvailable()` actually creates a link in a throwaway directory
 *     and reports whether it worked. Elevated Windows can make symlinks and
 *     unelevated Windows cannot, which no `process.platform` check can tell
 *     apart.
 *   - `deniableDirectories()` is false on Windows, where a POSIX mode is not
 *     how permissions work, and false for root, who is not denied by `0o000` —
 *     the case `read.test.ts` already learned to skip out loud rather than
 *     pass silently.
 *
 * Every link carries a required `type`. That is the second half of the recorded
 * defect: Windows needs to know whether a link is to a file or a directory at
 * creation time, and a fixture that omits it makes a link of the wrong kind
 * there even when it has the privilege to make one at all.
 */

import { mkdir, writeFile, symlink, chmod, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

import { makeScratchDir } from './project.ts';

/** What Windows needs told at creation time; harmless and correct on POSIX. */
export type LinkType = 'dir' | 'file';

/**
 * One thing to create, applied in the order given.
 *
 * Order is the fixture language: a link to a directory that is declared later
 * is a *dangling* link at the moment it is made and a live one afterwards, so
 * declaring the target first or second is how a test says which it wants.
 *
 * Two link variants, because a walk fixture needs both kinds of target and
 * conflating them hides the difference:
 *
 *   - `to` is a path inside the tree (or an absolute path), turned into an
 *     absolute target. What almost every fixture wants, including the escaping
 *     link, whose target is deliberately outside the tree.
 *   - `literally` is written into the link verbatim, which is the only way to
 *     build a target that resolves relative to the link's own directory —
 *     `{ link: 'loop', literally: 'loop' }` is the self-referential link the
 *     `ELOOP` row needs, and no absolute target can express it.
 */
export type TreeNode =
  | { readonly dir: string }
  | { readonly file: string; readonly text?: string }
  | { readonly link: string; readonly to: string; readonly type: LinkType }
  | { readonly link: string; readonly literally: string; readonly type: LinkType };

let symlinkProbe: Promise<boolean> | undefined;

/**
 * Whether this machine can create the symlinks these fixtures are made of.
 *
 * Measured once and cached, because the answer cannot change inside a run and
 * the probe costs a temporary directory. Measured rather than inferred: the
 * failing configuration is unelevated Windows, and the same Windows with a
 * developer-mode or elevated shell succeeds, so the platform name is not the
 * question. A test whose fixture needs a link asks this and calls `t.skip` with
 * a reason when it is false — `scripts/run-tests.ts` fails the build on any
 * unaccounted skip, so a skipped row is reported, not lost.
 *
 * **The promise this caches can never reject**, and that took a correction. The
 * `mkdtemp` and the `rm` were outside the `try`, so a full disk or a
 * `TMPDIR` that does not exist made the cached promise a rejected one — and
 * every guarded test then *errored* on `await symlinksAvailable()` instead of
 * skipping, which is the exact failure mode this helper was written to remove,
 * relocated from the `symlink` call to the guard in front of it. Everything is
 * inside the `try` now: a probe that cannot even be set up answers "no".
 */
export function symlinksAvailable(): Promise<boolean> {
  symlinkProbe ??= (async (): Promise<boolean> => {
    let probe: string | undefined;
    try {
      probe = await mkdtemp(join(tmpdir(), 'bmad-dash-symlink-probe-'));
      await mkdir(join(probe, 'target'));
      await symlink(join(probe, 'target'), join(probe, 'link'), 'dir');
      return true;
    } catch {
      return false;
    } finally {
      if (probe !== undefined) {
        // Best effort, and swallowed for the same reason as above: a cleanup
        // failure must not turn the answer into a rejection.
        await rm(probe, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  })();
  return symlinkProbe;
}

/**
 * Whether a `0o000` directory is actually denied to this process.
 *
 * Two ways for the answer to be no, and both make an `EACCES` assertion pass
 * for the wrong reason if they are not asked: Windows does not enforce POSIX
 * modes, and root is exempt from them. A test that asserted `unreadable` under
 * root would report a green row over an assertion that never once ran.
 */
export function deniableDirectories(): boolean {
  return process.platform !== 'win32' && process.getuid?.() !== 0;
}

/**
 * Build a tree in a throwaway directory and return its canonical root.
 *
 * Parents are created as needed, so a node can name a nested path without a
 * `dir` node above it. Cleanup belongs to `makeScratchDir`, which registers it
 * against `t` — including for the trees that end up holding a denied directory,
 * which is why `whileDenied` restores the mode instead of leaving it.
 *
 * **Throws rather than skipping when a link cannot be made.** The guard belongs
 * in the test, next to the `t.skip` that reports it; a builder that silently
 * dropped a link would hand back a tree missing the very thing under test and
 * the assertions would pass on a plain directory.
 */
export async function makeTree(
  t: { after: (fn: () => unknown) => void },
  nodes: readonly TreeNode[],
  prefix = 'bmad-dash-tree-',
): Promise<string> {
  const root = await makeScratchDir(t, prefix);

  const resolveInside = (path: string): string => (isAbsolute(path) ? path : join(root, path));

  for (const node of nodes) {
    if ('dir' in node) {
      await mkdir(resolveInside(node.dir), { recursive: true });
      continue;
    }
    if ('file' in node) {
      const target = resolveInside(node.file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, node.text ?? `${node.file}\n`);
      continue;
    }

    if (!(await symlinksAvailable())) {
      throw new Error(
        `makeTree cannot create the link ${node.link}: symlinks are unavailable here. ` +
          'Guard the test with `if (!(await symlinksAvailable())) { t.skip(...); return; }`.',
      );
    }
    const link = resolveInside(node.link);
    await mkdir(dirname(link), { recursive: true });
    await symlink('to' in node ? resolveInside(node.to) : node.literally, link, node.type);
  }

  return root;
}

/**
 * Run `body` with `path` denied, and restore the mode whatever happens.
 *
 * `path` is any path, not only a directory: Story 1.9 denies a *file* with it,
 * which is how the read stage that distinguishes "could not look at it" from
 * "could not open it" is reached at all. `deniableDirectories` is still the
 * right question to ask first — it is about the platform and the user, not
 * about the kind of thing being denied.
 *
 * `mode` is `0o000` unless a caller needs a *partial* denial: Story 1.12's
 * unreadable-root case uses `0o111`, where a directory can be entered but not
 * listed, so recognition's marker `stat`s succeed and only the walk's `readdir`
 * fails. That distinction cannot be reached with a blanket `0o000`, and the
 * seven sites that hand-rolled this pair could each pick their own mode while
 * restoring a guessed `0o755` — which is the divergence the parameter removes
 * rather than the one it adds.
 *
 * Restored in a `finally` rather than an `after` hook for the reason
 * `read.test.ts` records at its own copy of this: the scratch directory
 * registered its cleanup first, so a hook here would run *after* the recursive
 * delete, and the delete fails on a directory it cannot enter. Callers must
 * check `deniableDirectories()` first — this does not, because a caller that
 * skipped the check wants an assertion failure rather than a silent pass.
 */
export async function whileDenied<T>(
  path: string,
  body: () => Promise<T> | T,
  mode = 0o000,
): Promise<T> {
  // Refused rather than attempted where a restrictive mode is not enforced. Left
  // unguarded, `chmod` on Windows and `chmod` as root both *succeed* and deny
  // nothing, so the assertion downstream fails for a reason that has nothing
  // to do with what it was testing. Throwing here names the missing guard.
  if (!deniableDirectories()) {
    throw new Error(
      `whileDenied cannot deny ${path} on this platform or as this user. ` +
        'Guard the test with `if (!deniableDirectories()) { t.skip(...); return; }`.',
    );
  }

  // The mode that was actually there, not an assumed `0o755`. Restoring a
  // guess would silently rewrite a fixture's permissions — harmless for the
  // trees here, and exactly the kind of "the helper edited my setup" surprise
  // that makes a shared helper untrustworthy.
  const original = (await stat(path)).mode & 0o777;
  await chmod(path, mode);
  try {
    return await body();
  } finally {
    await chmod(path, original);
  }
}
