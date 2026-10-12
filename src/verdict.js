// SUB-01's verdict card: what the author sees seconds after dropping an idea (and again in the building's sheet).
// The pure helpers (model, counter, prefill, polling plan, labels) are tested; renderVerdict draws the card.
// Contract: GET /api/ideas/:id `evaluation.feedback`, `versions`, `canRevise`, `nextVersionAt`, `eta` (CITY-API.md).
export const MAX_VERSIONS=5;
export const POLL={everyMs:2000,forMs:30000};
const READING=new Set(['submitted','evaluating']);
const str=v=>typeof v==='string'?v.trim():'';
const list=v=>Array.isArray(v)?v.map(str).filter(Boolean):[];

export const counterLabel=(version,max=MAX_VERSIONS)=>`v${Math.max(1,Number(version)||1)} of ${max}`;
export const latencyLabel=ms=>!Number.isFinite(ms)||ms<0?'':ms<950?`${Math.max(0.1,Math.round(ms/100)/10)} s`:ms<60000?`${Math.round(ms/1000)} s`:`${Math.round(ms/60000)} min`;
/** Fields to put back in the form when the author revises (what he read last). */
export const prefillFrom=idea=>({title:str(idea?.title),concept:str(idea?.concept),nameSuggestion:str(idea?.nameSuggestion),tickerSuggestion:str(idea?.tickerSuggestion),receivingWallet:str(idea?.receivingWallet)});
/** Keep polling GET /api/ideas/:id? Every 2 s for at most 30 s after the drop. */
export function pollPlan(startedAt,now=Date.now(),p=POLL){const spent=now-startedAt;return spent>=p.forMs?{again:false,delay:0,late:true}:{again:true,delay:p.everyMs,late:false};}
/** "SUB-01 is reading…", or why he is not reading yet (offline, asleep) with the next try in seconds. */
export function waitingLine(idea,now=Date.now()){
 const note=str(idea?.statusNote),eta=Number(idea?.eta);
 if(Number.isFinite(eta)&&eta>now){const s=Math.max(1,Math.round((eta-now)/1000));
  if(/asleep/i.test(note))return `SUB-01 is asleep. Your idea waits by his bed; he reads it when he wakes (next try in ${s>120?Math.round(s/60)+' min':s+' s'}).`;
  return `SUB-01 is offline. Your idea waits by his door; he reads it the moment he is back (next try in ${s>120?Math.round(s/60)+' min':s+' s'}).`;}
 if(/asleep/i.test(note))return 'SUB-01 is asleep. He reads it when he wakes.';
 if(/offline|unreachable|waiting for sub-01/i.test(note))return 'SUB-01 is offline. He reads it the moment he is back.';
 return 'SUB-01 is reading it…';
}
/** The verdicts so far, as "v1: pass → v2: build". */
export const historyLine=versions=>list((versions||[]).map(v=>v&&v.decision?`v${v.version}: ${v.decision}`:'')).join(' → ');

/**
 * -> {state:'waiting'|'build'|'pass'|'failed'|'gone', headline, summary, likes, dislikes, suggestions, wouldBuildIf,
 *     context, counter, history, canRevise, nextVersionAt, waitNote, latency, version}
 */
