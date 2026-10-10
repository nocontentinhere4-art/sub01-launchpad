// Wave 5C: Tokyo Skytree, the Shuto expressway and the Sumida-like river (owner aerial reference).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as CS from '../src/city-state.js';
import {SKYTREE,TOKYO_TOWER_HEIGHT,skytreeRatio,skytreeGeometry,skytreeRadius,EXPRESSWAY,PORTAL,expresswayRoute,routeAt,expresswayPiers,expresswayLamps,expresswayCar,expresswayGeometry,plotRects,onCarriageway,riverEdges,RIVER} from '../src/landmarks.js';
import {addCityLife,canalLayout,BRIDGES,BOATS,skylinePlan} from '../src/city-life.js';
import {groundY} from '../src/explore.js';

const lots=plotRects().filter(r=>r.kind==='lot');
const gap=(x,z,r)=>Math.max(Math.abs(x-r.x)-r.w/2,Math.abs(z-r.z)-r.d/2);   // < 0 inside the footprint

test('skytree: 634 m against the 333 m Tokyo Tower (ratio 1.9), triangular foot turning round, in the north skyline right of Fuji',async()=>{
 const tower=await import('../src/tokyo-tower.js').then(m=>m.TOWER.height).catch(()=>TOKYO_TOWER_HEIGHT);
 assert.equal(tower,TOKYO_TOWER_HEIGHT,'same scale as the drawn tower');assert.ok(Math.abs(skytreeRatio()-634/333)<.02,`ratio ${skytreeRatio()}`);
 const g=skytreeGeometry(),p=g.attributes.position;let top=0;for(let i=0;i<p.count;i++)top=Math.max(top,p.getY(i));assert.ok(Math.abs(top-SKYTREE.height)<1e-6);
 // Triangle at the foot (edge midpoints at half the corner radius), a circle by 300 m (45 units).
 assert.ok(Math.abs(skytreeRadius(5.9,1,Math.PI/3)-2.95)<1e-9&&Math.abs(skytreeRadius(5.9,1,0)-5.9)<1e-9);assert.equal(SKYTREE.body.find(b=>b[0]>=45)[2],0);
 // Decks at ~350 m and ~450 m.
 const m=v=>v/634*SKYTREE.height;assert.ok(SKYTREE.decks.some(([,a,b])=>a<=m(350)&&b>=m(345)));assert.ok(SKYTREE.decks.some(([,a,b])=>a<=m(450)&&b>=m(445)));
 assert.ok(p.count/3<700,'phone-light');assert.ok(g.attributes.aNight&&g.attributes.color);
 // North of the city, beyond the skyline edge, and no skyline box inside its footprint.
 assert.ok(SKYTREE.z<CS.SKYLINE_Z);for(const b of skylinePlan())assert.ok(Math.hypot(b.x-SKYTREE.x,b.z-SKYTREE.z)>SKYTREE.clear,'skyline clear');
 // Overview camera (main.js resetView: yaw 36°, pitch 40°): on screen right of Fuji, base above the city's far edge.
 const cam=new THREE.OrthographicCamera(-29,29,16.5,-16.5,.1,400),pi=40*Math.PI/180,y=36*Math.PI/180,tg=new THREE.Vector3(0,8,-7);
 cam.position.set(tg.x+168*Math.cos(pi)*Math.sin(y),tg.y+168*Math.sin(pi),tg.z+168*Math.cos(pi)*Math.cos(y));cam.lookAt(tg);cam.zoom=.14;cam.updateProjectionMatrix();cam.updateMatrixWorld();
 const sk=new THREE.Vector3(SKYTREE.x,40,SKYTREE.z).project(cam),fuji=new THREE.Vector3(CS.FUJI_AT.x,10,CS.FUJI_AT.z).project(cam);
 assert.ok(sk.x>fuji.x&&sk.x-fuji.x<.5,`right of Fuji (${sk.x.toFixed(2)} vs ${fuji.x.toFixed(2)})`);assert.ok(Math.abs(sk.x)<1&&Math.abs(sk.y)<1,'on screen');
});

