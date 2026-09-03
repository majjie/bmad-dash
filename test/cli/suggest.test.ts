/**
 * The invocation that would have worked, and the bounds it stays inside.
 *
 * FR-7's promise is a *command*, not a diagnosis, so most of these assert on
 * the exact text a reader could paste — including that it is spelled the way
 * the tool was actually invoked and quoted so a shell hands the path back
 * unchanged. Two rounds of review turned the rest into a list of things the
 * scan must not be:
 *
 *   - it runs for one refusal only — a typo, a file, a permissions problem and
 *     a marker that leaves its own tree are none of them answered by "try
 *     running it over there";
 *   - it is bounded in depth, in breadth, in total work and in output volume,
 *     and it says so whenever any of those bit or a directory was skipped;
 *   - it never leaves the target's subtree on the way down, though it names
 *     every ancestor on the way up;
 *   - it never becomes a resolution path, which `test/architecture.test.ts`
 *     asserts at the wiring seam from both directions.
 *
 * Everything runs against real directories. The scan is entirely a question
 * about a filesystem — ancestors, symlinks, permissions, width — and a fake
 * filesystem would be asserting that the fake behaves as expected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, symlink, chmod, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveLocation } from '../../src/cli/location.ts';
import {
  CANDIDATES_ELIDED,
  COMMAND,
  MANY_CANDIDATES,
  MAX_CHILDREN,
  MAX_DEPTH_BELOW,
  MAX_PROBES,
  MAX_SUGGESTIONS,
  NO_CANDIDATE,
  ONE_CANDIDATE,
  SCAN_INCOMPLETE,
  commandSpelling,
  shellQuote,
  suggestInvocations,
} from '../../src/cli/suggest.ts';
import { makeProjectAt, makeScratchDir } from '../support/project.ts';
import { observeRun } from '../support/cli.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPERIENCE_PATH = join(
  REPO_ROOT,
  '_bmad-output',
  'planning-artifacts',
  'ux-designs',
  'ux-bmad-2026-08-28',
  'EXPERIENCE.md',
);

async function scratch(t: { after: (fn: () => unknown) => void }): Promise<string> {
  return makeScratchDir(t, 'bmad-dash-suggest-');
}

/**
 * The appended lines as one block of text, the way stderr will carry them.
 *
 * The command spelling is forced to the bare name so these read as one thing
 * and not two: how the command is spelled is decided by `commandSpelling`, and
 * is pinned exhaustively in its own section below.
 */
function suggestions(target: string, options: { flags?: readonly string[]; budget?: number } = {}): string {
  return suggestInvocations(target, { ...options, command: COMMAND }).join('\n');
}

/** The exact line a reader is meant to be able to paste. */
function invocation(path: string, flags: readonly string[] = []): string {
  const tail = flags.length === 0 ? '' : ` ${flags.map((flag) => shellQuote(flag)).join(' ')}`;
  return `    ${COMMAND} ${shellQuote(path)}${tail}`;
}

/**
 * Every pasteable line in a block.
 *
 * Matched on the invocation *prefix* rather than by searching for the command
 * name anywhere: the fixtures live in temporary directories called
 * `bmad-dash-suggest-…`, so "does the text mention bmad-dash" is true of every
 * message that names a path and asserts nothing.
 */
function offered(text: string): string[] {
  return text.split('\n').filter((line) => line.startsWith('    '));
}

/** Many sibling directories at once, since the width tests need hundreds. */
async function makeChildren(base: string, names: readonly string[]): Promise<void> {
  await Promise.all(names.map((name) => mkdir(join(base, name), { recursive: true })));
}

const numbered = (count: number, prefix = 'd'): string[] =>
  Array.from({ length: count }, (_unused, i) => `${prefix}-${String(i).padStart(4, '0')}`);

// ---------------------------------------------------------------------------
// The strings come from EXPERIENCE.md, not from a second copy
// ---------------------------------------------------------------------------

