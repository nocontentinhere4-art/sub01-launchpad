// Street-wall layout for the Tokyo city (art brief 3.2–3.5, 3.8). Pure and deterministic: every number comes from
// a hash of a plot or district id, never from an index modulo n. city.js draws it; tokyo-style (wave 2) can hang
// signs and props off the same lots.
//
// Units: 1 ≈ 1 m. Ground floor 3.0, upper storeys 2.5, parapet 0.6 → height = 3.0 + 2.5·(floors−1) + 0.6.
// Building base sits at y = BASE_Y (top of the district concrete).
//
// Lot (a building, from cityLayout().lots or subLotsOf()):
//  { id, plotId|null, district, role:'sub'|'filler'|'interior', user:bool, building|null,
//    x, z            footprint centre (world)
//    width, depth    footprint along x / along z
//    setback         distance of the front face behind the lot line (street side)
//    front           '+z'|'-z'   the face toward the district street (plots at d.z+6 face −z)
//    frontZ          world z of the front face
//    type            'T1' zakkyo | 'T2' pencil | 'T3' mansion | 'T4' shop-house | 'T5' old house | 'T6' konbini | 'T7' office
//    floors, height  height = top of parapet (flat roofs) or ridge (T5, which also has eave)
//    wall, roof      hex colours (user lot: buildingColors[b.color])
//    shop            ground floor: 'glazed'|'shutter'|'noren'|'entrance'|'pilotis'|'konbini'|'house'
//    stripe          konbini band colours [3] or null
//    awning          {color, depth, y} or null
//    stair           T1 external steel stair (drawn on the back face)
//    roofItems       [{kind:'bulkhead'|'tank'|'tankRound'|'condenser'|'cooling'|'antenna'|'billboard'|'garden'|'rail'|'vent',
//                      u, v, w, d, h, color}]   u along +x, v toward the front, both from the footprint centre
//    bays            T3: per upper floor, [{ac, acSide:-1|1, laundry}] per 1.9 bay;  T2: per upper floor [{balcony}]
//    sideAC          number of AC units stacked on the exposed side wall (T1/T2)
//    sideWindows     0–2 small windows on the exposed side wall
//    leftH, rightH   heights of the touching neighbours along the street (0 = open) }
//
// Spot (open ground, from cityLayout().spots): { id, plotId|null, district, kind:'alley'|'vending'|'parking'|
//    'coin-parking'|'shrine', x, z, width, depth, front, frontZ, bays?, cars? }   vacant plots → T8 coin parking or shrine.
//
// frontFace(plotId) → '+z'|'-z'.  subLotsOf(plotId,buildings) → {front, lots, spots, user} for that plot.
import {cityPlots,districts,buildingColors} from './city-state.js';

export const GROUND=3.0,STOREY=2.5,PARAPET=.6,BASE_Y=.12,JOINT=.08,LOT_LINE=3.3,EDGE=11.0;
// EDGE: facades stop 3.5 short of the boulevard centres (14.5 from a district centre), clear of 1A's boulevard poles at 3.3.
export const heightFor=(floors,type)=>type==='T5'?GROUND+STOREY+1:floors<1?0:GROUND+STOREY*(floors-1)+PARAPET;

