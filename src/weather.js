import * as THREE from 'three';
// City weather and atmosphere (art direction wave 3B). Not real Tokyo weather: "auto" is a schedule hashed from the clock
// hour, so every visitor sees the same sky at the same time. Everything is drawn by at most three GPU-only meshes
// (precipitation, rain splashes, wet-street reflections), each hidden (0 draw calls) when it has nothing to show.
export const STATES=['clear','rain','storm','sakura','snow'];
export const MODES=[...STATES,'auto'];
export const nextMode=m=>MODES[(MODES.indexOf(m)+1)%MODES.length];
// Time share of each state in auto (clear ≥ 60%).
export const WEIGHTS={clear:.64,rain:.14,storm:.05,sakura:.1,snow:.07};
const hash=(...v)=>{let h=2166136261;for(const x of v){h=Math.imul(h^(x|0),16777619);h^=h>>>13;}h=Math.imul(h,1540483477);h^=h>>>15;return (h>>>0)/4294967296;};
const pick=r=>{let a=0;for(const s of STATES){a+=WEIGHTS[s];if(r<a)return s;}return 'clear';};
const MIN=6e4,HOUR=36e5;
// Slots of 4–8 minutes from the top of each hour (a tail under 4 minutes joins the last slot): {state,from,until}.
export function weatherAt(ms){
 const hour=Math.floor(ms/HOUR),end=(hour+1)*HOUR;let t=hour*HOUR;
 for(let k=0;;k++){let until=t+(4+4*hash(hour,k,1))*MIN;if(end-until<4*MIN)until=end;
  if(ms<until)return {state:pick(hash(hour,k,2)),from:t,until,slot:k};t=until;}
}
// Target levels per state (0–1). overcast drives sun, fog and sky; wet the streets; cover the snow on up-facing faces.
export const LEVELS={
 clear:{rain:0,storm:0,petals:0,snow:0,wet:0,cover:0,overcast:0,wind:1},
 rain:{rain:.8,storm:0,petals:0,snow:0,wet:1,cover:0,overcast:.85,wind:1.4},
 storm:{rain:1,storm:1,petals:0,snow:0,wet:1,cover:0,overcast:1,wind:3.2},
 sakura:{rain:0,storm:0,petals:1,snow:0,wet:0,cover:0,overcast:0,wind:3.4},
 snow:{rain:0,storm:0,petals:0,snow:.8,wet:0,cover:.85,overcast:.45,wind:1.1}};
// Seconds to close ~63% of the gap: streets get wet in ~20 s and dry over a minute; snow settles slowly.
const TAU={rain:3,storm:3,petals:3,snow:3,wet:[20,60],cover:[30,60],overcast:6,wind:8};
export function approach(levels,target,dt,fast=1){
 for(const k in target){const tau=TAU[k],t=Array.isArray(tau)?tau[target[k]>levels[k]?0:1]:tau;levels[k]+=(target[k]-levels[k])*Math.min(1,dt*fast/t);}
 return levels;
}
// Fog distance and light multipliers for the current levels (main.js applies them on top of day/dusk/night).
export function atmosphere(l){return {fogNear:1-.9*l.overcast,fogFar:1-.6*l.overcast-.15*l.snow,sun:1-.75*l.overcast,fill:1-.5*l.overcast,shadow:1-.92*l.overcast,hemi:1+.15*l.overcast};}
// The global wind: slowly turning, deterministic in time; strength scaled per state.
export function wind(seconds,strength=1){const a=.9+.6*Math.sin(seconds/90)+.3*Math.sin(seconds/37),s=(1.1+.6*Math.sin(seconds/53))*strength;return [Math.cos(a)*s,Math.sin(a)*s];}

