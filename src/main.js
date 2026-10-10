import './style.css';
import * as THREE from 'three';
import {toon,toonify,night as nightAmount,weather as wxUniforms} from './toon.js';
import {createWeather,createAmbience,weatherAt,LEVELS,nextMode,approach,atmosphere,wind,tokyoClock,skyGradient,phaseMix} from './weather.js';
import {crossingState} from './city-crowd.js';
import {trainPosition,setCityWorld,setCityFocus,canalLayout} from './city-life.js';
import {riverHole} from './landmarks.js';
import {setTrafficQuality} from './city-traffic.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { places, residence } from './state.js';

import {cityPlots,districts,tower} from './city-state.js';
import * as CS from './city-state.js';
import {addCityGreen} from './city-green.js';
import {openRoom,attachRoomHost} from './room.js';
import {addResidents} from './residents.js';
import {createCrowdGPU,crowdPixels,crowdClose} from './crowd-gpu.js';
import {renderLookFields,readLook,isUnlocked} from './creator.js';
import {loadCharacter,HEIGHT} from './characters.js';
import {api,short,ApiError} from './api.js';
import {listWallets,onWallets,signIn,signOut} from './wallet.js';
import {worldBuildings,sub01Goal,planRoute,frontOf,HOME_DESK} from './world-sync.js';
import {buildHeroHome} from './hero-home.js';
import {createCity} from './city.js';
import {createCityEvents,freshEvents} from './city-events.js';
import {createExplorer,cityPois} from './explore.js';
import {kanjiOf,codeOf,addressCode} from './districts-kanji.js';
import {icon,cta,tile} from './icons.js';
import {createGuest} from './guest.js'; // guest:
import {createCalendarUI} from './calendar-ui.js';
import {createRituals,createShrinePicks,shrineSpots} from './rituals.js';
import {createDiary,tokyoDate,shouldToastDiary} from './diary.js';
import {createPhoto,serverCardUrl} from './photo.js';
import {startTelemetry} from './telemetry.js';
import {awayCard} from './away.js';
import {cityLayout} from './lots.js';
import {createChat} from './chat.js'; // chat:
import {createGovernor,settingsFor,startLevel,gpuName,createFuse,packResume,unpackResume,safeStore,timeoutSignal,nextPollDelay,GOV,RESUME_KEY,RESUME_MAX_AGE} from './quality.js';
// Never a white page: an uncaught error or rejection is one quiet console line. If the city never drew its first frame
// (no WebGL, a module that failed), the loading screen says so instead of spinning forever.
let booted=false,telemetry=null;   // telemetry: startTelemetry() below; an uncaught error marks the session as crashed
addEventListener('error',e=>{if(!e.error&&!e.message)return;telemetry?.markCrash();console.warn('[city] uncaught:',e.message||e.error);e.preventDefault();
  if(!booted){const t=document.getElementById('loading-text');if(t)t.textContent='The 3D city could not start in this browser (WebGL may be off). Reload, or try another browser.';}});
addEventListener('unhandledrejection',e=>{console.warn('[city] unhandled:',e.reason?.message||e.reason);e.preventDefault();});

const $ = id => document.getElementById(id);
const mobile = matchMedia('(max-width:600px)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)').matches;
let roomView=null,cityBuildings=[],cityRenderer,world=null,me=null,lookOptions=null,walker=null,goal=null,serverUp=null,worldKey='';
const resident=()=>me?.resident||null;
let selectedPlace = places[0], night = false, follow = false, currentDialog = null, previousFocus = null;
let cityTour=null,cityGreen=null;
// Rituals, calendar, diary, photo mode (section 'Rituals' below); roomPlot = the apartment whose room is open.
let calendar=null,rituals=null,diary=null,photo=null,shrinePicks=null,myBuff=null,roomPlot=null;const shrineLabels=[];
// Quality governor state (quality.js; section 'Quality governor' below). Q = the current level's settings.
let governor=null,Q=settingsFor(3,{mobile,dpr:devicePixelRatio||1}),ratioDirty=false,glLost=false;
// City events: launch parties, the accepted-idea flash, and a client-only visit followed by the camera.
let partyGoal=null,partyWaveAt=0,markerFlash=0,followObj=null,visitKey=null,walkButton=null;const seenEvents=new Set();
let character, sub01, cameraTween = null, toastTimer;
// Explore mode (explore.js): the resident's own model walks the city; client-only. Taps on the ground pick a plane at y=0.25.
let explorer=null,lastTap={t:0,x:0,y:0};const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-.25),tapPoint=new THREE.Vector3();
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
const OVERVIEW = CS.OVERVIEW_ZOOM ?? { desktop: .19, mobile: .09, min: .07 };
controls.minZoom = OVERVIEW.min; controls.maxZoom = 2.8;   // 2026-10-10: clampToCity() raises minZoom every frame to the zoom at which the frame fits the city
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
const FOG = { near: 12, far: 330 }, fogMul = { near: 1, far: 1 };
scene.fog = new THREE.Fog(LOOK.day.fog, 100, 300);
// One shadow map near what the camera looks at: the light follows controls.target (snapped to whole texels so edges do
// not crawl while panning) and its box grows with the visible area, from ±18 up close to ±62 in the overview.
let shadowHalf = 0;
function updateSunAndFog() {
  if(horizon&&scene.fog)horizon.material.color.copy(scene.fog.color);
  const d = camera.position.distanceTo(controls.target); scene.fog.near = d + FOG.near * fogMul.near; scene.fog.far = d + FOG.far * fogMul.far;
  if (!sunlight.castShadow) return;
  const half = THREE.MathUtils.clamp(Math.max(camera.right, camera.top) / camera.zoom * 1.1, 18, 100);
  if (Math.abs(half - shadowHalf) > .5) { shadowHalf = half; Object.assign(sunlight.shadow.camera, { left: -half, right: half, top: half, bottom: -half }); sunlight.shadow.camera.updateProjectionMatrix(); sunlight.shadow.normalBias = half * 2 / SHADOW_MAP * .9; }
  const texel = shadowHalf * 2 / SHADOW_MAP, t = controls.target;
  sunlight.target.position.set(Math.round(t.x / texel) * texel, 0, Math.round(t.z / texel) * texel);
  sunlight.position.copy(sunlight.target.position).addScaledVector(sunDir, SUN_DISTANCE);
}
const roomLight = new THREE.PointLight('#ffb366', 0, 12); roomLight.position.set(-6, 3, -4); scene.add(roomLight);
// Pedestrians, residents and party guests up close: rigged characters drawn by instanced GPU skinning (crowd-gpu.js).
const crowdGPU = createCrowdGPU(scene, { mobile, lights: { hemi, dirs: [sunlight, fill] } });

function addLabel(place, height) {
  const element = document.createElement('button'); element.className = 'world-label';
  const dot = document.createElement('i'); dot.style.background = dot.style.color = place.color;
  // A ticket: the stub dot, the name, the ticker in orange (tickets carry 'Name · $TICK').
  const [name, ticker] = (place.id === 'home' ? 'SUB-01 / HOME' : place.name.toUpperCase()).split(' · $');
  element.append(dot, document.createTextNode(name), ...(ticker ? [Object.assign(document.createElement('em'), { textContent: '$' + ticker })] : []));
  element.onclick = () => showPlace(place); $('labels').append(element);
  labels.push({ element, position: new THREE.Vector3(place.x, height, place.z) });
}

async function template(kind, name) {
  const url = `/assets/${kind}/${name}.${kind === 'characters' || kind === 'room' ? 'glb' : 'gltf'}`;
  if (!cache.has(url)) cache.set(url, new GLTFLoader().loadAsync(url).then(gltf=>{toonify(gltf.scene);return gltf;}));
  return cache.get(url);
}
// Hero block (wave 5B, hero-home.js): SUB-01's house, the lane with its Inari corner and vending pair, the three example
// places and Orange Apartments, all in the city's language. HERO_TREES are planted by city-green.js with the city's own.
const HERO={top:.135};
const HERO_TREES=[[9.8,-.5],[-12.6,3.75],[-4.4,3.75],[2.4,3.75],[12.6,3.75]].map(([x,z])=>({species:'zelkova',x,z,y:HERO.top,s:.92}))
  .concat([{species:'grove',x:-13.25,z:-5.7,y:HERO.top,s:.72},{species:'grove',x:-11.95,z:-6.2,y:HERO.top,s:.55}]);
