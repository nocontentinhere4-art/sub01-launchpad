import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
// Rigged people (Quaternius Modular Men): one outfit glb each, clips shared from anims.glb.
// Geometry and untouched materials stay shared with the template cache; a character owns only its recolours and skeleton.
export const OUTFITS=['hoodie','jacket','tee','suit'];
export const HEIGHT=1.5;
// Material names per outfit glb (shoes share a top/bottom colour). A name in both top and bottom is split by mesh height (the suit);
// hide drops props (the suit model holds a pistol).
const OUTFIT_MATS={hoodie:{top:['Purple'],bottom:['LightBlue']},jacket:{top:['LightBrown'],bottom:['LightBlue']},tee:{top:['LightBrown'],bottom:['Red_Dark']},suit:{top:['Suit'],bottom:['Suit'],hide:['Grey','DarkBrown']},worker:{top:['Worker_Vest'],bottom:['Brown','Brown2']}};
export function lookMaterials(outfit){const o=OUTFIT_MATS[outfit]||OUTFIT_MATS.hoodie;return{top:[...o.top],bottom:[...o.bottom],skin:['Skin','Skin_Darker'],hair:['Hair']};}
let clips=null;
const fits=new WeakMap();
const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_q=new THREE.Quaternion(),_w=new THREE.Quaternion(),_p=new THREE.Quaternion();
const FWD=new THREE.Vector3(),DOWN=new THREE.Vector3(0,-1,0);
// Rotates bone so the segment bone→child points along a world direction (rig-axis agnostic).
function aim(bone,child,dir){
 bone.getWorldPosition(_a);child.getWorldPosition(_b);_b.sub(_a);if(_b.lengthSq()<1e-12)return;
 _q.setFromUnitVectors(_b.normalize(),dir);bone.getWorldQuaternion(_w).premultiply(_q);
 bone.parent.getWorldQuaternion(_p).invert();bone.quaternion.copy(_p.multiply(_w));bone.updateMatrixWorld(true);
}
const findBone=(model,re,side)=>{let hit=null;model.traverse(n=>{if(hit||!n.isBone)return;const k=n.name.toLowerCase().replace(/[^a-z]/g,'');if(re.test(k)&&(!side||k.endsWith(side)||k.includes(side==='l'?'left':'right')))hit=n;});return hit;};
export async function loadCharacter(look={},{template}){
 const outfit=OUTFITS.includes(look?.outfit)||look?.outfit==='worker'?look.outfit:'hoodie';
 clips||=template('characters','anims').then(g=>g.animations).catch(e=>{clips=null;throw e;});
 const [gltf,anims]=await Promise.all([template('characters',outfit),clips]);
 const model=clone(gltf.scene),inner=new THREE.Group(),root=new THREE.Group();
 // Fit to HEIGHT with feet at y=0, measured once per outfit.
 if(!fits.has(gltf)){const t=clone(gltf.scene);t.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(t),s=HEIGHT/box.getSize(_a).y,c=box.getCenter(_b);const low=[],cut=box.min.y+(box.max.y-box.min.y)*.45;t.traverse(n=>{if(n.isMesh)low.push(new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3()).y<cut);});
  fits.set(gltf,{s,x:-c.x*s,y:-box.min.y*s,z:-c.z*s,back:(c.z-box.min.z)*s,low});}
 const fit=fits.get(gltf);model.scale.setScalar(fit.s);model.position.set(fit.x,fit.y,fit.z);inner.add(model);root.add(inner);
 // One skeleton per character: SkeletonUtils gives every skinned mesh its own copy (and bone texture).
 const want=lookMaterials(outfit),colors={top:look?.top,bottom:look?.bottom,skin:look?.skin,hair:look?.hair},owned=new Map(),skeletons=[];
 let i=0;
 const slot=(m,low)=>{for(const k in want)if(want[k].includes(m.name)&&!(k==='top'&&low&&want.bottom.includes(m.name)))return k;},recolor=(m,low)=>{const k=slot(m,low),id=m.uuid+k;if(!colors[k])return m;
  if(!owned.has(id)){const x=m.clone();x.color.set(colors[k]);if(/darker/i.test(m.name))x.color.multiplyScalar(.85);x.map=null;owned.set(id,x);}return owned.get(id);};
 model.traverse(n=>{if(!n.isMesh)return;n.castShadow=true;n.receiveShadow=false;const low=fit.low[i++];
  n.material=Array.isArray(n.material)?n.material.map(m=>recolor(m,low)):recolor(n.material,low);
  if(look?.hairStyle==='buzz'&&!Array.isArray(n.material)&&want.hair.includes(n.material.name))n.visible=false;
  if(OUTFIT_MATS[outfit].hide?.includes(n.material.name)){const g=n.parent;(g.isGroup&&g.children.every(c=>c.isMesh)?g:n).visible=false;}
  if(!n.isSkinnedMesh)return;const same=skeletons.find(s=>s.bones.length===n.skeleton.bones.length&&s.bones.every((b,i)=>b===n.skeleton.bones[i])&&s.boneInverses.every((m,i)=>m.equals(n.skeleton.boneInverses[i])));
  if(same)n.bind(same,n.bindMatrix);else skeletons.push(n.skeleton);});
 const mixer=new THREE.AnimationMixer(model),actions={};
 for(const c of anims)actions[c.name]=mixer.clipAction(c);
 if(actions.Wave){actions.Wave.setLoop(THREE.LoopOnce,1);actions.Wave.clampWhenFinished=true;}
 let current=null,base='Idle',kind=null;
 function play(name){const next=actions[name]||actions.Idle;if(!next)return;if(next!==actions.Wave)base=name in actions?name:'Idle';if(next===current)return;
  next.reset().play();if(current)current.crossFadeTo(next,.25,false);current=next;}
 mixer.addEventListener('finished',e=>{if(e.action===current&&e.action===actions.Wave)play(base);});
 // Hip/thigh/knee for procedural poses on top of Idle_Neutral.
 const legs=['l','r'].map(s=>{const thigh=findBone(model,/upperleg|thigh/,s),knee=findBone(model,/lowerleg|shin|calf|knee/,s),foot=findBone(model,/foot|ankle/,s);return thigh&&knee&&foot&&{thigh,knee,foot};}).filter(Boolean);
 model.updateMatrixWorld(true);const len=(a,b)=>a.getWorldPosition(_a).distanceTo(b.getWorldPosition(_b));
 const thighLen=legs[0]?len(legs[0].thigh,legs[0].knee):HEIGHT*.25,hipY=legs[0]?legs[0].thigh.getWorldPosition(_a).y:HEIGHT*.5;
 // Caller placement: sit keeps feet on the floor and the hip joint at offsets.seat; lie centres the body on the root, back at y=0, head toward -z.
 const offsets={seat:hipY-thighLen,lieLength:HEIGHT};
 function pose(next=null){kind=next==='sit'||next==='lie'?next:null;inner.position.set(0,0,0);inner.rotation.set(0,0,0);
  if(kind==='sit')inner.position.y=-thighLen;
  if(kind==='lie'){inner.rotation.x=-Math.PI/2;inner.position.set(0,fit.back,HEIGHT/2);}
  const b=base;play(kind?'Idle_Neutral':b);base=b;}
 function update(dt){mixer.update(dt);
  if(kind!=='sit')return;root.updateWorldMatrix(true,false);root.getWorldQuaternion(_w);FWD.set(0,0,1).applyQuaternion(_w);
  for(const l of legs){aim(l.thigh,l.knee,FWD);aim(l.knee,l.foot,DOWN);}}
 function dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);for(const m of owned.values())m.dispose();for(const s of skeletons)s.dispose();root.removeFromParent();}
 play('Idle');
 return {root,play,pose,update,dispose,offsets,get posed(){return kind;}};
}