// Tokyo clock (UTC+9) from the real date: sunrise/sunset from the solar declination and equation of time at 35.68° N,
// 139.69° E; night blends 0→1 over 40 min either side of sunset (and back at sunrise). Approximate to a few minutes.
export function tokyoClock(ms){
 const d=new Date(ms+9*HOUR),h=d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600;
 const doy=(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(d.getUTCFullYear(),0,0))/864e5;
 const rad=Math.PI/180,decl=23.44*rad*Math.sin(2*Math.PI*(284+doy)/365),lat=35.68*rad,B=2*Math.PI*(doy-81)/364;
 const eot=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B),noon=12-(139.69-135)/15-eot/60;
 const half=Math.acos(Math.min(1,Math.max(-1,(Math.sin(-.833*rad)-Math.sin(lat)*Math.sin(decl))/(Math.cos(lat)*Math.cos(decl)))))/rad/15;
 const rise=noon-half,set=noon+half,blend=40/60,ss=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
 const night=h<noon?1-ss(rise-blend,rise+blend,h):ss(set-blend,set+blend,h);
 const phase=Math.abs(h-rise)<blend?'dawn':Math.abs(h-set)<blend?'dusk':night>.5?'night':'day';
 const pad=v=>String(v).padStart(2,'0');
 return {hours:h,label:`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,phase,night,sunrise:rise,sunset:set};
}

// Sky gradient stops (top, 80%, horizon): clear day/dusk/night (brief 3.9) and their overcast versions.
const SKY={day:['#C9D8E2','#EAE3D8','#EFE6D6'],dusk:['#46507E','#D49A86','#F4B77E'],night:['#0D1726','#2A3550','#4A3F57'],
 gday:['#A3ACB5','#C0C3C3','#CCCBC5'],gdusk:['#575B72','#9A8C8D','#B39B8C'],gnight:['#121925','#242D3E','#31344A']};
const _a=new THREE.Color(),_b=new THREE.Color(),_c=new THREE.Color(),_d=new THREE.Color();
// n: 0 day … .5 dusk … 1 night. Mixes hex colours along day → dusk → night.
export function phaseMix(n,day,dusk,nightHex,out=new THREE.Color()){return n<.5?out.set(day).lerp(_d.set(dusk),n*2):out.set(dusk).lerp(_d.set(nightHex),n*2-1);}
export function skyGradient(n,overcast=0,flash=0){
 const stops=[0,1,2].map(i=>{phaseMix(n,SKY.day[i],SKY.dusk[i],SKY.night[i],_a);phaseMix(n,SKY.gday[i],SKY.gdusk[i],SKY.gnight[i],_b);_a.lerp(_b,overcast);
  if(flash)_a.lerp(_c.set('#E4E2F4'),Math.min(1,flash)*.85);return '#'+_a.getHexString();});
 return `linear-gradient(${stops[0]},${stops[1]} 80%,${stops[2]})`;
}

// Per-particle seeds (x, phase, z, size/shade), all in [0,1).
export function particleSeeds(n,seed=1){const a=new Float32Array(n*4);let s=seed>>>0;
 const r=()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 for(let i=0;i<a.length;i++)a[i]=r();return a;}

const WRAP=`uniform float uTime,uSpan,uPx;uniform vec3 uCenter;
vec2 wrapXZ(vec2 p){return uCenter.xz+mod(p-uCenter.xz+uSpan*.5,uSpan)-uSpan*.5;}`;
// Rain streaks (mode 0), snow flakes (1), sakura petals (2): one instanced quad per particle, placed by the vertex shader
// from its seed and the time, wrapped around the camera target in a box tied to the view width (world-anchored, so
// panning never drags the rain). Rain is a streak along its velocity, ~26 px long; flakes and petals are billboards.
const PRECIP_V=`attribute vec4 aSeed;uniform float uHeight,uFall,uMode,uLen;uniform vec2 uWind;varying vec2 vUv;varying float vShade;
${WRAP}
void main(){
 float rain=step(uMode,.5),petal=step(1.5,uMode),fall=uFall*(rain>.5?1.:mix(.06,.1,aSeed.w)),life=uHeight/fall;
 float t=uTime+aSeed.y*life,age=mod(t,life),cyc=floor(t/life);
 vec2 base=fract(aSeed.xz+cyc*vec2(.6180339,.4142136))*uSpan;
 vec2 flutter=(1.-rain)*vec2(sin(t*1.7+aSeed.x*40.),cos(t*1.3+aSeed.z*40.))*(.5+petal*.9);
 vec2 xz=wrapXZ(base+uWind*age+flutter);vec3 p=vec3(xz.x,uHeight-age*fall,xz.y);
 vec4 mv=viewMatrix*vec4(p,1.);vec2 q=position.xy;vUv=q+vec2(.5,0.);vShade=aSeed.w;
 if(rain>.5){vec4 tail=viewMatrix*vec4(p-normalize(vec3(uWind.x,-fall,uWind.y))*(uLen/uPx),1.);vec2 d=tail.xy-mv.xy;
  mv.x+=q.x*(1.6/uPx);mv.xy+=d*q.y;}   // streaks stay near-vertical on screen: widen along screen x
 else{float a=t*(1.+aSeed.x*2.)+aSeed.z*6.28,sz=clamp((petal>.5?.26:.17)*(.7+.6*aSeed.w)*uPx,2.,petal>.5?11.:8.)/uPx;
  vec2 c=q-vec2(0.,.5);if(petal>.5)c.x*=mix(.3,1.,abs(cos(t*3.+aSeed.y*9.)));mv.xy+=mat2(cos(a),sin(a),-sin(a),cos(a))*c*sz;}
 gl_Position=projectionMatrix*mv;
}`;
const PRECIP_F=`uniform float uMode,uAlpha;uniform vec3 uColor;varying vec2 vUv;varying float vShade;
void main(){float a;vec3 col=uColor;
 if(uMode<.5)a=(1.-abs(vUv.x*2.-1.))*(1.-smoothstep(.2,1.,vUv.y))*smoothstep(0.,.08,vUv.y);
 else{vec2 c=vUv*2.-1.;a=(1.-smoothstep(.3,1.,dot(c,c)));if(uMode>1.5)col=mix(vec3(.84,.5,.6),vec3(.96,.8,.85),vShade);}
 if(a<.01)discard;gl_FragColor=vec4(col,a*uAlpha*(.6+.4*vShade));
 #include <colorspace_fragment>
}`;
// Splashes: tiny rings on the ground that grow and fade, re-seeded each cycle.
const SPLASH_V=`attribute vec4 aSeed;varying vec2 vUv;varying float vPh;
${WRAP}
void main(){float period=.45+aSeed.w*.4,t=uTime/period+aSeed.y,ph=fract(t),cyc=floor(t);
 vec2 xz=wrapXZ(fract(aSeed.xz+cyc*vec2(.6180339,.4142136))*uSpan);float r=mix(.15,1.,ph)*max(.16,6./uPx);
 vUv=position.xy*2.;vPh=ph;gl_Position=projectionMatrix*viewMatrix*vec4(xz.x+position.x*2.*r,.27,xz.y+position.y*2.*r,1.);}`;
const SPLASH_F=`uniform float uAlpha;uniform vec3 uColor;varying vec2 vUv;varying float vPh;
void main(){float d=length(vUv),a=smoothstep(.62,.86,d)*(1.-smoothstep(.88,1.,d))*(1.-vPh)+(1.-smoothstep(0.,.35,d))*step(vPh,.12);
 if(a<.01)discard;gl_FragColor=vec4(uColor,a*uAlpha);
 #include <colorspace_fragment>
}`;
// Wet-street reflections at night: under each ground light pool, a soft halo plus a rippling streak stretched toward the
// camera (where a mirrored lamp would appear on wet asphalt). Additive, one instanced quad per pool.
const REFL_V=`attribute vec4 aPool;attribute vec3 aCol;uniform vec2 uToward;varying vec2 vUv;varying vec3 vCol;
void main(){vec2 f=uToward,s=f.yx*vec2(-1.,1.);float r=aPool.z,along=mix(-.7,2.6,position.y)*r;
 vec2 xz=aPool.xy+f*along+s*position.x*1.5*r;vUv=vec2(position.x*1.5,along/r);vCol=aCol;
 gl_Position=projectionMatrix*viewMatrix*vec4(xz.x,.25,xz.y,1.);}`;
const REFL_F=`uniform float uTime,uAmount;varying vec2 vUv;varying vec3 vCol;
void main(){vec2 h=vec2(vUv.x*1.2,vUv.y);float halo=exp(-dot(h,h)*1.8)*.32;
 float streak=exp(-vUv.x*vUv.x*22.)*(1.-smoothstep(.4,2.6,vUv.y))*smoothstep(-.5,.15,vUv.y)*(.65+.35*sin(vUv.y*10.-uTime*4.+vUv.x*4.));
 gl_FragColor=vec4(vCol*(halo+streak*.85)*uAmount,1.);
 #include <colorspace_fragment>
}`;
function quad(xz){const g=new THREE.InstancedBufferGeometry(),p=xz?[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0]:[-.5,0,0,.5,0,0,.5,1,0,-.5,1,0];
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex([0,1,2,0,2,3]);g.instanceCount=0;return g;}
function mesh(geo,material,name){const m=new THREE.Mesh(geo,material);m.name=name;m.frustumCulled=false;m.visible=false;m.raycast=()=>{};m.renderOrder=2;return m;}

// scene: the city scene. Returns {precip,splash,refl,update(view),levels}.
export function createWeather(scene,{mobile=false}={}){
 const N=mobile?1600:4000,NS=mobile?260:640,shared={uTime:{value:0},uSpan:{value:60},uPx:{value:10},uCenter:{value:new THREE.Vector3()}};
 const pGeo=quad(false);pGeo.setAttribute('aSeed',new THREE.InstancedBufferAttribute(particleSeeds(N,7),4));
 const pU={...shared,uHeight:{value:20},uFall:{value:22},uMode:{value:0},uWind:{value:new THREE.Vector2()},uColor:{value:new THREE.Color()},uAlpha:{value:.3},uLen:{value:30}};
 const precip=mesh(pGeo,new THREE.ShaderMaterial({uniforms:pU,vertexShader:PRECIP_V,fragmentShader:PRECIP_F,transparent:true,depthWrite:false}),'weather particles');
 const sGeo=quad(true);sGeo.setAttribute('aSeed',new THREE.InstancedBufferAttribute(particleSeeds(NS,11),4));
 const sU={...shared,uColor:{value:new THREE.Color('#DDE6EE')},uAlpha:{value:.4}};
 const splash=mesh(sGeo,new THREE.ShaderMaterial({uniforms:sU,vertexShader:SPLASH_V,fragmentShader:SPLASH_F,transparent:true,depthWrite:false}),'rain splashes');
 const rGeo=quad(false),RMAX=700,rPool=new THREE.InstancedBufferAttribute(new Float32Array(RMAX*4),4),rCol=new THREE.InstancedBufferAttribute(new Float32Array(RMAX*3),3);
 rGeo.setAttribute('aPool',rPool);rGeo.setAttribute('aCol',rCol);
 const rU={uTime:shared.uTime,uAmount:{value:0},uToward:{value:new THREE.Vector2(0,1)}};
 const refl=mesh(rGeo,new THREE.ShaderMaterial({uniforms:rU,vertexShader:REFL_V,fragmentShader:REFL_F,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),'wet reflections');
 scene.add(precip,splash,refl);
 // Reflections copy the ground light pools of city-street.js (found by name; ground ones only), refreshed when they change.
 let pools=null,poolSig='',poolAt=-1e9;
 function readPools(now){
  if(now-poolAt<2500)return;poolAt=now;pools||=scene.getObjectByName('light pools');if(!pools)return;
  const sig=pools.count+':'+(pools.instanceMatrix.version??0);if(sig===poolSig)return;poolSig=sig;
  const m=pools.instanceMatrix.array,c=pools.instanceColor?.array;let k=0;
  for(let i=0;i<pools.count&&k<RMAX;i++){const o=i*16,y=m[o+13],r=m[o]/2;if(y>1||r<1)continue;
   rPool.array.set([m[o+12],m[o+14],r*.9,0],k*4);rCol.array.set(c?[c[i*3],c[i*3+1],c[i*3+2]]:[1,.7,.4],k*3);k++;}
  rGeo.instanceCount=k;rPool.needsUpdate=rCol.needsUpdate=true;
 }
 const toward=new THREE.Vector3();
 // view: {seconds, now, camera, target, px (drawing px per unit), levels, night (0–1), wind:[x,z]}
 function update({seconds,now,camera,target,px,levels:l,night,wind:w}){
  const z=camera.zoom,halfW=(camera.right-camera.left)/z/2,halfH=(camera.top-camera.bottom)/z/2;
  const span=Math.min(Math.max(halfW,halfH/.64)*2.3,420),height=THREE.MathUtils.clamp(span*.3,10,70);
  shared.uTime.value=seconds%900;shared.uPx.value=Math.max(px,.5);shared.uCenter.value.copy(target);shared.uSpan.value=span;
  const mode=l.rain>.02?0:l.snow>.02?1:l.petals>.02?2:-1,amount=mode===0?l.rain:mode===1?l.snow/.8:mode===2?l.petals:0;
  precip.visible=mode>=0&&amount>.01;
  if(precip.visible){pGeo.instanceCount=Math.ceil(N*Math.min(1,amount)*(mode===2?.75:1));pU.uMode.value=mode;pU.uHeight.value=height;
   pU.uFall.value=Math.max(20,height*1.3);pU.uWind.value.set(w[0],w[1]);
   if(mode===0){pU.uColor.value.set(night>.5?'#B4C6E6':'#F4F7FA');pU.uAlpha.value=(night>.5?.62:.58)*(.85+.15*l.storm);pU.uLen.value=30+14*l.storm;}
   else if(mode===1){pU.uColor.value.set(night>.5?'#C8D4EA':'#FFFFFF');pU.uAlpha.value=.9;}else pU.uAlpha.value=.95;}
  // Splashes only near the camera, where a ring is a few pixels wide.
  splash.visible=l.rain>.05&&px>5;if(splash.visible){sGeo.instanceCount=Math.ceil(NS*l.rain);sU.uAlpha.value=(night>.5?.5:.38)*l.rain;
   sU.uColor.value.set(night>.5?'#9FB2D4':'#E8EEF2');}
  // Reflections: wet × night (the pools themselves are only drawn at night).
  const amt=l.wet*THREE.MathUtils.smoothstep(night,.5,.9);refl.visible=amt>.02;
  if(refl.visible){readPools(now);rU.uAmount.value=amt*.85;toward.subVectors(camera.position,target);rU.uToward.value.set(toward.x,toward.z).normalize();}
  if(refl.visible&&!rGeo.instanceCount)refl.visible=false;
 }
 return {precip,splash,refl,update,get drawCalls(){return [precip,splash,refl].filter(m=>m.visible).length;}};
}

// Ambient sound: procedural Web Audio, one AudioContext made on the first tap (iOS), off by default, suspended while the
// page is hidden. Loops of noise through filters: city hum, rain, train rumble, lantern-street murmur; a crossing chirp.
export function createAmbience(){
 let ctx=null,master=null,on=false,g={};
 const Ctx=typeof window!=='undefined'?window.AudioContext||window.webkitAudioContext:null;
 function noise(brown){const n=ctx.sampleRate*2,b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);let last=0;
  for(let i=0;i<n;i++){const w=Math.random()*2-1;if(brown){last=(last+.02*w)/1.02;d[i]=last*3.5;}else d[i]=w;}return b;}
 function loop(buf,type,freq,q=.7,via=null){const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),gain=ctx.createGain();s.buffer=buf;s.loop=true;
  f.type=type;f.frequency.value=freq;f.Q.value=q;gain.gain.value=0;(via?s.connect(f).connect(via):s.connect(f)).connect(gain).connect(master);s.start(ctx.currentTime+Math.random()*.5);return gain;}
 function build(){ctx=new Ctx();master=ctx.createGain();master.gain.value=.55;master.connect(ctx.destination);
  const brown=noise(true),white=noise(false);
  g.hum=loop(brown,'lowpass',200);g.rain=loop(white,'bandpass',1900,.35);g.train=loop(brown,'lowpass',95,1.2);const wob=ctx.createGain();wob.gain.value=.6;g.murmur=loop(white,'bandpass',480,1.6,wob);
  // Chatter: the murmur wobbles with two slow oscillators before its level gain.
  for(const [hz,depth] of [[.7,.25],[1.9,.15]]){const o=ctx.createOscillator(),d=ctx.createGain();o.frequency.value=hz;d.gain.value=depth;o.connect(d).connect(wob.gain);o.start();}
  document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden)ctx.suspend();else if(on)ctx.resume();});}
 // Pedestrian signal "piyo piyo": short falling sine blips, quiet.
 function chirp(level=1){if(!on||!ctx)return;const t0=ctx.currentTime+.05;
  for(let i=0;i<6;i++){const t=t0+i*.36,o=ctx.createOscillator(),e=ctx.createGain();o.type='sine';
   o.frequency.setValueAtTime(i%2?2350:2850,t);o.frequency.exponentialRampToValueAtTime(i%2?1900:2400,t+.09);
   e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(.022*level,t+.01);e.gain.exponentialRampToValueAtTime(.0001,t+.12);o.connect(e).connect(master);o.start(t);o.stop(t+.14);}}
 const set=(node,v)=>node?.gain.setTargetAtTime(v,ctx.currentTime,.5);
 return {get on(){return on;},chirp,
  toggle(){if(!Ctx)return false;if(!ctx)build();on=!on;if(on)ctx.resume();else ctx.suspend();return on;},
  // p: {hum, rain, train, murmur} levels 0–1.
  update(p){if(!on||!ctx)return;set(g.hum,.06*p.hum);set(g.rain,.16*p.rain);set(g.train,.22*p.train);set(g.murmur,.05*p.murmur);}};
}
