// The computer's Launch and X tabs as pure models (tested, no DOM): the five-step launch stepper, the review-before-sign
// card, the X account states and the plain-words error lines. desk.js draws them.
// Contracts: GET /api/projects/:slug (owner view: status, submitterApprovedAt, adminClearedAt, requireAdminClearance,
// allocation{id,status,recipients,statement}, liveSiteVersion, visibility, launchConfig, intent, launch, ledger, x,
// xConfigured, mockSigningText), POST …/launch/transaction (txBase64, mock, messageHash, review fields: network,
// feePayer, mint, programs, accountsWritable, signers, launchProgramsOnly, estimate, resumed), /api/me ({user:{wallet,role}}).
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
export const STEP_IDS=['site','approve','clear','launch','live'];
// The server's stage words (states.js LABELS) for the head chip, which the desk loaded once and the stepper keeps current.
export const STAGE_LABELS={submitted:'Dropped in his room',evaluating:'SUB-01 is thinking about it',selected:'He wants to build it',declined:'He passed',generating:'He is building it',preview_ready:'Preview ready for your review',
 approved:'Approved by you',launch_prepared:'Launch configuration ready',awaiting_signature:'Waiting for your wallet signature',confirming:'Confirming on-chain',launched:'Launched',failed:'Stopped: needs attention',cancelled:'Cancelled'};
const RANK={submitted:0,evaluating:0,selected:0,generating:0,preview_ready:1,approved:3,launch_prepared:3,awaiting_signature:3,confirming:3,failed:3,launched:4};
const BUILDING={submitted:'Dropped in his mailbox; SUB-01 reads it first.',evaluating:'SUB-01 is reading the idea.',selected:'He wants to build it: the site comes next.',generating:'SUB-01 is building the site.'};
const DEAD=new Set(['cancelled','expired','failed']);
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
 steps.push({id:'clear',title:'Reviewer clearance',state:!needClear?'done':stopped?'todo':cleared||rank>=3?'done':status==='preview_ready'&&approvedByYou?'current':'todo',
  line:!needClear?'Not required on this server.':cleared||rank>=3?'Cleared by a SUBZERONE reviewer.':canClear?'A reviewer clears it for launch; the author cannot clear their own.':staff&&own&&status==='preview_ready'?'You are a reviewer, but not of your own project: another reviewer clears it.':approvedByYou?'Waiting for a SUBZERONE reviewer to clear it for launch.':'A reviewer clears it after your approval.',
  action:canClear?{id:'clear',label:'Clear for launch',enabled:true}:null,note:''});
 // 4 launch
 const intent=v.intent&&typeof v.intent==='object'?v.intent:null,lastDead=intent&&DEAD.has(str(intent.status))?str(intent.error):'';
 let phase=null,line='',action=null,lnote='';
 if(status==='approved'){phase='preparing';line='SUB-01 is preparing the launch configuration…';}
 else if(status==='launch_prepared'){phase='prepare';line=mock?'MOCK provider: a labelled stand-in, nothing goes on-chain. Prepare it to see the review.':'Builds the exact transaction. You review it here before the wallet opens; nothing is sent until you sign.';action={id:'prepare',label:'Prepare the transaction',enabled:owner};lnote=lastDead?`Last attempt: ${lastDead}. Nothing was created.`:note&&/expired|failed|rejected|cancel/i.test(note)?note:'';}
 else if(status==='awaiting_signature'){phase='resume';line='A transaction is waiting for your signature: the same one you reviewed.';action={id:'resume',label:'Review & sign',enabled:owner};}
 else if(status==='confirming'){phase='confirming';line='Confirming on-chain… the network decides, not the server.';}
 else if(status==='failed'){phase='failed';line=note||'Stopped: needs attention. A SUBZERONE admin has been alerted.';}
 else if(rank>=4){phase='done';line=mock?'Recorded by the MOCK provider.':`Verified on ${str(v.launch?.network)||'chain'}.`;}
 else line=needClear?'After the reviewer clears it.':'After your approval.';
 steps.push({id:'launch',title:'Launch on pump.fun',state:status==='failed'?'blocked':rank>=4?'done':rank===3?'current':'todo',line,action,note:lnote});
 // 5 live
 const launch=v.launch&&typeof v.launch==='object'?v.launch:null,mint=str(launch?.mint)||(rank>=4?str(intent?.mint):''),network=str(launch?.network||v.launchConfig?.network);
 const ledger=v.ledger&&typeof v.ledger==='object'?v.ledger:null,accrued=num(ledger?.verifiedAccruedLamports),paid=num(ledger?.confirmedPayoutsLamports);
 const live=rank>=4?{mint,network,explorerTx:str(launch?.explorerTx)||null,explorerToken:str(launch?.explorerToken)||null,pumpfun:pumpfunUrl(mint,network),site:str(v.siteUrl)||null,
  ledger:ledger?accrued==null?'Creator fees: nothing observed on-chain yet.':`Creator fees: ${solText(accrued)} accrued · ${solText(paid||0)} paid out${ledger.locked?' · split locked':''}.`:null}:null;
 steps.push({id:'live',title:'Live',state:rank>=4?'current':'todo',line:rank>=4?(mock?'Launched on the MOCK provider: no token exists on-chain.':`Launched. ${live.ledger||''}`.trim()):'The token, its page and the fee ledger.',action:null,note:''});
 const current=stopped?'stopped':steps.find(s=>s.state==='current')?.id||(status==='failed'?'launch':null);
 return {...base,loading:false,status,owner,current,stopped,mock,steps,split,phase,publicIdea,
  approve:v.allocation?{allocationId:str(v.allocation.id),statement:str(v.allocation.statement),siteVersion,ideaId:str(v.ideaId)}:null,live};
}
export const stepIndex=id=>Math.max(0,STEP_IDS.indexOf(id));

