import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyError, runWithHealing } from '../src/self-healing.js';

test('classifyError: transient network errors', () => {
  assert.equal(classifyError({ message: 'fetch failed: ECONNRESET' }), 'transient');
  assert.equal(classifyError({ status: 502 }), 'transient');
  assert.equal(classifyError({ message: 'Request timed out' }), 'transient');
});

test('classifyError: permanent errors', () => {
  assert.equal(classifyError({ status: 404 }), 'permanent');
  assert.equal(classifyError({ status: 401 }), 'permanent');
  assert.equal(classifyError({ message: 'Not Found' }), 'permanent');
});

test('classifyError: environmental (CAPTCHA/WAF)', () => {
  assert.equal(classifyError({ message: 'Human Verification required (AWS WAF)' }), 'environmental');
  assert.equal(classifyError({ message: 'Please complete Turnstile' }), 'environmental');
});

test('runWithHealing: succeeds on retry after transient failure', async () => {
  let calls = 0;
  const result = await runWithHealing(async () => {
    calls += 1;
    if (calls < 3) throw new Error('ECONNRESET timeout');
    return 'done';
  }, { scope: 'test-transient' });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
  assert.equal(result.result, 'done');
});

test('runWithHealing: permanent failure moves to fallback', async () => {
  let fallbackCalled = 0;
  const result = await runWithHealing(async () => {
    throw Object.assign(new Error('Not Found'), { status: 404 });
  }, {
    scope: 'test-permanent',
    onFallback: () => { fallbackCalled += 1; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'permanent');
  assert.equal(fallbackCalled, 1);
});
