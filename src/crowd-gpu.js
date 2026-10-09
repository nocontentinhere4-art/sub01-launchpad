import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {OUTFITS,HEIGHT,lookMaterials,hiddenMaterials} from './characters.js';
import {CLOTHES,SKINS,HAIRS,HAIR_STYLES} from './creator.js';
// Instanced skinned crowd: street pedestrians, residents and party guests drawn as the same rigged people the creator makes.
// Per outfit, every skinned mesh of its glb is merged into ONE geometry (aTint.w = look slot); ONE float texture holds the
// baked bone matrices (bone.matrixWorld × boneInverse) of the shared 62-bone rig for Idle/Walk/Run/Wave; the vertex shader
// skins from it with each instance's clip row, phase and rate. One InstancedMesh per outfit = 5 draw calls for everyone.
// No shadows: a skinned depth pass would double the vertex work (the box crowd never cast shadows either).
// Not drawn here (follow-ups): accessories and pets, hair styles other than the model's own (buzz hides the hair).
export const CROWD_OUTFITS=[...OUTFITS,'worker'];
export const SLOTS={skin:0,hair:1,top:2,bottom:3,fixed:4};
// [clip, frames]: frames cover one loop; the shader steps them without blending.
export const CLIP_FRAMES=[['Idle',24],['Walk',16],['Run',12],['Wave',24]];
export const CROWD_PX=14;          // below this many CSS pixels per character the box figures stand in
export const CROWD_CAP={mobile:64,desktop:160},CROWD_TRIS={mobile:4e5,desktop:1e6};   // instances and skinned triangles per frame
const TEXELS=4;

