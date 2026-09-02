/**
 * The CLI's flag surface, which this story opened.
 *
 * Until now `parseArgs` ran strict with an empty options map, so every flag
 * exited 2 and `ACCEPTED` read "No flags are accepted". Four flags land at
 * once — see the spec's scope note — so the risk this file guards is that a
 * flag is declared but undocumented, documented but undeclared, or accepted
 * with a value that is not a value.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  parseInvocation,
  parsePort,
  HELP,
  VERSION,
  DECLARED_OPTIONS,
} from '../../src/cli/index.ts';

const CWD = '/tmp/somewhere';

/** The serving branch, or a failure if the arguments did not produce one. */
function serving(argv: readonly string[]): {
  readonly projectRoot: string;
  readonly open: boolean;
  readonly port: number;
} {
  const invocation = parseInvocation(argv, CWD);
  assert.ok(invocation.ok, `${argv.join(' ')} should parse`);
  assert.ok('projectRoot' in invocation, `${argv.join(' ')} should be a serving invocation`);
  return invocation;
}

// ---------------------------------------------------------------------------
// --no-open
// ---------------------------------------------------------------------------

test('a browser is opened by default and suppressed by --no-open', () => {
  assert.equal(serving([]).open, true, 'the default is to open');
  assert.equal(serving(['--no-open']).open, false);
  assert.equal(serving(['--no-open', '/tmp/project']).open, false, 'order does not matter');
  assert.equal(serving(['/tmp/project', '--no-open']).open, false);
});

test('--no-open does not disturb the path it sits beside', () => {
  const invocation = serving(['--no-open', 'sub']);
  assert.equal(invocation.projectRoot, '/tmp/somewhere/sub');
});

test('there is no --open, because the default already is', () => {
  const invocation = parseInvocation(['--open'], CWD);
  assert.ok(!invocation.ok);
  assert.match(invocation.message, /Unknown argument: --open/);
});

// ---------------------------------------------------------------------------
// --port
// ---------------------------------------------------------------------------

test('an absent port asks the OS for one', () => {
  assert.equal(parsePort(undefined), 0);
  assert.equal(serving([]).port, 0);
});

test('every port in range is accepted, including the extremes', () => {
  for (const [raw, expected] of [
    ['0', 0],
    ['1', 1],
    ['80', 80],
    ['3000', 3000],
    ['8080', 8080],
    ['65535', 65_535],
  ] as const) {
    assert.equal(parsePort(raw), expected, `${raw} should be accepted`);
    assert.equal(serving(['--port', raw]).port, expected);
  }
});

test('a value that is not a plain decimal integer in range is refused', () => {
  // Each of these is a typo rather than a port, and each is accepted by at
  // least one of the obvious implementations: `Number` takes '0x10', '1e3',
  // ' 80 ' and 'Infinity'; `parseInt` takes '80abc' and '1.5'.
  for (const raw of [
    'abc',
    '',
    ' ',
    '-1',
    '65536',
    '1.5',
    '0x10',
    '1e3',
    '80abc',
    ' 80 ',
    // Leading zeros: `0080` was accepted, parsed to 80, and — 80 being
    // privileged — fell back to an OS port and bound 40821. A typo silently
    // reinterpreted twice.
    '0080',
    '007',
    '00',
    '000000',
    '+80',
    'Infinity',
    'NaN',
    '08٠',
  ]) {
    assert.equal(parsePort(raw), null, `${JSON.stringify(raw)} should be refused`);
  }
});

test('a refused port exits 2 naming both the value and the range', () => {
  const invocation = parseInvocation(['--port', 'abc'], CWD);
  assert.ok(!invocation.ok);
  assert.match(invocation.message, /Invalid --port value: "abc"/);
  assert.match(invocation.message, /from 0 to 65535/);
  assert.match(invocation.message, /Usage: bmad-dash/);
});

test('--port with no value is a parse error, not a silent default', () => {
  const invocation = parseInvocation(['--port'], CWD);
  assert.ok(!invocation.ok, '--port with nothing after it must not fall back to 0');
});

// ---------------------------------------------------------------------------
// --help and --version
// ---------------------------------------------------------------------------

test('--help and -h both produce the same help text', () => {
  for (const flag of ['--help', '-h']) {
    const invocation = parseInvocation([flag], CWD);
    assert.ok(invocation.ok);
    assert.ok('print' in invocation, `${flag} should print rather than serve`);
    assert.equal(invocation.print, HELP);
  }
});

