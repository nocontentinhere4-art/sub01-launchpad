import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { places, readDrafts, tourStops, residence, RESIDENT_KEY, readResident, validateResident } from './state.js';

import {cityPlots,districts,tower,CITY_KEY,readBuildings,createBuilding,plotView} from './city-state.js';
import {createCity} from './city.js';

const $ = id => document.getElementById(id);
const mobile = matchMedia('(max-width:600px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
let drafts = readDrafts(localStorage);
let cityBuildings=readBuildings(localStorage),cityRenderer,selectedLot=null;
let resident = readResident(localStorage), residentCharacter, residentMixer;
let selectedPlace = places[0], night = false, follow = false, currentDialog = null, previousFocus = null;
let character, mixer, actions, activeAction, tour = null, cameraTween = null, toastTimer;
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
controls.minZoom = .12; controls.maxZoom = 2.8;
controls.minPolarAngle = .3; controls.maxPolarAngle = 1.1;
controls.enablePan = true;
controls.addEventListener('start', () => { follow = false; cameraTween = null; });
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
  const object = new THREE.Mesh(geometries.get(key), new THREE.MeshStandardMaterial({ color, roughness: .9 }));
  object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
function cylinder(r, h, color, x, y, z, parent = scene) {
  const object = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
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
  if (!cache.has(url)) cache.set(url, new GLTFLoader().loadAsync(url));
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
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.95, 0),new THREE.MeshStandardMaterial({ color: '#879b70', roughness: 1 }));
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
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.17),new THREE.MeshStandardMaterial({ color: '#ff7b32', emissive: '#ff7620', emissiveIntensity: .25, roughness:.5 }));
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
  const available=cityPlots.filter(p=>!district||p.district===district).map(p=>plotView(p,cityBuildings));
  const landmarks=[tower,...places,{...residence, name:resident?resident.name+' / 03':residence.name,status:resident?'$'+resident.ticker+' · concept':residence.status},...drafts.map(d=>({ ...d, kind:'YOUR DRAFT', symbol:'+', color:'#d6a577', description:d.idea }))];
  for (const p of district?[...available,...landmarks]:[...available.filter(p=>p.claimed),...landmarks,...available.filter(p=>!p.claimed)]) {
    const button=document.createElement('button');button.className='project-row';button.setAttribute('aria-label',`Open ${p.name}`);
    const icon=document.createElement('span');icon.className='project-symbol';icon.textContent=p.symbol;icon.style.background=p.color+'25';icon.style.color=p.color;
    const meta=document.createElement('span');meta.className='project-meta';
    const title=document.createElement('span');title.className='project-title';title.textContent=p.name;
    const status=document.createElement('span');status.className='project-status';status.textContent=p.status;
    meta.append(title,status);const arrow=document.createElement('span');arrow.className='project-arrow';arrow.textContent='↗';
    button.append(icon,meta,arrow);button.onclick=()=>showPlace(p);$('project-list').append(button);
  }
  $('project-count').textContent=String(places.length+2+drafts.length+available.length).padStart(2,'0');
}
function openDialog(id) {
  previousFocus=document.activeElement;currentDialog=$(id);currentDialog.hidden=false;
  currentDialog.querySelector('button,input')?.focus();
}
function closeDialog() {
  if(currentDialog) currentDialog.hidden=true;currentDialog=null;
  previousFocus?.focus();
}
function showPlace(p) {
  selectedPlace=p;$('detail-name').textContent=p.name;$('detail-category').textContent=p.kind;
  $('detail-description').textContent=p.description;$('detail-state').textContent=p.status;
  $('detail-icon').textContent=p.symbol;$('detail-icon').style.background=p.color+'25';$('detail-icon').style.color=p.color;
  $('visit-button').textContent=cityPlots.some(l=>l.id===p.id)?(p.claimed?'Visit your building →':'Take this address →'):p.id==='residence'?'Try your own apartment →':p.x===undefined?'View the brief':'Visit this place →';
  openDialog('detail-backdrop');
}
function focusPlace(p) {
  follow=false;
  if(p.x===undefined){notify('Your brief is saved here. Building integration comes next.');return;}
  cameraTween={ start: controls.target.clone(), target: new THREE.Vector3(p.x,p.id==='tower'?8:2,p.z), zoom:camera.zoom, endZoom:p.id==='tower'?1:1.65, elapsed:0 };
}
function notify(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4500);}
function startTour(){if(!character)return;tour={ index:0, elapsed:0, from:character.position.clone() };$('tour-button').disabled=true;play('Wave');$('activity-text').textContent=tourStops[0].text;follow=false;}
function resize(){const w=innerWidth,h=innerHeight,aspect=w/h;const half=mobile?18:16.5;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(w,h);}
function resetView(){follow=false;cameraTween=null;camera.position.set(85,100,110);controls.target.set(0,6,-6);camera.zoom=mobile?.14:.29;camera.updateProjectionMatrix();controls.update();}

