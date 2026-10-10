import * as THREE from 'three';
// Facade surfaces (art direction wave 5A: "troppe cose quadratose, servono robe più reali"). ONE 1024² RGBA atlas,
// generated in pure JS (no image file, no canvas: deterministic, works in node), 4 × 4 slots of 256 px:
//   slots 0–14  tileable surfaces, period 240 px inside an 8 px wrapped gutter (so mips up to level 3 never bleed);
//   slot 15     four 128 px decals (fan grille, manhole, door, worn paint).
// Channels: R = albedo multiplier, G = AO / grout multiplier (the "detail shading" map: grout, board shadows, rib
// shading), B = accent mask (awning stripes → cream). The shader multiplies the instance colour by 4·R·G (R is
// normalised per tiled slot so that its mean is exactly 1: the average colour never shifts when the detail fades out)
// and mixes toward uFacAccent by B.
// Mapping (vertical faces): u = world x or z / 3 m, v = (world y − y0) / 2.5 m, y0 = ground + 3.0, so storey-scale
// patterns (glass spandrels, boards) line up with the upper floors; horizontal faces: (x, z) / 3 m. A hashed phase per
// instance shifts u so neighbours never align. A negative id swaps u/v (boulevard asphalt along z, kawara with the
// ridge along z, a fan on the ±x face).
// Detail fades with the pixel footprint (full ≤ 9 cm/px, i.e. district zoom; gone ≥ 21 cm/px, the overview) and with
// the shared `facadeDetail` amount (city.setDetail(false) → 0).
export const FACADE={none:0,tileWhite:1,tileBeige:2,brick:3,concrete:4,metal:5,plaster:6,glass:7,wood:8,shutter:9,awning:10,
 membrane:11,kawara:12,asphalt:13,pavers:14,siding:15,fan:17,manhole:18,door:19,paint:20};
// Flags added to the id: noEdge (no bevel / edge AO: prisms, arcs), inset (roof slabs: AO inward from the edges, the
// parapet's shadow on a sunken roof). A negative value = u/v swapped. facadeCode('kawara',{swap:true}) → −12.
export const FAC_FLAG={noEdge:64,inset:128};
export const facadeCode=(name,{swap=false,noEdge=false,inset=false}={})=>{const id=typeof name==='number'?name:FACADE[name]??0;if(!id&&!noEdge&&!inset)return 0;
 const v=id+(noEdge?FAC_FLAG.noEdge:0)+(inset?FAC_FLAG.inset:0);return swap?-v:v;};
export const ATLAS_SIZE=1024,SLOT=256,PERIOD=240,GUTTER=8,DECAL=128;
export const facadeDetail={value:1};
export const ACCENT='#F1EADB';

// ---------- Pixel generation ----------
function rngOf(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const hash2=(x,y,s)=>{let h=Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,2246822519)|0;h=Math.imul(h^h>>>13,1274126177);return((h^h>>>16)>>>0)/4294967296;};
// Periodic value noise over P px with g cells per period.
function noise(g,seed,P=PERIOD){const s=t=>t*t*(3-2*t);return (x,y)=>{const fx=x/P*g,fy=y/P*g,ix=Math.floor(fx),iy=Math.floor(fy),tx=s(fx-ix),ty=s(fy-iy),
 at=(i,j)=>hash2(((i%g)+g)%g,((j%g)+g)%g,seed);return at(ix,iy)*(1-tx)*(1-ty)+at(ix+1,iy)*tx*(1-ty)+at(ix,iy+1)*(1-tx)*ty+at(ix+1,iy+1)*tx*ty;};}
