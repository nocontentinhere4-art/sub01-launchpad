import * as THREE from 'three';
import * as CS from './city-state.js';
import {cityLayout} from './lots.js';
import {night as nightShared,toon} from './toon.js';
// Wave 5C (owner reference owner-tokyo-tower-aerial.webp): the Tokyo Skytree in the far skyline and the Shuto
// expressway curving over the river. Pure plans (tested) + two builders; city-life.js owns the river and the batches.
// Cost: the Skytree and the expressway viaduct are ONE draw call each; piers, lamps and cars ride city-life's batches.

// ---------- The river (city-life canalLayout reads this): the old canal widened EAST to a Sumida-like river ----------
// The west wall stays where the canal's was (CANAL_X − 5.5: the city edge, explore's bridge start); the east wall moves out.
export const RIVER={half:10,westWall:5.5};
export const riverEdges=()=>{const x0=(CS.CANAL_X??108)-RIVER.westWall;return {x0,x1:x0+2*RIVER.half,x:x0+RIVER.half};};
// The ground plane's hole for the water (main.js groundPlane cuts CANAL_X ± 6 today, the old canal): walls included.
export const riverHole=()=>{const r=riverEdges();return {x0:r.x0-.5,x1:r.x1+.5};};

// ---------- Tokyo Skytree (634 m) ----------
// Same scale as the 333 m Tokyo Tower (tokyo-tower.js TOWER.height 50): 50 × 634/333 ≈ 95. Stands in the north skyline
// just right of Fuji as seen from the overview camera, so it reads like the photo: Fuji, then the needle.
export const TOKYO_TOWER_HEIGHT=50;
export const SKYTREE={x:-10,z:-114,height:95,clear:7,
 // Body: [y, radius, triangle-ness] — a triangular base (68 m sides → circumradius 5.9) that turns circular by 300 m.
 body:[[0,5.9,1],[7.5,4.9,.9],[22.5,3.7,.55],[37.4,2.85,.2],[45,2.55,0],[57,2.1,0],[66,1.65,0],[74.4,1.05,0]],
 // Tembo Deck (350 m, two tiers) and Tembo Galleria (450 m): [radius, y0, y1]; window bands lit at night.
 decks:[[3.55,50.2,52],[3.9,52,53.6],[2.45,66.1,68.1]],bands:[[3.92,52.5,53.2],[2.47,66.8,67.6],[3.57,50.7,51.5]],
 // Gain tower and antenna above 497 m: [r0, r1, y0, y1].
 mast:[[.78,.6,74.4,84],[.46,.36,84,91],[.22,.1,91,95]],
 day:{body:'#E9F1F5',deck:'#D6E0E7',band:'#4E6577',mast:'#C8D2D8'},
 // Night: the "Miyabi" purple body, pale blue deck rims, warm lit windows.
 night:{body:['#4E3592','#8A63E0','#B28CF5'],deck:'#9FC3F0',band:'#FFF1D0',mast:'#D9D2FF'},
 lights:[[0,95.3,0],[0,84.2,0],[1.05,74.6,0],[-1.05,74.6,0],[3.9,53.75,0],[-3.9,53.75,0]]};
