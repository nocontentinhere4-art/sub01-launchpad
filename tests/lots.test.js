import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cityLayout,subLotsOf,frontFace,heightFor,heightClass,HEIGHTS,GROUND,STOREY,PARAPET,isRing3,builtHeight,CATEGORY,TOWER_PARKS} from '../src/lots.js';
import {cityPlots,districts,buildingColors} from '../src/city-state.js';
import {frontOf} from '../src/world-sync.js';
import {createCity} from '../src/city.js';

const user=[{plotId:'shibuya-2',type:'project',color:'orange',phase:'open',progress:1},{plotId:'shibuya-5',type:'apartment',color:'mint',phase:'home',progress:1}];
const strip=L=>JSON.stringify({lots:L.lots.map(({building,...l})=>l),spots:L.spots});
test('lots: the layout is a pure function of plot ids and the user buildings',()=>{
 const a=strip(cityLayout(user));cityLayout([]);const b=strip(cityLayout(user.map(u=>({...u}))));assert.equal(a,b);
 assert.notEqual(strip(cityLayout([])),a,'a user building changes its plot');
 assert.equal(heightFor(1),GROUND+PARAPET);assert.equal(heightFor(4),GROUND+3*STOREY+PARAPET);
});
test('lots: no two touching neighbours share a height; ≥85 % of every street edge is building face',()=>{
 for(const buildings of [[],user]){const L=cityLayout(buildings);assert.equal(L.sides.filter(s=>!s.ghost).length,districts.length*2);
  for(const s of L.sides){assert.ok(s.fill>=.85,`${s.district} ${s.front} fill ${s.fill.toFixed(3)}`);
   for(let i=1;i<s.sequence.length;i++)assert.notEqual(s.sequence[i].floors,s.sequence[i-1].floors,`${s.district} ${s.sequence[i].id}`);}}
});
test('lots: fronts face the district street (plots at d.z+6 face −z) and agree with frontOf',()=>{
 for(const p of cityPlots){const d=districts.find(d=>d.id===p.district),f=frontFace(p.id),walk=frontOf(p.id);
  assert.equal(f,p.z<d.z?'+z':'-z');assert.equal(Math.sign(walk.z-p.z),f==='+z'?1:-1);
  for(const l of subLotsOf(p.id).lots){assert.equal(l.front,f);assert.ok(Math.abs(l.frontZ-d.z)<Math.abs(l.z-d.z),'front face nearer the street than the centre');}}
 assert.equal(frontFace('nowhere-1'),null);
});
test('lots: every plot is covered; vacant plots are T8 spots; the user takes the widest sub-lot in their colour',()=>{
 for(const p of cityPlots){const s=subLotsOf(p.id);
  if(p.vacant){assert.equal(s.lots.length,0);assert.ok((isRing3(p.district)||TOWER_PARKS.includes(p.id)?['park','coin-parking','shrine']:['coin-parking','shrine']).includes(s.spots[0].kind));}
  else{assert.ok(s.lots.length>=1&&s.lots.length<=3);for(const l of s.lots)assert.ok(Math.abs(l.x-p.x)<=2.9&&l.width>1.5&&l.height>=3.5&&[l.x,l.z,l.width,l.depth,l.height].every(Number.isFinite));}}
 const u=subLotsOf('shibuya-2',user);assert.equal(u.user.wall,buildingColors.orange);assert.equal(u.user.type,'T1');
 assert.equal(u.user.width,Math.max(...u.lots.map(l=>l.width)));assert.equal(subLotsOf('shibuya-5',user).user.type,'T3');
});
test('lots: density per district stays in the brief range; roofs carry 1–5 off-centre items (2+ above two floors), no rails',()=>{
 const L=cityLayout([]);
 for(const d of districts){const lots=L.lots.filter(l=>l.district===d.id);assert.ok(lots.length>=12&&lots.length<=26,`${d.id} ${lots.length}`);
  assert.equal(L.spots.filter(s=>s.district===d.id&&s.kind==='coin-parking'&&!s.plotId).length,1);
  const houses=lots.filter(l=>l.role==='interior').length;assert.ok(houses>=3&&houses<=12,`${houses} interior houses`);}
 for(const l of L.lots)if(l.type!=='T5'){assert.ok(l.roofItems.length>=(l.floors<=2?1:2)&&l.roofItems.length<=5,l.id);
  for(const it of l.roofItems){assert.notEqual(it.kind,'rail');assert.ok(Math.hypot(it.u,it.v)>.2||l.width<2.2,`${l.id} ${it.kind} centred`);}}
});
// Wave 2B readability: height classes, one slab per district, a low near row, few pencils.
const street=L=>L.lots.filter(l=>l.role!=='interior');
test('lots: height profiles per district class, with exactly one slab on the far row',()=>{
 for(const buildings of [[],user]){const L=cityLayout(buildings);
  for(const d of districts){const cls=heightClass(d.id),[lo,hi]=HEIGHTS[cls].floors,[s0,s1]=HEIGHTS[cls].slab;
   const lots=street(L).filter(l=>l.district===d.id),slabs=lots.filter(l=>l.slab),rest=lots.filter(l=>!l.slab&&!l.user);
   assert.equal(slabs.length,1,`${d.id} slabs`);const s=slabs[0];
   assert.ok(s.floors>=s0&&s.floors<=s1&&s.front==='+z'&&!s.user,`${d.id} slab ${s.floors} ${s.front}`);
   for(const l of rest)assert.ok(l.floors<=hi&&l.floors<s.floors,`${d.id} ${l.id} ${l.type}${l.floors} > ${hi}`);
   if(cls==='low')assert.ok(rest.filter(l=>l.floors<=3).length/rest.length>=.9,`${d.id} mostly 2–3 floors`);
   if(cls==='high')assert.ok(rest.filter(l=>l.floors>=4).length/rest.length>=.3,`${d.id} reads tall`);}}
 assert.deepEqual(['koenji','asakusa','ebisu'].map(heightClass),['low','low','low']);
 assert.deepEqual(['akihabara','roppongi'].map(heightClass),['mid','mid']);assert.deepEqual(['shinjuku','shibuya','ginza'].map(heightClass),['high','high','high']);
});
test('lots: the near row (fronts −z) stays ≤ the class minimum + 1 and ~40 % of it is 1–2 floors',()=>{
 const L=cityLayout([]);let low=0,n=0;
 for(const l of street(L).filter(l=>l.front==='-z'&&!l.user)){const min=HEIGHTS[heightClass(l.district)].floors[0];
  assert.ok(l.floors<=min+1,`${l.id} ${l.floors}`);n++;if(l.floors<=2)low++;}
 // 40 % chance on top of the low-district rows that are 2–3 floors anyway: measured over high/mid districts only.
 const hm=street(L).filter(l=>l.front==='-z'&&heightClass(l.district)!=='low');
 const share=hm.filter(l=>l.floors<=2).length/hm.length;assert.ok(share>=.3&&share<=.6,`near-row 1–2 floor share ${share.toFixed(2)}`);
 assert.ok(n>100&&low/n>.5);
});
test('lots: pencils are ≤ 25 % of lots; corner fillers turn into kiosks or vending gaps',()=>{
 for(const buildings of [[],user]){const L=cityLayout(buildings),pencils=L.lots.filter(l=>l.type==='T2').length;
  assert.ok(pencils/L.lots.length<=.25,`T2 share ${(pencils/L.lots.length).toFixed(3)}`);
  assert.ok(L.lots.some(l=>l.role==='filler'&&l.floors===1),'1-storey kiosks');
  assert.ok(L.spots.some(s=>s.kind==='vending'),'vending gaps');}
});
test('lots: the user building stands ≥ 2 floors above the other lots on its plot',()=>{
 for(const b of [...user,{plotId:'koenji-4',type:'studio',color:'sand'},{plotId:'shinjuku-1',type:'project',color:'violet'}]){
  const s=subLotsOf(b.plotId,[b]);assert.ok(s.user,b.plotId);
  for(const l of s.lots)if(!l.user)assert.ok(l.floors<=s.user.floors-2,`${b.plotId} ${l.id} ${l.floors} vs ${s.user.floors}`);}
});
test('city: one batch per kind, picks cover the user sub-lot, heightOf follows the new storey scale',()=>{
 const scene=new THREE.Scene(),interactive=[],city=createCity(scene,interactive,()=>{},user);
 const st=city.stats();assert.ok(st.drawCalls<=9,`draw calls ${st.drawCalls}`);   // wave 5A: + prisms, awnings, tower ribbonsassert.ok(st.walls>2000&&st.windows>500&&st.roofs>1000);
 // Budget (wave 2B): the city's own boxes stay under 7,500; overview LOD drops details without extra draw calls.
 // Wave 4A, 48 districts: ≈ 2× the 24-district 6.85k; the overview hides the detail tail plus the third ring's bands,
 // canopies, stairs and roof clutter (second LOD), so it stays ≈ 1.65× the old 4.83k.
 // Wave 5A (facades, railings, frames, roof silhouettes): ≈ +5.3k boxes, all but the T5/pent/mansard prisms in the detail
 // tail, so the overview stays put; the triangle budget (≤ +15 % at district zoom) is the real limit.
 assert.ok(st.instances<33000,`city instances ${st.instances}`);   // 2026-10-10: + the outer ring of ghost districts
 city.setDetail(false);const far=city.stats();assert.ok(far.instances<15000&&far.instances<st.instances-4000&&!far.detail&&far.drawCalls===st.drawCalls,`overview ${far.instances}`);city.setDetail(true);
 assert.equal(city.stats().instances,st.instances);
 const u=subLotsOf('shibuya-2',user).user;assert.equal(city.heightOf('shibuya-2'),u.height);
 const m=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
 interactive[0].getMatrixAt(cityPlots.findIndex(p=>p.id==='shibuya-2'),m);m.decompose(pos,q,sc);
 assert.ok(Math.abs(pos.x-u.x)<1e-6&&Math.abs(pos.z-u.z)<1e-6&&sc.x>=u.width&&sc.y>=u.height);
 city.redraw([{...user[0],phase:'scaffold',progress:.3}]);assert.ok(city.heightOf('shibuya-2')<u.height);
 city.redraw([{...user[0],phase:'thinking',progress:0}]);assert.equal(city.heightOf('shibuya-2'),2);
 const v=cityPlots.find(p=>p.vacant);assert.equal(city.heightOf(v.id),.5);
});