const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const wrap=(v,p)=>((v%p)+p)%p;
// A line of `w` px around coordinate c (periodic p), 1 at the centre, soft edge.
const line=(x,c,w,p=PERIOD)=>{const d=Math.abs(wrap(x-c+p/2,p)-p/2);return 1-sm(w*.5,w*.5+1,d);};
// Running-bond tiles/bricks: cols × rows per period, odd rows shifted by `shift`. Returns {gx,gy,ix,iy} grout distances.
function bond(x,y,cols,rows,shift){const ch=PERIOD/rows,iy=Math.floor(y/ch),cw=PERIOD/cols,xs=x+(iy&1?shift*cw:0),ix=Math.floor(wrap(xs,PERIOD)/cw);
 const fx=wrap(xs,cw),fy=y-iy*ch;return {ix:ix%cols,iy,dx:Math.min(fx,cw-fx),dy:Math.min(fy,ch-fy),fx:fx/cw,fy:fy/ch};}

// Each tiled surface: (x, y) in [0, 240), y up → [R, G, B] in 0–1 (R, G around 0.5).
const N=(g,s)=>noise(g,s),n6=N(6,11),n12=N(12,12),n24=N(24,13),n48=N(48,14),n4=N(4,15),nWood=N(4,26),nPaint=noise(5,31,1);
const grain=(x,y,s)=>hash2(x,y,s)-.5;
export const SURFACES={
 // Large glazed ceramic tiles (0.5 × 0.31 m), stack bond, crisp grout, a faint glaze gradient.
 tileWhite(x,y){const b=bond(x,y,6,8,0),gr=1-sm(.9,1.9,Math.min(b.dx,b.dy));const v=hash2(b.ix,b.iy,21)-.5;
  return [.5+.03*v+.025*(b.fy-.5)-.012*b.fx+.01*grain(x,y,1)+.03*(n12(x,y)-.5),.5-.2*gr,0];},
 // Smaller beige "nisebu" tiles (0.3 × 0.21 m), running bond, mottled.
 tileBeige(x,y){const b=bond(x,y,10,12,.5),gr=1-sm(.8,1.8,Math.min(b.dx,b.dy));const v=hash2(b.ix,b.iy,22)-.5;
  return [.5+.07*v+.03*(n24(x,y)-.5)+.015*grain(x,y,2),.5-.17*gr,0];},
 // Brick-tile (0.375 × 0.156 m) running bond, strong per-brick variation, recessed mortar.
 brick(x,y){const b=bond(x,y,8,16,.5),gr=1-sm(.9,2,Math.min(b.dx,b.dy));const v=hash2(b.ix,b.iy,23)-.5,v2=hash2(b.ix,b.iy,24);
  return [.5+.12*v-.04*(v2<.15?1:0)+.03*(n48(x,y)-.5)+.02*grain(x,y,3),.5-.2*gr-.03*(1-b.fy),0];},
 // Exposed concrete: 1.5 × 1.25 m form panels, joints, form-tie dots (3 × 2 per panel), blotches, a few streaks.
 concrete(x,y){const px=wrap(x,120),py=wrap(y,120),j=Math.max(line(x,0,1.6,120),line(y,0,1.6,120));
  let dot=0;for(const cx of [20,60,100])for(const cy of [30,90]){const d=Math.hypot(px-cx,py-cy);dot=Math.max(dot,1-sm(1.6,2.8,d));}
  const st=sm(.6,.85,n24(x,0))*sm(0,240,y)*.5;
  return [.5+.07*(n12(x,y)-.5)+.04*(n48(x,y)-.5)+.02*grain(x,y,4)-.03*st,.5-.14*j-.16*dot,0];},
 // Corrugated metal siding: 16 ribs per 3 m with rounded shading, one lap joint per period.
 metal(x,y){const t=wrap(x,15)/15,rib=Math.cos(t*Math.PI*2);const lap=line(y,2,2);
  return [.5+.04*(n6(x,y)-.5)+.006*grain(x,y,5),.5+.09*rib-.12*lap,0];},
 // Painted plaster: soft blotches, water stains hanging from above, two hairline cracks.
 plaster(x,y){const stain=sm(.55,.8,n12(x,0))*sm(60,240,y)*(.6+.4*n24(x,y));
  const crack=Math.max(line(x,70+18*Math.sin(y*.05)+8*Math.sin(y*.17),1.1)*sm(40,60,y)*(1-sm(150,170,y)),line(y,190+10*Math.sin(x*.07),1)*sm(150,165,x)*(1-sm(200,215,x)));
  return [.5+.05*(n6(x,y)-.5)+.03*(n24(x,y)-.5)+.012*grain(x,y,6)-.05*stain,.5-.12*crack,0];},
 // Dark glass curtain wall: per storey a spandrel band, mullions every 0.75 m, a sky-reflection gradient.
 glass(x,y){const sp=y<70?1:0,mu=line(x,0,3,60),tr=Math.max(line(y,70,3),line(y,0,2.5));
  const g=sp?.38+.04*(n24(x,y)-.5):.36+.3*sm(70,240,y)+.05*sm(.5,.7,n12(x*.5+y,0));
  return [g+.3*Math.max(mu,tr),.5-.06*Math.max(mu,tr),0];},
 // Wood boards (0.21 m) with a shadow line under each lap, grain along x, battens every 1 m.
 wood(x,y){const fy=wrap(y,20),under=1-sm(0,3,fy),bat=wrap(x,80),bv=bat<6?1:0,be=bat<6?Math.min(bat,6-bat):9;
  const v=hash2(Math.floor(y/20),bv?Math.floor(x/80)+99:0,25)-.5;
  return [.5+.08*v+.05*(nWood(x*3,y*.25)-.5)+.02*grain(x,y,7)+(bv?.04:0),.5-.16*under*(1-bv)-(bv?.12*(1-sm(0,1.5,be)):0),0];},
 // Roll shutter: 30 slats per 2.5 m, a groove under each.
 shutter(x,y){const f=wrap(y,8),gro=1-sm(0,1.6,f);return [.5+.025*(n6(x,y)-.5)+.006*grain(x,y,8)+.03*(f/8),.5-.15*gro,0];},
 // Awning canvas: 8 stripes per 3 m (B = cream), seams, a cloth grain.
 awning(x,y){const s=Math.floor(x/30)&1,e=Math.min(wrap(x,30),30-wrap(x,30));return [.5+.03*(n24(x,y)-.5)+.012*grain(x,y,9),.5-.07*(1-sm(0,1.5,e)),s?1:0];},
 // Roof membrane/gravel: speckle, sheet seams every 1 m, a drain.
 membrane(x,y){const se=Math.max(line(x,0,1.4,80),line(y,40,1.4,80)),d=Math.hypot(wrap(x,240)-178,wrap(y,240)-62),dr=1-sm(4,7,d);
  return [.5+.08*grain(x,y,10)+.05*(n24(x,y)-.5),.5-.11*se-.2*dr,0];},
 // Kawara: rows of 0.25 m (horizontal faces: 3 m / 12), rounded ribs of 0.19 m, a shadow under each row lip.
 kawara(x,y){const fy=wrap(y,20),fx=wrap(x+(Math.floor(y/20)&1?7.5:0),15)/15,rib=Math.cos(fx*Math.PI*2),lip=1-sm(0,3.5,fy);
  return [.5+.025*(hash2(Math.floor(x/15),Math.floor(y/20),27)-.5)+.012*grain(x,y,11),.5+.11*rib-.2*lip,0];},
 // Asphalt: aggregate speckle, two worn wheel tracks along u, sealed cracks.
 asphalt(x,y){const tr=Math.max(sm(36,52,y)*(1-sm(70,86,y)),sm(154,170,y)*(1-sm(188,204,y)));
  const ck=Math.max(line(y,120+14*Math.sin(x*.045)+5*Math.sin(x*.21),1.2)*sm(.45,.6,n4(x,0)),line(x,40+9*Math.sin(y*.08),1.1)*sm(.55,.7,n4(0,y)));
  return [.5+.09*grain(x,y,12)+.04*(n48(x,y)-.5)+.03*(n6(x,y)-.5)-.05*tr,.5-.12*ck,0];},
 // Sidewalk pavers (0.3 × 0.15 m) running bond.
 pavers(x,y){const b=bond(x,y,10,20,.5),gr=1-sm(.5,1.4,Math.min(b.dx,b.dy));const v=hash2(b.ix,b.iy,28)-.5;
  return [.5+.06*v+.03*grain(x,y,13)+.02*(n24(x,y)-.5),.5-.14*gr,0];},
 // Lap siding (0.156 m boards), a shadow under each board, a butt joint every 1.5 m.
 siding(x,y){const fy=wrap(y,15),sh=1-sm(0,2.5,fy),jt=line(x+(Math.floor(y/15)%3)*40,0,1.4,120);
  return [.5+.02*(n12(x,y)-.5)+.01*grain(x,y,14)+.03*(fy/15),.5-.16*sh-.08*jt,0];}};