test('help wins over anything else on the line', () => {
  // `bmad-dash --help` with three stray paths is still a request for help;
  // answering it with a usage error would be pedantry.
  for (const argv of [
    ['--help', 'a', 'b', 'c'],
    ['--port', 'nonsense', '--help'],
    ['--help', '--version'],
  ]) {
    const invocation = parseInvocation(argv, CWD);
    assert.ok(invocation.ok, `${argv.join(' ')} should still succeed`);
    assert.ok('print' in invocation && invocation.print === HELP, `${argv.join(' ')} should print help`);
  }
});

test('--version prints a bare version and nothing else', () => {
  const invocation = parseInvocation(['--version'], CWD);
  assert.ok(invocation.ok);
  assert.ok('print' in invocation);
  // Not `=== \`${VERSION}\n\`` — that compares the value to itself and passes
  // for any value at all. The shape is what this can honestly assert here; the
  // real number is checked against package.json in `test/cli-entry.test.ts`.
  assert.match(invocation.print, /^\d+\.\d+\.\d+\n$/, 'a bare semantic version and a newline');
  assert.equal(invocation.print.trim(), VERSION);
  assert.doesNotMatch(invocation.print, /bmad-dash|Usage|version/i, 'no prose, just the number');
});

// ---------------------------------------------------------------------------
// The help text and the declared options may not drift apart
// ---------------------------------------------------------------------------

/** Every long flag the parser accepts. The one list this file trusts. */
const DECLARED = ['--no-open', '--port', '--help', '--version'] as const;

test('every declared flag is documented in the help text', () => {
  for (const flag of DECLARED) {
    assert.ok(HELP.includes(flag), `${flag} is accepted but the help text never mentions it`);
  }
  assert.ok(HELP.includes('-h'), 'the short form is documented too');
});

test('every flag the help text documents is actually accepted', () => {
  // The other direction. A help text promising a flag the parser rejects sends
  // the reader to exit 2 with the tool's own documentation in hand.
  const documented = [...HELP.matchAll(/(?<![\w-])--[a-z][a-z-]*/g)].map((m) => m[0]);
  assert.ok(documented.length >= DECLARED.length, 'the help text must document the flags');
  for (const flag of new Set(documented)) {
    const invocation = parseInvocation(flag === '--port' ? [flag, '0'] : [flag], CWD);
    assert.ok(invocation.ok, `${flag} is documented but rejected by the parser`);
  }
});

test('an undeclared flag still exits 2, naming it and what is accepted', () => {
  for (const flag of ['--nope', '--openn', '--Port', '-x']) {
    const invocation = parseInvocation([flag], CWD);
    assert.ok(!invocation.ok, `${flag} should be refused`);
    assert.match(invocation.message, /Accepted arguments:/);
  }
  // And the accepted list is not stale: it names each flag that now works.
  const refused = parseInvocation(['--nope'], CWD);
  assert.ok(!refused.ok);
  for (const flag of DECLARED) {
    assert.ok(refused.message.includes(flag), `the accepted list omits ${flag}`);
  }
  assert.doesNotMatch(refused.message, /No flags are accepted/, 'that sentence is now false');
});

// ---------------------------------------------------------------------------
// The suite must not open the reader's browser
// ---------------------------------------------------------------------------