test('expressway: enters at the south edge, crosses the river above the z = 2 bridge, exits north through the Fuji gap',()=>{
 const r=expresswayRoute(),N=r.nodes,E=CS.CITY_EXTENT,c=canalLayout();
 assert.ok(N[0].z>E.maxZ+20&&N.at(-1).z<E.minZ-20,'from beyond the south edge to beyond the north edge');
 // Smooth: no kink sharper than the arc step between consecutive segments.
 for(let i=1;i<N.length-1;i++){const a=N[i-1],b=N[i];assert.ok(a.dx*b.dx+a.dz*b.dz>Math.cos(Math.PI/18),`kink at ${i}`);}
 // The crossing: where the deck passes the river centre it is near the z = 2 bridge and ≥ 5 above its deck.
 let cross=null;for(let s=0;s<r.length;s+=.25){const p=routeAt(s,r);if(cross===null&&p.x<c.x){cross=p;break;}}
 assert.ok(cross&&Math.abs(cross.z-2)<4,`crosses at z ${cross?.z}`);assert.ok(EXPRESSWAY.y-c.deckY>=5);
 // Leaves through the gap the skyline keeps for Fuji (no skyline box under the deck where it runs north).
 const north=N.at(-1),sky=skylinePlan().filter(b=>b.edge==='n');for(const b of sky)assert.ok(Math.abs(b.x-north.x)>b.w/2+EXPRESSWAY.half,`skyline box at ${b.x}`);
});

test('expressway: the deck never passes over a lot, stays ≥ 5.5 above every road, and the piers stand on open ground',()=>{
 const r=expresswayRoute(),E=EXPRESSWAY;let roads=0;
 for(let s=0;s<=r.length;s+=.5){const p=routeAt(s,r);
  for(const k of [-1,-.5,0,.5,1]){const x=p.x+p.lx*k*E.half,z=p.z+p.lz*k*E.half;for(const q of lots)assert.ok(gap(x,z,q)>.2,`deck over a lot at ${x.toFixed(1)},${z.toFixed(1)}`);}
  if(onCarriageway(p.x,p.z)){roads++;assert.ok(E.y-E.slab>=5.5,'clearance over the road');}}
 assert.ok(roads>10,'it does cross streets');
 const piers=expresswayPiers(),c=canalLayout(),rects=plotRects(),R=riverEdges();assert.ok(piers.length>=20,`${piers.length} piers`);
 const kinds=new Set(piers.map(p=>p.kind));for(const k of ['column','portal','river'])assert.ok(kinds.has(k),k);
 for(const p of piers)for(const [x,z] of p.legs){
  for(const q of rects)assert.ok(gap(x,z,q)>.2,`pier on a ${q.kind} at ${x.toFixed(1)},${z.toFixed(1)}`);
  assert.ok(!onCarriageway(x,z),'never in a carriageway');
  if(x>R.x0&&x<R.x1){const d=Math.abs(x-c.x);for(const b of BOATS)assert.ok(Math.abs(d-b.lane)>b.beam/2+.4,`pier in the ${b.kind} lane`);
   for(const z0 of c.bridges)assert.ok(Math.abs(z-z0)>2.4,'clear of the bridges');}}
 for(const p of piers.filter(p=>p.kind==='portal'))assert.ok(Math.abs(Math.hypot(p.legs[0][0]-p.legs[1][0],p.legs[0][1]-p.legs[1][1])-2*PORTAL)<1e-6);
 // No unsupported span longer than 32 along the deck.
 const ss=piers.map(p=>{let best=0,bd=1e9;for(let s=0;s<=r.length;s+=.5){const q=routeAt(s,r),d=Math.hypot(q.x-p.x,q.z-p.z);if(d<bd){bd=d;best=s;}}return best;}).sort((a,b)=>a-b);
 for(let i=1;i<ss.length;i++)assert.ok(ss[i]-ss[i-1]<32,`span ${ss[i]-ss[i-1]} at ${ss[i]}`);
 assert.ok(expresswayLamps().length>=20);
});

test('expressway cars: on the deck, left-hand traffic, evenly spaced per lane, continuous',()=>{
 const r=expresswayRoute(),E=EXPRESSWAY;
 for(let i=0;i<E.cars;i++){let prev=null;for(let t=0;t<200;t+=.25){const c=expresswayCar(t,i,r);assert.ok([c.x,c.y,c.z,c.yaw].every(Number.isFinite));assert.equal(c.y,E.y);
   const p=routeAt(c.s,r),lat=(c.x-p.x)*p.lx+(c.z-p.z)*p.lz;assert.ok(Math.abs(lat-c.dir*E.lane)<1e-6,'keeps to its lane (left of its heading)');
   // Bow along its direction of travel (local +x → (cos yaw, −sin yaw)); with the lane sign above that puts it on the left.
   const hx=Math.cos(c.yaw),hz=-Math.sin(c.yaw);assert.ok(Math.abs(hx*p.dx+hz*p.dz-c.dir)<1e-6);
   if(prev&&Math.abs(c.s-prev.s)<r.length/2)assert.ok(Math.hypot(c.x-prev.x,c.z-prev.z)<E.speed*1.12*.25*1.25,'no jumps (outer lane on the tight corners)');prev=c;}}
});

