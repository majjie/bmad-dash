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