let heroHome=null;
// One ground under the whole city (owner bug: sky-coloured strips between districts at close zoom): a concrete plane
// over CITY_EXTENT + the suburbs at y = −0.02 with a hole for the river (landmarks.js riverHole, water at −1.05). One
// geometry, vertex colours, one draw call; the city's ground night tint (#55617A) in-shader. renderOrder −10: the ground
// is drawn first, so Fuji (tokyo-style.js, a backdrop standing on this plane) paints over it at −5 before the city.
let horizon=null;
// Owner 2026-10-10: nothing outside the city. The plate stops just past the blocks and a ring fades it into the fog
// colour (vertex aFade, mixed in after lighting so it matches the horizon plane exactly): no edge, no suburbs, mist.
const GROUND_PLANE={near:'#8E8E88',margin:8,fadeRing:38,far_:600,y:-.02,farY:-1.6,renderOrder:-10};
function cityGround(){
  const E=CS.OUTER_EXTENT??CS.CITY_EXTENT,M=GROUND_PLANE.margin,x0=E.minX-M,x1=E.maxX+M,z0=E.minZ-M,z1=E.maxZ+M,F=GROUND_PLANE.far_,h=CS.CANAL_X==null?null:riverHole();
  const rects=[],R=(a,b,c,d,y,col)=>{if(b-a>.01&&d-c>.01)rects.push([a,b,c,d,y,col]);},Y=GROUND_PLANE.y,N=GROUND_PLANE.near;
  if(h&&h.x0>x0&&h.x1<x1){const cz0=Math.max(z0,E.minZ-3),cz1=Math.min(z1,E.maxZ+3);   // the river runs the outer ring's full length
    R(x0,h.x0,z0,z1,Y,N);R(h.x1,x1,z0,z1,Y,N);R(h.x0,h.x1,z0,cz0,Y,N);R(h.x0,h.x1,cz1,z1,Y,N);}
  else R(x0,x1,z0,z1,Y,N);
  const pos=[],nor=[],col=[],fade=[],c=new THREE.Color();c.set(N);
  const V=(x,z,f)=>{pos.push(x,Y,z);nor.push(0,1,0);col.push(c.r,c.g,c.b);fade.push(f);};
  for(const [a,b,zA,zB] of rects)for(const [x,z] of [[a,zA],[a,zB],[b,zA],[b,zA],[a,zB],[b,zB]])V(x,z,0);
  // Fade ring: four strips (inner edge fade 0, outer edge fade 1) whose corners meet at the outer rectangle.
  const W=GROUND_PLANE.fadeRing,X0=x0-W,X1=x1+W,Z0=z0-W,Z1=z1+W;
  const strip=(p0,p1,q0,q1)=>{for(const [x,z,f] of [p0,p1,q1,p0,q1,q0])V(x,z,f);};   // p = inner edge (0), q = outer edge (1)
  strip([x0,z0,0],[x1,z0,0],[X0,Z0,1],[X1,Z0,1]);strip([x1,z1,0],[x0,z1,0],[X1,Z1,1],[X0,Z1,1]);
  strip([x0,z1,0],[x0,z0,0],[X0,Z1,1],[X0,Z0,1]);strip([x1,z0,0],[x1,z1,0],[X1,Z0,1],[X1,Z1,1]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setAttribute('aFade',new THREE.Float32BufferAttribute(fade,1));
  const m=toon({vertexColors:true}),prev=m.onBeforeCompile;
  m.onBeforeCompile=(s,r)=>{prev.call(m,s,r);s.uniforms.uGpNight=nightAmount;s.uniforms.uGpTint={value:new THREE.Color().setHex(0x55617A,THREE.LinearSRGBColorSpace)};
    s.vertexShader='attribute float aFade;varying float vFade;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFade=aFade;');
    s.fragmentShader='uniform float uGpNight;uniform vec3 uGpTint;varying float vFade;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(vec3(1.),uGpTint,uGpNight);')
      .replace('#include <fog_fragment>','#ifdef USE_FOG\ngl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,vFade);\n#endif\n#include <fog_fragment>');};
  m.customProgramCacheKey=()=>'ground-plane-fade';
  const mesh=new THREE.Mesh(g,m);mesh.name='city ground';mesh.renderOrder=GROUND_PLANE.renderOrder;mesh.receiveShadow=true;mesh.raycast=()=>{};mesh.frustumCulled=false;scene.add(mesh);
  // Horizon: a far plane in the fog colour (unlit, unfogged) under everything, so the ring's outer edge meets haze.
  // It must stay BELOW the river water (−1.05): at −0.06 it hid the whole river (owner 2026-10-10: "the water broke").
  horizon=new THREE.Mesh(new THREE.PlaneGeometry(F*2,F*2).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:scene.fog?.color||'#E6DFD2',fog:false}));horizon.position.y=GROUND_PLANE.farY;horizon.renderOrder=GROUND_PLANE.renderOrder-1;horizon.raycast=()=>{};horizon.frustumCulled=false;scene.add(horizon);
  return mesh;
}
function groundwork() {
  cityGround();
}
async function makeHome() {
  heroHome=await buildHeroHome(scene,{template,interactive,addLabel,places:{home:places[0],lab:places[1],arcade:places[2],studio:places[3],residence},
    getWorld:()=>world,getLife:()=>cityRenderer?.life,getCharacter:()=>sub01,light:roomLight});
  if(sub01)heroHome.arrive(sub01,'desk');
}
async function makeBuildings() {}   // the example places are part of the hero block (hero-home.js)
async function makeCharacter() {
  // SUB-01 keeps his dark hoodie and hair; skin stays the model's own. He starts in his gaming chair.
  sub01=await loadCharacter({outfit:'hoodie',top:'#313a37',bottom:'#313a37',hair:'#202a26'},{template});
  character=sub01.root;character.scale.setScalar(1.55/HEIGHT);
  character.position.set(HOME_DESK.x,.335,HOME_DESK.z); character.rotation.y = Math.PI; scene.add(character);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.17),toon({ color: '#ff7b32', emissive: '#ff7620', emissiveIntensity: .25, roughness:.5 }));
  // Marker sits in scene units so it is not affected by the imported rig scale.
  scene.add(marker); character.userData.marker=marker;
  heroHome?.arrive(sub01,'desk');
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
  const available=cityPlots.filter(p=>!p.reserved&&(!district||p.district===district)).map(placeFor);   // reserved tower-park plots are not addresses
  const mine=new Set(me?.plots?.map(p=>p.plotId)||[]),ideas=(me?.ideas||[]).filter(i=>i.status!=='cancelled').slice(0,5).map(i=>({id:'idea-'+i.id,name:i.title,color:i.status==='declined'?'#9a9d92':'#fb752b',kind:'YOUR IDEA',status:IDEA_STATUS[i.status]||i.status,description:i.status_note||'',slug:i.slug,ideaId:i.id})),landmarks=[...ideas,tower,...places];
  const yours=available.filter(p=>p.claimed&&mine.has(p.id)),others=available.filter(p=>p.claimed&&!mine.has(p.id));
  for (const p of district?[...yours,...others,...landmarks,...available.filter(p=>!p.claimed)]:[...yours,...landmarks,...others]) {
    const button=document.createElement('button');button.className='project-row';button.setAttribute('aria-label',`Open ${p.name}`);
    const symbol=tile(tileSpec(p));
    const meta=document.createElement('span');meta.className='project-meta';
    const title=document.createElement('span');title.className='project-title';title.textContent=p.name;
    // The status dot: green launched, orange a real idea or project, grey everything else (homes, lots, example places).
    const status=document.createElement('span');status.className='project-status';const dot=document.createElement('i');
    dot.className='dot'+(p.building?.phase==='open'||p.status==='Launched'?' ok':p.building?.type==='project'||(p.ideaId&&p.color!=='#9a9d92')?'':' idle');status.append(dot,p.status||'');
    meta.append(title,status);const arrow=document.createElement('span');arrow.className='project-arrow';arrow.append(addressCode(p.id),icon('cr'));
    button.append(symbol,meta,arrow);button.onclick=()=>showPlace(p);$('project-list').append(button);
  }
  stationBoard(district,available);
}
// The station board (ekimeihyō): the current district big, its neighbours as buttons, an orange band with the counts.
// The hidden <select id="district-select"> stays the source of truth; the board only reads and sets its value.
const districtIds=()=>['',...districts.map(d=>d.id)],districtName=id=>id?(districts.find(d=>d.id===id)?.name||id).split(' / ')[0].toUpperCase():'TOKYO';
function stationBoard(id,available){
  const ids=districtIds(),k=Math.max(0,ids.indexOf(id)),prev=ids[(k-1+ids.length)%ids.length],next=ids[(k+1)%ids.length],name=districtName(id);
  $('eki-kanji').textContent=kanjiOf(id);$('eki-name').textContent=name;$('eki-name').parentElement.classList.toggle('is-long',name.length>9);$('eki-code').textContent=codeOf(id);
  for(const [side,to] of [['prev',prev],['next',next]]){const b=$('eki-'+side);b.dataset.id=to;$(`eki-${side}-name`).textContent=districtName(to);b.setAttribute('aria-label',`${side==='prev'?'Previous':'Next'} district: ${to?districtName(to):'the whole city'}`);}
  $('project-count').textContent=String(available.length);$('eki-live').textContent=String(available.filter(p=>p.claimed).length);
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
// The leading tile of a place (icons.js tile()): the real thing, never a glyph. A project shows its coin logo (private →
// a lock), a resident their initials on their colour, SUB-01 the brand mark, landmarks an SVG glyph, a free lot its kanji.
function tileSpec(p){const b=p.building;
  if(p.id==='home')return {kind:'sub01'};
  if(p.id==='tower')return {kind:'landmark',icon:'tower',color:p.color};
  if(p.ideaId)return {kind:'idea',color:p.color};
  if(b?.type==='project')return {kind:'project',logo:b.logoUrl,private:b.private,color:b.color||p.color,kanji:kanjiOf(p.district)};
  if(b?.type==='apartment')return {kind:'resident',name:b.name,color:b.color||p.color};
  if(p.icon)return {kind:'landmark',icon:p.icon,color:p.color};
  return {kind:'lot',kanji:kanjiOf(p.district),color:p.color};}
function showPlace(p) {
  if(p.id&&cityPlots.some(c=>c.id===p.id))p=placeFor(cityPlots.find(c=>c.id===p.id));
  selectedPlace=p;const b=p.building,project=b?.type==='project';
  $('detail-progress').hidden=$('detail-progress-head').hidden=!project;if(project){const pct=Math.round(b.progress*100)+'%';$('detail-progress').firstElementChild.style.width=pct;$('detail-pct').textContent=pct;}
  $('detail-fees-box').hidden=!project;$('detail-milestones').hidden=b?.type==='apartment';
  // The metro line (idea → build → launch) and the hanko seal show the same phase; the seal is decorative (aria-hidden).
  const step=project?{thinking:0,open:3,launch:2}[b.phase]??1:p.ideaId?0:-1;
  [...$('detail-milestones').children].forEach((s,i)=>{s.className=step>i||step===3?'done':step===i?'now':'';});
  $('detail-milestones').style.setProperty('--line',step<0?'0%':`${Math.min(100,step*50)}%`);
  const seal=step<0||p.color==='#9a9d92'?null:step===0?['構想','IDEA','']:step===3?['開業','LAUNCHED','ok']:b?.phase==='stopped'?['待機','ON HOLD','idle']:['建設中','BUILDING',''];
  $('detail-hanko').hidden=!seal;if(seal){$('detail-hanko').className='hanko'+(seal[2]?' '+seal[2]:'');$('detail-hanko').firstElementChild.textContent=seal[0];$('detail-hanko').lastElementChild.textContent=seal[1];}
  $('detail-disclosure').textContent=project?'Creator fees are fixed at launch: 80% to the idea author, 20% to SUB-01. The token is created by the author\'s own wallet signature.':b?'':'Example place. Real projects appear when someone drops an idea in SUB-01\'s mailbox.';
  $('takeover-button').hidden=true;$('detail-roles').hidden=true;
  // Rituals: build-or-pass on a thinking public project, SUB-01's diary on his desk, the server's share card.
  const predictable=project&&b.phase==='thinking'&&!b.private;$('detail-predict').hidden=true;
  if(predictable)rituals?.predict($('detail-predict'),{ideaId:ideaIdOf(b),own:!!p.mine});else rituals?.predict(null,{ideaId:null});
  $('detail-diary').hidden=p.id!=='home';const card=serverCardUrl(b,p.id);$('detail-share').hidden=!card;if(card)$('detail-share').href=card;
  if(project&&b.slug)loadRoles(b);$('detail-name').textContent=p.name;$('detail-category').textContent=p.kind;
  $('detail-description').textContent=p.description;$('detail-state').textContent=p.status;
  const vacant=!b&&!p.ideaId&&cityPlots.some(l=>l.id===p.id),noLogo=project&&p.mine&&!b.private&&!b.logoUrl;$('detail-icon').replaceChildren(tile(vacant?{empty:true,label:'Your logo here'}:tileSpec(p),'lg'));$('detail-tile-cap').hidden=!(vacant||noLogo);$('detail-tile-cap').textContent=noLogo?'Your coin logo goes here':'Your logo here';
  visitWalk(p);cta($('visit-button'),p.ideaId?'Open the idea ↗':b?.type==='apartment'?(p.mine?'Enter your room →':'Visit '+b.name+'\'s room →'):project?(b.slug?(p.mine?'Open your office ↗':'Open project page ↗'):'Watch the site →'):cityPlots.some(l=>l.id===p.id)?'Drop an idea here →':'Visit this place →');
  openDialog('detail-backdrop');
}
function focusPlace(p) {
  cityTour=null;follow=false;
  if(p.x===undefined){notify('Your brief is saved here. Building integration comes next.');return;}
  cameraTween={ start: controls.target.clone(), target: new THREE.Vector3(p.x,p.id==='tower'?24:2,p.z), zoom:camera.zoom, endZoom:p.id==='tower'?.5:1.65, elapsed:0 };
}
function notify(text){clearTimeout(toastTimer);const ic=document.createElement('span');ic.className='ic';ic.append(icon('check'));$('toast').replaceChildren(ic,Object.assign(document.createElement('span'),{textContent:text}));$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4500);}
function meetDev(){cityTour=null;if(!character)return;follow=true;camera.zoom=mobile?1.1:1.5;camera.updateProjectionMatrix();notify(goal?.text||'Following SUB-01.');}
function resize(){const w=innerWidth,h=innerHeight,aspect=w/h;const half=mobile?18:16.5;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(w,h);roomView?.resize(aspect);}
// Camera (wave 2B): ortho at a fixed yaw of 36° (avoids two equal faces). CAMERA.pitch is the one tunable: wave 1 sat at
// 32.5°; at that angle a 2-floor near-row building (6.1 tall) hides ~6 units of ground behind it, i.e. the whole side
// street, so it is raised to 40° (hides ~0.97 × height) — the street and the far ground floors read at district zoom.
// Every tween only translates the camera, so the pitch set here holds until the user orbits.
const CAMERA={pitch:40,yaw:36,distance:168};
function aimCamera(target){const p=THREE.MathUtils.degToRad(CAMERA.pitch),y=THREE.MathUtils.degToRad(CAMERA.yaw),d=CAMERA.distance;
  controls.target.copy(target);camera.position.set(target.x+d*Math.cos(p)*Math.sin(y),target.y+d*Math.sin(p),target.z+d*Math.cos(p)*Math.cos(y));}
