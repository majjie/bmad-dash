/**
 * The confined reading surface.
 *
 * Two things are under test, and only one of them is "does it read files".
 *
 * The other is the refusal. NFR-1's promise is that the tool never touches
 * anything outside the project, and the way that promise fails in practice is
 * not a rogue `writeFile` — it is a path that looked like it was inside the
 * tree and was not. So the interesting assertions here are all about paths that
 * *arrive* looking legitimate: a `..` chain, a symlink planted inside the
 * project pointing out of it, an absolute path handed in directly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonical, toPlatform } from '../../src/adapters/fs/paths.ts';
import {
  ConfinedReader,
  ConfinementError,
  MAX_READ_BYTES,
  trustedKind,
  type ChildListing,
} from '../../src/adapters/fs/read.ts';
import { deniableDirectories, symlinksAvailable, whileDenied } from '../support/tree.ts';

interface Fixture {
  readonly root: string;
  readonly outside: string;
  readonly reader: ConfinedReader;
}

async function fixture(t: { after: (fn: () => unknown) => void }): Promise<Fixture> {
  const base = toPlatform(canonical(await mkdtemp(join(tmpdir(), 'bmad-dash-read-'))));
  t.after(() => rm(base, { recursive: true, force: true }));

  const root = join(base, 'project');
  const outside = join(base, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await writeFile(join(root, 'inside.txt'), 'in the project\n');
  await writeFile(join(outside, 'secret.txt'), 'not yours\n');

  return { root, outside, reader: new ConfinedReader(canonical(root)) };
}

// ---------------------------------------------------------------------------
// Reading what it should
// ---------------------------------------------------------------------------

test('a file inside the project is read', async (t) => {
  const { reader } = await fixture(t);
  const result = reader.readText('inside.txt');
  assert.ok(result.ok, `expected a read, got ${JSON.stringify(result)}`);
  assert.equal(result.ok && result.text, 'in the project\n');
});

test('the entry kinds are distinguishable, and absent is not unreadable', async (t) => {
  const { reader, root } = await fixture(t);
  await mkdir(join(root, 'sub'));

  assert.equal(reader.entryAt('.').kind, 'directory');
  assert.equal(reader.entryAt('sub').kind, 'directory');
  assert.equal(reader.entryAt('inside.txt').kind, 'file');
  assert.equal(reader.entryAt('nope').kind, 'absent');
  // A file where a directory was expected reads as absent *through* it, which
  // is what `ENOTDIR` means and is different from the file itself.
  assert.equal(reader.entryAt('inside.txt/deeper').kind, 'absent');
  assert.equal(reader.isDirectory('sub'), true);
  assert.equal(reader.isDirectory('inside.txt'), false);
  assert.equal(reader.isDirectory('nope'), false);
});

test('a directory that cannot be read is unreadable, not absent', async (t) => {
  const { reader, root } = await fixture(t);
  const denied = join(root, 'denied');
  await mkdir(denied);
  await writeFile(join(denied, 'x.txt'), 'x');

  // Running as root defeats the point, so the case is skipped rather than
  // asserted falsely — a test that passes because it could not run is worse
  // than one that says it did not. `t.skip` is what makes it *say* so. A bare
  // `return` reported this as a pass, so on any root container the summary read
  // 369 passed and 0 skipped while this assertion had never once executed —
  // which is the failure this comment claimed to have avoided.
  //
  // The question, and the denial itself, now come from `test/support/tree.ts`
  // rather than from a private copy here: `whileDenied` restores the mode it
  // found in a `finally` — not in an `after` hook, because the fixture
  // registered its recursive delete first and the delete fails on a directory
  // it cannot enter.
  if (!deniableDirectories()) {
    t.skip('needs a non-root POSIX user: root is not denied by a 0o000 mode');
    return;
  }

  await whileDenied(denied, () => {
    const result = reader.readText('denied/x.txt');
    assert.ok(!result.ok, 'a file inside a denied directory must not read');
    assert.match(result.reason, /permission|EACCES/i);
    // The state and the stage as well as the reason. `resolve`, not `examine`:
    // the denial is on the *parent*, so the stat never answered and nothing
    // about the file itself was ever examined. `unreadable`, not `absent`:
    // being unable to look is not evidence that nothing is there.
    assert.equal(result.state, 'unreadable');
    assert.equal(result.stage, 'resolve');
  });
});

// ---------------------------------------------------------------------------
// The refusal
// ---------------------------------------------------------------------------

test('a dot-dot path out of the project is refused before any read', async (t) => {
  const { reader } = await fixture(t);
  assert.throws(() => reader.readText('../outside/secret.txt'), /refusing to read outside the project/);
  assert.throws(() => reader.entryAt('..'), /refusing to read outside the project/);
  assert.throws(() => reader.readText('../../etc/passwd'), /refusing to read outside/);
});

test('an absolute path outside the project is refused', async (t) => {
  const { reader, outside } = await fixture(t);
  assert.throws(() => reader.readText(join(outside, 'secret.txt')), /refusing to read outside/);
  assert.throws(() => reader.entryAt('/etc'), /refusing to read outside/);
});

test('a symlink inside the project pointing out of it is refused', async (t) => {
  // The case the whole design exists for. The link lives inside the tree, so
  // any check made on its spelling admits it; canonicalizing first is what
  // makes the question "where does this actually go".
  //
  // Guarded and typed, like every other link in the suite should be: unelevated
  // Windows throws `EPERM` from `symlink`, which *errors* the test rather than
  // skipping it, and an untyped link is the wrong kind of link there even with
  // the privilege to make one.
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  const { reader, root, outside } = await fixture(t);
  await symlink(outside, join(root, 'escape'), 'dir');

  assert.throws(() => reader.readText('escape/secret.txt'), /refusing to read outside/);
  assert.throws(() => reader.entryAt('escape'), /refusing to read outside/);
});

test('a symlink inside the project pointing back inside it is allowed', async (t) => {
  // The other direction, so the refusal is not simply "no symlinks".
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  const { reader, root } = await fixture(t);
  await mkdir(join(root, 'real'));
  await writeFile(join(root, 'real', 'ok.txt'), 'fine\n');
  await symlink(join(root, 'real'), join(root, 'alias'), 'dir');

  const result = reader.readText('alias/ok.txt');
  assert.ok(result.ok, `expected a read, got ${JSON.stringify(result)}`);
});

test('the refusal names the path and the root, so the report is actionable', async (t) => {
  const { reader, outside, root } = await fixture(t);
  try {
    reader.readText(join(outside, 'secret.txt'));
    assert.fail('expected a refusal');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    assert.ok(message.includes(outside), `does not name the offending path: ${message}`);
    assert.ok(message.includes(root), `does not name the root: ${message}`);
  }
});

test('a caller cannot get an unchecked path out of the reader', async (t) => {
  // `resolveWithin` is the only way in, and it throws rather than returning
  // something a caller might use anyway. There is no variant that skips the
  // check — a reader that could be handed an already-checked path would
  // eventually be handed one that was not.
  const { reader, outside } = await fixture(t);
  assert.throws(() => reader.resolveWithin(outside), /refusing to read outside/);
  const inside = reader.resolveWithin('inside.txt');
  assert.ok(toPlatform(inside).endsWith('inside.txt'));
  assert.equal(typeof reader.root, 'string');
});

test('the reader reports the root it was confined to', async (t) => {
  const { reader, root } = await fixture(t);
  assert.equal(toPlatform(reader.root), root);
});

// ---------------------------------------------------------------------------
// What "text" means, and what is refused before being read
// ---------------------------------------------------------------------------

test('a file that is not valid UTF-8 is a failure, not replacement characters', async (t) => {
  // `readFileSync(path, 'utf8')` is lossy: it never throws, it substitutes
  // U+FFFD. This module's comment once claimed the opposite, which would have
  // left Story 1.9 building "report it as unreadable rather than guess" on a
  // function that guesses.
  const { root, reader } = await fixture(t);
  await writeFile(join(root, 'binary.bin'), Buffer.from([0x00, 0xff, 0xfe, 0x41, 0xc3, 0x28]));

  const result = reader.readText('binary.bin');
  assert.ok(!result.ok, 'malformed bytes must not decode as text');
  assert.match(result.reason, /UTF-8/);
  assert.equal(result.reason.includes('\uFFFD'), false, 'and must not report the substitution');
  // `decode` is its own stage rather than a flavour of `read`, because this is
  // the row Story 1.9 reports as unreadable and a consumer must be able to tell
  // it from an over-limit refusal without parsing the English in `reason`.
  assert.equal(result.state, 'unreadable');
  assert.equal(result.stage, 'decode');
});

test('valid UTF-8 beyond ASCII still reads, so the check is not just a byte filter', async (t) => {
  const { root, reader } = await fixture(t);
  const text = 'café — naïve — 日本語 — 🌍\n';
  await writeFile(join(root, 'utf8.txt'), text, 'utf8');
  const result = reader.readText('utf8.txt');
  assert.ok(result.ok, result.ok ? '' : result.reason);
  assert.equal(result.ok && result.text, text);
});

test('a directory is refused before being read, naming what it is', async (t) => {
  const { root, reader } = await fixture(t);
  await mkdir(join(root, 'adir'));
  const result = reader.readText('adir');
  assert.ok(!result.ok, 'a directory has no text to read');
  assert.ok(result.reason.includes('directory'), result.reason);
  assert.equal(result.stage, 'examine', 'the stat answered, and the kind was refused');
});

test('a fifo is refused rather than blocking the process forever', async (t) => {
  // The reason the kind is checked before the read: `readFileSync` on a fifo
  // waits for a writer that never comes, so in a server the request never
  // returns and the process never exits. A project can contain one.
  if (process.platform === 'win32') {
    t.skip('no fifos on Windows');
    return;
  }
  const { root, reader } = await fixture(t);
  const fifo = join(root, 'pipe');
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync('mkfifo', [fifo]);
  } catch {
    t.skip('no mkfifo on this box; nothing to assert');
    return;
  }

  const result = reader.readText('pipe');
  assert.ok(!result.ok, 'a fifo must be refused, not opened');
  assert.ok(result.reason.includes('fifo'), result.reason);
  assert.equal(result.stage, 'examine', 'the stat answered, and the kind was refused');
});

test('a file denied to the process fails at the read stage, not the examine one', async (t) => {
  // The stage split, from the side that distinguishes it: here the stat
  // succeeds — the file's kind and size are both known and both fine — and the
  // open is what fails. Reporting it as `examine` would claim the refusal
  // arrived before anything about the file had been established, and it is the
  // most ordinary unreadable artifact a project can hold.
  if (!deniableDirectories()) {
    t.skip('needs a non-root POSIX user: root is not denied by a 0o000 mode');
    return;
  }
  const { root, reader } = await fixture(t);
  const locked = join(root, 'locked.txt');
  await writeFile(locked, 'secret\n');

  await whileDenied(locked, () => {
    const result = reader.readText('locked.txt');
    assert.ok(!result.ok, 'a denied file must not read');
    assert.equal(result.state, 'unreadable', 'unopenable is not the same as not there');
    assert.equal(result.stage, 'read');
    assert.match(result.reason, /permission|EACCES/i);
  });
});

test('a file that is gone by the time it is read is absent, not unreadable', async (t) => {
  // One physical fact, one answer. The walk reports a vanished path as
  // `absent`; before this, the same condition arriving a moment later — during
  // the read — came back `unreadable`, so which state a consumer saw depended
  // on who noticed first. Provoked here rather than waited for, since in the
  // wild it is a race.
  const { root, reader } = await fixture(t);
  const doomed = join(root, 'doomed.txt');
  await writeFile(doomed, 'here for now\n');
  await rm(doomed);

  const result = reader.readText('doomed.txt');
  assert.ok(!result.ok);
  assert.equal(result.state, 'absent');
  assert.equal(result.stage, 'resolve', 'the stat never answered, so nothing was examined');
});

test('a file over the read limit is refused, naming the size and the limit', async (t) => {
  const { root, reader } = await fixture(t);
  const big = join(root, 'big.bin');
  await writeFile(big, Buffer.alloc(MAX_READ_BYTES + 1, 0x61));
  const result = reader.readText('big.bin');
  assert.ok(!result.ok, 'a file over the limit must be refused');
  assert.ok(result.reason.includes(String(MAX_READ_BYTES)), result.reason);
  // Also `examine`: the stat succeeded and the size was refused, so nothing was
  // read and the decode was never reached.
  assert.equal(result.stage, 'examine');
});

// ---------------------------------------------------------------------------
// Enumeration
//
// The capability `ConfinedReader` did not have, and the one the walk in
// `walk.ts` is built on. Two confinement checks matter here rather than one:
// the directory before `readdir` touches it, and **every child again** before
// it is handed back — because a child can be a symlink, which is exactly the
// case where its spelling and its destination disagree.
// ---------------------------------------------------------------------------

/** `name state[/stage]` per child, so a missing sibling cannot hide. */
function children(listing: ChildListing): readonly string[] {
  assert.ok(listing.ok, `expected a listing, got ${JSON.stringify(listing)}`);
  return listing.ok
    ? listing.children.map((child) =>
        child.state === 'present'
          ? `${child.name} ${child.kind}`
          : `${child.name} ${child.state}/${child.stage}`,
      )
    : [];
}

