/**
 * AD-1: the read-only invariant, enforced structurally.
 *
 * Three layers, because the first alone does not verify what NFR-1 requires:
 *
 *   1. **Confinement.** `node:fs` may only be imported inside
 *      `src/adapters/fs/`; `node:child_process` only inside
 *      `src/adapters/git/` and `src/adapters/browser/`.
 *   2. **Operation.** Inside that adapter, only the *reading* `fs` surface is
 *      permitted. Confining `node:fs` to one directory proves imports are tidy;
 *      it does nothing to stop that directory calling `writeFile`. Read-only is
 *      a property of the operations, not of the file layout.
 *   3. **Analysability.** `process.getBuiltinModule`, `createRequire` and a
 *      dynamic `import()` whose specifier is not a literal all reach a built-in
 *      without an import the gate can read. Those are reported rather than
 *      passed over, because a bypass the gate cannot see is a hole in the
 *      invariant it exists to enforce.
 *
 * The gate reads the `.ts` sources, not `dist/`, because the constraint lives in
 * the source a contributor edits. It reads stray `.js` under the scanned roots
 * too: a leftover compiled or legacy file must not hide a violation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every directory holding source a contributor edits, shipped or not.
 *
 * `scripts/` is included deliberately. It was outside the scan while
 * `scripts/run-tests.mjs` imports `node:child_process` — a module this gate
 * forbids outside two adapters — so the gate's reach was narrower than its
 * claim. A gate whose title is broader than what it reads is worse than no
 * gate, because it invites the belief that it checked.
 *
 * `test/` is exempt and stays exempt: fixtures legitimately create, write and
 * delete temporary trees, which is the whole mechanism by which the planted
 * violations below are proved to fail. Every assertion below names its scope.
 */
const SCANNED_ROOTS = ['src', 'web', 'scripts'] as const;

/**
 * Gated built-in -> the only directory prefixes allowed to import it.
 *
 * `scripts/` may spawn subprocesses: it is build and test tooling that runs on
 * a contributor's machine, is absent from the package `files` whitelist, and
 * never ships. It is *not* allowed to mutate the filesystem — see
 * `MUTATING_FS_OPERATIONS`, which applies to every scanned root. A future build
 * script that genuinely needs to write is an explicit decision to record here,
 * not something to discover by the gate quietly permitting it.
 */
const GATED_MODULES = new Map<string, readonly string[]>([
  ['fs', ['src/adapters/fs/']],
  ['child_process', ['src/adapters/git/', 'src/adapters/browser/', 'scripts/']],
]);

/**
 * The mutating `fs` surface. Denied everywhere in `src/`, including inside the
 * adapter permitted to import `fs` at all — that permission is to *read*.
 *
 * Names prone to colliding with unrelated code (`write`, `open`, `close`,
 * `read`) are deliberately absent: they appear on streams and responses, and a
 * gate that cries wolf gets weakened. The list covers the operations that
 * actually change a filesystem.
 */
const MUTATING_FS_OPERATIONS: readonly string[] = [
  'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync',
  'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync',
  'rm', 'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync',
  'rename', 'renameSync', 'copyFile', 'copyFileSync', 'cp', 'cpSync',
  'chmod', 'chmodSync', 'fchmod', 'fchmodSync', 'lchmod', 'lchmodSync',
  'chown', 'chownSync', 'fchown', 'fchownSync', 'lchown', 'lchownSync',
  'truncate', 'truncateSync', 'ftruncate', 'ftruncateSync',
  'utimes', 'utimesSync', 'futimes', 'futimesSync', 'lutimes', 'lutimesSync',
  'symlink', 'symlinkSync', 'link', 'linkSync',
  'createWriteStream',
];

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx',
]);

/**
 * Every module specifier in an import, dynamic import or require position.
 * Deliberately syntactic: it over-matches rather than under-matches, because a
 * missed import is a hole in the invariant and a false positive is a loud test.
 */
const SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;

/** Named bindings pulled out of an import, with the specifier they came from. */
const NAMED_IMPORT_PATTERN =
  /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2/g;

/** Ways to reach a built-in that no import-specifier scan can resolve. */
const UNANALYSABLE_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'process.getBuiltinModule', pattern: /\bgetBuiltinModule\s*\(/ },
  { name: 'createRequire', pattern: /\bcreateRequire\b/ },
  { name: 'dynamic import() with a non-literal specifier', pattern: /\bimport\s*\(\s*(?!['"])/ },
];

interface Violation {
  readonly file: string;
  readonly specifier: string;
  readonly allowed: readonly string[];
}

interface OperationViolation {
  readonly file: string;
  readonly operation: string;
  readonly how: string;
}

interface Unanalysable {
  readonly file: string;
  readonly mechanism: string;
}

/** The gate key: `node:` stripped, subpath dropped. */
function gateKey(specifier: string): string {
  const withoutPrefix = specifier.startsWith('node:')
    ? specifier.slice('node:'.length)
    : specifier;
  return withoutPrefix.split('/')[0] ?? withoutPrefix;
}

/**
 * Strip comments before scanning for operations.
 *
 * The import scan is happy to over-match; the operation scan is not, because
 * prose legitimately names the operations it forbids — this very file does.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/**
 * Repo-relative POSIX paths of source files under the scanned roots. A missing
 * root contributes nothing, so this holds on a tree where `web/` does not exist.
 */
async function collectSourceFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(absolute: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch (error: unknown) {
      if (isEnoent(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const child = join(absolute, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        await walk(child);
        continue;
      }
      if (!entry.isFile()) continue;
      const dot = entry.name.lastIndexOf('.');
      if (dot === -1 || !SOURCE_EXTENSIONS.has(entry.name.slice(dot))) continue;
      found.push(relative(root, child).split(sep).join('/'));
    }
  }

  for (const scanned of SCANNED_ROOTS) {
    await walk(join(root, scanned));
  }
  return found.sort();
}

async function findImportViolations(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];

  for (const file of await collectSourceFiles(root)) {
    const source = await readFile(join(root, file), 'utf8');
    for (const match of source.matchAll(SPECIFIER_PATTERN)) {
      const specifier = match[2];
      if (specifier === undefined) continue;
      const allowed = GATED_MODULES.get(gateKey(specifier));
      if (allowed === undefined) continue;
      if (allowed.some((prefix) => file.startsWith(prefix))) continue;
      violations.push({ file, specifier, allowed });
    }
  }

  return violations;
}

/**
 * Uses of the mutating `fs` surface, anywhere in `src/` — the adapter included.
 * Caught two ways: imported by name from an `fs` module, and called.
 */
async function findMutatingOperations(root: string): Promise<OperationViolation[]> {
  const found: OperationViolation[] = [];
  const denied = new Set(MUTATING_FS_OPERATIONS);

  for (const file of await collectSourceFiles(root)) {
    const raw = await readFile(join(root, file), 'utf8');
    const code = stripComments(raw);

    for (const match of code.matchAll(NAMED_IMPORT_PATTERN)) {
      const [, bindings, , specifier] = match;
      if (bindings === undefined || specifier === undefined) continue;
      if (gateKey(specifier) !== 'fs') continue;
      for (const binding of bindings.split(',')) {
        const name = binding.split(/\s+as\s+/)[0]?.trim();
        if (name !== undefined && denied.has(name)) {
          found.push({ file, operation: name, how: `imported from '${specifier}'` });
        }
      }
    }

    for (const operation of MUTATING_FS_OPERATIONS) {
      // A call site, whether bare or through a namespace: `rm(` or `fs.rm(`.
      if (new RegExp(`(?:\\.|\\b)${operation}\\s*\\(`).test(code)) {
        found.push({ file, operation, how: 'called' });
      }
    }
  }

  return found;
}

/** Indirections that would reach a built-in without a readable import. */
async function findUnanalysable(root: string): Promise<Unanalysable[]> {
  const found: Unanalysable[] = [];

  for (const file of await collectSourceFiles(root)) {
    const source = await readFile(join(root, file), 'utf8');
    for (const { name, pattern } of UNANALYSABLE_PATTERNS) {
      if (pattern.test(source)) found.push({ file, mechanism: name });
    }
  }

  return found;
}

function describe(violations: readonly Violation[]): string {
  return violations
    .map((v) => `${v.file} imports ${v.specifier}; only ${v.allowed.join(', ')} may`)
    .join('\n');
}

function describeOperations(found: readonly OperationViolation[]): string {
  return found
    .map((o) => `${o.file} ${o.how} the mutating operation ${o.operation}`)
    .join('\n');
}

function describeUnanalysable(found: readonly Unanalysable[]): string {
  return found.map((u) => `${u.file} uses ${u.mechanism}, which the gate cannot resolve`).join('\n');
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
}

test('no module outside its permitted adapter imports a gated built-in', async () => {
  const violations = await findImportViolations(REPO_ROOT);
  assert.deepEqual(violations, [], `AD-1 violated:\n${describe(violations)}`);
});

test('no source under src/, web/ or scripts/ uses the mutating fs surface', async () => {
  // The invariant is read-only, not fs-is-tidy. Confinement is layer one; this
  // is the layer that actually says the tool cannot write.
  const found = await findMutatingOperations(REPO_ROOT);
  assert.deepEqual(found, [], `read-only violated:\n${describeOperations(found)}`);
});

test('the permitted adapter imports fs, and only to read', async () => {
  // Proves the allowance path is exercised on the real tree rather than only in
  // the synthetic trees below, and that the permission is narrow.
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
    // Tooling: previously outside the scan while importing a gated built-in.
    'scripts/run-tests.ts',
  ]) {
    assert.ok(files.includes(expected), `${expected} not scanned; found: ${files.join(', ')}`);
  }
});

test('the subprocess allowance for tooling cannot leak into the package', async () => {
  // `scripts/` may spawn because it never ships. That premise is the whole
  // justification for the allowance, so it is asserted rather than assumed.
  const manifest: unknown = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
  const files = (manifest as { files?: unknown }).files;
  assert.ok(Array.isArray(files), 'package.json must declare an explicit files whitelist');
  for (const entry of files as unknown[]) {
    assert.notEqual(entry, 'scripts', 'scripts/ must never be published');
    assert.notEqual(entry, 'test', 'test/ must never be published');
    assert.notEqual(entry, 'src', 'src/ must never be published');
  }
});

test('no stale .js implementation sits beside its .ts replacement', async () => {
  // Scoped to `src/`: `scripts/` is plain `.mjs` tooling by design, never
  // compiled and never shipped, so it is not a stale-port candidate.
  const stale = (await collectSourceFiles(REPO_ROOT)).filter(
    (file) => file.startsWith('src/') && /\.(js|mjs|cjs|jsx)$/.test(file),
  );
  assert.deepEqual(stale, [], `JavaScript files remain under src/: ${stale.join(', ')}`);
});

test('an empty tree yields no findings of any kind', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.deepEqual(await findImportViolations(root), []);
  assert.deepEqual(await findMutatingOperations(root), []);
  assert.deepEqual(await findUnanalysable(root), []);
});

