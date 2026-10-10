import * as THREE from 'three';
import {REASONS} from './guest.js';
import {icon} from './icons.js';
// Shrine rituals (docs/CITY-API.md "Rituals"): the omikuji (one slip per Tokyo day), the ema board (ideas pinned
// before the vote, with cheers for their author), build-or-pass predictions on the detail card, the leaderboard, the
// vote ledger with its chain check and the About sheet. Nothing here has value: fortunes are cosmetic until midnight
// JST, points only order a list, cheers never reach SUB-01's brain. Pure helpers first (tests/rituals.test.js); the DOM
// only inside createRituals(); the 3D bit is one invisible instanced pick box per shrine (createShrinePicks).

// Why the wallet is asked for, for the three new actions (guest.js reads REASONS by key; its own keys stay as they are).
REASONS.omikuji??='Sign in to draw your omikuji: one slip a day for your resident. It is cosmetic and ends at midnight.';
REASONS.predict??='Sign in to guess SUB-01\'s vote: points only order the leaderboard, nothing of value.';
REASONS.cheer??='Sign in to cheer an ema: one cheer per idea, for its author.';

export const FORTUNE_NAMES={daikichi:'Great blessing',kichi:'Blessing',chukichi:'Middle blessing',shokichi:'Small blessing',hankichi:'Half blessing',suekichi:'Future blessing',kyo:'Curse'};
export const BUFF_KINDS=['glow','petals','confetti'];
export const PREDICTION_POINTS=10;   // mirrors the server (rituals.js): a correct guess adds 10 points, nothing else
export const NO_VALUE='Points and fortunes are cosmetic: no value, nothing to trade, transfer or redeem.';
export const CHEER_LINE='Cheers are for the author. They do not influence SUB-01\'s vote.';
const str=v=>typeof v==='string'?v:'';
export const shortHash=(h,n=8)=>/^[0-9a-f]{8,}$/i.test(str(h))?str(h).slice(0,n):'';
export function timeAgo(at,now=Date.now()){const d=(now-Number(at))/1e3;if(!Number.isFinite(d))return '';if(d<90)return 'just now';if(d<5400)return `${Math.round(d/60)} min ago`;if(d<129600)return `${Math.round(d/3600)} h ago`;return `${Math.round(d/86400)} d ago`;}

// ---------- omikuji
// The server's slip ({drawn, fresh, date, fortune:{id,kanji,rank}, text, buff:{kind,until}, note}), or the flat shape
// {fortune:'kichi', kanji, text, buff}; null when nothing is drawn.
export function normalizeFortune(r){
 if(!r||typeof r!=='object'||r.drawn===false)return null;
 const f=r.fortune&&typeof r.fortune==='object'?r.fortune:{id:str(r.fortune),kanji:str(r.kanji)};
 const id=str(f.id),kanji=str(f.kanji)||str(r.kanji);if(!kanji&&!FORTUNE_NAMES[id])return null;
 const kind=BUFF_KINDS.includes(r.buff?.kind)?r.buff.kind:'none';
 return {id,kanji,name:FORTUNE_NAMES[id]||'Fortune',rank:Number(f.rank)||null,text:str(r.text),date:str(r.date),fresh:!!r.fresh,
  buff:{kind,until:Number(r.buff?.until)||null},note:str(r.note)||NO_VALUE};
}
// The reveal as a small state machine: loading → ready | revealed; ready -draw→ drawing -result→ unfolding -shown→
// revealed. A slip is drawn once per Tokyo day: a slip for `today` keeps the box closed; a new day reopens it.
export const OMIKUJI0={phase:'loading',date:null,fortune:null,error:null};
export function omikujiStep(s,ev){
 s=s||OMIKUJI0;
 switch(ev?.type){
  case 'today':{const f=normalizeFortune(ev.data);return f&&f.date===ev.today?{phase:'revealed',date:f.date,fortune:f,error:null}:{phase:'ready',date:ev.today,fortune:null,error:null};}
  case 'signedout':return {phase:'ready',date:ev.today||s.date,fortune:null,error:null};
  case 'draw':return s.phase==='ready'?{...s,phase:'drawing',error:null}:s;
  case 'result':{const f=normalizeFortune(ev.data);if(!f)return {...s,phase:'ready',error:'The shrine box is empty right now.'};
   return {phase:f.fresh&&!ev.reduced?'unfolding':'revealed',date:f.date||s.date,fortune:f,error:null};}
  case 'error':return {...s,phase:s.fortune?'revealed':'ready',error:str(ev.message)||'Could not draw a slip.'};
  case 'shown':return s.phase==='unfolding'?{...s,phase:'revealed'}:s;
  case 'day':return s.date&&ev.today&&ev.today!==s.date?{phase:'ready',date:ev.today,fortune:null,error:null}:s;
  default:return s;
 }
}
export const canDraw=(s,today)=>s?.phase==='ready'&&!(s.fortune&&s.date===today);

