/**
 * AD-1: the read-only invariant, enforced structurally.
 *
 * Four layers, because the first alone does not verify what NFR-1 requires:
 *
 *   1. **Confinement.** `node:fs` may only be imported inside
 *      `src/adapters/fs/`; `node:child_process` only inside
 *      `src/adapters/git/`, `src/adapters/browser/` and `scripts/`.
 *   2. **Operation.** Inside that adapter, only the *reading* `fs` surface is
 *      permitted. Confining `node:fs` to one directory proves imports are tidy;
 *      it does nothing to stop that directory calling `writeFile`. Read-only is
 *      a property of the operations, not of the file layout.
 *   3. **Purity.** `src/domain/` has no outgoing imports at all (frozen
 *      constraint). Written before the directory exists, because a prefix rule
 *      that has only ever seen an empty layer passes vacuously.
 *   4. **Analysability.** `process.getBuiltinModule`, `createRequire`, a
 *      dynamic `import()` with a non-literal specifier, and a computed member
 *      call inside a module that imports `fs` all reach an operation without a
 *      name the gate can read. Those are reported rather than passed over,
 *      because a bypass the gate cannot see is a hole in the invariant.
 *
 * The gate reads the `.ts` sources, not `dist/`, because the constraint lives in
 * the source a contributor edits. It reads stray `.js` under the scanned roots
 * too, and it **follows symlinks** — a `Dirent` for a symlink answers false to
 * both `isDirectory()` and `isFile()`, so the walk used to skip every one and a
 * symlinked source file was invisible.
 *
 * Scanning primitives live in `./support/gate.ts` and are unit-tested in
 * `./support/scanner.test.ts`. This file is the assertions and the fixtures.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GATED_MODULES,
  SCANNED_ROOTS,
  SPECIFIER_PATTERN,
  collectSourceFiles,
  scanSource,
  describeDomain,
  describeImports,
  describeOperations,
  describeUnanalysable,
  findDomainViolations,
  findImportViolations,
  findMutatingOperations,
  findUnanalysable,
} from './support/gate.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A throwaway tree, cleaned up whether the test passes or not. */
async function scratch(t: { after: (fn: () => unknown) => void }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function write(root: string, relativePath: string, contents: string): Promise<string> {
  const absolute = join(root, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents);
  return absolute;
}

const GATED_IMPORT = "import fs from 'node:fs';\nexport const x = fs;\n";

// ---------------------------------------------------------------------------
// The real tree
// ---------------------------------------------------------------------------

test('no module outside its permitted adapter imports a gated built-in', async () => {
  const violations = await findImportViolations(REPO_ROOT);
  assert.deepEqual(violations, [], `AD-1 violated:\n${describeImports(violations)}`);
});

test('no source under src/, web/ or scripts/ uses the mutating fs surface', async () => {
  // The invariant is read-only, not fs-is-tidy. Confinement is layer one; this
  // is the layer that actually says the tool cannot write.
  const found = await findMutatingOperations(REPO_ROOT);
  assert.deepEqual(found, [], `read-only violated:\n${describeOperations(found)}`);
});

test('src/domain/ has no outgoing imports', async () => {
  const found = await findDomainViolations(REPO_ROOT);
  assert.deepEqual(found, [], `purity violated:\n${describeDomain(found)}`);
});

test('the permitted adapter imports fs, and only to read', async () => {
  const source = await readFile(join(REPO_ROOT, 'src', 'adapters', 'fs', 'realpath.ts'), 'utf8');
  assert.match(source, /from 'node:fs'/);
  assert.match(source, /realpathSync/);
  assert.deepEqual(await findImportViolations(REPO_ROOT), []);
  assert.deepEqual(await findMutatingOperations(REPO_ROOT), []);
});

test('no source reaches a built-in by an indirection the gate cannot read', async () => {
  const found = await findUnanalysable(REPO_ROOT);
  assert.deepEqual(found, [], `unanalysable indirection:\n${describeUnanalysable(found)}`);
});

test('the scan actually reaches every root it claims, tooling included', async () => {
  const files = await collectSourceFiles(REPO_ROOT);
  for (const expected of [
    'src/cli/index.ts',
    'src/adapters/http/server.ts',
    'src/adapters/fs/realpath.ts',
    'scripts/run-tests.ts',
    'scripts/test-run-policy.ts',
    // `check-tasks.ts` shells out to git for its entire purpose, so it is the
    // one `scripts/` file whose `child_process` allowance is load-bearing.
    // Being scanned is what this row asserts, and that is all it asserts: if
    // the allowance were narrowed the gate would *fail loudly* on this file
    // rather than go quiet, so the enumeration is not what protects it. It is
    // here so the scan is known to reach the file at all — the earlier version
    // of this comment claimed both things at once, which cannot be right.
    'scripts/check-tasks.ts',
  ]) {
    assert.ok(files.includes(expected), `${expected} not scanned; found: ${files.join(', ')}`);
  }
});

test('the subprocess allowance for tooling cannot leak into the package', async () => {
  const manifest: unknown = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
  const files = (manifest as { files?: unknown }).files;
  assert.ok(Array.isArray(files), 'package.json must declare an explicit files whitelist');
  for (const entry of files as unknown[]) {
    for (const forbidden of ['scripts', 'test', 'src']) {
      assert.notEqual(entry, forbidden, `${forbidden}/ must never be published`);
    }
  }
});

test('no stale .js implementation sits beside its .ts replacement', async () => {
  const stale = (await collectSourceFiles(REPO_ROOT)).filter(
    (file) => file.startsWith('src/') && /\.(js|mjs|cjs|jsx)$/.test(file),
  );
  assert.deepEqual(stale, [], `JavaScript files remain under src/: ${stale.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Planted violations: the gate must fail, not merely pass
// ---------------------------------------------------------------------------

test('an empty tree yields no findings of any kind', async (t) => {
  const root = await scratch(t);
  assert.deepEqual(await findImportViolations(root), []);
  assert.deepEqual(await findMutatingOperations(root), []);
  assert.deepEqual(await findUnanalysable(root), []);
  assert.deepEqual(await findDomainViolations(root), []);
});

test('a planted node:fs import outside the fs adapter is reported by file name', async (t) => {
  const root = await scratch(t);
  await write(root, 'src/domain/offender.ts', GATED_IMPORT);
  await write(
    root,
    'src/adapters/fs/reader.ts',
    "import { readFile } from 'node:fs/promises';\nexport { readFile };\n",
  );

  const violations = await findImportViolations(root);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.file, 'src/domain/offender.ts');
  assert.match(describeImports(violations), /src\/domain\/offender\.ts/);
});

test('a symlinked source file with a gated import is scanned', async (t) => {
  // The reviewer's reproduction. A `Dirent` for a symlink is neither a file nor
  // a directory, so the walk skipped it and the gate reported nothing at all.
  const root = await scratch(t);
  const outside = join(root, 'outside');
  await mkdir(outside, { recursive: true });
  const hidden = join(outside, 'evil.ts');
  await writeFile(hidden, GATED_IMPORT);
  await mkdir(join(root, 'src', 'cli'), { recursive: true });
  await symlink(hidden, join(root, 'src', 'cli', 'linked.ts'));

  const files = await collectSourceFiles(root);
  assert.ok(files.includes('src/cli/linked.ts'), `symlinked file not scanned: ${files.join(', ')}`);

  const violations = await findImportViolations(root);
  assert.deepEqual(
    violations.map((v) => v.file),
    ['src/cli/linked.ts'],
    describeImports(violations),
  );
});

test('a symlinked directory of source is scanned', async (t) => {
  const root = await scratch(t);
  const outside = join(root, 'outside');
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, 'evil.ts'), GATED_IMPORT);
  await mkdir(join(root, 'src', 'cli'), { recursive: true });
  await symlink(outside, join(root, 'src', 'cli', 'linked-dir'));

  const violations = await findImportViolations(root);
  assert.deepEqual(
    violations.map((v) => v.file),
    ['src/cli/linked-dir/evil.ts'],
    describeImports(violations),
  );
});

test('a symlinked mutating call inside the fs adapter is denied', async (t) => {
  const root = await scratch(t);
  const outside = join(root, 'outside');
  await mkdir(outside, { recursive: true });
  await writeFile(
    join(outside, 'writer.ts'),
    "import { writeFileSync } from 'node:fs';\nexport const save = (p, d) => writeFileSync(p, d);\n",
  );
  await mkdir(join(root, 'src', 'adapters', 'fs'), { recursive: true });
  await symlink(join(outside, 'writer.ts'), join(root, 'src', 'adapters', 'fs', 'linked.ts'));

  const found = await findMutatingOperations(root);
  assert.ok(found.some((o) => o.operation === 'writeFileSync'), describeOperations(found));
});

test('a symlink cycle terminates instead of recursing forever', async (t) => {
  const root = await scratch(t);
  await mkdir(join(root, 'src', 'cli'), { recursive: true });
  await write(root, 'src/cli/index.ts', 'export const x = 1;\n');
  // A directory linking back to one of its own ancestors.
  await symlink(join(root, 'src'), join(root, 'src', 'cli', 'loop'));

  const files = await collectSourceFiles(root);
  assert.ok(files.includes('src/cli/index.ts'));
  assert.ok(files.length < 50, `cycle produced ${String(files.length)} entries`);
});

test('a dangling symlink is skipped rather than fatal', async (t) => {
  const root = await scratch(t);
  await mkdir(join(root, 'src', 'cli'), { recursive: true });
  await write(root, 'src/cli/index.ts', 'export const x = 1;\n');
  await symlink(join(root, 'src', 'cli', 'never-created.ts'), join(root, 'src', 'cli', 'dead.ts'));

  const files = await collectSourceFiles(root);
  assert.deepEqual(files, ['src/cli/index.ts']);
  assert.deepEqual(await findImportViolations(root), []);
});

test('a mutating call inside the permitted fs adapter is still denied', async (t) => {
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/fs/writer.ts',
    "import { writeFileSync, realpathSync } from 'node:fs';\n" +
      'export const save = (p: string, d: string) => writeFileSync(p, d);\n' +
      'export const look = (p: string) => realpathSync(p);\n',
  );

  // The import gate is satisfied — which is exactly the blind spot.
  assert.deepEqual(await findImportViolations(root), []);

  const found = await findMutatingOperations(root);
  assert.ok(found.length > 0, 'a writeFileSync inside the fs adapter must be denied');
  assert.deepEqual([...new Set(found.map((o) => o.file))], ['src/adapters/fs/writer.ts']);
  assert.ok(found.some((o) => o.operation === 'writeFileSync'));
  assert.ok(
    !found.some((o) => o.operation === 'realpathSync'),
    'realpathSync is a read and must not be flagged',
  );
});

test('a mutating call through an fs namespace is denied', async (t) => {
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/fs/ns.ts',
    "import fs from 'node:fs';\nexport const wipe = (p: string) => fs.rmSync(p, { recursive: true });\n",
  );
  const found = await findMutatingOperations(root);
  assert.ok(found.some((o) => o.operation === 'rmSync'), describeOperations(found));
});

test('bracket-notation access to a mutating operation is denied', async (t) => {
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/fs/bracket.ts',
    "import fs from 'node:fs';\nexport const save = (p: string, d: string) => fs['writeFileSync'](p, d);\n",
  );
  const found = await findMutatingOperations(root);
  assert.ok(
    found.some((o) => o.operation === 'writeFileSync' && o.how.includes('bracket')),
    describeOperations(found),
  );
});

test('a renamed destructure of a mutating operation is denied', async (t) => {
  // Ordinary code someone could write with no intent to evade.
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/fs/destructured.ts',
    "import fs from 'node:fs';\nconst { writeFileSync: w } = fs;\nexport const save = (p: string, d: string) => w(p, d);\n",
  );
  const found = await findMutatingOperations(root);
  assert.ok(
    found.some((o) => o.operation === 'writeFileSync' && o.how.includes('destructured')),
    describeOperations(found),
  );
});

test('a plain destructure of a mutating operation is denied', async (t) => {
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/fs/plain.ts',
    "import fs from 'node:fs';\nconst { rmSync } = fs;\nexport const wipe = (p: string) => rmSync(p);\n",
  );
  const found = await findMutatingOperations(root);
  assert.ok(found.some((o) => o.operation === 'rmSync'), describeOperations(found));
});

test('a computed member call in a module that imports fs is flagged unanalysable', async (t) => {
  // `fs[op](p, d)` carries no name to match on, so it cannot be denied by name.
  // Reporting it as unanalysable is the honest answer.
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/fs/computed.ts',
    "import fs from 'node:fs';\nexport const run = (op: string, p: string, d: string) => fs[op](p, d);\n",
  );

  const byName = await findMutatingOperations(root);
  assert.deepEqual(byName, [], 'a computed name cannot be matched by name — that is the point');

  const found = await findUnanalysable(root);
  assert.ok(
    found.some((u) => u.mechanism.includes('computed member call')),
    describeUnanalysable(found),
  );
});

test('a computed member call elsewhere is not flagged', async (t) => {
  // Scoped to modules that import fs, so ordinary indexing stays quiet.
  const root = await scratch(t);
  await write(
    root,
    'src/render/dispatch.ts',
    'const handlers: Record<string, () => string> = {};\nexport const go = (k: string) => handlers[k]();\n',
  );
  assert.deepEqual(await findUnanalysable(root), []);
});

test('the openSync/writeSync file-descriptor write path is denied', async (t) => {
  // A working write path that passed both the named-import and call-site layers:
  // neither `openSync` nor `writeSync` was on the list.
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/fs/fd.ts',
    "import { openSync, writeSync, closeSync } from 'node:fs';\n" +
      'export const save = (p: string, d: string): void => {\n' +
      "  const fd = openSync(p, 'w');\n" +
      '  writeSync(fd, d);\n' +
      '  closeSync(fd);\n' +
      '};\n',
  );

  const found = await findMutatingOperations(root);
  const operations = new Set(found.map((o) => o.operation));
  assert.ok(operations.has('openSync'), `openSync not denied: ${describeOperations(found)}`);
  assert.ok(operations.has('writeSync'), `writeSync not denied: ${describeOperations(found)}`);
});

test('a mutating call hidden behind a string literal is still denied', async (t) => {
  // The reviewer's case, at the gate level: comment stripping used to run with
  // no awareness of literals, so the call after this string was never seen.
  const root = await scratch(t);
  // Both on ONE line, deliberately: `//` stripping is per-line, so a call on the
  // following line survives naive stripping and would prove nothing.
  await write(
    root,
    'src/adapters/fs/sneaky.ts',
    "import fs from 'node:fs';\n" +
      "const doc = 'http://example.invalid'; fs.writeFileSync(p, d);\n",
  );

  const found = await findMutatingOperations(root);
  assert.ok(
    found.some((o) => o.operation === 'writeFileSync'),
    `hidden behind a string containing //: ${describeOperations(found)}`,
  );
});

test('a mutating call after a block-comment opener inside a string is denied', async (t) => {
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/fs/sneaky2.ts',
    "import fs from 'node:fs';\n" + "const a = '/*'; fs.rmSync(p); const b = '*/';\n",
  );

  const found = await findMutatingOperations(root);
  assert.ok(
    found.some((o) => o.operation === 'rmSync'),
    `hidden behind a fake comment opener: ${describeOperations(found)}`,
  );
});

test('prose naming a mutating operation is not a violation', async (t) => {
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/fs/documented.ts',
    '/**\n * Nothing here calls writeFile, mkdir or rm. Those would be writes.\n */\n' +
      "import { realpathSync } from 'node:fs';\n" +
      '// Also not a call: writeFileSync(p, d)\n' +
      'export const look = (p: string) => realpathSync(p);\n',
  );
  assert.deepEqual(
    await findMutatingOperations(root),
    [],
    'a comment mentioning an operation must not fail the gate',
  );
});

