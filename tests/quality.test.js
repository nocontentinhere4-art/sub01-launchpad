import test from 'node:test';
import assert from 'node:assert/strict';
import {QUALITY,DEVICE_CAPS,GOV,settingsFor,startLevel,weakGpu,gpuName,createGovernor,createFuse,packResume,unpackResume,safeStore,nextPollDelay,RESUME_MAX_AGE} from '../src/quality.js';
import {glowPlan} from '../src/city-life.js';

// Feeds `ms` frames for `seconds` starting at t; returns the end time and every non-null result.
function run(g,ms,seconds,t){const out=[];const end=t+seconds*1e3;for(;t<end;t+=ms){const r=g.sample(ms,t);if(r)out.push({r,t});}return {t,out};}

test('device start level: desktop 3, phone 2, weak GPU or a small device 1',()=>{
 assert.equal(startLevel({phone:false,gpu:'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'}),3);
 assert.equal(startLevel({phone:true,gpu:'Adreno (TM) 740'}),2);
 assert.equal(startLevel({phone:true,gpu:'Apple GPU',deviceMemory:4,cores:6}),2);
 for(const gpu of ['Mali-400 MP','Mali-T720','Mali-T830 MP1','Adreno (TM) 306','Adreno (TM) 430','Adreno (TM) 540','Apple A9 GPU','Apple A11 GPU','PowerVR Rogue GE8320',
  'Google SwiftShader','llvmpipe (LLVM 15.0.7, 256 bits)','ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'])
  {assert.ok(weakGpu(gpu),gpu);assert.equal(startLevel({phone:false,gpu}),1,gpu);}
 for(const gpu of ['Mali-G78 MC14','Adreno (TM) 650','Adreno (TM) 740','Apple A15 GPU','Apple M1','NVIDIA GeForce RTX 3060','ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)','',null])
  assert.equal(weakGpu(gpu),false,String(gpu));
 assert.equal(startLevel({phone:false,deviceMemory:2}),1);assert.equal(startLevel({phone:true,cores:2}),1);
 assert.equal(startLevel({phone:false,deviceMemory:8,cores:8}),3);assert.equal(startLevel({phone:false,deviceMemory:undefined,cores:undefined}),3);
 // The renderer string comes from the debug extension; a browser that hides it or throws gives ''.
 const gl={getExtension:()=>({UNMASKED_RENDERER_WEBGL:7}),getParameter:p=>p===7?'Mali-T760':'WebKit WebGL'};
 assert.equal(gpuName(gl),'Mali-T760');assert.equal(gpuName({getExtension:()=>null,getParameter:()=>'WebKit WebGL',RENDERER:1}),'WebKit WebGL');
 assert.equal(gpuName({getExtension(){throw new Error('no');}}),'');assert.equal(gpuName(null),'');
});

