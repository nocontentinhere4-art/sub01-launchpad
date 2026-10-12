import {cityPlots,districts,ROAD_Z,BOULEVARD_X} from './city-state.js';
import {cleanStats} from './coin-tier.js';
import {cleanFamily} from './family.js';
// Pure helpers that turn the server's /api/world snapshot into what the city draws.
export const HOME_DESK={x:-4.5,z:-5.75},HOME_BED={x:-7.75,z:-5.4};   // hero-home.js: the gaming chair, the bedside in the loft
const PALETTE=['orange','mint','violet','sand'];
// Building phase per pipeline stage. Declined and cancelled ideas release their plot server-side.
export function phaseOf(stage){
 if(!stage)return null;
 if(stage==='launched')return 'open';
 if(stage==='failed')return 'stopped';
 if(stage==='declined'||stage==='cancelled')return null;
 if(stage==='submitted'||stage==='evaluating')return 'thinking';
 if(stage==='selected'||stage==='generating')return 'scaffold';
 if(stage==='preview_ready'||stage==='approved')return 'review';
 return 'launch';
}
function hash(s){let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))>>>0;return h;}
export function worldBuildings(world){
 const out=[];
 for(const p of world?.plots||[]){
  if(!cityPlots.some(c=>c.id===p.plotId&&!c.reserved))continue;   // a row on a reserved (tower park) plot is ignored
  if(p.kind==='project'&&p.project){const phase=phaseOf(p.project.stage);if(!phase)continue;
   const x=p.project,priv=!x.slug&&!x.ticker&&x.name==='Private project';
   // Private ideas: the server sends only 'Private project' + stage; nothing else is carried (no ticker, art, mint or stats).
   // `stats` (coin-tier.js cleanStats): the launched coin's on-chain record, only for public launched projects; null otherwise.
   out.push({plotId:p.plotId,type:'project',phase,progress:Math.max(0,Math.min(1,Number(x.progress)||0)),name:x.name,ticker:priv?null:x.ticker||null,stageLabel:x.stageLabel,slug:x.slug||null,launched:!!x.launched,mint:priv?null:x.mint||null,
    logoUrl:priv?null:x.logoUrl||null,bannerUrl:priv?null:x.bannerUrl||null,private:priv,color:PALETTE[hash(p.plotId)%4],stats:priv||!x.launched?null:cleanStats(x.stats),
    // a coin launched from another coin's site (backend child-launch.js) names its parent; a launchpad coin counts its children
    parent:!priv&&x.parent&&typeof x.parent.name==='string'?{slug:String(x.parent.slug||'').slice(0,40),name:String(x.parent.name).slice(0,32)}:null,childrenLaunched:priv?0:Math.max(0,Math.floor(Number(x.childrenLaunched)||0)),
    // the coin's own site (the visit button: "Open the coin site"); a launchpad's family, drawn around it (family.js)
    siteUrl:!priv&&typeof x.siteUrl==='string'&&/^https?:\/\/[^\s]+$/.test(x.siteUrl)?x.siteUrl.slice(0,200):null,family:priv?null:cleanFamily(x.family)});}
  else if(p.kind==='apartment'&&p.resident)out.push({plotId:p.plotId,type:'apartment',phase:'home',progress:1,name:p.resident.name,resident:p.resident,color:PALETTE[hash(p.resident.name)%4]});
 }
 return out;
}
// While SUB-01 builds: the building's summary per plot (backend /api/world project.build, build-steps.js), kept beside
// the buildings rather than in them so a ticking percentage never redraws the city. receivedAt: when it arrived (the
// card counts down on the server's clock: summary.now + the time since).
export function worldBuilds(world,receivedAt=Date.now()){
 const out=new Map(),num=v=>{if(v==null||v==='')return null;v=Number(v);return Number.isFinite(v)?v:null;};
 for(const p of world?.plots||[]){const b=p?.kind==='project'?p.project?.build:null;if(!b||typeof b!=='object'||!p.plotId)continue;
  out.set(p.plotId,{state:['queued','running','retrying','ready','failed'].includes(b.state)?b.state:'running',percent:Math.max(0,Math.min(100,num(b.percent)||0)),
   etaSeconds:num(b.etaSeconds),etaAt:num(b.etaAt),queuePosition:num(b.queuePosition),step:b.step&&typeof b.step.label==='string'?{id:String(b.step.id||''),label:b.step.label.slice(0,60)}:null,
   now:num(b.now)??receivedAt,receivedAt});}
 return out;
}
// Streets (city-state.js): an east-west road through every district row, north-south boulevards between columns.
const nearest=(list,v)=>list.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);
export function frontOf(plotId){const p=cityPlots.find(c=>c.id===plotId);if(!p)return null;const d=districts.find(d=>d.id===p.district);return{x:p.x,z:d.z+(p.z<d.z?-2.8:2.8)};}
export function planRoute(from,to){
 const za=nearest(ROAD_Z,from.z),zb=nearest(ROAD_Z,to.z),points=[{x:from.x,z:from.z},{x:from.x,z:za}];
 if(za!==zb){const bx=BOULEVARD_X.reduce((a,b)=>Math.abs(from.x-b)+Math.abs(to.x-b)<Math.abs(from.x-a)+Math.abs(to.x-a)?b:a);points.push({x:bx,z:za},{x:bx,z:zb});}
 points.push({x:to.x,z:zb},{x:to.x,z:to.z});
 // Only exact repeats are dropped: removing a few-mm step would turn the next leg diagonal.
 return points.filter((p,i)=>i===0||p.x!==points[i-1].x||p.z!==points[i-1].z);
}
// Where SUB-01 should be, given what the server says he is doing.
export function sub01Goal(world){
 const s=world?.sub01;
 if(s?.state==='working'&&s.plotId){const f=frontOf(s.plotId);if(f)return{...f,activity:'build',text:s.text};}
 if(s?.state==='asleep')return{...HOME_BED,activity:'sleep',text:s.text||'Asleep at home.'};
 if(s?.state==='offline')return{...HOME_DESK,activity:'offline',text:s.text||'Offline. Nothing is decided while he is away.'};
 return{...HOME_DESK,activity:'desk',text:s?.text||'At his desk. The mailbox is open.'};
}
