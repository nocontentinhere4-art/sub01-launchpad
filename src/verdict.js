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
  canRevise:idea.canRevise===true,owner:idea.owner!==false,latency:latencyLabel(Number(ev?.latencyMs))};
 if(ev&&(ev.verdict==='build'||ev.decision==='selected'))return {...base,state:'build',headline:'He builds it.',summary:str(f.summary)||'SUB-01 voted to build it. The building rises while he works.',waitNote:'',canRevise:false,wouldBuildIf:null,next:base.owner?NEXT_LOGO:''};
 if(ev&&(ev.verdict==='pass'||ev.decision==='declined'))return {...base,state:'pass',headline:'He passed.',summary:str(f.summary)||'SUB-01 voted pass. Nothing is built.',waitNote:''};
 if(idea.status==='failed')return {...base,state:'failed',headline:'He could not read it.',summary:str(idea.statusNote)||'His brain did not answer. Nothing was decided; a reviewer will retry it.',waitNote:'',canRevise:false};
 if(READING.has(idea.status))return {...base,state:'waiting',headline:'SUB-01 is reading…',summary:'',waitNote:waitingLine(idea,now),canRevise:false};
 return {...base,state:'build',headline:'He builds it.',summary:str(f.summary)||'SUB-01 is building it.',waitNote:'',canRevise:false,wouldBuildIf:null,next:base.owner?NEXT_LOGO:''};
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
  kids.push(...sec('What he liked',m.likes),...sec("What he didn't like",m.dislikes),...sec("What he'd change",m.suggestions,true));
  if(m.state==='pass'&&m.wouldBuildIf)kids.push(el('span',{className:'eyebrow',textContent:'He would build it if…'}),el('p',{className:'verdict-if',textContent:m.wouldBuildIf}));
  if(m.context.length)kids.push(el('p',{className:'fine verdict-context',textContent:m.context.join(' ')}));
  if(m.history&&m.history.includes('→'))kids.push(el('p',{className:'fine',textContent:'Verdicts: '+m.history}));
  if(m.state==='build'&&m.next)kids.push(el('p',{className:'fine verdict-next',textContent:m.next}));
 }
 const row=el('div',{className:'verdict-actions'});
 const rb=reviseButton(m);
 if(rb){const b=el('button',{type:'button',className:'button button-orange',id:root.id+'-revise',disabled:rb.disabled,textContent:rb.label});if(!rb.disabled&&onRevise)b.onclick=onRevise;row.append(b);}
 if(m.state==='build'&&m.next&&onChooseLogo)row.append(el('button',{type:'button',className:'button button-orange',textContent:'Choose your logo on your PC',onclick:onChooseLogo}));
 if(onClose)row.append(el('button',{type:'button',className:'button button-ghost',textContent:m.state==='waiting'?'Close, I will come back':m.state==='build'?'Watch the building':'Close',onclick:onClose}));
 if(row.childElementCount)kids.push(row);
 root.replaceChildren(...kids);
 return root;
}
