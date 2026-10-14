# SUB-01 creator rewards dashboard

Scope: existing mint `6WCtKQfkWurd77tCCAYWuL5TwyAvuovTzworfnfupump` only. This does not alter the creator-fee split of tokens launched through the city.

Owner-requested cutoff: **2026-10-14 Europe/Rome (start of day)**, equivalent to `2026-10-13T22:00:00Z`. No earlier fee income qualifies, except the explicitly approved initial contribution. Existing holders qualify starting at the cutoff; a new purchase is not required. This date records the adopted rule. The dashboard displays the date without a time; automatic payouts are not yet connected.

## Allocation

- 20% of attributable creator rewards available to SUB-01 funds the eligible holder pool.
- 30% is a SOL budget for buying SUB-01 and then burning purchased tokens. Allocation, purchases and confirmed burns must be reported separately.
- 50% funds the project. Integer rounding dust remains with this bucket, preserving every lamport.

The holder share is the wallet’s token balance divided by all eligible token balances at the same finalized snapshot. Aggregate all token accounts by owner and exclude liquidity and project wallets. Record the snapshot slot and evidence digest. Freeze each allocation before funding; later transfers cannot create another claim for that period. Published, funded allocations can be claimed once per period, on the publication day or later. Daily publication/funding is not automated yet.

## Delivered behavior

Open “SUB-01 rewards” in the header or More sheet, or use `/?dashboard=rewards`. The accessible dialog runs independently of WebGL startup. Empty inputs and unconnected accounting are shown as unknown. The scenario calculator takes projected trading volume, a manually supplied creator-fee percentage and eligible balances at one fixed snapshot. It uses exact integer units and reports the allocation and estimated personal share. Example values are explicitly illustrative; no current fee rate is hardcoded as verified.

The claim interface supports wallet signatures for funded allocations. Buybacks and burns remain separate operations.

## Required server integration

1. Confirm creator reward authority and actual rewards attributable to the existing mint. A creator vault may combine rewards from several mints; do not treat its whole balance as SUB-01 revenue.
2. Attribute actual SUB-01 fee income to each closed daily period; old fee collection is not new income.
3. Obtain a complete finalized holder snapshot, aggregate by owner, verify exclusions and publish the slot, coverage and evidence. A largest-holder list is insufficient.
4. Persist idempotent allocations and payouts; enforce the cutoff server-side. Budget transaction costs separately and cap all spending by verified receipts.
5. Expose verified public totals and authenticated personal entitlements through a documented API; add claim signing only once entitlement checks and transaction verification exist.
6. Execute purchases and burns through an explicit treasury workflow. Display confirmed transaction links, actual tokens burned, execution costs and unspent allocations.

No new API fields or endpoints are assumed by this client. Existing city and launchpad fee rules remain intact.

## Validation

`tests/rewards.test.js` checks exact splits, creator-fee attribution in scenarios, missing/invalid inputs, personal-share bounds, cutoff clipping and overlapping-history rejection. Run the full existing suite and build before review.

## Funded personal claim extension

The dashboard now connects to the documented `/api/rewards` API in the backend's `docs/SUB01-REWARDS-POOL.md`. It reuses wallet message sign-in and shows private published/paid/available amounts, a public funding wallet, verified daily escrows and allocation manifests. Each eligible claim first verifies its Merkle proof locally, checks the actual transaction bytes contain only the expected claim, and reviews fee/deposit/net SOL before signing. Submission is tracked until finalization; no SUB-01 approval or transfer is requested.

The owner subsequently chose a one-SOL initial budget: 0.2 SOL for an initial holder distribution, 0.3 SOL for buyback-and-burn and 0.5 SOL for the project. A separate bootstrap allocation can be published before the first 24-hour period closes. This budget is not evidence that funds moved. The initial distribution uses a complete current snapshot. The contract, snapshot source and fee accounting must be connected before actual amounts are claimable. The proof checks the allocation and escrow; snapshot correctness remains independently auditable.

All live fields remain unknown while deployment/verification is incomplete. The scenario calculator is expandable and kept separate from actual claims. The public manifest intentionally contains allocation wallet addresses; those do not enter the city world snapshot.

## Voluntary buyback contribution

The holder can keep SOL (default) or contribute their entire individual daily reward to buyback/burn. The UI reviews the destination and fee/deposit/net costs. In contribution mode it validates an exact claim plus a transfer to the fixed funding wallet, never an arbitrary transfer. Changing the choice clears the prior quote. Contributions are operator-managed SOL in the project wallet; no automatic burn is claimed. The public list links finalized contributions separately from actual token burn evidence.

## Initial holder escrow funding

The project funding wallet sees an owner-only initial funding section. It reviews the fixed allocation/root, 0.2-SOL deposit, rent and fee, independently checks the actual publish transaction bytes, and signs via the selected wallet. The backend registers the same allocation only after finalization and verification. Recovering an already-funded allocation never creates a second deposit. Other holder wallets cannot prepare or submit treasury funding.
