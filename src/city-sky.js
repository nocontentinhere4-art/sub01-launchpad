import * as THREE from 'three';
import {toon,night} from './toon.js';
import {districts} from './city-state.js';
import {cityLayout,CATEGORY,BASE_Y} from './lots.js';
import {hash} from './city-street.js';
// Sky and small life (wave 3A): the blimp (ONE mesh: body, fins, gondola, tow line and a CanvasTexture banner), and
// ONE instanced critter batch for crows (bats at night), Shibuya/Shinjuku pigeons that scatter and cats on block walls
// in the low districts. Every critter is a unit box whose transform is a function of (seed, time) in the vertex
// shader; the CPU only writes three uniforms a frame. Two draw calls in all.

// ---------- Blimp path (tested): a slow ellipse over the city centre/north, aligned to the default camera's screen axes
// so it stays in the open band between the header, the right-hand panel and the bottom bars. Non-periodic: the angular
// speed, size and height drift on incommensurate slow sines.
const YAW=36*Math.PI/180,RIGHT=[Math.cos(YAW),-Math.sin(YAW)],AWAY=[-Math.sin(YAW),-Math.cos(YAW)];
export const BLIMP={y:32,cx:-1.2,cz:-15.6,a:39,b:18,period:170,length:19,radius:2.8,banner:{from:13.4,to:30,h:3.3,drop:1.8}};
export function blimpState(seconds){
 const t=seconds,th=2*Math.PI*t/BLIMP.period+.35*Math.sin(t*.0131)+.2*Math.sin(t*.0047+1.3);
 const a=BLIMP.a*(1+.06*Math.sin(t*.0093)),b=BLIMP.b*(1+.08*Math.sin(t*.0071+2));
 const u=Math.cos(th)*a,v=Math.sin(th)*b,x=BLIMP.cx+u*RIGHT[0]+v*AWAY[0],z=BLIMP.cz+u*RIGHT[1]+v*AWAY[1];
 // Direction of travel (derivative of the ellipse in θ), as a yaw where local +z is the nose.
 const du=-Math.sin(th)*a,dv=Math.cos(th)*b,dx=du*RIGHT[0]+dv*AWAY[0],dz=du*RIGHT[1]+dv*AWAY[1];
 return {x,y:BLIMP.y+.7*Math.sin(t*.05),z,yaw:Math.atan2(dx,dz)};
}
// Nav lights in the blimp's frame [x, y, z, colour 0 red / 1 green / 2 white] (city-life.js glow batch draws them).
export const BLIMP_LIGHTS=[[2.85,0,.9,0],[-2.85,0,.9,1],[0,3.85,-7.1,2],[0,-3.5,1.2,0]];
// Points of the blimp and its towed banner in world space (tested against UI_ZONES).
export function blimpPoints(s){
 const c=Math.cos(s.yaw),sn=Math.sin(s.yaw),w=(lx,ly,lz)=>({x:s.x+lx*c+lz*sn,y:s.y+ly,z:s.z-lx*sn+lz*c});
 const L=BLIMP.length/2,{from,to,h,drop}=BLIMP.banner;
 return [w(0,0,L),w(0,0,-L),w(BLIMP.radius,0,0),w(-BLIMP.radius,0,0),w(0,-BLIMP.radius-.9,0),w(0,-drop,-from),w(0,-drop-h,-from),w(0,-drop,-to),w(0,-drop-h,-to)];
}
// UI zones (world space, at the blimp's altitude): where the header, the right-hand panel, the activity bar, the map
// controls and the overview headline sit on screen at the default views (main.js resetView: target (0,8,−7), pitch 40°,
// yaw 36°, zoom 0.19 desktop 1440×900 / 0.09 phone 390×844), unprojected onto the plane y = BLIMP.y. Quads in xz.
export const UI_ZONES={
 desktop:{header:[[-175,-11],[50,-175],[67,-151],[-157,13]],panel:[[25,-113],[71,-146],[180,5],[135,38]],activity:[[-36,180],[60,111],[79,138],[-16,207]],
  controls:[[144,59],[194,23],[209,44],[159,79]],headline:[[-154,18],[-95,-25],[-54,30],[-113,74]]},
 phone:{header:[[-241,-181],[-91,-290],[-48,-230],[-198,-122]],headline:[[-193,-116],[-111,-176],[-52,-95],[-135,-35]],
  controls:[[58,-43],[78,-57],[182,86],[162,100]],panel:[[32,195],[182,86],[274,214],[125,322]]}};
