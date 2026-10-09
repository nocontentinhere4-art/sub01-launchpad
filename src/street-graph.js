// Street graph (wave 4C). Pure and deterministic, derived at runtime from city-state.js (districts, BOULEVARD_X, ROAD_Z,
// CITY_EXTENT, CANAL_X) and lots.js (shopfronts, spots): nothing here hard-codes the city's size.
// Pedestrians: sidewalk lines 2.8 either side of every district street and boulevard (corner nodes where they meet,
// mid-block nodes at doors, windows and vending), crossings with a signal role (0 across a boulevard: walks in the
// east-west phase; 1 the zebra across a district street next to a boulevard: north-south phase; 2 mid-block zebras and
// the Shibuya scramble), and doors / seats as leaf nodes. Vehicles: left-hand lanes (±0.75 on district streets, ±0.65 on
// boulevards), junction boxes with one turn link per movement (conflicts, the crosswalk a turn cuts), mid-block stop
// lines, coin-parking bays and bus stops. A* over the pedestrian graph with a binary heap and a small route cache.
import {districts,BOULEVARD_X,ROAD_Z,CITY_EXTENT,CANAL_X} from './city-state.js';
import {cityLayout,heightClass,isRing3,CATEGORY,sidewalkSides} from './lots.js';
import {doorOf,stylePlan} from './tokyo-style.js';

// Quality tier 0–3 shared by the crowd and the traffic (city-crowd.js derives it from the GPU crowd's runtime cap).
export const streetQuality={tier:3};
export const SIDE=2.8,LANE=.75,BLANE=.65,BOX_X=5,BOX_Z=3.6,CYCLE=24;
const mod=(n,d)=>((n%d)+d)%d;
export const h01=(...v)=>{let x=2166136261;for(const n of v){x=Math.imul(x^(Math.round(n*977)|0),16777619);x^=x>>>13;}x=Math.imul(x,1540483477);x^=x>>>15;return (x>>>0)/4294967296;};
// Activities a node offers (NPCs pick destinations by these).
export const ACT={none:0,home:1,shop:2,office:3,konbini:4,noren:5,station:6,window:7,vending:8,bench:9,canal:10,park:11,shrine:12,edge:13,lantern:14};
export const ACT_NAMES=Object.keys(ACT);
// Mid-block zebras: the same rule city.js draws them with (the inner ring's east and west columns).
export const hasMidZebra=d=>[-29,29].includes(d.x)&&[-28,2,32].includes(d.z);
const STATIONS={shibuya:[-6.5,6.5],shinjuku:[-4,5]};

// ---------- Signals (one 24 s cycle, hashed offset per junction; the Shibuya scramble keeps offset 0) ----------
// Junction: east-west green 0–9.5, amber –11.5, all red –12, north-south green –21.5, amber –23.5, all red –24.
// Vehicle light: 0 green, 1 amber, 2 red. role 0 = east-west approach, 1 = north-south approach, 2 = mid-block / scramble.
export function vehicleLight(role,seconds,offset=0){const t=mod(seconds+offset,CYCLE);
 if(role===0)return t<9.5?0:t<11.5?1:2;if(role===1)return t>=12&&t<21.5?0:t>=12&&t<23.5?1:2;return t<9?2:t<21.5?0:1;}
// Pedestrian light: seconds of walk (green + blink) left if the walk light is green now, else −1 (never start on blink).
export function walkWindow(role,seconds,offset=0){const t=mod(seconds+offset,CYCLE);
 if(role===0)return t<7.5?9.5-t:-1;if(role===1)return t>=12&&t<19.5?21.5-t:-1;return t<7?9-t:-1;}
// Is the pedestrian head lit at all (green or blinking): people already on the crossing keep walking.
export function walkLit(role,seconds,offset=0){const t=mod(seconds+offset,CYCLE);return role===0?t<9.5:role===1?t>=12&&t<21.5:t<9;}

