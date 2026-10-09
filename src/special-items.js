import * as THREE from 'three';
import {toon} from './toon.js';
// Unlockable room pieces, all procedural (boxes, cylinders, spheres, a few planes): no assets, no post-processing.
// Budget per piece: ≤300 triangles and ≤16 draw calls; geometry and plain colours come from module caches shared by every
// room, a piece owns only what animates on its own (a screen colour, a fade) and its text texture (cached per unique text).
//   createSpecial(item, {text, accent}) -> {root, dims, update(dt), use(character) -> ms, dispose()}
// root stands on the floor at its centre and faces +z (like the Kenney kit); dims {w,h,d} is its footprint and height.
// use(character) starts the piece's own show (music, party lights, a firework) and the character's emote; the caller has
// already walked the character to the piece and pauses autonomy for the returned milliseconds.

export const SPECIAL_TIERS={skateboard:'resident',plushPile:'resident',posterCustom:'resident',neonSign:'resident',
 consoleTv:'builder',arcadeCabinet:'builder',karaokeMic:'builder',discoBall:'builder',
 turntable:'founder',aquarium:'founder',trophyIdea:'founder',trophySite:'founder',
 neonTicker:'launched',trophyLaunch:'launched',fireworksBox:'launched',goldToilet:'launched'};
export const SPECIAL_ITEMS=Object.keys(SPECIAL_TIERS);
export const TEXT_ITEMS=new Set(['posterCustom','neonTicker']),TEXT_MAX=12;
// Flat pieces that hang flush on the left or back wall (the server stores them as floor pieces: x, z, rot only).
export const HANGING=new Set(['posterCustom','neonSign','neonTicker']);
// Pieces nobody walks around: the disco ball hangs from the ceiling.
export const OVERHEAD=new Set(['discoBall']);
export const SPECIAL_DIMS={skateboard:{w:.26,h:.12,d:.82},plushPile:{w:.95,h:.6,d:.8},posterCustom:{w:.7,h:1.95,d:.05},neonSign:{w:1.05,h:1.95,d:.06},
 consoleTv:{w:1.1,h:1,d:.5},arcadeCabinet:{w:.72,h:1.86,d:.72},karaokeMic:{w:.42,h:1.55,d:.42},discoBall:{w:.5,h:2.75,d:.5},
 turntable:{w:.9,h:.95,d:.52},aquarium:{w:1.02,h:1.2,d:.45},trophyIdea:{w:.4,h:1.12,d:.4},trophySite:{w:.4,h:1.22,d:.4},
 neonTicker:{w:1.45,h:2.2,d:.08},trophyLaunch:{w:.4,h:1.25,d:.4},fireworksBox:{w:.5,h:.62,d:.5},goldToilet:{w:.46,h:.86,d:.68}};
export const SPECIAL_LABELS={skateboard:'Skateboard',plushPile:'Plush pile',posterCustom:'Your poster',neonSign:'Neon sign',consoleTv:'Console & TV',
 arcadeCabinet:'Arcade cabinet',karaokeMic:'Karaoke mic',discoBall:'Disco ball',turntable:'Turntables',aquarium:'Aquarium',trophyIdea:'Idea trophy',
 trophySite:'Site trophy',neonTicker:'Ticker sign',trophyLaunch:'Launch trophy',fireworksBox:'Fireworks',goldToilet:'Gold toilet'};
