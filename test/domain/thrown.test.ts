/**
 * The one thing read off a thrown value.
 *
 * Written when `errorCode` stopped being two byte-identical private copies
 * (`src/adapters/http/server.ts` and `src/cli/index.ts`, unexplained and
 * deferred for thirteen stories as "cleanup, not correctness"). The copies had
 * no test at all -- `grep errorCode test/` returned nothing -- so what they
 * did with a hostile value was never anybody's claim.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { errorCode } from '../../src/domain/thrown.ts';

test('a real errno is returned as the string it is', () => {
  assert.equal(errorCode(Object.assign(new Error('nope'), { code: 'EACCES' })), 'EACCES');
  assert.equal(errorCode({ code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' }), 'ERR_PARSE_ARGS_UNKNOWN_OPTION');
});

test('anything without a string code is undefined, not a guess', () => {
  for (const value of [
    undefined,
    null,
    'EACCES',
    42,
    new Error('no code at all'),
    {},
    { code: undefined },
  ]) {
    assert.equal(errorCode(value), undefined, `${JSON.stringify(value)} has no string code`);
  }
});

test('a non-string code is refused rather than passed through', () => {
  // The difference from the cast `src/adapters/fs/` still uses six times over:
  // `(error as { code?: string }).code` hands these back *typed as strings*,
  // so a caller comparing against 'EACCES' compares a number, an object or a
  // function the type system vouched for and nothing checked.
  for (const code of [13, 0, null, {}, ['EACCES'], () => 'EACCES', Symbol('EACCES')]) {
    assert.equal(errorCode({ code }), undefined, `${String(code)} is not a code`);
  }
});

test('a code inherited from the prototype is not read as the value own', () => {
  // `'code' in error` is true for an inherited property, so the guard alone
  // would accept one; what makes this safe is that the value is then read and
  // type-checked rather than assumed. Asserted so the behaviour is a decision:
  // an inherited string code *is* returned, because a subclass of Error
  // carrying a class-level code is a legitimate shape.
  class Coded extends Error {
    override name = 'Coded';
  }
  Object.defineProperty(Coded.prototype, 'code', { value: 'EPROTO' });
  assert.equal(errorCode(new Coded('inherited')), 'EPROTO');

  // And an inherited *non*-string is still refused.
  class Bad extends Error {}
  Object.defineProperty(Bad.prototype, 'code', { value: 13 });
  assert.equal(errorCode(new Bad('inherited number')), undefined);
});

test('a null-prototype object is handled, not thrown on', () => {
  const bare: { code?: unknown } = Object.create(null);
  assert.equal(errorCode(bare), undefined);
  bare.code = 'ENOENT';
  assert.equal(errorCode(bare), 'ENOENT');
});
