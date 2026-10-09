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
export function addCityTraffic(parent){
 const root=new THREE.Group();parent.add(root);
 const count=16,parts=15,mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),toon({roughness:.55}),count*parts);
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),105);root.add(mesh);
 const dummy=new THREE.Object3D(),actor=new THREE.Object3D(),v=new THREE.Vector3();
 const colors=['#f0ba55','#e3e8e0','#2d434f','#df784b'];
 const specs=[];
 for(let i=0;i<count;i++){
  const bus=i===9||i===13,color=colors[i%4],a=[];
  const put=(x,y,z,w,h,d,c)=>a.push({x,y,z,w,h,d,c});
  put(0,.58,0,bus?1.2:1.05,bus?1.1:.62,bus?3.7:2.1,color);put(0,bus?1.06:.97,-.1,.93,bus?.6:.42,bus?3.3:1.16,color);
  put(0,1.02,.53,.78,.3,.025,'#395a68');put(0,1.02,-.7,.78,.3,.025,'#395a68');
  for(const side of [-1,1]){put(side*.48,1.02,-.06,.025,.3,bus?2.9:.96,'#395a68');for(const z of [-.68,.68])put(side*.56,.34,z,.16,.32,.35,'#263a43');}
  for(const side of [-1,1]){put(side*.34,.58,bus?1.87:1.065,.2,.17,.025,'#ffedb4');put(side*.34,.56,bus?-1.87:-1.065,.18,.12,.025,'#d96450');}
  put(0,bus?1.4:1.22,0,.35,.12,.3,bus?'#e3e8e0':'#f4d592');
  specs.push(a);a.forEach((p,j)=>mesh.setColorAt(i*parts+j,new THREE.Color(p.c)));
 }
 function update(seconds){for(let i=0;i<count;i++){const s=vehicleState(seconds,i);actor.position.set(s.x,.22,s.z);actor.rotation.y=s.yaw;actor.updateMatrix();specs[i].forEach((p,j)=>{v.set(p.x,p.y,p.z).applyQuaternion(actor.quaternion).add(actor.position);dummy.position.copy(v);dummy.quaternion.copy(actor.quaternion);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i*parts+j,dummy.matrix);});}mesh.instanceMatrix.needsUpdate=true;}
 update(0);return {root,mesh,update};
}
