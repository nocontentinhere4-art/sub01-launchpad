import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CATEGORY_IDS,MESSAGE_MAX,RING_MAX,TOKENS_KEY,SENT_LINE,createRing,errorRing,recordError,errorEntry,noteLaunch,launchNote,resetLaunchNote,prefill,looksSecret,SECRET_LINE,
 sheetModel,buildContext,contextLines,bundleOf,loadTokens,saveToken,reportsModel,timeAgo} from '../src/support.js';
import {api,ApiError} from '../src/api.js';
import {gateReason} from '../src/guest.js';

const WALLET='8zsQBJjo22WesDiQJZcHwpn7owYBSrNCFqXdMNv6mnBy';
const B58=c=>'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[c%58];
const SECRET_KEY=Array.from({length:88},(_,i)=>B58(i*7+3)).join('');
const memStore=()=>{const m=new Map();return {m,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};};

test('the error ring keeps the last 10, strips queries, never keeps support calls',()=>{
 const ring=createRing();
 for(let i=0;i<14;i++)recordError({method:'post',path:`/api/projects/a/launch/transaction?token=t${i}#x`,status:409,code:'conflict',message:`  changed\n${i} `},ring);
 assert.equal(ring.size,RING_MAX);
 const l=ring.list();
 assert.equal(l[0].message,'changed 4');assert.equal(l.at(-1).message,'changed 13');
 assert.equal(l[0].path,'/api/projects/a/launch/transaction');assert.equal(l[0].method,'POST');
 assert.equal(recordError({path:'/api/support',status:500},ring),null);assert.equal(recordError({path:'/api/support/mine',status:401},ring),null);
 assert.equal(ring.size,RING_MAX);
 const e=errorEntry({path:'x'.repeat(300),message:'m'.repeat(500),code:'c'.repeat(90)},5);
 assert.deepEqual([e.path.length,e.message.length,e.code.length,e.at,e.status],[120,200,60,5,0]);
 ring.clear();assert.equal(ring.size,0);
});

test('api() records failed calls (HTTP and network) in the shared ring, not the good ones',async()=>{
 const real=globalThis.fetch;errorRing.clear();
 try{
  globalThis.fetch=async(path)=>path==='/ok'?new Response('{"a":1}',{status:200}):path==='/down'?Promise.reject(new TypeError('Failed to fetch')):new Response('{"error":"not_cleared","message":"An admin has not cleared it yet."}',{status:409});
  assert.deepEqual(await api('/ok'),{a:1});
  await assert.rejects(api('/api/projects/x/launch/transaction?x=1',{method:'POST',body:{}}),e=>e instanceof ApiError&&e.status===409);
  await assert.rejects(api('/down'),/Failed to fetch/);
  const l=errorRing.list();
  assert.equal(l.length,2);
  assert.deepEqual([l[0].method,l[0].path,l[0].status,l[0].code,l[0].message],['POST','/api/projects/x/launch/transaction',409,'not_cleared','An admin has not cleared it yet.']);
  assert.deepEqual([l[1].status,l[1].code],[0,'network']);
  // extra headers reach fetch (the read token for "My reports"); bodies are never recorded
  let seen=null;globalThis.fetch=async(p,init)=>{seen=init.headers;return new Response('{}',{status:200});};
  await api('/api/support/mine',{headers:{'x-support-token':'abc'}});assert.equal(seen['x-support-token'],'abc');
 }finally{globalThis.fetch=real;errorRing.clear();}
});

test('the launch flow note: merged, an error replaces the last, another project starts over',()=>{
 resetLaunchNote();
 noteLaunch({slug:'ramen',projectStatus:'launch_prepared',intentId:'li_1',step:'launch'});
 noteLaunch({step:'launch',message:'The simulation failed: 0x1772',code:'preflight_reject',httpStatus:400,at:7});
 noteLaunch({slug:'ramen',projectStatus:'launch_prepared',step:'launch'});   // a redraw keeps the error
 assert.deepEqual(launchNote(),{slug:'ramen',projectStatus:'launch_prepared',intentId:'li_1',step:'launch',message:'The simulation failed: 0x1772',code:'preflight_reject',httpStatus:400,at:7});
 noteLaunch({slug:'other',step:'approve'});
 assert.deepEqual(launchNote(),{slug:'other',step:'approve'});
 assert.equal(noteLaunch(null),launchNote());
 resetLaunchNote();assert.equal(launchNote(),null);
});

