/**
 * A temporary directory that is a BMAD project.
 *
 * From Story 1.5 the CLI recognizes its target before it binds, so any test
 * that spawns or runs it against a bare temporary directory now exits 2 —
 * correctly. Most such tests are about something else entirely (entry-point
 * resolution, argument parsing, signal ordering), so their target has to
 * actually be a project for the thing under test to be reached.
 *
 * Shared rather than copied into each test file so that when the definition of
 * a project changes — a third marker, a version check — there is one place to
 * change, not four that can disagree.
 */

import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MARKERS } from '../../src/cli/location.ts';
import { canonical, toPlatform } from '../../src/adapters/fs/paths.ts';

/**
 * Create a project fixture and register its cleanup.
 *
 * Returns the **canonical** path: the temp root itself can be a symlink — it is
 * on macOS, where `/tmp` points at `/private/tmp` — so a test comparing what
 * the CLI reports against a raw `mkdtemp` result would fail there for a reason
 * that has nothing to do with what it is testing.
 */
export async function makeProjectDir(
  t: { after: (fn: () => unknown) => void },
  prefix = 'bmad-dash-project-',
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const marker of MARKERS) {
    await mkdir(join(dir, marker), { recursive: true });
  }
  return toPlatform(canonical(dir));
}
