import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanName,sanitizeLook,makeGuest,loadGuest,saveGuest,clearGuest,upgradePayload,pickPlot,reasonFor,gateReason,REASONS,GATE_TEXT,GUEST_KEY} from '../src/guest.js';
import {walletHelp,phantomBrowseLink,isIOS,isMobile,isRejection,sortWallets,lastWallet,LAST_KEY,INSTALL,REJECTED} from '../src/wallet.js';
import {GUEST_SPAWN,spawnFor,homeFor,snapToStreet} from '../src/explore.js';
import {api,setGate,ApiError} from '../src/api.js';
import {frontOf} from '../src/world-sync.js';

const mem=(init={})=>{const m=new Map(Object.entries(init));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),m};};
const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('quota');},removeItem(){throw new Error('denied');}};
const OPTIONS={name:{min:2,max:24},look:{skin:['#f6d5b8','#c98e66'],hair:['#1b1b1b'],hairStyle:['short','bun'],outfit:['hoodie','tee'],accessories:['glasses','cap','halo'],maxAccessories:4,pets:['cat','dragon'],petName:{max:12}},
 unlocks:{tiers:['resident','builder','founder','launched'],accessories:{resident:['glasses','cap'],founder:['halo']},pets:{resident:['cat'],launched:['dragon']}}};
const LOOK={skin:'#C98E66',hair:'#1b1b1b',hairStyle:'bun',outfit:'tee',top:'#FB752B',bottom:'#2f3e66',accessories:['glasses'],accessoryColor:null,pet:{kind:'cat',color:'#c8a27a',name:'Mochi'}};

