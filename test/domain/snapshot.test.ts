/**
 * `digestOf`: determinism, order sensitivity, the length-delimiting collision
 * case its own header names, and the empty-input case.
 *
 * Everything here is a property of the pure function in isolation. What it
 * is *fed* — a view's rows, in group order, plus its scalar facts — is
 * `src/cli/index.ts`'s concern and is asserted in `test/render/inventory.test.ts`
 * and `test/server.test.ts` instead, over the composed pass.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { digestOf } from '../../src/domain/snapshot.ts';

test('the same parts in the same order always produce the same identity', () => {
  const a = digestOf(['alpha', 'beta', 'gamma']);
  const b = digestOf(['alpha', 'beta', 'gamma']);
  assert.equal(a, b);
  // And a fresh call with unrelated parts is free to differ — this is not
  // asserting a constant.
  assert.notEqual(a, digestOf(['alpha', 'beta', 'delta']));
});

test('reordering the same parts changes the identity', () => {
  assert.notEqual(digestOf(['a', 'b']), digestOf(['b', 'a']));
});

test('a bare join would let these collide; the length delimiter must not', () => {
  // The header's own example: 'a' + 'bc' === 'ab' + 'c'. A digest that joined
  // the parts before hashing would be identical for both; folding each part's
  // length in ahead of its content is what tells them apart.
  assert.notEqual(digestOf(['a', 'bc']), digestOf(['ab', 'c']));
});

test('one long part differs from two parts whose concatenation matches it', () => {
  // The same collision shape restated without a natural split point, so the
  // delimiter is proven for a part count that differs too, not only a
  // rearranged boundary between two.
  assert.notEqual(digestOf(['abc']), digestOf(['a', 'bc']));
  assert.notEqual(digestOf(['abc']), digestOf(['ab', 'c']));
});

test('an empty part is distinct from no part at all', () => {
  assert.notEqual(digestOf(['a', '']), digestOf(['a']));
  assert.notEqual(digestOf(['', 'a']), digestOf(['a']));
});

test('empty input has an identity, and it is stable', () => {
  const first = digestOf([]);
  const second = digestOf([]);
  assert.equal(typeof first, 'string');
  assert.notEqual(first, '');
  assert.equal(first, second);
  // And it does not coincide with a single empty part, which is a different
  // input by the row above.
  assert.notEqual(first, digestOf(['']));
});

test('the identity is a fixed-width lowercase hex string', () => {
  // Not load-bearing for correctness — nothing consumes the shape — but a
  // format that varied in width or case would be a surprising thing for a
  // header value or a cache key to do silently.
  for (const parts of [[], [''], ['x'], ['a', 'b', 'c']]) {
    assert.match(digestOf(parts), /^[0-9a-f]{16}$/, `unexpected shape for ${JSON.stringify(parts)}`);
  }
});
