import * as THREE from 'three';
import {toon,wallMaterial,night} from './toon.js';
import {windowMaterial,withNightLight} from './windows.js';
import {screenTexture,screenMesh,screenGeometry} from './desk.js';
import {streetPlan} from './city-street.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {facadeCode,facadeAttribute} from './facades.js';
// SUB-01's home block (art direction wave 5B): his 2-storey corner house set back 0.8 behind a block wall (real-12), cut
// away for the city's 40° camera, the lane with an Inari corner shrine (real-16) and the vending pair, and the three
// example places + Orange Apartments rebuilt as hand-placed variants of the city's typed facades (lots.js / city.js).
//
// The house: a double-height office (fukinuke) on the east, a loft bedroom over the kitchen/living on the west reached by an
// open stair; the back walls (north, west) are whole, the camera-side walls are cut at sill height with real frames,
// and the pent roof survives only as its back stub and the eave over the balcony (a section, not a lid).
//
// Draw calls: walls · props · glass (nightLight) · Kenney furniture merged into ONE vertex-coloured mesh · sign atlas ·
// monitor · glows (additive billboards: lamps, LEDs, bulbs). Pure plan + build; nothing here needs WebGL.
export const TOP=.135,F0=.335,STOREY0=2.9,F1=F0+STOREY0,EAVE=F1+2.5,RIDGE=6.2;
export const HOUSE={x0:-9.4,x1:-3.2,z0:-6.9,z1:-1.6};
export const OFFICE={x0:-6.4,x1:-3.2,z0:-6.9,z1:-1.6,level:0};
export const LIVING={x0:-9.4,x1:-6.4,z0:-6.9,z1:-1.6,level:0};
export const BEDROOM={x0:-9.4,x1:-6.4,z0:-6.9,z1:-1.6,level:1};
export const STAIR={x0:-6.4,x1:-5.6,zBottom:-1.95,zTop:-4.59};
export const LANDING={x0:-6.4,x1:-5.6,z0:-6.9,z1:-4.59};
export const LOT={x0:-9.63,x1:-2.3,z0:-7.3,z1:-.72};
export const GATE={x:-4.5,z:-.8,half:.7};
export const CHAIR={x:-4.5,z:-5.75,rot:Math.PI},BED={x:-8.75,z:-5.705,rot:0};
// Walker targets (world-sync.js HOME_DESK / HOME_BED): the chair, and the bedside upstairs.
export const DESK_POINT={x:CHAIR.x,z:CHAIR.z},BED_POINT={x:-7.75,z:-5.4};
const HUB={x:-4.5,z:-2.25},DOOR_OUT={x:-4.5,z:-1.2},GATE_OUT={x:-4.5,z:-.45};
const UP=[{x:-6,z:-1.8},{x:-6,z:-4.65},{x:-6,z:-5.3},{x:-6.9,z:-5.3}];
// Kenney room kit at the city character's scale: room.js's door rule (1.95) × 1.55/1.5 (SUB-01 is 1.55 here).
export const KIT_DOOR=1.95*1.55/1.5;
const C={ext:'#D9D1C2',frame:'#3E4447',plaster:'#EEE8DB',cut:'#4A3F38',wood:'#C9965E',woodDark:'#8E6A45',found:'#9C9A91',roof:'#4E5864',fascia:'#2F3437',
 block:'#9C9A91',cap:'#B4B1A7',concrete:'#A9A79D',red:'#C8452D',stone:'#9C998F',metal:'#B9C0C8',ac:'#E5E1D6',pipe:'#8D918C',sky:'#BFD6E0',green:'#6F8F5E',green2:'#8FA66B'};
const inBox=(p,b)=>p.x>=b.x0&&p.x<=b.x1&&p.z>=b.z0&&p.z<=b.z1;
export const inLot=p=>inBox(p,LOT);
export const inHouse=p=>inBox(p,HOUSE);

// ---------- pure: walking, floors, the mailbox ----------
// The walker (main.js) walks planRoute's street legs; inside the lot this re-routes them through the gate, the door,
// and (for the bed) up the stair. fromY says whether the walk starts upstairs.
export function homeRoute(points,fromY=F0){
 if(!Array.isArray(points)||points.length<2)return points;
 const a=points[0],b=points.at(-1),inA=inLot(a),inB=inLot(b),upA=inA&&fromY>F0+STOREY0/2,upB=inB&&inBox(b,BEDROOM);
 const down=upA?[...UP].reverse():[],up=upB?UP:[];let path;
 if(inA&&inB)path=[a,...down,HUB,...up,b];
 else if(inA){const rest=points.slice(1);rest[0]={x:GATE.x,z:rest[0].z};path=[a,...down,HUB,DOOR_OUT,GATE_OUT,...rest];}
 else if(inB){const head=points.slice(0,-1);if(head.length>1)head[head.length-1]={x:GATE.x,z:head.at(-1).z};else head.push({x:GATE.x,z:a.z});path=[...head,GATE_OUT,DOOR_OUT,HUB,...up,b];}
 else return points;
 return path.filter((p,i)=>i===0||Math.hypot(p.x-path[i-1].x,p.z-path[i-1].z)>1e-6);
}
// The character's height at (x,z), given its current height y (which floor it is on); null outside the lot.
export function floorAt(x,z,y=F0){
 if(!inLot({x,z}))return null;
 if(x>=STAIR.x0&&x<=STAIR.x1&&z<=STAIR.zBottom&&z>=STAIR.zTop)return F0+STOREY0*(STAIR.zBottom-z)/(STAIR.zBottom-STAIR.zTop);
 if(y>F0+STOREY0/2&&(inBox({x,z},BEDROOM)||inBox({x,z},LANDING)))return F1;
 return F0;
}
// The idea mailbox flag: up while an idea waits in 'submitted' (the server's world: SUB-01's own stage or any plot's).
export function mailboxFlag(world){
 if(world?.sub01?.stage==='submitted')return true;
 return (world?.plots||[]).some(p=>p?.project?.stage==='submitted');
}
// House lights from the brain: 'home' (lamps on at night), 'away' (one lamp), 'asleep' (only the nightlight).
export function lightsFor(state){return state==='asleep'?'asleep':state==='working'||state==='offline'?'away':'home';}
// What the monitor and the whiteboard show: the project he is on, else the most advanced public one, else nothing.
export function deskProject(world){
 const plots=world?.plots||[],s=world?.sub01,card=x=>x&&{slug:String(x.slug||''),name:String(x.name||'Untitled project'),ticker:String(x.ticker||'').replace(/^\$/,''),stage:String(x.stage||''),stageLabel:String(x.stageLabel||x.stage||''),progress:Math.max(0,Math.min(1,Number(x.progress)||0)),launched:!!x.launched};
 const cur=s?.plotId&&plots.find(p=>p.plotId===s.plotId)?.project;if(cur)return card(cur);
 const list=plots.map(p=>p?.project).filter(x=>x&&x.name&&x.name!=='Private project'&&x.stage!=='declined'&&x.stage!=='cancelled');
 list.sort((a,b)=>(!!a.launched-!!b.launched)||(Number(b.progress)||0)-(Number(a.progress)||0)||String(a.name).localeCompare(String(b.name)));
 return card(list[0])||null;
}

// ---------- pure: the plan ----------
// Furniture (Kenney room kit, room.js names): x,z centre, rot, y floor; `on` = sits on another piece's top.
export const FURNITURE=[
 // Office (ground floor, east)
 {item:'desk',x:-4.5,z:-6.43,rot:0,y:F0,room:'office'},
 {item:'computerScreen',x:-4.5,z:-6.62,rot:0,y:F0,on:'desk',room:'office',screen:true},
 {item:'computerKeyboard',x:-4.5,z:-6.28,rot:0,y:F0,on:'desk',room:'office'},
 {item:'computerMouse',x:-4.02,z:-6.26,rot:0,y:F0,on:'desk',room:'office'},
 {item:'lampRoundTable',x:-5.0,z:-6.62,rot:0,y:F0,on:'desk',room:'office'},
 {item:'plantSmall1',x:-3.92,z:-6.62,rot:0,y:F0,on:'desk',room:'office'},
 {item:'chairDesk',x:CHAIR.x,z:CHAIR.z,rot:CHAIR.rot,y:F0,room:'office',tint:{carpet:'#E0612A',metalMedium:'#2B2F33'}},
 {item:'bookcaseOpen',x:-5.86,z:-6.5,rot:0,y:F0,room:'office'},
 {item:'books',x:-5.98,z:-6.5,rot:0,y:F0+.43,room:'office'},{item:'books',x:-5.72,z:-6.52,rot:0,y:F0+.86,room:'office'},{item:'books',x:-6.0,z:-6.5,rot:0,y:F0+1.29,room:'office'},
 {item:'rugRectangle',x:-4.6,z:-4.15,rot:Math.PI/2,y:F0,room:'office',tint:{carpet:'#4F6A8C',carpetDarker:'#3C5270'}},
 {item:'speakerSmall',x:-3.55,z:-5.6,rot:-Math.PI/2,y:F0,room:'office'},
 // Kitchen / living (ground floor, west, under the loft)
 {item:'kitchenFridgeSmall',x:-8.98,z:-2.13,rot:Math.PI/2,y:F0,room:'living'},
 {item:'kitchenCoffeeMachine',x:-8.92,z:-2.95,rot:Math.PI/2,y:F0+.9,room:'living'},
 {item:'kitchenMicrowave',x:-8.95,z:-3.6,rot:Math.PI/2,y:F0+.9,room:'living'},
 {item:'rugRound',x:-7.55,z:-3.1,rot:0,y:F0,room:'living',tint:{carpet:'#C9A34E',carpetDarker:'#9C7C34'}},
 {item:'tableCoffee',x:-7.55,z:-3.1,rot:Math.PI/2,y:F0,room:'living'},
 {item:'laptop',x:-7.5,z:-3.35,rot:Math.PI/2,y:F0,on:'tableCoffee',room:'living'},
 {item:'washer',x:-8.95,z:-6.3,rot:Math.PI/2,y:F0,room:'living'},
 {item:'cardboardBoxClosed',x:-7.9,z:-6.5,rot:.2,y:F0,room:'living'},{item:'cardboardBoxClosed',x:-7.35,z:-6.52,rot:-.1,y:F0,room:'living'},
 // Loft bedroom (first floor, west)
 {item:'bedSingle',x:BED.x,z:BED.z,rot:BED.rot,y:F1,room:'bedroom',tint:{carpet:'#5E7A93'}},
 {item:'cabinetBedDrawerTable',x:-7.95,z:-6.55,rot:0,y:F1,room:'bedroom'},
 {item:'lampRoundTable',x:-7.95,z:-6.58,rot:0,y:F1,on:'cabinetBedDrawerTable',room:'bedroom'},
 {item:'bookcaseOpenLow',x:-7.1,z:-6.55,rot:0,y:F1,room:'bedroom'},
 {item:'rugDoormat',x:-7.75,z:-4.9,rot:Math.PI/2,y:F1,room:'bedroom',tint:{carpet:'#E8DCC8',carpetDarker:'#CDBFA8'}},
 {item:'pottedPlant',x:-6.85,z:-1.12,rot:0,y:F1,room:'balcony'},
];
// A box list helper: extents → {x,y,z,w,h,d,color}.
const ext=(x0,x1,y0,y1,z0,z1,color,o)=>({x:(x0+x1)/2,y:(y0+y1)/2,z:(z0+z1)/2,w:Math.abs(x1-x0),h:Math.abs(y1-y0),d:Math.abs(z1-z0),color,...o});
const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_v=new THREE.Vector3(),_s=new THREE.Vector3(),_up=new THREE.Vector3(0,1,0);
// A thin box from a to b (cables, rails, pipes).
function seg(a,b,t,color){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),len=d.length();
 _q.setFromUnitVectors(_up,d.normalize());return {m:new THREE.Matrix4().compose(A.add(B).multiplyScalar(.5),_q.clone(),new THREE.Vector3(t,len,t)),color,x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,z:(a[2]+b[2])/2};}