// ---------- Graph container (CSR adjacency) ----------
// nodes: [{x,z,kind,act,yaw,district}] ; edges: [{a,b,kind:0 walk|1 cross|2 leaf,role,sig}]
export function makeGraph(nodes,edges){
 const n=nodes.length,m=edges.length,X=new Float32Array(n),Z=new Float32Array(n),act=new Uint8Array(n),yaw=new Float32Array(n),dist=new Int16Array(n).fill(-1);
 nodes.forEach((p,i)=>{X[i]=p.x;Z[i]=p.z;act[i]=p.act||0;yaw[i]=p.yaw||0;dist[i]=p.district??-1;});
 const A=new Int32Array(m),B=new Int32Array(m),len=new Float32Array(m),kind=new Uint8Array(m),role=new Uint8Array(m),sig=new Int32Array(m).fill(-1);
 const deg=new Int32Array(n+1);
 edges.forEach((e,i)=>{A[i]=e.a;B[i]=e.b;len[i]=e.len??Math.hypot(X[e.a]-X[e.b],Z[e.a]-Z[e.b]);kind[i]=e.kind||0;role[i]=e.role||0;sig[i]=e.sig??-1;deg[e.a+1]++;deg[e.b+1]++;});
 for(let i=0;i<n;i++)deg[i+1]+=deg[i];
 const adj=new Int32Array(2*m),adjE=new Int32Array(2*m),fill=deg.slice(0,n);
 for(let i=0;i<m;i++){adj[fill[A[i]]]=B[i];adjE[fill[A[i]]++]=i;adj[fill[B[i]]]=A[i];adjE[fill[B[i]]++]=i;}
 const g={n,m,X,Z,act,yaw,district:dist,A,B,len,kind,role,sig,off:deg,adj,adjE,nodes,
  busy:new Uint16Array(m),   // people on each crossing right now (npc.js writes, traffic reads: turning cars yield)
  search:{seen:new Uint32Array(n),stamp:0,g:new Float32Array(n),from:new Int32Array(n),heapN:new Int32Array(2*m+n+1),heapF:new Float32Array(2*m+n+1)},
  cache:new Map(),stats:{astar:0,hits:0,expanded:0}};
 return g;
}
export function edgeBetween(g,a,b){for(let k=g.off[a];k<g.off[a+1];k++)if(g.adj[k]===b)return g.adjE[k];return -1;}

// ---------- A* (binary min-heap on f; stamps instead of clearing; cost = metres) ----------
export function astar(g,start,goal,{maxExpand=1e5}={}){
 if(start===goal)return Int32Array.of(start);
 const S=g.search,seen=S.seen,G=S.g,from=S.from,hn=S.heapN,hf=S.heapF;if(++S.stamp>=4294967295){seen.fill(0);S.stamp=1;}
 const st=S.stamp,X=g.X,Z=g.Z,gx=X[goal],gz=Z[goal];let size=0,expanded=0;
 const push=(node,f)=>{let i=size++;while(i>0){const p=(i-1)>>1;if(hf[p]<=f)break;hn[i]=hn[p];hf[i]=hf[p];i=p;}hn[i]=node;hf[i]=f;};
 const pop=()=>{const top=hn[0],ln=hn[--size],lf=hf[size];let i=0;
  while(true){let c=2*i+1;if(c>=size)break;if(c+1<size&&hf[c+1]<hf[c])c++;if(hf[c]>=lf)break;hn[i]=hn[c];hf[i]=hf[c];i=c;}
  if(size>0){hn[i]=ln;hf[i]=lf;}return top;};
 seen[start]=st;G[start]=0;from[start]=-1;push(start,Math.hypot(X[start]-gx,Z[start]-gz));
 // closed nodes: seen with stamp and G marked by a negative-zero trick is fragile; keep a lazy-deletion check instead.
 while(size>0){
  const fTop=hf[0],u=pop();if(u===goal)break;
  if(fTop>G[u]+Math.hypot(X[u]-gx,Z[u]-gz)+1e-4)continue;   // stale entry
  if(++expanded>maxExpand)return null;
  for(let k=g.off[u];k<g.off[u+1];k++){const v=g.adj[k],e=g.adjE[k],c=G[u]+g.len[e];
   if(seen[v]===st&&G[v]<=c)continue;seen[v]=st;G[v]=c;from[v]=u;push(v,c+Math.hypot(X[v]-gx,Z[v]-gz));}
  if(size>=hn.length-8)return null;
 }
 g.stats.astar++;g.stats.expanded+=expanded;
 if(seen[goal]!==st)return null;
 let k=0;for(let v=goal;v!==-1;v=from[v])k++;const out=new Int32Array(k);for(let v=goal;v!==-1;v=from[v])out[--k]=v;return out;
}
export function pathLength(g,path){let L=0;for(let i=1;i<path.length;i++)L+=g.len[edgeBetween(g,path[i-1],path[i])];return L;}
// Cached route (LRU of `cap` entries). miss() is called before an uncached search so callers can budget them per frame.
export function route(g,a,b,{cap=600,budget=null}={}){
 const key=a*131072+b,c=g.cache.get(key);
 if(c){g.cache.delete(key);g.cache.set(key,c);g.stats.hits++;return c;}
 if(budget&&budget.left<=0)return undefined;   // undefined: out of budget this frame (retry later); null: unreachable
 if(budget)budget.left--;
 const p=astar(g,a,b);g.cache.set(key,p);if(g.cache.size>cap)g.cache.delete(g.cache.keys().next().value);return p;
}