const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h;};
const rng=seed=>()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
// A stranger's look, stable for a seed: the creator's vocabulary (server options when given), the worker outfit now and then.
export function crowdLook(seed,options=null){
 const r=rng(typeof seed==='number'?seed:hash(seed)),L=options?.look||{},pick=a=>a[Math.floor(r()*a.length)];
 const list=(v,d)=>Array.isArray(v)&&v.length?v:d,outfits=list(L.outfit,OUTFITS).filter(o=>CROWD_OUTFITS.includes(o));
 const outfit=r()<.12?'worker':pick(outfits.length?outfits:OUTFITS),skin=pick(list(L.skin,SKINS)),hair=pick(list(L.hair,HAIRS)),hairStyle=pick(list(L.hairStyle,HAIR_STYLES));
 const top=pick(CLOTHES);let bottom=pick(CLOTHES);if(bottom===top)bottom=CLOTHES[(CLOTHES.indexOf(top)+3)%CLOTHES.length];
 return {outfit,skin,hair,hairStyle,top,bottom};
}
// Screen height of a 1.5 m character (orthographic camera) and the LOD switch, with 15% hysteresis so it doesn't flicker.
export const crowdPixels=(zoom,viewHeight,frustumHeight,height=HEIGHT)=>height*zoom*viewHeight/Math.max(frustumHeight,1e-6);
export const crowdClose=(px,wasClose=false,threshold=CROWD_PX)=>px>=(wasClose?threshold*.85:threshold);
// Indices of items within radius of target, nearest first (distance × item.bias), at most cap. out is reused.
export function cullInstances(items,count,target,radius,cap,out=[]){
 out.length=0;const r2=radius*radius;
 for(let i=0;i<count;i++){const it=items[i],dx=it.x-target.x,dz=it.z-target.z,d=dx*dx+dz*dz;if(d>r2)continue;it.d=d*(it.bias??1)**2;out.push(i);}
 out.sort((a,b)=>items[a].d-items[b].d);if(out.length>cap)out.length=cap;return out;
}
// The look slot of a material: skin 0, hair 1, top 2, bottom 3, anything else 4 (keeps its own colour).
// A name in both top and bottom (the suit) is split by the mesh's height: low → bottom.
export function slotOf(name,outfit,low=false){
 const w=lookMaterials(outfit);if(w.skin.includes(name))return 0;if(w.hair.includes(name))return 1;
 const t=w.top.includes(name),b=w.bottom.includes(name);return t&&b?(low?3:2):t?2:b?3:4;
}
const _m=new THREE.Matrix4(),_v=new THREE.Vector3(),_n=new THREE.Vector3(),_a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Color(),_t=new THREE.Vector3(),_u=new THREE.Vector3();
// Merges an outfit scene's skinned meshes into one geometry: position, normal, skinIndex, skinWeight, aTint (rgb, slot).
// ref ({names, inverses}) re-binds the vertices to the baked rig's bind pose, so one bone texture fits every outfit
// (the outfits' inverse bind matrices differ by up to ~4 cm). fit puts the feet at y=0 and the height at HEIGHT, like loadCharacter.
export function mergeOutfit(scene,outfit,ref=null){
 scene.updateMatrixWorld(true);const hide=hiddenMaterials(outfit),meshes=[];
 scene.traverse(n=>{if(n.isSkinnedMesh&&!Array.isArray(n.material)&&!hide.includes(n.material.name))meshes.push(n);});
 let verts=0,idx=0;for(const m of meshes){verts+=m.geometry.attributes.position.count;idx+=m.geometry.index?m.geometry.index.count:m.geometry.attributes.position.count;}
 const pos=new Float32Array(verts*3),nor=new Float32Array(verts*3),si=new Uint16Array(verts*4),sw=new Float32Array(verts*4),tint=new Float32Array(verts*4);
 const index=verts>65535?new Uint32Array(idx):new Uint16Array(idx);
 // Rest-pose (skinned) bounds, as loadCharacter measures them: the suit's top/bottom split and the fit.
 const all=new THREE.Box3(),boxes=meshes.map(m=>{m.computeBoundingBox();const b=m.boundingBox.clone().applyMatrix4(m.matrixWorld);all.union(b);return b;});
 const cut=all.min.y+(all.max.y-all.min.y)*.45,counts=[0,0,0,0,0];let o=0,k=0;
 meshes.forEach((mesh,mi)=>{
  const g=mesh.geometry,P=g.attributes.position,N=g.attributes.normal,I=g.attributes.skinIndex,W=g.attributes.skinWeight,mat=mesh.material;
  const slot=slotOf(mat.name,outfit,boxes[mi].getCenter(_a).y<cut),base=o;counts[slot]+=P.count;
  if(slot===4)_c.copy(mat.color);else _c.setScalar(/darker/i.test(mat.name)?.85:1);
  // Bone order of this mesh → the reference rig's order (by name), and per bone refInverse⁻¹ × inverse (identity when equal).
  const bones=mesh.skeleton.bones,map=bones.map(b=>ref?Math.max(0,ref.names.indexOf(b.name)):bones.indexOf(b));
  const rebind=ref?bones.map((b,i)=>new THREE.Matrix4().copy(ref.inverses[map[i]]).invert().multiply(mesh.skeleton.boneInverses[i])):null;
  const normalMat=new THREE.Matrix3().getNormalMatrix(mesh.bindMatrix);
  for(let i=0;i<P.count;i++,o++){
   _v.fromBufferAttribute(P,i).applyMatrix4(mesh.bindMatrix);_n.fromBufferAttribute(N,i).applyMatrix3(normalMat);
   if(rebind){_a.set(0,0,0);_b.set(0,0,0);
    for(let j=0;j<4;j++){const w=W.getComponent(i,j);if(!w)continue;const r=rebind[I.getComponent(i,j)];
     _a.addScaledVector(_t.copy(_v).applyMatrix4(r),w);_b.addScaledVector(_u.copy(_n).transformDirection(r),w);}
    _v.copy(_a);_n.copy(_b);}
   _v.toArray(pos,o*3);_n.normalize().toArray(nor,o*3);
   for(let j=0;j<4;j++){si[o*4+j]=map[I.getComponent(i,j)]??0;sw[o*4+j]=W.getComponent(i,j);}
   tint[o*4]=_c.r;tint[o*4+1]=_c.g;tint[o*4+2]=_c.b;tint[o*4+3]=slot;
  }
  if(g.index)for(let i=0;i<g.index.count;i++)index[k++]=g.index.getX(i)+base;else for(let i=0;i<P.count;i++)index[k++]=base+i;
 });
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));geometry.setAttribute('normal',new THREE.BufferAttribute(nor,3));
 geometry.setAttribute('skinIndex',new THREE.BufferAttribute(si,4));geometry.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4));
 geometry.setAttribute('aTint',new THREE.BufferAttribute(tint,4));geometry.setIndex(new THREE.BufferAttribute(index,1));
 const size=all.getSize(_a),c=all.getCenter(_b),s=HEIGHT/Math.max(size.y,1e-6);
 const fit=new THREE.Matrix4().makeScale(s,s,s).setPosition(-c.x*s,-all.min.y*s,-c.z*s);
 return {geometry,fit,triangles:idx/3,vertices:verts,slots:counts};
}
// Samples each clip of CLIP_FRAMES on a clone of the template rig. Row = frame, TEXELS texels per bone (the matrix columns).
export function bakeBones(scene,clips,spec=CLIP_FRAMES){
 const rig=clone(scene);let skel=null;rig.traverse(n=>{if(n.isSkinnedMesh&&!skel)skel=n.skeleton;});
 if(!skel)throw new Error('no skinned mesh to bake');
 const bones=skel.bones,inv=skel.boneInverses,n=bones.length,total=spec.reduce((s,[,f])=>s+f,0);
 const rest=bones.map(b=>[b.position.clone(),b.quaternion.clone(),b.scale.clone()]),data=new Float32Array(n*TEXELS*4*total);
 const mixer=new THREE.AnimationMixer(rig),info={};let row=0;
 for(const [name,frames] of spec){
  const clip=clips.find(c=>c.name===name);info[name]={start:row,frames,fps:frames/(clip?.duration||1),duration:clip?.duration||1};
  bones.forEach((b,i)=>{b.position.copy(rest[i][0]);b.quaternion.copy(rest[i][1]);b.scale.copy(rest[i][2]);});
  const action=clip?mixer.clipAction(clip).play():null;
  for(let f=0;f<frames;f++,row++){if(action)mixer.setTime(f/frames*clip.duration);rig.updateMatrixWorld(true);
   for(let i=0;i<n;i++)data.set(_m.multiplyMatrices(bones[i].matrixWorld,inv[i]).elements,(row*n+i)*TEXELS*4);}
  if(action){action.stop();mixer.uncacheAction(clip);}
 }
 return {data,width:n*TEXELS,height:total,bones:n,clips:info,names:bones.map(b=>b.name),inverses:inv.map(m=>m.clone())};
}