// A box sloped about x (pent roofs): its top edge runs from (z0,yTop0) to (z1,yTop1).
function slopeX(x0,x1,z0,y0,z1,y1,t,color){const a=Math.atan2(y0-y1,z1-z0),L=Math.hypot(z1-z0,y1-y0),cz=(z0+z1)/2,cy=(y0+y1)/2;
 return {x:(x0+x1)/2,y:cy-t/2*Math.cos(a),z:cz-t/2*Math.sin(a),w:x1-x0,h:t,d:L,rx:a,color};}
const roofY=z=>RIDGE+.12-(RIDGE-EAVE)/(HOUSE.z1-HOUSE.z0)*(z-HOUSE.z0);

// Sign atlas (1024²): [x,y,w,h] regions; `lit` quads keep their colour at night, the rest dim with the walls.
export const ATLAS={size:1024,whiteboard:[0,0,512,256],posterBot:[512,0,170,256],posterTower:[682,0,170,256],posterShip:[852,0,172,256],
 workshop:[0,256,512,96],studio:[512,256,512,96],marquee:[0,352,512,112],orange:[512,352,512,112],
 bladeArcade:[0,464,96,384],bladeStudio:[96,464,96,384],bladeOrange:[192,464,96,384],banner:[288,464,64,384],
 nameplate:[352,464,160,64],onair:[352,528,160,64],plaque:[352,592,96,128],vendA:[512,464,192,320],vendB:[704,464,192,320],banner2:[912,464,64,384]};

