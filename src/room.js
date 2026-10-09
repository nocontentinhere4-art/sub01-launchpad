import * as THREE from 'three';
import {api} from './api.js';
import {toon} from './toon.js';
import {loadCharacter} from './characters.js';
import {blockedTiles,route,mover} from './motion.js';
import {makeResident,tick,choose,use as useAd,TRAITS,HOURS_PER_SECOND,ADS} from './needs.js';
import {createSpecial,SPECIAL_ITEMS,SPECIAL_TIERS,SPECIAL_DIMS,SPECIAL_LABELS,SPECIAL_USE,SPECIAL_SEAT,SPECIAL_ADS,TEXT_ITEMS,TEXT_MAX,HANGING,OVERHEAD} from './special-items.js';
import {createPet,petFollow} from './accessories.js';
import {EMOTES} from './characters.js';
import {isUnlocked,tierOf,tierLabel} from './creator.js';
import {deskModel,hasDesk,SCREEN_ITEMS,screenTexture,screenMesh,screenGeometry,welcomeText,openComputer} from './desk.js';
// A resident's room: a cutaway studio (floor + left and back walls) furnished with Kenney Furniture Kit pieces.
// It shares the city's renderer (one WebGL context); while it is open the city pauses.
// Budget: geometry is shared (glTF templates + a module cache of shell geometry), one 512 shadow map, three lights
// that never change count (no shader recompiles), at most 40 pieces. Closing frees only what this room cloned.

// ---------------------------------------------------------------- schema (mirror of the server's world.js ROOM)
export const CATALOG={
 sleep:['bedSingle','bedDouble','cabinetBed','cabinetBedDrawerTable','pillow','pillowBlue','bear'],
 work:['desk','deskCorner','chairDesk','computerScreen','computerKeyboard','computerMouse','laptop'],
 sit:['chair','chairCushion','loungeSofa','loungeChair','loungeDesignSofa'],
 storage:['bookcaseOpen','bookcaseOpenLow','bookcaseClosedWide','books','sideTableDrawers','cabinetTelevision','coatRackStanding','cardboardBoxClosed','cardboardBoxOpen'],
 kitchen:['kitchenFridgeSmall','kitchenFridge','kitchenMicrowave','kitchenCoffeeMachine','washer','trashcan'],
 light:['lampRoundFloor','lampSquareFloor','lampRoundTable','lampWall','ceilingFan'],
 plants:['pottedPlant','plantSmall1','plantSmall2','plantSmall3'],
 decor:['rugRectangle','rugRound','rugSquare','rugDoormat','tableCoffee','sideTable','televisionModern','speaker','speakerSmall','radio'],
 structure:['wallWindow','wallWindowSlide','doorway','doorwayFront'],
};
export const CATEGORY_LABELS={sleep:'Sleep',work:'Work',sit:'Sit',storage:'Storage',kitchen:'Kitchen',light:'Light',plants:'Plants',decor:'Decor',structure:'Window & door'};
export const ITEMS=Object.values(CATALOG).flat();
export const LEGACY={bed:'bedSingle',desk:'desk',chair:'chairDesk',couch:'loungeSofa',shelf:'bookcaseOpen',lamp:'lampRoundFloor',plant:'pottedPlant',rug:'rugRectangle',table:'tableCoffee'};
export const WALL_ITEMS=new Set(['wallWindow','wallWindowSlide','doorway','doorwayFront','lampWall']);
export const LIMITS={coord:3.5,maxY:2.5,max:40};
export const HALF=3.5,WALL_H=2.75;              // the floor is 7×7, walls stand at x=-3.5 (left) and z=-3.5 (back)
// Unlockable procedural pieces (special-items.js): not Kenney GLBs, stored like furniture; locked ones are greyed in the drawer.
export const SPECIAL=SPECIAL_ITEMS;
const IN=new Set([...ITEMS,...SPECIAL_ITEMS]),IS_SPECIAL=new Set(SPECIAL_ITEMS);
// Emote tiers, mirrored from the server's UNLOCKS (used when /api/world/options is not reachable).
export const EMOTE_TIERS={wave:'resident',sit:'resident',think:'resident',sleep:'resident',dance:'resident',facepalm:'builder',cook:'builder',selfie:'builder',
 karaoke:'founder',skate:'founder',celebrate:'launched',moonwalk:'launched'};
export const FALLBACK_UNLOCKS={tiers:['resident','builder','founder','launched'],items:SPECIAL_TIERS,emotes:EMOTE_TIERS};
const EMOTE_ICON={wave:'👋',sit:'🪑',think:'🤔',sleep:'💤',dance:'💃',facepalm:'🤦',cook:'🍳',selfie:'🤳',karaoke:'🎤',skate:'🛹',celebrate:'🎉',moonwalk:'🕺'};
const EMOTE_TEXT={wave:'Hi!',sit:'Taking a seat.',think:'Hmm…',sleep:'Zzz…',dance:'Dancing.',facepalm:'Oh no.',cook:'Cooking something.',selfie:'Selfie!',
 karaoke:'Singing.',skate:'Skating around.',celebrate:'Woo!',moonwalk:'Moonwalking.'};
// The autonomy brain hears the special pieces too (added to needs.js ADS without replacing anything there).
for(const [k,v] of Object.entries(SPECIAL_ADS))ADS[k]??=v;
// The 403 a save gets for pieces the owner has not unlocked, as a sentence that names the tier.
export function lockedMessage(err,unlocks=FALLBACK_UNLOCKS){
 const list=Array.isArray(err?.body?.locked)?err.body.locked:[];if(!list.length)return null;
 return 'Not unlocked yet: '+list.map(n=>`${label(n)} (${tierLabel(tierOf(unlocks.items,n)||tierOf(unlocks.emotes,n))||'a higher tier'})`).join(', ')+'.';
}
// [swatch colour, floor pattern]
export const MATERIALS={
 floor:{white_oak:['#d9c4a0','planks'],honey_oak:['#c99a5b','planks'],walnut:['#7a5236','planks'],smoked_oak:['#5e5348','planks'],concrete:['#a3a29c','concrete'],tatami:['#c8c58a','tatami'],
  birch:['#e6d6b4','planks'],cherry:['#a8603e','planks'],herringbone:['#c08d58','herringbone'],black_ash:['#3d3835','planks'],tatami_green:['#aab37b','tatami'],tile_white:['#e8e5de','tile'],tile_slate:['#5d646b','tile'],tile_terracotta:['#c0714f','tile']},
 walls:{chalk:['#eeebe3'],sand:['#dccbab'],sage:['#a9b8a0'],navy:['#2e3d5c'],terracotta:['#c47a5a'],concrete:['#9c9c98'],cream:['#f3e7cf'],blush:['#e8c4bb'],sky:['#bcd3e2'],forest:['#3f5a48']},
 accent:{navy:['#2f3e66'],linen:['#e8e0cf'],rust:['#b5582f'],olive:['#6f7448'],charcoal:['#3a3b3d'],blush:['#d9a5a0'],denim:['#6f86b5'],sakura:['#f0b7c8'],mustard:['#d8a73a'],teal:['#2f7f7a']},
};
export const WINDOW_VIEWS={city_day:'City · day',city_night:'City · night',sakura:'Sakura',rain:'Rain'};
// Presets in the spirit of a daylight slider: sky, hemisphere, sun, the patch of window light on the floor.
export const LIGHTING={
 morning:{time:'07:30',icon:'◒',sky:'#e8e2d8',hemi:['#fff4e4','#8f8a7c',1.7],sun:['#ffe0b8',2.5,[-5,7,6]],glow:['#ffe2b8',.45],lamps:false},
 midday:{time:'12:45',icon:'☀',sky:'#e3e6e4',hemi:['#ffffff','#9a9a8e',2.1],sun:['#ffffff',2.9,[-3,9,5]],glow:['#fffbe8',.35],lamps:false},
 evening:{time:'18:30',icon:'◓',sky:'#d8c3b2',hemi:['#ffe0c2','#5c4a48',1.35],sun:['#ffb07a',1.7,[-7,5,3]],glow:['#ffa36b',.5],lamps:true},
 night:{time:'22:10',icon:'☾',sky:'#18202c',hemi:['#7d95c8','#1d2230',.8],sun:['#8fa6ff',.35,[-6,8,4]],glow:['#6f8fd8',.28],lamps:true},
};
// The daylight slider runs 0..1 through the four presets in order; the room stores the nearest preset name and the value.
const DAY_KEYS=Object.keys(LIGHTING);
export const presetDaylight=name=>Math.max(0,DAY_KEYS.indexOf(name))/(DAY_KEYS.length-1);
export const nearestPreset=t=>DAY_KEYS[Math.round(Math.min(1,Math.max(0,t))*(DAY_KEYS.length-1))];
const _c1=new THREE.Color(),_c2=new THREE.Color();
const mixHex=(a,b,k)=>'#'+_c1.set(a).lerp(_c2.set(b),k).getHexString();
export function daylightAt(t){
 const x=Math.min(1,Math.max(0,Number(t)||0))*(DAY_KEYS.length-1),i=Math.min(DAY_KEYS.length-2,Math.floor(x)),k=x-i,A=LIGHTING[DAY_KEYS[i]],B=LIGHTING[DAY_KEYS[i+1]],n=(a,b)=>a+(b-a)*k;
 return {sky:mixHex(A.sky,B.sky,k),hemi:[mixHex(A.hemi[0],B.hemi[0],k),mixHex(A.hemi[1],B.hemi[1],k),n(A.hemi[2],B.hemi[2])],
  sun:[mixHex(A.sun[0],B.sun[0],k),n(A.sun[1],B.sun[1]),A.sun[2].map((v,j)=>n(v,B.sun[2][j]))],glow:[mixHex(A.glow[0],B.glow[0],k),n(A.glow[1],B.glow[1])],lamps:x>=1.5};
}
const LABEL_FIX={bedSingle:'Single bed',bedDouble:'Double bed',cabinetBed:'Bed cabinet',cabinetBedDrawerTable:'Nightstand',chairDesk:'Gaming chair',chairCushion:'Cushion chair',
 computerScreen:'Monitor',computerKeyboard:'Keyboard',computerMouse:'Mouse',bookcaseOpen:'Bookcase',bookcaseOpenLow:'Low bookcase',bookcaseClosedWide:'Wardrobe',sideTableDrawers:'Drawers',
 cabinetTelevision:'TV cabinet',coatRackStanding:'Coat rack',cardboardBoxClosed:'Box',cardboardBoxOpen:'Open box',kitchenFridgeSmall:'Small fridge',kitchenFridge:'Fridge',
 kitchenMicrowave:'Microwave',kitchenCoffeeMachine:'Coffee machine',lampRoundFloor:'Floor lamp',lampSquareFloor:'Square floor lamp',lampRoundTable:'Desk lamp',lampWall:'Wall lamp',
 ceilingFan:'Fan',pottedPlant:'Potted plant',plantSmall1:'Succulent',plantSmall2:'Small plant',plantSmall3:'Cactus',rugRectangle:'Rug',rugRound:'Round rug',rugSquare:'Square rug',
 rugDoormat:'Doormat',loungeSofa:'Sofa',loungeChair:'Armchair',loungeDesignSofa:'Design sofa',tableCoffee:'Coffee table',sideTable:'Side table',televisionModern:'TV',
 speakerSmall:'Small speaker',wallWindow:'Window',wallWindowSlide:'Sliding window',doorway:'Door',doorwayFront:'Front door',pillowBlue:'Blue pillow',bear:'Teddy bear',deskCorner:'Corner desk'};
