// Wallet sign-in (Phantom, Solflare, Backpack, Glow, Coinbase, Trust, OKX…). Sign-in signs the server's message: no
// transaction, no funds. The one transaction the city ever asks for is the launch (signTransaction below), after the
// computer's Launch tab has shown the server's review of it (desk.js).
// Two detection paths, Wallet Standard first (`wallet-standard:app-ready` / `register-wallet`), then the LEGACY injected
// providers (window.phantom.solana, window.solflare, window.solana…) for wallets that never register, or register late,
// each wrapped in an adapter of the same shape (adaptLegacy). A Wallet Standard entry wins over a legacy one of the same name.
// Extensions inject late (Brave and Firefox later still), so the scan repeats: on load, every 500 ms for 4 s after load,
// and when the sign-in dialog opens; onWallets fires on every change and the dialog redraws. No embedded-wallet SDK on
// purpose (CSP, supply chain); a later option for people with no wallet at all is Phantom Connect or Privy embedded
// wallets, behind signIn() below with the same nonce → signMessage → verify flow. Until then, guests play (guest.js).
import {api,b58encode} from './api.js';
const wallets=new Map(),legacy=new Map(),listeners=new Set();
const emit=()=>{for(const fn of listeners)try{fn();}catch{}};
const usable=w=>(w?.chains||[]).some(c=>String(c).startsWith('solana:'))&&typeof w.features?.['standard:connect']?.connect==='function'&&typeof w.features?.['solana:signMessage']?.signMessage==='function';
// The Wallet Standard register(): also exported for tests (no window there).
export function registerStandard(...list){let n=0;for(const w of list)if(usable(w)&&wallets.get(w.name)!==w){wallets.set(w.name,w);n++;}if(n)emit();return()=>{};}
const registerApi=Object.freeze({register:registerStandard});

// ---- Legacy injected providers ----
// Where each wallet puts its provider; `window.solana` last, labelled by its is* flag (or "Solana wallet").
export const LEGACY=[['Phantom',w=>w.phantom?.solana],['Solflare',w=>w.solflare],['Backpack',w=>w.backpack],['Glow',w=>w.glow||w.glowSolana],
 ['Coinbase Wallet',w=>w.coinbaseSolana],['Trust',w=>w.trustwallet?.solana],['OKX',w=>w.okxwallet?.solana],['Bitget',w=>w.bitkeep?.solana||w.bitget?.solana],
 ['Exodus',w=>w.exodus?.solana],['Nightly',w=>w.nightly?.solana],['Magic Eden',w=>w.magicEden?.solana],['Brave',w=>w.braveSolana],['xNFT',w=>w.xnft?.solana]];
const FLAGS=[['isPhantom','Phantom'],['isSolflare','Solflare'],['isBackpack','Backpack'],['isGlow','Glow'],['isCoinbaseWallet','Coinbase Wallet'],['isTrust','Trust'],['isTrustWallet','Trust'],
 ['isOkxWallet','OKX'],['isOKExWallet','OKX'],['isBitKeep','Bitget'],['isBitget','Bitget'],['isExodus','Exodus'],['isNightly','Nightly'],['isMagicEden','Magic Eden'],['isBraveWallet','Brave']];
