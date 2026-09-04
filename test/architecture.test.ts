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
 *      constraint). Written before the directory existed, because a prefix rule
 *      that has only ever seen an empty layer passes vacuously. Story 1.7
 *      created the layer, so the real-tree assertion is now load-bearing and
 *      the scratch fixture beside it proves the rule fires rather than that the
 *      layer is empty.
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
  PURE_LAYER,
  SCANNED_ROOTS,
  SPECIFIER_PATTERN,
  codeMatches,
  collectSourceFiles,
  gateKey,
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
import { MAX_PORT } from '../src/adapters/http/server.ts';
import { MARKERS } from '../src/cli/location.ts';
import { OUTPUT_DIRECTORY } from '../src/cli/inventory.ts';

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

// The two Node floors this project runs on are different numbers, and the
// difference was documented only in package.json's `"//"` string, which no tool
// read -- so nothing failed if the field and its own explanation drifted apart.
// This row makes the note the source of truth and reads both floors out of it
// rather than holding a second copy: the suite needs >= 22.18 for unflagged
// type stripping, the shipped tool needs only >= 22 because it ships compiled
// JavaScript and runs no build on install. That last clause is the *reason* the
// floors may differ, so it is asserted too -- add an install-time hook and the
// shipped floor is no longer justified, which is the drift worth catching.
test("the engines floor agrees with package.json's own explanation of it", async () => {
  const manifest: unknown = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
  const { '//': note, engines, scripts } = manifest as Record<string, unknown>;

  assert.equal(typeof note, 'string', 'package.json must keep its "//" explanation');
  const suiteFloor = /suite requires Node >= (\d+)\.(\d+)/.exec(note as string);
  const shippedFloor = /engines floor of (\d+)/.exec(note as string);
  assert.ok(suiteFloor, 'the "//" note must state the suite\'s own Node floor');
  assert.ok(shippedFloor, 'the "//" note must state the shipped floor');

  // Field against note. Either one moving without the other fails here.
  assert.deepEqual(
    engines,
    { node: `>=${shippedFloor[1]}` },
    'engines.node must be the floor the "//" note says the shipped tool needs',
  );

  // The suite is running, so this asserts the floor the note names is actually
  // met by the process reading this file -- not that type stripping works,
  // which loading this .ts file at all is what demonstrates.
  const [major = '0', minor = '0'] = process.version.replace(/^v/, '').split('.');
  const running = Number(major) * 1000 + Number(minor);
  const required = Number(suiteFloor[1]) * 1000 + Number(suiteFloor[2]);
  assert.ok(
    running >= required,
    `suite needs Node >= ${suiteFloor[1]}.${suiteFloor[2]}, running ${process.version}`,
  );

  // The justification for the lower shipped floor: nothing builds on install.
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
    assert.ok(
      !Object.hasOwn((scripts ?? {}) as object, hook),
      `${hook} runs on install, so the shipped tool would need the suite's floor`,
    );
  }
});

test('no stale .js implementation sits beside its .ts replacement', async () => {
  const stale = (await collectSourceFiles(REPO_ROOT)).filter((file) =>
    /\.(js|mjs|cjs|jsx)$/.test(file),
  );
  assert.deepEqual(
    stale,
    [],
    `JavaScript files remain in a scanned root: ${stale.join(', ')}`,
  );
});