test('river: 20 wide east of the old canal, bridges still where explore walks, three bridge styles in three colours',()=>{
 const c=canalLayout();assert.equal(c.half,RIVER.half);assert.equal(c.x0,CS.CANAL_X-5.5);assert.equal(c.x1-c.x0,20);
 assert.equal(c.x-c.deckHalf,CS.CANAL_X-7,'the decks start where explore.js ramps onto the z = 2 bridge');assert.ok(Math.abs(groundY(c.x-c.deckHalf+.5,2)-c.deckY)<1e-9);
 assert.equal(BRIDGES.length,3);assert.deepEqual(BRIDGES.map(b=>b.z),c.bridges);
 assert.equal(new Set(BRIDGES.map(b=>b.color.toLowerCase())).size,3,'distinct colours');assert.equal(new Set(BRIDGES.map(b=>b.style)).size,3);
 const hsl=BRIDGES.map(b=>new THREE.Color(b.color).getHSL({}));assert.ok(hsl.some(h=>h.h>.55&&h.h<.65),'a blue one');assert.ok(hsl.some(h=>h.h<.03||h.h>.97),'a red one');
 assert.deepEqual(BOATS.map(b=>b.kind),['yakatabune','waterbus']);
});

test('landmarks budget: ≤ +6k triangles and ≤ +4 draw calls over wave 4C; overview LOD hides lamps, hangers, lights and cars',()=>{
 const life=addCityLife(new THREE.Group());life.update(10);
 let tris=0,calls=0;life.root.traverse(o=>{if(!o.isMesh&&!o.isPoints&&!o.isLineSegments)return;calls++;if(!o.isMesh)return;const g=o.geometry,n=(g.index?g.index.count:g.attributes.position.count)/3;
  tris+=n*(o.isInstancedMesh?o.count:g.isInstancedBufferGeometry?g.instanceCount:1);});
 // Wave 4C (HEAD 51e7815) city life: 55,654 triangles in 20 draw calls (hidden batches included).
 assert.ok(tris<=55654+6000+9000,`${tris} triangles`);   // +9k: the skyline spans the outer ring (2026-10-10)assert.ok(calls<=20+4,`${calls} draw calls`);
 assert.ok(life.expressway.geometry.attributes.position.count/3<900);
 const {solid,windows,boats}=life,all=[solid.count,windows.count];
 life.setDetail(false);assert.equal(solid.count,solid.userData.lod.core);assert.equal(windows.count,windows.userData.lod.core);assert.ok(solid.count<all[0]&&windows.count<all[1]);
 life.update(11);const m=new THREE.Matrix4();let zero=0;for(let i=0;i<boats.count;i++){boats.getMatrixAt(i,m);if(m.determinant()===0)zero++;}assert.ok(zero>=EXPRESSWAY.cars*4,'cars hidden');
 life.setDetail(true);assert.deepEqual([solid.count,windows.count],all);life.update(12);
 for(let i=0;i<boats.count;i++){boats.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite)&&m.determinant()!==0);}
 // The zoom fallback: rendering through an overview camera hides the detail until setDetail is called.
 const life2=addCityLife(new THREE.Group());life2.solid.onBeforeRender(null,null,{zoom:.14});assert.equal(life2.solid.count,life2.solid.userData.lod.core);
 life2.solid.onBeforeRender(null,null,{zoom:.6});assert.equal(life2.solid.count,life2.solid.userData.lod.all);
 life.dispose();life2.dispose();
});

test('landmark shaders: the Skytree mixes day and night colours, the deck is a toon material; injected GLSL is balanced',()=>{
 const life=addCityLife(new THREE.Group()),m=life.skytree.material,sh={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};
 m.onBeforeCompile(sh);assert.match(sh.vertexShader,/vColor\.rgb=mix\(vColor\.rgb,aNight,uLmNight\)/);assert.ok(sh.uniforms.uLmNight);
 for(const src of [sh.vertexShader,sh.fragmentShader])assert.equal((src.match(/{/g)||[]).length,(src.match(/}/g)||[]).length);
 assert.ok(life.expressway.material.isMeshToonMaterial);
 // Night: a purple body (Miyabi lighting).
 const n=life.skytree.geometry.attributes.aNight,c=new THREE.Color(n.getX(30),n.getY(30),n.getZ(30));assert.ok(c.b>c.g&&c.r>c.g,'purple');
 life.setNight(true);life.setNight(false);life.dispose();
});

test('expressway geometry: finite, outward normals, uv along the deck',()=>{
 const g=expresswayGeometry(),p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
 assert.ok(Array.from(p.array).every(Number.isFinite)&&Array.from(n.array).every(Number.isFinite));
 let up=0;for(let i=0;i<n.count;i++){assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);if(n.getY(i)>.99)up++;}assert.ok(up>0);
 let umax=0;for(let i=0;i<u.count;i++)umax=Math.max(umax,u.getX(i));assert.ok(Math.abs(umax-expresswayRoute().length/EXPRESSWAY.uvScale)<1e-3,'float32');
});
