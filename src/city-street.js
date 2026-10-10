import * as THREE from 'three';
import {cityPlots,ROAD_Z,BOULEVARD_X,CITY_EXTENT} from './city-state.js';
// Street layer (art brief 3.7, 3.10): utility poles with crossarms, transformers and guard sleeves; the whole city's cable
// web as ONE LineSegments; slim LED lamps on the boulevards and sodium lamps on the side streets; night light pools as
// ONE additive InstancedMesh of a single 64 px radial sprite. Pole parts are plain boxes returned as items for
// city-life.js's shared solid batch, so the poles add no draw call of their own.
// Rows and boulevards come from the district grid, so the pole web grows with the city.
export const ROWS=ROAD_Z,BOULEVARDS=BOULEVARD_X;
const X0=CITY_EXTENT.minX+.5,X1=CITY_EXTENT.maxX,Z0=CITY_EXTENT.minZ+1.5,Z1=CITY_EXTENT.maxZ;
export const POLE={h:10.5,w:.24,arms:[9.6,8.6],color:'#B7B4AA',metal:'#5B6466',sleeve:['#E3BE3C','#2B2B2B'],cable:'#2D3134'};
export const LIGHT={led:'#FFF0D8',sodium:'#FF9E48',lantern:'#FFB066'};
const STREET_OFFSET=2.3,BOULEVARD_OFFSET=3.3,GROUND=.2;
// Boulevard section (owner 2026-10-10 "fill the empty strips between the streets"): asphalt ±1.3 (kerb), a 2.2 sidewalk
// each side out to the facade line at 3.5. Pole side (boulevardSide): the big tree row at 2.15 every 4, parked cars /
// bus shelters / bike racks in the slots between the trees. Lamp side: a hedge or planters at 2.5, small ginkgos at
// 2.95 between the LED lamps, parked cars at 1.8. A dashed cycle line at 1.05 inside each kerb, lane arrows before every
// junction. All planned here (pure, hashed), drawn by city.js and city-green.js as instances in the batches they own.
export const BLVD={kerb:1.3,walk:3.5,treeX:2.15,treeStep:4,carX:1.8,hedgeX:2.5,smallTreeX:2.95,shelterX:2.7,cycleX:1.05,laneX:.65};
export const CAR_COLORS=['#E8E6E0','#2F3437','#9AA3A8','#1F2A44','#B33A32','#D9D3C3'];
// Hashed randomness: stable per position, no i%n rhythm anywhere.
export function hash(...v){let h=2166136261;for(const x of v){h=Math.imul(h^(Math.round(x*997)|0),16777619);h^=h>>>13;}h=Math.imul(h,1540483477);h^=h>>>15;return (h>>>0)/4294967296;}
// Places where nothing stands: the Shibuya scramble, the hero block's furniture, the Roppongi lantern alley, vending boxes.
const KEEP_OUT=[[29,2,7.5],[10.8,3.8,1.6],[-1,.15,1.6],[-27,-1,1.3],[-37,7,1.3],[35,-24,1.3],[21,8,1.3],[-33,-1,1],[-33,3,1],[-25,-1,1],[-25,3,1]];
const blocked=(x,z)=>KEEP_OUT.some(([kx,kz,r])=>Math.hypot(x-kx,z-kz)<r);
const central=(x,z)=>Math.abs(x)<14.2&&z>-11&&z<15;
// Is there a built plot here to run a drop wire to?
const facadeAt=(x,z)=>cityPlots.some(p=>!p.vacant&&Math.abs(p.x-x)<2.6&&Math.abs(p.z-z)<2.6);

// Which side of a boulevard carries its utility poles (and the big tree row): outward from the hero block, else hashed.
export const boulevardSide=bx=>Math.abs(bx)===14.5?Math.sign(bx):hash(bx,7)<.5?-1:1;
// The tree row's first z on a boulevard (city-green.js) and the furniture slots midway between the trees: slot k is at
// z0 + 4k + 2; odd k are pole-side slots, even k lamp-side ones, so a parked car never shares a z with a tree row.
export const boulevardTreeZ0=bx=>CITY_EXTENT.minZ+1.5+hash(bx,12)*3;
export const slotZ=(bx,k)=>boulevardTreeZ0(bx)+BLVD.treeStep*k+2;

