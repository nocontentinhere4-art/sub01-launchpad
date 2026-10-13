# SUB-01 creator rewards dashboard

Scope: existing mint `6WCtKQfkWurd77tCCAYWuL5TwyAvuovTzworfnfupump` only. This does not alter the creator-fee split of tokens launched through the city.

Owner-requested cutoff: **2026-10-14 Europe/Rome (start of day)**, equivalent to `2026-10-13T22:00:00Z`. No earlier fees or holding time qualify. Existing holders qualify starting at the cutoff; a new purchase is not required. This date records the adopted rule. The dashboard displays the date without a time; automatic payouts are not yet connected.

## Allocation

- 20% of attributable creator rewards available to SUB-01 funds the eligible holder pool.
- 30% is a SOL budget for buying SUB-01 and then burning purchased tokens. Allocation, purchases and confirmed burns must be reported separately.
- 50% funds the project. Integer rounding dust remains with this bucket, preserving every lamport.

The holder share is token holding time divided by total eligible token holding time over the same period. Intervals are clipped at the cutoff and reporting-period boundaries. Sales stop accrual for sold tokens without erasing prior weight. A zero-weight period leaves the holder budget unallocated. Pool, treasury, reserve, program and other excluded accounts require an explicit, versioned policy before payouts.

## Delivered behavior

Open “SUB-01 rewards” in the header or More sheet, or use `/?dashboard=rewards`. The accessible dialog runs independently of WebGL startup. Empty inputs and unconnected accounting are shown as unknown. The scenario calculator takes projected trading volume, a manually supplied creator-fee percentage and time-weighted average eligible balances. It uses exact integer units and reports the allocation and estimated personal share. Example values are explicitly illustrative; no current fee rate is hardcoded as verified.

This is a dashboard and arithmetic reference, not a claim system. It does not request wallet signatures, transfer funds, execute buybacks, burn tokens or promise an earned balance.

## Required server integration

1. Confirm creator reward authority and actual rewards attributable to the existing mint. A creator vault may combine rewards from several mints; do not treat its whole balance as SUB-01 revenue.
2. Reconstruct a verified baseline of balances and fee accrual at the cutoff. Fee eligibility is based on when fees were generated, not when old rewards were later collected. If accurate reconstruction is unavailable, the requested historical cutoff cannot be presented as operationally verified.
3. Select distribution periods and define exclusions. Index finalized transfers, mint/burn events and fee-generating trades, handling gaps and duplicate records. Do not use a current-wallet snapshot as a historical average. Publish coverage and freshness.
4. Persist idempotent allocations and payouts; enforce the cutoff server-side. Budget transaction costs separately and cap all spending by verified receipts.
5. Expose verified public totals and authenticated personal entitlements through a documented API; add claim signing only once entitlement checks and transaction verification exist.
6. Execute purchases and burns through an explicit treasury workflow. Display confirmed transaction links, actual tokens burned, execution costs and unspent allocations.

No new API fields or endpoints are assumed by this client. Existing city and launchpad fee rules remain intact.

## Validation

`tests/rewards.test.js` checks exact splits, creator-fee attribution in scenarios, missing/invalid inputs, personal-share bounds, cutoff clipping and overlapping-history rejection. Run the full existing suite and build before review.