test('a directory enumerates its children, sorted, with their kinds', async (t) => {
  const { reader, root } = await fixture(t);
  await mkdir(join(root, 'sub'));
  await writeFile(join(root, 'another.txt'), 'a');

  assert.deepEqual(children(reader.childrenOf('.', 50)), [
    'another.txt file',
    'inside.txt file',
    'sub directory',
  ]);
  assert.deepEqual(children(reader.childrenOf('sub', 50)), []);
});

test('a present child carries its resolved path, and that path is the identity', async (t) => {
  const { reader, root } = await fixture(t);
  const listing = reader.childrenOf('.', 50);
  assert.ok(listing.ok);
  const child = listing.ok ? listing.children.find((each) => each.name === 'inside.txt') : undefined;
  assert.ok(child !== undefined && child.state === 'present');
  assert.equal(
    child !== undefined && child.state === 'present' ? toPlatform(child.path) : '',
    toPlatform(canonical(join(root, 'inside.txt'))),
  );
});

test('the child cap is required, sorts before it applies, and reports truncation', async (t) => {
  const { reader, root } = await fixture(t);
  for (const name of ['a.txt', 'b.txt', 'c.txt', 'd.txt']) {
    await writeFile(join(root, name), name);
  }

  // Required rather than defaulted, on `listChildDirectories`' precedent: an
  // unbounded listing must be impossible to ask for by accident.
  for (const limit of [0, -1, 2.5, Number.NaN]) {
    assert.throws(() => reader.childrenOf('.', limit), /whole limit of 1 or more/, String(limit));
  }

  const capped = reader.childrenOf('.', 2);
  assert.deepEqual(children(capped), ['a.txt file', 'b.txt file']);
  assert.equal(capped.ok && capped.truncated, true, 'a shortfall is reported, never silent');

  const whole = reader.childrenOf('.', 5);
  assert.equal(whole.ok && whole.truncated, false);
  assert.equal(whole.ok ? whole.children.length : 0, 5);
});