// ---------- The city ----------
let memo=null;
export function streetWorld(){return memo||=buildStreetWorld();}
export function cityGrid(ds=districts){
 const cols=[...new Set(ds.map(d=>d.x))].sort((a,b)=>a-b),rows=Array.isArray(ROAD_Z)&&ROAD_Z.length?ROAD_Z.slice():[...new Set(ds.map(d=>d.z))].sort((a,b)=>a-b);
 const blvd=Array.isArray(BOULEVARD_X)&&BOULEVARD_X.length===cols.length-1?BOULEVARD_X.slice():cols.slice(1).map((x,i)=>(cols[i]+x)/2);
 const E=CITY_EXTENT||{minX:cols[0]-14.5,maxX:cols.at(-1)+14.5,minZ:rows[0]-13.5,maxZ:rows.at(-1)+13.5};
 const cell=new Map(ds.map((d,i)=>[`${d.x},${d.z}`,i])),at=(c,r)=>cell.get(`${cols[c]},${rows[r]}`)??-1;
 const ring=d=>{const c=cols.indexOf(d.x),r=rows.indexOf(d.z),cc=(cols.length-1)/2,rc=(rows.length-1)/2;return Math.max(Math.abs(c-cc),Math.abs(r-rc));};
 return {cols,rows,blvd,E,at,ring,maxRing:Math.max((cols.length-1)/2,(rows.length-1)/2)};
}
// People per district: high 1, mid .7, low .4; the outermost ring a third of that (wave 4A's third ring: very sparse).
export function districtDensity(d,grid=cityGrid()){
 const base={high:1,mid:.7,low:.4}[heightClass(d.id)]||.4,outer=(d.ring===3||isRing3?.(d.id))||grid.ring(d)>=grid.maxRing&&grid.maxRing>=3;
 return base*(outer?.33:1);
}

