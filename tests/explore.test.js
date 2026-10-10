import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {snapToStreet,exploreRoute,groundY,pickPoi,idleTimer,districtAt,cityPois,createExplorer,LANDMARKS,IDLE_S,PAUSE_S} from '../src/explore.js';
import {frontOf} from '../src/world-sync.js';
import {ROAD_Z,BOULEVARD_X,CITY_EXTENT as E,CANAL_X,METRO_Z} from '../src/city-state.js';
import {riverEdges} from '../src/landmarks.js';
import {createCityEvents} from '../src/city-events.js';

// 7×7 city (wave 4A): rows at −88…92, boulevards at ±14.5/±43.5/±72.5, the canal bridge at CANAL_X 108.
const onStreet=p=>ROAD_Z.some(z=>Math.abs(p.z-z)<=2.81&&Math.abs(p.x)<=E.maxX-.5)||BOULEVARD_X.some(x=>Math.abs(p.x-x)<=1.31&&p.z>=E.minZ&&p.z<=E.maxZ)||p.x>=E.maxX-.5&&p.x<=riverEdges().x1+1&&p.z>=.4&&p.z<=3.6;
test('the 7×7 street grid: seven rows, six boulevards, everything inside the city extent',()=>{
 assert.deepEqual(ROAD_Z,[-88,-58,-28,2,32,62,92]);assert.deepEqual(BOULEVARD_X,[-72.5,-43.5,-14.5,14.5,43.5,72.5]);
 assert.deepEqual(E,{minX:-101.5,maxX:101.5,minZ:-101.5,maxZ:105.5});assert.equal(CANAL_X,108);assert.equal(METRO_Z,108);
});
test('a tap snaps to the nearest street or sidewalk',()=>{
 assert.deepEqual(snapToStreet({x:10,z:2.5}),{x:10,z:2.5},'already on the road');
 assert.deepEqual(snapToStreet({x:-29,z:-36}),{x:-29,z:-30.8},'inside a block: the nearer sidewalk edge');
 assert.deepEqual(snapToStreet({x:16,z:17}),{x:15.8,z:17},'between rows: the boulevard');
 assert.deepEqual(snapToStreet({x:200,z:-300}),{x:101,z:-90.8},'far outside: the city corner');
 assert.deepEqual(snapToStreet({x:109,z:9}),{x:109,z:3.6},'the canal bridge');
 assert.deepEqual(snapToStreet({x:75,z:-75}),{x:73.8,z:-75},'the new outer boulevard');
 for(let i=0;i<300;i++){const p={x:Math.sin(i*12.9)*120,z:Math.cos(i*7.3)*120},s=snapToStreet(p);assert.ok(onStreet(s),JSON.stringify(s));}
});
test('routes start where the character stands and end at the snapped point, along axis-aligned streets',()=>{
 const cases=[[frontOf('shibuya-5'),snapToStreet({x:-50,z:40})],[{x:14.5,z:15},{x:14.5,z:25}],[LANDMARKS[3],LANDMARKS[0]],[frontOf('ginza-1'),LANDMARKS[2]],[LANDMARKS[2],LANDMARKS[0]],[LANDMARKS[1],LANDMARKS[5]],[{x:0,z:2},{x:10,z:2}]];
 for(const [a,b] of cases){const r=exploreRoute(a,b);assert.deepEqual(r[0],{x:a.x,z:a.z});assert.deepEqual(r.at(-1),{x:b.x,z:b.z});
  for(let i=1;i<r.length;i++)assert.ok(r[i].x===r[i-1].x||r[i].z===r[i-1].z,'axis-aligned');}
 assert.equal(exploreRoute({x:14.5,z:15},{x:14.5,z:25}).length,2,'one boulevard: straight, no detour');
 for(let i=0;i<300;i++){const a=snapToStreet({x:Math.sin(i*3.1)*110,z:Math.cos(i*5.7)*110}),b=i%3?snapToStreet({x:Math.cos(i*1.3)*110,z:Math.sin(i*2.9)*110}):LANDMARKS[i%LANDMARKS.length],r=exploreRoute(a,b);
  assert.deepEqual([r[0],r.at(-1)],[{x:a.x,z:a.z},{x:b.x,z:b.z}]);for(let k=1;k<r.length;k++)assert.ok(Math.abs(r[k].x-r[k-1].x)<1e-9||Math.abs(r[k].z-r[k-1].z)<1e-9,JSON.stringify(r));}
 const side=exploreRoute(frontOf('shibuya-1'),LANDMARKS[1]);assert.ok(side.slice(1,-1).every(p=>Math.abs(Math.abs(p.z-2)-2.35)<1e-9),'rows on the sidewalk, off the traffic lanes');
 const bridge=exploreRoute(LANDMARKS[2],LANDMARKS[0]);assert.equal(bridge[1].z,2,'a row that starts the route keeps the centre');
 assert.equal(groundY(0,0),.26);assert.ok(Math.abs(groundY(CANAL_X,2)-.93)<1e-9,'on the bridge deck');assert.equal(groundY(CANAL_X,10),.26);assert.equal(groundY(79,2),.26,'the old canal is city now');
 assert.ok(Math.abs(groundY(riverEdges().x1+1,2)-.93)<1e-9,'the deck reaches the east bank');assert.equal(groundY(126,2),.26);
});
test('POI picking never returns the current POI twice in a row',()=>{
 const pois=cityPois([{plotId:'shibuya-2',type:'project',phase:'open',name:'Arc',ticker:'ARC'},{plotId:'ueno-5',type:'apartment',name:'Nao'},{plotId:'nakano-6',type:'apartment',name:'Me'},{plotId:'ginza-1',type:'project',phase:'thinking',name:'X'}],'nakano-6');
 assert.deepEqual(pois.filter(p=>p.kind!=='landmark').map(p=>p.id),['shibuya-2','ueno-5'],'launched + other residents, not my own home, not unlaunched');
 let last=null,seed=1;const rand=()=>(seed=seed*16807%2147483647)/2147483647;const kinds=new Set();
 for(let i=0;i<500;i++){const p=pickPoi(pois,last,rand);assert.notEqual(p.id,last);kinds.add(p.kind);last=p.id;}
 assert.deepEqual([...kinds].sort(),['landmark','launch','resident']);
 assert.equal(pickPoi([LANDMARKS[0]],'tower'),null,'nothing else to go to');assert.equal(pickPoi(undefined,null),null);
 assert.equal(pickPoi([LANDMARKS[0]],'tower',()=>.9999),null);assert.equal(pickPoi(LANDMARKS,null,()=>.99999).id,LANDMARKS.at(-1).id);
});
test('idle timer fires once after 8 s without input, and again only after a poke',()=>{
 const t=idleTimer();let fired=0;for(let i=0;i<79;i++)fired+=t.tick(.1);assert.equal(fired,0);
 for(let i=0;i<50;i++)fired+=t.tick(.1);assert.equal(fired,1);
 t.poke();for(let i=0;i<70;i++)fired+=t.tick(.1);assert.equal(fired,1);t.poke();for(let i=0;i<90;i++)fired+=t.tick(.1);assert.equal(fired,2);
 assert.equal(IDLE_S,8);
});
test('districts by position',()=>{
 assert.equal(districtAt(29,2),'Shibuya');assert.equal(districtAt(-29,-28),'Shiba');assert.equal(districtAt(0,2),"SUB-01's block");assert.equal(districtAt(CANAL_X,2),'the waterfront');assert.equal(districtAt(-25,METRO_Z),'the metro line');
 assert.equal(districtAt(87,-58),'Kichijoji');assert.equal(districtAt(-87,92),'Kita-Senju');assert.equal(districtAt(79,2),'Omotesando');
 for(const l of LANDMARKS)assert.ok(Math.abs(l.x)<=CANAL_X&&l.z>=E.minZ&&l.z<=METRO_Z,l.id);
});
// A fake roaming handle that teleports to the end of each route.
function fakeRoam(at){const r={x:at.x,z:at.z,routes:[],emotes:[],faced:null,
 go(path,{run,done}){r.routes.push({path,run});r.pending=()=>{r.x=path.at(-1).x;r.z=path.at(-1).z;done?.();};},halt(){},face(y){r.faced=y;},emote(n){r.emotes.push(n);return true;},stopEmote(){},play(){},
 arrive(){const f=r.pending;r.pending=null;f?.();}};return r;}
