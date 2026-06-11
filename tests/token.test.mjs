// tests/token.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToken, verifyToken, timingSafeEqualStr } from '../api/_lib/token.mjs';

const SECRET = 'test-secret';

test('un token créé est vérifiable', () => {
  const t = createToken(SECRET);
  assert.equal(verifyToken(t, SECRET), true);
});

test('un token falsifié est rejeté', () => {
  const t = createToken(SECRET);
  const [exp] = t.split('.');
  assert.equal(verifyToken(`${exp}.${'0'.repeat(64)}`, SECRET), false);
});

test('un token expiré est rejeté', () => {
  const t = createToken(SECRET, -1000);
  assert.equal(verifyToken(t, SECRET), false);
});

test('mauvais secret rejeté', () => {
  assert.equal(verifyToken(createToken(SECRET), 'autre'), false);
});

test('entrées malformées rejetées sans throw', () => {
  for (const bad of [null, undefined, '', 'abc', '123', '.sig', 'notanumber.sig']) {
    assert.equal(verifyToken(bad, SECRET), false);
  }
});

test('timingSafeEqualStr', () => {
  assert.equal(timingSafeEqualStr('abc', 'abc'), true);
  assert.equal(timingSafeEqualStr('abc', 'abd'), false);
  assert.equal(timingSafeEqualStr('abc', 'abcd'), false);
});