export function planHero(){
 const W=[],P=[],G=[],S=[],L=[],pools=[],picks=[];
 const w=(...a)=>W.push(ext(...a)),p=(...a)=>P.push(ext(...a)),g=(o,...a)=>G.push(ext(...a,o));
 const sign=(region,cx,cy,cz,sw,sh,face,lit=false)=>S.push({region,x:cx,y:cy,z:cz,w:sw,h:sh,face,lit});
 const glow=(x,y,z,size,color,kind,o={})=>L.push({x,y,z,size,color,kind,...o});
 // ----- ground: block base, street, sidewalks, the lane's edge lines, grates, a manhole
 p(-14,14,-.695,-.045,-11,15,C.block);p(-13.85,13.85,-.045,TOP,-10.85,14.85,C.concrete);
 p(-13.85,13.85,.1475,.1825,-.15,3.35,'#7A7F7C');p(-13.85,13.85,.1475,.2025,-.66,-.14,'#B4B1A7');p(-13.85,13.85,.1475,.2025,3.34,3.86,'#B4B1A7');
 for(const z of [.2,2.88])p(-13.85,13.85,.1825,.19,z,z+.12,'#E6E4DC');
 for(const x of [-7.8,1.2,9.5]){p(x-.3,x+.3,.1825,.188,-.12,.12,'#4B5153');for(const dz of [-.06,0,.06])p(x-.26,x+.26,.188,.19,dz-.012,dz+.012,'#2F3437');}
 // ----- SUB-01's lot: pad, block walls (front with the gate, east with the cat), the side passage
 p(LOT.x0,LOT.x1,TOP,.3,LOT.z0,LOT.z1,C.concrete);
 const bw=(x0,x1,z0,z1)=>{p(x0,x1,.3,1.4,z0,z1,C.block);p(x0-.02,x1+.02,1.4,1.46,z0-.02,z1+.02,C.cap);};
 bw(-9.63,-5.4,-.88,-.72);bw(-3.6,-2.3,-.88,-.72);bw(-2.38,-2.22,-7.3,-.88);bw(-9.71,-9.55,-7.3,-.88);
 for(const y of [.55,.8,1.05,1.3]){p(-9.63,-5.4,y,y+.02,-.71,-.7,'#87857D');p(-3.6,-2.3,y,y+.02,-.71,-.7,'#87857D');p(-2.21,-2.2,y,y+.02,-7.3,-.88,'#87857D');}
 for(const [x0,x1] of [[-5.4,-5.1],[-3.9,-3.6]]){p(x0,x1,.3,1.62,-.92,-.68,C.cap);p(x0-.03,x1+.03,1.62,1.7,-.95,-.65,'#8E8C84');}
 // Sliding gate, slid open behind the east segment; its track across the opening.
 p(-5.1,-3.9,.3,.31,-.82,-.78,'#5B6466');
 for(const [x0,x1,y0,y1] of [[-3.75,-2.45,.36,.4],[-3.75,-2.45,1.3,1.34],[-3.75,-3.71,.36,1.34],[-2.49,-2.45,.36,1.34]])p(x0,x1,y0,y1,-1.0,-.96,C.frame);
 for(let x=-3.55;x<-2.5;x+=.2)p(x-.012,x+.012,.4,1.3,-.99,-.97,C.frame);
 // The idea mailbox on the west gate pillar (its flag is the dynamic piece below), the nameplate.
 p(-5.45,-5.05,1.0,1.32,-.68,-.48,'#3E4A48');p(-5.4,-5.1,1.22,1.25,-.481,-.47,'#FB752B');
 sign('nameplate',-5.25,.85,-.67,.28,.11,'+z');
 // Stepping stones, the shoe-off stone, a strip garden along the house front, planters on the sidewalk.
 p(-4.8,-4.2,.3,.33,-1.18,-.96,'#8E8C84');p(-4.95,-4.05,.3,.335,-1.5,-1.24,'#8E8C84');
 [[-9.15,-1.3],[-8.55,-1.25],[-7.8,-1.32],[-7.2,-1.27],[-6.6,-1.3]].forEach(([x,z],i)=>{p(x-.22,x+.22,.3,.42+.06*(i%2),z-.18,z+.18,i%2?C.green:C.green2,{ry:i*.5});});
 [[-9.3,-.5],[-8.75,-.48],[-8.2,-.5],[-7.65,-.47],[-7.1,-.5],[-3.35,-.48],[-2.8,-.5]].forEach(([x,z],i)=>{const h=.22+.07*(i%3);
  p(x-.16,x+.16,.2025,.2025+h,z-.14,z+.14,['#9A7A60','#B9C6C4','#7D8B8E'][i%3]);P.push({...ext(x-.22,x+.22,.2025+h,.2025+h+.3,z-.2,z+.2,i%2?C.green:C.green2),ry:i*.7});P.push({...ext(x-.12,x+.16,.2025+h+.2,.2025+h+.42,z-.15,z+.1,'#7A955F'),ry:i*.3});});
 // A bicycle in the side passage mouth (along z), the AC outdoor units, a meter box, the cat on the wall.
 const bike=(bx,bz)=>{for(const dz of [-.46,.46])for(const r of [0,Math.PI/4])P.push({...ext(bx-.02,bx+.02,.3,.9,bz+dz-.3,bz+dz+.3,'#2B2B2B'),rx:r});
  p(bx-.025,bx+.025,.78,.83,bz-.45,bz+.45,'#E0612A');p(bx-.025,bx+.025,.6,1.08,bz-.2,bz-.15,'#E0612A');p(bx-.06,bx+.06,1.08,1.12,bz-.29,bz-.11,'#2B2B2B');
  p(bx-.025,bx+.025,.8,1.22,bz+.38,bz+.43,'#5B6466');p(bx-.25,bx+.25,1.2,1.24,bz+.38,bz+.43,'#5B6466');p(bx-.13,bx+.13,.92,1.08,bz+.5,bz+.74,'#7D8B8E');};
 bike(-2.8,-1.45);
 const acUnit=(x0,x1,y0,z0,z1)=>{p(x0,x1,y0,y0+.55,z0,z1,C.ac);p(x0-.01,x1+.01,y0+.12,y0+.45,(z0+z1)/2-.18,(z0+z1)/2+.18,'#5B6466');p(x0,x1,y0+.55,y0+.58,z0,z1,'#CFCBC0');};
 acUnit(-3.1,-2.55,.3,-5.1,-4.3);p(-3.18,-3.08,.3,1.05,-4.75,-4.6,'#D9D3C3');
 acUnit(-3.1,-2.55,.3,-6.6,-5.8);p(-3.18,-3.08,.3,1.05,-6.25,-6.1,'#D9D3C3');
 p(-3.2,-3.12,.9,1.25,-3.0,-2.75,'#CFCBC0');
 {const cx=-2.3,cy=1.46,cz=-3.4,cat='#D9893E';p(cx-.07,cx+.07,cy,cy+.13,cz-.17,cz+.15,cat);p(cx-.065,cx+.065,cy+.06,cy+.18,cz+.13,cz+.26,cat);
  for(const s of [-1,1])p(cx+s*.045-.02,cx+s*.045+.02,cy+.18,cy+.23,cz+.18,cz+.22,'#B86E2E');p(cx+.07,cx+.1,cy-.3,cy+.02,cz-.15,cz-.12,cat);p(cx-.068,cx+.068,cy+.04,cy+.09,cz-.05,cz+.02,'#F2EEE6');
  for(const s of [-1,1])glow(cx+s*.03,cy+.14,cz+.265,.07,'#9BFF7A','eyes');}
 // ----- the house: foundation, floors, walls, frames
 const H=HOUSE;w(H.x0-.05,H.x1+.05,TOP,.3,H.z0-.05,H.z1+.05,C.found);
 p(H.x0,H.x1,.3,F0,H.z0,H.z1,C.wood);
 for(let x=H.x0+.45;x<H.x1-.1;x+=.45)p(x,x+.014,F0,F0+.002,H.z0+.16,H.z1-.16,'#A9794A');
 w(H.x0,H.x1,F0,RIDGE,H.z0,H.z0+.16,C.plaster);                       // north wall (the big interior canvas)
 w(H.x0,H.x0+.16,F0,EAVE,H.z0,H.z1,C.plaster);                        // west wall
 W.push(slopeX(H.x0+.01,H.x0+.15,H.z0,RIDGE,H.z1,EAVE,.7,C.plaster)); // its gable strip under the pent roof
 p(H.x0-.02,H.x1+.02,F0,F0+.1,H.z0+.16,H.z0+.18,'#D8CFBF');p(H.x0+.16,H.x0+.18,F0,F0+.1,H.z0,H.z1,'#D8CFBF');   // skirting
 // South (camera) side, cut at the frames: west block low wall + window frame, the office's sliding doors (open at the gate line).
 w(H.x0,-6.4,F0,F0+.9,H.z1-.16,H.z1,C.ext);p(H.x0-.01,-6.39,F0+.9,F0+.95,H.z1-.2,H.z1+.03,C.frame);
 w(H.x0,-6.4,F0+2.25,F1-.22,H.z1-.16,H.z1,C.ext);
 for(const x of [H.x0,-7.9,-6.48])p(x,x+.08,F0+.95,F0+2.25,H.z1-.12,H.z1-.02,C.frame);
 p(H.x0,H.x1,F0+2.17,F0+2.27,H.z1-.14,H.z1,C.frame);
 for(const x of [-5.68,H.x1-.08])p(x,x+.08,F0,F0+2.25,H.z1-.12,H.z1-.02,C.frame);
 for(const [x0,x1,z] of [[-4.0,-3.26,-1.66],[-3.95,-3.22,-1.74]]){for(const [a,b,y0,y1] of [[x0,x1,F0+.03,F0+.08],[x0,x1,F0+2.1,F0+2.15],[x0,x0+.05,F0,F0+2.15],[x1-.05,x1,F0,F0+2.15]])p(a,b,y0,y1,z-.025,z+.025,C.frame);}
 for(const [a,b,y0,y1] of [[-6.4,-5.68,F0+.03,F0+.08],[-6.4,-5.68,F0+1.05,F0+1.09]])p(a,b,y0,y1,H.z1-.09,H.z1-.05,C.frame);
 p(-5.3,-3.7,F0,F0+.01,H.z1-.12,H.z1,'#5B6466');   // door track
 // East (camera) side, cut at the sill: low wall, aluminium sill, three frame posts and the head.
 w(H.x1-.16,H.x1,F0,F0+1.0,H.z0+.16,H.z1-.16,C.ext);p(H.x1-.2,H.x1+.03,F0+1.0,F0+1.05,H.z0+.1,H.z1-.1,C.frame);
 for(const z of [-6.0,-4.25,-2.5])p(H.x1-.12,H.x1-.02,F0+1.05,F0+2.25,z-.04,z+.04,C.frame);p(H.x1-.14,H.x1,F0+2.17,F0+2.27,-6.04,-2.46,C.frame);
 // Loft: floor slab with its cut edge, planks, the landing over the bookcase, railings, the stair.
 p(H.x0+.16,-6.4,F1-.22,F1-.02,H.z0+.16,H.z1,C.cut);p(H.x0+.16,-6.4,F1-.02,F1,H.z0+.16,H.z1,C.wood);
 p(LANDING.x0,LANDING.x1,F1-.22,F1-.02,LANDING.z0+.16,LANDING.z1,C.cut);p(LANDING.x0,LANDING.x1,F1-.02,F1,LANDING.z0+.16,LANDING.z1,C.wood);
 for(let x=H.x0+.6;x<-6.5;x+=.45)p(x,x+.014,F1,F1+.002,H.z0+.2,H.z1-.05,'#A9794A');
 const rail=(x0,x1,z0,z1,n)=>{p(x0,x1,F1+.95,F1+1.0,z0,z1,C.woodDark);const along=Math.abs(x1-x0)>Math.abs(z1-z0);
  for(let i=0;i<=n;i++){const t=i/n,x=x0+(x1-x0)*t,z=z0+(z1-z0)*t;p(x-.02,x+.02,F1,F1+.95,z-.02,z+.02,C.woodDark);}if(along)return;};
 rail(-6.44,-6.4,-4.59,H.z1,8);rail(-5.64,-5.6,LANDING.z0+.16,LANDING.z1,5);
 const n=12,rise=STOREY0/n,run=(STAIR.zBottom-STAIR.zTop)/(n-1);
 for(let i=1;i<n;i++){const z1=STAIR.zBottom-(i-1)*run,z0=z1-run;p(STAIR.x0+.04,STAIR.x1,F0+i*rise-.05,F0+i*rise,z0,z1+.02,C.woodDark);}
 P.push(seg([STAIR.x1-.03,F0+.1,STAIR.zBottom+.05],[STAIR.x1-.03,F1-.1,STAIR.zTop],.07,C.woodDark));
 P.push(seg([STAIR.x1-.02,F0+.95,STAIR.zBottom],[STAIR.x1-.02,F1+1.0,STAIR.zTop],.04,'#3E4447'));
 for(const z of [STAIR.zBottom,STAIR.zTop])p(STAIR.x1-.04,STAIR.x1,F0+(z===STAIR.zTop?STOREY0:0),F0+(z===STAIR.zTop?STOREY0:0)+.98,z-.02,z+.02,'#3E4447');
 // Loft south: balcony doors (frames), the wall strip under the eave, the balcony with railing, laundry and its AC unit.
 for(const x of [H.x0,-7.9,-6.48])p(x,x+.08,F1,F1+2.0,H.z1-.12,H.z1-.02,C.frame);p(H.x0,-6.4,F1+1.95,F1+2.05,H.z1-.14,H.z1,C.frame);
 w(H.x0,-6.4,F1+2.05,EAVE,H.z1-.16,H.z1,C.ext);
 p(-9.3,-6.5,F1-.2,F1,H.z1,-.85,C.ext);p(-9.3,-6.5,F1-.22,F1-.2,H.z1,-.83,C.cut);
 p(-9.3,-6.5,F1+.95,F1+1.0,-.93,-.87,C.frame);p(-9.3,-6.5,F1+.06,F1+.1,-.92,-.88,C.frame);
 for(let x=-9.25;x<-6.5;x+=.25)p(x-.015,x+.015,F1+.1,F1+.95,-.915,-.885,C.frame);
 for(const x of [-9.3,-6.54])p(x,x+.04,F1+.95,F1+1.0,H.z1,-.87,C.frame);
 p(-9.25,-6.55,F1+1.72,F1+1.76,-1.12,-1.08,C.metal);for(const x of [-9.25,-6.59])p(x,x+.04,F1+1.72,F1+1.76,H.z1,-1.08,C.metal);
 [[-8.9,.5,.62,'#F2EEE6'],[-8.25,.46,.55,'#7FA3C8'],[-7.7,.38,.42,'#E0612A'],[-7.3,.2,.22,'#F2EEE6'],[-7.05,.2,.22,'#3E4447']].forEach(([x,ww,hh,c])=>p(x-ww/2,x+ww/2,F1+1.72-hh,F1+1.72,-1.115,-1.085,c));
 acUnit(-9.25,-8.6,F1,H.z1+.08,H.z1+.42);
 // Drainpipe at the south-west corner, gutters, the AC indoor unit and the bedroom window with curtains.
 p(H.x0-.08,H.x0,.3,EAVE+.05,H.z1-.06,H.z1+.02,C.pipe);p(H.x1-.02,H.x1+.06,.3,RIDGE,H.z0-.08,H.z0,C.pipe);
 p(-8.2,-7.3,F1+1.95,F1+2.25,H.z0+.16,H.z0+.38,'#F2F0EA');p(-8.15,-7.35,F1+1.98,F1+2.0,H.z0+.38,H.z0+.39,'#C9CCC6');
 {const x=H.x0+.16,z0=-4.1,z1=-2.7,y0=F1+.8,y1=F1+2.0;p(x,x+.02,y0,y1,z0,z1,C.sky);
  for(const [a,b,c,d] of [[y0-.05,y0,z0,z1],[y1,y1+.05,z0,z1],[y0,y1,z0-.05,z0],[y0,y1,z1,z1+.05],[y0,y1,(z0+z1)/2-.02,(z0+z1)/2+.02]])p(x,x+.04,a,b,c,d,C.frame);
  p(x+.03,x+.09,y0-.1,y1+.12,z0-.3,z0+.08,'#EFE6D6');p(x+.03,x+.09,y0-.1,y1+.12,z1-.08,z1+.3,'#EFE6D6');p(x+.08,x+.11,y1+.14,y1+.17,z0-.4,z1+.4,C.woodDark);}
 // Roof: the back stub (pent, sloping to the south) and the eave over the balcony; barge boards; the front gutter.
 W.push(slopeX(H.x0-.45,H.x1+.4,H.z0-.45,roofY(H.z0-.45),-5.95,roofY(-5.95),.12,C.roof));
 W.push(slopeX(H.x0-.45,-6.3,-2.6,roofY(-2.6),-.65,roofY(-.65),.12,C.roof));
 P.push(slopeX(H.x1+.38,H.x1+.44,H.z0-.45,roofY(H.z0-.45)+.04,-5.95,roofY(-5.95)+.04,.22,C.fascia));
 P.push(slopeX(-6.32,-6.26,-2.6,roofY(-2.6)+.04,-.65,roofY(-.65)+.04,.22,C.fascia));
 p(H.x0-.45,-6.3,roofY(-.65)-.2,roofY(-.65)-.08,-.67,-.57,C.pipe);
 // ----- interior props: server rack, kitchen counter, cushions, whiteboard frame, clerestory window, cables
 {const x0=-3.78,x1=-3.32,z0=-6.74,z1=-6.14;p(x0,x1,F0,F0+1.25,z0,z1,'#2A2E33');for(let k=0;k<5;k++)p(x0+.03,x1-.03,F0+.12+k*.22,F0+.3+k*.22,z1,z1+.01,'#3A4046');
  const leds=['#5BFF8A','#5BFF8A','#FFB347','#5BC8FF','#5BFF8A','#FF5B5B'];for(let k=0;k<12;k++)glow(x0+.08+(k%3)*.05,F0+.24+Math.floor(k/3)*.22+.04,z1+.015,.05,leds[k%leds.length],'led',{phase:k*1.7});
  p(-4.0,-3.78,F0,F0+.01,-6.3,-6.26,'#22252a');}
 p(-9.24,-8.64,F0,F0+.86,-4.0,-2.6,'#E8E4DA');p(-9.26,-8.6,F0+.86,F0+.9,-4.02,-2.58,'#7D8B8E');p(-9.1,-8.78,F0+.89,F0+.905,-3.3,-3.05,'#B9C0C8');
 p(-9.24,-8.94,F0+1.5,F0+2.1,-4.0,-2.6,'#E8E4DA');p(-8.95,-8.93,F0+1.55,F0+2.05,-3.32,-3.28,'#9C998F');
 for(const z of [-3.1]) for(const x of [-8.15,-6.95])p(x-.22,x+.22,F0,F0+.07,z-.22,z+.22,'#E0612A');
 p(-5.25,-3.75,F0+1.6,F0+2.55,H.z0+.16,H.z0+.19,'#C9CCC6');sign('whiteboard',-4.5,F0+2.075,H.z0+.196,1.36,.83,'+z');
 p(-5.0,-4.0,F0+1.52,F0+1.56,H.z0+.16,H.z0+.24,'#9C998F');
 {const x0=-5.8,x1=-3.6,y0=F0+4.3,y1=F0+5.2,z=H.z0+.16;p(x0,x1,y0,y1,z,z+.02,C.sky);for(const [a,b,c,d] of [[x0,x1,y0-.05,y0],[x0,x1,y1,y1+.05],[x0-.05,x0,y0,y1],[x1,x1+.05,y0,y1],[-4.72,-4.68,y0,y1]])p(a,b,c,d,z,z+.05,C.frame);}
 sign('posterBot',-3.62,F0+2.4,H.z0+.17,.5,.75,'+z');sign('posterTower',-4.5,F0+3.55,H.z0+.17,.8,1.2,'+z');sign('posterShip',-7.65,F1+1.45,H.z0+.17,.55,.82,'+z');
 // ----- shrine corner (real-16): gravel, kerb, three torii, the hokora with rope, foxes, nobori, a stone lantern
 p(-13.95,-11.65,TOP,.2,-6.6,-.72,'#C9C3B4');p(-13.0,-12.4,.2,.215,-6.0,-.72,C.stone);
 p(-13.95,-13.05,.2,.45,-.84,-.72,'#8E8C84');p(-12.35,-11.65,.2,.45,-.84,-.72,'#8E8C84');
 [[-1.25,1],[-2.05,.92],[-2.8,.85]].forEach(([z,s],i)=>{const cx=-12.7,h=2.1*s;
  for(const sx of [-1,1]){const x=cx+sx*.62*s;p(x-.065*s,x+.065*s,.2,.2+h,z-.065*s,z+.065*s,C.red);p(x-.08*s,x+.08*s,.2,.35,z-.08*s,z+.08*s,'#2B2B2B');}
  p(cx-.97*s,cx+.97*s,.2+h,.2+h+.11*s,z-.1*s,z+.1*s,'#2B2B2B');p(cx-.9*s,cx+.9*s,.2+h-.1*s,.2+h,z-.08*s,z+.08*s,C.red);
  p(cx-.8*s,cx+.8*s,.2+h-.58*s,.2+h-.47*s,z-.05*s,z+.05*s,C.red);
  if(!i){p(cx-.06,cx+.06,.2+h-.47,.2+h-.1,z-.05,z+.05,C.red);sign('plaque',cx,.2+h-.29,z+.07,.2,.27,'+z');}});
 p(-13.25,-12.15,.2,.75,-4.85,-3.75,C.stone);p(-13.1,-12.3,.75,1.5,-4.75,-3.95,'#A8784C');p(-12.95,-12.45,.85,1.4,-3.96,-3.93,C.red);p(-12.72,-12.68,.85,1.4,-3.93,-3.91,'#E3BE3C');
 {const rz=-4.35,ry=1.83;P.push({x:-12.7,y:ry-.168,z:rz+.307,w:1.3,h:.06,d:.72,rx:.5,color:'#3E4246'},{x:-12.7,y:ry-.168,z:rz-.307,w:1.3,h:.06,d:.72,rx:-.5,color:'#3E4246'});p(-13.38,-12.02,ry-.02,ry+.05,rz-.04,rz+.04,'#2B2B2B');}
 p(-13.08,-12.32,1.46,1.52,-3.92,-3.86,'#D8C58A');for(const x of [-12.92,-12.48])p(x-.03,x+.03,1.26,1.46,-3.9,-3.88,'#F7F5EE');
 p(-12.95,-12.45,.2,.55,-3.6,-3.3,'#7A5A3C');for(const z of [-3.52,-3.45,-3.38])p(-12.95,-12.45,.55,.57,z-.012,z+.012,'#4A3A2E');
 for(const x of [-13.4,-12.0]){const z=-3.55,f='#ECE8DE';p(x-.17,x+.17,.2,.75,z-.17,z+.17,C.stone);p(x-.08,x+.08,.75,1.05,z-.12,z+.08,f);
  p(x-.07,x+.07,1.05,1.19,z-.02,z+.12,f);p(x-.03,x+.03,1.07,1.12,z+.12,z+.18,f);for(const s of [-1,1])p(x+s*.045-.018,x+s*.045+.018,1.19,1.27,z+.02,z+.06,f);
  p(x-.085,x+.085,.93,1.0,z+.07,z+.1,C.red);P.push({...ext(x-.04,x+.04,.85,1.2,z-.18,z-.1,f),rx:-.35});}
 for(const [x,reg] of [[-13.8,'banner'],[-11.78,'banner2']]){p(x-.025,x+.025,.2,2.65,-1.02,-.98,C.metal);p(x,x+.36*(x<-12.7?1:-1),2.5,2.53,-1.01,-.99,C.metal);
  sign(reg,x+.18*(x<-12.7?1:-1),1.68,-.975,.3,1.6,'+z',true);}
 {const x=-11.95,z=-1.95;p(x-.2,x+.2,.2,.32,z-.2,z+.2,C.stone);p(x-.07,x+.07,.32,.85,z-.07,z+.07,C.stone);p(x-.18,x+.18,.85,.92,z-.18,z+.18,C.stone);
  p(x-.13,x+.13,.92,1.18,z-.13,z+.13,'#E9D7A8');p(x-.22,x+.22,1.18,1.26,z-.22,z+.22,C.stone);p(x-.08,x+.08,1.26,1.36,z-.08,z+.08,C.stone);
  glow(x,1.05,z,.9,'#FFB066','lantern');pools.push([x,z,'#FFB066',1.9,.5,.21]);}
 p(-13.27,-13.13,1.12,1.4,-3.81,-3.67,'#D2463C');glow(-13.2,1.26,-3.7,.6,'#FF7A4A','lantern');
 // ----- vending pair on the lane, a utility pole with a sodium lamp (cables to the city's poles, a drop to the house)
 p(-11.6,-9.75,TOP,.2,-1.6,-.72,'#B4B1A7');
 [[-10.2,'#EDEDE8','vendA'],[-11.12,'#C63B34','vendB']].forEach(([x,col,reg])=>{p(x-.43,x+.43,.2,1.95,-1.5,-.86,col);p(x-.36,x+.36,.38,.55,-.86,-.84,'#3B4245');
  p(x+.2,x+.3,.95,1.12,-.86,-.84,'#5B6466');sign(reg,x,1.32,-.855,.72,1.1,'+z',true);p(x-.44,x+.44,1.95,2.0,-1.52,-.84,'#CFCBC0');
  glow(x,1.3,-.6,1.1,'#EAF4FF','vending');});
 pools.push([-10.65,-.3,'#EAF4FF',1.7,.5,.21]);
 {const x=-11.6,z=-.45;p(x-.12,x+.12,.2025,9.7,z-.12,z+.12,'#B7B4AA');for(const y of [9.0,8.1])p(x-.05,x+.05,y,y+.1,z-.65,z+.65,'#5B6466');
  p(x-.2,x+.2,7.2,7.8,z+.12,z+.5,'#9AA3A8');p(x-.14,x+.14,.2025,2.2,z-.14,z+.14,'#E3BE3C');for(const y of [.6,1.2,1.8])p(x-.145,x+.145,y,y+.2,z-.145,z+.145,'#2B2B2B');
  P.push(seg([x,6.0,z+.12],[x,6.25,z+1.0],.06,'#5B6466'));p(x-.11,x+.11,6.1,6.2,z+.85,z+1.15,'#3E4447');glow(x,6.05,z+1.0,.8,'#FF9E48','sodium');pools.push([x,z+1.2,'#FF9E48',3.2,.7,.235]);
  const city=streetPlan().poles.filter(q=>q.c===2&&Math.abs(q.x)<20).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x))[0];
  if(city)for(const [y,off] of [[9.05,-.5],[9.05,.5],[8.15,-.42]]){const a=[x,y,z+off],b=[city.x,y+.6,city.z+off],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2-.35,(a[2]+b[2])/2];P.push(seg(a,mid,.025,'#2D3134'),seg(mid,b,.025,'#2D3134'));}
  const a=[x,7.5,z-.1],b=[H.x0-.05,EAVE-.2,-3.0],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2-.3,(a[2]+b[2])/2];P.push(seg(a,mid,.022,'#2D3134'),seg(mid,b,.022,'#2D3134'));p(H.x0-.1,H.x0,EAVE-.35,EAVE-.15,-3.06,-2.94,'#5B6466');}
 // ----- house lights (dynamic glows; floor pools are added by build() from lightsFor())
 glow(-5.0,F0+.74+.5,-6.62,.9,'#FFD08A','desk');glow(-4.5,F0+.74+.32,-6.45,1.2,'#8FB8FF','monitor');
 glow(-7.95,F1+.51+.45,-6.58,.55,'#FFB870','nightstand');glow(-7.0,F1+.14,H.z0+.2,.22,'#FFB870','nightlight');
 // ----- the example places and Orange Apartments (typed facades: ground 3.0, storeys 2.5, parapet 0.6)
 const ex=examples();W.push(...ex.W);P.push(...ex.P);G.push(...ex.G);S.push(...ex.S);L.push(...ex.L);pools.push(...ex.pools);
 picks.push({id:'home',...ext(LOT.x0,LOT.x1,TOP,RIDGE,LOT.z0,LOT.z1)},...ex.picks);
 return {walls:W,props:P,glass:G,signs:S,glows:L,pools,picks,labels:{home:RIDGE+.9,...ex.labels},flag:{x:-5.03,y:1.2,z:-.58}};
}
// Hand-placed hero variants of lots.js typologies. Front `fz`: +1 faces +z (north row), −1 faces −z (south row).
// Backs of the south row face the camera, so that is where the life is: balconies, the arcade's fire stair, the booth.
const GLASS_LOW='#3D525B',GLASS_HIGH='#5E7881';
export const EXAMPLES={
 lab:{type:'T4',x:3.4,frontZ:-1.7,fz:1,w:5.0,d:4.8,floors:2,wall:'#C9B79A',band:'#DCCDB4',roof:'#7C8A80'},
 arcade:{type:'T1',x:8.0,frontZ:4.35,fz:-1,w:4.2,d:5.0,floors:3,wall:'#3E3A4A',band:'#565068',roof:'#5B5F66'},
 studio:{type:'T4',x:-3.5,frontZ:4.35,fz:-1,w:4.6,d:5.0,floors:2,wall:'#8990BB',band:'#A3A9CC',roof:'#6F7480'},
 residence:{type:'T3',x:-10.5,frontZ:4.5,fz:-1,w:5.6,d:5.0,floors:3,wall:'#EAC09B',band:'#F2D2B4',roof:'#7C8A80'},
};
export const heightOf=e=>3+2.5*(e.floors-1)+.6;
function examples(){
 const W=[],P=[],G=[],S=[],L=[],pools=[],picks=[],labels={};
 for(const [id,e] of Object.entries(EXAMPLES)){
  const H=heightOf(e),fz=e.fz,half=e.w/2,zf=v=>e.frontZ+fz*v,back=-e.d;
  // F(list, u0,u1, y0,y1, v0,v1): u along x from the centre, v outward from the front face (negative = into the building).
  const F=(list,u0,u1,y0,y1,v0,v1,color,o)=>{const za=zf(v0),zb=zf(v1);list.push(ext(e.x+u0,e.x+u1,TOP+y0,TOP+y1,Math.min(za,zb),Math.max(za,zb),color,o));};
  const sx=1,side=e.x+half;   // the exposed east side (camera side)
  const facing=fz>0?'+z':'-z',backFace=fz>0?'-z':'+z';
  const sgn=(region,u,y,v,sw,sh,face,lit=true)=>S.push({region,x:e.x+u,y:TOP+y,z:zf(v),w:sw,h:sh,face,lit});
  const glass=(u0,u1,y0,y1,v0,v1,c,lit)=>F(G,u0,u1,y0,y1,v0,v1,c,lit?{light:lit}:undefined);
  const band=tint(e.wall,.14);
  if(id==='lab'){
   // T4 shop-house: the upper body over a recessed ground-floor bay with the roll-up shutter half up.
   F(W,-half,half,3,H,back,0,e.wall);F(W,-half,half,0,3,back,-1.3,e.wall);F(W,-half,-half+.25,0,3,-1.3,0,e.wall);F(W,half-.25,half,0,3,-1.3,0,e.wall);
   F(P,-half+.25,half-.25,0,.04,-1.3,0,'#8E8C84');F(P,-half+.25,half-.25,0,3,-1.31,-1.3,'#4A4F52');
   F(P,-half+.25,half-.25,2.62,2.98,-.22,-.02,'#9EA3A2');F(P,-half+.25,half-.25,2.0,2.62,-.06,-.03,'#AEB3B2');for(let y=2.06;y<2.6;y+=.1)F(P,-half+.25,half-.25,y,y+.02,-.03,-.02,'#7F8584');
   F(P,-1.9,.6,.82,.9,-1.25,-.65,'#9A7A60');for(const u of [-1.85,.55])F(P,u,u+.05,0,.82,-1.25,-.65,'#5B6466');F(P,-1.3,-.95,.9,1.1,-1.0,-.8,'#5B6466');
   F(P,-2.1,.9,1.05,2.2,-1.3,-1.27,'#D9C9A8');for(const [u,y,ww,hh,c] of [[-1.8,1.5,.08,.45,'#3E4447'],[-1.55,1.6,.3,.06,'#E0612A'],[-1.2,1.35,.06,.5,'#3E4447'],[-.9,1.7,.25,.25,'#3E4447'],[-.45,1.4,.08,.55,'#B33A32'],[-.1,1.55,.35,.08,'#5B6466'],[.4,1.45,.1,.4,'#E0612A']])F(P,u,u+ww,y,y+hh,-1.27,-1.25,c);
   F(P,1.2,1.75,0,.55,-1.2,-.65,'#3E4447');F(P,1.25,1.7,.55,1.0,-1.15,-.7,'#E0612A');F(P,1.3,1.65,1.0,1.3,-1.1,-.75,'#2B2F33');L.push({x:e.x+1.47,y:TOP+.78,z:zf(-.66),size:.45,color:'#FFA35A',kind:'printer'});
   F(P,-2.2,-1.95,0,.6,-1.2,-.5,'#B33A32');F(P,-2.2,-1.95,.6,.64,-1.2,-.5,'#5B6466');
   // Forecourt: sawhorse + plank, crates, a leaning ladder, cones.
   for(const u of [-.9,-.1])F(P,u,u+.05,0,.7,.25,.55,'#9A7A60');F(P,-1.0,.05,.7,.76,.2,.6,'#C9A06A');
   F(P,.6,1.1,0,.4,.2,.6,'#9A7A60');F(P,.65,1.05,.4,.75,.25,.55,'#B98A55');P.push({...ext(e.x+1.85,e.x+2.25,TOP,TOP+2.4,zf(.25),zf(.2),'#B9C0C8'),rx:-fz*.25});
   for(const u of [-2.1,1.6])F(P,u,u+.22,0,.45,.6,.8,'#E5582B');
   F(W,-half,half,2.95,3.07,0,.6,'#5B6466',{rx:fz*.17});
   sgn('workshop',0,3.42,.02,3.4,.64,facing,false);
   glass(-half+.4,half-.4,3.8,5.1,0,.04,GLASS_LOW,'#FFC27A');F(W,-half,half,3.72,3.88,0,.1,band);
   pools.push([e.x,zf(.8),'#FFE6B8',2.6,.5,.2]);
  }else if(id==='arcade'){
   // T1 zakkyo: window bands, the neon marquee wrapping the corner, a blade sign, the fire stair on the back.
   F(W,-half,half,0,H,back,0,e.wall);
   glass(-half+.3,half-.3,.2,2.7,0,.06,'#2A2440','#FF5FA2');
   for(let k=1;k<e.floors;k++){const y=3+2.5*(k-1);glass(-half+.15,half-.15,y+.8,y+2.0,0,.05,GLASS_LOW,k===1?'#FF8FCF':'#FFE6B8');F(W,-half,half,y+.64,y+.8,0,.1,band);
    glass(-half+.5,half-.5,y+1.0,y+1.9,back-.05,back,GLASS_LOW,k===1?'#B07CFF':'#FFC27A');
    F(G,0,0,0,0,0,0,'#000');G.pop();
    G.push(ext(side,side+.05,TOP+y+1.0,TOP+y+1.8,zf(-1.2),zf(-2.6),GLASS_LOW,{light:'#FF8FCF'}));}
   F(P,-half-.05,half+.05,2.85,3.65,0,.35,'#1E1B26');sgn('marquee',0,3.25,.36,e.w,.74,facing,true);
   P.push(ext(side,side+.3,TOP+2.82,TOP+3.68,zf(-.05),zf(-2.6),'#1E1B26'));S.push({region:'marquee',x:side+.31,y:TOP+3.25,z:zf(-1.325),w:2.5,h:.78,face:'+x',lit:true});
   for(let i=0;i<14;i++){const t=i/13,z=zf(-.1-t*2.45);for(const y of [2.86,3.64])L.push({x:side+.33,y:TOP+y,z,size:.16,color:'#FFD36E',kind:'bulb',phase:i+(y>3?7:0)});}
   P.push(ext(side+.05,side+.6,TOP+4.0,TOP+7.4,zf(-.32),zf(-.2),'#1E1B26'));S.push({region:'bladeArcade',x:side+.33,y:TOP+5.7,z:zf(-.33)+.0,w:.5,h:3.2,face:'+z',lit:true});
   S.push({region:'bladeArcade',x:side+.33,y:TOP+5.7,z:zf(-.19),w:.5,h:3.2,face:'-z',lit:true});
   // Fire stair on the back face (camera side).
   const zc=zf(back-.5),c='#6E7774';for(let k=0;k<e.floors-1;k++){const ya=k?3+2.5*(k-1):0,yb=3+2.5*k,dir=k%2?1:-1,run=Math.min(2.2,e.w-.4),a=Math.atan2(yb-ya,run*dir);
    P.push({x:e.x,y:TOP+(ya+yb)/2,z:zc,w:Math.hypot(run,yb-ya),h:.12,d:.9,rz:a,color:c});P.push(ext(e.x+dir*(run/2)-.0,e.x+dir*(run/2+.9),TOP+yb-.06,TOP+yb+.06,zc-.45,zc+.45,c));
    P.push(ext(e.x-run/2-.9,e.x+run/2+.9,TOP+yb+.95,TOP+yb+1.0,zc+.43,zc+.47,c));}
   for(let i=0;i<3;i++)P.push(ext(side+.02,side+.32,TOP+3.6+i*2.5,TOP+4.2+i*2.5,zf(-3.4),zf(-4.2),'#E5E1D6'));
   F(W,-half,half,H,H+.02,back,0,e.roof);F(P,-half+.2,half-.2,H,H+.015,back+.2,-.2,e.roof);
   pools.push([side+1.0,zf(-1.3),'#FF5FA2',2.0,.55,.2],[e.x,zf(.9),'#FF8FCF',2.4,.5,.2]);
  }else if(id==='studio'){
   // T4 with a rooftop antenna mast (blinking light) and the sound booth window on the back, ON AIR above it.
   F(W,-half,half,0,H,back,0,e.wall);
   glass(-half+.5,half-.5,.3,2.6,0,.05,'#2B2D36','#B07CFF');F(W,-half,half,2.95,3.07,0,.6,'#5B6466',{rx:fz*.17});sgn('studio',0,3.42,.02,3.4,.64,facing,false);
   glass(-half+.4,half-.4,3.8,5.1,0,.04,GLASS_LOW,'#FFC27A');F(W,-half,half,3.72,3.88,0,.1,band);
   // Back: a deep-set booth window (thick frame, foam wedges, a mic), the ON AIR sign, a back door, a ground window.
   const bz=back,u0=-1.5,u1=.6,y0=3.75,y1=5.15;F(P,u0,u1,y0,y1,bz-.02,bz,'#2B2D36');
   for(const [a,b,c,d] of [[u0-.18,u1+.18,y0-.18,y0],[u0-.18,u1+.18,y1,y1+.18],[u0-.18,u0,y0,y1],[u1,u1+.18,y0,y1]])F(P,a,b,c,d,bz-.2,bz,'#2F3437');
   for(let i=0;i<6;i++)for(let j=0;j<3;j++)F(P,u0+.12+i*.33,u0+.32+i*.33,y0+.15+j*.4,y0+.35+j*.4,bz-.06,bz-.02,j%2?'#3A3C48':'#454857');
   F(P,-.05,.0,y0,y0+.9,bz-.12,bz-.08,'#B9C0C8');F(P,-.08,.03,y0+.9,y0+1.05,bz-.14,bz-.06,'#2B2B2B');
   sgn('onair',-.45,y1+.42,bz-.03,.7,.28,backFace,true);L.push({x:e.x-.45,y:TOP+y1+.42,z:zf(bz-.1),size:.9,color:'#FF3B3B',kind:'onair'});
   F(P,1.2,2.0,0,2.1,bz-.04,bz,'#4A3F38');glass(-1.8,.2,1.0,2.2,bz-.04,bz,GLASS_LOW,'#B07CFF');
   G.push(ext(side,side+.05,TOP+3.9,TOP+5.0,zf(-1.0),zf(-2.4),GLASS_LOW,{light:'#FFC27A'}));
   F(W,-half,half,H,H+.02,back,0,e.roof);
   const mx=e.x+1.4,mz=zf(-3.6);P.push(ext(mx-.05,mx+.05,TOP+H,TOP+H+4.2,mz-.05,mz+.05,'#5B6466'));for(const [y,ww] of [[H+2.4,1.2],[H+3.1,.9],[H+3.7,.6]])P.push(ext(mx-ww/2,mx+ww/2,TOP+y,TOP+y+.04,mz-.02,mz+.02,'#5B6466'));
L.push({x:mx,y:TOP+H+4.25,z:mz,size:.5,color:'#FF3B3B',kind:'beacon'});
   F(P,-2.0,-1.2,H,H+1.2,-1.0,-.4,'#B9C6C4');
   P.push(ext(side+.05,side+.55,TOP+3.6,TOP+6.0,zf(-.32),zf(-.2),'#2B2D36'));S.push({region:'bladeStudio',x:side+.3,y:TOP+4.8,z:zf(-.33),w:.44,h:2.3,face:'+z',lit:true});S.push({region:'bladeStudio',x:side+.3,y:TOP+4.8,z:zf(-.19),w:.44,h:2.3,face:'-z',lit:true});
   pools.push([e.x-.45,zf(bz-.9),'#FF3B3B',1.4,.35,.2]);
  }else{
   // T3 mansion: balconies on the back (south) face, AC units on them, laundry; the ORANGE / 03 entrance on the street.
   F(W,-half,half,0,H,back,0,e.wall);
   glass(.4,1.4,0,2.0,0,.06,GLASS_LOW,'#FFE6B8');F(P,-1.4,-.2,.45,1.55,0,.08,'#8E9290');sgn('orange',0,2.55,.03,3.0,.66,facing,false);
   for(let k=1;k<e.floors;k++){const y=3+2.5*(k-1);glass(-half+.15,half-.15,y+.25,y+2.25,0,.04,GLASS_LOW,k===1?'#FFC27A':null);F(W,-half,half,y+.0,y+.9,0,.9,band);}
   for(let k=0;k<e.floors;k++){const y=k?3+2.5*(k-1):0,bz=back,lit=['#FFC27A',null,'#FFD9A0'][k];
    glass(-half+.2,half-.2,y+.25,y+2.25,bz-.04,bz,GLASS_LOW,lit);
    if(k){F(P,-half,half,y-.02,y+.12,bz-.95,bz,band);F(P,-half,half,y+.12,y+1.05,bz-.95,bz-.85,band);F(P,-half,-half+.1,y+.12,y+1.05,bz-.95,bz,band);F(P,half-.1,half,y+.12,y+1.05,bz-.95,bz,band);
     for(const s of [-1,1])F(P,s*1.7-.4,s*1.7+.4,y+.12,y+.7,bz-.45,bz-.1,'#E5E1D6');
     F(P,-half+.3,half-.3,y+1.85,y+1.88,bz-.6,bz-.57,'#B9C0C8');if(k===1)[[-1.6,'#F2EEE6'],[-1.0,'#7FA3C8'],[-.4,'#E8B4C4'],[.3,'#F2EEE6']].forEach(([u,c])=>F(P,u-.22,u+.22,y+1.3,y+1.85,bz-.6,bz-.57,c));
     F(P,1.0,1.3,y+1.05,y+1.35,bz-.9,bz-.6,'#6F8F5E');}}
   F(W,-half,half,H,H+.02,back,0,e.roof);F(P,-half+.4,-half+1.9,H,H+1.8,-1.2,-3.4,tint(e.wall,-.1));F(P,1.0,2.3,H,H+1.3,-3.2,-4.3,'#B9C6C4');
   P.push(ext(side,side+.02,TOP+3.3,TOP+7.8,zf(-.25),zf(-.65),'#2F3437'));S.push({region:'bladeOrange',x:side+.025,y:TOP+5.55,z:zf(-.45),w:.36,h:4.3,face:'+x',lit:true});
   for(let i=0;i<2;i++)G.push(ext(side,side+.05,TOP+3.4+i*2.5,TOP+4.4+i*2.5,zf(-2.0),zf(-3.0),GLASS_LOW,{light:'#FFC27A'}));
   pools.push([e.x+.9,zf(.9),'#FFE6B8',2.0,.5,.2]);
  }
  // Exposed side: a drain pipe; every example sits on a paved forecourt.
  P.push(ext(side+.02,side+.1,TOP,TOP+H,zf(back+.3)-.04,zf(back+.3)+.04,'#8D918C'));
  F(P,-half-.45,half+.45,-.02,.03,back-.45,fz>0?.9:.45,'#B4B1A7');
  picks.push({id,...ext(e.x-half-.1,e.x+half+.1,TOP,TOP+H+(id==='studio'?4:0),Math.min(zf(0),zf(back))-.1,Math.max(zf(0),zf(back))+.1)});
  labels[id]=H+(id==='studio'?2.2:1.4);
 }
 // Two more lots so the block has no holes: coin parking with a kei car (north-east), a bench garden (south middle).
 {const x0=6.4,x1=13.6,z0=-5.6,z1=-.72;P.push(ext(x0,x1,TOP,TOP+.04,z0,z1,'#646B6C'));for(let i=0;i<=3;i++){const x=x0+.2+i*((x1-x0-.4)/3);P.push(ext(x-.04,x+.04,TOP+.04,TOP+.05,z0+.3,z1-.4,'#ECEAE2'));}
  const cx=8.15,cz=-3.2;P.push(ext(cx-.48,cx+.48,TOP+.18,TOP+.75,cz-.95,cz+.95,'#E8E6E0'),ext(cx-.43,cx+.43,TOP+.75,TOP+1.18,cz-.6,cz+.5,'#D9D3C3'),ext(cx-.44,cx+.44,TOP+.8,TOP+1.12,cz+.5,cz+.53,GLASS_LOW));
  for(const s of [-1,1])for(const t of [-1,1])P.push(ext(cx+s*.42,cx+s*.5,TOP,TOP+.34,cz+t*.6-.17,cz+t*.6+.17,'#2B2B2B'));
  P.push(ext(13.0,13.35,TOP,TOP+1.2,-1.2,-.9,'#E3BE3C'));P.push(ext(12.9,12.98,TOP,TOP+2.6,-1.5,-1.42,'#B7B4AA'),ext(12.66,13.22,TOP+2.3,TOP+2.86,-1.5,-1.44,'#D2463C'),ext(12.76,13.12,TOP+2.4,TOP+2.76,-1.44,-1.43,'#F4F1EA'));}
 {const x=2.3,z=4.75;P.push(ext(.2,4.6,TOP,TOP+.05,4.3,8.0,'#7E9A63'),ext(.2,4.6,TOP,TOP+.4,4.28,4.36,'#8C8F86'));P.push(ext(x-.6,x+.6,TOP+.4,TOP+.46,z+.4,z+.8,'#9A7A60'));for(const u of [-.5,.5])P.push(ext(x+u-.04,x+u+.04,TOP,TOP+.4,z+.45,z+.75,'#5B6466'));}
 return {W,P,G,S,L,pools,picks,labels};
}
function tint(hex,f){const c=new THREE.Color(hex);return '#'+(f>0?c.lerp(new THREE.Color('#ffffff'),f):c.lerp(new THREE.Color('#000000'),-f)).getHexString();}