const VERT=`uniform highp sampler2D uBones;uniform float uTime;uniform mat4 uFit;
attribute vec4 skinIndex;attribute vec4 skinWeight;attribute vec4 aTint;attribute vec4 aAnim;attribute vec4 aCol0;attribute vec4 aCol1;attribute vec4 aCol2;
varying vec3 vColor;varying vec3 vNormal;
mat4 boneAt(float i,int row){int x=int(i+.5)*${TEXELS};return mat4(texelFetch(uBones,ivec2(x,row),0),texelFetch(uBones,ivec2(x+1,row),0),texelFetch(uBones,ivec2(x+2,row),0),texelFetch(uBones,ivec2(x+3,row),0));}
void main(){
 int row=int(aAnim.x+floor(mod(uTime*aAnim.w+aAnim.z,aAnim.y)));
 mat4 S=skinWeight.x*boneAt(skinIndex.x,row);
 if(skinWeight.y>0.)S+=skinWeight.y*boneAt(skinIndex.y,row);
 if(skinWeight.z>0.)S+=skinWeight.z*boneAt(skinIndex.z,row);
 if(skinWeight.w>0.)S+=skinWeight.w*boneAt(skinIndex.w,row);
 mat4 M=modelMatrix*instanceMatrix*uFit*S;
 vNormal=normalize(mat3(M)*normal);
 float s=aTint.w;vec3 t=aTint.rgb;
 vColor=s<.5?aCol0.rgb*t:s<1.5?vec3(aCol0.w,aCol1.xy)*t:s<2.5?vec3(aCol1.zw,aCol2.x)*t:s<3.5?aCol2.yzw*t:t;
 gl_Position=projectionMatrix*viewMatrix*M*vec4(position,1.);}`;
