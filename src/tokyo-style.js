import * as THREE from 'three';
import {cityPlots} from './city-state.js';
// Shared geometry and one atlas interpret the references without photo textures.
export function addTokyoStyle(parent,buildings=[]){
 const root=new THREE.Group();parent.add(root);
 const geometry=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
 const stone=new THREE.MeshStandardMaterial({roughness:.95}),light=new THREE.MeshBasicMaterial();
 const solids=[],glow=[];
 const item=(list,x,y,z,w,h,d,color,rotation=0)=>list.push({x,y,z,w,h,d,color,rotation});
 function batch(items,material){const mesh=new THREE.InstancedMesh(geometry,material,items.length);items.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,v.rotation||0,0);dummy.scale.set(v.w,v.h,v.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(v.color));});root.add(mesh);return mesh;}
 const accents=['#fb7738','#25b8c8','#d96999','#f4c15d'];
 // Storefront canopies, AC units and small ground-floor neon bands.
 for(const [i,p] of cityPlots.entries()){
  const built=buildings.find(b=>b.plotId===p.id);if(p.vacant&&!built)continue;
  const height=built?(built.type==='project'?8:built.type==='studio'?4:6):p.height;
  item(solids,p.x,.52,p.z+2.6,4.9,.18,.55,'#344650');
  item(solids,p.x,1.7,p.z+2.65,4.9,.2,.7,i%2?'#d3784c':'#547e83');
  item(glow,p.x,1.52,p.z+3.02,4.8,.11,.03,accents[i%4]);
  item(solids,p.x-1.4,height+.65,p.z+.6,1,.65,.8,'#849292');
 }
 // Shibuya's scramble crossing: wide pedestrian stripes in three directions.
 const crossX=29,crossZ=2;
 for(const angle of [0,Math.PI/2,Math.PI/4])for(let i=-5;i<=5;i++){
  const offset=i*.6;item(solids,crossX+Math.cos(angle)*offset,.225,crossZ-Math.sin(angle)*offset,.3,.025,5.8,'#dde8df',angle);
 }
 // Compact shop alley in Roppongi with lamps, sign brackets and vending boxes.
 for(const x of [-33,-25])for(let z=-9;z<14;z+=4){
  item(solids,x,1.9,z,.1,3.4,.1,'#3b5059');item(solids,x+.4,3.55,z,.85,.12,.1,'#3b5059');
  item(glow,x+.8,3.4,z,.36,.17,.32,'#ffc780');
 }
 for(const [x,z] of [[-27,-1],[-37,7],[35,-24],[21,8]]){
  item(solids,x,.95,z,.8,1.5,.6,'#f2eee0');item(glow,x,.98,z+.31,.54,.87,.02,'#55b7c5');
 }
 // Moving traffic is handled separately, avoiding parked cars inside the crossing.
 batch(solids,stone);let lights;
 // Skyline variation rather than a wall of identical cubes.
 const highrise=[];
 for(const [i,x,z] of [[0,-8,-38],[1,0,-38],[2,8,-38],[3,21,-38],[4,37,-38]]){
  const h=13+i%3*3;item(highrise,x,h/2,z,3.6,h,3.7,['#536f83','#748893','#446d79'][i%3]);
  item(highrise,x,h+.2,z,4,.4,4,'#a4b4b1');
  for(let y=1;y<h;y+=1.5)for(const dx of [-1,0,1])item(glow,x+dx,y,z+1.87,.35,.62,.03,i%2?'#ffda8b':'#78dbe0');
 }
 batch(highrise,stone);lights=batch(glow,light);
 // The snow cap is jagged along its lower edge, sharing the mountain silhouette.
 const radius=30,height=19,segments=12,vertices=[],colors=[];
 const center=new THREE.Vector3(-55,0,-122);
 for(let i=0;i<segments;i++){
  const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
  const baseA=new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius),baseB=new THREE.Vector3(Math.cos(b)*radius,0,Math.sin(b)*radius);
  const tA=.67+(i%3)*.055,tB=.67+((i+1)%3)*.055;
  const edgeA=baseA.clone().multiplyScalar(1-tA);edgeA.y=height*tA;
  const edgeB=baseB.clone().multiplyScalar(1-tB);edgeB.y=height*tB;
  const summit=new THREE.Vector3(0,height,0);
  function tri(a,b,c,color){for(const p of [a,b,c]){vertices.push(p.x,p.y,p.z);colors.push(...new THREE.Color(color).toArray());}}
  tri(baseA,edgeB,baseB,i%2?'#607b91':'#7891a2');tri(baseA,edgeA,edgeB,i%2?'#607b91':'#7891a2');tri(edgeA,summit,edgeB,i%2?'#d6e6ec':'#eef0de');
 }
 const mountainGeometry=new THREE.BufferGeometry();mountainGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));mountainGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));mountainGeometry.computeVertexNormals();
 const mountain=new THREE.Mesh(mountainGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));mountain.position.copy(center);root.add(mountain);
 // Atlas labels are generic signs, not copied business brands.
 let signMesh;
 if(typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const ctx=canvas.getContext('2d');
  const words=['ラーメン','居酒屋','カラオケ','ゲーム','SUB-01','TOKYO','BUILD','LIVE','NEON','COIN','カフェ','寿司','OPEN','IDEAS','24H','01'];
  const bg=['#ef7242','#187d8e','#e8d7a9','#293f50'];
  words.forEach((word,i)=>{const x=i%4*256,y=Math.floor(i/4)*256;ctx.fillStyle=bg[i%4];ctx.fillRect(x,y,256,256);ctx.strokeStyle='#f9ebc5';ctx.lineWidth=7;ctx.strokeRect(x+10,y+10,236,236);ctx.fillStyle=i%4===2?'#334b57':'#fff3dd';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 46px sans-serif';if(i<4||i===10||i===11){[...word].forEach((c,j)=>ctx.fillText(c,x+128,y+35+j*45,205));}else{ctx.font='bold 39px monospace';ctx.fillText(word,x+128,y+114,215);ctx.font='20px monospace';ctx.fillText('TOKYO / 01',x+128,y+175,215);}});
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const signs=[];
  cityPlots.forEach((p,i)=>{const built=buildings.find(b=>b.plotId===p.id);if(p.vacant&&!built)return;const height=built?(built.type==='project'?8:built.type==='studio'?4:6):p.height;signs.push({x:p.x-2,y:height*.55,z:p.z+2.48,w:.75,h:Math.min(4,height*.75),r:0,tile:i%16});if(['shibuya','akihabara','roppongi'].includes(p.district)){signs.push({x:p.x,y:height+1.3,z:p.z+1.9,w:3.3,h:2,r:0,tile:(i+4)%16});signs.push({x:p.x+2.54,y:height*.6,z:p.z+.6,w:1.3,h:3,r:Math.PI/2,tile:(i+1)%16});}});
  const signGeometry=new THREE.PlaneGeometry(1,1);signGeometry.setAttribute('signTile',new THREE.InstancedBufferAttribute(new Float32Array(signs.flatMap(s=>[s.tile%4,Math.floor(s.tile/4)])),2));
  const signMaterial=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
  signMaterial.onBeforeCompile=shader=>{shader.vertexShader='attribute vec2 signTile;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (vMapUv + signTile) / vec2(4.0,4.0);\n#endif');};signMaterial.customProgramCacheKey=()=> 'tokyo-sign-atlas-v1';
  signMesh=new THREE.InstancedMesh(signGeometry,signMaterial,signs.length);
  signs.forEach((s,i)=>{dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,s.r,0);dummy.scale.set(s.w,s.h,1);dummy.updateMatrix();signMesh.setMatrixAt(i,dummy.matrix);});root.add(signMesh);
 }
 return {dispose(){parent.remove(root);const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);materials.add(n.material);if(n.material.map)textures.add(n.material.map);if(n.isInstancedMesh)n.dispose();}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());},setNight(value){stone.color.set(value?'#bed1e1':'#ffffff');light.color.set(value?'#ffffff':'#becacb');},signMesh,mountain,lights};
}
