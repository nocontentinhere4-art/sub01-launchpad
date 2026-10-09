// Tile movement the Habbo/Sims 1 way, pure JS (no three): a room is a grid of TILE-metre cells, residents walk tile by tile
// in four directions along the route with the fewest turns, turn on the spot before setting off, and the walk cycle is driven
// by distance travelled so feet never slide. Rigged characters set their Walk action time from `phase`; box figures swing legs with it.
export const TILE=.5;
export const DIRS=[[1,0],[0,1],[-1,0],[0,-1]];        // +x, +z, -x, -z
export const STRIDE=1.1;                             // metres per Walk cycle for the 1.5 m Quaternius rig
const TURN_COST=2;                                   // a turn costs as much as two tiles: fewest turns wins
export const tile=v=>Math.round(v/TILE),key=(c,r)=>c+','+r;
// Blocked tiles from axis-aligned footprints [{x,z,hx,hz}] inside a square room of half-size `half` (walls excluded).
export function blockedTiles(footprints,half){
 const set=new Set(),lim=tile(half)-1;
 for(const f of footprints)for(let c=Math.floor((f.x-f.hx)/TILE);c<=Math.ceil((f.x+f.hx)/TILE)-1;c++)for(let r=Math.floor((f.z-f.hz)/TILE);r<=Math.ceil((f.z+f.hz)/TILE)-1;r++)if(Math.abs(c)<=lim&&Math.abs(r)<=lim)set.add(key(c,r));
 return set;
}
// A* over (tile, heading) with 4-way moves; cost 1 per tile + TURN_COST per change of heading. Returns tile centres in metres, or null.
export function route(blocked,from,to,half,heading=0){
 const lim=tile(half)-1,sc=tile(from.x),sr=tile(from.z),tc=Math.min(lim,Math.max(-lim,tile(to.x))),tr=Math.min(lim,Math.max(-lim,tile(to.z)));
 if(sc===tc&&sr===tr)return [];
 const h=(c,r)=>Math.abs(c-tc)+Math.abs(r-tr),id=(c,r,d)=>((c+lim)*64+(r+lim))*4+d;
 const open=[{c:sc,r:sr,d:heading,g:0,f:h(sc,sr),p:null}],seen=new Map();
 while(open.length){
  let bi=0;for(let i=1;i<open.length;i++)if(open[i].f<open[bi].f)bi=i;const n=open.splice(bi,1)[0];
  if(n.c===tc&&n.r===tr){const out=[];for(let q=n;q.p;q=q.p)out.unshift({x:q.c*TILE,z:q.r*TILE});return out;}
  const k=id(n.c,n.r,n.d);if(seen.has(k)&&seen.get(k)<=n.g)continue;seen.set(k,n.g);
  DIRS.forEach(([dc,dr],d)=>{const c=n.c+dc,r=n.r+dr;if(Math.abs(c)>lim||Math.abs(r)>lim||(blocked.has(key(c,r))&&!(c===tc&&r===tr)))return;
   const g=n.g+1+(d===n.d?0:TURN_COST);open.push({c,r,d,g,f:g+h(c,r),p:n});});
 }
 return null;
}
// Follows a route. update(dt) returns the pose: position, yaw (0 faces +z), walk phase 0..1, and whether it is moving.
export function mover({x=0,z=0,yaw=0,speed=1.4,turnRate=9,fidgetEvery=[6,14],rand=Math.random}={}){
 let path=[],travelled=0,target=yaw,then=null,idle=0,nextFidget=fidgetEvery[0]+rand()*(fidgetEvery[1]-fidgetEvery[0]);
 const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
 function go(points,done){path=points?[...points]:[];then=done||null;idle=0;if(!path.length)then?.();}
 function face(a){target=a;}
 function update(dt){
  let moving=false,fidget=false;
  if(path.length){const t=path[0],dx=t.x-x,dz=t.z-z,dist=Math.hypot(dx,dz);
   if(dist<1e-4){path.shift();if(!path.length){const d=then;then=null;d?.();}}
   else{target=Math.atan2(dx,dz);const turn=wrap(target-yaw);
    if(Math.abs(turn)>.3)yaw=wrap(yaw+Math.sign(turn)*Math.min(Math.abs(turn),turnRate*dt));   // turn on the spot first
    else{yaw=target;const step=Math.min(dist,speed*dt);x+=dx/dist*step;z+=dz/dist*step;travelled+=step;moving=true;}}}
  else{const turn=wrap(target-yaw);if(Math.abs(turn)>1e-3)yaw=wrap(yaw+Math.sign(turn)*Math.min(Math.abs(turn),turnRate*dt));
   idle+=dt;if(idle>=nextFidget){idle=0;fidget=true;nextFidget=fidgetEvery[0]+rand()*(fidgetEvery[1]-fidgetEvery[0]);}}
  return {x,z,yaw,phase:(travelled/STRIDE)%1,moving,fidget};
 }
 return {go,face,update,get busy(){return path.length>0;},get heading(){const d=Math.round(yaw/(Math.PI/2));return [1,0,3,2][((d%4)+4)%4]??0;},set(nx,nz,ny=yaw){x=nx;z=nz;yaw=target=ny;path=[];}};
}
