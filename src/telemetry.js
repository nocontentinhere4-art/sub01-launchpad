// Anonymous performance reports (POST /api/telemetry, docs/CITY-API.md): every 60 s and once more when the tab is
// hidden or closed (sendBeacon). Exactly the server's keys: device class, GPU class, the governor's level and fps bucket
// (from its frame-cost EMA), crash / context-lost flags, JS heap MB where the browser exposes it, seconds on the page.
// The session id is random per page load and kept only in memory. Do Not Track or Global Privacy Control → nothing sent.
import {weakGpu} from './quality.js';
export const TELEMETRY_MS=6e4,MIN_GAP_MS=3e4;
export const TELEMETRY_LINE='Every minute this page sends anonymous performance numbers: phone or desktop, a GPU class, the quality level, an fps bucket, whether it crashed or lost its graphics, memory in MB and seconds on the page, under a random id made fresh on each visit. No wallet, cookie or IP is stored. Do Not Track or Global Privacy Control turns it off.';
export function optedOut(nav=globalThis.navigator,win=globalThis){
 const v=String(nav?.doNotTrack??win?.doNotTrack??nav?.msDoNotTrack??'').toLowerCase();
 return v==='1'||v==='yes'||nav?.globalPrivacyControl===true;
}
// fps from the governor's EMA (ms per rendered frame); null EMA (warming up, grace) → the healthy bucket is not assumed.
export function fpsBucket(emaMs){const ms=Number(emaMs);if(!(ms>0))return null;const fps=1000/ms;return fps<20?'<20':fps<30?'20-30':fps<45?'30-45':'45+';}
export const gpuClass=name=>typeof name==='string'&&name?weakGpu(name)?'weak':'ok':null;
const ALPHA='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
export function newSession(rand=n=>{const a=new Uint8Array(n);globalThis.crypto?.getRandomValues?.(a);if(a.every(x=>x===0))for(let i=0;i<n;i++)a[i]=Math.random()*256;return a;}){
 return [...rand(24)].map(b=>ALPHA[b%64]).join('');
}
// The body: exactly the nine keys, each clamped to the server's range. A missing fps bucket waits for the next round.
export function telemetryPayload({session,phone,gpu,level,ema,crash,contextLost,memoryBytes,seconds}){
 const fps=fpsBucket(ema);if(!fps||typeof session!=='string'||!/^[A-Za-z0-9_-]{16,32}$/.test(session))return null;
 const mb=Number(memoryBytes)>0?Math.min(65536,Math.round(Number(memoryBytes)/1048576)):null;
 return {session,device:phone?'phone':'desktop',gpu_class:gpuClass(gpu),quality_level:Math.max(0,Math.min(3,Math.round(Number(level))||0)),fps_bucket:fps,
  crash:!!crash,context_lost:!!contextLost,memory_mb:mb,seconds:Math.max(0,Math.min(86400,Math.round(Number(seconds)||0)))};
}

// state() → {phone, gpu, level, ema, contextLost}; crash is set by markCrash() (main.js's error handler).
export function startTelemetry(state,{url='/api/telemetry',nav=globalThis.navigator,now=()=>performance.now()}={}){
 const off=optedOut(nav),session=newSession(),t0=now();let crash=false,lastSent=-Infinity,timer=0;
 function body(){const s=state();return telemetryPayload({session,...s,crash,memoryBytes:globalThis.performance?.memory?.usedJSHeapSize,seconds:(now()-t0)/1e3});}
 function send(beacon=false){
  if(off||now()-lastSent<MIN_GAP_MS)return false;const b=body();if(!b)return false;lastSent=now();const json=JSON.stringify(b);
  if(beacon&&nav?.sendBeacon)try{if(nav.sendBeacon(url,new Blob([json],{type:'application/json'})))return true;}catch{}
  fetch(url,{method:'POST',keepalive:true,credentials:'same-origin',headers:{'content-type':'application/json'},body:json}).catch(()=>{});return true;
 }
 if(!off){timer=setInterval(()=>send(false),TELEMETRY_MS);
  addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')send(true);});addEventListener('pagehide',()=>send(true));}
 return {get off(){return off;},send,markCrash(){crash=true;},stop(){clearInterval(timer);},
  line:()=>TELEMETRY_LINE+(off?' It is off in this browser right now.':' It is on in this browser right now.')};
}
