import * as THREE from 'three';
import {toon,nightColor,night as nightShared} from './toon.js';
import * as CS from './city-state.js';
const {districts}=CS;
import {cityLayout,rng,CATEGORY,BASE_Y,GROUND} from './lots.js';
import {streetPlan,ROWS} from './city-street.js';
// Signs, shopfront dressing, street props and Fuji (art brief 3.4.5, 3.6, 3.7, 3.11; plan items 6 and 10).
// Everything hangs off lots.js: a lot's real front face (frontZ, facing '+z'|'-z'), its type, shop variant and roof
// frames, so nothing floats at a fixed offset. Pure planning (stylePlan, fujiMesh, ATLAS) is separate from the GPU side
// and tested in node. Three draw calls: one instanced prop box batch, one instanced sign-plane batch reading ONE
// 512² single-channel glyph atlas (colours per instance), and Fuji.

export const NEON_DISTRICTS=['shibuya','shinjuku','akihabara','roppongi','ikebukuro'];
const category=id=>CATEGORY[id]||'home';
const commercial=id=>['neon','office'].includes(category(id));
const underway=b=>['thinking','scaffold','stopped'].includes(b?.phase);
const between=(r,a,b)=>a+(b-a)*r();
const pickW=(r,table)=>{let x=r()*table.reduce((s,[,w])=>s+w,0);for(const [v,w] of table)if((x-=w)<0)return v;return table.at(-1)[0];};
const pick=(r,list)=>list[Math.floor(r()*list.length)];

// ---------- Atlas (brief 3.6): 8 × 8 cells of 64 px on one 512² R8 mask, glyph = 1, ground = 0 ----------
// Cells 0–27 square sign panels, 28 shutter grooves, 29 mailbox grid, 30 vending display, 31 menu board;
// rows 4–5 sixteen 128 × 32 fascia strips; rows 6–7 the hero (SUBZERONE / YOUR IDEA) and one generic billboard ad.
// Ground/ink colours come per instance, so every glyph tile can be light-, dark- or saturated-ground.
export const ATLAS={size:512,cell:64,panels:28,strips:16,special:{shutter:28,mailbox:29,vending:30,menu:31},hero:[0,384,256,128],ad:[256,384,256,128]};
export const panelRect=i=>[(i%8)*64,Math.floor(i/8)*64,64,64];
export const stripRect=i=>[(i%4)*128,256+Math.floor(i/4)*32,128,32];
// Panel layout (0 one big block, 1 two stacked, 2 a 2×2 grid, 3 framed); layout-1 panels crop to tall nobori cloths.
export const panelLayout=i=>Math.floor(rng('panel:'+i)()*4);
const NOBORI_TILES=Array.from({length:28},(_,i)=>i).filter(i=>panelLayout(i)===1);
// Ground/ink schemes; 70 % light, 20 % dark, 10 % saturated (by instance). Neon districts use neon inks on dark ground.
export const SCHEMES={
 light:[['#F3EEE1','#C8372D'],['#F3EEE1','#1F4E8C'],['#F3EEE1','#26262A'],['#FBFAF6','#C8372D'],['#FBFAF6','#1F4E8C'],['#FBFAF6','#26262A']],
 dark:[['#1E2430','#F3EEE1'],['#22303A','#F0B23E'],['#2A2233','#EDE3D0']],
 neon:[['#191E2A','#3FDDE6'],['#211A26','#FF4FA3'],['#1E1C22','#FF5A4A'],['#1C2230','#FFB547']],
 sat:[['#D2463C','#FBFAF6'],['#F0B23E','#26262A'],['#2F6FB5','#FBFAF6'],['#3E9B5C','#FBFAF6']]};
export const KIND_WEIGHTS=[['light',70],['dark',20],['sat',10]];
// Night emission (multiplies the sign colour): neon only in NEON_DISTRICTS on stacks and the hero; elsewhere backlit
// panels at ×0.4 warm white; vending displays cool white.
export const GLOW={neon:[1.15,1.15,1.15],backlit:[.4,.37,.31],dim:[.22,.2,.17],cool:[.85,.95,1.05],off:[0,0,0]};

// ---------- Plan ----------
// Door of a lot's shopfront, mirroring city.js drawLot: entrance/house/noren take the first draw of rng(lot.id+':draw').
export function doorOf(lot){
 const w=lot.width,first=()=>rng(lot.id+':draw')();
 if(lot.shop==='entrance'||lot.shop==='house'){const side=first()<.5?-1:1;return {u:side*Math.max(0,w/2-.65),half:.45,side};}
 if(lot.shop==='noren')return {u:(first()-.5)*(w-1.6),half:.5,side:0};
 if(lot.shop==='konbini')return {u:0,half:.7,side:0};
 if(lot.shop==='glazed'){const side=rng(lot.id+':door')()<.5?-1:1;return {u:w>=2.2?side*(w/2-.75):0,half:.48,side,drawn:true};}
 return null;
}
const SCRAMBLE={x:29,z:2,r:5};          // the Shibuya crossers' paths: no clutter here
const LANTERNS={x0:-41,x1:-17,z:[-1,5]}; // Roppongi lantern strings (city-life.js) at y 2.9–3.4

