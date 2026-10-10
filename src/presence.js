// Live presence: residents see each other walk. Your own outing (explore mode or a visit) posts its PATH when it
// changes and a position fix every 2 s (POST /api/presence, ≤ 1 message a second); everyone else's outings arrive on
// the chat stream as `walker` / `walkers` frames (chat.js) and are drawn by the residents' instanced crowd
// (residents.js: the GPU crowd up close, box figures far away: no draw call of their own), dead-reckoned along the
// path between fixes. Only a resident's public name, look and position travel; guests are never sent (guest.js
// says so once). The server names walkers by an opaque id, never a wallet.
import * as THREE from 'three';
import {api} from './api.js';
import {icon} from './icons.js';
import {STRIDE} from './motion.js';
import {groundY} from './explore.js';   // the canal bridge deck: a walker's feet follow the ground like the local model's

export const PRESENCE={path:'/api/presence',fixMs:2000,minGapMs:1000,ttlMs:15e3,snap:3,maxPath:24,bodyMax:580,tagZoom:.5,lerp:8,walkCycle:4/3};
const STATES=new Set(['walk','idle','home']);
const num=(v,d=0)=>typeof v==='number'&&Number.isFinite(v)?v:d;
const r1=v=>Math.round(v*10)/10,r2=v=>Math.round(v*100)/100;

