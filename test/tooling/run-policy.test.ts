/**
 * The test runner's own decisions.
 *
 * Both of these were wrong in ways only a unit test reaches. The floor override
 * was coerced rather than validated, so `''` and `'abc'` disabled the guard
 * that protects the whole suite. And the killed-by-signal branch sat behind a
 * missing-summary check that always won, so a SIGKILLed run reported the wrong
 * cause. Neither is reachable end to end without killing a nested runner.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIN_ENV,
  SKIPS_ENV,
  parseAllowedSkips,
  parseFloor,
  parsePattern,
  readSkipped,
  readTotal,
  summarize,
} from '../../scripts/test-run-policy.ts';

const BASE = {
  code: 0,
  signal: null,
  minTests: 10,
  pattern: 'test/**/*.test.ts',
  allowedSkips: 0,
} as const;

/** A summary block as the spec reporter actually prints one. */
function summaryOf(tests: number, skipped = 0): string {
  return [`ℹ tests ${String(tests)}`, 'ℹ pass 1', 'ℹ fail 0', `ℹ skipped ${String(skipped)}`].join(
    '\n',
  );
}

test('an absent floor override falls back to the default', () => {
  const parsed = parseFloor(undefined, 93);
  assert.ok(parsed.ok);
  assert.equal(parsed.value, 93);
});

test('a floor override that cannot be read is refused, naming the value', () => {
  // `Number('abc')` is NaN and `0 < NaN` is false; `Number('')` is 0. Either
  // way the floor silently stopped protecting anything.
  for (const bad of ['', ' ', 'abc', '-1', '1.5', 'null', 'NaN', '0x10', '1e3', '+1', '١٢', '0', '00']) {
    const parsed = parseFloor(bad, 93);
    assert.equal(parsed.ok, false, `${JSON.stringify(bad)} must be refused`);
    if (!parsed.ok) {
      assert.match(parsed.message, new RegExp(MIN_ENV));
      assert.ok(
        parsed.message.includes(JSON.stringify(bad)),
        `the rejection must name the bad value, got: ${parsed.message}`,
      );
    }
  }
});

test('a valid floor override is accepted; zero is not', () => {
  for (const [raw, expected] of [
    ['1', 1],
    ['93', 93],
    [' 7 ', 7],
  ] as const) {
    const parsed = parseFloor(raw, 93);
    assert.ok(parsed.ok, `${JSON.stringify(raw)} should be accepted`);
    assert.equal(parsed.value, expected);
  }
});

test('an empty pattern override is refused', () => {
  const parsed = parsePattern('', 'test/**/*.test.ts');
  assert.equal(parsed.ok, false);
  const fallback = parsePattern(undefined, 'test/**/*.test.ts');
  assert.ok(fallback.ok);
  assert.equal(fallback.value, 'test/**/*.test.ts');
});

test('a padded pattern override is trimmed rather than passed through', () => {
  // Untrimmed, this matched no files, and the floor then reported it as the
  // suite having stopped collecting — sending the reader to look at discovery
  // instead of at the environment variable they had just set.
  const parsed = parsePattern('  test/**/*.test.ts  ', 'unused');
  assert.ok(parsed.ok);
  assert.equal(parsed.value, 'test/**/*.test.ts');

  // A pattern that is nothing but padding is refused — but that is *not* part
  // of the fix, and the record used to imply it was. The `raw.trim() === ''`
  // branch predates this change; only its message was inaccurate, having said
  // "set but empty" of a value that is set and not empty.
  const blank = parsePattern('   ', 'unused');
  assert.equal(blank.ok, false);
  if (!blank.ok) assert.match(blank.message, /empty or whitespace-only/);
});

test('a CRLF summary line is still a summary', () => {
  // Kept, but as a *characterization* test rather than a regression test: the
  // bare `$` already handles this, because under `/m` JavaScript treats `\r` as
  // a line terminator. A deferred finding claimed CRLF broke the match; it does
  // not, and this is what pins that so the claim is not re-fixed.
  assert.equal(readTotal('\u2139 tests 12\r\n'), 12);
  assert.equal(readTotal(['\u2139 tests 999\r', 'noise', '\u2139 tests 7\r'].join('\n')), 7);
});

test('the total is read from the last summary, not the first', () => {
  // Assertion messages quote nested runner output, so the first match can be a
  // fixture's count. Reading it would mask the real result.
  const output = ['ℹ tests 999', 'some assertion message', 'ℹ tests 4'].join('\n');
  assert.equal(readTotal(output), 4);
  assert.equal(readTotal('no summary here'), undefined);
});

test('a killed run reports the signal, not a missing summary', () => {
  // The signal check must come first. Behind the missing-summary check it was
  // unreachable, so a SIGKILLed run always blamed the reporter.
  const killed = summarize({ ...BASE, code: null, signal: 'SIGKILL', output: '' });
  assert.equal(killed.exitCode, 1);
  assert.match(killed.message ?? '', /killed by SIGKILL/);
  assert.doesNotMatch(killed.message ?? '', /could not determine/);
});

test('a killed run reports the signal even when a summary is present', () => {
  const killed = summarize({
    ...BASE,
    code: null,
    signal: 'SIGTERM',
    output: 'ℹ tests 999',
  });
  assert.match(killed.message ?? '', /killed by SIGTERM/);
});

