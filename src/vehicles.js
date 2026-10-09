import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {toon,addWeather,night} from './toon.js';
// Low-poly Tokyo vehicles (wave 4C), built procedurally: box stacks with a tapered (bevelled) cabin, glass, bumpers,
// grille, head/tail lamps and indicators; wheels are a separate shared mesh that turns with the distance driven.
// Local frame: +z forward, +x the vehicle's left (left-hand traffic: the kerb side), y up from the road. 1 unit ≈ 1 m at
// the city's half scale (a sedan is 2.2 long, like the parked cars city.js draws).
// Every part carries aCol (its colour) and aPart = (paint, role): paint 1 takes the instance's body colour; role
// 0 none, 1 head lamp, 2 tail / brake lamp, 3 left indicator, 4 right indicator, 5 taxi roof sign, 6 bus destination sign.
export const ROLE={none:0,head:1,tail:2,indL:3,indR:4,sign:5,dest:6};
const GLASS='#2C3E48',TRIM='#3A4044',TYRE='#22292D',HEAD='#FFF3D0',TAIL='#C8443A',AMBER='#F2A33A';
// Body colours (muted Tokyo traffic: white, silver, black, grey, pearl, a few colours).
export const PAINTS={sedan:['#E8E6E0','#2F3437','#9AA3A8','#5B6466','#D9D3C3','#8C2F2A','#E8E6E0','#3F5770'],
 kei:['#EEEDE8','#D9C9A3','#9EC1C9','#C96F5B','#E8E6E0','#7FA07A'],taxi:['#1F2A44','#1F2A44','#1F2A44','#E8B83A','#2F6F4E'],
 van:['#EEEDE8','#E8E6E0','#C9CCC6'],bus:['#3E7A5C'],keitruck:['#EEEDE8','#E8E6E0'],scooter:['#C63B34','#2F3437','#E8E6E0','#2E6FB0']};