export const label=item=>LABEL_FIX[item]||SPECIAL_LABELS[item]||item.replace(/([A-Z0-9])/g,' $1').replace(/^./,c=>c.toUpperCase()).trim();
// What tapping a piece makes the resident do.
const ACTIONS={lie:['bedSingle','bedDouble','cabinetBed'],sit:['chair','chairCushion','chairDesk','loungeSofa','loungeChair','loungeDesignSofa','goldToilet','plushPile'],
 work:['desk','deskCorner','computerScreen','computerKeyboard','computerMouse','laptop'],look:['wallWindow','wallWindowSlide'],
 toggle:['lampRoundFloor','lampSquareFloor','lampRoundTable','lampWall','ceilingFan'],leave:['doorway','doorwayFront'],walk:['rugRectangle','rugRound','rugSquare','rugDoormat']};
const ACTION_OF=new Map(Object.entries(ACTIONS).flatMap(([a,list])=>list.map(i=>[i,a])));
export const actionFor=item=>IN.has(item)?ACTION_OF.get(item)||'use':null;
const USE_TEXT={kitchenFridgeSmall:'Grabbing a cold drink.',kitchenFridge:'Grabbing a cold drink.',kitchenCoffeeMachine:'Making coffee.',kitchenMicrowave:'Heating up dinner.',
 washer:'Doing the laundry.',bookcaseOpen:'Picking a book.',bookcaseOpenLow:'Picking a book.',books:'Picking a book.',bookcaseClosedWide:'Changing clothes.',radio:'Tuning the radio.',
 televisionModern:'Zapping channels.',speaker:'Turning the music up.',speakerSmall:'Turning the music up.',pottedPlant:'Watering the plant.',plantSmall1:'Watering the plant.',
 plantSmall2:'Watering the plant.',plantSmall3:'Watering the cactus. Carefully.',bear:'Hugging the bear.',trashcan:'Taking out the trash.',coatRackStanding:'Grabbing a jacket.'};
const ACTION_TEXT={lie:'Taking a nap.',sit:'Sitting down.',work:'Working on something.',look:'Looking out of the window.',leave:'See you in the city!'};
// Accent-tinted fabric (bedding, upholstery, rugs) and how high their usable top is, as a share of the model height.
const ACCENT=new Set(['bedSingle','bedDouble','loungeSofa','loungeChair','loungeDesignSofa','chairCushion','chairDesk','rugRectangle','rugRound','rugSquare','pillow']);
const SURFACE={bedSingle:.55,bedDouble:.55,cabinetBed:.55,loungeSofa:.45,loungeChair:.45,loungeDesignSofa:.45,chair:.5,chairCushion:.5,chairDesk:.45};
// Small things settle on whatever stands under them (a laptop dragged onto a desk ends up on the desk).
const SMALL=new Set(['computerScreen','computerKeyboard','computerMouse','laptop','lampRoundTable','books','kitchenCoffeeMachine','kitchenMicrowave','radio','speakerSmall',
 'plantSmall1','plantSmall2','plantSmall3','pillow','pillowBlue','bear','televisionModern','cardboardBoxClosed','cardboardBoxOpen']);
const DEFAULT_Y={lampWall:1.55,ceilingFan:2.2};