// ---- Pure helpers (tests/presence.test.js) ----
// A stream frame as the city keeps it: `at` is the LOCAL receipt time (dead reckoning never trusts the server clock).
export function normalizeWalker(w,now=Date.now()){
 if(!w||typeof w!=='object'||typeof w.id!=='string'||!w.id||!STATES.has(w.state))return null;
 const id=w.id.slice(0,32),name=String(w.name??'Someone').slice(0,32),plotId=w.plotId==null?null:String(w.plotId).slice(0,32);
 if(w.state==='home')return {id,name,plotId,state:'home',at:now};
 const path=Array.isArray(w.path)?w.path.slice(0,PRESENCE.maxPath).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)).map(p=>({x:p.x,z:p.z})):[];
 const look=w.look&&typeof w.look==='object'&&!Array.isArray(w.look)?w.look:{};
 return {id,name,plotId,look,state:w.state,x:num(w.x),z:num(w.z),yaw:num(w.yaw),speed:Math.max(0,num(w.speed)),path,emote:typeof w.emote==='string'?w.emote.slice(0,16):null,at:now,serverAt:num(w.at,now)};
}
// Where along the path (distance from its start) the point nearest to (x, z) lies.
export function projectOnPath(path,x,z){
 let best=0,bd=Infinity,acc=0;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
  const t=l2?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2)):0,px=a.x+dx*t,pz=a.z+dz*t,d=(px-x)**2+(pz-z)**2;
  if(d<bd){bd=d;best=acc+Math.sqrt(l2)*t;}acc+=Math.sqrt(l2);}
 return best;
}
// The point `dist` units along the path, facing its segment (yaw as city-events: atan2(dx, dz)); clamped to the end.
export function pointAlong(path,dist){
 let acc=0,yaw=0;
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);if(l)yaw=Math.atan2(dx,dz);
  if(dist<=acc+l||i===path.length-1){const t=l?Math.max(0,Math.min(1,(dist-acc)/l)):1;return {x:a.x+dx*t,z:a.z+dz*t,yaw,done:dist>=acc+l-1e-6};}acc+=l;}
 const p=path[path.length-1]||{x:0,z:0};return {x:p.x,z:p.z,yaw,done:true};
}
// Dead reckoning: the walker's position at time `now`, from its last fix (x, z at `at`) advanced along its path at `speed`.
export function positionAt(w,now){
 if(w.state!=='walk'||!w.path||w.path.length<2||!(w.speed>0))return {x:w.x,z:w.z,yaw:w.yaw,moving:false};
 const d=projectOnPath(w.path,w.x,w.z)+w.speed*Math.max(0,now-w.at)/1000,p=pointAlong(w.path,d);
 return {x:p.x,z:p.z,yaw:p.yaw,moving:!p.done};
}
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// Moves a drawn figure towards its reckoned target: a snap when it is far off (> snap units), a smooth approach otherwise.
export function approach(cur,target,dt,{snap=PRESENCE.snap,rate=PRESENCE.lerp}={}){
 const dx=target.x-cur.x,dz=target.z-cur.z,d=Math.hypot(dx,dz);
 if(d>snap||dt<=0){cur.x=target.x;cur.z=target.z;cur.yaw=target.yaw;return d>snap?'snap':'hold';}
 const k=Math.min(1,dt*rate);cur.x+=dx*k;cur.z+=dz*k;cur.yaw=wrap(cur.yaw+wrap(target.yaw-cur.yaw)*k);return 'move';
}
// When to post: a changed path goes out at once but never within minGap of the last post (it waits for the next tick);
// otherwise a fix every fixMs. ≤ 1 message a second on the wire.
export function createThrottle({minGapMs=PRESENCE.minGapMs,fixMs=PRESENCE.fixMs}={}){
 let lastAt=-Infinity,dirty=false;
 return {due(now,{changed=false}={}){if(changed)dirty=true;const gap=now-lastAt;return (dirty&&gap>=minGapMs)||gap>=fixMs;},
  sent(now){lastAt=now;dirty=false;},reset(){lastAt=-Infinity;dirty=false;},get dirty(){return dirty;}};
}
// The POST body for an outing: state, a fix, the path (only when it changed, cut to fit the server's 600 B limit).
export function presenceBody({state,x,z,yaw,speed,path=null,withPath=false},max=PRESENCE.bodyMax){
 const b={state,x:r2(x),z:r2(z),yaw:r2(wrap(yaw)),speed:r2(speed)};
 if(state==='home')return {state:'home'};
 if(withPath&&path){let p=path.slice(0,PRESENCE.maxPath).map(q=>({x:r1(q.x),z:r1(q.z)}));while(p.length>2&&JSON.stringify({...b,path:p}).length>max)p.pop();b.path=p;}
 return b;
}
// The remote walkers by id: frames merge in (a `home` frame or a stale one removes), a snapshot replaces everything.
export function createRemoteSet({ttlMs=PRESENCE.ttlMs}={}){
 const map=new Map();
 function put(f,now){const w=normalizeWalker(f,now);if(!w)return null;
  if(w.state==='home'){return map.delete(w.id)?{removed:w.id}:null;}
  const old=map.get(w.id);if(old&&JSON.stringify(old.look)===JSON.stringify(w.look))w.look=old.look;   // same object: crowd-gpu caches the packed look by identity
  map.set(w.id,w);return old?{updated:w.id}:{added:w.id};}
 return {
  apply(frames,now=Date.now()){const out=[];for(const f of Array.isArray(frames)?frames:[frames]){const r=put(f,now);if(r)out.push(r);}return out;},
  snapshot(list,now=Date.now()){map.clear();return this.apply(list,now);},
  expire(now=Date.now()){const gone=[];for(const [id,w] of map)if(now-w.at>ttlMs){map.delete(id);gone.push(id);}return gone;},
  get:id=>map.get(id)||null,list:()=>[...map.values()],get size(){return map.size;},clear(){map.clear();}};
}

// ---- Your outing → the server ----
// root(): the roaming model's Object3D (position, rotation.y) or null while it loads. post(body) → promise.
export function createPresenceSender({root,post=b=>api(PRESENCE.path,{method:'POST',body:b}),now=()=>performance.now(),every=250}={}){
 const th=createThrottle();let on=false,path=null,speed=0,state='idle',changed=false,timer=0,inflight=false,sent=0,failed=0,lastBody=null;
 function tick(){
  if(!on||inflight)return;const r=root?.();if(!r)return;
  if(!th.due(now(),{changed}))return;
  const withPath=changed;changed=false;th.sent(now());
  const body=presenceBody({state,x:r.position.x,z:r.position.z,yaw:r.rotation.y,speed,path,withPath});lastBody=body;inflight=true;
  post(body).then(()=>{sent++;},err=>{failed++;if(err?.status===401||err?.status===409)halt();}).finally(()=>{inflight=false;});
 }
 function halt(){on=false;clearInterval(timer);timer=0;path=null;changed=false;}
 return {
  start(){if(on)return;on=true;state='idle';path=null;speed=0;changed=true;th.reset();timer=setInterval(tick,every);timer.unref?.();tick();},
  // The explorer's / the visit's route changed (null: standing still).
  path(p,s=0){if(!on)return;path=Array.isArray(p)&&p.length>1?p:null;speed=path?s:0;state=path?'walk':'idle';changed=true;tick();},
  stop(){if(!on)return;halt();lastBody={state:'home'};post({state:'home'}).then(()=>{sent++;},()=>{failed++;});},
  tick,get on(){return on;},get stats(){return {sent,failed,state,lastBody};}};
}

