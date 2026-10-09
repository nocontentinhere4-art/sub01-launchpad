import './style.css';
import * as THREE from 'three';
import {toon,toonify,night as nightAmount,weather as wxUniforms} from './toon.js';
import {createWeather,createAmbience,weatherAt,LEVELS,nextMode,approach,atmosphere,wind,tokyoClock,skyGradient,phaseMix} from './weather.js';
import {crossingState} from './city-crowd.js';
import {trainPosition,setCityWorld,setCityFocus} from './city-life.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { places, residence } from './state.js';

import {cityPlots,districts,tower} from './city-state.js';
import {openRoom,attachRoomHost} from './room.js';
import {addResidents} from './residents.js';
import {createCrowdGPU,crowdPixels,crowdClose} from './crowd-gpu.js';
import {renderLookFields,readLook,isUnlocked} from './creator.js';
import {loadCharacter,HEIGHT} from './characters.js';
import {api,short,ApiError} from './api.js';
import {listWallets,onWallets,signIn,signOut} from './wallet.js';
import {worldBuildings,sub01Goal,planRoute,frontOf} from './world-sync.js';
import {createCity} from './city.js';
import {createCityEvents,freshEvents} from './city-events.js';
import {createExplorer,cityPois} from './explore.js';
import {createGovernor,settingsFor,startLevel,gpuName,createFuse,packResume,unpackResume,safeStore,timeoutSignal,nextPollDelay,GOV,RESUME_KEY,RESUME_MAX_AGE} from './quality.js';
// Never a white page: an uncaught error or rejection is one quiet console line. If the city never drew its first frame
// (no WebGL, a module that failed), the loading screen says so instead of spinning forever.
let booted=false;
addEventListener('error',e=>{if(!e.error&&!e.message)return;console.warn('[city] uncaught:',e.message||e.error);e.preventDefault();
  if(!booted){const t=document.getElementById('loading-text');if(t)t.textContent='The 3D city could not start in this browser (WebGL may be off). Reload, or try another browser.';}});
addEventListener('unhandledrejection',e=>{console.warn('[city] unhandled:',e.reason?.message||e.reason);e.preventDefault();});

const $ = id => document.getElementById(id);
const mobile = matchMedia('(max-width:600px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
let roomView=null,cityBuildings=[],cityRenderer,world=null,me=null,lookOptions=null,walker=null,goal=null,serverUp=null,worldKey='';
const resident=()=>me?.resident||null;
let selectedPlace = places[0], night = false, follow = false, currentDialog = null, previousFocus = null;
let cityTour=null;
// Quality governor state (quality.js; section 'Quality governor' below). Q = the current level's settings.
let governor=null,Q=settingsFor(3,{mobile,dpr:devicePixelRatio||1}),ratioDirty=false,glLost=false;
// City events: launch parties, the accepted-idea flash, and a client-only visit followed by the camera.
let partyGoal=null,partyWaveAt=0,markerFlash=0,followObj=null,visitKey=null,walkButton=null;const seenEvents=new Set();
let character, sub01, cameraTween = null, toastTimer;
// Explore mode (explore.js): the resident's own model walks the city; client-only. Taps on the ground pick a plane at y=0.25.
let explorer=null,lastTap={t:0,x:0,y:0};const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.25),tapPoint=new THREE.Vector3();
const floorY = 0.24;
const labels = [], interactive = [], cache = new Map();
const scene = new THREE.Scene();
// The sky is the page's CSS gradient behind a transparent canvas (style.css #world): zero draw calls, exact colours.
scene.background = null;
const camera = new THREE.OrthographicCamera(-18, 18, 18, -18, 0.1, 400);
camera.position.set(27, 31, 35);
const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'low-power' });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// Rooms keep the exposure they were tuned with; the city uses the art brief's (3.10).
const EXPOSURE = { city: 1.02, room: 1.35 };
renderer.toneMappingExposure = EXPOSURE.city;
$('world').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 2);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minZoom = .07; controls.maxZoom = 2.8;
controls.minPolarAngle = .3; controls.maxPolarAngle = 1.1;
controls.enablePan = true;
controls.addEventListener('start', () => { cityTour=null;follow = false; cameraTween = null; followObj=null; });
// Light (art brief 3.10): a low warm sun at 38° that lights the +z faces and shades the +x faces (the two the camera
// sees), a weak cool-sky / warm-ground hemisphere, the white fill replaced by a faint cool one from the opposite side
// (it tints the shaded faces blue and brings lit/shade to ~1.9). Coloured toon ramp in toon.js; linear fog for depth.
const LOOK = {
  day: { hemi: ['#CFDDF0', '#B9A88E', 1.1], sun: ['#FFE6C4', 2.6], fill: ['#9DB3D6', .45], fog: '#E6DFD2', shadows: true },
  night: { hemi: ['#2E4A86', '#2A2630', 3.2], sun: ['#9DB0E0', .5], fill: ['#9DB3D6', 0], fog: '#1C2638', shadows: false },
};
const SUN_DIR = new THREE.Vector3(-.45, .62, .64).normalize(), SUN_DISTANCE = 70, sunDir = SUN_DIR.clone();
const hemi = new THREE.HemisphereLight(...LOOK.day.hemi); scene.add(hemi);
const sunlight = new THREE.DirectionalLight(...LOOK.day.sun);
sunlight.castShadow = true; scene.add(sunlight, sunlight.target);
let SHADOW_MAP = mobile ? 512 : 1024;   // quality.js lowers it (1024 → 512) or turns cast shadows off
sunlight.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
Object.assign(sunlight.shadow.camera, { near: 1, far: 150 });
sunlight.shadow.bias = -.0006;
// Cast shadows keep a little sun so they sit at the same value as the shaded band of the ramp, not darker.
sunlight.shadow.intensity = .8;
const fill = new THREE.DirectionalLight(...LOOK.day.fill); fill.position.set(.45, .3, -.64); scene.add(fill);
// Fog is measured from the camera; the ortho camera sits a fixed distance from its target, so fog is set relative to it.
const FOG = { near: 12, far: 230 }, fogMul = { near: 1, far: 1 };
scene.fog = new THREE.Fog(LOOK.day.fog, 100, 300);
// One shadow map near what the camera looks at: the light follows controls.target (snapped to whole texels so edges do
// not crawl while panning) and its box grows with the visible area, from ±18 up close to ±62 in the overview.
let shadowHalf = 0;
function updateSunAndFog() {
  const d = camera.position.distanceTo(controls.target); scene.fog.near = d + FOG.near * fogMul.near; scene.fog.far = d + FOG.far * fogMul.far;
  if (!sunlight.castShadow) return;
  const half = THREE.MathUtils.clamp(Math.max(camera.right, camera.top) / camera.zoom * 1.1, 18, 62);
  if (Math.abs(half - shadowHalf) > .5) { shadowHalf = half; Object.assign(sunlight.shadow.camera, { left: -half, right: half, top: half, bottom: -half }); sunlight.shadow.camera.updateProjectionMatrix(); sunlight.shadow.normalBias = half * 2 / SHADOW_MAP * .9; }
  const texel = shadowHalf * 2 / SHADOW_MAP, t = controls.target;
  sunlight.target.position.set(Math.round(t.x / texel) * texel, 0, Math.round(t.z / texel) * texel);
  sunlight.position.copy(sunlight.target.position).addScaledVector(sunDir, SUN_DISTANCE);
}
const roomLight = new THREE.PointLight('#ffb366', 0, 12); roomLight.position.set(-6, 3, -4); scene.add(roomLight);
// Pedestrians, residents and party guests up close: rigged characters drawn by instanced GPU skinning (crowd-gpu.js).
const crowdGPU = createCrowdGPU(scene, { mobile, lights: { hemi, dirs: [sunlight, fill] } });

