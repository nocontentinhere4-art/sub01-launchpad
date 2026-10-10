import * as THREE from 'three';
import {toon,night,nightColor,weather} from './toon.js';
import * as CS from './city-state.js';
import {streetPlan,ROWS as STREET_ROWS,BOULEVARDS as STREET_BOULEVARDS,hash,boulevardSide,boulevardTreeZ0,slotZ,BLVD} from './city-street.js';
import {cityLayout,BASE_Y,GROUND,STOREY,PARK_KINDS} from './lots.js';
import {canalLayout} from './city-life.js';
// City greenery (art direction wave 4B, brief 3.7 trees + 3.9 greens; refs real-04, real-05, real-12).
// Four tree species, each ONE instanced draw call of a merged low-poly tree (a trunk with branch stubs and 3–4
// overlapping crown blobs, never a lollipop) with a per-instance hue and a wind sway in the vertex shader:
//   zelkova  boulevards (broad vase crown)       ginkgo  boulevards (narrow, upright)
//   cherry   both canal banks, leaning over the water; pink while the weather is 'sakura' (toon weather.sakura), else green
//   grove    shrines and park edges (dense dark camphor/cedar clumps)
// Plus ONE box batch for the small things: balcony and rooftop planters, ivy strips on a few old side walls (both
// overview-LOD detail: setDetail(false) hides them by lowering the instance count), and park benches/shrubs.
// Everything is planned from lots.js / city-street.js / city-state.js and is deterministic (hashed, never i % n).
const EXT=()=>CS.CITY_EXTENT??{minX:-72.5,maxX:72.5,minZ:-71.5,maxZ:75.5};
const ROAD_Z=()=>CS.ROAD_Z??STREET_ROWS;
const BOULEVARD_X=()=>[...(CS.BOULEVARD_X??STREET_BOULEVARDS),...(CS.OUTER_BOULEVARD_X??[])];
const SCRAMBLE={x:29,z:2,r:7.5};
const central=(x,z)=>Math.abs(x)<14.2&&z>-11&&z<15;   // the hero block (main.js) plants its own

// ---------- Species: crown blobs [x,y,z, sx,sy,sz, shade] and trunk/branch segments [[a],[b],r0,r1] ----------
export const SPECIES={
 zelkova:{trunk:'#6B5443',leaves:['#6F8F5E','#7A955F','#62835A','#829C63'],
  wood:[[[0,0,0],[0,2.25,0],.15,.11],[[0,1.7,0],[.7,2.75,.25],.08,.05],[[0,1.8,0],[-.6,2.8,-.3],.08,.05]],
  blobs:[[0,3.2,0,1.55,1.0,1.5,1],[.8,2.95,.35,1.05,.78,1.0,.9],[-.6,3.7,-.35,1.05,.82,1.0,1.1],[.15,3.95,.6,.85,.62,.8,1.02]]},
 ginkgo:{trunk:'#76604C',leaves:['#8FA66B','#9AAE5E','#86A062','#A2B464'],
  wood:[[[0,0,0],[0,3.1,0],.13,.08]],
  blobs:[[0,2.75,0,1.05,1.05,1.0,.92],[.12,3.75,.05,.85,.95,.82,1.0],[-.05,4.6,-.05,.55,.75,.55,1.1]]},
 cherry:{trunk:'#5A4438',leaves:['#6F8F5E','#7C9862','#688A5A'],pink:['#EDBFCB','#E3A7B9','#F2CCD6','#E8B4C4'],
  wood:[[[0,0,0],[.35,1.35,0],.17,.12],[[.35,1.25,0],[1.6,2.0,.25],.09,.05],[[.3,1.3,0],[-.3,2.1,-.3],.08,.05],[[.35,1.3,0],[2.4,1.7,-.1],.07,.04]],
  blobs:[[.5,2.35,0,1.6,.75,1.45,1],[1.65,2.05,.35,1.25,.62,1.05,.92],[-.35,2.55,-.3,1.1,.66,1.05,1.08],[2.55,1.72,-.1,.9,.5,.82,.96]]},
 grove:{trunk:'#4E4038',leaves:['#3F5A3A','#4A6544','#3A5240','#46613F'],
  wood:[[[0,0,0],[0,1.7,0],.17,.12]],
  blobs:[[0,2.45,0,1.5,1.5,1.45,.95],[.55,3.55,.2,1.05,1.15,1.0,1.05],[-.4,4.25,-.25,.75,.95,.75,1.12]]},
};
export const SWAY={amp:.006,flutter:.025};
// The vertex shader's sway, mirrored in JS (tests): offset of a vertex at local height h, leaf 0/1, instance at (x,z).
export function swayOffset(t,x,z,h,leaf=1,amp=1){const p=x*.37+z*.21,g=.65+.35*Math.sin(t*.27+p*.13),k=SWAY.amp*amp*g*Math.max(0,h-1)**2*(.4+leaf);
 return [Math.sin(t*1.05+p)*k+leaf*SWAY.flutter*Math.sin(t*3.1+p),Math.cos(t*.81+p*1.3)*k];}

