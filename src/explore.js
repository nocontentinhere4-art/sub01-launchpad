import {planRoute,frontOf} from './world-sync.js';
import {cityPlots,districts,ROAD_Z,BOULEVARD_X,CITY_EXTENT as E,CANAL_X,METRO_Z} from './city-state.js';
// Explore mode: the signed-in resident's own model walks the city (client-only, nothing is sent to the server).
// Pure helpers plus a small brain; the model, its pet and the stepping live in city-events.js (the one roaming model).
export const IDLE_S=8,PAUSE_S=[5,12],NEAR=3.5,WALK_SPEED=2.2,RUN_SPEED=4.6,EMOTE_P=.6;
// Streets mirror world-sync.js: an east-west road per district row (sidewalk fronts at ±2.8), boulevards between columns,
// and the bridge that continues the z=2 road over the eastern canal.
// Bounds come from city-state.js (7×7 city: rows ±101, boulevards z −101.5…105.5, the bridge over the canal at CANAL_X).
const BANDS=[...ROAD_Z.map(z=>({x0:E.minX+.5,x1:E.maxX-.5,z0:z-2.8,z1:z+2.8})),...BOULEVARD_X.map(x=>({x0:x-1.3,x1:x+1.3,z0:E.minZ,z1:E.maxZ})),{x0:E.maxX-.5,x1:CANAL_X+7,z0:.4,z1:3.6}];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
// Nearest point on a street or sidewalk.
export function snapToStreet(p){
 let best=null,bd=Infinity;
 for(const b of BANDS){const x=clamp(p.x,b.x0,b.x1),z=clamp(p.z,b.z0,b.z1),d=(x-p.x)**2+(z-p.z)**2;if(d<bd){bd=d;best={x,z};}}
 return best;
}
// Floor height for the roaming model: ground, or the canal bridge deck (y 0.93) with a short ramp onto it.
export function groundY(x,z){const dz=Math.abs(z-2),dx=Math.abs(x-CANAL_X);return dz>2?.26:.26+.67*clamp((7.8-dx)/.8,0,1);}
// Street route from -> to; a walk along one boulevard goes straight instead of detouring through a road row.
// Road rows are walked on the sidewalk (±2.35, the side it comes from / goes to), clear of the traffic lanes (±0.75)
// and the parked car; a row that starts or ends the route (the scramble, the bridge) keeps the road centre.
export const SIDEWALK=2.35;
export function exploreRoute(from,to){
 const bx=BOULEVARD_X.find(x=>Math.abs(from.x-x)<=1.5&&Math.abs(to.x-x)<=1.5);
 const pts=bx===undefined?planRoute(from,to):[{x:from.x,z:from.z},{x:from.x,z:to.z},{x:to.x,z:to.z}];
 const out=pts.filter((p,i)=>i===0||p.x!==pts[i-1].x||p.z!==pts[i-1].z),last=out.length-1;
 for(let i=1;i<last;){const r=out[i].z;let j=i;while(j<last&&out[j+1].z===r)j++;
  if(ROAD_Z.includes(r)&&j<last&&out[i-1].z!==r){const side=Math.sign((i===1?from.z:to.z)-r)||1;for(let k=i;k<=j;k++)out[k]={x:out[k].x,z:r+side*SIDEWALK};}i=j+1;}
 return out.filter((p,i)=>i===0||p.x!==out[i-1].x||p.z!==out[i-1].z);
}
// Fixed landmarks: where to stand, which way to face, a one-line toast, emotes to try (first unlocked one wins).
export const LANDMARKS=[
 {id:'tower',kind:'landmark',name:'Tokyo Tower',text:'Tokyo Tower — Shiba. 333 m in real life.',x:-23.8,z:-28,yaw:-Math.PI/2,emotes:['selfie','wave']},
 {id:'shibuya',kind:'landmark',name:'Shibuya crossing',text:'Shibuya crossing — the scramble, every light at once.',x:29,z:2.4,yaw:0,emotes:['dance','celebrate']},
 {id:'canal',kind:'landmark',name:'Nakameguro canal',text:'Nakameguro canal — cherry trees along the water.',x:CANAL_X-1,z:2,yaw:0,emotes:['sit','think']},
 {id:'metro',kind:'landmark',name:'Metro station',text:'Metro station — the elevated line along the south edge.',x:-25,z:METRO_Z-3,yaw:0,emotes:['think','wave']},
 {id:'lanterns',kind:'landmark',name:'Roppongi lanterns',text:'Roppongi lantern street.',x:-31,z:2.4,yaw:0,emotes:['karaoke','dance']},
 {id:'broadcast',kind:'landmark',name:'Broadcast tower',text:'Broadcast tower — the second skyline needle.',x:51.5,z:-58,yaw:Math.PI/2,emotes:['selfie','think']},
 // Third ring (wave 4A): the two sub-centres and an old-town street.
 {id:'kichijoji',kind:'landmark',name:'Kichijoji',text:'Kichijoji — the west side sub-centre, all arcades and live houses.',x:87,z:-58,yaw:0,emotes:['dance','wave']},
 {id:'gotanda',kind:'landmark',name:'Gotanda',text:'Gotanda — offices by day, izakaya by night.',x:-87,z:32,yaw:0,emotes:['karaoke','think']},
 {id:'yanaka',kind:'landmark',name:'Yanaka',text:'Yanaka — old wooden houses, temples and cats.',x:0,z:-88,yaw:0,emotes:['sit','selfie']},
];
// Places to wander to: landmarks, launched buildings, other residents' apartments (standing left of the host's box figure).
export function cityPois(buildings,minePlotId){
 const out=[...LANDMARKS];
 for(const b of Array.isArray(buildings)?buildings:[]){const f=frontOf(b?.plotId),p=cityPlots.find(c=>c.id===b?.plotId);if(!f||!p)continue;
  if(b.type==='project'&&b.phase==='open')out.push({id:b.plotId,kind:'launch',name:b.name,text:`${b.name}${b.ticker?' · $'+b.ticker:''} — launched here.`,x:f.x,z:f.z,yaw:p.z>f.z?0:Math.PI,emotes:['celebrate','dance']});
  else if(b.type==='apartment'&&b.plotId!==minePlotId&&b.name)out.push({id:b.plotId,kind:'resident',name:b.name,plotId:b.plotId,x:f.x,z:f.z,yaw:Math.PI/2,emotes:[]});}
 return out;
}
// A kind first (landmark / launch / resident, so a crowded city does not drown the landmarks), then a place of that kind.
// Never the place it is standing at.
export function pickPoi(list,lastId,rand=Math.random){
 const c=(Array.isArray(list)?list:[]).filter(p=>p&&p.id!==lastId);if(!c.length)return null;
 const kinds=[...new Set(c.map(p=>p.kind))],k=kinds[Math.floor(rand()*kinds.length)%kinds.length],pool=c.filter(p=>p.kind===k);
 return pool[Math.floor(rand()*pool.length)%pool.length];
}
// Fires once when `limit` seconds pass without a poke.
export function idleTimer(limit=IDLE_S){let t=0,fired=false;
 return {poke(){t=0;fired=false;},tick(dt){t+=dt;if(fired||t<limit)return false;fired=true;return true;},get idle(){return t;}};}