test('every sentence the scan prints is the string index own wording', async () => {
  // The same contract `src/render/chrome.ts` holds `SIGNAL_NOT_CHECKED` under:
  // UX-DR17 requires the index's wording verbatim, and a literal in source
  // that merely happens to match is a second copy of one belief, free to
  // drift the moment either side is edited.
  const experience = await readFile(EXPERIENCE_PATH, 'utf8');
  const table = /\|\s*Situation\s*\|\s*Says\s*\|([\s\S]*?)\n\n/.exec(experience)?.[1];
  assert.ok(table !== undefined, 'EXPERIENCE.md must carry the load-bearing string index table');

  const rows: readonly (readonly [string, string])[] = [
    ['One BMAD project found near a non-project target', ONE_CANDIDATE],
    ['Several BMAD projects found near a non-project target', MANY_CANDIDATES],
    ["No BMAD project within the suggestion scan's bounds", NO_CANDIDATE],
    ['Suggestion scan stopped before it finished', SCAN_INCOMPLETE],
    ['More candidates found than the refusal prints', CANDIDATES_ELIDED],
  ];

  for (const [situation, held] of rows) {
    const pattern = new RegExp(
      `\\|\\s*${situation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*\`([^\`]+)\`\\s*\\|`,
    );
    const row = pattern.exec(table ?? '');
    assert.ok(row !== null, `the string index carries no "${situation}" row`);
    // actual first, expected second — a failure must report the two the right way round.
    assert.equal(row?.[1], held, `the scan states "${situation}" differently from the index`);
  }
});

test('the printed sentences follow the index conventions for their shape', () => {
  // Sentence-shaped strings take a terminal period; substituted values are
  // spelled `<placeholder>` rather than baked in as a literal. Both were broken
  // in the first round: a headline ending in "use" with no period, and a bare
  // `2` where the depth bound belongs.
  for (const sentence of [ONE_CANDIDATE, MANY_CANDIDATES, NO_CANDIDATE, SCAN_INCOMPLETE, CANDIDATES_ELIDED]) {
    assert.ok(sentence.endsWith('.'), `not a sentence-shaped string: ${JSON.stringify(sentence)}`);
    assert.doesNotMatch(sentence, /\d/, `a bare digit belongs in a placeholder: ${sentence}`);
  }
  assert.match(MANY_CANDIDATES, /<n>/);
  assert.match(NO_CANDIDATE, /<markers>[\s\S]*<path>[\s\S]*<n>/);
  assert.match(SCAN_INCOMPLETE, /<reasons>/);
  assert.match(CANDIDATES_ELIDED, /<n>/);
});

// ---------------------------------------------------------------------------
// How the command is spelled
// ---------------------------------------------------------------------------

test('an npx invocation is suggested as npx, by any of its three signals', () => {
  // FR-45 distributes this for `npx` execution "without prior installation",
  // so for the primary distribution mode a bare `bmad-dash …` is
  // `command not found` — the exact failure FR-7 exists to remove.
  const staged = commandSpelling({}, '/home/u/.npm/_npx/8a1c/node_modules/.bin/bmad-dash');
  assert.deepEqual(staged, { command: `npx ${COMMAND}`, how: 'npx' });

  assert.deepEqual(commandSpelling({ npm_command: 'exec' }, '/opt/x/dist/cli/index.js'), {
    command: `npx ${COMMAND}`,
    how: 'npx',
  });

  assert.deepEqual(
    commandSpelling({ npm_config_user_agent: 'npx/10.8.2 npm/10.8.2 node/v22.0.0' }, undefined),
    { command: `npx ${COMMAND}`, how: 'npx' },
  );
});

test('an installed invocation is suggested bare, since the name is on PATH', () => {
  for (const entry of [
    '/usr/local/bin/bmad-dash',
    '/proj/node_modules/.bin/bmad-dash',
    'C:\\Users\\u\\AppData\\npm\\bmad-dash.cmd',
    '/proj/node_modules/.bin/whatever-npm-called-it',
  ]) {
    assert.deepEqual(
      commandSpelling({}, entry),
      { command: COMMAND, how: 'installed' },
      `${entry} should read as an installed bin`,
    );
  }
});

test('an invocation it cannot classify falls back to the spelling that works either way', () => {
  // `node dist/cli/index.js`, and anything else. `npx bmad-dash` runs an
  // installed copy where there is one and fetches it where there is not; a bare
  // name guessed wrongly is `command not found`. So the fallback is not a
  // coin flip, and it is reported as its own branch rather than hidden inside
  // the npx one.
  for (const entry of ['/repo/dist/cli/index.js', '/repo/src/cli/index.ts', undefined]) {
    assert.deepEqual(commandSpelling({}, entry), { command: `npx ${COMMAND}`, how: 'unknown' });
  }
});

