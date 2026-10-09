import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {toon,nightColor,night as nightAmount} from './toon.js';
import {crossingState} from './city-crowd.js';
import {addStreet,hash,LIGHT} from './city-street.js';
import {vehicleState,VEHICLE_KINDS,trafficLightPhase} from './city-traffic.js';
import {addCitySky,bannerText,BLIMP_LIGHTS} from './city-sky.js';
import {screenCards,createScreen} from './city-screens.js';
import {stylePlan} from './tokyo-style.js';
import {worldBuildings} from './world-sync.js';
import {cityLayout,isCommercial,BASE_Y} from './lots.js';
import * as CS from './city-state.js';
import {weather,night as nightShared,wallMaterial} from './toon.js';
import {withNightLight} from './windows.js';
const {districts}=CS;
// City scale (wave 4A grows the map to 7×7 and exports its edges; fall back to the 5×5 numbers when absent). The
// metro, skyline, canal and northern edge pieces are placed from these, so moving the city moves them.
export const cityExtent=()=>CS.CITY_EXTENT??{minX:-72.5,maxX:72.5,minZ:-71.5,maxZ:75.5};
const metroScale=()=>{const e=cityExtent();return (e.maxX-e.minX)/145;};
export function trainPosition(seconds,offset=0){
 const t=((seconds+offset)%108+108)%108;
 const ease=v=>v*v*(3-2*v);
 if(t<16)return -66+40*ease(t/16);
 if(t<21)return -26;
 if(t<49)return -26+92*ease((t-21)/28);
 if(t<54)return 66;
 if(t<82)return 66-92*ease((t-54)/28);
 if(t<87)return -26;
 if(t<103)return -26-40*ease((t-87)/16);
 return -66;
}
// The express (wave 3A): a white/blue 6-car fast train on the far track, one pass in each 90 s window at a hashed
// moment and direction, 230 units at 46 u/s. Returns the nose x (null while none is passing) and the direction.
export const EXPRESS={window:90,speed:46,span:115,cars:6,car:3.65};
export function expressPosition(seconds){
 const k=Math.floor(seconds/EXPRESS.window),start=k*EXPRESS.window+8+hash(k,81)*(EXPRESS.window-16),t=seconds-start,dur=2*EXPRESS.span/EXPRESS.speed;
 if(t<0||t>=dur)return {x:null,dir:0};
 const dir=hash(k,82)<.5?1:-1;return {x:dir*(-EXPRESS.span+t*EXPRESS.speed),dir};
}
// ---------- The canal (wave 4B, ref real-04 Nakameguro): pure layout + the boats' loop ----------
// Water sits 1.5 below the banks between stone walls; walkways with railings and lanterns on both sides; cherry trees
// (city-green.js) on the outer edge of each walkway lean over the water; a lawn bank on the far (east) side.
export function canalLayout(){const e=cityExtent(),x=CS.CANAL_X??79;
 return {x,z0:e.minZ-3,z1:e.maxZ+3,half:5.5,walk:1.5,treeOffset:6.65,waterY:-1.05,top:.425,bridges:[-38,2,42],deckY:.93,deckHalf:7,ramp:.8,lawn:5};}
// Boats run a closed stadium loop: up one lane, a half turn, down the other (concentric lanes, so they never cross).
// lane = distance of the leg from the canal centre (= the turn radius); phase = 0–1 start along the loop.
export const BOATS=[{kind:'yakatabune',len:6.4,beam:1.8,speed:.55,lane:1.6,phase:0},{kind:'tour',len:3.8,beam:1.3,speed:1.2,lane:3.3,phase:.43}];
export function boatLoop(boat,c=canalLayout()){const za=c.z0+9,zb=c.z1-9,S=zb-za,r=boat.lane;return {za,zb,S,r,P:2*S+2*Math.PI*r};}
export function boatPosition(t,boat,c=canalLayout()){
 const {za,zb,S,r,P}=boatLoop(boat,c);let s=((t*boat.speed+boat.phase*P)%P+P)%P;
 // yaw: the boat's local +x (its bow) points along (cos yaw, −sin yaw) in world x/z.
 if(s<S)return {x:c.x+r,z:zb-s,yaw:Math.PI/2};s-=S;
 if(s<Math.PI*r){const a=s/r;return {x:c.x+r*Math.cos(a),z:za-r*Math.sin(a),yaw:Math.atan2(Math.cos(a),-Math.sin(a))};}s-=Math.PI*r;
 if(s<S)return {x:c.x-r,z:za+s,yaw:-Math.PI/2};s-=S;
 const a=s/r;return {x:c.x-r*Math.cos(a),z:zb+r*Math.sin(a),yaw:Math.atan2(-Math.cos(a),Math.sin(a))};
}
// Ducks paddle slow figure-eights near the walls, clear of both boat lanes (|x − canal| ≥ 4.2).
export function duckPosition(t,i,c=canalLayout()){const side=i%2?1:-1,zc=c.z0+12+(c.z1-c.z0-24)*hash(i,61),a=t*.035+hash(i,62)*6.283;
 const x=c.x+side*(4.55+.45*Math.sin(a*2.1)),z=zc+6*Math.sin(a),dx=side*.45*2.1*Math.cos(a*2.1),dz=6*Math.cos(a);return {x,z,yaw:Math.atan2(-dz,dx)};}

// Distant skyline (brief 3.11, 3.10): three clusters with gaps (one left open for Fuji), three depth layers whose values
// step lighter with distance, widths 2–6 and skewed heights 8–30 with no fixed pitch, 1 in 6 with a crown.
export const SKYLINE={day:['#7D8E98','#9AA8B0','#B7C1C4'],night:['#24304A','#202B43','#1B263C']};
// The north gap sits where Fuji stands in the overview (the line from Fuji toward the camera, yaw 36°, crosses the edge).
export function skylinePlan(){
 const e=cityExtent(),SZ=CS.SKYLINE_Z??-71,SX=CS.SKYLINE_X??-71,fuji=CS.FUJI_AT??{x:-60.5,z:-131},cross=fuji.x+Math.tan(36*Math.PI/180)*(SZ-fuji.z);
 const out=[],groups=[['n',e.minX-2.5,cross-34],['n',cross+6,e.maxX-22.5],['w',e.minZ+5.5,e.minZ+41.5]];
 groups.forEach(([edge,from,to],g)=>{for(let layer=0;layer<3;layer++){let u=from+hash(g,layer,1)*3;
  while(u<to){const r=k=>hash(g,layer,u,k),w=2+4*r(1),d=2.4+2.6*r(2),h=Math.min(30,8+22*r(3)**1.8+layer*2*r(4));
   const off=6+layer*7.5+r(5)*3,x=edge==='n'?u+w/2:SX-off-d/2,z=edge==='n'?SZ-off-d/2:u+w/2;
   const crown=hash(g,layer,Math.round(u*4),6)<1/6?['setback','mast','helipad','light'][Math.floor(r(7)*4)]:null;
   out.push({x,z,w:edge==='n'?w:d,d:edge==='n'?d:w,h,layer,crown,edge,seed:r(8)});
   u+=w+(r(9)<.14+layer*.1?3+r(10)*5:.25+r(10)*.9)+layer*1.8;}}});
 return out;
}

