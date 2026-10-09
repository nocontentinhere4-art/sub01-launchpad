import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CROWD_OUTFITS,CLIP_FRAMES,CROWD_PX,crowdLook,crowdPixels,crowdClose,cullInstances,slotOf,mergeOutfit,bakeBones,createCrowdGPU} from '../src/crowd-gpu.js';
import {HEIGHT,lookMaterials} from '../src/characters.js';
import {SKINS,HAIRS,CLOTHES} from '../src/creator.js';
import {addResidents} from '../src/residents.js';
import {RAMP} from '../src/toon.js';

const glb=name=>new Promise((ok,fail)=>{const b=readFileSync(new URL(`../public/assets/characters/${name}.glb`,import.meta.url));new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',ok,fail);});
let assets=null;const load=async()=>assets||={anims:await glb('anims'),...Object.fromEntries(await Promise.all(CROWD_OUTFITS.map(async o=>[o,await glb(o)])))};

test('material slots: skin, hair, top, bottom, fixed; the suit splits by height',()=>{
 assert.equal(slotOf('Skin','hoodie'),0);assert.equal(slotOf('Skin_Darker','jacket'),0);assert.equal(slotOf('Hair','tee'),1);
 assert.equal(slotOf('Purple','hoodie'),2);assert.equal(slotOf('LightBlue','hoodie'),3);assert.equal(slotOf('Eye','hoodie'),4);
 assert.equal(slotOf('Suit','suit',false),2);assert.equal(slotOf('Suit','suit',true),3);assert.equal(slotOf('Worker_Vest','worker'),2);assert.equal(slotOf('LightBrown','worker'),4);
});

test('merged outfit geometry: every vertex carries the slot of its material, the fixed colour for slot 4, a fit to HEIGHT',async()=>{
 const a=await load(),bake=bakeBones(a.hoodie.scene,a.anims.animations);
 for(const o of CROWD_OUTFITS){
  const m=mergeOutfit(a[o].scene,o,bake),tint=m.geometry.attributes.aTint;let expected=[],tris=0;
  a[o].scene.traverse(n=>{if(!n.isSkinnedMesh)return;tris+=n.geometry.index.count/3;for(let i=0;i<n.geometry.attributes.position.count;i++)expected.push(n.material);});
  assert.equal(tint.count,expected.length,o+' vertex count');assert.equal(m.triangles,tris,o+' triangles');
  const w=lookMaterials(o);
  expected.forEach((mat,i)=>{const s=tint.getW(i);
   if(w.skin.includes(mat.name))assert.equal(s,0);else if(w.hair.includes(mat.name))assert.equal(s,1);
   else if(o==='suit'&&mat.name==='Suit')assert.ok(s===2||s===3);else if(w.top.includes(mat.name))assert.equal(s,2);else if(w.bottom.includes(mat.name))assert.equal(s,3);
   else{assert.equal(s,4,o+' '+mat.name);assert.ok(Math.abs(tint.getX(i)-mat.color.r)<1e-6);}});
  if(o==='suit'){const s=new Set();for(let i=0;i<tint.count;i++)s.add(tint.getW(i));assert.ok(s.has(2)&&s.has(3),'suit jacket and trousers both recolourable');}
  assert.ok(m.fit.elements[0]>0&&Math.abs(m.fit.elements[0]-m.fit.elements[5])<1e-9);
  for(const k of ['skinIndex','skinWeight'])assert.equal(m.geometry.attributes[k].count,tint.count);
 }
});

test('bone texture: 62 bones × 4 texels wide, one row per baked frame, finite; GPU skinning matches three.js skinning',async()=>{
 const a=await load(),bake=bakeBones(a.hoodie.scene,a.anims.animations),frames=CLIP_FRAMES.reduce((s,[,f])=>s+f,0);
 assert.equal(bake.bones,62);assert.equal(bake.width,62*4);assert.equal(bake.height,frames);assert.equal(bake.data.length,62*4*4*frames);
 assert.ok(bake.data.every(Number.isFinite));
 let row=0;for(const [name,f] of CLIP_FRAMES){assert.equal(bake.clips[name].start,row);assert.equal(bake.clips[name].frames,f);assert.ok(bake.clips[name].fps>0);row+=f;}
 // The jacket's inverse bind matrices differ from the hoodie's; merge re-binds, so skinning with the hoodie bake is exact.
 const {clone}=await import('three/addons/utils/SkeletonUtils.js');
 for(const o of ['jacket','suit']){const m=mergeOutfit(a[o].scene,o,bake),ci=bake.clips.Walk,f=5,r=ci.start+f;
  const rig=clone(a[o].scene),mixer=new THREE.AnimationMixer(rig);mixer.clipAction(a.anims.animations.find(c=>c.name==='Walk')).play();mixer.setTime(f/ci.frames*ci.duration);rig.updateMatrixWorld(true);
  const ref=[];rig.traverse(n=>{if(n.isSkinnedMesh)for(let i=0;i<n.geometry.attributes.position.count;i++)ref.push(n.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(m.fit));});
  const P=m.geometry.attributes.position,I=m.geometry.attributes.skinIndex,W=m.geometry.attributes.skinWeight,B=new THREE.Matrix4(),acc=new THREE.Vector3(),v=new THREE.Vector3();let worst=0,top=-1;
  for(let i=0;i<P.count;i+=7){acc.set(0,0,0);for(let j=0;j<4;j++){const w=W.getComponent(i,j);if(w)acc.addScaledVector(v.fromBufferAttribute(P,i).applyMatrix4(B.fromArray(bake.data,(r*62+I.getComponent(i,j))*16)),w);}
   acc.applyMatrix4(m.fit);worst=Math.max(worst,acc.distanceTo(ref[i]));top=Math.max(top,acc.y);}
  assert.ok(worst<1e-4,o+' skinning error '+worst);assert.ok(Math.abs(top-HEIGHT)<.1,o+' height');}
});

test('stranger looks are deterministic by seed and use the creator vocabulary (server options when given)',()=>{
 assert.deepEqual(crowdLook(42),crowdLook(42));assert.deepEqual(crowdLook('ped-3'),crowdLook('ped-3'));
 const looks=Array.from({length:300},(_,i)=>crowdLook(i));
 assert.ok(new Set(looks.map(l=>l.outfit)).size===5,'all five outfits, worker included');
 for(const l of looks){assert.ok(SKINS.includes(l.skin)&&HAIRS.includes(l.hair)&&CLOTHES.includes(l.top)&&CLOTHES.includes(l.bottom));assert.notEqual(l.top,l.bottom);}
 const opts={look:{skin:['#010101'],hair:['#020202'],outfit:['tee']}};
 for(let i=0;i<50;i++){const l=crowdLook(i,opts);assert.equal(l.skin,'#010101');assert.equal(l.hair,'#020202');assert.ok(['tee','worker'].includes(l.outfit));}
});

test('LOD: characters below CROWD_PX tall use boxes, with hysteresis',()=>{
 assert.equal(CROWD_PX,14);
 const px=crowdPixels(.34,900,33);assert.ok(Math.abs(px-HEIGHT*.34*900/33)<1e-9);
 assert.equal(crowdClose(13.9),false);assert.equal(crowdClose(14),true);
 assert.equal(crowdClose(13,true),true,'stays close until 15% below');assert.equal(crowdClose(11.8,true),false);
 assert.equal(crowdClose(crowdPixels(.2,900,33)),false,'the reset city view is boxes');assert.equal(crowdClose(crowdPixels(.72,900,33)),true,'a district view is characters');
});

test('instance culling: radius around the target, nearest first with bias, capped',()=>{
 const items=[{x:0,z:0},{x:5,z:0},{x:50,z:0},{x:3,z:0,bias:2},{x:-2,z:1}];
 assert.deepEqual(cullInstances(items,items.length,{x:0,z:0},10,10),[0,4,1,3],'3 at bias 2 counts as 6');
 assert.deepEqual(cullInstances(items,items.length,{x:0,z:0},10,2),[0,4]);
 assert.deepEqual(cullInstances(items,3,{x:48,z:0},5,9),[2],'only the first count items are considered');
 assert.deepEqual(cullInstances(items,items.length,{x:500,z:0},10,9),[]);
});

test('GPU crowd: five instanced meshes, compacted instances, ≤ 6 draw calls, residents win the cap',async()=>{
 const a=await load(),scene=new THREE.Group(),gpu=createCrowdGPU(scene,{cap:8});
 assert.equal(gpu.push({},0,0,0,0),false,'pushes before load are ignored');
 await gpu.load(async(kind,name)=>a[name]);assert.equal(gpu.ready,true);assert.equal(gpu.meshes.length,5);
 assert.ok(gpu.meshes.every(m=>m.frustumCulled===false&&m.boundingSphere&&m.material.isShaderMaterial));
 // Lit like the city: toon.js's coloured ramp and the scene fog.
 assert.ok(gpu.meshes.every(m=>m.material.fog===true&&m.material.uniforms.uRamp.value.map(c=>c.getHexString()).join()===RAMP.map(h=>new THREE.Color(h).getHexString()).join()));
 gpu.begin(12.5);
 for(let i=0;i<20;i++)gpu.push({outfit:CROWD_OUTFITS[i%5],top:'#ff0000'},i,.24,0,i,{clip:i%2?'Walk':'Idle'});
 gpu.push({outfit:'suit',hairStyle:'buzz',skin:'#123456',hair:'#ffffff'},30,.26,0,0,{clip:'Wave',bias:.1});
 const s=gpu.end({x:0,z:0},100);
 assert.equal(s.instances,8);assert.ok(s.drawCalls<=5);assert.equal(gpu.meshes.reduce((n,m)=>n+m.count,0),8);
 const suit=gpu.meshes.find(m=>m.name==='crowd suit'),k=[...Array(suit.count).keys()].find(i=>suit.instanceMatrix.array[i*16+12]===30);
 assert.ok(k!==undefined,'the biased resident is drawn although farthest');
 const c0=suit.geometry.attributes.aCol0.array,c1=suit.geometry.attributes.aCol1.array;assert.ok(Math.abs(c0[k*4+3]-c0[k*4])<1e-6&&Math.abs(c1[k*4]-c0[k*4+1])<1e-6,'buzz: hair coloured as skin');
 const wave=suit.geometry.attributes.aAnim.array;assert.equal(wave[k*4],gpu.bake.clips.Wave.start);
 for(const m of gpu.meshes)for(let i=0;i<m.count*16;i++)assert.ok(Number.isFinite(m.instanceMatrix.array[i]));
 gpu.hide();assert.ok(gpu.meshes.every(m=>!m.visible));
 // The triangle budget stops the nearest-first fill before the cap.
 const small=createCrowdGPU(new THREE.Group(),{cap:50,budget:20e3});await small.load(async(kind,name)=>a[name]);small.begin(0);
 for(let i=0;i<30;i++)small.push({outfit:'tee'},i,0,0,0);const t=small.end({x:0,z:0},100);
 assert.equal(t.instances,3);assert.ok(t.triangles<=20e3);
});

test('residents: up close they are pushed with their own looks (hidden ones skipped) and the boxes hide; a wave plays Wave',()=>{
 const r=addResidents(new THREE.Group()),looks=[{outfit:'tee',top:'#111111'},{outfit:'suit',top:'#222222'}];
 r.set([{key:'a',x:1,z:2,look:looks[0]},{key:'b',x:3,z:4,look:looks[1]}]);
 const pushed=[],gpu={active:true,push:(look,x,y,z,yaw,o)=>pushed.push({look,x,z,...o})};
 r.hide(new Set(['b']));r.wave('a',100);r.update(100.5,gpu);
 assert.equal(r.mesh.visible,false);assert.equal(pushed.length,1);assert.equal(pushed[0].look,looks[0]);assert.equal(pushed[0].clip,'Wave');assert.ok(pushed[0].bias<1);
 gpu.active=false;r.update(101,gpu);assert.equal(r.mesh.visible,true);
});

test('umbrellas: flagged people get one canopy each in ONE extra instanced mesh, coloured, over their heads; none when dry',async()=>{
 const {UMBRELLA_COLORS}=await import('../src/crowd-gpu.js');
 const a=await load(),gpu=createCrowdGPU(new THREE.Group(),{cap:12});await gpu.load(async(kind,name)=>a[name]);
 gpu.begin(1);for(let i=0;i<6;i++)gpu.push({outfit:'tee'},i*2,.24,0,0,{clip:'Walk',umbrella:i%2?3:-1});
 let s=gpu.end({x:0,z:0},100);assert.equal(s.umbrellas,3);assert.equal(gpu.umbrellas.count,3);assert.ok(gpu.umbrellas.visible);
 const m=new THREE.Matrix4(),p=new THREE.Vector3(),c=new THREE.Color();
 for(let k=0;k<3;k++){gpu.umbrellas.getMatrixAt(k,m);p.setFromMatrixPosition(m);assert.ok(p.y>HEIGHT,'canopy above the head');gpu.umbrellas.getColorAt(k,c);assert.equal('#'+c.getHexString().toUpperCase(),UMBRELLA_COLORS[3].toUpperCase());}
 gpu.begin(2);for(let i=0;i<6;i++)gpu.push({outfit:'tee'},i,.24,0,0);s=gpu.end({x:0,z:0},100);
 assert.equal(s.umbrellas,0);assert.equal(gpu.umbrellas.visible,false,'dry: no umbrella draw call');
});
