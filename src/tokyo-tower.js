import * as THREE from 'three';
// Tokyo Tower (wave 5A, owner reference owner-tokyo-tower-aerial.webp; brief 3.11). Pure plan + one builder.
// Proportions of the real 333 m tower, scaled to 50 units (≈ 2× the tallest slab, 23.6): main observatory centred at
// 0.45 H (150 m), top deck at 0.75 H (250 m), the antenna mast above 0.81 H. Four legs splayed on a concave curve that
// is nearly vertical above the main deck; their feet stand 4.65 off the axis (owner 2026-10-10: the tower stands in its
// own park, the north half of the Shiba block (lots.js TOWER_PARK, 16 × 10.2), so the base spans the lawn like the real
// 80 m one; 4.65 + the leg keeps the four feet inside the park, the front pair on the paver forecourt).
// Lattice: each leg is a 4-chord column with X-braced faces and a ring girder every panel; between the legs a bottom
// arch, girders and X-bracing on the outer faces; above the deck one 4-chord shaft. Members are flat ribbons (2
// triangles, in their face plane, double-sided) in ONE instanced batch, ≈ 1.25k instances / 2.5k triangles; the decks,
// mast and footings are a few dozen boxes for city.js's tower box batch.
// Colour: International Orange and white in HORIZONTAL bands (TOWER.bands, by world height), white at the main deck
// and around the top deck; at night the orange glows warm (per-instance nightLight), the white a little.
// (The FootTown podium over the street is gone: owner 2026-10-10, nothing stands on a road; the park is its setting.)
export const TOWER={height:50,feet:4.65,leg:.42,legTop:.3,panels:14,shaftPanel:1.3,
 deck:{y0:21.4,y1:23.6,half:2.05},top:{y0:37.1,y1:38,half:.95},shaftDeck:1.35,shaftTop:.62,mastBase:40.5,
 orange:'#F05A28',white:'#F4F1EA',glowOrange:'#FF7A36',glowWhite:'#FFE2B8',
 // [y0, y1, 'O'|'W'] from the feet to the tip; alternate, white at the main deck (20.6–24.6) and the top deck (34.4–38.8).
 bands:[[0,5.6,'O'],[5.6,7.3,'W'],[7.3,12.4,'O'],[12.4,14,'W'],[14,20.6,'O'],[20.6,24.6,'W'],[24.6,28.4,'O'],[28.4,30,'W'],
  [30,34.4,'O'],[34.4,38.8,'W'],[38.8,42,'O'],[42,43.6,'W'],[43.6,46.4,'O'],[46.4,50,'W']]};
export const bandAt=y=>{for(const [a,b,c] of TOWER.bands)if(y>=a&&y<b)return c;return 'W';};
const lerp=(a,b,t)=>a+(b-a)*t;
// Leg centre distance from the axis and leg half-size at height y (legs: feet → deck).
export function legAt(y){const T=TOWER,yd=T.deck.y0,t=Math.min(1,Math.max(0,y/yd)),h=lerp(T.leg,T.legTop,t);
 return {r:(T.shaftDeck-T.legTop)+(T.feet-(T.shaftDeck-T.legTop))*Math.pow(1-t,2.3),h};}
// Shaft half-width above the deck (slightly concave), then the short neck to the mast.
export function shaftAt(y){const T=TOWER;if(y<=T.top.y1){const t=(y-T.deck.y0)/(T.top.y1-T.deck.y0);return lerp(T.shaftDeck,T.shaftTop,1-Math.pow(1-t,1.25));}
 return lerp(T.shaftTop,.4,(y-T.top.y1)/(T.mastBase-T.top.y1));}