export function hashString(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function rng(seed){let a=hashString(seed);return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const pick=(r,table)=>{const total=table.reduce((s,[,w])=>s+w,0);let x=r()*total;for(const [v,w] of table){if((x-=w)<0)return v;}return table.at(-1)[0];};
const between=(r,a,b)=>a+(b-a)*r();

export const CATEGORY={shinjuku:'neon',shibuya:'neon',akihabara:'neon',roppongi:'neon',ikebukuro:'neon',
 ginza:'office',nihonbashi:'office',shinagawa:'office',tsukiji:'office',odaiba:'office',kanda:'office',
 ebisu:'home',nakameguro:'home',nakano:'home',meguro:'home',harajuku:'home',yoyogi:'home',daikanyama:'home',koenji:'home',
 shiba:'old',asakusa:'old',ueno:'old',sumida:'old',shimokitazawa:'old'};
const PROFILE={
 neon:{floors:[3,6],mix:{T1:6,T4:2,T5:0,T3:2,T7:1}},
 office:{floors:[3,7],mix:{T1:3,T4:1,T5:0,T3:1.5,T7:4}},
 home:{floors:[2,4],mix:{T1:1,T4:3,T5:1.5,T3:4,T7:0}},
 old:{floors:[2,3],mix:{T1:.5,T4:4,T5:3,T3:1,T7:0}}};
const TYPE_FLOORS={T1:[3,6],T2:[2,5],T3:[3,5],T4:[2,3],T5:[2,2],T6:[1,1],T7:[5,8]};
// Which sides of a district street get a raised sidewalk (with curb and tactile strip on commercial ones).
export function sidewalkSides(districtId){const c=CATEGORY[districtId]||'home';if(c==='neon'||c==='office')return [-1,1];if(c==='old')return [];return [hashString(districtId+':walk')&1?-1:1];}
export const isCommercial=id=>['neon','office'].includes(CATEGORY[id]);

export const WALLS=[['#E4D9C3',20],['#D3C2A2',15],['#B8B3A8',15],['#ECEAE3',12],['#9DA3A1',10],['#9A7A60',8],['#76574A',5],['#7FA09C',6],['#A8BFC6',5],['#A3B29B',4]];
const ROOFS=[['#8B8F87',1],['#7C8A80',1],['#9C998F',1]],TILE_ROOFS=[['#4E5864',2],['#6F5A4B',1]];
const AWNINGS=[['#C26A5C',3],['#7D8F86',2],['#B98A55',2],['#5E7A93',2],['#8C7A8E',1],['#3E7A5C',1]];
const KONBINI=[['#2F6FB5','#F4F1EA','#2F6FB5'],['#3E9B5C','#F4F1EA','#3E9B5C'],['#D2463C','#F0B23E','#3E9B5C']];
const SPLITS=[[[5.8],25],[[2.6,3.2],30],[[1.9,3.9],20],[[1.8,2,2],15],[[3.6,'open'],10]];

export const frontFace=plotId=>{const p=cityPlots.find(c=>c.id===plotId);if(!p)return null;const d=districts.find(d=>d.id===p.district);return p.z<d.z?'+z':'-z';};
const fzOf=front=>front==='+z'?1:-1;

function chooseType(r,width,category){
 if(width<2.4)return 'T2';
 const mix=PROFILE[category].mix,ok=t=>t==='T1'?width<=4.05:t==='T4'?width<=3.95:t==='T5'?width>=3.5:t==='T3'?width>=3.8:t==='T7'?width>4.05:false;
 const table=Object.entries(mix).filter(([t,w])=>w>0&&ok(t));
 return table.length?pick(r,table):width>4.05?'T3':'T4';
}
function floorRange(type,category){const [a,b]=TYPE_FLOORS[type],[c,d]=PROFILE[category].floors,lo=Math.max(a,c),hi=Math.min(b,d);return lo<=hi?[lo,hi]:[a,b];}
function shopFor(r,type,width){
 if(type==='T5')return 'house';if(type==='T6')return 'konbini';
 if(type==='T7')return pick(r,[['glazed',7],['entrance',2],['pilotis',width>=3?1:0]]);
 if(type==='T3')return pick(r,[['entrance',4],['glazed',3],['pilotis',2],['shutter',1]]);
 return pick(r,[['glazed',55],['shutter',15],['noren',10],['entrance',10],['pilotis',width>=3?10:0]]);
}

// Roof clutter: 2–5 items in corner slots, never centred (brief 3.5). Pitched T5 roofs only carry an antenna.
function roofRecipe(r,lot,category){
 const W=lot.width-.3,D=lot.depth-.3,items=[],t=lot.type,neon=category==='neon';
 if(t==='T5'){if(r()<.5)items.push({kind:'antenna',u:(r()-.5)*W*.5,v:-D*.15,w:.8,d:.8,h:2,color:'#4F5658'});return items;}
 const want=[];
 if(lot.floors>=3&&r()<.8)want.push({kind:'bulkhead',w:Math.min(1.6,W*.5),d:Math.min(2.4,D*.45),h:1.8,slots:['BL','BR']});
 if(neon&&t==='T1'&&W>=2.2&&r()<.3)want.push({kind:'billboard',w:Math.min(3.5,W),d:.5,h:2.2,slots:['F']});
 if(r()<.4)want.push({kind:'tank',w:Math.min(1.4,W*.5),d:Math.min(1.1,D*.35),h:1.5,color:r()<.5?'#B9C6C4':'#D8CFBE',slots:['BL','BR','FL','FR']});
 if(r()<.15)want.push({kind:'tankRound',w:Math.min(1,W*.45),d:Math.min(1,W*.45),h:1.2,color:'#8FAFBF',slots:['FL','FR','BL','BR']});
 if((t==='T1'||t==='T7'||t==='T6')&&r()<(t==='T6'?1:.6)){const n=Math.max(1,Math.min(2+Math.floor(r()*3),Math.floor(W/.8)));want.push({kind:'condenser',n,w:n*.8-.1,d:.7,h:.7,slots:['FR','FL','BR','BL']});}
 if(t==='T7')want.push({kind:'cooling',w:Math.min(1.4,W*.4),d:Math.min(1.4,D*.3),h:1.2,slots:['BR','BL','FR','FL']});
 if(['T2','T3','T4'].includes(t)&&r()<.5)want.push({kind:'antenna',w:.8,d:.8,h:2,slots:['FL','FR','BR','BL']});
 if(t==='T3'&&r()<.15)want.push({kind:'garden',w:Math.min(1.6,W*.45),d:.9,h:.5,slots:['FL','FR']});
 if(r()<.5)want.push({kind:'rail',w:W,d:D,h:1});
 while(want.length<2)want.push({kind:'vent',w:.5+r()*.3,d:.5,h:.6,slots:['FR','BL','FL','BR']});
 const used=new Set(),narrow=W<1.7;
 for(const it of want){if(items.length>=5)break;
  if(it.kind==='rail'){items.push({kind:'rail',u:0,v:0,w:W,d:D,h:1,color:'#7F8A88',sides:r()<.5?'FL':'FR'});continue;}
  const slots=it.kind==='billboard'?['F']:it.slots.map(s=>narrow?s[0]:s);
  const slot=slots.find(s=>!used.has(s)&&!(s==='F'&&(used.has('FL')||used.has('FR')))&&!((s==='FL'||s==='FR')&&used.has('F')));
  if(!slot)continue;used.add(slot);
  const su=slot.length<2?0:slot[1]==='L'?-1:1,sv=slot[0]==='F'?1:-1,inset=.05+r()*.12;
  const w=Math.min(it.w,W),d=Math.min(it.d,D*.5);
  items.push({kind:it.kind,u:su*Math.max(0,W/2-w/2-inset),v:sv*Math.max(0,D/2-d/2-inset),w,d,h:it.h,n:it.n,
   color:it.color||{bulkhead:null,billboard:'#5B6264',condenser:'#D7D3C8',cooling:'#C9CCC6',antenna:'#4F5658',garden:'#6F8F5E',vent:'#A9ACA6'}[it.kind]});
 }
 return items;
}

function sideElements(d,s,buildings){
 // s = -1: the row at d.z-6 (fronts face +z); s = 1: the row at d.z+6 (fronts face −z).
 const front=s<0?'+z':'-z',plots=cityPlots.filter(p=>p.district===d.id&&(s<0?p.z<d.z:p.z>d.z)).sort((a,b)=>a.x-b.x);
 const el=[];
 plots.forEach((p,k)=>{
  const b=buildings.find(b=>b.plotId===p.id),r=rng(p.id+':split');
  if(p.vacant&&!b){const kind=r()<.65?'coin-parking':'shrine';el.push({kind:'spot',spot:kind,plotId:p.id,x:p.x,width:5.8,vacant:true,cars:kind==='coin-parking'?[0,1,2].filter(()=>r()<.5):[]});}
  else{
   let split=pick(r,SPLITS).slice();
   if(b&&split.length===3)split=[1.8,4];
   if(r()<.5)split.reverse();
   if(split.length===3&&r()<.5)split=[split[1],split[0],split[2]];
   const widest=Math.max(...split.filter(v=>typeof v==='number'));let x=p.x-2.9,userTaken=false;
   split.forEach((w,j)=>{const width=w==='open'?2.2:w;
    if(w==='open')el.push({kind:'spot',spot:r()<.5?'parking':'alley',plotId:p.id,x:x+width/2,width:2.2,splitOpen:true,cars:[0]});
    else{const user=!!b&&!userTaken&&w===widest;if(user)userTaken=true;el.push({kind:'building',role:'sub',plotId:p.id,user,building:user?b:null,x:x+width/2,width:width-JOINT,seed:`${p.id}:${j}`});}
    x+=width;});
  }
  const next=plots[k+1];if(!next)return;
  const g0=p.x+2.9,g1=next.x-2.9,gr=rng(`${d.id}:${s}:gap${k}`),roll=gr();
  if(roll<.6){const w=between(gr,1.6,2.0),x0=g0+.1+(g1-g0-.2-w)*gr();el.push({kind:'building',role:'filler',x:x0+w/2,width:w,seed:`${d.id}:${s}:gap${k}`,gap:'pencil'});}
  else if(roll<.85){const left=gr()<.5,pw=1.2;
   const px=left?g0+.1+pw/2:g1-.1-pw/2,ax=left?g1-.1-.35:g0+.1+.35;
   const parts=[{kind:'building',role:'filler',x:px,width:pw,seed:`${d.id}:${s}:gap${k}`,gap:'alley'},{kind:'spot',spot:'alley',x:ax,width:.7,acSide:left?-1:1,pole:true}];
   el.push(...(left?parts:parts.reverse()));}
  else el.push({kind:'spot',spot:'vending',x:(g0+g1)/2,width:2.2,machines:2+(gr()<.35?1:0)});
 });
 return {front,el};
}

export function streetFill(el,d){
 const lo=d.x-EDGE,hi=d.x+EDGE;let covered=0,excluded=0;
 for(const e of el){if(e.kind==='building')covered+=Math.max(0,Math.min(hi,e.x+e.width/2)-Math.max(lo,e.x-e.width/2));if(e.vacant)excluded+=e.width;}
 return covered/(hi-lo-excluded);
}

function layoutDistrict(d,buildings,out){
 const category=CATEGORY[d.id]||'home',dr=rng(d.id+':district');
 const sides=[-1,1].map(s=>sideElements(d,s,buildings));
 // Repair: never let open gaps drop a street edge under 85 % building face.
 for(const side of sides){
  for(const e of side.el){if(streetFill(side.el,d)>=.85)break;
   if(e.kind==='spot'&&e.spot==='vending'){Object.assign(e,{kind:'building',role:'filler',width:1.8,seed:`${d.id}:${e.x.toFixed(2)}:fill`,gap:'pencil'});delete e.spot;}}
  for(let i=0;i<side.el.length&&streetFill(side.el,d)<.85;i++){const e=side.el[i];
   if(e.kind==='spot'&&e.splitOpen){Object.assign(e,{kind:'building',role:'sub',width:2.2-JOINT,user:false,seed:`${e.plotId}:open`});delete e.spot;}}
  for(let i=0;i<side.el.length&&streetFill(side.el,d)<.85;i++){const e=side.el[i];
   if(e.kind==='spot'&&e.pole){const j=side.el[i-1]?.gap==='alley'?i-1:i+1,p=side.el[j];p.x=(p.x+e.x)/2;p.width=1.9;p.gap='pencil';side.el.splice(i,1);i--;}}
 }
 const konbini=hashString(d.id+':konbini')%2===0;
 for(const [si,{front,el}] of sides.entries()){
  const s=si?1:-1,fz=fzOf(front),lotLine=d.z-fz*LOT_LINE;
  const blds=el.filter(e=>e.kind==='building');
  for(const e of blds){
   const r=rng(e.seed+':type');
   if(e.user){const t=e.building.type;e.type=t==='project'?'T1':t==='studio'?'T4':'T3';e.fixed=t==='project'?6:t==='studio'?3:5;}
   else e.type=chooseType(r,e.role==='sub'?e.width+JOINT:e.width,category);
   if(e.type==='T5'&&e.role!=='sub')e.type='T2';
  }
  if(konbini&&s===(hashString(d.id+':kside')&1?1:-1)){
   const c=blds.filter(e=>!e.user&&e.width>=3.5).sort((a,b)=>(b.type==='T3')-(a.type==='T3')||b.width-a.width)[0];
   if(c){if(c.type!=='T3')c.type='T6';c.shopForce='konbini';}
  }
  // Floors: base from the plot's height plus a hashed ±2, then no two touching neighbours alike.
  for(const e of blds){
   const p=e.plotId&&cityPlots.find(p=>p.id===e.plotId),r=rng(e.seed+':floors');
   // The row nearest the camera (+z side of the street) stays lower so the street and the far facades read.
   let [lo,hi]=floorRange(e.type,category);if(s>0)hi=Math.max(lo,Math.min(hi,lo+1));
   const t=p?Math.min(1,Math.max(0,(p.height-3)/13)):r(),u=Math.pow(.5*t+.5*rng(d.id+e.seed)(),1.5);
   e.range=[lo,hi];e.desired=e.fixed??Math.max(lo,Math.min(hi,Math.round(lo+(hi-lo)*u+Math.floor(r()*5)-2)));
   // Lots sharing a plot with the user's building stay at least two floors below it.
   const own=e.plotId&&!e.fixed&&blds.find(x=>x.fixed&&x.plotId===e.plotId);if(own){e.range=[Math.min(lo,Math.max(1,own.fixed-2)),Math.max(1,Math.min(hi,own.fixed-2))];e.desired=Math.min(e.desired,e.range[1]);}
  }
  blds.forEach((e,i)=>{
   if(e.fixed){e.floors=e.fixed;return;}
   const prev=blds[i-1]?.floors,next=blds[i+1]?.fixed;
   const tryList=v=>v.filter(f=>f!==prev&&f!==next);
   const inRange=[];for(let f=e.range[0];f<=e.range[1];f++)inRange.push(f);
   inRange.sort((a,b)=>Math.abs(a-e.desired)-Math.abs(b-e.desired));
   let ok=tryList(inRange);
   if(!ok.length&&e.type==='T5'){e.type='T4';ok=tryList([3,2]);}
   if(!ok.length)ok=tryList([e.desired+1,e.desired-1,e.desired+2,e.desired-2].filter(f=>f>=1&&f<=9));
   e.floors=ok[0];
  });
  // Colours, depth, ground floor and details.
  let prevWall=null,prevRoof=null;
  blds.forEach((e,i)=>{
   const r=rng(e.seed+':skin');
   let wall=pick(r,WALLS);for(let k=0;k<4&&wall===prevWall;k++)wall=pick(r,WALLS);
   if(e.type==='T5')wall=r()<.5?'#6B5443':'#D9CDB4';
   if(e.user)wall=buildingColors[e.building.color]||wall;
   let roof=pick(r,e.type==='T5'?TILE_ROOFS:ROOFS);if(roof===prevRoof)roof=pick(r,e.type==='T5'?TILE_ROOFS:ROOFS);
   prevWall=wall;prevRoof=roof;
   const depth=e.user?4.8:e.type==='T5'?between(r,3.6,4.2):e.type==='T3'||e.type==='T7'?between(r,4.8,5.2):between(r,4.2,5.2);
   // Protrusions (balconies 0.9, pencil balconies 0.5) stay ≥ 3.0 from the street centre, clear of 1A's pole crossarms.
   const setback=e.type==='T5'?.8:e.type==='T3'?.6+(e.user?0:r()*.3):e.type==='T2'?.2+r()*.1:e.user?.1:r()*.3,frontZ=lotLine-fz*setback,z=frontZ-fz*depth/2;
   const shop=e.shopForce||(e.user&&e.type==='T3'?'entrance':shopFor(r,e.type,e.width));
   const lot={id:e.seed,plotId:e.plotId||null,district:d.id,role:e.role,user:!!e.user,building:e.building||null,x:e.x,z,width:e.width,depth,setback,front,frontZ,
    type:e.type,floors:e.floors,height:heightFor(e.floors,e.type),wall,roof,shop,
    stripe:shop==='konbini'?KONBINI[hashString(d.id)%3]:null,
    awning:['glazed','noren'].includes(shop)&&r()<.34?{color:pick(r,AWNINGS),depth:Math.min(between(r,.6,.9),LOT_LINE+setback-2.55),y:between(r,2.6,2.95)}:null,
    stair:e.type==='T1'&&r()<.5,gap:e.gap||null,
    leftH:0,rightH:0,bays:[],sideAC:0,sideWindows:Math.floor(r()*3)};
   if(e.type==='T5')lot.eave=GROUND+STOREY;
   if(e.type==='T3'){const n=Math.max(1,Math.floor(e.width/1.9));for(let f=1;f<lot.floors;f++)lot.bays.push(Array.from({length:n},()=>({ac:r()<.6,acSide:r()<.5?-1:1,laundry:r()<.25})));}
   if(e.type==='T2')for(let f=1;f<lot.floors;f++)lot.bays.push([{balcony:r()<.5}]);
   if((e.type==='T1'||e.type==='T2')&&r()<.45)lot.sideAC=2+Math.floor(r()*4);
   lot.roofItems=roofRecipe(rng(e.seed+':roof'),lot,category);
   e.lot=lot;out.lots.push(lot);
  });
  // Touching neighbours along the street (0 where an alley, gap or parking breaks the wall).
  el.forEach((e,i)=>{if(e.kind!=='building')return;const L=el[i-1],R=el[i+1];e.lot.leftH=L?.kind==='building'?L.lot.height:0;e.lot.rightH=R?.kind==='building'?R.lot.height:0;});
  for(const e of el)if(e.kind==='spot'){
   const depth=e.vacant?5.4:e.spot==='alley'?4.6:4.8,frontZ=lotLine,z=frontZ-fz*depth/2;
   out.spots.push({id:`${d.id}:${s}:${e.spot}:${e.x.toFixed(2)}`,plotId:e.plotId||null,district:d.id,kind:e.spot,x:e.x,z,width:e.width,depth,front,frontZ,
    cars:e.cars||[],machines:e.machines||0,acSide:e.acSide||0,pole:!!e.pole,bays:e.spot==='coin-parking'?3:e.spot==='parking'?1:0});
  }
  out.sides.push({district:d.id,front,fill:streetFill(el,d),sequence:el.filter(e=>e.kind==='building').map(e=>e.lot)});
 }
 // Block interior: concrete with 3–6 low houses and one coin parking (brief 3.2).
 const slots=[];
 for(const s of [-1,1]){let x=d.x-EDGE+.2;const r=rng(`${d.id}:interior:${s}`);while(true){const w=between(r,3.4,4.8),gap=between(r,.6,2.4);if(x+w>d.x+EDGE-.2)break;slots.push({s,x:x+w/2,width:w});x+=w+gap;}}
 const order=slots.map(v=>({v,k:dr()})).sort((a,b)=>a.k-b.k).map(o=>o.v);
 const parking=order.shift(),houses=order.slice(0,3+Math.floor(dr()*4));
 if(parking){const front=parking.s<0?'-z':'+z',fz=fzOf(front),zc=d.z+parking.s*11.4;
  out.spots.push({id:`${d.id}:interior:parking`,plotId:null,district:d.id,kind:'coin-parking',x:parking.x,z:zc,width:Math.max(parking.width,4.2),depth:4.2,front,frontZ:zc+fz*2.1,cars:[0,1,2].filter(()=>dr()<.5),bays:3});}
 for(const h of houses){const r=rng(`${d.id}:house:${h.x.toFixed(2)}`),front=h.s<0?'-z':'+z',fz=fzOf(front),tile=r()<.7,type=tile?'T5':'T4';
  const depth=between(r,3.4,4.0),frontZ=d.z+h.s*(EDGE+.6)-fz*.8,floors=tile?2:2+Math.floor(r()*2),wall=tile?(r()<.5?'#6B5443':'#D9CDB4'):pick(r,WALLS);
  out.lots.push({id:`${d.id}:house:${h.x.toFixed(2)}`,plotId:null,district:d.id,role:'interior',user:false,building:null,x:h.x,z:frontZ-fz*depth/2,width:h.width,depth,setback:.8,front,frontZ,
   type,floors,height:heightFor(floors,type),eave:tile?GROUND+STOREY:undefined,wall,roof:pick(r,tile?TILE_ROOFS:ROOFS),shop:'house',stripe:null,awning:null,stair:false,gap:null,
   leftH:0,rightH:0,bays:[],sideAC:0,sideWindows:Math.floor(r()*2),roofItems:roofRecipe(r,{type,floors,width:h.width,depth},category)});}
}

let cacheKey=null,cache=null;
export function cityLayout(buildings=[]){
 const key=buildings.map(b=>`${b.plotId}|${b.type}|${b.color}`).sort().join(',');
 if(key===cacheKey)return cache;
 const out={lots:[],spots:[],sides:[]};
 for(const d of districts)layoutDistrict(d,buildings,out);
 cacheKey=key;cache=out;return out;
}
export function subLotsOf(plotId,buildings=[]){
 const L=cityLayout(buildings),lots=L.lots.filter(l=>l.plotId===plotId),spots=L.spots.filter(s=>s.plotId===plotId);
 return {front:frontFace(plotId),lots,spots,user:lots.find(l=>l.user)||null};
}