// Seat heights for the pieces you sit on (the caller poses the character like on a chair).
export const SPECIAL_SEAT={goldToilet:.42,plushPile:.4};
// What the resident does with each piece: an emote (characters.js), a clip, how long, and what the bubble says.
export const SPECIAL_USE={
 consoleTv:{emote:'sit',clip:'Interact',ms:6000,say:'One more level.'},
 arcadeCabinet:{clip:'Interact',ms:5000,say:'Going for the high score.'},
 karaokeMic:{emote:'karaoke',ms:7000,say:'Singing their heart out.'},
 discoBall:{emote:'dance',ms:8000,say:'Party time!',party:true},
 turntable:{emote:'dance',ms:8000,say:'Dropping a beat.'},
 aquarium:{emote:'think',ms:4000,say:'Watching the fish.'},
 neonSign:{emote:'selfie',ms:2400,say:'Selfie with the neon.'},
 neonTicker:{emote:'selfie',ms:2400,say:'Selfie with the ticker.'},
 posterCustom:{emote:'think',ms:4000,say:'Admiring the poster.'},
 trophyIdea:{emote:'celebrate',ms:2100,say:'Polishing the trophy.'},
 trophySite:{emote:'celebrate',ms:2100,say:'The site is live!'},
 trophyLaunch:{emote:'celebrate',ms:2100,say:'Launched!'},
 skateboard:{emote:'skate',ms:9000,say:'Kickflip… almost.',glide:true},
 fireworksBox:{emote:'celebrate',ms:2100,say:'Fireworks!',burst:true},
 plushPile:{sit:true,ms:5000,say:'Sinking into the plushies.'},
 goldToilet:{sit:true,ms:5000,say:'A golden moment.'},
};
// Advertisements for the autonomy brain (needs.js ADS format).
export const SPECIAL_ADS={consoleTv:{fun:60,social:10,hours:1.5},arcadeCabinet:{fun:55,hours:1},karaokeMic:{fun:50,social:20,hours:1},discoBall:{fun:45,social:25,hours:1},
 turntable:{fun:50,hours:1},aquarium:{fun:25,comfort:10,room:5,hours:.5},plushPile:{comfort:40,fun:10,hours:1},goldToilet:{bladder:100,hygiene:15,hours:.25},
 skateboard:{fun:45,energy:-5,hours:.5},trophyIdea:{fun:15,hours:.25},trophySite:{fun:15,hours:.25},trophyLaunch:{fun:20,hours:.25}};

// ---------------------------------------------------------------- shared caches
const G={};
const geo=(k,make)=>G[k]||=make();
const BOX=()=>geo('box',()=>new THREE.BoxGeometry(1,1,1)),CYL=()=>geo('cyl',()=>new THREE.CylinderGeometry(1,1,1,8)),PLANE=()=>geo('plane',()=>new THREE.PlaneGeometry(1,1));
const BALL=()=>geo('ball',()=>new THREE.SphereGeometry(1,8,6)),BLOB=()=>geo('blob',()=>new THREE.SphereGeometry(1,6,4)),DISC=()=>geo('disc',()=>new THREE.CircleGeometry(1,12));
// The mirror ball: an icosphere whose faces get baked silver/colour shades (vertex colours), so it sparkles unlit.
const FACETS=()=>geo('facets',()=>{const g=new THREE.IcosahedronGeometry(1,1),n=g.attributes.position.count,col=new Float32Array(n*3),c=new THREE.Color();
 for(let f=0;f<n/3;f++){const r=(f*7919%97)/97;c.set(r<.12?'#ff9ad0':r<.24?'#9ae8ff':r<.32?'#fff3a8':'#ffffff').multiplyScalar(r<.32?1:.45+((f*31)%7)/12);for(let k=0;k<3;k++)col.set([c.r,c.g,c.b],(f*3+k)*3);}
 g.setAttribute('color',new THREE.BufferAttribute(col,3));return g;}),RING=()=>geo('ring',()=>new THREE.TorusGeometry(1,.25,4,8));
const TAPER=()=>geo('taper',()=>new THREE.CylinderGeometry(1,.6,1,10));
const STAR=()=>geo('star',()=>{const s=new THREE.Shape();for(let i=0;i<10;i++){const r=i%2?.45:1,a=i/10*Math.PI*2+Math.PI/2;s[i?'lineTo':'moveTo'](Math.cos(a)*r,Math.sin(a)*r);}
 const g=new THREE.ExtrudeGeometry(s,{depth:.3,bevelEnabled:false});g.translate(0,0,-.15);return g;});