// MeshToonMaterial with toon.js's 3-band gradient (90/170/255), hemisphere + two directional lights, no shadows.
const FRAG=`uniform vec3 uSky;uniform vec3 uGround;uniform vec3 uL0;uniform vec3 uC0;uniform vec3 uL1;uniform vec3 uC1;
varying vec3 vColor;varying vec3 vNormal;
float band(float d){float u=d*.5+.5;return u<.33334?.35294:u<.66667?.66667:1.;}
void main(){vec3 n=normalize(vNormal);
 vec3 irr=mix(uGround,uSky,n.y*.5+.5)+band(dot(n,uL0))*uC0+band(dot(n,uL1))*uC1;
 gl_FragColor=vec4(vColor*irr*.31830989,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

// parent: the scene. lights: {hemi, dirs:[DirectionalLight…]} read every frame (day/night follow for free).
// Per frame: begin(seconds) → push(look,x,y,z,yaw,opts) from every source → end(target,radius). Until load() resolves,
// ready is false and callers keep their box figures.
export function createCrowdGPU(parent,{mobile=false,lights=null,cap=mobile?CROWD_CAP.mobile:CROWD_CAP.desktop,budget=mobile?CROWD_TRIS.mobile:CROWD_TRIS.desktop}={}){
 const root=new THREE.Group();root.name='GPU crowd';parent.add(root);
 const shared={uBones:{value:null},uTime:{value:0},uSky:{value:new THREE.Color()},uGround:{value:new THREE.Color()},
  uL0:{value:new THREE.Vector3(0,1,0)},uC0:{value:new THREE.Color(0,0,0)},uL1:{value:new THREE.Vector3(0,1,0)},uC1:{value:new THREE.Color(0,0,0)}};
 const pool=Array.from({length:Math.max(cap*2,360)},()=>({look:null,x:0,y:0,z:0,yaw:0,scale:1,clip:'Idle',phase:0,rate:1,bias:1,d:0}));
 const packed=new WeakMap(),visible=[],perOutfit=new Map();let n=0,meshes=[],bake=null,loading=null,failedAt=-Infinity,ready=false,stats={instances:0,triangles:0,drawCalls:0};
 // Linear colours for the four slots; buzz shows skin where the hair would be. Cached per look object.
 function pack(look){let p=packed.get(look);if(p)return p;const c=new Float32Array(12),col=(v,d)=>_c.set(typeof v==='string'&&/^#([0-9a-f]{3}){1,2}$/i.test(v)?v:d);
  const skin=look?.skin||'#e8b48f';[skin,look?.hairStyle==='buzz'?skin:look?.hair||'#3b2a20',look?.top||'#fb752b',look?.bottom||'#2f3e66'].forEach((v,i)=>{col(v,'#888888');c[i*3]=_c.r;c[i*3+1]=_c.g;c[i*3+2]=_c.b;});
  p={outfit:CROWD_OUTFITS.includes(look?.outfit)?look.outfit:'hoodie',c};packed.set(look,p);return p;}
 function build(merged,outfit){
  const g=merged.geometry,attr=(name,size)=>{const a=new THREE.InstancedBufferAttribute(new Float32Array(cap*size),size);a.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,a);return a;};
  const anim=attr('aAnim',4),cols=[attr('aCol0',4),attr('aCol1',4),attr('aCol2',4)];
  const material=new THREE.ShaderMaterial({name:'crowd-'+outfit,uniforms:{...shared,uFit:{value:merged.fit}},vertexShader:VERT,fragmentShader:FRAG});
  const mesh=new THREE.InstancedMesh(g,material,cap);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.visible=false;
  // Instances move every frame and are culled on the CPU; the sphere only keeps three from computing one.
  mesh.frustumCulled=false;mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e4);mesh.raycast=()=>{};mesh.name='crowd '+outfit;
  root.add(mesh);return {mesh,anim,cols,triangles:merged.triangles};
 }
 async function load(template){
  if(!loading&&performance.now()-failedAt<3e4)return null;   // a failed load is retried at most every 30 s
  loading||=(async()=>{
   const [anims,...outfits]=await Promise.all([template('characters','anims'),...CROWD_OUTFITS.map(o=>template('characters',o))]);
   bake=bakeBones(outfits[0].scene,anims.animations);
   const tex=new THREE.DataTexture(bake.data,bake.width,bake.height,THREE.RGBAFormat,THREE.FloatType);
   tex.minFilter=tex.magFilter=THREE.NearestFilter;tex.generateMipmaps=false;tex.needsUpdate=true;shared.uBones.value=tex;
   CROWD_OUTFITS.forEach((o,i)=>{const b=build(mergeOutfit(outfits[i].scene,o,bake),o);perOutfit.set(o,b);meshes.push(b.mesh);});
   ready=true;
  })().catch(e=>{console.warn('crowd load',e);failedAt=performance.now();loading=null;});
  return loading;
 }
 let time=0;
 // seconds is not wrapped: callers time one-off clips (a wave) against the same clock; float32 stays frame-exact for days.
 function begin(seconds){n=0;time=seconds;}
 // clip: Idle | Walk | Run | Wave; rate scales the clip's own speed; phase in loops (0..1). bias < 1 wins the cap (residents).
 function push(look,x,y,z,yaw,{clip='Idle',rate=1,phase=0,scale=1,bias=1}={}){
  if(!ready||n>=pool.length)return false;const it=pool[n++];
  it.look=look;it.x=x;it.y=y;it.z=z;it.yaw=yaw;it.clip=clip;it.rate=rate;it.phase=phase;it.scale=scale;it.bias=bias;return true;
 }
 function end(target,radius){
  if(!ready){stats={instances:0,triangles:0,drawCalls:0};return stats;}
  shared.uTime.value=time;
  if(lights){const h=lights.hemi;if(h){shared.uSky.value.copy(h.color).multiplyScalar(h.intensity);shared.uGround.value.copy(h.groundColor).multiplyScalar(h.intensity);}
   (lights.dirs||[]).slice(0,2).forEach((d,i)=>{shared['uL'+i].value.subVectors(d.position,d.target.position).normalize();shared['uC'+i].value.copy(d.color).multiplyScalar(d.intensity);});}
  cullInstances(pool,n,target,radius,cap,visible);
  for(const b of perOutfit.values())b.count=0;
  let tris=0,calls=0,drawn=0;
  // Nearest first until the triangle budget is spent (the outfits differ: 5.2k–6.6k triangles each).
  for(const i of visible){const it=pool[i],p=pack(it.look),b=perOutfit.get(p.outfit);if(tris+b.triangles>budget)break;tris+=b.triangles;drawn++;
   const k=b.count++,ci=bake.clips[it.clip]||bake.clips.Idle;
   const c=Math.cos(it.yaw)*it.scale,s=Math.sin(it.yaw)*it.scale,e=b.mesh.instanceMatrix.array,o=k*16;
   e[o]=c;e[o+1]=0;e[o+2]=-s;e[o+3]=0;e[o+4]=0;e[o+5]=it.scale;e[o+6]=0;e[o+7]=0;e[o+8]=s;e[o+9]=0;e[o+10]=c;e[o+11]=0;e[o+12]=it.x;e[o+13]=it.y;e[o+14]=it.z;e[o+15]=1;
   const a=b.anim.array;a[k*4]=ci.start;a[k*4+1]=ci.frames;a[k*4+2]=(it.phase%1)*ci.frames;a[k*4+3]=ci.fps*it.rate;
   const [c0,c1,c2]=b.cols,q=p.c;c0.array.set([q[0],q[1],q[2],q[3]],k*4);c1.array.set([q[4],q[5],q[6],q[7]],k*4);c2.array.set([q[8],q[9],q[10],q[11]],k*4);}
  for(const b of perOutfit.values()){const m=b.mesh;m.count=b.count;m.visible=b.count>0;if(!b.count)continue;calls++;
   for(const a of [m.instanceMatrix,b.anim,...b.cols]){a.clearUpdateRanges();a.addUpdateRange(0,b.count*a.itemSize);a.needsUpdate=true;}}
  stats={instances:drawn,pushed:n,triangles:tris,drawCalls:calls};return stats;
 }
 function hide(){for(const m of meshes)m.visible=false;stats={instances:0,triangles:0,drawCalls:0};}
 // active: set by the caller each frame (LOD); sources push only while it is true.
 return {active:false,root,load,begin,push,end,hide,cap,budget,get ready(){return ready;},get stats(){return stats;},get bake(){return bake;},get meshes(){return meshes;},
  // Seconds of one loop of a clip at rate 1 (callers time a one-off Wave with it).
  clipSeconds:name=>bake?.clips[name]?.duration||1};
}
