import test from 'node:test';
import assert from 'node:assert/strict';
import {streetWorld,makeGraph,astar,route,pathLength,edgeBetween,vehicleLight,walkWindow,walkLit,ACT,hasMidZebra,SIDE,BOX_X,BOX_Z} from '../src/street-graph.js';
import {districts,CITY_EXTENT as E,BOULEVARD_X,ROAD_Z} from '../src/city-state.js';
import {trafficLightPhase} from '../src/city-traffic.js';

const W=streetWorld(),g=W.graph,R=W.roads;
const doorish=[ACT.home,ACT.shop,ACT.office,ACT.konbini,ACT.noren,ACT.station,ACT.bench,ACT.canal,ACT.park,ACT.shrine,ACT.edge];

test('street graph: derived from city-state (every district, both boulevard sides, the whole extent), deterministic',()=>{
 for(let k=0;k<g.n;k++){assert.ok(g.X[k]>=E.minX-1&&g.X[k]<=E.maxX+8,'x in the city (or at the canal)');assert.ok(g.Z[k]>=E.minZ-1&&g.Z[k]<=E.maxZ+1);}
 for(const d of districts)for(const s of [-1,1])assert.ok(g.nodes.some(p=>p.district===districts.indexOf(d)&&Math.abs(p.z-(d.z+s*SIDE))<1e-6),`${d.id} sidewalk ${s}`);
 for(const bx of BOULEVARD_X)for(const e of [-1,1])assert.ok(g.nodes.some(p=>Math.abs(p.x-(bx+e*SIDE))<1e-6&&p.kind==='edge'),'boulevard sidewalks reach the edge');
 for(const a of doorish)if(a!==ACT.station)assert.ok(g.pois[a].length>0,`some ${a}`);
 assert.equal(g.pois[ACT.station].length,8,'Shibuya and Shinjuku station kerbs, both sides');
 // Crossings mirror city.js: a zebra beside each boulevard per district, mid-block zebras in the six inner districts.
 const cross=[...g.kind].filter(k=>k===1).length,mid=districts.filter(hasMidZebra).length;
 assert.equal(mid,6);assert.ok(cross>=BOULEVARD_X.length*ROAD_Z.length*2+mid);
});
test('street graph: every door, seat and edge portal is reachable from every other',()=>{
 const seen=new Uint8Array(g.n),start=g.pois[ACT.home][0],q=[start];seen[start]=1;
 while(q.length){const u=q.pop();for(let k=g.off[u];k<g.off[u+1];k++){const v=g.adj[k];if(!seen[v]){seen[v]=1;q.push(v);}}}
 for(const a of doorish)for(const k of g.pois[a])assert.ok(seen[k],`${a} node ${k} unreachable`);
 assert.equal([...seen].filter(x=>!x).length,0);
});
function dijkstra(G,s){const d=new Float64Array(G.n).fill(Infinity),done=new Uint8Array(G.n);d[s]=0;
 for(;;){let u=-1;for(let i=0;i<G.n;i++)if(!done[i]&&(u<0||d[i]<d[u]))u=i;if(u<0||d[u]===Infinity)break;done[u]=1;
  for(let k=G.off[u];k<G.off[u+1];k++){const v=G.adj[k],c=d[u]+G.len[G.adjE[k]];if(c<d[v])d[v]=c;}}return d;}
