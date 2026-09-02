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
 *      is asked, so neither passes by virtue of its spelling. For a path
 *      `realpathSync.native` could not resolve there is nothing to resolve,
 *      and containment answers about the spelling instead — see `canonical`.
 *      No read escapes as a result, and the reason is **not** that the far end
 *      is empty: it is that `resolveWithin` runs on every single operation, so
 *      the containment question is re-asked, against a freshly canonicalized
 *      path, at the moment of each read. A file that does appear at the far end
 *      of an escaping link therefore resolves *then* and is refused then —
 *      `test/adapters/paths.test.ts` asserts exactly that, with
 *      `entryAt('escape/secret.txt')` throwing. What the spelling-only answer
 *      costs is narrower than it looks: a containment check on an unresolvable
 *      path is not a durable claim about that path, but no read is ever
 *      performed on the strength of an earlier check.
 *
 * There is no way for a caller to skip the check. That is the design: a reader
 * that could be handed an already-checked path would eventually be handed one
 * that was not.
 *
 * **One resolution answer is a value rather than a throw.** `resolveDeclared`
 * is for a location the *project* declared — `story_location`, FR-74 — where
 * being outside the root is a normal shape to report rather than a defect to
 * stop on. It performs AD-10's sanitizer check and AD-9's containment check,
 * and every *read* on this class still goes through `resolveWithin` and still
 * throws.
 *
 * **What it does and does not touch, stated precisely, because an earlier
 * version of this paragraph overstated it.** It claimed "no read at all" and
 * that "a path outside the root by its spelling is refused before any syscall
 * touches it". Neither survives measurement. `resolveDeclared` performs exactly
 * one filesystem operation on the declared value: `realpathSync.native`, the
 * *resolution* AD-9 mandates when it says such a value is "resolved and
 * refused". That resolver follows the path's own links, so for a value that
 * leads out of the root it necessarily touches the far end — `<root>/link` with
 * `link → /etc` reads the link and then resolves `/etc`.
 *
 * The honest invariant, and it is the one that matters: **nothing outside the
 * root is ever read.** No content is opened, no directory is enumerated, no
 * `stat` is performed for kind or size, and nothing is served. What happens is
 * resolution, and both alternatives to it were measured and are worse:
 *
 *   - Refusing from the spelling alone reports a **correct in-project location
 *     as out-of-tree** whenever the project is reached through a symlinked
 *     ancestor — `/tmp → /private/tmp` on macOS, any symlinked home — because
 *     the root is canonical and the declared spelling is not, so the two are
 *     not in the same form. Reproduced; it was this method's own defect.
 *   - Admitting from the spelling alone lets a link inside the project that
 *     points out of it be read, which is the case confinement exists for.
 *
 * So resolution happens, once, and the answer is decided on the resolved form
 * — the same rule `resolveWithin` applies to every other path in this class,
 * which is also what keeps `resolveDeclared` from disagreeing with the reader
 * beside it about which paths are inside the project.
 *
 * **Enumeration lives here too, and it has to.** AD-10's one scoped exception
 * is the CLI's suggestion scan — directory *names*, no recursion, no read —
 * which is not what a walk over the artifact tree does, so `list.ts` cannot
 * serve it and the walk in `walk.ts` is built on `childrenOf` instead. What
 * enumeration adds to the two properties above is a second resolve-and-confine
 * pass per operation rather than one: the directory is resolved and checked
 * before `readdir` touches it, and then every child is resolved and checked
 * again before it is handed back, because a child can be a symlink and a
 * symlink is the case where the spelling and the destination disagree.
 *
 * Enumeration also needs something the rest of this file does not: to know
 * whether resolution *happened*. `canonical` is silent about that by design, so
 * the enumeration path goes through `canonicalWithResolution` and refuses to
 * call anything `present` whose real path the platform could not produce — a
 * `present` verdict carries an identity, and an identity built from a spelling
 * is the duplicate this whole surface exists to prevent.
 */