// ---------- predictions
// The detail card's block for a thinking public project. view = GET /api/predictions/:ideaId (or null while loading).
// mode: loading | open (two buttons) | own (your own idea: tally only) | guessed | closed (no vote to score) | decided.
export function predictionModel(view,{own=false}={}){
 if(!view||typeof view!=='object')return {mode:'loading',prompt:'Build or pass? Guess before SUB-01 votes.',buttons:false,tally:null,result:null};
 const total=Math.max(0,Number(view.total)||0),build=Math.max(0,Number(view.build)||0),pass=Math.max(0,Number(view.pass)||0);
 const tally={total,build,pass,pctBuild:total?Math.round(build/total*100):0,text:total?`${total} guess${total===1?'':'es'} · ${Math.round(build/total*100)}% build`:'No guesses yet'};
 const mine=view.mine==='build'||view.mine==='pass'?view.mine:null,decision=view.decision==='build'||view.decision==='pass'?view.decision:null;
 if(view.closed&&decision){const correct=mine?view.correct===true||(view.correct==null&&mine===decision):null;
  return {mode:'decided',prompt:`SUB-01 voted ${decision}.`,buttons:false,tally,mine,result:{decision,correct,points:correct?PREDICTION_POINTS:0,
   text:mine?(correct?`You were right: +${PREDICTION_POINTS} points.`:'You were wrong this time.'):'You did not guess on this one.'}};}
 if(view.closed)return {mode:'closed',prompt:'Guessing is closed. This idea left the queue without a vote to score.',buttons:false,tally,mine,result:null};
 if(own)return {mode:'own',prompt:'Your idea: the neighbors guess on it. You cannot.',buttons:false,tally,mine:null,result:null};
 if(mine)return {mode:'guessed',prompt:`You guessed ${mine}. Waiting for SUB-01's vote.`,buttons:false,tally,mine,result:null};
 return {mode:'open',prompt:'Build or pass? Guess before SUB-01 votes.',buttons:true,tally,mine:null,result:null};
}
export const PREDICT_ERRORS={own_idea:'You cannot guess on your own idea.',already_predicted:'You already guessed on this one.',closed:'SUB-01 has already voted.',no_resident:'Create your resident first.',not_found:'This idea is not public.'};

// ---------- ema, ledger, leaderboard, disclosure (rows only)
export function emaRow(e,now=Date.now()){
 if(!e||typeof e!=='object'||!str(e.ideaId))return null;
 return {ideaId:e.ideaId,title:str(e.title).trim()||'An idea',hash:shortHash(e.pinnedHash),when:e.pinnedAt?`pinned ${timeAgo(e.pinnedAt,now)}`:'',
  stage:str(e.stageLabel)||str(e.stage).replace(/_/g,' '),cheers:Math.max(0,Number(e.cheers)||0),slug:str(e.slug)||null};
}
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function ledgerRow(v){
 if(!v||typeof v!=='object'||!Number.isFinite(Number(v.seq)))return null;
 const opts=Array.isArray(v.vote?.options)?v.vote.options:[],p=a=>num(opts.find(o=>o?.action===a)?.p);
 const nets=v.networks&&typeof v.networks==='object'?Object.entries(v.networks).filter(([,x])=>num(x)!==null).map(([k,x])=>({name:k.replace(/_/g,' '),value:x,lit:x>=.5})):[];
 return {seq:Number(v.seq),decision:v.decision==='build'?'build':v.decision==='pass'?'pass':str(v.decision),build:p('build'),pass:p('pass'),networks:nets,
  lit:nets.filter(n=>n.lit).map(n=>n.name),hash:shortHash(v.hash,10),prev:shortHash(v.prevHash,10),at:Number(v.at)||null,demo:!!v.vote?.demo,
  title:v.idea&&str(v.idea.title)?str(v.idea.title):null,slug:v.idea?.slug||null};
}
export function verifyText(r){
 if(!r||typeof r!=='object')return {ok:null,text:'Could not check the chain right now.'};
 if(r.ok)return {ok:true,text:`Chain verified: rows ${r.from}–${r.to} recomputed, every hash and link matches (${r.checked} checked).`};
 return {ok:false,text:`Chain broken at row #${r.broken_at}. A hash or a link does not match what the server stored.`};
}
export const boardRows=b=>(Array.isArray(b?.top)?b.top:[]).filter(x=>x&&str(x.name)).slice(0,20).map((x,i)=>({rank:i+1,name:x.name,points:Math.max(0,Number(x.points)||0)}));
export function disclosureRows(d){
 if(!d||typeof d!=='object')return [];
 const rows=[['System',d.system],['What it is',d.nature],
  ['Datasets',Array.isArray(d.datasets)&&d.datasets.length?d.datasets.join(', '):'Not listed yet'],['How it decides',d.decision],['Human gate',d.human_gate],
  ['Operator',d.operator||'Not named yet'],['EU AI Act',d.ai_act],['Updated',d.updated_at]];
 return rows.filter(([,v])=>typeof v==='string'&&v.trim()).map(([k,v])=>({label:k,value:v}));
}