export const TILED=Object.keys(SURFACES);   // slot i ↔ FACADE id i+1
// Decals over the whole face (u, v in 0–1).
export const DECALS={
 fan(u,v){const r=Math.hypot(u-.6,v-.5),ring=r<.36?1:0,spoke=Math.abs(Math.sin(Math.atan2(v-.5,u-.6)*3+r*6)),bars=Math.abs(Math.sin(r*60)),hub=r<.06;
  const lou=u<.2&&u>.05?(Math.sin(v*70)>.3?1:0):0,edge=Math.min(u,v,1-u,1-v);
  return [ring?(hub?.55:.3+.12*(spoke>.85?1:0)+.05*(bars>.7?1:0)):.52-.06*lou,(edge<.03?.4:.5)-(Math.abs(r-.37)<.015?.18:0),0];},
 manhole(u,v){const r=Math.hypot(u-.5,v-.5);if(r>.47)return [.5,.5,0];const rim=r>.42,ang=Math.atan2(v-.5,u-.5);
  const pat=(Math.sin(u*40)*Math.sin(v*40)>.15?1:0)^(r<.2?1:0),ray=Math.abs(Math.sin(ang*8))>.92;
  return [rim?.44:.34+.1*pat+.05*(ray?1:0),rim?.42:.5-.06*(Math.abs(r-.2)<.015?1:0),0];},
 door(u,v){const fr=Math.min(u,1-u)<.07||v>.95,tr=v>.76&&v<.95,tb=Math.abs(v-.76)<.02,glassL=!fr&&!tr&&!tb&&v>.42&&Math.abs(u-.5)<.3;
  const inner=Math.min(1,Math.min(u-.07,1-.07-v)/.08);
  return [fr||tb?.66:tr?.24+.1*v:glassL?.26+.14*(v-.42):.5,(fr?.5:.5-.1*(1-Math.max(0,inner)))-(Math.abs(u-.76)<.02&&Math.abs(v-.45)<.06?.2:0),0];},
 paint(u,v){const w=nPaint(u,v),s=hash2(Math.floor(u*128),Math.floor(v*128),32);const worn=sm(.58,.66,w+.12*(s-.5))*.8+(s<.04?.5:0);
  return [.5-.22*Math.min(1,worn),.5,0];}};