test('a stray .js file cannot hide a gated import from the scan', async (t) => {
  const root = await scratch(t);
  await write(root, 'src/domain/leftover.js', GATED_IMPORT);
  assert.deepEqual(
    (await findImportViolations(root)).map((v) => v.file),
    ['src/domain/leftover.js'],
  );
});

test('a planted child_process import outside the git and browser adapters is reported', async (t) => {
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/http/server.ts',
    "const { spawn } = require('child_process');\nexport default spawn;\n",
  );
  for (const permitted of ['git', 'browser']) {
    await write(
      root,
      `src/adapters/${permitted}/run.ts`,
      "import { execFile } from 'node:child_process';\nexport { execFile };\n",
    );
  }
  assert.deepEqual(
    (await findImportViolations(root)).map((v) => v.file),
    ['src/adapters/http/server.ts'],
  );
});

test('dynamic import and bare specifiers are caught too', async (t) => {
  const root = await scratch(t);
  await write(root, 'src/render/lazy.ts', "export const load = () => import('node:fs/promises');\n");
  await write(root, 'src/ports/legacy.ts', "import 'fs';\n");
  assert.deepEqual(
    (await findImportViolations(root)).map((v) => v.file).sort(),
    ['src/ports/legacy.ts', 'src/render/lazy.ts'],
  );
});

