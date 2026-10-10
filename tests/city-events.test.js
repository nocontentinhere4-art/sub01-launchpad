import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {freshEvents,signText,partySpots,visitRoute,decorations,decorItems,buildFireworks,buildConfetti,createCityEvents,FIRE_AGE,
 coinCard,coinPlan,allocTiles,shortMint,STATE_TEXT,COIN_TILES,MAX_COINS,GIANT_H,GIANT_LIFT,MAX_GIANT} from '../src/city-events.js';
import {mockStats} from '../src/coin-tier.js';
import {subLotsOf,builtHeight,BASE_Y} from '../src/lots.js';
import {frontOf} from '../src/world-sync.js';
import {cityPlots} from '../src/city-state.js';

const now=1_800_000_000_000;
test('events: malformed and repeated ones are ignored; history older than 60 s never fires',()=>{
 const seen=new Set(),ev=[{kind:'launched',plotId:'shibuya-2',name:'Arc',ticker:'ARC',at:now-5e3},{kind:'accepted',plotId:null,name:'Old',ticker:null,at:now-FIRE_AGE-1},null,{kind:'bogus',at:now},{kind:'launched',at:'x'}];
 assert.deepEqual(freshEvents(ev,seen,now).map(e=>e.name),['Arc']);
 assert.deepEqual(freshEvents(ev,seen,now+1e3),[],'already seen');
 assert.equal(seen.size,2,'old events are remembered as seen');
 const later=[{kind:'accepted',plotId:'ginza-1',name:'New',at:now+2e3},...ev];
 assert.deepEqual(freshEvents(later,seen,now+3e3).map(e=>e.name),['New']);
 assert.deepEqual(freshEvents(undefined,seen,now),[]);assert.deepEqual(freshEvents({},seen,now),[]);
 assert.deepEqual(freshEvents([],seen,now),[]);assert.equal(seen.size,0,'events that left the 24h window are forgotten');
 const order=freshEvents([{kind:'accepted',name:'b',at:now-1},{kind:'accepted',name:'a',at:now-9}],new Set(),now);assert.deepEqual(order.map(e=>e.name),['a','b']);
});
test('sign text is a short $TICKER or the name in capitals',()=>{
 assert.equal(signText('arc',''),'$ARC');assert.equal(signText(' $r@men-2026xyz ','x'),'$RMEN2026XY');
 assert.equal(signText(null,'Night  Owl FM!'),'NIGHT OWL FM');assert.equal(signText(undefined,undefined),'OPEN');assert.equal(signText('<>','中文'),'OPEN');assert.equal(signText('<b>'),'$B');
});
test('party spots stand on the street in front of the plot, facing the building',()=>{
 for(const id of ['shibuya-2','shibuya-5','ginza-1']){
  const p=cityPlots.find(c=>c.id===id),f=frontOf(id),spots=partySpots(id,12);assert.equal(spots.length,12);
  for(const s of spots){assert.ok(Number.isFinite(s.x+s.z+s.yaw));assert.ok(Math.abs(s.x-f.x)<4.5);
   assert.ok(Math.abs(s.z-p.z)>Math.abs(f.z-p.z),'not inside the building');assert.ok(Math.abs(s.z-f.z)<4);
   assert.ok(Math.cos(s.yaw)*(p.z-s.z)+Math.sin(s.yaw)*(p.x-s.x)>0,'faces the building');}
  assert.equal(new Set(spots.map(s=>s.x.toFixed(2)+s.z.toFixed(2))).size,12,'no two on the same spot');
 }
 assert.deepEqual(partySpots('nowhere-1',5),[]);assert.deepEqual(partySpots('shibuya-2',0),[]);
});
test('a visit walks the streets from one apartment front to the other',()=>{
 const r=visitRoute('roppongi-4','shibuya-5'),a=frontOf('roppongi-4'),b=frontOf('shibuya-5');
 assert.deepEqual(r[0],{x:a.x,z:a.z});assert.deepEqual(r.at(-1),{x:b.x,z:b.z});
 for(let i=1;i<r.length;i++)assert.ok(r[i].x===r[i-1].x||r[i].z===r[i-1].z);
 assert.equal(visitRoute('shibuya-5','shibuya-5'),null);assert.equal(visitRoute('shibuya-5','x-1'),null);assert.equal(visitRoute(undefined,'shibuya-5'),null);
});
test('decorations: launched get neon + graffiti + spotlight on their real roof, sites waiting are listed as soon',()=>{
 const b=[{plotId:'shibuya-2',type:'project',phase:'open',ticker:'ARC',name:'Arc'},{plotId:'shibuya-3',type:'project',phase:'review',name:'Owl'},
  {plotId:'shibuya-4',type:'project',phase:'launch',name:'Melon'},{plotId:'shibuya-1',type:'project',phase:'thinking',name:'Idea'},{plotId:'ueno-3',type:'apartment',phase:'home',name:'Mika'}];
 const d=decorations(b,[{kind:'launched',plotId:'shibuya-4',at:1},{kind:'launched',plotId:'shibuya-1',at:1}]);
 assert.deepEqual(d.open.map(x=>x.plotId),['shibuya-2','shibuya-4']);assert.deepEqual(d.soon.map(x=>x.plotId),['shibuya-3']);
 const items=decorItems(d,b);assert.equal(items.signs.filter(s=>s.kind==='neon').length,2);assert.equal(items.signs.filter(s=>s.kind==='soon').length,0);assert.equal(items.cones.length,2);
 for(const s of items.signs)assert.ok([s.x,s.y,s.z,s.w,s.h].every(Number.isFinite));
 const roof=BASE_Y+subLotsOf('shibuya-2',b).user.height,neon=items.signs.find(s=>s.kind==='neon');assert.ok(neon.y-neon.h/2>roof,'neon stands above the real roof');
 const empty=decorItems(decorations(undefined,undefined));assert.deepEqual(empty,{signs:[],boxes:[],cones:[]});
 assert.equal(decorations(Array.from({length:20},(_,i)=>({plotId:cityPlots[i].id,type:'project',phase:'open',ticker:'T'+i})),[]).open.length,7,'capped');
});
test('particle systems are fixed-size buffers with finite attributes',()=>{
 for(const sys of [buildFireworks({slots:6,per:200}),buildConfetti({slots:2,per:220})]){
  for(const a of Object.values(sys.points.geometry.attributes))assert.ok(a.array.every(Number.isFinite));
  assert.ok(sys.points.material.vertexShader.includes('uTime'));assert.equal(sys.points.frustumCulled,false);
 }
 assert.equal(buildFireworks({slots:6,per:200}).points.geometry.attributes.position.count,1200);
});
test('city events: no events change nothing; a party gathers and ends; a visit goes and comes back',async()=>{
 const scene=new THREE.Group(),ev=createCityEvents(scene,{mobile:false});
 ev.decorate([],undefined);ev.update(.016);assert.equal(ev.stats().boxes,0);assert.equal(ev.stats().cones,0);assert.equal(ev.party,null);
 ev.decorate([{plotId:'shibuya-2',type:'project',phase:'open',ticker:'ARC',name:'Arc'}],[]);assert.equal(ev.stats().cones,1);assert.equal(ev.stats().boxes,4,'neon frame + 2 posts + the banner cap');assert.equal(ev.stats().beacons,0);
 ev.decorate([{plotId:'kichijoji-2',type:'project',phase:'launch',ticker:'K',name:'K'}],[]);assert.equal(ev.stats().beacons,1);assert.equal(ev.stats().boxes,2,'banner cap + beacon mast');assert.equal(ev.stats().cones,0);
 const p=ev.celebrate('shibuya-2',{people:[{x:30,z:0,look:{top:'#123456'}}]});assert.ok(p&&Number.isFinite(p.spot.x));assert.equal(ev.celebrate('shibuya-2'),null,'one party per site per minute');
 assert.equal(ev.celebrate('nowhere-3'),null);ev.update(.016,30);
 const m=new THREE.Matrix4(),crowd=scene.children[0].children.find(c=>c.isInstancedMesh&&c.visible&&c.count>0);for(let i=0;i<crowd.count;i++){crowd.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite));}
 const root=new THREE.Group(),played=[];let arrived=0,ended=0;
 const char={root,play:n=>played.push(n),stride(){},update(){},dispose(){root.removeFromParent();}};
 assert.ok(ev.visit({from:'shibuya-6',to:'shibuya-5',load:async()=>char,onArrive:()=>arrived++,onEnd:()=>ended++}));
 assert.equal(ev.visit({from:'shibuya-6',to:'shibuya-4',load:async()=>char}),false,'one visit at a time');
 await new Promise(r=>setTimeout(r,0));assert.equal(ev.visitor,root);
 for(let i=0;i<400&&!arrived;i++)ev.update(.08);assert.equal(arrived,1);assert.ok(played.includes('Wave'));
 const b=frontOf('shibuya-5');assert.ok(Math.hypot(root.position.x-b.x,root.position.z-b.z)<.01);
 ev.cancelVisit();assert.equal(ended,1);assert.equal(ev.visiting,false);
 assert.equal(ev.visit({from:'shibuya-6',to:'shibuya-5',load:()=>Promise.reject(new Error('no glb'))}),true);await new Promise(r=>setTimeout(r,0));assert.equal(ev.visiting,false,'a failed load frees the slot');
});

