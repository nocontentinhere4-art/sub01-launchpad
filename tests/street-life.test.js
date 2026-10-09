import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {crossingState,sidewalkState,addCityCrowd} from '../src/city-crowd.js';
import {vehicleState,addCityTraffic} from '../src/city-traffic.js';
import {trainPosition} from '../src/city-life.js';

test('Shibuya traffic waits while people cross and pedestrians finish before traffic resumes',()=>{
 for(let t=0;t<48;t+=.25){
  for(let i=0;i<16;i++){const p=crossingState(t,i);assert.ok(p.progress>=0&&p.progress<=1);if(p.moving)assert.equal(vehicleState(t,0).moving,false);}
 }
 assert.equal(vehicleState(1,0).x,vehicleState(8,0).x);
 assert.notEqual(vehicleState(10,0).x,vehicleState(14,0).x);
 assert.equal(crossingState(8.9,15).moving,false);
});
test('pedestrians stay on sidewalks and dynamic crowd instances keep finite transforms',()=>{
 const crowd=addCityCrowd(new THREE.Group()),mobile=addCityCrowd(new THREE.Group(),{mobile:true});
 assert.equal(crowd.people.length,80);assert.equal(mobile.people.length,48);
 for(const t of [0,8,24,48,999]){crowd.update(t);for(let i=0;i<crowd.boxes.count;i++){const m=new THREE.Matrix4();crowd.boxes.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite));assert.ok(m.determinant()>0);}for(let i=0;i<64;i++){const s=sidewalkState(t,i);assert.ok(Math.abs(s.x)<71&&Math.abs(s.z)<66);}}
});
test('traffic renders a complete fixed-size batch without extra meshes per update',()=>{
 const parent=new THREE.Group(),traffic=addCityTraffic(parent);assert.equal(traffic.mesh.count,240);
 for(const t of [0,9,23,300]){traffic.update(t);for(let i=0;i<traffic.mesh.count;i++){const m=new THREE.Matrix4();traffic.mesh.getMatrixAt(i,m);assert.ok(m.determinant()>0);}}
 assert.equal(traffic.root.children.length,1);
});
test('train stops at the station and remains continuous through its loop boundary',()=>{
 assert.equal(trainPosition(17),-26);assert.equal(trainPosition(20),-26);
 assert.ok(Math.abs(trainPosition(108-.001)-trainPosition(108+.001))<.01);
 for(let t=0;t<220;t+=.5)assert.ok(trainPosition(t)>=-66&&trainPosition(t)<=66);
});