// ---- Everyone else's outings → the city ----
// residents.js draws the figures (walkers(list) / hideWalking(keys)); labels is main.js's world-label list.
export function createRemoteWalkers({residents,labels,labelsRoot=null,ttlMs=PRESENCE.ttlMs}={}){
 const set=createRemoteSet({ttlMs}),figs=new Map();let myId=null,myPlot=null,lastT=0,frames=0;
 const root=()=>labelsRoot||document.getElementById('labels');
 function addLabel(f){const element=Object.assign(document.createElement('div'),{className:'world-label roam-tag remote-tag',hidden:true});element.append(icon('walk'),f.name);
  f.label={element,position:new THREE.Vector3(f.x,2.31,f.z),roam:true,minZoom:PRESENCE.tagZoom};root()?.append(element);labels.push(f.label);}
 function dropLabel(f){if(!f.label)return;f.label.element.remove();const i=labels.indexOf(f.label);if(i>=0)labels.splice(i,1);f.label=null;}
 const mine=w=>w.id===myId||(myPlot&&w.plotId===myPlot);                  // never your own model twice
 function sync(){
  for(const w of set.list()){if(mine(w))continue;let f=figs.get(w.id);
   if(!f){f={key:'walker:'+w.id,id:w.id,name:w.name,plotId:w.plotId,x:w.x,y:.26,z:w.z,yaw:w.yaw,look:w.look,moving:false,wave:false,phase:(figs.size*.37)%1,rate:1,w,label:null};figs.set(w.id,f);addLabel(f);}
   else{f.w=w;f.look=w.look;if(f.name!==w.name){f.name=w.name;f.label?.element.replaceChildren(icon('walk'),w.name);}}
   f.rate=Math.max(.6,w.speed*PRESENCE.walkCycle/STRIDE);f.wave=w.state==='idle'&&w.emote==='wave';}
  for(const [id,f] of figs){const w=set.get(id);if(!w||mine(w)){dropLabel(f);figs.delete(id);}}
  residents.walkers([...figs.values()]);
 }
 const keyOf=plotId=>plotId&&residents.people.find(p=>p.key.startsWith(plotId+'{'))?.key||null;
 return {
  // hello: your own id (so your frames are skipped) and the snapshot; a reconnect sends a fresh hello.
  hello(d){myId=d?.you?.walker||null;set.snapshot(d?.walkers||[]);sync();},
  apply(frames){set.apply(frames);sync();},
  setMyPlot(plotId){myPlot=plotId||null;},
  // Every frame before residents.update: reckon, approach, labels, the static apartment figure hidden while its owner walks.
  frame(now=Date.now(),dtOverride=null){
   const dt=dtOverride??(lastT?Math.min(.1,(now-lastT)/1000):0);lastT=now;frames++;
   if(set.expire(now).length)sync();
   const hide=new Set();
   for(const f of figs.values()){const t=positionAt(f.w,now);approach(f,t,dt);f.moving=t.moving;f.y=groundY(f.x,f.z);
    if(f.label)f.label.position.set(f.x,f.y+2.05,f.z);const k=keyOf(f.plotId);if(k)hide.add(k);}
   residents.hideWalking(hide);
  },
  // Where a resident's figure is right now (chat bubbles ride the walker, not the apartment), or null when at home.
  at(plotId){for(const f of figs.values())if(f.plotId===plotId)return {x:f.x,y:f.y,z:f.z};return null;},
  get size(){return figs.size;},get list(){return [...figs.values()].map(f=>({id:f.id,name:f.name,plotId:f.plotId,x:+f.x.toFixed(2),z:+f.z.toFixed(2),yaw:+f.yaw.toFixed(2),moving:f.moving,state:f.w.state}));},
  get myId(){return myId;},get frames(){return frames;}};
}