test('each unanalysable indirection is flagged rather than passing silently', async (t) => {
  const root = await scratch(t);
  await write(root, 'src/domain/builtin.ts', 'export const fs = process.getBuiltinModule("node:fs");\n');
  await write(
    root,
    'src/domain/required.ts',
    "import { createRequire } from 'node:module';\nexport const req = createRequire(import.meta.url);\n",
  );
  await write(
    root,
    'src/domain/computed.ts',
    'const name = "node:" + "fs";\nexport const load = () => import(name);\n',
  );

  const found = await findUnanalysable(root);
  assert.deepEqual(
    found.map((u) => u.file).sort(),
    ['src/domain/builtin.ts', 'src/domain/computed.ts', 'src/domain/required.ts'],
    describeUnanalysable(found),
  );

  // The import-specifier scan alone sees none of these, which is the point.
  assert.deepEqual((await findImportViolations(root)).map((v) => v.file), []);
});

test('a literal dynamic import is not mistaken for a computed one', async (t) => {
  const root = await scratch(t);
  await write(root, 'src/render/ok.ts', "export const load = () => import('./other.ts');\n");
  assert.deepEqual(await findUnanalysable(root), []);
});

// ---------------------------------------------------------------------------
// Purity: src/domain/ has no outgoing imports
// ---------------------------------------------------------------------------