// Merged tree geometry: non-indexed, attributes position, normal (spherical per blob so the toon bands read round),
// aTint (blob shade) and aLeaf (0 wood, 1 crown). Icosahedron blobs (20 faces) with hashed jitter; 5-sided wood prisms.
const ICO=(()=>{const g=new THREE.IcosahedronGeometry(1,0),p=g.attributes.position.array;return Array.from(p);})();
export function treeGeometry(name){
 const sp=SPECIES[name],pos=[],nor=[],tint=[],leaf=[];
 for(const [a,b,r0,r1] of sp.wood){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A).normalize();
  const side=Math.abs(d.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0),u=side.clone().cross(d).normalize(),v=d.clone().cross(u);
  const ring=(c,r,k)=>{const ang=k/5*Math.PI*2;return [c.clone().addScaledVector(u,Math.cos(ang)*r).addScaledVector(v,Math.sin(ang)*r),u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(v,Math.sin(ang))];};
  for(let k=0;k<5;k++){const [p0,n0]=ring(A,r0,k),[p1,n1]=ring(A,r0,k+1),[q0]=ring(B,r1,k),[q1]=ring(B,r1,k+1),[,m1]=ring(B,r1,k+1);
   for(const [p,n] of [[p0,n0],[p1,n1],[q1,m1],[p0,n0],[q1,m1],[q0,n0]]){pos.push(p.x,p.y,p.z);nor.push(n.x,n.y,n.z);tint.push(1,1,1);leaf.push(0);}}}
 sp.blobs.forEach(([cx,cy,cz,sx,sy,sz,shade],bi)=>{
  for(let i=0;i<ICO.length;i+=3){const x=ICO[i],y=ICO[i+1],z=ICO[i+2],j=.86+.28*hash(Math.round(x*50),Math.round(y*50),Math.round(z*50),bi,name.length);
   pos.push(cx+x*sx*j,cy+y*sy*j,cz+z*sz*j);const n=new THREE.Vector3(x/sx,y/sy,z/sz).normalize();nor.push(n.x,n.y,n.z);
   const s=shade*(.9+.2*(y*.5+.5));tint.push(s,s,s);leaf.push(1);}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
 g.setAttribute('aTint',new THREE.Float32BufferAttribute(tint,3));g.setAttribute('aLeaf',new THREE.Float32BufferAttribute(leaf,1));g.computeBoundingSphere();
 return g;
}
// Tree material: toon + weather (snow settles on the crowns) + sway + per-instance hue on the crown only + shared night
// tint; cherry also blends each instance's pink by the sakura amount.
export function treeMaterial(name){
 const sp=SPECIES[name],cherry=name==='cherry',m=toon({roughness:1}),prev=m.onBeforeCompile;
 const u={uGTime:weather.time,uGSakura:weather.sakura,uGSway:{value:1},uGTrunk:{value:new THREE.Color(sp.trunk)},uGNight:night,uGNightTint:{value:nightColor('walls')}};
 m.userData.green=u;
 m.onBeforeCompile=(sh,r)=>{prev.call(m,sh,r);Object.assign(sh.uniforms,u);
  sh.vertexShader=`uniform float uGTime,uGSway;attribute vec3 aTint;attribute float aLeaf;varying vec3 vGTint;varying float vGLeaf;${cherry?'attribute vec3 aPink;varying vec3 vGPink;':''}\n`+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vGTint=aTint;vGLeaf=aLeaf;${cherry?'vGPink=aPink;':''}
 vec3 gO=vec3(0.);
 #ifdef USE_INSTANCING
 gO=instanceMatrix[3].xyz;
 #endif
 float gP=dot(gO.xz,vec2(.37,.21)),gH=max(0.,position.y-1.),gK=${SWAY.amp.toFixed(4)}*uGSway*(.65+.35*sin(uGTime*.27+gP*.13))*gH*gH*(.4+aLeaf);
 transformed.x+=sin(uGTime*1.05+gP)*gK+aLeaf*${SWAY.flutter.toFixed(4)}*uGSway*sin(uGTime*3.1+gP+position.x*4.+position.z*3.);
 transformed.z+=cos(uGTime*.81+gP*1.3)*gK;`);
  sh.fragmentShader=`uniform vec3 uGTrunk,uGNightTint;uniform float uGNight,uGSakura;varying vec3 vGTint;varying float vGLeaf;${cherry?'varying vec3 vGPink;':''}\n`+sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 #ifdef USE_COLOR
 vec3 gLeafC=vColor.rgb*vGTint;
 #else
 vec3 gLeafC=vGTint*.5;
 #endif
 ${cherry?'gLeafC=mix(gLeafC,vGPink*(.92+.1*vGTint),uGSakura);':''}
 diffuseColor.rgb=diffuse*mix(uGTrunk,gLeafC,vGLeaf)*mix(vec3(1.),uGNightTint,uGNight);`);};
 m.customProgramCacheKey=()=>'green-tree'+(cherry?'-cherry':'');
 return m;
}