// The row above used to filter `src/` as well, which made it narrower than the
// invariant it is named for: a compiled leftover under `scripts/` or `web/` was
// invisible to a guard reading as though it covered the scan. Widening it is
// only safe while the collector stays inside `SCANNED_ROOTS` -- otherwise the
// first `dist/` build would fail the row above with the tool's own output. That
// bound is what this row asserts, from the side the row above cannot: not that
// the roots are reached (asserted separately), but that nothing outside them is.
test('the source scan stays inside the roots it declares', async () => {
  const outside = (await collectSourceFiles(REPO_ROOT)).filter(
    (file) => !SCANNED_ROOTS.some((root) => file.startsWith(`${root}/`)),
  );
  assert.deepEqual(
    outside,
    [],
    `scan reached outside ${SCANNED_ROOTS.join(', ')}: ${outside.join(', ')}`,
  );
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

test('a planted child_process import outside the browser adapter is reported', async (t) => {
  const root = await scratch(t);
  await write(
    root,
    'src/adapters/http/server.ts',
    "const { spawn } = require('child_process');\nexport default spawn;\n",
  );
  // Both planted, and the expectation below is what separates them. `git/` was
  // granted `child_process` from the first story until 2026-09-03, over a
  // directory that never existed; the grant is gone, and a fixture that expects
  // a violation there is how its removal is asserted rather than assumed.
  // `browser/` is the live grant and must still be silent.
  for (const adapter of ['git', 'browser']) {
    await write(
      root,
      `src/adapters/${adapter}/run.ts`,
      "import { execFile } from 'node:child_process';\nexport { execFile };\n",
    );
  }
  assert.deepEqual(
    (await findImportViolations(root)).map((v) => v.file).sort(),
    ['src/adapters/git/run.ts', 'src/adapters/http/server.ts'],
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
  // Two halves, and the first one only started holding in Story 1.7: the layer
  // now exists, so the real-tree assertion above is a claim about real files
  // rather than about an empty prefix. The scratch fixture below stays, because
  // "the layer is non-empty" and "the rule fires" are different facts and the
  // second is the one the frozen constraint rests on.
  const real = await collectSourceFiles(REPO_ROOT);
  const pure = real.filter((file) => file.startsWith(PURE_LAYER));
  // Counted, not enumerated: the claim is that the layer is non-empty and the
  // scan reaches it, which is what makes the assertion above load-bearing. A
  // list of filenames here would have to be edited by every future domain
  // module while checking nothing that this does not.
  assert.ok(
    pure.length > 0,
    `${PURE_LAYER} is empty, so the purity assertion above passes vacuously`,
  );

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
    ['src/adapters/browser/', 'scripts/'],
  );
  assert.deepEqual([...(GATED_MODULES.get('fs') ?? [])], ['src/adapters/fs/']);
});

test('every gate permission is load-bearing, so none can be granted over nothing', async () => {
  // The row above pins the grants; this one pins that each grant *does*
  // something. `src/adapters/git/` sat in the `child_process` list from the
  // first story to 2026-09-03 over a directory that never existed, and the
  // `deepEqual` above asserted it as though it were load-bearing -- an
  // assertion that cannot fail, which is this epic's dominant defect class
  // applied to the gate itself. A permission whose prefix holds no file that
  // imports the module is either premature or left over, and both are worth a
  // failing test rather than a comment.
  const files = await collectSourceFiles(REPO_ROOT);
  for (const [module, prefixes] of GATED_MODULES) {
    for (const prefix of prefixes) {
      const under = files.filter((file) => file.startsWith(prefix));
      assert.ok(under.length > 0, `${prefix} is granted ${module} and holds no scanned source`);

      const users: string[] = [];
      for (const file of under) {
        const scanned = scanSource(await readFile(join(REPO_ROOT, file), 'utf8'));
        const imports = codeMatches(scanned, SPECIFIER_PATTERN).some(
          (match) => match[2] !== undefined && gateKey(match[2]) === module,
        );
        if (imports) users.push(file);
      }
      assert.ok(
        users.length > 0,
        `${prefix} is granted ${module} and nothing under it imports it; ` +
          `drop the grant, or add it back with the story that needs it`,
      );
    }
  }
});

test('a scanned root with no source in it is stated, so its first file is a deliberate edit', async () => {
  // `web/` is in `SCANNED_ROOTS` because that is the right remit -- client code
  // ships from there -- and it is empty, so every rule scoped to it passes on
  // an empty walk. Removing it from the roots would leave the first web file
  // ungated, which is worse. So the emptiness is stated instead, the same way
  // this suite states an asserted-empty importer set: when `web/` gains its
  // first source file this row fails, and whoever adds it confirms the gate now
  // covers it rather than discovering later that it never did.
  const files = await collectSourceFiles(REPO_ROOT);
  const empty = SCANNED_ROOTS.filter(
    (root) => !files.some((file) => file.startsWith(`${root}/`)),
  );
  assert.deepEqual([...empty], ['web'], 'a scanned root changed from empty to covered, or back');
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

test('the scan reaches every module in the pure layer', async () => {
  // The same positive assertion as the row above, for the layer whose rule is
  // the frozen one. `findDomainViolations` is of the form "no scanned file
  // under src/domain/ imports anything", which a scan returning nothing
  // satisfies perfectly -- and that rule was written *before* the directory
  // existed, on the explicit grounds that a prefix rule over an empty directory
  // passes vacuously. It holds seven modules now, so this is what stops the
  // strongest rule in the repository from going quiet if the scan ever stops
  // reaching them.
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const domainDir = join(REPO_ROOT, PURE_LAYER.replace(/\/$/, '').split('/').join('/'));
  const onDisk = (await readdir(domainDir)).filter((name) => name.endsWith('.ts')).sort();
  assert.ok(onDisk.length >= 7, `expected the domain's modules, found ${onDisk.join(', ')}`);

  const scanned = await collectSourceFiles(REPO_ROOT);
  for (const name of onDisk) {
    const relative = `${PURE_LAYER}${name}`;
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
/**
 * Every name one module imports from one specifier, across **all** its import
 * statements, `type` markers stripped.
 *
 * The companion to `importersOf`, and it answers the question that one cannot:
 * an exact importer *set* says which modules may reach a target, and says
 * nothing about *what* they take from it. Story 1.12 needed the second half —
 * the render layer is admitted into the identity authority's set on the basis
 * that it reads label tables and no derivation, and a basis nothing checks is a
 * promise.
 *
 * **It reads every statement, and the first version read one.** A single `exec`
 * meant the basis held for one line: adding a second
 * `import { identify } from '../domain/identity.ts';` to `src/render/inventory.ts`
 * left the whole suite green — exactly the case the comment at that importer set
 * says "fails here" — and the same for `locateStories` from `sprint.ts`.
 * `test/architecture.test.ts` proves the fix with a negative case over a
 * fixture, because a helper that silently sees less than it claims is the shape
 * this repository has now been bitten by twice.
 *
 * Three forms are recognized, and anything else is refused rather than ignored:
 *
 *   - `import { a, b as c } from 'x'` — the named form. `b as c` records the
 *     **imported** name, which is what an importer set is about; the local
 *     alias is the importing module's business.
 *   - `import d, { a } from 'x'` — a default beside names. The default is
 *     recorded as `default`, so a module reaching for one is visible.
 *   - `import * as n from 'x'` — a namespace, recorded as `*`. It takes
 *     *everything*, so it can never satisfy an "and nothing else" assertion,
 *     and reporting it as the empty set would have made the widest import look
 *     like the narrowest.
 *
 * A bare `import 'x'` contributes nothing, which is correct: it binds no name.
 */
export function namedImports(source: string, specifier: string): readonly string[] {
  const quoted = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const statement = new RegExp(`import\\s+([^;]*?)\\s*from\\s*'${quoted}';`, 'g');
  const found: string[] = [];
  for (const match of source.matchAll(statement)) {
    const clause = (match[1] ?? '').replace(/^type\s+/, '').trim();
    if (clause === '') continue;
    const namespace = /^\*\s+as\s+/.exec(clause);
    if (namespace !== null) {
      found.push('*');
      continue;
    }
    const braces = /\{([\s\S]*)\}/.exec(clause);
    const before = braces === null ? clause : clause.slice(0, clause.indexOf('{'));
    const bare = before.replace(/,\s*$/, '').trim();
    if (bare !== '') found.push('default');
    for (const entry of (braces?.[1] ?? '').split(',')) {
      const name = entry
        .replace(/^\s*type\s+/, '')
        .replace(/\s+as\s+[\s\S]*$/, '')
        .trim();
      if (name !== '') found.push(name);
    }
  }
  // Deduplicated and sorted, because two statements may name the same thing and
  // the assertions this feeds are about the *set* a module may reach for.
  return [...new Set(found)].sort();
}

/** `namedImports` over a file in the tree. */
async function namedImportsIn(
  root: string,
  file: string,
  specifier: string,
): Promise<readonly string[]> {
  const source = await readFile(join(root, file), 'utf8');
  const names = namedImports(source, specifier);
  assert.ok(names.length > 0, `${file} must import from ${specifier} by name`);
  return names;
}

test('the import reader sees every statement, not only the first', () => {
  // The negative case, over a fixture rather than over the tree, because the
  // failure it proves is one the tree does not currently contain: a second
  // import statement naming the same module. Without this the helper's promise
  // is that it *looked*, not that it saw.
  const two = [
    "import { LEVEL_LABELS, type Level } from '../domain/identity.ts';",
    "import { FAMILIES } from '../domain/identity.ts';",
    "import { identify } from '../domain/identity.ts';",
  ].join('\n');
  assert.deepEqual(namedImports(two, '../domain/identity.ts'), [
    'FAMILIES',
    'LEVEL_LABELS',
    'Level',
    'identify',
  ]);
  // The three forms, and the one that can never satisfy "and nothing else".
  assert.deepEqual(namedImports("import * as all from './x.ts';", './x.ts'), ['*']);
  assert.deepEqual(namedImports("import fallback, { a } from './x.ts';", './x.ts'), [
    'a',
    'default',
  ]);
  // `b as c` records the imported name, not the local alias.
  assert.deepEqual(namedImports("import { b as c } from './x.ts';", './x.ts'), ['b']);
  // A side-effect import binds nothing, and another module's import of a
  // similarly-named file is not this one's.
  assert.deepEqual(namedImports("import './x.ts';", './x.ts'), []);
  assert.deepEqual(namedImports("import { a } from './xx.ts';", './x.ts'), []);
});

/**
 * Every specifier one module imports, sorted and deduplicated.
 *
 * The companion to `importersOf` and `namedImportsIn`, and it answers the
 * question neither can: *what may this module reach at all?* Added in Story
 * 2.1a's review round, where two modules carry a "reaches no filesystem" claim
 * that the gate cannot see — `node:path` is not a gated module, so a resolver
 * that joined a URL key onto the project root would pass every other rule in
 * this file. Greps for `resolve(` and `join(` were tried first and are the
 * wrong instrument: `Array.prototype.join` is an honest call, so the list needs
 * exceptions immediately and stops meaning anything.
 *
 * Uses the gate's own tokenizer, so a specifier mentioned in a doc comment is
 * not counted and a computed one is denied separately by `findUnanalysable`.
 */
async function importSpecifiersIn(root: string, file: string): Promise<string[]> {
  const scanned = scanSource(await readFile(join(root, file), 'utf8'));
  const specifiers = new Set<string>();
  for (const match of codeMatches(scanned, SPECIFIER_PATTERN)) {
    const specifier = match[2];
    if (specifier !== undefined) specifiers.add(specifier);
  }
  return [...specifiers].sort();
}

async function importersOf(root: string, target: string): Promise<string[]> {
  const importers: string[] = [];
  for (const file of await collectSourceFiles(root)) {
    if (file === target) continue;
    const scanned = scanSource(await readFile(join(root, file), 'utf8'));
    for (const match of codeMatches(scanned, SPECIFIER_PATTERN)) {
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

test('the HTTP adapter reaches only the layers its row grants', async () => {
  // Added 2026-09-03, from the epic 1 retrospective: this was the one
  // unambiguous layering violation in the epic and nothing constrained it.
  // `src/adapters/http/server.ts` imports `src/adapters/fs/paths.ts`, the layer
  // table granted the HTTP adapter "domain, render", and the dependency diagram
  // had no HTTP-to-FS edge. No test looked at what the HTTP adapter imports at
  // all, so the violation was silent rather than caught.
  //
  // Resolved by granting the edge rather than removing it, and the spine says
  // so with a dated Amendment log row. What crosses is a branded *type* and
  // `toPlatform`, which is `return path` -- an unbrand, no I/O, no filesystem
  // behaviour. The alternative, moving the path vocabulary somewhere both
  // layers may import, is recorded in `deferred-work.md`: it would split the
  // vocabulary from `canonical`, its only real operation, which needs
  // `node:path` and `realpath` and so cannot follow it into `src/domain/`.
  //
  // The exception is asserted as an exact list, not permitted as a prefix, so
  // reaching for `canonical` or `ConfinedReader` from here fails.
  const granted = ['src/adapters/http/', 'src/domain/', 'src/render/'];
  const reached: string[] = [];
  for (const file of await collectSourceFiles(REPO_ROOT)) {
    if (!file.startsWith('src/adapters/http/')) continue;
    const scanned = scanSource(await readFile(join(REPO_ROOT, file), 'utf8'));
    for (const match of codeMatches(scanned, SPECIFIER_PATTERN)) {
      const specifier = match[2];
      if (specifier === undefined || !specifier.startsWith('.')) continue;
      const resolved = join(dirname(file), specifier).split(sep).join('/');
      if (granted.some((prefix) => resolved.startsWith(prefix))) continue;
      reached.push(`${file} -> ${resolved}`);
    }
  }
  assert.deepEqual(
    reached.sort(),
    ['src/adapters/http/server.ts -> src/adapters/fs/paths.ts'],
    'the HTTP adapter may leave its granted layers for the path vocabulary only',
  );

  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/adapters/http/server.ts', '../fs/paths.ts'),
    ['CanonicalPath', 'toPlatform'],
    'the brand and the unbrand, and nothing that reads or resolves',
  );
});

test('the shared narrowing has a stated importer set', async () => {
  // B1's resolution, pinned. `errorCode` is in the pure layer because that is
  // the one layer the HTTP adapter, the filesystem adapter and the composition
  // root can all reach -- not because narrowing a thrown value is a domain
  // concept. The set is stated so that reason stays visible: a fourth importer
  // is fine and is where the six remaining `(error as { code?: string })` casts
  // under `src/adapters/fs/` should end up, but it is a deliberate edit here
  // rather than a quiet spread of a utility through the model layer.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/thrown.ts'),
    ['src/adapters/http/server.ts', 'src/cli/index.ts'],
    'the two modules that had a private copy of it, and no others yet',
  );

  // And no copy survives. The two were byte-identical, so a returning copy
  // would be invisible to every other row in this file.
  const spellings: string[] = [];
  for (const file of await collectSourceFiles(REPO_ROOT)) {
    if (file === 'src/domain/thrown.ts') continue;
    const raw = await readFile(join(REPO_ROOT, file), 'utf8');
    if (/function errorCode\s*\(/.test(scanSource(raw).code)) spellings.push(file);
  }
  assert.deepEqual(spellings, [], 'errorCode is declared once, in the pure layer');
});

test('the constants two modules both depend on are stated once, and cross-checked', async () => {
  // B8/B9, from the epic 1 retrospective. Before this, `MAX_PORT` was defined
  // privately in both the server and the composition root, with two different
  // literal spellings -- `65535` and `65_535` -- and the digits restated in
  // four test expectations. One definition now, exported from the module that
  // does the binding, which is why this row asserts there is only one.
  //
  // `'_bmad-output'` is the other shape: two independent spellings of one
  // string that are *supposed* to agree, as a `MARKERS` element and as
  // `OUTPUT_DIRECTORY`, with nothing checking that they do. They are not
  // consolidated -- a project marker and the name of the walked output folder
  // are different concerns that happen to share a value -- so the agreement is
  // asserted instead. That is the whole difference between this and `MAX_PORT`:
  // one value with one meaning gets one definition; one value with two meanings
  // gets a cross-check.
  //
  // The repository had exactly one test of this kind before today
  // (`package.json` against `src/version.json`), and it was never generalized.
  assert.ok(MARKERS.includes(OUTPUT_DIRECTORY), 'the output folder must be a project marker');

  const defining: string[] = [];
  for (const file of await collectSourceFiles(REPO_ROOT)) {
    const raw = await readFile(join(REPO_ROOT, file), 'utf8');
    if (/(?:^|\n)\s*(?:export\s+)?const MAX_PORT\s*=/.test(scanSource(raw).code)) {
      defining.push(file);
    }
  }
  assert.deepEqual(
    defining,
    ['src/adapters/http/server.ts'],
    'MAX_PORT is the binding adapter\'s to state, and only its',
  );
  assert.equal(MAX_PORT, 65535, 'and the value itself, so the single definition is still right');
});

test('the snapshot identity has a stated importer set, like every other domain module', async () => {
  // Added in Story 2.1's second review round, not by its task list: every other
  // module in the pure layer carries an exact importer set, and a new one
  // arriving without makes that table silently non-exhaustive — the reader
  // cannot tell "deliberately unconstrained" from "nobody added it".
  //
  // Two importers, and the pair is the story's whole shape: the composition
  // root derives the identity when it projects the view, and the render layer
  // takes only the *type* so `InventoryView` can carry it. A third importer
  // would mean something else had started deriving an identity of its own,
  // which is the AD-4 mistake — one authority, consumed everywhere — applied to
  // snapshots rather than to identification.
  //
  // **Shipped source only, and that is what makes the set exactly two.**
  // `importersOf` walks `SCANNED_ROOTS` — `src`, `web` and `scripts` — so the
  // test-support fixtures that import `digestOf` to stamp a fixed id
  // (`test/support/cli.ts`, `test/support/inventory.ts`) are invisible to it,
  // as is every test file. The rule constrains what ships, not what the suite
  // is allowed to reach for.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/snapshot.ts'),
    ['src/cli/index.ts', 'src/render/inventory.ts'],
    'the root derives the identity; the surface only carries its type',
  );

  // And the render layer takes the type and nothing executable, so it cannot
  // derive an identity even accidentally.
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/inventory.ts', '../domain/snapshot.ts'),
    ['SnapshotId'],
    'the surface may name the type, and must not reach the digest',
  );
});

test('the URL grammar has a stated importer set, like every other domain module', async () => {
  // Story 2.1a's new pure module, held to the convention the row above states
  // for the snapshot identity: every module in this layer carries an exact
  // importer set, and a new one arriving without makes the table silently
  // non-exhaustive — the reader cannot tell "deliberately unconstrained" from
  // "nobody added it".
  //
  // Three importers, and the split *is* AD-18. The spine says the URL grammar
  // "is defined once and owned by the server"; the ends of that one grammar are
  // the surfaces that build a link and the adapter that parses the request a
  // link produces. A fourth importer would mean something else had started
  // deriving a URL of its own, which is the disagreement AD-18 exists to
  // prevent — four units on one contract, each with its own shape.
  //
  // `src/render/artifact.ts` is here because the header's refresh control has
  // to point at the surface it is on (`EXPERIENCE.md:161`), which on that
  // surface is the artifact's own URL.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/url.ts'),
    ['src/adapters/http/server.ts', 'src/render/artifact.ts', 'src/render/inventory.ts'],
    'the surfaces build links and the adapter parses them; a fourth importer is a second grammar',
  );

  // And each end takes only its own half, so neither can quietly grow into the
  // other's job. In particular the render layer cannot *parse* a URL: doing so
  // would mean a surface resolving an address, which is the adapter's decision.
  for (const surface of ['src/render/inventory.ts', 'src/render/artifact.ts']) {
    assert.deepEqual(
      await namedImportsIn(REPO_ROOT, surface, '../domain/url.ts'),
      ['artifactUrl'],
      `${surface} builds URLs and does not parse them`,
    );
  }
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/adapters/http/server.ts', '../../domain/url.ts'),
    ['parseArtifactUrl'],
    'the adapter parses URLs and does not build them',
  );

  // The purity gate reads imports, and this module uses two *globals* —
  // `encodeURIComponent` and `decodeURIComponent` — which are invisible to it.
  // So the property the gate cannot see is asserted directly, and as an exact
  // **empty** specifier list rather than as a grep for suspicious names: the
  // module's header claims zero imports, and anything that could resolve, join,
  // read or stat a path would have to arrive through one. A grep for `resolve(`
  // or `join(` cannot do this job — `Array.prototype.join` is an honest call
  // and would have to be excused, which is how such a list rots.
  assert.deepEqual(
    await importSpecifiersIn(REPO_ROOT, 'src/domain/url.ts'),
    [],
    'the URL grammar imports nothing, so it can reach nothing',
  );
  assert.doesNotMatch(
    scanSource(await readFile(join(REPO_ROOT, 'src', 'domain', 'url.ts'), 'utf8')).code,
    /\bnode:|\brequire\b|getBuiltinModule/,
    'and names no Node built-in, not even through a global',
  );
});

test('the artifact view has a stated importer set, and reaches no filesystem', async () => {
  // Finding from review round 1: the traversal argument leans on this module
  // having no filesystem reach exactly as much as on `src/domain/url.ts`, and
  // only the latter had the assertion. `findArtifact` *is* the resolver — a URL
  // that names no row is a 404 because this function answers from the view's
  // rows and from nothing else — so "it cannot consult a filesystem" is a
  // load-bearing claim about this file, not a stylistic one.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/render/artifact.ts'),
    ['src/adapters/http/server.ts'],
    'the adapter asks for the artifact page; a second importer is a second route',
  );

  // What it may import, exactly. The import gate would happily pass a resolver
  // that reached for `node:path` and joined the key onto the project root,
  // because `node:path` is not a gated module — so the reach is denied by
  // naming the whole list rather than by grepping for function names. Every
  // entry here is a pure render or domain module; none of them can read a
  // directory, and `./page.ts` reaches `node:path` only for `basename` and
  // `isAbsolute` on a string it is handed.
  //
  // **Story 2.1b's two additions, and why neither weakens the claim.**
  // `../domain/signal.ts` is the four states and the six read stages — a
  // vocabulary, with no derivation in it — and the surface needs it because the
  // body it now renders can arrive as a typed read failure. `./markdown.ts` is
  // the parser boundary; it imports a *bundled* third-party parser, which is
  // why the reach question is asked of it separately below rather than answered
  // by this list. Neither can open a file: the body arrives as an argument.
  assert.deepEqual(
    await importSpecifiersIn(REPO_ROOT, 'src/render/artifact.ts'),
    [
      '../domain/identity.ts',
      '../domain/signal.ts',
      '../domain/url.ts',
      './components.ts',
      './html.ts',
      './inventory.ts',
      './markdown.ts',
      './page.ts',
    ],
    'a new import here is how a resolver would grow a filesystem reach',
  );
  assert.doesNotMatch(
    scanSource(await readFile(join(REPO_ROOT, 'src', 'render', 'artifact.ts'), 'utf8')).code,
    /\bnode:|\brequire\b|getBuiltinModule/,
    'and the resolver names no Node built-in, not even through a global',
  );
});

test('the markdown boundary is the one module that reaches a third-party parser', async () => {
  // **Story 2.1b's new question.** Every claim in this file so far is about
  // modules that import nothing but each other; this is the first module in
  // `src/` to import a package. Three things are asserted about it, and each is
  // load-bearing rather than tidy:
  //
  //   1. **Exactly one importer.** The parser must be reachable from the render
  //      boundary and nowhere else — an adapter or the composition root taking
  //      `renderMarkdown` would be a second place a project's bytes become
  //      markup, and the whole argument for the escaping concession is that it
  //      lives in one file.
  //   2. **Exactly these three specifiers.** `marked` is the parser, and the
  //      list is what makes a *second* dependency — a sanitiser, a highlighter —
  //      a deliberate edit here rather than a quiet line in `package.json`.
  //      Story 2.1b's spec puts both on its Ask-First list; this is the
  //      enforcement.
  //   3. **It names no Node built-in.** `node:fs` is gated and would be caught
  //      anyway; `node:path`, `node:module` and `createRequire` are not. A
  //      parser boundary reaching for `createRequire` is how a CommonJS
  //      dependency's dynamic requires get shimmed into a bundle, which is the
  //      shape `deferred-work.md`'s `yaml` measurement describes — so a module
  //      that needs it is one whose bundling this repository has not measured.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/render/markdown.ts'),
    ['src/render/artifact.ts'],
    'only the artifact view may reach the parser; a second importer is a second concession',
  );
  assert.deepEqual(
    await importSpecifiersIn(REPO_ROOT, 'src/render/markdown.ts'),
    ['../domain/frontmatter.ts', './html.ts', 'marked'],
    'a second dependency is Ask-First; this is where adding one becomes visible',
  );
  assert.doesNotMatch(
    scanSource(await readFile(join(REPO_ROOT, 'src', 'render', 'markdown.ts'), 'utf8')).code,
    /\bnode:|\brequire\b|getBuiltinModule/,
    'the parser boundary names no Node built-in, not even through a global',
  );
});

test('the document shell is reachable only from the render layer, which is its safety claim', async () => {
  // Finding from review round 1. `documentShell` emits `main` **verbatim** and
  // its docblock stakes that on "every caller is inside `src/render/` … Nothing
  // outside this layer can reach it" — a claim nothing checked, while every
  // comparable claim in this repository is held by an importer set. Exported
  // from a module the HTTP adapter already imports, one `import { documentShell }`
  // in the adapter would have made it a verbatim-HTML sink reachable from the
  // transport layer, with the docblock still asserting the opposite.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/render/page.ts'),
    ['src/adapters/http/server.ts', 'src/render/artifact.ts'],
    'the adapter takes the Dashboard page; the artifact view takes the shell',
  );
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/adapters/http/server.ts', '../../render/page.ts'),
    ['renderPage'],
    'the adapter takes a rendered document and may not compose one',
  );
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/artifact.ts', './page.ts'),
    ['documentShell'],
    'and the second surface takes the shell, not the first surface',
  );
});

