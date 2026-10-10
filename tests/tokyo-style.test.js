import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {stylePlan,addTokyoStyle,fujiMesh,fujiProfile,fujiHaze,fujiGully,ATLAS,SCHEMES,KIND_WEIGHTS,GLOW,NEON_DISTRICTS,panelRect,stripRect,FUJI} from '../src/tokyo-style.js';
import {cityLayout,CATEGORY,BASE_Y,GROUND,STOREY} from '../src/lots.js';
import {streetPlan} from '../src/city-street.js';
import {districts} from '../src/city-state.js';

const plan=stylePlan([]),layout=cityLayout([]);
const fzOf=l=>l.front==='+z'?1:-1;
const kindOf=bg=>Object.entries(SCHEMES).find(([,list])=>list.some(([b])=>b===bg))?.[0];

test('one 512² atlas: 8 × 8 cells of 64 px, regions inside it and not overlapping',()=>{
 assert.equal(ATLAS.size,512);assert.equal(ATLAS.cell,64);
 const rects=[...Array.from({length:32},(_,i)=>panelRect(i)),...Array.from({length:ATLAS.strips},(_,i)=>stripRect(i)),ATLAS.hero,ATLAS.ad];
 let area=0;for(const [x,y,w,h] of rects){assert.ok(x>=0&&y>=0&&x+w<=512&&y+h<=512);area+=w*h;}
 assert.equal(area,512*512,'regions tile the atlas exactly');
 assert.deepEqual(KIND_WEIGHTS.map(([,w])=>w),[70,20,10]);
});

test('sign grounds are about 70 % light, 20 % dark, 10 % saturated',()=>{
 const n={light:0,dark:0,neon:0,sat:0},list=plan.signs.filter(s=>['stack','fascia'].includes(s.role));
 for(const s of list)n[kindOf(s.bg)]++;
 const total=list.length,light=n.light/total,dark=(n.dark+n.neon)/total,sat=n.sat/total;
 assert.ok(total>300,`${total} stack/fascia panels`);
 assert.ok(light>.6&&light<.8,`light ${light}`);assert.ok(dark>.12&&dark<.28,`dark ${dark}`);assert.ok(sat>.04&&sat<.16,`saturated ${sat}`);
});

test('fascias and stacks hang on a real lot front, never floating',()=>{
 for(const s of plan.signs.filter(s=>s.role==='fascia')){
  const lot=layout.lots.find(l=>l.district===s.district&&Math.abs(s.x-l.x)<=l.width/2&&(s.z-l.frontZ)*fzOf(l)>.05&&(s.z-l.frontZ)*fzOf(l)<1.05);
  assert.ok(lot,`fascia at ${s.x.toFixed(2)},${s.z.toFixed(2)} has a facade behind it`);
  assert.ok(s.y>BASE_Y+2.1&&s.y<BASE_Y+3.7,'fascia sits over the shopfront');
  assert.ok(Math.abs(Math.cos(s.ry)-fzOf(lot))<1e-6,'fascia faces the street');
  assert.ok(Math.abs(s.x-lot.x)+s.w/2<=lot.width/2+.01,'fascia within the frontage');
 }
 const stacks=plan.signs.filter(s=>s.role==='stack');assert.ok(stacks.length>0);
 for(const s of stacks){
  const lot=layout.lots.find(l=>l.district===s.district&&l.type==='T1'&&Math.abs(Math.abs(s.x-l.x)-(l.width/2-.15))<.01&&Math.abs((s.z-l.frontZ)*fzOf(l)-.42)<.01);
  assert.ok(lot,'every stack panel belongs to a T1 front corner');
  assert.ok(['neon','office'].includes(CATEGORY[s.district]),'stacks only in commercial districts');
  assert.ok(s.y-s.h/2>=BASE_Y+GROUND&&s.y+s.h/2<=BASE_Y+lot.height+.05,'from floor 2 to the parapet');
 }
});

test('residential districts: nothing above floor 2; neon only in the five neon districts; one hero at most',()=>{
 for(const s of plan.signs){const cat=CATEGORY[s.district];
  if(cat==='home'||cat==='old')assert.ok(s.y+s.h/2<=BASE_Y+GROUND+STOREY,`${s.role} in ${s.district} at ${(s.y+s.h/2).toFixed(2)}`);
  if(s.glow===GLOW.neon){assert.ok(NEON_DISTRICTS.includes(s.district),`neon in ${s.district}`);assert.ok(['stack','hero'].includes(s.role));}}
 for(const d of districts){const heroes=plan.signs.filter(s=>s.district===d.id&&s.role==='hero').length+(plan.screen&&d.id==='shibuya'?1:0);
  assert.ok(heroes<=1,`${d.id} has ${heroes} heroes`);if(NEON_DISTRICTS.includes(d.id))assert.equal(heroes,1,`${d.id} has its hero`);}
 assert.ok(plan.screen&&plan.screen.w<=6.3&&plan.screen.y>BASE_Y+GROUND,'the Shibuya screen is re-placed');
});

