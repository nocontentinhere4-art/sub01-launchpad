import test from 'node:test';
import assert from 'node:assert/strict';
import {createPopulation,scheduleAt,isNightHour,districtPull,tokyoHour,STATE,POSE,SCHEDULE,TILE} from '../src/npc.js';
import {streetWorld,ACT,walkWindow,walkLit,edgeBetween} from '../src/street-graph.js';
import {districts} from '../src/city-state.js';

const W=streetWorld(),g=W.graph,dt=1/30;
const run=(pop,from,to,each)=>{for(let t=from;t<to;t+=dt){pop.update(dt,t);each?.(t);}};
const ring3=d=>d.ring===3;
const where=a=>districts.find(d=>Math.abs(a.x-d.x)<=14.5&&Math.abs(a.z-d.z)<=15);

test('schedule by Tokyo hour: commute in the morning, ramen at noon, nightlife late, few people out at night',()=>{
 const top=h=>{const b=scheduleAt(h);return b.go.reduce((m,x)=>x[1]>m[1]?x:m)[0];};
 assert.equal(top(7.5),ACT.station);assert.equal(top(12.5),ACT.noren);assert.equal(top(15),ACT.shop);assert.equal(top(22),ACT.noren);
 assert.ok(scheduleAt(3).out<scheduleAt(12).out&&scheduleAt(3).out<.2);assert.ok(scheduleAt(18).out>=scheduleAt(10).out);
 assert.ok(isNightHour(23)&&isNightHour(2)&&!isNightHour(12));for(let h=0;h<24;h+=.5)assert.ok(scheduleAt(h));
 assert.equal(SCHEDULE[0].from,0);assert.equal(SCHEDULE.at(-1).to,24);
 const shibuya=districts.find(d=>d.id==='shibuya'),outer=districts.find(ring3),low=districts.find(d=>d.id==='yoyogi');
 assert.ok(districtPull(shibuya,23)>districtPull(low,23)*4,'night: Shibuya keeps its crowd');
 assert.ok(districtPull(shibuya,12)>districtPull(low,12)&&districtPull(low,12)>districtPull(outer,12),'high > low > outer ring');
 // Real clock: UTC+9; a forced night (main.js day mode) keeps the schedule on the drawn side.
 assert.ok(Math.abs(tokyoHour(Date.UTC(2026,0,1,3,30))-12.5)<1e-9);assert.equal(tokyoHour(Date.UTC(2026,0,1,3),1),22);assert.equal(tokyoHour(Date.UTC(2026,0,1,14),0),13);
});
test('people spread out: no two share a 0.5 m tile when they come out of a door, and almost never while walking',()=>{
 const pop=createPopulation({count:160,seed:5,hour:13}),vis=new Map();let spawns=0,shared=0,samples=0;
 const tile=a=>`${Math.floor(a.x/TILE)},${Math.floor(a.z/TILE)}`,grp=a=>a.leader<0?a.i:a.leader;
 const start=pop.agents.filter(a=>a.visible&&a.leader<0);assert.equal(new Set(start.map(tile)).size,start.length,'warm start: distinct tiles');
 run(pop,0,200,t=>{
  const tiles=new Map();for(const a of pop.agents)if(a.visible){const k=tile(a);(tiles.get(k)||tiles.set(k,[]).get(k)).push(a);}
  for(const a of pop.agents){if(a.visible&&!vis.get(a.i)&&a.leader<0){spawns++;const others=tiles.get(tile(a)).filter(b=>grp(b)!==grp(a));assert.equal(others.length,0,`spawn of ${a.i} overlaps`);}vis.set(a.i,a.visible);}
  if(Math.round(t/dt)%30===0){for(const list of tiles.values()){samples++;if(new Set(list.map(grp)).size>1)shared++;}}});
 assert.ok(spawns>20,`people come out of doors (${spawns})`);assert.ok(shared/samples<.03,`shared tiles ${shared}/${samples}`);
});
test('people walk the graph, wait at red and cross only on the walk light, enter doors and come back out',()=>{
 const pop=createPopulation({count:160,seed:9,hour:17.5}),entered=new Map();let crossings=0,waits=0,inside=0,sits=0,idles=0;
 run(pop,0,240,t=>{for(const a of pop.agents){if(a.leader>=0)continue;
  if(a.state===STATE.wait)waits++;if(a.state===STATE.inside)inside++;if(a.pose===POSE.sit&&a.visible)sits++;if(a.state===STATE.idle)idles++;
  if(a.state===STATE.walk&&a.visible){
   // Within the sidewalk band / zebra width of the edge it is on.
   const ex=g.X[g.B[a.e]]-g.X[g.A[a.e]],ez=g.Z[g.B[a.e]]-g.Z[g.A[a.e]],L=Math.hypot(ex,ez)||1,px=a.x-g.X[g.A[a.e]],pz=a.z-g.Z[g.A[a.e]];
   const off=Math.abs(px*ez-pz*ex)/L,along=(px*ex+pz*ez)/L;assert.ok(off<1.9&&along>-2&&along<L+2,`agent ${a.i} off its edge (${off.toFixed(2)})`);
   if(g.kind[a.e]===1&&entered.get(a.i)!==a.e){entered.set(a.i,a.e);crossings++;const sg=W.signals[g.sig[a.e]];assert.ok(walkLit(g.role[a.e],t,sg.offset),'stepped onto a crossing without the walk light');}
   else if(g.kind[a.e]!==1)entered.delete(a.i);}}});
 assert.ok(crossings>30,`crossings ${crossings}`);assert.ok(waits>0,'someone waited at a red');assert.ok(inside>0,'someone went inside');assert.ok(idles>0);
});
test('density: the centre is busier than the outer ring; at night the city empties except Shibuya and Shinjuku',()=>{
 const count=(hour,seed)=>{const pop=createPopulation({count:160,seed,hour});run(pop,0,120);const per=new Map();let out=0;
  for(const a of pop.agents)if(a.visible){out++;const d=where(a);if(d)per.set(d,(per.get(d)||0)+1);}return {per,out};};
 const day=count(13,3),night=count(2.5,3),avg=(m,f)=>{const ds=districts.filter(f);return ds.reduce((s,d)=>s+(m.get(d)||0),0)/ds.length;};
 assert.ok(avg(day.per,d=>!ring3(d))>avg(day.per,ring3)*2,'inner districts busier than the ring');
 assert.ok(night.out<day.out*.5,`night ${night.out} vs day ${day.out}`);
 const hub=['shibuya','shinjuku'].reduce((s,id)=>s+(night.per.get(districts.find(d=>d.id===id))||0),0);
 assert.ok(hub>=avg(night.per,d=>true)*6,'night owls end up in Shibuya and Shinjuku');
});
test('groups walk together, umbrellas follow the rain, and an update stays cheap',()=>{
 const pop=createPopulation({count:160,seed:4,hour:12});
 const groups=pop.agents.filter(a=>a.followers.length);assert.ok(groups.length>=8,'groups of 2–3');
 assert.ok(groups.every(a=>a.followers.length<=2));
 let worst=0,total=0,frames=0;
 run(pop,0,60,()=>{for(const f of pop.agents)if(f.leader>=0&&f.visible){const L=pop.agents[f.leader];assert.ok(Math.hypot(f.x-L.x,f.z-L.z)<3,'followers stay with the leader');}});
 pop.setRain(true);run(pop,60,61);const vis=pop.agents.filter(a=>a.visible);assert.ok(vis.filter(a=>a.umbrella).length>vis.length*.6,'most people open an umbrella');
 pop.setRain(false);run(pop,61,62);assert.ok(pop.agents.every(a=>!a.umbrella));
 for(let t=62;t<92;t+=dt){const s=performance.now();pop.update(dt,t);const ms=performance.now()-s;total+=ms;frames++;worst=Math.max(worst,ms);}
 assert.ok(total/frames<.5,`avg ${total/frames} ms`);
});
