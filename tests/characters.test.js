import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OUTFITS,lookMaterials,loadCharacter,HEIGHT} from '../src/characters.js';
import {addResidents,pickNear} from '../src/residents.js';

test('every outfit maps look slots to material names; unknown outfits fall back to the hoodie',()=>{
 for(const o of OUTFITS){const m=lookMaterials(o);for(const k of ['top','bottom','skin','hair'])assert.ok(m[k].length&&m[k].every(n=>typeof n==='string'),o+' '+k);
  if(o!=='suit')assert.ok(!m.top.some(n=>m.bottom.includes(n)),o+' top and bottom are separate materials');}
 assert.deepEqual(lookMaterials('cape'),lookMaterials('hoodie'));
 lookMaterials('tee').top.push('x');assert.ok(!lookMaterials('tee').top.includes('x'),'returns copies');
});

// A tiny rig with the Quaternius bone names: Hips > UpperLeg.L/R > LowerLeg > Foot.
function fakeRig(){
 const hips=new THREE.Bone();hips.name='Hips';hips.position.y=.9;const bones=[hips];
 for(const s of ['L','R']){const up=new THREE.Bone(),low=new THREE.Bone(),foot=new THREE.Bone();up.name='UpperLeg'+s;low.name='LowerLeg'+s;foot.name='Foot'+s;
  up.position.set(s==='L'?.1:-.1,0,0);low.position.y=-.45;foot.position.y=-.45;hips.add(up);up.add(low);low.add(foot);bones.push(up,low,foot);}
 const geo=new THREE.BoxGeometry(.4,1.8,.3).translate(0,.9,0),n=geo.attributes.position.count;
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(n*4).fill(0),4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:n*4},(_,i)=>i%4?0:1),4));
 const scene=new THREE.Group();scene.add(hips);scene.updateMatrixWorld(true);
 for(const name of ['Purple','LightBlue']){const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshToonMaterial({name}));scene.add(mesh);mesh.bind(new THREE.Skeleton(bones));}
 const clip=name=>new THREE.AnimationClip(name,1,[new THREE.NumberKeyframeTrack('Hips.position[y]',[0,1],[.9,.92])]);
 return {scene,animations:['Idle','Idle_Neutral','Walk','Run','Wave','Interact'].map(clip)};
}
test('loadCharacter: shared geometry, one skeleton, recolours only what the look sets, poses and disposes',async()=>{
 const rig=fakeRig(),calls=[];const template=async(kind,name)=>{calls.push(name);return rig;};
 const c=await loadCharacter({outfit:'nope',top:'#ff0000'},{template});
 assert.deepEqual(calls.sort(),['anims','hoodie']);
 const meshes=[];c.root.traverse(n=>{if(n.isSkinnedMesh)meshes.push(n);});
 assert.equal(meshes.length,2);assert.equal(meshes[0].geometry,rig.scene.children[1].geometry,'geometry shared');
 assert.equal(meshes[0].skeleton,meshes[1].skeleton,'one skeleton per character');
 assert.equal(meshes[0].material.color.getHexString(),'ff0000');assert.notEqual(meshes[0].material,rig.scene.children[1].material);
 assert.equal(meshes[1].material,rig.scene.children[2].material,'unset slots keep the shared material');
 const box=new THREE.Box3().setFromObject(c.root);assert.ok(Math.abs(box.min.y)<1e-6&&Math.abs(box.max.y-HEIGHT)<1e-6);
 c.play('Walk');c.update(.1);c.pose('sit');c.update(.1);
 const knee=[];c.root.traverse(n=>{if(n.name==='LowerLegL')knee.push(n);});const k=knee[0].getWorldPosition(new THREE.Vector3()),f=knee[0].children[0].getWorldPosition(new THREE.Vector3());
 assert.ok(k.z>.3,'thigh points forward');assert.ok(Math.abs(f.z-k.z)<1e-3&&f.y<k.y,'shin points down');assert.ok(Math.abs(f.y)<.05,'feet stay on the floor');
 assert.ok(c.offsets.seat>0&&c.offsets.seat<HEIGHT/2);
 c.pose('lie');c.update(.1);assert.equal(c.posed,'lie');c.pose(null);assert.equal(c.posed,null);
 let freed=0;meshes[0].material.addEventListener('dispose',()=>freed++);rig.scene.children[2].material.addEventListener('dispose',()=>freed+=10);
 c.dispose();assert.equal(freed,1,'only the recoloured copy is freed');
});

test('LOD picks the k nearest residents in range, with hysteresis; hidden boxes collapse',()=>{
 const people=[0,1,2,3,4].map(i=>({key:'p'+i,x:i*10,z:0,look:{}}));
 assert.deepEqual(pickNear(people,{x:0,z:0},{k:2,radius:100}),['p0','p1']);
 assert.deepEqual(pickNear(people,{x:21,z:0},{k:1,radius:100}),['p2']);
 assert.deepEqual(pickNear(people,{x:15.5,z:0},{k:1,radius:100,keep:new Set(['p1'])}),['p1'],'a current pick survives a small move');
 assert.deepEqual(pickNear(people,{x:0,z:0},{k:8,radius:15}),['p0','p1']);
 const r=addResidents(new THREE.Group());r.set(people.slice(0,2));r.hide(new Set(['p1']));r.update(1);
 const m=new THREE.Matrix4(),s=new THREE.Vector3();r.mesh.getMatrixAt(6,m);m.decompose(new THREE.Vector3(),new THREE.Quaternion(),s);assert.equal(s.length(),0);
 r.mesh.getMatrixAt(0,m);m.decompose(new THREE.Vector3(),new THREE.Quaternion(),s);assert.ok(s.length()>0);
});
