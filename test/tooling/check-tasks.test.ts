/**
 * The task-ledger honesty guard, under test.
 *
 * `scripts/check-tasks.ts` exists because judgement failed at exactly this
 * step: a story ticked two files it never touched, and the hand-written
 * verification meant to catch that grepped a different file for an
 * adjacent-looking string. The guard replaced a judgement call with a
 * mechanical comparison — and then shipped with no test of its own, which is
 * the same shape of mistake one level up. A guard nobody checks is a guard that
 * can quietly become a no-op and keep reporting success.
 *
 * Two exit codes carry the whole contract and they must stay apart:
 *
 *   - **exit 1** — a ticked task names a file the diff never touches. A finding
 *     about the story.
 *   - **exit 2** — the check itself could not run: a rebased baseline, a
 *     missing `git`, a spec piped in from outside a repository, a spec with
 *     nothing to check. A finding about the *check*.
 *
 * Unguarded, every exit-2 case arrived as an uncaught exception — a stack trace
 * and exit 1, indistinguishable from a caught lie. So both codes are asserted
 * here, in one file, by separately named tests: deleting the baseline check in
 * the script fails a different test than deleting the unbacked-tick check.
 *
 * The checker is driven as a **spawned child process** against throwaway
 * repositories under `os.tmpdir()`. It is not importable: it reads stdin at
 * module scope and calls `process.exit`. `test/` is deliberately outside the
 * AD-1 gate's scanned roots, so `node:fs` and `node:child_process` are free
 * here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  writeFile,
  appendFile,
  chmod,
  readFile,
  rm,
  realpath,
} from 'node:fs/promises';
import { tmpdir, devNull } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const CHECKER = join(REPO_ROOT, 'scripts', 'check-tasks.ts');

/** Long enough to be a real hang, short enough to fail the run rather than wedge it. */
const TIMEOUT_MS = 20_000;

/** A 40-hex sha that is not, and cannot become, a commit in a fresh fixture. */
const ABSENT_SHA = `${'0'.repeat(39)}1`;

/**
 * Environment for every git invocation, the fixtures' and the checker's alike.
 *
 * The developer's own `~/.gitconfig` is not part of the contract, and one
 * setting in particular — `diff.relative=true` — is the very thing one row of
 * the matrix sets *deliberately*. Reading it from the ambient home directory
 * would make that row pass or fail for reasons outside the test.
 */
const GIT_ENV = {
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
} as const;

function childEnv(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...GIT_ENV, ...extra };
  // Inherited from this process, it makes a nested `node --test` skip its
  // files. The checker is not a test runner, but the child of a child might be.
  delete env.NODE_TEST_CONTEXT;
  // A stray GIT_DIR/GIT_WORK_TREE from the caller would point the checker at
  // this repository instead of the fixture.
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return env;
}

interface Ran {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run a fixture's git synchronously; failures should surface as test errors. */
function gitIn(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Pipe a spec into the checker and collect its verdict. */
function runChecker(
  spec: string,
  cwd: string,
  extraEnv: Readonly<Record<string, string>> = {},
): Promise<Ran> {
  return new Promise<Ran>((resolve, reject) => {
    const child = spawn(process.execPath, [CHECKER], { cwd, env: childEnv(extraEnv) });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`the checker did not exit within ${String(TIMEOUT_MS)}ms`));
    }, TIMEOUT_MS);
    watchdog.unref();

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(watchdog);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('close', (code, signal) => {
      clearTimeout(watchdog);
      if (settled) return;
      settled = true;
      resolve({ code, signal, stdout, stderr });
    });

    child.stdin.end(spec, 'utf8');
  });
}

/** A synthetic spec: the frontmatter line the checker reads, plus task lines. */
function specText(baseline: string, tasks: readonly string[]): string {
  return [
    '---',
    "title: 'A synthetic spec'",
    `baseline_commit: '${baseline}'`,
    '---',
    '',
    '## Tasks & Acceptance',
    '',
    ...tasks,
    '',
  ].join('\n');
}

interface Fixture {
  /** Canonical repository root — `mkdtemp` can hand back a symlink. */
  readonly root: string;
  /** The commit the synthetic spec is written against. */
  readonly baseline: string;
  /** A directory two levels down, for the cwd-independence rows. */
  readonly deep: string;
}

