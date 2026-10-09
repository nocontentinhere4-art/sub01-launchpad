import './style.css';
import * as THREE from 'three';
import {toon,toonify} from './toon.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { places, residence } from './state.js';

import {cityPlots,districts,tower} from './city-state.js';
import {openRoom,attachRoomHost} from './room.js';
import {addResidents} from './residents.js';
import {api,short} from './api.js';
import {listWallets,onWallets,signIn,signOut} from './wallet.js';
import {worldBuildings,sub01Goal,planRoute,frontOf} from './world-sync.js';
import {createCity} from './city.js';

const $ = id => document.getElementById(id);
const mobile = matchMedia('(max-width:600px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
let roomView=null,cityBuildings=[],cityRenderer,world=null,me=null,lookOptions=null,walker=null,goal=null,serverUp=null,worldKey='';
const resident=()=>me?.resident||null;
let selectedPlace = places[0], night = false, follow = false, currentDialog = null, previousFocus = null;
let cityTour=null;
let character, mixer, actions, activeAction, cameraTween = null, toastTimer;
const floorY = 0.24;
const labels = [], interactive = [], cache = new Map();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eee9df');
const camera = new THREE.OrthographicCamera(-18, 18, 18, -18, 0.1, 400);
camera.position.set(27, 31, 35);
const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: false, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
$('world').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 2);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minZoom = .07; controls.maxZoom = 2.8;
controls.minPolarAngle = .3; controls.maxPolarAngle = 1.1;
controls.enablePan = true;
controls.addEventListener('start', () => { cityTour=null;follow = false; cameraTween = null; });
const hemi = new THREE.HemisphereLight('#fff9e9', '#8c9a78', 2.5); scene.add(hemi);
const sunlight = new THREE.DirectionalLight('#fff3da', 3.2);
sunlight.position.set(-12, 24, 13); sunlight.castShadow = true;
sunlight.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
Object.assign(sunlight.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 65 });
sunlight.shadow.bias = -.0008; sunlight.shadow.normalBias = .025; scene.add(sunlight);
const fill = new THREE.DirectionalLight('#ffffff', 1); fill.position.set(15, 10, -10); scene.add(fill);
const roomLight = new THREE.PointLight('#ffb366', 0, 12); roomLight.position.set(-6, 3, -4); scene.add(roomLight);

const geometries = new Map();
function box(w, h, d, color, x, y, z, parent = scene) {
  const key = `${w}/${h}/${d}`;
  if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(w, h, d));
  const object = new THREE.Mesh(geometries.get(key), toon({ color, roughness: .9 }));
  object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
function cylinder(r, h, color, x, y, z, parent = scene) {
  const object = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), toon({ color, roughness: 1 }));
  object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
function sign(text, x, y, z, color = '#fff8e8', scale = 3) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#292d26'; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = color; ctx.font = 'bold 34px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 66, 470);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale / 4), new THREE.MeshBasicMaterial({ map: texture }));
  mesh.position.set(x, y, z); scene.add(mesh); return mesh;
}
function addLabel(place, height) {
  const element = document.createElement('button'); element.className = 'world-label';
  const dot = document.createElement('i'); dot.style.background = place.color;
  element.append(dot, document.createTextNode(place.id === 'home' ? 'SUB-01 / HOME' : place.name.toUpperCase()));
  element.onclick = () => showPlace(place); $('labels').append(element);
  labels.push({ element, position: new THREE.Vector3(place.x, height, place.z) });
}

async function template(kind, name) {
  const url = `/assets/${kind}/${name}.${kind === 'characters' ? 'glb' : 'gltf'}`;
  if (!cache.has(url)) cache.set(url, new GLTFLoader().loadAsync(url).then(gltf=>{toonify(gltf.scene);return gltf;}));
  return cache.get(url);
}
async function model(kind, name, x, z, size, rotation = 0, by = 'width', y = floorY, parent = scene) {
  const data = await template(kind, name), object = data.scene.clone(true);
  const bounds = new THREE.Box3().setFromObject(object), dim = bounds.getSize(new THREE.Vector3());
  const divisor = by === 'height' ? dim.y : Math.max(dim.x, dim.z);
  object.scale.setScalar(size / Math.max(divisor, .001));
  const normalized = new THREE.Box3().setFromObject(object), center = normalized.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group(); object.position.x -= center.x; object.position.z -= center.z; object.position.y -= normalized.min.y;
  wrapper.add(object); wrapper.position.set(x, y, z); wrapper.rotation.y = rotation;
  wrapper.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  parent.add(wrapper); return wrapper;
}