// Wave 4A: the coin on every project building.
const MINT='7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
test('coin cards: $TICKER + state text per phase; private projects show only the generic card; only /meta art',()=>{
 assert.deepEqual(Object.fromEntries(['thinking','scaffold','review','launch','open','stopped'].map(p=>[p,STATE_TEXT[p]])),
  {thinking:'BUILDING',scaffold:'BUILDING',review:'LAUNCHING SOON',launch:'LAUNCHING SOON',open:'LAUNCHED',stopped:'ON HOLD'});
 const c=(o)=>coinCard({type:'project',plotId:'shibuya-2',name:'Arc',ticker:'arc',...o});
 assert.deepEqual(c({phase:'thinking'}).lines,['BUILDING']);assert.equal(c({phase:'scaffold'}).ticker,'$ARC');
 assert.deepEqual(c({phase:'review'}).lines,['LAUNCHING','SOON']);assert.equal(c({phase:'launch'}).soon,true);assert.equal(c({phase:'open'}).soon,false);
 const open=c({phase:'open',mint:MINT});assert.equal(open.sub,'7xKX…gAsU');assert.equal(open.state,'LAUNCHED');assert.equal(c({phase:'review',mint:MINT}).sub,'','mint only once launched');
 assert.equal(shortMint('not a mint'),'');assert.equal(shortMint(null),'');
 assert.equal(c({phase:'open',logoUrl:'/meta/arc/logo-v3.png'}).logo,'/meta/arc/logo-v3.png');
 for(const bad of ['https://evil.example/logo.png','//evil.example/x.png','/meta/../etc/passwd','javascript:alert(1)','/api/me'])assert.equal(c({phase:'open',logoUrl:bad}).logo,null,bad);
 assert.ok(c({phase:'open',logoUrl:'data:image/png;base64,iVBORw0KGgo='}).logo,'inline mock art');
 const p=coinCard({type:'project',plotId:'yanaka-1',phase:'scaffold',name:'Private project',private:true,ticker:'LEAK',logoUrl:'/meta/x/logo-v1.png',mint:MINT});
 assert.deepEqual([p.key,p.ticker,p.logo,p.sub,p.lines],['b|private','',null,'',['PRIVATE','PROJECT']]);
 assert.equal(coinCard({type:'apartment',phase:'home'}),null);assert.equal(coinCard({type:'project',phase:'nope'}),null);
});
test('coin tiles: cached by key, stable slots, lowest free slot for new keys, overflow dropped',()=>{
 let {map,fresh}=allocTiles(new Map(),['a','b','c']);assert.deepEqual([...map],[['a',0],['b',1],['c',2]]);assert.deepEqual(fresh,['a','b','c']);
 ({map,fresh}=allocTiles(map,['c','d','a']));assert.deepEqual([...map].sort(),[['a',0],['c',2],['d',1]]);assert.deepEqual(fresh,['d'],'only the new key is drawn');
 ({map,fresh}=allocTiles(map,['a','a','e'],2));assert.deepEqual([...map],[['a',0],['e',1]]);
 const many=Array.from({length:40},(_,i)=>'k'+i);({map,fresh}=allocTiles(new Map(),many));assert.equal(map.size,COIN_TILES);assert.ok(!map.has('k39'));
});
test('coin plan: blade banner on the front face, logo billboard on the roof, beacons on launching-soon buildings',()=>{
 const b=[{plotId:'shibuya-2',type:'project',phase:'open',ticker:'ARC',name:'Arc',mint:MINT,logoUrl:'/meta/arc/logo-v1.png'},
  {plotId:'kichijoji-3',type:'project',phase:'review',ticker:'KICHI',name:'Kichi',logoUrl:'data:image/png;base64,iVBORw0KGgo='},
  {plotId:'yanaka-1',type:'project',phase:'thinking',name:'Private project',private:true},
  {plotId:'gotanda-2',type:'project',phase:'scaffold',ticker:'GO',name:'Go',progress:.3,logoUrl:'https://evil.example/x.png'},
  {plotId:'ueno-3',type:'apartment',phase:'home',name:'Mika'}];
 const plan=coinPlan(b);assert.deepEqual(plan.cards.map(c=>c.key),['b|$ARC|LAUNCHED|7xKX…gAsU','b|$KICHI|LAUNCHING SOON|','b|$GO|BUILDING|','b|private']);
 assert.equal(plan.planes.filter(p=>p.kind==='banner').length,8,'two faces per banner');assert.equal(plan.planes.filter(p=>p.kind==='logo').length,4,'logos only for safe art');
 assert.deepEqual(plan.beacons.map(x=>x.plotId),['kichijoji-3']);
 for(const p of plan.planes){const x=b.find(y=>y.plotId===p.plotId),lot=subLotsOf(p.plotId,b).user,fz=lot.front==='+z'?1:-1,top=BASE_Y+builtHeight(lot,x);
  assert.ok([p.x,p.y,p.z,p.w,p.h,p.ry].every(Number.isFinite));
  if(p.kind==='banner'){assert.ok((p.z-lot.frontZ)*fz>0,'in front of the face');assert.ok(Math.abs(p.x-lot.x)<=lot.width/2);assert.ok(p.y+p.h/2<=Math.max(top,BASE_Y+.45+p.h)+1e-9,'not above the roof');assert.ok(p.y-p.h/2>=BASE_Y+.4);}
  else{assert.ok(p.y-p.h/2>top,'billboard above the roof');assert.ok(Math.abs(p.z-lot.z)<lot.depth/2);}}
 const tw=plan.planes.filter(p=>p.plotId==='shibuya-2'&&p.kind==='banner');assert.ok(Math.abs(Math.abs(tw[0].ry-tw[1].ry)-Math.PI)<1e-9,'back to back');
 assert.equal(JSON.stringify(coinPlan(b.map(x=>({...x})))),JSON.stringify(plan),'deterministic');
 assert.equal(coinPlan(Array.from({length:40},(_,i)=>({plotId:cityPlots[i*7].id,type:'project',phase:'thinking',ticker:'T'+i}))).cards.length,MAX_COINS,'capped');
 assert.deepEqual(coinPlan(undefined),{cards:[],planes:[],boxes:[],beacons:[]});
});
test('city events: coins and beacons add no meshes per project and stay within fixed buffers',()=>{
 const scene=new THREE.Group(),ev=createCityEvents(scene);const meshes=()=>{let n=0;scene.traverse(o=>{if(o.isMesh||o.isPoints)n++;});return n;};
 const before=meshes(),b=Array.from({length:30},(_,i)=>({plotId:cityPlots[i*9].id,type:'project',phase:['thinking','review','open'][i%3],ticker:'C'+i,name:'C'+i}));
 ev.decorate(b,[]);assert.equal(meshes(),before);const st=ev.stats();assert.ok(st.boxes<=7*3+MAX_COINS*5);assert.ok(st.beacons>0&&st.beacons<=MAX_COINS);
 ev.setNight(true);ev.update(.016);ev.setNight(false);
});

