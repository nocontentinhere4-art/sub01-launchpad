// The computer's Launch and X tabs as pure models (tested, no DOM): the five-step launch stepper, the review-before-sign
// card, the X account states and the plain-words error lines. desk.js draws them.
// Contracts: GET /api/projects/:slug (owner view: status, submitterApprovedAt, adminClearedAt, requireAdminClearance,
// allocation{id,status,recipients,statement}, liveSiteVersion, visibility, launchConfig, intent, launch, ledger, x,
// xConfigured, mockSigningText, devBuy{status,lamports,attempt}), POST …/launch/transaction (txBase64, mock, messageHash,
// review fields: network, feePayer, mint, programs, accountsWritable, signers, launchProgramsOnly, estimate, resumed),
// POST …/launch/devbuy/transaction (the same review fields + step:2, tokensBase, maxLamports, mockSigningText),
// /api/me ({user:{wallet,role}}).
const str=v=>typeof v==='string'?v.trim():'';
const num=v=>{if(v==null||v==='')return null;v=Number(v);return Number.isFinite(v)?v:null;};
export const STAFF=new Set(['admin','reviewer']);
export const isStaff=me=>STAFF.has(str(me?.user?.role));
// Lamports as a short SOL string: 0 → "0 SOL", 1234567 → "0.001235 SOL", 1.5e9 → "1.5 SOL".
export function solText(lamports){const l=num(lamports);if(l==null)return null;const s=l/1e9;return (s>=1?s.toFixed(4):s.toFixed(6)).replace(/\.?0+$/,'')+' SOL';}
export const pct=bps=>{const b=num(bps);return b==null?'':(b/100).toFixed(b%100?2:0)+'%';};
export const chainFor=network=>{network=str(network).toLowerCase();return network==='devnet'?'solana:devnet':network==='testnet'?'solana:testnet':'solana:mainnet';};
export const pumpfunUrl=(mint,network)=>mint&&/^mainnet/.test(str(network))?`https://pump.fun/coin/${encodeURIComponent(mint)}`:null;

// ---------------------------------------------------------------- the launch stepper
// 'devbuy' only when the launch has a dev buy as its own second transaction (step 2 of the launch, after tx1 lands).
export const STEP_IDS=['site','approve','clear','launch','devbuy','live'];
// The server's stage words (states.js LABELS) for the head chip, which the desk loaded once and the stepper keeps current.
export const STAGE_LABELS={submitted:'Dropped in his room',evaluating:'SUB-01 is thinking about it',selected:'He wants to build it',declined:'He passed',generating:'He is building it',preview_ready:'Preview ready for your review',
 approved:'Approved by you',launch_prepared:'Launch configuration ready',awaiting_signature:'Waiting for your wallet signature',confirming:'Confirming on-chain',launched:'Launched',failed:'Stopped: needs attention',cancelled:'Cancelled'};
const RANK={submitted:0,evaluating:0,selected:0,generating:0,preview_ready:1,approved:3,launch_prepared:3,awaiting_signature:3,confirming:3,failed:3,launched:4};
const BUILDING={submitted:'Dropped in his mailbox; SUB-01 reads it first.',evaluating:'SUB-01 is reading the idea.',selected:'He wants to build it: the site comes next.',generating:'SUB-01 is building the site.'};
const DEAD=new Set(['cancelled','expired','failed']);
// Tokens in base units (6 decimals) as a whole-token string: '10493886257633' → '10,493,886'.
export const tokensText=base=>{const s=str(String(base??''));if(!/^\d+$/.test(s))return null;return (s.length>6?s.slice(0,-6):'0').replace(/\B(?=(\d{3})+(?!\d))/g,',');};
// pump's TooMuchSolRequired (6002 = 0x1772): the price moved past the cap
const PRICE_MOVED=/6002|0x1772|TooMuchSolRequired|price moved/i;
export const DEV_BUY_SLIPPAGE_PCT=5;
/** Is the dev buy its own second signature? After the launch the server says (devBuy); before it, the configuration
 *  (devBuyMode) or the intent; a buy with no configuration yet is predicted as two steps (what pump.fun needs today). */
export function devBuyTwoStep(view){
 const v=view&&typeof view==='object'?view:{};
 if(v.devBuy&&typeof v.devBuy==='object')return true;
 if(v.launch&&typeof v.launch==='object')return false;
 const buy=num(v.launchConfig?.initialBuyLamports)??num(v.launchOptions?.initialBuyLamports)??0;
 if(!(buy>0))return false;
 const mode=str(v.intent?.dev_buy_mode)||str(v.launchConfig?.devBuyMode);
 return mode?mode==='second_tx':true;
}
/** The note before step 1 when the buy is a second signature. */
export const devBuyNote=sol=>`Your dev buy${sol?` of ${sol}`:''} is a second signature right after the launch. If the price moves more than ${DEV_BUY_SLIPPAGE_PCT}% first, it does not go through and you keep your SOL.`;
// The split rows the steps and the review card show: the approved/locked allocation, or the launch config's copy.
export function splitRows(view){
 const fs=view?.launchConfig?.feeSharing,rows=Array.isArray(fs?.recipients)?fs.recipients:Array.isArray(view?.allocation?.recipients)?view.allocation.recipients:[];
 return {rows:rows.filter(r=>r&&typeof r==='object').map(r=>({label:str(r.label)||str(r.role)||'Recipient',role:str(r.role),wallet:str(r.wallet),bps:num(r.bps)||0,pct:pct(r.bps)})),
  locked:fs?fs.locked!==false:(view?.allocation?.mode||'sharing_config')==='sharing_config',status:str(view?.allocation?.status)};
}
/**
 * launchSteps(view, me) -> {loading, status, owner, staff, current, stopped, mock, steps:[{id,title,line,state,action,note}],
 *   split, phase, publicIdea, approve:{allocationId,statement,siteVersion}, live:{mint,explorerTx,explorerToken,pumpfun,site,ledger}}
 * state: 'done' | 'current' | 'todo' | 'blocked'. action: {id,label,enabled} or null (one button per step at most).
 */
