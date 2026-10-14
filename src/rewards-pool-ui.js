import { initRewardsFunding } from './rewards-funding-ui.js';
import { api, short } from './api.js';
import { listWallets, onWallets, scanWallets, signIn, signTransaction, describeError } from './wallet.js';
import { solText, REWARDS_POLICY } from './rewards.js';
import { unsignedAmount, verifyClaimProof, reviewClaimTransaction, explorerLink } from './rewards-claims.js';

export function initRewardsPool() {
  const $=id=>document.getElementById(id);
  if(!$('rewards-personal-live'))return ()=>{};
  let policy=null,personal=null,busy=false,walletName=null,plan=null,generation=0;
  const refreshFunding=initRewardsFunding({walletState:()=>({wallet:personal?.wallet,walletName:walletName||$('rewards-wallet-select').value,policy}),refreshPool:()=>refresh()});
  const text=(id,value)=>{$(id).textContent=value;};
  const link=(label,url)=>{const a=document.createElement('a'),safe=explorerLink(url);if(!safe)return document.createTextNode(label);a.textContent=label;a.href=safe;a.target='_blank';a.rel='noopener noreferrer';return a;};
  const money=value=>solText(unsignedAmount(value));
  const signedMoney=value=>{try{const n=BigInt(value);return (n<0n?'-':'')+solText(n<0n?-n:n);}catch{return '—';}};
  function resetPlan(){plan=null;$('rewards-claim-review').hidden=true;$('rewards-claim-sign').disabled=true;}
  function walletChoices(){
    const select=$('rewards-wallet-select'),value=select.value;select.replaceChildren();
    const wallets=listWallets();for(const w of wallets){const o=document.createElement('option');o.value=w.name;o.textContent=w.name;select.append(o);}if(wallets.some(w=>w.name===value))select.value=value;
    $('rewards-connect').disabled=busy||wallets.length===0;
    $('rewards-wallet-help').textContent=wallets.length?'Sign a login message to view your wallet’s rewards. It moves no funds.':'Open this page in your Solana wallet browser or enable a wallet extension, then refresh.';
  }
  onWallets(walletChoices);scanWallets();walletChoices();
  $('rewards-connect').onclick=async()=>{
    if(busy)return;busy=true;walletChoices();resetPlan();
    try{walletName=$('rewards-wallet-select').value;await signIn(walletName);window.dispatchEvent(new Event('city:wallet-session'));await refresh();}catch(e){text('rewards-pool-status',describeError(e));}
    finally{busy=false;walletChoices();}
  };
  async function prepare(epoch){
    if(busy||!personal?.wallet||!policy?.program)return;busy=true;resetPlan();text('rewards-claim-status','Checking your proof and simulating the claim…');
    try{
      const destination=$('rewards-destination').value;
      const p=await api('/api/rewards/claims/prepare',{method:'POST',body:{epochId:epoch.epochId,destination}});
      if(p.destination!==destination||p.wallet!==personal.wallet||p.program!==policy.program||p.network!==policy.network||p.epochId!==epoch.epochId||p.amountLamports!==epoch.amountLamports||p.escrow!==epoch.escrow
        ||!reviewClaimTransaction(p.transaction,{...p,proof:epoch.proof})||!await verifyClaimProof({...epoch,program:policy.program,wallet:personal.wallet}))throw Error('The claim transaction could not be verified. Nothing was signed.');
      plan=p;text('rewards-claim-destination',destination==='buyback'?'Contribute all of this reward to SUB-01 buyback & burn':'Keep SOL in your wallet');text('rewards-claim-amount',money(p.amountLamports));text('rewards-claim-fee',money(p.networkFeeLamports));text('rewards-claim-deposit',money(p.claimRecordDepositLamports));text('rewards-claim-net',signedMoney(p.netLamports));
      $('rewards-claim-review').hidden=false;$('rewards-claim-sign').disabled=false;text('rewards-claim-status',destination==='buyback'?'This transaction sends your full reward to the project wallet for buyback & burn. You pay the fee and deposit. The token purchase and burn happen separately.':'Review these amounts, then sign the claim in your wallet. No SUB-01 tokens move.');
    }catch(e){text('rewards-claim-status',describeError(e));}finally{busy=false;}
  }
  $('rewards-destination').onchange=()=>{resetPlan();text('rewards-claim-status','Choice changed. Verify your daily reward again before signing.');};
  $('rewards-claim-cancel').onclick=()=>{resetPlan();text('rewards-claim-status','Claim cancelled. Nothing was sent.');};
  $('rewards-claim-sign').onclick=async()=>{
    if(busy||!plan)return;busy=true;$('rewards-claim-sign').disabled=true;
    try{
      const name=walletName||$('rewards-wallet-select').value;if(!name)throw Error('Select the wallet you used to sign in.');
      if(Date.now()>plan.expiresAt)throw Error('The claim quote expired. Prepare it again.');
      const signature=await signTransaction(name,plan.transaction,{chain:plan.chain,reviewedReward:true});
      if(signature.address!==personal.wallet)throw Error('Your wallet account changed. Sign in again before claiming.');
      const sent=await api('/api/rewards/claims/submit',{method:'POST',body:{intentId:plan.intentId,signed:signature.signed}});
      $('rewards-claim-status').replaceChildren(document.createTextNode('Submitted. Waiting for final confirmation: '),link('View transaction',sent.url));
      const intentId=plan.intentId;resetPlan();
      let finalized=false;
      for(let attempt=0;attempt<12;attempt++){
        const status=await api('/api/rewards/claims/'+intentId);
        if(status.status==='failed')throw Error('The chain rejected the claim. Check the transaction before trying again.');
        if(status.status==='finalized'){finalized=true;$('rewards-claim-status').replaceChildren(document.createTextNode('Claim finalized. '),link('View transaction',status.url));await refresh();break;}
        await new Promise(resolve=>setTimeout(resolve,3000));
      }
      if(!finalized)$('rewards-claim-status').append(document.createTextNode(' Still confirming; refresh later.'));
    }catch(e){text('rewards-claim-status',describeError(e));}finally{busy=false;walletChoices();}
  };
  async function refresh() {
    const request=++generation;resetPlan();personal=null;refreshFunding();
    for(const id of ['rewards-live-claimable','rewards-live-earned','rewards-live-paid'])text(id,'—');$('rewards-my-periods').replaceChildren();
    try{
      const pool=await api('/api/rewards/pool');if(request!==generation)return;
      if(pool?.policy?.mint!==REWARDS_POLICY.mint)throw Error('Unexpected token in pool data.');
      policy=pool.policy;text('rewards-policy-label',pool.status==='ready'?(pool.epochs?.length?'POLICY IN EFFECT · FUNDED CLAIMS AVAILABLE':'POLICY IN EFFECT · WAITING FOR FIRST ALLOCATION'):'POLICY ADOPTED · CONTRACT DEPLOYMENT PENDING');text('rewards-pool-status',pool.note||pool.status);text('rewards-pool-network',policy.network==='mainnet-beta'?'SOLANA MAINNET':'DEVNET · TEST FUNDS');
      $('rewards-pool-wallet').replaceChildren(link(policy.fundingWallet,policy.fundingWalletUrl));
      $('rewards-pool-program').replaceChildren(policy.program?link(short(policy.program,8),policy.programUrl):document.createTextNode('Contract deployment pending'));
      text('rewards-pool-balance',money(pool.poolBalanceLamports));
      const contributions=$('rewards-buyback-contributions');contributions.replaceChildren();
      for(const c of pool.buybackContributions||[]){const row=document.createElement('div');row.className='rewards-period';row.append(document.createTextNode(money(c.amountLamports)+' contributed · token burn pending '),link('View SOL contribution',c.url));contributions.append(row);}
      if(!contributions.childNodes.length)contributions.textContent='No finalized holder contributions reported yet.';
      const periods=$('rewards-public-periods');periods.replaceChildren();
      for(const e of (Array.isArray(pool.epochs)?pool.epochs:[]).slice(0,30)){
        const row=document.createElement('div');row.className='rewards-period';
        const title=document.createElement('b');title.textContent=e.kind==='bootstrap'?'Initial distribution':new Date(e.from).toLocaleDateString('en-GB',{timeZone:'Europe/Rome'});
        const amount=document.createElement('span');amount.textContent=`Funded ${money(e.holderPoolLamports)} · Remaining ${money(e.remainingLamports)}`;
        const manifest=document.createElement('a');manifest.textContent='Allocation & proof';manifest.href='/api/rewards/epochs/'+Number(e.epochId);manifest.target='_blank';manifest.rel='noopener';
        row.append(title,amount,link('Escrow on chain',e.escrowUrl),manifest);periods.append(row);
      }
      if(!periods.childNodes.length)periods.textContent='No funded distributions published yet.';
      const me=await api('/api/me');if(request!==generation)return;
      if(!me?.user){text('rewards-live-wallet','Connect your wallet');return;}
      text('rewards-live-wallet',short(me.user.wallet,8));
      const mine=await api('/api/rewards/me');if(request!==generation)return;
      if(mine.wallet!==me.user.wallet)throw Error('Unexpected wallet in reward data.');
      personal=mine;await refreshFunding();if(request!==generation)return;
      for(const [id,key] of [['rewards-live-claimable','claimableLamports'],['rewards-live-earned','earnedLamports'],['rewards-live-paid','paidLamports']])text(id,money(mine[key]));
      const entries=Array.isArray(mine.epochs)?mine.epochs:[];
      for(const e of entries){
        const row=document.createElement('div');row.className='rewards-period';const amount=document.createElement('b');amount.textContent=money(e.amountLamports);
        const date=document.createElement('span');date.textContent=e.kind==='bootstrap'?'Initial distribution':new Date(e.from).toLocaleDateString('en-GB',{timeZone:'Europe/Rome'});
        const button=document.createElement('button');button.type='button';button.className='chip';button.textContent=e.claimed?'Claimed':'Verify & claim';button.disabled=true;
        const valid=mine.status==='ready'&&policy.program&&unsignedAmount(e.amountLamports)>0n&&await verifyClaimProof({...e,program:policy.program,wallet:mine.wallet});
        if(!e.claimed&&valid){button.disabled=false;button.onclick=()=>prepare(e);}else if(!e.claimed&&!valid)button.textContent='Proof unavailable';
        if(request!==generation)return;row.append(date,amount,button);$('rewards-my-periods').append(row);
      }
      if(!entries.length)$('rewards-my-periods').textContent='No published allocation for this wallet yet. Daily snapshot rewards become claimable after their allocation is published and funded.';
    }catch(e){if(request!==generation)return;policy=null;personal=null;text('rewards-pool-status','Live pool data unavailable. '+describeError(e));text('rewards-pool-balance','—');$('rewards-public-periods').textContent='Live verification unavailable.';resetPlan();}
  }
  $('rewards-pool-refresh').onclick=()=>{if(!busy)refresh();};
  return refresh;
}
