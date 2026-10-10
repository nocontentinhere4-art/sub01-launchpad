import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {wallMaterial,wearNoise,weather,toon} from '../src/toon.js';
import {windowMaterial,withNightLight,winHash,windowCells,windowKind,windowSeed,WINDOW} from '../src/windows.js';
import {greenPlan,addCityGreen,swayOffset,treeGeometry,SPECIES,boulevardTrees,canalTrees} from '../src/city-green.js';
import {canalLayout,boatPosition,boatLoop,duckPosition,BOATS} from '../src/city-life.js';
import * as CS from '../src/city-state.js';

const toonShader=()=>({uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader});

test('windows: fake-interior shader injects into the toon chunks and composes with a night-light wrapper',()=>{
 const m=windowMaterial(),s=toonShader();m.onBeforeCompile(s);
 assert.match(s.vertexShader,/vWinUV=vec2\(/);assert.match(s.vertexShader,/#include <project_vertex>/);
 assert.match(s.fragmentShader,/#include <color_fragment>\n[\s\S]*winGlass=/);assert.match(s.fragmentShader,/totalEmissiveRadiance=mix\(totalEmissiveRadiance/);
 assert.match(s.fragmentShader,/#include <lights_toon_fragment>/,'the toon lighting chunk is kept');assert.match(s.fragmentShader,/#ifdef USE_COLOR/,'instance colour read in the fragment');
 assert.equal(s.uniforms.uWinTime,weather.time);assert.equal(s.uniforms.uWxWet,weather.wet,'weather still applies');
 // city.js's nightLit order: its emission line lands before the per-window re-shaping.
 const n=withNightLight(windowMaterial()),t=toonShader();n.onBeforeCompile(t);
 const fs=t.fragmentShader;assert.ok(fs.indexOf('vNightLight * uNightL')<fs.indexOf('float winE='),'night light first, then the windows shape it');
 assert.match(t.vertexShader,/attribute vec3 nightLight;/);assert.notEqual(n.customProgramCacheKey(),toon().customProgramCacheKey());
 // Balanced braces in the injected GLSL (a cheap syntax guard: node has no GL compiler).
 for(const src of [t.vertexShader,fs])assert.equal((src.match(/{/g)||[]).length,(src.match(/}/g)||[]).length);
});

test('windows: hashing is deterministic and the mix of dark / curtained / TV / lit rooms matches the table',()=>{
 assert.equal(winHash(12.5,-3.25),winHash(12.5,-3.25));assert.notEqual(winHash(1,2),winHash(2,1));
 assert.equal(windowCells(.6),1);assert.equal(windowCells(2.3),2);assert.equal(windowCells(5.5),5);
 const n=4000,count={dark:0,curtain:0,tv:0,room:0};
 for(let i=0;i<n;i++){const [x,y]=windowSeed(i*1.37%97,3+2.5*(i%7),-i*.91%83,i%5);const h=winHash(x,y);assert.ok(h>=0&&h<1);count[windowKind(h)]++;}
 const m=WINDOW.mix;assert.ok(Math.abs(count.dark/n-m.dark)<.04&&Math.abs(count.curtain/n-m.curtain)<.04&&Math.abs(count.tv/n-m.tv)<.03,JSON.stringify(count));
});

test('age and wear: per-instance weathering in the wall material, one tileable 128² wear texture',()=>{
 const w=wallMaterial(),s=toonShader();w.onBeforeCompile(s);
 assert.ok(s.uniforms.uStreak.value>0&&s.uniforms.uTintShift.value>0);assert.match(s.fragmentShader,/wallBelow=mod\(uSill-vWallY,2\.5\)/);assert.match(s.vertexShader,/vWallSeed\+=instanceMatrix\[3\]\.xz/);
 const c=wallMaterial({ground:-1,sill:.4,streakFrom:-2}),t=toonShader();c.onBeforeCompile(t);assert.equal(t.uniforms.uSill.value,.4);assert.equal(t.uniforms.uStreakFrom.value,-2);
 assert.match(s.fragmentShader,/uWearMap/);assert.equal(s.uniforms.uWear,weather.wear);
 const a=wearNoise(),b=wearNoise();assert.equal(a.length,128*128*4);assert.deepEqual(a,b,'deterministic');
 let mn=255,mx=0;for(let i=0;i<a.length;i+=4){mn=Math.min(mn,a[i]);mx=Math.max(mx,a[i]);}assert.ok(mx-mn>60,'real variation');
 // Seamless: the wrap seam is no rougher than the texture's own neighbours.
 const at=(x,y)=>a[(y*128+x)*4];let seam=0,inner=0;for(let y=0;y<128;y++){seam+=Math.abs(at(127,y)-at(0,y));inner+=Math.abs(at(63,y)-at(64,y));}assert.ok(seam<inner*2.5+128*4,`${seam} vs ${inner}`);
});

test('greenery: species on boulevards, canal banks, shrines and parks; finite transforms; small things are detail-only',()=>{
 const plan=greenPlan([]),t=plan.trees;
 for(const k of ['zelkova','ginkgo','cherry','grove'])assert.ok(t[k]?.length>0,k);
 const bx=[...CS.BOULEVARD_X,...(CS.OUTER_BOULEVARD_X??[])];for(const tr of boulevardTrees())assert.ok(bx.some(x=>Math.abs(Math.abs(tr.x-x)-2.15)<1e-6),'on a boulevard sidewalk');
 const c=canalLayout();for(const tr of canalTrees()){assert.ok(Math.abs(Math.abs(tr.x-c.x)-c.treeOffset)<.2);assert.ok(!c.bridges.some(b=>Math.abs(tr.z-b)<4.4),'clear of bridges');}
 for(const list of Object.values(t))for(const tr of list)assert.ok([tr.x,tr.y,tr.z,tr.ry,tr.s].every(Number.isFinite));
 assert.ok(plan.counts.trees<700,'phone-friendly');assert.ok(plan.counts.planters>40&&plan.counts.ivy>5,JSON.stringify(plan.counts));
 const parent=new THREE.Group(),g=addCityGreen(parent,{extra:[{species:'zelkova',x:1,z:2}]}),st=g.stats();
 assert.equal(st.drawCalls,5,'one per species + one box batch');assert.equal(st.zelkova,t.zelkova.length+1,'extra trees join their species batch');
 const box=g.meshes.at(-1),all=box.count;g.setDetail(false);assert.ok(box.count<all&&box.count===box.userData.lod.core);g.setDetail(true);assert.equal(box.count,all);
 for(const m of g.meshes){const M=new THREE.Matrix4();for(let i=0;i<m.count;i++){m.getMatrixAt(i,M);assert.ok(M.elements.every(Number.isFinite));}}
 const cherry=g.meshes.find(m=>m.name==='green cherry');assert.ok(cherry.geometry.attributes.aPink,'per-instance pink for sakura');
 g.dispose();assert.equal(parent.children.length,0);
});

test('greenery: merged trees are low-poly, and the sway stays small and finite',()=>{
 for(const k of Object.keys(SPECIES)){const geo=treeGeometry(k),n=geo.attributes.position.count;assert.ok(n/3<=120,`${k} ${n/3} triangles`);
  assert.ok(geo.attributes.aLeaf.array.some(v=>v===0)&&geo.attributes.aLeaf.array.some(v=>v===1));assert.ok(geo.attributes.normal.array.every(Number.isFinite));}
 let max=0;for(const t of [0,1.7,33.3,999.9,1e5])for(const h of [0,1,3,5])for(const leaf of [0,1]){const [dx,dz]=swayOffset(t,12.3,-40,h,leaf);assert.ok(Number.isFinite(dx)&&Number.isFinite(dz));max=Math.max(max,Math.hypot(dx,dz));}
 assert.ok(max>.02&&max<.35,`max sway ${max}`);assert.equal(swayOffset(5,0,0,0,0).every(v=>Math.abs(v)<1e-12),true,'trunk base never moves');
});

test('canal: boats loop continuously in separate lanes inside the walls; ducks stay clear of the lanes',()=>{
 // Wave 5C: the canal is a 20-wide river; its west wall stays at CANAL_X − 5.5, so c.x is the water centre east of CANAL_X.
 const c=canalLayout();assert.equal(c.x-c.half,CS.CANAL_X-5.5);assert.equal(c.half,10);assert.deepEqual(c.bridges,[-38,2,42]);
 for(const b of BOATS){const {P}=boatLoop(b,c),T=P/b.speed,dt=.05;let prev=boatPosition(0,b,c);
  for(let t=dt;t<=T+dt;t+=dt){const p=boatPosition(t,b,c);const step=Math.hypot(p.x-prev.x,p.z-prev.z);assert.ok(step<=b.speed*dt*1.02+1e-9,`jump ${step} at ${t}`);
   let dy=Math.abs(p.yaw-prev.yaw);dy=Math.min(dy,2*Math.PI-dy);assert.ok(dy<.2,`yaw jump at ${t}`);
   assert.ok(Math.abs(p.x-c.x)+b.beam/2<c.half,'inside the walls');assert.ok(p.z>c.z0&&p.z<c.z1);prev=p;}
  const a=boatPosition(3.3,b,c),z=boatPosition(3.3+T,b,c);assert.ok(Math.hypot(a.x-z.x,a.z-z.z)<1e-6,'closed loop');}
 const [y,tour]=BOATS;assert.ok(y.lane+y.beam/2<tour.lane-tour.beam/2,'lanes do not overlap');
 for(let i=0;i<6;i++)for(const t of [0,40,400,4000]){const d=duckPosition(t,i,c);assert.ok(Math.abs(d.x-c.x)>tour.lane+tour.beam/2&&Math.abs(d.x-c.x)<c.half);assert.ok(Number.isFinite(d.yaw));}
 // Bow along the heading: local +x maps to (cos yaw, −sin yaw).
 const p0=boatPosition(10,y,c),p1=boatPosition(10.1,y,c),hx=p1.x-p0.x,hz=p1.z-p0.z,L=Math.hypot(hx,hz);assert.ok(Math.abs(Math.cos(p0.yaw)-hx/L)<.05&&Math.abs(-Math.sin(p0.yaw)-hz/L)<.05);
});
