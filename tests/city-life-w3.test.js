// Wave 3A: night traffic, trains, critters, steam, screens and the blimp.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {trafficLightPhase,vehicleState,addCityTraffic} from '../src/city-traffic.js';
import {ROLE} from '../src/vehicles.js';
import {crossingState} from '../src/city-crowd.js';
import {addCityLife,expressPosition,EXPRESS,steamVents,glowPlan,glowBuffers,GLOW_BUDGET,setCityWorld,stationPlan} from '../src/city-life.js';
import {critterPlan,critterBuffers,CRITTER_BUDGET,catSpots,PIGEON_FLOCKS,blimpState,blimpPoints,UI_ZONES,inQuad,bannerText,BLIMP} from '../src/city-sky.js';
import {screenCards,screenAt,safeImageUrl,IDLE_CARD,SCREEN_PERIOD,MAX_CARDS} from '../src/city-screens.js';
import {CATEGORY} from '../src/lots.js';

const finite=a=>Array.from(a).every(Number.isFinite);

test('traffic lights follow the crossing cycle: cars red while people cross, never green together',()=>{
 for(let t=0;t<96;t+=.1){const s=trafficLightPhase(t),c=crossingState(t);
  if(c.pedestrianGreen)assert.equal(s.vehicle,'red',`t=${t}`);
  if(s.vehicle!=='red')assert.equal(s.pedestrian,'red');
  if(s.pedestrian!=='red')assert.ok(c.pedestrianGreen);
}
 assert.equal(trafficLightPhase(3).pedestrian,'green');assert.equal(trafficLightPhase(12).vehicle,'green');assert.equal(trafficLightPhase(23).vehicle,'amber');
 const blink=new Set();for(let t=7;t<9;t+=.05)blink.add(trafficLightPhase(t).pedestrian);assert.deepEqual([...blink].sort(),['green','off'],'the walk light blinks before red');
});
test('vehicle lamps glow from the same batches: head/tail lamps, indicators and the taxi sign are vertex roles; vehicleState feeds city-life',()=>{
 const tr=addCityTraffic(new THREE.Group());
 for(const [type,M] of Object.entries(tr.meshes)){const roles=new Set();const a=M.mesh.geometry.getAttribute('aPart');for(let i=0;i<a.count;i++)roles.add(a.getY(i));
  for(const r of [ROLE.head,ROLE.tail,ROLE.indL,ROLE.indR])assert.ok(roles.has(r),`${type} has role ${r}`);
  assert.equal(roles.has(ROLE.sign),type==='taxi','only taxis carry a roof sign');}
 assert.equal(tr.root.children.length,Object.keys(tr.meshes).length+1,'one mesh per type plus the wheels');
 tr.update(1);for(let i=0;i<16;i++){const s=vehicleState(1,i);assert.ok([s.x,s.z,s.yaw].every(Number.isFinite));}
});
test('express: one pass per 90 s window at a hashed moment, continuous while it runs, off the map otherwise',()=>{
 let passes=0,prev=null;const starts=[];
 for(let t=0;t<1800;t+=.25){const e=expressPosition(t);if(e.x!==null){assert.ok(Math.abs(e.x)<=EXPRESS.span+1e-9);if(prev!==null)assert.ok(Math.abs(e.x-prev)<EXPRESS.speed*.25+1e-6);}
  if(e.x!==null&&prev===null){passes++;starts.push(t%EXPRESS.window);}prev=e.x;}
 assert.equal(passes,20);assert.ok(new Set(starts.map(s=>Math.round(s))).size>10,'not on a fixed beat');
});
test('glow batch (pools, cones, steam, nav and signal lights) stays finite and within budget',()=>{
 const vents=steamVents([]);
 assert.ok(vents.length>=20&&vents.length<=33,`2–3 vents per commercial district (${vents.length})`);
 for(const v of vents)assert.ok([v.x,v.y,v.z].every(Number.isFinite)&&v.y>0);
 for(const mobile of [false,true]){const plan=glowPlan({mobile,vents,lamps:[{x:1,y:2,z:3,role:0}]}),b=glowBuffers(plan);
  assert.ok(b.count<=GLOW_BUDGET[mobile?'mobile':'desktop']);assert.ok(finite(b.aG)&&finite(b.aPos));
  assert.equal(plan.filter(o=>o.kind<2).length,32,'a pool and a cone per vehicle');}
});
test('critters: crows, pigeons and cats in one finite batch within the phone and desktop budgets',()=>{
 for(const mobile of [false,true]){const plan=critterPlan({mobile}),b=critterBuffers(plan);
  assert.ok(b.count<=CRITTER_BUDGET[mobile?'mobile':'desktop'],`${b.count}`);assert.ok(finite(b.aC)&&finite(b.aP)&&finite(b.color));
  const kinds=new Set(plan.map(o=>o.kind));assert.deepEqual([...kinds].sort(),[0,1,2]);
  assert.equal(new Set(plan.filter(o=>o.kind===0).map(o=>o.group)).size,mobile?2:3,'crow flocks');
  assert.equal(new Set(plan.filter(o=>o.kind===1).map(o=>o.group)).size,PIGEON_FLOCKS.length);}
 const cats=catSpots();
 for(const c of cats)assert.ok(['home','old'].includes(CATEGORY[c.district]??'home'),'cats only in the low districts');
 const per={};for(const c of cats)per[c.district]=(per[c.district]||0)+1;
 assert.ok(Object.values(per).every(n=>n>=1&&n<=3));
});
test('screens: public projects only, launched first, deduped, server text, idle card when empty',()=>{
 const world={plots:[
  {plotId:'a-1',project:{slug:null,name:'Private project',ticker:null,stage:'generating',progress:.4}},
  {plotId:'a-2',project:{slug:'ramen',name:'Ramen Index',ticker:'ramen!',stage:'evaluating',stageLabel:'SUB-01 is thinking about it',progress:.12,logoUrl:'/meta/ramen/logo-v1.png',bannerUrl:'https://evil.example/x.svg'}},
  {plotId:'a-3',project:{slug:'melon',name:'Melon Bread Club',ticker:'MELON',stage:'launched',progress:1,launched:true,bannerUrl:'/meta/melon/banner-v2.svg'}},
  {plotId:'a-4',project:{slug:'ramen',name:'Ramen Index',ticker:'RAMEN',stage:'evaluating',progress:.12}},
  {plotId:'a-5',project:{slug:'gone',name:'Gone',ticker:'GONE',stage:'declined',progress:0}},
  {plotId:'a-6',project:{slug:'owl',name:'Night Owl FM',ticker:'OWL',stage:'preview_ready',stageLabel:'Preview ready for your review',progress:.65}},
  {plotId:'a-7',kind:'apartment',project:null}]};
 const cards=screenCards(world);
 assert.deepEqual(cards.map(c=>c.title),['Melon Bread Club','Night Owl FM','Ramen Index']);
 assert.deepEqual(cards.map(c=>c.ticker),['$MELON','$OWL','$RAMEN']);
 assert.deepEqual(cards.map(c=>c.stage),['LAUNCHED','Preview ready for your review','SUB-01 is thinking about it']);
 assert.equal(cards[0].image,'/meta/melon/banner-v2.svg');assert.equal(cards[2].image,null,'foreign URLs are never loaded');assert.equal(cards[2].logo,'/meta/ramen/logo-v1.png');
 assert.ok(!JSON.stringify(cards).includes('Private'));
 assert.deepEqual(screenCards(null),[]);assert.deepEqual(screenCards({plots:[]}),[]);
 assert.equal(IDLE_CARD.title,'YOUR IDEA.');assert.equal(IDLE_CARD.stage,'NEXT ADDRESS.');
 assert.equal(safeImageUrl('/meta/x/logo-v1.png'),'/meta/x/logo-v1.png');assert.equal(safeImageUrl('javascript:alert(1)'),null);assert.equal(safeImageUrl('/meta/../x'),null);
 const many={plots:Array.from({length:30},(_,i)=>({project:{slug:'p'+i,name:'P'+i,ticker:'P'+i,stage:'generating',progress:i/30}}))};
 assert.equal(screenCards(many).length,MAX_CARDS);
});
test('screen cycling: every 8 s in order, a wipe in the last 0.7 s, the hero billboards one card ahead',()=>{
 const cards=[{key:'a'},{key:'b'},{key:'c'}];
 assert.deepEqual(screenAt(cards,0),{index:0,next:1,wipe:0});
 assert.equal(screenAt(cards,SCREEN_PERIOD).index,1);assert.equal(screenAt(cards,3*SCREEN_PERIOD).index,0);
 assert.ok(screenAt(cards,SCREEN_PERIOD-.35).wipe>.4&&screenAt(cards,SCREEN_PERIOD-.35).wipe<.6);
 assert.equal(screenAt(cards,1,1).index,1);assert.equal(screenAt([{key:'x'}],7.9).wipe,0,'a single card never wipes');
 assert.equal(screenAt([],5).index,-1);
});
test('blimp: slow, smooth, above the city centre/north and never under the UI panels',()=>{
 let prev=blimpState(0);
 for(let t=0;t<4000;t+=.5){const s=blimpState(t);assert.ok([s.x,s.y,s.z,s.yaw].every(Number.isFinite));
  assert.ok(Math.hypot(s.x-prev.x,s.z-prev.z)<1.5,'slow');assert.ok(s.y>BLIMP.y-1&&s.y<BLIMP.y+1);prev=s;
  for(const p of blimpPoints(s))for(const [layout,zones] of Object.entries(UI_ZONES))for(const [name,q] of Object.entries(zones))assert.ok(!inQuad(q,p.x,p.z),`${layout} ${name} at t=${t}`);}
 // The same check through the real default cameras (main.js resetView), in screen pixels, with the banner's full depth.
 for(const [w,h,mobile,rects] of [[1440,900,false,[[0,0,1440,100],[1148,120,1440,740],[0,790,610,900],[1125,815,1440,900],[0,120,380,350]]],[390,844,true,[[0,0,390,100],[0,110,215,245],[338,390,390,630],[0,630,390,844]]]]){
  const half=mobile?18:16.5,cam=new THREE.OrthographicCamera(-half*w/h,half*w/h,half,-half,.1,400),p=40*Math.PI/180,y=36*Math.PI/180,tg=new THREE.Vector3(0,8,-7);
  cam.position.set(tg.x+168*Math.cos(p)*Math.sin(y),tg.y+168*Math.sin(p),tg.z+168*Math.cos(p)*Math.cos(y));cam.lookAt(tg);cam.zoom=mobile?.09:.19;cam.updateProjectionMatrix();cam.updateMatrixWorld();
  for(let t=0;t<1000;t+=1)for(const q of blimpPoints(blimpState(t))){const v=new THREE.Vector3(q.x,q.y,q.z).project(cam),sx=(v.x*.5+.5)*w,sy=(-v.y*.5+.5)*h;
   assert.ok(sx>0&&sx<w&&sy>0&&sy<h,'on screen');for(const [x0,y0,x1,y1] of rects)assert.ok(!(sx>x0&&sx<x1&&sy>y0&&sy<y1),`${mobile?'phone':'desktop'} panel ${[x0,y0,x1,y1]} t=${t}`);}}
});
test('blimp banner: the latest public launch from the server, else SUBZERONE · TOKYO',()=>{
 const now=Date.now();
 assert.equal(bannerText({}),'SUBZERONE · TOKYO');assert.equal(bannerText(null),'SUBZERONE · TOKYO');
 assert.equal(bannerText({now,events:[{kind:'launched',ticker:'old',at:now-5*3600e3},{kind:'launched',ticker:'melon',at:now-600e3},{kind:'accepted',ticker:'X',at:now}]}),'$MELON just launched');
 assert.equal(bannerText({now,events:[{kind:'launched',ticker:'OLD',at:now-5*3600e3}]}),'$OLD launched today');
 assert.equal(bannerText({plots:[{project:{slug:'a',ticker:'AAA',launched:true}},{project:{slug:null,ticker:'PRIV',launched:true}}]}),'$AAA launched here');
});
test('city life wires the world: cards, banner and critters update; every new batch is finite after many frames',()=>{
 const life=addCityLife(new THREE.Group());
 setCityWorld({now:Date.now(),plots:[{plotId:'shibuya-4',kind:'project',project:{slug:'melon',name:'Melon',ticker:'MELON',stage:'launched',progress:1,launched:true}}],events:[{kind:'launched',ticker:'MELON',at:Date.now()}]});
 assert.equal(life.screen.cards.length,1);assert.equal(life.sky.banner,'$MELON just launched');
 assert.ok(life.stats().heroes>=1,'hero billboards in the other neon districts show the cards');
 life.setNight(true);
 for(const t of [0,9,12.3,23.9,90,777.7]){life.update(t);const m=new THREE.Matrix4();for(let i=0;i<life.trainMesh.count;i++){life.trainMesh.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite));}}
 setCityWorld(null);assert.equal(life.screen.cards.length,0);assert.equal(life.sky.banner,'SUBZERONE · TOKYO');assert.equal(life.stats().heroes,0);
 life.dispose();
});