import { statSync, readFileSync, readdirSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

import {
  canonical,
  canonicalWithResolution,
  contains,
  toPlatform,
  type CanonicalPath,
} from './paths.ts';
import { sanitizeDeclaredPath, type SegmentRule } from './segments.ts';
// AD-8's stage vocabulary, shared rather than re-spelled here. A port may
// depend on the domain; the reverse is what the purity gate forbids.
import type { ReadStage, SignalState } from '../../domain/signal.ts';

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

/**
 * The kind a `Dirent` may be trusted for, or `undefined` when it must be probed.
 *
 * **Positively, or not at all.** A `Dirent` is filled from the directory
 * entry's `d_type`, and a filesystem is allowed to answer `DT_UNKNOWN` — at
 * which point *every* `isX()` returns false. Deciding by `!isSymbolicLink()`
 * therefore reads "unknown" as "definitely not a link", skips the probe, and
 * reports a real directory as `other`, which the walk then never descends: a
 * whole subtree missing, with no truncation to say so.
 *
 * Exported and taking a shape rather than a `Dirent` so this decision is
 * testable on its own. `DT_UNKNOWN` cannot be produced on an ordinary
 * development filesystem, so a test that went through `readdir` could not
 * distinguish this rule from the defective one, and the guard would be a
 * comment rather than a claim.
 */
export function trustedKind(dirent: {
  isDirectory(): boolean;
  isFile(): boolean;
}): 'directory' | 'file' | undefined {
  if (dirent.isDirectory()) return 'directory';
  if (dirent.isFile()) return 'file';
  return undefined;
}

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

/**
 * Where a child of an enumerated directory stopped being usable.
 *
 * Named rather than inferred from the message, because Story 1.9's contract is
 * "naming what failed and at which stage" and a raw `EACCES` string does not
 * say which question was being asked when it arrived. Three stages, and they
 * are genuinely different failures:
 *
 *   - `confinement` — the path resolved to somewhere outside the root. Not an
 *     error at all in the OS sense: the filesystem answered perfectly well and
 *     the answer was refused. Nothing was read and nothing will be.
 *   - `resolve` — `realpathSync.native` could not resolve the path: `EACCES` on
 *     the way through it, `ELOOP`, `ENAMETOOLONG`, or a dangling link's
 *     `ENOENT`. This is the stage that matters most, because it is exactly when
 *     the canonical form degrades to the *spelling* — so a path that reaches
 *     this stage has no trustworthy identity. See `Child`.
 *   - `read-directory` — the path resolved and is in bounds, and `readdir`
 *     still refused it.
 *
 * Derived from `src/domain/signal.ts`'s `ReadStage` rather than restated, so
 * this cannot name a stage that vocabulary lacks. What that does **not** do is
 * tie the entry types to it: `Child` below and `WalkEntry` in `walk.ts` spell
 * their stages as inline literals and neither references this alias, so the
 * only mechanical check is one level further out — `src/cli/inventory.ts`
 * assigns a walk entry's stage into a `ReadStage`, and dropping a name from
 * `ReadStage` fails to compile there. Measured, after an earlier version of
 * this comment claimed the pin was here.
 */
export type ChildStage = Extract<ReadStage, 'confinement' | 'resolve' | 'read-directory'>;

/**
 * A path refused for resolving outside the permitted root.
 *
 * A class rather than a message to match on, so a caller can tell the refusal
 * apart from every other throw. `walk.ts` is the caller that needs to: a
 * confinement refusal is a decision it reports as `unchecked`, while a
 * `TypeError` or a limit-validation `Error` is a defect, and reporting the
 * second as "refused for being outside the project" would send a reader to
 * look at their project for a bug in this code.
 */
export class ConfinementError extends Error {
  readonly refused: CanonicalPath;
  readonly root: CanonicalPath;

  constructor(refused: CanonicalPath, root: CanonicalPath) {
    super(
      `refusing to read outside the project: ${toPlatform(refused)} is not within ${toPlatform(root)}`,
    );
    this.name = 'ConfinementError';
    this.refused = refused;
    this.root = root;
  }
}

/**
 * One child of an enumerated directory, in AD-8's vocabulary.
 *
 * **Only the `present` variant carries a `path`, and that is the load-bearing
 * part of this type rather than an omission.** A resolved absolute path is what
 * artifact identity is keyed by (AD's identity convention), and the canonical
 * form degrades to the *spelling* for anything the platform's resolver could
 * not resolve — `EACCES`, `ELOOP`, `ENAMETOOLONG`. Keying a spelling would hand
 * two names for one thing two identities, which is exactly the duplicate a walk
 * over symlinked trees exists to prevent, and `ELOOP` is the cycle case. So a
 * child whose resolution failed has no `path` field for a caller to key on: the
 * mistake is not discouraged, it is unavailable.
 *
 * The state and the stage are paired rather than free, for the same reason:
 * `unchecked` happens only at `confinement` and `absent` only at `resolve`, so
 * the combinations the prose calls impossible do not typecheck either.
 */
export type Child =
  | {
      readonly name: string;
      readonly state: 'present';
      /** The resolved absolute path — the identity, safe to key by. */
      readonly path: CanonicalPath;
      readonly kind: 'directory' | 'file' | 'other';
    }
  | {
      readonly name: string;
      readonly state: 'unchecked';
      readonly stage: 'confinement';
      readonly reason: string;
    }
  | {
      readonly name: string;
      readonly state: 'absent' | 'unreadable';
      readonly stage: 'resolve';
      readonly reason: string;
    };

/**
 * What one directory's children turned out to be, or why there is no list.
 *
 * `ok: false` rather than a throw for a directory that is merely absent or
 * unreadable: that is a value the caller reports and carries on from (AD-7),
 * and a walk that threw here would lose every sibling and everything below
 * them — the defect `test/support/gate.ts` still has. Confinement is the one
 * refusal that still throws, because there is no sensible way to continue from
 * a caller asking to enumerate outside the project.
 *
 * Both failure stages are producible and neither combination is spurious:
 * `resolve` when the directory's own path could not be resolved, and
 * `read-directory` when it resolved, passed confinement, and `readdir` refused.
 */
export type ChildListing =
  | {
      readonly ok: true;
      readonly children: readonly Child[];
      /** True when the directory held more kept children than `limit` allowed. */
      readonly truncated: boolean;
    }
  | {
      readonly ok: false;
      readonly state: 'absent' | 'unreadable';
      readonly stage: 'resolve' | 'read-directory';
      readonly reason: string;
    };

/**
 * Where a **declared** location landed, as a value rather than as a throw.
 *
 * The one non-throwing resolution answer this reader offers, and the reason it
 * is an exception rather than a softening of `resolveWithin`. Confinement
 * throws because a path outside the root is "either a defect or an attempt, and
 * both want to stop here and be named" — true of a path the *tool* composed.
 * A `story_location` outside the root is neither: FR-74 says such a value is a
 * normal per-project shape and `/custom/stories` is an explicitly tested one,
 * and AD-9 says it is "recorded as out-of-tree and reported, never read and
 * never served". A refusal that has to be *reported* cannot be an exception
 * whose only sensible handling is to stop.
 *
 * The precedent is `src/cli/location.ts`, which wraps a marker-out-of-tree
 * throw in a `try` to turn it into a typed `Refusal` — and records that
 * uncaught, it reached the user as a Node stack trace and exit 1. This is the
 * same conversion done at the source rather than at the caller, so no second
 * caller has to remember the `try`.
 *
 * **Four answers, and the fourth is the one this type used to lie about.**
 * `ok: true` once promised a path that was "canonical, resolved, and confirmed
 * inside the root", over a value produced by `canonical` — which *degrades
 * silently to the unresolved spelling* whenever `realpathSync.native` fails, as
 * `paths.ts`'s own header says at length. Probed: a declared `nope/deeper`
 * came back `ok: true` with nothing resolved, so the containment re-ask had
 * checked a spelling, and a symlink created there afterwards would lead out
 * with that record still standing. So resolution now goes through
 * `canonicalWithResolution`, whose whole purpose is a caller that must not be
 * degraded silently, and a path that could not be resolved gets its own answer
 * rather than a promise nothing kept.
 */
export type DeclaredLocation =
  | {
      readonly ok: true;
      /**
       * Resolved by the platform's own resolver and confirmed inside the root.
       *
       * The full promise, and it is now backed: `resolved: true` came back from
       * `canonicalWithResolution`, so symlinks in this path were followed
       * before containment was asked. Safe to key by and safe to read.
       */
      readonly path: CanonicalPath;
    }
  | {
      readonly ok: false;
      readonly outcome: 'out-of-tree';
      /**
       * The path as resolved, for the report — **never** to read from.
       *
       * Absolute and normalized, so `..` is gone and the reported path is the
       * place the value actually named. Symlinks are resolved too unless the
       * resolver could not answer, in which case this is the spelling and the
       * refusal was decided conservatively from it.
       *
       * **The path is all this variant carries, and that is deliberate.** It
       * once carried a `reason` as well, which no caller consumed and which was
       * a *second*, non-normative phrasing of a fact `EXPERIENCE.md`'s string
       * index already owns — `Story location points outside the project:
       * <path>. Not read.` — and which additionally printed the absolute
       * project root. One fact, one sentence, and the sentence is the index's:
       * `src/domain/sprint.ts` composes it from this path.
       */
      readonly path: CanonicalPath;
    }
  | {
      readonly ok: false;
      readonly outcome: 'unresolved';
      /**
       * Inside the root **by its spelling**, and the resolver could not answer.
       *
       * Not an error and usually not even a surprise: the ordinary cause is
       * that the directory is not there, which for a configured location is a
       * fact to report rather than a failure — FR-75 asks for sprint-derived
       * views to be "unavailable rather than empty or broken", and an
       * `in-tree` answer that meant nothing about whether the place existed
       * could not express that. `EACCES` on an intermediate directory, `ELOOP`
       * and `ENAMETOOLONG` arrive here too, which is why the resolver's own
       * `code` travels with it rather than being flattened into the sentence.
       *
       * It carries no path a caller may read, deliberately: the value is a
       * spelling, symlinks in it are unresolved, and containment therefore
       * answered about the spelling. `reportedPath` is for the report only.
       */
      readonly reportedPath: CanonicalPath;
      readonly code: string | undefined;
      readonly reason: string;
    }
  | {
      readonly ok: false;
      readonly outcome: 'refused';
      /** Which sanitizer rule fired, so a caller reports it rather than parses it. */
      readonly rule: SegmentRule;
      readonly component: string;
      readonly reason: string;
    };

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
 * than an argument someone can forget.
 *
 * **One root, settled.** This comment used to promise that a later story would
 * widen it to a *set* of permitted roots, once a configured artifact location
 * became the second member. That widening is cancelled: AD-9's rule was
 * narrowed to a single root on 2026-09-02, because the story that would have
 * supplied the second member (FR-10, artifact roots from the project's own
 * config) is deferred indefinitely. A second root is now an architecture
 * change with a spine edit behind it, not an anticipated next step — so code
 * here may rely on there being one, and a reader that needs to reach two
 * places is a signal to revisit AD-9 rather than to add a member.
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
    if (!contains(this.#root, target)) throw new ConfinementError(target, this.#root);
    return target;
  }

  /**
   * Resolve a location a project *declared*, and report where it landed.
   *
   * AD-10's two checks, in the order that makes each of them mean something:
   *
   *   1. **Sanitize the spelling** (`sanitizeDeclaredPath`). No filesystem
   *      access at all, so a NUL, a separator inside a component, a hidden
   *      name, a Windows drive or stream marker, or an over-long value is
   *      refused before any syscall could carry it. `.` and `..` pass, because
   *      in a declared location they are navigation and step 2 resolves them.
   *      What step 2 is handed is the spelling **rebuilt from the components
   *      that were checked**, not the raw string, so no platform can resolve a
   *      decomposition different from the one that was validated.
   *   2. **Resolve once, through `canonicalWithResolution`.** This is the
   *      resolution AD-9 mandates ("resolved and refused") and the reason it is
   *      not `canonical`: `canonical` degrades to the spelling in silence, so a
   *      caller that must not be degraded silently uses the form that says
   *      whether resolution happened. It is also the same resolution
   *      `resolveWithin` performs for every other path in this class, which is
   *      what keeps this method from disagreeing with the reader beside it
   *      about which paths are inside the project.
   *   3. **Ask containment on the best form there is, and say which it was.**
   *      Resolved and inside → `ok`, with the full promise the type makes.
   *      Resolved and outside → `out-of-tree`, reporting where it actually
   *      went. Unresolved and inside *by spelling* → `unresolved`, which is a
   *      real answer rather than a failure and never a readable path.
   *      Unresolved and outside by spelling → `out-of-tree`, decided
   *      conservatively from the spelling, which is the direction that cannot
   *      admit anything by mistake.
   *
   * **The trade this order takes, stated because the previous version hid it.**
   * Resolving first means the resolver touches the far end of a value that
   * leads out of the root. Refusing from the spelling first would avoid that
   * and was measured to be wrong: with the root canonicalized to
   * `<base>/real/proj` and `<base>/alias → <base>/real`, a declared
   * `<base>/alias/proj/stories` is the *same directory inside the project* and
   * was reported out-of-tree, permanently, with no recovery — the ordinary
   * macOS and symlinked-home shape. Both paths carried the `CanonicalPath`
   * brand while not being in the same form, which is the one thing that brand
   * exists to guarantee. Nothing outside the root is *read*: no content, no
   * listing, no `stat` for kind or size. See this file's header.
   *
   * Never throws, for anything: this is the shape half of confinement, and a
   * shape is reported.
   */
  resolveDeclared(declared: string): DeclaredLocation {
    const checked = sanitizeDeclaredPath(declared);
    if (!checked.ok) {
      return {
        ok: false,
        outcome: 'refused',
        rule: checked.rule,
        component: checked.component,
        reason: checked.reason,
      };
    }

    const resolution = canonicalWithResolution(checked.normalized, toPlatform(this.#root));
    const inside = contains(this.#root, resolution.path);

    if (!resolution.resolved) {
      // The value is the spelling, so containment answered about the spelling.
      // Outside by that answer is a refusal — conservative, and the direction
      // that cannot admit anything by mistake. Inside by that answer is *not*
      // an admission: it is `unresolved`, which carries no readable path.
      if (!inside) {
        return { ok: false, outcome: 'out-of-tree', path: resolution.path };
      }
      return {
        ok: false,
        outcome: 'unresolved',
        reportedPath: resolution.path,
        code: resolution.code,
        reason: resolution.reason,
      };
    }

    if (!inside) {
      return {
        ok: false,
        outcome: 'out-of-tree',
        path: resolution.path,
      };
    }
    return { ok: true, path: resolution.path };
  }

  /**
   * Resolve `path`, refuse it if it escapes, and say whether it resolved.
   *
   * The three questions enumeration has to ask in one place, because the order
   * is the correctness:
   *
   *   1. **Resolve.** So a link is judged by where it goes, never by where it
   *      sits.
   *   2. **Confine, on the best available form.** Containment is asked even
   *      when resolution failed, and it is asked *first*, so an unresolvable
   *      path outside the root is still refused as a refusal rather than
   *      reported as an ordinary absence. That is the conservative direction:
   *      for an unresolved path the answer is about the spelling, which is
   *      documented in `paths.ts` and is why step 3 exists.
   *   3. **Report the resolution failure.** A path that could not be resolved
   *      never becomes `present`, whatever a `stat` would have said about it.
   *      This is the correction that earned `canonicalWithResolution`: probing
   *      with `statSync` and inferring resolution from its success is wrong,
   *      because they are different syscalls with different failure sets — a
   *      path `stat` accepts and `realpathSync.native` refuses would have been
   *      marked `present` with an identity built from a spelling.
   */
  #resolveChecked(
    path: string,
  ):
    | { readonly ok: true; readonly path: CanonicalPath }
    | { readonly ok: false; readonly state: 'absent' | 'unreadable'; readonly reason: string } {
    const resolution = canonicalWithResolution(path, toPlatform(this.#root));
    if (!contains(this.#root, resolution.path)) {
      throw new ConfinementError(resolution.path, this.#root);
    }
    if (!resolution.resolved) {
      return {
        ok: false,
        state: resolution.code === 'ENOENT' || resolution.code === 'ENOTDIR' ? 'absent' : 'unreadable',
        reason: resolution.reason,
      };
    }
    return { ok: true, path: resolution.path };
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
   * The children of one directory, each re-resolved and re-confined.
   *
   * The enumeration `ConfinedReader` did not have, and the reason the walk in
   * `walk.ts` does not use `list.ts`: AD-10's scoped exception covers a scan
   * that reads *names* outside every permitted root and never recurses, which
   * is the opposite of what a recursing reader does. So enumeration lands here,
   * behind the same check as every other operation.
   *
   * Two resolve-and-confine passes, not one, and the second is the one that
   * matters. The directory is resolved and checked before `readdir` touches it
   * — including a resolution failure, so `readdir` can never follow an
   * unresolvable link and enumerate names from outside the root. Then **every
   * child is resolved and confinement-checked again before it is returned**,
   * because a child can be a symlink, and a symlink is precisely the thing
   * whose spelling says one place and whose destination says another. A child
   * that resolves outside the root comes back `unchecked` at the `confinement`
   * stage: named, so nothing disappears, and never stat'd, so nothing outside
   * the tree is even asked about.
   *
   * `limit` is required, on `listChildDirectories`' precedent: an unbounded
   * listing is the thing this signature exists to make impossible to ask for by
   * accident, and a default would be the one value nobody chose. `keep` is that
   * module's other lesson, applied for the same reason it was learned there: it
   * runs **before** the cap, because a cap spent on names the caller was always
   * going to discard is a cap on the wrong thing — a directory holding `limit`
   * dot-directories otherwise returns nothing but dot-directories. It is
   * mechanism only; which names to skip is policy, and policy lives with the
   * caller (Story 1.7), never hardcoded here.
   *
   * Names are sorted before the cap, so a truncated listing is the same listing
   * every time, and the cap is applied before any child is probed, so it bounds
   * syscalls and not merely the array length.
   *
   * **What the cap does not bound is the entry list `readdirSync` builds.**
   * `deferred-work.md` records that as an open finding against `list.ts`, and
   * this is the "larger appetite" caller it named as the trigger. The decision
   * taken here is deliberate and recorded there: the materialization stays.
   * Streaming with `opendirSync` means owning a `Dir` handle and its close on
   * every failure path, and the failure paths are exactly what this module is
   * for — a handle leaked on an `EACCES` mid-iteration would be a worse defect
   * than the memory spike it avoids, in a tool whose directories are project
   * folders rather than mail spools. Nothing is allocated *on top of* that
   * array beyond one in-place sort and one slice.
   */
  childrenOf(
    path: string,
    limit: number,
    keep: (name: string) => boolean = () => true,
  ): ChildListing {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`childrenOf needs a whole limit of 1 or more, got ${JSON.stringify(limit)}`);
    }

    const resolved = this.#resolveChecked(path);
    if (!resolved.ok) {
      return { ok: false, state: resolved.state, stage: 'resolve', reason: resolved.reason };
    }
    const directory = resolved.path;

    let entries: Dirent[];
    try {
      entries = readdirSync(toPlatform(directory), { withFileTypes: true });
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      return {
        ok: false,
        state: code === 'ENOENT' || code === 'ENOTDIR' ? 'absent' : 'unreadable',
        stage: 'read-directory',
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    // Sorted and sliced in place on the array `readdir` already built, rather
    // than through a names array and a lookup `Map`. The earlier version of
    // this tripled the footprint of the very allocation the paragraph above
    // defends keeping, which made the record of that decision wrong.
    const kept = entries.filter((entry) => keep(entry.name));
    kept.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    return {
      ok: true,
      truncated: kept.length > limit,
      children: kept.slice(0, limit).map((entry) => this.#child(directory, entry)),
    };
  }

  /**
   * One child: resolved, then confined, then probed for its kind — in that
   * order, which is the whole content of this function.
   *
   * Resolution and confinement are `#resolveChecked`'s, so a child whose
   * resolution failed cannot come back `present` and cannot come back with a
   * `path`. What is left here is the *kind*, and there are two ways to learn it:
   *
   *   - A `Dirent` that **positively** answers `isDirectory()` or `isFile()` is
   *     trusted, and needs no second syscall. That rule lives in `trustedKind`,
   *     which is exported so it can be tested against a `DT_UNKNOWN`-shaped
   *     entry no real development filesystem will produce.
   *   - Everything else is probed with `statSync`, which follows the link. A
   *     symlink, a `DT_UNKNOWN` entry, a fifo: all take this route, and the
   *     stat is only ever performed on a path already known to resolve inside
   *     the root.
   */
  #child(directory: CanonicalPath, dirent: Dirent): Child {
    const name = dirent.name;
    const childPath = join(toPlatform(directory), name);

    let resolved;
    try {
      resolved = this.#resolveChecked(childPath);
    } catch (error: unknown) {
      if (!(error instanceof ConfinementError)) throw error;
      return { name, state: 'unchecked', stage: 'confinement', reason: error.message };
    }
    if (!resolved.ok) {
      return { name, state: resolved.state, stage: 'resolve', reason: resolved.reason };
    }

    const trusted = trustedKind(dirent);
    if (trusted !== undefined) return { name, state: 'present', path: resolved.path, kind: trusted };

    try {
      const stats = statSync(toPlatform(resolved.path));
      const kind = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
      return { name, state: 'present', path: resolved.path, kind };
    } catch (error: unknown) {
      // Reachable only by a change under our feet: the path resolved a moment
      // ago, so this is a race rather than a shape. Reported at the `resolve`
      // stage all the same, and without a `path`, because a child we could not
      // finish asking about is not an identity.
      const code = (error as { code?: string }).code;
      return {
        name,
        state: code === 'ENOENT' || code === 'ENOTDIR' ? 'absent' : 'unreadable',
        stage: 'resolve',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
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
   *
   * **A failure names a typed state and a typed stage as well as its reason**,
   * in the same shape `Child` above already uses and for the same reason: a raw
   * OS message does not say which question was being asked when it arrived, or
   * whether the thing is missing or merely unusable. Without them the only way
   * to tell an over-limit refusal from a decode failure was to pattern-match
   * the English in `reason`, which is what the untyped-`reason` finding in
   * `deferred-work.md` (summary: "`Listing`'s failure carries an untyped
   * `reason: string`") says not to build on.
   *
   * The two closed vocabularies are **narrowed to what this path can actually
   * produce**, rather than restating the whole of either:
   *
   *   - `absent` for `ENOENT`/`ENOTDIR` and `unreadable` for everything else,
   *     which is the same rule `#child` applies one method up. Deciding it here
   *     matters: a file the walk saw and that vanished before the read arrives
   *     as `absent`, the same state the walk itself would have reported, rather
   *     than as `unreadable` — one physical fact with one answer.
   *   - `resolve` when the stat itself failed (a dangling link's `ENOENT`,
   *     `ELOOP`, `ENAMETOOLONG`, `EACCES` through a denied parent — the path
   *     never resolved, so nothing was examined), `examine` when the stat
   *     succeeded and the file was refused on its kind or its size, `read` for
   *     the bytes, `decode` for bytes that are not UTF-8. Never `confinement`,
   *     which *throws* (see `resolveWithin`), and never `read-directory`, which
   *     belongs to enumeration.
   *
   * The vocabulary comes from `src/domain/signal.ts` rather than from a fourth
   * copy of it here. That direction is the permitted one — a port may depend on
   * the domain, never the reverse — and it is what makes the state and stage
   * this returns the same closed values the model and the UI use.
   */
  readText(
    path: string,
  ):
    | { readonly ok: true; readonly text: string }
    | {
        readonly ok: false;
        readonly state: Extract<SignalState, 'absent' | 'unreadable'>;
        readonly stage: Extract<ReadStage, 'resolve' | 'examine' | 'read' | 'decode'>;
        readonly reason: string;
      } {
    const target = this.resolveWithin(path);
    const platform = toPlatform(target);

    let size: number;
    try {
      const stats = statSync(platform);
      if (!stats.isFile()) {
        return {
          ok: false,
          state: 'unreadable',
          stage: 'examine',
          reason: `not a regular file (${describeKind(stats)})`,
        };
      }
      size = stats.size;
    } catch (error: unknown) {
      // The stat failed, so the path was never resolved to something to look
      // at: `resolve`, not `examine`. `ENOENT`/`ENOTDIR` is the file being
      // gone, which is `absent` — the walk's own answer for the same fact.
      const code = (error as { code?: string }).code;
      return {
        ok: false,
        state: code === 'ENOENT' || code === 'ENOTDIR' ? 'absent' : 'unreadable',
        stage: 'resolve',
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    if (size > MAX_READ_BYTES) {
      return {
        ok: false,
        state: 'unreadable',
        stage: 'examine',
        reason: `file is ${String(size)} bytes, over the ${String(MAX_READ_BYTES)}-byte read limit`,
      };
    }

    let bytes: Buffer;
    try {
      bytes = readFileSync(platform);
    } catch (error: unknown) {
      // The stat succeeded and the open did not: a file denied `0o000` inside a
      // readable directory is the ordinary case, and it is `read` rather than
      // `examine` because everything `examine` asks about was answered.
      const code = (error as { code?: string }).code;
      return {
        ok: false,
        state: code === 'ENOENT' || code === 'ENOTDIR' ? 'absent' : 'unreadable',
        stage: 'read',
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      return { ok: true, text: new TextDecoder('utf8', { fatal: true }).decode(bytes) };
    } catch {
      return { ok: false, state: 'unreadable', stage: 'decode', reason: 'not valid UTF-8 text' };
    }
  }
}