test('props never clip into buildings or utility poles, and nothing small stands in the scramble',()=>{
 const poles=streetPlan().poles,aabb=p=>{const c=Math.abs(Math.cos(p.ry||0)),s=Math.abs(Math.sin(p.ry||0)),hw=(p.w*c+p.d*s)/2,hd=(p.w*s+p.d*c)/2;return {x0:p.x-hw,x1:p.x+hw,z0:p.z-hd,z1:p.z+hd,y0:p.y-p.h/2,y1:p.y+p.h/2};};
 const boxes=layout.lots.map(l=>{const z0=l.frontZ,z1=l.frontZ-fzOf(l)*l.depth;return {l,x0:l.x-l.width/2,x1:l.x+l.width/2,z0:Math.min(z0,z1),z1:Math.max(z0,z1),y0:BASE_Y,y1:BASE_Y+l.height};});
 for(const p of plan.props.filter(p=>!p.rx&&!p.rz&&p.role!=='zebra')){const a=aabb(p);
  for(const b of boxes){const ox=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),oz=Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0),oy=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0);
   assert.ok(!(ox>.02&&oz>.02&&oy>.02),`${p.role} at ${p.x.toFixed(2)},${p.z.toFixed(2)} clips into ${b.l.id}`);}
  if(p.role&&p.y<3)for(const q of poles)assert.ok(!(Math.abs(q.x-p.x)<.12+(a.x1-a.x0)/2&&Math.abs(q.z-p.z)<.12+(a.z1-a.z0)/2),`${p.role} hits a pole at ${q.x.toFixed(1)},${q.z.toFixed(1)}`);
 }
 for(const p of plan.props.filter(p=>['bike','pot','crate','aframe','vending','nobori'].includes(p.role)))assert.ok(Math.hypot(p.x-29,p.z-2)>=4.5,'scramble kept clear');
});

test('street layer density and rules: 25–90 small props a district, cones only at construction, trees only on boulevards',()=>{
 const counts=Object.values(plan.counts);assert.equal(counts.length,districts.length);
 for(const [id,n] of Object.entries(plan.counts))assert.ok(n>=(id==='shiba'?15:25)&&n<=90,`${id}: ${n}`);   // Shiba: most of its street front is the tower park (owner 2026-10-10)
 assert.ok(counts.reduce((a,b)=>a+b)/counts.length>=38,'average ≥ 38');
 assert.equal(plan.props.filter(p=>p.role==='cone').length,0,'no cones without construction');
 const site=[{plotId:'shinjuku-2',type:'project',color:'orange',phase:'scaffold'}],withSite=stylePlan(site);
 assert.ok(withSite.props.some(p=>p.role==='cone'),'cones at a construction plot');
 assert.equal(plan.props.filter(p=>p.role==='tree').length,0,'street trees moved to city-green.js');
 assert.ok(plan.props.filter(p=>p.role==='mirror').length>=districts.length*2*3*.8,'about two traffic mirrors per district');
 assert.ok(plan.pools.length>=districts.length*1.5,`${plan.pools.length} vending clusters carry a light pool`);
});

test('Fuji: concave profile (slope rises with height, ~10° foot → ~31° rim), truncated crater, wide, under 3k triangles',()=>{
 const H=FUJI.height,prof=fujiProfile(H),slope=(f0,f1)=>Math.atan((f1-f0)*H/(prof.radius(f0)-prof.radius(f1)))*180/Math.PI;
 const slopes=Array.from({length:20},(_,i)=>slope(i/20,(i+1)/20));
 for(let i=1;i<slopes.length;i++)assert.ok(slopes[i]>slopes[i-1],`monotonic concavity at ${i}: ${slopes[i-1].toFixed(2)} → ${slopes[i].toFixed(2)}`);
 assert.ok(Math.abs(slopes[0]-10)<1.5&&Math.abs(slopes.at(-1)-31)<2,`${slopes[0]} … ${slopes.at(-1)}`);
 assert.ok(prof.rim>0&&prof.rim/prof.R>.03&&prof.rim/prof.R<.06,'a crater rim, not a point');
 assert.ok(H/prof.R>.2&&H/prof.R<.35,`wide: H/R ${(H/prof.R).toFixed(2)}`);
 const m=fujiMesh(),h=fujiHaze(m);assert.ok(m.triangles+h.triangles<=FUJI.maxTriangles,`${m.triangles}+${h.triangles}`);
 for(const a of [m.position,m.lit,m.f,h.position,h.alpha])assert.ok(a.every(Number.isFinite));
 assert.ok(m.layer.some(v=>v===1),'the Tanzawa ridge is in the body mesh');assert.ok(Math.max(...m.position.filter((_,i)=>i%3===1&&m.layer[Math.floor(i/3)]===1))<H*.5,'ridge stays low');
 // Snow fingers: gullies (g < 0) hold snow further down than ridges.
 assert.ok(FUJI.snow>.28&&FUJI.snow<.4);const g=Array.from({length:360},(_,i)=>fujiGully(i/360*Math.PI*2));assert.ok(Math.min(...g)<-.6&&Math.max(...g)>.6);
});

test('three draw calls (props, wheels, signs; no mountain in the scene), detail LOD by instance count, night switch',()=>{
 const parent=new THREE.Group(),style=addTokyoStyle(parent,[]),st=style.stats();
 assert.equal(st.drawCalls,3);const meshes=[];parent.traverse(o=>{if(o.isMesh)meshes.push(o);});assert.equal(meshes.length,3);assert.ok(st.wheels>0);assert.ok(!style.mountain.parent,'the mountain is not in the scene');
 assert.ok(st.propsCore<st.props&&st.signsCore<=st.signs);
 style.signMesh.onBeforeRender(null,null,{zoom:.2});assert.equal(style.signMesh.count,st.signsCore);
 style.propMesh.onBeforeRender(null,null,{zoom:1});assert.equal(style.propMesh.count,st.props);
 style.setNight(true);assert.ok(style.propMesh.material.color.r<1);style.setNight(false);assert.equal(style.propMesh.material.color.r,1);
 style.dispose();assert.equal(parent.children.length,0);
});