test('an outgoing import from src/domain/ is denied, in each of its forms', async (t) => {
  const root = await scratch(t);
  await write(root, 'src/domain/builtin.ts', "import { join } from 'node:path';\nexport { join };\n");
  await write(root, 'src/domain/pkg.ts', "import md from 'markdown-it';\nexport default md;\n");
  await write(
    root,
    'src/domain/escapes.ts',
    "import { resolveRealPath } from '../adapters/fs/realpath.ts';\nexport { resolveRealPath };\n",
  );
  await write(root, 'src/adapters/fs/realpath.ts', 'export const resolveRealPath = (p: string) => p;\n');

  const found = await findDomainViolations(root);
  assert.deepEqual(
    found.map((d) => d.file).sort(),
    ['src/domain/builtin.ts', 'src/domain/escapes.ts', 'src/domain/pkg.ts'],
    describeDomain(found),
  );
  assert.match(describeDomain(found), /no outgoing imports/);
});

test('an import that stays inside src/domain/ is permitted', async (t) => {
  const root = await scratch(t);
  await write(root, 'src/domain/model.ts', 'export type Artifact = { path: string };\n');
  await write(
    root,
    'src/domain/identify.ts',
    "import type { Artifact } from './model.ts';\nexport const key = (a: Artifact) => a.path;\n",
  );
  await write(
    root,
    'src/domain/nested/order.ts',
    "import type { Artifact } from '../model.ts';\nexport const first = (a: Artifact[]) => a[0];\n",
  );

  assert.deepEqual(
    await findDomainViolations(root),
    [],
    'intra-layer imports are internal, not outgoing',
  );
});

