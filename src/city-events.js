import * as THREE from 'three';
import {toon} from './toon.js';
import {cityPlots,districts} from './city-state.js';
import {frontOf,planRoute} from './world-sync.js';
import {STRIDE} from './motion.js';
import {createPet,petFollow} from './accessories.js';
import {groundY,WALK_SPEED,RUN_SPEED} from './explore.js';
import {subLotsOf,builtHeight,BASE_Y} from './lots.js';
import {safeImageUrl} from './city-screens.js';
// City reactions to /api/world `events`: fireworks + street party on launches, neon/graffiti on launched buildings,
// client-only visits and explore mode (one roaming model at a time). Particles are pure functions of (seed, time) in the vertex shader: the CPU only writes a few uniforms.
export const FIRE_AGE=60e3,PARTY_S=40,MAX_OPEN=7,KINDS=['accepted','site_live','launched'];
const BURST_S=2.8,RISE_S=.75,SHOWER_S=7;
const plotOf=id=>cityPlots.find(p=>p.id===id);
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
// Which project buildings get decorations. Launched (phase open, or a launched event on a fully built site) → neon, graffiti,
// spotlight; waiting for launch (review / launch) → the pulsing orange beacon at night. Every project also carries its coin.
export function decorations(buildings,events){
 const launched=new Set((Array.isArray(events)?events:[]).filter(e=>e?.kind==='launched'&&e.plotId).map(e=>e.plotId)),open=[],soon=[];
 for(const b of Array.isArray(buildings)?buildings:[]){
  if(b?.type!=='project'||!plotOf(b.plotId))continue;
  if(b.phase==='open'||launched.has(b.plotId)&&(b.phase==='launch'||b.phase==='review'))open.push(b);else if(b.phase==='review'||b.phase==='launch')soon.push(b);
 }
 return {open:open.slice(0,MAX_OPEN),soon};
}
// The user lot a project stands on (lots.js) and how tall it is right now. `all` must be the list city.js drew, so the
// lots.js layout cache is hit (and the lot is the one on screen).
function siteOf(b,all){const lot=subLotsOf(b.plotId,all).user;if(!lot)return null;const fz=lot.front==='+z'?1:-1,top=BASE_Y+builtHeight(lot,b);return {lot,fz,top};}
// Instances for the launched decorations: atlas planes, box frames/poles, spotlight bases. Pure, so tests can check placement.
// The neon stands on the front edge of the real roof, the spotlight on its back corner (wave 4A: lots.js heights).
export function decorItems({open},all=open){
 const signs=[],boxes=[],cones=[];
 for(const b of open){const p=plotOf(b.plotId),s=siteOf(b,all),text=signText(b.ticker,b.name);if(!s)continue;
  const {lot,fz,top}=s,y=top+1.4,z=lot.frontZ-fz*.5;
  signs.push({kind:'neon',text,x:lot.x,y,z:z+fz*.07,w:4,h:1,ry:fz>0?0:Math.PI});
  boxes.push({x:lot.x,y,z,w:4.2,h:1.15,d:.12,color:'#1a2230'});
  for(const dx of [-1.6,1.6])boxes.push({x:lot.x+dx,y:(top+y-.5)/2,z,w:.1,h:y-.5-top,d:.1,color:'#2b3440'});
  signs.push({kind:'graffiti',text,x:p.x+2.55,y:1,z:p.z,w:4.4,h:1.1,ry:Math.PI/2});
  cones.push({x:lot.x-(lot.width/2-.5),y:top,z:lot.z-fz*(lot.depth/2-.6)});
 }
 return {signs,boxes,cones};
}

