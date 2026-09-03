/**
 * What can be read off a thrown value without trusting it.
 *
 * A `catch` binds `unknown`, and the one thing this project repeatedly needs
 * from a thrown value is the platform's own error code: `ERR_PARSE_ARGS_*` to
 * tell an unknown flag from a bad value, `EADDRINUSE` to tell a retryable bind
 * from a fatal one, `EACCES` and `ENOENT` to tell why a read failed. Every
 * caller then maps that string into its own closed vocabulary, which is where
 * the meaning lives; this module only does the untrusting.
 *
 * **Why the pure layer.** `errorCode` was written twice, byte-identical and
 * unexplained, in `src/adapters/http/server.ts` and `src/cli/index.ts`, and
 * recorded as "cleanup, not correctness" for thirteen stories. The composition
 * root may import anything, but the HTTP adapter may import only domain,
 * render, and the path vocabulary — so the domain is the one layer both can
 * reach, and it is also the only one `src/adapters/fs/` can reach, which is
 * where the six remaining narrowings live. Nothing here imports anything, so
 * the layer's frozen constraint is satisfied by construction rather than by
 * permission.
 *
 * It is deliberately *not* in `signal.ts` beside the four states: that module
 * is a vocabulary, and this is the primitive a vocabulary is built from.
 */

/**
 * The `code` of a thrown value, when it has a string one.
 *
 * Checked rather than asserted, which is the whole point. `src/adapters/fs/`
 * spells this six times as `(error as { code?: string }).code` — a cast that
 * *claims* a string without looking, so a caller comparing it to `'EACCES'`
 * is comparing against a value the type system has vouched for and nothing
 * has checked. `'code' in error` guards a null prototype and a bare object
 * alike, and the `typeof` narrows what the cast only promised.
 */
export function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}