test('the purity rule is not merely passing vacuously on the real tree', async (t) => {
  // `src/domain/` does not exist yet, so the real-tree assertion above is
  // trivially true. This proves the rule fires when the layer does exist —
  // which is the moment Story 1.5 adds its first file.
  const root = await scratch(t);
  assert.deepEqual(await findDomainViolations(root), [], 'no layer, no findings');

  await write(root, 'src/domain/first.ts', "import { join } from 'node:path';\nexport { join };\n");
  const found = await findDomainViolations(root);
  assert.equal(found.length, 1, 'the rule must fire the moment the layer exists');
  assert.equal(found[0]?.file, 'src/domain/first.ts');
});

test('the scanned roots are the ones the assertions claim', () => {
  assert.deepEqual([...SCANNED_ROOTS], ['src', 'web', 'scripts']);
});

test('the gated modules and their permitted prefixes are the ones claimed', () => {
  // The allowance itself, pinned — which the file-enumeration rows do not do.
  // Narrowing `child_process` would make `scripts/check-tasks.ts` fail the gate
  // with a violation, so losing the allowance is loud; *widening* it is silent,
  // and this is what makes a new prefix a deliberate edit here rather than a
  // quiet grant. `scripts/` is the entry the tooling depends on: the ledger
  // checker shells out to git for its whole purpose.
  assert.deepEqual([...GATED_MODULES.keys()].sort(), ['child_process', 'fs']);
  assert.deepEqual(
    [...(GATED_MODULES.get('child_process') ?? [])],
    ['src/adapters/git/', 'src/adapters/browser/', 'scripts/'],
  );
  assert.deepEqual([...(GATED_MODULES.get('fs') ?? [])], ['src/adapters/fs/']);
});