// Pure plan (tested): poles, cable spans, lamps. axis = the street direction ('x' for the east-west district streets).
export function streetPlan(){
 const poles=[],spans=[],lamps=[];
 const pole=(x,z,axis,side,c)=>{const p={x,z,axis,side,c,transformer:hash(x,z,3)<1/3,sleeve:hash(x,z,4)<.5,lamp:false};poles.push(p);return p;};
 // East-west district streets: one side per district segment, pitch 8–9, never inside a boulevard or the scramble.
 for(const z0 of ROWS){let x=X0+hash(z0,1)*2.5,prev=null;
  while(x<X1){
   const seg=Math.round(x/29),hero=z0===2&&seg===0,side=hero?1:hash(z0,seg,2)<.5?-1:1,z=hero?3.95:z0+side*STREET_OFFSET;
   if(!BOULEVARDS.some(b=>Math.abs(x-b)<3)&&!blocked(x,z)){
    const p=pole(x,z,'x',side,z0);
    // Japanese side streets hang their lights on the utility poles: sodium on about half of them.
    if(hash(x,z0,5)<.5){p.lamp=true;lamps.push({x,z:z-side*.95,y:6.05,pole:p,kind:'sodium'});}
    if(prev&&x-prev.x<19&&!(z0===2&&prev.x<22&&x>36))spans.push([prev,p]);prev=p;}
   x+=8+hash(z0,x,6);}
 }
 // North-south boulevards: poles on one side (outward from the hero block), LED lamps every 12 on the other side.
 for(const bx of BOULEVARDS){const side=Math.abs(bx)===14.5?Math.sign(bx):hash(bx,7)<.5?-1:1;let z=Z0+hash(bx,8)*2.5,prev=null;
  while(z<Z1){const x=bx+side*BOULEVARD_OFFSET;
   if(!ROWS.some(r=>Math.abs(z-r)<3.6)&&!blocked(x,z)&&!central(x,z)){const p=pole(x,z,'z',side,bx);if(prev&&z-prev.z<19)spans.push([prev,p]);prev=p;}
   z+=8+hash(bx,z,9);}
  for(let z=-66+hash(bx,10)*4;z<74;z+=11.5+hash(bx,z,11)){const x=bx-side*BOULEVARD_OFFSET;
   if(!ROWS.some(r=>Math.abs(z-r)<3.6)&&!blocked(x,z)&&!central(x,z))lamps.push({x:x+side*.95,z,y:5,base:{x,z},dir:side,kind:'led'});}
 }
 return {poles,spans,lamps};
}

// Boulevard furniture (pure, tested): kerbside parked cars (one per ~9, alternating sides, ≥ 6.5 from a row so never
// within 4 of a zebra), bus shelters, bike racks, hedges or planters, cycle-line dashes and lane arrows.
// cars {x,z,side,dir,color}  stops/racks {x,z,side,n?}  planters {x,z,color}  hedges {x,z,len,color}
// arrows {x,z,dir}  dashes {x,z}
export function boulevardFurniture(){
 const out={cars:[],stops:[],racks:[],planters:[],hedges:[],arrows:[],dashes:[]},E=CITY_EXTENT,rows=ROWS;
 const nearRow=(z,m)=>rows.some(r=>Math.abs(z-r)<m),GREENS=['#4F6B45','#5E7A4E','#46603F'];
 for(const bx of BOULEVARDS){const sd=boulevardSide(bx);
  // Slots between the trees: pole side (odd k) a car, a shelter or a rack; lamp side (even k) a car now and then.
  for(let k=0;;k++){const z=slotZ(bx,k);if(z>E.maxZ-3)break;if(z<E.minZ+3)continue;
   const pole=k%2===1,side=pole?sd:-sd,x=bx+side*(pole?BLVD.shelterX:BLVD.carX),h=hash(bx,k,30);
   if(nearRow(z,6.5)||central(x,z)||blocked(x,z))continue;
   if(h<.58)out.cars.push({x:bx+side*BLVD.carX,z,side,dir:side,color:Math.floor(hash(bx,k,32)*CAR_COLORS.length)});
   else if(pole&&h<.68&&!nearRow(z,7.5)&&!out.stops.some(s=>s.x===x&&Math.abs(s.z-z)<20))out.stops.push({x,z,side});
   else if(pole&&h<.82)out.racks.push({x,z,side,n:3+Math.floor(hash(bx,k,33)*3)});
  }
  // Lamp side, stretch by stretch: a hedge (clipped out of the hero block) or planters every 4.
  const edges=[E.minZ+2,...rows,E.maxZ-2],x=bx-sd*BLVD.hedgeX;
  for(let i=0;i+1<edges.length;i++){const a=(i?edges[i]+6.5:edges[i]),b=(i+1<edges.length-1?edges[i+1]-6.5:edges[i+1]);if(b-a<4)continue;
   const segs=Math.abs(x)<14.2?[[a,Math.min(b,-11)],[Math.max(a,15),b]].filter(([p,q])=>q-p>2):[[a,b]];
   if(hash(bx,i,31)<.6)for(const [p,q] of segs)out.hedges.push({x,z:(p+q)/2,len:q-p,color:GREENS[Math.floor(hash(bx,i,34)*3)]});
   else for(let z=a+1+hash(bx,i,35)*2;z<b-1;z+=4)if(!central(x,z)&&!blocked(x,z))out.planters.push({x,z,color:GREENS[Math.floor(hash(bx,z,36)*3)]});
  }
  // Paint: a dashed cycle line inside each kerb, an arrow in each lane 9 before every junction (left-hand traffic:
  // the +z lane on the east side).
  for(const e of [-1,1])for(let z=E.minZ+2.5;z<E.maxZ-2.5;z+=2.8)if(!nearRow(z,3.6))out.dashes.push({x:bx+e*BLVD.cycleX,z});
  for(const r of rows)for(const dir of [1,-1]){const z=r-dir*9;if(z>E.minZ+2&&z<E.maxZ-2)out.arrows.push({x:bx+dir*BLVD.laneX,z,dir});}
 }
 return out;
}