const geometries = new Map();
function box(w, h, d, color, x, y, z, parent = scene) {
  const key = `${w}/${h}/${d}`;
  if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(w, h, d));
  const object = new THREE.Mesh(geometries.get(key), toon({ color, roughness: .9 }));
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
  const url = `/assets/${kind}/${name}.${kind === 'characters' || kind === 'room' ? 'glb' : 'gltf'}`;
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

// Hero block (art direction wave 2B): the same concrete, asphalt and sidewalk as city.js, buildings at the city's storey
// scale (ground floor 3.0, storeys 2.5), and street trees only along the block's street edges.
const HERO={concrete:'#A9A79D',asphalt:'#7A7F7C',sidewalk:'#B4B1A7',kerb:'#CFCBC0',top:.135,kitScale:1.7};
function groundwork() {
  box(28, .65, 26, '#9C9A91', 0, -.37, 2);
  box(27.7, .18, 25.7, HERO.concrete, 0, .045, 2);
  // The central street connects the project's walkable parcels; a Japanese side street has no centre line.
  box(27.7, .035, 3.5, HERO.asphalt, 0, .165, 1.6);
  box(27.7, .055, .52, HERO.sidewalk, 0, .175, -.4);
  box(27.7, .055, .52, HERO.sidewalk, 0, .175, 3.6);
  box(7.6, .12, 6.9, HERO.sidewalk, places[0].x, .2, places[0].z);
  makeApartments();
  // Street trees (brief 3.7): a 2.2 trunk and two stacked crowns, not a lollipop; two instanced meshes for the lot.
  const trees=[[-12.8,-.5],[9.8,-.5],[-12.6,3.75],[-4.4,3.75],[2.4,3.75],[12.6,3.75]];
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.13,2.2,6),toon({color:'#876551',roughness:1}),trees.length);
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),toon({roughness:1}),trees.length*2);
  const m=new THREE.Object3D(),c=new THREE.Color();
  trees.forEach(([x,z],i)=>{
    m.position.set(x,HERO.top+1.1,z);m.rotation.set(0,0,0);m.scale.set(1,1,1);m.updateMatrix();trunks.setMatrixAt(i,m.matrix);
    for(let j=0;j<2;j++){const k=i*2+j;m.position.set(x+(j?.15:-.1),HERO.top+(j?3.55:2.7),z+(j?-.1:.1));m.rotation.set(.2*j,.7*i+.9*j,0);
      m.scale.set(j?.85:1.3,j?.75:.9,j?.85:1.25);m.updateMatrix();crowns.setMatrixAt(k,m.matrix);crowns.setColorAt(k,c.set(j?'#8FA66B':'#6F8F5E'));}
  });
  for(const t of [trunks,crowns]){t.castShadow=true;t.receiveShadow=true;t.instanceMatrix.needsUpdate=true;scene.add(t);}
}
// Orange Apartments: a small RC mansion at the city scale, 3 floors (3.0 + 2.5 + 2.5 + parapet 0.6), balconies facing
// the camera, a glass entrance and the ORANGE / 03 fascia.
function makeApartments(){
  const r=residence,W=4.4,D=4.0,H=3+2.5*2+.6,y0=HERO.top,front=r.z+D/2,wall='#eac09b',band='#f2d2b4';
  box(W+1,.08,D+1.2,HERO.sidewalk,r.x,y0+.04,r.z+.1);
  const apartment=box(W,H,D,wall,r.x,y0+H/2,r.z);apartment.userData.place=r;interactive.push(apartment);
  box(W-.24,.03,D-.24,'#7C8A80',r.x,y0+H+.015,r.z);
  box(1.5,1.8,1.6,'#d3ab88',r.x-W/2+.95,y0+H+.9,r.z-D/2+1.0);
  // Ground floor: glass entrance, a mailbox wall and the fascia.
  box(.95,2.0,.06,'#3D525B',r.x+.9,y0+1.0,front+.02);
  box(1.3,1.1,.08,'#8E9290',r.x-.6,y0+1.0,front+.03);
  sign('ORANGE / 03',r.x,y0+2.55,front+.06,'#ffac70',2.2);
  for(let k=1;k<3;k++){const y=y0+3+2.5*(k-1);
    box(W-.4,2.0,.04,'#5E7881',r.x,y+1.25,front+.02);
    box(W+.02,1.0,.9,band,r.x,y+.45,front+.45);
    box(.8,.6,.3,'#E5E1D6',r.x+(k===1?1.4:-1.4),y+1.25,front+.2);
  }
  addLabel(r,y0+H+.7);
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
  // KayKit buildings scaled ×1.7 so their doors are about 2.0 tall like the city's (brief 3.1), on a paved forecourt.
  await Promise.all(places.slice(1).map(async (p,i) => {
    const object = await model('city', ['building_C_withoutBase','building_B_withoutBase','building_A_withoutBase'][i],p.x,p.z,4.7*HERO.kitScale,0,'width',HERO.top);
    object.userData.place = p; object.traverse(n => { if(n.isMesh) {n.userData.place = p;interactive.push(n);} });
    const bounds = new THREE.Box3().setFromObject(object), size = bounds.getSize(new THREE.Vector3());
    box(size.x+.9,.06,size.z+.9,HERO.sidewalk,p.x,HERO.top+.03,p.z);
    addLabel(p,bounds.max.y+.6);
    sign(['WORKSHOP','BAD IDEA ARCADE','MIDNIGHT STUDIO'][i],p.x,2.55,bounds.max.z+.06,p.id === 'arcade' ? '#ffae6c' : '#f0ecd8',3.3);
  }));
  await Promise.all([
    model('city','bench',-11.4,4.9,1.7,0),
    model('city','streetlight',-1,.15,4.6,0,'height'),
    model('city','streetlight',10.8,3.8,4.6,Math.PI,'height'),
    model('city','car_hatchback',-10.5,1.7,2.5,Math.PI/2),
  ]);
}
async function makeCharacter() {
  // SUB-01 keeps his dark hoodie and hair; skin stays the model's own.
  sub01=await loadCharacter({outfit:'hoodie',top:'#313a37',bottom:'#313a37',hair:'#202a26'},{template});
  character=sub01.root;character.scale.setScalar(1.55/HEIGHT);
  character.position.set(-6,.335,-2.4); character.rotation.y = .5; scene.add(character);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.17),toon({ color: '#ff7b32', emissive: '#ff7620', emissiveIntensity: .25, roughness:.5 }));
  // Marker sits in scene units so it is not affected by the imported rig scale.
  scene.add(marker); character.userData.marker=marker;
  $('activity-text').textContent='At home. Waiting for the first brief.';
}
function play(name){sub01?.play(name);}
// Crowd LOD: box figures while a character would be under CROWD_PX (14 px) tall, GPU characters above it, culled to the
// ground the camera sees (nearest first, capped per device). Diagnostics (rendering only) ride on the canvas dataset.
let crowdNear=false,crowdStatsAt=0;const groundCenter=new THREE.Vector3(),viewDir=new THREE.Vector3();
// The five outfit glbs (~1.5 MB) load the first time the camera comes close enough; boxes meanwhile.
function crowdBegin(seconds){const close=Q.crowdCap>0&&crowdClose(crowdPixels(camera.zoom,innerHeight,camera.top-camera.bottom),crowdNear,Q.crowdPx);if(close&&!crowdGPU.ready&&renderer.domElement.dataset.ready)crowdGPU.load(template);
  crowdNear=crowdGPU.ready&&close;crowdGPU.active=crowdNear;crowdGPU.begin(seconds);}