function groundwork() {
  box(28, .65, 26, '#c7c8ad', 0, -.37, 2);
  box(27.7, .18, 25.7, '#aeb697', 0, .045, 2);
  // The central street connects the project's small, walkable parcels.
  box(27.7, .035, 3.5, '#69736c', 0, .165, 1.6);
  box(27.7, .055, .52, '#ded8c5', 0, .175, -.4);
  box(27.7, .055, .52, '#ded8c5', 0, .175, 3.6);
  for (let x = -13; x < 14; x += 2.1) box(.8, .01, .06, '#d9d2bb', x, .19, 1.6);
  for (const x of [-6, 3.4]) box(1.25, .04, 3, '#ddd7c3', x, .18, -1.5);
  for (const x of [-3.5, 8]) box(1.25, .04, 3, '#ddd7c3', x, .18, 5.25);
  for (const p of places) {
    box(p.id === 'home' ? 7.6 : 6.7, .12, p.id === 'home' ? 6.9 : 6.4, '#d9d4bd', p.x, .2, p.z);
  }
  box(3.5, .08, 3.8, '#c6c6a6', -10.5, .2, 8.5);
  for (const x of [-12.1, -8.9]) for (const z of [7, 10]) cylinder(.06, .9, '#f4eada', x, .7, z);
  // Original residential block: shared primitive geometry, no additional textures.
  const apartment=box(2.8,4.1,3,'#eac09b',-10.5,2.35,8.5);
  apartment.userData.place=residence;interactive.push(apartment);
  for(let floor=0;floor<3;floor++){
    for(const x of [-11.3,-10.1])box(.55,.6,.04,'#76968d',x,1+floor*1.05,10.03);
    box(3,.12,.55,'#e8dec9',-10.5,.65+floor*1.05,10.1);
  }
  box(3.1,.2,3.2,'#59665c',-10.5,4.5,8.5);
  sign('ORANGE / 03',-10.5,.55,10.05,'#ffac70',2.2);
  addLabel(residence,5.1);
  // Low-cost stylized trees supplement the downloaded city kit.
  const positions = [[-12,-7],[-11,5],[-12,12],[12,-6],[12,12],[1,12],[6,-9],[-1,-8]];
  for (const [x,z] of positions) {
    cylinder(.12, 1.2, '#8c6f50', x, .8, z);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.95, 0),toon({ color: '#879b70', roughness: 1 }));
    crown.scale.y = 1.2; crown.position.set(x, 1.8, z); crown.castShadow = true; scene.add(crown);
  }
}
async function makeHome() {
  const p = places[0];
  box(7, .09, 6.3, '#e9d8b9', p.x, .28, p.z);
  for (let x = -9.4; x < -2.8; x += .55) box(.018,.01,6.2,'#d7c29f',x,.335,-4);
  // Cutaway walls keep the room legible from the isometric camera.
  box(7,2.7,.16,'#ece6d7',-6,1.68,-7.1);
  box(.16,2.7,6.3,'#ece6d7',-9.45,1.68,-4);
  box(7,.18,.2,'#cbc3b0',-6,3.1,-7.1);
  box(.2,.18,6.3,'#cbc3b0',-9.45,3.1,-4);
  box(1.6,1.3,.03,'#a6c2bb',-7.8,1.8,-7.0);
  box(.07,1.35,.07,'#f9f6eb',-7.8,1.8,-6.96);
  box(1.65,.07,.07,'#f9f6eb',-7.8,1.8,-6.95);
  sign('SUB-01', -4.8, 2.1, -6.99, '#ff953e', 1.8);
  await Promise.all([
    model('furniture','bed_single_A',-8,-5.5,2.35,Math.PI/2,'width',.335),
    model('furniture','table_medium',-4.5,-5.8,2.05,0,'width',.335),
    model('furniture','chair_A',-4.5,-4.55,.83,Math.PI,'width',.335),
    model('furniture','couch',-8,-2.5,2.1,Math.PI/2,'width',.335),
    model('furniture','cactus_small_A',-3.4,-2.1,.65,0,'height',.335),
    model('furniture','shelf_B_small_decorated',-9.1,-4,1.4,Math.PI/2,'height',.335),
    model('furniture','lamp_standing',-3.1,-6.4,1.7,0,'height',.335),
    model('furniture','rug_rectangle_A',-6,-3.6,2.45,0,'width',.337),
  ]);
  // The desk monitor is deliberately inexpensive geometry.
  box(.13,.4,.13,'#3c4240',-4.5,1.48,-6.1);
  box(1,.65,.08,'#313a38',-4.5,1.82,-6.1);
  box(.86,.51,.01,'#ff883e',-4.5,1.82,-6.045);
  box(.6,.025,.22,'#48504a',-4.5,1.23,-5.8);
  const pick = box(7,.03,6.3,'#e9d8b9',p.x,.32,p.z); pick.userData.place = p; interactive.push(pick);
  addLabel(p,3.25);
}
async function makeBuildings() {
  await Promise.all(places.slice(1).map(async (p,i) => {
    const object = await model('city', ['building_C_withoutBase','building_B_withoutBase','building_A_withoutBase'][i],p.x,p.z,4.7);
    object.userData.place = p; object.traverse(n => { if(n.isMesh) {n.userData.place = p;interactive.push(n);} });
    const height = new THREE.Box3().setFromObject(object).max.y;
    addLabel(p,height+.6);
    sign(['WORKSHOP','BAD IDEA ARCADE','MIDNIGHT STUDIO'][i],p.x,1.3,p.z+2.5,p.id === 'arcade' ? '#ffae6c' : '#f0ecd8',3.3);
  }));
  await Promise.all([
    model('city','bench',-11.4,4.9,1.7,0),
    model('city','streetlight',-1,.15,3,0,'height'),
    model('city','streetlight',10.8,3.8,3,Math.PI,'height'),
    model('city','car_hatchback',-10.5,1.7,2.5,Math.PI/2),
    ...[[-2,-6],[6,-5],[10,9],[-6,11]].map(([x,z])=>model('city','bush',x,z,1.3)),
  ]);
}
async function makeCharacter() {
  const data = await template('characters','Casual_Hoodie');
  character = cloneSkeleton(data.scene);
  const bounds = new THREE.Box3().setFromObject(character), size = bounds.getSize(new THREE.Vector3());
  character.scale.setScalar(1.55/size.y);
  character.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true; node.receiveShadow = true;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    node.material = mats.map(m => { const mat=m.clone(); if (['Purple','LightBlue'].includes(m.name)) {mat.color.set('#313a37'); mat.map=null;} if(m.name==='Hair'){mat.color.set('#202a26'); mat.map=null;} return mat; });
    if (!Array.isArray(node.material) || node.material.length===1) node.material = node.material[0];
  });
  character.position.set(-6,.335,-2.4); character.rotation.y = .5; scene.add(character);
  mixer = new THREE.AnimationMixer(character); actions = {};
  for (const clip of data.animations) actions[clip.name]=mixer.clipAction(clip);
  play('Idle');
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.17),toon({ color: '#ff7b32', emissive: '#ff7620', emissiveIntensity: .25, roughness:.5 }));
  marker.position.set(0,size.y*character.scale.x+.5,0);
  // Marker sits in scene units so it is not affected by the imported rig scale.
  scene.add(marker); character.userData.marker=marker;
  $('activity-text').textContent='At home. Waiting for the first brief.';
}
function play(name) {
  const next=actions?.[name] || actions?.Idle;
  if (!next || next===activeAction) return;
  next.reset().play(); if(activeAction) activeAction.crossFadeTo(next,.2,false); activeAction=next;
}

