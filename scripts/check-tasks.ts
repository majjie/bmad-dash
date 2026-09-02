/**
 * Check a spec's ticked tasks against the diff that is supposed to contain them.
 *
 * A task line names a file in backticks. If the task is ticked, that file must
 * appear in the diff since the spec's `baseline_commit` — otherwise the tick is
 * a claim about work that was not done.
 *
 * This exists because judgement failed at exactly this step. Story 1.5 ticked
 * `src/adapters/http/server.ts` and `test/architecture.test.ts` while neither
 * file was touched; the hand-written verification that was meant to catch it
 * grepped a different file for an adjacent-looking string. A grep chosen after
 * the fact tends to confirm what its author already believes, so this compares
 * the two lists mechanically instead.
 *
 * Deliberately not a test: it is about workflow state rather than about the
 * code, and it must be runnable mid-story before the tasks are ticked.
 *
 * It reads the spec from **stdin** rather than opening it, which is not a
 * stylistic choice — AD-1 confines `node:fs` to `src/adapters/fs/`, and the
 * gate scans `scripts/`. The first version imported `readFileSync` here and the
 * gate refused it, correctly. Taking the text on stdin makes this a filter over
 * what the caller supplies, which needs no filesystem access of its own and
 * leaves the architecture rule where it is instead of widening it for tooling.
 *
 * Usage: node scripts/check-tasks.ts < path/to/spec.md
 *
 * Runnable from any directory inside the repository: the git commands are run
 * from the root so that the two lists it compares are in one path space.
 */

import { execFileSync } from 'node:child_process';

/**
 * Run a git command, or stop with a report rather than a stack trace.
 *
 * **Exit 2, never 1.** Exit 1 means "a ticked task is unbacked", which is a
 * finding about the story; a rebased baseline, a missing `git`, or a spec piped
 * in from outside a repository is a broken *check*, and a caller branching on
 * the code has to be able to tell those apart. Unguarded, both arrived as an
 * uncaught exception — a stack trace and exit 1, indistinguishable from a
 * caught lie.
 */
function git(args: readonly string[], cwd?: string): string {
  try {
    return execFileSync('git', [...args], {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error: unknown) {
    const reported = (error as { stderr?: string }).stderr;
    const detail =
      typeof reported === 'string' && reported.trim() !== ''
        ? reported.trim()
        : error instanceof Error
          ? error.message
          : String(error);
    process.stderr.write(`Could not run \`git ${args.join(' ')}\`: ${detail}\n`);
    process.exit(2);
  }
}

async function readStdin(): Promise<string> {
  const chunks: string[] = [];
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) chunks.push(chunk as string);
  return chunks.join('');
}

const spec = await readStdin();
if (spec.trim() === '') {
  process.stderr.write('Usage: node scripts/check-tasks.ts < path/to/spec.md\n');
  process.exit(2);
}

/**
 * The baseline, in any of the three ways YAML spells a scalar.
 *
 * This accepted single quotes only, so `baseline_commit: cef8da8` — valid YAML,
 * and the form a human writing frontmatter by hand reaches for first — produced
 * "No baseline_commit ... nothing to check against" and exit 2. A guard that
 * refuses to read half the legal spellings of its own input is a guard that
 * gets skipped, which is the failure mode this whole file is about.
 */
const baselineMatch =
  /^baseline_commit:[ \t]*(?:'([^']+)'|"([^"]+)"|([^\s'"#]+))[ \t]*(?:#.*)?$/m.exec(spec);
const baseline = baselineMatch?.[1] ?? baselineMatch?.[2] ?? baselineMatch?.[3];
if (baseline === undefined) {
  process.stderr.write('No baseline_commit in the spec on stdin; nothing to check against.\n');
  process.exit(2);
}

const repoRoot = git(['rev-parse', '--show-toplevel']).trim();