// ---------- canvas: the sign atlas and the glow sprite (DOM only) ----------
const hasDom=()=>typeof document!=='undefined';
function drawAtlas(g,board){
 const R=ATLAS,txt=(t,x,y,size,color,font='bold',align='center',max)=>{g.font=`${font} ${size}px "Hiragino Sans","Noto Sans JP",system-ui,sans-serif`;g.fillStyle=color;g.textAlign=align;g.textBaseline='middle';g.fillText(t,x,y,max);};
 const rect=([x,y,w,h],c)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};
 drawBoard(g,board);
 // Posters: SUB-01's robot, Tokyo Tower at night, SHIP IT.
 {const [x,y,w,h]=R.posterBot;rect(R.posterBot,'#1F2A30');g.fillStyle='#FB752B';g.fillRect(x+40,y+60,90,80);g.fillStyle='#1F2A30';g.fillRect(x+58,y+84,16,16);g.fillRect(x+96,y+84,16,16);g.fillStyle='#FB752B';g.fillRect(x+80,y+40,10,20);
  txt('SUB-01',x+w/2,y+180,28,'#F3EFE4');txt('builds your idea',x+w/2,y+214,15,'#C7CBBD','normal');}
 {const [x,y,w,h]=R.posterTower;const gr=g.createLinearGradient(0,y,0,y+h);gr.addColorStop(0,'#1C2638');gr.addColorStop(1,'#4A3A5A');g.fillStyle=gr;g.fillRect(x,y,w,h);
  g.fillStyle='#E5582B';g.beginPath();g.moveTo(x+w/2,y+30);g.lineTo(x+w/2+40,y+220);g.lineTo(x+w/2-40,y+220);g.fill();g.fillStyle='#F4F1EA';g.fillRect(x+w/2-30,y+120,60,10);g.fillRect(x+w/2-18,y+70,36,8);txt('東京',x+w/2,y+240,20,'#F3EFE4');}
 {const [x,y,w,h]=R.posterShip;rect(R.posterShip,'#F3EFE4');txt('SHIP',x+w/2,y+80,46,'#1F2A30');txt('IT.',x+w/2,y+130,46,'#FB752B');txt('one idea',x+w/2,y+190,16,'#5B6466','normal');txt('at a time',x+w/2,y+212,16,'#5B6466','normal');}
 // Fascias (EXAMPLE places are labelled as such), the arcade's neon, the blades, the nameplate, ON AIR, the shrine.
 const fascia=(r,bg,fg,title,sub)=>{const [x,y,w,h]=r;rect(r,bg);txt(title,x+w/2,y+h*.42,h*.46,fg,'bold','center',w-20);txt(sub,x+w/2,y+h*.82,h*.18,fg+'AA','normal');};
 fascia(R.workshop,'#2F3437','#F0ECD8','WORKSHOP','EXAMPLE · BUILD STUDIO');fascia(R.studio,'#2B2D36','#C9CCF0','MIDNIGHT STUDIO','EXAMPLE · MUSIC');
 fascia(R.orange,'#F2D2B4','#B85A24','ORANGE / 03','APARTMENTS · YOUR CORNER OF TOKYO');
 {const [x,y,w,h]=R.marquee;rect(R.marquee,'#1E1B26');g.shadowColor='#FF5FA2';g.shadowBlur=18;txt('BAD IDEA ARCADE',x+w/2,y+h*.45,50,'#FFB3DA','bold','center',w-30);g.shadowBlur=0;txt('EXAMPLE · GAMES',x+w/2,y+h*.84,16,'#FFD36E','normal');}
 const blade=(r,bg,fg,chars)=>{const [x,y,w,h]=r;rect(r,bg);g.strokeStyle=fg;g.lineWidth=3;g.strokeRect(x+5,y+5,w-10,h-10);const step=(h-30)/chars.length;chars.forEach((c,i)=>txt(c,x+w/2,y+20+step*(i+.5),Math.min(w*.62,step*.8),fg));};
 blade(R.bladeArcade,'#1E1B26','#FF8FCF',['ゲ','ー','ム','★']);blade(R.bladeStudio,'#2B2D36','#C9CCF0',['ス','タ','ジ','オ']);blade(R.bladeOrange,'#2F3437','#FFAC70',['オ','レ','ン','ジ','03']);
 {const [x,y,w,h]=R.nameplate;rect(R.nameplate,'#E8E2D4');g.strokeStyle='#5B6466';g.lineWidth=3;g.strokeRect(x+3,y+3,w-6,h-6);txt('SUB-01',x+w/2,y+h/2,30,'#2F3437');}
 {const [x,y,w,h]=R.onair;rect(R.onair,'#3A0E10');txt('ON AIR',x+w/2,y+h/2,38,'#FF5050');}
 {const [x,y,w,h]=R.plaque;rect(R.plaque,'#2B2B2B');g.strokeStyle='#E3BE3C';g.lineWidth=4;g.strokeRect(x+6,y+6,w-12,h-12);txt('稲',x+w/2,y+h*.33,40,'#E3BE3C');txt('荷',x+w/2,y+h*.7,40,'#E3BE3C');}
 for(const r of [R.banner,R.banner2]){const [x,y,w,h]=r;rect(r,'#C8452D');rect([x,y,w,10],'#F4F1EA');['稲','荷','大','明','神'].forEach((c,i)=>txt(c,x+w/2,y+40+i*66,44,'#F7F5EE'));}
 const vend=(r,bg,rows)=>{const [x,y,w,h]=r;rect(r,'#DDEAF0');for(let j=0;j<3;j++)for(let i=0;i<5;i++){const cx=x+20+i*37,cy=y+30+j*80;g.fillStyle=rows[(i+j)%rows.length];g.fillRect(cx-10,cy-24,20,48);g.fillStyle='#F4F1EA';g.fillRect(cx-10,cy-6,20,10);g.fillStyle='#3B4245';g.fillRect(cx-14,cy+30,28,8);g.fillStyle='#4CC36A';g.fillRect(cx-4,cy+31,8,6);}
  g.fillStyle=bg;g.fillRect(x,y+h-40,w,40);};
 vend(R.vendA,'#2F6FB5',['#C63B34','#2F6FB5','#E3BE3C','#3E9B5C','#8C5A3C']);vend(R.vendB,'#C63B34',['#2F3437','#C63B34','#F0B23E','#5E7A93']);
}
// The whiteboard: the current project in marker, else the open mailbox. Redrawn when the project changes.
export function boardText(p){return p?{title:p.name,ticker:p.ticker?'$'+p.ticker.toUpperCase():'',stage:p.launched?'LAUNCHED':String(p.stageLabel||p.stage||'').toUpperCase()}:{title:'NEXT IDEA?',ticker:'',stage:'THE MAILBOX IS OPEN'};}
function drawBoard(g,p){const [x,y,w,h]=ATLAS.whiteboard,b=boardText(p);g.fillStyle='#F7F7F3';g.fillRect(x,y,w,h);
 g.font='bold 22px "Marker Felt","Comic Sans MS",system-ui,sans-serif';g.textAlign='left';g.textBaseline='middle';g.fillStyle='#2F6FB5';g.fillText('NOW BUILDING:',x+24,y+34);
 g.font='bold 54px "Marker Felt","Comic Sans MS",system-ui,sans-serif';g.fillStyle='#1F2A30';g.fillText(b.title,x+24,y+100,w-48);
 if(b.ticker){g.font='bold 40px "Marker Felt",system-ui,sans-serif';g.fillStyle='#FB752B';g.fillText(b.ticker,x+24,y+160,w-48);}
 g.font='22px "Marker Felt",system-ui,sans-serif';g.fillStyle='#C63B34';g.fillText(b.stage,x+24,y+212,w-48);
 g.strokeStyle='#3E9B5C';g.lineWidth=4;g.beginPath();g.moveTo(x+w-120,y+200);g.lineTo(x+w-90,y+225);g.lineTo(x+w-40,y+170);g.stroke();}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);
 gr.addColorStop(0,'#ffffff');gr.addColorStop(.25,'#ffffffaa');gr.addColorStop(.6,'#ffffff33');gr.addColorStop(1,'#ffffff00');g.fillStyle=gr;g.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

