import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {phaseOf,worldBuildings,planRoute,frontOf,sub01Goal,HOME_DESK} from '../src/world-sync.js';
import {cityPlots,ROAD_Z,BOULEVARD_X} from '../src/city-state.js';
import {addResidents} from '../src/residents.js';
import {createCity} from '../src/city.js';

const world={sub01:{state:'working',plotId:'shibuya-2',text:'Building ARC'},plots:[
 {plotId:'shibuya-2',kind:'project',resident:null,project:{slug:'arc',name:'Arc',ticker:'ARC',stage:'generating',stageLabel:'He is building it',progress:.45,launched:false,mint:null}},
 {plotId:'ginza-1',kind:'project',resident:null,project:{slug:null,name:'Private project',ticker:null,stage:'declined',progress:0}},
 {plotId:'ueno-3',kind:'apartment',resident:{name:'Mika',look:{skin:'#e0b090',hair:'#222222',hairStyle:'bun',top:'#ff7700',bottom:'#334455'}},project:null},
 {plotId:'nowhere-9',kind:'apartment',resident:{name:'X',look:{}},project:null}]};
test('every pipeline stage maps to a building phase; ended ideas leave no building',()=>{
 assert.equal(phaseOf('evaluating'),'thinking');assert.equal(phaseOf('generating'),'scaffold');assert.equal(phaseOf('approved'),'review');
 assert.equal(phaseOf('awaiting_signature'),'launch');assert.equal(phaseOf('launched'),'open');assert.equal(phaseOf('failed'),'stopped');
 assert.equal(phaseOf('declined'),null);assert.equal(phaseOf('cancelled'),null);
});
test('world snapshot becomes buildings only for known addresses',()=>{
 const b=worldBuildings(world);assert.deepEqual(b.map(x=>x.plotId),['shibuya-2','ueno-3']);
 assert.equal(b[0].phase,'scaffold');assert.equal(b[1].type,'apartment');
});
test('SUB-01 walks along streets to the site he is working on, and home when idle',()=>{
 const goal=sub01Goal(world),front=frontOf('shibuya-2');assert.deepEqual([goal.x,goal.z],[front.x,front.z]);assert.equal(goal.activity,'build');
 const route=planRoute(HOME_DESK,goal);assert.deepEqual(route[0],HOME_DESK);assert.deepEqual(route.at(-1),{x:goal.x,z:goal.z});
 for(let i=1;i<route.length;i++)assert.ok(route[i].x===route[i-1].x||route[i].z===route[i-1].z,'axis-aligned street segments');
 assert.equal(sub01Goal({sub01:{state:'idle'}}).activity,'desk');assert.equal(sub01Goal(null).activity,'desk');
});
test('residents are one instanced mesh with finite transforms; the city draws every phase',()=>{
 const r=addResidents(new THREE.Group());r.set([{x:1,z:2,look:world.plots[2].resident.look},{x:3,z:4,look:{}}]);r.update(5);
 assert.equal(r.mesh.count,12);const m=new THREE.Matrix4();for(let i=0;i<r.mesh.count;i++){r.mesh.getMatrixAt(i,m);assert.ok(m.elements.every(Number.isFinite));}
 const city=createCity(new THREE.Group(),[],()=>{},[]);
 for(const phase of ['thinking','scaffold','stopped','review','launch','open'])city.redraw([{plotId:'shibuya-2',type:'project',phase,progress:.5,name:'Arc',color:'orange'}]);
});

test('routes between far districts (third ring corner to corner) stay on rows and boulevards',()=>{
 const onGrid=p=>ROAD_Z.includes(p.z)||BOULEVARD_X.includes(p.x);
 for(const [a,b] of [['kiyosumi-1','mejiro-6'],['ogikubo-3','kitasenju-4'],['kichijoji-2','gotanda-5'],['shiba-1','sangenjaya-6'],['yanaka-6','shinbashi-1']]){
  const fa=frontOf(a),fb=frontOf(b),r=planRoute(fa,fb);assert.deepEqual([r[0],r.at(-1)],[fa,fb]);
  for(let i=1;i<r.length;i++)assert.ok(r[i].x===r[i-1].x||r[i].z===r[i-1].z,`${a}→${b} axis-aligned`);
  for(const p of r.slice(1,-1))assert.ok(onGrid(p)||p.x===fa.x||p.x===fb.x,`${a}→${b} ${JSON.stringify(p)}`);
  for(let i=1;i<r.length;i++)if(r[i].z!==r[i-1].z)assert.ok(BOULEVARD_X.includes(r[i].x)||i===1||i===r.length-1,'changes rows only on a boulevard');}
 // Every one of the 288 fronts reaches the home desk.
 for(const p of cityPlots){const r=planRoute(frontOf(p.id),HOME_DESK);for(let i=1;i<r.length;i++)assert.ok(r[i].x===r[i-1].x||r[i].z===r[i-1].z,p.id);}
});
test('world projects carry public art only; private projects carry nothing but their name and stage',()=>{
 const b=worldBuildings({plots:[
  {plotId:'kichijoji-2',kind:'project',project:{slug:'kichi',name:'Kichi',ticker:'KICHI',stage:'approved',progress:.7,logoUrl:'/meta/kichi/logo-v1.png',bannerUrl:'/meta/kichi/banner-v1.svg'}},
  {plotId:'yanaka-3',kind:'project',project:{slug:null,name:'Private project',ticker:null,stage:'generating',progress:.4,logoUrl:null,bannerUrl:null,mint:null}}]});
 assert.deepEqual(b.map(x=>[x.plotId,x.phase,x.private,x.logoUrl]),[['kichijoji-2','review',false,'/meta/kichi/logo-v1.png'],['yanaka-3','scaffold',true,null]]);
 assert.equal(b[1].ticker,null);
});

