// Play first, wallet later. Without a wallet a visitor becomes a local guest {name, look, traits, guest:true} kept in
// this browser's localStorage only: it is never sent to the server and nobody else sees it. A guest roams the city from
// GUEST_SPAWN (Shibuya station), visits rooms, says hi and sees projects. Anything of value (claim an apartment, drop
// an idea, sign a guestbook, save a room) asks for the wallet then, with one line of why; after sign-in the guest's
// name, look and traits become the resident in one POST (or a resident the wallet already has wins and the guest goes).
// main.js lends createGuest() a few of its internals (ctx) and wraps openSignIn / openCreator / toggleExplore with it.
import * as THREE from 'three';
import {api,setGate} from './api.js';
import {listWallets,onWallets,lastWallet,walletHelp,renderWalletHelp} from './wallet.js';
import {renderLookFields,readLook,normalizeTraits,isUnlocked,SKINS,HAIRS,HAIR_STYLES} from './creator.js';
import {OUTFITS,loadCharacter} from './characters.js';
import {createExplorer,cityPois,GUEST_SPAWN,spawnFor} from './explore.js';
import {cityPlots} from './city-state.js';

// ---- Pure helpers (tests/guest.test.js) ----
export const GUEST_KEY='sub01.guest';
// The server's vocabulary (GET /api/world/options .look) for when the options have not loaded.
const FALLBACK={skin:SKINS,hair:HAIRS,hairStyle:HAIR_STYLES,outfit:OUTFITS,maxAccessories:4,petName:{max:12},
 accessories:['glasses','sunglasses','cap','beanie','headphones','backpack','scarf','mask','halo','crown','cat_ears','antenna','wings','jetpack'],
 pets:['cat','dog','robot','duck','slime','dragon']};