/**
 * A throwaway repository with one commit and a pending change of both kinds:
 * `nested/deep/tracked.ts` is modified, `nested/deep/untracked.ts` is new.
 *
 * Both kinds matter because the checker unions two different git commands to
 * find them, and those commands disagreed about what a path is relative to.
 */
async function fixture(t: { after: (fn: () => unknown) => void }): Promise<Fixture> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'bmad-dash-tasks-')));
  t.after(() => rm(root, { recursive: true, force: true }));

  const deep = join(root, 'nested', 'deep');
  await mkdir(deep, { recursive: true });
  await writeFile(join(deep, 'tracked.ts'), 'export const answer = 1;\n');

  gitIn(root, ['init', '--quiet', '-b', 'main']);
  gitIn(root, ['config', 'user.email', 'guard@example.invalid']);
  gitIn(root, ['config', 'user.name', 'Guard Fixture']);
  gitIn(root, ['add', '--all']);
  gitIn(root, ['commit', '--quiet', '-m', 'baseline']);
  const baseline = gitIn(root, ['rev-parse', 'HEAD']).trim();

  // The "pending work" the spec is going to make claims about.
  await appendFile(join(deep, 'tracked.ts'), 'export const changed = 2;\n');
  await writeFile(join(deep, 'untracked.ts'), 'export const fresh = 3;\n');

  return { root, baseline, deep };
}

// ---------------------------------------------------------------------------
// Exit 0 — the tick is backed by the diff
// ---------------------------------------------------------------------------

test('a ticked task naming a modified tracked file passes, run from the root', async (t) => {
  const { root, baseline } = await fixture(t);

  const ran = await runChecker(
    specText(baseline, [
      '- [x] `nested/deep/tracked.ts` -- the change this spec is about',
      // Only the *first* backticked token is the target: a task line names
      // other files in its rationale and must not be judged on them.
      '- [x] `nested/deep/tracked.ts` -- unlike `nested/deep/never-touched.ts`',
      // Unticked, and naming a file the diff never touches: not a claim yet.
      '- [ ] `nested/deep/planned.ts` -- not done, so not a lie',
    ]),
    root,
  );

  assert.equal(ran.code, 0, `expected exit 0, got ${String(ran.code)}. stderr: ${ran.stderr}`);
  assert.match(ran.stdout, /ok {3}nested\/deep\/tracked\.ts/);
  assert.doesNotMatch(ran.stdout, /MISS/);
  assert.doesNotMatch(ran.stdout, /planned\.ts/, 'an unticked task is not checked');
  assert.equal(ran.stdout.match(/^ {2}(?:ok|MISS) +\S+$/gm)?.length, 2, 'two ticked tasks reported');
  assert.match(ran.stdout, /Every ticked task names a file the diff touches\./);
});

test('a ticked task naming an untracked file passes from a subdirectory', async (t) => {
  const { root, baseline, deep } = await fixture(t);

  // The regression this file's subject was fixed for. `git ls-files --others`
  // reports paths relative to the *current directory* while `git diff
  // --name-only` reports them relative to the repository root, so run from
  // `nested/deep/` the new file appeared as `nested/deep/untracked.ts` in one
  // list and `untracked.ts` in the other. Every untracked file a spec named
  // then reported MISS and the checker exited 1 on honest work — which is how
  // a guard gets routed around and switched off.
  const spec = specText(baseline, ['- [x] `nested/deep/untracked.ts` -- a brand-new file']);

  const fromRoot = await runChecker(spec, root);
  const fromDeep = await runChecker(spec, deep);

  assert.equal(fromDeep.code, 0, `expected exit 0 from a subdirectory. stderr: ${fromDeep.stderr}`);
  assert.match(fromDeep.stdout, /ok {3}nested\/deep\/untracked\.ts/);
  assert.doesNotMatch(fromDeep.stdout, /MISS/);
  assert.equal(fromDeep.stdout, fromRoot.stdout, 'the verdict must not depend on the cwd');
});

test('a repository configuring diff.relative=true is overridden, not obeyed', async (t) => {
  const { root, baseline, deep } = await fixture(t);
  gitIn(root, ['config', 'diff.relative', 'true']);

  // `diff.relative=true` makes `git diff` print paths relative to the cwd and
  // drop everything outside it. The checker pins `-c diff.relative=false` so a
  // repository that configures the opposite cannot change the path space the
  // two lists are compared in.
  const spec = specText(baseline, [
    '- [x] `nested/deep/tracked.ts` -- tracked, so it comes from `git diff`',
  ]);

  for (const cwd of [root, deep]) {
    const ran = await runChecker(spec, cwd);
    assert.equal(ran.code, 0, `expected exit 0 in ${cwd}. stderr: ${ran.stderr}`);
    assert.match(ran.stdout, /ok {3}nested\/deep\/tracked\.ts/);
    assert.doesNotMatch(ran.stdout, /MISS/);
  }
});