// Named specifically, because this is the failure a rebase or an amend
// produces and "could not run git diff" sends the reader to look at git.
try {
  execFileSync('git', ['rev-parse', '--verify', '--quiet', `${baseline}^{commit}`], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
} catch {
  process.stderr.write(
    `baseline_commit ${baseline} is not a commit in ${repoRoot}. ` +
      'Rebased or amended since the spec was written? Update it before checking.\n',
  );
  process.exit(2);
}

/**
 * Files the diff since the baseline actually touches, tracked and untracked.
 *
 * Two lists from two commands, and the only thing that matters is that they
 * come back in **one path space** — because the comparison downstream is byte
 * equality against what a spec wrote down. Three separate ways git will hand
 * back the same file under two different names, each of which made this exit 1
 * on honest work:
 *
 *   - **Relative to what.** `git diff --name-only` prints repo-relative paths
 *     while `git ls-files --others` prints paths relative to the *current
 *     directory*, so run from `src/` one new file was `src/adapters/fs/read.ts`
 *     in one list and `read.ts` in the other. Fixed by running both from the
 *     root, and pinned a second time by `--full-name` and
 *     `-c diff.relative=false`, which hold whatever the cwd and whatever the
 *     repository configures.
 *   - **Spelled how.** With `core.quotePath` at its default, a non-ASCII path
 *     comes back C-quoted and octal-escaped: `"src/caf\303\251.ts"`, not
 *     `src/café.ts`. Measured on git 2.43.0, both commands do it. A ticked
 *     accented filename therefore reported MISS — the same false accusation as
 *     the cwd bug, in a different disguise.
 *   - **Separated by what.** A newline in a filename is legal, and split on
 *     newlines it becomes two entries that are each not a file.
 *
 * `-z` is what actually settles the last two: NUL-separated output is never
 * quoted and never ambiguous, so the per-line `trim()` this used to need is
 * gone with it. `-c core.quotePath=false` is kept as a second latch that says
 * the intent out loud even if `-z` is ever dropped — like the two cwd latches,
 * it is not independently observable end to end, so the argv test in
 * `test/tooling/check-tasks.test.ts` is what holds it in place.
 */
function changedFiles(since: string, root: string): Set<string> {
  const tracked = git(
    ['-c', 'diff.relative=false', '-c', 'core.quotePath=false', 'diff', '--name-only', '-z', since],
    root,
  );
  const untracked = git(
    ['-c', 'core.quotePath=false', 'ls-files', '--others', '--exclude-standard', '--full-name', '-z'],
    root,
  );
  // NUL-separated, with a trailing NUL, so the final split entry is empty.
  return new Set([...tracked.split('\0'), ...untracked.split('\0')].filter(Boolean));
}

/**
 * The file each ticked task names.
 *
 * Only the **first** backticked token on the line, and only when it looks like
 * a path: task lines mention other files in their rationale, and a task is
 * about the file it leads with.
 */
function tickedTargets(): readonly { readonly file: string; readonly line: string }[] {
  const found: { file: string; line: string }[] = [];
  for (const line of spec.split('\n')) {
    if (!line.startsWith('- [x] ')) continue;
    const first = /`([^`]+)`/.exec(line)?.[1];
    if (first === undefined) continue;
    if (!first.includes('/') && !first.includes('.')) continue;
    found.push({ file: first, line: line.slice(0, 96) });
  }
  return found;
}

const changed = changedFiles(baseline, repoRoot);
const targets = tickedTargets();

// A checker that finds nothing to check has become a no-op, which is how the
// last guard in this project degraded silently.
if (targets.length === 0) {
  process.stderr.write('No ticked tasks naming a file were found in the spec on stdin.\n');
  process.exit(2);
}

const unbacked = targets.filter((target) => !changed.has(target.file));

process.stdout.write(`baseline ${baseline.slice(0, 7)} — ${String(changed.size)} files changed\n`);
process.stdout.write(`${String(targets.length)} ticked tasks name a file\n`);

for (const target of targets) {
  const mark = changed.has(target.file) ? 'ok  ' : 'MISS';
  process.stdout.write(`  ${mark} ${target.file}\n`);
}

if (unbacked.length > 0) {
  process.stderr.write(`\n${String(unbacked.length)} ticked task(s) name a file the diff never touches:\n`);
  for (const target of unbacked) process.stderr.write(`  ${target.line}\n`);
  process.exit(1);
}

process.stdout.write('\nEvery ticked task names a file the diff touches.\n');