test('level → settings: monotonic sacrifices, device caps keep the shipped numbers at the top',()=>{
 // Desktop at 3 and phone at 2 (their start levels) draw exactly what the city drew before the governor.
 const d=settingsFor(3,{mobile:false,dpr:2}),p=settingsFor(2,{mobile:true,dpr:3});
 assert.deepEqual([d.precip,d.crowdCap,d.crowdTris,d.shadow,d.pixelRatio,d.wisps,d.detail,d.reflections],[4000,160,1e6,1024,1.5,5,true,true]);
 assert.deepEqual([p.precip,p.crowdCap,p.crowdTris,p.shadow,p.pixelRatio,p.wisps,p.detail,p.reflections],[1600,64,4e5,512,1.25,3,true,true]);
 assert.deepEqual(settingsFor(3,{mobile:true}),{...settingsFor(2,{mobile:true}),level:3,name:'full'});
 // Every knob only ever gets cheaper going down.
 for(const mobile of [false,true])for(let l=1;l<=3;l++){const hi=settingsFor(l,{mobile}),lo=settingsFor(l-1,{mobile});
  for(const k of ['precip','crowdCap','crowdTris','critters','wisps','fireworks','shadow','pixelRatio'])assert.ok(lo[k]<=hi[k],`${k} ${l}`);
  for(const k of ['splash','reflections','blimp','detail'])assert.ok(!lo[k]||hi[k],`${k} ${l}`);assert.ok(lo.crowdPx>=hi.crowdPx);}
 // Level 0: no GPU crowd, no cast shadows, overview LOD, 0.85 pixels; the device pixel ratio is a ceiling.
 const z=settingsFor(0);assert.deepEqual([z.crowdCap,z.crowdTris,z.shadow,z.detail,z.pixelRatio,z.blimp],[0,0,0,false,.85,false]);
 assert.equal(settingsFor(3,{dpr:1}).pixelRatio,1);assert.equal(settingsFor(1,{dpr:1}).pixelRatio,1);assert.equal(settingsFor(0,{dpr:1}).pixelRatio,.85);
 assert.deepEqual([3,2,1,0].map(l=>settingsFor(l).shadow),[1024,1024,512,0]);assert.deepEqual([3,2,1,0].map(l=>settingsFor(l,{mobile:true}).shadow),[512,512,512,0]);assert.equal(settingsFor(-4).level,0);assert.equal(settingsFor(9).level,3);assert.equal(settingsFor('x').level,0);
 assert.equal(QUALITY.length,4);assert.ok(DEVICE_CAPS.mobile.precip<DEVICE_CAPS.desktop.precip);
 // The steam hook: wisps per vent capped, the default unchanged.
 const vents=[{x:0,y:0,z:0},{x:5,y:0,z:5}],steam=o=>glowPlan({vents,...o}).filter(g=>g.kind===2).length;
 assert.equal(steam({}),10);assert.equal(steam({wisps:2}),4);assert.equal(steam({mobile:true}),6);assert.equal(steam({mobile:true,wisps:9}),6);assert.equal(steam({wisps:0}),0);
});

test('governor: grace after load, EMA, step down after 3 s slow, never below 0',()=>{
 const changes=[],g=createGovernor({level:3,now:0,onChange:(l,i)=>changes.push([l,i.reason])});
 // The first 5 s are ignored entirely (shader compiles, asset uploads).
 assert.equal(run(g,200,4.9,0).out.length,0);assert.equal(g.ema,null);
 let {t}=run(g,16.7,2,5000);assert.ok(Math.abs(g.ema-16.7)<.01);
 // 50 ms frames: the EMA crosses 38 ms in about 1 s, then 3 s must pass before the step.
 const slow=run(g,50,6,t);assert.equal(slow.out.length,1);assert.equal(g.level,2);assert.deepEqual(changes,[[2,'down']]);
 const at=slow.out[0].t-t;assert.ok(at>3500&&at<5000,`stepped after ${at} ms`);
 // A change is followed by its own grace (2 s) and a fresh EMA: no cascade straight to 0.
 assert.ok(g.graceUntil>=slow.out[0].t+GOV.grace.change);
 ({t}=run(g,50,60,slow.t));assert.equal(g.level,0);assert.deepEqual(changes.map(c=>c[0]),[2,1,0]);
 run(g,100,10,t);assert.equal(g.level,0);
 // Samples are clamped: one 5 s hitch is a 250 ms frame, and not-a-number is ignored.
 const h=createGovernor({now:0});h.sample(16,6000);h.sample(5000,6016);assert.ok(h.ema<=250);assert.equal(h.sample(NaN,7000),null);
});

test('governor: step up after 20 s fast with no step down in the last 60 s; jitter between thresholds holds',()=>{
 const g=createGovernor({level:1,now:0});
 // 30 ms frames (between 20 and 38): nothing happens, ever.
 let {t,out}=run(g,30,120,5000);assert.equal(out.length,0);assert.equal(g.level,1);
 // Fast: up after ~20 s (+ the EMA settling), then up again 20 s after the change's grace.
 ({t,out}=run(g,10,25,t));assert.equal(g.level,2);assert.equal(out[0].r,'up');
 ({t}=run(g,10,25,t));assert.equal(g.level,3);run(g,10,60,t);assert.equal(g.level,3);
 // Hysteresis: after a step down, 60 s must pass before any step up even if the city is fast again.
 const h=createGovernor({level:3,now:0}),down=run(h,60,6,5000);assert.equal(h.level,2);
 let r=run(h,10,40,down.t);assert.equal(h.level,2,'no step up within 60 s of a step down');
 r=run(h,10,30,r.t);assert.equal(h.level,3);
 // No oscillation: alternating 5 s slow / 5 s fast never steps up again.
 const o=createGovernor({level:3,now:0});let tt=5000;for(let i=0;i<30;i++){tt=run(o,i%2?10:55,5,tt).t;}
 assert.equal(o.steps.filter(s=>s.reason==='up').length,0);assert.ok(o.level<3);
});

