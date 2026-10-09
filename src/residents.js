import * as THREE from 'three';
import {toon} from './toon.js';
// Every resident is six boxes in one instanced mesh: fixed cost however many people move in.
// Only the few residents nearest a close camera are upgraded to rigged models (see pickNear); their box is then hidden.
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
 function update(seconds){
  people.forEach((p,i)=>{const gone=hidden.has(p.key),bob=Math.abs(Math.sin(seconds*1.6+i))*.03,turn=Math.sin(seconds*.4+i*2)*.5;
   shape(p.look).forEach((part,j)=>{const [x,y,z,w,h,d]=part,c=Math.cos(turn),s=Math.sin(turn);dummy.position.set(p.x+x*c+z*s,.26+y+(j>1?bob:0),p.z-x*s+z*c);dummy.rotation.set(0,turn,0);dummy.scale.set(w,h,d);if(gone)dummy.scale.setScalar(0);dummy.updateMatrix();mesh.setMatrixAt(i*PARTS+j,dummy.matrix);});});
  mesh.instanceMatrix.needsUpdate=true;
 }
 // Hides box figures by resident key while a rigged model stands in for them.
 function hide(keys){hidden=keys;}
 return {mesh,set,update,hide,get people(){return people;}};
}
// The k residents nearest the view centre within radius; current picks get a 25% distance bonus so the set doesn't flicker.
export function pickNear(people,target,{k,radius,keep=new Set()}){
 return people.map(p=>({key:p.key,d:Math.hypot(p.x-target.x,p.z-target.z)*(keep.has(p.key)?.8:1)})).filter(p=>p.key&&p.d<radius).sort((a,b)=>a.d-b.d).slice(0,k).map(p=>p.key);
}