function crowdEnd(now){
  if(!crowdNear)crowdGPU.hide();else{
    viewDir.subVectors(controls.target,camera.position).normalize();groundCenter.copy(controls.target);if(viewDir.y<-.05)groundCenter.addScaledVector(viewDir,controls.target.y/-viewDir.y);
    const halfW=(camera.right-camera.left)/camera.zoom/2,halfH=(camera.top-camera.bottom)/camera.zoom/2/Math.max(.3,-viewDir.y);
    crowdGPU.end(groundCenter,Math.hypot(halfW,halfH)+2);}
  if(now-crowdStatsAt>500){crowdStatsAt=now;const c=crowdGPU.stats;renderer.domElement.dataset.crowd=`${crowdNear?'near':'far'} ${c.instances} ${c.triangles} ${c.drawCalls}`;
    // City diagnostics: city.js instances drawn (detail on/off), then the whole frame's draw calls and triangles.
    const s=cityRenderer?.stats();if(s)renderer.domElement.dataset.city=`${s.instances} ${s.detail?'detail':'core'} ${renderer.info.render.calls} ${renderer.info.render.triangles}`;}
}

function renderList() {
  $('project-list').replaceChildren();
  const district=$('district-select').value;
  const available=cityPlots.filter(p=>!district||p.district===district).map(placeFor);
  const mine=new Set(me?.plots?.map(p=>p.plotId)||[]),ideas=(me?.ideas||[]).filter(i=>i.status!=='cancelled').slice(0,5).map(i=>({id:'idea-'+i.id,name:i.title,symbol:'✉',color:i.status==='declined'?'#9a9d92':'#fb752b',kind:'YOUR IDEA',status:IDEA_STATUS[i.status]||i.status,description:i.status_note||'',slug:i.slug,ideaId:i.id})),landmarks=[...ideas,tower,...places];
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
  visitWalk(p);$('visit-button').textContent=p.ideaId?'Open the idea ↗':b?.type==='apartment'?(p.mine?'Enter your room →':'Visit '+b.name+'\'s room →'):project?(b.slug?(p.mine?'Open your office ↗':'Open project page ↗'):'Watch the site →'):cityPlots.some(l=>l.id===p.id)?'Drop an idea here →':'Visit this place →';
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
// Camera (wave 2B): ortho at a fixed yaw of 36° (avoids two equal faces). CAMERA.pitch is the one tunable: wave 1 sat at
// 32.5°; at that angle a 2-floor near-row building (6.1 tall) hides ~6 units of ground behind it, i.e. the whole side
// street, so it is raised to 40° (hides ~0.97 × height) — the street and the far ground floors read at district zoom.
// Every tween only translates the camera, so the pitch set here holds until the user orbits.
const CAMERA={pitch:40,yaw:36,distance:168};
function aimCamera(target){const p=THREE.MathUtils.degToRad(CAMERA.pitch),y=THREE.MathUtils.degToRad(CAMERA.yaw),d=CAMERA.distance;
  controls.target.copy(target);camera.position.set(target.x+d*Math.cos(p)*Math.sin(y),target.y+d*Math.sin(p),target.z+d*Math.cos(p)*Math.cos(y));}
function resetView(){cityTour=null;follow=false;cameraTween=null;aimCamera(new THREE.Vector3(0,8,-7));camera.zoom=mobile?.09:.19;camera.updateProjectionMatrix();controls.update();}

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
const IDEA_STATUS={submitted:'In his mailbox',evaluating:'SUB-01 is thinking',selected:'He will build it',declined:'He passed',generating:'Being built',preview_ready:'Ready for your review',approved:'Approved by you',launch_prepared:'Launch ready',awaiting_signature:'Waiting for your signature',confirming:'Confirming on-chain',launched:'Launched',failed:'Stopped: needs attention',cancelled:'Cancelled'};
let knownStatus=null;
// A timeout or a dead network keeps the account as it was (the server answered nothing); a real answer replaces it.
async function refreshMe(){const before=knownStatus;try{me=await getJSON('/api/me');if(typeof me?.user!=='object')me=null;}catch(err){if(!(err instanceof ApiError)&&me)return;me=null;}
  // Tell the author when SUB-01 decides or a stage changes; private ideas never reach the public news.
  knownStatus=Object.fromEntries((me?.ideas||[]).map(i=>[i.id,i.status]));
  if(before)for(const i of me?.ideas||[])if(before[i.id]&&before[i.id]!==i.status)notify(i.status==='declined'?`SUB-01 passed on “${i.title}”. ${i.status_note?.split(' [')[0]||''}`:`“${i.title}”: ${IDEA_STATUS[i.status]||i.status}.`);$('account-button').textContent=me?.user?(resident()?.name||short(me.user.wallet)):'Sign in';renderList();updateResident();if(!resident())stopExplore();}
function openCreator(next){
 if(!lookOptions){notify('The city server is offline.');return;}
 const r=resident(),look=r?.look||{};$('resident-name').value=r?.name||'';$('resident-error').textContent='';
 // Before the first save the wallet has no tier yet; null opens the resident tier, which the server grants on creation.
 renderLookFields($('look-fields'),lookOptions,look,me?.unlocks?.tier?me.unlocks:null,r?.traits||{});
 const taken=new Set(cityBuildings.map(b=>b.plotId));if(r?.plotId)taken.delete(r.plotId);
 $('resident-plot').replaceChildren(...cityPlots.filter(p=>!taken.has(p.id)).map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));
 if(r?.plotId)$('resident-plot').value=r.plotId;
 $('resident-form').onsubmit=async e=>{e.preventDefault();const {look,traits}=readLook($('look-fields'));
  try{await api('/api/residents',{method:'POST',body:{name:$('resident-name').value,look,traits,plotId:$('resident-plot').value}});await refreshMe();await pollWorld();closeDialog();notify(`Welcome to Tokyo, ${resident()?.name}.`);next?.();}catch(err){$('resident-error').textContent=err.message;}};
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
 if(b?.type==='apartment'){stopExplore();openRoom({plotId:p.id,mine:p.mine,me,onEdit:()=>openCreator()});return;}
 if(p.ideaId){open(p.slug?`/projects/${encodeURIComponent(p.slug)}/review`:`/ideas/${encodeURIComponent(p.ideaId)}`,'_blank','noopener');return;}
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
function bubble(text,position,ms,extra=''){const element=Object.assign(document.createElement('div'),{className:'world-label visit-bubble'+extra,textContent:text});$('labels').append(element);const l={element,position};labels.push(l);
 setTimeout(()=>{element.remove();const i=labels.indexOf(l);if(i>=0)labels.splice(i,1);},ms);}
const boxKey=plotId=>residents.people.find(x=>x.key.startsWith(plotId+'{'))?.key||null;
function visitWalk(p){
 const r=resident(),b=p?.building,show=b?.type==='apartment'&&!p.mine&&!!r?.plotId&&b.plotId!==r.plotId&&!!frontOf(r.plotId);
 if(!walkButton){walkButton=Object.assign(document.createElement('button'),{type:'button',className:'button button-ghost visit-walk'});$('visit-button').after(walkButton);walkButton.onclick=startVisit;}
 walkButton.hidden=!show;walkButton.disabled=cityEvents.visiting;walkButton.textContent=cityEvents.visiting?'Your character is out visiting':'Send your character to visit';
}
// The roaming model (a visit or explore mode) is followed by the camera like meetDev; its figure at home (box or GPU) is hidden.
// A name tag rides above it: in the isometric view the street is often behind a building.
const roamTag={element:Object.assign(document.createElement('div'),{className:'world-label roam-tag',hidden:true}),position:new THREE.Vector3(),roam:true};
function roamStart(r,root){visitKey=boxKey(r.plotId);residents.hide(new Set(visitKey?[visitKey]:[]));roamTag.element.textContent=r.name;if(!labels.includes(roamTag)){$('labels').append(roamTag.element);labels.push(roamTag);}cityTour=null;cameraTween=null;followObj=root;follow=true;camera.zoom=mobile?1.1:1.5;camera.updateProjectionMatrix();}
function roamEnd(){const i=labels.indexOf(roamTag);if(i>=0)labels.splice(i,1);roamTag.element.remove();visitKey=null;residents.hide(new Set());if(followObj){followObj=null;follow=false;}}
// The host's greeting when a visitor (or an exploring resident) stops at their door.
function greet(plotId,name){const f=frontOf(plotId);if(f)bubble(`💬 Hi ${name}!`,new THREE.Vector3(f.x+1.2,2.4,f.z),4000);const k=boxKey(plotId);if(k)residents.wave(k,performance.now()*.001);}
// Purely local: nothing about a visit is sent to the server.
function startVisit(){
 const r=resident(),b=selectedPlace?.building;if(!r||b?.type!=='apartment'||cityEvents.visiting)return;closeDialog();stopExplore();
 const emotes=me?.unlocks?.emotes;
 const ok=cityEvents.visit({from:r.plotId,to:b.plotId,skate:Array.isArray(emotes)&&emotes.includes('skate'),pet:r.look?.pet,load:()=>loadCharacter(r.look||{},{template}),
  onStart(root){roamStart(r,root);notify(`${r.name} is on the way to ${b.name}'s place.`);},
  onArrive(){greet(b.plotId,r.name);},onEnd:roamEnd});
 if(!ok)notify('No street route to that address.');
}
// Explore: "🚶 Explore" puts the resident's model (accessories, pet) at their apartment front; taps walk it, 8 s idle wanders.
// "🏠 Go home" walks it back and disposes it; a second tap while it heads home ends at once.
function toggleExplore(){
 if(explorer){if(explorer.state==='home'||explorer.state==='done'||!cityEvents.visitor)stopExplore();else explorer.home();return;}
 if(!serverUp){notify('The city server is offline.');return;}
 if(!me?.user){openSignIn(toggleExplore);return;}
 if(!resident()){openCreator(toggleExplore);return;}
 const r=resident(),at=frontOf(r.plotId);if(!at)return;
 if(cityEvents.roaming)cityEvents.endRoam();
 const roam=cityEvents.explore({at,pet:r.look?.pet,load:()=>loadCharacter(r.look||{},{template}),
  onStart(root){roamStart(r,root);notify(mobile?'Tap a street to walk, double-tap to run.':'Click a street to walk there, double-click to run. Leave it 8 s and it wanders on its own.');},
  onEnd(){roamEnd();explorer=null;exploreUI();if(serverUp)$('activity-text').textContent=goal?.text||'';}});
 if(!roam){notify('Your character is busy right now.');return;}
 const name=r.name;
 explorer=createExplorer({roam,homeAt:()=>frontOf(resident()?.plotId||r.plotId),pois:()=>cityPois(cityBuildings,resident()?.plotId),
  canEmote:n=>isUnlocked('emotes',n,me?.unlocks,lookOptions?.unlocks),
  onToast:p=>bubble(p.text,new THREE.Vector3(roam.x,2.9,roam.z),4500,' explore-toast'),
  onGreet:p=>greet(p.plotId,name),onActivity:d=>{$('activity-text').textContent=`${name} is exploring ${d}`;},
  onAuto:()=>{if(roam.root){followObj=roam.root;follow=true;}},onState:exploreUI,onHome:stopExplore});
 exploreUI();
}
function stopExplore(){if(explorer)cityEvents.endRoam();}
function exploreUI(){const s=explorer?.state,b=$('explore-button');b.textContent=!explorer?'🚶 Explore':s==='home'?'🏠 Home now':'🏠 Go home';b.setAttribute('aria-pressed',String(!!explorer));
 document.body.classList.toggle('is-exploring',!!explorer);$('world-hint').textContent=explorer?'TAP A STREET TO WALK · DOUBLE-TAP TO RUN':'DRAG TO EXPLORE · SELECT A BUILDING';}
$('explore-button').onclick=toggleExplore;
function party(plotId,e){
 const b=cityBuildings.find(x=>x.plotId===plotId),plot=cityPlots.find(c=>c.id===plotId),p=cityEvents.celebrate(plotId,{people:residents.people});if(!p||!plot)return;
 const ticker=b?.ticker||e?.ticker;notify(`${ticker?'$'+ticker:b?.name||e?.name||'A project'} just launched. Street party at ${p.address}.`);
 partyGoal={x:p.spot.x,z:p.spot.z,yaw:plot.z<p.spot.z?0:Math.PI,activity:'party',text:`Street party at ${p.address}!`,until:performance.now()+40e3};
 if(character){walker={points:planRoute(character.position,partyGoal),index:1};goal=partyGoal;}
}
function cityEvent(e){
 if(e.kind==='accepted'){markerFlash=performance.now()+2500;notify(`SUB-01 took ${e.name||'a new idea'}.`);}
 else if(e.kind==='launched'){const id=e.plotId||cityBuildings.find(b=>b.type==='project'&&(e.ticker&&b.ticker===e.ticker||b.name===e.name))?.plotId;if(id)party(id,e);}
}
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);if(roomView){roomView.click(pointer);return;}raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(interactive,false)[0];if(hit&&cityRenderer?.select(hit))return;if(hit?.object.userData.place){showPlace(hit.object.userData.place);return;}
  // Explore mode: a tap on the ground walks the resident there along the streets; a second tap within 350 ms runs.
  if(explorer&&raycaster.ray.intersectPlane(groundPlane,tapPoint)){const t=performance.now(),run=t-lastTap.t<350&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<40;
   lastTap.t=run?0:t;lastTap.x=e.clientX;lastTap.y=e.clientY;if(explorer.tap(tapPoint,{run})&&cityEvents.visitor){followObj=cityEvents.visitor;follow=true;cameraTween=null;}}
});
$('district-select').replaceChildren();const all=document.createElement('option');all.value='';all.textContent='Entire city';$('district-select').append(all);for(const d of districts){const option=document.createElement('option');option.value=d.id;option.textContent=d.name;$('district-select').append(option);}
addEventListener('resize',()=>{resize();governor?.grace(GOV.grace.resize,performance.now());});resize();resetView();renderList();groundwork();cityRenderer=createCity(scene,interactive,showPlace,cityBuildings,{mobile,gpu:crowdGPU});addLabel(tower,32);
for(const d of districts){const element=document.createElement('button');element.className='world-label district-label';element.textContent=d.name.toUpperCase();element.onclick=()=>{$('district-select').value=d.id;$('district-select').onchange();};$('labels').append(element);labels.push({element,district:true,position:new THREE.Vector3(d.x,.4,d.z+11.4)});}

