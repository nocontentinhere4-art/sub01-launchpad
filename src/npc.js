// Pedestrian agents (wave 4C). Pure (no three.js): city-crowd.js draws what this module decides.
// Every walker lives somewhere (a residential door, weighted by district density: high-rise 1, mid .7, low .4, outer
// ring a third of that) and follows a schedule by Tokyo hour: commute to a station or the city edge in the morning,
// shops / konbini / ramen at midday, ramen, the lantern street and izakaya in the evening, home at night (night owls end
// up in Shibuya and Shinjuku). They walk the street graph (street-graph.js) at their own speed keeping left, wait for
// the walk light at every crossing (spread along the kerb), go inside for 20–90 s, sit on bus-stop benches and by the
// canal, stop at vending machines, look in shop windows; a quarter walk in groups of 2–3. A tile grid (0.5 m) keeps
// two people from standing in the same place; spawns happen only through doors and the map edge.
// Time-sliced: ≤ THINK_PER_FRAME decisions and ≤ PLANS_PER_FRAME uncached A* searches per frame; no per-frame allocation.
import {streetWorld,route,edgeBetween,walkWindow,walkLit,ACT,h01,districtDensity} from './street-graph.js';
import {districts} from './city-state.js';
import {CATEGORY} from './lots.js';

export const STATE={home:0,inside:1,walk:2,wait:3,idle:4};
export const POSE={walk:0,idle:1,sit:2};
export const THINK_PER_FRAME=12,PLANS_PER_FRAME=3,TILE=.5;
// Destinations by Tokyo hour: `out` is the share of people outdoors, `go` the purposes and weights.
export const SCHEDULE=[
 {from:0,to:5,out:.12,go:[[ACT.konbini,4],[ACT.noren,3],[ACT.vending,2],[ACT.home,5]]},
 {from:5,to:9,out:.55,go:[[ACT.station,6],[ACT.edge,3],[ACT.office,3],[ACT.konbini,2],[ACT.vending,1]]},
 {from:9,to:11,out:.6,go:[[ACT.office,3],[ACT.shop,3],[ACT.window,2],[ACT.konbini,2],[ACT.vending,1],[ACT.bench,1],[ACT.shrine,1]]},
 {from:11,to:14,out:.85,go:[[ACT.noren,5],[ACT.konbini,3],[ACT.shop,2],[ACT.window,2],[ACT.bench,1],[ACT.park,1]]},
 {from:14,to:17,out:.75,go:[[ACT.shop,4],[ACT.window,3],[ACT.konbini,2],[ACT.bench,2],[ACT.vending,1],[ACT.canal,1],[ACT.park,1],[ACT.shrine,1]]},
 {from:17,to:20,out:1,go:[[ACT.station,4],[ACT.noren,4],[ACT.lantern,2],[ACT.konbini,2],[ACT.shop,2],[ACT.edge,1],[ACT.home,2]]},
 {from:20,to:24,out:.6,go:[[ACT.noren,5],[ACT.lantern,3],[ACT.konbini,2],[ACT.station,1],[ACT.home,3]]},
];
export const scheduleAt=h=>{h=((h%24)+24)%24;return SCHEDULE.find(b=>h>=b.from&&h<b.to)||SCHEDULE[0];};
export const isNightHour=h=>{h=((h%24)+24)%24;return h>=21||h<5;};
// Where people go, per district and hour: density by day; at night Shibuya and Shinjuku keep their crowds.
export function districtPull(d,hour){
 const base=districtDensity(d),hub=d.id==='shibuya'||d.id==='shinjuku';
 if(!isNightHour(hour))return hub?5:CATEGORY[d.id]==='neon'?base*1.6:base;
 return hub?6:CATEGORY[d.id]==='neon'?base*1.4:base*.25;
}
// Tokyo hour from a timestamp (UTC+9), kept on the side of day or night the city is drawn in (main.js may force night).
export function tokyoHour(ms,night=null){let h=((ms/36e5+9)%24+24)%24;
 if(night!==null){const dark=h<5.5||h>=18.5;if(night>.5&&!dark)h=22;else if(night<.5&&dark)h=13;}return h;}
// Dwell times (seconds) per activity.
const DWELL={[ACT.shop]:[20,90],[ACT.konbini]:[20,60],[ACT.noren]:[40,90],[ACT.office]:[45,90],[ACT.station]:[30,90],[ACT.edge]:[30,120],
 [ACT.window]:[6,15],[ACT.vending]:[3,6],[ACT.bench]:[20,60],[ACT.canal]:[25,70],[ACT.park]:[15,40],[ACT.shrine]:[8,20],[ACT.lantern]:[4,9],[ACT.home]:[25,70]};
