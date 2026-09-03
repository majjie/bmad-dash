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
 * **Structural, not an enumerated list of inputs.** `digestOf` walks whatever
 * value it is handed rather than taking a chosen tuple of fields. The first
 * iteration of this module took a `readonly string[]` its caller assembled
 * from three per-row fields plus three scalars, and argued the rest of the view
 * never reached the page; that argument was false on six counts and no test
 * enforced it — reducing the whole digest body to the artifact count left the
 * suite green. A structural walk makes the property true by construction
 * instead: the page is a pure function of the view, so digesting *all* of the
 * view means any rendering difference implies an identity difference, and a
 * field added to the view later needs no audit here to be covered.
 *
 * **Canonical, so the walk is a function of the value and not of its
 * construction.** Object keys are visited in sorted order, because two objects
 * with the same fields written in a different order are the same value. Arrays
 * are visited in order, because their order *is* content. Every primitive is
 * tagged by type, so `1`, `'1'` and `true` cannot coincide. Every string is
 * length-delimited, so `['a', 'bc']` and `['ab', 'c']` cannot collide the way
 * they would on a bare concatenation — the length is data the hash consumes,
 * not a separator character that could itself appear in a string.
 *
 * **What it refuses.** A `Map`, a `Set`, a `Date`, a function, a symbol, an
 * accessor property or a cycle has no canonical form here. Digesting one as
 * `{}` would silently drop it, which is the same hole the enumerated version
 * had, reached through the structural walk instead — so this throws. The view
 * contains none of them today, and a throw is how the next one announces
 * itself rather than quietly falling out of the identity.
 *
 * **FNV-1a, not `node:crypto`.** This is a cache key and a currency marker,
 * not a security boundary, so there is no adversarial reason to reach for a
 * cryptographic hash — and doing so would add a Node built-in this pure layer
 * does not otherwise need. `src/domain/` has zero outgoing imports (the frozen
 * purity constraint `test/architecture.test.ts` enforces), so the digest is
 * plain arithmetic. Collisions are negligible at this tool's scale: over 64
 * bits, even 10^4 distinct snapshots give a birthday probability of about
 * 2.7 x 10^-12.
 */

/**
 * The offset basis and prime FNV-1a specifies for a 64-bit hash.
 *
 * Bespoke, not a copy of a general-purpose implementation, and not
 * interoperable with one: this hash consumes whole UTF-16 code units in two
 * byte-sized steps (see `mixCodeUnit`) rather than UTF-8 bytes, because the
 * domain layer has no encoder to reach for and does not need one. The property
 * this identity requires is determinism and structural sensitivity over the
 * values this tool builds, not agreement with FNV-1a implementations
 * elsewhere.
 */
const OFFSET_BASIS = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * One tag byte per kind of value, so the *shape* of a value is hashed and not
 * only its rendering as text.
 *
 * Distinct constants rather than characters folded into a string: this is what
 * stops `1` and `'1'` agreeing, and stops an empty array, an empty object and
 * an absent value being three spellings of one digest. `false` and `true` get
 * a tag each instead of a tag plus a payload byte, which is the same thing in
 * one step fewer.
 */
const TAG_UNDEFINED = 0x01;
const TAG_NULL = 0x02;
const TAG_FALSE = 0x03;
const TAG_TRUE = 0x04;
const TAG_NUMBER = 0x05;
const TAG_BIGINT = 0x06;
const TAG_STRING = 0x07;
const TAG_ARRAY = 0x08;
const TAG_OBJECT = 0x09;
const TAG_KEY = 0x0a;

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
 * A count, as four mixed bytes (big-endian).
 *
 * Folded in **before** the thing it counts — a string's code units, an array's
 * elements, an object's keys — which is the length-delimiting: the count is
 * data the hash consumes, not a separator that could collide with content.
 * `>>> 24` caps out at 4,294,967,295, which nothing this tool digests can
 * approach.
 */
function mixCount(hash: bigint, count: number): bigint {
  return mixByte(
    mixByte(
      mixByte(mixByte(hash, (count >>> 24) & 0xff), (count >>> 16) & 0xff),
      (count >>> 8) & 0xff,
    ),
    count & 0xff,
  );
}

/** One string: its length, then its content, one code unit at a time. */
function mixText(hash: bigint, text: string): bigint {
  let next = mixCount(hash, text.length);
  for (let index = 0; index < text.length; index += 1) {
    next = mixCodeUnit(next, text.charCodeAt(index));
  }
  return next;
}