const isProvider=p=>!!p&&(typeof p==='object'||typeof p==='function')&&typeof p.connect==='function'&&typeof p.signMessage==='function';
// -> [{name,provider}] for the providers present on win; one entry per provider object (window.solana is usually an alias).
export function legacyProviders(win){
 const out=[],seen=new Set();if(!win)return out;
 const add=(name,p)=>{if(!isProvider(p)||seen.has(p))return;seen.add(p);out.push({name,provider:p});};
 for(const [name,get] of LEGACY){let p=null;try{p=get(win);}catch{}add(name,p);}
 let s=null;try{s=win.solana;}catch{}
 if(isProvider(s)){let flag=null;try{flag=FLAGS.find(([k])=>s[k]);}catch{}add(flag?flag[1]:'Solana wallet',s);}
 return out;
}
const addr=k=>k?.toBase58?.()??k?.toString?.()??String(k);
const bytes=k=>{try{if(k instanceof Uint8Array)return k;const b=k?.toBytes?.();if(b)return new Uint8Array(b);}catch{}return undefined;};
const toU8=x=>x instanceof Uint8Array?x:x?.buffer instanceof ArrayBuffer?new Uint8Array(x.buffer,x.byteOffset??0,x.byteLength):Array.isArray(x)?Uint8Array.from(x):null;
export const sameBytes=(a,b)=>a?.length===b?.length&&a.every((x,i)=>x===b[i]);
export const LEGACY_CHAIN='solana:mainnet';
// A Wallet Standard-shaped wrapper around a legacy provider: connect() → {accounts:[{address,publicKey}]} (publicKey from
// p.publicKey when connect() answers nothing, as Solflare and some in-app browsers do), signMessage() → [{signature,publicKey}]
// whether the provider answers raw bytes or {signature,publicKey}.
export function adaptLegacy(p,name){
 const account=k=>k?{address:addr(k),publicKey:bytes(k),chains:[LEGACY_CHAIN],features:['solana:signMessage']}:null;
 return {name,icon:typeof p.icon==='string'?p.icon:null,legacy:true,chains:[LEGACY_CHAIN],features:{
  'standard:connect':{version:'1.0.0',async connect(){const r=await p.connect({onlyIfTrusted:false});const a=account(p.publicKey)||account(r?.publicKey);return {accounts:a?[a]:[]};}},
  'solana:signMessage':{version:'1.0.0',async signMessage({message}){const r=await p.signMessage(message,'utf8');const sig=toU8(r?.signature??r);
   if(!sig)throw new Error('The wallet answered without a signature.');return [{signedMessage:message,signature:sig,publicKey:r?.publicKey?addr(r.publicKey):null}];}}}};
}
// "OKX Wallet" and "OKX", "Brave Wallet" and "Brave" are the same wallet seen twice.
export const walletKey=name=>String(name||'').toLowerCase().replace(/\s*wallet$/,'').trim();
// Standard entries first; a legacy entry only when no standard one carries the same name.
export function mergeWallets(standard,legacyList){const keys=new Set(standard.map(w=>walletKey(w.name)));return [...standard,...legacyList.filter(w=>!keys.has(walletKey(w.name)))];}

// ---- Detection timing ----
let born=Date.now(),timer=null,pollEnd=0;
export const SETTLE_MS=2000,POLL_MS=500,POLL_FOR_MS=4000;
// Re-scan the legacy providers (and nudge Wallet Standard wallets that missed app-ready). -> number of wallets known.
export function scanWallets(win=globalThis.window){
 let changed=false;const found=legacyProviders(win),names=new Set();
 for(const {name,provider} of found){names.add(name);if(legacy.get(name)?.provider!==provider){legacy.set(name,{provider,adapter:adaptLegacy(provider,name)});changed=true;}}
 for(const k of [...legacy.keys()])if(!names.has(k)){legacy.delete(k);changed=true;}
 try{win?.dispatchEvent(new CustomEvent('wallet-standard:app-ready',{detail:registerApi}));}catch{}
 if(changed)emit();return wallets.size+legacy.size;
}
// Poll for POLL_FOR_MS from now (extensions inject after load; a rescan that finds nothing new is silent).
export function pollWallets(win=globalThis.window){
 pollEnd=Math.max(pollEnd,Date.now()+POLL_FOR_MS);if(timer)return;
 timer=setInterval(()=>{scanWallets(win);if(Date.now()>=pollEnd){clearInterval(timer);timer=null;emit();}},POLL_MS);
}
// The dialog says "Looking for wallets…" until something is found or SETTLE_MS have passed since the page (or the poll) started.
export const walletsSettled=(now=Date.now())=>wallets.size+legacy.size>0||now-born>=SETTLE_MS;
if(typeof window!=='undefined'){
 window.addEventListener('wallet-standard:register-wallet',e=>{try{e.detail(registerApi);}catch{}});
 scanWallets(window);
 const onLoad=()=>{scanWallets(window);pollWallets(window);};
 if(document.readyState==='complete')onLoad();else window.addEventListener('load',onLoad,{once:true});
 setTimeout(emit,SETTLE_MS+50);
}