test('explorer: taps walk, 8 s idle starts the autopilot, places pause 5–12 s, home ends it',()=>{
 const home=frontOf('nakano-6'),roam=fakeRoam(home),toasts=[],greets=[],states=[],acts=[];let homeDone=0;
 const ex=createExplorer({roam,homeAt:()=>home,pois:()=>[...LANDMARKS,{id:'ueno-5',kind:'resident',name:'Nao',plotId:'ueno-5',...frontOf('ueno-5'),yaw:Math.PI/2,emotes:[]}],
  canEmote:n=>n==='dance'||n==='selfie',onToast:p=>toasts.push(p.id),onGreet:p=>greets.push(p.name),onState:s=>states.push(s),onActivity:d=>acts.push(d),onHome:()=>homeDone++,rand:()=>.1});
 const to=ex.tap({x:29,z:9},{run:true});assert.deepEqual(to,{x:29,z:4.8});assert.equal(roam.routes[0].run,true);assert.equal(ex.state,'walk');
 roam.arrive();assert.equal(ex.state,'idle');ex.update(.3);assert.ok(acts.includes('Shibuya'));
 for(let i=0;i<25;i++)ex.update(.3);assert.equal(ex.state,'idle','not before 8 s');ex.update(.3);assert.equal(ex.state,'auto');
 roam.arrive();assert.equal(ex.state,'pause');ex.update(.3);assert.equal(toasts.at(-1),ex.poi.id,'landmark toast on arrival');
 assert.equal(roam.faced,ex.poi.yaw);assert.ok(roam.emotes.length<=1);
 const first=ex.poi.id;let t=0;while(ex.state==='pause'&&t<20){ex.update(.25);t+=.25;}assert.ok(t>=PAUSE_S[0]&&t<=PAUSE_S[1]+.5,'pause '+t);
 assert.equal(ex.state,'auto');assert.notEqual(ex.poi.id,first,'never the same place twice in a row');
 ex.tap({x:0,z:0});assert.equal(ex.state,'walk','a tap takes over from the autopilot');roam.arrive();
 ex.home();assert.equal(ex.state,'home');assert.deepEqual(roam.routes.at(-1).path.at(-1),{x:home.x,z:home.z});roam.arrive();assert.equal(homeDone,1);assert.equal(ex.state,'done');
 assert.equal(ex.tap({x:1,z:1}),null,'finished explorers ignore taps');
});
test('explore shares the one roaming model with visits; the pet follows and stops',async()=>{
 const scene=new THREE.Group(),ev=createCityEvents(scene,{mobile:true}),root=new THREE.Group();let ended=0,started=0;
 const char={root,play(){},stride(){},update(){},dispose(){root.removeFromParent();}};
 const h=ev.explore({at:frontOf('nakano-6'),pet:{kind:'dog'},load:async()=>char,onStart:()=>started++,onEnd:()=>ended++});
 assert.ok(h);assert.equal(ev.explore({at:frontOf('nakano-6'),load:async()=>char}),null,'one roaming model');assert.equal(ev.visit({from:'shibuya-6',to:'shibuya-5',load:async()=>char}),false);
 await new Promise(r=>setTimeout(r,0));assert.equal(started,1);assert.equal(ev.roaming,'explore');assert.equal(ev.visiting,false);assert.ok(ev.pet);
 const to=snapToStreet({x:-20,z:2});let done=0;h.go(exploreRoute({x:h.x,z:h.z},to),{done:()=>done++});
 for(let i=0;i<1500&&!done;i++)ev.update(.05);assert.equal(done,1);assert.ok(Math.hypot(h.x-to.x,h.z-to.z)<1e-6);
 for(let i=0;i<80;i++)ev.update(.05);const pet=ev.pet,d=Math.hypot(pet.position.x-h.x,pet.position.z-h.z);assert.ok(Math.abs(d-.9)<.05,'pet waits 0.9 behind: '+d);
 const before=pet.position.clone();ev.update(.05);assert.ok(before.distanceTo(pet.position)<1e-3,'pet stopped');
 ev.endRoam();assert.equal(ended,1);assert.equal(ev.roaming,null);assert.equal(ev.pet,null);assert.equal(pet.parent,null,'pet disposed');
 assert.equal(ev.visit({from:'shibuya-6',to:'shibuya-5',load:async()=>char}),true,'slot free for a visit');ev.cancelVisit();
});
test('explorer: at a resident’s door it greets instead of emoting',()=>{
 const roam=fakeRoam(frontOf('shibuya-1')),greets=[];const nao={id:'ueno-5',kind:'resident',name:'Nao',plotId:'ueno-5',...frontOf('ueno-5'),yaw:Math.PI/2,emotes:[]};
 const ex=createExplorer({roam,homeAt:()=>frontOf('shibuya-1'),pois:()=>[nao],canEmote:()=>true,onGreet:p=>greets.push(p.name),rand:()=>0});
 for(let i=0;i<40&&ex.state==='idle';i++)ex.update(.25);assert.equal(ex.state,'auto');assert.deepEqual(roam.routes.at(-1).path.at(-1),{x:nao.x,z:nao.z});
 roam.arrive();assert.deepEqual(greets,['Nao']);assert.equal(roam.emotes.length,0);assert.equal(roam.faced,Math.PI/2);
 for(let i=0;i<60;i++)ex.update(.25);assert.equal(ex.state,'idle','nowhere new to go: waits');
});