// ---------- 3D: shrine picks
// One invisible box per shrine spot (torii height), pushed to main.js's `interactive` list; hit.instanceId → the spot.
export const shrineSpots=layout=>(layout?.spots||[]).filter(s=>s.kind==='shrine');
export function createShrinePicks(scene,interactive,max=48){
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({visible:false}),max),m=new THREE.Object3D();
 mesh.count=0;mesh.userData.shrine=true;mesh.name='shrine picks';scene.add(mesh);interactive.push(mesh);let spots=[],key='';
 return {mesh,get spots(){return spots;},
  set(list){const k=list.map(s=>s.id).join(',');if(k===key)return;key=k;spots=list.slice(0,max);
   spots.forEach((s,i)=>{const fz=s.front==='+z'?1:-1;m.position.set(s.x,1.9,s.frontZ-fz*s.depth*.45);m.scale.set(3.4,3.8,s.depth*.9);m.updateMatrix();mesh.setMatrixAt(i,m.matrix);});
   mesh.count=spots.length;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();},
  spotOf(hit){return hit?.object===mesh&&hit.instanceId!=null?spots[hit.instanceId]||null:null;},
  // Where a label sits: above the torii's crossbar.
  labelAt(s){const fz=s.front==='+z'?1:-1;return {x:s.x,y:4.3,z:s.frontZ-fz*.6};}};
}

