import * as THREE from 'three';
import {icon} from './icons.js';
// The computer in a resident's room: each screen shows one of the owner's projects (a CanvasTexture), and tapping it opens
// the Computer overlay: the project's site, its X account, its launch page and (owner only) the ideas in flight.
// Data: GET /api/rooms/:plotId → desk:{projects,ideas}. Fields may be missing; everything below is defensive.
// Owner-only fields (previewLink, officePath, x.posts, ideas) are dropped client-side for visitors even if the payload leaks them.
// Host hook: host.openIdea() opens the mailbox (main.js wires it to openBuildForm); without it the Ideas tab shows a note.

// ---------------------------------------------------------------- data (pure, tested)
export const SCREEN_ITEMS=new Set(['computerScreen','laptop','televisionModern']);
// iframe sandboxes, matching the server: a public project site is static (no scripts) and itself sends a CSP sandbox with
// allow-popups allow-popups-to-escape-sandbox; the owner's preview is framed with sandbox="" like the review page;
// /projects pages are the launchpad's own app, which needs scripts and its cookie.
export const SANDBOX={site:'allow-popups allow-popups-to-escape-sandbox',preview:'',page:'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'};
export const TAB_LABELS={site:'🌐 Site',x:'𝕏',launch:'🚀 Launch',ideas:'✉ Ideas'};
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
const ext=(href,text,cls='pc-link')=>el('a',{className:cls,href,target:'_blank',rel:'noopener noreferrer',textContent:text});
const frame=(src,sandbox,title)=>{const f=el('iframe',{className:'pc-frame',src,title,loading:'lazy',referrerPolicy:'no-referrer'});f.setAttribute('sandbox',sandbox);return f;};
// openComputer({model,project,ownerName,onIdea,onClose}) → {close()}. onIdea: null when main.js has not wired host.openIdea.
export function openComputer({model,project=null,ownerName='',onIdea=null,onClose}){
 const items=switcherItems(model),prevFocus=document.activeElement;
 let cur=project||model.projects[0]||null,tab=null,closed=false,focusIdea=null;
 const back=el('div',{className:'pc-backdrop'}),win=el('section',{className:'pc-window',tabIndex:-1});win.setAttribute('role','dialog');win.setAttribute('aria-modal','true');
 const title=el('div',{className:'pc-title'}),closeB=el('button',{className:'pc-close',type:'button',title:'Close (Esc)',onclick:()=>close()},icon('x'));closeB.setAttribute('aria-label','Close the computer');
 const tabs=el('div',{className:'pc-tabs'}),body=el('div',{className:'pc-body'});tabs.setAttribute('role','tablist');body.setAttribute('role','tabpanel');
 win.append(el('header',{className:'pc-bar'},el('span',{className:'pc-dots'},el('i'),el('i'),el('i')),title,closeB),tabs,body);back.append(win);
 back.addEventListener('pointerdown',e=>{if(e.target===back)close();});
 function renderTitle(){
  if(items.length>1){const s=el('select',{className:'pc-switch'});s.setAttribute('aria-label','Switch project');
   for(const it of items){const o=el('option',{value:it.key,textContent:it.label});o.selected=cur?it.project===cur:it.idea===focusIdea;s.append(o);}
   s.onchange=()=>{const it=items.find(i=>i.key===s.value);if(it?.project){cur=it.project;focusIdea=null;show('site');}else if(it){focusIdea=it.idea;show('ideas');}};
   title.replaceChildren(s);}
  else title.replaceChildren(el('strong',{textContent:cur?`${cur.name}${cur.ticker?' · $'+cur.ticker:''}`:`${ownerName}'s computer`}));
  win.setAttribute('aria-label',cur?`${ownerName}'s computer: ${cur.name}`:`${ownerName}'s computer`);
 }
 function clearBody(){for(const f of body.querySelectorAll('iframe')){f.src='about:blank';f.remove();}body.replaceChildren();}   // frames live only while their tab is shown
 function show(id){
  const list=tabsFor(model,cur);if(!list.includes(id))id=list[0];tab=id;renderTitle();
  tabs.replaceChildren(...list.map(t=>{const b=el('button',{className:'pc-tab',type:'button',textContent:TAB_LABELS[t],onclick:()=>show(t)});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(t===id));b.tabIndex=t===id?0:-1;b.dataset.tab=t;return b;}));
  tabs.hidden=list.length<2;clearBody();body.dataset.tab=id||'';
  body.append(...(id==='site'?siteTab():id==='x'?xTab():id==='launch'?launchTab():id==='ideas'?ideasTab():[el('p',{className:'pc-empty',textContent:'Nothing on this computer yet.'})]));
 }
 const bar=(...kids)=>el('div',{className:'pc-toolbar'},...kids);
 function siteTab(){const s=siteFor(cur,model.mine);
  if(!s.src)return [el('div',{className:'pc-empty'},el('strong',{textContent:'🛠 '+s.empty}),el('p',{textContent:model.mine?'The site appears here as soon as SUB-01 builds the first version.':'Come back later: the site goes up when it is built.'}))];
  return [bar(el('span',{className:'pc-url',textContent:s.preview?'Preview · '+(cur.siteUrl||'not public yet'):s.src}),ext(s.open,'Open in a new tab ↗')),frame(s.src,s.sandbox,`${cur.name}: website`)];}
 function xTab(){const x=cur.x,out=[];
  out.push(el('div',{className:'pc-x'},el('div',{className:'pc-x-avatar',textContent:'𝕏'}),el('div',{},el('strong',{textContent:x.handle?'@'+x.handle:'No X account yet'}),el('small',{className:'pc-x-status pc-x-'+(x.status||'none'),textContent:X_STATUS[x.status]})),
   x.url?ext(x.url,'Open on X ↗','button button-dark pc-x-open'):null));
  if(!model.mine){out.push(el('p',{className:'pc-note',textContent:x.status==='connected'?`The project's posts live on X.`:x.status==='planned'?'The account is planned: it opens when the project goes public.':'This project has no X account.'}));return out;}
  out.push(el('h4',{textContent:'Latest drafts'}));
  out.push(x.posts.length?el('ol',{className:'pc-posts'},...x.posts.map(q=>el('li',{},el('span',{textContent:q.text}),el('small',{className:'pc-post-'+q.status,textContent:q.status})))):el('p',{className:'pc-note',textContent:'No drafts yet.'}));
  out.push(el('p',{className:'pc-note',textContent:'Posting goes through the office: you approve each post there. Nothing is posted from this computer.'}));
  if(cur.officePath)out.push(ext(cur.officePath+'#x','Review in the office ↗','button button-orange pc-cta'));
  return out;}
 function launchTab(){const p=cur;
  const head=bar(el('span',{className:'pc-stage'},el('b',{textContent:p.launched?'Launched':p.stageLabel}),el('i',{className:'pc-progress'},Object.assign(el('i'),{style:`width:${Math.round(p.progress*100)}%`}))),
   p.explorerTx?ext(p.explorerTx,'Explorer ↗'):null,model.mine&&p.officePath?ext(p.officePath,'Open the office ↗','button button-orange pc-cta'):null,ext(p.pagePath,'New tab ↗'));
  return [head,frame(p.pagePath,SANDBOX.page,`${p.name}: launch page`)];}
 function ideasTab(){
  const list=model.ideas.length?el('ol',{className:'pc-ideas'},...model.ideas.map(i=>el('li',{className:i===focusIdea?'is-focus':''},el('strong',{textContent:i.title}),el('small',{textContent:i.stageLabel||'in the mailbox'})))):el('p',{className:'pc-note',textContent:'No ideas in flight.'});
  const drop=el('button',{className:'button button-orange pc-cta',type:'button',textContent:'✉ Drop a new idea'}),note=el('p',{className:'pc-note'});
  drop.onclick=()=>{if(onIdea){close({quiet:true});onIdea();}else note.textContent='The mailbox is in the city: go back and use “Drop an idea”.';};
  return [list,drop,note];}
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
  if((e.key==='ArrowRight'||e.key==='ArrowLeft')&&e.target?.classList?.contains('pc-tab')){const list=tabsFor(model,cur),k=list.indexOf(tab),n=list[(k+(e.key==='ArrowRight'?1:-1)+list.length)%list.length];show(n);tabs.querySelector(`[data-tab="${n}"]`)?.focus();}};
 document.addEventListener('keydown',onKey,true);
 function close({quiet=false}={}){if(closed)return;closed=true;document.removeEventListener('keydown',onKey,true);clearBody();back.remove();if(prevFocus?.isConnected)prevFocus.focus?.({preventScroll:true});onClose?.({quiet});}
 show(cur?'site':'ideas');document.body.append(back);win.focus({preventScroll:true});
 return {close,get open(){return !closed;}};
}