export function stylePlan(buildings=[]){
 const layout=cityLayout(buildings),plan=streetPlan(),poles=plan.poles;
 const signs=[],props=[],pools=[],counts={};let screen=null;
 let here=null;   // the district being dressed (null for the boulevards)
 const P=(o,detail=true)=>props.push({rx:0,ry:0,rz:0,detail,district:here,...o});
 const S=(o,detail=false)=>signs.push({rx:0,ry:0,detail,district:here,...o});
 const clearOfPoles=(x,z,hw,hd)=>!poles.some(p=>Math.abs(p.x-x)<hw+.3&&Math.abs(p.z-z)<hd+.3);
 const inScramble=(x,z)=>Math.hypot(x-SCRAMBLE.x,z-SCRAMBLE.z)<SCRAMBLE.r;
 const userOf=lot=>lot.user?buildings.find(b=>b.plotId===lot.plotId):null;
 // A sign: rect in atlas pixels, scheme colours, night glow. acc = midpoint (plain two-tone) unless given.
 const scheme=(r,neon)=>{const kind=pickW(r,KIND_WEIGHTS),list=kind==='dark'&&neon?SCHEMES.neon:SCHEMES[kind],[bg,ink]=pick(r,list);return {kind,bg,ink};};
 const sign=(o,rect,{bg,ink,acc=null},glow,detail)=>S({...o,rect,bg,ink,acc,glow},detail);
 // Lot-front frame: u along +x, v toward the street, y above BASE_Y.
 const front=lot=>{const fz=lot.front==='+z'?1:-1;return {fz,ry:fz>0?0:Math.PI,x:u=>lot.x+u,z:v=>lot.frontZ+fz*v};};
 // Local → world for small objects with a yaw (bikes, A-frames, mirrors).
 const place=(bx,bz,ry)=>(lx,lz)=>[bx+lx*Math.cos(ry)+lz*Math.sin(ry),bz-lx*Math.sin(ry)+lz*Math.cos(ry)];

 for(const d of districts){
  const cat=category(d.id),neon=NEON_DISTRICTS.includes(d.id),com=commercial(d.id),res=!com,r=rng(d.id+':dress');
  const lots=layout.lots.filter(l=>l.district===d.id),spots=layout.spots.filter(s=>s.district===d.id);
  let small=0;here=d.id;
  const live=[];
  for(const lot of lots){const b=userOf(lot);
   if(underway(b)){cones(lot);continue;}
   if(b?.phase==='review')continue;   // the orange review overlay covers the whole front
   live.push(lot);}
  // Per-lot clutter slots: [u0,u1] intervals already used along the front.
  const used=new Map(),free=(lot,u0,u1)=>!(used.get(lot.id)||[]).some(([a,b])=>u1>a-.05&&u0<b+.05),take=(lot,u0,u1)=>{used.set(lot.id,[...(used.get(lot.id)||[]),[u0,u1]]);};
  const door=new Map(live.map(l=>[l.id,doorOf(l)]));
  for(const [id,dr] of door)if(dr)take(live.find(l=>l.id===id),dr.u-dr.half-.05,dr.u+dr.half+.05);
  // Building boxes of this district: a row of leaning bikes must not reach into a neighbour's facade.
  const boxes=lots.map(l=>{const z1=l.frontZ-(l.front==='+z'?1:-1)*l.depth;return [l.x-l.width/2,l.x+l.width/2,Math.min(l.frontZ,z1),Math.max(l.frontZ,z1),l.height];});
  const clips=list=>list.some(p=>{const c=Math.abs(Math.cos(p.ry)),sn=Math.abs(Math.sin(p.ry)),hw=(p.w*c+p.d*sn)/2,hd=(p.w*sn+p.d*c)/2;
   return boxes.some(([x0,x1,z0,z1])=>Math.min(p.x+hw,x1)-Math.max(p.x-hw,x0)>.01&&Math.min(p.z+hd,z1)-Math.max(p.z-hd,z0)>.01);});

  // --- Hero: one per neon district (brief 3.6). Shibuya keeps its big screen (city-life.js), re-placed on the roof of
  // its widest far-row lot; elsewhere a lots.js billboard frame, else a wall billboard on the tallest far-row T1/T7.
  const frames=live.filter(l=>l.roofItems.some(i=>i.kind==='billboard'));
  let heroLot=null,heroFrame=null;
  if(d.id==='shibuya'){
   const c=live.filter(l=>l.role==='sub'&&!l.user&&l.front==='+z'&&l.width>=3.5&&l.type!=='T5'&&!frames.includes(l)).sort((a,b)=>b.width-a.width||b.height-a.height)[0];
   if(c){const f=front(c),sw=Math.min(6.3,c.width-.2),sh=sw/2,yb=c.height+1.8;   // bottom 1.8 above the parapet, over tanks and condensers
    screen={x:c.x,y:BASE_Y+yb+sh/2,z:f.z(-.3),w:sw,h:sh,ry:f.ry,lot:c.id};heroLot=c;
    P({x:c.x,y:BASE_Y+yb+sh/2,z:f.z(-.38),w:sw+.2,h:sh+.2,d:.12,color:'#2B3034',role:'hero'},false);
    for(const s of [-1,1])P({x:c.x+s*(sw/2-.5),y:BASE_Y+c.height+.9,z:f.z(-.4),w:.14,h:1.8,d:.14,color:'#5B6264',role:'hero'},false);}
  }else if(neon){
   heroFrame=frames.slice().sort((a,b)=>(b.front==='+z')-(a.front==='+z')||a.id.localeCompare(b.id))[0]||null;
   // No frame: a rooftop billboard on legs at the front edge of the district's tallest far-row building.
   const c=heroFrame?null:live.filter(l=>l.front==='+z'&&l.type!=='T5'&&l.floors>=3&&l.width>=2.4&&!l.user).sort((a,b)=>b.height-a.height||b.width-a.width)[0];
   if(c){const f=front(c),bw=Math.min(5,c.width-.3),bh=bw/1.7,yb=c.height+1.8,y=BASE_Y+yb+bh/2;heroLot=c;
    P({x:c.x,y,z:f.z(-.38),w:bw+.16,h:bh+.16,d:.12,color:'#2B3034',role:'hero'},false);
    for(const s of [-1,1])P({x:c.x+s*(bw/2-.35),y:BASE_Y+c.height+.9,z:f.z(-.4),w:.12,h:1.8,d:.12,color:'#5B6264',role:'hero'},false);
    sign({x:c.x,y,z:f.z(-.315),w:bw,h:bh,ry:f.ry,role:'hero',district:d.id,lot:c.id},ATLAS.hero,{bg:'#13202E',ink:'#F4F1EA',acc:'#FB752B'},GLOW.neon);}
  }
  for(const lot of frames){const it=lot.roofItems.find(i=>i.kind==='billboard'),f=front(lot),hero=lot===heroFrame;
   const x=lot.x+it.u,z=lot.z+f.fz*it.v+f.fz*.085,y=BASE_Y+lot.height+.1+it.h-.1;
   sign({x,y,z,w:it.w-.25,h:1.9,ry:f.ry,role:hero?'hero':'billboard',district:d.id},hero?ATLAS.hero:ATLAS.ad,
    hero?{bg:'#13202E',ink:'#F4F1EA',acc:'#FB752B'}:{bg:'#F3EEE1',ink:pick(r,['#C8372D','#1F4E8C','#26262A'])},hero?GLOW.neon:GLOW.backlit);
   if(hero)heroLot=lot;}

  // --- Zakkyo vertical stacks: T1 only, commercial districts only, 4–8 per district (brief 3.6).
  if(com){const cand=live.filter(l=>l.type==='T1'&&l.floors>=2&&l!==heroLot).map(l=>({l,k:rng(l.id+':stack')()})).sort((a,b)=>a.k-b.k).map(o=>o.l).slice(0,neon?8:5);
   for(const lot of cand){
    const rs=rng(lot.id+':stack'),f=front(lot),side=lot.leftH<lot.rightH?-1:lot.rightH<lot.leftH?1:rs()<.5?-1:1;
    const x=lot.x+side*(lot.width/2-.15),y0=GROUND+.1,n=Math.max(1,Math.floor((lot.height-y0+.08)/.78)),top=y0+n*.78-.08;
    P({x,y:BASE_Y+(y0+top)/2,z:f.z(.1),w:.08,h:top-y0+.06,d:.08,color:rs()<.5?'#3B4144':'#E4DED0',role:'stack'},false);
    P({x,y:BASE_Y+top+.04,z:f.z(.42),w:.06,h:.06,d:.66,color:'#3B4144',role:'stack'},false);

    let prev=-1;
    for(let i=0;i<n;i++){let t=Math.floor(rs()*ATLAS.panels);if(t===prev)t=(t+1+Math.floor(rs()*5))%ATLAS.panels;prev=t;
     const sc=scheme(rs,neon),yc=BASE_Y+y0+.35+i*.78;
     sign({x,y:yc,z:f.z(.42),w:.6,h:.7,ry:Math.PI/2,role:'stack',district:d.id},panelRect(t),sc,neon?GLOW.neon:GLOW.backlit);}   // double-sided
    take(lot,side*(lot.width/2)-.3,side*(lot.width/2)+.3);
   }}

  // --- Fascias over every shop (and the shopfront dressing that goes with each variant).
  for(const lot of live){
   const f=front(lot),w=lot.width,dr=door.get(lot.id),t=lot.type,rl=rng(lot.id+':front');
   const shopSign=['glazed','shutter','noren'].includes(lot.shop)&&!['T5','T7'].includes(t)&&!(t==='T2'&&lot.bays[0]?.[0]?.balcony&&w>=1.85);
   if(shopSign){
    let y0=Math.min(3.15,Math.max(GROUND,lot.awning?lot.awning.y+.2:0,t==='T4'?3.08:0)),v=t==='T3'?.96:.09;
    const zf=f.z(v);if(d.id==='roppongi'&&lot.x>LANTERNS.x0&&lot.x<LANTERNS.x1&&LANTERNS.z.some(z=>Math.abs(z-zf)<.5)){y0=2.2;v=.09;}
    P({x:lot.x,y:BASE_Y+y0+.25,z:f.z(v-.04),w:w-.16,h:.54,d:.08,color:'#3B4144',role:'fascia'},false);
    const n=Math.max(1,Math.round((w-.2)/2)),sw=(w-.2)/n;let prev=-1;
    for(let i=0;i<n;i++){let s=Math.floor(rl()*ATLAS.strips);if(s===prev)s=(s+1)%ATLAS.strips;prev=s;
     sign({x:lot.x-(w-.2)/2+sw*(i+.5),y:BASE_Y+y0+.25,z:f.z(v+.005),w:sw-.05,h:.46,ry:f.ry,role:'fascia',district:d.id},stripRect(s),scheme(rl,false),GLOW.backlit);}
   }
   if(lot.shop==='glazed'&&dr?.drawn)P({x:lot.x+dr.u,y:BASE_Y+1.05,z:f.z(.06),w:.96,h:2.1,d:.03,color:'#2A3236',role:'door'});
   if(lot.shop==='shutter')sign({x:lot.x,y:BASE_Y+1.3,z:f.z(.066),w:w-.5,h:2.5,ry:f.ry,role:'shutter'},panelRect(ATLAS.special.shutter),{bg:'#9EA3A2',ink:'#767C7B'},GLOW.off,true);
   if(lot.shop==='entrance'&&w-1.4>=.6&&dr){const mu=-dr.u*.2-dr.side*.4,mw=Math.min(1.2,w-1.4);
    sign({x:lot.x+mu,y:BASE_Y+1.0,z:f.z(.065),w:mw-.08,h:1.0,ry:f.ry,role:'mailbox'},panelRect(ATLAS.special.mailbox),{bg:'#8E9290',ink:'#4F5456'},GLOW.off,true);}
  }

  // --- Vending clusters (pairs/trios against walls), 2–3 per district counting lots.js vending gaps (drawn by city.js).
  const vendingSpots=spots.filter(s=>s.kind==='vending').length;let clusters=Math.max(0,(2+(r()<.5?1:0))-vendingSpots);
  // n machines in a row from (x,z) stepping along `along`; `face` = the unit vector their fronts look along.
  const machine=(x,z,n,face,along)=>{const colors=[],sx=Math.abs(face[0])>.5;
   for(let i=0;i<n;i++){let c=pick(r,['#EDEDE8','#EDEDE8','#C63B34','#2E6FB0']);if(c===colors[i-1]&&r()<.7)c=c==='#EDEDE8'?'#C63B34':'#EDEDE8';colors.push(c);}
   colors.forEach((c,i)=>{const cx=x+along[0]*i*.95,cz=z+along[1]*i*.95;
    P({x:cx,y:BASE_Y+.875,z:cz,w:sx?.65:.9,h:1.75,d:sx?.9:.65,color:c,role:'vending'},false);
    P({x:cx+face[0]*.33,y:BASE_Y+1.66,z:cz+face[1]*.33,w:sx?.02:.84,h:.12,d:sx?.84:.02,color:c==='#EDEDE8'?'#2E6FB0':'#EDEDE8'});
    sign({x:cx+face[0]*.334,y:BASE_Y+1.22,z:cz+face[1]*.334,w:.74,h:.36,ry:Math.atan2(face[0],face[1]),role:'vending'},panelRect(ATLAS.special.vending),{bg:'#DCE7EC',ink:pick(r,['#C9473D','#2F6FB5','#3E9B5C'])},GLOW.cool,true);});
   {const bx=x+along[0]*(n-.38),bz=z+along[1]*(n-.38);const bin={x:bx-face[0]*.1,y:BASE_Y+.4,z:bz-face[1]*.1,w:.38,h:.8,d:.38,ry:0,color:'#7D8B8E',role:'bin'};if(clearOfPoles(bx,bz,.25,.25)&&!clips([bin])){P(bin);small++;}}
   const mx=x+along[0]*(n-1)*.475,mz=z+along[1]*(n-1)*.475;pools.push([mx+face[0]*.9,mz+face[1]*.9,'#EAF4FF',1.3+n*.15,.45]);small+=n;};
  // Against the side wall of a parking spot / coin parking, fronts toward the spot, the row running to its back.
  const sideSpots=spots.filter(s=>(s.kind==='parking'||s.kind==='coin-parking')&&!s.id.includes('interior')).map(s=>({s,k:rng(s.id+':vend')()})).sort((a,b)=>a.k-b.k).map(o=>o.s);
  for(const s of sideSpots){if(!clusters)break;const fz=s.front==='+z'?1:-1,rs=rng(s.id+':vend');
   for(const side of rs()<.5?[-1,1]:[1,-1]){
    const bay=side<0?0:(s.bays||1)-1;if(s.kind==='coin-parking'&&s.cars.includes(bay))continue;
    const n=s.kind==='parking'?2:2+(rs()<.4?1:0),wx=s.x+side*(s.width/2-.345),z0=s.frontZ-fz*(s.kind==='parking'?.6:.95);
    if(inScramble(wx,z0)||!Array.from({length:n},(_,i)=>clearOfPoles(wx,z0-fz*i*.95,.33,.45)).every(Boolean))continue;
    machine(wx,z0,n,[-side,0],[0,-fz]);clusters--;break;}
  }
  // In front of a facade at one end (closed shutters first), fronts to the street.
  const shutters=live.filter(l=>l.width>=2.3&&!['konbini','house'].includes(l.shop)&&l.role!=='interior').map(l=>({l,k:rng(l.id+':vend')()-(l.shop==='shutter'?1:0)})).sort((a,b)=>a.k-b.k).map(o=>o.l);
  for(const lot of shutters){if(!clusters)break;const f=front(lot),rs=rng(lot.id+':vend'),n=lot.width>=3.4&&rs()<.5?3:2,side=rs()<.5?-1:1;
   const u0=side*(lot.width/2-.55),u1=u0-side*(n-1)*.95,lo=Math.min(u0,u1)-.45,hi=Math.max(u0,u1)+.45;
   if(!free(lot,lo,hi)||inScramble(f.x(u0),f.z(.34))||!Array.from({length:n},(_,i)=>clearOfPoles(f.x(u0-side*i*.95),f.z(.34),.45,.33)).every(Boolean))continue;
   machine(f.x(u0),f.z(.34),n,[0,f.fz],[-side,0]);take(lot,lo,hi);clusters--;}

  // --- Bikes: the konbini (4, beside the doors, away from the bins) and mansion entrances/pilotis; 2 rows a district.
  const bike=(bx,bz,ry,color)=>{const at=place(bx,bz,ry);
   for(const lz of [.28,1.1]){const [x,z]=at(0,lz);P({x,y:BASE_Y+.3,z,w:.04,h:.56,d:.56,ry,color:'#2B2B2B',role:'bike'});}
   {const [x,z]=at(0,.72);P({x,y:BASE_Y+.62,z,w:.06,h:.2,d:.9,ry,color,role:'bike'});}
   small++;};
  const bikeRow=(lot,u0,dirU,n)=>{const f=front(lot),rb=rng(lot.id+':bikes'),steep=lot.setback<.5,lean=rb()<.5?-1:1,start=props.length,small0=small;
   for(const sgn of [lean,-lean]){const a=(steep?1.08:.12)*sgn,rj=rng(lot.id+':bikes:'+sgn);
    for(let i=0;i<n;i++){const u=u0+dirU*i*.45+(rj()-.5)*.06,ry=f.ry+a+(rj()-.5)*.12;bike(f.x(u),f.z(.06+(steep?.12:0)),ry,pick(rj,['#C9CCC6','#2F3437','#B33A32','#3E6A8A','#E8E6E0','#8FA66B','#C9CCC6']));}
    if(!clips(props.slice(start))){take(lot,Math.min(u0,u0+dirU*(n-1)*.45)-.25,Math.max(u0,u0+dirU*(n-1)*.45)+.25);return true;}
    props.length=start;small=small0;}
   return false;};
  let rows=0;const maxRows=3;
  for(const lot of live.filter(l=>l.shop==='konbini')){const f=front(lot),u0=-lot.width/2+.35;
   if(Array.from({length:4},(_,i)=>clearOfPoles(f.x(u0+i*.45),f.z(.5),.3,.5)).every(Boolean)&&!inScramble(f.x(u0),f.z(.5))){if(bikeRow(lot,u0,1,4))rows++;}}
  // Then mansion/apartment entrances (away from the door) and closed shutters, mansions first.
  const bikeLots=live.filter(l=>(l.shop==='entrance'||l.shop==='shutter')&&l.width>=1.8).map(l=>({l,k:rng(l.id+':bikes')()-(l.type==='T3'?1:0)})).sort((a,b)=>a.k-b.k).map(o=>o.l);
  for(const lot of bikeLots){if(rows>=maxRows)break;const dr=door.get(lot.id),f=front(lot);
   const dir=dr?dr.side:rng(lot.id+':bside')()<.5?-1:1,u0=-dir*(lot.width/2-.3),limit=dr?dr.u-dir*(dr.half+.3):dir*(lot.width/2-.3);
   const n=Math.min(6,Math.floor(Math.abs(limit-u0)/.45)+1);if(n<3)continue;
   const lo=Math.min(u0,u0+dir*(n-1)*.45)-.25,hi=Math.max(u0,u0+dir*(n-1)*.45)+.25;
   if(!free(lot,lo,hi)||!Array.from({length:n},(_,i)=>clearOfPoles(f.x(u0+dir*i*.45),f.z(.6),.3,.7)).every(Boolean)||inScramble(f.x(u0),f.z(.6)))continue;
   if(bikeRow(lot,u0,dir,n))rows++;}

  // --- A-frame boards by shop doors (2–4 per district) and crates/bins by izakaya doors (commercial).
  const shops=live.filter(l=>['glazed','noren'].includes(l.shop)&&door.get(l.id)).map(l=>({l,k:rng(l.id+':aframe')()})).sort((a,b)=>a.k-b.k).map(o=>o.l);
  let aframes=2+Math.floor(r()*3);
  for(const lot of shops){if(!aframes)break;const f=front(lot),dr=door.get(lot.id),ra=rng(lot.id+':aframe'),s0=ra()<.5?-1:1,off=dr.half+.4+ra()*.35;
   const s=[s0,-s0].find(s=>Math.abs(dr.u+s*off)<=lot.width/2-.25&&free(lot,dr.u+s*off-.3,dr.u+s*off+.3));if(!s)continue;
   const u=dr.u+s*off,v=.48+ra()*.12;
   const x=f.x(u),z=f.z(v);if(!clearOfPoles(x,z,.3,.3)||inScramble(x,z))continue;
   const base=f.ry+(ra()-.5)*.5,a=.2,sc=ra()<.5?{bg:'#2E3A33',ink:'#EDE6D2'}:scheme(ra,false),tile=ra()<.5?ATLAS.special.menu:Math.floor(ra()*ATLAS.panels);
   for(const phi of [base,base+Math.PI]){const off=Math.sin(a)*.42,nx=Math.sin(phi),nz=Math.cos(phi);
    P({x:x+nx*off,y:BASE_Y+.41,z:z+nz*off,w:.5,h:.84,d:.03,rx:-a,ry:phi,color:'#3B3330',role:'aframe'});
    sign({x:x+nx*(off+.02*Math.cos(a)),y:BASE_Y+.42+.02*Math.sin(a),z:z+nz*(off+.02*Math.cos(a)),w:.42,h:.68,rx:-a,ry:phi,role:'aframe'},panelRect(tile),sc,GLOW.dim,true);}
   take(lot,u-.3,u+.3);aframes--;small++;}
  let crates=com?3+Math.floor(r()*3):1+Math.floor(r()*2);
  for(const lot of shops.slice().reverse()){if(!crates)break;const f=front(lot),dr=door.get(lot.id),rc=rng(lot.id+':crates'),s0=rc()<.5?-1:1,off=dr.half+.3+rc()*.2,bin=rc()<.5;
   const span=s=>{const u=dr.u+s*off,e=u+s*(bin?.7:.25);return [Math.min(u-s*.25,e),Math.max(u-s*.25,e)];};
   const s=[s0,-s0].find(s=>{const [lo,hi]=span(s);return lo>=-lot.width/2+.05&&hi<=lot.width/2-.05&&free(lot,lo,hi);});if(!s)continue;
   const u=dr.u+s*off,x=f.x(u),z=f.z(.24);if(!clearOfPoles(x,z,.5,.3)||inScramble(x,z))continue;
   const color=pick(rc,['#E3BE3C','#C63B34','#2E6FB0','#E3BE3C']),k=1+Math.floor(rc()*3);
   for(let i=0;i<k;i++)P({x:x+(rc()-.5)*.05,y:BASE_Y+.15+i*.29,z:z+(rc()-.5)*.05,w:.42,h:.28,d:.32,ry:(rc()-.5)*.3,color,role:'crate'});
   if(bin)P({x:f.x(u+s*.48),y:BASE_Y+.35,z:f.z(.22),w:.38,h:.7,d:.38,ry:(rc()-.5)*.4,color:pick(rc,['#5E7A93','#3E7A5C','#8E9290']),role:'bin'});
   take(lot,...span(s));crates--;small+=k+(bin?1:0);}

  // --- Nobori banners by shop doors (commercial and old shopping streets): a pole and a tall saturated cloth.
  let nobori=cat==='home'?0:2+Math.floor(r()*3);
  for(const lot of shops){if(!nobori||!NOBORI_TILES.length)break;const f=front(lot),dr=door.get(lot.id),rn=rng(lot.id+':nobori'),s0=rn()<.5?-1:1,off=dr.half+.25+rn()*.3;
   const s=[s0,-s0].find(s=>Math.abs(dr.u+s*off)<=lot.width/2-.2&&free(lot,dr.u+s*off-.25,dr.u+s*off+.25));if(!s)continue;
   const u=dr.u+s*off,x=f.x(u),z=f.z(.62+rn()*.1);if(!clearOfPoles(x,z,.3,.3)||inScramble(x,z))continue;
   const sc=rn()<.6?{bg:pick(rn,['#D2463C','#2F6FB5','#3E9B5C','#F0B23E','#D2463C']),ink:'#FBFAF6'}:scheme(rn,false),ry=f.ry+(rn()-.5)*.4,ox=Math.cos(ry)*.2*s,oz=-Math.sin(ry)*.2*s;
   P({x,y:BASE_Y+1.1,z,w:.04,h:2.2,d:.04,color:'#B9B6AE',role:'nobori'});P({x:x+ox,y:BASE_Y+2.13,z:z+oz,w:.42,h:.03,d:.03,ry,color:'#B9B6AE',role:'nobori'});
   const tiles=[pick(rn,NOBORI_TILES),pick(rn,NOBORI_TILES)];   // two cloth halves, each a tall crop of a two-glyph panel
   tiles.forEach((t,k)=>{const [tx,ty]=panelRect(t);sign({x:x+ox,y:BASE_Y+(k?1.1:1.77),z:z+oz,w:.36,h:.66,ry,role:'nobori'},[tx+13,ty,36,64],sc,GLOW.off,true);});
   take(lot,u-.25,u+.25);nobori--;small++;}

  // --- Planters hugging house fronts (residential mainly): 6–10 clusters, commercial 2–3.
  const homes=live.filter(l=>['house','entrance','noren'].includes(l.shop)||l.type==='T5'||l.role==='interior').map(l=>({l,k:rng(l.id+':pots')()})).sort((a,b)=>a.k-b.k).map(o=>o.l);
  let planters=res?6+Math.floor(r()*5):3+Math.floor(r()*3);
  for(const lot of homes){if(!planters)break;const f=front(lot),dr=door.get(lot.id),rp=rng(lot.id+':pots'),n=3+Math.floor(rp()*5);
   const s=dr?.side?-dr.side:rp()<.5?-1:1,start=dr?dr.u+s*(dr.half+.12):-s*(lot.width/2-.1);
   let u=start;const out=[];
   for(let i=0;i<n;i++){const rad=.15+rp()*.15,uu=u+s*rad;if(Math.abs(uu)+rad>lot.width/2-.05)break;out.push([uu,rad]);u=uu+s*(rad+.03+rp()*.05);}
   if(out.length<3)continue;const lo=Math.min(...out.map(([a,b])=>a-b)),hi=Math.max(...out.map(([a,b])=>a+b));if(!free(lot,lo,hi))continue;
   const vb=lot.type==='T5'?.32:.22;if(!out.every(([uu])=>clearOfPoles(f.x(uu),f.z(vb),.3,.3)&&clearOfPoles(f.x(uu),f.z(vb+.25),.3,.3)))continue;
   for(const [uu,rad] of out){const v=Math.max(vb+(rp()-.5)*.1,rad*1.7+.03),h=.28+rp()*.2,x=f.x(uu),z=f.z(v),spin=rp()*.8;
    P({x,y:BASE_Y+h/2,z,w:rad*2,h,d:rad*2,ry:spin,color:pick(rp,['#B5674A','#8E9290','#4F6F8F','#E9E6DD','#B5674A']),role:'pot'});
    const ph=.22+rp()*.4;P({x,y:BASE_Y+h+ph/2-.04,z,w:rad*2.3,h:ph,d:rad*2.3,ry:spin+Math.PI/4,color:pick(rp,['#6F8F5E','#8FA66B','#5F7F50']),role:'plant'});}
   take(lot,lo,hi);planters--;small+=out.length;}

  // A pot or two beside shop doors (every district; clutter lives within a tile of the door).
  for(const lot of shops.concat(live.filter(l=>l.shop==='entrance'))){const f=front(lot),dr=door.get(lot.id),rp=rng(lot.id+':doorpot');if(rp()<.35)continue;
   for(const s of rp()<.5?[-1,1]:[1,-1]){const rad=.13+rp()*.1,u=dr.u+s*(dr.half+.08+rad);if(Math.abs(u)+rad>lot.width/2-.05||!free(lot,u-rad,u+rad))continue;
    const x=f.x(u),z=f.z(Math.max(.2+rp()*.06,rad*1.75+.03));if(!clearOfPoles(x,z,.3,.3)||inScramble(x,z))continue;const h=.3+rp()*.25,ph=.3+rp()*.5,spin=rp();
    P({x,y:BASE_Y+h/2,z,w:rad*2,h,d:rad*2,ry:spin,color:pick(rp,['#B5674A','#8E9290','#E9E6DD','#4F6F8F']),role:'pot'});P({x,y:BASE_Y+h+ph/2-.04,z,w:rad*2.4,h:ph,d:rad*2.4,ry:spin+Math.PI/4,color:pick(rp,['#6F8F5E','#8FA66B','#5F7F50']),role:'plant'});
    take(lot,u-rad,u+rad);small++;if(rp()<.6)break;}}

  // --- Traffic mirrors: 2 per district at alley mouths, else at the open end of a street wall.
  const corners=[];
  for(const s of spots.filter(s=>s.kind==='alley'&&s.plotId!==undefined)){const fz=s.front==='+z'?1:-1,side=rng(s.id+':mirror')()<.5?-1:1;corners.push({x:s.x+side*(s.width/2-.12),z:s.frontZ+fz*.35,ry:(fz>0?0:Math.PI)+side*Math.PI/4,k:rng(s.id+':m')()});}
  for(const side of layout.sides.filter(s=>s.district===d.id))for(const [lot,dir] of [[side.sequence[0],-1],[side.sequence.at(-1),1]]){if(!lot)continue;const f=front(lot);
   corners.push({x:lot.x+dir*(lot.width/2+.25),z:f.z(.35),ry:f.ry+dir*Math.PI/4,k:1+rng(lot.id+':m')()});}
  let mirrors=2;
  for(const c of corners.sort((a,b)=>a.k-b.k)){if(!mirrors)break;if(!clearOfPoles(c.x,c.z,.2,.2)||inScramble(c.x,c.z))continue;
   P({x:c.x,y:BASE_Y+1.4,z:c.z,w:.07,h:2.8,d:.07,color:'#E2733A',role:'mirror'});
   const fx=Math.sin(c.ry),fzz=Math.cos(c.ry);
   for(const roll of [0,Math.PI/4])P({x:c.x+fx*.06,y:BASE_Y+2.55,z:c.z+fzz*.06,w:.7,h:.7,d:.05,rz:roll,ry:c.ry,color:'#E2733A',role:'mirror'});
   P({x:c.x+fx*.09,y:BASE_Y+2.55,z:c.z+fzz*.09,w:.56,h:.56,d:.02,rz:Math.PI/8,ry:c.ry,color:'#DCE6EA',role:'mirror'});
   mirrors--;small++;}
  // Fill: small planter groups against free stretches of facade until the district has 40–60 small props (brief 3.8).
  const want=38+Math.floor(r()*14);
  for(const lot of live.map(l=>({l,k:rng(l.id+':fill')()})).sort((a,b)=>a.k-b.k).map(o=>o.l)){if(small>=want)break;
   const f=front(lot),rp=rng(lot.id+':fill'),n=2+Math.floor(rp()*3),s=rp()<.5?-1:1,vb=lot.type==='T5'?.32:lot.type==='T3'?.25:.2;
   let u=s*(lot.width/2-.08);const out=[];
   for(let i=0;i<n;i++){const rad=.12+rp()*.12,uu=u-s*rad;out.push([uu,rad]);u=uu-s*(rad+.04+rp()*.06);}
   const lo=Math.min(...out.map(([a,b])=>a-b)),hi=Math.max(...out.map(([a,b])=>a+b));
   if(!free(lot,lo,hi)||!out.every(([uu])=>clearOfPoles(f.x(uu),f.z(vb),.3,.3)&&clearOfPoles(f.x(uu),f.z(vb+.25),.3,.3)&&!inScramble(f.x(uu),f.z(vb))))continue;
   for(const [uu,rad] of out){const h=.26+rp()*.22,ph=.2+rp()*.45,x=f.x(uu),z=f.z(Math.max(vb+(rp()-.5)*.08,rad*1.7+.03)),spin=rp();
    P({x,y:BASE_Y+h/2,z,w:rad*2,h,d:rad*2,ry:spin,color:pick(rp,['#B5674A','#8E9290','#4F6F8F','#E9E6DD','#9A7A60']),role:'pot'});
    P({x,y:BASE_Y+h+ph/2-.04,z,w:rad*2.3,h:ph,d:rad*2.3,ry:spin+Math.PI/4,color:pick(rp,['#6F8F5E','#8FA66B','#5F7F50']),role:'plant'});}
   take(lot,lo,hi);small+=out.length;}
  counts[d.id]=small;

  // Construction plots: cones and a barrier at the front (brief 3.7: only here).
  function cones(lot){const f=front(lot),rc=rng(lot.id+':cones'),n=3+Math.floor(rc()*2);
   for(let i=0;i<n;i++){const u=-lot.width/2+.4+(lot.width-.8)*(i/(n-1))+(rc()-.5)*.2,x=f.x(u),z=f.z(.75+(rc()-.5)*.15);
    P({x,y:BASE_Y+.02,z,w:.36,h:.04,d:.36,ry:rc(),color:'#9E2F28',role:'cone'});P({x,y:BASE_Y+.25,z,w:.2,h:.42,d:.2,ry:Math.PI/4,color:'#D2463C',role:'cone'});P({x,y:BASE_Y+.3,z,w:.22,h:.08,d:.22,ry:Math.PI/4,color:'#F4F1EA',role:'cone'});}
   const x=f.x((rc()-.5)*.6),z=f.z(.5);
   P({x,y:BASE_Y+.7,z,w:1.2,h:.11,d:.05,color:'#E3BE3C',role:'barrier'});for(const s of [-.3,.3])P({x:x+s,y:BASE_Y+.7,z:z+f.fz*.003,w:.15,h:.112,d:.055,color:'#2B2B2B',role:'barrier'});
   for(const s of [-.55,.55])P({x:x+s,y:BASE_Y+.35,z,w:.05,h:.7,d:.3,color:'#E3BE3C',role:'barrier'});small+=n+1;}
 }

 here=null;
 // ---------- Boulevards: bus stops (lamp side); the street trees on the pole side live in city-green.js ----------
 const blvd=[...new Set(poles.filter(p=>p.axis==='z').map(p=>p.c))];
 const central=(x,z)=>Math.abs(x)<14.2&&z>-11&&z<15;
 for(const bx of blvd){const side=Math.sign(poles.find(p=>p.axis==='z'&&p.c===bx).x-bx),stops=[];
  for(const zc of [-43,-13,17,47]){const rb=rng(`${bx}:${zc}:bus`);if(rb()<.5)continue;const z=zc+(rb()-.5)*5,x=bx-side*2.15;
   if(central(x,z)||Math.hypot(x-SCRAMBLE.x,z-SCRAMBLE.z)<7.5)continue;stops.push(z);
   const out=-side,ry=out*Math.PI/2;   // the bench faces the road (toward bx)
   P({x:x-out*.1,y:BASE_Y+.45,z,w:.35,h:.06,d:1.2,color:'#9A7A60',role:'bus'},false);for(const s of [-.5,.5])P({x:x-out*.1,y:BASE_Y+.22,z:z+s,w:.3,h:.44,d:.06,color:'#5B6466',role:'bus'});
   P({x:x+side*.45,y:BASE_Y+1.1,z:z+.9,w:.08,h:2.2,d:.08,color:'#D9D6CC',role:'bus'},false);
   for(const roll of [0,Math.PI/4])P({x:x+side*.45,y:BASE_Y+2.25,z:z+.9,w:.6,h:.6,d:.04,rz:roll,ry,color:'#F4F1EA',role:'bus'},false);
   P({x:x+side*.45+side*.025,y:BASE_Y+2.25,z:z+.9,w:.42,h:.42,d:.02,rz:Math.PI/8,ry,color:'#3E9B5C',role:'bus'},false);
   if(rb()<.6){P({x:x-out*.25,y:BASE_Y+2.35,z,w:1.0,h:.06,d:2.0,color:'#C9CCC6',role:'bus'},false);for(const s of [-.9,.9])P({x:x-out*.68,y:BASE_Y+1.17,z:z+s,w:.06,h:2.34,d:.06,color:'#7E8789',role:'bus'},false);
    P({x:x-out*.68,y:BASE_Y+1.2,z,w:.03,h:1.5,d:1.8,color:'#9FB6BF',role:'bus'},false);}}
  // Street trees moved to city-green.js (wave 4B): instanced zelkova/ginkgo with sway, one draw call per species.
 }

 // ---------- The Shibuya scramble: two diagonal zebras (bars 0.45, gaps 0.45) inside the road only ----------
 {const zr=[SCRAMBLE.z-2.25+.3,SCRAMBLE.z+2.25-.3];
  for(const sz of [1,-1]){const d=[Math.SQRT1_2,sz*Math.SQRT1_2],n=[sz*Math.SQRT1_2,-Math.SQRT1_2];
   for(let k=0;k<4;k++){const o=(k-1.5)*.9,cx=SCRAMBLE.x+n[0]*o,cz=SCRAMBLE.z+n[1]*o;
    const t0=(zr[0]-cz)/d[1],t1=(zr[1]-cz)/d[1],ta=Math.min(t0,t1),tb=Math.max(t0,t1);
    // The straight zebra (city.js) owns |x − 29| < 1.75: the diagonals are four arms around it, not a white blot.
    const cut=(1.75+.2)/d[0],tc=(SCRAMBLE.x-cx)/d[0];
    for(const [a,b] of [[ta,Math.min(tb,tc-Math.abs(cut))],[Math.max(ta,tc+Math.abs(cut)),tb]])if(b-a>.4){const tm=(a+b)/2;
     P({x:cx+d[0]*tm,y:.203,z:cz+d[1]*tm,w:.45,h:.01,d:b-a,ry:Math.atan2(d[0],d[1]),color:'#ECEAE2',role:'zebra'},false);}}}}
 // Last guard (7×7 layouts with gap fillers set back differently): no pot or plant may sit inside a building footprint.
 const foot=layout.lots.map(l=>{const z1=l.frontZ-(l.front==='+z'?1:-1)*l.depth;return [l.x-l.width/2,l.x+l.width/2,Math.min(l.frontZ,z1),Math.max(l.frontZ,z1)];});
 const clips=p=>{const c=Math.abs(Math.cos(p.ry||0)),sn=Math.abs(Math.sin(p.ry||0)),hw=(p.w*c+p.d*sn)/2,hd=(p.w*sn+p.d*c)/2;
  return foot.some(([x0,x1,z0,z1])=>Math.min(p.x+hw,x1)-Math.max(p.x-hw,x0)>.02&&Math.min(p.z+hd,z1)-Math.max(p.z-hd,z0)>.02);};
 const kept=props.filter((p,i)=>!(p.role==='pot'&&(clips(p)||(props[i+1]?.role==='plant'&&clips(props[i+1])))||(p.role==='plant'&&props[i-1]?.role==='pot'&&(clips(p)||clips(props[i-1])))));
 return {signs,props:kept,pools,screen,counts};
}