// The plan, centred on (x, z). members: {a:[x,y,z], b, n:[x,y,z] face normal, w, band}; boxes: {x,y,z,w,h,d,color,light,glow,ry}.
export function towerPlan(x=0,z=0){
 const T=TOWER,members=[],boxes=[];
 const mem=(a,b,n,w)=>{const band=bandAt((a[1]+b[1])/2);members.push({a,b,n,w,band});};
 const yd=T.deck.y0,y0=.2,levels=Array.from({length:T.panels+1},(_,i)=>y0+(yd-y0)*i/T.panels);
 // Legs.
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const P=(y,cx,cz)=>{const {r,h}=legAt(y);return [x+sx*r+cx*h,y,z+sz*r+cz*h];};
  for(let k=0;k<T.panels;k++){const ya=levels[k],yb=levels[k+1],cw=lerp(.2,.11,k/T.panels);
   for(const cx of [-1,1])for(const cz of [-1,1])mem(P(ya,cx,cz),P(yb,cx,cz),[cx*Math.SQRT1_2,0,cz*Math.SQRT1_2],cw);
   for(const s of [-1,1]){   // the two x faces and the two z faces of the leg: an X each, a ring at the top
    mem(P(ya,s,-1),P(yb,s,1),[s,0,0],.08);mem(P(ya,s,1),P(yb,s,-1),[s,0,0],.08);
    mem(P(ya,-1,s),P(yb,1,s),[0,0,s],.08);mem(P(ya,1,s),P(yb,-1,s),[0,0,s],.08);
    mem(P(yb,s,-1),P(yb,s,1),[s,0,0],.1);mem(P(yb,-1,s),P(yb,1,s),[0,0,s],.1);}}
 }
 // Between the legs, on each outer face: the bottom arch, girders every second panel from y 7, X-bracing above y 9.
 for(const ax of ['x','z'])for(const s of [-1,1]){
  // Inner chords of the two legs on this face (the ones nearest the face's centre line).
  const at=(y,side)=>{const {r,h}=legAt(y),o=s*(r+h),q=side*(r-h);return ax==='x'?[x+o,y,z+q]:[x+q,y,z+o];};
  const n=ax==='x'?[s,0,0]:[0,0,s];
  const arc=[];for(let i=0;i<=6;i++){const t=i/6,ya=lerp(2.4,5.9,Math.sin(Math.PI*t)),A=at(ya,-1),B=at(ya,1);arc.push(A.map((v,j)=>lerp(v,B[j],t)));}
  for(let i=0;i<6;i++)mem(arc[i],arc[i+1],n,.12);
  for(let k=0;k<T.panels;k++){const ya=levels[k],yb=levels[k+1];
   if(yb>=7&&k%2===1)mem(at(yb,-1),at(yb,1),n,.12);
   if(ya>=9){mem(at(ya,-1),at(yb,1),n,.08);mem(at(ya,1),at(yb,-1),n,.08);}}
 }
 // Shaft: deck → top deck → mast base, one 4-chord lattice.
 const sl=[];for(let y=yd;y<T.top.y1-.01;y+=T.shaftPanel)sl.push(y);sl.push(T.top.y1);for(const y of [39.25,T.mastBase])sl.push(y);
 for(let k=0;k<sl.length-1;k++){const ya=sl[k],yb=sl[k+1],C=(y,cx,cz)=>{const w=shaftAt(y);return [x+cx*w,y,z+cz*w];},cw=lerp(.16,.08,k/sl.length);
  for(const cx of [-1,1])for(const cz of [-1,1])mem(C(ya,cx,cz),C(yb,cx,cz),[cx*Math.SQRT1_2,0,cz*Math.SQRT1_2],cw);
  for(const s of [-1,1]){mem(C(ya,s,-1),C(yb,s,1),[s,0,0],.07);mem(C(ya,s,1),C(yb,s,-1),[s,0,0],.07);
   mem(C(ya,-1,s),C(yb,1,s),[0,0,s],.07);mem(C(ya,1,s),C(yb,-1,s),[0,0,s],.07);
   mem(C(yb,s,-1),C(yb,s,1),[s,0,0],.085);mem(C(yb,-1,s),C(yb,1,s),[0,0,s],.085);}}
 // Boxes: decks (white, two dark glass storeys, a cap), mast segments in the bands, footings.
 const B=(y,w,h,color,light=null,glow=1,d=w)=>boxes.push({x,y,z,w,h,d,color,light,glow});
 const W=T.white,O=T.orange,GL='#2F3E46';
 {const {y0:a,y1:b,half:h}=T.deck;B((a+b)/2,2*h,b-a,W);B(a+.55,2*h+.08,.5,GL,'#FFE6B8',.9);B(a+1.55,2*h+.08,.5,GL,'#FFE6B8',.9);B(b+.06,2*h+.14,.12,W);B(a-.1,2*h-.5,.2,O,T.glowOrange,.7);}
 {const {y0:a,y1:b,half:h}=T.top;B((a+b)/2,2*h,b-a,W);B(a+.45,2*h+.06,.36,GL,'#FFE6B8',.9);B(b+.05,2*h+.1,.1,W);}
 const mast=[[T.mastBase,42.4,.36],[42.4,44.6,.26],[44.6,47,.18],[47,49.2,.1],[49.2,T.height,.05]];
 for(const [a,b,w] of mast){const mid=(a+b)/2,c=bandAt(mid)==='O'?O:W;B(mid,w,b-a,c,c===O?T.glowOrange:T.glowWhite,c===O?.75:.3);}
 for(const y of [42.4,44.6])B(y,.62,.08,W,T.glowWhite,.3);
 for(const sx of [-1,1])for(const sz of [-1,1])boxes.push({x:x+sx*T.feet,y:.3,z:z+sz*T.feet,w:.95,h:.4,d:.95,color:'#B8B3A8'});
 return {members,boxes};
}

// Ribbon batch: a unit plane per member, basis (across × w, along × length, face normal), double-sided toon.
export function towerRibbons(members,material){
 const geo=new THREE.PlaneGeometry(1,1),n=Math.max(1,members.length),mesh=new THREE.InstancedMesh(geo,material,n),light=new Float32Array(n*3);
 const m=new THREE.Matrix4(),a=new THREE.Vector3(),b=new THREE.Vector3(),d=new THREE.Vector3(),nn=new THREE.Vector3(),w=new THREE.Vector3(),c=new THREE.Color();
 const T=TOWER;
 members.forEach((v,i)=>{a.fromArray(v.a);b.fromArray(v.b);d.subVectors(b,a);const len=d.length();d.normalize();nn.fromArray(v.n);
  w.crossVectors(nn,d);if(w.lengthSq()<1e-6)w.set(1,0,0);w.normalize();nn.crossVectors(d,w).normalize();
  m.makeBasis(w.clone().multiplyScalar(v.w),d.clone().multiplyScalar(len+v.w*.5),nn).setPosition(a.add(b).multiplyScalar(.5));mesh.setMatrixAt(i,m);
  const o=v.band==='O';mesh.setColorAt(i,c.set(o?T.orange:T.white));c.set(o?T.glowOrange:T.glowWhite).multiplyScalar((o?.85:.3)*.55);light.set([c.r,c.g,c.b],i*3);});
 geo.setAttribute('nightLight',new THREE.InstancedBufferAttribute(light,3));
 mesh.count=members.length;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='tokyo tower lattice';mesh.computeBoundingSphere();return mesh;
}
