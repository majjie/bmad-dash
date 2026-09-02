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
import { mkdtemp, mkdir, rm, symlink, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonical, toPlatform } from '../../src/adapters/fs/paths.ts';
import { ConfinedReader, MAX_READ_BYTES } from '../../src/adapters/fs/read.ts';

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
  // than one that says it did not.
  if (process.getuid?.() === 0) return;

  // Restored in `finally`, not in an `after` hook: the fixture registered its
  // own cleanup first, so a hook here runs *after* the recursive delete and the
  // delete fails on a directory it cannot enter.
  await chmod(denied, 0o000);
  try {
    const result = reader.readText('denied/x.txt');
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /permission|EACCES/i.test(result.reason), result.ok ? '' : result.reason);
  } finally {
    await chmod(denied, 0o755);
  }
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
  const { reader, root, outside } = await fixture(t);
  await symlink(outside, join(root, 'escape'));

  assert.throws(() => reader.readText('escape/secret.txt'), /refusing to read outside/);
  assert.throws(() => reader.entryAt('escape'), /refusing to read outside/);
});

test('a symlink inside the project pointing back inside it is allowed', async (t) => {
  // The other direction, so the refusal is not simply "no symlinks".
  const { reader, root } = await fixture(t);
  await mkdir(join(root, 'real'));
  await writeFile(join(root, 'real', 'ok.txt'), 'fine\n');
  await symlink(join(root, 'real'), join(root, 'alias'));

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
  assert.equal(result.ok, false, 'malformed bytes must not decode as text');
  assert.ok(!result.ok && /UTF-8/.test(result.reason), result.ok ? '' : result.reason);
  assert.ok(!result.ok && !result.reason.includes('\uFFFD'), 'and must not report the substitution');
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
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.reason.includes('directory'), result.ok ? '' : result.reason);
});

test('a fifo is refused rather than blocking the process forever', async (t) => {
  // The reason the kind is checked before the read: `readFileSync` on a fifo
  // waits for a writer that never comes, so in a server the request never
  // returns and the process never exits. A project can contain one.
  if (process.platform === 'win32') return;
  const { root, reader } = await fixture(t);
  const fifo = join(root, 'pipe');
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync('mkfifo', [fifo]);
  } catch {
    return; // no mkfifo on this box; nothing to assert
  }

  const result = reader.readText('pipe');
  assert.equal(result.ok, false, 'a fifo must be refused, not opened');
  assert.ok(!result.ok && result.reason.includes('fifo'), result.ok ? '' : result.reason);
});

test('a file over the read limit is refused, naming the size and the limit', async (t) => {
  const { root, reader } = await fixture(t);
  const big = join(root, 'big.bin');
  await writeFile(big, Buffer.alloc(MAX_READ_BYTES + 1, 0x61));
  const result = reader.readText('big.bin');
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.reason.includes(String(MAX_READ_BYTES)), result.ok ? '' : result.reason);
});
