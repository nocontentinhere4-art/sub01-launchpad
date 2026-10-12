import {appModel,appSetCopy,appSetField,appAddField,appRemoveField,appSetSchedule,appSetCard,appProblem,appPayload,appInboxRows} from '../src/desk-flows.js';
import {devBuyTwoStep,devBuyNote,tokensText} from '../src/desk-flows.js';
import {profileKit,stepIndex,toolsModel,toggleTool,setField,toolsProblem,toolsPayload,toolsCount,trustCount,TOOL_MAX,TRUST_GROUP} from '../src/desk-flows.js';
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
 assert.equal(siteFor(o.projects[0],true).sandbox,'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads','public site: the kit runs on the site\'s own origin, popups escape, downloads work');
 const vs=siteFor(horse(v),false);assert.equal(vs.src,null);assert.match(vs.empty,/SUB-01 hasn't built this yet\. Stage: Preview ready for your review\./);
 assert.equal(siteFor(o.projects[0],true).src,live.siteUrl,'no preview: fall back to the public site');
 assert.ok(!/allow-top-navigation|allow-forms|allow-modals/.test(SANDBOX.site),'no top navigation, forms or modals for a coin site');assert.equal(SANDBOX.preview,'','the preview stays static');
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
 const noClear=launchSteps(view('preview_ready',{requireAdminClearance:false}),ME_OWNER);assert.deepEqual(noClear.steps.map(s=>s.id),['site','approve','launch','live'],'no reviewer step when the server does not require it');assert.equal(stepIndex('launch',noClear.steps),2,'steps shown are numbered 1-4');
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

// ---------------------------------------------------------------- site tools (Site tab, owner)
const CATALOG={token:{name:'Token panel',line:'Live price…',kind:'generic',lib:'qrcode',fields:[]},
 wall:{name:'Community wall',line:'Anyone posts…',kind:'generic',fields:[{key:'title',label:'Title',type:'text',max:60},{key:'holdersOnly',label:'Holders only',type:'bool'}]},
 poll:{name:'Poll',line:'One question…',kind:'generic',fields:[{key:'question',label:'Question',type:'text',max:120},{key:'options',label:'Answers (2–4)',type:'options',max:40,min:2,count:4},{key:'holdersOnly',label:'Holders only',type:'bool'}]},
 drop:{name:'Drop box',line:'Private…',kind:'generic',fields:[{key:'title',label:'Title',type:'text',max:60},{key:'prompt',label:'Prompt',type:'text',max:160},{key:'revealJst',label:'Reveal time (JST)',type:'time'},{key:'autoPick',label:'Pick',type:'bool'}]},
 event:{name:'Next event',line:'Countdown…',kind:'generic',fields:[{key:'title',label:'Event',type:'text',max:80},{key:'daily',label:'Every day at (JST)',type:'time'},{key:'at',label:'Or once on (JST)',type:'datetime'},{key:'link',label:'Link',type:'url',max:200}]},
 map:{name:'Map of places',line:'A map…',kind:'extra',lib:'leaflet',fields:[{key:'title',label:'Title',type:'text',max:60},{key:'community',label:'Visitors can pin',type:'bool'}]},
 game:{name:'Mini-game',line:'Catch…',kind:'extra',lib:'kaplay',fields:[{key:'title',label:'Title',type:'text',max:60}]},
 chart:{name:'Price chart',line:'Price…',kind:'extra',lib:'uplot',fields:[{key:'title',label:'Title',type:'text',max:60},{key:'range',label:'Range',type:'choice',choices:['24h','7d']}]}};
const TOOLS_VIEW={editable:true,lockedNote:null,catalog:CATALOG,libs:{leaflet:{name:'Leaflet'},kaplay:{name:'KAPLAY'},uplot:{name:'uPlot'},qrcode:{name:'qrcode-generator'}},holderChecks:false,
 tools:[{id:'token',config:{}},{id:'drop',config:{title:'Drop your confession',prompt:'Drop your confession.',revealJst:'23:00',autoPick:true}},{id:'map',config:{title:'The map',community:true}}],
 inbox:{drop:[{id:'drp_1',text:'I ate the last onigiri',at:1,hidden:false,featured:false},{id:'drp_2',text:'<b>x</b>',at:2,featured:true,featuredBy:'rule:daily'}],wall:[{id:'wal_1',text:'gm',hidden:true}],map:[],poll:null}};

test('toolsModel: catalog rows with the switches and the saved fields; generic first; the inbox; the holder note; defensive',()=>{
 const m=toolsModel(TOOLS_VIEW);
 assert.deepEqual(m.rows.map(r=>[r.id,r.on]),[['token',true],['wall',false],['poll',false],['drop',true],['event',false],['map',true],['game',false],['chart',false]]);
 assert.equal(m.rows.find(r=>r.id==='map').lib,'Leaflet');
 assert.deepEqual(m.rows.find(r=>r.id==='drop').fields.map(f=>f.value),['Drop your confession','Drop your confession.','23:00',true]);
 assert.deepEqual(m.rows.find(r=>r.id==='poll').fields[1].value,['','','',''],'four empty answer boxes');
 assert.deepEqual(m.inbox.drop.map(e=>[e.id,e.featured,e.featuredBy]),[['drp_1',false,null],['drp_2',true,'rule:daily']]);
 assert.equal(m.inbox.drop[1].text,'<b>x</b>','text stays text (drawn with textContent)');
 assert.equal(m.inbox.wall[0].hidden,true);
 assert.match(m.holderNote,/any wallet that signs can take part/);
 assert.equal(toolsModel({...TOOLS_VIEW,holderChecks:true}).holderNote,'');
 for(const bad of [null,undefined,'x',{},{catalog:null},{catalog:{token:null},tools:'all'}])assert.doesNotThrow(()=>toolsModel(bad));
 assert.equal(toolsModel(null).loading,true);assert.deepEqual(toolsModel({catalog:{token:null},tools:'all'}).rows,[]);
});

test('toggleTool / setField / toolsProblem: one extra at a time, at most six, the poll needs a question and two answers',()=>{
 let rows=toolsModel(TOOLS_VIEW).rows;
 rows=toggleTool(rows,'game',true);
 assert.deepEqual(rows.filter(r=>r.kind==='extra'&&r.on).map(r=>r.id),['game'],'switching an extra on switches the other one off');
 rows=toggleTool(rows,'poll',true);
 assert.equal(toolsProblem(rows),'Poll: write the question.');
 rows=setField(rows,'poll','question','Best snack?');rows=setField(rows,'poll','options','Onigiri',0);
 assert.equal(toolsProblem(rows),'Poll: at least two answers.');
 rows=setField(rows,'poll','options','onigiri',1);assert.equal(toolsProblem(rows),'Poll: the answers must differ.');
 rows=setField(rows,'poll','options','Oden',1);assert.equal(toolsProblem(rows),'');
 rows=toggleTool(rows,'event',true);rows=setField(rows,'event','daily','25:00');
 assert.match(toolsProblem(rows),/Next event: Every day at \(JST\) is a time like 23:00/);
 rows=setField(rows,'event','daily','');rows=setField(rows,'event','link','http://x.com/a');assert.match(toolsProblem(rows),/link starts with https/);
 rows=setField(rows,'event','link','');rows=toggleTool(rows,'wall',true);
 assert.equal(toolsCount(rows),6);assert.equal(toolsProblem(rows),'');
 const many=rows.map(r=>({...r,on:true}));
 assert.ok(toolsCount(many)>TOOL_MAX);assert.match(toolsProblem(many),/At most 6 tools/);
 assert.match(toolsProblem(rows.map(r=>({...r,on:r.id==='token'||r.kind==='extra'}))),/One idea-specific tool at a time/);
});

test('holder tools (kind trust): their own group after the extras, never counted toward the six, saved like any tool',()=>{
 const TRUST=['trades','holders','devwatch','fees','alerts'];
 const view={...TOOLS_VIEW,catalog:{...CATALOG,...Object.fromEntries(TRUST.map(id=>[id,{name:id,line:'chain',kind:'trust',fields:[]}]))},
  tools:[...TOOLS_VIEW.tools,...TRUST.map(id=>({id,config:{}}))]};
 let rows=toolsModel(view).rows;
 assert.deepEqual(rows.map(r=>r.kind),[...Array(5).fill('generic'),...Array(3).fill('extra'),...Array(5).fill('trust')]);
 assert.deepEqual(rows.filter(r=>r.kind==='trust').map(r=>[r.id,r.on]),TRUST.map(id=>[id,true]));
 for(const id of ['wall','poll','event'])rows=toggleTool(rows,id,true);
 rows=setField(rows,'poll','question','Best snack?');rows=setField(rows,'poll','options','Onigiri',0);rows=setField(rows,'poll','options','Oden',1);
 assert.deepEqual([toolsCount(rows),trustCount(rows)],[6,5],'six site tools plus the five chain tools');
 assert.equal(toolsProblem(rows),'','eleven switches on: still fine');
 assert.match(toolsProblem(toggleTool(rows,'game',false).map(r=>r.id==='chart'?{...r,on:true}:r).map(r=>r.kind==='generic'||r.id==='chart'?{...r,on:true}:r)),/^At most 6 tools on one site/);
 assert.equal(toolsProblem(toggleTool(rows,'fees',false)),'');assert.equal(trustCount(toggleTool(rows,'fees',false)),4);
 assert.deepEqual(toolsPayload(rows).tools.map(t=>t.id).slice(-5),TRUST,'the chain tools are saved with the rest');
 assert.equal(toolsModel({...view,catalog:{...view.catalog,trades:{name:'x',kind:'weird',fields:[]}}}).rows.find(r=>r.id==='trades').kind,'generic','unknown kinds stay generic');
 assert.match(TRUST_GROUP,/^Check the chain/);
});

test('toolsPayload: the enabled tools in order with the filled fields; empty ones left to SUB-01; a one-off date drops the daily time',()=>{
 let rows=toolsModel(TOOLS_VIEW).rows;
 rows=toggleTool(rows,'poll',true);rows=setField(rows,'poll','question',' Best snack? ');rows=setField(rows,'poll','options','Onigiri',0);rows=setField(rows,'poll','options','Oden',2);
 rows=toggleTool(rows,'event',true);rows=setField(rows,'event','title','Receipt printing');rows=setField(rows,'event','daily','23:00');rows=setField(rows,'event','at','2030-01-01T23:00');
 rows=toggleTool(rows,'chart',true);rows=setField(rows,'chart','range','7d');
 assert.deepEqual(toolsPayload(rows),{tools:[{id:'token',config:{}},{id:'poll',config:{question:'Best snack?',options:['Onigiri','Oden'],holdersOnly:false}},
  {id:'drop',config:{title:'Drop your confession',prompt:'Drop your confession.',revealJst:'23:00',autoPick:true}},{id:'event',config:{title:'Receipt printing',at:'2030-01-01T23:00'}},
  {id:'chart',config:{range:'7d'}}]});
 assert.deepEqual(toolsPayload(toggleTool(rows,'chart',false).map(r=>({...r,on:false}))),{tools:[]});
});

// ---------------------------------------------------------------- the dev buy as step 2 (its own transaction after the launch)
const LIVE={launch:{mint:'M1NT',network:'devnet'},submitterApprovedAt:1,adminClearedAt:1};
const attempt=(o={})=>({id:'devbuy_1',status:'done',signature:'4Q2d',error:null,costLamports:1e7,maxLamports:10500000,tokensBase:'10493886257633',...o});
test('launchSteps two-step dev buy: step 1 says so before signing; step 2 appears after the launch with Buy / Skip; every state of it',()=>{
 const ids=m=>m.steps.map(s=>s.id).join(' ');
 const cfg={initialBuyLamports:1e7,devBuyMode:'second_tx',mock:false,network:'devnet'};
 const lp=launchSteps(view('launch_prepared',{submitterApprovedAt:1,adminClearedAt:1,launchConfig:cfg}),ME_OWNER);
 assert.equal(ids(lp),'site approve clear launch devbuy live');
 assert.match(lp.steps[3].line,/^Step 1 of 2: builds the launch transaction/);
 assert.equal(lp.steps[3].note,devBuyNote('0.01 SOL'));assert.match(lp.steps[3].note,/second signature right after the launch\. If the price moves more than 5% first, it does not go through and you keep your SOL/);
 assert.deepEqual([lp.steps[4].title,lp.steps[4].state,lp.steps[4].action],['Dev buy · 0.01 SOL','todo',null]);assert.match(lp.steps[4].line,/^Step 2 of 2, right after the launch/);
 // launched, waiting for the second signature: the launch is done and live, the dev buy is the open step
 const pend=launchSteps(view('launched',{...LIVE,launchConfig:cfg,devBuy:{status:'pending',lamports:1e7,attempt:null}}),ME_OWNER);
 assert.equal(pend.current,'devbuy');assert.equal(states(pend),'done done done done current current');
 assert.deepEqual(pend.steps[4].action,{id:'devbuy',label:'Buy with your wallet',enabled:true});assert.deepEqual(pend.steps[4].secondary,{id:'devbuy-skip',label:'Skip the dev buy'});
 assert.match(pend.steps[4].line,/The coin is live\. Step 2: buy 0\.01 SOL of it with one more signature/);assert.equal(pend.devBuy.status,'pending');
 const again=launchSteps(view('launched',{...LIVE,devBuy:{status:'pending',lamports:1e7,attempt:attempt({status:'cancelled',error:'before signing: the price moved more than 5% since the quote'})}}),ME_OWNER);
 assert.match(again.steps[4].note,/^Last attempt: the price moved more than 5%/);
 const wait=launchSteps(view('launched',{...LIVE,devBuy:{status:'awaiting_signature',lamports:1e7,attempt:attempt({status:'awaiting_signature'})}}),ME_OWNER);assert.equal(wait.steps[4].action.label,'Review & buy');
 const sub=launchSteps(view('launched',{...LIVE,devBuy:{status:'submitted',lamports:1e7,attempt:attempt({status:'submitted'})}}),ME_OWNER);assert.deepEqual([sub.steps[4].state,sub.steps[4].action,sub.steps[4].secondary],['current',null,null]);assert.match(sub.steps[4].line,/buying/);
 const moved=launchSteps(view('launched',{...LIVE,devBuy:{status:'failed',lamports:1e7,attempt:attempt({status:'failed',error:'{"InstructionError":[1,{"Custom":6002}]}'})}}),ME_OWNER);
 assert.match(moved.steps[4].line,/price moved more than 5% first\. Your SOL stayed in your wallet/);assert.equal(moved.steps[4].action.label,'Try again at the new price');assert.equal(moved.steps[4].secondary.id,'devbuy-skip');
 const bad=launchSteps(view('launched',{...LIVE,devBuy:{status:'failed',lamports:1e7,attempt:attempt({status:'failed',error:'landed: on-chain verification failed'})}}),ME_OWNER);assert.deepEqual([bad.steps[4].state,bad.steps[4].action],['blocked',null]);assert.match(bad.steps[4].line,/admin has been alerted/);
 const done=launchSteps(view('launched',{...LIVE,devBuy:{status:'done',lamports:1e7,attempt:attempt()}}),ME_OWNER);
 assert.deepEqual([done.steps[4].state,done.steps[4].line],['done','Bought 10,493,886 tokens for 0.01 SOL · in your wallet.']);assert.equal(done.current,'live');
 const skipped=launchSteps(view('launched',{...LIVE,devBuy:{status:'skipped',lamports:1e7,attempt:null}}),ME_OWNER);assert.deepEqual([skipped.steps[4].state,skipped.steps[4].line],['done','Skipped: nothing was bought.']);
 // a visitor sees where it stands, never the buttons
 const vis=launchSteps(view('launched',{...LIVE,owner:false,devBuy:{status:'pending',lamports:1e7}}),null);assert.equal(vis.steps[4].action.enabled,false);assert.equal(vis.steps[4].secondary,null);
 // no step 2: no buy, the buy inside tx1, or a launch from before (no devBuy on the view)
 assert.equal(ids(launchSteps(view('launch_prepared',{launchConfig:{initialBuyLamports:0}}),ME_OWNER)),'site approve clear launch live');
 assert.equal(ids(launchSteps(view('launch_prepared',{launchConfig:{initialBuyLamports:1e7,devBuyMode:'same_tx'}}),ME_OWNER)),'site approve clear launch live');
 assert.equal(ids(launchSteps(view('launched',{...LIVE,launchConfig:{initialBuyLamports:1e7}}),ME_OWNER)),'site approve clear launch live');
 assert.equal(stepIndex('live',pend.steps),5);
});
test('devBuyTwoStep / tokensText / showDevBuyOn: the server decides; before a configuration a buy is predicted as two steps',()=>{
 assert.equal(devBuyTwoStep(view('preview_ready',{launchOptions:{initialBuyLamports:1e7}})),true,'no configuration yet: two steps (what pump.fun needs today)');
 assert.equal(devBuyTwoStep(view('preview_ready',{launchOptions:{initialBuyLamports:0}})),false);
 assert.equal(devBuyTwoStep(view('awaiting_signature',{launchConfig:{initialBuyLamports:1e7,devBuyMode:'same_tx'},intent:{dev_buy_mode:'second_tx'}})),true,'the intent wins');
 assert.equal(devBuyTwoStep(null),false);
 assert.equal(tokensText('10493886257633'),'10,493,886');assert.equal(tokensText('5'),'0');assert.equal(tokensText(null),null);assert.equal(tokensText('x'),null);
 assert.equal(showDevBuyOn({editable:true},'devbuy'),false,'the amount field never sits on step 2');
});
test('reviewModel step 1 of a two-step launch: no buy in it, the note about step 2; step 2: its own review (tokens, cap, one signature)',()=>{
 const me=ME_OWNER.user.wallet,v=view('launch_prepared',{launchConfig:{feeSharing:{locked:true,recipients:alloc.recipients},initialBuyLamports:1e7,devBuyMode:'second_tx'}});
 const progs=[{id:'6EF8',name:'pump.fun (bonding curve)',direct:true},{id:'pfee',name:'pump.fun fee sharing',direct:true}];
 const tx1={network:'devnet',feePayer:me,mint:'M1NT',txBase64:'AQID',programs:progs,accountsWritable:9,signers:2,launchProgramsOnly:true,txBytes:979,
  estimate:{phantomSafe:true,devBuyMode:'second_tx',initialBuyLamports:0,networkFeeLamports:10000,accountsLamports:11506200,simulation:{ok:true},signerBalanceLamports:8e8,
   devBuy:{mode:'second_tx',requestedLamports:1e7,lamports:1e7,maxLamports:10500000,tokensBase:'10493886257633'}}};
 const r1=reviewModel(tx1,v,me);assert.equal(r1.step,1);assert.equal(r1.canSign,true);assert.deepEqual([r1.cost.buy,r1.cost.total],[null,'0.011516 SOL'],'tx1 buys nothing');
 assert.deepEqual([r1.devBuyNext.sol,r1.devBuyNext.maxSol,r1.devBuyNext.tokens],['0.01 SOL','0.0105 SOL','10,493,886']);assert.match(r1.devBuyNext.note,/second signature right after the launch.*keep your SOL/);
 assert.match(r1.doesNot[2],/No buy in this transaction: your dev buy of 0\.01 SOL is step 2, a second signature right after\./);assert.match(r1.doesNot[3],/only SOL that leaves/);
 // a resumed intent without the mode in its estimate: the configuration's word
 assert.equal(reviewModel({...tx1,estimate:{networkFeeLamports:10000,accountsLamports:1}},v,me).devBuyNext.sol,'0.01 SOL');
 assert.equal(reviewModel({...tx1,estimate:{...tx1.estimate,devBuyMode:'same_tx',initialBuyLamports:1e7}},v,me).devBuyNext,null,'the buy inside tx1: no step 2');
 const tx2={step:2,network:'devnet',feePayer:me,mint:'M1NT',txBase64:'AgME',programs:[{id:'AToken',name:'Associated Token Account',direct:true},{id:'6EF8',name:'pump.fun (bonding curve)',direct:true},{id:'Tokenz',name:'Token-2022',direct:false},{id:'pfee',name:'pump.fun fee sharing',direct:false}],
  accountsWritable:12,signers:1,launchProgramsOnly:true,txBytes:1033,tokensBase:'10493886257633',costLamports:1e7,maxLamports:10500000,
  estimate:{phantomSafe:true,devBuyMode:'second_tx',initialBuyLamports:1e7,initialBuyMaxLamports:10500000,initialBuyTokensBase:'10493886257633',networkFeeLamports:5000,accountsLamports:2164080,simulation:{ok:true},signerBalanceLamports:8e8}};
 const r2=reviewModel(tx2,view('launched',{...LIVE}),me);
 assert.deepEqual([r2.step,r2.canSign,r2.signers,r2.tokens,r2.devBuyNext],[2,true,1,'10,493,886',null]);
 assert.deepEqual(r2.cost,{fee:'0.000005 SOL',rent:'0.002164 SOL',buy:'0.01 SOL',buyMax:'0.0105 SOL',total:'0.012169 SOL',simulated:true,balance:'0.8 SOL'});
 assert.match(r2.doesNot[2],/^Buys exactly 10,493,886 tokens for 0\.01 SOL \(capped at 0\.0105 SOL in the transaction\): if the price moved more than 5% since this quote, it fails and your SOL stays in your wallet\./);
 assert.match(r2.doesNot[3],/rent of your new token account and the dev buy/);
 const two=reviewModel({...tx2,signers:2},view('launched',{...LIVE}),me);assert.equal(two.canSign,false);assert.match(two.warnings[0],/signed by your wallet alone/);
 const rogue=reviewModel({...tx2,launchProgramsOnly:false},view('launched',{...LIVE}),me);assert.match(rogue.warnings[0],/not part of a dev buy/);
 const resumed=reviewModel({...tx2,estimate:null,resumed:true},view('launched',{...LIVE}),me);assert.deepEqual([resumed.cost.buy,resumed.cost.buyMax,resumed.tokens],['0.01 SOL','0.0105 SOL','10,493,886'],'a resumed attempt: the attempt\'s own numbers');
});

// ---------------------------------------------------------------- the idea app (App section of the Tools panel)
const KONBINI_APP={v:1,kind:'ritual',title:'Konbini Confession: the 23:00 receipt',lede:'Send a confession.',flow:'inbox',noun:{one:'confession',many:'confessions'},screens:[
 {id:'tonight',title:'Tonight',blocks:[{type:'counter',title:'',metrics:['submitted_today']},{type:'reveal',title:'The latest receipt',pick:['owner','votes','random'],empty:'Nothing.'},
  {type:'submit',title:'Drop your confession',prompt:'Drop it.',button:'Drop it',fields:[{key:'text',label:'Your confession',kind:'longtext',max:280,required:true},{key:'item',label:'What you bought',kind:'choice',choices:['Onigiri','Ice Cream'],required:false}],holdersOnly:false,anonymous:true,thanks:'Received.'},
  {type:'vote',title:"Tonight's candidates",of:'candidates',holdersOnly:true,button:'Vote'},{type:'schedule',every:'day',at:'23:00',label:'Every day at 23:00 JST'}]},
 {id:'archive',title:'Archive',blocks:[{type:'card',title:'Print your own receipt',template:'receipt',heading:'KONBINI CONFESSION',sub:'SHIBUYA, TOKYO',lines:['ONIGIRI ×1'],footer:'$RECEIPT',input:true},
  {type:'collection',title:'Every receipt',show:'published',layout:'cards',filters:['month','search'],empty:'Soon.'}]}]};
const APP_VIEW={editable:true,app:KONBINI_APP,summary:'confessions form · signed votes · reveal every day at 23:00 JST · receipt card · archive · counter',
 inbox:[{id:'itm_1',number:1,text:'I ate the last onigiri',fields:{text:'I ate the last onigiri',item:'Onigiri'},at:1,hidden:false,published:false,candidate:true,votes:2,picked:false},
  {id:'itm_2',number:2,text:'<b>x</b>',fields:{text:'<b>x</b>'},at:2,hidden:true,published:false,candidate:false,votes:0},
  {id:'itm_3',number:3,text:'Printed one',fields:{},at:3,published:true,how:'votes',votes:5}],
 round:{slot:1791900000000,start:1791813600000,key:'slot:1791900000000'},pick:null,reveals:[{slotAt:1791813600000,method:'votes',number:3,text:'Printed one'},{slotAt:1791727200000,method:'empty'}],
 pq:null,devTrigger:false};

test('appModel: the copy to edit, the form, the schedule, the card, the inbox with its actions; defensive',()=>{
 const m=appModel(APP_VIEW);
 assert.equal(m.editable,true);
 assert.deepEqual(m.copy.slice(0,2).map(c=>[c.path,c.value]),[['title','Konbini Confession: the 23:00 receipt'],['lede','Send a confession.']]);
 assert.ok(m.copy.some(c=>c.path==='screens.0.blocks.2.prompt'&&c.block==='Form'&&c.max===160));
 assert.deepEqual(m.form.fields.map(f=>[f.key,f.kind]),[['text','longtext'],['item','choice']]);
 assert.deepEqual(m.schedule,{si:0,bi:4,every:'day',at:'23:00',weekday:5});
 assert.equal(m.card.template,'receipt');
 assert.equal(m.inbox[0].extra,'Onigiri');
 assert.equal(m.inbox[1].text,'<b>x</b>','text stays text (drawn with textContent)');
 const rows=appInboxRows(m);
 assert.deepEqual(rows.map(r=>[r.state,r.pick,r.publish,r.toggle]),[['candidate',true,true,'Hide'],['hidden',false,false,'Show'],['published',false,false,'Hide']]);
 assert.match(rows[0].meta,/#1 · .* · Onigiri · 2 votes · in tonight's round/);
 assert.match(rows[2].meta,/published \(votes\)/);
 assert.equal(appInboxRows(appModel({...APP_VIEW,inbox:[{...APP_VIEW.inbox[0],picked:true}]}))[0].unpick,true);
 for(const bad of [null,undefined,'x',{},{app:'x'},{app:{screens:'x'}},{inbox:'x',reveals:[null]}])assert.doesNotThrow(()=>appModel(bad));
 assert.equal(appModel(null).loading,true);assert.equal(appModel({app:null}).app,null);
 assert.notEqual(appModel(APP_VIEW).app,KONBINI_APP,'a copy, never the view itself');
});

test('app edits: copy by path, fields (add, remove, kinds, choices), schedule, card; problems in plain words; the payload',()=>{
 let app=appModel(APP_VIEW).app;const m=()=>appModel({app});
 app=appSetCopy(app,'screens.0.blocks.2.prompt','Tell the konbini.');
 assert.equal(app.screens[0].blocks[2].prompt,'Tell the konbini.');
 assert.equal(KONBINI_APP.screens[0].blocks[2].prompt,'Drop it.','never mutates its input');
 app=appSetCopy(app,'title','<script>');assert.match(appProblem(app),/plain text/);
 app=appSetCopy(app,'title','see https://x.com');assert.match(appProblem(app),/cannot carry a link/);
 app=appSetCopy(app,'title','Konbini');assert.equal(appProblem(app),'');
 app=appSetField(app,m().form,1,'choices','Onigiri, onigiri');assert.match(appProblem(app),/must differ/);
 app=appSetField(app,m().form,1,'choices','Onigiri, Oden, Melon pan');assert.deepEqual(app.screens[0].blocks[2].fields[1].choices,['Onigiri','Oden','Melon pan']);
 assert.equal(appSetField(app,m().form,0,'kind','choice').screens[0].blocks[2].fields[0].kind,'longtext','the first field stays the text');
 app=appAddField(app,m().form);app=appAddField(app,m().form);app=appAddField(app,m().form);
 assert.equal(m().form.fields.length,4,'at most four');
 app=appSetField(app,m().form,2,'kind','number');app=appSetField(app,m().form,2,'label','Hour');
 assert.equal(app.screens[0].blocks[2].fields[2].kind,'number');
 app=appRemoveField(app,m().form,3);app=appRemoveField(app,m().form,0);
 assert.deepEqual(m().form.fields.map(f=>f.key),['text','item','field3'],'the first field cannot be removed');
 app=appSetField(app,m().form,0,'max','20');assert.match(appProblem(app),/40 to 500/);
 app=appSetField(app,m().form,0,'max','');assert.equal(appProblem(app),'');
 app=appSetSchedule(app,m().schedule,{at:'25:00'});assert.match(appProblem(app),/a time like 23:00/);
 app=appSetSchedule(app,m().schedule,{every:'week',at:'20:00',weekday:5});
 assert.deepEqual(app.screens[0].blocks[4],{type:'schedule',every:'week',at:'20:00',weekday:5},'the server writes the new label');
 app=appSetSchedule(app,m().schedule,{every:'day'});assert.equal(app.screens[0].blocks[4].weekday,undefined);
 app=appSetCard(app,m().card,{template:'ticket',lines:'A\n\nB\n'});assert.deepEqual(app.screens[1].blocks[0].lines,['A','B']);
 app=appSetCard(app,m().card,{lines:'a\nb\nc\nd\ne\nf\ng'});assert.match(appProblem(app),/at most 6 lines/);
 app=appSetCard(app,m().card,{lines:'ONIGIRI ×1'});app=appSetCard(app,m().card,{heading:''});assert.match(appProblem(app),/write the heading/);
 app=appSetCard(app,m().card,{heading:'LAWSON-ISH'});assert.equal(appProblem(app),'');
 assert.deepEqual(Object.keys(appPayload(app)),['app']);
});
// ---------------------------------------------------------------- the logo choice (desk-flows.js artModel/showArtOn, desk.js renderArtPick)
import {artModel,showArtOn,renderArtPick} from '../src/desk.js';
const ART={choice:0,chosen:false,locked:false,lockedWhy:null,candidates:[
 {index:0,label:'Option 1',provider:'local',symbol:'ramen',live:true,logoUrl:'/api/projects/ramen/art/logo-0.png',bannerUrl:'/api/projects/ramen/art/banner-0.png'},
 {index:1,label:'Option 2',provider:'higgsfield',symbol:'ramen',live:false,logoUrl:'/api/projects/ramen/art/logo-1.png',bannerUrl:'/api/projects/ramen/art/banner-1.png'}]};
test('artModel: owner, preview_ready/approved/launch_prepared, two same-origin options; older coins and visitors get nothing',()=>{
 const m=artModel(ART,view('preview_ready'));
 assert.deepEqual(m.options.map(o=>[o.index,o.label,o.live,o.by]),[[0,'Option 1',true,'drawn by SUB-01 (no AI)'],[1,'Option 2',false,'drawn with Higgsfield']]);
 assert.deepEqual([m.choice,m.chosen,m.editable],[0,false,true]);assert.match(m.note,/Option 1 is used unless you pick/);
 assert.equal(artModel(ART,view('generating')),null,'not while SUB-01 builds');assert.equal(artModel(ART,view('launched')),null);
 assert.equal(artModel(ART,view('preview_ready',{owner:false})),null,'owner only');
 assert.equal(artModel({...ART,candidates:[]},view('preview_ready')),null,'a coin from before the options');assert.equal(artModel(null,view('approved')),null);
 assert.equal(artModel({...ART,candidates:[ART.candidates[0],{...ART.candidates[1],logoUrl:'https://evil.test/x.png'}]},view('approved')),null,'only our own /api/projects/…/art URLs reach an <img>');
 const chosen=artModel({...ART,choice:1,chosen:true},view('launch_prepared'));assert.equal(chosen.choice,1);assert.match(chosen.note,/Option 2 is your logo/);
 const locked=artModel({...ART,locked:true,lockedWhy:'a launch transaction exists; cancel it first to change the logo'},view('launch_prepared'));
 assert.equal(locked.editable,false);assert.match(locked.note,/cancel it first/);
 assert.deepEqual(['site','approve','clear','launch','devbuy','live'].map(id=>showArtOn(m,id)),[false,true,true,true,false,false]);
 assert.equal(showArtOn(m,'launch',true),false,'not under the review card');assert.equal(showArtOn(locked,'approve'),false);
});
test('renderArtPick: two cards, the live one marked; a tap sends the other index',async()=>{
 class El{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.classList={toggle(){}};this.textContent='';}
  append(...k){for(const c of k){if(c==null||c===false)throw new Error('append(null)');this.children.push(typeof c==='string'?{text:c}:c);}}
  setAttribute(k,v){this.attrs[k]=v;}
  all(){const out=[],walk=n=>{for(const c of n.children||[]){out.push(c);walk(c);}};walk(this);return out;}}
 globalThis.document={createElement:t=>new El(t),createElementNS:(_ns,t)=>new El(t)};
 try{
  const picked=[];const box=renderArtPick(artModel(ART,view('preview_ready')),{onPick:async i=>{picked.push(i);}});
  const cards=box.all().filter(n=>/^pc-art-opt/.test(n.className||''));
  assert.deepEqual(cards.map(c=>c.className),['pc-art-opt is-on','pc-art-opt']);
  const imgs=box.all().filter(n=>n.tagName==='IMG').map(i=>i.src);assert.deepEqual(imgs,['/api/projects/ramen/art/logo-0.png','/api/projects/ramen/art/banner-0.png','/api/projects/ramen/art/logo-1.png','/api/projects/ramen/art/banner-1.png']);
  const buttons=box.all().filter(n=>n.tagName==='BUTTON');assert.deepEqual(buttons.map(b=>b.disabled),[true,false]);
  await buttons[1].onclick();assert.deepEqual(picked,[1]);
 }finally{delete globalThis.document;}
});
test('requestComputer: the next computer on the owner\'s desk opens that project on that tab, once, within 2 minutes',async()=>{
 const {requestComputer,takeComputerRequest}=await import('../src/desk.js');
 const model={mine:true,projects:[{slug:'ramen'},{slug:'soba'}]};
 requestComputer({slug:'soba',tab:'launch'});assert.deepEqual(takeComputerRequest(model),{project:{slug:'soba'},tab:'launch'});
 assert.equal(takeComputerRequest(model),null,'one-shot');
 requestComputer({slug:'gone',tab:'launch'});assert.deepEqual(takeComputerRequest(model),{project:null,tab:'launch'},'project not built yet: the default project, Launch tab');
 requestComputer({slug:'soba',tab:'launch'});assert.equal(takeComputerRequest({...model,mine:false}),null,'never on someone else\'s desk');
 requestComputer({slug:'soba',tab:'launch'});assert.equal(takeComputerRequest(model,Date.now()+121000),null,'stale');
});