export function launchSteps(view,me){
 const v=view&&typeof view==='object'?view:null,user=me?.user&&typeof me.user==='object'?me.user:null,wallet=str(user?.wallet);
 const base={loading:!v,status:'',owner:false,staff:isStaff(me),current:null,stopped:false,mock:false,steps:[],split:{rows:[],locked:true,status:''},phase:null,publicIdea:false,approve:null,live:null};
 if(!v)return base;
 const status=str(v.status),owner=v.owner===true,staff=base.staff,mock=!!(v.launchConfig?.mock||v.intent?.network==='mock'||v.launch?.network==='mock'||v.mockSigningText);
 const rank=RANK[status],stopped=rank==null,approvedByYou=!!v.submitterApprovedAt,cleared=!!v.adminClearedAt,needClear=v.requireAdminClearance!==false;
 const split=splitRows(v),publicIdea=v.visibility==='public',siteVersion=num(v.liveSiteVersion),note=str(v.statusNote);
 const steps=[];
 // 1 site
 steps.push({id:'site',title:'Site built',state:stopped?'blocked':rank>=1?'done':'current',
  line:stopped?(note||`Stopped: ${status.replace(/_/g,' ')||'unknown state'}.`):rank>=1?`Preview v${siteVersion||1} is ready.`:BUILDING[status]||'SUB-01 is working on it.',
  action:rank>=1&&!stopped?{id:'preview',label:'Open the site preview',enabled:true}:null,note:''});
 // 2 approve
 const canApprove=owner&&status==='preview_ready'&&!approvedByYou&&split.status==='draft'&&split.rows.length>0;
 steps.push({id:'approve',title:'Approve site + fee split',state:stopped?'todo':approvedByYou||rank>=3?'done':status==='preview_ready'?'current':'todo',
  line:approvedByYou||rank>=3?'Approved by you.':status!=='preview_ready'?'After the site is built.':!split.rows.length?'The split is not drafted yet; SUB-01 adds it with the site.':
   `Approve site v${siteVersion||1} and the creator-fee split below.${publicIdea?'':' This also makes the idea public: a launched token is public.'}`,
  action:status==='preview_ready'&&!approvedByYou?{id:'approve',label:'Approve site + split',enabled:canApprove}:null,note:split.status==='approved'&&!approvedByYou?'The split is approved; the site changed since. Approve again.':''});
 // 3 clearance
 const own=!!wallet&&str(v.submittedBy)===wallet,canClear=staff&&!own&&status==='preview_ready'&&!cleared;
 if(needClear)steps.push({id:'clear',title:'Reviewer clearance',state:!needClear?'done':stopped?'todo':cleared||rank>=3?'done':status==='preview_ready'&&approvedByYou?'current':'todo',
  line:!needClear?'Not required on this server.':cleared||rank>=3?'Cleared by a SUBZERONE reviewer.':canClear?'A reviewer clears it for launch; the author cannot clear their own.':staff&&own&&status==='preview_ready'?'You are a reviewer, but not of your own project: another reviewer clears it.':approvedByYou?'Waiting for a SUBZERONE reviewer to clear it for launch.':'A reviewer clears it after your approval.',
  action:canClear?{id:'clear',label:'Clear for launch',enabled:true}:null,note:''});
 // 4 launch (step 1 of 2 when the dev buy is its own transaction)
 const intent=v.intent&&typeof v.intent==='object'?v.intent:null,lastDead=intent&&DEAD.has(str(intent.status))?str(intent.error):'';
 const twoStep=devBuyTwoStep(v),buyL=num(v.devBuy?.lamports)??num(v.launchConfig?.initialBuyLamports)??num(v.launchOptions?.initialBuyLamports)??0,buySol=solText(buyL);
 let phase=null,line='',action=null,lnote='';
 if(status==='approved'){phase='preparing';line='SUB-01 is preparing the launch configuration…';}
 else if(status==='launch_prepared'){phase='prepare';line=mock?'MOCK provider: a labelled stand-in, nothing goes on-chain. Prepare it to see the review.':twoStep?'Step 1 of 2: builds the launch transaction (the coin and its locked split). You review it here before the wallet opens; nothing is sent until you sign.':'Builds the exact transaction. You review it here before the wallet opens; nothing is sent until you sign.';action={id:'prepare',label:'Prepare the transaction',enabled:owner};lnote=lastDead?`Last attempt: ${lastDead}. Nothing was created.`:note&&/expired|failed|rejected|cancel/i.test(note)?note:twoStep?devBuyNote(buySol):'';}
 else if(status==='awaiting_signature'){phase='resume';line='A transaction is waiting for your signature: the same one you reviewed.';action={id:'resume',label:'Review & sign',enabled:owner};}
 else if(status==='confirming'){phase='confirming';line='Confirming on-chain… the network decides, not the server.';}
 else if(status==='failed'){phase='failed';line=note||'Stopped: needs attention. A SUBZERONE admin has been alerted.';}
 else if(rank>=4){phase='done';line=mock?'Recorded by the MOCK provider.':`Verified on ${str(v.launch?.network)||'chain'}.`;}
 else line=needClear?'After the reviewer clears it.':'After your approval.';
 steps.push({id:'launch',title:'Launch on pump.fun',state:status==='failed'?'blocked':rank>=4?'done':rank===3?'current':'todo',line,action,note:lnote});
 // 4b the dev buy as its own transaction: right after tx1 confirms, one more signature (or skip)
 let devBuy=null;
 if(twoStep){
  const d=v.devBuy&&typeof v.devBuy==='object'?v.devBuy:null,dst=str(d?.status)||'planned',a=d?.attempt&&typeof d.attempt==='object'?d.attempt:null,err=str(a?.error);
  const landedBad=/^landed:/.test(err),moved=PRICE_MOVED.test(err),tokens=tokensText(a?.tokensBase);
  let dline='',dstate='todo',dact=null,dsec=null,dnote='',dphase=dst;
  if(rank<4||!d){dline=`Step 2 of 2, right after the launch: one more signature buys ${buySol||'your dev buy'} of your coin at the price then (capped at the quote + ${DEV_BUY_SLIPPAGE_PCT}%).`;dphase='planned';}
  else if(dst==='pending'){dstate='current';dline=`The coin is live. Step 2: buy ${buySol} of it with one more signature, at the price now (capped at the quote + ${DEV_BUY_SLIPPAGE_PCT}%).`;dact={id:'devbuy',label:'Buy with your wallet',enabled:owner};dsec=owner?{id:'devbuy-skip',label:'Skip the dev buy'}:null;
   dnote=a&&(a.status==='expired'||a.status==='cancelled')&&err&&!/skipped/.test(err)?`Last attempt: ${err.replace(/^before signing: /,'')}. Nothing was bought.`:'';}
  else if(dst==='awaiting_signature'){dstate='current';dline='Your dev buy is waiting for your signature: the same one you reviewed.';dact={id:'devbuy',label:'Review & buy',enabled:owner};dsec=owner?{id:'devbuy-skip',label:'Skip the dev buy'}:null;}
  else if(dst==='submitted'){dstate='current';dline='Signed · buying… the network decides, not the server.';}
  else if(dst==='failed'&&landedBad){dstate='blocked';dline='The dev buy landed but did not match what you reviewed. A SUBZERONE admin has been alerted.';}
  else if(dst==='failed'){dstate='current';dline=moved?`Did not go through: the price moved more than ${DEV_BUY_SLIPPAGE_PCT}% first. Your SOL stayed in your wallet (only the network fee was paid).`:`Did not go through${err?` (${err.replace(/^preflight: /,'').slice(0,120)})`:''}. Nothing was bought.`;
   dact={id:'devbuy',label:'Try again at the new price',enabled:owner};dsec=owner?{id:'devbuy-skip',label:'Skip the dev buy'}:null;}
  else if(dst==='done'){dstate='done';dline=`Bought${tokens?` ${tokens} tokens`:''} for ${solText(num(a?.costLamports)??buyL)} · in your wallet.`;}
  else if(dst==='skipped'){dstate='done';dline='Skipped: nothing was bought.';}
  devBuy={status:dst,phase:dphase,lamports:buyL,sol:buySol,attempt:a};
  steps.push({id:'devbuy',title:`Dev buy${buySol?` · ${buySol}`:''}`,state:dstate,line:dline,action:dact,secondary:dsec,note:dnote});
 }
 // 5 live
 const launch=v.launch&&typeof v.launch==='object'?v.launch:null,mint=str(launch?.mint)||(rank>=4?str(intent?.mint):''),network=str(launch?.network||v.launchConfig?.network);
 const ledger=v.ledger&&typeof v.ledger==='object'?v.ledger:null,accrued=num(ledger?.verifiedAccruedLamports),paid=num(ledger?.confirmedPayoutsLamports);
 const live=rank>=4?{mint,network,explorerTx:str(launch?.explorerTx)||null,explorerToken:str(launch?.explorerToken)||null,pumpfun:pumpfunUrl(mint,network),site:str(v.siteUrl)||null,
  ledger:ledger?accrued==null?'Creator fees: nothing observed on-chain yet.':`Creator fees: ${solText(accrued)} accrued · ${solText(paid||0)} paid out${ledger.locked?' · split locked':''}.`:null}:null;
 steps.push({id:'live',title:'Live',state:rank>=4?'current':'todo',line:rank>=4?(mock?'Launched on the MOCK provider: no token exists on-chain.':`Launched. ${live.ledger||''}`.trim()):'The token, its page and the fee ledger.',action:null,note:''});
 const current=stopped?'stopped':steps.find(s=>s.state==='current')?.id||(status==='failed'?'launch':null);
 return {...base,loading:false,status,owner,current,stopped,mock,steps,split,phase,publicIdea,devBuy,
  approve:v.allocation?{allocationId:str(v.allocation.id),statement:str(v.allocation.statement),siteVersion,ideaId:str(v.ideaId)}:null,live};
}
// Step numbers follow the steps actually shown: without the reviewer step (REQUIRE_ADMIN_CLEARANCE=0) they run 1-4.
export const stepIndex=(id,steps=null)=>{const ids=Array.isArray(steps)?steps.map(s=>s.id):STEP_IDS;return Math.max(0,ids.indexOf(id));};