test('the npx staging directory beats the node_modules/.bin it sits inside', () => {
  // An npx-staged binary lives in a `.bin` too, so the order of these two
  // checks is load-bearing rather than incidental.
  const entry = '/home/u/.npm/_npx/8a1c/node_modules/.bin/bmad-dash';
  assert.equal(commandSpelling({}, entry).how, 'npx');
});

test('both spellings name what the package actually publishes', async () => {
  // A pasteable line naming a command that does not exist is worse than no
  // line at all, and the two facts live in different files.
  const manifest = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    bin?: Record<string, string>;
    name?: string;
  };
  assert.deepEqual(Object.keys(manifest.bin ?? {}), [COMMAND]);
  // `npx <name>` resolves the *package*, so the npx spelling is only correct
  // while the bin name and the package name agree.
  assert.equal(manifest.name, COMMAND, 'npx bmad-dash resolves the package, not the bin');
});

// ---------------------------------------------------------------------------
// Quoting: the suggestion has to survive a shell
// ---------------------------------------------------------------------------

test('a path with a space is quoted so it pastes as one argument', async (t) => {
  // Reproduced before it was fixed: the shell split `…/My Projects/proj` and
  // the tool then refused its own suggestion.
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, 'My Projects', 'proj'));

  const text = suggestions(base);
  assert.ok(text.includes(`'${project}'`), `the path was offered unquoted:\n${text}`);
  assert.deepEqual(offered(text), [invocation(project)]);
});

test('a path with a quote or a dollar sign is escaped, not merely wrapped', async (t) => {
  if (process.platform === 'win32') {
    t.skip('neither character is legal in a Windows path');
    return;
  }
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, "it's $HOME"));

  const text = suggestions(base);
  // POSIX single-quoting has exactly one escape, and it is this one.
  assert.ok(text.includes(`'\\''`), `the embedded quote was not escaped:\n${text}`);
  assert.ok(!text.includes('$HOME"'), 'a double quote would leave $HOME expandable');
  assert.deepEqual(offered(text), [invocation(project)]);
});

test('an ordinary path is not quoted, so the common case reads plainly', () => {
  assert.equal(shellQuote('/home/u/proj', 'linux'), '/home/u/proj');
  assert.equal(shellQuote('/home/u/my proj', 'linux'), "'/home/u/my proj'");
  assert.equal(shellQuote("/home/u/it's", 'linux'), `'/home/u/it'\\''s'`);
});

test('Windows takes double quotes, since cmd.exe has no single-quote form', () => {
  assert.equal(shellQuote('C:\\proj', 'win32'), 'C:\\proj');
  assert.equal(shellQuote('C:\\My Projects\\p', 'win32'), '"C:\\My Projects\\p"');
});

// ---------------------------------------------------------------------------
// Candidates found
// ---------------------------------------------------------------------------

test('one directory inside a project suggests the project above it', async (t) => {
  // The motivating case: `bmad-dash` run from inside `_bmad-output/`. AD-9 will
  // not resolve upward, and this is the whole of what replaces that.
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, 'proj'));
  const text = suggestions(join(project, '_bmad-output'));

  assert.equal(text.split('\n')[0], ONE_CANDIDATE);
  assert.deepEqual(offered(text), [invocation(project)]);
});

test('the whole ancestor chain is scanned, not just the parent', async (t) => {
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, 'proj'));
  await mkdir(join(project, 'a', 'b', 'c'), { recursive: true });

  const text = suggestions(join(project, 'a', 'b', 'c'));
  assert.deepEqual(offered(text), [invocation(project)]);
});