export function verdictModel(idea,now=Date.now()){
 if(!idea||typeof idea!=='object')return {state:'gone',headline:'He cannot find it.',summary:'The idea is not there any more. Close this and look at the building.',likes:[],dislikes:[],suggestions:[],wouldBuildIf:null,context:[],counter:'',history:'',canRevise:false,nextVersionAt:null,waitNote:'',latency:'',version:1};
 const version=Number(idea.version)||1,max=Number(idea.maxVersions)||MAX_VERSIONS,counter=counterLabel(version,max),history=historyLine(idea.versions);
 // the view's evaluation is the latest verdict; after a resubmit it is the OLD version's until he reads the new one
 const ev0=idea.evaluation&&typeof idea.evaluation==='object'?idea.evaluation:null,ev=ev0&&(ev0.version==null||Number(ev0.version)===version)?ev0:null,f=ev?.feedback&&typeof ev.feedback==='object'?ev.feedback:{};
 const base={likes:list(f.likes),dislikes:list(f.dislikes),context:list(f.context),
  suggestions:(Array.isArray(f.suggestions)?f.suggestions:[]).map(s=>s&&typeof s==='object'?{what:str(s.what),why:str(s.why),how:str(s.how)}:null).filter(s=>s&&s.what),
  wouldBuildIf:str(f.wouldBuildIf)||null,counter,history,version,nextVersionAt:idea.nextVersionAt!=null&&Number.isFinite(Number(idea.nextVersionAt))?Number(idea.nextVersionAt):null,
  canRevise:idea.canRevise===true,owner:idea.owner!==false,latency:latencyLabel(Number(ev?.latencyMs)),fidelity:fidelityModel(idea.fidelity)};
 // the build timeline (2026-10-12): replaces the "next" line while he builds; when it is ready, the logo step
 const raw=cleanBuild(idea.build,Number(idea.receivedAt)||now),build=raw?buildModel(raw,serverNow(raw,now)):null;
 const nextFor=()=>!base.owner?'':build?(build.ready?READY_LINE:''):NEXT_LOGO;
 if(ev&&(ev.verdict==='build'||ev.decision==='selected'))return {...base,state:'build',headline:'He builds it.',summary:str(f.summary)||'SUB-01 voted to build it. The building rises while he works.',waitNote:'',canRevise:false,wouldBuildIf:null,next:nextFor(),build,buildRaw:raw};
 if(ev&&(ev.verdict==='pass'||ev.decision==='declined'))return {...base,state:'pass',headline:'He passed.',summary:str(f.summary)||'SUB-01 voted pass. Nothing is built.',waitNote:''};
 if(idea.status==='failed')return {...base,state:'failed',headline:'He could not read it.',summary:str(idea.statusNote)||'His brain did not answer. Nothing was decided; a reviewer will retry it.',waitNote:'',canRevise:false};
 if(READING.has(idea.status))return {...base,state:'waiting',headline:'SUB-01 is reading…',summary:'',waitNote:waitingLine(idea,now),canRevise:false};
 return {...base,state:'build',headline:'He builds it.',summary:str(f.summary)||'SUB-01 is building it.',waitNote:'',canRevise:false,wouldBuildIf:null,next:nextFor(),build,buildRaw:raw};
}
// 2026-10-12: SUB-01 draws two logo options with the build; the author picks one on the room computer (desk.js, Launch tab)
export const NEXT_LOGO='Next: choose your logo on your PC. SUB-01 draws two black-and-white options while he builds; open the computer in your room, Launch tab, and pick one.';
/** The Revise button: {label, disabled, title}; counts down to nextVersionAt when the wallet just resubmitted. */
export function reviseButton(m,now=Date.now()){
 if(m.state!=='pass')return null;
 if(!m.canRevise)return m.version>=MAX_VERSIONS?{label:`${MAX_VERSIONS} versions: start a new idea`,disabled:true}:m.owner?null:{label:'Only the author can revise it',disabled:true};
 const wait=m.nextVersionAt&&m.nextVersionAt>now?Math.ceil((m.nextVersionAt-now)/1000):0;
 if(wait)return {label:`Revise & resubmit (in ${wait} s)`,disabled:true};
 return {label:`Revise & resubmit · ${counterLabel(m.version+1)}`,disabled:false};
}