const MATS=new Map();
const mat=(color,emissive=0)=>{const k=color+':'+emissive;if(!MATS.has(k))MATS.set(k,toon({color,...(emissive?{emissive:color,emissiveIntensity:emissive}:{})}));return MATS.get(k);};
const glow=color=>{const k='glow:'+color;if(!MATS.has(k))MATS.set(k,new THREE.MeshBasicMaterial({color}));return MATS.get(k);};
const hasDom=typeof document!=='undefined';
// Text textures: one canvas per unique (kind, text, accent), shared by every piece showing it, freed with the last one.
const TEX=new Map();
function textTexture(key,w,h,draw){
 if(!hasDom)return null;let e=TEX.get(key);
 if(!e){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;e={t,n:0};TEX.set(key,e);}
 e.n++;return e.t;
}
function releaseTexture(t){for(const [k,e] of TEX)if(e.t===t){if(--e.n<=0){t.dispose();TEX.delete(k);}return;}}
const clean=(t,fallback)=>{const v=String(t??'').replace(/[\u0000-\u001f<>`]/g,'').trim();return [...(v||fallback)].slice(0,TEXT_MAX).join('');};
// Neon tubes: a wide coloured glow, the tube in its colour, a thin white-hot core. copies>1 tiles the text (the ticker scrolls it).
function neonDraw(text,color,copies=1){return (g,w,h)=>{g.clearRect(0,0,w,h);const cw=w/copies;let size=Math.round(h*.66);g.font=`bold ${size}px "Trebuchet MS",system-ui,sans-serif`;
 const tw=g.measureText(text).width;if(tw>cw*.86){size=Math.floor(size*cw*.86/tw);g.font=`bold ${size}px "Trebuchet MS",system-ui,sans-serif`;}
 g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.shadowColor=color;
 for(let i=0;i<copies;i++){const x=cw*(i+.5),y=h/2;for(const [blur,lw,c] of [[h*.35,h*.11,color],[h*.15,h*.06,color]]){g.shadowBlur=blur;g.lineWidth=lw;g.strokeStyle=c;g.strokeText(text,x,y);}
  g.shadowBlur=h*.1;g.fillStyle=color;g.fillText(text,x,y);g.shadowBlur=0;g.lineWidth=Math.max(1,h*.02);g.strokeStyle='#fff6e8';g.strokeText(text,x,y);}};}
const NOTE_DRAW=(g,w,h)=>{g.fillStyle='#ffffff';g.font=`bold ${h*.9}px serif`;g.textAlign='center';g.textBaseline='middle';g.fillText('♪',w/2,h/2);};

// ---------------------------------------------------------------- pieces
const TAU=Math.PI*2,PARTY=['#ff4f8b','#4fd8ff','#ffe24f','#9cff6b','#b37bff'];
export function createSpecial(item,{text,accent='#e2583e'}={}){
 const root=new THREE.Group(),own=[],textures=[],dims=SPECIAL_DIMS[item]||{w:.5,h:.5,d:.5};root.userData.special=item;
 const add=(g,m,x,y,z,sx,sy,sz,parent=root)=>{const n=new THREE.Mesh(g,m);n.position.set(x,y,z);n.scale.set(sx,sy,sz);n.castShadow=true;n.receiveShadow=true;parent.add(n);return n;};
 const box=(m,x,y,z,w,h,d,parent)=>add(BOX(),m,x,y,z,w,h,d,parent);
 const cyl=(m,x,y,z,r,h,parent)=>add(CYL(),m,x,y,z,r,h,r,parent);
 const owned=m=>{own.push(m);return m;};
 let busy=0,t=0,tick=()=>{},start=()=>{};
 const dark=mat('#25262b'),wood=mat('#7a5236'),white=mat('#f2efe8');
 if(item==='consoleTv'){
  box(wood,0,.18,0,1.1,.36,.46);box(dark,0,.4,-.12,.18,.08,.1);box(dark,0,.69,-.13,1,.58,.07);
  const screen=owned(new THREE.MeshBasicMaterial({color:'#3a5bd9'}));const s=add(PLANE(),screen,0,.69,-.09,.92,.5,1);s.castShadow=false;
  box(mat('#f3efe4'),.3,.39,.08,.26,.05,.18);box(mat(accent),.3,.43,.08,.06,.02,.06);box(dark,-.25,.375,.12,.14,.03,.08);
  let i=0,next=0;tick=dt=>{next-=dt*(busy>0?2.5:1);if(next<=0){next=.6;i=(i+1)%PARTY.length;screen.color.set(PARTY[i]).multiplyScalar(busy>0?1:.55);}};
 }else if(item==='arcadeCabinet'){
  const body=mat(accent);box(body,0,.62,-.02,.7,1.24,.66);box(body,0,1.5,-.12,.7,.56,.46);box(dark,0,1.08,.24,.72,.08,.34).rotation.x=-.25;
  const scr=owned(new THREE.MeshBasicMaterial({color:'#6bfff0'}));const s=add(PLANE(),scr,0,1.48,.125,.56,.42,1);s.rotation.x=-.12;s.castShadow=false;
  box(glow('#ffe24f'),0,1.8,-.1,.72,.12,.5);cyl(dark,-.14,1.17,.3,.012,.1);add(BLOB(),mat('#e23b3b'),-.14,1.23,.3,.035,.035,.035);
  for(const x of [.06,.16])cyl(glow(x>.1?'#4fd8ff':'#ff4f8b'),x,1.135,.3,.025,.02);
  tick=dt=>{const k=.75+Math.sin(t*(busy>0?14:3))*.25;scr.color.setRGB(.42*k,1*k,.94*k);};
 }else if(item==='karaokeMic'){
  const metal=mat('#c9d0d6');cyl(dark,0,.02,0,.2,.04);cyl(metal,0,.72,0,.016,1.4);box(metal,0,1.42,.05,.02,.02,.12).rotation.x=.6;
  const mic=cyl(dark,0,1.47,.1,.028,.16);mic.rotation.x=.6;add(BALL(),mat('#9aa1a8'),0,1.53,.14,.05,.05,.05);
 }else if(item==='discoBall'){
  box(dark,0,2.55,0,.015,.4,.015);const mirror=MATS.get('mirror')||MATS.set('mirror',new THREE.MeshBasicMaterial({vertexColors:true})).get('mirror');
  const ball=add(FACETS(),mirror,0,2.15,0,.2,.2,.2);
  const spots=new THREE.Group();root.add(spots);const colored=PARTY.map(c=>owned(new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.3,depthWrite:false})));
  colored.forEach((m,i)=>{const a=i/PARTY.length*TAU,d=add(DISC(),m,Math.cos(a)*1.2,.015+i*.002,Math.sin(a)*1.2,.24,.24,1,spots);d.rotation.x=-Math.PI/2;d.castShadow=d.receiveShadow=false;d.raycast=()=>{};});
  tick=dt=>{const on=busy>0;ball.rotation.y+=dt*(on?1.6:.4);spots.rotation.y-=dt*(on?1.1:.25);for(let i=0;i<colored.length;i++)colored[i].opacity=on?.75+Math.sin(t*6+i)*.2:.3;};
 }else if(item==='turntable'){
  box(wood,0,.37,0,.9,.74,.5);box(dark,0,.79,0,.86,.1,.48);
  const platters=[-.2,.2].map(x=>{const p=cyl(dark,x,.85,0,.16,.02);cyl(mat(accent),x,.862,0,.05,.012,root);box(mat('#c9d0d6'),x+.13,.87,-.08,.02,.02,.18).rotation.y=.4;return p;});
  const noteMat=owned(new THREE.MeshBasicMaterial({color:'#ff6fa8',transparent:true,depthWrite:false,side:THREE.DoubleSide}));const tex=textTexture('note',32,32,NOTE_DRAW);if(tex){noteMat.map=tex;textures.push(tex);}
  const notes=[0,1,2,3].map(i=>{const n=add(PLANE(),noteMat,0,1,0,.14,.14,1);n.castShadow=n.receiveShadow=false;n.visible=false;n.raycast=()=>{};return n;});
  tick=dt=>{const on=busy>0;for(const p of platters)p.rotation.y+=dt*(on?7:0);
   notes.forEach((n,i)=>{n.visible=on;if(!on)return;const ph=(t*.45+i/4)%1;n.position.set(Math.sin(t*2+i*1.7)*.35,1+ph*.9,Math.cos(i*2.1)*.15);n.scale.setScalar(.26*Math.sin(Math.PI*ph));n.rotation.y=.7+Math.sin(t+i)*.3;});};
 }else if(item==='aquarium'){
  box(dark,0,.3,0,1,.6,.42);box(mat('#e8d6a8'),0,.63,0,.96,.05,.38);
  const glass=owned(new THREE.MeshBasicMaterial({color:'#7fd3ea',transparent:true,opacity:.28,depthWrite:false}));const g=box(glass,0,.89,0,1,.56,.42);g.castShadow=false;
  box(dark,0,1.18,0,1.02,.04,.44);for(const x of [-.3,.32])box(mat('#3f9a5a'),x,.75,-.08,.04,.2+Math.abs(x)*.2,.04);
  const fish=['#ff8a3d','#ffd84f','#4fa8ff'].map((c,i)=>box(mat(c,.15),0,.8+i*.1,(i-1)*.1,.09,.05,.025));
  tick=()=>fish.forEach((f,i)=>{const a=t*(.5+i*.15)+i*2;f.position.x=Math.sin(a)*.38;f.position.y=.8+i*.1+Math.sin(t*2+i)*.025;f.rotation.y=Math.cos(a)>0?0:Math.PI;});
 }else if(item==='neonSign'||item==='neonTicker'||item==='posterCustom'){
  const ticker=item==='neonTicker',poster=item==='posterCustom';
  const words=clean(text,ticker?'SUB01':poster?'MY IDEA':'HOME ♥');
  if(poster){box(mat(accent),0,1.45,-.005,.7,.95,.03);
   const tex=textTexture(`poster:${words}:${accent}`,192,256,(g,w,h)=>{g.fillStyle=accent;g.fillRect(0,0,w,h);g.fillStyle='#00000033';for(let i=0;i<6;i++)g.fillRect(0,h*.62+i*12,w,5);
    g.fillStyle='#fff8ec';g.textAlign='center';g.textBaseline='middle';const parts=words.split(' ');let size=Math.min(64,Math.floor(w*1.6/Math.max(...parts.map(p=>[...p].length),1)));
    g.font=`900 ${size}px system-ui,sans-serif`;parts.slice(0,3).forEach((p,i,a)=>g.fillText(p,w/2,h*.38+(i-(a.length-1)/2)*size*1.05));g.strokeStyle='#fff8ec';g.lineWidth=6;g.strokeRect(9,9,w-18,h-18);});
   const m=owned(new THREE.MeshBasicMaterial(tex?{map:tex}:{color:accent}));if(tex)textures.push(tex);add(PLANE(),m,0,1.45,.012,.62,.87,1).castShadow=false;
  }else{const y=ticker?2.05:1.7,w=ticker?1.4:1.05,h=ticker?.3:.4;box(mat('#1b1c22'),0,y,-.01,w,h,.04);
   const color=ticker?'#ffb13b':'#ff4f8b',shown=ticker?`$${words} ▲`:words,pw=w*.94,ph=ticker?pw/5:h*.86;
   const tex=textTexture(`neon:${shown}:${color}:${ticker?2:1}`,ticker?640:256,ticker?64:Math.round(256*ph/pw),neonDraw(shown,color,ticker?2:1));
   const m=owned(new THREE.MeshBasicMaterial(tex?{map:tex,transparent:true,depthWrite:false}:{color}));if(tex){textures.push(tex);if(ticker){tex.wrapS=THREE.RepeatWrapping;tex.repeat.x=.5;}}
   const p=add(PLANE(),m,0,y,.015,pw,ph,1);p.castShadow=false;
   tick=dt=>{if(ticker&&tex)tex.offset.x=(tex.offset.x+dt*.07)%1;m.opacity=busy>0?1:.88+Math.sin(t*9)*.04*(Math.sin(t*.7)>.9?3:0);};}
 }else if(item==='trophyIdea'||item==='trophySite'||item==='trophyLaunch'){
  box(mat('#ece6da'),0,.4,0,.4,.8,.4);box(mat('#d9d1c2'),0,.82,0,.42,.04,.42);
  const metal=item==='trophyIdea'?mat('#b8773f',.12):item==='trophySite'?mat('#c9d0d6',.15):mat('#f0bd2b',.25);
  if(item==='trophyIdea'){cyl(metal,0,.86,0,.08,.04);cyl(metal,0,.93,0,.02,.1);add(TAPER(),metal,0,1.05,0,.09,.16,.09);for(const s of [-1,1]){const r=add(RING(),metal,s*.1,1.06,0,.04,.04,.04);r.rotation.y=Math.PI/2;}}
  else if(item==='trophySite'){box(metal,0,.86,0,.26,.05,.14);const p=box(metal,0,1.02,0,.24,.3,.03);p.rotation.x=-.12;box(mat('#2f3e66'),0,1.03,.018,.18,.2,.005).rotation.x=-.12;add(BALL(),metal,0,1.19,-.02,.04,.04,.04);}
  else{cyl(metal,0,.86,0,.09,.04);cyl(metal,0,.94,0,.02,.12);const star=add(STAR(),metal,0,1.11,0,.12,.12,.12);tick=dt=>{star.rotation.y+=dt*(busy>0?4:.8);};}
 }else if(item==='skateboard'){
  const deck=mat(accent);box(deck,0,.09,0,.24,.025,.62);for(const s of [-1,1])box(deck,0,.11,s*.36,.24,.025,.14).rotation.x=s*.35;
  for(const z of [-.24,.24]){box(mat('#c9d0d6'),0,.065,z,.18,.02,.04);for(const x of [-.1,.1]){const w=cyl(white,x,.035,z,.035,.04);w.rotation.z=Math.PI/2;}}
 }else if(item==='plushPile'){
  box(mat('#f0b7c8'),-.18,.12,-.1,.6,.24,.5).rotation.y=.2;box(mat('#bcd3e2'),.2,.1,.15,.5,.2,.45).rotation.y=-.3;add(BLOB(),mat('#ffe8a3'),.3,.32,-.22,.17,.15,.17);
  for(const [x,z,c,r] of [[-.2,.05,'#c99a5b',.13],[.12,.22,'#e8e0cf',.11]]){const m=mat(c);add(BLOB(),m,x,.24+r*.9,z,r,r*1.1,r);add(BLOB(),m,x,.24+r*2.4,z+.02,r*.75,r*.7,r*.75);for(const s of [-1,1])box(m,x+s*r*.55,.24+r*3,z,r*.28,r*.28,r*.15);}
 }else if(item==='fireworksBox'){
  const red=mat('#d8402f');box(red,0,.18,0,.5,.36,.5);for(const z of [-.12,.12])box(mat('#ffd84f'),0,.18,z,.51,.36,.04);
  [[0,0],[-.14,-.12],[.14,-.12],[-.14,.12],[.14,.12]].forEach(([x,z],i)=>cyl(mat(PARTY[i]),x,.46,z,.035,.2));
  // The burst: 120 points on the GPU. Each has a velocity and a delay; the vertex shader flies it, nothing is touched per frame but a uniform.
  const N=120,dirs=new Float32Array(N*4),cols=new Float32Array(N*3),c=new THREE.Color();
  for(let i=0;i<N;i++){const u=Math.random()*2-1,a=Math.random()*TAU,r=Math.sqrt(1-u*u),sp=.9+Math.random()*.4,late=i>=N/2;
   dirs.set([r*Math.cos(a)*sp+(late?.5:-.4),u*sp+.2,r*Math.sin(a)*sp,late?.55:0],i*4);c.set(PARTY[(i>>3)%PARTY.length]);cols.set([c.r,c.g,c.b],i*3);}
  const pg=owned(new THREE.BufferGeometry());pg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));pg.setAttribute('aDir',new THREE.BufferAttribute(dirs,4));pg.setAttribute('color',new THREE.BufferAttribute(cols,3));
  const uT={value:0},pm=owned(new THREE.PointsMaterial({size:.09,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
  pm.onBeforeCompile=sh=>{sh.uniforms.uT=uT;sh.vertexShader='uniform float uT;\nattribute vec4 aDir;\n'+sh.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\nfloat ft=max(uT-aDir.w,0.0);transformed=position+vec3(0.0,1.9,0.0)+aDir.xyz*ft*1.4+vec3(0.0,-0.55*ft*ft,0.0);');};
  const burst=new THREE.Points(pg,pm);burst.frustumCulled=false;burst.visible=false;burst.raycast=()=>{};root.add(burst);
  let bt=-1;start=()=>{bt=0;burst.visible=true;};
  tick=dt=>{if(bt<0)return;bt+=dt;uT.value=bt;pm.opacity=Math.max(0,1-(bt/2.4)**2);if(bt>2.4){bt=-1;burst.visible=false;}};
 }else if(item==='goldToilet'){
  const gold=mat('#f0bd2b',.25);box(gold,0,.06,.04,.3,.12,.36);add(TAPER(),gold,0,.27,.06,.2,.3,.24);cyl(gold,0,.42,.06,.21,.03);
  box(gold,0,.62,-.24,.4,.4,.16);box(mat('#d9a520',.2),0,.83,-.24,.42,.04,.18);box(white,.14,.74,-.15,.06,.02,.03);
 }else box(mat(accent),0,.25,0,.5,.5,.5);
 function update(dt){t+=dt;if(busy>0)busy-=dt;tick(dt);}
 function use(character){
  const u=SPECIAL_USE[item]||{ms:2500};busy=u.ms/1000;start();
  if(u.emote)character?.emote?.(u.emote,{clip:u.clip});else if(u.clip&&!u.sit)character?.play?.(u.clip);
  return u.ms;
 }
 function dispose(){for(const m of own)m.dispose();for(const tx of textures)releaseTexture(tx);root.removeFromParent();}
 return {root,dims,update,use,dispose,get active(){return busy>0;}};
}
// Triangles and draw calls of a built piece (meshes only; the firework points are one extra call while they fly).
export function stats(root){let tris=0,draws=0;root.traverse(n=>{if(!n.isMesh)return;draws++;const g=n.geometry;tris+=(g.index?g.index.count:g.attributes.position.count)/3;});return {tris,draws};}
