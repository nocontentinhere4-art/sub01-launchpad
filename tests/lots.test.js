import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cityLayout,subLotsOf,frontFace,heightFor,heightClass,HEIGHTS,GROUND,STOREY,PARAPET,isRing3,builtHeight,CATEGORY,TOWER_PARKS,TOWER_PITCH,TOWER_PARK,TRANSMITTER_YARD,PARK_KINDS,OPEN_KINDS,VACANT_KINDS,RING3_KINDS,GAP_SET,INTERIOR_KINDS,VIADUCT_KINDS} from '../src/lots.js';
import {cityPlots,districts,buildingColors,RESERVED_PLOTS,RESERVED_KIND,tower,ROAD_Z} from '../src/city-state.js';
import {TOWER} from '../src/tokyo-tower.js';
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
  if(p.reserved){assert.equal(s.lots.length,0);assert.equal(s.spots.length,1);assert.equal(s.spots[0].kind,'park');assert.equal(s.spots[0].reserved,true);}
  else if(p.vacant){assert.equal(s.lots.length,0);const k=s.spots[0].kind;assert.ok(OPEN_KINDS.has(k)&&!['alley','vending','parking','koban','toilet'].includes(k),`${p.id} ${k}`);
   if(isRing3(p.district))assert.ok(PARK_KINDS.has(k)||k==='shrine'||RING3_KINDS.some(([v])=>v===k),`${p.id} ${k}`);else if(!TOWER_PARKS.includes(p.id))assert.ok(k==='shrine'||VACANT_KINDS[CATEGORY[p.district]].some(([v])=>v===k),`${p.id} ${k}`);}
  else{assert.ok(s.lots.length>=1&&s.lots.length<=3);for(const l of s.lots)assert.ok(Math.abs(l.x-p.x)<=2.9&&l.width>1.5&&l.height>=3.5&&[l.x,l.z,l.width,l.depth,l.height].every(Number.isFinite));}}
 const u=subLotsOf('shibuya-2',user);assert.equal(u.user.wall,buildingColors.orange);assert.equal(u.user.type,'T1');
 assert.equal(u.user.width,Math.max(...u.lots.map(l=>l.width)));assert.equal(subLotsOf('shibuya-5',user).user.type,'T3');
});
test('lots: density per district stays in the brief range; roofs carry 1–5 off-centre items (2+ above two floors), no rails',()=>{
 const L=cityLayout([]);
 for(const d of districts){const lots=L.lots.filter(l=>l.district===d.id);assert.ok(lots.length>=(d.id==='shiba'?4:12)&&lots.length<=26,`${d.id} ${lots.length}`);   // Shiba: three plots, their gaps and the north interior are the tower park
  assert.equal(L.spots.filter(s=>s.district===d.id&&s.kind==='coin-parking'&&!s.plotId).length,1);
  const houses=lots.filter(l=>l.role==='interior').length;assert.ok(houses>=(d.id==='shiba'?2:3)&&houses<=12,`${d.id} ${houses} interior houses`);}
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
 assert.ok(st.instances<35000,`city instances ${st.instances}`);   // 2026-10-10: + the outer ring of ghost districts; + boulevard furniture, the tower park and the variety spots (≈ 1.7k, mostly detail marks)
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

// Owner 2026-10-10: the landmarks' own ground. shiba-2, shiba-3 and shiba-5 (the tower park and its pitch), nakano-2
// (the transmitter compound, nakano-3) and shibuya-3 (the Shibuya plaza) are reserved (never an address), always a park spot
// carrying their reservedKind whatever is saved on them, with the gaps beside them open; the interior houses stay off
// the tower park, the pitch and the compound.
test('lots: reserved plots are park spots with their kind and open gaps, ignore building records; the landmark grounds are clear',()=>{
 assert.deepEqual(RESERVED_PLOTS,['shiba-2','shiba-3','shiba-5','nakano-3','shibuya-3']);
 assert.deepEqual(RESERVED_PLOTS.map(id=>cityPlots.find(c=>c.id===id)).map(p=>[p.reserved,p.reservedKind,p.x,p.z]),
  [[true,'tower-park',-29,-34],[true,'tower-park',-21,-34],[true,'tower-park',-29,-22],[true,'transmitter',66,-64],[true,'plaza',37,-4]]);
 const L=cityLayout([]),park=L.spots.filter(s=>s.reserved);
 assert.equal(park.length,11,'five plots and the six gaps beside them (nakano-3 and shibuya-3 end their rows)');assert.ok(park.every(s=>s.kind==='park'&&RESERVED_KIND[s.plotId||RESERVED_PLOTS.find(id=>cityPlots.find(c=>c.id===id).district===s.district)]===s.reservedKind));
 assert.deepEqual(park.filter(s=>s.plotId).map(s=>s.plotId).sort(),[...RESERVED_PLOTS].sort());
 // the tower park: from Deon's wall (shiba-1) to the end of the row, lot line to the back lane; the tower and its legs inside
 assert.deepEqual([TOWER_PARK.x0,TOWER_PARK.x1,TOWER_PARK.z0,TOWER_PARK.z1],[-34.1,-18.1,-41.5,-31.3]);
 const north=park.filter(s=>s.district==='shiba'&&s.z<-28);assert.ok(north.every(s=>s.x-s.width/2>=TOWER_PARK.x0-1e-9&&s.x+s.width/2<=TOWER_PARK.x1+1e-9),'the street front of the park');
 const leg=TOWER.feet+Math.max(TOWER.leg,.475);assert.ok(tower.x-leg>TOWER_PARK.x0&&tower.x+leg<TOWER_PARK.x1&&tower.z-leg>TOWER_PARK.z0-.5&&tower.z+leg<TOWER_PARK.z1,'the legs stand inside the park');
 assert.ok(tower.z+leg<ROAD_Z[2]-3.25&&Math.abs(tower.z-ROAD_Z[2])>3.25+leg,'off the Shiba street');
 // a saved building on a reserved plot changes nothing
 const strip=(L,d)=>JSON.stringify(L.spots.filter(s=>s.district===d))+JSON.stringify(L.lots.filter(l=>l.district===d).map(({building,...l})=>l));
 for(const [id,d] of [['shiba-2','shiba'],['nakano-3','nakano'],['shibuya-3','shibuya']]){assert.equal(strip(cityLayout([{plotId:id,type:'project',color:'mint'}]),d),strip(cityLayout([]),d),id);assert.equal(subLotsOf(id,[{plotId:id,type:'apartment',color:'sand'}]).user,null);}
 assert.ok(L.sides.filter(s=>['shiba','nakano','shibuya'].includes(s.district)).every(s=>s.fill>=.85),'the street-fill rule still holds with the reserved plots excluded');
 // the pitch stays on shiba-5 across the street, fixed to the plot (not to the tower); no lot overlaps it, the park or the yard
 assert.deepEqual(TOWER_PITCH,{x:-29,z:-19.05,w:8.4,d:5.4});assert.deepEqual([TRANSMITTER_YARD.x0,TRANSMITTER_YARD.x1,TRANSMITTER_YARD.z0,TRANSMITTER_YARD.z1],[63.1,68.9,-71.5,-61.3]);
 const inBox=(l,b)=>l.x+l.width/2>b.x0+.01&&l.x-l.width/2<b.x1-.01&&l.z+l.depth/2>b.z0+.01&&l.z-l.depth/2<b.z1-.01;
 for(const l of L.lots){assert.ok(Math.abs(l.x-TOWER_PITCH.x)>=TOWER_PITCH.w/2+l.width/2||Math.abs(l.z-TOWER_PITCH.z)>=TOWER_PITCH.d/2+l.depth/2,`${l.id} overlaps the pitch`);
  assert.ok(!inBox(l,TOWER_PARK)&&!inBox(l,TRANSMITTER_YARD),`${l.id} stands on a landmark's ground`);}
 assert.ok(L.lots.filter(l=>l.district==='shiba'&&l.role==='interior').length>=2&&L.lots.filter(l=>l.district==='nakano'&&l.role==='interior').length>=3);
 assert.ok(L.lots.some(l=>l.plotId==='shiba-1')&&L.lots.some(l=>l.plotId==='nakano-2')&&L.lots.some(l=>l.plotId==='shibuya-2'),'the neighbours keep their buildings');
});
test('lots: ring-3 parks vary deterministically into pitches, courts and playgrounds',()=>{
 const L=cityLayout([]),open=L.spots.filter(s=>s.plotId&&isRing3(s.district)&&PARK_KINDS.has(s.kind)),by=k=>open.filter(s=>s.kind===k).length;
 assert.ok(open.length>=10,`${open.length} open ring-3 plots`);
 assert.ok(by('park')>=4&&by('pitch')>=2&&by('court')>=2&&by('playground')>=2,JSON.stringify(Object.fromEntries([...PARK_KINDS].map(k=>[k,by(k)]))));
 assert.ok(open.every(s=>s.width===5.8&&s.depth===5.4&&!s.reserved));
 assert.ok(!L.spots.some(s=>!isRing3(s.district)&&s.kind!=='park'&&PARK_KINDS.has(s.kind)),'only the third ring varies');
 const again=cityLayout([{plotId:'kichijoji-2',type:'project',color:'mint'}]);
 assert.deepEqual(again.spots.filter(s=>s.plotId&&isRing3(s.district)&&PARK_KINDS.has(s.kind)).map(s=>[s.plotId,s.kind]),open.map(s=>[s.plotId,s.kind]),'the kinds do not move with other plots');
});

// Owner 2026-10-10 "non mi piace che ci sono sti spazi vuoti": vacant plots, plot gaps and the back lane carry real Tokyo
// fillers (artdir/GAPS.md), hashed per slot, inside their block and off every road, lane, landmark ground and building.
test('lots: gap fillers — ≥ 10 new kinds in use, weighted by district character, deterministic, inside the block and clear of roads and landmarks',()=>{
 const L=cityLayout([]),NEW=['gas-station','taxi-stand','car-dealer','bus-depot','pachinko','batting','sento','temple','cemetery','kindergarten','farm','bike-park','koban','toilet','tank-yard','laundry'];
 const used=new Set(L.spots.filter(s=>NEW.includes(s.kind)).map(s=>s.kind));assert.ok(used.size>=10,`${[...used].sort()}`);
 const vac=L.spots.filter(s=>s.plotId&&cityPlots.find(p=>p.id===s.plotId)?.vacant&&!isRing3(s.district)&&!s.reserved),kinds=s=>new Set(vac.filter(x=>CATEGORY[x.district]===s).map(x=>x.kind));
 assert.ok([...kinds('neon')].some(k=>['pachinko','gas-station','taxi-stand','batting','car-dealer'].includes(k)),'neon districts get the loud fillers');
 assert.ok([...kinds('old')].some(k=>['sento','temple','kindergarten','farm','cemetery'].includes(k)),'old districts get the quiet ones');
 assert.ok(!vac.some(s=>CATEGORY[s.district]==='old'&&['pachinko','gas-station','car-dealer','bus-depot'].includes(s.kind)),'nothing loud in an old district');
 assert.ok(!vac.some(s=>CATEGORY[s.district]==='neon'&&['sento','temple','cemetery','kindergarten'].includes(s.kind)),'nothing quiet in a neon district');
 const ring3=L.spots.filter(s=>s.plotId&&isRing3(s.district)&&cityPlots.find(p=>p.id===s.plotId).vacant);assert.ok(ring3.some(s=>s.kind==='farm'),'ring 3 has fields');
 const gaps=L.spots.filter(s=>!s.ghost&&!s.plotId&&GAP_SET.has(s.kind)&&!s.id.includes(':interior:'));assert.ok(['koban','toilet','bike-park'].filter(k=>gaps.some(s=>s.kind===k)).length>=2,'gap kinds beside the vending walls (most gaps are repaired into pencils for the 85 % street face)');
 assert.ok(gaps.every(s=>s.width===2.2&&s.depth===4.8));
 const lane=L.spots.filter(s=>!s.ghost&&s.id.includes(':interior:')&&s.kind!=='coin-parking');assert.ok(lane.length>=60,`${lane.length} back-lane fillers`);
 assert.ok(['bike-park','tank-yard','laundry','farm'].every(k=>lane.some(s=>s.kind===k)));
 assert.ok(lane.some(s=>s.kind==='cemetery'&&CATEGORY[s.district]==='old')&&!lane.some(s=>s.kind==='cemetery'&&CATEGORY[s.district]!=='old'),'cemeteries only behind the old blocks');
 const viaductSide=s=>{const d=districts.find(d=>d.id===s.district);const side=Math.sign(s.z-d.z);return (side>0&&d.z===ROAD_Z[1])||(side<0&&d.z===ROAD_Z[2]);};
 assert.ok(lane.some(s=>s.kind==='taxi-stand'&&viaductSide(s)),'a taxi pool under the viaduct');assert.ok(!lane.some(s=>s.kind==='taxi-stand'&&!viaductSide(s)),'taxi pools only under the viaduct');
 assert.ok(lane.filter(s=>s.mini).every(s=>s.depth===3.2&&s.width>=1.6&&s.width<=2.0),'the mini fillers sit in the house gaps');
 const all=[...districts];
 for(const s of L.spots){if(s.ghost)continue;const d=all.find(d=>d.id===s.district),dz=Math.abs(s.z-d.z),half=s.depth/2;
  if(!(s.kind==='coin-parking'&&!s.plotId))assert.ok(Math.abs(s.x-d.x)+s.width/2<=11.01,`${s.id} beyond the facade line`);   // the interior parking is widened to 4.2 (pre-existing)
  assert.ok(dz-half>=3.3-1e-9,`${s.id} on the district street`);assert.ok(dz+half<=13.5+1e-9,`${s.id} on the back lane`);
  const inBox=b=>b.district===s.district&&Math.sign(s.z-d.z)===b.s&&s.x+s.width/2>b.x0+.01&&s.x-s.width/2<b.x1-.01;
  if(!s.reserved)assert.ok(!inBox(TOWER_PARK)&&!inBox(TRANSMITTER_YARD),`${s.id} on a landmark's ground`);
  if(s.id.includes(':interior:'))assert.ok(Math.abs(s.x-TOWER_PITCH.x)>=TOWER_PITCH.w/2+s.width/2||Math.abs(s.z-TOWER_PITCH.z)>=TOWER_PITCH.d/2+half,`${s.id} on the pitch`);}
 // Interior fillers overlap no interior house and no other spot.
 const inter=L.spots.filter(s=>!s.ghost&&s.id.includes(':interior:'));
 for(const s of inter){for(const l of L.lots)if(l.role==='interior'&&l.district===s.district)assert.ok(Math.abs(l.x-s.x)>=l.width/2+s.width/2-.01||Math.abs(l.z-s.z)>=l.depth/2+s.depth/2-.01,`${s.id} hits ${l.id}`);
  for(const o of inter)if(o!==s&&o.district===s.district)assert.ok(Math.abs(o.x-s.x)>=o.width/2+s.width/2-.01||Math.abs(o.z-s.z)>=o.depth/2+s.depth/2-.01,`${s.id} hits ${o.id}`);}
 const again=cityLayout([{plotId:'ueno-2',type:'project',color:'mint'}]);
 assert.deepEqual(again.spots.filter(s=>NEW.includes(s.kind)).map(s=>[s.id,s.kind]),L.spots.filter(s=>NEW.includes(s.kind)).map(s=>[s.id,s.kind]),'fillers never move with other plots');
});