export const skytreeRatio=()=>SKYTREE.height/TOKYO_TOWER_HEIGHT;
// Radius of the body at angle a for a shape blended between a circle (tri 0) and an equilateral triangle (tri 1).
export function skytreeRadius(r,tri,a){const s=((a%(2*Math.PI/3))+2*Math.PI/3)%(2*Math.PI/3)-Math.PI/3;return r*(1-tri+tri*.5/Math.cos(s));}
export function skytreeGeometry(){
 const S=SKYTREE,pos=[],uv=[],col=[],nit=[],c=new THREE.Color(),L=new THREE.Vector3(.2,0,1).normalize();
 const push=(x,y,z,u,v,day,nightC,nx,nz)=>{const k=.8+.2*Math.max(0,nx*L.x+nz*L.z);pos.push(S.x+x,y,S.z+z);uv.push(u,v);c.set(day).multiplyScalar(k);col.push(c.r,c.g,c.b);c.set(nightC).multiplyScalar(.85+.15*k);nit.push(c.r,c.g,c.b);};
 const nightBody=y=>{const t=y/S.body.at(-1)[0],[a,b,d]=S.night.body.map(h=>new THREE.Color(h));return '#'+(t<.5?a.lerp(b,t*2):b.lerp(d,t*2-1)).getHexString();};
 // Lathe body, 12 sides (triangle corners at 0°, 120°, 240°), lattice texture wrapped 4× around.
 const N=12;for(let j=0;j<S.body.length-1;j++){const A=S.body[j],B=S.body[j+1];
  for(let k=0;k<N;k++){const a0=2*Math.PI*k/N,a1=2*Math.PI*(k+1)/N,P=(R,a)=>[skytreeRadius(R[1],R[2],a)*Math.cos(a),R[0],skytreeRadius(R[1],R[2],a)*Math.sin(a)];
   const q=[[P(A,a0),k/N*4,A[0]/6,a0],[P(A,a1),(k+1)/N*4,A[0]/6,a1],[P(B,a1),(k+1)/N*4,B[0]/6,a1],[P(B,a0),k/N*4,B[0]/6,a0]];
   for(const i of [0,2,1,0,3,2]){const [[x,y,z],u,v,a]=q[i];push(x,y,z,u,v,S.day.body,nightBody(y),Math.cos(a),Math.sin(a));}}}
 // Rings (decks, window bands, mast sections): open or capped cylinders mapped to a plain texel.
 const ring=(r0,r1,y0,y1,segs,day,nightC,caps)=>{for(let k=0;k<segs;k++){const a0=2*Math.PI*k/segs,a1=2*Math.PI*(k+1)/segs,cs=[Math.cos(a0),Math.cos(a1)],sn=[Math.sin(a0),Math.sin(a1)];
   const v=(i,r,y)=>[r*cs[i],y,r*sn[i],cs[i],sn[i]],q=[v(0,r0,y0),v(1,r0,y0),v(1,r1,y1),v(0,r1,y1)];
   for(const i of [0,2,1,0,3,2]){const [x,y,z,nx,nz]=q[i];push(x,y,z,.5,.25,day,nightC,nx,nz);}
   if(caps)for(const [r,y,up] of [[r1,y1,1],[r0,y0,-1]]){const t=[[0,y,0],[r*cs[0],y,r*sn[0]],[r*cs[1],y,r*sn[1]]];for(const i of up>0?[0,2,1]:[0,1,2])push(...t[i],.5,.25,day,nightC,0,0);}}};
 for(const [r,y0,y1] of S.decks)ring(r,r,y0,y1,16,S.day.deck,S.night.deck,true);
 for(const [r,y0,y1] of S.bands)ring(r,r,y0,y1,16,S.day.band,S.night.band,false);
 for(const [r0,r1,y0,y1] of S.mast)ring(r0,r1,y0,y1,8,S.day.mast,S.night.mast,y1===S.height);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setAttribute('aNight',new THREE.Float32BufferAttribute(nit,3));g.computeBoundingSphere();return g;
}
// Canvas lattice: the white diagonal truss of the real tower (no image files). Node tests have no document: no map.
function canvasTexture(w,h,draw,{wrapT=true}={}){if(typeof document==='undefined')return null;const cv=document.createElement('canvas');cv.width=w;cv.height=h;draw(cv.getContext('2d'),w,h);
 const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.wrapT=wrapT?THREE.RepeatWrapping:THREE.ClampToEdgeWrapping;t.anisotropy=4;return t;}
const latticeTexture=()=>canvasTexture(64,64,(g,w,h)=>{g.fillStyle='#F4F8FA';g.fillRect(0,0,w,h);g.strokeStyle='#8EA3B2';g.lineWidth=3;
 g.beginPath();g.moveTo(0,0);g.lineTo(w,h);g.moveTo(w,0);g.lineTo(0,h);g.moveTo(0,1);g.lineTo(w,1);g.stroke();g.lineWidth=1.5;g.strokeStyle='#B4C3CD';g.beginPath();g.moveTo(0,h/2);g.lineTo(w/4,h/2);g.moveTo(w*3/4,h/2);g.lineTo(w,h/2);g.stroke();});
