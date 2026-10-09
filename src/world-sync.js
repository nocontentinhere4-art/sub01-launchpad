import {cityPlots,districts} from './city-state.js';
// Pure helpers that turn the server's /api/world snapshot into what the city draws.
export const HOME_DESK={x:-4.5,z:-4.45},HOME_BED={x:-7.2,z:-5.5};
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
  if(!cityPlots.some(c=>c.id===p.plotId))continue;
  if(p.kind==='project'&&p.project){const phase=phaseOf(p.project.stage);if(!phase)continue;
   out.push({plotId:p.plotId,type:'project',phase,progress:Math.max(0,Math.min(1,Number(p.project.progress)||0)),name:p.project.name,ticker:p.project.ticker||null,stageLabel:p.project.stageLabel,slug:p.project.slug||null,launched:!!p.project.launched,mint:p.project.mint||null,color:PALETTE[hash(p.plotId)%4]});}
  else if(p.kind==='apartment'&&p.resident)out.push({plotId:p.plotId,type:'apartment',phase:'home',progress:1,name:p.resident.name,resident:p.resident,color:PALETTE[hash(p.resident.name)%4]});
 }
 return out;
}
// Streets: an east-west road through every district row, north-south boulevards between columns.
const ROAD_Z=[...new Set(districts.map(d=>d.z))].sort((a,b)=>a-b),BOULEVARD_X=[-43.5,-14.5,14.5,43.5];
const nearest=(list,v)=>list.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);
export function frontOf(plotId){const p=cityPlots.find(c=>c.id===plotId);if(!p)return null;const d=districts.find(d=>d.id===p.district);return{x:p.x,z:d.z+(p.z<d.z?-2.8:2.8)};}
export function planRoute(from,to){
 const za=nearest(ROAD_Z,from.z),zb=nearest(ROAD_Z,to.z),points=[{x:from.x,z:from.z},{x:from.x,z:za}];
 if(za!==zb){const bx=BOULEVARD_X.reduce((a,b)=>Math.abs(from.x-b)+Math.abs(to.x-b)<Math.abs(from.x-a)+Math.abs(to.x-a)?b:a);points.push({x:bx,z:za},{x:bx,z:zb});}
 points.push({x:to.x,z:zb},{x:to.x,z:to.z});
 return points.filter((p,i)=>i===0||Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z)>.01);
}
// Where SUB-01 should be, given what the server says he is doing.
export function sub01Goal(world){
 const s=world?.sub01;
 if(s?.state==='working'&&s.plotId){const f=frontOf(s.plotId);if(f)return{...f,activity:'build',text:s.text};}
 if(s?.state==='asleep')return{...HOME_BED,activity:'sleep',text:s.text||'Asleep at home.'};
 if(s?.state==='offline')return{...HOME_DESK,activity:'offline',text:s.text||'Offline. Nothing is decided while he is away.'};
 return{...HOME_DESK,activity:'desk',text:s?.text||'At his desk. The mailbox is open.'};
}