// ---------- Plan (pure) ----------
const pick=(h,list)=>list[Math.min(list.length-1,Math.floor(h*list.length))];
export function boulevardTrees(){
 const out=[],plan=streetPlan(),poles=plan.poles,lamps=plan.lamps,ext=EXT(),rows=ROAD_Z();
 for(const bx of BOULEVARD_X()){const side=boulevardSide(bx),x=bx+side*BLVD.treeX;
  // One species per boulevard stretch between two road rows (mostly zelkova, a ginkgo avenue now and then). Every 4
  // (owner 2026-10-10: the boulevards read as empty pale strips from above), the crowns closing into an avenue.
  for(let z=boulevardTreeZ0(bx);z<ext.maxZ-1.5;z+=BLVD.treeStep){const zz=z+(hash(bx,z,13)-.5)*1.2;
   if(rows.some(r=>Math.abs(zz-r)<4.4)||central(x,zz)||Math.hypot(x-SCRAMBLE.x,zz-SCRAMBLE.z)<SCRAMBLE.r)continue;
   if(poles.some(p=>Math.abs(p.x-x)<2&&Math.abs(p.z-zz)<1.45)||lamps.some(l=>Math.abs(l.x-x)<1.2&&Math.abs(l.z-zz)<1.2))continue;
   const stretch=rows.findIndex(r=>r>zz),species=hash(bx,stretch,14)<.3?'ginkgo':'zelkova',h=hash(bx,zz,15);
   out.push({species,x,y:.2,z:zz,ry:h*6.283,s:.88+.24*hash(bx,zz,16),hue:h});}
  // A second, smaller row on the lamp side, behind the hedge: young ginkgos every 8, in the pole-side slot phase so
  // they never share a z with that side's parked cars (city-street.js slotZ).
  const x2=bx-side*BLVD.smallTreeX;
  for(let k=1;;k+=2){const z=slotZ(bx,k);if(z>ext.maxZ-1.5)break;const zz=z+(hash(bx,z,17)-.5)*.8;
   if(zz<ext.minZ+1.5||rows.some(r=>Math.abs(zz-r)<5)||central(x2,zz)||Math.hypot(x2-SCRAMBLE.x,zz-SCRAMBLE.z)<SCRAMBLE.r)continue;
   if(lamps.some(l=>l.base&&Math.abs(l.base.x-x2)<1&&Math.abs(l.base.z-zz)<1.3))continue;
   const h=hash(bx,zz,18);out.push({species:'ginkgo',x:x2,y:.2,z:zz,ry:h*6.283,s:.52+.14*hash(bx,zz,19),hue:h});}}
 return out;
}
// The tower park (owner 2026-10-10: the tower stands in the north half of the Shiba block, lots.js TOWER_PARK): dark
// camphor clumps along the west strip beside the gravel path and the temple hall, on the back lawn between the legs
// and on the small east and front lawns, two zelkovas behind the forecourt; four more camphors flank the pitch across
// the street. World [x, z, scale, species?]: nothing on the paths, the forecourt, the hall, the lamps or the four feet
// (footings at tower ± 4.65 ± .475), and no crown crossing a leg face (x −29.9 / −18.9, z −41.9 / −31.7) above y 2.4.
export const TOWER_TREES=[[-33.2,-34.4,.7],[-33.2,-35.6,.6],[-31.0,-37.9,.65],[-27.8,-35.2,.7,'zelkova'],[-21.0,-35.2,.7,'zelkova'],
 [-26.9,-39.7,.85],[-25.2,-40.6,.6],[-21.5,-39.3,.7],[-19.1,-33.6,.55],[-18.5,-37.0,.5,'zelkova'],
 [-33.9,-20.0,.75],[-24.1,-19.9,.75],[-33.9,-16.8,.7],[-24.1,-16.9,.7]];
