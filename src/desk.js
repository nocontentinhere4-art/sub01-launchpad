import * as THREE from 'three';
import {icon,tile} from './icons.js';
import {api,short,b58encode} from './api.js';
import {lastWallet,signMessage,signTransaction,describeError} from './wallet.js';
import {verdictModel,renderVerdict} from './verdict.js';
import {launchSteps,stepIndex,reviewModel,xModel,xChip,explainError,chainFor,X_WAIT_MS,X_POLL_MS,STAGE_LABELS,profileKit,devBuyModel,parseDevBuy,showDevBuyOn,toolsModel,toggleTool,setField,toolsProblem,toolsPayload,toolsCount} from './desk-flows.js';
export {launchSteps,reviewModel,xModel,xChip,explainError,solText,splitRows,devBuyModel,parseDevBuy,showDevBuyOn} from './desk-flows.js';
import {solText,splitRows} from './desk-flows.js';
// The computer in a resident's room: each screen shows one of the owner's projects (a CanvasTexture), and tapping it opens
// the Computer overlay: the project's site, its X account, the launch stepper and (owner only) the ideas in flight.
// The Launch and X tabs read GET /api/projects/:slug themselves (owner view when signed in); desk-flows.js has the models.
// Data: GET /api/rooms/:plotId → desk:{projects,ideas}. Fields may be missing; everything below is defensive.
// Owner-only fields (previewLink, officePath, x.posts, ideas) are dropped client-side for visitors even if the payload leaks them.
// Host hook: host.openIdea() opens the mailbox (main.js wires it to openBuildForm); without it the Ideas tab shows a note.

// ---------------------------------------------------------------- data (pure, tested)
export const SCREEN_ITEMS=new Set(['computerScreen','laptop','televisionModern']);
// iframe sandboxes, matching the server: a public project site runs the audited site kit (backend docs/SITE-KIT.md) on
// its OWN origin (<slug>.projects…, never the city's), so it gets scripts + that origin + downloads (meme PNG, .ics), and
// still no top navigation and no forms; the owner's preview is framed with sandbox="" like the review page (static);
// /projects pages are the launchpad's own app, which needs scripts and its cookie.
export const SANDBOX={site:'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads',preview:'',page:'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'};
export const TAB_LABELS={site:'Site',x:'X',launch:'Launch',ideas:'Ideas'},TAB_ICONS={site:'globe',x:'xlogo',launch:'rocket',ideas:'mail'};
const str=v=>typeof v==='string'?v.trim():'';
// Only http(s) URLs and same-origin paths ever reach an href or an iframe (no javascript:, data:, protocol-relative).
export function safeHref(u){u=str(u);if(!u)return null;if(/^\/(?!\/)/.test(u))return u;try{const p=new URL(u);return p.protocol==='https:'||p.protocol==='http:'?p.href:null;}catch{return null;}}
const safePath=u=>{u=safeHref(u);return u&&u.startsWith('/')?u:null;};
const clamp01=v=>{v=Number(v);return Number.isFinite(v)?Math.min(1,Math.max(0,v)):0;};
const POST_STATUS=new Set(['draft','pending','approved','scheduled','posted','rejected','failed']);
export function deskModel(desk,mine){
 const d=desk&&typeof desk==='object'?desk:{};mine=!!mine&&d.viewer!=='visitor';   // the server's word can only take ownership away
 const projects=(Array.isArray(d.projects)?d.projects:[]).filter(p=>p&&typeof p==='object'&&(str(p.slug)||str(p.name))&&(mine||(p.public!==false&&p.visibility!=='private'))).map(p=>{
  const x=p.x&&typeof p.x==='object'?p.x:{},handle=str(x.handle).replace(/^@/,'').replace(/[^\w]/g,'').slice(0,30),status=x.status==='connected'||x.status==='planned'?x.status:null;
  return {slug:str(p.slug),name:str(p.name)||'Untitled project',ticker:str(p.ticker).replace(/^\$/,'').toUpperCase().slice(0,10),stage:str(p.stage),stageLabel:str(p.stageLabel)||str(p.stage).replace(/_/g,' ')||'In the mailbox',
   progress:clamp01(p.progress),launched:!!p.launched,mint:str(p.mint),explorerTx:safeHref(p.explorerTx),siteUrl:safeHref(p.siteUrl),previewLink:mine?safeHref(p.previewLink):null,
   logoUrl:safeHref(p.logoUrl),bannerUrl:safeHref(p.bannerUrl),
   x:{handle,status,url:status==='connected'?safeHref(x.url)||(handle?`https://x.com/${handle}`:null):null,
    posts:mine&&Array.isArray(x.posts)?x.posts.filter(q=>q&&str(q.text)).slice(0,6).map(q=>({id:str(String(q.id??'')),text:str(q.text).slice(0,280),status:POST_STATUS.has(q.status)?q.status:'draft'})):[]},
   pagePath:safePath(p.pagePath)||(str(p.slug)?`/projects/${encodeURIComponent(str(p.slug))}`:null),officePath:mine?safePath(p.officePath):null};
 }).sort((a,b)=>(b.launched-a.launched)||(b.progress-a.progress)||a.name.localeCompare(b.name));
 const ideas=mine&&Array.isArray(d.ideas)?d.ideas.filter(i=>i&&str(i.title)).slice(0,12).map(i=>({id:str(String(i.id??'')),title:str(i.title).slice(0,80),status:str(i.status),stageLabel:str(i.stageLabel)||str(i.status).replace(/_/g,' ')})):[];
 return {mine,projects,ideas};
}
export const hasDesk=m=>!!(m&&(m.projects.length||m.mine));
// Projects first (launched first), then the owner's ideas: what the title-bar switcher lists.
export const switcherItems=m=>[...m.projects.map(p=>({key:'p:'+(p.slug||p.name),kind:'project',label:p.ticker?`${p.name} · $${p.ticker}`:p.name,project:p})),
 ...m.ideas.map(i=>({key:'i:'+i.id,kind:'idea',label:`✉ ${i.title}`,idea:i}))];
export function tabsFor(m,project){
 if(!project)return m.mine?['ideas']:[];
 return ['site','x',...(project.pagePath?['launch']:[]),...(m.mine?['ideas']:[])];
}
// The address the Site tab frames: the owner sees the same-origin preview first (drafts too), visitors only the public site.
export const siteFor=(p,mine)=>{const preview=!!(mine&&p?.previewLink),src=preview?p.previewLink:p?.siteUrl||null;
 return {src,preview,open:p?.siteUrl||src,sandbox:preview?SANDBOX.preview:SANDBOX.site,empty:src?null:`SUB-01 hasn't built this yet. Stage: ${p?.stageLabel||'in the mailbox'}.`};};