export function addSkytree(root){
 const mat=new THREE.MeshBasicMaterial({vertexColors:true,map:latticeTexture(),toneMapped:false});
 // Day and night vertex colours mixed by the shared night amount; the foot dissolves into the haze like the skyline.
 mat.onBeforeCompile=sh=>{sh.uniforms.uLmNight=nightShared;
  sh.vertexShader='attribute vec3 aNight;uniform float uLmNight;varying float vLmY;\n'+sh.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\n vColor.rgb=mix(vColor.rgb,aNight,uLmNight);').replace('#include <project_vertex>','#include <project_vertex>\n vLmY=(modelMatrix*vec4(transformed,1.)).y;');
  sh.fragmentShader='varying float vLmY;\n'+sh.fragmentShader.replace('#include <fog_fragment>','#include <fog_fragment>\n #ifdef USE_FOG\n gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,.85*(1.-smoothstep(0.,14.,vLmY)));\n #endif');};
 mat.customProgramCacheKey=()=>'skytree';
 const mesh=new THREE.Mesh(skytreeGeometry(),mat);mesh.name='skytree';mesh.raycast=()=>{};root.add(mesh);
 return {mesh,material:mat,lights:SKYTREE.lights.map(([x,y,z])=>({x:SKYTREE.x+x,y,z:SKYTREE.z+z}))};
}

// ---------- The Shuto expressway ----------
// A rounded polyline: from the south edge up the river's east bank (over the riverside park), a long curve across the
// river above the z = 2 bridge, up the city's east edge between the last lots and the river wall, west along the gap
// between the −58 and −28 block rows (behind Shiba), then north up the −43.5 boulevard and out through Fuji's skyline gap.
// Deck top 6.8 (≥ 5.5 over every road; underside 6.25 clears trees, lamps and the bridges), 2 lanes, left-hand traffic.
export const EXPRESSWAY={y:6.8,half:2.3,wall:.22,wallH:1.25,slab:.55,lane:.85,lampEvery:18,pierEvery:14,cars:6,speed:7,uvScale:8,
 sodium:'#FFB347',colors:{pier:'#A9A79D',cap:'#9C9A91',lamp:'#5B6466'}};
export function expresswayCorners(){
 const E=CS.CITY_EXTENT,R=riverEdges(),edgeX=R.x0-1.9,eastX=R.x1+8,gapZ=(CS.ROAD_Z[1]+CS.ROAD_Z[2])/2-1,bx=CS.BOULEVARD_X[1];
 // Corner radii: wide on the open river banks, tight where the gap behind the blocks meets the edge and the boulevard.
 // The ends run 80 past the city so they fade out in the fog instead of stopping in view.
 return {points:[[eastX,E.maxZ+80],[eastX,24],[edgeX,-14],[edgeX,gapZ],[bx,gapZ],[bx,E.minZ-80]],radii:[14,14,4.5,5]};
}
export function roundedPath(P,R,step=Math.PI/20){
 const out=[{x:P[0][0],z:P[0][1]}];
 for(let i=1;i<P.length-1;i++){
  const [ax,az]=P[i-1],[bx,bz]=P[i],[cx,cz]=P[i+1];let ux=bx-ax,uz=bz-az,l=Math.hypot(ux,uz);ux/=l;uz/=l;let vx=cx-bx,vz=cz-bz;l=Math.hypot(vx,vz);vx/=l;vz/=l;
  const th=Math.acos(Math.max(-1,Math.min(1,ux*vx+uz*vz))),r=R[i-1],t=r*Math.tan(th/2),sx=bx-ux*t,sz=bz-uz*t,ex=bx+vx*t,ez=bz+vz*t;
  // Centre on the inside of the turn: left normal (uz, −ux) for a left turn (cross < 0), right normal otherwise.
  const left=ux*vz-uz*vx<0,ox=sx+(left?uz:-uz)*r,oz=sz+(left?-ux:ux)*r,n=Math.max(1,Math.ceil(th/step));
  const rot=(sg,a)=>{const px=sx-ox,pz=sz-oz,c=Math.cos(sg*a),s=Math.sin(sg*a);return {x:ox+px*c-pz*s,z:oz+px*s+pz*c};};
  const e1=rot(1,th),sg=Math.hypot(e1.x-ex,e1.z-ez)<1e-6*r+1e-6?1:-1;
  for(let k=0;k<=n;k++)out.push(rot(sg,th*k/n));}
 out.push({x:P.at(-1)[0],z:P.at(-1)[1]});
 // Arc length and unit heading per node (the heading of the segment that leaves it; the last keeps the previous one).
 let s=0;out.forEach((p,i)=>{if(i){s+=Math.hypot(p.x-out[i-1].x,p.z-out[i-1].z);}p.s=s;});
 out.forEach((p,i)=>{const a=out[Math.min(i,out.length-2)],b=out[Math.min(i,out.length-2)+1],l=Math.hypot(b.x-a.x,b.z-a.z);p.dx=(b.x-a.x)/l;p.dz=(b.z-a.z)/l;});
 return out;
}
let routeCache=null;
export function expresswayRoute(){if(routeCache)return routeCache;const {points,radii}=expresswayCorners(),nodes=roundedPath(points,radii);return routeCache={nodes,length:nodes.at(-1).s};}
// Point at arc length s: position, unit heading and the left normal (heading north, left is west).
export function routeAt(s,route=expresswayRoute()){
 const N=route.nodes;s=Math.max(0,Math.min(route.length,s));let lo=0,hi=N.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(N[m].s<=s)lo=m;else hi=m;}
 const a=N[lo],b=N[hi],t=b.s>a.s?(s-a.s)/(b.s-a.s):0,dx=a.dx,dz=a.dz;return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,dx,dz,lx:dz,lz:-dx};}