// 2026-10-10: the overview target sits north of the city centre, so Fuji (foot on the ground) clears the header.
const OVERVIEW_TARGET=new THREE.Vector3(-45,8,-66);   // north of centre: the clamp slides it so the frame ends at the north edge, with Fuji above it
// The view never leaves the city (owner 2026-10-10, twice): the WHOLE frame has to lie over the blocks. Each frame the
// four corners of the orthographic frustum are cast onto the ground (y = 0); their bounding box must sit inside
// CITY_EXTENT (+ VIEW_PAD). If it sticks out, target and camera shift together (pitch and zoom untouched); if it is
// wider than the city, the zoom floor rises to the zoom at which it just fits (controls.minZoom follows, so the wheel,
// the pinch and the −/+ buttons stop there). Runs after controls.update(), so drags, tweens, follows and tours obey it.
// Per-side allowance: the frame may run one pitch past the blocks, into the outer ring of ghost districts (east: river
// and expressway first), never onto bare ground. The target itself never leaves the 7x7.
const VIEW_PAD=2,VIEW_ALLOW={north:34,west:34,east:52,south:34},_fr=new THREE.Vector3(),_fu=new THREE.Vector3(),_fd=new THREE.Vector3(),_fp=new THREE.Vector3(),_clampD=new THREE.Vector3();
function viewFootprint(out={minX:0,maxX:0,minZ:0,maxZ:0}){
  camera.matrixWorld.extractBasis(_fr,_fu,_fd);_fd.negate();if(_fd.y>-.05)return null;   // _fd = view direction (−local z)
  const W=(camera.right-camera.left)/(2*camera.zoom),H=(camera.top-camera.bottom)/(2*camera.zoom);
  out.minX=out.minZ=Infinity;out.maxX=out.maxZ=-Infinity;
  for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){_fp.copy(camera.position).addScaledVector(_fr,sx*W).addScaledVector(_fu,sy*H);const t=-_fp.y/_fd.y;_fp.addScaledVector(_fd,t);
    out.minX=Math.min(out.minX,_fp.x);out.maxX=Math.max(out.maxX,_fp.x);out.minZ=Math.min(out.minZ,_fp.z);out.maxZ=Math.max(out.maxZ,_fp.z);}
  return out;
}
const _foot={minX:0,maxX:0,minZ:0,maxZ:0};
function clampToCity(){
  const E=CS.CITY_EXTENT,f=viewFootprint(_foot);if(!f)return;
  const minX=E.minX-VIEW_PAD-VIEW_ALLOW.west,maxX=E.maxX+VIEW_PAD+VIEW_ALLOW.east,minZ=E.minZ-VIEW_PAD-VIEW_ALLOW.north,maxZ=E.maxZ+VIEW_PAD+VIEW_ALLOW.south;
  const cityW=maxX-minX,cityD=maxZ-minZ,w=f.maxX-f.minX,d=f.maxZ-f.minZ;
  // Zoom floor: the frame fits the city in both axes. OVERVIEW.min stays only as a sanity bound.
  const fit=camera.zoom*Math.max(w/cityW,d/cityD,1e-6);controls.minZoom=Math.max(OVERVIEW.min,fit*1.002);
  if(camera.zoom<controls.minZoom){camera.zoom=controls.minZoom;camera.updateProjectionMatrix();if(!viewFootprint(f))return;}
  const fix=(lo,hi,min,max)=>hi-lo>=max-min?((min+max)-(lo+hi))/2:lo<min?min-lo:hi>max?max-hi:0;
  _clampD.set(fix(f.minX,f.maxX,minX,maxX),0,fix(f.minZ,f.maxZ,minZ,maxZ));
  if(_clampD.x||_clampD.z){controls.target.add(_clampD);camera.position.add(_clampD);}
}
function resetView(){cityTour=null;follow=false;cameraTween=null;aimCamera(OVERVIEW_TARGET.clone());camera.zoom=mobile?OVERVIEW.mobile:OVERVIEW.desktop;camera.updateProjectionMatrix();controls.update();}