// Shared world: the server is the source of truth; the city redraws only when something changed.
const residents=addResidents(scene),worldLabels=[],cityEvents=createCityEvents(scene,{mobile,reducedMotion,gpu:crowdGPU});
// Rooms borrow this renderer; the city stops updating while one is open.
attachRoomHost({template,notify,openIdea(){openBuildForm();},setView(view){
  // Memory audit: room.js's dispose() clears its scene but not its sun's shadow map (a 512² render target per visit
  // stayed on the GPU). The host frees the closing room's light shadow maps here; room.js runs its dispose() right after.
  if(!view&&roomView)roomView.scene.traverse(n=>{if(n.isLight&&n.shadow?.map)n.shadow.dispose();});
  roomView=view;controls.enabled=!view;governor?.grace(GOV.grace.room,performance.now());if(view)fuses.room.reset();else ratioDirty=true;
  document.body.classList.toggle('in-room',!!view);if(view)view.resize(innerWidth/innerHeight);}});
function residentList(){return cityBuildings.filter(b=>b.type==='apartment').map(b=>{const f=frontOf(b.plotId);const look=b.resident.look||{};return f&&{x:f.x+1.2,z:f.z,look,key:b.plotId+JSON.stringify(look)};}).filter(Boolean);}
function setServer(up){if(up===serverUp)return;serverUp=up;$('server-status').textContent=up?'LIVE CITY':'SERVER OFFLINE';$('activity-label').textContent=up?'SUB-01 · LIVE':'SUB-01 · OFFLINE';$('server-badge').classList.toggle('is-offline',!up);if(!up)$('activity-text').textContent='The city server is offline. Nothing here is live right now.';}
// Polls (robustness pass): every fetch has an 8 s timeout, the next poll is scheduled only after the last one settled,
// and a server that does not answer is retried at 8, 16, 32, 60 s instead of every 4 s. A hidden tab does not poll.
const POLL={world:4e3,me:8e3,timeout:8e3};let worldFails=0;
async function getJSON(path){const res=await fetch(path,{credentials:'same-origin',signal:timeoutSignal(POLL.timeout)});let json=null;try{json=await res.json();}catch{}if(!res.ok)throw new ApiError(res.status,json);return json;}
function pollLoop(run,delay){let timer=0;const tick=async()=>{try{if(!document.hidden)await run();}catch(err){console.warn('[city] poll',err?.message||err);}finally{timer=setTimeout(tick,delay());}};
 timer=setTimeout(tick,delay());return ()=>clearTimeout(timer);}