// Cars: 6, half each way, evenly spaced per lane so they never meet; they enter and leave in the fog at both ends.
export function expresswayCar(t,i,route=expresswayRoute()){
 const E=EXPRESSWAY,dir=i%2?-1:1,L=route.length,s0=L*(Math.floor(i/2)/Math.ceil(E.cars/2)+(i%2)*.17),s=((s0+dir*E.speed*(1+.06*(i%3))*t)%L+L)%L,p=routeAt(s,route);
 const hx=p.dx*dir,hz=p.dz*dir;return {x:p.x+p.lx*dir*E.lane,y:E.y,z:p.z+p.lz*dir*E.lane,yaw:Math.atan2(-hz,hx),dir,s};}

// Footprints (lots and spots of the city layout) the piers must miss; streets and boulevards a single column must miss.
const rectHit=(x,z,hw,hd,r,pad=0)=>Math.abs(x-r.x)<hw+r.w/2+pad&&Math.abs(z-r.z)<hd+r.d/2+pad;
export function plotRects(){const L=cityLayout([]);return [...L.lots.map(l=>({x:l.x,z:l.z,w:l.width,d:l.depth,kind:'lot'})),...L.spots.map(s=>({x:s.x,z:s.z,w:s.width,d:s.depth,kind:'spot'}))];}
export function onCarriageway(x,z){const E=CS.CITY_EXTENT,inCity=x>E.minX-1&&x<E.maxX+1&&z>E.minZ-1&&z<E.maxZ+1;
 return inCity&&(CS.ROAD_Z.some(r=>Math.abs(z-r)<3.05)||CS.BOULEVARD_X.some(b=>Math.abs(x-b)<2.95));}
// Piers every ~14: a single column on open ground, in the river only between the boat lanes and clear of the bridges,
// else a portal frame (two legs either side, the Shuto's way over a street). Nothing on a lot, a spot or the terrace walks.
// Portal legs stand 2.98 off the centre line: past a street's carriageway (2.95), inside the lot lines (3.5 off a boulevard).
export const PORTAL=2.98;
export function expresswayPiers({route=expresswayRoute(),rects=plotRects(),river=riverEdges(),bridges=[-38,2,42],lanes=[[2.1,3.9],[5.55,7.45]]}={}){
 const E=EXPRESSWAY,out=[],metroZ=CS.METRO_Z??108,ext=CS.CITY_EXTENT;
 const groundOk=(x,z,hw)=>{
  if(rects.some(r=>rectHit(x,z,hw,hw,r,.2)))return false;
  if(bridges.some(b=>Math.abs(z-b)<2.4+hw&&x>river.x0-2.6&&x<river.x1+2.6))return false;
  if(Math.abs(z-metroZ)<3.5+hw&&x<ext.maxX+1)return false;
  const dw=Math.min(Math.abs(x-(river.x0-.75)),Math.abs(x-(river.x1+.75)));if(dw<.75+hw)return false;   // terrace walks
  if(x>river.x0-hw&&x<river.x1+hw){const d=Math.abs(x-river.x);if(d+hw>RIVER.half-.4)return false;return !lanes.some(([a,b])=>d+hw>a-.15&&d-hw<b+.15);}
  return true;};
 const onMap=(x,z)=>z>ext.minZ-40&&z<ext.maxZ+40;   // piers and lamps only where there is ground (main.js plane: city + 40)
 for(let s=E.pierEvery*.5;s<route.length-2;s+=E.pierEvery){
  if(!onMap(routeAt(s,route).x,routeAt(s,route).z))continue;let placed=null;
  for(const ds of [0,1.5,-1.5,3,-3,4.5,-4.5]){const p=routeAt(s+ds,route),inRiver=p.x>river.x0&&p.x<river.x1;
   if(groundOk(p.x,p.z,.4)&&!onCarriageway(p.x,p.z)){placed={kind:inRiver?'river':'column',x:p.x,z:p.z,dx:p.dx,dz:p.dz,legs:[[p.x,p.z]]};break;}
   const off=PORTAL,legs=[-1,1].map(k=>[p.x+p.lx*k*off,p.z+p.lz*k*off]);
   if(legs.every(([x,z])=>groundOk(x,z,.25)&&!onCarriageway(x,z))){placed={kind:'portal',x:p.x,z:p.z,dx:p.dx,dz:p.dz,legs};break;}}
  if(placed)out.push(placed);}
 return out;
}
// Lamps: sodium heads on short arms, every 18 along the deck, alternating sides (head position is the light).
export function expresswayLamps(route=expresswayRoute()){const E=EXPRESSWAY,out=[],ext=CS.CITY_EXTENT;let k=0;
 for(let s=E.lampEvery*.5;s<route.length;s+=E.lampEvery,k++){const p=routeAt(s,route),side=k%2?1:-1,o=E.half-E.wall/2;if(p.z<ext.minZ-40||p.z>ext.maxZ+40)continue;
  out.push({x:p.x+p.lx*side*o,z:p.z+p.lz*side*o,hx:p.x+p.lx*side*(o-.85),hz:p.z+p.lz*side*(o-.85),dx:p.dx,dz:p.dz,side});}
 return out;}