// The mailbox needs a signed-in resident. Each step opens the next one.
async function openBuildForm(plot){
 if(!serverUp){notify('The city server is offline. Ideas cannot be dropped right now.');return;}
 if(!me?.user){guest.requireWallet('idea',()=>openBuildForm(plot));return;} // guest: sign-in with the reason line
 if(!me?.user){openSignIn(()=>openBuildForm(plot));return;}
 if(!resident()){openCreator(()=>openBuildForm(plot));return;}
 const free=cityPlots.filter(p=>!p.reserved&&!cityBuildings.some(b=>b.plotId===p.id));
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
// The account chip: signed out a wallet icon and "Sign in"; signed in an avatar with the initials, the name and a chevron.
function accountChip(name){const b=$('account-button'),nm=Object.assign(document.createElement('span'),{className:'nm',textContent:name||'Sign in'});
  if(!name){b.replaceChildren(icon('wallet'),nm);return;}
  const initials=(name.match(/[\p{L}\p{N}]/gu)||['?']).slice(0,2).join('').toUpperCase();
  b.replaceChildren(Object.assign(document.createElement('span'),{className:'avatar',textContent:initials,ariaHidden:'true'}),nm,icon('cd','i chev'));}
// A timeout or a dead network keeps the account as it was (the server answered nothing); a real answer replaces it.
async function refreshMe(){const before=knownStatus;try{me=await getJSON('/api/me');if(typeof me?.user!=='object')me=null;}catch(err){if(!(err instanceof ApiError)&&me)return;me=null;}
  // Tell the author when SUB-01 decides or a stage changes; private ideas never reach the public news.
  knownStatus=Object.fromEntries((me?.ideas||[]).map(i=>[i.id,i.status]));
  if(before)for(const i of me?.ideas||[])if(before[i.id]&&before[i.id]!==i.status)notify(i.status==='declined'?`SUB-01 passed on “${i.title}”. ${i.status_note?.split(' [')[0]||''}`:`“${i.title}”: ${IDEA_STATUS[i.status]||i.status}.`);accountChip(me?.user?(resident()?.name||short(me.user.wallet)):null);renderList();updateResident();if(!resident())stopExplore();rituals?.syncAccount();updateBuffs();}
function openCreator(next){
 if(!lookOptions){notify('The city server is offline.');return;}
 const r=resident(),look=r?.look||{};$('resident-name').value=r?.name||'';$('resident-error').textContent='';
 // Before the first save the wallet has no tier yet; null opens the resident tier, which the server grants on creation.
 renderLookFields($('look-fields'),lookOptions,look,me?.unlocks?.tier?me.unlocks:null,r?.traits||{});
 const taken=new Set(cityBuildings.map(b=>b.plotId));if(r?.plotId)taken.delete(r.plotId);
 $('resident-plot').replaceChildren(...cityPlots.filter(p=>!p.reserved&&!taken.has(p.id)).map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));
 if(r?.plotId)$('resident-plot').value=r.plotId;
 $('resident-form').onsubmit=async e=>{e.preventDefault();const {look,traits}=readLook($('look-fields'));
  try{await api('/api/residents',{method:'POST',body:{name:$('resident-name').value,look,traits,plotId:$('resident-plot').value}});await refreshMe();await pollWorld();closeDialog();notify(`Welcome to Tokyo, ${resident()?.name}.`);next?.();}catch(err){$('resident-error').textContent=err.message;}};
 openDialog('resident-backdrop');
}
// guest: play first, wallet later (src/guest.js). main.js lends it these internals and wraps three entry points.
const guest=createGuest({get me(){return me;},get options(){return lookOptions;},get buildings(){return cityBuildings;},get goal(){return goal;},get serverUp(){return serverUp;},get explorer(){return explorer;},set explorer(v){explorer=v;},get cityEvents(){return cityEvents;},template,mobile,refreshMe,pollWorld,openDialog,closeDialog,notify,roamStart,roamEnd,greet,bubble,exploreUI,stopExplore,track(root){followObj=root;follow=true;}}); // guest:
openSignIn=guest.wrapSignIn(openSignIn);openCreator=guest.wrapCreator(openCreator);toggleExplore=guest.wrapExplore(toggleExplore); // guest:
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
// Canal and metro from city-state.js (wave 4A); the station sits 26 route units west of centre, stretched to the city.
const METRO_Z=CS.METRO_Z??78,CE=CS.CITY_EXTENT,STATION_X=CE?(CE.minX+CE.maxX)/2-26*(CE.maxX-CE.minX)/145:-26;
const cityViews=[{x:-29,z:-28,y:24,zoom:.5,text:'Tokyo Tower / Shiba'},{x:29,z:2,y:4,zoom:.72,text:'Shibuya / Neon crossing'},{x:55,z:-58,y:16,zoom:.48,text:'Broadcast tower / Skyline'},{x:canalLayout().x,z:2,y:1,zoom:.56,text:'Waterfront / Bridges'},{x:STATION_X,z:METRO_Z,y:4,zoom:.56,text:'Metro / City in motion'}];
function nextCityView(){const v=cityViews[cityTour.index];follow=false;cameraTween={start:controls.target.clone(),target:new THREE.Vector3(v.x,v.y,v.z),zoom:camera.zoom,endZoom:mobile?v.zoom*.55:v.zoom,elapsed:0};$('activity-text').textContent=v.text;}

