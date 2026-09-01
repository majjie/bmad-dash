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

/**
 * Validate the floor override rather than coercing it.
 *
 * `Number('abc')` is `NaN` and every `<` comparison against `NaN` is false, so
 * an unparseable value silently switched the floor off. `Number('')` is `0`, so
 * a CI variable *declared without a value* did the same. The guard protecting
 * the whole suite must not be disableable by a typo.
 */
export function parseFloor(raw: string | undefined, fallback: number): Parsed<number> {
  if (raw === undefined) return { ok: true, value: fallback };

  const trimmed = raw.trim();
  const reject = (): Rejected => ({
    ok: false,
    message:
      `${MIN_ENV} must be a non-negative integer, got ${JSON.stringify(raw)}. ` +
      'Refusing to run: an unreadable floor is an absent floor, and this floor is ' +
      `what proves the suite ran at all. Unset ${MIN_ENV} to use the default of ` +
      `${String(fallback)}.`,
  });

  if (trimmed === '' || !/^\d+$/.test(trimmed)) return reject();
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return reject();
  return { ok: true, value: parsed };
}

/** Same reasoning: an empty pattern matches nothing and must not look normal. */
export function parsePattern(raw: string | undefined, fallback: string): Parsed<string> {
  if (raw === undefined) return { ok: true, value: fallback };
  if (raw.trim() === '') {
    return {
      ok: false,
      message: `${PATTERN_ENV} is set but empty; that matches no files. Unset it to use the default.`,
    };
  }
  return { ok: true, value: raw };
}

/**
 * How many tests the reporter said it ran.
 *
 * Takes the **last** summary. Assertion messages can quote the output of a
 * nested `node --test` run, so parsing the first match would report a fixture's
 * count and mask the real result.
 */
export function readTotal(output: string): number | undefined {
  const matches = [...output.matchAll(/^ℹ tests (\d+)$/gm)];
  const last = matches.at(-1)?.[1];
  return last === undefined ? undefined : Number(last);
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

  return { exitCode: run.code ?? 1, message: undefined };
}