export function inQuad(q,x,z){let inside=false;for(let i=0,j=q.length-1;i<q.length;j=i++){const [xi,zi]=q[i],[xj,zj]=q[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;}return inside;}

// ---------- Banner text (tested): the most recently launched public project, from the server's events/plots ----------
const tick=t=>String(t??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10);
// Server events cover the last 24 h: under 2 h old it "just launched", otherwise it "launched today".
export function bannerText(world){
 const ev=(Array.isArray(world?.events)?world.events:[]).filter(e=>e?.kind==='launched'&&tick(e.ticker)&&Number.isFinite(e.at)).sort((a,b)=>b.at-a.at)[0];
 if(ev)return `$${tick(ev.ticker)} ${(Number(world.now)||Date.now())-ev.at<2*3600e3?'just launched':'launched today'}`;
 const p=(Array.isArray(world?.plots)?world.plots:[]).map(p=>p?.project).filter(p=>p?.launched&&p.slug&&tick(p.ticker)).at(-1);
 return p?`$${tick(p.ticker)} launched here`:'SUBZERONE · TOKYO';
}

// ---------- Blimp mesh ----------
const BANNER_W=512,BANNER_H=96;   // canvas: banner 512×96 on top, a white strip below for the body's UVs
function blimpGeometry(){
 const parts=[],put=(g,color,glow=0,uv=null)=>{g=g.toNonIndexed();const n=g.attributes.position.count;
  g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:n},()=>new THREE.Color(color).toArray()).flat(),3));
  g.setAttribute('aGlow',new THREE.Float32BufferAttribute(new Array(n).fill(glow),1));
  if(!uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(n*2).fill(0).map((_,i)=>i%2?.04:.5),2));parts.push(g);};
 const L=BLIMP.length,R=BLIMP.radius,body=new THREE.SphereGeometry(1,14,8);body.scale(R,R,L/2);put(body,'#E9E6DE');
 // A blue band round the body (a short open cylinder just proud of the envelope), dark fins and a gondola with lit windows.
 const band=new THREE.CylinderGeometry(R*.99,R*.99,1.5,14,1,true);band.rotateX(Math.PI/2);band.translate(0,0,1.8);band.scale(1.02,1.02,1);put(band,'#2F6FB5');
 for(const [rx,ry] of [[0,1],[0,-1],[1,0],[-1,0]]){const f=new THREE.BoxGeometry(rx?2.3:.16,ry?2.3:.16,3.2);f.translate(rx*R*.95,ry*R*.95,-L/2+2.4);put(f,'#2B3440');}
 const gondola=new THREE.BoxGeometry(1.3,.8,3.4);gondola.translate(0,-R-.25,1.2);put(gondola,'#2B3440');
 const win=new THREE.BoxGeometry(1.32,.26,2.6);win.translate(0,-R-.16,1.25);put(win,'#FFE6B8',.9);
 const {from,to,h,drop}=BLIMP.banner,line=new THREE.BoxGeometry(.05,.05,from-L/2+.4);line.translate(0,-drop*.5,-(from+L/2)/2);put(line,'#2D3134');
 // The banner: two back-to-back quads so the text reads left-to-right from either side.
 for(const side of [1,-1]){const q=new THREE.PlaneGeometry(to-from,h);q.rotateY(side*Math.PI/2);q.translate(side*.02,-drop-h/2,-(from+to)/2);
  const uv=q.attributes.uv;for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);uv.setXY(i,u,1-(1-v)*BANNER_H/128);}put(q,'#FFFFFF',1,true);}
 const merged=new THREE.BufferGeometry();
 for(const k of ['position','normal','uv','color','aGlow']){const size=parts[0].attributes[k].itemSize;merged.setAttribute(k,new THREE.Float32BufferAttribute(parts.flatMap(g=>Array.from(g.attributes[k].array)),size));}
 return merged;
}
function drawBanner(ctx,text){
 ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,BANNER_W,128);
 ctx.fillStyle="#F4F1EA";ctx.fillRect(0,0,BANNER_W,BANNER_H);
 ctx.fillStyle='#2F6FB5';ctx.fillRect(0,0,BANNER_W,7);ctx.fillRect(0,BANNER_H-7,BANNER_W,7);
 ctx.fillStyle='#1B2230';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 50px "Arial Black", Arial, sans-serif';
 ctx.fillText(text.toUpperCase(),BANNER_W/2,BANNER_H/2+2,BANNER_W-30);
}

