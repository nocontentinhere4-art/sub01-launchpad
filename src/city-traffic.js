import * as THREE from 'three';
import {streetWorld,pointAt,vehicleLight,h01,streetQuality} from './street-graph.js';
import {districts} from './city-state.js';
import {TYPES,PAINTS,createVehicleMeshes,vehicleTime} from './vehicles.js';
// Tokyo traffic (wave 4C): real low-poly vehicles (vehicles.js) on the left-hand lanes of street-graph.js. Each car
// follows the one ahead with the Intelligent Driver Model, stops at red (the junction lights and the mid-block zebras),
// gets into a junction only when no conflicting movement is in it, the exit lane has room and nobody is on the crosswalk
// it turns across, blinks before turning, sometimes parks in a free coin-parking bay (and reverses out later); taxis pull
// over at the kerb; buses run a fixed loop of left turns and stop at the bus stops. Cars enter and leave at the city
// edges. ≈ 0.6 vehicles per district, capped by quality tier. Night lamps glow from the same batches.

// Scramble signals (tested): vehicles see red while people cross, green while they drive, amber for the last 2.5 s;
// the pedestrian light blinks green for the last 2 s of its phase, as Tokyo's do. Same 24 s cycle as crossingState and
// the mid-block role of street-graph.js (Shibuya keeps offset 0, so city-life.js's signal heads match).
export function trafficLightPhase(seconds){
 const phase=((seconds%24)+24)%24;
 return {vehicle:phase<9?'red':phase<21.5?'green':'amber',pedestrian:phase<7?'green':phase<9?(Math.floor(phase*4)%2?'off':'green'):'red',phase};
}
// The fleet: buses first (they never leave), then a hashed mix: taxis, sedans, kei cars, vans, kei trucks, scooters.
export const PER_DISTRICT=.6,FLEET_CAP={desktop:[10,16,24,40],mobile:[6,10,16,24]};
const MIX=[['taxi',27],['sedan',24],['kei',15],['van',10],['keitruck',12],['scooter',12]];
export function fleetPlan(n=districts.length){
 const total=Math.max(8,Math.round(n*PER_DISTRICT)),buses=Math.max(1,Math.round(n/24)),out=[];
 for(let i=0;i<buses;i++)out.push('bus');
 const sum=MIX.reduce((s,[,w])=>s+w,0);for(let i=buses;i<total;i++){let x=h01(i,61)*sum;out.push((MIX.find(([,w])=>(x-=w)<0)||MIX[0])[0]);}
 return out;
}
export const VEHICLE_KINDS=fleetPlan();
// city-life.js reads the first 16 vehicles each frame (night light pools and cones, pigeons): the live sim when one exists.
let live=null;const away={x:1e4,z:1e4,yaw:0,moving:false};
export function vehicleState(seconds,index){const v=live?.vehicles[index];return v&&v.on?v.view:away;}
// Quality hook (main.js may call it; city-crowd.js otherwise sets streetQuality.tier from the GPU crowd's cap).
export function setTrafficQuality(tier){streetQuality.tier=Math.max(0,Math.min(3,tier|0));}