test('a folder of checkouts lists every candidate, not the first', async (t) => {
  // AD-9 refuses to resolve this by precedence precisely because picking one
  // would be a confident wrong answer. The message picks none and offers all.
  // Three rather than two: the plural wording had only ever been exercised at
  // exactly two, where "one of the 2" and a hardcoded pair are the same text.
  const base = await scratch(t);
  const projects = [];
  for (const name of ['one', 'three', 'two']) projects.push(await makeProjectAt(join(base, name)));

  const text = suggestions(base);
  assert.equal(text.split('\n')[0], '3 BMAD projects are nearby. Run one of these instead.');
  assert.deepEqual(offered(text), projects.map((p) => invocation(p)));
});

test('a project two levels below the target is found', async (t) => {
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, 'checkouts', 'proj'));
  assert.deepEqual(offered(suggestions(base)), [invocation(project)]);
});

test('a target whose own name looks like a placeholder still gets a suggestion', async (t) => {
  if (process.platform === 'win32') {
    t.skip('an angle bracket is not legal in a Windows path');
    return;
  }
  // The failure this pins is a guard denying the whole output. `NO_CANDIDATE`
  // interpolates the target path, so a directory called `<script>` put a string
  // matching the placeholder pattern *into* the filled sentence -- and the old
  // private filler checked for unfilled placeholders by re-scanning that
  // sentence, so it threw out of the scan instead of printing a command. The
  // person who most needs the suggestion is the one whose path is unusual.
  const base = await scratch(t);
  const odd = join(base, '<script>');
  await mkdir(odd, { recursive: true });

  const text = suggestions(odd);
  assert.ok(text.includes('<script>'), `the target path was not reported:\n${text}`);
  assert.ok(text.includes('No directory holding'), `the index sentence is missing:\n${text}`);
});

test('a project three levels below the target is out of bounds', async (t) => {
  // The depth bound, from the side that proves it is a bound. Without this the
  // "two levels" claim is satisfied by any walker that goes at least two deep.
  const base = await scratch(t);
  const deep = await makeProjectAt(join(base, 'a', 'b', 'proj'));

  const text = suggestions(base);
  assert.ok(!text.includes(deep), `the depth bound did not hold:\n${text}`);
  assert.deepEqual(offered(text), []);
});

test('a symlink may shortcut deeper into the target tree, and is offered as the real path', async (t) => {
  // Depth counts hops, so a link is a legitimate shortcut *within* the target —
  // bounded, and still the user's own tree. What it may not do is leave, which
  // the next test pins. Every path this tool prints is the real one, because
  // later stories key artifacts by it.
  const base = await scratch(t);
  const start = join(base, 'start');
  const project = await makeProjectAt(join(start, 'hidden', 'deep', 'proj'));
  await symlink(project, join(start, 'short'));

  const text = suggestions(start);
  assert.deepEqual(offered(text), [invocation(project)]);
  assert.ok(!text.includes('short'), `offered as the link instead:\n${text}`);
});

test('a symlink out of the target tree does not carry the scan with it', async (t) => {
  // Reported as a bounds escape: with depth counting hops, a child linked to
  // `/` or `$HOME` gets enumerated and can yield "candidates" nowhere near the
  // target. Containment on descent is the rule, and this is it failing to hold
  // if it is ever removed.
  const base = await scratch(t);
  const start = join(base, 'start');
  await mkdir(start, { recursive: true });
  const elsewhere = await makeProjectAt(join(base, 'outside', 'proj'));
  await symlink(join(base, 'outside'), join(start, 'escape'));

  const text = suggestions(start);
  assert.ok(!text.includes(elsewhere), `the scan left the target tree:\n${text}`);
  assert.deepEqual(offered(text), []);
});

// ---------------------------------------------------------------------------
// Exclusions, and the asymmetry between up and down
// ---------------------------------------------------------------------------

test('a project in a descendant node_modules or dot-directory is not offered', async (t) => {
  const base = await scratch(t);
  const visible = await makeProjectAt(join(base, 'visible'));
  const vendored = await makeProjectAt(join(base, 'node_modules', 'fixture-project'));
  const hidden = await makeProjectAt(join(base, '.cache', 'stashed-project'));
  // And one level down, so the rule is not merely applied to the target's own
  // children: the excluded name is the *middle* segment here.
  const nested = await makeProjectAt(join(base, 'wrapper', 'node_modules'));

  const text = suggestions(base);
  assert.deepEqual(offered(text), [invocation(visible)]);
  for (const excluded of [vendored, hidden, nested]) {
    assert.ok(!text.includes(excluded), `${excluded} must not be offered:\n${text}`);
  }
});

