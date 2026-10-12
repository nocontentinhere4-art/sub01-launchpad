import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cleanFamily,familySlots,familyWall,familyPlace,FAMILY_MAX} from '../src/family.js';
import {worldBuildings} from '../src/world-sync.js';
import {cityLayout} from '../src/lots.js';
import {createCity} from '../src/city.js';
import {cityPlots} from '../src/city-state.js';

// The backend's /api/world for PadPad on ginza-2: a root launchpad and its family (family.js neighbourhood, breadth first)
const member=(slug,depth,parent,extra={})=>({slug,name:slug.toUpperCase(),ticker:slug.replace(/-/g,'').toUpperCase().slice(0,10),depth,parent,stage:'launched',launched:true,mock:true,launchpad:depth<5,siteUrl:`http://${slug}.projects.localhost:8861/`,...extra});
const FAMILY={total:7,members:[member('pad-one',1,'padpad'),member('pad-two',1,'padpad'),member('pad-one-a',2,'pad-one'),member('pad-one-b',2,'pad-one'),member('pad-two-a',2,'pad-two'),
 member('pad-one-a-x',3,'pad-one-a'),member('pad-wip',2,'pad-two',{launched:false,stage:'generating'})]};
const world=(family=FAMILY,extra=[])=>({plots:[{plotId:'ginza-2',kind:'project',resident:null,project:{slug:'padpad',name:'PadPad',ticker:'PADPAD',stage:'launched',stageLabel:'Launched',progress:1,launched:true,mint:'MOCKx',
 siteUrl:'http://padpad.projects.localhost:8861/',childrenLaunched:2,family}},...extra]});

test('the family record is cleaned: sizes, slugs, links, depths',()=>{
 assert.equal(cleanFamily(null),null);assert.equal(cleanFamily({members:[]}),null);
 const f=cleanFamily({total:3,members:[member('ok',1,'padpad'),{slug:'BAD SLUG',depth:1},member('x',99,'<script>',{name:'<b>x</b>',siteUrl:'javascript:alert(1)',ticker:'lower'})]});
 assert.deepEqual(f.members.map(m=>m.slug),['ok','x']);
 assert.deepEqual([f.members[1].depth,f.members[1].parent,f.members[1].name,f.members[1].siteUrl,f.members[1].ticker],[9,null,'bx/b',null,null]);
 assert.equal(cleanFamily({members:Array.from({length:40},(_,i)=>member(`m${i}`,1,'padpad'))}).members.length,FAMILY_MAX);
 const b=worldBuildings(world())[0];
 assert.equal(b.family.total,7);assert.equal(b.siteUrl,'http://padpad.projects.localhost:8861/');
});

test('the neighbourhood: members take existing smaller lots of the root\'s district, nearest first, each child next to its parent; nothing overlaps',()=>{
 const buildings=worldBuildings(world()),layout=cityLayout(buildings),slots=familySlots(layout,buildings);
 const rootLot=layout.lots.find(l=>l.user&&l.plotId==='ginza-2');
 assert.equal(slots.length,7,'every member has a building');
 assert.equal(new Set(slots.map(s=>s.lot.id)).size,7,'one lot each');
 for(const s of slots){
  assert.equal(s.lot.district,'ginza');assert.equal(s.lot.user,false);assert.ok(!s.lot.slab);
  assert.ok(s.lot.height<rootLot.height,'smaller than the root');
  assert.ok(layout.lots.includes(s.lot),'an existing lot of the layout (no new footprint, so no overlap)');
 }
 // a child stands nearer its own parent than the root's other free lots would put it on average: here, the grandchild
 // pad-one-a-x is the nearest free lot to pad-one-a when it was placed
 const at=slug=>slots.find(s=>s.member.slug===slug).lot,d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 assert.equal(slots.find(s=>s.member.slug==='pad-one-a-x').parentLot,at('pad-one-a'));
 assert.ok(d(at('pad-one'),rootLot)<=d(at('pad-one-a-x'),rootLot),'the first generation nearest the root');
 // deterministic, and stable when something unrelated changes elsewhere in the city
 assert.deepEqual(familySlots(cityLayout(buildings),buildings).map(s=>s.lot.id),slots.map(s=>s.lot.id));
 const other=worldBuildings(world(FAMILY,[{plotId:'ueno-3',kind:'apartment',resident:{name:'Mika',look:{}},project:null}]));
 assert.deepEqual(familySlots(cityLayout(other),other).map(s=>s.lot.id),slots.map(s=>s.lot.id));
 // another project's building in the same district is never taken over
 const two=worldBuildings(world(FAMILY,[{plotId:'ginza-3',kind:'project',resident:null,project:{slug:'arc',name:'Arc',ticker:'ARC',stage:'launched',progress:1,launched:true,mint:'m'}}]));
 const l2=cityLayout(two),s2=familySlots(l2,two);
 assert.ok(s2.every(s=>s.lot.plotId!=='ginza-3'));
 // the family's colour, lighter each generation; the card says what it is and where it was launched from
 assert.notEqual(familyWall(buildings[0],1),familyWall(buildings[0],3));
 const card=familyPlace(slots.find(s=>s.member.slug==='pad-one-a'));
 assert.equal(card.name,'PAD-ONE-A');assert.match(card.kind,/LAUNCHPAD FAMILY \/ PADPAD/);assert.match(card.status,/Launchpad · generation 2/);
 assert.match(card.description,/launched from PAD-ONE's site/);assert.equal(card.building.siteUrl,'http://pad-one-a.projects.localhost:8861/');
 assert.match(familyPlace(slots.find(s=>s.member.slug==='pad-wip')).status,/On its way/);
});

test('the city draws the family in its existing batches (no extra draw call), picks open a member\'s card',()=>{
 const shown=[];const city=createCity(new THREE.Group(),[],p=>shown.push(p),[]);
 const plain=worldBuildings(world(null));city.redraw(plain);const before=city.stats();
 city.redraw(worldBuildings(world()));const after=city.stats();
 assert.equal(after.drawCalls,before.drawCalls,'same draw calls');
 assert.ok(after.instances-before.instances<400,'a few hundred instances at most: '+(after.instances-before.instances));
 assert.equal(city.familySlots.length,7);
 const target=city.familySlots[0];
 assert.ok(city.select({object:{userData:{cityPlot:true}},instanceId:cityPlots.length}),'the family picks follow the 288 plot picks');
 assert.equal(shown.at(-1).id,`family-${target.member.slug}`);
 assert.equal(city.familyPlaceOf('pad-two-a').name,'PAD-TWO-A');assert.equal(city.familyPlaceOf('nope'),null);
 assert.ok(cityPlots.some(p=>p.id==='ginza-2'));
});
