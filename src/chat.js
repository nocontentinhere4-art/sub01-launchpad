// City chat: a live line under the city (SSE /api/chat/stream) and speech bubbles over the speakers' heads.
// Residents write to the city (POST /api/chat) or to SUB-01 (POST /api/chat/sub01, or "@sub01 …"); his reply arrives
// later on the stream, from his model, in his own time. Nothing here invents a reply. Bubbles ride main.js's world
// labels (labels[] projected every frame); this module only keeps their 3D anchor current (chat.frame()).
import * as THREE from 'three';
import {api} from './api.js';
import {districts,cityPlots} from './city-state.js';
import {frontOf} from './world-sync.js';

// ---- Pure helpers (tests/chat.test.js) ----
export const CHAT={max:50,bubbleMs:7000,stack:3,presenceMs:20e3,presenceBeat:45e3,sendGap:3e3,sub01Gap:20e3,farZoom:.5,maxLen:140,
 delays:[1e3,2e3,4e3,8e3,15e3,30e3],stream:'/api/chat/stream'};
const KINDS=new Set(['resident','sub01','system']);
// A stream message as the city keeps it. Any `tag` the server sends is dropped: SUB-01 speaks as SUB-01 (owner decision).
export function normalizeMsg(m){
 if(!m||typeof m!=='object'||m.id==null||typeof m.text!=='string')return null;
 const kind=KINDS.has(m.kind)?m.kind:'resident',s=(v,n)=>v==null?null:String(v).slice(0,n);
 return {id:String(m.id),at:Number(m.at)||Date.now(),name:kind==='sub01'?'SUB-01':s(m.name,32)||'Someone',text:m.text.slice(0,500),
  district:s(m.district,32),plotId:s(m.plotId,32),kind,to:m.to==='sub01'?'sub01':null,replyingTo:replyOf(m.replyingTo)};
}
// replyingTo is {id|null, name|null, text|null} (a bare id is accepted too); a reply to a viewer of his room has no id.
function replyOf(r){if(r==null)return null;if(typeof r!=='object')return {id:String(r),name:null,text:null};
 const x={id:r.id==null?null:String(r.id),name:r.name==null?null:String(r.name).slice(0,32),text:r.text==null?null:String(r.text).slice(0,200)};return x.id||x.text?x:null;}