function openBuildForm(plot){
 selectedLot=plot||cityPlots.find(p=>!cityBuildings.some(b=>b.plotId===p.id));
 if(!selectedLot){notify('Every address in this local preview is taken.');return;}
 $('plot-address').replaceChildren();
 for(const p of cityPlots.filter(p=>!cityBuildings.some(b=>b.plotId===p.id))){const option=document.createElement('option');option.value=p.id;option.textContent=p.name+' / '+(p.vacant?'Open lot':'Building');$('plot-address').append(option);}
 $('plot-address').value=selectedLot.id;$('form-error').textContent='';openDialog('idea-backdrop');
}
$('idea-button').onclick=()=>openBuildForm();
$('district-select').onchange=()=>{renderList();const d=districts.find(d=>d.id===$('district-select').value);if(d){follow=false;cameraTween={start:controls.target.clone(),target:new THREE.Vector3(d.x,2,d.z),zoom:camera.zoom,endZoom:mobile?.36:.72,elapsed:0};}else resetView();};
$('home-view').onclick=()=>focusPlace(places[0]);
$('tower-view').onclick=()=>focusPlace(tower);
$('idea-close').onclick=$('detail-close').onclick=closeDialog;
for(const id of ['idea-backdrop','detail-backdrop']) $(id).onclick=e=>{if(e.target===$(id))closeDialog();};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeDialog();
  if(e.key==='Tab'&&currentDialog){const nodes=[...currentDialog.querySelectorAll('button,input,textarea,select')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
});
$('visit-button').onclick=()=>{closeDialog();if(cityPlots.some(p=>p.id===selectedPlace.id)&&!selectedPlace.claimed){openBuildForm(selectedPlace);return;}focusPlace(selectedPlace);if(selectedPlace.id==='residence'){if(resident){$('resident-name').value=resident.name;$('resident-ticker').value=resident.ticker;$('resident-color').value=resident.color;}openDialog('resident-backdrop');}};
$('resident-close').onclick=closeDialog;
$('resident-backdrop').onclick=e=>{if(e.target===$('resident-backdrop'))closeDialog();};
$('resident-form').onsubmit=e=>{e.preventDefault();try{
 const next=validateResident($('resident-name').value,$('resident-ticker').value,$('resident-color').value);
 localStorage.setItem(RESIDENT_KEY,JSON.stringify(next));resident=next;renderList();updateResident();closeDialog();$('resident-error').textContent='';notify('Welcome, '+resident.name+'. Your demo apartment is ready.');
}catch(error){$('resident-error').textContent=error.message;}};
function updateResident(){
 if(!residentCharacter)return;residentCharacter.visible=!!resident;
 const color={orange:'#fb752b',mint:'#69a694',violet:'#9390c4'}[resident?.color];
 if(color)residentCharacter.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(['Purple','LightBlue'].includes(m.name))m.color.set(color);});
}
async function makeResident(){
 const data=await template('characters','Casual_Hoodie');residentCharacter=cloneSkeleton(data.scene);
 const size=new THREE.Box3().setFromObject(residentCharacter).getSize(new THREE.Vector3());residentCharacter.scale.setScalar(1.4/size.y);
 residentCharacter.traverse(n=>{if(n.isMesh){n.castShadow=true;const mats=Array.isArray(n.material)?n.material:[n.material];const copies=mats.map(m=>{const c=m.clone();if(['Purple','LightBlue'].includes(m.name))c.map=null;return c;});n.material=Array.isArray(n.material)?copies:copies[0];}});
 residentCharacter.position.set(-10.5,.3,11.2);scene.add(residentCharacter);residentMixer=new THREE.AnimationMixer(residentCharacter);
 const clip=data.animations.find(a=>a.name==='Idle');if(clip)residentMixer.clipAction(clip).play();updateResident();
}
$('idea-form').onsubmit=e=>{
 e.preventDefault();try{
  const building=createBuilding($('plot-address').value,$('project-name').value,$('project-idea').value,$('building-ticker').value,$('building-type').value,$('building-color').value,cityBuildings);
  const next=[...cityBuildings,building];localStorage.setItem(CITY_KEY,JSON.stringify(next));cityBuildings=next;cityRenderer.redraw(next);renderList();closeDialog();$('idea-form').reset();
  const p=plotView(cityPlots.find(p=>p.id===building.plotId),cityBuildings);addLabel(p,building.type==='project'?8.7:building.type==='studio'?4.7:6.7);focusPlace(p);notify(building.name+' now has an address in your city.');$('activity-text').textContent='A new building is ready to explore.';
 }catch(error){$('form-error').textContent=error.message;}
};
$('tour-button').onclick=startTour;
$('follow-button').onclick=()=>{if(!character)return;follow=!follow;if(follow){camera.zoom=1.7;camera.updateProjectionMatrix();}notify(follow?'Following SUB-01.':'Free camera.');};
for(const [id,factor] of [['zoom-in',1.2],['zoom-out',1/1.2]])$(id).onclick=()=>{camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.12,2.8);camera.updateProjectionMatrix();};
$('reset-view').onclick=resetView;
$('day-night').onclick=()=>{
  night=!night;scene.background.set(night?'#112638':'#eee9df');hemi.intensity=night?1.5:2.5;hemi.color.set(night?'#8bbacd':'#fff9e9');sunlight.intensity=night?.7:3.2;roomLight.intensity=night?7:0;cityRenderer?.setNight(night);
  $('day-night').textContent=night?'☀':'☾';$('day-night').setAttribute('aria-label',night?'Switch to day':'Switch to night');document.body.classList.toggle('is-night',night);
};
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(interactive,false)[0];if(hit&&cityRenderer?.select(hit))return;if(hit?.object.userData.place)showPlace(hit.object.userData.place);
});
addEventListener('resize',resize);resize();resetView();renderList();groundwork();cityRenderer=createCity(scene,interactive,showPlace,cityBuildings);addLabel(tower,21);
for(const b of cityBuildings){const p=plotView(cityPlots.find(p=>p.id===b.plotId),cityBuildings);addLabel(p,b.type==='project'?8.7:b.type==='studio'?4.7:6.7);}
for(const d of districts){const element=document.createElement('button');element.className='world-label district-label';element.textContent=d.name.toUpperCase();element.onclick=()=>{$('district-select').value=d.id;$('district-select').onchange();};$('labels').append(element);labels.push({element,district:true,position:new THREE.Vector3(d.x,.4,d.z+11.4)});}