test('the two most-coupled adapter modules have stated importer sets', async () => {
  // Added 2026-09-03, from the epic 1 retrospective: enforcement coverage was
  // inverse to actual coupling. `list.ts`, `walk.ts` and `segments.ts` each had
  // an asserted importer set and each had exactly one importer, while
  // `paths.ts` -- the most cross-cutting module in the tree -- and `read.ts`
  // had none. Importer sets were added one per story, so they covered what a
  // story happened to touch rather than what most needed constraining.
  //
  // These two are not carve-outs like `list.ts`, so the sets are not narrow.
  // What they buy is different: `paths.ts` owns the `CanonicalPath` brand and
  // `read.ts` owns the only confined reader, so a new importer of either is a
  // new module taking a position on identity or on reading, and this is where
  // that becomes visible instead of arriving as a diff nobody reviewed.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/adapters/fs/paths.ts'),
    [
      'src/adapters/fs/read.ts',
      'src/adapters/fs/walk.ts',
      'src/adapters/http/server.ts',
      'src/cli/index.ts',
      'src/cli/inventory.ts',
      'src/cli/location.ts',
      'src/cli/suggest.ts',
    ],
    'a new importer of the path vocabulary is a deliberate edit here',
  );
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/adapters/fs/read.ts'),
    [
      'src/adapters/fs/walk.ts',
      'src/cli/index.ts',
      'src/cli/inventory.ts',
      'src/cli/location.ts',
    ],
    'a new importer of the confined reader is a deliberate edit here',
  );
});

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

