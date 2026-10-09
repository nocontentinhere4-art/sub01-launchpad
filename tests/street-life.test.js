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
 assert.equal(crowd.people.length,160);assert.equal(mobile.people.length,80);
 for(const p of crowd.people)assert.ok(p.look?.outfit&&/^#[0-9a-f]{6}$/i.test(p.look.top),'every pedestrian has a look');
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
test('up close the crowd hides its boxes and pushes every pedestrian to the GPU crowd with walk/idle clips',()=>{
 const crowd=addCityCrowd(new THREE.Group(),{mobile:true}),pushed=[];
 const gpu={active:true,push:(look,x,y,z,yaw,o)=>{pushed.push({look,x,y,z,yaw,...o});return true;}};
 crowd.update(3,gpu);assert.equal(crowd.boxes.visible,false);assert.equal(pushed.length,80);
 for(const p of pushed){assert.ok([x=>x.x,x=>x.z,x=>x.yaw,x=>x.rate,x=>x.scale].every(f=>Number.isFinite(f(p))));assert.ok(['Walk','Idle'].includes(p.clip));}
 assert.ok(pushed.some(p=>p.clip==='Walk'),'people walk');
 gpu.active=false;crowd.update(3,gpu);assert.equal(crowd.boxes.visible,true);
});
test('sidewalk walkers cluster at crossings, konbini and stations instead of spreading evenly',async()=>{
 const {crowdHotspots}=await import('../src/city-crowd.js'),spots=crowdHotspots();
 for(const kind of ['crossing','konbini','station'])assert.ok(spots.some(s=>s.kind===kind),kind);
 for(const t of [3,40,200]){const pts=Array.from({length:144},(_,i)=>sidewalkState(t,i));
  const near=pts.filter((p,i)=>pts.some((q,j)=>j!==i&&Math.hypot(p.x-q.x,p.z-q.z)<1.6)).length/pts.length;
  const atSpot=pts.filter(p=>spots.some(s=>Math.hypot(p.x-s.x,p.z-s.z)<3)).length/pts.length;
  assert.ok(near>.5,`only ${near} have someone within 1.6 at t=${t}`);assert.ok(atSpot>.35,`only ${atSpot} near a hotspot at t=${t}`);
  assert.ok(pts.some(p=>!p.moving)&&pts.some(p=>p.moving),'some wait, some walk');
  for(const p of pts)assert.ok(Number.isFinite(p.speed)&&p.speed>.5&&p.speed<1.1);}
});
test('traffic: dark-indigo taxis with roof signs, white kei trucks, green/cream buses, 15 boxes each',async()=>{
 const {VEHICLE_KINDS}=await import('../src/city-traffic.js'),traffic=addCityTraffic(new THREE.Group()),c=new THREE.Color();
 assert.equal(VEHICLE_KINDS.length,16);assert.equal(VEHICLE_KINDS.filter(k=>k==='taxi').length,5);assert.equal(VEHICLE_KINDS.filter(k=>k==='kei').length,3);
 assert.deepEqual(VEHICLE_KINDS.flatMap((k,i)=>k==='bus'?[i]:[]),[9,13]);
 const hex=(i,j)=>{traffic.mesh.getColorAt(i*15+j,c);return '#'+c.getHexString().toUpperCase();};
 VEHICLE_KINDS.forEach((k,i)=>{
  if(k==='taxi'){assert.equal(hex(i,0),'#1F2A44');assert.equal(hex(i,14),'#F0B23E');}
  if(k==='kei')assert.equal(hex(i,0),'#EEEDE8');
  if(k==='bus'){assert.equal(hex(i,0),'#3E7A5C');assert.equal(hex(i,1),'#EDE6D2');}});
});
