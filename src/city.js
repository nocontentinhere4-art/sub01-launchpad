import * as THREE from 'three';
import * as T from './toon.js';
import {windowMaterial} from './windows.js';
import {addCityLife} from './city-life.js';
import {addCityCrowd} from './city-crowd.js';
import {addCityTraffic} from './city-traffic.js';
import {addTokyoStyle} from './tokyo-style.js';
import {facadeCode as fc,facadeAttribute,facadeDetail,prismGeometry,arcGeometry,withFacade} from './facades.js';
import {TOWER,towerPlan,towerRibbons,footTownTop} from './tokyo-tower.js';
import {cityPlots,districts,tower,plotView,BOULEVARD_X,ROAD_Z,CITY_EXTENT} from './city-state.js';
import {cityLayout,rng,BASE_Y,GROUND,STOREY,sidewalkSides,isCommercial,isRing3,builtHeight} from './lots.js';
const wallMaterial=params=>(T.wallMaterial||T.toon)(params);
// Night multipliers are plain 0–1 factors (brief 3.9: walls ×#6F7D99, ground ×#55617A), not sRGB colours.
const factor=hex=>new THREE.Color().setHex(parseInt(hex.slice(1),16),THREE.LinearSRGBColorSpace);
const NIGHT_WALL=T.nightColor?T.nightColor('walls'):factor('#6F7D99'),NIGHT_GROUND=T.nightColor?T.nightColor('ground'):factor('#55617A'),DAY=new THREE.Color(1,1,1);
const WHITE=new THREE.Color('#ffffff'),BLACK=new THREE.Color('#000000');
const tint=(hex,f)=>{const c=new THREE.Color(hex);return f>0?c.lerp(WHITE,f):c.lerp(BLACK,-f);};
const GLASS_LOW='#3D525B',GLASS_HIGH='#5E7881',AC='#E5E1D6';
const ROWS=ROAD_Z,BLVD_Z0=CITY_EXTENT.minZ,BLVD_Z1=CITY_EXTENT.maxZ;
const CARS=['#E8E6E0','#2F3437','#9AA3A8','#1F2A44','#B33A32','#D9D3C3'];
// Wave 5A facade codes used below (facades.js): plain surfaces per lot.facade, decals, flags.
const F_FAN=fc('fan'),F_FAN_X=fc('fan',{swap:true}),F_DOOR=fc('door'),F_PAINT=fc('paint'),F_MANHOLE=fc('manhole'),F_ROOF=fc('membrane',{inset:true});
const NOEDGE=name=>fc(name,{noEdge:true});
// Per-instance night light: an extra vec3 attribute added to the emissive term, so only chosen windows glow.
function nightLit(material){
 const night={value:0},prev=material.onBeforeCompile;material.userData.night=night;
 material.onBeforeCompile=(shader,renderer)=>{prev?.call(material,shader,renderer);shader.uniforms.uNight=night;
  shader.vertexShader='attribute vec3 nightLight;\nvarying vec3 vNightLight;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNightLight = nightLight;');
  shader.fragmentShader='uniform float uNight;\nvarying vec3 vNightLight;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vNightLight * uNight;');};
 const key=material.customProgramCacheKey?.bind(material);material.customProgramCacheKey=()=>(key?key():'')+'|city-night-light-v1';
 return material;
}
function shaped(x,y,z,pre,rot,post){const m=new THREE.Matrix4().makeScale(...pre);m.premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));m.premultiply(new THREE.Matrix4().makeScale(...post));return m.premultiply(new THREE.Matrix4().makeTranslation(x,y,z));}
// 2700 K homes, office white, a few cool stairwells, the rest dark (brief 3.9 night).
const bandLight=(r,home)=>{const x=r();return x<.1?'#D8E6F0':x<(home?.48:.6)?(home?'#FFC27A':'#FFE6B8'):null;};
// The street band under the tower (Shiba's street): a paved plaza replaces the zebra there.
const TOWER_PLAZA={x0:tower.x-6.2,x1:tower.x+6.2,z0:tower.z-3.3,z1:tower.z+3.3};
const KEYS=['roads','marks','walls','windows','roofs','prisms','awnings'];