function buildStreetWorld(){
 const grid=cityGrid(),{cols,rows,blvd,E}=grid,C=cols.length,R=rows.length;
 const layout=cityLayout([]),nodes=[],edges=[],keyed=new Map(),signals=[];
 let plan=null;try{plan=stylePlan([]);}catch{plan=null;}
 const node=(x,z,o={})=>{const k=`${Math.round(x*20)},${Math.round(z*20)}`;let i=keyed.get(k);
  if(i===undefined){i=nodes.length;nodes.push({x,z,kind:'walk',act:0,yaw:0,district:-1,...o});keyed.set(k,i);}
  else{const p=nodes[i];for(const [kk,v] of Object.entries(o))if(kk==='act'?!p.act:kk==='district'?p.district<0:kk==='kind'?p.kind==='walk':true)p[kk]=v;}
  return i;};
 const edge=(a,b,o={})=>{if(a!==b)edges.push({a,b,...o});};
 const line=(list)=>{for(let i=1;i<list.length;i++)edge(list[i-1],list[i]);};
 // Junction signals first (index = i*R + r) so roads and crossings share them.
 for(let i=0;i<blvd.length;i++)for(let r=0;r<R;r++)signals.push({kind:'junction',x:blvd[i],z:rows[r],offset:h01(blvd[i],rows[r],5)*CYCLE});
 const junction=(i,r)=>i*R+r;
 const benches=(plan?.props||[]).filter(p=>p.role==='bus'&&p.color==='#9A7A60').map(p=>({x:p.x,z:p.z}));
 const vendProps=(plan?.props||[]).filter(p=>p.role==='vending');
 // East–west sidewalks, doors and mid-block crossings, per district cell and side.
 const cellInfo=[];
 for(let r=0;r<R;r++)for(let c=0;c<C;c++){
  const di=grid.at(c,r);if(di<0)continue;const d=districts[di],X=d.x,Z=d.z;
  const xw=c>0?blvd[c-1]+SIDE:E.minX+.5,xe=c<C-1?blvd[c]-SIDE:E.maxX-.5,mid=hasMidZebra(d),scramble=mid&&d.id==='shibuya';
  let midSig=-1;if(mid){midSig=signals.length;signals.push({kind:'mid',x:X,z:Z,offset:d.id==='shibuya'?0:h01(X,Z,6)*CYCLE,scramble,district:d.id});}
  cellInfo.push({di,c,r,xw,xe,mid,midSig,scramble});
  for(const s of [-1,1]){
   const zs=Z+s*SIDE,pts=[],facing=s>0?0:Math.PI;   // facing the facades on this side
   pts.push({x:xw,o:{kind:c>0?'corner':'edge',act:c>0?0:ACT.edge,district:di}});pts.push({x:xe,o:{kind:c<C-1?'corner':'edge',act:c<C-1?0:ACT.edge,district:di}});
   const clampX=x=>Math.min(xe-.4,Math.max(xw+.4,x));
   for(const lot of layout.lots){if(lot.district!==d.id||lot.role==='interior')continue;const fz=lot.front==='+z'?1:-1;if((fz>0?-1:1)!==s)continue;
    const door=doorOf(lot);if(!door)continue;const x=clampX(lot.x+door.u),shop=lot.shop;
    const act=shop==='konbini'?ACT.konbini:shop==='noren'?ACT.noren:shop==='house'?ACT.home:shop==='entrance'?(lot.type==='T7'?ACT.office:ACT.home):
     lot.type==='T7'||CATEGORY[d.id]==='office'&&lot.type==='T1'?ACT.office:ACT.shop;
    pts.push({x,leaf:{x,z:lot.frontZ-fz*.35,o:{kind:'door',act,yaw:facing,district:di}},o:shop==='glazed'&&act===ACT.shop?{act:ACT.window,yaw:facing,district:di}:{district:di}});}
   for(const sp of layout.spots){if(sp.district!==d.id||Math.abs(sp.frontZ-Z)>4)continue;const fz=sp.front==='+z'?1:-1;if((fz>0?-1:1)!==s)continue;
    const x=clampX(sp.x);
    if(sp.kind==='vending')pts.push({x,o:{act:ACT.vending,yaw:facing,district:di}});
    else if(sp.kind==='park'||sp.kind==='shrine')pts.push({x,leaf:{x:sp.x,z:sp.frontZ-fz*1.4,o:{kind:'spot',act:sp.kind==='park'?ACT.park:ACT.shrine,yaw:facing,district:di}},o:{district:di}});}
   for(const v of vendProps)if(v.district===d.id&&Math.abs(v.z-zs)<1.6&&v.x>xw+.5&&v.x<xe-.5&&!pts.some(p=>p.o?.act===ACT.vending&&Math.abs(p.x-v.x)<1.5))pts.push({x:v.x,o:{act:ACT.vending,yaw:v.z>zs?0:Math.PI,district:di}});
   if(STATIONS[d.id])for(const dx of STATIONS[d.id]){const x=clampX(X+dx),lot=layout.lots.find(l=>l.district===d.id&&l.role!=='interior'&&(l.front==='+z'?-1:1)===s&&Math.abs(l.x-x)<l.width/2+.1);
    const fz=s<0?1:-1;pts.push({x,leaf:{x,z:(lot?lot.frontZ:Z+s*3.4)-fz*.35,o:{kind:'door',act:ACT.station,yaw:facing,district:di}},o:{district:di}});}
   if(mid){pts.push({x:X,o:{kind:'kerb',district:di}});if(scramble)for(const dx of [-3,3])pts.push({x:X+dx,o:{kind:'kerb',district:di}});}
   if(d.id==='roppongi')for(let x=X-10;x<=X+10;x+=5)pts.push({x:clampX(x),o:{act:ACT.lantern,yaw:facing,district:di}});
   // Merge points closer than 0.35 (doors right beside each other share their sidewalk node).
   pts.sort((a,b)=>a.x-b.x);const ids=[];
   for(const p of pts){const last=ids.at(-1);let id;
    if(last!==undefined&&Math.abs(nodes[last].x-p.x)<.35&&!(p.o?.kind==='corner'||p.o?.kind==='edge'))id=node(nodes[last].x,zs,p.o);else id=node(p.x,zs,p.o);
    if(ids.at(-1)!==id)ids.push(id);
    if(p.leaf){const L=node(p.leaf.x,p.leaf.z,p.leaf.o);edge(id,L,{kind:2});}}
   line(ids);
  }
  if(mid){const a=node(X,Z-SIDE),b=node(X,Z+SIDE);edge(a,b,{kind:1,role:2,sig:midSig});
   if(scramble){edge(node(X-3,Z-SIDE),node(X+3,Z+SIDE),{kind:1,role:2,sig:midSig});edge(node(X+3,Z-SIDE),node(X-3,Z+SIDE),{kind:1,role:2,sig:midSig});}}
 }
 // Boulevard sidewalks (both sides), boulevard crossings and the zebras across district streets beside them.
 for(let i=0;i<blvd.length;i++){const bx=blvd[i];
  for(const e of [-1,1]){const x=bx+e*SIDE,ids=[node(x,E.minZ+.5,{kind:'edge',act:ACT.edge})];
   const seats=benches.filter(b=>Math.abs(b.x-(bx+e*2.05))<.6);
   const stops=[];for(let r=0;r<R;r++){stops.push({z:rows[r]-SIDE,o:{kind:'corner'}},{z:rows[r]+SIDE,o:{kind:'corner'}});}
   for(const b of seats)stops.push({z:b.z,leaf:{x:b.x,z:b.z,o:{kind:'spot',act:ACT.bench,yaw:e>0?-Math.PI/2:Math.PI/2}}});
   stops.push({z:E.maxZ-.5,o:{kind:'edge',act:ACT.edge}});stops.sort((a,b)=>a.z-b.z);
   for(const p of stops){const id=node(x,p.z,p.o||{});if(ids.at(-1)!==id)ids.push(id);if(p.leaf)edge(id,node(p.leaf.x,p.leaf.z,p.leaf.o),{kind:2});}
   // Across a district street the zebra (a signalled crossing, below) replaces the plain sidewalk edge.
   const zebraAt=new Set();for(let r=0;r<R;r++)if(grid.at(e<0?i:i+1,r)>=0)zebraAt.add(`${node(x,rows[r]-SIDE)},${node(x,rows[r]+SIDE)}`);
   for(let k=1;k<ids.length;k++)if(!zebraAt.has(`${ids[k-1]},${ids[k]}`))edge(ids[k-1],ids[k]);
   for(let r=0;r<R;r++){const c=e<0?i:i+1;if(grid.at(c,r)>=0)edges.push({a:node(x,rows[r]-SIDE),b:node(x,rows[r]+SIDE),kind:1,role:1,sig:junction(i,r)});}
  }
  for(let r=0;r<R;r++)for(const s of [-1,1])edges.push({a:node(bx-SIDE,rows[r]+s*SIDE),b:node(bx+SIDE,rows[r]+s*SIDE),kind:1,role:0,sig:junction(i,r)});
 }
 // The canal (east of the city): a few places to sit by the water, reached from the east-edge sidewalk ends.
 if(Number.isFinite(CANAL_X))for(const Z of rows)for(const s of [-1,1]){const a=keyed.get(`${Math.round((E.maxX-.5)*20)},${Math.round((Z+s*SIDE)*20)}`);
  if(a!==undefined)edge(a,node(CANAL_X-6.9,Z+s*(SIDE+1.6),{kind:'spot',act:ACT.canal,yaw:Math.PI/2}),{kind:2});}
 // Edge-portal nodes are both 'edge' kind and act.
 for(const p of nodes)if(p.kind==='edge')p.act=ACT.edge;
 const g=makeGraph(nodes,edges);g.signals=signals;g.grid=grid;
 g.pois=Array.from({length:ACT_NAMES.length},()=>[]);for(let k=0;k<g.n;k++)if(g.act[k])g.pois[g.act[k]].push(k);
 const at=(x,z)=>keyed.get(`${Math.round(x*20)},${Math.round(z*20)}`)??-1,roads=buildRoads(g,grid,layout,signals,benches,cellInfo,at);
 return {graph:g,roads,grid,signals};
}