test('prefill: the Help button is blank; the PC errors carry the step and the words',()=>{
 assert.deepEqual(prefill(),{source:'help',category:'',message:'',step:null,error:null});
 const p=prefill({source:'launch_error',step:'launch',error:'  The simulation failed:\n0x1772 '});
 assert.equal(p.category,'launch');assert.equal(p.source,'launch_error');
 assert.equal(p.message,'I was on the "launch" step of the launch.\nIt said: "The simulation failed: 0x1772"\nWhat I did just before: ');
 assert.equal(prefill({source:'devbuy_error',step:'devbuy'}).category,'devbuy');
 assert.equal(prefill({source:'stepper'}).message.startsWith("I was launching from my room's PC."),true);
 assert.equal(prefill({source:'bogus',category:'x'}).source,'help');assert.equal(prefill({category:'x'}).category,'x');
 assert.equal(prefill({source:'launch_error',error:'e'.repeat(900)}).error.length,400);
});

test('the sheet model: category, 10–2000 characters, contact, no secrets; the body is what the server takes',()=>{
 const ctx={signedIn:false};
 assert.equal(sheetModel({message:'long enough text'}).problem,'Pick what it is about.');
 assert.match(sheetModel({category:'launch',message:'short'}).problem,/at least 10/);
 assert.match(sheetModel({category:'launch',message:'x '.repeat(1200)}).problem,/At most 2000/);
 assert.match(sheetModel({category:'x',message:'my X account will not connect',contact:'<b>me</b>'}).problem,/Contact/);
 assert.equal(sheetModel({category:'wallet',message:`my key is ${SECRET_KEY} please check`}).problem,SECRET_LINE);
 assert.equal(sheetModel({category:'wallet',message:'abandon ability able about above absent absorb abstract absurd abuse access accident'}).problem,SECRET_LINE);
 const ok=sheetModel({category:'launch',message:'  The launch button spins forever.  ',contact:' @me ',include:true,source:'launch_error'},ctx);
 assert.equal(ok.ok,true);
 assert.deepEqual(ok.body,{category:'launch',message:'The launch button spins forever.',source:'launch_error',contact:'@me',context:ctx});
 assert.equal(ok.count,`32 / ${MESSAGE_MAX}`);
 assert.equal(sheetModel({category:'launch',message:'The launch button spins forever.',include:false},ctx).body.context,null,'unticked: no context');
 assert.equal('contact' in sheetModel({category:'other',message:'something is off here'}).body,false);
 assert.equal(sheetModel({category:'other',message:'something',source:'evil'}).body.source,'help');
 for(const c of CATEGORY_IDS)assert.equal(sheetModel({category:c,message:'0123456789'}).ok,true);
});

test('secret detection: keys, keypair arrays, signed transactions, seed phrases; wallets and plain words pass',()=>{
 for(const s of [SECRET_KEY,JSON.stringify(Array.from({length:64},(_,i)=>i)),'A'.repeat(130),'f'.repeat(64),'sk-ant-api03-abcdefghijklmnop','private key: 4x...','seed phrase = lorem'])assert.equal(looksSecret(s),true,s.slice(0,30));
 for(const s of [WALLET,`Mint 6WCtKQfkWurd77tCCAYWuL5TwyAvuovTzworfnfupump failed with 0x1772 on step 2.`,'Phantom says: This dApp could be malicious. I did not sign.','It is a bit slow to load on my phone, is that normal?'])assert.equal(looksSecret(s),false,s.slice(0,30));
});

test('the context: short allow-listed fields, the launch note, the ring; shown as lines before sending',()=>{
 const ctx=buildContext({me:{user:{wallet:WALLET,role:'user'}},launch:{slug:'ramen',projectStatus:'launch_prepared',intentId:'li_1',step:'launch',message:'The simulation failed',code:'preflight_reject',httpStatus:400,at:9},
  errors:[{method:'POST',path:'/api/x?y=1',status:409,code:'conflict',message:'m',at:3,body:'secret body'}],bundle:'index-abc',userAgent:'UA '.repeat(200),viewport:'390x844@3',wallets:['Phantom','Solflare'],page:'room PC',language:'it-IT'});
 assert.deepEqual(Object.keys(ctx).sort(),['bundle','errors','language','launch','page','project','signedIn','userAgent','viewport','wallet','wallets']);
 assert.equal(ctx.wallet,WALLET);assert.deepEqual(ctx.project,{slug:'ramen',status:'launch_prepared'});
 assert.deepEqual(ctx.launch,{intentId:'li_1',step:'launch',code:'preflight_reject',message:'The simulation failed',httpStatus:400,at:9});
 assert.deepEqual(ctx.errors,[{at:3,method:'POST',path:'/api/x',status:409,code:'conflict',message:'m'}]);
 assert.equal(ctx.userAgent.length,300);
 assert.ok(!JSON.stringify(ctx).includes('secret body'));
 const lines=Object.fromEntries(contextLines(ctx));
 assert.equal(lines.Wallet,'8zsQ…mnBy (signed in)');
 assert.equal(lines.Launch,'step launch · li_1 · preflight_reject · The simulation failed');
 assert.equal(lines['Recent errors'],'POST /api/x → 409 conflict');
 assert.equal(lines['Wallet apps'],'Phantom, Solflare');
 const anon=buildContext({place:{slug:'mine',status:'open',name:'Mine'}});
 assert.deepEqual(anon,{signedIn:false,project:{slug:'mine',status:'open',name:'Mine'}});
 assert.equal(Object.fromEntries(contextLines(anon)).Wallet,'not signed in');
 assert.equal(Object.fromEntries(contextLines(anon))['Recent errors'],'none');
 assert.deepEqual(contextLines(null),[]);
 assert.equal(bundleOf('/assets/index-B9x_k2Qa.js'),'index-B9x_k2Qa');assert.equal(bundleOf('/src/main.js'),'dev');assert.equal(bundleOf(null),'dev');
});