async function pollWorld(){
 let next;try{next=await getJSON('/api/world');if(!Array.isArray(next?.plots))throw new Error('not the city server');if(!lookOptions){lookOptions=await getJSON('/api/world/options');cityRenderer.crowd.setLookOptions(lookOptions);}setServer(true);worldFails=0;}catch{worldFails++;setServer(false);return;}
 world=next;setCityWorld(world);const items=worldBuildings(world),key=JSON.stringify(items);let flipped=[];
 if(key!==worldKey){worldKey=key;
  // A party only for a site seen building and now open, not for one that was already open when first seen.
  flipped=items.filter(b=>b.phase==='open'&&cityBuildings.some(o=>o.plotId===b.plotId&&o.type==='project'&&o.phase!=='open'));
  const opened=items.filter(b=>b.phase==='open'&&!cityBuildings.some(o=>o.plotId===b.plotId&&o.phase==='open'));
  cityBuildings=items;cityRenderer.redraw(items);residents.set(residentList());renderList();
  for(const l of worldLabels){l.element.remove();labels.splice(labels.indexOf(l),1);}worldLabels.length=0;
  for(const b of items.filter(b=>b.type==='project')){const plot=cityPlots.find(p=>p.id===b.plotId);addLabel({...placeFor(plot),name:b.ticker?`${b.name} · $${b.ticker}`:b.name,color:b.phase==='open'?'#ffcf6e':'#fb752b'},(cityRenderer.heightOf(b.plotId)??3)+(b.phase==='open'?2.6:1.4));worldLabels.push(labels.at(-1));}
  if(opened.length&&worldKey&&$('activity-text'))notify(`${opened[0].name} just opened its doors.`);
 }
 cityEvents.decorate(cityBuildings,world.events);
 for(const e of freshEvents(world.events,seenEvents,Number(world.now)||Date.now()))cityEvent(e);
 for(const b of flipped)party(b.plotId);
 const g=partyGoal&&performance.now()<partyGoal.until?partyGoal:(partyGoal=null,sub01Goal(world));
 if(character&&(!goal||g.x!==goal.x||g.z!==goal.z)){walker={points:planRoute(character.position,g),index:1};}
 goal=g;const latest=world.news?.[0]?.text.replace(/\b([a-z]+)-([1-6])\b/g,m=>cityPlots.find(p=>p.id===m)?.name||m);if(serverUp&&!explorer)$('activity-text').textContent=latest?`${g.text} · ${latest}`:g.text;
}
// ---------- Weather, Tokyo clock, camera life, ambient sound (art direction wave 3B, weather.js) ----------
// Day/night is a continuous amount n (0 day, .5 dusk, 1 night): manual day or night, or "auto" on the real Tokyo clock with
// 40-minute dawn/dusk blends. Lights, fog and the CSS sky are mixed day → dusk → night every frame; the city's own
// materials (city.js, city-events) still switch once, at n = 0.5. Weather levels then dim the sun, thicken the fog,
// grey the sky and wet the streets (toon.js shared uniforms). Night (brief 3.9/3.10): saturated blue ambient, a faint
// moon, dark fog and no shadow map.
const LOOK_DUSK={hemi:['#8E9AC8','#B88A74',1.6],sun:['#FF9C5E',2.1],fill:['#9DB3D6',.3],fog:'#C7A79C'};
const SUN_LOW=new THREE.Vector3(-.62,.22,.75).normalize(),GREY=new THREE.Color('#B8C0C8'),FLASH=new THREE.Color('#E8E6FF'),_wc=new THREE.Color(),_wd=new THREE.Color();
const WX={mode:'auto',state:'clear',levels:{...LEVELS.clear},fast:0,flashAt:-1e9,nextFlash:0,dayMode:'day',clockOverride:null,n:0,isNight:false,sky:'',caption:'',amp:0,green:false,audioAt:0,statsAt:0};
const wxView=createWeather(scene,{mobile}),ambience=createAmbience(),drift=new THREE.Vector3(),driftNext=new THREE.Vector3();let lastInput=performance.now();
for(const type of ['pointerdown','wheel','keydown','touchstart'])addEventListener(type,()=>{lastInput=performance.now();},{passive:true,capture:true});
// Two buttons made here (index.html is not touched): ☂ cycles the city weather, ♪ toggles the procedural sound (off).
const control=(id,text,onclick)=>{const b=Object.assign(document.createElement('button'),{className:'icon-button',id,type:'button',textContent:text,onclick});$('day-night').before(b);return b;};
const label=(b,text)=>{b.title=text;b.setAttribute('aria-label',text);};
const weatherButton=control('weather-mode','☂',()=>setWeather(nextMode(WX.mode),true));
const soundButton=control('city-sound','♪',()=>{const on=ambience.toggle();soundButton.setAttribute('aria-pressed',String(on));label(soundButton,on?'City sounds: on':'City sounds: off');notify(on?'City sounds on (made in the browser, quiet).':'City sounds off.');});
soundButton.setAttribute('aria-pressed','false');label(soundButton,'City sounds: off');
const clockCaption=Object.assign(document.createElement('span'),{className:'tokyo-clock',hidden:true});$('activity-label').after(clockCaption);
function setWeather(mode,announce=false){WX.mode=mode;WX.fast=announce?10:0;weatherButton.dataset.mode=mode;
  label(weatherButton,mode==='auto'?'City weather: auto (a shared schedule, not real Tokyo weather)':`City weather: ${mode}`);
  if(announce)notify(mode==='auto'?'City weather: auto. The same for everyone, changing every few minutes. Not real Tokyo weather.':`City weather: ${mode}.`);}
