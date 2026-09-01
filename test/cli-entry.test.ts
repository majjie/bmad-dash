/**
 * The entry point, invoked the way it is actually distributed.
 *
 * `npx bmad-dash` and a global install both run `bin` through a symlink in a
 * `node_modules/.bin` directory, and the entry guard has now been wrong twice:
 *
 *   1. Comparing `import.meta.url` to a raw `process.argv[1]` is false under a
 *      symlink, because `argv[1]` is the link and `import.meta.url` is the
 *      realpath.
 *   2. Resolving only `argv[1]` is false under `--preserve-symlinks-main`,
 *      where `import.meta.url` is itself the symlink path — the same defect
 *      with the sides swapped.
 *
 * Both fail the same way: exit 0, having printed nothing and served nothing.
 * The direct invocation `node dist/cli/index.js` is the one path that masks
 * both, so this file tests only the linked forms, under both flag settings.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  symlink,
  rm,
  access,
  copyFile,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Manifest {
  readonly bin?: Record<string, string>;
  readonly files?: readonly string[];
  readonly dependencies?: Record<string, string>;
  readonly scripts?: Record<string, string>;
}

const MANIFEST = JSON.parse(
  await readFile(join(REPO_ROOT, 'package.json'), 'utf8'),
) as Manifest;

/**
 * The `bin` path as published, taken from the manifest rather than hardcoded.
 *
 * Hardcoding `dist/cli/index.js` here meant the packaging contract was asserted
 * by nothing: pointing `bin` at a path esbuild never writes, or dropping the
 * directory from `files`, left all 63 tests green while the published package
 * exposed a command pointing at nothing. That is the original silent-exit
 * defect reached through packaging instead of through the entry guard. Deriving
 * it means every symlink test below inherits the check.
 */
const BIN_RELATIVE = MANIFEST.bin?.['bmad-dash'];
if (BIN_RELATIVE === undefined) {
  throw new Error('package.json declares no bin entry for bmad-dash');
}
const BUILT_ENTRY = join(REPO_ROOT, BIN_RELATIVE);

/**
 * Run the built entry point with arguments and collect what it printed.
 *
 * For the flags that answer and leave — `--version`, `--help` — so no server is
 * ever bound and the child always exits on its own.
 */
function runBuilt(args: readonly string[]): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((settle, fail) => {
    const child = spawn(process.execPath, [BUILT_ENTRY, '--no-open', ...args], { cwd: REPO_ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', fail);
    child.on('close', (code) => settle({ code, stdout, stderr }));
  });
}

const URL_PATTERN = /^http:\/\/127\.0\.0\.1:(\d+)\/$/;
const TIMEOUT_MS = 15_000;

/**
 * Node flags that change how the main module's identity is reported. Each must
 * leave behaviour identical; historically each has broken a one-sided guard.
 */
const SYMLINK_FLAG_SETS: readonly (readonly string[])[] = [
  [],
  ['--preserve-symlinks-main'],
  ['--preserve-symlinks'],
  ['--preserve-symlinks', '--preserve-symlinks-main'],
];

interface Served {
  readonly url: string;
  readonly status: number;
}

/**
 * Run `entry` with `node`, wait for the URL it prints, fetch it, then stop.
 * Rejects with a diagnostic — never hangs — if no URL arrives.
 */
function serveVia(entry: string, cwd: string, flags: readonly string[] = []): Promise<Served> {
  return new Promise<Served>((resolve, reject) => {
    const child = spawn(process.execPath, [...flags, entry, '--no-open'], { cwd });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (outcome: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      outcome();
    };

    const describe = (): string =>
      `${[...flags, entry].join(' ')} | stdout: ${JSON.stringify(stdout)} stderr: ${JSON.stringify(stderr)}`;

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`no URL within ${TIMEOUT_MS}ms via ${describe()}`)));
    }, TIMEOUT_MS);
    timer.unref();

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c: string) => {
      stderr += c;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      const newline = stdout.indexOf('\n');
      if (settled || newline === -1) return;
      const url = stdout.slice(0, newline);
      const port = URL_PATTERN.exec(url)?.[1];
      if (port === undefined) {
        finish(() => reject(new Error(`unexpected stdout via ${describe()}`)));
        return;
      }
      void statusOf(Number(port)).then(
        (status) => finish(() => resolve({ url, status })),
        (error: unknown) => finish(() => reject(error)),
      );
    });

    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', () => {
      // The defect exactly: the process exits 0 having printed nothing.
      finish(() =>
        reject(
          new Error(
            `entry exited without printing a URL — the entry point is dead via ${describe()}`,
          ),
        ),
      );
    });
  });
}