test('no test spawns the CLI without suppressing the browser', async () => {
  // Two mechanisms could open a real tab from the suite, needing different
  // guards.
  //
  // In-process `run()` calls are handled by the type system: `RunDependencies.launch`
  // is required, so a test that forgets to stub the launcher does not compile.
  //
  // A *spawned* CLI is not reachable that way — the child parses its own argv —
  // so suppression lives in the spawn helpers and this keeps it there.
  //
  // The first version of this scan was line-based, which was wrong twice over.
  // A spawn wrapped across lines escaped it silently, and it matched *any*
  // `spawn(process.execPath` — so it forced a meaningless `--no-open` onto
  // `node --test` invocations in a discovery test that never runs the CLI.
  // It also carried a comment claiming "the count below is checked rather than
  // assumed" while checking no count at all, which is the exact failure this
  // project keeps repeating: a claim asserted rather than observed.
  const { readdir, readFile } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const testRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  };
  await walk(testRoot);
  assert.ok(files.length >= 10, `expected the test tree, found ${String(files.length)} files`);

  // Whole-file, not per line, so wrapping a call cannot hide it. A spawn counts
  // as a CLI spawn only when the built entry point is named in the same call —
  // which is what stops it policing unrelated `node` invocations.
  const offenders: string[] = [];
  let examined = 0;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/spawn\(\s*process\.execPath\s*,([\s\S]*?)\)\s*;/g)) {
      const call = match[1] ?? '';
      if (!/\bCLI\b|BUILT_ENTRY|entry\b/.test(call)) continue;
      examined += 1;
      if (call.includes("'--no-open'")) continue;
      // One legitimate exception: a spawn that shadows PATH so the platform
      // launcher *is* a recorder. That test exists precisely to prove the real
      // launcher is reached, so it cannot pass `--no-open` — and it opens no
      // tab because there is no real launcher on its PATH. Keyed on the
      // property that makes it safe rather than on a comment that claims it is.
      if (/PATH:\s*shim\b/.test(call)) continue;
      offenders.push(`${file.slice(testRoot.length + 1)}: ${call.replace(/\s+/g, ' ').trim()}`);
    }
  }

  // The count, actually checked this time. A scan that silently matches nothing
  // is a guard that has become a no-op, which is how the first version could
  // have degraded without anything going red.
  assert.ok(examined >= 4, `the scan examined only ${String(examined)} CLI spawns; it has stopped matching`);
  assert.deepEqual(offenders, [], 'a test spawns the CLI without --no-open and will open a browser');

  // The shell-pipeline form builds a command string rather than an argv, so it
  // is outside the scan by construction and suppressed at its own site.
  const serverTests = await readFile(join(testRoot, 'server.test.ts'), 'utf8');
  const pipeline = /const pipeline = `[^`]*`/.exec(serverTests)?.[0] ?? '';
  assert.notEqual(pipeline, '', 'the EPIPE pipeline should still exist');
  assert.ok(pipeline.includes('--no-open'), 'the shell pipeline must suppress the browser too');
});

test('help wins even over a flag the parser does not know', () => {
  // `parseArgs` throws on an undeclared flag before any value is inspected, so
  // `--help --nope` exited 2 while the matrix promised help wins over anything
  // else on the line — and a reader who mistyped a flag is exactly the reader
  // who wants the help text rather than a refusal.
  for (const argv of [
    ['--help', '--nope'],
    ['--nope', '--help'],
    ['-h', '--nope'],
    ['--port', 'rubbish', '-h'],
  ]) {
    const invocation = parseInvocation(argv, CWD);
    assert.ok(invocation.ok, `${argv.join(' ')} should still succeed`);
    assert.ok('print' in invocation && invocation.print === HELP, `${argv.join(' ')} should print help`);
  }
});

test('an empty path argument is refused, not treated as the default', () => {
  // `resolve(cwd, '')` returns `cwd`, so this used to look like a successful
  // default. The case that matters is a wrapper script's `bmad-dash "$TARGET"`
  // with `TARGET` unset: it inspected whatever directory the script ran from
  // and reported it as the project the caller asked for.
  const invocation = parseInvocation([''], CWD);
  assert.ok(!invocation.ok, 'an empty path must not parse as a serving invocation');
  assert.match(invocation.message, /Empty path argument/);
  // Same shape as every sibling positional error: what is accepted, then the
  // usage line. This one appended only `USAGE`, so the one argument error most
  // likely to come from a wrapper script was the one that did not say what the
  // tool takes.
  assert.match(invocation.message, /Accepted arguments:/);
  assert.match(invocation.message, /Usage: bmad-dash/);

  // Absent still means the current directory — that is the default, and it is
  // a different thing from an empty argument.
  assert.equal(serving([]).projectRoot, CWD);

  // And a path that is merely odd is still a path: one space names a directory
  // called " ", which is legal and is not the working directory. Built with
  // `resolve` rather than a literal `/`, so the claim does not smuggle in a
  // POSIX separator — the assertion is about the argument being kept, not
  // about how this platform spells a path.
  assert.equal(serving([' ']).projectRoot, resolve(CWD, ' '));
});

test('a path literally named --help is still a path, after the separator', () => {
  // `--` ends option parsing, so the help short-circuit must respect it or it
  // would swallow a legitimate, if eccentric, directory name.
  const invocation = parseInvocation(['--', '--help'], CWD);
  assert.ok(invocation.ok);
  assert.ok('projectRoot' in invocation, 'after -- it is a path, not a request for help');
  assert.equal(invocation.projectRoot, '/tmp/somewhere/--help');
});