test('a planted node:fs import outside the fs adapter is reported by file name', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'src', 'domain'), { recursive: true });
  await writeFile(
    join(root, 'src', 'domain', 'offender.ts'),
    "import fs from 'node:fs';\nexport const x = fs;\n",
  );
  await mkdir(join(root, 'src', 'adapters', 'fs'), { recursive: true });
  await writeFile(
    join(root, 'src', 'adapters', 'fs', 'reader.ts'),
    "import { readFile } from 'node:fs/promises';\nexport { readFile };\n",
  );

  const violations = await findImportViolations(root);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.file, 'src/domain/offender.ts');
  assert.match(describe(violations), /src\/domain\/offender\.ts/);
});

test('a mutating call inside the permitted fs adapter is still denied', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'src', 'adapters', 'fs'), { recursive: true });
  // Import-legal: this is the one directory allowed to touch `node:fs`.
  await writeFile(
    join(root, 'src', 'adapters', 'fs', 'writer.ts'),
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
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'src', 'adapters', 'fs'), { recursive: true });
  await writeFile(
    join(root, 'src', 'adapters', 'fs', 'ns.ts'),
    "import fs from 'node:fs';\nexport const wipe = (p: string) => fs.rmSync(p, { recursive: true });\n",
  );

  const found = await findMutatingOperations(root);
  assert.ok(found.some((o) => o.operation === 'rmSync'), describeOperations(found));
});

