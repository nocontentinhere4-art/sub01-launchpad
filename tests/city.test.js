import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cityPlots,districts,RING3,CITY_EXTENT,createBuilding,readBuildings,plotView,RESERVED_PLOTS,tower,TRANSMITTER,SHIBUYA_TOWER,ROAD_Z,BOULEVARD_X,OUTER_BOULEVARD_X} from '../src/city-state.js';
import {createCity} from '../src/city.js';
const build=(plot=cityPlots[0].id,existing=[])=>createBuilding(plot,'Tokyo Radio','A community radio station for this city.','radio','studio','mint',existing,'demo');
test('a building has a valid address and a local concept ticker; addresses cannot be reused',()=>{
 const b=build();assert.equal(b.ticker,'RADIO');assert.equal(b.mode,'local-preview');assert.throws(()=>build(b.plotId,[b]));
 assert.throws(()=>build('unknown'));assert.throws(()=>createBuilding(b.plotId,'Tokyo','Long enough idea','<script>','studio','mint'));
});
test('saved city projects recover, with invalid and duplicate address records rejected',()=>{
 const b=build(),recovered=readBuildings({getItem:()=>JSON.stringify([b,b,{...b,plotId:'unknown'}])});assert.equal(recovered.length,1);assert.equal(recovered[0].plotId,b.plotId);
 assert.deepEqual(readBuildings({getItem:()=>'{invalid'}),[]);assert.equal(plotView(cityPlots[0],recovered).claimed,true);
});
test('city addresses are unique, separated and the geometry stays batched after creation',()=>{
 assert.equal(cityPlots.length,288);assert.equal(new Set(cityPlots.map(p=>p.id)).size,288);
 const scene=new THREE.Scene(),interactive=[];const city=createCity(scene,interactive,()=>{},[]);
 assert.equal(interactive.length,2);assert.equal(interactive[0].count,288);
 const meshes=()=>{let count=0;scene.traverse(n=>{if(n.isMesh)count++;});return count;};
 // Wave 5A: + prisms, awnings and the tower ribbon lattice (3 meshes).
 // Wave 5C: + the Skytree and the expressway viaduct (2 meshes). 2026-10-10: + the bike-wheel cylinder batch (1 mesh).
 const initial=meshes();city.redraw([build()]);assert.equal(meshes(),initial);assert.ok(initial<46,`meshes ${initial}`);
});
test('clicking an instanced city building resolves its project after a redraw',()=>{
 let selected;const city=createCity(new THREE.Scene(),[],p=>selected=p,[]);
 city.redraw([build()]);assert.equal(city.select({object:{userData:{cityPlot:true}},instanceId:0}),true);assert.equal(selected.name,'Tokyo Radio');assert.equal(selected.claimed,true);
});

import {addCityLife} from '../src/city-life.js';
test('city expansion preserves old addresses and trains move within the rail route',()=>{
 assert.equal(cityPlots.find(p=>p.id==='shibuya-6').x,37);assert.equal(cityPlots.find(p=>p.id==='shibuya-6').z,8);
 const life=addCityLife(new THREE.Group());life.update(0);const x=life.trains[0].position.x;life.update(5);assert.notEqual(life.trains[0].position.x,x);
 for(const seconds of [0,5,60,1000]){life.update(seconds);for(const train of life.trains)assert.ok(train.position.x>=CITY_EXTENT.minX&&train.position.x<=CITY_EXTENT.maxX);}
});

// Wave 4A: 7×7 city. The first 24 districts (and their 144 ids, in the server's order) are untouched.
const FIRST24=['shiba','shinjuku','akihabara','shibuya','harajuku','nakameguro','ebisu','roppongi','ginza','asakusa','ueno','ikebukuro','nakano',
 'kanda','tsukiji','odaiba','yoyogi','meguro','shinagawa','sumida','daikanyama','nihonbashi','koenji','shimokitazawa'];
test('48 districts × 6 plots; the first 24 keep their ids, order and positions; the third ring fills the 7×7 grid',()=>{
 assert.equal(districts.length,48);assert.deepEqual(districts.slice(0,24).map(d=>d.id),FIRST24);assert.deepEqual(districts.slice(24).map(d=>d.id),RING3);
 assert.equal(new Set(districts.map(d=>d.id)).size,48);assert.ok(districts.every(d=>/^[a-z]+$/.test(d.id)),'lowercase ids, no dashes');
 assert.deepEqual(cityPlots.slice(0,144).map(p=>p.id),FIRST24.flatMap(d=>[1,2,3,4,5,6].map(n=>`${d}-${n}`)));
 assert.deepEqual(['shiba-1','shibuya-6','ginza-1','shimokitazawa-6'].map(id=>{const p=cityPlots.find(c=>c.id===id);return [p.x,p.z];}),[[-37,-34],[37,8],[-66,-64],[66,68]]);
 const cells=new Set(districts.map(d=>`${d.x/29},${(d.z-2)/30}`));assert.equal(cells.size,48);assert.ok(!cells.has('0,0'),'the centre stays the hero block');
 for(const d of districts)assert.ok(Math.abs(d.x/29)<=3&&Math.abs((d.z-2)/30)<=3);
 assert.ok(districts.slice(24).every(d=>Math.abs(d.x)===87||Math.abs(d.z-2)===90),'the new ring is the outer one');
});