// ---------------------------------------------------------------- the dev buy (launch options)
// The author's optional buy of their own coin inside the creation transaction. Server: launchOptions on the owner's
// GET /api/projects/:slug ({initialBuyLamports, maxInitialBuyLamports, locked, editable}), PUT …/launch/options
// {initialBuySol}; 409 intent_exists while a transaction exists (cancel it first); a change after the configuration was
// prepared makes the server prepare it again (approved → launch_prepared), so the stepper shows "preparing" for a moment.
export const DEV_BUY_MAX_SOL=5,DEV_BUY_MIN_SOL=0.001,DEV_BUY_STEP=0.01;
/** Where the field goes: on the open step while the author can still change it (approve, clearance wait, launch), and
 *  on the launch step read-only once a transaction exists; never on the live step or while the review card is open. */
export const showDevBuyOn=(dev,stepId,reviewing=false)=>!!dev&&stepId!=='live'&&stepId!=='site'&&stepId!=='devbuy'&&(dev.editable||stepId==='launch')&&!(stepId==='launch'&&reviewing);
const DEV_BUY_STATES=new Set(['preview_ready','approved','launch_prepared','awaiting_signature','confirming']);   // from the approve step on (the owner never saw it inside step 4)
/** devBuyModel(view) -> null (not the owner's, or not at the launch step) | {sol, text, max, step, locked, editable, note, lockNote, reprepares} */
export function devBuyModel(view){
 const v=view&&typeof view==='object'?view:null,o=v?.launchOptions&&typeof v.launchOptions==='object'?v.launchOptions:null;
 if(!o||v.owner!==true||!DEV_BUY_STATES.has(str(v.status)))return null;
 const status=str(v.status),lamports=Math.max(0,num(o.initialBuyLamports)||0),maxL=num(o.maxInitialBuyLamports);
 const max=Math.min(DEV_BUY_MAX_SOL,maxL==null?DEV_BUY_MAX_SOL:Math.max(0,maxL/1e9));
 const inFlight=status==='awaiting_signature'||status==='confirming',locked=o.locked===true||inFlight,editable=o.editable!==false&&!locked;
 return {sol:lamports/1e9,text:solText(lamports),max,step:DEV_BUY_STEP,locked,editable,
  note:`Optional: SOL you spend on your own coin right after it is created, with a second signature (step 2). pump.fun's trading fee applies; the tokens land in your wallet; if the price moves more than ${DEV_BUY_SLIPPAGE_PCT}% first, it does not go through. 0 = no buy, at most ${max} SOL.`,
  lockNote:locked?(status==='confirming'?'A transaction is in flight; it cannot change now.':'Cancel the transaction to change it.'):'',
  reprepares:status==='launch_prepared'};
}
/** What the author typed -> {sol} (rounded to a lamport) or {error}. Empty = 0. */
export function parseDevBuy(value,max=DEV_BUY_MAX_SOL){
 const s=typeof value==='number'?value:str(value)===''?0:Number(str(value).replace(',','.'));
 if(!Number.isFinite(s)||s<0)return {error:'Enter an amount of SOL, 0 or more.'};
 const sol=Math.round(s*1e9)/1e9;
 if(sol>max)return {error:`At most ${max} SOL.`};
 if(sol>0&&sol<DEV_BUY_MIN_SOL)return {error:`At least ${DEV_BUY_MIN_SOL} SOL, or 0 for no buy.`};
 return {sol};
}

// ---------------------------------------------------------------- the logo choice (backend art-choice.js, 2026-10-12)
// GET /api/projects/:slug/art (owner) -> {choice, chosen, locked, lockedWhy, candidates:[{index,label,provider,symbol,live,logoUrl,bannerUrl}]};
// PUT {choice:0|1}. SUB-01 draws two black-and-white logo+banner pairs; option 1 is live until the author picks.
// Shown on the open step while it can still change (approve, clearance wait, launch before a transaction); older coins
// (no options) and visitors get null.
const ART_STATES=new Set(['preview_ready','approved','launch_prepared']);
/** artModel(art, view) -> null | {options:[{index,label,logo,banner,live,by}], choice, chosen, editable, note} */
export function artModel(art,view){
 const a=art&&typeof art==='object'?art:null,v=view&&typeof view==='object'?view:null;
 if(!a||!v||v.owner!==true||!ART_STATES.has(str(v.status))||!Array.isArray(a.candidates))return null;
 const sameOrigin=u=>(u=str(u))&&/^\/api\/projects\/[a-z0-9-]+\/art\/(logo|banner)-[01]\.png$/.test(u)?u:null;
 const by={local:'drawn by SUB-01 (no AI)','owner-supplied':'your own art',higgsfield:'',recraft:''};
 const options=a.candidates.filter(c=>c&&(c.index===0||c.index===1)&&sameOrigin(c.logoUrl)&&sameOrigin(c.bannerUrl))
  .map(c=>({index:c.index,label:`Option ${c.index+1}`,logo:sameOrigin(c.logoUrl),banner:sameOrigin(c.bannerUrl),live:c.live===true,by:by[str(c.provider)]||''}));
 if(options.length<2)return null;
 const choice=a.choice===1?1:0,editable=a.locked!==true;
 return {options,choice,chosen:a.chosen===true,editable,
  note:!editable?(str(a.lockedWhy)||'The logo is locked.'):a.chosen===true?`Option ${choice+1} is your logo. You can still switch until you prepare the launch transaction.`:
   'SUB-01 drew two options. Option 1 is used unless you pick the other; the site preview and the token logo follow your pick.'};
}
/** Where the picker goes: the open step, never the site/live/dev-buy steps or the review card. */
export const showArtOn=(m,stepId,reviewing=false)=>!!m&&m.editable&&(stepId==='approve'||stepId==='clear'||stepId==='launch')&&!reviewing;

// ---------------------------------------------------------------- review before sign
// The directly called programs a launch may use (server LAUNCH_DIRECT, by name); anything else direct is flagged red.
// 'Associated Token Account': the dev buy creates the author's own token account (the SPL/Token-2022 programs are only
// ever passed inside, never called directly).
export const LAUNCH_PROGRAMS=new Set(['pump.fun (bonding curve)','pump.fun fee sharing','Compute Budget','Associated Token Account','MockLaunch']);
/** reviewModel(tx, view, wallet) -> the card: rows, flagged programs, cost, split, canSign and the warnings that disable Sign.
 *  step: 1 (the launch) or 2 (the dev buy as its own transaction: tx.step === 2); devBuyNext: on step 1, the buy that
 *  follows as a second signature ({sol, maxSol}) or null. */