const clock=new THREE.Clock();let lastRender=0;
function animate(now){
  requestAnimationFrame(animate);
  if(document.hidden||now-lastRender<(mobile?1000/30:1000/45))return;
  lastRender=now;const dt=Math.min(clock.getDelta(),.08);mixer?.update(dt);if(residentCharacter?.visible)residentMixer?.update(dt);
  if(tour&&character){
    const stop=tourStops[tour.index];tour.elapsed+=dt;const t=Math.min(tour.elapsed/stop.duration,1);
    const destination=new THREE.Vector3(stop.x,.335,stop.z);
    const walking=tour.from.distanceTo(destination)>.1;
    if(walking){character.position.lerpVectors(tour.from,destination,t);character.rotation.y=Math.atan2(destination.x-tour.from.x,destination.z-tour.from.z);play('Walk');}
    else play(tour.index===0?'Wave':'Idle');
    if(t>=1){tour.index++;tour.elapsed=0;tour.from=character.position.clone();if(tour.index>=tourStops.length){tour=null;play('Idle');$('tour-button').disabled=false;}else $('activity-text').textContent=tourStops[tour.index].text;}
  }
  if(character){const m=character.userData.marker;m.position.copy(character.position);m.position.y+=2+(reducedMotion?0:Math.sin(now*.002)*.04);m.rotation.y=now*.0005;if(follow)controls.target.lerp(character.position,.07);}
  if(cameraTween){cameraTween.elapsed+=dt;const t=Math.min(cameraTween.elapsed/.75,1),ease=1-(1-t)**3;controls.target.lerpVectors(cameraTween.start,cameraTween.target,ease);camera.zoom=THREE.MathUtils.lerp(cameraTween.zoom,cameraTween.endZoom,ease);camera.updateProjectionMatrix();if(t===1)cameraTween=null;}
  controls.update();renderer.render(scene,camera);
  for(const label of labels){if(label.district&&camera.zoom>.9){label.element.hidden=true;continue;}if(camera.zoom<.5&&!label.district&&label.element.textContent.indexOf('Tokyo Tower'.toUpperCase())===-1){label.element.hidden=true;continue;}const p=label.position.clone().project(camera);label.element.style.left=`${(p.x*.5+.5)*innerWidth}px`;label.element.style.top=`${(-p.y*.5+.5)*innerHeight}px`;label.element.hidden=p.z>1||p.z< -1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;}
}
requestAnimationFrame(animate);
async function initialize(){try{
  await Promise.all([makeHome(),makeBuildings(),makeCharacter(),makeResident()]);
  $('loading').classList.add('is-ready');
  // Browser-visible diagnostics are limited to rendering; no wallet or account data.
  renderer.domElement.dataset.ready='true';
}catch(error){
  console.error('Neighborhood asset loading failed',error);
  $('loading-text').textContent='An asset could not load. Reload to try again.';
}}
initialize();
