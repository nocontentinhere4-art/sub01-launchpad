import * as THREE from 'three';
import {toon,addWeather,night,weather} from './toon.js';
// Window interiors (art direction wave 4B): a fake interior for the city's glass bands, all in the shader.
// The bands are unit boxes scaled per instance (city.js `windows` batch, two instances per floor band), so the shader
// rebuilds window cells along the band's long side (one per ~1.15 units, with a 0.05 frame) and hashes each cell from
// the instance position. Per window: curtains, a furniture silhouette or two, a warm/cool shift, and at night
//   lit band  → 22% dark, 20% curtained (a warm cloth glow), 9% blue TV flicker, the rest a lamp-lit room;
//   unlit band → `spare` of the windows still glow dimly (so dark facades are never a flat block).
// Day: a sky-reflection gradient (lighter at the top), a diagonal glint and a faint interior behind the glass.
// Only dark, glassy instances get it (instance colour luminance < ~0.25, i.e. the brief's glass greys); bright overlays
// in the same batch (the orange review wrap, the open sign, vending displays) are left alone. Zero extra draw calls.
//
// Drop-in for city.js:  const windowMat=nightLit(windowMaterial()),...   (nightLit still adds its per-instance light;
// this shader re-shapes that light per window afterwards, so the order of the two hooks does not matter).
export const WINDOW={cell:1.15,frame:.05,mix:{dark:.22,curtain:.2,tv:.09},spare:.1,warm:'#FFC27A',tv:'#5D86FF',curtain:'#D9D2C2',frameColor:'#8A918F'};
// The GLSL hash, mirrored in JS (tests and anyone placing things against a lit window).
export const winHash=(x,y)=>{const v=Math.sin(x*12.9898+y*78.233)*43758.5453;return v-Math.floor(v);};
export const windowCells=len=>Math.max(1,Math.floor(len/WINDOW.cell+.5));
// Seed of one window: the instance (band) origin, its height folded in, and the cell index along the band.
export const windowSeed=(x,y,z,cell)=>[x+y*1.7+cell*3.17,z+y*2.3+cell*1.91];
export function windowKind(h){const m=WINDOW.mix;return h<=m.dark?'dark':h<=m.dark+m.curtain?'curtain':h<=m.dark+m.curtain+m.tv?'tv':'room';}
const glslColor=hex=>{const c=new THREE.Color(hex);return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;};
const f=v=>v.toFixed(4);

export const WINDOW_VERT=`
 mat4 winMx=modelMatrix;
 #ifdef USE_INSTANCING
 winMx=modelMatrix*instanceMatrix;
 #endif
 vec3 winS=vec3(length(winMx[0].xyz),length(winMx[1].xyz),length(winMx[2].xyz));
 bool winAlongX=winS.x>=winS.z;
 vWinFace=winAlongX?abs(normal.z):abs(normal.x);
 vWinUV=vec2(winAlongX?position.x*winS.x:position.z*winS.z,position.y*winS.y);
 vWinSize=vec2(winAlongX?winS.x:winS.z,winS.y);
 vWinSeed=winMx[3].xz+winMx[3].y*vec2(1.7,2.3);`;

