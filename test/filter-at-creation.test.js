import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCreateOpportunity, hasValidReward } from '../src/opportunity-validation.js';

test('shouldCreateOpportunity: rejects $0', () => {
  assert.equal(shouldCreateOpportunity({ reward: 0, link: 'https://x.com/a', description: 'long enough description '.repeat(10) }), false);
  assert.equal(shouldCreateOpportunity({ reward: '0', link: 'https://x.com/a', description: 'long enough description '.repeat(10) }), false);
  assert.equal(shouldCreateOpportunity({ reward: 'N/A', link: 'https://x.com/a', description: 'long enough description '.repeat(10) }), false);
  assert.equal(shouldCreateOpportunity({ reward: 'Free', link: 'https://x.com/a', description: 'long enough description '.repeat(10) }), false);
});

test('shouldCreateOpportunity: rejects missing/invalid link', () => {
  assert.equal(shouldCreateOpportunity({ reward: 500, link: '', description: 'long enough description '.repeat(10) }), false);
  assert.equal(shouldCreateOpportunity({ reward: 500, link: 'ftp://x.com', description: 'long enough description '.repeat(10) }), false);
});

test('shouldCreateOpportunity: rejects short description', () => {
  assert.equal(shouldCreateOpportunity({ reward: 500, link: 'https://x.com/a', description: 'short' }), false);
});

test('shouldCreateOpportunity: accepts fully valid opportunity', () => {
  assert.equal(shouldCreateOpportunity({
    reward: '$1,200 USDT',
    link: 'https://immunefi.com/bounty/smart',
    description: 'A real detailed opportunity description that is long enough. '.repeat(5)
  }), true);
});

test('shouldCreateOpportunity: null reward rejected', () => {
  assert.equal(shouldCreateOpportunity({ reward: null, link: 'https://x.com/a', description: 'long enough description '.repeat(10) }), false);
  assert.equal(shouldCreateOpportunity({ reward: undefined, link: 'https://x.com/a', description: 'long enough description '.repeat(10) }), false);
});

test('hasValidReward remains strict', () => {
  assert.equal(hasValidReward(0), false);
  assert.equal(hasValidReward('N/A'), false);
  assert.equal(hasValidReward('250'), true);
});