export function reviewModel(tx,view,wallet){
 if(!tx||typeof tx!=='object')return null;
 const only=tx.launchProgramsOnly===true,you=!!str(wallet)&&str(tx.feePayer)===str(wallet),mock=tx.mock===true,step=num(tx.step)===2?2:1;
 const programs=(Array.isArray(tx.programs)?tx.programs:[]).map(p=>{const name=str(p?.name)||'unknown program',direct=p?.direct!==false;
  return {id:str(p?.id),name,direct,flag:/unknown/i.test(name)||(direct&&!LAUNCH_PROGRAMS.has(name))};});
 // the dev buy: the built transaction's estimate (quoted cost, fees included) or, on a resumed intent, the configuration
 // (step 1 of a two-step launch: the estimate says 0, the buy is step 2)
 const e=tx.estimate&&typeof tx.estimate==='object'?tx.estimate:{},fee=num(e.networkFeeLamports),rent=num(e.accountsLamports),eb=num(e.initialBuyLamports);
 // the server's word: the estimate's devBuyMode, else the intent's or the configuration's (an older estimate: same tx)
 const second=step===1&&(e.devBuyMode!=null?str(e.devBuyMode)==='second_tx':[view?.intent?.dev_buy_mode,view?.launchConfig?.devBuyMode].some(m=>str(m)==='second_tx'));
 const buy=second?0:Math.max(0,(eb!=null?eb:step===2?num(tx.costLamports):num(view?.launchConfig?.initialBuyLamports))||0),buyMax=num(e.initialBuyMaxLamports)??(step===2?num(tx.maxLamports):null);
 const next=second?(()=>{const d=e.devBuy&&typeof e.devBuy==='object'?e.devBuy:{},l=num(d.requestedLamports)??num(view?.launchConfig?.initialBuyLamports)??0;return l>0?{sol:solText(l),maxSol:solText(num(d.maxLamports)),tokens:tokensText(d.tokensBase),note:devBuyNote(solText(l))}:null;})():null;
 const total=fee!=null&&rent!=null?fee+rent+buy:mock?0:null,tokens=step===2?tokensText(e.initialBuyTokensBase??tx.tokensBase):null;
 const warnings=[];
 if(!you)warnings.push('The fee payer is not your signed-in wallet. Do not sign.');
 if(!only)warnings.push(`This transaction calls a program that is not part of a ${step===2?'dev buy':'launch'}. Do not sign it; tell a SUBZERONE admin.`);
 if(step===2&&num(tx.signers)!=null&&num(tx.signers)!==1)warnings.push('The dev buy is signed by your wallet alone; this one asks for another signer. Do not sign it.');
 if(e.simulation&&e.simulation.ok===false&&!mock)warnings.push(`The simulation failed: ${str(e.simulation.err)||'unknown reason'}. The network would reject it.`);
 const split=splitRows(view);
 const capped=buyMax!=null&&buyMax>buy?` (capped at ${solText(buyMax)} in the transaction)`:'';
 const doesNot=step===2?['No token approvals or delegations.','No token transfers from your wallet.',
   `Buys ${tokens?`exactly ${tokens} tokens`:'your coin'} for ${solText(buy)}${capped}: if the price moved more than ${DEV_BUY_SLIPPAGE_PCT}% since this quote, it fails and your SOL stays in your wallet.`,
   mock?'Nothing leaves your wallet: you sign a labelled text message.':`The SOL that leaves your wallet: the network fee, the rent of your new token account and the dev buy${capped}.`]
  :['No token approvals or delegations.','No token transfers from your wallet.',buy>0?`Your dev buy of ${solText(buy)} is included: you pay it and the tokens land in your wallet.`:next?`No buy in this transaction: your dev buy of ${next.sol} is step 2, a second signature right after.`:'No initial buy.',
   mock?'Nothing leaves your wallet: you sign a labelled text message.':buy>0?`The SOL that leaves your wallet: the network fee, the rent for the new accounts and the dev buy${capped}.`:'The only SOL that leaves your wallet is the network fee and the rent for the new accounts.'];
 return {mock,step,resumed:tx.resumed===true,network:str(tx.network)||(mock?'mock':'unknown'),feePayer:str(tx.feePayer),you,mint:str(tx.mint),programs,flagged:programs.some(p=>p.flag)||!only,
  writable:num(tx.accountsWritable)??0,signers:num(tx.signers)??1,bytes:num(tx.txBytes),validUntil:num(tx.lastValidBlockHeight),tokens,devBuyNext:next,
  cost:{fee:solText(fee),rent:solText(rent),buy:buy>0?solText(buy):null,buyMax:buy>0&&buyMax!=null&&buyMax>buy?solText(buyMax):null,total:solText(total)??(mock?'0 SOL':'unknown'),simulated:e.simulation?.ok===true&&!e.simulation?.mock,balance:solText(e.signerBalanceLamports)},
  split,canSign:you&&only&&warnings.length===0&&!!(mock?tx.messageHash:tx.txBase64),warnings,doesNot};
}

// ---------------------------------------------------------------- the X account
export const X_POST_STATUS=new Set(['draft','approved','publishing','published','failed']);
export const X_WAIT_MS=5*60*1000,X_POLL_MS=3000;
/** xModel(view, mine) -> {state:'none'|'planned'|'connected'|'revoked', configured, handle, bio, url, posts, howto, note, canConnect} */
export function xModel(view,mine=false){
 const v=view&&typeof view==='object'?view:{},x=v.x&&typeof v.x==='object'?v.x:null,configured=v.xConfigured!==false;
 const base={configured,handle:'',bio:'',url:null,posts:[],howto:[],note:'',canConnect:false};
 if(!x)return {...base,state:'none',note:mine?'SUB-01 plans the X account while he builds the site: a handle, a bio and the first posts.':'No X account yet.'};
 const connected=x.status==='connected'&&!!str(x.x_handle),handle=(connected?str(x.x_handle):str(x.planned_handle)).replace(/^@/,'').replace(/[^\w]/g,'').slice(0,30);
 const state=connected?'connected':x.status==='revoked'?'revoked':'planned';
 const posts=mine&&Array.isArray(x.posts)?x.posts.filter(q=>q&&str(q.text)).map(q=>{const status=X_POST_STATUS.has(q.status)?q.status:'draft',open=status==='draft'||status==='failed';
  return {id:str(String(q.id??'')),kind:str(q.kind),text:str(q.text).slice(0,280),status,error:str(q.error),canApprove:open&&connected,canEdit:open};}):[];
 const canConnect=mine&&configured&&state!=='connected';
 const howto=state==='connected'?[]:[`Create the account on x.com by hand, with the handle @${handle||'…'} and the bio below. X has no API for sign-up, so nobody can do it for you.`,
  'Come back here and press Connect: X asks you, in its own window, to let SUB-01 post from the account.',"SUB-01 writes the posts; you approve each one here; he posts it. Nothing is posted without your tap."];
 const note=!mine?(connected?'The project posts on X.':state==='planned'?'The account is planned: it opens when the author connects it.':'The account was disconnected.'):
  state==='connected'?'SUB-01 writes, you approve, he posts.':!configured?'X is not connected to this server yet: the Connect button works once the server has its X app keys.':state==='revoked'?'X disconnected the account (token revoked). Connect it again.':'';
 return {...base,state,handle,bio:str(x.planned_bio),url:connected&&handle?`https://x.com/${handle}`:null,posts,howto,note,canConnect};
}
export const xChip=x=>x?.state==='connected'?{text:'@'+x.handle+' · connected',cls:'is-connected'}:x?.state==='planned'?{text:(x.handle?'@'+x.handle+' · ':'')+'planned',cls:'is-planned'}:x?.state==='revoked'?{text:'X disconnected',cls:'is-off'}:null;