// Cable web: 4–6 catenaries per span hung off the crossarms (3 segments, sag ~0.35) plus 1–2 drop wires per span.
// Returns a flat Float32Array of segment end points (x,y,z pairs).
const SLOTS=[[9.65,-.5],[9.65,.5],[8.65,-.42],[8.65,.42],[7.9,.16],[7.5,.16]];
export function cablePositions({spans}){
 const out=[],seg=(a,b)=>out.push(a[0],a[1],a[2],b[0],b[1],b[2]);
 const at=(p,off,y)=>p.axis==='x'?[p.x,y,p.z+off]:[p.x+off,y,p.z];
 for(const [a,b] of spans){
  const n=4+Math.floor(hash(a.x,a.z,b.x,12)*3);
  for(let k=0;k<n;k++){const [y,off]=SLOTS[k],sag=.3+hash(a.x,b.z,k,13)*.12,p0=at(a,off,y),p3=at(b,off,y);
   const lerp=t=>p0.map((v,i)=>v+(p3[i]-v)*t),p1=lerp(1/3),p2=lerp(2/3);p1[1]-=sag;p2[1]-=sag;seg(p0,p1);seg(p1,p2);seg(p2,p3);}
  // Drop wires: from the line, a little sag, down to a facade at 6–7 on whichever side has a building.
  const drops=1+(hash(a.x,a.z,14)<.5?1:0);
  for(let d=0;d<drops;d++){const t=.2+hash(a.x,b.x,d,15)*.6,s=hash(b.x,b.z,d,16)<.5?-1:1,y=6+hash(a.z,b.z,d,17);
   const from=[a.x+(b.x-a.x)*t,7.6,a.z+(b.z-a.z)*t];
   // Facades: 3.45 off a district street's centre (plot rows at ±6), 4.0 off a boulevard's (plot columns 6.5 away).
   const to=a.axis==='x'?[from[0]+hash(d,a.x,18)-.5,y,a.c+s*3.45]:[a.c+s*4,y,from[2]+hash(d,a.z,18)-.5];
   if(!(a.axis==='x'?facadeAt(to[0],a.c+s*6):facadeAt(a.c+s*6.5,to[2])))continue;
   const mid=[(from[0]+to[0])/2,(from[1]+to[1])/2-.25,(from[2]+to[2])/2];seg(from,mid);seg(mid,to);}
 }
 return new Float32Array(out);
}

// Box items {x,y,z,w,h,d,color,rx,rz} for the poles, lamps and their fittings.
export function streetItems({poles,lamps}){
 const items=[],put=(x,y,z,w,h,d,color,rx=0,rz=0)=>items.push({x,y,z,w,h,d,color,rx,rz});
 const across=(p,o,w,h,d)=>p.axis==='x'?[p.x,p.z+o,w,h,d]:[p.x+o,p.z,d,h,w];
 for(const p of poles){
  const tone=['#B7B4AA','#AEACA3','#BEBBB1'][Math.floor(hash(p.x,p.z,20)*3)];
  put(p.x,GROUND+POLE.h/2,p.z,POLE.w,POLE.h,POLE.w,tone);
  for(const y of POLE.arms){const [x,z,w,h,d]=across(p,0,.1,.1,1.4);put(x,y,z,w,h,d,POLE.metal);}
  // The transformer hangs on the building side of the pole.
  if(p.transformer){const [x,z,w,h,d]=across(p,p.side*.36,.48,.7,.48);put(x,7.05,z,w,h,d,'#9AA2A3');put(x,7.45,z,w*.7,.08,d*.7,'#7F8788');}
  if(p.sleeve)for(let i=0;i<5;i++)put(p.x,GROUND+.15+i*.3,p.z,.3,.3,.3,POLE.sleeve[i%2]);
 }
 for(const l of lamps){
  if(l.kind==='sodium'){const p=l.pole,[x,z,w,h,d]=across(p,-p.side*.5,.06,.06,1);put(x,l.y+.12,z,w,h,d,POLE.metal);
   const [hx,hz,hw,hh,hd]=across(p,-p.side*.95,.22,.1,.36);put(hx,l.y,hz,hw,hh,hd,'#D9D6CC');continue;}
  // Boulevard LED: slim pole, a two-piece curved arm, a flat head.
  const {base,dir}=l;put(base.x,GROUND+2.45,base.z,.11,4.9,.11,'#7E8789');
  put(base.x+dir*.2,4.83,base.z,.06,.5,.06,'#7E8789',0,-dir*.75);
  put(base.x+dir*.66,5.02,base.z,.62,.06,.06,'#7E8789');
  put(l.x,4.98,l.z,.44,.08,.2,'#E8E6DE');
 }
 return items;
}

