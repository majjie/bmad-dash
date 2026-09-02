/**
 * Decisions the test runner makes, as pure functions.
 *
 * These were inline in the runner and therefore untestable: the floor-override
 * validation could only be reached through a spawned process, and the
 * signal-versus-missing-summary ordering could not be reached at all without
 * killing a nested runner. Both were wrong in ways a unit test would have
 * caught immediately — a coerced `Number('abc')` silently disabled the floor,
 * and the signal branch sat behind an earlier `return` that always won.
 *
 * Tooling, never shipped: absent from the package `files` whitelist.
 */

export interface Rejected {
  readonly ok: false;
  readonly message: string;
}

export interface Accepted<T> {
  readonly ok: true;
  readonly value: T;
}

export type Parsed<T> = Accepted<T> | Rejected;

export const MIN_ENV = 'BMAD_DASH_TEST_MIN';
export const PATTERN_ENV = 'BMAD_DASH_TEST_PATTERN';
export const SKIPS_ENV = 'BMAD_DASH_TEST_ALLOW_SKIPS';

/**
 * Validate the floor override rather than coercing it.
 *
 * `Number('abc')` is `NaN` and every `<` comparison against `NaN` is false, so
 * an unparseable value silently switched the floor off. `Number('')` is `0`, so
 * a CI variable *declared without a value* did the same. The guard protecting
 * the whole suite must not be disableable by a typo.
 *
 * Zero is rejected too, though it parses cleanly. A floor of zero *is* no floor,
 * and this override exists for one reason only — so the suite can test its own
 * guard, which needs values like 1 and 999 and never 0. Anyone wanting an
 * unguarded subset run can invoke `node --test <pattern>` directly; this runner
 * is the guarded path, so the one capability it must not offer is a way to make
 * itself unguarded. `BMAD_DASH_TEST_MIN: 0` in a CI file reads like a default,
 * not like disabling a safety check.
 */
export function parseFloor(raw: string | undefined, fallback: number): Parsed<number> {
  if (raw === undefined) return { ok: true, value: fallback };

  const trimmed = raw.trim();
  const reject = (): Rejected => ({
    ok: false,
    message:
      `${MIN_ENV} must be an integer of 1 or more, got ${JSON.stringify(raw)}. ` +
      'Refusing to run: an unreadable floor is an absent floor, and this floor is ' +
      `what proves the suite ran at all. Unset ${MIN_ENV} to use the default of ` +
      `${String(fallback)}.`,
  });

  if (trimmed === '' || !/^\d+$/.test(trimmed)) return reject();
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return reject();
  return { ok: true, value: parsed };
}

/** Same reasoning: an empty pattern matches nothing and must not look normal. */
export function parsePattern(raw: string | undefined, fallback: string): Parsed<string> {
  if (raw === undefined) return { ok: true, value: fallback };
  if (raw.trim() === '') {
    return {
      ok: false,
      // "set but empty" was wrong for `'   '`, which is set and is not empty.
      // This branch has always refused whitespace-only input; only the wording
      // was inaccurate about which inputs reach it.
      message:
        `${PATTERN_ENV} is set to an empty or whitespace-only value; that matches no files. ` +
        'Unset it to use the default.',
    };
  }
  // Trimmed, like `parseFloor`. Untrimmed, `' test/**/*.test.ts '` was accepted,
  // matched nothing, and surfaced as "discovery is collecting less than the
  // whole suite" — pointing the reader at the suite rather than at the padded
  // environment variable they had just set.
  return { ok: true, value: raw.trim() };
}

/**
 * How many tests the reporter said it ran.
 *
 * Takes the **last** summary. Assertion messages can quote the output of a
 * nested `node --test` run, so parsing the first match would report a fixture's
 * count and mask the real result.
 */
export function readTotal(output: string): number | undefined {
  // No `\r?` needed before `$`: under `/m` JavaScript counts `\r` itself as a
  // line terminator, so this already matches a CRLF stream. Measured, because a
  // deferred finding claimed otherwise and the "fix" was a no-op whose test
  // passed either way.
  const matches = [...output.matchAll(/^ℹ tests (\d+)$/gm)];
  const last = matches.at(-1)?.[1];
  return last === undefined ? undefined : Number(last);
}