export const DECAL_IDS=['fan','manhole','door','paint'];

// The atlas bytes (RGBA). Pure and deterministic. stats.mean[i] = mean of 4·R·G per tiled slot after normalisation.
export function facadeAtlasData(){
 const S=ATLAS_SIZE,out=new Uint8Array(S*S*4),mean=[];
 const put=(px,py,[r,g,b])=>{const i=(py*S+px)*4;out[i]=Math.max(0,Math.min(255,Math.round(r*255)));out[i+1]=Math.max(0,Math.min(255,Math.round(g*255)));out[i+2]=Math.max(0,Math.min(255,Math.round(b*255)));out[i+3]=255;};
 TILED.forEach((name,s)=>{const f=SURFACES[name],P=PERIOD,R=new Float32Array(P*P),G=new Float32Array(P*P),B=new Float32Array(P*P);let m=0;
  for(let y=0;y<P;y++)for(let x=0;x<P;x++){const [r,g,b]=f(x,y),i=y*P+x;R[i]=r;G[i]=g;B[i]=b;m+=4*r*g;}
  const k=P*P/m;   // normalise R: mean(4·R·G) = 1
  const ox=(s%4)*SLOT,oy=Math.floor(s/4)*SLOT;
  for(let j=0;j<SLOT;j++)for(let i=0;i<SLOT;i++){const x=wrap(i-GUTTER,P),y=wrap(j-GUTTER,P),q=y*P+x;put(ox+i,oy+j,[R[q]*k,G[q],B[q]]);}
  let mm=0;for(let q=0;q<P*P;q++)mm+=4*Math.min(1,R[q]*k)*G[q];mean.push(mm/(P*P));});
 DECAL_IDS.forEach((name,q)=>{const f=DECALS[name],ox=3*SLOT+(q%2)*DECAL,oy=3*SLOT+Math.floor(q/2)*DECAL;
  for(let j=0;j<DECAL;j++)for(let i=0;i<DECAL;i++){const u=Math.min(1,Math.max(0,(i+.5-4)/120)),v=Math.min(1,Math.max(0,(j+.5-4)/120));put(ox+i,oy+j,f(u,v));}});
 return {data:out,size:S,mean};
}
let atlas=null;
// The shared texture (built on first use; one per page). Linear data, trilinear mips, anisotropy 4.
export function facadeAtlas(){
 if(atlas)return atlas;const {data,size}=facadeAtlasData();
 atlas=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);atlas.wrapS=atlas.wrapT=THREE.ClampToEdgeWrapping;
 atlas.magFilter=THREE.LinearFilter;atlas.minFilter=THREE.LinearMipmapLinearFilter;atlas.generateMipmaps=true;atlas.anisotropy=4;atlas.needsUpdate=true;atlas.name='facade atlas';
 return atlas;
}
const mapUniform={value:null};