function statusOf(port: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: '/', method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the built entry point exists at the path bin advertises', async () => {
  // Derived from `bin`, so this fails if `bin` names a path nothing produces.
  await access(BUILT_ENTRY);
});

test('the files whitelist publishes the directory holding the bin', () => {
  const files = MANIFEST.files;
  assert.ok(Array.isArray(files) && files.length > 0, 'no explicit files whitelist');

  const binDir = posix.dirname(BIN_RELATIVE.split('\\').join('/')).split('/')[0];
  assert.ok(
    files.some((entry) => entry === binDir || entry === BIN_RELATIVE),
    `files ${JSON.stringify(files)} does not publish ${String(binDir)}, which holds the bin ` +
      `${BIN_RELATIVE} — the installed package would expose a command pointing at nothing`,
  );

  // Every whitelisted entry must be something that actually exists, so a stale
  // entry cannot sit in the manifest looking like a shipped directory.
  for (const entry of files) {
    assert.ok(
      typeof entry === 'string' && entry.length > 0,
      `files contains a non-path entry: ${JSON.stringify(entry)}`,
    );
  }
});

test('the build writes exactly the path bin advertises', () => {
  // The other half of the contract: `bin` and the build output must agree.
  const build = MANIFEST.scripts?.build;
  assert.ok(typeof build === 'string', 'no build script');
  assert.ok(
    build.includes(`--outfile=${BIN_RELATIVE}`),
    `the build script does not write ${BIN_RELATIVE}; bin and the build have diverged: ${build}`,
  );
});

test('production dependencies are empty', () => {
  // Zero runtime dependencies is an architectural constraint, not an accident
  // of nobody having added one. A dependency that writes would be bundled into
  // the shipped output, where the read-only gate does not look.
  const dependencies = MANIFEST.dependencies ?? {};
  assert.deepEqual(
    Object.keys(dependencies),
    [],
    `runtime dependencies must stay empty, found ${JSON.stringify(dependencies)}`,
  );
});

for (const flags of SYMLINK_FLAG_SETS) {
  const label = flags.length === 0 ? 'no flags' : flags.join(' ');

  test(`through a symlink with ${label}, the CLI prints a URL and serves`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'bmad-dash-link-'));
    t.after(() => rm(dir, { recursive: true, force: true }));

    const link = join(dir, 'bmad-dash');
    await symlink(BUILT_ENTRY, link);

    const served = await serveVia(link, dir, flags);
    assert.match(served.url, URL_PATTERN);
    assert.equal(served.status, 200);
  });

  test(`through a node_modules/.bin symlink with ${label}, the CLI serves`, async (t) => {
    // The layout `npx` and a global install actually create.
    const consumer = await mkdtemp(join(tmpdir(), 'bmad-dash-consumer-'));
    t.after(() => rm(consumer, { recursive: true, force: true }));

    const binDir = join(consumer, 'node_modules', '.bin');
    await mkdir(binDir, { recursive: true });
    const link = join(binDir, 'bmad-dash');
    await symlink(BUILT_ENTRY, link);

    const served = await serveVia(link, consumer, flags);
    assert.equal(served.status, 200);
  });
}