// ---------- Critters (pure plan, tested) ----------
// kinds: 0 crow/bat (parts body, wing L, wing R), 1 pigeon (body, head, wing L, wing R), 2 cat (wall, body, head,
// ear, ear, tail, eye, eye). aC = (kind, part, seed, group|wall length), aP = (x, y, z, yaw|slot).
export const CRITTER_BUDGET={desktop:520,mobile:300};
export const PIGEON_FLOCKS=[{x:25.6,z:-.85,yaw:.4},{x:32.6,z:4.95,yaw:2.9},{x:-4,z:-25.25,yaw:1.7}];
const CROW_FLOCKS=[{x:-29,z:-30,y:24},{x:44,z:-58,y:21},{x:-56,z:-58,y:22}];
export function catSpots(buildings=[],{mobile=false}={}){
 const out=[],lots=cityLayout(buildings).lots;
 for(const d of districts){if(!['home','old'].includes(CATEGORY[d.id]||'home'))continue;
  // Classic block wall at the lot line of a set-back house, on the side away from its door.
  const cand=lots.filter(l=>l.district===d.id&&!l.user&&['T5','T4','T3'].includes(l.type)&&l.setback>=.55&&l.width>=2.2)
   .map(l=>({l,k:hash(l.x,l.z,71)})).sort((a,b)=>a.k-b.k).slice(0,mobile?1+(hash(d.x,d.z,72)<.5?1:0):2+(hash(d.x,d.z,72)<.5?1:0));
  for(const {l} of cand){const fz=l.front==='+z'?1:-1,len=Math.min(2.4,l.width*.45),side=hash(l.x,73)<.5?-1:1;
   out.push({x:l.x+side*(l.width/2-len/2-.1),y:BASE_Y+1.2,z:l.frontZ+fz*(l.setback-.12),yaw:fz>0?0:Math.PI,len,u:(hash(l.z,74)-.5)*len*.6,seed:hash(l.x,l.z,75),plotId:l.plotId,district:d.id});}
 }
 return out;
}
const CAT_COATS=[['#2A2A2E','#2A2A2E'],['#D08A4A','#E8B27A'],['#ECE7DD','#ECE7DD'],['#8A8580','#5E5A56'],['#3B3027','#ECE7DD']];
export function critterPlan({mobile=false,buildings=[]}={}){
 const list=[],add=(kind,part,seed,group,x,y,z,w,color)=>list.push({kind,part,seed,group,x,y,z,w,color});
 CROW_FLOCKS.slice(0,mobile?2:3).forEach((f,g)=>{const n=mobile?4:5;for(let i=0;i<n;i++){const slot=i===0?0:(i%2?1:-1)*Math.ceil(i/2),s=hash(g,i,61);
  for(let p=0;p<3;p++)add(0,p,s,g,f.x,f.y+hash(g,i,62)*1.5,f.z,slot,'#23262D');}});
 PIGEON_FLOCKS.forEach((f,g)=>{const n=mobile?5:7;for(let i=0;i<n;i++){const s=hash(g,i,63),a=s*6.283,r=.35+hash(g,i,64)*1.1;
  const col=['#8E949C','#7D838C','#A3A6AB','#6B6F78'][Math.floor(hash(g,i,65)*4)];
  for(let p=0;p<4;p++)add(1,p,s,g,f.x+Math.cos(a)*r*1.4,BASE_Y+.12,f.z+Math.sin(a)*r*.5,f.yaw+(hash(g,i,66)-.5)*2.4,p===1?'#5D6E72':col);}});
 for(const c of catSpots(buildings,{mobile})){const [coat,belly]=CAT_COATS[Math.floor(c.seed*CAT_COATS.length)];
  const colors=['#A9A79D',coat,coat,coat,coat,belly,'#C8E86A','#C8E86A'];
  for(let p=0;p<8;p++)add(2,p,c.seed,p===0?c.len:c.u,c.x,c.y,c.z,c.yaw,colors[p]);}
 return list;
}
export function critterBuffers(plan){
 const n=plan.length,aC=new Float32Array(n*4),aP=new Float32Array(n*4),color=new Float32Array(n*3),c=new THREE.Color();
 plan.forEach((o,i)=>{aC.set([o.kind,o.part,o.seed,o.group],i*4);aP.set([o.x,o.y,o.z,o.w],i*4);c.set(o.color);color.set([c.r,c.g,c.b],i*3);});
 return {aC,aP,color,count:n};
}
const CRITTER_GLSL=`
attribute vec4 aC;attribute vec4 aP;uniform float uTime,uCritNight;uniform vec4 uScatter;varying float vCritGlow;
mat3 cRot;vec3 cScale,cOff,cBase;
mat3 rY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
mat3 rZ(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}
float h1(float x){return fract(sin(x*127.1)*43758.5453);}
void critterSetup(){
 int kind=int(aC.x+.5),part=int(aC.y+.5);float seed=aC.z,t=uTime;vec3 P=aP.xyz;vCritGlow=0.;
 cRot=mat3(1.);cScale=vec3(1.);cOff=vec3(0.);cBase=P;
 if(kind==0){
  // Crows by day, smaller and jittery bats at night. The flock circles a drifting centre; birds hold a loose V.
  float g=aC.w,slot=aP.w,bat=uCritNight;
  float dir=h1(g+1.)<.5?-1.:1.,w=dir*(.1+.06*h1(g+2.))*(1.+bat*.8),th=t*w+h1(g+3.)*6.28+.3*sin(t*.07+g);
  vec3 c=P+vec3(sin(t*.031+g)*6.,sin(t*.11+seed*9.)*.8,cos(t*.023+g*2.)*6.);
  float R=(11.+5.*h1(g+5.))*(1.+.15*sin(t*.05+g))*(1.-bat*.3);vec3 pos=c+vec3(cos(th),0.,sin(th))*R;
  float yaw=atan(-sin(th)*dir,cos(th)*dir);
  vec3 local=vec3(slot*1.25,.25*sin(t*.9+seed*7.),-abs(slot)*1.5)+bat*vec3(sin(t*3.1+seed*20.),sin(t*2.3+seed*13.),sin(t*2.7+seed*31.))*1.2;
  float sz=mix(1.,.55,bat);cBase=pos+rY(yaw)*local;
  float flap=(.5+.25*sin(t*.4+seed*5.))*sin(t*(7.+seed*2.)*(1.+bat*1.6)+seed*20.)+.22;
  if(part==0){cScale=vec3(.24,.18,.72)*sz;cRot=rY(yaw);}
  else{float s=part==1?-1.:1.;cScale=vec3(1.,.05,.38)*sz;cOff=vec3(s*.5*sz,0.,0.);cRot=rY(yaw)*rZ(s*flap);}
 }else if(kind==1){
  // Pigeons: peck about; for 8 s after a scare they lift off, wheel round the spot and land again. Asleep at night.
  float age=t-uScatter[int(aC.w+.5)],fly=step(0.,age)*step(age,8.),u=clamp(age/8.,0.,1.);
  float yaw=aP.w,wob=.18*sin(t*.31+seed*17.);
  vec3 pos=P+vec3(wob,0.,.12*sin(t*.23+seed*11.));
  if(fly>0.){float ang=seed*6.28+age*(1.6+seed),rad=(1.2+2.4*seed)*sin(3.1416*u);
   pos=P+vec3(cos(ang)*rad,4.2*smoothstep(0.,.18,u)*(1.-smoothstep(.72,1.,u))+.3*sin(age*3.+seed*9.),sin(ang)*rad);yaw=ang+1.5708;}
  float sz=1.-step(.5,uCritNight);cBase=pos;
  float flap=sin(age*26.+seed*30.)*.9;
  if(part==0){cScale=vec3(.24,.2,.4)*sz;cOff=vec3(0.,.1,0.);cRot=rY(yaw);}
  else if(part==1){float peck=fly>0.?0.:step(.72,fract(t*.45+seed*3.))*-.1;cScale=vec3(.12,.13,.13)*sz;cOff=vec3(0.,.27+peck,.2+(-peck)*.6);cRot=rY(yaw);}
  else{float s=part==2?-1.:1.;cScale=vec3(mix(.02,.42,fly),.03,.22)*sz;cOff=vec3(s*mix(.1,.24,fly),.16,0.);cRot=rY(yaw)*rZ(s*flap*fly);}
 }else{
  // Cats on block walls: the wall itself, then a sitting box cat whose head turns now and then and whose tail flicks.
  float yaw=aP.w,u=aC.w;cRot=rY(yaw);
  if(part==0){cScale=vec3(aC.w,1.2,.16);cOff=vec3(0.,-.6,0.);return;}
  cBase=P+rY(yaw)*vec3(u,0.,0.);
  float look=.7*smoothstep(.55,.65,sin(t*.21+seed*13.))-.6*smoothstep(.6,.7,sin(t*.17+seed*29.));
  if(part==1){cScale=vec3(.22,.27,.3);cOff=vec3(0.,.135,-.02);}
  else if(part==5){
   // Tail: from the back of the body, back and down over the wall, swaying, with a rare quick flick.
   float a=.35*sin(t*1.3+seed*9.)+.9*pow(max(0.,sin(t*.37+seed*5.)),12.)*sin(t*14.);
   mat3 Rt=rY(a*.6)*rX(-1.15+a*.2);cRot=rY(yaw)*Rt;cScale=vec3(.045,.045,.36);cOff=vec3(0.,0.,-.18);cBase+=rY(yaw)*vec3(0.,.05,-.17);}
  else{cRot=rY(yaw+look);
   if(part==2){cScale=vec3(.2,.16,.16);cOff=vec3(0.,.33,.09);}
   else if(part<5){float s=part==3?-1.:1.;cScale=vec3(.055,.07,.04);cOff=vec3(s*.065,.44,.08);}
   else{float s=part==6?-1.:1.,blink=step(.04,fract(t*.29+seed*7.));cScale=vec3(.045,.03*blink+.001,.01);cOff=vec3(s*.05,.35,.17);vCritGlow=uCritNight*1.6;}}
 }
}`;
function critterMaterial(uniforms){
 const m=toon({vertexColors:true});
 m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,uniforms);
  sh.vertexShader=CRITTER_GLSL+"\n"+sh.vertexShader
   .replace('#include <beginnormal_vertex>','critterSetup();\nvec3 objectNormal=cRot*normalize(normal/cScale);')
   .replace('#include <begin_vertex>','vec3 transformed=cRot*(position*cScale+cOff)+cBase;');
  sh.fragmentShader='varying float vCritGlow;\n'+sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*vCritGlow;');};
 m.customProgramCacheKey=()=>'city-critters-v1';
 return m;
}

