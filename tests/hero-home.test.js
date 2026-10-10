import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildHeroHome,planHero,homeRoute,floorAt,mailboxFlag,lightsFor,deskProject,boardText,FURNITURE,HOUSE,OFFICE,BEDROOM,LIVING,LOT,GATE,STAIR,DESK_POINT,BED_POINT,F0,F1,EXAMPLES,heightOf,roofOpen,ROOF_RULE,fillers,bicycle} from '../src/hero-home.js';
import {HOME_DESK,HOME_BED,sub01Goal,planRoute} from '../src/world-sync.js';
import {places} from '../src/state.js';

const ROOM=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','public','assets','room');
const inside=(p,b,m=0)=>p.x>=b.x0-m&&p.x<=b.x1+m&&p.z>=b.z0-m&&p.z<=b.z1+m;
// The real Kenney glbs, parsed in node (no textures in the kit), through a template() like main.js's.
const cache=new Map();
const template=(kind,name)=>{if(!cache.has(name))cache.set(name,(async()=>{const b=readFileSync(path.join(ROOM,name+'.glb'));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');})());return cache.get(name);};

test('hero-home: HOME_DESK / HOME_BED are the chair in the office and the bedside in the loft',()=>{
 assert.deepEqual(HOME_DESK,DESK_POINT);assert.deepEqual(HOME_BED,BED_POINT);
 assert.ok(inside(HOME_DESK,OFFICE),'desk in the office');assert.ok(inside(HOME_BED,BEDROOM),'bed in the bedroom');
 assert.equal(sub01Goal({sub01:{state:'asleep'}}).activity,'sleep');assert.deepEqual({x:sub01Goal({sub01:{state:'idle'}}).x,z:sub01Goal({sub01:{state:'idle'}}).z},HOME_DESK);
});

test('hero-home: every piece of furniture stands inside the house (the plant on the balcony), each in its room',()=>{
 const rooms={office:OFFICE,living:LIVING,bedroom:BEDROOM};
 for(const f of FURNITURE){
  if(f.room==='balcony'){assert.ok(f.x>HOUSE.x0&&f.x<-6.4&&f.z>HOUSE.z1&&f.z<-.85,f.item);assert.equal(f.y,F1);continue;}
  assert.ok(inside(f,HOUSE),`${f.item} in the house`);assert.ok(inside(f,rooms[f.room]),`${f.item} in the ${f.room}`);
  assert.equal(f.y>=F1,f.room==='bedroom',`${f.item} on the right floor`);
 }
 const chair=FURNITURE.find(f=>f.item==='chairDesk'),desk=FURNITURE.find(f=>f.item==='desk'),bed=FURNITURE.find(f=>f.item==='bedSingle');
 assert.deepEqual({x:chair.x,z:chair.z},HOME_DESK);assert.ok(Math.abs(desk.x-chair.x)<.01&&desk.z<chair.z,'the chair faces the desk');
 assert.ok(Math.hypot(bed.x-HOME_BED.x,bed.z-HOME_BED.z)<1.2,'the bedside is beside the bed');
});

test('hero-home: the walker goes through the gate and the door, and up the stair to the loft',()=>{
 const street={x:3.4,z:1.6};
 const toDesk=homeRoute(planRoute(street,HOME_DESK));
 assert.deepEqual(toDesk.at(-1),HOME_DESK);
 const gateIdx=toDesk.findIndex(p=>Math.abs(p.x-GATE.x)<1e-9&&Math.abs(p.z-GATE.z)<.5);assert.ok(gateIdx>0,'passes the gate');
 // Outside the lot every leg stays axis-aligned (the city's streets); inside, legs cross no wall but the door line.
 for(let i=1;i<toDesk.length;i++){const a=toDesk[i-1],b=toDesk[i];if(!inside(a,LOT)||!inside(b,LOT))assert.ok(a.x===b.x||a.z===b.z,JSON.stringify([a,b]));}
 for(let i=1;i<toDesk.length;i++){const a=toDesk[i-1],b=toDesk[i];if(a.z>HOUSE.z1!==b.z>HOUSE.z1)assert.ok(Math.abs(a.x-GATE.x)<.8&&Math.abs(b.x-GATE.x)<.8,'enters by the door');}
 // Desk → bed: never leaves the lot, climbs the stair; following floorAt along it ends upstairs.
 const toBed=homeRoute(planRoute(HOME_DESK,HOME_BED),F0);
 assert.ok(toBed.every(p=>inside(p,LOT)),'stays home');assert.deepEqual(toBed.at(-1),HOME_BED);
 let y=F0;for(let i=1;i<toBed.length;i++){const a=toBed[i-1],b=toBed[i];for(let t=0;t<=1;t+=.02)y=floorAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,y)??y;}
 assert.equal(y,F1,'arrives on the loft floor');
 // Bed → street: comes down first, then out through the gate.
 const out=homeRoute(planRoute(HOME_BED,street),F1+.4);y=F1+.4;for(let i=1;i<out.length;i++){const a=out[i-1],b=out[i];for(let t=0;t<=1;t+=.02)y=floorAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,y)??y;}
 assert.equal(y,F0);assert.deepEqual(out.at(-1),street);
 assert.ok(Math.abs(floorAt(-6,(STAIR.zBottom+STAIR.zTop)/2,F0)-(F0+(F1-F0)/2))<1e-9,'half way up the stair');assert.equal(floorAt(20,20,F0),null);
 // A walk that starts and ends at the desk is a no-op.
 assert.equal(homeRoute(planRoute(HOME_DESK,HOME_DESK)).filter((p,i,a)=>i&&Math.hypot(p.x-a[i-1].x,p.z-a[i-1].z)>.05).length>0,true);
});

test('hero-home: the mailbox flag is up while an idea waits in submitted; house lights follow the brain',()=>{
 assert.equal(mailboxFlag(null),false);assert.equal(mailboxFlag({plots:[]}),false);
 assert.equal(mailboxFlag({sub01:{stage:'submitted'}}),true);
 assert.equal(mailboxFlag({plots:[{project:{stage:'evaluating'}},{project:{stage:'submitted'}}]}),true);
 assert.equal(mailboxFlag({plots:[{project:{stage:'evaluating'}},{kind:'apartment'}]}),false);
 assert.equal(lightsFor('asleep'),'asleep');assert.equal(lightsFor('working'),'away');assert.equal(lightsFor('idle'),'home');assert.equal(lightsFor(undefined),'home');
 const w={sub01:{state:'working',plotId:'a-1'},plots:[{plotId:'b-1',project:{name:'Zed',stage:'launched',launched:true,progress:1}},{plotId:'a-1',project:{name:'Moon Soup',ticker:'SOUP',stage:'generating',stageLabel:'Being built',progress:.4}}]};
 assert.equal(deskProject(w).name,'Moon Soup');assert.equal(deskProject({plots:w.plots}).name,'Moon Soup','unlaunched work in progress first');
 assert.equal(deskProject({plots:[{project:{name:'Private project',stage:'evaluating'}}]}),null,'private ideas never reach the whiteboard');
 assert.deepEqual(boardText(deskProject(w)),{title:'Moon Soup',ticker:'$SOUP',stage:'BEING BUILT'});assert.equal(boardText(null).title,'NEXT IDEA?');
});

test('hero-home: the examples keep the city typologies and storey scale, and stay off the street',()=>{
 for(const [id,e] of Object.entries(EXAMPLES)){
  assert.ok(['T1','T3','T4'].includes(e.type),id);assert.equal(heightOf(e),3+2.5*(e.floors-1)+.6);
  if(e.fz>0)assert.ok(e.frontZ<=-.66,id+' behind the north sidewalk');else assert.ok(e.frontZ>=3.86,id+' behind the south sidewalk');
 }
 assert.equal(EXAMPLES.studio.type,'T4');assert.equal(EXAMPLES.lab.type,'T4');assert.equal(EXAMPLES.residence.type,'T3');
 const plan=planHero();assert.deepEqual(plan.picks.map(p=>p.id).sort(),['arcade','home','lab','residence','studio']);
 for(const s of plan.signs)assert.ok(['+z','-z','+x','-x'].includes(s.face));
});

test('hero-home builds without WebGL: one group, 7 draw calls, picks and labels for every place, inside the budget',async()=>{
 const scene=new THREE.Scene(),interactive=[],labels=[];const residence={id:'residence'};
 const hero=await buildHeroHome(scene,{template,interactive,addLabel:(p,h)=>labels.push([p.id,h]),places:{home:places[0],lab:places[1],arcade:places[2],studio:places[3],residence},getWorld:()=>({sub01:{state:'idle'},plots:[]}),getLife:()=>null});
 assert.equal(scene.children.length,1);assert.equal(hero.root.name,'hero-home');
 const s=hero.stats();assert.ok(s.calls<=7,`draw calls ${s.calls}`);assert.ok(s.furniture>1000,'the Kenney furniture is merged in');
 // Budget (wave 5B): ≤ +40k triangles over the old block (~13k measured in the browser); the whole new block stays under 40k.
 assert.ok(s.triangles<40000,`triangles ${s.triangles}`);
 assert.equal(interactive.length,5);assert.deepEqual(labels.map(l=>l[0]).sort(),['arcade','home','lab','residence','studio']);
 for(const m of interactive)assert.equal(m.material.visible,false,'picks are never drawn');
 // The merged furniture sits in the house (not in quantized ±1 model space).
 const f=hero.root.children.find(c=>c.name==='hero furniture');f.geometry.computeBoundingBox();const b=f.geometry.boundingBox;
 assert.ok(b.min.x>HOUSE.x0-.1&&b.max.x<HOUSE.x1+.1&&b.min.z>HOUSE.z0-.1&&b.max.z<-.8&&b.min.y>=F0-.01&&b.max.y<F1+1.6,JSON.stringify(b));
 assert.ok(hero.root.children.some(c=>c.name==='hero monitor'),'the monitor glass is its own mesh');
 // Seat and bed with a stand-in character.
 const root=new THREE.Group();let posed=null,clip=null,emote=null;const c={root,offsets:{seat:.3},pose:k=>{posed=k;},play:n=>{clip=n;},emote:n=>{emote=n;posed='lie';},stopEmote(){emote=null;}};
 root.position.set(HOME_DESK.x,F0,HOME_DESK.z);hero.arrive(c,'desk');assert.equal(posed,'sit');assert.equal(clip,'Interact');assert.equal(hero.seated,'desk');assert.ok(root.position.y>F0,'on the seat');
 hero.stand(c);assert.equal(posed,null);assert.equal(hero.seated,null);
 root.position.set(HOME_BED.x,F1,HOME_BED.z);hero.arrive(c,'sleep');assert.equal(emote,'sleep');assert.ok(root.position.y>F1,'on the bed');
 // Frames without a camera or a city: the mailbox and lights still update.
 hero.update(.016,1,null);assert.equal(hero.mailbox,false);
});

// main.js's camera: ortho, yaw 36°, pitch 40°, 168 from the target at y 2 (aimCamera).
function aimed(x,z,zoom){const cam=new THREE.OrthographicCamera(-18,18,18,-18,.1,400),p=THREE.MathUtils.degToRad(40),y=THREE.MathUtils.degToRad(36),d=168;
 cam.position.set(x+d*Math.cos(p)*Math.sin(y),2+d*Math.sin(p),z+d*Math.cos(p)*Math.cos(y));cam.lookAt(x,2,z);cam.zoom=zoom;cam.updateProjectionMatrix();cam.updateMatrixWorld(true);return cam;}

test('hero-home doll-house: the roof rule (zoom ≥ 1.1, view centred within 9 of the desk) and the lid pieces of the plan',()=>{
 assert.equal(roofOpen({zoom:1.4,target:{x:DESK_POINT.x,z:DESK_POINT.z}}),true);
 assert.equal(roofOpen({zoom:1.4,target:{x:DESK_POINT.x+ROOF_RULE.radius-.1,z:DESK_POINT.z}}),true,'inside the radius');
 assert.equal(roofOpen({zoom:1.4,target:{x:6,z:4}}),false,'looking at the Workshop corner keeps the roof');
 assert.equal(roofOpen({zoom:1.0,target:{x:DESK_POINT.x,z:DESK_POINT.z}}),false,'the overview keeps the roof');
 assert.equal(roofOpen({zoom:1.4,target:null}),false);assert.equal(roofOpen(null),false);
 // Following SUB-01 indoors (main.js: zoom 1.5 / 1.1 on mobile, target on him) opens it by the same rule.
 assert.equal(roofOpen({zoom:1.1,target:BED_POINT}),true);
 const plan=planHero(),all=[...plan.walls,...plan.props,...plan.glass],lid=all.filter(b=>b.lid),cut=all.filter(b=>b.cut);
 assert.ok(lid.length>=15&&lid.length<=40,`lid pieces ${lid.length}`);assert.equal(cut.length,1,'the balcony eave barge board shows only in the section');
 for(const b of lid)assert.ok(b.y>F0+1,'lid pieces sit above the sill cut');
 const roof=plan.walls.filter(b=>b.lid&&b.rx);assert.ok(roof.length>=2,'two more roof slopes');
 assert.ok(roof.some(b=>b.z<-3&&b.z>-5.95),'the middle of the roof is covered');assert.ok(roof.some(b=>b.z>-2.6&&b.x>-6.3),'the eave over the office');
 assert.ok(lid.some(b=>b.light),'the lid carries lit glass for the night');
});

test('hero-home doll-house: the lid lifts away in 0.4 s when the camera looks inside, returns outside, obeys setRoof; still 7 draw calls',async()=>{
 const scene=new THREE.Scene(),hero=await buildHeroHome(scene,{template,interactive:[],addLabel(){},places:{},getWorld:()=>({sub01:{state:'idle'},plots:[]}),getLife:()=>null});
 const plan=hero.plan,walls=hero.root.children.find(c=>c.name==='hero walls'),props=hero.root.children.find(c=>c.name==='hero props'),m=new THREE.Matrix4();
 const li=plan.walls.findIndex(b=>b.lid),ci=plan.props.findIndex(b=>b.cut);assert.ok(li>=0&&ci>=0);
 walls.getMatrixAt(li,m);assert.notEqual(m.determinant(),0,'roof on at start');props.getMatrixAt(ci,m);assert.equal(m.determinant(),0,'cut piece hidden at start');
 let t=0;const inside=aimed(DESK_POINT.x,DESK_POINT.z,1.4);
 for(;t<.2;t+=.05)hero.update(.05,t,inside);assert.ok(hero.roofT>0&&hero.roofT<1,`mid-way at 0.2 s (${hero.roofT})`);
 for(;t<1;t+=.05)hero.update(.05,t,inside);assert.equal(hero.roofT,1);assert.equal(hero.roofOpen,true);
 walls.getMatrixAt(li,m);assert.equal(m.determinant(),0,'the roof is gone');props.getMatrixAt(ci,m);assert.notEqual(m.determinant(),0,'the section barge board shows');
 const far=aimed(-2,2,.6);for(let k=0;k<30;k++)hero.update(.05,t+k*.05,far);assert.equal(hero.roofT,0);walls.getMatrixAt(li,m);assert.notEqual(m.determinant(),0,'the roof is back');
 const elsewhere=aimed(6,4,1.4);for(let k=0;k<30;k++)hero.update(.05,t+k*.05,elsewhere);assert.equal(hero.roofT,0,'zoomed on the Workshop corner: roof on');
 hero.setRoof(false);hero.update(.5,99,null);assert.equal(hero.roofT,1,'setRoof(false) lifts it without a camera');
 hero.setRoof(true);hero.update(.5,100,inside);assert.equal(hero.roofT,0,'setRoof(true) keeps it on even looking inside');
 hero.setRoof(null);hero.update(.5,101,inside);assert.equal(hero.roofT,1,'back to the rule');
 assert.equal(hero.stats().calls,7,'the lid rides in the existing batches');
});

test('hero-home interior: furniture stands clear of the walls\' inner faces and of each other',async()=>{
 const hero=await buildHeroHome(new THREE.Scene(),{template,interactive:[],addLabel(){},places:{},getWorld:()=>({}),getLife:()=>null});
 const dims=hero.dims,inner={x0:HOUSE.x0+.16,x1:HOUSE.x1-.16,z0:HOUSE.z0+.16,z1:HOUSE.z1};
 const box=f=>{const d=dims[f.item];assert.ok(d,f.item);const rot=Math.abs(Math.sin(f.rot||0))>.5,w=rot?d.d:d.w,dd=rot?d.w:d.d;return {x0:f.x-w/2,x1:f.x+w/2,z0:f.z-dd/2,z1:f.z+dd/2};};
 for(const f of FURNITURE){if(f.room==='balcony'||f.on)continue;const b=box(f);
  assert.ok(b.x0>=inner.x0-.01&&b.x1<=inner.x1+.01&&b.z0>=inner.z0-.01&&b.z1<=inner.z1+.01,`${f.item} pokes into a wall ${JSON.stringify(b)}`);}
 // Pieces standing on the same floor never intersect (rugs are walked on; the desk chair tucks under its desk).
 const floor=FURNITURE.filter(f=>!f.on&&f.room!=='balcony'&&!f.item.startsWith('rug'));
 for(let i=0;i<floor.length;i++)for(let j=i+1;j<floor.length;j++){const a=floor[i],b=floor[j];if(a.y!==b.y||a.item==='chairDesk'||b.item==='chairDesk')continue;
  const A=box(a),B=box(b),over=A.x0<B.x1-.01&&B.x0<A.x1-.01&&A.z0<B.z1-.01&&B.z0<A.z1-.01;assert.ok(!over,`${a.item} overlaps ${b.item}`);}
 // The bedside cabinet stands beside the bed, not in it; the office rug is the small round one.
 assert.ok(FURNITURE.find(f=>f.item==='rugRound'&&f.room==='office'),'round office rug');assert.ok(!FURNITURE.some(f=>f.item==='rugRectangle'),'no 3×2 slab rug');
});

test('hero-home fillers: sheds, bikes, kōban, sentō, cage stay out of the house lot and the example volumes; bikes are hollow-wheeled',()=>{
 const fl=fillers(),vols=[{id:'lot',...LOT},...Object.entries(EXAMPLES).map(([id,e])=>{const za=e.frontZ,zb=e.frontZ-e.fz*e.d;return {id,x0:e.x-e.w/2,x1:e.x+e.w/2,z0:Math.min(za,zb),z1:Math.max(za,zb)};})];
 // Footprint of a box: rotations about x widen z, about z widen x, about y both (bike tubes carry a matrix: a 1×1 stamp).
 const foot=b=>{if(b.m)return {x0:b.x-.5,x1:b.x+.5,z0:b.z-.5,z1:b.z+.5};const xr=b.rz?Math.hypot(b.w,b.h)/2:b.ry?Math.hypot(b.w,b.d)/2:b.w/2,zr=b.rx?Math.hypot(b.h,b.d)/2:b.ry?Math.hypot(b.w,b.d)/2:b.d/2;
  return {x0:b.x-xr,x1:b.x+xr,z0:b.z-zr,z1:b.z+zr};};
 let n=0;for(const b of [...fl.W,...fl.P,...fl.G]){const f=foot(b);n++;for(const v of vols)assert.ok(!(f.x0<v.x1&&v.x0<f.x1&&f.z0<v.z1&&v.z0<f.z1),`filler at ${b.x.toFixed(2)},${b.z.toFixed(2)} inside ${v.id}`);}
 assert.ok(n>200,'the fillers are there');
 const P=[];bicycle(P,0,0,0,true);assert.ok(P.length>=18&&P.length<=22,'a bike is ~19 boxes');
 const rims=P.filter(b=>b.rz!==undefined);assert.equal(rims.length,12,'two hexagon rims of six segments');
 assert.ok(rims.every(b=>b.h<.06),'rim segments are thin (hollow wheels, not slabs)');
 const Q=[];bicycle(Q,0,0,0,false);assert.equal(Q.filter(b=>b.rx!==undefined).length,12,'rims turn about x when the bike points along z');
});