const HIDES=new Set([ACT.home,ACT.shop,ACT.office,ACT.konbini,ACT.noren,ACT.station,ACT.edge]);
const SITS=new Set([ACT.bench]);   // canal: standing at the railing

export function createPopulation({count=160,seed=1,world=streetWorld(),hour=null}={}){
 const g=world.graph,N=count,agents=[];
 // One seeded stream for every decision (deterministic for a seed and a call order).
 let st=(seed*2654435761)>>>0;const rnd=()=>{st=st+0x6D2B79F5|0;let t=Math.imul(st^st>>>15,1|st);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 // Homes: residential doors weighted by their district's density.
 const homes=g.pois[ACT.home].length?g.pois[ACT.home]:g.pois[ACT.shop];
 const homeW=homes.map(k=>g.district[k]>=0?districtDensity(districts[g.district[k]]):.2),homeSum=homeW.reduce((a,b)=>a+b,0);
 const pickHome=r=>{let x=r*homeSum;for(let k=0;k<homes.length;k++)if((x-=homeW[k])<0)return homes[k];return homes.at(-1);};
 for(let i=0;i<N;i++){
  const a={i,leader:-1,followers:[],slot:0,home:0,speed:.78+h01(seed,i,1)*.45,state:STATE.home,timer:h01(seed,i,2)*25,node:0,
   path:null,pi:0,s:0,e:-1,L:1,ax:0,az:0,ux:1,uz:0,lat:0,latT:0,latSign:1,crossLat:0,x:0,z:0,yaw:0,visible:false,pose:POSE.idle,moving:false,
   act:0,dest:-1,waitKey:-1,waitBit:0,waitDelay:0,blockT:0,ghostT:0,think:false,queued:false,umbrella:false,lastTile:-1,after:-1,wx:0,wz:0,faceYaw:0,busyEdge:-1};
  agents.push(a);
 }
 // Groups of 2–3 (a quarter of everyone): followers share the leader's home and mirror its plans.
 for(let i=0;i<N;){const a=agents[i];a.home=pickHome(h01(seed,i,3));a.node=a.home;
  if(h01(seed,i,4)<.14&&i+1<N){const size=h01(seed,i,5)<.3&&i+2<N?3:2;for(let k=1;k<size;k++){const f=agents[i+k];f.leader=i;f.slot=k;f.home=a.home;f.node=a.home;f.speed=a.speed;a.followers.push(i+k);}i+=size;}
  else i++;}
 // ---------- Tile occupancy (open addressing, stamped: no clearing) ----------
 const HS=4096,hKey=new Int32Array(HS),hVal=new Int16Array(HS),hStamp=new Uint32Array(HS);let stamp=1;
 const tileKey=(x,z)=>((Math.floor(x/TILE)+4096)*8192+(Math.floor(z/TILE)+4096))|0;
 const slotOf=k=>{let h=Math.imul(k,2654435761)>>>20;while(hStamp[h]===stamp&&hKey[h]!==k)h=(h+1)&(HS-1);return h;};
 const occupant=(x,z)=>{const k=tileKey(x,z),h=slotOf(k);return hStamp[h]===stamp?hVal[h]:-1;};
 const occupy=(x,z,i)=>{const k=tileKey(x,z),h=slotOf(k);if(hStamp[h]!==stamp){hStamp[h]=stamp;hKey[h]=k;hVal[h]=i;}};
 const groupOf=a=>a.leader>=0?a.leader:a.i;
 // Spawns: nobody else (of another group) within r — two people that far apart can never share a 0.5 m tile.
 const clearAround=(x,z,a,r)=>{for(const b of agents)if(b.visible&&groupOf(b)!==groupOf(a)&&(b.x-x)**2+(b.z-z)**2<r*r)return false;return true;};
 const freeFor=(x,z,a)=>{const o=occupant(x,z);return o<0||o===a.i||groupOf(agents[o])===groupOf(a);};
 // ---------- Wait slots at kerbs: bitmask per (crossing, direction) ----------
 const waits=new Map(),SLOTS=[[0,0],[.75,0],[-.75,0],[1.5,0],[-1.5,0],[.38,.6],[-.38,.6],[1.13,.6],[-1.13,.6],[2.25,0],[-2.25,0]];
 // ---------- Population control ----------
 let hourOverride=hour,autoH=tokyoHour(Date.now()),scale=1,rain=false,clock=0;
 const H=()=>hourOverride??autoH;
 const outCount=()=>{let n=0;for(const a of agents)if(a.state!==STATE.home)n++;return n;};
 let outNow=0;const target=()=>N*scheduleAt(H()).out*scale;
 // ---------- Planning ----------
 const budget={left:PLANS_PER_FRAME},queue=new Int16Array(N+1);let qHead=0,qLen=0;
 const ask=a=>{if(a.leader>=0||a.queued)return;a.queued=true;queue[(qHead+qLen)%queue.length]=a.i;qLen++;};
 const HUBS=new Set(districts.flatMap((d,i)=>d.id==='shibuya'||d.id==='shinjuku'?[i]:[]));
 const hubPools=[];for(const act of [ACT.shop,ACT.window,ACT.konbini,ACT.noren,ACT.vending])hubPools[act]=g.pois[act].filter(k=>HUBS.has(g.district[k]));
 const portals=[...g.pois[ACT.station],...g.pois[ACT.edge]];
 const nearestPortal=k=>{let best=-1,bd=1e9;for(const p of portals){const d=(g.X[p]-g.X[k])**2+(g.Z[p]-g.Z[k])**2;if(d<bd){bd=d;best=p;}}return best;};
 function pickDest(a,from){
  const band=scheduleAt(H()),go=band.go,total=go.reduce((s,[,w])=>s+w,0);
  for(let tries=0;tries<4;tries++){
   let x=rnd()*total,act=go[0][0];for(const [k,w] of go)if((x-=w)<0){act=k;break;}
   if(act===ACT.home)return a.home;
   // Shopping, lunch and nights out: often in Shibuya / Shinjuku, however far (people take the train there).
   const pool=hubPools[act]?.length&&rnd()<(isNightHour(H())?.6:.4)?hubPools[act]:g.pois[act];if(!pool?.length)continue;
   const R=pool===hubPools[act]?1e4:act===ACT.station||act===ACT.edge?140:act===ACT.lantern||act===ACT.canal?220:55;let best=-1,bw=0;
   for(let k=0;k<10;k++){const c=pool[Math.floor(rnd()*pool.length)];if(c===from)continue;
    const dd=g.district[c],pull=dd>=0?districtPull(districts[dd],H()):.3,dist=Math.hypot(g.X[c]-g.X[from],g.Z[c]-g.Z[from]);
    const w=pull*Math.exp(-dist/R)*(.5+rnd());if(w>bw){bw=w;best=c;}}
   if(best>=0)return best;
  }
  return a.home;
 }
 function think(a){
  // Home → out (when fewer are out than the hour wants), out → home (when too many are), else the next errand.
  const from=a.node,want=target();
  let dest;
  if(a.after>=0){dest=a.after;a.after=-1;}   // off the train: on to where it was going
  else if(a.state===STATE.home){if(outNow>=want||rnd()<.35){a.timer=6+rnd()*20;return true;}dest=pickDest(a,from);}
  else if(outNow>want*1.1&&rnd()<.6)dest=a.home;
  else dest=pickDest(a,from);
  // Far away (> 80 m): walk to the nearest station or city edge, ride, come out at the one nearest the destination.
  const far=Math.hypot(g.X[dest]-g.X[from],g.Z[dest]-g.Z[from]);
  if(far>80&&g.act[dest]!==ACT.station&&g.act[dest]!==ACT.edge){const P=nearestPortal(from),Q=nearestPortal(dest);
   if(P!==Q&&Math.hypot(g.X[P]-g.X[from],g.Z[P]-g.Z[from])<far*.5){a.after=dest;dest=P;}}
  if(dest===from){a.timer=4+rnd()*6;return true;}
  const p=route(g,from,dest,{budget});
  if(p===undefined)return false;                     // out of search budget this frame: try again next frame
  if(!p||p.length<2){a.timer=5;return true;}
  if(a.state===STATE.home||a.state===STATE.inside){
   // Leave through the door only when nobody stands right there (spawns never overlap).
   if(!clearAround(g.X[from],g.Z[from],a,.9)){a.timer=.5;return true;}
  }
  start(a,p,dest);for(const f of a.followers)follow(agents[f]);return true;
 }
 function start(a,p,dest){if(!a.visible){a.x=g.X[p[0]];a.z=g.Z[p[0]];}a.path=p;a.pi=0;a.dest=dest;a.act=g.act[dest];a.state=STATE.walk;a.visible=true;a.pose=POSE.walk;a.blockT=0;a.latSign=1;
  if(!(g.kind[edgeBetween(g,p[0],p[1])]===1&&holdAtKerb(a,p[0],p[1],clock)))enterEdge(a,p[0],p[1]);}
 // At a kerb: wait (true) unless the walk light is green with time to cross.
 function holdAtKerb(a,from,to,seconds){const e=edgeBetween(g,from,to),left=walkWindow(g.role[e],seconds,world.signals[g.sig[e]]?.offset||0);
  if(left>=g.len[e]/(a.speed*1.15)){a.crossLat=Math.max(-1.3,Math.min(1.3,(rnd()-.5)*2.2));return false;}
  a.e=e;a.L=g.len[e];a.ax=g.X[from];a.az=g.Z[from];a.ux=(g.X[to]-a.ax)/a.L;a.uz=(g.Z[to]-a.az)/a.L;takeWait(a,e,from);a.state=STATE.wait;a.waitDelay=.3+rnd()*.6;a.moving=false;return true;}
 function follow(f){const L=agents[f.leader];f.state=L.state;f.visible=L.visible;f.x=L.x;f.z=L.z;f.node=L.node;}
 // Enter the edge from→to keeping the position continuous (the old offset becomes s<0 / lateral offset in the new frame).
 function enterEdge(a,from,to){
  const e=edgeBetween(g,from,to);a.e=e;a.L=g.len[e];a.ax=g.X[from];a.az=g.Z[from];const L=Math.max(a.L,1e-6);a.ux=(g.X[to]-a.ax)/L;a.uz=(g.Z[to]-a.az)/L;
  const ox=a.x-a.ax,oz=a.z-a.az;a.s=Math.min(.5,ox*a.ux+oz*a.uz);a.lat=ox*a.uz-oz*a.ux;
  const k=g.kind[e];a.latT=k===1?a.crossLat:k===2?0:a.latSign*(.36+(rnd()-.5)*.1);
  if(k===1){a.busyEdge=e;g.busy[e]++;}
 }
 function leaveEdge(a){if(a.busyEdge>=0){g.busy[a.busyEdge]--;a.busyEdge=-1;}}
 function arrive(a){
  const n=a.dest,act=g.act[n];a.node=n;a.path=null;a.moving=false;
  if(HIDES.has(act)&&g.kind[a.e]===2||act===ACT.edge){   // through a door / off the map edge
   a.visible=false;a.state=act===ACT.home&&n===a.home?STATE.home:STATE.inside;
   const [lo,hi]=DWELL[act]||[20,90];a.timer=lo+rnd()*(hi-lo);
   // Commuters come back out at another station or edge.
   if(act===ACT.station||act===ACT.edge){if(a.after>=0){a.node=nearestPortal(a.after);a.timer=8+rnd()*14;}
    else{const pool=rnd()<.5?g.pois[ACT.station]:g.pois[ACT.edge];if(pool.length)a.node=pool[Math.floor(rnd()*pool.length)];}}
  }else{
   a.state=STATE.idle;a.pose=SITS.has(act)?POSE.sit:POSE.idle;const [lo,hi]=DWELL[act]||[4,10];a.timer=lo+rnd()*(hi-lo);
   const yaw=g.yaw[n];a.faceYaw=yaw;const lean=g.kind[a.e]===2?0:.35;a.wx=g.X[n]+Math.sin(yaw)*lean;a.wz=g.Z[n]+Math.cos(yaw)*lean;
  }
  for(const f of a.followers){const F=agents[f];F.state=a.state;F.visible=a.visible;F.pose=a.pose;F.node=a.node;}
 }
 // ---------- Per-frame ----------
 const waitPos={x:0,z:0};
 function kerbSlot(a,bit){const [lx,back]=SLOTS[bit],L=Math.max(a.L,1e-6);
  // a.ux/uz is the crossing direction; slots spread along the kerb (its left normal) and one row back.
  waitPos.x=a.ax+a.uz*lx-a.ux*(.25+back);waitPos.z=a.az-a.ux*lx-a.uz*(.25+back);return waitPos;}
 function step(a,dt,seconds){
  if(a.state===STATE.home||a.state===STATE.inside){if((a.timer-=dt)<=0)ask(a);return;}
  if(a.state===STATE.idle){if((a.timer-=dt)<=0)ask(a);a.x+=(a.wx-a.x)*Math.min(1,dt*3);a.z+=(a.wz-a.z)*Math.min(1,dt*3);a.yaw=turn(a.yaw,a.faceYaw,dt*4);a.moving=false;return;}
  if(a.state===STATE.wait){
   const sig=g.sig[a.e],off=world.signals[sig]?.offset||0,left=walkWindow(g.role[a.e],seconds,off);
   const p=kerbSlot(a,a.waitBit);a.x+=(p.x-a.x)*Math.min(1,dt*3);a.z+=(p.z-a.z)*Math.min(1,dt*3);a.yaw=turn(a.yaw,Math.atan2(a.ux,a.uz),dt*4);a.moving=false;
   if(left>=a.L/(a.speed*1.15)){if((a.waitDelay-=dt)<=0){releaseWait(a);a.crossLat=Math.max(-1.3,Math.min(1.3,SLOTS[a.waitBit][0]*.9+(rnd()-.5)*.3));
     const from=a.path[a.pi],to=a.path[a.pi+1];a.state=STATE.walk;enterEdge(a,from,to);}}
   else a.waitDelay=.25+a.waitBit*.12+rnd()*.5;
   return;}
  // Walking.
  let v=a.speed*(g.kind[a.e]===1&&!walkLit(g.role[a.e],seconds,world.signals[g.sig[a.e]]?.offset||0)?1.35:1);
  if(a.ghostT>0)a.ghostT-=dt;
  else{const hx=a.x+a.ux*.55,hz=a.z+a.uz*.55;
   if(!freeFor(hx,hz,a)){v=0;a.blockT+=dt;if(a.blockT>1&&a.blockT-dt<=1){a.latSign=-a.latSign;if(g.kind[a.e]===0)a.latT=a.latSign*.36;}if(a.blockT>3){a.ghostT=1.2;a.blockT=0;}}
   else a.blockT=Math.max(0,a.blockT-dt*2);}
  a.s+=v*dt;a.moving=v>0;
  while(a.s>=a.L){
   a.s-=a.L;leaveEdge(a);a.pi++;
   if(a.pi>=a.path.length-1){a.x=g.X[a.dest];a.z=g.Z[a.dest];arrive(a);return;}
   const from=a.path[a.pi],to=a.path[a.pi+1],e=edgeBetween(g,from,to);
   if(g.kind[e]===1&&holdAtKerb(a,from,to,seconds))return;
   const s=a.s;enterEdge(a,from,to);a.s=Math.max(a.s,s);
  }
  a.lat+=(a.latT-a.lat)*Math.min(1,dt*3);
  const lx=a.uz,lz=-a.ux;a.x=a.ax+a.ux*a.s+lx*a.lat;a.z=a.az+a.uz*a.s+lz*a.lat;
  if(a.moving)a.yaw=turn(a.yaw,Math.atan2(a.ux,a.uz),dt*6);
 }
 function takeWait(a,e,from){const key=e*2+(g.A[e]===from?0:1);let m=waits.get(key)||0,bit=0;while(bit<SLOTS.length-1&&(m>>bit)&1)bit++;
  // When every slot is taken the last one is shared by a short queue behind (rare).
  waits.set(key,m|(1<<bit));a.waitKey=key;a.waitBit=bit;}
 function releaseWait(a){if(a.waitKey<0)return;const m=waits.get(a.waitKey)||0;waits.set(a.waitKey,m&~(1<<a.waitBit));a.waitKey=-1;}
 const turn=(y,t,k)=>{let d=((t-y+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;return y+d*Math.min(1,k);};
 // Followers: beside the leader while it stands, a step behind (staggered) while it walks.
 function place(f){const L=agents[f.leader];f.state=L.state;f.visible=L.visible;f.pose=L.pose;f.moving=L.moving;f.umbrella=rain&&h01(seed,f.i,77)<.85;
  if(!f.visible)return;const k=f.slot,side=(k%2?1:-1)*.75*Math.ceil(k/2);
  if(L.state===STATE.walk&&L.moving){const lx=Math.cos(L.yaw),lz=-Math.sin(L.yaw),bx=Math.sin(L.yaw),bz=Math.cos(L.yaw),back=.8*k;
   const tx=L.x-bx*back+lx*(k%2?.18:-.18),tz=L.z-bz*back+lz*(k%2?.18:-.18);f.x+=(tx-f.x)*.5;f.z+=(tz-f.z)*.5;f.yaw=L.yaw;}
  else{const lx=Math.cos(L.yaw),lz=-Math.sin(L.yaw);f.x+=(L.x+lx*side-f.x)*.3;f.z+=(L.z+lz*side-f.z)*.3;f.yaw=L.yaw+(k%2?-.35:.35);}}
 // ---------- Warm start: the hour's share of people already out, mid-walk on random sidewalks ----------
 // Also a debug hook (screenshots after setHour): people at home step straight onto the sidewalks (they pop in).
 function warm(){const want=Math.round(target())-outCount();const walks=[];for(let e=0;e<g.m;e++)if(g.kind[e]===0&&g.district[g.A[e]]>=0)walks.push(e);
  const wW=walks.map(e=>districtPull(districts[g.district[g.A[e]]],H())*g.len[e]),wS=wW.reduce((a,b)=>a+b,0);stamp++;
  let placed=0;for(const a of agents){if(a.leader>=0||placed>=want||a.state!==STATE.home)continue;
   for(let t=0;t<6;t++){let x=h01(seed,a.i,30+t)*wS,e=walks[0];for(let k=0;k<walks.length;k++)if((x-=wW[k])<0){e=walks[k];break;}
    const fwd=h01(seed,a.i,40+t)<.5,from=fwd?g.A[e]:g.B[e],to=fwd?g.B[e]:g.A[e],s=h01(seed,a.i,50+t)*g.len[e];
    a.x=g.X[from];a.z=g.Z[from];a.path=Int32Array.of(from,to);a.pi=0;a.dest=to;a.state=STATE.walk;a.visible=true;a.pose=POSE.walk;enterEdge(a,from,to);a.s=s;a.lat=a.latT;
    a.x=a.ax+a.ux*a.s+a.uz*a.lat;a.z=a.az+a.uz*a.s-a.ux*a.lat;
    if(occupant(a.x,a.z)<0){occupy(a.x,a.z,a.i);placed+=1+a.followers.length;for(const f of a.followers){const F=agents[f];F.state=STATE.walk;F.visible=true;F.x=a.x;F.z=a.z;}break;}
    leaveEdge(a);a.state=STATE.home;a.visible=false;a.path=null;}}
  outNow=outCount();}
 warm();
 const stats={out:0,walking:0,waiting:0,inside:0,home:0,idle:0,plans:0,hits:0,thinks:0};
 function update(dt,seconds){
  clock=seconds;dt=Math.max(0,Math.min(dt,.1));budget.left=PLANS_PER_FRAME;
  // Decisions, time-sliced: at most THINK_PER_FRAME agents per frame, round robin through the queue.
  let n=0;while(qLen>0&&n<THINK_PER_FRAME){const a=agents[queue[qHead]];qHead=(qHead+1)%queue.length;qLen--;a.queued=false;n++;
   if(!think(a)){ask(a);if(budget.left<=0)break;}}
  stats.thinks=n;
  outNow=0;stamp++;for(const a of agents){if(a.state!==STATE.home)outNow++;if(a.visible)occupy(a.x,a.z,a.i);}
  for(const a of agents){if(a.leader>=0)continue;step(a,dt,seconds);a.umbrella=rain&&h01(seed,a.i,77)<.85;}
  for(const a of agents)if(a.leader>=0)place(a);
 }
 function counts(){stats.out=stats.walking=stats.waiting=stats.inside=stats.home=stats.idle=0;
  for(const a of agents){if(a.state!==STATE.home)stats.out++;if(a.state===STATE.walk)stats.walking++;else if(a.state===STATE.wait)stats.waiting++;else if(a.state===STATE.inside)stats.inside++;else if(a.state===STATE.home)stats.home++;else stats.idle++;}
  stats.plans=g.stats.astar;stats.hits=g.stats.hits;return stats;}
 return {agents,world,update,counts,warm,
  setHour(h){hourOverride=h===null||h===undefined?null:((+h%24)+24)%24;},
  autoHour(night=null,ms=Date.now()){autoH=tokyoHour(ms,night);},
  get hour(){return H();},
  setRain(on){rain=!!on;},get rain(){return rain;},
  // Quality hook: share of the hour's outdoor population that is simulated and drawn (0.3–1).
  setScale(s){scale=Math.max(.2,Math.min(1,+s||1));},
  occupantAt:(x,z)=>occupant(x,z),get tileStamp(){return stamp;}};
}
