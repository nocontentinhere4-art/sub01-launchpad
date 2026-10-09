import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {CATALOG,ITEMS,LEGACY,WALL_ITEMS,LIMITS,HALF,MATERIALS,LIGHTING,WINDOW_VIEWS,upgradeRoom,extent,clampEntry,renderPosition,stackHeight,riders,standSpot,approach,
 actionFor,label,kitScale,dimsFrom,daylightAt,presetDaylight,nearestPreset} from '../src/room.js';

const manifest=JSON.parse(readFileSync(new URL('../public/assets/room/manifest.json',import.meta.url)));
const S=kitScale(manifest),dimsOf=item=>dimsFrom(manifest,item,S);

test('catalog: 57 Kenney pieces in 9 categories, each with a model and a manifest entry',()=>{
 assert.deepEqual(Object.keys(CATALOG),['sleep','work','sit','storage','kitchen','light','plants','decor','structure']);
 assert.equal(ITEMS.length,57);assert.equal(new Set(ITEMS).size,57);
 for(const item of ITEMS){assert.ok(existsSync(new URL(`../public/assets/room/${item}.glb`,import.meta.url)),item);assert.ok(dimsOf(item),item);assert.ok(actionFor(item),item);assert.ok(label(item).length>1);}
 for(const v of Object.values(LEGACY))assert.ok(ITEMS.includes(v));
 assert.equal(actionFor('bedDouble'),'lie');assert.equal(actionFor('chairDesk'),'sit');assert.equal(actionFor('desk'),'work');assert.equal(actionFor('kitchenFridgeSmall'),'use');
 assert.equal(actionFor('wallWindow'),'look');assert.equal(actionFor('lampRoundFloor'),'toggle');assert.equal(actionFor('doorway'),'leave');assert.equal(actionFor('nope'),null);
});
test('one kit scale: a door is 1.95 tall, so a 1.5 character fits and a bed is about 2.2 long',()=>{
 assert.ok(Math.abs(dimsOf('doorway').h-1.95)<1e-9);
 assert.ok(dimsOf('bedDouble').d>2&&dimsOf('bedDouble').d<2.4);
 assert.ok(dimsOf('desk').h>.65&&dimsOf('desk').h<.85,'desk height near the character\'s hip');
 assert.equal(kitScale({}),1.95,'no manifest: a sane default');
});
test('v1 rooms upgrade: generic names map to Kenney pieces, junk is dropped, limits hold',()=>{
 const r=upgradeRoom({materials:{floor:'tatami',walls:'nope',accent:'rust'},lighting:'disco',furniture:[{item:'bed',x:-9,z:0,rot:45},{item:'tv',x:0,z:0,rot:0},{item:'wallWindow',x:0,z:0,rot:0},...Array.from({length:50},()=>({item:'plant',x:0,z:0,rot:0}))]});
 assert.equal(r.furniture[0].item,'bedSingle');assert.equal(r.furniture[0].x,-3.5);assert.equal(r.furniture[0].rot,0);
 assert.equal(r.furniture[1].wall,'left','wall pieces always get a wall');
 assert.equal(r.furniture.length,LIMITS.max);
 assert.deepEqual(r.materials,{floor:'tatami',walls:Object.keys(MATERIALS.walls)[0],accent:'rust'});
 assert.equal(r.lighting,'evening');assert.equal(r.window,'city_day');
 assert.ok(Object.hasOwn(WINDOW_VIEWS,'rain'));
 assert.equal(upgradeRoom({...r,daylight:.333}).daylight,.33);
});
test('placement: pieces stay inside the walls, wall pieces snap flush to their wall',()=>{
 const bed=dimsOf('bedDouble'),e=clampEntry({item:'bedDouble',x:-3.5,z:3.5,rot:90},bed),{hx,hz}=extent(e,bed);
 assert.ok(e.x-hx>=-HALF-.01&&e.z+hz<=HALF+.01,"inside within the 1 cm rounding");
 const win=clampEntry({item:'wallWindow',x:2,z:9,rot:0,wall:'left'},dimsOf('wallWindow'));
 assert.equal(win.rot,90);assert.equal(win.x,-LIMITS.coord);assert.ok(win.z<=HALF-dimsOf('wallWindow').w/2+1e-9);
 const [x]=renderPosition(win,dimsOf('wallWindow'));assert.ok(x<-HALF+.2,'flush with the left wall');
 const door=clampEntry({item:'doorway',x:1,z:0,rot:90,wall:'back'},dimsOf('doorway'));assert.equal(door.z,-LIMITS.coord);assert.equal(door.rot,0);
 assert.equal('y' in clampEntry({item:'desk',x:0,z:0,rot:0,y:0},dimsOf('desk')),false);
});
test('stacking: a monitor settles on the desk, and travels with it',()=>{
 const room=[{item:'desk',x:1,z:1,rot:0},{item:'computerScreen',x:1.1,z:1,rot:0},{item:'chairDesk',x:1,z:2,rot:180}];
 const y=stackHeight(room,1,dimsOf);assert.ok(Math.abs(y-dimsOf('desk').h)<.01);
 room[1].y=y;assert.deepEqual(riders(room,0,dimsOf),[1]);assert.deepEqual(riders(room,2,dimsOf),[]);
 assert.equal(stackHeight(room,2,dimsOf)>0,false,'the chair is not on the desk');
});
test('the resident stands in front of a piece, never inside another one',()=>{
 const room=[{item:'bedDouble',x:-2.4,z:1.3,rot:90},{item:'wallWindow',x:-3.5,z:1.25,rot:90,wall:'left'},{item:'kitchenFridgeSmall',x:0,z:-3.2,rot:0}];
 const f=approach(room[2],dimsOf('kitchenFridgeSmall'));assert.ok(f.z>room[2].z);
 const w=standSpot(room,1,dimsOf),{hx,hz}=extent(room[0],dimsOf('bedDouble'));
 assert.ok(!(Math.abs(w.x-room[0].x)<hx&&Math.abs(w.z-room[0].z)<hz),'not on the bed under the window');
});
test('daylight: the slider passes through the four presets in order',()=>{
 assert.equal(daylightAt(0).sky,LIGHTING.morning.sky);assert.equal(daylightAt(1).sky,LIGHTING.night.sky);
 assert.equal(daylightAt(presetDaylight('evening')).sky,LIGHTING.evening.sky);
 const mid=daylightAt(1/6);assert.ok(mid.sun[1]>LIGHTING.morning.sun[1]&&mid.sun[1]<LIGHTING.midday.sun[1]);
 assert.equal(nearestPreset(.1),'morning');assert.equal(nearestPreset(.9),'night');assert.equal(daylightAt(.2).lamps,false);assert.equal(daylightAt(.8).lamps,true);
});
