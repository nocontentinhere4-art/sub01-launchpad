import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {attachAccessories} from './accessories.js';
// Rigged people (Quaternius Modular Men): one outfit glb each, clips shared from anims.glb.
// Geometry and untouched materials stay shared with the template cache; a character owns only its recolours and skeleton.
// Emotes (emote/stopEmote) are procedural bone work on top of the six clips; props (phone, mic, board) are a few shared boxes.
// Pets are not part of the character: room.js creates and follows them (accessories.js createPet/petFollow).
export const OUTFITS=['hoodie','jacket','tee','suit'];
export const HEIGHT=1.5;
// Material names per outfit glb (shoes share a top/bottom colour). A name in both top and bottom is split by mesh height (the suit);
// hide drops props (the suit model holds a pistol).
const OUTFIT_MATS={hoodie:{top:['Purple'],bottom:['LightBlue']},jacket:{top:['LightBrown'],bottom:['LightBlue']},tee:{top:['LightBrown'],bottom:['Red_Dark']},suit:{top:['Suit'],bottom:['Suit'],hide:['Grey','DarkBrown']},worker:{top:['Worker_Vest'],bottom:['Brown','Brown2']}};
export function lookMaterials(outfit){const o=OUTFIT_MATS[outfit]||OUTFIT_MATS.hoodie;return{top:[...o.top],bottom:[...o.bottom],skin:['Skin','Skin_Darker'],hair:['Hair']};}
// Materials an outfit never shows (props baked into the glb).
export const hiddenMaterials=outfit=>[...(OUTFIT_MATS[outfit]?.hide||[])];
let clips=null;
const fits=new WeakMap();
const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_q=new THREE.Quaternion(),_w=new THREE.Quaternion(),_p=new THREE.Quaternion();
// Rotates bone so the segment bone→child points along a world direction (rig-axis agnostic).
// k<1 blends from the clip's pose (emotes ease in and out).
function aim(bone,child,dir,k=1){
 bone.getWorldPosition(_a);child.getWorldPosition(_b);_b.sub(_a);if(_b.lengthSq()<1e-12)return;
 _q.setFromUnitVectors(_b.normalize(),dir);if(k<1)_q.slerp(_I,1-k);bone.getWorldQuaternion(_w).premultiply(_q);
 bone.parent.getWorldQuaternion(_p).invert();bone.quaternion.copy(_p.multiply(_w));bone.updateMatrixWorld(true);
}
// Rotates bone so one of its own axes (unit, bone space) points along a world direction: for a limb whose end is no child
// bone (the Quaternius shin: the feet hang off Root as IK targets).
function aimAxis(bone,axis,dir,k=1){
 bone.getWorldQuaternion(_w);_b.copy(axis).applyQuaternion(_w);_q.setFromUnitVectors(_b,dir);if(k<1)_q.slerp(_I,1-k);_w.premultiply(_q);
 bone.parent.getWorldQuaternion(_p).invert();bone.quaternion.copy(_p.multiply(_w));bone.updateMatrixWorld(true);
}
// Rotates bone by angle about a world axis.
function turn(bone,axis,angle){if(!bone||!angle)return;_q.setFromAxisAngle(axis,angle);bone.getWorldQuaternion(_w).premultiply(_q);
 bone.parent.getWorldQuaternion(_p).invert();bone.quaternion.copy(_p.multiply(_w));bone.updateMatrixWorld(true);}
// Seated leg, side view (pure): the hip joint S above the floor, thigh a, shin b, forward = +z, up = +y, relative to the hip.
// A low seat keeps the thigh level (lifted by `lift` radians on the floor) and leans the shin forward until the foot
// reaches the floor; a high seat dips the thigh so the shin stays vertical; higher than the leg is long, the feet dangle.
export function seatedLeg(S,a,b,lift=0){
 if(S<=b){const kz=a*Math.cos(lift),ky=a*Math.sin(lift),h=S+ky;return {knee:[kz,ky],foot:[kz+Math.sqrt(Math.max(0,b*b-h*h)),-S]};}
 const th=Math.asin(Math.min(1,(S-b)/a)),kz=a*Math.cos(th),ky=-a*Math.sin(th);return {knee:[kz,ky],foot:[kz,Math.max(-S,ky-b)]};
}
// Sit styles: back lean (radians about the hips, negative reclines), thigh lift, knee splay, where the hands go, head tilt.
export const SIT_STYLES={chair:{lean:.04,lift:0,splay:.02,hands:'thigh',head:.04},sofa:{lean:-.3,lift:.08,splay:.07,hands:'thigh',head:-.02},
 desk:{lean:.1,lift:0,splay:.02,hands:'desk',head:.14},floor:{lean:.14,lift:.5,splay:.16,hands:'knee',head:.06,hip:.12}};