test('read tokens: kept in localStorage (try/catch), deduplicated, at most 20, junk ignored',()=>{
 const s=memStore();
 assert.deepEqual(loadTokens(s),[]);
 assert.equal(saveToken('A'.repeat(32),s),true);assert.equal(saveToken('A'.repeat(32),s),true);
 assert.equal(saveToken('bad token!',s),false);assert.equal(saveToken(null,s),false);
 assert.deepEqual(loadTokens(s),['A'.repeat(32)]);
 for(let i=0;i<25;i++)saveToken(`tok_${String(i).padStart(20,'0')}`,s);
 const l=loadTokens(s);assert.equal(l.length,20);assert.equal(l.at(-1),`tok_${String(24).padStart(20,'0')}`);
 s.m.set(TOKENS_KEY,'{not json');assert.deepEqual(loadTokens(s),[]);
 s.m.set(TOKENS_KEY,JSON.stringify(['ok_'.padEnd(24,'x'),'<script>',42]));assert.deepEqual(loadTokens(s),['ok_'.padEnd(24,'x')]);
 const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
 assert.deepEqual(loadTokens(broken),[]);assert.equal(saveToken('B'.repeat(32),broken),false);
 assert.deepEqual(loadTokens(null),[]);
});

test('"My reports": newest first, status words, replies signed by SUBZERONE support',()=>{
 const now=1_000_000_000;
 const m=reportsModel({tickets:[{id:'sup_a',category:'launch',status:'open',message:'old',createdAt:now-7200e3,replies:[]},
  {id:'sup_b',category:'wallet',status:'answered',message:'new',createdAt:now-60e3,replies:[{from:'SUBZERONE support',text:'Try Phantom 24.x',at:now-30e3}]},
  {id:'sup_c',category:'nope',status:'weird',message:'x',createdAt:now-1},null,{nope:1}]},now);
 assert.deepEqual(m.map(t=>t.id),['sup_c','sup_b','sup_a']);
 assert.deepEqual([m[1].category,m[1].statusWord,m[1].answered,m[1].ago],['Wallet / Phantom','Answered',true,'just now']);
 assert.deepEqual(m[1].replies,[{from:'SUBZERONE support',text:'Try Phantom 24.x',ago:'just now'}]);
 assert.deepEqual([m[0].category,m[0].status,m[0].statusWord],['Other','open','Open']);
 assert.equal(m[2].ago,'2 h ago');
 assert.deepEqual(reportsModel(null),[]);assert.deepEqual(reportsModel({tickets:'x'}),[]);
 assert.equal(timeAgo(now-3*86400e3,now),'3 d ago');
 assert.match(SENT_LINE,/we read every report; you'll see the answer here/);
});

test('a guest can send a report: the sign-in gate lets POST /api/support through',()=>{
 assert.equal(gateReason('/api/support','POST'),null);assert.equal(gateReason('/api/support/mine','GET'),null);
 assert.equal(gateReason('/api/support/x/reply','POST'),'default');
});

test('the page: a Help button in the top bar, the support sheet, the PC report link only after an error',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 const top=html.slice(html.indexOf('<header class="topbar">'),html.indexOf('</header>'));
 assert.ok(top.includes('id="help-button"'),'Help is in the top bar');
 assert.ok(top.indexOf('id="help-button"')<top.indexOf('id="account-button"'),'before the wallet chip, not over it');
 assert.ok(html.includes('id="support-backdrop"')&&html.includes('id="support-body"')&&html.includes('id="support-tabs"'));
 assert.ok(html.includes('<symbol id="i-help"'));
 assert.match(css,/\.pc-err:empty\+\.pc-report\{display:none\}/);
 assert.match(css,/@media \(max-width:600px\)\{\n \.help-button\{width:40px;height:40px/);
 const desk=readFileSync(new URL('../src/desk.js',import.meta.url),'utf8');
 assert.ok((desk.match(/reportLink\(err/g)||[]).length>=4,'next to the launch, review, dev-buy errors');
 assert.ok(desk.includes("'sub01:support'"));
});