test('a project in an ancestor node_modules IS offered, which is the asymmetry', async (t) => {
  // User decision, and the reason the skip rule is descent-only: you are
  // standing inside this directory, so it is not somewhere the tool is sending
  // you speculatively. Hiding the project you are currently inside, on the
  // principle that vendored trees are uninteresting, answers nothing.
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, 'node_modules', 'proj'));

  const text = suggestions(join(project, '_bmad-output'));
  assert.deepEqual(offered(text), [invocation(project)]);
});

test('the marker directories are not descended into', async (t) => {
  // The target is not a project, so at most one marker is even there; walking
  // into BMAD's own toolchain looking for a *sibling* project is wasted work,
  // and a marker pair nested inside one would be offered as a candidate it has
  // no business being.
  const base = await scratch(t);
  await mkdir(join(base, '_bmad'), { recursive: true });
  const nested = await makeProjectAt(join(base, '_bmad', 'nested-project'));
  const normal = await makeProjectAt(join(base, 'normal'));

  const text = suggestions(base);
  assert.deepEqual(offered(text), [invocation(normal)], 'the marker subtree was walked');
  assert.ok(!text.includes(nested), `a marker subtree yielded a candidate:\n${text}`);
});

// ---------------------------------------------------------------------------
// Nothing found, and nothing invented
// ---------------------------------------------------------------------------

test('nothing in bounds states the path examined, the markers, and the absence', async (t) => {
  const base = await scratch(t);
  await mkdir(join(base, 'empty', 'also-empty'), { recursive: true });
  await writeFile(join(base, 'notes.md'), 'x\n');

  const text = suggestions(base);
  assert.equal(
    text,
    `No directory holding _bmad and _bmad-output is in the ancestors of ${base}, ` +
      `or within ${String(MAX_DEPTH_BELOW)} levels below it.`,
  );
  // No suggestion is invented, and nothing claims the scan was incomplete.
  assert.deepEqual(offered(text), []);
});

test('a half project is not a candidate', async (t) => {
  // The same test `resolveLocation` applies, reached through the scan: one
  // marker is an installed toolchain that has produced nothing, or output whose
  // toolchain is gone. Suggesting either would hand over a command the tool
  // then refuses.
  const base = await scratch(t);
  await mkdir(join(base, 'half', '_bmad'), { recursive: true });
  await mkdir(join(base, 'other', '_bmad-output'), { recursive: true });

  assert.deepEqual(offered(suggestions(base)), []);
});

test('a marker that is a file rather than a directory is not a candidate', async (t) => {
  const base = await scratch(t);
  const fake = join(base, 'fake');
  await mkdir(join(fake, '_bmad'), { recursive: true });
  await writeFile(join(fake, '_bmad-output'), 'not a directory\n');

  assert.deepEqual(offered(suggestions(base)), []);
});

test('a marker resolving out of its own tree is not a candidate, and does not throw', async (t) => {
  // Reproduced as a crash: `_bmad` as a symlink pointing outside the directory
  // holding it makes the confined reader refuse the path — correctly — by
  // throwing, which reached the user as a Node stack trace. Story 1.5 could
  // only hit it by pointing the tool straight at such a directory; the scan
  // probes every candidate in bounds, so it became routine.
  const base = await scratch(t);
  const weird = join(base, 'weird');
  await mkdir(join(weird, '_bmad-output'), { recursive: true });
  await mkdir(join(base, 'elsewhere'), { recursive: true });
  await symlink(join(base, 'elsewhere'), join(weird, '_bmad'));

  const text = suggestions(base);
  assert.deepEqual(offered(text), [], `an unusable marker was offered:\n${text}`);
  assert.ok(!text.includes('weird'), text);
});

// ---------------------------------------------------------------------------
// Bounds, and saying so when one bites
// ---------------------------------------------------------------------------