// ---------------------------------------------------------------------------
// Exit 1 — the finding. A ticked task the diff does not back.
// ---------------------------------------------------------------------------

test('a ticked task naming a file the diff never touches is a finding, exit 1', async (t) => {
  const { root, baseline, deep } = await fixture(t);

  const spec = specText(baseline, [
    '- [x] `nested/deep/tracked.ts` -- honest',
    '- [x] `src/adapters/http/server.ts` -- the exact lie this guard was built for',
  ]);

  for (const cwd of [root, deep]) {
    const ran = await runChecker(spec, cwd);
    // Exit 1 is the *finding*, and it must never be confused with exit 2.
    assert.equal(ran.code, 1, `expected exit 1 in ${cwd}. stderr: ${ran.stderr}`);
    assert.match(ran.stdout, /MISS src\/adapters\/http\/server\.ts/);
    assert.match(ran.stdout, /ok {3}nested\/deep\/tracked\.ts/);
    assert.match(ran.stderr, /1 ticked task\(s\) name a file the diff never touches/);
    // The report has to name the line, or the reader cannot find the tick.
    assert.match(ran.stderr, /the exact lie this guard was built for/);
  }
});

// ---------------------------------------------------------------------------
// Exit 2 — the check is broken, which is a different thing from a lie
// ---------------------------------------------------------------------------

test('a baseline that is not a commit is a broken check, exit 2, naming the rebase', async (t) => {
  const { root } = await fixture(t);

  // What a rebase or an amend leaves behind. Reported as exit 1 it would read
  // as "the story lied"; reported as a stack trace it would send the reader to
  // look at git. Neither is true, and neither is actionable.
  const ran = await runChecker(
    specText(ABSENT_SHA, ['- [x] `nested/deep/tracked.ts` -- honest, but uncheckable']),
    root,
  );

  assert.equal(ran.code, 2, `expected exit 2, got ${String(ran.code)}. stderr: ${ran.stderr}`);
  assert.ok(ran.stderr.includes(ABSENT_SHA), `the sha must be named: ${ran.stderr}`);
  assert.ok(ran.stderr.includes(root), `the repository root must be named: ${ran.stderr}`);
  assert.match(ran.stderr, /[Rr]ebased or amended/);
  assert.doesNotMatch(ran.stderr, /\n\s+at /, 'a report, not a stack trace');
  assert.doesNotMatch(ran.stdout, /MISS/, 'nothing was checked, so nothing may be reported');
});

test('a spec piped in from outside a repository is a broken check, exit 2', async (t) => {
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'bmad-dash-notrepo-')));
  t.after(() => rm(outside, { recursive: true, force: true }));

  // Guard the fixture itself: if the temp directory were inside a repository
  // this test would be measuring nothing.
  assert.throws(
    () => gitIn(outside, ['rev-parse', '--show-toplevel']),
    'the fixture directory must not be inside a git repository',
  );

  const ran = await runChecker(
    specText(ABSENT_SHA, ['- [x] `nested/deep/tracked.ts` -- unreachable']),
    outside,
  );

  assert.equal(ran.code, 2, `expected exit 2, got ${String(ran.code)}. stderr: ${ran.stderr}`);
  assert.match(ran.stderr, /Could not run `git rev-parse --show-toplevel`/);
  assert.doesNotMatch(ran.stderr, /\n\s+at /, 'a report, not an uncaught exception');
});