// ---- Listing ----
// The last wallet that signed in comes first (and main.js's list draws it first); localStorage may be missing or throw.
export const LAST_KEY='sub01.lastWallet';
const store=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
export function lastWallet(s=store()){try{return s?.getItem(LAST_KEY)||null;}catch{return null;}}
function remember(name,s=store()){try{s?.setItem(LAST_KEY,name);}catch{}}
export const sortWallets=(list,last)=>last?list.map(w=>({...w,last:w.name===last})).sort((a,b)=>b.last-a.last):list;
export const onWallets=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
const known=()=>mergeWallets([...wallets.values()],[...legacy.values()].map(l=>l.adapter));
export const listWallets=()=>sortWallets(known().map(w=>({name:w.name,icon:w.icon||null,legacy:!!w.legacy})),lastWallet());
const getWallet=name=>known().find(w=>w.name===name)||null;

// ---- Sign-in ----
// A closed popup or a "Reject" is not an error worth shouting about: one calm line, and the list stays usable.
export const REJECTED='Cancelled in the wallet. Nothing was signed. Pick a wallet to try again.';
export const TIMEOUT='The wallet did not answer — open the extension and try again.';
export const MISMATCH='The wallet signed with a different address than the one it connected. Switch the account in the wallet and try again.';
export const CONNECT_MS=10000;
export const isRejection=err=>err?.code===4001||err?.code==='ACTION_REJECTED'||/reject|denied|declin|cancel|closed|abort/i.test(`${err?.name||''} ${err?.message||''}`);
async function ask(fn){try{return await fn();}catch(err){if(isRejection(err))throw Object.assign(new Error(REJECTED),{rejected:true});throw err;}}
export function withTimeout(promise,ms=CONNECT_MS,message=TIMEOUT){let t;return Promise.race([promise,new Promise((_,rej)=>{t=setTimeout(()=>rej(Object.assign(new Error(message),{timeout:true})),ms);})]).finally(()=>clearTimeout(t));}
// What the dialog prints for a failed attempt: the wallet's own words when it has any (a locked wallet says so), else a line that helps.
export function describeError(err){
 if(!err)return 'Something went wrong in the wallet. Try again.';if(err.rejected||err.timeout)return err.message;
 const m=String(err.message||err.error?.message||(typeof err==='string'?err:'')||'').trim();
 if(/lock/i.test(m))return `${m.replace(/[.!]*$/,'.')} Unlock the wallet, then pick it again.`;
 return m||'The wallet refused without saying why. Open it, unlock it and try again.';
}
// Best effort, no false alarms: verify the signature in the browser when WebCrypto has Ed25519 (Chrome 113+, Safari 17+,
// Firefox 130+); true when it checks out or cannot be checked, false only when the key definitely did not sign the message.
export async function signedByKey(pub,message,signature,subtle=globalThis.crypto?.subtle){
 if(!subtle||!(pub instanceof Uint8Array)||pub.length!==32||signature?.length!==64)return true;
 try{const key=await subtle.importKey('raw',pub,{name:'Ed25519'},false,['verify']);return await subtle.verify('Ed25519',key,signature,message);}catch{return true;}
}
// One sign-in at a time: a double click reuses the pending one instead of opening a second popup.
let pending=null;
export function signIn(name){return pending||=run(name).finally(()=>{pending=null;});}
async function run(name){
 const w=getWallet(name);if(!w)throw new Error('Wallet not found. Reload the page and try again.');
 const res=await ask(()=>withTimeout(Promise.resolve().then(()=>w.features['standard:connect'].connect({silent:false}))));
 const account=res?.accounts?.[0]||w.accounts?.[0];
 if(!account?.address)throw new Error('The wallet shared no account. Unlock it, pick an account and try again.');
 const n=await api('/api/auth/nonce',{method:'POST',body:{wallet:account.address}});
 const message=new TextEncoder().encode(n.message);
 const out=await ask(()=>w.features['solana:signMessage'].signMessage({account,message}));
 const signed=Array.isArray(out)?out[0]:out;const signature=toU8(signed?.signature);
 if(!signature||signature.length!==64)throw new Error('The wallet answered without a valid signature. Try again.');
 if(signed.publicKey&&addr(signed.publicKey)!==account.address)throw new Error(MISMATCH);
 const sm=toU8(signed.signedMessage);if(sm?.length&&!sameBytes(sm,message))throw new Error('The wallet signed a different message. Try again.');
 if(!await signedByKey(toU8(account.publicKey),message,signature))throw new Error(MISMATCH);
 await api('/api/auth/verify',{method:'POST',body:{wallet:account.address,nonce:n.nonce,signature:b58encode(signature)}});
 remember(name);return account.address;
}
export const signOut=()=>api('/api/auth/logout',{method:'POST',body:{}});

