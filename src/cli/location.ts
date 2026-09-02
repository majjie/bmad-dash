/**
 * Where the project is, decided once.
 *
 * AD-9: the root is the target path *itself*, recognized by both markers being
 * present. There is no walk in either direction, and that is a decision rather
 * than a simplification. Walking up would make a command run inside
 * `_bmad-output/` silently resolve the project above it — which sounds helpful
 * until the tool reports a different project than the directory you are
 * standing in. Walking down would make a folder of checkouts resolve to
 * whichever child was found first. Both replace "I could not tell" with a
 * confident wrong answer, so nested and sibling roots are left *unresolvable*
 * instead of resolved by precedence.
 *
 * Story 1.6 adds a bounded scan that suggests the invocation which would have
 * worked. It lives in this directory, produces text, and returns nothing the
 * domain consumes — it must never become a resolution path.
 *
 * Every failure below is distinguishable in its message. "Not a BMAD project"
 * covering a typo'd path, a file, a permissions problem and a genuine
 * non-project would be one sentence hiding four different next actions.
 */

import { canonical, toPlatform, type CanonicalPath } from '../adapters/fs/paths.ts';
import { ConfinedReader } from '../adapters/fs/read.ts';

/**
 * The two directories that make a directory a BMAD project.
 *
 * Both are required. `_bmad` alone is an installed toolchain that has produced
 * nothing; `_bmad-output` alone is output whose toolchain has been removed.
 * Neither is a project this tool can say anything useful about, and treating
 * either as one would mean every later story handling a half-project.
 */
export const MARKERS = ['_bmad', '_bmad-output'] as const;

/**
 * Why a target is not a project.
 *
 * A code as well as the prose, because Story 1.6 has to decide *which* failure
 * it is proposing an invocation for, and the alternative is pattern-matching
 * English — which the tests for this module were already doing, and which
 * breaks the moment a message is reworded.
 *
 * `not-a-project` is the only one Story 1.6's suggestion scan applies to: a
 * mistyped path, a file, or a permissions problem are not answered by
 * "try running it over there".
 */
export type Refusal = 'absent' | 'not-a-directory' | 'unreadable' | 'not-a-project';

export type Location =
  | { readonly ok: true; readonly root: CanonicalPath }
  | { readonly ok: false; readonly reason: Refusal; readonly message: string };

/** The markers, listed the way the failure messages name them. */
function markerList(): string {
  return MARKERS.join(' and ');
}

/**
 * Recognize `target` as a project root, or explain why it is not one.
 *
 * `target` is expected absolute — the CLI resolves it before this is called —
 * and is canonicalized here so the root every later story keys artifacts by is
 * the real path, symlinks resolved and spelled as the filesystem spells it.
 */
export function resolveLocation(target: string): Location {
  const root = canonical(target);
  const reader = new ConfinedReader(root);
  const shown = toPlatform(root);

  // The target itself, before its contents. A missing directory and a file
  // given where a directory belongs are different mistakes with different
  // fixes, and neither is "not a BMAD project".
  const self = reader.entryAt('.');
  if (self.kind === 'absent') {
    return { ok: false, reason: 'absent', message: `No such directory: ${shown}` };
  }
  if (self.kind === 'unreadable') {
    return { ok: false, reason: 'unreadable', message: `Could not read ${shown}: ${self.reason}` };
  }
  if (self.kind !== 'directory') {
    return { ok: false, reason: 'not-a-directory', message: `Not a directory: ${shown}` };
  }

  // Both markers, each of which must itself be a directory. A file named
  // `_bmad` is not an installed toolchain, and accepting it would push the
  // failure into whichever later story first tried to read inside it.
  const missing: string[] = [];
  for (const marker of MARKERS) {
    const entry = reader.entryAt(marker);
    if (entry.kind === 'unreadable') {
      return {
        ok: false,
        reason: 'unreadable',
        message: `Could not read ${shown}/${marker}: ${entry.reason}`,
      };
    }
    if (entry.kind !== 'directory') missing.push(marker);
  }

  if (missing.length > 0) {
    // Naming what is missing only helps when it distinguishes something. With
    // both absent, "_bmad and _bmad-output are missing" restates the sentence
    // before it; with one absent, which one is the whole of the information.
    const detail =
      missing.length === MARKERS.length
        ? 'neither is present'
        : `${missing.join(' and ')} is missing`;
    return {
      ok: false,
      reason: 'not-a-project',
      message: `${shown} is not a BMAD project.\nLooked for ${markerList()}; ${detail}.`,
    };
  }

  // The reader is deliberately *not* returned. Recognition needs one and uses
  // it here; nothing downstream reads the project yet, and handing back a
  // confined reader that no consumer touches is the unconsumed-surface shape
  // this project has now been caught with three times. The story that first
  // reads artifacts can return it — and will have a caller for it.
  return { ok: true, root };
}
