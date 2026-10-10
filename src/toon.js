import * as THREE from 'three';
import {addFacade} from './facades.js';
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
// Weather (weather.js, main.js): shared 0–1 amounts. wet darkens and cools up-facing ground (the low, flat surfaces) and
// a little of everything else; snow whitens up-facing faces, roofs more than the ground. One chunk injected into every
// toon material; amounts at 0 cost a few ALU ops. main.js zeroes them while a room is open (rooms share these materials).
// Wave 4B adds: time (seconds, for tree sway / TV flicker / water), sakura (0–1 blossom amount, weather 'sakura'), and
// wear (1 in the city, 0 in rooms): asphalt patches on up-facing low surfaces from one 128² noise texture in world space.
export const weather={wet:{value:0},snow:{value:0},time:{value:0},sakura:{value:0},wear:{value:1}};
// Seamless 128² RGBA noise (pure JS, works in node): R = blotches + rectangular repair patches (the asphalt patchwork of a
// Tokyo side street), G = fine grain. Deterministic for a seed.
export function wearNoise(N=128,seed=7){
 let a=seed>>>0;const rnd=()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 const lattice=g=>{const v=Float32Array.from({length:g*g},rnd),s=t=>t*t*(3-2*t);
  return (x,y)=>{const fx=x/N*g,fy=y/N*g,ix=Math.floor(fx),iy=Math.floor(fy),tx=s(fx-ix),ty=s(fy-iy),at=(i,j)=>v[((j%g+g)%g)*g+((i%g+g)%g)];
   return at(ix,iy)*(1-tx)*(1-ty)+at(ix+1,iy)*tx*(1-ty)+at(ix,iy+1)*(1-tx)*ty+at(ix+1,iy+1)*tx*ty;};};
 const n8=lattice(8),n16=lattice(16),n32=lattice(32),r=new Float32Array(N*N),g=new Float32Array(N*N);
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;r[i]=.5+.34*(n8(x,y)-.5)+.22*(n16(x,y)-.5);g[i]=.5+.55*(n32(x,y)-.5)+.3*(rnd()-.5);}
 for(let k=0;k<16;k++){const w=6+Math.floor(rnd()*26),h=6+Math.floor(rnd()*22),x0=Math.floor(rnd()*N),y0=Math.floor(rnd()*N),d=(rnd()<.6?-1:1)*(.06+rnd()*.1);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=((y0+y)%N)*N+(x0+x)%N;r[i]+=d;}}
 const out=new Uint8Array(N*N*4);for(let i=0;i<N*N;i++){out[i*4]=Math.max(0,Math.min(255,Math.round(r[i]*255)));out[i*4+1]=Math.max(0,Math.min(255,Math.round(g[i]*255)));out[i*4+2]=128;out[i*4+3]=255;}
 return out;
}
export const wearMap=new THREE.DataTexture(wearNoise(),128,128,THREE.RGBAFormat);
wearMap.wrapS=wearMap.wrapT=THREE.RepeatWrapping;wearMap.magFilter=THREE.LinearFilter;wearMap.minFilter=THREE.LinearMipmapLinearFilter;wearMap.generateMipmaps=true;wearMap.needsUpdate=true;
const weatherVert=['#include <project_vertex>',`#include <project_vertex>
 vec4 wxP=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 wxP=instanceMatrix*wxP;
 #endif
 vec4 wxW=modelMatrix*wxP;vWxY=wxW.y;vWxXZ=wxW.xz;`];
const weatherFrag=['#include <emissivemap_fragment>',`float wxUp=clamp((vec4(normal,0.)*viewMatrix).y,0.,1.),wxLow=1.-smoothstep(.6,1.4,vWxY),wxG=step(.85,wxUp)*wxLow;
 diffuseColor.rgb*=(1.-uWxWet*(.1+.4*wxG))*mix(vec3(1.),vec3(.88,.93,1.04),uWxWet*wxG);
 vec4 wxN=texture2D(uWearMap,vWxXZ*.0625),wxN2=texture2D(uWearMap,vWxXZ*.0213+.37);
 diffuseColor.rgb*=1.+uWear*wxG*((wxN.r-.5)*.34+(wxN2.r-.5)*.16+(wxN.g-.5)*.07);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.94,.97),uWxSnow*smoothstep(.55,.9,wxUp)*mix(.88,.42,wxLow));
#include <emissivemap_fragment>`];
export function addWeather(shader){Object.assign(shader.uniforms,{uWxWet:weather.wet,uWxSnow:weather.snow,uWear:weather.wear,uWearMap:{value:wearMap}});
 shader.vertexShader='varying float vWxY;varying vec2 vWxXZ;\n'+shader.vertexShader.replace(...weatherVert);
 shader.fragmentShader='uniform float uWxWet,uWxSnow,uWear;uniform sampler2D uWearMap;varying float vWxY;varying vec2 vWxXZ;\n'+shader.fragmentShader.replace(...weatherFrag);}
