import test from 'node:test';
import assert from 'node:assert/strict';
import { hasValidReward, validateOpportunity } from '../src/opportunity-validation.js';

test('hasValidReward: rejects 0, N/A, null, undefined, empty, "0", non-numeric', () => {
  assert.equal(hasValidReward(0), false);
  assert.equal(hasValidReward('N/A'), false);
  assert.equal(hasValidReward('n/a'), false);
  assert.equal(hasValidReward(null), false);
  assert.equal(hasValidReward(undefined), false);
  assert.equal(hasValidReward(''), false);
  assert.equal(hasValidReward('0'), false);
  assert.equal(hasValidReward('0.00'), false);
  assert.equal(hasValidReward('unknown'), false);
  assert.equal(hasValidReward('Free'), false);
});

test('hasValidReward: accepts numeric rewards', () => {
  assert.equal(hasValidReward(150), true);
  assert.equal(hasValidReward('250'), true);
  assert.equal(hasValidReward('$500'), true);   // contains digit
  assert.equal(hasValidReward('1,000 USDT'), true);
  assert.equal(hasValidReward(0.5), true);      // >0 valid
});

test('validateOpportunity: reward "N/A" rejected even with valid url+desc', () => {
  const r = validateOpportunity({
    title: 'Test', reward: 'N/A',
    url: 'https://example.com/x',
    description: 'long enough description '.repeat(10)
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'zero_reward');
});

test('validateOpportunity: reward "0" string rejected', () => {
  const r = validateOpportunity({
    title: 'Test', reward: '0',
    url: 'https://example.com/x',
    description: 'long enough description '.repeat(10)
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'zero_reward');
});

test('validateOpportunity: null reward rejected', () => {
  const r = validateOpportunity({
    title: 'Test', reward: null,
    url: 'https://example.com/x',
    description: 'long enough description '.repeat(10)
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'zero_reward');
});

test('validateOpportunity: valid numeric reward passes', () => {
  const r = validateOpportunity({
    title: 'Test', reward: '$1,200 USDT',
    url: 'https://example.com/x',
    description: 'long enough description '.repeat(10)
  });
  assert.equal(r.ok, true);
});