test('a directory that is absent and one that is unreadable are different answers', async (t) => {
  const { reader, root } = await fixture(t);

  // The stage separates the two the way the failure actually happened: a path
  // that is not there fails to *resolve*, and never reaches `readdir` at all.
  const missing = reader.childrenOf('nope', 10);
  assert.equal(missing.ok, false);
  assert.equal(!missing.ok && missing.state, 'absent');
  assert.equal(!missing.ok && missing.stage, 'resolve');

  // A file is not a directory, and `ENOTDIR` is the same "not there" answer
  // `entryAt` already gives, so the two surfaces cannot disagree. This one does
  // resolve — the file exists — so it is `readdir` that refuses it, and the
  // stage says so.
  const notDirectory = reader.childrenOf('inside.txt', 10);
  assert.equal(!notDirectory.ok && notDirectory.state, 'absent');
  assert.equal(!notDirectory.ok && notDirectory.stage, 'read-directory');

  if (!deniableDirectories()) {
    t.skip('needs a non-root POSIX user: root is not denied by a 0o000 mode');
    return;
  }
  const denied = join(root, 'denied');
  await mkdir(denied);
  await whileDenied(denied, () => {
    const result = reader.childrenOf('denied', 10);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.state, 'unreadable');
    assert.equal(!result.ok && result.stage, 'read-directory');
    assert.ok(!result.ok && /EACCES|permission/i.test(result.reason), !result.ok ? result.reason : '');
  });
});