export function towerParkTrees(){
 const out=[];for(const [x,z,k,sp] of TOWER_TREES){const h=hash(x,z,63);
  out.push({species:sp||'grove',x,y:BASE_Y,z,ry:h*6.283,s:k*(.92+.16*hash(x,z,64)),hue:h});}
 return out;
}
export function canalTrees(){
 const c=canalLayout(),out=[];
 for(const side of [-1,1]){const x=c.x+side*c.treeOffset;
  for(let z=c.z0+2.5+hash(side,21)*2;z<c.z1-2.5;z+=5.2+hash(side,z,22)*.8){
   if(c.bridges.some(b=>Math.abs(z-b)<4.4))continue;const h=hash(side,z,23);
   // Local +x is the side the crown leans to: toward the water.
   out.push({species:'cherry',x:x+(h-.5)*.3,y:c.top,z,ry:(side>0?Math.PI:0)+(hash(side,z,24)-.5)*.6,s:.9+.25*hash(side,z,25),hue:h});}}
 return out;
}
export function greenPlan(buildings=[],{extra=[],mobile=false}={}){
 const layout=cityLayout(buildings),trees=[...boulevardTrees(),...canalTrees(),...towerParkTrees(),...extra.map(t=>({hue:hash(t.x,t.z,31),ry:hash(t.x,t.z,32)*6.283,s:1,y:.2,...t}))];
 const boxes=[],detail=[],B=(list,x,y,z,w,h,d,color,ry=0)=>list.push({x,y,z,w,h,d,color,ry});
 for(const s of layout.spots){if(s.kind!=='shrine'&&!PARK_KINDS.has(s.kind))continue;const fz=s.front==='+z'?1:-1,P=(u,v)=>[s.x+u,s.frontZ+fz*v];
  if(s.reserved){   // a landmark's ground: the tower park plants above, the plaza gets four small zelkovas at its corners, the rest nothing
   if(s.reservedKind==='plaza'&&s.plotId)for(const [u,v] of [[-2.3,-1.0],[2.3,-1.0],[-2.3,-4.6],[2.3,-4.6]]){const [x,z]=P(u,v),h=hash(x,z,67);trees.push({species:'zelkova',x,y:BASE_Y,z,ry:h*6.283,s:.62+.1*hash(x,z,68),hue:h});}
   continue;}
  if(s.kind!=='shrine'&&s.kind!=='park'){   // a pitch, court or playground: one or two small groves at the street corners, nothing inside
   const n=1+(hash(s.x,s.z,61)<.5?1:0),first=hash(s.x,s.z,62)<.5?-1:1;
   for(let i=0;i<n;i++){const side=i?-first:first,[x,z]=P(side*(s.width/2-.3),-.3),h=hash(x,z,65);trees.push({species:'ginkgo',x,y:BASE_Y,z,ry:h*6.283,s:.6+.15*hash(x,z,66),hue:h});}}
  else if(s.kind==='shrine'){   // a dense grove behind and beside the shrine (the torii path stays open)
   for(const [u,v,k] of [[-(s.width/2-.8),-(s.depth-.8),.95],[s.width/2-.8,-(s.depth-.7),1],[-(s.width/2-.5),-s.depth*.35,.7],[0,-(s.depth+.2),.8]]){
    const [x,z]=P(u,v),h=hash(x,z,33);trees.push({species:'grove',x,y:BASE_Y,z,ry:h*6.283,s:k*(.85+.25*hash(x,z,34)),hue:h});}}
  else{   // a pocket park: a ginkgo in a back corner, a shrub hedge along the back, a second bench by the path
   const side=hash(s.x,s.z,35)<.5?-1:1,[gx,gz]=P(side*(s.width/2-.9),-(s.depth-.9));trees.push({species:'ginkgo',x:gx,y:BASE_Y,z:gz,ry:hash(gx,gz,36)*6.283,s:.8,hue:hash(gx,36)});
   for(let u=-s.width/2+.6;u<s.width/2-.5;u+=.95){const [x,z]=P(u,-(s.depth-.35));trees.push({species:'grove',x,y:BASE_Y-1.45*.32,z,ry:hash(x,z,37)*6.283,s:.32+.08*hash(x,z,38),hue:hash(x,z,39)});}
   const [bx,bz]=P(-side*1.2,-s.depth*.62);B(boxes,bx,BASE_Y+.42,bz,1.2,.07,.42,'#9A7A60');B(boxes,bx,BASE_Y+.2,bz,1.1,.36,.08,'#5B6466');B(boxes,bx,BASE_Y+.7,bz-fz*.2,1.2,.36,.06,'#9A7A60');}
 }
 // Balcony planters (T3 bands, T2 small balconies), rooftop pots on flat roofs, ivy on old side walls: detail only.
 const capPlanters=mobile?260:560,capIvy=mobile?50:110;let planters=0,ivy=0;
 const pot=(x,y,z,h)=>{B(detail,x,y,z,.3,.22,.24,pick(h,['#9A7A60','#B9C6C4','#7D8B8E','#C26A5C']));B(detail,x+(h-.5)*.05,y+.2,z,.36+.12*h,.24+.14*hash(h,1),.3,pick(hash(h,2),SPECIES.zelkova.leaves));planters++;};
 for(const lot of layout.lots){if(lot.user)continue;const fz=lot.front==='+z'?1:-1,r=k=>hash(lot.x,lot.z,k),F=(u,v)=>[lot.x+u,lot.frontZ+fz*v];
  if(lot.type==='T3'&&planters<capPlanters){const n=Math.max(1,lot.bays?.[0]?.length||1),pitch=lot.width/n;
   for(let k=1;k<lot.floors;k++)for(let j=0;j<n;j++){if(hash(lot.x,lot.z,k,j,41)>.2)continue;const [x,z]=F(-lot.width/2+pitch*(j+.5)+(hash(k,j,lot.x)-.5)*.5,.72);pot(x,BASE_Y+GROUND+STOREY*(k-1)+1.07,z,hash(lot.x,k,j,42));}}
  if(lot.type==='T2'&&planters<capPlanters)for(let k=1;k<lot.floors;k++){if(!lot.bays?.[k-1]?.[0]?.balcony||lot.width<1.85||r(43+k)>.35)continue;const [x,z]=F(lot.width/2-.45,.3);pot(x,BASE_Y+GROUND+STOREY*(k-1)+1.02,z,r(44+k));}
  if(lot.type!=='T5'&&lot.height>3&&r(45)<.12&&planters<capPlanters){const n=3+Math.floor(r(46)*3);for(let i=0;i<n;i++){const [x,z]=F((i-(n-1)/2)*.42+(r(47)-.5)*Math.max(0,lot.width-2.6),-.45);pot(x,BASE_Y+lot.height+.14,z,r(48+i));}}
  // Ivy: a few old houses and shop-houses, on an exposed side wall, as 2–4 overlapping thin strips.
  if((lot.type==='T5'||lot.type==='T4')&&ivy<capIvy&&r(51)<.28){const s=r(52)<.5?-1:1,neighbour=s<0?lot.leftH:lot.rightH,top=lot.type==='T5'?lot.eave:lot.height;
   if((neighbour||0)<top-1.5){const x=lot.x+s*(lot.width/2+.035),n=2+Math.floor(r(53)*3);ivy++;
    for(let i=0;i<n;i++){const h=1.4+r(54+i)*Math.min(3.2,top-1.6),w=.55+r(60+i)*.9,zc=lot.z+(r(66+i)-.5)*lot.depth*.6;B(detail,x+s*.01*i,BASE_Y+h/2,zc,.06,h,w,pick(r(70+i),['#4F6B45','#5E7A4E','#46603F','#6F8F5E']));}}}
 }
 const byKind={};for(const t of trees)(byKind[t.species]??=[]).push(t);
 return {trees:byKind,boxes:[...boxes,...detail],core:boxes.length,counts:{trees:trees.length,planters,ivy,boxes:boxes.length+detail.length}};
}