const DAY_MODES=['auto','day','night'];
// The button shows what the next tap does: day → night → Tokyo clock (auto) → day.
function setDayMode(mode){WX.dayMode=mode;const b=$('day-night');b.textContent=mode==='day'?'☾':mode==='night'?'◐':'☀';
  label(b,mode==='day'?'Switch to night':mode==='night'?'Follow the Tokyo clock':'Switch to day');clockCaption.hidden=mode!=='auto';}
$('day-night').onclick=()=>setDayMode(DAY_MODES[(DAY_MODES.indexOf(WX.dayMode)+1)%3]);
setWeather('auto');setDayMode('day');
// Screenshot/debug hooks (rendering only): __cityWeather.set('rain'), .day('auto'), .clock(Date.parse(...)), .snap().
window.__cityWeather={set:m=>setWeather(m),day:setDayMode,clock(ms){WX.clockOverride=ms??null;},snap(){Object.assign(WX.levels,LEVELS[WX.mode==='auto'?weatherAt(Date.now()).state:WX.mode]);},get state(){return {...WX,levels:{...WX.levels},clock:tokyoClock(WX.clockOverride??Date.now()),drawCalls:wxView.drawCalls};},view:wxView};
const mix3=(n,a,b,c)=>n<.5?a+(b-a)*n*2:b+(c-b)*(n*2-1);
function weatherFrame(now,dt,seconds){
  const clockNow=tokyoClock(WX.clockOverride??Date.now()),n=WX.dayMode==='auto'?clockNow.night:WX.dayMode==='night'?1:0;WX.n=n;
  WX.state=WX.mode==='auto'?weatherAt(Date.now()).state:WX.mode;
  const l=approach(WX.levels,LEVELS[WX.state],dt,WX.fast>0?8:1),A=atmosphere(l);WX.fast-=dt;
  // Lightning (storm only, never with reduced motion): two short pulses of hemisphere + sun light and a pale sky.
  if(l.storm>.5&&!reducedMotion){if(!WX.nextFlash)WX.nextFlash=now+3e3+Math.random()*8e3;if(now>WX.nextFlash){WX.flashAt=now;WX.nextFlash=now+6e3+Math.random()*14e3;}}else WX.nextFlash=0;
  const fa=now-WX.flashAt,flash=fa<70?1:fa<130?0:fa<190?.7:0,D=LOOK_DUSK,Ld=LOOK.day,Ln=LOOK.night;
  phaseMix(n,Ld.hemi[0],D.hemi[0],Ln.hemi[0],hemi.color).lerp(GREY,l.overcast*.5*(1-n));phaseMix(n,Ld.hemi[1],D.hemi[1],Ln.hemi[1],hemi.groundColor);
  hemi.intensity=mix3(n,Ld.hemi[2],D.hemi[2],Ln.hemi[2])*A.hemi+flash*3;
  phaseMix(n,Ld.sun[0],D.sun[0],Ln.sun[0],sunlight.color);if(flash)sunlight.color.lerp(FLASH,.8);
  sunlight.intensity=mix3(n,Ld.sun[1],D.sun[1],Ln.sun[1])*A.sun+flash*4;fill.intensity=mix3(n,Ld.fill[1],D.fill[1],Ln.fill[1])*A.fill;
  sunDir.copy(SUN_DIR).lerp(SUN_LOW,1-Math.abs(2*n-1)).normalize();
  const shadows=n<.62&&Q.shadow>0;if(sunlight.castShadow!==shadows)sunlight.castShadow=shadows;sunlight.shadow.intensity=.8*A.shadow;
  phaseMix(n,Ld.fog,D.fog,Ln.fog,scene.fog.color).lerp(phaseMix(n,'#B4BAC0','#8E8A90','#1A2130',_wc).lerp(phaseMix(n,'#DCE1E5','#A9A3AE','#28324A',_wd),Math.min(1,l.snow*1.25)),l.overcast*.7);
  fogMul.near=A.fogNear;fogMul.far=A.fogFar;nightAmount.value=n;wxUniforms.wet.value=l.wet;wxUniforms.snow.value=l.cover;
  const isNight=n>=.5;if(isNight!==WX.isNight){WX.isNight=night=isNight;roomLight.intensity=isNight?7:0;cityRenderer?.setNight(isNight);cityEvents.setNight(isNight);document.body.classList.toggle('is-night',isNight);}
  // The CSS sky (style.css #world) is left alone in plain day or night; otherwise main.js writes the mixed gradient.
  const sky=(n===0||n===1)&&l.overcast<.004&&!flash?'':skyGradient(n,l.overcast,flash);if(sky!==WX.sky){WX.sky=sky;$('world').style.background=sky;}
  const caption=WX.dayMode==='auto'?` · Tokyo ${clockNow.label} · ${clockNow.phase}`:'';if(caption!==WX.caption){WX.caption=caption;clockCaption.textContent=caption;}
  const px=renderer.getPixelRatio()*innerHeight*camera.zoom/(camera.top-camera.bottom);
  wxView.update({seconds,now,camera,target:controls.target,px,levels:l,night:n,wind:wind(now*.001,l.wind)});
  // Camera life: after 20 s without input and with nothing driving the camera, the target drifts ±0.15 over ~12 s.
  const still=!reducedMotion&&!cameraTween&&!follow&&!cityTour&&!explorer&&now-lastInput>20e3,a=now*.001*Math.PI*2/12;
  WX.amp+=((still?.15:0)-WX.amp)*Math.min(1,dt*1.5);driftNext.set(Math.sin(a),0,Math.sin(a*2)*.5).multiplyScalar(WX.amp);
  const step=driftNext.sub(drift);controls.target.add(step);camera.position.add(step);drift.add(step);
  renderer.toneMappingExposure=EXPOSURE.city+(reducedMotion?0:.02*Math.sin(now*.001*Math.PI*2/9));
  if(now-WX.statsAt>500){WX.statsAt=now;renderer.domElement.dataset.weather=`${WX.mode} ${WX.state} wet ${l.wet.toFixed(2)} n ${n.toFixed(2)} +${wxView.drawCalls}`;}
  // Sound: hum louder up close, rain with the rain, a rumble while a train moves near the station, murmur in Roppongi's
  // lantern street when zoomed in, the crossing chirp when Shibuya's lights turn green near the camera.
  if(!ambience.on||now-WX.audioAt<250)return;WX.audioAt=now;
  const t=controls.target,near=(x,z,r)=>Math.max(0,1-Math.hypot(t.x-x,t.z-z)/r),zoomIn=THREE.MathUtils.clamp((camera.zoom-.3)/.8,0,1),s=now*.001;
  let train=0;for(const off of [0,54]){const x0=trainPosition(s,off),v=Math.abs(trainPosition(s+.5,off)-x0)*2;train=Math.max(train,Math.min(1,v/8)*Math.max(0,1-Math.abs(x0+26)/30));}
  const green=crossingState(s).pedestrianGreen;if(green&&!WX.green&&camera.zoom>.4&&near(29,2,30)>0)ambience.chirp(near(29,2,30));WX.green=green;
  ambience.update({hum:.5+.5*zoomIn,rain:Math.min(1,l.rain*1.2),train:train*(.35+.65*near(-26,78,70)),murmur:camera.zoom>.6?zoomIn*near(-29,2,16):0});
}
// ---------- Quality governor, lite mode, WebGL context loss, resume (robustness pass, quality.js) ----------
// Start level from the device (phone 2, desktop 3, weak GPU / ≤2 GB / ≤2 cores 1); "LITE" pins level 0 (remembered).
const local=safeStore((()=>{try{return localStorage;}catch{return null;}})()),session=safeStore((()=>{try{return sessionStorage;}catch{return null;}})());
const phone=mobile||(matchMedia('(pointer:coarse)').matches&&Math.min(screen.width,screen.height)<=600);
const GPU=gpuName(renderer.getContext()),START=startLevel({phone,gpu:GPU,deviceMemory:navigator.deviceMemory,cores:navigator.hardwareConcurrency});
const LITE_KEY='sub01-lite',liteStored=local.get(LITE_KEY)==='1';
governor=createGovernor({level:liteStored?0:START,auto:!liteStored,now:performance.now(),onChange(level,{reason}){applyQuality();if(reason==='down')notify('Lighter mode for a smoother city');}});
const liteButton=control('lite-mode','LITE',()=>setLite(governor.auto));
function setLite(on){local.set(LITE_KEY,on?'1':'0');governor.auto=!on;governor.set(on?0:START,performance.now());applyQuality();notify(on?'Lite mode: the lightest city, always.':'Lite mode off: the city adjusts to this device.');}
function applyQuality(){
  const q=settingsFor(governor.level,{mobile,dpr:devicePixelRatio||1});Q=q;
  wxView.setQuality(q);crowdGPU.setLimits({cap:q.crowdCap,budget:q.crowdTris});cityEvents.setQuality(q);cityRenderer?.setQuality?.(q);
  if(q.shadow&&q.shadow!==SHADOW_MAP){SHADOW_MAP=q.shadow;sunlight.shadow.mapSize.set(SHADOW_MAP,SHADOW_MAP);sunlight.shadow.map?.dispose();sunlight.shadow.map=null;shadowHalf=0;}
  if(roomView)ratioDirty=true;else renderer.setPixelRatio(q.pixelRatio);
  renderer.domElement.dataset.quality=`${q.level} ${governor.auto?'auto':'manual'} ${q.name}`;
  const lite=!governor.auto&&q.level===0;liteButton.setAttribute('aria-pressed',String(lite));label(liteButton,lite?'Lite mode: on (tap for automatic quality)':'Lite mode: off (tap for the lightest city)');
}
applyQuality();
for(const type of ['visibilitychange','pageshow','focus'])addEventListener(type,()=>governor.grace(GOV.grace.visible,performance.now()));
// WebGL context loss: three.js re-uploads everything it still has on the CPU (canvas textures, the crowd's bone texture,
// the sign atlas, glTF images) when the context comes back; main.js stops the loop meanwhile, shows a small overlay and
// re-applies the level (one step lighter: a lost context is usually GPU memory pressure). No restore within 3 s →
// the page reloads by itself with the view kept in sessionStorage (not more than twice a minute; then a tap reloads).
const lostOverlay=Object.assign(document.createElement('div'),{className:'gl-lost',hidden:true,role:'status',textContent:'Tokyo is reloading its lights…'});document.body.append(lostOverlay);
let lostTimer=0,glLosses=0;
function resumeState(){return {target:controls.target,zoom:camera.zoom,district:$('district-select').value,dayMode:WX.dayMode,weather:WX.mode};}
function reloadCity(){const prev=unpackResume(session.get(RESUME_KEY))?.reloads||0;
  if(prev>=2){lostOverlay.textContent='The city lost its graphics. Tap to reload.';lostOverlay.onclick=()=>location.reload();lostOverlay.style.cursor='pointer';return;}
  session.set(RESUME_KEY,packResume({...resumeState(),reloads:prev+1}));location.reload();}
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();glLost=true;glLosses++;lostOverlay.hidden=false;clearTimeout(lostTimer);lostTimer=setTimeout(reloadCity,3000);});
renderer.domElement.addEventListener('webglcontextrestored',()=>{clearTimeout(lostTimer);glLost=false;lostOverlay.hidden=true;
  if(governor.auto&&governor.level>0)governor.set(governor.level-1,performance.now());else applyQuality();
  governor.grace(GOV.grace.restore,performance.now());clock.getDelta();});