// ---------- Shader ----------
// Vertex: world position, the instance's distances to its box faces (assumes the unit BoxGeometry(1,1,1) scaled per
// instance / per mesh, as every city batch is), a hashed phase, the facade code.
export const FACADE_VERT=`
 #ifdef USE_INSTANCING
 mat4 facM=modelMatrix*instanceMatrix;
 #else
 mat4 facM=modelMatrix;
 #endif
 vec3 facS=vec3(length(facM[0].xyz),length(facM[1].xyz),length(facM[2].xyz));
 vFacW=(facM*vec4(transformed,1.)).xyz;vFacA=(position+.5)*facS;vFacB=(.5-position)*facS;
 vFacPh=fract(sin(dot(facM[3].xz,vec2(12.9898,78.233)))*43758.5453);
 #ifdef FACADE_FIXED
 vFac=float(FACADE_FIXED);
 #else
 vFac=aFacade;
 #endif`;
const DECL_V='attribute float aFacade;varying vec3 vFacW,vFacA,vFacB;varying float vFacPh,vFac;\n';
const DECL_F='uniform sampler2D uFacadeMap;uniform float uFacadeDetail,uFacY0,uFacGround;uniform vec3 uFacAccent;varying vec3 vFacW,vFacA,vFacB;varying float vFacPh,vFac;\n';
// Fragment: the surface (tiled or decal), then (FACADE_EDGES) the fake bevel: a highlight on every box edge, a
// stronger one on top edges (coping), a drip shadow just under the coping, contact AO at the ground and, hashed per
// building, AO at the vertical edges where neighbours touch; inset slabs darken inward (a sunken roof inside its parapet).
export const FACADE_FRAG=`
 {vec3 fW=vFacW,fdx=dFdx(fW),fdy=dFdy(fW),fAn=abs(normalize(cross(fdx,fdy)));
  float fMpp=max(length(fdx),length(fdy)),fFade=uFacadeDetail*(1.-smoothstep(.09,.21,fMpp));
  float fA=abs(vFac),fId=mod(fA,64.),fNoEdge=mod(floor(fA/64.),2.),fInset=floor(fA/128.);
  vec3 fS=vFacA+vFacB;
  float fy=step(max(fAn.x,fAn.z),fAn.y),fx=(1.-fy)*step(fAn.z,fAn.x);
  vec2 fuv=fy*fW.xz/3.+fx*vec2(fW.z/3.,(fW.y-uFacY0)/2.5)+(1.-fy-fx)*vec2(fW.x/3.,(fW.y-uFacY0)/2.5);
  fuv=vFac<0.?fuv.yx:fuv;fuv.x+=vFacPh*7.31;
  vec2 fgx=dFdx(fuv),fgy=dFdy(fuv);
  // Decal coordinates on the instance's own faces (z faces: x,y; y faces: x,z; x faces: z,y).
  vec3 fD=min(vFacA,vFacB);float fzF=step(fD.z,1e-3),fyF=step(fD.y,1e-3),fxF=step(fD.x,1e-3);
  vec3 fQ=vFacA/max(fS,vec3(1e-4));
  float fDec=step(16.5,fId),fq=fId-17.,fAxis=fq==1.||fq==3.?1.:(vFac<0.?0.:2.);
  float fOnFace=fAxis==1.?fyF:fAxis==0.?fxF*(1.-fyF):fzF*(1.-fyF);
  vec2 fdv=fAxis==1.?fQ.xz:fAxis==0.?fQ.zy:fQ.xy;
  vec2 fdgx=dFdx(fdv),fdgy=dFdy(fdv);
  if(fId>.5&&fFade>.002){
   vec4 ft;float fMask=1.;
   if(fDec<.5){vec2 org=vec2(mod(fId-1.,4.),floor((fId-1.)/4.))*.25;
    ft=textureGrad(uFacadeMap,org+(8.+fract(fuv)*240.)/1024.,fgx*(240./1024.),fgy*(240./1024.));}
   else{vec2 org=vec2(.75)+vec2(mod(fq,2.),floor(fq/2.))*.125;fMask=fOnFace;
    ft=textureGrad(uFacadeMap,org+(4.+clamp(fdv,0.,1.)*120.)/1024.,fdgx*(120./1024.),fdgy*(120./1024.));}
   float fk=fFade*fMask;
   diffuseColor.rgb=mix(diffuseColor.rgb*mix(1.,4.*ft.r*ft.g,fk),uFacAccent,ft.b*fk);
  }
  #ifdef FACADE_EDGES
  if(fNoEdge<.5){
   float fNa=fD.x<fD.y&&fD.x<fD.z?0.:fD.y<fD.z?1.:2.;
   float fE=fNa==0.?min(fD.y,fD.z):fNa==1.?min(fD.x,fD.z):min(fD.x,fD.y);
   float fTopF=fNa==1.?step(vFacB.y,vFacA.y):0.,fSide=fNa==1.?0.:1.;
   float fEf=mix(.35,1.,uFacadeDetail*(1.-smoothstep(.09,.3,fMpp))),fw=max(.035,1.1*fMpp);
   float fHl=1.-smoothstep(0.,fw,fE),fTop=fTopF*fHl+fSide*(1.-smoothstep(0.,fw*1.4,vFacB.y));
   float fBody=step(.5,fId)*(1.-fDec)*step(2.4,fS.y)*fSide;
   float fCap=max(.05,fMpp),fDrip=fBody*(smoothstep(fw*1.4,fw*1.6,vFacB.y)-smoothstep(fw*1.6+fCap,fw*1.8+fCap,vFacB.y));
   float fV=fNa==0.?fD.z:fD.x;
   float fBev=(1.+.06*fHl*fEf+.08*fTop*(1.-.5*fHl)*fEf)*(1.-.2*fDrip*fEf)*(1.-.14*fBody*(1.-smoothstep(0.,.5,fW.y-uFacGround)))
    *(1.-.1*fBody*step(.45,fract(vFacPh*7.3))*(1.-smoothstep(0.,.4,fV))*(1.-fHl)*fEf);
   diffuseColor.rgb*=fInset>.5&&fTopF>.5?(1.-.24*(1.-smoothstep(.04,.38,fE))):fBev;
  }
  #endif
 }`;