test('the tree walk is scanned, reads through the confined reader, and never lists', async () => {
  // A new module under `src/adapters/fs/` is the addition AD-1 exists for, so
  // the first thing asserted is that the gate can see it at all — the generic
  // import and mutation rules above are worth nothing over a file the scan
  // never opened.
  const scanned = await collectSourceFiles(REPO_ROOT);
  assert.ok(
    scanned.includes('src/adapters/fs/walk.ts'),
    `the tree walk is not scanned; found: ${scanned.join(', ')}`,
  );

  // The gate's own tokenizer and specifier pattern, not a regex over the raw
  // text. The first version of this test was `doesNotMatch(source, /node:fs/)`,
  // which the thing it guards can walk around three ways — `node:fs/promises`,
  // double quotes, a dynamic `import()` — and since `walk.ts` lives under
  // `src/adapters/fs/` AD-1 *permits* `node:fs` there, so this is the only
  // enforcement that the walk reads through `ConfinedReader` at all.
  // `findUnanalysable` below denies the computed-specifier escape separately.
  const scannedSource = scanSource(
    await readFile(join(REPO_ROOT, 'src', 'adapters', 'fs', 'walk.ts'), 'utf8'),
  );
  const specifiers = codeMatches(scannedSource, SPECIFIER_PATTERN).flatMap((match) =>
    match[2] === undefined ? [] : [match[2]],
  );
  assert.ok(specifiers.length > 0, 'no import specifiers found — the tokenizer saw nothing');

  for (const specifier of specifiers) {
    assert.notEqual(
      gateKey(specifier),
      'fs',
      `the walk reads through ConfinedReader, not fs — found ${specifier}`,
    );
    const resolved = specifier.startsWith('.')
      ? join('src/adapters/fs', specifier).split(sep).join('/')
      : specifier;
    assert.notEqual(
      resolved,
      'src/adapters/fs/list.ts',
      'the walk must not reach the unconfined lister: AD-10’s exception is names-only, no recursion, no read',
    );
  }
  assert.ok(
    specifiers.some(
      (specifier) => join('src/adapters/fs', specifier).split(sep).join('/') === 'src/adapters/fs/read.ts',
    ),
    `the walk must read through the confined reader; specifiers: ${specifiers.join(', ')}`,
  );

  assert.deepEqual(await findImportViolations(REPO_ROOT), []);
  assert.deepEqual(await findMutatingOperations(REPO_ROOT), []);
  assert.deepEqual(await findUnanalysable(REPO_ROOT), []);
});