test('an unlistable directory is skipped, the rest reported, and the skip named', async (t) => {
  const base = await scratch(t);
  const good = await makeProjectAt(join(base, 'good'));
  const denied = join(base, 'denied');
  await makeProjectAt(join(denied, 'hidden-project'));
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('needs POSIX permissions and a non-root user');
    return;
  }

  await chmod(denied, 0o000);
  try {
    const text = suggestions(base);
    assert.deepEqual(offered(text), [invocation(good)], 'the readable candidate was lost');
    assert.ok(!text.includes('hidden-project'), `a denied tree was read anyway:\n${text}`);
    // And it is *named*, not silently dropped while the message claims the
    // scan covered everything. Breadth truncation was honest from the first
    // round and EACCES was not, though both mean the same thing to a reader.
    assert.match(text, /The scan did not finish/);
    assert.ok(text.includes(denied), `the skipped directory is not named:\n${text}`);
    assert.match(text, /1 could not be read/);
  } finally {
    await chmod(denied, 0o755);
  }
});

test('a realistic folder of checkouts is scanned completely', async (t) => {
  // What pins `MAX_CHILDREN` from below. The truncation test derives both its
  // expectation and its regex from the constant, so collapsing the cap to 3
  // left the whole suite green — the cap was pinned to nothing at all.
  const base = await scratch(t);
  await makeChildren(base, numbered(24));
  const projects = [];
  for (const name of ['d-0003', 'd-0011', 'd-0022']) {
    projects.push(await makeProjectAt(join(base, name)));
  }

  const text = suggestions(base);
  assert.deepEqual(offered(text), projects.map((p) => invocation(p)));
  assert.doesNotMatch(text, /did not finish/, `a 24-child directory truncated:\n${text}`);
});

test('the breadth cap is wide enough to be useful and narrow enough to be a cap', () => {
  // Stated as a range rather than a number so the value stays a decision: below
  // about twenty it silently drops candidates out of an ordinary checkouts
  // folder, and far above this the refusal costs more than the run it refuses.
  assert.ok(MAX_CHILDREN >= 24, `a cap of ${String(MAX_CHILDREN)} drops real candidates`);
  assert.ok(MAX_CHILDREN <= 512, `a cap of ${String(MAX_CHILDREN)} is not a cap`);
});

test('a directory wider than the cap is truncated, and the truncation is reported', async (t) => {
  const base = await scratch(t);
  const names = numbered(MAX_CHILDREN + 2);
  await makeChildren(base, names);
  const inside = await makeProjectAt(join(base, names[0] ?? ''));
  const beyond = await makeProjectAt(join(base, names.at(-1) ?? ''));

  const text = suggestions(base);
  assert.deepEqual(offered(text), [invocation(inside)]);
  assert.ok(!text.includes(beyond), `the cap did not hold:\n${text}`);
  assert.match(text, /The scan did not finish/, `truncation was silent:\n${text}`);
  assert.match(text, new RegExp(`more than ${String(MAX_CHILDREN)} subdirectories`));
});

test('dot-directories cannot fill the breadth cap and hide a real project', async (t) => {
  // The reproduction, end to end: `.` sorts ahead of every letter in ASCII, so
  // with the cap applied before the exclusions a directory holding
  // `MAX_CHILDREN` dot-directories returned nothing but dot-directories, which
  // the scan then filtered away — hiding the project standing beside them.
  const base = await scratch(t);
  await makeChildren(base, numbered(MAX_CHILDREN, '.hidden'));
  const project = await makeProjectAt(join(base, 'real'));

  const text = suggestions(base);
  assert.deepEqual(offered(text), [invocation(project)]);
  assert.doesNotMatch(text, /did not finish/, 'excluded names were counted against the cap');
});

test('the total-probe budget stops the scan and says that it stopped', async (t) => {
  // `MAX_CHILDREN` bounds each listing, not the work: at two levels it admits
  // 128 + 128 x 128 probes, measured at 2.3s on tmpfs and far worse on a
  // network mount. A failure message must not cost more than the run.
  const base = await scratch(t);
  const parents = numbered(8, 'p');
  await makeChildren(base, parents);
  await Promise.all(
    parents.map((parent) =>
      makeChildren(join(base, parent), numbered(70, 'c')),
    ),
  );
  const project = await makeProjectAt(join(base, 'p-0000', 'c-0000'));

  const text = suggestions(base);
  assert.ok(
    offered(text).includes(invocation(project)),
    `a candidate found before the budget ran out was dropped:\n${text}`,
  );
  assert.match(text, new RegExp(`stopped after examining ${String(MAX_PROBES)} directories`));
});