// ---------- build ----------
const BOX=new THREE.BoxGeometry(1,1,1);
// Facade surfaces (facades.js, wave 5A) by colour: the house's siding and plaster, the examples' tiles, asphalt, pavers.
export const HERO_FACADES={[C.ext]:'siding',[C.plaster]:'plaster',[C.found]:'concrete',[C.concrete]:'concrete',[C.roof]:'metal','#7A7F7C':'asphalt','#B4B1A7':'pavers',
 '#9EA3A2':'shutter','#AEB3B2':'shutter',[EXAMPLES.lab.wall]:'siding',[EXAMPLES.arcade.wall]:'tileWhite',[EXAMPLES.studio.wall]:'plaster',[EXAMPLES.residence.wall]:'tileBeige'};
const FAC=Object.fromEntries(Object.entries(HERO_FACADES).map(([k,v])=>[k.toLowerCase(),facadeCode(v)]));
function batch(items,material,{name,shadow=true,lit=false,fac=false}){
 const geo=lit||fac?BOX.clone():BOX,mesh=new THREE.InstancedMesh(geo,material,Math.max(1,items.length)),o=new THREE.Object3D(),c=new THREE.Color();mesh.count=items.length;mesh.name=name;
 const light=lit?new Float32Array(Math.max(1,items.length)*3):null;
 items.forEach((b,i)=>{if(b.m)mesh.setMatrixAt(i,b.m);else{o.position.set(b.x,b.y,b.z);o.rotation.set(b.rx||0,b.ry||0,b.rz||0);o.scale.set(b.w,b.h,b.d);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);}
  mesh.setColorAt(i,c.set(b.color));if(light&&b.light){c.set(b.light).multiplyScalar(.55);light.set([c.r,c.g,c.b],i*3);}});
 if(lit)geo.setAttribute('nightLight',new THREE.InstancedBufferAttribute(light,3));
 if(fac)geo.setAttribute('aFacade',facadeAttribute(items.length?items.map(b=>b.fac??FAC[String(b.color).toLowerCase()]??0):[0]));
 mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.raycast=()=>{};mesh.computeBoundingSphere();return mesh;
}
// Quads into the sign atlas: one geometry, vertex colours dim the unlit ones at night.
function signMesh(signs){
 const pos=[],uv=[],col=[],idx=[],S=ATLAS.size;
 for(const s of signs){const r=ATLAS[s.region];if(!r)continue;const [rx,ry,rw,rh]=r,u0=rx/S,u1=(rx+rw)/S,v1=1-ry/S,v0=1-(ry+rh)/S,hw=s.w/2,hh=s.h/2,n=pos.length/3;
  const corner=(a,b)=>s.face==='+z'?[s.x+a*hw,s.y+b*hh,s.z]:s.face==='-z'?[s.x-a*hw,s.y+b*hh,s.z]:s.face==='+x'?[s.x,s.y+b*hh,s.z-a*hw]:[s.x,s.y+b*hh,s.z+a*hw];
  for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){pos.push(...corner(a,b));uv.push(a<0?u0:u1,b<0?v0:v1);col.push(1,1,1);}idx.push(n,n+1,n+2,n,n+2,n+3);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeBoundingSphere();
 return g;
}
// Furniture: every Kenney mesh baked to world space with its material colour as a vertex colour, merged into ONE mesh.
// The monitor's glass quad is kept apart for the screen texture. Returns {geometry, screen, dims}.
async function mergeFurniture(template,list){
 let door=1.01;try{const d=await template('room','doorway');door=new THREE.Box3().setFromObject(d.scene).getSize(new THREE.Vector3()).y||door;}catch{}
 const scale=KIT_DOOR/door,parts=[],dims={},tops={};let screen=null;
 const loaded=await Promise.all([...new Set(list.map(f=>f.item))].map(async n=>{try{return [n,await template('room',n)];}catch{return [n,null];}}));
 const models=Object.fromEntries(loaded),col=new THREE.Color();
 for(const f of list){const gl=models[f.item];if(!gl)continue;const root=gl.scene;root.updateMatrixWorld(true);
  const bb=new THREE.Box3().setFromObject(root),size=bb.getSize(new THREE.Vector3());dims[f.item]={w:size.x*scale,h:size.y*scale,d:size.z*scale};
  const surface=f.on?(tops[f.on]??(dims[f.on]?.h||0)):0;
  const place=new THREE.Matrix4().compose(new THREE.Vector3(f.x,f.y+surface,f.z),new THREE.Quaternion().setFromAxisAngle(_up,f.rot||0),new THREE.Vector3(1,1,1))
   .multiply(new THREE.Matrix4().makeScale(scale,scale,scale)).multiply(new THREE.Matrix4().makeTranslation(-(bb.min.x+size.x/2),-bb.min.y,-(bb.min.z+size.z/2)));
  tops[f.item]=dims[f.item].h;
  const glass=f.screen?screenMesh(root):null;
  root.traverse(m=>{if(!m.isMesh||Array.isArray(m.material))return;const mat=m.material;if(mat.name==='_defaultMat'&&f.item!=='sideTable')return;
   // Kenney glbs are quantized (normalized int16): copy to float before baking, or applyMatrix4 clamps to ±1.
   const src=m.geometry.index?m.geometry.toNonIndexed():m.geometry,g=new THREE.BufferGeometry();
   for(const k of ['position','normal']){const a=src.attributes[k];if(!a)continue;const out=new Float32Array(a.count*3);for(let i=0;i<a.count;i++)out.set([a.getX(i),a.getY(i),a.getZ(i)],i*3);g.setAttribute(k,new THREE.BufferAttribute(out,3));}
   if(!g.attributes.normal)g.computeVertexNormals();
   g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(place,m.matrixWorld));
   if(m===glass){screen=g;return;}
   col.set(f.tint?.[mat.name]||'#'+(mat.color?.getHexString()||'ffffff'));const n=g.attributes.position.count,c=new Float32Array(n*3);for(let i=0;i<n;i++)c.set([col.r,col.g,col.b],i*3);
   g.setAttribute('color',new THREE.BufferAttribute(c,3));parts.push(g);});}
 return {geometry:parts.length?mergeGeometries(parts,false):null,screen,dims,scale};
}