test('names follow the server rule',()=>{
 assert.equal(cleanName('  Yui   Tanaka '),'Yui Tanaka');assert.equal(cleanName('東京 太郎'),'東京 太郎');assert.equal(cleanName("O'Neil-J._2"),"O'Neil-J._2");
 for(const bad of ['a','x'.repeat(25),'<b>hi</b>','name!','',null,'😀😀'])assert.equal(cleanName(bad),null,String(bad));
});
test('look whitelist: lowercases colours, refuses unknown values and fields of the wrong shape',()=>{
 const l=sanitizeLook(LOOK,OPTIONS);assert.equal(l.skin,'#c98e66');assert.equal(l.top,'#fb752b');assert.deepEqual(l.accessories,['glasses']);assert.deepEqual(l.pet,{kind:'cat',color:'#c8a27a',name:'Mochi'});
 assert.deepEqual(Object.keys(l).sort(),['accessories','accessoryColor','bottom','hair','hairStyle','outfit','pet','skin','top']);
 for(const bad of [{skin:'#000000'},{hairStyle:'mohawk'},{top:'red'},{accessories:['glasses','glasses']},{accessories:['jetpack']},{accessories:'cap'},{accessoryColor:'blue'},{pet:{kind:'horse',color:'#c8a27a',name:'X'}},{pet:{kind:'cat',color:'#c8a27a',name:''}}])
  assert.equal(sanitizeLook({...LOOK,...bad},OPTIONS),null,JSON.stringify(bad));
 assert.equal(sanitizeLook(null,OPTIONS),null);assert.equal(sanitizeLook([],OPTIONS),null);
 // Above the first tier: dropped, not refused (the upgrade POST would get 403 locked).
 const hi=sanitizeLook({...LOOK,accessories:['glasses','halo'],pet:{kind:'dragon',color:'#e05a47',name:'Ryu'}},OPTIONS);assert.deepEqual(hi.accessories,['glasses']);assert.equal(hi.pet,null);
 // Without options the creator's fallback vocabulary applies.
 assert.ok(sanitizeLook({...LOOK,skin:'#f6d5b8',hair:'#1b1b1b',outfit:'hoodie'},null));
});
test('guest storage round-trip, validation and a storage that throws',()=>{
 const s=mem();assert.equal(loadGuest(s,OPTIONS),null);
 const g=saveGuest({name:' Yui ',look:LOOK,traits:{neat:.8,outgoing:7}},s,OPTIONS);
 assert.equal(g.name,'Yui');assert.equal(g.guest,true);assert.equal(g.traits.outgoing,1);assert.equal(g.traits.nice,.5);
 assert.deepEqual(loadGuest(s,OPTIONS),g);assert.deepEqual(JSON.parse(s.m.get(GUEST_KEY)),g);
 assert.equal(saveGuest({name:'!',look:LOOK},s,OPTIONS),null);assert.deepEqual(loadGuest(s,OPTIONS),g,'a refused save keeps the old guest');
 s.setItem(GUEST_KEY,'{not json');assert.equal(loadGuest(s,OPTIONS),null);
 s.setItem(GUEST_KEY,JSON.stringify({...g,look:{...g.look,skin:'#123456'}}));assert.equal(loadGuest(s,OPTIONS),null);
 clearGuest(s);assert.equal(s.m.has(GUEST_KEY),false);
 assert.equal(loadGuest(broken,OPTIONS),null);assert.ok(saveGuest({name:'Yui',look:LOOK},broken,OPTIONS));assert.doesNotThrow(()=>clearGuest(broken));
 assert.equal(loadGuest(null),null);
 assert.equal(makeGuest({name:'Yui',look:{...LOOK,extra:1}},OPTIONS).look.extra,undefined,'unknown fields never survive');
});
test('upgrade payload is exactly what POST /api/residents accepts',()=>{
 const g=makeGuest({name:'Yui',look:LOOK,traits:{neat:1}},OPTIONS),b=upgradePayload(g,'shibuya-2');
 assert.deepEqual(Object.keys(b).sort(),['look','name','plotId','traits']);assert.equal(b.plotId,'shibuya-2');assert.equal(b.name,'Yui');
 assert.equal('guest' in b,false);assert.equal('guest' in b.look,false);assert.deepEqual(Object.keys(b.traits).sort(),['active','neat','nice','outgoing','playful']);
});
test('pickPlot: hint when free, else the nearest free building to the spawn, open lots last',()=>{
 const {x,z}=GUEST_SPAWN,plots=[{id:'a',x:x-60,z},{id:'b',x:x+.5,z,vacant:true},{id:'c',x:x+5,z:z+5},{id:'d',x:x+1,z:z+1}];
 assert.equal(pickPlot(plots,[{plotId:'d'}]),'c');assert.equal(pickPlot(plots,[]),'d');assert.equal(pickPlot(plots,[],{hint:'a'}),'a');
 assert.equal(pickPlot(plots,[{plotId:'a'}],{hint:'a'}),'d');assert.equal(pickPlot(plots,['a','c','d'].map(plotId=>({plotId}))),'b');
 assert.equal(pickPlot(plots,plots.map(p=>({plotId:p.id}))),null);
});
test('requireWallet reasons and the write gate',()=>{
 assert.match(reasonFor('claim'),/80% of creator fees/);assert.equal(reasonFor('nope'),REASONS.claim);
 for(const k of ['claim','idea','guestbook','save'])assert.ok(REASONS[k]&&GATE_TEXT[k]);
 assert.equal(GATE_TEXT.guestbook,'Sign in to sign the guestbook.');
 assert.equal(gateReason('/api/world'),null);assert.equal(gateReason('/api/rooms/shiba-1','GET'),null);assert.equal(gateReason('/api/auth/nonce','POST'),null);
 assert.equal(gateReason('/api/residents','POST'),'claim');assert.equal(gateReason('/api/ideas','post'),'idea');
 assert.equal(gateReason('/api/rooms/shiba-1/guestbook','POST'),'guestbook');assert.equal(gateReason('/api/rooms/me','PUT'),'save');
 assert.equal(gateReason('/api/rooms/shiba-1/guestbook/4','DELETE'),'default');
});
test('api(): a gate refuses before fetch, as a 401',async()=>{
 let fetched=0;const real=globalThis.fetch;globalThis.fetch=async()=>{fetched++;return new Response('{"ok":true}',{status:200});};
 try{setGate((p,m)=>m==='POST'?'Sign in first.':null);
  await assert.rejects(api('/api/ideas',{method:'POST',body:{}}),e=>e instanceof ApiError&&e.status===401&&e.message==='Sign in first.');
  assert.equal(fetched,0);assert.deepEqual(await api('/api/world'),{ok:true});assert.equal(fetched,1);
 }finally{setGate(null);globalThis.fetch=real;}
});
test('Phantom deep link encodes the page and the origin',()=>{
 assert.equal(phantomBrowseLink('http://localhost:5185/?a=1&b=2#x','http://localhost:5185'),'https://phantom.app/ul/browse/http%3A%2F%2Flocalhost%3A5185%2F%3Fa%3D1%26b%3D2%23x?ref=http%3A%2F%2Flocalhost%3A5185');
});
test('wallet detection branches',()=>{
 const IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',IPAD='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  AND='Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile',MAC='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/129 Safari/537.36';
 assert.ok(isIOS(IOS));assert.ok(isIOS(IPAD,5),'iPadOS reports a Mac with touch');assert.ok(!isIOS(MAC,0));assert.ok(isMobile(AND));assert.ok(!isMobile(MAC));
 assert.deepEqual(walletHelp({count:2,ua:IOS}),{mode:'wallets',install:[],openIn:null});
 const desk=walletHelp({count:0,ua:MAC});assert.equal(desk.mode,'install');assert.deepEqual(desk.install.map(w=>w.name),['Phantom','Solflare','Backpack']);assert.equal(desk.openIn,null);
 const ios=walletHelp({count:0,ua:IOS,href:'https://x.test/',origin:'https://x.test'});assert.equal(ios.mode,'mobile');assert.equal(ios.openIn.url,phantomBrowseLink('https://x.test/','https://x.test'));
 assert.ok(INSTALL.every(w=>w.url.startsWith('https://')));
});
test('wallet rejections are recognised; the last wallet sorts first',()=>{
 for(const e of [{code:4001,message:'x'},{name:'WalletSignMessageError',message:'User rejected the request.'},new Error('Approval Denied'),new Error('Popup closed')])assert.ok(isRejection(e),JSON.stringify(e));
 for(const e of [new Error('request failed (500)'),new Error('Wallet not found.'),null])assert.ok(!isRejection(e));
 assert.match(REJECTED,/Nothing was signed/);
 const list=[{name:'Phantom'},{name:'Backpack'},{name:'Solflare'}];
 assert.deepEqual(sortWallets(list,'Backpack').map(w=>w.name),['Backpack','Phantom','Solflare']);assert.equal(sortWallets(list,null),list);
 assert.equal(lastWallet(mem({[LAST_KEY]:'Solflare'})),'Solflare');assert.equal(lastWallet(broken),null);
});
test('guests spawn at Shibuya station on a street, residents at their door; a guest has no home',()=>{
 assert.deepEqual(snapToStreet(GUEST_SPAWN),{x:GUEST_SPAWN.x,z:GUEST_SPAWN.z});
 assert.equal(spawnFor({name:'Yui',guest:true}),GUEST_SPAWN);assert.deepEqual(spawnFor({plotId:'shiba-1'}),frontOf('shiba-1'));assert.equal(spawnFor(null),null);
 assert.equal(homeFor({guest:true}),null);assert.deepEqual(homeFor({plotId:'shiba-1'}),frontOf('shiba-1'));
});
