import * as THREE from 'three';
import * as T from './toon.js';
import {addCityLife} from './city-life.js';
import {addCityCrowd} from './city-crowd.js';
import {addCityTraffic} from './city-traffic.js';
import {addTokyoStyle} from './tokyo-style.js';
import {cityPlots,districts,tower,plotView} from './city-state.js';
import {cityLayout,rng,BASE_Y,GROUND,STOREY,sidewalkSides,isCommercial} from './lots.js';
const wallMaterial=params=>(T.wallMaterial||T.toon)(params);
// Night multipliers are plain 0–1 factors (brief 3.9: walls ×#6F7D99, ground ×#55617A), not sRGB colours.
const factor=hex=>new THREE.Color().setHex(parseInt(hex.slice(1),16),THREE.LinearSRGBColorSpace);
const NIGHT_WALL=T.nightColor?T.nightColor('walls'):factor('#6F7D99'),NIGHT_GROUND=T.nightColor?T.nightColor('ground'):factor('#55617A'),DAY=new THREE.Color(1,1,1);
const WHITE=new THREE.Color('#ffffff'),BLACK=new THREE.Color('#000000');
const tint=(hex,f)=>{const c=new THREE.Color(hex);return f>0?c.lerp(WHITE,f):c.lerp(BLACK,-f);};
const GLASS_LOW='#3D525B',GLASS_HIGH='#5E7881',AC='#E5E1D6';
const BOULEVARD_X=[-43.5,-14.5,14.5,43.5],ROWS=[...new Set(districts.map(d=>d.z))];
const CARS=['#E8E6E0','#2F3437','#9AA3A8','#1F2A44','#B33A32','#D9D3C3'];
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

