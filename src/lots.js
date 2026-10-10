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
//    roofItems       [{kind:'bulkhead'|'tank'|'tankRound'|'condenser'|'cooling'|'antenna'|'billboard'|'garden'|'vent',
//                      u, v, w, d, h, color}]   u along +x, v toward the front, both from the footprint centre
//    bays            T3: per upper floor, [{ac, acSide:-1|1, laundry}] per 1.9 bay;  T2: per upper floor [{balcony}]
//    sideAC          number of AC units stacked on the exposed side wall (T1/T2)
//    sideWindows     0–2 small windows on the exposed side wall
//    leftH, rightH   heights of the touching neighbours along the street (0 = open)
//    slab            true on the one tall building of its district (HEIGHTS[class].slab floors, far row)
//    Wave 5A (skin5a; their own rng stream, nothing above changes):
//    facade          facades.js surface of the body: T1 tile/concrete/glass/brick, T2 tile/siding, T3 white tile/plaster,
//                    T4 plaster/wood/siding/metal, T5 wood/plaster, T6 white tile, T7 glass/concrete (dark walls → brick)
//    bayWindow       T2/T4 ≈ 20 %: {floor, w} a window box protruding 0.35 on one upper floor, else null
//    roofForm        'flat' | 'gable' (T5) | 'pent' (T4 tiled hisashi over the shop, ≈ 30 %) | 'mansard' (T4 ≥ 3 floors)
//    dish            flat roofs ≈ 18 %: {u, v, ry} a satellite dish, else null
//    laundryRoof     T2/T3/T4 flat roofs ≈ 22 %: {len} a laundry pole line across the back of the roof, else null }
//
// Spot (open ground, from cityLayout().spots): { id, plotId|null, district, kind:'alley'|'vending'|'parking'|
//    'coin-parking'|'shrine'|'park', x, z, width, depth, front, frontZ, bays?, cars? }   vacant plots → T8 coin parking or
//    shrine; in the third ring mostly a pocket park or shrine.
//
// frontFace(plotId) → '+z'|'-z'.  subLotsOf(plotId,buildings) → {front, lots, spots, user} for that plot.
import {cityPlots,districts,buildingColors,ROAD_Z,OUTER_DISTRICTS,outerPlots} from './city-state.js';
const plotsOf=d=>(d.ghost?outerPlots:cityPlots).filter(p=>p.district===d.id);
const OUTER_SET=new Set(OUTER_DISTRICTS.map(d=>d.id));

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
 shiba:'old',asakusa:'old',ueno:'old',sumida:'old',shimokitazawa:'old',
 // Third ring (wave 4A): low and old, two livelier sub-centres (Kichijoji, Gotanda).
 kichijoji:'neon',gotanda:'office',
 kiyosumi:'old',ryogoku:'old',oshiage:'old',yanaka:'old',sugamo:'old',kitasenju:'old',nippori:'old',tsukishima:'old',kagurazaka:'old',mejiro:'old',
 takadanobaba:'home',ogikubo:'home',kinshicho:'home',ochanomizu:'home',toyosu:'home',omotesando:'home',jiyugaoka:'home',sangenjaya:'home',
 aoyama:'home',shinbashi:'home',akasaka:'home',iidabashi:'home'};
// Type mix per character (which typologies a district builds) …
const PROFILE={
 neon:{mix:{T1:6,T4:2,T5:0,T3:2,T7:1}},
 office:{mix:{T1:3,T4:1,T5:0,T3:1.5,T7:4}},
 home:{mix:{T1:1,T4:3,T5:1.5,T3:4,T7:0}},
 old:{mix:{T1:.5,T4:4,T5:3,T3:1,T7:0}}};
// … and a height class per district (how tall it builds; wave 2B readability, real-13 grain): mostly low houses with
// exactly ONE slab per district on the far row, so streets and ground floors read from the camera.
export const HEIGHT_CLASS={shinjuku:'high',shibuya:'high',ginza:'high',shinagawa:'high',odaiba:'high',
 akihabara:'mid',roppongi:'mid',harajuku:'mid',nihonbashi:'mid',kanda:'mid',ikebukuro:'mid',kichijoji:'mid',gotanda:'mid'};