// Patches a material compiled by `shader` (call from onBeforeCompile). Options: edges (bevel/AO; needs unit-box
// geometry), y0 (world y where storey-aligned patterns start), ground (contact AO height), fixed (one facade code for the
// whole mesh, for meshes without the aFacade attribute).
export function addFacade(shader,{edges=true,y0=3.12,ground=.12,fixed=null}={}){
 mapUniform.value??=facadeAtlas();
 Object.assign(shader.uniforms,{uFacadeMap:mapUniform,uFacadeDetail:facadeDetail,uFacY0:{value:y0},uFacGround:{value:ground},uFacAccent:{value:new THREE.Color(ACCENT)}});
 const defs=(edges?'#define FACADE_EDGES\n':'')+(fixed!=null?`#define FACADE_FIXED ${facadeCode(fixed)}\n`:'');
 shader.vertexShader=defs+DECL_V+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>'+FACADE_VERT);
 shader.fragmentShader=defs+DECL_F+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>'+FACADE_FRAG);
}
// Wraps any toon material (city ground, hero meshes) with the facade chunk. Returns the material.
export function withFacade(material,opts={}){
 const prev=material.onBeforeCompile,key=material.customProgramCacheKey?.bind(material);
 material.onBeforeCompile=(shader,renderer)=>{prev?.call(material,shader,renderer);addFacade(shader,opts);};
 material.customProgramCacheKey=()=>(key?key():'')+'|fac-w5a'+(opts.edges===false?'':'e')+(opts.fixed!=null?'f'+facadeCode(opts.fixed):'');
 return material;
}
// Per-instance attribute for an InstancedMesh's geometry from item codes (0 = plain).
export const facadeAttribute=codes=>new THREE.InstancedBufferAttribute(Float32Array.from(codes,v=>v||0),1);