// ---------- Coins on buildings (wave 4A) ----------
// Every project building (any phase from 'thinking') shows its coin: a vertical blade banner on the front face with the
// $TICKER and its state, and — public projects with a logo — a rooftop billboard with the logo. Only public data from
// /api/world: a private project shows the generic 'Private project' card and nothing else. Art is loaded only from the
// server's own /meta/… paths (city-screens.js safeImageUrl). One shared 1024² canvas atlas of 128×256 tiles, cached by
// ticker + state; all coin planes are ONE instanced mesh, the night beacons another (+2 draw calls).
export const COIN_TW=128,COIN_TH=256,COIN_COLS=8,COIN_ROWS=4,COIN_TILES=COIN_COLS*COIN_ROWS,MAX_COINS=16;
export const STATE_TEXT={thinking:'BUILDING',scaffold:'BUILDING',stopped:'ON HOLD',review:'LAUNCHING SOON',launch:'LAUNCHING SOON',open:'LAUNCHED'};
const STATE_RANK={open:0,launch:1,review:2,scaffold:3,thinking:4,stopped:5};
const STATE_INK={BUILDING:'#f2b84b','ON HOLD':'#9aa0a0','LAUNCHING SOON':'#fb752b',LAUNCHED:'#35c27a'};
export const shortMint=m=>typeof m==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)?m.slice(0,4)+'…'+m.slice(-4):'';
// What a building's coin says. Pure: the canvas only draws this.
export function coinCard(b){
 const state=STATE_TEXT[b?.phase];if(b?.type!=='project'||!state)return null;
 if(b.private)return {key:'b|private',private:true,ticker:'',state:'',lines:['PRIVATE','PROJECT'],sub:'',logo:null,soon:false};
 const ticker=signText(b.ticker,b.name),sub=b.phase==='open'?shortMint(b.mint):'',logo=safeImageUrl(b.logoUrl);
 return {key:`b|${ticker}|${state}|${sub}`,private:false,ticker,state,lines:state==='LAUNCHING SOON'?['LAUNCHING','SOON']:[state],sub,logo,
  logoKey:logo?`l|${logo}|${ticker}|${state}`:null,soon:b.phase==='review'||b.phase==='launch'};
}
// Tiles keep their slot while their key stays in use; new keys take the lowest free slots, in priority order, until the
// atlas is full (keys past that are dropped). fresh = keys whose tile must be (re)drawn.
export function allocTiles(prev,keys,capacity=COIN_TILES){
 const map=new Map();for(const k of keys)if(prev.has(k)&&!map.has(k))map.set(k,prev.get(k));
 const used=new Set(map.values()),fresh=[];let i=0;
 for(const k of keys){if(map.has(k))continue;while(used.has(i))i++;if(i>=capacity)break;map.set(k,i);used.add(i);fresh.push(k);}
 return {map,fresh};
}
// Coin planes, billboard frames and beacons for the project buildings. `all` = the buildings city.js drew.
export function coinPlan(buildings,all=buildings){
 const list=(Array.isArray(buildings)?buildings:[]).filter(b=>b?.type==='project'&&STATE_TEXT[b.phase]&&plotOf(b.plotId))
  .sort((a,b)=>STATE_RANK[a.phase]-STATE_RANK[b.phase]||(a.plotId<b.plotId?-1:1)).slice(0,MAX_COINS);
 const cards=[],planes=[],boxes=[],beacons=[];
 for(const b of list){const card=coinCard(b),s=siteOf(b,all);if(!card||!s)continue;cards.push(card);
  const {lot,fz,top}=s,site=b.phase==='thinking'||b.phase==='scaffold'||b.phase==='stopped';
  // Blade banner: projects from the front face at one end of the lot (the site sign's other end), readable from both sides.
  const side=site?-1:hash(b.plotId)&1?1:-1,bw=site?.9:1.15,bh=bw*2,bx=lot.x+side*(lot.width/2-.14),bz=lot.frontZ+fz*(.06+bw/2),by=Math.max(BASE_Y+.45+bh/2,top-.35-bh/2);
  for(const ry of [Math.PI/2,-Math.PI/2])planes.push({key:card.key,kind:'banner',plotId:b.plotId,x:bx+Math.sin(ry)*.025,y:by,z:bz,w:bw,h:bh,ry});
  boxes.push({x:bx,y:by+bh/2+.06,z:bz,w:.06,h:.08,d:bw+.1,color:'#2b3440'});
  // Rooftop billboard with the logo (public projects with art), on two posts at the back of the roof, both faces readable.
  if(card.logoKey){const w=Math.min(1.8,lot.width-.4),h=w*2,bz2=lot.z-fz*(lot.depth/2-.45),y0=top+(b.phase==='open'?1.1:.55);
   for(const ry of [0,Math.PI])planes.push({key:card.logoKey,kind:'logo',plotId:b.plotId,x:lot.x,y:y0+h/2,z:bz2+Math.cos(ry)*.07,w,h,ry});
   boxes.push({x:lot.x,y:y0+h/2,z:bz2,w:w+.14,h:h+.14,d:.1,color:'#1a2230'});
   for(const dx of [-.35,.35])boxes.push({x:lot.x+dx*w,y:(top+y0)/2,z:bz2,w:.1,h:y0-top,d:.1,color:'#2b3440'});}
  // Beacon: on a 1.2 m mast at the front corner opposite the banner, clear of the roof clutter.
  if(card.soon){const x=lot.x-side*(lot.width/2-.3),z=lot.frontZ-fz*.3;beacons.push({x,y:top+1.35,z,plotId:b.plotId});boxes.push({x,y:top+.6,z,w:.08,h:1.2,d:.08,color:'#2b3440'});}
 }
 return {cards,planes,boxes,beacons};
}
// One 128×256 tile: the blade banner (vertical $TICKER over a state band) or the logo card (logo, ticker, state).
function drawCoinTile(ctx,tile,kind,card,img){
 const W=COIN_TW,H=COIN_TH,x=tile%COIN_COLS*W,y=Math.floor(tile/COIN_COLS)*H,c=NEON[hash(card.ticker||'private')%NEON.length];
 ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.rect(0,0,W,H);ctx.clip();ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillStyle='#14181f';ctx.fillRect(0,0,W,H);
 if(card.private){ctx.fillStyle='#3a4048';ctx.fillRect(10,10,W-20,H-20);ctx.fillStyle='#d9d4c7';ctx.font='bold 22px Arial, sans-serif';
  card.lines.forEach((l,i)=>ctx.fillText(l,W/2,H/2-14+i*28,W-28));ctx.restore();return;}
 const ink=STATE_INK[card.state]||'#f2b84b',band=card.sub?78:card.lines.length>1?66:46;
 if(kind==='banner'){
  ctx.fillStyle=c;ctx.fillRect(6,6,W-12,H-12);ctx.fillStyle='#fff8ec';ctx.fillRect(14,14,W-28,H-28-band);
  const chars=[...card.ticker],n=chars.length,step=Math.min(46,(H-36-band)/n);ctx.fillStyle='#1d211c';ctx.font=`900 ${Math.floor(step*.92)}px "Arial Black", Arial, sans-serif`;
  chars.forEach((ch,i)=>ctx.fillText(ch,W/2,18+step*(i+.5)+((H-36-band)-step*n)/2,W-36));
 }else{
  ctx.fillStyle='#fff8ec';ctx.fillRect(6,6,W-12,W-12);
  if(img){const s=Math.max((W-20)/img.naturalWidth,(W-20)/img.naturalHeight),iw=img.naturalWidth*s,ih=img.naturalHeight*s;ctx.save();ctx.beginPath();ctx.rect(10,10,W-20,W-20);ctx.clip();ctx.drawImage(img,W/2-iw/2,W/2-ih/2,iw,ih);ctx.restore();}
  else{ctx.fillStyle=c;ctx.fillRect(10,10,W-20,W-20);ctx.fillStyle='#14181f';ctx.font='900 40px "Arial Black", Arial, sans-serif';ctx.fillText(card.ticker.slice(0,4),W/2,W/2,W-28);}
  ctx.fillStyle='#fff8ec';ctx.font='900 26px "Arial Black", Arial, sans-serif';ctx.fillText(card.ticker,W/2,W+(H-W-band)/2,W-16);
 }
 ctx.fillStyle=ink;ctx.fillRect(6,H-6-band,W-12,band);ctx.fillStyle='#14181f';ctx.font='bold 17px Arial, sans-serif';
 card.lines.forEach((l,i)=>ctx.fillText(l,W/2,H-6-band+16+i*20,W-20));
 if(card.sub){ctx.font='bold 14px Menlo, monospace';ctx.fillText(card.sub,W/2,H-6-band+16+card.lines.length*20+4,W-20);}
 ctx.restore();
}
const coinUV=t=>[t%COIN_COLS,COIN_ROWS-1-Math.floor(t/COIN_COLS)];
// Logos: one Image per safe URL, decoded once; the tile is redrawn when it arrives (a failed load keeps the ticker card).
const logoImages=new Map();
function logoImage(url,onReady){if(!url||typeof Image==='undefined')return null;let e=logoImages.get(url);
 if(!e){e={img:new Image(),ok:null,wait:new Set()};logoImages.set(url,e);e.img.decoding='async';
  const done=ok=>{e.ok=ok;for(const f of e.wait)f();e.wait.clear();};e.img.onload=()=>done(e.img.naturalWidth>0);e.img.onerror=()=>done(false);e.img.src=url;}
 if(e.ok===null)e.wait.add(onReady);return e.ok?e.img:null;}

