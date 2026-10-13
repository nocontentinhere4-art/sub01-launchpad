// SUB-01 policy requested by the owner. No transfers or accounting live in this client.
export const REWARDS_POLICY = Object.freeze({
  mint: '6WCtKQfkWurd77tCCAYWuL5TwyAvuovTzworfnfupump',
  startsAt: '2026-10-13T22:12:32Z',
  holderBps: 2000, burnBps: 3000, projectBps: 5000,
  weighting: 'time-weighted-balance', status: 'proposed',
});

export function decimalUnits(value, decimals = 9) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) || text.length > 40) return null;
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) return null;
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

export function splitRewards(lamports) {
  if (typeof lamports !== 'bigint' || lamports < 0n) throw new RangeError('Invalid creator rewards');
  const holders = lamports * 2000n / 10000n;
  const buyback = lamports * 3000n / 10000n;
  return { total: lamports, holders, buyback, project: lamports - holders - buyback };
}

export function projection({ volume, creatorPercent, averageBalance, eligibleAverageBalance }) {
  const v = decimalUnits(volume), rate = decimalUnits(creatorPercent, 4);
  if (v === null || rate === null || rate > 1000000n) return null;
  const split = splitRewards(v * rate / 1000000n);
  const balance = decimalUnits(averageBalance, 6), eligible = decimalUnits(eligibleAverageBalance, 6);
  const validShare = balance !== null && eligible !== null && eligible > 0n && balance <= eligible;
  return { ...split, personal: validShare ? split.holders * balance / eligible : null };
}

// Reference for the future indexer: accrue token-seconds only after the cutoff.
// Transfers and buys do not reset previously accrued holding time.
export function holdingWeight(intervals, periodStart, periodEnd) {
  const cutoff = Date.parse(REWARDS_POLICY.startsAt);
  const start = Math.max(periodStart, cutoff);
  if (!Number.isSafeInteger(periodStart) || !Number.isSafeInteger(periodEnd) || periodEnd < periodStart) throw new RangeError('Invalid period');
  let weight = 0n, previousEnd = -Infinity;
  for (const interval of intervals) {
    const { from, to, balance } = interval;
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from || from < previousEnd || typeof balance !== 'bigint' || balance < 0n) throw new RangeError('Invalid balance history');
    previousEnd = to;
    const duration = Math.max(0, Math.min(to, periodEnd) - Math.max(from, start));
    weight += balance * BigInt(duration);
  }
  return weight;
}

export function solText(lamports) {
  if (lamports === null || lamports === undefined) return '—';
  const whole = lamports / 1000000000n;
  const fraction = (lamports % 1000000000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole}${fraction ? '.' + fraction : ''} SOL`;
}
