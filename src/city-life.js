import * as THREE from 'three';
import {toon,toonify} from './toon.js';
import {crossingState} from './city-crowd.js';
export function trainPosition(seconds,offset=0){
 const t=((seconds+offset)%108+108)%108;
 const ease=v=>v*v*(3-2*v);
 if(t<16)return -66+40*ease(t/16);
 if(t<21)return -26;
 if(t<49)return -26+92*ease((t-21)/28);
 if(t<54)return 66;
 if(t<82)return 66-92*ease((t-54)/28);
 if(t<87)return -26;
 if(t<103)return -26-40*ease((t-87)/16);
 return -66;
}
// Infrastructure and distant skyline use shared meshes. No new external assets.
export function addCityLife(parent){
 const root=new THREE.Group();parent.add(root);
 const geo=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
 const solid=[],windows=[],water=[];
 const item=(list,x,y,z,w,h,d,color)=>list.push({x,y,z,w,h,d,color});
 const mat=toon({roughness:.86});
 const emissive=new THREE.MeshBasicMaterial({color:'#ffffff'});
 function batch(items,material){const mesh=new THREE.InstancedMesh(geo,material,items.length);items.forEach((s,i)=>{dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,0,0);dummy.scale.set(s.w,s.h,s.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(s.color));});root.add(mesh);return mesh;}
 // Dense horizon, distinct stepped crowns rather than uniform slab heights.
 for(let i=0;i<40;i++){
  const x=-71+i*3.65,z=-77-(i%3)*4,h=7+(i*7%19),width=2.1+(i%3)*.4;
  item(solid,x,h/2,z,width,h,3,'#496b80');item(solid,x,h+.5,z,width*.7,1,width*.8,'#668597');
  if(i%4===0)item(solid,x,h+1.8,z,.12,2,.12,'#edb166');
  for(let y=1;y<h;y+=1.6)for(const dx of [-.6,.6])item(windows,x+dx,y,z+1.52,.27,.62,.035,i%3?'#9cbdbf':'#ffc68b');
 }
 // Waterfront to the east, with a promenade and three bridges.
 item(water,79,-.05,2,11,.1,153,'#26708a');item(solid,72.8,.25,2,1.5,.35,153,'#829ba0');item(solid,85.3,.25,2,1.5,.35,153,'#829ba0');
 for(const z of [-38,2,42]){
  item(solid,79,.6,z,14,.65,4,'#9fa899');for(const edge of [-1.8,1.8])item(solid,79,1.3,z+edge,14,.16,.1,'#ecd3a1');
  for(const x of [74,84])item(solid,x,2.8,z,.2,4.8,.2,'#f1ad66');
 }
 for(let z=-69;z<=71;z+=5)item(water,78+(z%3),.02,z,5,.025,.05,'#63b1bd');
 // Elevated metro follows the southern edge of the city.
 const trackZ=78;
 for(const z of [trackZ-1,trackZ+1]){item(solid,0,4,z,145,.15,.1,'#a7bdc3');item(solid,0,3.65,z,145,.5,.7,'#415c6b');}
 for(let x=-69;x<=69;x+=8)item(solid,x,1.8,trackZ,.7,3.6,1,'#627f87');
 item(solid,0,4.1,trackZ,145,.12,2.7,'#89a0a4');
 item(solid,-26,4.55,trackZ+3,14,.5,3.3,'#acb5a6');item(solid,-26,7,trackZ+3,15,.15,4,'#2b7886');
 for(const x of [-31,-21])item(solid,x,5.6,trackZ+3,.12,2.8,.12,'#dcceb5');
 // Crossing signals share a single mesh. Their lamps follow the crowd's phase.
 for(const x of [24.4,33.6])for(const z of [-1.4,5.4]){item(solid,x,1.75,z,.12,3,.12,'#425767');item(solid,x,3.05,z,.55,.55,.23,'#263a49');}
 // Station entrance and a torii at the green northern edge.
 for(const x of [-35,-29])item(solid,x,2.5,-65,.4,5,.4,'#dc7348');item(solid,-32,5,-65,8,.5,.5,'#d77649');item(solid,-32,4,-65,7,.22,.3,'#df9c68');
 const treeSites=[];
 for(const x of [72.8,85.3])for(let z=-67;z<=73;z+=10){if([-38,2,42].some(bridge=>Math.abs(z-bridge)<4))continue;treeSites.push({x,z});item(solid,x,1.35,z,.22,2.2,.22,'#876551');}
 for(const x of [-41,-17])for(const z of [-1,5])item(solid,x,1.9,z,.1,3.4,.1,'#536274');
 batch(solid,mat);batch(windows,emissive);const river=batch(water,new THREE.MeshBasicMaterial({color:'#b1d5df'}));
 const blossoms=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),toon({roughness:1}),treeSites.length*3);root.add(blossoms);
 treeSites.forEach((p,i)=>{for(let j=0;j<3;j++){dummy.position.set(p.x+(j-1)*.68,2.5+(j%2)*.48,p.z+(j%2)*.35);dummy.rotation.set(.1*i,.4*i,.1*j);dummy.scale.set(1.02,.88,.95);dummy.updateMatrix();blossoms.setMatrixAt(i*3+j,dummy.matrix);blossoms.setColorAt(i*3+j,new THREE.Color(['#d9a3ba','#e7bdc6','#c990b0'][(i+j)%3]));}});
 const petalTime={value:0},petalGeometry=new THREE.BufferGeometry();
 petalGeometry.setAttribute('position',new THREE.Float32BufferAttribute(Array.from({length:160},(_,i)=>[i%2?73:85,.5+(i%17)*.2,-68+(i*11%142)]).flat(),3));
 const petalMaterial=new THREE.PointsMaterial({color:'#efd0da',size:.13,transparent:true,opacity:.8,depthWrite:false});
 petalMaterial.onBeforeCompile=shader=>{shader.uniforms.petalTime=petalTime;shader.vertexShader='uniform float petalTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y = 0.4 + mod(position.y - petalTime * 0.28, 3.5);\ntransformed.x += sin(petalTime * 0.6 + position.z) * 0.5;');};
 root.add(new THREE.Points(petalGeometry,petalMaterial));
 const signals=batch([24.4,33.6].flatMap(x=>[-1.4,5.4].map(z=>({x,y:3.05,z:z+.13,w:.25,h:.25,d:.025,color:'#76dfbb'}))),new THREE.MeshBasicMaterial());
 // A small lantern street: shared faceted lanterns sway from suspended cables.
 const lanterns=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial(),18);root.add(lanterns);
 for(let i=0;i<18;i++)lanterns.setColorAt(i,new THREE.Color(i%3?'#faad68':'#e66e57'));
 for(const z of [-1,5]){const cable=new THREE.Mesh(new THREE.BoxGeometry(24,.035,.035),mat);cable.position.set(-29,3.4,z);root.add(cable);}
 // Two trains, one instanced mesh per train. Shared body/window geometry.
 const trains=[];
 for(let direction=0;direction<2;direction++){
  const group=new THREE.Group();root.add(group);group.position.z=trackZ+(direction?-.7:.7);group.position.y=4.25;const cars=[];
  for(let i=0;i<4;i++){
   item(cars,-i*3.2,.6,0,2.9,1.15,1.05,'#d9e3de');item(cars,-i*3.2,.3,.54,2.9,.16,.02,'#e48443');
   for(const dx of [-.85,0,.85])item(cars,-i*3.2+dx,.73,.54,.52,.44,.03,'#284f66');
  }
  const mesh=batch(cars,new THREE.MeshBasicMaterial());root.remove(mesh);group.add(mesh);trains.push(group);
 }
 // A slim, stepped broadcast tower adds a second silhouette.
 const sky=new THREE.Group();root.add(sky);sky.position.set(55,0,-58);
 const towerMat=toon({color:'#809cad',roughness:.5});
 for(const [r,h,y] of [[1.3,21,10.5],[.75,12,27],[.3,9,37.5]]){const m=new THREE.Mesh(new THREE.CylinderGeometry(r*.65,r,h,8),towerMat);m.position.y=y;sky.add(m);}
 for(const y of [21,31]){const m=new THREE.Mesh(new THREE.CylinderGeometry(2,2,.65,12),new THREE.MeshBasicMaterial({color:'#78c7d1'}));m.position.y=y;sky.add(m);}
 // Light bands on Shibuya's feature tower.
 const feature=new THREE.Group();feature.position.set(42,0,1);root.add(feature);
 const curved=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.8,12,12),toon({color:'#285b68'}));curved.position.y=6;feature.add(curved);
 for(const y of [3,7,11]){const ring=new THREE.Mesh(new THREE.CylinderGeometry(1.83,1.83,.2,12),new THREE.MeshBasicMaterial({color:y===7?'#fb974c':'#63d3db'}));ring.position.y=y;feature.add(ring);}
 // Large original billboard, generated once, with no video/network stream.
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#152f42';ctx.fillRect(0,0,512,256);ctx.fillStyle='#fa853d';ctx.fillRect(15,15,482,6);ctx.font='bold 65px monospace';ctx.fillText('YOUR IDEA.',28,105);ctx.fillStyle='#81d4d9';ctx.font='bold 42px monospace';ctx.fillText('NEXT ADDRESS.',28,170);ctx.fillStyle='#e6e2cf';ctx.font='19px monospace';ctx.fillText('SUBZERONE / TOKYO',28,218);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const screen=new THREE.Mesh(new THREE.PlaneGeometry(6.3,3.15),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));screen.position.set(29,11,-1.53);root.add(screen);
 }
 let currentNight=false;
 function update(seconds){
  trains[0].position.x=trainPosition(seconds);trains[1].position.x=trainPosition(seconds,54);petalTime.value=seconds;
  const green=crossingState(seconds).pedestrianGreen;
  for(let i=0;i<signals.count;i++)signals.setColorAt(i,new THREE.Color(green?'#73e3b7':'#ed785d'));signals.instanceColor.needsUpdate=true;
  for(let i=0;i<18;i++){dummy.position.set(-40+(i%9)*2.75+Math.sin(seconds*1.2+i*.7)*.07,3.08, i<9?-1:5);dummy.rotation.set(0,0,Math.sin(seconds*1.2+i*.7)*.08);dummy.scale.set(.24,.34,.24);dummy.updateMatrix();lanterns.setMatrixAt(i,dummy.matrix);}lanterns.instanceMatrix.needsUpdate=true;
  river.material.color.setHSL(.54,.32,currentNight?.49+Math.sin(seconds*.65)*.025:.72);
 }
 update(0);
 return {update,setNight(value){currentNight=value;mat.color.set(value?'#9cb6c9':'#ffffff');emissive.color.set(value?'#ffffff':'#8b9c9a');},root,river,trains};
}