// ---------- The live world (main.js feeds it; see the wiring note in the wave 3A report) ----------
// setCityWorld(world): the latest GET /api/world snapshot (screens, blimp banner, critter/steam placement).
// setCityFocus(position|null): the roaming character (or SUB-01) so pigeons scatter when it walks by.
const live={world:null,focus:null,subs:new Set()};
export function setCityWorld(world){live.world=world&&typeof world==='object'?world:null;for(const f of live.subs)f(live.world);}
export function setCityFocus(p){live.focus=p&&Number.isFinite(p.x)&&Number.isFinite(p.z)?{x:p.x,z:p.z}:null;}

// ---------- Steam vents (pure, tested): ramen-shop (noren) exhausts and konbini roof units, 2–3 per commercial district ----------
export function steamVents(buildings=[]){
 const out=[],lots=cityLayout(buildings).lots;
 for(const d of districts){if(!isCommercial(d.id))continue;
  // Ramen/izakaya (noren) and konbini first; then any shop with a roof vent or condenser (a kitchen somewhere below).
  const unitOf=l=>l.roofItems.find(i=>['vent','condenser','cooling'].includes(i.kind));
  const cand=lots.filter(l=>l.district===d.id&&!l.user&&(l.shop==='noren'||l.shop==='konbini'||(l.role!=='interior'&&!['house','pilotis'].includes(l.shop)&&unitOf(l))))
   .map(l=>({l,k:hash(l.x,l.z,91)-(l.shop==='konbini'?1:l.shop==='noren'?.5:0)})).sort((a,b)=>a.k-b.k);
  const n=2+(hash(d.x,d.z,92)<.5?1:0);
  for(const {l} of cand.slice(0,n)){const fz=l.front==='+z'?1:-1,unit=unitOf(l);
   if(unit&&(l.shop!=='noren'||hash(l.x,93)<.5))out.push({x:l.x+unit.u,y:BASE_Y+l.height+.1+(unit.h||.5),z:l.z+fz*unit.v,shop:l.shop,roof:true});
   else out.push({x:l.x+(hash(l.z,94)-.5)*Math.max(0,l.width-1.2),y:BASE_Y+3.35,z:l.frontZ+fz*.25,shop:l.shop,roof:false});}
 }
 return out;
}
// Additive glow batch (ONE draw call): per vehicle a warm pool under it and a headlight cone ahead (night), steam wisps,
// the blimp's nav lights, train headlights and the scramble's signal halos. Kinds: 0 pool, 1 cone, 2 steam, 3 blimp
// light, 4 train light, 5 signal halo. aG = (kind, seed, index/role, spare), aPos = vent / local offset / lamp position.
export const GLOW_BUDGET={desktop:260,mobile:170};
export function glowPlan({mobile=false,vents=[],lamps=[],wisps:maxWisps=Infinity}={}){
 const out=[],add=(kind,seed,idx,x=0,y=0,z=0)=>out.push({kind,seed,idx,x,y,z});
 for(let i=0;i<16;i++){add(0,hash(i,1),i);add(1,hash(i,2),i);}
 // maxWisps: quality hook (quality.js); the default changes nothing.
 const wisps=Math.max(0,Math.min(mobile?3:5,maxWisps));for(const v of vents)for(let j=0;j<wisps;j++)add(2,hash(v.x,v.z,j),0,v.x,v.y,v.z);
 BLIMP_LIGHTS.forEach(([x,y,z,c],i)=>add(3,hash(i,3),c,x,y,z));
 for(let t=0;t<3;t++)add(4,hash(t,4),t,0,0,0);
 for(const l of lamps)add(5,0,l.role,l.x,l.y,l.z);
 return out.slice(0,GLOW_BUDGET[mobile?'mobile':'desktop']);
}
export function glowBuffers(plan){
 const aG=new Float32Array(plan.length*4),aPos=new Float32Array(plan.length*3);
 plan.forEach((o,i)=>{aG.set([o.kind,o.seed,o.idx,0],i*4);aPos.set([o.x,o.y,o.z],i*3);});return {aG,aPos,count:plan.length};
}
const GLOW_VERT=`attribute vec4 aG;attribute vec3 aPos;
uniform vec4 uVeh[16];uniform vec4 uTrain[3];uniform vec4 uBlimp;uniform vec2 uSig;uniform float uTime,uNight;
varying vec2 vUv;varying vec3 vCol;varying float vA,vKind;
void main(){
 vUv=uv;float k=aG.x;vKind=k;vec4 mv;vA=0.;vCol=vec3(1.);
 if(k<1.5){
  if(uNight<.01){gl_Position=vec4(0.,0.,-2.,1.);return;}
  vec4 v=uVeh[int(aG.z+.5)];float c=cos(v.z),s=sin(v.z);vec2 l;
  if(k<.5){l=position.xy*vec2(2.2,2.8*v.w);vCol=vec3(1.,.72,.42)*.6;}
  else{float f=position.y+.5;l=vec2(position.x*mix(1.,3.4,f),v.w*1.02+f*7.);vCol=vec3(1.,.9,.7);}
  vA=uNight;mv=modelViewMatrix*vec4(v.x+l.x*c+l.y*s,.25,v.y-l.x*s+l.y*c,1.);
 }else if(k<2.5){
  float life=fract(uTime*(.085+.05*aG.y)+aG.y*7.3);
  vec3 wp=aPos+vec3(sin(uTime*.4+aG.y*20.)*.22*life+life*.8*cos(aG.y*31.),life*3.1,life*.6*sin(aG.y*31.));
  mv=modelViewMatrix*vec4(wp,1.);mv.xy+=position.xy*(.4+life*1.5);
  vA=sin(3.1416*life)*mix(.3,.2,uNight);vCol=mix(vec3(.8,.82,.85),vec3(.62,.6,.62),uNight);
 }else if(k<3.5){
  float c=cos(uBlimp.w),s=sin(uBlimp.w),blink=step(fract(uTime*.85+aG.y),.12);
  mv=modelViewMatrix*vec4(uBlimp.xyz+vec3(aPos.x*c+aPos.z*s,aPos.y,-aPos.x*s+aPos.z*c),1.);mv.xy+=position.xy*(.8+.9*blink);
  vA=uNight*mix(.3,1.,blink);vCol=aG.z<.5?vec3(1.,.22,.18):aG.z<1.5?vec3(.3,1.,.5):vec3(1.);
 }else if(k<4.5){
  vec4 tr=uTrain[int(aG.z+.5)];if(tr.w<.5||uNight<.01){gl_Position=vec4(0.,0.,-2.,1.);return;}
  mv=modelViewMatrix*vec4(tr.xyz,1.);mv.xy+=position.xy*1.6;vA=uNight*.9;vCol=vec3(1.,.93,.78);
 }else{
  float role=aG.z,on=role<2.5?step(abs(role-uSig.x),.5):role<3.5?step(uSig.y,.5):step(1.5,uSig.y);
  mv=modelViewMatrix*vec4(aPos,1.);mv.xy+=position.xy*.9;vA=uNight*on*.85;
  vCol=role<.5?vec3(.25,1.,.75):role<1.5?vec3(1.,.72,.28):role<2.5?vec3(1.,.3,.22):role<3.5?vec3(.35,1.,.65):vec3(1.,.35,.28);
 }
 gl_Position=projectionMatrix*mv;
}`;
const GLOW_FRAG=`varying vec2 vUv;varying vec3 vCol;varying float vA,vKind;
void main(){vec2 p=vUv-.5;float a;
 if(vKind>.5&&vKind<1.5){float f=vUv.y,u=abs(p.x)*2.;a=pow(1.-f,1.7)*(1.-u*u)*smoothstep(0.,.1,f);}
 else{float d=length(p)*2.;a=max(0.,1.-d);a*=a;}
 gl_FragColor=vec4(vCol,a*vA);}`;