export const X_STATUS={connected:'Connected',planned:'Planned',null:'Not set up yet'};
export function screenCard(p,mine){
 if(!p)return mine?{title:'Drop an idea',ticker:'',stage:'Tap the computer · the mailbox is open',kind:'wallpaper'}:{title:'SUBZERONE',ticker:'',stage:'zzz',kind:'screensaver'};
 return {title:p.name,ticker:p.ticker?'$'+p.ticker:'',stage:p.launched?'Live · launched':p.stageLabel,progress:p.progress,kind:'project'};
}
export function welcomeText({mine,name,model}){
 const p=model?.projects?.[0];
 if(mine)return p?`Welcome home, ${name}. Your office is on the computer.`:`Welcome home, ${name}. Tap the bed, the desk, the window, the door…`;
 return p?`You are visiting ${name}. Tap the computer to see ${name}'s project.`:`You are visiting ${name}.`;
}

// ---------------------------------------------------------------- screen textures (one 256×160 canvas per project, cached)
const textures=new Map(),MAX_TEX=12;
function fit(g,text,max,font){g.font=font;if(g.measureText(text).width<=max)return text;let t=text;while(t.length>1&&g.measureText(t+'…').width>max)t=t.slice(0,-1);return t+'…';}
function drawCard(g,card,img,w,h){
 const bg=g.createLinearGradient(0,0,w,h);bg.addColorStop(0,card.kind==='screensaver'?'#0b1020':'#1d2a30');bg.addColorStop(1,card.kind==='wallpaper'?'#3a4a6b':'#0f1517');g.fillStyle=bg;g.fillRect(0,0,w,h);
 if(img&&img.kind==='banner'){const s=Math.max(w/img.el.width,h/img.el.height);g.drawImage(img.el,(w-img.el.width*s)/2,(h-img.el.height*s)/2,img.el.width*s,img.el.height*s);
  const shade=g.createLinearGradient(0,h*.45,0,h);shade.addColorStop(0,'#0000');shade.addColorStop(1,'#000c');g.fillStyle=shade;g.fillRect(0,0,w,h);}
 if(card.kind==='screensaver'){g.fillStyle='#fb752b';g.font='bold 26px monospace';g.textAlign='center';g.fillText('SUB',w/2-28,h/2+8);g.fillStyle='#f3efe4';g.fillText('ZERONE',w/2+38,h/2+8);
  g.fillStyle='#ffffff55';g.font='11px monospace';g.fillText('zzz',w/2,h/2+34);g.textAlign='left';return;}
 g.fillStyle='#fb752b';g.fillRect(0,0,w,6);
 let x=16;if(img&&img.kind==='logo'){g.drawImage(img.el,14,h-86,52,52);x=76;}
 g.textAlign='left';g.fillStyle='#ffffff';g.fillText(fit(g,card.title,w-x-12,'bold 22px Arial, sans-serif'),x,h-58);
 if(card.ticker){g.fillStyle='#fb752b';g.font='bold 16px monospace';g.fillText(card.ticker,x,h-38);}
 g.fillStyle='#c7cbbd';g.fillText(fit(g,card.stage,w-x-12,'11px Arial, sans-serif'),x,h-20);
 if(card.kind==='project'){g.fillStyle='#ffffff22';g.fillRect(16,h-10,w-32,3);g.fillStyle='#fb752b';g.fillRect(16,h-10,(w-32)*(card.progress||0),3);}
 if(card.kind==='wallpaper'){g.fillStyle='#ffffff18';g.beginPath();g.arc(w-40,36,22,0,7);g.fill();g.fillStyle='#fff';g.font='22px sans-serif';g.textAlign='center';g.fillText('✉',w-40,44);g.textAlign='left';}
}
export function screenTexture(p,mine){
 if(typeof document==='undefined')return null;
 const card=screenCard(p,mine),key=p?`p:${p.slug}|${card.stage}|${p.bannerUrl||p.logoUrl||''}`:card.kind;
 if(textures.has(key)){const t=textures.get(key);textures.delete(key);textures.set(key,t);return t;}
 const c=document.createElement('canvas');c.width=256;c.height=160;const g=c.getContext('2d');drawCard(g,card,null,256,160);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=2;
 const src=p?.bannerUrl||p?.logoUrl;
 if(src){const el=new Image();el.crossOrigin='anonymous';el.decoding='async';                       // cross-origin without CORS: onerror, the card stays
  el.onload=()=>{if(!el.width||!el.height)return;try{drawCard(g,card,{el,kind:p.bannerUrl?'banner':'logo'},256,160);tex.needsUpdate=true;}catch{drawCard(g,card,null,256,160);}};el.src=src;}
 textures.set(key,tex);if(textures.size>MAX_TEX){const [k,t]=textures.entries().next().value;textures.delete(k);t.dispose();}
 return tex;
}
// The Kenney screens: the 4-vertex quad with the 'metal' material is the glass. Returns that mesh (geometry is shared).
export function screenMesh(object){let found=null;object.traverse(n=>{if(!found&&n.isMesh&&!Array.isArray(n.material)&&n.material?.name==='metal'&&n.geometry?.attributes.position?.count===4)found=n;});return found;}
// A private copy of the quad with UVs spanning its x/y extent (the source has none), so a canvas maps onto the glass.
export function screenGeometry(geo){
 const g=geo.clone(),p=g.attributes.position,xs=[],ys=[];for(let i=0;i<p.count;i++){xs.push(p.getX(i));ys.push(p.getY(i));}
 const [x0,x1,y0,y1]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)],uv=[];
 for(let i=0;i<p.count;i++)uv.push((xs[i]-x0)/((x1-x0)||1),(ys[i]-y0)/((y1-y0)||1));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return g;
}

