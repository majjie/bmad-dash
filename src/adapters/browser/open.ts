/**
 * Opening a browser, best-effort.
 *
 * The tree's first `node:child_process` consumer. AD-1 permits the import here
 * and in the git adapter and nowhere else, and the gate has enforced that since
 * Story 1.1 — this module is simply the first occupant.
 *
 * Two rules shape everything below.
 *
 * **No shell, ever.** The child is spawned with an argument vector, never a
 * command string, so nothing in the URL can be read as a command. The URL we
 * pass is one we constructed ourselves from a loopback address and a port
 * number, which makes the risk small today and exactly zero if this is never
 * relaxed. It is the reason Windows takes `rundll32` rather than `cmd /c
 * start`: `start` is a shell builtin, so reaching it means reaching a shell.
 *
 * **Failure is an outcome, not an error.** AD-15 makes the launch best-effort:
 * the server is already bound and its URL already printed by the time this
 * runs, so a launch that fails costs the reader nothing but a copy and paste.
 * This function therefore never rejects. It resolves to a result describing
 * what happened, and the caller reports it and carries on. There is no retry
 * and no fallback chain — a second launcher that also fails is two lines of
 * stderr instead of one.
 *
 * There is also no *detection*. Nothing here probes `DISPLAY`, sniffs for WSL,
 * or asks whether a launch is likely to work. Attempting and reporting is both
 * simpler and more honest than a guess that can be wrong in either direction,
 * and NFR-13's requirement is that those environments stay usable — which they
 * do, because the URL is already on stdout.
 */

import { spawn } from 'node:child_process';

/**
 * How long to wait for a launcher to refuse before calling it a success.
 *
 * A handler-less `xdg-open` exits within milliseconds; a launcher that has
 * actually handed the URL to a browser stays alive far longer than this.
 */
const LAUNCH_GRACE_MS = 250;

/** What happened. Never an exception; the caller decides what to say. */
export type LaunchResult =
  | { readonly opened: true; readonly command: string }
  | { readonly opened: false; readonly command: string; readonly reason: string };

/**
 * The launcher for a platform, as a command and its leading arguments.
 *
 * `rundll32 url.dll,FileProtocolHandler <url>` on Windows rather than `start`,
 * because `start` exists only inside a shell. `open` on macOS. `xdg-open`
 * everywhere else, which covers the desktop Linux case and correctly fails on a
 * headless one.
 */
export function launcherFor(platform: string): { readonly command: string; readonly args: readonly string[] } {
  if (platform === 'darwin') return { command: 'open', args: [] };
  if (platform === 'win32') return { command: 'rundll32', args: ['url.dll,FileProtocolHandler'] };
  return { command: 'xdg-open', args: [] };
}

export interface OpenOptions {
  /** Injected so the ordering and the argument vector can be asserted. */
  readonly spawnProcess?: typeof spawn;
  readonly platform?: string;
}

/**
 * Ask the platform to open `url`.
 *
 * Resolves once the child has either failed to start or been let go. The child
 * is detached and `unref`'d so it cannot hold our event loop open, and its
 * stdio is ignored so a chatty launcher cannot write into the output a caller
 * is parsing — `xdg-open` in particular is a shell script that warns freely.
 */
export async function openBrowser(url: string, options: OpenOptions = {}): Promise<LaunchResult> {
  const platform = options.platform ?? process.platform;
  const spawnProcess = options.spawnProcess ?? spawn;
  const { command, args } = launcherFor(platform);

  return await new Promise<LaunchResult>((settle) => {
    let done = false;
    const finish = (result: LaunchResult): void => {
      if (done) return;
      done = true;
      settle(result);
    };

    try {
      // `--` before the URL, so a URL beginning with `-` cannot become an
      // option to the launcher. Ours is built from a loopback address and a
      // port and never could, which is exactly when a guard is cheap: the
      // module's claim is that this stays safe if a later story passes a URL it
      // did not construct, and without this that claim covered only shell
      // metacharacters, not argument injection.
      const child = spawnProcess(command, [...args, '--', url], {
        detached: true,
        stdio: 'ignore',
        shell: false,
        // Otherwise `rundll32` can flash a console window on Windows.
        windowsHide: true,
      });

      // `error` covers the case that matters most: no such command on this
      // platform, which is what a headless box looks like from here.
      child.on('error', (error: Error) => {
        // Not prefixed with the command: Node's own spawn error already names
        // it ("spawn xdg-open ENOENT"), and prefixing produced it twice. The
        // command is on the result for a caller that wants it separately.
        finish({ opened: false, command, reason: error.message });
      });

      // A launcher that *starts* is not a launcher that worked. `xdg-open`
      // exists on plenty of machines with no handler registered and exits 3
      // immediately; reporting that as success left the reader with no browser,
      // no message and no hint — while the matrix claimed a headless
      // environment is "reported once, ignored". So a fast non-zero exit is
      // treated as failure, and anything slower is treated as success, because
      // a launcher still running is a launcher that found something to do.
      child.on('exit', (code: number | null) => {
        if (code !== null && code !== 0) {
          finish({ opened: false, command, reason: `${command} exited ${String(code)}` });
        }
      });

      child.unref();

      // Long enough for an immediate refusal to arrive, short enough that the
      // reader is not kept waiting. Unref'd so it cannot hold the loop open.
      const settled = setTimeout(() => finish({ opened: true, command }), LAUNCH_GRACE_MS);
      settled.unref();
    } catch (error: unknown) {
      // `spawn` throws rather than emitting for some argument-level failures.
      finish({
        opened: false,
        command,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