test('A* (binary heap) finds shortest paths: brute force on a small random graph and on the city',()=>{
 let seed=7;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const nodes=[],edges=[];for(let i=0;i<7;i++)for(let j=0;j<7;j++)nodes.push({x:i*3+(r()-.5)*2,z:j*3+(r()-.5)*2});
 for(let i=0;i<7;i++)for(let j=0;j<7;j++){const k=i*7+j;if(i<6&&r()<.8)edges.push({a:k,b:k+7});if(j<6&&r()<.8)edges.push({a:k,b:k+1});if(i<6&&j<6&&r()<.25)edges.push({a:k,b:k+8});}
 const G=makeGraph(nodes,edges);
 for(let s=0;s<G.n;s++){const d=dijkstra(G,s);for(let t=0;t<G.n;t++){const p=astar(G,s,t);
  if(d[t]===Infinity){assert.equal(p,null);continue;}
  assert.ok(p&&p[0]===s&&p.at(-1)===t);for(let i=1;i<p.length;i++)assert.ok(edgeBetween(G,p[i-1],p[i])>=0,'consecutive nodes are adjacent');
  assert.ok(Math.abs(pathLength(G,p)-d[t])<1e-3,`${s}→${t}: ${pathLength(G,p)} vs ${d[t]}`);}}
 const doors=g.pois[ACT.shop];for(let i=0;i<6;i++){const a=doors[i*37%doors.length],b=doors[(i*91+5)%doors.length],d=dijkstra(g,a),p=astar(g,a,b);assert.ok(Math.abs(pathLength(g,p)-d[b])<1e-2);}
 // The cache returns the same route; a spent budget defers (undefined) instead of searching.
 const a=doors[1],b=doors[50],p1=route(g,a,b),p2=route(g,a,b);assert.equal(p1,p2);assert.equal(route(g,b,a,{budget:{left:0}}),undefined);
});
test('signals: no walk light while the traffic it crosses has green or amber; Shibuya mid-block matches the scramble heads',()=>{
 for(const off of [0,3.7,11.2])for(let t=0;t<48;t+=.05){
  if(walkLit(0,t,off))assert.equal(vehicleLight(1,t,off),2,'crossing a boulevard: north-south red');
  if(walkLit(1,t,off))assert.equal(vehicleLight(0,t,off),2,'crossing a district street: east-west red');
  if(walkLit(2,t,off))assert.equal(vehicleLight(2,t,off),2);
  assert.ok(!(vehicleLight(0,t,off)<2&&vehicleLight(1,t,off)<2),'never both directions');
  if(walkWindow(0,t,off)>0)assert.ok(walkLit(0,t,off));}
 const shib=W.signals.find(s=>s.kind==='mid'&&s.district==='shibuya');assert.equal(shib.offset,0);
 for(let t=0;t<24;t+=.1)assert.equal(['green','amber','red'][vehicleLight(2,t,0)],trafficLightPhase(t).vehicle);
});
test('roads: left-hand lanes over the whole extent, junction turns with symmetric conflicts, no U-turns',()=>{
 const lanes=R.links.filter(l=>l.kind===0),turns=R.links.filter(l=>l.kind===1);
 const xs=lanes.filter(l=>l.axis===0).flatMap(l=>[l.pts[0],l.pts[2]]),zs=lanes.filter(l=>l.axis===1).flatMap(l=>[l.pts[1],l.pts[3]]);
 assert.equal(Math.min(...xs),E.minX);assert.equal(Math.max(...xs),E.maxX);assert.equal(Math.min(...zs),E.minZ);assert.equal(Math.max(...zs),E.maxZ);
 for(const l of lanes){if(l.axis===0){const z=l.pts[1],row=ROAD_Z.find(r=>Math.abs(z-r)<1);assert.ok(row!==undefined);assert.equal(Math.sign(row-z),l.dir[0],'drive on the left: eastbound north of the centre line');}
  else{const x=l.pts[0],bx=BOULEVARD_X.find(b=>Math.abs(x-b)<1);assert.ok(bx!==undefined);assert.equal(Math.sign(x-bx),l.dir[1],'southbound on the +x side');}
  if(!l.edgeOut)assert.ok(l.exits.length>0,'every lane that does not leave the city has a way on');}
 for(const t of turns){const A=R.links[t.from],X=R.links[t.to];assert.ok(!(A.dir[0]===-X.dir[0]&&A.dir[1]===-X.dir[1]));
  for(const c of t.conflicts)assert.ok(R.links[c].conflicts.includes(t.id),'conflicts are symmetric');
  const J=R.junctions[t.junction];for(let i=0;i<t.pts.length;i+=2){assert.ok(Math.abs(t.pts[i]-J.x)<=BOX_X+1e-6&&Math.abs(t.pts[i+1]-J.z)<=BOX_Z+1e-6,'turns stay in the junction box');}
  if(t.turn!=='S')assert.ok(t.walk>=0&&g.kind[t.walk]===1,'a turn knows the crosswalk it cuts');}
 assert.ok(R.bays.length>0,'free coin-parking bays');assert.ok(R.busLoops.length>0&&R.busLoops[0].links.length>=8);
});
