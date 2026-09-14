import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { trackHealth } from '../src/watchdog.js';
import { validateOpportunity, filterValidOpportunities } from '../src/opportunity-validation.js';

const STATE_FILE = 'data/health-state.json';
const COMPONENT = 'test-quiet';
const original = fs.existsSync(STATE_FILE) ? fs.readFileSync(STATE_FILE, 'utf8') : null;

test.after(() => {
  if (original !== null) fs.writeFileSync(STATE_FILE, original);
  else if (fs.existsSync(STATE_FILE)) fs.rmSync(STATE_FILE);
});

test('watchdog: transient failures do not count toward alerting', () => {
  trackHealth(COMPONENT, false, 'Network timeout ECONNRESET', ''); // baseline
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))[COMPONENT];
  assert.equal(state.fails, 0, 'transient failure must not increment counter');
});

test('watchdog: fewer than 3 failures never alerts (no false positive)', () => {
  // state is baseline healthy=false from previous test; reset by "recovery"
  trackHealth(COMPONENT, true, 'restored', '');
  trackHealth(COMPONENT, false, 'disk full', '');
  trackHealth(COMPONENT, false, 'disk full', '');
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))[COMPONENT];
  assert.equal(state.fails, 2);
  assert.equal(state.alerted, undefined, 'must not alert before 3 consecutive failures');
});

test('watchdog: alert fires only on 3rd consecutive real failure', () => {
  trackHealth(COMPONENT, false, 'disk full', '');
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))[COMPONENT];
  assert.equal(state.fails, 3);
  assert.equal(state.alerted, true, 'alert must be flagged after 3 consecutive failures');
});

test('watchdog: recovery after alert resets counter', () => {
  trackHealth(COMPONENT, true, 'restored', '');
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))[COMPONENT];
  assert.equal(state.fails, 0);
  assert.equal(state.healthy, true);
});

test('opportunity: $0 reward is rejected', () => {
  const r = validateOpportunity({ title: 'Test', reward: 0, url: 'https://example.com/x', description: 'long enough description '.repeat(5) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'zero_reward');
});

test('opportunity: missing URL is rejected', () => {
  const r = validateOpportunity({ title: 'Test', reward: 100, url: '', description: 'long enough description '.repeat(5) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing_url');
});

test('opportunity: invalid URL protocol is rejected', () => {
  const r = validateOpportunity({ title: 'Test', reward: 100, url: 'ftp://example.com', description: 'long enough description '.repeat(5) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_url');
});

test('opportunity: short description is rejected', () => {
  const r = validateOpportunity({ title: 'Test', reward: 100, url: 'https://example.com/x', description: 'short' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'short_description');
});

test('opportunity: valid opportunity passes', () => {
  const r = validateOpportunity({
    title: 'Smart Contract Audit',
    reward: 500,
    url: 'https://immunefi.com/bounty/smart',
    description: 'A detailed real opportunity with payout within days. '.repeat(4)
  });
  assert.equal(r.ok, true);
});

test('opportunity: filterValidOpportunities separates valid from rejected', () => {
  const { valid, rejected } = filterValidOpportunities([
    { title: 'A', reward: 0, url: 'https://x.com', description: 'long '.repeat(20) },
    { title: 'B', reward: 300, url: 'https://y.com', description: 'real description '.repeat(10) },
    { title: 'C', reward: 50, url: '', description: 'long '.repeat(20) }
  ]);
  assert.equal(valid.length, 1);
  assert.equal(rejected.length, 2);
  assert.equal(valid[0].title, 'B');
});
