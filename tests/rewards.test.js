import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimalUnits, splitRewards, projection, solText, REWARDS_POLICY } from '../src/rewards.js';

test('20/30/50 conserves every lamport, including rounding dust', () => {
  for (const total of [0n, 1n, 7n, 1000000000n, 90071992547409931234n]) {
    const s = splitRewards(total);
    assert.equal(s.holders + s.buyback + s.project, total);
    assert.equal(s.holders, total / 5n);
  }
  assert.deepEqual(splitRewards(1000000000n), { total: 1000000000n, holders: 200000000n, buyback: 300000000n, project: 500000000n });
});

test('creator fee, not trading volume, funds the allocation; no invented wallet share', () => {
  const p = projection({ volume: '1000', creatorPercent: '0.3', snapshotBalance: '100000', eligibleSnapshotBalance: '10000000' });
  assert.equal(p.total, 3000000000n);
  assert.equal(p.personal, 6000000n);
  assert.equal(solText(p.personal), '0.006 SOL');
  assert.equal(projection({ volume: '1000', creatorPercent: '0.3' }).personal, null);
  assert.equal(projection({ volume: '1', creatorPercent: '1', snapshotBalance: '2', eligibleSnapshotBalance: '1' }).personal, null);
  assert.equal(projection({ volume: '1', creatorPercent: '1', snapshotBalance: '0', eligibleSnapshotBalance: '1' }).personal, 0n);
});

test('reject missing, negative, malformed and excessively precise monetary inputs', () => {
  for (const v of ['', '-1', 'NaN', 'Infinity', '1e9', '1,000', '0.0000000001']) assert.equal(decimalUnits(v), null);
  assert.equal(projection({ volume: '1', creatorPercent: '100.0001' }), null);
  assert.equal(decimalUnits('0.000000001'), 1n);
});

test('policy uses fixed snapshots from the adopted date', () => {
  assert.equal(REWARDS_POLICY.weighting, 'snapshot-balance');
  assert.equal(REWARDS_POLICY.startsAt, '2026-10-13T22:00:00Z');
});
