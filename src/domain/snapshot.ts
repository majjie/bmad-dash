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
 * enforced it — reducing the whole digest body to the artifact count changed
 * no test's outcome at all. A structural walk makes the property true by
 * construction instead: `renderPage` is a pure function of the project root and
 * the view, so digesting *all* of both means any rendering difference implies
 * an identity difference, and a field added to the view later needs no audit
 * here to be covered.
 *
 * **The root is half of that, and leaving it out was a real defect.**
 * `renderPage(root, view)` takes the root as a *second argument* and renders it
 * as the project's name and path (`src/render/chrome.ts`), so a digest over the
 * view alone gave two projects at different paths with identical inventories
 * one identity for two visibly different pages. `src/cli/index.ts`'s
 * `snapshotIdOf` folds in the root the pass recorded; what this module
 * guarantees is only that everything it is handed is covered.
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
 *
 * Four bytes, so a count of 2^32 or more is not representable and would fold in
 * as its low 32 bits. That is a limit rather than a behaviour to rely on:
 * reaching it needs a single string or array of over four billion entries,
 * which exceeds what V8 will allocate for either, so no input this tool can
 * hold gets near it. Nothing is asserted about the wrap because nothing may
 * depend on it.
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
 * Whether `value` is an object this walk can canonicalize: a plain object or a
 * plain array, and nothing else.
 *
 * Prototype-checked rather than checked against a list of built-ins, so it
 * refuses a `Map`, a `Set`, a `Date`, a `RegExp`, an `Error` and any class
 * instance by the same rule — including the ones nobody has written yet, and
 * including an `Array` subclass. `Array.isArray` is deliberately **not** the
 * array test: it answers true for `class Sub extends Array`, whose own
 * behaviour a walk over indices cannot see, so an earlier version of this
 * function let a subclass digest identically to the plain array it was not.
 */
function isWalkableObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === Array.prototype || prototype === null;
}

/** What a refusal says, so every one of them says the same thing. */
function unwalkable(description: string): Error {
  return new Error(
    `a snapshot identity cannot be derived from ${description}: it has no canonical form`,
  );
}

/**
 * Name `value`'s kind for a refusal message, **without running anything**.
 *
 * `value.constructor.name` was the obvious spelling and it is wrong here:
 * `constructor` resolves up the prototype chain, so reading it runs a getter
 * defined there — and this module's own header promises the walk never invokes
 * an accessor. Worse, a `constructor` getter that threw replaced the refusal
 * with an unrelated error, which is a refusal the caller cannot recognize. So
 * only the immediate prototype's own *data* descriptor is read, and anything
 * else falls back to a fixed phrase.
 */
function describeKind(value: object): string {
  // A `null` prototype cannot arrive here — `isWalkableObject` accepts one, so
  // a null-prototype object is walked rather than refused — but it is folded
  // into the fallback rather than given a branch of its own, which would read
  // as a state that happens.
  const prototype = Object.getPrototypeOf(value) as object | null;
  const descriptor =
    prototype === null ? undefined : Object.getOwnPropertyDescriptor(prototype, 'constructor');
  const constructor = descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
  const name = typeof constructor === 'function' ? constructor.name : '';
  return name === '' ? 'a non-plain value' : `a ${name} value`;
}

/**
 * One own key of a plain object or array, refused if it is anything the walk
 * would have to drop or invoke.
 *
 * Both container branches route through this, which is the point: the object
 * branch had this discipline and the array branch did not, so an array's extra
 * own properties, its index accessors and its holes were all silently absent
 * from the identity — the same silent-drop hole the header says this module
 * closes, reached one branch over.
 */
function assertWalkableKey(container: object, key: string | symbol): asserts key is string {
  if (typeof key === 'symbol') throw unwalkable('a symbol-keyed property');
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (descriptor !== undefined && !('value' in descriptor)) {
    throw unwalkable(`the accessor property ${key}`);
  }
}

/**
 * Refuse an array that holds anything the element walk cannot see.
 *
 * An array is digested as `length` then its elements in order, so any own key
 * that is not an index — and any index with no own key at all — is data the
 * walk would drop. Both were verified to collide before this existed:
 * `Object.assign([1], { x: 'hidden' })` digested as `[1]`, and `[, 1]` digested
 * as `[undefined, 1]` even though the object branch is careful to keep
 * `{ a: undefined }` distinct from `{}`.
 *
 * A hole is refused rather than given a tag of its own. A tag would be defensible,
 * but nothing in this tool produces a sparse array, and a refusal says so where a
 * fifth primitive tag would quietly imply the case was expected.
 */
function assertPlainArray(array: readonly unknown[]): void {
  let indices = 0;
  for (const key of Reflect.ownKeys(array)) {
    if (key === 'length') continue;
    assertWalkableKey(array, key);
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= array.length) {
      throw unwalkable(`the array property ${key}`);
    }
    indices += 1;
  }
  if (indices !== array.length) throw unwalkable('a sparse array');
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
      // **Forward-looking reserved surface**, and stated as such rather than
      // left to be read as a covered case: no field of any view is a `bigint`
      // today, so nothing in the tool reaches this. It is here because a
      // `bigint` *has* a canonical decimal form, so refusing one would be
      // arbitrary where refusing a `Map` is not. `test/domain/snapshot.test.ts`
      // pins it so the branch is not dead code either.
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
  if (!isWalkableObject(object)) throw unwalkable(describeKind(object));
  if (ancestors.has(object)) throw unwalkable('a value that contains itself');
  ancestors.add(object);
  try {
    if (Array.isArray(object)) {
      assertPlainArray(object);
      // Length first, then the elements in order: order is content for an
      // array, so this is the one place the walk deliberately does not sort.
      let next = mixCount(mixByte(hash, TAG_ARRAY), object.length);
      for (const element of object) next = mixValue(next, element, ancestors);
      return next;
    }

    // Own keys rather than enumerable ones, and refusing an accessor rather
    // than invoking it: a getter can return a different value each time it is
    // read, which is exactly what a derived identity may not be built on. A
    // non-enumerable own field is walked for the mirror-image reason — it is
    // part of the value, so leaving it out would leave it out of the identity.
    const keys: string[] = [];
    for (const key of Reflect.ownKeys(object)) {
      assertWalkableKey(object, key);
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