test('governor: manual set, auto off pins the level, grace resets the EMA',()=>{
 const seen=[],g=createGovernor({level:2,now:0,auto:false,onChange:(l,i)=>seen.push(i.reason)});
 run(g,80,30,5000);assert.equal(g.level,2);assert.ok(g.ema>70,'still measured while pinned');
 assert.equal(g.set(0,40000),'manual');assert.equal(g.level,0);assert.equal(g.set(0,40001),null);assert.equal(g.set(7,40002),'manual');assert.equal(g.level,3);
 g.auto=true;g.grace(1000,50000);assert.equal(g.ema,null);assert.equal(g.sample(16,50500),null);assert.equal(g.ema,null);g.sample(16,51001);assert.equal(g.ema,16);
 assert.deepEqual(seen,['manual','manual']);
 // max caps the climb.
 const m=createGovernor({level:1,max:2,now:0});run(m,10,120,5000);assert.equal(m.level,2);
});

test('subsystem fuse: three errors in a row switch it off once; a good frame resets the count',()=>{
 const logs=[],f=createFuse('weather',{log:(...a)=>logs.push(a)});let n=0;
 const bad=()=>{n++;throw new Error('boom');};
 f.run(bad);f.run(bad);assert.equal(f.run(()=>42),42);assert.equal(f.fails,0);
 f.run(bad);f.run(bad);assert.equal(f.off,false);f.run(bad);assert.equal(f.off,true);assert.equal(logs.length,1);assert.match(logs[0][0],/weather switched off/);
 assert.equal(f.run(bad),undefined);assert.equal(n,5,'not called once off');assert.equal(logs.length,1);
 f.reset();assert.equal(f.off,false);assert.equal(f.run((a,b)=>a+b,2,3),5);
});

test('resume state survives a reload round trip; stale or garbage records are refused',()=>{
 const mem=new Map(),store=safeStore({getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)});
 const now=1e12,text=packResume({target:{x:29.123456,y:2,z:-7.5},zoom:.723456,district:'shibuya',dayMode:'night',weather:'rain',reloads:1},now);
 assert.ok(store.set('k',text));
 const r=unpackResume(store.get('k'),now+1500,{weathers:['clear','rain','auto']});
 assert.deepEqual(r,{target:{x:29.12,y:2,z:-7.5},zoom:.7235,district:'shibuya',dayMode:'night',weather:'rain',reloads:1});
 assert.equal(unpackResume(text,now+RESUME_MAX_AGE+1),null,'too old');assert.equal(unpackResume(text,now-5),null,'from the future');
 for(const bad of [null,'','{','[]','{"v":2}',JSON.stringify({v:1,at:now,t:[1,2],zoom:1}),JSON.stringify({v:1,at:now,t:[1,2,'x'],zoom:1}),JSON.stringify({v:1,at:now,t:[1,2,3],zoom:0})])
  assert.equal(unpackResume(bad,now),null,String(bad));
 const odd=unpackResume(JSON.stringify({v:1,at:now,t:[1,2,3],zoom:1,dayMode:'<script>',weather:'acid',district:5}),now,{weathers:['clear']});
 assert.deepEqual([odd.dayMode,odd.weather,odd.district,odd.reloads],['day','auto','',0]);
 // Blocked storage never throws.
 const blocked=safeStore({getItem(){throw new Error('denied');},setItem(){throw new Error('quota');},removeItem(){throw new Error('denied');}});
 assert.equal(blocked.get('a'),null);assert.equal(blocked.set('a','b'),false);assert.equal(blocked.remove('a'),false);assert.equal(safeStore(null).get('a'),null);
});

test('poll backoff: normal period while up, doubling to a minute while down',()=>{
 assert.deepEqual([0,1,2,3,4,5,40].map(f=>nextPollDelay(4e3,f)),[4e3,8e3,16e3,32e3,6e4,6e4,6e4]);
});