test('prose naming a mutating operation is not a violation', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'src', 'adapters', 'fs'), { recursive: true });
  await writeFile(
    join(root, 'src', 'adapters', 'fs', 'documented.ts'),
    '/**\n * Nothing here calls writeFile, mkdir or rm. Those would be writes.\n */\n' +
      "import { realpathSync } from 'node:fs';\n" +
      'export const look = (p: string) => realpathSync(p);\n',
  );

  assert.deepEqual(
    await findMutatingOperations(root),
    [],
    'a comment mentioning an operation must not fail the gate',
  );
});

test('a stray .js file cannot hide a gated import from the scan', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'src', 'domain'), { recursive: true });
  await writeFile(
    join(root, 'src', 'domain', 'leftover.js'),
    "import fs from 'node:fs';\nexport const x = fs;\n",
  );

  assert.deepEqual(
    (await findImportViolations(root)).map((v) => v.file),
    ['src/domain/leftover.js'],
  );
});

test('a planted child_process import outside the git and browser adapters is reported', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'src', 'adapters', 'http'), { recursive: true });
  await writeFile(
    join(root, 'src', 'adapters', 'http', 'server.ts'),
    "const { spawn } = require('child_process');\nexport default spawn;\n",
  );
  for (const permitted of ['git', 'browser']) {
    await mkdir(join(root, 'src', 'adapters', permitted), { recursive: true });
    await writeFile(
      join(root, 'src', 'adapters', permitted, 'run.ts'),
      "import { execFile } from 'node:child_process';\nexport { execFile };\n",
    );
  }

  assert.deepEqual(
    (await findImportViolations(root)).map((v) => v.file),
    ['src/adapters/http/server.ts'],
  );
});

test('dynamic import and bare specifiers are caught too', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'src', 'render'), { recursive: true });
  await writeFile(
    join(root, 'src', 'render', 'lazy.ts'),
    "export const load = () => import('node:fs/promises');\n",
  );
  await mkdir(join(root, 'src', 'ports'), { recursive: true });
  await writeFile(join(root, 'src', 'ports', 'legacy.ts'), "import 'fs';\n");

  assert.deepEqual(
    (await findImportViolations(root)).map((v) => v.file).sort(),
    ['src/ports/legacy.ts', 'src/render/lazy.ts'],
  );
});

test('each unanalysable indirection is flagged rather than passing silently', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'bmad-dash-arch-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  await mkdir(join(root, 'src', 'domain'), { recursive: true });
  await writeFile(
    join(root, 'src', 'domain', 'builtin.ts'),
    'export const fs = process.getBuiltinModule("node:fs");\n',
  );
  await writeFile(
    join(root, 'src', 'domain', 'required.ts'),
    "import { createRequire } from 'node:module';\nexport const req = createRequire(import.meta.url);\n",
  );
  await writeFile(
    join(root, 'src', 'domain', 'computed.ts'),
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