// v1 rooms (generic names, no window) and anything malformed become a valid v2 room on the client too.
export function upgradeRoom(room){
 const r=room&&typeof room==='object'?room:{},m=r.materials||{},pick=(k,v)=>Object.hasOwn(MATERIALS[k],v)?v:Object.keys(MATERIALS[k])[0];
 const furniture=(Array.isArray(r.furniture)?r.furniture:[]).map(f=>{const item=Object.hasOwn(LEGACY,f?.item)?LEGACY[f.item]:f?.item;if(!IN.has(item))return null;
  const e={item,x:clampN(f.x,-LIMITS.coord,LIMITS.coord),z:clampN(f.z,-LIMITS.coord,LIMITS.coord),rot:[0,90,180,270].includes(f.rot)?f.rot:0};
  const y=clampN(f.y??DEFAULT_Y[item]??0,0,LIMITS.maxY);if(y>0)e.y=y;
  if(WALL_ITEMS.has(item))e.wall=f.wall==='back'?'back':'left';
  if(TEXT_ITEMS.has(item)&&typeof f.text==='string'){const t=[...f.text.replace(/[\u0000-\u001f<>`]/g,'').trim()].slice(0,TEXT_MAX).join('');if(t)e.text=item==='neonTicker'?t.toUpperCase():t;}
  return e;}).filter(Boolean).slice(0,LIMITS.max);
 return {materials:{floor:pick('floor',m.floor),walls:pick('walls',m.walls),accent:pick('accent',m.accent)},lighting:Object.hasOwn(LIGHTING,r.lighting)?r.lighting:'evening',
  window:Object.hasOwn(WINDOW_VIEWS,r.window)?r.window:'city_day',...(Number.isFinite(r.daylight)?{daylight:clampN(r.daylight,0,1)}:{}),furniture};
}
function clampN(v,lo,hi){v=Number(v);return Number.isFinite(v)?Math.round(Math.min(hi,Math.max(lo,v))*100)/100:0;}

// ---------------------------------------------------------------- placement maths (pure, tested)
// dims: {w,h,d} of an item in room units, unrotated (from the asset manifest × SCALE).
export function extent(entry,d){const q=entry.rot%180!==0;return {hx:(q?d.d:d.w)/2,hz:(q?d.w:d.d)/2};}
// Keeps a piece inside the room. Wall pieces snap to their wall and face into the room.
export function clampEntry(entry,d){
 const e={...entry},lim=v=>Math.min(LIMITS.coord,Math.max(.05,HALF-v));
 if(WALL_ITEMS.has(e.item)){const half=Math.min(LIMITS.coord,Math.max(.05,HALF-d.w/2));
  if(e.wall==='back'){e.z=-LIMITS.coord;e.rot=0;e.x=clampN(e.x,-half,half);}else{e.wall='left';e.x=-LIMITS.coord;e.rot=90;e.z=clampN(e.z,-half,half);}
 }else if(HANGING.has(e.item)){const half=Math.min(LIMITS.coord,Math.max(.05,HALF-d.w/2)),flush=clampN(-(HALF-d.d/2),-LIMITS.coord,LIMITS.coord);   // flat pieces hang flush, rot picks the wall
  if(e.rot===90){e.x=flush;e.z=clampN(e.z,-half,half);}else{e.rot=0;e.z=flush;e.x=clampN(e.x,-half,half);}
 }else{const {hx,hz}=extent(e,d);e.x=clampN(e.x,-lim(hx),lim(hx));e.z=clampN(e.z,-lim(hz),lim(hz));}
 if(e.y!==undefined){e.y=clampN(e.y,0,LIMITS.maxY);if(!e.y)delete e.y;}
 return e;
}
// Where the piece is drawn: wall pieces sit flush against the inside of their wall.
export function renderPosition(entry,d){
 if(entry.wall==='left')return [-HALF+d.d/2+.01,entry.y||0,entry.z];
 if(entry.wall==='back')return [entry.x,entry.y||0,-HALF+d.d/2+.01];
 return [entry.x,entry.y||0,entry.z];
}
// Height of the highest surface under piece i (0 when it stands on the floor).
export function stackHeight(entries,i,dimsOf){
 const me=entries[i];let top=0;
 entries.forEach((e,j)=>{if(j===i||WALL_ITEMS.has(e.item))return;const d=dimsOf(e.item);if(!d)return;const {hx,hz}=extent(e,d);
  if(Math.abs(me.x-e.x)<=hx&&Math.abs(me.z-e.z)<=hz&&(e.y||0)<=(me.y||0)+.01+top)top=Math.max(top,(e.y||0)+d.h*(SURFACE[e.item]||1));});
 return Math.min(LIMITS.maxY,Math.round(top*100)/100);
}
// Where the resident stands to use a piece: in front of it (Kenney pieces face +z), inside the room.
export function approach(entry,d){
 const c=v=>Math.min(HALF-.35,Math.max(-HALF+.35,v));
 if(entry.wall==='left')return {x:-HALF+.9,z:c(entry.z)};
 if(entry.wall==='back')return {x:c(entry.x),z:-HALF+.9};
 const a=entry.rot*Math.PI/180,f=d.d/2+.4;return {x:c(entry.x+Math.sin(a)*f),z:c(entry.z+Math.cos(a)*f)};
}

// Pieces resting on piece i (a monitor on a desk): they travel with it.
export function riders(entries,i,dimsOf){
 const base=entries[i],d=dimsOf(base.item);if(!d||WALL_ITEMS.has(base.item))return [];const {hx,hz}=extent(base,d),out=[];
 entries.forEach((e,j)=>{if(j!==i&&!WALL_ITEMS.has(e.item)&&(e.y||0)>(base.y||0)+.05&&Math.abs(e.x-base.x)<=hx&&Math.abs(e.z-base.z)<=hz)out.push(j);});return out;
}
// A spot to stand that is not inside furniture: the front first, then the other sides (or further from the wall).
export function standSpot(entries,i,dimsOf){
 const e=entries[i],d=dimsOf(e.item),first=approach(e,d);
 const blocked=(x,z)=>entries.some((f,j)=>{if(j===i||WALL_ITEMS.has(f.item)||OVERHEAD.has(f.item)||/^rug/.test(f.item)||(f.y||0)>0)return false;const df=dimsOf(f.item);if(!df)return false;const {hx,hz}=extent(f,df);return Math.abs(x-f.x)<hx+.2&&Math.abs(z-f.z)<hz+.2;});
 const c=v=>Math.min(HALF-.35,Math.max(-HALF+.35,v)),cands=[first];
 if(e.wall==='left')for(const out of [.9,1.6,2.4])for(const side of [0,-1.1,1.1])cands.push({x:-HALF+out,z:c(e.z+side)});
 else if(e.wall==='back')for(const out of [.9,1.6,2.4])for(const side of [0,-1.1,1.1])cands.push({x:c(e.x+side),z:-HALF+out});
 else{const {hx,hz}=extent(e,d);for(const [dx,dz] of [[0,hz+.4],[0,-hz-.4],[hx+.4,0],[-hx-.4,0]])cands.push({x:c(e.x+dx),z:c(e.z+dz)});}
 return cands.find(p=>!blocked(p.x,p.z))||first;
}

// ---------------------------------------------------------------- assets
let host=null;
export function attachRoomHost(h){host=h;}
const model=name=>host.template('room',name);   // the city's loader: cached, toonified, geometry shared
let manifest=null;
const loadManifest=()=>manifest||=fetch('/assets/room/manifest.json').then(r=>r.ok?r.json():{}).catch(()=>({}));
// One scale for the whole kit, from the door: a door is ~1.25 characters tall (the city's people are 1.5).
export const DOOR_HEIGHT=1.95;
export function kitScale(man){const door=man?.doorway?.size?.[1];return door>0?DOOR_HEIGHT/door:1.95;}
export function dimsFrom(man,name,scale){const m=man?.[name];if(!m?.size||!m?.min)return null;const [w,h,d]=m.size.map(v=>v*scale);
 return {w,h,d,ox:-(m.min[0]+m.size[0]/2)*scale,oy:-m.min[1]*scale,oz:-(m.min[2]+m.size[2]/2)*scale};}

// Shared shell geometry and small canvas textures: built once, kept for every later room.
const shared=new Map();
const once=(key,make)=>{if(!shared.has(key))shared.set(key,make());return shared.get(key);};
const hasDom=typeof document!=='undefined';
function canvasTexture(key,w,h,draw,repeat){
 return once(key,()=>{if(!hasDom)return null;const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeat,repeat);}t.anisotropy=2;return t;});
}
const rnd=seed=>()=>((seed=Math.imul(seed^seed>>>15,seed|1)+0x6d2b79f5|0)>>>0)/4294967296;
function shade(hex,k){const c=new THREE.Color(hex);c.offsetHSL(0,0,k);return '#'+c.getHexString();}
function floorTexture(name){
 const [color,kind]=MATERIALS.floor[name];
 return canvasTexture('floor:'+name,256,256,(g,w,h)=>{const r=rnd(name.length*977+7);g.fillStyle=color;g.fillRect(0,0,w,h);
  if(kind==='planks'){const ph=32;for(let y=0;y<h;y+=ph){let x=-r()*120;while(x<w){const len=90+r()*110;g.fillStyle=shade(color,(r()-.5)*.08);g.fillRect(x,y,len,ph);
     g.fillStyle=shade(color,-.12);g.fillRect(x,y,2,ph);for(let k=0;k<3;k++){g.fillStyle=shade(color,(r()-.5)*.05);g.fillRect(x+r()*len,y+4+r()*(ph-8),20+r()*40,1);}x+=len;}
    g.fillStyle=shade(color,-.14);g.fillRect(0,y,w,1.5);}}
  else if(kind==='herringbone'){const L=64,T=16;for(let y=-L;y<h+L;y+=T*2)for(let x=-L;x<w+L;x+=L){for(const s of [0,1]){g.save();g.translate(x+s*T,y+s*T);g.rotate(s?-Math.PI/4:Math.PI/4);g.fillStyle=shade(color,(r()-.5)*.09);g.fillRect(0,0,L*.7,T);g.strokeStyle=shade(color,-.13);g.lineWidth=1;g.strokeRect(0,0,L*.7,T);g.restore();}}}
  else if(kind==='tile'){const s=64;for(let y=0;y<h;y+=s)for(let x=0;x<w;x+=s){g.fillStyle=shade(color,(r()-.5)*.04);g.fillRect(x+1,y+1,s-2,s-2);}g.strokeStyle=shade(color,-.1);g.lineWidth=2;for(let i=0;i<=w;i+=s){g.beginPath();g.moveTo(i,0);g.lineTo(i,h);g.moveTo(0,i);g.lineTo(w,i);g.stroke();}}
  else if(kind==='tatami'){const border=shade(color,-.32);for(const [x,y,mw,mh] of [[0,0,128,256],[128,0,128,128],[128,128,128,128]]){g.fillStyle=shade(color,(r()-.5)*.05);g.fillRect(x,y,mw,mh);
     g.strokeStyle=shade(color,-.06);g.lineWidth=1;for(let k=4;k<(mw>mh?mh:mw);k+=4){g.beginPath();if(mw>=mh){g.moveTo(x,y+k);g.lineTo(x+mw,y+k);}else{g.moveTo(x+k,y);g.lineTo(x+k,y+mh);}g.stroke();}
     g.strokeStyle=border;g.lineWidth=5;g.strokeRect(x+2.5,y+2.5,mw-5,mh-5);}}
  else{for(let i=0;i<900;i++){g.fillStyle=shade(color,(r()-.5)*.14);g.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}}
 },4);
}
function viewTexture(view,lighting){
 return canvasTexture(`view:${view}:${lighting}`,96,96,(g,w,h)=>{const r=rnd(7),night=lighting==='night'||view==='city_night',L=LIGHTING[lighting];
  const sky=g.createLinearGradient(0,0,0,h);
  const top=view==='rain'?'#7c8794':night?'#0d1830':lighting==='evening'?'#f08a5d':lighting==='morning'?'#9cc7e8':'#7fb6e6';
  const low=view==='rain'?'#aab3ba':night?'#243a63':lighting==='evening'?'#ffd29a':'#e9f3f8';
  sky.addColorStop(0,top);sky.addColorStop(1,low);g.fillStyle=sky;g.fillRect(0,0,w,h);
  if(view==='sakura'){g.fillStyle=night?'#2c2f45':'#6d8a5a';g.fillRect(0,h*.82,w,h);for(let i=0;i<26;i++){g.fillStyle=['#f6c1d1','#f0a6bd','#fbd9e3'][i%3];g.beginPath();g.arc(r()*w,h*.25+r()*h*.55,6+r()*10,0,7);g.fill();}
   g.fillStyle='#5a3d33';g.fillRect(w*.3,h*.55,4,h*.4);g.fillRect(w*.72,h*.6,4,h*.4);}
  else{for(let x=0;x<w;){const bw=8+r()*16,bh=h*(.25+r()*.5);g.fillStyle=night?'#0b1222':view==='rain'?'#5d6670':shade(L.sky,-.25);g.fillRect(x,h-bh,bw,bh);
    if(night||view==='city_night')for(let k=0;k<bh/6;k++)if(r()<.5){g.fillStyle=r()<.7?'#ffd27a':'#9fd0ff';g.fillRect(x+2+r()*(bw-5),h-bh+3+k*6,2,2);}x+=bw+1;}}
  if(view==='rain'){g.strokeStyle='#e5edf2aa';g.lineWidth=1;for(let i=0;i<60;i++){const x=r()*w,y=r()*h;g.beginPath();g.moveTo(x,y);g.lineTo(x-3,y+9);g.stroke();}}
 });
}
const glowTexture=()=>canvasTexture('glow',64,64,(g,w,h)=>{const grad=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);grad.addColorStop(0,'#ffffff');grad.addColorStop(.55,'#ffffff88');grad.addColorStop(1,'#ffffff00');g.fillStyle=grad;g.fillRect(0,0,w,h);});
const POSTERS=[['sunset',['#28203f','#f3855d','#ffcf6b']],['mountain',['#f4efe6','#2f4a7a','#e05a47']],['tokyo',['#1d1b2e','#ff6b9d','#56c1ff']]];
const posterTexture=([name,[bg,a,b]])=>canvasTexture('poster:'+name,48,64,(g,w,h)=>{g.fillStyle=bg;g.fillRect(0,0,w,h);
 if(name==='sunset'){g.fillStyle=b;g.beginPath();g.arc(w/2,h*.55,14,Math.PI,0);g.fill();for(let i=0;i<5;i++){g.fillStyle=a;g.fillRect(8,h*.58+i*4,w-16,2);}}
 else if(name==='mountain'){g.fillStyle=a;g.beginPath();g.moveTo(6,h*.75);g.lineTo(w/2,h*.3);g.lineTo(w-6,h*.75);g.fill();g.fillStyle=b;g.beginPath();g.arc(w*.7,h*.28,6,0,7);g.fill();}
 else{g.fillStyle=a;g.font='bold 18px sans-serif';g.textAlign='center';g.fillText('東',w/2,h*.4);g.fillStyle=b;g.fillText('京',w/2,h*.75);}
 g.strokeStyle='#ffffff';g.lineWidth=3;g.strokeRect(1.5,1.5,w-3,h-3);});
const BOX=once('box',()=>new THREE.BoxGeometry(1,1,1)),PLANE=once('plane',()=>new THREE.PlaneGeometry(1,1)),DISC=once('disc',()=>new THREE.CircleGeometry(.5,20));

// ---------------------------------------------------------------- character
// Falls back to the city's minimal box figure (same API as characters.js) when the rigged one cannot load.
function boxCharacter(look={}){
 const root=new THREE.Group(),inner=new THREE.Group(),mats=[];root.add(inner);
 const mat=c=>{const m=toon({color:c||'#888'});mats.push(m);return m;};
 const box=(w,h,d,c,x,y,z,parent=inner)=>{const m=new THREE.Mesh(BOX,mat(c));m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
 const legs=[-1,1].map(s=>{const p=new THREE.Group();p.position.set(s*.1,.56,0);inner.add(p);box(.17,.56,.22,look.bottom,0,-.28,0,p);return p;});
 box(.5,.56,.3,look.top,0,.84,0);box(.42,.42,.38,look.skin,0,1.3,0);box(.45,.14,.42,look.hair,0,1.52,-.02);
 for(const s of [-1,1])box(.06,.06,.01,'#222',s*.09,1.33,.195);
 const arms=[-1,1].map(s=>{const p=new THREE.Group();p.position.set(s*.32,1.08,0);inner.add(p);box(.12,.5,.14,look.top,0,-.23,0,p);return p;});
 let clip='Idle',kind=null,t=0;
 return {root,offsets:{seat:.3,lieLength:1.5},get posed(){return kind;},
  play(name){clip=name;t=0;},stride(phase){t=phase*Math.PI*2/9;},pose(next){kind=next==='sit'||next==='lie'?next:null;inner.rotation.set(0,0,0);inner.position.set(0,0,0);if(kind==='lie'){inner.rotation.x=-Math.PI/2;inner.position.set(0,.15,.75);}if(kind==='sit')inner.position.y=-.26;},
  update(dt){t+=dt;const walk=clip==='Walk'||clip==='Run',sw=Math.sin(t*9)*.6;legs.forEach((l,i)=>l.rotation.x=walk?sw*(i?1:-1):kind==='sit'?-1.5:0);
   arms.forEach((a,i)=>{a.rotation.x=walk?-sw*(i?1:-1)*.8:clip==='Interact'?-1.2+Math.sin(t*12+i)*.1:0;a.rotation.z=0;});
   if(clip==='Wave'){arms[1].rotation.z=2.6+Math.sin(t*10)*.3;if(t>2)clip='Idle';}},
  dispose(){for(const m of mats)m.dispose();root.removeFromParent();}};
}

// ---------------------------------------------------------------- the room
let openNow=null;
// Unlock tiers for labels: the server's options when reachable (cached for the session), else the mirror above.
let tiers=null;
const loadTiers=()=>tiers||=api('/api/world/options').then(o=>o?.unlocks?.items?o.unlocks:FALLBACK_UNLOCKS).catch(()=>FALLBACK_UNLOCKS);
export const specialDims=item=>SPECIAL_DIMS[item]&&{...SPECIAL_DIMS[item],ox:0,oy:0,oz:0};
export async function openRoom({plotId,mine,me:viewer}){
 if(!host||openNow)return;openNow=plotId;
 try{await enter(plotId,mine,viewer);}catch(err){console.error(err);host.notify('The room could not be opened.');}
 finally{openNow=null;}
}
async function enter(plotId,mine,viewer){
 let data;try{data=await api(`/api/rooms/${encodeURIComponent(plotId)}`);}catch(err){host.notify(err.status===404?'Nobody lives here yet.':'The room could not be loaded.');return;}
 const man=await loadManifest(),SCALE=kitScale(man),measured=new Map();
 const dimsOf=item=>measured.get(item)||specialDims(item)||dimsFrom(man,item,SCALE);
 const tierInfo=await loadTiers(),unlocks=(mine&&viewer?.unlocks)||data.unlocks||null;
 const owner=data.owner,scene=new THREE.Scene(),owned=[],desk=deskModel(data.desk,mine);   // desk.js: the projects on the computer
 let room=upgradeRoom(data.room),saved=JSON.stringify(room),closed=false;
 const own=m=>{owned.push(m);return m;};
 // Shadows are re-rendered only when something changes (furniture, light); the character has a contact quad instead.
 let shadowsDirty=true,gl=null,cityRatio=0,cityAutoShadows=true;
 const phone=matchMedia('(max-width:600px), (pointer:coarse)').matches,BUDGET=phone?1.5e6:2.5e6;
 scene.onBeforeRender=renderer=>{
  if(!gl){gl=renderer;cityRatio=renderer.getPixelRatio();cityAutoShadows=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;}
  // Pixel ratio by pixel budget, not by device: a 3× phone renders ~1.5 Mpx, never 9.
  const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(BUDGET/(innerWidth*innerHeight)));
  if(Math.abs(renderer.getPixelRatio()-ratio)>.01)renderer.setPixelRatio(ratio);
  if(shadowsDirty){renderer.shadowMap.needsUpdate=true;shadowsDirty=false;}
 };
 // A narrow perspective seen from far away: the dollhouse look with a little depth.
 const camera=new THREE.PerspectiveCamera(30,1,1,80),VIEW_DIR=new THREE.Vector3(10,10.5,12).normalize(),TARGET=new THREE.Vector3(0,.9,0);
 // Lights: hemisphere + one shadowed sun + one lamp. Their count never changes, so toggling never recompiles shaders.
 const hemi=new THREE.HemisphereLight();scene.add(hemi);
 const sun=new THREE.DirectionalLight();sun.castShadow=true;sun.shadow.mapSize.set(512,512);sun.shadow.bias=-.0015;sun.shadow.normalBias=.02;
 Object.assign(sun.shadow.camera,{left:-5.5,right:5.5,top:5.5,bottom:-5.5,near:.5,far:30});scene.add(sun,sun.target);
 const lamp=new THREE.PointLight('#ffb36b',0,7,1.6);lamp.position.set(0,1.6,0);scene.add(lamp);
 // Shell: floor slab, two walls with dark cut tops, baseboards. One BoxGeometry for all of them.
 const dark=own(toon({color:'#3b3430'})),floorMat=own(toon({color:'#ffffff'})),wallMat=own(toon({color:'#eeeeee'})),trim=own(toon({color:'#f7f4ee'}));
 const shell=new THREE.Group();scene.add(shell);
 const slab=new THREE.Mesh(BOX,[dark,dark,floorMat,dark,dark,dark]);slab.scale.set(2*HALF,.3,2*HALF);slab.position.y=-.15;slab.receiveShadow=true;shell.add(slab);
 const T=.22,walls=[[T,WALL_H,2*HALF+T,-HALF-T/2,WALL_H/2,-T/2],[2*HALF,WALL_H,T,0,WALL_H/2,-HALF-T/2]].map(([w,h,d,x,y,z])=>{const m=new THREE.Mesh(BOX,[wallMat,wallMat,dark,dark,wallMat,wallMat]);m.scale.set(w,h,d);m.position.set(x,y,z);m.receiveShadow=true;shell.add(m);return m;});
 for(const [w,d,x,z] of [[.05,2*HALF,-HALF+.025,0],[2*HALF,.05,0,-HALF+.025]]){const b=new THREE.Mesh(BOX,trim);b.scale.set(w,.14,d);b.position.set(x,.07,z);shell.add(b);}
 const addMesh=(geo,mat,[x,y,z],[sx,sy,sz],ry=0,parent=shell)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.y=ry;parent.add(m);return m;};
 // Wall details from the reference room, all cheap: posters, a clock, an air conditioner, a cork board.
 POSTERS.forEach((p,i)=>{const tex=posterTexture(p);if(tex)addMesh(PLANE,own(new THREE.MeshBasicMaterial({map:tex})),[-3+i*.62,1.95+(i%2)*.16,-HALF+.012],[.44,.6,1]);});
 const white=own(toon({color:'#f4f4f1'})),grey=own(toon({color:'#8a8d91'}));
 addMesh(DISC,dark,[1.2,2.15,-HALF+.01],[.44,.44,1]);addMesh(DISC,white,[1.2,2.15,-HALF+.015],[.38,.38,1]);addMesh(BOX,dark,[1.2,2.2,-HALF+.03],[.025,.12,.01]);addMesh(BOX,dark,[1.24,2.15,-HALF+.03],[.09,.02,.01]);
 addMesh(BOX,white,[-.3,2.4,-HALF+.14],[1,.28,.26]);addMesh(BOX,grey,[-.3,2.29,-HALF+.27],[.86,.025,.01]);
 const cork=own(toon({color:'#b88a5a'}));addMesh(BOX,cork,[-HALF+.02,1.85,-.7],[.03,.55,.75]);
 for(let i=0;i<4;i++)addMesh(PLANE,own(toon({color:['#fff4b8','#bfe3ff','#ffc7d1','#ffffff'][i]})),[-HALF+.04,1.73+(i%2)*.22,-.92+(i>>1)*.38],[.16,.16,1],Math.PI/2);
 // Name plate by the door.
 if(hasDom){const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#fb752b';g.fillRect(0,0,256,64);g.fillStyle='#1d2a30';g.font='bold 30px monospace';g.textAlign='center';g.fillText(owner.name.slice(0,14).toUpperCase(),128,43);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const m=own(new THREE.MeshBasicMaterial({map:tex}));owned.push(tex);addMesh(PLANE,m,[2.5,2.22,-HALF+.012],[.8,.2,1]);}
 // Accent tints: one cloned material per (template material) for this room only.
 const tints=new Map();
 const tint=c=>{c.color.set(MATERIALS.accent[room.materials.accent][0]);if(c.userData.darker)c.color.offsetHSL(0,0,-.12);return c;};
 const tinted=m=>{if(!tints.has(m)){const c=m.clone();c.userData.darker=m.name==='carpetDarker';tints.set(m,own(c));}return tint(tints.get(m));};
 const fabric=(item,m)=>ACCENT.has(item)&&(m.name==='carpet'||m.name==='carpetDarker');   // Kenney's upholstery materials
 const views=new Map();
 const viewMat=()=>{const tex=viewTexture(room.window,room.lighting);for(const m of views.values()){m.map=tex;m.needsUpdate=true;}return tex;};
 const curtainMat=own(toon({color:'#efe6d6'})),glowMat=own(new THREE.MeshBasicMaterial({map:glowTexture(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.5}));
 // Fake contact shadows: one soft dark quad (shared texture) under the character and under big pieces.
 const contactMat=own(new THREE.MeshBasicMaterial({map:glowTexture(),color:'#000000',transparent:true,opacity:.32,depthWrite:false}));
 const CONTACT=new Set(['bedSingle','bedDouble','loungeSofa','loungeDesignSofa','loungeChair','desk','deskCorner','bookcaseOpen','bookcaseClosedWide','kitchenFridge','kitchenFridgeSmall','washer','sideTableDrawers','cabinetTelevision','tableCoffee']);
 // Furniture: one wrapper per entry, built from the cached template (geometry shared, materials shared unless tinted).
 const furnitureRoot=new THREE.Group();scene.add(furnitureRoot);
 const pieces=[];   // pieces[i] mirrors room.furniture[i]: {wrap, model}
 const specials=new Set();   // live special pieces (animated each frame, disposed with their wrap)
 const drop=wrap=>{const sp=wrap?.userData.special;if(sp){sp.dispose();specials.delete(sp);}wrap?.removeFromParent();};
 async function makePiece(entry){
  const wrap=new THREE.Group();wrap.userData.entry=entry;
  if(IS_SPECIAL.has(entry.item)){if(closed)return wrap;const sp=createSpecial(entry.item,{text:entry.text,accent:MATERIALS.accent[room.materials.accent][0]});wrap.add(sp.root);wrap.userData.special=sp;specials.add(sp);return wrap;}
  let gltf;try{gltf=await model(entry.item);}catch{return wrap;}            // a missing model leaves an empty slot, never a crash
  if(closed)return wrap;
  const object=gltf.scene.clone(true);
  let d=dimsOf(entry.item);
  if(!d){object.scale.setScalar(SCALE);const b=new THREE.Box3().setFromObject(object),s=b.getSize(new THREE.Vector3());d={w:s.x,h:s.y,d:s.z,ox:-(b.min.x+s.x/2),oy:-b.min.y,oz:-(b.min.z+s.z/2)};measured.set(entry.item,d);}
  object.scale.setScalar(SCALE);object.position.set(d.ox,d.oy,d.oz);wrap.add(object);
  object.traverse(n=>{if(!n.isMesh)return;n.castShadow=!/^rug/.test(entry.item);n.receiveShadow=true;
   if(ACCENT.has(entry.item))n.material=Array.isArray(n.material)?n.material.map(m=>fabric(entry.item,m)?tinted(m):m):fabric(entry.item,n.material)?tinted(n.material):n.material;});
  if(entry.item==='wallWindow'||entry.item==='wallWindowSlide')decorateWindow(wrap,object,entry.item,d);
  if(SCREEN_ITEMS.has(entry.item))dressScreen(wrap,object,entry,d);
  if(CONTACT.has(entry.item)){const q=addMesh(PLANE,contactMat,[0,.008,0],[d.w*1.25,d.d*1.25,1],0,wrap);q.rotation.x=-Math.PI/2;q.userData.glow=true;q.raycast=()=>{};}
  return wrap;
 }
 // Kenney's window is a wall slab with a frame; the room has its own walls, so the slab is hidden and the opening gets
 // a view plane, two curtains on a rod and a patch of window light on the floor.
 function decorateWindow(wrap,object,item,d){
  let glass=null;object.traverse(n=>{if(!n.isMesh)return;if(n.material.name==='_defaultMat')n.visible=false;if(n.material.name==='glass')glass=n;});
  const box=once('glass:'+item,()=>{object.updateMatrixWorld(true);return glass?new THREE.Box3().setFromObject(glass):new THREE.Box3(new THREE.Vector3(-d.w*.3,d.h*.35,0),new THREE.Vector3(d.w*.3,d.h*.8,0));});
  const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());
  const m=own(new THREE.MeshBasicMaterial({map:viewTexture(room.window,room.lighting)}));views.set(wrap,m);
  addMesh(PLANE,m,[c.x,c.y,-d.d/2+.02],[s.x+.04,s.y+.04,1],0,wrap);
  for(const k of [-1,1]){const cur=addMesh(BOX,curtainMat,[c.x+k*(s.x/2+.3),c.y-.05,d.d/2+.07],[.2,s.y+.45,.06],0,wrap);cur.castShadow=true;}
  addMesh(BOX,dark,[c.x,c.y+s.y/2+.22,d.d/2+.08],[s.x+1,.035,.035],0,wrap);
  const patch=addMesh(PLANE,glowMat,[c.x,.012,d.d/2+1],[s.x*1.6,1.7,1],0,wrap);patch.rotation.x=-Math.PI/2;patch.userData.glow=true;
 }
 // A screen shows a project (screens take the projects in switcher order, round robin), else a wallpaper or a screensaver;
 // at dusk a soft spill of screen light falls on the surface in front of it.
 const screenGlow=own(new THREE.MeshBasicMaterial({map:glowTexture(),color:'#8fb8ff',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}));
 function dressScreen(wrap,object,entry,d){
  const list=room.furniture.filter(f=>SCREEN_ITEMS.has(f.item)),k=Math.max(0,list.indexOf(entry)),p=desk.projects.length?desk.projects[k%desk.projects.length]:null;
  wrap.userData.project=p;const glass=screenMesh(object),tex=screenTexture(p,mine);if(!glass||!tex)return;
  glass.geometry=own(screenGeometry(glass.geometry));glass.material=own(new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));glass.castShadow=false;
  const g=addMesh(PLANE,screenGlow,[0,.006,d.d/2+.18],[d.w*1.7,.55,1],0,wrap);g.rotation.x=-Math.PI/2;g.raycast=()=>{};
 }
 function place(i){
  const p=pieces[i],e=room.furniture[i];if(!p)return;const d=dimsOf(e.item);if(!d)return;
  const [x,y,z]=renderPosition(e,d);p.wrap.position.set(x,y,z);p.wrap.rotation.y=e.rot*Math.PI/180;p.wrap.userData.entry=e;
  p.wrap.traverse(n=>{if(n.userData.glow)n.position.y=.012-y;});p.wrap.updateMatrixWorld(true);shadowsDirty=true;
 }
 async function build(){
  const list=room.furniture.slice();
  const wraps=await Promise.all(list.map(makePiece));if(closed)return;
  for(const p of pieces)drop(p.wrap);furnitureRoot.clear();pieces.length=0;
  wraps.forEach((wrap,i)=>{pieces.push({wrap});furnitureRoot.add(wrap);place(i);});
  applyLook();
 }
 let lampOn=null;   // index of the lamp the resident switched (null: follow the light preset)
 function lampIndex(){if(lampOn!==null&&room.furniture[lampOn]&&actionFor(room.furniture[lampOn].item)==='toggle')return lampOn;return room.furniture.findIndex(f=>/^lamp/.test(f.item));}
 let lampsLit=false;
 const daylight=()=>room.daylight??presetDaylight(room.lighting);
 function applyLook(){
  const L=daylightAt(daylight());shadowsDirty=true;
  floorMat.map=floorTexture(room.materials.floor);floorMat.needsUpdate=true;
  wallMat.color.set(MATERIALS.walls[room.materials.walls][0]);
  for(const c of tints.values())tint(c);
  scene.background=new THREE.Color(L.sky);hemi.color.set(L.hemi[0]);hemi.groundColor.set(L.hemi[1]);hemi.intensity=L.hemi[2];
  sun.color.set(L.sun[0]);sun.intensity=L.sun[1];sun.position.set(...L.sun[2]);
  glowMat.color.set(L.glow[0]);glowMat.opacity=L.glow[1];viewMat();
  screenGlow.opacity=Math.max(0,(daylight()-.5)*1.1);screenGlow.visible=screenGlow.opacity>0;
  const li=lampIndex(),on=li>=0&&lampsLit;
  if(on){const e=room.furniture[li],d=dimsOf(e.item);const [x,y,z]=d?renderPosition(e,d):[e.x,0,e.z];lamp.position.set(x,y+(d?d.h*.85:1.4),z);}
  lamp.intensity=on?(room.lighting==='night'?5:room.lighting==='evening'?3.5:2.5):0;
 }
 lampsLit=daylightAt(daylight()).lamps;
 await build();if(closed)return;

 // ------------------------------------------------ the resident
 let me;
 try{me=await loadCharacter(owner.look||{},{template:host.template});}catch{me=boxCharacter(owner.look||{});}
 me.root.traverse(n=>{if(n.isMesh)n.castShadow=false;});
 scene.add(me.root);me.root.rotation.y=Math.PI/4;
 {const free=(x,z)=>!room.furniture.some(f=>{const d=dimsOf(f.item);if(!d||WALL_ITEMS.has(f.item)||/^rug/.test(f.item))return false;const {hx,hz}=extent(f,d);return Math.abs(x-f.x)<hx+.25&&Math.abs(z-f.z)<hz+.25;});
  const [x,z]=[[1.2,1.8],[.4,2.6],[2.2,2.4],[-.6,2.9],[1.8,.2],[0,0]].find(([x,z])=>free(x,z))||[1.2,1.8];me.root.position.set(x,0,z);}
 const feet=new THREE.Mesh(PLANE,contactMat);feet.rotation.x=-Math.PI/2;feet.scale.set(.75,.75,1);feet.raycast=()=>{};scene.add(feet);
 // Movement the Sims/Habbo way (motion.js): tile routes around the furniture, a turn on the spot, a walk cycle driven by distance.
 const mv=mover({x:me.root.position.x,z:me.root.position.z,yaw:me.root.rotation.y,speed:1.5});
 const footprints=()=>room.furniture.filter(f=>!WALL_ITEMS.has(f.item)&&!OVERHEAD.has(f.item)&&!/^rug/.test(f.item)&&!(f.y>0)).map(f=>{const d=dimsOf(f.item);if(!d)return null;const {hx,hz}=extent(f,d);return {x:f.x,z:f.z,hx,hz};}).filter(Boolean);
 // The Sims brain (needs.js): five traits drawn from the owner's name, needs that decay in game hours, a choice every few seconds
 // when nobody is tapping. Doors and lamps are left to taps: an autonomous "leave" would close the room under the visitor.
 const seed=[...owner.name].reduce((a,c)=>(a*31+c.charCodeAt(0))|0,7)>>>0;
 const brain=makeResident(owner.traits||Object.fromEntries(TRAITS.map((t,i)=>[t,((seed>>(i*6))&63)/63])));
 let free=true,think=3;   // free: standing idle with nothing in hand; think: seconds to the next autonomous choice
 const timers=new Set(),later=(ms,fn)=>{const id=setTimeout(()=>{timers.delete(id);if(!closed)fn();},ms);timers.add(id);return id;};
 function stand(){endShow();me.pose(null);me.root.position.y=0;mv.set(me.root.position.x,me.root.position.z,me.root.rotation.y);}
 function walkTo(x,z,then){
  const c=v=>Math.min(HALF-.3,Math.max(-HALF+.3,v));stand();free=false;
  const path=route(blockedTiles(footprints(),HALF),me.root.position,{x,z},HALF,mv.heading)||[{x:c(x),z:c(z)}];   // boxed in: walk straight
  mv.go(path,()=>{me.play('Idle');free=!then;then?.();});
 }
 function face(x,z){mv.face(Math.atan2(x-me.root.position.x,z-me.root.position.z));}
 function faceCamera(){face(camera.position.x,camera.position.z);}
 function use(i,after){
  const e=room.furniture[i],d=dimsOf(e?.item);if(!e||!d)return;const act=actionFor(e.item),spot=act==='lie'||act==='sit'?approach(e,d):OVERHEAD.has(e.item)?{x:e.x+.25,z:e.z+.25}:standSpot(room.furniture,i,dimsOf),[px,py,pz]=renderPosition(e,d),a=e.rot*Math.PI/180;
  useAd(brain,e.item);lastSpot=spot;
  walkTo(spot.x,spot.z,()=>{
   const done=ms=>later(ms,()=>{me.play('Idle');free=true;});
   if(act==='lie'){me.root.position.set(px,py+d.h*(SURFACE[e.item]||.5),pz);me.root.rotation.y=a;me.pose('lie');hud.say(ACTION_TEXT.lie);after?.();return;}
   if(act==='sit'&&IS_SPECIAL.has(e.item)){me.root.position.set(px,Math.max(0,py+SPECIAL_SEAT[e.item]-me.offsets.seat),pz);me.root.rotation.y=a;me.pose('sit');hud.say(SPECIAL_USE[e.item].say);return;}
   if(act==='sit'){const seat=py+d.h*(SURFACE[e.item]||.45);me.root.position.set(px+Math.sin(a)*-.05,Math.max(0,seat-me.offsets.seat),pz+Math.cos(a)*-.05);me.root.rotation.y=a;me.pose('sit');
    if(workAfterSit){workAfterSit=false;me.play('Interact');hud.say(ACTION_TEXT.work);}else hud.say(ACTION_TEXT.sit);after?.();return;}
   face(px,pz);
   if(IS_SPECIAL.has(e.item)){useSpecial(i,done);return;}
   if(act==='toggle'){me.play('Interact');const wasLit=lampsLit&&lampIndex()===i;lampOn=i;lampsLit=!wasLit;applyLook();hud.say(lampsLit?`${label(e.item)} on.`:`${label(e.item)} off.`);done(1200);return;}
   if(act==='look'){me.play('Idle_Neutral');hud.say(ACTION_TEXT.look);done(5000);return;}
   if(act==='leave'){faceCamera();me.play('Wave');hud.say(ACTION_TEXT.leave);later(1900,close);return;}
   if(act==='walk'){me.play('Idle');free=true;return;}
   me.play('Interact');hud.say(USE_TEXT[e.item]||(act==='work'?ACTION_TEXT.work:`Checking the ${label(e.item).toLowerCase()}.`));if(act!=='work')done(3500);after?.();
  });
 }
 // Autonomy: when the resident is free (or done with what it was using), it picks the loudest advertisement nearby.
 function autonomy(){
  if(editing||pc||mv.busy||brain.busy||!(free||me.posed))return;
  const c=choose(brain,room.furniture.map(f=>{const a=actionFor(f.item);return a==='leave'||a==='toggle'?{item:null}:f;}),me.root.position);
  if(c)actionFor(c.item)==='work'?useForWork(c.i):use(c.i);
 }
 let workAfterSit=false;
 // A desk is used from the chair in front of it, if there is one.
 function nearestSeat(p){let best=-1,dist=1.4;room.furniture.forEach((f,j)=>{if(actionFor(f.item)!=='sit'||/^lounge/.test(f.item))return;const k=Math.hypot(f.x-p.x,f.z-p.z);if(k<dist){dist=k;best=j;}});return best;}
 const useForWork=(i,after)=>{const e=room.furniture[i],d=dimsOf(e?.item);if(!d)return;const seat=nearestSeat(approach(e,d));if(seat>=0){workAfterSit=true;use(seat,after);}else use(i,after);};

 // ------------------------------------------------ the computer (desk.js): walk over, sit, open the overlay; closing stands up
 let pc=null,pcPending=null;   // pcPending: the walk to the computer in progress (a token; any other tap cancels it)
 function getUp(){if(me.posed&&lastSpot){stand();me.root.position.set(lastSpot.x,0,lastSpot.z);mv.set(lastSpot.x,lastSpot.z,me.root.rotation.y);}stand();me.stopEmote?.();me.play('Idle');free=true;}
 function openPc(project){pcPending=null;if(closed||pc)return;
  pc=openComputer({model:desk,project,ownerName:owner.name,onIdea:host.openIdea?()=>{close();host.openIdea();}:null,onClose({quiet}={}){pc=null;if(!quiet&&!closed){getUp();hud.say(mine?'Back to the room.':`${owner.name} gets up from the computer.`);}}});}
 function toComputer(i){
  if(pc||pcPending)return;const e=i>=0?room.furniture[i]:null;
  if(!e||!dimsOf(e.item)){const s=room.furniture.findIndex(f=>SCREEN_ITEMS.has(f.item));if(s>=0&&s!==i){toComputer(s);return;}openPc(null);return;}   // no computer in the room: open straight away
  const project=pieces[i]?.wrap.userData.project??desk.projects[0]??null,token=pcPending={},go=()=>{if(pcPending===token)openPc(project);};
  later(9000,go);   // never stranded on a blocked path
  if(actionFor(e.item)==='work')useForWork(i,go);else use(i,go);
 }

 // ------------------------------------------------ emotes and special pieces
 // A show (an emote, a special piece in use, a skate loop) pauses autonomy: free=false until it ends, like use()'s done(ms).
 let show=null,glide=null,party=0,lastSpot=null;
 function endShow(){if(!show)return;const s=show;show=null;clearTimeout(s.timer);timers.delete(s.timer);if(s.hidden)s.hidden.visible=true;glide=null;me.stopEmote?.();
  mv.set(me.root.position.x,me.root.position.z,me.root.rotation.y);}
 function startShow(ms,extra={}){show={...extra,timer:later(ms,()=>{const s=show;endShow();if(!me.posed)me.play('Idle');free=true;s?.then?.();})};return show;}
 // Skating: a loop through free tiles on its own mover; the board is the character's (characters.js), the floor one hides meanwhile.
 function startGlide(){const blocked=blockedTiles(footprints(),HALF),cands=[[2,2],[2,-1.8],[-1.2,-1.6],[-1.4,2.2],[.4,2.8],[2.6,.2]].filter(([x,z])=>!blocked.has(`${Math.round(x/.5)},${Math.round(z/.5)}`));
  let at={x:me.root.position.x,z:me.root.position.z},pts=[];for(let k=0;k<3;k++)for(const [x,z] of cands){const r=route(blocked,at,{x,z},HALF);if(r)pts.push(...r);at={x,z};}
  if(!pts.length)return false;glide={mv:mover({x:me.root.position.x,z:me.root.position.z,yaw:me.root.rotation.y,speed:1.9,turnRate:6})};glide.mv.go(pts);return true;}
 function useSpecial(i,done){
  const e=room.furniture[i],sp=pieces[i]?.wrap.userData.special,u=SPECIAL_USE[e.item]||{ms:2500};if(!sp){done(1500);return;}
  if(e.item==='karaokeMic'||HANGING.has(e.item))faceCamera();
  const ms=sp.use(me);hud.say(u.say||`Using the ${label(e.item).toLowerCase()}.`);if(u.party)party=ms/1000;if(u.burst)party=Math.max(party,2.4);
  const s=startShow(ms);if(u.glide&&startGlide()){s.hidden=sp.root;sp.root.visible=false;}
 }
 // The owner's emote bar. Sleep and sit use a bed or chair when there is one; loops stop after a while (or on any tap).
 function doEmote(name){
  if(editing)return;if(show?.emote===name){stand();free=true;me.play('Idle');return;}   // the same button again stops it
  // Sitting or lying on something: hop off to where the resident stood to get on it (the Sims' instant "get up").
  if(me.posed&&lastSpot){stand();me.root.position.set(lastSpot.x,0,lastSpot.z);mv.set(lastSpot.x,lastSpot.z,me.root.rotation.y);}
  stand();free=false;const near=list=>{let best=-1,dist=1e9;room.furniture.forEach((f,j)=>{if(!list.includes(actionFor(f.item))||OVERHEAD.has(f.item))return;const k=Math.hypot(f.x-me.root.position.x,f.z-me.root.position.z);if(k<dist){dist=k;best=j;}});return best;};
  hud.say(EMOTE_TEXT[name]||'');
  if(name==='sleep'){const bed=near(['lie']);if(bed>=0){use(bed,()=>{me.emote?.('sleep');startShow(12000);});return;}useAd(brain,'bedSingle');}
  if(name==='sit'){const seat=room.furniture.findIndex(f=>actionFor(f.item)==='sit'&&Math.hypot(f.x-me.root.position.x,f.z-me.root.position.z)<1.6);if(seat>=0){use(seat);return;}}
  if(name==='moonwalk'){const p=me.root.position;me.root.rotation.y=Math.atan2(-p.x,-p.z);mv.set(p.x,p.z,me.root.rotation.y);}
  if(name==='wave')faceCamera();
  if(!me.emote?.(name,{onDone:()=>{if(show?.emote===name){endShow();free=true;me.play('Idle');}}})){me.play('Wave');later(2000,()=>{free=true;});return;}
  startShow(name==='sit'||name==='sleep'?12000:name==='wave'?2400:8000,{emote:name});
  if(name==='skate')startGlide();
 }
 // The pet (accessories.js) follows a point behind the owner; a cat curls up on the bed with a sleeper, dogs jump for joy.
 let pet=null;const petGoal=new THREE.Object3D();
 try{const p=owner.look?.pet;if(p?.kind){pet=createPet(p);pet.root.position.set(me.root.position.x+.8,0,me.root.position.z+.6);pet.root.traverse(n=>{if(n.isMesh){n.castShadow=false;n.raycast=()=>{};}});scene.add(pet.root);}}catch(err){console.warn('pet',err);pet=null;}
 let petT=0;
 function petStep(dt){
  petT+=dt;const r=me.root.position,kind=pet.root.userData.kind,lying=me.posed==='lie',hop=me.emoting==='celebrate'||party>0;
  petGoal.position.set(r.x,lying&&kind==='cat'?r.y:0,r.z);petGoal.rotation.y=me.root.rotation.y;
  const st=petFollow(pet.root,petGoal,dt,{distance:lying?(kind==='cat'?-.55:-1.3):me.posed==='sit'?-.8:.85,speed:me.emoting==='skate'?3:2.2});
  const curl=lying&&kind==='cat'&&!st.moving;pet.root.scale.y+=((curl?.7:1)-pet.root.scale.y)*Math.min(1,dt*4);
  if(hop&&kind!=='cat'&&!lying)pet.root.position.y+=Math.abs(Math.sin(petT*7))*.28;
  pet.update(dt,st);
 }

 // ------------------------------------------------ editing (owner)
 let editing=false,selected=-1,drag=null;
 const marker=new THREE.Mesh(PLANE,own(new THREE.MeshBasicMaterial({color:'#fb752b',transparent:true,opacity:.35,depthWrite:false})));marker.rotation.x=-Math.PI/2;marker.visible=false;scene.add(marker);
 function showMarker(){const e=room.furniture[selected],p=pieces[selected];if(!e||!p){marker.visible=false;return;}const d=dimsOf(e.item);if(!d){marker.visible=false;return;}
  const [x,y,z]=renderPosition(e,d),{hx,hz}=WALL_ITEMS.has(e.item)?(e.wall==='left'?{hx:d.d/2,hz:d.w/2}:{hx:d.w/2,hz:d.d/2}):extent(e,d);
  marker.position.set(x,(e.y||0)+.02,z);marker.scale.set(hx*2+.15,hz*2+.15,1);marker.visible=true;}
 function select(i){selected=i;showMarker();hud.select(i>=0?room.furniture[i]:null);}
 function settle(i){const e=room.furniture[i];if(!e||WALL_ITEMS.has(e.item))return;if(SMALL.has(e.item)||e.y){const y=stackHeight(room.furniture,i,dimsOf);if(y>0)e.y=y;else delete e.y;}}
 function moveTo(i,x,z){const e=room.furniture[i],d=dimsOf(e.item);if(!d)return;let next={...e,x,z};const ride=riders(room.furniture,i,dimsOf),ox=e.x,oz=e.z;
  if(WALL_ITEMS.has(e.item))next.wall=x+HALF<z+HALF?'left':'back';
  if(HANGING.has(e.item))next.rot=x+HALF<z+HALF?90:0;
  next=clampEntry(next,d);Object.assign(e,next);if(!next.y)delete e.y;settle(i);place(i);
  for(const j of ride){const r=room.furniture[j];Object.assign(r,clampEntry({...r,x:r.x+e.x-ox,z:r.z+e.z-oz},dimsOf(r.item)||d));place(j);}
  showMarker();applyLook();}
 const edit={
  rotate(){const e=room.furniture[selected];if(!e||WALL_ITEMS.has(e.item)||HANGING.has(e.item))return;e.rot=(e.rot+90)%360;Object.assign(e,clampEntry(e,dimsOf(e.item)));place(selected);showMarker();},
  raise(){const e=room.furniture[selected];if(!e||WALL_ITEMS.has(e.item))return;if(e.y)delete e.y;else{const y=stackHeight(room.furniture,selected,dimsOf);if(y>0)e.y=y;else hud.say('Move it over a desk, shelf or bed first.');}place(selected);select(selected);},
  deselect(){select(-1);},
  remove(){if(selected<0)return;room.furniture.splice(selected,1);const [p]=pieces.splice(selected,1);drop(p.wrap);shadowsDirty=true;select(-1);applyLook();hud.count(room.furniture.length);},
  async add(item){
   if(room.furniture.length>=LIMITS.max){hud.say(`A room holds at most ${LIMITS.max} pieces.`);return;}
   if(IS_SPECIAL.has(item)&&!isUnlocked('items',item,unlocks,tierInfo)){hud.say(`${label(item)} unlocks at ${tierLabel(tierOf(tierInfo.items,item))||'a higher tier'}.`);return;}
   const base=selected>=0?room.furniture[selected]:null;
   const entry={item,x:base&&SMALL.has(item)?base.x:(Math.random()-.5)*2,z:base&&SMALL.has(item)?base.z:(Math.random()-.5)*2+1,rot:0};
   if(WALL_ITEMS.has(item)){entry.wall='back';entry.x=0;}if(DEFAULT_Y[item])entry.y=DEFAULT_Y[item];
   if(HANGING.has(item)){entry.z=-HALF;entry.x=Math.round((Math.random()-.5)*300)/100;}
   room.furniture.push(entry);pieces.push({wrap:new THREE.Group()});
   const wrap=await makePiece(entry);if(closed)return;const j=room.furniture.indexOf(entry);if(j<0)return;
   drop(pieces[j].wrap);pieces[j]={wrap};furnitureRoot.add(wrap);
   const d=dimsOf(item);if(d){Object.assign(entry,clampEntry(entry,d));settle(j);}place(j);applyLook();select(j);hud.count(room.furniture.length);
  },
  set(key,value){
   if(key==='lighting'){room.lighting=value;delete room.daylight;}
   else if(key==='daylight'){room.daylight=Math.round(value*100)/100;room.lighting=nearestPreset(value);}
   else if(key==='window')room.window=value;else room.materials[key]=value;
   if(key==='lighting'||key==='daylight')lampsLit=daylightAt(daylight()).lamps;applyLook();return room;},
  // Text on a poster or ticker: the piece is rebuilt (its canvas texture is cached per text).
  async text(value){const e=room.furniture[selected];if(!e||!TEXT_ITEMS.has(e.item))return;const t=[...String(value||'').trim()].slice(0,TEXT_MAX).join('');
   if(t)e.text=e.item==='neonTicker'?t.toUpperCase():t;else delete e.text;const i=selected,wrap=await makePiece(e);if(closed||room.furniture[i]!==e){drop(wrap);return;}drop(pieces[i].wrap);pieces[i]={wrap};furnitureRoot.add(wrap);place(i);},
  async save(){room=upgradeRoom(room);let r;try{r=await api('/api/rooms/me',{method:'PUT',body:{room}});}catch(err){throw new Error(lockedMessage(err,tierInfo)||err.message||'Could not save.');}
   if(Array.isArray(r?.room?.furniture))room.furniture.forEach((f,i)=>{const t=r.room.furniture[i]?.text;if(t&&TEXT_ITEMS.has(f.item))f.text=t;});room.window=r?.room?.window||room.window;saved=JSON.stringify(room);},
  async revert(){room=upgradeRoom(JSON.parse(saved));hud.sync(room);lampsLit=daylightAt(daylight()).lamps;select(-1);await build();},
  start(){editing=true;stand();free=true;me.play('Idle');},stop(){editing=false;select(-1);},
  emote:doEmote,
  dirty:()=>JSON.stringify(room)!==saved,
 };

 // ------------------------------------------------ input
 const ray=new THREE.Raycaster(),floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),hitPoint=new THREE.Vector3(),ndc=new THREE.Vector2();
 const pieceAt=()=>{const hit=ray.intersectObjects(furnitureRoot.children,true).find(h=>h.object.visible&&!h.object.userData.glow);if(!hit)return -1;let n=hit.object;while(n&&n.parent!==furnitureRoot)n=n.parent;return n?pieces.findIndex(p=>p.wrap===n):-1;};
 const floorAt=()=>ray.ray.intersectPlane(floorPlane,hitPoint)?{x:hitPoint.x,z:hitPoint.z}:null;
 const canvas=document.querySelector('#world canvas');
 const toNdc=e=>{const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);};
 // Drag to move (edit mode). Taps arrive through view.click from the city's own pointer handling.
 const onDown=e=>{if(!editing)return;toNdc(e);const i=pieceAt();if(i<0)return;const f=floorAt(),en=room.furniture[i];drag={i,x:e.clientX,y:e.clientY,dx:f?en.x-f.x:0,dz:f?en.z-f.z:0,moved:false};};
 const onMove=e=>{if(!drag)return;if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<7)return;if(!drag.moved){drag.moved=true;select(drag.i);}
  toNdc(e);const f=floorAt();if(f)moveTo(drag.i,f.x+drag.dx,f.z+drag.dz);};
 const onUp=()=>{drag=null;};
 canvas?.addEventListener('pointerdown',onDown);addEventListener('pointermove',onMove);addEventListener('pointerup',onUp);addEventListener('pointercancel',onUp);
 const view={scene,camera,
  // Fit the whole room: portrait screens are width-bound and lift the room above the bottom sheet.
  resize(aspect){
   // Back off until a sphere around the room fits both ways; portrait screens push the room up above the editor sheet.
   const R=5,v=THREE.MathUtils.degToRad(camera.fov)/2,h=Math.atan(Math.tan(v)*aspect),dist=R/Math.sin(Math.min(v,h))*(aspect<.8?.92:.98);
   camera.aspect=aspect;camera.position.copy(VIEW_DIR).multiplyScalar(dist).add(TARGET);camera.lookAt(TARGET);
   const lift=aspect<.8?.16:0;if(lift)camera.setViewOffset(1000*aspect,1000,0,1000*lift,1000*aspect,1000);else camera.clearViewOffset();
   camera.near=dist-12;camera.far=dist+12;camera.updateProjectionMatrix();},
  click(p){ray.setFromCamera(p,camera);if(pc)return;pcPending=null;
   if(editing){const i=pieceAt();if(i>=0){select(i);return;}const f=floorAt();if(selected>=0&&f&&Math.abs(f.x)<=HALF&&Math.abs(f.z)<=HALF){moveTo(selected,f.x,f.z);return;}select(-1);return;}
   const i=pieceAt();if(i>=0&&SCREEN_ITEMS.has(room.furniture[i].item)&&hasDesk(desk)){toComputer(i);return;}   // owner and visitor alike
   if(!mine)return;
   if(i>=0){if(actionFor(room.furniture[i].item)==='work')useForWork(i);else use(i);return;}
   const f=floorAt();if(f&&Math.abs(f.x)<=HALF&&Math.abs(f.z)<=HALF)walkTo(f.x,f.z);},
  update(dt){
   const r=me.root.position;
   if(glide){const p=glide.mv.update(dt);r.x=p.x;r.z=p.z;me.root.rotation.y=p.yaw;if(!glide.mv.busy){glide=null;mv.set(r.x,r.z,p.yaw);}}
   else if(me.emoting==='moonwalk'){}   // the character slides itself (characters.js); synced back to the mover below
   else if(!me.posed){const p=mv.update(dt);
    if(!me.posed){r.x=p.x;r.z=p.z;me.root.rotation.y=p.yaw;   // the arrival callback may have put the resident on a bed or chair
     if(p.moving){me.play('Walk');me.stride?.(p.phase);}
     else if(p.fidget&&free){me.play('Idle_Neutral');later(2200,()=>{if(free&&!mv.busy)me.play('Idle');});}}}
   tick(brain,dt*HOURS_PER_SECOND);think-=dt;if(think<=0){think=3+Math.random()*4;autonomy();}
   me.update(dt);
   if(me.emoting==='moonwalk'){r.x=Math.min(HALF-.4,Math.max(-HALF+.4,r.x));r.z=Math.min(HALF-.4,Math.max(-HALF+.4,r.z));mv.set(r.x,r.z,me.root.rotation.y);}
   if(party>0)party-=dt;for(const sp of specials)sp.update(dt);if(pet)petStep(dt);
   feet.position.set(r.x,(me.posed==='lie'?r.y:0)+.012,r.z);feet.visible=me.posed!=='lie';
  },
  dispose(){
   closed=true;for(const id of timers)clearTimeout(id);
   canvas?.removeEventListener('pointerdown',onDown);removeEventListener('pointermove',onMove);removeEventListener('pointerup',onUp);removeEventListener('pointercancel',onUp);
   me.dispose();pet?.dispose();for(const sp of specials)sp.dispose();specials.clear();for(const m of owned)m.dispose();scene.clear();
   if(gl){gl.shadowMap.autoUpdate=cityAutoShadows;gl.shadowMap.needsUpdate=true;gl.setPixelRatio(cityRatio);}
  },
 };
 const hud=roomHud({owner,mine,room,edit,plotId,guestbook:Array.isArray(data.guestbook)?data.guestbook:null,visits:data.visits,unlocks,tierInfo,viewer,onClose:close,onWave(){if(mv.busy)return;stand();faceCamera();me.play('Wave');hud.say(`${owner.name} waves back.`);}});
 function close(){if(closed)return;pc?.close({quiet:true});host.setView(null);hud.remove();view.dispose();}
 host.setView(view);
 if(hasDesk(desk)){const b=el('button',{className:'button button-dark room-pc-btn',type:'button',textContent:desk.projects.length?`💻 ${mine?'Your':owner.name+'\u2019s'} computer`:'💻 Computer',onclick:()=>toComputer(room.furniture.findIndex(f=>SCREEN_ITEMS.has(f.item)))});hud.root.append(b);}
 hud.say(welcomeText({mine,name:owner.name,model:desk}));
 if(lampsLit)applyLook();
}

// ---------------------------------------------------------------- HUD: moodboard, daylight, catalog drawer
const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids.filter(k=>k!=null));return n;};
function roomHud({owner,mine,room,edit,plotId,guestbook,visits,unlocks,tierInfo=FALLBACK_UNLOCKS,viewer,onClose,onWave}){
 const root=el('section',{className:'room-hud'});root.setAttribute('aria-label',`${owner.name}'s room`);
 const title=el('div',{},el('span',{className:'eyebrow',textContent:mine?'YOUR ROOM':'VISITING'}),el('strong',{textContent:`${owner.name}'s room`}));
 const close=el('button',{className:'button button-dark',textContent:'Back to the city ←',onclick:()=>{if(edit.dirty()&&!confirm('Leave without saving your changes?'))return;onClose();}});
 const bubble=el('div',{className:'room-bubble'});bubble.setAttribute('role','status');
 root.append(el('div',{className:'room-top'},title,close),bubble);
 const api2={root,say(t){bubble.textContent=t;},select(){},count(){},sync(){},remove(){root.remove();}};
 if(guestbook)root.append(guestbookPanel({owner,mine,plotId,entries:guestbook,visits,viewer,say:api2.say}));
 if(!mine){root.append(el('button',{className:'button button-orange room-hi',textContent:`Say hi to ${owner.name}`,onclick:onWave}));document.body.append(root);return api2;}
 // Emote bar: every emote, the locked ones greyed with the tier that opens them.
 const emotes=el('div',{className:'room-emotes'});emotes.setAttribute('aria-label','Emotes');
 for(const name of EMOTES){const open=isUnlocked('emotes',name,unlocks,tierInfo),tier=tierOf(tierInfo.emotes,name);
  const b=el('button',{className:'room-emote'+(open?'':' is-locked'),title:open?name:`${name}: unlocks at ${tierLabel(tier)}`,onclick:()=>open?edit.emote(name):api2.say(`“${name}” unlocks at ${tierLabel(tier)||'a higher tier'}.`)},
   el('span',{className:'room-emote-icon',textContent:EMOTE_ICON[name]||'•'}),el('small',{textContent:open?name:tierLabel(tier)}));b.dataset.emote=name;if(!open)b.setAttribute('aria-disabled','true');emotes.append(b);}
 root.append(emotes);

 const editBtn=el('button',{className:'button button-orange room-edit',textContent:'Edit room'});
 const sheet=el('aside',{className:'room-editor',hidden:true});sheet.setAttribute('aria-label','Room editor');
 const tabs=el('div',{className:'room-tabs'}),bodies={};
 const pressed=(group,b)=>group.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
 const tab=(id,name,body)=>{const b=el('button',{className:'room-tab',textContent:name,onclick:()=>{pressed(tabs,b);for(const [k,v] of Object.entries(bodies))v.hidden=k!==id;}});tabs.append(b);bodies[id]=body;body.hidden=true;return b;};
 // Moodboard
 const mood=el('div',{className:'room-mood'}),swatchRows={};
 for(const [key,name] of [['floor','Floor'],['walls','Walls'],['accent','Bedding & upholstery']]){const row=el('div',{className:'room-swatches'});swatchRows[key]=row;
  for(const [id,[color,kind]] of Object.entries(MATERIALS[key])){const b=el('button',{className:`swatch swatch-${kind||'paint'}`,title:id.replace(/_/g,' ')});b.style.setProperty('--c',color);b.setAttribute('aria-label',`${name}: ${b.title}`);b.dataset.id=id;
   b.onclick=()=>{edit.set(key,id);pressed(row,b);};row.append(b);}
  mood.append(el('fieldset',{},el('legend',{textContent:name}),row));}
 const viewRow=el('div',{className:'room-chips'});
 for(const [id,name] of Object.entries(WINDOW_VIEWS)){const b=el('button',{className:'chip',textContent:name});b.dataset.id=id;b.onclick=()=>{edit.set('window',id);pressed(viewRow,b);};viewRow.append(b);}
 mood.append(el('fieldset',{},el('legend',{textContent:'Window view'}),viewRow));
 // Daylight
 const light=el('div',{className:'room-light'}),lightRow=el('div',{className:'room-daylight'}),keys=Object.keys(LIGHTING);
 const slider=el('input',{type:'range',min:0,max:100,step:1,className:'room-slider'});slider.setAttribute('aria-label','Time of day');
 const markLight=r=>{lightRow.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.id===r.lighting)));slider.value=Math.round((r.daylight??presetDaylight(r.lighting))*100);};
 const setLight=id=>markLight(edit.set('lighting',id));
 for(const id of keys){const L=LIGHTING[id];const b=el('button',{className:'room-daycard',onclick:()=>setLight(id)},el('span',{className:'room-dayicon',textContent:L.icon}),el('strong',{textContent:id[0].toUpperCase()+id.slice(1)}),el('small',{textContent:L.time}));b.dataset.id=id;b.style.setProperty('--sky',L.sky);lightRow.append(b);}
 slider.oninput=()=>markLight(edit.set('daylight',slider.value/100));light.append(lightRow,slider);
 // Catalog drawer
 const add=el('div',{className:'room-add'}),cats=el('div',{className:'room-chips room-cats'}),grid=el('div',{className:'room-catalog'}),counter=el('span',{className:'room-count'});
 const showCat=c=>{grid.replaceChildren(...(c==='special'?SPECIAL:CATALOG[c]).map(item=>{const open=!IS_SPECIAL.has(item)||isUnlocked('items',item,unlocks,tierInfo),tier=tierOf(tierInfo.items,item);
   return el('button',{className:'room-item'+(IS_SPECIAL.has(item)?' room-item-special':'')+(open?'':' is-locked'),title:open?label(item):`Unlocks at ${tierLabel(tier)}`,onclick:()=>edit.add(item)},el('span',{className:'room-item-dot'}),el('span',{textContent:label(item)}),open?null:el('small',{className:'room-tier',textContent:tierLabel(tier)}));}));
  cats.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.id===c)));};
 for(const c of [...Object.keys(CATALOG),'special']){const b=el('button',{className:'chip'+(c==='special'?' chip-special':''),textContent:c==='special'?'★ Special':CATEGORY_LABELS[c],onclick:()=>showCat(c)});b.dataset.id=c;cats.append(b);}
 add.append(el('p',{className:'fine'},'Tap to add. Drag a piece to move it, or select it and tap the floor. ',counter),cats,grid);showCat('sleep');
 const first=tab('mood','Moodboard',mood);tab('light','Daylight',light);tab('add','Add furniture',add);
 const save=el('button',{className:'button button-orange',textContent:'Save room'}),cancel=el('button',{className:'button button-dark',textContent:'Cancel'});
 sheet.append(el('div',{className:'room-editor-head'},el('div',{},el('span',{className:'eyebrow',textContent:'SET THE MOOD'}),el('strong',{textContent:'Your room'})),el('div',{className:'room-editor-actions'},cancel,save)),tabs,mood,light,add);
 // Selection toolbar
 const tools=el('div',{className:'room-tools',hidden:true}),toolName=el('strong');
 const raise=el('button',{className:'chip',textContent:'⤒ Raise',onclick:()=>{edit.raise();}});
 const rotate=el('button',{className:'chip',textContent:'⟳ Rotate',onclick:()=>edit.rotate()});
 const textIn=el('input',{type:'text',className:'room-text',maxLength:TEXT_MAX,placeholder:'Text',hidden:true});textIn.setAttribute('aria-label','Text on the piece');
 let textTimer=0;textIn.oninput=()=>{clearTimeout(textTimer);textTimer=setTimeout(()=>edit.text(textIn.value),350);};
 tools.append(toolName,textIn,rotate,raise,el('button',{className:'chip chip-danger',textContent:'✕ Delete',onclick:()=>edit.remove()}),el('button',{className:'chip',textContent:'Done',onclick:()=>edit.deselect()}));
 const sync=r=>{for(const [k,row] of Object.entries(swatchRows))row.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===r.materials[k])));
  viewRow.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===r.window)));
  markLight(r);counter.textContent=`${r.furniture.length}/${LIMITS.max}`;};
 sync(room);first.click();
 const open=on=>{sheet.hidden=!on;editBtn.hidden=on;emotes.hidden=on;root.classList.toggle('room-editing',on);if(on){edit.start();bubble.textContent='Edit mode: drag furniture, pick materials, add pieces.';}else{edit.stop();tools.hidden=true;}};
 editBtn.onclick=()=>open(true);
 save.onclick=async()=>{save.disabled=true;try{await edit.save();open(false);bubble.textContent='Saved. Visitors see it now.';}catch(err){bubble.textContent=err.message||'Could not save.';}finally{save.disabled=false;}};
 cancel.onclick=async()=>{await edit.revert();open(false);bubble.textContent='Changes discarded.';};
 root.append(editBtn,sheet,tools);document.body.append(root);
 return {...api2,
  select(entry){tools.hidden=!entry;if(!entry)return;toolName.textContent=label(entry.item);
   const wall=WALL_ITEMS.has(entry.item)||HANGING.has(entry.item);rotate.disabled=raise.disabled=wall;raise.textContent=entry.y?'⤓ Lower':'⤒ Raise';
   textIn.hidden=!TEXT_ITEMS.has(entry.item);if(!textIn.hidden&&document.activeElement!==textIn)textIn.value=entry.text||'';},
  count(n){counter.textContent=`${n}/${LIMITS.max}`;},sync,
 };
}