export function toon(params={}){const {roughness,metalness,...rest}=params;const m=new THREE.MeshToonMaterial({gradientMap,...rest});m.onBeforeCompile=addWeather;return m;}
// Walls: the toon material plus age and dirt for free (brief 3.4.9): the bottom `foot` units above `ground` darken by
// `dirt` (18%), and the top `cap` units of each box by `capDirt` (8%), measured per box so it works on instanced walls.
// Wave 4B weathering, hashed per instance (its world position, so it is stable and free): a slight warm/cool tint and
// value shift per building (`tint`), and rain streaks (`streak`) hanging under the window sills of the upper floors
// (sills at `sill` = ground + 3.8, + 2.5·k; none below `streakFrom`), on vertical faces only, faded out where a streak
// column is under a pixel wide.
// night:true also multiplies by NIGHT_TINT.walls as the shared night amount rises (leave it off if the caller tints).
// Wave 5A (facades.js): every wall also samples the shared facade atlas and fakes bevels / contact AO.
//   facade   null (default) = per instance, from the geometry's `aFacade` attribute (facades.js facadeAttribute; meshes
//            without it stay plain); or one name/code for the whole mesh, e.g. wallMaterial({facade:'tileWhite'}).
//   edges    true (default): bevel highlight, coping, drip line, ground/corner AO. Needs the unit BoxGeometry(1,1,1)
//            scaled per mesh or instance; pass false for other geometry.
//   facadeY0 world y where storey-aligned patterns start (default ground + 3.0, the first upper floor).
export function wallMaterial({ground=.24,foot=1,dirt=.18,cap=.3,capDirt=.08,streak=.13,tint=.07,sill=ground+3.8,streakFrom=sill-.9,night:nightTint=false,facade=null,edges=true,facadeY0=ground+3,...params}={}){
 const m=toon(params),u={uGround:{value:ground},uFoot:{value:foot},uDirt:{value:dirt},uCap:{value:cap},uCapDirt:{value:capDirt},uStreak:{value:streak},uTintShift:{value:tint},uSill:{value:sill},uStreakFrom:{value:streakFrom},uNight:night,uNightTint:{value:nightColor('walls')}};
 m.userData.wall=u;
 m.onBeforeCompile=shader=>{addWeather(shader);Object.assign(shader.uniforms,u);addFacade(shader,{edges,y0:facadeY0,ground,fixed:facade});
  shader.vertexShader='varying float vWallY;varying float vWallTop;varying float vWallU;varying float vWallV;varying vec2 vWallSeed;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
 vec4 wallP=vec4(transformed,1.);float wallSy=length(modelMatrix[1].xyz);vec3 wallN=normal;vWallSeed=modelMatrix[3].xz;
 #ifdef USE_INSTANCING
 wallP=instanceMatrix*wallP;wallSy*=length(instanceMatrix[1].xyz);wallN=mat3(instanceMatrix)*wallN;vWallSeed+=instanceMatrix[3].xz;
 #endif
 vec4 wallW=modelMatrix*wallP;wallN=normalize(mat3(modelMatrix)*wallN);
 vWallY=wallW.y;vWallTop=(.5-position.y)*wallSy;vWallU=abs(wallN.x)>.5?wallW.z:wallW.x;vWallV=1.-abs(wallN.y);`);
  shader.fragmentShader='uniform float uGround,uFoot,uDirt,uCap,uCapDirt,uStreak,uTintShift,uSill,uStreakFrom,uNight;uniform vec3 uNightTint;varying float vWallY;varying float vWallTop;varying float vWallU;varying float vWallV;varying vec2 vWallSeed;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 diffuseColor.rgb*=(1.-uDirt*(1.-clamp((vWallY-uGround)/uFoot,0.,1.)))*(1.-uCapDirt*step(vWallTop,uCap));
 float wallH=fract(sin(dot(vWallSeed,vec2(12.9898,78.233)))*43758.5453),wallCol=floor(vWallU*3.),wallS=fract(sin(wallCol*17.13+wallH*91.7)*43758.5453);
 diffuseColor.rgb*=vec3(1.+uTintShift*(wallH-.5),1.,1.-1.2*uTintShift*(wallH-.5))*(1.-.6*uTintShift*fract(wallH*7.31));
 float wallBelow=mod(uSill-vWallY,2.5),wallFade=1.-smoothstep(.12,.3,fwidth(vWallU));
 diffuseColor.rgb*=1.-uStreak*step(.6,wallS)*(1.-smoothstep(0.,.8+1.3*fract(wallS*5.3),wallBelow))*step(uStreakFrom,vWallY)*vWallV*wallFade*(.7+.3*sin(vWallY*5.+wallCol));
 ${nightTint?'diffuseColor.rgb*=mix(vec3(1.),uNightTint,uNight);':''}`);};
 m.customProgramCacheKey=()=>'wall-w5a'+(nightTint?'n':'')+(edges?'e':'')+(facade!=null?'f'+facade:'');
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