// ---- Launch signatures (desk.js's Launch tab) ----
// The server builds and broadcasts the transaction; the page only asks the wallet for a signature over bytes it never
// decodes (no @solana/web3.js here: CSP, bundle size). Wallet Standard `solana:signTransaction` takes raw bytes; a legacy
// injected provider (window.phantom.solana…) wants a web3.js Transaction object, so it cannot sign bytes: a clear line
// says to reconnect through the wallet's Wallet Standard entry (Phantom 23+, Solflare, Backpack register one).
export const SIGN_MS=120000   // 2026-10-11: Phantom shows up to three warning screens for a new domain; 10 s timed out while the user read them;
export const NO_RAW_SIGN='This wallet is connected the old way and cannot sign a raw transaction here. Reload the page and pick the same wallet again (Phantom 23+, Solflare and Backpack register the standard connection), or use another wallet.';
export const NO_SIGN_FEATURE='This wallet does not offer transaction signing to web pages. Use another wallet.';
export const fromBase64=s=>{const bin=atob(String(s||''));const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;};
export const toBase64=b=>{let s='';for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);};
// Reconnect quietly (the wallet already signed in on this page); a wallet that ignores `silent` opens its popup, which is fine.
async function connected(name){
 const w=getWallet(name);if(!w)throw new Error('Wallet not found. Reload the page and sign in again.');
 let res=await ask(()=>withTimeout(Promise.resolve().then(()=>w.features['standard:connect'].connect({silent:true})))).catch(()=>null);
 let account=res?.accounts?.[0]||w.accounts?.[0];
 if(!account?.address){res=await ask(()=>withTimeout(Promise.resolve().then(()=>w.features['standard:connect'].connect({silent:false}))));account=res?.accounts?.[0]||w.accounts?.[0];}
 if(!account?.address)throw new Error('The wallet shared no account. Unlock it, pick an account and try again.');
 return {w,account};
}
/** Sign plain bytes (the MOCK launch text) -> {signature:Uint8Array(64), address}. Same checks as sign-in. */
export async function signMessage(name,message){
 const {w,account}=await connected(name);
 const out=await ask(()=>withTimeout(Promise.resolve().then(()=>w.features['solana:signMessage'].signMessage({account,message})),SIGN_MS));
 const signed=Array.isArray(out)?out[0]:out,signature=toU8(signed?.signature);
 if(!signature||signature.length!==64)throw new Error('The wallet answered without a valid signature. Try again.');
 if(signed?.publicKey&&addr(signed.publicKey)!==account.address)throw new Error(MISMATCH);
 if(!await signedByKey(toU8(account.publicKey),message,signature))throw new Error(MISMATCH);
 return {signature,address:account.address};
}
/** Sign a serialized transaction (base64 in, base64 out) through Wallet Standard `solana:signTransaction` on `chain`. */
export async function signTransaction(name,txBase64,{chain=LEGACY_CHAIN}={}){
 const {w,account}=await connected(name);
 if(w.legacy)throw Object.assign(new Error(NO_RAW_SIGN),{unsupported:true});
 const f=w.features?.['solana:signTransaction'];
 if(typeof f?.signTransaction!=='function')throw Object.assign(new Error(NO_SIGN_FEATURE),{unsupported:true});
 const transaction=fromBase64(txBase64);if(!transaction.length)throw new Error('There is no transaction to sign.');
 const out=await ask(()=>withTimeout(Promise.resolve().then(()=>f.signTransaction({transaction,account,chain})),SIGN_MS));
 const signed=Array.isArray(out)?out[0]:out,bytes=toU8(signed?.signedTransaction);
 if(!bytes?.length)throw new Error('The wallet answered without a signed transaction. Try again.');
 return {signed:toBase64(bytes),address:account.address};
}

