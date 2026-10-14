import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {legacyProviders,adaptLegacy,mergeWallets,walletKey,registerStandard,scanWallets,listWallets,signIn,walletHelp,renderWalletHelp,withTimeout,describeError,signedByKey,sameBytes,
 isRejection,REJECTED,TIMEOUT,MISMATCH,INSTALL,NOTE,LEGACY,LEGACY_CHAIN,phantomBrowseLink,solflareBrowseLink,backpackBrowseLink,openInLinks,SETTLE_MS,POLL_MS,POLL_FOR_MS,CONNECT_MS} from '../src/wallet.js';
import {b58encode} from '../src/api.js';

const IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const AND='Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile';
const MAC='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/129 Safari/537.36';
const provider=(extra={})=>({connect:async()=>{},signMessage:async()=>{},...extra});
// A fake legacy provider that really signs (Ed25519 via WebCrypto, like the browsers do).
async function keyed({shape='object',connectReturns='publicKey',flags={}}={}){
 const kp=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);const raw=new Uint8Array(await webcrypto.subtle.exportKey('raw',kp.publicKey));
 const pk={toBase58:()=>b58encode(raw),toBytes:()=>raw,toString:()=>b58encode(raw)};
 const p={...flags,publicKey:null,calls:[],raw,
  async connect(opts){p.calls.push(['connect',opts]);p.publicKey=pk;return connectReturns==='publicKey'?{publicKey:pk}:connectReturns==='true'?true:undefined;},
  async signMessage(msg,enc){p.calls.push(['signMessage',enc]);const signature=new Uint8Array(await webcrypto.subtle.sign('Ed25519',kp.privateKey,msg));return shape==='raw'?signature:{signature,publicKey:pk};}};
 return p;
}
const fakeApi=(calls)=>async(url,init)=>{const body=JSON.parse(init.body);calls.push([url,body]);
 if(url==='/api/auth/nonce')return {ok:true,status:200,json:async()=>({nonce:'n1',message:`Sign in to the SUBZERONE launchpad.\nWallet: ${body.wallet}\nNonce: n1`})};
 if(url==='/api/auth/verify')return {ok:true,status:200,json:async()=>({ok:true})};return {ok:false,status:404,json:async()=>({})};};