test('the tree walk has a stated importer set, so its first consumer is a deliberate edit', async () => {
  // The same enforcement shape as the two assertions around it, and for the
  // same reason: AD-10's only mechanical protection is an exact importer set,
  // so a new adapter that reads and recurses needs its own. Story 1.7 is that
  // first consumer, and this line is the deliberate edit the set existed to
  // require — it was asserted empty until the inventory pass landed.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/adapters/fs/walk.ts'),
    ['src/cli/inventory.ts'],
    'only the inventory pass composes the walk; a second consumer is a decision',
  );
});

test('identity is derived in one place, and that place is the pure layer', async () => {
  // AD-4's mechanical half. "Every other unit consumes the recorded verdict and
  // never re-derives identity" is worth nothing as an intention: the cheapest
  // way for it to break is a render module importing the authority to ask a
  // question it should have been handed the answer to. So the authority has an
  // exact importer set, like the walk and the unconfined lister, and the
  // frontmatter reader — which is level 2's whole implementation — is
  // importable only by the authority itself.
  // The document model is the deliberate edit Story 1.8 makes here, and it is
  // the one widening the rule permits: it *consumes* a recorded verdict to say
  // what an artifact is made of, and derives no identity of its own. A render
  // module or an adapter appearing in this list is the failure the exact set
  // exists to catch.
  //
  // Story 1.9's interpretation rule is the second such edit, on the same
  // terms: it reads the shapes a recorded verdict carried to say whether FR-12
  // or FR-69 applies, and derives no family, shape or part of its own.
  //
  // Story 1.10's run facts are the third, and the widening it is allowed is the
  // narrowest of the three: `src/domain/runs.ts` takes a `Verdict` and nothing
  // else — no path, no listing, no name — so the one question it can answer is
  // what the recorded reading already said. A module here that took a folder
  // *name* would be re-deriving identity, which is the failure the exact set
  // exists to catch.
  //
  // **Story 1.12's edit is a render module, which the paragraph above calls the
  // failure this set exists to catch — so it is admitted on a narrow and
  // checkable basis rather than on a promise.** `src/render/inventory.ts` reads
  // the *vocabulary*: `FAMILIES` and the three label tables beside it, plus the
  // level labels FR-69's sentence is assembled from. It asks no identity
  // question, and cannot: the assertion below pins its import list to names
  // that carry no derivation, so adding `identify` — or `Candidate`, which is
  // the only way to call it — fails here. The alternative was a second copy of
  // the family, shape, confidence and level labels in the render layer, which
  // is the drift this project already corrects at four other sites and the
  // thing an exact importer set is a poor trade against.
  //
  // **Story 2.1a adds a second render importer on the identical basis.**
  // `src/render/artifact.ts` takes `FAMILY_LABELS` and the `Family` type, so the
  // artifact view can label its one tile with the family whose tile the row sat
  // in on the Dashboard — a label lookup, not a question. The alternative was a
  // second copy of the family labels, or inventing a tile label no document
  // carries; both are worse than one more name on an asserted list.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/identity.ts'),
    [
      'src/cli/inventory.ts',
      'src/domain/document.ts',
      'src/domain/interpretation.ts',
      'src/domain/runs.ts',
      'src/render/artifact.ts',
      'src/render/inventory.ts',
    ],
    'the pass, the document model, the interpretation rule, the run facts and the two render surfaces — which read labels only',
  );

  // The narrow basis, made mechanical, and asserted as an **exact list** rather
  // than as a denylist: every name the render layer takes from the authority is
  // a label table, a vocabulary list or a type, none of which can derive an
  // identity — and `identify` or `Candidate` appearing among them fails here
  // without anyone having had to think of naming them, which a denylist could
  // not promise for the next such name.
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/inventory.ts', '../domain/identity.ts'),
    [
      'CONFIDENCE_LABELS',
      'Confidence',
      'FAMILIES',
      'FAMILY_LABELS',
      'Family',
      'LEVELS',
      'LEVEL_LABELS',
      'Level',
      'SHAPE_LABELS',
      'Shape',
    ],
    'the render layer may read the identity vocabulary and nothing that derives one',
  );
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/artifact.ts', '../domain/identity.ts'),
    ['FAMILY_LABELS', 'Family'],
    'the artifact view may name a family and must not resolve one',
  );
  // Story 1.11's deliberate edit, and the reason it is deliberate rather than a
  // quiet import: this set exists to stop the frontmatter reader becoming
  // "something anything may key identity on", and the pass is now a second
  // importer. What it reads through it is **not** an identity — it is the
  // `story_location` scalar out of `sprint-status.yaml`, through the unfenced
  // entry point, and the verdict for that file was decided by the authority at
  // level 1 from its location without its content being opened. So the rule the
  // set protects is intact: no consumer here derives a family from frontmatter
  // except the authority. A render module or an adapter appearing in this list
  // would be the failure it is for.
  //
  // The alternative was a second hand-rolled zero-indent scalar reader in the
  // pass, which is two readers free to drift from each other over one file
  // format — the trade this widening buys out of.
  //
  // **Story 2.1b is the third importer, and it is a render module — which the
  // paragraph above named as "the failure it is for".** That sentence is kept
  // rather than quietly dropped, because the widening has to answer it. The
  // rule the set protects is that *no consumer derives a family from
  // frontmatter except the authority*, and what `src/render/markdown.ts` takes
  // is `bodyAfterFrontmatter` — where the block **ends**. It reads no field, so
  // it cannot derive anything from one, which the named-import assertion below
  // is what actually holds; the specifier set alone could not tell this from a
  // render module reading `title`.
  //
  // The alternative was a second line-splitter in the render layer, free to
  // disagree with this one about a BOM, about `\r\n`, and about whether `...`
  // closes a block — two readers of one fact, over the boundary that decides
  // what is content and what is metadata.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/frontmatter.ts'),
    ['src/cli/inventory.ts', 'src/domain/identity.ts', 'src/render/markdown.ts'],
    'level 2 is part of the authority; the pass may read a configured location and nothing else',
  );
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/markdown.ts', '../domain/frontmatter.ts'),
    ['bodyAfterFrontmatter'],
    'the render boundary may ask where the block ends, and may not read a field of it',
  );
});