// A box whose top face is shrunk to (tw, td) and shifted by tz: the cabin's sloped glass, a bus's rounded roof edge.
function taper(w,h,d,tw,td,tz=0){
 const x=w/2,z=d/2,X=tw/2,Z=td/2,y0=-h/2,y1=h/2;
 const v=[[-x,y0,-z],[x,y0,-z],[x,y0,z],[-x,y0,z],[-X,y1,-Z+tz],[X,y1,-Z+tz],[X,y1,Z+tz],[-X,y1,Z+tz]];
 const quads=[[0,1,2,3],[4,5,6,7],[3,2,6,7],[1,0,4,5],[0,3,7,4],[2,1,5,6]],pos=[];
 for(const q of quads)for(const tri of [[q[0],q[1],q[2]],[q[0],q[2],q[3]]]){
  // Wind each triangle outward (normal away from the centre), whatever the quad order.
  const [A,B,C]=tri.map(k=>v[k]),ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],wx=C[0]-A[0],wy=C[1]-A[1],wz=C[2]-A[2];
  const nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx,out=nx*(A[0]+B[0]+C[0])+ny*(A[1]+B[1]+C[1])+nz*(A[2]+B[2]+C[2]);
  pos.push(...A,...(out>=0?B:C),...(out>=0?C:B));}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();return g;
}
const col=new THREE.Color();
function part(geo,x,y,z,color,paint=0,role=0,rx=0){
 let g=geo.index?geo.toNonIndexed():geo;g.deleteAttribute('uv');if(rx)g.rotateX(rx);g.translate(x,y,z);
 const n=g.attributes.position.count,c=new Float32Array(n*3),p=new Float32Array(n*2);col.set(color);
 for(let i=0;i<n;i++){c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b;p[i*2]=paint;p[i*2+1]=role;}
 g.setAttribute('aCol',new THREE.BufferAttribute(c,3));g.setAttribute('aPart',new THREE.BufferAttribute(p,2));return g;
}
const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
// Shared fittings: bumpers, grille, lamps and indicators at the ends of a body (half length L, half width W).
function ends(P,L,W,y,{grille=true,lampY=y+.08,lampW=.2}={}){
 P.push(part(box(W*2+.02,.12,.1),0,y-.1,L,TRIM),part(box(W*2+.02,.12,.1),0,y-.1,-L,TRIM));
 if(grille)P.push(part(box(W*.8,.1,.03),0,y+.02,L+.01,TRIM));
 for(const s of [-1,1]){P.push(part(box(lampW,.09,.03),s*(W-.16),lampY,L+.01,HEAD,0,ROLE.head),part(box(lampW*.9,.09,.03),s*(W-.14),lampY,-L-.01,TAIL,0,ROLE.tail));
  const ind=s>0?ROLE.indL:ROLE.indR;P.push(part(box(.07,.06,.03),s*(W-.03),lampY-.01,L+.012,AMBER,0,ind),part(box(.07,.06,.03),s*(W-.03),lampY+.08,-L-.012,AMBER,0,ind),part(box(.02,.05,.12),s*(W+.01),lampY+.02,L-.35,AMBER,0,ind));}
}
function mirrors(P,W,y,z){for(const s of [-1,1])P.push(part(box(.1,.07,.05),s*(W+.05),y,z,TRIM,1));}
// Vehicle types: dimensions, wheels ([x, z] per wheel, radius r, tyre width tw), cruise speed and the parts.
export const TYPES={
 sedan:{len:2.2,width:1,r:.2,tw:.16,wheels:[[.43,.7],[-.43,.7],[.43,-.68],[-.43,-.68]],v0:1,build(){const P=[];
  P.push(part(taper(1,.4,2.2,.98,2.1),0,.4,0,'#fff',1));
  P.push(part(taper(.92,.36,1.2,.8,.72,-.04),0,.78,-.12,GLASS),part(box(.8,.04,.74),0,.97,-.14,'#fff',1),part(box(.94,.3,.07),0,.78,-.06,'#fff',1));
  ends(P,1.1,.5,.36);mirrors(P,.46,.66,.42);return P;}},
 taxi:{len:2.25,width:1,r:.2,tw:.16,wheels:[[.43,.72],[-.43,.72],[.43,-.7],[-.43,-.7]],v0:1.05,build(){const P=[];
  P.push(part(taper(1,.42,2.25,.98,2.15),0,.41,0,'#fff',1),part(box(1.01,.05,1.6),0,.5,-.05,'#E9E4D6'));   // the white side stripe
  P.push(part(taper(.92,.44,1.3,.84,.92,-.02),0,.84,-.08,GLASS),part(box(.84,.04,.92),0,1.07,-.1,'#fff',1),part(box(.94,.38,.07),0,.84,0,'#fff',1));
  P.push(part(taper(.34,.14,.2,.26,.14),0,1.16,-.1,'#F0B23E',0,ROLE.sign));ends(P,1.125,.5,.37);mirrors(P,.46,.68,.5);return P;}},
 kei:{len:1.75,width:.9,r:.17,tw:.14,wheels:[[.39,.56],[-.39,.56],[.39,-.56],[-.39,-.56]],v0:.95,build(){const P=[];
  P.push(part(taper(.9,.38,1.75,.88,1.68),0,.37,0,'#fff',1));
  P.push(part(taper(.86,.46,1.4,.8,1.12,-.06),0,.79,-.06,GLASS),part(box(.8,.04,1.12),0,1.03,-.11,'#fff',1),part(box(.88,.42,.07),0,.79,0,'#fff',1),part(box(.88,.42,.07),0,.79,-.62,'#fff',1));
  ends(P,.875,.45,.32,{lampW:.16});mirrors(P,.42,.64,.4);return P;}},
 van:{len:2.45,width:1,r:.2,tw:.16,wheels:[[.43,.78],[-.43,.78],[.43,-.8],[-.43,-.8]],v0:.95,build(){const P=[];
  P.push(part(box(1,.5,2.45),0,.43,0,'#fff',1),part(taper(1,.5,2.3,.96,2.1,-.06),0,.93,-.06,'#fff',1));
  P.push(part(taper(.9,.36,.06,.9,.06,-.16),0,.93,1.07,GLASS),part(box(1.02,.3,.5),0,.95,.68,GLASS),part(box(1.02,.26,.5),0,.97,-.95,GLASS),part(box(.94,.28,.03),0,.92,-1.23,GLASS));
  ends(P,1.225,.5,.36,{lampW:.18});mirrors(P,.46,.84,.86);return P;}},
 bus:{len:4.2,width:1.15,r:.25,tw:.18,wheels:[[.5,1.35],[-.5,1.35],[.5,-1.3],[-.5,-1.3]],v0:.85,build(){const P=[];
  P.push(part(box(1.15,.62,4.2),0,.52,0,'#fff',1),part(taper(1.14,.62,4.16,1.06,4.06),0,1.14,0,'#EDE6D2'));
  P.push(part(box(1.17,.36,3.5),0,1.14,-.25,GLASS),part(box(1.02,.62,.03),0,1.02,2.105,GLASS),part(box(.9,.3,.03),0,1.17,-2.095,GLASS));
  P.push(part(box(.8,.13,.025),0,1.38,2.115,'#FFCF6E',0,ROLE.dest),part(box(.7,.12,1.3),0,1.51,-.4,'#C9CCC6'),part(box(.06,.5,.5),.58,.58,1.6,TRIM));   // destination, roof AC, the door
  ends(P,2.1,.575,.33,{lampW:.18});mirrors(P,.56,1.1,2.02);return P;}},
 keitruck:{len:1.75,width:.9,r:.17,tw:.14,wheels:[[.39,.55],[-.39,.55],[.39,-.55],[-.39,-.55]],v0:.95,build(){const P=[];
  P.push(part(taper(.9,.62,.72,.86,.6,-.04),0,.6,.5,'#fff',1),part(taper(.84,.3,.06,.8,.06,-.06),0,.76,.87,GLASS),part(box(.92,.24,.4),0,.78,.5,GLASS));
  P.push(part(box(.9,.1,1.05),0,.42,-.35,'#fff',1),part(box(.9,.24,.05),0,.58,-.86,'#fff',1),part(box(.9,.3,.05),0,.62,.15,'#fff',1));
  for(const s of [-1,1])P.push(part(box(.04,.22,1),s*.43,.58,-.36,'#fff',1));
  ends(P,.875,.45,.32,{lampW:.16,grille:false});mirrors(P,.42,.74,.66);return P;}},
 scooter:{len:.95,width:.34,r:.14,tw:.07,wheels:[[0,.33],[0,-.33]],v0:1.1,build(){const P=[];
  P.push(part(taper(.26,.24,.72,.22,.6),0,.33,-.02,'#fff',1),part(box(.24,.08,.42),0,.5,-.1,'#2B2B2B'),part(taper(.3,.42,.08,.26,.06),0,.55,.3,'#fff',1));
  P.push(part(box(.46,.04,.04),0,.82,.3,TRIM),part(box(.1,.08,.03),0,.72,.35,HEAD,0,ROLE.head),part(box(.12,.06,.03),0,.46,-.39,TAIL,0,ROLE.tail));
  for(const s of [-1,1])P.push(part(box(.04,.04,.03),s*.18,.82,.32,AMBER,0,s>0?ROLE.indL:ROLE.indR),part(box(.04,.04,.03),s*.1,.47,-.39,AMBER,0,s>0?ROLE.indL:ROLE.indR));
  // The rider: jacket, legs on the floorboard, arms to the bars, a white helmet.
  P.push(part(taper(.34,.44,.22,.3,.18),0,.94,-.08,'#2F3E66'),part(box(.3,.12,.36),0,.6,.06,'#263342'),part(box(.24,.25,.26),0,1.3,-.06,'#E9EEF0'),part(box(.2,.08,.02),0,1.29,.08,GLASS));
  for(const s of [-1,1])P.push(part(box(.08,.08,.38),s*.17,.95,.14,'#2F3E66',0,0,-.5));
  return P;}},
};
export const TYPE_NAMES=Object.keys(TYPES);
const geoCache=new Map();
export function vehicleGeometry(type){if(!geoCache.has(type))geoCache.set(type,mergeGeometries(TYPES[type].build()));return geoCache.get(type);}
// Wheel: a tyre (axis along x, radius 1, width 1) with a light hub and one spoke bar so the turning reads.
export function wheelGeometry(){
 const tyre=part(new THREE.CylinderGeometry(1,1,1,10,1).rotateZ(Math.PI/2),0,0,0,TYRE),hub=part(new THREE.CylinderGeometry(.55,.55,1.04,8,1).rotateZ(Math.PI/2),0,0,0,'#9AA3A8');
 const spoke=part(box(1.08,.22,1.5),0,0,0,'#5B6466');return mergeGeometries([tyre,hub,spoke]);
}
// Toon body material with per-vertex colour, per-instance paint (aBody) and lamps (aLamp = left, right, brake, sign).
// Night (toon.js `night`) lights head/tail lamps and signs; indicators blink at 1.6 Hz day and night.
export const vehicleTime={value:0};
export function vehicleMaterial(){
 const m=toon({roughness:.55});
 m.onBeforeCompile=sh=>{addWeather(sh);sh.uniforms.uVehNight=night;sh.uniforms.uVehTime=vehicleTime;
  sh.vertexShader='attribute vec3 aCol;attribute vec2 aPart;attribute vec3 aBody;attribute vec4 aLamp;uniform float uVehNight,uVehTime;varying vec3 vVehCol;varying float vVehGlow;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vVehCol=mix(aCol,aBody,aPart.x);float r=aPart.y,blink=step(.5,fract(uVehTime*1.6));
 vVehGlow=r<.5?0.:r<1.5?uVehNight*2.2:r<2.5?uVehNight*1.3+aLamp.z*1.8:r<3.5?blink*aLamp.x*2.6:r<4.5?blink*aLamp.y*2.6:r<5.5?uVehNight*1.4*aLamp.w:.35+uVehNight*1.2;`);
  sh.fragmentShader='varying vec3 vVehCol;varying float vVehGlow;\n'+sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( diffuse*vVehCol, opacity );')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=vVehCol*vVehGlow;');};
 m.customProgramCacheKey=()=>'city-vehicles-v1';return m;
}
// One InstancedMesh per type (cap instances each) plus one for all wheels. Unused types are hidden (no draw call).
export function createVehicleMeshes(caps,{material=vehicleMaterial()}={}){
 const meshes={};
 for(const t of TYPE_NAMES){const cap=Math.max(1,caps[t]||0),g=vehicleGeometry(t).clone();
  const body=new THREE.InstancedBufferAttribute(new Float32Array(cap*3),3),lamp=new THREE.InstancedBufferAttribute(new Float32Array(cap*4),4);
  body.setUsage(THREE.DynamicDrawUsage);lamp.setUsage(THREE.DynamicDrawUsage);g.setAttribute('aBody',body);g.setAttribute('aLamp',lamp);
  const m=new THREE.InstancedMesh(g,material,cap);m.name='vehicles '+t;m.count=0;m.visible=false;m.frustumCulled=false;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.raycast=()=>{};
  meshes[t]={mesh:m,body,lamp,cap,type:TYPES[t]};}
 const wheelCap=Math.max(1,TYPE_NAMES.reduce((s,t)=>s+(caps[t]||0)*TYPES[t].wheels.length,0));
 const wheels=new THREE.InstancedMesh(wheelGeometry(),toon({roughness:.9,vertexColors:true}),wheelCap);
 wheels.geometry.setAttribute('color',wheels.geometry.getAttribute('aCol'));wheels.name='vehicle wheels';wheels.count=0;wheels.frustumCulled=false;wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);wheels.raycast=()=>{};
 return {meshes,wheels,material};
}