// Builds the block under `scene`. host: {template, interactive, places:{home,lab,arcade,studio,residence}, addLabel(place,h),
// getWorld(), getLife() (city-life: addLightPool), camera}. Returns the per-frame/walker API.
export async function buildHeroHome(scene,host){
 const plan=planHero(),root=new THREE.Group();root.name='hero-home';scene.add(root);
 const propsMat=wallMaterial({roughness:.9,ground:TOP,streak:0,tint:.04,dirt:.1,night:true}),wallsMat=wallMaterial({roughness:1,ground:TOP,night:true});
 const glassMat=withNightLight(windowMaterial({spare:.15}));
 // The mailbox flag: two instances at the end of the props batch, re-posed when the flag goes up or down.
 const flagAt=plan.props.length;plan.props.push({x:0,y:0,z:0,w:.03,h:.24,d:.03,color:'#3E4447'},{x:0,y:0,z:0,w:.02,h:.1,d:.15,color:'#E5582B'});
 const walls=batch(plan.walls,wallsMat,{name:'hero walls',fac:true}),props=batch(plan.props,propsMat,{name:'hero props',fac:true}),glass=batch(plan.glass,glassMat,{name:'hero glass',lit:true,shadow:false});
 root.add(walls,props,glass);
 // Signs (atlas), glows (billboards).
 let atlas=null,atlasCanvas=null,boardKey=null;
 if(hasDom()){atlasCanvas=document.createElement('canvas');atlasCanvas.width=atlasCanvas.height=ATLAS.size;drawAtlas(atlasCanvas.getContext('2d'),null);atlas=new THREE.CanvasTexture(atlasCanvas);atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;}
 const signGeo=signMesh(plan.signs),signMat=new THREE.MeshBasicMaterial({map:atlas,vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const signs=new THREE.Mesh(signGeo,signMat);signs.name='hero signs';signs.raycast=()=>{};root.add(signs);
 const glowMat=new THREE.MeshBasicMaterial({map:hasDom()?glowTexture():null,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false});
 const glows=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),glowMat,plan.glows.length);glows.name='hero glows';glows.raycast=()=>{};glows.frustumCulled=false;glows.renderOrder=2;
 glows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(glows);const black=new THREE.Color(0,0,0);plan.glows.forEach((_,i)=>glows.setColorAt(i,black));
 // Furniture + the monitor.
 const furn=await mergeFurniture(host.template,FURNITURE);
 const furnMat=toon({vertexColors:true});let furniture=null,monitor=null;
 if(furn.geometry){furniture=new THREE.Mesh(furn.geometry,furnMat);furniture.name='hero furniture';furniture.castShadow=true;furniture.receiveShadow=true;furniture.raycast=()=>{};root.add(furniture);}
 if(furn.screen){const g=screenGeometry(furn.screen);monitor=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:hasDom()?screenTexture(null,true):null,toneMapped:false}));monitor.name='hero monitor';monitor.raycast=()=>{};root.add(monitor);}
 // Picks and labels.
 const pickMat=new THREE.MeshBasicMaterial({visible:false});
 for(const pk of plan.picks){const place=host.places?.[pk.id];if(!place)continue;const m=new THREE.Mesh(BOX,pickMat);m.position.set(pk.x,pk.y,pk.z);m.scale.set(pk.w,pk.h,pk.d);m.userData.place=place;m.updateMatrixWorld();root.add(m);host.interactive?.push(m);
  host.addLabel?.(place,plan.labels[pk.id]??4);}
 // Static night pools (shrine lantern, vending, lamps, example fronts); the house's own pools follow its lights.
 let poolsOn=false,houseLights=null;
 const addPools=life=>{if(!life?.addLightPool)return false;life.clearLightPools?.('hero-block');for(const [x,z,c,r,s,y] of plan.pools)life.addLightPool(x,z,c,r,{y,strength:s,group:'hero-block'});return true;};
 const housePools=(life,state)=>{if(!life?.addLightPool)return;life.clearLightPools?.('hero-house');
  if(state==='home'){life.addLightPool(-4.7,-5.9,'#FFD08A',2.2,{y:F0+.01,strength:.6,group:'hero-house'});life.addLightPool(-7.6,-3.0,'#FFC27A',2.0,{y:F0+.01,strength:.45,group:'hero-house'});life.addLightPool(-8.3,-5.6,'#FFB870',1.0,{y:F1+.01,strength:.35,group:'hero-house'});}
  else if(state==='away')life.addLightPool(-7.6,-3.0,'#FFC27A',1.6,{y:F0+.01,strength:.35,group:'hero-house'});
  else life.addLightPool(-7.6,-6.3,'#FFB870',.7,{y:F1+.01,strength:.3,group:'hero-house'});};
 // Seated / lying placement for SUB-01 (main.js's walker calls arrive() on arrival and stand() when it sets off).
 const chairH=furn.dims.chairDesk?.h||1.2,bedH=furn.dims.bedSingle?.h||.74;let seated=null,force=null;
 const api={root,plan,F0,F1,get seated(){return seated;},
  route:(points,fromY)=>homeRoute(points,fromY),floorAt,inLot,
  arrive(c,activity){if(!c)return;const r=c.root,near=p=>Math.hypot(r.position.x-p.x,r.position.z-p.z)<.35,s=r.scale.y||1;
   if((activity==='desk'||activity==='offline')&&near(DESK_POINT)){r.position.set(CHAIR.x,F0+chairH*.45-c.offsets.seat*s,CHAIR.z);r.rotation.y=CHAIR.rot;c.pose('sit');if(activity==='desk')c.play('Interact');seated='desk';}
   else if(activity==='sleep'&&near(BED_POINT)){r.position.set(BED.x,F1+bedH*.55,BED.z);r.rotation.y=BED.rot;if(c.emote)c.emote('sleep');else c.pose('lie');seated='bed';}},
  stand(c){if(!c||!seated)return;c.stopEmote?.();c.pose(null);const r=c.root,p=seated==='bed'?BED_POINT:DESK_POINT;r.position.set(p.x,seated==='bed'?F1:F0,p.z);seated=null;},
  // Debug (screenshots): force the house's light state ('asleep'|'home'|'away'|null) and put SUB-01 in bed or at the desk.
  force(state){force=state||null;},
  // Debug (screenshots, a brain that is awake): 'asleep' puts SUB-01 in bed with the house dark, 'desk' back in his chair,
  // 'flag' raises the mailbox flag, null returns to the live world.
  debug(what){const c=host.getCharacter?.();if(what==='flag'){flagForce=true;return;}flagForce=null;
   if(what==='asleep'&&c){api.stand(c);c.root.position.set(BED_POINT.x,F1,BED_POINT.z);force='asleep';api.arrive(c,'sleep');}
   else if(what==='desk'&&c){api.stand(c);c.root.position.set(DESK_POINT.x,F0,DESK_POINT.z);force=null;api.arrive(c,'desk');}else force=null;},
  stats(){let tris=0,calls=0;root.traverse(m=>{if(!m.isMesh||m.material?.visible===false)return;calls++;const g=m.geometry,t=(g.index?g.index.count:g.attributes.position.count)/3;tris+=m.isInstancedMesh?t*m.count:t;});return {calls,triangles:Math.round(tris),furniture:furn.geometry?furn.geometry.attributes.position.count/3:0};},
  mailbox:false,
  update(dt,seconds,camera){const world=host.getWorld?.(),n=night.value;
   // Mailbox flag (smoothly up/down).
   const up=flagForce??mailboxFlag(world);api.mailbox=up;flagT+=((up?1:0)-flagT)*Math.min(1,dt*4);if(Math.abs(flagT-flagShown)>.002){flagShown=flagT;poseFlag(flagT);}
   // House lights.
   const state=force||lightsFor(world?.sub01?.state);if(state!==houseLights||!poolsOn){const life=host.getLife?.();if(!poolsOn)poolsOn=addPools(life);if(poolsOn){housePools(life,state);houseLights=state;}}
   furnMat.color.setScalar(1-.45*n*(state==='home'?.25:1));
   if(host.light)host.light.intensity=n<.5?0:state==='home'?7:state==='away'?2.5:.6;
   // Monitor + whiteboard (every ~2 s).
   if(seconds-screenAt>2||screenAt<0){screenAt=seconds;const p=deskProject(world),asleep=state==='asleep',key=JSON.stringify([p,asleep]);
    if(key!==screenKey){screenKey=key;if(monitor&&hasDom()){monitor.material.map=asleep?screenTexture(null,false):screenTexture(p,!p);monitor.material.needsUpdate=true;}
     const bk=JSON.stringify(boardText(p));if(bk!==boardKey&&atlasCanvas){boardKey=bk;drawBoard(atlasCanvas.getContext('2d'),p);atlas.needsUpdate=true;}}}
   // Signs: unlit quads dim at night like the walls.
   const dim=1-.55*n;if(Math.abs(dim-signDim)>.01){signDim=dim;const c=signGeo.attributes.color;plan.signs.forEach((s,i)=>{if(s.lit)return;for(let k=0;k<4;k++)c.setXYZ(i*4+k,dim,dim,dim);});c.needsUpdate=true;}
   // Glows: billboards facing the camera, brightness from night, the house lights and their own blink.
   if(camera){glowQ.copy(camera.quaternion);const col=new THREE.Color();
    plan.glows.forEach((gl,i)=>{let k=0;const blink=Math.sin(seconds*2.1+(gl.phase||0)*1.3);
     switch(gl.kind){case 'led':k=.9*(blink>-.6?1:.15)*(state==='asleep'?.6:1);break;case 'desk':k=state==='home'?n*.9:0;break;case 'monitor':k=state==='asleep'?0:n*.55+.05;break;
      case 'nightstand':k=state==='home'?n*.6:0;break;case 'nightlight':k=state==='asleep'?.25+n*.6:0;break;case 'eyes':k=n>.5?.9:0;break;
      case 'bulb':k=n*.7+.15;k*=(Math.floor(seconds*6)+gl.phase)%3===0?1:.35;break;case 'onair':k=(.25+n*.75)*(Math.sin(seconds*1.3)>-.3?1:.2);break;case 'beacon':k=(Math.sin(seconds*3)>.3?1:0)*(.3+n*.7);break;
      default:k=n;}
     _v.set(gl.x,gl.y,gl.z);_s.setScalar(k>0?gl.size:0);_m.compose(_v,glowQ,_s);glows.setMatrixAt(i,_m);glows.setColorAt(i,col.set(gl.color).multiplyScalar(Math.max(0,k)));});
    glows.instanceMatrix.needsUpdate=true;if(glows.instanceColor)glows.instanceColor.needsUpdate=true;}
  }};
 let flagForce=null,flagT=0,flagShown=-1,screenAt=-1,screenKey=null,signDim=-1;const glowQ=new THREE.Quaternion();
 const fo=new THREE.Object3D(),pivot=new THREE.Vector3(plan.flag.x,plan.flag.y,plan.flag.z);
 function poseFlag(t){const a=-Math.PI/2*(1-t),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),a);
  for(const [i,off,s] of [[flagAt,new THREE.Vector3(0,.12,0),[.03,.24,.03]],[flagAt+1,new THREE.Vector3(0,.2,.075),[.02,.1,.15]]]){fo.position.copy(off).applyQuaternion(q).add(pivot);fo.quaternion.copy(q);fo.scale.set(...s);fo.updateMatrix();props.setMatrixAt(i,fo.matrix);}
  props.instanceMatrix.needsUpdate=true;}
 poseFlag(0);
 if(typeof window!=='undefined')window.__heroHome=api;
 return api;
}
