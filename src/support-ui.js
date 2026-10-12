// Help / support, the sheet (#support-backdrop in index.html). Two tabs: "New report" (category, words, optional
// contact, the context shown before it is sent with a box to leave it out) and "My reports" (status and the replies,
// signed "SUBZERONE support"). Opened by the Help button in the top bar and by a `sub01:support` event, which the
// room PC's launch stepper and its error lines dispatch with {source, step, error, category} (desk.js).
// Anonymous reports: the read token the server returns is kept in localStorage (try/catch; support.js saveToken) and
// sent back in the x-support-token header, never in a URL. The models are support.js (tested).
import {api} from './api.js';
import {icon} from './icons.js';
import {listWallets} from './wallet.js';
import {CATEGORIES,MESSAGE_MAX,CONTACT_MAX,SENT_LINE,errorRing,launchNote,prefill,sheetModel,buildContext,contextLines,bundleOf,loadTokens,saveToken,reportsModel} from './support.js';

const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null&&k!==false));return n;};
const storage=()=>{try{return globalThis.localStorage;}catch{return null;}};

/** host: {openDialog(id), closeDialog(), me:()=>me, place:()=>selected place|null, notify(text)} */
export function createSupport(host){
 const back=document.getElementById('support-backdrop'),body=document.getElementById('support-body'),tabs=document.getElementById('support-tabs');
 let tab='new',draft=null,sentId=null;
 const context=()=>{
  const p=host.place?.(),b=p?.building;
  return buildContext({me:host.me?.(),launch:launchNote(),errors:errorRing.list(),
   bundle:bundleOf(document.querySelector('script[type=module][src*="/assets/index-"]')?.getAttribute('src')),
   userAgent:navigator.userAgent,viewport:`${innerWidth}x${innerHeight}@${Math.round((devicePixelRatio||1)*100)/100}`,
   wallets:(()=>{try{return listWallets().map(w=>w.name);}catch{return [];}})(),page:location.hash||(document.querySelector('.pc-window')?'room PC':document.body.classList.contains('in-room')?'room':'city'),
   language:navigator.language,place:b?.slug?{slug:b.slug,status:b.stage||b.phase,name:b.name}:null});
 };
 function drawTabs(){
  tabs.replaceChildren(...[['new','New report'],['mine','My reports']].map(([id,label])=>{
   const b=el('button',{type:'button',className:'sheet-tab'+(tab===id?' is-on':''),textContent:label});b.setAttribute('aria-pressed',String(tab===id));b.onclick=()=>show(id);return b;}));
 }
 function show(id){tab=id;drawTabs();if(id==='new')drawForm();else drawMine();}

 function drawForm(){
  const d=draft||(draft=prefill({}));
  const ctx=context();
  const cats=el('div',{className:'support-cats',role:'radiogroup'});cats.setAttribute('aria-label','What is it about?');
  for(const [id,label] of CATEGORIES){
   const b=el('button',{type:'button',className:'chip support-cat'+(d.category===id?' is-on':''),textContent:label});b.setAttribute('role','radio');b.setAttribute('aria-checked',String(d.category===id));b.dataset.cat=id;
   b.onclick=()=>{d.category=id;for(const x of cats.children){const on=x.dataset.cat===id;x.classList.toggle('is-on',on);x.setAttribute('aria-checked',String(on));}check();};cats.append(b);}
  const ta=el('textarea',{id:'support-message',rows:5,maxLength:MESSAGE_MAX,placeholder:'What happened, and what did you expect? Steps help: "I pressed Launch, Phantom opened, then…"',value:d.message});
  const count=el('small',{className:'support-count'});
  const contact=el('input',{id:'support-contact',maxLength:CONTACT_MAX,placeholder:'@yourhandle on X or Telegram (optional)',value:d.contact||'',autocomplete:'off',spellcheck:false});
  const include=el('input',{type:'checkbox',id:'support-include',checked:d.include!==false});
  const rows=contextLines(ctx);
  const details=el('details',{className:'support-ctx'},el('summary',{},'What gets attached',icon('cd')),
   el('dl',{},...rows.flatMap(([k,v])=>[el('dt',{textContent:k}),el('dd',{textContent:v})])),
   el('p',{className:'fine',textContent:'Plus what our server already knows about your launch (its state and last error). Never your keys, your seed phrase or a signed transaction.'}));
  const err=el('p',{className:'form-error',role:'alert'});
  const send=el('button',{type:'submit',className:'button button-orange'},el('span',{textContent:'Send report'}),el('span',{className:'arw'},icon('send')));
  const form=el('form',{className:'support-form',noValidate:true},
   el('label',{textContent:'What is it about?'}),cats,
   el('label',{htmlFor:'support-message',textContent:'Your problem'}),ta,count,
   el('label',{htmlFor:'support-contact',textContent:'Contact (optional)'}),contact,
   el('label',{className:'check'},include,el('span',{},'Attach details to help us fix it ',el('small',{className:'faint',textContent:'(recommended)'}))),details,
   el('p',{className:'support-warn'},icon('lock'),'We will never ask for your private key or seed phrase. Nobody from SUBZERONE will DM you first.'),
   err,send);
  function check(){d.message=ta.value;d.contact=contact.value;d.include=include.checked;const m=sheetModel({...d},ctx);count.textContent=m.count;send.disabled=false;return m;}
  ta.oninput=contact.oninput=include.onchange=()=>{check();err.textContent='';};
  check();
  form.onsubmit=async e=>{
   e.preventDefault();const m=check();if(!m.ok){err.textContent=m.problem;return;}
   send.disabled=true;send.classList.add('is-busy');err.textContent='';
   try{
    const r=await api('/api/support',{method:'POST',body:m.body});
    saveToken(r?.token,storage());sentId=r?.ticket?.id||null;draft=null;
    body.replaceChildren(el('div',{className:'support-sent'},el('span',{className:'support-sent-ic'},icon('check')),el('strong',{textContent:SENT_LINE}),
     r?.redacted?el('p',{className:'fine',textContent:'Something in it looked like a key or a seed phrase, so we removed it before storing. If that was real, move your funds to a new wallet.'}):null,
     el('button',{type:'button',className:'button button-ghost',textContent:'See my reports',onclick:()=>show('mine')})));
   }catch(x){err.textContent=x?.status===429?(x.body?.message||'Too many reports for now; try again in a while.'):x?.body?.message||x?.message||'Not sent. Check your connection and try again.';send.disabled=false;send.classList.remove('is-busy');}
  };
  body.replaceChildren(form);
 }

 async function drawMine(){
  body.replaceChildren(el('p',{className:'fine',textContent:'Loading your reports…'}));
  const tokens=loadTokens(storage()),me=host.me?.();
  if(!tokens.length&&!me?.user){body.replaceChildren(el('div',{className:'support-empty'},el('p',{textContent:'No reports from this browser yet. Sign in to see the ones you sent from another device.'})));return;}
  try{
   const res=await api('/api/support/mine',{headers:tokens.length?{'x-support-token':tokens.join(',')}:{}});
   const list=reportsModel(res);
   if(!list.length){body.replaceChildren(el('div',{className:'support-empty'},el('p',{textContent:'No reports yet.'})));return;}
   body.replaceChildren(el('ol',{className:'support-list'},...list.map(t=>el('li',{className:'support-item'+(t.id===sentId?' is-new':'')},
    el('div',{className:'support-item-head'},el('b',{textContent:t.category}),el('span',{className:'support-status is-'+t.status,textContent:t.statusWord}),el('small',{textContent:t.ago})),
    el('p',{className:'support-msg',textContent:t.message}),
    ...t.replies.map(r=>el('div',{className:'support-reply'},el('span',{className:'support-reply-from'},el('img',{src:'/brand/mark-small.svg',alt:'',width:18,height:18}),r.from,el('small',{textContent:` · ${r.ago}`})),el('p',{textContent:r.text}))),
    t.answered?null:el('p',{className:'fine',textContent:'Waiting for an answer. We read every report.'})))),
    el('button',{type:'button',className:'pc-link support-refresh',textContent:'Refresh',onclick:drawMine}));
  }catch(x){body.replaceChildren(el('p',{className:'form-error',textContent:x?.status===401?'Sign in, or send a report from this browser first.':'Could not load your reports. Try again.'}));}
 }

 function open(opts={}){
  if(opts&&(opts.source||opts.error||opts.step||opts.category)){draft=prefill(opts);tab='new';}
  sentId=null;show(opts?.tab==='mine'?'mine':tab);host.openDialog('support-backdrop');
  if(tab==='new')setTimeout(()=>{const t=document.getElementById('support-message');if(t&&draft?.message){t.focus();t.setSelectionRange(t.value.length,t.value.length);}},60);
 }
 addEventListener('sub01:support',e=>open(e.detail||{}));
 back.onclick=e=>{if(e.target===back)host.closeDialog();};
 return {open,show};
}
