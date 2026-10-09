import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addCityTraffic,fleetPlan,VEHICLE_KINDS,FLEET_CAP,PER_DISTRICT,vehicleState,setTrafficQuality} from '../src/city-traffic.js';
import {TYPES,TYPE_NAMES,vehicleGeometry,ROLE} from '../src/vehicles.js';
import {streetWorld,pointAt,BOX_X,BOX_Z,streetQuality} from '../src/street-graph.js';
import {districts} from '../src/city-state.js';

const W=streetWorld(),links=W.roads.links,dt=1/30;
test('fleet: ≈0.6 vehicles per district, buses first, every vehicle type in the mix, capped by quality',()=>{
 assert.equal(VEHICLE_KINDS.length,Math.round(districts.length*PER_DISTRICT));assert.equal(VEHICLE_KINDS[0],'bus');
 assert.ok(fleetPlan(24).length<fleetPlan(48).length,'scales with the city');
 for(const t of TYPE_NAMES)assert.ok(VEHICLE_KINDS.includes(t),t);
 for(const t of TYPE_NAMES){const g=vehicleGeometry(t);g.computeBoundingBox();const b=g.boundingBox;
  assert.ok(b.max.z-b.min.z<=TYPES[t].len+.12&&b.max.z-b.min.z>TYPES[t].len-.3,`${t} length`);assert.ok(b.min.y>=0&&b.max.y<2.2);for(const k of ['aCol','aPart'])assert.ok(g.getAttribute(k));}
 const tr=addCityTraffic(new THREE.Group());setTrafficQuality(0);for(let t=0;t<2;t+=dt)tr.update(t);
 assert.ok(tr.stats.on<=FLEET_CAP.desktop[0]);setTrafficQuality(3);for(let t=2;t<40;t+=dt)tr.update(t);assert.ok(tr.stats.on>FLEET_CAP.desktop[0]);
});
// One long run shared by the behaviour tests.
const events=[],tr=addCityTraffic(new THREE.Group(),{seed:11,onEvent:(kind,v,info)=>events.push({kind,light:info.light,i:v.i})});
const log={offRoad:[],overlap:0,wheelJump:0,modes:new Set(),blink:0,turning:0,queued:0,kerb:0},P={};
const prev=new Map();
for(let t=0;t<420;t+=dt){tr.update(t);
 const byLink=new Map();
 for(const v of tr.vehicles){if(!v.on)continue;log.modes.add(v.mode);const L=links[v.link];
  if(L.kind===0){pointAt(L,v.s,P);const lat=Math.hypot(v.x-P.x,v.z-P.z);if(lat>Math.max(L.kerb-.75,.05)+.01)log.offRoad.push(`lane ${v.type} lat ${lat.toFixed(2)}`);
   if(v.s<-.01||v.s>L.len+.01)log.offRoad.push('beyond lane');(byLink.get(L.id)||byLink.set(L.id,[]).get(L.id)).push(v);}
  else if(L.kind===1){const J=W.roads.junctions[L.junction];if(Math.abs(v.x-J.x)>BOX_X+.01||Math.abs(v.z-J.z)>BOX_Z+.01)log.offRoad.push('turn outside the box');
   if(L.turn!=='S'){log.turning++;const M=tr.meshes[v.type];}}
  else if(L.kind===2){const B=W.roads.bays.find(b=>b.link===L.id);if(Math.abs(v.x-B.x)>2.3)log.offRoad.push('bay');}
  const p=prev.get(v.i);if(p!==undefined&&Math.abs(v.dist-p)>4*dt+1e-6)log.wheelJump++;prev.set(v.i,v.dist);
  if(v.mode==='kerb')log.kerb++;}
 for(const list of byLink.values()){list.sort((a,b)=>a.s-b.s);for(let k=1;k<list.length;k++){const a=list[k-1],b=list[k];if(b.s-a.s<(a.len+b.len)/2-.05)log.overlap++;if(b.v<.05&&a.v<.05&&b.s-a.s<(a.len+b.len)/2+3)log.queued++;}}
 // Indicators: every car on a left or right turn link blinks that side.
 for(const [type,M] of Object.entries(tr.meshes)){let j=0;for(const v of tr.vehicles){if(!v.on||v.type!==type)continue;const L=links[v.link];
  if(L.kind===1&&L.turn!=='S'&&v.mode==='drive'){log.blink+=M.lamp.array[j*4+(L.turn==='L'?0:1)]===1?1:0;}j++;}}
}
test('vehicles never leave their lanes, junction boxes or bays, and never overlap in a lane',()=>{
 assert.deepEqual(log.offRoad.slice(0,5),[]);assert.equal(log.overlap,0);
 for(const v of tr.vehicles)if(v.on)assert.ok([v.x,v.z,v.yaw].every(Number.isFinite));
});
test('light compliance: no car crosses a stop line on red (junctions and mid-block zebras); queues form at red',()=>{
 const enter=events.filter(e=>e.kind==='enter'),mid=events.filter(e=>e.kind==='mid');
 assert.ok(enter.length>300&&mid.length>20,`${enter.length} junction entries, ${mid.length} zebra passes`);
 assert.equal(enter.filter(e=>e.light===2).length,0);assert.equal(mid.filter(e=>e.light===2).length,0);
 assert.ok(log.queued>50,'cars wait nose to tail');
});
test('turn indicators, parking in and out, taxis at the kerb, the bus at its stops',()=>{
 assert.ok(log.turning>0&&log.blink===log.turning,`blink ${log.blink}/${log.turning}`);
 for(const m of ['drive','park','parked','unpark','stop'])assert.ok(log.modes.has(m),m);
 assert.ok(log.kerb>0,'a taxi pulled over');
 const bus=tr.vehicles.find(v=>v.type==='bus');assert.ok(bus.on&&tr.loop.links.includes(bus.link),'the bus stays on its loop');
});
test('wheels turn with the distance driven (continuous, reversing turns them back) and are drawn where the car is',()=>{
 assert.equal(log.wheelJump,0);
 const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();let w=0;
 for(const v of tr.vehicles){if(!v.on)continue;const T=TYPES[v.type];for(let k=0;k<T.wheels.length;k++,w++){tr.wheels.getMatrixAt(w,m);m.decompose(p,q,s);
  assert.ok(Math.hypot(p.x-v.x,p.z-v.z)<T.len,'wheel under its car');assert.ok(Math.abs(s.y-T.r*v.scale)<1e-4);
  const e=m.elements,ang=Math.atan2(e[6]/T.r/v.scale*Math.cos(v.yaw)+e[4]/T.r/v.scale*Math.sin(v.yaw),e[5]/T.r/v.scale);
  const want=Math.atan2(Math.sin(v.dist/T.r),Math.cos(v.dist/T.r));assert.ok(Math.abs(Math.atan2(Math.sin(ang-want),Math.cos(ang-want)))<1e-3,'wheel angle = distance / radius');}}
 assert.equal(w,tr.wheels.count);
});
test('city-life reads live vehicles: vehicleState follows the sim, parked-away when absent',()=>{
 const t2=addCityTraffic(new THREE.Group());t2.update(1);const v=t2.vehicles.find(v=>v.on&&v.i<16);const s=vehicleState(0,v.i);assert.equal(s.x,v.x);assert.equal(s.z,v.z);
 assert.ok(vehicleState(0,999).x>1e3);
});