test('enumerating a directory outside the project is refused before any read', async (t) => {
  const { reader, outside } = await fixture(t);
  assert.throws(() => reader.childrenOf('..', 10), /refusing to read outside the project/);
  assert.throws(() => reader.childrenOf(outside, 10), /refusing to read outside/);
});

test('a child that resolves out of the root is unchecked, and carries no path', async (t) => {
  // The case enumeration exists to get right, and the reason a listing cannot
  // be trusted on spelling alone: the link sits inside the tree, so any check
  // made before resolution admits it.
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  const { reader, root, outside } = await fixture(t);
  await symlink(outside, join(root, 'escape'), 'dir');

  const listing = reader.childrenOf('.', 10);
  assert.deepEqual(children(listing), ['escape unchecked/confinement', 'inside.txt file']);

  const escape = listing.ok
    ? listing.children.find((child) => child.name === 'escape')
    : undefined;
  assert.ok(escape !== undefined, 'a refused child is still reported, never dropped');
  assert.ok(escape.state !== 'present', JSON.stringify(escape));
  assert.equal(escape.state, 'unchecked');
  assert.equal(escape.stage, 'confinement');
  assert.equal('path' in escape, false, 'an out-of-tree child offers no identity to key');
  assert.ok(
    escape.reason.includes(outside),
    'and the refusal names the destination it refused',
  );
});