// ---------- GPU side ----------
export function addCityGreen(parent,{buildings=[],extra=[],mobile=false}={}){
 const root=new THREE.Group();root.name='city green';parent.add(root);
 const geos=Object.fromEntries(Object.keys(SPECIES).map(k=>[k,treeGeometry(k)])),mats=Object.fromEntries(Object.keys(SPECIES).map(k=>[k,treeMaterial(k)]));
 const boxGeo=new THREE.BoxGeometry(1,1,1),boxMat=toon({roughness:1}),boxPrev=boxMat.onBeforeCompile,boxU={uGNight:night,uGNightTint:{value:nightColor('walls')}};
 boxMat.onBeforeCompile=(sh,r)=>{boxPrev.call(boxMat,sh,r);Object.assign(sh.uniforms,boxU);sh.fragmentShader='uniform float uGNight;uniform vec3 uGNightTint;\n'+sh.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb*=mix(vec3(1.),uGNightTint,uGNight);');};
 boxMat.customProgramCacheKey=()=>'green-box';
 const dummy=new THREE.Object3D(),col=new THREE.Color();let meshes=[],boxMesh=null,plan=null,detail=true;
 function build(list){
  for(const m of meshes){root.remove(m);m.dispose();}meshes=[];plan=greenPlan(list,{extra,mobile});
  for(const [k,items] of Object.entries(plan.trees)){if(!items.length)continue;const sp=SPECIES[k],geo=geos[k].clone(),mesh=new THREE.InstancedMesh(geo,mats[k],items.length);
   const pink=k==='cherry'?new Float32Array(items.length*3):null;
   items.forEach((t,i)=>{dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(0,t.ry,0);dummy.scale.setScalar(t.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    col.set(pick(t.hue,sp.leaves)).offsetHSL((hash(t.hue,1)-.5)*.025,(hash(t.hue,2)-.5)*.08,(hash(t.hue,3)-.5)*.05);mesh.setColorAt(i,col);
    if(pink){col.set(pick(hash(t.hue,4),sp.pink));pink.set([col.r,col.g,col.b],i*3);}});
   if(pink)geo.setAttribute('aPink',new THREE.InstancedBufferAttribute(pink,3));
   mesh.name='green '+k;mesh.castShadow=k!=='grove'||items.length<200;mesh.receiveShadow=true;mesh.raycast=()=>{};mesh.computeBoundingSphere();mesh.userData.geo=geo;root.add(mesh);meshes.push(mesh);}
  const boxes=plan.boxes;boxMesh=new THREE.InstancedMesh(boxGeo,boxMat,Math.max(1,boxes.length));
  boxes.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.rotation.set(0,b.ry||0,0);dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();boxMesh.setMatrixAt(i,dummy.matrix);boxMesh.setColorAt(i,col.set(b.color));});
  boxMesh.userData.lod={core:plan.core,all:boxes.length};boxMesh.count=detail?boxes.length:plan.core;boxMesh.name='green boxes';boxMesh.receiveShadow=true;boxMesh.raycast=()=>{};boxMesh.computeBoundingSphere();root.add(boxMesh);meshes.push(boxMesh);
 }
 build(buildings);
 return {root,get meshes(){return meshes;},get plan(){return plan;},
  redraw(list){build(list);},
  // Overview LOD (main.js, with cityRenderer.setDetail): planters and ivy drop out below zoom 0.3.
  setDetail(on){detail=!!on;if(boxMesh)boxMesh.count=detail?boxMesh.userData.lod.all:boxMesh.userData.lod.core;},
  setSway(v){for(const m of Object.values(mats))m.userData.green.uGSway.value=v;},
  stats:()=>({drawCalls:meshes.length,trees:plan.counts.trees,boxes:boxMesh?.count??0,triangles:meshes.reduce((n,m)=>n+(m===boxMesh?12*m.count:m.geometry.attributes.position.count/3*m.count),0),...Object.fromEntries(Object.entries(plan.trees).map(([k,v])=>[k,v.length]))}),
  dispose(){for(const m of meshes){m.dispose();if(m.userData.geo)m.userData.geo.dispose();}parent.remove(root);for(const g of Object.values(geos))g.dispose();for(const m of Object.values(mats))m.dispose();boxGeo.dispose();boxMat.dispose();}};
}