// ---------- Shared geometries for the city batches (unit box space, −0.5…0.5) ----------
// Right-triangle prism: low edge at the front (+z, y −0.5), ridge at the back top (−z, y +0.5). Two of them back to
// back make a gable roof; one is a pent roof. No bottom face (never seen). Non-indexed, flat normals: 6 triangles.
export function prismGeometry(){
 const A=[-.5,-.5,.5],B=[.5,-.5,.5],C=[.5,.5,-.5],D=[-.5,.5,-.5],E=[-.5,-.5,-.5],F=[.5,-.5,-.5];
 const tris=[[A,B,C],[A,C,D],[E,D,C],[E,C,F],[A,D,E],[B,F,C]];
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(tris.flat(2),3));g.computeVertexNormals();
 g.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(tris.length*6).fill(0),2));return g;
}
// Quarter-round awning: from the wall top (z −0.5, y +0.5) curving out and down to the front edge (z +0.5, y −0.5),
// with its two end caps. `seg` arc segments (default 6): 4·seg triangles.
export function arcGeometry(seg=6){
 const p=[],n=[];const pt=a=>[-.5+Math.cos(a),-.5+Math.sin(a)];
 for(let i=0;i<seg;i++){const a0=i/seg*Math.PI/2,a1=(i+1)/seg*Math.PI/2,[z0,y0]=pt(a0),[z1,y1]=pt(a1),nm=(a0+a1)/2,nz=Math.cos(nm),ny=Math.sin(nm);
  p.push(-.5,y0,z0,.5,y0,z0,.5,y1,z1,-.5,y0,z0,.5,y1,z1,-.5,y1,z1);for(let k=0;k<6;k++)n.push(0,ny,nz);
  for(const x of [-.5,.5]){const s=x<0?-1:1;const tri=s<0?[[x,-.5,-.5],[x,y0,z0],[x,y1,z1]]:[[x,-.5,-.5],[x,y1,z1],[x,y0,z0]];p.push(...tri.flat());for(let k=0;k<3;k++)n.push(s,0,0);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(p.length/3*2).fill(0),2));return g;
}
