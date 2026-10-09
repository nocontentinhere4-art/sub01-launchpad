import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cityPlots,createBuilding,readBuildings,plotView} from '../src/city-state.js';
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
 assert.equal(cityPlots.length,48);assert.equal(new Set(cityPlots.map(p=>p.id)).size,48);
 const scene=new THREE.Scene(),interactive=[];const city=createCity(scene,interactive,()=>{},[]);
 assert.equal(interactive.length,2);assert.equal(interactive[0].count,48);
 const meshes=()=>{let count=0;scene.traverse(n=>{if(n.isMesh)count++;});return count;};
 const initial=meshes();city.redraw([build()]);assert.equal(meshes(),initial);assert.ok(initial<25);
});
test('clicking an instanced city building resolves its project after a redraw',()=>{
 let selected;const city=createCity(new THREE.Scene(),[],p=>selected=p,[]);
 city.redraw([build()]);assert.equal(city.select({object:{userData:{cityPlot:true}},instanceId:0}),true);assert.equal(selected.name,'Tokyo Radio');assert.equal(selected.claimed,true);
});