test('a child link pointing back inside the tree resolves to its target', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  const { reader, root } = await fixture(t);
  await mkdir(join(root, 'real'));
  await symlink(join(root, 'real'), join(root, 'alias'), 'dir');

  const listing = reader.childrenOf('.', 10);
  assert.deepEqual(children(listing), ['alias directory', 'inside.txt file', 'real directory']);

  const paths = listing.ok
    ? listing.children.flatMap((child) => (child.state === 'present' ? [toPlatform(child.path)] : []))
    : [];
  assert.equal(
    new Set(paths).size,
    paths.length - 1,
    'two names for one directory resolve to one path — which is what lets a walk dedupe them',
  );
});

test('a dangling child is absent and an unresolvable one is unreadable, both at the resolve stage', async (t) => {
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  const { reader, root } = await fixture(t);
  await symlink(join(root, 'nowhere'), join(root, 'gone'), 'file');
  await symlink('loop', join(root, 'loop'), 'file');

  assert.deepEqual(children(reader.childrenOf('.', 10)), [
    'gone absent/resolve',
    'inside.txt file',
    'loop unreadable/resolve',
  ]);

  const listing = reader.childrenOf('.', 10);
  const loop = listing.ok ? listing.children.find((child) => child.name === 'loop') : undefined;
  // Existence first. `'path' in (loop ?? {})` was `false` for a *missing* entry
  // too, so the assertion the comment below calls load-bearing would have held
  // if the child had been dropped altogether — which is the one outcome this
  // module must never produce.
  assert.ok(loop !== undefined, 'an unresolvable child is reported, never dropped');
  assert.ok(loop.state !== 'present', JSON.stringify(loop));
  assert.match(loop.reason, /ELOOP|too many/i);
  // The canonical form degrades to the *spelling* when `realpathSync.native`
  // fails, and `ELOOP` is the cycle case — so an unresolved child must not
  // offer a path for a caller to key an identity on. It does not have one.
  assert.equal('path' in loop, false);
});

test('the keep predicate runs before the cap, so a cap is never spent on discards', async (t) => {
  // `listChildDirectories`' hard-won lesson, applied here for the same reason:
  // `.` sorts ahead of every letter, so a cap applied before the filter returns
  // nothing but dot-directories and hides every real entry beside them. This is
  // also the mechanism `walk`'s `exclude` is built on, and the *only* place the
  // ordering is observable.
  const { reader, root } = await fixture(t);
  for (const name of ['.a', '.b', '.c', '.d']) await mkdir(join(root, name));
  await writeFile(join(root, 'real.md'), 'x');

  assert.deepEqual(children(reader.childrenOf('.', 2)), ['.a directory', '.b directory']);
  assert.deepEqual(
    children(reader.childrenOf('.', 2, (name) => !name.startsWith('.'))),
    ['inside.txt file', 'real.md file'],
  );

  const filtered = reader.childrenOf('.', 2, (name) => !name.startsWith('.'));
  assert.equal(filtered.ok && filtered.truncated, false, 'truncation counts kept children only');
});