// ---------- Coin tiers (coin-tier.js → city-events): the giant sign, the beam, the trend pulse ----------
const openWith=(plotId,stats,extra={})=>({plotId,type:'project',phase:'open',ticker:'ARC',name:'Arc',color:'mint',stats,...extra});
test('coin tiers: tier 1 draws the plain launched look; tier 3 adds a beam; tier 4 the giant sign + beacon and drops the small logo board',()=>{
 const plain=decorItems({open:[openWith('shibuya-2',null)]}),t1=decorItems({open:[openWith('shibuya-2',mockStats(1,'up'))]});
 const noPulse=l=>JSON.stringify(l.map(({pulse,...s})=>s));assert.equal(noPulse(plain.signs),noPulse(t1.signs),'tier 1: same signs');assert.ok(t1.signs.every(s=>!s.pulse),'pulse 0 even trending up');
 assert.equal(plain.boxes.length,t1.boxes.length);assert.equal(coinPlan([openWith('shibuya-2',mockStats(1,'up'))]).beacons.length,0);
 const t2=decorItems({open:[openWith('shibuya-2',mockStats(2,'up'))]});assert.equal(t2.signs.find(s=>s.kind==='neon').pulse,1,'trend up pulses the neon');
 assert.equal(decorItems({open:[openWith('shibuya-2',mockStats(2,'down'))]}).signs.find(s=>s.kind==='neon').pulse,-1);
 assert.ok(!t2.signs.some(s=>s.kind==='giant'));
 const b3=openWith('shibuya-2',mockStats(3,'flat')),p3=coinPlan([b3]),s=subLotsOf('shibuya-2',[b3]).user,top=BASE_Y+builtHeight(s,b3);
 assert.deepEqual(p3.beacons.map(b=>b.kind),['beam']);const beam=p3.beacons[0];assert.ok(Math.abs(beam.y-top)<.5,'the beam starts on the roof');
 assert.ok(Math.abs(beam.x-s.x)<=s.width/2&&Math.abs(beam.z-s.z)<=s.depth/2,'inside the roof');
 const b4=openWith('shibuya-2',mockStats(4,'up'),{logoUrl:'/meta/arc/logo-v2.png'}),d4=decorItems({open:[b4]}),p4=coinPlan([b4]);
 const g=d4.signs.find(s=>s.kind==='giant');assert.ok(g,'giant sign');assert.equal(g.h,GIANT_H);assert.ok(g.w<=s.width-.3);assert.equal(g.logo,'/meta/arc/logo-v2.png');assert.equal(g.color,'#69A694','the project accent, never a price colour');
 assert.ok(Math.abs(g.y-GIANT_H/2-top-GIANT_LIFT)<1e-9,'two storeys standing above the penthouse');assert.equal(g.pulse,1);assert.equal(g.text,'$ARC');
 assert.equal(d4.boxes.length,decorItems({open:[openWith('shibuya-2',null)]}).boxes.length+4,'frame: back panel, two posts, sill');
 assert.deepEqual(p4.beacons.map(b=>b.kind),['beam','beacon']);assert.ok(p4.beacons[1].y>g.y+GIANT_H/2,'beacon on top of the sign');
 assert.ok(!p4.planes.some(p=>p.kind==='logo'),'the giant sign carries the logo');assert.ok(coinPlan([openWith('shibuya-2',mockStats(3),{logoUrl:'/meta/arc/logo-v2.png'})]).planes.some(p=>p.kind==='logo'),'tier 3 keeps the small board');
 assert.equal(decorItems({open:[openWith('shibuya-2',mockStats(4),{logoUrl:'https://evil.example/x.png'})]}).signs.find(s=>s.kind==='giant').logo,null,'only the server\'s own art');
});
test('coin tiers: the giant sign and the beam live in the existing batches (no mesh, no draw call) within fixed buffers',()=>{
 const scene=new THREE.Group(),ev=createCityEvents(scene);const meshes=()=>{let n=0;scene.traverse(o=>{if(o.isMesh||o.isPoints)n++;});return n;};
 const before=meshes(),b=Array.from({length:12},(_,i)=>openWith(cityPlots[i*11].id,mockStats(1+i%4,['up','down','flat'][i%3]),{ticker:'C'+i,name:'C'+i}));
 ev.decorate(b,[]);assert.equal(meshes(),before);const st=ev.stats();
 assert.equal(st.beams,b.filter(x=>x.stats.tier>=3).length);assert.equal(st.beacons,st.beams+b.filter(x=>x.stats.tier>=4).length);
 assert.equal(st.giants,0,'no document: no atlas, no giant tiles');ev.setNight(true);ev.update(.016,20);ev.setNight(false);
 assert.ok(MAX_GIANT>=1);
});