const smooth=k=>k*k*(3-2*k);
// Emote catalogue: base clip, seconds (Infinity loops until stopEmote), and whether the emote moves the root itself.
export const EMOTE_DEFS={wave:{clip:'Wave',time:2.2},sit:{clip:'Idle_Neutral',time:Infinity},think:{clip:'Idle_Neutral',time:4},sleep:{time:Infinity},
 dance:{clip:'Idle',time:Infinity},facepalm:{clip:'Idle_Neutral',time:2},cook:{clip:'Interact',time:4},selfie:{clip:'Idle_Neutral',time:2.4},
 karaoke:{clip:'Idle',time:Infinity},skate:{clip:'Run',time:Infinity,speed:.3},celebrate:{clip:'Idle',time:2.1},moonwalk:{clip:'Walk',time:4,moves:true}};
export const EMOTES=Object.keys(EMOTE_DEFS);
const _I=new THREE.Quaternion(),_rq=new THREE.Quaternion(),_d=new THREE.Vector3(),_t=new THREE.Vector3(),AX=new THREE.Vector3(),AY=new THREE.Vector3(),AZ=new THREE.Vector3();
// Props shared by every character: geometry and materials are created once and never disposed.
let PROPS=null;
const props=()=>PROPS||={box:new THREE.BoxGeometry(1,1,1),plane:new THREE.PlaneGeometry(1,1),dark:new THREE.MeshBasicMaterial({color:'#22252a'}),
 metal:new THREE.MeshBasicMaterial({color:'#b9c0c8'}),deck:new THREE.MeshBasicMaterial({color:'#e2583e'}),wheel:new THREE.MeshBasicMaterial({color:'#f3efe4'})};
