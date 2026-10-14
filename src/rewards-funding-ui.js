import { api } from './api.js';
import { signTransaction, describeError } from './wallet.js';
import { REWARDS_POLICY, solText } from './rewards.js';
import { unsignedAmount, reviewFundingTransaction, explorerLink } from './rewards-claims.js';

export function initRewardsFunding({ walletState, refreshPool }) {
  const $ = id => document.getElementById(id);
  if (!$('rewards-bootstrap-owner')) return () => {};
  let bootstrap = null, quote = null, busy = false, generation = 0;
  const text = (id, value) => { $(id).textContent = value; };
  const money = value => solText(unsignedAmount(value));
  const reset = () => { quote = null; $('rewards-funding-review').hidden = true; $('rewards-funding-sign').disabled = true; };
  async function refresh() {
    const request = ++generation, state = walletState(); reset(); bootstrap = null;
    $('rewards-bootstrap-owner').hidden = state.wallet !== REWARDS_POLICY.fundingWallet;
    $('rewards-funding-prepare').disabled = true;
    if (state.wallet !== REWARDS_POLICY.fundingWallet) return;
    text('rewards-funding-status', 'Checking the prepared initial allocation…');
    try {
      const result = await api('/api/rewards/bootstrap'); if (request !== generation) return;
      const m = result.manifest;
      if (m && (m.mint !== REWARDS_POLICY.mint || m.fundingWallet !== REWARDS_POLICY.fundingWallet || m.epochId !== 100000 || m.creatorRewardsLamports !== '1000000000' || m.holderPoolLamports !== '200000000')) throw Error('Unexpected initial allocation.');
      bootstrap = result;
      text('rewards-funding-status', result.note || result.status);
      text('rewards-funding-summary', m ? `Prepared holder pool ${money(m.holderPoolLamports)} · ${m.entries.length} recipients · snapshot slot ${m.snapshotSlot}` : 'Initial holder budget: 0.2 SOL. Contract verification is required before signing.');
      $('rewards-funding-prepare').disabled = busy || !['ready_to_fund', 'already_funded'].includes(result.status);
      $('rewards-funding-prepare').textContent = result.status === 'already_funded' ? 'Register funded allocation' : 'Review initial pool funding';
    } catch (e) { text('rewards-funding-status', describeError(e)); }
  }
  $('rewards-funding-prepare').onclick = async () => {
    if (busy || !bootstrap?.manifest) return;
    busy = true; $('rewards-funding-prepare').disabled = true; reset();
    try {
      const state = walletState(), p = await api('/api/rewards/funding/prepare', { method: 'POST', body: {} });
      if (p.status === 'already_funded') { text('rewards-funding-status', 'The funded allocation is registered. No second deposit was made.'); await refreshPool(); return; }
      const m = bootstrap.manifest;
      if (state.wallet !== REWARDS_POLICY.fundingWallet || p.wallet !== state.wallet || p.program !== state.policy?.program || p.network !== state.policy?.network
        || p.root !== m.root || p.snapshotEnd !== m.to || p.escrow !== bootstrap.escrow || p.holderDepositLamports !== '200000000' || !reviewFundingTransaction(p.transaction, p)) throw Error('The initial funding transaction could not be verified. Nothing was signed.');
      quote = p;
      text('rewards-funding-deposit', money(p.holderDepositLamports)); text('rewards-funding-rent', money(p.escrowRentLamports)); text('rewards-funding-fee', money(p.networkFeeLamports)); text('rewards-funding-total', money(p.totalCostLamports));
      text('rewards-funding-root', p.root);
      $('rewards-funding-review').hidden = false; $('rewards-funding-sign').disabled = false;
      text('rewards-funding-status', 'Review the fixed allocation and cost. This funds only the 0.2 SOL holder pool; the buyback budget is separate.');
    } catch (e) { text('rewards-funding-status', describeError(e)); } finally { busy = false; if (bootstrap) $('rewards-funding-prepare').disabled = !['ready_to_fund', 'already_funded'].includes(bootstrap.status); }
  };
  $('rewards-funding-cancel').onclick = () => { reset(); text('rewards-funding-status', 'Funding cancelled. Nothing was sent.'); };
  $('rewards-funding-sign').onclick = async () => {
    if (busy || !quote) return;
    busy = true; $('rewards-funding-sign').disabled = true;
    try {
      const state = walletState(); if (state.wallet !== quote.wallet || Date.now() > quote.expiresAt) throw Error('Sign in again or refresh the expired funding quote.');
      if (!state.walletName) throw Error('Select the funding wallet you used to sign in.');
      const signed = await signTransaction(state.walletName, quote.transaction, { chain: quote.chain, reviewedReward: true });
      if (signed.address !== quote.wallet) throw Error('The wallet account changed. Nothing was sent by this dashboard.');
      const sent = await api('/api/rewards/funding/submit', { method: 'POST', body: { intentId: quote.intentId, signed: signed.signed } });
      const intentId = quote.intentId; reset();
      text('rewards-funding-status', 'Funding submitted. Waiting for finalization and allocation registration…');
      const url = explorerLink(sent.url); if (url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = ' View funding transaction'; $('rewards-funding-status').append(a); }
      let finalized = false;
      for (let i = 0; i < 12; i++) {
        const status = await api('/api/rewards/funding/' + intentId);
        if (status.status === 'failed') throw Error('Funding was rejected on chain. Check the transaction before trying again.');
        if (status.status === 'finalized') { finalized = true; text('rewards-funding-status', 'Initial pool funded and allocation registered. Eligible holders can claim.'); await refreshPool(); break; }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      if (!finalized) text('rewards-funding-status', 'Still confirming. Refresh later; registration can be recovered without a second deposit.');
    } catch (e) { text('rewards-funding-status', describeError(e)); } finally { busy = false; }
  };
  return refresh;
}