// ---------------------------------------------------------------- the Computer overlay
const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null&&k!==false));return n;};
// External links carry the diagonal arrow (they leave the city page); 'Label ↗' strings are typed the old way.
const ext=(href,text,cls='pc-link')=>el('a',{className:cls,href,target:'_blank',rel:'noopener noreferrer'},text.replace(/\s*↗\s*$/,''),icon('ne'));
const frame=(src,sandbox,title)=>{const f=el('iframe',{className:'pc-frame',src,title,loading:'lazy',referrerPolicy:'no-referrer'});f.setAttribute('sandbox',sandbox);return f;};
// (the label is a plain span: the city's .lbl is the dock's long label, hidden on phones)
const btn=(cls,text,onclick,lead=null)=>{const b=el('button',{className:'button '+cls,type:'button',onclick},lead?icon(lead,'i lead'):null,el('span',{className:'pc-lbl',textContent:text}));return b;};
const busy=(b,on)=>{b.disabled=on;b.classList.toggle('is-busy',on);};
// The dev buy field (desk-flows.js devBuyModel): one number input + Save above "Prepare the transaction"; read-only with
// the reason once a transaction exists. onSave(sol) does the PUT and the refresh; errors stay under the field.
export function renderDevBuy(m,{onSave}={}){
 const input=el('input',{className:'pc-devbuy-in',type:'number',min:'0',max:String(m.max),step:String(m.step),value:String(m.sol),disabled:!m.editable,inputMode:'decimal'});
 input.setAttribute('aria-label','Dev buy in SOL');
 const err=el('p',{className:'pc-err'});
 const save=btn('button-dark button-sm pc-devbuy-save','Save',async()=>{const r=parseDevBuy(input.value,m.max);if(r.error){err.textContent=r.error;return;}err.textContent='';busy(save,true);
  try{await onSave?.(r.sol);}catch(x){err.textContent=explainError(x);busy(save,false);}});
 save.disabled=!m.editable;
 return el('div',{className:'pc-devbuy'+(m.locked?' is-locked':'')},el('label',{className:'pc-devbuy-row'},el('span',{className:'pc-devbuy-k',textContent:'Dev buy (SOL)'}),input,save),
  el('p',{className:'pc-note',textContent:m.locked?`${m.text} · ${m.lockNote}`:m.note}),err);
}
// The banner is an SVG; X wants PNG/JPG for the header: draw it on a canvas at 1500×500 (same-origin, so the canvas stays clean).
async function savePng(url,name,{w,h}){
 const svg=await (await fetch(url,{credentials:'same-origin'})).text();
 const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('could not read the banner'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
 const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);
 const blob=await new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('could not render the PNG')),'image/png'));
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000);
}
function kitBlock(kit,p){
 const err=el('p',{className:'pc-err'});
 const files=kit.files.map(f=>{
  const b=el('a',{className:'button button-dark button-sm pc-kit-file',href:f.url,download:f.name},icon('lower','i lead'),el('span',{className:'pc-lbl',textContent:`${f.label} · ${f.hint}`}));
  if(f.render)b.onclick=ev=>{ev.preventDefault();b.classList.add('is-busy');savePng(f.url,f.name,f.render).catch(e=>{err.textContent=e.message;}).finally(()=>b.classList.remove('is-busy'));};
  return b;});
 const texts=kit.texts.map(t=>el('div',{className:'pc-kit-text'},el('span',{className:'eyebrow',textContent:t.label}),el('span',{className:'pc-kit-val',textContent:t.text}),copyBtn(t.text)));
 return el('section',{className:'pc-kit'},el('div',{className:'pc-kit-head'},el('img',{src:p.logoUrl,alt:'',width:56,height:56,decoding:'async'}),el('div',null,el('h4',{textContent:'Profile kit for X'}),el('p',{className:'pc-note',textContent:kit.note}))),
  el('div',{className:'pc-kit-files'},...files),texts.length?el('div',{className:'pc-kit-texts'},...texts):null,err);
}
const copyBtn=text=>{const b=el('button',{className:'pc-copy',type:'button',title:'Copy',onclick:async()=>{try{await navigator.clipboard.writeText(text);b.classList.add('is-ok');setTimeout(()=>b.classList.remove('is-ok'),1200);}catch{}}},icon('check'));b.setAttribute('aria-label','Copy '+short(text,6));return b;};
// openComputer({model,project,ownerName,me,onIdea,onClose}) → {close()}. me: the /api/me answer (role, wallet) or null.
// onIdea: null when main.js has not wired host.openIdea.
export function openComputer({model,project=null,ownerName='',me=null,onIdea=null,onClose}){
 const items=switcherItems(model),prevFocus=document.activeElement,timers=new Set(),views=new Map();
 let cur=project||model.projects[0]||null,tab=null,closed=false,focusIdea=null,epoch=0;
 const back=el('div',{className:'pc-backdrop'}),win=el('section',{className:'pc-window',tabIndex:-1});win.setAttribute('role','dialog');win.setAttribute('aria-modal','true');
 const title=el('div',{className:'pc-title'}),closeB=el('button',{className:'pc-close',type:'button',title:'Close (Esc)',onclick:()=>close()},icon('x'));closeB.setAttribute('aria-label','Close the computer');
 const tabs=el('div',{className:'pc-tabs'}),body=el('div',{className:'pc-body'});tabs.setAttribute('role','tablist');body.setAttribute('role','tabpanel');
 win.append(el('header',{className:'pc-bar'},el('span',{className:'pc-dots'},el('i'),el('i'),el('i')),title,closeB),tabs,body);back.append(win);
 back.addEventListener('pointerdown',e=>{if(e.target===back)close();});
 // timers die with the tab that set them (clearBody) and with the window (close)
 const later=(ms,fn)=>{const t=setTimeout(()=>{timers.delete(t);if(!closed)fn();},ms);timers.add(t);return t;};
 const stopTimers=()=>{for(const t of timers)clearTimeout(t);timers.clear();epoch++;};
 const alive=e=>!closed&&e===epoch;
 // The project view (owner fields when the viewer owns it): cached per slug for the tab's life, refetched on demand.
 async function load(slug,fresh=false){if(!slug)return null;if(!fresh&&views.has(slug))return views.get(slug);
  let v=null;try{v=await api(`/api/projects/${encodeURIComponent(slug)}`);}catch{v=null;}if(v&&typeof v==='object')views.set(slug,v);return v;}
 function renderTitle(){
  if(items.length>1){const s=el('select',{className:'pc-switch'});s.setAttribute('aria-label','Switch project');
   for(const it of items){const o=el('option',{value:it.key,textContent:it.label});o.selected=cur?it.project===cur:it.idea===focusIdea;s.append(o);}
   s.onchange=()=>{const it=items.find(i=>i.key===s.value);if(it?.project){cur=it.project;focusIdea=null;show('site');}else if(it){focusIdea=it.idea;show('ideas');}};
   title.replaceChildren(s);}
  else title.replaceChildren(el('strong',{textContent:cur?`${cur.name}${cur.ticker?' · $'+cur.ticker:''}`:`${ownerName}'s computer`}));
  win.setAttribute('aria-label',cur?`${ownerName}'s computer: ${cur.name}`:`${ownerName}'s computer`);
 }
 function clearBody(){stopTimers();for(const f of body.querySelectorAll('iframe')){f.src='about:blank';f.remove();}body.replaceChildren();}   // frames live only while their tab is shown
 function show(id){
  const list=tabsFor(model,cur);if(!list.includes(id))id=list[0];tab=id;renderTitle();
  tabs.replaceChildren(...list.map(t=>{const b=el('button',{className:'pc-tab',type:'button',onclick:()=>show(t)},icon(TAB_ICONS[t]),TAB_LABELS[t]);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(t===id));b.tabIndex=t===id?0:-1;b.dataset.tab=t;return b;}));
  tabs.hidden=list.length<2;clearBody();body.dataset.tab=id||'';
  body.append(...(id==='site'?siteTab():id==='x'?xTab():id==='launch'?launchTab():id==='ideas'?ideasTab():[el('p',{className:'pc-empty',textContent:'Nothing on this computer yet.'})]));
 }
 const bar=(...kids)=>el('div',{className:'pc-toolbar'},...kids);
 // The project head on the Site and Launch tabs: logo tile, name, stage pill, the X chip (planned → connected).
 function headRow(p,extra=null){
  const x=xChip(xModel({x:p.x.status?{status:p.x.status,planned_handle:p.x.handle,x_handle:p.x.handle}:null,xConfigured:true},false));
  const row=el('div',{className:'pc-head'},tile({kind:'project',logo:p.logoUrl,kanji:'発'}),el('div',{className:'pc-head-main'},el('strong',{textContent:p.name+(p.ticker?' · $'+p.ticker:'')}),
   el('span',{className:'pc-chips'},el('span',{className:'pc-chip'+(p.launched?' is-live':''),textContent:p.launched?'Live':p.stageLabel}),x?el('span',{className:'pc-chip pc-chip-x '+x.cls,textContent:x.text}):null)),extra);
  row.dataset.head='';return row;
 }
 let siteView='site';   // the owner's Site tab: the site itself, or the Tools panel in its place
 function siteTab(){const s=siteFor(cur,model.mine);
  if(!s.src)return [headRow(cur),el('div',{className:'pc-empty'},el('strong',{},icon('wrench'),s.empty),el('p',{textContent:model.mine?'The site appears here as soon as SUB-01 builds the first version.':'Come back later: the site goes up when it is built.'}))];
  const tools=model.mine&&siteView==='tools';
  const toggle=model.mine?el('button',{className:'pc-link pc-tools-toggle',type:'button',textContent:tools?'← Back to the site':'Tools',onclick:()=>{siteView=tools?'site':'tools';show('site');}}):null;
  return [headRow(cur,bar(el('span',{className:'pc-url',textContent:s.preview?'Preview · '+(cur.siteUrl||'not public yet'):s.src}),toggle,ext(s.open,'Open in a new tab ↗'))),tools?toolsPane():frame(s.src,s.sandbox,`${cur.name}: website`)];}

 // ---------------- Site tools (owner): switches + a few fields, Save = a new site version; the inbox (drop box, wall, pins)
 function toolsPane(){
  const p=cur,root=el('div',{className:'pc-tools'},el('p',{className:'pc-note',textContent:'Loading the tools…'})),e=epoch;
  api(`/api/projects/${encodeURIComponent(p.slug)}/tools`).then(v=>{if(alive(e)&&tab==='site')drawTools(root,toolsModel(v));})
   .catch(x=>{if(alive(e))root.replaceChildren(el('p',{className:'pc-err',textContent:explainError(x)}));});
  return root;
 }
 function drawTools(root,m,{note=''}={}){
  const p=cur,slug=encodeURIComponent(p.slug);let rows=m.rows;
  const err=el('p',{className:'pc-err'}),ok=el('p',{className:'pc-note pc-ok',textContent:note}),list=el('ul',{className:'pc-tools-list'});
  const check=()=>{err.textContent=toolsProblem(rows);save.disabled=!m.editable||!!err.textContent;count.textContent=`${toolsCount(rows)} on`;};
  const fieldEl=(r,f)=>{
   const set=(v,i=null)=>{rows=setField(rows,r.id,f.key,v,i);check();};
   if(f.type==='bool'){const c=el('input',{type:'checkbox',checked:f.value===true,disabled:!m.editable});c.onchange=()=>set(c.checked);return el('label',{className:'pc-tool-f is-bool'},c,el('span',{textContent:f.label}));}
   if(f.type==='options')return el('div',{className:'pc-tool-f'},el('span',{className:'pc-tool-k',textContent:f.label}),el('div',{className:'pc-tool-opts'},...f.value.map((v,i)=>{
    const x=el('input',{type:'text',value:v,maxLength:f.max||40,placeholder:`Answer ${i+1}`,disabled:!m.editable});x.oninput=()=>set(x.value,i);return x;})));
   if(f.type==='choice'){const c=el('select',{disabled:!m.editable},...(f.choices||[]).map(o=>el('option',{value:o,textContent:o,selected:o===f.value})));c.onchange=()=>set(c.value);
    return el('label',{className:'pc-tool-f'},el('span',{className:'pc-tool-k',textContent:f.label}),c);}
   const type=f.type==='time'?'time':f.type==='datetime'?'datetime-local':f.type==='number'?'number':f.type==='url'?'url':'text';
   const x=el('input',{type,value:f.value,disabled:!m.editable,placeholder:f.type==='url'?'https://x.com/…':''});if(type==='text'&&f.max)x.maxLength=f.max;
   if(type==='number'){if(f.min!=null)x.min=String(f.min);if(f.max!=null)x.max=String(f.max);}
   x.oninput=()=>set(x.value);return el('label',{className:'pc-tool-f'},el('span',{className:'pc-tool-k',textContent:f.label}),x);
  };
  const rowEl=r=>{
   const sw=el('input',{type:'checkbox',className:'pc-tool-sw',checked:r.on,disabled:!m.editable});sw.setAttribute('role','switch');sw.setAttribute('aria-label',`${r.name} on the site`);
   sw.onchange=()=>{rows=toggleTool(rows,r.id,sw.checked);draw();};
   return el('li',{className:'pc-tool'+(r.on?' is-on':'')},el('label',{className:'pc-tool-head'},el('span',{className:'pc-tool-main'},
     el('strong',{textContent:r.name}),r.kind==='extra'?el('span',{className:'pc-chip',textContent:r.lib?`idea-specific · ${r.lib}`:'idea-specific'}):null,el('span',{className:'pc-note',textContent:r.line})),sw),
    r.on&&r.fields.length?el('div',{className:'pc-tool-fields'},...r.fields.map(f=>fieldEl(r,f))):null);
  };
  const draw=()=>{list.replaceChildren(...rows.map(rowEl));check();};
  const count=el('span',{className:'pc-chip'});
  const save=btn('button-dark button-sm','Save tools',async()=>{busy(save,true);ok.textContent='';
   try{const r=await api(`/api/projects/${slug}/tools`,{method:'PUT',body:toolsPayload(rows)});
    try{const l=await api(`/api/projects/${slug}/preview-link`);if(l?.url)cur.previewLink=l.url;}catch{}
    const done=`Saved: site v${r.version} is live with ${r.tools.length} tool${r.tools.length===1?'':'s'}.`;ok.textContent=done;
    const v=await api(`/api/projects/${slug}/tools`);if(tab==='site'&&!closed)drawTools(root,toolsModel(v),{note:done});
   }catch(x){err.textContent=explainError(x);busy(save,false);}});
  const moderate=(e,body)=>async()=>{try{await api(`/api/projects/${slug}/tools/entries/${encodeURIComponent(e.id)}`,{method:'POST',body});
   const v=await api(`/api/projects/${slug}/tools`);if(tab==='site'&&!closed)drawTools(root,{...toolsModel(v),rows});}catch(x){err.textContent=explainError(x);}};
  const entry=e=>el('li',{className:'pc-entry'+(e.hidden?' is-hidden':'')},el('span',{className:'pc-entry-t',textContent:e.text}),
   el('small',{textContent:[e.at?new Date(e.at).toLocaleString():'',e.by,e.featured?`featured${e.featuredBy==='rule:daily'?' by the daily rule':''}`:'',e.hidden?'hidden':''].filter(Boolean).join(' · ')}),
   el('span',{className:'pc-entry-acts'},e.tool==='drop'&&!e.featured&&!e.hidden?btn('button-dark button-sm','Feature',moderate(e,{featured:true})):null,
    btn('button-ghost button-sm',e.hidden?'Show':'Hide',moderate(e,{hidden:!e.hidden}))));
  const box=(title,note,xs)=>xs.length?el('section',{className:'pc-inbox'},el('h4',{textContent:title}),note?el('p',{className:'pc-note',textContent:note}):null,el('ul',{className:'pc-entries'},...xs.map(entry))):null;
  const poll=m.poll?el('section',{className:'pc-inbox'},el('h4',{textContent:`Poll · ${m.poll.total} vote${m.poll.total===1?'':'s'}`}),el('p',{className:'pc-note',textContent:m.poll.question}),
   el('ul',{className:'pc-entries'},...m.poll.options.map((o,i)=>el('li',{className:'pc-entry'},el('span',{className:'pc-entry-t',textContent:o}),el('small',{textContent:String(m.poll.counts[i]||0)}))))):null;
  draw();
  root.replaceChildren(...[el('div',{className:'pc-tools-head'},el('h4',{textContent:'Tools on the site'}),count,save),
   m.lockedNote&&!m.editable?el('p',{className:'pc-note',textContent:m.lockedNote}):null,m.holderNote?el('p',{className:'pc-note',textContent:m.holderNote}):null,err,ok,list,
   box('Drop box · private until you feature one','Only you see these. Feature one and it shows on the site as today\'s pick; if you do not, the daily rule picks one at the reveal time.',m.inbox.drop),
   box('Wall','',m.inbox.wall),box('Map pins','',m.inbox.map),poll].filter(Boolean));   // replaceChildren would print a null
 }

 // ---------------- X: planned → connect (OAuth in X's own window) → drafts you approve
 function xTab(){
  const p=cur,root=el('div',{className:'pc-x-root'},el('p',{className:'pc-note',textContent:'Loading…'}));
  const e=epoch;load(p.slug).then(view=>{if(!alive(e)||tab!=='x')return;drawX(root,view);});
  return [root];
 }
 function drawX(root,view,waiting=null){
  const p=cur,m=xModel(view||{x:p.x.status?{status:p.x.status,planned_handle:p.x.handle,x_handle:p.x.handle}:null},model.mine),chip=xChip(m),out=[];
  if(m.state==='connected'&&p.x.status!=='connected'){p.x.status='connected';p.x.handle=m.handle;p.x.url=m.url;}   // the desk's chip follows
  out.push(el('div',{className:'pc-x'},el('div',{className:'pc-x-avatar'},icon('xlogo')),el('div',{className:'pc-x-main'},el('strong',{textContent:m.handle?'@'+m.handle:'No X account yet'}),
   chip?el('small',{className:'pc-chip pc-chip-x '+chip.cls,textContent:m.state==='connected'?'Connected':m.state==='planned'?'Planned by SUB-01':'Disconnected'}):null),m.url?ext(m.url,'Open on X ↗','button button-dark button-sm pc-x-open'):null));
  if(m.bio&&m.state!=='connected')out.push(el('blockquote',{className:'pc-quote'},el('span',{className:'eyebrow',textContent:'Bio'}),el('p',{textContent:m.bio})));
  if(model.mine){const kit=profileKit(p,m);if(kit)out.push(kitBlock(kit,p));}   // 2026-10-10 the owner: logo + header to download for X
  if(!model.mine){out.push(el('p',{className:'pc-note',textContent:m.note}));root.replaceChildren(...out);return;}
  if(m.howto.length){out.push(el('ol',{className:'pc-howto'},...m.howto.map(t=>el('li',{textContent:t}))));
   const err=el('p',{className:'pc-err'});
   if(waiting){const cancel=btn('button-ghost button-sm','Cancel',()=>{waiting.stop();drawX(root,view);});
    out.push(el('div',{className:'pc-wait'},el('i',{className:'pulse'}),el('span',{textContent:'Waiting for X… allow SUB-01 in the X window, then this updates by itself.'}),cancel));}
   else{const b=btn('button-orange pc-cta','Connect X account',()=>startConnect(root,view,err),'xlogo');b.disabled=!m.canConnect;out.push(b);}
   if(m.note)out.push(el('p',{className:'pc-note',textContent:m.note}));out.push(err);
  }
  if(m.state==='connected'){
   out.push(el('h4',{textContent:'Posts'}));
   out.push(m.posts.length?el('ol',{className:'pc-posts'},...m.posts.map(q=>postRow(root,view,q))):el('p',{className:'pc-note',textContent:'No drafts yet: SUB-01 writes them with the site.'}));
   out.push(el('p',{className:'pc-note',textContent:m.note}));
  }
  root.replaceChildren(...out);
 }
 function postRow(root,view,q){
  const li=el('li',{className:'pc-post is-'+q.status}),text=el('span',{className:'pc-post-text',textContent:q.text}),status=el('small',{className:'pc-post-'+q.status,textContent:q.status==='published'?'posted':q.status});
  const err=el('p',{className:'pc-err',textContent:q.error?`Last try failed: ${q.error}`:''}),acts=el('div',{className:'pc-post-acts'});
  const refresh=async()=>{const v=await load(cur.slug,true);if(tab==='x'&&!closed)drawX(root,v);};
  if(q.canApprove){const a=btn('button-orange button-sm','Approve & post',async()=>{busy(a,true);err.textContent='';try{await api(`/api/x-posts/${encodeURIComponent(q.id)}/approve`,{method:'POST',body:{}});await refresh();}catch(x){err.textContent=explainError(x);busy(a,false);}},'check');acts.append(a);}
  if(q.canEdit){const ed=btn('button-ghost button-sm','Edit',()=>{const ta=el('textarea',{className:'pc-post-edit',maxLength:280,value:q.text,rows:3});
    const save=btn('button-dark button-sm','Save',async()=>{busy(save,true);err.textContent='';try{await api(`/api/x-posts/${encodeURIComponent(q.id)}`,{method:'PUT',body:{text:ta.value}});await refresh();}catch(x){err.textContent=explainError(x);busy(save,false);}});
    const back=btn('button-ghost button-sm','Keep',()=>{li.replaceChildren(text,status,acts,err);});text.replaceWith(ta);acts.replaceChildren(save,back);ta.focus();});acts.append(ed);}
  if(!q.canApprove&&!q.canEdit&&q.status==='approved')acts.append(el('small',{className:'pc-note',textContent:'Approved: SUB-01 posts it next.'}));
  li.append(text,status,acts,err);return li;
 }
 // OAuth happens in X's own window (window.open on the server's connect route, which redirects to x.com and lands back on
 // the launchpad); this tab polls the project until X reports the handle, for at most X_WAIT_MS.
 function startConnect(root,view,err){
  let w=null;try{w=window.open(`/api/projects/${encodeURIComponent(cur.slug)}/x/connect`,'_blank','noopener');}catch{}
  if(!w){err.textContent='The browser blocked the X window. Allow pop-ups for this site and try again.';return;}
  const e=epoch,started=Date.now(),waiting={stop(){stopped=true;}};let stopped=false;
  const tick=async()=>{if(stopped||!alive(e)||tab!=='x')return;const v=await load(cur.slug,true);if(stopped||!alive(e)||tab!=='x')return;
   if(v?.x?.status==='connected'){drawX(root,v);return;}
   if(Date.now()-started>X_WAIT_MS){drawX(root,v);root.querySelector('.pc-err').textContent='X did not answer in time. Press Connect again when you are ready.';return;}
   later(X_POLL_MS,tick);};
  drawX(root,view,waiting);later(X_POLL_MS,tick);
 }

 // ---------------- Launch: the five-step stepper (desk-flows.js launchSteps), review before sign, confirming, live
 function launchTab(){
  const p=cur,root=el('div',{className:'pc-launch'},el('p',{className:'pc-note',textContent:'Loading…'}));
  const e=epoch;load(p.slug).then(view=>{if(!alive(e)||tab!=='launch')return;drawLaunch(root,view);});
  return [launchHead(p),root];
 }
 // 2026-10-10 the owner: no links to the old launchpad/office pages; the coin's own site is the only outside link.
 const launchHead=p=>headRow(p,el('span',{className:'pc-head-links'},p.siteUrl?ext(p.siteUrl,'Coin site ↗'):null));
 // The desk loaded the stage once with the room; the stepper's fresh view keeps the head chip (and the screen card) current.
 function syncStage(m){if(!m.status||m.status===cur.stage)return;cur.stage=m.status;cur.stageLabel=STAGE_LABELS[m.status]||m.status.replace(/_/g,' ');cur.launched=m.status==='launched';if(m.live?.mint)cur.mint=m.live.mint;
  const old=body.querySelector('[data-head]');if(old&&tab==='launch')old.replaceWith(launchHead(cur));}
 let flight=null;   // the transaction being reviewed/signed on this tab: {tx, review} or a phase override
 function drawLaunch(root,view,extra={}){
  const m=launchSteps(view,me),out=[],e=epoch;syncStage(m);
  if(m.loading){root.replaceChildren(el('div',{className:'pc-empty'},el('strong',{},icon('wrench'),'The launch page is not reachable.'),el('p',{textContent:'The project could not be loaded. Close the computer and try again.'})));return;}
  const err=el('p',{className:'pc-err',textContent:extra.error||''});
  const list=el('ol',{className:'pc-steps'});list.style.setProperty('--step',String(stepIndex(m.current==='stopped'?'site':m.current,m.steps)));
  const refresh=async(error='')=>{const v=await load(cur.slug,true);if(alive(e)&&tab==='launch')drawLaunch(root,v,{error});};
  for(const s of m.steps){
   const li=el('li',{className:'pc-step is-'+s.state},el('i',{className:'pc-step-dot'},s.state==='done'?icon('check'):s.state==='blocked'?icon('x'):el('b',{textContent:String(stepIndex(s.id,m.steps)+1)})));
   const main=el('div',{className:'pc-step-main'},el('b',{className:'pc-step-title',textContent:s.title}),el('span',{className:'pc-step-line',textContent:s.line}));
   li.dataset.step=s.id;li.append(main);list.append(li);
   const open=s.state==='current'||s.state==='blocked'||(s.id==='live'&&m.live);
   if(!open){if(s.id==='site'&&s.action)main.append(el('div',{className:'pc-step-acts'},el('button',{className:'pc-link',type:'button',textContent:s.action.label,onclick:()=>show('site')})));continue;}
   if(s.id==='approve'&&m.split.rows.length)main.append(splitBox(m.split,m.approve?.statement));
   // 2026-10-10 the owner: the dev buy must be settable before approving, not only inside step 4. It goes on whichever
   // step is open while it can still change (approve, the clearance wait, launch); on the launch step it stays, read-only,
   // once a transaction exists; while the review card is open its row is on the card instead (showDevBuyOn).
   const dev=devBuyModel(view);
   if(showDevBuyOn(dev,s.id,!!flight?.tx))main.append(renderDevBuy(dev,{onSave:async sol=>{await api(`/api/projects/${encodeURIComponent(cur.slug)}/launch/options`,{method:'PUT',body:{initialBuySol:sol}});await refresh();}}));
   if(s.id==='launch'&&flight?.tx)main.append(reviewCard(root,view,m,flight,refresh));
   else if(s.id==='launch'&&(m.phase==='preparing'||m.phase==='confirming')){main.append(el('div',{className:'pc-wait'},el('i',{className:'pulse'}),el('span',{textContent:m.phase==='confirming'?`Signed · ${short(view.intent?.tx_signature||'',6)||'broadcast'} · waiting for the network…`:'The configuration is prepared by a job; this updates by itself.'})));
    later(3000,()=>{if(tab==='launch')refresh();});}
   if(s.id==='live'&&m.live)main.append(liveBox(m.live,view));
   if(s.note)main.append(el('p',{className:'pc-step-note',textContent:s.note}));
   if(s.action&&!(s.id==='launch'&&flight?.tx)){
    const b=btn(s.action.id==='preview'?'button-dark button-sm':'button-orange button-sm',s.action.label,()=>act(s.action.id,root,view,m,b,err,refresh),s.action.id==='preview'?'globe':s.action.id==='clear'?'check':s.action.id==='approve'?'check':'rocket');
    b.disabled=!s.action.enabled;const acts=el('div',{className:'pc-step-acts'},b);
    if(s.id==='launch'&&m.phase==='resume')acts.append(el('button',{className:'pc-link pc-abandon',type:'button',textContent:'Cancel this transaction',onclick:()=>abandon(root,b,err,refresh,'cancelled')}));
    main.append(acts);}
   if(s.state==='current'||s.state==='blocked')main.append(err);
  }
  out.push(list);
  if(!model.mine&&!m.owner)out.push(el('p',{className:'pc-note',textContent:'Only the author launches from this computer; you see where it stands.'}));
  out.push(brainLine(view));
  root.replaceChildren(...out);
 }
 function splitBox(split,statement){
  const box=el('div',{className:'pc-split'},...split.rows.map(r=>el('div',{className:'pc-split-row'},tile(r.role==='sub01'?{kind:'sub01'}:{kind:'resident',name:r.label},'sm'),
   el('span',{className:'pc-split-who'},el('b',{textContent:r.role==='sub01'?'SUB-01':r.role==='submitter'?'You (author)':r.label}),el('small',{textContent:short(r.wallet,6)})),el('b',{className:'pc-split-pct',textContent:r.pct}))));
  box.append(el('p',{className:'pc-split-lock'},icon('lock'),split.locked?'Locked at launch: it cannot be changed afterwards, by you or by SUBZERONE.':'Creator fees go straight to the author wallet; no split on-chain.'));
  if(statement){const d=el('details',{className:'pc-more'},el('summary',{},'What you approve',icon('cd')),el('pre',{className:'pc-statement',textContent:statement}));box.append(d);}
  return box;
 }
 function liveBox(live,view){
  const rows=el('div',{className:'pc-live'});
  if(live.mint)rows.append(el('div',{className:'pc-live-row'},el('span',{className:'pc-live-k',textContent:'Mint'}),el('code',{textContent:short(live.mint,8)}),copyBtn(live.mint)));
  const links=el('div',{className:'pc-live-links'});
  if(live.explorerTx)links.append(ext(live.explorerTx,'Explorer ↗','button button-dark button-sm'));
  if(live.pumpfun)links.append(ext(live.pumpfun,'pump.fun ↗','button button-dark button-sm'));
  if(live.site)links.append(ext(live.site,'Site ↗','button button-dark button-sm'));
  if(links.childElementCount)rows.append(links);
  if(live.ledger)rows.append(el('p',{className:'pc-note',textContent:live.ledger}));
  return rows;
 }
 // SUB-01's vote in one line; "See why" unfolds his feedback (verdict.js, the same card the author saw at the drop).
 function brainLine(view){
  const box=el('div',{className:'pc-brain'}),line=el('button',{className:'pc-brain-line',type:'button'}),body=el('div',{className:'verdict pc-brain-body',hidden:true});
  line.append(el('span',{className:'pc-brain-k',textContent:'SUB-01'}),el('span',{className:'pc-brain-t',textContent:view?.ideaId?'He voted build.':'His vote'}),el('span',{className:'pc-brain-more'},'See why',icon('cd')));
  box.append(line,body);if(!view?.ideaId){line.disabled=true;return box;}
  let loaded=false;line.onclick=async()=>{const open=body.hidden;if(open&&!loaded){loaded=true;let idea=null;try{idea=await api(`/api/ideas/${encodeURIComponent(view.ideaId)}`);}catch{}
    const m=verdictModel(idea);renderVerdict(body,{...m,canRevise:false},{icon});body.classList.add('pc-brain-body');line.querySelector('.pc-brain-t').textContent=m.headline;}
   body.hidden=!open;line.classList.toggle('is-open',open);if(open)body.scrollIntoView({block:'nearest',behavior:'smooth'});};
  return box;
 }
 // Actions: one call each, then the view is refetched and the stepper redrawn. Errors stay on the step, in plain words.
 async function act(id,root,view,m,b,err,refresh){
  err.textContent='';
  if(id==='preview'){show('site');return;}
  busy(b,true);
  try{
   if(id==='approve'){if(!m.publicIdea&&m.approve?.ideaId)await api(`/api/ideas/${encodeURIComponent(m.approve.ideaId)}/publish`,{method:'POST',body:{public:true}});
    await api(`/api/projects/${encodeURIComponent(cur.slug)}/approve`,{method:'POST',body:{allocationId:m.approve.allocationId,statement:m.approve.statement,siteVersion:m.approve.siteVersion}});}
   else if(id==='clear')await api(`/api/admin/projects/${encodeURIComponent(cur.slug)}/clear`,{method:'POST',body:{}});
   else if(id==='prepare'||id==='resume'){const tx=await api(`/api/projects/${encodeURIComponent(cur.slug)}/launch/transaction`,{method:'POST',body:{}});
    const v=await load(cur.slug,true);flight={tx,review:reviewModel(tx,v,me?.user?.wallet)};if(!closed&&tab==='launch')drawLaunch(root,v);return;}
   await refresh();
  }catch(x){err.textContent=explainError(x);busy(b,false);if(x?.status===409&&/changed/.test(x.body?.error||''))refresh(explainError(x));}
 }
 async function abandon(root,b,err,refresh,reason){
  if(b)busy(b,true);err.textContent='';flight=null;
  try{await api(`/api/projects/${encodeURIComponent(cur.slug)}/launch/abandon`,{method:'POST',body:{reason}});}catch(x){err.textContent=explainError(x);}
  await refresh();
 }
 // The review card: exactly what the server read from the built transaction, before the wallet opens. Sign stays
 // disabled unless the fee payer is this wallet and only launch programs are called (reviewModel.canSign).
 function reviewCard(root,view,m,fl,refresh){
  const r=fl.review,card=el('div',{className:'pc-review'+(r.flagged||!r.you?' is-flagged':'')}),wallet=lastWallet()||'wallet';
  const kv=(k,...v)=>el('div',{className:'pc-kv'},el('span',{className:'pc-kv-k',textContent:k}),el('span',{className:'pc-kv-v'},...v));
  card.append(el('div',{className:'pc-review-head'},el('span',{className:'eyebrow'},r.mock?'MOCK TRANSACTION · NOTHING ON-CHAIN':'REVIEW BEFORE YOU SIGN'),r.resumed?el('small',{className:'pc-note',textContent:'The same transaction you built earlier.'}):null));
  for(const w of r.warnings)card.append(el('p',{className:'pc-warn'},icon('x'),w));
  card.append(kv('Network',el('b',{textContent:r.network})),
   kv('Fee payer',el('code',{textContent:short(r.feePayer,6)}),el('small',{className:r.you?'is-ok':'is-bad',textContent:r.you?'you':'not your wallet'})),
   kv('New mint',el('code',{textContent:short(r.mint,6)||'—'})),
   kv('Programs',el('span',{className:'pc-programs'},...r.programs.map(p=>el('span',{className:'pc-program'+(p.flag?' is-bad':'')},p.flag?icon('x'):icon('check'),p.name,p.direct?'':el('small',{textContent:' (inside the one above)'}))))),
   kv('Can write',el('b',{textContent:String(r.writable)}),el('small',{textContent:` accounts · ${r.signers} signature${r.signers>1?'s (yours first; the new mint signs after you, on the server)':' (yours)'}`})),
   kv('Cost',el('b',{textContent:r.cost.total}),el('small',{textContent:r.cost.fee!=null?` · fee ${r.cost.fee} + rent ${r.cost.rent}${r.cost.buy?' + dev buy '+r.cost.buy:''}${r.cost.simulated?' (from a simulation)':''}`:r.mock?' · mock':' · the wallet shows the exact amount'}),r.cost.balance?el('small',{textContent:` · your balance ${r.cost.balance}`}):null));
  if(r.cost.buy)card.append(kv('Dev buy',el('b',{textContent:r.cost.buy}),el('small',{textContent:`${r.cost.buyMax?` · capped at ${r.cost.buyMax} in the transaction`:''} · tokens land in your wallet`})));
  card.append(el('span',{className:'eyebrow',textContent:'Creator-fee split'+(r.split.locked?' · locked at launch':'')}),splitBox(r.split,null));
  card.append(el('span',{className:'eyebrow',textContent:'What this does NOT do'}),el('ul',{className:'pc-doesnot'},...r.doesNot.map(t=>el('li',{textContent:t}))));
  card.append(el('p',{className:'pc-note',textContent:r.mock?'The wallet asks you to sign a labelled text message; no transaction exists.':'Your wallet shows the transaction again before you sign. Check it shows the same network, fee payer and amount.'}));
  const err=el('p',{className:'pc-err'}),sign=btn('button-orange button-sm',`Sign with ${wallet}`,()=>signNow(root,fl,sign,err,refresh),'wallet');sign.disabled=!r.canSign;
  // 2026-10-11: Phantom flags city.subzerone.live as a new domain (domain review requested); say so before the popup
  const walletNote=el('p',{className:'pc-note pc-wallet-note',textContent:'Your wallet may warn that this site is new or unreviewed: city.subzerone.live is days old and under review. The transaction is exactly the one above; take your time, this page waits up to 2 minutes.'});
  const cancel=el('button',{className:'pc-link pc-abandon',type:'button',textContent:'Cancel this transaction',onclick:()=>abandon(root,sign,err,refresh,'cancelled')});
  card.append(walletNote,el('div',{className:'pc-step-acts'},sign,cancel),err);
  return card;
 }
 async function signNow(root,fl,b,err,refresh){
  const name=lastWallet();err.textContent='';if(!name){err.textContent='Sign in with your wallet again, then sign.';return;}
  busy(b,true);
  try{
   let signed;
   if(fl.tx.mock){const v=await load(cur.slug,true),text=v?.mockSigningText;if(!text)throw new Error('The mock signing text is missing; prepare again.');
    signed=b58encode((await signMessage(name,new TextEncoder().encode(text))).signature);}
   else{
    // a fresh blockhash right before the wallet opens: the same mint and instructions, so the review stays true
    let txb=fl.tx.txBase64;
    try{const fresh=await api(`/api/projects/${encodeURIComponent(cur.slug)}/launch/refresh`,{method:'POST',body:{}});if(fresh?.txBase64&&fresh.mint===fl.tx.mint){txb=fresh.txBase64;fl.tx={...fl.tx,...fresh};}}
    catch(x){if(x?.status&&x.status!==404)throw x;}   // an older server without the route: sign what was reviewed
    signed=(await signTransaction(name,txb,{chain:chainFor(fl.tx.network)})).signed;}
   await api(`/api/projects/${encodeURIComponent(cur.slug)}/launch/signed`,{method:'POST',body:{signed}});
   flight=null;await refresh();
  }catch(x){
   if(x?.rejected){await abandon(root,b,err,refresh,'rejected');err.textContent='Cancelled in the wallet. Nothing was signed or sent.';return;}
   err.textContent=x?.status?explainError(x):describeError(x);busy(b,false);
   if(x?.status===400||x?.status===409){flight=null;later(1500,()=>refresh(explainError(x)));}
  }
 }

 function ideasTab(){
  const list=model.ideas.length?el('ol',{className:'pc-ideas'},...model.ideas.map(i=>el('li',{className:i===focusIdea?'is-focus':''},el('strong',{textContent:i.title}),el('small',{textContent:i.stageLabel||'in the mailbox'})))):el('p',{className:'pc-note',textContent:'No ideas in flight.'});
  const drop=el('button',{className:'button button-orange pc-cta',type:'button'},icon('mail','i lead'),'Drop a new idea'),note=el('p',{className:'pc-note'});
  drop.onclick=()=>{if(onIdea){close({quiet:true});onIdea();}else note.textContent='The mailbox is in the city: go back and use “Drop an idea”.';};
  return [list,drop,note];}
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
  if((e.key==='ArrowRight'||e.key==='ArrowLeft')&&e.target?.classList?.contains('pc-tab')){const list=tabsFor(model,cur),k=list.indexOf(tab),n=list[(k+(e.key==='ArrowRight'?1:-1)+list.length)%list.length];show(n);tabs.querySelector(`[data-tab="${n}"]`)?.focus();}};
 document.addEventListener('keydown',onKey,true);
 function close({quiet=false}={}){if(closed)return;closed=true;document.removeEventListener('keydown',onKey,true);clearBody();back.remove();if(prevFocus?.isConnected)prevFocus.focus?.({preventScroll:true});onClose?.({quiet});}
 show(cur?'site':'ideas');document.body.append(back);win.focus({preventScroll:true});
 return {close,get open(){return !closed;}};
}
