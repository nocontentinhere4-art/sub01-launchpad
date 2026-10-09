import * as THREE from 'three';
import {toon} from './toon.js';
import {cityPlots,districts} from './city-state.js';
import {frontOf,planRoute} from './world-sync.js';
import {STRIDE} from './motion.js';
// City reactions to /api/world `events`: fireworks + street party on launches, neon/graffiti on launched buildings,
// client-only visits. Particles are pure functions of (seed, time) in the vertex shader: the CPU only writes a few uniforms.
export const FIRE_AGE=60e3,PARTY_S=40,MAX_OPEN=7,KINDS=['accepted','site_live','launched'];
const BURST_S=2.8,RISE_S=.75,SHOWER_S=7,BUILDING_H=8,ROOF=BUILDING_H+.46;
const plotOf=id=>cityPlots.find(p=>p.id===id);
// The Shibuya billboard (city-life.js, y≈9.4–12.6 at z=-1.53) stands in front of this plot's roof; its sign goes above it.
const SIGN_LIFT={'shibuya-2':2.6};
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;};
const rng=seed=>()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const clock=()=>performance.now()/1000;

export const eventKey=e=>[e.kind,e.plotId,e.name,e.at].join('|');
// New, well-formed events oldest first. Every event is marked seen; only those younger than maxAge are returned (no replay on load).
export function freshEvents(events,seen,now,maxAge=FIRE_AGE){
 if(!Array.isArray(events))return [];
 const out=[],current=new Set();
 for(const e of events){if(!e||!KINDS.includes(e.kind)||!Number.isFinite(e.at))continue;const k=eventKey(e);current.add(k);
  if(seen.has(k))continue;seen.add(k);if(Math.abs(now-e.at)<=maxAge)out.push(e);}
 for(const k of seen)if(!current.has(k))seen.delete(k);
 return out.sort((a,b)=>a.at-b.at);
}
// Sign text: $TICKER (A-Z0-9, ≤10) or the name in capitals, never empty.
export function signText(ticker,name){
 const t=String(ticker??'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10);if(t)return '$'+t;
 return String(name??'').toUpperCase().replace(/[^A-Z0-9 ]/g,'').replace(/\s+/g,' ').trim().slice(0,12)||'OPEN';
}
// n standing spots on the street in front of a plot, rows stepping from the sidewalk toward the road centre, all facing the building.
export function partySpots(plotId,n){
 const p=plotOf(plotId),f=frontOf(plotId);if(!p||!f||n<1)return [];
 const d=districts.find(d=>d.id===p.district),side=Math.sign(f.z-d.z)||1,cols=5;
 return Array.from({length:n},(_,i)=>{const row=Math.floor(i/cols),col=i%cols-(Math.min(cols,n-row*cols)-1)/2,j=(hash(plotId+i)%100)/100-.5;
  const x=f.x+col*1.15+j*.4+(row%2)*.5,z=f.z-side*(.9+row*1.05+j*.3);return {x,z,yaw:Math.atan2(p.x-x,p.z-z)};});
}
// Street route between two apartments' fronts; the visitor stops just left of the host's box figure (front.x+1.2).
export function visitRoute(fromPlot,toPlot){
 const a=frontOf(fromPlot),b=frontOf(toPlot);if(!a||!b||fromPlot===toPlot)return null;
 return planRoute(a,{x:b.x,z:b.z});
}
// Which project buildings get decorations. Launched (phase open, or a launched event on a fully built site) → neon, graffiti, spotlight.
export function decorations(buildings,events){
 const launched=new Set((Array.isArray(events)?events:[]).filter(e=>e?.kind==='launched'&&e.plotId).map(e=>e.plotId)),open=[],soon=[];
 for(const b of Array.isArray(buildings)?buildings:[]){
  if(b?.type!=='project'||!plotOf(b.plotId))continue;
  if(b.phase==='open'||launched.has(b.plotId)&&(b.phase==='launch'||b.phase==='review'))open.push(b);else if(b.phase==='review'||b.phase==='launch')soon.push(b);
 }
 return {open:open.slice(0,MAX_OPEN),soon};
}
// Instances for those decorations: atlas planes, box frames/poles, spotlight bases. Pure, so tests can check placement.
export function decorItems({open,soon}){
 const signs=[],boxes=[],cones=[];
 for(const b of open){const p=plotOf(b.plotId),text=signText(b.ticker,b.name),y=ROOF+2.7+(SIGN_LIFT[b.plotId]||0);
  signs.push({kind:'neon',text,x:p.x,y,z:p.z+1.2,w:4,h:1,ry:0});
  boxes.push({x:p.x,y,z:p.z+1.1,w:4.2,h:1.15,d:.12,color:'#1a2230'});
  for(const dx of [-1.6,1.6])boxes.push({x:p.x+dx,y:(ROOF+y-.5)/2,z:p.z+1.1,w:.1,h:y-.5-ROOF,d:.1,color:'#2b3440'});
  signs.push({kind:'graffiti',text,x:p.x+2.55,y:1,z:p.z,w:4.4,h:1.1,ry:Math.PI/2});
  cones.push({x:p.x-2.1,y:ROOF,z:p.z-2.1});
 }
 for(const b of soon){const p=plotOf(b.plotId);signs.push({kind:'soon',text:'OPEN SOON',x:p.x+.4,y:BUILDING_H*.55+.24,z:p.z+2.53,w:3.2,h:.8,ry:0});}
 return {signs,boxes,cones};
}

const NEON=['#ff4fa3','#4ff3ff','#ffd84f','#8dff6a','#c38bff','#ff8a3d'];
const PARTY_LOOKS=[{top:'#fb752b',bottom:'#2f3e66',skin:'#efbf98',hair:'#2a1b12'},{top:'#69a694',bottom:'#334454',skin:'#a96e51',hair:'#111'},{top:'#d9a5a0',bottom:'#3a3b3d',skin:'#ce9670',hair:'#6b4428'},{top:'#9390c4',bottom:'#263342',skin:'#e2b99a',hair:'#c4a465'},{top:'#e8e0cf',bottom:'#2f3e66',skin:'#c98e66',hair:'#1b1b1b'}];

export function buildFireworks({slots=6,per=200}={}){
 const r=rng(7),pos=new Float32Array(slots*per*3),info=new Float32Array(slots*per*2);
 for(let i=0;i<slots*per;i++){const k=i%per,u=r()*2-1,a=r()*Math.PI*2,s=Math.sqrt(1-u*u),speed=k<12?0:.72+r()*.28;
  pos.set([Math.cos(a)*s*speed,u*speed,Math.sin(a)*s*speed],i*3);info.set([Math.floor(i/per),k<12?k/12:-1],i*2);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));geometry.setAttribute('aInfo',new THREE.BufferAttribute(info,2));
 const uniforms={uTime:{value:0},uScale:{value:20},uBurst:{value:Array.from({length:slots},()=>new THREE.Vector4(0,0,0,-1e4))},uColor:{value:Array.from({length:slots},()=>new THREE.Color())}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
  vertexShader:`uniform float uTime,uScale;uniform vec4 uBurst[${slots}];uniform vec3 uColor[${slots}];attribute vec2 aInfo;varying vec3 vColor;varying float vAlpha;
void main(){int i=int(aInfo.x+.5);vec4 b=uBurst[i];float age=uTime-b.w;vec3 p;float size;
 if(aInfo.y>=0.){float t=(age+${RISE_S.toFixed(2)})/${RISE_S.toFixed(2)}-aInfo.y*.18;if(t<0.||t>1.){gl_Position=vec4(0.,0.,-2.,1.);gl_PointSize=0.;return;}
  p=b.xyz-vec3(0.,7.*(1.-t),0.);vAlpha=.9*(1.-aInfo.y);vColor=vec3(1.,.8,.5);size=.16;}
 else{if(age<0.||age>${BURST_S.toFixed(1)}){gl_Position=vec4(0.,0.,-2.,1.);gl_PointSize=0.;return;}
  float life=age/${BURST_S.toFixed(1)};p=b.xyz+position*(1.-exp(-age*2.6))*5.;p.y-=.45*age*age;
  vAlpha=(1.-life)*(1.-life)*(.6+.4*sin(age*38.+position.x*91.));vColor=mix(vec3(1.,.96,.85),uColor[i],min(1.,age*3.));size=.34*(1.-.5*life);}
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(uScale*size,2.5,14.);}`,
  fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(vColor,vAlpha*(1.-d*1.6));}`});
 const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.visible=false;points.renderOrder=3;
 return {points,uniforms,slots};
}
export function buildConfetti({slots=2,per=220}={}){
 const r=rng(11),pos=new Float32Array(slots*per*3),slot=new Float32Array(slots*per);
 for(let i=0;i<slots*per;i++){pos.set([r()*2-1,r(),r()*2-1],i*3);slot[i]=Math.floor(i/per);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));geometry.setAttribute('aSlot',new THREE.BufferAttribute(slot,1));
 const uniforms={uTime:{value:0},uScale:{value:20},uShower:{value:Array.from({length:slots},()=>new THREE.Vector4(0,0,0,-1e4))}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,
  vertexShader:`uniform float uTime,uScale;uniform vec4 uShower[${slots}];attribute float aSlot;varying vec3 vColor;varying float vFlip;varying float vAlpha;
void main(){vec4 s=uShower[int(aSlot+.5)];float age=uTime-s.w-position.y*2.5;
 if(uTime<s.w||age<0.||age>${SHOWER_S.toFixed(1)}){gl_Position=vec4(0.,0.,-2.,1.);gl_PointSize=0.;return;}
 float y=max(.3,s.y+1.5+position.y*2.5-age*1.05);
 vec3 p=vec3(s.x+position.x*3.4+sin(age*2.1+position.y*20.)*.35*step(.31,y),y,s.z+position.z*1.6);
 vFlip=step(.31,y)*abs(sin(age*6.+position.y*40.))+.15;vAlpha=1.-smoothstep(${(SHOWER_S-1).toFixed(1)},${SHOWER_S.toFixed(1)},age);
 float h=fract(position.y*7.3);vColor=h<.35?vec3(1.,.72,.8):.5+.5*cos(6.2831*(h+vec3(0.,.33,.67)));
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(uScale*.17,2.,8.);}`,
  fragmentShader:`varying vec3 vColor;varying float vFlip;varying float vAlpha;void main(){vec2 c=abs(gl_PointCoord-.5);if(c.x>.5*vFlip||c.y>.28)discard;gl_FragColor=vec4(vColor,vAlpha);}`});
 const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.visible=false;points.renderOrder=2;
 return {points,uniforms,slots};
}

// Atlas tiles 512×128: 0 = OPEN SOON, 1+2i / 2+2i = neon / graffiti of the i-th launched sign.
const TW=512,TH=128,COLS=2,ROWS=8;
function drawTile(ctx,tile,kind,text){
 const x=tile%COLS*TW,y=Math.floor(tile/COLS)*TH,c=NEON[hash(text)%NEON.length],r=rng(hash(text));
 ctx.save();ctx.translate(x,y);ctx.clearRect(0,0,TW,TH);ctx.beginPath();ctx.rect(0,0,TW,TH);ctx.clip();ctx.textAlign='center';ctx.textBaseline='middle';
 if(kind==='soon'){
  ctx.fillStyle='#1d211c';ctx.fillRect(0,0,TW,TH);ctx.fillStyle='#ffc94a';for(let i=-2;i<14;i++){ctx.beginPath();ctx.moveTo(i*44,0);ctx.lineTo(i*44+22,0);ctx.lineTo(i*44-18,TH);ctx.lineTo(i*44-40,TH);ctx.fill();}
  ctx.fillStyle='#fff6df';ctx.fillRect(22,16,TW-44,TH-32);ctx.fillStyle='#1d211c';ctx.font='bold 62px Arial, sans-serif';ctx.fillText(text,TW/2,TH/2+3,TW-70);
 }else if(kind==='neon'){
  ctx.fillStyle='#10151f';rrect(ctx,4,4,TW-8,TH-8,20);ctx.fill();
  ctx.shadowColor=c;ctx.shadowBlur=16;ctx.strokeStyle=c;ctx.lineWidth=5;rrect(ctx,14,14,TW-28,TH-28,14);ctx.stroke();
  ctx.font='900 74px "Arial Black", Arial, sans-serif';ctx.shadowBlur=26;ctx.fillStyle=c;ctx.fillText(text,TW/2,TH/2+4,TW-60);
  ctx.shadowBlur=6;ctx.fillStyle='#fffaf0';ctx.font='900 70px "Arial Black", Arial, sans-serif';ctx.fillText(text,TW/2,TH/2+4,TW-66);
 }else{
  const font='italic 900 82px Impact, "Arial Black", sans-serif',w=Math.min(TW-50,(ctx.font=font,ctx.measureText(text).width));
  ctx.globalAlpha=.55;for(let i=0;i<90;i++){ctx.fillStyle=r()<.5?c:'#1b1b1b';ctx.beginPath();ctx.arc(TW/2+(r()-.5)*(w+60),TH/2+(r()-.5)*90,r()*3+1,0,7);ctx.fill();}ctx.globalAlpha=1;
  ctx.font=font;ctx.lineJoin='round';ctx.lineWidth=16;ctx.strokeStyle='#141414';ctx.strokeText(text,TW/2,TH/2,TW-50);
  const g=ctx.createLinearGradient(0,20,0,TH-20);g.addColorStop(0,'#fff6c8');g.addColorStop(.5,c);g.addColorStop(1,NEON[(hash(text)+2)%NEON.length]);
  ctx.fillStyle=g;ctx.fillText(text,TW/2,TH/2,TW-50);ctx.fillStyle=c;
  for(let i=0;i<9;i++){const dx=TW/2+(r()-.5)*w,len=10+r()*26;ctx.fillRect(dx,TH/2+26,5,len);ctx.beginPath();ctx.arc(dx+2.5,TH/2+26+len,4,0,7);ctx.fill();}
 }
 ctx.restore();
}
// roundRect is missing on older iOS Safari; a plain rectangle is fine there.
const rrect=(ctx,x,y,w,h,r)=>{ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);};
const tileUV=t=>[t%COLS,ROWS-1-Math.floor(t/COLS)];

export function createCityEvents(scene,{mobile=false,reducedMotion=false}={}){
 const root=new THREE.Group();root.name='City events';scene.add(root);
 const fw=buildFireworks({slots:6,per:mobile?120:200}),cf=buildConfetti({slots:2,per:mobile?140:220});root.add(fw.points,cf.points);
 const unit=new THREE.BoxGeometry(1,1,1),m4=new THREE.Matrix4(),part=new THREE.Matrix4(),q=new THREE.Quaternion(),e3=new THREE.Euler(),v3=new THREE.Vector3(),s3=new THREE.Vector3(),color=new THREE.Color();
 // Party crowd: ≤12 six-box figures in one instanced mesh, only visible during a party.
 const CROWD=mobile?6:10,crowd=new THREE.InstancedMesh(unit,toon(),CROWD*6);crowd.frustumCulled=false;crowd.visible=false;root.add(crowd);
 const decorBoxes=new THREE.InstancedMesh(unit,toon(),MAX_OPEN*3);decorBoxes.count=0;root.add(decorBoxes);
 let signs=null,atlas=null,ctx=null;
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=TW*COLS;canvas.height=TH*ROWS;ctx=canvas.getContext('2d');
  atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=2;
  const g=new THREE.PlaneGeometry(1,1);g.setAttribute('aTile',new THREE.InstancedBufferAttribute(new Float32Array(MAX_OPEN*2*2+64),2));
  const mat=new THREE.MeshBasicMaterial({map:atlas,alphaTest:.5,side:THREE.DoubleSide,toneMapped:false});
  mat.onBeforeCompile=s=>{s.vertexShader='attribute vec2 aTile;\n'+s.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>\nvMapUv=(vMapUv+aTile)/vec2(${COLS}.,${ROWS}.);`);};mat.customProgramCacheKey=()=>'city-events-atlas';
  signs=new THREE.InstancedMesh(g,mat,MAX_OPEN*2+32);signs.count=0;root.add(signs);
 }
 // Spotlight cones: apex on the roof, swept by the vertex shader; night only.
 const coneGeo=new THREE.ConeGeometry(1.9,16,14,1,true);coneGeo.rotateX(Math.PI);coneGeo.translate(0,8,0);
 const coneTime={value:0},cones=new THREE.InstancedMesh(coneGeo,new THREE.ShaderMaterial({uniforms:{uTime:coneTime},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  vertexShader:`uniform float uTime;varying float vT;void main(){vec3 p=position;vT=p.y/16.;float ph=instanceMatrix[3].x*.37+instanceMatrix[3].z*.21,yaw=uTime*.35+ph,tilt=.45+.12*sin(uTime*.5+ph);
 float c=cos(tilt),s=sin(tilt);p=vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);c=cos(yaw);s=sin(yaw);p=vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);
 gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);}`,
  fragmentShader:`varying float vT;void main(){gl_FragColor=vec4(1.,.93,.75,(1.-vT)*(.25+.75*(1.-vT))*.55);}`}),MAX_OPEN);
 cones.count=0;cones.frustumCulled=false;cones.visible=false;root.add(cones);
 let night=false,decorKey='',buildings=[],soonDrawn=false;const tileOf=new Map();
 function decorate(next,events){
  buildings=Array.isArray(next)?next:[];const d=decorations(buildings,events),items=decorItems(d),key=JSON.stringify(items);if(key===decorKey)return;decorKey=key;
  items.boxes.forEach((b,i)=>{m4.compose(v3.set(b.x,b.y,b.z),q.identity(),s3.set(b.w,b.h,b.d));decorBoxes.setMatrixAt(i,m4);decorBoxes.setColorAt(i,color.set(b.color));});
  decorBoxes.count=items.boxes.length;decorBoxes.instanceMatrix.needsUpdate=true;if(decorBoxes.instanceColor)decorBoxes.instanceColor.needsUpdate=true;decorBoxes.computeBoundingSphere();
  items.cones.forEach((c,i)=>{m4.makeTranslation(c.x,c.y,c.z);cones.setMatrixAt(i,m4);});cones.count=items.cones.length;cones.instanceMatrix.needsUpdate=true;cones.visible=night&&cones.count>0;
  if(!signs)return;
  // Tiles are cached by sign text; only texts new to the atlas are drawn.
  const texts=[...new Set(d.open.map(b=>signText(b.ticker,b.name)))];for(const t of [...tileOf.keys()])if(!texts.includes(t))tileOf.delete(t);
  let dirty=!soonDrawn;if(dirty){drawTile(ctx,0,'soon','OPEN SOON');soonDrawn=true;}
  for(const t of texts)if(!tileOf.has(t)){const used=new Set(tileOf.values());let i=0;while(used.has(i))i++;tileOf.set(t,i);drawTile(ctx,1+2*i,'neon',t);drawTile(ctx,2+2*i,'graffiti',t);dirty=true;}
  if(dirty)atlas.needsUpdate=true;
  const attr=signs.geometry.getAttribute('aTile'),list=items.signs.slice(0,signs.instanceMatrix.count);
  list.forEach((s,i)=>{const t=s.kind==='soon'?0:1+2*tileOf.get(s.text)+(s.kind==='graffiti'?1:0);attr.setXY(i,...tileUV(t));
   m4.compose(v3.set(s.x,s.y,s.z),q.setFromEuler(e3.set(0,s.ry,0)),s3.set(s.w,s.h,1));signs.setMatrixAt(i,m4);});
  signs.count=list.length;attr.needsUpdate=true;signs.instanceMatrix.needsUpdate=true;signs.computeBoundingSphere();
 }
 // Fireworks: bursts wait in a queue until one of the 6 slots is free.
 const queue=[],lastParty=new Map();let party=null,visit=null;
 function celebrate(plotId,{people=[]}={}){
  const p=plotOf(plotId),f=frontOf(plotId),T=clock();if(!p||!f||lastParty.get(plotId)>T-FIRE_AGE/1000)return null;lastParty.set(plotId,T);
  const r=rng(hash(plotId)^Math.floor(T));
  if(!reducedMotion){for(const dt of [0,2.6,5.4,8.6])queue.push({x:p.x+(r()-.5)*5,y:13+r()*3,z:p.z+(r()-.5)*4,at:T+dt+.3,color:NEON[Math.floor(r()*NEON.length)]});
   [T+.4,T+10].forEach((at,i)=>{cf.uniforms.uShower.value[i].set(f.x,4+r()*1.5,f.z,at);});cf.points.visible=true;}
  // The nearest residents' looks dress the crowd; strangers fill the rest so it always reads as a party.
  const near=people.filter(x=>x?.look).map(x=>({look:x.look,d:Math.hypot(x.x-f.x,x.z-f.z)})).sort((a,b)=>a.d-b.d).slice(0,CROWD);
  const spots=partySpots(plotId,CROWD);
  party={plotId,start:T,end:T+PARTY_S,figs:spots.map((s,i)=>({...s,look:{...PARTY_LOOKS[i%PARTY_LOOKS.length],...(near[i]?.look||{})},ph:r()*6,from:{x:s.x+(r()<.5?-1:1)*(5+r()*3),z:s.z}}))};
  party.figs.forEach((fig,i)=>[fig.look.bottom,fig.look.top,fig.look.skin,fig.look.hair,fig.look.top,fig.look.top].forEach((c,j)=>crowd.setColorAt(i*6+j,color.set(c||'#888'))));
  crowd.count=party.figs.length*6;if(crowd.instanceColor)crowd.instanceColor.needsUpdate=true;crowd.visible=true;
  return {spot:{x:f.x,z:f.z},address:p.name,until:party.end};
 }
 const PARTS=[[0,.32,0,.42,.62,.26],[0,.92,0,.56,.62,.34],[0,1.46,0,.46,.46,.42],[0,1.73,-.03,.5,.16,.46]];
 function drawParty(T){
  const k=(T-party.start),fade=Math.min(1,Math.max(0,party.end-T));
  party.figs.forEach((fig,i)=>{const enter=Math.min(1,Math.max(0,(k-i*.15)/2)),e=1-(1-enter)**2,x=fig.from.x+(fig.x-fig.from.x)*e,z=fig.from.z+(fig.z-fig.from.z)*e;
   const walking=enter<1,jump=walking?Math.abs(Math.sin(k*9+i))*.05:Math.max(0,Math.sin(T*6.5+fig.ph))*.28,yaw=walking?Math.atan2(fig.x-fig.from.x,0):fig.yaw;
   m4.compose(v3.set(x,.26+jump,z),q.setFromEuler(e3.set(0,yaw,0)),s3.setScalar(fade||1e-4));
   PARTS.forEach(([px,py,pz,w,h,d],j)=>{part.compose(v3.set(px,py,pz),q.identity(),s3.set(w,h,d));crowd.setMatrixAt(i*6+j,part.premultiply(m4));});
   for(const side of [-1,1]){const a=walking?.2:2.5+Math.sin(T*9+fig.ph+side)*.35;
    part.compose(v3.set(side*(.34+Math.sin(a)*.26),1.15-Math.cos(a)*.26,0),q.setFromEuler(e3.set(0,0,side*a)),s3.set(.14,.52,.16));crowd.setMatrixAt(i*6+(side<0?4:5),part.premultiply(m4));}
  });
  crowd.instanceMatrix.needsUpdate=true;
 }
 function startVisit(o){
  if(visit)return false;const route=visitRoute(o.from,o.to);if(!route)return false;
  visit={...o,route,state:'loading'};const v=visit;
  Promise.resolve().then(o.load).then(c=>{if(visit!==v){c.dispose();return;}v.char=c;const r=c.root;r.position.set(route[0].x,.26,route[0].z);
   // Prefer the rig's own skate emote (board + lean, characters.js); otherwise a plain box board and the Run clip.
   if(o.skate&&!(v.emote=typeof c.emote==='function'&&c.emote('skate')===true)){v.board=new THREE.Mesh(new THREE.BoxGeometry(.34,.06,.95),toon({color:'#fb752b'}));v.board.position.y=-.06;r.add(v.board);r.position.y=.38;}
   scene.add(r);Object.assign(v,{state:'go',path:route,i:1,dist:0,speed:(route.reduce((s,p,i)=>i?s+Math.hypot(p.x-route[i-1].x,p.z-route[i-1].z):0,0)>30?3:2.2)*(o.skate?2:1)});o.onStart?.(r);},
   ()=>{if(visit===v)endVisit();});
  return true;
 }
 function endVisit(){const v=visit;visit=null;if(!v)return;v.char?.dispose();if(v.board){v.board.geometry.dispose();v.board.material.dispose();}v.onEnd?.();}
 function stepVisit(dt,T){
  const v=visit,c=v.char;if(!c)return;c.update(dt);const r=c.root;
  if(v.state==='stay'){if(T>v.waveAt){c.play('Wave');v.waveAt=Infinity;}if(T>v.until){v.state='back';v.path=[...v.route].reverse();v.i=1;if(v.emote)c.emote('skate');}return;}
  const t=v.path[v.i],dx=t.x-r.position.x,dz=t.z-r.position.z,dist=Math.hypot(dx,dz),step=dt*v.speed;
  if(dist<=step){r.position.x=t.x;r.position.z=t.z;v.dist+=dist;if(++v.i<v.path.length)return;
   if(v.state==='back'){endVisit();return;}
   v.state='stay';v.until=T+20;v.waveAt=T+10;r.rotation.y=Math.PI/2;if(v.emote)c.stopEmote?.();c.play('Idle');c.play('Wave');v.onArrive?.();return;}
  r.position.x+=dx/dist*step;r.position.z+=dz/dist*step;v.dist+=step;r.rotation.y=Math.atan2(dx,dz);
  if(v.emote)return;if(v.skate)c.play('Run');else{c.play('Walk');c.stride?.(v.dist/STRIDE%1);}
 }
 // dt in seconds; pxPerUnit = screen pixels per world unit (orthographic), so particle sizes follow zoom.
 function update(dt,pxPerUnit=20){
  const T=clock();
  if(fw.points.visible||queue.length){
   const b=fw.uniforms.uBurst.value;
   for(let i=queue.length-1;i>=0;i--){if(queue[i].at-T>RISE_S)continue;const s=b.findIndex(x=>T>x.w+BURST_S);if(s<0)break;const e=queue.splice(i,1)[0];b[s].set(e.x,e.y,e.z,e.at);fw.uniforms.uColor.value[s].set(e.color);}
   fw.points.visible=queue.length>0||b.some(x=>T<x.w+BURST_S);
  }
  if(cf.points.visible)cf.points.visible=cf.uniforms.uShower.value.some(s=>T<s.w+SHOWER_S+2.5);
  fw.uniforms.uTime.value=cf.uniforms.uTime.value=T;fw.uniforms.uScale.value=cf.uniforms.uScale.value=pxPerUnit;coneTime.value=reducedMotion?0:T;
  if(party){if(T>party.end){party=null;crowd.visible=false;crowd.count=0;}else drawParty(T);}
  if(visit)stepVisit(dt,T);
 }
 return {root,decorate,celebrate,update,visit:startVisit,cancelVisit:endVisit,
  // Additive sparks vanish on the pale day sky, so daytime fireworks blend normally.
  setNight(v){night=!!v;cones.visible=night&&cones.count>0;fw.points.material.blending=night?THREE.AdditiveBlending:THREE.NormalBlending;},
  get visiting(){return !!visit;},get party(){return party;},get visitor(){return visit?.char?.root||null;},
  stats:()=>({points:fw.points.geometry.attributes.position.count+cf.points.geometry.attributes.position.count,signs:signs?.count||0,boxes:decorBoxes.count,cones:cones.count})};
}