// ---------------------------------------------------------------- review before sign
// The directly called programs a launch may use (server LAUNCH_DIRECT, by name); anything else direct is flagged red.
export const LAUNCH_PROGRAMS=new Set(['pump.fun (bonding curve)','pump.fun fee sharing','Compute Budget','MockLaunch']);
/** reviewModel(tx, view, wallet) -> the card: rows, flagged programs, cost, split, canSign and the warnings that disable Sign. */
export function reviewModel(tx,view,wallet){
 if(!tx||typeof tx!=='object')return null;
 const only=tx.launchProgramsOnly===true,you=!!str(wallet)&&str(tx.feePayer)===str(wallet),mock=tx.mock===true;
 const programs=(Array.isArray(tx.programs)?tx.programs:[]).map(p=>{const name=str(p?.name)||'unknown program',direct=p?.direct!==false;
  return {id:str(p?.id),name,direct,flag:/unknown/i.test(name)||(direct&&!LAUNCH_PROGRAMS.has(name))};});
 const e=tx.estimate&&typeof tx.estimate==='object'?tx.estimate:{},fee=num(e.networkFeeLamports),rent=num(e.accountsLamports),buy=num(view?.launchConfig?.initialBuyLamports)||0;
 const total=fee!=null&&rent!=null?fee+rent+buy:mock?0:null;
 const warnings=[];
 if(!you)warnings.push('The fee payer is not your signed-in wallet. Do not sign.');
 if(!only)warnings.push('This transaction calls a program that is not part of a launch. Do not sign it; tell a SUBZERONE admin.');
 if(e.simulation&&e.simulation.ok===false&&!mock)warnings.push(`The simulation failed: ${str(e.simulation.err)||'unknown reason'}. The network would reject it.`);
 const split=splitRows(view);
 return {mock,resumed:tx.resumed===true,network:str(tx.network)||(mock?'mock':'unknown'),feePayer:str(tx.feePayer),you,mint:str(tx.mint),programs,flagged:programs.some(p=>p.flag)||!only,
  writable:num(tx.accountsWritable)??0,signers:num(tx.signers)??1,bytes:num(tx.txBytes),validUntil:num(tx.lastValidBlockHeight),
  cost:{fee:solText(fee),rent:solText(rent),buy:buy>0?solText(buy):null,total:solText(total)??(mock?'0 SOL':'unknown'),simulated:e.simulation?.ok===true&&!e.simulation?.mock,balance:solText(e.signerBalanceLamports)},
  split,canSign:you&&only&&warnings.length===0&&!!(mock?tx.messageHash:tx.txBase64),warnings,
  doesNot:['No token approvals or delegations.','No token transfers from your wallet.',buy>0?`An initial buy of ${solText(buy)} is included.`:'No initial buy.',
   mock?'Nothing leaves your wallet: you sign a labelled text message.':'The only SOL that leaves your wallet is the network fee and the rent for the new accounts.']};
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
 not_owner:'Only the author can do this.',own_project:'A reviewer cannot clear their own project.',forbidden:'Only a SUBZERONE reviewer can do this.',sign_in:'Sign in with your wallet first.',
 rejected:'The network rejected the transaction before it ran. Nothing was created.',bad_signed_tx:'The wallet returned something other than the reviewed transaction. Nothing was sent.',
 x_not_configured:'X is not connected to this server yet.',x_not_connected:'Connect the X account first.',bad_text:'A post is 1–280 characters.',rate_limited:'Slow down a little.',not_found:'Not found, or not yours.'};
export function explainError(err){
 if(!err)return 'Something went wrong. Try again.';
 if(err.rejected||err.timeout||err.unsupported)return err.message;
 const status=Number(err.status),body=err.body&&typeof err.body==='object'?err.body:{},code=str(body.error),detail=str(body.message);
 if(status===429){const s=num(body.retryAfterS);return `Slow down: try again in ${s||10} s.`;}
 if(code==='bad_state'&&/idea is (\w+)/.test(detail))return `Not now: the idea is ${RegExp.$1.replace(/_/g,' ')}.`;
 if(CODES[code])return CODES[code];
 if(status===401)return CODES.sign_in;
 if(status>=500)return 'The server could not answer. Try again in a moment.';
 return detail||str(err.message)||'Something went wrong. Try again.';
}