// ---------- Roads ----------
function polyline(pts){const n=pts.length/2,cum=new Float32Array(n);for(let i=1;i<n;i++)cum[i]=cum[i-1]+Math.hypot(pts[2*i]-pts[2*i-2],pts[2*i+1]-pts[2*i-1]);return {pts:Float32Array.from(pts),cum,len:cum[n-1]};}
const bez=(x0,z0,x1,z1,x2,z2,n=10)=>{const o=[];for(let k=0;k<=n;k++){const t=k/n,a=(1-t)*(1-t),b=2*(1-t)*t,c=t*t;o.push(a*x0+b*x1+c*x2,a*z0+b*z1+c*z2);}return o;};
// Point and unit tangent at distance s along a link: writes into out {x,z,dx,dz}.
export function pointAt(link,s,out){const p=link.pts,c=link.cum,n=c.length;s=Math.max(0,Math.min(link.len,s));
 let i=1;if(n>2){let lo=1,hi=n-1;while(lo<hi){const m=(lo+hi)>>1;if(c[m]<s)lo=m+1;else hi=m;}i=lo;}
 const L=c[i]-c[i-1]||1,t=(s-c[i-1])/L,dx=(p[2*i]-p[2*i-2])/L,dz=(p[2*i+1]-p[2*i-1])/L;
 out.x=p[2*i-2]+(p[2*i]-p[2*i-2])*t;out.z=p[2*i-1]+(p[2*i+1]-p[2*i-1])*t;out.dx=dx;out.dz=dz;return out;}
