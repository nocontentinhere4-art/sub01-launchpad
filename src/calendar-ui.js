// Calendar + week theme (GET /api/calendar, docs/CITY-API.md): the "today" strip in the project panel (the dock on
// phones), the next event in the activity bar and the Calendar sheet. Pure helpers first (tests/calendar-ui.test.js);
// the DOM is touched only when createCalendarUI() is called. The theme drives one thing: a tint on the eyebrow dot.
export const THEME_DOT={hanami:'#F4A6BE',matsuri:'#FF7A4D',neon:'#FF5FA8',rain:'#8FB6FF',obon:'#FFD27A',moon:'#E8DFC0',snow:'#D6E4F2',newyear:'#E8B23A'};
import {icon} from './icons.js';
// icon: an id from the sprite in index.html (icons.js icon()).
export const KINDS={launch_party:{icon:'party',label:'Launch party'},open_soon:{icon:'lantern',label:'Opening soon'},omikuji:{icon:'torii',label:'Omikuji'},ranking:{icon:'trophy',label:'Room ranking'}};
const JST=9*3600e3,pad=n=>String(n).padStart(2,'0');
// Tokyo wall time of a unix ms: {date:'YYYY-MM-DD', time:'HH:MM', md:'Oct 12'}.
export function jst(ms){const d=new Date(Number(ms)+JST);return {date:d.toISOString().slice(0,10),time:`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
 md:d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})};}
// "40 min", "1 h 05", "3 d"; zero or less is "now".
export function countdown(ms){if(!(ms>0))return 'now';const m=Math.ceil(ms/6e4);if(m<60)return `${m} min`;const h=Math.floor(m/60),r=m%60;if(h<24)return r?`${h} h ${pad(r)}`:`${h} h`;return `${Math.round(h/24)} d`;}
// live: started and not over; soon: later; past: over. Events without `ends` last one minute.
export function eventState(e,now){const at=Number(e?.at),ends=Number.isFinite(Number(e?.ends))?Number(e.ends):at+6e4;return now<at?'soon':now<ends?'live':'past';}
const who=e=>e?.ticker?'$'+String(e.ticker).replace(/^\$/,''):e?.name||'';
const valid=e=>e&&typeof e==='object'&&KINDS[e.kind]&&Number.isFinite(Number(e.at));
// One chip: {kind, icon, label, sub, state, at, plotId, slug}. omikuji: today's slip state ({drawn, kanji}) or null.
export function chipFor(e,now,omikuji=null){
 const k=KINDS[e.kind],state=eventState(e,now),base={kind:e.kind,icon:k.icon,state,at:Number(e.at),plotId:e.plotId||null,slug:e.slug||null};
 if(e.kind==='launch_party')return {...base,label:k.label,sub:`${who(e)||'a project'} · ${state==='live'?`on now, ${countdown(Number(e.ends)-now)} left`:`in ${countdown(Number(e.at)-now)}`}`};
 if(e.kind==='open_soon')return {...base,state:'soon',label:k.label,sub:`${who(e)||'a project'} · on signature`};
 if(e.kind==='omikuji')return {...base,label:omikuji?.drawn?`Omikuji · ${omikuji.kanji||'drawn'}`:'Draw your omikuji',sub:omikuji?.drawn?'see you tomorrow':'one slip a day'};
 return {...base,label:k.label,sub:e.placeholder?'not started yet':state==='live'?'closes today':`in ${countdown(Number(e.at)-now)}`};
}
const RANK={live:0,soon:1,past:2};
// The strip: the week theme and up to `max` chips. Order: live events (ending first), today's next ones by start,
// projects opening soon, then the omikuji. Past events and placeholders are left out.
export function stripModel(cal,now,{omikuji=null,max=4}={}){
 const t=cal?.weekTheme,theme=t&&t.id?{id:String(t.id),title:String(t.title||t.id),kanji:String(t.kanji||''),text:String(t.text||''),dot:THEME_DOT[t.id]||null}:null;
 const today=(Array.isArray(cal?.today?.events)?cal.today.events:[]).filter(valid),soon=(Array.isArray(cal?.upcoming)?cal.upcoming:[]).filter(e=>valid(e)&&e.kind==='open_soon');
 const order=e=>e.kind==='omikuji'?3:e.kind==='open_soon'?2:1;
 const chips=[...today,...soon].filter(e=>!e.placeholder&&(e.kind==='omikuji'||e.kind==='open_soon'||eventState(e,now)!=='past'))
  .map(e=>chipFor(e,now,omikuji)).filter((c,i,a)=>a.findIndex(x=>x.kind===c.kind&&x.at===c.at&&x.label===c.label)===i)
  .sort((a,b)=>order(a)-order(b)||RANK[a.state]-RANK[b.state]||a.at-b.at).slice(0,max);
 return {theme,chips};
}
// The activity bar's line: the first live or coming event that is not the daily omikuji, else the next omikuji.
export function nextEventText(cal,now){
 const all=[...(cal?.today?.events||[]),...(cal?.upcoming||[])].filter(e=>valid(e)&&!e.placeholder&&eventState(e,now)!=='past').sort((a,b)=>a.at-b.at);
 const e=all.find(e=>e.kind!=='omikuji'&&e.kind!=='open_soon')||all.find(e=>e.kind==='open_soon')||all.find(e=>e.kind==='omikuji'&&e.at>now);
 if(!e)return '';
 if(e.kind==='open_soon')return `Opening soon: ${who(e)||'a project'}`;
 if(e.kind==='omikuji')return `Next omikuji in ${countdown(e.at-now)}`;
 return eventState(e,now)==='live'?`${KINDS[e.kind].label} ${who(e)} on now`.replace(/\s+/g,' '):`${KINDS[e.kind].label} ${who(e)} in ${countdown(e.at-now)}`.replace(/\s+/g,' ');
}
// The Calendar sheet: today and the coming days, each row {icon,title,when,plotId,slug,state,placeholder}.
export function sheetModel(cal,now){
 const row=(e,day)=>{const w=jst(e.at),k=KINDS[e.kind],st=eventState(e,now);
  return {kind:e.kind,icon:k.icon,title:String(e.title||k.label),when:e.kind==='open_soon'?'expected, not scheduled':day?(st==='live'?`now · until ${jst(e.ends).time} JST`:`${w.time} JST`):`${w.md} · ${w.time} JST`,
   plotId:e.plotId||null,slug:e.slug||null,state:st,placeholder:!!e.placeholder};};
 const today=(cal?.today?.events||[]).filter(valid).sort((a,b)=>a.at-b.at).map(e=>row(e,true));
 const upcoming=(cal?.upcoming||[]).filter(valid).sort((a,b)=>a.at-b.at).slice(0,30).map(e=>row(e,false));
 return {date:String(cal?.tokyoDate||jst(now).date),theme:stripModel(cal,now).theme,isoWeek:cal?.weekTheme?.isoWeek||'',today,upcoming};
}

// ---------------------------------------------------------------- DOM
// ctx: getJSON(path), openDialog(id), closeDialog(), onFocus(plotId), onShrine(), omikuji() → {drawn,kanji}|null.
export function createCalendarUI(ctx){
 const $=id=>document.getElementById(id),el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null&&k!==false));return n;};
 let cal=null,offset=0;   // offset: server now − local now, so countdowns follow the server clock
 const now=()=>Date.now()+offset;
 const strip=el('div',{className:'today-strip',id:'today-strip',hidden:true});strip.setAttribute('aria-label','Today in the city');
 $('eki')?.after(strip);
 function act(c){if(c.kind==='omikuji'){ctx.onShrine?.();return;}if(c.plotId){ctx.onFocus?.(c.plotId);return;}open();}
 function render(){
  if(!cal){strip.hidden=true;return;}
  const {theme,chips}=stripModel(cal,now(),{omikuji:ctx.omikuji?.()});
  document.documentElement.style.setProperty('--theme-dot',theme?.dot||'var(--accent)');
  const themeBtn=el('button',{type:'button',className:'today-theme',title:theme?.text||'This week',onclick:open},
   el('span',{className:'jp',textContent:theme?.kanji||'暦',ariaHidden:'true'}),el('span',{className:'today-theme-t'},el('small',{textContent:'THIS WEEK'}),el('b',{textContent:theme?.title||'Calendar'})));
  themeBtn.setAttribute('aria-label',`This week: ${theme?.title||'calendar'}. Open the calendar`);
  strip.replaceChildren(themeBtn,el('div',{className:'today-chips'},...chips.map(c=>{const b=el('button',{type:'button',className:'today-chip is-'+c.state,onclick:()=>act(c)},
   el('span',{className:'ic',ariaHidden:'true'},icon(c.icon)),el('span',{className:'tx'},el('b',{textContent:c.label}),el('small',{textContent:c.sub})));return b;})));
  strip.hidden=false;
 }
 function open(){
  if(!cal){ctx.notify?.('The calendar is not reachable right now.');return;}
  const m=sheetModel(cal,now()),body=$('calendar-body');
  const row=r=>{const b=el(r.plotId||r.kind==='omikuji'?'button':'div',{className:'cal-row is-'+r.state+(r.placeholder?' is-placeholder':'')},
   el('span',{className:'ic',ariaHidden:'true'},icon(r.icon)),el('span',{className:'tx'},el('b',{textContent:r.title}),el('small',{textContent:r.when+(r.placeholder?' · placeholder, nothing runs yet':'')})),
   r.plotId?el('span',{className:'go'},'Show',icon('arrow')):null);
   if(b.tagName==='BUTTON'){b.type='button';b.onclick=()=>{ctx.closeDialog();if(r.kind==='omikuji')ctx.onShrine?.();else ctx.onFocus?.(r.plotId);};}return b;};
  $('calendar-theme').replaceChildren(el('span',{className:'jp',textContent:m.theme?.kanji||'',ariaHidden:'true'}),el('span',{},el('b',{textContent:`${m.theme?.title||'This week'}${m.isoWeek?' · '+m.isoWeek:''}`}),el('small',{textContent:m.theme?.text||''})));
  body.replaceChildren(el('h3',{className:'sheet-h',textContent:`Today · ${m.date}`}),...(m.today.length?m.today.map(row):[el('p',{className:'fine',textContent:'Nothing scheduled today.'})]),
   el('h3',{className:'sheet-h',textContent:'Coming up'}),...(m.upcoming.length?m.upcoming.map(row):[el('p',{className:'fine',textContent:'Nothing scheduled yet.'})]));
  ctx.openDialog('calendar-backdrop');
 }
 async function refresh(){try{const c=await ctx.getJSON('/api/calendar');if(c&&typeof c==='object'&&c.today){cal=c;if(Number.isFinite(c.now))offset=c.now-Date.now();}}catch{}render();}
 return {refresh,render,open,get data(){return cal;},next:()=>cal?nextEventText(cal,now()):''};
}
