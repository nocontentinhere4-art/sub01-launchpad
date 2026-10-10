import test from 'node:test';
import assert from 'node:assert/strict';
import {telemetryPayload,fpsBucket,gpuClass,optedOut,newSession,startTelemetry} from '../src/telemetry.js';

const KEYS=['session','device','gpu_class','quality_level','fps_bucket','crash','context_lost','memory_mb','seconds'];
test('payload: exactly the server\'s nine keys, clamped',()=>{
 const p=telemetryPayload({session:'abcdefghijklmnop',phone:true,gpu:'Mali-T860',level:2,ema:40,crash:true,contextLost:false,memoryBytes:512*1048576,seconds:90.4,wallet:'X',extra:1});
 assert.deepEqual(Object.keys(p),KEYS);
 assert.deepEqual(p,{session:'abcdefghijklmnop',device:'phone',gpu_class:'weak',quality_level:2,fps_bucket:'20-30',crash:true,context_lost:false,memory_mb:512,seconds:90});
 const q=telemetryPayload({session:'abcdefghijklmnop',phone:false,gpu:'',level:9,ema:10,memoryBytes:undefined,seconds:1e9});
 assert.equal(q.gpu_class,null);assert.equal(q.quality_level,3);assert.equal(q.memory_mb,null);assert.equal(q.seconds,86400);assert.equal(q.device,'desktop');
 assert.equal(telemetryPayload({session:'short',ema:16}),null,'bad session');assert.equal(telemetryPayload({session:'abcdefghijklmnop',ema:null}),null,'no fps yet');
});
test('fps buckets and GPU class',()=>{
 assert.equal(fpsBucket(60),'<20');assert.equal(fpsBucket(40),'20-30');assert.equal(fpsBucket(25),'30-45');assert.equal(fpsBucket(16.7),'45+');assert.equal(fpsBucket(0),null);
 assert.equal(gpuClass('Apple M2'),'ok');assert.equal(gpuClass('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))'),'weak');assert.equal(gpuClass(null),null);
});
test('opt-out: Do Not Track or Global Privacy Control sends nothing',()=>{
 assert.ok(optedOut({doNotTrack:'1'},{}));assert.ok(optedOut({doNotTrack:'yes'},{}));assert.ok(optedOut({globalPrivacyControl:true},{}));assert.ok(optedOut({},{doNotTrack:'1'}));
 assert.ok(!optedOut({doNotTrack:'0'},{}));assert.ok(!optedOut({doNotTrack:'unspecified'},{}));assert.ok(!optedOut({},{}));
 let sent=0;const t=startTelemetry(()=>({phone:false,gpu:'x',level:3,ema:16}),{nav:{doNotTrack:'1',sendBeacon:()=>{sent++;return true;}}});
 assert.equal(t.off,true);assert.equal(t.send(true),false);assert.equal(sent,0);assert.match(t.line(),/off in this browser/);t.stop();
});
test('session ids: fresh, 24 url-safe characters',()=>{
 const a=newSession(),b=newSession();assert.match(a,/^[A-Za-z0-9_-]{24}$/);assert.notEqual(a,b);
});