const segX=(a,b,c,d)=>{const r=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);if(Math.abs(r)<1e-9)return false;
 const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/r,u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/r;return t>.02&&t<.98&&u>.02&&u<.98;};
function crosses(l1,l2){const p=l1.pts,q=l2.pts;for(let i=2;i<p.length;i+=2)for(let j=2;j<q.length;j+=2)if(segX([p[i-2],p[i-1]],[p[i],p[i+1]],[q[j-2],q[j-1]],[q[j],q[j+1]]))return true;return false;}

function buildRoads(g,grid,layout,signals,benches,cellInfo,nodeAt){
 const {cols,rows,blvd,E}=grid,C=cols.length,R=rows.length,links=[],bays=[];
 const J=(i,r)=>i*R+r,junctions=signals.filter(s=>s.kind==='junction').map((s,k)=>({...s,index:k,i:Math.floor(k/R),r:k%R,approaches:[],exits:[]}));
 const lane=(o,pts)=>{const L={id:links.length,kind:0,exits:[],stops:[],bays:[],busStops:[],...o,...polyline(pts)};links.push(L);return L;};
 // District streets: one segment per district cell, an eastbound lane at z−0.75 and a westbound one at z+0.75.
 for(const ci of cellInfo){const d=districts[ci.di],{c,r}=ci,Z=rows[r],xa=c>0?blvd[c-1]+BOX_X:E.minX,xb=c<C-1?blvd[c]-BOX_X:E.maxX;
  const walks=sidewalkSides(d.id),half=s=>walks.includes(s)?2.25:3.25;
  for(const dir of [1,-1]){
   const z=Z-dir*LANE,x0=dir>0?xa:xb,x1=dir>0?xb:xa;
   const L=lane({axis:0,dir:[dir,0],from:dir>0?(c>0?J(c-1,r):-1):(c<C-1?J(c,r):-1),to:dir>0?(c<C-1?J(c,r):-1):(c>0?J(c-1,r):-1),
    arm:dir>0?'W':'E',edgeIn:dir>0?c===0:c===C-1,edgeOut:dir>0?c===C-1:c===0,district:ci.di,kerb:half(-dir)-.5},[x0,z,x1,z]);
   if(ci.mid){const sd=ci.scramble?4.8:2.4;L.stops.push({s:Math.abs((d.x-dir*sd)-x0),sig:ci.midSig});}
   // Coin-parking / parking bays on this lane's left (the kerb side in left-hand traffic).
   for(const sp of layout.spots){if(sp.district!==d.id||!['parking','coin-parking'].includes(sp.kind)||Math.abs(sp.frontZ-Z)>4)continue;
    const side=sp.frontZ<Z?-1:1;if(side!==-dir)continue;const n=sp.bays||1,bw=(sp.width-.3)/n;
    for(let k=0;k<n;k++){if((sp.cars||[]).includes(k))continue;const bxk=sp.x-(sp.width-.3)/2+bw*(k+.5),sStart=(bxk-dir*2.2-x0)*dir;
     if(sStart<.4||sStart>L.len-4||L.stops.some(st=>Math.abs(st.s-sStart)<5))continue;
     const zb=sp.frontZ+side*sp.depth*.6,pk=polyline([...bez(bxk-dir*2.2,z,bxk,z,bxk,z+side*2.1,8),bxk,zb]);
     const link={id:links.length,kind:2,lane:L.id,...pk};links.push(link);
     const bay={id:bays.length,lane:L.id,sStart,link:link.id,x:bxk,z:zb,spot:sp.id};bays.push(bay);L.bays.push(bay.id);}}
  }
 }
 // Boulevards: southbound at x+0.65, northbound at x−0.65, one segment between consecutive rows (and to the edges).
 for(let i=0;i<blvd.length;i++){const bx=blvd[i];
  for(let k=0;k<=R;k++){const za=k>0?rows[k-1]+BOX_Z:E.minZ,zb=k<R?rows[k]-BOX_Z:E.maxZ;
   for(const dir of [1,-1]){const x=bx+dir*BLANE,z0=dir>0?za:zb,z1=dir>0?zb:za;
    const L=lane({axis:1,dir:[0,dir],from:dir>0?(k>0?J(i,k-1):-1):(k<R?J(i,k):-1),to:dir>0?(k<R?J(i,k):-1):(k>0?J(i,k-1):-1),arm:dir>0?'N':'S',
     edgeIn:dir>0?k===0:k===R,edgeOut:dir>0?k===R:k===0,blvd:i,kerb:.85},[x,z0,x,z1]);
    // Bus stops on this lane's left (southbound: +x side, northbound: −x side).
    for(const b of benches)if(Math.sign(b.x-bx)===dir&&Math.abs(Math.abs(b.x-bx)-2.05)<.6&&b.z>Math.min(z0,z1)+3&&b.z<Math.max(z0,z1)-4)L.busStops.push({s:Math.abs(b.z-z0)-1.2,x:b.x,z:b.z});}}
 }
 // Junction movements.
 for(const L of links)if(L.kind===0){if(L.to>=0)junctions[L.to].approaches.push(L.id);if(L.from>=0)junctions[L.from].exits.push(L.id);}
 const walkAt=(a,b)=>{const ka=nodeAt(a[0],a[1]),kb=nodeAt(b[0],b[1]);return ka<0||kb<0?-1:edgeBetween(g,ka,kb);};
 for(const j of junctions){const turns=[];
  for(const ai of j.approaches){const A=links[ai],ax=A.pts[A.pts.length-2],az=A.pts[A.pts.length-1],[dx0,dz0]=A.dir;
   for(const ei of j.exits){const X=links[ei],[dx1,dz1]=X.dir;if(dx0===-dx1&&dz0===-dz1)continue;   // no U-turns
    const ex=X.pts[0],ez=X.pts[1],cross=dx0*dz1-dz0*dx1,turn=cross===0?'S':cross>0?'R':'L';
    const pts=turn==='S'?[ax,az,ex,ez]:bez(ax,az,dx0!==0?ex:ax,dx0!==0?az:ez,ex,ez,10);
    // The crosswalk a turning car cuts on its way out (pedestrians there have their green: the car yields).
    let walk=-1;if(turn!=='S'){if(X.axis===0){const wx=j.x+dx1*SIDE;walk=walkAt([wx,j.z-SIDE],[wx,j.z+SIDE]);}else{const wz=j.z+dz1*SIDE;walk=walkAt([j.x-SIDE,wz],[j.x+SIDE,wz]);}}
    const T={id:links.length,kind:1,junction:j.index,from:ai,to:ei,turn,walk,axis:A.axis,...polyline(pts)};
    links.push(T);A.exits.push(T.id);turns.push(T);}}
  for(const a of turns){a.conflicts=[];for(const b of turns)if(a!==b&&a.from!==b.from&&(a.to===b.to||crosses(a,b)))a.conflicts.push(b.id);}
  j.turns=turns.map(t=>t.id);
 }
 return {links,bays,junctions,entries:links.filter(l=>l.kind===0&&l.edgeIn).map(l=>l.id),busLoops:busLoops(links,junctions,grid)};
}