// The last `max` messages, deduped by id. Your own message goes in at once (local) and is reconciled with the server's
// copy: by the POST's id, or by its echo on the stream (same name and text) when that comes first.
export function createLog(max=CHAT.max){
 let list=[],n=0;
 const trim=()=>{if(list.length>max)list=list.slice(-max);};
 return {
  get list(){return list;},find:id=>list.find(x=>x.id===id||x.local===id)||null,
  add(raw){const m=normalizeMsg(raw);if(!m)return null;if(list.some(x=>x.id===m.id))return 'dup';
   const i=list.findIndex(x=>x.local&&!x.serverId&&!x.failed&&m.kind==='resident'&&x.name===m.name&&x.text===m.text);
   if(i>=0){list[i]={...list[i],...m,id:m.id,serverId:true,pending:false};return 'reconciled';}
   let k=list.length;while(k>0&&(list[k-1].at||0)>m.at)k--;list.splice(k,0,m);trim();return 'new';},   // kept in time order
  local(m){const local='local:'+(++n),x={...m,id:local,local,at:m.at||Date.now(),pending:true,mine:true};list.push(x);trim();return x;},
  // The POST's answer: the server's id and its cleaned copy. An echo that already arrived under that id (its text
  // cleaned, so not matched) is folded into yours; `dropped` says so, for its bubble.
  confirm(local,id,server=null){const x=list.find(y=>y.local===local);if(!x)return null;x.pending=false;let dropped=false;
   if(id!=null&&!x.serverId){const dup=list.findIndex(y=>y!==x&&y.id===String(id));if(dup>=0){list.splice(dup,1);dropped=true;}x.id=String(id);x.serverId=true;}
   const m=server&&normalizeMsg(server);if(m)Object.assign(x,{text:m.text,at:m.at,district:m.district,plotId:m.plotId});return {msg:x,dropped};},
  fail(local,reason){const x=list.find(y=>y.local===local);if(x){x.pending=false;x.failed=reason||'Not sent';}return x;},
  del(id){const i=list.findIndex(x=>x.id===String(id));if(i<0)return false;list.splice(i,1);return true;},
  clear(){list=[];}};
}
// Bubbles per speaker: newest first, at most `max`, each `ms` long.
export function createBubbles({max=CHAT.stack,ms=CHAT.bubbleMs}={}){
 const stacks=new Map();
 return {
  push(key,b,now){if(!key)return [];const s=stacks.get(key)||[];s.unshift({...b,until:now+ms});const dropped=s.splice(max);stacks.set(key,s);return dropped;},
  expire(now){const changed=[];for(const [k,s] of stacks){const keep=s.filter(b=>b.until>now);if(keep.length!==s.length){changed.push(k);if(keep.length)stacks.set(k,keep);else stacks.delete(k);}}return changed;},
  remove(id){for(const [k,s] of stacks){const i=s.findIndex(b=>b.id===id);if(i>=0){s.splice(i,1);if(!s.length)stacks.delete(k);return k;}}return null;},
  rekey(from,to){for(const s of stacks.values())for(const b of s)if(b.id===from)b.id=to;},
  stack:key=>stacks.get(key)||[],keys:()=>[...stacks.keys()]};
}
// Whose head a message floats over: 'sub01', 'me', 'plot:<id>'; system lines have no bubble.
export function speakerOf(m,{myName=null,myPlot=null}={}){
 if(!m||m.kind==='system')return null;if(m.kind==='sub01')return 'sub01';
 if(m.mine||(myName&&m.name===myName&&(!m.plotId||!myPlot||m.plotId===myPlot)))return 'me';
 return m.plotId?'plot:'+m.plotId:null;
}
// "@sub01 …" (or @SUB-01, or the SUB-01 chip) goes to SUB-01; everything else to the city.
const AT=/^@sub-?01(?![\w-])[\s,:]*/i;
export function route(text,{toSub01=false}={}){
 const t=String(text??'').replace(/\s+/g,' ').trim(),m=AT.exec(t),body=(m?t.slice(m[0].length):t).trim().slice(0,CHAT.maxLen),to=m||toSub01?'sub01':'city';
 return {to,text:body,path:to==='sub01'?'/api/chat/sub01':'/api/chat'};
}
// Server-sent events, by the spec: fields per line, blank line dispatches, ':' comments, multi-line data joined by \n,
// CR / LF / CRLF line ends (a CR split across chunks too), id and retry kept for the reconnect.
export function createSSEParser(){
 let buf='',data=[],event='',lastId=null,retry=null;
 function line(l,out){
  if(l===''){if(data.length)out.push({event:event||'message',data:data.join('\n'),id:lastId});data=[];event='';return;}
  if(l[0]===':')return;const k=l.indexOf(':'),f=k<0?l:l.slice(0,k);let v=k<0?'':l.slice(k+1);if(v[0]===' ')v=v.slice(1);
  if(f==='data')data.push(v);else if(f==='event')event=v;else if(f==='id'){if(!v.includes('\0'))lastId=v;}else if(f==='retry'&&/^\d+$/.test(v))retry=+v;
 }
 return {feed(chunk){buf+=chunk;let s=buf,tail='';if(s.endsWith('\r')){tail='\r';s=s.slice(0,-1);}const parts=s.split(/\r\n|\r|\n/),out=[];buf=parts.pop()+tail;for(const l of parts)line(l,out);return out;},
  reset(){buf='';data=[];event='';},get lastId(){return lastId;},get retry(){return retry;}};
}
// Reconnect delays: 1, 2, 4, 8, 15, 30 s (±20%), back to the start once a stream opened.
export function createBackoff(delays=CHAT.delays,{jitter=.2,random=Math.random}={}){let n=0;
 return {next(){const d=delays[Math.min(n,delays.length-1)];n++;return Math.round(d*(1+jitter*(random()*2-1)));},reset(){n=0;},get attempts(){return n;}};}
