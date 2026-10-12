// Launchpad families in the city (backend family.js / world.js `plots[].project.family`, docs/CITY-API.md "Launchpad
// families"; the PadPad idea: "every launchpad becomes a building and its children grow around it as a neighbourhood").
// A coin or launchpad launched from a launchpad's site has no address of its own: it is drawn as a SMALLER building
// around its family's root building, on a lot the street layout (lots.js cityLayout) already has in the root's district:
// the sub-lots sharing the root's plot, the street rows, the block-interior houses on the back lanes. Nearest first, and
// every child next to its own parent (a grandchild grows around its parent's lot, not around the root). Nothing is
// added to the layout: a member takes over an existing lot's footprint, so it can never overlap a street, a landmark or
// another building; it keeps that lot's geometry and gets the family's colour (lighter each generation) and a rooftop
// sign (launchpads: a mast with a beacon). Same instanced batches, no extra draw call; at most FAMILY_MAX members per
// root are drawn (the rest are counted on the root's card). Pure and deterministic: same world, same neighbourhood.
import {buildingColors} from './city-state.js';
export const FAMILY_MAX=24;
const SLUG=/^[a-z0-9-]{1,40}$/;
const str=(v,n)=>typeof v==='string'?v.replace(/[\u0000-\u001f<>]/g,'').slice(0,n):'';

/** The server's family record, cleaned (the server is trusted for facts, not for markup or sizes). */
export function cleanFamily(f){
 if(!f||typeof f!=='object'||!Array.isArray(f.members))return null;
 const members=f.members.slice(0,FAMILY_MAX).filter(m=>m&&SLUG.test(m.slug)).map(m=>({slug:m.slug,name:str(m.name,32)||m.slug,
  ticker:typeof m.ticker==='string'&&/^[A-Z0-9]{1,10}$/.test(m.ticker)?m.ticker:null,depth:Math.max(1,Math.min(9,Math.floor(Number(m.depth)||1))),
  parent:typeof m.parent==='string'&&SLUG.test(m.parent)?m.parent:null,stage:str(m.stage,24),launched:!!m.launched,mock:!!m.mock,launchpad:!!m.launchpad,
  siteUrl:typeof m.siteUrl==='string'&&/^https?:\/\/[^\s]+$/.test(m.siteUrl)?m.siteUrl.slice(0,200):null}));
 return members.length?{total:Math.max(members.length,Math.floor(Number(f.total)||0)),members}:null;
}

/** Which lot each family member takes. layout: lots.js cityLayout(buildings). -> [{lot, member, root, rootLot, parentLot}] */
export function familySlots(layout,buildings){
 const out=[],taken=new Set(),userPlots=new Set(layout.lots.filter(l=>l.user).map(l=>l.plotId));
 const roots=buildings.filter(b=>b.type==='project'&&b.family?.members?.length).sort((a,b)=>a.plotId<b.plotId?-1:1);
 for(const b of roots){
  const rootLot=layout.lots.find(l=>l.user&&l.plotId===b.plotId);if(!rootLot)continue;
  // smaller than the root, in its district, not another project's or resident's building, never a district's one slab
  const cands=layout.lots.filter(l=>l.district===rootLot.district&&!l.user&&!l.ghost&&!l.slab&&l.height<rootLot.height&&!(l.plotId&&l.plotId!==b.plotId&&userPlots.has(l.plotId)));
  const at=new Map([[b.slug,rootLot]]);
  for(const m of b.family.members){
   const p=at.get(m.parent)||rootLot;let best=null,bd=Infinity;
   // nearest first; a lot on the street reads before a back-lane house, a building of 2+ storeys before a 1-storey kiosk
   for(const l of cands){if(taken.has(l.id))continue;const d=(l.x-p.x)**2+(l.z-p.z)**2+(l.role==='interior'?60:0)+(l.height<5?25:0);if(d<bd-1e-9||(Math.abs(d-bd)<=1e-9&&best&&l.id<best.id)){best=l;bd=d;}}
   if(!best)break;                                        // the district is full: the rest stay counted on the root's card
   taken.add(best.id);at.set(m.slug,best);out.push({lot:best,member:m,root:b,rootLot,parentLot:p});
  }
 }
 return out;
}

/** The family's wall colour: the root building's colour, a little lighter each generation. */
export function familyWall(root,depth){
 const hex=buildingColors[root.color]||'#d4bf91',f=Math.min(.6,.14*depth),c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 return '#'+c.map(v=>Math.round(v+(255-v)*f).toString(16).padStart(2,'0')).join('');
}

/** The place card (main.js showPlace) of a family member's building. */
export function familyPlace(slot){
 const {member:m,root,lot}=slot,parentName=m.parent===root.slug?root.name:(root.family.members.find(x=>x.slug===m.parent)?.name||'its parent');
 const what=m.launchpad?'A launchpad':'A coin';
 return {id:`family-${m.slug}`,family:true,generation:m.depth,x:lot.x,z:lot.z,name:m.name,kind:`LAUNCHPAD FAMILY / ${root.name}`.toUpperCase(),color:familyWall(root,m.depth),
  status:m.launched?`${m.launchpad?'Launchpad':'Coin'} · generation ${m.depth}${m.ticker?` · $${m.ticker}`:''}${m.mock?' · MOCK':''}`:`On its way · generation ${m.depth}`,
  description:`${what} of the ${root.name} family, launched from ${parentName}'s site. It has no address of its own: it grows in the family's neighbourhood around ${root.name}.${m.launchpad?' Its own site launches the next generation.':''}`,
  building:{type:'project',phase:m.launched?'open':'scaffold',progress:m.launched?1:.5,name:m.name,ticker:m.ticker,slug:m.slug,launched:m.launched,siteUrl:m.siteUrl,
   private:false,logoUrl:null,color:root.color,stats:null,parent:{slug:m.parent,name:parentName},childrenLaunched:0,family:null,familyMember:true}};
}
