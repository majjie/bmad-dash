/**
 * `digestOf`: the properties a derived identity has to have, over the pure
 * function in isolation.
 *
 * Determinism, structural sensitivity, the length-delimiting collision case
 * the module's own header names, primitive-type tagging, key-order
 * independence, the refusals, and one pinned input-to-digest vector so a
 * refactor of the mixing cannot silently move every id in the tool while every
 * relative assertion here still passes.
 *
 * What it is *fed* — a whole `InventoryView` — is `src/cli/index.ts`'s concern
 * and is asserted in `test/render/inventory.test.ts` and `test/server.test.ts`
 * instead, over the composed pass.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { digestOf } from '../../src/domain/snapshot.ts';

test('equal values always produce the same identity', () => {
  const value = { complete: true, rows: ['alpha', 'beta'], count: 2 };
  assert.equal(digestOf(value), digestOf({ complete: true, rows: ['alpha', 'beta'], count: 2 }));
  // And a fresh call over a different value is free to differ — this is not
  // asserting a constant.
  assert.notEqual(digestOf(value), digestOf({ complete: true, rows: ['alpha'], count: 1 }));
});

test('reordering an array changes the identity: order is content', () => {
  assert.notEqual(digestOf(['a', 'b']), digestOf(['b', 'a']));
});

test('reordering an object’s keys does not change the identity: order is not content', () => {
  // The other half of the row above, and the reason the walk sorts keys: two
  // objects holding the same fields *are* the same value, so two passes that
  // happened to build one in a different order must agree. Nothing in the view
  // is built twice in two orders today; the property is what makes that safe
  // rather than lucky.
  assert.equal(digestOf({ a: 1, b: 'two' }), digestOf({ b: 'two', a: 1 }));
});

test('a bare join would let these collide; the length delimiter must not', () => {
  // The header's own example: 'a' + 'bc' === 'ab' + 'c'. A digest that joined
  // its strings before hashing would be identical for both; folding each
  // string's length in ahead of its content is what tells them apart.
  assert.notEqual(digestOf(['a', 'bc']), digestOf(['ab', 'c']));
  // The same shape restated at a different part count, so the delimiter is
  // proven where the boundary is not merely moved but removed.
  assert.notEqual(digestOf(['abc']), digestOf(['a', 'bc']));
  assert.notEqual(digestOf(['abc']), digestOf(['ab', 'c']));
  // And an empty string is a value, not an absence.
  assert.notEqual(digestOf(['a', '']), digestOf(['a']));
  assert.notEqual(digestOf(['', 'a']), digestOf(['a']));
});

test('every primitive is tagged, so a number, a string and a boolean cannot coincide', () => {
  const digests = [
    digestOf(1),
    digestOf('1'),
    digestOf(true),
    digestOf(false),
    digestOf(0),
    digestOf(null),
    digestOf(undefined),
  ];
  assert.equal(new Set(digests).size, digests.length, 'two differently-typed values agreed');
  // Nested, because that is where it matters: a row holding the string '1'
  // renders differently from one holding the number 1.
  assert.notEqual(digestOf({ value: 1 }), digestOf({ value: '1' }));
  assert.notEqual(digestOf([1]), digestOf(['1']));
});

test('a field present and undefined differs from a field absent', () => {
  // `RowReadability.stage` and `ArtifactRow.interpretation` are both
  // `undefined` for real states the page renders differently, so the walk may
  // not treat "no such key" and "the key is undefined" as one value.
  assert.notEqual(digestOf({ stage: undefined }), digestOf({}));
  assert.notEqual(digestOf({ a: 1, b: undefined }), digestOf({ a: 1 }));
});

test('a container’s own shape is hashed, not only its contents', () => {
  const empties = [digestOf([]), digestOf({}), digestOf(''), digestOf(undefined), digestOf(null)];
  assert.equal(new Set(empties).size, empties.length, 'two different empty values agreed');
  assert.notEqual(digestOf({ 0: 'a' }), digestOf(['a']));
});

test('a key name is part of the identity, not only its value', () => {
  assert.notEqual(digestOf({ complete: true }), digestOf({ certain: true }));
});

test('an array is held to the same refusal discipline as an object', () => {
  // **The branch that was exempt, and every collision here was real.** An
  // array is digested as its length then its elements in order, so anything
  // the element walk cannot see is data that silently left the identity.
  // Measured before this: `Object.assign([1], { x: 'hidden' })` digested
  // identically to `[1]`, a `class Sub extends Array` digested identically to
  // the plain array it was not, and `[, 1]` digested identically to
  // `[undefined, 1]` — while the object branch was careful to keep
  // `{ a: undefined }` distinct from `{}`.
  assert.throws(() => digestOf(Object.assign([1], { x: 'hidden' })), /array property x/);
  class Sub extends Array {}
  const subclass = new Sub();
  subclass.push(1);
  assert.throws(() => digestOf(subclass), /Sub value/);
  // A hole, refused rather than tagged: nothing in this tool produces a sparse
  // array, and a tag would quietly imply the case was expected.
  assert.throws(() => digestOf([, 1]), /sparse array/);
  assert.match(digestOf([undefined, 1]), /^[0-9a-f]{16}$/, 'an explicit undefined is still fine');
  // An index accessor, refused for the reason an object's is.
  assert.throws(
    () =>
      digestOf(
        Object.defineProperty([1], 0, {
          get: () => 2,
          configurable: true,
        }),
      ),
    /accessor property 0/,
  );
  // And the plain array is untouched by all of it.
  assert.match(digestOf([1, 'two', false]), /^[0-9a-f]{16}$/);
});

test('a refusal never runs anything to describe what it refused', () => {
  // `value.constructor.name` was the obvious way to name the kind in the
  // message, and it resolves `constructor` up the prototype chain — so it ran
  // a getter, which this module promises never to do, and a `constructor`
  // getter that threw replaced the refusal with an unrelated error that no
  // caller could recognize as a refusal.
  let reads = 0;
  const watched = Object.create({
    get constructor(): never {
      reads += 1;
      throw new Error('a getter ran while a refusal was being described');
    },
  }) as object;
  Object.defineProperty(watched, 'kind', { value: new Map(), enumerable: true });

  assert.throws(() => digestOf(watched), /no canonical form/);
  assert.equal(reads, 0, 'the prototype’s constructor getter must not be invoked');
});

test('a symbol-keyed property is refused rather than dropped', () => {
  // Not a variation on the row below: this is the one refusal whose `throw`
  // could be replaced with `continue` and still typecheck, ship, and leave
  // every other assertion in this file green — the property would simply fall
  // out of the identity, silently.
  assert.throws(() => digestOf({ [Symbol('hidden')]: 'value' }), /symbol-keyed property/);
  assert.throws(() => digestOf({ visible: 1, [Symbol('hidden')]: 2 }), /symbol-keyed property/);
});

test('a non-enumerable own field is part of the identity', () => {
  // The walk uses `Reflect.ownKeys`, not `Object.keys`, and this is what pins
  // the difference: swapping in `Object.keys` leaves the accessor row below
  // green — a literal getter is enumerable — while every non-enumerable own
  // field drops out of the identity unnoticed.
  const hidden = Object.defineProperty({ a: 1 }, 'b', { value: 2, enumerable: false });
  assert.notEqual(digestOf(hidden), digestOf({ a: 1 }));
  assert.equal(digestOf(hidden), digestOf({ a: 1, b: 2 }), 'and it is the field, not its visibility');
});

test('the documented numeric cases are what the digest actually does', () => {
  // Three claims made in comments and asserted nowhere until now. `-0` folding
  // onto `0` is deliberate — the two are `===`, so nothing downstream can tell
  // them apart either — and the other two are the values `String` has a
  // canonical spelling for.
  assert.equal(digestOf(-0), digestOf(0), '-0 and 0 are one value here, on purpose');
  assert.equal(digestOf(NaN), digestOf(NaN), 'NaN digests, and digests stably');
  assert.notEqual(digestOf(NaN), digestOf('NaN'), 'and is not its own spelling as a string');
  assert.equal(digestOf(Infinity), digestOf(Infinity));
  assert.notEqual(digestOf(Infinity), digestOf(-Infinity));
  assert.notEqual(digestOf(Infinity), digestOf(Number.MAX_VALUE));
});

test('a bigint digests by its decimal form, which is reserved surface rather than a used case', () => {
  // No field of any view is a `bigint`; the branch exists because a `bigint`
  // has a canonical decimal form, so refusing one would be arbitrary where
  // refusing a `Map` is not. Pinned so it is neither dead code nor mistaken
  // for a case the tool relies on.
  assert.equal(digestOf(10n), digestOf(10n));
  assert.notEqual(digestOf(10n), digestOf(10), 'a bigint is tagged apart from a number');
  assert.notEqual(digestOf(10n), digestOf('10'), 'and apart from its own spelling');
});

test('a value that cannot be walked deterministically is refused, not digested as {}', () => {
  // The hole a structural walk could reintroduce: digesting a `Map` as `{}`
  // would silently drop everything in it, which is exactly the failure the
  // enumerated first iteration of this module had. Throwing is loud, and the
  // view contains none of these today.
  for (const value of [
    new Map([['a', 1]]),
    new Set(['a']),
    new Date(0),
    /re/,
    () => 'nope',
    Symbol('nope'),
  ]) {
    assert.throws(() => digestOf(value), /no canonical form/, `${String(value)} was digested`);
  }
  // Nested rather than at the root, because that is how one would actually
  // arrive — a field added to the view, not a hand-rolled call.
  assert.throws(() => digestOf({ groups: [{ seen: new Set(['a']) }] }), /no canonical form/);
  assert.throws(() => digestOf([[new Date(0)]]), /no canonical form/);
  // An accessor is refused rather than invoked: a getter may answer differently
  // each time it is read, which is the one thing a derived identity cannot be
  // built on.
  assert.throws(
    () =>
      digestOf({
        get shifting(): number {
          return 1;
        },
      }),
    /accessor property/,
  );
  // And a cycle, which has no canonical form and no terminating walk.
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  assert.throws(() => digestOf(cycle), /contains itself/);
});

test('a value reachable twice is shared, not a cycle', () => {
  // The domain hands out shared frozen singletons (`UNREAD`,
  // `LISTING_NOT_TEXT`) that a real view reaches many times over, so the cycle
  // guard has to track the *path* rather than everything it has seen. A guard
  // that tracked the latter would throw on every project with two unread
  // artifacts in it.
  const shared = { state: 'not-checked' };
  const digest = digestOf({ rows: [{ readability: shared }, { readability: shared }] });
  assert.match(digest, /^[0-9a-f]{16}$/);
  assert.equal(
    digest,
    digestOf({
      rows: [{ readability: { state: 'not-checked' } }, { readability: { state: 'not-checked' } }],
    }),
    'a shared reference must digest as the value it is, not as a back-reference',
  );
});

test('the identity is a fixed-width lowercase hex string', () => {
  // Not load-bearing for correctness — nothing parses it — but a header value
  // and cache key that varied in width or case would be a surprising thing to
  // do silently.
  for (const value of [[], {}, '', 'x', ['a', 'b', 'c'], { a: [1, false, null] }]) {
    assert.match(digestOf(value), /^[0-9a-f]{16}$/, `unexpected shape for ${JSON.stringify(value)}`);
  }
});

test('the digest is pinned to known vectors, so the mixing cannot move silently', () => {
  // Every other row here is *relative* — two inputs agree, or they differ —
  // and all of them would still pass if the mixing were rewritten into a
  // different hash entirely. Every id the tool has ever emitted would change
  // and nothing would say so. These are the absolute anchors; they may only be
  // updated by a change that deliberately re-keys every snapshot.
  assert.equal(digestOf(['a', 'bc']), 'c2b0b3bbc94e9856');
  assert.equal(digestOf(['ab', 'c']), 'd89df5472a8ed62c');
  assert.equal(digestOf([]), '4a33692d0fa73c67');
  assert.equal(digestOf({}), '3d8486029257d204');
  // One view-shaped value, so the vector covers the composite walk — nested
  // objects, arrays, a boolean, two numbers and a string key sort — rather
  // than only the flat cases above.
  assert.equal(
    digestOf({
      complete: true,
      artifactCount: 2,
      namesLeftOut: 0,
      aliases: [],
      groups: [{ family: 'prd', rows: [], notes: [] }],
    }),
    '783b378bbba83230',
  );
});
