import * as THREE from 'three';
import {toon} from './toon.js';
// Every resident is six boxes in one instanced mesh from afar: fixed cost however many people move in.
// Up close (gpu.active) every resident is drawn by crowd-gpu.js with their real look instead, and the boxes are hidden.
const PARTS=6,MAX=96;
export function addResidents(parent){
 const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),toon(),MAX*PARTS);
 mesh.count=0;mesh.frustumCulled=false;parent.add(mesh);
 const dummy=new THREE.Object3D(),color=new THREE.Color();let people=[],hidden=new Set();
 // Offsets for a chibi figure facing +z: legs, body, head, hair.
 const shape=look=>[[0,.32,0,.42,.62,.26,look.bottom],[0,.92,0,.56,.62,.34,look.top],[0,1.46,0,.46,.46,.42,look.skin],[0,1.73,-.03,.5,look.hairStyle==='buzz'?.08:.16,.46,look.hair],
  look.hairStyle==='long'?[0,1.38,-.2,.5,.55,.1,look.hair]:look.hairStyle==='bun'?[0,1.86,-.12,.22,.2,.22,look.hair]:[0,1.6,-.2,.48,.28,.08,look.hair],[0,1.48,.215,.3,.06,.01,'#2a2a2a']];
 function set(list){
  people=list.slice(0,MAX);mesh.count=people.length*PARTS;
  people.forEach((p,i)=>shape(p.look).forEach((part,j)=>{color.set(part[6]||'#888');mesh.setColorAt(i*PARTS+j,color);}));
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;update(0);
 }
 const WAVE=1.67,waves=new Map();
 // A wave now (the host greeting a visitor); residents also wave on their own every ~14 s.
 function wave(key,seconds){waves.set(key,seconds);}
 function update(seconds,gpu=null){
  const near=!!gpu?.active;mesh.visible=!near;
  if(near){people.forEach((p,i)=>{if(hidden.has(p.key))return;const turn=Math.sin(seconds*.4+i*2)*.5,own=(seconds+i*7.3)%14;
    let start=seconds-own,w=waves.get(p.key);if(w!==undefined&&seconds-w<WAVE)start=w;else if(w!==undefined)waves.delete(p.key);
    const waving=seconds-start<WAVE;gpu.push(p.look,p.x,.26,p.z,turn,{clip:waving?'Wave':'Idle',phase:waving?(((-start/WAVE)%1)+1)%1:(i*.37)%1,bias:.5});});return;}
  people.forEach((p,i)=>{const gone=hidden.has(p.key),bob=Math.abs(Math.sin(seconds*1.6+i))*.03,turn=Math.sin(seconds*.4+i*2)*.5;
   shape(p.look).forEach((part,j)=>{const [x,y,z,w,h,d]=part,c=Math.cos(turn),s=Math.sin(turn);dummy.position.set(p.x+x*c+z*s,.26+y+(j>1?bob:0),p.z-x*s+z*c);dummy.rotation.set(0,turn,0);dummy.scale.set(w,h,d);if(gone)dummy.scale.setScalar(0);dummy.updateMatrix();mesh.setMatrixAt(i*PARTS+j,dummy.matrix);});});
  mesh.instanceMatrix.needsUpdate=true;
 }
 // Hides residents by key (box and character) while their rigged model is out roaming.
 function hide(keys){hidden=keys;}
 return {mesh,set,update,hide,wave,get people(){return people;}};
}
// The k residents nearest the view centre within radius; current picks get a 25% distance bonus so the set doesn't flicker.
export function pickNear(people,target,{k,radius,keep=new Set()}){
 return people.map(p=>({key:p.key,d:Math.hypot(p.x-target.x,p.z-target.z)*(keep.has(p.key)?.8:1)})).filter(p=>p.key&&p.d<radius).sort((a,b)=>a.d-b.d).slice(0,k).map(p=>p.key);
}