test('a child reached through a non-directory is absent, not a crash', async (t) => {
  // `ENOTDIR` from the resolver: the link names a path *through* a regular
  // file, so there is nothing to resolve and nothing there. Same answer as a
  // dangling link, which is correct — `entryAt` has said so since Story 1.5.
  if (!(await symlinksAvailable())) {
    t.skip('needs symlinks: unelevated Windows cannot create them');
    return;
  }
  const { reader, root } = await fixture(t);
  await symlink(join(root, 'inside.txt', 'deeper'), join(root, 'through'), 'file');

  const listing = reader.childrenOf('.', 10);
  assert.deepEqual(children(listing), ['inside.txt file', 'through absent/resolve']);
  const through = listing.ok ? listing.children.find((child) => child.name === 'through') : undefined;
  assert.ok(through !== undefined);
  assert.ok(through.state !== 'present');
  assert.match(through.reason, /ENOTDIR|not a directory/i);
});

test('a directory whose own path cannot be resolved is never enumerated', async (t) => {
  // The other half of the confinement order, and the reason the directory
  // argument is resolved rather than merely spelled-checked: with only a
  // spelling check, `readdirSync` follows the link itself and can enumerate
  // names from wherever it lands. Reported as a listing failure at the
  // `resolve` stage instead, so nothing is read.
  if (!(await symlinksAvailable()) || !deniableDirectories()) {
    t.skip('needs symlinks and a non-root POSIX user');
    return;
  }
  const { reader, root } = await fixture(t);
  await mkdir(join(root, 'vault', 'inner'), { recursive: true });
  await writeFile(join(root, 'vault', 'inner', 'secret.txt'), 'x');
  await symlink(join(root, 'vault', 'inner'), join(root, 'reach'), 'dir');

  await whileDenied(join(root, 'vault'), () => {
    const listing = reader.childrenOf('reach', 10);
    assert.equal(listing.ok, false, 'an unresolvable directory must not be listed');
    assert.equal(!listing.ok && listing.stage, 'resolve');
    assert.equal(!listing.ok && listing.state, 'unreadable');
  });
});

test('a confinement refusal is a distinguishable error, not just a message', async (t) => {
  // `walk.ts` has to tell a refusal apart from a defect, and matching on the
  // message would make the two indistinguishable the moment the wording
  // changes. The class is the contract; the message is the report.
  const { reader, outside } = await fixture(t);
  try {
    reader.childrenOf(outside, 10);
    assert.fail('expected a refusal');
  } catch (error: unknown) {
    assert.ok(error instanceof ConfinementError, `not a ConfinementError: ${String(error)}`);
    assert.equal(toPlatform(error.root), toPlatform(reader.root));
    assert.match(error.message, /refusing to read outside the project/);
  }
});

test('a Dirent is trusted only for what it positively answers', () => {
  // The `DT_UNKNOWN` rule, tested where it can actually be tested. A real
  // `readdir` on any development filesystem fills `d_type`, so a test driven
  // through `childrenOf` cannot tell this rule from `!isSymbolicLink()` — and
  // that defective rule reads "unknown" as "not a link", skips the probe, and
  // reports a real directory as `other` that the walk then never descends.
  const dirent = (kind: 'directory' | 'file' | 'symlink' | 'unknown' | 'fifo') => ({
    isDirectory: () => kind === 'directory',
    isFile: () => kind === 'file',
    isSymbolicLink: () => kind === 'symlink',
  });

  assert.equal(trustedKind(dirent('directory')), 'directory');
  assert.equal(trustedKind(dirent('file')), 'file');
  // Everything else has to be probed, and `unknown` is the one that matters:
  // every `isX()` answers false, exactly as it does for a symlink.
  assert.equal(trustedKind(dirent('symlink')), undefined);
  assert.equal(trustedKind(dirent('unknown')), undefined, 'DT_UNKNOWN must be probed, not guessed');
  assert.equal(trustedKind(dirent('fifo')), undefined);
});

