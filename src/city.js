import * as THREE from 'three';
import {cityPlots,districts,tower,plotView,buildingColors} from './city-state.js';
export function createCity(scene,interactive,showPlace,buildings){
 const root=new THREE.Group();scene.add(root);
 const geometry=new THREE.BoxGeometry(1,1,1),mat=new THREE.MeshStandardMaterial({roughness:1});
 const batches={walls:[],windows:[],roofs:[],roads:[],marks:[]};
 const add=(key,x,y,z,w,h,d,color)=>batches[key].push({x,y,z,w,h,d,color});
 // A 3 x 3 grid. Only the original central block contains detailed furniture/rigs.
 for(const d of districts){
  add('roads',d.x,.03,d.z,27.8,.18,27.8,'#b3bea3');
  add('roads',d.x,.16,d.z,28,.06,3.8,'#6d786f');
  add('roads',d.x,.18,d.z-2.35,28,.07,.8,'#ddd8c8');add('roads',d.x,.18,d.z+2.35,28,.07,.8,'#ddd8c8');
  for(let i=-12;i<=12;i+=3)add('marks',d.x+i,.205,d.z,.9,.015,.09,'#e4ddc8');
 }
 // Vertical connecting boulevards and crosswalks.
 for(const x of [-14.5,14.5]){add('roads',x,.17,2,2.6,.05,87,'#6d786f');for(let z=-36;z<=40;z+=3)add('marks',x,.21,z,.08,.01,.8,'#ddd8c7');}
 for(const x of [-29,29])for(const z of [-28,2,32])for(let i=-3;i<=3;i++)add('marks',x+i*.48,.21,z,.25,.015,3.2,'#f1ead7');
 let renderGroups=[];
 const dummy=new THREE.Object3D();
 function batch(items,parent=root){if(!items.length)return;const mesh=new THREE.InstancedMesh(geometry,mat,items.length);items.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.scale.set(v.w,v.h,v.d);dummy.rotation.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(v.color));});mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;mesh.castShadow=false;parent.add(mesh);return mesh;}
 for(const key of ['roads','marks'])batch(batches[key]);
 // One raycast target per address, all drawn in a single instanced call.
 const picks=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({visible:false}),cityPlots.length);
 cityPlots.forEach((p,i)=>{dummy.position.set(p.x,4,p.z);dummy.scale.set(5.8,7.7,5.4);dummy.updateMatrix();picks.setMatrixAt(i,dummy.matrix);});
 picks.userData.cityPlot=true;root.add(picks);interactive.push(picks);
 function redraw(next){buildings=next;for(const g of renderGroups){root.remove(g);g.dispose();}renderGroups=[];
  batches.walls=[];batches.windows=[];batches.roofs=[];
  for(const [index,p] of cityPlots.entries()){const b=buildings.find(b=>b.plotId===p.id),height=b?(b.type==='project'?8:b.type==='studio'?4:6):p.height;
   const pickHeight=p.vacant&&!b?1:height;dummy.position.set(p.x,pickHeight/2+.24,p.z);dummy.scale.set(5.8,pickHeight,5.4);dummy.rotation.set(0,0,0);dummy.updateMatrix();picks.setMatrixAt(index,dummy.matrix);
   if(p.vacant&&!b){add('roofs',p.x,.25,p.z,5.8,.12,5.4,'#e1c594');for(const dx of [-2.5,2.5])for(const dz of [-2.3,2.3])add('walls',p.x+dx,.7,p.z+dz,.12,1,.12,'#f9e9c5');continue;}
   const color=b?buildingColors[b.color]:p.color;
   add('walls',p.x,height/2+.24,p.z,5,height,4.8,color);
   add('roofs',p.x,height+.35,p.z,5.4,.22,5.2,'#e8e2ce');
   add('roofs',p.x+1,height+.75,p.z-.8,1.5,.65,1.2,'#a5b0a4');
   add('windows',p.x,.95,p.z+2.42,1.05,1.4,.07,'#354d48');
   for(let floor=1;floor<height-1;floor+=1.5)for(const offset of [-1.6,0,1.6]){
    add('windows',p.x+offset,floor+.75,p.z+2.42,.8,.85,.06,b?'#ffdf9f':'#668b87');
    add('windows',p.x+2.52,floor+.75,p.z+offset,.06,.85,.8,'#72938c');
   }
   if(b?.type==='apartment')for(let floor=1.2;floor<height;floor+=1.5)add('roofs',p.x,floor,p.z+2.7,5.3,.13,.6,'#f1e3ce');
   add('windows',p.x,.7,p.z+2.49,3,.25,.1,b?'#fb752b':'#ead7b9');
  }
  picks.instanceMatrix.needsUpdate=true;picks.computeBoundingSphere();
  for(const key of ['walls','windows','roofs'])renderGroups.push(batch(batches[key]));
 }
 redraw(buildings);
 // Landmark is original geometry. Instanced beams form an orange/white lattice.
 const beams=[],beamDummy=new THREE.Object3D(),beamGeom=new THREE.BoxGeometry(1,1,1);
 function beam(a,b,width,color){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),mid=start.clone().add(end).multiplyScalar(.5);beamDummy.position.copy(mid);beamDummy.scale.set(width,start.distanceTo(end),width);beamDummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());beamDummy.updateMatrix();beams.push({matrix:beamDummy.matrix.clone(),color});}
 const levels=[[.25,3.5],[5,2.2],[9,1.25],[13,.75],[17,.35],[20,.08]];
 for(let l=0;l<levels.length-1;l++){
  const [a,r]=levels[l],[b,s]=levels[l+1],color=l%2?'#fff1de':'#ee7036';
  for(const sx of [-1,1])for(const sz of [-1,1])beam([tower.x+sx*r,a,tower.z+sz*r],[tower.x+sx*s,b,tower.z+sz*s],.2,color);
  for(const side of [-1,1]){
   for(const axis of ['x','z']){
    const P=(v,y,fixed)=>axis==='x'?[tower.x+v,y,tower.z+side*fixed]:[tower.x+side*fixed,y,tower.z+v];
    beam(P(-r,a,r),P(s,b,s),.1,color);beam(P(r,a,r),P(-s,b,s),.1,color);
    beam(P(-r,a,r),P(r,a,r),.15,color);
   }
  }
 }
 const lattice=new THREE.InstancedMesh(beamGeom,mat,beams.length);beams.forEach((b,i)=>{lattice.setMatrixAt(i,b.matrix);lattice.setColorAt(i,new THREE.Color(b.color));});root.add(lattice);
 batch([{x:tower.x,y:8.8,z:tower.z,w:3.7,h:.8,d:3.7,color:'#fff1de'},{x:tower.x,y:9,z:tower.z,w:3.8,h:.28,d:3.8,color:'#df6530'},{x:tower.x,y:14,z:tower.z,w:2,h:.6,d:2,color:'#f9dec4'},{x:tower.x,y:.2,z:tower.z,w:9,h:.12,d:9,color:'#e3d8c1'}]);
 const towerPick=new THREE.Mesh(new THREE.BoxGeometry(7,20,7),new THREE.MeshBasicMaterial({visible:false}));towerPick.position.set(tower.x,10,tower.z);towerPick.userData.place=tower;root.add(towerPick);interactive.push(towerPick);
 return {redraw,select(hit){if(hit.object.userData.cityPlot&&hit.instanceId!==undefined){showPlace(plotView(cityPlots[hit.instanceId],buildings));return true;}return false;}};
}