export function createCity(scene,interactive,showPlace,buildings,options={}){
 const root=new THREE.Group();scene.add(root);
 const geometry=new THREE.BoxGeometry(1,1,1);
 const wallMat=wallMaterial({roughness:1,ground:BASE_Y}),groundMat=T.toon({roughness:1});
 const windowMat=nightLit(T.toon({roughness:.7})),towerMat=nightLit(T.toon({roughness:.9}));
 const MATS={roads:groundMat,marks:groundMat,walls:wallMat,windows:windowMat,roofs:wallMat};
 // Two lists per batch: core instances first, then "detail" ones (AC units, small roof items, side pipes, all road
 // marks). setDetail(false) at overview zoom just lowers each InstancedMesh's count to its core: no extra draw calls.
 let batches={},details={},detail=false;
 const add=(key,x,y,z,w,h,d,color,o)=>(detail||key==='marks'?details:batches)[key].push(o?{x,y,z,w,h,d,color,...o}:{x,y,z,w,h,d,color});
 const fine=fn=>{detail=true;try{fn();}finally{detail=false;}};
 const dummy=new THREE.Object3D(),col=new THREE.Color();
 function batch(items,parent,material,lit){
  const geo=lit?geometry.clone():geometry,mesh=new THREE.InstancedMesh(geo,material,Math.max(1,items.length)),light=lit?new Float32Array(Math.max(1,items.length)*3):null;
  mesh.count=items.length;
  items.forEach((v,i)=>{
   if(v.m)mesh.setMatrixAt(i,v.m);else{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(v.rx||0,v.ry||0,v.rz||0);dummy.scale.set(v.w,v.h,v.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
   mesh.setColorAt(i,col.set(v.color));
   if(light&&v.light){col.set(v.light).multiplyScalar((v.glow??1)*.55);light[i*3]=col.r;light[i*3+1]=col.g;light[i*3+2]=col.b;}
  });
  if(lit)geo.setAttribute('nightLight',new THREE.InstancedBufferAttribute(light,3));
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.receiveShadow=true;mesh.castShadow=material===wallMat;mesh.computeBoundingSphere();parent.add(mesh);return mesh;
 }

 // ---------- Ground (brief 3.7, plan item 8) ----------
 function ground(){
  for(const d of districts){
   const walks=sidewalkSides(d.id),commercial=isCommercial(d.id),half=s=>walks.includes(s)?2.25:3.25;
   add('roads',d.x,.03,d.z,27.8,.18,27.8,'#A9A79D');
   const z0=d.z-half(-1),z1=d.z+half(1);add('roads',d.x,.155,(z0+z1)/2,28,.07,z1-z0,'#7A7F7C');
   for(const s of [-1,1]){
    if(walks.includes(s)){add('roads',d.x,.18,d.z+s*2.775,28,.12,1.05,'#B4B1A7');add('roads',d.x,.185,d.z+s*2.31,28,.13,.12,'#CFCBC0');
     if(commercial)add('marks',d.x,.245,d.z+s*2.55,28,.012,.3,'#E2B53A');}
    add('marks',d.x,.193,d.z+s*(half(s)-.4),27.6,.008,.12,'#E6E4DC');
   }
  }
  // Japanese zebras: bars only, 0.45 wide with 0.45 gaps; a ◇ six units before each approach.
  const zebra=(cx,d,commercial)=>{for(let i=0;i<4;i++)add('marks',cx+(i-1.5)*.9,.196,d.z,.45,.01,4.4,'#ECEAE2');
   if(commercial)for(const s of [-1,1])for(const dx of [-1.6,1.6])add('marks',cx+dx,.247,d.z+s*2.55,.6,.012,.6,'#E2B53A');
   for(const dir of [-1,1]){const x=cx-dir*6,z=d.z+dir*.75;add('marks',0,0,0,0,0,0,'#ECEAE2',{m:shaped(x,.197,z,[.62,.01,.62],[0,Math.PI/4,0],[2.4,1,1])});add('marks',0,0,0,0,0,0,'#7A7F7C',{m:shaped(x,.199,z,[.42,.01,.42],[0,Math.PI/4,0],[2.4,1,1])});}};
  for(const d of districts){const c=isCommercial(d.id);
   if([-29,29].includes(d.x)&&[-28,2,32].includes(d.z))zebra(d.x,d,c);
   for(const bx of BOULEVARD_X)if(Math.abs(bx-d.x)<15)zebra(bx+Math.sign(d.x-bx)*3.2,d,c);}
  for(const x of BOULEVARD_X){add('roads',x,.17,2,2.6,.05,147,'#646B6C');for(let z=-66;z<=70;z+=6)if(!ROWS.some(r=>Math.abs(z-r)<3.6))add('marks',x,.198,z,.08,.01,.8,'#E6E4DC');
   for(let z=-64;z<=70;z+=12){add('marks',x+.6,.199,z,.55,.01,.55,'#4B5153',{ry:.39});}}
 }

 // ---------- Buildings ----------
 function drawLot(lot,st={}){
  const fz=lot.front==='+z'?1:-1,w=lot.width,D=lot.depth,H=lot.height,t=lot.type,y0=BASE_Y,backZ=lot.frontZ-fz*D;
  const F=(key,u,y,v,ww,h,dd,color,o)=>add(key,lot.x+u,y0+y,lot.frontZ+fz*v,ww,h,dd,color,o);
  const r=rng(lot.id+':draw'),home=['T2','T3','T4','T5'].includes(t);
  const glass=(k,o={})=>({...o,light:st.dark?null:bandLight(r,home)});
  const wall=lot.wall,band=tint(wall,.14),sill=tint(wall,.26),floors=lot.floors;
  const yk=k=>GROUND+STOREY*(k-1);
  // Body, then coping and a dark roof inside it (no overhang slab, no centred cube).
  if(t==='T5'){
   const eave=lot.eave;add('walls',lot.x,y0+eave/2,lot.z,w,eave,D,wall);
   const along=w>=D,span=(along?D:w)+.8,len=(along?w:D)+.8,s=span/Math.SQRT2,k=2/span;
   add('roofs',0,0,0,0,0,0,lot.roof,{m:along?shaped(lot.x,y0+eave,lot.z,[len,s,s],[Math.PI/4,0,0],[1,k,1]):shaped(lot.x,y0+eave,lot.z,[s,s,len],[0,0,Math.PI/4],[1,k,1])});
   F('walls',0,.5,lot.setback-.08,w+.6,1,.15,'#6B645D');
  }else{
   if(lot.shop==='pilotis'){add('walls',lot.x,y0+GROUND+(H-GROUND)/2,lot.z,w,H-GROUND,D,wall);add('walls',lot.x,y0+GROUND/2,lot.z-fz*D*.3,w-.1,GROUND,D*.4,tint(wall,-.25));
    for(const s of [-1,1])F('walls',s*(w/2-.15),GROUND/2,-.15,.3,GROUND,.3,band);
    const c=CARS[Math.floor(r()*CARS.length)];F('walls',0,.45,-1.4,.95,.55,1.9,c);F('walls',0,.92,-1.5,.85,.42,1.05,tint(c,-.15));}
   else add('walls',lot.x,y0+H/2,lot.z,w,H,D,wall);
   // No coping box (budget): the dark roof sits inset, so the wall's own top edge reads as the coping rim.
   add('roofs',lot.x,y0+H+.015,lot.z,w-.24,.03,D-.24,lot.roof);
  }
  // Ground floor (3.0) by shopfront variant.
  const shop=lot.shop;
  if(shop==='glazed'){F('windows',0,1.4,.02,w-.5,2.5,.06,GLASS_LOW,st.dark||r()<.2?undefined:{light:'#FFE6B8',glow:.85});}
  else if(shop==='shutter'){F('walls',0,1.3,.03,w-.5,2.5,.06,'#9EA3A2');}
  else if(shop==='noren'){F('walls',0,1.4,.02,w-.5,2.6,.05,'#4A3A2E');const u=(r()-.5)*(w-1.6);F('windows',u,1.2,.05,.9,1.9,.03,GLASS_LOW,st.dark?undefined:{light:'#FFC27A',glow:.8});F('walls',u,2.2,.12,1.0,.7,.03,r()<.5?'#2E3A55':'#8C2F2A');}
  else if(shop==='entrance'||shop==='house'){const side=r()<.5?-1:1,du=side*Math.max(0,w/2-.65);F('windows',du,1.1,.02,.9,2.0,.05,shop==='house'?'#5A4636':GLASS_LOW,!st.dark&&shop!=='house'&&r()<.6?{light:'#FFE6B8',glow:.7}:undefined);
   if(shop==='entrance')F('walls',-du*.2-side*.4,1.0,.03,Math.min(1.2,w-1.4),1.1,.06,'#8E9290');
   else if(w>2){F('windows',-side*Math.max(0,w/2-1),1.75,.02,1.0,1.0,.04,GLASS_LOW,glass(0));F('walls',-side*Math.max(0,w/2-1),1.22,.06,1.15,.06,.12,sill);}}
  else if(shop==='konbini'){F('windows',0,1.35,.02,w*.85,2.4,.06,GLASS_HIGH,{light:'#EAF4FF'});lot.stripe.forEach((c,i)=>F('walls',0,3.06+i*.117,.05,w+.02,.117,.1,c));for(const du of [.35,.8])F('walls',w/2-du,.45,.2,.38,.9,.38,'#4B6A8A');pools.push([lot.x,lot.frontZ+fz*.9,'#EAF4FF',Math.min(3.2,w*.6),.6]);}
  if(lot.awning&&t!=='T4')F('walls',0,lot.awning.y,lot.awning.depth/2,w-.2,.2,lot.awning.depth,lot.awning.color,{rx:fz*.17});
  if(t==='T4'&&shop!=='house'&&shop!=='pilotis')F('walls',0,2.95,.3,w,.12,.6,'#5B6466',{rx:fz*.17});
  // Upper floors: one rhythm per facade (brief 3.4.4).
  for(let k=1;k<floors&&t!=='T6';k++){
   const y=yk(k),g=k<=2?GLASS_LOW:GLASS_HIGH;
   if(t==='T1'){const lit=glass(k);F('windows',0,y+1.4,.02,w-.3,1.2,.05,g,lit);F('walls',0,y+.72,.05,w+.02,.16,.1,band);}
   else if(t==='T7'){add('windows',lot.x,y0+y+1.45,lot.frontZ+fz*(.02-.6),w+.04,1.0,1.2,g,glass(k));F('walls',0,y+.87,.05,w+.02,.16,.1,band);}
   else if(t==='T2'){const bal=lot.bays[k-1]?.[0]?.balcony&&w>=1.85,u=bal?-(w/2-.65):0,lit=glass(k);
    F('windows',u,y+1.45,.02,1.1,1.3,.05,g,lit);F('walls',0,y+.72,.05,w+.02,.16,.1,band);
    if(bal){F('windows',w/2-.45,y+1.15,.02,.6,1.9,.04,g);F('walls',w/2-.45,y+.45,.25,.75,.9,.5,band);}}
   else if(t==='T3'){const bays=lot.bays[k-1]||[],n=Math.max(1,bays.length),pitch=w/n,lit=glass(k);
    F('windows',0,y+1.25,.02,w-.3,2.0,.04,g,lit);F('walls',0,y+.45,.45,w+.02,1.0,.9,band);
    fine(()=>bays.forEach((b,j)=>{if(b.ac)F('walls',-w/2+pitch*(j+.5)+b.acSide*(pitch/2-.55),y+1.2,.17,.8,.6,.3,AC);}));}
   else if(t==='T4'){const lit=glass(k);F('windows',0,y+1.45,.02,Math.max(.9,w-.8),1.3,.05,g,lit);if(k>1||shop==='house'||shop==='pilotis')F('walls',0,y+.72,.05,w+.02,.16,.1,band);
    if(k===1&&r()<.5)F('walls',(r()<.5?-1:1)*w*.2,y+.45,.3,w*.5,.9,.6,band);}
  }
  if(t==='T5'){const n=w>3.4?2:1;for(let i=0;i<n;i++){const u=(i-(n-1)/2)*w*.45;F('windows',u,GROUND+1.45,.02,1.1,1.1,.04,GLASS_LOW,glass(1));}}
  // Exposed side: blank, with a drain pipe, 0–2 small windows and, on T1/T2, a stack of AC units (brief 3.4.1).
  const expL=H-lot.leftH,expR=H-lot.rightH,s=expR===expL?(r()<.5?-1:1):expR>expL?1:-1,from=Math.max(s>0?lot.rightH:lot.leftH,0),sx=lot.x+s*w/2,top=t==='T5'?lot.eave:H;
  if(top-from>1.2)fine(()=>{
   if(top-from>GROUND+STOREY)add('walls',sx+s*.05,y0+from+(top-from)/2,backZ+fz*.25,.08,top-from,.08,'#8D918C');
   for(let i=0;i<lot.sideWindows;i++){const yy=from+.8+r()*Math.max(0,top-from-2.2);if(yy+.6<top)add('windows',sx+s*.02,y0+yy,lot.z+fz*(r()-.5)*D*.5,.04,.6,.6,GLASS_LOW,glass(0));}
   for(let i=0;i<lot.sideAC;i++){const yy=GROUND+STOREY*(floors-2-i)+1.1;if(yy>from+.3&&yy>.5)add('walls',sx+s*.16,y0+yy,lot.z+fz*(r()-.5)*D*.4,.3,.6,.8,AC);}
  });
  if(lot.stair){const u=0,c=r()<.5?'#6E7774':'#C9B79A',zc=backZ-fz*.5;
   for(let k=0;k<floors-1;k++){const ya=k?yk(k):0,yb=yk(k+1),dir=k%2?1:-1,run=Math.min(2.2,w-.4),L=Math.hypot(run,yb-ya),a=Math.atan2(yb-ya,run*dir);
    add('walls',lot.x+u,y0+(ya+yb)/2,zc,L,.12,.9,c,{rz:a});add('walls',lot.x+dir*(run/2+.45),y0+yb,zc,.9,.12,.9,c);fine(()=>add('walls',lot.x+u,y0+(ya+yb)/2+.9,zc-fz*.43,L,.05,.05,c,{rz:a}));}}
  // Roof clutter in corner slots.
  if(!st.bare)for(const it of lot.roofItems){
   const x=lot.x+it.u,z=lot.z+fz*it.v,ry=y0+(t==='T5'?lot.eave+.6:H+.1);
   if(it.kind==='bulkhead'){add('roofs',x,ry+.9,z,it.w,1.8,it.d,tint(wall,-.1));fine(()=>add('roofs',x+(it.u>0?-1:1)*Math.max(0,it.w/2-.5),ry+.8,z+fz*(it.d/2+.02),.7,1.6,.04,'#4F5658'));continue;}
   if(it.kind==='billboard'){for(const s2 of [-1,1])add('roofs',x+s2*(it.w/2-.3),ry+.5,z,.1,1,.4,it.color);add('roofs',x,ry+2.1,z,it.w,2.2,.12,it.color);add('roofs',x,ry+2.1,z+fz*.07,it.w-.2,2.0,.02,'#D9D4C7');continue;}
   detail=true;
   if(it.kind==='tank')add('roofs',x,ry+.75,z,it.w,1.3,it.d,it.color);
   else if(it.kind==='tankRound')add('roofs',x,ry+.6,z,it.w*.83,1.2,it.w*.83,it.color,{ry:Math.PI/4});
   else if(it.kind==='condenser'){for(let i=0;i<it.n;i++)add('roofs',x-it.w/2+.35+i*.8,ry+.35,z,.7,.7,.7,it.color);}
   else if(it.kind==='cooling'){add('roofs',x,ry+.6,z,it.w,1.2,it.d,it.color);add('roofs',x,ry+1.23,z,it.w*.55,.06,it.d*.55,'#4F5658');}
   else if(it.kind==='antenna'){add('roofs',x,ry+1,z,.04,2,.04,it.color);add('roofs',x,ry+1.6,z,.8,.03,.03,it.color);}
   else if(it.kind==='garden'){const n=3+Math.floor(r()*4);for(let i=0;i<n;i++)add('roofs',x+(r()-.5)*it.w,ry+.2,z+(r()-.5)*it.d,.3+r()*.25,.35+r()*.3,.3+r()*.25,r()<.5?'#6F8F5E':'#8FA66B');}
   else if(it.kind!=='rail')add('roofs',x,ry+it.h/2,z,it.w,it.h,it.d,it.color);
   detail=false;
  }
 }
 function drawSpot(s){
  const fz=s.front==='+z'?1:-1,y0=BASE_Y,F=(key,u,y,v,w,h,d,c,o)=>add(key,s.x+u,y0+y,s.frontZ+fz*v,w,h,d,c,o),r=rng(s.id+':spot');
  const car=(u,v)=>{const c=CARS[Math.floor(r()*CARS.length)];F('walls',u,.45,v,.95,.55,1.9,c);F('walls',u,.9,v-.1,.85,.42,1.0,tint(c,-.12));};
  if(s.kind==='alley'){F('roofs',0,.01,-s.depth/2,s.width,.02,s.depth,'#8E8C84');if(s.pole)F('walls',0,3.5,-.35,.16,7,.16,'#B7B4AA');fine(()=>F('walls',s.acSide*(s.width/2-.17),2.2,-s.depth*.45,.3,.6,.8,AC));}
  else if(s.kind==='vending'){const n=s.machines||2;for(let i=0;i<n;i++){const u=(i-(n-1)/2)*.95,c=['#EDEDE8','#C63B34','#2E6FB0'][Math.floor(r()*3)];F('walls',u,.875,-.4,.9,1.75,.65,c);F('windows',u,1.25,-.06,.7,.35,.04,'#CFE3EA',{light:'#EAF4FF'});}pools.push([s.x,s.frontZ+fz*.5,'#EAF4FF',1.6,.45]);F('walls',(n/2)*.95+.1,.4,-.4,.35,.8,.45,'#7D8B8E');}
  else if(s.kind==='parking'||s.kind==='coin-parking'){
   F('roofs',0,.02,-s.depth/2,s.width-.15,.04,s.depth-.15,'#646B6C');
   const n=s.bays||1,bw=(s.width-.3)/n;
   for(let i=0;i<=n;i++){const u=-(s.width-.3)/2+i*bw;F('roofs',u,.045,-s.depth*.62,.08,.01,s.depth*.62,'#ECEAE2');}
   for(const i of s.cars)if(i<n)car(-(s.width-.3)/2+bw*(i+.5),-s.depth*.6);
   if(s.kind==='coin-parking'){const su=s.width/2-.35;F('walls',su,.6,-.3,.35,1.2,.3,'#E3BE3C');F('walls',-su,1.3,-.25,.08,2.6,.08,'#B7B4AA');F('walls',-su,2.55,-.25,.6,.6,.06,'#D2463C');F('walls',-su,2.55,-.21,.4,.4,.02,'#F4F1EA');}
  }else if(s.kind==='shrine'){
   F('roofs',0,.02,-s.depth/2,s.width-.3,.04,s.depth-.3,'#C9C3B4');F('roofs',0,.05,-s.depth*.45,.9,.02,s.depth*.8,'#9C998F');
   for(const u of [-.9,.9])F('walls',u,1.6,-.6,.22,3.2,.22,'#C8452D');F('walls',0,3.25,-.6,2.7,.22,.32,'#C8452D');F('walls',0,3.4,-.6,2.9,.1,.36,'#2B2B2B');F('walls',0,2.65,-.6,2.1,.14,.18,'#C8452D');
   F('walls',0,.3,-s.depth+1,1.2,.6,1.0,'#9C998F');F('walls',0,1.05,-s.depth+1,.9,.9,.8,'#7A5A3C');add('roofs',0,0,0,0,0,0,'#4E5864',{m:shaped(s.x,y0+1.5,s.frontZ-fz*(s.depth-1),[1.3,.9,.9],[Math.PI/4,0,0],[1,.8,1])});
   const tu=(r()<.5?-1:1)*(s.width/2-1.2);F('walls',tu,1.2,-s.depth*.6,.3,2.4,.3,'#6B5443');F('walls',tu,3.0,-s.depth*.6,2.4,1.6,2.4,'#6F8F5E');F('walls',tu,4.2,-s.depth*.6,1.7,1.2,1.7,'#8FA66B',{ry:Math.PI/4});
  }
 }
 // Construction phases at the new storey scale (3.0 ground + 2.5 per floor).
 function drawSite(lot,b){
  const fz=lot.front==='+z'?1:-1,w=lot.width,D=lot.depth,y0=BASE_Y,F=(key,u,y,v,ww,h,dd,c,o)=>add(key,lot.x+u,y0+y,lot.frontZ+fz*v,ww,h,dd,c,o),back=-D;
  if(b.phase==='thinking'){F('roofs',0,.02,-D/2,w,.04,D,'#B9AE95');for(const [u,v,ww,dd] of [[0,0,w,.08],[0,back,w,.08],[-w/2,-D/2,.08,D],[w/2,-D/2,.08,D]])F('walls',u,1,v,ww,2,dd,'#E9E4D8');F('walls',0,1.9,.05,w,.2,.04,'#f0a35e');
   F('walls',w/2-.6,1.8,.3,.12,3.6,.12,'#46525a');F('windows',w/2-.6,3.3,.36,1.4,.9,.06,'#fb752b',{light:'#fb752b',glow:.6});return 2;}
  const full=lot.height,h=Math.max(1.2,full*Math.min(1,b.progress/.65)),grey=b.phase==='stopped';
  F('walls',0,h/2,-D/2,w-.4,h,D-.4,grey?'#8f9393':'#bdb9ad');
  for(let y=1;y<h+1.2;y+=STOREY)for(const v of [.25,back-.25])F('walls',0,y,v,w+.3,.07,.07,'#e9a84f');
  for(const u of [-w/2-.15,w/2+.15])for(const v of [.25,back-.25])F('walls',u,(h+1.2)/2,v,.08,h+1.2,.08,'#e9a84f');
  if(!grey){const mx=-w/2+.4,mz=back-1.2,top=full+4;F('walls',mx,top/2,mz,.4,top,.4,'#f2b84b');F('walls',mx+2.6,top,mz,8,.3,.3,'#f2b84b');F('walls',mx-1.6,top-.4,mz,1.4,.8,.8,'#8E9290');F('walls',mx+5,top-1.6,mz,.04,3,.04,'#46525a');}
  return h;
 }

 let renderGroups=[],style,life,currentNight=false,pools=[],showDetail=true;
 const applyPools=()=>{if(!life?.addLightPool)return;style?.bindLife?.(life);life.clearLightPools('konbini');for(const [x,z,c,r,s] of pools)life.addLightPool(x,z,c,r,{group:'konbini',strength:s});};const heights=new Map(),counts={};
 const picks=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({visible:false}),cityPlots.length);
 picks.userData.cityPlot=true;root.add(picks);interactive.push(picks);
 const setPick=(i,x,z,w,h,d)=>{dummy.position.set(x,BASE_Y+h/2,z);dummy.rotation.set(0,0,0);dummy.scale.set(w,h,d);dummy.updateMatrix();picks.setMatrixAt(i,dummy.matrix);};
 function redraw(next){buildings=next;for(const g of renderGroups){root.remove(g);g.dispose();if(g.geometry!==geometry)g.geometry.dispose();}renderGroups=[];
  batches={roads:[],marks:[],walls:[],windows:[],roofs:[]};details={roads:[],marks:[],walls:[],windows:[],roofs:[]};heights.clear();pools=[];ground();
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
  for(const key of ['roads','marks','walls','windows','roofs']){const core=batches[key].length,all=core+details[key].length;counts[key]=all;counts[key+'Detail']=all-core;
   const mesh=batch(batches[key].concat(details[key]),root,MATS[key],key==='windows');mesh.userData.lod={core,all};mesh.count=showDetail?all:core;renderGroups.push(mesh);}
  if(style){style.dispose();style=addTokyoStyle(root,buildings);style.setNight(currentNight);}
  applyPools();
 }
 redraw(buildings);

 // ---------- Tokyo Tower (brief 3.11): bands, two deck masses, concave legs, warm uplight on the orange ---------
 const ORANGE='#E5582B',TW='#F4F1EA',beams=[],beamDummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
 const radius=y=>.22+2.9*Math.pow(1-Math.min(1,Math.max(0,(y-.2)/28.8)),1.7);
 function beam(a,b,width,color,light){const s=new THREE.Vector3(...a),e=new THREE.Vector3(...b);beamDummy.position.copy(s).add(e).multiplyScalar(.5);beamDummy.scale.set(width,s.distanceTo(e),width);beamDummy.quaternion.setFromUnitVectors(up,e.clone().sub(s).normalize());beamDummy.updateMatrix();beams.push({m:beamDummy.matrix.clone(),color,light});}
 const box=(y,w,h,color,light)=>{beamDummy.position.set(tower.x,y,tower.z);beamDummy.quaternion.identity();beamDummy.scale.set(w,h,w);beamDummy.updateMatrix();beams.push({m:beamDummy.matrix.clone(),color,light});};
 const lower=Array.from({length:8},(_,i)=>.2+i*(13.9-.2)/7),upper=Array.from({length:6},(_,i)=>15.3+i*(29-15.3)/5);
 for(const list of [lower,upper])for(let i=0;i<list.length-1;i++){
  const ya=list[i],yb=list[i+1],ra=radius(ya),rb=radius(yb),orange=i%2===0,c=orange?ORANGE:TW,light=orange?ORANGE:null,lw=Math.max(.09,.24*ra/3.1+.06);
  const P=(sx,sz,y,r)=>[tower.x+sx*r,y,tower.z+sz*r];
  for(const sx of [-1,1])for(const sz of [-1,1])beam(P(sx,sz,ya,ra),P(sx,sz,yb,rb),lw,c,light);
  for(const s of [-1,1]){beam(P(-1,s,yb,rb),P(1,s,yb,rb),lw*.6,c,light);beam(P(s,-1,yb,rb),P(s,1,yb,rb),lw*.6,c,light);
   beam(P(-1,s,ya,ra),P(1,s,yb,rb),lw*.35,c,light);beam(P(1,s,ya,ra),P(-1,s,yb,rb),lw*.35,c,light);
   beam(P(s,-1,ya,ra),P(s,1,yb,rb),lw*.35,c,light);beam(P(s,1,ya,ra),P(s,-1,yb,rb),lw*.35,c,light);}
 }
 {const ra=radius(13.9),rb=radius(15.3);for(const sx of [-1,1])for(const sz of [-1,1])beam([tower.x+sx*ra,13.9,tower.z+sz*ra],[tower.x+sx*rb,15.3,tower.z+sz*rb],.16,TW);}
 box(14.6,2.9,1.4,TW);box(14.75,3.0,.5,GLASS_LOW,'#FFE6B8');box(15.4,2.5,.16,ORANGE,ORANGE);
 box(24.3,1.15,.8,TW);box(24.4,1.2,.28,GLASS_LOW,'#FFE6B8');
 box(30,.2,2,ORANGE,ORANGE);box(32,.11,2,TW);box(33.2,.06,.5,ORANGE,ORANGE);
 for(const sx of [-1,1])for(const sz of [-1,1]){beamDummy.position.set(tower.x+sx*3.05,.3,tower.z+sz*3.05);beamDummy.quaternion.identity();beamDummy.scale.set(.7,.4,.7);beamDummy.updateMatrix();beams.push({m:beamDummy.matrix.clone(),color:'#B8B3A8'});}
 const lattice=batch(beams.map(b=>({...b,glow:b.light===ORANGE?.6:.9})),root,towerMat,true);
 const towerPick=new THREE.Mesh(new THREE.BoxGeometry(7,33,7),new THREE.MeshBasicMaterial({visible:false}));towerPick.position.set(tower.x,16.5,tower.z);towerPick.userData.place=tower;root.add(towerPick);interactive.push(towerPick);
 style=addTokyoStyle(root,buildings);life=addCityLife(root);applyPools();const crowd=addCityCrowd(root,options),traffic=addCityTraffic(root);
 return {redraw,crowd,lattice,
  heightOf:plotId=>heights.get(plotId)??null,
  stats:()=>({...counts,tower:beams.length,drawCalls:renderGroups.length+1,
   instances:renderGroups.reduce((n,g)=>n+g.count,0)+beams.length,detail:showDetail}),
  // Overview LOD (main.js, camera.zoom < 0.3): hide AC units, small roof items, side pipes and road marks.
  setDetail(on){on=!!on;if(on===showDetail)return;showDetail=on;for(const g of renderGroups)g.count=on?g.userData.lod.all:g.userData.lod.core;},
  update(seconds){life.update(seconds);crowd.update(seconds,options.gpu);traffic.update(seconds);},
  setNight(value){currentNight=value;for(const m of [windowMat,towerMat])m.userData.night.value=value?1:0;
   for(const m of [wallMat,windowMat,towerMat])m.color.copy(value?NIGHT_WALL:DAY);groundMat.color.copy(value?NIGHT_GROUND:DAY);
   style.setNight(value);life.setNight(value);},
  select(hit){if(hit.object.userData.cityPlot&&hit.instanceId!==undefined){showPlace(plotView(cityPlots[hit.instanceId],buildings));return true;}return false;}};
}
