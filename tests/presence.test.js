import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESENCE,normalizeWalker,projectOnPath,pointAlong,positionAt,approach,createThrottle,presenceBody,createRemoteSet,createPresenceSender} from '../src/presence.js';
import {PRESENCE_HINT,PRESENCE_HINT_KEY} from '../src/guest.js';

const LOOK={skin:'#c98e66',hair:'#1b1b1b',hairStyle:'bun',top:'#ff6600',bottom:'#222222',outfit:'hoodie'};
const F=(o={})=>({id:'9f1c0a7e3b2d4c55',name:'Aiko',plotId:'ginza-2',look:LOOK,state:'walk',x:0,z:0,yaw:0,speed:2,path:[{x:0,z:0},{x:10,z:0},{x:10,z:10}],at:1,...o});

test('walker frames: normalised, local receipt time, home frames short, junk refused',()=>{
 const w=normalizeWalker(F({at:999999}),5000);
 assert.equal(w.at,5000,'dead reckoning runs on the local clock');assert.equal(w.serverAt,999999);assert.equal(w.path.length,3);assert.equal(w.emote,null);
 assert.deepEqual(normalizeWalker({id:'a',name:'Bo',plotId:'ueno-1',state:'home',at:3},7),{id:'a',name:'Bo',plotId:'ueno-1',state:'home',at:7});
 assert.equal(normalizeWalker(F({path:Array.from({length:40},(_,i)=>({x:i,z:0}))})).path.length,PRESENCE.maxPath);
 assert.deepEqual(normalizeWalker(F({path:[{x:1,z:2},{x:'no'},null,{x:3,z:4}]})).path,[{x:1,z:2},{x:3,z:4}]);
 assert.equal(normalizeWalker(F({x:'ten',speed:-3})).x,0);assert.equal(normalizeWalker(F({speed:-3})).speed,0);
 assert.deepEqual(normalizeWalker(F({look:'hoodie'})).look,{});
 for(const bad of [null,{},{id:5,state:'walk'},{id:'a'},{id:'a',state:'fly'},{id:'',state:'walk'}])assert.equal(normalizeWalker(bad),null);
 assert.ok(!('wallet' in normalizeWalker(F({wallet:'SECRET'}))),'nothing but the public fields is kept');
});
test('dead reckoning: a fix projected on the path, advanced at speed, facing the segment, stopped at the end',()=>{
 const path=[{x:0,z:0},{x:10,z:0},{x:10,z:10}];
 assert.equal(projectOnPath(path,4,1),4);assert.equal(projectOnPath(path,10,3),13);assert.equal(projectOnPath(path,-5,0),0);assert.equal(projectOnPath(path,10,50),20);
 assert.deepEqual(pointAlong(path,5),{x:5,z:0,yaw:Math.PI/2,done:false});
 assert.deepEqual(pointAlong(path,13),{x:10,z:3,yaw:0,done:false});
 assert.deepEqual(pointAlong(path,99),{x:10,z:10,yaw:0,done:true});
 const w=normalizeWalker(F({x:2,z:0,speed:2}),1000);
 assert.deepEqual(positionAt(w,1000),{x:2,z:0,yaw:Math.PI/2,moving:true});
 assert.deepEqual(positionAt(w,3000),{x:6,z:0,yaw:Math.PI/2,moving:true});
 const p=positionAt(w,6500);assert.ok(Math.abs(p.x-10)<1e-9&&Math.abs(p.z-3)<1e-9&&p.yaw===0&&p.moving);
 assert.deepEqual(positionAt(w,60000),{x:10,z:10,yaw:0,moving:false},'never past the end');
 assert.deepEqual(positionAt(w,500),{x:2,z:0,yaw:Math.PI/2,moving:true},'a fix from the future is not rewound');
 assert.deepEqual(positionAt(normalizeWalker(F({state:'idle',x:3,z:4,yaw:1}),0),5000),{x:3,z:4,yaw:1,moving:false});
 assert.deepEqual(positionAt(normalizeWalker(F({path:[],x:3,z:4,yaw:1}),0),5000),{x:3,z:4,yaw:1,moving:false},'no path: standing where the fix says');
});
test('approach: smooth towards the target, a snap when more than 3 units off, the shortest turn',()=>{
 const cur={x:0,z:0,yaw:0};
 assert.equal(approach(cur,{x:1,z:0,yaw:.5},.05),'move');assert.ok(cur.x>0&&cur.x<1&&cur.yaw>0&&cur.yaw<.5);
 assert.equal(approach(cur,{x:1,z:0,yaw:.5},10),'move');assert.ok(Math.abs(cur.x-1)<1e-9&&Math.abs(cur.yaw-.5)<1e-9,'a long frame lands on the target');
 assert.equal(approach(cur,{x:9,z:0,yaw:0},.016),'snap');assert.deepEqual(cur,{x:9,z:0,yaw:0});
 const c2={x:0,z:0,yaw:3};approach(c2,{x:0,z:0,yaw:-3},1);assert.ok(Math.abs(Math.abs(c2.yaw)-3)<.3,'3 → −3 goes the short way round, through π');
 assert.equal(approach({x:0,z:0,yaw:0},{x:1,z:1,yaw:0},0),'hold');
});
test('throttle: a changed path at once but never within 1 s, a fix every 2 s: ≤ 1 message a second',()=>{
 const th=createThrottle();
 assert.equal(th.due(0,{changed:true}),true);th.sent(0);
 assert.equal(th.due(300,{changed:true}),false,'a second change 300 ms later waits');assert.equal(th.dirty,true);
 assert.equal(th.due(900),false);assert.equal(th.due(1000),true,'…and goes out at the 1 s mark');th.sent(1000);
 assert.equal(th.due(2000),false);assert.equal(th.due(3000),true,'a plain fix every 2 s');th.sent(3000);
 assert.equal(th.due(3999),false);
 // a busy walker (a tap every 100 ms for 10 s) still sends at most one message a second
 const t2=createThrottle();let sent=0;for(let t=0;t<=10000;t+=100){if(t2.due(t,{changed:true})){sent++;t2.sent(t);}}
 assert.equal(sent,11);
});
test('the POST body: rounded, the path only when it changed, cut to fit 600 bytes, home is just home',()=>{
 const path=[{x:29.512,z:2.349},{x:43.5,z:2.35},{x:43.5,z:-38}];
 assert.deepEqual(presenceBody({state:'walk',x:29.512,z:2.349,yaw:4,speed:2.2,path,withPath:true}),{state:'walk',x:29.51,z:2.35,yaw:+(4-2*Math.PI).toFixed(2),speed:2.2,path:[{x:29.5,z:2.3},{x:43.5,z:2.4},{x:43.5,z:-38}]});
 assert.deepEqual(presenceBody({state:'walk',x:1,z:2,yaw:0,speed:2.2,path,withPath:false}),{state:'walk',x:1,z:2,yaw:0,speed:2.2});
 assert.deepEqual(presenceBody({state:'home',x:1,z:2,yaw:0,speed:0}),{state:'home'});
 const long=Array.from({length:24},(_,i)=>({x:-101.5+i*.1,z:-101.5}));
 const b=presenceBody({state:'walk',x:-101.5,z:-101.5,yaw:-3.14159,speed:4.6,path:long,withPath:true});
 assert.ok(JSON.stringify(b).length<=600&&b.path.length>=2&&b.path.length<24,`cut to ${b.path.length} points, ${JSON.stringify(b).length} B`);
});
test('remote set: merge, snapshot replaces, home removes, stale walkers expire after the TTL, looks keep identity',()=>{
 const set=createRemoteSet({ttlMs:1000});
 assert.deepEqual(set.apply([F(),F({id:'b',name:'Bo'})],100),[{added:'9f1c0a7e3b2d4c55'},{added:'b'}]);
 const look=set.get('b').look;
 assert.deepEqual(set.apply(F({id:'b',name:'Bo',x:5,look:{...LOOK}}),200),[{updated:'b'}]);
 assert.equal(set.get('b').look,look,'an equal look keeps the cached object (crowd-gpu packs by identity)');
 assert.deepEqual(set.apply({id:'b',name:'Bo',plotId:'x',state:'home'},300),[{removed:'b'}]);
 assert.deepEqual(set.apply({id:'zz',state:'home'},300),[],'a stranger going home is nothing');
 assert.equal(set.size,1);
 assert.deepEqual(set.expire(1000),[]);assert.deepEqual(set.expire(1101),['9f1c0a7e3b2d4c55']);assert.equal(set.size,0);
 set.apply([F({id:'c'}),F({id:'d'})],5000);assert.deepEqual(set.snapshot([F({id:'e'})],5000).map(r=>r.added),['e']);assert.deepEqual(set.list().map(w=>w.id),['e']);
});
test('sender: starts idle, the path goes out as walk, fixes carry no path, stop posts home, a 401 stops it for good',async()=>{
 const posts=[];let t=0;const root={position:{x:1,z:2},rotation:{y:.5}};
 const s=createPresenceSender({root:()=>root,post:b=>{posts.push(b);return Promise.resolve({});},now:()=>t,every:1e9});
 s.start();assert.deepEqual(posts,[{state:'idle',x:1,z:2,yaw:.5,speed:0}]);
 await Promise.resolve();await Promise.resolve();                  // the first post has answered (one in flight at a time)
 t=1500;s.path([{x:1,z:2},{x:9,z:2}],2.2);assert.equal(posts.length,2);assert.deepEqual(posts[1],{state:'walk',x:1,z:2,yaw:.5,speed:2.2,path:[{x:1,z:2},{x:9,z:2}]});
 t=1800;s.path([{x:1,z:2},{x:1,z:9}],4.6);assert.equal(posts.length,2,'a second route 300 ms later waits');
 await Promise.resolve();await Promise.resolve();
 t=2500;root.position.x=3;s.tick();assert.equal(posts.length,3);assert.equal(posts[2].path.length,2);assert.equal(posts[2].speed,4.6,'…and goes with the latest route');
 await Promise.resolve();await Promise.resolve();
 t=4500;s.tick();assert.equal(posts.length,4);assert.deepEqual(posts[3],{state:'walk',x:3,z:2,yaw:.5,speed:4.6},'a plain fix, no path');
 await Promise.resolve();await Promise.resolve();
 s.path(null,0);assert.equal(posts.length,4);t=5500;s.tick();assert.equal(posts[4].state,'idle');
 await Promise.resolve();await Promise.resolve();
 s.stop();assert.deepEqual(posts.at(-1),{state:'home'});assert.equal(s.on,false);
 await Promise.resolve();await Promise.resolve();
 s.tick();assert.equal(posts.length,6,'nothing after stop');assert.equal(s.stats.sent,6);
 const no=createPresenceSender({root:()=>root,post:()=>Promise.reject({status:401}),now:()=>0,every:1e9});
 no.start();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(no.on,false,'a guest / signed-out wallet is not retried');
 const g=createPresenceSender({root:()=>null,post:b=>{posts.push(b);return Promise.resolve({});},now:()=>0,every:1e9});
 g.start();assert.equal(posts.length,6,'nothing until the model has loaded');
});
test('guests hear once why nobody sees them',()=>{assert.equal(PRESENCE_HINT,'Sign in so others can see you walk.');assert.equal(PRESENCE_HINT_KEY,'sub01.presence.hint');});