// Infrastructure and distant skyline use shared meshes. No new external assets.
export function addCityLife(parent){
 const root=new THREE.Group();parent.add(root);
 const geo=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
 const solid=[],windows=[],water=[];
 const item=(list,x,y,z,w,h,d,color)=>list.push({x,y,z,w,h,d,color});
 const mat=toon({roughness:.86});
 const emissive=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});
 function batch(items,material,g=geo){const mesh=new THREE.InstancedMesh(g,material,items.length);items.forEach((s,i)=>{dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(s.rx||0,0,s.rz||0);dummy.scale.set(s.w,s.h,s.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(s.color));});root.add(mesh);return mesh;}
 // Skyline bodies are unlit flat values (exact brief colours, fog on top); faces are pre-shaded through vertex colours.
 const skyline=skylinePlan(),skyGeo=geo.clone(),shade=[.88,.9,1.05,1,1,.88];   // +x −x +y −y +z −z
 skyGeo.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:24},(_,v)=>Array(3).fill(shade[Math.floor(v/4)])).flat(),3));
 const skyItems=[];
 for(const b of skyline){const top=b.h,c=SKYLINE.day[b.layer];
  item(skyItems,b.x,top/2,b.z,b.w,top,b.d,c);
  if(b.crown==='setback')item(skyItems,b.x,top+1.4,b.z,b.w*.62,2.8,b.d*.62,c);
  if(b.crown==='mast'||b.crown==='light')item(skyItems,b.x,top+1.6,b.z,.14,3.2,.14,c);
  if(b.crown==='helipad')item(skyItems,b.x,top+.12,b.z,Math.min(b.w,b.d)*.86,.24,Math.min(b.w,b.d)*.86,SKYLINE.day[Math.min(2,b.layer+1)]);
  // Night: 10–20% of window slots lit on the faces the camera sees, a few whole office floors, aviation lights on masts.
  const faces=b.edge==='n'?[['z',b.w],['x',b.d]]:[['x',b.d],['z',b.w]],rate=.1+b.seed*.1;
  for(let y=1.4;y<top-.6;y+=1.55)for(const [axis,span] of faces){const cols=Math.max(1,Math.floor(span/1.1));
   if(hash(b.x,y,axis==='x'?1:2,30)<.035){axis==='z'?item(windows,b.x,y,b.z+b.d/2+.03,b.w*.84,.42,.04,'#FFE6B8'):item(windows,b.x+b.w/2+.03,y,b.z,.04,.42,b.d*.84,'#FFE6B8');continue;}
   for(let c=0;c<cols;c++){if(hash(b.x,b.z,y,c,axis==='x'?3:4)>=rate)continue;const t=(c+.5)/cols-.5,k=hash(b.x,y,c,31),col=k<.55?'#FFC27A':k<.88?'#FFE6B8':'#D8E6F0';
    axis==='z'?item(windows,b.x+t*span,y,b.z+b.d/2+.03,.48,.6,.04,col):item(windows,b.x+b.w/2+.03,y,b.z+t*span,.04,.6,.48,col);}}
  if(b.crown==='light'||b.crown==='mast')item(windows,b.x,top+3.25,b.z,.28,.28,.28,'#FF5A4A');
 }
 // ---------- The canal (wave 4B): walls, walkways, railings, lanterns, bridges with parapets, a lawn bank ----------
 const canal=canalLayout(),CX=canal.x,CL=canal.z1-canal.z0,CM=(canal.z0+canal.z1)/2,stone=[],canalLamps=[];
 const onBridge=z=>canal.bridges.some(b=>Math.abs(z-b)<2.35);
 item(solid,CX+7+canal.lawn/2,.18,CM,canal.lawn,.3,CL,'#8FA66B');
 for(const side of [-1,1]){const rx=CX+side*(canal.half+.12);
  item(solid,CX+side*6.25,.25,CM,canal.walk,.35,CL,'#B4B1A7');
  item(stone,CX+side*(canal.half+.25),(canal.waterY-.4+canal.top)/2,CM,.5,canal.top-canal.waterY+.4,CL,'#8E8B80');
  item(solid,CX+side*(canal.half+.08),canal.top+.035,CM,.2,.07,CL,'#CFCBC0');
  // Railing: posts every 1.6 and two rails per stretch between bridges; lantern strings on bamboo poles above it.
  for(let z=canal.z0+.8;z<canal.z1-.8;z+=1.6)if(!onBridge(z))item(solid,rx,canal.top+.45,z,.06,.9,.06,'#4E5A55');
  const cuts=[canal.z0+.5,...canal.bridges.flatMap(b=>[b-2.35,b+2.35]),canal.z1-.5];
  for(let k=0;k<cuts.length;k+=2){const a=cuts[k],b=cuts[k+1],m=(a+b)/2;item(solid,rx,canal.top+.9,m,.07,.06,b-a,'#4E5A55');item(solid,rx,canal.top+.5,m,.04,.04,b-a,'#4E5A55');
   item(solid,rx+side*.18,canal.top+1.78,m,.025,.025,b-a,'#2D3134');
   for(let z=a+.4;z<b;z+=9.6)item(solid,rx+side*.18,canal.top+.95,z,.08,1.9,.08,'#B9A27A');}
  let n=0;for(let z=canal.z0+1.2+hash(side,71);z<canal.z1-1.2;z+=1.6){if(onBridge(z))continue;const red=hash(side,z,72)<.38,y=canal.top+1.56,x=rx+side*.18;
   item(solid,x,y,z,.2,.28,.2,red?'#C8452D':'#E9E2D2');item(windows,x,y,z,.23,.31,.23,red?'#FF7A4A':'#FFD9A0');
   if(n++%3===0)canalLamps.push([CX+side*(canal.half-.7),z+(hash(side,z,73)-.5)*.6,red]);}
 }
 // Bridges: a stone deck at y 0.93 (explore.js walks it), ramps, parapets with a light coping, four lamp posts each.
 for(const z of canal.bridges){const L=canal.deckHalf*2,rise=canal.deckY-.26,ra=Math.atan2(rise,canal.ramp);
  item(stone,CX,(canal.deckY+.45)/2,z,L,canal.deckY-.45,4,'#A9A79D');item(solid,CX,canal.deckY+.012,z,L,.025,3.5,'#7A7F7C');
  for(const e of [-1,1])stone.push({x:CX+e*(canal.deckHalf+canal.ramp/2),y:(canal.deckY+.26)/2-.1,z,w:Math.hypot(canal.ramp,rise)+.05,h:.2,d:4,rz:-e*ra,color:'#A9A79D'});
  for(const sz of [-1,1]){item(stone,CX,canal.deckY+.42,z+sz*1.92,L,.84,.16,'#B8B3A8');item(solid,CX,canal.deckY+.88,z+sz*1.92,L+.1,.08,.26,'#D3CFC4');
   for(const e of [-1,1]){const x=CX+e*(canal.deckHalf-.35);item(solid,x,canal.deckY+1.62,z+sz*1.92,.09,1.6,.09,'#3E4A48');item(solid,x,canal.deckY+2.47,z+sz*1.92,.26,.32,.26,'#E9E2D2');
    item(windows,x,canal.deckY+2.47,z+sz*1.92,.28,.34,.28,'#FFE6B8');canalLamps.push([x,z+sz*1.2,'deck']);}}}
 // Elevated metro follows the southern edge of the city; the express runs on a third track on the far (north) side.
 // The route is laid out in 5×5 units (trainPosition, EXPRESS) and stretched by K to the city's width (wave 4A).
 const ext=cityExtent(),K=metroScale(),MX=(ext.minX+ext.maxX)/2,TL=145*K,SX=MX-26*K;
 const trackZ=CS.METRO_Z??78,expressZ=trackZ-2.25;
 for(const z of [trackZ-1,trackZ+1]){item(solid,MX,4,z,TL,.15,.1,'#a7bdc3');item(solid,MX,3.65,z,TL,.5,.7,'#415c6b');}
 for(let x=MX-TL/2+3.5;x<=MX+TL/2-3.4;x+=8){item(solid,x,1.8,trackZ,.7,3.6,1,'#627f87');item(solid,x,3.55,expressZ+.9,.45,.4,2.3,'#627f87');}
 item(solid,MX,4.1,trackZ,TL,.12,2.7,'#89a0a4');
 item(solid,MX,4.1,expressZ,TL,.12,1.5,'#89a0a4');item(solid,MX,3.8,expressZ-.7,TL,.45,.12,'#415c6b');for(const dz of [-.42,.42])item(solid,MX,4.2,expressZ+dz,TL,.06,.06,'#a7bdc3');
 item(solid,SX,4.55,trackZ+3,14,.5,3.3,'#acb5a6');item(solid,SX,7,trackZ+3,15,.15,4,'#2b7886');
 for(const x of [-5,5])item(solid,SX+x,5.6,trackZ+3,.12,2.8,.12,'#dcceb5');
 // Station sign on the roof edge: navy panel by day; at night a lit cool-white face with a green line colour chip.
 item(solid,SX,7.5,trackZ+5.02,4.6,.7,.1,'#1F4E8C');item(solid,SX,7.5,trackZ+5.06,4.1,.46,.02,'#E8EEF2');
 item(windows,SX-.3,7.5,trackZ+5.1,3.5,.42,.03,'#EAF4FF');item(windows,SX-2.05,7.5,trackZ+5.1,.4,.4,.03,'#3E9B5C');
 item(windows,SX,6.86,trackZ+3,13,.08,3.6,'#E8F1F6');   // platform strip lights under the canopy
 // Crossing signals (Shibuya scramble): Japanese 2-lamp pedestrian heads on four poles and horizontal 3-lamp vehicle
 // heads (blue-green, amber, red from the driver's left) on arms over each approach. Lamps share one basic mesh.
 const pedLamps=[],vehLamps=[],lampSites=[];
 for(const x of [24.4,33.6])for(const z of [-1.4,5.4]){item(solid,x,2.45,z,.12,4.6,.12,'#425767');item(solid,x,3.0,z,.42,.8,.2,'#263a49');
  pedLamps.push({x,y:3.18,z:z+.11,role:4},{x,y:2.82,z:z+.11,role:3});}
 // [pole x, pole z, head z, facing x (+1 lamps face +x)]
 for(const [px,pz,hz,fx] of [[33.6,5.4,3.3,-1],[24.4,5.4,3.3,-1],[24.4,-1.4,.7,1],[33.6,-1.4,.7,1]]){
  item(solid,px,4.95,(pz+hz)/2,.08,.08,Math.abs(pz-hz),'#425767');item(solid,px-fx*.05,4.95,hz,.22,.34,1.05,'#263a49');
  // Driver's left: facing +x lamps are seen by westbound drivers (left = +z); facing −x by eastbound (left = −z).
  [0,1,2].forEach(role=>vehLamps.push({x:px+fx*.07,y:4.95,z:hz+(fx>0?1:-1)*(1-role)*.33,role,fx}));}
 for(const l of [...vehLamps,...pedLamps])lampSites.push({x:l.x+(l.fx||0)*.12,y:l.y,z:l.z+(l.fx?0:.08),role:l.role});
 // Station entrance and a torii at the green northern edge; the entrance gets a lit sign band at night.
 const NZ=ext.minZ+6.5;
 for(const x of [-35,-29])item(solid,x,2.5,NZ,.4,5,.4,'#dc7348');item(solid,-32,5,NZ,8,.5,.5,'#d77649');item(solid,-32,4,NZ,7,.22,.3,'#df9c68');
 item(windows,-32,4.3,NZ+.18,5.6,.3,.04,'#FFE6B8');
 for(const x of [-41,-17])for(const z of [-1,5])item(solid,x,1.9,z,.1,3.4,.1,'#536274');
 // Utility poles, lamps and fittings join the shared solid batch; cables and light pools are one draw call each.
 const street=addStreet(root);solid.push(...street.items);
 // The Roppongi lantern street gets warm pools of its own; the stations get theirs.
 for(const z of [-1,5])for(let x=-39;x<=-19;x+=5)street.addLightPool(x+hash(x,z)*1.5,z+(z<0?.9:-.9),LIGHT.lantern,1.9,{strength:.42,group:'lanterns'});
 for(const [x,z,r,s,y] of [[-32,NZ+1.6,3.2,.6],[-29.5,NZ-1.2,1.8,.4],[SX,trackZ+3,4.6,.5,4.85],[SX,trackZ+5.4,3.6,.45]])street.addLightPool(x,z,LIGHT.led,r,{strength:s,y:y??.235,group:'stations'});
 // Canal: lantern light on the water (every third lantern) and the bridge lamps on their decks.
 for(const [x,z,k] of canalLamps)k==='deck'?street.addLightPool(x,z,LIGHT.led,1.6,{strength:.4,y:canal.deckY+.03,group:'canal'}):street.addLightPool(x,z,k?'#FF8A5A':LIGHT.lantern,1.9,{strength:.42,y:canal.waterY+.02,group:'canal'});
 const solidMesh=batch(solid,mat);solidMesh.castShadow=true;solidMesh.receiveShadow=true;
 const skyMat=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}),skyMesh=batch(skyItems,skyMat,skyGeo);skyMesh.name='skyline';
 // Their feet dissolve into the fog colour (ground haze), so the skyline stands behind the city instead of on nothing.
 skyMat.onBeforeCompile=sh=>{sh.vertexShader='varying float vSkyY;\n'+sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n vSkyY=(modelMatrix*instanceMatrix*vec4(transformed,1.)).y;');
  sh.fragmentShader='varying float vSkyY;\n'+sh.fragmentShader.replace('#include <fog_fragment>','#include <fog_fragment>\n #ifdef USE_FOG\n gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,.85*(1.-smoothstep(0.,11.,vSkyY)));\n #endif');};
 const windowMesh=batch(windows,emissive);windowMesh.visible=false;
 // Canal stone (walls, bridge decks, ramps, parapets): the wall material, so walls get weep stains from the top and a
 // dark algae band at the waterline, per instance and for free.
 const stoneMat=wallMaterial({roughness:1,ground:canal.waterY,foot:.5,dirt:.4,cap:.12,capDirt:.1,streak:.24,sill:canal.top,streakFrom:canal.waterY-1});
 const stoneMesh=batch(stone,stoneMat);stoneMesh.castShadow=stoneMesh.receiveShadow=true;stoneMesh.name='canal stone';stoneMesh.raycast=()=>{};
 // Water: one quad, a moving two-tone ripple (crest lines over a deep tone, darker under the walls), no reflections.
 const lin=h=>{const c=new THREE.Color(h);return `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;};
 const waterU={uWTime:{value:0},uWNight:nightShared,uWX:{value:CX},uWHalf:{value:canal.half}};
 const waterMat=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});
 waterMat.onBeforeCompile=sh=>{Object.assign(sh.uniforms,waterU);
  sh.vertexShader='varying vec2 vWp;\n'+sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n vWp=(modelMatrix*vec4(transformed,1.)).xz;');
  sh.fragmentShader='uniform float uWTime,uWNight,uWX,uWHalf;varying vec2 vWp;\n'+sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 wp=vWp;float wt=uWTime,wx=wp.x-uWX;
 float crest=0.;
 for(int k=0;k<2;k++){float fk=float(k);vec2 q=vec2(wx*1.25+fk*.5,(wp.y-wt*(.55+.25*fk))*.42+fk*.37),id=floor(q),f=fract(q)-.5;
  float h=fract(sin(dot(id+fk*7.1,vec2(12.9898,78.233)))*43758.5453),sx=f.x+(h-.5)*.55+.06*sin(wt*1.3+h*6.3),len=.07+.11*h;
  crest=max(crest,step(.5,h)*(1.-smoothstep(.04,.07,abs(sx)))*(1.-smoothstep(len-.06,len,abs(f.y))));}
 float tone=.5+.5*sin(wp.y*.23+wx*.4+wt*.15)*sin(wp.y*.11-wt*.07),edge=smoothstep(uWHalf*.55,uWHalf,abs(wx));
 vec3 wDeep=mix(${lin('#3E5C58')},${lin('#0D1726')},uWNight),wHi=mix(${lin('#A3C2B9')},${lin('#3A5276')},uWNight);
 diffuseColor.rgb=mix(wDeep*(.88+.2*tone),wHi,crest*.6)*(1.-.4*edge*(1.-.5*uWNight));`);};
 waterMat.customProgramCacheKey=()=>'canal-water';
 const waterGeo=new THREE.PlaneGeometry(canal.half*2,CL);waterGeo.rotateX(-Math.PI/2);
 const river=new THREE.Mesh(waterGeo,waterMat);river.position.set(CX,canal.waterY,CM);river.name='canal water';river.raycast=()=>{};root.add(river);
 // Boats and ducks: ONE dynamic batch. Yakatabune (a long low houseboat: dark hull, red gunwale, cabin with a window
 // band and paper lanterns that light at night), a small tour boat (white, blue stripe, canopy, passengers), six ducks.
 const parts=[],BP=(owner,x,y,z,w,h,d,color,glow=null)=>parts.push({owner,x,y,z,w,h,d,color,glow});
 BP(0,0,.05,0,6.4,.5,1.8,'#3A3430');BP(0,3.4,.16,0,.7,.36,1.2,'#3A3430');BP(0,0,.33,0,6.46,.08,1.84,'#8C2F2A');BP(0,-.1,.8,0,5.2,.95,1.5,'#C9B79A');
 for(const s of [-1,1])BP(0,-.1,.86,s*.76,4.8,.42,.03,'#3D3A36','#FFC27A');
 BP(0,-.1,1.31,0,5.7,.1,1.86,'#2E2A28');BP(0,-.1,1.4,0,5.4,.09,.5,'#2E2A28');
 for(const k of [-2.1,-.7,.7,2.1])for(const s of [-1,1])BP(0,k-.1,1.14,s*.99,.16,.22,.16,'#D2463C','#FF6A4A');
 BP(1,0,.05,0,3.8,.45,1.3,'#F1EEE6');BP(1,2.08,.12,0,.5,.32,.9,'#F1EEE6');BP(1,0,.23,0,3.86,.08,1.34,'#2F6FB5');BP(1,-.1,1.22,0,2.7,.06,1.32,'#2F6FB5');
 for(const x of [-1.25,1.05])for(const s of [-1,1])BP(1,x,.76,s*.6,.05,.92,.05,'#9AA3A8');
 for(let k=0;k<4;k++){const z=k%2?.3:-.3,x=-.95+k*.6;BP(1,x,.5,z,.28,.4,.24,['#2E3A55','#C26A5C','#D9D2C2','#5B6466'][k]);BP(1,x,.8,z,.17,.17,.17,'#E8C4A0');}
 const DUCKS=6;for(let i=0;i<DUCKS;i++){const o=2+i,drake=hash(i,63)<.5;BP(o,0,.05,0,.34,.16,.2,drake?'#8A8478':'#7A5A3C');BP(o,.17,.2,0,.12,.13,.11,drake?'#2E5E3A':'#6B5443');BP(o,.25,.18,0,.08,.035,.06,'#E3A33C');}
 const boatMat=withNightLight(toon({roughness:.85})),boatGeo=geo.clone(),boatGlow=new Float32Array(parts.length*3);
 parts.forEach((p,i)=>{if(p.glow){const c=new THREE.Color(p.glow).multiplyScalar(.7);boatGlow.set([c.r,c.g,c.b],i*3);}});boatGeo.setAttribute('nightLight',new THREE.InstancedBufferAttribute(boatGlow,3));
 const boatMesh=new THREE.InstancedMesh(boatGeo,boatMat,parts.length);boatMesh.name='canal boats';boatMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);boatMesh.frustumCulled=false;boatMesh.raycast=()=>{};boatMesh.castShadow=true;
 parts.forEach((p,i)=>{boatMesh.setColorAt(i,new THREE.Color(p.color));p.m=new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),new THREE.Quaternion(),new THREE.Vector3(p.w,p.h,p.d));});root.add(boatMesh);
 const ownerM=new THREE.Matrix4(),partM=new THREE.Matrix4(),qY=new THREE.Quaternion(),vP=new THREE.Vector3(),vS=new THREE.Vector3(1,1,1),eY=new THREE.Euler();
 function placeBoats(t){for(let o=0;o<2+DUCKS;o++){const b=o<2?boatPosition(t,BOATS[o],canal):duckPosition(t,o-2,canal),bob=Math.sin(t*1.3+o*1.7)*(o<2?.03:.015);
   eY.set(Math.sin(t*.9+o)*(o<2?.02:0),b.yaw,0,'YXZ');qY.setFromEuler(eY);vP.set(b.x,canal.waterY-.05+bob,b.z);ownerM.compose(vP,qY,vS);
   parts.forEach((p,i)=>{if(p.owner===o)boatMesh.setMatrixAt(i,partM.multiplyMatrices(ownerM,p.m));});}
  boatMesh.instanceMatrix.needsUpdate=true;}
 // Hanami (sakura weather only): blue tarps on the lawn bank under the cherries, people sitting on them, bento boxes.
 const picnic=[];{const n=typeof matchMedia!=='undefined'&&matchMedia('(max-width:600px)').matches?8:15;for(let k=0;k<n;k++){const z=canal.z0+8+(CL-16)*(k+hash(k,64)*.6)/n,x=CX+8.6+hash(k,65)*1.6,ry=(hash(k,66)-.5)*.5,blue=hash(k,67)<.75?'#3F7FC4':'#2E6FB0';
  picnic.push({x,y:.34,z,w:1.8,h:.03,d:1.4,ry,color:blue});const people=2+Math.floor(hash(k,68)*3);
  for(let p=0;p<people;p++){const a=p/people*6.283+hash(k,p,69),px=x+Math.cos(a)*.55,pz=z+Math.sin(a)*.45,c=['#2E3A55','#C26A5C','#D9D2C2','#5B6466','#7FA09C','#E3BE3C'][Math.floor(hash(k,p,70)*6)];
   picnic.push({x:px,y:.56,z:pz,w:.3,h:.42,d:.26,ry:a,color:c},{x:px,y:.86,z:pz,w:.18,h:.18,d:.18,ry:a,color:'#E8C4A0'});}
  picnic.push({x:x+.1,y:.39,z,w:.22,h:.07,d:.16,color:'#C8452D'},{x:x-.15,y:.39,z:z+.1,w:.2,h:.07,d:.14,color:'#2B2B2B'});}}
 const hanami=new THREE.InstancedMesh(geo,mat,picnic.length);picnic.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,v.ry||0,0);dummy.scale.set(v.w,v.h,v.d);dummy.updateMatrix();hanami.setMatrixAt(i,dummy.matrix);hanami.setColorAt(i,new THREE.Color(v.color));});
 hanami.name='hanami';hanami.visible=false;hanami.raycast=()=>{};hanami.castShadow=true;root.add(hanami);
 // Falling petals by the cherries: only while the blossoms are out (toon weather.sakura).
 const petalTime={value:0},petalGeometry=new THREE.BufferGeometry();
 petalGeometry.setAttribute('position',new THREE.Float32BufferAttribute(Array.from({length:160},(_,i)=>[CX+(i%2?-1:1)*(4.5+hash(i,74)*2.5),.5+(i%17)*.2,canal.z0+5+hash(i,75)*(CL-10)]).flat(),3));
 const petalMaterial=new THREE.PointsMaterial({color:'#efd0da',size:.13,transparent:true,opacity:.8,depthWrite:false});
 petalMaterial.onBeforeCompile=shader=>{shader.uniforms.petalTime=petalTime;shader.vertexShader='uniform float petalTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y = -0.6 + mod(position.y + 1.1 - petalTime * 0.28, 3.5);\ntransformed.x += sin(petalTime * 0.6 + position.z) * 0.5;');};
 const petals=new THREE.Points(petalGeometry,petalMaterial);petals.visible=false;petals.frustumCulled=false;root.add(petals);
 const allLamps=[...vehLamps,...pedLamps];
 const signals=batch(allLamps.map(l=>l.fx?{x:l.x,y:l.y,z:l.z,w:.03,h:.24,d:.24,color:'#26313A'}:{x:l.x,y:l.y,z:l.z,w:.22,h:.22,d:.025,color:'#26313A'}),new THREE.MeshBasicMaterial());
 const LAMP_ON=['#3FE0B0','#FFB547','#FF4A3A','#5FE6A8','#FF5A4A'],LAMP_OFF='#26313A';
 // A small lantern street: shared faceted lanterns sway from suspended cables, and breathe gently at night.
 const lanterns=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial(),18);root.add(lanterns);
 const lanternBase=Array.from({length:18},(_,i)=>new THREE.Color(hash(i,7)<.66?'#faad68':'#e66e57'));
 lanternBase.forEach((c,i)=>lanterns.setColorAt(i,c));
 // Merged static pieces (wave 4B, fewer meshes): one geometry per material with per-vertex colours.
 const piece=(g,x,y,z,color)=>{g.translate(x,y,z);const c=new THREE.Color(color);g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:g.attributes.position.count},()=>[c.r,c.g,c.b]).flat(),3));return g;};
 const merged=(list,material,name)=>{const m=new THREE.Mesh(mergeGeometries(list.map(g=>g.index?g.toNonIndexed():g)),material);m.name=name;m.castShadow=m.receiveShadow=!material.isMeshBasicMaterial;root.add(m);return m;};
 merged([-1,5].map(z=>piece(new THREE.BoxGeometry(24,.035,.035),-29,3.4,z,'#ffffff')),mat,'lantern cables');
 // Trains: the two metro trains and the express share ONE instanced mesh (instances move with their train each frame).
 // Metro: 4 cars (body, orange stripe, 3 windows) plus a lamp box at each end; express: 6 white cars with a blue
 // stripe, a window band and tapered noses. Night: bodies dim, window bands light up, the leading lamp turns white.
 const trainItems=[],trainRuns=[];
 const T=(train,x,y,z,w,h,d,day,role='body')=>trainItems.push({train,x,y,z,w,h,d,day,role});
 for(let train=0;train<2;train++){
  for(let i=0;i<4;i++){T(train,-i*3.2,.6,0,2.9,1.15,1.05,'#d9e3de');T(train,-i*3.2,.3,.54,2.9,.16,.02,'#e48443');
   for(const dx of [-.85,0,.85])T(train,-i*3.2+dx,.73,.54,.52,.44,.03,'#284f66','window');}
  for(const end of [1,-1])T(train,end>0?1.47:-3*3.2-1.47,.55,0,.04,.18,.6,'#9aa3a8',end>0?'lampF':'lampB');
  trainRuns.push({z:trackZ+(train?-.7:.7),y:4.25});
 }
 {const L=EXPRESS.car;for(let i=0;i<EXPRESS.cars;i++){const x=-i*L;T(2,x,.55,0,L-.12,.95,1.0,'#F4F1EA');T(2,x,.3,0,L-.12,.1,1.03,'#2F6FB5');T(2,x,.78,0,L-.5,.2,1.03,'#2B3A48','window');}
  for(const [x,s] of [[L/2+.55,1],[-(EXPRESS.cars-1)*L-L/2-.55,-1]]){T(2,x,.42,0,1.1,.7,.96,'#F4F1EA');T(2,x+s*.75,.32,0,.5,.45,.8,'#F4F1EA');T(2,x+s*.28,.72,0,.5,.18,.9,'#2B3A48');T(2,x+s*.99,.36,0,.04,.14,.5,'#9aa3a8',s>0?'lampF':'lampB');}
  trainRuns.push({z:expressZ,y:4.18});}
 // The other neon districts' hero billboards ride in the same batch (8 thin boxes after the train items) so trains and
 // overlays cost one draw call: the material maps the hero screen canvas, train boxes sample its white bottom strip.
 const HERO_SLOTS=8,HERO0=trainItems.length,heroScreen=createScreen({shift:1,strip:2});
 const trainMat=new THREE.MeshBasicMaterial({map:heroScreen.texture});
 trainMat.onBeforeCompile=sh=>{sh.vertexShader='attribute float aHero;\n'+sh.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
 #ifdef USE_MAP
 vMapUv=aHero>.5?vec2(vMapUv.x,vMapUv.y*256./258.+2./258.):vec2(.5,.5/258.);
 #endif`);};
 trainMat.customProgramCacheKey=()=>'city-trains-heroes';
 const trainMesh=new THREE.InstancedMesh(geo,trainMat,trainItems.length+HERO_SLOTS);trainMesh.name='trains + hero screens';trainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 trainMesh.geometry=geo.clone();trainMesh.geometry.setAttribute('aHero',new THREE.InstancedBufferAttribute(new Float32Array(trainItems.length+HERO_SLOTS).fill(1,HERO0),1));
 trainMesh.frustumCulled=false;trainMesh.raycast=()=>{};root.add(trainMesh);
 const ZERO=new THREE.Matrix4().makeScale(0,0,0);for(let i=0;i<HERO_SLOTS;i++){trainMesh.setMatrixAt(HERO0+i,ZERO);trainMesh.setColorAt(HERO0+i,new THREE.Color('#ffffff'));}
 const trains=[{position:new THREE.Vector3()},{position:new THREE.Vector3()}],express={position:new THREE.Vector3(),dir:0,running:false};
 const trainColor=new THREE.Color(),dimBody=new THREE.Color('#5F6C86');
 function paintTrains(dirs){trainItems.forEach((it,i)=>{let c=trainColor.set(it.day);
   if(it.role==='window'&&currentNight)c.set(it.train===2?'#FFE6B8':'#E8F1F6');
   else if(it.role==='lampF'||it.role==='lampB'){const lead=(it.role==='lampF')===(dirs[it.train]>=0);c.set(lead?(currentNight?'#FFF6DA':'#E8E6DE'):(currentNight?'#FF4A3A':'#9aa3a8'));}
   else if(currentNight)c.multiply(dimBody);
   trainMesh.setColorAt(i,c);});trainMesh.instanceColor.needsUpdate=true;}
 // A slim, stepped broadcast tower adds a second silhouette.
 const towerMat=toon({vertexColors:true,roughness:.5}),towerParts=[],ringParts=[];
 for(const [r,h,y] of [[1.3,21,10.5],[.75,12,27],[.3,9,37.5]])towerParts.push(piece(new THREE.CylinderGeometry(r*.65,r,h,8),55,y,-58,'#809cad'));
 for(const y of [21,31])ringParts.push(piece(new THREE.CylinderGeometry(2,2,.65,12),55,y,-58,'#78c7d1'));
 // Light bands on Shibuya's feature tower.
 towerParts.push(piece(new THREE.CylinderGeometry(1.5,1.8,12,12),42,6,1,'#285b68'));
 for(const y of [3,7,11])ringParts.push(piece(new THREE.CylinderGeometry(1.83,1.83,.2,12),42,y,1,y===7?'#fb974c':'#63d3db'));
 merged(towerParts,towerMat,'towers');merged(ringParts,new THREE.MeshBasicMaterial({vertexColors:true}),'tower rings');
 // The Shibuya screen (6.3 × 3.15: tokyo-style.js finds it by that size and re-places it on its roof) and the other
 // neon districts' hero billboards (one instanced overlay) cycle through the public projects (city-screens.js).
 const screen=createScreen({shift:0});
 const screenMesh=new THREE.Mesh(new THREE.PlaneGeometry(6.3,3.15),new THREE.MeshBasicMaterial({map:screen.texture,side:THREE.DoubleSide}));screenMesh.position.set(29,11,-1.53);root.add(screenMesh);
 let heroes=[],heroesOn=false;
 function placeHeroes(buildings){heroes=stylePlan(buildings).signs.filter(s=>s.role==='hero').slice(0,HERO_SLOTS);}
 function showHeroes(on){heroesOn=on;for(let i=0;i<HERO_SLOTS;i++){const s=heroes[i];if(!on||!s){trainMesh.setMatrixAt(HERO0+i,ZERO);continue;}
   const n=[Math.sin(s.ry),Math.cos(s.ry)];dummy.position.set(s.x+n[0]*.03,s.y,s.z+n[1]*.03);dummy.rotation.set(0,s.ry,0);dummy.scale.set(s.w,s.h,.01);dummy.updateMatrix();trainMesh.setMatrixAt(HERO0+i,dummy.matrix);}
  trainMesh.instanceMatrix.needsUpdate=true;}
 // Sky: blimp and critters (city-sky.js); glow batch (pools, cones, steam, nav/train/signal lights).
 const mobile=typeof matchMedia!=='undefined'&&matchMedia('(max-width:600px)').matches;
 const skyLife=addCitySky(root,{mobile});
 const glowUniforms={uVeh:{value:Array.from({length:16},()=>new THREE.Vector4())},uTrain:{value:Array.from({length:3},()=>new THREE.Vector4())},
  uBlimp:{value:new THREE.Vector4()},uSig:{value:new THREE.Vector2()},uTime:{value:0},uNight:nightAmount};
 const quad=new THREE.PlaneGeometry(1,1),glowGeo=new THREE.InstancedBufferGeometry();glowGeo.index=quad.index;glowGeo.setAttribute('position',quad.attributes.position);glowGeo.setAttribute('uv',quad.attributes.uv);
 const glow=new THREE.Mesh(glowGeo,new THREE.ShaderMaterial({uniforms:glowUniforms,vertexShader:GLOW_VERT,fragmentShader:GLOW_FRAG,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));glow.name='glow';glow.frustumCulled=false;glow.raycast=()=>{};glow.renderOrder=2;root.add(glow);
 let ventCount=0,glowFor=[],qWisps=Infinity;
 function setGlow(buildings){glowFor=buildings;const vents=steamVents(buildings);ventCount=vents.length;const b=glowBuffers(glowPlan({mobile,vents,lamps:lampSites,wisps:qWisps}));
  glowGeo.dispose();   // frees the previous instance buffers on the GPU (re-uploaded on the next draw)
  glowGeo.setAttribute('aG',new THREE.InstancedBufferAttribute(b.aG,4));glowGeo.setAttribute('aPos',new THREE.InstancedBufferAttribute(b.aPos,3));glowGeo.instanceCount=b.count;}
 const halfLen=VEHICLE_KINDS.map(k=>k==='bus'?1.86:k==='kei'?1.06:1.07);
 // World snapshot → screens, banner, and (when the set of built plots changes) steam, critters and hero overlays.
 let buildKey=null;
 function onWorld(world){
  const cards=screenCards(world);screen.setCards(cards);heroScreen.setCards(cards);
  skyLife.setBannerText(bannerText(world));
  const buildings=world?worldBuildings(world):[],key=JSON.stringify(buildings.map(b=>[b.plotId,b.phase]));
  if(key!==buildKey){buildKey=key;setGlow(buildings);skyLife.setBuildings(buildings);placeHeroes(buildings);}
  showHeroes(cards.length>0);
 }
 live.subs.add(onWorld);onWorld(live.world);
 let currentNight=false,lastSig='',lastDirs='';
 function update(seconds){
  const raw=[trainPosition(seconds),trainPosition(seconds,54)],dirs=[Math.sign(trainPosition(seconds+.2)-raw[0])||1,Math.sign(trainPosition(seconds+54.2)-raw[1])||1],pos=raw.map(v=>MX+K*v);
  const ex=expressPosition(seconds);if(ex.x!==null)ex.x=MX+K*ex.x;express.running=ex.x!==null;express.dir=ex.dir;express.position.x=ex.x??0;dirs.push(1);   // the express items are mirrored, so its lampF always leads
  trains[0].position.x=pos[0];trains[1].position.x=pos[1];
  // The express is drawn nose-first in its direction of travel (the item list is laid out for +x).
  trainItems.forEach((it,i)=>{if(it.train===2&&!express.running)return;const r=trainRuns[it.train],x=it.train===2?ex.x+ex.dir*it.x:pos[it.train]+it.x;
   dummy.position.set(x,r.y+it.y,r.z+it.z);dummy.rotation.set(0,0,0);dummy.scale.set(it.w,it.h,it.d);dummy.updateMatrix();trainMesh.setMatrixAt(i,dummy.matrix);});
  if(!express.running)trainItems.forEach((it,i)=>{if(it.train===2)trainMesh.setMatrixAt(i,ZERO);});trainMesh.instanceMatrix.needsUpdate=true;
  const dk=dirs.join();if(dk!==lastDirs){lastDirs=dk;paintTrains(dirs);}
  petalTime.value=seconds;waterU.uWTime.value=seconds;placeBoats(seconds);
  const sak=weather.sakura.value;petals.visible=sak>.02;petalMaterial.opacity=.8*sak;hanami.visible=sak>.35;
  // Signals follow the scramble cycle; colours are re-uploaded only when a lamp changes.
  const sig=trafficLightPhase(seconds),vs=['green','amber','red'].indexOf(sig.vehicle),ps=sig.pedestrian==='green'?0:sig.pedestrian==='off'?1:2;
  if(`${vs}${ps}`!==lastSig){lastSig=`${vs}${ps}`;allLamps.forEach((l,i)=>{const on=l.role<3?l.role===vs:l.role===3?ps===0:ps===2;signals.setColorAt(i,trainColor.set(on?LAMP_ON[l.role]:LAMP_OFF));});signals.instanceColor.needsUpdate=true;}
  glowUniforms.uSig.value.set(vs,ps);
  for(let i=0;i<18;i++){const sw=Math.sin(seconds*1.2+i*.7);dummy.position.set(-40+(i%9)*2.75+sw*.07,3.08,i<9?-1:5);dummy.rotation.set(0,0,sw*.08);dummy.scale.set(.24,.34,.24);dummy.updateMatrix();lanterns.setMatrixAt(i,dummy.matrix);
   if(currentNight){const b=.8+.2*Math.sin(seconds*(1.1+hash(i,8)*.9)+i*2.1)-(hash(i,Math.floor(seconds*3))<.004?.3:0);lanterns.setColorAt(i,trainColor.copy(lanternBase[i]).multiplyScalar(b));}}
  lanterns.instanceMatrix.needsUpdate=true;if(currentNight)lanterns.instanceColor.needsUpdate=true;
  // Vehicles (pure functions of time) drive the light pools and cones; they and the roaming character scare pigeons.
  const scarers=[];for(let i=0;i<16;i++){const s=vehicleState(seconds,i);glowUniforms.uVeh.value[i].set(s.x,s.z,s.yaw,halfLen[i]);scarers.push(s);}
  if(live.focus)scarers.push(live.focus);
  skyLife.update(seconds,scarers);const b=skyLife.blimpState;glowUniforms.uBlimp.value.set(b.x,b.y,b.z,b.yaw);
  for(let t=0;t<3;t++){const run=trainRuns[t],x=t<2?pos[t]+(dirs[t]>0?1.6:-3*3.2-1.6):ex.x+ex.dir*(EXPRESS.car/2+1.6);glowUniforms.uTrain.value[t].set(x,run.y+.55,run.z,t<2||express.running?1:0);}
  glowUniforms.uTime.value=seconds;street.tick(seconds);screen.update(seconds);heroScreen.update(seconds);
 }
 update(0);
 const skyColor=new THREE.Color(),white=new THREE.Color('#ffffff');
 // Quality hook (quality.js via main.js → city.js): steam wisps per vent, critter share, blimp. Defaults change nothing.
 function setQuality({wisps=Infinity,critters=1,blimp=true}={}){skyLife.setQuality({critters,blimp});if(wisps!==qWisps){qWisps=wisps;setGlow(glowFor);}}
 return {update,setQuality,setNight(value){currentNight=value;for(const m of [mat,stoneMat,boatMat])m.color.copy(value?nightColor('walls'):white);windowMesh.visible=value;street.setNight(value);
   if(!value){lanternBase.forEach((c,i)=>lanterns.setColorAt(i,c));lanterns.instanceColor.needsUpdate=true;}lastDirs='';
   // Skyline values swap per layer; crowns keep the colour of their own layer.
   skyItems.forEach((s,i)=>{const layer=SKYLINE.day.indexOf(s.color);skyMesh.setColorAt(i,skyColor.set(value?SKYLINE.night[layer]:s.color));});skyMesh.instanceColor.needsUpdate=true;},
  root,river,boats:boatMesh,hanami,canal,trains,express,trainMesh,street,skyline:skyMesh,sky:skyLife,glow,screen,heroScreen,screenMesh,signals,get heroes(){return heroesOn?heroes.length:0;},
  addLightPool:street.addLightPool,clearLightPools:street.clearLightPools,
  stats:()=>({glow:glowGeo.instanceCount,vents:ventCount,trains:trainItems.length,heroes:heroesOn?heroes.length:0,...skyLife.stats()}),
  dispose(){live.subs.delete(onWorld);}};
}
