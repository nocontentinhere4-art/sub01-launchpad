import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimalUnits, splitRewards, projection, holdingWeight, solText, REWARDS_POLICY } from '../src/rewards.js';

test('20/30/50 conserves every lamport, including rounding dust', () => {
  for (const total of [0n, 1n, 7n, 1000000000n, 90071992547409931234n]) {
    const s = splitRewards(total);
    assert.equal(s.holders + s.buyback + s.project, total);
    assert.equal(s.holders, total / 5n);
  }
  assert.deepEqual(splitRewards(1000000000n), { total: 1000000000n, holders: 200000000n, buyback: 300000000n, project: 500000000n });
});

test('creator fee, not trading volume, funds the allocation; no invented wallet share', () => {
  const p = projection({ volume: '1000', creatorPercent: '0.3', averageBalance: '100000', eligibleAverageBalance: '10000000' });
  assert.equal(p.total, 3000000000n);
  assert.equal(p.personal, 6000000n);
  assert.equal(solText(p.personal), '0.006 SOL');
  assert.equal(projection({ volume: '1000', creatorPercent: '0.3' }).personal, null);
  assert.equal(projection({ volume: '1', creatorPercent: '1', averageBalance: '2', eligibleAverageBalance: '1' }).personal, null);
  assert.equal(projection({ volume: '1', creatorPercent: '1', averageBalance: '0', eligibleAverageBalance: '1' }).personal, 0n);
});

test('reject missing, negative, malformed and excessively precise monetary inputs', () => {
  for (const v of ['', '-1', 'NaN', 'Infinity', '1e9', '1,000', '0.0000000001']) assert.equal(decimalUnits(v), null);
  assert.equal(projection({ volume: '1', creatorPercent: '100.0001' }), null);
  assert.equal(decimalUnits('0.000000001'), 1n);
});

test('existing holders accrue only after activation, never retroactively', () => {
  const cutoff = Date.parse(REWARDS_POLICY.startsAt);
  assert.equal(holdingWeight([{ from: cutoff - 10000, to: cutoff + 10000, balance: 100n }], cutoff - 20000, cutoff + 20000), 1000000n);
  assert.equal(holdingWeight([{ from: cutoff - 10000, to: cutoff, balance: 100n }], cutoff - 20000, cutoff), 0n);
  assert.equal(holdingWeight([{ from: cutoff, to: cutoff + 1000, balance: 100n }, { from: cutoff + 1000, to: cutoff + 2000, balance: 50n }], cutoff, cutoff + 2000), 150000n);
  assert.throws(() => holdingWeight([{ from: cutoff, to: cutoff + 2000, balance: 1n }, { from: cutoff + 1000, to: cutoff + 3000, balance: 1n }], cutoff, cutoff + 4000));
});