test('a missing git is a broken check, exit 2, and not an unbacked tick', async (t) => {
  if (process.platform === 'win32') {
    t.skip('the empty-PATH trick is POSIX-only');
    return;
  }
  const { root, baseline } = await fixture(t);

  // With nothing on PATH the very first git call throws ENOENT. Unguarded that
  // was an uncaught exception and exit 1 — the code that means "the story
  // lied" — on a box that simply has no git.
  const ran = await runChecker(
    specText(baseline, ['- [x] `nested/deep/tracked.ts` -- honest']),
    root,
    { PATH: join(root, 'no-such-bin') },
  );

  assert.equal(ran.code, 2, `expected exit 2, got ${String(ran.code)}. stderr: ${ran.stderr}`);
  assert.match(ran.stderr, /Could not run `git /);
  assert.doesNotMatch(ran.stderr, /\n\s+at /, 'a report, not an uncaught exception');
});

test('a spec whose ticks name no file at all is a broken check, exit 2', async (t) => {
  const { root, baseline } = await fixture(t);

  // A checker with nothing to check has become a no-op reporting success,
  // which is precisely how the guard this one replaced degraded.
  const ran = await runChecker(
    specText(baseline, [
      '- [x] Tidy the wording of the intent section',
      // Backticked, but not path-shaped: no `/` and no `.`.
      '- [x] Rename `changedFiles` for clarity',
      '- [ ] `nested/deep/tracked.ts` -- unticked, so it is not a claim',
    ]),
    root,
  );

  assert.equal(ran.code, 2, `expected exit 2, got ${String(ran.code)}. stderr: ${ran.stderr}`);
  assert.match(ran.stderr, /No ticked tasks naming a file/);
});

test('an empty stdin and a spec with no baseline are both broken checks, exit 2', async (t) => {
  const { root } = await fixture(t);

  // Both are misuse rather than a finding, and both used to be indistinguishable
  // from one.
  const empty = await runChecker('   \n\n', root);
  assert.equal(empty.code, 2, `expected exit 2, got ${String(empty.code)}`);
  assert.match(empty.stderr, /Usage: node scripts\/check-tasks\.ts/);

  const noBaseline = await runChecker(
    '---\ntitle: \'No baseline\'\n---\n\n- [x] `nested/deep/tracked.ts` -- honest\n',
    root,
  );
  assert.equal(noBaseline.code, 2, `expected exit 2, got ${String(noBaseline.code)}`);
  assert.match(noBaseline.stderr, /No baseline_commit in the spec on stdin/);
});

// ---------------------------------------------------------------------------
// The commands themselves, pinned
// ---------------------------------------------------------------------------

test('both list commands are pinned repo-relative in the argv the checker issues', async (t) => {
  if (process.platform === 'win32') {
    t.skip('the shell shim on PATH is POSIX-only');
    return;
  }
  const { root, baseline, deep } = await fixture(t);

  // Why observe the argv rather than only the verdict: the checker also runs
  // both commands *with cwd set to the repository root*, which by itself makes
  // the paths repo-relative. So `--full-name` and `-c diff.relative=false` are
  // a second, independent latch — and an end-to-end run cannot tell whether
  // one of the two latches has been removed. Losing the flags leaves the
  // guard's correctness resting on a single line elsewhere in the file, which
  // is exactly the kind of silent narrowing this suite exists to catch.
  const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  assert.ok(realGit !== '', 'git must be on PATH for this test to mean anything');

  const shimDir = await realpath(await mkdtemp(join(tmpdir(), 'bmad-dash-gitshim-')));
  t.after(() => rm(shimDir, { recursive: true, force: true }));
  const log = join(shimDir, 'argv.log');
  const shim = join(shimDir, 'git');
  await writeFile(
    shim,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(log)}\nexec ${JSON.stringify(realGit)} "$@"\n`,
  );
  await chmod(shim, 0o755);

  const ran = await runChecker(
    specText(baseline, [
      '- [x] `nested/deep/tracked.ts` -- tracked',
      '- [x] `nested/deep/untracked.ts` -- untracked',
    ]),
    // From a subdirectory: the cwd is where the two path spaces used to split.
    deep,
    { PATH: `${shimDir}:${process.env.PATH ?? ''}` },
  );

  assert.equal(ran.code, 0, `expected exit 0, got ${String(ran.code)}. stderr: ${ran.stderr}`);

  const issued = (await readFile(log, 'utf8')).split('\n').filter(Boolean);

  assert.ok(
    issued.some((line) => /^-c diff\.relative=false diff --name-only \S+$/.test(line)),
    `the diff must override diff.relative; issued:\n${issued.join('\n')}`,
  );
  assert.ok(
    issued.some((line) => /^ls-files --others --exclude-standard --full-name$/.test(line)),
    `ls-files must be pinned with --full-name; issued:\n${issued.join('\n')}`,
  );
});
