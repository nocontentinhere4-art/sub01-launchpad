import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {toon} from './toon.js';
// Procedural accessories and pets: boxes, cylinders, spheres and tori only (no assets, no textures).
// Geometry is built once per kind (module cache) and shared by every character and pet. Materials are shared per default
// colour; a colour the look sets gets a material of its own, which dispose() frees. Shared geometry is never disposed.
// Units are character space of the 1.5-unit rig: feet at y=0, facing +z. Head, neck and spine offsets are from the bone's
// rest position, measured on hoodie.glb through loadCharacter (the other outfits match within 0.01):
//   Head (-0.02, 1.27, -0.05): hair top +0.23 above it; eyes +0.084 up and +0.10 forward; face front +0.11; hair half-width 0.094.
//   Neck (-0.02, 1.21, -0.05). Chest (-0.02, 1.10, -0.07): torso back at chest-z -0.10, torso front +0.10.
// Each accessory group is a plain child of its bone with scale 1/k (k = the model fit scale, about 0.82), so its geometry
// is in character units and it moves rigidly with the bone whenever the bone is animated, whatever pose it was attached in.
// The offsets are measured in the rest pose; the bones' bind tilt (4 degrees on the head, 8 on the chest) shifts them by up to about 2 cm.
export const ACCESSORIES=['glasses','sunglasses','cap','beanie','headphones','backpack','scarf','mask','halo','crown','cat_ears','antenna','wings','jetpack'];
export const PETS=['cat','dog','robot','duck','slime','dragon'];
const B=(w,h,d,x=0,y=0,z=0)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
const cone=(r,h,seg,x,y,z)=>new THREE.ConeGeometry(r,h,seg).translate(x,y,z);
const cyl=(r,h,seg)=>new THREE.CylinderGeometry(r,r,h,seg);
const merge=list=>mergeGeometries(list);
const HEAD=['Head'],NECK=['Neck'],SPINE=['Chest','Torso','Abdomen'];
const lenses=(w,h)=>merge([B(w,h,.012,-.036,.084,.12),B(w,h,.012,.036,.084,.12),B(.02,.012,.012,0,.094,.12),B(.012,.012,.16,-.088,.084,.04),B(.012,.012,.16,.088,.084,.04)]);
const dome=(r,y,z)=>new THREE.SphereGeometry(r,8,4,0,Math.PI*2,0,Math.PI/2).translate(0,y,z);
const spike=a=>cone(.025,.07,4,.095*Math.sin(a),.265,-.02+.095*Math.cos(a));
const ear=s=>new THREE.ConeGeometry(.05,.12,4).rotateZ(-s*.2).translate(s*.075,.27,-.01);
const feathers=s=>merge([B(.2,.025,.12,s*.1,0,0),B(.14,.02,.1,s*.2,-.02,0)]);
// Per kind: candidate bones (first found wins), default colour, and geo(side) in character units around the bone.
// Halo and wings are animated, so they are built around their own pivot (see attachAccessories).
const KIND={
 glasses:{bone:HEAD,color:'#2a2a2a',geo:()=>lenses(.05,.04)},
 sunglasses:{bone:HEAD,color:'#101010',geo:()=>lenses(.06,.05)},
 cap:{bone:HEAD,color:'#3b5b8c',geo:()=>merge([dome(.12,.13,-.02),B(.2,.012,.1,0,.13,.12)])},
 beanie:{bone:HEAD,color:'#c0392b',geo:()=>merge([dome(.125,.135,-.02),new THREE.CylinderGeometry(.13,.13,.045,8,1,true).translate(0,.135,-.02),new THREE.SphereGeometry(.04,6,4).translate(0,.27,-.02)])},
 headphones:{bone:HEAD,color:'#2b2b2b',geo:()=>merge([new THREE.TorusGeometry(.11,.018,4,8,Math.PI).translate(0,.12,-.02),cyl(.045,.05,6).rotateZ(Math.PI/2).translate(-.115,.07,-.02),cyl(.045,.05,6).rotateZ(Math.PI/2).translate(.115,.07,-.02)])},
 backpack:{bone:SPINE,color:'#5d4a3a',geo:()=>merge([B(.2,.24,.1,0,-.1,-.15),B(.14,.08,.02,0,-.14,-.205)])},
 jetpack:{bone:SPINE,color:'#9aa0a6',geo:()=>merge([B(.16,.2,.08,0,-.08,-.14),cyl(.03,.06,6).translate(-.05,-.2,-.14),cyl(.03,.06,6).translate(.05,-.2,-.14)])},
 scarf:{bone:NECK,color:'#e0a030',geo:()=>merge([new THREE.TorusGeometry(.1,.04,4,10).rotateX(Math.PI/2).translate(0,.04,0),B(.08,.2,.04,.03,-.06,.11),B(.06,.14,.04,-.045,-.1,.11)])},
 mask:{bone:HEAD,color:'#2b2f38',geo:()=>merge([B(.16,.07,.03,0,.027,.125),B(.012,.012,.17,-.088,.027,0),B(.012,.012,.17,.088,.027,0)])},
 halo:{bone:HEAD,color:'#ffd23f',geo:()=>new THREE.TorusGeometry(.1,.016,5,12).rotateX(Math.PI/2)},
 crown:{bone:HEAD,color:'#f5c542',geo:()=>merge([new THREE.CylinderGeometry(.1,.105,.05,8,1,true).translate(0,.205,-.02),...[0,1,2,3,4].map(i=>spike(i*Math.PI*2/5))])},
 cat_ears:{bone:HEAD,color:'#202a26',geo:()=>merge([ear(-1),ear(1)])},
 antenna:{bone:HEAD,color:'#e53935',geo:()=>merge([new THREE.CylinderGeometry(.008,.008,.12,4).translate(0,.27,-.08),new THREE.SphereGeometry(.03,6,4).translate(0,.34,-.08)])},
 wings:{bone:SPINE,color:'#f5f7ff',geo:s=>feathers(s)},
};
const shared=new Map();      // default colour -> material used by every character (never disposed here)
const cache=new Map();       // geometry key -> built once
const built=(key,make)=>{if(!cache.has(key))cache.set(key,make());return cache.get(key);};
const live=new WeakMap();    // character root -> its current accessory state (keyed by the root, so any wrapper works)
const _m=new THREE.Matrix4();
// Accessories on one character. Returns {update(dt), dispose()}. Calling again replaces the previous set (no duplicates).
export function attachAccessories(character,look={}){
 look=look||{};const root=character?.root;
 live.get(root)?.dispose();
 const state={groups:[],owned:[],frames:[],t:0,
  update(dt){state.t+=dt;const f=state.frames;for(let i=0;i<f.length;i++)f[i](state.t);},
  dispose(){for(const g of state.groups)g.removeFromParent();for(const m of state.owned)m.dispose();state.groups.length=state.owned.length=state.frames.length=0;if(live.get(root)===state)live.delete(root);}};
 if(!root)return state;
 live.set(root,state);
 root.updateMatrixWorld(true);
 const named=new Map();root.traverse(n=>{if(n.isBone&&!named.has(n.name))named.set(n.name,n);});
 const inv=new THREE.Matrix4().copy(root.matrixWorld).invert(),own=new Map();
 const paint=(hex,user)=>{hex=hex.toLowerCase();
  if(!user){if(!shared.has(hex))shared.set(hex,toon({color:hex}));return shared.get(hex);}
  if(!own.has(hex)){const m=toon({color:hex});own.set(hex,m);state.owned.push(m);}return own.get(hex);};
 const piece=(kind,s)=>built(kind+(s??''),()=>KIND[kind].geo(s));
 for(const kind of new Set(look?.accessories||[])){
  const spec=KIND[kind];if(!spec)continue;
  const bone=spec.bone.map(n=>named.get(n)).find(Boolean);if(!bone)continue;   // rig without this bone: skip, do not throw
  const k=_m.multiplyMatrices(inv,bone.matrixWorld).getMaxScaleOnAxis();
  const g=new THREE.Group();g.name='accessory:'+kind;g.scale.setScalar(1/k);bone.add(g);state.groups.push(g);
  const user=look.accessoryColor||(kind==='cat_ears'?look.hair:null)||null;
  const mat=paint(user||spec.color,!!user);
  if(kind==='wings'){// one pivot per wing at the shoulder blades; the wings flap
   const [l,r]=[-1,1].map(s=>{const p=new THREE.Group();p.position.set(s*.06,.04,-.14);p.add(new THREE.Mesh(piece(kind,s),mat));g.add(p);return p;});
   state.frames.push(t=>{const a=.25+Math.sin(t*2.2)*.35;l.rotation.z=-a;r.rotation.z=a;});
  }else if(kind==='halo'){// a ring over the crown that bobs and tilts
   const p=new THREE.Group();p.position.set(0,.29,-.02);p.add(new THREE.Mesh(piece(kind),mat));g.add(p);
   state.frames.push(t=>{p.position.y=.29+Math.sin(t*2)*.012;p.rotation.z=Math.sin(t*1.3)*.08;});
  }else g.add(new THREE.Mesh(piece(kind),mat));
 }
 return state;
}
// Pets: one merged mesh per material role, plus separate pivots for the moving parts. Geometry is cached per kind.
const DARK='#202020',GLOW='#7ff9ff';
const ACCENT={cat:'#f29bb0',dog:'#2b2b2b',robot:'#9aa0a6',duck:'#ffa726',slime:DARK,dragon:'#f4e4bc'};
const ball=(r,ws,hs,x,y,z)=>new THREE.SphereGeometry(r,ws,hs).translate(x,y,z);
// Moving parts are built around their pivot: a leg hangs from (x,len,z), a tail trails back from (x,y,z), a wing grows outward from s.
const leg=(w,h,d,x,z,ph)=>({g:B(w,h,d,0,-h/2,0),at:[x,h,z],k:'leg',ph});
const tail=(w,h,d,x,y,z)=>({g:B(w,h,d,0,0,-d/2),at:[x,y,z],k:'tail'});
const wing=(s,w,h,d,x,y,z)=>({g:B(w,h,d,s*w/2,0,0),at:[x,y,z],k:'wing',s});
const PARTS={
 cat:()=>({body:[B(.26,.2,.36,0,.2,0),B(.24,.2,.2,0,.36,.2),cone(.05,.1,4,-.07,.47,.18),cone(.05,.1,4,.07,.47,.18)],
  dark:[B(.04,.04,.02,-.06,.38,.31),B(.04,.04,.02,.06,.38,.31)],accent:[B(.03,.025,.02,0,.33,.31)],
  anim:[leg(.08,.12,.08,-.08,.12,0),leg(.08,.12,.08,.08,.12,Math.PI),leg(.08,.12,.08,-.08,-.12,Math.PI),leg(.08,.12,.08,.08,-.12,0),tail(.05,.05,.22,0,.26,-.18)]}),
 dog:()=>({body:[B(.28,.2,.4,0,.2,0),B(.22,.22,.2,0,.36,.24),B(.12,.1,.12,0,.31,.37),B(.05,.14,.1,-.13,.33,.24),B(.05,.14,.1,.13,.33,.24)],
  dark:[B(.04,.04,.02,-.07,.4,.35),B(.04,.04,.02,.07,.4,.35),B(.06,.04,.03,0,.34,.44)],
  anim:[leg(.09,.12,.09,-.1,.14,0),leg(.09,.12,.09,.1,.14,Math.PI),leg(.09,.12,.09,-.1,-.14,Math.PI),leg(.09,.12,.09,.1,-.14,0),tail(.06,.06,.22,0,.28,-.2)]}),
 robot:()=>({body:[B(.28,.28,.28,0,.47,0),B(.26,.2,.22,0,.27,0)],dark:[B(.2,.1,.02,0,.47,.145)],accent:[B(.02,.08,.02,0,.65,0)],
  glow:[B(.05,.05,.02,-.06,.49,.15),B(.05,.05,.02,.06,.49,.15),ball(.035,6,4,0,.74,0)],
  anim:[leg(.09,.17,.1,-.07,0,0),leg(.09,.17,.1,.07,0,Math.PI)]}),
 duck:()=>({body:[new THREE.SphereGeometry(.17,8,5).scale(1,.8,1.1).translate(0,.22,0),ball(.11,8,5,0,.4,.1),cone(.05,.12,4,0,.3,-.2)],
  dark:[B(.03,.03,.02,-.05,.43,.19),B(.03,.03,.02,.05,.43,.19)],accent:[B(.1,.04,.09,0,.38,.23),B(.09,.02,.12,-.07,.01,.02),B(.09,.02,.12,.07,.01,.02)],
  anim:[wing(-1,.14,.1,.04,-.16,.26,0),wing(1,.14,.1,.04,.16,.26,0)]}),
 slime:()=>({body:[new THREE.SphereGeometry(.27,8,6).scale(1,.9,1).translate(0,.243,0)],dark:[B(.05,.07,.02,-.08,.29,.245),B(.05,.07,.02,.08,.29,.245)],anim:[]}),
 dragon:()=>({body:[B(.3,.26,.4,0,.34,0),B(.26,.24,.26,0,.6,.2),B(.16,.1,.16,0,.56,.36)],
  accent:[cone(.03,.08,4,0,.5,-.1),cone(.03,.08,4,0,.5,0),cone(.03,.08,4,0,.5,.1),cone(.03,.12,4,-.08,.77,.2),cone(.03,.12,4,.08,.77,.2)],
  dark:[B(.04,.04,.02,-.08,.64,.33),B(.04,.04,.02,.08,.64,.33)],
  anim:[wing(-1,.24,.02,.2,-.15,.45,-.05),wing(1,.24,.02,.2,.15,.45,-.05),{g:new THREE.ConeGeometry(.06,.3,4).rotateX(-Math.PI/2).translate(0,0,-.15),at:[0,.28,-.2],k:'tail'},
   leg(.1,.21,.1,-.1,.14,0),leg(.1,.21,.1,.1,.14,Math.PI),leg(.1,.21,.1,-.1,-.14,Math.PI),leg(.1,.21,.1,.1,-.14,0)]}),
};
const petParts=kind=>built('pet:'+kind,()=>{const {body=[],dark=[],accent=[],glow=[],anim=[]}=PARTS[kind]();
 const m=list=>list.length?merge(list):null;return {body:m(body),dark:m(dark),accent:m(accent),glow:m(glow),anim};});