// ---- No wallet found ----
// Desktop: official download pages. Phone (no extensions: iOS Safari, Android Chrome): each wallet app's universal link
// that reopens this page inside the app's browser, where the wallet is injected. Inside such a browser (a legacy provider
// is present) the links are pointless and the wallet is simply listed.
export const INSTALL=[{name:'Phantom',url:'https://phantom.com/download'},{name:'Solflare',url:'https://solflare.com/download'},{name:'Backpack',url:'https://backpack.app/download'},
 {name:'Glow',url:'https://glow.app/download'},{name:'Coinbase Wallet',url:'https://www.coinbase.com/wallet/downloads'},{name:'Trust',url:'https://trustwallet.com/download'},{name:'OKX',url:'https://www.okx.com/download'}];
export const isIOS=(ua='',touch=0)=>/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&touch>1);
export const isMobile=(ua='',touch=0)=>isIOS(ua,touch)||/Android/.test(ua);
export const phantomBrowseLink=(href,origin)=>`https://phantom.app/ul/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(origin)}`;
export const solflareBrowseLink=(href,origin)=>`https://solflare.com/ul/v1/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(origin)}`;
export const backpackBrowseLink=(href,origin)=>`https://backpack.app/ul/v1/browse/${encodeURIComponent(href)}?ref=${encodeURIComponent(origin)}`;
export const openInLinks=(href,origin)=>[{name:'Phantom',url:phantomBrowseLink(href,origin)},{name:'Solflare',url:solflareBrowseLink(href,origin)},{name:'Backpack',url:backpackBrowseLink(href,origin)}];
export const NOTE={scanning:'Looking for wallets…',install:'No Solana wallet found in this browser.',mobile:'No wallet in this browser. Open this page inside your wallet app:',wallets:'',inapp:''};
// -> {mode:'wallets'|'inapp'|'scanning'|'install'|'mobile', note, install:[{name,url}], openIn:{name,url}|null, openIns:[…]}
// count: wallets detected; inApp: a wallet's own in-app browser (a legacy provider on a phone); settled: the scan has had
// its time. In a browser both default to the live scan state (walletsSettled()); in tests they default to a settled desktop.
export function walletHelp({count=0,ua='',touch=0,href='',origin='',inApp,settled}={}){
 const mobile=isMobile(ua,touch),live=typeof window!=='undefined';settled??=live?walletsSettled():true;inApp??=live&&mobile&&legacy.size>0;
 const mode=count>0?(inApp?'inapp':'wallets'):!settled?'scanning':mobile?'mobile':'install';
 const openIns=mode==='mobile'?openInLinks(href,origin):[];
 return {mode,note:NOTE[mode],install:mode==='install'||mode==='mobile'?INSTALL:[],openIn:openIns[0]||null,openIns};
}
// Renders walletHelp() into container (below main.js's #wallet-list, which prints help.note), plus the guest button when onGuest is given.
export function renderWalletHelp(container,help,{guestLabel='Continue as guest',onGuest=null}={}){
 const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids);return n;};
 const link=(w,text)=>{const a=el('a',{className:'wallet-option',href:w.url,target:'_blank',rel:'noopener noreferrer',textContent:text});a.style.textDecoration='none';a.style.color='inherit';return a;};
 const out=[];
 if(help.openIns?.length)out.push(el('div',{className:'wallet-list wallet-open-in'},...help.openIns.map(w=>link(w,`Open in ${w.name}`))));
 if(help.install?.length){const grid=el('div',{className:'wallet-list wallet-install'});
  grid.append(...help.install.map(w=>link(w,w.name)));
  out.push(el('p',{className:'fine',textContent:help.mode==='mobile'?'Or install a wallet app:':'Install one, then reload this page:'}),grid);}
 if(onGuest){const b=el('button',{type:'button',className:'button button-ghost',textContent:guestLabel});b.onclick=onGuest;
  out.push(b,el('p',{className:'fine',textContent:'Guests explore, visit rooms and say hi. Nothing about a guest leaves this browser.'}));}
 container.replaceChildren(...out);return container;
}
