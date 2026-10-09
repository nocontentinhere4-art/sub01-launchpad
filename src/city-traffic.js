import * as THREE from 'three';
import {toon,toonify} from './toon.js';

export function vehicleState(seconds,index){
 if(index<4){
  const phase=((seconds%24)+24)%24,progress=Math.max(0,phase-9)/15;
  const queue=index>=2?4:0;
  return {x:index%2?41+queue-progress*24:17-queue+progress*24,z:2+(index%2?-.75:.75),yaw:index%2?-Math.PI/2:Math.PI/2,moving:phase>=9};
 }
 const row=[-58,-28,32,62][(index-4)%4],reverse=index%2!==0;
 const progress=((seconds*(2+(index%3)*.3)+index*13)%140+140)%140;
 return {x:reverse?70-progress:progress-70,z:row+(reverse?-.75:.75),yaw:reverse?-Math.PI/2:Math.PI/2,moving:true};
}
// Vehicle kinds by index (hand-mixed so no kind repeats on a fixed rhythm): 5 taxis, 3 kei trucks, 6 cars, 2 buses.
export const VEHICLE_KINDS=['car','taxi','car','kei','taxi','car','taxi','kei','car','bus','taxi','car','kei','bus','car','taxi'];
const CAR_COLORS=['#E8E6E0','#2F3437','#9AA3A8','#5B6466','#D9D3C3','#8C2F2A','#E8E6E0'];
const hashUnit=(...v)=>{let h=2166136261;for(const x of v){h=Math.imul(h^x,16777619);h^=h>>>13;}h=Math.imul(h,1540483477);h^=h>>>15;return (h>>>0)/4294967296;};
export function addCityTraffic(parent){
 const root=new THREE.Group();parent.add(root);
 const count=16,parts=15,mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),toon({roughness:.55}),count*parts);
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),105);root.add(mesh);
 const dummy=new THREE.Object3D(),actor=new THREE.Object3D(),v=new THREE.Vector3();
 // Tokyo traffic (plan item 10): dark-indigo taxis with a roof sign, white kei trucks, green/cream buses, muted cars.
 // Same 15 boxes per vehicle (one batch, fixed count); index 9 and 13 stay the buses.
 const specs=[];
 for(let i=0;i<count;i++){
  const kind=VEHICLE_KINDS[i],a=[],put=(x,y,z,w,h,d,c)=>a.push({x,y,z,w,h,d,c}),glass='#33505C',tyre='#263a43';
  const lights=(z)=>{for(const side of [-1,1]){put(side*.34,.58,z,.2,.17,.025,'#ffedb4');put(side*.34,.56,-z,.18,.12,.025,'#d96450');}};
  if(kind==='bus'){
   put(0,.62,0,1.2,.84,3.7,'#3E7A5C');put(0,1.36,0,1.18,.66,3.66,'#EDE6D2');put(0,1.3,1.84,.9,.42,.025,glass);put(0,1.3,-1.84,.9,.3,.025,glass);
   for(const side of [-1,1]){put(side*.6,1.32,-.05,.025,.36,3.1,glass);for(const z of [-1.2,1.2])put(side*.56,.3,z,.16,.34,.38,tyre);}
   lights(1.86);put(0,1.74,-.4,.7,.12,1.1,'#D9D3C3');
  }else if(kind==='kei'){
   const c='#EEEDE8';put(0,.5,-.25,1.0,.34,1.6,c);put(0,.86,.62,.96,.74,.8,c);put(0,1.02,1.03,.8,.3,.025,glass);put(0,1.02,.21,.8,.26,.025,glass);
   for(const side of [-1,1]){put(side*.485,1.0,.62,.025,.28,.6,glass);for(const z of [-.62,.66])put(side*.5,.3,z,.14,.3,.32,tyre);}
   lights(1.06);put(0,.78,-.3,.98,.22,1.48,'#D9D7D0');
  }else{
   const taxi=kind==='taxi',c=taxi?'#1F2A44':CAR_COLORS[Math.floor(hashUnit(i,3)*CAR_COLORS.length)];
   put(0,.58,0,1.05,.62,2.1,c);put(0,.97,-.1,.93,.42,1.16,c);put(0,1.02,.53,.78,.3,.025,glass);put(0,1.02,-.7,.78,.3,.025,glass);
   for(const side of [-1,1]){put(side*.48,1.02,-.06,.025,.3,.96,glass);for(const z of [-.68,.68])put(side*.56,.34,z,.16,.32,.35,tyre);}
   lights(1.065);
   // Taxi: the amber roof sign. Other cars hide the 15th box inside the cabin roof.
   taxi?put(0,1.26,-.05,.34,.14,.2,'#F0B23E'):put(0,1.1,-.1,.5,.1,.6,c);
  }
  specs.push(a);a.forEach((p,j)=>mesh.setColorAt(i*parts+j,new THREE.Color(p.c)));
 }
 function update(seconds){for(let i=0;i<count;i++){const s=vehicleState(seconds,i);actor.position.set(s.x,.22,s.z);actor.rotation.y=s.yaw;actor.updateMatrix();specs[i].forEach((p,j)=>{v.set(p.x,p.y,p.z).applyQuaternion(actor.quaternion).add(actor.position);dummy.position.copy(v);dummy.quaternion.copy(actor.quaternion);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i*parts+j,dummy.matrix);});}mesh.instanceMatrix.needsUpdate=true;}
 update(0);return {root,mesh,update};
}