// Boxes for city-life's batches: piers (core), lamp poles and arms (detail), lamp heads (night windows, detail).
export function expresswayItems({route=expresswayRoute(),piers=expresswayPiers({route}),lamps=expresswayLamps(route),waterY=-1.05}={}){
 const E=EXPRESSWAY,C=E.colors,core=[],detail=[],glow=[],under=E.y-E.slab,yaw=(dx,dz)=>Math.atan2(-dz,dx);
 for(const p of piers){const ry=yaw(p.dx,p.dz),y0=p.kind==='river'?waterY-.2:0;
  if(p.kind==='portal'){for(const [x,z] of p.legs)core.push({x,y:(under-.5)/2,z,w:.5,h:under-.5,d:.5,ry,color:C.pier});
   core.push({x:p.x,y:under-.27,z:p.z,w:.85,h:.54,d:2*PORTAL+.5,ry,color:C.cap});}
  else{core.push({x:p.x,y:(y0+under-.4)/2,z:p.z,w:p.kind==='river'?1.3:.8,h:under-.4-y0,d:.8,ry,color:C.pier});core.push({x:p.x,y:under-.22,z:p.z,w:1,h:.44,d:2*E.half-.4,ry,color:C.cap});}}
 for(const l of lamps){const ry=yaw(l.dx,l.dz),top=E.y+2.6;
  detail.push({x:l.x,y:E.y+1.3,z:l.z,w:.09,h:2.6,d:.09,ry,color:C.lamp},{x:(l.x+l.hx)/2,y:top,z:(l.z+l.hz)/2,w:.07,h:.07,d:.9,ry,color:C.lamp});
  glow.push({x:l.hx,y:top-.07,z:l.hz,w:.42,h:.08,d:.24,ry,color:E.sodium});}
 return {core,detail,glow};
}
// Deck texture: asphalt with a yellow centre line and white edge lines (v 0–.5, across the carriageway), the outer face
// (v .5–.75: slab, concrete parapet, sound-barrier panels), the inner face (v .75–.9) and plain concrete (v .9–1).
// u runs along the deck, one tile per 8 units, with an expansion joint per tile.
const deckTexture=()=>canvasTexture(64,256,(g,w,h)=>{const V=(v0,v1,c)=>{g.fillStyle=c;g.fillRect(0,(1-v1)*h,w,(v1-v0)*h);},line=(v,c,t=2)=>{g.fillStyle=c;g.fillRect(0,(1-v)*h-t/2,w,t);};
 V(0,.5,'#575B5F');for(let i=0;i<220;i++){g.fillStyle=`rgba(${i%2?255:0},${i%2?255:0},${i%2?255:0},.05)`;g.fillRect((i*37)%w,(i*91)%(h/2)+h/2,2+(i%3),1+(i%2));}
 for(const v of [.12,.38]){g.fillStyle='rgba(0,0,0,.08)';g.fillRect(0,(1-v)*h-5,w,10);}
 line(.03,'#E8E6DE',3);line(.47,'#E8E6DE',3);line(.243,'#E2B53A',2.5);line(.257,'#E2B53A',2.5);g.fillStyle='#4A4E52';g.fillRect(0,h/2,1,h/2);
 const face=(v0,v1,slab)=>{const a=v0+(v1-v0)*slab,b=a+(v1-v0)*.42;V(v0,a,'#9A988F');V(a,b,'#BEBCB3');V(b,v1,'#A9BEC6');line(b,'#6F7F86',2);
  g.fillStyle='#8DA2AA';for(let x=0;x<w;x+=16)g.fillRect(x,(1-v1)*h,2,(v1-b)*h);line(a,'#8A887F',1.5);};
 face(.5,.75,.3);face(.75,.9,0);V(.9,1,'#B1AFA6');});