/**
 * Whether `value` is an object this walk can canonicalize: a plain object or
 * an array, and nothing else.
 *
 * Prototype-checked rather than checked against a list of built-ins, so it
 * refuses a `Map`, a `Set`, a `Date`, a `RegExp`, an `Error` and any class
 * instance by the same rule — including the ones nobody has written yet.
 */
function isWalkableObject(value: object): boolean {
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/** What a refusal says, so every one of them says the same thing. */
function unwalkable(description: string): Error {
  return new Error(
    `a snapshot identity cannot be derived from ${description}: it has no canonical form`,
  );
}

/**
 * Fold `value` into `hash`, canonically.
 *
 * `ancestors` is the *path* currently being walked, not everything seen: a
 * value reachable twice by two different routes is a shared reference and is
 * perfectly walkable — the domain hands out shared frozen singletons on
 * purpose — while a value reachable from itself is a cycle, which has no
 * canonical form and no terminating walk. So entries are removed on the way
 * back out.
 */
function mixValue(hash: bigint, value: unknown, ancestors: Set<object>): bigint {
  if (value === undefined) return mixByte(hash, TAG_UNDEFINED);
  if (value === null) return mixByte(hash, TAG_NULL);

  switch (typeof value) {
    case 'boolean':
      return mixByte(hash, value ? TAG_TRUE : TAG_FALSE);
    case 'number':
      // `String` is the canonical decimal form JavaScript already agrees on,
      // including `NaN` and `Infinity`. It maps `-0` onto `'0'`, which is
      // correct here: the two are `===`, so nothing downstream can tell them
      // apart either.
      return mixText(mixByte(hash, TAG_NUMBER), String(value));
    case 'bigint':
      return mixText(mixByte(hash, TAG_BIGINT), value.toString());
    case 'string':
      return mixText(mixByte(hash, TAG_STRING), value);
    case 'function':
      throw unwalkable('a function');
    case 'symbol':
      throw unwalkable('a symbol');
    default:
      break;
  }

  const object = value as object;
  if (!isWalkableObject(object)) {
    throw unwalkable(`a ${object.constructor?.name ?? 'non-plain'} value`);
  }
  if (ancestors.has(object)) throw unwalkable('a value that contains itself');
  ancestors.add(object);
  try {
    if (Array.isArray(object)) {
      // Length first, then the elements in order: order is content for an
      // array, so this is the one place the walk deliberately does not sort.
      let next = mixCount(mixByte(hash, TAG_ARRAY), object.length);
      for (const element of object) next = mixValue(next, element, ancestors);
      return next;
    }

    // Own keys rather than enumerable ones, and refusing an accessor rather
    // than invoking it: a getter can return a different value each time it is
    // read, which is exactly what a derived identity may not be built on. A
    // symbol-keyed property is refused for the same reason `mixValue` refuses
    // a symbol value — there is no canonical ordering of symbols, so the key
    // could only be dropped.
    const keys: string[] = [];
    for (const key of Reflect.ownKeys(object)) {
      if (typeof key === 'symbol') throw unwalkable('a symbol-keyed property');
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor !== undefined && !('value' in descriptor)) {
        throw unwalkable(`the accessor property ${key}`);
      }
      keys.push(key);
    }
    // Sorted, so an object is digested as the set of fields it holds rather
    // than as the order somebody happened to write them in.
    keys.sort();
    let next = mixCount(mixByte(hash, TAG_OBJECT), keys.length);
    for (const key of keys) {
      next = mixText(mixByte(next, TAG_KEY), key);
      next = mixValue(next, (object as Record<string, unknown>)[key], ancestors);
    }
    return next;
  } finally {
    ancestors.delete(object);
  }
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
 * Digest `value` structurally into one `SnapshotId`.
 *
 * Deterministic over its input and nothing else — no clock, no counter, no
 * request id (the spine's own "never" list) — so two calls over equal values
 * produce the same identity and any structural difference produces a different
 * one. Throws rather than digest a value it cannot canonicalize; see this
 * module's header for what those are and why silence would be worse.
 */
export function digestOf(value: unknown): SnapshotId {
  const hash = mixValue(OFFSET_BASIS, value, new Set<object>());
  return hash.toString(16).padStart(16, '0') as SnapshotId;
}
