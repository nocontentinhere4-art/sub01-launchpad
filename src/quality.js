// Performance governor (robustness pass): the city must never crash or freeze, on phones or PC, however big it grows.
// Pure module (no three.js, no DOM at import) so the state machine is tested in node; main.js applies the settings.
// Levels 0 lite … 3 full. Each level gives up, in order: weather particles and reflections → GPU crowd cap/budget and
// model upgrades → critters/steam/blimp/fireworks → shadow map (1024 → 512 → off) → city detail → pixel ratio.
// Values are absolute and then clamped by the device's own caps (the numbers the city shipped with), so a phone at
// level 2 and a desktop at level 3 draw exactly what they drew before this pass.
export const MAX_LEVEL=3,NAMES=['lite','low','medium','full'];
export const QUALITY=[
 {precip:400, splash:false,reflections:false,crowdCap:0,  crowdTris:0,  crowdPx:Infinity,critters:.25,wisps:1,blimp:false,fireworks:2,shadow:0,   detail:false,pixelRatio:.85},
 {precip:1200,splash:false,reflections:false,crowdCap:48, crowdTris:3e5,crowdPx:20,      critters:.5, wisps:2,blimp:true, fireworks:4,shadow:512, detail:true, pixelRatio:1},
 {precip:2400,splash:true, reflections:true, crowdCap:96, crowdTris:6e5,crowdPx:14,      critters:1,  wisps:5,blimp:true, fireworks:6,shadow:1024,detail:true, pixelRatio:1.25},
 {precip:4000,splash:true, reflections:true, crowdCap:160,crowdTris:1e6,crowdPx:14,      critters:1,  wisps:5,blimp:true, fireworks:6,shadow:1024,detail:true, pixelRatio:1.5},
];
// What each device drew before the governor existed (weather.js N, crowd-gpu CROWD_CAP/CROWD_TRIS, main.js SHADOW_MAP / pixel ratio).
export const DEVICE_CAPS={desktop:{precip:4000,crowdCap:160,crowdTris:1e6,wisps:5,shadow:1024,pixelRatio:1.5},
 mobile:{precip:1600,crowdCap:64,crowdTris:4e5,wisps:3,shadow:512,pixelRatio:1.25}};
export const clampLevel=l=>Math.max(0,Math.min(MAX_LEVEL,Math.round(Number(l))||0));
export function settingsFor(level,{mobile=false,dpr=Infinity}={}){
 const q={...QUALITY[clampLevel(level)]},cap=DEVICE_CAPS[mobile?'mobile':'desktop'];
 for(const k of Object.keys(cap))q[k]=Math.min(q[k],cap[k]);
 q.pixelRatio=Math.min(q.pixelRatio,Math.max(Number(dpr)||1,.5));q.level=clampLevel(level);q.name=NAMES[q.level];return q;
}

