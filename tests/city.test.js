import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cityPlots,districts,RING3,CITY_EXTENT,createBuilding,readBuildings,plotView} from '../src/city-state.js';
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
 const initial=meshes();city.redraw([build()]);assert.equal(meshes(),initial);assert.ok(initial<43,`meshes ${initial}`);
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