test('an unreadable summary is reported as such', () => {
  const blind = summarize({ ...BASE, output: 'nothing parseable' });
  assert.equal(blind.exitCode, 1);
  assert.match(blind.message ?? '', /could not determine how many tests ran/);
});

test('a total below the floor fails, naming both numbers and the pattern', () => {
  const starved = summarize({ ...BASE, output: 'ℹ tests 3' });
  assert.equal(starved.exitCode, 1);
  assert.match(starved.message ?? '', /only 3 tests ran, expected at least 10/);
  assert.match(starved.message ?? '', /test\/\*\*\/\*\.test\.ts/);
});

test('a total at or above the floor passes the child exit code through', () => {
  assert.deepEqual(summarize({ ...BASE, output: summaryOf(10) }), {
    exitCode: 0,
    message: undefined,
  });
  assert.equal(summarize({ ...BASE, code: 1, output: summaryOf(40) }).exitCode, 1);
});

test('zero tests always fails against any positive floor', () => {
  const empty = summarize({ ...BASE, output: 'ℹ tests 0' });
  assert.equal(empty.exitCode, 1);
  assert.match(empty.message ?? '', /only 0 tests ran/);
});

// ---------------------------------------------------------------------------
// Skips. A skipped test still counts toward the total, so the floor cannot see
// one — which made every named skip in this project decorative.
// ---------------------------------------------------------------------------

test('the skip count is read from the last summary, not the first', () => {
  assert.equal(readSkipped(summaryOf(10, 3)), 3);
  assert.equal(readSkipped('ℹ skipped 0'), 0);
  assert.equal(readSkipped('\u2139 skipped 12\r\n'), 12);
  // A nested runner's summary can be quoted in an assertion message, exactly
  // as for `readTotal`.
  assert.equal(readSkipped(['ℹ skipped 99', 'noise', 'ℹ skipped 2'].join('\n')), 2);
  assert.equal(readSkipped('no summary here'), undefined);
});

test('a skipped test fails the run, though it cleared the floor', () => {
  // Measured before this existed: a suite with one guard forced to skip
  // reported `fail 0 / skipped 1`, cleared the floor and exited 0. The skipped
  // test is counted in `ℹ tests`, so the floor is the wrong instrument.
  const skipped = summarize({ ...BASE, output: summaryOf(10, 1) });
  assert.equal(skipped.exitCode, 1);
  assert.match(skipped.message ?? '', /1 test\(s\) skipped/);
  assert.match(skipped.message ?? '', new RegExp(SKIPS_ENV));
  // And it must not be reported as the floor problem, which it is not.
  assert.doesNotMatch(skipped.message ?? '', /stopped collecting|tests ran, expected/);
});

test('the floor is reported before the skips when both are wrong', () => {
  const both = summarize({ ...BASE, output: summaryOf(3, 2) });
  assert.equal(both.exitCode, 1);
  assert.match(both.message ?? '', /only 3 tests ran/);
});

test('an explicit allowance excuses exactly that many skips and no more', () => {
  assert.deepEqual(summarize({ ...BASE, allowedSkips: 1, output: summaryOf(10, 1) }), {
    exitCode: 0,
    message: undefined,
  });
  assert.deepEqual(summarize({ ...BASE, allowedSkips: 4, output: summaryOf(10, 0) }), {
    exitCode: 0,
    message: undefined,
  });
  const overrun = summarize({ ...BASE, allowedSkips: 4, output: summaryOf(10, 5) });
  assert.equal(overrun.exitCode, 1, 'the fifth skip is not covered by an allowance of four');
  assert.match(overrun.message ?? '', /5 test\(s\) skipped, and at most 4/);
});

test('a summary with a total but no skip count is refused, not assumed to be zero', () => {
  // Assuming zero would put the whole check behind a reporter format the
  // project does not control.
  const blind = summarize({ ...BASE, output: 'ℹ tests 40' });
  assert.equal(blind.exitCode, 1);
  assert.match(blind.message ?? '', /no skip count/);
});

test('an absent skip allowance means none are allowed', () => {
  const parsed = parseAllowedSkips(undefined);
  assert.ok(parsed.ok);
  assert.equal(parsed.value, 0);
});

test('a skip allowance that cannot be read is refused, naming the value', () => {
  for (const bad of ['', ' ', 'abc', '-1', '1.5', 'null', 'NaN', '0x10', '1e3', '+1', '١٢', 'true']) {
    const parsed = parseAllowedSkips(bad);
    assert.equal(parsed.ok, false, `${JSON.stringify(bad)} must be refused`);
    if (!parsed.ok) {
      assert.match(parsed.message, new RegExp(SKIPS_ENV));
      assert.ok(
        parsed.message.includes(JSON.stringify(bad)),
        `the rejection must name the bad value, got: ${parsed.message}`,
      );
    }
  }
});

test('a readable skip allowance is accepted, and zero is the strict default spelled out', () => {
  for (const [raw, expected] of [
    ['0', 0],
    ['1', 1],
    [' 3 ', 3],
    ['12', 12],
  ] as const) {
    const parsed = parseAllowedSkips(raw);
    assert.ok(parsed.ok, `${JSON.stringify(raw)} should be accepted`);
    assert.equal(parsed.value, expected);
  }
  // Unlike the floor, `0` is meaningful here: it is the default, not a way of
  // switching the check off, so it must not be refused as a disabling value.
  assert.equal(summarize({ ...BASE, allowedSkips: 0, output: summaryOf(10, 1) }).exitCode, 1);
});