test('a low budget is honoured, so the bound is the number and not the tree', async (t) => {
  const base = await scratch(t);
  await makeChildren(base, numbered(20));
  await makeProjectAt(join(base, 'd-0019'));

  const text = suggestions(base, { budget: 2 });
  assert.match(text, /The scan did not finish/);
  assert.deepEqual(offered(text), [], 'a budget of 2 cannot have reached the twentieth child');
});

test('more candidates than the refusal prints are counted, not dumped', async (t) => {
  const base = await scratch(t);
  const names = numbered(MAX_SUGGESTIONS + 2);
  for (const name of names) await makeProjectAt(join(base, name));

  const text = suggestions(base);
  assert.equal(offered(text).length, MAX_SUGGESTIONS, `printed ${String(offered(text).length)} lines`);
  assert.equal(text.split('\n')[0], `${String(names.length)} BMAD projects are nearby. Run one of these instead.`);
  assert.match(text, /^2 more not listed\.$/m);
});

test('the filesystem root as a target terminates and reports honestly', async () => {
  // The ancestor loop exits on its first step, and the descent enumerates the
  // volume's top two levels. Run against a deliberately tiny budget so this
  // stays a bounds test rather than a sweep of the machine.
  const text = suggestions('/', { budget: 4 });
  assert.notEqual(text, '', 'the root target produced no message at all');
  assert.ok(offered(text).length <= MAX_SUGGESTIONS, text);
});

test('a scan that finished does not claim it did not', async (t) => {
  const base = await scratch(t);
  await makeProjectAt(join(base, 'proj'));
  assert.doesNotMatch(suggestions(base), /did not finish/);
});

// ---------------------------------------------------------------------------
// Through the composition root
// ---------------------------------------------------------------------------

/** The refusal Story 1.5 produces, read from the source of truth. */
function refusalOf(target: string): string {
  const result = resolveLocation(target);
  assert.ok(!result.ok, `expected ${target} to be refused, but it resolved`);
  return result.message;
}

test('a target inside a project exits 2 naming the invocation, binding nothing', async (t) => {
  // The story's first acceptance criterion, end to end through `run`.
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, 'proj'));

  const observed = await observeRun([join(project, '_bmad-output')]);

  assert.equal(observed.code, 2, 'a non-project target is a usage failure');
  assert.deepEqual(observed.served, [], 'no socket may be asked for');
  assert.equal(observed.launched, 0, 'no browser may be launched');
  assert.equal(observed.signals, 0, 'nothing was started, so nothing registers a shutdown');
  assert.equal(observed.out, '', 'suggestions go to stderr, never stdout');
  assert.ok(observed.err.startsWith(refusalOf(join(project, '_bmad-output'))), observed.err);
  // Either spelling is correct here — which one depends on how the suite itself
  // was invoked, and `commandSpelling` is pinned exhaustively above. What this
  // asserts is that the wiring reached the scan and the path came through
  // quoted, on stderr, behind a blank line.
  assert.match(
    observed.err,
    new RegExp(`\\n\\n${ONE_CANDIDATE.replace(/\./g, '\\.')}\\n\\n {4}(?:npx )?${COMMAND} ${project}\\n`),
    observed.err,
  );
});

test('flags the invocation already carried survive into the suggestion', async (t) => {
  // `bmad-dash --port 8080 ../wrong` used to suggest `bmad-dash /right`,
  // quietly dropping options the reader would have to remember to retype.
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, 'proj'));

  const observed = await observeRun([join(project, '_bmad-output'), '--port', '8080', '--no-open']);
  assert.deepEqual(observed.scanFlags, [['--no-open', '--port', '8080']]);
  assert.match(observed.err, new RegExp(`${COMMAND} ${project} --no-open --port 8080$`, 'm'), observed.err);
});

test('a default port and an unsuppressed browser add no flags', async (t) => {
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, 'proj'));
  const observed = await observeRun([join(project, '_bmad-output')]);
  assert.deepEqual(observed.scanFlags, [[]], 'flags nobody typed must not appear');
});

