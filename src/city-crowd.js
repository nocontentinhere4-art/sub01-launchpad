import * as THREE from 'three';
import {toon,night as nightAmount,weather as wx} from './toon.js';
import {CITY_EXTENT} from './city-state.js';
import {crowdLook,UMBRELLA_COLORS} from './crowd-gpu.js';
import {STRIDE} from './motion.js';
import {createPopulation,POSE} from './npc.js';
import {streetQuality} from './street-graph.js';
const WALK_CYCLE=4/3;   // seconds of one Walk loop in anims.glb

const mod=(n,d)=>((n%d)+d)%d;
// The Shibuya scramble's all-pedestrian phase (main.js's crossing chirp, city-life.js). Same 24 s cycle as the
// signals in street-graph.js (mid-block role, offset 0) and city-traffic.js's trafficLightPhase.
export function crossingState(seconds,index=0){
 const phase=mod(seconds,24),moving=phase<9;
 const t=moving?Math.min(1,Math.max(0,(phase-(index%4)*.35)/6.8)):1;
 const reverse=Math.floor(seconds/24)%2!==0;
 return {pedestrianGreen:moving,progress:reverse?1-t:t,moving:moving&&t>0&&t<1};
}
// Pedestrians (wave 4C): agents with homes, schedules and destinations (npc.js on street-graph.js). Far away they are box
// figures (17 boxes each with the head, one batch: an umbrella canopy and stick are two of the boxes, flat when dry); up close
// (gpu.active) the same people are pushed to the GPU crowd (crowd-gpu.js), which draws their umbrellas in one more batch.
export const CROWD_COUNT={desktop:240,mobile:120},PARTS=17;   // ~45% are indoors at any time
export function addCityCrowd(parent,{mobile=false,lookOptions=null,seed=1,hour=null}={}){
 const root=new THREE.Group();root.name='Tokyo street life';parent.add(root);
 const count=mobile?CROWD_COUNT.mobile:CROWD_COUNT.desktop,pop=createPopulation({count,seed,hour});
 const boxes=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),toon({roughness:.85}),count*PARTS);
 boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 // Explicit bounds cover the whole city, so moving instances never vanish at their initial position.
 const E=CITY_EXTENT,cx=(E.minX+E.maxX)/2,cz=(E.minZ+E.maxZ)/2;
 boxes.boundingSphere=new THREE.Sphere(new THREE.Vector3(cx,1,cz),Math.hypot(E.maxX-E.minX,E.maxZ-E.minZ)/2+12);root.add(boxes);
 const color=new THREE.Color(),people=pop.agents.map((a,i)=>({index:i,agent:a,look:null,height:.9+(i%4)*.05,style:i%4,phase:(i*.618)%1,umbrella:Math.floor(((i*2654435761)>>>0)/4294967296*UMBRELLA_COLORS.length),drawn:true}));
 // Looks (and the box palette) are set once, again only if the server's look options arrive.
 function setLookOptions(options){
  for(const p of people){p.look=crowdLook(7919*(p.index+1),options);const {top,bottom,skin,hair}=p.look;let n=p.index*PARTS;
   for(const c of [top,top,bottom,bottom,skin,skin,bottom,bottom,bottom,bottom,'#263342','#263342',p.style===2?'#bdb086':top,hair,UMBRELLA_COLORS[p.umbrella],'#3a3f44',skin])boxes.setColorAt(n++,color.set(c));}
  boxes.instanceColor.needsUpdate=true;
 }
 setLookOptions(lookOptions);
 // Box parts written straight into the instance matrices: T(actor)·Ry(yaw)·S(k) · T(local)·Rx(a)·S(w,h,d) (+ an extra yaw ry).
 const B=boxes.instanceMatrix.array;let X=0,Y=0,Z=0,cy=1,sy=0,K=1,YAW=0;
 function put(arr,idx,lx,ly,lz,w,h,d,a=0,ry=0){
  const c=ry?Math.cos(YAW+ry):cy,s=ry?Math.sin(YAW+ry):sy,ca=Math.cos(a),sa=Math.sin(a),o=idx*16;
  arr[o]=c*w*K;arr[o+1]=0;arr[o+2]=-s*w*K;arr[o+3]=0;
  arr[o+4]=s*sa*h*K;arr[o+5]=ca*h*K;arr[o+6]=c*sa*h*K;arr[o+7]=0;
  arr[o+8]=s*ca*d*K;arr[o+9]=-sa*d*K;arr[o+10]=c*ca*d*K;arr[o+11]=0;
  arr[o+12]=X+K*(cy*lx+sy*lz);arr[o+13]=Y+K*ly;arr[o+14]=Z+K*(-sy*lx+cy*lz);arr[o+15]=1;
 }
 const zero=(arr,from,n)=>arr.fill(0,from*16,(from+n)*16);
 function drawBoxes(p,seconds){
  const a=p.agent,i=p.index,n=i*PARTS;
  if(!a.visible){if(p.drawn){zero(B,n,PARTS);p.drawn=false;}return;}
  p.drawn=true;const moving=a.moving,sit=a.pose===POSE.sit,stride=moving?Math.sin(seconds*7.2+i)*.58:0,bob=moving?Math.abs(Math.sin(seconds*7.2+i))*.045:0;
  X=a.x;Y=.24+bob;Z=a.z;YAW=a.yaw;cy=Math.cos(YAW);sy=Math.sin(YAW);K=p.height;
  const dy=sit?-.38:0,um=a.umbrella;
  put(B,n,0,1.08+dy,0,.45,.57,.28);put(B,n+1,0,1.37+dy,0,.5,.14,.3);
  // Opposed arm/leg swing, bent knees and separate shoes; the umbrella hand is raised.
  const armAngle=side=>um&&side===1?-2.45:moving?-side*stride:p.style===0?-.9:p.style===1&&side===-1?-2.3+Math.sin(seconds*2+i)*.16:0;
  for(const side of [-1,1]){const r=armAngle(side);put(B,n+(side<0?2:3),side*.31,1.3+dy-Math.cos(r)*.2,Math.sin(r)*-.2,.13,.4,.15,r);put(B,n+(side<0?4:5),side*.32,1.3+dy-Math.cos(r)*.46,Math.sin(r)*-.46,.11,.27,.12,r);}
  if(sit)for(const side of [-1,1]){const k=side<0?0:1;put(B,n+6+k,side*.13,.46,.2,.17,.4,.2,Math.PI/2);put(B,n+8+k,side*.13,.26,.4,.15,.32,.17);put(B,n+10+k,side*.13,.09,.47,.18,.13,.32);}
  else for(const side of [-1,1]){const k=side<0?0:1;put(B,n+6+k,side*.13,.62,Math.sin(side*stride)*.2,.17,.4,.2,side*stride);put(B,n+8+k,side*.13,.28,Math.sin(side*stride)*.33,.15,.32,.17,side*stride*.8);put(B,n+10+k,side*.13,.09,.07+Math.sin(side*stride)*.4,.18,.13,.32);}
  put(B,n+12,0,1.11+dy,-.2,p.style===2?.35:.18,.4,.16);put(B,n+13,0,1.68+dy,-.015,.33,p.style===1?.22:.12,.31);
  if(um){put(B,n+14,.12,2.12+dy,.22,.95,.07,.95,-.12,Math.PI/4);put(B,n+15,.22,1.82+dy,.32,.035,.6,.035);}else zero(B,n+14,2);
  put(B,n+16,0,1.56+dy,.01,.31,.36,.31,0,Math.PI/4);   // the head: a turned box (one batch with the body)
 }
 const opts={clip:'Idle',rate:1,phase:0,scale:1,umbrella:-1};
 let last=null,hourAt=-1,forcedRain=null,stats={ms:0,visible:0,frames:0};
 // gpu: crowd-gpu.js; when gpu.active the boxes are hidden and every visible pedestrian is pushed as a character instead.
 function update(seconds,gpu=null){
  const t0=typeof performance!=='undefined'?performance.now():0;
  const dt=last===null?0:seconds-last;last=seconds;
  if(seconds-hourAt>2||seconds<hourAt){hourAt=seconds;pop.autoHour(nightAmount.value);
   // Quality: the GPU crowd's runtime cap says how heavy the street can be (lite 0, low 48 → fewer people out).
   const cap=gpu?.limits?.cap;if(cap!==undefined){pop.setScale(cap===0?.5:cap<=48?.7:1);streetQuality.tier=cap===0?0:cap<=48?1:cap<=96?2:3;}}
  pop.setRain(forcedRain??wx.wet.value>.5);
  pop.update(dt,seconds);
  const near=!!gpu?.active;boxes.visible=!near;let vis=0;
  if(near){for(const p of people){const a=p.agent;if(!a.visible)continue;vis++;const scale=.92+p.height*.12;
    // Walk rate from the distance covered (STRIDE metres per cycle at scale 1), so feet keep pace with the street.
    opts.clip=a.moving?'Walk':'Idle';opts.rate=a.moving?a.speed*WALK_CYCLE/(STRIDE*scale):.8+p.phase*.4;opts.phase=p.phase;opts.scale=scale;opts.umbrella=a.umbrella?p.umbrella:-1;
    // Seated people sink to the bench (no sitting clip in the shared rig: the bench hides the legs).
    gpu.push(p.look,a.x,a.pose===POSE.sit?-.08:.24,a.z,a.yaw,opts);}}
  else{for(const p of people){drawBoxes(p,seconds);if(p.agent.visible)vis++;}boxes.instanceMatrix.needsUpdate=true;}
  if(t0){const ms=performance.now()-t0;stats.ms=stats.frames?stats.ms*.95+ms*.05:ms;stats.frames++;stats.last=ms;}
  stats.visible=vis;
 }
 update(0);
 const api={root,people,boxes,update,setLookOptions,population:pop,
  // Tokyo hour (0–24) for the schedules; null = the real Tokyo clock (kept on the drawn side of day/night).
  setHour:h=>pop.setHour(h),
  // 'rain' | 'storm' → umbrellas; other states fold them; null = follow toon.js's wet-street amount.
  setWeather(state){forcedRain=state===null||state===undefined?null:state==='rain'||state==='storm';},
  get stats(){return {...stats,...pop.counts()};}};
 if(typeof window!=='undefined')(window.__streetLife||={}).crowd=api;
 return api;
}
