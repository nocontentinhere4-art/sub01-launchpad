// Wallet Standard sign-in (Phantom, Solflare, Backpack…). The city only signs the server's sign-in message:
// no transaction, no funds. Launch signatures happen in the project's office page, which shows the transaction first.
// No embedded-wallet SDK on purpose (CSP, supply chain). A later option for people with no wallet at all is Phantom
// Connect (hosted social login that ends in a real Phantom wallet) or Privy embedded wallets: either would sit behind
// signIn() below and keep the same nonce → signMessage → verify flow. Until then, guests play without one (guest.js).
import {api,b58encode} from './api.js';
const wallets=new Map(),listeners=new Set();
function register(...list){
 for(const w of list){const solana=(w.chains||[]).some(c=>String(c).startsWith('solana:'));if(solana&&w.features?.['standard:connect']&&w.features?.['solana:signMessage'])wallets.set(w.name,w);}
 listeners.forEach(fn=>fn());return()=>{};
}
const registerApi=Object.freeze({register});
if(typeof window!=='undefined'){
 window.addEventListener('wallet-standard:register-wallet',e=>{try{e.detail(registerApi);}catch{}});
 window.dispatchEvent(new CustomEvent('wallet-standard:app-ready',{detail:registerApi}));
}
// The last wallet that signed in comes first (and main.js's list draws it first); localStorage may be missing or throw.
export const LAST_KEY='sub01.lastWallet';
const store=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
export function lastWallet(s=store()){try{return s?.getItem(LAST_KEY)||null;}catch{return null;}}
function remember(name,s=store()){try{s?.setItem(LAST_KEY,name);}catch{}}
export const sortWallets=(list,last)=>last?list.map(w=>({...w,last:w.name===last})).sort((a,b)=>b.last-a.last):list;
export const onWallets=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export const listWallets=()=>sortWallets([...wallets.values()].map(w=>({name:w.name,icon:w.icon})),lastWallet());
// A closed popup or a "Reject" is not an error worth shouting about: one calm line, and the list stays usable.
export const REJECTED='Cancelled in the wallet. Nothing was signed. Pick a wallet to try again.';
export const isRejection=err=>err?.code===4001||err?.code==='ACTION_REJECTED'||/reject|denied|declin|cancel|closed|abort/i.test(`${err?.name||''} ${err?.message||''}`);
async function ask(fn){try{return await fn();}catch(err){if(isRejection(err))throw Object.assign(new Error(REJECTED),{rejected:true});throw err;}}
// One sign-in at a time: a double click reuses the pending one instead of opening a second popup.
let pending=null;
export function signIn(name){return pending||=run(name).finally(()=>{pending=null;});}
async function run(name){
 const w=wallets.get(name);if(!w)throw new Error('Wallet not found.');
 const {accounts}=await ask(()=>w.features['standard:connect'].connect());const account=accounts?.[0];
 if(!account)throw new Error('The wallet shared no account.');
 const n=await api('/api/auth/nonce',{method:'POST',body:{wallet:account.address}});
 const [res]=await ask(()=>w.features['solana:signMessage'].signMessage({account,message:new TextEncoder().encode(n.message)}));
 await api('/api/auth/verify',{method:'POST',body:{wallet:account.address,nonce:n.nonce,signature:b58encode(res.signature)}});
 remember(name);return account.address;
}
export const signOut=()=>api('/api/auth/logout',{method:'POST',body:{}});

// No wallet found: install links (desktop), or on a phone (no extensions: iOS Safari, Android Chrome) Phantom's
// universal link that reopens this page inside the Phantom app's browser, where the wallet is injected.
export const INSTALL=[{name:'Phantom',url:'https://phantom.com/download'},{name:'Solflare',url:'https://solflare.com/download'},{name:'Backpack',url:'https://backpack.app/download'}];
export const isIOS=(ua='',touch=0)=>/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&touch>1);
export const isMobile=(ua='',touch=0)=>isIOS(ua,touch)||/Android/.test(ua);
export const phantomBrowseLink=(href,origin)=>`https://phantom.app/ul/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(origin)}`;
// -> {mode:'wallets'|'install'|'mobile', install:[{name,url}], openIn:{name,url}|null}
export function walletHelp({count=0,ua='',touch=0,href='',origin=''}={}){
 if(count>0)return {mode:'wallets',install:[],openIn:null};
 const mobile=isMobile(ua,touch);
 return {mode:mobile?'mobile':'install',install:INSTALL,openIn:mobile?{name:'Phantom',url:phantomBrowseLink(href,origin)}:null};
}
// Renders walletHelp() into container (below main.js's #wallet-list), plus the guest button when onGuest is given.
export function renderWalletHelp(container,help,{guestLabel='Continue as guest',onGuest=null}={}){
 const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids);return n;};
 const link=(w,text)=>{const a=el('a',{className:'wallet-option',href:w.url,target:'_blank',rel:'noopener noreferrer',textContent:text});a.style.textDecoration='none';a.style.color='inherit';return a;};
 const out=[];
 if(help.openIn)out.push(link(help.openIn,`Open in the ${help.openIn.name} app`));
 if(help.install.length){const grid=el('div',{className:'wallet-list'});grid.style.cssText='grid-template-columns:repeat(3,1fr);margin-top:8px';
  grid.append(...help.install.map(w=>link(w,w.name)));
  out.push(el('p',{className:'fine',textContent:help.openIn?'Or install a wallet:':'No wallet yet? Install one, then reload this page:'}),grid);}
 if(onGuest){const b=el('button',{type:'button',className:'button button-ghost',textContent:guestLabel});b.onclick=onGuest;
  out.push(b,el('p',{className:'fine',textContent:'Guests explore, visit rooms and say hi. Nothing about a guest leaves this browser.'}));}
 container.replaceChildren(...out);return container;
}