test('legacy scan: finds the known providers, labels window.solana by its flag, skips half providers and throwing getters',()=>{
 const phantom=provider({isPhantom:true}),solflare=provider({isSolflare:true}),okx=provider();
 const win={phantom:{solana:phantom},solflare,okxwallet:{solana:okx},solana:phantom,glow:{connect(){}} /* no signMessage */,get backpack(){throw new Error('nope');}};
 assert.deepEqual(legacyProviders(win).map(x=>x.name),['Phantom','Solflare','OKX'],'window.solana is Phantom again: one entry');
 assert.deepEqual(legacyProviders({solana:provider({isSolflare:true})}).map(x=>x.name),['Solflare']);
 assert.deepEqual(legacyProviders({solana:provider({isBraveWallet:true})}).map(x=>x.name),['Brave']);
 assert.deepEqual(legacyProviders({solana:provider()}).map(x=>x.name),['Solana wallet']);
 assert.deepEqual(legacyProviders({coinbaseSolana:provider(),trustwallet:{solana:provider()},bitkeep:{solana:provider()},nightly:{solana:provider()},magicEden:{solana:provider()},braveSolana:provider(),xnft:{solana:provider()},exodus:{solana:provider()},glowSolana:provider()}).map(x=>x.name),
  ['Glow','Coinbase Wallet','Trust','Bitget','Exodus','Nightly','Magic Eden','Brave','xNFT']);
 assert.deepEqual(legacyProviders({}),[]);assert.deepEqual(legacyProviders(null),[]);assert.deepEqual(legacyProviders({solana:'x'}),[]);
 assert.equal(LEGACY.length,13);
});
test('dedupe: a Wallet Standard entry wins over a legacy one of the same name',()=>{
 assert.equal(walletKey('OKX Wallet'),'okx');assert.equal(walletKey('Brave Wallet'),'brave');assert.equal(walletKey(' Phantom '),'phantom');assert.equal(walletKey(null),'');
 const std=[{name:'Phantom',std:1},{name:'OKX Wallet',std:1}],leg=[{name:'Phantom',legacy:1},{name:'OKX',legacy:1},{name:'Solflare',legacy:1}];
 assert.deepEqual(mergeWallets(std,leg),[{name:'Phantom',std:1},{name:'OKX Wallet',std:1},{name:'Solflare',legacy:1}]);
 assert.deepEqual(mergeWallets([],leg),leg);assert.deepEqual(mergeWallets(std,[]),std);
});
test('adapter: connect shapes ({publicKey}, true, nothing) and signMessage shapes (raw bytes, {signature,publicKey})',async()=>{
 for(const connectReturns of ['publicKey','true','nothing']){
  const p=await keyed({connectReturns}),a=adaptLegacy(p,'Phantom');
  assert.equal(a.name,'Phantom');assert.equal(a.legacy,true);assert.deepEqual(a.chains,[LEGACY_CHAIN]);assert.equal(a.icon,null);
  const {accounts}=await a.features['standard:connect'].connect();
  assert.equal(accounts.length,1);assert.equal(accounts[0].address,b58encode(p.raw));assert.ok(accounts[0].publicKey instanceof Uint8Array&&accounts[0].publicKey.length===32);
  assert.deepEqual(p.calls[0],['connect',{onlyIfTrusted:false}]);
 }
 const msg=new TextEncoder().encode('hello');
 for(const shape of ['raw','object']){
  const p=await keyed({shape}),a=adaptLegacy(p,'X');await a.features['standard:connect'].connect();
  const [r]=await a.features['solana:signMessage'].signMessage({message:msg});
  assert.ok(r.signature instanceof Uint8Array&&r.signature.length===64);assert.equal(r.signedMessage,msg);assert.equal(r.publicKey,shape==='object'?b58encode(p.raw):null);
  assert.deepEqual(p.calls.at(-1),['signMessage','utf8']);
  assert.equal(await signedByKey(p.raw,msg,r.signature,webcrypto.subtle),true);assert.equal(await signedByKey(p.raw,new TextEncoder().encode('other'),r.signature,webcrypto.subtle),false);
 }
 // Array signatures become bytes; a provider that answers nothing is an error, not a crash.
 const arr=adaptLegacy(provider({signMessage:async()=>({signature:[1,2,3]})}),'Y');assert.ok((await arr.features['solana:signMessage'].signMessage({message:msg}))[0].signature instanceof Uint8Array);
 await assert.rejects(adaptLegacy(provider({signMessage:async()=>undefined}),'Z').features['solana:signMessage'].signMessage({message:msg}),/without a signature/);
 const none=adaptLegacy(provider({connect:async()=>undefined}),'N');assert.deepEqual(await none.features['standard:connect'].connect(),{accounts:[]});
 const icon=adaptLegacy(provider({icon:'data:image/svg+xml;base64,PHN2Zy8+'}),'I');assert.equal(icon.icon,'data:image/svg+xml;base64,PHN2Zy8+');
 assert.ok(signedByKey(null,msg,new Uint8Array(64),undefined) instanceof Promise);assert.equal(await signedByKey(new Uint8Array(31),msg,new Uint8Array(64),webcrypto.subtle),true,'unverifiable: no false alarm');
 assert.ok(sameBytes(new Uint8Array([1,2]),new Uint8Array([1,2])));assert.ok(!sameBytes(new Uint8Array([1,2]),new Uint8Array([1,3])));assert.ok(!sameBytes(null,new Uint8Array(1)));
});
test('walletHelp: scanning, desktop install, mobile links, in-app and wallets modes',()=>{
 assert.equal(walletHelp({count:0,ua:MAC,settled:false}).mode,'scanning');assert.equal(walletHelp({count:0,ua:MAC,settled:false}).note,NOTE.scanning);assert.deepEqual(walletHelp({count:0,ua:IOS,settled:false}).install,[]);
 const desk=walletHelp({count:0,ua:MAC});assert.equal(desk.mode,'install');assert.deepEqual(desk.install.map(w=>w.name),['Phantom','Solflare','Backpack','Glow','Coinbase Wallet','Trust','OKX']);assert.equal(desk.openIn,null);assert.deepEqual(desk.openIns,[]);
 assert.ok(INSTALL.every(w=>/^https:\/\/(www\.)?(phantom\.com|solflare\.com|backpack\.app|glow\.app|coinbase\.com|trustwallet\.com|okx\.com)\//.test(w.url)),'official download pages only');
 for(const ua of [IOS,AND]){const m=walletHelp({count:0,ua,href:'https://city.subzerone.live/?x=1',origin:'https://city.subzerone.live'});
  assert.equal(m.mode,'mobile');assert.equal(m.note,NOTE.mobile);assert.deepEqual(m.openIns.map(w=>w.name),['Phantom','Solflare','Backpack']);assert.equal(m.openIn.name,'Phantom');assert.equal(m.install.length,INSTALL.length);
  assert.equal(m.openIns[0].url,phantomBrowseLink('https://city.subzerone.live/?x=1','https://city.subzerone.live'));
  assert.equal(m.openIns[1].url,'https://solflare.com/ul/v1/browse/https%3A%2F%2Fcity.subzerone.live%2F%3Fx%3D1?ref=https%3A%2F%2Fcity.subzerone.live');
  assert.equal(m.openIns[2].url,'https://backpack.app/ul/v1/browse/https%3A%2F%2Fcity.subzerone.live%2F%3Fx%3D1?ref=https%3A%2F%2Fcity.subzerone.live');}
 assert.equal(walletHelp({count:0,ua:MAC,touch:5}).mode,'mobile','iPadOS says Mac but has touch');
 assert.deepEqual(walletHelp({count:1,ua:IOS,inApp:true}),{mode:'inapp',note:'',install:[],openIn:null,openIns:[]},'inside a wallet app: the wallet is listed, no links');
 assert.deepEqual(walletHelp({count:2,ua:MAC}),{mode:'wallets',note:'',install:[],openIn:null,openIns:[]});
 assert.equal(openInLinks('a','b').length,3);assert.equal(solflareBrowseLink('a','b'),'https://solflare.com/ul/v1/browse/a?ref=b');assert.equal(backpackBrowseLink('a','b'),'https://backpack.app/ul/v1/browse/a?ref=b');
 assert.equal(SETTLE_MS,2000);assert.equal(POLL_MS,500);assert.equal(POLL_FOR_MS,4000);assert.equal(CONNECT_MS,10000);
});
test('renderWalletHelp draws the links, the grid and the guest button (minimal DOM)',()=>{
 const node=(tag)=>({tag,children:[],style:{},append(...k){this.children.push(...k);},replaceChildren(...k){this.children=k;}});
 globalThis.document={createElement:node};
 try{
  const box=node('div');let guest=0;
  renderWalletHelp(box,walletHelp({count:0,ua:IOS,href:'https://x.test/',origin:'https://x.test'}),{onGuest:()=>guest++,guestLabel:'Go as guest'});
  const [links,p,grid,btn,fine]=box.children;
  assert.deepEqual(links.children.map(a=>a.textContent),['Open in Phantom','Open in Solflare','Open in Backpack']);assert.ok(links.children.every(a=>a.target==='_blank'&&a.rel==='noopener noreferrer'));
  assert.equal(p.textContent,'Or install a wallet app:');assert.equal(grid.children.length,INSTALL.length);assert.equal(btn.textContent,'Go as guest');btn.onclick();assert.equal(guest,1);assert.ok(/Guests explore/.test(fine.textContent));
  renderWalletHelp(box,walletHelp({count:0,ua:MAC}),{onGuest:()=>{}});assert.equal(box.children[0].textContent,'Install one, then reload this page:');assert.equal(box.children.length,4);
  renderWalletHelp(box,walletHelp({count:0,ua:MAC,settled:false}),{onGuest:()=>{}});assert.equal(box.children.length,2,'scanning: only the guest button');
  renderWalletHelp(box,walletHelp({count:1,ua:MAC}));assert.equal(box.children.length,0);
 }finally{delete globalThis.document;}
});
test('timeout, rejection and locked-wallet messages',async()=>{
 await assert.rejects(withTimeout(new Promise(()=>{}),5),err=>err.timeout&&err.message===TIMEOUT);
 assert.equal(await withTimeout(Promise.resolve(7),50),7);
 for(const e of [{code:4001,message:'x'},{name:'WalletSignMessageError',message:'User rejected the request.'},new Error('Approval Denied'),new Error('Popup closed')])assert.ok(isRejection(e),JSON.stringify(e));
 for(const e of [new Error('request failed (500)'),new Error('Wallet not found.'),null,new Error('Wallet is locked')])assert.ok(!isRejection(e));
 assert.equal(describeError(Object.assign(new Error(REJECTED),{rejected:true})),REJECTED);assert.equal(describeError(Object.assign(new Error(TIMEOUT),{timeout:true})),TIMEOUT);
 assert.equal(describeError(new Error('Wallet is locked')),'Wallet is locked. Unlock the wallet, then pick it again.');
 assert.equal(describeError({error:{message:'Unlock Solflare first'}}),'Unlock Solflare first. Unlock the wallet, then pick it again.');
 assert.equal(describeError(new Error('')),'The wallet refused without saying why. Open it, unlock it and try again.');assert.equal(describeError({}),'The wallet refused without saying why. Open it, unlock it and try again.');
 assert.ok(describeError(null));assert.equal(describeError('plain text'),'plain text');assert.equal(describeError(new Error('bad_signature')),'bad_signature');
});
test('signIn end to end: legacy-only provider, a late Wallet Standard wallet that wins the name, and a key mismatch',async()=>{
 const calls=[];globalThis.fetch=fakeApi(calls);
 try{
  const phantom=await keyed({shape:'object'});const win={phantom:{solana:phantom},solana:phantom,dispatchEvent(){}};
  assert.equal(scanWallets(win),1);assert.deepEqual(listWallets().map(w=>[w.name,w.legacy]),[['Phantom',true]]);
  const addr=await signIn('Phantom');assert.equal(addr,b58encode(phantom.raw));
  assert.equal(calls[0][0],'/api/auth/nonce');assert.deepEqual(calls[0][1],{wallet:addr});assert.equal(calls[1][0],'/api/auth/verify');assert.equal(calls[1][1].nonce,'n1');assert.equal(calls[1][1].wallet,addr);
  const sig=calls[1][1].signature;assert.equal(typeof sig,'string');assert.ok(sig.length>80);
  // the same provider again is not a change; a second scan with the provider gone drops it
  assert.equal(scanWallets(win),1);assert.equal(scanWallets({dispatchEvent(){}}),0);assert.deepEqual(listWallets(),[]);
  // one sign-in at a time: the pending promise is reused
  scanWallets(win);const a=signIn('Phantom'),b=signIn('Phantom');assert.equal(a,b);await a;
  // a Wallet Standard "Phantom" registering late replaces the legacy entry in the list and is the one that signs
  const std=await keyed({shape:'raw'});let stdConnects=0;
  const kp=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);const raw=new Uint8Array(await webcrypto.subtle.exportKey('raw',kp.publicKey));
  const acct={address:b58encode(raw),publicKey:raw,chains:['solana:mainnet'],features:['solana:signMessage']};
  registerStandard({name:'Phantom',icon:'data:,',chains:['solana:mainnet'],features:{'standard:connect':{connect:async()=>{stdConnects++;return {accounts:[acct]};}},
   'solana:signMessage':{signMessage:async({message})=>[{signedMessage:message,signature:new Uint8Array(await webcrypto.subtle.sign('Ed25519',kp.privateKey,message))}]}}});
  assert.deepEqual(listWallets().map(w=>[w.name,w.legacy]),[['Phantom',false]]);
  assert.equal(await signIn('Phantom'),acct.address);assert.equal(stdConnects,1);void std;
  // a wallet that signs with another key than it connected: refused before /api/auth/verify
  const other=await keyed();const liar={name:'Liar',chains:['solana:mainnet'],features:{'standard:connect':{connect:async()=>({accounts:[acct]})},'solana:signMessage':{signMessage:async({message})=>other.signMessage(message)}}};
  registerStandard(liar);const before=calls.length;await assert.rejects(signIn('Liar'),new RegExp(MISMATCH.slice(0,20)));assert.equal(calls.length,before+1,'nonce fetched, verify never called');
  // no account, a rejection, a timeout and a locked wallet
  registerStandard({name:'Empty',chains:['solana:x'],features:{'standard:connect':{connect:async()=>({accounts:[]})},'solana:signMessage':{signMessage:async()=>[]}}});await assert.rejects(signIn('Empty'),/shared no account/);
  registerStandard({name:'Nope',chains:['solana:x'],features:{'standard:connect':{connect:async()=>{throw {code:4001,message:'User rejected the request.'};}},'solana:signMessage':{signMessage:async()=>[]}}});await assert.rejects(signIn('Nope'),err=>err.rejected&&err.message===REJECTED);
  registerStandard({name:'Locked',chains:['solana:x'],features:{'standard:connect':{connect:async()=>{throw new Error('Wallet is locked');}},'solana:signMessage':{signMessage:async()=>[]}}});await assert.rejects(signIn('Locked'),err=>describeError(err).startsWith('Wallet is locked. Unlock'));
  await assert.rejects(signIn('Ghost'),/Wallet not found/);
 }finally{delete globalThis.fetch;}
});

// ---------------------------------------------------------------- launch signatures (the computer's Launch tab)
import {signTransaction,signMessage,fromBase64,toBase64,NO_RAW_SIGN,NO_SIGN_FEATURE,SIGN_MS} from '../src/wallet.js';
test('signTransaction: Wallet Standard signs the bytes on the asked chain; legacy and feature-less wallets refuse clearly; rejection maps',async()=>{
 const kp=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);const raw=new Uint8Array(await webcrypto.subtle.exportKey('raw',kp.publicKey));
 const acct={address:b58encode(raw),publicKey:raw,chains:['solana:mainnet','solana:devnet'],features:['solana:signMessage','solana:signTransaction']};
 const seen=[];
 // a "transaction": 1 signature slot (64 zero bytes) + a message; the fake wallet signs the message part and fills the slot
 const message=new TextEncoder().encode('launch message bytes'),tx=new Uint8Array(1+64+message.length);tx[0]=1;tx.set(message,65);
 registerStandard({name:'Std',chains:['solana:mainnet','solana:devnet'],features:{'standard:connect':{connect:async(o)=>{seen.push(['connect',o]);return {accounts:[acct]};}},
  'solana:signMessage':{signMessage:async({message})=>[{signedMessage:message,signature:new Uint8Array(await webcrypto.subtle.sign('Ed25519',kp.privateKey,message))}]},
  'solana:signTransaction':{signTransaction:async(...ins)=>{const out=[];for(const i of ins){seen.push(['sign',i.chain,i.account.address,i.transaction.length]);const t=new Uint8Array(i.transaction);const sig=new Uint8Array(await webcrypto.subtle.sign('Ed25519',kp.privateKey,t.subarray(65)));t.set(sig,1);out.push({signedTransaction:t});}return out;}}}});
 const r=await signTransaction('Std',toBase64(tx),{chain:'solana:devnet'});
 assert.equal(r.address,acct.address);const signed=fromBase64(r.signed);assert.equal(signed.length,tx.length);assert.ok(signed.subarray(1,65).some(b=>b!==0),'the signature slot is filled');
 assert.equal(await webcrypto.subtle.verify('Ed25519',kp.publicKey,signed.subarray(1,65),message),true);
 assert.deepEqual(seen[0],['connect',{silent:true}]);assert.deepEqual(seen[1],['sign','solana:devnet',acct.address,tx.length]);
 assert.equal((await signTransaction('Std',toBase64(tx))).signed.length,r.signed.length,'default chain is mainnet');assert.equal(seen.at(-1)[1],'solana:mainnet');
 // signMessage through the same wallet: 64-byte signature, verified against the account's key
 const m=await signMessage('Std',message);assert.equal(m.signature.length,64);assert.equal(m.address,acct.address);assert.equal(await webcrypto.subtle.verify('Ed25519',kp.publicKey,m.signature,message),true);
 // legacy provider: cannot sign raw bytes
 const solflare=await keyed({shape:'object'});scanWallets({solflare,dispatchEvent(){}});assert.ok(listWallets().some(w=>w.name==='Solflare'&&w.legacy));
 await assert.rejects(signTransaction('Solflare',toBase64(tx)),err=>err.unsupported&&err.message===NO_RAW_SIGN);
 assert.equal(describeError(Object.assign(new Error(NO_RAW_SIGN),{unsupported:true})),NO_RAW_SIGN);
 // a Wallet Standard wallet without the feature, a wallet that rejects, one that returns nothing, an empty transaction
 registerStandard({name:'NoFeat',chains:['solana:mainnet'],features:{'standard:connect':{connect:async()=>({accounts:[acct]})},'solana:signMessage':{signMessage:async()=>[]}}});
 await assert.rejects(signTransaction('NoFeat',toBase64(tx)),err=>err.unsupported&&err.message===NO_SIGN_FEATURE);
 registerStandard({name:'Rej',chains:['solana:mainnet'],features:{'standard:connect':{connect:async()=>({accounts:[acct]})},'solana:signMessage':{signMessage:async()=>[]},'solana:signTransaction':{signTransaction:async()=>{throw {code:4001,message:'User rejected the request.'};}}}});
 await assert.rejects(signTransaction('Rej',toBase64(tx)),err=>err.rejected&&err.message===REJECTED);
 registerStandard({name:'Mute',chains:['solana:mainnet'],features:{'standard:connect':{connect:async()=>({accounts:[acct]})},'solana:signMessage':{signMessage:async()=>[]},'solana:signTransaction':{signTransaction:async()=>[{}]}}});
 await assert.rejects(signTransaction('Mute',toBase64(tx)),/without a signed transaction/);
 await assert.rejects(signTransaction('Std',''),/no transaction to sign/);await assert.rejects(signTransaction('Ghost',toBase64(tx)),/Wallet not found/);
 // a quiet connect that fails falls back to the normal one
 let n=0;registerStandard({name:'Loud',chains:['solana:mainnet'],features:{'standard:connect':{connect:async(o)=>{n++;if(o.silent)throw new Error('not trusted');return {accounts:[acct]};}},'solana:signMessage':{signMessage:async()=>[]},
  'solana:signTransaction':{signTransaction:async({transaction})=>[{signedTransaction:transaction}]}}});
 assert.equal(fromBase64((await signTransaction('Loud',toBase64(tx))).signed).length,tx.length);assert.equal(n,2);
 assert.equal(SIGN_MS,120000);assert.deepEqual([...fromBase64(toBase64(new Uint8Array([0,1,255,128])))],[0,1,255,128]);
});