// Guestbook: visitors leave a short note (1 per room per minute); the owner and each note's author may remove it.
function guestbookPanel({owner,mine,plotId,entries,visits,viewer,say}){
 let list=entries.slice();const base=`/api/rooms/${encodeURIComponent(plotId)}/guestbook`;
 const toggle=el('button',{className:'button button-dark room-gb-toggle'}),panel=el('aside',{className:'room-guestbook',hidden:true});panel.setAttribute('aria-label','Guestbook');
 const ul=el('ol',{className:'room-gb-list'}),status=el('p',{className:'room-gb-status'});status.setAttribute('role','status');
 const when=at=>{const d=(Date.now()-Number(at))/1000;return !Number.isFinite(d)?'':d<90?'just now':d<5400?`${Math.round(d/60)} min ago`:d<129600?`${Math.round(d/3600)} h ago`:`${Math.round(d/86400)} d ago`;};
 const myName=viewer?.resident?.name;
 function render(){toggle.textContent=`📖 Guestbook · ${list.length}`;
  ul.replaceChildren(...(list.length?list.map(g=>el('li',{},el('strong',{textContent:g.name||'Visitor'}),el('span',{textContent:g.text}),el('small',{textContent:when(g.at)}),
   mine||(myName&&g.name===myName)?el('button',{className:'room-gb-del',textContent:'✕',title:'Remove this note',onclick:()=>remove(g)}):null)):[el('li',{className:'room-gb-empty',textContent:mine?'No notes yet. Visitors can sign here.':`Be the first to sign ${owner.name}'s guestbook.`})]));}
 async function remove(g){try{await api(`${base}/${encodeURIComponent(g.id)}`,{method:'DELETE'});list=list.filter(x=>x!==g);render();}catch(err){status.textContent=err.message||'Could not remove the note.';}}
 const form=el('form',{className:'room-gb-form'}),input=el('input',{type:'text',maxLength:80,placeholder:`Say something nice to ${owner.name}`,required:true}),post=el('button',{className:'button button-orange',type:'submit',textContent:'Sign'});
 input.setAttribute('aria-label','Your note');form.append(input,post);
 form.onsubmit=async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;post.disabled=true;
  try{const r=await api(base,{method:'POST',body:{text}});if(r?.entry)list.unshift(r.entry);input.value='';status.textContent='Thanks! Your note is in.';say(`You signed ${owner.name}'s guestbook.`);render();}
  catch(err){const b=err.body||{};status.textContent=err.status===429?`Easy there: you can sign again in ${b.retryAfterS>90?Math.ceil(b.retryAfterS/60)+' min':(b.retryAfterS||60)+' s'}.`:
   err.status===401?'Sign in to sign the guestbook.':b.error==='no_resident'?'Create your resident first, then come back to sign.':b.error==='own_room'?'This is your own guestbook.':err.message||'Could not post the note.';}
  finally{post.disabled=false;}};
 panel.append(el('div',{className:'room-gb-head'},el('strong',{textContent:'Guestbook'}),el('small',{textContent:Number.isFinite(visits)?`${visits} visitor${visits===1?'':'s'} signed`:''})),ul,...(mine?[]:[form]),status);
 toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden&&!mine)input.focus({preventScroll:true});};
 render();return el('div',{className:'room-gb'+(mine?' room-gb-mine':'')},toggle,panel);
}
