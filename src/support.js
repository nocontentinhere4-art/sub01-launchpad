// Help / support, the pure half (tested, no DOM): the report sheet's model, the ring of the city's last failed calls,
// the launch flow's last state, the context the author sees before sending, and the read tokens kept in this browser.
// support-ui.js draws the sheet; api.js feeds the ring; desk.js notes the launch flow. Server: POST /api/support,
// GET /api/support/mine (wallet session and/or the x-support-token header), launchpad src/support.js.
// Never in the context: private keys, signed transactions, cookies, tokens. Only short, allow-listed fields.
export const CATEGORIES=[['launch','Launch'],['wallet','Wallet / Phantom'],['devbuy','Dev buy'],['site','My site'],['x','X'],['other','Other']];
export const CATEGORY_IDS=CATEGORIES.map(c=>c[0]);
export const MESSAGE_MIN=10,MESSAGE_MAX=2000,CONTACT_MAX=64,RING_MAX=10,TOKENS_MAX=20;
export const TOKENS_KEY='sub01.support.tokens';
export const SENT_LINE='Sent — we read every report; you\'ll see the answer here.';
export const STATUS_WORDS={open:'Open',in_progress:'Being looked at',answered:'Answered',closed:'Closed'};
const str=v=>typeof v==='string'?v:v==null?'':String(v);