$('district-select').onchange=()=>{cityTour=null;renderList();const d=districts.find(d=>d.id===$('district-select').value);if(d){follow=false;cameraTween={start:controls.target.clone(),target:new THREE.Vector3(d.x,2,d.z),zoom:camera.zoom,endZoom:mobile?.36:.72,elapsed:0};}else resetView();};
for(const side of ['prev','next'])$('eki-'+side).onclick=()=>{$('district-select').value=$('eki-'+side).dataset.id||'';$('district-select').onchange();};
$('home-view').onclick=()=>focusPlace(places[0]);
$('tower-view').onclick=()=>focusPlace(tower);
$('idea-close').onclick=$('detail-close').onclick=closeDialog;
for(const b of document.querySelectorAll('[data-close]'))b.onclick=closeDialog;
for(const id of ['idea-backdrop','detail-backdrop','signin-backdrop','resident-backdrop','calendar-backdrop','shrine-backdrop','ledger-backdrop','diary-backdrop','about-backdrop','postcard-backdrop']) $(id).onclick=e=>{if(e.target===$(id))closeDialog();};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!currentDialog&&photo?.on)photo.exit();closeDialog();}
  if(e.key==='Tab'&&currentDialog){const nodes=[...currentDialog.querySelectorAll('button,input,textarea,select')].filter(n=>!n.disabled);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}
});
$('visit-button').onclick=()=>{
 const p=selectedPlace,b=p?.building;closeDialog();
 if(b?.type==='apartment'){stopExplore();roomPlot=p.id;openRoom({plotId:p.id,mine:p.mine,me,onEdit:()=>openCreator()});return;}
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
for(const [id,factor] of [['zoom-in',1.2],['zoom-out',1/1.2]])$(id).onclick=()=>{cityTour=null;camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,controls.minZoom,2.8);camera.updateProjectionMatrix();};
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
function roamStart(r,root){visitKey=boxKey(r.plotId);residents.hide(new Set(visitKey?[visitKey]:[]));roamTag.element.replaceChildren(icon('walk'),r.name);if(!labels.includes(roamTag)){$('labels').append(roamTag.element);labels.push(roamTag);}cityTour=null;cameraTween=null;followObj=root;follow=true;camera.zoom=mobile?1.1:1.5;camera.updateProjectionMatrix();}
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
function exploreUI(){const s=explorer?.state,b=$('explore-button');b.replaceChildren(icon(explorer?'home':'walk','i lead'),!explorer?'Explore':s==='home'?'Home now':'Go home');b.setAttribute('aria-pressed',String(!!explorer));
 document.body.classList.toggle('is-exploring',!!explorer);
 // The hint pill: key caps for the gesture, mono words for the rest.
 const kbd=t=>Object.assign(document.createElement('span'),{className:'kbd',textContent:t}),dim=Object.assign(document.createElement('span'),{className:'dim',textContent:'·'});
 $('world-hint').replaceChildren(...(explorer?[kbd('TAP'),' A STREET TO WALK ',dim,' ',kbd('DOUBLE-TAP'),' TO RUN']:[kbd('DRAG'),' TO EXPLORE ',dim,' ',kbd('CLICK'),' A BUILDING']));}
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
  const hit=raycaster.intersectObjects(interactive,false)[0];const shrine=shrinePicks?.spotOf(hit);if(shrine){rituals?.openShrine('omikuji',shrine);return;}if(hit&&cityRenderer?.select(hit))return;if(hit?.object.userData.place){showPlace(hit.object.userData.place);return;}
  // Explore mode: a tap on the ground walks the resident there along the streets; a second tap within 350 ms runs.
  if(explorer&&raycaster.ray.intersectPlane(groundPlane,tapPoint)){const t=performance.now(),run=t-lastTap.t<350&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<40;
   lastTap.t=run?0:t;lastTap.x=e.clientX;lastTap.y=e.clientY;if(explorer.tap(tapPoint,{run})&&cityEvents.visitor){followObj=cityEvents.visitor;follow=true;cameraTween=null;}}
});
$('district-select').replaceChildren();const all=document.createElement('option');all.value='';all.textContent='Entire city';$('district-select').append(all);for(const d of districts){const option=document.createElement('option');option.value=d.id;option.textContent=d.name;$('district-select').append(option);}
addEventListener('resize',()=>{resize();governor?.grace(GOV.grace.resize,performance.now());});resize();resetView();renderList();groundwork();cityRenderer=createCity(scene,interactive,showPlace,cityBuildings,{mobile,gpu:crowdGPU});cityGreen=addCityGreen(scene,{buildings:cityBuildings,mobile,extra:HERO_TREES});addLabel(tower,51);
for(const d of districts){const element=document.createElement('button');element.className='world-label district-label';element.textContent=d.name.toUpperCase();element.dataset.kanji=kanjiOf(d.id);element.onclick=()=>{$('district-select').value=d.id;$('district-select').onchange();};$('labels').append(element);labels.push({element,district:true,position:new THREE.Vector3(d.x,.4,d.z+11.4)});}
// Phone layout (style.css ≤ 600px): SUB-01's activity bar joins the project panel as one bottom dock; the world-control
// rail sits above the dock, whose height is kept in --dock-h.
{const phoneMQ=matchMedia('(max-width:600px)'),dock=()=>{const a=$('activity');if(phoneMQ.matches)$('project-panel').append(a);else $('project-panel').after(a);};
 dock();phoneMQ.addEventListener?.('change',dock);
 if(typeof ResizeObserver==='function')new ResizeObserver(()=>document.documentElement.style.setProperty('--dock-h',$('project-panel').offsetHeight+'px')).observe($('project-panel'));}

