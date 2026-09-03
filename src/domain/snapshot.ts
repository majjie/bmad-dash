/**
 * One scan, one identity — derived from the facts that scan recorded, never
 * minted.
 *
 * AD-17 says a rendered page belongs to exactly one snapshot, and before this
 * story that claim had **zero code presence**: no field on `InventoryView`, no
 * header on any response, so two pages could not be told apart. AD-3 calls the
 * snapshot *immutable*, which is a claim about the value; this module is the
 * claim about *which* value — two passes over an unchanged project must agree,
 * and any change must disagree.
 *
 * **Derived, not minted, and that is the whole design.** Every page load is
 * still a full pass (the per-request scan stays; real refresh is FR-37/FR-47,
 * Epic 3), so a counter, a clock or a request id would differ on every
 * response even when nothing on disk changed — and Story 2.1a's parse cache,
 * which this identity is the key for, would never hit. A digest of the
 * recorded facts is equal exactly when those facts are equal, which is the
 * property the cache needs.
 *
 * **FNV-1a, not `node:crypto`.** This is a cache key and a currency marker,
 * not a security boundary, so there is no adversarial reason to reach for a
 * cryptographic hash — and doing so would add a Node built-in this pure layer
 * does not otherwise need. `src/domain/` has zero outgoing imports (the frozen
 * purity constraint `test/architecture.test.ts` enforces), so the digest is
 * plain arithmetic over `string` and `number`, nothing else. Collisions are
 * negligible at this tool's scale: 64 bits over even 10^4 distinct snapshots
 * gives a birthday probability near 10^-11.
 *
 * **Length-delimited, not a bare join.** `digestOf(['a', 'bc'])` and
 * `digestOf(['ab', 'c'])` must not collide just because `'a' + 'bc' === 'ab' +
 * 'c'`, so each part's length is folded into the hash immediately before the
 * part itself — the length is part of what is hashed, not a separator
 * character that could itself appear in a part.
 */

/**
 * The offset basis and prime FNV-1a specifies for a 64-bit hash.
 *
 * Bespoke, not a copy of a general-purpose implementation: this hash consumes
 * whole UTF-16 code units in two byte-sized steps (see `mixCodeUnit`) rather
 * than raw bytes, because the domain layer has no encoder to reach for and
 * does not need one — the property this identity requires is determinism and
 * order-sensitivity over `string` input, not interoperability with FNV-1a
 * implementations elsewhere.
 */
const OFFSET_BASIS = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** One byte-sized value folded into the running hash. */
function mixByte(hash: bigint, byte: number): bigint {
  return ((hash ^ BigInt(byte)) * PRIME) & MASK_64;
}

/**
 * One UTF-16 code unit, as two mixed bytes (high byte first).
 *
 * Splitting keeps every step of the mix operating on an 8-bit value, which is
 * what makes this recognizably an FNV-1a variant rather than an unrelated
 * rolling hash reusing its constants.
 */
function mixCodeUnit(hash: bigint, unit: number): bigint {
  return mixByte(mixByte(hash, (unit >>> 8) & 0xff), unit & 0xff);
}

/**
 * A part's length, as four mixed bytes (big-endian), folded in **before** the
 * part's own content.
 *
 * This is the length-delimiting: the length is data the hash consumes, not a
 * separator that could collide with a character inside a part. `>>> 24`
 * caps out at 4,294,967,295 code units, which nothing this tool digests can
 * approach.
 */
function mixLength(hash: bigint, length: number): bigint {
  return mixByte(
    mixByte(mixByte(mixByte(hash, (length >>> 24) & 0xff), (length >>> 16) & 0xff), (length >>> 8) & 0xff),
    length & 0xff,
  );
}

/** One part: its length, then its content, one code unit at a time. */
function mixPart(hash: bigint, part: string): bigint {
  let next = mixLength(hash, part.length);
  for (let index = 0; index < part.length; index += 1) {
    next = mixCodeUnit(next, part.charCodeAt(index));
  }
  return next;
}

/**
 * A snapshot's identity: opaque, stable for the facts it was derived from, and
 * nothing else.
 *
 * A branded string rather than a bare one, on the same reasoning
 * `src/adapters/fs/paths.ts` brands `CanonicalPath`: `digestOf` is the only
 * constructor, so a caller cannot pass an arbitrary string where an identity
 * derived from recorded facts is required and have it typecheck.
 */
export type SnapshotId = string & { readonly __snapshotId: unique symbol };

/**
 * Digest `parts`, in order, into one `SnapshotId`.
 *
 * Deterministic over its input and nothing else — no clock, no counter, no
 * request id (the spine's own "never" list) — so two calls with the same
 * parts in the same order produce the same identity, a reordering produces a
 * different one, and the split between two adjacent parts is part of what is
 * hashed rather than free to shift without changing the result.
 */
export function digestOf(parts: readonly string[]): SnapshotId {
  let hash = OFFSET_BASIS;
  for (const part of parts) hash = mixPart(hash, part);
  return hash.toString(16).padStart(16, '0') as SnapshotId;
}