// ---------------------------------------------------------------------------
// The gate must actually be looking at the files it claims to cover
// ---------------------------------------------------------------------------

test('the scan reaches every module in the filesystem adapter', async () => {
  // The gate needed no *rule* change when the reading surface arrived — the
  // planted-mutation checks below already covered the new files. What was
  // missing is this: a positive assertion that the scan sees them at all.
  //
  // Every rule in this file is of the form "no scanned file does X", and each
  // is satisfied by a scan that returns nothing. `SCANNED_ROOTS` is walked
  // recursively, so a directory it silently stopped entering would turn the
  // whole gate green — the same way a line-based scanner in this project
  // degraded to a no-op while reporting success.
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const adapterDir = join(REPO_ROOT, 'src', 'adapters', 'fs');
  const onDisk = (await readdir(adapterDir)).filter((name) => name.endsWith('.ts')).sort();
  assert.ok(onDisk.length >= 3, `expected the fs adapter's modules, found ${onDisk.join(', ')}`);

  const scanned = await collectSourceFiles(REPO_ROOT);
  for (const name of onDisk) {
    const relative = `src/adapters/fs/${name}`;
    assert.ok(
      scanned.includes(relative),
      `${relative} exists but the gate never scanned it. scanned: ${scanned.join(', ')}`,
    );
  }
});