// The third ring: districts appended after the first 24 (city-state.js RING3). Low, more old houses, greener vacant plots.
const RING3_SET=new Set([...districts,...OUTER_DISTRICTS].filter(d=>d.ring>=3).map(d=>d.id));   // the outer ring is low too
export const isRing3=id=>RING3_SET.has(id);
export const HEIGHTS={low:{floors:[2,3],slab:[5,6]},mid:{floors:[3,5],slab:[7,7]},high:{floors:[4,7],slab:[8,9]}};
export const heightClass=districtId=>HEIGHT_CLASS[districtId]||'low';
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
function floorRange(type,cls){const [lo,hi]=HEIGHTS[cls].floors;
 if(type==='T5')return [2,2];if(type==='T6')return [1,1];if(type==='T4')return [2,3];
 if(type==='T7')return [Math.max(lo,5),Math.max(hi,5)];if(type==='T3')return [Math.max(lo,3),Math.max(hi,3)];
 return [lo,hi];}
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
 if(['T2','T3','T4'].includes(t)&&r()<.3)want.push({kind:'antenna',w:.8,d:.8,h:2,slots:['FL','FR','BR','BL']});
 if(t==='T3'&&r()<.15)want.push({kind:'garden',w:Math.min(1.6,W*.45),d:.9,h:.5,slots:['FL','FR']});
 // No safety rails (budget, wave 2B); low roofs (≤ 2 floors) need only one item.
 while(want.length<(lot.floors<=2?1:2))want.push({kind:'vent',w:.5+r()*.3,d:.5,h:.6,slots:['FR','BL','FL','BR']});
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

const FACADES={T1:[['tileWhite',3],['concrete',3],['glass',1.5],['tileBeige',2],['brick',1]],T2:[['tileBeige',5],['tileWhite',3],['siding',2],['brick',1]],
 T3:[['tileWhite',5.5],['plaster',4.5],['brick',1]],T4:[['plaster',4],['wood',2],['siding',2.5],['metal',1.5]],T5:[['wood',6],['plaster',4]],T6:[['tileWhite',1]],T7:[['glass',5],['concrete',5]]};
export function skin5a(lot){
 const r=rng(lot.id+':w5a'),t=lot.type,W=lot.width-.3,D=lot.depth-.3;
 lot.facade=pick(r,FACADES[t]||FACADES.T4);
 if(['#9A7A60','#76574A'].includes(lot.wall)&&['T1','T2','T3'].includes(t)&&r()<.6)lot.facade='brick';
 lot.bayWindow=(t==='T2'||t==='T4')&&lot.floors>=2&&lot.width>=1.7&&r()<.2?{floor:1+Math.floor(r()*(lot.floors-1)),w:Math.min(1.5,lot.width-.5)}:null;
 lot.roofForm=t==='T5'?'gable':t==='T4'&&!['house','pilotis'].includes(lot.shop)&&r()<.3?'pent':t==='T4'&&lot.floors>=3&&r()<.15?'mansard':'flat';
 const flat=t!=='T5';
 lot.dish=flat&&W>1.4&&r()<.18?{u:(r()-.5)*(W-1),v:(r()-.5)*(D-1),ry:r()*Math.PI*2}:null;
 lot.laundryRoof=flat&&['T2','T3','T4'].includes(t)&&W>1.4&&r()<.22?{len:Math.min(2.2,W-.6)}:null;
 return lot;
}