test('metro station (owner 2026-10-10): a roofed side platform on piers, stair and street kiosk, clear of the trains, ≤ 600 boxes',()=>{
 const SX=-36.4,trackZ=108,st=stationPlan({SX,trackZ}),all=[...st.solid,...st.detail];
 assert.ok(all.length+st.windows.length<=600,`${all.length+st.windows.length} boxes`);assert.ok(all.length>=80,'a real station, not a slab');
 for(const b of [...all,...st.windows]){assert.ok([b.x,b.y,b.z,b.w,b.h,b.d].every(Number.isFinite),JSON.stringify(b));assert.ok(b.y-b.h/2>=-1e-9,'nothing below ground');}
 // The trains run at z trackZ ± 0.7 (cars 1.05 deep) between y 4.25 and 5.5: no station box reaches into that envelope.
 const train={z0:trackZ-1.35,z1:trackZ+1.35,y0:4.0,y1:6.6};
 for(const b of all){const zr=b.rx?Math.hypot(b.h,b.d)/2:b.ry?Math.hypot(b.w,b.d)/2:b.d/2,yr=b.rx?Math.hypot(b.h,b.d)/2:b.rz?Math.hypot(b.w,b.h)/2:b.h/2,z0=b.z-zr,z1=b.z+zr,y0=b.y-yr,y1=b.y+yr;
  assert.ok(!(z0<train.z1&&z1>train.z0&&y0<train.y1&&y1>train.y0),`in the trains' way ${JSON.stringify(b)}`);}
 // The platform's edge sits beside the track at y 4.8; piers reach the ground; the roof is thick and above the platform.
 const platform=st.solid.find(b=>b.w===14&&b.h===.5);assert.ok(platform&&Math.abs(platform.z-platform.d/2-(trackZ+1.35))<1e-9&&Math.abs(platform.y+platform.h/2-4.8)<1e-9);
 const piers=st.solid.filter(b=>b.h===4.3&&b.w===.6);assert.equal(piers.length,3);for(const p of piers)assert.ok(Math.abs(p.y-p.h/2)<1e-9,'pier on the ground');
 const roof=st.solid.filter(b=>b.rx&&b.w===15);assert.equal(roof.length,2,'a gabled roof: two slopes');for(const r of roof)assert.ok(r.h>=.3&&r.y>7,'thick, above the platform');
 assert.ok(st.solid.some(b=>b.w===13.6&&b.h===.02&&b.color==='#E3BE3C'),'the yellow tactile line');
 // Six pillars (two boxes each), glass panels between them, the navy board lit at night with a green chip.
 assert.equal(st.solid.filter(b=>b.ry!==undefined&&b.h===2.7).length,12);assert.equal(st.solid.filter(b=>b.color==='#A9C4CC'&&b.h===1.4).length,5);
 assert.ok(st.solid.some(b=>b.color==='#1F3A5C'&&b.w===4.6),'name board');assert.ok(st.windows.some(b=>b.color==='#3E9B5C'),'line chip at night');
 // The stair steps down from the platform to the street (its last tread ≈ sidewalk) and the kiosk stands beyond its foot.
 const steps=st.solid.filter(b=>b.d===1.6&&b.color==='#B4B1A7');assert.equal(steps.length,10);const tops=steps.map(b=>b.y+b.h/2).sort((a,b)=>b-a);
 assert.ok(tops[0]<4.8&&tops[0]>4.2&&tops.at(-1)<.3,`stair from ${tops[0]} to ${tops.at(-1)}`);
 const foot=Math.max(...steps.map(b=>b.x+b.w/2)),kiosk=st.solid.filter(b=>b.color==='#D6D2C7'&&b.h===2.7&&b.ry===undefined);assert.ok(kiosk.length>=1&&kiosk.every(b=>b.x-b.w/2>=foot-1e-6),'kiosk beyond the stair foot');
 assert.equal(st.detail.filter(b=>b.color==='#E8E4DA'&&b.h===1.0).length,3,'three ticket gates');
 assert.ok(all.every(b=>b.color!=='#2b7886'&&b.color!=='#acb5a6'),'no saturated teal, no old green slab');
});