// ---------- Fuji (wave 4B; brief 3.11, refs real-21, real-20) ----------
// Seen from Tokyo, Fuji sits low on the horizon and is WIDE: a concave profile from ~10° at the visible foot to ~31° near
// the summit (slope rises with height), a slightly truncated crater rim, snow on about the top third with fingers running
// down the gullies (generic radial gully pattern; Tokyo sees the east face), faint radial ridges, the darker Tanzawa
// ridge in front of its foot, three haze layers in the fog colour (far, mid, near) and an optional lenticular cloud.
// It is a backdrop: each frame it is turned to face the camera (local y = screen up, local z = toward the camera,
// squashed in depth) at FUJI_AT (city-state.js), its base low behind the skyline, and it shrinks a little as the camera
// zooms in, so it still reads from the district views that see the north-west horizon. Two draw calls: the opaque body +
// ridge, and the transparent haze + cloud. Colours follow the shared night amount (day → dusk → night silhouette).
const FUJI_AT=CS.FUJI_AT??{x:-60.5,z:-131},FUJI_K=CS.OVERVIEW_ZOOM?.desktop?.19/CS.OVERVIEW_ZOOM.desktop:1;
export const FUJI={x:FUJI_AT.x,z:FUJI_AT.z,height:34*FUJI_K,base:{sy:.4*16.5/.19*FUJI_K,target:[0,8,-7]},squash:.15,view:{yaw:36,pitch:40},
 overviewZoom:CS.OVERVIEW_ZOOM?.desktop??.19,segments:48,rings:18,slopeBase:10,slopeTop:31,crater:.04,snow:.3,
 day:'#8FA2B6',snowDay:'#F3F1EA',dusk:'#6C6F93',snowDusk:'#F2C9B5',night:'#1E2840',snowNight:'#36425F',
 ridge:{day:'#7A8C9C',dusk:'#4E5076',night:'#141C30',height:.3,width:1.55},maxTriangles:3000,renderOrder:-5};
