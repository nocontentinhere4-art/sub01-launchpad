import * as THREE from 'three';
// Cel shading: three flat light bands instead of PBR. Cheaper than MeshStandardMaterial and reads as anime/Sims.
// The bands are coloured (art brief 3.10): cool violet-blue shade, neutral mid, warm lit. three's toon chunk reads only the
// red channel of the gradient map, so the chunk is patched once to read RGB; every toon material shares this one ramp.
export const RAMP=['#8C93B4','#C9CDD8','#FFF3E2'];
THREE.ShaderChunk.gradientmap_pars_fragment=THREE.ShaderChunk.gradientmap_pars_fragment.replace('return vec3( texture2D( gradientMap, coord ).r );','return texture2D( gradientMap, coord ).rgb;');
// Bytes are the sRGB hex values; the texture is tagged sRGB so the GPU decodes them to linear like any other colour.
const tones=new Uint8Array(RAMP.flatMap(h=>{const n=parseInt(h.slice(1),16);return [n>>16,n>>8&255,n&255,255];}));
export const gradientMap=new THREE.DataTexture(tones,RAMP.length,1,THREE.RGBAFormat);
gradientMap.colorSpace=THREE.SRGBColorSpace;gradientMap.minFilter=gradientMap.magFilter=THREE.NearestFilter;gradientMap.needsUpdate=true;
// Night: one shared amount (0 day … 1 night) set by main.js's day/night toggle, and the brief's material multipliers
// (3.9 night) for city.js to apply to its own walls and ground. wallMaterial({night:true}) applies the wall one itself.
export const night={value:0};
export const NIGHT_TINT={walls:'#6F7D99',ground:'#55617A'};
// The multipliers are meant as plain 0–1 factors (like the old '#bdcedd'), not sRGB colours: decoded as sRGB they become
// ~0.2 and ACES's toe crushes the walls to black. nightColor('walls') gives the factor; material.color.copy(it) at night.
export const nightColor=role=>new THREE.Color().setHex(parseInt(NIGHT_TINT[role].slice(1),16),THREE.LinearSRGBColorSpace);
const KEEP=['color','map','emissive','emissiveIntensity','emissiveMap','vertexColors','transparent','opacity','side','alphaTest','name'];
export function toon(params={}){const {roughness,metalness,...rest}=params;return new THREE.MeshToonMaterial({gradientMap,...rest});}
// Walls: the toon material plus age and dirt for free (brief 3.4.9): the bottom `foot` units above `ground` darken by
// `dirt` (18%), and the top `cap` units of each box by `capDirt` (8%), measured per box so it works on instanced walls.
// night:true also multiplies by NIGHT_TINT.walls as the shared night amount rises (leave it off if the caller tints).
export function wallMaterial({ground=.24,foot=1,dirt=.18,cap=.3,capDirt=.08,night:nightTint=false,...params}={}){
 const m=toon(params),u={uGround:{value:ground},uFoot:{value:foot},uDirt:{value:dirt},uCap:{value:cap},uCapDirt:{value:capDirt},uNight:night,uNightTint:{value:nightColor('walls')}};
 m.userData.wall=u;
 m.onBeforeCompile=shader=>{Object.assign(shader.uniforms,u);
  shader.vertexShader='varying float vWallY;varying float vWallTop;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
 vec4 wallP=vec4(transformed,1.);float wallSy=length(modelMatrix[1].xyz);
 #ifdef USE_INSTANCING
 wallP=instanceMatrix*wallP;wallSy*=length(instanceMatrix[1].xyz);
 #endif
 vWallY=(modelMatrix*wallP).y;vWallTop=(.5-position.y)*wallSy;`);
  shader.fragmentShader='uniform float uGround,uFoot,uDirt,uCap,uCapDirt,uNight;uniform vec3 uNightTint;varying float vWallY;varying float vWallTop;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 diffuseColor.rgb*=(1.-uDirt*(1.-clamp((vWallY-uGround)/uFoot,0.,1.)))*(1.-uCapDirt*step(vWallTop,uCap));
 ${nightTint?'diffuseColor.rgb*=mix(vec3(1.),uNightTint,uNight);':''}`);};
 m.customProgramCacheKey=()=>'wall'+(nightTint?'n':'');
 return m;
}
const converted=new WeakMap();
// Converts loaded glTF materials once; clones of the template then share the toon copies.
export function toonify(root){
 root.traverse(node=>{if(!node.isMesh)return;
  const swap=m=>{if(!m||m.isMeshToonMaterial||m.isMeshBasicMaterial||m.isShaderMaterial)return m;if(!converted.has(m)){const t=toon();for(const k of KEEP)if(m[k]!==undefined)t[k]=m[k]?.clone&&!m[k].isTexture?m[k].clone():m[k];converted.set(m,t);}return converted.get(m);};
  node.material=Array.isArray(node.material)?node.material.map(swap):swap(node.material);});
 return root;
}