export function createCity(scene,interactive,showPlace,buildings,options={}){
 const root=new THREE.Group();scene.add(root);
 const geometry=new THREE.BoxGeometry(1,1,1),GEOS={prisms:prismGeometry(),awnings:arcGeometry(6)};
 const wallMat=wallMaterial({roughness:1,ground:BASE_Y}),groundMat=withFacade(T.toon({roughness:1}),{edges:false,ground:BASE_Y});
 const windowMat=nightLit(windowMaterial()),towerMat=nightLit(T.toon({roughness:.9})),ribbonMat=nightLit(T.toon({roughness:.9,side:THREE.DoubleSide}));
 const MATS={roads:groundMat,marks:groundMat,walls:wallMat,windows:windowMat,roofs:wallMat,prisms:wallMat,awnings:wallMat};
 // Two lists per batch: core instances first, then "detail" ones (AC units, small roof items, side pipes, all road
 // marks, wave 5A's railings, frames, legs, dishes). setDetail(false) at overview zoom just lowers each InstancedMesh's
 // count to its core: no extra draw calls.
 let batches={},details={},detail=false;
 const add=(key,x,y,z,w,h,d,color,o)=>(detail||key==='marks'?details:batches)[key].push(o?{x,y,z,w,h,d,color,...o}:{x,y,z,w,h,d,color});
 const fine=fn=>{const was=detail;detail=true;try{fn();}finally{detail=was;}};
 const dummy=new THREE.Object3D(),col=new THREE.Color();
 function batch(items,parent,material,lit,geo0=geometry){
  const geo=geo0.clone(),mesh=new THREE.InstancedMesh(geo,material,Math.max(1,items.length)),light=lit?new Float32Array(Math.max(1,items.length)*3):null;
  mesh.count=items.length;
  items.forEach((v,i)=>{
   if(v.m)mesh.setMatrixAt(i,v.m);else{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(v.rx||0,v.ry||0,v.rz||0,v.order||'XYZ');dummy.scale.set(v.w,v.h,v.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
   mesh.setColorAt(i,col.set(v.color));
   if(light&&v.light){col.set(v.light).multiplyScalar((v.glow??1)*.55);light[i*3]=col.r;light[i*3+1]=col.g;light[i*3+2]=col.b;}
  });
  if(lit)geo.setAttribute('nightLight',new THREE.InstancedBufferAttribute(light,3));
  if(material===wallMat||material===groundMat)geo.setAttribute('aFacade',facadeAttribute(items.length?items.map(v=>v.fac):[0]));
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.receiveShadow=true;mesh.castShadow=material===wallMat;mesh.computeBoundingSphere();parent.add(mesh);return mesh;
 }

 // ---------- Ground (brief 3.7, plan item 8; wave 5A surfaces) ----------
 // District pads cover the whole 29 × 30 pitch (the half-strips to the boulevards and between rows included), clamped
 // to the city extent at the outer edge, so no sky shows between districts whatever lies under the city.
 function ground(){
  const E=CITY_EXTENT,ASPH=fc('asphalt'),PAVE=fc('pavers');
  for(const d of districts){
   const walks=sidewalkSides(d.id),commercial=isCommercial(d.id),half=s=>walks.includes(s)?2.25:3.25;
   const x0=Math.max(d.x-14.5,E.minX-.4),x1=Math.min(d.x+14.5,E.maxX+.4),pz0=Math.max(d.z-15,E.minZ-.4),pz1=Math.min(d.z+15,E.maxZ+.4);
   add('roads',(x0+x1)/2,.03,(pz0+pz1)/2,x1-x0,.18,pz1-pz0,'#A9A79D');
   const z0=d.z-half(-1),z1=d.z+half(1);add('roads',d.x,.155,(z0+z1)/2,28,.07,z1-z0,'#7A7F7C',{fac:ASPH});
   for(const s of [-1,1]){
    if(walks.includes(s)){add('roads',d.x,.18,d.z+s*2.775,28,.12,1.05,'#B4B1A7',{fac:PAVE});add('roads',d.x,.185,d.z+s*2.31,28,.13,.12,'#D6D2C7');
     if(commercial)add('marks',d.x,.245,d.z+s*2.55,28,.012,.3,'#E2B53A');}
    // Gutter: the wet dark line at the kerb foot (or at the lot line where there is no sidewalk).
    add('marks',d.x,.1915,d.z+s*(half(s)-.05),28,.004,.09,'#5A605F');
    add('marks',d.x,.193,d.z+s*(half(s)-.4),27.6,.008,.12,'#E6E4DC',{fac:F_PAINT});
   }
   // Back lane (owner 2026-10-10): a narrow asphalt lane along the row boundary south of this block, where the
   // interior houses of both rows face each other (lots.js INNER); white edge lines, no centre line.
   if(d.z+15<E.maxZ-1){const lz=d.z+15;add('roads',(x0+x1)/2,.15,lz,x1-x0,.06,3,'#6E7372',{fac:ASPH});
    for(const s of [-1,1])add('marks',(x0+x1)/2,.1835,lz+s*1.4,x1-x0,.004,.1,'#DCDAD2',{fac:F_PAINT});}
   // Manholes: two per district street, hashed along it, clear of the zebras and the tower plaza.
   const rm=rng(d.id+':manholes');
   for(let i=0;i<2;i++){const x=d.x+(rm()-.5)*20,z=d.z+(rm()<.5?-1:1)*(.55+rm()*.4);
    if(Math.abs(x-d.x)<3.4&&[-29,29].includes(d.x)||x>TOWER_PLAZA.x0&&x<TOWER_PLAZA.x1&&z>TOWER_PLAZA.z0&&z<TOWER_PLAZA.z1)continue;
    add('marks',x,.1945,z,.62,.01,.62,'#7A7F7C',{fac:F_MANHOLE});}
  }
  // Japanese zebras: bars only, 0.45 wide with 0.45 gaps (worn paint); a ◇ six units before each approach.
  const zebra=(cx,d,commercial)=>{for(let i=0;i<4;i++)add('marks',cx+(i-1.5)*.9,.196,d.z,.45,.01,4.4,'#ECEAE2',{fac:F_PAINT});
   if(commercial)for(const s of [-1,1])for(const dx of [-1.6,1.6])add('marks',cx+dx,.247,d.z+s*2.55,.6,.012,.6,'#E2B53A');
   for(const dir of [-1,1]){const x=cx-dir*6,z=d.z+dir*.75;add('marks',0,0,0,0,0,0,'#ECEAE2',{m:shaped(x,.197,z,[.62,.01,.62],[0,Math.PI/4,0],[2.4,1,1])});add('marks',0,0,0,0,0,0,'#7A7F7C',{m:shaped(x,.199,z,[.42,.01,.42],[0,Math.PI/4,0],[2.4,1,1]),fac:fc('asphalt')});}};
  for(const d of districts){const c=isCommercial(d.id);
   if([-29,29].includes(d.x)&&[-28,2,32].includes(d.z)&&!(d.x===tower.x&&d.z===tower.z))zebra(d.x,d,c);
   for(const bx of BOULEVARD_X)if(Math.abs(bx-d.x)<15)zebra(bx+Math.sign(d.x-bx)*3.2,d,c);}
  // Boulevards run the whole built area (city-state.js CITY_EXTENT: z −101.5…105.5 for the 7×7 city); asphalt along z.
  for(const x of BOULEVARD_X){add('roads',x,.17,(BLVD_Z0+BLVD_Z1)/2,2.6,.05,BLVD_Z1-BLVD_Z0,'#646B6C',{fac:fc('asphalt',{swap:true})});for(let z=BLVD_Z0+5.5;z<=BLVD_Z1-5.5;z+=6)if(!ROWS.some(r=>Math.abs(z-r)<3.6))add('marks',x,.198,z,.08,.01,.8,'#E6E4DC',{fac:F_PAINT});
   for(let z=BLVD_Z0+7.5;z<=BLVD_Z1-5.5;z+=12){add('marks',x+.6,.199,z,.6,.01,.6,'#646B6C',{fac:F_MANHOLE});}}
  // The tower plaza: pavers over the Shiba street band under FootTown.
  add('marks',tower.x,.1985,tower.z,TOWER_PLAZA.x1-TOWER_PLAZA.x0,.006,TOWER_PLAZA.z1-TOWER_PLAZA.z0,'#B9B4A8',{fac:fc('pavers')});
 }

 // ---------- Buildings ----------
 function drawLot(lot,st={}){
  const fz=lot.front==='+z'?1:-1,w=lot.width,D=lot.depth,H=lot.height,t=lot.type,y0=BASE_Y,backZ=lot.frontZ-fz*D;
  const F=(key,u,y,v,ww,h,dd,color,o)=>add(key,lot.x+u,y0+y,lot.frontZ+fz*v,ww,h,dd,color,o);
  const r=rng(lot.id+':draw'),rr=rng(lot.id+':w5a-draw'),home=['T2','T3','T4','T5'].includes(t);
  const glass=(k,o={})=>({...o,light:st.dark?null:bandLight(r,home)});
  // Glass curtain facades read as glass: the wall colour leans to the brief's blue-grey glass.
  const wall=lot.facade==='glass'&&!lot.user?'#'+tint(lot.wall,0).lerp(new THREE.Color('#5A7680'),.7).getHexString():lot.wall;
  const band=tint(wall,.14),sill=tint(wall,.26),floors=lot.floors,body={fac:fc(lot.facade||'plaster')},ry0=fz>0?0:Math.PI;
  // Second LOD (wave 4A): third-ring lots keep only body, roof and glass at overview; floor bands, canopies and all roof
  // clutter join the detail tail that setDetail(false) hides.
  const far=isRing3(lot.district)&&!lot.user,Fb=far?(...a)=>fine(()=>F(...a)):F;
  const yk=k=>GROUND+STOREY*(k-1);
  // Body, then a dark inset roof inside the wall's own top rim (the parapet; the slab darkens inward from it).
  if(t==='T5'){
   const eave=lot.eave;add('walls',lot.x,y0+eave/2,lot.z,w,eave,D,wall,body);
   // Gable roof (wave 5A): two kawara prisms with eaves overhang, wall-coloured gable ends under them, ridge cap and
   // fascia boards (detail).
   const along=w>=D,span=along?D:w,len=(along?w:D)+.6,half=(span+.8)/2,rise=H-eave+.1,yc=y0+eave-.05+rise/2;
   for(const s of [-1,1]){const o={ry:along?(s>0?0:Math.PI):(s>0?Math.PI/2:-Math.PI/2),fac:fc('kawara',{swap:!along,noEdge:true})};
    add('prisms',lot.x+(along?0:s*half/2),yc,lot.z+(along?s*half/2:0),len,rise,half,lot.roof,o);
    fine(()=>{add('prisms',lot.x+(along?0:s*span/4),y0+eave+(H-eave)/2-.04,lot.z+(along?s*span/4:0),len-.6,H-eave,span/2,wall,{ry:o.ry,fac:NOEDGE(lot.facade||'wood')});
     add('walls',lot.x+(along?0:s*half),y0+eave-.06,lot.z+(along?s*half:0),along?len:.05,.1,along?.05:len,'#4A3A2E');});}
   fine(()=>add('roofs',lot.x,y0+eave-.05+rise+.03,lot.z,along?len:.2,.1,along?.2:len,tint(lot.roof,-.18)));
   F('walls',0,.5,lot.setback-.08,w+.6,1,.15,'#6B645D');
  }else{
   if(lot.shop==='pilotis'){add('walls',lot.x,y0+GROUND+(H-GROUND)/2,lot.z,w,H-GROUND,D,wall,body);add('walls',lot.x,y0+GROUND/2,lot.z-fz*D*.3,w-.1,GROUND,D*.4,tint(wall,-.25));
    for(const s of [-1,1])F('walls',s*(w/2-.15),GROUND/2,-.15,.3,GROUND,.3,band);
    const c=CARS[Math.floor(r()*CARS.length)];F('walls',0,.45,-1.4,.95,.55,1.9,c);F('walls',0,.92,-1.5,.85,.42,1.05,tint(c,-.15));}
   else add('walls',lot.x,y0+H/2,lot.z,w,H,D,wall,body);
   add('roofs',lot.x,y0+H+.015,lot.z,w-.3,.03,D-.3,lot.roof,{fac:F_ROOF});
   // T1/T7: a light metal coping ring on the parapet (detail).
   if(t==='T1'||t==='T7')fine(()=>{const c=tint(wall,.3);for(const s of [-1,1]){add('roofs',lot.x,y0+H+.025,lot.z+s*(D/2-.06),w+.04,.05,.16,c);add('roofs',lot.x+s*(w/2-.06),y0+H+.025,lot.z,.16,.05,D-.28,c);}});
   // T4 mansard: a slate slope standing on the front of the roof.
   if(lot.roofForm==='mansard')Fb('prisms',0,H-.6+.55,-.4,w+.04,1.1,.8,'#59606A',{ry:ry0,fac:fc('metal',{noEdge:true})});
  }
  // Ground floor (3.0) by shopfront variant.
  const shop=lot.shop;
  if(shop==='glazed'){F('windows',0,1.4,.02,w-.5,2.5,.06,GLASS_LOW,st.dark||r()<.2?undefined:{light:'#FFE6B8',glow:.85});}
  else if(shop==='shutter'){F('walls',0,1.3,.03,w-.5,2.5,.06,'#9EA3A2',{fac:fc('shutter')});fine(()=>F('walls',0,2.68,.12,w-.4,.26,.22,'#8E9392'));}
  else if(shop==='noren'){F('walls',0,1.4,.02,w-.5,2.6,.05,'#4A3A2E',{fac:fc('wood')});const u=(r()-.5)*(w-1.6);F('windows',u,1.2,.05,.9,1.9,.03,GLASS_LOW,st.dark?undefined:{light:'#FFC27A',glow:.8});F('walls',u,2.2,.12,1.0,.7,.03,r()<.5?'#2E3A55':'#8C2F2A');}
  else if(shop==='entrance'||shop==='house'){const side=r()<.5?-1:1,du=side*Math.max(0,w/2-.65);
   if(shop==='house')F('walls',du,1.05,.03,.9,1.9,.06,'#8A6A4C',{fac:F_DOOR});
   else{F('windows',du,1.1,.02,.9,2.0,.05,GLASS_LOW,!st.dark&&r()<.6?{light:'#FFE6B8',glow:.7}:undefined);
    // Recessed entrance: a dark inset around the door, a glass transom and a light lintel.
    fine(()=>{F('walls',du,1.2,.012,1.12,2.4,.03,'#3A3F42');F('windows',du,2.28,.03,.86,.26,.04,GLASS_LOW);F('walls',du,2.47,.05,1.16,.07,.1,sill);});}
   if(shop==='entrance')F('walls',-du*.2-side*.4,1.0,.03,Math.min(1.2,w-1.4),1.1,.06,'#8E9290');
   else if(w>2){F('windows',-side*Math.max(0,w/2-1),1.75,.02,1.0,1.0,.04,GLASS_LOW,glass(0));F('walls',-side*Math.max(0,w/2-1),1.22,.06,1.15,.06,.12,sill);}}
  else if(shop==='konbini'){F('windows',0,1.35,.02,w*.85,2.4,.06,GLASS_HIGH,{light:'#EAF4FF'});lot.stripe.forEach((c,i)=>F('walls',0,3.06+i*.117,.05,w+.02,.117,.1,c));for(const du of [.35,.8])F('walls',w/2-du,.45,.2,.38,.9,.38,'#4B6A8A');pools.push([lot.x,lot.frontZ+fz*.9,'#EAF4FF',Math.min(3.2,w*.6),.6]);}
  // Awning: a quarter-round striped canvas (one shared arc geometry) and its valance.
  if(lot.awning&&t!=='T4'){const a=lot.awning,ha=Math.min(.6,a.depth*.75),code=fc('awning',{noEdge:true});
   Fb('awnings',0,a.y+.1-ha/2,a.depth/2,w-.2,ha,a.depth,a.color,{ry:ry0,fac:code});fine(()=>F('walls',0,a.y+.1-ha+.06,a.depth+.005,w-.2,.14,.02,a.color,{fac:code}));}
  // T4 shop canopy, or (roofForm 'pent') a small tiled hisashi roof over the shop.
  if(t==='T4'&&shop!=='house'&&shop!=='pilotis'){
   if(lot.roofForm==='pent')Fb('prisms',0,2.76,.35,w+.06,.52,.7,lot.roof==='#7C8A80'?'#5B6466':'#4E5864',{ry:ry0,fac:fc('kawara',{noEdge:true})});
   else Fb('walls',0,2.95,.3,w,.12,.6,'#5B6466',{rx:fz*.17,fac:fc('metal')});}
  // Upper floors: one rhythm per facade (brief 3.4.4).
  for(let k=1;k<floors&&t!=='T6';k++){
   const y=yk(k),g=k<=2?GLASS_LOW:GLASS_HIGH;
   if(t==='T1'){const lit=glass(k);F('windows',0,y+1.4,.02,w-.3,1.2,.05,g,lit);Fb('walls',0,y+.72,.05,w+.02,.16,.1,band);}
   else if(t==='T7'){add('windows',lot.x,y0+y+1.45,lot.frontZ+fz*(.02-.6),w+.04,1.0,1.2,g,glass(k));Fb('walls',0,y+.87,.05,w+.02,.16,.1,band);}
   else if(t==='T2'){const bal=lot.bays[k-1]?.[0]?.balcony&&w>=1.85,u=bal?-(w/2-.65):0,lit=glass(k);
    F('windows',u,y+1.45,.02,1.1,1.3,.05,g,lit);Fb('walls',0,y+.72,.05,w+.02,.16,.1,band);
    if(bal){F('windows',w/2-.45,y+1.15,.02,.6,1.9,.04,g);
     // Pencil balcony: a slab (core) and a railing of a top rail and three bars (detail).
     Fb('walls',w/2-.45,y+.05,.25,.75,.1,.5,band);fine(()=>{F('walls',w/2-.45,y+.95,.48,.75,.04,.04,'#7F8A88');for(let i=0;i<3;i++)F('walls',w/2-.45+(i-1)*.3,y+.5,.48,.025,.9,.025,'#7F8A88');for(const s of [-1,1])F('walls',w/2-.45+s*.36,y+.5,.25,.025,.9,.48,'#7F8A88');});}
    else if(lot.bayWindow?.floor===k)bay(k,y,g);}
   else if(t==='T3'){const bays=lot.bays[k-1]||[],n=Math.max(1,bays.length),pitch=w/n,lit=glass(k);
    F('windows',0,y+1.25,.02,w-.3,2.0,.04,g,lit);
    // Balcony (wave 5A): a slab; then either a solid balustrade (half the buildings) or a top rail with ≤ 6 bars,
    // partition boards between the units, AC units with fan grilles and, on laundry bays, a pole with washing.
    Fb('walls',0,y+.07,.45,w+.02,.14,.9,band);
    if(rr()<.5)Fb('walls',0,y+.55,.87,w+.02,.85,.06,band);
    else fine(()=>{F('walls',0,y+1.02,.88,w+.02,.05,.06,'#8C9694');const nb=Math.min(6,Math.max(2,Math.round(w/1)));for(let i=0;i<nb;i++)F('walls',-w/2+.05+(w-.1)*i/(nb-1),y+.56,.88,.03,.9,.03,'#8C9694');
     for(const s of [-1,1])F('walls',s*(w/2-.02),y+.56,.45,.04,.9,.88,'#8C9694');});
    fine(()=>{for(let j=1;j<n;j++)F('walls',-w/2+pitch*j,y+1.05,.45,.05,1.9,.86,tint(band,-.06));
     bays.forEach((b,j)=>{const cx=-w/2+pitch*(j+.5);if(b.ac)F('walls',cx+b.acSide*(pitch/2-.55),y+1.2,.17,.8,.6,.3,AC,{fac:F_FAN});
      if(b.laundry){F('walls',cx,y+1.9,.62,pitch-.35,.025,.025,'#B9B6AE');for(let i=0;i<2;i++)F('walls',cx+(i-.5)*.5,y+1.6,.62,.32,.5,.02,['#E8E4DA','#9DB4C8','#D9A5A0','#F2E6B8'][Math.floor(rr()*4)]);}});});}
   else if(t==='T4'){const lit=glass(k);F('windows',0,y+1.45,.02,Math.max(.9,w-.8),1.3,.05,g,lit);if(k>1||shop==='house'||shop==='pilotis')Fb('walls',0,y+.72,.05,w+.02,.16,.1,band);
    if(k===1&&r()<.5)Fb('walls',(r()<.5?-1:1)*w*.2,y+.45,.3,w*.5,.9,.6,band);
    if(lot.bayWindow?.floor===k)bay(k,y,g);}
  }
  // Bay window: a wall-coloured box protruding 0.35 with its own glass and a cap.
  function bay(k,y,g){const bw=lot.bayWindow.w;Fb('walls',0,y+1.35,.175,bw,1.55,.35,band,body);
   Fb('windows',0,y+1.4,.36,bw-.16,1.15,.03,g,st.dark?undefined:{light:bandLight(rr,home)});fine(()=>F('walls',0,y+2.16,.19,bw+.08,.06,.42,sill));}
  if(t==='T5'){const n=w>3.4?2:1;for(let i=0;i<n;i++){const u=(i-(n-1)/2)*w*.45;F('windows',u,GROUND+1.45,.02,1.1,1.1,.04,GLASS_LOW,glass(1));}}
  // Exposed side: blank, with a drain pipe, 0–2 small windows and, on T1/T2, a stack of AC units (brief 3.4.1).
  const expL=H-lot.leftH,expR=H-lot.rightH,s=expR===expL?(r()<.5?-1:1):expR>expL?1:-1,from=Math.max(s>0?lot.rightH:lot.leftH,0),sx=lot.x+s*w/2,top=t==='T5'?lot.eave:H;
  if(top-from>1.2)fine(()=>{
   if(top-from>GROUND+STOREY)add('walls',sx+s*.05,y0+from+(top-from)/2,backZ+fz*.25,.08,top-from,.08,'#8D918C');
   for(let i=0;i<lot.sideWindows;i++){const yy=from+.8+r()*Math.max(0,top-from-2.2);if(yy+.6<top)add('windows',sx+s*.02,y0+yy,lot.z+fz*(r()-.5)*D*.5,.04,.6,.6,GLASS_LOW,glass(0));}
   for(let i=0;i<lot.sideAC;i++){const yy=GROUND+STOREY*(floors-2-i)+1.1;if(yy>from+.3&&yy>.5)add('walls',sx+s*.16,y0+yy,lot.z+fz*(r()-.5)*D*.4,.3,.6,.8,AC,{fac:F_FAN_X});}
  });
  if(lot.stair)(far?fine:fn=>fn())(()=>{const u=0,c=r()<.5?'#6E7774':'#C9B79A',zc=backZ-fz*.5;
   for(let k=0;k<floors-1;k++){const ya=k?yk(k):0,yb=yk(k+1),dir=k%2?1:-1,run=Math.min(2.2,w-.4),L=Math.hypot(run,yb-ya),a=Math.atan2(yb-ya,run*dir);
    add('walls',lot.x+u,y0+(ya+yb)/2,zc,L,.12,.9,c,{rz:a});add('walls',lot.x+dir*(run/2+.45),y0+yb,zc,.9,.12,.9,c);fine(()=>add('walls',lot.x+u,y0+(ya+yb)/2+.9,zc-fz*.43,L,.05,.05,c,{rz:a}));}});
  // Roof clutter in corner slots.
  if(!st.bare)(far?fine:fn=>fn())(()=>{const ry=y0+(t==='T5'?lot.eave+.6:H+.1),fp=[];
   for(const it of lot.roofItems){
   const x=lot.x+it.u,z=lot.z+fz*it.v;fp.push([it.u,it.v,it.w/2+.3,it.d/2+.3]);
   if(it.kind==='bulkhead'){const side=it.u>0?-1:1;add('roofs',x,ry+.9,z,it.w,1.8,it.d,tint(wall,-.1),body);
    fine(()=>{add('roofs',x+side*Math.max(0,it.w/2-.5),ry+.8,z+fz*(it.d/2+.02),.7,1.6,.04,'#4F5658',{fac:F_DOOR});
     add('windows',x-side*(it.w/2+.015),ry+1.2,z,.03,.4,.45,GLASS_LOW);add('roofs',x,ry+1.83,z,it.w+.12,.07,it.d+.12,tint(wall,.12));});continue;}
   if(it.kind==='billboard'){for(const s2 of [-1,1])add('roofs',x+s2*(it.w/2-.3),ry+.5,z,.1,1,.4,it.color);add('roofs',x,ry+2.1,z,it.w,2.2,.12,it.color);add('roofs',x,ry+2.1,z+fz*.07,it.w-.2,2.0,.02,'#D9D4C7');continue;}
   const was=detail;detail=true;
   // Tanks stand on a four-leg frame; the round one is an octagon (two boxes).
   const legs=(hw,hd,h)=>{for(const a of [-1,1])add('roofs',x+a*hw,ry+h/2,z,.08,h,2*hd+.08,'#6E7774');};   // two steel frame sides
   if(it.kind==='tank'){legs(it.w/2-.08,it.d/2-.08,.55);add('roofs',x,ry+.55+.65,z,it.w,1.3,it.d,it.color,{fac:fc('concrete')});}
   else if(it.kind==='tankRound'){const s=it.w*.83;legs(s*.35,s*.35,.5);for(const a of [0,Math.PI/4])add('roofs',x,ry+.5+.6,z,s*.82,1.2,s*.82,it.color,{ry:a});}
   else if(it.kind==='condenser'){for(let i=0;i<it.n;i++)add('roofs',x-it.w/2+.35+i*.8,ry+.35,z,.7,.7,.7,it.color,{fac:F_FAN});}
   else if(it.kind==='cooling'){add('roofs',x,ry+.6,z,it.w,1.2,it.d,it.color,{fac:fc('metal')});add('roofs',x,ry+1.23,z,it.w*.55,.06,it.d*.55,'#4F5658');}
   else if(it.kind==='antenna'){add('roofs',x,ry+1,z,.04,2,.04,it.color);add('roofs',x,ry+1.6,z,.8,.03,.03,it.color);for(const e of [-.28,.12])add('roofs',x+e,ry+1.6,z,.025,.025,.42,it.color);add('roofs',x,ry+1.95,z,.03,.03,.32,it.color);}
   else if(it.kind==='garden'){const n=3+Math.floor(r()*4);for(let i=0;i<n;i++)add('roofs',x+(r()-.5)*it.w,ry+.2,z+(r()-.5)*it.d,.3+r()*.25,.35+r()*.3,.3+r()*.25,r()<.5?'#6F8F5E':'#8FA66B');}
   else if(it.kind!=='rail')add('roofs',x,ry+it.h/2,z,it.w,it.h,it.d,it.color);
   detail=was;
   }
   // Wave 5A: a satellite dish and a laundry pole line where they do not hit the items above (detail).
   const clear=(u,v,hw,hd)=>!fp.some(([a,b,c,d])=>Math.abs(u-a)<hw+c&&Math.abs(v-b)<hd+d);
   fine(()=>{
    if(lot.dish&&t!=='T5'&&clear(lot.dish.u,lot.dish.v,.35,.35)){const x=lot.x+lot.dish.u,z=lot.z+fz*lot.dish.v,a=lot.dish.ry;
     add('roofs',x,ry+.3,z,.06,.6,.06,'#9A9D98');add('roofs',x+Math.sin(a)*.08,ry+.72,z+Math.cos(a)*.08,.62,.62,.05,'#E8E6E0',{rx:-.55,ry:a,order:'YXZ'});}
    const lr=lot.laundryRoof,lv=-(D-.3)/2+.45;
    if(lr&&t!=='T5'&&clear(0,lv,lr.len/2,.2)){const z=lot.z+fz*lv;for(const s of [-1,1])add('roofs',lot.x+s*lr.len/2,ry+.6,z,.04,1.2,.04,'#B9B6AE');add('roofs',lot.x,ry+1.18,z,lr.len,.025,.025,'#B9B6AE');
     const nc=Math.max(2,Math.floor(lr.len/.6));for(let i=0;i<nc;i++)add('roofs',lot.x-lr.len/2+.3+i*(lr.len-.6)/Math.max(1,nc-1),ry+.9,z,.34,.5,.02,['#E8E4DA','#9DB4C8','#D9A5A0','#F2E6B8','#C7D3B4'][Math.floor(rr()*5)],{ry:(rr()-.5)*.3});}
   });});
 }
 function drawSpot(s){
  const fz=s.front==='+z'?1:-1,y0=BASE_Y,F=(key,u,y,v,w,h,d,c,o)=>add(key,s.x+u,y0+y,s.frontZ+fz*v,w,h,d,c,o),r=rng(s.id+':spot');
  const car=(u,v)=>{const c=CARS[Math.floor(r()*CARS.length)];F('walls',u,.45,v,.95,.55,1.9,c);F('walls',u,.9,v-.1,.85,.42,1.0,tint(c,-.12));};
  if(s.kind==='alley'){F('roofs',0,.01,-s.depth/2,s.width,.02,s.depth,'#8E8C84',{fac:fc('concrete')});if(s.pole)F('walls',0,3.5,-.35,.16,7,.16,'#B7B4AA');fine(()=>F('walls',s.acSide*(s.width/2-.17),2.2,-s.depth*.45,.3,.6,.8,AC,{fac:F_FAN_X}));}
  else if(s.kind==='vending'){F('roofs',0,.01,-s.depth/2,s.width,.02,s.depth,'#A6A398',{fac:fc('concrete')});const n=s.machines||2;for(let i=0;i<n;i++){const u=(i-(n-1)/2)*.95,c=['#EDEDE8','#C63B34','#2E6FB0'][Math.floor(r()*3)];F('walls',u,.875,-.4,.9,1.75,.65,c);F('windows',u,1.25,-.06,.7,.35,.04,'#CFE3EA',{light:'#EAF4FF'});}pools.push([s.x,s.frontZ+fz*.5,'#EAF4FF',1.6,.45]);F('walls',(n/2)*.95+.1,.4,-.4,.35,.8,.45,'#7D8B8E');}
  else if(s.kind==='parking'||s.kind==='coin-parking'){
   F('roofs',0,.02,-s.depth/2,s.width-.15,.04,s.depth-.15,'#646B6C',{fac:fc('asphalt')});
   const n=s.bays||1,bw=(s.width-.3)/n;
   for(let i=0;i<=n;i++){const u=-(s.width-.3)/2+i*bw;F('roofs',u,.045,-s.depth*.62,.08,.01,s.depth*.62,'#ECEAE2',{fac:F_PAINT});}
   for(const i of s.cars)if(i<n)car(-(s.width-.3)/2+bw*(i+.5),-s.depth*.6);
   if(s.kind==='coin-parking'){const su=s.width/2-.35;F('walls',su,.6,-.3,.35,1.2,.3,'#E3BE3C');F('walls',-su,1.3,-.25,.08,2.6,.08,'#B7B4AA');F('walls',-su,2.55,-.25,.6,.6,.06,'#D2463C');F('walls',-su,2.55,-.21,.4,.4,.02,'#F4F1EA');}
  }else if(s.kind==='park'){
   // Pocket park (third ring; and Shiba's tower park): lawn, gravel path, 2–3 trees, a bench and a low fence along the street.
   F('roofs',0,.03,-s.depth/2,s.width-.3,.06,s.depth-.3,'#7E9A63');F('roofs',0,.065,-s.depth*.45,1.1,.02,s.depth*.85,'#C9C3B4',{fac:fc('membrane')});
   fine(()=>{for(const u of [-1,1])F('walls',u*(s.width/2-.2),.35,-.1,s.width/2-.9,.5,.08,'#8C8F86');});
   // Trees are drawn by city-green.js (real species with wind); the park keeps its lawn, path, fence and bench.
   F('walls',(r()<.5?-1:1)*1.4,.3,-.9,1.2,.12,.4,'#9A7A60',{fac:fc('wood')});
  }else if(s.kind==='shrine'){
   F('roofs',0,.02,-s.depth/2,s.width-.3,.04,s.depth-.3,'#C9C3B4',{fac:fc('membrane')});F('roofs',0,.05,-s.depth*.45,.9,.02,s.depth*.8,'#9C998F',{fac:fc('pavers')});
   for(const u of [-.9,.9])F('walls',u,1.6,-.6,.22,3.2,.22,'#C8452D');F('walls',0,3.25,-.6,2.7,.22,.32,'#C8452D');F('walls',0,3.4,-.6,2.9,.1,.36,'#2B2B2B');F('walls',0,2.65,-.6,2.1,.14,.18,'#C8452D');
   // Hokora: a stone base, a wooden body and (wave 5A) a gable roof of two prisms with eaves (it was a dark diamond box
   // whose lower half hung below the eaves: from the street side it read as a black wedge).
   const hz=s.frontZ-fz*(s.depth-1);F('walls',0,.3,-s.depth+1,1.2,.6,1.0,'#9C998F',{fac:fc('concrete')});F('walls',0,1.05,-s.depth+1,.9,.9,.8,'#7A5A3C',{fac:fc('wood')});
   for(const sd of [-1,1])add('prisms',s.x,y0+1.5+.21,hz+sd*.3,1.3,.46,.6,'#6B7A7E',{ry:sd>0?0:Math.PI,fac:fc('kawara',{noEdge:true})});
   // The shrine grove comes from city-green.js.
  }
 }
 // Construction phases at the new storey scale (3.0 ground + 2.5 per floor).
 function drawSite(lot,b){
  const fz=lot.front==='+z'?1:-1,w=lot.width,D=lot.depth,y0=BASE_Y,F=(key,u,y,v,ww,h,dd,c,o)=>add(key,lot.x+u,y0+y,lot.frontZ+fz*v,ww,h,dd,c,o),back=-D;
  if(b.phase==='thinking'){F('roofs',0,.02,-D/2,w,.04,D,'#B9AE95');for(const [u,v,ww,dd] of [[0,0,w,.08],[0,back,w,.08],[-w/2,-D/2,.08,D],[w/2,-D/2,.08,D]])F('walls',u,1,v,ww,2,dd,'#E9E4D8');F('walls',0,1.9,.05,w,.2,.04,'#f0a35e');
   F('walls',w/2-.6,1.8,.3,.12,3.6,.12,'#46525a');F('windows',w/2-.6,3.3,.36,1.4,.9,.06,'#fb752b',{light:'#fb752b',glow:.6});return 2;}
  const full=lot.height,h=builtHeight(lot,b),grey=b.phase==='stopped';
  F('walls',0,h/2,-D/2,w-.4,h,D-.4,grey?'#8f9393':'#bdb9ad',{fac:fc('concrete')});
  for(let y=1;y<h+1.2;y+=STOREY)for(const v of [.25,back-.25])F('walls',0,y,v,w+.3,.07,.07,'#e9a84f');
  for(const u of [-w/2-.15,w/2+.15])for(const v of [.25,back-.25])F('walls',u,(h+1.2)/2,v,.08,h+1.2,.08,'#e9a84f');
  if(!grey){const mx=-w/2+.4,mz=back-1.2,top=full+4;F('walls',mx,top/2,mz,.4,top,.4,'#f2b84b');F('walls',mx+2.6,top,mz,8,.3,.3,'#f2b84b');F('walls',mx-1.6,top-.4,mz,1.4,.8,.8,'#8E9290');F('walls',mx+5,top-1.6,mz,.04,3,.04,'#46525a');}
  return h;
 }
 // FootTown (wave 5A): a 4-storey light-grey podium over the Shiba street on four pilotis; the road and the sidewalk
 // lines pass under it, the tower legs come down through its roof corners.
 function footTown(){const f=TOWER.footTown,x=tower.x,z=tower.z,h=f.floors*f.storey+f.parapet,yb=BASE_Y+f.y0;
  for(const a of [-1,1])for(const b of [-1,1])add('walls',x+a*(f.half-.2),BASE_Y+f.y0/2,z+b*(f.half-.2),.36,f.y0,.36,tint(f.color,-.12),{fac:fc('concrete')});
  add('walls',x,yb+h/2,z,2*f.half,h,2*f.half,f.color,{fac:fc('concrete')});add('walls',x,yb+.1,z,2*f.half+.12,.2,2*f.half+.12,tint(f.color,.15));
  add('roofs',x,yb+h+.015,z,2*f.half-.3,.03,2*f.half-.3,'#8B8F87',{fac:F_ROOF});
  for(let k=0;k<f.floors;k++){const y=yb+k*f.storey+1.25;for(const s of [-1,1]){
   add('windows',x,y,z+s*(f.half+.02),2*f.half-.4,1.1,.05,GLASS_LOW,{light:'#FFE6B8',glow:.8});add('windows',x+s*(f.half+.02),y,z,.05,1.1,2*f.half-.4,GLASS_LOW,{light:'#FFE6B8',glow:.8});}}
 }

 let renderGroups=[],style,life,currentNight=false,pools=[],showDetail=true;
 const applyPools=()=>{if(!life?.addLightPool)return;style?.bindLife?.(life);life.clearLightPools('konbini');for(const [x,z,c,r,s] of pools)life.addLightPool(x,z,c,r,{group:'konbini',strength:s});};const heights=new Map(),counts={};
 const picks=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({visible:false}),cityPlots.length);
 picks.userData.cityPlot=true;root.add(picks);interactive.push(picks);
 const setPick=(i,x,z,w,h,d)=>{dummy.position.set(x,BASE_Y+h/2,z);dummy.rotation.set(0,0,0);dummy.scale.set(w,h,d);dummy.updateMatrix();picks.setMatrixAt(i,dummy.matrix);};
 function redraw(next){buildings=next;for(const g of renderGroups){root.remove(g);g.dispose();g.geometry.dispose();}renderGroups=[];
  batches=Object.fromEntries(KEYS.map(k=>[k,[]]));details=Object.fromEntries(KEYS.map(k=>[k,[]]));heights.clear();pools=[];ground();footTown();
  const layout=cityLayout(buildings),userPlots=new Set(layout.lots.filter(l=>l.user).map(l=>l.plotId));
  for(const lot of layout.lots){
   const b=lot.user?buildings.find(x=>x.plotId===lot.plotId):null;
   if(b&&['thinking','scaffold','stopped'].includes(b.phase)){heights.set(lot.plotId,drawSite(lot,b));continue;}
   drawLot(lot,{dark:b?.phase==='review'});
   if(b?.phase==='review'){const fz=lot.front==='+z'?1:-1;add('windows',lot.x,BASE_Y+lot.height/2,lot.frontZ+fz*.08,lot.width+.1,lot.height,.04,'#fb8a45');}
   if(b?.phase==='open'){const fz=lot.front==='+z'?1:-1;add('windows',lot.x,BASE_Y+lot.height+1.3,lot.z+fz*.4,Math.min(3.6,lot.width-.2),1.1,.25,'#ffcf6e',{light:'#ffcf6e'});}
   if(lot.plotId){if(lot.user)heights.set(lot.plotId,lot.height);else if(!userPlots.has(lot.plotId))heights.set(lot.plotId,Math.max(heights.get(lot.plotId)||0,lot.height));}
  }
  for(const s of layout.spots)drawSpot(s);
  cityPlots.forEach((p,i)=>{const user=layout.lots.find(l=>l.user&&l.plotId===p.id);
   if(user)setPick(i,user.x,user.z,user.width+.1,Math.max(1.5,heights.get(p.id)),user.depth+.1);
   else if(p.vacant){heights.set(p.id,.5);setPick(i,p.x,p.z,5.8,1,5.4);}
   else setPick(i,p.x,p.z,5.8,heights.get(p.id)||1,5.4);});
  picks.instanceMatrix.needsUpdate=true;picks.computeBoundingSphere();
  for(const key of KEYS){const core=batches[key].length,all=core+details[key].length;counts[key]=all;counts[key+'Detail']=all-core;
   const mesh=batch(batches[key].concat(details[key]),root,MATS[key],key==='windows',GEOS[key]||geometry);mesh.userData.lod={core,all};mesh.count=showDetail?all:core;renderGroups.push(mesh);}
  if(style){style.dispose();style=addTokyoStyle(root,buildings);style.setNight(currentNight);}
  applyPools();
 }
 redraw(buildings);

 // ---------- Tokyo Tower (wave 5A, tokyo-tower.js): ribbon lattice in horizontal orange/white bands, decks, mast ----------
 const plan=towerPlan(tower.x,tower.z);
 const lattice=batch(plan.boxes,root,towerMat,true);
 const ribbons=towerRibbons(plan.members,ribbonMat);ribbons.raycast=()=>{};root.add(ribbons);
 const pickW=2*TOWER.feet+.8,towerPick=new THREE.Mesh(new THREE.BoxGeometry(pickW,TOWER.height,pickW),new THREE.MeshBasicMaterial({visible:false}));towerPick.position.set(tower.x,TOWER.height/2,tower.z);towerPick.userData.place=tower;root.add(towerPick);interactive.push(towerPick);
 style=addTokyoStyle(root,buildings);life=addCityLife(root);applyPools();const crowd=addCityCrowd(root,options),traffic=addCityTraffic(root);
 return {redraw,crowd,lattice,ribbons,
  // Quality hook (quality.js via main.js): forwarded to city-life.js (steam, critters, blimp).
  setQuality(q){life.setQuality?.(q);},get life(){return life;},
  heightOf:plotId=>plotId==='tower'?TOWER.height:heights.get(plotId)??null,
  stats:()=>({...counts,tower:plan.boxes.length,towerMembers:plan.members.length,footTown:footTownTop(),drawCalls:renderGroups.length+2,
   instances:renderGroups.reduce((n,g)=>n+g.count,0)+plan.boxes.length,detail:showDetail}),
  // Overview LOD (main.js, camera.zoom < 0.3): hide AC units, small roof items, side pipes and road marks; fade the
  // facade atlas (facades.js facadeDetail, shared with every wallMaterial).
  setDetail(on){on=!!on;facadeDetail.value=on?1:0;life?.setDetail?.(on);if(on===showDetail)return;showDetail=on;for(const g of renderGroups)g.count=on?g.userData.lod.all:g.userData.lod.core;},
  update(seconds){life.update(seconds);crowd.update(seconds,options.gpu);traffic.update(seconds);},
  setNight(value){currentNight=value;for(const m of [windowMat,towerMat,ribbonMat])m.userData.night.value=value?1:0;
   for(const m of [wallMat,windowMat,towerMat,ribbonMat])m.color.copy(value?NIGHT_WALL:DAY);groundMat.color.copy(value?NIGHT_GROUND:DAY);
   style.setNight(value);life.setNight(value);},
  select(hit){if(hit.object.userData.cityPlot&&hit.instanceId!==undefined){showPlace(plotView(cityPlots[hit.instanceId],buildings));return true;}return false;}};
}