// Slope (degrees) at height fraction f: rises from slopeBase at the foot to slopeTop at the rim (a concave profile).
export const fujiSlope=f=>FUJI.slopeBase+(FUJI.slopeTop-FUJI.slopeBase)*Math.pow(Math.min(1,Math.max(0,f)),1.4);
export function fujiProfile(H=FUJI.height){
 const N=400,rs=new Float64Array(N+1);   // radius at f=i/N, integrated from the rim down (dr = dh / tan θ)
 for(let i=N-1;i>=0;i--){const f=(i+.5)/N;rs[i]=rs[i+1]+H/N/Math.tan(fujiSlope(f)*Math.PI/180);}
 const c=FUJI.crater*rs[0]/(1-FUJI.crater),R=rs[0]+c;
 return {R,rim:c,radius(f){const x=Math.min(1,Math.max(0,f))*N,i=Math.min(N-1,Math.floor(x)),k=x-i;return c+rs[i]*(1-k)+rs[i+1]*k;}};
}
// Radial gully pattern g(θ) in −1…1 (negative = a gully: the radius dips and the snow runs further down).
export const fujiGully=a=>.55*Math.sin(a*9+1.3)+.3*Math.sin(a*17+.4)+.15*Math.sin(a*31+2.2);
const SUN_L=new THREE.Vector3(-.62,.42,.66).normalize();
export function fujiMesh(){
 const {segments:S,rings:NR,height:H}=FUJI,prof=fujiProfile(H),pos=[],lit=[],fr=[],ang=[],layer=[];
 const ringF=Array.from({length:NR+1},(_,k)=>1-Math.pow(1-k/NR,1.35));   // denser rings near the summit
 const P=(k,j)=>{const a=j/S*Math.PI*2,f=ringF[k],g=fujiGully(a),r=prof.radius(f)*(1+(.018+.045*f)*g);return [Math.cos(a)*r,f*H,Math.sin(a)*r,a,f];};
 // Smooth shading: each vertex's normal from the profile slope at its height, nudged by the gully pattern.
 const vlit=(a,f)=>{const t=fujiSlope(f)*Math.PI/180,n=new THREE.Vector3(Math.cos(a)*Math.sin(t),Math.cos(t),Math.sin(a)*Math.sin(t));return (.76+.34*Math.max(0,n.dot(SUN_L)))*(1+.05*fujiGully(a+.12));};
 const tri=(A,B,C,lay=0)=>{for(const p of [A,B,C]){pos.push(p[0],p[1],p[2]);lit.push(vlit(p[3],p[4]));fr.push(p[4]);ang.push(p[3]);layer.push(lay);}};
 for(let k=0;k<NR;k++)for(let j=0;j<S;j++){const A=P(k,j),B=P(k,j+1),C=P(k+1,j+1),D=P(k+1,j);tri(A,C,B);tri(A,D,C);}
 // Crater: the rim ring dips to a shallow bowl (truncated top, not a point).
 for(let j=0;j<S;j++){const A=P(NR,j),B=P(NR,j+1),a=(j+.5)/S*Math.PI*2,c=[Math.cos(a)*prof.rim*.35,H*.985,Math.sin(a)*prof.rim*.35,a,1];tri(A,c,B);}
 // Tanzawa ridge: a jagged lower silhouette in front (local z toward the camera), wider than Fuji's foot.
 const RW=prof.R*FUJI.ridge.width,RH=H*FUJI.ridge.height,M=64,ridgeY=x=>{const u=x/RW;return RH*(.55+.25*Math.sin(u*9.1+.7)+.14*Math.sin(u*23.+1.9)+.06*Math.sin(u*57.)-.35*u*u);};
 for(let i=0;i<M;i++){const x0=-RW+2*RW*i/M,x1=-RW+2*RW*(i+1)/M,z=prof.R*.95;const a=[x0,-H*.08,z,0,0],b=[x1,-H*.08,z,0,0],c=[x1,ridgeY(x1),z,0,0],d=[x0,ridgeY(x0),z,0,0];
  for(const t of [[a,b,c],[a,c,d]]){for(const p of t){pos.push(p[0],p[1],p[2]);lit.push(1);fr.push(p[1]/RH);ang.push(0);layer.push(1);}}}
 return {position:new Float32Array(pos),lit:new Float32Array(lit),f:new Float32Array(fr),angle:new Float32Array(ang),layer:new Float32Array(layer),triangles:pos.length/9,R:prof.R,ridgeZ:prof.R*.95,ridgeW:RW,ridgeH:RH};
}
// Haze + cloud (transparent): three bands in the fog colour (far one over Fuji's foot, mid over the ridge, near at the
// horizon) and a lens cloud just over the summit. Each vertex: position, alpha, cloud flag.
export function fujiHaze(m=fujiMesh()){
 const H=FUJI.height,W=m.ridgeW*1.1,pos=[],alpha=[],cloud=[],quad=(z,y0,y1,a0,a1)=>{const v=[[-W,y0,a0],[W,y0,a0],[W,y1,a1],[-W,y1,a1]];for(const i of [0,1,2,0,2,3]){pos.push(v[i][0],v[i][1],z);alpha.push(v[i][2]);cloud.push(0);}};
 quad(m.ridgeZ*.6,-H*.1,H*.42,.92,0);quad(m.ridgeZ*1.03,-H*.1,m.ridgeH*.75,.9,0);quad(m.ridgeZ*1.08,-H*.12,H*.1,.95,0);
 const n=24,cx=0,cy=H*1.09,rx=m.R*.2,ry=H*.035;for(let i=0;i<n;i++){const a0=i/n*Math.PI*2,a1=(i+1)/n*Math.PI*2;
  for(const [x,y,a] of [[cx,cy,.6],[cx+Math.cos(a0)*rx,cy+Math.sin(a0)*ry*(Math.sin(a0)>0?1:.55),0],[cx+Math.cos(a1)*rx,cy+Math.sin(a1)*ry*(Math.sin(a1)>0?1:.55),0]]){pos.push(x,y,m.R*.2);alpha.push(a);cloud.push(1);}}
 return {position:new Float32Array(pos),alpha:new Float32Array(alpha),cloud:new Float32Array(cloud),triangles:pos.length/9};
}