test('the scan reaches the composition root and the render layer too', async () => {
  const scanned = await collectSourceFiles(REPO_ROOT);
  for (const required of [
    'src/cli/index.ts',
    'src/cli/location.ts',
    'src/cli/suggest.ts',
    'src/render/page.ts',
    'src/adapters/http/server.ts',
    'scripts/run-tests.ts',
    'scripts/check-tasks.ts',
  ]) {
    assert.ok(scanned.includes(required), `${required} is not scanned by the gate`);
  }
  // And the count is not allowed to collapse quietly.
  assert.ok(scanned.length >= 12, `only ${String(scanned.length)} files scanned`);
});

// ---------------------------------------------------------------------------
// AD-9 rule 2: the suggestion scan is a failure message, never a resolution path
// ---------------------------------------------------------------------------

test('the listing adapter is scanned, and permitted only to read', async () => {
  // A second unconfined module under `src/adapters/fs/` is exactly the kind of
  // addition that makes AD-1 worth having: it steps outside the permitted root
  // deliberately, so the *operation* layer of the gate is the only thing
  // holding read-only. The generic assertions above cover it once it is
  // scanned; this row is what says it is scanned at all, and that its imports
  // are still reads.
  const scanned = await collectSourceFiles(REPO_ROOT);
  assert.ok(
    scanned.includes('src/adapters/fs/list.ts'),
    `the listing adapter is not scanned; found: ${scanned.join(', ')}`,
  );

  const source = await readFile(join(REPO_ROOT, 'src', 'adapters', 'fs', 'list.ts'), 'utf8');
  assert.match(source, /from 'node:fs'/, 'the listing adapter must be where fs is imported');
  assert.match(source, /readdirSync/);
  assert.deepEqual(await findImportViolations(REPO_ROOT), []);
  assert.deepEqual(await findMutatingOperations(REPO_ROOT), []);
});

/**
 * Repo-relative files under the scanned roots whose imports name `suffix`.
 *
 * Uses the gate's own tokenizer rather than a regex over raw source. The
 * hand-rolled version this replaces matched `/['"][^'"]*\bsuggest\.ts['"]/`
 * against the file text, which both over- and under-reported: a doc comment
 * merely *mentioning* the filename counted as an import, and a computed
 * specifier counted as nothing. `scanSource` blanks comments while keeping
 * string literals, which is exactly the view an import scan wants, and
 * `findUnanalysable` already denies the computed-specifier escape separately.
 *
 * **Scoped to `SCANNED_ROOTS`** — `src`, `web`, `scripts`. `test/` is ungated
 * by design and does import both of these modules; the rule is about what
 * *ships*, not about what the suite is allowed to reach.
 */
async function importersOf(root: string, target: string): Promise<string[]> {
  const importers: string[] = [];
  for (const file of await collectSourceFiles(root)) {
    if (file === target) continue;
    const scanned = scanSource(await readFile(join(root, file), 'utf8'));
    for (const match of scanned.withLiterals.matchAll(SPECIFIER_PATTERN)) {
      const specifier = match[2];
      if (specifier === undefined) continue;
      // Resolved against the importing file, because that is the only way a
      // relative specifier answers "which module is this". Comparing suffixes
      // instead reported nothing at all for `'./suggest.ts'`, which is how
      // every real importer in this repository spells it.
      if (!specifier.startsWith('.')) continue;
      const resolved = join(dirname(file), specifier).split(sep).join('/');
      if (resolved === target) {
        importers.push(file);
        break;
      }
    }
  }
  return importers.sort();
}

