import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ACCESSORIES,PETS,attachAccessories,createPet,petFollow} from '../src/accessories.js';

const tris=o=>(o.index?o.index.count:o.attributes.position.count)/3;
const groupsOf=root=>{const out=[];root.traverse(n=>{if(n.name.startsWith('accessory:'))out.push(n);});return out;};
// A fake rig with the real Quaternius bone names at their rest positions in character space (measured on hoodie.glb).
// The bones sit under a model scaled to the fit (0.82), as loadCharacter does, and one skinned box is bound to them.
// The Head is tilted, so the test also covers a bone that is not in the root orientation.
function fakeRig({drop=[]}={}){
 const root=new THREE.Group(),model=new THREE.Group();model.scale.setScalar(.82);root.add(model);
 const rest={Hips:[-.011,.707,-.077],Torso:[-.02,.926,-.093],Chest:[-.02,1.102,-.069],Neck:[-.02,1.21,-.054],Head:[-.02,1.273,-.046]};
 const bones=[],byName={};
 for(const [name,[x,y,z]] of Object.entries(rest)){if(drop.includes(name))continue;const b=new THREE.Bone();b.name=name;b.position.set(x/.82,y/.82,z/.82);byName[name]=b;bones.push(b);model.add(b);}
 byName.Head?.rotateX(.07);
 const geo=new THREE.BoxGeometry(.3,1.5,.3).translate(0,.75,0),n=geo.attributes.position.count;
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(n*4).fill(0),4));
 geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:n*4},(_,i)=>i%4?0:1),4));
 const skin=new THREE.SkinnedMesh(geo,new THREE.MeshBasicMaterial());model.add(skin);
 root.updateMatrixWorld(true);skin.bind(new THREE.Skeleton(bones));
 return {root,byName};
}
const worldOf=o=>o.getWorldPosition(new THREE.Vector3());

test('the exported kinds are the agreed lists',()=>{
 assert.deepEqual(ACCESSORIES,['glasses','sunglasses','cap','beanie','headphones','backpack','scarf','mask','halo','crown','cat_ears','antenna','wings','jetpack']);
 assert.deepEqual(PETS,['cat','dog','robot','duck','slime','dragon']);
});

test('every accessory kind attaches to its bone within 150 triangles and disposes cleanly',()=>{
 const {root}=fakeRig(),ch={root};
 for(const kind of ACCESSORIES){
  const a=attachAccessories(ch,{accessories:[kind]});
  const gs=groupsOf(root);assert.equal(gs.length,1,kind+' has one group');
  assert.ok(gs[0].parent.isBone,kind+' hangs off a bone');
  let meshes=0,t=0;gs[0].traverse(n=>{if(n.isMesh){meshes++;t+=tris(n.geometry);}});
  assert.ok(meshes>=1&&t>0&&t<=150,kind+' has '+t+' triangles in '+meshes+' meshes');
  a.update(.1);
  a.dispose();assert.equal(groupsOf(root).length,0,kind+' removed on dispose');
 }
});

test('placement: head items sit over the skull, the pack behind the chest, the scarf under the chin, at character scale',()=>{
 const {root,byName}=fakeRig();root.position.set(3,.24,-2);root.updateMatrixWorld(true);
 attachAccessories({root},{accessories:ACCESSORIES});
 const gs=Object.fromEntries(groupsOf(root).map(g=>[g.name.slice(10),g]));
 const box=k=>new THREE.Box3().setFromObject(gs[k]),c=k=>box(k).getCenter(new THREE.Vector3());
 const head=worldOf(byName.Head),chest=worldOf(byName.Chest),neck=worldOf(byName.Neck);
 assert.ok(box('halo').min.y>head.y+.25,'halo floats above the hair');
 assert.ok(box('cat_ears').max.y>head.y+.3,'cat ears stand up');
 assert.ok(box('glasses').max.z>head.z+.1,'glasses are in front of the face');
 assert.ok(Math.abs(c('glasses').y-(head.y+.084))<.02,'glasses sit on the eye line');
 assert.ok(c('backpack').z<chest.z-.1,'backpack is behind the chest');
 assert.ok(Math.abs(c('scarf').x-neck.x)<.05&&c('scarf').y<neck.y,'scarf wraps the neck');
 const halo=box('halo').getSize(new THREE.Vector3());
 assert.ok(Math.abs(halo.x-.232)<.01,'halo is 0.232 across in character units (got '+halo.x.toFixed(3)+')');
 const q=new THREE.Quaternion(),qb=new THREE.Quaternion();gs.halo.getWorldQuaternion(q);byName.Head.getWorldQuaternion(qb);
 assert.ok(q.angleTo(qb)<1e-6,'a head accessory turns with the head bone');
});