// Wave 4A: the third ring.
test('lots: the third ring is low and old, with two mid sub-centres, greener vacant plots and the same budgets',()=>{
 const ring=districts.filter(d=>isRing3(d.id));assert.equal(ring.length,24);
 assert.deepEqual(ring.filter(d=>heightClass(d.id)==='mid').map(d=>d.id).sort(),['gotanda','kichijoji']);
 assert.ok(ring.every(d=>CATEGORY[d.id]),'every third-ring district has a character');
 const L=cityLayout([]),share=(ids,t)=>{const lots=L.lots.filter(l=>ids.has(l.district)&&l.role!=='interior');return lots.filter(l=>l.type===t).length/lots.length;};
 const inner=new Set(districts.filter(d=>!isRing3(d.id)&&heightClass(d.id)==='low').map(d=>d.id)),outer=new Set(ring.filter(d=>heightClass(d.id)==='low').map(d=>d.id));
 assert.ok(share(outer,'T5')>share(inner,'T5')*1.3,`T5 ${share(outer,'T5').toFixed(3)} vs ${share(inner,'T5').toFixed(3)}`);
 const vacant=L.spots.filter(s=>s.plotId&&isRing3(s.district)&&cityPlots.find(p=>p.id===s.plotId).vacant);
 assert.equal(vacant.length,24);assert.ok(vacant.filter(s=>s.kind!=='coin-parking').length>=14,'mostly parks and shrines');assert.ok(vacant.some(s=>s.kind==='park'));
 const a=strip(cityLayout([])),n=L.lots.filter(l=>!l.ghost).length;   // the outer ring's ghost lots are not countedassert.equal(strip(cityLayout([{plotId:'kichijoji-2',type:'project',color:'mint'}])).length>0,true);assert.equal(strip(cityLayout([])),a,'deterministic');
 assert.ok(n>780&&n<920,`lots ${n} ≈ 2× the 24-district 426`);
});
test('lots: builtHeight follows the construction phase',()=>{
 const lot=subLotsOf('kichijoji-2',[{plotId:'kichijoji-2',type:'project',color:'mint'}]).user;assert.ok(lot);
 assert.equal(builtHeight(lot,{phase:'thinking'}),2);assert.equal(builtHeight(lot,{phase:'open'}),lot.height);
 assert.equal(builtHeight(lot,{phase:'scaffold',progress:.65}),lot.height);assert.equal(builtHeight(lot,{phase:'scaffold',progress:0}),1.2);assert.equal(builtHeight(null,{}),0);
});
