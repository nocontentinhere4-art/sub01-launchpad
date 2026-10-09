import * as THREE from 'three';
// Cel shading: three flat light bands instead of PBR. Cheaper than MeshStandardMaterial and reads as anime/Sims.
const tones=new Uint8Array([90,170,255]);
const gradientMap=new THREE.DataTexture(tones,tones.length,1,THREE.RedFormat);
gradientMap.minFilter=gradientMap.magFilter=THREE.NearestFilter;gradientMap.needsUpdate=true;
const KEEP=['color','map','emissive','emissiveIntensity','emissiveMap','vertexColors','transparent','opacity','side','alphaTest','name'];
export function toon(params={}){const {roughness,metalness,...rest}=params;return new THREE.MeshToonMaterial({gradientMap,...rest});}
const converted=new WeakMap();
// Converts loaded glTF materials once; clones of the template then share the toon copies.
export function toonify(root){
 root.traverse(node=>{if(!node.isMesh)return;
  const swap=m=>{if(!m||m.isMeshToonMaterial||m.isMeshBasicMaterial||m.isShaderMaterial)return m;if(!converted.has(m)){const t=toon();for(const k of KEEP)if(m[k]!==undefined)t[k]=m[k]?.clone&&!m[k].isTexture?m[k].clone():m[k];converted.set(m,t);}return converted.get(m);};
  node.material=Array.isArray(node.material)?node.material.map(swap):swap(node.material);});
 return root;
}
