import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cityLayout,subLotsOf,frontFace,heightFor,GROUND,STOREY,PARAPET} from '../src/lots.js';
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
 for(const buildings of [[],user]){const L=cityLayout(buildings);assert.equal(L.sides.length,districts.length*2);
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
  if(p.vacant){assert.equal(s.lots.length,0);assert.ok(['coin-parking','shrine'].includes(s.spots[0].kind));}
  else{assert.ok(s.lots.length>=1&&s.lots.length<=3);for(const l of s.lots)assert.ok(Math.abs(l.x-p.x)<=2.9&&l.width>1.5&&l.height>=3.5&&[l.x,l.z,l.width,l.depth,l.height].every(Number.isFinite));}}
 const u=subLotsOf('shibuya-2',user);assert.equal(u.user.wall,buildingColors.orange);assert.equal(u.user.type,'T1');
 assert.equal(u.user.width,Math.max(...u.lots.map(l=>l.width)));assert.equal(subLotsOf('shibuya-5',user).user.type,'T3');
});
test('lots: density per district stays in the brief range; roofs carry 2–5 off-centre items',()=>{
 const L=cityLayout([]);
 for(const d of districts){const lots=L.lots.filter(l=>l.district===d.id);assert.ok(lots.length>=14&&lots.length<=26,`${d.id} ${lots.length}`);
  assert.equal(L.spots.filter(s=>s.district===d.id&&s.kind==='coin-parking'&&!s.plotId).length,1);
  const houses=lots.filter(l=>l.role==='interior').length;assert.ok(houses>=3&&houses<=6);}
 for(const l of L.lots)if(l.type!=='T5'){assert.ok(l.roofItems.length>=2&&l.roofItems.length<=5,l.id);
  for(const it of l.roofItems)if(it.kind!=='rail')assert.ok(Math.hypot(it.u,it.v)>.2||l.width<2.2,`${l.id} ${it.kind} centred`);}
});
test('city: one batch per kind, picks cover the user sub-lot, heightOf follows the new storey scale',()=>{
 const scene=new THREE.Scene(),interactive=[],city=createCity(scene,interactive,()=>{},user);
 const st=city.stats();assert.ok(st.drawCalls<=6);assert.ok(st.walls>3000&&st.windows>500&&st.roofs>1000);
 const u=subLotsOf('shibuya-2',user).user;assert.equal(city.heightOf('shibuya-2'),u.height);
 const m=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
 interactive[0].getMatrixAt(cityPlots.findIndex(p=>p.id==='shibuya-2'),m);m.decompose(pos,q,sc);
 assert.ok(Math.abs(pos.x-u.x)<1e-6&&Math.abs(pos.z-u.z)<1e-6&&sc.x>=u.width&&sc.y>=u.height);
 city.redraw([{...user[0],phase:'scaffold',progress:.3}]);assert.ok(city.heightOf('shibuya-2')<u.height);
 city.redraw([{...user[0],phase:'thinking',progress:0}]);assert.equal(city.heightOf('shibuya-2'),2);
 const v=cityPlots.find(p=>p.vacant);assert.equal(city.heightOf(v.id),.5);
});