export function windowFragment(){const m=WINDOW.mix,d=m.dark,c=d+m.curtain,t=c+m.tv;return {
 color:`
 #ifdef USE_COLOR
 vec3 winBase=vColor.rgb;
 #else
 vec3 winBase=diffuse;
 #endif
 float winGlass=(1.-smoothstep(.2,.3,dot(winBase,vec3(.3,.59,.11))))*step(.5,vWinFace)*uWinOn;
 float winN=max(1.,floor(vWinSize.x/${f(WINDOW.cell)}+.5)),winCw=vWinSize.x/winN,winX=vWinUV.x+vWinSize.x*.5,winCell=clamp(floor(winX/winCw),0.,winN-1.);
 vec2 winQ=vec2(clamp(winX/winCw-winCell,0.,1.),clamp(vWinUV.y/vWinSize.y+.5,0.,1.));
 float winH=fract(sin(dot(vWinSeed+winCell*vec2(3.17,1.91),vec2(12.9898,78.233)))*43758.5453),winH2=fract(winH*13.37+.17),winH3=fract(winH*71.9+.53);
 float winEdge=min(min(winQ.x,1.-winQ.x)*winCw,min(winQ.y,1.-winQ.y)*vWinSize.y),winFrame=1.-step(${f(WINDOW.frame)},winEdge);
 float wkDark=step(winH,${f(d)}),wkCurt=step(${f(d)},winH)*step(winH,${f(c)}),wkTv=step(${f(c)},winH)*step(winH,${f(t)}),wkRoom=1.-wkDark-wkCurt-wkTv;
 float winCurt=wkCurt*step(winH2<.5?winQ.x:1.-winQ.x,.35+.65*winH3);
 float winFurn=max(step(winQ.y,.28+.12*winH3)*step(abs(winQ.x-(.25+.5*winH2)),.16+.12*winH3),step(winH3,.45)*step(abs(winQ.x-(.86-.72*winH2)),.07)*step(winQ.y,.74));
 vec3 winDay=winBase*(.62+1.05*winQ.y)+vec3(.018,.026,.034)*winQ.y+.05*step(fract(winQ.x*.6+winQ.y*.45+winH*3.),.13);
 winDay=mix(winDay,winBase*.42,winFurn*.6*(1.-winCurt));
 winDay=mix(winDay,${glslColor(WINDOW.curtain)}*.6,winCurt*.85);
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuse*mix(winDay,${glslColor(WINDOW.frameColor)},winFrame),winGlass);`,
 light:`
 {float winE=dot(totalEmissiveRadiance,vec3(.333));vec3 winLit=totalEmissiveRadiance;
  float winFl=.55+.45*sin(uWinTime*6.3+winH*40.)*sin(uWinTime*1.7+winH*9.);
  vec3 winRoom=winLit*mix(vec3(1.),vec3(1.12,.94,.76),winH2)*(.8+.32*winQ.y)*(1.-.7*winFurn);
  vec3 winTv=${glslColor(WINDOW.tv)}*max(winE,.3)*winFl*(1.-.4*winFurn);
  vec3 winCloth=winLit*vec3(1.,.88,.7)*(.68+.12*winQ.y);
  vec3 winOn=wkRoom*winRoom+wkTv*winTv+wkCurt*mix(winRoom,winCloth,winCurt);
  vec3 winSpare=uWinNight*(${glslColor(WINDOW.warm)}*.5*step(winH,uWinSpare)*(1.-.7*winFurn)*mix(1.,.7,winCurt)+${glslColor(WINDOW.tv)}*.3*winFl*step(uWinSpare,winH)*step(winH,uWinSpare+.03));
  totalEmissiveRadiance=mix(totalEmissiveRadiance,mix(winSpare,winOn,step(.004,winE))*(1.-winFrame),winGlass);}
 #include <lights_toon_fragment>`};}

// A toon material for window bands with the fake interior. `spare` is the share of windows lit in bands that carry no
// per-instance light (raise it for meshes with no nightLit wrapper, e.g. the hero block: 0.55).
export function windowMaterial({spare=WINDOW.spare,interior=true,...params}={}){
 const m=toon({roughness:.7,...params}),u={uWinOn:{value:interior?1:0},uWinSpare:{value:spare},uWinNight:night,uWinTime:weather.time},fr=windowFragment();
 m.userData.windows=u;
 m.onBeforeCompile=shader=>{addWeather(shader);Object.assign(shader.uniforms,u);
  shader.vertexShader='varying float vWinFace;varying vec2 vWinUV,vWinSize,vWinSeed;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>'+WINDOW_VERT);
  shader.fragmentShader='uniform float uWinOn,uWinSpare,uWinNight,uWinTime;varying float vWinFace;varying vec2 vWinUV,vWinSize,vWinSeed;\n'+shader.fragmentShader
   .replace('#include <color_fragment>','#include <color_fragment>'+fr.color).replace('#include <lights_toon_fragment>',fr.light);};
 m.customProgramCacheKey=()=>'win-w4b';
 return m;
}
// The night-light hook city.js uses (nightLight attribute × night), for meshes outside city.js that want the same
// per-instance light (the hero block). Mirrors city.js's nightLit so the two read alike.
export function withNightLight(material,amount=night){
 const prev=material.onBeforeCompile;
 material.onBeforeCompile=(shader,renderer)=>{prev.call(material,shader,renderer);shader.uniforms.uNightL=amount;
  shader.vertexShader='attribute vec3 nightLight;\nvarying vec3 vNightLight;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNightLight = nightLight;');
  shader.fragmentShader='uniform float uNightL;\nvarying vec3 vNightLight;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vNightLight * uNightL;');};
 const key=material.customProgramCacheKey.bind(material);material.customProgramCacheKey=()=>key()+'|nl';
 return material;
}