// Back from a reload: the camera, district, day mode and weather it had (a room is not reopened: the city comes back).
{const r=unpackResume(session.get(RESUME_KEY),Date.now(),{weathers:['clear','rain','storm','sakura','snow','auto']});
 if(r){if(!r.reloads)session.remove(RESUME_KEY);else setTimeout(()=>session.remove(RESUME_KEY),RESUME_MAX_AGE);   // keeps the reload count for a minute
  aimCamera(new THREE.Vector3(r.target.x,r.target.y,r.target.z));camera.zoom=r.zoom;camera.updateProjectionMatrix();controls.update();
  if(districts.some(d=>d.id===r.district)){$('district-select').value=r.district;renderList();}setDayMode(r.dayMode);setWeather(r.weather);}}
// Diagnostics (rendering only, no account data): __city.quality.set(0), .auto, .level; __city.memory(); __city.view({x,z,zoom}).
// __city.audit drives the same disposal paths as the UI (a room, a roaming model with a pet, a visit) for the memory audit.
const quality={get level(){return governor.level;},set(l){governor.set(l,performance.now());applyQuality();return governor.level;},get auto(){return governor.auto;},set auto(v){governor.auto=v;applyQuality();},
  get settings(){return {...Q};},get ema(){return governor.ema;},get steps(){return governor.steps;},start:START,gpu:GPU,phone};