const A_MAX=1.4,B_COMF=2.2,S0=.8,T_GAP=.9,V_STREET=2.8,V_BLVD=3.4,V_TURN=1.9,V_PARK=.9,Y=.19;
export function addCityTraffic(parent,{world=streetWorld(),mobile=typeof matchMedia!=='undefined'&&matchMedia('(max-width:600px)').matches,seed=7,kinds=VEHICLE_KINDS,onEvent=null}={}){
 const root=new THREE.Group();root.name='Tokyo traffic';parent.add(root);
 const {links,bays,junctions,entries}=world.roads,g=world.graph,signals=world.signals;
 let st=(seed*2654435761)>>>0;const rnd=()=>{st=st+0x6D2B79F5|0;let t=Math.imul(st^st>>>15,1|st);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 const caps={};for(const k of kinds)caps[k]=(caps[k]||0)+1;
 const {meshes,wheels}=createVehicleMeshes(caps);for(const m of Object.values(meshes))root.add(m.mesh);root.add(wheels);
 const box=new Uint8Array(links.length),bayTaken=new Uint8Array(bays.length),color=new THREE.Color();
 // Bus loop (best scored) with its stops; when the city has no bus-stop benches, one stop per boulevard lane.
 const loop=world.roads.busLoops[0]||null,loopStops=new Map();
 if(loop){for(const id of loop.links){const L=links[id];if(L.kind!==0)continue;if(L.busStops.length)loopStops.set(id,L.busStops.map(b=>b.s));}
  if(loopStops.size<2)for(const id of loop.links){const L=links[id];if(L.kind===0&&L.axis===1&&L.len>12&&!loopStops.has(id))loopStops.set(id,[4.5]);}}   // far-side stops, just past the junction
 const vehicles=kinds.map((type,i)=>{const T=TYPES[type],pal=PAINTS[type];
  return {i,type,T,len:T.len,half:T.len/2,on:false,mode:'gone',link:-1,s:0,v:0,a:0,next:-1,lat:0,latT:0,timer:1+i*.7,bay:-1,bayNext:-1,kerbS:-1,kerbLat:0,cleared:false,boxT:-1,wait:0,
   loopIdx:0,stopDone:-1,dist:0,x:0,z:0,yaw:0,scale:1,brake:0,indL:0,indR:0,sign:type==='taxi'?1:0,v0:(.9+h01(i,62)*.2)*T.v0,blockLane:-1,blockS:0,lastLight:0,
   paint:new THREE.Color(pal[Math.floor(h01(i,63)*pal.length)]),view:{x:1e4,z:1e4,yaw:0,moving:false}};});
 const P={x:0,z:0,dx:0,dz:0};
 // Where each car tends to drift: taxis and most cars toward Shibuya / Shinjuku (the busy hubs), the rest the centre.
 const hubs=districts.filter(d=>d.id==='shibuya'||d.id==='shinjuku').map(d=>[d.x,d.z]),centre=[(world.grid.E.minX+world.grid.E.maxX)/2,(world.grid.E.minZ+world.grid.E.maxZ)/2];
 const nextGoal=v=>{if(!hubs.length||rnd()<.2){const J=junctions[Math.floor(rnd()*junctions.length)];return [J.x,J.z];}return hubs[Math.floor(rnd()*hubs.length)];};
 for(const v of vehicles)v.goal=hubs.length&&(v.type==='taxi'||h01(v.i,64)<.8)?hubs[Math.floor(h01(v.i,65)*hubs.length)]:centre;
 const cap=()=>FLEET_CAP[mobile?'mobile':'desktop'][streetQuality.tier];
 // ---------- Decisions ----------
 function decide(v,L){
  v.next=-1;v.cleared=false;v.wait=0;
  if(v.type==='bus'&&loop){v.loopIdx=(loop.links.indexOf(L.id)+1)%loop.links.length;v.next=loop.links[v.loopIdx];return;}
  if(!L.exits.length)return;   // ends at the map edge: leave
  // Straight ahead is likeliest; exits that lead toward the centre (where the city is busiest) are preferred.
  // Reached its goal: the next one (the other hub, or now and then any junction of the city).
  if(Math.hypot(L.pts[L.pts.length-2]-v.goal[0],L.pts[L.pts.length-1]-v.goal[1])<26)v.goal=nextGoal(v);
  const [ax,az]=v.goal,near=(l,k)=>Math.hypot(l.pts[k]-ax,l.pts[k+1]-az),here=near(L,L.pts.length-2);
  let sum=0;const w=L.exits.map(id=>{const T=links[id],X=links[T.to],k=(T.turn==='S'?3:T.turn==='L'?1.3:1)*(X.edgeOut?.45:1)*(near(X,X.pts.length-2)<here-1?6:1);sum+=k;return k;});
  let x=rnd()*sum;v.next=L.exits[L.exits.length-1];for(let k=0;k<w.length;k++)if((x-=w[k])<0){v.next=L.exits[k];break;}
  // Park in a free bay on this lane now and then; taxis sometimes stop at the kerb.
  // The bay is booked one lane ahead (bays sit close to the junctions), and taken when the car turns into its lane.
  if(v.bayNext>=0){if(bays[v.bayNext].lane===L.id){v.bay=v.bayNext;v.bayNext=-1;return;}bayTaken[v.bayNext]=0;v.bayNext=-1;}
  const X=links[links[v.next].to];
  if(v.type!=='bus'&&v.type!=='scooter'&&X.bays.length&&rnd()<.5){const b=X.bays.find(b=>!bayTaken[b]);if(b!==undefined){bayTaken[b]=1;v.bayNext=b;}}
  if(v.bay<0&&v.type==='taxi'&&L.axis===0&&L.len>12&&rnd()<.25){const s=4+rnd()*(L.len-9);if(!L.stops.some(t=>Math.abs(t.s-s)<5)&&!L.bays.some(b=>Math.abs(bays[b].sStart-s)<4)&&s>v.s+4){v.kerbS=s;v.kerbLat=Math.max(.5,L.kerb-.75-v.T.width/2-.05);}}
 }
 function place(v,L,s){v.link=L.id;v.s=s;v.on=true;v.mode='drive';v.lat=0;v.bay=-1;v.kerbS=-1;v.boxT=-1;v.blockLane=-1;decide(v,L);}
 // ---------- Spawning ----------
 const roomAt=(id,s,len)=>vehicles.every(u=>!u.on||u.link!==id||Math.abs(u.s-s)>(u.len+len)/2+2.5);
 function spawn(v,initial){
  if(v.type==='bus'){if(!loop)return false;const k=vehicles.filter(u=>u.type==='bus').indexOf(v),n=vehicles.filter(u=>u.type==='bus').length;
   let d=loop.length*k/n;for(const id of loop.links){const L=links[id];if(d<L.len&&L.kind===0&&roomAt(id,d,v.len)){place(v,L,Math.max(v.half,Math.min(L.len-v.half,d)));v.scale=initial?1:0;return true;}d-=L.len;}
   const L=links[loop.links[0]];if(!roomAt(L.id,v.half,v.len))return false;place(v,L,v.half);v.scale=initial?1:0;return true;}
  if(initial&&rnd()<.15){const free=bays.map((b,k)=>k).filter(k=>!bayTaken[k]);if(free.length){const b=free[Math.floor(rnd()*free.length)],B=bays[b],K=links[B.link];
   bayTaken[b]=1;v.on=true;v.mode='parked';v.bay=b;v.link=K.id;v.s=K.len;v.v=0;v.timer=5+rnd()*60;v.scale=1;return true;}}
  if(initial){for(let t=0;t<8;t++){const L=links.filter(l=>l.kind===0)[Math.floor(rnd()*links.filter(l=>l.kind===0).length)],s=v.half+rnd()*Math.max(0,L.len-v.len-6);
   if(L.len>v.len+6&&roomAt(L.id,s,v.len)&&!L.stops.some(q=>Math.abs(q.s-s)<v.len)){place(v,L,s);v.v=v.v0*V_STREET*.6;v.scale=1;return true;}}return false;}
  const id=entries[Math.floor(rnd()*entries.length)],L=links[id];if(!L||!roomAt(id,v.half+.5,v.len+5))return false;
  place(v,L,v.half+.5);v.v=v.v0*2;v.scale=0;return true;
 }
 // ---------- Following ----------
 // Gap (front bumper to the next obstacle's rear) and the obstacle's speed, along this link and the next two.
 const chain=[0,0,0],chainOff=[0,0,0];let LG=1e9,LV=0;
 function leader(v){
  const L=links[v.link];chain[0]=v.link;chainOff[0]=0;let n=1;
  if(L.kind===2){}else if(L.kind===0){if(v.next>=0){chain[1]=v.next;chainOff[1]=L.len;n=2;const T=links[v.next];chain[2]=T.kind===1?T.to:-1;chainOff[2]=L.len+T.len;if(chain[2]>=0)n=3;}}
  else{chain[1]=L.to;chainOff[1]=L.len;n=2;}
  let gap=1e9,vl=0;
  for(const u of vehicles){if(u===v||!u.on||u.mode==='gone'||u.mode==='parked')continue;
   for(let k=0;k<n;k++){let us=-1;if(u.link===chain[k]&&u.mode!=='unpark')us=u.s;else if(u.blockLane===chain[k])us=u.blockS;else continue;
    const d=chainOff[k]+us-v.s-(u.len+v.len)/2;if(k===0&&us<=v.s)continue;if(d<gap){gap=d;vl=u.blockLane===chain[k]&&u.link!==chain[k]?0:u.v;}}}
  LG=gap;LV=vl;
 }
 const idm=(v,v0,gap,vl)=>{const ss=S0+Math.max(0,v*T_GAP+v*(v-vl)/(2*Math.sqrt(A_MAX*B_COMF)));return A_MAX*(1-Math.pow(v/Math.max(v0,.01),4)-(gap<1e8?(ss/Math.max(gap,.05))**2:0));};
 // A virtual stopped obstacle so the centre stops at `centre` (S0 in front of the bumper).
 const stopGap=(v,centre)=>centre+S0-v.s;
 // ---------- Junction permission ----------
 function permit(v,seconds){
  const L=links[v.link],T=links[v.next],J=junctions[T.junction],light=vehicleLight(T.axis,seconds,J.offset);v.lastLight=light;
  if(light===2)return false;
  const front=L.len-(v.s+v.half);
  if(light===1&&(v.v*v.v/(2*B_COMF)<front-.2||v.v<1.2))return false;   // amber: stop if you comfortably can
  const stuck=v.wait>25;   // never wait for ever on a green (a rare circular wait): the exit-room rule still holds
  if(!stuck)for(const c of T.conflicts)if(box[c])return false;
  if(T.turn==='R'&&!stuck){const opp=J.approaches.find(id=>{const A=links[id];return A.dir[0]===-L.dir[0]&&A.dir[1]===-L.dir[1];});
   if(opp!==undefined)for(const u of vehicles)if(u.on&&u.link===opp&&links[opp].len-u.s<14&&u.v>.5&&(u.next<0||links[u.next].turn!=='R'))return false;}
  const X=links[T.to];let room=1e9;for(const u of vehicles)if(u.on&&u!==v&&u.link===X.id)room=Math.min(room,u.s-u.half);
  if(room<v.len+1.2)return false;
  if(T.walk>=0&&g.busy[T.walk]>0)return false;
  return true;
 }
 // ---------- Per-frame ----------
 let last=null,stats={ms:0,on:0,frames:0};
 function simulate(dt,seconds){
  const want=cap();
  for(const v of vehicles){
   if(v.i>=want){if(v.on){v.on=false;release(v);v.mode='gone';}continue;}
   if(!v.on){if((v.timer-=dt)<=0){if(!spawn(v,false))v.timer=1+rnd()*2;}continue;}
   if(v.scale<1)v.scale=Math.min(1,v.scale+dt*1.8);
   const L=links[v.link];v.brake=0;
   if(v.mode==='parked'){if((v.timer-=dt)<=0){const B=bays[v.bay],lane=links[B.lane];
     if(vehicles.every(u=>!u.on||u===v||u.link!==lane.id||u.s<B.sStart-10||u.s>B.sStart+3)){v.mode='unpark';v.blockLane=lane.id;v.blockS=B.sStart;}else v.timer=1;}
    continue;}
   if(v.mode==='unpark'){v.v=-V_PARK*.8;v.s+=v.v*dt;v.dist+=v.v*dt;if(v.s<=0){const B=bays[v.bay],lane=links[B.lane];bayTaken[v.bay]=0;v.bay=-1;v.blockLane=-1;v.link=lane.id;v.s=B.sStart;v.v=0;v.mode='drive';decide(v,lane);}continue;}
   if(v.mode==='park'){const a=idm(v.v,V_PARK,stopGap(v,L.len),0);v.v=Math.max(0,v.v+a*dt);v.s=Math.min(L.len,v.s+v.v*dt);v.dist+=v.v*dt;if(v.s>L.len*.45)v.blockLane=-1;
    if(v.s>=L.len-.05){v.mode='parked';v.v=0;v.timer=20+rnd()*70;}continue;}
   if(v.mode==='stop'||v.mode==='kerb'){v.v=0;v.brake=1;if((v.timer-=dt)<=0){
     if(v.mode==='kerb'){if(vehicles.some(u=>u.on&&u!==v&&u.link===v.link&&u.s<v.s&&u.s>v.s-7&&u.v>.3)){v.timer=.5;continue;}v.kerbS=-1;v.latT=0;}
     v.mode='drive';}continue;}
   // Driving.
   const v0=v.v0*(L.kind===1?V_TURN:L.axis===1?V_BLVD:V_STREET);leader(v);let gap=LG,vl=LV;
   let lineGap=1e9;   // stop line ahead that may not be crossed (red / no permission)
   if(L.kind===0){
    // Permission is re-checked every frame until the front is over the line (a green can turn amber, then red).
    if(v.next>=0&&v.boxT!==v.next){const front=L.len-(v.s+v.half);v.cleared=false;if(front<Math.max(12,v.v*v.v/B_COMF+4)){if(permit(v,seconds)){v.cleared=true;}else{lineGap=front-.1;if(v.v<.2)v.wait+=dt;}}}
    for(const q of L.stops){const front=q.s-(v.s+v.half);if(front<-.05)continue;const light=vehicleLight(2,seconds,signals[q.sig].offset);
     if(light===2||light===1&&(v.v*v.v/(2*B_COMF)<front-.2||v.v<1.2))lineGap=Math.min(lineGap,front-.1);break;}
    if(v.bay>=0){const B=bays[v.bay];gap=Math.min(gap,stopGap(v,B.sStart));if(v.s>B.sStart-.4&&v.v<.2){v.mode='park';v.link=B.link;v.s=0;v.blockLane=L.id;v.blockS=B.sStart;v.indL=0;continue;}}
    if(v.kerbS>=0){const d=v.kerbS-v.s;if(d<-.6){v.kerbS=-1;v.latT=0;}else{gap=Math.min(gap,stopGap(v,v.kerbS));v.latT=d<5?v.kerbLat:0;if(d<.3&&v.v<.2){v.mode='kerb';v.timer=4+rnd()*4;continue;}}}
    if(v.type==='bus'&&loopStops.has(L.id)){for(const q of loopStops.get(L.id)){if(v.stopDone===L.id*1000+Math.round(q))continue;if(q<v.s-.3)continue;gap=Math.min(gap,stopGap(v,q));
     if(v.s>q-.3&&v.v<.2){v.mode='stop';v.timer=6+rnd()*3;v.stopDone=L.id*1000+Math.round(q);}break;}}
   }
   const g2=Math.min(gap,lineGap+S0);
   let a=idm(v.v,v0,g2,g2===gap?vl:0);a=Math.max(-7,Math.min(A_MAX,a));
   v.brake=a<-.6||v.v<.05&&g2<4?1:0;
   v.v=Math.max(0,v.v+a*dt);let ds=v.v*dt;
   // Hard rule: the front never passes a stop line it may not cross.
   if(lineGap<1e8&&ds>lineGap)ds=Math.max(0,lineGap);
   const before=v.s+v.half;v.s+=ds;v.dist+=ds;
   // Front over a mid-block stop line (reported for the light-compliance test).
   if(onEvent&&L.kind===0)for(const q of L.stops)if(q.s>before&&q.s<=v.s+v.half)onEvent('mid',v,{light:vehicleLight(2,seconds,signals[q.sig].offset),sig:q.sig});
   v.lat+=(v.latT-v.lat)*Math.min(1,dt*1.6);
   // Front over the junction stop line: count the car into the box (conflicting movements wait for it).
   if(L.kind===0&&v.next>=0&&v.cleared&&v.boxT!==v.next&&v.s+v.half>=L.len){v.boxT=v.next;box[v.next]++;onEvent?.('enter',v,{turn:v.next,light:vehicleLight(links[v.next].axis,seconds,junctions[links[v.next].junction].offset)});}
   if(v.boxT>=0&&links[v.link].kind===0&&v.link===links[v.boxT].to&&v.s-v.half>0){box[v.boxT]--;v.boxT=-1;}
   // Next link.
   while(v.s>links[v.link].len){const cur=links[v.link];v.s-=cur.len;
    if(cur.kind===0){if(v.next<0){v.on=false;v.mode='gone';release(v);v.timer=2+rnd()*6;break;}v.link=v.next;v.next=-1;}
    else{const X=links[cur.to];v.link=X.id;decide(v,X);if(v.boxT>=0&&v.s-v.half>0){box[v.boxT]--;v.boxT=-1;}}}
  }
 }
 function release(v){if(v.bay>=0){bayTaken[v.bay]=0;v.bay=-1;}if(v.bayNext>=0){bayTaken[v.bayNext]=0;v.bayNext=-1;}if(v.boxT>=0){box[v.boxT]--;v.boxT=-1;}v.blockLane=-1;v.view.x=v.view.z=1e4;v.view.moving=false;}
 // ---------- Drawing ----------
 const counts={};
 function draw(seconds){
  vehicleTime.value=seconds;for(const t in meshes)counts[t]=0;let w=0;const W=wheels.instanceMatrix.array;
  for(const v of vehicles){if(!v.on)continue;const L=links[v.link];pointAt(L,v.s,P);
   const lx=P.dz,lz=-P.dx,x=P.x+lx*v.lat,z=P.z+lz*v.lat,yaw=Math.atan2(P.dx,P.dz),cy=Math.cos(yaw),sy=Math.sin(yaw),k=v.scale;
   v.x=x;v.z=z;v.yaw=yaw;v.view.x=x;v.view.z=z;v.view.yaw=yaw;v.view.moving=Math.abs(v.v)>.05;
   const M=meshes[v.type],j=counts[v.type]++,e=M.mesh.instanceMatrix.array,o=j*16;
   e[o]=cy*k;e[o+1]=0;e[o+2]=-sy*k;e[o+3]=0;e[o+4]=0;e[o+5]=k;e[o+6]=0;e[o+7]=0;e[o+8]=sy*k;e[o+9]=0;e[o+10]=cy*k;e[o+11]=0;e[o+12]=x;e[o+13]=Y;e[o+14]=z;e[o+15]=1;
   M.body.array[j*3]=v.paint.r;M.body.array[j*3+1]=v.paint.g;M.body.array[j*3+2]=v.paint.b;
   // Indicators: the turn ahead (within 22 m and through the junction), hazards while stopped at the kerb or a bus stop.
   let il=0,ir=0;const T=v.next>=0?links[v.next]:L.kind===1?L:null;
   if(v.mode==='kerb'||v.mode==='stop'||v.mode==='unpark'||v.mode==='park')il=ir=1;
   else if(T&&T.turn&&(L.kind===1||L.len-v.s<22)){il=T.turn==='L'?1:0;ir=T.turn==='R'?1:0;}
   else if(v.kerbS>=0&&v.kerbS-v.s<12)il=1;
   M.lamp.array[j*4]=il;M.lamp.array[j*4+1]=ir;M.lamp.array[j*4+2]=v.brake;M.lamp.array[j*4+3]=v.sign;
   const t=v.T,ang=v.dist/t.r,ca=Math.cos(ang),sa=Math.sin(ang);
   for(let h=0;h<t.wheels.length;h++){const wx=t.wheels[h][0],wz=t.wheels[h][1],q=w*16;
    W[q]=cy*t.tw*k;W[q+1]=0;W[q+2]=-sy*t.tw*k;W[q+3]=0;W[q+4]=sy*sa*t.r*k;W[q+5]=ca*t.r*k;W[q+6]=cy*sa*t.r*k;W[q+7]=0;W[q+8]=sy*ca*t.r*k;W[q+9]=-sa*t.r*k;W[q+10]=cy*ca*t.r*k;W[q+11]=0;
    W[q+12]=x+k*(cy*wx+sy*wz);W[q+13]=Y+t.r*k;W[q+14]=z+k*(-sy*wx+cy*wz);W[q+15]=1;w++;}
  }
  let calls=0;
  for(const t in meshes){const M=meshes[t],n=counts[t];M.mesh.count=n;M.mesh.visible=n>0;if(!n)continue;calls++;
   upload(M.mesh.instanceMatrix,n*16);upload(M.body,n*3);upload(M.lamp,n*4);}
  wheels.count=w;wheels.visible=w>0;if(w){calls++;wheels.instanceMatrix.clearUpdateRanges();wheels.instanceMatrix.addUpdateRange(0,w*16);wheels.instanceMatrix.needsUpdate=true;}
  stats.drawCalls=calls;
 }
 function upload(a,n){a.clearUpdateRanges();a.addUpdateRange(0,n);a.needsUpdate=true;}
 function update(seconds){
  const t0=typeof performance!=='undefined'?performance.now():0,dt=last===null?0:Math.max(0,Math.min(.1,seconds-last));last=seconds;
  simulate(dt,seconds);draw(seconds);
  if(t0){const ms=performance.now()-t0;stats.ms=stats.frames?stats.ms*.95+ms*.05:ms;stats.last=ms;stats.frames++;}
  let on=0;for(const v of vehicles)if(v.on)on++;stats.on=on;
 }
 for(const v of vehicles)if(v.i<cap()&&!spawn(v,true))v.timer=rnd()*4;
 update(0);
 const api={root,vehicles,meshes,wheels,update,world,simulate,draw,loop,
  setQuality(q){setTrafficQuality(q?.level??q);},
  get stats(){return {...stats,parked:vehicles.filter(v=>v.mode==='parked').length,kinds:Object.fromEntries(Object.entries(counts))};}};
 live=api;if(typeof window!=='undefined')(window.__streetLife||={}).traffic=api;
 return api;
}
