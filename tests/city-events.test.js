import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {freshEvents,signText,partySpots,visitRoute,decorations,decorItems,buildFireworks,buildConfetti,createCityEvents,FIRE_AGE} from '../src/city-events.js';
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
test('decorations: launched get neon + graffiti + spotlight, built sites waiting get OPEN SOON, nothing otherwise',()=>{
 const b=[{plotId:'shibuya-2',type:'project',phase:'open',ticker:'ARC',name:'Arc'},{plotId:'shibuya-3',type:'project',phase:'review',name:'Owl'},
  {plotId:'shibuya-4',type:'project',phase:'launch',name:'Melon'},{plotId:'shibuya-1',type:'project',phase:'thinking',name:'Idea'},{plotId:'ueno-3',type:'apartment',phase:'home',name:'Mika'}];
 const d=decorations(b,[{kind:'launched',plotId:'shibuya-4',at:1},{kind:'launched',plotId:'shibuya-1',at:1}]);
 assert.deepEqual(d.open.map(x=>x.plotId),['shibuya-2','shibuya-4']);assert.deepEqual(d.soon.map(x=>x.plotId),['shibuya-3']);
 const items=decorItems(d);assert.equal(items.signs.filter(s=>s.kind==='neon').length,2);assert.equal(items.signs.filter(s=>s.kind==='soon').length,1);assert.equal(items.cones.length,2);
 for(const s of items.signs)assert.ok([s.x,s.y,s.z,s.w,s.h].every(Number.isFinite));
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
 ev.decorate([{plotId:'shibuya-2',type:'project',phase:'open',ticker:'ARC',name:'Arc'}],[]);assert.equal(ev.stats().cones,1);assert.equal(ev.stats().boxes,3);
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