/** Draws the card into `root`. `onRevise()` opens the form prefilled; `onClose()` closes the sheet. */
export function renderVerdict(root,m,{onRevise,onClose,onChooseLogo,icon}={}){
 if(!root)return;
 const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids);return n;};
 const sec=(title,items,ordered)=>items.length?[el('span',{className:'eyebrow',textContent:title}),el(ordered?'ol':'ul',{className:'verdict-list'},...items.map(x=>el('li',{},...(typeof x==='string'?[x]:[el('b',{textContent:x.what}),x.why?el('span',{className:'why',textContent:' — '+x.why}):'',x.how?el('small',{textContent:x.how}):'']))))]:[];
 root.className='verdict is-'+m.state;root.hidden=false;
 const kids=[el('span',{className:'eyebrow verdict-eyebrow'},...(m.state==='waiting'?[el('i',{className:'pulse',ariaHidden:'true'})]:[]),m.state==='waiting'?'SUB-01 · READING':`SUB-01 · ${m.counter.toUpperCase()}${m.latency?' · '+m.latency:''}`),
  el('h3',{className:'verdict-head',textContent:m.headline})];
 if(m.state==='waiting')kids.push(el('p',{className:'verdict-wait',textContent:m.waitNote}),el('p',{className:'fine',textContent:'He answers in seconds when he is at his desk. You can close this; the building tells you the rest.'}));
 else{
  if(m.summary)kids.push(el('p',{className:'verdict-summary',textContent:m.summary}));
  // while he builds: the live timeline first, his notes folded under "Why he builds it"
  const why=[...sec('What he liked',m.likes),...sec("What he didn't like",m.dislikes),...sec("What he'd change",m.suggestions,true)];
  if(m.state==='build'&&m.build){kids.push(renderBuild(el('div',{className:'build'}),m.build,{icon,onChooseLogo:m.build.ready&&m.owner?onChooseLogo:null,readyLine:m.fidelity?.verdict==='missing'?GAP_LINE:READY_LINE}));
   const fit=m.fidelity&&m.fidelity.verdict!=='match'?renderFidelity(el('div',{className:'fit'}),m.fidelity):null;if(fit)kids.push(fit);
   if(why.length)kids.push(el('details',{className:'verdict-why'},el('summary',{textContent:'Why he builds it'}),...why));}
  else kids.push(...why);
  if(m.state==='pass'&&m.wouldBuildIf)kids.push(el('span',{className:'eyebrow',textContent:'He would build it if…'}),el('p',{className:'verdict-if',textContent:m.wouldBuildIf}));
  if(m.context.length)kids.push(el('p',{className:'fine verdict-context',textContent:m.context.join(' ')}));
  if(m.history&&m.history.includes('→'))kids.push(el('p',{className:'fine',textContent:'Verdicts: '+m.history}));
  if(m.state==='build'&&m.next&&!m.build)kids.push(el('p',{className:'fine verdict-next',textContent:m.next}));
 }
 const row=el('div',{className:'verdict-actions'});
 const rb=reviseButton(m);
 if(rb){const b=el('button',{type:'button',className:'button button-orange',id:root.id+'-revise',disabled:rb.disabled,textContent:rb.label});if(!rb.disabled&&onRevise)b.onclick=onRevise;row.append(b);}
 if(m.state==='build'&&m.next&&!m.build&&onChooseLogo)row.append(el('button',{type:'button',className:'button button-orange',textContent:'Choose your logo on your PC',onclick:onChooseLogo}));
 if(onClose)row.append(el('button',{type:'button',className:'button button-ghost',textContent:m.state==='waiting'?'Close, I will come back':m.state==='build'?'Watch the building':'Close',onclick:onClose}));
 if(row.childElementCount)kids.push(row);
 root.replaceChildren(...kids);
 return root;
}