// Shared world: the server is the source of truth; the city redraws only when something changed.
const residents=addResidents(scene),worldLabels=[],cityEvents=createCityEvents(scene,{mobile,reducedMotion,gpu:crowdGPU});
// Rooms borrow this renderer; the city stops updating while one is open.
attachRoomHost({template,notify,openIdea(){openBuildForm();},
  // Rituals in a room (room.js): a postcard button, SUB-01's diary by the desk, the 'while you were away' card in your own room.
  photo(){photo?.enter();},openDiary(){diary?.open();},awayCard(){return awayCard(getJSON);},
  setView(view){
  // Memory audit: room.js's dispose() clears its scene but not its sun's shadow map (a 512² render target per visit
  // stayed on the GPU). The host frees the closing room's light shadow maps here; room.js runs its dispose() right after.
  if(!view&&roomView)roomView.scene.traverse(n=>{if(n.isLight&&n.shadow?.map)n.shadow.dispose();});
  if(!view){roomPlot=null;photo?.exit();}roomView=view;controls.enabled=!view;governor?.grace(GOV.grace.room,performance.now());if(view)fuses.room.reset();else ratioDirty=true;
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
  cityBuildings=items;cityRenderer.redraw(items);cityGreen?.redraw(items);residents.set(residentList());renderList();
  for(const l of worldLabels){l.element.remove();labels.splice(labels.indexOf(l),1);}worldLabels.length=0;
  for(const b of items.filter(b=>b.type==='project')){const plot=cityPlots.find(p=>p.id===b.plotId);addLabel({...placeFor(plot),name:b.ticker?`${b.name} · $${b.ticker}`:b.name,color:b.phase==='open'?'#ffcf6e':'#fb752b'},(cityRenderer.heightOf(b.plotId)??3)+(b.phase==='open'?2.6:1.4));worldLabels.push(labels.at(-1));}
  if(opened.length&&worldKey&&$('activity-text'))notify(`${opened[0].name} just opened its doors.`);
  updateShrines();
 }
 updateBuffs();updateCheers();
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
// Buttons made here, in the rail's atmosphere group (before #sep-day): weather (cycles), sound (procedural, off), LITE.
const control=(id,content,onclick)=>{const b=Object.assign(document.createElement('button'),{className:'icon-button',id,type:'button',onclick});b.append(content);$('sep-day').before(b);return b;};
const label=(b,text)=>{b.title=text;b.setAttribute('aria-label',text);};
const weatherButton=control('weather-mode',icon('umbrella'),()=>setWeather(nextMode(WX.mode),true));
const soundButton=control('city-sound',icon('note'),()=>{const on=ambience.toggle();soundButton.setAttribute('aria-pressed',String(on));label(soundButton,on?'City sounds: on':'City sounds: off');notify(on?'City sounds on (made in the browser, quiet).':'City sounds off.');});
soundButton.setAttribute('aria-pressed','false');label(soundButton,'City sounds: off');
const clockCaption=Object.assign(document.createElement('span'),{className:'tokyo-clock',hidden:true});$('activity-label').after(clockCaption);
function setWeather(mode,announce=false){WX.mode=mode;WX.fast=announce?10:0;weatherButton.dataset.mode=mode;
  label(weatherButton,mode==='auto'?'City weather: auto (a shared schedule, not real Tokyo weather)':`City weather: ${mode}`);
  if(announce)notify(mode==='auto'?'City weather: auto. The same for everyone, changing every few minutes. Not real Tokyo weather.':`City weather: ${mode}.`);}
const DAY_MODES=['auto','day','night'];
// A segmented control (#day-night): day, night, or the Tokyo clock (auto); the pressed one is the mode in force.
function setDayMode(mode){if(!DAY_MODES.includes(mode))mode='day';WX.dayMode=mode;for(const b of $('day-night').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));clockCaption.hidden=mode!=='auto';}
for(const b of $('day-night').querySelectorAll('button'))b.onclick=()=>setDayMode(b.dataset.mode);
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
  fogMul.near=A.fogNear;fogMul.far=A.fogFar;nightAmount.value=n;wxUniforms.wet.value=l.wet;wxUniforms.snow.value=l.cover;wxUniforms.time.value=seconds;wxUniforms.sakura.value=l.petals;wxUniforms.wear.value=1;
  const isNight=n>=.5;if(isNight!==WX.isNight){WX.isNight=night=isNight;roomLight.intensity=isNight?7:0;cityRenderer?.setNight(isNight);cityEvents.setNight(isNight);document.body.classList.toggle('is-night',isNight);}
  // The CSS sky (style.css #world) is left alone in plain day or night; otherwise main.js writes the mixed gradient.
  const sky=(n===0||n===1)&&l.overcast<.004&&!flash?'':skyGradient(n,l.overcast,flash);if(sky!==WX.sky){WX.sky=sky;$('world').style.background=sky;}
  cityRenderer?.crowd?.setHour?.(clockNow.hours);cityRenderer?.crowd?.setWeather?.(WX.state);
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
  ambience.update({hum:.5+.5*zoomIn,rain:Math.min(1,l.rain*1.2),train:train*(.35+.65*near(STATION_X,METRO_Z,70)),murmur:camera.zoom>.6?zoomIn*near(-29,2,16):0});
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
  wxView.setQuality(q);crowdGPU.setLimits({cap:q.crowdCap,budget:q.crowdTris});cityEvents.setQuality(q);cityRenderer?.setQuality?.(q);setTrafficQuality(governor.level);
  if(q.shadow&&q.shadow!==SHADOW_MAP){SHADOW_MAP=q.shadow;sunlight.shadow.mapSize.set(SHADOW_MAP,SHADOW_MAP);sunlight.shadow.map?.dispose();sunlight.shadow.map=null;shadowHalf=0;}
  if(roomView)ratioDirty=true;else renderer.setPixelRatio(q.pixelRatio);
  renderer.domElement.dataset.quality=`${q.level} ${governor.auto?'auto':'manual'} ${q.name}`;document.documentElement.dataset.quality=String(q.level);   // ≤ 1: opaque glass, no blur (style.css)
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
window.__city={quality,get scene(){return scene;},get green(){return cityGreen?.stats();},get fuses(){return fuses;},
  memory(){const m=renderer.info.memory;return {heapMB:performance.memory?+(performance.memory.usedJSHeapSize/1048576).toFixed(1):null,geometries:m.geometries,textures:m.textures,programs:renderer.info.programs?.length??null,objects:sceneCount(scene),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},
  get camera(){const t=controls.target;return {x:+t.x.toFixed(2),y:+t.y.toFixed(2),z:+t.z.toFixed(2),zoom:+camera.zoom.toFixed(3)};},
  view({x=0,y=2,z=0,zoom=1}={}){cityTour=null;follow=false;cameraTween=null;aimCamera(new THREE.Vector3(x,y,z));camera.zoom=zoom;camera.updateProjectionMatrix();controls.update();},
  audit:{room(plotId=aptPlots()[0],mine=false){return openRoom({plotId,mine,me});},get inRoom(){return !!roomView;},
   roam(){const at=frontOf(aptPlots()[0]);return !!cityEvents.explore({at,pet:{kind:'cat'},load:()=>loadCharacter({outfit:'jacket'},{template})});},
   visit(){const [from,to]=aptPlots();return !!cityEvents.visit({from,to,skate:true,pet:{kind:'dog'},load:()=>loadCharacter({outfit:'tee'},{template})});},
   endRoam(){cityEvents.endRoam();},get roaming(){return cityEvents.roaming;},
   // Textures the open room's scene draws (uuid, kind, size): compared across opens to find per-room textures.
   roomTextures(){const out=new Map();roomView?.scene.traverse(n=>{for(const m of [n.material].flat())for(const k of ['map','emissiveMap','alphaMap'])if(m?.[k])out.set(m[k].uuid,`${m[k].uuid.slice(0,6)} ${m[k].constructor.name} ${m[k].image?.width}x${m[k].image?.height} ${n.name||n.type}`);});return [...out.values()];}}};
// ---------- Rituals: calendar, shrine (omikuji, ema, predictions, ledger), diary, photo mode, telemetry, About ----------
// calendar-ui.js, rituals.js, diary.js, photo.js, telemetry.js, away.js. Nothing here awards anything of value.
const todayJST=()=>tokyoDate(Date.now());
// Fly to an address and open its card (calendar links, ?focus= share links).
function focusPlot(plotId){const f=frontOf(plotId);if(f){cityTour=null;follow=false;cameraTween={start:controls.target.clone(),target:new THREE.Vector3(f.x,2,f.z),zoom:camera.zoom,endZoom:mobile?.8:1.3,elapsed:0};}showPlace({id:plotId});}
// A world project's idea id: the snapshot's own field when the server sends it, the author's plot record, or the ema board (slug, then title).
function ideaIdOf(b){if(!b)return null;const w=world?.plots?.find(p=>p.plotId===b.plotId)?.project?.ideaId,own=me?.plots?.find(p=>p.plotId===b.plotId)?.ideaId;
  if(w||own)return w||own;const e=rituals?.ema||[];return (b.slug&&e.find(x=>x.slug===b.slug)||e.find(x=>x.title===b.name))?.ideaId||null;}
function ensureResident(next){if(!me?.user){guest.requireWallet('claim',()=>ensureResident(next));return;}if(!resident()){openCreator(next);return;}next?.();}
// Buffs: every resident's from /api/world (kind only), yours from your own slip at once (until midnight JST).
function updateBuffs(){if(myBuff&&Date.now()>myBuff.until)myBuff=null;const mine=resident()?.plotId;
  cityEvents.setBuffs(cityBuildings.filter(b=>b.type==='apartment').map(b=>{const f=frontOf(b.plotId),own=b.plotId===mine,kind=own&&myBuff?myBuff.kind:b.resident?.buff;
   return f&&kind&&kind!=='none'&&{x:f.x+1.2,z:f.z,kind,mine:own};}).filter(Boolean));}
// Cheer counters over thinking sites: the ema board's counts, matched to the building like ideaIdOf.
function updateCheers(){const e=rituals?.ema||[];if(!e.length){cityEvents.setCheers([]);return;}
  cityEvents.setCheers(cityBuildings.filter(b=>b.type==='project'&&b.phase==='thinking'&&!b.private).map(b=>{const id=ideaIdOf(b),x=e.find(r=>r.ideaId===id);return x&&{plotId:b.plotId,cheers:x.cheers};}).filter(Boolean));}
// Shrines: the open-ground spots lots.js lays out as 'shrine' (vacant plots turn into shrines or coin parking).
function updateShrines(){if(!shrinePicks)return;const spots=shrineSpots(cityLayout(cityBuildings));shrinePicks.set(spots);
  for(const l of shrineLabels){l.element.remove();const i=labels.indexOf(l);if(i>=0)labels.splice(i,1);}shrineLabels.length=0;
  for(const s of shrinePicks.spots){const a=shrinePicks.labelAt(s),element=Object.assign(document.createElement('button'),{className:'world-label shrine-label',type:'button'});
   element.append(Object.assign(document.createElement('i'),{}),document.createTextNode('SHRINE'),(()=>{const em=document.createElement('em');em.append(icon('torii'));return em;})());element.onclick=()=>rituals.openShrine('omikuji',s);
   $('labels').append(element);const l={element,position:new THREE.Vector3(a.x,a.y,a.z)};labels.push(l);shrineLabels.push(l);}}
shrinePicks=createShrinePicks(scene,interactive);updateShrines();
rituals=createRituals({getJSON,api,me:()=>me,guest,openDialog,closeDialog,notify,ensureResident,reducedMotion,today:todayJST,telemetryLine:()=>telemetry?.line()||'',
  onFortune(f,{fresh}){myBuff=f.buff.kind!=='none'&&f.buff.until>Date.now()?{kind:f.buff.kind,until:f.buff.until}:null;updateBuffs();calendar?.render();
   if(fresh&&myBuff){const at=cityEvents.visitor?.position||frontOf(resident()?.plotId);if(at)cityEvents.shower(at.x,at.z);}},
  onEma(){updateCheers();}});
calendar=createCalendarUI({getJSON,openDialog,closeDialog,notify,omikuji:()=>rituals.chip(),onShrine:()=>rituals.openShrine('omikuji'),
  onFocus:focusPlot});
diary=createDiary({getJSON,openDialog,today:todayJST});
photo=createPhoto({openDialog,closeDialog,notify,
  // One synchronous render, read in the same task by photo.js (the drawing buffer is not preserved).
  capture(){if(roomView)renderer.render(roomView.scene,roomView.camera);else renderer.render(scene,camera);return renderer.domElement;},
  sky:()=>$('world').style.background||getComputedStyle($('world')).backgroundImage,
  context(){const plot=roomPlot&&cityPlots.find(p=>p.id===roomPlot);
   if(roomView&&plot){const b=cityBuildings.find(x=>x.plotId===roomPlot);return {kind:'room',name:b?.name,district:plot.districtName?.split(' / ')[0],plotId:roomPlot};}
   // The last opened place, if the camera is still looking at it; else the nearest district.
   const p=selectedPlace,b=p?.building,t=controls.target,near=p?.x!==undefined&&Math.hypot(p.x-t.x,p.z-t.z)<24;
   if(near&&b?.type==='project'&&!b.private)return {kind:'building',name:b.name,ticker:b.ticker,phase:b.phase,slug:b.slug};
   if(near&&b?.type==='apartment')return {kind:'room',name:b.name,district:p.districtName?.split(' / ')[0],plotId:p.id};
   const d=districts.reduce((a,x)=>Math.hypot(x.x-t.x,x.z-t.z)<Math.hypot(a.x-t.x,a.z-t.z)?x:a,districts[0]);return {kind:'city',district:d?.name.split(' / ')[0]};},
  enter(){closeDialog();cityTour=null;cameraTween=null;},exit(){}});
control('calendar-button',icon('cal'),()=>calendar.open()).title='City calendar';
control('diary-button',icon('book'),()=>diary.open()).title="SUB-01's diary";
control('photo-button',icon('camera'),()=>photo.toggle()).title='Photo mode: take a postcard';
for(const [id,text] of [['calendar-button','City calendar'],['diary-button',"SUB-01's diary"],['photo-button','Photo mode: take a postcard']])label($(id),text);
$('about-button').onclick=()=>rituals.openAbout();
$('detail-diary').onclick=()=>{closeDialog();diary.open();};
// The activity bar names the next event; countdowns tick every 30 s; the calendar refreshes every minute, the ema board every 2.
const nextCaption=Object.assign(document.createElement('span'),{className:'activity-next'});$('activity-label').after(nextCaption);
function tickRituals(){calendar.render();const t=calendar.next();nextCaption.textContent=t?` · ${t}`:'';updateBuffs();
  // 23:00 Tokyo: one quiet toast a day that SUB-01 wrote in his diary (not over a dialog, a room, photo mode or another toast).
  const c=tokyoClock(Date.now()),today=todayJST();
  if(shouldToastDiary({hours:c.hours,today,last:local.get('sub01.diary.toast'),busy:document.hidden||!!currentDialog||!!roomView||photo.on||!$('toast').hidden})){local.set('sub01.diary.toast',today);notify('SUB-01 wrote in his diary.');}}
setInterval(tickRituals,3e4);
telemetry=startTelemetry(()=>({phone,gpu:GPU,level:governor.level,ema:governor.ema,contextLost:glLosses>0}));
window.__city.rituals={get calendar(){return calendar;},get rituals(){return rituals;},get diary(){return diary;},get photo(){return photo;},get telemetry(){return telemetry;},get shrines(){return shrinePicks.spots;},get buff(){return myBuff;}};
// Share pages (/p/<slug>, /r/<plotId>) land on /?focus=<plotId>: that plot's card opens once the world is in.
function focusFromUrl(){const q=new URLSearchParams(location.search),id=q.get('focus');if(!id)return;q.delete('focus');history.replaceState(null,'',location.pathname+(q.size?'?'+q:'')+location.hash);
  if(cityPlots.some(p=>p.id===id))focusPlot(id);}
// ---------- Chat: the city's live line, speech bubbles over heads, talking to SUB-01 (chat.js) ----------
// Bubbles are world labels (labels[], projected below in animate); chat.frame() keeps their anchors on the speakers.
const chat=createChat({me:()=>me,labels,notify,requireWallet:(k,next)=>guest.requireWallet(k,next),openCreator:next=>openCreator(next),
  sub01:()=>character,visitor:()=>cityEvents.visitor,target:()=>controls.target,selected:()=>$('district-select').value});
window.__city.chat=chat;
// ---------- end Chat ----------
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
  if(roomView){renderer.toneMappingExposure=EXPOSURE.room;wxUniforms.wet.value=wxUniforms.snow.value=wxUniforms.wear.value=0;fuses.room.run(()=>roomView.update(Math.min(clock.getDelta(),.08)));renderer.render(roomView.scene,roomView.camera);return;}
  if(ratioDirty){ratioDirty=false;renderer.setPixelRatio(Q.pixelRatio);}
  const seconds=reducedMotion?0:now*.001;fuses.crowd.run(crowdFrame,seconds);if(fuses.crowd.off&&crowdGPU.active){crowdGPU.active=crowdNear=false;crowdGPU.hide();residents.update(seconds,crowdGPU);}
  fuses.critters.run(()=>cityRenderer?.update(seconds));const dt=Math.min(clock.getDelta(),.08);sub01?.update(dt);heroHome?.update(dt,now*.001,camera);
  fuses.events.run(()=>cityEvents.update(dt,renderer.getPixelRatio()*innerHeight*camera.zoom/(camera.top-camera.bottom)));if(explorer&&cityEvents.visitor)fuses.explore.run(()=>explorer.update(dt));if(cityEvents.visitor){roamTag.position.copy(cityEvents.visitor.position);roamTag.position.y+=2.05;}
  if(goal?.activity==='party'&&!walker&&now>partyWaveAt&&partyWaveAt){play('Idle');play('Wave');partyWaveAt=now+6e3;}
  // Hero house (hero-home.js): legs inside SUB-01's lot go through the gate, the door and the stair; he walks indoors,
  // follows the floors (stair, loft) and sits at the desk or lies in bed on arrival.
  if(walker&&character&&heroHome&&!walker.homed){walker.homed=true;walker.points=heroHome.route(walker.points,character.position.y);walker.index=Math.min(1,walker.points.length-1);
    walker.indoor=walker.points.every(heroHome.inLot);if(walker.points.some((p,i)=>i&&Math.hypot(p.x-walker.points[i-1].x,p.z-walker.points[i-1].z)>.05))heroHome.stand(sub01);}
  if(walker&&character){
    const target=walker.points[walker.index],pos=character.position,dx=target.x-pos.x,dz=target.z-pos.z,dist=Math.hypot(dx,dz),stepLen=dt*(walker.points.length>3&&!walker.indoor?4.2:2.4);
    if(dist<=stepLen){pos.x=target.x;pos.z=target.z;walker.index++;if(walker.index>=walker.points.length){walker=null;if(goal?.activity==='party'){character.rotation.y=goal.yaw;play('Idle');play('Wave');partyWaveAt=now+6e3;}else{play(goal?.activity==='build'?'Interact':goal?.activity==='desk'?'Idle_Neutral':'Idle');heroHome?.arrive(sub01,goal?.activity);}}}
    else{pos.x+=dx/dist*stepLen;pos.z+=dz/dist*stepLen;character.rotation.y=Math.atan2(dx,dz);play(walker.points.length>3&&!walker.indoor?'Run':'Walk');}
    const fy=heroHome?.floorAt(pos.x,pos.z,pos.y);if(fy!=null&&!heroHome.seated)pos.y=fy;
  }
  if(character){const m=character.userData.marker,fl=markerFlash>now?Math.abs(Math.sin(now*.012)):0;m.scale.setScalar(1+fl*.9);m.material.emissiveIntensity=.25+fl*2.5;m.position.copy(character.position);m.position.y+=2+(reducedMotion?0:Math.sin(now*.002)*.04);m.rotation.y=now*.0005;if(follow){const before=controls.target.clone();controls.target.lerp((followObj||character).position,.07);camera.position.add(controls.target.clone().sub(before));}}
  if(cameraTween){cameraTween.elapsed+=dt;const t=Math.min(cameraTween.elapsed/.75,1),ease=1-(1-t)**3;const before=controls.target.clone();controls.target.lerpVectors(cameraTween.start,cameraTween.target,ease);camera.position.add(controls.target.clone().sub(before));camera.zoom=THREE.MathUtils.lerp(cameraTween.zoom,cameraTween.endZoom,ease);camera.updateProjectionMatrix();if(t===1)cameraTween=null;}
  if(cityTour){cityTour.elapsed+=dt;if(cityTour.elapsed>5){cityTour.elapsed=0;cityTour.index++;if(cityTour.index>=cityViews.length){cityTour=null;resetView();$('activity-text').textContent='Your idea. Your city. Choose an address.';}else nextCityView();}}
  // Overview LOD: below zoom 0.3 the city skips AC units, small roof items, side pipes and road marks.
  cityRenderer?.setDetail(camera.zoom>=.3&&Q.detail);cityGreen?.setDetail(camera.zoom>=.3&&Q.detail);   // quality level 0 keeps the overview LOD even up close
  fuses.weather.run(weatherFrame,now,dt,seconds);controls.update();clampToCity();updateSunAndFog();if(!fuses.crowd.off)fuses.crowd.run(crowdEnd,now);setCityFocus(cityEvents.visitor?.position||character?.position||null);renderer.render(scene,camera);renderedAt=now;booted=true;
  document.body.classList.toggle('is-close',camera.zoom>.42);
  chat?.frame(camera.zoom); // chat: before the labels are projected
  // While the headline is up (first INTRO_MS), no district label may sit in its column, header included (owner
  // 2026-10-10: Kiyosumi/Kinshicho over the title).
  const introRect=introUp?introBox():null;
  for(const label of labels){if(label.district&&(camera.zoom>.9||(camera.zoom<.25&&!['SHIBUYA','SHINJUKU','AKIHABARA','ODAIBA','GINZA'].includes(label.element.textContent)))){label.element.hidden=true;continue;}if(camera.zoom<.5&&!label.district&&!label.roam&&label.element.textContent.indexOf('Tokyo Tower'.toUpperCase())===-1){label.element.hidden=true;continue;}const p=label.position.clone().project(camera);label.element.style.left=`${(p.x*.5+.5)*innerWidth}px`;label.element.style.top=`${(-p.y*.5+.5)*innerHeight}px`;const lx=(p.x*.5+.5)*innerWidth,ly=(-p.y*.5+.5)*innerHeight;label.element.hidden=p.z>1||p.z< -1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1||(introRect&&label.district&&lx<introRect.right+40&&ly<introRect.bottom+24);}
}
// The headline ("Your idea. A whole city.") shows for INTRO_MS after the city is up, then fades (CSS .intro-gone).
const INTRO_MS=5000;let introUp=true,introBoxCache=null,introBoxAt=0;
function introBox(){const now=performance.now();if(!introBoxCache||now-introBoxAt>250){introBoxCache=document.querySelector('.intro')?.getBoundingClientRect()||null;introBoxAt=now;}return introBoxCache;}
setTimeout(()=>{introUp=false;document.body.classList.add('intro-gone');},INTRO_MS);
requestAnimationFrame(animate);
async function initialize(){try{
  await Promise.all([makeHome(),makeBuildings(),makeCharacter()]);
  // The first account + world fetch gets 2.5 s before the city is shown: a server that hangs (8 s timeouts) never keeps
  // the loading screen up. The poll loops start once that first fetch settled.
  const first=Promise.all([refreshMe(),pollWorld()]).catch(err=>console.warn('[city] first poll',err?.message||err));
  await Promise.race([first,new Promise(r=>setTimeout(r,2500))]);
  first.then(()=>{pollLoop(pollWorld,()=>nextPollDelay(POLL.world,worldFails));pollLoop(()=>me?.user&&serverUp?refreshMe():null,()=>POLL.me);});
  first.then(()=>{focusFromUrl();calendar.refresh().then(tickRituals);rituals.loadEma();pollLoop(()=>calendar.refresh().then(tickRituals),()=>6e4);pollLoop(()=>rituals.loadEma(),()=>12e4);});
  first.then(()=>{window.__city.guest=guest;return guest.boot();}).catch(err=>console.warn('[city] guest',err?.message||err)); // guest:
  $('loading').classList.add('is-ready');
  // Browser-visible diagnostics are limited to rendering; no wallet or account data.
  renderer.domElement.dataset.ready='true';
}catch(error){
  console.error('Neighborhood asset loading failed',error);
  $('loading-text').textContent='An asset could not load. Reload to try again.';
}}
initialize();