test('an accessory attached while its bone is nodded lands where a rest attach would, once the bone is back at rest',()=>{
 const {root,byName}=fakeRig(),ch={root},centre=o=>new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
 attachAccessories(ch,{accessories:['cap']});const restCentre=centre(groupsOf(root)[0]);
 byName.Head.rotateX(.6);root.updateMatrixWorld(true);                 // attach while the head is nodded
 attachAccessories(ch,{accessories:['cap']});const cap=groupsOf(root)[0];
 byName.Head.rotateX(-.6);root.updateMatrixWorld(true);                // the head returns to the bind tilt
 const off=centre(cap).distanceTo(restCentre);
 assert.ok(off<.01,'the cap is rigid with its bone, off by '+off.toFixed(4));
});

test('attachAccessories is idempotent: a second call replaces the first set, duplicates collapse',()=>{
 const {root}=fakeRig(),ch={root};
 attachAccessories(ch,{accessories:[...ACCESSORIES,'halo','glasses']});attachAccessories(ch,{accessories:[...ACCESSORIES,'halo','glasses']});
 assert.equal(groupsOf(root).length,ACCESSORIES.length,'one group per kind');
 attachAccessories(ch,{accessories:['cap']});assert.deepEqual(groupsOf(root).map(g=>g.name),['accessory:cap']);
});

test('a rig without a bone skips that accessory and keeps the rest; no bones or no root does not throw',()=>{
 const {root}=fakeRig({drop:['Neck']});
 attachAccessories({root},{accessories:['scarf','glasses']});
 assert.deepEqual(groupsOf(root).map(g=>g.name),['accessory:glasses']);
 assert.doesNotThrow(()=>attachAccessories({root:new THREE.Group()},{accessories:['cap']}));
 assert.doesNotThrow(()=>attachAccessories({},{accessories:['cap']}));
 assert.doesNotThrow(()=>attachAccessories({root},{accessories:['nope']}));
});

test('default colours share one material across characters; a look colour is per character and freed on dispose',()=>{
 const a=fakeRig(),b=fakeRig(),ca={root:a.root},cb={root:b.root},mat=r=>groupsOf(r)[0].getObjectByProperty('isMesh',true).material;
 attachAccessories(ca,{accessories:['halo']});attachAccessories(cb,{accessories:['halo']});
 assert.equal(mat(a.root),mat(b.root),'shared default material');
 const c=attachAccessories(ca,{accessories:['halo'],accessoryColor:'#ff00ff'});
 const own=mat(a.root);assert.notEqual(own,mat(b.root));assert.equal(own.color.getHexString(),'ff00ff');
 let freed=0,sharedFreed=0;own.addEventListener('dispose',()=>freed++);mat(b.root).addEventListener('dispose',()=>sharedFreed++);
 c.dispose();assert.equal(freed,1,'the look colour is freed');
 const d=attachAccessories(cb,{accessories:['cat_ears'],hair:'#ff0000'});assert.equal(mat(b.root).color.getHexString(),'ff0000','cat ears take the hair colour');
 d.dispose();assert.equal(sharedFreed,0,'a shared material is never freed by a character');
});

test('wings flap in mirror image and the halo bobs as update(dt) runs, with finite transforms',()=>{
 const {root}=fakeRig(),a=attachAccessories({root},{accessories:['wings','halo']});
 const [wings,halo]=groupsOf(root),[l,r]=wings.children;const p=halo.children[0];
 const z0=l.rotation.z,y0=p.position.y;
 for(let i=0;i<30;i++)a.update(1/30);
 assert.ok(Number.isFinite(l.rotation.z)&&Number.isFinite(r.rotation.z)&&Number.isFinite(p.position.y));
 assert.notEqual(l.rotation.z,z0,'wings move');assert.equal(Math.sign(l.rotation.z),-Math.sign(r.rotation.z),'mirror image');
 assert.notEqual(p.position.y,y0,'halo bobs');
 a.dispose();
});

