import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CITY_EXTENT} from '../src/city-state.js';
import {RAMP,gradientMap,toon,wallMaterial,night,nightColor} from '../src/toon.js';
import {streetPlan,cablePositions,streetItems,addStreet,BOULEVARDS,ROWS} from '../src/city-street.js';
import {skylinePlan,addCityLife,SKYLINE} from '../src/city-life.js';

const spread=a=>{const m=a.reduce((s,v)=>s+v,0)/a.length;return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/a.length);};

test('toon ramp: three coloured sRGB texels (cool shade, mid, warm lit), read as RGB by every toon material',()=>{
 assert.deepEqual(RAMP,['#8C93B4','#C9CDD8','#FFF3E2']);
 assert.equal(gradientMap.image.width,3);assert.equal(gradientMap.colorSpace,THREE.SRGBColorSpace);assert.equal(gradientMap.magFilter,THREE.NearestFilter);
 assert.deepEqual([...gradientMap.image.data],[0x8C,0x93,0xB4,255,0xC9,0xCD,0xD8,255,0xFF,0xF3,0xE2,255]);
 assert.match(THREE.ShaderChunk.gradientmap_pars_fragment,/texture2D\( gradientMap, coord \)\.rgb;/);
 const m=toon({color:'#123456',roughness:.5});assert.ok(m.isMeshToonMaterial);assert.equal(m.gradientMap,gradientMap);
});