export const cooldown=(lastAt,now,gap)=>Math.max(0,(lastAt||0)+gap-now);
// Presence: on load, on a district change (never twice in 20 s), else a beat every 45 s (entries expire after 90 s).
export const presenceDue=(lastAt,now,{changed=false}={})=>!lastAt||now-lastAt>=(changed?CHAT.presenceMs:CHAT.presenceBeat);
// What a refused post says, in the city's words (server codes in body.error; SUB-01's filter gives body.reason).
export function chatError(err,to='city'){
 const code=err?.body?.error||err?.body?.code||'',st=err?.status,wait=Number(err?.body?.retryAfterS);
 if(code==='sub01_busy')return 'SUB-01 is listening to someone else, try in a few seconds.';
 if(code==='sub01_refused')return err.body.reason?`SUB-01 did not take it: ${err.body.reason}.`:'SUB-01 did not take that message.';
 if(code==='sub01_offline')return 'SUB-01 is offline: messages to him cannot be delivered right now.';
 if(code==='sub01_no_answer')return 'SUB-01’s server did not answer. Try again in a bit.';
 if(code==='rate_limited'||st===429)return (to==='sub01'?'One message to SUB-01 every 20 s.':'One message every 3 s.')+(wait>0?` Wait ${Math.ceil(wait)} s.`:'');
 if(code==='duplicate')return 'You just said that.';
 if(code==='no_links')return 'Links are not allowed in the city chat.';
 if(code==='blocked')return 'That message cannot be posted.';
 if(code==='impersonation')return 'Messages cannot pose as SUB-01.';
 if(code==='bad_text')return `1–${CHAT.maxLen} characters.`;
 if(code==='no_resident')return 'Make your resident to chat.';
 if(st===401)return 'Sign in to chat.';
 return err?.message||'Not sent.';
}
// The district you are in: the station board's choice, else the district nearest the camera target.
export function districtAt(target,list=districts,{selected=''}={}){
 if(selected&&list.some(d=>d.id===selected))return selected;if(!target||!list.length)return null;
 let best=null,bd=Infinity;for(const d of list){const q=(d.x-target.x)**2+(d.z-target.z)**2;if(q<bd){bd=q;best=d.id;}}return best;
}
export const districtLabel=id=>id?(districts.find(d=>d.id===id)?.name||id).split(' / ')[0].toUpperCase():'';
// Who may write: a signed-in resident. Guests and visitors read; writing asks for the wallet (or the resident) first.
export function chatGate(me){if(!me?.user)return 'signin';if(!me.resident)return 'resident';return 'ok';}
// SUB-01's state chip. He answers only awake at his desk; asleep or resting the message waits; offline nothing goes.
export function sub01Status(s){
 const st=s?.state,w=Number(s?.waiting)>0?` · ${Number(s.waiting)} waiting`:'';
 if(st==='awake'&&s.atDesk)return {key:'desk',label:'Awake at his desk'+w,canSend:true};
 if(st==='awake')return {key:'awake',label:'Awake, away from his desk'+w,canSend:true};
 if(st==='asleep')return {key:'asleep',label:'Asleep'+w,canSend:true};
 if(st==='resting')return {key:'resting',label:'Resting: no replies today',canSend:true};
 return {key:'offline',label:st==='offline'?'Offline':'Status unknown',canSend:false,
  reason:st==='offline'?'SUB-01 is offline: messages to him cannot be delivered right now.':'SUB-01’s status has not reached the city yet.'};
}
export const onlineCount=o=>Array.isArray(o)?o.length:Number.isFinite(+o)?+o:0;
const initials=n=>(String(n).match(/[\p{L}\p{N}]/gu)||['?']).slice(0,2).join('').toUpperCase();