test('world: launched public projects carry their coin stats (normalised); unlaunched and private ones carry null',()=>{
 const stats={tier:3,tierName:'roof',by:'holders',trend:'up',fresh:true,holders:{count:12345,exact:true,atLeast:false,at:1,source:'helius'},marketCapUsd:2345000,volume24hUsd:1,liquidityUsd:2,priceChange24hPct:12.5,at:1760000000000,source:'dexscreener',url:'https://dexscreener.com/solana/x'};
 const b=worldBuildings({plots:[
  {plotId:'kichijoji-2',kind:'project',project:{slug:'kichi',name:'Kichi',ticker:'KICHI',stage:'launched',stageLabel:'Launched',progress:1,launched:true,mint:'So11111111111111111111111111111111111111112',stats}},
  {plotId:'yanaka-3',kind:'project',project:{slug:null,name:'Private project',ticker:null,stage:'launched',progress:1,launched:true,stats}},
  {plotId:'ginza-1',kind:'project',project:{slug:'g',name:'G',ticker:'G',stage:'approved',progress:.7,launched:false,stats}},
  {plotId:'ueno-3',kind:'project',project:{slug:'m',name:'M',ticker:'M',stage:'launched',stageLabel:'Launched',progress:1,launched:true,stats:{tier:2,source:'mock',mock:true,at:5,marketCapUsd:1}}}]});
 assert.equal(b[0].stats.tier,3);assert.equal(b[0].stats.tierName,'roof');assert.equal(b[0].stats.mock,false);assert.equal(b[0].stats.url,stats.url);
 assert.equal(b[1].stats,null,'private: nothing');assert.equal(b[2].stats,null,'not launched: nothing');assert.equal(b[3].stats.mock,true,'mock stays marked');
 assert.equal(worldBuildings({plots:[{plotId:'ueno-3',kind:'project',project:{slug:'m',name:'M',ticker:'M',stage:'launched',launched:true}}]})[0].stats,null,'no stats object yet');
});

test('a coin launched from another coin\'s site names its parent; a launchpad counts the coins launched from it', () => {
  const plot = (plotId, project) => ({ plotId, kind: 'project', project: { stage: 'launched', stageLabel: 'Launched', progress: 1, launched: true, mint: 'M', ...project } });
  const [kid, pad] = worldBuildings({ plots: [plot('shiba-1', { slug: 'lattice-cat', name: 'Lattice Cat', ticker: 'LCAT', parent: { slug: 'q-wave', name: 'Q-wave' } }),
    plot('shiba-4', { slug: 'q-wave', name: 'Q-wave', ticker: 'QWAVE', childrenLaunched: 3 })] });
  assert.deepEqual(kid.parent, { slug: 'q-wave', name: 'Q-wave' });
  assert.equal(kid.childrenLaunched, 0);
  assert.equal(pad.parent, null);
  assert.equal(pad.childrenLaunched, 3);
  const priv = worldBuildings({ plots: [plot('shiba-1', { slug: null, name: 'Private project', ticker: null, parent: { slug: 'q-wave', name: 'Q-wave' } })] })[0];
  assert.equal(priv.parent, null, 'a private project carries nothing');
});

test('worldBuilds: the build summary per plot, beside the buildings (a ticking percentage never redraws the city)',async()=>{
 const {worldBuilds,worldBuildings}=await import('../src/world-sync.js');const {cityPlots}=await import('../src/city-state.js');
 const plot=cityPlots.find(p=>!p.reserved).id;
 const world={plots:[{plotId:plot,kind:'project',project:{stage:'generating',name:'Ramen',progress:.5,build:{state:'running',percent:62,etaSeconds:70,etaAt:5000,queuePosition:null,step:{id:'art',label:'Two logo + banner options'},now:1000}}}]};
 const m=worldBuilds(world,900);assert.deepEqual(m.get(plot),{state:'running',percent:62,etaSeconds:70,etaAt:5000,queuePosition:null,step:{id:'art',label:'Two logo + banner options'},now:1000,receivedAt:900});
 assert.equal(worldBuildings(world)[0].build,undefined,'not in the buildings');
 assert.equal(worldBuilds({plots:[{plotId:plot,kind:'project',project:{stage:'review'}}]}).size,0);
 assert.equal(worldBuilds(null).size,0);
});
