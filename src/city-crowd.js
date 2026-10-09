import * as THREE from 'three';
import {toon,toonify} from './toon.js';
import {districts} from './city-state.js';
import {cityLayout,sidewalkSides} from './lots.js';
import {crowdLook} from './crowd-gpu.js';
import {STRIDE} from './motion.js';
const WALK_CYCLE=4/3;   // seconds of one Walk loop in anims.glb

const mod=(n,d)=>((n%d)+d)%d;
// A repeating all-pedestrian phase. Each crossing finishes before traffic resumes.
export function crossingState(seconds,index=0){
 const phase=mod(seconds,24),moving=phase<9;
 const t=moving?Math.min(1,Math.max(0,(phase-(index%4)*.35)/6.8)):1;
 const reverse=Math.floor(seconds/24)%2!==0;
 return {pedestrianGreen:moving,progress:reverse?1-t:t,moving:moving&&t>0&&t<1};
}
// Sidewalk walkers cluster where Tokyo crowds do (plan item 10): at crossings (waiting at the kerb), in front of the
// konbini and at the stations (the Shibuya scramble and Shinjuku), with a few roaming; never evenly spaced. Each walker
// gets a hashed hotspot, dwells there for part of a hashed cycle, walks a short way along the sidewalk and comes back.
const h01=(...v)=>{let x=2166136261;for(const n of v){x=Math.imul(x^(Math.round(n*977)|0),16777619);x^=x>>>13;}x=Math.imul(x,1540483477);x^=x>>>15;return (x>>>0)/4294967296;};
let hotspotCache=null;
export function crowdHotspots(){
 if(hotspotCache)return hotspotCache;
 const spots=[],lane=(d,s)=>d.z+s*(sidewalkSides(d.id).includes(s)?2.7:2.95);
 for(const d of districts){
  // Zebra kerbs: at both boulevard ends of the district street, people wait facing the street.
  for(const end of [-1,1])for(const s of [-1,1])spots.push({kind:'crossing',x:d.x+end*11.2,z:lane(d,s),s,dir:-end,range:5,w:2.2});
  if([-29,29].includes(d.x)&&[-28,2,32].includes(d.z))for(const s of [-1,1])spots.push({kind:'crossing',x:d.x+.9*s,z:lane(d,s),s,dir:s,range:6,w:1.6});
 }
 for(const lot of cityLayout([]).lots.filter(l=>l.shop==='konbini')){const s=lot.front==='+z'?-1:1,d=districts.find(d=>d.id===lot.district);
  spots.push({kind:'konbini',x:lot.x,z:lane(d,s),s,dir:lot.x<d.x?1:-1,range:4,w:lot.width*.8});}
 for(const [id,dx] of [['shibuya',-6.5],['shibuya',6.5],['shinjuku',-4],['shinjuku',5]]){const d=districts.find(d=>d.id===id);
  for(const s of [-1,1])spots.push({kind:'station',x:d.x+dx,z:lane(d,s),s,dir:-Math.sign(dx),range:6,w:2.6});}
 return hotspotCache=spots;
}
const HOTSPOT_WEIGHTS=[['crossing',.45],['konbini',.25],['station',.2],['roam',.1]];
export function sidewalkState(seconds,index){
 const spots=crowdHotspots(),r=k=>h01(index,k);
 let x=r(1),kind='roam';for(const [k,w] of HOTSPOT_WEIGHTS)if((x-=w)<0){kind=k;break;}
 const pool=kind==='roam'?null:spots.filter(s=>s.kind===kind);
 let spot=pool?.length?pool[Math.floor(r(2)*pool.length)]:null;
 if(!spot){const d=districts[Math.floor(r(3)*districts.length)],s=r(4)<.5?-1:1;const x0=d.x+(r(5)-.5)*12;spot={x:x0,z:d.z+s*2.8,s,dir:x0>d.x?-1:1,range:6,w:2};}
 const speed=.6+r(7)*.4,ax=spot.x+(r(8)-.5)*spot.w,az=spot.z+(r(9)-.5)*.45,L=spot.range*(.5+r(10)*.5),walk=L/speed;
 const dwell=kind==='roam'?2+r(11)*3:6+r(11)*14,back=2+r(12)*4,T=dwell+walk+back+walk,u=mod(seconds+r(13)*T,T),dir=spot.dir;
 const facing=spot.s<0?0:Math.PI;   // waiting: face the street
 if(u<dwell)return {x:ax,z:az,yaw:facing+(r(14)-.5)*.8,moving:false,speed};
 if(u<dwell+walk){const t=(u-dwell)*speed;return {x:ax+dir*t,z:az,yaw:dir*Math.PI/2,moving:true,speed};}
 if(u<dwell+walk+back)return {x:ax+dir*L,z:az,yaw:facing+(r(15)-.5)*1.2,moving:false,speed};
 const t=(u-dwell-walk-back)*speed;return {x:ax+dir*(L-t),z:az,yaw:-dir*Math.PI/2,moving:true,speed};
}
// Pedestrians: box figures from afar; up close (gpu.active) the same people as rigged characters through crowd-gpu.js.
// Each has a stable look from the creator's vocabulary (seeded by index), so the far boxes wear the near characters' colours.
export const CROWD_COUNT={desktop:160,mobile:80},CROSSERS=16;
export function addCityCrowd(parent,{mobile=false,lookOptions=null}={}){
 const root=new THREE.Group();root.name='Tokyo street life';parent.add(root);
 const count=mobile?CROWD_COUNT.mobile:CROWD_COUNT.desktop,headsCount=count;
 const boxes=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),toon({roughness:.85}),count*14);
 const heads=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),boxes.material,headsCount);
 boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 // Explicit bounds cover complete routes, so animated instances do not vanish at the initial position.
 boxes.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,2),110);heads.boundingSphere=boxes.boundingSphere.clone();root.add(boxes,heads);
 const dummy=new THREE.Object3D(),v=new THREE.Vector3(),actor=new THREE.Object3D(),q=new THREE.Quaternion(),xAxis=new THREE.Vector3(1,0,0),color=new THREE.Color();
 const people=Array.from({length:count},(_,i)=>({index:i,look:null,height:.9+(i%4)*.05,style:i%4,phase:(i*.618)%1}));
 function part(mesh,index,x,y,z,w,h,d,angle=0){
  v.set(x,y,z).applyQuaternion(actor.quaternion).multiplyScalar(actor.scale.x).add(actor.position);dummy.position.copy(v);
  q.setFromAxisAngle(xAxis,angle);dummy.quaternion.copy(actor.quaternion).multiply(q);dummy.scale.set(w,h,d).multiplyScalar(actor.scale.x);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
 }
 // Looks (and the box palette) are set once, again only if the server's look options arrive.
 function setLookOptions(options){
  for(const p of people){p.look=crowdLook(7919*(p.index+1),options);const {top,bottom,skin,hair}=p.look;let n=p.index*14;
   for(const c of [top,top,bottom,bottom,skin,skin,bottom,bottom,bottom,bottom,'#263342','#263342',p.style===2?'#bdb086':top,hair])boxes.setColorAt(n++,color.set(c));heads.setColorAt(p.index,color.set(skin));}
  boxes.instanceColor.needsUpdate=true;heads.instanceColor.needsUpdate=true;
 }
 setLookOptions(lookOptions);
 const state=(i,seconds)=>{
  if(i<CROSSERS){const c=crossingState(seconds,i),side=i%2?1:-1,lane=(Math.floor(i/2)%4-1.5)*.38;
   return {x:29+side*(-4.2+8.4*c.progress),z:2+(i%4<2?side*(-4.2+8.4*c.progress):lane),yaw:Math.atan2(side,i%4<2?side:0)+(Math.floor(seconds/24)%2?Math.PI:0),moving:c.moving,speed:i%4<2?1.75:1.24};}
  return sidewalkState(seconds,i-CROSSERS);};
 // gpu: crowd-gpu.js; when gpu.active the boxes are hidden and every pedestrian is pushed as a character instead.
 function update(seconds,gpu=null){
  const near=!!gpu?.active;boxes.visible=heads.visible=!near;
  if(near){for(const p of people){const s=state(p.index,seconds),scale=.92+p.height*.12;
   // Walk rate from the distance covered (STRIDE metres per cycle at scale 1), so feet keep pace with the street.
   gpu.push(p.look,s.x,.24,s.z,s.yaw,{clip:s.moving?'Walk':'Idle',rate:s.moving?s.speed*WALK_CYCLE/(STRIDE*scale):.8+p.phase*.4,phase:p.phase,scale});}return;}
  for(const p of people){
   const i=p.index,s=state(i,seconds);
   const stride=s.moving?Math.sin(seconds*7.2+i)*.58:0,bob=s.moving?Math.abs(Math.sin(seconds*7.2+i))*.045:0;
   actor.position.set(s.x,.24+bob,s.z);actor.rotation.set(0,s.yaw,0);actor.scale.setScalar(p.height);actor.updateMatrix();let n=i*14;
   const put=(...args)=>part(boxes,n++,...args);
   put(0,1.08,0,.45,.57,.28);put(0,1.37,0,.5,.14,.3);
   // Opposed arm/leg swing, bent knees and separate shoes rather than rigid sliding figures.
   const armAngle=side=>s.moving?-side*stride:p.style===0?-.9:p.style===1&&side===-1?-2.3+Math.sin(seconds*2+i)*.16:0;
   for(const side of [-1,1]){const a=armAngle(side);put(side*.31,1.3-Math.cos(a)*.2,Math.sin(a)*-.2,.13,.4,.15,a);}
   for(const side of [-1,1]){const a=armAngle(side);put(side*.32,1.3-Math.cos(a)*.46,Math.sin(a)*-.46,.11,.27,.12,a);}
   for(const side of [-1,1])put(side*.13,.62,Math.sin(side*stride)*.2,.17,.4,.2,side*stride);
   for(const side of [-1,1])put(side*.13,.28,Math.sin(side*stride)*.33,.15,.32,.17,side*stride*.8);
   for(const side of [-1,1])put(side*.13,.09,.07+Math.sin(side*stride)*.4,.18,.13,.32);
   put(0,1.11,-.2,p.style===2?.35:.18,.4,.16);put(0,1.68,-.015,.33,p.style===1?.22:.12,.31);
   part(heads,i,0,1.56,.01,.19,.23,.19);
  }
  boxes.instanceMatrix.needsUpdate=true;heads.instanceMatrix.needsUpdate=true;
 }
 update(0);return {root,people,boxes,heads,update,setLookOptions};
}