// ---------------------------------------------------------------- DOM
// ctx: getJSON(path), api(path,opts), me() → /api/me, guest, openDialog(id), closeDialog(), notify(text),
// ensureResident(next), onFortune(fortune) (buff on your character), onEma(list) (cheer counters), reducedMotion,
// telemetryLine() → text, today() → Tokyo date.
export function createRituals(ctx){
 const $=id=>document.getElementById(id),el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null&&k!==false));return n;};
 let omi=OMIKUJI0,tab='omikuji',ema=[],emaNote='',cheered=new Set(),lastMe=undefined;
 const signedIn=()=>!!ctx.me()?.user,today=()=>ctx.today();
 const errText=err=>PREDICT_ERRORS[err?.body?.error]||err?.message||'Something went wrong.';
 // Signed in with a resident → run; a guest is asked for the wallet first (with the reason); no resident → creator.
 const gated=(reason,run)=>{if(!signedIn()){ctx.guest.requireWallet(reason,()=>ctx.ensureResident(run));return;}ctx.ensureResident(run);};

 async function loadToday(){
  const me=ctx.me();if(!me?.user||!me.resident){omi=omikujiStep(omi,{type:'signedout',today:today()});return omi;}
  try{omi=omikujiStep(omi,{type:'today',data:await ctx.getJSON('/api/omikuji/today'),today:today()});}catch{omi=omikujiStep(omi,{type:'signedout',today:today()});}
  if(omi.fortune)ctx.onFortune?.(omi.fortune,{fresh:false});return omi;
 }
 // Called after every /api/me refresh: the slip follows the account (sign-in, sign-out, a new day).
 function syncAccount(){const me=ctx.me(),k=me?.user?(me.resident?'r':'u')+me.user.wallet:'';if(k===lastMe){omi=omikujiStep(omi,{type:'day',today:today()});return;}lastMe=k;cheered=new Set();omi=OMIKUJI0;loadToday().then(()=>{if(!$('shrine-backdrop')?.hidden&&tab==='omikuji')renderShrine();});}

 // ---- Omikuji panel: a wooden box, then a paper slip that unfolds (CSS keyframes, skipped with reduced motion).
 function omikujiPanel(){
  const f=omi.fortune,box=el('div',{className:'omikuji'+(omi.phase==='drawing'?' is-shaking':'')});
  if(!f){
   const btn=el('button',{type:'button',className:'button button-orange',disabled:omi.phase==='drawing'||omi.phase==='loading'},omi.phase==='drawing'?'Shaking the box…':'Draw your slip');
   btn.onclick=()=>gated('omikuji',draw);
   box.append(...[el('div',{className:'omikuji-box',ariaHidden:'true'},el('span',{className:'jp',textContent:'御神籤'})),
    el('p',{className:'fine',textContent:'One slip per Tokyo day. Shake the box, read your fortune. A good one lights your character until midnight.'}),btn,
    omi.error?el('p',{className:'form-error',role:'alert',textContent:omi.error}):null].filter(Boolean));
   return box;
  }
  const slip=el('div',{className:'omikuji-slip'+(omi.phase==='unfolding'?' is-unfolding':'')+(f.id==='kyo'?' is-kyo':'')},
   el('span',{className:'jp omikuji-kanji',textContent:f.kanji}),el('b',{textContent:f.name}),el('p',{textContent:f.text}),
   el('small',{textContent:f.buff.kind!=='none'?`Today your character wears a ${f.buff.kind==='glow'?'warm glow':f.buff.kind} until midnight JST.`:f.id==='kyo'?'Tie it to the shrine tree and leave it behind.':'No buff today. Tomorrow brings a new slip.'}));
  if(omi.phase==='unfolding'){const done=()=>{omi=omikujiStep(omi,{type:'shown'});slip.classList.remove('is-unfolding');};slip.addEventListener('animationend',done,{once:true});setTimeout(done,2200);}
  box.append(slip,el('p',{className:'fine',textContent:`${f.date?f.date+' · ':''}${f.note}`}));return box;
 }
 async function draw(){
  if(!canDraw(omi,today())){await loadToday();if(!canDraw(omi,today())){renderShrine();return;}}
  omi=omikujiStep(omi,{type:'draw'});renderShrine();
  const shake=new Promise(r=>setTimeout(r,ctx.reducedMotion?0:900));
  try{const r=await ctx.api('/api/omikuji',{method:'POST'});await shake;omi=omikujiStep(omi,{type:'result',data:r,reduced:ctx.reducedMotion});if(omi.fortune)ctx.onFortune?.(omi.fortune,{fresh:omi.fortune.fresh});}
  catch(err){await shake;omi=omikujiStep(omi,{type:'error',message:err?.body?.error==='no_resident'?'Create your resident first.':err?.message});}
  if(!$('shrine-backdrop').hidden&&tab==='omikuji')renderShrine();
 }

 // ---- Ema board: wooden plaques, newest first.
 async function loadEma(){try{const r=await ctx.getJSON('/api/ema?limit=30');ema=(Array.isArray(r?.ema)?r.ema:[]).map(e=>emaRow(e)).filter(Boolean);emaNote=str(r?.note);ctx.onEma?.(ema);}catch{}return ema;}
 function emaPanel(){
  const list=el('ol',{className:'ema-list'});
  for(const e of ema){const mine=ctx.me()?.ideas?.some(i=>i.id===e.ideaId),done=cheered.has(e.ideaId);
   const btn=el('button',{type:'button',className:'ema-cheer',disabled:mine||done,title:mine?'Your own ema':done?'You cheered this one':'Cheer for the author'},icon('heart'),done?'Cheered':'Cheer',el('span',{className:'count',textContent:String(e.cheers)}));
   btn.onclick=()=>gated('cheer',async()=>{btn.disabled=true;try{const r=await ctx.api(`/api/ema/${encodeURIComponent(e.ideaId)}/cheer`,{method:'POST'});e.cheers=Number(r?.cheers)||e.cheers+1;cheered.add(e.ideaId);ctx.onEma?.(ema);}
    catch(err){if(err?.body?.error==='already_cheered')cheered.add(e.ideaId);else{btn.disabled=false;ctx.notify(err?.body?.error==='own_idea'?'That is your own ema.':errText(err));}}renderShrine();});
   list.append(el('li',{className:'ema'},el('span',{className:'ema-cord',ariaHidden:'true'}),el('b',{textContent:e.title}),
    el('small',{textContent:[e.stage,e.when].filter(Boolean).join(' · ')}),e.hash?el('code',{title:'sha256 of the text as submitted, pinned before the vote',textContent:'#'+e.hash}):null,btn));}
  return el('div',{className:'ema-panel'},el('p',{className:'ema-line',textContent:CHEER_LINE}),
   ema.length?list:el('p',{className:'fine',textContent:'No ema yet. Public ideas are pinned here the moment they are dropped in the mailbox.'}),
   el('p',{className:'fine',textContent:emaNote||'Each plaque carries the hash of the idea as submitted: proof of what was asked, and when.'}));
 }
 // ---- Leaderboard: names and points only.
 async function boardPanel(){
  const box=el('div',{className:'board-panel'},el('p',{className:'fine',textContent:'Loading…'}));
  ctx.getJSON('/api/leaderboard?kind=predictions').then(b=>{const rows=boardRows(b);
   box.replaceChildren(rows.length?el('ol',{className:'board-list'},...rows.map(r=>el('li',{},el('span',{className:'rk',textContent:String(r.rank)}),el('b',{textContent:r.name}),el('span',{className:'pt',textContent:`${r.points} pt`})))):el('p',{className:'fine',textContent:'Nobody has scored yet. Guess build or pass on a thinking building to get on the board.'}),
    el('p',{className:'fine',textContent:str(b?.note)||NO_VALUE}));}).catch(()=>box.replaceChildren(el('p',{className:'fine',textContent:'The leaderboard is not reachable right now.'})));
  return box;
 }
 const TABS=[['omikuji','Omikuji','torii'],['ema','Ema','lantern'],['board','Leaderboard','trophy']];
 async function renderShrine(){
  const tabs=$('shrine-tabs'),body=$('shrine-body');if(!tabs||!body)return;
  tabs.replaceChildren(...TABS.map(([id,name,ic])=>{const b=el('button',{type:'button',className:'sheet-tab',onclick:()=>{tab=id;renderShrine();}},icon(ic),name);b.setAttribute('aria-pressed',String(tab===id));return b;}));
  const panel=tab==='omikuji'?omikujiPanel():tab==='ema'?emaPanel():await boardPanel();
  const ledger=el('button',{type:'button',className:'link-button',onclick:openLedger},'See the vote ledger',icon('arrow'));
  body.replaceChildren(panel,el('div',{className:'sheet-foot'},ledger));
 }
 async function openShrine(which='omikuji',spot=null){
  tab=which;$('shrine-eyebrow').textContent=`NEIGHBORHOOD SHRINE · 神社${spot?.district?' · '+spot.district.toUpperCase():''}`;
  ctx.openDialog('shrine-backdrop');renderShrine();
  await Promise.all([omi.phase==='loading'||omi.phase==='ready'?loadToday():null,loadEma()]);
  omi=omikujiStep(omi,{type:'day',today:today()});if(!$('shrine-backdrop').hidden)renderShrine();
 }

 // ---- Vote ledger: newest rows, a chain check on the server.
 async function openLedger(){
  ctx.closeDialog();const body=$('ledger-body');body.replaceChildren(el('p',{className:'fine',textContent:'Loading the ledger…'}));ctx.openDialog('ledger-backdrop');
  const status=el('p',{className:'verify-status',role:'status'}),btn=el('button',{type:'button',className:'button button-ghost button-sm',textContent:'Verify chain'});
  btn.onclick=async()=>{btn.disabled=true;status.textContent='Recomputing every hash on the server…';status.className='verify-status';
   let r=null;try{r=await ctx.getJSON('/api/votes/verify');}catch{}const v=verifyText(r);status.textContent=v.text;status.className='verify-status'+(v.ok===true?' ok':v.ok===false?' bad':'');btn.disabled=false;};
  try{const r=await ctx.getJSON('/api/votes?limit=50'),rows=(r?.votes||[]).map(ledgerRow).filter(Boolean),head=r?.head;
   body.replaceChildren(el('div',{className:'ledger-head'},el('span',{},el('small',{textContent:'HEAD'}),el('code',{textContent:head?.seq?`#${head.seq} · ${shortHash(head.hash,16)}`:'empty'})),btn),status,
    rows.length?el('ol',{className:'ledger-list'},...rows.map(x=>el('li',{className:'ledger-row is-'+x.decision},
     el('div',{className:'lr-top'},el('span',{className:'lr-seq',textContent:'#'+x.seq}),el('b',{className:'lr-dec',textContent:x.decision.toUpperCase()}),
      el('span',{className:'lr-p',textContent:x.build!==null?`build p ${x.build.toFixed(2)}`:''}),el('code',{textContent:x.hash})),
     x.title?el('span',{className:'lr-title',textContent:x.title}):el('span',{className:'lr-title anon',textContent:x.decision==='pass'?'A passed idea (anonymous)':'A private idea (anonymous)'}),
     x.networks.length?el('div',{className:'lr-nets'},...x.networks.map(n=>el('span',{className:'lr-net'+(n.lit?' lit':''),textContent:`${n.name} ${n.value.toFixed(2)}`}))):null))):
     el('p',{className:'fine',textContent:'No votes yet. Every answer of SUB-01\'s brain adds one row here, build or pass.'}),
    el('p',{className:'fine',textContent:'Append-only and hash-chained: anyone can recompute the chain from these rows. Private and passed ideas stay anonymous.'}));}
  catch{body.replaceChildren(el('p',{className:'fine',textContent:'The ledger is not reachable right now.'}));}
 }
 // ---- About SUB-01: the disclosure, the telemetry line, a link to the ledger.
 async function openAbout(){
  const body=$('about-body');body.replaceChildren(el('p',{className:'fine',textContent:'Loading…'}));ctx.openDialog('about-backdrop');
  let d=null;try{d=await ctx.getJSON('/api/disclosure');}catch{}
  const rows=disclosureRows(d);
  body.replaceChildren(rows.length?el('dl',{className:'about-list'},...rows.flatMap(r=>[el('dt',{textContent:r.label}),el('dd',{textContent:r.value})])):el('p',{className:'fine',textContent:'The disclosure is not reachable right now. SUB-01 is an AI dev driven by a model of real human brain activity; every publication and transaction is approved by a human.'}),
   el('div',{className:'about-privacy'},el('b',{textContent:'Privacy'}),el('p',{textContent:ctx.telemetryLine?.()||''})),
   el('button',{type:'button',className:'link-button',onclick:openLedger},'See the vote ledger',icon('arrow')));
 }

 // ---- Predictions on the detail card. box: the card's #detail-predict; ideaId from the world/ema; own: your idea.
 let predictFor=null;
 async function predict(box,{ideaId,own=false}){
  predictFor=ideaId;if(!box)return;if(!ideaId){box.hidden=true;return;}
  const draw=(view,error='')=>{if(predictFor!==ideaId)return;const m=predictionModel(view,{own});box.hidden=false;
   const tally=m.tally?el('div',{className:'predict-tally'},el('i',{style:`--b:${m.tally.pctBuild}%`}),el('small',{textContent:m.tally.text})):null;
   const btns=m.buttons?el('div',{className:'predict-buttons'},...['build','pass'].map(g=>{const b=el('button',{type:'button',className:'button button-sm '+(g==='build'?'button-orange':'button-ghost'),textContent:g==='build'?'Build':'Pass'});
    b.onclick=()=>gated('predict',async()=>{for(const x of box.querySelectorAll('button'))x.disabled=true;try{draw(await ctx.api('/api/predictions',{method:'POST',body:{ideaId,guess:g}}));}catch(err){draw(view,errText(err));}});return b;})):null;
   box.replaceChildren(...[el('span',{className:'eyebrow',textContent:'PREDICTION · 予想'}),el('b',{className:'predict-q',textContent:m.prompt}),btns,
    m.result?el('p',{className:'predict-result'+(m.result.correct===true?' ok':m.result.correct===false?' miss':''),textContent:m.result.text}):null,tally,
    error?el('p',{className:'form-error',role:'alert',textContent:error}):null,el('p',{className:'fine',textContent:'Points only order the leaderboard. No prize, nothing to trade. Guesses never reach SUB-01\'s brain.'})].filter(Boolean));};
  draw(null);
  try{draw(await ctx.getJSON(`/api/predictions/${encodeURIComponent(ideaId)}`));}catch{if(predictFor===ideaId)box.hidden=true;}
 }
 return {openShrine,openLedger,openAbout,predict,loadEma,syncAccount,get ema(){return ema;},get omikuji(){return omi;},
  get fortune(){return omi.fortune;},chip(){return omi.fortune?{drawn:true,kanji:omi.fortune.kanji}:null;}};
}
