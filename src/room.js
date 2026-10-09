import * as THREE from 'three';
import {api} from './api.js';
import {toon} from './toon.js';
// A resident's room. It shares the city's renderer (one WebGL context): while it is open the city pauses.
// The character is the same minimal box figure as in the street, animated procedurally (no skeleton).
export const MATERIALS={
 floor:{white_oak:'#d9c4a0',honey_oak:'#c99a5b',walnut:'#7a5236',smoked_oak:'#5e5348',concrete:'#a3a29c',tatami:'#c8c58a'},
 walls:{chalk:'#eeebe3',sand:'#dccbab',sage:'#a9b8a0',navy:'#2e3d5c',terracotta:'#c47a5a',concrete:'#9c9c98'},
 accent:{navy:'#2f3e66',linen:'#e8e0cf',rust:'#b5582f',olive:'#6f7448',charcoal:'#3a3b3d',blush:'#d9a5a0'},
};
export const LIGHTING={
 morning:{sky:'#f3dcc0',hemi:['#fff1dc','#8f8a7c',1.7],sun:['#ffd2a0',2.4,[-6,7,3]],lamp:0,window:'#ffe2b8'},
 midday:{sky:'#e6ecef',hemi:['#ffffff','#9a9a8e',2.2],sun:['#ffffff',3,[-3,9,5]],lamp:0,window:'#dff1ff'},
 evening:{sky:'#e9a77c',hemi:['#ffcf9e','#5c4a48',1.3],sun:['#ff9a55',1.8,[-8,4,1]],lamp:6,window:'#ff9e63'},
 night:{sky:'#0f1d2e',hemi:['#7d95c8','#1d2230',.7],sun:['#8fa6ff',.35,[-6,8,4]],lamp:9,window:'#1d3557'},
};
const ITEMS={
 bed:['bed_single_A',2.3,'width',{pose:'lie',dz:0,text:'Taking a nap.'}],desk:['table_medium',1.8,'width',{pose:'work',dz:.95,text:'Working on something.'}],
 chair:['chair_A',.8,'width',{pose:'sit',dz:0,text:'Sitting down.'}],couch:['couch',2,'width',{pose:'sit',dz:.2,text:'Relaxing on the couch.'}],
 shelf:['shelf_B_small_decorated',1.4,'height',{pose:'read',dz:.8,text:'Picking a book.'}],lamp:['lamp_standing',1.7,'height',{pose:'toggle',dz:.7,text:'Lamp switched.'}],
 plant:['cactus_small_A',.7,'height',{pose:'water',dz:.6,text:'Watering the plant.'}],rug:['rug_rectangle_A',2.4,'width',null],table:['table_medium',1.4,'width',{pose:'stand',dz:.8,text:'Leaning on the table.'}],
};
let host=null;
export function attachRoomHost(h){host=h;}
// Box figure: legs, body, head, hair, arms. Same palette rules as the street figures.
function figure(look={}){
 const g=new THREE.Group(),mat=c=>toon({color:c||'#888'}),box=(w,h,d,c,x,y,z,parent=g)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
 const legs=[-1,1].map(s=>{const pivot=new THREE.Group();pivot.position.set(s*.11,.62,0);g.add(pivot);box(.19,.62,.24,look.bottom,0,-.31,0,pivot);return pivot;});
 const torso=new THREE.Group();torso.position.y=.62;g.add(torso);box(.56,.62,.34,look.top,0,.31,0,torso);
 const arms=[-1,1].map(s=>{const pivot=new THREE.Group();pivot.position.set(s*.36,.58,0);torso.add(pivot);box(.14,.55,.16,look.top,0,-.25,0,pivot);box(.12,.12,.13,look.skin,0,-.56,0,pivot);return pivot;});
 box(.46,.46,.42,look.skin,0,.86,0,torso);box(.5,look.hairStyle==='buzz'?.08:.16,.46,look.hair,0,1.13,-.03,torso);
 if(look.hairStyle==='long')box(.5,.55,.1,look.hair,0,.8,-.2,torso);else if(look.hairStyle==='bun')box(.22,.2,.22,look.hair,0,1.26,-.12,torso);else box(.48,.28,.08,look.hair,0,1,-.2,torso);
 for(const s of [-1,1])box(.07,.07,.01,'#222',s*.1,.9,.215,torso);
 return {group:g,legs,arms,torso};
}
export async function openRoom({plotId,mine}){
 if(!host)return;
 let data;try{data=await api(`/api/rooms/${encodeURIComponent(plotId)}`);}catch(err){host.notify(err.status===404?'Nobody lives here yet.':'The room could not be loaded.');return;}
 const room=structuredClone(data.room),owner=data.owner,scene=new THREE.Scene();
 const camera=new THREE.OrthographicCamera(-6,6,6,-6,.1,100);camera.position.set(9,10,11);camera.lookAt(0,.6,0);
 const hemi=new THREE.HemisphereLight();scene.add(hemi);const sun=new THREE.DirectionalLight();sun.castShadow=true;sun.shadow.mapSize.set(512,512);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6});scene.add(sun);
 const lampLight=new THREE.PointLight('#ffb36b',0,7);scene.add(lampLight);
 const surface=c=>toon({color:c});
 const floor=new THREE.Mesh(new THREE.BoxGeometry(8,.2,8),surface('#ccc'));floor.position.y=-.1;floor.receiveShadow=true;scene.add(floor);
 const walls=[[8,3,.2,0,1.5,-4.1],[.2,3,8,-4.1,1.5,0]].map(([w,h,d,x,y,z])=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),surface('#eee'));m.position.set(x,y,z);m.receiveShadow=true;scene.add(m);return m;});
 const windowPane=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.5),new THREE.MeshBasicMaterial());windowPane.position.set(1,1.7,-3.99);scene.add(windowPane);
 const name=document.createElement('canvas');name.width=256;name.height=64;{const c=name.getContext('2d');c.fillStyle='#fb752b';c.fillRect(0,0,256,64);c.fillStyle='#1d2a30';c.font='bold 30px monospace';c.textAlign='center';c.fillText(owner.name.slice(0,14).toUpperCase(),128,43);}
 const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.6,.4),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(name)}));plate.position.set(-3.99,2.4,-1.8);plate.rotation.y=Math.PI/2;scene.add(plate);
 const furnitureRoot=new THREE.Group();scene.add(furnitureRoot);let pieces=[];
 async function build(){
  furnitureRoot.traverse(n=>{if(n.isMesh&&n.material.userData.roomCopy)n.material.dispose();});furnitureRoot.clear();pieces=[];
  await Promise.all(room.furniture.map(async(f,index)=>{const spec=ITEMS[f.item];if(!spec)return;
   const gltf=await host.template('furniture',spec[0]),object=gltf.scene.clone(true),bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());
   object.scale.setScalar(spec[1]/Math.max(spec[2]==='height'?size.y:Math.max(size.x,size.z),.001));const b=new THREE.Box3().setFromObject(object),c=b.getCenter(new THREE.Vector3());object.position.set(-c.x,-b.min.y,-c.z);
   const wrap=new THREE.Group();wrap.add(object);wrap.position.set(f.x,0,f.z);wrap.rotation.y=f.rot*Math.PI/180;
   object.traverse(n=>{if(!n.isMesh)return;n.castShadow=n.receiveShadow=true;n.userData.piece=index;if(['rug','couch','bed'].includes(f.item)){n.material=n.material.clone();n.material.userData.roomCopy=true;n.material.color.set(MATERIALS.accent[room.materials.accent]);if(f.item==='rug')n.material.map=null;}});
   furnitureRoot.add(wrap);pieces[index]={wrap,f,spec:spec[3]};}));
 }
 function applyLook(){
  floor.material.color.set(MATERIALS.floor[room.materials.floor]);for(const w of walls)w.material.color.set(MATERIALS.walls[room.materials.walls]);
  const l=LIGHTING[room.lighting];scene.background=new THREE.Color(l.sky);hemi.color.set(l.hemi[0]);hemi.groundColor.set(l.hemi[1]);hemi.intensity=l.hemi[2];
  sun.color.set(l.sun[0]);sun.intensity=l.sun[1];sun.position.set(...l.sun[2]);windowPane.material.color.set(l.window);lampLight.intensity=lampOn?l.lamp||6:l.lamp;
  const lamp=room.furniture.find(f=>f.item==='lamp');if(lamp)lampLight.position.set(lamp.x,1.6,lamp.z);
 }
 let lampOn=false;applyLook();await build();
 // The resident: walks on click, uses furniture.
 const me=figure(owner.look);scene.add(me.group);me.group.position.set(1.5,0,2);
 let path=null,pose='idle',poseTarget=null,t=0;
 function goTo(x,z,then){path={x:THREE.MathUtils.clamp(x,-3.6,3.6),z:THREE.MathUtils.clamp(z,-3.6,3.6),then};pose='walk';}
 function use(index){const p=pieces[index];if(!p?.spec)return;const a=p.wrap.rotation.y,dz=p.spec.dz;
  goTo(p.f.x+Math.sin(a)*dz,p.f.z+Math.cos(a)*dz,()=>{pose=p.spec.pose;poseTarget=p;me.group.rotation.y=a+(['sit','lie','work'].includes(pose)?0:Math.PI);if(pose==='toggle'){lampOn=!lampOn;applyLook();pose='idle';}hud.say(p.spec.text);});}
 const hud=roomHud({owner,mine,room,onChange:async()=>{applyLook();await build();},onSave:()=>api('/api/rooms/me',{method:'PUT',body:{room}}),onClose:close,onWave:()=>{pose='wave';t=0;hud.say(`${owner.name} waves back.`);}});
 let moving=null;
 const view={scene,camera,
  // Fit the whole room: portrait screens are width-bound.
  resize(aspect){const h=Math.max(5.2,6.4/aspect);camera.left=-h*aspect;camera.right=h*aspect;const lift=aspect<.8?.42:0;camera.top=h*(1-lift);camera.bottom=-h*(1+lift);camera.updateProjectionMatrix();},
  click(ndc){const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
   if(hud.editing()){const hitFloor=ray.intersectObject(floor)[0],hitPiece=ray.intersectObjects(furnitureRoot.children,true)[0];
    if(moving!==null&&hitFloor){room.furniture[moving].x=+hitFloor.point.x.toFixed(2);room.furniture[moving].z=+hitFloor.point.z.toFixed(2);pieces[moving].wrap.position.set(hitFloor.point.x,0,hitFloor.point.z);hud.select(null);moving=null;applyLook();return;}
    if(hitPiece){moving=hitPiece.object.userData.piece;hud.select(room.furniture[moving].item,()=>{const f=room.furniture[moving];f.rot=(f.rot+90)%360;pieces[moving].wrap.rotation.y=f.rot*Math.PI/180;});}return;}
   if(!mine)return;const hit=ray.intersectObjects([...furnitureRoot.children,floor],true)[0];if(!hit)return;
   if(hit.object.userData.piece!==undefined)use(hit.object.userData.piece);else goTo(hit.point.x,hit.point.z);},
  update(dt){t+=dt;const g=me.group,swing=Math.sin(t*9)*.6;
   if(path){const dx=path.x-g.position.x,dz=path.z-g.position.z,d=Math.hypot(dx,dz),step=dt*2.2;
    if(d<step){g.position.x=path.x;g.position.z=path.z;const then=path.then;path=null;pose='idle';then?.();}else{g.position.x+=dx/d*step;g.position.z+=dz/d*step;g.rotation.y=Math.atan2(dx,dz);}}
   const walking=pose==='walk',sitting=pose==='sit'||pose==='work';
   me.legs.forEach((l,i)=>l.rotation.x=walking?swing*(i?1:-1):sitting?-1.5:0);
   me.arms.forEach((a,i)=>a.rotation.x=walking?-swing*(i?1:-1)*.8:pose==='work'?-1.2+Math.sin(t*14+i)*.08:pose==='read'&&i?-1.6:pose==='water'&&i?-1.1:0);
   me.arms[1].rotation.z=pose==='wave'?2.6+Math.sin(t*10)*.3:0;if(pose==='wave'&&t>2)pose='idle';
   g.rotation.x=pose==='lie'?-Math.PI/2:0;
   g.position.y=pose==='lie'?.75:sitting?(poseTarget?.f.item==='couch'?-.12:-.2):walking?Math.abs(Math.sin(t*9))*.04:Math.sin(t*2)*.01;
  },
  // Furniture shares the city's cached glTF geometry, so only the room's own meshes are freed.
  dispose(){for(const root of [me.group,floor,plate,windowPane,...walls])root.traverse(n=>{if(n.isMesh){n.geometry.dispose();n.material.map?.dispose();n.material.dispose();}});furnitureRoot.traverse(n=>{if(n.isMesh&&n.material.userData.roomCopy)n.material.dispose();});}
 };
 function close(){host.setView(null);hud.remove();view.dispose();}
 host.setView(view);hud.say(mine?`Welcome home, ${owner.name}. Tap anything.`:`You are visiting ${owner.name}.`);
}
const mobile=()=>matchMedia('(max-width:600px)').matches;
// Moodboard HUD in the spirit of a design tool: materials, light, furniture placement.
function roomHud({owner,mine,room,onChange,onSave,onClose,onWave}){
 const el=document.createElement('section');el.className='room-hud';el.setAttribute('aria-label',`${owner.name}'s room`);
 const top=document.createElement('div');top.className='room-top';
 const title=document.createElement('div');title.innerHTML='<span class="eyebrow"></span><strong></strong>';title.querySelector('.eyebrow').textContent=mine?'YOUR ROOM':'VISITING';title.querySelector('strong').textContent=`${owner.name}'s room`;
 const close=Object.assign(document.createElement('button'),{className:'button button-dark',textContent:'Back to the city ←'});close.onclick=onClose;top.append(title,close);
 const bubble=document.createElement('div');bubble.className='room-bubble';bubble.setAttribute('role','status');
 el.append(top,bubble);let editing=false,selected=null;
 if(mine){
  const board=document.createElement('div');board.className='room-board';
  const edit=Object.assign(document.createElement('button'),{className:'button button-orange',textContent:'Edit room'});
  const panel=document.createElement('div');panel.className='room-panel';panel.hidden=true;
  for(const [key,label] of [['floor','Floor'],['walls','Walls'],['accent','Accents']]){const row=document.createElement('fieldset');row.innerHTML='<legend></legend>';row.firstChild.textContent=label;
   for(const [name,color] of Object.entries(MATERIALS[key])){const b=document.createElement('button');b.className='swatch';b.style.background=color;b.title=name.replace('_',' ');b.setAttribute('aria-label',`${label}: ${b.title}`);b.setAttribute('aria-pressed',String(room.materials[key]===name));
    b.onclick=()=>{room.materials[key]=name;row.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));onChange();};row.append(b);}panel.append(row);}
  const light=document.createElement('fieldset');light.innerHTML='<legend>Light</legend>';
  for(const name of Object.keys(LIGHTING)){const b=document.createElement('button');b.className='chip';b.textContent=name;b.setAttribute('aria-pressed',String(room.lighting===name));b.onclick=()=>{room.lighting=name;light.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));onChange();};light.append(b);}
  const hint=document.createElement('p');hint.className='fine';hint.textContent='Tap a piece of furniture, then tap the floor to move it.';
  const rotate=Object.assign(document.createElement('button'),{className:'chip',textContent:'Rotate 90°',hidden:true});
  const save=Object.assign(document.createElement('button'),{className:'button button-orange',textContent:'Save room'});
  save.onclick=async()=>{try{await onSave();editing=false;panel.hidden=true;edit.hidden=false;bubble.textContent='Saved. Visitors see it now.';}catch(err){bubble.textContent=err.message;}};
  panel.append(light,hint,rotate,save);edit.onclick=()=>{editing=true;panel.hidden=false;edit.hidden=true;bubble.textContent='Edit mode: tap furniture to move it.';};
  board.append(edit,panel);el.append(board);
  el.select=(item,onRotate)=>{selected=item;rotate.hidden=!item;rotate.onclick=onRotate;hint.textContent=item?`Moving the ${item}. Tap the floor to place it.`:'Tap a piece of furniture, then tap the floor to move it.';};
 }else{const wave=Object.assign(document.createElement('button'),{className:'button button-orange',textContent:`Say hi to ${owner.name}`});wave.onclick=onWave;el.append(wave);}
 document.body.append(el);
 return {say(text){bubble.textContent=text;},editing:()=>editing,select:(i,r)=>el.select?.(i,r),remove(){el.remove();}};
}