// ---------------------------------------------------------------- the build, step by step (2026-10-12)
// GET /api/ideas/:id `build` and the stream's `build` frame (backend build-steps.js, CITY-API.md "The build, step by
// step"). The server sends a frame when a step changes; between frames the card counts down by itself with the same
// rule the server uses: the medians of the steps not started + what is left of the running one, a step past its median
// extended to its p90 and then by another p90 at a time, never negative. `now` is the server clock (build.now + the
// time since the build arrived), so a phone with a wrong clock still counts right.
export const BUILD_ICONS={queued:'clock',brief:'think',app:'wrench',fit:'target',art:'brush',site:'globe',qa:'check',ready:'rocket'};
// fit (2026-10-12, backend fidelity.js): "Does it match the idea?"; its `flag` is 'missing' | 'partial' when the build is not all of it
const FLAGS=new Set(['missing','partial']);
const WORK=new Set(['brief','app','fit','art','site','qa']),STEP_STATES=new Set(['todo','running','done','failed','skipped']),BUILD_STATES=new Set(['queued','running','retrying','ready','failed']);
const fin=v=>{if(v==null||v==='')return null;v=Number(v);return Number.isFinite(v)?v:null;};
/** A build from the server, cleaned (unknown fields dropped, numbers checked). null when there is none. */
export function cleanBuild(b,receivedAt=Date.now()){
 if(!b||typeof b!=='object'||!Array.isArray(b.steps))return null;
 const steps=b.steps.filter(s=>s&&typeof s==='object'&&str(s.id)).slice(0,10).map(s=>({id:str(s.id),label:str(s.label)||str(s.id),state:STEP_STATES.has(s.state)?s.state:'todo',
  startedAt:fin(s.startedAt),endedAt:fin(s.endedAt),provider:str(s.provider).slice(0,60)||null,plannedProvider:str(s.plannedProvider).slice(0,60)||null,note:str(s.note).slice(0,200)||null,
  expectedSeconds:fin(s.expectedSeconds),p90Seconds:fin(s.p90Seconds),elapsedSeconds:fin(s.elapsedSeconds),flag:FLAGS.has(s.flag)?s.flag:null}));
 const q=b.queue&&typeof b.queue==='object'?{position:Math.max(1,Math.floor(fin(b.queue.position)||1)),startsInSeconds:Math.max(0,fin(b.queue.startsInSeconds)||0)}:null;
 return {state:BUILD_STATES.has(b.state)?b.state:'running',steps,startedAt:fin(b.startedAt),etaSeconds:fin(b.etaSeconds),percent:Math.max(0,Math.min(100,fin(b.percent)||0)),
  queue:q,attempt:Math.max(1,fin(b.attempt)||1),now:fin(b.now)??receivedAt,receivedAt};
}
/** The server's clock now, for a build received at `receivedAt` (client ms). */
export const serverNow=(build,clientNow=Date.now())=>build?build.now+(clientNow-(build.receivedAt??build.now)):clientNow;
/** Seconds left in a running step (the server's rule). */
export function stepLeft(expected,p90,elapsed){
 const e=Math.max(0,elapsed||0),x=Math.max(0,expected||0),p=Math.max(x,p90||x);
 if(e<x)return x-e;if(e<p)return p-e;const c=Math.max(1,p);return c-((e-p)%c);
}
/** -> {remaining (s, null when stopped), wait (s in line), percent} at server time t. */
export function liveEta(build,t){
 if(!build)return null;
 if(build.state==='ready')return {remaining:0,wait:0,percent:100};
 if(build.state==='failed')return {remaining:null,wait:0,percent:build.percent};
 const retry=build.state==='retrying';let rem=0,done=0;
 for(const s of build.steps){if(!WORK.has(s.id))continue;
  const st=retry?'todo':s.state;
  if(st==='done'||st==='skipped'){done+=Math.max(0,((s.endedAt??s.startedAt??0)-(s.startedAt??0))/1000);continue;}
  if(st==='failed')continue;
  if(st==='running'&&s.startedAt!=null){const el=Math.max(0,(t-s.startedAt)/1000);done+=el;rem+=stepLeft(s.expectedSeconds,s.p90Seconds,el);}
  else rem+=Math.max(0,s.expectedSeconds||0);}
 const wait=build.queue?Math.max(0,build.queue.startsInSeconds-(t-build.now)/1000):0;
 const waiting=build.state==='queued'||retry;
 return {remaining:wait+rem,wait,percent:waiting?0:done+rem>0?Math.min(99,Math.floor(100*done/(done+rem))):0};
}
/** "45 s", "1 min 40 s", "12 min" (a countdown: seconds rounded up, to 5 s past a minute). */
export function durationLabel(s){
 s=Number(s);if(!Number.isFinite(s)||s<0)return '';
 if(s<60)return `${Math.max(1,Math.ceil(s))} s`;
 const r=Math.ceil(s/5)*5,m=Math.floor(r/60),sec=r%60;
 return m>=10||!sec?`${Math.round(r/60)} min`:`${m} min ${sec} s`;
}
/** "~1 min left" for the place card: a coarser word (minutes past a minute, 5 s steps below). */
export function leftLabel(s){s=Number(s);if(!Number.isFinite(s)||s<0)return '';if(s<60)return `~${Math.max(5,Math.ceil(s/5)*5)} s left`;return `~${Math.round(s/60)} min left`;}
export const ordinal=n=>{n=Math.floor(Number(n)||0);const t=n%100,o=n%10;return n+(t>=11&&t<=13?'th':o===1?'st':o===2?'nd':o===3?'rd':'th');};
/** "Next in line, starts in a moment" / "2nd in line, starts in ~1 min". */
export function queueLine(build,t){
 if(!build?.queue)return '';const w=Math.max(0,build.queue.startsInSeconds-(t-build.now)/1000),p=build.queue.position;
 const when=w<5?'starts in a moment':`starts in ~${durationLabel(w)}`;
 return build.state==='retrying'?`Trying again: ${when}`:p<=1?`Next in line, ${when}`:`${ordinal(p)} in line, ${when}`;
}
/**
 * buildModel(build, t) -> null | {state, ready, failed, countdown, sub, percent, steps:[{id,icon,label,state,provider,time,note}]}
 * countdown: "Ready in ~1 min 40 s" | "Almost ready…" | "Your site is ready" | "Stopped". t: server time (serverNow).
 */