// ---------- Atlas drawing (browser only) ----------
function drawAtlas(){
 const c=document.createElement('canvas');c.width=c.height=ATLAS.size;const g=c.getContext('2d'),R=rng('sign-atlas');
 g.fillStyle='#000';g.fillRect(0,0,512,512);g.strokeStyle=g.fillStyle='#fff';g.lineCap='butt';g.lineJoin='miter';
 const L=(x0,y0,x1,y1)=>{g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();};
 const Q=(x0,y0,cx,cy,x1,y1)=>{g.beginPath();g.moveTo(x0,y0);g.quadraticCurveTo(cx,cy,x1,y1);g.stroke();};
 // A kana- or kanji-like pseudo glyph: strokes, boxes, sweeps; never a real word.
 function glyph(x,y,s){const p=(u,v)=>[x+u*s,y+v*s],l=(a,b,c2,d2)=>L(...p(a,b),...p(c2,d2)),q=(a,b,c2,d2,e,f)=>Q(...p(a,b),...p(c2,d2),...p(e,f));
  g.lineWidth=Math.max(1.5,s*.12);
  if(R()<.32){const k=Math.floor(R()*4);
   if(k===0){l(.15,.32,.85,.32);q(.58,.1,.52,.62,.18,.9);}else if(k===1){q(.2,.2,.9,.32,.48,.9);l(.3,.12,.3,.62);}
   else if(k===2){l(.18,.25,.82,.25);l(.5,.25,.5,.86);q(.5,.56,.8,.6,.86,.86);}else{q(.2,.3,.62,.08,.8,.36);q(.8,.36,.6,.72,.24,.86);}
   if(R()<.6)l(.74,.1,.86,.22);return;}
  let a=.12;const b=.88;
  if(R()<.45){const k=Math.floor(R()*3);
   if(k===0){l(.32,.1,.12,.46);l(.25,.3,.25,.9);}else if(k===1){l(.08,.28,.34,.28);l(.21,.1,.21,.9);l(.08,.62,.34,.5);}else{l(.1,.18,.2,.28);l(.1,.48,.2,.58);q(.08,.9,.2,.8,.3,.64);}
   a=.42;}
  const W=b-a,n=2+Math.floor(R()*3);
  for(let i=0;i<n;i++){const k=Math.floor(R()*7);
   if(k===0){const yy=.14+R()*.72;l(a,yy,b,yy);}else if(k===1){const xx=a+W*(.2+R()*.6);l(xx,.12,xx,.88);}
   else if(k===2){const y0=.14+R()*.3,h=.28+R()*.26;g.strokeRect(x+(a+W*.12)*s,y+y0*s,W*.76*s,h*s);}
   else if(k===3)l(a+W*.55,.14,a,.9);else if(k===4)l(a+W*.42,.46,b,.9);
   else if(k===5){l(a+W*.72,.1,a+W*.72,.84);l(a+W*.72,.84,a+W*.45,.74);}else{l(a+W*.2,.2,a+W*.32,.32);l(a+W*.72,.2,a+W*.6,.32);}}
 }
 const tiny=(x,y,w,h)=>{if(R()<.4){g.fillRect(x,y+h*.4,w,Math.max(1.5,h*.22));return;}for(let k=0;k*(h+2)+h<=w;k++)glyph(x+k*(h+2),y,h);};
 // Square panels: 1–4 big blocks + one small line.
 for(let i=0;i<ATLAS.panels;i++){const [x,y]=panelRect(i),k=panelLayout(i);
  if(k===0){glyph(x+12,y+5,40);tiny(x+10,y+50,44,8);}
  else if(k===1){glyph(x+16,y+4,27);glyph(x+16,y+32,27);for(let j=0;j<4;j++)glyph(x+50,y+8+j*12,8);}
  else if(k===2){for(const [u,v] of [[6,4],[33,4],[6,30],[33,30]])glyph(x+u,y+v,25);tiny(x+8,y+56,48,5);}
  else{g.lineWidth=2.5;g.strokeRect(x+5,y+5,54,54);glyph(x+14,y+9,36);tiny(x+12,y+47,40,7);}}
 // Specials: shutter grooves, mailbox slots, vending display, menu board.
 {const [x,y]=panelRect(ATLAS.special.shutter);for(let v=3;v<64;v+=6)g.fillRect(x,y+v,64,1.6);}
 {const [x,y]=panelRect(ATLAS.special.mailbox);g.lineWidth=1.5;for(let i=0;i<4;i++)for(let j=0;j<3;j++){g.strokeRect(x+4+i*14.5,y+6+j*18,12,15);g.fillRect(x+6+i*14.5,y+10+j*18,8,1.5);}}
 {const [x,y]=panelRect(ATLAS.special.vending);g.fillRect(x+2,y+2,60,5);for(let row=0;row<2;row++)for(let i=0;i<6;i++){const bx=x+5+i*9.5,by=y+11+row*22;g.fillRect(bx+2,by,3,4);g.fillRect(bx,by+4,7,13);}for(let i=0;i<6;i++)g.fillRect(x+7+i*9.5,y+57,3,3);}
 {const [x,y]=panelRect(ATLAS.special.menu);glyph(x+6,y+4,24);glyph(x+32,y+4,24);for(let j=0;j<4;j++)tiny(x+6,y+32+j*8,52,5);}
 // Fascia strips 128 × 32: 2–4 glyphs, sometimes an inverted end block, plus a small line.
 for(let i=0;i<ATLAS.strips;i++){const [x,y]=stripRect(i),n=2+Math.floor(R()*3),block=R()<.4,left=R()<.5;let x0=x+6;
  if(block){const bx=left?x+3:x+99;g.fillRect(bx,y+3,26,26);g.strokeStyle='#000';glyph(bx+4,y+6,19);g.strokeStyle='#fff';if(left)x0=x+34;}
  for(let k=0;k<n;k++)glyph(x0+k*23,y+5,21);const tx=x0+n*23+2,room=(block&&!left?x+97:x+124)-tx;if(room>10)tiny(tx,y+18,room,7);}
 // Hero 256 × 128 (ink = cream, mid-grey = brand-orange accent): the only sign allowed to say SUBZERONE / YOUR IDEA.
 {const [x,y,w]=ATLAS.hero;g.fillStyle='#808080';g.fillRect(x+12,y+10,w-24,5);g.font='bold 27px Helvetica, Arial, sans-serif';g.fillText('SUBZERONE',x+14,y+104,w-28);
  g.fillStyle='#fff';g.font='bold 52px Helvetica, Arial, sans-serif';g.fillText('YOUR IDEA',x+12,y+70,w-24);g.lineWidth=2;for(let k=0;k<6;k++)glyph(x+186+k*10.5,y+90,9);}
 // Generic billboard ad 256 × 128: two big glyph blocks and three small lines.
 {const [x,y]=ATLAS.ad;g.lineWidth=3;g.strokeRect(x+5,y+5,246,118);glyph(x+14,y+14,64);glyph(x+80,y+14,64);g.fillRect(x+14,y+90,126,4);for(let j=0;j<3;j++)tiny(x+156,y+20+j*30,86,14);}
 const px=g.getImageData(0,0,512,512).data,mask=new Uint8Array(512*512);for(let i=0;i<mask.length;i++)mask[i]=px[i*4];
 const tex=new THREE.DataTexture(mask,512,512,THREE.RedFormat,THREE.UnsignedByteType);
 tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;return tex;
}