test('the document model has a stated importer set, and the gate reads it as pure', async () => {
  // Story 1.8's new domain module, held to the same exact-set rule as the
  // authority beside it: composition is derived once, in the pass, and every
  // later surface consumes the recorded `Composition` rather than rebuilding it
  // from a listing it would have to re-enumerate to get.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/document.ts'),
    ['src/cli/inventory.ts'],
    'only the snapshot pass composes; Epic 2 consumes what it recorded',
  );

  // And the purity rule actually reaches it. `findDomainViolations` over the
  // real tree is already asserted above with its own diagnostics, so what is
  // missing — and all that is missing — is that the scan the rule runs over
  // sees these two files at all: a rule of the form "no scanned file does X"
  // passes vacuously over a file it never opened. The frozen constraint has no
  // `import type` exemption, so the model's only dependency may be the
  // authority next to it.
  const scanned = await collectSourceFiles(REPO_ROOT);
  for (const pure of ['src/domain/document.ts', 'src/domain/identity.ts']) {
    assert.ok(scanned.includes(pure), `${pure} is not scanned by the purity gate`);
  }
});

test('the signal vocabulary and the interpretation rule are pure, with exact importer sets', async () => {
  // Story 1.9's two domain modules, held to the same exact-set rule as the
  // authority and the document model beside them. An exact set is what makes
  // each widening deliberate: AD-8 calls its four states "the single
  // vocabulary used by the model, the conventions table, and the UI", so the
  // interesting failure is not an import that is refused — it is a *fifth*
  // copy of the four states appearing somewhere with nothing importing this
  // module at all, which is the state the project was in before it existed.
  //
  // `src/adapters/fs/read.ts` is in the signal set on purpose and is the one
  // adapter that belongs there: it returns a stage from this vocabulary rather
  // than spelling a fourth copy of it, and a port depending on the domain is
  // the permitted direction (the reverse is what the purity rule forbids).
  //
  // Story 1.11's addition is the third, and it is inside the pure layer:
  // `src/domain/sprint.ts` reuses `Readability` and `ReadStage` for the
  // tracking file's own signal rather than restating either. That is the
  // *point* of the exact set rather than a strain on it — a fifth copy of the
  // four states appearing somewhere is the failure, and a domain module reading
  // this vocabulary is the fix.
  //
  // **Story 1.12 is the fourth importer of the signal vocabulary, and it is the
  // one the set was waiting for.** The comment above names the interesting
  // failure as "a *fifth* copy of the four states appearing somewhere with
  // nothing importing this module at all" — which is exactly what a surface
  // spelling `Present` / `Not found` / `Unreadable` / `Not checked` in its own
  // page copy would be. `src/render/inventory.ts` reads `SIGNAL_LABELS` and the
  // `SignalState`/`ReadStage` types, so the four labels on the page are the
  // four the index defines, and a reworded label fails
  // `test/domain/signal.test.ts` rather than diverging silently. The decision
  // this entry was told to record in advance (`deferred-work.md`, Story 1.9's
  // unconsumed-exports finding) is answered: the labels are consumed, and the
  // definitions are not, because a requirement's own sentence is not page copy.
  //
  // **Story 2.1b is the fifth, and it is the second surface.** The artifact view
  // renders one artifact's *body*, which can arrive as a typed read failure —
  // so it names the state and the stage from this vocabulary and reads the state
  // word out of `SIGNAL_LABELS`, rather than spelling `Unreadable` and
  // `Not found` in a second page copy. That is the same basis the Dashboard was
  // admitted on and it is what stops the two surfaces disagreeing about what a
  // failure is called.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/signal.ts'),
    [
      'src/adapters/fs/read.ts',
      'src/cli/inventory.ts',
      'src/domain/sprint.ts',
      'src/render/artifact.ts',
      'src/render/inventory.ts',
    ],
    'the reading adapter, the pass, the location rule and the two surfaces that show the four states',
  );
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/artifact.ts', '../domain/signal.ts'),
    ['ReadStage', 'SIGNAL_LABELS', 'SignalState'],
    'the artifact view may read the labels and the two vocabularies, and nothing else',
  );
  // The interpretation rule's second importer, on the terms its own entry set:
  // the surface renders FR-12's state from `InterpretationState` rather than
  // from a boolean of its own, so the two states cannot collapse on the way to
  // the page — which is the whole reason that module exists.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/interpretation.ts'),
    ['src/cli/inventory.ts', 'src/render/inventory.ts'],
    'FR-12 and FR-69 are decided once, in the pass; the surface renders what it recorded',
  );

  // The "and nothing else" half, pinned for both — the prose above makes the
  // same promise for these two that it makes for the authority, and until this
  // round only the authority's was checked. The surface may read the four
  // labels and the state vocabularies; `interpret` is the derivation and is the
  // name that must not appear.
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/inventory.ts', '../domain/signal.ts'),
    ['ReadStage', 'SIGNAL_LABELS', 'SignalState'],
    'the surface may read the four labels and the two vocabularies, and nothing else',
  );
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/inventory.ts', '../domain/interpretation.ts'),
    ['InterpretationState'],
    'the surface branches on the recorded state and never re-derives it',
  );

  // And the purity rule actually reaches them: every rule in this file is of
  // the form "no scanned file does X", which passes vacuously over a file the
  // scan never opened. The frozen constraint has no `import type` exemption, so
  // `signal.ts` may import nothing at all and `interpretation.ts` only the
  // authority beside it.
  // `findDomainViolations` over the real tree has its own test above, with a
  // better failure message; re-running it here would only make this row slower
  // and its failures ambiguous. What is missing, and all that is missing, is
  // that the scan opens these two files at all.
  const scanned = await collectSourceFiles(REPO_ROOT);
  for (const pure of ['src/domain/signal.ts', 'src/domain/interpretation.ts']) {
    assert.ok(scanned.includes(pure), `${pure} is not scanned by the purity gate`);
  }
});