const sceneCount=root=>{let n=0;root.traverse(()=>n++);return n;};
const aptPlots=()=>cityBuildings.filter(b=>b.type==='apartment'&&frontOf(b.plotId)).map(b=>b.plotId);
window.__city={quality,get fuses(){return fuses;},
  memory(){const m=renderer.info.memory;return {heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,geometries:m.geometries,textures:m.textures,programs:renderer.info.programs?.length??null,objects:sceneCount(scene),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},
  get camera(){const t=controls.target;return {x:+t.x.toFixed(2),y:+t.y.toFixed(2),z:+t.z.toFixed(2),zoom:+camera.zoom.toFixed(3)};},
  view({x=0,y=2,z=0,zoom=1}={}){cityTour=null;follow=false;cameraTween=null;aimCamera(new THREE.Vector3(x,y,z));camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();},
  audit:{room(plotId=aptPlots()[0]){return openRoom({plotId,mine:false,me});},get inRoom(){return !!roomView;},
   roam(){const at=frontOf(aptPlots()[0]);return !!cityEvents.explore({at,pet:{kind:'cat'},load:()=>loadCharacter({outfit:'jacket'},{template})});},
   visit(){const [from,to]=aptPlots();return !!cityEvents.visit({from,to,skate:true,pet:{kind:'dog'},load:()=>loadCharacter({outfit:'tee'},{template})});},
   endRoam(){cityEvents.endRoam();},get roaming(){return cityEvents.roaming;},
   // Textures the open room's scene draws (uuid, kind, size): compared across opens to find per-room textures.
   roomTextures(){const out=new Map();roomView?.scene.traverse(n=>{for(const m of [n.material].flat())for(const k of ['map','emissiveMap','alphaMap'])if(m?.[k])out.set(m[k].uuid,`${m[k].uuid.slice(0,6)} ${m[k].constructor.name} ${m[k].image?.width}x${m[k].image?.height} ${n.name||n.type}`);});return [...out.values()];}}};
const clock=new THREE.Clock();let lastRender=0,renderedAt=-1;
// Per-frame subsystems run behind fuses (quality.js): three errors in a row switch off only that subsystem.
const fuses=Object.fromEntries(['crowd','weather','critters','events','explore','room'].map(n=>[n,createFuse(n)]));
function crowdFrame(seconds){crowdBegin(seconds);residents.update(seconds,crowdGPU);}
function animate(now){
  requestAnimationFrame(animate);
  // Governor sample: the cost of the last rendered frame = this rAF minus that frame's rAF (vsync-quantised, cap-free).
  if(renderedAt>=0){governor.sample(now-renderedAt,now);renderedAt=-1;}
  if(glLost||document.hidden||now-lastRender<(mobile?1000/30:1000/45))return;
  lastRender=now;
  if(roomView){renderer.toneMappingExposure=EXPOSURE.room;wxUniforms.wet.value=wxUniforms.snow.value=0;fuses.room.run(()=>roomView.update(Math.min(clock.getDelta(),.08)));renderer.render(roomView.scene,roomView.camera);return;}
  if(ratioDirty){ratioDirty=false;renderer.setPixelRatio(Q.pixelRatio);}
  const seconds=reducedMotion?0:now*.001;fuses.crowd.run(crowdFrame,seconds);if(fuses.crowd.off&&crowdGPU.active){crowdGPU.active=crowdNear=false;crowdGPU.hide();residents.update(seconds,crowdGPU);}
  fuses.critters.run(()=>cityRenderer?.update(seconds));const dt=Math.min(clock.getDelta(),.08);sub01?.update(dt);
  fuses.events.run(()=>cityEvents.update(dt,renderer.getPixelRatio()*innerHeight*camera.zoom/(camera.top-camera.bottom)));if(explorer&&cityEvents.visitor)fuses.explore.run(()=>explorer.update(dt));if(cityEvents.visitor){roamTag.position.copy(cityEvents.visitor.position);roamTag.position.y+=2.05;}
  if(goal?.activity==='party'&&!walker&&now>partyWaveAt&&partyWaveAt){play('Idle');play('Wave');partyWaveAt=now+6e3;}
  if(walker&&character){
    const target=walker.points[walker.index],pos=character.position,dx=target.x-pos.x,dz=target.z-pos.z,dist=Math.hypot(dx,dz),stepLen=dt*(walker.points.length>3?4.2:2.4);
    if(dist<=stepLen){pos.x=target.x;pos.z=target.z;walker.index++;if(walker.index>=walker.points.length){walker=null;if(goal?.activity==='party'){character.rotation.y=goal.yaw;play('Idle');play('Wave');partyWaveAt=now+6e3;}else play(goal?.activity==='build'?'Interact':goal?.activity==='desk'?'Idle_Neutral':'Idle');}}
    else{pos.x+=dx/dist*stepLen;pos.z+=dz/dist*stepLen;character.rotation.y=Math.atan2(dx,dz);play(walker.points.length>3?'Run':'Walk');}
  }
  if(character){const m=character.userData.marker,fl=markerFlash>now?Math.abs(Math.sin(now*.012)):0;m.scale.setScalar(1+fl*.9);m.material.emissiveIntensity=.25+fl*2.5;m.position.copy(character.position);m.position.y+=2+(reducedMotion?0:Math.sin(now*.002)*.04);m.rotation.y=now*.0005;if(follow){const before=controls.target.clone();controls.target.lerp((followObj||character).position,.07);camera.position.add(controls.target.clone().sub(before));}}
  if(cameraTween){cameraTween.elapsed+=dt;const t=Math.min(cameraTween.elapsed/.75,1),ease=1-(1-t)**3;const before=controls.target.clone();controls.target.lerpVectors(cameraTween.start,cameraTween.target,ease);camera.position.add(controls.target.clone().sub(before));camera.zoom=THREE.MathUtils.lerp(cameraTween.zoom,cameraTween.endZoom,ease);camera.updateProjectionMatrix();if(t===1)cameraTween=null;}
  if(cityTour){cityTour.elapsed+=dt;if(cityTour.elapsed>5){cityTour.elapsed=0;cityTour.index++;if(cityTour.index>=cityViews.length){cityTour=null;resetView();$('activity-text').textContent='Your idea. Your city. Choose an address.';}else nextCityView();}}
  // Overview LOD: below zoom 0.3 the city skips AC units, small roof items, side pipes and road marks.
  cityRenderer?.setDetail(camera.zoom>=.3&&Q.detail);   // quality level 0 keeps the overview LOD even up close
  fuses.weather.run(weatherFrame,now,dt,seconds);controls.update();updateSunAndFog();if(!fuses.crowd.off)fuses.crowd.run(crowdEnd,now);setCityFocus(cityEvents.visitor?.position||character?.position||null);renderer.render(scene,camera);renderedAt=now;booted=true;
  document.body.classList.toggle('is-close',camera.zoom>.42);
  for(const label of labels){if(label.district&&(camera.zoom>.9||(camera.zoom<.25&&!['SHIBUYA','SHINJUKU','AKIHABARA','ODAIBA','GINZA'].includes(label.element.textContent)))){label.element.hidden=true;continue;}if(camera.zoom<.5&&!label.district&&!label.roam&&label.element.textContent.indexOf('Tokyo Tower'.toUpperCase())===-1){label.element.hidden=true;continue;}const p=label.position.clone().project(camera);label.element.style.left=`${(p.x*.5+.5)*innerWidth}px`;label.element.style.top=`${(-p.y*.5+.5)*innerHeight}px`;label.element.hidden=p.z>1||p.z< -1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;}
}
requestAnimationFrame(animate);
async function initialize(){try{
  await Promise.all([makeHome(),makeBuildings(),makeCharacter()]);
  // The first account + world fetch gets 2.5 s before the city is shown: a server that hangs (8 s timeouts) never keeps
  // the loading screen up. The poll loops start once that first fetch settled.
  const first=Promise.all([refreshMe(),pollWorld()]).catch(err=>console.warn('[city] first poll',err?.message||err));
  await Promise.race([first,new Promise(r=>setTimeout(r,2500))]);
  first.then(()=>{pollLoop(pollWorld,()=>nextPollDelay(POLL.world,worldFails));pollLoop(()=>me?.user&&serverUp?refreshMe():null,()=>POLL.me);});
  $('loading').classList.add('is-ready');
  // Browser-visible diagnostics are limited to rendering; no wallet or account data.
  renderer.domElement.dataset.ready='true';
}catch(error){
  console.error('Neighborhood asset loading failed',error);
  $('loading-text').textContent='An asset could not load. Reload to try again.';
}}
initialize();