// ---------------------------------------------------------------- errors in plain words
const CODES={sub01_wallet_missing:"SUB-01's fee wallet is not configured on the server, so nothing can be approved or launched yet.",allocation_changed:'The split changed meanwhile. Look at it again.',
 changed:'What you reviewed changed meanwhile (the site or the split). Look at it again.',private:'Publish the idea first: a launched token is public.',bad_state:'Not at this stage.',
 paused:'Launches are paused right now. Try later.',previous_open:'The previous transaction could still land. Wait a minute and try again.',previous_landed:'An earlier transaction landed after all; it is being verified instead.',
 intent_exists:'A launch attempt is already in progress.',config_changed:'The launch configuration changed; it is being prepared again.',already_launched:'This project is already launched.',
 landed_unverified:'An earlier transaction landed but failed verification; an admin must resolve it first.',no_intent:'No transaction is waiting for a signature.',not_signer:'This wallet is not the one the transaction was built for.',
 no_dev_buy:'This launch has no separate dev buy.',not_launched:'The coin is not launched yet: the dev buy comes right after the launch.',no_curve:'The coin is not visible on the network yet. Try again in a few seconds.',
 not_owner:'Only the author can do this.',own_project:'A reviewer cannot clear their own project.',forbidden:'Only a SUBZERONE reviewer can do this.',sign_in:'Sign in with your wallet first.',
 rejected:'The network rejected the transaction before it ran. Nothing was created.',bad_signed_tx:'The wallet returned something other than the reviewed transaction. Nothing was sent.',
 x_not_configured:'X is not connected to this server yet.',x_not_connected:'Connect the X account first.',bad_text:'A post is 1–280 characters.',rate_limited:'Slow down a little.',not_found:'Not found, or not yours.'};
export function explainError(err){
 if(!err)return 'Something went wrong. Try again.';
 if(err.rejected||err.timeout||err.unsupported)return err.message;
 const status=Number(err.status),body=err.body&&typeof err.body==='object'?err.body:{},code=str(body.error),detail=str(body.message);
 if(code==='rewrite_limit'&&detail)return detail[0].toUpperCase()+detail.slice(1)+'.';
 if(status===429){const s=num(body.retryAfterS);return `Slow down: try again in ${s||10} s.`;}
 if(code==='bad_state'&&/idea is (\w+)/.test(detail))return `Not now: the idea is ${RegExp.$1.replace(/_/g,' ')}.`;
 if(CODES[code])return CODES[code];
 if(status===401)return CODES.sign_in;
 if(status>=500)return 'The server could not answer. Try again in a moment.';
 return detail||str(err.message)||'Something went wrong. Try again.';
}

/** profileKit(project, xm, {art, siteUrl}) -> what the owner sets by hand on X (no API for the profile picture, header
 *  or bio): files to download and texts to copy. null when the project has no logo yet.
 *  art: kitArt() -> the chosen pair's own URLs (2026-10-12: the room's logoUrl/bannerUrl can name an older preview
 *  version); siteUrl: from the fresh project view (the public site only, never a preview link). */