// A pet of one kind facing +z with its feet at y=0 (cat/dog/duck/slime ~0.5 tall, robot 0.75, dragon 0.83).
export function createPet({kind='cat',color='#c8a27a',name=''}={}){
 const k=PETS.includes(kind)?kind:'cat',P=petParts(k),root=new THREE.Group(),body=new THREE.Group();
 root.name='pet:'+k;root.userData={kind:k,name};root.add(body);
 const owned=[],M={},hex={body:color,dark:DARK,accent:ACCENT[k],glow:GLOW};
 const mat=role=>{if(!M[role]){M[role]=toon(role==='glow'?{color:GLOW,emissive:GLOW,emissiveIntensity:1}:{color:hex[role]});owned.push(M[role]);}return M[role];};
 for(const role of ['body','dark','accent','glow'])if(P[role])body.add(new THREE.Mesh(P[role],mat(role)));
 const anim=P.anim.map(a=>{const p=new THREE.Group();p.position.fromArray(a.at);p.add(new THREE.Mesh(a.g,mat('body')));root.add(p);return {p,a};});
 let t=0,walk=0;
 // state.moving drives the walk: legs swing, tails and wings speed up, slimes squash, ducks waddle, a robot's glow blinks.
 function update(dt,state={}){
  t+=dt;walk+=((state.moving?1:0)-walk)*Math.min(1,dt*8);
  for(let i=0;i<anim.length;i++){const {p,a}=anim[i];
   if(a.k==='leg')p.rotation.x=Math.sin(t*9+a.ph)*.5*walk;
   else if(a.k==='tail')p.rotation.y=Math.sin(t*(2.4+3*walk)+(a.ph||0))*.35;
   else p.rotation.z=a.s*(.2+Math.sin(t*(2+5*walk))*.3);}
  if(k==='slime'){const sy=1+Math.sin(t*3)*.03+walk*.08,sq=1/Math.sqrt(sy);body.scale.set(sq,sy,sq);}
  if(k==='duck')root.rotation.z=walk*Math.sin(t*10)*.07;
  if(M.glow)M.glow.emissiveIntensity=t%2.5<.12?.1:1;
 }
 function setColor(c){M.body.color.set(c);}
 function dispose(){root.removeFromParent();for(const m of owned)m.dispose();owned.length=0;}
 return {root,update,setColor,dispose};
}
// Moves a pet to a point `distance` behind its target (target.rotation.y is the facing). Returns {moving}.
// The pet stops within 0.02 of that point, faces the direction it is walking, and takes the target's floor height.
export function petFollow(petRoot,target,dt,{distance=.9,speed=2.2}={}){
 const ry=target.rotation?.y||0,gx=target.position.x-Math.sin(ry)*distance,gz=target.position.z-Math.cos(ry)*distance;
 const dx=gx-petRoot.position.x,dz=gz-petRoot.position.z,d=Math.hypot(dx,dz),moving=d>.02;
 if(moving){const s=Math.min(d,speed*dt);petRoot.position.x+=dx/d*s;petRoot.position.z+=dz/d*s;}
 const ax=moving?dx:target.position.x-petRoot.position.x,az=moving?dz:target.position.z-petRoot.position.z;
 let turn=Math.atan2(ax,az)-petRoot.rotation.y;turn=Math.atan2(Math.sin(turn),Math.cos(turn));
 petRoot.rotation.y+=turn*Math.min(1,dt*6);petRoot.position.y=target.position.y;
 return {moving};
}
