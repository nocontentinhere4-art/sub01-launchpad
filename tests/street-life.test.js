import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {crossingState,addCityCrowd,CROWD_COUNT,PARTS} from '../src/city-crowd.js';
import {addCityTraffic,trafficLightPhase} from '../src/city-traffic.js';
import {trainPosition} from '../src/city-life.js';
import {CITY_EXTENT as E,CANAL_X,districts} from '../src/city-state.js';

test('the Shibuya scramble phase: everyone finishes crossing before traffic resumes',()=>{
 for(let t=0;t<48;t+=.25)for(let i=0;i<16;i++){const p=crossingState(t,i);assert.ok(p.progress>=0&&p.progress<=1);if(p.moving)assert.equal(trafficLightPhase(t).vehicle,'red');}
 assert.equal(crossingState(8.9,15).moving,false);
});
test('pedestrians stay in the city on its streets; box figures are finite, hidden people are zero-size',()=>{
 const crowd=addCityCrowd(new THREE.Group(),{hour:13}),mobile=addCityCrowd(new THREE.Group(),{mobile:true,hour:13});
 assert.equal(crowd.people.length,CROWD_COUNT.desktop);assert.equal(mobile.people.length,CROWD_COUNT.mobile);
 for(const p of crowd.people)assert.ok(p.look?.outfit&&/^#[0-9a-f]{6}$/i.test(p.look.top),'every pedestrian has a look');
 const m=new THREE.Matrix4();
 for(let t=0;t<40;t+=1/30){crowd.update(t);}
 for(const p of crowd.people){const a=p.agent;
  for(let k=0;k<PARTS;k++){crowd.boxes.getMatrixAt(p.index*PARTS+k,m);assert.ok(m.elements.every(Number.isFinite));if(!a.visible)assert.equal(m.determinant(),0);}
  if(a.visible){crowd.boxes.getMatrixAt(p.index*PARTS,m);assert.ok(m.determinant()>0);assert.ok(a.x>=E.minX-1&&a.x<=CANAL_X&&a.z>=E.minZ-1&&a.z<=E.maxZ+1,`${a.x},${a.z}`);}}
 const vis=crowd.people.filter(p=>p.agent.visible).length;assert.ok(vis>40,`${vis} people out at 13:00`);
 // The centre is busier than the third ring.
 const inRing=p=>{const d=districts.find(d=>Math.abs(p.agent.x-d.x)<=14.5&&Math.abs(p.agent.z-d.z)<=15);return d?.ring===3;};
 const ringN=crowd.people.filter(p=>p.agent.visible&&inRing(p)).length,ringD=districts.filter(d=>d.ring===3).length;
 assert.ok(ringN/ringD<(vis-ringN)/(districts.length-ringD),'outer ring sparser per district');
});
test('up close the crowd hides its boxes and pushes every visible pedestrian to the GPU crowd (walk/idle, umbrellas in rain)',()=>{
 const crowd=addCityCrowd(new THREE.Group(),{mobile:true,hour:13}),pushed=[];
 const gpu={active:true,limits:{cap:64},push:(look,x,y,z,yaw,o)=>{pushed.push({look,x,y,z,yaw,...o});return true;}};
 crowd.setWeather('rain');for(let t=0;t<3;t+=1/30){pushed.length=0;crowd.update(t,gpu);}
 assert.equal(crowd.boxes.visible,false);assert.equal(pushed.length,crowd.people.filter(p=>p.agent.visible).length);
 for(const p of pushed){assert.ok([p.x,p.z,p.yaw,p.rate,p.scale].every(Number.isFinite));assert.ok(['Walk','Idle'].includes(p.clip));}
 assert.ok(pushed.some(p=>p.clip==='Walk'),'people walk');assert.ok(pushed.filter(p=>p.umbrella>=0).length>pushed.length*.6,'umbrellas up');
 crowd.setWeather('clear');pushed.length=0;crowd.update(3.1,gpu);assert.ok(pushed.every(p=>p.umbrella===-1));
 gpu.active=false;crowd.update(3.2,gpu);assert.equal(crowd.boxes.visible,true);
 assert.ok(crowd.stats.ms>=0&&crowd.stats.out>0);
});
test('traffic: fixed batches (one per vehicle type + wheels), no new meshes per update, finite transforms',()=>{
 const parent=new THREE.Group(),traffic=addCityTraffic(parent),n=traffic.root.children.length;
 for(const t of [0,9,23,300]){traffic.update(t);for(const M of Object.values(traffic.meshes))for(let i=0;i<M.mesh.count;i++){const m=new THREE.Matrix4();M.mesh.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite));}}
 assert.equal(traffic.root.children.length,n);
});
test('train stops at the station and remains continuous through its loop boundary',()=>{
 assert.equal(trainPosition(17),-26);assert.equal(trainPosition(20),-26);
 assert.ok(Math.abs(trainPosition(108-.001)-trainPosition(108+.001))<.01);
 for(let t=0;t<220;t+=.5)assert.ok(trainPosition(t)>=-66&&trainPosition(t)<=66);
});