export function profileKit(p,xm,{art=null,siteUrl}={}){
 const logo=art?.logo||p?.logoUrl,banner=art?.logo?art.banner:p?.bannerUrl,slug=str(p?.slug)||'coin';
 if(!logo)return null;
 const files=[{kind:'logo',label:'Profile picture',hint:'PNG 512×512',url:logo,name:`${slug}-logo.png`}];
 if(banner)files.push({kind:'header',label:'Header',hint:'PNG 1500×500',url:banner,name:`${slug}-header.png`,render:{w:1500,h:500}});
 const texts=[];
 if(xm?.bio)texts.push({label:'Bio',text:xm.bio});
 const site=str(siteUrl===undefined?p?.siteUrl:siteUrl);
 if(site&&/^https?:\/\//.test(site)&&!/\/preview\//.test(site))texts.push({label:'Website',text:site});
 return {files,texts,pair:art?.label||null,note:'X has no API for the picture, header or bio: download these and set them in the X app.'};
}
/** kitArt(art, project) -> {logo, banner, label} | null: the pair the X kit downloads. When SUB-01 drew two options, the
 *  chosen one's files (option 1 until the author picks); otherwise the live pair (the newest version). Only the
 *  launchpad's own /api/projects/<slug>/art/… URLs. */
export function kitArt(art){
 const a=art&&typeof art==='object'?art:null;if(!a)return null;
 const own=u=>(u=str(u))&&/^\/api\/projects\/[a-z0-9-]+\/art\/(logo|banner)-([01]|live)\.png$/.test(u)?u:null;
 const pick=a.choice===1?1:0,c=Array.isArray(a.candidates)?a.candidates.find(x=>x&&x.index===pick&&own(x.logoUrl)):null;
 if(c)return {logo:own(c.logoUrl),banner:own(c.bannerUrl),label:`Option ${pick+1}`};
 if(a.live&&own(a.live.logoUrl))return {logo:own(a.live.logoUrl),banner:own(a.live.bannerUrl),label:null};
 return null;
}

// ---------------------------------------------------------------- "Ask SUB-01 to rewrite" (backend rewrite.js)
// GET /api/projects/:slug/rewrite (owner) -> {allowed, lockedWhy, perDay, left, last:{state,progress,version,live,generator,fallback,error,skipped}};
// POST the same path -> {queued, jobId, left}. A job writes the copy again for the app the site has now; a new site
// version goes through SUB-01's QA. 3 a day; locked once a launch transaction exists.
/** rewriteModel(view) -> null | {allowed, busy, canAsk, label, note, line, state, version, done} */
export function rewriteModel(v){
 const x=v&&typeof v==='object'?v:null;if(!x)return null;
 const last=x.last&&typeof x.last==='object'?x.last:null,state=str(last?.state),busy=state==='queued'||state==='running';
 const per=num(x.perDay)??3,left=Math.max(0,num(x.left)??0),allowed=x.allowed===true;
 const line=busy?(str(last.progress)||'SUB-01 is rewriting the copy…'):
  state==='done'?(last.live?`Rewritten: site v${num(last.version)} is live${last.fallback?', written by the fixed template (the language model failed)':''}.`:`Rewritten as v${num(last.version)}, held back by SUB-01's QA (above).`):
  state==='failed'?`The rewrite failed${str(last.error)?`: ${str(last.error)}`:''}. Try again later.`:state==='skipped'?`Not rewritten: ${str(last.skipped)}.`:'';
 const note=!allowed?(str(x.lockedWhy)?`The words are locked: ${str(x.lockedWhy)}.`:'Nothing to rewrite yet.'):
  left>0?`SUB-01 writes the words again for the app and tools the site has now; the name and the ticker stay. ${left} of ${per} left today.`:`${per} rewrites a day: none left today.`;
 return {allowed,busy,canAsk:allowed&&!busy&&left>0,label:busy?'SUB-01 is rewriting…':'Ask SUB-01 to rewrite',note,line,state,version:num(last?.version),done:state==='done'};
}


// ---------------------------------------------------------------- site tools (the Site tab's Tools panel, owner only)
// Contract (backend docs/SITE-KIT.md, docs/CITY-API.md "Site tools"): GET /api/projects/:slug/tools → {editable, lockedNote,
// tools:[{id,config}], catalog:{id:{name,line,kind,lib,fields:[{key,label,type,max,min,count,choices}]}}, libs, holderChecks,
// inbox:{drop,wall,map,poll}}; PUT …/tools {tools:[{id,config}]} (the enabled ones, in order); POST …/tools/entries/:id {hidden}|{featured}.
export const TOOL_MAX=6;   // the site's own tools; the holder tools (catalog kind 'trust') come on top and never count
export const TRUST_GROUP='Check the chain (always on for launched coins)';
const HHMM=/^([01]\d|2[0-3]):[0-5]\d$/,LOCAL=/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const fieldValue=(f,v)=>f.type==='bool'?v===true:f.type==='options'?Array.from({length:Math.max(2,num(f.count)||4)},(_,i)=>str(Array.isArray(v)?v[i]:'')):v==null?'':String(v);
/** toolsModel(view) -> {loading, editable, lockedNote, holderNote, rows:[{id,name,line,kind,lib,on,fields:[{key,label,type,value,…}]}], inbox:{drop,wall,map}, poll}
 * kind: 'generic' | 'extra' | 'trust' (the holder tools: trades, holders, dev watch, fees, alerts; real chain data, backend docs/SITE-KIT.md).
 * Order: generic, then extras, then the trust group. */
const KIND_ORDER={generic:0,extra:1,trust:2};
export function toolsModel(view){
 const v=view&&typeof view==='object'?view:null;
 if(!v||!v.catalog||typeof v.catalog!=='object')return {loading:!v,editable:false,lockedNote:'',holderNote:'',rows:[],inbox:{drop:[],wall:[],map:[]},poll:null};
 const on=new Map((Array.isArray(v.tools)?v.tools:[]).filter(t=>t&&typeof t.id==='string').map(t=>[t.id,t.config&&typeof t.config==='object'?t.config:{}]));
 const rows=Object.entries(v.catalog).filter(([,c])=>c&&typeof c==='object').map(([id,c])=>({id,name:str(c.name)||id,line:str(c.line),kind:c.kind==='extra'?'extra':c.kind==='trust'?'trust':'generic',
  lib:str(v.libs?.[c.lib]?.name)||null,on:on.has(id),fields:(Array.isArray(c.fields)?c.fields:[]).filter(f=>f&&str(f.key)).map(f=>({...f,value:fieldValue(f,on.get(id)?.[f.key])}))}))
  .sort((a,b)=>KIND_ORDER[a.kind]-KIND_ORDER[b.kind]);
 const entries=(xs,tool)=>(Array.isArray(xs)?xs:[]).filter(e=>e&&str(e.id)).slice(0,50).map(e=>({id:str(e.id),tool,text:str(e.text).slice(0,500),at:num(e.at),by:str(e.by)||null,hidden:e.hidden===true,featured:e.featured===true,
  featuredBy:str(e.featuredBy)||null}));
 const p=v.inbox?.poll;
 return {loading:false,editable:v.editable===true,lockedNote:str(v.lockedNote),
  holderNote:v.holderChecks?'':'Holders-only checks are off on this server (no chain reader): any wallet that signs can take part, and the site says so.',
  rows,inbox:{drop:entries(v.inbox?.drop,'drop'),wall:entries(v.inbox?.wall,'wall'),map:entries(v.inbox?.map,'map')},
  poll:p&&Array.isArray(p.options)?{question:str(p.question),options:p.options.map(str),counts:(Array.isArray(p.counts)?p.counts:[]).map(x=>num(x)||0),total:num(p.total)||0}:null};
}
/** Switch a tool; switching an idea-specific one on switches the other extras off (one at a time). -> new rows */
export function toggleTool(rows,id,on){
 const r=rows.find(x=>x.id===id);if(!r)return rows;
 return rows.map(x=>x.id===id?{...x,on:!!on}:on&&r.kind==='extra'&&x.kind==='extra'?{...x,on:false}:x);
}
export const setField=(rows,id,key,value,index=null)=>rows.map(r=>r.id!==id?r:{...r,fields:r.fields.map(f=>f.key!==key?f:{...f,value:index==null?value:f.value.map((v,i)=>i===index?value:v)})});
/** The plain-words problem with the current switches, or '' when they can be saved. The trust tools never count toward TOOL_MAX. */
export function toolsProblem(rows){
 const on=rows.filter(r=>r.on),val=(r,k)=>r.fields.find(f=>f.key===k)?.value;
 if(on.filter(r=>r.kind!=='trust').length>TOOL_MAX)return `At most ${TOOL_MAX} tools on one site (the chain tools do not count).`;
 if(on.filter(r=>r.kind==='extra').length>1)return 'One idea-specific tool at a time (map, sound toy, mini-game or chart).';
 for(const r of on){
  for(const f of r.fields){const v=f.value;
   if(f.type==='time'&&str(v)&&!HHMM.test(str(v)))return `${r.name}: ${f.label} is a time like 23:00.`;
   if(f.type==='datetime'&&str(v)&&!LOCAL.test(str(v)))return `${r.name}: ${f.label} is a date and time like 2026-12-31T23:00.`;
   if(f.type==='url'&&str(v)&&!/^https:\/\//.test(str(v)))return `${r.name}: the link starts with https://.`;
   if(f.type==='text'&&f.max&&[...str(v)].length>f.max)return `${r.name}: ${f.label} is at most ${f.max} characters.`;
   if(f.type==='number'&&str(v)&&!(Number(v)>=(num(f.min)??-Infinity)&&Number(v)<=(num(f.max)??Infinity)))return `${r.name}: ${f.label} between ${f.min} and ${f.max}.`;}
  if(r.id==='poll'){const q=str(val(r,'question')),opts=(val(r,'options')||[]).map(str).filter(Boolean);
   if([...q].length<3)return 'Poll: write the question.';if(opts.length<2)return 'Poll: at least two answers.';if(new Set(opts.map(o=>o.toLowerCase())).size!==opts.length)return 'Poll: the answers must differ.';}
  if(r.id==='drop'&&str(val(r,'prompt'))&&[...str(val(r,'prompt'))].length<3)return 'Drop box: the prompt is too short.';
  if(r.id==='event'&&str(val(r,'title'))&&[...str(val(r,'title'))].length<2)return 'Next event: name it.';
 }
 return '';
}
/** PUT body: the enabled tools in order, each with the fields the author filled (empty ones left to SUB-01's defaults). */
export function toolsPayload(rows){
 return {tools:rows.filter(r=>r.on).map(r=>{const config={};
  for(const f of r.fields){const v=f.value;
   if(f.type==='bool')config[f.key]=v===true;
   else if(f.type==='options'){const o=(Array.isArray(v)?v:[]).map(str).filter(Boolean);if(o.length)config[f.key]=o;}
   else if(f.type==='number'){if(str(v)!==''&&Number.isFinite(Number(v)))config[f.key]=Number(v);}
   else if(f.type==='choice'){if((f.choices||[]).includes(v))config[f.key]=v;}
   else if(str(v))config[f.key]=str(v);}
  if(r.id==='event'&&config.at)delete config.daily;
  return {id:r.id,config};})};
}
/** The site's own tools switched on (what TOOL_MAX limits); trustCount: the holder tools switched on. */
export const toolsCount=rows=>rows.filter(r=>r.on&&r.kind!=='trust').length;
export const trustCount=rows=>rows.filter(r=>r.on&&r.kind==='trust').length;

// ---------------------------------------------------------------- the idea app (the Site tab's Tools panel, App section, owner only)
// Contract (backend docs/APP-COMPOSER.md): GET /api/projects/:slug/app → {editable, app|null, summary, blocks, templates, metrics, inbox:[{id,number,text,
// fields,at,hidden,published,candidate,votes,picked,how}], round:{slot,start,key}|null, pick, counts, reveals:[{slotAt,method,dev,number,text}], pq, devTrigger};
// PUT …/app {app} (validated server-side; the checks below only say what is wrong in plain words first); POST …/app/compose → {app,summary,honest,source};
// POST …/app/items/:id {hidden}|{publish:true}; POST …/app/pick {itemId|null}; POST …/app/announce {text}; POST …/app/reveal-now (dev servers only).
export const APP_TEMPLATES=['receipt','ticket','poster','postcard','badge'];
export const APP_FIELD_KINDS=['text','longtext','choice','number'];
const clone=v=>JSON.parse(JSON.stringify(v));
const blocksOf=(app,type)=>(Array.isArray(app?.screens)?app.screens:[]).flatMap((s,si)=>(Array.isArray(s?.blocks)?s.blocks:[]).map((b,bi)=>({b,si,bi}))).filter(x=>x.b&&x.b.type===type);
const COPY_KEYS={submit:['title','prompt','button','thanks'],reveal:['title','empty'],vote:['title','button'],collection:['title','empty'],leaderboard:['title'],counter:['title'],note:['title','body'],pq:['title'],card:['title'],map:['title'],timer:['title'],schedule:['label']};
const COPY_LABELS={title:'Title',prompt:'Prompt',button:'Button',thanks:'After sending',empty:'When empty',label:'Label',body:'Text'};
const COPY_MAX={title:60,prompt:160,button:24,thanks:160,empty:120,label:80,body:600};
const BLOCK_NAMES={submit:'Form',schedule:'Schedule',reveal:'Reveal',vote:'Vote',collection:'Archive',card:'Card',leaderboard:'Leaderboard',counter:'Counter',map:'Map',timer:'Countdown',note:'Note',pq:'Post-quantum registry'};
/** appModel(view) -> {loading, editable, app (a copy), summary, copy:[{path,label,block,value,max}], form, schedule, card, inbox, reveals, round, pick, pq, devTrigger, counts} */
export function appModel(view){
 const v=view&&typeof view==='object'?view:null;
 const empty={loading:!v,editable:false,app:null,summary:'',copy:[],form:null,schedule:null,card:null,reveal:null,inbox:[],reveals:[],round:null,pick:null,pq:null,devTrigger:false,counts:null};
 if(!v)return empty;
 const app=v.app&&typeof v.app==='object'&&Array.isArray(v.app.screens)?clone(v.app):null;
 const inbox=(Array.isArray(v.inbox)?v.inbox:[]).filter(e=>e&&str(e.id)).slice(0,100).map(e=>({id:str(e.id),number:num(e.number),text:str(e.text).slice(0,500),at:num(e.at),
  extra:Object.entries(e.fields&&typeof e.fields==='object'?e.fields:{}).slice(1).map(([,x])=>String(x)).join(' · ').slice(0,120),hidden:e.hidden===true,published:e.published===true,
  candidate:e.candidate===true,votes:num(e.votes)||0,picked:e.picked===true,how:str(e.how)||null}));
 const out={...empty,loading:false,editable:v.editable===true,app,summary:str(v.summary),inbox,devTrigger:v.devTrigger===true,counts:v.counts&&typeof v.counts==='object'?v.counts:null,
  round:v.round&&num(v.round.slot)?{slot:num(v.round.slot),start:num(v.round.start)}:null,pick:str(v.pick)||null,
  reveals:(Array.isArray(v.reveals)?v.reveals:[]).filter(r=>r&&num(r.slotAt)).slice(0,14).map(r=>({slotAt:num(r.slotAt),method:str(r.method),dev:r.dev===true,number:num(r.number),text:str(r.text).slice(0,200)})),
  pq:v.pq&&typeof v.pq==='object'?{ok:v.pq.ok===true,total:num(v.pq.total)||0,problems:(Array.isArray(v.pq.problems)?v.pq.problems:[]).map(str).slice(0,5),error:str(v.pq.error)||null,publicKey:str(v.pq.publicKey)}:null};
 if(!app)return out;
 out.copy=[{path:'title',label:'App title',block:'App',value:str(app.title),max:60},{path:'lede',label:'One-line intro',block:'App',value:str(app.lede),max:240},
  ...app.screens.flatMap((s,si)=>[{path:`screens.${si}.title`,label:'Tab name',block:`Tab ${si+1}`,value:str(s.title),max:30},
   ...(Array.isArray(s.blocks)?s.blocks:[]).flatMap((b,bi)=>(COPY_KEYS[b?.type]||[]).filter(k=>typeof b[k]==='string').map(k=>({path:`screens.${si}.blocks.${bi}.${k}`,label:COPY_LABELS[k],block:BLOCK_NAMES[b.type]||b.type,value:b[k],max:COPY_MAX[k]})))])];
 const f=blocksOf(app,'submit')[0],sc=blocksOf(app,'schedule')[0],cd=blocksOf(app,'card')[0],rv=blocksOf(app,'reveal')[0];
 if(f)out.form={si:f.si,bi:f.bi,fields:(f.b.fields||[]).map(x=>({key:str(x.key),label:str(x.label),kind:APP_FIELD_KINDS.includes(x.kind)?x.kind:'text',max:num(x.max),min:num(x.min),required:x.required===true,
  choices:Array.isArray(x.choices)?x.choices.map(str):[]})),holdersOnly:f.b.holdersOnly===true};
 if(sc)out.schedule={si:sc.si,bi:sc.bi,every:sc.b.every==='week'?'week':'day',at:str(sc.b.at),weekday:num(sc.b.weekday)??5};
 if(cd)out.card={si:cd.si,bi:cd.bi,template:APP_TEMPLATES.includes(cd.b.template)?cd.b.template:'postcard',heading:str(cd.b.heading),sub:str(cd.b.sub),lines:(cd.b.lines||[]).map(str),footer:str(cd.b.footer)};
 if(rv)out.reveal={pick:Array.isArray(rv.b.pick)?rv.b.pick.map(str):[]};
 return out;
}
/** Set one copy string by its path ('title', 'screens.0.blocks.2.prompt'). -> a new app */
export function appSetCopy(app,path,value){
 const a=clone(app),keys=String(path).split('.');let o=a;
 for(const k of keys.slice(0,-1)){o=o?.[/^\d+$/.test(k)?Number(k):k];if(o==null||typeof o!=='object')return a;}
 const last=keys[keys.length-1];if(typeof o[last]==='string'||o[last]==null)o[last]=String(value);return a;
}
const blockAt=(a,si,bi)=>a?.screens?.[si]?.blocks?.[bi];
/** The form's fields: change one property, add (up to 4) or remove (the first stays). -> a new app */
export function appSetField(app,form,index,key,value){
 const a=clone(app),b=blockAt(a,form.si,form.bi);if(!b||!Array.isArray(b.fields)||!b.fields[index])return a;
 const f=b.fields[index];
 if(key==='choices')f.choices=String(value).split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
 else if(key==='required')f.required=index===0?true:value===true;
 else if(key==='max'||key==='min'){const n=Number(value);if(value===''||value==null)delete f[key];else f[key]=Number.isFinite(n)?Math.round(n):value;}
 else if(key==='kind'){if(index===0&&!['text','longtext'].includes(value))return a;f.kind=value;if(value!=='choice')delete f.choices;else if(!Array.isArray(f.choices))f.choices=['Yes','No'];
  if(value!=='number')delete f.min;delete f.max;}
 else f[key]=String(value);
 return a;
}
export function appAddField(app,form){
 const a=clone(app),b=blockAt(a,form.si,form.bi);if(!b||!Array.isArray(b.fields)||b.fields.length>=4)return a;
 const used=new Set(b.fields.map(f=>f.key));let n=b.fields.length+1;while(used.has(`field${n}`))n++;
 b.fields.push({key:`field${n}`,label:'New field',kind:'text',required:false});return a;
}
export function appRemoveField(app,form,index){const a=clone(app),b=blockAt(a,form.si,form.bi);if(b&&Array.isArray(b.fields)&&index>0&&b.fields.length>1)b.fields.splice(index,1);return a;}
export function appSetSchedule(app,sched,{every,at,weekday}={}){
 const a=clone(app),b=blockAt(a,sched.si,sched.bi);if(!b)return a;
 if(every!=null)b.every=every==='week'?'week':'day';if(at!=null)b.at=String(at);
 if(b.every==='week')b.weekday=Number.isInteger(Number(weekday))?Number(weekday):(Number.isInteger(b.weekday)?b.weekday:5);else delete b.weekday;
 if(at!=null||every!=null)delete b.label;    // the server writes the label for the new time
 return a;
}
export function appSetCard(app,card,patch={}){
 const a=clone(app),b=blockAt(a,card.si,card.bi);if(!b)return a;
 for(const k of ['template','heading','sub','footer'])if(patch[k]!=null)b[k]=String(patch[k]);
 if(patch.lines!=null)b.lines=String(patch.lines).split('\n').map(s=>s.trim()).filter(Boolean);
 return a;
}
const HHMM_RE=/^([01]\d|2[0-3]):[0-5]\d$/,BAD_TEXT=/[<>`\u0000-\u001f\u007f]/,LINK=/https?:|www\./i;
/** The first problem with the app, in plain words, or ''. The server checks everything again (app-blocks.js). */
export function appProblem(app){
 if(!app)return '';
 const m=appModel({app});
 for(const c of m.copy){if(BAD_TEXT.test(c.value))return `${c.block}: ${c.label} is plain text (no < > or backticks).`;if(LINK.test(c.value))return `${c.block}: ${c.label} cannot carry a link.`;
  if([...c.value.trim()].length>c.max)return `${c.block}: ${c.label} is at most ${c.max} characters.`;}
 if([...str(app.title)].length<2)return 'App: give it a title.';
 if(m.form){const fs=m.form.fields;if(!fs.length||fs.length>4)return 'Form: 1 to 4 fields.';if(!['text','longtext'].includes(fs[0].kind))return 'Form: the first field is the text people send.';
  if(new Set(fs.map(f=>f.key)).size!==fs.length)return 'Form: two fields have the same key.';
  for(const f of fs){if(!f.label)return 'Form: every field needs a label.';
   if(f.kind==='choice'&&(f.choices.length<2||f.choices.length>8))return `Form: "${f.label}" needs 2 to 8 choices.`;
   if(f.kind==='choice'&&new Set(f.choices.map(c=>c.toLowerCase())).size!==f.choices.length)return `Form: the choices of "${f.label}" must differ.`;
   if(f.kind==='choice'&&f.choices.some(c=>[...c].length>24))return `Form: a choice of "${f.label}" is longer than 24 characters.`;
   if(f.kind==='text'&&f.max!=null&&!(f.max>=1&&f.max<=80))return `Form: "${f.label}" can be 1 to 80 characters long.`;
   if(f.kind==='longtext'&&f.max!=null&&!(f.max>=40&&f.max<=500))return `Form: "${f.label}" can be 40 to 500 characters long.`;}}
 if(m.schedule&&!HHMM_RE.test(m.schedule.at))return 'Schedule: a time like 23:00 (JST).';
 if(m.card){if(!m.card.heading)return 'Card: write the heading.';if([...m.card.heading].length>32)return 'Card: the heading is at most 32 characters.';
  if(m.card.lines.length>6)return 'Card: at most 6 lines.';if(m.card.lines.some(l=>[...l].length>28))return 'Card: each line is at most 28 characters.';
  for(const t of [m.card.heading,m.card.sub,m.card.footer,...m.card.lines])if(BAD_TEXT.test(t)||LINK.test(t))return 'Card: plain text only, no links.';}
 return '';
}
export const appPayload=app=>({app});
/** The inbox as rows the owner acts on: what each one is, and which buttons it gets. */
export function appInboxRows(m){
 const canPick=!!m.round&&!!m.reveal?.pick?.includes('owner');
 return m.inbox.map(e=>({...e,state:e.hidden?'hidden':e.published?'published':e.candidate?'candidate':'private',
  meta:[e.number!=null?`#${e.number}`:'',e.at?new Date(e.at).toLocaleString():'',e.extra,e.votes?`${e.votes} vote${e.votes===1?'':'s'}`:'',e.hidden?'hidden':e.published?`published${e.how?` (${e.how})`:''}`:e.candidate?'in tonight\'s round':'',e.picked?'your pick for the next reveal':''].filter(Boolean).join(' · '),
  pick:canPick&&!e.hidden&&!e.published&&!e.picked,unpick:e.picked,publish:!e.hidden&&!e.published,toggle:e.hidden?'Show':'Hide'}));
}
export const REVEAL_WORDS={owner:"your pick",votes:"the holders' votes",random:'the draw',empty:'nothing to choose'};