/**
 * How many tests the reporter said it **skipped**.
 *
 * Read for the same reason the total is, and it is the half that was missing.
 * A skipped test still counts toward `ℹ tests`, so a guard that skips itself
 * clears the floor: measured, a suite with one guard forced to skip reports
 * `fail 0 / skipped 1`, passes the floor and exits 0. Every named skip in this
 * project guards a branch that only a POSIX non-root box can reach — the
 * exit-1-versus-2 distinction, symlink creation, a `git` shim on PATH — which
 * is exactly the set a CI container running as root silently stops testing.
 * Naming the skips made them visible in the log; nothing read them.
 *
 * Last match, like `readTotal`, and for the same reason: a nested runner's
 * output can be quoted in an assertion message.
 */
export function readSkipped(output: string): number | undefined {
  const matches = [...output.matchAll(/^ℹ skipped (\d+)$/gm)];
  const last = matches.at(-1)?.[1];
  return last === undefined ? undefined : Number(last);
}

/**
 * How many skipped tests this run is allowed to have.
 *
 * Defaults to zero, and the override exists so that a run which *intends* to
 * skip — a deliberate partial run, or a platform where a named skip is the
 * honest answer — can say so out loud rather than by having nobody look. A
 * count rather than a boolean, so the allowance names how much it is excusing:
 * `${SKIPS_ENV}=4` stops covering the fifth skip.
 *
 * Zero is accepted here, unlike in `parseFloor`, because zero is this knob's
 * default rather than a way of switching it off — `${SKIPS_ENV}=0` and an unset
 * variable mean the same strict thing. Validated rather than coerced for the
 * same reason as the floor, and trimmed and refused when blank for the same
 * reason as the pattern: an unreadable allowance must not read as a generous
 * one.
 */
export function parseAllowedSkips(raw: string | undefined, fallback = 0): Parsed<number> {
  if (raw === undefined) return { ok: true, value: fallback };

  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      message:
        `${SKIPS_ENV} must be a whole number of tolerated skips, got ${JSON.stringify(raw)}. ` +
        'Refusing to run: an unreadable allowance would read as an unlimited one, and a ' +
        'skipped guard is a guard that did not run. Unset it to allow none.',
    };
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    return {
      ok: false,
      message: `${SKIPS_ENV} is not a readable count: ${JSON.stringify(raw)}.`,
    };
  }
  return { ok: true, value: parsed };
}

export interface Outcome {
  readonly exitCode: number;
  readonly message: string | undefined;
}

/**
 * Decide the runner's exit status.
 *
 * Signal is checked **first**. A killed run may have produced no summary at
 * all, and reporting "could not determine how many tests ran" would name a
 * symptom while hiding the cause.
 */
export function summarize(run: {
  readonly code: number | null;
  readonly signal: string | null;
  readonly output: string;
  readonly minTests: number;
  readonly pattern: string;
  readonly allowedSkips: number;
}): Outcome {
  if (run.signal !== null) {
    return { exitCode: 1, message: `the test runner was killed by ${run.signal}.` };
  }

  const total = readTotal(run.output);
  if (total === undefined) {
    return {
      exitCode: 1,
      message:
        'could not determine how many tests ran. Discovery or the reporter changed; ' +
        'a run whose size cannot be read is not evidence that the suite ran.',
    };
  }

  if (total < run.minTests) {
    return {
      exitCode: 1,
      message:
        `only ${String(total)} tests ran, expected at least ${String(run.minTests)}. ` +
        `Discovery is collecting less than the whole suite — check the pattern ${run.pattern} ` +
        'before assuming the code is fine. A pattern matching nothing exits 0 on its own.',
    };
  }

  // Skips are checked after the floor, because "the suite stopped collecting"
  // is the bigger fact and should be the message when both are true.
  const skipped = readSkipped(run.output);
  if (skipped === undefined) {
    return {
      exitCode: 1,
      message:
        'the summary carried a test count but no skip count. The reporter changed; ' +
        'a run whose skips cannot be read is not evidence that nothing was skipped.',
    };
  }

  if (skipped > run.allowedSkips) {
    return {
      exitCode: 1,
      message:
        `${String(skipped)} test(s) skipped, and at most ${String(run.allowedSkips)} ` +
        'is allowed. A skipped test is a branch nobody checked, and every named skip here ' +
        'guards something only a POSIX non-root box can reach — so a run that skips is ' +
        `usually a container running as root, not a passing suite. Set ${SKIPS_ENV} to the ` +
        'number you are prepared to excuse if the skips are deliberate.',
    };
  }

  return { exitCode: run.code ?? 1, message: undefined };
}
