#!/usr/bin/env node
/**
 * Test runner with a floor on how many tests must actually run.
 *
 * Three `node --test` behaviours make a green result untrustworthy on its own:
 *
 *   1. A single-level glob (`test/*.test.ts`) silently omits subdirectories. A
 *      failing test one directory down is simply not collected.
 *   2. A pattern that matches nothing exits 0. Discovery breaking looks exactly
 *      like discovery passing.
 *   3. A run killed by a signal can leave no summary at all.
 *   4. A skipped test still counts toward `ℹ tests`, so a guard that skips
 *      itself clears the floor and the run stays green. Naming the skips made
 *      them legible in the log; nothing read them.
 *
 * So the pattern is recursive, the reported total is checked against a floor,
 * and a non-zero skip count fails unless an allowance says otherwise. Every
 * decision lives in `test-run-policy.ts`, which is unit-tested; this file is
 * only the plumbing.
 */

import { spawn } from 'node:child_process';

import {
  MIN_ENV,
  PATTERN_ENV,
  SKIPS_ENV,
  parseAllowedSkips,
  parseFloor,
  parsePattern,
  summarize,
} from './test-run-policy.ts';

/**
 * Raise this when you add tests; never lower it to make a run pass. It exists
 * so a suite that quietly stops collecting cannot report success.
 */
const DEFAULT_MIN_TESTS = 1008;

/** Recursive on purpose: `**` is expanded by the test runner, not the shell. */
const DEFAULT_PATTERN = 'test/**/*.test.ts';

const floor = parseFloor(process.env[MIN_ENV], DEFAULT_MIN_TESTS);
if (!floor.ok) {
  process.stderr.write(`FAIL: ${floor.message}\n`);
  process.exit(1);
}

const pattern = parsePattern(process.env[PATTERN_ENV], DEFAULT_PATTERN);
if (!pattern.ok) {
  process.stderr.write(`FAIL: ${pattern.message}\n`);
  process.exit(1);
}

const allowedSkips = parseAllowedSkips(process.env[SKIPS_ENV]);
if (!allowedSkips.ok) {
  process.stderr.write(`FAIL: ${allowedSkips.message}\n`);
  process.exit(1);
}

const minTests = floor.value;
const globPattern = pattern.value;
const skipAllowance = allowedSkips.value;

const child = spawn(process.execPath, ['--test', '--test-reporter=spec', globPattern], {
  stdio: ['inherit', 'pipe', 'inherit'],
});

let captured = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk: string) => {
  captured += chunk;
  process.stdout.write(chunk);
});

child.on('error', (error: Error) => {
  process.stderr.write(`could not start the test runner: ${error.message}\n`);
  process.exit(1);
});

child.on('close', (code: number | null, signal: string | null) => {
  const outcome = summarize({
    code,
    signal,
    output: captured,
    minTests,
    pattern: globPattern,
    allowedSkips: skipAllowance,
  });
  if (outcome.message !== undefined) {
    process.stderr.write(`\nFAIL: ${outcome.message}\n`);
  }
  process.exit(outcome.exitCode);
});