// ---------- GPU side ----------
const isMobile=()=>typeof matchMedia!=='undefined'&&matchMedia('(max-width:600px)').matches;
export function addCitySky(parent,{mobile=isMobile()}={}){
 const root=new THREE.Group();root.name='city sky';parent.add(root);
 // Critters: one instanced box batch, transforms in the vertex shader.
 const uniforms={uTime:{value:0},uCritNight:night,uScatter:{value:new THREE.Vector4(-99,-99,-99,-99)}};
 const box=new THREE.BoxGeometry(1,1,1),geo=new THREE.InstancedBufferGeometry();geo.index=box.index;
 for(const k of ['position','normal','uv'])geo.setAttribute(k,box.attributes[k]);
 const critters=new THREE.Mesh(geo,critterMaterial(uniforms));critters.name='critters';critters.frustumCulled=false;critters.raycast=()=>{};root.add(critters);
 let planKey='';
 function setBuildings(buildings=[]){const key=JSON.stringify(buildings.map(b=>b.plotId).sort());if(key===planKey)return;planKey=key;
  const b=critterBuffers(critterPlan({mobile,buildings}).slice(0,CRITTER_BUDGET[mobile?'mobile':'desktop']));
  geo.setAttribute('aC',new THREE.InstancedBufferAttribute(b.aC,4));geo.setAttribute('aP',new THREE.InstancedBufferAttribute(b.aP,4));
  geo.setAttribute('color',new THREE.InstancedBufferAttribute(b.color,3));geo.instanceCount=b.count;}
 setBuildings([]);
 // Pigeons scatter when a vehicle or the roaming character comes within 2.6 of their spot (one start time per flock).
 const scatter=uniforms.uScatter.value;
 function scare(seconds,scarers){PIGEON_FLOCKS.forEach((f,g)=>{const k=['x','y','z','w'][g];if(seconds-scatter[k]<9&&seconds>=scatter[k])return;
  if(scarers.some(p=>p&&Math.hypot(p.x-f.x,p.z-f.z)<2.6))scatter[k]=seconds;});}
 // Blimp: one mesh, the banner canvas doubles as the body's (white) texture; banner and gondola windows glow at night.
 let canvas=null,ctx=null,texture=null,text="SUBZERONE · TOKYO";
 if(typeof document!=='undefined'){canvas=document.createElement('canvas');canvas.width=BANNER_W;canvas.height=128;ctx=canvas.getContext('2d');
  texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;drawBanner(ctx,text);}
 const blimpMat=toon({vertexColors:true,map:texture});
 blimpMat.onBeforeCompile=sh=>{sh.uniforms.uBlimpNight=night;
  sh.vertexShader='attribute float aGlow;varying float vBlimpGlow;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBlimpGlow=aGlow;');
  sh.fragmentShader='uniform float uBlimpNight;varying float vBlimpGlow;\n'+sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=diffuseColor.rgb*vBlimpGlow*uBlimpNight*.85;');};
 blimpMat.customProgramCacheKey=()=>'city-blimp-v1';
 const blimp=new THREE.Mesh(blimpGeometry(),blimpMat);blimp.name='blimp';blimp.raycast=()=>{};root.add(blimp);   // culled by its own bounds when off screen
 function setBannerText(next){if(next===text)return;text=next;if(ctx){drawBanner(ctx,text);texture.needsUpdate=true;}}
 let state=blimpState(0);
 function update(seconds,scarers=[]){uniforms.uTime.value=seconds;scare(seconds,scarers);
  state=blimpState(seconds);blimp.position.set(state.x,state.y,state.z);blimp.rotation.set(0,state.yaw,0);}
 update(0);
 return {root,critters,blimp,update,setBuildings,setBannerText,get banner(){return text;},get blimpState(){return state;},
  stats:()=>({critters:geo.instanceCount,drawCalls:2})};
}