test('the run facts are pure, with an exact importer set of their own', async () => {
  // Story 1.10's new domain module, on the same terms as the three beside it.
  // The exact set is what makes AD-4 mechanical here: FR-71's and FR-72's facts
  // are derived once, in the pass, from the recorded verdict — a second
  // importer reaching for them would more likely be a surface asking the
  // question again than one consuming the answer.
  //
  // Story 1.12's edit, and it is a *consumer* rather than a second derivation —
  // the distinction the comment above draws. `src/render/inventory.ts` imports
  // the `Reuse` and `DateSignal` types and nothing else: it branches on facts
  // the pass recorded and takes no folder name, so it could not re-derive one.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/runs.ts'),
    ['src/cli/inventory.ts', 'src/render/inventory.ts'],
    'the pass derives run facts and the surface renders them; a third importer is a decision',
  );
  // And the "nothing else" the comment above promises: two fact *types* and no
  // `runFactsOf`, which is the derivation. Unpinned, the promise held for
  // whichever import statement happened to come first.
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/inventory.ts', '../domain/runs.ts'),
    ['DateSignal', 'Reuse'],
    'the surface branches on the recorded facts and derives none',
  );

  // And the purity rule reaches it: every rule in this file is of the form "no
  // scanned file does X", which passes vacuously over a file the scan never
  // opened. The frozen constraint has no `import type` exemption, so this
  // module's only dependency may be the authority beside it.
  const scanned = await collectSourceFiles(REPO_ROOT);
  assert.ok(scanned.includes('src/domain/runs.ts'), 'src/domain/runs.ts is not scanned by the purity gate');
});