function renderList() {
  $('project-list').replaceChildren();
  const district=$('district-select').value;
  const available=cityPlots.filter(p=>!district||p.district===district).map(placeFor);
  const mine=new Set(me?.plots?.map(p=>p.plotId)||[]),landmarks=[tower,...places];
  const yours=available.filter(p=>p.claimed&&mine.has(p.id)),others=available.filter(p=>p.claimed&&!mine.has(p.id));
  for (const p of district?[...yours,...others,...landmarks,...available.filter(p=>!p.claimed)]:[...yours,...landmarks,...others]) {
    const button=document.createElement('button');button.className='project-row';button.setAttribute('aria-label',`Open ${p.name}`);
    const icon=document.createElement('span');icon.className='project-symbol';icon.textContent=p.symbol;icon.style.background=p.color+'25';icon.style.color=p.color;
    const meta=document.createElement('span');meta.className='project-meta';
    const title=document.createElement('span');title.className='project-title';title.textContent=p.name;
    const status=document.createElement('span');status.className='project-status';status.textContent=p.status;
    meta.append(title,status);const arrow=document.createElement('span');arrow.className='project-arrow';arrow.textContent='↗';
    button.append(icon,meta,arrow);button.onclick=()=>showPlace(p);$('project-list').append(button);
  }
  $('project-count').textContent=String(cityBuildings.filter(b=>b.type==='project').length).padStart(2,'0');
}
function openDialog(id) {
  previousFocus=document.activeElement;currentDialog=$(id);currentDialog.hidden=false;
  currentDialog.querySelector('button,input')?.focus();
}
function closeDialog() {
  if(currentDialog) currentDialog.hidden=true;currentDialog=null;
  previousFocus?.focus();
}
// A plot as the city sees it: server building data layered on the static address.
function placeFor(plot){
  const b=cityBuildings.find(b=>b.plotId===plot.id);if(!b)return plot;
  const mine=me?.plots?.some(p=>p.plotId===plot.id);
  if(b.type==='apartment')return{...plot,name:b.name+"'s apartment",kind:`RESIDENT / ${plot.districtName}`,status:mine?'Your home':'Home of '+b.name,description:mine?'Your apartment. Enter to arrange your room.':`${b.name} lives here.`,color:'#69a694',claimed:true,building:b,mine};
  return{...plot,name:b.name,kind:`PROJECT / ${plot.districtName}`,status:b.stageLabel+(b.ticker?' · $'+b.ticker:''),description:{thinking:'SUB-01 is deciding whether to build it.',scaffold:'SUB-01 is building it right now.',stopped:'Work stopped; it needs attention.',review:'Built. Waiting for its author to review.',launch:'Getting ready to launch.',open:'Launched. Its building is open.'}[b.phase],color:'#fb752b',claimed:true,building:b,mine};
}
function showPlace(p) {
  if(p.id&&cityPlots.some(c=>c.id===p.id))p=placeFor(cityPlots.find(c=>c.id===p.id));
  selectedPlace=p;const b=p.building,project=b?.type==='project';
  $('detail-progress').hidden=!project;if(project)$('detail-progress').firstElementChild.style.width=Math.round(b.progress*100)+'%';
  $('detail-fees-box').hidden=!project;$('detail-milestones').hidden=!!b;
  $('detail-disclosure').textContent=project?'Creator fees are fixed at launch: 80% to the idea author, 20% to SUB-01. The token is created by the author\'s own wallet signature.':b?'':'Example place. Real projects appear when someone drops an idea in SUB-01\'s mailbox.';
  $('takeover-button').hidden=true;$('detail-roles').hidden=true;
  if(project&&b.slug)loadRoles(b);$('detail-name').textContent=p.name;$('detail-category').textContent=p.kind;
  $('detail-description').textContent=p.description;$('detail-state').textContent=p.status;
  $('detail-icon').textContent=p.symbol;$('detail-icon').style.background=p.color+'25';$('detail-icon').style.color=p.color;
  $('visit-button').textContent=b?.type==='apartment'?(p.mine?'Enter your room →':'Visit '+b.name+'\'s room →'):project?(b.slug?(p.mine?'Open your office ↗':'Open project page ↗'):'Watch the site →'):cityPlots.some(l=>l.id===p.id)?'Drop an idea here →':'Visit this place →';
  openDialog('detail-backdrop');
}
function focusPlace(p) {
  cityTour=null;follow=false;
  if(p.x===undefined){notify('Your brief is saved here. Building integration comes next.');return;}
  cameraTween={ start: controls.target.clone(), target: new THREE.Vector3(p.x,p.id==='tower'?14:2,p.z), zoom:camera.zoom, endZoom:p.id==='tower'?.7:1.65, elapsed:0 };
}
function notify(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4500);}
function meetDev(){cityTour=null;if(!character)return;follow=true;camera.zoom=mobile?1.1:1.5;camera.updateProjectionMatrix();notify(goal?.text||'Following SUB-01.');}
function resize(){const w=innerWidth,h=innerHeight,aspect=w/h;const half=mobile?18:16.5;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(w,h);roomView?.resize(aspect);}
function resetView(){cityTour=null;follow=false;cameraTween=null;camera.position.set(85,100,110);controls.target.set(0,8,-7);camera.zoom=mobile?.09:.20;camera.updateProjectionMatrix();controls.update();}