// ---------------------------------------------------------------- SUB-01's QA of the site (the Site tab, owner only)
// Contract (backend docs/SITE-QA.md): GET /api/projects/:slug/site/qa → {liveSiteVersion, reports:[{version, status:
// 'running'|'passed'|'failed'|'overridden', line, held, browser, browserNote, issues:[{viewport, check, detail}], warnings,
// shots:[{name, viewport, kind, width}]}]} (newest first); POST …/site/qa/:version/override publishes a held version;
// POST …/site/qa/recheck checks the live one again; screenshots at GET …/site/qa/:version/:name (owner only).
const QA_SHOT=/^v\d+-(desktop|mobile)-(fold|full)\.jpg$/;
/** qaModel(view, slug) -> {state:'none'|'run'|'ok'|'fail'|'override', line, note, version, live, held, issues:[{where,text}],
 * warnings:[text], shots:[{label,url,viewport,kind}], canOverride, canRecheck}. Defensive: anything missing reads as "not checked". */
export function qaModel(view,slug){
 const reports=Array.isArray(view?.reports)?view.reports.filter(r=>r&&typeof r==='object'):[],r=reports[0]||null,live=num(view?.liveSiteVersion);
 const enc=encodeURIComponent(str(slug));
 if(!r)return {state:'none',line:"SUB-01's QA: not checked yet",note:'The next site version is checked before it goes live.',version:null,live,held:false,issues:[],warnings:[],shots:[],canOverride:false,canRecheck:live>0};
 const version=num(r.version),state={running:'run',passed:'ok',overridden:'override',failed:'fail'}[str(r.status)]||'none';
 const issues=(Array.isArray(r.issues)?r.issues:[]).slice(0,12).map(i=>({where:str(i?.viewport)==='html'?'page':str(i?.viewport)||'page',text:str(i?.detail).slice(0,240)})).filter(i=>i.text);
 const warnings=(Array.isArray(r.warnings)?r.warnings:[]).slice(0,6).map(w=>str(w?.detail).slice(0,240)).filter(Boolean);
 const held=Boolean(r.held)&&version!==live;
 const note=state==='run'?'Rendering it at 1440 and 390 px…':held?`Version ${version} was held back: version ${live} stays live until it is fixed or you publish it anyway.`
  :state==='override'?`You published version ${version} despite the QA.`:str(r.browserNote)?`Checked in ${str(r.browserNote)}.`:'';
 const shots=(Array.isArray(r.shots)?r.shots:[]).filter(s=>QA_SHOT.test(str(s?.name))).map(s=>({label:`${s.viewport==='mobile'?'Phone':'Desktop'} · ${s.kind==='full'?'whole page':'first screen'}`,
  url:`/api/projects/${enc}/site/qa/${version}/${str(s.name)}`,viewport:str(s.viewport),kind:str(s.kind)}));
 return {state,line:`SUB-01's QA: ${str(r.line)||state}`,note,version,live,held,issues,warnings,shots,canOverride:state==='fail'&&version!==live&&version>0,canRecheck:live>0&&state!=='run'};
}
