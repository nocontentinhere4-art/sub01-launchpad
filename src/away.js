// "While you were away" (GET /api/away): a quiet glass card when you enter your own room, listing what happened since
// your last visit (visits, guestbook notes, your ideas moving). Nothing when empty; never a push, a badge or a streak.
// Items already shown once in this browser are not shown again (the newest time seen is kept in localStorage).
export const AWAY_SEEN_KEY='sub01.away.seen';
export const STAGE_TEXT={submitted:'in his mailbox',evaluating:'being read',selected:'chosen to build',declined:'passed',generating:'being built',preview_ready:'ready for your review',
 approved:'approved',launch_prepared:'launch ready',awaiting_signature:'waiting for your signature',confirming:'confirming on-chain',launched:'launched',failed:'stopped',cancelled:'cancelled'};
const at=x=>Number(x?.at)||0;
// The card's model, or null when nothing is new. seen: newest time already shown (ms).
export function awayModel(r,seen=0){
 if(!r||typeof r!=='object')return null;const fresh=x=>x&&at(x)>seen;
 const visits=(Array.isArray(r.visits)?r.visits:[]).filter(fresh).map(v=>({name:String(v.name||'Visitor'),at:at(v)}));
 const guestbook=(Array.isArray(r.guestbook)?r.guestbook:[]).filter(g=>fresh(g)&&typeof g.text==='string').map(g=>({name:String(g.name||'Visitor'),text:g.text,at:at(g)}));
 const project=(Array.isArray(r.project)?r.project:[]).filter(p=>fresh(p)&&p.to).map(p=>({slug:p.slug||null,to:String(p.to),text:`Your idea${p.slug?` “${p.slug}”`:''} is now ${STAGE_TEXT[p.to]||String(p.to).replace(/_/g,' ')}.`,at:at(p)}));
 if(!visits.length&&!guestbook.length&&!project.length)return null;
 const lines=[];
 if(visits.length)lines.push(visits.length===1?`${visits[0].name} visited.`:`${visits.length} people visited: ${visits.slice(0,3).map(v=>v.name).join(', ')}${visits.length>3?'…':''}.`);
 if(guestbook.length)lines.push(`${guestbook.length} new guestbook note${guestbook.length===1?'':'s'}.`);
 const newest=Math.max(...[...visits,...guestbook,...project].map(x=>x.at));
 return {since:Number(r.since)||null,visits,guestbook:guestbook.slice(0,3),project:project.slice(0,4),lines,newest,note:typeof r.note==='string'?r.note:''};
}
const store=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
export const seenAt=(s=store())=>{try{return Number(s?.getItem(AWAY_SEEN_KEY))||0;}catch{return 0;}};
export const markSeen=(t,s=store())=>{try{s?.setItem(AWAY_SEEN_KEY,String(t));}catch{}};

// The card element, or null. getJSON(path) → /api/away.
export async function awayCard(getJSON){
 let r=null;try{r=await getJSON('/api/away');}catch{return null;}
 const m=awayModel(r,seenAt());if(!m)return null;markSeen(m.newest);
 const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null&&k!==false));return n;};
 const card=el('aside',{className:'away-card'});card.setAttribute('aria-label','While you were away');
 const close=el('button',{type:'button',className:'close-button',ariaLabel:'Close',textContent:'×',onclick:()=>card.remove()});
 card.append(...[close,el('span',{className:'eyebrow',textContent:'WHILE YOU WERE AWAY · 留守中'}),...m.lines.map(t=>el('p',{className:'away-line',textContent:t})),
  m.guestbook.length?el('ul',{className:'away-notes'},...m.guestbook.map(g=>el('li',{},el('b',{textContent:g.name}),' ',g.text))):null,
  m.project.length?el('ul',{className:'away-moves'},...m.project.map(p=>el('li',{textContent:p.text}))):null,
  m.note?el('p',{className:'fine',textContent:m.note}):null].filter(Boolean));
 return card;
}