const HEX=/^#[0-9a-f]{6}$/;
// Name like the server: 2–24 letters (any script), digits, spaces and . _ ' -; whitespace collapsed.
export function cleanName(s,{min=2,max=24}={}){const n=String(s??'').replace(/\s+/g,' ').trim();return n.length>=min&&n.length<=max&&/^[\p{L}\p{M}\p{N} ._'-]+$/u.test(n)?n:null;}
// Look v2 against the options whitelist; null when anything is off. Accessories and pets above the first tier are
// dropped (a new resident is tier "resident"), so the upgrade POST never meets 403 locked.
export function sanitizeLook(look,options){
 if(!look||typeof look!=='object'||Array.isArray(look))return null;
 const L={...FALLBACK,...options?.look},U=options?.unlocks,lc=v=>typeof v==='string'?v.toLowerCase():'',out={};
 for(const k of ['skin','hair','hairStyle','outfit']){const v=k==='skin'||k==='hair'?lc(look[k]):look[k];if(!L[k].includes(v))return null;out[k]=v;}
 for(const k of ['top','bottom']){const v=lc(look[k]);if(!HEX.test(v))return null;out[k]=v;}
 const acc=look.accessories??[];if(!Array.isArray(acc)||new Set(acc).size!==acc.length||acc.length>(Number(L.maxAccessories)||4)||acc.some(a=>!L.accessories.includes(a)))return null;
 out.accessories=acc.filter(a=>isUnlocked('accessories',a,null,U));
 const ac=look.accessoryColor??null;if(ac!==null&&!HEX.test(lc(ac)))return null;out.accessoryColor=ac&&lc(ac);
 const p=look.pet??null;
 if(p!==null){if(typeof p!=='object'||!L.pets.includes(p.kind)||!HEX.test(lc(p.color)))return null;const name=cleanName(p.name,{min:1,max:Number(L.petName?.max)||12});if(!name)return null;
  out.pet=isUnlocked('pets',p.kind,null,U)?{kind:p.kind,color:lc(p.color),name}:null;}else out.pet=null;
 return out;
}
export function makeGuest({name,look,traits}={},options){const n=cleanName(name,options?.name),l=sanitizeLook(look,options);return n&&l?{name:n,look:l,traits:normalizeTraits(traits),guest:true}:null;}
const store=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
export function loadGuest(s=store(),options){let raw=null;try{raw=s?.getItem(GUEST_KEY);}catch{return null;}if(!raw)return null;
 try{return makeGuest(JSON.parse(raw),options);}catch{return null;}}
export function saveGuest(data,s=store(),options){const g=makeGuest(data,options);if(!g)return null;try{s?.setItem(GUEST_KEY,JSON.stringify(g));}catch{}return g;}
export function clearGuest(s=store()){try{s?.removeItem(GUEST_KEY);}catch{}}
// POST /api/residents body: exactly the four fields the server accepts (no guest flag).
export const upgradePayload=(g,plotId)=>({name:g.name,look:g.look,traits:normalizeTraits(g.traits),plotId});
// The apartment a guest gets on sign-in: the hint when free, else the free building nearest the spawn (open lots last).
export function pickPlot(plots,buildings,{hint=null,from=GUEST_SPAWN}={}){
 const taken=new Set((buildings||[]).map(b=>b.plotId)),free=(plots||[]).filter(p=>!p.reserved&&!taken.has(p.id));
 if(hint&&free.some(p=>p.id===hint))return hint;
 return free.sort((a,b)=>(!!a.vacant-!!b.vacant)||((a.x-from.x)**2+(a.z-from.z)**2)-((b.x-from.x)**2+(b.z-from.z)**2))[0]?.id||null;
}
// Why the wallet is asked for, per action of value.
export const REASONS={
 claim:'A wallet keeps your apartment and your 80% of creator fees.',
 idea:'Ideas need a wallet: it receives your 80% of creator fees if SUB-01 builds yours.',
 guestbook:'Sign in to sign the guestbook: notes carry your resident name.',
 save:'A wallet keeps your room saved for you.',
 chat:'Sign in to chat: your messages carry your resident name, never your wallet.'};
export const reasonFor=key=>REASONS[key]||REASONS.claim;
// Which reason a write stands for; null = not gated (reads, the sign-in calls themselves).
export function gateReason(path,method='GET'){
 const m=String(method).toUpperCase(),p=String(path).split('?')[0];
 if(m==='GET'||m==='HEAD'||p.startsWith('/api/auth/'))return null;
 if(m==='POST'&&p==='/api/support')return null;   // Help works signed out too (support-ui.js): a stuck guest must reach us
 if(m==='POST'&&p==='/api/residents')return 'claim';
 if(m==='POST'&&p==='/api/ideas')return 'idea';
 if(m==='POST'&&/^\/api\/rooms\/[^/]+\/guestbook$/.test(p))return 'guestbook';
 if(m==='PUT'&&p==='/api/rooms/me')return 'save';
 return 'default';
}
export const GATE_TEXT={guestbook:'Sign in to sign the guestbook.',save:'Sign in to save your room.',idea:'Sign in to drop an idea.',claim:'Sign in to claim an apartment.',chat:'Sign in to chat.',default:'Sign in first.'};
// Shown once (localStorage) on a guest's first outing: others never see a guest walk (presence.js).
export const PRESENCE_HINT='Sign in so others can see you walk.',PRESENCE_HINT_KEY='sub01.presence.hint';

// ---- DOM wiring ----
// ctx (main.js): me, options, buildings, goal, serverUp, explorer (get/set), cityEvents, template, mobile, refreshMe,
// pollWorld, openDialog, closeDialog, notify, roamStart, roamEnd, greet, bubble, exploreUI, stopExplore, track(root).
export function createGuest(ctx){
 const $=id=>document.getElementById(id);
 const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids);return n;};
 const load=()=>loadGuest(store(),ctx.options);
 let signInFn=null,creatorFn=null,exploreFn=null,reason=null,shown=null,submitText=null,exploring=false;
 // Writes never leave the browser without a session: the dialog opens with the reason, the caller sees a 401.
 setGate((path,method)=>{if(ctx.me?.user)return null;const k=gateReason(path,method);if(!k)return null;queueMicrotask(()=>requireWallet(k));return GATE_TEXT[k];});
 function requireWallet(key,next){if(ctx.me?.user){next?.();return;}reason=reasonFor(key);ctx.closeDialog();signInFn(next);}
 function setChip(g){const b=$('account-button');if(!b||!g)return;const tag=el('small',{textContent:'guest'});
  tag.style.cssText='margin-left:6px;padding:1px 5px;border-radius:6px;background:var(--orange,#fb752b);color:#272720;font-size:8px;letter-spacing:1px;text-transform:uppercase';
  (b.querySelector('.nm')||b).replaceChildren(g.name,tag);b.title=`${g.name} (guest, this browser only). Sign in to keep it.`;}

 // The sign-in dialog: reason line, last-used wallet first and focused, install links / Phantom app link, guest button.
 function decorate(){
  const dlg=$('signin-backdrop');if(!dlg||dlg.hidden)return;const card=dlg.querySelector('[role=dialog]')||dlg,list=$('wallet-list');
  let why=$('guest-reason');if(!why){why=el('p',{id:'guest-reason'});why.style.cssText='font-weight:700;color:inherit;font-size:13px;margin:10px 0';(card.querySelector('h2')||card.firstElementChild).after(why);}
  why.hidden=!shown;why.textContent=shown||'';
  let help=$('guest-wallet-help');if(!help){help=el('div',{id:'guest-wallet-help'});(list||card.lastElementChild).after(help);}
  const g=load(),nav=globalThis.navigator||{};
  renderWalletHelp(help,walletHelp({count:listWallets().length,ua:nav.userAgent,touch:nav.maxTouchPoints,href:location.href,origin:location.origin}),
   {guestLabel:g?`Keep playing as ${g.name}`:'Continue as guest (no wallet needed)',onGuest:()=>{ctx.closeDialog();const x=load();if(x){if(!ctx.explorer)startExplore(x);}else creatorFn(()=>startExplore(load()));}});
  const last=lastWallet();
  for(const b of list?.querySelectorAll('.wallet-option')||[])if(last&&b.textContent.trim()===last&&!b.querySelector('.guest-last')){
   const t=el('small',{className:'guest-last',textContent:'last used'});t.style.cssText='margin-left:auto;font:9px monospace;color:#80857a';b.append(t);b.focus();}
 }
 onWallets(()=>queueMicrotask(decorate));
 // After sign-in: the server's resident wins; otherwise the guest moves in, in one POST. 'none'|'kept'|'done'|'failed'.
 // later: the outing carries on first (its own toast), the welcome follows.
 async function upgrade({later=false}={}){
  const g=load();if(!g||!ctx.me?.user)return 'none';const say=m=>later?setTimeout(()=>ctx.notify(m),2500):ctx.notify(m);
  if(ctx.me.resident){clearGuest();say(`Welcome back, ${ctx.me.resident.name}. Your resident is kept; the guest is gone.`);return 'kept';}
  const plotId=pickPlot(cityPlots,ctx.buildings);
  try{if(!plotId)throw new Error('Pick an apartment to move in.');
   await api('/api/residents',{method:'POST',body:upgradePayload(g,plotId)});clearGuest();await ctx.refreshMe();await ctx.pollWorld();
   say(`Welcome to Tokyo, ${g.name}. Your apartment: ${cityPlots.find(p=>p.id===plotId)?.name||plotId}.`);return 'done';}
  catch(err){creatorFn(()=>clearGuest());prefill(g);const e=$('resident-error');if(e)e.textContent=err.message;return 'failed';}
 }
 function prefill(g){const n=$('resident-name'),f=$('look-fields');if(n)n.value=g.name;if(f&&ctx.options)renderLookFields(f,ctx.options,g.look,ctx.me?.unlocks?.tier?ctx.me.unlocks:null,g.traits);}

 // The creator: guests get the same fields; the apartment picker is swapped for the claim line and saving stays local.
 function plotField(guest){
  const sel=$('resident-plot'),lab=document.querySelector('label[for="resident-plot"]'),btn=$('resident-form')?.querySelector('button[type=submit]'),txt=btn?.firstChild?.nodeType===3?btn.firstChild:null;
  if(!sel)return;const box=sel.closest('.creator-plot');sel.hidden=sel.disabled=guest;sel.required=!guest;if(lab)lab.hidden=guest;if(box)box.hidden=guest;
  if(txt){if(guest){submitText??=txt.nodeValue;txt.nodeValue='Start exploring';}else if(submitText!==null){txt.nodeValue=submitText;submitText=null;}}
  $('guest-claim')?.remove();if(!guest)return;
  const claim=el('button',{type:'button',textContent:'Claim an apartment with your wallet'});claim.style.cssText='background:none;border:0;padding:0;font:inherit;font-weight:700;color:var(--orange,#fb752b);text-decoration:underline;cursor:pointer';
  claim.onclick=()=>{save(false);requireWallet('claim');};
  (box||sel).after(el('p',{id:'guest-claim',className:'fine'},claim,'. A guest explores, visits rooms and says hi, and stays in this browser: nobody else sees you yet.'));
 }
 function save(strict=true){const {look,traits}=readLook($('look-fields')),g=saveGuest({name:$('resident-name').value,look,traits},store(),ctx.options);
  if(!g&&strict)$('resident-error').textContent='Name: 2–24 letters, digits, spaces or . _ \' -';return g;}
 function guestCreator(next){
  const g=load();if(g)prefill(g);plotField(true);
  $('resident-form').onsubmit=e=>{e.preventDefault();const x=save();if(!x)return;ctx.closeDialog();setChip(x);
   if(next)next();else if(exploring)ctx.notify(`Saved, ${x.name}. The new look shows on your next outing.`);else startExplore(x);};
 }

 // Exploring as a guest: the same roaming model and brain as a resident (main.js toggleExplore), from GUEST_SPAWN.
 function startExplore(g){
  if(!g)return;const ce=ctx.cityEvents;if(ce.roaming)ce.endRoam();
  const r={name:g.name,look:g.look,traits:g.traits,guest:true,plotId:null};
  const roam=ce.explore({at:spawnFor(r),pet:g.look.pet,load:()=>loadCharacter(g.look,{template:ctx.template}),
   onStart(root){ctx.roamStart({...r,name:`${g.name} · guest`},root);ctx.notify(`Exploring as ${g.name}. ${ctx.mobile?'Tap a street to walk, double-tap to run.':'Click a street to walk, double-click to run.'} Sign in any time to claim an apartment.`);
    // Live presence (presence.js) is for residents: a guest is never sent to the server, and hears it once.
    let seen=null;try{seen=store()?.getItem(PRESENCE_HINT_KEY);}catch{}
    if(!seen){try{store()?.setItem(PRESENCE_HINT_KEY,'1');}catch{}setTimeout(()=>{if(exploring)ctx.notify(PRESENCE_HINT);},5000);}},
   onEnd(){exploring=false;ctx.roamEnd();ctx.explorer=null;ctx.exploreUI();const a=$('activity-text');if(a&&ctx.serverUp)a.textContent=ctx.goal?.text||'';}});
  if(!roam){ctx.notify('Your character is busy right now.');return;}
  exploring=true;setChip(g);
  ctx.explorer=createExplorer({roam,homeAt:()=>null,pois:()=>cityPois(ctx.buildings,null),
   canEmote:n=>isUnlocked('emotes',n,null,ctx.options?.unlocks),
   onToast:p=>ctx.bubble(p.text,new THREE.Vector3(roam.x,2.9,roam.z),4500,' explore-toast'),
   onGreet:p=>ctx.greet(p.plotId,g.name),onActivity:d=>{const a=$('activity-text');if(a)a.textContent=`${g.name} is exploring ${d}`;},
   onAuto:()=>{if(roam.root)ctx.track(roam.root);},onState:ctx.exploreUI,onHome:ctx.stopExplore});
  ctx.exploreUI();
 }

 const self={
  get guest(){return load();},get exploring(){return exploring;},requireWallet,upgrade,startExplore,
  clear(){clearGuest();},
  // A guest who was out exploring carries on as the resident, from the new apartment.
  wrapSignIn(orig){return signInFn=next=>{const was=exploring;orig(async()=>{const go=was&&!next,r=await upgrade({later:go});if(r==='done'&&go)exploreFn?.();if(r!=='failed')next?.();});
   const e=$('signin-error');if(e)e.textContent='';shown=reason||(load()?REASONS.claim:null);reason=null;decorate();};},
  wrapCreator(orig){return creatorFn=next=>{plotField(false);orig(next);if(!ctx.me?.user&&ctx.options&&!$('resident-backdrop')?.hidden)guestCreator(next);};},
  wrapExplore(orig){return exploreFn=()=>{if(ctx.explorer||ctx.me?.user)return orig();const g=load();if(g)startExplore(g);else creatorFn(null);};},
  // On load: a signed-in wallet absorbs a leftover guest; otherwise the guest is back on the street at once.
  async boot(){const g=load();if(!g)return;if(ctx.me?.user){await upgrade();return;}setChip(g);if(!ctx.explorer)startExplore(g);},
 };
 return self;
}