export function buildModel(build,t){
 if(!build)return null;
 const e=liveEta(build,t),ready=build.state==='ready',failed=build.state==='failed';
 const countdown=ready?'Your site is ready':failed?'The build stopped':e.remaining<2?'Almost ready…':`Ready in ~${durationLabel(e.remaining)}`;
 const sub=ready?`Built in ${durationLabel(build.steps.filter(s=>WORK.has(s.id)).reduce((a,s)=>a+Math.max(0,((s.endedAt??s.startedAt??0)-(s.startedAt??0))/1000),0))}.`
  :failed?'Nothing was published. A SUBZERONE admin sees it; the reason is in your room computer.'
  :build.queue?queueLine(build,t):build.attempt>1?`Second try · ${e.percent}% done`:`${e.percent}% done`;
 const steps=build.steps.map(s=>{
  const el=s.state==='running'&&s.startedAt!=null?Math.max(0,(t-s.startedAt)/1000):s.state==='done'&&s.startedAt!=null?Math.max(0,((s.endedAt??s.startedAt)-s.startedAt)/1000):null;
  const time=s.id==='ready'?'':s.state==='done'?(s.id==='queued'&&el<1?'':durationLabel(el)):s.state==='running'?(s.id==='queued'?durationLabel(el):`${durationLabel(el)} of ~${durationLabel(Math.max(s.expectedSeconds||0,el))}`)
   :s.state==='todo'&&s.expectedSeconds!=null?`~${durationLabel(s.expectedSeconds)}`:s.state==='failed'?'stopped':s.state==='skipped'?'skipped':'';
  return {id:s.id,icon:BUILD_ICONS[s.id]||'note',label:s.label,state:s.state,provider:s.state==='todo'?(s.plannedProvider||''):(s.provider||''),time,note:s.note||'',flag:s.flag||null};
 });
 const gap=steps.some(s=>s.flag==='missing')?'missing':steps.some(s=>s.flag==='partial')?'partial':null;
 return {state:build.state,ready,failed,countdown:ready&&gap==='missing'?'Built, but not all of your idea':countdown,sub,percent:e.percent,remaining:e.remaining,steps,gap};
}
/** The building's place card while he builds: "Building · 62% · ~1 min left" / "In line · 2nd · ready in ~3 min". summary: /api/world project.build. */
export function placeBuildLine(summary,t){
 if(!summary||typeof summary!=='object')return null;
 const eta=fin(summary.etaAt),left=eta!=null?Math.max(0,(eta-t)/1000):fin(summary.etaSeconds),pct=Math.max(0,Math.min(100,Math.floor(fin(summary.percent)||0)));
 if(summary.state==='ready')return 'Built · ready for review';
 if(summary.state==='failed')return null;
 if(summary.state==='queued'||summary.state==='retrying'){const p=fin(summary.queuePosition);return `${summary.state==='retrying'?'Trying again':'In line'}${p?` · ${p<=1?'next':ordinal(p)}`:''}${left!=null?` · ready in ~${durationLabel(left)}`:''}`;}
 return `Building · ${pct}%${left!=null?' · '+(left<2?'almost done':leftLabel(left)):''}`;
}
/** The world summary from a full build (a `build` frame updates the building between /api/world reads). */
export function summaryOf(build){
 if(!build)return null;const e=liveEta(build,build.now),cur=build.steps.find(s=>s.state==='running'&&s.id!=='queued')||null;
 return {state:build.state,percent:e.percent,etaSeconds:e.remaining,etaAt:e.remaining==null?null:Math.round(build.now+e.remaining*1000),step:cur?{id:cur.id,label:cur.label}:null,queuePosition:build.queue?.position??null,now:build.now};
}
export const READY_LINE='Your site is ready — choose your logo on your PC.';
// a build that is not all of the idea (fit step flagged 'missing'): never presented as done-and-good
export const GAP_LINE='Your site is ready, but it is not all of your idea yet: see what is missing below and on your PC.';

/**
 * "Does it match the idea?" (GET /api/ideas/:id and /api/projects/:slug `fidelity`, backend fidelity.js), cleaned.
 * -> null | {verdict:'match'|'partial'|'missing', message, built, missing:[{feature,reason}], partial:[{feature,reason}], built:[{feature}]}
 */