test('every pet builds with feet on the floor, the right height, dark eyes in front (+z), within 400 triangles',()=>{
 const RANGE={cat:[.42,.56],dog:[.42,.56],duck:[.42,.56],slime:[.42,.56],robot:[.6,.8],dragon:[.75,.9]};
 for(const kind of PETS){
  const p=createPet({kind,color:'#c8a27a'}),box=new THREE.Box3().setFromObject(p.root),h=box.max.y-box.min.y;
  assert.ok(Math.abs(box.min.y)<1e-3,kind+' feet at y=0 (got '+box.min.y+')');
  assert.ok(h>=RANGE[kind][0]&&h<=RANGE[kind][1],kind+' height '+h.toFixed(3));
  let t=0,zMin=9;p.root.traverse(n=>{if(!n.isMesh)return;t+=tris(n.geometry);
   if(n.material.color.getHexString()==='202020'){n.geometry.computeBoundingBox();zMin=Math.min(zMin,n.geometry.boundingBox.min.z+n.position.z);}});
  assert.ok(t<=400,kind+' has '+t+' triangles');
  assert.ok(zMin>.1,kind+' eyes face +z');
  p.dispose();
 }
});

test('pet update animates with finite transforms; setColor recolours the body; dispose frees its materials',()=>{
 const scene=new THREE.Group(),p=createPet({kind:'dog',color:'#8b5a2b'});scene.add(p.root);
 const mats=new Set();p.root.traverse(n=>{if(n.isMesh)mats.add(n.material);});
 for(let i=0;i<60;i++)p.update(1/60,{moving:true});
 let finite=true;p.root.traverse(n=>{finite&&=[...n.position.toArray(),...n.rotation.toArray().slice(0,3),...n.scale.toArray()].every(Number.isFinite);});
 assert.ok(finite,'every transform is finite');
 const legs=p.root.children.filter(c=>c.isGroup&&c.children.length&&c.children[0].isMesh&&c.position.y===.12);
 assert.equal(legs.length,4,'four legs');assert.ok(legs.some(l=>Math.abs(l.rotation.x)>.05),'legs swing while walking');
 p.setColor('#123456');const body=p.root.children[0].children[0].material;assert.equal(body.color.getHexString(),'123456');
 let freed=0;for(const m of mats)m.addEventListener('dispose',()=>freed++);
 p.dispose();assert.equal(freed,mats.size,'every instance material freed');assert.equal(scene.children.length,0,'root removed');
});

test('a slime squashes while it moves; the robot glow blinks over time',()=>{
 const s=createPet({kind:'slime'}),r=createPet({kind:'robot'});
 s.update(.5,{moving:true});const squashed=s.root.children[0].scale.y;
 assert.ok(Math.abs(squashed-1)>.05,'the slime squashes (scale.y '+squashed.toFixed(3)+')');
 const glow=r.root.children[0].children.find(m=>m.material.emissive.getHexString()!=='000000').material,seen=new Set();
 for(let i=0;i<120;i++){r.update(1/30,{moving:false});seen.add(glow.emissiveIntensity.toFixed(2));}
 assert.deepEqual([...seen].sort(),['0.10','1.00'],'the glow switches between on and off');
});

test('petFollow walks a pet behind the target, reports moving until it arrives, then turns to face the target',()=>{
 const target={position:new THREE.Vector3(2,.24,-1),rotation:{y:0}},pet=new THREE.Group();pet.position.set(-3,0,4);
 assert.equal(petFollow(pet,target,1/60).moving,true,'far away: moving');
 let frames=0,moving=true;while(moving&&frames<2000){moving=petFollow(pet,target,1/60).moving;frames++;}
 assert.equal(moving,false,'it stops');assert.ok(frames<2000,'it converges');
 assert.ok(Math.hypot(pet.position.x-2,pet.position.z-(-1-.9))<.03,'behind the target at distance 0.9, got '+pet.position.x+','+pet.position.z);
 assert.ok(Math.abs(pet.position.y-.24)<1e-6,'takes the floor height of the target');
 target.rotation.y=Math.PI/2;for(let i=0;i<600;i++)petFollow(pet,target,1/60);
 assert.ok(Math.hypot(pet.position.x-1.1,pet.position.z+1)<.03,'behind a target turned to face +x');
 const far={position:new THREE.Vector3(5,0,5),rotation:{y:0}};
 for(let i=0;i<600;i++)petFollow(pet,far,1/60);
 const want=Math.atan2(far.position.x-pet.position.x,far.position.z-pet.position.z);
 assert.ok(Math.abs(pet.rotation.y-want)<.05,'idle pet faces the target (want '+want.toFixed(3)+', got '+pet.rotation.y.toFixed(3)+')');
});
