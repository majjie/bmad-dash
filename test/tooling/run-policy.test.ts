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
  parseFloor,
  parsePattern,
  readTotal,
  summarize,
} from '../../scripts/test-run-policy.ts';

const BASE = { code: 0, signal: null, minTests: 10, pattern: 'test/**/*.test.ts' } as const;

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
  assert.deepEqual(summarize({ ...BASE, output: 'ℹ tests 10' }), {
    exitCode: 0,
    message: undefined,
  });
  assert.equal(summarize({ ...BASE, code: 1, output: 'ℹ tests 40' }).exitCode, 1);
});

test('zero tests always fails against any positive floor', () => {
  const empty = summarize({ ...BASE, output: 'ℹ tests 0' });
  assert.equal(empty.exitCode, 1);
  assert.match(empty.message ?? '', /only 0 tests ran/);
});