export function fidelityModel(f){
 if(!f||typeof f!=='object'||!Array.isArray(f.core))return null;
 const verdict=['match','partial','missing'].includes(f.verdict)?f.verdict:null;if(!verdict)return null;
 const rows=st=>f.core.filter(x=>x&&x.status===st&&str(x.feature)).slice(0,5).map(x=>({feature:str(x.feature).slice(0,90),reason:str(x.reason).slice(0,220)}));
 return {verdict,message:str(f.message).slice(0,1200),builtLine:str(f.built).slice(0,300),missing:rows('missing'),partial:rows('partial'),built:rows('built'),
  source:f.source==='model'?'language model':'rules (no AI)'};
}

/** Draws the timeline into `root` (a <div class="build">). {icon} from icons.js; onChooseLogo once it is ready. */
export function renderBuild(root,bm,{icon,onChooseLogo,readyLine=READY_LINE,buttonLabel='Choose your logo on your PC'}={}){
 if(!root||!bm)return root;
 if(bm.gap==='missing')readyLine=GAP_LINE;   // not all of the idea: never presented as done-and-good
 const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null&&k!==''));return n;};
 const ic=(id,cls)=>icon?icon(id,cls):null;
 root.className=['build','is-'+bm.state,...(bm.gap==='missing'?['has-gap']:[]),...[...root.classList].filter(c=>c!=='build'&&c!=='has-gap'&&!c.startsWith('is-'))].join(' ');   // keeps the host's own classes (pc-build)
 const head=el('div',{className:'build-head'},el('strong',{className:'build-count',textContent:bm.countdown}),el('span',{className:'build-sub',textContent:bm.sub}));
 const bar=el('div',{className:'build-bar'},el('i'));bar.firstChild.style.width=bm.percent+'%';bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuenow',String(bm.percent));bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-label','Build progress');
 const list=el('ol',{className:'build-steps'},...bm.steps.map(s=>el('li',{className:'build-step is-'+s.state+(s.flag?' is-flag is-'+s.flag:'')},
  el('span',{className:'build-dot'},s.flag?ic('info'):s.state==='done'?ic('check'):s.state==='failed'?ic('x'):ic(s.icon)),
  el('span',{className:'build-main'},el('b',{textContent:s.label}),s.provider?el('small',{className:'build-prov',textContent:s.state==='todo'?s.provider:s.provider}):null,s.note&&s.state!=='todo'?el('small',{className:'build-note',textContent:s.note}):null),
  el('span',{className:'build-time',textContent:s.time}))));
 bm.steps.forEach((s,i)=>{list.children[i].dataset.step=s.id;});
 const kids=[head,bar,list];
 if(bm.ready){kids.push(el('p',{className:'build-ready',textContent:readyLine}));if(onChooseLogo)kids.push(el('div',{className:'verdict-actions'},el('button',{type:'button',className:'button button-orange',textContent:buttonLabel,onclick:onChooseLogo})));}
 root.replaceChildren(...kids);
 return root;
}

/** Draws "what he could not build yet" into `root` (a <div class="fit">): SUB-01's words, the missing and partial features. */
export function renderFidelity(root,fm,{title}={}){
 if(!root||!fm||fm.verdict==='match')return null;
 const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null&&k!==''));return n;};
 const list=(items)=>el('ul',{className:'fit-list'},...items.map(x=>el('li',null,el('b',{textContent:x.feature}),x.reason?el('span',{textContent:x.reason}):null)));
 root.className=['fit','is-'+fm.verdict,...[...root.classList].filter(c=>c!=='fit'&&!c.startsWith('is-'))].join(' ');
 const miss=fm.verdict==='missing';
 root.replaceChildren(...[el('span',{className:'eyebrow fit-eyebrow',textContent:title||(miss?'Missing from your idea':'Only part of your idea')}),
  // SUB-01's own voice (the backend writes the same in his message)
  el('p',{className:'fit-lead',textContent:miss?"I can't build all of your idea yet. What is missing, and why:":'I built most of it. Only in part:'}),
  fm.missing.length?list(fm.missing):null,
  miss&&fm.partial.length?el('span',{className:'fit-sub',textContent:'Built only in part'}):null,fm.partial.length?list(fm.partial):null,
  fm.builtLine?el('p',{className:'fit-built'},el('b',{textContent:miss?'What I built instead: ':'What I built: '}),fm.builtLine+'.'):null,
  el('p',{className:'fine fit-fine',textContent:miss?"The site's words say only what it really does, never the missing parts. You can still publish it as it is.":"The site's words say only what it really does."})].filter(Boolean));
 return root;
}