export function districtAt(x,z){
 if(x>E.maxX)return 'the waterfront';if(z>E.maxZ-5.5)return 'the metro line';
 const d=districts.find(d=>Math.abs(x-d.x)<=14.5&&Math.abs(z-d.z)<=15);
 return d?d.name.split(' /')[0]:Math.abs(x)<=14.5&&Math.abs(z-2)<=15?"SUB-01's block":'Tokyo';
}
export const landmarkNear=(x,z,r=NEAR)=>{for(const l of LANDMARKS)if((l.x-x)**2+(l.z-z)**2<r*r)return l;return null;};
// The brain. roam: {x,z,go(path,{run,done}),halt(),face(yaw),emote(name)->bool,stopEmote(),play(name)} (city-events.js).
// States: walk (a tap), idle (waiting for the 8 s autopilot), auto (walking to a place), pause (at a place), home, done.
export function createExplorer({roam,homeAt,pois=()=>LANDMARKS,canEmote=()=>false,onToast,onGreet,onActivity,onState,onAuto,onHome,rand=Math.random,idle=IDLE_S}){
 const timer=idleTimer(idle);let state='idle',poi=null,lastId=null,wait=0,toasted=null,scan=0,where='';
 const set=s=>{if(s!==state){state=s;onState?.(s);}};
 function walk(to,{run=false,next='walk',target=null}={}){roam.stopEmote();poi=target;set(next);
  roam.go(exploreRoute({x:roam.x,z:roam.z},to),{run,done:arrived});}
 function arrived(){
  if(state==='home'){set('done');onHome?.();return;}
  if(state==='auto'&&poi){const p=poi;lastId=p.id;roam.face(p.yaw);wait=PAUSE_S[0]+rand()*(PAUSE_S[1]-PAUSE_S[0]);set('pause');
   if(p.kind==='resident')onGreet?.(p);else{if(p.kind!=='landmark')onToast?.(p);const e=rand()<EMOTE_P&&p.emotes.find(canEmote);if(e)roam.emote(e);}return;}
  timer.poke();set('idle');
 }
 function next(){const p=pickPoi(pois(),lastId,rand);if(!p){timer.poke();set('idle');return;}walk(p,{next:'auto',target:p});onAuto?.(p);}
 return {
  get state(){return state;},get poi(){return poi;},
  tap(point,{run=false}={}){if(state==='done')return null;timer.poke();lastId=null;const to=snapToStreet(point);walk(to,{run});return to;},
  home(){if(state==='done')return;const h=homeAt();if(!h){set('done');onHome?.();return;}walk(h,{next:'home'});},
  update(dt){
   if(state==='done')return;
   if((scan+=dt)>=.25){scan=0;const x=roam.x,z=roam.z,l=landmarkNear(x,z);
    if(l&&l.id!==toasted){toasted=l.id;onToast?.(l);}else if(!l&&toasted&&!landmarkNear(x,z,NEAR*2.5))toasted=null;
    const d=districtAt(x,z);if(d!==where){where=d;onActivity?.(d);}}
   if(state==='idle'){if(timer.tick(dt))next();}
   else if(state==='pause'&&(wait-=dt)<=0){roam.stopEmote();next();}
  }};
}
