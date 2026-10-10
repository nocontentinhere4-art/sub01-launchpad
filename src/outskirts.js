import * as THREE from 'three';
import * as CS from './city-state.js';
import {riverHole} from './landmarks.js';
import {skylinePlan} from './city-life.js';
import {toon,night as nightShared} from './toon.js';
// Owner 2026-10-10: "no empty space under the city". The bare plate around the grid becomes Kanto suburbs: one- to
// three-storey houses with dark tiled roofs, the odd warehouse, fields between them, thinning out into the haze.
// Pure plan (tested) + one InstancedMesh (walls and roofs share the box), so the whole band is ONE draw call.
export const OUTSKIRTS={gap:6,band:96,cell:6.5,density:.66,fieldShare:.16,maxInstances:7000};
const WALLS=['#D9D3C6','#C9C4B8','#E4E0D6','#B9B8B0','#CBB9A3','#A9ADB0','#D5CDBD'];
const ROOFS=['#4A4F5A','#5C5248','#3E4653','#6A5D55','#50555C'];
const FIELDS=['#8FA66B','#A4B472','#7E9A62','#B5AD7A','#99A86A'];
const hash=(...a)=>{let h=2166136261;for(const v of a)h=Math.imul(h^Math.round(v*997),16777619)>>>0;return (h>>>8)/16777216;};
export const outskirtsExtent=()=>{const e=CS.CITY_EXTENT,M=OUTSKIRTS.gap+OUTSKIRTS.band;return {minX:e.minX-M,maxX:e.maxX+M,minZ:e.minZ-M,maxZ:e.maxZ+M};};
// Distance (world units) from a point to the city's rectangle, 0 inside.
export const beyondCity=(x,z,e=CS.CITY_EXTENT)=>Math.max(0,e.minX-x,x-e.maxX,e.minZ-z,z-e.maxZ);
// -> [{kind:'house'|'shed'|'field', x, z, w, d, h, wall, roof, ry}] in a ring around CITY_EXTENT, denser near the city.
export function outskirtsPlan(){
 const e=CS.CITY_EXTENT,{gap,band,cell}=OUTSKIRTS,o=outskirtsExtent(),river=CS.CANAL_X==null?null:riverHole();
 const sky=skylinePlan().map(b=>({x0:b.x-b.w/2-1,x1:b.x+b.w/2+1,z0:b.z-b.d/2-1,z1:b.z+b.d/2+1}));
 const out=[];
 for(let z=o.minZ+cell/2;z<o.maxZ;z+=cell)for(let x=o.minX+cell/2;x<o.maxX;x+=cell){
  const u=(beyondCity(x,z,e)-gap)/band;if(u<0||u>1)continue;
  const r=k=>hash(x,z,k);
  if(r(1)>OUTSKIRTS.density*(1-u*.8))continue;                                   // thins out toward the haze
  if(river&&x>river.x0-3&&x<river.x1+3)continue;                                 // the river keeps running
  const px=x+(r(2)-.5)*(cell-4.6),pz=z+(r(3)-.5)*(cell-4.6);
  if(sky.some(b=>px>b.x0&&px<b.x1&&pz>b.z0&&pz<b.z1))continue;                   // under the distant skyline
  if(r(4)<OUTSKIRTS.fieldShare){out.push({kind:'field',x:px,z:pz,w:cell-1.2,d:cell-1.2,h:.08,wall:FIELDS[Math.floor(r(5)*FIELDS.length)],roof:null,ry:0});continue;}
  const shed=r(6)<.08,w=shed?5+r(7)*2.5:2.3+r(7)*2.4,d=shed?4+r(8)*2:2.3+r(8)*2.4,k=r(9),h=shed?3.2:k<.5?1.9:k<.88?3.1:4.3;
  out.push({kind:shed?'shed':'house',x:px,z:pz,w,d,h,wall:shed?'#AEB3B8':WALLS[Math.floor(r(10)*WALLS.length)],roof:shed?'#7C8390':ROOFS[Math.floor(r(11)*ROOFS.length)],ry:(r(12)-.5)*.5});
 }
 return out;
}
// Builder: walls + roof slabs (one per house, overhanging) + fields in one InstancedMesh. Night: the ground's tint.
export function addOutskirts(parent,plan=outskirtsPlan()){
 const items=[];
 for(const p of plan){
  items.push({x:p.x,y:p.h/2,z:p.z,w:p.w,h:p.h,d:p.d,ry:p.ry,color:p.wall});
  if(p.roof)items.push({x:p.x,y:p.h+.14,z:p.z,w:p.w+.5,h:.28,d:p.d+.5,ry:p.ry,color:p.roof});
 }
 const n=Math.min(items.length,OUTSKIRTS.maxInstances),geo=new THREE.BoxGeometry(1,1,1),mat=toon({roughness:.9}),prev=mat.onBeforeCompile;
 mat.onBeforeCompile=(s,r)=>{prev.call(mat,s,r);s.uniforms.uOsNight=nightShared;s.uniforms.uOsTint={value:new THREE.Color().setHex(0x55617A,THREE.LinearSRGBColorSpace)};
  s.fragmentShader='uniform float uOsNight;uniform vec3 uOsTint;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(1.),uOsTint,uOsNight);');};
 mat.customProgramCacheKey=()=>'outskirts';
 const mesh=new THREE.InstancedMesh(geo,mat,n),dummy=new THREE.Object3D(),c=new THREE.Color();
 for(let i=0;i<n;i++){const s=items[i];dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,s.ry,0);dummy.scale.set(s.w,s.h,s.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,c.set(s.color));}
 mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 mesh.name='outskirts';mesh.frustumCulled=false;mesh.raycast=()=>{};mesh.receiveShadow=false;mesh.castShadow=false;parent.add(mesh);
 return {mesh,stats:()=>({houses:plan.filter(p=>p.kind!=='field').length,fields:plan.filter(p=>p.kind==='field').length,instances:n,drawCalls:1}),
  setVisible(v){mesh.visible=!!v;},dispose(){parent.remove(mesh);mesh.dispose();geo.dispose();mat.dispose();}};
}