test('reviewed Phantom rewards use documented sign-only request and reject changed or unsigned bytes',async()=>{
 const kp=await webcrypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
 const publicKey=new Uint8Array(await webcrypto.subtle.exportKey('raw',kp.publicKey)),address=b58encode(publicKey);
 const account={address,publicKey,chains:['solana:mainnet']};
 registerStandard({name:'Phantom',chains:['solana:mainnet'],features:{
  'standard:connect':{connect:async()=>({accounts:[account]})},'solana:signMessage':{signMessage:async()=>[]},
  'solana:signTransaction':{signTransaction:async()=>{throw Error('Unsupported Wallet Standard sign-only path');}}
 }});
 const message=new Uint8Array(100);message[0]=1;message.set(publicKey,4);
 const original=new Uint8Array(65+message.length);original[0]=1;original.set(message,65);
 let mode='valid',seen;
 const provider={isPhantom:true,publicKey:{toBase58:()=>address},request:async input=>{
  seen=input;const signed=new Uint8Array(original);
  if(mode!=='unsigned')signed.set(new Uint8Array(await webcrypto.subtle.sign('Ed25519',kp.privateKey,message)),1);
  if(mode==='changed')signed[signed.length-1]^=1;
  if(mode==='invalid')signed[1]^=1;
  return {serialize:()=>signed};
 }};
 const previous=globalThis.window;globalThis.window={phantom:{solana:provider}};
 try{
  const result=await signTransaction('Phantom',toBase64(original),{reviewedReward:true});
  assert.deepEqual(seen,{method:'signTransaction',params:{message:b58encode(message)}});
  assert.equal(result.address,address);assert.equal(await webcrypto.subtle.verify('Ed25519',kp.publicKey,fromBase64(result.signed).subarray(1,65),message),true);
  mode='changed';await assert.rejects(signTransaction('Phantom',toBase64(original),{reviewedReward:true}),/changed the reviewed transaction/);
  mode='unsigned';await assert.rejects(signTransaction('Phantom',toBase64(original),{reviewedReward:true}),/valid signature/);
  mode='invalid';await assert.rejects(signTransaction('Phantom',toBase64(original),{reviewedReward:true}),/valid signature/);
  provider.publicKey={toBase58:()=> 'different-wallet'};await assert.rejects(signTransaction('Phantom',toBase64(original),{reviewedReward:true}),new RegExp(MISMATCH.slice(0,20)));
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
