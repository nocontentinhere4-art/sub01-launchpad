import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {phaseOf,worldBuildings,planRoute,frontOf,sub01Goal,HOME_DESK} from '../src/world-sync.js';
import {addResidents} from '../src/residents.js';
import {createCity} from '../src/city.js';

const world={sub01:{state:'working',plotId:'shibuya-2',text:'Building ARC'},plots:[
 {plotId:'shibuya-2',kind:'project',resident:null,project:{slug:'arc',name:'Arc',ticker:'ARC',stage:'generating',stageLabel:'He is building it',progress:.45,launched:false,mint:null}},
 {plotId:'ginza-1',kind:'project',resident:null,project:{slug:null,name:'Private project',ticker:null,stage:'declined',progress:0}},
 {plotId:'ueno-3',kind:'apartment',resident:{name:'Mika',look:{skin:'#e0b090',hair:'#222222',hairStyle:'bun',top:'#ff7700',bottom:'#334455'}},project:null},
 {plotId:'nowhere-9',kind:'apartment',resident:{name:'X',look:{}},project:null}]};
test('every pipeline stage maps to a building phase; ended ideas leave no building',()=>{
 assert.equal(phaseOf('evaluating'),'thinking');assert.equal(phaseOf('generating'),'scaffold');assert.equal(phaseOf('approved'),'review');
 assert.equal(phaseOf('awaiting_signature'),'launch');assert.equal(phaseOf('launched'),'open');assert.equal(phaseOf('failed'),'stopped');
 assert.equal(phaseOf('declined'),null);assert.equal(phaseOf('cancelled'),null);
});
test('world snapshot becomes buildings only for known addresses',()=>{
 const b=worldBuildings(world);assert.deepEqual(b.map(x=>x.plotId),['shibuya-2','ueno-3']);
 assert.equal(b[0].phase,'scaffold');assert.equal(b[1].type,'apartment');
});
test('SUB-01 walks along streets to the site he is working on, and home when idle',()=>{
 const goal=sub01Goal(world),front=frontOf('shibuya-2');assert.deepEqual([goal.x,goal.z],[front.x,front.z]);assert.equal(goal.activity,'build');
 const route=planRoute(HOME_DESK,goal);assert.deepEqual(route[0],HOME_DESK);assert.deepEqual(route.at(-1),{x:goal.x,z:goal.z});
 for(let i=1;i<route.length;i++)assert.ok(route[i].x===route[i-1].x||route[i].z===route[i-1].z,'axis-aligned street segments');
 assert.equal(sub01Goal({sub01:{state:'idle'}}).activity,'desk');assert.equal(sub01Goal(null).activity,'desk');
});
test('residents are one instanced mesh with finite transforms; the city draws every phase',()=>{
 const r=addResidents(new THREE.Group());r.set([{x:1,z:2,look:world.plots[2].resident.look},{x:3,z:4,look:{}}]);r.update(5);
 assert.equal(r.mesh.count,12);const m=new THREE.Matrix4();for(let i=0;i<r.mesh.count;i++){r.mesh.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite));}
 const city=createCity(new THREE.Group(),[],()=>{},[]);
 for(const phase of ['thinking','scaffold','stopped','review','launch','open'])city.redraw([{plotId:'shibuya-2',type:'project',phase,progress:.5,name:'Arc',color:'orange'}]);
});
