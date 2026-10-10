// SUB-01's diary (GET /api/diary?date= · /api/diary/latest): one typed page per Tokyo day, written by the server from
// the vote ledger and the build log (fixed templates, no language model). The sheet has a date picker (prev / next
// day), entries with kind icons and the build score as a tiny bar, and the model note at the bottom. At 23:00 Tokyo a
// one-time toast says he wrote in it (once per day, never while something else has the screen). Pure helpers first.
export const DIARY_MIN='2020-01-01';
export const KIND_ICON={built:'🏗',passed:'✋',site_live:'🌐',launched:'🚀',moved_in:'🏠'};
export const KIND_LABEL={built:'Built',passed:'Passed',site_live:'Site live',launched:'Launched',moved_in:'Moved in'};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export const isDate=d=>typeof d==='string'&&DATE.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export const tokyoDate=(ms=Date.now())=>new Date(Number(ms)+9*3600e3).toISOString().slice(0,10);
export function shiftDate(d,days){if(!isDate(d))return null;const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+days);return t.toISOString().slice(0,10);}
// Navigation for a page: prev is null before DIARY_MIN, next is null past today (Tokyo); dates outside are clamped.
export function diaryNav(date,today,min=DIARY_MIN){
 let d=isDate(date)?date:today;if(d>today)d=today;if(d<min)d=min;
 const prev=shiftDate(d,-1),next=shiftDate(d,1);
 return {date:d,prev:prev>=min?prev:null,next:next<=today?next:null,isToday:d===today};
}
// Entries as the sheet draws them: {kind, icon, time (HH:MM JST), text, score (0..1 | null), pct, slug, ticker}.
export function diaryEntries(page){
 return (Array.isArray(page?.entries)?page.entries:[]).filter(e=>e&&typeof e.text==='string'&&KIND_ICON[e.kind]).map(e=>{
  const s=typeof e.score==='number'&&Number.isFinite(e.score)?Math.min(1,Math.max(0,e.score)):null,d=new Date(Number(e.at)+9*3600e3);
  return {kind:e.kind,icon:KIND_ICON[e.kind],label:KIND_LABEL[e.kind],time:Number.isFinite(Number(e.at))?`${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`:'',
   text:e.text,score:s,pct:s===null?null:Math.round(s*100),slug:typeof e.slug==='string'?e.slug:null,ticker:typeof e.ticker==='string'?e.ticker:null};});
}
export const countsLine=c=>c&&typeof c==='object'?[['built',c.built],['passed',c.passed],['launched',c.launched],['new residents',c.residents]].filter(([,n])=>Number(n)>0).map(([k,n])=>`${n} ${k}`).join(' · '):'';
// The 23:00 toast: once per Tokyo day, from 23:00 to midnight, only when nothing else holds the screen (quiet).
export const shouldToastDiary=({hours,today,last,busy})=>hours>=23&&hours<24&&last!==today&&!busy;

// ---------------------------------------------------------------- DOM
// ctx: getJSON(path), openDialog(id), today() → Tokyo date.
export function createDiary(ctx){
 const $=id=>document.getElementById(id),el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null&&k!==false));return n;};
 let current=null,token=0;
 async function show(date){
  const nav=diaryNav(date,ctx.today()),my=++token,body=$('diary-body');current=nav.date;
  const picker=el('input',{type:'date',className:'diary-date',value:nav.date,max:ctx.today(),min:DIARY_MIN});picker.setAttribute('aria-label','Diary date');
  picker.onchange=()=>{if(isDate(picker.value))show(picker.value);};
  const btn=(label,to,text)=>{const b=el('button',{type:'button',className:'icon-button diary-nav',disabled:!to,title:label,textContent:text});b.setAttribute('aria-label',label);b.onclick=()=>to&&show(to);return b;};
  $('diary-nav').replaceChildren(btn('Previous day',nav.prev,'‹'),picker,btn('Next day',nav.next,'›'));
  body.replaceChildren(el('p',{className:'fine',textContent:'Turning the page…'}));
  let page=null;try{page=await ctx.getJSON(`/api/diary?date=${nav.date}`);}catch{}
  if(my!==token)return;
  if(!page){body.replaceChildren(el('p',{className:'fine',textContent:'The diary is not reachable right now.'}));return;}
  const list=diaryEntries(page),counts=countsLine(page.counts);
  body.replaceChildren(el('div',{className:'diary-paper'},
   el('div',{className:'diary-date-line'},el('b',{textContent:nav.date}),el('small',{textContent:nav.isToday?'today · still writing':counts||'a quiet day'})),
   list.length?el('ol',{className:'diary-list'},...list.map(e=>el('li',{className:'diary-entry is-'+e.kind},el('span',{className:'ic',textContent:e.icon,title:e.label}),
    el('div',{className:'tx'},el('small',{textContent:`${e.time} · ${e.label}`}),el('p',{textContent:e.text}),
     e.pct!==null?el('span',{className:'diary-score',title:`build score ${e.score}`},el('i',{style:`width:${e.pct}%`}),el('em',{textContent:String(e.score)})):null)))):
    el('p',{className:'diary-empty',textContent:nav.isToday?'Nothing written yet today.':'Nothing happened that day.'})),
   el('p',{className:'fine diary-note',textContent:typeof page.note==='string'?page.note:'SUB-01 is a model, not a conscious being.'}));
 }
 function open(date){ctx.openDialog('diary-backdrop');return show(date||ctx.today());}
 return {open,show,get date(){return current;}};
}