const NEON=['#ff4fa3','#4ff3ff','#ffd84f','#8dff6a','#c38bff','#ff8a3d'];
const PARTY_LOOKS=[{outfit:'tee',top:'#fb752b',bottom:'#2f3e66',skin:'#efbf98',hair:'#2a1b12'},{outfit:'hoodie',top:'#69a694',bottom:'#334454',skin:'#a96e51',hair:'#111'},{outfit:'jacket',top:'#d9a5a0',bottom:'#3a3b3d',skin:'#ce9670',hair:'#6b4428'},{outfit:'suit',top:'#9390c4',bottom:'#263342',skin:'#e2b99a',hair:'#c4a465'},{outfit:'tee',top:'#e8e0cf',bottom:'#2f3e66',skin:'#c98e66',hair:'#1b1b1b'}];

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

// Atlas tiles 512×128: 1+2i / 2+2i = neon / graffiti of the i-th launched sign (tile 0 is unused since the coin banners
// took over OPEN SOON).
const TW=512,TH=128,COLS=2,ROWS=8;
function drawTile(ctx,tile,kind,text){
 const x=tile%COLS*TW,y=Math.floor(tile/COLS)*TH,c=NEON[hash(text)%NEON.length],r=rng(hash(text));
 ctx.save();ctx.translate(x,y);ctx.clearRect(0,0,TW,TH);ctx.beginPath();ctx.rect(0,0,TW,TH);ctx.clip();ctx.textAlign='center';ctx.textBaseline='middle';
 if(kind==='neon'){
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

export function createCityEvents(scene,{mobile=false,reducedMotion=false,gpu=null}={}){
 const root=new THREE.Group();root.name='City events';scene.add(root);
 const fw=buildFireworks({slots:6,per:mobile?120:200}),cf=buildConfetti({slots:2,per:mobile?140:220});root.add(fw.points,cf.points);
 const unit=new THREE.BoxGeometry(1,1,1),m4=new THREE.Matrix4(),part=new THREE.Matrix4(),q=new THREE.Quaternion(),e3=new THREE.Euler(),v3=new THREE.Vector3(),s3=new THREE.Vector3(),color=new THREE.Color();
 // Party crowd: ≤12 six-box figures in one instanced mesh, only visible during a party; up close (gpu.active) the guests are
 // characters from crowd-gpu.js instead (walking in, then waving and jumping).
 const CROWD=mobile?6:10,crowd=new THREE.InstancedMesh(unit,toon(),CROWD*6);crowd.frustumCulled=false;crowd.visible=false;root.add(crowd);
 const decorBoxes=new THREE.InstancedMesh(unit,toon(),MAX_OPEN*3+MAX_COINS*5);decorBoxes.count=0;root.add(decorBoxes);
 let signs=null,atlas=null,ctx=null,coins=null,coinAtlas=null,coinCtx=null;
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=TW*COLS;canvas.height=TH*ROWS;ctx=canvas.getContext('2d');
  atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=2;
  const g=new THREE.PlaneGeometry(1,1);g.setAttribute('aTile',new THREE.InstancedBufferAttribute(new Float32Array(MAX_OPEN*2*2+64),2));
  const mat=new THREE.MeshBasicMaterial({map:atlas,alphaTest:.5,side:THREE.DoubleSide,toneMapped:false});
  mat.onBeforeCompile=s=>{s.vertexShader='attribute vec2 aTile;\n'+s.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>\nvMapUv=(vMapUv+aTile)/vec2(${COLS}.,${ROWS}.);`);};mat.customProgramCacheKey=()=>'city-events-atlas';
  signs=new THREE.InstancedMesh(g,mat,MAX_OPEN*2+32);signs.count=0;root.add(signs);
  // Coin atlas: 8 × 4 tiles of 128×256 on one 1024² canvas; single-sided planes (each billboard is two, back to back).
  const cc=document.createElement('canvas');cc.width=COIN_TW*COIN_COLS;cc.height=COIN_TH*COIN_ROWS;coinCtx=cc.getContext('2d');
  coinAtlas=new THREE.CanvasTexture(cc);coinAtlas.colorSpace=THREE.SRGBColorSpace;coinAtlas.anisotropy=4;
  const cg=new THREE.PlaneGeometry(1,1);cg.setAttribute('aTile',new THREE.InstancedBufferAttribute(new Float32Array(MAX_COINS*4*2),2));
  const cm=new THREE.MeshBasicMaterial({map:coinAtlas,toneMapped:false});
  cm.onBeforeCompile=s=>{s.vertexShader='attribute vec2 aTile;\n'+s.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>\nvMapUv=(vMapUv*vec2(.97,.985)+vec2(.015,.0075)+aTile)/vec2(${COIN_COLS}.,${COIN_ROWS}.);`);};cm.customProgramCacheKey=()=>'city-coins-atlas';
  coins=new THREE.InstancedMesh(cg,cm,MAX_COINS*4);coins.count=0;coins.name='coins';root.add(coins);
 }
 // Night beacons on launching-soon buildings: camera-facing additive glows that pulse (one instanced mesh, night only).
 // Size in world units, never under ~16 px so the overview still shows them (uPx = screen px per world unit).
 const beaconTime={value:0},beaconPx={value:20},beacons=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.ShaderMaterial({uniforms:{uTime:beaconTime,uPx:beaconPx},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`uniform float uTime,uPx;varying vec2 vUv;varying float vK;void main(){vUv=uv;float ph=instanceMatrix[3].x*.73+instanceMatrix[3].z*.41;vK=.5+.5*sin(uTime*3.4+ph);
 vec4 mv=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);mv.xy+=position.xy*max(1.6+.8*vK,(16.+8.*vK)/max(uPx,.01));mv.z+=1.5;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`varying vec2 vUv;varying float vK;void main(){float d=length(vUv-.5)*2.;if(d>1.)discard;float core=1.-smoothstep(.0,.28,d),halo=pow(1.-d,2.);
 gl_FragColor=vec4(vec3(1.,.5,.16)*(core*1.6+halo*(.35+.65*vK)),1.);}`}),MAX_COINS);
 beacons.count=0;beacons.frustumCulled=false;beacons.visible=false;beacons.name='beacons';root.add(beacons);
 // Spotlight cones: apex on the roof, swept by the vertex shader; night only.
 const coneGeo=new THREE.ConeGeometry(1.9,16,14,1,true);coneGeo.rotateX(Math.PI);coneGeo.translate(0,8,0);
 const coneTime={value:0},cones=new THREE.InstancedMesh(coneGeo,new THREE.ShaderMaterial({uniforms:{uTime:coneTime},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  vertexShader:`uniform float uTime;varying float vT;void main(){vec3 p=position;vT=p.y/16.;float ph=instanceMatrix[3].x*.37+instanceMatrix[3].z*.21,yaw=uTime*.35+ph,tilt=.45+.12*sin(uTime*.5+ph);
 float c=cos(tilt),s=sin(tilt);p=vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);c=cos(yaw);s=sin(yaw);p=vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);
 gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1.);}`,
  fragmentShader:`varying float vT;void main(){gl_FragColor=vec4(1.,.93,.75,(1.-vT)*(.25+.75*(1.-vT))*.55);}`}),MAX_OPEN);
 cones.count=0;cones.frustumCulled=false;cones.visible=false;root.add(cones);
 let night=false,decorKey='',buildings=[];const tileOf=new Map();
 // Quality hook (quality.js via main.js): how many of the 6 firework slots may burst at once (fewer points drawn).
 const FW_PER=fw.points.geometry.attributes.position.count/fw.slots;let fwSlots=fw.slots;
 function setQuality({fireworks=fw.slots}={}){fwSlots=Math.max(1,Math.min(fw.slots,fireworks|0));fw.points.geometry.setDrawRange(0,fwSlots*FW_PER);}
 function decorate(next,events){
  buildings=Array.isArray(next)?next:[];const d=decorations(buildings,events),items=decorItems(d,buildings),coin=coinPlan(buildings);
  drawCheers();
  const key=JSON.stringify([items,coin]);if(key===decorKey)return;decorKey=key;
  items.boxes.push(...coin.boxes);items.boxes.length=Math.min(items.boxes.length,decorBoxes.instanceMatrix.count);
  coin.beacons.forEach((b,i)=>{m4.compose(v3.set(b.x,b.y,b.z),q.identity(),s3.setScalar(1));beacons.setMatrixAt(i,m4);});beacons.count=coin.beacons.length;beacons.instanceMatrix.needsUpdate=true;beacons.visible=night&&beacons.count>0;
  drawCoins(coin);
  items.boxes.forEach((b,i)=>{m4.compose(v3.set(b.x,b.y,b.z),q.identity(),s3.set(b.w,b.h,b.d));decorBoxes.setMatrixAt(i,m4);decorBoxes.setColorAt(i,color.set(b.color));});
  decorBoxes.count=items.boxes.length;decorBoxes.instanceMatrix.needsUpdate=true;if(decorBoxes.instanceColor)decorBoxes.instanceColor.needsUpdate=true;decorBoxes.computeBoundingSphere();
  items.cones.forEach((c,i)=>{m4.makeTranslation(c.x,c.y,c.z);cones.setMatrixAt(i,m4);});cones.count=items.cones.length;cones.instanceMatrix.needsUpdate=true;cones.visible=night&&cones.count>0;
  if(!signs)return;
  // Tiles are cached by sign text; only texts new to the atlas are drawn.
  const texts=[...new Set(d.open.map(b=>signText(b.ticker,b.name)))];for(const t of [...tileOf.keys()])if(!texts.includes(t))tileOf.delete(t);
  let dirty=false;
  for(const t of texts)if(!tileOf.has(t)){const used=new Set(tileOf.values());let i=0;while(used.has(i))i++;tileOf.set(t,i);drawTile(ctx,1+2*i,'neon',t);drawTile(ctx,2+2*i,'graffiti',t);dirty=true;}
  if(dirty)atlas.needsUpdate=true;
  const attr=signs.geometry.getAttribute('aTile'),list=items.signs.slice(0,signs.instanceMatrix.count);
  list.forEach((s,i)=>{const t=1+2*tileOf.get(s.text)+(s.kind==='graffiti'?1:0);attr.setXY(i,...tileUV(t));
   m4.compose(v3.set(s.x,s.y,s.z),q.setFromEuler(e3.set(0,s.ry,0)),s3.set(s.w,s.h,1));signs.setMatrixAt(i,m4);});
  signs.count=list.length;attr.needsUpdate=true;signs.instanceMatrix.needsUpdate=true;signs.computeBoundingSphere();
 }
 // Coin tiles keep their slot while in use; new or changed cards are drawn, logos redraw their tile when they arrive.
 let coinTiles=new Map();
 function drawCoins(plan){
  if(!coins)return;
  const jobs=new Map();for(const c of plan.cards){jobs.set(c.key,{kind:'banner',card:c});if(c.logoKey)jobs.set(c.logoKey,{kind:'logo',card:c});}
  const {map,fresh}=allocTiles(coinTiles,[...jobs.keys()]);coinTiles=map;
  for(const k of fresh){const j=jobs.get(k),tile=map.get(k);
   drawCoinTile(coinCtx,tile,j.kind,j.card,j.kind==='logo'?logoImage(j.card.logo,()=>{if(coinTiles.get(k)!==tile)return;const img=logoImage(j.card.logo);if(img){drawCoinTile(coinCtx,tile,'logo',j.card,img);coinAtlas.needsUpdate=true;}}):null);}
  if(fresh.length)coinAtlas.needsUpdate=true;
  const attr=coins.geometry.getAttribute('aTile');let n=0;
  for(const p of plan.planes){const t=map.get(p.key);if(t===undefined||n>=coins.instanceMatrix.count)continue;attr.setXY(n,...coinUV(t));
   m4.compose(v3.set(p.x,p.y,p.z),q.setFromEuler(e3.set(0,p.ry,0)),s3.set(p.w,p.h,1));coins.setMatrixAt(n++,m4);}
  coins.count=n;attr.needsUpdate=true;coins.instanceMatrix.needsUpdate=true;coins.computeBoundingSphere();
 }
 // Fireworks: bursts wait in a queue until one of the 6 slots is free.
 const queue=[],lastParty=new Map();let party=null;
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
  const k=(T-party.start),fade=Math.min(1,Math.max(0,party.end-T));crowd.visible=!gpu?.active;
  if(gpu?.active){party.figs.forEach((fig,i)=>{const enter=Math.min(1,Math.max(0,(k-i*.15)/2)),e=1-(1-enter)**2,walking=enter<1;
    const jump=walking?0:Math.max(0,Math.sin(T*6.5+fig.ph))*.28,yaw=walking?Math.atan2(fig.x-fig.from.x,0):fig.yaw;
    gpu.push(fig.look,fig.from.x+(fig.x-fig.from.x)*e,.26+jump,fig.from.z+(fig.z-fig.from.z)*e,yaw,{clip:walking?'Walk':'Wave',rate:walking?1.6:1,phase:fig.ph%1,scale:fade||1e-4,bias:.7});});return;}
  party.figs.forEach((fig,i)=>{const enter=Math.min(1,Math.max(0,(k-i*.15)/2)),e=1-(1-enter)**2,x=fig.from.x+(fig.x-fig.from.x)*e,z=fig.from.z+(fig.z-fig.from.z)*e;
   const walking=enter<1,jump=walking?Math.abs(Math.sin(k*9+i))*.05:Math.max(0,Math.sin(T*6.5+fig.ph))*.28,yaw=walking?Math.atan2(fig.x-fig.from.x,0):fig.yaw;
   m4.compose(v3.set(x,.26+jump,z),q.setFromEuler(e3.set(0,yaw,0)),s3.setScalar(fade||1e-4));
   PARTS.forEach(([px,py,pz,w,h,d],j)=>{part.compose(v3.set(px,py,pz),q.identity(),s3.set(w,h,d));crowd.setMatrixAt(i*6+j,part.premultiply(m4));});
   for(const side of [-1,1]){const a=walking?.2:2.5+Math.sin(T*9+fig.ph+side)*.35;
    part.compose(v3.set(side*(.34+Math.sin(a)*.26),1.15-Math.cos(a)*.26,0),q.setFromEuler(e3.set(0,0,side*a)),s3.set(.14,.52,.16));crowd.setMatrixAt(i*6+(side<0?4:5),part.premultiply(m4));}
  });
  crowd.instanceMatrix.needsUpdate=true;
 }
 // The one roaming model (a visit or explore mode, never both): the resident's rigged model plus its pet, on a street route.
 // Its box figure at home is hidden by the caller (main.js visitKey). Nothing about it is sent to the server.
 let roam=null;
 function spawn(o,mode,at,ready){
  if(roam||!at)return null;const v={...o,mode,at,state:'loading',path:null,i:1,dist:0,speed:WALK_SPEED,lift:0,run:false,done:null};roam=v;
  Promise.resolve().then(o.load).then(c=>{if(roam!==v){c.dispose();return;}v.char=c;const r=c.root;r.position.set(at.x,groundY(at.x,at.z),at.z);
   ready?.(v,c);
   if(o.pet?.kind)try{const pet=createPet(o.pet);pet.root.position.set(at.x-.7,r.position.y,at.z-.5);pet.root.traverse(n=>{if(n.isMesh){n.castShadow=false;n.raycast=()=>{};}});scene.add(pet.root);v.pet=pet;}catch(err){console.warn('pet',err);}
   scene.add(r);o.onStart?.(r);},
   ()=>{if(roam===v)endRoam();});
  return v;
 }
 function endRoam(){const v=roam;roam=null;if(!v)return;v.char?.dispose();v.pet?.dispose();if(v.board){v.board.geometry.dispose();v.board.material.dispose();}v.onEnd?.();}
 // One step along v.path at v.speed; true once its last point is reached. Allocation-free.
 function walk(v,dt){
  const r=v.char.root;if(v.i>=v.path.length)return true;
  const t=v.path[v.i],dx=t.x-r.position.x,dz=t.z-r.position.z,dist=Math.hypot(dx,dz),step=dt*v.speed;
  if(dist<=step){r.position.x=t.x;r.position.z=t.z;v.dist+=dist;}
  else{r.position.x+=dx/dist*step;r.position.z+=dz/dist*step;v.dist+=step;r.rotation.y=Math.atan2(dx,dz);}
  r.position.y=groundY(r.position.x,r.position.z)+v.lift;
  if(dist<=step&&++v.i>=v.path.length)return true;
  if(!v.emote){if(v.run)v.char.play('Run');else{v.char.play('Walk');v.char.stride?.(v.dist/STRIDE%1);}}
  return false;
 }
 const routeLength=p=>p.reduce((s,q,i)=>i?s+Math.hypot(q.x-p[i-1].x,q.z-p[i-1].z):0,0);
 function startVisit(o){
  const route=visitRoute(o.from,o.to);if(!route||roam)return false;
  return !!spawn(o,'visit',route[0],(v,c)=>{const r=c.root;
   // Prefer the rig's own skate emote (board + lean, characters.js); otherwise a plain box board and the Run clip.
   if(o.skate&&!(v.emote=typeof c.emote==='function'&&c.emote('skate')===true)){v.board=new THREE.Mesh(new THREE.BoxGeometry(.34,.06,.95),toon({color:'#fb752b'}));v.board.position.y=-.06;r.add(v.board);v.lift=.12;}
   Object.assign(v,{state:'go',route,path:route,i:1,dist:0,run:!!o.skate,speed:(routeLength(route)>30?3:WALK_SPEED)*(o.skate?2:1)});});
 }
 function stepVisit(v,dt,T){
  const c=v.char;
  if(v.state==='stay'){if(T>v.waveAt){c.play('Wave');v.waveAt=Infinity;}if(T>v.until){v.state='back';v.path=[...v.route].reverse();v.i=1;if(v.emote)c.emote('skate');}return;}
  if(!walk(v,dt))return;
  if(v.state==='back'){endRoam();return;}
  v.state='stay';v.until=T+20;v.waveAt=T+10;c.root.rotation.y=Math.PI/2;if(v.emote)c.stopEmote?.();c.play('Idle');c.play('Wave');v.onArrive?.();
 }
 // Explore mode: the explore.js brain drives the model through this handle (one object per outing, no per-frame garbage).
 function startExplore(o){
  const v=spawn(o,'explore',o.at);if(!v)return null;const ch=()=>roam===v&&v.char;
  return v.handle={get x(){return v.char?v.char.root.position.x:v.at.x;},get z(){return v.char?v.char.root.position.z:v.at.z;},get root(){return v.char?.root||null;},get moving(){return !!v.path;},
   go(path,{run=false,done=null}={}){if(roam!==v)return;v.path=path;v.i=1;v.dist=0;v.run=run;v.done=done;v.speed=run?RUN_SPEED:routeLength(path)>30?3:WALK_SPEED;},
   halt(){v.path=v.done=null;if(ch())v.char.play('Idle');},face(yaw){if(ch())v.char.root.rotation.y=yaw;},play(name){if(ch())v.char.play(name);},
   emote(name){return !!ch()&&typeof v.char.emote==='function'&&v.char.emote(name)===true;},stopEmote(){if(ch())v.char.stopEmote?.();}};
 }
 function stepExplore(v,dt){if(!v.path||!walk(v,dt))return;v.path=null;v.char.play('Idle');const d=v.done;v.done=null;d?.();}
 function stepRoam(dt,T){
  const v=roam;if(!v.char)return;v.char.update(dt);
  if(v.mode==='visit')stepVisit(v,dt,T);else stepExplore(v,dt);
  // The pet trails 0.9 behind and stops when its owner stops (accessories.js petFollow).
  if(roam===v&&v.pet){const st=petFollow(v.pet.root,v.char.root,dt,{distance:.9,speed:v.speed*1.25});v.pet.update(dt,st);}
 }
 // dt in seconds; pxPerUnit = screen pixels per world unit (orthographic), so particle sizes follow zoom.
 function update(dt,pxPerUnit=20){
  const T=clock();
  if(fw.points.visible||queue.length){
   const b=fw.uniforms.uBurst.value;
   for(let i=queue.length-1;i>=0;i--){if(queue[i].at-T>RISE_S)continue;const s=b.findIndex((x,j)=>j<fwSlots&&T>x.w+BURST_S);if(s<0)break;const e=queue.splice(i,1)[0];b[s].set(e.x,e.y,e.z,e.at);fw.uniforms.uColor.value[s].set(e.color);}
   fw.points.visible=queue.length>0||b.some(x=>T<x.w+BURST_S);
  }
  if(cf.points.visible)cf.points.visible=cf.uniforms.uShower.value.some(s=>T<s.w+SHOWER_S+2.5);
  fw.uniforms.uTime.value=cf.uniforms.uTime.value=T;fw.uniforms.uScale.value=cf.uniforms.uScale.value=beaconPx.value=pxPerUnit;coneTime.value=beaconTime.value=reducedMotion?0:T;
  if(party){if(T>party.end){party=null;crowd.visible=false;crowd.count=0;}else drawParty(T);}
  if(roam)stepRoam(dt,T);
  stepBuffs(T);
 }
 // ---------- Omikuji buffs and ema cheers (rituals.js via main.js; cosmetic, nothing of value) ----------
 // Buffs: a faint additive halo on a resident's figure (glow), with petals or confetti dots orbiting it. Yours is a
 // little larger and rides with your roaming model while it is out. One instanced camera-facing quad, one draw call.
 // Owner 2026-10-10: the glow was reading as a floodlight when zoomed in; it is now small (≤ 1.6 units) and dim.
 const BUFF_MAX=64,buffAttr=new THREE.InstancedBufferAttribute(new Float32Array(BUFF_MAX*2),2),buffGeo=new THREE.PlaneGeometry(1,1);buffGeo.setAttribute('aBuff',buffAttr);
 // No depth test: half the residents stand on the street side the camera does not see; the aura shows through the block.
 const buffTime={value:0},buffs=new THREE.InstancedMesh(buffGeo,new THREE.ShaderMaterial({uniforms:{uTime:buffTime,uPx:beaconPx},transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,
  vertexShader:`uniform float uPx;attribute vec2 aBuff;varying vec2 vUv;varying float vKind;void main(){vUv=uv;vKind=aBuff.x;
 vec4 mv=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);mv.xy+=position.xy*aBuff.y*max(1.3,12./max(uPx,.01));mv.z+=1.2;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform float uTime;varying vec2 vUv;varying float vKind;void main(){vec2 p=(vUv-.5)*2.;float d=length(p);if(d>1.)discard;
 vec3 col=vKind<.5?vec3(1.,.78,.42):vKind<1.5?vec3(1.,.62,.78):vec3(.62,.85,1.);float halo=pow(1.-d,2.5)*(vKind<.5?.2:.3),dots=0.;
 if(vKind>.5){float n=7.,s=6.2831/n,a=atan(p.y,p.x)+uTime*(vKind<1.5?.6:1.3),k=floor(a/s),aa=mod(a,s)-s*.5,r=.64+.08*sin(uTime*2.+k);
  dots=smoothstep(.14,.05,length(vec2(cos(aa),sin(aa))*d-vec2(r,0.)));if(vKind>1.5)col=mix(col,.5+.5*cos(6.2831*(k/n+vec3(0.,.33,.67))),dots);}
 gl_FragColor=vec4(col*(halo+dots*.9),1.);}`}),BUFF_MAX);
 buffs.count=0;buffs.frustumCulled=false;buffs.renderOrder=4;buffs.name='buffs';root.add(buffs);let buffList=[],mineBuff=-1;
 const BUFF_CODE={glow:0,petals:1,confetti:2};
 function setBuffs(list){buffList=(Array.isArray(list)?list:[]).filter(b=>b&&BUFF_CODE[b.kind]!==undefined&&Number.isFinite(b.x)&&Number.isFinite(b.z)).slice(0,BUFF_MAX);mineBuff=buffList.findIndex(b=>b.mine);
  buffList.forEach((b,i)=>{m4.makeTranslation(b.x,1.05,b.z);buffs.setMatrixAt(i,m4);buffAttr.setXY(i,BUFF_CODE[b.kind],b.mine?1.25:1);});
  buffs.count=buffList.length;buffs.instanceMatrix.needsUpdate=true;buffAttr.needsUpdate=true;}
 // Cheers: a small paper tag "応援 ♥ N" above each thinking site with cheers (one atlas of 8 tiles, one draw call).
 const CH_W=256,CH_H=96,CH_N=8,cheerAttr=new THREE.InstancedBufferAttribute(new Float32Array(CH_N),1),cheerGeo=new THREE.PlaneGeometry(1,1);cheerGeo.setAttribute('aTile',cheerAttr);
 let cheerCtx=null,cheerTex=null,cheerKey='',cheerData=[];
 if(typeof document!=='undefined'){const c=document.createElement('canvas');c.width=CH_W;c.height=CH_H*CH_N;cheerCtx=c.getContext('2d');cheerTex=new THREE.CanvasTexture(c);}   // raw sRGB in, raw out: the shader writes the canvas colours as they are
 const cheers=new THREE.InstancedMesh(cheerGeo,new THREE.ShaderMaterial({uniforms:{uMap:{value:cheerTex},uPx:beaconPx},transparent:true,depthWrite:false,
  vertexShader:`uniform float uPx;attribute float aTile;varying vec2 vUv;void main(){vUv=vec2(uv.x,(uv.y+${CH_N-1}.-aTile)/${CH_N}.);
 vec4 mv=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);float k=max(1.,34./max(uPx*2.6,.01));mv.xy+=position.xy*vec2(2.6,.975)*k;mv.z+=1.;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform sampler2D uMap;varying vec2 vUv;void main(){vec4 c=texture2D(uMap,vUv);if(c.a<.05)discard;gl_FragColor=c;}`}),CH_N);
 cheers.count=0;cheers.frustumCulled=false;cheers.name='cheers';root.add(cheers);
 function drawCheers(){
  const list=cheerData.map(c=>({...c,b:buildings.find(b=>b.plotId===c.plotId&&b.type==='project'&&b.phase==='thinking')})).filter(c=>c.b&&c.cheers>0).slice(0,CH_N);
  const key=JSON.stringify(list.map(c=>[c.plotId,c.cheers]));if(key===cheerKey)return;cheerKey=key;let n=0;
  for(const c of list){const s=siteOf(c.b,buildings);if(!s)continue;
   if(cheerCtx){const g=cheerCtx,y=n*CH_H;g.clearRect(0,y,CH_W,CH_H);g.fillStyle='#F4EFE6';rrect(g,4,y+8,CH_W-8,CH_H-16,18);g.fill();g.fillStyle='#FB752B';g.fillRect(4,y+CH_H-22,CH_W-8,6);
    g.fillStyle='#1B1A17';g.textBaseline='middle';g.textAlign='left';g.font='700 30px "Hiragino Sans","Noto Sans JP",sans-serif';g.fillText('応援',20,y+CH_H/2-3);
    g.textAlign='right';g.font='800 38px Archivo, "Arial Black", sans-serif';g.fillStyle='#E85F17';g.fillText(`♥ ${c.cheers>999?'999+':c.cheers}`,CH_W-20,y+CH_H/2-2);}
   m4.makeTranslation(s.lot.x,s.top+4.9,s.lot.z);cheers.setMatrixAt(n,m4);cheerAttr.setX(n,n);n++;}
  cheers.count=n;cheers.instanceMatrix.needsUpdate=true;cheerAttr.needsUpdate=true;if(cheerTex)cheerTex.needsUpdate=true;
 }
 function setCheers(list){cheerData=(Array.isArray(list)?list:[]).filter(c=>c&&c.plotId).map(c=>({plotId:c.plotId,cheers:Math.max(0,Number(c.cheers)||0)}));drawCheers();}
 // A short confetti shower at a spot (a fresh omikuji); never with reduced motion. Uses the second party slot.
 function shower(x,z){if(reducedMotion)return;cf.uniforms.uShower.value[1].set(x,3.2,z,clock()+.1);cf.points.visible=true;}
 function stepBuffs(T){buffTime.value=reducedMotion?0:T;if(mineBuff>=0&&roam?.char){const p=roam.char.root.position;m4.makeTranslation(p.x,p.y+1.05,p.z);buffs.setMatrixAt(mineBuff,m4);buffs.instanceMatrix.needsUpdate=true;}
  else if(mineBuff>=0&&buffs.userData.away){const b=buffList[mineBuff];m4.makeTranslation(b.x,1.05,b.z);buffs.setMatrixAt(mineBuff,m4);buffs.instanceMatrix.needsUpdate=true;}buffs.userData.away=mineBuff>=0&&!!roam?.char;}
 return {root,decorate,celebrate,setBuffs,setCheers,shower,update,setQuality,visit:startVisit,explore:startExplore,cancelVisit:endRoam,endRoam,
  // Additive sparks vanish on the pale day sky, so daytime fireworks blend normally.
  setNight(v){night=!!v;cones.visible=night&&cones.count>0;beacons.visible=night&&beacons.count>0;fw.points.material.blending=night?THREE.AdditiveBlending:THREE.NormalBlending;},
  get visiting(){return roam?.mode==='visit';},get roaming(){return roam?.mode||null;},get party(){return party;},get visitor(){return roam?.char?.root||null;},get pet(){return roam?.pet?.root||null;},
  stats:()=>({points:fw.points.geometry.attributes.position.count+cf.points.geometry.attributes.position.count,signs:signs?.count||0,boxes:decorBoxes.count,cones:cones.count,coins:coins?.count||0,coinTiles:coinTiles.size,beacons:beacons.count,buffs:buffs.count,cheers:cheers.count})};
}
