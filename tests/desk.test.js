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