test('the scan does not run for a path that is not there', async (t) => {
  const base = await scratch(t);
  const observed = await observeRun([join(base, 'typo')]);

  assert.equal(observed.code, 2);
  assert.deepEqual(observed.scans, [], 'a typo is not answered by a different directory');
  assert.match(observed.err, /^No such directory: /);
});

test('the scan does not run for a file given where a directory belongs', async (t) => {
  const base = await scratch(t);
  const file = join(base, 'f.txt');
  await writeFile(file, 'x\n');

  const observed = await observeRun([file]);
  assert.equal(observed.code, 2);
  assert.deepEqual(observed.scans, []);
  assert.match(observed.err, /^Not a directory: /);
});

test('the scan does not run for a marker that resolves out of its own tree', async (t) => {
  // The fourth refusal, added when the crash above was fixed. "Try running it
  // over there" answers a malformed project no better than it answers a typo.
  const base = await scratch(t);
  // The link target has to be outside `base` itself, not merely outside the
  // marker: confinement is checked against the directory holding the marker.
  const outside = await scratch(t);
  await mkdir(join(base, '_bmad-output'), { recursive: true });
  await symlink(outside, join(base, '_bmad'));

  const observed = await observeRun([base]);
  assert.equal(observed.code, 2, 'a malformed project is not a failure to start');
  assert.deepEqual(observed.scans, []);
  assert.match(observed.err, /resolves outside it/);
  assert.match(observed.err, /is not a marker/);
});

test('the scan does not run for an unreadable target, which still exits 1', async (t) => {
  // The one refusal with a different exit code. Story 1.5 separates 2 — you
  // typed it wrong — from 1 — it could not start — and the scan must not move
  // either. Denying traversal to the parent is what makes the target itself
  // unstattable.
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('needs POSIX permissions and a non-root user');
    return;
  }
  const base = await scratch(t);
  const outer = join(base, 'outer');
  const project = await makeProjectAt(join(outer, 'project'));

  await chmod(outer, 0o000);
  try {
    const observed = await observeRun([project]);
    assert.equal(observed.code, 1, 'a permissions failure is not a usage error');
    assert.deepEqual(observed.scans, [], 'a denied directory is not answered by a suggestion');
    assert.match(observed.err, /^Could not read /);
  } finally {
    await chmod(outer, 0o755);
  }
});

test('a scan that finds nothing appends its report and still exits 2', async (t) => {
  const base = await scratch(t);
  const observed = await observeRun([base]);

  assert.equal(observed.code, 2);
  assert.deepEqual(observed.scans, [base], 'the scan runs exactly once, for the refused target');
  assert.match(observed.err, /is not a BMAD project\./);
  assert.match(observed.err, /No directory holding _bmad and _bmad-output is in the ancestors of/);
});

test('the real scan is what the composition root wires by default', async (t) => {
  // Every other case here injects a recorder, which proves the seam and not the
  // default behind it. Passing no `suggest` at all is the only way to observe
  // that the shipped wiring is the real scan rather than a stub the tests
  // happen to supply.
  const base = await scratch(t);
  const project = await makeProjectAt(join(base, 'proj'));

  const observed = await observeRun([join(project, '_bmad-output')], { injectSuggest: false });
  assert.equal(observed.code, 2);
  // On the *pasteable line*, not on the path appearing somewhere. The target
  // is `<project>/_bmad-output`, so the Story 1.5 refusal already contains
  // `project` as a substring — an `includes(project)` here passed with the
  // default replaced by `() => []`, which is the whole thing it was meant to
  // catch.
  assert.match(
    observed.err,
    new RegExp(`^ {4}(?:npx )?${COMMAND} ${project}$`, 'm'),
    `the default wiring suggested nothing:\n${observed.err}`,
  );
});

test('a scan that returns nothing at all leaves the Story 1.5 message untouched', async (t) => {
  // The inert substitution, at the message level: no stray blank line, no
  // dangling separator, and the same exit code. The expectation is read from
  // `resolveLocation` rather than spelled a third time here.
  const base = await scratch(t);
  const observed = await observeRun([base], { suggest: () => [] });

  assert.equal(observed.code, 2);
  assert.equal(observed.err, `${refusalOf(base)}\n`);
});