// The mailbox needs a signed-in resident. Each step opens the next one.
async function openBuildForm(plot){
 if(!serverUp){notify('The city server is offline. Ideas cannot be dropped right now.');return;}
 if(!me?.user){openSignIn(()=>openBuildForm(plot));return;}
 if(!resident()){openCreator(()=>openBuildForm(plot));return;}
 const free=cityPlots.filter(p=>!cityBuildings.some(b=>b.plotId===p.id));
 if(!free.length){notify('Every address is taken right now.');return;}
 $('plot-address').replaceChildren(...free.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name+(p.vacant?' / open lot':'');return o;}));
 $('plot-address').value=(plot&&free.some(p=>p.id===plot.id)?plot:free.find(p=>p.vacant)||free[0]).id;
 if(!$('idea-wallet').value)$('idea-wallet').value=me.user.wallet;$('form-error').textContent='';openDialog('idea-backdrop');
}
function openSignIn(next){
 const draw=()=>{const list=listWallets();$('wallet-list').replaceChildren(...(list.length?list.map(w=>{const b=document.createElement('button');b.className='wallet-option';if(w.icon){const i=document.createElement('img');i.src=w.icon;i.alt='';b.append(i);}b.append(document.createTextNode(w.name));
  b.onclick=async()=>{$('signin-error').textContent='';try{await signIn(w.name);await refreshMe();closeDialog();notify('Signed in.');next?.();}catch(err){$('signin-error').textContent=err.message;}};return b;}):[Object.assign(document.createElement('p'),{className:'fine',textContent:'No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, then reload.'})]));};
 draw();onWallets(draw);openDialog('signin-backdrop');
}
async function refreshMe(){try{me=await api('/api/me');if(typeof me?.user!=='object')me=null;}catch{me=null;}$('account-button').textContent=me?.user?(resident()?.name||short(me.user.wallet)):'Sign in';renderList();updateResident();}
function openCreator(next){
 if(!lookOptions){notify('The city server is offline.');return;}
 const r=resident(),look=r?.look||{};$('resident-name').value=r?.name||'';$('resident-error').textContent='';
 const fields=$('look-fields');fields.replaceChildren();
 for(const [key,label] of [['skin','Skin'],['hair','Hair colour'],['hairStyle','Hair'],['outfit','Outfit'],['top','Top'],['bottom','Bottom']]){
  const values=lookOptions.look?.[key]||[];if(!values.length)continue;
  const group=document.createElement('fieldset');group.className='swatches';const legend=document.createElement('legend');legend.textContent=label;group.append(legend);
  values.forEach((v,i)=>{const id=`look-${key}-${i}`,input=Object.assign(document.createElement('input'),{type:'radio',name:key,value:v,id,checked:look[key]?look[key]===v:i===0});const l=document.createElement('label');l.htmlFor=id;
   if(/^#[0-9a-f]{6}$/i.test(v)){l.style.background=v;l.title=v;l.className='swatch';}else{l.textContent=v;l.className='chip';}group.append(input,l);});
  fields.append(group);
 }
 const taken=new Set(cityBuildings.map(b=>b.plotId));if(r?.plotId)taken.delete(r.plotId);
 $('resident-plot').replaceChildren(...cityPlots.filter(p=>!taken.has(p.id)).map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));
 if(r?.plotId)$('resident-plot').value=r.plotId;
 $('resident-form').onsubmit=async e=>{e.preventDefault();const f=e.target,look={};for(const k of ['skin','hair','hairStyle','outfit','top','bottom']){const c=f.querySelector(`input[name=${k}]:checked`);if(c)look[k]=c.value;}
  try{await api('/api/residents',{method:'POST',body:{name:$('resident-name').value,look,plotId:$('resident-plot').value}});await refreshMe();await pollWorld();closeDialog();notify(`Welcome to Tokyo, ${resident()?.name}.`);next?.();}catch(err){$('resident-error').textContent=err.message;}};
 openDialog('resident-backdrop');
}
async function loadRoles(b){
 try{const r=await api(`/api/projects/${encodeURIComponent(b.slug)}/roles`);if(selectedPlace?.building!==b)return;
  const box=$('detail-roles');box.replaceChildren(...(r.roles||[]).map(x=>{const row=document.createElement('span');row.textContent=`${x.role.replace('_',' ')} · ${x.wallet}`;return row;}));
  if(r.openTakeover){const t=document.createElement('span');t.className='takeover-open';t.textContent='Community takeover proposed: '+(r.openTakeover.reason||'');box.append(t);}
  box.hidden=!box.children.length;$('takeover-button').hidden=!(b.launched&&me?.user&&!selectedPlace.mine&&!r.openTakeover);
 }catch{}
}
$('takeover-button').onclick=async()=>{
 const b=selectedPlace?.building;if(!b?.slug)return;if(!me?.user){openSignIn();return;}
 const reason=prompt('Why should the community take over this project? (shown publicly)\n\nA takeover changes who manages the project. It never changes who receives creator fees: they were fixed on-chain at launch.');
 if(!reason)return;try{const r=await api(`/api/projects/${encodeURIComponent(b.slug)}/takeover`,{method:'POST',body:{reason}});notify(r?.notice||'Takeover proposed. The founder decides.');loadRoles(b);}catch(err){notify(err.message);}
};
$('account-button').onclick=()=>{if(!me?.user){openSignIn();return;}if(!resident()){openCreator();return;}const home=frontOf(resident().plotId);if(home){follow=false;cameraTween={start:controls.target.clone(),target:new THREE.Vector3(home.x,2,home.z),zoom:camera.zoom,endZoom:mobile?.8:1.3,elapsed:0};}showPlace({id:resident().plotId});};
$('signin-close').onclick=$('resident-close').onclick=closeDialog;
$('idea-button').onclick=()=>openBuildForm();
$('city-tour').onclick=()=>{cityTour={index:0,elapsed:0};nextCityView();};
const cityViews=[{x:-29,z:-28,y:12,zoom:.63,text:'Tokyo Tower / Shiba'},{x:29,z:2,y:4,zoom:.72,text:'Shibuya / Neon crossing'},{x:55,z:-58,y:16,zoom:.48,text:'Broadcast tower / Skyline'},{x:79,z:2,y:1,zoom:.56,text:'Waterfront / Bridges'},{x:-26,z:78,y:4,zoom:.56,text:'Metro / City in motion'}];
function nextCityView(){const v=cityViews[cityTour.index];follow=false;cameraTween={start:controls.target.clone(),target:new THREE.Vector3(v.x,v.y,v.z),zoom:camera.zoom,endZoom:mobile?v.zoom*.55:v.zoom,elapsed:0};$('activity-text').textContent=v.text;}

$('district-select').onchange=()=>{cityTour=null;renderList();const d=districts.find(d=>d.id===$('district-select').value);if(d){follow=false;cameraTween={start:controls.target.clone(),target:new THREE.Vector3(d.x,2,d.z),zoom:camera.zoom,endZoom:mobile?.36:.72,elapsed:0};}else resetView();};
$('home-view').onclick=()=>focusPlace(places[0]);
$('tower-view').onclick=()=>focusPlace(tower);
$('idea-close').onclick=$('detail-close').onclick=closeDialog;
for(const id of ['idea-backdrop','detail-backdrop','signin-backdrop','resident-backdrop']) $(id).onclick=e=>{if(e.target===$(id))closeDialog();};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeDialog();
  if(e.key==='Tab'&&currentDialog){const nodes=[...currentDialog.querySelectorAll('button,input,textarea,select')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
});
$('visit-button').onclick=()=>{
 const p=selectedPlace,b=p?.building;closeDialog();
 if(b?.type==='apartment'){openRoom({plotId:p.id,mine:p.mine,me,onEdit:()=>openCreator()});return;}
 if(b?.type==='project'){if(b.slug)open(`/projects/${encodeURIComponent(b.slug)}${p.mine?'/review':''}`,'_blank','noopener');else focusPlace(p);return;}
 if(cityPlots.some(c=>c.id===p.id)){openBuildForm(p);return;}
 focusPlace(p);
};
function updateResident(){if(world)residents.set(residentList());}
$('idea-form').onsubmit=async e=>{
 e.preventDefault();$('form-error').textContent='';
 const body={plotId:$('plot-address').value,title:$('idea-title-input').value,concept:$('idea-concept').value,nameSuggestion:$('idea-name').value,tickerSuggestion:$('idea-ticker').value,receivingWallet:$('idea-wallet').value.trim(),rightsConfirmed:$('idea-rights').checked};
 try{await api('/api/ideas',{method:'POST',body});closeDialog();$('idea-form').reset();await Promise.all([refreshMe(),pollWorld()]);
  const p=cityPlots.find(p=>p.id===body.plotId);focusPlace(p);notify('In his mailbox. SUB-01 will decide whether to build it.');
 }catch(err){const errors=err.body?.details?.errors||err.body?.errors;$('form-error').textContent=errors?Object.entries(errors).map(([k,v])=>`${k}: ${v}`).join(' · '):err.message;}
};
$('tour-button').onclick=meetDev;
$('follow-button').onclick=()=>{if(!character)return;follow=!follow;if(follow){camera.zoom=1.7;camera.updateProjectionMatrix();}notify(follow?'Following SUB-01.':'Free camera.');};
for(const [id,factor] of [['zoom-in',1.2],['zoom-out',1/1.2]])$(id).onclick=()=>{cityTour=null;camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.07,2.8);camera.updateProjectionMatrix();};
$('reset-view').onclick=resetView;
$('day-night').onclick=()=>{
  night=!night;scene.background.set(night?'#112638':'#eee9df');hemi.intensity=night?1.5:2.5;hemi.color.set(night?'#8bbacd':'#fff9e9');sunlight.intensity=night?.7:3.2;roomLight.intensity=night?7:0;cityRenderer?.setNight(night);
  $('day-night').textContent=night?'☀':'☾';$('day-night').setAttribute('aria-label',night?'Switch to day':'Switch to night');document.body.classList.toggle('is-night',night);
};
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);if(roomView){roomView.click(pointer);return;}raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(interactive,false)[0];if(hit&&cityRenderer?.select(hit))return;if(hit?.object.userData.place)showPlace(hit.object.userData.place);
});
$('district-select').replaceChildren();const all=document.createElement('option');all.value='';all.textContent='Entire city';$('district-select').append(all);for(const d of districts){const option=document.createElement('option');option.value=d.id;option.textContent=d.name;$('district-select').append(option);}
addEventListener('resize',resize);resize();resetView();renderList();groundwork();cityRenderer=createCity(scene,interactive,showPlace,cityBuildings,{mobile});addLabel(tower,32);
for(const d of districts){const element=document.createElement('button');element.className='world-label district-label';element.textContent=d.name.toUpperCase();element.onclick=()=>{$('district-select').value=d.id;$('district-select').onchange();};$('labels').append(element);labels.push({element,district:true,position:new THREE.Vector3(d.x,.4,d.z+11.4)});}