const findBone=(model,re,side)=>{let hit=null;model.traverse(n=>{if(hit||!n.isBone)return;const k=n.name.toLowerCase().replace(/[^a-z]/g,'');if(re.test(k)&&(!side||k.endsWith(side)||k.includes(side==='l'?'left':'right')))hit=n;});return hit;};
export async function loadCharacter(look={},{template}){
 const outfit=OUTFITS.includes(look?.outfit)||look?.outfit==='worker'?look.outfit:'hoodie';
 clips||=template('characters','anims').then(g=>g.animations).catch(e=>{clips=null;throw e;});
 const [gltf,anims]=await Promise.all([template('characters',outfit),clips]);
 const model=clone(gltf.scene),inner=new THREE.Group(),root=new THREE.Group();
 // Fit to HEIGHT with feet at y=0, measured once per outfit.
 if(!fits.has(gltf)){const t=clone(gltf.scene);t.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(t),s=HEIGHT/box.getSize(_a).y,c=box.getCenter(_b);const low=[],cut=box.min.y+(box.max.y-box.min.y)*.45;t.traverse(n=>{if(n.isMesh)low.push(new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3()).y<cut);});
  fits.set(gltf,{s,x:-c.x*s,y:-box.min.y*s,z:-c.z*s,back:(c.z-box.min.z)*s,low});}
 const fit=fits.get(gltf);model.scale.setScalar(fit.s);model.position.set(fit.x,fit.y,fit.z);inner.add(model);root.add(inner);
 // One skeleton per character: SkeletonUtils gives every skinned mesh its own copy (and bone texture).
 const want=lookMaterials(outfit),colors={top:look?.top,bottom:look?.bottom,skin:look?.skin,hair:look?.hair},owned=new Map(),skeletons=[];
 let i=0;
 const slot=(m,low)=>{for(const k in want)if(want[k].includes(m.name)&&!(k==='top'&&low&&want.bottom.includes(m.name)))return k;},recolor=(m,low)=>{const k=slot(m,low),id=m.uuid+k;if(!colors[k])return m;
  if(!owned.has(id)){const x=m.clone();x.color.set(colors[k]);if(/darker/i.test(m.name))x.color.multiplyScalar(.85);x.map=null;owned.set(id,x);}return owned.get(id);};
 model.traverse(n=>{if(!n.isMesh)return;n.castShadow=true;n.receiveShadow=false;const low=fit.low[i++];
  n.material=Array.isArray(n.material)?n.material.map(m=>recolor(m,low)):recolor(n.material,low);
  if(look?.hairStyle==='buzz'&&!Array.isArray(n.material)&&want.hair.includes(n.material.name))n.visible=false;
  if(OUTFIT_MATS[outfit].hide?.includes(n.material.name)){const g=n.parent;(g.isGroup&&g.children.every(c=>c.isMesh)?g:n).visible=false;}
  if(!n.isSkinnedMesh)return;const same=skeletons.find(s=>s.bones.length===n.skeleton.bones.length&&s.bones.every((b,i)=>b===n.skeleton.bones[i])&&s.boneInverses.every((m,i)=>m.equals(n.skeleton.boneInverses[i])));
  if(same)n.bind(same,n.bindMatrix);else skeletons.push(n.skeleton);});
 const mixer=new THREE.AnimationMixer(model),actions={};
 for(const c of anims)actions[c.name]=mixer.clipAction(c);
 if(actions.Wave){actions.Wave.setLoop(THREE.LoopOnce,1);actions.Wave.clampWhenFinished=true;}
 let current=null,base='Idle',kind=null;
 function clip(name){const next=actions[name]||actions.Idle;if(!next||next===current)return;next.reset().play();if(current)current.crossFadeTo(next,.25,false);current=next;}
 function play(name){const next=actions[name]||actions.Idle;if(!next)return;if(next!==actions.Wave)base=name in actions?name:'Idle';if(next===current)return;
  next.reset().play();if(current)current.crossFadeTo(next,.25,false);current=next;}
 mixer.addEventListener('finished',e=>{if(e.action===current&&e.action===actions.Wave&&!em)play(base);});
 // Distance-driven walking: the caller sets the Walk cycle from metres travelled (motion.js), so feet never slide. play() un-pauses.
 function stride(phase){const w=actions.Walk;if(!w||current!==w)return;w.paused=true;w.time=phase*w.getClip().duration;}
 // Hip/thigh/knee for procedural poses on top of Idle_Neutral.
 const legs=['l','r'].map(s=>{const thigh=findBone(model,/upperleg|thigh/,s),knee=findBone(model,/lowerleg|shin|calf|knee/,s),foot=findBone(model,/foot|ankle/,s);return thigh&&knee&&foot&&{thigh,knee,foot};}).filter(Boolean);
 // Arms, spine and head for emotes; any of them may be missing on another rig (that part of the emote is skipped).
 const arms=['l','r'].map((s,i)=>{const up=findBone(model,/upperarm|(left|right)arm$/,s),low=findBone(model,/lowerarm|forearm/,s),hand=findBone(model,/wrist|hand$/,s);return up&&low&&hand?{up,low,hand,s:i?-1:1}:null;});
 const hips=findBone(model,/^hips$|pelvis/),chest=findBone(model,/^chest$|spine2|upperchest/),head=findBone(model,/^head$|head$/);
 model.updateMatrixWorld(true);const len=(a,b)=>a.getWorldPosition(_a).distanceTo(b.getWorldPosition(_b));
 const thighLen=legs[0]?len(legs[0].thigh,legs[0].knee):HEIGHT*.25,hipY=legs[0]?legs[0].thigh.getWorldPosition(_a).y:HEIGHT*.5;
 // The rig loads mid-animation, so the shin's own axis, its length (as a share of the thigh) and the flat foot come from
 // the bind pose (skeleton.boneInverses). The feet are keyed by every clip; when seated they are put at the shin's end.
 {const sk=skeletons[0],bind=b=>{const i=sk?sk.bones.indexOf(b):-1;if(i<0)return null;const m=sk.boneInverses[i].clone().invert(),p=new THREE.Vector3(),q=new THREE.Quaternion();m.decompose(p,q,new THREE.Vector3());return {p,q};};
  for(const l of legs){const T=bind(l.thigh),K=bind(l.knee),F=bind(l.foot);
   if(!T||!K||!F){l.axis=new THREE.Vector3(0,-1,0);l.shin=thighLen;l.flat=null;continue;}
   const v=F.p.clone().sub(K.p),t=K.p.clone().sub(T.p);l.shin=thighLen*(t.length()?v.length()/t.length():1);
   l.axis=v.normalize().applyQuaternion(K.q.clone().invert());l.flat=l.foot.parent===l.knee?null:F.q;}}
 // Bones the emotes rotate relatively: a clip may not key them (Idle leaves Hips alone), so their pre-emote rotation is put back
 // before every mixer update, or the turns would pile up frame after frame.
 const turned=[hips,chest,head].filter(Boolean),pre=turned.map(b=>b.quaternion.clone());
 const headAt=head?head.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(0,HEIGHT*.85,0);   // in inner space: root and inner are identity here
 // Caller placement: sit keeps feet on the floor and the hip joint at offsets.seat; lie centres the body on the root, back at y=0, head toward -z.
 const offsets={seat:hipY-thighLen,thigh:thighLen,lieLength:HEIGHT};
 // Sitting: pose('sit',{style,hip,deskY}) — style from SIT_STYLES (chair), hip = the hip joint's height above the floor once
 // seated (offsets.seat when the root stands on the floor), deskY = the desk top (world height) for the desk style.
 // The bones blend into the seat over .3 s and back out after pose(null), so neither end pops.
 let sitK=0,sitT=0,sit={style:'chair',hip:offsets.seat,deskY:null};
 function pose(next=null,opts={}){kind=next==='sit'||next==='lie'?next:null;inner.position.set(0,0,0);inner.rotation.set(0,0,0);
  if(kind==='sit'){sit={style:SIT_STYLES[opts.style]?opts.style:'chair',hip:opts.hip>0?opts.hip:offsets.seat,deskY:opts.deskY>0?opts.deskY:null};if(!sitK)sitT=0;}
  if(kind==='lie'){sitK=0;inner.rotation.x=-Math.PI/2;inner.position.set(0,fit.back,HEIGHT/2);}
  const b=base;play(kind?'Idle_Neutral':b);base=b;}
 // The seated pose on top of whatever clip plays: legs solved so the feet rest on the floor, the feet set flat at the shin's
 // end, hands on the thighs / knees / desk, the back leaned per style, a slow breath in the chest and head. e = blend 0..1.
 const _k=new THREE.Vector3(),_f=new THREE.Vector3(),_h=new THREE.Vector3(),_fq=new THREE.Quaternion();
 function applySit(style,e,t){
  const st=SIT_STYLES[style]||SIT_STYLES.chair,floorSit=style==='floor',hip=floorSit?st.hip:sit.hip,drop=floorSit?Math.max(0,hipY-st.hip):thighLen;
  inner.position.y=-drop*e;inner.updateWorldMatrix(true,false);inner.getWorldQuaternion(_rq);AX.set(1,0,0).applyQuaternion(_rq);AY.set(0,1,0).applyQuaternion(_rq);AZ.set(0,0,1).applyQuaternion(_rq);
  const floorY=drop*e-(floorSit?0:hip-offsets.seat);   // the floor in inner space
  turn(hips,AX,st.lean*e);
  if(chest)turn(chest,AX,Math.sin(t*1.3)*.014*e);if(head)turn(head,AX,(st.head+Math.sin(t*.9+1)*.018)*e);
  legs.forEach((l,i)=>{const s=i?-1:1;inner.worldToLocal(l.thigh.getWorldPosition(_h));const S=Math.max(.05,_h.y-floorY),g=seatedLeg(S,thighLen,l.shin,st.lift);
   _k.set(_h.x+s*st.splay,_h.y+g.knee[1],_h.z+g.knee[0]);_f.set(_h.x+s*st.splay,_h.y+g.foot[1],_h.z+g.foot[0]);
   aim(l.thigh,l.knee,toward(l.thigh,_k.x,_k.y,_k.z),e);aimAxis(l.knee,l.axis,toward(l.knee,_f.x,_f.y,_f.z),e);
   if(l.flat){_t.copy(_f);inner.localToWorld(_t);l.foot.parent.worldToLocal(_t);l.foot.position.lerp(_t,e);
    model.getWorldQuaternion(_fq).multiply(l.flat);l.foot.parent.getWorldQuaternion(_p).invert().multiply(_fq);l.foot.quaternion.slerp(_p,e);l.foot.updateMatrixWorld(true);}
   const arm=arms[i];if(!arm)return;
   if(st.hands==='desk'){const y=sit.deskY?floorY+sit.deskY+.03:_h.y+.32;reach(arm,.12,-.75,.55,_h.x+s*.16,y,_h.z+.42+Math.sin(t*7+i*2)*.01,e);}
   else if(st.hands==='knee')reach(arm,.18,-.85,.5,_k.x+s*.02,_k.y+.06,_k.z-.08,e);
   else reach(arm,.14,-1,.28,_h.x+s*.06+(_k.x-_h.x)*.55,_h.y+(_k.y-_h.y)*.55+.08,_h.z+(_k.z-_h.z)*.55,e);});
 }
 // ---- emotes
 let em=null,emT=0,emDone=null,emPhase=0,flashMat=null,kit=null;
 // Props live under inner and follow the hand each frame (no bone parenting: rig scales differ). Built on first use.
 function propKit(){if(kit)return kit;const P=props(),m=(mat,w,h,d,parent=inner)=>{const x=new THREE.Mesh(P.box,mat);x.scale.set(w,h,d);x.visible=false;x.raycast=()=>{};parent.add(x);return x;};
  flashMat=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const flash=new THREE.Mesh(P.plane,flashMat);flash.scale.setScalar(.35);flash.visible=false;flash.raycast=()=>{};inner.add(flash);
  // The board sits under root (it must not lean with the rider); room.js and the city may show or reuse it.
  const board=new THREE.Group();board.visible=false;root.add(board);m(P.deck,.24,.025,.8,board).position.y=.07;for(const z of [-.27,.27])for(const x of [-.08,.08])m(P.wheel,.04,.06,.06,board).position.set(x,.03,z);
  board.traverse(n=>{n.visible=true;});board.visible=false;
  kit={phone:m(P.dark,.06,.11,.012),mic:m(P.metal,.035,.035,.14),flash,board};return kit;}
 const handAt=(arm,out)=>inner.worldToLocal(arm.hand.getWorldPosition(out));
 // Frame: directions are given in the character's own space (+x its left, +y up, +z its front) and turned to world here.
 const dir=(x,y,z)=>_d.set(x,y,z).normalize().applyQuaternion(_rq);
 const toward=(bone,x,y,z)=>{_t.set(x,y,z);inner.localToWorld(_t);bone.getWorldPosition(_a);return _d.copy(_t).sub(_a).normalize();};
 function raise(arm,ux,uy,uz,lx,ly,lz,k){if(!arm)return;const s=arm.s;aim(arm.up,arm.low,dir(ux*s,uy,uz),k);aim(arm.low,arm.hand,dir(lx*s,ly,lz),k);}
 function reach(arm,ux,uy,uz,x,y,z,k){if(!arm)return;aim(arm.up,arm.low,dir(ux*arm.s,uy,uz),k);aim(arm.low,arm.hand,toward(arm.low,x,y,z),k);}
 const FACE=[0,.07,.12];
 const RUN={
  sit(t,k){if(kind)return;applySit('floor',k,t);},
  sleep(t){inner.scale.z=1+Math.sin(t*1.7)*.035;},
  dance(t,k){const b=t*Math.PI*2.2,s=Math.sin(b*.5),uL=.5+.5*s,uR=.5-.5*s;inner.position.x=s*.07;turn(hips,AZ,s*.16*k);turn(chest,AZ,-s*.1*k);turn(head,AX,Math.sin(b)*.16*k);
   raise(arms[0],.4,-1+2*uL,.15,.3,-.2+1.2*uL+.3*Math.sin(b),.7-.5*uL,k);raise(arms[1],.4,-1+2*uR,.15,.3,-.2+1.2*uR+.3*Math.sin(b+1),.7-.5*uR,k);},
  think(t,k){turn(head,AZ,-.18*k);turn(head,AX,.1*k);reach(arms[1],-.25,-.7,.5,headAt.x-.02,headAt.y-.02,headAt.z+.1,k);},
  facepalm(t,k){turn(head,AX,.3*k);reach(arms[1],-.1,-.55,.6,headAt.x,headAt.y+FACE[1],headAt.z+FACE[2],k);},
  cook(t,k){reach(arms[1],-.2,-.75,.45,headAt.x-.12+Math.cos(t*5)*.07,hipY*.95,headAt.z+.38+Math.sin(t*5)*.07,k);turn(head,AX,.2*k);},
  selfie(t,k){raise(arms[1],-.3,.35,1,-.25,.45,1,k);turn(head,AZ,-.2*k);const K=propKit();K.phone.visible=!!arms[1];if(arms[1])handAt(arms[1],K.phone.position);K.phone.position.y+=.06;
   K.flash.visible=t>1&&t<1.3;flashMat.opacity=K.flash.visible?1-(t-1)/.3:0;K.flash.position.copy(K.phone.position);K.flash.position.z-=.03;},
  karaoke(t,k){inner.position.x=Math.sin(t*2.4)*.04;turn(hips,AY,Math.sin(t*2.4)*.12*k);turn(head,AX,-.12*k);
   reach(arms[1],-.15,-.5,.55,headAt.x,headAt.y+.02,headAt.z+.17,k);raise(arms[0],.45,1,.15,.3,1,.25+Math.sin(t*3)*.2,k);
   const K=propKit();K.mic.visible=true;if(arms[1])handAt(arms[1],K.mic.position);},
  skate(t,k){const K=propKit();K.board.visible=true;inner.position.y=.1;inner.rotation.z=Math.sin(t*1.3)*.08+.06;inner.rotation.x=.08;
   raise(arms[0],1,-.35,.1,1,-.1,.3,k);raise(arms[1],1,-.35,-.1,1,-.1,-.2,k);},
  celebrate(t,k){const j=(t%.7)/.7;inner.position.y=4*j*(1-j)*.32;raise(arms[0],.5,1,.15,.35,1,.1,k);raise(arms[1],.5,1,.15,.35,1,.1,k);},
  moonwalk(t,k,dt){emPhase=((emPhase-dt*.35/1.1)%1+1)%1;stride(emPhase);root.position.addScaledVector(dir(0,0,1),.35*dt);turn(head,AX,-.1*k);},
 };
 function emote(name,{onDone,clip:override}={}){const def=EMOTE_DEFS[name];if(!def)return false;stopEmote();
  if(name==='sleep')pose('lie');else if(kind&&name!=='sit')pose(null);
  if(name==='wave')play('Wave');else if(def.clip||override){clip(override||def.clip);if(def.speed&&current)current.timeScale=def.speed;}
  em=name;emT=0;emDone=onDone||null;emPhase=0;return true;}
 // A sleeper stays lying after stopEmote: the caller stands it up (pose(null)) when it moves on.
 function stopEmote(){if(!em)return;const was=em;em=null;emDone=null;for(let i=0;i<turned.length;i++)turned[i].quaternion.copy(pre[i]);
  inner.scale.set(1,1,1);if(kit){kit.phone.visible=kit.mic.visible=kit.flash.visible=kit.board.visible=false;}
  for(const a of Object.values(actions)){a.timeScale=1;a.paused=false;}
  if(was==='sleep')return;if(!kind){inner.position.set(0,0,0);inner.rotation.set(0,0,0);clip(base==='Walk'||base==='Run'?'Idle':base);}}
 function runEmote(dt){emT+=dt;const def=EMOTE_DEFS[em],T=def.time,k=Math.min(1,emT/.3,T===Infinity?1:Math.max(0,(T-emT)/.3));
  inner.updateWorldMatrix(true,false);inner.getWorldQuaternion(_rq);AX.set(1,0,0).applyQuaternion(_rq);AY.set(0,1,0).applyQuaternion(_rq);AZ.set(0,0,1).applyQuaternion(_rq);
  RUN[em]?.(emT,k,dt);
  if(emT>=T){const cb=emDone;stopEmote();cb?.();}}
 // Relative turns (emotes, the seated lean) sit on top of the clip: the turned bones go back to their post-clip value before
 // the mixer runs and that value is captured again right after it, so an unkeyed bone (Hips) never accumulates.
 function update(dt){const tweak=em||sitK>0||kind==='sit';if(tweak)for(let i=0;i<turned.length;i++)turned[i].quaternion.copy(pre[i]);mixer.update(dt);
  if(tweak)for(let i=0;i<turned.length;i++)pre[i].copy(turned[i].quaternion);
  if(kind==='sit'||sitK>0){sitK=Math.min(1,Math.max(0,sitK+(kind==='sit'?dt:-dt)/.3));sitT+=dt;if(sitK>0)applySit(sit.style,smooth(sitK),sitT);else if(!kind&&!em)inner.position.y=0;}
  if(em)runEmote(dt);acc?.update(dt);}
 function dispose(){stopEmote();mixer.stopAllAction();mixer.uncacheRoot(model);for(const m of owned.values())m.dispose();for(const s of skeletons)s.dispose();flashMat?.dispose();acc?.dispose();root.removeFromParent();}
 play('Idle');
 const api={root,play,stride,pose,update,dispose,offsets,emote,stopEmote,get posed(){return kind;},get emoting(){return em;},get board(){return propKit().board;}};
 // Accessories (accessories.js) ride on the bones; a failure there never costs the character.
 let acc=null;if(Array.isArray(look?.accessories)&&look.accessories.length){try{acc=attachAccessories(api,look);}catch(e){console.warn('accessories',e);acc=null;}}
 return api;
}
