import {profileKit} from '../src/desk-flows.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {deskModel,hasDesk,tabsFor,siteFor,screenCard,switcherItems,welcomeText,safeHref,SANDBOX,SCREEN_ITEMS} from '../src/desk.js';

const leak={slug:'horse',name:'HORSE',ticker:'$horse',stage:'preview_ready',stageLabel:'Preview ready for your review',progress:.65,launched:false,
 siteUrl:null,previewLink:'/preview/horse/1.2.abc/index.html',logoUrl:'/api/projects/horse/logo',x:{handle:'@horse_coin',status:'planned',posts:[{id:1,text:'gm',status:'draft'}]},
 pagePath:'/projects/horse',officePath:'/projects/horse/review'};
const live={slug:'melon',name:'Midnight Melon Bread Club',ticker:'MELON',stage:'launched',progress:1,launched:true,siteUrl:'http://melon.projects.localhost:8787/',
 x:{handle:'melonclub',status:'connected',url:'https://x.com/melonclub'},pagePath:'/projects/melon'};
const payload={projects:[leak,live,{name:'Ramen',slug:'ramen',stage:'building',progress:.4}],ideas:[{id:7,title:'Vending poet',status:'evaluating',stageLabel:'SUB-01 is reading it'}]};

test('owner vs visitor: owner-only fields never reach a visitor, even when the payload leaks them',()=>{
 const o=deskModel(payload,true),v=deskModel(payload,false);
 const oh=o.projects.find(p=>p.slug==='horse'),vh=v.projects.find(p=>p.slug==='horse');
 assert.equal(oh.previewLink,leak.previewLink);assert.equal(oh.officePath,'/projects/horse/review');assert.equal(oh.x.posts.length,1);assert.equal(o.ideas.length,1);
 assert.equal(vh.previewLink,null);assert.equal(vh.officePath,null);assert.deepEqual(vh.x.posts,[]);assert.deepEqual(v.ideas,[]);
 const told=deskModel({...payload,viewer:'visitor'},true);assert.equal(told.mine,false,"desk.viewer 'visitor' wins over the client's flag");assert.equal(told.projects[0].previewLink,null);
 assert.equal(oh.ticker,'HORSE');assert.equal(oh.x.handle,'horse_coin');
 assert.equal(deskModel({projects:[{...live,public:false}]},false).projects.length,0,'an explicitly private project is dropped for visitors');
 assert.equal(deskModel({projects:[{...live,public:false}]},true).projects.length,1);
});
test('tab availability matrix',()=>{
 const o=deskModel(payload,true),v=deskModel(payload,false),m=p=>o.projects.find(x=>x.slug===p);
 assert.deepEqual(tabsFor(o,m('horse')),['site','x','launch','ideas']);
 assert.deepEqual(tabsFor(v,v.projects[0]),['site','x','launch']);
 assert.deepEqual(tabsFor(o,null),['ideas'],'owner with no project: the mailbox');
 assert.deepEqual(tabsFor(deskModel({},false),null),[],'visitor with nothing to show');
 assert.equal(hasDesk(deskModel(null,true)),true);assert.equal(hasDesk(deskModel(null,false)),false);assert.equal(hasDesk(deskModel({projects:[live]},false)),true);
 assert.deepEqual(tabsFor(o,{...m('horse'),pagePath:null}),['site','x','ideas'],'no page, no launch tab');
});
test('site tab: the owner sees the preview, visitors the public site; empty state names the stage; sandbox strings',()=>{
 const o=deskModel(payload,true),v=deskModel(payload,false),horse=s=>s.projects.find(p=>p.slug==='horse');
 assert.equal(siteFor(horse(o),true).src,leak.previewLink);assert.equal(siteFor(horse(o),true).sandbox,'','the preview is framed like the review page');
 assert.equal(siteFor(o.projects[0],true).sandbox,'allow-popups allow-popups-to-escape-sandbox','public site: no scripts, popups escape');
 const vs=siteFor(horse(v),false);assert.equal(vs.src,null);assert.match(vs.empty,/SUB-01 hasn't built this yet\. Stage: Preview ready for your review\./);
 assert.equal(siteFor(o.projects[0],true).src,live.siteUrl,'no preview: fall back to the public site');
 assert.ok(!/allow-scripts|allow-same-origin/.test(SANDBOX.site+SANDBOX.preview),'static sites never get scripts or their origin');
 assert.ok(!/allow-top-navigation/.test(SANDBOX.page)&&/allow-scripts/.test(SANDBOX.page)&&/allow-popups-to-escape-sandbox/.test(SANDBOX.page));
});
test('URLs: only http(s) and same-origin paths survive',()=>{
 assert.equal(safeHref('javascript:alert(1)'),null);assert.equal(safeHref('//evil.example/x'),null);assert.equal(safeHref('data:text/html,hi'),null);
 assert.equal(safeHref('/projects/a'),'/projects/a');assert.equal(safeHref('https://x.com/a'),'https://x.com/a');
 const m=deskModel({projects:[{slug:'a',name:'A',siteUrl:'javascript:alert(1)',pagePath:'https://evil.example/',x:{status:'connected',handle:'a<b>'}}]},false).projects[0];
 assert.equal(m.siteUrl,null);assert.equal(m.pagePath,'/projects/a','pagePath must be a path; else rebuilt from the slug');assert.equal(m.x.url,'https://x.com/ab');
});
test('switcher ordering: launched first, then by progress; ideas after projects (owner only)',()=>{
 const o=deskModel(payload,true);
 assert.deepEqual(switcherItems(o).map(i=>i.key),['p:melon','p:horse','p:ramen','i:7']);
 assert.equal(switcherItems(o)[0].label,'Midnight Melon Bread Club · $MELON');
 assert.deepEqual(switcherItems(deskModel(payload,false)).map(i=>i.kind),['project','project','project']);
});
test('screen card text and welcome bubble',()=>{
 const o=deskModel(payload,true);
 assert.deepEqual(screenCard(o.projects[0],true),{title:'Midnight Melon Bread Club',ticker:'$MELON',stage:'Live · launched',progress:1,kind:'project'});
 assert.equal(screenCard(o.projects[1],true).stage,'Preview ready for your review');
 assert.equal(screenCard(o.projects[2],true).stage,'building','stage words when the label is missing');
 assert.equal(screenCard(null,true).title,'Drop an idea');assert.equal(screenCard(null,false).title,'SUBZERONE');
 assert.equal(welcomeText({mine:true,name:'Nao',model:o}),'Welcome home, Nao. Your office is on the computer.');
 assert.equal(welcomeText({mine:false,name:'Nao',model:o}),"You are visiting Nao. Tap the computer to see Nao's project.");
 assert.equal(welcomeText({mine:false,name:'Nao',model:deskModel(null,false)}),'You are visiting Nao.');
 assert.deepEqual([...SCREEN_ITEMS],['computerScreen','laptop','televisionModern']);
});

// ---------------------------------------------------------------- the Launch tab's stepper, review card, X states (desk-flows.js)
import {launchSteps,reviewModel,xModel,xChip,explainError,solText,splitRows} from '../src/desk.js';
const ME_OWNER={user:{wallet:'OWNERwallet111111111111111111111111111111111',role:'user'}};
const ME_REV={user:{wallet:'REVIEWERwallet1111111111111111111111111111',role:'reviewer'}};
const alloc={id:'alloc_1',status:'draft',mode:'sharing_config',statement:'I approve this split…',recipients:[{label:'Idea submitter',role:'submitter',wallet:ME_OWNER.user.wallet,bps:8000},{label:'SUB-01',role:'sub01',wallet:'SUB01wallet',bps:2000}]};
const view=(status,extra={})=>({slug:'ramen',status,owner:true,submittedBy:ME_OWNER.user.wallet,visibility:'public',liveSiteVersion:2,requireAdminClearance:true,submitterApprovedAt:null,adminClearedAt:null,allocation:alloc,ideaId:'idea_1',...extra});
const states=m=>m.steps.map(s=>s.state).join(' ');
test('launchSteps: loading, building, preview (approve), waiting for the reviewer, prepared, signing, confirming, live, stopped',()=>{
 const none=launchSteps(null,ME_OWNER);assert.equal(none.loading,true);assert.deepEqual(none.steps,[]);
 const b=launchSteps(view('generating'),ME_OWNER);assert.equal(b.current,'site');assert.equal(states(b),'current todo todo todo todo');assert.match(b.steps[0].line,/building/);assert.equal(b.steps[0].action,null);
 const p=launchSteps(view('preview_ready'),ME_OWNER);assert.equal(p.current,'approve');assert.equal(states(p),'done current todo todo todo');
 assert.deepEqual(p.steps[0].action,{id:'preview',label:'Open the site preview',enabled:true});assert.deepEqual(p.steps[1].action,{id:'approve',label:'Approve site + split',enabled:true});
 assert.deepEqual(p.split.rows.map(r=>[r.role,r.pct,r.wallet]),[['submitter','80%',ME_OWNER.user.wallet],['sub01','20%','SUB01wallet']]);assert.equal(p.split.locked,true);
 assert.deepEqual(p.approve,{allocationId:'alloc_1',statement:'I approve this split…',siteVersion:2,ideaId:'idea_1'});assert.equal(p.steps[2].action,null,'the author never clears');
 const priv=launchSteps(view('preview_ready',{visibility:'private'}),ME_OWNER);assert.match(priv.steps[1].line,/also makes the idea public/);assert.equal(priv.publicIdea,false);
 const noSplit=launchSteps(view('preview_ready',{allocation:null}),ME_OWNER);assert.equal(noSplit.steps[1].action.enabled,false);assert.match(noSplit.steps[1].line,/not drafted/);
 const visitor=launchSteps(view('preview_ready',{owner:false,allocation:undefined}),null);assert.equal(visitor.steps[1].action.enabled,false);assert.equal(visitor.owner,false);
 const w=launchSteps(view('preview_ready',{submitterApprovedAt:1}),ME_OWNER);assert.equal(w.current,'clear');assert.equal(states(w),'done done current todo todo');assert.match(w.steps[2].line,/Waiting for a SUBZERONE reviewer/);assert.equal(w.steps[1].action,null);
 const rev=launchSteps(view('preview_ready',{submitterApprovedAt:1,owner:false}),ME_REV);assert.deepEqual(rev.steps[2].action,{id:'clear',label:'Clear for launch',enabled:true});assert.equal(rev.staff,true);
 const revOwn=launchSteps(view('preview_ready',{submitterApprovedAt:1,submittedBy:ME_REV.user.wallet}),ME_REV);assert.equal(revOwn.steps[2].action,null);assert.match(revOwn.steps[2].line,/not of your own project/);
 const early=launchSteps(view('preview_ready',{owner:false}),ME_REV);assert.equal(early.steps[2].action?.id,'clear','a reviewer may clear before the author approves');assert.equal(early.steps[2].state,'todo');
 const noClear=launchSteps(view('preview_ready',{requireAdminClearance:false}),ME_OWNER);assert.equal(noClear.steps[2].state,'done');assert.match(noClear.steps[2].line,/Not required/);
 const a=launchSteps(view('approved',{submitterApprovedAt:1,adminClearedAt:1}),ME_OWNER);assert.equal(a.current,'launch');assert.equal(a.phase,'preparing');assert.equal(states(a),'done done done current todo');assert.equal(a.steps[3].action,null);
 const lp=launchSteps(view('launch_prepared',{submitterApprovedAt:1,adminClearedAt:1,launchConfig:{mock:true,feeSharing:{locked:true,recipients:alloc.recipients}},intent:{status:'expired',error:'blockhash expired before the transaction landed'}}),ME_OWNER);
 assert.equal(lp.phase,'prepare');assert.deepEqual(lp.steps[3].action,{id:'prepare',label:'Prepare the transaction',enabled:true});assert.match(lp.steps[3].note,/Last attempt: blockhash expired/);assert.equal(lp.mock,true);assert.match(lp.steps[3].line,/MOCK/);
 const real=launchSteps(view('launch_prepared',{launchConfig:{mock:false,network:'mainnet'}}),ME_OWNER);assert.match(real.steps[3].line,/review it here before the wallet opens/);assert.equal(real.mock,false);
 const s=launchSteps(view('awaiting_signature',{intent:{status:'awaiting_signature'}}),ME_OWNER);assert.equal(s.phase,'resume');assert.equal(s.steps[3].action.id,'resume');
 const c=launchSteps(view('confirming',{intent:{status:'submitted',tx_signature:'5xx'}}),ME_OWNER);assert.equal(c.phase,'confirming');assert.match(c.steps[3].line,/Confirming/);
 const live=launchSteps(view('launched',{launch:{mint:'M1NT',network:'mainnet',explorerTx:'https://solscan.io/tx/5xx',explorerToken:'https://solscan.io/token/M1NT'},siteUrl:'https://ramen.projects.subzerone.live/',ledger:{verifiedAccruedLamports:1500000000,confirmedPayoutsLamports:250000000,locked:true}}),ME_OWNER);
 assert.equal(live.current,'live');assert.equal(states(live),'done done done done current');assert.equal(live.phase,'done');
 assert.deepEqual(live.live,{mint:'M1NT',network:'mainnet',explorerTx:'https://solscan.io/tx/5xx',explorerToken:'https://solscan.io/token/M1NT',pumpfun:'https://pump.fun/coin/M1NT',site:'https://ramen.projects.subzerone.live/',ledger:'Creator fees: 1.5 SOL accrued · 0.25 SOL paid out · split locked.'});
 const mockLive=launchSteps(view('launched',{launch:{mint:'MOCKabc',network:'mock'},ledger:{verifiedAccruedLamports:null}}),ME_OWNER);assert.equal(mockLive.live.pumpfun,null);assert.match(mockLive.steps[4].line,/MOCK/);assert.match(mockLive.live.ledger,/nothing observed/);
 const f=launchSteps(view('failed',{statusNote:'landed on-chain but did not match'}),ME_OWNER);assert.equal(f.steps[3].state,'blocked');assert.equal(f.current,'launch');assert.match(f.steps[3].line,/did not match/);
 const d=launchSteps(view('declined'),ME_OWNER);assert.equal(d.current,'stopped');assert.equal(d.stopped,true);assert.equal(d.steps[0].state,'blocked');
 assert.equal(launchSteps({status:'preview_ready'},{user:{role:'admin'}}).staff,true);assert.equal(launchSteps({},{}).staff,false);
});
test('reviewModel: the server review drives Sign; a foreign payer or a non-launch program disables it in red',()=>{
 const me=ME_OWNER.user.wallet,v=view('launch_prepared',{launchConfig:{feeSharing:{locked:true,recipients:alloc.recipients},initialBuyLamports:0}});
 const good={network:'mainnet',feePayer:me,mint:'M1NT',txBase64:'AQID',programs:[{id:'6EF8',name:'pump.fun (bonding curve)',direct:true},{id:'pfee',name:'pump.fun fee sharing',direct:true},{id:'Tokenz',name:'Token-2022',direct:false}],
  accountsWritable:9,signers:2,launchProgramsOnly:true,estimate:{networkFeeLamports:10000,accountsLamports:20000000,simulation:{ok:true},signerBalanceLamports:3e9},txBytes:1100,lastValidBlockHeight:500};
 const r=reviewModel(good,v,me);assert.equal(r.canSign,true);assert.equal(r.you,true);assert.equal(r.flagged,false);assert.deepEqual(r.warnings,[]);assert.equal(r.network,'mainnet');
 assert.deepEqual(r.programs.map(p=>[p.name,p.direct,p.flag]),[['pump.fun (bonding curve)',true,false],['pump.fun fee sharing',true,false],['Token-2022',false,false]]);
 assert.deepEqual(r.cost,{fee:'0.00001 SOL',rent:'0.02 SOL',buy:null,buyMax:null,total:'0.02001 SOL',simulated:true,balance:'3 SOL'});assert.equal(r.writable,9);assert.equal(r.signers,2);
 assert.deepEqual(r.split.rows.map(x=>x.pct),['80%','20%']);assert.equal(r.split.locked,true);assert.match(r.doesNot.join(' '),/No initial buy.*network fee and the rent/);
 const foreign=reviewModel({...good,feePayer:'SOMEONEelse'},v,me);assert.equal(foreign.canSign,false);assert.equal(foreign.you,false);assert.match(foreign.warnings[0],/not your signed-in wallet/);
 const rogue=reviewModel({...good,launchProgramsOnly:false,programs:[...good.programs,{id:'Drain111',name:'unknown program',direct:true}]},v,me);
 assert.equal(rogue.canSign,false);assert.equal(rogue.flagged,true);assert.equal(rogue.programs.at(-1).flag,true);assert.match(rogue.warnings[0],/not part of a launch/);
 const sneaky=reviewModel({...good,launchProgramsOnly:false,programs:[{id:'x',name:'SPL Token',direct:true}]},v,me);assert.equal(sneaky.programs[0].flag,true,'a known but non-launch program called directly is red');
 const sim=reviewModel({...good,estimate:{simulation:{ok:false,err:'insufficient funds'}}},v,me);assert.equal(sim.canSign,false);assert.match(sim.warnings[0],/simulation failed: insufficient funds/);assert.equal(sim.cost.total,'unknown');
 const mock=reviewModel({network:'mock',feePayer:me,mint:'MOCK1',mock:true,messageHash:'abcd',programs:[{id:'MockLaunch',name:'MockLaunch',direct:true}],accountsWritable:0,signers:1,launchProgramsOnly:true,estimate:{networkFeeLamports:0,accountsLamports:0,simulation:{ok:true,mock:true}},resumed:true},v,me);
 assert.equal(mock.canSign,true);assert.equal(mock.mock,true);assert.equal(mock.resumed,true);assert.equal(mock.cost.total,'0 SOL');assert.equal(mock.cost.simulated,false);assert.match(mock.doesNot.at(-1),/text message/);
 const buy=reviewModel(good,view('launch_prepared',{launchConfig:{initialBuyLamports:5e8}}),me);assert.equal(buy.cost.buy,'0.5 SOL');assert.equal(buy.cost.total,'0.52001 SOL');assert.match(buy.doesNot[2],/dev buy of 0.5 SOL is included/);
 assert.equal(reviewModel(null,v,me),null);assert.equal(reviewModel({...good,txBase64:''},v,me).canSign,false,'nothing to sign');
 assert.equal(solText(0),'0 SOL');assert.equal(solText(1234567),'0.001235 SOL');assert.equal(solText('x'),null);assert.deepEqual(splitRows(null).rows,[]);
});
test('xModel: none, planned (+unconfigured server), connected with drafts, revoked; visitors see no posts',()=>{
 const none=xModel({x:null,xConfigured:true},true);assert.equal(none.state,'none');assert.equal(xChip(none),null);assert.match(none.note,/plans the X account/);
 const x={planned_handle:'@ramen_radar',planned_bio:'Late-night ramen, one bowl at a time.',status:'planned',x_handle:null,posts:[{id:'xp1',kind:'launch',text:'gm',status:'draft'}]};
 const pl=xModel({x,xConfigured:true},true);assert.equal(pl.state,'planned');assert.equal(pl.handle,'ramen_radar');assert.equal(pl.bio,x.planned_bio);assert.equal(pl.url,null);assert.equal(pl.canConnect,true);
 assert.equal(pl.howto.length,3);assert.match(pl.howto[0],/x\.com by hand, with the handle @ramen_radar/);assert.match(pl.howto[1],/Connect/);assert.equal(pl.posts[0].canApprove,false,'no approving before X is connected');assert.equal(pl.posts[0].canEdit,true);
 assert.deepEqual(xChip(pl),{text:'@ramen_radar · planned',cls:'is-planned'});
 const off=xModel({x,xConfigured:false},true);assert.equal(off.canConnect,false);assert.match(off.note,/not connected to this server yet/);
 const con=xModel({x:{...x,status:'connected',x_handle:'RamenRadarJP',posts:[...x.posts,{id:'xp2',text:'posted!',status:'published'},{id:'xp3',text:'oops',status:'failed',error:'403 from X'},{id:'xp4',text:'q',status:'approved'}]},xConfigured:true},true);
 assert.equal(con.state,'connected');assert.equal(con.handle,'RamenRadarJP');assert.equal(con.url,'https://x.com/RamenRadarJP');assert.deepEqual(con.howto,[]);assert.equal(con.canConnect,false);assert.match(con.note,/SUB-01 writes, you approve, he posts/);
 assert.deepEqual(con.posts.map(q=>[q.id,q.status,q.canApprove,q.canEdit]),[['xp1','draft',true,true],['xp2','published',false,false],['xp3','failed',true,true],['xp4','approved',false,false]]);assert.equal(con.posts[2].error,'403 from X');
 assert.deepEqual(xChip(con),{text:'@RamenRadarJP · connected',cls:'is-connected'});
 const rv=xModel({x:{...x,status:'revoked'},xConfigured:true},true);assert.equal(rv.state,'revoked');assert.equal(rv.canConnect,true);assert.match(rv.note,/disconnected/);assert.equal(xChip(rv).cls,'is-off');
 const vis=xModel({x:{...x,status:'connected',x_handle:'RamenRadarJP'},xConfigured:true},false);assert.deepEqual(vis.posts,[]);assert.equal(vis.canConnect,false);assert.equal(vis.note,'The project posts on X.');
 assert.equal(xModel(null,false).state,'none');
});
test('explainError: 429 retry-after, the 409 reasons, wallet errors pass through',()=>{
 const e=(status,error,message,extra={})=>({status,body:{error,message,...extra}});
 assert.equal(explainError(e(429,'rate_limited','slow down a little',{retryAfterS:12})),'Slow down: try again in 12 s.');
 assert.match(explainError(e(409,'sub01_wallet_missing','…')),/SUB-01's fee wallet is not configured/);
 assert.equal(explainError(e(409,'bad_state','idea is awaiting_signature')),'Not now: the idea is awaiting signature.');
 assert.match(explainError(e(409,'private','…')),/Publish the idea first/);assert.match(explainError(e(409,'previous_open','…')),/could still land/);assert.match(explainError(e(403,'own_project','…')),/own project/);
 assert.match(explainError(e(503,'paused','…')),/paused/);assert.match(explainError(e(503,'x_not_configured','…')),/not connected to this server/);assert.match(explainError(e(400,'rejected','…')),/rejected the transaction/);
 assert.equal(explainError(e(401,'sign_in','connect and sign in')),'Sign in with your wallet first.');assert.equal(explainError(e(500,'oops','')),'The server could not answer. Try again in a moment.');
 assert.equal(explainError(e(409,'something_new','the server says so')),'the server says so');assert.equal(explainError(Object.assign(new Error('Cancelled in the wallet.'),{rejected:true})),'Cancelled in the wallet.');
 assert.equal(explainError(Object.assign(new Error('no raw sign'),{unsupported:true})),'no raw sign');assert.ok(explainError(null));
});

test('profileKit: logo + header files and bio/site texts for the owner; nothing without a logo',()=>{
 const p={slug:'ramen',logoUrl:'/meta/ramen/logo-v1.png',bannerUrl:'/meta/ramen/banner-v1.svg',siteUrl:'https://ramen.projects.subzerone.live/'};
 const kit=profileKit(p,{bio:'Ramen radar for Tokyo nights'});
 assert.deepEqual(kit.files.map(f=>[f.kind,f.name,!!f.render]),[['logo','ramen-logo.png',false],['header','ramen-header.png',true]]);
 assert.deepEqual(kit.files[1].render,{w:1500,h:500});
 assert.deepEqual(kit.texts.map(t=>t.label),['Bio','Website']);
 assert.equal(profileKit({slug:'x',logoUrl:null},{bio:'b'}),null);
 assert.deepEqual(profileKit({slug:'x',logoUrl:'/meta/x/logo-v1.png'},{}).texts,[]);
});

// ---------------------------------------------------------------- the dev buy (desk-flows.js devBuyModel/parseDevBuy, desk.js renderDevBuy)
import {devBuyModel,parseDevBuy,renderDevBuy,showDevBuyOn} from '../src/desk.js';
const OPTS={initialBuyLamports:0,maxInitialBuyLamports:5e9,locked:false,editable:true};
test('devBuyModel: owner from the approve step on; cap from the server (never above 5); locked while a transaction exists',()=>{
 assert.equal(devBuyModel(null),null);assert.equal(devBuyModel(view('preview_ready',{launchOptions:OPTS}))?.editable,true,'settable from the approve step (preview_ready) on');assert.equal(devBuyModel(view('generating',{launchOptions:OPTS})),null,'not while SUB-01 builds');
 assert.equal(devBuyModel(view('launch_prepared')),null,'no launchOptions (visitor payload)');assert.equal(devBuyModel(view('launch_prepared',{owner:false,launchOptions:OPTS})),null);
 const a=devBuyModel(view('approved',{launchOptions:OPTS}));assert.deepEqual([a.sol,a.text,a.max,a.step,a.locked,a.editable,a.reprepares],[0,'0 SOL',5,0.01,false,true,false]);assert.match(a.note,/at most 5 SOL/);assert.equal(a.lockNote,'');
 const lp=devBuyModel(view('launch_prepared',{launchOptions:{...OPTS,initialBuyLamports:250000000,maxInitialBuyLamports:2e9}}));assert.deepEqual([lp.sol,lp.text,lp.max,lp.reprepares],[0.25,'0.25 SOL',2,true]);
 assert.equal(devBuyModel(view('launch_prepared',{launchOptions:{...OPTS,maxInitialBuyLamports:50e9}})).max,5,'the client cap is 5 whatever the server says');
 const s=devBuyModel(view('awaiting_signature',{launchOptions:{...OPTS,initialBuyLamports:1e7,locked:true,editable:false}}));assert.deepEqual([s.locked,s.editable,s.text],[true,false,'0.01 SOL']);assert.match(s.lockNote,/Cancel the transaction/);
 const c=devBuyModel(view('confirming',{launchOptions:OPTS}));assert.equal(c.locked,true);assert.match(c.lockNote,/in flight/);
 assert.equal(devBuyModel(view('launched',{launchOptions:OPTS})),null);
 assert.deepEqual(parseDevBuy(''),{sol:0});assert.deepEqual(parseDevBuy('0,5'),{sol:0.5});assert.deepEqual(parseDevBuy(0.123456789123),{sol:0.123456789});
 assert.match(parseDevBuy('0.0005').error,/At least 0.001 SOL, or 0 for no buy/);assert.deepEqual(parseDevBuy('0.001'),{sol:0.001});
 assert.match(parseDevBuy('-1').error,/0 or more/);assert.match(parseDevBuy('abc').error,/amount of SOL/);assert.match(parseDevBuy('5.01').error,/At most 5 SOL/);assert.match(parseDevBuy(3,2).error,/At most 2 SOL/);
});
test('reviewModel: the dev buy is its own row, in the total and in the plain-words lines; the ATA program is green',()=>{
 const me=ME_OWNER.user.wallet,v=view('launch_prepared',{launchConfig:{feeSharing:{locked:true,recipients:alloc.recipients},initialBuyLamports:1e7}});
 const tx={network:'devnet',feePayer:me,mint:'M1NT',txBase64:'AQID',programs:[{id:'6EF8',name:'pump.fun (bonding curve)',direct:true},{id:'pfee',name:'pump.fun fee sharing',direct:true},{id:'AToken',name:'Associated Token Account',direct:true},{id:'Tokenz',name:'Token-2022',direct:false},{id:'Tokenkeg',name:'SPL Token',direct:false}],
  accountsWritable:14,signers:2,launchProgramsOnly:true,estimate:{networkFeeLamports:10000,accountsLamports:20000000,initialBuyLamports:1e7,initialBuyMaxLamports:10500000,simulation:{ok:true},signerBalanceLamports:1e9},txBytes:1186};
 const r=reviewModel(tx,v,me);assert.equal(r.canSign,true);assert.equal(r.flagged,false);assert.deepEqual(r.programs.map(p=>p.flag),[false,false,false,false,false]);
 assert.deepEqual(r.cost,{fee:'0.00001 SOL',rent:'0.02 SOL',buy:'0.01 SOL',buyMax:'0.0105 SOL',total:'0.03001 SOL',simulated:true,balance:'1 SOL'});
 assert.match(r.doesNot[2],/dev buy of 0\.01 SOL is included.*tokens land in your wallet/);assert.match(r.doesNot[3],/network fee, the rent.*and the dev buy \(capped at 0\.0105 SOL/);
 // resumed intent: no estimate, the configuration's value counts; no buy: the old lines
 const resumed=reviewModel({...tx,estimate:null,resumed:true},v,me);assert.equal(resumed.cost.buy,'0.01 SOL');assert.equal(resumed.cost.buyMax,null);assert.equal(resumed.cost.total,'unknown');
 const none=reviewModel({...tx,estimate:{...tx.estimate,initialBuyLamports:0}},v,me);assert.equal(none.cost.buy,null);assert.equal(none.doesNot[2],'No initial buy.');assert.match(none.doesNot[3],/only SOL that leaves/);
 assert.equal(reviewModel({...tx,programs:[{id:'AToken',name:'Associated Token Account',direct:true}],launchProgramsOnly:false},v,me).canSign,false,'the server verdict still rules');
});
test('renderDevBuy: the field carries min/max/step/value, is disabled with the reason when locked, and Save sends what was typed',async()=>{
 // the smallest DOM the field needs
 class El{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.classList={toggle(){}};this.textContent='';}
  append(...k){for(const c of k){if(c==null||c===false)throw new Error('append(null)');this.children.push(typeof c==='string'?{text:c}:c);}}
  setAttribute(k,v){this.attrs[k]=v;}
  all(){const out=[],walk=n=>{for(const c of n.children||[]){out.push(c);walk(c);}};walk(this);return out;}
  find(tag){return this.all().find(c=>c.tagName===tag.toUpperCase());}}
 globalThis.document={createElement:t=>new El(t),createElementNS:(_ns,t)=>new El(t)};
 try{
  const m=devBuyModel(view('launch_prepared',{launchOptions:{...OPTS,initialBuyLamports:250000000,maxInitialBuyLamports:2e9}}));
  const saved=[];const box=renderDevBuy(m,{onSave:async sol=>{saved.push(sol);}});
  const input=box.find('input'),button=box.find('button');
  assert.equal(box.className,'pc-devbuy');assert.deepEqual([input.type,input.min,input.max,input.step,input.value,input.disabled],['number','0','2','0.01','0.25',false]);assert.equal(input.attrs['aria-label'],'Dev buy in SOL');
  assert.equal(button.disabled,false);assert.match(box.children[1].textContent,/Optional: SOL you spend on your own coin/);
  input.value='0.5';await button.onclick();assert.deepEqual(saved,[0.5]);assert.equal(box.children[2].textContent,'');
  input.value='9';await button.onclick();assert.deepEqual(saved,[0.5],'over the cap: not sent');assert.match(box.children[2].textContent,/At most 2 SOL/);
  const locked=renderDevBuy(devBuyModel(view('awaiting_signature',{launchOptions:{...OPTS,initialBuyLamports:1e7,locked:true,editable:false}})),{});
  assert.equal(locked.className,'pc-devbuy is-locked');assert.equal(locked.find('input').disabled,true);assert.equal(locked.find('button').disabled,true);assert.match(locked.children[1].textContent,/0\.01 SOL · Cancel the transaction to change it\./);
 }finally{delete globalThis.document;}
});
test('showDevBuyOn: on the open step while editable (approve, clearance wait, launch); read-only on launch once a transaction exists; never on live or under the review card',()=>{
 const ed={editable:true,locked:false},ro={editable:false,locked:true};
 assert.deepEqual(['site','approve','clear','launch','live'].map(id=>showDevBuyOn(ed,id)),[false,true,true,true,false]);
 assert.deepEqual(['approve','clear','launch','live'].map(id=>showDevBuyOn(ro,id)),[false,false,true,false]);
 assert.equal(showDevBuyOn(ed,'launch',true),false,'the review card carries the row');assert.equal(showDevBuyOn(null,'approve'),false);
});