// ---------- GPU side ----------
const LOD_ZOOM=.3;   // below this camera zoom (overview) the small detail props and detail signs are not drawn
export function addTokyoStyle(parent,buildings=[]){
 const root=new THREE.Group();root.name='tokyo style';parent.add(root);
 const plan=stylePlan(buildings),dummy=new THREE.Object3D(),col=new THREE.Color();dummy.rotation.order='YXZ';
 const order=list=>[...list.filter(v=>!v.detail),...list.filter(v=>v.detail)];
 const lod=(mesh,core,all)=>{mesh.userData.lod={core,all};mesh.onBeforeRender=(renderer,scene,camera)=>{mesh.count=camera.zoom<LOD_ZOOM?core:all;};};
 const matrix=v=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(v.rx||0,v.ry||0,v.rz||0);dummy.scale.set(v.w,v.h,v.d??1);dummy.updateMatrix();return dummy.matrix;};
 // Props: one box batch.
 const propMat=toon({roughness:.9}),props=order(plan.props);
 const propMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),propMat,Math.max(1,props.length));
 props.forEach((v,i)=>{propMesh.setMatrixAt(i,matrix(v));propMesh.setColorAt(i,col.set(v.color));});
 propMesh.count=props.length;propMesh.castShadow=propMesh.receiveShadow=true;propMesh.name='street props';propMesh.raycast=()=>{};
 if(propMesh.instanceColor)propMesh.instanceColor.needsUpdate=true;propMesh.computeBoundingSphere();lod(propMesh,props.filter(v=>!v.detail).length,props.length);root.add(propMesh);
 // Signs: one plane batch, per-instance atlas rect, ground/ink/accent colours and night glow.
 const signs=order(plan.signs),n=Math.max(1,signs.length),geo=new THREE.PlaneGeometry(1,1),a={rect:new Float32Array(n*4),bg:new Float32Array(n*3),ink:new Float32Array(n*3),acc:new Float32Array(n*3),glow:new Float32Array(n*3)};
 const ci=new THREE.Color(),ca=new THREE.Color();
 signs.forEach((s,i)=>{a.rect.set(s.rect.map(v=>v/ATLAS.size),i*4);col.set(s.bg);ci.set(s.ink);ca.copy(s.acc?new THREE.Color(s.acc):col.clone().lerp(ci,.5));
  a.bg.set([col.r,col.g,col.b],i*3);a.ink.set([ci.r,ci.g,ci.b],i*3);a.acc.set([ca.r,ca.g,ca.b],i*3);a.glow.set(s.glow,i*3);});
 for(const [k,v] of Object.entries(a))geo.setAttribute('sign'+k[0].toUpperCase()+k.slice(1),new THREE.InstancedBufferAttribute(v,k==='rect'?4:3));
 const atlas=typeof document!=='undefined'?drawAtlas():null,night={value:0};
 const signMat=toon({roughness:1,side:THREE.DoubleSide});
 signMat.onBeforeCompile=sh=>{Object.assign(sh.uniforms,{uSignAtlas:{value:atlas},uSignNight:night,uSignDay:{value:.1}});
  sh.vertexShader='attribute vec4 signRect;attribute vec3 signBg,signInk,signAcc,signGlow;\nvarying vec2 vSignUv;varying vec3 vSignBg,vSignInk,vSignAcc,vSignGlow;\n'+sh.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\n vSignUv=signRect.xy+vec2(position.x+.5,.5-position.y)*signRect.zw;vSignBg=signBg;vSignInk=signInk;vSignAcc=signAcc;vSignGlow=signGlow;');
  sh.fragmentShader='uniform sampler2D uSignAtlas;uniform float uSignNight,uSignDay;\nvarying vec2 vSignUv;varying vec3 vSignBg,vSignInk,vSignAcc,vSignGlow;\n'+sh.fragmentShader
   .replace('#include <color_fragment>','#include <color_fragment>\n float signT=texture2D(uSignAtlas,vSignUv).r;\n vec3 signCol=signT<.5?mix(vSignBg,vSignAcc,signT*2.):mix(vSignAcc,vSignInk,signT*2.-1.);\n diffuseColor.rgb*=signCol;')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=signCol*mix(vec3(uSignDay),vSignGlow,uSignNight);');};
 signMat.customProgramCacheKey=()=>'tokyo-sign-atlas-v2';
 const signMesh=new THREE.InstancedMesh(geo,signMat,n);signMesh.name='signs';signMesh.raycast=()=>{};signMesh.receiveShadow=true;
 signs.forEach((s,i)=>signMesh.setMatrixAt(i,matrix(s)));signMesh.count=signs.length;signMesh.computeBoundingSphere();root.add(signMesh);
 lod(signMesh,signs.filter(v=>!v.detail).length,signs.length);
 // Shibuya's big screen lives in city-life.js (created after this module on first load): re-place it once found.
 if(plan.screen){let placed=false;const before=signMesh.onBeforeRender;signMesh.onBeforeRender=(...args)=>{before(...args);if(placed)return;
  parent.traverse(o=>{if(placed||!o.isMesh||o.isInstancedMesh)return;const p=o.geometry?.parameters;if(p?.width===6.3&&p?.height===3.15){const s=plan.screen;o.position.set(s.x,s.y,s.z);o.rotation.set(0,s.ry,0);o.scale.set(s.w/6.3,s.h/3.15,1);placed=true;}});};}
 // Fuji: body + Tanzawa ridge (opaque) and haze + lens cloud (transparent); colours from the shared night amount.
 const fm=fujiMesh(),fh=fujiHaze(fm),fgeo=new THREE.BufferGeometry(),hgeo=new THREE.BufferGeometry();
 fgeo.setAttribute('position',new THREE.BufferAttribute(fm.position,3));for(const [k,a] of [['aLit',fm.lit],['aF',fm.f],['aAng',fm.angle],['aLayer',fm.layer]])fgeo.setAttribute(k,new THREE.BufferAttribute(a,1));
 hgeo.setAttribute('position',new THREE.BufferAttribute(fh.position,3));hgeo.setAttribute('aA',new THREE.BufferAttribute(fh.alpha,1));hgeo.setAttribute('aCloud',new THREE.BufferAttribute(fh.cloud,1));
 const C=h=>new THREE.Color(h),fu={uFN:nightShared,uFSnow:{value:1-FUJI.snow},uFDay:{value:C(FUJI.day)},uFDusk:{value:C(FUJI.dusk)},uFNight:{value:C(FUJI.night)},
  uFSDay:{value:C(FUJI.snowDay)},uFSDusk:{value:C(FUJI.snowDusk)},uFSNight:{value:C(FUJI.snowNight)},uFRDay:{value:C(FUJI.ridge.day)},uFRDusk:{value:C(FUJI.ridge.dusk)},uFRNight:{value:C(FUJI.ridge.night)}};
 const FU='uniform float uFN,uFSnow;uniform vec3 uFDay,uFDusk,uFNight,uFSDay,uFSDusk,uFSNight,uFRDay,uFRDusk,uFRNight;\nvec3 fuji3(vec3 a,vec3 b,vec3 c){return uFN<.5?mix(a,b,uFN*2.):mix(b,c,uFN*2.-1.);}\n';
 // Fuji's anchor sits far below the city's ground plane (main.js cityGround: y −0.02 to CITY_EXTENT + 40, −1.6 to ±600),
 // so a depth test would hide it under the ground (the wave-5 regression). The body is drawn right after the ground
 // (renderOrder −5 vs −10) with no depth test but writing its depth, so everything in the city still draws over it and
 // the haze still tests against it. Without a depth test the body cannot sort itself: the fragment shader drops the
 // back half (it always faces the camera, so the front half is sin(angle) > 0 and never overlaps itself in a side view),
 // and the Tanzawa ridge comes last in the buffer, so it covers the foot.
 const fujiMat=new THREE.MeshBasicMaterial({toneMapped:false,side:THREE.DoubleSide,depthTest:false,depthWrite:true});
 fujiMat.onBeforeCompile=sh=>{Object.assign(sh.uniforms,fu);
  sh.vertexShader='attribute float aLit,aF,aAng,aLayer;varying float vLit,vF,vAng,vLayer;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vLit=aLit;vF=aF;vAng=aAng;vLayer=aLayer;');
  sh.fragmentShader=FU+'varying float vLit,vF,vAng,vLayer;\n'+sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 if(vLayer<.5&&sin(vAng)<0.)discard;   // back half of the body (fujiMat has no depth test)
 float fg=.55*sin(vAng*9.+1.3)+.3*sin(vAng*17.+.4)+.15*sin(vAng*31.+2.2);
 float fs=uFSnow-.11*max(0.,-fg)+.03*max(0.,fg)-.018*sin(vAng*71.+.5)-.01*sin(vAng*143.);
 float fsn=smoothstep(fs-.004,fs+.004,vF);
 vec3 fc=mix(fuji3(uFDay,uFDusk,uFNight),fuji3(uFSDay,uFSDusk,uFSNight),fsn)*mix(vLit,1.,uFN*.8);
 fc*=1.-.035*smoothstep(.55,1.,abs(sin(vAng*41.)))*(1.-fsn)*(1.-uFN)*smoothstep(.15,.6,vF);
 diffuseColor.rgb=mix(fc,fuji3(uFRDay,uFRDusk,uFRNight)*(.92+.12*clamp(vF,0.,1.)),step(.5,vLayer));`)
   .replace('#include <fog_fragment>','#ifdef USE_FOG\n gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,smoothstep(fogNear,fogFar,vFogDepth)*.28);\n#endif');};
 fujiMat.customProgramCacheKey=()=>'tokyo-fuji-w4b';
 const hazeMat=new THREE.MeshBasicMaterial({toneMapped:false,transparent:true,depthWrite:false,side:THREE.DoubleSide});
 hazeMat.onBeforeCompile=sh=>{Object.assign(sh.uniforms,fu);
  sh.vertexShader='attribute float aA,aCloud;varying float vA,vCloud;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vA=aA;vCloud=aCloud;');
  sh.fragmentShader=FU+'varying float vA,vCloud;\n'+sh.fragmentShader.replace('#include <fog_fragment>',`vec3 hz=fuji3(uFDay,uFDusk,uFNight);
 #ifdef USE_FOG
 hz=fogColor;
 #endif
 vec3 cl=mix(hz,fuji3(uFSDay,uFSDusk,uFSNight),.62-.3*uFN);
 gl_FragColor=vec4(mix(hz,cl,vCloud),vA*mix(1.,.8-.55*uFN,vCloud));`);};
 hazeMat.customProgramCacheKey=()=>'tokyo-fuji-haze-w4b';
 const mountain=new THREE.Mesh(fgeo,fujiMat),haze=new THREE.Mesh(hgeo,hazeMat);mountain.name='fuji';haze.name='fuji haze';mountain.renderOrder=FUJI.renderOrder;
 // Base anchor: at FUJI_AT, low enough that the base sits FUJI.base.sy below screen centre in the default overview.
 const fp=THREE.MathUtils.degToRad(FUJI.view.pitch),fy=THREE.MathUtils.degToRad(FUJI.view.yaw),up=new THREE.Vector3(-Math.sin(fp)*Math.sin(fy),Math.cos(fp),-Math.sin(fp)*Math.cos(fy)),T0=FUJI.base.target;
 const anchor=new THREE.Vector3(FUJI.x,T0[1]+(FUJI.base.sy-(FUJI.x-T0[0])*up.x-(FUJI.z-T0[2])*up.z)/up.y,FUJI.z),FM=new THREE.Matrix4(),fr=new THREE.Vector3(),fu2=new THREE.Vector3(),fb=new THREE.Vector3();
 // Faces the camera every frame (it is radially symmetric), squashed in depth, a bit smaller when zoomed in.
 const face=(m,camera)=>{const s=Math.min(1,Math.max(.42,Math.pow(FUJI.overviewZoom/Math.max(1e-3,camera.zoom||1),.6)));camera.matrixWorld.extractBasis(fr,fu2,fb);
  FM.makeBasis(fr.multiplyScalar(s),fu2.multiplyScalar(s),fb.multiplyScalar(s*FUJI.squash)).setPosition(anchor);m.matrixWorld.multiplyMatrices(m.parent.matrixWorld,FM);};
 for(const m of [mountain,haze]){m.matrixAutoUpdate=false;m.frustumCulled=false;m.raycast=()=>{};m.onBeforeRender=(r,sc,camera)=>face(m,camera);root.add(m);}
 mountain.matrixWorld.makeBasis(new THREE.Vector3(1,0,0),up,new THREE.Vector3().crossVectors(new THREE.Vector3(1,0,0),up)).setPosition(anchor);
 const white=new THREE.Color('#ffffff');let life=null;
 return {signMesh,propMesh,mountain,haze,plan,lightPools:plan.pools,
  stats:()=>({props:props.length,propsCore:propMesh.userData.lod.core,signs:signs.length,signsCore:signMesh.userData.lod.core,fujiTriangles:fm.triangles+fh.triangles,drawCalls:4,atlasBytes:atlas?512*512:0}),
  // Vending pools need city-life's light-pool batch; city.js can hand it over (style.bindLife(life)) after each redraw.
  bindLife(l){life=l;if(!l?.addLightPool)return;l.clearLightPools('props');for(const [x,z,c,r,s] of plan.pools)l.addLightPool(x,z,c,r,{group:'props',strength:s});},
  setNight(value){night.value=value?1:0;const f=value?nightColor('walls'):white;propMat.color.copy(f);signMat.color.copy(f);},
  dispose(){parent.remove(root);propMesh.dispose();propMesh.geometry.dispose();propMat.dispose();signMesh.dispose();geo.dispose();signMat.dispose();atlas?.dispose();fgeo.dispose();fujiMat.dispose();hgeo.dispose();hazeMat.dispose();}};
}