// ---- DOM wiring ----
// ctx (main.js): me(), labels (main's world-label list), notify, requireWallet(reason,next), openCreator(next),
// sub01() → his model, visitor() → your roaming model or null, target() → camera target, selected() → board district.
export function createChat(ctx){
 const $=id=>document.getElementById(id),el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids);return n;};
 const form=$('chat-form'),input=$('chat-input'),sendBtn=$('chat-send'),toBtn=$('chat-to'),toggle=$('chat-toggle'),panel=$('chat-panel'),list=$('chat-list'),note=$('chat-note');
 if(!form)return null;
 const log=createLog(),bubbles=createBubbles(),stackLabels=new Map();
 let you=null,online=[],sub01=null,toSub01=false,open=false,unread=0,state='connecting',gen=0,abort=null,timer=0,lastId=null,lastSend=0,lastSub01=0,lastPresence=0,acct='',asked=0;
 const backoff=createBackoff(),store=(()=>{try{return localStorage;}catch{return null;}})();
 const myName=()=>ctx.me()?.resident?.name||you?.name||null,myPlot=()=>ctx.me()?.resident?.plotId||you?.plotId||null;
 const district=()=>districtAt(ctx.target(),districts,{selected:ctx.selected()});
 const onlineHere=name=>{const d=district();return online.some(o=>o?.name===name&&(!o.district||o.district===d));};
 // Station board band: "· N ONLINE" after the live count.
 const band=el('span',{id:'eki-online',hidden:true});$('eki-live')?.parentElement?.append(band);

 // -- bubbles over heads
 const anchor=(key,out)=>{
  if(key==='sub01'){const c=ctx.sub01();if(!c)return false;out.copy(c.position);out.y+=2.75;return true;}
  if(key==='me'){const v=ctx.visitor();if(v){out.copy(v.position);out.y+=2.9;return true;}const p=myPlot();if(!p)return false;key='plot:'+p;}
  const f=frontOf(key.slice(5));if(!f)return false;out.set(f.x+1.2,2.45,f.z);return true;};
 function drawStack(key){
  const s=bubbles.stack(key);let l=stackLabels.get(key);
  if(!s.length){if(l){l.element.remove();const i=ctx.labels.indexOf(l);if(i>=0)ctx.labels.splice(i,1);stackLabels.delete(key);}return;}
  if(!l){l={element:el('div',{className:'world-label chat-stack'}),position:new THREE.Vector3(),roam:true,chat:key};l.element.dataset.speaker=key==='sub01'?'sub01':key==='me'?'me':'other';
   if(!anchor(key,l.position))return;stackLabels.set(key,l);$('labels').append(l.element);ctx.labels.push(l);}
  l.element.replaceChildren(el('span',{className:'chat-far',textContent:'💬'}),...s.map(b=>{
   const who=el('b',{className:'who'},...(key==='sub01'?[el('span',{className:'chat-av s',textContent:'01'})]:[]),b.name);
   if(key!=='sub01'&&onlineHere(b.name))who.prepend(el('i',{className:'on'}));
   return el('div',{className:'chat-bubble'},who,el('span',{className:'tx',textContent:b.text}));}));
 }
 function bubble(m){const key=speakerOf(m,{myName:myName(),myPlot:myPlot()});if(!key)return;bubbles.push(key,{id:m.id,name:m.name,text:m.text},performance.now());drawStack(key);}

 // -- panel
 const time=at=>{try{return new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}catch{return '';}};
 function row(m){
  const sys=m.kind==='system',sub=m.kind==='sub01',mine=m.mine||speakerOf(m,{myName:myName(),myPlot:myPlot()})==='me';
  const li=el('li',{className:'chat-row'+(sub?' is-sub01':'')+(mine?' is-me':'')+(sys?' is-system':'')+(m.pending?' is-pending':'')+(m.failed?' is-failed':'')});li.dataset.id=m.id;
  if(sys){li.append(el('p',{className:'chat-text',textContent:m.text}));return li;}
  const meta=el('div',{className:'chat-meta'},el('b',{textContent:m.name}));
  if(!sub&&onlineHere(m.name))meta.firstChild.prepend(el('i',{className:'on',title:'Online here'}));
  if(m.to==='sub01')meta.append(el('span',{className:'chat-chip to',textContent:'→ SUB-01'}));
  if(m.district)meta.append(el('span',{className:'chat-chip',textContent:districtLabel(m.district)}));
  meta.append(el('time',{textContent:m.failed?'not sent':m.pending?'sending…':time(m.at)}));
  const body=el('div',{className:'chat-body'},meta,el('p',{className:'chat-text',textContent:m.text}));
  const r=m.replyingTo,q=r?.id&&log.find(r.id),rn=r?.name||q?.name,rt=r?.text||q?.text;
  if(rt)body.append(el('p',{className:'chat-reply',textContent:`↪ ${rn||'a visitor of his room'}: “${rt.slice(0,80)}”`}));
  if(m.failed)body.append(el('p',{className:'chat-reply err',textContent:m.failed}));
  li.append(el('span',{className:'chat-av'+(sub?' s':''),textContent:sub?'01':initials(m.name),ariaHidden:'true'}),body);
  if(!mine&&!m.local)li.append(el('button',{type:'button',className:'chat-report',textContent:'Report',title:'Report this message',onclick:()=>report(m,li)}));
  return li;
 }
 function render(){
  if(!open)return;const atEnd=list.scrollHeight-list.scrollTop-list.clientHeight<40;
  list.replaceChildren(...(log.list.length?log.list.map(row):[el('li',{className:'chat-empty',textContent:state==='live'?'Nobody has said anything yet. Say hi to Tokyo.':'Connecting to the city chat…'})]));
  if(atEnd)list.scrollTop=list.scrollHeight;
 }
 function chrome(){
  const n=onlineCount(online),st=sub01Status(sub01);
  band.hidden=state!=='live';band.textContent=` · ${n} ONLINE`;
  $('chat-online').replaceChildren(el('i'),state==='live'?`${n} online`:state==='unavailable'?'chat offline':'connecting…');$('chat-online').classList.toggle('is-live',state==='live');
  const chip=$('chat-sub01-state');chip.className='chat-state is-'+st.key;chip.replaceChildren(el('i'),st.label);
  toggle.querySelector('.count')?.remove();if(unread&&!open)toggle.append(el('span',{className:'count',textContent:unread>9?'9+':String(unread)}));
  const g=chatGate(ctx.me()),blocked=g!=='ok';
  input.readOnly=blocked;input.placeholder=g==='signin'?'Sign in to chat':g==='resident'?'Make your resident to chat':toSub01?'Ask SUB-01 something…':'Say something in Tokyo…';
  toBtn.setAttribute('aria-pressed',String(toSub01));form.classList.toggle('to-sub01',toSub01);
  const off=toSub01&&!st.canSend;sendBtn.disabled=blocked||off;sendBtn.title=off?st.reason:'Send';
  if(Date.now()>=noteUntil)say(off?st.reason:'');
 }
 // The line under the bar: a passing note (ms) wins over the standing one (why sending is off) until it times out.
 let noteTimer=0,noteUntil=0;function say(text,ms=0){clearTimeout(noteTimer);note.textContent=text;note.hidden=!text;noteUntil=ms?Date.now()+ms:0;if(ms)noteTimer=setTimeout(()=>{noteUntil=0;chrome();},ms);}
 function setOpen(v){open=v;panel.hidden=!v;toggle.setAttribute('aria-expanded',String(v));document.body.classList.toggle('chat-open',v);
  if(v){unread=0;const intro=$('chat-intro');intro.hidden=!!store?.getItem?.('sub01.chat.intro');try{store?.setItem('sub01.chat.intro','1');}catch{}render();list.scrollTop=list.scrollHeight;}chrome();}

 // -- writing
 function gateAction(g){if(g==='signin')ctx.requireWallet('chat',()=>{chrome();input.focus();});else if(g==='resident')ctx.openCreator(()=>{chrome();input.focus();});}
 async function send(){
  const g=chatGate(ctx.me());if(g!=='ok'){gateAction(g);return;}
  const r=route(input.value,{toSub01});if(!r.text)return;
  if(r.to==='sub01'&&!sub01Status(sub01).canSend){say(sub01Status(sub01).reason);return;}
  const now=Date.now(),wait=r.to==='sub01'?cooldown(lastSub01,now,CHAT.sub01Gap):cooldown(lastSend,now,CHAT.sendGap);
  if(wait>0){say(r.to==='sub01'?`SUB-01 takes one message every 20 s. Wait ${Math.ceil(wait/1e3)} s.`:`One message every 3 s. Wait ${Math.ceil(wait/1e3)} s.`,2500);return;}
  if(r.to==='sub01')lastSub01=now;else lastSend=now;input.value='';
  // Your words are said at home: that is where everyone else sees you (a walk is client-only). The plot sets the district.
  const res=ctx.me().resident,home=cityPlots.find(p=>p.id===res.plotId)||null,m=log.local({name:res.name,text:r.text,district:home?.district||null,plotId:home?.id||null,kind:'resident',to:r.to});if(r.to==='sub01')asked=now;
  bubble(m);render();
  try{const out=await api(r.path,{method:'POST',body:home?{text:r.text,plotId:home.id}:{text:r.text}});
   const server=out?.message||out?.msg||null,id=server?.id??out?.id,before=m.id,c=log.confirm(m.local,id,server);
   if(c?.dropped)bubbles.remove(m.id);if(m.id!==before)bubbles.rekey(before,m.id);drawStack('me');
   if(out?.sub01)sub01=out.sub01;if(r.to==='sub01')notifyQueued();chrome();}
  catch(err){const why=chatError(err,r.to);if(err?.body?.sub01){sub01=err.body.sub01;chrome();}
   log.fail(m.local,why);const k=bubbles.remove(m.id);if(k)drawStack(k);say(why,5000);}
  render();
 }
 function notifyQueued(){const st=sub01Status(sub01);
  say(st.key==='desk'?'SUB-01 heard you. He answers in his own time, or not at all.':st.key==='resting'?'SUB-01 heard you, but he is resting: no replies today.':'SUB-01 heard you. He only answers awake at his desk, within 30 minutes.',5000);}
 async function report(m,li){
  const g=chatGate(ctx.me());if(g==='signin'){ctx.requireWallet('chat');return;}
  try{await api('/api/chat/report',{method:'POST',body:{id:Number.isFinite(+m.id)?+m.id:m.id}});li.classList.add('is-reported');li.querySelector('.chat-report').textContent='Reported';li.querySelector('.chat-report').disabled=true;}
  catch(err){say(err?.status===404?'That message is gone.':err?.message||'Could not report it.',3000);}
 }
 form.addEventListener('submit',e=>{e.preventDefault();send();});
 input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();input.blur();}});   // the city's own keys stay quiet while typing
 // A tap (click) or a keyboard focus on the locked input asks for the wallet / the resident, once.
 let gatedAt=0;const gate=()=>{const g=chatGate(ctx.me());if(g==='ok')return false;input.blur();if(Date.now()-gatedAt>400){gatedAt=Date.now();gateAction(g);}return true;};
 input.addEventListener('focus',()=>{if(!gate())document.body.classList.add('is-typing');});input.addEventListener('click',gate);
 input.addEventListener('blur',()=>document.body.classList.remove('is-typing'));
 toBtn.onclick=()=>{toSub01=!toSub01;chrome();if(!input.readOnly)input.focus();};
 toggle.onclick=()=>setOpen(!open);$('chat-close').onclick=()=>setOpen(false);
 // Long-press a row on touch to show its report button.
 let press=0;list.addEventListener('pointerdown',e=>{const li=e.target.closest?.('.chat-row');if(!li||e.pointerType==='mouse')return;clearTimeout(press);press=setTimeout(()=>{for(const x of list.querySelectorAll('.show-report'))x.classList.remove('show-report');li.classList.add('show-report');},500);});
 for(const t of ['pointerup','pointercancel','pointerleave'])list.addEventListener(t,()=>clearTimeout(press));

 // -- the stream
 function handle(e){
  let d=null;try{d=JSON.parse(e.data);}catch{return;}
  if(e.event==='hello'){you=d?.you||null;online=d?.online??[];for(const m of d?.recent||[])log.add(m);render();chrome();return;}
  if(e.event==='presence'){online=d?.online??[];chrome();return;}
  if(e.event==='sub01'){sub01=d;chrome();return;}
  if(e.event==='del'){const id=String(d?.id);log.del(id);const k=bubbles.remove(id);if(k)drawStack(k);render();return;}
  if(e.event!=='msg')return;
  const r=log.add(d);if(r!=='new')return render();
  const m=log.find(String(d.id));if(!m)return;bubble(m);if(!open&&m.kind!=='system')unread++;render();chrome();
  if(m.kind==='sub01'&&!open){const r=m.replyingTo,q=r?.id&&log.find(r.id);if(q?.mine||(r?.name&&r.name===myName())||(!r&&asked&&Date.now()-asked<18e5))ctx.notify('SUB-01 replied.');}
 }
 async function connect(){
  const my=++gen;abort?.abort();abort=new AbortController();clearTimeout(timer);state=state==='live'?'connecting':state;chrome();
  const parser=createSSEParser();
  try{const res=await fetch(CHAT.stream,{headers:{accept:'text/event-stream',...(lastId?{'last-event-id':lastId}:{})},credentials:'same-origin',cache:'no-store',signal:abort.signal});
   if(res.status===404)state='unavailable';
   if(!res.ok||!/event-stream/.test(res.headers.get('content-type')||''))throw new Error('no chat stream ('+res.status+')');
   state='live';backoff.reset();chrome();render();
   const reader=res.body.getReader(),dec=new TextDecoder();
   for(;;){const {value,done}=await reader.read();if(done||my!==gen)break;for(const e of parser.feed(dec.decode(value,{stream:true}))){if(parser.lastId)lastId=parser.lastId;handle(e);}}
  }catch(err){if(my!==gen)return;}
  if(my!==gen)return;if(state==='live')state='connecting';chrome();
  timer=setTimeout(connect,Math.max(backoff.next(),parser.retry||0));
 }
 // Presence: only for a resident with an open stream and a visible tab; on load, on a district change, else every 45 s.
 let lastDistrict;setInterval(()=>{const now=Date.now(),d=district();if(state!=='live'||document.hidden||chatGate(ctx.me())!=='ok'||!presenceDue(lastPresence,now,{changed:d!==lastDistrict}))return;
  lastPresence=now;lastDistrict=d;api('/api/chat/presence',{method:'POST',body:{district:d}}).catch(()=>{});},5e3);

 // Phones: the bar joins the bottom dock (the panel stays outside: the dock's blur would trap a fixed panel).
 {const mq=matchMedia('(max-width:600px)'),place=()=>{if(mq.matches)$('project-panel').append(form);else $('chat').append(form);};place();mq.addEventListener?.('change',place);}
 setOpen(false);connect();

 const self={
  // Every frame from main.js, before the labels are projected: anchors follow their speakers, old bubbles go, far = 💬.
  frame(zoom){try{
   const a=(ctx.me()?.user?.wallet||'')+'|'+(myName()||'');if(a!==acct){const wallet=acct.split('|')[0];acct=a;chrome();if(wallet!==a.split('|')[0]&&gen)connect();}
   for(const k of bubbles.expire(performance.now()))drawStack(k);
   for(const [k,l] of stackLabels){if(!anchor(k,l.position))l.position.set(0,-1e4,0);l.element.classList.toggle('is-far',zoom<CHAT.farZoom);}
  }catch(err){console.warn('[city] chat',err?.message||err);}},
  reconnect:connect,open:setOpen,
  get online(){return onlineCount(online);},get state(){return state;},get sub01(){return sub01;},get log(){return log.list;},get typing(){return document.activeElement===input;},
  get bubbles(){return [...stackLabels].map(([k,l])=>({key:k,count:bubbles.stack(k).length,at:{x:+l.position.x.toFixed(2),y:+l.position.y.toFixed(2),z:+l.position.z.toFixed(2)}}));}};
 return self;
}