// Wave 5A: the vacant plot beside Tokyo Tower is a small park (city-green.js plants its trees).
export const TOWER_PARKS=['shiba-6'];
// Shrines (owner 2026-10-10: "too many in the same place, put a few around the city"): only districts on one diagonal of
// the grid (col + 2·row ≡ 2 mod 7 → 7 of 49) get one, on their first vacant plot (north row first, west to east).
export const shrineDistrict=d=>(((Math.round(d.x/29)+2*Math.round((d.z-2)/30))%7)+7)%7===2;
export function shrinePlot(d,buildings=[]){
 if(d.ghost||!shrineDistrict(d))return null;
 const q=cityPlots.filter(p=>p.district===d.id&&p.vacant&&!buildings.some(b=>b.plotId===p.id)).sort((a,b)=>(a.z<d.z?0:1)-(b.z<d.z?0:1)||a.x-b.x)[0];
 return q?q.id:null;
}
function sideElements(d,s,buildings){
 // s = -1: the row at d.z-6 (fronts face +z); s = 1: the row at d.z+6 (fronts face −z).
 const front=s<0?'+z':'-z',plots=plotsOf(d).filter(p=>s<0?p.z<d.z:p.z>d.z).sort((a,b)=>a.x-b.x);
 const el=[];
 plots.forEach((p,k)=>{
  const b=buildings.find(b=>b.plotId===p.id),r=rng(p.id+':split');
  if(p.vacant&&!b){const x=r(),kind=TOWER_PARKS.includes(p.id)?'park':shrinePlot(d,buildings)===p.id?'shrine':isRing3(d.id)?(x<.72?'park':'coin-parking'):'coin-parking';el.push({kind:'spot',spot:kind,plotId:p.id,x:p.x,width:5.8,vacant:true,cars:kind==='coin-parking'?[0,1,2].filter(()=>r()<.5):[]});}
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
 const cls=heightClass(d.id),classLo=HEIGHTS[cls].floors[0],ring3=isRing3(d.id);
 const konbini=hashString(d.id+':konbini')%2===0;
 for(const [si,{front,el}] of sides.entries()){
  const s=si?1:-1,fz=fzOf(front),lotLine=d.z-fz*LOT_LINE;
  // Corner fillers (open ground or the street end beside them): half become a 1-storey kiosk or, while the edge
  // stays ≥ 85 % building face, a vending gap.
  el.forEach((e,i)=>{if(e.kind!=='building'||e.role!=='filler')return;
   const r=rng(e.seed+':corner');if(el[i-1]?.kind==='building'&&el[i+1]?.kind==='building'||r()>=.5)return;
   if(r()<.4&&e.width>=1.8){e.kind='spot';e.spot='vending';e.machines=2;if(streetFill(el,d)>=.85)return;e.kind='building';delete e.spot;delete e.machines;}
   e.kiosk=true;e.shopForce=r()<.7?'glazed':'shutter';});
  const blds=el.filter(e=>e.kind==='building');
  // Pencils only where a lot is too narrow for anything else: fillers become shop-houses (T4) or, in low districts,
  // old houses (T5); narrow sub-lots in low districts are mostly shop-houses too. Target ≤ 25 % T2.
  for(const e of blds){
   const r=rng(e.seed+':type');
   if(e.user){const t=e.building.type;e.type=t==='project'?'T1':t==='studio'?'T4':'T3';e.fixed=t==='project'?6:t==='studio'?3:5;continue;}
   if(e.kiosk)e.type='T4';
   else if(e.role==='filler')e.type=cls==='low'?(r()<(ring3?.55:.3)&&e.width>=1.6?'T5':'T4'):r()<.5?'T4':'T2';
   else{e.type=chooseType(r,e.role==='sub'?e.width+JOINT:e.width,category);if(e.type==='T2'&&cls==='low'&&r()<.6)e.type='T4';
    if(ring3&&cls==='low'&&e.type!=='T5'&&e.width>=3.5&&r()<.35)e.type='T5';}
   if(e.type==='T7'&&cls==='low')e.type='T3';
  }
  if(konbini&&s===(hashString(d.id+':kside')&1?1:-1)){
   const c=blds.filter(e=>!e.user&&e.width>=3.5).sort((a,b)=>(b.type==='T3')-(a.type==='T3')||b.width-a.width)[0];
   if(c){if(c.type!=='T3')c.type='T6';c.shopForce='konbini';}
  }
  // One slab per district, on the far row (behind the street from the camera) and never on a user's plot.
  if(s<0){const taken=new Set(blds.filter(e=>e.user).map(e=>e.plotId));
   const c=blds.filter(e=>!e.user&&e.role==='sub'&&e.width>=2.5&&!taken.has(e.plotId)&&!e.shopForce);
   if(c.length){const e=c[Math.floor(dr()*c.length)],w=e.width+JOINT;e.slab=true;
    e.type=cls==='high'?(w>4.05?'T7':'T1'):cls==='mid'&&w>4.05&&category==='office'?'T7':w>=3.8?'T3':'T1';}}
  // Floors: base from the plot's height plus a hashed ±2, then no two touching neighbours alike.
  for(const e of blds){
   const p=e.plotId&&cityPlots.find(p=>p.id===e.plotId),r=rng(e.seed+':floors');
   let [lo,hi]=e.slab?HEIGHTS[cls].slab:floorRange(e.type,cls);
   if(e.kiosk)lo=hi=1;
   // The row nearest the camera (+z side of the street) stays ≤ the district minimum + 1, and 40 % of it drops to
   // 1–2 floors, so the street and the far ground floors read through it.
   else if(s>0&&!e.fixed){hi=Math.min(hi,classLo+1);lo=Math.min(lo,hi);
    if(e.type!=='T5'&&r()<.4){lo=1;hi=2;if(['T1','T2','T3','T7'].includes(e.type))e.type='T4';}}
   const t=p?Math.min(1,Math.max(0,(p.height-3)/13)):r(),u=Math.pow(.5*t+.5*rng(d.id+e.seed)(),1.5);
   e.range=[lo,hi];e.desired=e.fixed??Math.max(lo,Math.min(hi,Math.round(lo+(hi-lo)*u+Math.floor(r()*5)-2)));
   // Lots sharing a plot with the user's building stay at least two floors below it.
   const own=e.plotId&&!e.fixed&&blds.find(x=>x.fixed&&x.plotId===e.plotId);if(own){e.range=[Math.min(lo,Math.max(1,own.fixed-2)),Math.max(1,Math.min(hi,own.fixed-2))];e.desired=Math.min(e.desired,e.range[1]);e.ownCap=e.range[1];}
  }
  blds.forEach((e,i)=>{
   if(e.fixed){e.floors=e.fixed;return;}
   const prev=blds[i-1]?.floors,next=blds[i+1]?.fixed;
   const tryList=v=>v.filter(f=>f!==prev&&f!==next);
   const inRange=[];for(let f=e.range[0];f<=e.range[1];f++)inRange.push(f);
   inRange.sort((a,b)=>Math.abs(a-e.desired)-Math.abs(b-e.desired));
   let ok=tryList(inRange);
   if(!ok.length&&e.type==='T5'){e.type='T4';ok=tryList([3,2]);}
   if(!ok.length){const cap=Math.min(e.ownCap??9,e.slab?9:s>0?classLo+1:HEIGHTS[cls].floors[1]),alt=[e.desired+1,e.desired-1,e.desired+2,e.desired-2].filter(f=>f>=1&&f<=9);
    ok=tryList(alt.filter(f=>f<=cap));if(!ok.length)ok=tryList(alt);}
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
    stair:e.type==='T1'&&r()<.5,gap:e.gap||null,slab:!!e.slab,
    leftH:0,rightH:0,bays:[],sideAC:0,sideWindows:r()<.45?1:0};
   if(e.type==='T5')lot.eave=GROUND+STOREY;
   if(e.type==='T3'){const n=Math.max(1,Math.floor(e.width/1.9));for(let f=1;f<lot.floors;f++)lot.bays.push(Array.from({length:n},()=>({ac:r()<.6,acSide:r()<.5?-1:1,laundry:r()<.25})));}
   if(e.type==='T2')for(let f=1;f<lot.floors;f++)lot.bays.push([{balcony:r()<.5}]);
   // Side AC stacks: T1 2–4, pencils fewer and shorter (budget, wave 2B).
   if(e.type==='T1'&&r()<.45)lot.sideAC=2+Math.floor(r()*3);else if(e.type==='T2'&&r()<.25)lot.sideAC=1+Math.floor(r()*2);
   lot.roofItems=roofRecipe(rng(e.seed+':roof'),lot,category);skin5a(lot);
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
 // Block interior (brief 3.2; owner 2026-10-10 "too many empty strips"): a back lane runs along the row boundary
 // (city.js ground, z = d.z ± 15), and low houses face it from nearly every slot, with one coin parking and one or two
 // vacant lots. INNER is the lane's building line (lane half 1.5 + a 1.1 walk; faces at 12.4 after the 0.8 setback).
 const INNER=13.2,slots=[];
 for(const s of [-1,1]){let x=d.x-EDGE+.2;const r=rng(`${d.id}:interior:${s}`);while(true){const w=between(r,3.4,4.8),gap=between(r,.6,2.4);if(x+w>d.x+EDGE-.2)break;slots.push({s,x:x+w/2,width:w});x+=w+gap;}}
 const order=slots.map(v=>({v,k:dr()})).sort((a,b)=>a.k-b.k).map(o=>o.v);
 const parking=order.shift(),houses=order.slice(0,Math.max(3,order.length-1-Math.floor(dr()*2)));
 if(parking){const front=parking.s<0?'-z':'+z',fz=fzOf(front),zc=d.z+parking.s*11.4;
  out.spots.push({id:`${d.id}:interior:parking`,plotId:null,district:d.id,kind:'coin-parking',x:parking.x,z:zc,width:Math.max(parking.width,4.2),depth:4.2,front,frontZ:zc+fz*2.1,cars:[0,1,2].filter(()=>dr()<.5),bays:3});}
 for(const h of houses){const r=rng(`${d.id}:house:${h.x.toFixed(2)}`),front=h.s<0?'-z':'+z',fz=fzOf(front),tile=r()<.7,type=tile?'T5':'T4';
  // The Shuto expressway (landmarks.js) runs along the boundary between the second and third rows: houses there keep
  // the older, deeper setback so the deck (half 2.3 about z −44) never passes over a roof.
  const viaduct=(h.s>0&&d.z===ROAD_Z[1])||(h.s<0&&d.z===ROAD_Z[2]),line=viaduct?INNER-2.2:INNER;
  const depth=between(r,3.0,3.5),frontZ=d.z+h.s*line-fz*.8,floors=tile?2:2+Math.floor(r()*2),wall=tile?(r()<.5?'#6B5443':'#D9CDB4'):pick(r,WALLS);
  out.lots.push({id:`${d.id}:house:${h.x.toFixed(2)}`,plotId:null,district:d.id,role:'interior',user:false,building:null,x:h.x,z:frontZ-fz*depth/2,width:h.width,depth,setback:.8,front,frontZ,
   type,floors,height:heightFor(floors,type),eave:tile?GROUND+STOREY:undefined,wall,roof:pick(r,tile?TILE_ROOFS:ROOFS),shop:'house',stripe:null,awning:null,stair:false,gap:null,
   leftH:0,rightH:0,bays:[],sideAC:0,sideWindows:Math.floor(r()*2),roofItems:roofRecipe(r,{type,floors,width:h.width,depth},category)});skin5a(out.lots.at(-1));}
}

// Height a user lot shows for its building phase (city.js draws sites this tall): thinking = a 2 m hoarding, a site
// rises with progress (full at 65 %), anything else is the finished lot.
export function builtHeight(lot,b){
 if(!lot)return 0;if(b?.phase==='thinking')return 2;
 if(b?.phase==='scaffold'||b?.phase==='stopped')return Math.max(1.2,lot.height*Math.min(1,(Number(b.progress)||0)/.65));
 return lot.height;
}
let cacheKey=null,cache=null;
export function cityLayout(buildings=[]){
 const key=buildings.map(b=>`${b.plotId}|${b.type}|${b.color}`).sort().join(',');
 if(key===cacheKey)return cache;
 const out={lots:[],spots:[],sides:[]};
 for(const d of districts)layoutDistrict(d,buildings,out);
 for(const d of OUTER_DISTRICTS)layoutDistrict(d,buildings,out);
 for(const l of out.lots)if(OUTER_SET.has(l.district))l.ghost=true;
 for(const s of out.spots)if(OUTER_SET.has(s.district))s.ghost=true;
 for(const s of out.sides)if(OUTER_SET.has(s.district))s.ghost=true;
 cacheKey=key;cache=out;return out;
}
export function subLotsOf(plotId,buildings=[]){
 const L=cityLayout(buildings),lots=L.lots.filter(l=>l.plotId===plotId),spots=L.spots.filter(s=>s.plotId===plotId);
 return {front:frontFace(plotId),lots,spots,user:lots.find(l=>l.user)||null};
}