test('wall material: toon plus a world-y dirt band at the foot and under the coping; night tint only when asked',()=>{
 const shader=()=>({uniforms:{},vertexShader:THREE.ShaderLib.toon.vertexShader,fragmentShader:THREE.ShaderLib.toon.fragmentShader});
 const w=wallMaterial({color:'#E4D9C3'}),s=shader();w.onBeforeCompile(s);
 assert.ok(w.isMeshToonMaterial&&w.gradientMap===gradientMap);assert.equal(w.color.getHexString(),new THREE.Color('#E4D9C3').getHexString());
 assert.equal(s.uniforms.uDirt.value,.18);assert.equal(s.uniforms.uFoot.value,1);assert.equal(s.uniforms.uCapDirt.value,.08);assert.equal(s.uniforms.uCap.value,.3);
 assert.match(s.vertexShader,/vWallY=/);assert.match(s.fragmentShader,/diffuseColor\.rgb\*=\(1\.-uDirt/);assert.doesNotMatch(s.fragmentShader,/uNightTint,uNight/);
 const n=wallMaterial({night:true}),t=shader();n.onBeforeCompile(t);assert.match(t.fragmentShader,/mix\(vec3\(1\.\),uNightTint,uNight\)/);
 assert.equal(t.uniforms.uNight,night,'shares the one night amount');assert.ok(Math.abs(t.uniforms.uNightTint.value.r-0x6F/255)<1e-6&&Math.abs(nightColor('ground').b-0x7A/255)<1e-6,'night factors are plain 0–1 values');
 assert.notEqual(w.customProgramCacheKey(),n.customProgramCacheKey());
});

test('utility poles: one side of every street and the boulevards, scaling with the grid, hashed pitch 8–9, off the roads of every street and the boulevards, hashed pitch 8–9, off the roads',()=>{
 const plan=streetPlan(),utility=plan.poles,lamps=plan.lamps.filter(l=>l.kind==='led');
 // ~7 poles per district street plus the boulevards: 24 districts gave ~170, 48 give ~300.
 assert.ok(utility.length+lamps.length>=250&&utility.length+lamps.length<=420,`${utility.length}+${lamps.length} poles`);
 for(const p of utility){assert.ok(p.x>=CITY_EXTENT.minX&&p.x<=CITY_EXTENT.maxX&&p.z>=CITY_EXTENT.minZ&&p.z<=CITY_EXTENT.maxZ);
  if(p.axis==='x'){assert.ok(BOULEVARDS.every(b=>Math.abs(p.x-b)>=3),'not in a boulevard');assert.ok(ROWS.includes(p.c));}
  else assert.ok(ROWS.every(r=>Math.abs(p.z-r)>=3.6),'not in a side street');}
 assert.ok(!utility.some(p=>Math.hypot(p.x-29,p.z-2)<7.5),'the scramble stays clear');
 const pitches=plan.spans.map(([a,b])=>a.axis==='x'?Math.abs(b.x-a.x):Math.abs(b.z-a.z)).filter(d=>d<12);
 assert.ok(pitches.every(d=>d>=7.9&&d<=9.1));assert.ok(spread(pitches)>.15,'no fixed pitch');
 const share=k=>utility.filter(p=>p[k]).length/utility.length;
 assert.ok(share('transformer')>.2&&share('transformer')<.45);assert.ok(share('sleeve')>.35&&share('sleeve')<.65);
 assert.ok(streetItems(plan).every(i=>[i.x,i.y,i.z,i.w,i.h,i.d].every(Number.isFinite)&&i.w>0&&i.h>0&&i.d>0));
});

test('cable web: one LineSegments of ~3–5k sagging segments between 5.5 and 9.7, light pools are one night-only mesh',()=>{
 const plan=streetPlan(),pos=cablePositions(plan),segments=pos.length/6;
 assert.ok(segments>=2400&&segments<=5200,segments+' segments');assert.ok(pos.every(Number.isFinite));
 for(let i=1;i<pos.length;i+=3)assert.ok(pos[i]>=5.5&&pos[i]<=9.7,'cable height '+pos[i]);
 const root=new THREE.Group(),street=addStreet(root);
 assert.equal(root.children.filter(c=>c.isLineSegments).length,1);assert.equal(root.children.filter(c=>c.isInstancedMesh).length,1);
 assert.equal(street.pools.visible,false);street.setNight(true);assert.equal(street.pools.visible,true);
 const before=street.pools.count;assert.ok(before>=plan.lamps.length);
 street.addLightPool(1,2,'#EAF4FF',2,{group:'konbini'});street.addLightPool(3,4,'#EAF4FF',2,{group:'konbini'});assert.equal(street.pools.count,before+2);
 const m=new THREE.Matrix4();street.pools.getMatrixAt(before,m);assert.equal(m.elements[12],1);assert.equal(m.elements[14],2);assert.equal(m.elements[0],4);
 street.clearLightPools('konbini');assert.equal(street.pools.count,before);
});

test('skyline: three clusters, three value layers, widths 2–6, skewed heights 8–30, ~1 in 6 crowned, no fixed pitch',()=>{
 const s=skylinePlan();assert.ok(s.length>=40&&s.length<=100,s.length+' buildings');
 for(const b of s){assert.ok(Math.min(b.w,b.d)>=2&&Math.max(b.w,b.d)<=6.01);assert.ok(b.h>=8&&b.h<=30);assert.ok(b.x<-71||b.z<-71,'outside the city');}
 assert.deepEqual([...new Set(s.map(b=>b.layer))].sort(),[0,1,2]);
 const heights=s.map(b=>b.h).sort((a,b)=>a-b);assert.ok(heights[s.length>>1]<19,'skewed toward low');
 const crowns=s.filter(b=>b.crown).length/s.length;assert.ok(crowns>.08&&crowns<.32);
 const north=s.filter(b=>b.edge==='n'&&b.layer===0).sort((a,b)=>a.x-b.x),steps=north.slice(1).map((b,i)=>b.x-north[i].x);assert.ok(spread(steps)>.6);
 const life=addCityLife(new THREE.Group()),colors=()=>{const c=new THREE.Color(),out=new Set();for(let i=0;i<life.skyline.count;i++){life.skyline.getColorAt(i,c);out.add(c.getHexString());}return out;};
 assert.deepEqual([...colors()].sort(),SKYLINE.day.map(h=>new THREE.Color(h).getHexString()).sort());
 life.setNight(true);assert.deepEqual([...colors()].sort(),SKYLINE.night.map(h=>new THREE.Color(h).getHexString()).sort());
 assert.equal(typeof life.addLightPool,'function');
});