// Shared world: the server is the source of truth; the city redraws only when something changed.
const residents=addResidents(scene),worldLabels=[];
// Rooms borrow this renderer; the city stops updating while one is open.
attachRoomHost({template,notify,setView(view){roomView=view;controls.enabled=!view;document.body.classList.toggle('in-room',!!view);if(view)view.resize(innerWidth/innerHeight);}});
function residentList(){return cityBuildings.filter(b=>b.type==='apartment').map(b=>{const f=frontOf(b.plotId);return f&&{x:f.x+1.2,z:f.z,look:b.resident.look||{}};}).filter(Boolean);}
function setServer(up){if(up===serverUp)return;serverUp=up;$('server-status').textContent=up?'LIVE CITY':'SERVER OFFLINE';$('activity-label').textContent=up?'SUB-01 · LIVE':'SUB-01 · OFFLINE';$('server-badge').classList.toggle('is-offline',!up);if(!up)$('activity-text').textContent='The city server is offline. Nothing here is live right now.';}
async function pollWorld(){
 let next;try{next=await api('/api/world');if(!Array.isArray(next?.plots))throw new Error('not the city server');if(!lookOptions)lookOptions=await api('/api/world/options');setServer(true);}catch{setServer(false);return;}
 world=next;const items=worldBuildings(world),key=JSON.stringify(items);
 if(key!==worldKey){worldKey=key;
  const opened=items.filter(b=>b.phase==='open'&&!cityBuildings.some(o=>o.plotId===b.plotId&&o.phase==='open'));
  cityBuildings=items;cityRenderer.redraw(items);residents.set(residentList());renderList();
  for(const l of worldLabels){l.element.remove();labels.splice(labels.indexOf(l),1);}worldLabels.length=0;
  for(const b of items.filter(b=>b.type==='project')){const plot=cityPlots.find(p=>p.id===b.plotId);addLabel({...placeFor(plot),name:b.ticker?`${b.name} · $${b.ticker}`:b.name,color:b.phase==='open'?'#ffcf6e':'#fb752b'},b.phase==='open'?10.6:b.phase==='thinking'?4.2:Math.max(3,8*b.progress)+2.4);worldLabels.push(labels.at(-1));}
  if(opened.length&&worldKey&&$('activity-text'))notify(`${opened[0].name} just opened its doors.`);
 }
 const g=sub01Goal(world);
 if(character&&(!goal||g.x!==goal.x||g.z!==goal.z)){walker={points:planRoute(character.position,g),index:1};}
 goal=g;if(serverUp)$('activity-text').textContent=world.news?.[0]?`${g.text} · ${world.news[0].text}`:g.text;
}
const clock=new THREE.Clock();let lastRender=0;
function animate(now){
  requestAnimationFrame(animate);
  if(document.hidden||now-lastRender<(mobile?1000/30:1000/45))return;
  lastRender=now;
  if(roomView){roomView.update(Math.min(clock.getDelta(),.08));renderer.render(roomView.scene,roomView.camera);return;}
  cityRenderer?.update(reducedMotion?0:now*.001);const dt=Math.min(clock.getDelta(),.08);mixer?.update(dt);residents.update(reducedMotion?0:now*.001);
  if(walker&&character){
    const target=walker.points[walker.index],pos=character.position,dx=target.x-pos.x,dz=target.z-pos.z,dist=Math.hypot(dx,dz),stepLen=dt*(walker.points.length>3?4.2:2.4);
    if(dist<=stepLen){pos.x=target.x;pos.z=target.z;walker.index++;if(walker.index>=walker.points.length){walker=null;play(goal?.activity==='build'?'Interact':goal?.activity==='desk'?'Idle_Neutral':'Idle');}}
    else{pos.x+=dx/dist*stepLen;pos.z+=dz/dist*stepLen;character.rotation.y=Math.atan2(dx,dz);play(walker.points.length>3?'Run':'Walk');}
  }
  if(character){const m=character.userData.marker;m.position.copy(character.position);m.position.y+=2+(reducedMotion?0:Math.sin(now*.002)*.04);m.rotation.y=now*.0005;if(follow){const before=controls.target.clone();controls.target.lerp(character.position,.07);camera.position.add(controls.target.clone().sub(before));}}
  if(cameraTween){cameraTween.elapsed+=dt;const t=Math.min(cameraTween.elapsed/.75,1),ease=1-(1-t)**3;const before=controls.target.clone();controls.target.lerpVectors(cameraTween.start,cameraTween.target,ease);camera.position.add(controls.target.clone().sub(before));camera.zoom=THREE.MathUtils.lerp(cameraTween.zoom,cameraTween.endZoom,ease);camera.updateProjectionMatrix();if(t===1)cameraTween=null;}
  if(cityTour){cityTour.elapsed+=dt;if(cityTour.elapsed>5){cityTour.elapsed=0;cityTour.index++;if(cityTour.index>=cityViews.length){cityTour=null;resetView();$('activity-text').textContent='Your idea. Your city. Choose an address.';}else nextCityView();}}
  controls.update();renderer.render(scene,camera);
  for(const label of labels){if(label.district&&(camera.zoom>.9||(camera.zoom<.25&&!['SHIBUYA','SHINJUKU','AKIHABARA','ODAIBA','GINZA'].includes(label.element.textContent)))){label.element.hidden=true;continue;}if(camera.zoom<.5&&!label.district&&label.element.textContent.indexOf('Tokyo Tower'.toUpperCase())===-1){label.element.hidden=true;continue;}const p=label.position.clone().project(camera);label.element.style.left=`${(p.x*.5+.5)*innerWidth}px`;label.element.style.top=`${(-p.y*.5+.5)*innerHeight}px`;label.element.hidden=p.z>1||p.z< -1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;}
}
requestAnimationFrame(animate);
async function initialize(){try{
  await Promise.all([makeHome(),makeBuildings(),makeCharacter()]);
  await refreshMe();await pollWorld();setInterval(pollWorld,4000);
  $('loading').classList.add('is-ready');
  // Browser-visible diagnostics are limited to rendering; no wallet or account data.
  renderer.domElement.dataset.ready='true';
}catch(error){
  console.error('Neighborhood asset loading failed',error);
  $('loading-text').textContent='An asset could not load. Reload to try again.';
}}
initialize();