export function expresswayGeometry(route=expresswayRoute()){
 const E=EXPRESSWAY,N=route.nodes,pos=[],nor=[],uv=[],Y=E.y,h=E.half,w=E.wall,yb=Y-E.slab,yt=Y+E.wallH,U=E.uvScale;
 const P=(i,l,y)=>{const n=N[i],a=N[Math.max(0,i-1)],tx=n.dx+a.dx,tz=n.dz+a.dz,tl=Math.hypot(tx,tz),lx=tz/tl,lz=-tx/tl;return [n.x+lx*l,y,n.z+lz*l];};
 const quad=(i,l0,y0,l1,y1,v0,v1,want)=>{const a=P(i,l0,y0),b=P(i+1,l0,y0),c=P(i+1,l1,y1),d=P(i,l1,y1),u0=N[i].s/U,u1=N[i+1].s/U;
  const e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],e2=[d[0]-a[0],d[1]-a[1],d[2]-a[2]];let n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
  const flip=n[0]*want[0]+n[1]*want[1]+n[2]*want[2]<0;const L=Math.hypot(...n)||1;n=n.map(v=>(flip?-v:v)/L);
  const V=[[a,u0,v0],[b,u1,v0],[c,u1,v1],[d,u0,v1]];for(const k of flip?[0,2,1,0,3,2]:[0,1,2,0,2,3]){pos.push(...V[k][0]);nor.push(...n);uv.push(V[k][1],V[k][2]);}};
 for(let i=0;i<N.length-1;i++){const n=N[i],lx=n.dz,lz=-n.dx;
  quad(i,-(h-w),Y,h-w,Y,0,.5,[0,1,0]);quad(i,-h,yb,h,yb,.9,.95,[0,-1,0]);
  for(const k of [-1,1]){const out=[lx*k,0,lz*k];quad(i,k*h,yb,k*h,yt,.5,.75,out);quad(i,k*(h-w),Y,k*(h-w),yt,.75,.9,out.map(v=>-v));quad(i,k*(h-w),yt,k*h,yt,.95,1,[0,1,0]);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeBoundingSphere();return g;
}
export function addExpressway(root){
 const mat=toon({map:deckTexture()});mat.name='expressway';
 const mesh=new THREE.Mesh(expresswayGeometry(),mat);mesh.name='expressway';mesh.castShadow=mesh.receiveShadow=true;mesh.raycast=()=>{};root.add(mesh);
 return {mesh,material:mat};
}
// Car parts (local +x = forward) for city-life's boat batch: body, cabin or box, head lamps (white) and tail lamps (red).
export const EXPRESSWAY_CARS=[['#F1EEE6','sedan'],['#2B2F33','sedan'],['#B9BDBF','van'],['#F1EEE6','truck'],['#2F6FB5','sedan'],['#C8452D','kei']];
export function carParts(kind,color){const p=[],B=(x,y,z,w,h,d,c,glow=null)=>p.push({x,y,z,w,h,d,color:c,glow});
 const len=kind==='truck'?2.4:kind==='kei'?1.5:kind==='van'?2:1.9,hl=len/2;
 B(0,.33,0,len,.4,.92,color);
 if(kind==='truck'){B(hl-.35,.75,0,.7,.55,.9,'#F1EEE6');B(-.35,.85,0,len-.75,.95,.95,'#D8D5CC');}
 else B(kind==='van'?-.05:-.1,.7,0,kind==='van'?len-.3:len*.55,kind==='van'?.5:.36,.84,'#2B3A48');
 B(hl+.01,.36,0,.03,.1,.74,'#E8E6DE','#FFF6DA');B(-hl-.01,.4,0,.03,.1,.74,'#8C2F2A','#FF3A2A');
 return p;}