test('the unconfined listing capability is importable only by the suggestion scan', async () => {
  // Demonstrated as a hole: `import { listChildDirectories } from
  // '../adapters/fs/list.ts'` added to `src/render/page.ts` left the whole
  // suite green, so any module could enumerate any directory on the machine —
  // bypassing `ConfinedReader` entirely — with all four gate layers passing.
  //
  // This is the enforcement AD-10's scoped exception names. The exception is
  // only as narrow as the importer set, so the set is asserted exactly rather
  // than as a prefix rule: a second importer is a widening of the carve-out
  // and has to be a deliberate edit here.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/adapters/fs/list.ts'),
    ['src/cli/suggest.ts'],
    'only the suggestion scan may import the unconfined listing adapter',
  );
});

test('the suggestion scan is importable only by the composition root', async () => {
  // AD-9 rule 2 says the scan "returns nothing the domain consumes". The
  // behavioural half is asserted below; this is the structural half, and it is
  // the cheaper of the two to keep true — a render module or an adapter
  // importing this file is the first step of it becoming a resolution path,
  // and it would fail no other rule here.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/cli/suggest.ts'),
    ['src/cli/index.ts'],
    'the suggestion scan may only be imported by the composition root',
  );
});

test('substituting the scan changes the suggestions and nothing about serving', async (t) => {
  // The rule made observable, which the frozen intent requires: "at least one
  // test must show that substituting the scan for something inert changes the
  // suggestions and changes nothing about which root gets served."
  //
  // Three halves, not two, because two did not hold. A reviewer added
  // `void suggest(invocation.projectRoot);` to the *successful* resolution path
  // and the suite stayed green at 436: this test compared only the served root
  // and stderr, and every scan-recording test used a refusal target, so
  // nothing anywhere counted invocations on the success path. The fence has to
  // face both directions.
  const { makeProjectDir } = await import('./support/project.ts');
  const { observeRun } = await import('./support/cli.ts');

  const project = await makeProjectDir(t, 'bmad-dash-ad9-');
  const inside = join(project, '_bmad-output');
  const inert = (): readonly string[] => [];

  // Refused: the suggestions are the only thing that moves.
  const refusedReal = await observeRun([inside]);
  const refusedInert = await observeRun([inside], { suggest: inert });
  assert.equal(refusedReal.code, refusedInert.code, 'the exit code must not depend on the scan');
  assert.deepEqual(refusedReal.served, [], 'a refused target must never reach the server');
  assert.deepEqual(refusedInert.served, []);
  assert.notEqual(
    refusedReal.err,
    refusedInert.err,
    'replacing the scan with a stub changed no output — the suggestions are not observable',
  );
  // Keyed on the indented invocation line rather than on the path appearing
  // somewhere: the refused target is `<project>/_bmad-output`, so the Story 1.5
  // message contains `project` as a substring whatever the scan does.
  const pasteable = (text: string): string[] =>
    text.split('\n').filter((line) => line.startsWith('    '));
  assert.ok(
    pasteable(refusedReal.err).some((line) => line.endsWith(project)),
    `the real scan suggested nothing:\n${refusedReal.err}`,
  );
  assert.deepEqual(
    pasteable(refusedInert.err),
    [],
    `the inert scan still suggested something:\n${refusedInert.err}`,
  );

  // Served: the root is identical, the message is identical, and the scan is
  // not called at all — resolution succeeding is precisely when it must not be.
  const servedReal = await observeRun([project]);
  const servedInert = await observeRun([project], { suggest: inert });
  assert.equal(servedReal.code, 0, servedReal.err);
  assert.equal(servedInert.code, 0, servedInert.err);
  assert.deepEqual(servedReal.served, [project], 'the resolved root is what gets served');
  assert.deepEqual(
    servedReal.served,
    servedInert.served,
    'the root that gets served must not depend on the suggestion scan',
  );
  assert.equal(servedReal.err, servedInert.err, 'a served run must produce no suggestions at all');
  assert.deepEqual(
    servedReal.scans,
    [],
    'a successful resolution must not consult the suggestion scan even once',
  );
  assert.deepEqual(servedInert.scans, []);
});