// Start level by device: desktop 3, phones 2, 1 for a weak GPU or a small device (memory ≤ 2 GB or ≤ 2 cores).
export const WEAK_GPU=[/Mali-(4\d\d|T[678]\d\d)/i,/Adreno[^0-9]{0,12}[345]\d\d\b/i,/Apple A(9|10|11)\b/i,/PowerVR/i,/SwiftShader/i,/llvmpipe/i,/ANGLE \(Google, Vulkan/i];
export const weakGpu=s=>typeof s==='string'&&WEAK_GPU.some(r=>r.test(s));
export function startLevel({phone=false,gpu='',deviceMemory,cores}={}){
 if(weakGpu(gpu)||(deviceMemory>0&&deviceMemory<=2)||(cores>0&&cores<=2))return 1;
 return phone?2:3;
}
// The unmasked renderer string ('' when the browser hides it).
export function gpuName(gl){try{const e=gl?.getExtension?.('WEBGL_debug_renderer_info');return String(e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl?.getParameter?.(gl.RENDERER)||'');}catch{return '';}}

// The governor. sample(ms, now) is fed the cost of each rendered frame (main.js: the interval from a rendered frame's
// rAF to the next rAF, so the 30/45 fps cap does not count as slowness). EMA with a 1 s time constant (~2 s of frames).
// Down one level when the EMA stays above 38 ms (< 26 fps) for 3 s; up one when it stays below 20 ms for 20 s and no
// step down happened in the last 60 s. Frames right after load, a room, a resize, a hidden tab or a level change are
// ignored (grace) and the EMA restarts after them, so a shader compile or a GC pause never counts as a slow city.
export const GOV={down:38,up:20,downHold:3e3,upHold:2e4,upQuiet:6e4,tau:1e3,maxSample:250,
 grace:{load:5e3,room:5e3,resize:1e3,visible:1e3,change:2e3,restore:5e3}};
export function createGovernor({level=MAX_LEVEL,auto=true,now=0,onChange=()=>{},max=MAX_LEVEL}={}){
 const s={level:clampLevel(level),auto:!!auto,ema:null,last:null,graceUntil:now+GOV.grace.load,slowSince:null,fastSince:null,lastDown:-Infinity,steps:[]};
 function change(to,now,reason){to=Math.max(0,Math.min(max,clampLevel(to)));if(to===s.level)return null;const from=s.level;s.level=to;
  if(to<from)s.lastDown=now;s.steps.push({at:now,from,to,reason});if(s.steps.length>20)s.steps.shift();
  grace(GOV.grace.change,now);onChange(to,{from,reason});return reason;}
 function grace(ms,now){s.graceUntil=Math.max(s.graceUntil,now+ms);s.ema=s.last=s.slowSince=s.fastSince=null;}
 function sample(ms,now){
  if(!(ms>=0)||now<s.graceUntil)return null;
  ms=Math.min(ms,GOV.maxSample);
  if(s.ema===null){s.ema=ms;s.last=now;}else{const a=1-Math.exp(-Math.max(0,now-s.last)/GOV.tau);s.ema+=(ms-s.ema)*a;s.last=now;}
  if(!s.auto)return null;
  if(s.ema>GOV.down){s.fastSince=null;s.slowSince??=now;if(now-s.slowSince>=GOV.downHold&&s.level>0)return change(s.level-1,now,'down');}
  else if(s.ema<GOV.up){s.slowSince=null;s.fastSince??=now;if(now-s.fastSince>=GOV.upHold&&now-s.lastDown>=GOV.upQuiet&&s.level<max)return change(s.level+1,now,'up');}
  else s.slowSince=s.fastSince=null;
  return null;
 }
 return {sample,grace,set:(l,now=0)=>change(l,now,'manual'),
  get level(){return s.level;},get auto(){return s.auto;},set auto(v){s.auto=!!v;s.slowSince=s.fastSince=null;},
  get ema(){return s.ema;},get steps(){return s.steps;},get graceUntil(){return s.graceUntil;}};
}

// Subsystem fuse: run(fn) calls fn; after `limit` consecutive throws the subsystem is switched off (log once) and the
// rest of the frame (and the render) goes on. A frame that succeeds resets the count.
export function createFuse(name,{limit=3,log=(...a)=>console.warn(...a)}={}){
 let fails=0,off=false;
 return {get off(){return off;},get fails(){return fails;},
  reset(){fails=0;off=false;},
  run(fn,...args){if(off)return undefined;try{const r=fn(...args);fails=0;return r;}catch(err){
   if(++fails>=limit){off=true;log(`[city] ${name} switched off after ${limit} errors in a row; the city keeps running.`,err);}return undefined;}}};
}

// Reload fallback (WebGL context not restored): the view survives a reload in sessionStorage. Rooms are not restored:
// the page comes back to the city. Plain numbers and short ids only; nothing about the account.
export const RESUME_KEY='sub01-city-resume',RESUME_MAX_AGE=6e4;
export function packResume({target,zoom,district='',dayMode='day',weather='auto',reloads=0},now=Date.now()){
 return JSON.stringify({v:1,at:now,reloads:Math.max(0,reloads|0),t:[target.x,target.y,target.z].map(n=>Math.round(n*100)/100),zoom:Math.round(zoom*1e4)/1e4,district:String(district).slice(0,40),dayMode,weather});
}
export function unpackResume(text,now=Date.now(),{dayModes=['auto','day','night'],weathers=null}={}){
 try{const o=JSON.parse(text);if(!o||o.v!==1||!(now-o.at>=0&&now-o.at<RESUME_MAX_AGE))return null;
  const t=Array.isArray(o.t)&&o.t.length===3&&o.t.every(Number.isFinite)?o.t:null,zoom=Number(o.zoom);if(!t||!(zoom>0&&zoom<10))return null;
  return {target:{x:t[0],y:t[1],z:t[2]},zoom,district:typeof o.district==='string'?o.district:'',dayMode:dayModes.includes(o.dayMode)?o.dayMode:'day',
   weather:typeof o.weather==='string'&&(!weathers||weathers.includes(o.weather))?o.weather:'auto',reloads:Math.max(0,Number(o.reloads)|0)};}catch{return null;}
}
// Storage that never throws (private mode, blocked storage, quota): get → null, set/remove → false.
export const safeStore=store=>({get(k){try{return store?.getItem(k)??null;}catch{return null;}},set(k,v){try{store.setItem(k,v);return true;}catch{return false;}},remove(k){try{store.removeItem(k);return true;}catch{return false;}}});
// fetch with a timeout (AbortSignal.timeout where available).
export function timeoutSignal(ms){if(typeof AbortSignal!=='undefined'&&AbortSignal.timeout)return AbortSignal.timeout(ms);const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal;}
// Poll backoff: the normal period while the server answers; doubling up to `max` while it does not.
export const nextPollDelay=(base,failures,max=6e4)=>failures>0?Math.min(max,base*2**Math.min(failures,10)):base;