// Bus loops: rectangles of left turns (south on one boulevard, east along a row, north on another, west back), scored by
// how many bus stops sit on the bus's kerb side and by length (~240 m). Each loop is a cyclic list of link ids + stops.
function busLoops(links,junctions,grid){
 const {rows,blvd}=grid,R=rows.length,lanes=links.filter(l=>l.kind===0);
 const find=(pred)=>lanes.find(pred);
 const turnBetween=(a,b)=>links.find(l=>l.kind===1&&l.from===a&&l.to===b);
 const loops=[];
 for(let i1=0;i1<blvd.length;i1++)for(let i2=i1+1;i2<Math.min(blvd.length,i1+3);i2++)for(let r1=0;r1<R;r1++)for(let r2=r1+1;r2<Math.min(R,r1+4);r2++){
  const seq=[];let ok=true;
  // south on i1 from r1 to r2
  for(let r=r1;r<r2;r++){const L=find(l=>l.axis===1&&l.blvd===i1&&l.dir[1]>0&&l.from===i1*R+r);if(!L){ok=false;break;}seq.push(L);}
  for(let c=i1;c<i2&&ok;c++){const L=find(l=>l.axis===0&&l.dir[0]>0&&l.from===c*R+r2&&l.to===(c+1)*R+r2);if(!L){ok=false;break;}seq.push(L);}
  for(let r=r2;r>r1&&ok;r--){const L=find(l=>l.axis===1&&l.blvd===i2&&l.dir[1]<0&&l.from===i2*R+r);if(!L){ok=false;break;}seq.push(L);}
  for(let c=i2;c>i1&&ok;c--){const L=find(l=>l.axis===0&&l.dir[0]<0&&l.from===c*R+r1&&l.to===(c-1)*R+r1);if(!L){ok=false;break;}seq.push(L);}
  if(!ok)continue;const ids=[];let length=0,stops=0;
  for(let k=0;k<seq.length;k++){const a=seq[k],b=seq[(k+1)%seq.length],t=turnBetween(a.id,b.id);if(!t){ok=false;break;}ids.push(a.id,t.id);length+=a.len+t.len;stops+=a.busStops.length;}
  if(!ok)continue;const shibuya=seq.some(l=>l.district!==undefined&&districts[l.district]?.id==='shibuya');
  loops.push({links:ids,length,stops,shibuya,score:stops*40-Math.abs(length-240)+(shibuya?90:0)});
 }
 return loops.sort((a,b)=>b.score-a.score);
}
