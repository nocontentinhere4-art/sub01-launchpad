// SUB-01 policy requested by the owner. No transfers or accounting live in this client.
export const REWARDS_POLICY = Object.freeze({
  mint: '6WCtKQfkWurd77tCCAYWuL5TwyAvuovTzworfnfupump',
  startsAt: '2026-10-13T22:00:00Z',
  fundingWallet: 'HMPUiULXumamWDhuoKap6ty2hQ7V7GQwi8PZ7pGx6STQ',
  holderBps: 2000, burnBps: 3000, projectBps: 5000,
  weighting: 'snapshot-balance', status: 'adopted-pending-accounting',
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

export function projection({ volume, creatorPercent, snapshotBalance, eligibleSnapshotBalance }) {
  const v = decimalUnits(volume), rate = decimalUnits(creatorPercent, 4);
  if (v === null || rate === null || rate > 1000000n) return null;
  const split = splitRewards(v * rate / 1000000n);
  const balance = decimalUnits(snapshotBalance, 6), eligible = decimalUnits(eligibleSnapshotBalance, 6);
  const validShare = balance !== null && eligible !== null && eligible > 0n && balance <= eligible;
  return { ...split, personal: validShare ? split.holders * balance / eligible : null };
}

export function solText(lamports) {
  if (lamports === null || lamports === undefined) return '—';
  const whole = lamports / 1000000000n;
  const fraction = (lamports % 1000000000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole}${fraction ? '.' + fraction : ''} SOL`;
}