// Owner 2026-10-10: the landmark settings (tower park, transmitter compound, Shibuya plaza) and the variety spots draw
// inside the same batches; reserved plots have no pick box.
import {cityLayout,TOWER_PARK,TRANSMITTER_YARD} from '../src/lots.js';
import {TOWER} from '../src/tokyo-tower.js';
test('city: reserved plots get no pick box or height; the park, pitch, compound, plaza and variety spots draw without new batches',()=>{
 const scene=new THREE.Scene(),interactive=[],city=createCity(scene,interactive,()=>{},[]);
 const m=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
 for(const id of RESERVED_PLOTS){interactive[0].getMatrixAt(cityPlots.findIndex(p=>p.id===id),m);m.decompose(pos,q,sc);
  assert.ok(pos.y<-50&&sc.x<.1&&sc.y<.1,`${id} pick hidden`);assert.equal(city.heightOf(id),null);}
 const st=city.stats();assert.equal(st.drawCalls,9,'no new batches');assert.ok(st.marks>2500&&st.walls>12500,'pitch lines, fences, boulevard furniture');
 assert.equal(st.footTown,undefined,'no podium over the Shiba street');
 // the same drawing with a building saved on a reserved plot and with the ring-3 spots in every kind
 const before=JSON.stringify(st);city.redraw([{plotId:'shiba-2',type:'project',color:'orange',phase:'open',progress:1},{plotId:'nakano-3',type:'apartment',color:'mint',phase:'open'},{plotId:'shibuya-3',type:'studio',color:'sand',phase:'open'}]);assert.equal(JSON.stringify(city.stats()),before);
 const kinds=new Set(cityLayout([]).spots.map(s=>s.kind));for(const k of ['pitch','court','playground','park'])assert.ok(kinds.has(k),k);
 // the tower's pick box and label anchor follow city-state tower
 const pick=interactive[1];assert.equal(pick.userData.place,tower);assert.deepEqual([pick.position.x,pick.position.z],[tower.x,tower.z]);
});
// Owner 2026-10-10 "no structure in the middle of a street": every ground-standing landmark has its own place off the
// roads (3.25 = a street's half width without a sidewalk, 1.3 = a boulevard's half width), inside its reserved ground.
test('city: no landmark stands on a road; each one is inside its reserved ground',()=>{
 const blvds=[...BOULEVARD_X,...OUTER_BOULEVARD_X],off=(x,z,half)=>{for(const r of ROAD_Z)assert.ok(Math.abs(z-r)>3.25+half,`z ${z} ± ${half} on the road row ${r}`);for(const b of blvds)assert.ok(Math.abs(x-b)>1.3+half,`x ${x} ± ${half} on the boulevard ${b}`);};
 const inside=(x,z,half,B)=>assert.ok(x-half>=B.x0&&x+half<=B.x1&&z-half>=B.z0-.5&&z+half<=B.z1,`${x},${z} ± ${half} outside ${JSON.stringify(B)}`);
 const legs=TOWER.feet+Math.max(TOWER.leg,.475);off(tower.x,tower.z,legs);   // the leg chord, or the .95 footinginside(tower.x,tower.z,legs,TOWER_PARK);
 off(TRANSMITTER.x,TRANSMITTER.z,2);inside(TRANSMITTER.x,TRANSMITTER.z,2,TRANSMITTER_YARD);
 const p3=cityPlots.find(p=>p.id==='shibuya-3');off(SHIBUYA_TOWER.x,SHIBUYA_TOWER.z,1.85);inside(SHIBUYA_TOWER.x,SHIBUYA_TOWER.z,1.85,{x0:p3.x-2.9,x1:p3.x+2.9,z0:p3.z-2.7,z1:p3.z+2.7});
 assert.equal(TRANSMITTER.plotId,'nakano-3');assert.equal(SHIBUYA_TOWER.plotId,'shibuya-3');
});

test('city: coin tiers add the lit canopy, the roof kit and the penthouse to the existing batches; no draw call, no height change',async()=>{
 const {createCity}=await import('../src/city.js');const {mockStats}=await import('../src/coin-tier.js');
 const city=createCity(new THREE.Group(),[],()=>{},[]);const at=(tier,trend='up')=>[{plotId:'shibuya-2',type:'project',color:'mint',phase:'open',progress:1,name:'Arc',ticker:'ARC',stats:tier==null?null:mockStats(tier,trend)}];
 city.redraw(at(null));const base=city.stats(),h=city.heightOf('shibuya-2');
 city.redraw(at(1));const t1=city.stats();assert.equal(JSON.stringify(t1),JSON.stringify(base),'tier 1: nothing beyond the launched look');
 city.redraw(at(2));const t2=city.stats();assert.equal(t2.drawCalls,base.drawCalls);assert.ok(t2.windows>base.windows&&t2.walls>base.walls,'canopy');
 city.redraw(at(3,'down'));const t3=city.stats();assert.equal(t3.drawCalls,base.drawCalls);assert.ok(t3.windows>t2.windows+4,'parapet strips + garden lamps + mast tip');assert.ok(t3.walls>t2.walls,'penthouse');
 city.redraw(at(4));const t4=city.stats();assert.equal(t4.drawCalls,base.drawCalls);assert.ok(t4.instances>=t3.instances-2);
 assert.equal(city.heightOf('shibuya-2'),h,'the building height never follows market data');
 city.redraw(at(null));assert.equal(JSON.stringify(city.stats()),JSON.stringify(base),'back to the plain look');
});