test('through a symlink to a symlink, the CLI still serves', async (t) => {
  // npm links can chain; realpath resolution must follow the whole chain.
  const dir = await mkdtemp(join(tmpdir(), 'bmad-dash-chain-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const first = join(dir, 'first');
  const second = join(dir, 'second');
  await symlink(BUILT_ENTRY, first);
  await symlink(first, second);

  assert.equal((await serveVia(second, dir)).status, 200);
});

test('invoked as a copy at an unrelated path, the CLI still serves', async (t) => {
  // Not a symlink at all: proves the guard recognises the module by its own
  // realpath rather than by anything about the original location.
  const dir = await mkdtemp(join(tmpdir(), 'bmad-dash-copy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const copy = join(dir, 'bmad-dash.js');
  await copyFile(BUILT_ENTRY, copy);

  assert.equal((await serveVia(copy, dir)).status, 200);
});

test('the built artifact reports the version package.json declares', async () => {
  // The seam this closes: the version is inlined by an esbuild `--define`, so
  // `package.json` and `dist/` are two places one number lives. Neither a JSON
  // import nor a build-time file read was available — the former makes esbuild
  // inline the whole of package.json into the bundle, shipping devDependencies
  // to consumers, and the latter needs `node:fs` in `scripts/`, which AD-1
  // forbids. So the duplication is deliberate and this is what guards it,
  // observed at the consuming end rather than by parsing the build command.
  const declared = (
    JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string }
  ).version;
  assert.match(declared, /^\d+\.\d+\.\d+/, 'package.json must declare a semantic version');

  const printed = await runBuilt(['--version']);
  assert.equal(printed.code, 0, '--version should exit 0');
  assert.equal(
    printed.stdout,
    `${declared}\n`,
    'the built CLI reports a different version than package.json declares',
  );
});

test('src/version.json and package.json declare the same version', async () => {
  // The duplication this guards. `src/version.json` exists because importing
  // package.json makes esbuild inline the whole file into dist, and a `--define`
  // could not carry a quoted string through both sh and cmd.exe. One key in one
  // file is the smallest honest form of that, and this is what keeps the two in
  // step — with `prepublishOnly: npm test` ensuring it runs before a publish.
  const declared = (
    JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string }
  ).version;
  const shipped = (
    JSON.parse(await readFile(join(REPO_ROOT, 'src', 'version.json'), 'utf8')) as { version: string }
  ).version;
  assert.equal(shipped, declared, 'src/version.json has drifted from package.json');
});

test('src/version.json carries the version and nothing else', async () => {
  // Its whole reason for existing is that it is not package.json. A second key
  // would start it down the road of becoming one, and esbuild inlines all of it.
  const raw = JSON.parse(await readFile(join(REPO_ROOT, 'src', 'version.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  assert.deepEqual(Object.keys(raw), ['version']);
});

test('the published bundle carries no build metadata', async () => {
  // The failure that ruled out importing package.json directly: esbuild inlines
  // the whole file, so dist would have shipped devDependencies and script
  // commands to every consumer.
  const bundle = await readFile(join(REPO_ROOT, BIN_RELATIVE), 'utf8');
  for (const leaked of ['devDependencies', 'esbuild', 'prepublishOnly', 'typescript']) {
    assert.ok(!bundle.includes(leaked), `the bundle leaks ${leaked} from package.json`);
  }
});

test('a real invocation actually reaches a platform launcher with the announced URL', async (t) => {
  // The wiring seam. `RunDependencies.launch` being required catches *omission*
  // at compile time, but substituting `openBrowser` for anything inert is
  // invisible to the type system — and replacing it with a no-op passed the
  // whole suite. Every other test either injects its own launcher or passes
  // `--no-open`, so nothing observed which function the entry point wires.
  //
  // No real tab is opened: the platform launcher is shadowed on PATH by a
  // recorder, which is the same trick used to audit the suite's own hygiene.
  const shim = await mkdtemp(join(tmpdir(), 'bmad-dash-launcher-'));
  t.after(() => rm(shim, { recursive: true, force: true }));
  const log = join(shim, 'launched.txt');

  // Whichever launcher this platform reaches for; `rundll32` is not shimmable
  // this way, so Windows is covered by the adapter's unit tests alone.
  const launcher = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const recorder = join(shim, launcher);
  await writeFile(recorder, `#!/bin/sh\nprintf '%s\\n' "$@" >> ${JSON.stringify(log)}\n`, {
    mode: 0o755,
  });

  const child = spawn(process.execPath, [BUILT_ENTRY], {
    cwd: REPO_ROOT,
    env: { ...process.env, PATH: shim },
  });
  t.after(() => child.kill('SIGTERM'));

  const url = await new Promise<string>((settle, fail) => {
    let out = '';
    const timer = setTimeout(() => fail(new Error(`no URL within 10s; got ${JSON.stringify(out)}`)), 10_000);
    timer.unref();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      out += chunk;
      const line = out.split('\n')[0] ?? '';
      if (out.includes('\n')) {
        clearTimeout(timer);
        settle(line.trim());
      }
    });
    child.on('error', fail);
  });

  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/, `unexpected URL: ${url}`);

  // Give the launch its moment; it happens strictly after the announcement.
  let recorded = '';
  for (let attempt = 0; attempt < 40 && !recorded.includes(url); attempt += 1) {
    await new Promise((r) => setTimeout(r, 50));
    recorded = await readFile(log, 'utf8').catch(() => '');
  }

  assert.ok(
    recorded.includes(url),
    `the launcher was never invoked with the announced URL. recorded: ${JSON.stringify(recorded)}`,
  );
  // And behind the end-of-options separator, so a URL cannot become an option.
  assert.ok(recorded.includes('--'), `no end-of-options separator in ${JSON.stringify(recorded)}`);
});