// 64 px radial sprite, drawn once on a canvas (no file). Node tests have no document: no map, same geometry.
function poolSprite(){
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
 r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.3,'rgba(255,255,255,.6)');r.addColorStop(.65,'rgba(255,255,255,.18)');r.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=r;g.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

// Builds the cable web and the light pools under `root`. Returns {cables,pools,addLightPool,clearLightPools,setNight,plan,items}.
export function addStreet(root,{capacity=640}={}){
 const plan=streetPlan(),items=streetItems(plan);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(cablePositions(plan),3));
 const cableMat=new THREE.LineBasicMaterial({color:POLE.cable,transparent:true});
 const cables=new THREE.LineSegments(geometry,cableMat);cables.name='cables';cables.raycast=()=>{};root.add(cables);
 // Lines are always 1 px: from far away the web would turn to a grey scribble, so it fades out with the camera zoom.
 cables.onBeforeRender=(renderer,scene,camera)=>{cableMat.opacity=THREE.MathUtils.clamp((camera.zoom-.12)/.5,.22,1);};
 // Light pools: flat additive quads at street level (and a small glow under each lamp head), drawn only at night.
 const quad=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
 const poolMat=new THREE.MeshBasicMaterial({map:poolSprite(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const pools=new THREE.InstancedMesh(quad,poolMat,capacity);pools.name='light pools';pools.count=0;pools.visible=false;pools.raycast=()=>{};pools.frustumCulled=false;root.add(pools);
 const list=[],dummy=new THREE.Object3D(),c=new THREE.Color();
 function upload(){list.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.r*2,1,p.r*2);dummy.updateMatrix();pools.setMatrixAt(i,dummy.matrix);pools.setColorAt(i,c.set(p.color).multiplyScalar(p.strength*(p.dim??1)));});
  pools.count=list.length;pools.instanceMatrix.needsUpdate=true;if(pools.instanceColor)pools.instanceColor.needsUpdate=true;}
 // Public: a pool of `colour` light on the ground at (x,z). group lets a caller replace its own pools on redraw.
 // Konbini interiors read a little brighter than the brief's first pass (wave 3A night polish).
 function addLightPool(x,z,colour,radius=2.5,{y=.235,strength=.55,group=''}={}){if(list.length>=capacity)return -1;list.push({x,y,z,color:colour,r:radius,strength:strength*(group==='konbini'?1.3:1),group});upload();return list.length-1;}
 function clearLightPools(group){for(let i=list.length-1;i>=0;i--)if(list[i].group===group)list.splice(i,1);upload();}
 for(const l of plan.lamps){const col=LIGHT[l.kind],[r,s]=l.kind==='led'?[3.4,.55]:[3.2,.7];
  addLightPool(l.x,l.z,col,r,{strength:s,group:'street'});addLightPool(l.x,l.z,col,.5,{y:l.y-.07,strength:1,group:'street'});}
 return {cables,pools,plan,items,addLightPool,clearLightPools,
  setNight(v){pools.visible=v;cableMat.color.set(v?'#161B22':POLE.cable);},
  // Rare vending flicker (night only; small cool-white pools are the vending displays): in each hashed 9 s window about 1 cool-white pool in 12 stutters for ~1.5 s.
  // Instance colours are re-uploaded only when some pool changes state.
  tick(seconds){if(!pools.visible)return;const w=Math.floor(seconds/9),f=seconds/9-w;let changed=false;
   list.forEach((p,i)=>{if(!['props','konbini'].includes(p.group)||p.r>2.2||p.y>1)return;const cool=c.set(p.color).b>c.r;if(!cool)return;
    const on=hash(i,w,41)<1/12&&f>hash(i,w,42)*.8&&f<hash(i,w,42)*.8+.17,dim=on?(Math.sin(seconds*47+i)>.1?.25:1):1;
    if(dim!==(p.dim??1)){p.dim=dim;changed=true;}});
   if(changed)upload();}};
}