test('the location vocabulary is pure, with an exact importer set of its own', async () => {
  // Story 1.11's new domain module, on the same terms as the four beside it.
  // The exact set is what makes the location answer a *recorded* one: FR-51 is
  // resolved once, in the pass, and Story 1.12 renders what it recorded. A
  // second importer here would most likely be a surface resolving
  // `story_location` for itself, which is the second discovery path AD-9 exists
  // to forbid — and the one whose mistake reads a file outside the project.
  //
  // **Story 1.12's edit, and it is the case this set's warning distinguishes.**
  // The comment above says a second importer "would most likely be a surface
  // resolving `story_location` for itself" — the second discovery path AD-9
  // forbids. `src/render/inventory.ts` resolves nothing: it takes the recorded
  // `LocationState` off the projected view and reads `outOfTreeReport`, which is
  // the string index's own sentence with its `<path>` substituted. Its import
  // list is pinned below, so a `locateStories` here would fail rather than
  // read.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/domain/sprint.ts'),
    ['src/cli/inventory.ts', 'src/render/inventory.ts'],
    'the pass resolves the story location and the surface renders it; a third importer is a decision',
  );
  assert.deepEqual(
    await namedImportsIn(REPO_ROOT, 'src/render/inventory.ts', '../domain/sprint.ts'),
    ['LocationState', 'outOfTreeReport'],
    'the surface may read the indexed sentence and the state vocabulary, and resolve nothing',
  );

  // And the purity rule reaches it: every rule in this file is of the form "no
  // scanned file does X", which passes vacuously over a file the scan never
  // opened. The frozen constraint has no `import type` exemption, so this
  // module's only dependency may be the signal vocabulary beside it — no path
  // type, no reader, no `node:fs`, which is also what makes "it never read
  // anything" a property of the code rather than of a test.
  const scanned = await collectSourceFiles(REPO_ROOT);
  assert.ok(
    scanned.includes('src/domain/sprint.ts'),
    'src/domain/sprint.ts is not scanned by the purity gate',
  );
});

test('the path-segment sanitizer is scanned, and importable only by the reading surface', async () => {
  // AD-10's first check. The exact set is narrow on purpose: the sanitizer
  // exists so that *one* place decides whether a content-derived segment may
  // become a path, and a second importer is the beginning of a caller applying
  // its own rules — or of the check being skipped by whoever forgot it. The
  // reading surface is the one place a path is built and then read, so it is the
  // one place the check belongs.
  //
  // A new module under `src/adapters/fs/` is the addition AD-1 exists for, so
  // the first thing asserted is that the gate can see it at all: the generic
  // import and mutation rules above are worth nothing over a file the scan never
  // opened.
  const scanned = await collectSourceFiles(REPO_ROOT);
  assert.ok(
    scanned.includes('src/adapters/fs/segments.ts'),
    `the sanitizer is not scanned; found: ${scanned.join(', ')}`,
  );

  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/adapters/fs/segments.ts'),
    ['src/adapters/fs/read.ts'],
    'the sanitizer runs where paths are read, and a second importer is a decision',
  );

  // And it touches nothing of its own — not the filesystem, and not even
  // `node:path`. AD-1 *permits* `node:fs` under this directory, so the generic
  // confinement rule says nothing here; the claim worth pinning is that the
  // sanitizer is a pure decision over a string, which is what lets it run
  // before any syscall could carry the value.
  //
  // The import set is **empty** rather than `['node:path']`, and that is the
  // review round's finding rather than tidiness: `path.sep` was the module's
  // one platform-dependent line, in a module whose whole doctrine is that a
  // value meaning two things on two hosts is refused rather than resolved two
  // ways. Removing the platform question removed the import with it.
  const source = await readFile(join(REPO_ROOT, 'src', 'adapters', 'fs', 'segments.ts'), 'utf8');
  const specifiers = codeMatches(scanSource(source), SPECIFIER_PATTERN).flatMap((match) =>
    match[2] === undefined ? [] : [match[2]],
  );
  assert.deepEqual(specifiers, [], 'the sanitizer decides over a string and imports nothing at all');
});

test('the inventory pass has a stated importer set, so its first surface is a deliberate edit', async () => {
  // **This is that edit.** The set was asserted empty with a message saying
  // Story 1.12 would be the first consumer and that adding it would be an edit
  // here, and the corresponding `deferred-work.md` entry said that if 1.12
  // landed without importing the pass, that would be a finding about 1.12.
  //
  // The one importer is the composition root, and that is the whole of the
  // rule: AD-3 takes one snapshot per refresh and AD-9 puts resolution in the
  // composition root, so a second importer would be a second pass over the same
  // tree — or, worse, a render module or an adapter taking one of its own, which
  // is what the set is narrow enough to catch.
  assert.deepEqual(
    await importersOf(REPO_ROOT, 'src/cli/inventory.ts'),
    ['src/cli/index.ts'],
    'the composition root takes the one pass; a second importer is a second snapshot',
  );
});

test('the render layer imports nothing from the composition root', async () => {
  // `ARCHITECTURE-SPINE.md:32` gives `src/render/` "domain types only" and its
  // graph has `RENDER --> DOMAIN` and no render-to-cli edge — and **nothing
  // enforced it**. Measured before this rule existed: adding
  // `import { takeInventory } from '../cli/inventory.ts'` to
  // `src/render/inventory.ts` left the whole suite green, so the render layer
  // could have consumed the pass's own `Inventory` — `CanonicalPath`,
  // `WalkEntry`, the confined reader's types and all — and inverted the
  // dependency the spine fixes.
  //
  // That is the direction that matters here rather than the reverse: the
  // composition root may import everything, so `src/cli/` reaching into
  // `src/render/` is legal and is how the projected view gets built. What must
  // not happen is the render layer reaching back.
  const offending: string[] = [];
  for (const file of await collectSourceFiles(REPO_ROOT)) {
    if (!file.startsWith('src/render/')) continue;
    const scanned = scanSource(await readFile(join(REPO_ROOT, file), 'utf8'));
    for (const match of codeMatches(scanned, SPECIFIER_PATTERN)) {
      const specifier = match[2];
      if (specifier === undefined || !specifier.startsWith('.')) continue;
      const resolved = join(dirname(file), specifier).split(sep).join('/');
      if (resolved.startsWith('src/cli/')) offending.push(`${file} -> ${resolved}`);
    }
  }
  assert.deepEqual(
    offending,
    [],
    'the render layer may depend on the domain, never on the composition root',
  );

  // And the scan reaches the render layer at all: every rule in this file is of
  // the form "no scanned file does X", which passes vacuously over files the
  // scan never opened.
  const scanned = await collectSourceFiles(REPO_ROOT);
  for (const module of ['src/render/inventory.ts', 'src/render/page.ts']) {
    assert.ok(scanned.includes(module), `${module} is not scanned by the architecture gate`);
  }
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