// ---------------------------------------------------------------------------
// `resolveDeclared` — the one non-throwing resolution answer
// ---------------------------------------------------------------------------

test('a declared location inside the project resolves, and one outside is a value', async (t) => {
  // Tested in this file as well as through the pass, on the file-per-module
  // pattern the suite follows: the four outcomes are this method's contract,
  // and a contract only observed through two other layers is a contract nobody
  // can read.
  const { reader, root, outside } = await fixture(t);

  const inside = reader.resolveDeclared('inside.txt');
  assert.ok(inside.ok, `expected the in-project path to resolve: ${JSON.stringify(inside)}`);
  assert.equal(inside.path, canonical(join(root, 'inside.txt')));

  // A value rather than a throw, which is the whole reason this method exists
  // beside `resolveWithin`: FR-74 makes an out-of-tree location a normal shape
  // to report, and a refusal that has to be reported cannot be an exception.
  const escaped = reader.resolveDeclared(outside.split(/[\\/]/).join('/'));
  assert.equal(escaped.ok, false);
  assert.equal(escaped.ok === false && escaped.outcome, 'out-of-tree');
  assert.equal(escaped.ok === false && escaped.outcome === 'out-of-tree' && escaped.path, canonical(outside));
  assert.doesNotThrow(() => reader.resolveDeclared('/etc'));
});

test('a declared location the resolver cannot answer is unresolved, never ok', async (t) => {
  // **`ok: true` promised a resolution `canonical` does not deliver.**
  // `canonical` degrades silently to the unresolved spelling whenever
  // `realpathSync.native` fails, so a declared `nope/deeper` came back
  // `{ok: true}` with nothing resolved — the containment re-ask had checked a
  // spelling, and a symlink created there afterwards would lead out with that
  // record still standing. `canonicalWithResolution` exists for exactly this
  // caller.
  const { reader } = await fixture(t);

  const missing = reader.resolveDeclared('nope/deeper');
  assert.equal(missing.ok, false, 'an unresolvable path must not claim to have resolved');
  assert.equal(missing.ok === false && missing.outcome, 'unresolved');
  assert.equal(missing.ok === false && missing.outcome === 'unresolved' && missing.code, 'ENOENT');
});

test('a declared location the sanitizer refuses never reaches the filesystem', async (t) => {
  const { reader } = await fixture(t);
  const refused = reader.resolveDeclared('docs/.hidden');
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.outcome, 'refused');
  assert.equal(refused.ok === false && refused.outcome === 'refused' && refused.rule, 'leading-dot');
});

test('a declared link inside the project that points out of it is refused', async (t) => {
  // The security-critical direction, at this altitude as well as through the
  // pass: the spelling is in bounds and the destination is not.
  if (!(await symlinksAvailable())) {
    t.skip('this platform cannot create symlinks without elevation');
    return;
  }
  const { reader, root, outside } = await fixture(t);
  await symlink(outside, join(root, 'escape'), 'dir');

  const escaped = reader.resolveDeclared('escape');
  assert.equal(escaped.ok, false, 'a link leading out of the project must not resolve in-tree');
  assert.equal(escaped.ok === false && escaped.outcome, 'out-of-tree');
});

test('a declared path reached through a symlinked ancestor of the root is in-tree', async (t) => {
  // The opposite direction, and the defect that made this method disagree with
  // every other path in the class: `resolveWithin` accepts such a path, and
  // answering containment from the spelling refused it. `/tmp` is a symlink to
  // `/private/tmp` on macOS, so this is the ordinary shape rather than an edge.
  if (!(await symlinksAvailable())) {
    t.skip('this platform cannot create symlinks without elevation');
    return;
  }
  const { reader, root } = await fixture(t);
  const base = join(root, '..');
  await symlink(join(base, 'project'), join(base, 'alias'), 'dir');

  const aliased = reader.resolveDeclared(
    join(base, 'alias', 'inside.txt').split(/[\\/]/).join('/'),
  );
  assert.ok(aliased.ok, `the same file through an aliased ancestor is in the project: ${JSON.stringify(aliased)}`);
  assert.equal(aliased.path, canonical(join(root, 'inside.txt')), 'reported at the canonical path');
});