// ---------------------------------------------------------------- the error ring (api.js pushes, the sheet reads)
// The path without its query (no token ever rides in one here; a pasted one would), the server's code and words.
export function errorEntry({method='GET',path='',status=0,code='',message=''}={},at=Date.now()){
 return {at,method:str(method).toUpperCase().slice(0,7),path:str(path).split(/[?#]/)[0].slice(0,120),status:Number(status)||0,code:str(code).slice(0,60),message:str(message).replace(/\s+/g,' ').trim().slice(0,200)};
}
export function createRing(max=RING_MAX){
 const items=[];
 return {push(e){items.push(e);while(items.length>max)items.shift();return e;},list:()=>items.slice(),clear(){items.length=0;},get size(){return items.length;}};
}
export const errorRing=createRing();
// The support calls themselves stay out of the ring (a failed report must not report itself).
export function recordError(e,ring=errorRing){const x=errorEntry(e);if(/^\/api\/support(\/|$)/.test(x.path))return null;return ring.push(x);}

// ---------------------------------------------------------------- the launch flow's last state (desk.js)
let lastLaunch=null;
/** desk.js calls it as the stepper draws and when a launch / dev-buy call fails. Fields are merged; an error replaces
 *  the last one, a fresh view without an error keeps it (the author reports after it happened). */
export function noteLaunch(n){
 if(!n||typeof n!=='object')return lastLaunch;
 // another project: start over (its error is not this one's)
 const next=n.slug&&lastLaunch?.slug&&n.slug!==lastLaunch.slug?{}:{...lastLaunch};
 for(const k of ['slug','projectStatus','intentId','intentStatus','step','name'])if(n[k]!=null&&n[k]!=='')next[k]=str(n[k]).slice(0,80);
 if(n.message!=null&&n.message!==''){next.message=str(n.message).replace(/\s+/g,' ').trim().slice(0,300);next.code=str(n.code).slice(0,60);next.httpStatus=Number(n.httpStatus)||0;next.at=n.at||Date.now();}
 lastLaunch=next;return lastLaunch;
}
export const launchNote=()=>lastLaunch;
export const resetLaunchNote=()=>{lastLaunch=null;};

// ---------------------------------------------------------------- what opens the sheet
// source: 'help' (the button) | 'stepper' (the PC's "Report a problem") | 'launch_error' | 'devbuy_error' (next to one)
export function prefill({source='help',category,step,error}={}){
 const src=['help','stepper','launch_error','devbuy_error'].includes(source)?source:'help';
 const cat=CATEGORY_IDS.includes(category)?category:src==='devbuy_error'?'devbuy':src==='help'?'':'launch';
 const err=str(error).replace(/\s+/g,' ').trim().slice(0,400);
 const lines=[];
 if(src!=='help'){lines.push(step?`I was on the "${str(step).slice(0,40)}" step of the launch.`:'I was launching from my room\'s PC.');if(err)lines.push(`It said: "${err}"`);lines.push('What I did just before: ');}
 return {source:src,category:cat,message:lines.join('\n'),step:str(step).slice(0,24)||null,error:err||null};
}

// ---------------------------------------------------------------- secrets: warn before anything leaves the browser
// Mirrors the server's scrubber (launchpad src/support.js): the server removes them anyway; here the author is told.
const SECRET=[/\[\s*\d{1,3}(?:\s*,\s*\d{1,3}){31,}\s*\]/,/(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{80,}(?![1-9A-HJ-NP-Za-km-z])/,/(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{120,}/,
 /(?<![0-9a-fA-F])[0-9a-fA-F]{64,}(?![0-9a-fA-F])/,/\b(?:[a-z]{3,8}[ \t]+){11,23}[a-z]{3,8}\b/,/\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|\d{8,10}:[A-Za-z0-9_-]{30,})\b/,/\b(?:private[_ -]?key|seed phrase|secret phrase|recovery phrase)\b\s*[:=]/i];
export const looksSecret=s=>SECRET.some(re=>re.test(str(s)));
export const SECRET_LINE='That looks like a private key, a seed phrase or a signed transaction. Never send those to anyone, us included: remove it to send.';

// ---------------------------------------------------------------- the form
const CONTACT=/^[A-Za-z0-9@_.:/+ -]{2,64}$/;
/** form -> {ok, problem, body}. body is exactly what POST /api/support takes. */
export function sheetModel({category='',message='',contact='',include=true,source='help'}={},context=null){
 const msg=str(message).trim(),c=str(contact).trim();
 let problem=null;
 if(!CATEGORY_IDS.includes(category))problem='Pick what it is about.';
 else if(msg.length<MESSAGE_MIN)problem=`Tell us a little more (at least ${MESSAGE_MIN} characters).`;
 else if(msg.length>MESSAGE_MAX)problem=`At most ${MESSAGE_MAX} characters (${msg.length} now).`;
 else if(c&&!CONTACT.test(c))problem='Contact: an X handle (@name) or a Telegram handle, nothing else.';
 else if(looksSecret(msg)||looksSecret(c))problem=SECRET_LINE;
 const body={category,message:msg,source:['help','stepper','launch_error','devbuy_error'].includes(source)?source:'help',...(c?{contact:c}:{}),context:include&&context?context:null};
 return {ok:!problem,problem,body,count:`${msg.length} / ${MESSAGE_MAX}`};
}

// ---------------------------------------------------------------- the context (shown to the author before sending)
const WALLET=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** env: {me, launch, errors, bundle, userAgent, viewport, wallets, page, language, place} -> the context object (short fields only). */
export function buildContext({me=null,launch=null,errors=[],bundle='',userAgent='',viewport='',wallets=[],page='',language='',place=null}={}){
 const w=str(me?.user?.wallet),l=launch&&typeof launch==='object'?launch:null;
 const slug=str(l?.slug||place?.slug),status=str(l?.projectStatus||place?.status);
 const ctx={signedIn:!!me?.user,...(WALLET.test(w)?{wallet:w}:{}),
  ...(slug?{project:{slug,...(status?{status}:{}),...(l?.name||place?.name?{name:str(l?.name||place?.name).slice(0,60)}:{})}}:{}),
  ...(l&&(l.intentId||l.message||l.step)?{launch:Object.fromEntries(Object.entries({intentId:l.intentId,step:l.step,status:l.intentStatus,code:l.code,message:l.message,httpStatus:l.httpStatus||null,at:l.at||null}).filter(([,v])=>v!=null&&v!==''))}:{}),
  errors:(Array.isArray(errors)?errors:[]).slice(-RING_MAX).map(e=>errorEntry(e,e?.at)),
  bundle:str(bundle).slice(0,64),userAgent:str(userAgent).slice(0,300),viewport:str(viewport).slice(0,40),
  wallets:(Array.isArray(wallets)?wallets:[]).map(x=>str(x).slice(0,32)).filter(Boolean).slice(0,10),page:str(page).slice(0,200),language:str(language).slice(0,20)};
 for(const k of Object.keys(ctx))if(ctx[k]===''||(Array.isArray(ctx[k])&&!ctx[k].length))delete ctx[k];
 return ctx;
}
/** The context as the lines the author reads before sending: [[label, value]]. */
export function contextLines(ctx){
 if(!ctx)return [];
 const rows=[];
 rows.push(['Wallet',ctx.wallet?`${ctx.wallet.slice(0,4)}…${ctx.wallet.slice(-4)} (signed in)`:ctx.signedIn?'signed in':'not signed in']);
 if(ctx.project)rows.push(['Project',[ctx.project.slug,ctx.project.status].filter(Boolean).join(' · ')]);
 if(ctx.launch)rows.push(['Launch',[ctx.launch.step&&`step ${ctx.launch.step}`,ctx.launch.intentId,ctx.launch.status,ctx.launch.code,ctx.launch.message].filter(Boolean).join(' · ')]);
 rows.push(['Recent errors',ctx.errors?.length?ctx.errors.map(e=>`${e.method} ${e.path} → ${e.status||'network'}${e.code?` ${e.code}`:''}`).join('\n'):'none']);
 rows.push(['Wallet apps',ctx.wallets?.length?ctx.wallets.join(', '):'none detected']);
 rows.push(['Browser',[ctx.viewport,ctx.language,ctx.bundle&&`city ${ctx.bundle}`].filter(Boolean).join(' · ')]);
 if(ctx.userAgent)rows.push(['User agent',ctx.userAgent]);
 if(ctx.page)rows.push(['Page',ctx.page]);
 return rows;
}
/** The city bundle's name from the page's module script (/assets/index-<hash>.js), or 'dev'. */
export const bundleOf=src=>{const m=/assets\/(index-[A-Za-z0-9_-]+)\.js/.exec(str(src));return m?m[1]:'dev';};

// ---------------------------------------------------------------- read tokens (anonymous reports) in localStorage
export function loadTokens(store){
 try{const v=JSON.parse(store?.getItem(TOKENS_KEY)||'[]');return Array.isArray(v)?v.filter(t=>typeof t==='string'&&/^[A-Za-z0-9_-]{20,64}$/.test(t)).slice(-TOKENS_MAX):[];}catch{return [];}
}
export function saveToken(token,store){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{20,64}$/.test(token))return false;
 const list=[...loadTokens(store).filter(t=>t!==token),token].slice(-TOKENS_MAX);
 try{store.setItem(TOKENS_KEY,JSON.stringify(list));return true;}catch{return false;}
}

// ---------------------------------------------------------------- "My reports"
export function timeAgo(at,now=Date.now()){const d=(now-Number(at))/1e3;if(!Number.isFinite(d))return '';if(d<90)return 'just now';if(d<5400)return `${Math.round(d/60)} min ago`;if(d<129600)return `${Math.round(d/3600)} h ago`;return `${Math.round(d/86400)} d ago`;}
/** GET /api/support/mine -> [{id, category, status, statusWord, message, ago, replies:[{from,text,ago}], answered}] newest first. */
export function reportsModel(res,now=Date.now()){
 const list=Array.isArray(res?.tickets)?res.tickets:[];
 const label=Object.fromEntries(CATEGORIES);
 return list.filter(t=>t&&typeof t==='object'&&typeof t.id==='string').sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0)).map(t=>{
  const replies=(Array.isArray(t.replies)?t.replies:[]).filter(r=>r&&typeof r.text==='string').map(r=>({from:str(r.from)||'SUBZERONE support',text:r.text,ago:timeAgo(r.at,now)}));
  const status=STATUS_WORDS[t.status]?t.status:'open';
  return {id:t.id,category:label[t.category]||'Other',status,statusWord:STATUS_WORDS[status],message:str(t.message),ago:timeAgo(t.createdAt,now),replies,answered:replies.length>0};
 });
}
